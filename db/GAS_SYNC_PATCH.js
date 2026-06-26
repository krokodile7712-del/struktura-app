// ─── ЗАМЕНИТЬ существующую функцию handleApiRequest в Code.gs на эту ────────

function handleApiRequest(e) {
  var action = e.parameter.action;
  var output;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    // ── Чтение ──
    if (action === 'getMenu')       { output = getMenuData(ss); }
    else if (action === 'getModifiers') { output = getModifiersData(ss); }
    else if (action === 'getClients')   { output = getAllClients(); }
    else if (action === 'getExpenses')  { output = getExpensesData(e.parameter.dateFrom || '2020-01-01', e.parameter.dateTo || '2099-12-31').expenses; }
    else if (action === 'getStock')     { output = getStockData(); }
    else if (action === 'getSettings')  { output = getSettings(); }
    else if (action === 'getCostPrice') { output = getCostPrice(); }
    // ── Запись из мобильного приложения ──
    else if (action === 'appendOrder')   { output = appendOrderFromApp(e.parameter, ss); }
    else if (action === 'appendExpense') { output = appendExpenseFromApp(e.parameter, ss); }
    else if (action === 'appendClient')  { output = appendClientFromApp(e.parameter, ss); }
    else if (action === 'appendShift')   { output = appendShiftFromApp(e.parameter, ss); }
    else { output = { error: 'Unknown action: ' + action }; }
  } catch(err) { output = { error: err.message }; }
  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON);
}

// ─── Запись заказа из мобильного приложения ──────────────────────────────────
function appendOrderFromApp(params, ss) {
  var sheet = ss.getSheetByName('Продажи');
  if (!sheet) return { success: false, error: 'Лист Продажи не найден' };
  var items = [];
  try { items = JSON.parse(params.items || '[]'); } catch(e) { return { success: false, error: 'items parse error' }; }
  var now = params.created_at ? new Date(params.created_at) : new Date();
  var orderId = 'MOB-' + (params.order_id || Date.now());
  var method = params.method || 'Наличные';
  var shiftDate = params.shift_date || Utilities.formatDate(now, 'GMT+4', 'yyyy-MM-dd');
  var clientCode = params.client_code || '';
  items.forEach(function(item) {
    sheet.appendRow([
      now,
      orderId,
      item.name  || '',
      item.size  || '',
      item.milk  || '-',
      item.syrup || '-',
      shiftDate,
      method,
      parseFloat(item.price) || 0,
      0,
      clientCode,
      '', ''
    ]);
  });
  // Начислить баллы клиенту если есть
  if (clientCode) {
    var settings = getSettings();
    var totalPaid = items.reduce(function(s, i) { return s + (parseFloat(i.price) || 0); }, 0);
    addOperation(clientCode, totalPaid, 0, settings.bonusPct);
  }
  touchMeta();
  return { success: true, orderId: orderId };
}

// ─── Запись расхода из мобильного приложения ─────────────────────────────────
function appendExpenseFromApp(params, ss) {
  var sheet = ss.getSheetByName('Расходы');
  if (!sheet) return { success: false, error: 'Лист Расходы не найден' };
  var dateObj = params.date ? new Date(params.date) : new Date();
  sheet.appendRow([
    dateObj,
    params.category || 'Прочее',
    parseFloat(params.amount) || 0,
    params.comment || ''
  ]);
  touchMeta();
  return { success: true };
}

// ─── Запись нового клиента из мобильного приложения ──────────────────────────
function appendClientFromApp(params, ss) {
  var sheet = ss.getSheetByName('Клиенты');
  if (!sheet) return { success: false, error: 'Лист Клиенты не найден' };
  // Проверяем нет ли уже такого кода
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString().trim() === params.code) {
      return { success: true, exists: true };
    }
  }
  sheet.appendRow([
    params.code  || '',
    params.fio   || '',
    params.phone || '',
    0, 0, 0,
    new Date()
  ]);
  touchMeta();
  return { success: true };
}

// ─── Запись смены из мобильного приложения ───────────────────────────────────
function appendShiftFromApp(params, ss) {
  var sheet = ss.getSheetByName('Смены');
  if (!sheet) return { success: false, error: 'Лист Смены не найден' };
  var openedAt  = params.opened_at  ? new Date(params.opened_at)  : new Date();
  var closedAt  = params.closed_at  ? new Date(params.closed_at)  : '';
  var shiftDate = Utilities.formatDate(openedAt, 'GMT+4', 'yyyy-MM-dd');
  // Проверяем нет ли уже записи за эту дату
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var cell = data[i][0];
    var rowDate = cell instanceof Date
      ? Utilities.formatDate(cell, 'GMT+4', 'yyyy-MM-dd')
      : cell.toString().trim();
    if (rowDate === shiftDate) return { success: true, exists: true };
  }
  sheet.appendRow([
    shiftDate,
    openedAt,
    closedAt || '',
    params.role || 'Бариста',
    parseFloat(params.cash_open) || 0,
    parseFloat(params.cash_close) || 0
  ]);
  return { success: true };
}
