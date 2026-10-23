/**
 * Resumable chunked uploads for large specification books (NFR-01).
 * The Android client splits the file (e.g. 1 MB chunks), PUTs each chunk with its index,
 * and after a disconnect calls GET /uploads/:id to learn which chunks are missing.
 */
const fs = require('fs/promises');
const path = require('path');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const fileStore = require('../utils/fileStore');
const { UploadSession } = require('../models');
const { ALLOWED_DOC_MIME } = require('../config/constants');

const MB = 1024 * 1024;
const dirOf = (id) => fileStore.abs(path.posix.join(fileStore.SUBDIRS.chunks, String(id)));

const presentSession = (s) => {
  const o = s.toJSON();
  const got = new Set(s.receivedChunks);
  o.missingChunks = [];
  for (let i = 0; i < s.totalChunks; i++) if (!got.has(i)) o.missingChunks.push(i);
  o.complete = o.missingChunks.length === 0;
  return o;
};

async function init(user, { fileName, mimeType, totalSize, chunkSize }) {
  if (!ALLOWED_DOC_MIME[mimeType]) {
    throw ApiError.unsupported('UNSUPPORTED_FILE_TYPE', 'صيغة الملف غير مقبولة. الصيغ المقبولة: PDF, Word', { field: 'mimeType' });
  }
  if (totalSize > env.tenderDocMaxMb * MB) {
    throw ApiError.tooLarge('FILE_TOO_LARGE', `حجم الملف يتجاوز الحد الأقصى المسموح (${env.tenderDocMaxMb} ميغابايت). الصيغ المقبولة: PDF, Word`, {
      maxMb: env.tenderDocMaxMb,
    });
  }
  if (chunkSize > env.chunkSizeMaxMb * MB) {
    throw ApiError.badRequest('CHUNK_TOO_LARGE', `حجم الجزء الواحد لا يتجاوز ${env.chunkSizeMaxMb} ميغابايت`, { field: 'chunkSize' });
  }
  const s = await UploadSession.create({
    user: user._id,
    purpose: 'tender_document',
    fileName,
    mimeType,
    totalSize,
    chunkSize,
    totalChunks: Math.ceil(totalSize / chunkSize),
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
  });
  await fs.mkdir(dirOf(s._id), { recursive: true });
  return presentSession(s);
}

async function load(id, user) {
  const s = await UploadSession.findOne({ _id: id, user: user._id });
  if (!s || s.status !== 'uploading' || s.expiresAt < new Date()) throw ApiError.notFound('UPLOAD_NOT_FOUND', 'جلسة الرفع غير موجودة أو منتهية');
  return s;
}

async function putChunk(id, user, index, buffer) {
  const s = await load(id, user);
  if (!Number.isInteger(index) || index < 0 || index >= s.totalChunks) {
    throw ApiError.badRequest('CHUNK_INDEX_INVALID', 'رقم الجزء غير صالح', { field: 'index' });
  }
  const expected = index === s.totalChunks - 1 ? s.totalSize - s.chunkSize * (s.totalChunks - 1) : s.chunkSize;
  if (!buffer || buffer.length !== expected) {
    throw ApiError.badRequest('CHUNK_SIZE_MISMATCH', `حجم الجزء غير مطابق (المتوقع ${expected} بايت)`, { expected, received: buffer ? buffer.length : 0 });
  }
  await fs.mkdir(dirOf(s._id), { recursive: true });
  await fs.writeFile(path.join(dirOf(s._id), `${index}.part`), buffer);
  const updated = await UploadSession.findByIdAndUpdate(s._id, { $addToSet: { receivedChunks: index } }, { new: true });
  return presentSession(updated);
}

async function status(id, user) {
  return presentSession(await load(id, user));
}

/** Assemble the file and mark the session consumed. Returns { buffer, fileName, mimeType }. */
async function consume(id, user) {
  const s = await load(id, user);
  const p = presentSession(s);
  if (!p.complete) throw ApiError.badRequest('UPLOAD_INCOMPLETE', 'لم يكتمل رفع الملف بعد', { missingChunks: p.missingChunks });
  const parts = [];
  for (let i = 0; i < s.totalChunks; i++) parts.push(await fs.readFile(path.join(dirOf(s._id), `${i}.part`)));
  const buffer = Buffer.concat(parts);
  s.status = 'consumed';
  await s.save();
  await fs.rm(dirOf(s._id), { recursive: true, force: true });
  return { buffer, fileName: s.fileName, mimeType: s.mimeType };
}

module.exports = { init, putChunk, status, consume };
