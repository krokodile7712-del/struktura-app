// Навигация экрана «Настройки»: страницы сгруппированы по смыслу. section — раздел старого содержимого (его внутренние блоки показываются по part).
export const NAV_GROUPS = [
  { title: 'Заведение', items: [
    { page: 'prof', section: 'business', icon: 'note', label: 'Профиль бизнеса' },
    { page: 'mods', section: 'business', icon: 'grid', label: 'Модули и термины' }] },
  { title: 'Клиенты и сотрудники', items: [
    { page: 'emp', section: 'employees', icon: 'users', label: 'Сотрудники' },
    { page: 'book', section: 'business', icon: 'calendar', label: 'Онлайн-запись' },
    { page: 'loy', section: 'loyalty', icon: 'zap', label: 'Лояльность' },
    { page: 'disc', section: 'discounts', icon: 'tag', label: 'Скидки' }] },
  { title: 'Деньги, склад и зал', items: [
    { page: 'pay', section: 'payment', icon: 'cash', label: 'Оплата' },
    { page: 'rcpt', section: 'business', icon: 'receipt', label: 'Чек и налоги' },
    { page: 'stk', section: 'stock', icon: 'package', label: 'Склад' },
    { page: 'loc', section: 'locations', icon: 'split', label: 'Локации и склады' },
    { page: 'zone', section: 'payment', icon: 'rows', label: 'Зоны и столы' }] },
  { title: 'Система', items: [
    { page: 'sys', section: 'system', icon: 'gear', label: 'Данные и безопасность' },
    { page: 'view', section: 'business', icon: 'sliders', label: 'Вид и тема' }] },
];
export const PAGES = NAV_GROUPS.flatMap(g => g.items);
export const PAGE_INFO = Object.fromEntries(PAGES.map(p => [p.page, p]));
// Старые ключи разделов (их используют туры и переходы из других экранов) → страница по умолчанию
export const OLD_TO_PAGE = { employees: 'emp', loyalty: 'loy', payment: 'pay', discounts: 'disc', stock: 'stk', locations: 'loc', business: 'prof', system: 'sys' };
export const pageFromParam = key => (PAGE_INFO[key] ? key : OLD_TO_PAGE[key] || 'prof');

// Поиск по настройкам: [текст, страница]
const INDEX = [
  ['Название заведения', 'prof'], ['Город, адрес, телефон', 'prof'], ['Рабочие часы', 'prof'], ['Контакты для клиентов', 'prof'], ['Социальные сети', 'prof'], ['Онлайн-запись: подключение, ссылка, QR', 'book'], ['Онлайн-запись: выбор времени, интервал', 'book'], ['Вид записи: кафе, услуги, производство', 'book'],
  ['Тип бизнеса', 'mods'], ['Термины: клиент, сотрудник, заказ', 'mods'], ['Модули: включить или выключить разделы', 'mods'], ['Названия ролей', 'mods'],
  ['Сотрудники и права доступа', 'emp'], ['PIN-код сотрудника', 'emp'], ['Зарплата и KPI', 'emp'],
  ['Модель лояльности: баллы, скидка, абонемент', 'loy'], ['Процент начисления баллов', 'loy'], ['Максимум оплаты баллами', 'loy'],
  ['Скидка на товар', 'disc'], ['Скидка клиента', 'disc'], ['Ручные скидки кассира', 'disc'], ['Максимальная скидка на заказ', 'disc'], ['Суммирование скидок', 'disc'],
  ['Способы оплаты', 'pay'], ['Налоги, НДС, ИНН', 'rcpt'], ['Автофискализация', 'rcpt'], ['Чек: название и подвал', 'rcpt'], ['Валюта и формат даты', 'rcpt'],
  ['Автосписание со склада', 'stk'], ['Предупреждение о низком остатке', 'stk'], ['Несколько локаций', 'loc'], ['Склады и рабочие места', 'loc'], ['Зоны и столы', 'zone'],
  ['Резервная копия', 'sys'], ['Восстановить из копии', 'sys'], ['Автоблокировка', 'sys'], ['ПИН-код (PIN) администратора', 'sys'], ['Сбросить продажи и клиентов', 'sys'], ['Начать заново', 'sys'], ['Сменить аккаунт', 'sys'], ['Показать подсказки заново', 'sys'],
  ['Тема оформления', 'view'],
];
export function searchSettings(q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return [];
  return INDEX.filter(([t]) => t.toLowerCase().includes(s)).slice(0, 7).map(([text, page]) => ({ text, page, label: PAGE_INFO[page].label }));
}

// Склонение числительных: plural(2, 'сотрудник', 'сотрудника', 'сотрудников')
export const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
