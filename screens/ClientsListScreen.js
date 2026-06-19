import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import { colors, fonts, spacing } from '../constants/theme';

const MOCK_CLIENTS = [
  { code: 'AB12CD34', fio: 'Иванов Иван', phone: '+79991234567', balance: 320, visits: 12, lastVisit: '15.06.2026' },
  { code: 'XY99ZZ11', fio: 'Петрова Анна', phone: '+79997654321', balance: 150, visits: 5, lastVisit: '10.06.2026' },
];

export default function ClientsListScreen({ navigation }) {
  const [search, setSearch] = useState('');
  const filtered = MOCK_CLIENTS.filter(c => c.fio.toLowerCase().includes(search.toLowerCase()));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
      <MetalCard>
        <Text style={styles.cardTitle}>👥 Клиенты</Text>
        <TextInput
          style={styles.input}
          placeholder="Поиск по имени или телефону"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
        />
        {filtered.map((c) => (
          <Pressable
            key={c.code}
            style={styles.row}
            onPress={() => navigation.navigate('ClientCard', { client: c })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{c.fio}</Text>
              <Text style={styles.rowSub}>{c.phone} · {c.lastVisit}</Text>
            </View>
            <Text style={styles.rowPts}>{c.balance}</Text>
          </Pressable>
        ))}
        <MetalButton title="← Назад" variant="back" onPress={() => navigation.navigate('Dashboard')} />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowName: { fontFamily: fonts.family, fontSize: 15, fontWeight: '600', color: colors.text },
  rowSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  rowPts: { fontFamily: fonts.family, fontSize: 16, fontWeight: '700', color: colors.greenLight },
});
