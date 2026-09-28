// Загрузка заявок на регистрацию по QR из облака в клиенты приложения.
// Не фоновая: вызывается при заходе в «Клиенты», при открытии выбора клиента
// в Кассе и по кнопке обновления. Весь обмен с облаком — через db/supabase.js,
// при переезде на свой сервер меняются только эти вызовы.
import { getBusinessIdBySlug, getLoyaltySignups, markLoyaltySignupsImported } from './supabase';
import { getBusinessProfile, getOrCreateBookingSecret, importLoyaltySignup, expireWelcomeBonuses } from './queries';
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
