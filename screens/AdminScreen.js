import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';
import TopBar from '../components/TopBar';
import ShiftBanner from '../components/ShiftBanner';
import BottomBar from '../components/BottomBar';
import StatsBar from '../components/StatsBar';
import { getBusinessProfile, getOpenShift, getTerms, pluralizeRu, getRoleNames, getDashboardStats } from '../db/queries';
import { can } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';

// Адаптивное количество колонок
function useColumns() {
  const [cols, setCols] = useState(() => {
    const w = Dimensions.get('window').width;
    if (w < 480) return 2;
    if (w < 700) return 3;
    if (w < 960) return 4;
    return 5;
  });
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      if (window.width < 480)      setCols(2);
      else if (window.width < 700) setCols(3);
      else if (window.width < 960) setCols(4);
      else                         setCols(5);
    });
    return () => sub?.remove();
  }, []);
  return cols;
}

const ACCENT = {
  action:  { border: 'rgba(122,158,82,0.5)',  bg: 'rgba(122,158,82,0.10)', icon: '#a8c878' },
  pay:     { border: 'rgba(61,95,168,0.5)',   bg: 'rgba(61,95,168,0.10)',  icon: '#7a9be8' },
  success: { border: 'rgba(61,158,146,0.5)',  bg: 'rgba(61,158,146,0.10)', icon: '#4ec0b2' },
  default: { border: 'rgba(74,77,84,0.5)',    bg: 'rgba(20,22,24,0.9)',    icon: '#8a8d94' },
  danger:  { border: 'rgba(160,16,32,0.5)',   bg: 'rgba(160,16,32,0.10)', icon: '#e05555' },
};

const getMenuItems = (terms) => [
  { icon: '📊', label: pluralizeRu(terms.order), sub: 'История продаж',    screen: 'Sales',    variant: 'success' },
  { icon: '📈', label: 'Отчётность',  sub: 'P&L · графики',               screen: 'Reports',  variant: 'success' },
  { icon: '📦', label: 'Склад',       sub: 'Остатки · закупки',            screen: 'Stock',    variant: 'default', module: 'stock' },
  { icon: '💸', label: 'Расходы',     sub: 'Затраты за день',              screen: 'Expenses', variant: 'danger'  },
  { icon: '📅', label: 'Открыть смену', sub: 'Начать рабочий день',        screen: 'Shift',    variant: 'success', module: 'shifts', hideWhenShiftOpen: true },
  { icon: '⚙️', label: 'Настройки',   sub: 'Профиль · модули',             screen: 'Settings', variant: 'pay'     },
];

export default function AdminScreen({ navigation }) {
  const [modules, setModules]     = useState({});
  const [shiftOpen, setShiftOpen] = useState(false);
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
      setShiftOpen(!!getOpenShift());
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

  const visibleItems = getMenuItems(terms).filter(item => {
    if (item.module && modules[item.module] === false) return false;
    if (item.hideWhenShiftOpen && shiftOpen) return false;
    return true;
  });

  const logoUri = profile?.logo_url || 'https://i.ibb.co/hRZxPz8b/19-20260514150523.png';

  // Ширина плитки с учётом отступов
  const screenW   = Dimensions.get('window').width;
  const gridPad   = spacing.lg * 2;
  const gap       = 10;
  const tileWidth = Math.floor((Math.min(screenW, 1100) - gridPad - gap * (cols - 1)) / cols);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={roleNames.admin} navigation={navigation} activeScreen="Admin" />
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
          accessibilityLabel={`Новый ${terms.order.toLowerCase()}`}
        >
          <Text style={styles.heroIcon}>☕</Text>
          <View>
            <Text style={styles.heroLabel}>Новый {terms.order.toLowerCase()}</Text>
            <Text style={styles.heroSub}>Касса · добавить позиции и оплатить</Text>
          </View>
          <Text style={styles.heroArrow}>›</Text>
        </Pressable>

        {/* Сетка действий */}
        <View style={[styles.grid, { gap }]}>
          {visibleItems.map((item) => {
            const ac = ACCENT[item.variant] || ACCENT.default;
            return (
              <Pressable
                key={item.screen}
                style={({ pressed }) => [
                  styles.tile,
                  {
                    width: tileWidth,
                    borderColor: ac.border,
                    backgroundColor: pressed ? ac.border : ac.bg,
                  },
                ]}
                onPress={() => navigation.navigate(item.screen)}
              >
                <Text style={styles.tileIcon}>{item.icon}</Text>
                <Text style={styles.tileLabel}>{item.label}</Text>
                {item.sub ? <Text style={styles.tileSub}>{item.sub}</Text> : null}
              </Pressable>
            );
          })}
        </View>

        {/* Сменить аккаунт */}
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

  // Логотип
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

  // Hero кнопка
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
  heroIcon: {
    fontSize: 32,
  },
  heroLabel: {
    fontFamily: fonts.family,
    fontSize: 17,
    fontWeight: '700',
    color: '#c8e890',
    textTransform: 'capitalize',
  },
  heroSub: {
    fontFamily: fonts.familyRegular,
    fontSize: 12,
    color: 'rgba(200,232,144,0.6)',
    marginTop: 2,
  },
  heroArrow: {
    fontFamily: fonts.family,
    fontSize: 28,
    color: 'rgba(200,232,144,0.5)',
    marginLeft: 'auto',
  },

  // Сетка плиток
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  tile: {
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    gap: 6,
    marginBottom: 10,
  },
  tileIcon: {
    fontSize: 26,
  },
  tileLabel: {
    fontFamily: fonts.familySemibold,
    fontSize: 10,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
  tileSub: {
    fontFamily: fonts.familyRegular,
    fontSize: 8,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 11,
  },

  // Кнопка смены аккаунта
  switchBtn: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(74,77,84,0.35)',
    alignItems: 'center',
    marginTop: 4,
  },
  switchBtnText: {
    fontFamily: fonts.familySemibold,
    fontSize: 12,
    color: colors.muted,
    letterSpacing: 1,
  },
});
