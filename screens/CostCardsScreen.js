import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getAllCostCards, insertCostCard } from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

function cardCost(card) {
  return card.ingredients.reduce((sum, i) => sum + i.amount * i.price_per_unit, 0);
}

export default function CostCardsScreen({ navigation }) {
  const [cards, setCards] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [ingName, setIngName] = useState('');
  const [ingAmount, setIngAmount] = useState('');
  const [ingUnit, setIngUnit] = useState('г');
  const [ingPrice, setIngPrice] = useState('');
  const [draftIngredients, setDraftIngredients] = useState([]);

  useEffect(() => { loadCards(); }, []);

  const loadCards = () => {
    try { setCards(getAllCostCards()); } catch (e) { console.error(e); }
  };

  const resetForm = () => {
    setNewName(''); setIngName(''); setIngAmount('');
    setIngUnit('г'); setIngPrice(''); setDraftIngredients([]);
    setAdding(false);
  };

  const addIngredientToDraft = () => {
    if (!ingName.trim() || !ingAmount || !ingPrice) return;
    setDraftIngredients(prev => [...prev, {
      name: ingName.trim(), amount: parseFloat(ingAmount),
      unit: ingUnit, pricePerUnit: parseFloat(ingPrice),
    }]);
    setIngName(''); setIngAmount(''); setIngPrice('');
  };

  const saveCard = () => {
    if (!newName.trim() || draftIngredients.length === 0) return;
    try {
      insertCostCard(newName.trim(), draftIngredients);
      loadCards();
    } catch (e) { console.error(e); }
    resetForm();
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Себестоимость" onBack={() => navigation.navigate('Dashboard')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          {!adding && (
            <MetalButton title="+ Новая техкарта" variant="action" onPress={() => setAdding(true)} />
          )}
          {adding && (
            <View style={styles.form}>
              <Text style={styles.sectionTitle}>Название</Text>
              <TextInput style={styles.input} placeholder="Напр. Капучино S" placeholderTextColor={colors.muted} value={newName} onChangeText={setNewName} />
              <Text style={styles.sectionTitle}>Ингредиенты</Text>
              {draftIngredients.map((ing, idx) => (
                <View key={idx} style={styles.row}>
                  <Text style={styles.rowName}>{ing.name} {ing.amount}{ing.unit}</Text>
                  <Text style={styles.rowPrice}>{(ing.amount * ing.pricePerUnit).toFixed(2)} ₽</Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[styles.input, { flex: 2 }]} placeholder="Ингредиент" placeholderTextColor={colors.muted} value={ingName} onChangeText={setIngName} />
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Кол-во" placeholderTextColor={colors.muted} keyboardType="numeric" value={ingAmount} onChangeText={setIngAmount} />
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Ед." placeholderTextColor={colors.muted} value={ingUnit} onChangeText={setIngUnit} />
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="₽/ед." placeholderTextColor={colors.muted} keyboardType="numeric" value={ingPrice} onChangeText={setIngPrice} />
              </View>
              <MetalButton title="+ Ингредиент" variant="default" onPress={addIngredientToDraft} />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <MetalButton title="Сохранить" variant="success" onPress={saveCard} style={{ flex: 1 }} />
                <MetalButton title="Отмена" variant="back" onPress={resetForm} style={{ flex: 1 }} />
              </View>
            </View>
          )}

          <Text style={styles.sectionTitle}>Техкарты ({cards.length})</Text>
          {cards.length === 0 && (
            <Text style={styles.empty}>Нет данных. Выполните импорт из Sheets или добавьте вручную.</Text>
          )}
          {cards.map(card => {
            const isOpen = expandedId === card.id;
            const cost = cardCost(card);
            return (
              <Pressable key={card.id} onPress={() => setExpandedId(isOpen ? null : card.id)}>
                <View style={styles.row}>
                  <Text style={styles.rowName}>{card.name}</Text>
                  <Text style={styles.rowPrice}>{cost.toFixed(2)} ₽</Text>
                </View>
                {isOpen && (
                  <View style={styles.detail}>
                    {card.ingredients.map((ing, idx) => (
                      <View key={idx} style={styles.detailRow}>
                        <Text style={styles.detailName}>{ing.name} ({ing.amount} {ing.unit})</Text>
                        <Text style={styles.detailPrice}>{(ing.amount * ing.price_per_unit).toFixed(2)} ₽</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Pressable>
            );
          })}
        </MetalCard>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Login" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  sectionTitle: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8, marginTop: 12 },
  form: { padding: 12, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  input: { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 14, marginBottom: 10, fontFamily: fonts.familyRegular },
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowName: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.text },
  rowPrice: { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: colors.text },
  detail: { paddingLeft: 12, paddingVertical: 6 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  detailName: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.textDim },
  detailPrice: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.textDim },
});
