// ─── ВСТАВИТЬ В НАЧАЛО doGet, ПЕРЕД строкой "var template = ..." ───────────
//
//   if (e && e.parameter && e.parameter.action) {
//     return handleApiRequest(e);
//   }
//
// ─── ДОБАВИТЬ КАК ОТДЕЛЬНУЮ ФУНКЦИЮ ────────────────────────────────────────

function handleApiRequest(e) {
  var action = e.parameter.action;
  var output;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (action === 'getMenu') {
      output = getMenuData(ss);
    } else if (action === 'getModifiers') {
      output = getModifiersData(ss);
    } else if (action === 'getClients') {
      output = getAllClients();
    } else if (action === 'getExpenses') {
      var from = e.parameter.dateFrom || '2020-01-01';
      var to   = e.parameter.dateTo   || '2099-12-31';
      output = getExpensesData(from, to).expenses;
    } else if (action === 'getStock') {
      output = getStockData();
    } else if (action === 'getSettings') {
      output = getSettings();
    } else if (action === 'getCostPrice') {
      output = getCostPrice();
    } else {
      output = { error: 'Unknown action: ' + action };
    }
  } catch(err) {
    output = { error: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}
