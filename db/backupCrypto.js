// Шифрование файла резервной копии паролем.
//
// Зачем: файл копии содержит ВСЕ данные бизнеса — клиентов, продажи, зарплаты,
// секрет облачной записи и отпечатки PIN-кодов. Раньше он лежал открытым
// текстом, и любой, кто получил файл (мессенджер, облако, чужой телефон),
// получал всё. Теперь файл шифруется паролем, который задаёт администратор.
//
// Схема: ключ = PBKDF2-HMAC-SHA256(пароль, случайная соль, 200 000 итераций);
// шифр = AES-256-GCM (проверяет и подлинность: неверный пароль и любая порча
// файла определяются при расшифровке). Заголовок файла (формат, версия,
// алгоритмы, число итераций) входит в проверяемые данные — подменить число
// итераций в файле нельзя. Для каждой копии — новая соль и новый одноразовый
// номер (nonce). Забытый пароль восстановить нельзя.
import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { getRandomBytes } from 'expo-crypto';

export const BACKUP_FORMAT = 'struktura-backup';
export const BACKUP_VERSION = 2;
export const BACKUP_KDF_ITERATIONS = 200000;
export const BACKUP_PASSWORD_MIN = 10;

// Границы числа итераций при чтении чужого файла: не даём подсунуть файл с
// заниженным значением (слабый ключ) или с гигантским (зависание приложения)
const MIN_ITERATIONS = 100000;
const MAX_ITERATIONS = 2000000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ── base64 (без atob/btoa и без внешних пакетов; безопасно для больших файлов) ──
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) B64_LOOKUP[B64.charCodeAt(i)] = i;

export function bytesToBase64(bytes) {
  const len = bytes.length;
  const parts = [];
  let chunk = '';
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    chunk += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)]
      + (i + 1 < len ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=')
      + (i + 2 < len ? B64[b2 & 63] : '=');
    if (chunk.length >= 16384) { parts.push(chunk); chunk = ''; }
  }
  parts.push(chunk);
  return parts.join('');
}

export function base64ToBytes(str) {
  const s = String(str).replace(/\s+/g, '');
  if (s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('base64: неверная строка');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const c0 = B64_LOOKUP[s.charCodeAt(i)];
    const c1 = B64_LOOKUP[s.charCodeAt(i + 1)];
    const c2 = s[i + 2] === '=' ? 0 : B64_LOOKUP[s.charCodeAt(i + 2)];
    const c3 = s[i + 3] === '=' ? 0 : B64_LOOKUP[s.charCodeAt(i + 3)];
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// ── Пароль ────────────────────────────────────────────────────────────────
// Приводим к единому виду: на разных клавиатурах один и тот же текст может
// набираться разными наборами символов (составные и разложенные буквы)
function normalizePassword(password) {
  let p = String(password ?? '');
  try { p = p.normalize('NFKC'); } catch (_) {}
  return p;
}

export function validateBackupPassword(password) {
  const p = normalizePassword(password);
  if (p.length < BACKUP_PASSWORD_MIN) return { ok: false, error: `Пароль — не короче ${BACKUP_PASSWORD_MIN} символов` };
  if (/^(.)\1+$/.test(p)) return { ok: false, error: 'Слишком простой пароль' };
  return { ok: true };
}

function additionalData(iterations) {
  return encoder.encode(`${BACKUP_FORMAT}|${BACKUP_VERSION}|aes-256-gcm|pbkdf2-sha256|${iterations}`);
}

// ── Шифрование / расшифровка ──────────────────────────────────────────────
// Возвращает { ok:true, file } (объект, который сохраняется как JSON) или { ok:false, error }
export function encryptBackup(data, password, iterations = BACKUP_KDF_ITERATIONS) {
  const check = validateBackupPassword(password);
  if (!check.ok) return check;
  const salt = getRandomBytes(16);
  const nonce = getRandomBytes(12);
  const key = pbkdf2(sha256, encoder.encode(normalizePassword(password)), salt, { c: iterations, dkLen: 32 });
  try {
    const plain = encoder.encode(JSON.stringify(data));
    const sealed = gcm(key, nonce, additionalData(iterations)).encrypt(plain);
    return {
      ok: true,
      file: {
        app: 'struktura',
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        enc: 'aes-256-gcm',
        kdf: 'pbkdf2-sha256',
        iterations,
        salt: bytesToBase64(salt),
        nonce: bytesToBase64(nonce),
        data: bytesToBase64(sealed),
      },
    };
  } finally {
    key.fill(0);
  }
}

// Файл зашифрован нашей схемой?
export function isEncryptedBackup(obj) {
  return !!obj && typeof obj === 'object' && obj.format === BACKUP_FORMAT && obj.enc === 'aes-256-gcm';
}

// Возвращает { ok:true, data } или { ok:false, error }
export function decryptBackup(file, password) {
  if (!isEncryptedBackup(file)) return { ok: false, error: 'Файл не является зашифрованной копией СТРУКТУРЫ' };
  if (file.version !== BACKUP_VERSION || file.kdf !== 'pbkdf2-sha256') {
    return { ok: false, error: 'Файл создан несовместимой версией приложения' };
  }
  const iterations = Number(file.iterations);
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    return { ok: false, error: 'Файл повреждён (недопустимые параметры шифрования)' };
  }
  let salt; let nonce; let sealed;
  try {
    salt = base64ToBytes(file.salt);
    nonce = base64ToBytes(file.nonce);
    sealed = base64ToBytes(file.data);
  } catch (_) {
    return { ok: false, error: 'Файл повреждён' };
  }
  if (salt.length !== 16 || nonce.length !== 12 || sealed.length < 16) return { ok: false, error: 'Файл повреждён' };

  const key = pbkdf2(sha256, encoder.encode(normalizePassword(password)), salt, { c: iterations, dkLen: 32 });
  try {
    let plain;
    try {
      plain = gcm(key, nonce, additionalData(iterations)).decrypt(sealed);
    } catch (_) {
      // Неверный пароль и порча файла для AES-GCM неотличимы — говорим об обоих
      return { ok: false, error: 'Неверный пароль или файл повреждён' };
    }
    try {
      return { ok: true, data: JSON.parse(decoder.decode(plain)) };
    } catch (_) {
      return { ok: false, error: 'Файл повреждён' };
    }
  } finally {
    key.fill(0);
  }
}
