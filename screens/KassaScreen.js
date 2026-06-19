import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, FlatList } from 'react-native';
import MetalButton from '../components/MetalButton';
import BottomBar from '../components/BottomBar';
import { colors, fonts, spacing } from '../constants/theme';

// Временные тестовые данные меню — позже заменим на реальные из SQLite/Sheets
const MOCK_MENU = [
  { name: 'Капучино', group: 'Кофе', variants: [{ size: 'S', price: 180 }, { size: 'M', price: 220 }] },
  { name: 'Латте', group: 'Кофе', variants: [{ size: 'S', price: 190 }, { size: 'M', price: 230 }] },
  { name: 'Американо', group: 'Кофе', variants: [{ size: 'S', price: 150 }, { size: 'M', price: 180 }] },
  { name: 'Лимонад Малина', group: 'Лимонады', variants: [{ size: 'M', price: 250 }] },
  { name: 'Чизкейк', group: 'Допы', variants: [], price: 280 },
];

const CAT_ICONS = { 'Кофе': '☕', 'Лимонады': '🍹', 'Допы': '🍬' };

export default function KassaScreen({ navigation }) {
  const groups = [...new Set(MOCK_MENU.map(i => i.group))];
  const [activeCat, setActiveCat] = useState(groups[0]);
  const [order, setOrder] = useState([]);

  const addToOrder = (item) => {
    const variant = item.variants && item.variants.length > 0 ? item.variants[0] : null;
    const price = variant ? variant.price : item.price || 0;
    setOrder(prev => [...prev, {
      id: Date.now() + Math.random(),
      name: item.name,
      size: variant ? variant.size : '',
      price,
    }]);
  };

  const removeFromOrder = (id) => {
    setOrder(prev => prev.filter(i => i.id !== id));
  };

  const total = order.reduce((sum, i) => sum + i.price, 0);
  const itemsInCategory = MOCK_MENU.filter(i => i.group === activeCat);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.shiftInfo}>
        <Text style={styles.shiftInfoText}>Смена: не открыта · меню: {MOCK_MENU.length} позиций</Text>
      </View>

      <View style={styles.layout}>
        {/* Левая часть: категории + меню */}
        <View style={styles.left}>
          <FlatList
            horizontal
            data={groups}
            keyExtractor={(g) => g}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catList}
            renderItem={({ item: group }) => (
              <Pressable
                style={[styles.catBtn, activeCat === group && styles.catBtnActive]}
                onPress={() => setActiveCat(group)}
              >
                <Text style={styles.catIcon}>{CAT_ICONS[group] || '🍵'}</Text>
                <Text style={[styles.catLabel, activeCat === group && styles.catLabelActive]}>{group}</Text>
              </Pressable>
            )}
          />

          <ScrollView contentContainerStyle={styles.menuGrid}>
            {itemsInCategory.map((item) => {
              const variant = item.variants && item.variants.length > 0 ? item.variants[0] : null;
              const price = variant ? variant.price : item.price || 0;
              return (
                <Pressable key={item.name} style={styles.menuItem} onPress={() => addToOrder(item)}>
                  <Text style={styles.menuItemName}>{item.name}</Text>
                  <Text style={styles.menuItemPrice}>от {price} ₽</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Правая часть: заказ */}
        <View style={styles.orderPanel}>
          <View style={styles.orderHeader}>
            <Text style={styles.orderHeaderText}>🛒 Заказ ({order.length})</Text>
          </View>
          <ScrollView style={{ flex: 1 }}>
            {order.map((item) => (
              <Pressable key={item.id} style={styles.orderItem} onPress={() => removeFromOrder(item.id)}>
                <Text style={styles.orderItemName}>{item.name} {item.size}</Text>
                <Text style={styles.orderItemPrice}>{item.price} ₽</Text>
              </Pressable>
            ))}
            {order.length === 0 && (
              <Text style={styles.emptyOrder}>Корзина пуста</Text>
            )}
          </ScrollView>
          <View style={styles.orderFooter}>
            <Text style={styles.orderTotal}>{total} ₽</Text>
            <MetalButton title="💵 Наличные" variant="pay" onPress={() => {}} />
            <MetalButton title="💳 Карта" variant="pay" onPress={() => {}} />
          </View>
        </View>
      </View>

      <BottomBar navigation={navigation} activeTab="Login" />
    </View>
  );
}

const styles = StyleSheet.create({
  shiftInfo: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  shiftInfoText: {
    fontFamily: fonts.familySemibold,
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  layout: { flex: 1, flexDirection: 'row' },
  left: { flex: 1, flexDirection: 'column' },
  catList: { paddingHorizontal: 10, paddingVertical: 6, gap: 8 },
  catBtn: {
    minWidth: 90,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#0b0c0e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginRight: 8,
  },
  catBtnActive: {
    borderColor: 'rgba(61,158,146,0.6)',
    backgroundColor: 'rgba(61,158,146,0.18)',
  },
  catIcon: { fontSize: 16 },
  catLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textTransform: 'uppercase' },
  catLabelActive: { color: colors.greenLight },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 10,
  },
  menuItem: {
    width: '30%',
    minWidth: 110,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderHi,
    backgroundColor: colors.surface2,
    alignItems: 'center',
  },
  menuItemName: { fontFamily: fonts.family, fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center', textTransform: 'uppercase' },
  menuItemPrice: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 6 },
  orderPanel: {
    width: '33%',
    minWidth: 240,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    backgroundColor: colors.surface,
  },
  orderHeader: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  orderHeaderText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2 },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  orderItemName: { fontFamily: fonts.family, fontSize: 14, color: colors.text },
  orderItemPrice: { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: colors.text },
  emptyOrder: { textAlign: 'center', color: colors.muted, padding: 20, fontFamily: fonts.familyRegular },
  orderFooter: { padding: 14 },
  orderTotal: {
    fontFamily: fonts.family,
    fontSize: 28,
    fontWeight: '800',
    color: colors.greenLight,
    textAlign: 'center',
    marginBottom: 10,
  },
});
