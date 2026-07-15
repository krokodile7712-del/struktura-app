import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, Share } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import {
  getAllProductsAdmin, insertProduct, setProductActive,
  getProductVariants, saveProductAxesAndVariants,
  getProductModifierGroups, setProductModifierGroups, getAllModifierGroups,
  insertModifierGroup, updateModifierGroup, deleteModifierGroup,
  insertModifierOption, updateModifierOption, deleteModifierOption,
  getCostCardForVariant, saveCostCardForVariant,
  getUsers, updateUserPin,
  getDiscounts, setSetting, getBonusPct,
  getAllStock, updateStockThreshold,
  getUnlinkedCostCards,
  getBusinessProfile, updateBusinessProfile, applyBusinessPreset, BUSINESS_PRESETS,
  exportAllData,
} from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

export default function SettingsScreen({ navigation }) {
  // ── Данные ──
  const [products, setProducts]             = useState([]);
  const [users, setUsers]                   = useState([]);
  const [discounts, setDiscounts]           = useState([]);
  const [modifierGroups, setModifierGroups] = useState([]);
  const [stock, setStock]                   = useState([]);
  const [unlinkedCards, setUnlinkedCards]   = useState([]);
  const [profile, setProfile]               = useState(null);

  // ── Модалки ──
  const [productModal, setProductModal]   = useState(null);
  // { product, variants: [{id, label, price, sku, active}], groupIds: [], techCards: { [variantKey]: [{name, amount, unit}] } }
  const [ingredientPicker, setIngredientPicker] = useState(null); // { variantKey, search }
  const [newProductModal, setNewProductModal]   = useState(null); // { name, category, price }
  const [discountModal, setDiscountModal]       = useState(null);
  const [stockModal, setStockModal]             = useState(null);
  const [groupModal, setGroupModal]             = useState(null);
  // { id, name, selectionType, options: [{id, name, priceDelta, ingrToReplace, ingrToDeduct, deductAmount, deductUnit}] }
  const [optionModal, setOptionModal]           = useState(null); // { groupId, id, name, priceDelta, ingrToReplace, ingrToDeduct, deductAmount, deductUnit }

  // ── PIN ──
  const [pinBarista, setPinBarista] = useState('');
  const [pinAdmin, setPinAdmin]     = useState('');

  // ── Общие настройки ──
  const [bonusPct, setBonusPct]   = useState('10');
  const [exporting, setExporting] = useState(false);

  // ── Скрытый доступ к профилю бизнеса ──
  const [titleTaps, setTitleTaps]         = useState(0);
  const [profileUnlocked, setProfileUnlocked] = useState(false);
  const [keyPromptOpen, setKeyPromptOpen] = useState(false);
  const [keyInput, setKeyInput]           = useState('');
  const [profileDraft, setProfileDraft]   = useState(null); // { businessName, modules, terms, units, unitInput }

  useEffect(() => { loadAll(); }, []);

  const loadAll = () => {
    try {
      setProducts(getAllProductsAdmin());
      const u = getUsers();
      setUsers(u);
      setPinBarista(u.find(x => x.role === 'barista')?.pin || '');
      setPinAdmin(u.find(x => x.role === 'admin')?.pin || '');
      setDiscounts(getDiscounts());
      setModifierGroups(getAllModifierGroups());
      setStock(getAllStock());
      setBonusPct(String(getBonusPct()));
      setUnlinkedCards(getUnlinkedCostCards());
      setProfile(getBusinessProfile());
    } catch (e) { console.error(e); }
  };

  // ── Товары + варианты + модификаторы + техкарты ──
  const openProduct = (product) => {
    let raw = getProductVariants(product.id);
    if (raw.length === 0) {
      raw = [{ id: null, label: '', price: product.price || 0, sku: product.sku || '', active: true }];
    }
    const variants = raw.map(v => ({ id: v.id, label: v.label, price: String(v.price), sku: v.sku || '', active: v.active !== false }));
    const groups = getProductModifierGroups(product.id);
    const techCards = {};
    variants.forEach((v, idx) => {
      const key = v.id || `new-${idx}`;
      const card = v.id ? getCostCardForVariant(v.id) : null;
      techCards[key] = card ? card.ingredients.map(ing => ({ name: ing.name, amount: String(ing.amount), unit: ing.unit })) : [];
    });
    setProductModal({ product, variants, groupIds: groups.map(g => g.id), techCards });
  };

  const variantKey = (v, idx) => v.id || `new-${idx}`;

  const addVariantRow = () => {
    setProductModal(m => ({
      ...m,
      variants: [...m.variants, { id: null, label: '', price: '', sku: '', active: true }],
    }));
  };
  const removeVariantRow = (idx) => {
    setProductModal(m => {
      const key = variantKey(m.variants[idx], idx);
      const techCards = { ...m.techCards };
      delete techCards[key];
      return { ...m, variants: m.variants.filter((_, i) => i !== idx), techCards };
    });
  };
  const setVariantField = (idx, field, value) => {
    setProductModal(m => {
      const variants = [...m.variants];
      variants[idx] = { ...variants[idx], [field]: value };
      return { ...m, variants };
    });
  };

  const toggleGroupForProduct = (groupId) => {
    setProductModal(m => {
      const has = m.groupIds.includes(groupId);
      return { ...m, groupIds: has ? m.groupIds.filter(id => id !== groupId) : [...m.groupIds, groupId] };
    });
  };

  const addIngredientRow = (key, stockItem) => {
    setProductModal(m => ({
      ...m,
      techCards: { ...m.techCards, [key]: [...(m.techCards[key] || []), { name: stockItem.name, amount: '', unit: stockItem.unit }] },
    }));
  };
  const removeIngredientRow = (key, index) => {
    setProductModal(m => ({
      ...m,
      techCards: { ...m.techCards, [key]: m.techCards[key].filter((_, i) => i !== index) },
    }));
  };
  const setIngredientAmount = (key, index, value) => {
    setProductModal(m => {
      const rows = [...m.techCards[key]];
      rows[index] = { ...rows[index], amount: value };
      return { ...m, techCards: { ...m.techCards, [key]: rows } };
    });
  };

  const saveProduct = () => {
    if (!productModal) return;
    const payload = productModal.variants.map(v => ({
      id: v.id, label: v.label.trim(), price: parseFloat(v.price) || 0, sku: v.sku.trim(), active: v.active, axisValues: {},
    }));
    try {
      const saved = saveProductAxesAndVariants(productModal.product.id, [], payload);
      setProductModifierGroups(productModal.product.id, productModal.groupIds);

      productModal.variants.forEach((v, idx) => {
        const oldKey = variantKey(v, idx);
        const savedVariant = saved[idx];
        const ingredients = (productModal.techCards[oldKey] || [])
          .filter(r => r.name && parseFloat(r.amount) > 0)
          .map(r => ({ name: r.name, amount: parseFloat(r.amount) || 0, unit: r.unit, pricePerUnit: 0 }));
        saveCostCardForVariant(savedVariant.id, ingredients);
      });
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
  const openNewProduct = () => setNewProductModal({ name: '', category: products[0]?.category || '', price: '' });
  const saveNewProduct = () => {
    if (!newProductModal || !newProductModal.name.trim() || !newProductModal.category.trim()) return;
    try {
      insertProduct({
        name: newProductModal.name.trim(),
        category: newProductModal.category.trim(),
        price_s: 0, price_m: 0, price_l: 0,
        has_milk: false, has_syrup: false,
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
    try { setSetting('discounts', JSON.stringify(list)); setDiscounts(list); } catch (e) { console.error(e); }
  };
  const openNewDiscount = () => setDiscountModal({ index: -1, name: '', pct: '' });
  const openEditDiscount = (i) => setDiscountModal({ index: i, name: discounts[i].name, pct: String(discounts[i].pct) });
  const saveDiscountModal = () => {
    if (!discountModal || !discountModal.name.trim() || !discountModal.pct) return;
    const entry = { name: discountModal.name.trim(), pct: parseFloat(discountModal.pct) || 0 };
    const list = [...discounts];
    if (discountModal.index === -1) list.push(entry); else list[discountModal.index] = entry;
    saveDiscounts(list);
    setDiscountModal(null);
  };
  const deleteDiscountModal = () => {
    if (!discountModal || discountModal.index === -1) return;
    saveDiscounts(discounts.filter((_, i) => i !== discountModal.index));
    setDiscountModal(null);
  };

  // ── Группы модификаторов ──
  const openNewGroup = () => setGroupModal({ id: null, name: '', selectionType: 'single' });
  const openEditGroup = (g) => setGroupModal({ id: g.id, name: g.name, selectionType: g.selection_type });
  const saveGroupModal = () => {
    if (!groupModal || !groupModal.name.trim()) return;
    try {
      if (groupModal.id) updateModifierGroup(groupModal.id, { name: groupModal.name.trim(), selectionType: groupModal.selectionType });
      else insertModifierGroup({ name: groupModal.name.trim(), selectionType: groupModal.selectionType });
      loadAll();
    } catch (e) { console.error(e); }
    setGroupModal(null);
  };
  const deleteGroupModal = () => {
    if (!groupModal?.id) return;
    try { deleteModifierGroup(groupModal.id); loadAll(); } catch (e) { console.error(e); }
    setGroupModal(null);
  };

  const openNewOption = (groupId) => setOptionModal({ groupId, id: null, name: '', priceDelta: '', ingrToReplace: '', ingrToDeduct: '', deductAmount: '', deductUnit: 'мл' });
  const openEditOption = (groupId, opt) => setOptionModal({
    groupId, id: opt.id, name: opt.name, priceDelta: String(opt.price_delta || 0),
    ingrToReplace: opt.ingr_to_replace || '', ingrToDeduct: opt.ingr_to_deduct || '',
    deductAmount: opt.deduct_amount ? String(opt.deduct_amount) : '', deductUnit: opt.deduct_unit || 'мл',
  });
  const saveOptionModal = () => {
    if (!optionModal || !optionModal.name.trim()) return;
    const payload = {
      name: optionModal.name.trim(),
      priceDelta: parseFloat(optionModal.priceDelta) || 0,
      ingrToReplace: optionModal.ingrToReplace.trim(),
      ingrToDeduct: optionModal.ingrToDeduct.trim(),
      deductAmount: parseFloat(optionModal.deductAmount) || 0,
      deductUnit: optionModal.deductUnit.trim(),
    };
    try {
      if (optionModal.id) updateModifierOption(optionModal.id, payload);
      else insertModifierOption({ groupId: optionModal.groupId, ...payload });
      loadAll();
    } catch (e) { console.error(e); }
    setOptionModal(null);
  };
  const deleteOptionModal = () => {
    if (!optionModal?.id) return;
    try { deleteModifierOption(optionModal.id); loadAll(); } catch (e) { console.error(e); }
    setOptionModal(null);
  };

  // ── Профиль бизнеса (скрытый доступ) ──
  const handleTitleTap = () => {
    const next = titleTaps + 1;
    setTitleTaps(next);
    if (next >= 5) {
      setTitleTaps(0);
      if (profile?.access_key) setKeyPromptOpen(true);
      else openProfileEditor(); // ключ ещё не задан — пускаем сразу один раз, чтобы можно было его установить
    }
  };
  const checkKey = () => {
    if (keyInput === profile?.access_key) {
      setKeyPromptOpen(false);
      setKeyInput('');
      openProfileEditor();
    } else {
      setKeyInput('');
    }
  };
  const openProfileEditor = () => {
    setProfileDraft({
      businessName: profile?.business_name || '',
      modules: { ...(profile?.modules || {}) },
      terms: { ...(profile?.terms || {}) },
      units: [...(profile?.units || [])],
      accessKey: profile?.access_key || '',
      unitInput: '',
    });
    setProfileUnlocked(true);
  };
  const applyPresetDraft = (key) => {
    const preset = BUSINESS_PRESETS[key];
    if (!preset) return;
    setProfileDraft(d => ({ ...d, modules: { ...preset.modules }, terms: { ...preset.terms }, units: [...preset.units] }));
  };
  const toggleModuleDraft = (key) => {
    setProfileDraft(d => ({ ...d, modules: { ...d.modules, [key]: !d.modules[key] } }));
  };
  const setTermDraft = (key, value) => {
    setProfileDraft(d => ({ ...d, terms: { ...d.terms, [key]: value } }));
  };
  const addUnitDraft = () => {
    const val = profileDraft.unitInput.trim();
    if (!val || profileDraft.units.includes(val)) return;
    setProfileDraft(d => ({ ...d, units: [...d.units, val], unitInput: '' }));
  };
  const removeUnitDraft = (u) => {
    setProfileDraft(d => ({ ...d, units: d.units.filter(x => x !== u) }));
  };
  const saveProfileDraft = () => {
    if (!profileDraft) return;
    try {
      updateBusinessProfile({
        businessName: profileDraft.businessName,
        modules: profileDraft.modules,
        terms: profileDraft.terms,
        units: profileDraft.units,
        accessKey: profileDraft.accessKey,
      });
      loadAll();
    } catch (e) { console.error(e); }
    setProfileUnlocked(false);
  };

  // ── Экспорт / бэкап ──
  const handleExport = async () => {
    setExporting(true);
    try {
      const data = exportAllData();
      const json = JSON.stringify(data, null, 2);
      await Share.share({ title: `Бэкап ${new Date().toISOString().slice(0, 10)}`, message: json });
    } catch (e) { console.error(e); }
    setExporting(false);
  };

  const categories = [...new Set(products.map(p => p.category))];
  const modules = profile?.modules || {};
  const terms = profile?.terms || {};

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Настройки" onBack={() => navigation.navigate('Admin')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>

        <Pressable onPress={handleTitleTap}>
          <Text style={styles.hiddenHint}>{terms.item || 'Товар'} · {profile?.preset ? BUSINESS_PRESETS[profile.preset]?.label || profile.preset : ''}</Text>
        </Pressable>

        {/* Меню и цены */}
        <MetalCard>
          <Text style={styles.blockTitle}>☕ {terms.item || 'Товар'}ы и цены</Text>
          {categories.map(cat => (
            <View key={cat} style={{ marginBottom: 12 }}>
              <Text style={styles.catHeader}>{cat}</Text>
              {products.filter(p => p.category === cat).map(p => {
                const inactive = !p.active;
                return (
                  <Pressable key={p.id} style={styles.row} onPress={() => openProduct(p)}>
                    <Text style={[styles.rowName, inactive && styles.rowNameInactive]}>
                      {inactive ? '🚫 ' : ''}{p.name}
                    </Text>
                    <Text style={styles.rowPrice}>›</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
          {products.length === 0 && <Text style={styles.empty}>Пока нет товаров.</Text>}
          <MetalButton title={`+ Добавить ${(terms.item || 'товар').toLowerCase()}`} variant="default" onPress={openNewProduct} />
        </MetalCard>

        {/* Группы модификаторов */}
        {modules.modifiers !== false && (
          <MetalCard style={{ marginTop: 12 }}>
            <Text style={styles.blockTitle}>🧩 Модификаторы</Text>
            <Text style={styles.hintText}>Группы опций для товаров (напр. «Молоко», «Цвет», «Размер ленты») — единичный или множественный выбор.</Text>
            {modifierGroups.length === 0 && <Text style={styles.empty}>Групп пока нет.</Text>}
            {modifierGroups.map(g => (
              <Pressable key={g.id} style={styles.row} onPress={() => openEditGroup(g)}>
                <Text style={styles.rowName}>{g.name} <Text style={styles.rowSub}>({g.selection_type === 'multiple' ? 'неск.' : 'один'})</Text></Text>
                <Text style={styles.rowPrice}>{g.options.length} опц. ›</Text>
              </Pressable>
            ))}
            <MetalButton title="+ Добавить группу" variant="default" onPress={openNewGroup} />
          </MetalCard>
        )}

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
        {modules.loyalty !== false && (
          <MetalCard style={{ marginTop: 12 }}>
            <Text style={styles.blockTitle}>⭐ Бонусная программа</Text>
            <Text style={styles.fieldLabel}>Процент начисления баллов</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={bonusPct} onChangeText={setBonusPct} placeholderTextColor={colors.muted} />
            <MetalButton title="Сохранить" variant="success" onPress={saveBonusPct} />
          </MetalCard>
        )}

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

        {/* Пороги остатка склада */}
        {modules.stock !== false && (
          <MetalCard style={{ marginTop: 12 }}>
            <Text style={styles.blockTitle}>📦 Пороги остатка склада</Text>
            {stock.length === 0 && <Text style={styles.empty}>Нет данных на складе.</Text>}
            {stock.map(s => (
              <Pressable key={s.id} style={styles.row} onPress={() => openStockModal(s)}>
                <Text style={styles.rowName}>{s.name}</Text>
                <Text style={styles.rowPrice}>порог: {s['порог']} {s.unit} ›</Text>
              </Pressable>
            ))}
          </MetalCard>
        )}

        {unlinkedCards.length > 0 && (
          <MetalCard style={{ marginTop: 12 }}>
            <Text style={styles.blockTitle}>⚠️ Несвязанные техкарты</Text>
            <Text style={styles.hintText}>Эти техкарты остались от старой модели и не привязаны к конкретному варианту товара. Пересоздайте их через карточку товара выше.</Text>
            {unlinkedCards.map(c => (
              <View key={c.id} style={styles.row}><Text style={styles.rowName}>{c.name}</Text></View>
            ))}
          </MetalCard>
        )}

        {/* Резервное копирование */}
        <MetalCard style={{ marginTop: 12, marginBottom: 20 }}>
          <Text style={styles.blockTitle}>💾 Резервное копирование</Text>
          <Text style={styles.hintText}>Открывает системное меню «Поделиться» с данными в виде текста.</Text>
          <MetalButton title={exporting ? 'Экспорт...' : '📤 Экспорт и поделиться'} variant="pay" onPress={handleExport} disabled={exporting} />
        </MetalCard>

      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Kassa" />

      {/* Модалка товара */}
      <Modal visible={!!productModal} transparent animationType="fade" onRequestClose={() => setProductModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setProductModal(null)} />
          {productModal && (
            <View style={[styles.modalInner, { maxHeight: '88%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{productModal.product.name}</Text>
                <Pressable onPress={() => setProductModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.sectionTitle}>Варианты</Text>
                <Text style={styles.hintText}>Если у товара один вариант — оставь название пустым, он не будет показываться отдельным чипом в кассе.</Text>
                {productModal.variants.map((v, idx) => {
                  const key = variantKey(v, idx);
                  return (
                    <View key={key} style={styles.variantBlock}>
                      <View style={styles.variantHeaderRow}>
                        <TextInput
                          style={[styles.input, { flex: 1 }]}
                          placeholder="Название варианта (напр. Маленький)"
                          placeholderTextColor={colors.muted}
                          value={v.label}
                          onChangeText={(val) => setVariantField(idx, 'label', val)}
                        />
                        {productModal.variants.length > 1 && (
                          <Pressable onPress={() => removeVariantRow(idx)} hitSlop={8} style={{ marginLeft: 8 }}>
                            <Text style={styles.ingredientRemove}>✕</Text>
                          </Pressable>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                        <TextInput
                          style={[styles.input, { flex: 1 }]}
                          keyboardType="numeric"
                          placeholder="Цена, ₽"
                          placeholderTextColor={colors.muted}
                          value={v.price}
                          onChangeText={(val) => setVariantField(idx, 'price', val)}
                        />
                        <TextInput
                          style={[styles.input, { flex: 1 }]}
                          placeholder="Артикул/SKU"
                          placeholderTextColor={colors.muted}
                          value={v.sku}
                          onChangeText={(val) => setVariantField(idx, 'sku', val)}
                        />
                      </View>

                      <Text style={styles.techCardTitle}>🧾 Техкарта{v.label ? ` · ${v.label}` : ''}</Text>
                      {(productModal.techCards[key] || []).length === 0 && (
                        <Text style={styles.hintText}>Ингредиенты не заданы — списание со склада работать не будет.</Text>
                      )}
                      {(productModal.techCards[key] || []).map((row, ri) => (
                        <View key={ri} style={styles.ingredientRow}>
                          <Text style={styles.ingredientName} numberOfLines={1}>{row.name}</Text>
                          <TextInput
                            style={styles.ingredientAmount}
                            keyboardType="numeric"
                            value={row.amount}
                            onChangeText={(val) => setIngredientAmount(key, ri, val)}
                            placeholder="0"
                            placeholderTextColor={colors.muted}
                          />
                          <Text style={styles.ingredientUnit}>{row.unit}</Text>
                          <Pressable onPress={() => removeIngredientRow(key, ri)} hitSlop={8}>
                            <Text style={styles.ingredientRemove}>✕</Text>
                          </Pressable>
                        </View>
                      ))}
                      <Pressable style={styles.addIngredientBtn} onPress={() => setIngredientPicker({ variantKey: key, search: '' })}>
                        <Text style={styles.addIngredientBtnLabel}>+ ингредиент со склада</Text>
                      </Pressable>
                    </View>
                  );
                })}
                <MetalButton title="+ Добавить вариант" variant="default" onPress={addVariantRow} style={{ marginTop: 4 }} />

                {modifierGroups.length > 0 && (
                  <>
                    <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Модификаторы</Text>
                    {modifierGroups.map(g => {
                      const checked = productModal.groupIds.includes(g.id);
                      return (
                        <Pressable key={g.id} style={styles.checkRow} onPress={() => toggleGroupForProduct(g.id)}>
                          <Text style={styles.checkBox}>{checked ? '☑' : '☐'}</Text>
                          <Text style={styles.rowName}>{g.name}</Text>
                        </Pressable>
                      );
                    })}
                  </>
                )}
              </ScrollView>
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

      {/* Модалка выбора ингредиента со склада */}
      <Modal visible={!!ingredientPicker} transparent animationType="fade" onRequestClose={() => setIngredientPicker(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setIngredientPicker(null)} />
          {ingredientPicker && (
            <View style={[styles.modalInner, { maxHeight: '75%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Ингредиент со склада</Text>
                <Pressable onPress={() => setIngredientPicker(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <TextInput
                style={styles.input}
                placeholder="Поиск..."
                placeholderTextColor={colors.muted}
                value={ingredientPicker.search}
                onChangeText={(v) => setIngredientPicker(p => ({ ...p, search: v }))}
              />
              <ScrollView style={{ marginTop: 8 }} showsVerticalScrollIndicator={false}>
                {stock.length === 0 && <Text style={styles.hintText}>На складе пока нет позиций.</Text>}
                {stock
                  .filter(s => s.name.toLowerCase().includes(ingredientPicker.search.trim().toLowerCase()))
                  .map(s => (
                    <Pressable
                      key={s.id}
                      style={styles.row}
                      onPress={() => { addIngredientRow(ingredientPicker.variantKey, s); setIngredientPicker(null); }}
                    >
                      <Text style={styles.rowName}>{s.name}</Text>
                      <Text style={styles.rowPrice}>{s.unit}</Text>
                    </Pressable>
                  ))}
              </ScrollView>
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
                <Text style={styles.modalTitle}>Новый {(terms.item || 'товар').toLowerCase()}</Text>
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
              <Text style={styles.hintText}>Цену и варианты настроишь сразу после создания — тапни на новый товар в списке.</Text>
              <MetalButton title="Добавить" variant="success" onPress={saveNewProduct} style={{ marginTop: 10 }} />
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

      {/* Модалка группы модификаторов */}
      <Modal visible={!!groupModal} transparent animationType="fade" onRequestClose={() => setGroupModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setGroupModal(null)} />
          {groupModal && (
            <View style={[styles.modalInner, { maxHeight: '80%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{groupModal.id ? 'Группа модификаторов' : 'Новая группа'}</Text>
                <Pressable onPress={() => setGroupModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <Text style={styles.fieldLabel}>Название группы</Text>
              <TextInput style={styles.input} value={groupModal.name} onChangeText={(v) => setGroupModal(m => ({ ...m, name: v }))} placeholder="напр. Молоко" placeholderTextColor={colors.muted} />
              <View style={styles.chipsRowSmall}>
                <Pressable style={[styles.chipSmall, groupModal.selectionType === 'single' && styles.chipSmallActive]} onPress={() => setGroupModal(m => ({ ...m, selectionType: 'single' }))}>
                  <Text style={[styles.chipSmallLabel, groupModal.selectionType === 'single' && styles.chipSmallLabelActive]}>Один вариант</Text>
                </Pressable>
                <Pressable style={[styles.chipSmall, groupModal.selectionType === 'multiple' && styles.chipSmallActive]} onPress={() => setGroupModal(m => ({ ...m, selectionType: 'multiple' }))}>
                  <Text style={[styles.chipSmallLabel, groupModal.selectionType === 'multiple' && styles.chipSmallLabelActive]}>Несколько</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <MetalButton title="Сохранить" variant="success" onPress={saveGroupModal} style={{ flex: 1 }} />
                {groupModal.id && <MetalButton title="Удалить группу" variant="danger" onPress={deleteGroupModal} style={{ flex: 1 }} />}
              </View>

              {groupModal.id && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Опции</Text>
                  {(modifierGroups.find(g => g.id === groupModal.id)?.options || []).map(opt => (
                    <Pressable key={opt.id} style={styles.row} onPress={() => openEditOption(groupModal.id, opt)}>
                      <Text style={styles.rowName}>{opt.name}</Text>
                      <Text style={styles.rowPrice}>{opt.price_delta > 0 ? `+${opt.price_delta}₽ ` : ''}›</Text>
                    </Pressable>
                  ))}
                  <MetalButton title="+ Добавить опцию" variant="default" onPress={() => openNewOption(groupModal.id)} style={{ marginTop: 8 }} />
                </>
              )}
            </View>
          )}
        </View>
      </Modal>

      {/* Модалка опции модификатора */}
      <Modal visible={!!optionModal} transparent animationType="fade" onRequestClose={() => setOptionModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setOptionModal(null)} />
          {optionModal && (
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{optionModal.id ? 'Изменить опцию' : 'Новая опция'}</Text>
                <Pressable onPress={() => setOptionModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <Text style={styles.fieldLabel}>Название</Text>
              <TextInput style={styles.input} value={optionModal.name} onChangeText={(v) => setOptionModal(m => ({ ...m, name: v }))} placeholderTextColor={colors.muted} />
              <Text style={styles.fieldLabel}>Доплата, ₽</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={optionModal.priceDelta} onChangeText={(v) => setOptionModal(m => ({ ...m, priceDelta: v }))} placeholderTextColor={colors.muted} />

              <Text style={styles.fieldLabel}>Заменяет ингредиент склада на (если это замена)</Text>
              <TextInput style={styles.input} value={optionModal.ingrToReplace} onChangeText={(v) => setOptionModal(m => ({ ...m, ingrToReplace: v }))} placeholder="напр. Овсяное молоко" placeholderTextColor={colors.muted} />
              <Text style={styles.hintText}>Сработает, если в техкарте товара есть ингредиент с названием как у группы модификатора (напр. группа «Молоко» → ингредиент «Молоко»).</Text>

              <Text style={styles.fieldLabel}>Или списывает дополнительно (если это добавка)</Text>
              <TextInput style={styles.input} value={optionModal.ingrToDeduct} onChangeText={(v) => setOptionModal(m => ({ ...m, ingrToDeduct: v }))} placeholder="напр. Сироп ваниль" placeholderTextColor={colors.muted} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.fieldLabel}>Расход</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={optionModal.deductAmount} onChangeText={(v) => setOptionModal(m => ({ ...m, deductAmount: v }))} placeholderTextColor={colors.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Ед.</Text>
                  <TextInput style={styles.input} value={optionModal.deductUnit} onChangeText={(v) => setOptionModal(m => ({ ...m, deductUnit: v }))} placeholderTextColor={colors.muted} />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <MetalButton title="Сохранить" variant="success" onPress={saveOptionModal} style={{ flex: 1 }} />
                {optionModal.id && <MetalButton title="Удалить" variant="danger" onPress={deleteOptionModal} style={{ flex: 1 }} />}
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Модалка ввода ключа доступа к профилю бизнеса */}
      <Modal visible={keyPromptOpen} transparent animationType="fade" onRequestClose={() => setKeyPromptOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setKeyPromptOpen(false)} />
          <View style={styles.modalInner}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ключ доступа</Text>
              <Pressable onPress={() => setKeyPromptOpen(false)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
            </View>
            <TextInput style={styles.input} secureTextEntry value={keyInput} onChangeText={setKeyInput} placeholderTextColor={colors.muted} />
            <MetalButton title="Войти" variant="success" onPress={checkKey} style={{ marginTop: 10 }} />
          </View>
        </View>
      </Modal>

      {/* Модалка профиля бизнеса */}
      <Modal visible={profileUnlocked} transparent animationType="fade" onRequestClose={() => setProfileUnlocked(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setProfileUnlocked(false)} />
          {profileDraft && (
            <View style={[styles.modalInner, { maxHeight: '88%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Профиль бизнеса</Text>
                <Pressable onPress={() => setProfileUnlocked(false)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>Название бизнеса</Text>
                <TextInput style={styles.input} value={profileDraft.businessName} onChangeText={(v) => setProfileDraft(d => ({ ...d, businessName: v }))} placeholderTextColor={colors.muted} />

                <Text style={styles.sectionTitle}>Быстрый старт (пресет)</Text>
                <View style={styles.chipsRowSmall}>
                  {Object.keys(BUSINESS_PRESETS).map(key => (
                    <Pressable key={key} style={styles.chipSmall} onPress={() => applyPresetDraft(key)}>
                      <Text style={styles.chipSmallLabel}>{BUSINESS_PRESETS[key].label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.hintText}>Применяет стартовый набор модулей/терминов/единиц — дальше можно поменять вручную.</Text>

                <Text style={styles.sectionTitle}>Модули</Text>
                {[
                  ['stock', 'Склад'], ['shifts', 'Смены'], ['clients', 'Клиенты'],
                  ['loyalty', 'Лояльность'], ['modifiers', 'Модификаторы'], ['inventory', 'Инвентаризация'],
                ].map(([key, label]) => (
                  <Pressable key={key} style={styles.checkRow} onPress={() => toggleModuleDraft(key)}>
                    <Text style={styles.checkBox}>{profileDraft.modules[key] ? '☑' : '☐'}</Text>
                    <Text style={styles.rowName}>{label}</Text>
                  </Pressable>
                ))}

                <Text style={styles.sectionTitle}>Терминология</Text>
                {[
                  ['item', 'Товар/услуга'], ['client', 'Клиент'], ['order', 'Заказ'], ['category', 'Категория'],
                ].map(([key, label]) => (
                  <View key={key}>
                    <Text style={styles.fieldLabel}>{label}</Text>
                    <TextInput style={styles.input} value={profileDraft.terms[key] || ''} onChangeText={(v) => setTermDraft(key, v)} placeholderTextColor={colors.muted} />
                  </View>
                ))}

                <Text style={styles.sectionTitle}>Единицы измерения</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {profileDraft.units.map(u => (
                    <Pressable key={u} style={styles.unitChip} onPress={() => removeUnitDraft(u)}>
                      <Text style={styles.catChipLabel}>{u} ✕</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[styles.input, { flex: 1 }]} value={profileDraft.unitInput} onChangeText={(v) => setProfileDraft(d => ({ ...d, unitInput: v }))} placeholder="напр. шт" placeholderTextColor={colors.muted} />
                  <MetalButton title="+" variant="default" onPress={addUnitDraft} style={{ width: 50 }} />
                </View>

                <Text style={styles.sectionTitle}>Ключ доступа к этому разделу</Text>
                <TextInput style={styles.input} value={profileDraft.accessKey} onChangeText={(v) => setProfileDraft(d => ({ ...d, accessKey: v }))} placeholder="оставь пустым — раздел без пароля" placeholderTextColor={colors.muted} />
              </ScrollView>
              <MetalButton title="Сохранить профиль" variant="success" onPress={saveProfileDraft} style={{ marginTop: 10 }} />
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
  hiddenHint: { textAlign: 'center', fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginBottom: 10 },
  blockTitle: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12, textAlign: 'center' },
  catHeader: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowName: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.text, flex: 1 },
  rowSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  rowNameInactive: { color: colors.muted },
  rowPrice: { fontFamily: fonts.family, fontSize: 13, fontWeight: '700', color: colors.greenLight },
  empty: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', paddingVertical: 12 },
  hintText: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginBottom: 10, lineHeight: 17 },
  catChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e' },
  catChipLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted },
  unitChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e' },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 10 },
  sectionTitle: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text, textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  input: { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 14, fontFamily: fonts.familyRegular },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalInner: { width: '55%', maxWidth: 540, backgroundColor: '#0e0f11', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.borderHi },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, flex: 1 },
  modalClose: { fontSize: 18, color: colors.muted, padding: 4 },
  variantBlock: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  variantHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  techCardTitle: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text, marginTop: 10, marginBottom: 6 },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  ingredientName: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 13, color: colors.text },
  ingredientAmount: { width: 64, padding: 8, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.text, fontSize: 13, fontFamily: fonts.family, textAlign: 'center' },
  ingredientUnit: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, width: 30 },
  ingredientRemove: { fontSize: 15, color: colors.redLight, paddingHorizontal: 4 },
  addIngredientBtn: { paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, borderStyle: 'dashed', marginTop: 2 },
  addIngredientBtnLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.greenLight },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  checkBox: { fontSize: 18, color: colors.greenLight, width: 22 },
  chipsRowSmall: { flexDirection: 'row', gap: 8, marginTop: 8 },
  chipSmall: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e' },
  chipSmallActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.18)' },
  chipSmallLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  chipSmallLabelActive: { color: colors.greenLight },
});
