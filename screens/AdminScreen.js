import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import { colors, fonts, spacing } from '../constants/theme';

export default function AdminScreen({ navigation }) {
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          <Text style={styles.cardTitle}>⚙️ Панель администратора</Text>

          <Text style={styles.section}>Касса</Text>
          <MetalButton title="☕ Касса" variant="action" onPress={() => navigation.navigate('Kassa')} />
          <MetalButton title="📊 Продажи" variant="success" onPress={() => navigation.navigate('Sales')} />
          <MetalButton title="📅 Открыть смену" variant="success" onPress={() => navigation.navigate('Shift')} />
          <MetalButton title="🚪 Закрыть смену" variant="danger" onPress={() => navigation.navigate('ShiftClose')} />

          <Text style={styles.section}>Аналитика</Text>
          <MetalButton title="🧾 Себестоимость" variant="default" onPress={() => navigation.navigate('CostCards')} />
          <MetalButton title="💸 Расходы" variant="default" onPress={() => navigation.navigate('Expenses')} />
          <MetalButton title="📦 Склад" variant="default" onPress={() => navigation.navigate('Stock')} />

          <Text style={styles.section}>Клиенты</Text>
          <MetalButton title="👥 Список клиентов" variant="pay" onPress={() => navigation.navigate('ClientsList')} />
          <MetalButton title="👤 Регистрация" variant="pay" onPress={() => navigation.navigate('Reg')} />

          <MetalButton
            title="← Выйти"
            variant="back"
            onPress={() => navigation.navigate('Login')}
            style={{ marginTop: 20 }}
          />
        </MetalCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: {
    padding: spacing.lg,
    paddingTop: 40,
    paddingBottom: 80,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  cardTitle: {
    fontFamily: fonts.family,
    fontSize: 11,
    letterSpacing: 3,
    color: colors.textDim,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 18,
  },
  section: {
    fontFamily: fonts.familySemibold,
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 20,
    marginBottom: 8,
  },
});
