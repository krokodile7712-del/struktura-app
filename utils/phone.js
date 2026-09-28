// Единый формат телефона клиента во всём приложении: +7 (9XX) XXX-XX-XX
// Только российские мобильные (код начинается с 9). В базе номер хранится
// ровно в таком виде, поиск сравнивает только цифры — поэтому «123-45»,
// «1234567» и «+7 (999) 123-45-67» находят одного и того же клиента.

export const PHONE_PLACEHOLDER = '+7 (9XX) XXX-XX-XX';
export const PHONE_ERROR = 'Введите номер полностью: +7 (9XX) XXX-XX-XX';

export const digitsOf = (s) => String(s ?? '').replace(/\D/g, '');

// Национальная часть номера (до 10 цифр) из любого ввода. Ввод «8999…»,
// «7999…», «+7 999…» приводится к «999…». Первая цифра обязана быть 9 —
// иначе ввод отбрасывается целиком (городские и чужие номера не проходят).
export function nationalDigits(input) {
  let d = digitsOf(input);
  if (d.length > 0 && (d[0] === '7' || d[0] === '8')) d = d.slice(1);
  if (d.length > 0 && d[0] !== '9') return '';
  return d.slice(0, 10);
}

// Маска по мере ввода: '' → '+7 (9' → '+7 (999) 12' → '+7 (999) 123-45-67'
export function maskPhone(input) {
  const n = nationalDigits(input);
  if (!n) return '';
  let out = '+7 (' + n.slice(0, 3);
  if (n.length > 3) out += ') ' + n.slice(3, 6);
  if (n.length > 6) out += '-' + n.slice(6, 8);
  if (n.length > 8) out += '-' + n.slice(8, 10);
  return out;
}

// Номер введён полностью и в допустимом виде
export const isValidPhone = (s) => nationalDigits(s).length === 10;

// Пустой номер допустим (поле необязательное), но заполненный обязан быть полным
export const isPhoneOkOrEmpty = (s) => !String(s ?? '').trim() || isValidPhone(s);

// Приводит номер к единому виду для сохранения. Пустая строка остаётся пустой.
export function toStoredPhone(s) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  return isValidPhone(t) ? maskPhone(t) : t;
}

// Для миграции старых данных: вернёт номер в едином формате или null,
// если из строки такой номер получить нельзя (городской, обрезанный, мусор)
export function normalizeLegacyPhone(s) {
  const d = digitsOf(s);
  let national = null;
  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) national = d.slice(1);
  else if (d.length === 10) national = d;
  if (!national || national[0] !== '9') return null;
  return maskPhone(national);
}

// Хранится не в едином формате (нужна ручная правка) — для пометки ⚠
export const isNonStandardPhone = (s) => {
  const t = String(s ?? '').trim();
  return !!t && !(isValidPhone(t) && t === maskPhone(t));
};

// Варианты цифр запроса для поиска: как введено и с ведущей «8» вместо «7»
// (8 999… = +7 999…). Оба нужны: первый находит старые номера, которые
// хранятся с ведущей 8, второй — номера в едином формате.
export function phoneSearchVariants(query) {
  const raw = digitsOf(query);
  if (!raw) return [];
  const conv = raw[0] === '8' ? '7' + raw.slice(1) : raw;
  return conv === raw ? [raw] : [raw, conv];
}

// Подходит ли клиент под строку поиска (имя или цифры телефона)
export function matchesClientQuery(client, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  if ((client.fio || '').toLowerCase().includes(q)) return true;
  const stored = digitsOf(client.phone);
  return phoneSearchVariants(q).some(v => stored.includes(v));
}
