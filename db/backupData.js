// Выгрузка и восстановление всех данных (резервная копия). Принимает db первым
// аргументом — так восстановление можно проверять на тестовой базе отдельно от
// приложения. Шифрование файла — db/backupCrypto.js.
import * as Auth from './userAuth';

// Единый реестр таблиц: по нему работают резервная копия, восстановление и сброс данных (в экранах списков таблиц больше нет).
// kind: 'config' — настройки, люди, структура (сброс продаж не трогает); 'catalog' — справочники: товары, техкарты, категории (сброс продаж не трогает);
//       'activity' — продажи, клиенты, смены, расходы, закупки, остатки и вся история (стираются сбросом «продажи и клиенты»).
// Новая таблица, не внесённая сюда, НЕ теряется: резервная копия сохраняет её отдельно (data.__extra), сброс продаж её не трогает и сообщает о ней.
export const BACKUP_TABLES_INFO = [
  { table: 'business_profile', kind: 'config',        label: 'Профиль бизнеса' },
  { table: 'app_settings', kind: 'config',            label: 'Настройки приложения' },
  { table: 'users', kind: 'config',                   label: 'Сотрудники (PIN-коды)' },
  { table: 'products', kind: 'catalog',                label: 'Товары' },
  { table: 'product_variants', kind: 'catalog',        label: 'Варианты и цены товаров' },
  { table: 'product_axes', kind: 'catalog',            label: 'Оси товаров (размер/вкус и т.п.)' },
  { table: 'axis_values', kind: 'catalog',             label: 'Значения осей товаров' },
  { table: 'categories', kind: 'catalog',              label: 'Категории товаров' },
  { table: 'modifiers', kind: 'catalog',               label: 'Модификаторы (старые)' },
  { table: 'modifier_groups', kind: 'catalog',         label: 'Группы модификаторов' },
  { table: 'modifier_options', kind: 'catalog',        label: 'Опции модификаторов' },
  { table: 'product_modifier_groups', kind: 'catalog', label: 'Привязка модификаторов к товарам' },
  { table: 'cost_cards', kind: 'catalog',              label: 'Техкарты' },
  { table: 'cost_ingredients', kind: 'catalog',        label: 'Ингредиенты техкарт' },
  { table: 'price_schedules', kind: 'catalog',         label: 'Расписания цен' },
  { table: 'clients', kind: 'activity',                 label: 'Клиенты' },
  { table: 'orders', kind: 'activity',                  label: 'Заказы' },
  { table: 'order_items', kind: 'activity',             label: 'Позиции заказов' },
  { table: 'order_templates', kind: 'catalog',         label: 'Шаблоны заказов' },
  { table: 'shifts', kind: 'activity',                  label: 'Смены' },
  { table: 'expenses', kind: 'activity',                label: 'Расходы' },
  { table: 'stock', kind: 'catalog',                   label: 'Склад' },
  { table: 'stock_by_location', kind: 'activity',       label: 'Остатки по складам' },
  { table: 'warehouses', kind: 'config',              label: 'Склады' },
  { table: 'workstations', kind: 'config',            label: 'Рабочие места' },
  { table: 'stock_transfers', kind: 'activity',         label: 'Перемещения между складами' },
  { table: 'stock_transfer_items', kind: 'activity',    label: 'Позиции перемещений' },
  { table: 'shift_edit_log', kind: 'activity',          label: 'Журнал правок смен' },
  { table: 'manual_bookings', kind: 'activity',         label: 'Записи по телефону' },
  { table: 'booking_links', kind: 'activity',           label: 'Связь онлайн-записей с заказами' },
  { table: 'stock_deductions', kind: 'activity',        label: 'Списания со склада' },
  { table: 'purchases', kind: 'activity',               label: 'Закупки' },
  { table: 'locations', kind: 'config',               label: 'Локации' },
  { table: 'zones', kind: 'config',                   label: 'Зоны' },
  { table: 'zone_tables', kind: 'config',             label: 'Столы' },
  { table: 'equipment', kind: 'catalog',               label: 'Оборудование' },
  { table: 'overhead_items', kind: 'catalog',          label: 'Накладные расходы' },
  { table: 'investments', kind: 'catalog',             label: 'Инвестиции' },
  { table: 'inventory_acts', kind: 'activity',          label: 'Акты инвентаризации' },
  { table: 'inventory_act_items', kind: 'activity',     label: 'Позиции инвентаризации' },
  { table: 'recurring_expenses', kind: 'catalog',  label: 'Повторяющиеся расходы' },
  { table: 'fiscal_queue', kind: 'activity',            label: 'Очередь чеков (фискализация)' },
];
export const BACKUP_TABLES = BACKUP_TABLES_INFO.map(t => t.table);
export const ACTIVITY_TABLES = BACKUP_TABLES_INFO.filter(t => t.kind === 'activity');

// Все таблицы данных в базе (служебные sqlite_* не считаем)
export function listUserTables(db) {
  return db.getAllSync(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).map(r => r.name);
}
// Таблицы, которые есть в базе, но не внесены в реестр выше
export function findUnregisteredTables(db) {
  const known = new Set(BACKUP_TABLES);
  return listUserTables(db).filter(t => !known.has(t));
}

export function exportAllData(db) {
  const data = { exported_at: new Date().toISOString(), app: 'struktura' };
  for (const table of BACKUP_TABLES) {
    try { data[table] = db.getAllSync(`SELECT * FROM ${table}`); }
    catch (_) { data[table] = []; }
  }
  // Счётчик неверных PIN и время блокировки — состояние конкретного устройства,
  // в копию не кладём (иначе после восстановления вход оказался бы заблокирован)
  data.app_settings = (data.app_settings || []).filter(r => r.key !== 'pin_fail_count' && r.key !== 'pin_lock_until');
  // Таблица, которую забыли внести в реестр, не должна молча выпасть из копии
  const extra = {};
  for (const t of findUnregisteredTables(db)) { try { extra[t] = db.getAllSync(`SELECT * FROM ${t}`); } catch (_) {} }
  if (Object.keys(extra).length) data.__extra = extra;
  return data;
}

// Восстанавливает базу из объекта, полученного через exportAllData().
// Для каждой таблицы, которая есть в файле, — полностью очищает и заполняет заново.
// Таблицы, которых в файле нет (например, бэкап сделан более старой версией
// приложения), — не трогает, но обязательно перечисляет в ответе как пропущенные.
//
// Вся операция — единая транзакция. Раньше каждая таблица обрабатывалась
// отдельно (DELETE + INSERT), и если процесс прерывался посередине (закрытие
// приложения, сбой, разряд батареи) — часть таблиц оставалась уже очищенной
// и перезаполненной новыми данными, а часть — ещё в старом состоянии: база
// оказывалась в несогласованном, битом состоянии. Теперь либо восстанавливается
// абсолютно всё, либо (при любой ошибке) база откатывается к тому состоянию,
// что было до начала восстановления — частичного повреждения быть не может.
export function importAllData(db, data, ensureTables) {
  const restored = [];
  const skipped = [];

  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Файл повреждён или это не резервная копия СТРУКТУРЫ' };
  }

  // Отпечатки PIN считаются с солью бизнеса. Если в файле есть сотрудники с
  // отпечатками, а соли нет — после восстановления никто бы не смог войти.
  // Такой файл не принимаем, пока база не тронута.
  if (Array.isArray(data.users) && data.users.some(u => u && u.pin_hash)) {
    const hasSalt = Array.isArray(data.app_settings) && data.app_settings.some(r => r && r.key === 'pin_salt' && r.value);
    if (!hasSalt) {
      return { ok: false, error: 'Файл копии неполный: в нём нет ключа для PIN-кодов сотрудников. База оставлена без изменений.' };
    }
  }

  // Часть таблиц создаётся не при запуске, а при первом использовании (списания со
  // склада, закупки, категории, очередь чеков). На свежей базе их ещё нет, и
  // восстановление падало на первой же («no such table»). Создаём их заранее.
  try { ensureTables?.(); } catch (e) { console.error('[importAllData] не удалось подготовить таблицы:', e); }

  try {
    db.execSync('BEGIN TRANSACTION');
    for (const { table, label } of BACKUP_TABLES_INFO) {
      const rows = data[table];
      if (!Array.isArray(rows)) { skipped.push(label); continue; }
      // Имена колонок в INSERT нельзя параметризовать через '?' (только значения) —
      // а они берутся из ключей JSON прямо из файла бэкапа. Если файл подсунут
      // специально испорченным, через имя "колонки" можно было бы внедрить
      // произвольный SQL. Поэтому сверяем каждое имя с реальной схемой таблицы
      // и молча отбрасываем всё, чего там нет — вместо того чтобы доверять
      // содержимому файла напрямую.
      const validCols = new Set(db.getAllSync(`PRAGMA table_info(${table})`).map(c => c.name));
      if (validCols.size === 0) {
        // Такой таблицы в этой версии приложения нет (и создать её не удалось)
        if (rows.length === 0) { skipped.push(label); continue; } // восстанавливать нечего
        throw new Error(`в приложении нет таблицы «${label}» (${table}) — копия сделана другой версией приложения`);
      }
      db.runSync(`DELETE FROM ${table}`);
      for (const row of rows) {
        const cols = Object.keys(row).filter(c => validCols.has(c));
        if (cols.length === 0) continue;
        const placeholders = cols.map(() => '?').join(', ');
        const values = cols.map(c => row[c]);
        db.runSync(
          `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
          values
        );
      }
      restored.push(label);
    }
    if (data.__extra && typeof data.__extra === 'object') {
      for (const [table, rows] of Object.entries(data.__extra)) {
        if (!/^[\p{L}\p{N}_]+$/u.test(table) || !Array.isArray(rows) || BACKUP_TABLES.includes(table)) continue;
        const validCols = new Set(db.getAllSync(`PRAGMA table_info(${table})`).map(c => c.name));
        if (validCols.size === 0) { skipped.push(table); continue; }
        db.runSync(`DELETE FROM ${table}`);
        for (const row of rows) {
          const cols = Object.keys(row).filter(c => validCols.has(c));
          if (cols.length) db.runSync(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map(c => row[c]));
        }
        restored.push(table);
      }
    }
    db.execSync('COMMIT');
    // Копия, сделанная старой версией, содержит PIN открытым текстом —
    // переводим на отпечатки. Блокировку подбора сбрасываем.
    try { Auth.migrateLegacyPins(db); } catch (e) { console.error('[importAllData] миграция PIN не выполнена:', e); }
    try { Auth.resetLoginLock(db); } catch (_) {}
  } catch (e) {
    console.error('[importAllData] Ошибка восстановления — откат к исходному состоянию:', e);
    try { db.execSync('ROLLBACK'); } catch (rollbackErr) {
      console.error('[importAllData] Не удалось откатить транзакцию:', rollbackErr);
    }
    return {
      ok: false,
      error: 'Не удалось восстановить данные — база оставлена без изменений, как было до попытки. ' + (e?.message || ''),
    };
  }

  return { ok: true, restored, skipped, errors: [] };
}

