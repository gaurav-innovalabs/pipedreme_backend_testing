import express from 'express';
import cors from 'cors';
// import { initDB } from './database.mjs';

import healthRouter from './routes/health.mjs';
import appsRouter from './routes/apps.mjs';
import componentsRouter from './routes/components.mjs';
import connectLocalRouter from './routes/connectLocal.mjs';
// import triggerRouter from './routes/trigger.mjs';
import config from './config.mjs';
const app = express();

const PORT = config.PORT;
const PROJECT_ID = config.PROJECT_ID
// Initialize Database
// await initDB();

// Middleware
app.use(cors());
app.use(express.json());
// Logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${res.data}`);
    next();
});

// Routes
app.use('/health', healthRouter);
app.use('/v1/apps', appsRouter);
app.use(`/v1/connect/${PROJECT_ID}`, componentsRouter);
app.use(`/v1/connect/${PROJECT_ID}`, connectLocalRouter);
// app.use(`/v1/connect/${PROJECT_ID}`, triggerRouter);

// Error Handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});