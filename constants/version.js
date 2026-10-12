import app from '../app.json';

// Версия для магазинов (Google Play, RuStore): то, что видит человек, и внутренний номер сборки.
// versionName (app.json → expo.version) — читаемая версия вида 1.0.0; versionCode (expo.android.versionCode) — целое число,
// которое при КАЖДОЙ новой загрузке в магазин должно быть строго больше прежнего (см. tools/bump-version.js и CLAUDE.md).
export const APP_VERSION = app.expo.version;
export const BUILD_NUMBER = app.expo.android?.versionCode ?? 1;
export const VERSION_LABEL = `${APP_VERSION} (${BUILD_NUMBER})`;
