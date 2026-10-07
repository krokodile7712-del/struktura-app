import { getDb } from './database';
import {
  calcCOGS, summarizeSales, getPayMethods, getShiftsInPeriod, getAllEmployeesSalary,
  getOverheadItems, getInvestments, localDateStartISO, getBusinessStart,
} from './queries';
export { getBusinessStart };

// Единая модель отчётности: все цифры считаются ОДИН раз за один проход, вкладки экрана только показывают готовое.
// Дни — по МЕСТНОМУ времени (время заказов хранится в UTC): раньше заказы между 00:00 и 03:00 по Москве попадали
// не в тот день, а график часов был сдвинут. Расходы и заказы теперь делят одни границы периода.

const pad = n => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const r2 = n => Math.round((n || 0) * 100) / 100;
const sum = (a, f = x => x) => a.reduce((s, x) => s + (f(x) || 0), 0);
const dayCount = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000) + 1;
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return localDate(d); };
// Сколько дней периода [a1, b1] попадает в промежуток [a2, b2] (даты «ГГГГ-ММ-ДД»)
const overlap = (a1, b1, a2, b2) => Math.max(0, dayCount(a1 > a2 ? a1 : a2, b1 < b2 ? b1 : b2));

// Периоды — общие для «Отчётности» и «Расходов» (раньше «неделя» и «месяц» значили разное на разных экранах)
const ago = n => addDays(localDate(), -n);
const monday = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localDate(d); };
export const PRESETS = [
  { key: 'today', label: 'Сегодня', from: () => ago(0) }, { key: 'week', label: 'Неделя', from: monday },
  { key: 'month', label: 'С начала месяца', from: () => localDate().slice(0, 8) + '01' }, { key: 'month30', label: '30 дней', from: () => ago(29) },
  { key: 'quarter', label: 'Квартал', from: () => ago(89) }, { key: 'year', label: 'Год', from: () => localDate().slice(0, 4) + '-01-01' },
];
export const rangeOf = key => ({ from: PRESETS.find(p => p.key === key).from(), to: localDate() });

// Крупные покупки растягиваются минимум на 3 месяца (короче — 3, не указано — тоже 3) и списываются по дням,
// начиная с покупки или с начала работы в приложении (что позже): пока бизнесу меньше срока, амортизация — за реально прошедшие дни.
const MIN_AMORT = 3;
export const amortMonths = inv => Math.max(MIN_AMORT, inv.amort_months || 0);
const invStart = (inv, biz) => { const d = (inv.invest_date || String(inv.created_at || '').slice(0, 10) || biz).slice(0, 10); return d > biz ? d : biz; };

// Предыдущий период той же длины (для сравнения)
export function prevPeriod(from, to) {
  const d = new Date(from + 'T00:00:00'); d.setDate(d.getDate() - 1);
  const pTo = localDate(d); d.setDate(d.getDate() - (dayCount(from, to) - 1));
  return { from: localDate(d), to: pTo };
}

// Накладные, зарплата и амортизация за период (пропорционально дням) с разбивкой для раскрытия строк
function periodCosts(from, to, revenue, shifts) {
  const db = getDb(), biz = getBusinessStart();
  const days = overlap(from, to, biz, localDate());
  const overheadItems = [];
  let depreciation = 0;
  try {
    for (const o of getOverheadItems()) {
      const m = o.period === 'year' ? o.amount / 12 : o.period === 'week' ? o.amount * 4.33 : o.amount;
      overheadItems.push({ name: o.name || 'Накладной расход', sum: Math.round(m * days / 30) });
    }
  } catch (_) {}
  // Зарплата — тот же расчёт, что на вкладке «Зарплата» в «Журнале работы» (одна формула на всё приложение)
  let salary = 0;
  const salaryItems = [];
  try {
    for (const r of getAllEmployeesSalary(from, to)) {
      const v = Math.round(r.total);
      if (v) { salaryItems.push({ name: r.user.name || 'Сотрудник', sum: v }); salary += v; }
    }
  } catch (_) {}
  try {
    for (const i of getInvestments()) {
      if (!(i.amount > 0) || i.returnable) continue;
      const st = invStart(i, biz), termDays = amortMonths(i) * 30;
      depreciation += i.amount / termDays * overlap(from, to, st, addDays(st, termDays - 1));
    }
  } catch (_) {}
  return {
    overheadItems, overhead: sum(overheadItems, x => x.sum),
    salaryItems, salary, depreciation: Math.round(depreciation),
  };
}

/**
 * Полный отчёт за период [from, to] (даты «ГГГГ-ММ-ДД» по местному времени).
 * Правило прибыли: выручка − себестоимость (по техкартам) − расходы − накладные − зарплата − амортизация.
 * Закупки материалов (расход «Закупка») отдельно НЕ вычитаются — материалы уже учтены через себестоимость,
 * иначе они считались бы дважды; показываются справкой. Если себестоимость не заполнена (0), закупки
 * считаются затратами (purchasesAsCost), чтобы прибыль не получалась завышенной.
 */
export function getReport(from, to) {
  const db = getDb();
  const a = localDateStartISO(from), b = localDateStartISO(to, 1);
  const all = db.getAllSync(
    `SELECT o.*, u.name AS cashier FROM orders o LEFT JOIN users u ON u.id = o.cashier_id WHERE o.created_at >= ? AND o.created_at < ?`, [a, b]);
  const live = all.filter(o => o.status !== 'returned'), rets = all.filter(o => o.status === 'returned');
  const revenue = r2(sum(live, o => o.total)), orders = live.length;
  const cogs = r2(calcCOGS(live));

  // «Амортизация»/«Накладные» и строки повторов считаются ниже по дням (иначе — двойной учёт); прежние автострочки отсекаются
  const exp = db.getAllSync(
    `SELECT category, SUM(amount) AS s FROM expenses WHERE date >= ? AND date <= ? AND recurring_id IS NULL
       AND NOT (category IN ('Амортизация', 'Накладные') AND comment = 'Автоматически') GROUP BY category`, [from, to]);
  const purchases = r2(sum(exp.filter(e => e.category === 'Закупка'), e => e.s));
  const shifts = (() => { try { return getShiftsInPeriod(from, to) || []; } catch (_) { return []; } })();
  const c = periodCosts(from, to, revenue, shifts);
  // Зарплата рассчитывается по сменам; если она уже рассчитана, внесённая вручную категория «Зарплата» не вычитается второй раз
  const manualSalary = c.salary > 0 ? Math.round(sum(exp.filter(e => e.category === 'Зарплата'), e => e.s)) : 0;
  const expItems = exp.filter(e => e.category !== 'Закупка' && !(manualSalary && e.category === 'Зарплата') && e.s).map(e => ({ name: e.category || 'Прочее', sum: Math.round(e.s) }));
  const expenses = sum(expItems, x => x.sum);
  const purchasesAsCost = cogs > 0 ? 0 : purchases;

  // Недостачи и излишки подтверждённых инвентаризаций за период: недостача — затрата, излишек уменьшает затраты
  const shrinkage = r2(-(db.getFirstSync(
    `SELECT SUM(i.diff_money) AS s FROM inventory_act_items i JOIN inventory_acts a ON a.id = i.act_id
     WHERE a.status = 'confirmed' AND a.confirmed_at >= ? AND a.confirmed_at < ?`, [a, b])?.s || 0));
  const gross = r2(revenue - cogs - purchasesAsCost);
  const fixed = expenses + c.overhead + c.salary + c.depreciation;
  const net = r2(gross - fixed - shrinkage);
  const gm = revenue > 0 ? gross / revenue : 0;
  const breakEven = gm > 0 ? Math.round(fixed / gm) : null;

  // Графики: по дням (или по месяцам для длинных периодов), по часам — по местному времени
  const monthly = dayCount(from, to) > 45, byDayMap = {}, hourMap = {};
  for (const o of live) {
    const d = new Date(o.created_at), key = monthly ? localDate(d).slice(0, 7) : localDate(d);
    byDayMap[key] = (byDayMap[key] || 0) + o.total;
    hourMap[d.getHours()] = (hourMap[d.getHours()] || 0) + 1;
  }
  const empMap = {};
  for (const o of live) { const n = o.cashier || 'Без сотрудника'; (empMap[n] = empMap[n] || { name: n, orders: 0, sum: 0 }); empMap[n].orders++; empMap[n].sum += o.total; }

  const pay = (() => { try { return summarizeSales(live, getPayMethods()); } catch (_) { return { cash: 0, card: 0, other: [] }; } })();
  const payments = [{ name: 'Наличные', sum: pay.cash }, { name: 'Карта', sum: pay.card }, ...pay.other.map(o => ({ name: o.name, sum: o.sum }))]
    .filter(p => p.sum > 0.5).map(p => ({ ...p, sum: Math.round(p.sum) }));

  const top = db.getAllSync(
    `SELECT oi.name, SUM(oi.quantity) AS qty, SUM(oi.price * oi.quantity) AS sum FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.created_at >= ? AND o.created_at < ? AND (o.status IS NULL OR o.status != 'returned') GROUP BY oi.name ORDER BY qty DESC LIMIT 8`, [a, b]);

  return {
    from, to, manualSalaryIgnored: manualSalary, workedDays: overlap(from, to, getBusinessStart(), localDate()), revenue, orders, avgCheck: orders ? Math.round(revenue / orders) : 0,
    returns: { count: rets.length, sum: Math.round(sum(rets, o => o.total)) },
    cogs, purchases, purchasesAsCost, gross, grossPct: revenue ? gm * 100 : 0,
    expenses, expItems, overhead: c.overhead, overheadItems: c.overheadItems, salary: c.salary, salaryItems: c.salaryItems,
    depreciation: c.depreciation, shrinkage, fixed, net, netPct: revenue ? net / revenue * 100 : 0,
    payments, shiftsCount: shifts.length, perShift: shifts.length ? Math.round(revenue / shifts.length) : null,
    payrollPct: revenue ? c.salary / revenue * 100 : 0, cogsPct: revenue ? cogs / revenue * 100 : 0,
    breakEven, safetyPct: breakEven && revenue ? (revenue - breakEven) / revenue * 100 : null,
    byDay: Object.keys(byDayMap).sort().map(k => ({ key: k, total: Math.round(byDayMap[k]) })),
    byHour: Object.keys(hourMap).map(Number).sort((x, y) => x - y).map(h => ({ hour: h, orders: hourMap[h] })),
    employees: Object.keys(empMap).map(k => ({ ...empMap[k], sum: Math.round(empMap[k].sum) })).sort((x, y) => y.sum - x.sum),
    top: top.map(t => ({ name: t.name, qty: t.qty, sum: Math.round(t.sum) })),
  };
}

// Вложения: итоги, нагрузка в месяц и срок окупаемости. Окно расчёта — последние 3 месяца; пока бизнесу меньше —
// берутся уже отработанные дни (зарегистрировались 7 дней назад — считаем по этой неделе). Окупаемость — по прибыли ДО амортизации.
export function getInvestmentStats() {
  const inv = getInvestments().filter(i => !i.returnable);
  const total = sum(inv, i => i.amount), monthly = sum(inv, i => i.amount / amortMonths(i));
  const today = localDate(), biz = getBusinessStart();
  const from = ago(89) > biz ? ago(89) : biz, days = dayCount(from, today);
  const r = getReport(from, today);
  const perMonth = days > 0 ? (r.net + r.depreciation) / days * 30 : 0;
  return { total, monthly: Math.round(monthly), days, perMonth: Math.round(perMonth), payback: total > 0 && perMonth > 0 ? total / perMonth : null, lowData: days < 14 };
}

// Прогресс списания вложения (для карточки): срок, прошло дней, уже списано
export function investmentProgress(inv) {
  const biz = getBusinessStart(), st = invStart(inv, biz), term = amortMonths(inv), termDays = term * 30;
  const done = Math.min(termDays, overlap(st, localDate(), st, addDays(st, termDays - 1)));
  return { term, termDays, done, amortized: Math.round(inv.amount * done / termDays), start: st };
}
