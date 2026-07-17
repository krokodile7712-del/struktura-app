import * as SQLite from 'expo-sqlite';

let db = null;

export function getDb() {
  if (!db) db = SQLite.openDatabaseSync('struktura.db');
  return db;
}

export function initDatabase() {
  const db = getDb();
  db.execSync(`PRAGMA journal_mode = WAL;`);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS products (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      category  TEXT NOT NULL,
      price_s   REAL DEFAULT 0,
      price_m   REAL DEFAULT 0,
      price_l   REAL DEFAULT 0,
      has_milk  INTEGER DEFAULT 0,
      has_syrup INTEGER DEFAULT 0,
      active    INTEGER DEFAULT 1
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS modifiers (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
      price            REAL DEFAULT 0,
      type             TEXT DEFAULT 'Добавление',
      ingr_to_deduct   TEXT DEFAULT '',
      ingr_to_replace  TEXT DEFAULT ''
    );
  `);

  // ─── Фаза 1: универсальная модель товаров/вариантов/модификаторов ────────

  db.execSync(`
    CREATE TABLE IF NOT EXISTS business_profile (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      preset        TEXT DEFAULT 'coffee',
      business_name TEXT DEFAULT '',
      modules       TEXT DEFAULT '{}',
      terms         TEXT DEFAULT '{}',
      units         TEXT DEFAULT '[]',
      access_key    TEXT DEFAULT ''
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS product_axes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name       TEXT NOT NULL,
      position   INTEGER DEFAULT 0
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id   INTEGER NOT NULL,
      axis_values  TEXT DEFAULT '{}',
      label        TEXT DEFAULT '',
      price        REAL DEFAULT 0,
      sku          TEXT DEFAULT '',
      active       INTEGER DEFAULT 1
    );
  `);

  // Значения осей вариативности — каждая ось (product_axes) имеет набор значений,
  // которые администратор задаёт произвольно: "S" / "маленький" / "250мл" и т.д.
  db.execSync(`
    CREATE TABLE IF NOT EXISTS axis_values (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      axis_id  INTEGER NOT NULL,
      label    TEXT    NOT NULL,
      position INTEGER DEFAULT 0
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS modifier_groups (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT NOT NULL,
      selection_type TEXT DEFAULT 'single'
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS modifier_options (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id        INTEGER NOT NULL,
      name            TEXT NOT NULL,
      price_delta     REAL DEFAULT 0,
      ingr_to_replace TEXT DEFAULT '',
      ingr_to_deduct  TEXT DEFAULT '',
      deduct_amount   REAL DEFAULT 0,
      deduct_unit     TEXT DEFAULT ''
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS product_modifier_groups (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      group_id   INTEGER NOT NULL
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS orders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      total      REAL NOT NULL,
      method     TEXT NOT NULL,
      shift_id   INTEGER,
      client_id  INTEGER,
      status     TEXT DEFAULT 'completed'
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS order_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id   INTEGER NOT NULL,
      product_id INTEGER,
      name       TEXT NOT NULL,
      size       TEXT,
      milk       TEXT,
      syrup      TEXT,
      price      REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS clients (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      fio        TEXT NOT NULL,
      phone      TEXT DEFAULT '',
      code       TEXT UNIQUE,
      balance    REAL DEFAULT 0,
      visits     INTEGER DEFAULT 0,
      total_sum  REAL DEFAULT 0,
      created_at TEXT
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS shifts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      opened_at  TEXT NOT NULL,
      closed_at  TEXT,
      cash_total REAL DEFAULT 0,
      card_total REAL DEFAULT 0,
      status     TEXT DEFAULT 'open'
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS expenses (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      date     TEXT NOT NULL,
      category TEXT NOT NULL,
      amount   REAL NOT NULL,
      comment  TEXT DEFAULT '',
      shift_id INTEGER
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS cost_cards (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      name       TEXT NOT NULL
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS cost_ingredients (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      cost_card_id   INTEGER NOT NULL,
      name           TEXT NOT NULL,
      amount         REAL NOT NULL,
      unit           TEXT NOT NULL,
      price_per_unit REAL NOT NULL,
      FOREIGN KEY (cost_card_id) REFERENCES cost_cards(id)
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS stock (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT NOT NULL,
      остаток  REAL DEFAULT 0,
      unit     TEXT DEFAULT '',
      порог    REAL DEFAULT 0,
      category TEXT DEFAULT 'Прочее'
    );
  `);

  // Точки хранения (модуль "Локации")
  db.execSync(`
    CREATE TABLE IF NOT EXISTS locations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      active      INTEGER DEFAULT 1
    );
  `);

  // Остатки склада по локациям — заполняется только когда модуль "Локации" включён.
  // Уникальная пара stock_id + location_id гарантирует одну запись на позицию/локацию.
  db.execSync(`
    CREATE TABLE IF NOT EXISTS stock_by_location (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_id    INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      остаток     REAL DEFAULT 0,
      UNIQUE(stock_id, location_id)
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS users (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pin  TEXT NOT NULL,
      role TEXT NOT NULL
    );
  `);

  // Дефолтные пользователи — PIN-коды реальные из листа «Настройки»
  const users = db.getAllSync(`SELECT id FROM users LIMIT 1`);
  if (users.length === 0) {
    db.execSync(`
      INSERT INTO users (name, pin, role) VALUES
        ('Бариста',       '1122', 'barista'),
        ('Администратор', '2312', 'admin');
    `);
  }

  // Дефолтные настройки
  const bonusSetting = db.getAllSync(`SELECT key FROM app_settings WHERE key='bonusPct' LIMIT 1`);
  if (bonusSetting.length === 0) {
    db.execSync(`INSERT INTO app_settings (key, value) VALUES ('bonusPct', '10')`);
    db.execSync(`INSERT INTO app_settings (key, value) VALUES ('payMethods', '["Наличные","Карта","QR"]')`);
  }

  // Добавляем новые колонки если их нет (миграция схемы)
  const migrations = [
    `ALTER TABLE products       ADD COLUMN variants   TEXT    DEFAULT '[]'`,
    `ALTER TABLE products       ADD COLUMN sku        TEXT    DEFAULT ''`,
    `ALTER TABLE products       ADD COLUMN photo_uri  TEXT    DEFAULT ''`,
    `ALTER TABLE products       ADD COLUMN price      REAL    DEFAULT 0`,
    `ALTER TABLE orders         ADD COLUMN synced     INTEGER DEFAULT 0`,
    `ALTER TABLE expenses       ADD COLUMN synced     INTEGER DEFAULT 0`,
    `ALTER TABLE clients        ADD COLUMN synced     INTEGER DEFAULT 0`,
    `ALTER TABLE shifts         ADD COLUMN synced     INTEGER DEFAULT 0`,
    `ALTER TABLE cost_cards     ADD COLUMN variant_id INTEGER`,
    `ALTER TABLE order_items    ADD COLUMN variant_id INTEGER`,
    `ALTER TABLE order_items    ADD COLUMN modifiers  TEXT    DEFAULT '[]'`,
    // Фаза 2: коэффициент пересчёта единиц в техкартах (1 = без конвертации)
    `ALTER TABLE cost_ingredients ADD COLUMN factor REAL DEFAULT 1`,
    // Фаза 3: именные сотрудники и привязка смен
    `ALTER TABLE users   ADD COLUMN active        INTEGER DEFAULT 1`,
    `ALTER TABLE shifts  ADD COLUMN user_id       INTEGER`,
    `ALTER TABLE shifts  ADD COLUMN employee_name TEXT    DEFAULT ''`,
    // roles: отображаемые названия ролей (barista_label, admin_label)
    `ALTER TABLE business_profile ADD COLUMN roles TEXT DEFAULT '{}'`,
    // loyalty: модель лояльности и её конфиг
    `ALTER TABLE business_profile ADD COLUMN loyalty_model  TEXT DEFAULT 'points'`,
    `ALTER TABLE business_profile ADD COLUMN loyalty_config TEXT DEFAULT '{}'`,
    // индивидуальная скидка клиента (независима от модели лояльности, настраивается в карточке)
    `ALTER TABLE clients ADD COLUMN discount_pct REAL DEFAULT 0`,
    // Фаза 5: тип способа оплаты для отчётов (чтобы агрегация не зависела от имени метода)
    `ALTER TABLE orders ADD COLUMN method_type TEXT DEFAULT ''`,
    // Блок Б: количество позиции в корзине + заметка к заказу
    `ALTER TABLE order_items ADD COLUMN quantity INTEGER DEFAULT 1`,
    `ALTER TABLE orders      ADD COLUMN note     TEXT    DEFAULT ''`,
    // Блок В: зона/стол заказа
    `ALTER TABLE orders ADD COLUMN zone TEXT DEFAULT ''`,
    // Таблица столов внутри зон (CREATE TABLE IF NOT EXISTS безопасен как миграция)
    `CREATE TABLE IF NOT EXISTS zone_tables (id INTEGER PRIMARY KEY AUTOINCREMENT, zone_id INTEGER NOT NULL, name TEXT NOT NULL, position INTEGER DEFAULT 0)`,
  ];
  for (const sql of migrations) {
    try { db.execSync(sql); } catch (_) {}
  }

  // Профиль бизнеса по умолчанию, если ещё не создан (пресет "coffee" — сохраняет
  // текущее поведение приложения для уже работающих инстансов без миграции данных)
  const profileRow = db.getAllSync(`SELECT id FROM business_profile LIMIT 1`);
  if (profileRow.length === 0) {
    db.runSync(
      `INSERT INTO business_profile (preset, business_name, modules, terms, roles, units, access_key) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'coffee',
        'СТРУКТУРА',
        JSON.stringify({ stock: true, shifts: true, clients: true, loyalty: true, modifiers: true, inventory: true, locations: false, zones: false, templates: false }),
        JSON.stringify({ item: 'Товар', client: 'Клиент', order: 'Заказ', category: 'Категория' }),
        JSON.stringify({ barista: 'Бариста', admin: 'Администратор' }),
        JSON.stringify(['мл', 'л', 'г', 'кг', 'шт', 'уп', 'пара']),
        '',
      ]
    );
  }

  // ─── Инвентаризация ────────────────────────────────────────────────────────

  db.execSync(`
    CREATE TABLE IF NOT EXISTS inventory_acts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at   TEXT NOT NULL,
      location_id  INTEGER,
      location_name TEXT DEFAULT '',
      scope        TEXT DEFAULT 'all',
      scope_value  TEXT DEFAULT '',
      status       TEXT DEFAULT 'draft',
      confirmed_at TEXT DEFAULT ''
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS inventory_act_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      act_id        INTEGER NOT NULL,
      stock_id      INTEGER NOT NULL,
      stock_name    TEXT NOT NULL,
      unit          TEXT DEFAULT '',
      expected      REAL DEFAULT 0,
      actual        REAL,
      diff_qty      REAL,
      cost_per_unit REAL DEFAULT 0,
      diff_money    REAL DEFAULT 0,
      FOREIGN KEY (act_id) REFERENCES inventory_acts(id)
    );
  `);

  // ─── Блок В: Зоны/столы ────────────────────────────────────────────────────
  db.execSync(`
    CREATE TABLE IF NOT EXISTS zones (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      active   INTEGER DEFAULT 1
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS zone_tables (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_id  INTEGER NOT NULL,
      name     TEXT NOT NULL,
      position INTEGER DEFAULT 0
    );
  `);

  // ─── Блок В: Шаблоны заказов ───────────────────────────────────────────────
  db.execSync(`
    CREATE TABLE IF NOT EXISTS order_templates (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      items      TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  console.log('[DB] Инициализация завершена');
}
