import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';

// Загрузка данных экрана при заходе на него — не в момент перехода, а когда поток освободился.
// Все обращения к базе в приложении синхронные: пока идёт запрос, JS-поток стоит, и анимация
// перехода (а с ней нажатия) подвисает.
// requestIdleCallback вместо InteractionManager: тот объявлен устаревшим и будет удалён из React Native.
// timeout — даже если поток всё время занят, загрузка начнётся не позже чем через 400 мс.
// Если пользователь ушёл с экрана раньше, чем загрузка началась, она отменяется.
// deps — как у useCallback: при их смене загрузка выполнится снова.
const hasIdle = typeof requestIdleCallback === 'function' && typeof cancelIdleCallback === 'function';

export function useFocusLoad(load, deps) {
  useFocusEffect(useCallback(() => {
    const id = hasIdle ? requestIdleCallback(() => { load(); }, { timeout: 400 }) : setTimeout(() => { load(); }, 50);
    return () => { if (hasIdle) cancelIdleCallback(id); else clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps));
}
