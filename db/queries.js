import { getDb } from './database';

// ─── Профиль бизнеса ────────────────────────────────────────────────────────

export const BUSINESS_PRESETS = {
  coffee: {
    label: 'Кофейня',
    modules: { stock: true, shifts: true, clients: true, loyalty: true, modifiers: true, inventory: true },
    terms: { item: 'Товар', client: 'Клиент', order: 'Заказ', category: 'Категория' },
    roles: { barista: 'Бариста', admin: 'Администратор' },
    units: ['мл', 'л', 'г', 'кг', 'шт', 'уп', 'пара'],
  },
  retail: {
    label: 'Розница',
    modules: { stock: true, shifts: false, clients: true, loyalty: true, modifiers: false, inventory: true },
    terms: { item: 'Товар', client: 'Покупатель', order: 'Продажа', category: 'Категория' },
    roles: { barista: 'Кассир', admin: 'Управляющий' },
    units: ['шт', 'пара', 'уп', 'м', 'кг'],
  },
  services: {
    label: 'Услуги',
    modules: { stock: false, shifts: true, clients: true, loyalty: true, modifiers: false, inventory: false },
    terms: { item: 'Услуга', client: 'Клиент', order: 'Заказ', category: 'Категория' },
    roles: { barista: 'Мастер', admin: 'Администратор' },
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
    modules:        safeParse(row.modules,        {}),
    terms:          safeParse(row.terms,          {}),
    roles:          safeParse(row.roles,          {}),
    units:          safeParse(row.units,          []),
    loyalty_config: safeParse(row.loyalty_config, {}),
  };
}

const DEFAULT_TERMS = { item: 'Товар', client: 'Клиент', order: 'Заказ', category: 'Категория' };
const DEFAULT_ROLES = { barista: 'Сотрудник', admin: 'Администратор' };

// Простое склонение существительного во множественное число (для терминов,
// которые владелец бизнеса может задать произвольно — "Товар", "Продажа", "Услуга" и т.д.)
export function pluralizeRu(word) {
  if (!word) return word;
  const last = word.slice(-1);
  const lower = last.toLowerCase();
  if (lower === 'а' || lower === 'я' || lower === 'ь') return word.slice(0, -1) + 'и';
  if ('гкхшщчж'.includes(lower)) return word + 'и';
  return word + 'ы';
}

// Родительный падеж множественного числа (для фраз вида "История заказов", "Нет клиентов")
export function genitivePluralRu(word) {
  if (!word) return word;
  const last = word.slice(-1).toLowerCase();
  if (last === 'а') return word.slice(0, -1);
  if (last === 'я') return word.slice(0, -1) + 'й';
  if (last === 'ь') return word.slice(0, -1) + 'ей';
  if ('жшчщ'.includes(last)) return word + 'ей';
  return word + 'ов';
}

// Родительный падеж единственного числа (для фраз вида "вариант товара", "карточка клиента")
export function genitiveSingularRu(word) {
  if (!word) return word;
  const last = word.slice(-1).toLowerCase();
  if (last === 'а' || last === 'я') return word.slice(0, -1) + 'и';
  if (last === 'ь') return word.slice(0, -1) + 'я';
  return word + 'а';
}

export function getTerms() {
  const profile = getBusinessProfile();
  const terms = profile?.terms || {};
  return {
    item: terms.item || DEFAULT_TERMS.item,
    client: terms.client || DEFAULT_TERMS.client,
    order: terms.order || DEFAULT_TERMS.order,
    category: terms.category || DEFAULT_TERMS.category,
  };
}

// Возвращает отображаемые названия ролей из профиля бизнеса.
// 'barista' / 'admin' — внутренние ключи прав доступа (неизменны).
// Значения — что показывается: "Бариста", "Кассир", "Мастер" и т.д.
export function getRoleNames() {
  const profile = getBusinessProfile();
  const roles = profile?.roles || {};
  return {
    barista: roles.barista || DEFAULT_ROLES.barista,
    admin:   roles.admin   || DEFAULT_ROLES.admin,
  };
}

// ─── Лояльность ────────────────────────────────────────────────────────────

// Конфиги по умолчанию для каждой модели
const DEFAULT_LOYALTY_CONFIGS = {
  points:       { earn_pct: 10, allow_spend: false, point_value: 1, max_spend_pct: 50, max_discount_pct: 100 },
  discount:     { pct: 5, max_discount_pct: 100 },
  subscription: { deduct_per_visit: 1, max_discount_pct: 100 },
};

// Возвращает {model, config} из профиля бизнеса
export function getLoyaltyConfig() {
  const profile = getBusinessProfile();
  const model = profile?.loyalty_model || 'points';
  const rawConfig = profile?.loyalty_config || {};
  const defaults = DEFAULT_LOYALTY_CONFIGS[model] || {};
  return { model, config: { ...defaults, ...rawConfig } };
}

// Сохраняет модель лояльности и её конфиг
export function updateLoyaltyConfig(model, config) {
  const db = getDb();
  const existing = db.getFirstSync(`SELECT id FROM business_profile ORDER BY id LIMIT 1`);
  if (existing) {
    db.runSync(
      `UPDATE business_profile SET loyalty_model = ?, loyalty_config = ? WHERE id = ?`,
      [model, JSON.stringify(config || {}), existing.id]
    );
  }
}

// Добавляет посещения (абонемент) — продаёт посещения клиенту (действие администратора)
export function addSubscriptionVisits(client_id, count) {
  const db = getDb();
  db.runSync(`UPDATE clients SET balance = balance + ? WHERE id = ?`, [count, client_id]);
}

// Списывает баллы у клиента (модель points, allow_spend).
// Возвращает реально списанную сумму (не больше баланса).
export function spendPoints(client_id, points) {
  const db = getDb();
  const client = db.getFirstSync(`SELECT balance FROM clients WHERE id = ?`, [client_id]);
  const available = client?.balance || 0;
  const spend = Math.min(Math.round(points), Math.floor(available));
  if (spend > 0) {
    db.runSync(`UPDATE clients SET balance = balance - ? WHERE id = ?`, [spend, client_id]);
  }
  return spend;
}

export function updateBusinessProfile({ businessName, modules, terms, roles, units, accessKey,
  logoBase64, phone, address, city, workHoursFrom, workHoursTo, inn, preset,
  receiptName, receiptFooter, currency, dateFormat,
  email, whatsapp, telegram, instagram, vk, website, theme }) {
  const db = getDb();
  const cols = ['logo_base64','phone','address','city','work_hours_from','work_hours_to','inn','preset',
    'receipt_name','receipt_footer','currency','date_format','email','whatsapp','telegram','instagram','vk','website','theme'];
  for (const col of cols) {
    try { db.execSync(`ALTER TABLE business_profile ADD COLUMN ${col} TEXT DEFAULT ''`); } catch (_) {}
  }
  const existing = db.getFirstSync(`SELECT id FROM business_profile ORDER BY id LIMIT 1`);
  const payload = [
    businessName    ?? '',
    JSON.stringify(modules || {}),
    JSON.stringify(terms   || {}),
    JSON.stringify(roles   || {}),
    JSON.stringify(units   || []),
    accessKey       ?? '',
    logoBase64      ?? '',
    phone           ?? '',
    address         ?? '',
    city            ?? '',
    workHoursFrom   ?? '',
    workHoursTo     ?? '',
    inn             ?? '',
    preset          ?? '',
    receiptName     ?? '',
    receiptFooter   ?? '',
    currency        ?? '₽',
    dateFormat      ?? 'DD.MM.YYYY',
    email           ?? '',
    whatsapp        ?? '',
    telegram        ?? '',
    instagram       ?? '',
    vk              ?? '',
    website         ?? '',
    theme           ?? 'dark',
  ];
  const fields = `business_name=?,modules=?,terms=?,roles=?,units=?,access_key=?,
    logo_base64=?,phone=?,address=?,city=?,work_hours_from=?,work_hours_to=?,inn=?,preset=?,
    receipt_name=?,receipt_footer=?,currency=?,date_format=?,email=?,whatsapp=?,telegram=?,instagram=?,vk=?,website=?,theme=?`;
  if (existing) {
    db.runSync(`UPDATE business_profile SET ${fields} WHERE id=?`, [...payload, existing.id]);
  } else {
    db.runSync(
      `INSERT INTO business_profile (business_name,modules,terms,roles,units,access_key,
        logo_base64,phone,address,city,work_hours_from,work_hours_to,inn,preset,
        receipt_name,receipt_footer,currency,date_format,email,whatsapp,telegram,instagram,vk,website,theme)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
  const payload = [presetKey, JSON.stringify(preset.modules), JSON.stringify(preset.terms), JSON.stringify(preset.roles || {}), JSON.stringify(preset.units)];
  if (existing) {
    db.runSync(`UPDATE business_profile SET preset = ?, modules = ?, terms = ?, roles = ?, units = ? WHERE id = ?`, [...payload, existing.id]);
  } else {
    db.runSync(`INSERT INTO business_profile (preset, modules, terms, roles, units) VALUES (?, ?, ?, ?, ?)`, payload);
  }
}

// ─── Товары: произвольные оси вариативности ───────────────────────────────

// Возвращает оси товара с их значениями (для редактора в UI)
// Формат: [{id, name, position, values: [{id, label, position}]}]
export function getProductAxesWithValues(productId) {
  const db = getDb();
  const axes = db.getAllSync(
    `SELECT * FROM product_axes WHERE product_id = ? ORDER BY position`,
    [productId]
  );
  return axes.map(axis => ({
    ...axis,
    values: db.getAllSync(
      `SELECT * FROM axis_values WHERE axis_id = ? ORDER BY position`,
      [axis.id]
    ),
  }));
}

// Оставляем для обратной совместимости с кодом, который не нуждается в values
export function getProductAxes(productId) {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM product_axes WHERE product_id = ? ORDER BY position`, [productId]);
}

export function getProductVariants(productId) {
  const db = getDb();
  const rows = db.getAllSync(`SELECT * FROM product_variants WHERE product_id = ? ORDER BY id`, [productId]);
  // axisValues: {axisId: valueId} — ссылки на axis_values.id
  return rows.map(r => ({ ...r, axisValues: safeParse(r.axis_values, {}) }));
}

// Все активные варианты с непустым SKU — для поиска в кассе
export function getAllVariantsWithSku() {
  const db = getDb();
  return db.getAllSync(`SELECT product_id, sku FROM product_variants WHERE sku != '' AND active = 1`);
}

export function getProductVariantById(id) {
  const db = getDb();
  const row = db.getFirstSync(`SELECT * FROM product_variants WHERE id = ?`, [id]);
  if (!row) return null;
  return { ...row, axisValues: safeParse(row.axis_values, {}) };
}

// Полностью заменяет оси, значения осей и варианты товара.
//
// axes: [{id?, name, values: [{id?, label}]}]
//   id — реальный ID из БД (если уже существовало), иначе отсутствует → insert
//
// variants: [{id?, label, price, sku, active, axisValues: {axisId: valueId}}]
//
// Возвращает {axes (с реальными id и values), variants (с реальными id)}
export function saveProductAxesAndVariants(productId, axes, variants) {
  const db = getDb();

  // 1. Удаляем оси, которых нет в новом наборе
  const dbAxisIds = db.getAllSync(
    `SELECT id FROM product_axes WHERE product_id = ?`, [productId]
  ).map(r => r.id);
  const keepAxisIds = (axes || []).filter(a => a.id).map(a => a.id);
  for (const axisId of dbAxisIds.filter(id => !keepAxisIds.includes(id))) {
    db.runSync(`DELETE FROM axis_values WHERE axis_id = ?`, [axisId]);
    db.runSync(`DELETE FROM product_axes WHERE id = ?`, [axisId]);
  }

  // 2. Сохраняем оси и их значения
  // uidToRealId строит маппинг: временный _uid (строка) или числовой id → реальный integer id
  // Нужно для перевода axisValues в вариантах из {_uid: _uid} в {realId: realId}
  const uidToRealId = {};
  const savedAxes = [];

  for (let ai = 0; ai < (axes || []).length; ai++) {
    const axis = axes[ai];
    let axisId;
    if (axis.id) {
      db.runSync(
        `UPDATE product_axes SET name = ?, position = ? WHERE id = ?`,
        [axis.name, ai, axis.id]
      );
      axisId = axis.id;
    } else {
      const res = db.runSync(
        `INSERT INTO product_axes (product_id, name, position) VALUES (?, ?, ?)`,
        [productId, axis.name, ai]
      );
      axisId = res.lastInsertRowId;
    }
    // Маппируем как _uid → realId, так и String(realId) → realId (для идемпотентности)
    if (axis._uid) uidToRealId[axis._uid] = axisId;
    uidToRealId[String(axisId)] = axisId;

    // Значения оси
    const dbValueIds = db.getAllSync(
      `SELECT id FROM axis_values WHERE axis_id = ?`, [axisId]
    ).map(r => r.id);
    const keepValueIds = (axis.values || []).filter(v => v.id).map(v => v.id);
    for (const vid of dbValueIds.filter(id => !keepValueIds.includes(id))) {
      db.runSync(`DELETE FROM axis_values WHERE id = ?`, [vid]);
    }

    const savedValues = [];
    for (let vi = 0; vi < (axis.values || []).length; vi++) {
      const val = axis.values[vi];
      let valueId;
      if (val.id) {
        db.runSync(
          `UPDATE axis_values SET label = ?, position = ? WHERE id = ?`,
          [val.label, vi, val.id]
        );
        valueId = val.id;
      } else {
        const res = db.runSync(
          `INSERT INTO axis_values (axis_id, label, position) VALUES (?, ?, ?)`,
          [axisId, val.label, vi]
        );
        valueId = res.lastInsertRowId;
      }
      if (val._uid) uidToRealId[val._uid] = valueId;
      uidToRealId[String(valueId)] = valueId;
      savedValues.push({ id: valueId, label: val.label, position: vi });
    }
    savedAxes.push({ id: axisId, name: axis.name, position: ai, values: savedValues });
  }

  // 3. Сохраняем варианты, перемаппируя axisValues через uidToRealId
  const dbVariantIds = db.getAllSync(
    `SELECT id FROM product_variants WHERE product_id = ?`, [productId]
  ).map(r => r.id);
  const keepVariantIds = (variants || []).filter(v => v.id).map(v => v.id);
  for (const vid of dbVariantIds.filter(id => !keepVariantIds.includes(id))) {
    db.runSync(`DELETE FROM product_variants WHERE id = ?`, [vid]);
  }

  const savedVariants = [];
  for (const v of (variants || [])) {
    // Перемаппируем {_uid|id: _uid|id} → {realAxisId: realValueId}
    const remappedAV = {};
    for (const [aKey, vKey] of Object.entries(v.axisValues || {})) {
      const realAxisId = uidToRealId[String(aKey)];
      const realValueId = uidToRealId[String(vKey)];
      if (realAxisId != null && realValueId != null) {
        remappedAV[realAxisId] = realValueId;
      }
    }
    const axisValuesJson = JSON.stringify(remappedAV);
    if (v.id) {
      db.runSync(
        `UPDATE product_variants SET axis_values = ?, label = ?, price = ?, sku = ?, active = ? WHERE id = ?`,
        [axisValuesJson, v.label || '', v.price || 0, v.sku || '', v.active === false ? 0 : 1, v.id]
      );
      savedVariants.push({ ...v, id: v.id });
    } else {
      const res = db.runSync(
        `INSERT INTO product_variants (product_id, axis_values, label, price, sku, active) VALUES (?, ?, ?, ?, ?, ?)`,
        [productId, axisValuesJson, v.label || '', v.price || 0, v.sku || '', v.active === false ? 0 : 1]
      );
      savedVariants.push({ ...v, id: res.lastInsertRowId });
    }
  }

  return { axes: savedAxes, variants: savedVariants };
}

export function deleteProductVariants(productId) {
  const db = getDb();
  const axisIds = db.getAllSync(
    `SELECT id FROM product_axes WHERE product_id = ?`, [productId]
  ).map(r => r.id);
  for (const axisId of axisIds) {
    db.runSync(`DELETE FROM axis_values WHERE axis_id = ?`, [axisId]);
  }
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

// Способы оплаты — хранятся в app_settings как JSON-массив объектов.
// type: 'cash' | 'card' | 'mixed'
// 'cash'  — считается наличными в отчётах
// 'card'  — считается безналичным (карта/QR/перевод и т.д.)
// 'mixed' — особый: показывает UI разделения суммы наличные+карта

const DEFAULT_PAY_METHODS = [
  { id: 'cash',  name: 'Наличные',  icon: '💵', type: 'cash',  active: true },
  { id: 'card',  name: 'Карта',     icon: '💳', type: 'card',  active: true },
  { id: 'qr',    name: 'QR / СБП',  icon: '📱', type: 'card',  active: true },
  { id: 'mixed', name: 'Смешанная', icon: '💰', type: 'mixed', active: true },
];

export function getPayMethods() {
  const raw = getSetting('payMethodsV2');
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (_) {}
  return DEFAULT_PAY_METHODS;
}

export function savePayMethods(methods) {
  setSetting('payMethodsV2', JSON.stringify(methods));
}

// Для отчётов: суммируем заказы по типу метода (cash/card/mixed)
// method_type — новое поле; для старых заказов (пустое) определяем по имени
function resolveMethodType(order, payMethods) {
  if (order.method_type) return order.method_type;
  const found = payMethods.find(m => m.name === order.method || m.id === order.method);
  if (found) return found.type;
  // fallback: исторические имена
  if (order.method === 'Наличные' || order.method === 'Наличка') return 'cash';
  if (order.method === 'Смешанная') return 'mixed';
  return 'card';
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
  // Только активные сотрудники могут войти
  return db.getFirstSync(`SELECT * FROM users WHERE pin = ? AND active != 0`, [pin]) || null;
}

export function getUsers() {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM users WHERE active != 0 ORDER BY role DESC, name`);
}

export function getAllUsers() {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM users ORDER BY role DESC, name, active DESC`);
}

// Добавляет нового сотрудника. Возвращает {ok, error}
export function addUser(name, pin, role, salaryType = 'shift', salaryAmount = 0) {
  const db = getDb();
  if (!name?.trim()) return { ok: false, error: 'Укажите имя сотрудника' };
  if (!pin?.trim() || pin.trim().length < 4) return { ok: false, error: 'PIN — минимум 4 цифры' };
  const exists = db.getFirstSync(`SELECT id FROM users WHERE pin = ?`, [pin.trim()]);
  if (exists) return { ok: false, error: 'Этот PIN уже используется' };
  db.runSync(`INSERT INTO users (name, pin, role, active, salary_type, salary_amount) VALUES (?, ?, ?, 1, ?, ?)`, [name.trim(), pin.trim(), role, salaryType, salaryAmount]);
  return { ok: true };
}

// Обновляет сотрудника. Возвращает {ok, error}
export function updateUser(id, name, pin, role, salaryType = 'shift', salaryAmount = 0) {
  const db = getDb();
  if (!name?.trim()) return { ok: false, error: 'Укажите имя сотрудника' };
  if (!pin?.trim() || pin.trim().length < 4) return { ok: false, error: 'PIN — минимум 4 цифры' };
  const exists = db.getFirstSync(`SELECT id FROM users WHERE pin = ? AND id != ?`, [pin.trim(), id]);
  if (exists) return { ok: false, error: 'Этот PIN уже занят другим сотрудником' };
  db.runSync(`UPDATE users SET name = ?, pin = ?, role = ?, salary_type = ?, salary_amount = ? WHERE id = ?`, [name.trim(), pin.trim(), role, salaryType, salaryAmount, id]);
  return { ok: true };
}

// Мягкое удаление/восстановление. Нельзя деактивировать последнего активного админа.
export function toggleUserActive(id) {
  const db = getDb();
  const user = db.getFirstSync(`SELECT * FROM users WHERE id = ?`, [id]);
  if (!user) return { ok: false, error: 'Сотрудник не найден' };
  if (user.active && user.role === 'admin') {
    const adminCount = db.getFirstSync(`SELECT COUNT(*) as n FROM users WHERE role='admin' AND active != 0`);
    if ((adminCount?.n || 0) <= 1) return { ok: false, error: 'Нельзя деактивировать единственного администратора' };
  }
  db.runSync(`UPDATE users SET active = ? WHERE id = ?`, [user.active ? 0 : 1, id]);
  return { ok: true };
}

// Оставляем для обратной совместимости (Settings → EmployeesScreen заменяет эту логику)
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
  return db.getAllSync(`
    SELECT p.*,
      (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id) as variant_count,
      (SELECT COUNT(*) FROM cost_cards cc WHERE cc.product_id = p.id) as cost_card_count,
      (SELECT MIN(pv.price) FROM product_variants pv WHERE pv.product_id = p.id AND pv.price > 0) as min_price
    FROM products p
    ORDER BY p.category, p.name
  `).map(p => {
    // Считаем себестоимость из техкарт
    try {
      const db = getDb();
      // Считаем через variant_id — согласованно с UI модалки
      const varIds = db.getAllSync(`SELECT id FROM product_variants WHERE product_id = ?`, [p.id]).map(r => r.id);
      let cost = 0;
      for (const vid of varIds) {
        const card = db.getFirstSync(`SELECT id FROM cost_cards WHERE variant_id = ?`, [vid]);
        if (!card) continue;
        const rows = db.getAllSync(
          `SELECT amount, price_per_unit FROM cost_ingredients WHERE cost_card_id = ? AND amount > 0 AND price_per_unit > 0`,
          [card.id]
        );
        cost += rows.reduce((s, i) => s + i.amount * i.price_per_unit, 0);
      }
      return { ...p, avg_cost: Math.round(cost * 100) / 100 };
    } catch(_) { return { ...p, avg_cost: 0 }; }
  });
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

export function createOrder({ total, method, methodType, shift_id, client_id, cashier_id, items, cashAmount, cardAmount, discountPct, locationId, note, zone }) {
  const db = getDb();
  const now = new Date().toISOString();

  try { db.execSync(`ALTER TABLE orders ADD COLUMN cash_amount REAL DEFAULT 0`); } catch (_) {}
  try { db.execSync(`ALTER TABLE orders ADD COLUMN card_amount REAL DEFAULT 0`); } catch (_) {}
  try { db.execSync(`ALTER TABLE orders ADD COLUMN discount_pct REAL DEFAULT 0`); } catch (_) {}
  try { db.execSync(`ALTER TABLE orders ADD COLUMN cashier_id INTEGER DEFAULT NULL`); } catch (_) {}

  const result = db.runSync(
    `INSERT INTO orders (created_at, total, method, method_type, shift_id, client_id, cashier_id, cash_amount, card_amount, discount_pct, note, zone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [now, total, method, methodType || '', shift_id || null, client_id || null, cashier_id || null, cashAmount || 0, cardAmount || 0, discountPct || 0, note || '', zone || '']
  );
  const orderId = result.lastInsertRowId;

  const stockWarnings = [];
  for (const item of items) {
    // size/milk/syrup оставлены для обратной совместимости отображения в Продажах;
    // размер варианта дублируется в size как читаемая метка, модификаторы — в JSON
    const itemResult = db.runSync(
      `INSERT INTO order_items (order_id, product_id, variant_id, name, size, milk, syrup, price, modifiers, quantity, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId, item.product_id || null, item.variant_id || null, item.name,
        item.size || '', item.milk || '', item.syrup || '', item.price,
        JSON.stringify(item.modifiers || []), item.quantity || 1, item.note || '',
      ]
    );
    try {
      const warnings = deductStockForOrderItem(itemResult.lastInsertRowId, item, locationId || null);
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

export function insertClient({ fio, phone, code, birth_date }) {
  const db = getDb();
  const now = new Date().toISOString();
  db.runSync(
    `INSERT INTO clients (fio, phone, code, balance, visits, total_sum, created_at) VALUES (?, ?, ?, 0, 0, 0, ?)`,
    [fio, phone || '', code, now]
  );
  // birth_date сохраняем отдельным UPDATE (на случай если колонки ещё нет)
  if (birth_date) {
    try {
      const c = db.getFirstSync(`SELECT id FROM clients WHERE code = ?`, [code]);
      if (c) db.runSync(`UPDATE clients SET birth_date = ? WHERE id = ?`, [birth_date, c.id]);
    } catch (_) {}
  }
}

export function updateClient(id, { fio, phone, balance, discount_pct, birth_date }) {
  const db = getDb();
  db.runSync(
    `UPDATE clients SET fio = ?, phone = ?, balance = ?, discount_pct = ?, birth_date = ? WHERE id = ?`,
    [fio, phone, balance, discount_pct ?? 0, birth_date || '', id]
  );
}

export function checkSubscriptionBalance(client_id) {
  const db = getDb();
  const { model } = getLoyaltyConfig();
  if (model !== 'subscription') return { ok: true };
  const client = db.getFirstSync(`SELECT balance FROM clients WHERE id = ?`, [client_id]);
  const balance = client?.balance || 0;
  return { ok: balance > 0, balance };
}

export function addClientVisit(client_id, amount) {
  const db = getDb();
  const { model, config } = getLoyaltyConfig();

  if (model === 'points') {
    const earnPct = config.earn_pct ?? 10;
    const points  = Math.round(amount * earnPct / 100);
    db.runSync(
      `UPDATE clients SET visits = visits + 1, total_sum = total_sum + ?, balance = balance + ? WHERE id = ?`,
      [amount, points, client_id]
    );
    return { model, pointsEarned: points };
  }

  if (model === 'subscription') {
    const deduct = config.deduct_per_visit ?? 1;
    const client = db.getFirstSync(`SELECT balance FROM clients WHERE id = ?`, [client_id]);
    const newBalance = Math.max(0, (client?.balance || 0) - deduct);
    db.runSync(
      `UPDATE clients SET visits = visits + 1, total_sum = total_sum + ?, balance = ? WHERE id = ?`,
      [amount, newBalance, client_id]
    );
    return { model, visitsRemaining: newBalance };
  }

  // discount и любые другие — только счётчик посещений, баланс не трогаем
  db.runSync(
    `UPDATE clients SET visits = visits + 1, total_sum = total_sum + ? WHERE id = ?`,
    [amount, client_id]
  );
  return { model };
}

// ─── Смены ────────────────────────────────────────────────────────────────

export function openShift(cashOpen = 0, userId = null, employeeName = '') {
  const db = getDb();
  const now = new Date().toISOString();
  try { db.execSync(`ALTER TABLE shifts ADD COLUMN cash_open REAL DEFAULT 0`); } catch (_) {}
  const existing = db.getFirstSync(`SELECT * FROM shifts WHERE status='open' ORDER BY opened_at DESC LIMIT 1`);
  if (existing) return existing.id;
  return db.runSync(
    `INSERT INTO shifts (opened_at, status, cash_open, user_id, employee_name) VALUES (?, 'open', ?, ?, ?)`,
    [now, cashOpen, userId || null, employeeName || '']
  ).lastInsertRowId;
}

export function closeShift(shift_id) {
  const db = getDb();
  const now = new Date().toISOString();
  // Считаем по method_type (новые заказы) + fallback по method (старые)
  const totals = db.getFirstSync(
    `SELECT
       SUM(CASE
         WHEN method_type = 'cash' THEN total
         WHEN (method_type IS NULL OR method_type = '') AND (method = 'Наличные') THEN total
         WHEN method_type = 'mixed' THEN COALESCE(cash_amount, 0)
         ELSE 0 END) as cash_total,
       SUM(CASE
         WHEN method_type = 'card' THEN total
         WHEN (method_type IS NULL OR method_type = '') AND (method != 'Наличные') THEN total
         WHEN method_type = 'mixed' THEN COALESCE(card_amount, 0)
         ELSE 0 END) as card_total,
       SUM(total) as total_revenue,
       COUNT(*) as order_count
     FROM orders WHERE shift_id = ? AND (status IS NULL OR status != 'returned')`,
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

// updateMaxOstatok вызывается после addPurchase автоматически внутри
export function updateStockThreshold(id, threshold) {
  const db = getDb();
  db.runSync(`UPDATE stock SET порог = ? WHERE id = ?`, [threshold, id]);
}

// ─── Модуль локаций ────────────────────────────────────────────────────────

export function getLocations() {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM locations WHERE active = 1 ORDER BY id`);
}

export function addLocation(name, description = '') {
  const db = getDb();
  const res = db.runSync(
    `INSERT INTO locations (name, description, active) VALUES (?, ?, 1)`,
    [name, description]
  );
  return res.lastInsertRowId;
}

export function updateLocation(id, name, description = '') {
  const db = getDb();
  db.runSync(`UPDATE locations SET name = ?, description = ? WHERE id = ?`, [name, description, id]);
}

export function deleteLocation(id) {
  const db = getDb();
  // Мягкое удаление — помечаем неактивной, данные остаются
  db.runSync(`UPDATE locations SET active = 0 WHERE id = ?`, [id]);
}

// Все позиции склада с остатком для конкретной локации (0 если записи нет)
export function getStockForLocation(locationId) {
  const db = getDb();
  return db.getAllSync(`
    SELECT s.*, COALESCE(sbl.остаток, 0) AS остаток_loc
    FROM stock s
    LEFT JOIN stock_by_location sbl
      ON sbl.stock_id = s.id AND sbl.location_id = ?
    ORDER BY s.category, s.name
  `, [locationId]).map(row => ({
    ...row,
    'остаток': row['остаток_loc'],  // для единообразия с остальным кодом
  }));
}

// Устанавливает остаток для позиции в конкретной локации (upsert)
export function setStockForLocation(stockId, locationId, amount) {
  const db = getDb();
  db.runSync(`
    INSERT INTO stock_by_location (stock_id, location_id, остаток)
    VALUES (?, ?, ?)
    ON CONFLICT(stock_id, location_id) DO UPDATE SET остаток = excluded.остаток
  `, [stockId, locationId, amount]);
}

// Изменяет остаток для позиции в конкретной локации на delta (+ поступление / - списание)
export function adjustStockForLocation(stockId, locationId, delta) {
  const db = getDb();
  // Создаём запись с 0 если её нет, потом прибавляем delta
  db.runSync(`
    INSERT INTO stock_by_location (stock_id, location_id, остаток)
    VALUES (?, ?, ?)
    ON CONFLICT(stock_id, location_id) DO UPDATE SET остаток = остаток + excluded.остаток
  `, [stockId, locationId, delta]);
}

// Сумма остатков по всем локациям для каждой позиции (для сводного вида)
export function getAllStockWithLocationTotals() {
  const db = getDb();
  return db.getAllSync(`
    SELECT s.*,
      COALESCE(SUM(sbl.остаток), 0) AS остаток_total
    FROM stock s
    LEFT JOIN stock_by_location sbl ON sbl.stock_id = s.id
    GROUP BY s.id
    ORDER BY s.category, s.name
  `).map(row => ({ ...row, 'остаток': row['остаток_total'] }));
}

// Инициализирует первую локацию "Основной склад" если локаций ещё нет
// (вызывается при первом включении модуля)
export function initDefaultLocation() {
  const db = getDb();
  const existing = db.getAllSync(`SELECT id FROM locations LIMIT 1`);
  if (existing.length === 0) {
    const res = db.runSync(
      `INSERT INTO locations (name, description, active) VALUES (?, ?, 1)`,
      ['Основной склад', '']
    );
    return res.lastInsertRowId;
  }
  return existing[0].id;
}

// ─── Себестоимость ────────────────────────────────────────────────────────

export function getAllCostCards() {
  const db = getDb();
  try { db.execSync(`ALTER TABLE cost_cards ADD COLUMN size TEXT DEFAULT ''`); } catch (_) {}
  const cards = db.getAllSync(
    `SELECT cc.*, COALESCE(p.category, '') as product_category
     FROM cost_cards cc
     LEFT JOIN products p ON cc.product_id = p.id
     ORDER BY COALESCE(p.category, ''), cc.name`
  );
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
  const payMethods = getPayMethods();
  const cash = orders.filter(o => resolveMethodType(o, payMethods) === 'cash').reduce((s, o) => s + o.total, 0);
  const card = orders.filter(o => resolveMethodType(o, payMethods) === 'card').reduce((s, o) => s + o.total, 0);
  const qr   = 0; // QR теперь входит в card (тип 'card'), оставлено для совместимости
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
    employeeName: shift.employee_name || '',
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
export function refreshCostCardPrices() {
  // Обновляет price_per_unit в cost_ingredients из avg_price склада
  const db = getDb();
  try {
    const ings = db.getAllSync(`SELECT ci.id, ci.name, ci.unit FROM cost_ingredients ci WHERE ci.price_per_unit = 0 OR ci.price_per_unit IS NULL`);
    for (const ing of ings) {
      const stock = db.getFirstSync(
        `SELECT avg_price, last_price FROM stock WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))`,
        [ing.name]
      );
      const price = stock?.avg_price || stock?.last_price || 0;
      if (price > 0) {
        db.runSync(`UPDATE cost_ingredients SET price_per_unit = ? WHERE id = ?`, [price, ing.id]);
      }
    }
  } catch (e) { console.error('refreshCostCardPrices', e); }
}

export function deleteOldCostCards() {
  // Удаляет техкарты без variant_id (старый формат от веб-версии)
  const db = getDb();
  try {
    const old = db.getAllSync(`SELECT id FROM cost_cards WHERE variant_id IS NULL OR variant_id = 0`);
    for (const c of old) {
      db.runSync(`DELETE FROM cost_ingredients WHERE cost_card_id = ?`, [c.id]);
      db.runSync(`DELETE FROM cost_cards WHERE id = ?`, [c.id]);
    }
    console.log(`[CLEANUP] Удалено старых техкарт: ${old.length}`);
  } catch (e) { console.error(e); }
}

export function cleanOrphanCostIngredients() {
  // Удаляем cost_ingredients без цены у которых техкарта есть но ингредиент не добавлен пользователем
  const db = getDb();
  try {
    // Оставляем только записи где amount > 0
    db.runSync(`DELETE FROM cost_ingredients WHERE amount IS NULL OR amount <= 0`);
  } catch (_) {}
}

export function fixCostCardLinks() {
  // Одноразовая миграция: для карт с variant_id но без product_id — проставляем product_id
  const db = getDb();
  try {
    const orphans = db.getAllSync(`SELECT cc.id, pv.product_id FROM cost_cards cc JOIN product_variants pv ON cc.variant_id = pv.id WHERE cc.product_id IS NULL AND cc.variant_id IS NOT NULL`);
    for (const row of orphans) {
      db.runSync(`UPDATE cost_cards SET product_id = ? WHERE id = ?`, [row.product_id, row.id]);
    }
  } catch (_) {}
}

export function saveCostCardForVariant(variantId, ingredients) {
  const db = getDb();
  // Получаем product_id из варианта
  const variant = db.getFirstSync(`SELECT product_id FROM product_variants WHERE id = ?`, [variantId]);
  const productId = variant?.product_id || null;
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
      `INSERT INTO cost_cards (name, variant_id, product_id) VALUES (?, ?, ?)`,
      [name, variantId, product?.id || null]
    );
    cardId = result.lastInsertRowId;
  }
  for (const ing of ingredients) {
    db.runSync(
      `INSERT INTO cost_ingredients (cost_card_id, name, amount, unit, price_per_unit, factor) VALUES (?, ?, ?, ?, ?, ?)`,
      [cardId, ing.name, ing.amount, ing.unit, ing.pricePerUnit || 0, ing.factor ?? 1]
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
export function deductStockForOrderItem(orderItemId, item, locationId = null) {
  initStockDeductionSchema();
  const db = getDb();
  const warnings = [];
  const deductions = [];

  const card = findCostCardForItem(item.product_id, item.name, item.size, item.variant_id);
  const modifiers = item.modifiers || [];

  if (card) {
    for (const ing of card.ingredients) {
      let targetName = ing.name;
      const replaceMod = modifiers.find(m => m.ingrToReplace && normName(m.groupName) === normName(ing.name));
      if (replaceMod) targetName = replaceMod.ingrToReplace;
      deductions.push({ stockName: targetName, amount: ing.amount, factor: ing.factor ?? 1 });
    }
  }

  for (const mod of modifiers) {
    if (mod.ingrToDeduct && mod.deductAmount > 0) {
      deductions.push({ stockName: mod.ingrToDeduct, amount: mod.deductAmount, factor: 1 });
    }
  }

  for (const d of deductions) {
    const stockRow = findStockByName(d.stockName);
    if (!stockRow) continue;
    const deductAmt = d.amount * (d.factor ?? 1) * (item.quantity || 1);

    if (locationId) {
      // Модуль локаций включён — списываем из конкретной локации
      const locRow = db.getFirstSync(
        `SELECT остаток FROM stock_by_location WHERE stock_id = ? AND location_id = ?`,
        [stockRow.id, locationId]
      );
      const currentLoc = locRow ? locRow['остаток'] : 0;
      const newLoc = currentLoc - deductAmt;
      db.runSync(`
        INSERT INTO stock_by_location (stock_id, location_id, остаток)
        VALUES (?, ?, ?)
        ON CONFLICT(stock_id, location_id) DO UPDATE SET остаток = excluded.остаток
      `, [stockRow.id, locationId, newLoc]);
      if (newLoc < 0) {
        warnings.push({ name: stockRow.name, amount: newLoc, unit: stockRow.unit });
      }
    } else {
      // Модуль локаций выключен — списываем из общего остатка (stock.остаток)
      const newAmount = (stockRow['остаток'] || 0) - deductAmt;
      db.runSync(`UPDATE stock SET остаток = ? WHERE id = ?`, [newAmount, stockRow.id]);
      if (newAmount < 0) {
        warnings.push({ name: stockRow.name, amount: newAmount, unit: stockRow.unit });
      }
    }

    db.runSync(
      `INSERT INTO stock_deductions (order_item_id, stock_name, amount) VALUES (?, ?, ?)`,
      [orderItemId, stockRow.name, deductAmt]
    );
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

// Обновляет исторический максимум остатка
export function updateMaxOstatok(stockId) {
  const db = getDb();
  try {
    db.runSync(
      `UPDATE stock SET max_ostatok = MAX(max_ostatok, остаток) WHERE id = ?`,
      [stockId]
    );
  } catch (_) {}
}

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

// ─── Инвентаризация ─────────────────────────────────────────────────────────

// Средняя себестоимость по последним N закупкам (взвешенная по объёму)
export function getAvgCostLast10(stockName, count = 10) {
  const db = getDb();
  try {
    initPurchasesTable();
    const rows = db.getAllSync(
      `SELECT qty, price_per_unit FROM purchases
       WHERE LOWER(stock_name) = LOWER(?) ORDER BY created_at DESC LIMIT ?`,
      [stockName, count]
    );
    if (rows.length === 0) {
      // Fallback: avg_price из stock
      const s = db.getFirstSync(`SELECT avg_price FROM stock WHERE LOWER(name) = LOWER(?)`, [stockName]);
      return s?.avg_price || 0;
    }
    const totalQty = rows.reduce((s, r) => s + r.qty, 0);
    const totalSum = rows.reduce((s, r) => s + r.qty * r.price_per_unit, 0);
    return totalQty > 0 ? Math.round((totalSum / totalQty) * 100) / 100 : 0;
  } catch (_) { return 0; }
}

// Создаёт черновой акт инвентаризации.
// scope: 'all' | 'category' | 'manual'
// scopeValue: '' | 'Кофе' | '1,2,5' (id через запятую)
// locationId: null | integer
// Возвращает id созданного акта.
export function createInventoryAct({ scope, scopeValue, locationId, locationName }) {
  const db = getDb();
  const now = new Date().toISOString();

  // Удаляем незавершённые черновики (только один черновик единовременно)
  const drafts = db.getAllSync(`SELECT id FROM inventory_acts WHERE status = 'draft'`);
  for (const d of drafts) {
    db.runSync(`DELETE FROM inventory_act_items WHERE act_id = ?`, [d.id]);
    db.runSync(`DELETE FROM inventory_acts WHERE id = ?`, [d.id]);
  }

  const res = db.runSync(
    `INSERT INTO inventory_acts (created_at, location_id, location_name, scope, scope_value, status)
     VALUES (?, ?, ?, ?, ?, 'draft')`,
    [now, locationId || null, locationName || '', scope || 'all', scopeValue || '']
  );
  const actId = res.lastInsertRowId;

  // Собираем позиции склада по scope
  let stockItems = [];
  if (scope === 'category' && scopeValue) {
    stockItems = db.getAllSync(
      `SELECT * FROM stock WHERE LOWER(category) = LOWER(?) ORDER BY name`,
      [scopeValue]
    );
  } else if (scope === 'manual' && scopeValue) {
    const ids = scopeValue.split(',').map(x => parseInt(x.trim())).filter(Boolean);
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      stockItems = db.getAllSync(
        `SELECT * FROM stock WHERE id IN (${placeholders}) ORDER BY category, name`,
        ids
      );
    }
  } else {
    stockItems = db.getAllSync(`SELECT * FROM stock ORDER BY category, name`);
  }

  // Для каждой позиции: берём учётный остаток (с учётом локации) и среднюю себестоимость
  for (const item of stockItems) {
    let expected = item['остаток'] || 0;
    if (locationId) {
      const locRow = db.getFirstSync(
        `SELECT остаток FROM stock_by_location WHERE stock_id = ? AND location_id = ?`,
        [item.id, locationId]
      );
      expected = locRow ? locRow['остаток'] : 0;
    }
    const costPerUnit = getAvgCostLast10(item.name);
    db.runSync(
      `INSERT INTO inventory_act_items (act_id, stock_id, stock_name, unit, expected, cost_per_unit)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [actId, item.id, item.name, item.unit || '', expected, costPerUnit]
    );
  }

  return actId;
}

// Обновляет фактический остаток по одной строке акта
export function setInventoryItemActual(itemId, actual) {
  const db = getDb();
  const row = db.getFirstSync(`SELECT * FROM inventory_act_items WHERE id = ?`, [itemId]);
  if (!row) return;
  const diffQty = actual - (row.expected || 0);
  const diffMoney = Math.round(diffQty * (row.cost_per_unit || 0) * 100) / 100;
  db.runSync(
    `UPDATE inventory_act_items SET actual = ?, diff_qty = ?, diff_money = ? WHERE id = ?`,
    [actual, diffQty, diffMoney, itemId]
  );
}

// Подтверждает акт: применяет фактические остатки на склад, меняет статус на 'confirmed'
export function confirmInventoryAct(actId) {
  const db = getDb();
  const act = db.getFirstSync(`SELECT * FROM inventory_acts WHERE id = ?`, [actId]);
  if (!act || act.status !== 'draft') return false;

  const items = db.getAllSync(
    `SELECT * FROM inventory_act_items WHERE act_id = ? AND actual IS NOT NULL`,
    [actId]
  );

  for (const item of items) {
    if (act.location_id) {
      // Обновляем остаток в конкретной локации
      db.runSync(`
        INSERT INTO stock_by_location (stock_id, location_id, остаток)
        VALUES (?, ?, ?)
        ON CONFLICT(stock_id, location_id) DO UPDATE SET остаток = excluded.остаток
      `, [item.stock_id, act.location_id, item.actual]);
    } else {
      // Обновляем общий остаток
      db.runSync(
        `UPDATE stock SET остаток = ? WHERE id = ?`,
        [item.actual, item.stock_id]
      );
    }
  }

  db.runSync(
    `UPDATE inventory_acts SET status = 'confirmed', confirmed_at = ? WHERE id = ?`,
    [new Date().toISOString(), actId]
  );
  return true;
}

// Акт с его строками
export function getInventoryAct(actId) {
  const db = getDb();
  const act = db.getFirstSync(`SELECT * FROM inventory_acts WHERE id = ?`, [actId]);
  if (!act) return null;
  const items = db.getAllSync(
    `SELECT * FROM inventory_act_items WHERE act_id = ? ORDER BY stock_name`,
    [actId]
  );
  return { ...act, items };
}

// Список актов (для истории)
export function getInventoryActs(limit = 30) {
  const db = getDb();
  return db.getAllSync(
    `SELECT * FROM inventory_acts ORDER BY created_at DESC LIMIT ?`,
    [limit]
  );
}

// Удаляет черновик
export function deleteInventoryAct(actId) {
  const db = getDb();
  db.runSync(`DELETE FROM inventory_act_items WHERE act_id = ?`, [actId]);
  db.runSync(`DELETE FROM inventory_acts WHERE id = ?`, [actId]);
}

// ─── Виджет дашборда ────────────────────────────────────────────────────────

// Быстрая статистика для главного экрана:
// - информация о текущей смене
// - выручка и количество заказов за сегодня
// - количество позиций склада ниже порогового значения
export function getDashboardStats() {
  const db = getDb();

  // Текущая открытая смена
  const shift = db.getFirstSync(`SELECT * FROM shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1`) || null;

  // Сегодняшняя дата в формате YYYY-MM-DD
  const today = new Date().toISOString().slice(0, 10);

  // Заказы за сегодня
  const todayOrders = db.getAllSync(
    `SELECT total, method_type, method FROM orders WHERE created_at LIKE ?`,
    [`${today}%`]
  );

  const payMethods = getPayMethods();
  const todayCash  = todayOrders.filter(o => resolveMethodType(o, payMethods) === 'cash').reduce((s, o) => s + o.total, 0);
  const todayCard  = todayOrders.filter(o => resolveMethodType(o, payMethods) !== 'cash' && resolveMethodType(o, payMethods) !== 'mixed').reduce((s, o) => s + o.total, 0);
  const todayMixed = todayOrders.filter(o => resolveMethodType(o, payMethods) === 'mixed').reduce((s, o) => s + o.total, 0);
  const todayTotal = todayOrders.reduce((s, o) => s + o.total, 0);

  // Позиции склада ниже порога
  // Если есть stock_by_location — берём суммарный остаток по всем локациям
  let lowStockItems;
  try {
    lowStockItems = db.getAllSync(
      `SELECT s.name, s.порог, s.unit,
        COALESCE(SUM(sl.остаток), s.остаток) as остаток
       FROM stock s
       LEFT JOIN stock_by_location sl ON sl.stock_id = s.id
       WHERE s.порог > 0
       GROUP BY s.id
       HAVING COALESCE(SUM(sl.остаток), s.остаток) <= s.порог
       ORDER BY (COALESCE(SUM(sl.остаток), s.остаток) - s.порог) ASC LIMIT 5`
    );
  } catch (_) {
    lowStockItems = db.getAllSync(
      `SELECT name, остаток, порог, unit FROM stock WHERE остаток <= порог AND порог > 0 ORDER BY (остаток - порог) ASC LIMIT 5`
    );
  }

  // Продолжительность текущей смены
  let shiftDuration = null;
  if (shift?.opened_at) {
    const ms = Date.now() - new Date(shift.opened_at).getTime();
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    shiftDuration = h > 0 ? `${h}ч ${m}мин` : `${m}мин`;
  }

  return {
    shift,
    shiftDuration,
    todayOrders: todayOrders.length,
    todayTotal,
    todayCash,
    todayCard,
    todayMixed,
    lowStockItems,
    lowStockCount: lowStockItems.length,
  };
}

// ─── Блок В: Зоны/столы ────────────────────────────────────────────────────

export function getZones() {
  const db = getDb();
  try { db.execSync(`CREATE TABLE IF NOT EXISTS zone_tables (id INTEGER PRIMARY KEY AUTOINCREMENT, zone_id INTEGER NOT NULL, name TEXT NOT NULL, position INTEGER DEFAULT 0)`); } catch (_) {}
  const zones = db.getAllSync(`SELECT * FROM zones WHERE active = 1 ORDER BY position, id`);
  return zones.map(z => ({
    ...z,
    tables: (() => {
      try { return db.getAllSync(`SELECT * FROM zone_tables WHERE zone_id = ? ORDER BY position, id`, [z.id]); }
      catch (_) { return []; }
    })(),
  }));
}

export function addZone(name) {
  const db = getDb();
  const pos = (db.getFirstSync(`SELECT MAX(position) as m FROM zones`)?.m || 0) + 1;
  return db.runSync(`INSERT INTO zones (name, position, active) VALUES (?, ?, 1)`, [name, pos]).lastInsertRowId;
}

export function updateZone(id, name) {
  const db = getDb();
  db.runSync(`UPDATE zones SET name = ? WHERE id = ?`, [name, id]);
}

export function deleteZone(id) {
  const db = getDb();
  db.runSync(`UPDATE zones SET active = 0 WHERE id = ?`, [id]);
  // Столы зоны не трогаем — мягкое удаление только самой зоны
}

// Столы внутри зоны
export function addZoneTable(zoneId, name) {
  const db = getDb();
  try { db.execSync(`CREATE TABLE IF NOT EXISTS zone_tables (id INTEGER PRIMARY KEY AUTOINCREMENT, zone_id INTEGER NOT NULL, name TEXT NOT NULL, position INTEGER DEFAULT 0)`); } catch (_) {}
  const pos = (db.getFirstSync(`SELECT MAX(position) as m FROM zone_tables WHERE zone_id = ?`, [zoneId])?.m || 0) + 1;
  return db.runSync(`INSERT INTO zone_tables (zone_id, name, position) VALUES (?, ?, ?)`, [zoneId, name, pos]).lastInsertRowId;
}

export function updateZoneTable(id, name) {
  const db = getDb();
  db.runSync(`UPDATE zone_tables SET name = ? WHERE id = ?`, [name, id]);
}

export function deleteZoneTable(id) {
  const db = getDb();
  db.runSync(`DELETE FROM zone_tables WHERE id = ?`, [id]);
}

// Быстро добавить несколько столов по диапазону (напр. "Стол 1" до "Стол 10")
export function bulkAddZoneTables(zoneId, prefix, from, to) {
  for (let i = from; i <= to; i++) {
    addZoneTable(zoneId, `${prefix} ${i}`);
  }
}

// ─── Блок В: Шаблоны заказов ───────────────────────────────────────────────

export function getOrderTemplates() {
  const db = getDb();
  return db.getAllSync(`SELECT * FROM order_templates ORDER BY name`).map(t => ({
    ...t, items: safeParse(t.items, []),
  }));
}

export function saveOrderTemplate(name, items) {
  const db = getDb();
  const now = new Date().toISOString();
  return db.runSync(
    `INSERT INTO order_templates (name, items, created_at) VALUES (?, ?, ?)`,
    [name, JSON.stringify(items), now]
  ).lastInsertRowId;
}

export function deleteOrderTemplate(id) {
  const db = getDb();
  db.runSync(`DELETE FROM order_templates WHERE id = ?`, [id]);
}

// ─── Блок Г: Возврат заказа ─────────────────────────────────────────────────

// Помечает заказ как возвращённый и восстанавливает склад
export function returnOrder(orderId) {
  const db = getDb();
  const order = db.getFirstSync(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  if (!order || order.status === 'returned') return false;

  // Восстанавливаем склад (возвращаем то, что было списано)
  try { reverseStockForOrder(orderId); } catch (e) { console.error('[returnOrder] stock reversal error:', e); }

  // Если был клиент — возвращаем ему балл/посещение/сумму
  if (order.client_id) {
    try {
      const client = db.getFirstSync(`SELECT * FROM clients WHERE id = ?`, [order.client_id]);
      if (client) {
        // Вычитаем сумму из total_sum и уменьшаем visits
        db.runSync(
          `UPDATE clients SET visits = MAX(0, visits - 1), total_sum = MAX(0, total_sum - ?) WHERE id = ?`,
          [order.total, order.client_id]
        );
      }
    } catch (e) { console.error('[returnOrder] client update error:', e); }
  }

  db.runSync(`UPDATE orders SET status = 'returned' WHERE id = ?`, [orderId]);
  return true;
}

// Возвращает заказы за период (исключает возвраты по умолчанию)
export function getOrdersByPeriod(dateFrom, dateTo, includeReturned = false) {
  const db = getDb();
  const statusFilter = includeReturned ? '' : `AND (status IS NULL OR status != 'returned')`;
  return db.getAllSync(
    `SELECT * FROM orders WHERE created_at >= ? AND created_at <= ? ${statusFilter} ORDER BY created_at DESC`,
    [dateFrom + 'T00:00:00', dateTo + 'T23:59:59']
  );
}

// ─── Блок Г: P&L + Графики ──────────────────────────────────────────────────

// Вычисляет COGS (себестоимость) для списка заказов
function calcCOGS(orders) {
  const db = getDb();
  let total = 0;
  for (const order of orders) {
    const items = db.getAllSync(`SELECT * FROM order_items WHERE order_id = ?`, [order.id]);
    for (const item of items) {
      const qty = item.quantity || 1;
      let card = null;
      if (item.variant_id) {
        card = db.getFirstSync(`SELECT * FROM cost_cards WHERE variant_id = ?`, [item.variant_id]);
      }
      if (!card && item.product_id) {
        card = db.getFirstSync(`SELECT * FROM cost_cards WHERE product_id = ? AND (variant_id IS NULL OR variant_id = 0)`, [item.product_id]);
      }
      if (card) {
        const ings = db.getAllSync(`SELECT * FROM cost_ingredients WHERE cost_card_id = ?`, [card.id]);
        const cardCost = ings.reduce((s, ing) => s + ing.amount * (ing.factor || 1) * ing.price_per_unit, 0);
        total += cardCost * qty;
      }
    }
  }
  return Math.round(total * 100) / 100;
}

// P&L за период
export function getPnL(dateFrom, dateTo) {
  const db = getDb();
  const orders = getOrdersByPeriod(dateFrom, dateTo, false);
  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const cogs    = calcCOGS(orders);
  const grossProfit = revenue - cogs;

  const expenses = db.getAllSync(
    `SELECT SUM(amount) as total FROM expenses WHERE date >= ? AND date <= ?`,
    [dateFrom, dateTo]
  );
  const totalExpenses = expenses[0]?.total || 0;
  const netProfit = grossProfit - totalExpenses;

  return {
    revenue: Math.round(revenue * 100) / 100,
    cogs:    Math.round(cogs * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    expenses: Math.round(totalExpenses * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    grossMarginPct: revenue > 0 ? Math.round(grossProfit / revenue * 1000) / 10 : 0,
    netMarginPct:   revenue > 0 ? Math.round(netProfit   / revenue * 1000) / 10 : 0,
    orderCount: orders.length,
    avgCheck: orders.length > 0 ? Math.round(revenue / orders.length * 100) / 100 : 0,
  };
}

// Выручка по дням для графика
export function getRevenueByDay(dateFrom, dateTo) {
  const db = getDb();
  return db.getAllSync(
    `SELECT SUBSTR(created_at, 1, 10) as day, SUM(total) as total, COUNT(*) as orders
     FROM orders WHERE created_at >= ? AND created_at <= ? AND (status IS NULL OR status != 'returned')
     GROUP BY day ORDER BY day`,
    [dateFrom + 'T00:00:00', dateTo + 'T23:59:59']
  );
}

// Топ товаров по количеству продаж
export function getTopProducts(dateFrom, dateTo, limit = 10) {
  const db = getDb();
  return db.getAllSync(
    `SELECT oi.name, SUM(oi.quantity) as qty, SUM(oi.price * oi.quantity) as revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.created_at >= ? AND o.created_at <= ? AND (o.status IS NULL OR o.status != 'returned')
     GROUP BY oi.name ORDER BY qty DESC LIMIT ?`,
    [dateFrom + 'T00:00:00', dateTo + 'T23:59:59', limit]
  );
}

// ─── Блок Г: Плановые цены ──────────────────────────────────────────────────

export function addPriceSchedule(productId, variantId, newPrice, effectiveDate) {
  const db = getDb();
  try { db.execSync(`CREATE TABLE IF NOT EXISTS price_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, variant_id INTEGER, new_price REAL NOT NULL, effective_date TEXT NOT NULL, applied INTEGER DEFAULT 0, created_at TEXT NOT NULL)`); } catch (_) {}
  return db.runSync(
    `INSERT INTO price_schedules (product_id, variant_id, new_price, effective_date, applied, created_at) VALUES (?, ?, ?, ?, 0, ?)`,
    [productId, variantId || null, newPrice, effectiveDate, new Date().toISOString()]
  ).lastInsertRowId;
}

export function getPriceSchedules(productId) {
  const db = getDb();
  try { db.execSync(`CREATE TABLE IF NOT EXISTS price_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, variant_id INTEGER, new_price REAL NOT NULL, effective_date TEXT NOT NULL, applied INTEGER DEFAULT 0, created_at TEXT NOT NULL)`); } catch (_) {}
  return db.getAllSync(
    `SELECT * FROM price_schedules WHERE product_id = ? AND applied = 0 ORDER BY effective_date`,
    [productId]
  );
}

export function deletePriceSchedule(id) {
  const db = getDb();
  db.runSync(`DELETE FROM price_schedules WHERE id = ?`, [id]);
}

// Применяет плановые цены у которых наступила дата — вызывать при старте кассы
export function applyPendingPriceSchedules() {
  const db = getDb();
  try {
    db.execSync(`CREATE TABLE IF NOT EXISTS price_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, variant_id INTEGER, new_price REAL NOT NULL, effective_date TEXT NOT NULL, applied INTEGER DEFAULT 0, created_at TEXT NOT NULL)`);
    const today = new Date().toISOString().slice(0, 10);
    const pending = db.getAllSync(
      `SELECT * FROM price_schedules WHERE effective_date <= ? AND applied = 0`, [today]
    );
    for (const s of pending) {
      if (s.variant_id) {
        db.runSync(`UPDATE product_variants SET price = ? WHERE id = ?`, [s.new_price, s.variant_id]);
      } else {
        db.runSync(`UPDATE products SET price = ? WHERE id = ?`, [s.new_price, s.product_id]);
      }
      db.runSync(`UPDATE price_schedules SET applied = 1 WHERE id = ?`, [s.id]);
    }
    return pending.length;
  } catch (e) { console.error('[applyPendingPriceSchedules]', e); return 0; }
}

// ─── Блок Ж: Оборудование ───────────────────────────────────────────────────

function ensureEquipment(db) {
  try { db.execSync(`CREATE TABLE IF NOT EXISTS equipment (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, cost REAL DEFAULT 0, purchase_date TEXT DEFAULT '', amort_type TEXT DEFAULT 'linear', amort_period INTEGER DEFAULT 12, amort_cycles INTEGER DEFAULT 0, current_cycles INTEGER DEFAULT 0, counter_type TEXT DEFAULT 'order', counter_product_id INTEGER, cycles_per_use REAL DEFAULT 1, active INTEGER DEFAULT 1, created_at TEXT NOT NULL)`); } catch (_) {}
}

export function getEquipment() {
  const db = getDb(); ensureEquipment(db);
  return db.getAllSync(`SELECT * FROM equipment WHERE active = 1 ORDER BY name`);
}

export function addEquipment(data) {
  const db = getDb(); ensureEquipment(db);
  const now = new Date().toISOString();
  const id = db.runSync(
    `INSERT INTO equipment (name, cost, purchase_date, amort_type, amort_period, amort_cycles, current_cycles, counter_type, counter_product_id, cycles_per_use, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1, ?)`,
    [data.name, data.cost||0, data.purchase_date||'', data.amort_type||'linear',
     data.amort_period||12, data.amort_cycles||0, data.counter_type||'order',
     data.counter_product_id||null, data.cycles_per_use||1, now]
  ).lastInsertRowId;
  // Автоматически добавляем в инвестиционный трекер
  if ((data.cost || 0) > 0) {
    ensureInvestments(db);
    db.runSync(
      `INSERT INTO investments (name, amount, invest_date, amort_months, category, equipment_id, returnable, created_at) VALUES (?, ?, ?, ?, 'equipment', ?, 0, ?)`,
      [data.name, data.cost, data.purchase_date||now.slice(0,10), data.amort_period||0, id, now]
    );
  }
  return id;
}

export function updateEquipment(id, data) {
  const db = getDb();
  db.runSync(
    `UPDATE equipment SET name=?, cost=?, purchase_date=?, amort_type=?, amort_period=?, amort_cycles=?, counter_type=?, counter_product_id=?, cycles_per_use=? WHERE id=?`,
    [data.name, data.cost||0, data.purchase_date||'', data.amort_type||'linear',
     data.amort_period||12, data.amort_cycles||0, data.counter_type||'order',
     data.counter_product_id||null, data.cycles_per_use||1, id]
  );
}

export function deleteEquipment(id) {
  const db = getDb();
  db.runSync(`UPDATE equipment SET active = 0 WHERE id = ?`, [id]);
}

export function incrementEquipmentCycles(productId, orderId) {
  const db = getDb(); ensureEquipment(db);
  // Для оборудования с counter_type='order' — каждый заказ
  const byOrder = db.getAllSync(`SELECT * FROM equipment WHERE counter_type = 'order' AND active = 1`);
  for (const eq of byOrder) {
    db.runSync(`UPDATE equipment SET current_cycles = current_cycles + ? WHERE id = ?`, [eq.cycles_per_use||1, eq.id]);
  }
  // Для оборудования с counter_type='product' — при продаже конкретного товара
  if (productId) {
    const byProduct = db.getAllSync(
      `SELECT * FROM equipment WHERE counter_type = 'product' AND counter_product_id = ? AND active = 1`,
      [productId]
    );
    for (const eq of byProduct) {
      db.runSync(`UPDATE equipment SET current_cycles = current_cycles + ? WHERE id = ?`, [eq.cycles_per_use||1, eq.id]);
    }
  }
}

export function manualIncrementEquipment(id, cycles = 1) {
  const db = getDb();
  db.runSync(`UPDATE equipment SET current_cycles = current_cycles + ? WHERE id = ?`, [cycles, id]);
}

// Амортизация за заказ для включения в себестоимость
export function getEquipmentCostPerOrder(ordersInPeriod = 1) {
  const db = getDb(); ensureEquipment(db);
  const eq = db.getAllSync(`SELECT * FROM equipment WHERE active = 1 AND cost > 0`);
  let total = 0;
  for (const e of eq) {
    if (e.amort_type === 'production' && e.amort_cycles > 0) {
      total += e.cost / e.amort_cycles;
    } else if (e.amort_type === 'linear' && e.amort_period > 0 && ordersInPeriod > 0) {
      total += (e.cost / e.amort_period / 30) / ordersInPeriod; // per day / per order
    }
  }
  return Math.round(total * 100) / 100;
}

// ─── Блок Ж: Накладные расходы ──────────────────────────────────────────────

function ensureOverheads(db) {
  try { db.execSync(`CREATE TABLE IF NOT EXISTS overhead_items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, amount REAL DEFAULT 0, period TEXT DEFAULT 'month', basis TEXT DEFAULT 'order', basis_value REAL DEFAULT 0, active INTEGER DEFAULT 1)`); } catch (_) {}
}

export function getOverheadItems() {
  const db = getDb(); ensureOverheads(db);
  return db.getAllSync(`SELECT * FROM overhead_items WHERE active = 1 ORDER BY name`);
}

export function addOverheadItem(data) {
  const db = getDb(); ensureOverheads(db);
  return db.runSync(
    `INSERT INTO overhead_items (name, amount, period, basis, basis_value, active) VALUES (?, ?, ?, ?, ?, 1)`,
    [data.name, data.amount||0, data.period||'month', data.basis||'order', data.basis_value||0]
  ).lastInsertRowId;
}

export function updateOverheadItem(id, data) {
  const db = getDb();
  db.runSync(
    `UPDATE overhead_items SET name=?, amount=?, period=?, basis=?, basis_value=? WHERE id=?`,
    [data.name, data.amount||0, data.period||'month', data.basis||'order', data.basis_value||0, id]
  );
}

export function deleteOverheadItem(id) {
  const db = getDb();
  db.runSync(`UPDATE overhead_items SET active = 0 WHERE id = ?`, [id]);
}

// Накладные на заказ (для включения в себестоимость и P&L)
export function getOverheadPerOrder(ordersThisMonth = 1, revenueThisMonth = 1, hoursThisMonth = 160) {
  const db = getDb(); ensureOverheads(db);
  const items = db.getAllSync(`SELECT * FROM overhead_items WHERE active = 1`);
  let total = 0;
  for (const item of items) {
    // Нормализуем к месяцу
    const monthlyAmount = item.period === 'year' ? item.amount / 12
      : item.period === 'week' ? item.amount * 4.33
      : item.amount;
    if (item.basis === 'order') {
      total += ordersThisMonth > 0 ? monthlyAmount / ordersThisMonth : 0;
    } else if (item.basis === 'hour') {
      total += hoursThisMonth > 0 ? (monthlyAmount / hoursThisMonth) / (ordersThisMonth / hoursThisMonth) : 0;
    } else if (item.basis === 'revenue_pct') {
      total += revenueThisMonth > 0 ? (revenueThisMonth * (item.basis_value || 0) / 100) / ordersThisMonth : 0;
    }
  }
  return Math.round(total * 100) / 100;
}

// ─── Блок Ж: Инвестиции ─────────────────────────────────────────────────────

function ensureInvestments(db) {
  try { db.execSync(`CREATE TABLE IF NOT EXISTS investments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, amount REAL NOT NULL, invest_date TEXT DEFAULT '', amort_months INTEGER DEFAULT 0, category TEXT DEFAULT 'other', equipment_id INTEGER, returnable INTEGER DEFAULT 0, created_at TEXT NOT NULL)`); } catch (_) {}
}

export function getInvestments() {
  const db = getDb(); ensureInvestments(db);
  return db.getAllSync(`SELECT * FROM investments ORDER BY invest_date DESC, created_at DESC`);
}

export function addInvestment(data) {
  const db = getDb(); ensureInvestments(db);
  const now = new Date().toISOString();
  return db.runSync(
    `INSERT INTO investments (name, amount, invest_date, amort_months, category, equipment_id, returnable, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.name, data.amount||0, data.invest_date||now.slice(0,10), data.amort_months||0,
     data.category||'other', data.equipment_id||null, data.returnable?1:0, now]
  ).lastInsertRowId;
}

export function updateInvestment(id, data) {
  const db = getDb();
  db.runSync(
    `UPDATE investments SET name=?, amount=?, invest_date=?, amort_months=?, category=?, returnable=? WHERE id=?`,
    [data.name, data.amount||0, data.invest_date||'', data.amort_months||0, data.category||'other', data.returnable?1:0, id]
  );
}

export function deleteInvestment(id) {
  const db = getDb();
  db.runSync(`DELETE FROM investments WHERE id = ?`, [id]);
}

// Суммарные вложения и прогресс окупаемости
export function getInvestmentSummary() {
  const db = getDb(); ensureInvestments(db);
  const all = db.getAllSync(`SELECT * FROM investments`);
  const nonReturnable = all.filter(i => !i.returnable);
  const returnable = all.filter(i => i.returnable);
  const totalInvested = nonReturnable.reduce((s, i) => s + i.amount, 0);
  const totalReturnable = returnable.reduce((s, i) => s + i.amount, 0);
  // Накопленная прибыль из P&L (за всё время)
  const profitRow = db.getFirstSync(
    `SELECT SUM(total) as rev FROM orders WHERE status IS NULL OR status != 'returned'`
  );
  const totalRevenue = profitRow?.rev || 0;
  return { totalInvested, totalReturnable, totalRevenue, all };
}

// ─── Блок Ж: Журнал работ ───────────────────────────────────────────────────

// Заказы с заметками (к заказу или к позициям)
export function getWorkJournal({ dateFrom, dateTo, clientId, limit = 50 } = {}) {
  const db = getDb();
  let where = `(o.note != '' OR oi.note != '')`;
  const params = [];
  if (dateFrom) { where += ` AND o.created_at >= ?`; params.push(dateFrom + 'T00:00:00'); }
  if (dateTo)   { where += ` AND o.created_at <= ?`; params.push(dateTo   + 'T23:59:59'); }
  if (clientId) { where += ` AND o.client_id = ?`;   params.push(clientId); }
  params.push(limit);
  return db.getAllSync(
    `SELECT DISTINCT o.*, c.fio as client_name
     FROM orders o
     LEFT JOIN clients c ON c.id = o.client_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE ${where}
     ORDER BY o.created_at DESC LIMIT ?`,
    params
  );
}

// Заметки на позиции конкретного заказа
export function getOrderItemsWithNotes(orderId) {
  const db = getDb();
  return db.getAllSync(
    `SELECT * FROM order_items WHERE order_id = ? ORDER BY id`,
    [orderId]
  );
}

// Сохранить заметку к позиции заказа
export function updateOrderItemNote(itemId, note) {
  const db = getDb();
  db.runSync(`UPDATE order_items SET note = ? WHERE id = ?`, [note, itemId]);
}

// ─── Блок Ж: Зарплата — обновление сотрудников ──────────────────────────────
// Возвращает среднюю стоимость смены по всем сотрудникам с заданной ставкой
// revenueInShift нужен для типа 'revenue_pct', hoursInShift для 'hourly'
export function calcShiftSalaryCost({ employeeName, revenueInShift = 0, hoursInShift = 8, avgOrdersPerMonth = 600 }) {
  const db = getDb();
  let user = null;
  if (employeeName) {
    user = db.getFirstSync(`SELECT * FROM users WHERE name = ? AND active != 0`, [employeeName]);
  }
  if (!user) {
    // Берём среднюю ставку по всем активным сотрудникам с ненулевой ставкой
    const all = db.getAllSync(`SELECT * FROM users WHERE active != 0 AND salary_amount > 0`);
    if (all.length === 0) return 0;
    const avg = all.reduce((s, u) => s + calcSingleSalary(u, revenueInShift, hoursInShift), 0) / all.length;
    return Math.round(avg * 100) / 100;
  }
  return calcSingleSalary(user, revenueInShift, hoursInShift);
}

function calcSingleSalary(user, revenue, hours) {
  const amt = user.salary_amount || 0;
  switch (user.salary_type) {
    case 'shift':       return amt;
    case 'hourly':      return amt * (hours || 8);
    case 'revenue_pct': return revenue * amt / 100;
    case 'monthly':     return amt / 22; // рабочих дней в месяце
    case 'profit_pct':  return revenue * amt / 100; // упрощённо от выручки
    default:            return amt;
  }
}

// ─── Фаза 7: Полный управленческий P&L ──────────────────────────────────────

// Количество смен за период
function getShiftsInPeriod(dateFrom, dateTo) {
  const db = getDb();
  try {
    return db.getAllSync(
      `SELECT * FROM shifts WHERE opened_at >= ? AND opened_at <= ?`,
      [dateFrom + 'T00:00:00', dateTo + 'T23:59:59']
    );
  } catch (_) { return []; }
}

// Полный P&L с накладными, зарплатой и амортизацией
export function getPnLFull(dateFrom, dateTo) {
  // Базовый P&L (выручка, COGS, расходы)
  const base = getPnL(dateFrom, dateTo);
  const days = Math.max(1, Math.round(
    (new Date(dateTo) - new Date(dateFrom)) / 86400000
  ) + 1);

  // ── Накладные расходы за период ──
  let overheadTotal = 0;
  try {
    const overheads = getOverheadItems();
    for (const oh of overheads) {
      const monthly = oh.period === 'year'  ? oh.amount / 12
                    : oh.period === 'week'  ? oh.amount * 4.33
                    : oh.amount;
      overheadTotal += monthly * (days / 30);
    }
  } catch (_) {}
  overheadTotal = Math.round(overheadTotal);

  // ── Зарплата за период ──
  let salaryTotal = 0;
  try {
    const shifts = getShiftsInPeriod(dateFrom, dateTo);
    const db = getDb();
    for (const shift of shifts) {
      const user = shift.employee_name
        ? db.getFirstSync(`SELECT * FROM users WHERE name = ?`, [shift.employee_name])
        : null;
      if (user && user.salary_amount > 0) {
        const hours = shift.closed_at
          ? Math.round((new Date(shift.closed_at) - new Date(shift.opened_at)) / 3600000)
          : 8;
        switch (user.salary_type) {
          case 'shift':       salaryTotal += user.salary_amount; break;
          case 'hourly':      salaryTotal += user.salary_amount * hours; break;
          case 'monthly':     salaryTotal += user.salary_amount / 22; break;
          case 'revenue_pct': salaryTotal += (base.revenue * user.salary_amount / 100) / Math.max(1, shifts.length); break;
          default:            salaryTotal += user.salary_amount;
        }
      } else if (!user) {
        // Среднее по всем сотрудникам
        salaryTotal += calcShiftSalaryCost({ revenueInShift: base.revenue / Math.max(1, shifts.length) });
      }
    }
  } catch (_) {}
  salaryTotal = Math.round(salaryTotal);

  // ── Амортизация оборудования за период ──
  let deprTotal = 0;
  try {
    const equipment = getEquipment();
    for (const eq of equipment) {
      if (!eq.cost || eq.cost === 0) continue;
      if (eq.amort_type === 'linear' && eq.amort_period > 0) {
        deprTotal += (eq.cost / eq.amort_period) * (days / 30);
      } else if (eq.amort_type === 'production' && eq.amort_cycles > 0) {
        // Циклы за период = заказы за период * cycles_per_use
        deprTotal += (eq.cost / eq.amort_cycles) * base.orderCount * (eq.cycles_per_use || 1);
      } else if (eq.amort_type === 'mixed' && eq.amort_period > 0) {
        deprTotal += (eq.cost / eq.amort_period) * (days / 30);
      }
    }
  } catch (_) {}
  deprTotal = Math.round(deprTotal);

  // ── Итоговые показатели ──
  const totalCosts    = base.cogs + base.expenses + overheadTotal + salaryTotal + deprTotal;
  const fullNetProfit = base.revenue - totalCosts;
  const fullNetMarginPct = base.revenue > 0
    ? Math.round(fullNetProfit / base.revenue * 1000) / 10
    : 0;

  return {
    ...base,
    overheadTotal,
    salaryTotal,
    deprTotal,
    totalCosts,
    fullNetProfit,
    fullNetMarginPct,
    // Метрики для типа бизнеса
    foodCostPct:  base.revenue > 0 ? Math.round(base.cogs / base.revenue * 1000) / 10 : 0,
    primeCostPct: base.revenue > 0 ? Math.round((base.cogs + salaryTotal) / base.revenue * 1000) / 10 : 0,
    grossMarginPct: base.grossMarginPct,
    laborCostPct: base.revenue > 0 ? Math.round(salaryTotal / base.revenue * 1000) / 10 : 0,
    breakEvenMonthly: (overheadTotal + salaryTotal + deprTotal + base.expenses) > 0 && base.grossMarginPct > 0
      ? Math.round((overheadTotal + salaryTotal + deprTotal + base.expenses) / (base.grossMarginPct / 100))
      : 0,
    shiftsCount: (() => { try { return getShiftsInPeriod(dateFrom, dateTo).length; } catch(_) { return 0; } })(),
    avgCheckPerShift: (() => {
      const sc = (() => { try { return getShiftsInPeriod(dateFrom, dateTo).length; } catch(_) { return 0; } })();
      return sc > 0 ? Math.round(base.revenue / sc) : 0;
    })(),
  };
}

// ─── Метрики по типу бизнеса ─────────────────────────────────────────────────
export function getBusinessMetrics(pnlFull, businessPreset) {
  const metrics = [];
  const { revenue, foodCostPct, primeCostPct, grossMarginPct, laborCostPct,
          orderCount, avgCheck, shiftsCount, avgCheckPerShift, breakEvenMonthly } = pnlFull;

  if (businessPreset === 'coffee' || businessPreset === 'services' || !businessPreset) {
    metrics.push({
      key: 'foodCost',
      label: 'Food Cost %',
      value: `${foodCostPct}%`,
      benchmark: '< 30%',
      ok: foodCostPct > 0 && foodCostPct < 30,
      warn: foodCostPct >= 30,
      tip: 'Доля себестоимости в выручке. Норма для кофейни: 25–30%. Выше 35% — пора пересматривать рецептуру или поставщиков.',
    });
    metrics.push({
      key: 'primeCost',
      label: 'Prime Cost %',
      value: `${primeCostPct}%`,
      benchmark: '< 60%',
      ok: primeCostPct > 0 && primeCostPct < 60,
      warn: primeCostPct >= 60,
      tip: 'Себестоимость + Зарплата / Выручка. Главный показатель эффективности F&B. Норма: 55–60%.',
    });
  }

  if (businessPreset === 'retail' || !businessPreset) {
    metrics.push({
      key: 'grossMargin',
      label: 'Валовая маржа',
      value: `${grossMarginPct}%`,
      benchmark: '> 40%',
      ok: grossMarginPct > 40,
      warn: grossMarginPct <= 40,
      tip: 'Процент валовой прибыли от выручки. Для розницы норма зависит от категории: продукты 20–35%, одежда 50–70%.',
    });
  }

  metrics.push({
    key: 'laborCost',
    label: 'Зарплатный фонд %',
    value: `${laborCostPct}%`,
    benchmark: '< 35%',
    ok: laborCostPct > 0 && laborCostPct < 35,
    warn: laborCostPct >= 35,
    tip: 'Доля зарплат в выручке. Норма для большинства бизнесов: 25–35%.',
  });

  metrics.push({
    key: 'avgCheck',
    label: 'Средний чек',
    value: `${avgCheck.toLocaleString('ru-RU')} ₽`,
    benchmark: null,
    tip: 'Средняя сумма одного заказа за период.',
  });

  if (shiftsCount > 0) {
    metrics.push({
      key: 'revenuePerShift',
      label: 'Выручка за смену',
      value: `${avgCheckPerShift.toLocaleString('ru-RU')} ₽`,
      benchmark: null,
      tip: 'Средняя выручка за одну рабочую смену.',
    });
  }

  if (breakEvenMonthly > 0) {
    metrics.push({
      key: 'breakEven',
      label: 'Точка безубыточности',
      value: `${breakEvenMonthly.toLocaleString('ru-RU')} ₽/мес`,
      benchmark: null,
      tip: 'Сколько нужно выручки в месяц чтобы покрыть все постоянные расходы (накладные + зарплата + амортизация).',
    });
  }

  return metrics;
}

export function deleteUser(id) {
  const db = getDb();
  db.runSync(`UPDATE users SET active = 0 WHERE id = ?`, [id]);
}

// ─── Права доступа сотрудников ───────────────────────────────────────────────

export const DEFAULT_PERMISSIONS = {
  // Касса
  apply_discounts:    true,
  view_order_history: true,
  cancel_orders:      false,
  // Клиенты
  view_clients:       true,
  edit_clients:       false,
  manage_loyalty:     false,
  // Склад
  view_stock:         true,
  edit_stock:         false,
  edit_thresholds:    false,
  // Меню
  edit_cost_cards:    false,
  edit_products:      false,
  // Финансы
  view_reports:       false,
  add_expenses:       true,
  view_revenue:       true,
  // Смена
  open_shift:         true,
  close_shift:        true,
  // Настройки
  access_settings:    false,
};

export function getUserPermissions(userId) {
  const db = getDb();
  try {
    const user = db.getFirstSync(`SELECT permissions FROM users WHERE id = ?`, [userId]);
    if (!user?.permissions) return { ...DEFAULT_PERMISSIONS };
    return { ...DEFAULT_PERMISSIONS, ...JSON.parse(user.permissions) };
  } catch (_) { return { ...DEFAULT_PERMISSIONS }; }
}

export function saveUserPermissions(userId, permissions) {
  const db = getDb();
  try {
    db.runSync(`UPDATE users SET permissions = ? WHERE id = ?`, [JSON.stringify(permissions), userId]);
  } catch (e) { console.error(e); }
}

// ─── Аналитика для отчётности ─────────────────────────────────────────────────

export function getOrdersByHour(from, to) {
  const db = getDb();
  try {
    return db.getAllSync(
      `SELECT strftime('%H', created_at) as hour, COUNT(*) as count, SUM(total) as total
       FROM orders WHERE date(created_at) BETWEEN ? AND ? AND status != 'cancelled'
       GROUP BY hour ORDER BY hour`,
      [from, to]
    );
  } catch (_) { return []; }
}

export function getRevenueByEmployee(from, to) {
  const db = getDb();
  try {
    return db.getAllSync(
      `SELECT u.name, COUNT(o.id) as orders, SUM(o.total) as revenue
       FROM orders o JOIN users u ON o.cashier_id = u.id
       WHERE date(o.created_at) BETWEEN ? AND ? AND o.status != 'cancelled'
       GROUP BY u.id ORDER BY revenue DESC`,
      [from, to]
    );
  } catch (_) { return []; }
}

export function getPaymentBreakdown(from, to) {
  const db = getDb();
  try {
    return db.getAllSync(
      `SELECT pay_method, COUNT(*) as count, SUM(total) as total
       FROM orders WHERE date(created_at) BETWEEN ? AND ? AND status != 'cancelled'
       GROUP BY pay_method ORDER BY total DESC`,
      [from, to]
    );
  } catch (_) { return []; }
}

export function upsertProductVariants(productId, vars) {
  const db = getDb();
  const keepIds = vars.filter(v => v.id).map(v => Number(v.id));
  const existing = db.getAllSync(`SELECT id FROM product_variants WHERE product_id = ?`, [productId]).map(r => r.id);
  for (const id of existing) {
    if (!keepIds.includes(id)) db.runSync(`DELETE FROM product_variants WHERE id = ?`, [id]);
  }
  const saved = [];
  for (const v of vars) {
    const price = parseFloat(v.price) || 0;
    const label = v.label || '';
    if (v.id) {
      db.runSync(`UPDATE product_variants SET label=?, price=?, active=1 WHERE id=?`, [label, price, v.id]);
      saved.push({ ...v, id: Number(v.id) });
    } else {
      const res = db.runSync(
        `INSERT INTO product_variants (product_id, label, price, axis_values, sku, active) VALUES (?,?,?,?,?,1)`,
        [productId, label, price, '{}', '']
      );
      saved.push({ ...v, id: res.lastInsertRowId });
    }
  }
  return saved;
}
