import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import Hint from '../components/Hint';
import { openShift, getOpenShift } from '../db/queries';
import { getSession } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';

export default function ShiftScreen({ navigation }) {
  const [cashOpen, setCashOpen] = useState('');
  const [error, setError] = useState('');

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2,'0')}.${String(today.getMonth()+1).padStart(2,'0')}.${today.getFullYear()}`;

  useEffect(() => {
    try {
      if (getOpenShift()) {
        const user = getSession();
        navigation.replace(user?.role === 'admin' ? 'Admin' : 'Dashboard');
      }
    } catch (e) { console.error(e); }
  }, []);

  const handleOpen = () => {
    const cash = parseFloat(cashOpen) || 0;
    try {
      const user = getSession();
      openShift(cash, user?.id || null, user?.name || '');
      navigation.navigate(user?.role === 'admin' ? 'Admin' : 'Dashboard');
    } catch (e) {
      setError('Не удалось открыть смену: ' + e.message);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Начало рабочего дня" />
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={styles.dateText}>📅 {dateStr}</Text>
        <Text style={styles.subtitle}>Прежде чем начать принимать заказы, откройте смену</Text>

        <MetalCard style={{ marginTop: 16 }}>
          <Text style={styles.label}>Наличные в кассе сейчас, ₽</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            value={cashOpen}
            onChangeText={v => { setCashOpen(v); setError(''); }}
            autoFocus
          />
          <Hint>
            Пересчитайте купюры в кассе и введите сумму. Это нужно чтобы в конце дня сравнить — сколько должно быть и сколько есть на самом деле. Если не знаете точно — введите 0, это не обязательное поле.
          </Hint>

          {error !== '' && <Text style={styles.error}>⚠️ {error}</Text>}

          <MetalButton title="▶ Начать рабочий день" variant="action" onPress={handleOpen} />
        </MetalCard>

        <MetalCard style={{ marginTop: 12 }}>
          <Text style={styles.infoTitle}>Что такое смена?</Text>
          <Text style={styles.infoText}>
            Смена — это один рабочий период (обычно один день). В течение смены записываются все продажи, расходы и действия сотрудников. В конце смены вы увидите итоговый отчёт: выручка, средний чек, способы оплаты.
          </Text>
        </MetalCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { padding: spacing.lg, paddingBottom: 80, maxWidth: 700, width: '100%', alignSelf: 'center' },
  dateText: { fontFamily: fonts.familySemibold, fontSize: 18, color: colors.text, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  label: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 },
  input: {
    width: '100%', padding: 18, backgroundColor: '#07080a',
    borderWidth: 1, borderColor: colors.border, borderRadius: 14,
    color: colors.text, fontSize: 32, marginBottom: 4,
    textAlign: 'center', fontFamily: fonts.family,
  },
  error: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.redLight, textAlign: 'center', marginBottom: 10 },
  infoTitle: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginBottom: 8 },
  infoText: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, lineHeight: 20 },
});
