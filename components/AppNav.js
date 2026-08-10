import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '../hooks/useResponsive';
import { colors, fonts } from '../constants/theme';
import { getSession } from '../db/session';
import Drawer from './Drawer';

// Этап 1 разворота на адаптивность: один и тот же набор из 5 пунктов
// (Обзор/Продажи/Касса/Клиенты/Ещё), меняет расположение сам —
// снизу в портретной ориентации, сбоку в альбомной. "Ещё" открывает
// уже существующую шторку (боковое меню), а не строит новую сущность.
export default function AppNav({ navigation, active, onSelect }) {
  const { navPosition } = useResponsive();
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isAdmin = getSession()?.role === 'admin';
  const isBottom = navPosition === 'bottom';

  const ITEMS = [
    { key: 'dash',        label: 'Обзор',    icon: '🏠' },
    { key: 'Sales',       label: 'Продажи',  icon: '🧾' },
    { key: 'Kassa',       label: 'Касса',    icon: '🛒', primary: true },
    { key: 'ClientsList', label: 'Клиенты',  icon: '👥' },
    { key: 'more',        label: 'Ещё',      icon: '⋯' },
  ];

  const handlePress = (key) => {
    if (key === 'more') { setDrawerOpen(true); return; }
    if (key === 'Kassa') { navigation.navigate('Kassa'); return; }
    onSelect?.(key);
  };

  return (
    <>
      <View
        style={[
          styles.nav,
          isBottom
            ? { flexDirection: 'row', paddingBottom: Math.max(insets.bottom, 8), borderTopWidth: 1 }
            : { flexDirection: 'column', paddingTop: insets.top + 8, width: 76, borderRightWidth: 1 },
        ]}
      >
        {ITEMS.map(item => {
          const isActive = active === item.key;
          return (
            <Pressable
              key={item.key}
              style={[
                styles.item,
                isBottom ? styles.itemBottom : styles.itemSide,
                item.primary && styles.itemPrimary,
              ]}
              onPress={() => handlePress(item.key)}
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
        activeScreen={isAdmin ? 'Admin' : 'Dashboard'}
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
