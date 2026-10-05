import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Modal, AppState, StyleSheet } from 'react-native';
import LoginScreen from '../screens/LoginScreen';
import { getSession, setSession, setPermissions, isLoggedIn } from '../db/session';
import { getAutoLockMinutes, getUserPermissions } from '../db/queries';
import { colors } from '../constants/theme';

// Автоблокировка. Экран входа показывается ПОВЕРХ приложения (в отдельном окне
// Modal — оно перекрывает и другие открытые окна приложения), поэтому ничего
// из того, что было на экране, не теряется: незавершённая форма и корзина
// Кассы остаются на месте.
//   • простой: нет касаний дольше настроенного времени (Настройки → Безопасность,
//     по умолчанию 5 минут, можно выключить);
//   • уход из приложения: не меньше 1 минуты в фоне.
// После разблокировки:
//   • тот же сотрудник — возвращается на тот же экран, как был;
//   • другой сотрудник — открывается стартовый экран его роли (Обзор / главная).
const BACKGROUND_LOCK_MS = 60 * 1000;
const CHECK_EVERY_MS = 10 * 1000;
const AUTH_ROUTES = ['Login', 'Onboarding'];

export default function LockGuard({ navigationRef, children }) {
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const lockedUserId = useRef(null);
  const lastActivity = useRef(Date.now());
  const backgroundAt = useRef(null);

  const lockNow = useCallback(() => {
    if (lockedRef.current) return;
    if (!isLoggedIn()) return;
    let route = null;
    try { route = navigationRef?.isReady?.() ? navigationRef.getCurrentRoute()?.name : null; } catch (_) {}
    if (!route || AUTH_ROUTES.includes(route)) return;
    lockedUserId.current = getSession()?.id ?? null;
    lockedRef.current = true;
    setLocked(true);
  }, [navigationRef]);

  // Простой — проверяем по таймеру
  useEffect(() => {
    const id = setInterval(() => {
      const minutes = getAutoLockMinutes();
      if (minutes > 0 && Date.now() - lastActivity.current >= minutes * 60 * 1000) lockNow();
    }, CHECK_EVERY_MS);
    return () => clearInterval(id);
  }, [lockNow]);

  // Уход в фон и возврат
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        if (backgroundAt.current == null) backgroundAt.current = Date.now();
      } else if (state === 'active') {
        const away = backgroundAt.current != null ? Date.now() - backgroundAt.current : 0;
        backgroundAt.current = null;
        const minutes = getAutoLockMinutes();
        if (minutes <= 0) return;
        const idle = Date.now() - lastActivity.current;
        if (away >= BACKGROUND_LOCK_MS || idle >= minutes * 60 * 1000) lockNow();
      }
    });
    return () => sub.remove();
  }, [lockNow]);

  const markActivity = () => { lastActivity.current = Date.now(); };

  const handleUnlocked = (user) => {
    const sameUser = user.id === lockedUserId.current;
    lockedRef.current = false;
    lockedUserId.current = null;
    lastActivity.current = Date.now();
    setSession(user);
    setPermissions(user.role === 'admin' ? null : getUserPermissions(user.id));
    setLocked(false);
    if (!sameUser) {
      // Вошёл другой человек — стартовый экран его роли, а не чужой экран
      try {
        navigationRef.reset({ index: 0, routes: [{ name: user.role === 'admin' ? 'Admin' : 'Dashboard' }] });
      } catch (e) { console.error('[Автоблокировка] не удалось открыть стартовый экран:', e); }
    }
  };

  return (
    <View style={{ flex: 1 }} onTouchStartCapture={markActivity}>
      {children}
      {/* Modal — чтобы закрыть собой и открытые окна приложения; кнопка «назад» окно не закрывает */}
      <Modal visible={locked} animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
        <View style={styles.fill}>
          <LoginScreen embedded onUnlocked={handleUnlocked} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
});
