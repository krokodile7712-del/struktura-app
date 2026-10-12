import app from '../app.json';

// Версия для магазинов (Google Play, RuStore). Человеку показываем только версию вида 1.0.0 (app.json → expo.version);
// номер сборки (expo.android.versionCode) — внутренний, вычисляется командой `npm run release` (tools/bump-version.js) из версии.
export const APP_VERSION = app.expo.version;
export const BUILD_NUMBER = app.expo.android?.versionCode ?? 1;
export const VERSION_LABEL = APP_VERSION;
