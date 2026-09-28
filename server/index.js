#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const config = require('./config');
const { createBackend } = require('./backend');
const { Executor } = require('./executor');
const { getAddresses } = require('./network');

const VERSION = require('../package.json').version;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const LOG_FILE = path.join(config.DATA_DIR, 'streamdeckk.log');
const HIDDEN_START = process.argv.includes('--hidden');

// ---------- Günlük ----------
fs.mkdirSync(config.DATA_DIR, { recursive: true });
try { if (fs.statSync(LOG_FILE).size > 1_000_000) fs.unlinkSync(LOG_FILE); } catch {}
// Konsolsuz (GUI) exe'de stdout geçersiz olabilir; o durumda yalnızca dosyaya yaz
const USE_CONSOLE = process.platform !== 'win32' || process.stdout.isTTY || process.argv.includes('--console');
process.stdout.on?.('error', () => {});
function log(...args) {
  const line = `[${new Date().toTimeString().slice(0, 8)}] ${args.join(' ')}`;
  if (USE_CONSOLE) console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}
process.on('uncaughtException', (e) => log('Beklenmeyen hata:', e.stack || e.message));
process.on('unhandledRejection', (e) => log('Beklenmeyen hata:', e?.stack || e));

// ---------- Durum ----------
let cfg = config.load();
const toggles = {}; // buttonId -> true (açık)
let port = cfg.port;
let backend, executor, wss;

const publicConfig = () => ({ pages: cfg.pages, grid: cfg.grid, volume: cfg.volume });
const panelUrl = () => `http://127.0.0.1:${port}/admin/`;

function saveConfig() { config.save(cfg); }

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of wss?.clients || []) if (ws.readyState === 1) ws.send(data);
}

function setVolume(v) {
  cfg.volume = v;
  saveConfig();
  broadcast({ type: 'volume', volume: v });
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); } catch {}
}

// ---------- HTTP yardımcıları ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function send(res, status, body, type = 'application/json; charset=utf-8', headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}

function serveFile(res, rel) {
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Yasak' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Bulunamadı' });
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Dosya çok büyük'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const isLoopback = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const hostIsLocal = (req) => /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(req.headers.host || '');

function tokenOk(t) {
  const a = Buffer.from(String(t || ''));
  const b = Buffer.from(cfg.token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- Yönetim API'si (yalnızca bu PC) ----------
async function handleApi(req, res, url) {
  if (!isLoopback(req) || !hostIsLocal(req)) return send(res, 403, { error: 'Kontrol paneli yalnızca bu bilgisayardan açılabilir' });
  // Tarayıcıdaki başka sitelerin istek atmasını engelle (CSRF): değiştiren istekler özel başlık taşımalı
  if (req.method !== 'GET' && req.headers['x-streamdeckk'] !== '1') return send(res, 403, { error: 'Geçersiz istek' });

  const route = `${req.method} ${url.pathname}`;
  if (route === 'GET /api/ping') return send(res, 200, { app: 'streamdeckk', version: VERSION });
  if (route === 'GET /api/config') return send(res, 200, publicConfig());
  if (route === 'PUT /api/config') {
    const body = JSON.parse((await readBody(req, 5_000_000)).toString('utf8'));
    const prevPort = cfg.port;
    cfg = config.sanitizeConfig(body, cfg);
    saveConfig();
    broadcast({ type: 'config', config: publicConfig() });
    return send(res, 200, { ok: true, config: publicConfig(), restartNeeded: cfg.port !== prevPort && cfg.port !== port });
  }
  if (route === 'GET /api/status') {
    return send(res, 200, {
      version: VERSION, platform: process.platform, backend: backend.status, backendError: backend.lastError || null,
      clients: wss.clients.size, dataDir: config.DATA_DIR, port,
    });
  }
  if (route === 'GET /api/connect') {
    const addresses = await Promise.all(getAddresses(port, cfg.token).map(async (a) => ({
      ...a, qr: await QRCode.toString(a.url, { type: 'svg', margin: 1, color: { dark: '#0b0612', light: '#ffffff' } }),
    })));
    return send(res, 200, { addresses, port });
  }
  if (route === 'POST /api/token/regenerate') {
    cfg.token = config.newToken();
    saveConfig();
    for (const ws of wss.clients) ws.close(4001, 'eslestirme-sifirlandi');
    return send(res, 200, { ok: true });
  }
  if (route === 'POST /api/test') {
    const body = JSON.parse((await readBody(req, 100_000)).toString('utf8'));
    const result = await executor.run(body.action);
    return send(res, 200, { ok: true, ...result });
  }
  if (route === 'GET /api/sounds') return send(res, 200, config.listSounds());
  if (route === 'POST /api/sounds') {
    const name = config.safeSoundName(url.searchParams.get('name'));
    if (!name) return send(res, 400, { error: 'Desteklenen biçimler: mp3, wav, wma, m4a, aac' });
    const data = await readBody(req, 30_000_000);
    fs.writeFileSync(path.join(config.SOUNDS_DIR, name), data);
    log('Ses yüklendi:', name);
    return send(res, 200, { ok: true, name });
  }
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/sounds/')) {
    const name = config.safeSoundName(decodeURIComponent(url.pathname.slice('/api/sounds/'.length)));
    if (!name) return send(res, 400, { error: 'Geçersiz ad' });
    try { fs.unlinkSync(path.join(config.SOUNDS_DIR, name)); } catch {}
    return send(res, 200, { ok: true });
  }
  if (route === 'POST /api/open-folder') {
    if (process.platform === 'win32') spawn('explorer.exe', [config.SOUNDS_DIR], { detached: true, stdio: 'ignore' }).unref();
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: 'Bulunamadı' });
}

// ---------- HTTP sunucusu ----------
async function onRequest(req, res) {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname === '/admin') return send(res, 302, '', 'text/plain', { Location: '/admin/' });
    if (url.pathname.startsWith('/admin/')) {
      if (!isLoopback(req) || !hostIsLocal(req)) {
        return send(res, 403, '<h1 style="font-family:sans-serif">Kontrol paneli yalnızca bu bilgisayardan açılabilir.</h1>', 'text/html; charset=utf-8');
      }
      return serveFile(res, url.pathname === '/admin/' ? 'admin/index.html' : url.pathname);
    }
    if (url.pathname === '/manifest.webmanifest') {
      const t = url.searchParams.get('t') || '';
      return send(res, 200, {
        name: 'StreamDeckk', short_name: 'StreamDeckk', display: 'standalone', orientation: 'portrait',
        background_color: '#07040c', theme_color: '#07040c',
        start_url: `/?t=${encodeURIComponent(t)}`, scope: '/',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
      }, MIME['.webmanifest']);
    }
    if (url.pathname === '/') return serveFile(res, 'deck/index.html');
    return serveFile(res, 'deck' + url.pathname);
  } catch (e) {
    log('İstek hatası:', e.message);
    return send(res, e.status || (e instanceof SyntaxError ? 400 : 500), { error: e.message });
  }
}

// ---------- WebSocket (telefon) ----------
function setupWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://x');
    if (!tokenOk(url.searchParams.get('t'))) { ws.close(4001, 'gecersiz-anahtar'); return; }
    const who = req.socket.remoteAddress?.replace('::ffff:', '');
    log('Cihaz bağlandı:', who);
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('close', () => log('Cihaz ayrıldı:', who));
    ws.send(JSON.stringify({
      type: 'hello', version: VERSION, config: publicConfig(), toggles,
      addresses: getAddresses(port, cfg.token).filter((a) => a.kind !== 'virtual').map((a) => `${a.ip}:${port}`),
    }));
    ws.on('message', (raw) => onMessage(ws, raw));
  });
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
  }, 15000).unref();
}

function findButton(pageId, buttonId) {
  const page = cfg.pages.find((p) => p.id === pageId) || cfg.pages.find((p) => p.buttons.some((b) => b?.id === buttonId));
  return page?.buttons.find((b) => b?.id === buttonId);
}

async function onMessage(ws, raw) {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return; }
  const reply = (o) => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'result', id: msg.id, ...o }));
  if (msg.type === 'ping') return ws.send(JSON.stringify({ type: 'pong' }));
  if (msg.type === 'toggle-flip') {
    const b = findButton(msg.pageId, msg.buttonId);
    if (b?.type === 'toggle') {
      toggles[b.id] = !toggles[b.id];
      broadcast({ type: 'toggles', toggles });
    }
    return;
  }
  if (msg.type !== 'press') return;
  const b = findButton(msg.pageId, msg.buttonId);
  if (!b) return reply({ ok: false, error: 'Tuş bulunamadı' });
  const isOn = b.type === 'toggle' && !!toggles[b.id];
  const action = isOn && b.offAction ? b.offAction : b.action;
  try {
    const result = await executor.run(action);
    if (b.type === 'toggle') {
      toggles[b.id] = !isOn;
      broadcast({ type: 'toggles', toggles });
    }
    reply({ ok: true, ...result });
  } catch (e) {
    log(`Tuş "${b.label}" hatası:`, e.message);
    reply({ ok: false, error: e.message });
  }
}

// ---------- Başlatma ----------
function probeExisting(p) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: p, path: '/api/ping', timeout: 1500 }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d).app === 'streamdeckk'); } catch { resolve(false); } });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function listen(server, p) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(p, '0.0.0.0', () => { server.removeListener('error', reject); resolve(); });
  });
}

async function main() {
  const server = http.createServer(onRequest);
  for (let attempt = 0; ; attempt++) {
    try {
      await listen(server, port);
      break;
    } catch (e) {
      if (e.code !== 'EADDRINUSE' || attempt >= 10) throw e;
      if (await probeExisting(port)) {
        log('StreamDeckk zaten çalışıyor, kontrol paneli açılıyor.');
        openBrowser(`http://127.0.0.1:${port}/admin/`);
        process.exit(0);
      }
      port++;
    }
  }
  setupWebSocket(server);

  backend = createBackend({ dataDir: config.DATA_DIR, panelUrl: panelUrl(), log });
  backend.on('quit', () => { log('Çıkış yapılıyor.'); backend.stop(); process.exit(0); });
  executor = new Executor({ backend, getConfig: () => cfg, setVolume, soundsDir: config.SOUNDS_DIR });
  await backend.start();

  log(`StreamDeckk v${VERSION} hazır → kontrol paneli: ${panelUrl()}`);
  for (const a of getAddresses(port, cfg.token)) log(`  ${a.kind.padEnd(7)} ${a.name}: http://${a.ip}:${port}`);
  if (!HIDDEN_START) openBrowser(panelUrl());

  const shutdown = () => { backend.stop(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Konsolsuz exe'de hata sessizce kaybolmasın: Windows'ta mesaj kutusu göster
function showFatal(message) {
  if (process.platform !== 'win32') return;
  const text = `StreamDeckk başlatılamadı:\n\n${message}\n\nAyrıntılar: ${LOG_FILE}`.replace(/'/g, "''");
  try {
    require('child_process').spawnSync('powershell.exe', ['-NoProfile', '-Command',
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${text}', 'StreamDeckk', 'OK', 'Error') | Out-Null`],
    { windowsHide: true, timeout: 120000 });
  } catch {}
}

main().catch((e) => {
  log('Başlatılamadı:', e.stack || e.message);
  const hint = e.code === 'EADDRINUSE' ? `Port ${port} başka bir program tarafından kullanılıyor.` : e.message;
  showFatal(hint);
  process.exit(1);
});
