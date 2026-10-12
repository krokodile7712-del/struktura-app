import { ACTIVITY_TABLES, findUnregisteredTables } from './backupData';

// Сброс «продажи и клиенты»: стирает все таблицы вида 'activity' из реестра (db/backupData.js) и обнуляет остатки склада.
// Списка таблиц здесь нет — он берётся из реестра, поэтому новая таблица не может «забыться» (её внесение в реестр обязательно:
// не внесённые таблицы сброс не трогает и называет в ответе). Всё — одной транзакцией: либо стёрто всё, либо ничего.
const count = (db, t) => { try { return db.getFirstSync(`SELECT COUNT(*) AS c FROM ${t}`)?.c || 0; } catch (_) { return 0; } };

// Что будет удалено: [{ table, label, count }] только с ненулевым числом строк + общий итог
export function previewSalesReset(db) {
  const rows = ACTIVITY_TABLES.map(t => ({ table: t.table, label: t.label, count: count(db, t.table) })).filter(r => r.count > 0);
  const stockRows = (() => { try { return db.getFirstSync(`SELECT COUNT(*) AS c FROM stock WHERE остаток != 0`)?.c || 0; } catch (_) { return 0; } })();
  return { rows, total: rows.reduce((s, r) => s + r.count, 0), stockRows, unprotected: findUnregisteredTables(db) };
}

export function resetSalesAndClients(db) {
  const before = previewSalesReset(db);
  try {
    db.execSync('BEGIN TRANSACTION');
    for (const t of ACTIVITY_TABLES) { try { db.execSync(`DELETE FROM ${t.table}`); } catch (e) { if (!/no such table/i.test(e?.message || '')) throw e; } }
    db.execSync(`UPDATE stock SET остаток = 0, max_ostatok = 0`);
    const left = ACTIVITY_TABLES.filter(t => count(db, t.table) > 0).map(t => t.label);
    if (left.length) throw new Error('не очищено: ' + left.join(', '));
    db.execSync('COMMIT');
  } catch (e) {
    try { db.execSync('ROLLBACK'); } catch (_) {}
    console.error('[resetSalesAndClients]', e);
    return { ok: false, error: 'Сброс не выполнен, данные остались как были. ' + (e?.message || '') };
  }
  return { ok: true, deleted: before.total, tables: before.rows.length, unprotected: before.unprotected };
}
