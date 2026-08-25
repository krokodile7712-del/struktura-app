import React, { createContext, useContext, useRef, useCallback, useState } from 'react';

// Общий реестр реальных экранных координат элементов, подсвечиваемых в
// интерактивном туре (TourGuide). Ключевая идея — не измерять элемент
// снаружи по таймеру (угадывая, устоялась ли уже разметка), а заставить
// сам элемент сообщать о себе через onLayout, который React вызывает
// именно тогда, когда его раскладка действительно завершена — в том
// числе повторно, если она позже сдвинется (например, из-за данных,
// подгрузившихся чуть позже).
//
// Использование на подсвечиваемом элементе:
//   const client = useTourTarget('kassa.client');
//   <View ref={client.ref} onLayout={client.onLayout}>...</View>
//
// Использование в самом TourGuide — см. useTourRect(key).

const TourRegistryContext = createContext(null);

export function TourRegistryProvider({ children }) {
  const [registry, setRegistry] = useState({});

  const report = useCallback((key, rect) => {
    setRegistry(prev => {
      const old = prev[key];
      if (old && old.x === rect.x && old.y === rect.y && old.width === rect.width && old.height === rect.height) {
        return prev; // ничего не изменилось — не гоняем лишние перерисовки
      }
      return { ...prev, [key]: rect };
    });
  }, []);

  return (
    <TourRegistryContext.Provider value={{ registry, report }}>
      {children}
    </TourRegistryContext.Provider>
  );
}

// Вешается на подсвечиваемый элемент: даёт ref (для measureInWindow) и
// onLayout (чтобы React сам сообщил, когда пересчитывать координаты).
export function useTourTarget(key) {
  const ctx = useContext(TourRegistryContext);
  const ref = useRef(null);

  const onLayout = useCallback(() => {
    // requestAnimationFrame — небольшая, но надёжная пауза, чтобы нативный
    // слой точно успел отрисоваться перед измерением координат в окне.
    requestAnimationFrame(() => {
      ref.current?.measureInWindow?.((x, y, width, height) => {
        if (width > 0 && height > 0 && ctx) {
          ctx.report(key, { x, y, width, height });
        }
      });
    });
  }, [key, ctx]);

  return { ref, onLayout };
}

// Читает актуальные координаты элемента по ключу — реактивно обновляется
// сам, если элемент позже сообщит о себе снова (сдвинулся/появился).
export function useTourRect(key) {
  const ctx = useContext(TourRegistryContext);
  return (key && ctx?.registry[key]) || null;
}
