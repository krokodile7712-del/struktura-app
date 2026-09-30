// ─── ПАЛИТРА «СМЕНА» ─────────────────────────────────────────────────────────
// Имена ключей намеренно оставлены прежними (orange/indigo/green/red/amber/
// warning и т.д.) — на них завязаны все экраны приложения. Меняется только
// то, во что они раскрашиваются. orange = золото (главный акцент, кнопки
// действия), indigo = слива (второй акцент, структура). Смысловая роль
// каждого цвета (успех/ошибка/предупреждение) сохранена, поменялись только
// сами оттенки — под глубокий тёмно-зелёный фон вместо нейтрального графита.
export const colors = {
  // Фоны — тёмно-зелёный с оттенком, не нейтральный графит
  bg:       '#0A0F0D',   // основной фон
  surface:  '#111814',   // поверхность карточек
  surface2: '#161E19',   // приподнятые элементы
  surface3: '#1C251F',   // ещё уровень выше

  // Разделители и бордеры
  border:   '#28322B',   // основной разделитель
  borderHi: '#37453B',   // подсвеченный
  borderLo: '#161E19',   // приглушённый

  // Текст
  text:    '#F2EEE6',    // основной (тёплый белый)
  textDim: '#A9A296',    // второстепенный
  muted:   '#6E6A5D',    // подсказки, плейсхолдеры

  // Акценты
  indigo:       '#9A78AA',               // слива — второй акцент, структура
  indigoLight:  '#C9A9D6',
  indigoGlow:   'rgba(154,120,170,0.3)',

  orange:       '#C9A876',               // золото — главный акцент, CTA
  orangeLight:  '#E0BE86',
  orangeGlow:   'rgba(201,168,118,0.35)',

  amber:        '#DB8A42',               // тёплый оранжевый — бейджи, уведомления (отдельно от золота, чтобы не сливались)
  amberLight:   '#E8A468',
  amberGlow:    'rgba(219,138,66,0.3)',

  green:        '#7A9E85',               // приглушённый зелёный — успех
  greenLight:   '#9CC5A8',
  greenGlow:    'rgba(122,158,133,0.3)',

  // Статусы
  red:          '#D9776B',               // тёплый коралловый — ошибки, отмена
  redLight:     '#E89388',
  redGlow:      'rgba(217,119,107,0.35)',

  warning:      '#DB8A42',               // тот же тёплый оранжевый, что amber — тревога, не «офисный» жёлтый
  warningLight: '#E8A468',

  // Устаревшие алиасы (для обратной совместимости)
  olive:        '#7A9E85',
  oliveLight:   '#9CC5A8',
  oliveGlow:    'rgba(122,158,133,0.3)',
  blue:         '#9A78AA',
  blueLight:    '#C9A9D6',
  blueGlow:     'rgba(154,120,170,0.3)',
  purple:       '#9A78AA',
  purpleLight:  '#C9A9D6',
  purpleGlow:   'rgba(154,120,170,0.3)',

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

// ─── АНИМАЦИЯ — единый стандарт появления контента ──────────────────────────
// Используется на всех экранах для входного fade+slide, чтобы переходы
// ощущались одинаково спокойно и плавно по всему приложению.
export const anim = {
  fadeDuration: 450,        // длительность затухания (мс)
  slideFrom: 24,             // стартовое смещение по Y для slide-эффекта
  spring: { tension: 50, friction: 14 }, // мягкая пружина для slide/width-анимаций
};

// ─── ТИПОГРАФИКА ─────────────────────────────────────────────────────────────
// family/familySemibold/familyRegular — те же имена, что использовались
// раньше (724 места по всему приложению, в основном обычный текст 12-17px:
// подписи, поля ввода, названия). Держим их на Manrope — читаемом, округлом,
// дружелюбном — как и было по смыслу, просто вместо AnekDevanagari.
// Unbounded (геометричный, уверенный) — новый отдельный ключ display/
// displaySemibold, для сознательного использования только в редких местах:
// крупная сумма, приветствие, главный заголовок экрана — не массово.
export const fonts = {
  family:         'Manrope_800ExtraBold',
  familySemibold: 'Manrope_600SemiBold',
  familyRegular:  'Manrope_400Regular',
  familyMedium:   'Manrope_500Medium',
  familyBold:     'Manrope_700Bold',

  display:         'Unbounded_700Bold',
  displaySemibold: 'Unbounded_600SemiBold',
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

  // Настоящая металлическая (золотая) поверхность — для самых важных
  // элементов экрана (карточка баланса, главная сумма). Диагональный блик
  // даёт ощущение объёма, не плоскую заливку.
  metalGold: ['#E6C68F', '#C9A876', '#9A7748', '#B4914F', '#E0BE86'],
  metalGoldLocations: [0, 0.22, 0.55, 0.78, 1],
  metalGoldAngle: 115, // градусы, для LinearGradient start/end

  // Атмосферные радиальные подсветки фона — тёплая (золото) сверху слева,
  // холодная (слива) сверху справа. Используются как декоративный слой за
  // основным контентом экрана, не как фон самих карточек.
  atmosphereGold: 'rgba(201,168,118,0.18)',
  atmospherePlum: 'rgba(90,60,120,0.14)',
};
