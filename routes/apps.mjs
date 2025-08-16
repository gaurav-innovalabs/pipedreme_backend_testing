import express from 'express';
import componentSystem from '../core/ComponentSystem.mjs';

// /v1/apps
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const { limit, q } = req.query;
        let apps = await componentSystem.getApps();
        if (q) {
            apps = apps.filter(app => 
                app.name.trim().toLowerCase().includes(q.trim().toLowerCase())
            );
        }

        if (limit) {
            const limitNum = parseInt(limit, 10);
            if (!isNaN(limitNum) && limitNum > 0) {
                apps = apps.slice(0, limitNum);
            }
        }
        
        res.json({ 
            page_info: {
                total_count: apps.length,
                count: apps.length
            },
            data: apps 
        });
    } catch (error) {
        console.error('Failed to load apps:', error);
        res.status(500).json({ error: 'Failed to load apps' });
    }
});

// GET /v1/apps/:slug
router.get('/:app_slug', async (req, res) => {
    try {
        const app = await componentSystem.getApp(req.params.app_slug);
        if (app) {
            res.json({ data: app });
        } else {
            res.status(404).json({ error: 'App not found' });
        }
    } catch (error) {
        console.error('Error fetching app:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;