// Криптография PIN-кодов: расчёт «отпечатка» (хеша) и правила допустимых PIN.
// Модуль не знает о базе — его можно проверять отдельно.
//
// Расчёт — стандартный PBKDF2-HMAC-SHA256 (RFC 8018) из проверенной
// библиотеки @noble/hashes. Раньше здесь была собственная реализация; результаты
// обеих сверены на 200 случайных входах и совпали, поэтому сохранённые
// отпечатки остаются действительными и менять PIN никому не нужно.
// Случайные числа для соли — из expo-crypto (системный генератор).
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { getRandomBytes } from 'expo-crypto';

export const PIN_MIN = 4;
export const PIN_MAX = 6;

// Число итераций. Для PIN из 4–6 цифр замедление подбора невелико по любому
// значению (всего 10⁴–10⁶ вариантов) — настоящую защиту от подбора на самом
// устройстве даёт блокировка попыток (см. userAuth.js). Значение подобрано так,
// чтобы вход на планшете занимал порядка полусекунды. Если на устройстве
// медленно — уменьшить (но тогда сохранённые отпечатки перестанут совпадать,
// поэтому менять число можно только вместе с переводом отпечатков).
export const PIN_KDF_ITERATIONS = 10000;

const HASH_PREFIX = 'v1$';

function asciiBytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

function hexToBytes(hex) {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) throw new Error('hex: неверная строка');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

// Отпечаток PIN для хранения в базе: «v1$» + 64 hex-символа.
// Соль — общая для бизнеса (см. ensurePinSalt): по ней PIN находится в базе
// прямым сравнением, и два разных бизнеса получают разные отпечатки одного
// и того же PIN.
export function hashPin(pin, saltHex, iterations = PIN_KDF_ITERATIONS) {
  const key = pbkdf2(sha256, asciiBytes(String(pin)), hexToBytes(saltHex), { c: iterations, dkLen: 32 });
  return HASH_PREFIX + bytesToHex(key);
}

// Случайная соль бизнеса, 16 байт в hex. Источник — системный генератор
// случайных чисел (expo-crypto), без запасных вариантов: слабой случайности
// лучше не допускать, чем молча использовать.
export function makeSalt() {
  return bytesToHex(getRandomBytes(16));
}

// ── Правила допустимого PIN ────────────────────────────────────────────────
const COMMON_PINS = new Set([
  '1234', '4321', '1212', '2121', '1122', '2211', '1004', '2000', '2001', '2580', '0852',
  '1313', '6969', '1010', '0123', '3210', '7777',
  '12345', '54321', '11111', '00000', '12321', '123456', '654321', '111222', '121212', '112233', '000000',
]);

export function validatePinFormat(pin) {
  const p = String(pin ?? '');
  if (!/^\d+$/.test(p)) return { ok: false, error: 'PIN должен состоять только из цифр' };
  if (p.length < PIN_MIN || p.length > PIN_MAX) return { ok: false, error: `PIN — от ${PIN_MIN} до ${PIN_MAX} цифр` };
  return { ok: true };
}

// Слишком простой PIN: одна цифра, подряд идущие цифры (1234, 8765),
// повтор короткого узора (1212, 123123) или из списка частых.
export function isWeakPin(pin) {
  const p = String(pin);
  if (COMMON_PINS.has(p)) return true;
  if (/^(\d)\1+$/.test(p)) return true;
  let up = true;
  let down = true;
  for (let i = 1; i < p.length; i++) {
    const d = p.charCodeAt(i) - p.charCodeAt(i - 1);
    if (d !== 1) up = false;
    if (d !== -1) down = false;
  }
  if (up || down) return true;
  for (let n = 1; n <= p.length / 2; n++) {
    if (p.length % n === 0 && p === p.slice(0, n).repeat(p.length / n)) return true;
  }
  return false;
}
