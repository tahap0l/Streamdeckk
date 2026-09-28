'use strict';
// Kısayol metnini ("ctrl+shift+m", "f13", "numpad1") Windows sanal tuş kodlarına çevirir.

const VK = {
  ctrl: 0xa2, shift: 0xa0, alt: 0xa4, win: 0x5b,
  rctrl: 0xa3, rshift: 0xa1, ralt: 0xa5,
  space: 0x20, enter: 0x0d, tab: 0x09, esc: 0x1b, backspace: 0x08,
  delete: 0x2e, insert: 0x2d, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22,
  up: 0x26, down: 0x28, left: 0x25, right: 0x27,
  printscreen: 0x2c, pause: 0x13, capslock: 0x14, numlock: 0x90, scrolllock: 0x91, menu: 0x5d,
  semicolon: 0xba, equal: 0xbb, comma: 0xbc, minus: 0xbd, period: 0xbe, slash: 0xbf,
  backquote: 0xc0, bracketleft: 0xdb, backslash: 0xdc, bracketright: 0xdd, quote: 0xde,
  intlbackslash: 0xe2,
  numpadmultiply: 0x6a, numpadadd: 0x6b, numpadsubtract: 0x6d, numpaddecimal: 0x6e, numpaddivide: 0x6f,
  volumemute: 0xad, volumedown: 0xae, volumeup: 0xaf,
  medianext: 0xb0, mediaprev: 0xb1, mediastop: 0xb2, mediaplaypause: 0xb3,
};
for (let i = 0; i < 26; i++) VK[String.fromCharCode(97 + i)] = 0x41 + i;
for (let i = 0; i <= 9; i++) {
  VK[String(i)] = 0x30 + i;
  VK['numpad' + i] = 0x60 + i;
}
for (let i = 1; i <= 24; i++) VK['f' + i] = 0x6f + i;

const ALIASES = {
  control: 'ctrl', cmd: 'win', meta: 'win', super: 'win', escape: 'esc', return: 'enter',
  del: 'delete', ins: 'insert', pgup: 'pageup', pgdn: 'pagedown',
  arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
};

const MODIFIERS = new Set(['ctrl', 'shift', 'alt', 'win', 'rctrl', 'rshift', 'ralt']);

// Windows'ta "extended" bayrağı gerektiren tuşlar
const EXTENDED = new Set([
  0xa3, 0xa5, 0x5b, 0x5c, 0x5d, 0x2d, 0x2e, 0x24, 0x23, 0x21, 0x22,
  0x26, 0x28, 0x25, 0x27, 0x90, 0x6f, 0x2c,
  0xad, 0xae, 0xaf, 0xb0, 0xb1, 0xb2, 0xb3,
]);

function normalizeName(name) {
  const n = String(name).trim().toLowerCase().replace(/\s+/g, '');
  return ALIASES[n] || n;
}

/** "ctrl+shift+m" -> [0xa2, 0xa0, 0x4d]. Geçersiz tuşta hata fırlatır. */
function parseCombo(combo) {
  if (!combo || typeof combo !== 'string') throw new Error('Kısayol boş');
  const parts = combo.split('+').map(normalizeName).filter(Boolean);
  if (!parts.length) throw new Error('Kısayol boş');
  const codes = parts.map((p) => {
    if (!(p in VK)) throw new Error(`Bilinmeyen tuş: "${p}"`);
    return VK[p];
  });
  // Değiştiriciler önce basılsın
  const mods = [], keys = [];
  parts.forEach((p, i) => (MODIFIERS.has(p) ? mods : keys).push(codes[i]));
  return [...mods, ...keys];
}

module.exports = { VK, EXTENDED, parseCombo, normalizeName };
