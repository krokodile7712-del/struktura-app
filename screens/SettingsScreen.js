import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import {
  getAllProducts, updateProductVariants,
  getUsers, updateUserPin,
  getDiscounts, setSetting,
  getModifiers, updateModifierPrice, insertModifier, deleteModifier,
} from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

function getVariants(product) {
  try {
    if (product.variants) {
      const parsed = typeof product.variants === 'string' ? JSON.parse(product.variants) : product.variants;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_) {}
  const variants = [];
  if (product.price_s > 0) variants.push({ size: 'S', price: product.price_s });
  if (product.price_m > 0) variants.push({ size: 'M', price: product.price_m });
  if (product.price_l > 0) variants.push({ size: 'L', price: product.price_l });
  if (variants.length === 0) variants.push({ size: '', price: 0 });
  return variants;
}

export default function SettingsScreen({ navigation }) {
  // ── Данные ──
  const [products, setProducts]   = useState([]);
  const [users, setUsers]         = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [modifiers, setModifiers] = useState([]);

  // ── Модалки ──
  const [productModal, setProductModal]   = useState(null); // { product, variants: [{size, price}] }
  const [discountModal, setDiscountModal] = useState(null); // { index, name, pct } | 'new'
  const [modifierModal, setModifierModal] = useState(null); // { id, name, price, type } | 'new'

  // ── PIN поля ──
  const [pinBarista, setPinBarista] = useState('');
  const [pinAdmin, setPinAdmin]     = useState('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = () => {
    try {
      setProducts(getAllProducts());
      const u = getUsers();
      setUsers(u);
      setPinBarista(u.find(x => x.role === 'barista')?.pin || '');
      setPinAdmin(u.find(x => x.role === 'admin')?.pin || '');
      setDiscounts(getDiscounts());
      setModifiers(getModifiers());
    } catch (e) { console.error(e); }
  };

  // ── Товары ──
  const openProduct = (product) => {
    setProductModal({ product, variants: getVariants(product).map(v => ({ ...v, price: String(v.price) })) });
  };
  const setVariantPrice = (i, value) => {
    setProductModal(m => {
      const variants = [...m.variants];
      variants[i] = { ...variants[i], price: value };
      return { ...m, variants };
    });
  };
  const saveProduct = () => {
    if (!productModal) return;
    const variants = productModal.variants.map(v => ({ size: v.size, price: parseFloat(v.price) || 0 }));
    try {
      updateProductVariants(productModal.product.id, variants);
      loadAll();
    } catch (e) { console.error(e); }
    setProductModal(null);
  };

  // ── PIN ──
  const savePins = () => {
    try {
      if (pinBarista.trim()) updateUserPin('barista', pinBarista.trim());
      if (pinAdmin.trim()) updateUserPin('admin', pinAdmin.trim());
      loadAll();
    } catch (e) { console.error(e); }
  };

  // ── Скидки ──
  const saveDiscounts = (list) => {
    try {
      setSetting('discounts', JSON.stringify(list));
      setDiscounts(list);
    } catch (e) { console.error(e); }
  };
  const openNewDiscount = () => setDiscountModal({ index: -1, name: '', pct: '' });
  const openEditDiscount = (i) => setDiscountModal({ index: i, name: discounts[i].name, pct: String(discounts[i].pct) });
  const saveDiscountModal = () => {
    if (!discountModal || !discountModal.name.trim() || !discountModal.pct) return;
    const entry = { name: discountModal.name.trim(), pct: parseFloat(discountModal.pct) || 0 };
    const list = [...discounts];
    if (discountModal.index === -1) list.push(entry);
    else list[discountModal.index] = entry;
    saveDiscounts(list);
    setDiscountModal(null);
  };
  const deleteDiscountModal = () => {
    if (!discountModal || discountModal.index === -1) return;
    const list = discounts.filter((_, i) => i !== discountModal.index);
    saveDiscounts(list);
    setDiscountModal(null);
  };

  // ── Модификаторы ──
  const openNewModifier = (type) => setModifierModal({ id: null, name: '', price: '', type });
  const openEditModifier = (m) => setModifierModal({ id: m.id, name: m.name, price: String(m.price), type: m.type });
  const saveModifierModal = () => {
    if (!modifierModal || !modifierModal.name.trim()) return;
    try {
      if (modifierModal.id) {
        updateModifierPrice(modifierModal.id, parseFloat(modifierModal.price) || 0);
      } else {
        insertModifier({ name: modifierModal.name.trim(), price: parseFloat(modifierModal.price) || 0, type: modifierModal.type });
      }
      loadAll();
    } catch (e) { console.error(e); }
    setModifierModal(null);
  };
  const deleteModifierModal = () => {
    if (!modifierModal || !modifierModal.id) return;
    try { deleteModifier(modifierModal.id); loadAll(); } catch (e) { console.error(e); }
    setModifierModal(null);
  };

  const categories = [...new Set(products.map(p => p.category))];

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Настройки" onBack={() => navigation.navigate('Admin')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>

        {/* Меню и цены */}
        <MetalCard>
          <Text style={styles.blockTitle}>☕ Меню и цены</Text>
          {categories.map(cat => (
            <View key={cat} style={{ marginBottom: 12 }}>
              <Text style={styles.catHeader}>{cat}</Text>
              {products.filter(p => p.category === cat).map(p => {
                const variants = getVariants(p);
                const priceLabel = variants.map(v => `${v.size ? v.size + ' ' : ''}${v.price}₽`).join(' · ');
                return (
                  <Pressable key={p.id} style={styles.row} onPress={() => openProduct(p)}>
                    <Text style={styles.rowName}>{p.name}</Text>
                    <Text style={styles.rowPrice}>{priceLabel} ›</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
          {products.length === 0 && <Text style={styles.empty}>Нет товаров. Выполните импорт из Sheets.</Text>}
        </MetalCard>

        {/* PIN-коды */}
        <MetalCard style={{ marginTop: 12 }}>
          <Text style={styles.blockTitle}>🔑 PIN-коды</Text>
          <Text style={styles.fieldLabel}>Бариста</Text>
          <TextInput style={styles.input} keyboardType="number-pad" maxLength={6} value={pinBarista} onChangeText={setPinBarista} placeholderTextColor={colors.muted} />
          <Text style={styles.fieldLabel}>Администратор</Text>
          <TextInput style={styles.input} keyboardType="number-pad" maxLength={6} value={pinAdmin} onChangeText={setPinAdmin} placeholderTextColor={colors.muted} />
          <MetalButton title="Сохранить PIN-коды" variant="success" onPress={savePins} />
        </MetalCard>

        {/* Скидки */}
        <MetalCard style={{ marginTop: 12 }}>
          <Text style={styles.blockTitle}>🏷 Скидки</Text>
          {discounts.length === 0 && <Text style={styles.empty}>Скидки не настроены</Text>}
          {discounts.map((d, i) => (
            <Pressable key={i} style={styles.row} onPress={() => openEditDiscount(i)}>
              <Text style={styles.rowName}>{d.name}</Text>
              <Text style={styles.rowPrice}>−{d.pct}% ›</Text>
            </Pressable>
          ))}
          <MetalButton title="+ Добавить скидку" variant="default" onPress={openNewDiscount} />
        </MetalCard>

        {/* Модификаторы */}
        <MetalCard style={{ marginTop: 12, marginBottom: 20 }}>
          <Text style={styles.blockTitle}>🥛 Модификаторы</Text>
          {modifiers.length === 0 && <Text style={styles.empty}>Модификаторы не настроены</Text>}
          {modifiers.map(m => (
            <Pressable key={m.id} style={styles.row} onPress={() => openEditModifier(m)}>
              <Text style={styles.rowName}>{m.name}</Text>
              <Text style={styles.rowPrice}>+{m.price}₽ ›</Text>
            </Pressable>
          ))}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <MetalButton title="+ Замена (молоко)" variant="default" onPress={() => openNewModifier('Замена')} style={{ flex: 1 }} />
            <MetalButton title="+ Добавка (сироп)" variant="default" onPress={() => openNewModifier('Добавление')} style={{ flex: 1 }} />
          </View>
        </MetalCard>

      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Kassa" />

      {/* Модалка товара */}
      <Modal visible={!!productModal} transparent animationType="fade" onRequestClose={() => setProductModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setProductModal(null)} />
          {productModal && (
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{productModal.product.name}</Text>
                <Pressable onPress={() => setProductModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              {productModal.variants.map((v, i) => (
                <View key={i} style={styles.variantRow}>
                  <Text style={styles.variantLabel}>{v.size || 'Цена'}</Text>
                  <TextInput
                    style={styles.variantInput}
                    keyboardType="numeric"
                    value={v.price}
                    onChangeText={(val) => setVariantPrice(i, val)}
                  />
                  <Text style={styles.variantUnit}>₽</Text>
                </View>
              ))}
              <MetalButton title="Сохранить" variant="success" onPress={saveProduct} style={{ marginTop: 10 }} />
            </View>
          )}
        </View>
      </Modal>

      {/* Модалка скидки */}
      <Modal visible={!!discountModal} transparent animationType="fade" onRequestClose={() => setDiscountModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setDiscountModal(null)} />
          {discountModal && (
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{discountModal.index === -1 ? 'Новая скидка' : 'Изменить скидку'}</Text>
                <Pressable onPress={() => setDiscountModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <Text style={styles.fieldLabel}>Название</Text>
              <TextInput style={styles.input} value={discountModal.name} onChangeText={(v) => setDiscountModal(m => ({ ...m, name: v }))} placeholderTextColor={colors.muted} />
              <Text style={styles.fieldLabel}>Процент</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={discountModal.pct} onChangeText={(v) => setDiscountModal(m => ({ ...m, pct: v }))} placeholderTextColor={colors.muted} />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <MetalButton title="Сохранить" variant="success" onPress={saveDiscountModal} style={{ flex: 1 }} />
                {discountModal.index !== -1 && (
                  <MetalButton title="Удалить" variant="danger" onPress={deleteDiscountModal} style={{ flex: 1 }} />
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Модалка модификатора */}
      <Modal visible={!!modifierModal} transparent animationType="fade" onRequestClose={() => setModifierModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setModifierModal(null)} />
          {modifierModal && (
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{modifierModal.id ? 'Изменить модификатор' : 'Новый модификатор'}</Text>
                <Pressable onPress={() => setModifierModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <Text style={styles.fieldLabel}>Название</Text>
              <TextInput style={styles.input} value={modifierModal.name} onChangeText={(v) => setModifierModal(m => ({ ...m, name: v }))} placeholderTextColor={colors.muted} />
              <Text style={styles.fieldLabel}>Доплата, ₽</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={modifierModal.price} onChangeText={(v) => setModifierModal(m => ({ ...m, price: v }))} placeholderTextColor={colors.muted} />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <MetalButton title="Сохранить" variant="success" onPress={saveModifierModal} style={{ flex: 1 }} />
                {modifierModal.id && (
                  <MetalButton title="Удалить" variant="danger" onPress={deleteModifierModal} style={{ flex: 1 }} />
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  blockTitle: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12, textAlign: 'center' },
  catHeader: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowName: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.text, flex: 1 },
  rowPrice: { fontFamily: fonts.family, fontSize: 13, fontWeight: '700', color: colors.greenLight },
  empty: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', paddingVertical: 12 },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 10 },
  input: { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 14, fontFamily: fonts.familyRegular },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalInner: { width: '55%', maxWidth: 540, backgroundColor: '#0e0f11', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.borderHi },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, flex: 1 },
  modalClose: { fontSize: 18, color: colors.muted, padding: 4 },
  variantRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  variantLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, width: 90 },
  variantInput: { flex: 1, padding: 12, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 15, fontFamily: fonts.family, textAlign: 'center' },
  variantUnit: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
});
