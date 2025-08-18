import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { getDB } from '../core/database.mjs';
import config from '../config.mjs';

const host_url = config.BE_URL;
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

// GET /v1/connect/local-project/auth/oauth/:app_slug/start
router.get('/auth/oauth/:app_slug/start', async (req, res) => {
    try {
        const { app_slug } = req.params;
        const { external_user_id, redirect_uri } = req.query;

        if (!external_user_id || !redirect_uri) {
            return res.status(400).json({
                error: 'external_user_id and redirect_uri are required'
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

        // Store OAuth state
        await new Promise((resolve, reject) => {
            getDB().run(
                'INSERT INTO oauth_states (state, app_slug, external_user_id, redirect_uri, expires_at) VALUES (?, ?, ?, ?, ?)',
                [state, app_slug, external_user_id, redirect_uri, expires_at],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Generate authorization URL using connection config
        const authResult = connectionConfig.methods.connection_link(external_user_id, redirect_uri);
        
        res.json({
            authorization_url: authResult.authorization_url,
            state: authResult.state || state
        });
    } catch (error) {
        console.error('Error starting OAuth flow:', error);
        res.status(500).json({
            error: 'Failed to start OAuth flow'
        });
    }
});

// GET /v1/connect/local-project/auth/oauth/:app_slug/callback
router.get('/auth/oauth/:app_slug/callback', async (req, res) => {
    try {
        const { app_slug } = req.params;
        const { state, code } = req.query;

        if (!state || !code) {
            return res.status(400).json({
                error: 'state and code are required'
            });
        }

        // Get OAuth state
        const oauthState = await new Promise((resolve, reject) => {
            getDB().get(
                'SELECT * FROM oauth_states WHERE state = ?',
                [state],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!oauthState) {
            return res.status(400).json({
                error: 'Invalid or expired state'
            });
        }

        // Check if state is expired
        if (new Date() > new Date(oauthState.expires_at)) {
            // Clean up expired state
            await new Promise((resolve, reject) => {
                getDB().run('DELETE FROM oauth_states WHERE state = ?', [state], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            return res.status(400).json({
                error: 'OAuth state expired'
            });
        }

        // Load connection config
        const connectionConfig = await loadConnectionConfig(app_slug);
        if (!connectionConfig) {
            return res.status(400).json({
                error: `Connection config not found for ${app_slug}`
            });
        }

        // Exchange code for tokens using connection config
        const tokens = await connectionConfig.methods.connect_oauth_callback(code, state);

        // Ensure user exists
        await new Promise((resolve, reject) => {
            getDB().run(
                'INSERT OR IGNORE INTO users (external_user_id) VALUES (?)',
                [oauthState.external_user_id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Create account with OAuth tokens
        const accountId = `apn_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
        await new Promise((resolve, reject) => {
            getDB().run(
                'INSERT INTO accounts (id, app_key, external_user_id, app_slug, credentials_json, auth_type) VALUES (?, ?, ?, ?, ?, ?)',
                [accountId, accountId, oauthState.external_user_id, app_slug, JSON.stringify(tokens), 'oauth'],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Clean up OAuth state
        await new Promise((resolve, reject) => {
            getDB().run('DELETE FROM oauth_states WHERE state = ?', [state], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Get the created account
        const account = await new Promise((resolve, reject) => {
            getDB().get(
                'SELECT * FROM accounts WHERE id = ?',
                [accountId],
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

// POST /v1/connect/local-project/auth/custom - Handle custom auth (API keys, etc.)
router.post('/auth/custom', async (req, res) => {
    try {
        const { app_slug, external_user_id, credentials } = req.body;
        
        if (!app_slug || !external_user_id || !credentials) {
            return res.status(400).json({
                error: 'app_slug, external_user_id, and credentials are required'
            });
        }

        // Load connection config
        const connectionConfig = await loadConnectionConfig(app_slug);
        if (!connectionConfig || connectionConfig.type !== 'custom') {
            return res.status(400).json({
                error: `App ${app_slug} does not support custom authentication`
            });
        }

        // Validate credentials using connection config
        const validatedCredentials = await connectionConfig.methods.connect(credentials);

        // Ensure user exists
        await new Promise((resolve, reject) => {
            getDB().run(
                'INSERT OR IGNORE INTO users (external_user_id) VALUES (?)',
                [external_user_id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Create account with validated credentials
        const accountId = `apn_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
        await new Promise((resolve, reject) => {
            getDB().run(
                'INSERT INTO accounts (id, app_key, external_user_id, app_slug, credentials_json, auth_type) VALUES (?, ?, ?, ?, ?, ?)',
                [accountId, accountId, external_user_id, app_slug, JSON.stringify(validatedCredentials), 'custom'],
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
                [accountId],
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
            masked: maskCredentials(validatedCredentials)
        });
    } catch (error) {
        console.error('Error in custom auth:', error);
        res.status(500).json({
            error: error.message || 'Custom authentication failed'
        });
    }
});

export default router;