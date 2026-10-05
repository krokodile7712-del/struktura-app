import React from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, withOpacity } from '../constants/theme';
import LockIcon from './LockIcon';
import { getSession, clearSession } from '../db/session';
import { resetKassaCart } from '../db/cartStore';
import { useNextStepsProgress } from './NextStepsCard';
import { useTourAnyActive } from './TourRegistry';

export default function TopBar({ title, onBack, rightElement, syncPending, navigation, activeScreen }) {
  const insets = useSafeAreaInsets();
  const isAdmin = getSession()?.role === 'admin';
  const { doneCount, total: stepsTotal, visible: stepsVisible } = useNextStepsProgress();
  const showBanner = isAdmin && stepsVisible && navigation;
  const tourActive = useTourAnyActive();

  const lockApp = () => {
    Alert.alert(
      'Заблокировать приложение?',
      'Текущий сеанс завершится — для входа снова понадобится PIN.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Заблокировать', style: 'destructive', onPress: () => {
          resetKassaCart();
          clearSession();
          navigation?.reset ? navigation.reset({ index: 0, routes: [{ name: 'Login' }] }) : navigation?.navigate('Login');
        } },
      ]
    );
  };

  return (
    <>
      <View style={[styles.bar, { paddingTop: insets.top, height: 52 + insets.top }, tourActive && { opacity: 0.25 }]}>
        <View style={styles.side}>
          {onBack && (
            <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12} accessibilityLabel="Назад" accessibilityRole="button">
              <Text style={styles.backArrow}>‹</Text>
              <Text style={styles.backLabel}>Назад</Text>
            </Pressable>
          )}
        </View>

        {navigation ? (
          <Pressable
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
            onPress={() => {
              const home = getSession()?.role === 'admin' ? 'Admin' : 'Dashboard';
              if (activeScreen !== home) navigation.navigate(home);
            }}
            hitSlop={8}
          >
            <Text style={styles.title} numberOfLines={1}>{title || ''}</Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={styles.title} numberOfLines={1}>{title || ''}</Text>
          </View>
        )}

        <View style={[styles.side, { alignItems: 'flex-end', gap: 10 }]}>
          {syncPending > 0
            ? <Text style={styles.syncBadge}>↑{syncPending}</Text>
            : null}
          {rightElement || null}
          <Pressable onPress={lockApp} style={styles.lockBtn} hitSlop={8} accessibilityLabel="Заблокировать" accessibilityRole="button">
            <LockIcon size={20} color={colors.textDim} />
          </Pressable>
        </View>
      </View>

      {showBanner && (
        <Pressable style={styles.stepsBanner} onPress={() => navigation.navigate('Admin')}>
          <Text style={styles.stepsBannerTxt}>Настройка не завершена · выполнено {doneCount} из {stepsTotal}</Text>
          <Text style={styles.stepsBannerArrow}>→</Text>
        </Pressable>
      )}

    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 8,
  },
  side: {
    width: 128,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 2,
  },
  menuBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  lockBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIcon: {
    fontSize: 24,
  },
  menuIcon: {
    fontSize: 20,
    color: colors.orangeLight,
    fontFamily: fonts.family,
  },
  backArrow: {
    fontSize: 28,
    color: colors.orangeLight,
    lineHeight: 32,
    fontFamily: fonts.family,
  },
  backLabel: {
    fontFamily: fonts.familySemibold,
    fontSize: 16,
    color: colors.orangeLight,
  },
  title: {
    fontFamily: fonts.familySemibold,
    fontSize: 14,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
  syncBadge: {
    fontFamily: fonts.familySemibold,
    fontSize: 12,
    color: 'rgba(120,183,150,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(120,183,150,0.3)',
    backgroundColor: 'rgba(120,183,150,0.08)',
  },
  stepsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: withOpacity(colors.warning, 0.07),
    borderBottomWidth: 1,
    borderBottomColor: withOpacity(colors.warning, 0.16),
  },
  stepsBannerTxt: {
    fontFamily: fonts.familySemibold,
    fontSize: 14,
    color: colors.warning,
  },
  stepsBannerArrow: {
    fontFamily: fonts.familySemibold,
    fontSize: 14,
    color: colors.warning,
  },
});
