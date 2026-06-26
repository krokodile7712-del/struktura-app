import { getDb } from './database';

const GAS_URL = 'https://script.google.com/macros/s/AKfycbyhQdWnyjnsNdSxwy-elb9c2xdy_5youCoCvCWv8dWrzy96uy4Hxb94MSAVdF5eqCZYLg/exec';

let syncTimer = null;
let isSyncing = false;

// ─── Утилита запроса к GAS ────────────────────────────────────────────────

async function gasRequest(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GAS_URL}?${qs}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.trim().startsWith('<')) throw new Error('GAS вернул HTML — обновите развёртывание');
  return JSON.parse(text);
}

// ─── Синхронизация заказов ────────────────────────────────────────────────

async function syncOrders(db) {
  const orders = db.getAllSync(`SELECT * FROM orders WHERE synced = 0 LIMIT 20`);
  for (const order of orders) {
    const items = db.getAllSync(`SELECT * FROM order_items WHERE order_id = ?`, [order.id]);
    const client = order.client_id
      ? db.getFirstSync(`SELECT code FROM clients WHERE id = ?`, [order.client_id])
      : null;
    const shift = order.shift_id
      ? db.getFirstSync(`SELECT opened_at FROM shifts WHERE id = ?`, [order.shift_id])
      : null;
    const shiftDate = shift
      ? new Date(shift.opened_at).toISOString().slice(0, 10)
      : new Date(order.created_at).toISOString().slice(0, 10);

    await gasRequest({
      action: 'appendOrder',
      order_id:    order.id,
      created_at:  order.created_at,
      method:      order.method,
      shift_date:  shiftDate,
      client_code: client?.code || '',
      items:       JSON.stringify(items.map(i => ({
        name: i.name, size: i.size, milk: i.milk, syrup: i.syrup, price: i.price,
      }))),
    });
    db.runSync(`UPDATE orders SET synced = 1 WHERE id = ?`, [order.id]);
  }
  return orders.length;
}

// ─── Синхронизация расходов ───────────────────────────────────────────────

async function syncExpenses(db) {
  const expenses = db.getAllSync(`SELECT * FROM expenses WHERE synced = 0 LIMIT 20`);
  for (const e of expenses) {
    await gasRequest({
      action:   'appendExpense',
      date:     e.date,
      category: e.category,
      amount:   e.amount,
      comment:  e.comment || '',
    });
    db.runSync(`UPDATE expenses SET synced = 1 WHERE id = ?`, [e.id]);
  }
  return expenses.length;
}

// ─── Синхронизация новых клиентов ────────────────────────────────────────

async function syncClients(db) {
  const clients = db.getAllSync(`SELECT * FROM clients WHERE synced = 0 LIMIT 20`);
  for (const c of clients) {
    await gasRequest({
      action: 'appendClient',
      code:   c.code,
      fio:    c.fio,
      phone:  c.phone || '',
    });
    db.runSync(`UPDATE clients SET synced = 1 WHERE id = ?`, [c.id]);
  }
  return clients.length;
}

// ─── Синхронизация смен ───────────────────────────────────────────────────

async function syncShifts(db) {
  const shifts = db.getAllSync(`SELECT * FROM shifts WHERE synced = 0 LIMIT 10`);
  for (const s of shifts) {
    await gasRequest({
      action:      'appendShift',
      opened_at:   s.opened_at,
      closed_at:   s.closed_at || '',
      role:        'Бариста',
      cash_open:   0,
      cash_close:  s.cash_total || 0,
    });
    db.runSync(`UPDATE shifts SET synced = 1 WHERE id = ?`, [s.id]);
  }
  return shifts.length;
}

// ─── Главная функция синхронизации ───────────────────────────────────────

export async function runSync() {
  if (isSyncing) return { skipped: true };
  isSyncing = true;
  const result = { orders: 0, expenses: 0, clients: 0, shifts: 0, errors: [] };
  const db = getDb();

  try { result.orders   = await syncOrders(db);   } catch (e) { result.errors.push(`Заказы: ${e.message}`); }
  try { result.expenses = await syncExpenses(db);  } catch (e) { result.errors.push(`Расходы: ${e.message}`); }
  try { result.clients  = await syncClients(db);   } catch (e) { result.errors.push(`Клиенты: ${e.message}`); }
  try { result.shifts   = await syncShifts(db);    } catch (e) { result.errors.push(`Смены: ${e.message}`); }

  isSyncing = false;
  const total = result.orders + result.expenses + result.clients + result.shifts;
  if (total > 0 || result.errors.length > 0) {
    console.log('[SYNC]', JSON.stringify(result));
  }
  return result;
}

// ─── Запуск/остановка автосинхронизации ──────────────────────────────────

export function startAutoSync(intervalMs = 2 * 60 * 1000) {
  if (syncTimer) clearInterval(syncTimer);
  // Первый запуск через 10 секунд после старта приложения
  setTimeout(() => runSync(), 10000);
  syncTimer = setInterval(() => runSync(), intervalMs);
  console.log(`[SYNC] Автосинхронизация запущена (каждые ${intervalMs / 1000}с)`);
}

export function stopAutoSync() {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
}

// ─── Количество несинхронизированных записей (для UI) ────────────────────

export function getPendingCount() {
  const db = getDb();
  try {
    const o = db.getFirstSync(`SELECT COUNT(*) as n FROM orders   WHERE synced = 0`)?.n || 0;
    const e = db.getFirstSync(`SELECT COUNT(*) as n FROM expenses WHERE synced = 0`)?.n || 0;
    const c = db.getFirstSync(`SELECT COUNT(*) as n FROM clients  WHERE synced = 0`)?.n || 0;
    const s = db.getFirstSync(`SELECT COUNT(*) as n FROM shifts   WHERE synced = 0`)?.n || 0;
    return o + e + c + s;
  } catch { return 0; }
}
