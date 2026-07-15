import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, Pressable } from 'react-native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getOpenShift, getBusinessProfile } from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

const MENU_ITEMS = [
  { icon: '☕', label: 'Новый заказ',    screen: 'Kassa',       variant: 'action'  },
  { icon: '👥', label: 'Лояльность',     screen: 'ClientsList', variant: 'pay',     module: 'clients' },
  { icon: '📊', label: 'Продажи',        screen: 'Sales',       variant: 'success' },
  { icon: '📦', label: 'Склад',          screen: 'Stock',       variant: 'default', module: 'stock' },
  { icon: '🧾', label: 'Себестоимость',  screen: 'CostCards',   variant: 'default', module: 'stock' },
  { icon: '💸', label: 'Расходы',        screen: 'Expenses',    variant: 'danger'  },
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

  useEffect(() => {
    try {
      setShift(getOpenShift());
      setModules(getBusinessProfile()?.modules || {});
    } catch (e) { console.error(e); }
  }, []);

  const visibleItems = MENU_ITEMS.filter(item => !item.module || modules[item.module] !== false);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Бариста" onBack={() => navigation.navigate('Login')} />

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
              </Pressable>
            );
          })}
        </View>

        {/* Управление сменой */}
        <View style={styles.shiftRow}>
          {!shift && (
            <Pressable
              style={[styles.shiftBtn, { borderColor: 'rgba(122,158,82,0.5)', backgroundColor: 'rgba(122,158,82,0.10)' }]}
              onPress={() => navigation.navigate('Shift')}
            >
              <Text style={[styles.shiftBtnText, { color: colors.greenLight }]}>📅 Открыть смену</Text>
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
