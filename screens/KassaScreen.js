import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  FlatList, Modal, TouchableOpacity,
} from 'react-native';
import MetalButton from '../components/MetalButton';
import BottomBar from '../components/BottomBar';
import { colors, fonts, spacing } from '../constants/theme';

const MOCK_MENU = [
  {
    name: 'Капучино', group: 'Кофе',
    variants: [{ size: 'S', price: 180 }, { size: 'M', price: 220 }],
    milks: ['Цельное', 'Овсяное', 'Миндальное'],
    syrups: ['Ваниль', 'Карамель', 'Лесной орех'],
  },
  {
    name: 'Латте', group: 'Кофе',
    variants: [{ size: 'S', price: 190 }, { size: 'M', price: 230 }],
    milks: ['Цельное', 'Овсяное', 'Соевое'],
    syrups: ['Ваниль', 'Карамель', 'Малина'],
  },
  {
    name: 'Американо', group: 'Кофе',
    variants: [{ size: 'S', price: 150 }, { size: 'M', price: 180 }],
    milks: [],
    syrups: ['Ваниль', 'Карамель'],
  },
  {
    name: 'Лимонад Малина', group: 'Лимонады',
    variants: [{ size: 'M', price: 250 }],
    milks: [],
    syrups: [],
  },
  {
    name: 'Чизкейк', group: 'Допы',
    variants: [], price: 280,
    milks: [], syrups: [],
  },
];

const CAT_ICONS = { 'Кофе': '☕', 'Лимонады': '🍹', 'Допы': '🍬' };

const EXTRA_PRICE = { milk: 30, syrup: 30 };

export default function KassaScreen({ navigation }) {
  const groups = [...new Set(MOCK_MENU.map(i => i.group))];
  const [activeCat, setActiveCat] = useState(groups[0]);
  const [order, setOrder] = useState([]);

  // модалка
  const [modalItem, setModalItem] = useState(null);
  const [selSize, setSelSize] = useState(null);
  const [selMilk, setSelMilk] = useState(null);
  const [selSyrup, setSelSyrup] = useState(null);

  const openModal = (item) => {
    setModalItem(item);
    const firstVariant = item.variants && item.variants.length > 0 ? item.variants[0] : null;
    setSelSize(firstVariant ? firstVariant.size : null);
    setSelMilk(null);
    setSelSyrup(null);
  };

  const closeModal = () => setModalItem(null);

  const modalPrice = () => {
    if (!modalItem) return 0;
    const variant = modalItem.variants?.find(v => v.size === selSize);
    const base = variant ? variant.price : modalItem.price || 0;
    return base + (selMilk ? EXTRA_PRICE.milk : 0) + (selSyrup ? EXTRA_PRICE.syrup : 0);
  };

  const confirmAdd = () => {
    if (!modalItem) return;
    setOrder(prev => [...prev, {
      id: Date.now() + Math.random(),
      name: modalItem.name,
      size: selSize || '',
      milk: selMilk,
      syrup: selSyrup,
      price: modalPrice(),
    }]);
    closeModal();
  };

  const removeFromOrder = (id) => setOrder(prev => prev.filter(i => i.id !== id));

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
              const firstVariant = item.variants && item.variants.length > 0 ? item.variants[0] : null;
              const price = firstVariant ? firstVariant.price : item.price || 0;
              return (
                <Pressable key={item.name} style={styles.menuItem} onPress={() => openModal(item)}>
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
                <View>
                  <Text style={styles.orderItemName}>{item.name} {item.size}</Text>
                  {item.milk && <Text style={styles.orderItemMod}>🥛 {item.milk}</Text>}
                  {item.syrup && <Text style={styles.orderItemMod}>🍬 {item.syrup}</Text>}
                </View>
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

      {/* Модалка выбора размера/молока/сиропа */}
      <Modal visible={!!modalItem} transparent animationType="fade" onRequestClose={closeModal}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={closeModal} />
        <View style={styles.modalBox} pointerEvents="box-none">
          {modalItem && (
            <View style={styles.modalInner}>
              <Text style={styles.modalTitle}>{modalItem.name}</Text>

              {/* Размер */}
              {modalItem.variants && modalItem.variants.length > 0 && (
                <>
                  <Text style={styles.modalSection}>Размер</Text>
                  <View style={styles.modalRow}>
                    {modalItem.variants.map(v => (
                      <Pressable
                        key={v.size}
                        style={[styles.chip, selSize === v.size && styles.chipActive]}
                        onPress={() => setSelSize(v.size)}
                      >
                        <Text style={[styles.chipLabel, selSize === v.size && styles.chipLabelActive]}>
                          {v.size} · {v.price} ₽
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {/* Молоко */}
              {modalItem.milks && modalItem.milks.length > 0 && (
                <>
                  <Text style={styles.modalSection}>Молоко {selMilk ? `(+${EXTRA_PRICE.milk} ₽)` : ''}</Text>
                  <View style={styles.modalRow}>
                    {modalItem.milks.map(m => (
                      <Pressable
                        key={m}
                        style={[styles.chip, selMilk === m && styles.chipActive]}
                        onPress={() => setSelMilk(selMilk === m ? null : m)}
                      >
                        <Text style={[styles.chipLabel, selMilk === m && styles.chipLabelActive]}>{m}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {/* Сироп */}
              {modalItem.syrups && modalItem.syrups.length > 0 && (
                <>
                  <Text style={styles.modalSection}>Сироп {selSyrup ? `(+${EXTRA_PRICE.syrup} ₽)` : ''}</Text>
                  <View style={styles.modalRow}>
                    {modalItem.syrups.map(s => (
                      <Pressable
                        key={s}
                        style={[styles.chip, selSyrup === s && styles.chipActive]}
                        onPress={() => setSelSyrup(selSyrup === s ? null : s)}
                      >
                        <Text style={[styles.chipLabel, selSyrup === s && styles.chipLabelActive]}>{s}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              <View style={styles.modalFooter}>
                <Text style={styles.modalPrice}>{modalPrice()} ₽</Text>
                <MetalButton title="Добавить в заказ" variant="action" onPress={confirmAdd} style={{ flex: 1 }} />
              </View>
            </View>
          )}
        </View>
      </Modal>
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
    minWidth: 90, height: 40, paddingHorizontal: 14, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginRight: 8,
  },
  catBtnActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.18)' },
  catIcon: { fontSize: 16 },
  catLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textTransform: 'uppercase' },
  catLabelActive: { color: colors.greenLight },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 10 },
  menuItem: {
    width: '30%', minWidth: 110, padding: 14,
    borderRadius: 14, borderWidth: 1, borderColor: colors.borderHi,
    backgroundColor: colors.surface2, alignItems: 'center',
  },
  menuItemName: { fontFamily: fonts.family, fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center', textTransform: 'uppercase' },
  menuItemPrice: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 6 },
  orderPanel: {
    width: '33%', minWidth: 240,
    borderLeftWidth: 1, borderLeftColor: colors.border,
    backgroundColor: colors.surface,
  },
  orderHeader: { padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  orderHeaderText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2 },
  orderItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  orderItemName: { fontFamily: fonts.family, fontSize: 14, color: colors.text },
  orderItemMod: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  orderItemPrice: { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: colors.text },
  emptyOrder: { textAlign: 'center', color: colors.muted, padding: 20, fontFamily: fonts.familyRegular },
  orderFooter: { padding: 14 },
  orderTotal: {
    fontFamily: fonts.family, fontSize: 28, fontWeight: '800',
    color: colors.greenLight, textAlign: 'center', marginBottom: 10,
  },

  // Модалка
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalBox: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
  modalInner: {
    width: '55%', maxWidth: 540,
    backgroundColor: '#0e0f11',
    borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: colors.borderHi,
  },
  modalTitle: {
    fontFamily: fonts.family, fontSize: 20, fontWeight: '800',
    color: colors.text, textTransform: 'uppercase', letterSpacing: 2,
    marginBottom: 16, textAlign: 'center',
  },
  modalSection: {
    fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 2, marginTop: 12, marginBottom: 8,
  },
  modalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e',
  },
  chipActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.18)' },
  chipLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  chipLabelActive: { color: colors.greenLight },
  modalFooter: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 20 },
  modalPrice: {
    fontFamily: fonts.family, fontSize: 26, fontWeight: '800', color: colors.text,
    minWidth: 80, textAlign: 'right',
  },
});
