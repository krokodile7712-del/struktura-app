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
if (!global.__userPermissions) global.__userPermissions = {}; // права всех пользователей по id
export const getPermissions  = () => global.__permissions;
export const setPermissions  = (p) => { global.__permissions = p; };
export const clearPermissions = () => { global.__permissions = null; };

// Сохраняем права конкретного пользователя (вызывается из настроек)
export const setUserPermissions = (userId, p) => {
  global.__userPermissions[userId] = p;
  // Если этот пользователь сейчас залогинен — обновляем и его активные права
  if (global.__session?.id === userId) global.__permissions = p;
};
export const getUserPermissionsById = (userId) => global.__userPermissions[userId] || null;

// Проверка конкретного права (admin всегда true)
export const can = (key) => {
  if (global.__session?.role === 'admin') return true;
  const userId = global.__session?.id;
  // Сначала проверяем актуальные права из памяти для текущего пользователя
  const perms = userId && global.__userPermissions[userId]
    ? global.__userPermissions[userId]
    : global.__permissions;
  if (!perms) return true; // fallback
  return perms[key] !== false;
};

// Текущая выбранная локация (null = модуль локаций выключен или не выбрана)
// Сбрасывается при закрытии приложения (in-memory в global)
if (!global.__currentLocationId) global.__currentLocationId = null;

export const getCurrentLocationId = () => global.__currentLocationId;
export const setCurrentLocationId = (id) => { global.__currentLocationId = id; };
export const clearCurrentLocation = () => { global.__currentLocationId = null; };
