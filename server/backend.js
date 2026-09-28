'use strict';
// PC üzerinde aksiyonları gerçekleştiren arka uç.
// Windows'ta PowerShell yardımcısını (helper.ps1) çalıştırır; diğer sistemlerde yalnızca günlüğe yazar (geliştirme için).

const fs = require('fs');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { EXTENDED } = require('./keys');

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');

class WindowsBackend extends EventEmitter {
  constructor({ dataDir, panelUrl, log }) {
    super();
    this.dataDir = dataDir;
    this.panelUrl = panelUrl;
    this.log = log;
    this.status = 'starting';
    this.sock = null;
    this.pending = new Map();
    this.nextId = 1;
    this.restarts = 0;
    this.secret = crypto.randomBytes(16).toString('hex');
  }

  async start() {
    this.server = net.createServer((sock) => this._onConnection(sock));
    await new Promise((res) => this.server.listen(0, '127.0.0.1', res));
    // pkg içindeki dosya doğrudan çalıştırılamaz; veri klasörüne UTF-8 BOM ile kopyala (Türkçe karakterler için)
    this.scriptPath = path.join(this.dataDir, 'helper.ps1');
    const src = fs.readFileSync(path.join(__dirname, 'helper.ps1'), 'utf8');
    fs.writeFileSync(this.scriptPath, '﻿' + src.replace(/^﻿/, ''));
    this._spawn();
  }

  _spawn() {
    this.status = 'starting';
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-WindowStyle', 'Hidden',
      '-File', this.scriptPath, '-Port', String(this.server.address().port),
      '-Secret', this.secret, '-PanelUrl', this.panelUrl];
    const proc = spawn('powershell.exe', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc = proc;
    let errText = '';
    proc.stdout.on('data', (d) => this.log('[yardımcı]', d.toString().trim()));
    proc.stderr.on('data', (d) => { errText += d; this.log('[yardımcı hata]', d.toString().trim()); });
    proc.on('error', (e) => this.log('PowerShell başlatılamadı:', e.message));
    proc.on('exit', (code) => {
      if (this.stopping) return;
      this.status = 'error';
      this.lastError = errText.trim().split('\n').slice(-3).join(' ') || `çıkış kodu ${code}`;
      this.log('Yardımcı kapandı:', this.lastError);
      for (const p of this.pending.values()) p.reject(new Error('PC yardımcısı yeniden başlıyor'));
      this.pending.clear();
      this.sock = null;
      if (this.restarts++ < 5) setTimeout(() => this._spawn(), 1500 * this.restarts);
    });
  }

  _onConnection(sock) {
    let buf = '';
    let authed = false;
    sock.setEncoding('utf8');
    sock.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        const [id, kind, arg] = line.split('\t');
        if (!authed) {
          if (id === '0' && kind === 'hello' && arg === this.secret) {
            authed = true;
            this.sock = sock;
          } else {
            sock.destroy();
          }
          continue;
        }
        if (id === '0') {
          if (kind === 'ready') { this.status = 'ready'; this.restarts = 0; this.emit('ready'); }
          if (kind === 'quit') this.emit('quit');
          continue;
        }
        const p = this.pending.get(id);
        if (!p) continue;
        this.pending.delete(id);
        clearTimeout(p.timer);
        if (kind === 'ok') p.resolve();
        else p.reject(new Error(Buffer.from(arg || '', 'base64').toString('utf8') || 'Bilinmeyen hata'));
      }
    });
    sock.on('error', () => {});
  }

  _send(cmd, ...args) {
    if (!this.sock) return Promise.reject(new Error('PC yardımcısı hazır değil, birkaç saniye sonra tekrar dene'));
    const id = String(this.nextId++);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('PC yanıt vermedi'));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.sock.write([id, cmd, ...args].join('\t') + '\n');
    });
  }

  hotkey(codes) {
    return this._send('key', codes.map((c) => `${c}:${EXTENDED.has(c) ? 1 : 0}`).join(','));
  }
  text(text, enter) { return this._send('text', b64(text), enter ? '1' : '0'); }
  play(file, volume1000) { return this._send('play', b64(file), String(volume1000)); }
  stopSounds() { return this._send('stop'); }

  stop() {
    this.stopping = true;
    try { this.proc?.kill(); } catch {}
  }
}

/** Windows dışı sistemler için: aksiyonları sadece günlüğe yazar. */
class SimulatedBackend extends EventEmitter {
  constructor({ log }) { super(); this.log = log; this.status = 'simulated'; }
  async start() {}
  async hotkey(codes) { this.log('[simülasyon] kısayol', codes.map((c) => '0x' + c.toString(16)).join('+')); }
  async text(text, enter) { this.log('[simülasyon] metin', JSON.stringify(text), enter ? '+Enter' : ''); }
  async play(file, vol) { this.log('[simülasyon] ses', path.basename(file), 'seviye', vol); }
  async stopSounds() { this.log('[simülasyon] sesler durduruldu'); }
  stop() {}
}

function createBackend(opts) {
  return process.platform === 'win32' && !process.env.STREAMDECKK_SIMULATE
    ? new WindowsBackend(opts)
    : new SimulatedBackend(opts);
}

module.exports = { createBackend };
