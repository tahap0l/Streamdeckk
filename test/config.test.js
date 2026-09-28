const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
process.env.STREAMDECKK_DATA = path.join(os.tmpdir(), 'sd-test-' + process.pid);
const config = require('../server/config');

test('varsayılan yapılandırma 3x5 ve kendi doğrulamasından geçer', () => {
  const cfg = config.defaultConfig();
  assert.deepStrictEqual(cfg.grid, { cols: 3, rows: 5 });
  cfg.pages.forEach((p) => assert.strictEqual(p.buttons.length, 15));
  assert.deepStrictEqual(config.sanitizeConfig(cfg, cfg).pages, cfg.pages);
});

test('sanitize: token korunur, zararlı alanlar temizlenir', () => {
  const cur = config.defaultConfig();
  const out = config.sanitizeConfig({
    token: 'saldirgan',
    grid: { cols: 99, rows: 1 },
    pages: [{
      id: '../x',
      name: 'A',
      buttons: [
        { label: 'x', action: { kind: 'sound', sound: '../../windows/system32/a.wav' } },
        { action: { kind: 'rm -rf' } },
      ],
    }],
  }, cur);
  assert.strictEqual(out.token, cur.token);
  assert.deepStrictEqual(out.grid, { cols: 8, rows: 2 });
  assert.strictEqual(out.pages[0].buttons.length, 16);
  assert.strictEqual(out.pages[0].buttons[0].action.sound, 'a.wav');
  assert.strictEqual(out.pages[0].buttons[1].action.kind, 'none');
  assert.notStrictEqual(out.pages[0].id, '../x');
});

test('ses dosya adı güvenliği', () => {
  assert.strictEqual(config.safeSoundName('alkış sesi.mp3'), 'alkış sesi.mp3');
  assert.strictEqual(config.safeSoundName('../../evil.wav'), 'evil.wav');
  assert.strictEqual(config.safeSoundName('virus.exe'), null);
  assert.strictEqual(config.safeSoundName('.gizli.mp3'), null);
});
