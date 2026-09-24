import React, { createContext, useContext, useState } from 'react';
import { View } from 'react-native';
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
    // Рамка подсветки больше НЕ здесь — borderWidth на самом элементе
    // физически увеличивает его размер в React Native (не как на вебе,
    // box-sizing тут так не работает), из-за чего сосед сдвигался на
    // 2-4px при каждой смене активного шага (особенно заметно, когда
    // подряд подсвечивается несколько элементов в одном списке). Рамка
    // теперь в overlay ниже — абсолютный слой, не участвует в раскладке.
    style: null,
    // Родителю нужен position:'relative' (или он и так borderRadius/overflow —
    // почти у всех карточек уже есть), чтобы этот абсолютный слой лёг
    // ровно поверх, а не поверх всего экрана. Вставлять последним ребёнком.
    overlay: isActive ? (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          borderTopWidth: 2,
          borderRightWidth: 2,
          borderBottomWidth: 2,
          borderLeftWidth: 2,
          borderTopColor: colors.orange,
          borderRightColor: colors.orange,
          borderBottomColor: colors.orange,
          borderLeftColor: colors.orange,
          borderRadius: radius,
          zIndex: 10,
        }}
      />
    ) : isDimmed ? (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(6,6,8,0.78)',
          borderRadius: radius,
        }}
      />
    ) : null,
  };
}
