import { getDb } from './database';

const GAS_URL = 'https://script.google.com/macros/s/AKfycbyhQdWnyjnsNdSxwy-elb9c2xdy_5youCoCvCWv8dWrzy96uy4Hxb94MSAVdF5eqCZYLg/exec';

async function fetchGAS(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${GAS_URL}?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  // GAS иногда возвращает HTML вместо JSON если не добавлен роутинг
  if (text.trim().startsWith('<')) {
    throw new Error('GAS вернул HTML вместо JSON. Добавьте handleApiRequest в Code.gs (см. файл GAS_PATCH.js)');
  }
  return JSON.parse(text);
}

export async function migrateFromSheets(onProgress) {
  const db = getDb();
  const result = { success: false, imported: {}, errors: [] };

  // ─── 1. Настройки (PIN-коды) ─────────────────────────────────────────────
  onProgress?.('Загружаем настройки...');
  try {
    const settings = await fetchGAS('getSettings');
    // Обновляем PIN-коды из реального листа «Настройки»
    db.runSync(`UPDATE users SET pin = ? WHERE role = 'admin'`,   [settings.pinAdmin   || '2312']);
    db.runSync(`UPDATE users SET pin = ? WHERE role = 'barista'`, [settings.pinBarista || '1122']);
    // Сохраняем процент бонуса
    db.runSync(`
      CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT);
    `);
    db.runSync(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('bonusPct', ?)`,
      [String(settings.bonusPct || 10)]);
    // Методы оплаты
    if (Array.isArray(settings.payMethods)) {
      db.runSync(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('payMethods', ?)`,
        [JSON.stringify(settings.payMethods)]);
    }
    result.imported.settings = true;
  } catch (e) {
    result.errors.push(`Настройки: ${e.message}`);
  }

  // ─── 2. Меню / товары ────────────────────────────────────────────────────
  // GAS возвращает: { name, variants:[{size,price}], group, price, discountable }
  onProgress?.('Загружаем меню...');
  try {
    const menu = await fetchGAS('getMenu');
    // Модификаторы — чтобы знать has_milk / has_syrup
    let modifiers = {};
    try {
      modifiers = await fetchGAS('getModifiers');
    } catch (_) {}

    const milkMods  = Object.entries(modifiers).filter(([,m]) => m.type === 'Замена' || m.ingrToReplace?.toLowerCase().includes('молок')).map(([k]) => k);
    const syrupMods = Object.entries(modifiers).filter(([,m]) => !m.ingrToReplace || m.ingrToReplace === '').map(([k]) => k);

    db.execSync(`DELETE FROM products`);
    const stmt = db.prepareSync(`
      INSERT INTO products (name, category, price_s, price_m, price_l, has_milk, has_syrup, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);

    for (const item of menu) {
      const name     = item.name || '';
      const category = item.group || 'Прочее';
      const variants = item.variants || [];

      const getVariantPrice = (size) =>
        (variants.find(v => v.size === size)?.price) ?? 0;

      // Если вариантов нет — используем item.price
      const priceS = variants.length ? getVariantPrice('S') : (item.price || 0);
      const priceM = variants.length ? getVariantPrice('M') : (item.price || 0);
      const priceL = variants.length ? getVariantPrice('L') : 0;

      // has_milk/has_syrup — определяем по категории (кофе = молоко+сироп)
      const isCoffee = category.toLowerCase().includes('кофе') ||
                       name.toLowerCase().includes('капучино') ||
                       name.toLowerCase().includes('латте') ||
                       name.toLowerCase().includes('раф') ||
                       name.toLowerCase().includes('флэт');
      const hasMilk  = isCoffee ? 1 : 0;
      const hasSyrup = isCoffee ? 1 : 0;

      stmt.executeSync([name, category, priceS, priceM, priceL, hasMilk, hasSyrup]);
    }
    stmt.finalizeSync();

    // Сохраняем модификаторы
    db.execSync(`
      CREATE TABLE IF NOT EXISTS modifiers (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        name  TEXT NOT NULL,
        price REAL DEFAULT 0,
        type  TEXT DEFAULT 'Добавление',
        ingr_to_deduct  TEXT,
        ingr_to_replace TEXT
      );
    `);
    db.execSync(`DELETE FROM modifiers`);
    const mStmt = db.prepareSync(`
      INSERT INTO modifiers (name, price, type, ingr_to_deduct, ingr_to_replace)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const [name, m] of Object.entries(modifiers)) {
      mStmt.executeSync([name, m.price || 0, m.type || 'Добавление', m.ingrToDeduct || '', m.ingrToReplace || '']);
    }
    mStmt.finalizeSync();

    result.imported.products = menu.length;
    result.imported.modifiers = Object.keys(modifiers).length;
  } catch (e) {
    result.errors.push(`Меню: ${e.message}`);
  }

  // ─── 3. Клиенты ──────────────────────────────────────────────────────────
  // GAS возвращает: { code, fio, phone, balance, visits, totalSum, lastVisit }
  onProgress?.('Загружаем клиентов...');
  try {
    const clients = await fetchGAS('getClients');
    db.execSync(`DELETE FROM clients`);
    const stmt = db.prepareSync(`
      INSERT INTO clients (fio, phone, code, balance, visits, total_sum, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of clients) {
      stmt.executeSync([
        c.fio       || '',
        c.phone     || '',
        c.code      || '',
        c.balance   || 0,
        c.visits    || 0,
        c.totalSum  || 0,
        c.lastVisit || new Date().toISOString(),
      ]);
    }
    stmt.finalizeSync();
    result.imported.clients = clients.length;
  } catch (e) {
    result.errors.push(`Клиенты: ${e.message}`);
  }

  // ─── 4. Расходы ──────────────────────────────────────────────────────────
  // GAS возвращает: { date, category, amount, comment }
  onProgress?.('Загружаем расходы...');
  try {
    const { expenses } = await fetchGAS('getExpenses', {
      dateFrom: '2020-01-01',
      dateTo: new Date().toISOString().slice(0, 10),
    });
    db.execSync(`DELETE FROM expenses`);
    const stmt = db.prepareSync(`
      INSERT INTO expenses (date, category, amount, comment)
      VALUES (?, ?, ?, ?)
    `);
    for (const e of (expenses || [])) {
      stmt.executeSync([e.date || '', e.category || '', e.amount || 0, e.comment || '']);
    }
    stmt.finalizeSync();
    result.imported.expenses = (expenses || []).length;
  } catch (e) {
    result.errors.push(`Расходы: ${e.message}`);
  }

  // ─── 5. Склад ────────────────────────────────────────────────────────────
  // GAS возвращает: { name, остаток, unit, порог, category }
  onProgress?.('Загружаем склад...');
  try {
    const stock = await fetchGAS('getStock');
    db.execSync(`
      CREATE TABLE IF NOT EXISTS stock (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        name     TEXT NOT NULL,
        остаток  REAL DEFAULT 0,
        unit     TEXT DEFAULT '',
        порог    REAL DEFAULT 0,
        category TEXT DEFAULT 'Прочее'
      );
    `);
    db.execSync(`DELETE FROM stock`);
    const stmt = db.prepareSync(`
      INSERT INTO stock (name, остаток, unit, порог, category)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const s of stock) {
      stmt.executeSync([s.name, s.остаток || 0, s.unit || '', s.порог || 0, s.category || 'Прочее']);
    }
    stmt.finalizeSync();
    result.imported.stock = stock.length;
  } catch (e) {
    result.errors.push(`Склад: ${e.message}`);
  }

  // ─── 6. Себестоимость (техкарты) ─────────────────────────────────────────
  // GAS возвращает: { name, size, ingredients:[{ing,amt,unit,currentPrice,avgPrice}], ... }
  onProgress?.('Загружаем техкарты...');
  try {
    const cards = await fetchGAS('getCostPrice');
    db.execSync(`DELETE FROM cost_cards`);
    db.execSync(`DELETE FROM cost_ingredients`);
    const cardStmt = db.prepareSync(`INSERT INTO cost_cards (name, product_id) VALUES (?, NULL)`);
    const ingStmt  = db.prepareSync(`
      INSERT INTO cost_ingredients (cost_card_id, name, amount, unit, price_per_unit)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const card of cards) {
      const label = `${card.name}${card.size ? ' ' + card.size : ''}`;
      const r = cardStmt.executeSync([label]);
      const cardId = r.lastInsertRowId;
      for (const ing of (card.ingredients || [])) {
        ingStmt.executeSync([cardId, ing.name || ing.ing, ing.amt || 0, ing.unit || '', ing.avgPrice || ing.currentPrice || 0]);
      }
    }
    cardStmt.finalizeSync();
    ingStmt.finalizeSync();
    result.imported.costCards = cards.length;
  } catch (e) {
    result.errors.push(`Себестоимость: ${e.message}`);
  }

  result.success = result.errors.length === 0;
  onProgress?.('Готово!');
  return result;
}
