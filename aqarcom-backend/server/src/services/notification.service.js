/**
 * Notification service: persist first (source of truth), then attempt push.
 * Push failures never break the calling business operation.
 */
const { Notification, User } = require('../models');
const push = require('./push.service');
const logger = require('../utils/logger');

async function notify(userId, { type, title, body, data = {} }) {
  const n = await Notification.create({ user: userId, type, title, body, data });
  // fire-and-forget push
  setImmediate(async () => {
    try {
      const user = await User.findById(userId).select('+deviceTokens');
      const tokens = (user && user.deviceTokens ? user.deviceTokens : []).map((t) => t.token);
      const { sent, invalidTokens } = await push.sendToTokens(tokens, {
        title,
        body,
        data: { ...data, type, notificationId: n.id },
      });
      if (sent) await Notification.updateOne({ _id: n._id }, { pushSent: true });
      if (invalidTokens.length) {
        await User.updateOne({ _id: userId }, { $pull: { deviceTokens: { token: { $in: invalidTokens } } } });
      }
    } catch (e) {
      logger.warn('push dispatch error:', e.message);
    }
  });
  return n;
}

async function notifyMany(userIds, payloadFn) {
  const unique = [...new Set(userIds.map(String))];
  return Promise.all(unique.map((id) => notify(id, typeof payloadFn === 'function' ? payloadFn(id) : payloadFn)));
}

async function list(userId, { skip, limit, unreadOnly }) {
  const q = { user: userId };
  if (unreadOnly) q.readAt = { $exists: false };
  const [items, total, unread] = await Promise.all([
    Notification.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(q),
    Notification.countDocuments({ user: userId, readAt: { $exists: false } }),
  ]);
  return { items, total, unread };
}

async function markRead(userId, id) {
  const n = await Notification.findOneAndUpdate({ _id: id, user: userId }, { readAt: new Date() }, { new: true });
  return n;
}

async function markAllRead(userId) {
  const r = await Notification.updateMany({ user: userId, readAt: { $exists: false } }, { readAt: new Date() });
  return r.modifiedCount || 0;
}

async function registerDeviceToken(userId, token, platform = 'android') {
  await User.updateOne({ _id: userId }, { $pull: { deviceTokens: { token } } });
  await User.updateOne(
    { _id: userId },
    { $push: { deviceTokens: { $each: [{ token, platform, updatedAt: new Date() }], $slice: -5 } } }
  );
}

async function removeDeviceToken(userId, token) {
  await User.updateOne({ _id: userId }, { $pull: { deviceTokens: { token } } });
}

module.exports = { notify, notifyMany, list, markRead, markAllRead, registerDeviceToken, removeDeviceToken };
