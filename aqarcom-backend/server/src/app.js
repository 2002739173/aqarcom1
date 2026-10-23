/** Express application (no listening here — server.js starts it; tests import it directly). */
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const ApiError = require('./utils/ApiError');
const fileStore = require('./utils/fileStore');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        // dashboard is plain HTML/CSS/JS from 'self'; Google Fonts for Tajawal; blob: for viewing documents
        'img-src': ["'self'", 'data:', 'blob:'],
        'frame-src': ["'self'", 'blob:'],
        'upgrade-insecure-requests': null, // allow http on LAN during development
      },
    },
  })
);
app.use(cors({ origin: env.corsOrigins.includes('*') ? true : env.corsOrigins }));
app.use(compression());
if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

// NFR-03 — refuse plain HTTP in production (TLS 1.3 is terminated by the reverse proxy, see deploy/nginx.conf)
if (env.enforceHttps) {
  app.use((req, res, next) => {
    if (req.secure || req.get('x-forwarded-proto') === 'https' || req.path === '/health') return next();
    next(new ApiError(403, 'HTTPS_REQUIRED', 'يجب استخدام اتصال HTTPS مشفّر'));
  });
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok', serverTime: new Date().toISOString() }));

// public property images only — encrypted documents are never served statically
app.use('/files/property-images', express.static(fileStore.abs(fileStore.SUBDIRS.propertyImages), { maxAge: '7d', index: false }));

// NFR-17 — Swagger / OpenAPI docs
const specPath = path.join(__dirname, 'docs', 'openapi.yaml');
if (fs.existsSync(specPath)) {
  const spec = YAML.load(specPath);
  app.get('/api-docs.json', (req, res) => res.json(spec));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'AqarCom API' }));
}

// Admin dashboard (HTML + CSS + JavaScript) — the only place where accounts are approved
app.use('/dashboard', express.static(path.join(__dirname, '..', 'admin-dashboard'), { index: 'index.html' }));
app.get('/', (req, res) => res.redirect('/dashboard/'));

app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
