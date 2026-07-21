import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  Animated, Dimensions, ScrollView, Modal,
} from 'react-native';
import { colors, fonts } from '../constants/theme';
import { getSession } from '../db/session';
import { getBusinessProfile } from '../db/queries';

const { width: SCREEN_W } = Dimensions.get('window');
const DRAWER_W = Math.min(320, SCREEN_W * 0.78);

/**
 * Боковое меню — навигационный ящик слева.
 * Вызывается из TopBar по кнопке ☰.
 *
 * Props:
 * - visible: bool
 * - onClose: fn
 * - navigation: react-navigation prop
 * - activeScreen: string (текущий экран)
 */
export default function Drawer({ visible, onClose, navigation, activeScreen }) {
  const translateX = useRef(new Animated.Value(-DRAWER_W)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const user    = getSession();
  const profile = (() => { try { return getBusinessProfile(); } catch { return null; } })();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1, duration: 200, useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -DRAWER_W, duration: 220, useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0, duration: 180, useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const nav = (screen) => {
    onClose();
    setTimeout(() => navigation.navigate(screen), 80);
  };

  const SECTIONS = [
    {
      title: 'Работа',
      items: [
        { icon: '☕', label: 'Касса',           screen: 'Kassa',      always: true },
        { icon: '📊', label: 'Продажи',         screen: 'Sales',      always: true },
        { icon: '📓', label: 'Журнал работ',    screen: 'WorkJournal',always: true },
        { icon: '👥', label: 'Клиенты',         screen: 'ClientsList',module: 'clients' },
        { icon: '💸', label: 'Расходы',         screen: 'Expenses',   always: true },
      ],
    },
    {
      title: 'Склад',
      items: [
        { icon: '📦', label: 'Склад',           screen: 'Stock',      module: 'stock' },
        { icon: '📋', label: 'Инвентаризация',  screen: 'Inventory',  module: 'inventory' },
        { icon: '🧾', label: 'Техкарты',        screen: 'CostCards',  module: 'stock' },
      ],
      adminOnly: false,
    },
    {
      title: 'Аналитика',
      adminOnly: true,
      items: [
        { icon: '📈', label: 'Отчётность',      screen: 'Reports',    always: true },
        { icon: '⚙️', label: 'Оборудование',    screen: 'Equipment',  always: true },
        { icon: '🏢', label: 'Накладные',       screen: 'Overheads',  always: true },
        { icon: '💰', label: 'Инвестиции',      screen: 'Investments',always: true },
      ],
    },
    {
      title: 'Настройки',
      adminOnly: true,
      items: [
        { icon: '⚙️', label: 'Настройки',       screen: 'Settings',   always: true },
        { icon: '👥', label: 'Сотрудники',      screen: 'Employees',  always: true },
      ],
    },
  ];

  const modules = profile?.modules || {};

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]}>
        {/* Шапка */}
        <View style={styles.header}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {(user?.name || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user?.name || 'Пользователь'}</Text>
            <Text style={styles.userRole}>
              {isAdmin ? '👑 Администратор' : '☕ Сотрудник'}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={14} style={styles.closeBtn}>
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>
        </View>

        {/* Название бизнеса */}
        {profile?.business_name ? (
          <View style={styles.bizRow}>
            <Text style={styles.bizName}>🏢 {profile.business_name}</Text>
          </View>
        ) : null}

        {/* Навигация */}
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          {SECTIONS.map(section => {
            if (section.adminOnly && !isAdmin) return null;
            const visibleItems = section.items.filter(item => {
              if (item.always) return true;
              if (item.module) return modules[item.module] !== false;
              return true;
            });
            if (visibleItems.length === 0) return null;
            return (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {visibleItems.map(item => {
                  const isActive = activeScreen === item.screen;
                  return (
                    <Pressable
                      key={item.screen}
                      style={({ pressed }) => [
                        styles.navItem,
                        isActive && styles.navItemActive,
                        pressed && !isActive && styles.navItemPressed,
                      ]}
                      onPress={() => nav(item.screen)}
                    >
                      <Text style={styles.navIcon}>{item.icon}</Text>
                      <Text style={[
                        styles.navLabel,
                        isActive && styles.navLabelActive,
                      ]}>
                        {item.label}
                      </Text>
                      {isActive && <View style={styles.activeBar} />}
                    </Pressable>
                  );
                })}
              </View>
            );
          })}

          {/* Выход */}
          <View style={styles.section}>
            <Pressable
              style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
              onPress={() => { onClose(); navigation.navigate('Login'); }}
            >
              <Text style={styles.navIcon}>🚪</Text>
              <Text style={[styles.navLabel, { color: colors.muted }]}>Выйти из аккаунта</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 100,
  },
  drawer: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    width: DRAWER_W,
    backgroundColor: '#0b0c0f',
    zIndex: 101,
    borderRightWidth: 1,
    borderRightColor: 'rgba(74,77,84,0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    paddingTop: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#08090b',
  },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(61,158,146,0.2)',
    borderWidth: 1, borderColor: 'rgba(61,158,146,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.family, fontSize: 18, color: colors.greenLight },
  userName: { fontFamily: fonts.family, fontSize: 15, color: colors.text, fontWeight: '700' },
  userRole: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  closeBtn: { padding: 4 },
  closeIcon: { fontSize: 18, color: colors.muted },
  bizRow: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bizName: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  section: { paddingTop: 16, paddingBottom: 4 },
  sectionTitle: {
    fontFamily: fonts.familySemibold,
    fontSize: 10,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 20,
    marginHorizontal: 8,
    borderRadius: 12,
    position: 'relative',
  },
  navItemActive: {
    backgroundColor: 'rgba(61,158,146,0.1)',
  },
  navItemPressed: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  navIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  navLabel: {
    fontFamily: fonts.familySemibold,
    fontSize: 14,
    color: colors.text,
  },
  navLabelActive: { color: colors.greenLight },
  activeBar: {
    position: 'absolute',
    right: 0, top: '20%', bottom: '20%',
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.greenLight,
  },
});
