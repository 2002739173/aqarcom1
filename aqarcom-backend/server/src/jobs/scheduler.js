/** Cron job — closes tenders exactly by server time (FR-13, FR-17, BR-11) and recovers stuck evaluations. */
const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../utils/logger');
const lifecycle = require('../services/lifecycle.service');

let task = null;
let running = false;

function start() {
  if (!env.cron.enabled || task) return;
  task = cron.schedule(env.cron.closeTendersSchedule, async () => {
    if (running) return;
    running = true;
    try {
      const r = await lifecycle.runScheduledTick();
      if (r.closed || r.recovered) logger.info(`scheduler: closed=${r.closed} recovered=${r.recovered}`);
    } catch (e) {
      logger.error('scheduler tick failed', e);
    } finally {
      running = false;
    }
  });
  logger.info(`Tender scheduler started (${env.cron.closeTendersSchedule})`);
}

function stop() {
  if (task) task.stop();
  task = null;
}

module.exports = { start, stop };
