import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { colors, fonts, spacing } from '../constants/theme';

const MOCK_SUMMARY = { cash: 4200, card: 6800, inkass: 0, openingCash: 1000, total: 11000, остаток: 5200 };

export default function ShiftCloseScreen({ navigation }) {
  const [factCash, setFactCash] = useState('');

  const handleConfirm = () => {
    navigation.navigate('Loyalty');
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Закрытие смены" onBack={() => navigation.navigate('Dashboard')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          <Text style={styles.cardTitle}>📋 Итоги смены</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>💵 Наличные (продажи)</Text>
            <Text style={styles.rowValue}>{MOCK_SUMMARY.cash} ₽</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>💳 Безнал</Text>
            <Text style={styles.rowValue}>{MOCK_SUMMARY.card} ₽</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>📤 Инкассировано</Text>
            <Text style={styles.rowValue}>{MOCK_SUMMARY.inkass} ₽</Text>
          </View>
          <View style={[styles.row, styles.totalRow]}>
            <Text style={styles.totalLabel}>ИТОГО</Text>
            <Text style={styles.totalValue}>{MOCK_SUMMARY.total} ₽</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabelMuted}>Наличные на открытие</Text>
            <Text style={styles.rowValue}>{MOCK_SUMMARY.openingCash} ₽</Text>
          </View>
          <View style={[styles.row, styles.expectedRow]}>
            <Text style={styles.expectedLabel}>Ожидаемый остаток</Text>
            <Text style={styles.expectedValue}>{MOCK_SUMMARY.остаток} ₽</Text>
          </View>
          <TextInput
            style={[styles.input, { marginTop: 16 }]}
            placeholder="Фактические наличные в кассе"
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            value={factCash}
            onChangeText={setFactCash}
          />
          <MetalButton title="✅ Подтвердить закрытие" variant="success" onPress={handleConfirm} />
        </MetalCard>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Login" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  cardTitle: {
    fontFamily: fonts.family, fontSize: 11, letterSpacing: 3,
    color: colors.textDim, textAlign: 'center', textTransform: 'uppercase', marginBottom: 18,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.text },
  rowLabelMuted: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted },
  rowValue: { fontFamily: fonts.family, fontSize: 14, color: colors.text },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.borderHi, marginTop: 6 },
  totalLabel: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text },
  totalValue: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text },
  expectedRow: { borderBottomWidth: 0 },
  expectedLabel: { fontFamily: fonts.family, fontSize: 16, fontWeight: '700', color: colors.greenLight },
  expectedValue: { fontFamily: fonts.family, fontSize: 16, fontWeight: '700', color: colors.greenLight },
  input: {
    width: '100%', padding: 15, backgroundColor: '#07080a',
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    color: colors.text, fontSize: 16, marginBottom: 12,
    textAlign: 'center', fontFamily: fonts.family,
  },
});
