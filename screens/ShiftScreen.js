import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import { colors, fonts, spacing } from '../constants/theme';

export default function ShiftScreen({ navigation }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);

  const handleStart = () => {
    // Заглушка — позже подключим запрос суммы открытия и запись смены
    navigation.navigate('Dashboard');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
      <MetalCard>
        <Text style={styles.cardTitle}>Открытие смены</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder="ГГГГ-ММ-ДД"
          placeholderTextColor={colors.muted}
        />
        <MetalButton title="Начать работу" variant="action" onPress={handleStart} />
        <MetalButton title="← Назад" variant="back" onPress={() => navigation.navigate('Login')} />
      </MetalCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingTop: 40, paddingBottom: 80, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  cardTitle: {
    fontFamily: fonts.family,
    fontSize: 11,
    letterSpacing: 3,
    color: colors.textDim,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 18,
  },
  input: {
    width: '100%',
    padding: 15,
    backgroundColor: '#07080a',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    fontSize: 16,
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: fonts.family,
  },
});
