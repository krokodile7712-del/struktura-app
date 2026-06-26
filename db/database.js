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
    `ALTER TABLE products  ADD COLUMN variants  TEXT    DEFAULT '[]'`,
    `ALTER TABLE orders    ADD COLUMN synced    INTEGER DEFAULT 0`,
    `ALTER TABLE expenses  ADD COLUMN synced    INTEGER DEFAULT 0`,
    `ALTER TABLE clients   ADD COLUMN synced    INTEGER DEFAULT 0`,
    `ALTER TABLE shifts    ADD COLUMN synced    INTEGER DEFAULT 0`,
  ];
  for (const sql of migrations) {
    try { db.execSync(sql); } catch (_) {}
  }

  // Добавляем колонку variants если её нет (миграция схемы)
  try {
    db.execSync(`ALTER TABLE products ADD COLUMN variants TEXT DEFAULT '[]'`);
  } catch (_) {}

  console.log('[DB] Инициализация завершена');
}
