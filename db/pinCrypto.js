// Криптография PIN-кодов: расчёт «отпечатка» (хеша) и правила допустимых PIN.
// Модуль чистый: не знает ни о базе, ни о React Native — поэтому его можно
// проверять отдельно, сверяя результат с эталонной реализацией.
//
// Зачем свой расчёт, а не пакет: на устройстве нет установленных
// криптопакетов, а владелец ставит пакеты вручную на планшете. Алгоритм
// стандартный (PBKDF2-HMAC-SHA256, RFC 8018), реализация проверена на
// совпадение с эталоном Node (crypto.pbkdf2Sync) на тысячах случайных
// входов. Когда появится возможность подключить пакет с нативной
// реализацией (expo-crypto и т.п.) — заменить внутренность hashPin.

export const PIN_MIN = 4;
export const PIN_MAX = 6;

// Число итераций. Для PIN из 4–6 цифр замедление подбора невелико по любому
// значению (всего 10⁴–10⁶ вариантов) — настоящую защиту от подбора на самом
// устройстве даёт блокировка попыток (см. userAuth.js). Значение подобрано так,
// чтобы вход на планшете занимал порядка полусекунды. Если на устройстве
// медленно — уменьшить.
export const PIN_KDF_ITERATIONS = 10000;

const HASH_PREFIX = 'v1$';

// ── SHA-256 ────────────────────────────────────────────────────────────────
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const IV = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

// Одна «сжимающая» операция SHA-256: state (8 слов) ← state + блок (16 слов).
function compress(state, w, block) {
  for (let i = 0; i < 16; i++) w[i] = block[i];
  for (let i = 16; i < 64; i++) {
    const x = w[i - 15];
    const y = w[i - 2];
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
  }
  let a = state[0], b = state[1], c = state[2], d = state[3];
  let e = state[4], f = state[5], g = state[6], h = state[7];
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0;
    d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  state[0] = (state[0] + a) | 0; state[1] = (state[1] + b) | 0;
  state[2] = (state[2] + c) | 0; state[3] = (state[3] + d) | 0;
  state[4] = (state[4] + e) | 0; state[5] = (state[5] + f) | 0;
  state[6] = (state[6] + g) | 0; state[7] = (state[7] + h) | 0;
}

// ── PBKDF2-HMAC-SHA256, один блок на выходе (32 байта) ─────────────────────
// Ограничения (нам хватает с запасом, и они проверяются): пароль до 64 байт,
// соль до 55 байт — тогда каждое сообщение HMAC помещается в один блок.
function pbkdf2Sha256(passBytes, saltBytes, iterations) {
  if (passBytes.length > 64) throw new Error('pbkdf2: слишком длинный пароль');
  if (saltBytes.length > 51) throw new Error('pbkdf2: слишком длинная соль');
  if (!(iterations >= 1)) throw new Error('pbkdf2: число итераций должно быть >= 1');

  const w = new Uint32Array(64);

  // Ключ HMAC (пароль, дополненный нулями до блока), XOR с ipad / opad
  const ipad = new Uint32Array(16);
  const opad = new Uint32Array(16);
  for (let i = 0; i < 16; i++) {
    let iw = 0;
    let ow = 0;
    for (let j = 0; j < 4; j++) {
      const idx = i * 4 + j;
      const kb = idx < passBytes.length ? passBytes[idx] : 0;
      iw = (iw << 8) | (kb ^ 0x36);
      ow = (ow << 8) | (kb ^ 0x5c);
    }
    ipad[i] = iw;
    opad[i] = ow;
  }
  // Состояния после обработки ipad / opad блоков — считаются один раз
  const istate = new Uint32Array(IV);
  compress(istate, w, ipad);
  const ostate = new Uint32Array(IV);
  compress(ostate, w, opad);

  const st = new Uint32Array(8);
  const blockIn = new Uint32Array(16);
  const blockOut = new Uint32Array(16);

  // Хвост блока для 32-байтного сообщения: 0x80, нули, длина (64+32)·8 = 768 бит
  blockOut[8] = 0x80000000;
  blockOut[15] = 768;
  blockIn[8] = 0x80000000;
  blockIn[15] = 768;

  // U1 = HMAC(пароль, соль ‖ 00000001)
  const msgLen = saltBytes.length + 4;
  const msg = new Uint8Array(64);
  msg.set(saltBytes, 0);
  msg[saltBytes.length + 3] = 1;
  msg[msgLen] = 0x80;
  const first = new Uint32Array(16);
  for (let i = 0; i < 16; i++) {
    first[i] = ((msg[i * 4] << 24) | (msg[i * 4 + 1] << 16) | (msg[i * 4 + 2] << 8) | msg[i * 4 + 3]) | 0;
  }
  first[15] = (64 + msgLen) * 8;

  st.set(istate);
  compress(st, w, first);
  for (let i = 0; i < 8; i++) blockOut[i] = st[i];
  st.set(ostate);
  compress(st, w, blockOut);

  const u = new Uint32Array(8);
  const t = new Uint32Array(8);
  for (let i = 0; i < 8; i++) { u[i] = st[i]; t[i] = st[i]; }

  for (let it = 2; it <= iterations; it++) {
    for (let i = 0; i < 8; i++) blockIn[i] = u[i];
    st.set(istate);
    compress(st, w, blockIn);
    for (let i = 0; i < 8; i++) blockOut[i] = st[i];
    st.set(ostate);
    compress(st, w, blockOut);
    for (let i = 0; i < 8; i++) { u[i] = st[i]; t[i] ^= st[i]; }
  }

  let hex = '';
  for (let i = 0; i < 8; i++) hex += (t[i] >>> 0).toString(16).padStart(8, '0');
  return hex;
}

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

// Отпечаток PIN для хранения в базе: «v1$» + 64 hex-символа.
// Соль — общая для бизнеса (см. ensurePinSalt): по ней PIN находится в базе
// прямым сравнением, и два разных бизнеса получают разные отпечатки одного
// и того же PIN.
export function hashPin(pin, saltHex, iterations = PIN_KDF_ITERATIONS) {
  return HASH_PREFIX + pbkdf2Sha256(asciiBytes(String(pin)), hexToBytes(saltHex), iterations);
}

// Случайная соль, 16 байт в hex. Соль не секретна (лежит в базе рядом с
// отпечатками) — ей нужна только уникальность у каждого бизнеса, поэтому
// запасной источник случайности на Math.random допустим.
export function makeSalt() {
  const bytes = new Uint8Array(16);
  let filled = false;
  try {
    const c = globalThis.crypto;
    if (c && typeof c.getRandomValues === 'function') { c.getRandomValues(bytes); filled = true; }
  } catch (_) {}
  if (!filled) {
    let seed = (Date.now() ^ ((typeof performance !== 'undefined' && performance.now ? performance.now() : 0) * 1000)) >>> 0;
    for (let i = 0; i < 16; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      bytes[i] = (Math.floor(Math.random() * 256) ^ (seed >>> 24)) & 0xff;
    }
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
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
