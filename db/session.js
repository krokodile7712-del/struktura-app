// Глобальная переменная — переживает HMR перезагрузку в Expo Go
// (module-level переменные сбрасываются при hot reload, global — нет)
if (!global.__session) global.__session = null;

export const getSession   = () => global.__session;
export const setSession   = (user) => { global.__session = user; };
export const clearSession = () => { global.__session = null; };
export const isLoggedIn   = () => global.__session !== null;

// Домашний экран в зависимости от роли — используется всеми кнопками "назад"
export const getHomeRoute = () => (global.__session?.role === 'admin' ? 'Admin' : 'Dashboard');

// Права доступа текущего пользователя
if (!global.__permissions) global.__permissions = null;
export const getPermissions  = () => global.__permissions;
export const setPermissions  = (p) => { global.__permissions = p; };
export const clearPermissions = () => { global.__permissions = null; };

// Проверка конкретного права (admin всегда true)
export const can = (key) => {
  if (global.__session?.role === 'admin') return true;
  if (!global.__permissions) return true; // fallback — разрешаем
  return global.__permissions[key] !== false;
};

// Текущая выбранная локация (null = модуль локаций выключен или не выбрана)
// Сбрасывается при закрытии приложения (in-memory в global)
if (!global.__currentLocationId) global.__currentLocationId = null;

export const getCurrentLocationId = () => global.__currentLocationId;
export const setCurrentLocationId = (id) => { global.__currentLocationId = id; };
export const clearCurrentLocation = () => { global.__currentLocationId = null; };
