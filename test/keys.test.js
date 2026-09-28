const test = require('node:test');
const assert = require('node:assert');
const { parseCombo } = require('../server/keys');

test('değiştiriciler önce, ana tuş sonra gelir', () => {
  assert.deepStrictEqual(parseCombo('m+ctrl+shift'), [0xa2, 0xa0, 0x4d]);
});

test('F13–F24 ve takma adlar', () => {
  assert.deepStrictEqual(parseCombo('f13'), [0x7c]);
  assert.deepStrictEqual(parseCombo('F24'), [0x87]);
  assert.deepStrictEqual(parseCombo('Control + Escape'), [0xa2, 0x1b]);
  assert.deepStrictEqual(parseCombo('alt+numpad5'), [0xa4, 0x65]);
});

test('bilinmeyen tuş ve boş kısayol hata verir', () => {
  assert.throws(() => parseCombo('ctrl+ğ'), /Bilinmeyen tuş/);
  assert.throws(() => parseCombo(''), /boş/);
});
