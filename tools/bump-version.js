// Версия приложения для магазинов: меняется ОДНОЙ командой, номер сборки вычисляется сам из версии.
//   npm run release              — исправление: 1.0.0 → 1.0.1   (по умолчанию)
//   npm run release -- minor     — новые возможности: 1.0.1 → 1.1.0
//   npm run release -- major     — крупное обновление: 1.1.0 → 2.0.0
//   npm run release -- rebuild   — та же версия, но нужна ещё одна загрузка (магазин отклонил файл): номер сборки +1
//   npm run release -- sync      — ничего не повышать, только пересчитать номер сборки по текущей версии
// Номер сборки (versionCode, число для магазинов, пользователь его не видит) = старшая*1 000 000 + средняя*10 000 + младшая*100 + повторные загрузки.
// Он всегда растёт вместе с версией (1.0.0 → 1000000, 1.0.1 → 1000100, 1.1.0 → 1010000), поэтому следить за ним не нужно.
// Пределы: средняя и младшая часть версии — до 99, повторных загрузок одной версии — до 99, итог — не больше 2 100 000 000 (Google Play).
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'app.json');
const app = JSON.parse(fs.readFileSync(file, 'utf8')), e = app.expo;
const MAX = 2100000000, kind = process.argv[2] || 'patch';
let [a, b, c] = String(e.version || '1.0.0').split('.').map(n => parseInt(n, 10) || 0);
e.extra = e.extra || {};
let rebuild = e.extra.rebuild || 0;
if (kind === 'major') { a++; b = 0; c = 0; rebuild = 0; }
else if (kind === 'minor') { b++; c = 0; rebuild = 0; }
else if (kind === 'patch') { c++; rebuild = 0; }
else if (kind === 'rebuild') { rebuild++; }
else if (kind !== 'sync') { console.error('Неизвестный аргумент: ' + kind + ' (допустимо: patch, minor, major, rebuild, sync)'); process.exit(1); }
if (b > 99 || c > 99 || rebuild > 99) { console.error('Часть версии вышла за предел 99: поднимите старшую часть (npm run release -- major)'); process.exit(1); }
const code = a * 1000000 + b * 10000 + c * 100 + rebuild;
if (code > MAX) { console.error('Номер сборки ' + code + ' превысил предел Google Play ' + MAX); process.exit(1); }
e.version = `${a}.${b}.${c}`; e.extra.rebuild = rebuild; e.android = e.android || {}; e.android.versionCode = code;
if (e.ios && e.ios.buildNumber !== undefined) e.ios.buildNumber = String(code);
fs.writeFileSync(file, JSON.stringify(app, null, 2) + '\n');
console.log(`Версия ${e.version}, номер сборки для магазинов ${code} — записано в app.json`);
