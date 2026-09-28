// Uygulama ikonlarını (PNG) SVG'den üretir. Kullanım: node scripts/make-icons.js (Playwright gerekir)
const path = require('path');
const { chromium } = require('playwright');

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="0%" r="110%">
      <stop offset="0" stop-color="#3b1273"/><stop offset="0.55" stop-color="#140a24"/><stop offset="1" stop-color="#07040c"/>
    </radialGradient>
    <linearGradient id="k" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2a1b45"/><stop offset="1" stop-color="#1a1029"/>
    </linearGradient>
    <linearGradient id="hot" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#c084fc"/><stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <rect x="112" y="112" width="130" height="130" rx="34" fill="#a855f7" filter="url(#glow)" opacity="0.9"/>
  <rect x="112" y="112" width="130" height="130" rx="34" fill="url(#hot)"/>
  <rect x="270" y="112" width="130" height="130" rx="34" fill="url(#k)" stroke="#a855f7" stroke-opacity="0.35" stroke-width="4"/>
  <rect x="112" y="270" width="130" height="130" rx="34" fill="url(#k)" stroke="#a855f7" stroke-opacity="0.35" stroke-width="4"/>
  <rect x="270" y="270" width="130" height="130" rx="34" fill="url(#k)" stroke="#a855f7" stroke-opacity="0.35" stroke-width="4"/>
  <circle cx="177" cy="177" r="22" fill="#fff"/>
  <path d="M318 312 l44 23 l-44 23z" fill="#c084fc"/>
  <rect x="158" y="318" width="38" height="34" rx="8" fill="#c084fc"/>
  <rect x="312" y="148" width="46" height="8" rx="4" fill="#c084fc"/><rect x="312" y="172" width="46" height="8" rx="4" fill="#c084fc" opacity=".7"/><rect x="312" y="196" width="30" height="8" rx="4" fill="#c084fc" opacity=".5"/>
</svg>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const out = path.join(__dirname, '..', 'public', 'deck', 'icons');
  for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0">${svg(size)}</body></html>`);
    await page.screenshot({ path: path.join(out, name), omitBackground: false });
  }
  await browser.close();
  console.log('İkonlar üretildi:', out);
})();
