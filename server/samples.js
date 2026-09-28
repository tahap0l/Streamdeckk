'use strict';
// İlk çalıştırmada örnek ses efektleri üretir (harici dosya gerektirmesin diye).

const RATE = 44100;

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32000), 44 + i * 2));
  return buf;
}

function render(seconds, fn) {
  const out = new Float32Array(Math.floor(RATE * seconds));
  for (let i = 0; i < out.length; i++) out[i] = fn(i / RATE);
  return out;
}

const TAU = Math.PI * 2;

const SAMPLES = {
  'ding.wav': () => render(1.4, (t) =>
    (Math.sin(TAU * 1318 * t) * 0.5 + Math.sin(TAU * 2637 * t) * 0.2) * Math.exp(-t * 3.5)),

  'tada.wav': () => {
    const notes = [523, 659, 784, 1047];
    return render(1.6, (t) => {
      let s = 0;
      notes.forEach((f, i) => {
        const st = i * 0.09;
        if (t >= st) {
          const lt = t - st;
          const env = Math.min(1, lt * 60) * Math.exp(-lt * (i === 3 ? 2 : 6));
          s += (Math.sin(TAU * f * lt) + 0.3 * Math.sin(TAU * f * 2 * lt)) * env * 0.3;
        }
      });
      return s;
    });
  },

  'sansur-bip.wav': () => render(0.7, (t) =>
    Math.sin(TAU * 1000 * t) * 0.45 * Math.min(1, t * 200, (0.7 - t) * 200)),

  'korna.wav': () => render(1.2, (t) => {
    const vib = 1 + 0.01 * Math.sin(TAU * 6 * t);
    let s = 0;
    for (const f of [440, 554, 659]) {
      for (let h = 1; h <= 6; h++) s += Math.sin(TAU * f * h * vib * t) / h;
    }
    return Math.tanh(s * 0.35) * 0.6 * Math.min(1, t * 30, (1.2 - t) * 8);
  }),
};

function writeSamples(fs, dir) {
  for (const [name, gen] of Object.entries(SAMPLES)) {
    const p = require('path').join(dir, name);
    if (!fs.existsSync(p)) fs.writeFileSync(p, wav(gen()));
  }
}

module.exports = { writeSamples, SAMPLE_NAMES: Object.keys(SAMPLES) };
