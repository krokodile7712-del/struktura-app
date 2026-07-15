import { getDb } from './database';

// ─── Профиль бизнеса ────────────────────────────────────────────────────────

export const BUSINESS_PRESETS = {
  coffee: {
    label: 'Кофейня',
    modules: { stock: true, shifts: true, clients: true, loyalty: true, modifiers: true, inventory: true },
    terms: { item: 'Товар', client: 'Клиент', order: 'Заказ', category: 'Категория' },
    units: ['мл', 'л', 'г', 'кг', 'шт', 'уп', 'пара'],
  },
  retail: {
    label: 'Розница',
    modules: { stock: true, shifts: false, clients: true, loyalty: true, modifiers: false, inventory: true },
    terms: { item: 'Товар', client: 'Покупатель', order: 'Продажа', category: 'Категория' },
    units: ['шт', 'пара', 'уп', 'м', 'кг'],
  },
  services: {
    label: 'Услуги',
    modules: { stock: false, shifts: true, clients: true, loyalty: true, modifiers: false, inventory: false },
    terms: { item: 'Услуга', client: 'Клиент', order: 'Заказ', category: 'Категория' },
    units: ['шт', 'ч', 'сеанс'],
  },
};

function safeParse(json, fallback) {
  try {
    const parsed = JSON.parse(json);
    return parsed ?? fallback;
  } catch (_) { return fallback; }
}

export function getBusinessProfile() {
  const db = getDb();
  const row = db.getFirstSync(`SELECT * FROM business_profile ORDER BY id LIMIT 1`);
  if (!row) return null;
  return {
    ...row,
    modules: safeParse(row.modules, {}),
    terms: safeParse(row.terms, {}),
    units: safeParse(row.units, []),
  };
}

export function updateBusinessProfile({ businessName, modules, terms, units, accessKey }) {
  const db = getDb();
  const existing = db.getFirstSync(`SELECT id FROM business_profile ORDER BY id LIMIT 1`);
  const payload = [
    businessName ?? '',
    JSON.stringify(modules || {}),
    JSON.stringify(terms || {}),
    JSON.stringify(units || []),
    accessKey ?? '',
  ];
  if (existing) {
    db.runSync(
      `UPDATE business_profile SET business_name = ?, modules = ?, terms = ?, units = ?, access_key = ? WHERE id = ?`,
      [...payload, existing.id]
    );
  } else {
    db.runSync(
      `INSERT INTO business_profile (business_name, modules, terms, units, access_key) VALUES (?, ?, ?, ?, ?)`,
      payload
    );
  }
}

// Применяет стартовый пресет (перезаписывает модули/термины/единицы, имя бизнеса не трогает)
export function applyBusinessPreset(presetKey) {
  const preset = BUSINESS_PRESETS[presetKey];
  if (!preset) return;
  const db = getDb();
  const existing = db.getFirstSync(`SELECT id FROM business_profile ORDER BY id LIMIT 1`);
  const payload = [presetKey, JSON.stringify(preset.modules), JSON.stringify(preset.terms), JSON.stringify(preset.units)];
  if (existing) {
    db.runSync(`UPDATE business_profile SET preset = ?, modules = ?, terms = ?, units = ? WHERE id = ?`, [...payload, existing.id]);
  } else {
    db.runSync(`INSERT INTO business_profile (preset, modules, terms, units) VALUES (?, ?, ?, ?)`, payload);
  }
}

// ─── Товары: произвольные оси вариативности ───────────────────────────────

export function getProductAxes(productId) {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM product_axes WHERE product_id = ? ORDER BY position`, [productId]);
}

export function getProductVariants(productId) {
  const db = getDb();
  const rows = db.getAllSync(`SELECT * FROM product_variants WHERE product_id = ? ORDER BY id`, [productId]);
  return rows.map(r => ({ ...r, axisValues: safeParse(r.axis_values, {}) }));
}

export function getProductVariantById(id) {
  const db = getDb();
  const row = db.getFirstSync(`SELECT * FROM product_variants WHERE id = ?`, [id]);
  if (!row) return null;
  return { ...row, axisValues: safeParse(row.axis_values, {}) };
}

// Полностью заменяет оси и варианты товара (проще и надёжнее, чем точечный diff в UI-редакторе)
export function saveProductAxesAndVariants(productId, axisNames, variants) {
  const db = getDb();
  db.runSync(`DELETE FROM product_axes WHERE product_id = ?`, [productId]);
  axisNames.forEach((name, i) => {
    db.runSync(`INSERT INTO product_axes (product_id, name, position) VALUES (?, ?, ?)`, [productId, name, i]);
  });

  const existingIds = db.getAllSync(`SELECT id FROM product_variants WHERE product_id = ?`, [productId]).map(r => r.id);
  const keepIds = variants.filter(v => v.id).map(v => v.id);
  const toDelete = existingIds.filter(id => !keepIds.includes(id));
  for (const id of toDelete) {
    db.runSync(`DELETE FROM product_variants WHERE id = ?`, [id]);
  }
  const saved = [];
  for (const v of variants) {
    if (v.id) {
      db.runSync(
        `UPDATE product_variants SET axis_values = ?, label = ?, price = ?, sku = ?, active = ? WHERE id = ?`,
        [JSON.stringify(v.axisValues || {}), v.label || '', v.price || 0, v.sku || '', v.active === false ? 0 : 1, v.id]
      );
      saved.push({ ...v, id: v.id });
    } else {
      const result = db.runSync(
        `INSERT INTO product_variants (product_id, axis_values, label, price, sku, active) VALUES (?, ?, ?, ?, ?, ?)`,
        [productId, JSON.stringify(v.axisValues || {}), v.label || '', v.price || 0, v.sku || '', v.active === false ? 0 : 1]
      );
      saved.push({ ...v, id: result.lastInsertRowId });
    }
  }
  return saved;
}

export function deleteProductVariants(productId) {
  const db = getDb();
  db.runSync(`DELETE FROM product_variants WHERE product_id = ?`, [productId]);
  db.runSync(`DELETE FROM product_axes WHERE product_id = ?`, [productId]);
}

// ─── Группы модификаторов (замена/добавка любого типа, не только молоко/сироп) ──

export function getAllModifierGroups() {
  const db = getDb();
  const groups = db.getAllSync(`SELECT * FROM modifier_groups ORDER BY name`);
  return groups.map(g => ({
    ...g,
    options: db.getAllSync(`SELECT * FROM modifier_options WHERE group_id = ?`, [g.id]),
  }));
}

export function insertModifierGroup({ name, selectionType }) {
  const db = getDb();
  const { lastInsertRowId } = db.runSync(
    `INSERT INTO modifier_groups (name, selection_type) VALUES (?, ?)`,
    [name, selectionType || 'single']
  );
  return lastInsertRowId;
}

export function updateModifierGroup(id, { name, selectionType }) {
  const db = getDb();
  db.runSync(`UPDATE modifier_groups SET name = ?, selection_type = ? WHERE id = ?`, [name, selectionType || 'single', id]);
}

export function deleteModifierGroup(id) {
  const db = getDb();
  db.runSync(`DELETE FROM modifier_options WHERE group_id = ?`, [id]);
  db.runSync(`DELETE FROM product_modifier_groups WHERE group_id = ?`, [id]);
  db.runSync(`DELETE FROM modifier_groups WHERE id = ?`, [id]);
}

export function insertModifierOption({ groupId, name, priceDelta, ingrToReplace, ingrToDeduct, deductAmount, deductUnit }) {
  const db = getDb();
  db.runSync(
    `INSERT INTO modifier_options (group_id, name, price_delta, ingr_to_replace, ingr_to_deduct, deduct_amount, deduct_unit)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [groupId, name, priceDelta || 0, ingrToReplace || '', ingrToDeduct || '', deductAmount || 0, deductUnit || '']
  );
}

export function updateModifierOption(id, { name, priceDelta, ingrToReplace, ingrToDeduct, deductAmount, deductUnit }) {
  const db = getDb();
  db.runSync(
    `UPDATE modifier_options SET name = ?, price_delta = ?, ingr_to_replace = ?, ingr_to_deduct = ?, deduct_amount = ?, deduct_unit = ? WHERE id = ?`,
    [name, priceDelta || 0, ingrToReplace || '', ingrToDeduct || '', deductAmount || 0, deductUnit || '', id]
  );
}

export function deleteModifierOption(id) {
  const db = getDb();
  db.runSync(`DELETE FROM modifier_options WHERE id = ?`, [id]);
}

export function getProductModifierGroups(productId) {
  const db = getDb();
  const links = db.getAllSync(`SELECT group_id FROM product_modifier_groups WHERE product_id = ?`, [productId]);
  const groupIds = links.map(l => l.group_id);
  if (groupIds.length === 0) return [];
  const all = getAllModifierGroups();
  return all.filter(g => groupIds.includes(g.id));
}

export function setProductModifierGroups(productId, groupIds) {
  const db = getDb();
  db.runSync(`DELETE FROM product_modifier_groups WHERE product_id = ?`, [productId]);
  for (const groupId of groupIds) {
    db.runSync(`INSERT INTO product_modifier_groups (product_id, group_id) VALUES (?, ?)`, [productId, groupId]);
  }
}

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
    // size/milk/syrup оставлены для обратной совместимости отображения в Продажах;
    // размер варианта дублируется в size как читаемая метка, модификаторы — в JSON
    const itemResult = db.runSync(
      `INSERT INTO order_items (order_id, product_id, variant_id, name, size, milk, syrup, price, modifiers)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId, item.product_id || null, item.variant_id || null, item.name,
        item.size || '', item.milk || '', item.syrup || '', item.price,
        JSON.stringify(item.modifiers || []),
      ]
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
  const existing = db.getFirstSync(`SELECT * FROM shifts WHERE status='open' ORDER BY opened_at DESC LIMIT 1`);
  if (existing) return existing.id; // смена уже открыта — не плодим дубли
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
  try { db.execSync(`ALTER TABLE cost_cards ADD COLUMN size TEXT DEFAULT ''`); } catch (_) {}
  const cards = db.getAllSync(`SELECT * FROM cost_cards ORDER BY name`);
  return cards.map(card => ({
    ...card,
    ingredients: db.getAllSync(`SELECT * FROM cost_ingredients WHERE cost_card_id = ?`, [card.id]),
  }));
}

// Одноразовая (идемпотентная) миграция: у старых техкарт product_id всегда NULL,
// связь была только по тексту "Товар Размер". Пытаемся связать по product_id+size.
export function migrateCostCardsToProductId() {
  const db = getDb();
  try { db.execSync(`ALTER TABLE cost_cards ADD COLUMN size TEXT DEFAULT ''`); } catch (_) {}
  const unlinked = db.getAllSync(`SELECT * FROM cost_cards WHERE product_id IS NULL`);
  if (unlinked.length === 0) return;
  const products = db.getAllSync(`SELECT * FROM products`);
  for (const card of unlinked) {
    const cardName = normName(card.name);
    let matched = null;
    for (const p of products) {
      const variants = parseVariantsForProduct(p);
      if (variants.length === 0) {
        if (normName(p.name) === cardName) { matched = { productId: p.id, size: '' }; break; }
      } else {
        for (const v of variants) {
          if (normName(`${p.name} ${v.size}`) === cardName) { matched = { productId: p.id, size: v.size }; break; }
        }
      }
      if (matched) break;
    }
    if (matched) {
      db.runSync(`UPDATE cost_cards SET product_id = ?, size = ? WHERE id = ?`, [matched.productId, matched.size, card.id]);
    }
  }
}

function parseVariantsForProduct(product) {
  try {
    if (product.variants) {
      const parsed = typeof product.variants === 'string' ? JSON.parse(product.variants) : product.variants;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_) {}
  const variants = [];
  if (product.price_s > 0) variants.push({ size: 'S', price: product.price_s });
  if (product.price_m > 0) variants.push({ size: 'M', price: product.price_m });
  if (product.price_l > 0) variants.push({ size: 'L', price: product.price_l });
  return variants;
}

// Техкарты, привязка которых по имени не нашлась — для ручного разбора админом
export function getUnlinkedCostCards() {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM cost_cards WHERE product_id IS NULL ORDER BY name`);
}

// Все техкарты конкретного товара, сгруппированные по размеру ('' — без размера)
export function getCostCardsForProduct(productId) {
  const db = getDb();
  const cards = db.getAllSync(`SELECT * FROM cost_cards WHERE product_id = ?`, [productId]);
  return cards.map(card => ({
    ...card,
    ingredients: db.getAllSync(`SELECT * FROM cost_ingredients WHERE cost_card_id = ?`, [card.id]),
  }));
}

// Сохраняет техкарту для товара+размера: если карта уже есть — заменяет состав,
// если ингредиентов 0 — удаляет карту целиком, иначе создаёт новую.
export function saveCostCardForProductSize(productId, size, ingredients) {
  const db = getDb();
  try { db.execSync(`ALTER TABLE cost_cards ADD COLUMN size TEXT DEFAULT ''`); } catch (_) {}
  const existing = db.getFirstSync(
    `SELECT * FROM cost_cards WHERE product_id = ? AND size = ?`,
    [productId, size || '']
  );

  if (ingredients.length === 0) {
    if (existing) {
      db.runSync(`DELETE FROM cost_ingredients WHERE cost_card_id = ?`, [existing.id]);
      db.runSync(`DELETE FROM cost_cards WHERE id = ?`, [existing.id]);
    }
    return;
  }

  let cardId;
  if (existing) {
    cardId = existing.id;
    db.runSync(`DELETE FROM cost_ingredients WHERE cost_card_id = ?`, [cardId]);
  } else {
    const product = db.getFirstSync(`SELECT * FROM products WHERE id = ?`, [productId]);
    const name = size ? `${product?.name || ''} ${size}` : (product?.name || '');
    const result = db.runSync(
      `INSERT INTO cost_cards (name, product_id, size) VALUES (?, ?, ?)`,
      [name, productId, size || '']
    );
    cardId = result.lastInsertRowId;
  }
  for (const ing of ingredients) {
    db.runSync(
      `INSERT INTO cost_ingredients (cost_card_id, name, amount, unit, price_per_unit) VALUES (?, ?, ?, ?, ?)`,
      [cardId, ing.name, ing.amount, ing.unit, ing.pricePerUnit || 0]
    );
  }
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

export function deleteCostCard(cardId) {
  const db = getDb();
  db.runSync(`DELETE FROM cost_ingredients WHERE cost_card_id = ?`, [cardId]);
  db.runSync(`DELETE FROM cost_cards WHERE id = ?`, [cardId]);
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
export function findCostCardForItem(productId, name, size, variantId) {
  const db = getDb();

  if (variantId) {
    const byVariant = db.getFirstSync(`SELECT * FROM cost_cards WHERE variant_id = ?`, [variantId]);
    if (byVariant) {
      const ingredients = db.getAllSync(`SELECT * FROM cost_ingredients WHERE cost_card_id = ?`, [byVariant.id]);
      return { ...byVariant, ingredients };
    }
  }

  if (productId) {
    const bySize = db.getFirstSync(
      `SELECT * FROM cost_cards WHERE product_id = ? AND size = ?`,
      [productId, size || '']
    );
    if (bySize) {
      const ingredients = db.getAllSync(`SELECT * FROM cost_ingredients WHERE cost_card_id = ?`, [bySize.id]);
      return { ...bySize, ingredients };
    }
  }

  // Резерв: старые техкарты без product_id, сопоставленные только по тексту
  const candidates = [normName(`${name} ${size || ''}`), normName(name)];
  const cards = db.getAllSync(`SELECT * FROM cost_cards WHERE product_id IS NULL AND variant_id IS NULL`);
  const match = cards.find(c => candidates.includes(normName(c.name)));
  if (!match) return null;
  const ingredients = db.getAllSync(`SELECT * FROM cost_ingredients WHERE cost_card_id = ?`, [match.id]);
  return { ...match, ingredients };
}

// Сохраняет техкарту для конкретного варианта товара (универсальная модель, variant_id)
export function saveCostCardForVariant(variantId, ingredients) {
  const db = getDb();
  const existing = db.getFirstSync(`SELECT * FROM cost_cards WHERE variant_id = ?`, [variantId]);

  if (ingredients.length === 0) {
    if (existing) {
      db.runSync(`DELETE FROM cost_ingredients WHERE cost_card_id = ?`, [existing.id]);
      db.runSync(`DELETE FROM cost_cards WHERE id = ?`, [existing.id]);
    }
    return;
  }

  let cardId;
  if (existing) {
    cardId = existing.id;
    db.runSync(`DELETE FROM cost_ingredients WHERE cost_card_id = ?`, [cardId]);
  } else {
    const variant = db.getFirstSync(`SELECT * FROM product_variants WHERE id = ?`, [variantId]);
    const product = variant ? db.getFirstSync(`SELECT * FROM products WHERE id = ?`, [variant.product_id]) : null;
    const name = variant?.label ? `${product?.name || ''} ${variant.label}`.trim() : (product?.name || '');
    const result = db.runSync(
      `INSERT INTO cost_cards (name, variant_id) VALUES (?, ?)`,
      [name, variantId]
    );
    cardId = result.lastInsertRowId;
  }
  for (const ing of ingredients) {
    db.runSync(
      `INSERT INTO cost_ingredients (cost_card_id, name, amount, unit, price_per_unit) VALUES (?, ?, ?, ?, ?)`,
      [cardId, ing.name, ing.amount, ing.unit, ing.pricePerUnit || 0]
    );
  }
}

export function getCostCardForVariant(variantId) {
  const db = getDb();
  const card = db.getFirstSync(`SELECT * FROM cost_cards WHERE variant_id = ?`, [variantId]);
  if (!card) return null;
  const ingredients = db.getAllSync(`SELECT * FROM cost_ingredients WHERE cost_card_id = ?`, [card.id]);
  return { ...card, ingredients };
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

  const card = findCostCardForItem(item.product_id, item.name, item.size, item.variant_id);
  const modifiers = item.modifiers || [];

  if (card) {
    for (const ing of card.ingredients) {
      let targetName = ing.name;
      // Модификатор-замена подменяет ингредиент техкарты, если название группы модификатора
      // совпадает с названием ингредиента (напр. группа "Молоко" → ингредиент техкарты "Молоко")
      const replaceMod = modifiers.find(m => m.ingrToReplace && normName(m.groupName) === normName(ing.name));
      if (replaceMod) targetName = replaceMod.ingrToReplace;
      deductions.push({ stockName: targetName, amount: ing.amount });
    }
  }

  for (const mod of modifiers) {
    if (mod.ingrToDeduct && mod.deductAmount > 0) {
      deductions.push({ stockName: mod.ingrToDeduct, amount: mod.deductAmount });
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
