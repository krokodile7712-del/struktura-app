import * as SQLite from 'expo-sqlite';

let db = null;

export function getDb() {
  if (!db) {
    db = SQLite.openDatabaseSync('struktura.db');
  }
  return db;
}

// Создаёт все таблицы при первом запуске
export function initDatabase() {
  const db = getDb();

  db.execSync(`PRAGMA journal_mode = WAL;`);

  // Товары / меню
  db.execSync(`
    CREATE TABLE IF NOT EXISTS products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      category    TEXT NOT NULL,
      price_s     REAL,
      price_m     REAL,
      price_l     REAL,
      has_milk    INTEGER DEFAULT 0,
      has_syrup   INTEGER DEFAULT 0,
      active      INTEGER DEFAULT 1
    );
  `);

  // Заказы
  db.execSync(`
    CREATE TABLE IF NOT EXISTS orders (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at  TEXT NOT NULL,
      total       REAL NOT NULL,
      method      TEXT NOT NULL,
      shift_id    INTEGER,
      client_id   INTEGER,
      status      TEXT DEFAULT 'completed'
    );
  `);

  // Позиции в заказе
  db.execSync(`
    CREATE TABLE IF NOT EXISTS order_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id    INTEGER NOT NULL,
      product_id  INTEGER,
      name        TEXT NOT NULL,
      size        TEXT,
      milk        TEXT,
      syrup       TEXT,
      price       REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );
  `);

  // Клиенты
  db.execSync(`
    CREATE TABLE IF NOT EXISTS clients (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      fio         TEXT NOT NULL,
      phone       TEXT,
      code        TEXT UNIQUE,
      balance     REAL DEFAULT 0,
      visits      INTEGER DEFAULT 0,
      total_sum   REAL DEFAULT 0,
      created_at  TEXT
    );
  `);

  // Смены
  db.execSync(`
    CREATE TABLE IF NOT EXISTS shifts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      opened_at   TEXT NOT NULL,
      closed_at   TEXT,
      cash_total  REAL DEFAULT 0,
      card_total  REAL DEFAULT 0,
      status      TEXT DEFAULT 'open'
    );
  `);

  // Расходы
  db.execSync(`
    CREATE TABLE IF NOT EXISTS expenses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT NOT NULL,
      category    TEXT NOT NULL,
      amount      REAL NOT NULL,
      comment     TEXT,
      shift_id    INTEGER
    );
  `);

  // Техкарты (себестоимость)
  db.execSync(`
    CREATE TABLE IF NOT EXISTS cost_cards (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id  INTEGER,
      name        TEXT NOT NULL
    );
  `);

  // Ингредиенты техкарт
  db.execSync(`
    CREATE TABLE IF NOT EXISTS cost_ingredients (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      cost_card_id    INTEGER NOT NULL,
      name            TEXT NOT NULL,
      amount          REAL NOT NULL,
      unit            TEXT NOT NULL,
      price_per_unit  REAL NOT NULL,
      FOREIGN KEY (cost_card_id) REFERENCES cost_cards(id)
    );
  `);

  // Пин-коды пользователей
  db.execSync(`
    CREATE TABLE IF NOT EXISTS users (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      name    TEXT NOT NULL,
      pin     TEXT NOT NULL,
      role    TEXT NOT NULL
    );
  `);

  // Вставляем дефолтных пользователей если таблица пустая
  const users = db.getAllSync(`SELECT id FROM users LIMIT 1`);
  if (users.length === 0) {
    db.execSync(`
      INSERT INTO users (name, pin, role) VALUES
        ('Бариста', '1234', 'barista'),
        ('Администратор', '0000', 'admin');
    `);
  }

  console.log('[DB] Инициализация завершена');
}
