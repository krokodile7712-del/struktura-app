import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Animated, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '../hooks/useResponsive';
import { StackActions } from '@react-navigation/native';
import { colors, fonts } from '../constants/theme';
import { getSession, can } from '../db/session';
import { getBusinessProfile, getTerms } from '../db/queries';
import Drawer from './Drawer';
import { useTourHighlight } from './TourRegistry';

// Полный список разделов для широкой панели (администратор).
const ADMIN_SECTIONS = [
  { key: 'Sales',       route: 'Sales',        label: 'Продажи' },
  { key: 'Products',    route: 'Products',     label: 'Управление товарами' },
  { key: 'ClientsList', route: 'ClientsList',  label: 'Клиенты',  module: 'clients' },
  { key: 'Reports',     route: 'Reports',      label: 'Отчётность' },
  { key: 'Expenses',    route: 'Expenses',     label: 'Расходы' },
  { key: 'Equipment',   route: 'Equipment',    label: 'Оборудование' },
  { key: 'Overheads',   route: 'Overheads',    label: 'Накладные расходы' },
  { key: 'Investments', route: 'Investments',  label: 'Инвестиции' },
  { key: 'Inventory',   route: 'Inventory',    label: 'Инвентаризация', module: 'inventory' },
  { key: 'WorkJournal', route: 'WorkJournal',  label: 'Журнал работы' },
  { key: 'Locations',   route: 'Locations',    label: 'Локации',  module: 'locations' },
  { key: 'Bookings',    route: 'Bookings',     label: 'Записи' },
  { key: 'Settings',    route: 'Settings',     label: 'Настройки' },
];

// Список для сотрудника — только то, на что есть права.
const STAFF_SECTIONS = [
  { key: 'Sales',       route: 'Sales',        label: 'Продажи',  perm: 'view_order_history' },
  { key: 'ClientsList', route: 'ClientsList',  label: 'Клиенты',  perm: 'view_clients' },
  { key: 'Expenses',    route: 'Expenses',     label: 'Расходы',  perm: 'add_expenses' },
  { key: 'Products',    route: 'Products',     label: 'Управление товарами',   perm: 'view_stock', params: { initialTab: 'stock' } },
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
  const navPanelHighlight = useTourHighlight('admin.navPanel', 0);
  const terms = getTerms();
  const bookingActive = !!(profile?.booking_slug);

  const isWide = activeScreen === home;
  const widthAnim = useRef(new Animated.Value(isWide ? 220 : 72)).current;
  const [renderWide, setRenderWide] = useState(isWide);
  const contentFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(widthAnim, {
      toValue: isWide ? 220 : 72,
      useNativeDriver: false, // ширина — layout-свойство, нативный драйвер её не поддерживает
      damping: 22, stiffness: 210, mass: 0.9,
    }).start();

    // Содержимое (подписи ↔ точки) подменяем и слегка притухаем/зажигаем
    // ровно в середине движения панели — так подмена незаметна на глаз,
    // а не выглядит внезапной подменой контента на месте.
    Animated.sequence([
      Animated.timing(contentFade, { toValue: 0, duration: 90, useNativeDriver: true }),
    ]).start(() => {
      setRenderWide(isWide);
      Animated.timing(contentFade, { toValue: 1, duration: 140, useNativeDriver: true }).start();
    });
  }, [isWide]);

  // Переход между разделами — стек истории держим плоским (максимум
  // Обзор + текущий раздел), а не бесконечно растущим при переходах между
  // разделами подряд. С Обзора — обычный navigate (Обзор остаётся внизу
  // стека). С любого другого раздела на раздел — replace (подменяет
  // текущий раздел новым, Обзор всегда остаётся ровно на один шаг назад).
  const goToSection = (route, params) => {
    if (route === activeScreen) return;
    if (activeScreen === home) navigation.navigate(route, params);
    else navigation.dispatch(StackActions.replace(route, params));
  };

  const handlePress = (item) => {
    if (item.key === 'more') { setDrawerOpen(true); return; }
    goToSection(item.route);
  };

  // ── Панель альбомной ориентации — один и тот же элемент, просто плавно
  // меняет ширину между узкой (72px, точки) и широкой (220px, подписи +
  // название бизнеса + кнопка быстрого заказа) в зависимости от того,
  // находимся мы на Обзоре или на любом другом разделе. ──
  if (!isBottom) {
    const sections = (isAdmin ? ADMIN_SECTIONS : STAFF_SECTIONS)
      .filter(s => !s.module || modules[s.module] !== false)
      .filter(s => !s.perm || can(s.perm));

    return (
      <>
        <Animated.View style={[styles.landscapeNav, { width: widthAnim, paddingTop: insets.top }, navPanelHighlight.style]}>
          <Animated.View style={{ flex: 1, opacity: contentFade }}>
            {renderWide ? (
              <>
                <View style={styles.bizHeader}>
                  <Text style={styles.bizName} numberOfLines={1}>{profile?.business_name || 'Мой бизнес'}</Text>
                  {profile?.city ? <Text style={styles.bizCity}>{profile.city}</Text> : null}
                </View>

                <Pressable style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}
                  onPress={() => goToSection('Kassa')}>
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
                        onPress={() => goToSection(s.route, s.params)}>
                        <Text style={styles.menuLabel}>{s.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : (
              <View style={{ flex: 1, alignItems: 'center', paddingTop: 20, paddingBottom: 16 }}>
                <View style={styles.narrowLogoWrap}>
                  {profile?.logo_base64 ? (
                    <Image source={{ uri: profile.logo_base64 }} style={styles.narrowLogo} />
                  ) : (
                    <Text style={styles.narrowLogoFallback}>{(profile?.business_name || 'С')[0].toUpperCase()}</Text>
                  )}
                </View>
                <View style={styles.narrowDividerWide} />

                <Pressable style={[styles.narrowItemBig, activeScreen === home && styles.narrowItemBigActive]} onPress={() => goToSection(home)}>
                  <View style={[styles.narrowDot, activeScreen === home && styles.narrowDotActive]} />
                </Pressable>

                {sections.map(s => {
                  const isActive = activeScreen === s.key;
                  const disabled = s.bookingOnly && !bookingActive;
                  return (
                    <Pressable key={s.key}
                      style={styles.narrowItem}
                      disabled={disabled}
                      onPress={() => !isActive && goToSection(s.route, s.params)}>
                      <View style={[styles.narrowDot, isActive && styles.narrowDotActive, disabled && styles.narrowDotDisabled]} />
                    </Pressable>
                  );
                })}

                <View style={{ flex: 1 }} />

                <View style={styles.narrowDividerWide} />
                <Pressable style={({ pressed }) => [styles.narrowCta, pressed && { opacity: 0.85 }]}
                  onPress={() => goToSection('Kassa')}>
                  <Text style={styles.narrowCtaIcon}>🛒</Text>
                </Pressable>
              </View>
            )}
          </Animated.View>
          {navPanelHighlight.overlay}
        </Animated.View>

        <Drawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} navigation={navigation} activeScreen={home} />
      </>
    );
  }

  // ── Компактная панель снизу (портрет) ──
  const items = BOTTOM_ITEMS.filter(item => !item.module || modules[item.module] !== false);

  return (
    <>
      <View style={[styles.nav, { flexDirection: 'row', paddingBottom: Math.max(insets.bottom, 8), borderTopWidth: 1 }, navPanelHighlight.style]}>
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
        {navPanelHighlight.overlay}
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

  // ── Панель альбомной ориентации ──
  landscapeNav: { borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
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

  // ── Узкая свёрнутая — внутренние элементы ──
  narrowLogoWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 14 },
  narrowLogo: { width: 44, height: 44 },
  narrowLogoFallback: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.muted },
  narrowCta:   { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  narrowCtaIcon: { fontSize: 20 },
  narrowDivider: { width: 36, height: 1, backgroundColor: colors.border, marginBottom: 6 },
  narrowDividerWide: { width: 44, height: 1, backgroundColor: colors.border, marginBottom: 10 },
  narrowItem:  { width: 72, height: 44, alignItems: 'center', justifyContent: 'center' },
  narrowItemBig: { width: 60, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  narrowItemBigActive: { backgroundColor: 'rgba(240,160,80,0.12)' },
  narrowDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.muted, opacity: 0.4 },
  narrowDotActive: { backgroundColor: colors.orange, opacity: 1, width: 10, height: 10, borderRadius: 5 },
  narrowDotDisabled: { opacity: 0.15 },
});
