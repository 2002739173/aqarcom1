/**
 * Push delivery through Firebase Cloud Messaging.
 * Optional: if FCM_SERVICE_ACCOUNT_PATH is not configured (or FCM fails), the notification
 * still lives in the in-app store and shows when the app is opened (SRS 2-1).
 */
const env = require('../config/env');
const logger = require('../utils/logger');

let messaging = null;
let initTried = false;

function getMessaging() {
  if (initTried) return messaging;
  initTried = true;
  if (!env.fcmServiceAccountPath) return null;
  try {
    // eslint-disable-next-line global-require
    const admin = require('firebase-admin');
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const serviceAccount = require(require('path').resolve(env.fcmServiceAccountPath));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    messaging = admin.messaging();
    logger.info('FCM push enabled');
  } catch (e) {
    logger.warn('FCM not available, push disabled:', e.message);
    messaging = null;
  }
  return messaging;
}

/** @returns {Promise<{sent:boolean, invalidTokens:string[]}>} */
async function sendToTokens(tokens, { title, body, data }) {
  const m = getMessaging();
  if (!m || !tokens || tokens.length === 0) return { sent: false, invalidTokens: [] };
  const stringData = Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)]));
  try {
    const res = await m.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: stringData,
      android: { priority: 'high', notification: { channelId: 'aqarcom_default' } },
    });
    const invalidTokens = [];
    res.responses.forEach((r, i) => {
      const code = r.error && r.error.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        invalidTokens.push(tokens[i]);
      }
    });
    return { sent: res.successCount > 0, invalidTokens };
  } catch (e) {
    logger.warn('FCM send failed:', e.message);
    return { sent: false, invalidTokens: [] };
  }
}

module.exports = { sendToTokens };
