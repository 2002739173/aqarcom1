/**
 * AqarCom local launcher: starts portable MongoDB (if nothing is on 27017), seeds a brand-new
 * database once, then runs the API server. Log: server/launcher-log.txt
 */
const { spawn, spawnSync } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SERVER = path.join(ROOT, 'server');
const MONGO_DIR = path.join(ROOT, 'local-mongo');
const LOG = path.join(SERVER, 'launcher-log.txt');
try { fs.unlinkSync(LOG); } catch (_) {}
const log = (m) => { const line = `[${new Date().toISOString()}] ${m}`; console.log(line); fs.appendFileSync(LOG, line + '\n'); };
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const portOpen = () => new Promise((resolve) => {
  const s = net.connect(27017, '127.0.0.1');
  const done = (v) => { s.destroy(); resolve(v); };
  s.on('connect', () => done(true));
  s.on('error', () => done(false));
  setTimeout(() => done(false), 2000);
});

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: true });
  fs.appendFileSync(LOG, (r.stdout || '') + (r.stderr || ''));
  return r.status === 0;
};

(async () => {
  log(`node ${process.version}`);

  let startedPortable = false;
  if (await portOpen()) {
    log('MongoDB already running on 27017');
  } else {
    log('MongoDB not running - starting portable MongoDB');
    if (!fs.existsSync(path.join(MONGO_DIR, 'node_modules', 'mongodb-memory-server-core'))) {
      log('installing portable MongoDB launcher (npm install in local-mongo)');
      if (!run(npm, ['install', '--no-audit', '--no-fund'], MONGO_DIR)) throw new Error('npm install in local-mongo failed');
    }
    // separate window so MongoDB keeps running independently of the server
    spawn('cmd.exe', ['/c', 'start', '"AqarCom MongoDB"', '/D', `"${MONGO_DIR}"`, 'cmd', '/k', 'node start-mongo.js'], {
      shell: true, detached: true, stdio: 'ignore', windowsVerbatimArguments: true,
    }).unref();
    log('waiting for MongoDB (first run downloads ~100 MB)...');
    let up = false;
    for (let i = 0; i < 200 && !up; i++) { await sleep(3000); up = await portOpen(); }
    if (!up) throw new Error('MongoDB did not start - check the "AqarCom MongoDB" window');
    log('MongoDB is up on 27017');
    startedPortable = true;
  }

  if (!fs.existsSync(path.join(SERVER, '.env'))) {
    fs.copyFileSync(path.join(SERVER, '.env.example'), path.join(SERVER, '.env'));
    log('created server/.env from .env.example');
  }
  if (!fs.existsSync(path.join(SERVER, 'node_modules', 'express'))) {
    log('npm install in server');
    if (!run(npm, ['install', '--no-audit', '--no-fund'], SERVER)) throw new Error('npm install in server failed');
  }

  const marker = path.join(MONGO_DIR, 'data', '.seeded');
  if (startedPortable && !fs.existsSync(marker)) {
    log('seeding demo data into the new database (npm run seed)');
    if (run(npm, ['run', 'seed'], SERVER)) { fs.writeFileSync(marker, new Date().toISOString()); log('seed done'); }
    else log('seed FAILED - see log above');
  }

  log('starting API server (npm start) - output also in server/server-log.txt');
  const out = fs.createWriteStream(path.join(SERVER, 'server-log.txt'));
  const srv = spawn(npm, ['start'], { cwd: SERVER, shell: true });
  srv.stdout.on('data', (d) => { process.stdout.write(d); out.write(d); });
  srv.stderr.on('data', (d) => { process.stderr.write(d); out.write(d); });
  srv.on('exit', (code) => { log(`server exited with code ${code}`); process.exit(code || 0); });
})().catch((e) => { log('ERROR ' + (e && e.stack || e)); process.exit(1); });
