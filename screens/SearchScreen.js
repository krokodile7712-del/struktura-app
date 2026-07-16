import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import MetalCard from '../components/MetalCard';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { searchClients, getTerms } from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

export default function SearchScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [terms, setTerms] = useState({ item: 'Товар', client: 'Клиент', order: 'Заказ', category: 'Категория' });

  React.useEffect(() => { try { setTerms(getTerms()); } catch (e) { console.error(e); } }, []);

  const handleSearch = (text) => {
    setQuery(text);
    if (text.length >= 2) {
      try { setResults(searchClients(text)); } catch (e) { setResults([]); }
    } else {
      setResults([]);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={`Поиск: ${terms.client}`} onBack={() => navigation.navigate('Loyalty')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          <TextInput
            style={styles.input}
            placeholder="Имя, фамилия, телефон или код..."
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={handleSearch}
            autoFocus
          />
          {query.length >= 2 && results.length === 0 && (
            <Text style={styles.empty}>{terms.client} не найден</Text>
          )}
          {results.map((client) => (
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
