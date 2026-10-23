/**
 * Resumable chunked upload session (NFR-01 — resume after connection loss).
 * Flow: init → PUT chunks (any order, retry safe) → GET status to find missing chunks → complete.
 */
const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins');

const uploadSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: { type: String, enum: ['tender_document'], required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    totalSize: { type: Number, required: true },
    chunkSize: { type: Number, required: true },
    totalChunks: { type: Number, required: true },
    receivedChunks: { type: [Number], default: [] },
    status: { type: String, enum: ['uploading', 'consumed'], default: 'uploading' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
uploadSessionSchema.plugin(toJSONPlugin);

module.exports = mongoose.model('UploadSession', uploadSessionSchema);
