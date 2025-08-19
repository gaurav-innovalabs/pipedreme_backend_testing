import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { getDB } from '../core/database.mjs';
import config from '../config.mjs';
import cache from '../core/cache.mjs';
import componentSystem from '../core/ComponentSystem.mjs';
import { ConnectionTokenError } from '../core/exception_helper/connection_token_error.mjs';

const host_url = config.BE_URL;
const PROJECT_ID = config.PROJECT_ID;
const router = express.Router();
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const COMPONENTS_ROOT = path.join(__dirname, '..', 'components');

// Helper function to mask credentials
function maskCredentials(credentials) {
    const masked = { ...credentials };
    const sensitiveFields = [
        'api_key', 'oauth_access_token', 'oauth_refresh_token', 
        'client_secret', 'password', 'private_key', 'secret'
    ];
    
    sensitiveFields.forEach(field => {
        if (masked[field]) {
            const value = masked[field];
            if (typeof value === 'string' && value.length > 8) {
                masked[field] = value.substring(0, 4) + '*'.repeat(value.length - 8) + value.substring(value.length - 4);
            } else {
                masked[field] = '***';
            }
        }
    });
    
    return masked;
}
// Helper function to get user by connect token
async function getUserByConnectToken(token) {
    // First try to get from cache for faster access
    let cachedToken = await cache.get(`connect_token:${token}`);
    if (cachedToken) {
        cachedToken = JSON.parse(cachedToken);
        return {
            token,
            external_user_id: cachedToken.external_user_id,
            expires_at: cachedToken.expires_at
        };
    }

    throw new ConnectionTokenError("Invalid connect token", 401);
}
  
// Helper function to load connection config
async function loadConnectionConfig(appSlug) {
    try {
        const connectionPath = path.join(COMPONENTS_ROOT, appSlug, 'connection.mjs');
        const connectionModule = await import(`file://${connectionPath}`);
        return connectionModule.default;
    } catch (error) {
        console.error(`Failed to load connection config for ${appSlug}:`, error);
        return null;
    }
}


// POST /tokens - Generate connection tokens for frontend auth
router.post(`/${PROJECT_ID}/tokens`, async (req, res) => {
    try {
        const { external_user_id } = req.body;

        if (!external_user_id) {
            return res.status(400).json({
                error: 'external_user_id is required'
            });
        }

        // Generate a connection token (for frontend auth)
        const token = `ctok_${uuidv4().replace(/-/g, '').substring(0, 24)}`;
        const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        // Store token in database as backup
        cache.set(
            `connect_token:${token}`,
            JSON.stringify({
                token,
                external_user_id,
                expires_at
            }),
            'EX', 20 * 60 // 20 minutes TTL 
        )

        res.json({
            token: token,
            external_user_id: external_user_id,
            connect_link_url: `${host_url}/_static/connect.html?token=${token}`,
            expires_at: expires_at
        });
    } catch (error) {
        console.error('Error generating token:', error);
        res.status(500).json({
            error: 'Failed to generate token'
        });
    }
});

// GET /v1/connect/local-project/auth/oauth/:app_slug/start # to get oauth connection link
router.get(`/${PROJECT_ID}/auth/oauth/:app_slug/start`, async (req, res) => {
    try {
        const { app_slug } = req.params;
        const { connect_token } = req.query;
        const redirect_uri = `${host_url}/v1/connect/${PROJECT_ID}/auth/oauth/${app_slug}/callback`;
        if (!connect_token) {
            return res.status(400).json({
                error: 'connect_token are required'
            });
        }
        const user_token_data = await getUserByConnectToken(connect_token);
        const external_user_id = user_token_data.external_user_id;
        if(external_user_id == undefined) {
            return res.status(401).json({
                error: 'Invalid connect token'
            });
        }

        // Load connection config for the app
        const connectionConfig = await loadConnectionConfig(app_slug);
        if (!connectionConfig || connectionConfig.type !== 'oauth') {
            return res.status(400).json({
                error: `App ${app_slug} does not support OAuth`
            });
        }

        // Generate OAuth state
        const state = `${external_user_id}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

        // Store OAuth state in cache
        await cache.set(`oauth_state:${state}`, JSON.stringify({
            app_slug,
            external_user_id,
            redirect_uri,
            created_at: new Date().toISOString(),
            expires_at
        }),"EX", 10 * 60); // 10 minutes TTL


        // Generate authorization URL using connection config
        const authResult = connectionConfig.methods.connection_link.call(connectionConfig, external_user_id, redirect_uri, state);

        res.json({
            authorization_url: authResult.authorization_url,
            state: state
        });
    } catch (error) {
        if (error instanceof ConnectionTokenError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        console.error('Error starting OAuth flow:', error);
        res.status(500).json({
            error: 'Failed to start OAuth flow'
        });
    }
});

// GET /v1/connect/local-project/auth/oauth/:app_slug/callback
router.get(`/${PROJECT_ID}/auth/oauth/:app_slug/callback`, async (req, res) => {
    try {
        const { app_slug } = req.params;
        const { state, code } = req.query;

        if (!state || !code) {
            return res.status(400).json({
                error: 'state and code are required'
            });
        }

        // Get OAuth state from cache
        let oauthState = await cache.get(`oauth_state:${state}`);

        if (!oauthState) {
            return res.status(400).json({
                error: 'Invalid or expired state'
            });
        }
        oauthState = JSON.parse(oauthState);
        // Load connection config
        const connectionConfig = await loadConnectionConfig(app_slug);
        if (!connectionConfig) {
            return res.status(400).json({
                error: `Connection config not found for ${app_slug}`
            });
        }

        // Exchange code for tokens using connection config
        const tokens = await connectionConfig.methods.connect_oauth_callback.call(connectionConfig, code, state);

        // Create account with OAuth tokens
        const apn_key = `apn_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
        await new Promise((resolve, reject) => {
            getDB().run(
                'INSERT INTO accounts (id, app_key, external_user_id, app_slug, credentials_json, auth_type) VALUES (?, ?, ?, ?, ?, ?)',
                [apn_key, apn_key, oauthState.external_user_id, app_slug, JSON.stringify(tokens), 'oauth'],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Clean up OAuth state from cache
        await cache.del(`oauth_state:${state}`);

        // Get the created account
        const account = await new Promise((resolve, reject) => {
            getDB().get(
                'SELECT * FROM accounts WHERE id = ?',
                [apn_key],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        res.json({
            id: account.id,
            app: account.app_slug,
            external_user_id: account.external_user_id,
            label: `${app_slug} (${account.external_user_id})`,
            created_at: account.created_at,
            masked: maskCredentials(tokens)
        });
    } catch (error) {
        console.error('Error in OAuth callback:', error);
        res.status(500).json({
            error: 'OAuth callback failed'
        });
    }
});

// POST /v1/connect/accounts - Handle custom auth (API keys, etc.)
router.post('/accounts', async (req, res) => {
    try {
        const { app_slug, cfmap_json, connect_token } = req.body;
        
        if (!app_slug || !connect_token) {
            return res.status(400).json({
                error: 'app_slug and connect_token are required'
            });
        }

        // Load connection config
        const requested_app = await componentSystem.getApp(app_slug);
        if (!requested_app) {
            return res.status(400).json({
                error: 'App not found'
            });
        }
        if (requested_app.auth_type != 'keys') {
            return res.status(400).json({
                error: 'App does not support custom authentication'
            });
        }

        // fetch external_user for that token
        const user_token_data = await getUserByConnectToken(connect_token);
        const external_user_id = user_token_data.external_user_id;

        // Create account with validated credentials
        const apn_key = `apn_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
        await new Promise((resolve, reject) => {
            getDB().run(
                'INSERT INTO accounts (id, app_key, external_user_id, app_slug, credentials_json, auth_type) VALUES (?, ?, ?, ?, ?, ?)',
                [apn_key, apn_key, external_user_id, app_slug, cfmap_json, 'keys'],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Get the created account
        const account = await new Promise((resolve, reject) => {
            getDB().get(
                'SELECT * FROM accounts WHERE id = ?',
                [apn_key],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        res.json({
            id: account.id,
            app: account.app_slug,
            external_user_id: account.external_user_id,
            label: `${app_slug} (${account.external_user_id})`,
            created_at: account.created_at,
            masked: maskCredentials(JSON.parse(cfmap_json))
        });
    } catch (error) {
        if (error instanceof ConnectionTokenError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        console.error('Error in custom auth:', error);
        res.status(500).json({
            error: error.message || 'Custom authentication failed'
        });
    }
});

export default router;