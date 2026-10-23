/**
 * File storage.
 *  - Sensitive files (tender documents, verification documents) are encrypted at rest
 *    with AES-256-GCM (FR-22, "تشفير على مستوى التخزين"). Layout on disk:
 *        [12-byte IV][16-byte auth tag][ciphertext]
 *  - Public property images are stored as plain files and served statically.
 */
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const env = require('../config/env');

const KEY = Buffer.from(env.fileEncryptionKey, 'hex');
if (KEY.length !== 32) throw new Error('FILE_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');

const SUBDIRS = {
  tenderDocs: 'tender-documents',
  verification: 'verification',
  propertyImages: 'property-images',
  chunks: 'chunks',
};

const abs = (rel) => {
  const p = path.resolve(env.storageDir, rel);
  if (!p.startsWith(path.resolve(env.storageDir))) throw new Error('Invalid storage path');
  return p;
};

const randomName = (ext = '') => `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext ? '.' + ext : ''}`;

async function ensureDirs() {
  await Promise.all(Object.values(SUBDIRS).map((d) => fs.mkdir(abs(d), { recursive: true })));
}

async function saveEncrypted(subdir, buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  const rel = path.posix.join(subdir, randomName('enc'));
  await fs.writeFile(abs(rel), Buffer.concat([iv, tag, enc]));
  return { storageKey: rel, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

async function readDecrypted(storageKey) {
  const data = await fs.readFile(abs(storageKey));
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
}

async function savePublic(subdir, buffer, ext) {
  const rel = path.posix.join(subdir, randomName(ext));
  await fs.writeFile(abs(rel), buffer);
  return rel;
}

async function remove(rel) {
  try {
    await fs.rm(abs(rel), { force: true, recursive: true });
  } catch (_) {
    /* ignore */
  }
}

/** Detect the real file type from magic bytes — never trust the client-declared MIME. */
function sniffType(buf) {
  if (buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0xd0cf11e0 && buf.readUInt32BE(4) === 0xa1b11ae1)
    return 'application/msword';
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x504b0304) {
    // ZIP container — accept as .docx only if it contains word/ entries
    if (buf.includes(Buffer.from('word/'))) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    return 'application/zip';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp';
  return 'application/octet-stream';
}

module.exports = { SUBDIRS, abs, ensureDirs, saveEncrypted, readDecrypted, savePublic, remove, sniffType };
