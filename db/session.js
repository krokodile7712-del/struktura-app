// Глобальная переменная — переживает HMR перезагрузку в Expo Go
// (module-level переменные сбрасываются при hot reload, global — нет)
if (!global.__session) global.__session = null;

export const getSession   = () => global.__session;
export const setSession   = (user) => { global.__session = user; };
export const clearSession = () => { global.__session = null; };
export const isLoggedIn   = () => global.__session !== null;

// Домашний экран в зависимости от роли — используется всеми кнопками "назад"
export const getHomeRoute = () => (global.__session?.role === 'admin' ? 'Admin' : 'Dashboard');
