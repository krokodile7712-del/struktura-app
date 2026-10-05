// Выгрузка и восстановление всех данных (резервная копия). Принимает db первым
// аргументом — так восстановление можно проверять на тестовой базе отдельно от
// приложения. Шифрование файла — db/backupCrypto.js.
import * as Auth from './userAuth';

export const BACKUP_TABLES_INFO = [
  { table: 'business_profile',        label: 'Профиль бизнеса' },
  { table: 'app_settings',            label: 'Настройки приложения' },
  { table: 'users',                   label: 'Сотрудники (PIN-коды)' },
  { table: 'products',                label: 'Товары' },
  { table: 'product_variants',        label: 'Варианты и цены товаров' },
  { table: 'product_axes',            label: 'Оси товаров (размер/вкус и т.п.)' },
  { table: 'axis_values',             label: 'Значения осей товаров' },
  { table: 'categories',              label: 'Категории товаров' },
  { table: 'modifiers',               label: 'Модификаторы (старые)' },
  { table: 'modifier_groups',         label: 'Группы модификаторов' },
  { table: 'modifier_options',        label: 'Опции модификаторов' },
  { table: 'product_modifier_groups', label: 'Привязка модификаторов к товарам' },
  { table: 'cost_cards',              label: 'Техкарты' },
  { table: 'cost_ingredients',        label: 'Ингредиенты техкарт' },
  { table: 'price_schedules',         label: 'Расписания цен' },
  { table: 'clients',                 label: 'Клиенты' },
  { table: 'orders',                  label: 'Заказы' },
  { table: 'order_items',             label: 'Позиции заказов' },
  { table: 'order_templates',         label: 'Шаблоны заказов' },
  { table: 'shifts',                  label: 'Смены' },
  { table: 'expenses',                label: 'Расходы' },
  { table: 'stock',                   label: 'Склад' },
  { table: 'stock_by_location',       label: 'Остатки по локациям' },
  { table: 'stock_deductions',        label: 'Списания со склада' },
  { table: 'purchases',               label: 'Закупки' },
  { table: 'locations',               label: 'Локации' },
  { table: 'zones',                   label: 'Зоны' },
  { table: 'zone_tables',             label: 'Столы' },
  { table: 'equipment',               label: 'Оборудование' },
  { table: 'overhead_items',          label: 'Накладные расходы' },
  { table: 'investments',             label: 'Инвестиции' },
  { table: 'inventory_acts',          label: 'Акты инвентаризации' },
  { table: 'inventory_act_items',     label: 'Позиции инвентаризации' },
  { table: 'fiscal_queue',            label: 'Очередь чеков (фискализация)' },
];
export const BACKUP_TABLES = BACKUP_TABLES_INFO.map(t => t.table);

export function exportAllData(db) {
  const data = { exported_at: new Date().toISOString(), app: 'struktura' };
  for (const table of BACKUP_TABLES) {
    try { data[table] = db.getAllSync(`SELECT * FROM ${table}`); }
    catch (_) { data[table] = []; }
  }
  // Счётчик неверных PIN и время блокировки — состояние конкретного устройства,
  // в копию не кладём (иначе после восстановления вход оказался бы заблокирован)
  data.app_settings = (data.app_settings || []).filter(r => r.key !== 'pin_fail_count' && r.key !== 'pin_lock_until');
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

