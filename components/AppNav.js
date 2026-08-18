import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '../hooks/useResponsive';
import { colors, fonts } from '../constants/theme';
import { getSession } from '../db/session';
import { getBusinessProfile } from '../db/queries';
import Drawer from './Drawer';

// Этап 1-2 разворота на адаптивность: единая навигация на 5 пунктов,
// сама решает расположение (снизу/сбоку) и сама переходит на нужный экран —
// можно вставлять в любой экран тем же способом, что и TopBar (activeScreen),
// без дополнительной настройки состояния в каждом конкретном экране.
//
// В альбомной ориентации (боковое расположение) панель ведёт себя как
// раньше вело себя планшетное меню: широкая с подписями на самом Обзоре,
// сжимается до одних иконок внутри любого другого раздела — по образу
// прогрессивного раскрытия, а не занимает место постоянно.
export default function AppNav({ navigation, activeScreen }) {
  const { navPosition } = useResponsive();
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isAdmin = getSession()?.role === 'admin';
  const isBottom = navPosition === 'bottom';
  const home = isAdmin ? 'Admin' : 'Dashboard';
  const isHome = activeScreen === home;
  const expanded = !isBottom && isHome;

  const modules = getBusinessProfile()?.modules || {};

  const ITEMS = [
    { key: home,          route: home,          label: 'Обзор',    icon: '🏠' },
    { key: 'Sales',       route: 'Sales',        label: 'Продажи',  icon: '🧾' },
    { key: 'Products',    route: 'Products',     label: 'Товары',   icon: '🛍' },
    { key: 'Kassa',       route: 'Kassa',        label: 'Касса',    icon: '🛒', primary: true },
    { key: 'ClientsList', route: 'ClientsList',  label: 'Клиенты',  icon: '👥', module: 'clients' },
    { key: 'more',        route: null,           label: 'Ещё',      icon: '⋯' },
  ].filter(item => !item.module || modules[item.module] !== false);

  const handlePress = (item) => {
    if (item.key === 'more') { setDrawerOpen(true); return; }
    if (item.key === activeScreen) return; // уже здесь
    navigation.navigate(item.route);
  };

  return (
    <>
      <View
        style={[
          styles.nav,
          isBottom
            ? { flexDirection: 'row', paddingBottom: Math.max(insets.bottom, 8), borderTopWidth: 1 }
            : { flexDirection: 'column', paddingTop: insets.top + 8, width: expanded ? 200 : 76, borderRightWidth: 1 },
        ]}
      >
        {ITEMS.map(item => {
          const isActive = activeScreen === item.key;
          if (!isBottom && expanded && !item.primary) {
            // Широкий вид — иконка и подпись в ряд, как раньше на планшете
            return (
              <Pressable
                key={item.key}
                style={[styles.itemWide, isActive && styles.itemWideActive]}
                onPress={() => handlePress(item)}
              >
                <Text style={styles.iconWide}>{item.icon}</Text>
                <Text style={[styles.labelWide, isActive && styles.labelActive]} numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
            );
          }
          return (
            <Pressable
              key={item.key}
              style={[
                styles.item,
                isBottom ? styles.itemBottom : styles.itemSide,
                item.primary && styles.itemPrimary,
              ]}
              onPress={() => handlePress(item)}
            >
              <Text style={[styles.icon, item.primary && styles.iconPrimary]}>{item.icon}</Text>
              <Text style={[styles.label, isActive && styles.labelActive, item.primary && styles.labelPrimary]}>
                {item.label}
              </Text>
              {isActive && !item.primary && <View style={isBottom ? styles.activeDotBottom : styles.activeDotSide} />}
            </Pressable>
          );
        })}
      </View>

      <Drawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        navigation={navigation}
        activeScreen={home}
      />
    </>
  );
}

const styles = StyleSheet.create({
  nav: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBottom: {
    flex: 1,
    paddingVertical: 8,
    gap: 2,
  },
  itemSide: {
    paddingVertical: 14,
    marginTop: 4,
    gap: 4,
  },
  itemPrimary: {
    marginTop: -14,
  },
  itemWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 13,
    marginTop: 4,
  },
  itemWideActive: {
    backgroundColor: 'rgba(240,160,80,0.08)',
  },
  iconWide: {
    fontSize: 20,
    width: 24,
    textAlign: 'center',
  },
  labelWide: {
    fontFamily: fonts.familySemibold,
    fontSize: 14,
    color: colors.muted,
    flex: 1,
  },
  icon: {
    fontSize: 22,
  },
  iconPrimary: {
    fontSize: 26,
    width: 52,
    height: 52,
    lineHeight: 52,
    textAlign: 'center',
    backgroundColor: colors.orange,
    borderRadius: 26,
    overflow: 'hidden',
  },
  label: {
    fontFamily: fonts.familySemibold,
    fontSize: 10,
    color: colors.muted,
  },
  labelActive: {
    color: colors.orange,
  },
  labelPrimary: {
    color: colors.orange,
    marginTop: 2,
  },
  activeDotBottom: {
    position: 'absolute',
    top: 2,
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: colors.orange,
  },
  activeDotSide: {
    position: 'absolute',
    left: 2,
    top: '30%', bottom: '30%',
    width: 3, borderRadius: 2,
    backgroundColor: colors.orange,
  },
});
