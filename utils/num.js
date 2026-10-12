// Числа из полей ввода. Русская клавиатура даёт десятичную запятую: parseFloat('5,5') молча давал 5 — теперь запятая понимается.
export function parseNum(v) {
  if (v == null) return null;
  const s = String(v).replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d*\.?\d*$/.test(s) || s === '' || s === '-' || s === '.') return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
export const fmtNum = n => (n == null ? '' : String(n).replace('.', ','));
// Проверка диапазона: min/max включительно, gt — строго больше. Возвращает текст ошибки или ''
export function rangeError(n, { min = 0, max = Infinity, gt } = {}) {
  if (n == null) return 'Введите число';
  if (gt != null && !(n > gt)) return gt === 0 ? 'Должно быть больше нуля' : `Должно быть больше ${fmtNum(gt)}`;
  if (n < min) return min === 0 ? 'Не может быть отрицательным' : `Не меньше ${fmtNum(min)}`;
  if (n > max) return `Не больше ${fmtNum(max)}`;
  return '';
}
