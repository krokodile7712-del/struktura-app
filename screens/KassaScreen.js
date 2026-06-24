import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  FlatList, Modal, ActivityIndicator,
} from 'react-native';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getAllProducts, getCategories, getMilkModifiers, getSyrupModifiers, createOrder, getOpenShift } from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

const CAT_ICONS = { 'Кофе': '☕', 'Лимонады': '🍹', 'Допы': '🍬', 'Прочее': '🫙' };

export default function KassaScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [milkMods, setMilkMods] = useState([]);
  const [syrupMods, setSyrupMods] = useState([]);
  const [activeCat, setActiveCat] = useState(null);
  const [order, setOrder] = useState([]);
  const [modalItem, setModalItem] = useState(null);
  const [selSize, setSelSize] = useState(null);
  const [selMilk, setSelMilk] = useState(null);
  const [selSyrup, setSelSyrup] = useState(null);
  const [currentShift, setCurrentShift] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    try {
      const products = getAllProducts();
      const cats = getCategories();
      const milks = getMilkModifiers();
      const syrups = getSyrupModifiers();
      const shift = getOpenShift();

      setAllProducts(products);
      setGroups(cats);
      setActiveCat(cats[0] || null);
      // Если модификаторов нет — дефолтные моки
      setMilkMods(milks.length > 0 ? milks : [
        { name: 'Цельное', price: 0 },
        { name: 'Овсяное', price: 30 },
        { name: 'Миндальное', price: 50 },
      ]);
      setSyrupMods(syrups.length > 0 ? syrups : [
        { name: 'Ваниль', price: 30 },
        { name: 'Карамель', price: 30 },
        { name: 'Лесной орех', price: 30 },
      ]);
      setCurrentShift(shift);
    } catch (e) {
      console.error('[KassaScreen] loadData error:', e);
    }
    setLoading(false);
  };

  const itemsInCategory = allProducts.filter(p => p.category === activeCat);

  // Читаем варианты из JSON-колонки (реальные названия размеров из GAS)
  const getVariants = (product) => {
    try {
      if (product.variants) {
        const parsed = typeof product.variants === 'string'
          ? JSON.parse(product.variants)
          : product.variants;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    // Fallback на price_s/m/l
    const variants = [];
    if (product.price_s > 0) variants.push({ size: 'S', price: product.price_s });
    if (product.price_m > 0) variants.push({ size: 'M', price: product.price_m });
    if (product.price_l > 0) variants.push({ size: 'L', price: product.price_l });
    if (variants.length === 0) variants.push({ size: '', price: 0 });
    return variants;
  };

  const openModal = (item) => {
    const variants = getVariants(item);
    setModalItem(item);
    setSelSize(variants[0]?.size || null);
    setSelMilk(null);
    setSelSyrup(null);
  };

  const closeModal = () => setModalItem(null);

  const modalPrice = () => {
    if (!modalItem) return 0;
    const variants = getVariants(modalItem);
    const variant = variants.find(v => v.size === selSize) || variants[0];
    const base = variant?.price || 0;
    const milkPrice = selMilk ? (milkMods.find(m => m.name === selMilk)?.price || 0) : 0;
    const syrupPrice = selSyrup ? (syrupMods.find(s => s.name === selSyrup)?.price || 0) : 0;
    return base + milkPrice + syrupPrice;
  };

  const confirmAdd = () => {
    if (!modalItem) return;
    setOrder(prev => [...prev, {
      id: Date.now() + Math.random(),
      product_id: modalItem.id,
      name: modalItem.name,
      size: selSize || '',
      milk: selMilk,
      syrup: selSyrup,
      price: modalPrice(),
    }]);
    closeModal();
  };

  const removeFromOrder = (id) => setOrder(prev => prev.filter(i => i.id !== id));
  const total = order.reduce((s, i) => s + i.price, 0);

  const handlePay = (method) => {
    if (order.length === 0) return;
    try {
      createOrder({ total, method, shift_id: currentShift?.id || null, items: order });
      setOrder([]);
    } catch (e) {
      console.error('[KassaScreen] createOrder error:', e);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.greenLight} />
      </View>
    );
  }

  // Если меню пустое — показываем подсказку
  if (allProducts.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Касса" onBack={() => navigation.navigate('Dashboard')} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <Text style={styles.emptyTitle}>Меню пустое</Text>
          <Text style={styles.emptyHint}>Импортируйте данные из Google Sheets через Admin → Импорт</Text>
          <MetalButton title="← Назад" variant="back" onPress={() => navigation.navigate('Dashboard')} />
        </View>
        <BottomBar navigation={navigation} activeTab="Login" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Касса" onBack={() => navigation.navigate('Dashboard')} />

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
                <Text style={styles.catIcon}>{CAT_ICONS[group] || '🫙'}</Text>
                <Text style={[styles.catLabel, activeCat === group && styles.catLabelActive]}>{group}</Text>
              </Pressable>
            )}
          />
          <ScrollView contentContainerStyle={styles.menuGrid}>
            {itemsInCategory.map((item) => {
              const variants = getVariants(item);
              const basePrice = variants[0]?.price || 0;
              return (
                <Pressable key={item.id} style={styles.menuItem} onPress={() => openModal(item)}>
                  <Text style={styles.menuItemName}>{item.name}</Text>
                  <Text style={styles.menuItemPrice}>
                    {variants.length > 1 ? `от ${basePrice}` : basePrice} ₽
                  </Text>
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
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderItemName}>{item.name}{item.size ? ` ${item.size}` : ''}</Text>
                  {item.milk && <Text style={styles.orderItemMod}>🥛 {item.milk}</Text>}
                  {item.syrup && <Text style={styles.orderItemMod}>🍬 {item.syrup}</Text>}
                </View>
                <Text style={styles.orderItemPrice}>{item.price} ₽</Text>
              </Pressable>
            ))}
            {order.length === 0 && <Text style={styles.emptyOrder}>Корзина пуста</Text>}
          </ScrollView>
          <View style={styles.orderFooter}>
            <Text style={styles.orderTotal}>{total} ₽</Text>
            <MetalButton title="💵 Наличные" variant="pay" onPress={() => handlePay('Наличные')} />
            <MetalButton title="💳 Карта" variant="pay" onPress={() => handlePay('Карта')} />
          </View>
        </View>
      </View>

      <BottomBar navigation={navigation} activeTab="Login" />

      {/* Модалка */}
      <Modal visible={!!modalItem} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeModal} />
          {modalItem && (
            <View style={styles.modalInner}>
              <Text style={styles.modalTitle}>{modalItem.name}</Text>

              {/* Размер */}
              {(() => {
                const variants = getVariants(modalItem);
                return variants.length > 1 ? (
                  <>
                    <Text style={styles.modalSection}>Размер</Text>
                    <View style={styles.chipsRow}>
                      {variants.map(v => (
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
                ) : null;
              })()}

              {/* Молоко */}
              {modalItem.has_milk ? (
                <>
                  <Text style={styles.modalSection}>Молоко</Text>
                  <View style={styles.chipsRow}>
                    {milkMods.map(m => (
                      <Pressable
                        key={m.name}
                        style={[styles.chip, selMilk === m.name && styles.chipActive]}
                        onPress={() => setSelMilk(selMilk === m.name ? null : m.name)}
                      >
                        <Text style={[styles.chipLabel, selMilk === m.name && styles.chipLabelActive]}>
                          {m.name}{m.price > 0 ? ` +${m.price}₽` : ''}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              {/* Сироп */}
              {modalItem.has_syrup ? (
                <>
                  <Text style={styles.modalSection}>Сироп</Text>
                  <View style={styles.chipsRow}>
                    {syrupMods.map(s => (
                      <Pressable
                        key={s.name}
                        style={[styles.chip, selSyrup === s.name && styles.chipActive]}
                        onPress={() => setSelSyrup(selSyrup === s.name ? null : s.name)}
                      >
                        <Text style={[styles.chipLabel, selSyrup === s.name && styles.chipLabelActive]}>
                          {s.name}{s.price > 0 ? ` +${s.price}₽` : ''}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              <View style={styles.modalFooter}>
                <Text style={styles.modalPrice}>{modalPrice()} ₽</Text>
                <MetalButton title="Добавить" variant="action" onPress={confirmAdd} style={{ flex: 1 }} />
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1, flexDirection: 'row' },
  left: { flex: 1 },
  catList: { paddingHorizontal: 10, paddingVertical: 6 },
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
    width: '30%', minWidth: 110, padding: 14, borderRadius: 14,
    borderWidth: 1, borderColor: colors.borderHi, backgroundColor: colors.surface2, alignItems: 'center',
  },
  menuItemName: { fontFamily: fonts.family, fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center', textTransform: 'uppercase' },
  menuItemPrice: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 6 },
  orderPanel: { width: '33%', minWidth: 240, borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: colors.surface },
  orderHeader: { padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  orderHeaderText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2 },
  orderItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  orderItemName: { fontFamily: fonts.family, fontSize: 14, color: colors.text },
  orderItemMod: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  orderItemPrice: { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: colors.text },
  emptyOrder: { textAlign: 'center', color: colors.muted, padding: 20, fontFamily: fonts.familyRegular },
  emptyTitle: { fontFamily: fonts.family, fontSize: 18, color: colors.text, marginBottom: 8 },
  emptyHint: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  orderFooter: { padding: 14 },
  orderTotal: { fontFamily: fonts.family, fontSize: 28, fontWeight: '800', color: colors.greenLight, textAlign: 'center', marginBottom: 10 },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalInner: { width: '55%', maxWidth: 540, backgroundColor: '#0e0f11', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.borderHi },
  modalTitle: { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12, textAlign: 'center' },
  modalSection: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2, marginTop: 14, marginBottom: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e' },
  chipActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.18)' },
  chipLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  chipLabelActive: { color: colors.greenLight },
  modalFooter: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 20 },
  modalPrice: { fontFamily: fonts.family, fontSize: 26, fontWeight: '800', color: colors.text, minWidth: 80, textAlign: 'right' },
});
