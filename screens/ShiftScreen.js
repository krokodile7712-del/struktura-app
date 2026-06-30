import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import { openShift } from '../db/queries';
import { getSession } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';

export default function ShiftScreen({ navigation }) {
  const [cashOpen, setCashOpen] = useState('');
  const [error, setError] = useState('');

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2,'0')}.${String(today.getMonth()+1).padStart(2,'0')}.${today.getFullYear()}`;

  const handleOpen = () => {
    const cash = parseFloat(cashOpen) || 0;
    try {
      openShift(cash);
      const user = getSession();
      if (user?.role === 'admin') {
        navigation.navigate('Admin');
      } else {
        navigation.navigate('Dashboard');
      }
    } catch (e) {
      setError('Ошибка открытия смены: ' + e.message);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Открытие смены" />
      <ScrollView contentContainerStyle={styles.inner}>
        <MetalCard>
          <Text style={styles.dateText}>📅 {dateStr}</Text>

          <Text style={styles.label}>Наличные в кассе на начало смены</Text>
          <TextInput
            style={styles.input}
            placeholder="0 ₽"
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            value={cashOpen}
            onChangeText={v => { setCashOpen(v); setError(''); }}
            autoFocus
          />

          {error !== '' && <Text style={styles.error}>{error}</Text>}

          <MetalButton title="▶ Открыть смену" variant="action" onPress={handleOpen} />
        </MetalCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { padding: spacing.lg, paddingBottom: 80, maxWidth: 900, width: '100%', alignSelf: 'center' },
  dateText: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text, textAlign: 'center', marginBottom: 20 },
  label: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 },
  input: {
    width: '100%', padding: 18, backgroundColor: '#07080a',
    borderWidth: 1, borderColor: colors.border, borderRadius: 14,
    color: colors.text, fontSize: 28, marginBottom: 16,
    textAlign: 'center', fontFamily: fonts.family,
  },
  error: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.red, textAlign: 'center', marginBottom: 10 },
});
