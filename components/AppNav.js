import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '../hooks/useResponsive';
import { colors, fonts } from '../constants/theme';
import { getSession, can } from '../db/session';
import { getBusinessProfile, getTerms } from '../db/queries';
import Drawer from './Drawer';

// Полный список разделов для широкой панели (администратор).
const ADMIN_SECTIONS = [
  { key: 'Sales',       route: 'Sales',        label: 'Продажи' },
  { key: 'Products',    route: 'Products',     label: 'Товары' },
  { key: 'ClientsList', route: 'ClientsList',  label: 'Клиенты',  module: 'clients' },
  { key: 'Reports',     route: 'Reports',      label: 'Отчётность' },
  { key: 'Expenses',    route: 'Expenses',     label: 'Расходы' },
  { key: 'Bookings',    route: 'Bookings',     label: 'Записи',   bookingOnly: true },
  { key: 'Settings',    route: 'Settings',     label: 'Настройки' },
];

// Список для сотрудника — только то, на что есть права.
const STAFF_SECTIONS = [
  { key: 'Sales',       route: 'Sales',        label: 'Продажи',  perm: 'view_order_history' },
  { key: 'ClientsList', route: 'ClientsList',  label: 'Клиенты',  perm: 'view_clients' },
  { key: 'Expenses',    route: 'Expenses',     label: 'Расходы',  perm: 'add_expenses' },
  { key: 'Products',    route: 'Products',     label: 'Товары',   perm: 'view_stock', params: { initialTab: 'stock' } },
];

// Компактный список для нижней панели (портрет) — 5 пунктов, Касса по центру.
const BOTTOM_ITEMS = [
  { key: 'Sales',       route: 'Sales',        label: 'Продажи',  icon: '🧾' },
  { key: 'Products',    route: 'Products',     label: 'Товары',   icon: '🛍' },
  { key: 'Kassa',       route: 'Kassa',        label: 'Касса',    icon: '🛒', primary: true },
  { key: 'ClientsList', route: 'ClientsList',  label: 'Клиенты',  icon: '👥', module: 'clients' },
  { key: 'more',        route: null,           label: 'Ещё',      icon: '⋯' },
];

// Единая навигация приложения. В портрете — компактная панель снизу.
// В альбомной ориентации — на любом экране широкая боковая панель, по
// образцу прежнего планшетного меню (название бизнеса, кнопка быстрого
// заказа, полный список разделов) — не только на Обзоре.
export default function AppNav({ navigation, activeScreen }) {
  const { navPosition } = useResponsive();
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isAdmin = getSession()?.role === 'admin';
  const isBottom = navPosition === 'bottom';
  const home = isAdmin ? 'Admin' : 'Dashboard';
  const profile = getBusinessProfile();
  const modules = profile?.modules || {};
  const terms = getTerms();
  const bookingActive = !!(profile?.booking_slug);

  const handlePress = (item) => {
    if (item.key === 'more') { setDrawerOpen(true); return; }
    if (item.key === activeScreen) return; // уже здесь
    navigation.navigate(item.route);
  };

  // ── Широкая панель — только на Обзоре, в альбомной ориентации ──
  if (!isBottom && activeScreen === home) {
    const sections = (isAdmin ? ADMIN_SECTIONS : STAFF_SECTIONS)
      .filter(s => !s.module || modules[s.module] !== false)
      .filter(s => !s.perm || can(s.perm));

    return (
      <>
        <View style={[styles.wide, { paddingTop: insets.top }]}>
          <View style={styles.bizHeader}>
            <Text style={styles.bizName} numberOfLines={1}>{profile?.business_name || 'Мой бизнес'}</Text>
            {profile?.city ? <Text style={styles.bizCity}>{profile.city}</Text> : null}
          </View>

          <Pressable style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}
            onPress={() => navigation.navigate('Kassa')}>
            <Text style={styles.ctaLabel}>Новый {terms.order?.toLowerCase() || 'заказ'}</Text>
            <Text style={styles.ctaSub}>Открыть кассу</Text>
          </Pressable>

          <View style={styles.divider} />

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={[styles.menuItem, styles.menuItemActive]}>
              <View style={styles.activeBar} />
              <Text style={[styles.menuLabel, styles.menuLabelActive]}>Обзор</Text>
            </View>

            {sections.map(s => {
              if (s.bookingOnly && !bookingActive) {
                return (
                  <View key={s.key} style={styles.menuItemInactive}>
                    <Text style={styles.menuLabelInactive}>{s.label}</Text>
                    <Text style={styles.menuSub}>Не подключено</Text>
                  </View>
                );
              }
              return (
                <Pressable key={s.key}
                  style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: 'rgba(245,240,232,0.04)' }]}
                  onPress={() => navigation.navigate(s.route, s.params)}>
                  <Text style={styles.menuLabel}>{s.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <Drawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} navigation={navigation} activeScreen={home} />
      </>
    );
  }

  // ── Узкая свёрнутая панель — альбомная ориентация, любой раздел кроме
  // Обзора. Тот же список пунктов, что и в широкой панели, просто без
  // подписей — точки-заглушки вместо иконок, до отрисовки кастомных. ──
  if (!isBottom) {
    const sections = (isAdmin ? ADMIN_SECTIONS : STAFF_SECTIONS)
      .filter(s => !s.module || modules[s.module] !== false)
      .filter(s => !s.perm || can(s.perm));

    return (
      <>
        <View style={[styles.narrow, { paddingTop: insets.top + 8 }]}>
          <Pressable style={styles.narrowItem} onPress={() => navigation.navigate(home)}>
            <View style={styles.narrowDot} />
          </Pressable>

          {sections.map(s => {
            const isActive = activeScreen === s.key;
            const disabled = s.bookingOnly && !bookingActive;
            return (
              <Pressable key={s.key}
                style={styles.narrowItem}
                disabled={disabled}
                onPress={() => !isActive && navigation.navigate(s.route, s.params)}>
                <View style={[styles.narrowDot, isActive && styles.narrowDotActive, disabled && styles.narrowDotDisabled]} />
              </Pressable>
            );
          })}
        </View>

        <Drawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} navigation={navigation} activeScreen={home} />
      </>
    );
  }

  // ── Компактная панель снизу (портрет) ──
  const items = BOTTOM_ITEMS.filter(item => !item.module || modules[item.module] !== false);

  return (
    <>
      <View style={[styles.nav, { flexDirection: 'row', paddingBottom: Math.max(insets.bottom, 8), borderTopWidth: 1 }]}>
        {items.map(item => {
          const isActive = activeScreen === item.key;
          return (
            <Pressable
              key={item.key}
              style={[styles.item, styles.itemBottom, item.primary && styles.itemPrimary]}
              onPress={() => handlePress(item)}
            >
              <Text style={[styles.icon, item.primary && styles.iconPrimary]}>{item.icon}</Text>
              <Text style={[styles.label, isActive && styles.labelActive, item.primary && styles.labelPrimary]}>
                {item.label}
              </Text>
              {isActive && !item.primary && <View style={styles.activeDotBottom} />}
            </Pressable>
          );
        })}
      </View>

      <Drawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} navigation={navigation} activeScreen={home} />
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

  // ── Широкая панель ──
  wide:        { width: 220, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface },
  bizHeader:   { padding: 18, paddingBottom: 10 },
  bizName:     { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text },
  bizCity:     { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },

  ctaBtn:      { marginHorizontal: 12, marginBottom: 12, padding: 14, borderRadius: 12, backgroundColor: colors.orange, alignItems: 'center' },
  ctaLabel:    { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: '#fff', textTransform: 'capitalize' },
  ctaSub:      { fontFamily: fonts.familyRegular, fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 },

  divider:     { height: 1, backgroundColor: colors.border, marginHorizontal: 12, marginVertical: 4 },

  menuItem:        { paddingVertical: 12, paddingHorizontal: 16, position: 'relative' },
  menuItemActive:  { backgroundColor: 'rgba(245,240,232,0.06)' },
  menuItemInactive:{ paddingVertical: 12, paddingHorizontal: 16, opacity: 0.45 },
  activeBar:       { position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 3, borderRadius: 2, backgroundColor: colors.orange },
  menuLabel:       { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  menuLabelActive: { color: colors.text },
  menuLabelInactive:{ fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  menuSub:         { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, marginTop: 1 },

  // ── Узкая свёрнутая панель ──
  narrow:      { width: 72, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface, alignItems: 'center' },
  narrowItem:  { width: 72, height: 52, alignItems: 'center', justifyContent: 'center' },
  narrowDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.muted, opacity: 0.4 },
  narrowDotActive: { backgroundColor: colors.orange, opacity: 1, width: 10, height: 10, borderRadius: 5 },
  narrowDotDisabled: { opacity: 0.15 },
});
