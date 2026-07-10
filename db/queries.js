import { getDb } from './database';

// ─── Настройки ────────────────────────────────────────────────────────────

export function getSetting(key) {
  const db = getDb();
  const row = db.getFirstSync(`SELECT value FROM app_settings WHERE key = ?`, [key]);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  const db = getDb();
  db.runSync(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export function getPayMethods() {
  const raw = getSetting('payMethods');
  try { return JSON.parse(raw) || ['Наличные', 'Карта']; }
  catch { return ['Наличные', 'Карта']; }
}

export function getBonusPct() {
  return parseFloat(getSetting('bonusPct') || '10');
}

export function getDiscounts() {
  const raw = getSetting('discounts');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [];
  } catch { return []; }
}

// ─── Пользователи ─────────────────────────────────────────────────────────

export function getUserByPin(pin) {
  const db = getDb();
  return db.getFirstSync(`SELECT * FROM users WHERE pin = ?`, [pin]) || null;
}

export function getUsers() {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM users`);
}

export function updateUserPin(role, pin) {
  const db = getDb();
  db.runSync(`UPDATE users SET pin = ? WHERE role = ?`, [pin, role]);
}

// ─── Товары ───────────────────────────────────────────────────────────────

export function getAllProducts() {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM products WHERE active = 1 ORDER BY category, name`);
}

export function getAllProductsAdmin() {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM products ORDER BY category, name`);
}

export function setProductActive(id, active) {
  const db = getDb();
  db.runSync(`UPDATE products SET active = ? WHERE id = ?`, [active ? 1 : 0, id]);
}

export function getCategories() {
  const db = getDb();
  return db.getAllSync(`SELECT DISTINCT category FROM products WHERE active = 1 ORDER BY category`)
           .map(r => r.category);
}

export function insertProduct({ name, category, price_s, price_m, price_l, has_milk, has_syrup }) {
  const db = getDb();
  const variants = [];
  if (price_s > 0) variants.push({ size: 'Маленький', price: price_s });
  if (price_m > 0) variants.push({ size: 'Средний', price: price_m });
  if (price_l > 0) variants.push({ size: 'Большой', price: price_l });
  db.runSync(
    `INSERT INTO products (name, category, price_s, price_m, price_l, has_milk, has_syrup, variants)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, category, price_s || 0, price_m || 0, price_l || 0, has_milk ? 1 : 0, has_syrup ? 1 : 0, JSON.stringify(variants)]
  );
}

export function updateProductVariants(id, variants) {
  const db = getDb();
  db.runSync(`UPDATE products SET variants = ? WHERE id = ?`, [JSON.stringify(variants), id]);
}

// ─── Модификаторы ─────────────────────────────────────────────────────────

export function getModifiers() {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM modifiers ORDER BY type, name`);
}

export function getMilkModifiers() {
  const db = getDb();
  return db.getAllSync(
    `SELECT * FROM modifiers WHERE type = 'Замена' OR ingr_to_replace != '' ORDER BY name`
  );
}

export function getSyrupModifiers() {
  const db = getDb();
  return db.getAllSync(
    `SELECT * FROM modifiers WHERE type = 'Добавление' AND (ingr_to_replace = '' OR ingr_to_replace IS NULL) ORDER BY name`
  );
}

export function updateModifier(id, { price, ingrToReplace, ingrToDeduct, deductAmount, deductUnit }) {
  initStockDeductionSchema();
  const db = getDb();
  db.runSync(
    `UPDATE modifiers SET price = ?, ingr_to_replace = ?, ingr_to_deduct = ?, deduct_amount = ?, deduct_unit = ? WHERE id = ?`,
    [price || 0, ingrToReplace || '', ingrToDeduct || '', deductAmount || 0, deductUnit || '', id]
  );
}

export function insertModifier({ name, price, type, ingrToReplace, ingrToDeduct, deductAmount, deductUnit }) {
  initStockDeductionSchema();
  const db = getDb();
  db.runSync(
    `INSERT INTO modifiers (name, price, type, ingr_to_deduct, ingr_to_replace, deduct_amount, deduct_unit) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, price || 0, type || 'Добавление', ingrToDeduct || '', ingrToReplace || '', deductAmount || 0, deductUnit || '']
  );
}

export function deleteModifier(id) {
  const db = getDb();
  db.runSync(`DELETE FROM modifiers WHERE id = ?`, [id]);
}

// ─── Заказы ───────────────────────────────────────────────────────────────

export function createOrder({ total, method, shift_id, client_id, items, cashAmount, cardAmount, discountPct }) {
  const db = getDb();
  const now = new Date().toISOString();

  // Добавляем колонки для смешанной оплаты и скидки если их нет
  try { db.execSync(`ALTER TABLE orders ADD COLUMN cash_amount REAL DEFAULT 0`); } catch (_) {}
  try { db.execSync(`ALTER TABLE orders ADD COLUMN card_amount REAL DEFAULT 0`); } catch (_) {}
  try { db.execSync(`ALTER TABLE orders ADD COLUMN discount_pct REAL DEFAULT 0`); } catch (_) {}

  const result = db.runSync(
    `INSERT INTO orders (created_at, total, method, shift_id, client_id, cash_amount, card_amount, discount_pct)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [now, total, method, shift_id || null, client_id || null, cashAmount || 0, cardAmount || 0, discountPct || 0]
  );
  const orderId = result.lastInsertRowId;

  const stockWarnings = [];
  for (const item of items) {
    const itemResult = db.runSync(
      `INSERT INTO order_items (order_id, product_id, name, size, milk, syrup, price) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [orderId, item.product_id || null, item.name, item.size || '', item.milk || '', item.syrup || '', item.price]
    );
    try {
      const warnings = deductStockForOrderItem(itemResult.lastInsertRowId, item);
      stockWarnings.push(...warnings);
    } catch (e) { console.error('[createOrder] Ошибка списания склада:', e); }
  }
  return { orderId, stockWarnings };
}

export function getRecentOrders(limit = 50) {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM orders ORDER BY created_at DESC LIMIT ?`, [limit]);
}

export function getOrderItems(order_id) {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM order_items WHERE order_id = ?`, [order_id]);
}

// ─── Клиенты ──────────────────────────────────────────────────────────────

export function getAllClients() {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM clients ORDER BY fio`);
}

export function searchClients(query) {
  const db = getDb();
  return db.getAllSync(
    `SELECT * FROM clients WHERE fio LIKE ? OR code LIKE ? OR phone LIKE ? ORDER BY fio`,
    [`%${query}%`, `%${query}%`, `%${query}%`]
  );
}

export function getClientByCode(code) {
  const db = getDb();
  return db.getFirstSync(`SELECT * FROM clients WHERE code = ?`, [code]) || null;
}

export function insertClient({ fio, phone, code }) {
  const db = getDb();
  const now = new Date().toISOString();
  db.runSync(
    `INSERT INTO clients (fio, phone, code, balance, visits, total_sum, created_at) VALUES (?, ?, ?, 0, 0, 0, ?)`,
    [fio, phone || '', code, now]
  );
}

export function updateClient(id, { fio, phone, balance }) {
  const db = getDb();
  db.runSync(
    `UPDATE clients SET fio = ?, phone = ?, balance = ? WHERE id = ?`,
    [fio, phone, balance, id]
  );
}

export function addClientVisit(client_id, amount) {
  const db = getDb();
  const bonusPct = getBonusPct();
  const points = Math.round(amount * bonusPct / 100);
  db.runSync(
    `UPDATE clients SET visits = visits + 1, total_sum = total_sum + ?, balance = balance + ? WHERE id = ?`,
    [amount, points, client_id]
  );
}

// ─── Смены ────────────────────────────────────────────────────────────────

export function openShift(cashOpen = 0) {
  const db = getDb();
  const now = new Date().toISOString();
  // Добавляем колонку cash_open если нет
  try { db.execSync(`ALTER TABLE shifts ADD COLUMN cash_open REAL DEFAULT 0`); } catch (_) {}
  return db.runSync(`INSERT INTO shifts (opened_at, status, cash_open) VALUES (?, 'open', ?)`, [now, cashOpen]).lastInsertRowId;
}

export function closeShift(shift_id) {
  const db = getDb();
  const now = new Date().toISOString();
  const totals = db.getFirstSync(
    `SELECT
       SUM(CASE WHEN method='Наличные' THEN total ELSE 0 END) as cash_total,
       SUM(CASE WHEN method='Карта' OR method='QR' THEN total ELSE 0 END) as card_total
     FROM orders WHERE shift_id = ?`,
    [shift_id]
  );
  db.runSync(
    `UPDATE shifts SET closed_at=?, cash_total=?, card_total=?, status='closed' WHERE id=?`,
    [now, totals?.cash_total || 0, totals?.card_total || 0, shift_id]
  );
}

export function getOpenShift() {
  const db = getDb();
  return db.getFirstSync(`SELECT * FROM shifts WHERE status='open' ORDER BY opened_at DESC LIMIT 1`) || null;
}

// ─── Расходы ──────────────────────────────────────────────────────────────

export function getAllExpenses() {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM expenses ORDER BY date DESC`);
}

export function insertExpense({ date, category, amount, comment, shift_id }) {
  const db = getDb();
  db.runSync(
    `INSERT INTO expenses (date, category, amount, comment, shift_id) VALUES (?, ?, ?, ?, ?)`,
    [date, category, amount, comment || '', shift_id || null]
  );
}

// ─── Склад ────────────────────────────────────────────────────────────────

export function getAllStock() {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM stock ORDER BY category, name`);
}

export function updateStockThreshold(id, threshold) {
  const db = getDb();
  db.runSync(`UPDATE stock SET порог = ? WHERE id = ?`, [threshold, id]);
}

// ─── Себестоимость ────────────────────────────────────────────────────────

export function getAllCostCards() {
  const db = getDb();
  const cards = db.getAllSync(`SELECT * FROM cost_cards ORDER BY name`);
  return cards.map(card => ({
    ...card,
    ingredients: db.getAllSync(`SELECT * FROM cost_ingredients WHERE cost_card_id = ?`, [card.id]),
  }));
}

export function insertCostCard(name, ingredients) {
  const db = getDb();
  const { lastInsertRowId: cardId } = db.runSync(`INSERT INTO cost_cards (name) VALUES (?)`, [name]);
  const stmt = db.prepareSync(
    `INSERT INTO cost_ingredients (cost_card_id, name, amount, unit, price_per_unit) VALUES (?, ?, ?, ?, ?)`
  );
  for (const ing of ingredients) {
    stmt.executeSync([cardId, ing.name, ing.amount, ing.unit, ing.pricePerUnit]);
  }
  stmt.finalizeSync();
  return cardId;
}

// ─── Итоги смены ───────────────────────────────────────────────────────────

export function getShiftSummary(shift_id) {
  const db = getDb();
  const shift = db.getFirstSync(`SELECT * FROM shifts WHERE id = ?`, [shift_id]);
  if (!shift) return null;

  const orders = db.getAllSync(`SELECT * FROM orders WHERE shift_id = ?`, [shift_id]);
  const cash = orders.filter(o => o.method === 'Наличные').reduce((s, o) => s + o.total, 0);
  const card = orders.filter(o => o.method === 'Карта').reduce((s, o) => s + o.total, 0);
  const qr   = orders.filter(o => o.method === 'QR').reduce((s, o) => s + o.total, 0);
  const total = cash + card + qr;

  // Расходы за дату смены
  const shiftDate = shift.opened_at.slice(0, 10);
  const expenses = db.getAllSync(
    `SELECT * FROM expenses WHERE date LIKE ? ORDER BY date DESC`,
    [`${shiftDate}%`]
  );
  const expTotal = expenses.reduce((s, e) => s + e.amount, 0);

  // Расходы по категориям
  const expByCategory = {};
  for (const e of expenses) {
    expByCategory[e.category] = (expByCategory[e.category] || 0) + e.amount;
  }

  const openingCash = shift.cash_open || 0;
  const cashRemaining = openingCash + cash - 0; // инкассация пока 0

  return {
    shift,
    orders: orders.length,
    cash, card, qr, total,
    expenses, expTotal, expByCategory,
    openingCash, cashRemaining,
  };
}

// ─── Редактирование/удаление заказов (только админ) ─────────────────────

export function deleteOrder(order_id) {
  const db = getDb();
  try { reverseStockForOrder(order_id); } catch (e) { console.error('[deleteOrder] Ошибка возврата на склад:', e); }
  db.runSync(`DELETE FROM order_items WHERE order_id = ?`, [order_id]);
  db.runSync(`DELETE FROM orders WHERE id = ?`, [order_id]);
}

export function updateOrder(order_id, { total, method }) {
  const db = getDb();
  try { db.execSync(`ALTER TABLE orders ADD COLUMN discount_pct REAL DEFAULT 0`); } catch (_) {}
  db.runSync(`UPDATE orders SET total = ?, method = ? WHERE id = ?`, [total, method, order_id]);
}

// ─── История заказов клиента ──────────────────────────────────────────────

export function getClientOrders(client_id) {
  const db = getDb();
  const orders = db.getAllSync(
    `SELECT * FROM orders WHERE client_id = ? ORDER BY created_at DESC LIMIT 50`,
    [client_id]
  );
  return orders.map(o => ({
    ...o,
    items: db.getAllSync(`SELECT * FROM order_items WHERE order_id = ?`, [o.id]),
  }));
}

// ─── Закупки (для расчёта средней цены) ──────────────────────────────────

export function initPurchasesTable() {
  const db = getDb();
  db.execSync(`
    CREATE TABLE IF NOT EXISTS purchases (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_name     TEXT NOT NULL,
      qty            REAL NOT NULL,
      price_per_unit REAL NOT NULL,
      total          REAL NOT NULL,
      created_at     TEXT NOT NULL
    )
  `);
  try { db.execSync(`ALTER TABLE stock ADD COLUMN avg_price REAL DEFAULT 0`); } catch (_) {}
  try { db.execSync(`ALTER TABLE stock ADD COLUMN last_price REAL DEFAULT 0`); } catch (_) {}
}

// ─── Списание склада по техкартам ─────────────────────────────────────────

export function initStockDeductionSchema() {
  const db = getDb();
  db.execSync(`
    CREATE TABLE IF NOT EXISTS stock_deductions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      order_item_id INTEGER NOT NULL,
      stock_name    TEXT NOT NULL,
      amount        REAL NOT NULL
    )
  `);
  try { db.execSync(`ALTER TABLE modifiers ADD COLUMN deduct_amount REAL DEFAULT 0`); } catch (_) {}
  try { db.execSync(`ALTER TABLE modifiers ADD COLUMN deduct_unit TEXT DEFAULT ''`); } catch (_) {}
}

function normName(s) {
  return (s || '').trim().toLowerCase();
}

// Находит техкарту по названию товара + размеру ("Капучино" + "Маленький" → "Капучино Маленький"),
// либо просто по названию товара, если у него нет размера.
export function findCostCardForItem(name, size) {
  const db = getDb();
  const candidates = [normName(`${name} ${size || ''}`), normName(name)];
  const cards = db.getAllSync(`SELECT * FROM cost_cards`);
  const match = cards.find(c => candidates.includes(normName(c.name)));
  if (!match) return null;
  const ingredients = db.getAllSync(`SELECT * FROM cost_ingredients WHERE cost_card_id = ?`, [match.id]);
  return { ...match, ingredients };
}

function findStockByName(name) {
  const db = getDb();
  const target = normName(name);
  if (!target) return null;
  const all = db.getAllSync(`SELECT * FROM stock`);
  return all.find(s => normName(s.name) === target) || null;
}

function findModifierByName(name) {
  const db = getDb();
  const target = normName(name);
  if (!target) return null;
  const all = db.getAllSync(`SELECT * FROM modifiers`);
  return all.find(m => normName(m.name) === target) || null;
}

// Списывает ингредиенты со склада для одной позиции чека. Возвращает список
// предупреждений { name, amount, unit } для ингредиентов, ушедших в минус.
export function deductStockForOrderItem(orderItemId, item) {
  initStockDeductionSchema();
  const db = getDb();
  const warnings = [];
  const deductions = [];

  const card = findCostCardForItem(item.name, item.size);
  const milkModifier = item.milk ? findModifierByName(item.milk) : null;

  if (card) {
    for (const ing of card.ingredients) {
      const isMilkIngredient = normName(ing.name) === 'молоко';
      let targetName = ing.name;
      if (isMilkIngredient && milkModifier?.ingr_to_replace) {
        targetName = milkModifier.ingr_to_replace;
      }
      deductions.push({ stockName: targetName, amount: ing.amount });
    }
  }

  if (item.syrup) {
    const syrupModifier = findModifierByName(item.syrup);
    if (syrupModifier?.ingr_to_deduct && syrupModifier.deduct_amount > 0) {
      deductions.push({ stockName: syrupModifier.ingr_to_deduct, amount: syrupModifier.deduct_amount });
    }
  }

  for (const d of deductions) {
    const stockRow = findStockByName(d.stockName);
    if (!stockRow) continue; // ингредиент не отслеживается на складе — пропускаем молча
    const newAmount = (stockRow['остаток'] || 0) - d.amount;
    db.runSync(`UPDATE stock SET остаток = ? WHERE id = ?`, [newAmount, stockRow.id]);
    db.runSync(
      `INSERT INTO stock_deductions (order_item_id, stock_name, amount) VALUES (?, ?, ?)`,
      [orderItemId, stockRow.name, d.amount]
    );
    if (newAmount < 0) {
      warnings.push({ name: stockRow.name, amount: newAmount, unit: stockRow.unit });
    }
  }
  return warnings;
}

// Возвращает списанное со склада обратно — используется при удалении заказа админом.
export function reverseStockForOrder(orderId) {
  initStockDeductionSchema();
  const db = getDb();
  const itemIds = db.getAllSync(`SELECT id FROM order_items WHERE order_id = ?`, [orderId]).map(r => r.id);
  if (itemIds.length === 0) return;
  const placeholders = itemIds.map(() => '?').join(',');
  const deductions = db.getAllSync(
    `SELECT * FROM stock_deductions WHERE order_item_id IN (${placeholders})`,
    itemIds
  );
  for (const d of deductions) {
    const stockRow = findStockByName(d.stock_name);
    if (!stockRow) continue;
    db.runSync(`UPDATE stock SET остаток = остаток + ? WHERE id = ?`, [d.amount, stockRow.id]);
  }
  db.runSync(`DELETE FROM stock_deductions WHERE order_item_id IN (${placeholders})`, itemIds);
}

// ─── Закупки (для расчёта средней цены) ──────────────────────────────────

export function addPurchase(stockName, qty, pricePerUnit) {
  initPurchasesTable();
  const db = getDb();
  const now = new Date().toISOString();
  const total = qty * pricePerUnit;

  // Записываем закупку
  db.runSync(
    `INSERT INTO purchases (stock_name, qty, price_per_unit, total, created_at) VALUES (?, ?, ?, ?, ?)`,
    [stockName, qty, pricePerUnit, total, now]
  );

  // Пересчитываем среднюю цену по всем закупкам этого товара
  const rows = db.getAllSync(
    `SELECT qty, price_per_unit FROM purchases WHERE LOWER(stock_name) = LOWER(?)`,
    [stockName]
  );
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalSum = rows.reduce((s, r) => s + r.qty * r.price_per_unit, 0);
  const avgPrice = totalQty > 0 ? Math.round((totalSum / totalQty) * 100) / 100 : pricePerUnit;

  // Обновляем склад
  db.runSync(
    `UPDATE stock SET остаток = остаток + ?, avg_price = ?, last_price = ? WHERE LOWER(name) = LOWER(?)`,
    [qty, avgPrice, pricePerUnit, stockName]
  );

  // Обновляем price_per_unit во всех техкартах где используется этот ингредиент
  db.runSync(
    `UPDATE cost_ingredients SET price_per_unit = ?
     WHERE LOWER(name) = LOWER(?)`,
    [avgPrice, stockName]
  );

  return { avgPrice, totalQty };
}

export function getPurchaseHistory(stockName) {
  initPurchasesTable();
  const db = getDb();
  return db.getAllSync(
    `SELECT * FROM purchases WHERE LOWER(stock_name) = LOWER(?) ORDER BY created_at DESC LIMIT 20`,
    [stockName]
  );
}

// ─── Резервное копирование ─────────────────────────────────────────────────

const BACKUP_TABLES = [
  'products', 'modifiers', 'orders', 'order_items', 'clients', 'shifts',
  'expenses', 'cost_cards', 'cost_ingredients', 'stock', 'purchases',
  'app_settings', 'users',
];

export function exportAllData() {
  const db = getDb();
  const data = { exported_at: new Date().toISOString() };
  for (const table of BACKUP_TABLES) {
    try { data[table] = db.getAllSync(`SELECT * FROM ${table}`); }
    catch (_) { data[table] = []; }
  }
  return data;
}

// Полный сброс локальной базы. НЕ вызывается из UI, пока кнопка неактивна —
// используется только когда явно потребуется очистить приложение перед стартом.
// Таблица users не трогается, чтобы не потерять доступ по PIN.
export function resetDatabase() {
  const db = getDb();
  for (const table of BACKUP_TABLES) {
    if (table === 'users') continue;
    try { db.execSync(`DELETE FROM ${table}`); } catch (_) {}
  }
}
