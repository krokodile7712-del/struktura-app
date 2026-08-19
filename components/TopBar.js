import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../constants/theme';
import { getSession } from '../db/session';
import { useNextStepsProgress } from './NextStepsCard';
import Drawer from './Drawer';

export default function TopBar({ title, onBack, rightElement, syncPending, navigation, activeScreen }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const isAdmin = getSession()?.role === 'admin';
  const { doneCount, visible: stepsVisible } = useNextStepsProgress();
  const showBanner = isAdmin && stepsVisible && navigation;

  return (
    <>
      <View style={[styles.bar, { paddingTop: insets.top, height: 52 + insets.top }]}>
        <View style={styles.side}>
          {onBack ? (
            <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12} accessibilityLabel="Назад" accessibilityRole="button">
              <Text style={styles.backArrow}>‹</Text>
              <Text style={styles.backLabel}>Назад</Text>
            </Pressable>
          ) : navigation ? (
            <Pressable onPress={() => setDrawerOpen(true)} style={styles.menuBtn} hitSlop={12} accessibilityLabel="Открыть меню" accessibilityRole="button">
              <Text style={styles.menuIcon}>☰</Text>
            </Pressable>
          ) : null}
        </View>

        {navigation ? (
          <Pressable
            style={{ flex: 1 }}
            onPress={() => {
              const home = getSession()?.role === 'admin' ? 'Admin' : 'Dashboard';
              if (activeScreen !== home) navigation.navigate(home);
            }}
            hitSlop={8}
          >
            <Text style={styles.title} numberOfLines={1}>{title || ''}</Text>
          </Pressable>
        ) : (
          <Text style={styles.title} numberOfLines={1}>{title || ''}</Text>
        )}

        <View style={[styles.side, { alignItems: 'flex-end' }]}>
          {syncPending > 0
            ? <Text style={styles.syncBadge}>↑{syncPending}</Text>
            : null}
          {rightElement || null}
        </View>
      </View>

      {showBanner && (
        <Pressable style={styles.stepsBanner} onPress={() => navigation.navigate('Admin')}>
          <Text style={styles.stepsBannerTxt}>Настройка не завершена · выполнено {doneCount} из 6</Text>
          <Text style={styles.stepsBannerArrow}>→</Text>
        </Pressable>
      )}

      {navigation && (
        <Drawer
          visible={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          navigation={navigation}
          activeScreen={activeScreen}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHi,
    paddingHorizontal: 8,
  },
  side: {
    width: 110,
    alignItems: 'flex-start',
    justifyContent: 'center',
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
  menuIcon: {
    fontSize: 20,
    color: colors.greenLight,
    fontFamily: fonts.family,
  },
  backArrow: {
    fontSize: 26,
    color: colors.greenLight,
    lineHeight: 28,
    fontFamily: fonts.family,
  },
  backLabel: {
    fontFamily: fonts.familySemibold,
    fontSize: 14,
    color: colors.greenLight,
    letterSpacing: 0.5,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.familySemibold,
    fontSize: 11,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
  syncBadge: {
    fontFamily: fonts.familySemibold,
    fontSize: 11,
    color: 'rgba(122,158,82,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(122,158,82,0.3)',
    backgroundColor: 'rgba(122,158,82,0.08)',
  },
  stepsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    backgroundColor: 'rgba(240,160,80,0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,160,80,0.25)',
  },
  stepsBannerTxt: {
    fontFamily: fonts.familySemibold,
    fontSize: 12,
    color: colors.orange,
  },
  stepsBannerArrow: {
    fontFamily: fonts.familySemibold,
    fontSize: 13,
    color: colors.orange,
  },
});
