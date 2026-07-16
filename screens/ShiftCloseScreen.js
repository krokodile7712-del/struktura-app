import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import { getOpenShift, getShiftSummary, closeShift, getTerms, pluralizeRu } from '../db/queries';
import { clearSession, getHomeRoute } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';

export default function ShiftCloseScreen({ navigation }) {
  const [summary, setSummary] = useState(null);
  const [factCash, setFactCash] = useState('');
  const [closed, setClosed] = useState(false);
  const [terms, setTerms] = useState({ item: 'Товар', client: 'Клиент', order: 'Заказ', category: 'Категория' });

  useEffect(() => {
    try {
      const shift = getOpenShift();
      if (shift) setSummary(getShiftSummary(shift.id));
      setTerms(getTerms());
    } catch (e) { console.error(e); }
  }, []);

  const handleConfirm = () => {
    if (!summary) return;
    try {
      closeShift(summary.shift.id);
      setClosed(true);
    } catch (e) { console.error(e); }
  };

  const handleFinish = () => {
    clearSession();
    navigation.navigate('Login');
  };

  if (!summary) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Закрытие смены" onBack={() => navigation.navigate(getHomeRoute())} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <Text style={styles.emptyText}>Нет открытой смены</Text>
          <MetalButton title="← Назад" variant="back" onPress={() => navigation.navigate(getHomeRoute())} />
        </View>
      </View>
    );
  }

  const factCashNum = parseFloat(factCash) || 0;
  const diff = factCashNum - summary.cashRemaining;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Закрытие смены" onBack={() => navigation.navigate(getHomeRoute())} />
      <ScrollView contentContainerStyle={styles.inner}>
        <MetalCard>
          <Text style={styles.cardTitle}>📋 Итоги смены</Text>
          {summary.employeeName ? (
            <Text style={styles.employeeLabel}>👤 {summary.employeeName}</Text>
          ) : null}

          <Text style={styles.sectionTitle}>{pluralizeRu(terms.order)}</Text>
          <View style={styles.row}><Text style={styles.rowLabel}>💵 Наличные</Text><Text style={styles.rowValue}>{summary.cash} ₽</Text></View>
          <View style={styles.row}><Text style={styles.rowLabel}>💳 Карта</Text><Text style={styles.rowValue}>{summary.card} ₽</Text></View>
          <View style={styles.row}><Text style={styles.rowLabel}>📱 QR</Text><Text style={styles.rowValue}>{summary.qr} ₽</Text></View>
          <View style={[styles.row, styles.totalRow]}>
            <Text style={styles.totalLabel}>ИТОГО ({summary.orders} зак.)</Text>
            <Text style={styles.totalValue}>{summary.total} ₽</Text>
          </View>

          {Object.keys(summary.expByCategory).length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Расходы за день</Text>
              {Object.entries(summary.expByCategory).map(([cat, sum]) => (
                <View key={cat} style={styles.row}>
                  <Text style={styles.rowLabel}>{cat}</Text>
                  <Text style={styles.rowValue}>{sum} ₽</Text>
                </View>
              ))}
              <View style={[styles.row, styles.totalRow]}>
                <Text style={styles.totalLabel}>Расходы итого</Text>
                <Text style={[styles.totalValue, { color: colors.redLight }]}>{summary.expTotal} ₽</Text>
              </View>
            </>
          )}

          <Text style={styles.sectionTitle}>Наличные</Text>
          <View style={styles.row}><Text style={styles.rowLabel}>Было на начало</Text><Text style={styles.rowValue}>{summary.openingCash} ₽</Text></View>
          <View style={[styles.row, styles.expectedRow]}>
            <Text style={styles.expectedLabel}>Ожидаемый остаток</Text>
            <Text style={styles.expectedValue}>{summary.cashRemaining} ₽</Text>
          </View>

          {!closed && (
            <>
              <TextInput
                style={[styles.input, { marginTop: 16 }]}
                placeholder="Фактические наличные в кассе"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                value={factCash}
                onChangeText={setFactCash}
              />
              {factCash !== '' && (
                <Text style={[styles.diffText, { color: diff === 0 ? colors.greenLight : colors.redLight }]}>
                  {diff === 0 ? '✅ Сходится' : diff > 0 ? `Излишек +${diff} ₽` : `Недостача ${diff} ₽`}
                </Text>
              )}
              <MetalButton title="✅ Подтвердить закрытие" variant="success" onPress={handleConfirm} />
            </>
          )}

          {closed && (
            <>
              <Text style={styles.closedText}>✅ Смена закрыта</Text>
              <MetalButton title="Выйти" variant="back" onPress={handleFinish} />
            </>
          )}
        </MetalCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { padding: spacing.lg, paddingBottom: 80, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  emptyText: { fontFamily: fonts.familyRegular, fontSize: 15, color: colors.muted, marginBottom: 20 },
  cardTitle: { fontFamily: fonts.family, fontSize: 11, letterSpacing: 3, color: colors.textDim, textAlign: 'center', textTransform: 'uppercase', marginBottom: 8 },
  employeeLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: 14 },
  sectionTitle: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2, marginTop: 16, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.text },
  rowValue: { fontFamily: fonts.family, fontSize: 14, color: colors.text },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.borderHi, marginTop: 4, borderBottomWidth: 0 },
  totalLabel: { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: colors.text },
  totalValue: { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: colors.text },
  expectedRow: { borderBottomWidth: 0 },
  expectedLabel: { fontFamily: fonts.family, fontSize: 16, fontWeight: '700', color: colors.greenLight },
  expectedValue: { fontFamily: fonts.family, fontSize: 16, fontWeight: '700', color: colors.greenLight },
  input: { width: '100%', padding: 15, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 16, marginBottom: 8, textAlign: 'center', fontFamily: fonts.family },
  diffText: { fontFamily: fonts.familySemibold, fontSize: 14, textAlign: 'center', marginBottom: 12 },
  closedText: { fontFamily: fonts.family, fontSize: 18, color: colors.greenLight, textAlign: 'center', marginVertical: 16 },
});
