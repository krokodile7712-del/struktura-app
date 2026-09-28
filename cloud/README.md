# Облако и страницы регистрации по QR

- `loyalty_signups.sql` — таблицы и функции облака (выполняется в Supabase → SQL Editor целиком).
- `registration-page/` — страницы для репозитория `Struktura-crm/struktura-booking` (GitHub Pages):
  `register.html`, `consent.html`, `privacy.html`, `loyalty-config.js` (единственный файл настроек и реквизитов).
  `qr-register.png` — QR-код на `…/struktura-booking/register.html?slug=struktura` для печати.
- Обмен приложения с облаком — `db/supabase.js` и `db/loyaltySync.js`; на странице — блок `BEGIN API … END API`
  в `register.html`. При переезде на свой сервер меняются только они.
