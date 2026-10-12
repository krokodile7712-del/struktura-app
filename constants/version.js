import app from '../app.json';

// Версия для магазинов (Google Play, RuStore). Человеку показываем версию вида 1.0.0 (app.json → expo.version).
// Номер сборки (expo.android.versionCode) вычисляется командой `npm run release` (tools/bump-version.js) из версии.
// В тестовых сборках одной версии (повторные загрузки, expo.extra.rebuild > 0) добавляется «(2)», «(3)» — чтобы их различать;
// у чистого релиза (rebuild = 0, например 1.0.1) число в скобках не показывается.
export const APP_VERSION = app.expo.version;
export const BUILD_NUMBER = app.expo.android?.versionCode ?? 1;
const rebuild = app.expo.extra?.rebuild || 0;
export const VERSION_LABEL = rebuild > 0 ? `${APP_VERSION} (${rebuild + 1})` : APP_VERSION;
