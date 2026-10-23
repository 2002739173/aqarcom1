/**
 * Central configuration — every tunable value lives here.
 * Values that close the SRS "open issues" (OI-01 → OI-04) are set here
 * so they can be changed without touching business code.
 */
require('dotenv').config({ quiet: true });

const int = (v, d) => (v === undefined || v === '' ? d : parseInt(v, 10));

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/aqarcom',

  // OI-02 — JWT lifetime and refresh mechanism (HMAC-SHA256 = HS256)
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'change-me-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret',
    accessTtl: process.env.JWT_ACCESS_TTL || '1h',
    refreshTtlDays: int(process.env.JWT_REFRESH_TTL_DAYS, 30),
  },

  // NFR-02 — Bcrypt cost factor ≥ 10
  bcryptRounds: Math.max(10, int(process.env.BCRYPT_ROUNDS, 12)),

  // OI-01 — failed-login limit and temporary lock
  login: {
    maxFailedAttempts: int(process.env.LOGIN_MAX_FAILED, 5),
    windowMinutes: int(process.env.LOGIN_WINDOW_MIN, 15),
    lockMinutes: int(process.env.LOGIN_LOCK_MIN, 15),
  },

  passwordReset: {
    codeTtlMinutes: int(process.env.RESET_CODE_TTL_MIN, 15),
    maxAttempts: int(process.env.RESET_CODE_MAX_ATTEMPTS, 5),
  },

  // OI-03 — property image limits
  propertyImages: {
    maxCount: int(process.env.PROPERTY_MAX_IMAGES, 10),
    maxSizeMb: int(process.env.PROPERTY_IMAGE_MAX_MB, 5),
  },

  // FR-11 / CN-05 — tender document limits
  tenderDocMaxMb: int(process.env.TENDER_DOC_MAX_MB, 20),
  verificationDocMaxMb: int(process.env.VERIFICATION_DOC_MAX_MB, 10),
  chunkSizeMaxMb: int(process.env.UPLOAD_CHUNK_MAX_MB, 5),

  storageDir: process.env.STORAGE_DIR || require('path').join(__dirname, '..', '..', 'storage'),
  // AES-256-GCM key (64 hex chars = 32 bytes) for encrypted file store (FR-22)
  fileEncryptionKey:
    process.env.FILE_ENCRYPTION_KEY ||
    '0000000000000000000000000000000000000000000000000000000000000000',

  // OI-04 — scoring service timeout before fallback (FR-19)
  scoring: {
    url: process.env.SCORING_SERVICE_URL || 'http://127.0.0.1:8001',
    timeoutMs: int(process.env.SCORING_TIMEOUT_MS, 3000),
    apiKey: process.env.SCORING_API_KEY || 'internal-scoring-key',
  },

  shortlistSize: 5,

  // Roles whose new accounts need admin approval from the dashboard before getting any privilege.
  // Add "user" to require approval for every account.
  approvalRoles: (process.env.ACCOUNT_APPROVAL_ROLES || 'property_owner,project_owner,contractor')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  cron: {
    closeTendersSchedule: process.env.CLOSE_TENDERS_CRON || '* * * * *', // every minute
    enabled: process.env.SCHEDULER_ENABLED !== 'false',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'AqarCom <no-reply@aqarcom.app>',
  },

  // Firebase Cloud Messaging — optional; without it notifications stay in-app (SRS 2-1)
  fcmServiceAccountPath: process.env.FCM_SERVICE_ACCOUNT_PATH || '',

  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()),
  // NFR-03: reject non-HTTPS in production (behind a TLS-terminating proxy)
  enforceHttps: process.env.ENFORCE_HTTPS === 'true',
};

env.isProd = env.nodeEnv === 'production';
env.isTest = env.nodeEnv === 'test';

if (env.isProd) {
  const weak = ['change-me-access-secret', 'change-me-refresh-secret'];
  if (weak.includes(env.jwt.accessSecret) || weak.includes(env.jwt.refreshSecret)) {
    throw new Error('JWT secrets must be set in production');
  }
  if (/^0+$/.test(env.fileEncryptionKey)) {
    throw new Error('FILE_ENCRYPTION_KEY must be set in production');
  }
}

module.exports = env;
