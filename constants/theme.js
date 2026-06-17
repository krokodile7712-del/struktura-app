// ─── ПАЛИТРА "СТРУКТУРА" ───
export const colors = {
  bg: '#060608',
  surface: '#0e0f11',
  surface2: '#141618',
  surface3: '#1a1c20',
  border: '#252830',
  borderHi: '#363a42',
  borderLo: '#181a1e',
  text: '#ddd8d0',
  textDim: '#8a8d94',
  muted: '#4a4d54',

  olive: '#7a9e52',
  oliveLight: '#96bf64',
  oliveGlow: 'rgba(122,158,82,0.4)',

  blue: '#3d5fa8',
  blueLight: '#5278c8',
  blueGlow: 'rgba(61,95,168,0.4)',

  red: '#a01020',
  redLight: '#c42535',
  redGlow: 'rgba(160,16,32,0.45)',

  green: '#3d9e92',
  greenLight: '#4ec0b2',
  greenGlow: 'rgba(61,158,146,0.4)',

  purple: '#8a4eaa',
  purpleLight: '#a860cc',
  purpleGlow: 'rgba(138,78,170,0.4)',

  metalHi: 'rgba(255,255,255,0.13)',
  metalMid: 'rgba(255,255,255,0.06)',
  metalLo: 'rgba(0,0,0,0.75)',
};

// ─── РАЗМЕРЫ И ОТСТУПЫ ───
export const spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 20,
};

// ─── ТИПОГРАФИКА ───
export const fonts = {
  family: 'AnekDevanagari_700Bold',
  familyRegular: 'AnekDevanagari_400Regular',
  familySemibold: 'AnekDevanagari_600SemiBold',
};

// ─── ГРАДИЕНТЫ ДЛЯ МЕТАЛЛИЧЕСКИХ ПОВЕРХНОСТЕЙ ───
// Используются с expo-linear-gradient: <LinearGradient colors={gradients.metalBase} ... />
export const gradients = {
  // Базовая металлическая поверхность (кнопки, карточки)
  metalBase: ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.18)'],
  metalBaseLocations: [0, 0.35, 1],

  // Карточка
  cardSurface: ['rgba(255,255,255,0.055)', 'rgba(255,255,255,0.01)', 'rgba(0,0,0,0.12)'],
  cardSurfaceLocations: [0, 0.4, 1],

  // Цветные подсветки кнопок (накладываются вторым слоем)
  oliveGlow: ['rgba(122,158,82,0.28)', 'rgba(122,158,82,0.08)', 'rgba(0,0,0,0.2)'],
  blueGlow: ['rgba(61,95,168,0.28)', 'rgba(61,95,168,0.1)', 'rgba(0,0,0,0.2)'],
  greenGlow: ['rgba(61,158,146,0.28)', 'rgba(61,158,146,0.1)', 'rgba(0,0,0,0.2)'],
  redGlow: ['rgba(160,16,32,0.32)', 'rgba(160,16,32,0.12)', 'rgba(0,0,0,0.2)'],
  purpleGlow: ['rgba(138,78,170,0.28)', 'rgba(138,78,170,0.1)', 'rgba(0,0,0,0.2)'],
  glowLocations: [0, 0.4, 1],

  // Фоновый "дышащий" градиент экрана (радиальные через несколько View)
  bgSpots: {
    olive: 'rgba(122,158,82,0.14)',
    blue: 'rgba(61,95,168,0.14)',
    green: 'rgba(61,158,146,0.12)',
    purple: 'rgba(138,78,170,0.07)',
  },
};

// ─── ТЕНИ (объём) ───
// React Native поддерживает только один shadow на View, поэтому "многослойность"
// достигается через elevation + вложенные View с разными тенями.
export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 14,
  },
  button: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  buttonPressed: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  glow: (glowColor) => ({
    shadowColor: glowColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 10,
  }),
};
