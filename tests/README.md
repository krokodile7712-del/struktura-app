# Проверки на настоящем коде без телефона

`payroll.test.js` запускает настоящие `db/database.js` и `db/queries.js` на встроенной в Node SQLite (`expo-sqlite-shim.js` подменяет `expo-sqlite`).
Проверяет зарплату, KPI, доплаты, смену задним числом, перенос заказов, журнал изменений, удаление смены.

Нужен Node 22+ и `npm i esbuild`. Запуск из этой папки:

```
echo "export * from '../db/queries.js'; export { initDatabase, getDb } from '../db/database.js';" > entry.js
npx esbuild entry.js --bundle --platform=node --format=cjs --outfile=backend.js --alias:expo-sqlite=./expo-sqlite-shim.js
node payroll.test.js
```

Экранные проверки (компоненты, «Журнал работы», тур) собирались отдельно с подменой `react-native` и навигации — в репозиторий не входят.
