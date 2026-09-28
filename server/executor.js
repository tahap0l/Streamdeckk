'use strict';
const fs = require('fs');
const path = require('path');
const { parseCombo } = require('./keys');

/** Bir tuş aksiyonunu PC arka ucunda çalıştırır. */
class Executor {
  constructor({ backend, getConfig, setVolume, soundsDir }) {
    this.backend = backend;
    this.getConfig = getConfig;
    this.setVolume = setVolume;
    this.soundsDir = soundsDir;
  }

  async run(action) {
    const a = action || { kind: 'none' };
    switch (a.kind) {
      case 'none':
      case 'page':
        return {};
      case 'hotkey':
        await this.backend.hotkey(parseCombo(a.keys));
        return {};
      case 'text':
        if (!a.text) throw new Error('Yazılacak metin boş');
        await this.backend.text(a.text, !!a.enter);
        return {};
      case 'sound': {
        if (!a.sound) throw new Error('Ses dosyası seçilmemiş');
        const file = path.join(this.soundsDir, path.basename(a.sound));
        if (!fs.existsSync(file)) throw new Error(`Ses dosyası yok: ${a.sound}`);
        const master = this.getConfig().volume;
        const per = a.volume ?? 100;
        await this.backend.play(file, Math.round((master / 100) * (per / 100) * 1000));
        return {};
      }
      case 'stopSounds':
        await this.backend.stopSounds();
        return {};
      case 'volumeUp':
      case 'volumeDown': {
        const cur = this.getConfig().volume;
        const next = Math.max(0, Math.min(100, cur + (a.kind === 'volumeUp' ? 10 : -10)));
        this.setVolume(next);
        return { volume: next };
      }
      default:
        throw new Error('Bilinmeyen aksiyon');
    }
  }
}

module.exports = { Executor };
