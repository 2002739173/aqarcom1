/** Runs a real MongoDB on 127.0.0.1:27017 with data kept in ./data (survives restarts). */
const path = require('path');
const fs = require('fs');
process.env.MONGOMS_DOWNLOAD_DIR = process.env.MONGOMS_DOWNLOAD_DIR || path.join(__dirname, 'bin');
const { MongoMemoryServer } = require('mongodb-memory-server-core');

(async () => {
  const dbPath = path.join(__dirname, 'data');
  fs.mkdirSync(dbPath, { recursive: true });
  console.log('Starting MongoDB (first run downloads ~100 MB into local-mongo/bin)...');
  const mongod = await MongoMemoryServer.create({
    instance: { port: 27017, ip: '127.0.0.1', dbPath, storageEngine: 'wiredTiger' },
  });
  console.log('MongoDB ready at', mongod.getUri(), '- data in', dbPath);
  console.log('Keep this window open. Close it to stop MongoDB.');
  const stop = async () => { await mongod.stop({ doCleanup: false }); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  setInterval(() => {}, 1 << 30);
})().catch((e) => { console.error('MongoDB failed to start:', e); process.exit(1); });
