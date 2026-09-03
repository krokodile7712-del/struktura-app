// Простая система событий для мгновенной синхронизации между экранами.
// Проблема, которую это решает: если данные меняются на одном экране
// (например, товар в Товарах), а используются на другом (Касса) —
// обычный React state каждого экрана независим, и без специального
// механизма изменения подхватываются только при возврате на экран
// (useFocusEffect), а если экран остаётся в фоне и не переоткрывается —
// вообще никогда. Здесь — прямая, мгновенная нотификация без ожидания
// фокуса.
const listeners = {};

export function emit(eventName, payload) {
  (listeners[eventName] || []).forEach(fn => {
    try { fn(payload); } catch (e) { console.error(`[events] Ошибка обработчика ${eventName}:`, e); }
  });
}

export function subscribe(eventName, fn) {
  if (!listeners[eventName]) listeners[eventName] = [];
  listeners[eventName].push(fn);
  return () => {
    listeners[eventName] = (listeners[eventName] || []).filter(f => f !== fn);
  };
}
