import express from 'express';
import { getDB } from '../core/database.mjs';
import config from '../config.mjs';

const host_url = config.BE_URL;
// /v1/connect/local-project
const router = express.Router();

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

// GET /accounts
router.get('/accounts', async (req, res) => {
    try {
        const { app, external_user_id, include_credentials } = req.query;
        if(external_user_id == undefined) {
            return res.status(400).json({
                error: 'external_user_id is required'
            });
        }
        let query = `SELECT * FROM accounts WHERE 1=1`;
        const params = [];

        if (app) {
            query += ` AND app_slug = ?`;
            params.push(app);
        }

        if (external_user_id) {
            query += ` AND external_user_id = ?`;
            params.push(external_user_id);
        }

        const accounts = await new Promise((resolve, reject) => {
            getDB().all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        const data = accounts.map(account => {
            const credentials = JSON.parse(account.credentials_json);
            const result = {
                id: account.id,
                app: account.app_slug,
                external_user_id: account.external_user_id,
                label: `${account.app_slug} (${account.external_user_id})`,
                created_at: account.created_at
            };

            if (include_credentials === 'true') {
                result.credentials = credentials;
            } else {
                result.masked = maskCredentials(credentials);
            }

            return result;
        });

        res.json({ data });
    } catch (error) {
        console.error('Error fetching accounts:', error);
        res.status(500).json({
            error: 'Failed to fetch accounts'
        });
    }
});

// GET /accounts/:account_id
router.get('/accounts/:account_id', async (req, res) => {
    try {
        const { account_id } = req.params;
        const { include_credentials } = req.query;

        const account = await new Promise((resolve, reject) => {
            getDB().get('SELECT * FROM accounts WHERE id = ?', [account_id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!account) {
            return res.status(404).json({
                error: 'Account not found'
            });
        }

        const credentials = JSON.parse(account.credentials_json);
        const result = {
            id: account.id,
            app: account.app_slug,
            external_user_id: account.external_user_id,
            label: `${account.app_slug} (${account.external_user_id})`,
            created_at: account.created_at
        };

        if (include_credentials === 'true') {
            result.credentials = credentials;
        } else {
            result.masked = maskCredentials(credentials);
        }

        res.json({ data: result });
    } catch (error) {
        console.error('Error fetching account:', error);
        res.status(500).json({
            error: 'Failed to fetch account'
        });
    }
});

// DELETE /accounts/:account_id
router.delete('/accounts/:account_id', async (req, res) => {
    try {
        const { account_id } = req.params;
        // TODO remove the component or unauth it if any method
        const result = await new Promise((resolve, reject) => {
            getDB().run('DELETE FROM accounts WHERE id = ?', [account_id], function(err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
        });

        if (result.changes === 0) {
            return res.status(404).json({
                error: 'Account not found'
            });
        }

        res.json({
            deleted: true,
            id: account_id
        });
    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).json({
            error: 'Failed to delete account'
        });
    }
});

export default router;