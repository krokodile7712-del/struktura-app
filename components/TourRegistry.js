import React, { createContext, useContext, useState } from 'react';
import { colors } from '../constants/theme';

// Раньше здесь был реестр экранных координат (измерение снаружи через
// measureInWindow) — оказалось ненадёжным в сложных случаях (вложенные
// анимированные родители, flex gap). Новый, гораздо более простой и
// надёжный принцип: TourGuide просто транслирует, какой ШАГ сейчас
// активен (строковый ключ) — а каждый подсвечиваемый участок экрана сам
// решает, ярче ли ему быть (это я, рисую вокруг себя рамку) или притухнуть
// (это не я, значит я — фон). Никаких координат вообще не нужно.

const TourActiveContext = createContext({ activeKey: null, setActiveKey: () => {} });

export function TourRegistryProvider({ children }) {
  const [activeKey, setActiveKey] = useState(null);
  return (
    <TourActiveContext.Provider value={{ activeKey, setActiveKey }}>
      {children}
    </TourActiveContext.Provider>
  );
}

// Для самого TourGuide — сообщает наружу, какой шаг сейчас показан.
export function useTourActiveSetter() {
  return useContext(TourActiveContext).setActiveKey;
}

// true, если тур сейчас идёт вообще (любой шаг) — для элементов вроде
// шапки и панели навигации, которые сами никогда не бывают целью тура,
// но должны притухать вместе с остальным фоном, пока тур идёт.
export function useTourAnyActive() {
  const { activeKey } = useContext(TourActiveContext);
  return !!activeKey;
}

// Сам активный ключ строкой (или null) — для экранов с прокруткой,
// которым нужно самостоятельно скроллить к активному шагу тура (карточка
// тура закреплена внизу экрана и может закрывать собой то, что не
// прокручено в видимую область).
export function useTourActiveKey() {
  const { activeKey } = useContext(TourActiveContext);
  return activeKey;
}

// Для подсвечиваемого участка экрана. Возвращает готовый набор стилей:
// когда именно этот участок активен — яркая рамка со свечением; когда
// активен другой участок (тур идёт, но не по этому месту) — лёгкое
// притухание; когда тур не идёт вообще — ничего не меняется.
//
// Проверка родства — в ОБЕ стороны по иерархии ключа:
//  - я потомок активного (например, я 'kassa.cart.client', активен
//    'kassa.cart') — не тушусь, я внутри подсвеченного родителя;
//  - я родитель активного (например, я 'kassa.cart', активен
//    'kassa.cart.client') — тоже не тушусь, иначе моя прозрачность
//    накрыла бы собой и потомка, который как раз должен быть ярким.
//
// Использование:
//   const highlight = useTourHighlight('kassa.clientRow');
//   <View style={[styles.v2Client, highlight.style]}>...</View>
export function useTourHighlight(key, radius = 12) {
  const { activeKey } = useContext(TourActiveContext);
  const isActive = !!key && activeKey === key;
  const isRelated = !!activeKey && !!key && (
    activeKey === key ||
    key.startsWith(activeKey + '.') ||
    activeKey.startsWith(key + '.')
  );
  const isDimmed = !!activeKey && !isRelated;
  return {
    isActive,
    isDimmed,
    style: isActive
      ? {
          // Переопределяем ВСЕ четыре стороны явно, не общим borderWidth —
          // если у базового стиля элемента уже есть направленный бордер
          // (borderRightWidth/borderLeftWidth, обычная серая линия-разделитель
          // между колонками), он побеждает общий borderWidth на своей стороне
          // независимо от порядка в массиве стилей. Именно из-за этого не
          // подсвечивалась ровно та грань, где заранее был свой бордер.
          borderTopWidth: 2,
          borderRightWidth: 2,
          borderBottomWidth: 2,
          borderLeftWidth: 2,
          borderTopColor: colors.orange,
          borderRightColor: colors.orange,
          borderBottomColor: colors.orange,
          borderLeftColor: colors.orange,
          borderRadius: radius,
          opacity: 1,
          // Активный элемент должен побеждать соседей за общую границу —
          // без этого сосед (стоящий позже в разметке) перекрывает именно
          // ту грань рамки, что касается его самого. Только zIndex, без
          // elevation — elevation на Android сама по себе рисует тень,
          // это и было причиной непонятного пятна вокруг рамки раньше.
          zIndex: 10,
        }
      : isDimmed
        ? { opacity: 0.15 }
        : null,
  };
}
