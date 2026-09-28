// Windows için tek dosyalık exe üretir:
//   dist/StreamDeckk.exe        → konsol penceresi açmaz, simge tepsisinde çalışır
//   dist/StreamDeckk-Konsol.exe → sorun giderme için günlükleri gösteren konsollu sürüm
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const consoleExe = path.join(dist, 'StreamDeckk-Konsol.exe');
const guiExe = path.join(dist, 'StreamDeckk.exe');

fs.mkdirSync(dist, { recursive: true });
execFileSync(process.execPath, [require.resolve('@yao-pkg/pkg/lib-es5/bin.js'), root,
  '--targets', 'node22-win-x64', '--output', consoleExe], { stdio: 'inherit', cwd: root });

// PE başlığındaki Subsystem alanını CONSOLE (3) → WINDOWS_GUI (2) yap
const buf = fs.readFileSync(consoleExe);
const peOffset = buf.readUInt32LE(0x3c);
if (buf.toString('latin1', peOffset, peOffset + 4) !== 'PE\0\0') throw new Error('Geçersiz PE dosyası');
const subsystemOffset = peOffset + 4 + 20 + 68;
if (buf.readUInt16LE(subsystemOffset) !== 3) throw new Error('Beklenmeyen subsystem değeri');
buf.writeUInt16LE(2, subsystemOffset);
fs.writeFileSync(guiExe, buf);
console.log('Hazır:\n ', guiExe, '\n ', consoleExe);
