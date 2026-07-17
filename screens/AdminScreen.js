import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, Pressable } from 'react-native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getBusinessProfile, getOpenShift, getTerms, pluralizeRu, getRoleNames, getDashboardStats } from '../db/queries';
import DashboardWidget from '../components/DashboardWidget';
import { colors, fonts, spacing } from '../constants/theme';

const getMenuItems = (terms) => [
  { icon: '☕', label: `Новый ${terms.order.toLowerCase()}`, screen: 'Kassa',       variant: 'action'  },
  { icon: '👥', label: 'Лояльность',     screen: 'ClientsList', variant: 'pay',     module: 'clients' },
  { icon: '📊', label: pluralizeRu(terms.order),   screen: 'Sales',       variant: 'success' },
  { icon: '📈', label: 'Отчётность',     screen: 'Reports',     variant: 'success' },
  { icon: '📦', label: 'Склад',          screen: 'Stock',       variant: 'default', module: 'stock' },
  { icon: '🧾', label: 'Себестоимость',  screen: 'CostCards',   variant: 'default', module: 'stock' },
  { icon: '💸', label: 'Расходы',        screen: 'Expenses',    variant: 'danger'  },
  { icon: '📅', label: 'Открыть смену',  screen: 'Shift',       variant: 'success', module: 'shifts', hideWhenShiftOpen: true },
  { icon: '👤', label: `Новый ${terms.client}`, screen: 'Reg',  variant: 'pay',     module: 'clients' },
  { icon: '🗂️', label: 'Локации',         screen: 'Locations',   variant: 'default',  module: 'locations' },
  { icon: '📋', label: 'Инвентаризация',  screen: 'Inventory',   variant: 'default',  module: 'inventory' },
  { icon: '📥', label: 'Импорт Sheets',   screen: 'Migrate',     variant: 'success' },
  { icon: '👥', label: 'Сотрудники',     screen: 'Employees',   variant: 'pay'     },
  { icon: '⚙️', label: 'Настройки',      screen: 'Settings',    variant: 'pay'     },
];

const ACCENT = {
  action:  { border: 'rgba(122,158,82,0.45)',  bg: 'rgba(122,158,82,0.10)'  },
  pay:     { border: 'rgba(61,95,168,0.45)',   bg: 'rgba(61,95,168,0.10)'   },
  success: { border: 'rgba(61,158,146,0.45)',  bg: 'rgba(61,158,146,0.10)'  },
  default: { border: 'rgba(74,77,84,0.6)',     bg: 'rgba(14,15,17,0.8)'     },
  danger:  { border: 'rgba(160,16,32,0.45)',   bg: 'rgba(160,16,32,0.10)'   },
};

export default function AdminScreen({ navigation }) {
  const [modules, setModules] = useState({});
  const [shiftOpen, setShiftOpen] = useState(false);
  const [terms, setTerms] = useState({ item: 'Товар', client: 'Клиент', order: 'Заказ', category: 'Категория' });
  const [roleNames, setRoleNames] = useState({ barista: 'Сотрудник', admin: 'Администратор' });
  const [stats, setStats] = useState(null);

  useEffect(() => {
    try {
      const profile = getBusinessProfile();
      setModules(profile?.modules || {});
      setShiftOpen(!!getOpenShift());
      setTerms(getTerms());
      setRoleNames(getRoleNames());
      setStats(getDashboardStats());
    } catch (e) { console.error(e); }
  }, []);

  const visibleItems = getMenuItems(terms).filter(item =>
    (!item.module || modules[item.module] !== false) &&
    !(item.hideWhenShiftOpen && shiftOpen)
  );

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={roleNames.admin} onBack={() => navigation.navigate('Login')} />
      <DashboardWidget
        stats={stats}
        modules={modules}
        onLowStockPress={() => navigation.navigate('Stock')}
      />

      <ScrollView contentContainerStyle={styles.inner}>
        <View style={styles.brandHeader}>
          <Image
            source={{ uri: 'https://i.ibb.co/hRZxPz8b/19-20260514150523.png' }}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.roleText}>👑 {roleNames.admin}</Text>
        </View>

        <View style={styles.grid}>
          {visibleItems.map((item) => {
            const ac = ACCENT[item.variant] || ACCENT.default;
            return (
              <Pressable
                key={item.screen}
                style={({ pressed }) => [
                  styles.card,
                  { borderColor: ac.border, backgroundColor: pressed ? ac.border : ac.bg },
                ]}
                onPress={() => navigation.navigate(item.screen)}
              >
                <Text style={styles.cardIcon}>{item.icon}</Text>
                <Text style={styles.cardLabel}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {modules.shifts !== false && (
          <View style={styles.shiftRow}>
            <Pressable
              style={[styles.shiftBtn, { borderColor: 'rgba(160,16,32,0.5)', backgroundColor: 'rgba(160,16,32,0.10)' }]}
              onPress={() => navigation.navigate('ShiftClose')}
            >
              <Text style={[styles.shiftBtnText, { color: colors.redLight }]}>🚪 Закрыть смену</Text>
            </Pressable>
            <Pressable
              style={[styles.shiftBtn, { borderColor: 'rgba(74,77,84,0.5)' }]}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.shiftBtnText}>🔄 Сменить аккаунт</Text>
            </Pressable>
          </View>
        )}
        {modules.shifts === false && (
          <View style={styles.shiftRow}>
            <Pressable
              style={[styles.shiftBtn, { borderColor: 'rgba(74,77,84,0.5)' }]}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.shiftBtnText}>🔄 Сменить аккаунт</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <BottomBar navigation={navigation} activeTab="Kassa" />
    </View>
  );
}

const styles = StyleSheet.create({
  inner: {
    padding: spacing.lg,
    paddingBottom: 20,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  brandHeader: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  logo: {
    width: 260,
    height: 140,
    borderRadius: 14,
    marginBottom: 10,
  },
  roleText: {
    fontFamily: fonts.familySemibold,
    fontSize: 13,
    letterSpacing: 2,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 16,
  },
  card: {
    width: '23%',
    minWidth: 130,
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 10,
  },
  cardIcon: {
    fontSize: 36,
  },
  cardLabel: {
    fontFamily: fonts.familySemibold,
    fontSize: 11,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  shiftRow: {
    gap: 10,
  },
  shiftBtn: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(74,77,84,0.4)',
    backgroundColor: 'rgba(14,15,17,0.6)',
    alignItems: 'center',
  },
  shiftBtnText: {
    fontFamily: fonts.familySemibold,
    fontSize: 13,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});
