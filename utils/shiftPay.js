// Ставка сотрудника и начисление за смену — подписи и предпросмотр в окнах журнала.
// Сам расчёт зарплаты — calcEmployeeSalary в db/queries.js (одна формула на журнал и отчётность).
const rub = n => Math.round(n || 0).toLocaleString('ru-RU');

export function rateText(u) {
  const a = u?.salary_amount || 0;
  if (!a) return 'ставка не задана';
  switch (u.salary_type) {
    case 'shift': return `Ставка за смену · ${rub(a)} ₽`;
    case 'hourly': return `Почасовая · ${rub(a)} ₽/ч`;
    case 'monthly': return `Оклад · ${rub(a)} ₽/мес`;
    case 'revenue_pct': case 'profit_pct': return `${a}% от выручки`;
    default: return `${rub(a)} ₽`;
  }
}

// Начисление за одну смену длительностью minutes: { amount, text }. amount = null — за отдельную смену не считается.
export function shiftPay(u, minutes) {
  const a = u?.salary_amount || 0, h = minutes / 60, hs = (Math.round(h * 10) / 10).toString().replace('.', ',');
  if (!a) return { amount: 0, text: 'Ставка не задана — зарплата будет 0. Задайте её в разделе «Сотрудники».' };
  switch (u.salary_type) {
    case 'shift': return { amount: a, text: `Фиксированная ставка ${rub(a)} ₽ — от времени не зависит.` };
    case 'hourly': return { amount: Math.round(a * h), text: `${rub(a)} ₽ × ${hs} ч = ${rub(a * h)} ₽` };
    default: return { amount: null, text: 'Оклад или процент — отдельно за смену не считается, входит в итог за период.' };
  }
}

export const fmtDur = m => (m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ''}`);
