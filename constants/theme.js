// ─── ПАЛИТРА «СТРУКТУРА» — тёплая тёмная тема ───────────────────────────────
export const colors = {
  // Фоны
  bg:       '#171513',   // основной фон
  surface:  '#211e1c',   // поверхность карточек
  surface2: '#2b2925',   // приподнятые элементы
  surface3: '#322f2b',   // ещё уровень выше

  // Разделители и бордеры
  border:   '#403c37',   // основной разделитель
  borderHi: '#504a44',   // подсвеченный
  borderLo: '#2b2925',   // приглушённый

  // Текст
  text:    '#F5F0E8',    // основной (тёплый белый)
  textDim: '#A89F96',    // второстепенный
  muted:   '#6B6560',    // подсказки, плейсхолдеры

  // Акценты
  indigo:       '#8B7FD4',               // индиго — основной акцент
  indigoLight:  '#A599E8',
  indigoGlow:   'rgba(139,127,212,0.3)',

  orange:       '#F0A050',               // оранжевый — CTA
  orangeLight:  '#F5B870',
  orangeGlow:   'rgba(240,160,80,0.3)',

  amber:        '#D4AF6A',               // янтарный — бейджи, уведомления
  amberLight:   '#E0C280',
  amberGlow:    'rgba(212,175,106,0.3)',

  green:        '#7BAF8E',               // премиальный зелёный — успех
  greenLight:   '#8FC4A0',
  greenGlow:    'rgba(123,175,142,0.3)',

  // Статусы
  red:          '#D95F5F',               // ошибки, отмена
  redLight:     '#E87878',
  redGlow:      'rgba(217,95,95,0.35)',

  warning:      '#E8864A',               // предупреждения
  warningLight: '#F0A060',

  // Устаревшие алиасы (для обратной совместимости)
  olive:        '#7BAF8E',
  oliveLight:   '#8FC4A0',
  oliveGlow:    'rgba(123,175,142,0.3)',
  blue:         '#8B7FD4',
  blueLight:    '#A599E8',
  blueGlow:     'rgba(139,127,212,0.3)',
  purple:       '#8B7FD4',
  purpleLight:  '#A599E8',
  purpleGlow:   'rgba(139,127,212,0.3)',

  metalHi:  'rgba(255,255,255,0.09)',
  metalMid: 'rgba(255,255,255,0.04)',
  metalLo:  'rgba(0,0,0,0.6)',
};

// ─── РАЗМЕРЫ И ОТСТУПЫ ───────────────────────────────────────────────────────
export const spacing = {
  xs: 4, sm: 8, md: 14, lg: 20, xl: 28,
};

export const radius = {
  sm: 10, md: 14, lg: 18, xl: 20,
};

// ─── ТИПОГРАФИКА ─────────────────────────────────────────────────────────────
export const fonts = {
  family:         'AnekDevanagari_700Bold',
  familyRegular:  'AnekDevanagari_400Regular',
  familySemibold: 'AnekDevanagari_600SemiBold',
};

// ─── ТЕНИ ────────────────────────────────────────────────────────────────────
export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  button: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  glow: (glowColor) => ({
    shadowColor: glowColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  }),
};

export const gradients = {
  metalBase: ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.01)', 'rgba(0,0,0,0.12)'],
  metalBaseLocations: [0, 0.35, 1],
  cardSurface: ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.01)', 'rgba(0,0,0,0.08)'],
  cardSurfaceLocations: [0, 0.4, 1],
};
