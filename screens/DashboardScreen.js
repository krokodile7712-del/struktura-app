import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';
import TopBar from '../components/TopBar';
import ShiftBanner from '../components/ShiftBanner';
import BottomBar from '../components/BottomBar';
import StatsBar from '../components/StatsBar';
import { getBusinessProfile, getOpenShift, getTerms, pluralizeRu, getRoleNames, getDashboardStats } from '../db/queries';
import { can } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';

function useColumns() {
  const [cols, setCols] = useState(() => {
    const w = Dimensions.get('window').width;
    if (w < 480) return 2;
    if (w < 700) return 3;
    return 4;
  });
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      if (window.width < 480)      setCols(2);
      else if (window.width < 700) setCols(3);
      else                         setCols(4);
    });
    return () => sub?.remove();
  }, []);
  return cols;
}

const ACCENT = {
  action:  { border: 'rgba(122,158,82,0.5)',  bg: 'rgba(122,158,82,0.10)' },
  pay:     { border: 'rgba(61,95,168,0.5)',   bg: 'rgba(61,95,168,0.10)'  },
  success: { border: 'rgba(61,158,146,0.5)',  bg: 'rgba(61,158,146,0.10)' },
  default: { border: 'rgba(74,77,84,0.5)',    bg: 'rgba(20,22,24,0.9)'    },
  danger:  { border: 'rgba(160,16,32,0.5)',   bg: 'rgba(160,16,32,0.10)'  },
};

const getMenuItems = (terms) => [
  { icon: '💸', label: 'Расходы',    sub: 'Записать затрату', screen: 'Expenses',    variant: 'danger'   },
  { icon: '📊', label: pluralizeRu(terms.order), sub: 'История', screen: 'Sales', variant: 'success' },
  { icon: '👥', label: 'Клиенты',   sub: 'Поиск · новый',    screen: 'ClientsList', variant: 'pay', module: 'clients' },
];

export default function DashboardScreen({ navigation }) {
  const [modules, setModules]     = useState({});
  const [terms, setTerms]         = useState({ item: 'Товар', client: 'Клиент', order: 'Заказ', category: 'Категория' });
  const [roleNames, setRoleNames] = useState({ barista: 'Сотрудник', admin: 'Администратор' });
  const [hasShift, setHasShift] = useState(true);
  const [stats, setStats]         = useState(null);
  const [profile, setProfile]     = useState(null);
  const cols = useColumns();

  const loadStats = () => {
    try {
      const p = getBusinessProfile();
      setProfile(p);
      setModules(p?.modules || {});
      setTerms(getTerms());
      setRoleNames(getRoleNames());
      setStats(getDashboardStats());
      setHasShift(!!getOpenShift());
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    loadStats();
    const unsub = navigation.addListener('focus', loadStats);
    return unsub;
  }, [navigation]);

  const visibleItems = getMenuItems(terms).filter(item =>
    !item.module || modules[item.module] !== false
  );

  const logoUri = profile?.logo_url || 'https://i.ibb.co/hRZxPz8b/19-20260514150523.png';
  const screenW = Dimensions.get('window').width;
  const gridPad = spacing.lg * 2;
  const gap     = 10;
  const tileW   = Math.floor((Math.min(screenW, 1100) - gridPad - gap * (cols - 1)) / cols);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={roleNames.barista} navigation={navigation} activeScreen="Dashboard" />
      {!hasShift && <ShiftBanner onOpen={() => navigation.navigate('Shift')} />}
      <StatsBar
        stats={stats}
        modules={modules}
        onShiftPress={() => navigation.navigate('ShiftClose')}
        onStockPress={() => navigation.navigate('Stock')}
      />

      <ScrollView contentContainerStyle={styles.inner}>

        {/* Логотип */}
        <View style={styles.logoWrap}>
          <Image
            source={{ uri: logoUri }}
            style={styles.logo}
            resizeMode="contain"
          />
          {profile?.business_name ? (
            <Text style={styles.bizName}>{profile.business_name}</Text>
          ) : null}
        </View>

        {/* Hero — Новый заказ */}
        <Pressable
          style={({ pressed }) => [
            styles.hero,
            pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
          ]}
          onPress={() => navigation.navigate('Kassa')}
        >
          <Text style={styles.heroIcon}>☕</Text>
          <View>
            <Text style={styles.heroLabel}>Новый {terms.order.toLowerCase()}</Text>
            <Text style={styles.heroSub}>Касса · добавить позиции и оплатить</Text>
          </View>
          <Text style={styles.heroArrow}>›</Text>
        </Pressable>

        {/* Вторичные действия — список */}
        <View style={styles.list}>
          {visibleItems.map((item, idx) => (
            <Pressable
              key={item.screen}
              style={({ pressed }) => [
                styles.listItem,
                idx < visibleItems.length - 1 && styles.listItemDiv,
                pressed && { backgroundColor: 'rgba(255,255,255,0.03)' },
              ]}
              onPress={() => navigation.navigate(item.screen)}
            >
              <Text style={styles.listIcon}>{item.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.listLabel}>{item.label}</Text>
                {item.sub ? <Text style={styles.listSub}>{item.sub}</Text> : null}
              </View>
              <Text style={styles.listArrow}>›</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.switchBtn} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.switchBtnText}>🔄 Сменить аккаунт</Text>
        </Pressable>

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
  logoWrap: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  logo: {
    width: 160,
    height: 80,
    marginBottom: 6,
  },
  bizName: {
    fontFamily: fonts.familySemibold,
    fontSize: 13,
    color: colors.muted,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(122,158,82,0.6)',
    backgroundColor: 'rgba(122,158,82,0.12)',
    marginBottom: 14,
  },
  heroIcon:  { fontSize: 32 },
  heroLabel: { fontFamily: fonts.family, fontSize: 17, fontWeight: '700', color: '#c8e890', textTransform: 'capitalize' },
  heroSub:   { fontFamily: fonts.familyRegular, fontSize: 12, color: 'rgba(200,232,144,0.6)', marginTop: 2 },
  heroArrow: { fontFamily: fonts.family, fontSize: 28, color: 'rgba(200,232,144,0.5)', marginLeft: 'auto' },
  list:        { backgroundColor: '#0b0c0f', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', overflow: 'hidden', marginBottom: 14 },
  listItem:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  listItemDiv: { borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.2)' },
  listIcon:    { fontSize: 18, width: 24, textAlign: 'center', opacity: 0.7 },
  listLabel:   { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  listSub:     { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 1 },
  listArrow:   { fontSize: 18, color: 'rgba(74,77,84,0.4)' },
  switchBtn: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(74,77,84,0.35)', alignItems: 'center', marginTop: 4 },
  switchBtnText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, letterSpacing: 1 },
});
