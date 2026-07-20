import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, RefreshControl } from 'react-native';
import MetalCard from '../components/MetalCard';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import EmptyState from '../components/EmptyState';
import { getWorkJournal, getOrderItemsWithNotes } from '../db/queries';
import { getHomeRoute } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';
import { useFocusEffect } from '@react-navigation/native';

function fmtDate(iso) {
  if (!iso) return '';
  return iso.slice(0, 16).replace('T', ' ');
}

export default function WorkJournalScreen({ navigation }) {
  const [entries, setEntries]   = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [itemsMap, setItemsMap] = useState({});

  useFocusEffect(useCallback(() => { load(); }, []));

  const load = () => {
    try { setEntries(getWorkJournal({ limit: 100 })); } catch (e) { console.error(e); }
  };

  const toggleExpand = (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!itemsMap[id]) {
      try {
        const items = getOrderItemsWithNotes(id);
        setItemsMap(prev => ({ ...prev, [id]: items }));
      } catch (e) { console.error(e); }
    }
  };

  const filtered = entries.filter(e => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (e.note || '').toLowerCase().includes(q) ||
      (e.client_name || '').toLowerCase().includes(q) ||
      (e.zone || '').toLowerCase().includes(q)
    );
  });

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Журнал работ" onBack={() => navigation.navigate(getHomeRoute())} />

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="🔍 Поиск по заметке, клиенту, зоне..."
        placeholderTextColor={colors.muted}
      />

      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); setRefreshing(false); }} tintColor={colors.greenLight} />}>
        {filtered.length === 0 ? (
          <EmptyState
            icon="📓"
            title="Заметок пока нет"
            text="Заметки к заказам добавляются через кнопку 📝 в кассе. Заметки к конкретным позициям — долгим тапом на позицию в корзине."
          />
        ) : filtered.map(entry => {
          const isExpanded = expanded === entry.id;
          const items = itemsMap[entry.id] || [];
          const itemsWithNotes = items.filter(i => i.note);
          return (
            <Pressable key={entry.id} onPress={() => toggleExpand(entry.id)}>
              <MetalCard style={styles.entryCard}>
                <View style={styles.entryHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryDate}>{fmtDate(entry.created_at)}</Text>
                    <View style={styles.entryMeta}>
                      {entry.client_name && <Text style={styles.entryClient}>👤 {entry.client_name}</Text>}
                      {entry.zone && <Text style={styles.entryZone}>📍 {entry.zone}</Text>}
                      <Text style={styles.entryMethod}>{entry.method}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.entryTotal}>{entry.total} ₽</Text>
                    <Text style={styles.entryExpand}>{isExpanded ? '▲' : '▼'}</Text>
                  </View>
                </View>

                {/* Заметка к заказу */}
                {entry.note ? (
                  <View style={styles.orderNote}>
                    <Text style={styles.orderNoteLabel}>📝 Заметка к заказу:</Text>
                    <Text style={styles.orderNoteText}>{entry.note}</Text>
                  </View>
                ) : null}

                {/* Позиции с заметками */}
                {isExpanded && (
                  <View style={styles.itemsList}>
                    {items.map((item, i) => (
                      <View key={i} style={styles.itemRow}>
                        <Text style={styles.itemName}>
                          {item.name}{item.size ? ` · ${item.size}` : ''}
                          {item.quantity > 1 ? ` ×${item.quantity}` : ''}
                        </Text>
                        {item.note ? (
                          <Text style={styles.itemNote}>💬 {item.note}</Text>
                        ) : null}
                      </View>
                    ))}
                    {items.length === 0 && (
                      <Text style={styles.noItems}>Позиции не загружены</Text>
                    )}
                  </View>
                )}
              </MetalCard>
            </Pressable>
          );
        })}
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Kassa" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  search: {
    margin: spacing.lg, marginBottom: 0, padding: 12,
    backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, color: colors.text, fontSize: 14, fontFamily: fonts.family,
  },
  entryCard: { marginBottom: 10, padding: 14 },
  entryHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  entryDate: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  entryMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  entryClient: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.greenLight },
  entryZone: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  entryMethod: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  entryTotal: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  entryExpand: { fontSize: 10, color: colors.muted, marginTop: 4 },
  orderNote: {
    marginTop: 10, padding: 10, backgroundColor: 'rgba(61,158,146,0.08)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(61,158,146,0.2)',
  },
  orderNoteLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.greenLight, marginBottom: 4 },
  orderNoteText: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.text, lineHeight: 18 },
  itemsList: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  itemRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.2)' },
  itemName: { fontFamily: fonts.family, fontSize: 13, color: colors.text },
  itemNote: { fontFamily: fonts.familyRegular, fontSize: 12, color: '#7a9be8', marginTop: 2 },
  noItems: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
});
