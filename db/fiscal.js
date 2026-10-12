import { getFiscalQueue, updateFiscalStatus, getSetting } from './queries';

// Заготовка под онлайн-кассу (54-ФЗ). Очередь чеков уже есть (таблица fiscal_queue, сборка чека buildFiscalPayload в queries.js),
// здесь — недостающий слой: поставщики кассы, сводка очереди и обработка очереди. Пока подключена заглушка «Не подключена»:
// чеки только копятся и видны в «Продажи → Чеки» и «Настройки → Чек и налоги → Очередь чеков».
//
// Как подключить настоящую кассу (АТОЛ Онлайн, CloudKassir и т. п.): добавить запись в FISCAL_PROVIDERS с функцией send(payload) и выбрать её
// настройкой fiscalProvider. send получает готовый слепок чека и возвращает { ok: true, fiscalData } или { ok: false, error }.
export const FISCAL_PROVIDERS = {
  none: { id: 'none', name: 'Не подключена', connected: false, send: async () => ({ ok: false, error: 'Онлайн-касса не подключена' }) },
};
export const registerFiscalProvider = p => { FISCAL_PROVIDERS[p.id] = p; };
export const getFiscalProvider = () => FISCAL_PROVIDERS[getSetting('fiscalProvider') || 'none'] || FISCAL_PROVIDERS.none;

export const STATUS_LABEL = { pending: 'В очереди', sent: 'Отправлен', error: 'Ошибка' };

export function getFiscalSummary() {
  const rows = getFiscalQueue() || [], by = s => rows.filter(r => r.status === s).length, p = getFiscalProvider();
  return { total: rows.length, pending: by('pending'), sent: by('sent'), error: by('error'), connected: !!p.connected, provider: p.name };
}
export const listFiscal = (limit = 100) => (getFiscalQueue() || []).slice(0, limit);

// Отправка очереди. Без подключённой кассы статусы НЕ меняются (чеки остаются в очереди) — возвращается причина.
export async function processFiscalQueue() {
  const p = getFiscalProvider(), todo = (getFiscalQueue() || []).filter(r => r.status === 'pending' || r.status === 'error');
  if (!p.connected) return { sent: 0, failed: 0, skipped: todo.length, reason: 'Онлайн-касса не подключена: чеки остаются в очереди и отправятся после подключения' };
  let sent = 0, failed = 0;
  for (const r of todo) {
    let res; try { res = await p.send(r.payload ? JSON.parse(r.payload) : {}); } catch (e) { res = { ok: false, error: e?.message || 'Ошибка отправки' }; }
    if (res && res.ok) { updateFiscalStatus(r.order_id, 'sent', ''); sent++; } else { updateFiscalStatus(r.order_id, 'error', (res && res.error) || 'Ошибка отправки'); failed++; }
  }
  return { sent, failed, skipped: 0, reason: '' };
}
export const retryFiscal = orderId => updateFiscalStatus(orderId, 'pending', '');
