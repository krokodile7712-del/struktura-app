import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import MetalCard from '../components/MetalCard';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getAllClients, searchClients } from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

export default function ClientsListScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState([]);

  useEffect(() => { loadClients(); }, []);

  const loadClients = () => {
    try { setClients(getAllClients()); } catch (e) { console.error(e); }
  };

  const filtered = query.length >= 1 ? searchClients(query) : clients;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Клиенты" onBack={() => navigation.navigate('Dashboard')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          <TextInput
            style={styles.input}
            placeholder="Поиск по имени, коду, телефону..."
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
          />
          {filtered.length === 0 && (
            <Text style={styles.empty}>
              {clients.length === 0 ? 'Нет клиентов. Выполните импорт из Sheets.' : 'Ничего не найдено'}
            </Text>
          )}
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
  input: { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 14, marginBottom: 14, fontFamily: fonts.familyRegular },
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { fontFamily: fonts.family, fontSize: 15, color: colors.text },
  sub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  balance: { fontFamily: fonts.family, fontSize: 16, fontWeight: '700', color: colors.greenLight },
});
