require('dotenv').config();

const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');

const generateRoutes = require('./routes/generate');
const generate3DRoutes = require('./routes/generate3d');
const creationRoutes = require('./routes/creations');
const errorHandler = require('./middleware/errorHandler');
const { createCorsOptions } = require('./middleware/apiGuardrails');

const PORT = process.env.PORT || 3000;

function parseTrustProxy(value) {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  if (['false', '0', 'off', 'no'].includes(normalized)) return false;
  if (normalized === 'true') return true;
  if (/^\d+$/.test(normalized)) return Number.parseInt(normalized, 10);
  return normalized;
}

function createApp() {
  const app = express();
  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
  if (trustProxy) app.set('trust proxy', trustProxy);

  app.use(cors((req, callback) => callback(null, createCorsOptions({ request: req }))));
  app.use(express.json({ limit: process.env.API_JSON_BODY_LIMIT || '15mb' }));
  app.use(express.urlencoded({
    extended: true,
    limit: process.env.API_FORM_BODY_LIMIT || '1mb'
  }));

  app.use('/api', generateRoutes);
  app.use('/api', generate3DRoutes);
  app.use('/api/creations', creationRoutes);

  app.get('/api/health', (req, res) => {
    res.json({
      success: true,
      message: 'Server is running',
      timestamp: new Date().toISOString()
    });
  });

  const distDir = path.join(__dirname, 'dist');
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(express.static(distDir, { maxAge: '1h' }));
  }

  app.use(errorHandler);
  return app;
}

const app = createApp();

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
  });
}

module.exports = app;
module.exports.createApp = createApp;
module.exports.parseTrustProxy = parseTrustProxy;
