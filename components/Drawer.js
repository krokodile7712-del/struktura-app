import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  Animated, Dimensions, ScrollView, Modal,
} from 'react-native';
import { colors, fonts } from '../constants/theme';
import { getSession } from '../db/session';
import { getBusinessProfile, getOpenShift } from '../db/queries';

const { width: SCREEN_W } = Dimensions.get('window');
const DRAWER_W = Math.min(300, SCREEN_W * 0.75);

export default function Drawer({ visible, onClose, navigation, activeScreen }) {
  const translateX      = useRef(new Animated.Value(-DRAWER_W)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const user    = getSession();
  const profile = (() => { try { return getBusinessProfile(); } catch { return null; } })();
  const shift   = (() => { try { return getOpenShift(); } catch { return null; } })();
  const isAdmin = user?.role === 'admin';
  const modules = profile?.modules || {};

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: visible ? 0 : -DRAWER_W,
        useNativeDriver: true, bounciness: 0, speed: 20,
      }),
      Animated.timing(backdropOpacity, {
        toValue: visible ? 1 : 0,
        duration: visible ? 200 : 180, useNativeDriver: true,
      }),
    ]).start();
  }, [visible]);

  const nav = (screen) => { onClose(); setTimeout(() => navigation.navigate(screen), 80); };

  const SECTIONS = [
    {
      title: 'Работа',
      items: [
        { icon: '⊡', label: 'Касса',      screen: 'Kassa',       always: true },
        { icon: '≡', label: 'Продажи',    screen: 'Sales',       always: true },
        { icon: '★', label: 'Клиенты',    screen: 'ClientsList', module: 'clients' },
        { icon: '↓', label: 'Расходы',    screen: 'Expenses',    always: true },
      ],
    },
    {
      title: 'Склад',
      items: [
        { icon: '▦', label: 'Техкарты',   screen: 'CostCards',   module: 'stock' },
      ],
    },
    {
      title: 'Аналитика',
      adminOnly: true,
      items: [
        { icon: '↗', label: 'Отчётность', screen: 'Reports',     always: true },
        { icon: '⌥', label: 'Оборудование',screen: 'Equipment',  always: true },
        { icon: '⊞', label: 'Накладные',  screen: 'Overheads',   always: true },
        { icon: '◈', label: 'Инвестиции', screen: 'Investments', always: true },
      ],
    },
    {
      title: 'Система',
      adminOnly: true,
      items: [
        { icon: '◎', label: 'Настройки',  screen: 'Settings',    always: true },
        { icon: '◉', label: 'Сотрудники', screen: 'Employees',   always: true },
      ],
    },
  ];

  const initial = (user?.name || '?').charAt(0).toUpperCase();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]}>

        {/* ── Шапка ── */}
        <View style={styles.header}>
          {/* Крестик */}
          <Pressable onPress={onClose} hitSlop={14} style={styles.closeBtn}>
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>

          {/* Аватар + имя */}
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{user?.name || 'Пользователь'}</Text>
              <Text style={styles.userRole}>
                {isAdmin ? 'Администратор' : 'Сотрудник'}
              </Text>
            </View>
          </View>

          {/* Бизнес + статус */}
          <View style={styles.bizRow}>
            {profile?.business_name ? (
              <Text style={styles.bizName}>{profile.business_name}</Text>
            ) : null}
            <View style={[styles.shiftDot, shift ? styles.shiftDotOpen : styles.shiftDotClosed]} />
            <Text style={styles.shiftStatus}>{shift ? 'Смена открыта' : 'Смена закрыта'}</Text>
          </View>
        </View>

        {/* ── Навигация ── */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 24 }}
        >
          {SECTIONS.map((section, si) => {
            if (section.adminOnly && !isAdmin) return null;
            const visibleItems = section.items.filter(item => {
              if (item.always) return true;
              if (item.module) return modules[item.module] !== false;
              return true;
            });
            if (visibleItems.length === 0) return null;
            return (
              <View key={section.title} style={[styles.section, si > 0 && styles.sectionBorder]}>
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
                      {isActive && <View style={styles.activeBar} />}
                      <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}

          {/* Выход */}
          <View style={[styles.section, styles.sectionBorder]}>
            <Pressable
              style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
              onPress={() => { onClose(); navigation.navigate('Login'); }}
            >
              <Text style={styles.logoutLabel}>Выйти из аккаунта</Text>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 100,
  },
  drawer: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    width: DRAWER_W,
    backgroundColor: '#0a0b0d',
    zIndex: 101,
    borderRightWidth: 1,
    borderRightColor: 'rgba(74,77,84,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 12, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 24,
  },

  // Шапка
  header: {
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(74,77,84,0.25)',
    backgroundColor: '#07080a',
  },
  closeBtn: {
    alignSelf: 'flex-end',
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(74,77,84,0.2)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  closeIcon: { fontSize: 12, color: colors.muted, fontFamily: fonts.familySemibold },

  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(61,158,146,0.15)',
    borderWidth: 1.5, borderColor: 'rgba(61,158,146,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.family, fontSize: 22, fontWeight: '800', color: colors.greenLight },
  userName:   { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 3 },
  userRole:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },

  bizRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bizName: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, flex: 1 },
  shiftDot: { width: 7, height: 7, borderRadius: 4 },
  shiftDotOpen:   { backgroundColor: '#3d9e92' },
  shiftDotClosed: { backgroundColor: '#4a4d54' },
  shiftStatus: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },

  // Секции
  section: { paddingTop: 12, paddingBottom: 4 },
  sectionBorder: { borderTopWidth: 1, borderTopColor: 'rgba(74,77,84,0.2)', marginTop: 4 },
  sectionTitle: {
    fontFamily: fonts.familySemibold,
    fontSize: 10,
    color: 'rgba(74,77,84,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 2,
    paddingHorizontal: 20,
    marginBottom: 4,
  },

  // Пункты навигации
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginHorizontal: 8,
    borderRadius: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  navItemActive:  { backgroundColor: 'rgba(61,158,146,0.1)' },
  navItemPressed: { backgroundColor: 'rgba(255,255,255,0.04)' },

  activeBar: {
    position: 'absolute',
    left: 0, top: '20%', bottom: '20%',
    width: 3, borderRadius: 2,
    backgroundColor: colors.greenLight,
  },
  navLabel:       { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginLeft: 4 },
  navLabelActive: { color: colors.greenLight },
  logoutLabel:    { fontFamily: fonts.familySemibold, fontSize: 14, color: 'rgba(74,77,84,0.7)', marginLeft: 4 },
});
