import { getDb } from './database';
import {
  calcCOGS, summarizeSales, getPayMethods, getShiftsInPeriod, calcShiftSalaryCost,
  getOverheadItems, getInvestments, localDateStartISO,
} from './queries';

// Единая модель отчётности: все цифры считаются ОДИН раз за один проход, вкладки экрана только показывают готовое.
// Дни — по МЕСТНОМУ времени (время заказов хранится в UTC): раньше заказы между 00:00 и 03:00 по Москве попадали
// не в тот день, а график часов был сдвинут. Расходы и заказы теперь делят одни границы периода.

const pad = n => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const r2 = n => Math.round((n || 0) * 100) / 100;
const sum = (a, f = x => x) => a.reduce((s, x) => s + (f(x) || 0), 0);
const dayCount = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000) + 1;

// Предыдущий период той же длины (для сравнения)
export function prevPeriod(from, to) {
  const d = new Date(from + 'T00:00:00'); d.setDate(d.getDate() - 1);
  const pTo = localDate(d); d.setDate(d.getDate() - (dayCount(from, to) - 1));
  return { from: localDate(d), to: pTo };
}

// Накладные, зарплата и амортизация за период (пропорционально дням) с разбивкой для раскрытия строк
function periodCosts(from, to, revenue, shifts) {
  const days = dayCount(from, to), db = getDb();
  const overheadItems = [], salaryBy = {};
  let depreciation = 0;
  try {
    for (const o of getOverheadItems()) {
      const m = o.period === 'year' ? o.amount / 12 : o.period === 'week' ? o.amount * 4.33 : o.amount;
      overheadItems.push({ name: o.name || 'Накладной расход', sum: Math.round(m * days / 30) });
    }
  } catch (_) {}
  try {
    for (const s of shifts) {
      const u = s.employee_name ? db.getFirstSync(`SELECT * FROM users WHERE name = ?`, [s.employee_name]) : null;
      const hours = s.closed_at ? Math.round((new Date(s.closed_at) - new Date(s.opened_at)) / 3600000) : 8;
      const perShift = revenue / Math.max(1, shifts.length);
      let v = 0;
      if (u && u.salary_amount > 0) {
        v = u.salary_type === 'hourly' ? u.salary_amount * hours : u.salary_type === 'monthly' ? u.salary_amount / 22
          : u.salary_type === 'revenue_pct' ? perShift * u.salary_amount / 100 : u.salary_amount;
      } else if (!u) v = calcShiftSalaryCost({ revenueInShift: perShift });
      const name = s.employee_name || 'Сотрудник';
      salaryBy[name] = (salaryBy[name] || 0) + v;
    }
  } catch (_) {}
  try {
    for (const i of getInvestments()) if (i.amount > 0 && i.amort_months > 0) depreciation += i.amount / i.amort_months * days / 30;
  } catch (_) {}
  return {
    overheadItems, overhead: sum(overheadItems, x => x.sum),
    salaryItems: Object.keys(salaryBy).map(name => ({ name, sum: Math.round(salaryBy[name]) })),
    salary: Math.round(sum(Object.keys(salaryBy), k => salaryBy[k])), depreciation: Math.round(depreciation),
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

  const exp = db.getAllSync(`SELECT category, SUM(amount) AS s FROM expenses WHERE date >= ? AND date <= ? GROUP BY category`, [from, to]);
  const purchases = r2(sum(exp.filter(e => e.category === 'Закупка'), e => e.s));
  const expItems = exp.filter(e => e.category !== 'Закупка' && e.s).map(e => ({ name: e.category || 'Прочее', sum: Math.round(e.s) }));
  const expenses = sum(expItems, x => x.sum);
  const purchasesAsCost = cogs > 0 ? 0 : purchases;

  const shifts = (() => { try { return getShiftsInPeriod(from, to) || []; } catch (_) { return []; } })();
  const c = periodCosts(from, to, revenue, shifts);
  const gross = r2(revenue - cogs - purchasesAsCost);
  const fixed = expenses + c.overhead + c.salary + c.depreciation;
  const net = r2(gross - fixed);
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
    from, to, revenue, orders, avgCheck: orders ? Math.round(revenue / orders) : 0,
    returns: { count: rets.length, sum: Math.round(sum(rets, o => o.total)) },
    cogs, purchases, purchasesAsCost, gross, grossPct: revenue ? gm * 100 : 0,
    expenses, expItems, overhead: c.overhead, overheadItems: c.overheadItems, salary: c.salary, salaryItems: c.salaryItems,
    depreciation: c.depreciation, fixed, net, netPct: revenue ? net / revenue * 100 : 0,
    payments, shiftsCount: shifts.length, perShift: shifts.length ? Math.round(revenue / shifts.length) : null,
    payrollPct: revenue ? c.salary / revenue * 100 : 0, cogsPct: revenue ? cogs / revenue * 100 : 0,
    breakEven, safetyPct: breakEven && revenue ? (revenue - breakEven) / revenue * 100 : null,
    byDay: Object.keys(byDayMap).sort().map(k => ({ key: k, total: Math.round(byDayMap[k]) })),
    byHour: Object.keys(hourMap).map(Number).sort((x, y) => x - y).map(h => ({ hour: h, orders: hourMap[h] })),
    employees: Object.keys(empMap).map(k => ({ ...empMap[k], sum: Math.round(empMap[k].sum) })).sort((x, y) => y.sum - x.sum),
    top: top.map(t => ({ name: t.name, qty: t.qty, sum: Math.round(t.sum) })),
  };
}
