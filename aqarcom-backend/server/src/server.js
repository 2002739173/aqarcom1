const env = require('./config/env');
const { connectDB } = require('./config/db');
const app = require('./app');
const scheduler = require('./jobs/scheduler');
const fileStore = require('./utils/fileStore');
const logger = require('./utils/logger');

(async () => {
  try {
    await fileStore.ensureDirs();
    await connectDB();
    const server = app.listen(env.port, () => {
      logger.info(`AqarCom API listening on :${env.port}  —  docs: ${env.publicBaseUrl}/api-docs`);
    });
    scheduler.start();

    const shutdown = (sig) => {
      logger.info(`${sig} received, shutting down`);
      scheduler.stop();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (e) {
    logger.error('Failed to start server:', e);
    process.exit(1);
  }
})();
