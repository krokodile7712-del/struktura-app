import { useState, useRef, useEffect, useCallback } from 'react';
import { Animated } from 'react-native';

// «Стыковка» при прокрутке: пока верхний элемент (кнопка «Новый заказ» в строке
// приветствия) виден — docked = false; когда он уехал вверх за пределы экрана —
// docked = true, и копия кнопки плавно проявляется в верхней полосе. Гистерезис
// (порог входа выше порога выхода) не даёт копии мигать у границы.
export function useDock(threshold = 90) {
  const [docked, setDocked] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: docked ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [docked, anim]);

  const onScroll = useCallback((e) => {
    const y = e.nativeEvent.contentOffset.y;
    setDocked(prev => (prev ? y > threshold - 24 : y > threshold));
  }, [threshold]);

  return { docked, anim, onScroll };
}
