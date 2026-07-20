import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import InfoTip from '../components/InfoTip';
import Hint from '../components/Hint';
import { getOpenShift, getShiftSummary, closeShift, getTerms, pluralizeRu, getPayMethods } from '../db/queries';
import { clearSession, getHomeRoute } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';

export default function ShiftCloseScreen({ navigation }) {
  const [summary, setSummary]     = useState(null);
  const [factCash, setFactCash]   = useState('');
  const [closed, setClosed]       = useState(false);
  const [terms, setTerms]         = useState({ item: 'Товар', client: 'Клиент', order: 'Заказ', category: 'Категория' });
  const [payMethods, setPayMethods] = useState([]);

  useEffect(() => {
    try {
      const shift = getOpenShift();
      if (shift) setSummary(getShiftSummary(shift.id));
      setTerms(getTerms());
      setPayMethods(getPayMethods());
    } catch (e) { console.error(e); }
  }, []);

  const handleConfirm = () => {
    if (!summary) return;
    try { closeShift(summary.shift.id); setClosed(true); } catch (e) { console.error(e); }
  };

  const handleFinish = () => { clearSession(); navigation.navigate('Login'); };

  if (!summary) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Закрытие смены" onBack={() => navigation.navigate(getHomeRoute())} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <Text style={styles.emptyIcon}>🏁</Text>
          <Text style={styles.emptyTitle}>Смена не открыта</Text>
          <Text style={styles.emptyText}>Нечего закрывать — сначала откройте новую смену через кнопку «Открыть смену» на главном экране.</Text>
          <MetalButton title="← Назад" variant="back" onPress={() => navigation.navigate(getHomeRoute())} />
        </View>
      </View>
    );
  }

  const factCashNum = parseFloat(factCash) || 0;
  const diff = factCashNum - summary.cashRemaining;

  // Группируем оплаты по типу
  const cashLabel  = payMethods.find(m => m.type === 'cash')?.name  || 'Наличные';
  const cardLabel  = payMethods.filter(m => m.type === 'card').map(m => m.name).join(' / ') || 'Карта';

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Конец рабочего дня" onBack={() => navigation.navigate(getHomeRoute())} />
      <ScrollView contentContainerStyle={styles.inner}>
        <MetalCard>
          <Text style={styles.cardTitle}>📋 Итоги смены</Text>
          {summary.employeeName ? (
            <Text style={styles.employeeLabel}>👤 {summary.employeeName}</Text>
          ) : null}

          {/* Продажи */}
          <Text style={styles.sectionTitle}>{pluralizeRu(terms.order)}</Text>
          {summary.cash > 0 && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>💵 {cashLabel}</Text>
              <Text style={styles.rowValue}>{summary.cash.toLocaleString('ru-RU')} ₽</Text>
            </View>
          )}
          {summary.card > 0 && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>💳 {cardLabel}</Text>
              <Text style={styles.rowValue}>{summary.card.toLocaleString('ru-RU')} ₽</Text>
            </View>
          )}
          <View style={[styles.row, styles.totalRow]}>
            <Text style={styles.totalLabel}>Всего  ·  {summary.orders} {summary.orders === 1 ? terms.order.toLowerCase() : pluralizeRu(terms.order).toLowerCase()}</Text>
            <Text style={styles.totalValue}>{summary.total.toLocaleString('ru-RU')} ₽</Text>
          </View>

          {/* Расходы */}
          {Object.keys(summary.expByCategory).length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Расходы за день</Text>
              {Object.entries(summary.expByCategory).map(([cat, sum]) => (
                <View key={cat} style={styles.row}>
                  <Text style={styles.rowLabel}>{cat}</Text>
                  <Text style={styles.rowValue}>{sum.toLocaleString('ru-RU')} ₽</Text>
                </View>
              ))}
              <View style={[styles.row, styles.totalRow]}>
                <Text style={styles.totalLabel}>Расходы итого</Text>
                <Text style={[styles.totalValue, { color: colors.redLight }]}>{summary.expTotal.toLocaleString('ru-RU')} ₽</Text>
              </View>
            </>
          )}

          {/* Наличные — сверка кассы */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 6 }}>
            <Text style={styles.sectionTitle}>Сверка наличных</Text>
            <InfoTip
              title="Зачем считать наличные?"
              text="В конце смены вы пересчитываете купюры в кассе. Система показывает сколько должно быть — если цифры расходятся, это сигнал о возможной ошибке или недостаче. Это стандартная процедура в любом бизнесе."
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Было в кассе в начале</Text>
            <Text style={styles.rowValue}>{summary.openingCash.toLocaleString('ru-RU')} ₽</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>+ Наличных принято</Text>
            <Text style={styles.rowValue}>{summary.cash.toLocaleString('ru-RU')} ₽</Text>
          </View>
          <View style={[styles.row, styles.expectedRow]}>
            <Text style={styles.expectedLabel}>Должно быть в кассе</Text>
            <Text style={styles.expectedValue}>{summary.cashRemaining.toLocaleString('ru-RU')} ₽</Text>
          </View>

          {!closed && (
            <>
              <TextInput
                style={[styles.input, { marginTop: 16 }]}
                placeholder="Пересчитайте купюры и введите сумму"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                value={factCash}
                onChangeText={setFactCash}
              />
              <Hint>Необязательно. Если не знаете точно — оставьте пустым и просто закройте смену.</Hint>

              {factCash !== '' && (
                <View style={[styles.diffBox, { borderColor: diff === 0 ? 'rgba(61,158,146,0.4)' : 'rgba(160,16,32,0.4)', backgroundColor: diff === 0 ? 'rgba(61,158,146,0.08)' : 'rgba(160,16,32,0.08)' }]}>
                  <Text style={[styles.diffText, { color: diff === 0 ? colors.greenLight : colors.redLight }]}>
                    {diff === 0 ? '✅ Касса сходится — всё верно' :
                     diff > 0 ? `⚠️ Излишек +${diff.toLocaleString('ru-RU')} ₽ — в кассе больше чем ожидалось` :
                                `⚠️ Недостача ${diff.toLocaleString('ru-RU')} ₽ — в кассе меньше чем ожидалось`}
                  </Text>
                </View>
              )}

              <MetalButton title="✅ Закрыть смену и завершить день" variant="success" onPress={handleConfirm} style={{ marginTop: 12 }} />
            </>
          )}

          {closed && (
            <>
              <View style={styles.closedBox}>
                <Text style={styles.closedTitle}>✅ Смена закрыта</Text>
                <Text style={styles.closedSub}>Данные сохранены. Хорошего отдыха!</Text>
              </View>
              <MetalButton title="Выйти из аккаунта" variant="back" onPress={handleFinish} />
            </>
          )}
        </MetalCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { padding: spacing.lg, paddingBottom: 80, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontFamily: fonts.family, fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptyText: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20, marginBottom: 20, maxWidth: 320 },
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
  input: { width: '100%', padding: 15, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 16, textAlign: 'center', fontFamily: fonts.family },
  diffBox: { padding: 12, borderRadius: 12, borderWidth: 1, marginTop: 8, marginBottom: 4 },
  diffText: { fontFamily: fonts.familySemibold, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  closedBox: { alignItems: 'center', paddingVertical: 20 },
  closedTitle: { fontFamily: fonts.family, fontSize: 22, color: colors.greenLight, fontWeight: '700', marginBottom: 6 },
  closedSub: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted },
});
