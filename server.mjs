import express from 'express';
import cors from 'cors';
import { initDB } from './core/database.mjs';
import componentSystem from './core/ComponentSystem.mjs';

import healthRouter from './routes/health.mjs';
import appsRouter from './routes/apps.mjs';
import componentsRouter from './routes/components.mjs';
import connectLocalRouter from './routes/connectLocal.mjs';
import accountsRouter from './routes/accounts.mjs';
// import triggerRouter from './routes/trigger.mjs';
import config from './config.mjs';

const app = express();
const PORT = config.PORT;
const PROJECT_ID = config.PROJECT_ID;

// Initialize Database
await initDB();

// Initialize Component System
console.log('Initializing component system...');
await componentSystem.init();
console.log('Component system initialized!');

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from _static directory
app.use('/_static', express.static('_static'));

// Logging
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`
    );
  });

  next();
});

// Serve static files from _static directory
app.use('/_static', express.static('_static'));

// Routes
app.use('/v1', healthRouter);
app.use('/v1/apps', appsRouter);
app.use(`/v1/connect/${PROJECT_ID}`, componentsRouter);
app.use(`/v1/connect`, connectLocalRouter);
app.use(`/v1/connect/${PROJECT_ID}`, accountsRouter);
// app.use(`/v1/connect/${PROJECT_ID}`, triggerRouter);

// Error Handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/v1/health`);
});