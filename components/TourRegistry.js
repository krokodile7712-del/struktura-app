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

// Для подсвечиваемого участка экрана. Возвращает готовый набор стилей:
// когда именно этот участок активен — яркая рамка; когда активен другой
// участок (тур идёт, но не по этому месту) — лёгкое притухание; когда тур
// не идёт вообще — ничего не меняется.
//
// Использование:
//   const highlight = useTourHighlight('kassa.clientRow');
//   <View style={[styles.v2Client, highlight.style]}>...</View>
export function useTourHighlight(key) {
  const { activeKey } = useContext(TourActiveContext);
  const isActive = !!key && activeKey === key;
  // Не притухаем, если активен сам этот элемент, ИЛИ активен один из его
  // "потомков" по иерархии ключа (например, 'kassa.cart.client' — потомок
  // 'kassa.cart') — иначе родитель притух бы вместе с собой и накрыл своей
  // прозрачностью то, что внутри него как раз должно оставаться ярким.
  const isDimmed = !!activeKey && activeKey !== key && !activeKey.startsWith(key + '.');
  return {
    isActive,
    isDimmed,
    style: isActive
      ? { borderWidth: 2, borderColor: colors.orange, borderRadius: 12, opacity: 1 }
      : isDimmed
        ? { opacity: 0.25 }
        : null,
  };
}
