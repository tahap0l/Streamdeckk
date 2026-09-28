'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { writeSamples } = require('./samples');

const DATA_DIR = process.env.STREAMDECKK_DATA ||
  (process.platform === 'win32'
    ? path.join(process.env.APPDATA || os.homedir(), 'StreamDeckk')
    : path.join(os.homedir(), '.streamdeckk'));
const SOUNDS_DIR = path.join(DATA_DIR, 'sesler');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const ACTION_KINDS = ['none', 'hotkey', 'text', 'sound', 'stopSounds', 'volumeUp', 'volumeDown', 'page'];
const SOUND_EXT = /\.(mp3|wav|wma|m4a|aac)$/i;

const newId = () => crypto.randomBytes(5).toString('hex');
const newToken = () => crypto.randomBytes(18).toString('base64url');

function btn(emoji, label, action, extra = {}) {
  return { id: newId(), emoji, label, type: 'normal', action, ...extra };
}

function defaultConfig() {
  const cols = 3, rows = 5, n = cols * rows;
  const pad = (arr) => [...arr, ...Array(Math.max(0, n - arr.length)).fill(null)].slice(0, n);
  const sesler = { id: newId(), name: 'Sesler' };
  const mesajlar = { id: newId(), name: 'Mesajlar' };
  const yayin = {
    id: newId(),
    name: 'Yayın',
    buttons: pad([
      btn('🎙️', 'Mikrofon', { kind: 'hotkey', keys: 'f13' },
        { type: 'toggle', onEmoji: '🔇', onLabel: 'Mikrofon Kapalı' }),
      btn('📷', 'Kamera', { kind: 'hotkey', keys: 'f14' },
        { type: 'toggle', onEmoji: '🚫', onLabel: 'Kamera Kapalı' }),
      btn('⏸️', 'Mola', { kind: 'hotkey', keys: 'f15' },
        { type: 'toggle', onEmoji: '▶️', onLabel: 'Mola Bitti' }),
      btn('🎬', 'Sahne 1', { kind: 'hotkey', keys: 'f16' }),
      btn('🎮', 'Sahne 2', { kind: 'hotkey', keys: 'f17' }),
      btn('💬', 'Sahne 3', { kind: 'hotkey', keys: 'f18' }),
      btn('🔔', 'Ding', { kind: 'sound', sound: 'ding.wav', volume: 100 }),
      btn('🎉', 'Tada', { kind: 'sound', sound: 'tada.wav', volume: 100 }),
      btn('📯', 'Korna', { kind: 'sound', sound: 'korna.wav', volume: 80 }),
      btn('🤐', 'Sansür', { kind: 'sound', sound: 'sansur-bip.wav', volume: 70 }),
      btn('⏹️', 'Sesleri Durdur', { kind: 'stopSounds' }),
      null,
      btn('🔉', 'Ses −', { kind: 'volumeDown' }),
      btn('🔊', 'Ses +', { kind: 'volumeUp' }),
      btn('🎵', 'Sesler', { kind: 'page', pageId: sesler.id }),
    ]),
  };
  sesler.buttons = pad([
    btn('🔔', 'Ding', { kind: 'sound', sound: 'ding.wav', volume: 100 }),
    btn('🎉', 'Tada', { kind: 'sound', sound: 'tada.wav', volume: 100 }),
    btn('📯', 'Korna', { kind: 'sound', sound: 'korna.wav', volume: 80 }),
    btn('🤐', 'Sansür', { kind: 'sound', sound: 'sansur-bip.wav', volume: 70 }),
    null, null, null, null, null, null, null, null,
    btn('⏹️', 'Durdur', { kind: 'stopSounds' }),
    btn('💬', 'Mesajlar', { kind: 'page', pageId: mesajlar.id }),
    btn('🏠', 'Yayın', { kind: 'page', pageId: yayin.id }),
  ]);
  mesajlar.buttons = pad([
    btn('💜', 'Takip', { kind: 'text', text: 'Takip etmeyi unutmayın! 💜', enter: true }),
    btn('👋', 'Hoş geldin', { kind: 'text', text: 'Yayına hoş geldiniz! 👋', enter: true }),
    btn('🎁', 'Teşekkür', { kind: 'text', text: 'Hediyeler için çok teşekkürler! 🎁', enter: true }),
    null, null, null, null, null, null, null, null, null, null, null,
    btn('🏠', 'Yayın', { kind: 'page', pageId: yayin.id }),
  ]);
  return {
    version: 1,
    token: newToken(),
    port: 7373,
    grid: { cols, rows },
    volume: 80,
    pages: [yayin, sesler, mesajlar],
  };
}

function clampInt(v, min, max, def) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
}
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');

function sanitizeAction(a) {
  if (!a || !ACTION_KINDS.includes(a.kind)) return { kind: 'none' };
  switch (a.kind) {
    case 'hotkey': return { kind: 'hotkey', keys: str(a.keys, 100) };
    case 'text': return { kind: 'text', text: str(a.text, 2000), enter: !!a.enter };
    case 'sound': return { kind: 'sound', sound: path.basename(str(a.sound, 200)), volume: clampInt(a.volume, 0, 100, 100) };
    case 'page': return { kind: 'page', pageId: str(a.pageId, 40) };
    default: return { kind: a.kind };
  }
}

function sanitizeButton(b) {
  if (!b || typeof b !== 'object') return null;
  const out = {
    id: /^[a-z0-9]{4,20}$/i.test(b.id) ? b.id : newId(),
    emoji: str(b.emoji, 16),
    label: str(b.label, 40),
    type: b.type === 'toggle' ? 'toggle' : 'normal',
    action: sanitizeAction(b.action),
  };
  if (out.type === 'toggle') {
    out.onEmoji = str(b.onEmoji, 16);
    out.onLabel = str(b.onLabel, 40);
    if (b.offAction) out.offAction = sanitizeAction(b.offAction);
  }
  return out;
}

/** Dışarıdan gelen (panelden) yapılandırmayı doğrular; token/port gibi alanları korur. */
function sanitizeConfig(input, current) {
  const cols = clampInt(input?.grid?.cols, 2, 8, current.grid.cols);
  const rows = clampInt(input?.grid?.rows, 2, 10, current.grid.rows);
  const n = cols * rows;
  let pages = Array.isArray(input?.pages) ? input.pages.slice(0, 50) : current.pages;
  pages = pages.map((p) => {
    const buttons = Array.isArray(p?.buttons) ? p.buttons.slice(0, n).map(sanitizeButton) : [];
    while (buttons.length < n) buttons.push(null);
    return { id: /^[a-z0-9]{4,20}$/i.test(p?.id) ? p.id : newId(), name: str(p?.name, 40) || 'Sayfa', buttons };
  });
  if (!pages.length) pages = [{ id: newId(), name: 'Sayfa 1', buttons: Array(n).fill(null) }];
  return {
    ...current,
    grid: { cols, rows },
    volume: clampInt(input?.volume, 0, 100, current.volume),
    port: clampInt(input?.port, 1024, 65535, current.port),
    pages,
  };
}

function ensureDirs() {
  fs.mkdirSync(SOUNDS_DIR, { recursive: true });
}

function load() {
  ensureDirs();
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    cfg = defaultConfig();
    writeSamples(fs, SOUNDS_DIR);
    save(cfg);
  }
  if (!cfg.token) cfg.token = newToken();
  return cfg;
}

function save(cfg) {
  ensureDirs();
  const tmp = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, CONFIG_FILE);
}

function listSounds() {
  ensureDirs();
  return fs.readdirSync(SOUNDS_DIR)
    .filter((f) => SOUND_EXT.test(f))
    .map((f) => ({ name: f, size: fs.statSync(path.join(SOUNDS_DIR, f)).size }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

/** Kullanıcıdan gelen dosya adını güvenli hale getirir. */
function safeSoundName(name) {
  const base = path.basename(String(name || '')).replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 100);
  if (!SOUND_EXT.test(base) || base.startsWith('.')) return null;
  return base;
}

module.exports = {
  DATA_DIR, SOUNDS_DIR, CONFIG_FILE,
  load, save, sanitizeConfig, listSounds, safeSoundName, newToken, newId, defaultConfig,
};
