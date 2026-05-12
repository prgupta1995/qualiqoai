require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const testCaseRoutes = require('./routes/testCases');
const testRunRoutes  = require('./routes/testRuns');
const bugRoutes      = require('./routes/bugs');
const aiRoutes       = require('./routes/ai');
const authRoutes     = require('./routes/auth');
const apiKeyRoutes   = require('./routes/apiKeys');
const dashboardRoutes = require('./routes/dashboard');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use('/screenshots', express.static(path.resolve(__dirname, 'runner/screenshots')));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'Testtoria.ai', version: '1.0.0' });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',   authRoutes);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/tests',  testCaseRoutes);
app.use('/api/runs',   testRunRoutes);
app.use('/api/bugs',   bugRoutes);
app.use('/api/ai',     aiRoutes);
app.use('/api/dashboard', dashboardRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

if (require.main === module) {
  const server = app.listen(PORT, HOST, () => {
    console.log(`Testtoria.ai backend running on http://${HOST}:${PORT}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Set PORT to another value and restart.`);
    } else if (error.code === 'EPERM') {
      console.error(`Unable to bind to ${HOST}:${PORT}. Try a different HOST/PORT or check local permissions.`);
    } else {
      console.error('Failed to start backend server:', error);
    }

    process.exit(1);
  });
}

module.exports = app;
