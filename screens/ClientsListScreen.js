import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import MetalCard from '../components/MetalCard';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { colors, fonts, spacing } from '../constants/theme';

const MOCK_CLIENTS = [
  { id: '1', fio: 'Анна Смирнова', code: 'CLI-001', balance: 320, visits: 14, totalSum: 8400, phone: '+7 900 111-22-33' },
  { id: '2', fio: 'Дмитрий Козлов', code: 'CLI-002', balance: 80, visits: 4, totalSum: 2100, phone: '+7 900 444-55-66' },
  { id: '3', fio: 'Мария Иванова', code: 'CLI-003', balance: 560, visits: 27, totalSum: 15800, phone: '+7 900 777-88-99' },
];

export default function ClientsListScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const filtered = MOCK_CLIENTS.filter(c =>
    c.fio.toLowerCase().includes(query.toLowerCase()) || c.code.includes(query)
  );

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Клиенты" onBack={() => navigation.navigate('Dashboard')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          <TextInput
            style={styles.input}
            placeholder="Поиск по имени или коду..."
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
          />
          {filtered.map((client) => (
            <Pressable
              key={client.id}
              style={styles.row}
              onPress={() => navigation.navigate('ClientCard', { client })}
            >
              <View>
                <Text style={styles.name}>{client.fio}</Text>
                <Text style={styles.sub}>{client.code} · {client.visits} визитов</Text>
              </View>
              <Text style={styles.balance}>{client.balance} б</Text>
            </Pressable>
          ))}
        </MetalCard>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Loyalty" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  input: {
    padding: 13, backgroundColor: '#07080a',
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    color: colors.text, fontSize: 14, marginBottom: 14,
    fontFamily: fonts.familyRegular,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  name: { fontFamily: fonts.family, fontSize: 15, color: colors.text },
  sub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  balance: { fontFamily: fonts.family, fontSize: 16, fontWeight: '700', color: colors.greenLight },
});
