import { getDb } from './database';
import { getSetting, setSetting, getBusinessProfile, getOrCreateBookingSecret, getCategoryOrder, getProductVariants } from './queries';
import { supabase, getBusinessIdBySlug } from './supabase';
import { getBookingStaff, getBookingServices, syncBookingServices, getOnlinePage, getBookingLink } from './bookings';

// Страницы для клиентов: регистрация по QR и онлайн-запись. Оформление, тексты, меню и схема проезда настраиваются в приложении
// и публикуются в облако одной кнопкой; страницы (cloud/pages) читают их оттуда. Общие настройки (логотип, цвет, контакты, схема)
// хранятся один раз и действуют на обе страницы.
export const ACCENTS = [['platinum', 'Платина'], ['gold', 'Золото'], ['emerald', 'Изумруд'], ['rose', 'Роза'], ['graphite', 'Графит']];
export const ROUTE_ICONS = ['door', 'lift', 'stairs', 'walk', 'bus', 'park', 'cafe', 'pin'];
export const DEFAULTS = {
  shared: { accent: 'platinum', calm: false, logo: '', address: '', hours: '', phone: '', whatsapp: '', telegram: '', mapUrl: '', routeShow: true, route: [] },
  reg: { eyebrow: 'Карта гостя', title: 'Добро пожаловать', lead: 'Узнаем вас по номеру телефона — без пластика и приложений.', cta: 'Получить карту', bonusLabel: 'Приветственный бонус',
    bonusSub: 'сразу на карту после регистрации', doneText: 'Ваша карта готова. Назовите номер телефона на кассе — мы вас узнаем.', showMenu: true, routeSize: 'full' },
  book: { eyebrow: 'Онлайн-запись', title: 'Выберите удобное время', lead: 'Три шага: услуга, время, контакты. Подтвердим запись и напомним.', cta: 'Записаться',
    busyText: 'Сейчас всё занято. Свяжитесь с нами, чтобы уточнить, на какое время можно записаться.', step: 30, lead_min: 30 },
  bonus: { enabled: false, amount: 300, days: 60 },
};
const SECTIONS = ['shared', 'reg', 'book', 'bonus'];

export function getClientPages() {
  let raw = {};
  try { raw = JSON.parse(getSetting('clientPages') || '{}'); } catch (_) { raw = {}; }
  const out = {};
  for (const k of SECTIONS) out[k] = { ...DEFAULTS[k], ...(raw[k] || {}) };
  return out;
}
export function saveClientPages(section, patch) {
  if (!SECTIONS.includes(section)) throw new Error('Неизвестный раздел настроек');
  const all = getClientPages(); all[section] = { ...all[section], ...patch };
  setSetting('clientPages', JSON.stringify(all));
  return all;
}

// ── меню страницы: товары каталога с флагом menu_visible ──
export function priceText(p) {
  const v = getProductVariants(p.id).map(x => Math.round(x.price || 0)).filter(x => x > 0);
  const u = [...new Set(v)].sort((a, b) => a - b);
  return u.length ? u.slice(0, 3).join(' / ') : String(Math.round(p.price || 0));
}
export function getMenuProducts() {
  return getDb().getAllSync(`SELECT id, name, category, price, COALESCE(menu_visible, 0) AS on_menu FROM products WHERE active = 1 ORDER BY category, name`)
    .map(p => ({ id: p.id, name: p.name, category: p.category || 'Без категории', price: priceText(p), on: !!p.on_menu }));
}
export function setMenuVisible(id, on) { getDb().runSync(`UPDATE products SET menu_visible = ? WHERE id = ?`, [on ? 1 : 0, id]); }
export function setAllMenuVisible(on) { getDb().runSync(`UPDATE products SET menu_visible = ? WHERE active = 1`, [on ? 1 : 0]); }
// Группы — категории в порядке Кассы, позиции — по названию; цена общая с каталогом
export function buildMenu() {
  const groups = {};
  getMenuProducts().filter(p => p.on).forEach(p => { (groups[p.category] = groups[p.category] || []).push([p.name, p.price]); });
  const order = getCategoryOrder() || [];
  const keys = Object.keys(groups).sort((a, b) => { const i = order.indexOf(a), j = order.indexOf(b); return (i < 0 ? 999 : i) - (j < 0 ? 999 : j) || a.localeCompare(b, 'ru'); });
  return keys.map(k => ({ g: k, n: '', items: groups[k] }));
}

// ── конфигурация ──
const tzMin = () => -new Date().getTimezoneOffset();
export function buildPublicConfig() {
  const p = getClientPages();
  return {
    shared: p.shared,
    reg: { ...p.reg, menu: buildMenu() },
    book: { ...p.book },
    capacity: Math.max(1, getBookingStaff().length),
    tz: tzMin(),
  };
}
// То, что видит предпросмотр: общее + своё; для записи — ещё и реальные услуги и часы, для регистрации — бонус
export function previewConfig(page) {
  const p = getClientPages(), prof = getBusinessProfile() || {};
  if (page === 'reg') return { ...p.shared, ...p.reg, menu: buildMenu(), bonus: p.bonus.enabled ? p.bonus.amount : 0 };
  return { ...p.shared, ...p.book, capacity: Math.max(1, getBookingStaff().length),
    hoursFrom: prof.work_hours_from || '09:00', hoursTo: prof.work_hours_to || '21:00', step: p.book.step || 30, timeSlots: prof.time_slots_enabled !== false,
    services: getBookingServices().map(s => ({ id: s.id, name: s.name, price: s.price, duration: s.duration, desc: s.description })) };
}

// ── публикация ──
const hash = str => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return String(h); };
const stamp = () => { const c = buildPublicConfig(), b = getClientPages().bonus; return hash(JSON.stringify(c) + JSON.stringify(b) + JSON.stringify(getBookingServices())); };
export function getPublishState() {
  const at = getSetting('clientPagesPublishedAt') || '', last = getSetting('clientPagesHash') || '';
  return { published: !!at, at, dirty: last !== stamp() };
}
export function getPageLinks() {
  const { connected, slug } = getOnlinePage();
  return { connected, slug, reg: connected ? `https://struktura-crm.github.io/struktura-booking/register.html?slug=${slug}` : '', book: connected ? getBookingLink(slug) : '' };
}
export async function publishClientPages() {
  const { connected, slug } = getOnlinePage();
  if (!connected) throw new Error('Сначала подключите онлайн-страницу (меню «⋯» в «Записях» → «Ссылка и QR»)');
  const id = await getBusinessIdBySlug(slug);
  if (!id) throw new Error('Нет связи с облаком');
  const secret = getOrCreateBookingSecret(), bonus = getClientPages().bonus;
  await syncBookingServices();                                 // услуги для записи — вместе со всем остальным
  const a = await supabase.rpc('publish_client_pages_secure', { p_business_id: id, p_secret: secret, p_config: buildPublicConfig() });
  if (a.error || a.data !== true) throw new Error('Не удалось опубликовать страницы' + (a.error ? ': ' + a.error.message : ''));
  const b = await supabase.rpc('set_loyalty_config_secure', { p_business_id: id, p_secret: secret, p_enabled: !!bonus.enabled, p_bonus: Number(bonus.amount) || 0, p_valid_days: Math.round(Number(bonus.days)) || 60 });
  if (b.error || b.data !== true) throw new Error('Не удалось сохранить бонус и включение регистрации' + (b.error ? ': ' + b.error.message : ''));
  setSetting('clientPagesHash', stamp()); setSetting('clientPagesPublishedAt', new Date().toISOString());
}
