global.__session = { id: 1, name: 'Админ', role: 'admin' };
const B = require('./backend.js');
B.initDatabase();
const db = B.getDb();
let bad = 0;
const eq = (n, g, e) => { const ok = JSON.stringify(g) === JSON.stringify(e); if (!ok) { bad++; console.log('FAIL', n, '\n   получено:  ', JSON.stringify(g), '\n   ожидалось: ', JSON.stringify(e)); } else console.log('ok  ', n); };
const near = (n, g, e, tol = 0.01) => eq(n, Math.abs(g - e) <= tol ? e : g, e);

// сотрудники
B.addUser('Анна', '1111', 'barista', 'hourly', 300, { kpiType: 'revenue', kpiAmount: 10000, kpiPeriod: 'month', kpiBonusAmount: 1000, kpiInSalary: 1 });
B.addUser('Борис', '2222', 'barista', 'shift', 2000);
B.addUser('Вера', '3333', 'barista', 'monthly', 30000);
const u = (name) => db.getFirstSync('select * from users where name=?', [name]);
const anna = u('Анна'), boris = u('Борис'), vera = u('Вера');

const FROM = '2026-09-01', TO = '2026-09-30';
const mkOrder = (shiftId, clientId, total, methodType, hhmm, day = '10') => {
  const id = B.createOrder({ total, method: methodType === 'cash' ? 'Наличные' : 'Карта', methodType, methodId: 1, shift_id: shiftId, client_id: clientId, cashier_id: 1, items: [], cashAmount: methodType === 'cash' ? total : 0, cardAmount: methodType === 'card' ? total : 0, discountPct: 0, locationId: null, note: '', zone: '' }).orderId;
  db.runSync('update orders set created_at=? where id=?', [`2026-09-${day}T${hhmm}:00.000Z`, id]);
  return id;
};

console.log('=== 1. Смена задним числом ===');
const s1 = B.createManualShift(anna.id, 'Анна', '2026-09-10T08:00:00.000Z', '2026-09-10T16:00:00.000Z');
let sh = db.getFirstSync('select * from shifts where id=?', [s1]);
eq('создана закрытой, помечена вручную', [sh.status, sh.created_manually, sh.employee_name], ['closed', 1, 'Анна']);
const s2 = B.createManualShift(boris.id, 'Борис', '2026-09-10T08:00:00.000Z', null);
eq('без времени закрытия — открытая', db.getFirstSync('select status, closed_at from shifts where id=?', [s2]), { status: 'open', closed_at: null });
eq('запись «создана» в журнале', B.getShiftEditLog(s1).map(l => l.field), ['created']);

console.log('=== 2. Расчёт зарплаты: почасовая ===');
let r = B.calcEmployeeSalary(anna.id, FROM, TO);
eq('8 часов', r.hours, 8);
eq('база 8ч × 300', r.base, 2400);
eq('смена в детализации: 8 ч, 2400 ₽', [r.shiftBreakdown[0].hours, r.shiftBreakdown[0].pay, r.shiftBreakdown[0].createdManually], [8, 2400, true]);

console.log('=== 3. Заказы и перенос между сменами ===');
// Борис «весь день» продавал под своей открытой сменой, хотя работала Анна
const o1 = mkOrder(s2, null, 500, 'cash', '10:00');
const o2 = mkOrder(s2, null, 300, 'card', '12:00');
const o3 = mkOrder(s2, null, 200, 'cash', '20:00');           // после ухода Анны — не её
const o4 = mkOrder(s1, null, 100, 'cash', '09:00');           // уже в смене Анны
db.runSync("update orders set status='returned' where id=?", [mkOrder(s2, null, 999, 'cash', '11:00')]); // возврат — переносить нельзя
B.closeShift(s2); // пересчитывает итоги Бориса; время закрытия «сейчас»
db.runSync("update shifts set closed_at='2026-09-10T22:00:00.000Z' where id=?", [s2]);
const tr = B.getTransferableOrders(s1);
eq('кандидаты на перенос: только o1, o2 (в окне 08–16, чужая смена, не возврат)', tr.map(o => o.id).sort(), [o1, o2].sort());
eq('видно, чей заказ сейчас', tr[0].current_shift_employee, 'Борис');
const anna0 = db.getFirstSync('select cash_total, card_total from shifts where id=?', [s1]);
const boris0 = db.getFirstSync('select cash_total, card_total from shifts where id=?', [s2]);
eq('до переноса у Анны только o4', anna0, { cash_total: 0, card_total: 0 });   // итоги считаются при закрытии — у Анны ещё не считались
eq('до переноса у Бориса: нал 700, карта 300', boris0, { cash_total: 700, card_total: 300 });
B.transferOrdersToShift([o1, o2], s1);
const annaA = db.getFirstSync('select cash_total, card_total from shifts where id=?', [s1]);
const borisA = db.getFirstSync('select cash_total, card_total from shifts where id=?', [s2]);
eq('после переноса у Анны: нал 600 (500+100), карта 300', annaA, { cash_total: 600, card_total: 300 });
eq('после переноса у Бориса остался нал 200', borisA, { cash_total: 200, card_total: 0 });
eq('заказы действительно в смене Анны', db.getAllSync('select shift_id from orders where id in (?,?)', [o1, o2]).map(x => x.shift_id), [s1, s1]);
eq('перенос записан в журнал', B.getShiftEditLog(s1).some(l => l.field === 'orders_transferred' && l.new_value === '2'), true);
eq('повторный поиск: кандидатов у Анны больше нет', B.getTransferableOrders(s1).length, 0);
r = B.calcEmployeeSalary(anna.id, FROM, TO);
eq('выручка Анны теперь 900 (100 своих + 800 перенесённых)', db.getFirstSync("select sum(total) t from orders where shift_id=? and (status is null or status != 'returned')", [s1]).t, 900);
eq('кассир перенесённых продаж теперь Анна, а не прежний', db.getAllSync('select cashier_id from orders where id in (?,?)', [o1, o2]).map(x => x.cashier_id), [anna.id, anna.id]);
const rev = B.getRevenueByEmployee('2026-09-01', '2026-09-30');
eq('в отчёте по сотрудникам: у Анны 800 (перенесённые), у кассира id=1 остались 100 + вечерние 200', [(rev.find(x => x.name === 'Анна') || {}).revenue, (rev.find(x => x.name === db.getFirstSync('select name from users where id=1').name) || {}).revenue], [800, 300]);
eq('сводка заказов смены', B.getShiftOrdersInfo(s1), { count: 3, total: 900 });

eq('возвращённый заказ остался в чужой смене', db.getFirstSync("select shift_id from orders where status='returned'").shift_id, s2);
console.log('=== 4. KPI-премия ===');
eq('KPI: 900 из плана 10000 = 9% → премия 90', r.kpiBonus, 90);
db.runSync('update users set kpi_in_salary=0 where id=?', [anna.id]);
eq('переключатель выключен — премии нет', B.calcEmployeeSalary(anna.id, FROM, TO).kpiBonus, 0);
db.runSync('update users set kpi_in_salary=1, kpi_amount=500 where id=?', [anna.id]);
eq('перевыполнение плана не превышает премию (потолок 100%)', B.calcEmployeeSalary(anna.id, FROM, TO).kpiBonus, 1000);
db.runSync('update users set kpi_amount=10000 where id=?', [anna.id]);

console.log('=== 5. Доплата и удержание ===');
B.setShiftAdjustment(s1, 500, 'Работала в выходной');
r = B.calcEmployeeSalary(anna.id, FROM, TO);
eq('доплата 500 в расчёте', [r.adjustments, r.total], [500, 2400 + 90 + 500]);
eq('в детализации смены', [r.shiftBreakdown[0].adjustmentAmount, r.shiftBreakdown[0].adjustmentReason], [500, 'Работала в выходной']);
B.setShiftAdjustment(s1, -300, 'Недостача');
r = B.calcEmployeeSalary(anna.id, FROM, TO);
eq('удержание заменяет доплату: −300', [r.adjustments, r.total], [-300, 2400 + 90 - 300]);
const adjLog = B.getShiftEditLog(s1).filter(l => l.field === 'adjustment_amount');
eq('журнал: было 500 → стало −300 (новые сверху)', [adjLog[0].old_value, adjLog[0].new_value, adjLog[0].reason], ['500', '-300', 'Недостача']);
B.setShiftAdjustment(s1, 0, '');
eq('обнулили — суммы нет', B.calcEmployeeSalary(anna.id, FROM, TO).adjustments, 0);

console.log('=== 6. Правка времени открытия и закрытия, причина, журнал ===');
B.updateShiftHours(s1, { openedAt: '2026-09-10T09:00:00.000Z', closedAt: '2026-09-10T15:00:00.000Z', reason: 'Опоздала на час, ушла раньше' });
sh = db.getFirstSync('select * from shifts where id=?', [s1]);
eq('время и метка правки', [sh.opened_at, sh.closed_at, sh.hours_edited, sh.edit_reason], ['2026-09-10T09:00:00.000Z', '2026-09-10T15:00:00.000Z', 1, 'Опоздала на час, ушла раньше']);
eq('6 часов × 300 = 1800', B.calcEmployeeSalary(anna.id, FROM, TO).base, 1800);
const timeLog = B.getShiftEditLog(s1).filter(l => l.field === 'opened_at' || l.field === 'closed_at');
eq('в журнале оба поля, кто и почему', timeLog.map(l => [l.field, l.edited_by, l.reason]).sort(), [['closed_at', 'Админ', 'Опоздала на час, ушла раньше'], ['opened_at', 'Админ', 'Опоздала на час, ушла раньше']].sort());
const cnt = B.getShiftEditLog(s1).length;
B.updateShiftHours(s1, { openedAt: '2026-09-10T09:00:00.000Z', closedAt: '2026-09-10T15:00:00.000Z', reason: 'ничего не менял' });
eq('повторное сохранение тех же значений не засоряет журнал', B.getShiftEditLog(s1).length, cnt);

console.log('=== 7. Открытая смена закрывается правкой ===');
const s3 = B.createManualShift(vera.id, 'Вера', '2026-09-11T08:00:00.000Z', null);
B.updateShiftHours(s3, { closedAt: '2026-09-11T14:00:00.000Z', reason: 'Забыла закрыть' });
sh = db.getFirstSync('select status, closed_at, hours_edited from shifts where id=?', [s3]);
eq('статус закрыта, время как указали', sh, { status: 'closed', closed_at: '2026-09-11T14:00:00.000Z', hours_edited: 1 });

console.log('=== 8. Оклад пропорционально дням ===');
near('Вера, оклад 30000: месяц 30 дней = 30000', B.calcEmployeeSalary(vera.id, '2026-09-01', '2026-09-30').base, 30000);
near('Вера: неделя (7 дней) = 7000', B.calcEmployeeSalary(vera.id, '2026-09-01', '2026-09-07').base, 7000);

console.log('=== 9. Посменная ===');
eq('Борис: 1 закрытая смена × 2000', B.calcEmployeeSalary(boris.id, FROM, TO).base, 2000);

console.log('=== 10. Удаление смены ===');
const before = { orders: db.getFirstSync('select count(*) c from orders where shift_id=?', [s2]).c };
B.deleteShift(s2);
eq('смена и её журнал удалены', [db.getFirstSync('select count(*) c from shifts where id=?', [s2]).c, db.getFirstSync('select count(*) c from shift_edit_log where shift_id=?', [s2]).c], [0, 0]);
eq('заказы сохранились (остались с прежней ссылкой)', db.getFirstSync('select count(*) c from orders where shift_id=?', [s2]).c, before.orders);
eq('расчёт Бориса без этой смены — 0', B.calcEmployeeSalary(boris.id, FROM, TO).base, 0);

console.log('=== 11. Список сотрудников ===');
const all = B.getAllEmployeesSalary(FROM, TO);
eq('в списке 3 сотрудника + админ из миграций, у каждого total', all.every(x => typeof x.total === 'number'), true);
console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nВсе проверки пройдены');
process.exit(bad ? 1 : 0);
