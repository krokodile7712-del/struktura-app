import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  Animated, Dimensions, ScrollView, Modal,
} from 'react-native';
import { colors, fonts } from '../constants/theme';
import { getSession, can } from '../db/session';
import { getBusinessProfile, getOpenShift } from '../db/queries';

const { width: SCREEN_W } = Dimensions.get('window');
const DRAWER_W = Math.min(300, SCREEN_W * 0.75);

export default function Drawer({ visible, onClose, navigation, activeScreen }) {
  const translateX      = useRef(new Animated.Value(-DRAWER_W)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity  = useRef(new Animated.Value(0)).current;

  const [tick, setTick] = useState(0);

  // Синхронно читаем актуальные данные при каждом рендере
  const user    = getSession();
  const profile = (() => { try { return getBusinessProfile(); } catch { return null; } })();
  const shift   = (() => { try { return getOpenShift(); } catch { return null; } })();
  const isAdmin = user?.role === 'admin';
  const modules = profile?.modules || {};

  useEffect(() => {
    if (visible) {
      setTick(t => t + 1); // форс-рендер чтобы перечитать права

      Animated.parallel([
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(contentOpacity, { toValue: 1, duration: 300, delay: 80, useNativeDriver: true }),
      ]).start();
    } else {
      contentOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateX, { toValue: -DRAWER_W, duration: 200, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const nav = (screen) => { onClose(); setTimeout(() => navigation.navigate(screen), 80); };

  const SECTIONS = [
    {
      title: 'Работа',
      items: [
        { label: 'Продажи',   screen: 'Sales',       perm: 'drawer_sales' },
        { label: 'Клиенты',   screen: 'ClientsList', perm: 'drawer_clients', module: 'clients' },
        { label: 'Расходы',   screen: 'Expenses',    perm: 'drawer_expenses' },
        { label: 'Склад',     screen: 'Stock',       perm: 'drawer_stock' },
        { label: 'Товары',    screen: 'Products',    adminOnly: true },
      ],
    },
    {
      title: 'Аналитика',
      adminOnly: true,
      items: [
        { label: 'Отчётность',  screen: 'Reports',     always: true },
        { label: 'Оборудование',screen: 'Equipment',   always: true },
        { label: 'Накладные',   screen: 'Overheads',   always: true },
        { label: 'Инвестиции',  screen: 'Investments', always: true },
        { label: 'Журнал работы',screen: 'WorkJournal', always: true },
      ],
    },
    {
      title: 'Система',
      adminOnly: true,
      items: [
      ],
    },
  ];

  const initial = (user?.name || '?').charAt(0).toUpperCase();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Затемнение */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      {/* Шторка */}
      <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]}>

        {/* Шапка */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={14}>
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>

          <Animated.View style={{ opacity: contentOpacity }}>
            {/* Аватар */}
            <View style={styles.avatarRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarTxt}>{initial}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{user?.name || 'Пользователь'}</Text>
                <Text style={styles.userRole}>{isAdmin ? 'Администратор' : 'Сотрудник'}</Text>
              </View>
            </View>

            {/* Бизнес + смена */}
            <View style={styles.bizRow}>
              {profile?.business_name ? (
                <Text style={styles.bizName} numberOfLines={1}>{profile.business_name}</Text>
              ) : null}
              <View style={styles.shiftBadge}>
                <View style={[styles.shiftDot, { backgroundColor: shift ? colors.green : colors.muted }]} />
                <Text style={styles.shiftTxt}>{shift ? 'Смена открыта' : 'Смена закрыта'}</Text>
              </View>
            </View>
          </Animated.View>
        </View>

        {/* Навигация */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 32 }}
        >
          <Animated.View style={{ opacity: contentOpacity }}>
            {SECTIONS.map((section, si) => {
              if (section.adminOnly && !isAdmin) return null;
              const visibleItems = section.items.filter(item => {
                if (item.adminOnly) return isAdmin;
                if (item.always) return true;
                if (item.perm) return isAdmin || can(item.perm);
                if (item.module) return modules[item.module] !== false;
                return true;
              });
              if (visibleItems.length === 0) return null;
              return (
                <View key={section.title} style={[styles.section, si > 0 && styles.sectionDiv]}>
                  <Text style={styles.sectionLabel}>{section.title}</Text>
                  {visibleItems.map(item => {
                    const isActive = activeScreen === item.screen;
                    return (
                      <Pressable
                        key={item.screen}
                        style={({ pressed }) => [
                          styles.navItem,
                          isActive && styles.navItemActive,
                          pressed && !isActive && { backgroundColor: 'rgba(245,240,232,0.04)' },
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
          </Animated.View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 100,
  },
  drawer: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    width: DRAWER_W,
    backgroundColor: colors.surface,
    zIndex: 101,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 16, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 24,
  },

  // Шапка
  header: {
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface2,
    gap: 16,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  closeIcon: { fontSize: 11, color: colors.muted, fontFamily: fonts.familySemibold },

  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(139,127,212,0.15)',
    borderWidth: 2, borderColor: 'rgba(139,127,212,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt:  { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.indigo },
  userName:   { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 2 },
  userRole:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },

  bizRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bizName: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, flex: 1 },
  shiftBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shiftDot:   { width: 7, height: 7, borderRadius: 4 },
  shiftTxt:   { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },

  // Секции
  section:    { paddingTop: 10, paddingBottom: 4 },
  sectionDiv: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 },
  sectionLabel: {
    fontFamily: fonts.familySemibold,
    fontSize: 10,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    paddingHorizontal: 20,
    marginBottom: 4,
  },

  // Пункты
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginHorizontal: 8,
    borderRadius: 12,
    position: 'relative',
  },
  navItemActive: { backgroundColor: 'rgba(240,160,80,0.08)' },
  activeBar: {
    position: 'absolute',
    left: 0, top: '15%', bottom: '15%',
    width: 3, borderRadius: 2,
    backgroundColor: colors.orange,
  },
  navLabel:       { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  navLabelActive: { color: colors.orange },
  logoutLabel:    { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
});
