// Простое хранилище сессии — живёт пока приложение открыто
let currentUser = null;

export const getSession = () => currentUser;
export const setSession = (user) => { currentUser = user; };
export const clearSession = () => { currentUser = null; };
export const isLoggedIn = () => currentUser !== null;
