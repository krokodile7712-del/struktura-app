import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import { colors, fonts, spacing } from '../constants/theme';

// Временные тестовые данные — позже заменим на реальный поиск через SQLite
const MOCK_CLIENTS = [
  { code: 'AB12CD34', fio: 'Иванов Иван', phone: '+79991234567', balance: 320 },
  { code: 'XY99ZZ11', fio: 'Петрова Анна', phone: '+79997654321', balance: 150 },
];

export default function SearchScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const results = query.length >= 2
    ? MOCK_CLIENTS.filter(c => c.fio.toLowerCase().includes(query.toLowerCase()))
    : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
      <MetalCard>
        <Text style={styles.cardTitle}>Поиск клиента</Text>
        <TextInput
          style={styles.input}
          placeholder="Имя, фамилия или телефон"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
        />
        <View style={{ marginTop: 8 }}>
          {results.map((c) => (
            <Pressable
              key={c.code}
              style={styles.resultItem}
              onPress={() => navigation.navigate('ClientCard', { client: c })}
            >
              <Text style={styles.resultName}>{c.fio}</Text>
              <Text style={styles.resultSub}>{c.phone} · <Text style={{ color: colors.greenLight }}>{c.balance} баллов</Text></Text>
            </Pressable>
          ))}
          {query.length >= 2 && results.length === 0 && (
            <Text style={styles.noResults}>Не найдено</Text>
          )}
        </View>
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
  resultItem: {
    padding: 16,
    backgroundColor: '#07090f',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    marginBottom: 10,
  },
  resultName: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text },
  resultSub: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 4 },
  noResults: { textAlign: 'center', color: colors.muted, padding: 12, fontFamily: fonts.familyRegular },
});
