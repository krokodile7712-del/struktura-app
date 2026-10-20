import { useCallback } from 'react';
import { InteractionManager } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

// Загрузка данных экрана при заходе на него — ПОСЛЕ окончания анимации перехода.
// Все обращения к базе в приложении синхронные: пока идёт запрос, JS-поток стоит, и анимация
// перехода (а с ней нажатия) подвисает. Раньше загрузка запускалась сразу в момент перехода.
// Если пользователь ушёл с экрана раньше, чем загрузка началась, она отменяется.
// deps — как у useCallback: при их смене загрузка выполнится снова.
export function useFocusLoad(load, deps) {
  useFocusEffect(useCallback(() => {
    const task = InteractionManager.runAfterInteractions(() => { load(); });
    return () => task.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps));
}
