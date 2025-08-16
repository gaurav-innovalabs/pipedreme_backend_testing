import express from 'express';
import config from '../config.mjs';
const host_url = config.BE_URL
// /v1/connect/local-project
const router = express.Router();

// GET /triggers
router.get('/triggers', async (req, res) => {
    const { app, limit } = req.query;

    if (!app) {
      return res.status(400).json({
        error: 'app parameter is required'
      });
    }

    // For now, return empty triggers as most components don't have triggers
    let triggers = [];

    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        triggers = triggers.slice(0, limitNum);
      }
    }

    res.json({
      data: triggers
    });
});

// POST /tigger/webhook/{trigger_id}
router.post('/trigger/webhook/:trigger_id', async (req, res) => {
    const { trigger_id } = req.params;
    const { payload } = req.body;

    // For now, simply log the payload
    console.log('Received webhook payload for trigger:', trigger_id, payload);
    res.status(200).json({ message: 'Webhook received' });
});

export default router;