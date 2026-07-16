// Группы совместимых единиц — конвертация возможна только внутри одной группы.
// Единицы из разных групп (напр. шт и г) несовместимы и не могут заменять друг друга в техкарте.
const UNIT_GROUPS = {
  mass:   ['мкг', 'мг', 'г', 'кг', 'т'],
  volume: ['мкл', 'мл', 'л'],
  length: ['мм', 'см', 'дм', 'м'],
  count:  ['шт', 'пара', 'уп', 'рул', 'пач'],
  time:   ['сек', 'мин', 'ч', 'сеанс'],
  area:   ['см²', 'м²'],
};

// Количество единиц относительно "базовой" в своей группе (г, мл, мм, шт, сек, см²)
const UNIT_TO_BASE = {
  // масса (база: г)
  'мкг': 0.000001, 'мг': 0.001, 'г': 1, 'кг': 1000, 'т': 1000000,
  // объём (база: мл)
  'мкл': 0.001, 'мл': 1, 'л': 1000,
  // длина (база: мм)
  'мм': 1, 'см': 10, 'дм': 100, 'м': 1000,
  // штуки — у них нет осмысленного авто-пересчёта внутри группы, оставляем factor=1
  'шт': 1, 'пара': 1, 'уп': 1, 'рул': 1, 'пач': 1,
  // время (база: сек)
  'сек': 1, 'мин': 60, 'ч': 3600, 'сеанс': 1,
  // площадь (база: см²)
  'см²': 1, 'м²': 10000,
};

// Возвращает имя группы для единицы, или null если единица неизвестна
export function getUnitGroup(unit) {
  for (const [group, units] of Object.entries(UNIT_GROUPS)) {
    if (units.includes(unit)) return group;
  }
  return null;
}

// Можно ли конвертировать fromUnit → toUnit (обе из одной известной группы)
export function canConvert(fromUnit, toUnit) {
  if (!fromUnit || !toUnit) return false;
  if (fromUnit === toUnit) return true;
  const g1 = getUnitGroup(fromUnit);
  const g2 = getUnitGroup(toUnit);
  // Группа count (шт/пара/уп) — несовместима внутри себя (нет смысла конвертировать шт в пары)
  if (g1 === 'count' && g2 === 'count') return false;
  return g1 !== null && g2 !== null && g1 === g2;
}

// Коэффициент пересчёта: сколько toUnit содержится в одном fromUnit
// Пример: conversionFactor('г', 'кг') = 0.001  (1 г = 0.001 кг)
// Пример: conversionFactor('кг', 'г') = 1000   (1 кг = 1000 г)
// Возвращает null если пересчёт невозможен или единицы неизвестны
export function conversionFactor(fromUnit, toUnit) {
  if (fromUnit === toUnit) return 1;
  const f = UNIT_TO_BASE[fromUnit];
  const t = UNIT_TO_BASE[toUnit];
  if (f == null || t == null) return null;
  return f / t;
}
