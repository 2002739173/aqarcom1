/**
 * Operational error carrying an HTTP status, a stable machine-readable `code`
 * (for the Android client to switch on) and an Arabic user-facing message.
 * `field` names the offending input so the UI can highlight it (SRS 3-1).
 */
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(code, message, details) {
    return new ApiError(400, code, message, details);
  }
  static unauthorized(code = 'UNAUTHORIZED', message = 'يجب تسجيل الدخول') {
    return new ApiError(401, code, message);
  }
  static forbidden(code = 'FORBIDDEN', message = 'لا تملك صلاحية تنفيذ هذه العملية') {
    return new ApiError(403, code, message);
  }
  static notFound(code = 'NOT_FOUND', message = 'العنصر المطلوب غير موجود') {
    return new ApiError(404, code, message);
  }
  static conflict(code, message, details) {
    return new ApiError(409, code, message, details);
  }
  static locked(code, message, details) {
    return new ApiError(423, code, message, details);
  }
  static tooLarge(code, message, details) {
    return new ApiError(413, code, message, details);
  }
  static unsupported(code, message, details) {
    return new ApiError(415, code, message, details);
  }
}

module.exports = ApiError;
