import React from 'react';
import { View, Text, Image, StyleSheet, ScrollView } from 'react-native';
import MetalButton from '../components/MetalButton';
import BottomBar from '../components/BottomBar';
import { colors, fonts, spacing } from '../constants/theme';

export default function DashboardScreen({ navigation }) {
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <View style={styles.brandHeader}>
          <Image
            source={{ uri: 'https://i.ibb.co/hRZxPz8b/19-20260514150523.png' }}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.roleText}>☕ Бариста · Смена не открыта</Text>
        </View>

        <View style={styles.grid}>
          <MetalButton title="☕ Новый заказ" variant="action" style={styles.gridBtn} onPress={() => navigation.navigate('Kassa')} />
          <MetalButton title="👥 Лояльность" variant="pay" style={styles.gridBtn} onPress={() => navigation.navigate('ClientsList')} />
          <MetalButton title="📊 Продажи" variant="success" style={styles.gridBtn} onPress={() => navigation.navigate('Sales')} />
          <MetalButton title="📦 Склад" variant="default" style={styles.gridBtn} onPress={() => navigation.navigate('Stock')} />
          <MetalButton title="🧾 Себестоимость" variant="default" style={styles.gridBtn} onPress={() => navigation.navigate('CostCards')} />
          <MetalButton title="💸 Расходы" variant="danger" style={styles.gridBtn} onPress={() => navigation.navigate('Expenses')} />
        </View>

        <MetalButton title="🔄 Сменить аккаунт" variant="back" onPress={() => {}} />
        <MetalButton title="🚪 Закрыть смену" variant="danger" onPress={() => navigation.navigate('ShiftClose')} />
        <MetalButton title="📅 Открыть смену" variant="success" onPress={() => navigation.navigate('Shift')} />
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Login" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: {
    padding: spacing.lg,
    paddingBottom: 80,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  brandHeader: { alignItems: 'center', paddingVertical: 24 },
  logo: { width: 240, height: 130, borderRadius: 14, marginBottom: 10 },
  roleText: {
    fontFamily: fonts.familySemibold,
    fontSize: 13,
    letterSpacing: 2,
    color: colors.muted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginVertical: 16,
  },
  gridBtn: {
    width: '30%',
    minWidth: 140,
    aspectRatio: 1,
  },
});
