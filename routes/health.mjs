import express from 'express';
import { getDB } from '../core/database.mjs';

const router = express.Router();

router.get('/', async (req, res) => {
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

export default router;