import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import BottomBar from '../components/BottomBar';
import { colors, fonts, spacing } from '../constants/theme';

// Техкарта: название напитка, список ингредиентов (название, граммовка, цена за единицу)
const MOCK_CARDS = [
  {
    id: '1',
    name: 'Капучино S',
    ingredients: [
      { name: 'Кофе зёрна', amount: 18, unit: 'г', pricePerUnit: 2.8 },
      { name: 'Молоко', amount: 120, unit: 'мл', pricePerUnit: 0.09 },
      { name: 'Стакан S', amount: 1, unit: 'шт', pricePerUnit: 6 },
    ],
  },
  {
    id: '2',
    name: 'Латте M',
    ingredients: [
      { name: 'Кофе зёрна', amount: 18, unit: 'г', pricePerUnit: 2.8 },
      { name: 'Молоко', amount: 200, unit: 'мл', pricePerUnit: 0.09 },
      { name: 'Сироп ваниль', amount: 10, unit: 'мл', pricePerUnit: 1.2 },
      { name: 'Стакан M', amount: 1, unit: 'шт', pricePerUnit: 8 },
    ],
  },
  {
    id: '3',
    name: 'Американо S',
    ingredients: [
      { name: 'Кофе зёрна', amount: 16, unit: 'г', pricePerUnit: 2.8 },
      { name: 'Вода', amount: 150, unit: 'мл', pricePerUnit: 0 },
      { name: 'Стакан S', amount: 1, unit: 'шт', pricePerUnit: 6 },
    ],
  },
];

function cardCost(card) {
  return card.ingredients.reduce((sum, i) => sum + i.amount * i.pricePerUnit, 0);
}

export default function CostCardsScreen({ navigation }) {
  const [cards, setCards] = useState(MOCK_CARDS);
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  // форма новой техкарты
  const [newName, setNewName] = useState('');
  const [ingName, setIngName] = useState('');
  const [ingAmount, setIngAmount] = useState('');
  const [ingUnit, setIngUnit] = useState('г');
  const [ingPrice, setIngPrice] = useState('');
  const [draftIngredients, setDraftIngredients] = useState([]);

  const resetForm = () => {
    setNewName('');
    setIngName('');
    setIngAmount('');
    setIngUnit('г');
    setIngPrice('');
    setDraftIngredients([]);
    setAdding(false);
  };

  const addIngredientToDraft = () => {
    if (!ingName.trim() || !ingAmount || !ingPrice) return;
    setDraftIngredients(prev => [
      ...prev,
      { name: ingName.trim(), amount: parseFloat(ingAmount), unit: ingUnit, pricePerUnit: parseFloat(ingPrice) },
    ]);
    setIngName('');
    setIngAmount('');
    setIngPrice('');
  };

  const saveCard = () => {
    if (!newName.trim() || draftIngredients.length === 0) return;
    setCards(prev => [
      ...prev,
      { id: String(Date.now()), name: newName.trim(), ingredients: draftIngredients },
    ]);
    resetForm();
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          <Text style={styles.cardTitle}>🧾 Себестоимость</Text>

          <MetalButton title="← Назад" variant="back" onPress={() => navigation.navigate('Dashboard')} />

          {!adding && (
            <MetalButton title="+ Новая техкарта" variant="action" onPress={() => setAdding(true)} />
          )}

          {adding && (
            <View style={styles.form}>
              <Text style={styles.sectionTitle}>Название напитка</Text>
              <TextInput
                style={styles.input}
                placeholder="Напр. Раф S"
                placeholderTextColor={colors.muted}
                value={newName}
                onChangeText={setNewName}
              />

              <Text style={styles.sectionTitle}>Ингредиенты</Text>
              {draftIngredients.map((ing, idx) => (
                <View key={idx} style={styles.row}>
                  <Text style={styles.rowName}>{ing.name} — {ing.amount}{ing.unit}</Text>
                  <Text style={styles.rowPrice}>{(ing.amount * ing.pricePerUnit).toFixed(2)} ₽</Text>
                </View>
              ))}

              <View style={styles.ingredientForm}>
                <TextInput
                  style={[styles.input, styles.inputFlex]}
                  placeholder="Ингредиент"
                  placeholderTextColor={colors.muted}
                  value={ingName}
                  onChangeText={setIngName}
                />
                <TextInput
                  style={[styles.input, styles.inputSmall]}
                  placeholder="Кол-во"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  value={ingAmount}
                  onChangeText={setIngAmount}
                />
                <TextInput
                  style={[styles.input, styles.inputSmall]}
                  placeholder="Ед."
                  placeholderTextColor={colors.muted}
                  value={ingUnit}
                  onChangeText={setIngUnit}
                />
                <TextInput
                  style={[styles.input, styles.inputSmall]}
                  placeholder="Цена/ед."
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  value={ingPrice}
                  onChangeText={setIngPrice}
                />
              </View>
              <MetalButton title="+ Добавить ингредиент" variant="default" onPress={addIngredientToDraft} />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <MetalButton title="Сохранить" variant="success" onPress={saveCard} style={{ flex: 1 }} />
                <MetalButton title="Отмена" variant="back" onPress={resetForm} style={{ flex: 1 }} />
              </View>
            </View>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Техкарты</Text>
          {cards.map((card) => {
            const cost = cardCost(card);
            const isOpen = expandedId === card.id;
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
                        <Text style={styles.detailName}>{ing.name} ({ing.amount}{ing.unit})</Text>
                        <Text style={styles.detailPrice}>{(ing.amount * ing.pricePerUnit).toFixed(2)} ₽</Text>
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
  inner: { padding: spacing.lg, paddingTop: 40, paddingBottom: 100, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  cardTitle: {
    fontFamily: fonts.family,
    fontSize: 11,
    letterSpacing: 3,
    color: colors.textDim,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 18,
  },
  sectionTitle: {
    fontFamily: fonts.familySemibold,
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
    marginTop: 8,
  },
  form: {
    marginTop: 10,
    marginBottom: 6,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    padding: 13,
    backgroundColor: '#07080a',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    fontSize: 14,
    marginBottom: 10,
    fontFamily: fonts.familyRegular,
  },
  ingredientForm: { flexDirection: 'row', gap: 8 },
  inputFlex: { flex: 2 },
  inputSmall: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowName: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.text },
  rowPrice: { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: colors.text },
  detail: { paddingLeft: 12, paddingBottom: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  detailName: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.textDim },
  detailPrice: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.textDim },
});
