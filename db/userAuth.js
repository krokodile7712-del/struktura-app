// Сотрудники и вход по PIN. Все функции принимают db первым аргументом —
// так их можно проверять отдельно от приложения (на тестовой базе).
//
// Как устроена защита (коротко):
//  • PIN нигде не хранится. В базе лежит отпечаток: PBKDF2-SHA256 от PIN
//    с СОЛЬЮ БИЗНЕСА — случайной строкой, которая создаётся один раз при
//    регистрации бизнеса (app_settings → pin_salt). Один и тот же PIN у двух
//    разных бизнесов даёт разные отпечатки. Данные бизнеса лежат в его
//    собственной базе на его устройстве, в облако PIN не уходят.
//  • Вход — по одному PIN (он же определяет сотрудника), поэтому PIN обязан
//    быть уникальным среди сотрудников; это проверяется при создании и смене.
//  • Подбор на самом устройстве ограничен блокировкой: после 5 неверных
//    попыток подряд — пауза 30 с, дальше она удваивается (до 30 мин).
//  • Нельзя остаться без администратора: последнего активного администратора
//    нельзя удалить, деактивировать или понизить в роли.
//  • Управлять сотрудниками, их ролями и PIN-кодами может ТОЛЬКО администратор
//    (проверяется здесь, в базе, а не только на экранах). Сотрудник свой PIN
//    не меняет — его задаёт администратор. Единственное исключение: пока в
//    базе нет ни одного сотрудника, первого администратора создаёт мастер
//    регистрации.
import { hashPin, makeSalt, validatePinFormat, isWeakPin } from './pinCrypto';

const SALT_KEY = 'pin_salt';
const FAIL_KEY = 'pin_fail_count';
const LOCK_KEY = 'pin_lock_until';

export const LOCK_AFTER_FAILS = 5;
export const BASE_LOCK_MS = 30 * 1000;
export const MAX_LOCK_MS = 30 * 60 * 1000;

// ── Настройки (прямо через db, без зависимости от queries.js) ─────────────
function getRaw(db, key) {
  const row = db.getFirstSync(`SELECT value FROM app_settings WHERE key = ?`, [key]);
  return row ? row.value : null;
}
function setRaw(db, key, value) {
  db.runSync(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value)]
  );
}
function delRaw(db, key) {
  db.runSync(`DELETE FROM app_settings WHERE key = ?`, [key]);
}

// Соль бизнеса: создаётся при первом обращении, дальше не меняется. Если базу
// «начать заново», настройки стираются, и новый бизнес получает новую соль.
export function ensurePinSalt(db) {
  let salt = getRaw(db, SALT_KEY);
  if (!salt || !/^[0-9a-f]{32}$/.test(salt)) {
    salt = makeSalt();
    setRaw(db, SALT_KEY, salt);
  }
  return salt;
}

function hashForDb(db, pin) {
  return hashPin(String(pin), ensurePinSalt(db));
}

// Пользователь без секретов — именно он попадает в сессию и на экраны.
export function stripSecrets(user) {
  if (!user) return user;
  const { pin, pin_hash, ...rest } = user; // eslint-disable-line no-unused-vars
  return rest;
}

// ── Проверка PIN при создании/смене ───────────────────────────────────────
function checkNewPin(db, pin, exceptId = null) {
  const p = String(pin ?? '').trim();
  const fmt = validatePinFormat(p);
  if (!fmt.ok) return fmt;
  if (isWeakPin(p)) {
    return { ok: false, error: 'Слишком простой PIN (например, 1234, 0000, 1212). Придумайте другой.' };
  }
  const h = hashForDb(db, p);
  const dup = db.getFirstSync(
    `SELECT id FROM users WHERE pin_hash = ? AND (? IS NULL OR id != ?) LIMIT 1`,
    [h, exceptId, exceptId]
  );
  // Старые записи, которые ещё не успели перейти на отпечатки, — сравниваем напрямую
  const legacyDup = !dup && db.getFirstSync(
    `SELECT id FROM users WHERE (pin_hash IS NULL OR pin_hash = '') AND pin = ? AND (? IS NULL OR id != ?) LIMIT 1`,
    [p, exceptId, exceptId]
  );
  if (dup || legacyDup) return { ok: false, error: 'Этот PIN уже занят другим сотрудником. Выберите другой.' };
  return { ok: true, pin: p, hash: h };
}

// ── Вход ──────────────────────────────────────────────────────────────────
// Находит активного сотрудника по PIN. Попутно переводит «старую» запись
// (PIN открытым текстом) на отпечаток.
export function findUserByPin(db, pin) {
  const p = String(pin ?? '');
  if (!/^\d{4,6}$/.test(p)) return null;
  const h = hashForDb(db, p);
  let row = db.getFirstSync(
    `SELECT * FROM users WHERE pin_hash = ? AND active != 0 ORDER BY id LIMIT 1`, [h]
  );
  if (!row) {
    const legacy = db.getFirstSync(
      `SELECT * FROM users WHERE (pin_hash IS NULL OR pin_hash = '') AND pin = ? AND active != 0 ORDER BY id LIMIT 1`, [p]
    );
    if (legacy) {
      db.runSync(`UPDATE users SET pin_hash = ?, pin = '' WHERE id = ?`, [h, legacy.id]);
      row = { ...legacy, pin_hash: h, pin: '' };
    }
  }
  return row ? stripSecrets(row) : null;
}

// Состояние блокировки подбора
export function getLoginLock(db, now = Date.now()) {
  const until = Number(getRaw(db, LOCK_KEY) || 0) || 0;
  // Защита от «часов, переведённых далеко вперёд, в самом файле»: больше
  // максимальной паузы ждать не заставляем
  const remaining = Math.min(until - now, MAX_LOCK_MS);
  return remaining > 0 ? { locked: true, remainingMs: remaining } : { locked: false, remainingMs: 0 };
}

// Учитывает неудачную попытку PIN и при необходимости включает блокировку.
function registerFailure(db, now) {
  const fails = (Number(getRaw(db, FAIL_KEY) || 0) || 0) + 1;
  setRaw(db, FAIL_KEY, fails);
  if (fails >= LOCK_AFTER_FAILS) {
    const ms = Math.min(BASE_LOCK_MS * Math.pow(2, fails - LOCK_AFTER_FAILS), MAX_LOCK_MS);
    setRaw(db, LOCK_KEY, now + ms);
    return { ok: false, locked: true, remainingMs: ms, error: 'Неверный PIN-код' };
  }
  return { ok: false, locked: false, attemptsLeft: LOCK_AFTER_FAILS - fails, error: 'Неверный PIN-код' };
}

// Попытка входа со счётом неудач.
// Возвращает: { ok:true, user } | { ok:false, locked:true, remainingMs } |
//             { ok:false, locked:false, attemptsLeft, error }
export function attemptLogin(db, pin, now = Date.now()) {
  const lock = getLoginLock(db, now);
  if (lock.locked) return { ok: false, locked: true, remainingMs: lock.remainingMs, error: 'Слишком много попыток' };

  const user = findUserByPin(db, pin);
  if (user) {
    delRaw(db, FAIL_KEY);
    delRaw(db, LOCK_KEY);
    return { ok: true, user };
  }

  return registerFailure(db, now);
}

// Подтверждение PIN администратора перед опасным действием (стереть всё,
// восстановить из копии, удалить сотрудника). Проверяет, что введён PIN
// именно этого администратора, и делит со входом один счётчик неудач и одну
// блокировку — подбор через окно подтверждения не обходит защиту.
export function confirmAdminPin(db, userId, pin, now = Date.now()) {
  const lock = getLoginLock(db, now);
  if (lock.locked) return { ok: false, locked: true, remainingMs: lock.remainingMs, error: 'Слишком много попыток' };
  const found = isActiveAdmin(db, userId) ? findUserByPin(db, pin) : null;
  if (found && found.id === userId) {
    delRaw(db, FAIL_KEY);
    delRaw(db, LOCK_KEY);
    return { ok: true };
  }
  return registerFailure(db, now);
}

// ── Сотрудники ────────────────────────────────────────────────────────────
export const NOT_ADMIN_ERROR = 'Управлять сотрудниками и PIN-кодами может только администратор';

// Действующий администратор по номеру (роль берётся из базы, а не из сессии)
export function isActiveAdmin(db, id) {
  if (id === null || id === undefined) return false;
  const r = db.getFirstSync(`SELECT role, active FROM users WHERE id = ?`, [id]);
  return !!r && r.role === 'admin' && !!r.active;
}

// Управлять сотрудниками можно администратору; единственное исключение —
// пустая база (первый запуск: мастер создаёт первого администратора)
function canManageUsers(db, actorId) {
  if (isActiveAdmin(db, actorId)) return true;
  return (db.getFirstSync(`SELECT COUNT(*) AS n FROM users`)?.n || 0) === 0;
}

function activeAdminCount(db, exceptId = null) {
  const r = db.getFirstSync(
    `SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active != 0 AND (? IS NULL OR id != ?)`,
    [exceptId, exceptId]
  );
  return r?.n || 0;
}

// Добавляет сотрудника. Возвращает { ok, id } или { ok:false, error }
export function addUser(db, actorId, name, pin, role, salaryType = 'shift', salaryAmount = 0, extra = {}) {
  if (!canManageUsers(db, actorId)) return { ok: false, error: NOT_ADMIN_ERROR };
  if (!name?.trim()) return { ok: false, error: 'Укажите имя сотрудника' };
  const chk = checkNewPin(db, pin);
  if (!chk.ok) return chk;
  const { kpiType = '', kpiAmount = 0, kpiPeriod = 'month', locationId = null, kpiBonusAmount = 0, kpiInSalary = 0 } = extra;
  const res = db.runSync(
    `INSERT INTO users (name, pin, pin_hash, role, active, salary_type, salary_amount, kpi_type, kpi_amount, kpi_period, location_id, kpi_bonus_amount, kpi_in_salary)
     VALUES (?, '', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name.trim(), chk.hash, role, salaryType, salaryAmount, kpiType, kpiAmount, kpiPeriod, locationId, kpiBonusAmount, kpiInSalary]
  );
  return { ok: true, id: res?.lastInsertRowId ?? null };
}

// Обновляет сотрудника. Пустой PIN означает «не менять».
export function updateUser(db, actorId, id, name, pin, role, salaryType = 'shift', salaryAmount = 0, extra = {}) {
  if (!canManageUsers(db, actorId)) return { ok: false, error: NOT_ADMIN_ERROR };
  if (!name?.trim()) return { ok: false, error: 'Укажите имя сотрудника' };
  const existing = db.getFirstSync(`SELECT id, role, active FROM users WHERE id = ?`, [id]);
  if (!existing) return { ok: false, error: 'Сотрудник не найден' };
  if (existing.role === 'admin' && existing.active && role !== 'admin' && activeAdminCount(db, id) === 0) {
    return { ok: false, error: 'Нельзя снять роль администратора с единственного администратора' };
  }

  const wantsNewPin = String(pin ?? '').trim() !== '';
  let hash = null;
  if (wantsNewPin) {
    const chk = checkNewPin(db, pin, id);
    if (!chk.ok) return chk;
    hash = chk.hash;
  }

  const { kpiType = '', kpiAmount = 0, kpiPeriod = 'month', locationId = null, kpiBonusAmount = 0, kpiInSalary = 0 } = extra;
  db.runSync(
    `UPDATE users SET name = ?, role = ?, salary_type = ?, salary_amount = ?, kpi_type = ?, kpi_amount = ?, kpi_period = ?, location_id = ?, kpi_bonus_amount = ?, kpi_in_salary = ? WHERE id = ?`,
    [name.trim(), role, salaryType, salaryAmount, kpiType, kpiAmount, kpiPeriod, locationId, kpiBonusAmount, kpiInSalary, id]
  );
  if (hash) db.runSync(`UPDATE users SET pin_hash = ?, pin = '' WHERE id = ?`, [hash, id]);
  return { ok: true };
}

// Удаление сотрудника. Единственного активного администратора удалить нельзя.
export function deleteUser(db, actorId, id) {
  if (!canManageUsers(db, actorId)) return { ok: false, error: NOT_ADMIN_ERROR };
  const user = db.getFirstSync(`SELECT id, role, active FROM users WHERE id = ?`, [id]);
  if (!user) return { ok: false, error: 'Сотрудник не найден' };
  if (user.role === 'admin' && user.active && activeAdminCount(db, id) === 0) {
    return { ok: false, error: 'Нельзя удалить единственного администратора' };
  }
  db.runSync(`DELETE FROM users WHERE id = ?`, [id]);
  return { ok: true };
}

// Отключение/включение сотрудника (мягкое удаление). Нельзя отключить
// последнего активного администратора.
export function toggleUserActive(db, actorId, id) {
  if (!canManageUsers(db, actorId)) return { ok: false, error: NOT_ADMIN_ERROR };
  const user = db.getFirstSync(`SELECT * FROM users WHERE id = ?`, [id]);
  if (!user) return { ok: false, error: 'Сотрудник не найден' };
  if (user.active && user.role === 'admin' && activeAdminCount(db, id) === 0) {
    return { ok: false, error: 'Нельзя деактивировать единственного администратора' };
  }
  db.runSync(`UPDATE users SET active = ? WHERE id = ?`, [user.active ? 0 : 1, id]);
  return { ok: true };
}

// Права сотрудника (что ему разрешено) — тоже часть управления сотрудниками
export function saveUserPermissions(db, actorId, userId, permissions) {
  if (!canManageUsers(db, actorId)) return { ok: false, error: NOT_ADMIN_ERROR };
  db.runSync(`UPDATE users SET permissions = ? WHERE id = ?`, [JSON.stringify(permissions), userId]);
  return { ok: true };
}

// ── Миграция и обслуживание ───────────────────────────────────────────────
// Переводит все записи с PIN открытым текстом на отпечатки. Безопасно
// повторять: трогает только записи, где отпечатка ещё нет.
export function migrateLegacyPins(db) {
  const rows = db.getAllSync(
    `SELECT id, pin FROM users WHERE (pin_hash IS NULL OR pin_hash = '') AND pin IS NOT NULL AND pin != ''`
  );
  if (rows.length === 0) return 0;
  const salt = ensurePinSalt(db);
  db.execSync('BEGIN');
  try {
    for (const r of rows) {
      db.runSync(`UPDATE users SET pin_hash = ?, pin = '' WHERE id = ?`, [hashPin(String(r.pin), salt), r.id]);
    }
    db.execSync('COMMIT');
  } catch (e) {
    try { db.execSync('ROLLBACK'); } catch (_) {}
    throw e;
  }
  return rows.length;
}

// Группы активных сотрудников с одинаковым PIN (могли появиться в старых
// данных). Возвращает массив массивов имён.
export function findDuplicatePinUsers(db) {
  const rows = db.getAllSync(
    `SELECT pin_hash, GROUP_CONCAT(name, '|') AS names, COUNT(*) AS c
     FROM users WHERE active != 0 AND pin_hash IS NOT NULL AND pin_hash != ''
     GROUP BY pin_hash HAVING COUNT(*) > 1`
  );
  return rows.map(r => String(r.names).split('|'));
}

// Сброс счётчиков блокировки — после восстановления из копии
export function resetLoginLock(db) {
  delRaw(db, FAIL_KEY);
  delRaw(db, LOCK_KEY);
}
