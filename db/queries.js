import { getDb } from './database';

// ─── Пользователи / авторизация ────────────────────────────────────────────

export function getUserByPin(pin) {
  const db = getDb();
  return db.getFirstSync(`SELECT * FROM users WHERE pin = ?`, [pin]) || null;
}

// ─── Товары ────────────────────────────────────────────────────────────────

export function getAllProducts() {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM products WHERE active = 1 ORDER BY category, name`);
}

export function getProductsByCategory(category) {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM products WHERE active = 1 AND category = ? ORDER BY name`, [category]);
}

export function getCategories() {
  const db = getDb();
  return db.getAllSync(`SELECT DISTINCT category FROM products WHERE active = 1 ORDER BY category`).map(r => r.category);
}

export function insertProduct({ name, category, price_s, price_m, price_l, has_milk, has_syrup }) {
  const db = getDb();
  db.runSync(
    `INSERT INTO products (name, category, price_s, price_m, price_l, has_milk, has_syrup)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, category, price_s || 0, price_m || 0, price_l || 0, has_milk ? 1 : 0, has_syrup ? 1 : 0]
  );
}

// ─── Заказы ────────────────────────────────────────────────────────────────

export function createOrder({ total, method, shift_id, client_id, items }) {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db.runSync(
    `INSERT INTO orders (created_at, total, method, shift_id, client_id)
     VALUES (?, ?, ?, ?, ?)`,
    [now, total, method, shift_id || null, client_id || null]
  );
  const orderId = result.lastInsertRowId;

  const stmt = db.prepareSync(
    `INSERT INTO order_items (order_id, product_id, name, size, milk, syrup, price)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const item of items) {
    stmt.executeSync([orderId, item.product_id || null, item.name, item.size || '', item.milk || '', item.syrup || '', item.price]);
  }
  stmt.finalizeSync();

  return orderId;
}

export function getOrdersByShift(shift_id) {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM orders WHERE shift_id = ? ORDER BY created_at DESC`, [shift_id]);
}

export function getRecentOrders(limit = 50) {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM orders ORDER BY created_at DESC LIMIT ?`, [limit]);
}

// ─── Клиенты ───────────────────────────────────────────────────────────────

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

export function insertClient({ fio, phone, code }) {
  const db = getDb();
  const now = new Date().toISOString();
  db.runSync(
    `INSERT INTO clients (fio, phone, code, balance, visits, total_sum, created_at)
     VALUES (?, ?, ?, 0, 0, 0, ?)`,
    [fio, phone || '', code, now]
  );
}

export function addClientVisit(client_id, amount) {
  const db = getDb();
  const points = Math.floor(amount * 0.05); // 5% кэшбэк
  db.runSync(
    `UPDATE clients SET visits = visits + 1, total_sum = total_sum + ?, balance = balance + ? WHERE id = ?`,
    [amount, points, client_id]
  );
}

// ─── Смены ─────────────────────────────────────────────────────────────────

export function openShift() {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.runSync(
    `INSERT INTO shifts (opened_at, status) VALUES (?, 'open')`, [now]
  );
  return result.lastInsertRowId;
}

export function closeShift(shift_id) {
  const db = getDb();
  const now = new Date().toISOString();
  const totals = db.getFirstSync(
    `SELECT
       SUM(CASE WHEN method = 'cash' THEN total ELSE 0 END) as cash_total,
       SUM(CASE WHEN method = 'card' THEN total ELSE 0 END) as card_total
     FROM orders WHERE shift_id = ?`,
    [shift_id]
  );
  db.runSync(
    `UPDATE shifts SET closed_at = ?, cash_total = ?, card_total = ?, status = 'closed' WHERE id = ?`,
    [now, totals?.cash_total || 0, totals?.card_total || 0, shift_id]
  );
}

export function getOpenShift() {
  const db = getDb();
  return db.getFirstSync(`SELECT * FROM shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1`) || null;
}

// ─── Расходы ───────────────────────────────────────────────────────────────

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

// ─── Техкарты ──────────────────────────────────────────────────────────────

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
  const result = db.runSync(`INSERT INTO cost_cards (name) VALUES (?)`, [name]);
  const cardId = result.lastInsertRowId;

  const stmt = db.prepareSync(
    `INSERT INTO cost_ingredients (cost_card_id, name, amount, unit, price_per_unit)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const ing of ingredients) {
    stmt.executeSync([cardId, ing.name, ing.amount, ing.unit, ing.pricePerUnit]);
  }
  stmt.finalizeSync();

  return cardId;
}
