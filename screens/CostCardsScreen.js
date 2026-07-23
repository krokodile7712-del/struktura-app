import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput } from 'react-native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import EmptyState from '../components/EmptyState';
import InfoTip from '../components/InfoTip';
import { useFocusEffect } from '@react-navigation/native';
import {
  getAllCostCards, deleteCostCard, getTerms, genitiveSingularRu,
  fixCostCardLinks, refreshCostCardPrices, getAllStock,
  saveCostCardForVariant, saveCostCardForProductSize,
} from '../db/queries';
import { getDb } from '../db/database';
import { getHomeRoute } from '../db/session';
import { colors, fonts } from '../constants/theme';

const fmt = n => (n || 0).toFixed(2);

function cardCost(card) {
  return card.ingredients.reduce((s, i) => s + i.amount * (i.price_per_unit || 0), 0);
}

export default function CostCardsScreen({ navigation }) {
  const [cards, setCards]     = useState([]);
  const [stock, setStock]     = useState([]);
  const [terms, setTerms]     = useState({});
  const [editCard, setEditCard]   = useState(null); // карта в редактировании
  const [ingPicker, setIngPicker] = useState(false);
  const [ingSearch, setIngSearch] = useState('');

  const load = useCallback(() => {
    try {
      fixCostCardLinks();
      refreshCostCardPrices();
      setCards(getAllCostCards());
      setStock(getAllStock());
      setTerms(getTerms());
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Открыть редактор
  const openEdit = (card) => {
    setEditCard({
      ...card,
      ingredients: card.ingredients.map(i => ({
        ...i,
        amount: String(i.amount),
        price_per_unit: String(i.price_per_unit || ''),
      })),
    });
  };

  // Сохранить
  const saveCard = () => {
    if (!editCard) return;
    try {
      const ings = editCard.ingredients
        .filter(i => i.name && parseFloat(i.amount) > 0)
        .map(i => ({
          name: i.name,
          amount: parseFloat(i.amount) || 0,
          unit: i.unit,
          pricePerUnit: parseFloat(i.price_per_unit) || 0,
          factor: 1,
        }));

      const db = getDb();
      // Удаляем старые ингредиенты
      db.runSync(`DELETE FROM cost_ingredients WHERE cost_card_id = ?`, [editCard.id]);
      // Вставляем новые
      for (const ing of ings) {
        db.runSync(
          `INSERT INTO cost_ingredients (cost_card_id, name, amount, unit, price_per_unit, factor) VALUES (?, ?, ?, ?, ?, ?)`,
          [editCard.id, ing.name, ing.amount, ing.unit, ing.pricePerUnit, ing.factor]
        );
      }
      load();
      setEditCard(null);
    } catch (e) { console.error(e); }
  };

  // Добавить ингредиент из склада
  const addIngredient = (stockItem) => {
    setEditCard(m => ({
      ...m,
      ingredients: [...m.ingredients, {
        name: stockItem.name,
        amount: '',
        unit: stockItem.unit,
        price_per_unit: String(stockItem.avg_price || stockItem.last_price || ''),
      }],
    }));
    setIngPicker(false);
    setIngSearch('');
  };

  const filteredStock = stock.filter(s =>
    !ingSearch.trim() || s.name.toLowerCase().includes(ingSearch.toLowerCase())
  );

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Техкарты"
        onBack={() => navigation.navigate(getHomeRoute())}
        rightElement={
          <InfoTip
            title="Себестоимость"
            text="Список ингредиентов которые списываются со склада при каждой продаже. Редактируйте прямо здесь — нажмите на карту."
          />
        }
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.inner}>
        {cards.length === 0 ? (
          <EmptyState icon="🧾" title="Техкарт нет"
            text="Создайте техкарту в Настройки → Меню и цены → откройте карточку товара → Техкарта." />
        ) : (
          cards.map((card, idx) => {
            const cost = cardCost(card);
            const linked = !!(card.product_id || card.variant_id);
            return (
              <Pressable
                key={card.id}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
                onPress={() => openEdit(card)}
              >
                <View style={styles.cardHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{linked ? '' : '⚠️ '}{card.name}</Text>
                    <Text style={styles.cardSub}>{card.ingredients.length} ингр.</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.cardCost}>{fmt(cost)} ₽</Text>
                    <Text style={styles.cardEdit}>Изменить ›</Text>
                  </View>
                </View>

                {/* Список ингредиентов */}
                {card.ingredients.length > 0 && (
                  <View style={styles.ingList}>
                    {card.ingredients.map((ing, i) => (
                      <View key={i} style={[styles.ingRow, i < card.ingredients.length - 1 && styles.ingDiv]}>
                        <Text style={styles.ingName}>{ing.name}</Text>
                        <Text style={styles.ingAmt}>{ing.amount} {ing.unit}</Text>
                        <Text style={styles.ingCost}>{fmt(ing.amount * (ing.price_per_unit || 0))} ₽</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <BottomBar navigation={navigation} activeTab="Kassa" />

      {/* Модалка редактирования */}
      <Modal visible={!!editCard} transparent animationType="fade" onRequestClose={() => setEditCard(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setEditCard(null)} />
          {editCard && (
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>{editCard.name}</Text>
                  <Text style={styles.modalSub}>Себестоимость: {fmt(editCard.ingredients.reduce((s,i) => s + (parseFloat(i.amount)||0)*(parseFloat(i.price_per_unit)||0), 0))} ₽</Text>
                </View>
                <Pressable onPress={() => setEditCard(null)} hitSlop={14} style={styles.closeBtn}>
                  <Text style={styles.closeTxt}>✕</Text>
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">

                {/* Список ингредиентов */}
                {editCard.ingredients.length === 0 && (
                  <Text style={styles.emptyHint}>Ингредиенты не добавлены</Text>
                )}

                {editCard.ingredients.map((ing, idx) => (
                  <View key={idx} style={styles.editIngRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ingName}>{ing.name}</Text>
                      <Text style={styles.ingUnit}>{ing.unit}</Text>
                    </View>
                    <TextInput
                      color={colors.text}
                      style={styles.ingInput}
                      keyboardType="numeric"
                      value={ing.amount}
                      onChangeText={v => {
                        const rows = [...editCard.ingredients];
                        rows[idx] = { ...rows[idx], amount: v };
                        setEditCard(m => ({ ...m, ingredients: rows }));
                      }}
                      placeholder="0"
                      placeholderTextColor={colors.muted}
                    />
                    <TextInput
                      color={colors.text}
                      style={[styles.ingInput, { width: 70 }]}
                      keyboardType="numeric"
                      value={ing.price_per_unit}
                      onChangeText={v => {
                        const rows = [...editCard.ingredients];
                        rows[idx] = { ...rows[idx], price_per_unit: v };
                        setEditCard(m => ({ ...m, ingredients: rows }));
                      }}
                      placeholder="цена"
                      placeholderTextColor={colors.muted}
                    />
                    <Text style={styles.ingUnit}>₽/{ing.unit}</Text>
                    <Pressable
                      hitSlop={10}
                      onPress={() => setEditCard(m => ({ ...m, ingredients: m.ingredients.filter((_,i) => i !== idx) }))}
                    >
                      <Text style={{ color: colors.muted, fontSize: 18 }}>✕</Text>
                    </Pressable>
                  </View>
                ))}

                {/* Добавить ингредиент */}
                <Pressable style={styles.addIngBtn} onPress={() => setIngPicker(true)}>
                  <Text style={styles.addIngTxt}>+ Добавить ингредиент со склада</Text>
                </Pressable>

                {/* Сохранить */}
                <Pressable
                  style={({ pressed }) => [styles.confirmBtn, { marginTop: 16 }, pressed && { opacity: 0.88 }]}
                  onPress={saveCard}
                >
                  <Text style={styles.confirmBtnTxt}>Сохранить</Text>
                </Pressable>

                {/* Удалить */}
                <Pressable
                  style={{ paddingVertical: 14, alignItems: 'center', marginTop: 4 }}
                  onPress={() => { deleteCostCard(editCard.id); load(); setEditCard(null); }}
                >
                  <Text style={{ fontFamily: fonts.familySemibold, fontSize: 14, color: colors.redLight }}>Удалить техкарту</Text>
                </Pressable>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* Пикер ингредиентов со склада */}
      <Modal visible={ingPicker} transparent animationType="fade" onRequestClose={() => setIngPicker(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setIngPicker(false)} />
          <View style={[styles.modalBox, { maxHeight: '75%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Выбрать ингредиент</Text>
              <Pressable onPress={() => setIngPicker(false)} hitSlop={14} style={styles.closeBtn}>
                <Text style={styles.closeTxt}>✕</Text>
              </Pressable>
            </View>
            <View style={{ padding: 12 }}>
              <TextInput
                color={colors.text}
                style={styles.searchInput}
                value={ingSearch}
                onChangeText={setIngSearch}
                placeholder="Поиск..."
                placeholderTextColor={colors.muted}
                autoFocus
              />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {filteredStock.map((s, idx) => (
                <Pressable
                  key={s.id}
                  style={({ pressed }) => [
                    styles.stockRow,
                    idx < filteredStock.length - 1 && styles.ingDiv,
                    pressed && { backgroundColor: 'rgba(255,255,255,0.03)' },
                  ]}
                  onPress={() => addIngredient(s)}
                >
                  <Text style={styles.ingName}>{s.name}</Text>
                  <Text style={styles.ingUnit}>{s.остаток} {s.unit}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { padding: 16, paddingBottom: 24 },

  card: { backgroundColor: '#0b0c0f', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', marginBottom: 10, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  cardName: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  cardSub:  { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  cardCost: { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: colors.greenLight },
  cardEdit: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, marginTop: 2 },

  ingList: { borderTopWidth: 1, borderTopColor: 'rgba(74,77,84,0.2)' },
  ingRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, gap: 8 },
  ingDiv:  { borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.15)' },
  ingName: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, flex: 1 },
  ingAmt:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  ingCost: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text, width: 60, textAlign: 'right' },
  ingUnit: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },

  emptyHint: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', paddingVertical: 20 },

  editIngRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.2)' },
  ingInput:  { width: 80, padding: 8, backgroundColor: '#07080a', borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', borderRadius: 10, color: colors.text, fontFamily: fonts.family, fontSize: 14, textAlign: 'center' },

  addIngBtn: { paddingVertical: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(74,77,84,0.2)', marginTop: 8 },
  addIngTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.greenLight },

  stockRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
  searchInput: { padding: 10, backgroundColor: '#07080a', borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', borderRadius: 12, color: colors.text, fontFamily: fonts.family, fontSize: 14 },

  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox:  { width: '50%', maxHeight: '88%', backgroundColor: '#0e0f11', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(74,77,84,0.5)', overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.3)' },
  modalTitle: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text },
  modalSub:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(74,77,84,0.25)', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  closeTxt: { fontSize: 13, color: colors.text, fontFamily: fonts.familySemibold },

  confirmBtn:    { paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(61,158,146,0.85)', alignItems: 'center' },
  confirmBtnTxt: { fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: '#fff' },
});
