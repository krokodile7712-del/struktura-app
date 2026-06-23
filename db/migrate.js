import { getDb } from './database';

// ← Сюда вставить URL веб-приложения Google Apps Script
const GAS_URL = 'PASTE_YOUR_GAS_URL_HERE';

/**
 * Запрашивает данные из GAS и возвращает JSON
 */
async function fetchFromGAS(action, params = {}) {
  const query = new URLSearchParams({ action, ...params }).toString();
  const response = await fetch(`${GAS_URL}?${query}`);
  if (!response.ok) throw new Error(`GAS error: ${response.status}`);
  return response.json();
}

/**
 * Главная функция миграции — вызывается один раз с экрана настроек
 * Возвращает объект { success, imported, errors }
 */
export async function migrateFromSheets(onProgress) {
  const db = getDb();
  const result = { success: false, imported: {}, errors: [] };

  try {
    // 1. Товары / меню
    onProgress?.('Загружаем товары...');
    try {
      const products = await fetchFromGAS('getMenu');
      if (Array.isArray(products)) {
        db.execSync(`DELETE FROM products`);
        const stmt = db.prepareSync(
          `INSERT INTO products (name, category, price_s, price_m, price_l, has_milk, has_syrup, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
        );
        for (const p of products) {
          stmt.executeSync([
            p.name || p.Название || '',
            p.category || p.Категория || '',
            parseFloat(p.price_s || p.ЦенаS || 0),
            parseFloat(p.price_m || p.ЦенаM || 0),
            parseFloat(p.price_l || p.ЦенаL || 0),
            p.has_milk ? 1 : 0,
            p.has_syrup ? 1 : 0,
          ]);
        }
        stmt.finalizeSync();
        result.imported.products = products.length;
      }
    } catch (e) {
      result.errors.push(`Товары: ${e.message}`);
    }

    // 2. Клиенты
    onProgress?.('Загружаем клиентов...');
    try {
      const clients = await fetchFromGAS('getClients');
      if (Array.isArray(clients)) {
        db.execSync(`DELETE FROM clients`);
        const stmt = db.prepareSync(
          `INSERT INTO clients (fio, phone, code, balance, visits, total_sum, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        );
        for (const c of clients) {
          stmt.executeSync([
            c.fio || c.ФИО || '',
            c.phone || c.Телефон || '',
            c.code || c.Код || '',
            parseFloat(c.balance || c.Баллы || 0),
            parseInt(c.visits || c.Визиты || 0),
            parseFloat(c.total_sum || c.Сумма || 0),
            c.created_at || c.Дата || new Date().toISOString(),
          ]);
        }
        stmt.finalizeSync();
        result.imported.clients = clients.length;
      }
    } catch (e) {
      result.errors.push(`Клиенты: ${e.message}`);
    }

    // 3. Расходы
    onProgress?.('Загружаем расходы...');
    try {
      const expenses = await fetchFromGAS('getExpenses');
      if (Array.isArray(expenses)) {
        db.execSync(`DELETE FROM expenses`);
        const stmt = db.prepareSync(
          `INSERT INTO expenses (date, category, amount, comment)
           VALUES (?, ?, ?, ?)`
        );
        for (const e of expenses) {
          stmt.executeSync([
            e.date || e.Дата || '',
            e.category || e.Категория || '',
            parseFloat(e.amount || e.Сумма || 0),
            e.comment || e.Комментарий || '',
          ]);
        }
        stmt.finalizeSync();
        result.imported.expenses = expenses.length;
      }
    } catch (e) {
      result.errors.push(`Расходы: ${e.message}`);
    }

    result.success = true;
  } catch (e) {
    result.errors.push(`Общая ошибка: ${e.message}`);
  }

  return result;
}
