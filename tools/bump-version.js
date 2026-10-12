// Повышение версии перед КАЖДОЙ загрузкой в магазин. Запуск из корня проекта:
//   node tools/bump-version.js            — только номер сборки (versionCode) +1: исправление без смены видимой версии
//   node tools/bump-version.js patch      — 1.0.0 → 1.0.1 и номер сборки +1 (мелкие исправления)
//   node tools/bump-version.js minor      — 1.0.1 → 1.1.0 и номер сборки +1 (новые возможности)
//   node tools/bump-version.js major      — 1.1.0 → 2.0.0 и номер сборки +1 (крупное обновление)
// Номер сборки (versionCode) — одно целое число на все магазины: он только растёт, никогда не уменьшается и не повторяется.
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'app.json');
const app = JSON.parse(fs.readFileSync(file, 'utf8')), e = app.expo;
const MAX = 2100000000;                                   // предел Google Play
const kind = process.argv[2];
let [a, b, c] = String(e.version || '1.0.0').split('.').map(n => parseInt(n, 10) || 0);
if (kind === 'major') { a++; b = 0; c = 0; } else if (kind === 'minor') { b++; c = 0; } else if (kind === 'patch') { c++; } else if (kind) { console.error('Неизвестный аргумент: ' + kind + ' (допустимо: patch, minor, major)'); process.exit(1); }
e.version = `${a}.${b}.${c}`;
e.android = e.android || {};
const next = (e.android.versionCode || 0) + 1;
if (next > MAX) { console.error('versionCode превысил предел Google Play ' + MAX); process.exit(1); }
e.android.versionCode = next;
if (e.ios && e.ios.buildNumber !== undefined) e.ios.buildNumber = String(next);
fs.writeFileSync(file, JSON.stringify(app, null, 2) + '\n');
console.log(`Версия ${e.version} (${next}) — записано в app.json`);
