const { asyncHandler, ok, created } = require('../utils/http');
const auth = require('../services/auth.service');
const notifications = require('../services/notification.service');

const ctx = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

module.exports = {
  register: asyncHandler(async (req, res) => {
    const { user, tokens } = await auth.register(req.body, req.get('user-agent'));
    created(res, { user, ...tokens });
  }),
  login: asyncHandler(async (req, res) => {
    const { user, tokens } = await auth.login(req.body, ctx(req));
    ok(res, { user, ...tokens });
  }),
  refresh: asyncHandler(async (req, res) => {
    const { user, tokens } = await auth.refresh(req.body.refreshToken, req.get('user-agent'));
    ok(res, { user, ...tokens });
  }),
  logout: asyncHandler(async (req, res) => {
    await auth.logout(req.body.refreshToken);
    ok(res, { loggedOut: true });
  }),
  forgotPassword: asyncHandler(async (req, res) => {
    await auth.forgotPassword(req.body.email);
    // identical answer whether or not the email exists
    ok(res, { message: 'إن كان البريد مسجّلاً لدينا فستصلك رسالة تحتوي رمز إعادة التعيين' });
  }),
  resetPassword: asyncHandler(async (req, res) => {
    await auth.resetPassword(req.body);
    ok(res, { message: 'تم تغيير كلمة المرور بنجاح، يمكنك تسجيل الدخول الآن' });
  }),
  me: asyncHandler(async (req, res) => ok(res, req.user)),
  updateMe: asyncHandler(async (req, res) => ok(res, await auth.updateProfile(req.user._id, req.body))),
  changePassword: asyncHandler(async (req, res) => {
    await auth.changePassword(req.user._id, req.body);
    ok(res, { message: 'تم تغيير كلمة المرور. سجّل الدخول مجدداً على الأجهزة الأخرى' });
  }),
  registerDevice: asyncHandler(async (req, res) => {
    await notifications.registerDeviceToken(req.user._id, req.body.token, req.body.platform);
    ok(res, { registered: true });
  }),
  removeDevice: asyncHandler(async (req, res) => {
    await notifications.removeDeviceToken(req.user._id, req.body.token);
    ok(res, { removed: true });
  }),
};
