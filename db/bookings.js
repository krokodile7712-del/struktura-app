import { getDb } from './database';
import {
  getSetting, setSetting, getBusinessProfile, getOrCreateBookingSecret, insertProduct, insertClient, getClientByCode, findClientByPhone, localDateStr,
} from './queries';
import { supabase, getBookings, updateBookingStatus, claimBusiness, syncServicesToSupabase, getBusinessIdBySlug, getCustomServices, deleteCustomService } from './supabase';
import { deleteBookingEverywhere } from './loyaltySync';

// Записи: по телефону (локально, manual_bookings) и онлайн (облако). Общая форма записи для экрана:
// { key, source:'manual'|'online', id, date, time_start, duration_min, client_name, client_phone, client_id, service_name, price,
//   product_id, once, staff_id, staff_name, comment, status, order_id }
// Услуги записи — это товары каталога с booking_visible = 1 (общая цена и название с Кассой), длительность — products.duration_min.
export const LIVE = ['pending', 'confirmed'];
export const STATUS_LABEL = { pending: 'Новая', confirmed: 'Подтверждена', done: 'Выполнена', cancelled: 'Отменена' };
const DEFAULT_DURATION = 60, MIN_DURATION = 5, MAX_DURATION = 600;

// ── время и статистика (по МЕСТНОМУ времени; раньше «сегодня» считалось по UTC и ночью показывало вчера) ──
export const todayLocal = () => localDateStr();
export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
export const toMin = t => { const [h, m] = String(t || '0:0').split(':'); return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0); };
export const toHHMM = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const endOf = b => toHHMM(toMin(b.time_start) + (b.duration_min || DEFAULT_DURATION));
export const isLive = b => LIVE.includes(b.status);
// Впереди = активная запись, начало которой позже «сейчас» (не ушедшая и не отменённая)
export const isUpcoming = (b, today = todayLocal(), now = nowMinutes()) => isLive(b) && (b.date > today || (b.date === today && toMin(b.time_start) > now));

// Сводка: сегодня (без отменённых) и сколько ещё впереди, ожидаемая выручка (подтверждённые впереди), новые заявки, ближайшая запись
export function bookingStats(list, today = todayLocal(), now = nowMinutes()) {
  const td = list.filter(b => b.date === today && b.status !== 'cancelled');
  const up = list.filter(b => isUpcoming(b, today, now)).sort((a, b) => (a.date + a.time_start).localeCompare(b.date + b.time_start));
  return {
    today: td.length, todayLeft: td.filter(b => isLive(b) && toMin(b.time_start) >= now).length,
    expected: up.filter(b => b.status === 'confirmed').reduce((s, b) => s + (b.price || 0), 0),
    pending: list.filter(b => b.status === 'pending').length, next: up[0] || null,
  };
}

// ── нормализация ──
const normManual = r => ({
  key: 'm' + r.id, source: 'manual', id: r.id, date: r.date, time_start: String(r.time_start || '').slice(0, 5), duration_min: r.duration_min || DEFAULT_DURATION,
  client_name: r.client_name, client_phone: r.client_phone || '', client_id: r.client_id || null, service_name: r.service_name || '', price: r.service_price || 0,
  product_id: r.product_id || null, once: !!r.once, staff_id: r.staff_id || null, staff_name: r.staff_name || '', comment: r.comment || '', status: r.status || 'confirmed', order_id: r.order_id || null,
});
const normOnline = (r, link) => ({
  key: 'o' + r.id, source: 'online', id: r.id, date: r.date, time_start: String(r.time_start || '').slice(0, 5), duration_min: r.services?.duration_min || DEFAULT_DURATION,
  client_name: r.client_name || '', client_phone: r.client_phone || '', client_id: null, service_name: r.services?.name || 'Без услуги', price: r.services?.price || 0,
  product_id: null, once: false, staff_id: null, staff_name: '', comment: r.note || '', status: LIVE.concat(['done', 'cancelled']).includes(r.status) ? r.status : 'pending', order_id: link?.order_id || null,
});

export function getManualBookingsList({ from, to } = {}) {
  const w = [], p = [];
  if (from) { w.push('b.date >= ?'); p.push(from); }
  if (to) { w.push('b.date <= ?'); p.push(to); }
  return getDb().getAllSync(
    `SELECT b.*, u.name AS staff_name FROM manual_bookings b LEFT JOIN users u ON u.id = b.staff_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY b.date, b.time_start`, p).map(normManual);
}
function onlineLinks() {
  try { return Object.fromEntries(getDb().getAllSync(`SELECT booking_id, order_id FROM booking_links`).map(r => [r.booking_id, r])); } catch (_) { return {}; }
}
// Онлайн-записи из облака; null — не подключено, [] с ошибкой сети не маскируем: ok=false
export async function loadOnlineBookings({ from, to } = {}) {
  const slug = getBusinessProfile()?.booking_slug;
  if (!slug) return { connected: false, ok: true, list: [] };
  try {
    const rows = await getBookings(getOrCreateBookingSecret(), null, slug, from || to ? { from, to } : undefined);
    const links = onlineLinks();
    return { connected: true, ok: true, list: (rows || []).map(r => normOnline(r, links[String(r.id)])) };
  } catch (e) { console.error('[loadOnlineBookings]', e); return { connected: true, ok: false, list: [] }; }
}
// Статус онлайн-записи в облаке; раньше экран менял статус у себя, даже если облако не ответило (false) — теперь честный результат
export async function setOnlineStatus(id, status) {
  try { return (await updateBookingStatus(id, getOrCreateBookingSecret(), status)) === true; } catch (_) { return false; }
}

// Полное удаление онлайн-записи: облако и связанные данные (имя и телефон клиента живут только там)
export async function deleteOnlineBooking(id) {
  const slug = getBusinessProfile()?.booking_slug, businessId = slug ? await getBusinessIdBySlug(slug) : null;
  if (!businessId) throw new Error('Нет связи с облаком');
  await deleteBookingEverywhere(businessId, id);
}

// ── записи по телефону ──
// Пересечение с другой активной записью того же мастера (занятость); excludeId — сама правимая запись
export function findBookingConflict({ date, time_start, duration_min, staff_id, excludeId = null }) {
  if (!staff_id) return null;
  const s = toMin(time_start), e = s + (duration_min || DEFAULT_DURATION);
  const rows = getDb().getAllSync(`SELECT * FROM manual_bookings WHERE date = ? AND staff_id = ? AND status IN ('pending','confirmed') AND id != ?`, [date, staff_id, excludeId || -1]);
  const hit = rows.find(r => toMin(r.time_start) < e && s < toMin(r.time_start) + (r.duration_min || DEFAULT_DURATION));
  return hit ? normManual(hit) : null;
}
function uniqueCode() { let c; do { c = 'CLI-' + String(Math.floor(Math.random() * 9000) + 1000); } while (getClientByCode(c)); return c; }
const fail = m => { throw new Error(m); };

// Создание и правка записи по телефону. saveToCatalog + service без product_id: услуга сохраняется в каталог (иначе — разовая позиция).
export function saveManualBooking(p) {
  const db = getDb(), name = String(p.client_name || '').trim(), dur = Math.round(p.duration_min || 0);
  if (!name) fail('Введите имя клиента');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) fail('Выберите дату');
  if (!/^\d{1,2}:\d{2}$/.test(p.time_start || '')) fail('Выберите время');
  if (dur < MIN_DURATION || dur > MAX_DURATION) fail(`Длительность — от ${MIN_DURATION} минут`);
  const svc = String(p.service_name || '').trim();
  if (!svc) fail('Выберите услугу');
  const hit = findBookingConflict({ date: p.date, time_start: p.time_start, duration_min: dur, staff_id: p.staff_id, excludeId: p.id });
  if (hit) fail(`У мастера в это время запись: ${hit.client_name}, ${hit.time_start}–${endOf(hit)}`);
  db.execSync('BEGIN');
  try {
    let productId = p.product_id || null, once = 0, clientId = p.client_id || null;
    if (!productId) {
      if (p.saveToCatalog) productId = saveBookingService({ name: svc, price: p.service_price, duration: dur, description: '' }, true);
      else once = 1;
    }
    if (!clientId && p.createClient) {
      const dup = p.client_phone && findClientByPhone(p.client_phone);
      clientId = dup ? dup.id : insertClient({ fio: name, phone: p.client_phone || '', code: uniqueCode() });
    }
    const vals = [p.date, p.time_start, dur, name, String(p.client_phone || '').trim(), clientId, svc, p.service_price || 0, productId, once, p.staff_id || null, String(p.comment || '').trim()];
    let id = p.id;
    if (id) db.runSync(`UPDATE manual_bookings SET date=?, time_start=?, duration_min=?, client_name=?, client_phone=?, client_id=?, service_name=?, service_price=?, product_id=?, once=?, staff_id=?, comment=? WHERE id=?`, [...vals, id]);
    else id = db.runSync(`INSERT INTO manual_bookings (date, time_start, duration_min, client_name, client_phone, client_id, service_name, service_price, product_id, once, staff_id, comment, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'confirmed', ?)`, [...vals, new Date().toISOString()]).lastInsertRowId;
    db.execSync('COMMIT');
    touchBusy();
    return id;
  } catch (e) { try { db.execSync('ROLLBACK'); } catch (_) {} throw e; }
}
export function setManualStatus(id, status) { getDb().runSync(`UPDATE manual_bookings SET status = ? WHERE id = ?`, [status, id]); touchBusy(); }
export function deleteManual(id) { getDb().runSync(`DELETE FROM manual_bookings WHERE id = ?`, [id]); touchBusy(); }

// «Оформить в Кассе» завершён: запись становится «Выполнена» со ссылкой на заказ и фактической суммой чека
export function completeBooking({ source, id, orderId, total }) {
  const db = getDb();
  if (source === 'manual') { db.runSync(`UPDATE manual_bookings SET status = 'done', order_id = ?, service_price = ? WHERE id = ?`, [orderId, total, id]); touchBusy(); }
  else db.runSync(`INSERT OR REPLACE INTO booking_links (booking_id, order_id, total, done_at) VALUES (?, ?, ?, ?)`, [String(id), orderId, total, new Date().toISOString()]);
}
// Что передать Кассе: клиент (по записи или по телефону в базе) и позиция
export function bookingToCart(b) {
  const db = getDb();
  let client = b.client_id ? db.getFirstSync(`SELECT * FROM clients WHERE id = ?`, [b.client_id]) : null;
  if (!client && b.client_phone) { const f = findClientByPhone(b.client_phone); if (f) client = db.getFirstSync(`SELECT * FROM clients WHERE id = ?`, [f.id]); }
  let prod = null;
  if (b.product_id) prod = db.getFirstSync(`SELECT id, name FROM products WHERE id = ?`, [b.product_id]);
  if (!prod && b.source === 'online') prod = db.getFirstSync(`SELECT id, name FROM products WHERE LOWER(name) = LOWER(?) AND active = 1`, [b.service_name]);
  return { client, item: { product_id: prod ? prod.id : null, name: prod ? prod.name : b.service_name, price: b.price || 0, quantity: 1, oneOff: !prod } };
}

// ── услуги записи (товары каталога) ──
const svcRow = p => ({ id: p.id, name: p.name, price: p.price || 0, duration: p.duration_min || DEFAULT_DURATION, description: p.booking_description || '' });
export function getBookingServices() {
  return getDb().getAllSync(`SELECT * FROM products WHERE active = 1 AND booking_visible = 1 ORDER BY name`).map(svcRow);
}
export function getCatalogForBooking() {
  return getDb().getAllSync(`SELECT * FROM products WHERE active = 1 AND COALESCE(booking_visible, 0) = 0 ORDER BY category, name`).map(svcRow);
}
// Создать услугу (новый товар «Услуги») или изменить существующую; в обоих случаях она попадает в запись. inner — внутри чужой транзакции.
export function saveBookingService({ id = null, name, price, duration, description = '' }, inner = false) {
  const db = getDb(), n = String(name || '').trim(), pr = Number(price), dur = Math.round(duration || 0);
  if (!n) fail('Введите название');
  if (!(pr > 0)) fail('Укажите цену');
  if (dur < MIN_DURATION || dur > MAX_DURATION) fail(`Длительность — от ${MIN_DURATION} минут`);
  if (db.getAllSync(`SELECT id, name FROM products WHERE active = 1`).some(p => p.id !== id && p.name.trim().toLowerCase() === n.toLowerCase())) fail('Услуга с таким названием уже есть');
  let pid = id;
  if (id) db.runSync(`UPDATE products SET name = ?, price = ? WHERE id = ?`, [n, pr, id]);
  else pid = insertProduct({ name: n, category: 'Услуги', price: pr });
  db.runSync(`UPDATE products SET booking_visible = 1, duration_min = ?, booking_description = ? WHERE id = ?`, [dur, String(description || '').trim(), pid]);
  return pid;
}
export function removeBookingService(id) { getDb().runSync(`UPDATE products SET booking_visible = 0 WHERE id = ?`, [id]); }

// ── мастера (сотрудники, принимающие записи) ──
export function getStaffSettings() { return getDb().getAllSync(`SELECT id, name, role, COALESCE(takes_bookings, 1) AS takes FROM users WHERE active != 0 ORDER BY name`); }
export function getBookingStaff() { return getStaffSettings().filter(u => u.takes); }
export function setStaffTakesBookings(id, on) { getDb().runSync(`UPDATE users SET takes_bookings = ? WHERE id = ?`, [on ? 1 : 0, id]); }

// ── онлайн-страница ──
export const getBookingLink = slug => `https://struktura-crm.github.io/struktura-booking/?slug=${slug}`;
const RU = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export const slugify = str => String(str || '').toLowerCase().split('').map(c => RU[c] ?? (/[a-z0-9]/.test(c) ? c : '-')).join('').replace(/-+/g, '-').replace(/^-|-$/g, '');
const pageSettings = p => ({ hoursFrom: p?.work_hours_from || '09:00', hoursTo: p?.work_hours_to || '21:00', slotDuration: p?.slot_duration || 60, timeSlotsEnabled: p?.time_slots_enabled !== false });
export const getOnlinePage = () => { const slug = getBusinessProfile()?.booking_slug || ''; return { connected: !!slug, slug, link: slug ? getBookingLink(slug) : '', syncedAt: getSetting('bookingSyncedAt') || '' }; };
export async function connectOnlinePage() {
  const p = getBusinessProfile(), slug = (slugify(p?.business_name || 'business') || 'business').substring(0, 30).replace(/-+$/, '');
  const biz = await claimBusiness(slug, p?.business_name || 'Мой бизнес', p?.business_type || 'cafe', pageSettings(p), getOrCreateBookingSecret());
  if (!biz) throw new Error('Не удалось подключить. Проверьте интернет.');
  const db = getDb(), row = db.getFirstSync('SELECT id FROM business_profile ORDER BY id LIMIT 1');
  if (row) db.runSync('UPDATE business_profile SET booking_slug = ? WHERE id = ?', [slug, row.id]);
  return slug;
}
// Услуги на онлайн-странице = только услуги записи с их длительностью и описанием
export async function syncBookingServices() {
  const p = getBusinessProfile(), slug = p?.booking_slug;
  if (!slug) throw new Error('Онлайн-страница не подключена');
  const secret = getOrCreateBookingSecret(), biz = await claimBusiness(slug, p.business_name, p.business_type, pageSettings(p), secret);
  if (!biz) throw new Error('Нет связи с облаком');
  const list = getBookingServices();
  const ok = await syncServicesToSupabase(biz.id, secret, list.map(s => ({ name: s.name, price: s.price, category: 'Услуги', duration_min: s.duration, booking_description: s.description, active: 1, booking_visible: 1 })));
  if (!ok) throw new Error('Не удалось обновить услуги на странице');
  setSetting('bookingSyncedAt', new Date().toISOString());
  return list.length;
}

// Старые «свои позиции» страницы (жили только в облаке, управлялись из Настроек): теперь услуга — это товар каталога, а их управление убрано.
// Чтобы они не остались на странице без возможности удалить, окно «Онлайн-страница» показывает их и позволяет убрать разом.
export async function getLegacyCustomItems() {
  const slug = getBusinessProfile()?.booking_slug, bid = slug ? await getBusinessIdBySlug(slug) : null;
  return bid ? (await getCustomServices(bid)) || [] : [];
}
export async function removeLegacyCustomItems() {
  const secret = getOrCreateBookingSecret(), list = await getLegacyCustomItems();
  for (const it of list) await deleteCustomService(it.id, secret);
  return list.length;
}

// ── занятое время для страницы онлайн-записи ──
// В облако уходят только интервалы (дата, начало, конец в минутах) активных записей по телефону — без имён и телефонов.
// Страница скрывает это время по длительности услуги; онлайн-записи облако учитывает само.
const BUSY_DAYS = 120;
export async function syncBusySlots() {
  const p = getBusinessProfile(), slug = p?.booking_slug;
  if (!slug) return 0;
  const id = await getBusinessIdBySlug(slug);
  if (!id) throw new Error('Нет связи с облаком');
  const from = todayLocal(), toD = new Date(); toD.setDate(toD.getDate() + BUSY_DAYS);
  const to = localDateStr(toD);
  const rows = getManualBookingsList({ from, to }).filter(b => isLive(b)).map(b => ({ d: b.date, s: toMin(b.time_start), e: toMin(b.time_start) + (b.duration_min || DEFAULT_DURATION) }))
    .filter(r => r.e > r.s && r.e <= 1440 + 600).map(r => ({ ...r, e: Math.min(r.e, 1440) }));
  const { data, error } = await supabase.rpc('sync_busy_slots_secure', { p_business_id: id, p_secret: getOrCreateBookingSecret(), p_from: from, p_to: to, p_rows: rows });
  if (error || typeof data !== 'number' || data < 0) throw new Error(error ? error.message : 'Не удалось передать занятое время');
  setSetting('busyDirty', '0');
  return rows.length;
}
let busyTimer = null;
// Изменили запись по телефону: помечаем «не отправлено» и через 1,5 с отправляем (без интернета остаётся пометка — отправим при следующем открытии)
export function touchBusy() {
  try {
    setSetting('busyDirty', '1');
    if (!getBusinessProfile()?.booking_slug) return;
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => { syncBusySlots().catch(e => console.warn('[занятость]', e.message)); }, 1500);
  } catch (e) { console.warn('[touchBusy]', e); }
}
export async function flushBusyIfDirty() {
  try { if (getSetting('busyDirty') === '1' && getBusinessProfile()?.booking_slug) await syncBusySlots(); } catch (e) { console.warn('[занятость]', e.message); }
}

// Однократная миграция: услуги по умолчанию скрыты от записи (остаются только настроенные вручную — с описанием для клиента)
export function migrateBookingsV1() {
  try {
    if (getSetting('bookingsV1') === '1') return false;
    getDb().runSync(`UPDATE products SET booking_visible = 0 WHERE COALESCE(booking_description, '') = ''`);
    setSetting('bookingsV1', '1');
    return true;
  } catch (e) { console.error('[migrateBookingsV1]', e); return false; }
}
