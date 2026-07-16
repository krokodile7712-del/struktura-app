import React, { useState, useEffect } from 'react';
import { getHomeRoute } from '../db/session';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getAllCostCards, deleteCostCard, getTerms, genitiveSingularRu } from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

function cardCost(card) {
  return card.ingredients.reduce((sum, i) => sum + i.amount * i.price_per_unit, 0);
}

export default function CostCardsScreen({ navigation }) {
  const [cards, setCards] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [terms, setTerms] = useState({ item: 'Товар', client: 'Клиент', order: 'Заказ', category: 'Категория' });

  useEffect(() => { loadCards(); try { setTerms(getTerms()); } catch (e) { console.error(e); } }, []);

  const loadCards = () => {
    try { setCards(getAllCostCards()); } catch (e) { console.error(e); }
  };

  const handleDelete = (id) => {
    try { deleteCostCard(id); loadCards(); } catch (e) { console.error(e); }
    setExpandedId(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Себестоимость" onBack={() => navigation.navigate(getHomeRoute())} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          <Text style={styles.hint}>
            Только просмотр. Создавать и редактировать техкарты нужно через Настройки → Меню и цены → карточка {genitiveSingularRu(terms.item).toLowerCase()} (там же выбираются ингредиенты со склада и размер, к которому привязана техкарта).
          </Text>
          <Text style={styles.sectionTitle}>Техкарты ({cards.length})</Text>
          {cards.length === 0 && (
            <Text style={styles.empty}>Пока ни одной техкарты не создано.</Text>
          )}
          {cards.map(card => {
            const isOpen = expandedId === card.id;
            const cost = cardCost(card);
            const linked = !!card.product_id;
            return (
              <View key={card.id}>
                <Pressable style={styles.row} onPress={() => setExpandedId(isOpen ? null : card.id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{linked ? '' : '⚠️ '}{card.name}</Text>
                    {!linked && <Text style={styles.unlinkedHint}>Не привязана к {genitiveSingularRu(terms.item).toLowerCase()}</Text>}
                  </View>
                  <Text style={styles.rowPrice}>{cost.toFixed(2)} ₽ ›</Text>
                </Pressable>
                {isOpen && (
                  <View style={styles.detail}>
                    {card.ingredients.map((ing, idx) => (
                      <View key={idx} style={styles.detailRow}>
                        <Text style={styles.detailName}>{ing.name} ({ing.amount} {ing.unit})</Text>
                        <Text style={styles.detailPrice}>{(ing.amount * ing.price_per_unit).toFixed(2)} ₽</Text>
                      </View>
                    ))}
                    {card.ingredients.length === 0 && (
                      <Text style={styles.detailName}>Ингредиенты не заданы</Text>
                    )}
                    <MetalButton title="🗑 Удалить техкарту" variant="danger" onPress={() => handleDelete(card.id)} style={{ marginTop: 8 }} />
                  </View>
                )}
              </View>
            );
          })}
        </MetalCard>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Kassa" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  sectionTitle: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8, marginTop: 12 },
  hint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginBottom: 8, lineHeight: 17 },
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowName: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.text },
  unlinkedHint: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.redLight, marginTop: 2 },
  rowPrice: { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: colors.text },
  detail: { paddingLeft: 12, paddingVertical: 6 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  detailName: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.textDim },
  detailPrice: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.textDim },
});
