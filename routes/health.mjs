import express from 'express';
import crypto from "crypto";
import { getDB } from '../core/database.mjs';

const router = express.Router();

router.get('/health', async (req, res) => {
    try {
        // Check database connectivity
        const db = getDB();
        
        // Simple query to test DB connection
        await new Promise((resolve, reject) => {
            db.get('SELECT 1 as test', (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected',
            version: '1.0.0'
        });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            error: error.message,
            version: '1.0.0'
        });
    }
});
// demo oauth token generator for the endpoint, TODO: middleware to validate client credentials
router.post('/oauth/token', async (req, res) => {
    const { grant_type, client_id, client_secret } = req.body;

    if (!grant_type || !client_id || !client_secret) {
        return res.status(400).json({ error: 'grant_type, client_id, and client_secret are required' });
    }

    // generate a random 32-byte hex token
    const token = crypto.randomBytes(32).toString('hex');

    res.json({
        access_token: token,
        token_type: "bearer",
        expires_in: 3600
    });
});

export default router;