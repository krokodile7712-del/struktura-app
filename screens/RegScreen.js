import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import { colors, fonts, spacing } from '../constants/theme';

export default function RegScreen({ navigation }) {
  const [fio, setFio] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = () => {
    if (!fio.trim()) return;
    // Заглушка — позже подключим google.script.run эквивалент (Apps Script Web API)
    navigation.navigate('RegResult', { fio, phone, code: 'TEMP1234AB' });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
      <MetalCard>
        <Text style={styles.cardTitle}>Новый клиент</Text>
        <TextInput
          style={styles.input}
          placeholder="Фамилия Имя"
          placeholderTextColor={colors.muted}
          value={fio}
          onChangeText={setFio}
        />
        <TextInput
          style={styles.input}
          placeholder="Номер телефона"
          placeholderTextColor={colors.muted}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        <MetalButton title="Создать карту" variant="action" onPress={handleSubmit} />
        <MetalButton title="← Назад" variant="back" onPress={() => navigation.navigate('Loyalty')} />
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
