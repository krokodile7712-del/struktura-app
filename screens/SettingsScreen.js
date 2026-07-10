import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, Share } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import {
  getAllProductsAdmin, updateProductVariants, insertProduct, setProductActive,
  getUsers, updateUserPin,
  getDiscounts, setSetting, getBonusPct,
  getModifiers, updateModifier, insertModifier, deleteModifier,
  getAllStock, updateStockThreshold,
  exportAllData,
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
  const [stock, setStock]         = useState([]);

  // ── Модалки ──
  const [productModal, setProductModal]   = useState(null); // { product, variants: [{size, price}] }
  const [newProductModal, setNewProductModal] = useState(null); // { name, category, price_s, price_m, price_l }
  const [discountModal, setDiscountModal] = useState(null); // { index, name, pct } | 'new'
  const [modifierModal, setModifierModal] = useState(null); // { id, name, price, type } | 'new'
  const [stockModal, setStockModal]       = useState(null); // { id, name, unit, порог }

  // ── PIN поля ──
  const [pinBarista, setPinBarista] = useState('');
  const [pinAdmin, setPinAdmin]     = useState('');

  // ── Общие настройки ──
  const [bonusPct, setBonusPct] = useState('10');
  const [exporting, setExporting] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = () => {
    try {
      setProducts(getAllProductsAdmin());
      const u = getUsers();
      setUsers(u);
      setPinBarista(u.find(x => x.role === 'barista')?.pin || '');
      setPinAdmin(u.find(x => x.role === 'admin')?.pin || '');
      setDiscounts(getDiscounts());
      setModifiers(getModifiers());
      setStock(getAllStock());
      setBonusPct(String(getBonusPct()));
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
  const toggleProductActive = () => {
    if (!productModal) return;
    try {
      setProductActive(productModal.product.id, !productModal.product.active);
      loadAll();
    } catch (e) { console.error(e); }
    setProductModal(null);
  };

  // ── Новый товар ──
  const openNewProduct = () => setNewProductModal({ name: '', category: products[0]?.category || '', price_s: '', price_m: '', price_l: '' });
  const saveNewProduct = () => {
    if (!newProductModal || !newProductModal.name.trim() || !newProductModal.category.trim()) return;
    try {
      insertProduct({
        name: newProductModal.name.trim(),
        category: newProductModal.category.trim(),
        price_s: parseFloat(newProductModal.price_s) || 0,
        price_m: parseFloat(newProductModal.price_m) || 0,
        price_l: parseFloat(newProductModal.price_l) || 0,
        has_milk: false,
        has_syrup: false,
      });
      loadAll();
    } catch (e) { console.error(e); }
    setNewProductModal(null);
  };

  // ── Пороги склада ──
  const openStockModal = (item) => setStockModal({ id: item.id, name: item.name, unit: item.unit, порог: String(item['порог'] ?? 0) });
  const saveStockModal = () => {
    if (!stockModal) return;
    try {
      updateStockThreshold(stockModal.id, parseFloat(stockModal['порог']) || 0);
      loadAll();
    } catch (e) { console.error(e); }
    setStockModal(null);
  };

  // ── Бонусный процент ──
  const saveBonusPct = () => {
    try { setSetting('bonusPct', String(parseFloat(bonusPct) || 0)); } catch (e) { console.error(e); }
  };

  // ── Экспорт / бэкап ──
  const handleExport = async () => {
    setExporting(true);
    try {
      const data = exportAllData();
      const json = JSON.stringify(data, null, 2);
      await Share.share({
        title: `Бэкап СТРУКТУРА ${new Date().toISOString().slice(0, 10)}`,
        message: json,
      });
    } catch (e) { console.error(e); }
    setExporting(false);
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
  const openNewModifier = (type) => setModifierModal({
    id: null, name: '', price: '', type,
    ingrToReplace: '', ingrToDeduct: '', deductAmount: '', deductUnit: 'мл',
  });
  const openEditModifier = (m) => setModifierModal({
    id: m.id, name: m.name, price: String(m.price), type: m.type,
    ingrToReplace: m.ingr_to_replace || '', ingrToDeduct: m.ingr_to_deduct || '',
    deductAmount: m.deduct_amount ? String(m.deduct_amount) : '', deductUnit: m.deduct_unit || 'мл',
  });
  const saveModifierModal = () => {
    if (!modifierModal || !modifierModal.name.trim()) return;
    const payload = {
      price: parseFloat(modifierModal.price) || 0,
      ingrToReplace: modifierModal.ingrToReplace.trim(),
      ingrToDeduct: modifierModal.ingrToDeduct.trim(),
      deductAmount: parseFloat(modifierModal.deductAmount) || 0,
      deductUnit: modifierModal.deductUnit.trim(),
    };
    try {
      if (modifierModal.id) {
        updateModifier(modifierModal.id, payload);
      } else {
        insertModifier({ name: modifierModal.name.trim(), type: modifierModal.type, ...payload });
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
                const inactive = !p.active;
                return (
                  <Pressable key={p.id} style={styles.row} onPress={() => openProduct(p)}>
                    <Text style={[styles.rowName, inactive && styles.rowNameInactive]}>
                      {inactive ? '🚫 ' : ''}{p.name}
                    </Text>
                    <Text style={styles.rowPrice}>{priceLabel} ›</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
          {products.length === 0 && <Text style={styles.empty}>Нет товаров. Выполните импорт из Sheets.</Text>}
          <MetalButton title="+ Добавить товар" variant="default" onPress={openNewProduct} />
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

        {/* Общие настройки */}
        <MetalCard style={{ marginTop: 12 }}>
          <Text style={styles.blockTitle}>⭐ Бонусная программа</Text>
          <Text style={styles.fieldLabel}>Процент начисления баллов</Text>
          <TextInput style={styles.input} keyboardType="numeric" value={bonusPct} onChangeText={setBonusPct} placeholderTextColor={colors.muted} />
          <MetalButton title="Сохранить" variant="success" onPress={saveBonusPct} />
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
        <MetalCard style={{ marginTop: 12 }}>
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

        {/* Пороги остатка склада */}
        <MetalCard style={{ marginTop: 12 }}>
          <Text style={styles.blockTitle}>📦 Пороги остатка склада</Text>
          {stock.length === 0 && <Text style={styles.empty}>Нет данных. Выполните импорт из Sheets.</Text>}
          {stock.map(s => (
            <Pressable key={s.id} style={styles.row} onPress={() => openStockModal(s)}>
              <Text style={styles.rowName}>{s.name}</Text>
              <Text style={styles.rowPrice}>порог: {s['порог']} {s.unit} ›</Text>
            </Pressable>
          ))}
        </MetalCard>

        {/* Резервное копирование */}
        <MetalCard style={{ marginTop: 12, marginBottom: 20 }}>
          <Text style={styles.blockTitle}>💾 Резервное копирование</Text>
          <Text style={styles.hintText}>Открывает системное меню «Поделиться» с данными в виде текста — можно переслать себе в Telegram, сохранить в заметки или облако.</Text>
          <MetalButton title={exporting ? 'Экспорт...' : '📤 Экспорт и поделиться'} variant="pay" onPress={handleExport} disabled={exporting} />
          <View style={{ marginTop: 14 }}>
            <Text style={styles.hintText}>Полностью очищает все данные приложения (заказы, клиенты, склад и т.д.). PIN-коды не затрагиваются. Пока недоступно — включим, когда всё будет настроено.</Text>
            <MetalButton title="🗑 Сбросить приложение" variant="danger" onPress={() => {}} disabled />
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
              <MetalButton
                title={productModal.product.active ? '🚫 Деактивировать' : '✓ Активировать'}
                variant={productModal.product.active ? 'danger' : 'success'}
                onPress={toggleProductActive}
              />
            </View>
          )}
        </View>
      </Modal>

      {/* Модалка нового товара */}
      <Modal visible={!!newProductModal} transparent animationType="fade" onRequestClose={() => setNewProductModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setNewProductModal(null)} />
          {newProductModal && (
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Новый товар</Text>
                <Pressable onPress={() => setNewProductModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <Text style={styles.fieldLabel}>Название</Text>
              <TextInput style={styles.input} value={newProductModal.name} onChangeText={(v) => setNewProductModal(m => ({ ...m, name: v }))} placeholderTextColor={colors.muted} />
              <Text style={styles.fieldLabel}>Категория</Text>
              <TextInput style={styles.input} value={newProductModal.category} onChangeText={(v) => setNewProductModal(m => ({ ...m, category: v }))} placeholder="Название категории" placeholderTextColor={colors.muted} />
              {categories.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {categories.map(c => (
                    <Pressable key={c} style={styles.catChip} onPress={() => setNewProductModal(m => ({ ...m, category: c }))}>
                      <Text style={styles.catChipLabel}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Цены по размерам (пусто — если размер не нужен)</Text>
              <View style={styles.variantRow}>
                <Text style={styles.variantLabel}>S</Text>
                <TextInput style={styles.variantInput} keyboardType="numeric" value={newProductModal.price_s} onChangeText={(v) => setNewProductModal(m => ({ ...m, price_s: v }))} />
                <Text style={styles.variantUnit}>₽</Text>
              </View>
              <View style={styles.variantRow}>
                <Text style={styles.variantLabel}>M</Text>
                <TextInput style={styles.variantInput} keyboardType="numeric" value={newProductModal.price_m} onChangeText={(v) => setNewProductModal(m => ({ ...m, price_m: v }))} />
                <Text style={styles.variantUnit}>₽</Text>
              </View>
              <View style={styles.variantRow}>
                <Text style={styles.variantLabel}>L</Text>
                <TextInput style={styles.variantInput} keyboardType="numeric" value={newProductModal.price_l} onChangeText={(v) => setNewProductModal(m => ({ ...m, price_l: v }))} />
                <Text style={styles.variantUnit}>₽</Text>
              </View>
              <MetalButton title="Добавить товар" variant="success" onPress={saveNewProduct} style={{ marginTop: 10 }} />
            </View>
          )}
        </View>
      </Modal>

      {/* Модалка порога склада */}
      <Modal visible={!!stockModal} transparent animationType="fade" onRequestClose={() => setStockModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setStockModal(null)} />
          {stockModal && (
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{stockModal.name}</Text>
                <Pressable onPress={() => setStockModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <Text style={styles.fieldLabel}>Порог нехватки ({stockModal.unit})</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={stockModal['порог']} onChangeText={(v) => setStockModal(m => ({ ...m, порог: v }))} placeholderTextColor={colors.muted} />
              <MetalButton title="Сохранить" variant="success" onPress={saveStockModal} style={{ marginTop: 10 }} />
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

              {modifierModal.type === 'Замена' ? (
                <>
                  <Text style={styles.fieldLabel}>Ингредиент склада вместо «Молоко»</Text>
                  <TextInput style={styles.input} value={modifierModal.ingrToReplace} onChangeText={(v) => setModifierModal(m => ({ ...m, ingrToReplace: v }))} placeholder="напр. Овсяное молоко" placeholderTextColor={colors.muted} />
                  <Text style={styles.hintText}>Количество спишется такое же, как «Молоко» указано в техкарте товара.</Text>
                </>
              ) : (
                <>
                  <Text style={styles.fieldLabel}>Ингредиент склада для списания</Text>
                  <TextInput style={styles.input} value={modifierModal.ingrToDeduct} onChangeText={(v) => setModifierModal(m => ({ ...m, ingrToDeduct: v }))} placeholder="напр. Сироп ваниль" placeholderTextColor={colors.muted} />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.fieldLabel}>Расход за 1 добавку</Text>
                      <TextInput style={styles.input} keyboardType="numeric" value={modifierModal.deductAmount} onChangeText={(v) => setModifierModal(m => ({ ...m, deductAmount: v }))} placeholderTextColor={colors.muted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Ед.</Text>
                      <TextInput style={styles.input} value={modifierModal.deductUnit} onChangeText={(v) => setModifierModal(m => ({ ...m, deductUnit: v }))} placeholderTextColor={colors.muted} />
                    </View>
                  </View>
                  <Text style={styles.hintText}>Оставь поле «Ингредиент» пустым, если этот модификатор не нужно списывать со склада.</Text>
                </>
              )}
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
  rowNameInactive: { color: colors.muted },
  rowPrice: { fontFamily: fonts.family, fontSize: 13, fontWeight: '700', color: colors.greenLight },
  empty: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', paddingVertical: 12 },
  hintText: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginBottom: 10, lineHeight: 17 },
  catChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e' },
  catChipLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted },
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
