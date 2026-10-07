import { getDb } from './database';
import { getSession } from './session';
import {
  getSetting, setSetting, getBusinessProfile, ensureStructure, isLocationsOn, getMainWarehouse, whAdd, whQty, getAvgCostLast10,
} from './queries';

// Управление структурой «локация → склады + рабочие места», перемещения между складами, привязка планшета.
// Остатки меняются только через whAdd (общий остаток = сумма по складам — см. db/queries.js).
const now = () => new Date().toISOString();
const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const r3 = n => Math.round((n || 0) * 1000) / 1000;
const fail = m => { throw new Error(m); };

// Всё дерево для экрана настроек: активные локации со складами (позиций, остатки в ₽) и рабочими местами, отключённые отдельно
export function getStructure() {
  const db = getDb();
  ensureStructure();
  const val = wid => db.getFirstSync(
    `SELECT COUNT(*) AS c, COALESCE(SUM(sbl.остаток * COALESCE(s.avg_price, 0)), 0) AS v FROM stock_by_location sbl
     JOIN stock s ON s.id = sbl.stock_id WHERE sbl.location_id = ? AND sbl.остаток > 0`, [wid]);
  const locs = db.getAllSync(`SELECT * FROM locations ORDER BY id`).map(l => ({
    ...l, address: l.description || '',
    warehouses: db.getAllSync(`SELECT * FROM warehouses WHERE location_id = ? AND active = 1 ORDER BY is_main DESC, id`, [l.id]).map(w => { const x = val(w.id); return { ...w, positions: x.c, value: Math.round(x.v) }; }),
    workstations: db.getAllSync(`SELECT w.*, h.name AS warehouse_name FROM workstations w JOIN warehouses h ON h.id = w.warehouse_id WHERE w.location_id = ? AND w.active = 1 ORDER BY w.id`, [l.id]),
    openShift: !!db.getFirstSync(`SELECT 1 AS x FROM shifts WHERE location_id = ? AND status = 'open' LIMIT 1`, [l.id]),
  }));
  return { active: locs.filter(l => l.active), disabled: locs.filter(l => !l.active), boundId: parseInt(getSetting('workstationId'), 10) || null };
}

// Включение/выключение модуля. Склад при этом не переносится: все остатки и так лежат на складах, выключение безопасно.
export function setLocationsModule(on) {
  const db = getDb(), p = getBusinessProfile();
  if (!p) return;
  const modules = { ...(p.modules || {}), locations: !!on };
  db.runSync(`UPDATE business_profile SET modules = ? WHERE id = ?`, [JSON.stringify(modules), p.id]);
  ensureStructure();
}

// ── локации ──
export function addLocation({ name, address = '' }) {
  const db = getDb(), n = String(name || '').trim();
  if (!n) fail('Введите название');
  if (db.getAllSync(`SELECT name FROM locations WHERE active = 1`).some(l => same(l.name, n))) fail('Локация с таким названием уже есть');
  const id = db.runSync(`INSERT INTO locations (name, description, active) VALUES (?, ?, 1)`, [n, String(address || '').trim()]).lastInsertRowId;
  ensureStructure();     // сразу создаёт склад «Основной склад»
  return id;
}
export function updateLocationInfo(id, { name, address = '' }) {
  const db = getDb(), n = String(name || '').trim();
  if (!n) fail('Введите название');
  if (db.getAllSync(`SELECT id, name FROM locations WHERE active = 1`).some(l => l.id !== id && same(l.name, n))) fail('Локация с таким названием уже есть');
  db.runSync(`UPDATE locations SET name = ?, description = ? WHERE id = ?`, [n, String(address || '').trim(), id]);
}
export function restoreLocation(id) {
  const db = getDb();
  db.runSync(`UPDATE locations SET active = 1 WHERE id = ?`, [id]);
  db.runSync(`UPDATE warehouses SET active = 1 WHERE location_id = ?`, [id]);
  db.runSync(`UPDATE workstations SET active = 1 WHERE location_id = ?`, [id]);
  ensureStructure();
}

// ── склады ──
export function addWarehouse(locationId, name) {
  const db = getDb(), n = String(name || '').trim();
  if (!n) fail('Введите название');
  if (db.getAllSync(`SELECT name FROM warehouses WHERE location_id = ? AND active = 1`, [locationId]).some(w => same(w.name, n))) fail('Склад с таким названием уже есть');
  return db.runSync(`INSERT INTO warehouses (location_id, name, is_main, active, created_at) VALUES (?, ?, 0, 1, ?)`, [locationId, n, now()]).lastInsertRowId;
}
export function renameWarehouse(id, name) {
  const db = getDb(), n = String(name || '').trim();
  const w = db.getFirstSync(`SELECT * FROM warehouses WHERE id = ?`, [id]);
  if (!n) fail('Введите название');
  if (db.getAllSync(`SELECT id, name FROM warehouses WHERE location_id = ? AND active = 1`, [w.location_id]).some(x => x.id !== id && same(x.name, n))) fail('Склад с таким названием уже есть');
  db.runSync(`UPDATE warehouses SET name = ? WHERE id = ?`, [n, id]);
}

// ── рабочие места ──
export function saveWorkstation({ id = null, locationId, warehouseId, name, bindThisDevice = false }) {
  const db = getDb(), n = String(name || '').trim();
  if (!n) fail('Введите название');
  if (!db.getFirstSync(`SELECT 1 AS x FROM warehouses WHERE id = ? AND location_id = ? AND active = 1`, [warehouseId, locationId])) fail('Выберите склад этой локации');
  if (db.getAllSync(`SELECT id, name FROM workstations WHERE location_id = ? AND active = 1`, [locationId]).some(w => w.id !== id && same(w.name, n))) fail('Рабочее место с таким названием уже есть');
  let wid = id;
  if (id) db.runSync(`UPDATE workstations SET name = ?, warehouse_id = ? WHERE id = ?`, [n, warehouseId, id]);
  else wid = db.runSync(`INSERT INTO workstations (location_id, warehouse_id, name, active) VALUES (?, ?, ?, 1)`, [locationId, warehouseId, n]).lastInsertRowId;
  if (bindThisDevice) setSetting('workstationId', String(wid));
  return wid;
}
export function removeWorkstation(id) {
  getDb().runSync(`DELETE FROM workstations WHERE id = ?`, [id]);
  if (parseInt(getSetting('workstationId'), 10) === id) setSetting('workstationId', '');
}
export function bindThisDevice(workstationId) { setSetting('workstationId', String(workstationId || '')); }
// Привязать планшет нужно, если локаций или складов больше одного и привязки нет (иначе продажи не знают, с какого склада списывать)
export function needsWorkstationBinding() {
  if (!isLocationsOn()) return false;
  const db = getDb();
  const many = db.getFirstSync(`SELECT (SELECT COUNT(*) FROM locations WHERE active = 1) AS l, (SELECT COUNT(*) FROM warehouses w JOIN locations l ON l.id = w.location_id WHERE w.active = 1 AND l.active = 1) AS w`);
  if (many.l <= 1 && many.w <= 1) return false;
  const id = parseInt(getSetting('workstationId'), 10);
  return !(id && db.getFirstSync(`SELECT 1 AS x FROM workstations w JOIN warehouses h ON h.id = w.warehouse_id WHERE w.id = ? AND w.active = 1 AND h.active = 1`, [id]));
}

// ── перемещения ──
function transferInner(db, fromId, toId, items, note) {
  if (!fromId || !toId || fromId === toId) fail('Выберите два разных склада');
  const from = db.getFirstSync(`SELECT name FROM warehouses WHERE id = ?`, [fromId]), to = db.getFirstSync(`SELECT name FROM warehouses WHERE id = ?`, [toId]);
  if (!from || !to) fail('Склад не найден');
  const list = (items || []).filter(i => i.qty);
  if (!list.length) fail('Укажите количество хотя бы у одной позиции');
  const tid = db.runSync(`INSERT INTO stock_transfers (created_at, from_id, to_id, from_name, to_name, user_name, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [now(), fromId, toId, from.name, to.name, getSession()?.name || '', note || '']).lastInsertRowId;
  for (const i of list) {
    const st = db.getFirstSync(`SELECT id, name, unit FROM stock WHERE id = ?`, [i.stockId]);
    if (!st) fail('Позиция не найдена');
    whAdd(db, st.id, fromId, -i.qty);
    whAdd(db, st.id, toId, i.qty);
    db.runSync(`INSERT INTO stock_transfer_items (transfer_id, stock_id, stock_name, unit, qty, cost_per_unit) VALUES (?, ?, ?, ?, ?, ?)`,
      [tid, st.id, st.name, st.unit || '', i.qty, getAvgCostLast10(st.name) || 0]);
  }
  return tid;
}
// Перемещение между складами (любых локаций): нельзя больше, чем есть на складе-источнике; общий остаток не меняется
export function createTransfer({ fromId, toId, items, note = '' }) {
  const db = getDb();
  for (const i of items || []) {
    if (!(i.qty > 0) || !isFinite(i.qty)) fail('Количество должно быть больше нуля');
    const have = whQty(db, i.stockId, fromId);
    if (i.qty > have + 1e-9) fail(`Не хватает на складе: ${db.getFirstSync(`SELECT name FROM stock WHERE id = ?`, [i.stockId])?.name || ''} (есть ${r3(have)})`);
  }
  db.execSync('BEGIN');
  try { const id = transferInner(db, fromId, toId, items, note); db.execSync('COMMIT'); return id; }
  catch (e) { try { db.execSync('ROLLBACK'); } catch (_) {} throw e; }
}
export function getTransfers({ warehouseId = null, limit = 50 } = {}) {
  const db = getDb();
  const where = warehouseId ? `WHERE t.from_id = ? OR t.to_id = ?` : '';
  return db.getAllSync(
    `SELECT t.*, (SELECT COUNT(*) FROM stock_transfer_items i WHERE i.transfer_id = t.id) AS positions,
            (SELECT COALESCE(SUM(i.qty * i.cost_per_unit), 0) FROM stock_transfer_items i WHERE i.transfer_id = t.id) AS total
     FROM stock_transfers t ${where} ORDER BY t.created_at DESC, t.id DESC LIMIT ?`,
    warehouseId ? [warehouseId, warehouseId, limit] : [limit]).map(t => ({ ...t, total: Math.round(t.total) }));
}

// Список для закупки: позиции ниже порога (на складе или в целом) и сколько докупить до двойного порога
export function getPurchaseList(warehouseId = null) {
  const db = getDb();
  const rows = warehouseId
    ? db.getAllSync(`SELECT s.name, s.unit, s.порог AS thr, s.avg_price AS cost, COALESCE(sbl.остаток, 0) AS have FROM stock s LEFT JOIN stock_by_location sbl ON sbl.stock_id = s.id AND sbl.location_id = ? WHERE s.порог > 0`, [warehouseId])
    : db.getAllSync(`SELECT name, unit, порог AS thr, avg_price AS cost, остаток AS have FROM stock WHERE порог > 0`);
  return rows.filter(r => r.have <= r.thr).map(r => { const need = Math.ceil(Math.max(0, r.thr * 2 - r.have) * 10) / 10; return { name: r.name, unit: r.unit || '', have: r3(r.have), need, sum: Math.round(need * (r.cost || 0)) }; })
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

// ── отключение и удаление ──
function stockOf(db, wids) {
  if (!wids.length) return { positions: 0, value: 0 };
  const ph = wids.map(() => '?').join(',');
  const x = db.getFirstSync(`SELECT COUNT(*) AS c, COALESCE(SUM(sbl.остаток * COALESCE(s.avg_price, 0)), 0) AS v FROM stock_by_location sbl JOIN stock s ON s.id = sbl.stock_id WHERE sbl.location_id IN (${ph}) AND sbl.остаток != 0`, wids);
  return { positions: x.c, value: Math.round(x.v) };
}
function moveAll(db, fromId, toId, note) {
  const rows = db.getAllSync(`SELECT stock_id AS stockId, остаток AS qty FROM stock_by_location WHERE location_id = ? AND остаток != 0`, [fromId]);
  if (rows.length) transferInner(db, fromId, toId, rows, note);
}
// Что мешает и что произойдёт — для окна подтверждения
export function checkRemoveLocation(id) {
  const db = getDb(), wids = db.getAllSync(`SELECT id FROM warehouses WHERE location_id = ?`, [id]).map(w => w.id);
  return {
    isLast: db.getFirstSync(`SELECT COUNT(*) AS c FROM locations WHERE active = 1 AND id != ?`, [id]).c === 0,
    openShift: !!db.getFirstSync(`SELECT 1 AS x FROM shifts WHERE location_id = ? AND status = 'open' LIMIT 1`, [id]),
    stock: stockOf(db, wids),
    history: { shifts: db.getFirstSync(`SELECT COUNT(*) AS c FROM shifts WHERE location_id = ?`, [id]).c, orders: db.getFirstSync(`SELECT COUNT(*) AS c FROM orders WHERE location_id = ?`, [id]).c, expenses: db.getFirstSync(`SELECT COUNT(*) AS c FROM expenses WHERE location_id = ?`, [id]).c },
  };
}
// action: 'disable' (обратимо) | 'delete' (навсегда, история остаётся «без локации»); остатки переносятся на moveToWarehouseId
export function removeLocation({ id, action, moveToWarehouseId = null }) {
  const db = getDb(), c = checkRemoveLocation(id);
  if (c.isLast) fail('Единственную локацию удалить нельзя — выключите модуль');
  if (c.openShift) fail('Идёт смена — сначала закройте её');
  const wids = db.getAllSync(`SELECT id FROM warehouses WHERE location_id = ?`, [id]).map(w => w.id);
  if (c.stock.positions) {
    const t = moveToWarehouseId && db.getFirstSync(`SELECT id FROM warehouses WHERE id = ? AND active = 1 AND location_id != ?`, [moveToWarehouseId, id]);
    if (!t) fail('Укажите склад другой локации, куда перенести остатки');
  }
  db.execSync('BEGIN');
  try {
    for (const w of wids) if (c.stock.positions) moveAll(db, w, moveToWarehouseId, action === 'delete' ? 'Перенос при удалении локации' : 'Перенос при отключении локации');
    const bound = parseInt(getSetting('workstationId'), 10);
    if (bound && db.getFirstSync(`SELECT 1 AS x FROM workstations WHERE id = ? AND location_id = ?`, [bound, id])) setSetting('workstationId', '');
    if (action === 'delete') {
      for (const t of ['orders', 'shifts', 'expenses', 'users', 'inventory_acts']) db.runSync(`UPDATE ${t} SET location_id = NULL WHERE location_id = ?`, [id]);
      for (const w of wids) { db.runSync(`DELETE FROM stock_by_location WHERE location_id = ?`, [w]); db.runSync(`UPDATE inventory_acts SET warehouse_id = NULL WHERE warehouse_id = ?`, [w]); }
      db.runSync(`DELETE FROM workstations WHERE location_id = ?`, [id]);
      db.runSync(`DELETE FROM warehouses WHERE location_id = ?`, [id]);
      db.runSync(`DELETE FROM locations WHERE id = ?`, [id]);
    } else {
      db.runSync(`UPDATE locations SET active = 0 WHERE id = ?`, [id]);
      db.runSync(`UPDATE warehouses SET active = 0 WHERE location_id = ?`, [id]);
      db.runSync(`UPDATE workstations SET active = 0 WHERE location_id = ?`, [id]);
    }
    db.execSync('COMMIT');
  } catch (e) { try { db.execSync('ROLLBACK'); } catch (_) {} throw e; }
  ensureStructure();
}
export function checkRemoveWarehouse(id) {
  const db = getDb(), w = db.getFirstSync(`SELECT * FROM warehouses WHERE id = ?`, [id]);
  return {
    isLast: db.getFirstSync(`SELECT COUNT(*) AS c FROM warehouses WHERE location_id = ? AND active = 1 AND id != ?`, [w.location_id, id]).c === 0,
    stock: stockOf(db, [id]), workstations: db.getFirstSync(`SELECT COUNT(*) AS c FROM workstations WHERE warehouse_id = ? AND active = 1`, [id]).c,
    history: { orders: db.getFirstSync(`SELECT COUNT(*) AS c FROM stock_deductions WHERE warehouse_id = ?`, [id]).c },
  };
}
// Остатки и рабочие места склада переходят на moveToWarehouseId (склад той же локации)
export function removeWarehouse({ id, action, moveToWarehouseId = null }) {
  const db = getDb(), w = db.getFirstSync(`SELECT * FROM warehouses WHERE id = ?`, [id]), c = checkRemoveWarehouse(id);
  if (c.isLast) fail('Единственный склад локации удалить нельзя');
  const needTarget = c.stock.positions > 0 || c.workstations > 0;
  const t = moveToWarehouseId && db.getFirstSync(`SELECT id FROM warehouses WHERE id = ? AND active = 1 AND location_id = ? AND id != ?`, [moveToWarehouseId, w.location_id, id]);
  if (needTarget && !t) fail('Укажите другой склад этой локации, куда перенести остатки и рабочие места');
  db.execSync('BEGIN');
  try {
    if (c.stock.positions) moveAll(db, id, t.id, action === 'delete' ? 'Перенос при удалении склада' : 'Перенос при отключении склада');
    if (t) db.runSync(`UPDATE workstations SET warehouse_id = ? WHERE warehouse_id = ?`, [t.id, id]);
    if (action === 'delete') { db.runSync(`DELETE FROM stock_by_location WHERE location_id = ?`, [id]); db.runSync(`UPDATE inventory_acts SET warehouse_id = NULL WHERE warehouse_id = ?`, [id]); db.runSync(`DELETE FROM warehouses WHERE id = ?`, [id]); }
    else db.runSync(`UPDATE warehouses SET active = 0 WHERE id = ?`, [id]);
    if (w.is_main) { const nx = getMainWarehouse(w.location_id); if (nx) db.runSync(`UPDATE warehouses SET is_main = 1 WHERE id = ?`, [nx.id]); }
    db.execSync('COMMIT');
  } catch (e) { try { db.execSync('ROLLBACK'); } catch (_) {} throw e; }
}
