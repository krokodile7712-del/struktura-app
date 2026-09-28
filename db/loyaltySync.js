// Загрузка заявок на регистрацию по QR из облака в клиенты приложения.
// Не фоновая: вызывается при заходе в «Клиенты», при открытии выбора клиента
// в Кассе и по кнопке обновления. Весь обмен с облаком — через db/supabase.js,
// при переезде на свой сервер меняются только эти вызовы.
import { getBusinessIdBySlug, getLoyaltySignups, markLoyaltySignupsImported, deleteLoyaltySignupByPhone } from './supabase';
import {
  getBusinessProfile, getOrCreateBookingSecret, importLoyaltySignup, expireWelcomeBonuses,
  getSetting, setSetting, getClientById, deleteClient,
} from './queries';
import { emit } from './events';

let running = false;
let lastRun = 0;
const MIN_INTERVAL_MS = 30 * 1000; // чаще раза в полминуты без force не ходим

// Возвращает { imported, skipped } или null (нет подключения онлайн-записи,
// нет связи, слишком часто, уже идёт загрузка). Ошибки не пробрасывает.
export async function syncLoyaltySignups({ force = false } = {}) {
  if (running) return null;
  if (!force && Date.now() - lastRun < MIN_INTERVAL_MS) return null;
  running = true;
  try {
    const profile = getBusinessProfile();
    const slug = profile?.booking_slug;
    if (!slug) return null; // онлайн-запись не подключена — регистрации в облако не приходят
    const secret = getOrCreateBookingSecret();
    if (!secret) return null;
    const businessId = await getBusinessIdBySlug(slug);
    if (!businessId) return null;

    const rows = await getLoyaltySignups(businessId, secret);
    let imported = 0, skipped = 0;
    const handled = [];
    for (const row of rows) {
      try {
        const r = importLoyaltySignup(row);
        if (r.status === 'imported') imported++; else skipped++;
        handled.push(row.id); // закрываем и пропущенные (дубль номера, битый номер), иначе будут возвращаться вечно
      } catch (e) {
        console.error('[loyaltySync] заявка не загружена, останется в облаке:', row?.id, e?.message || e);
      }
    }
    if (handled.length) await markLoyaltySignupsImported(businessId, secret, handled);
    expireWelcomeBonuses();
    flushCloudDeletions().catch(() => {}); // заодно доудаляем то, что не удалось без связи
    lastRun = Date.now();
    if (imported > 0) emit('clientsChanged', { imported });
    return { imported, skipped };
  } catch (e) {
    console.error('[loyaltySync]', e?.message || e);
    return null;
  } finally {
    running = false;
  }
}

// ─── Удаление клиента вместе с копией в облаке ───────────────────────────
// Гость, зарегистрировавшийся по QR, оставил имя и телефон в облаке. Удаляя клиента,
// нужно стереть и эту копию (152-ФЗ: по просьбе человека данные удаляются везде).
// Если связи нет, номер ждёт в очереди и стирается при следующей загрузке заявок.
// В очереди хранятся только номера уже удалённых клиентов, пока копия не стёрта.
const QUEUE_KEY = 'cloud_delete_queue';
function readQueue() {
  try { const v = JSON.parse(getSetting(QUEUE_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; }
}
const writeQueue = (q) => setSetting(QUEUE_KEY, JSON.stringify(q));

export const pendingCloudDeletions = () => readQueue().length;

let flushing = false;
// Пытается стереть в облаке всё из очереди. Возвращает { deleted, pending } —
// сколько строк стёрто и сколько номеров осталось ждать связи.
export async function flushCloudDeletions() {
  const queue = readQueue();
  if (!queue.length) return { deleted: 0, pending: 0 };
  if (flushing) return { deleted: 0, pending: queue.length };
  flushing = true;
  try {
    const slug = getBusinessProfile()?.booking_slug;
    const secret = slug ? getOrCreateBookingSecret() : null;
    const businessId = slug && secret ? await getBusinessIdBySlug(slug) : null;
    if (!businessId) return { deleted: 0, pending: queue.length };
    let deleted = 0;
    const left = [];
    for (const phone of queue) {
      try { deleted += await deleteLoyaltySignupByPhone(businessId, secret, phone); }
      catch (e) { left.push(phone); console.error('[loyaltySync] не удалось стереть в облаке:', e?.message || e); }
    }
    writeQueue(left);
    return { deleted, pending: left.length };
  } catch (e) {
    console.error('[loyaltySync]', e?.message || e);
    return { deleted: 0, pending: readQueue().length };
  } finally {
    flushing = false;
  }
}

// Удаляет клиента из приложения и, если подключена онлайн-запись, копию его регистрации в облаке.
// cloud: 'none' — облака нет или у клиента нет телефона; 'done' — стёрто; 'queued' — ждёт связи.
export async function deleteClientEverywhere(clientId) {
  const client = getClientById(clientId);
  if (!client) return { ok: false, cloud: 'none' };
  const phone = String(client.phone || '').trim();
  deleteClient(clientId);
  let connected = false;
  try { connected = !!getBusinessProfile()?.booking_slug; } catch (_) {}
  if (!phone || !connected) return { ok: true, cloud: 'none' };
  const queue = readQueue();
  if (!queue.includes(phone)) writeQueue([...queue, phone]);
  const res = await flushCloudDeletions();
  return { ok: true, cloud: res.pending > 0 ? 'queued' : 'done', deleted: res.deleted };
}
