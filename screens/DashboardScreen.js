import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, Pressable } from 'react-native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getOpenShift, getBusinessProfile, getTerms, pluralizeRu, getRoleNames, getDashboardStats } from '../db/queries';
import DashboardWidget from '../components/DashboardWidget';
import ShiftBadge from '../components/ShiftBadge';
import { colors, fonts, spacing } from '../constants/theme';

const getMenuItems = (terms) => [
  { icon: '☕', label: `Новый ${terms.order.toLowerCase()}`, sub: 'Касса', screen: 'Kassa',       variant: 'action'  },
  { icon: '💸', label: 'Расходы',        sub: 'Записать затрату', screen: 'Expenses',   variant: 'danger'  },
  { icon: '📊', label: pluralizeRu(terms.order), sub: 'История',  screen: 'Sales',      variant: 'success' },
  { icon: '👥', label: 'Клиенты',        sub: 'Поиск / новый',   screen: 'ClientsList', variant: 'pay',    module: 'clients' },
];

const ACCENT = {
  action:  { border: 'rgba(122,158,82,0.45)',  bg: 'rgba(122,158,82,0.10)'  },
  pay:     { border: 'rgba(61,95,168,0.45)',   bg: 'rgba(61,95,168,0.10)'   },
  success: { border: 'rgba(61,158,146,0.45)',  bg: 'rgba(61,158,146,0.10)'  },
  default: { border: 'rgba(74,77,84,0.6)',     bg: 'rgba(14,15,17,0.8)'     },
  danger:  { border: 'rgba(160,16,32,0.45)',   bg: 'rgba(160,16,32,0.10)'   },
};

export default function DashboardScreen({ navigation }) {
  const [shift, setShift] = useState(null);
  const [modules, setModules] = useState({});
  const [terms, setTerms] = useState({ item: 'Товар', client: 'Клиент', order: 'Заказ', category: 'Категория' });
  const [roleNames, setRoleNames] = useState({ barista: 'Сотрудник', admin: 'Администратор' });
  const [stats, setStats] = useState(null);

  const loadStats = () => {
    try {
      setShift(getOpenShift());
      setModules(getBusinessProfile()?.modules || {});
      setTerms(getTerms());
      setRoleNames(getRoleNames());
      setStats(getDashboardStats());
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    loadStats();
    const unsub = navigation.addListener('focus', loadStats);
    return unsub;
  }, [navigation]);

  const visibleItems = getMenuItems(terms).filter(item => !item.module || modules[item.module] !== false);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={roleNames.barista} navigation={navigation} activeScreen="Dashboard"
        rightElement={<ShiftBadge stats={stats} onPress={() => navigation.navigate('ShiftClose')} />}
      />
      <DashboardWidget
        stats={stats}
        modules={modules}
        onLowStockPress={() => navigation.navigate('Stock')}
      />

      <ScrollView contentContainerStyle={styles.inner}>
        {/* Логотип */}
        <View style={styles.brandHeader}>
          <Image
            source={{ uri: 'https://i.ibb.co/hRZxPz8b/19-20260514150523.png' }}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.roleText}>
            {shift ? `☕ Смена открыта · ${new Date(shift.opened_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : '⚠️ Смена не открыта'}
          </Text>
        </View>

        {/* Сетка карточек */}
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
                {item.sub && <Text style={styles.cardSub}>{item.sub}</Text>}
              </Pressable>
            );
          })}
        </View>

        {/* Управление сменой */}
        <View style={styles.shiftRow}>
          {!shift && (
            <Pressable
              style={styles.noShiftBanner}
              onPress={() => navigation.navigate('Shift')}
            >
              <Text style={styles.noShiftTitle}>⚠️ Смена не открыта</Text>
              <Text style={styles.noShiftSub}>Нажмите чтобы начать рабочий день и принимать заказы</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.shiftBtn, { borderColor: 'rgba(74,77,84,0.5)' }]}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.shiftBtnText}>🔄 Сменить аккаунт</Text>
          </Pressable>
          {shift && (
            <Pressable
              style={[styles.shiftBtn, { borderColor: 'rgba(160,16,32,0.5)', backgroundColor: 'rgba(160,16,32,0.10)' }]}
              onPress={() => navigation.navigate('ShiftClose')}
            >
              <Text style={[styles.shiftBtnText, { color: colors.redLight }]}>🚪 Закрыть смену</Text>
            </Pressable>
          )}
        </View>
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

  // Сетка
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 16,
  },
  card: {
    // На планшете в горизонтали ~4 карточки в ряд
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
  cardSub: { fontFamily: fonts.familyRegular, fontSize: 9, color: colors.muted, textAlign: 'center', lineHeight: 13 },
  noShiftBanner: { padding: 18, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(122,158,82,0.5)', backgroundColor: 'rgba(122,158,82,0.08)', alignItems: 'center', marginBottom: 10 },
  noShiftTitle: { fontFamily: fonts.family, fontSize: 16, fontWeight: '700', color: colors.greenLight, marginBottom: 4 },
  noShiftSub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center' },

  // Смена
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
