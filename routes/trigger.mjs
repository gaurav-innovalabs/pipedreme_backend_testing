import express from 'express';
import config from '../config.mjs';
const host_url = config.BE_URL
// /v1/connect/local-project
const router = express.Router();

// POST /tigger/webhook/{trigger_id}
router.post('/trigger/webhook/:trigger_id', async (req, res) => {
    const { trigger_id } = req.params;
    const { payload } = req.body;

    // For now, simply log the payload
    console.log('Received webhook payload for trigger:', trigger_id, payload);
    res.status(200).json({ message: 'Webhook received' });
});

export default router;