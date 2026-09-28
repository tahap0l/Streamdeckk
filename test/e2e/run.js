// Çalışan bir StreamDeckk'e karşı uçtan uca testler (Windows'taki gerçek exe ya da geliştirme sunucusu).
//   BASE=http://127.0.0.1:7373 node test/e2e/run.js
// Ortam değişkenleri:
//   ALLOW_NO_AUDIO=1  ses kartı olmayan makinelerde (CI) ses hatasını kabul et
//   SHOTS=klasör      arayüz ekran görüntülerini buraya kaydet
//   SKIP_UI=1         Playwright arayüz testlerini atla
'use strict';
const http = require('http');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const BASE = process.env.BASE || 'http://127.0.0.1:7373';
const WS_BASE = BASE.replace(/^http/, 'ws');
const SHOTS = process.env.SHOTS;
const results = [];

async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✅ ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`❌ ${name}\n   ${e.stack || e.message}`);
  }
}

function request(method, url, { body, headers = {}, raw } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url, BASE);
    const data = raw ?? (body !== undefined ? Buffer.from(JSON.stringify(body)) : null);
    const req = http.request({
      method, host: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: { ...(data ? { 'Content-Length': data.length, 'Content-Type': 'application/json' } : {}), ...headers },
      timeout: 15000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('timeout', () => req.destroy(new Error('zaman aşımı')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const H = { 'X-StreamDeckk': '1' };
const api = (method, p, opts = {}) => request(method, p, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
const testAction = (action) => api('POST', '/api/test', { body: { action } });

/** WebSocket istemcisi: gelen mesajları kuyruğa alır, belirli türü bekler. */
function connectWs(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/ws?t=${encodeURIComponent(token)}`);
    const queue = [];
    const waiters = [];
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      const i = waiters.findIndex((w) => w.pred(m));
      if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
      else queue.push(m);
    });
    ws.next = (pred, ms = 8000) => {
      const i = queue.findIndex(pred);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      return new Promise((res, rej) => {
        const w = { pred, resolve: (m) => { clearTimeout(timer); res(m); } };
        const timer = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); rej(new Error('mesaj gelmedi')); }, ms);
        waiters.push(w);
      });
    };
    ws.closed = new Promise((res) => ws.on('close', (code, reason) => res({ code, reason: reason.toString() })));
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

(async () => {
  let token, lanIp, cfg, ws;

  await test('Sunucu yanıt veriyor (/api/ping)', async () => {
    const r = await request('GET', '/api/ping');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.app, 'streamdeckk');
    console.log('   sürüm', r.json.version);
  });

  await test('Durum: PC katmanı hazır', async () => {
    const r = await request('GET', '/api/status');
    assert.strictEqual(r.status, 200);
    assert.ok(['ready', 'simulated'].includes(r.json.backend), `backend=${r.json.backend} ${r.json.backendError || ''}`);
    console.log(`   backend=${r.json.backend} platform=${r.json.platform} veri=${r.json.dataDir}`);
  });

  await test('Arayüz dosyaları gömülü ve doğru türde', async () => {
    for (const [p, type] of [['/', 'text/html'], ['/app.js', 'javascript'], ['/style.css', 'text/css'],
      ['/icons/apple-touch-icon.png', 'image/png'], ['/icons/icon-512.png', 'image/png'],
      ['/admin/', 'text/html'], ['/admin/admin.js', 'javascript'], ['/admin/admin.css', 'text/css']]) {
      const r = await request('GET', p);
      assert.strictEqual(r.status, 200, p);
      assert.ok(r.headers['content-type'].includes(type), `${p}: ${r.headers['content-type']}`);
    }
    assert.strictEqual((await request('GET', '/yok.js')).status, 404);
    assert.strictEqual((await request('GET', '/../../config.json')).status, 404);
  });

  await test('Manifest eşleştirme anahtarını taşır', async () => {
    const r = await request('GET', '/manifest.webmanifest?t=abc123');
    assert.strictEqual(r.json.start_url, '/?t=abc123');
    assert.strictEqual(r.json.display, 'standalone');
  });

  await test('Bağlan: QR kodları ve anahtar', async () => {
    const r = await request('GET', '/api/connect');
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.addresses.length > 0, 'hiç ağ adresi yok');
    for (const a of r.json.addresses) {
      assert.ok(a.qr.startsWith('<svg') || a.qr.includes('<svg'), 'QR svg değil');
      assert.ok(a.qr.includes('viewBox'), 'QR viewBox içermiyor');
    }
    token = new URL(r.json.addresses[0].url).searchParams.get('t');
    lanIp = r.json.addresses[0].ip;
    assert.ok(token && token.length >= 20);
    console.log('   adresler:', r.json.addresses.map((a) => `${a.kind}:${a.ip}`).join(', '));
  });

  await test('Güvenlik: başlıksız değişiklik isteği reddedilir (CSRF)', async () => {
    const r = await request('PUT', '/api/config', { body: {} });
    assert.strictEqual(r.status, 403);
    const r2 = await request('POST', '/api/test', { body: { action: { kind: 'hotkey', keys: 'f13' } } });
    assert.strictEqual(r2.status, 403);
  });

  await test('Güvenlik: yabancı Host başlığı reddedilir (DNS rebinding)', async () => {
    const r = await request('GET', '/api/config', { headers: { Host: 'kotu-site.com:7373' } });
    assert.strictEqual(r.status, 403);
    const r2 = await request('GET', '/admin/', { headers: { Host: 'kotu-site.com' } });
    assert.strictEqual(r2.status, 403);
  });

  await test('Güvenlik: panel ve API ağdan (LAN IP) açılamaz, telefon arayüzü açılır', async () => {
    if (!lanIp) throw new Error('LAN IP yok');
    const port = new URL(BASE).port;
    const admin = await request('GET', `http://${lanIp}:${port}/admin/`);
    assert.strictEqual(admin.status, 403);
    const apiR = await request('GET', `http://${lanIp}:${port}/api/config`);
    assert.strictEqual(apiR.status, 403);
    const deck = await request('GET', `http://${lanIp}:${port}/`);
    assert.strictEqual(deck.status, 200);
  });

  await test('Yapılandırma: varsayılan 3x5, 3 sayfa', async () => {
    const r = await request('GET', '/api/config');
    cfg = r.json;
    assert.ok(cfg.grid.cols >= 2 && cfg.grid.rows >= 2);
    assert.ok(cfg.pages.length >= 1);
    for (const p of cfg.pages) assert.strictEqual(p.buttons.length, cfg.grid.cols * cfg.grid.rows);
    console.log(`   ${cfg.grid.cols}x${cfg.grid.rows}, sayfalar: ${cfg.pages.map((p) => p.name).join(', ')}`);
  });

  await test('Kısayollar: F13, Ctrl+Shift+F14, medya tuşu', async () => {
    for (const keys of ['f13', 'ctrl+shift+f14', 'mediaplaypause', 'mediaplaypause']) {
      const r = await testAction({ kind: 'hotkey', keys });
      assert.strictEqual(r.status, 200, `${keys}: ${r.text}`);
    }
  });

  await test('Kısayollar: geçersiz tuş anlaşılır hata verir', async () => {
    const r = await testAction({ kind: 'hotkey', keys: 'ctrl+ğ' });
    assert.strictEqual(r.status, 400);
    assert.match(r.json.error, /Bilinmeyen tuş/);
    const r2 = await testAction({ kind: 'hotkey', keys: '' });
    assert.match(r2.json.error, /boş/);
  });

  await test('Metin yazma (Türkçe karakter + emoji)', async () => {
    const r = await testAction({ kind: 'text', text: 'Test ğüşıöç İĞÜŞÖÇ 💜', enter: false });
    assert.strictEqual(r.status, 200, r.text);
  });

  await test('Ses çalma, üst üste çalma ve durdurma', async () => {
    const r = await testAction({ kind: 'sound', sound: 'ding.wav', volume: 30 });
    if (r.status !== 200 && process.env.ALLOW_NO_AUDIO) {
      console.log('   (ses cihazı yok, kabul edildi):', r.json?.error);
      return;
    }
    assert.strictEqual(r.status, 200, r.text);
    assert.strictEqual((await testAction({ kind: 'sound', sound: 'tada.wav', volume: 30 })).status, 200);
    assert.strictEqual((await testAction({ kind: 'stopSounds' })).status, 200);
  });

  await test('Ses: olmayan dosya anlaşılır hata verir', async () => {
    const r = await testAction({ kind: 'sound', sound: 'yok.mp3' });
    assert.strictEqual(r.status, 400);
    assert.match(r.json.error, /Ses dosyası yok/);
  });

  await test('Soundboard ses seviyesi +/−', async () => {
    const before = (await request('GET', '/api/config')).json.volume;
    const up = await testAction({ kind: 'volumeUp' });
    assert.strictEqual(up.json.volume, Math.min(100, before + 10));
    const down = await testAction({ kind: 'volumeDown' });
    assert.strictEqual(down.json.volume, before === 100 ? 90 : before);
  });

  await test('Ses yükleme (Türkçe ad), listeleme, silme; kötü dosya reddi', async () => {
    const wav = fs.readFileSync(path.join(__dirname, 'fixture.wav'));
    const up = await api('POST', '/api/sounds?name=' + encodeURIComponent('alkış sesi.wav'), { raw: wav, headers: { 'Content-Type': 'application/octet-stream' } });
    assert.strictEqual(up.status, 200, up.text);
    let list = (await request('GET', '/api/sounds')).json.map((s) => s.name);
    assert.ok(list.includes('alkış sesi.wav'), list.join(','));
    const play = await testAction({ kind: 'sound', sound: 'alkış sesi.wav', volume: 10 });
    assert.ok(play.status === 200 || process.env.ALLOW_NO_AUDIO, play.text);
    const bad = await api('POST', '/api/sounds?name=virus.exe', { raw: Buffer.from('x'), headers: { 'Content-Type': 'application/octet-stream' } });
    assert.strictEqual(bad.status, 400);
    const trav = await api('POST', '/api/sounds?name=' + encodeURIComponent('../../kotu.wav'), { raw: wav, headers: { 'Content-Type': 'application/octet-stream' } });
    assert.strictEqual(trav.json.name, 'kotu.wav');
    await api('DELETE', '/api/sounds/' + encodeURIComponent('kotu.wav'));
    const del = await api('DELETE', '/api/sounds/' + encodeURIComponent('alkış sesi.wav'));
    assert.strictEqual(del.status, 200);
    list = (await request('GET', '/api/sounds')).json.map((s) => s.name);
    assert.ok(!list.includes('alkış sesi.wav') && !list.includes('kotu.wav'));
  });

  await test('Telefon: yanlış anahtar 4001 ile reddedilir', async () => {
    const bad = await connectWs('yanlis-anahtar');
    const c = await bad.closed;
    assert.strictEqual(c.code, 4001);
  });

  await test('Telefon: bağlanma, hello, ping/pong', async () => {
    ws = await connectWs(token);
    const hello = await ws.next((m) => m.type === 'hello');
    assert.ok(hello.config.pages.length > 0);
    assert.ok(Array.isArray(hello.addresses));
    ws.send(JSON.stringify({ type: 'ping' }));
    await ws.next((m) => m.type === 'pong');
    const st = await request('GET', '/api/status');
    assert.ok(st.json.clients >= 1);
  });

  await test('Telefon: aç/kapa tuşu durum değiştirir ve yayınlanır', async () => {
    const page = cfg.pages[0];
    const tog = page.buttons.find((b) => b && b.type === 'toggle');
    assert.ok(tog, 'aç/kapa tuş yok');
    ws.send(JSON.stringify({ type: 'press', id: 1, pageId: page.id, buttonId: tog.id }));
    const res = await ws.next((m) => m.type === 'result' && m.id === 1);
    assert.strictEqual(res.ok, true, res.error);
    const t1 = await ws.next((m) => m.type === 'toggles');
    assert.strictEqual(t1.toggles[tog.id], true);
    ws.send(JSON.stringify({ type: 'press', id: 2, pageId: page.id, buttonId: tog.id }));
    await ws.next((m) => m.type === 'result' && m.id === 2);
    const t2 = await ws.next((m) => m.type === 'toggles');
    assert.strictEqual(t2.toggles[tog.id], false);
    ws.send(JSON.stringify({ type: 'toggle-flip', pageId: page.id, buttonId: tog.id }));
    const t3 = await ws.next((m) => m.type === 'toggles');
    assert.strictEqual(t3.toggles[tog.id], true);
    ws.send(JSON.stringify({ type: 'toggle-flip', pageId: page.id, buttonId: tog.id }));
    await ws.next((m) => m.type === 'toggles');
  });

  await test('Telefon: ses tuşu, ses seviyesi tuşu, olmayan tuş', async () => {
    const page = cfg.pages[0];
    const snd = page.buttons.find((b) => b && b.action.kind === 'sound');
    ws.send(JSON.stringify({ type: 'press', id: 3, pageId: page.id, buttonId: snd.id }));
    const r = await ws.next((m) => m.type === 'result' && m.id === 3);
    assert.ok(r.ok || process.env.ALLOW_NO_AUDIO, r.error);
    const vol = page.buttons.find((b) => b && b.action.kind === 'volumeDown');
    ws.send(JSON.stringify({ type: 'press', id: 4, pageId: page.id, buttonId: vol.id }));
    const v = await ws.next((m) => m.type === 'result' && m.id === 4);
    assert.strictEqual(typeof v.volume, 'number');
    await ws.next((m) => m.type === 'volume');
    await testAction({ kind: 'volumeUp' });
    ws.send(JSON.stringify({ type: 'press', id: 5, pageId: page.id, buttonId: 'yok123' }));
    const nf = await ws.next((m) => m.type === 'result' && m.id === 5);
    assert.strictEqual(nf.ok, false);
    assert.match(nf.error, /bulunamadı/);
    ws.send('bozuk json{');
    ws.send(JSON.stringify({ type: 'ping' }));
    await ws.next((m) => m.type === 'pong');
  });

  await test('Panel değişikliği telefona anında gider ve doğrulanır', async () => {
    const next = JSON.parse(JSON.stringify(cfg));
    next.pages[0].buttons[3].label = 'Oyun Sahnesi';
    next.pages[0].buttons[3].emoji = '🕹️';
    next.pages[0].buttons.push({ id: 'fazla', label: 'fazla' });
    next.token = 'saldirgan';
    const r = await api('PUT', '/api/config', { body: next });
    assert.strictEqual(r.status, 200, r.text);
    const msg = await ws.next((m) => m.type === 'config');
    assert.strictEqual(msg.config.pages[0].buttons[3].label, 'Oyun Sahnesi');
    assert.strictEqual(msg.config.pages[0].buttons.length, cfg.grid.cols * cfg.grid.rows, 'fazla tuş kırpılmadı');
    const conn = await request('GET', '/api/connect');
    assert.strictEqual(new URL(conn.json.addresses[0].url).searchParams.get('t'), token, 'token değişmemeli');
    const bad = await api('PUT', '/api/config', { raw: Buffer.from('{bozuk'), headers: { 'Content-Type': 'application/json' } });
    assert.strictEqual(bad.status, 400);
    await api('PUT', '/api/config', { body: cfg });
    await ws.next((m) => m.type === 'config');
  });

  if (!process.env.SKIP_UI) {
    await test('Arayüz (Playwright): telefon ve kontrol paneli', async () => {
      const { chromium, devices } = require('playwright');
      const browser = await chromium.launch();
      const errors = [];
      try {
        const phone = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
        phone.on('pageerror', (e) => errors.push('telefon: ' + e.message));
        await phone.goto(`${BASE}/?t=${token}`);
        await phone.waitForSelector('#conn.on', { timeout: 10000 });
        await phone.waitForTimeout(400);
        if (SHOTS) await phone.screenshot({ path: path.join(SHOTS, 'telefon-1.png') });
        const keys = await phone.$$('.key[data-id]');
        assert.ok(keys.length >= 10, 'tuşlar çizilmedi');
        await phone.tap('.key[data-id] >> nth=0');
        await phone.waitForSelector('.key.on', { timeout: 5000 });
        await phone.waitForSelector('.badge.ok', { timeout: 5000 });
        if (SHOTS) await phone.screenshot({ path: path.join(SHOTS, 'telefon-2-toggle.png') });
        await phone.tap('.key[data-id] >> nth=0');
        await phone.click('#dots button >> nth=1');
        await phone.waitForFunction(() => document.getElementById('page-name').textContent === 'Sesler');
        if (SHOTS) await phone.screenshot({ path: path.join(SHOTS, 'telefon-3-sesler.png') });

        const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
        admin.on('pageerror', (e) => errors.push('panel: ' + e.message));
        await admin.goto(`${BASE}/admin/`);
        await admin.waitForSelector('.pv-key');
        await admin.waitForSelector('#st-backend.ok, #st-backend.warn', { timeout: 8000 });
        await admin.click('.pv-key >> nth=0');
        if (SHOTS) await admin.screenshot({ path: path.join(SHOTS, 'panel-1-tuslar.png') });
        await admin.fill('#ed-label', 'Mikrofon Test');
        await phone.click('#dots button >> nth=0');
        await phone.waitForFunction(() => [...document.querySelectorAll('.key .label')].some((l) => l.textContent === 'Mikrofon Test'), null, { timeout: 5000 });
        await admin.fill('#ed-label', 'Mikrofon');
        await admin.waitForTimeout(700);
        await admin.click('[data-tab=connect]');
        await admin.waitForSelector('.qr-card svg');
        if (SHOTS) await admin.screenshot({ path: path.join(SHOTS, 'panel-2-baglan.png'), fullPage: true });
        await admin.click('[data-tab=sounds]');
        await admin.waitForSelector('.sound-list .sname');
        if (SHOTS) await admin.screenshot({ path: path.join(SHOTS, 'panel-3-sesler.png') });
        assert.deepStrictEqual(errors, []);
      } finally {
        await browser.close();
      }
    });
  }

  await test('Eşleştirmeyi sıfırlama bağlı telefonu 4001 ile düşürür', async () => {
    const r = await api('POST', '/api/token/regenerate');
    assert.strictEqual(r.status, 200);
    const c = await ws.closed;
    assert.strictEqual(c.code, 4001);
    const again = await connectWs(token);
    assert.strictEqual((await again.closed).code, 4001, 'eski anahtar hâlâ geçerli');
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} test geçti`);
  if (process.env.RESULTS) fs.writeFileSync(process.env.RESULTS, JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})();
