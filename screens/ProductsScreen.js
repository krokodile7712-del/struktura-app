import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Modal, Alert,
} from 'react-native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import EmptyState from '../components/EmptyState';
import Toggle from '../components/Toggle';
import InfoTip from '../components/InfoTip';
import { useFocusEffect } from '@react-navigation/native';
import {
  getAllProductsAdmin, insertProduct, setProductActive, deleteProduct,
  getProductVariants, upsertProductVariants,
  getCostCardForVariant, saveCostCardForVariant,
  getAllStock, getCategories, cleanOrphanCostIngredients,
} from '../db/queries';
import { getDb } from '../db/database';
import { getHomeRoute } from '../db/session';
import { colors, fonts } from '../constants/theme';

const fmt = n => (n || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ─── Модалка товара ───────────────────────────────────────────────────────────
function ProductModal({ product, variants, techCards, stock, categories, onClose, onSave, onDelete }) {
  const [name, setName]           = useState(product?.name || '');
  const [category, setCategory]   = useState(product?.category || (categories[0] || ''));
  const [active, setActive]       = useState(product?.active !== 0);
  const [vars, setVars]           = useState(
    variants.length > 0
      ? variants.map(v => ({ id: v.id, label: v.label || v.size || '', price: String(v.price || ''), ings: techCards[v.id] || [] }))
      : [{ id: null, label: '', price: String(product?.price || ''), ings: [] }]
  );
  const [ingPicker, setIngPicker] = useState(null); // varIndex
  const [ingSearch, setIngSearch] = useState('');

  const filteredStock = stock.filter(s =>
    !ingSearch.trim() || s.name.toLowerCase().includes(ingSearch.toLowerCase())
  );

  const addVariant = () => setVars(v => [...v, { id: null, label: '', price: '', ings: [] }]);
  const removeVariant = (i) => setVars(v => v.filter((_,j) => j !== i));
  const setVarField = (i, field, val) => setVars(v => v.map((r,j) => j===i ? {...r,[field]:val} : r));
  const addIngredient = (varIdx, stockItem) => {
    setVars(v => v.map((r,j) => j===varIdx ? {
      ...r,
      ings: [...r.ings, { name: stockItem.name, amount: '', unit: stockItem.unit, price_per_unit: String(stockItem.avg_price || stockItem.last_price || '') }]
    } : r));
    setIngPicker(null);
    setIngSearch('');
  };
  const removeIng = (varIdx, ingIdx) => setVars(v => v.map((r,j) => j===varIdx ? { ...r, ings: r.ings.filter((_,k)=>k!==ingIdx) } : r));
  const setIngField = (varIdx, ingIdx, field, val) => setVars(v => v.map((r,j) => j===varIdx ? {
    ...r, ings: r.ings.map((ing,k) => k===ingIdx ? {...ing,[field]:val} : ing)
  } : r));

  const save = () => {
    if (!name.trim()) { Alert.alert('Введите название товара'); return; }
    onSave({ name: name.trim(), category, active, vars });
  };

  return (
    <View style={styles.modalBox}>
      {/* Заголовок */}
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>{product?.id ? 'Редактировать' : 'Новый товар'}</Text>
        <Pressable onPress={onClose} hitSlop={14} style={styles.closeBtn}>
          <Text style={styles.closeTxt}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Название */}
        <Text style={styles.fieldLabel}>Название</Text>
        <TextInput color={colors.text} style={styles.input} value={name} onChangeText={setName} placeholder="Название товара" placeholderTextColor={colors.muted} />

        {/* Категория */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 8 }}>
          <Text style={[styles.fieldLabel, { marginTop: 0, marginBottom: 0 }]}>Категория</Text>
          <InfoTip title="Категория" text="Категория помогает группировать товары в списке и в кассе. Например: Кофе, Допы, Еда. Клиент её не видит — это только для вас." />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {categories.map(cat => (
            <Pressable key={cat}
              style={[styles.catChip, category === cat && styles.catChipActive]}
              onPress={() => setCategory(cat)}>
              <Text style={[styles.catChipTxt, category === cat && styles.catChipTxtActive]}>{cat}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Варианты и цены */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Text style={[styles.fieldLabel, { marginTop: 0, marginBottom: 0 }]}>
              {vars.length > 1 ? 'Размеры / Виды' : 'Цена продажи'}
            </Text>
            <InfoTip title="Размеры и виды" text="Если товар продаётся в одном варианте — просто введите цену. Если есть размеры (S/M/L) или виды (сырник с джемом / без) — нажмите «Добавить размер»." />
          </View>
          <Pressable onPress={addVariant} style={styles.addVarBtn}>
            <Text style={styles.addVarTxt}>+ Добавить размер</Text>
          </Pressable>
        </View>

        {vars.map((v, vi) => (
          <View key={vi} style={[styles.varBlock, vi > 0 && { marginTop: 12 }]}>
            <View style={styles.varRow}>
              {vars.length > 1 && (
                <TextInput color={colors.text} style={[styles.input, { flex: 1, marginRight: 8 }]}
                  value={v.label} onChangeText={val => setVarField(vi, 'label', val)}
                  placeholder="Название варианта (S, L…)" placeholderTextColor={colors.muted} />
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TextInput color={colors.text} style={[styles.input, { width: 90, textAlign: 'center' }]}
                  keyboardType="numeric" value={v.price} onChangeText={val => setVarField(vi, 'price', val)}
                  placeholder="0" placeholderTextColor={colors.muted} />
                <Text style={{ color: colors.muted, fontFamily: fonts.familySemibold }}>₽</Text>
                {vars.length > 1 && (
                  <Pressable onPress={() => removeVariant(vi)} hitSlop={10}>
                    <Text style={{ color: colors.muted, fontSize: 18 }}>✕</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Техкарта варианта */}
            <View style={styles.techBlock}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Text style={styles.techTitle}>Что списывается со склада{v.ings.length > 0 ? ` (${v.ings.length})` : ''}</Text>
                <InfoTip title="Списание со склада" text="При каждой продаже этого товара указанные позиции автоматически спишутся со склада. Например: кофе 18г, молоко 150мл. Цена позиций подтягивается из последней закупки." />
                {v.ings.length > 0 && <Text style={[styles.techTitle, { color: 'rgba(61,158,146,0.6)', fontSize: 10, marginLeft: 'auto' }]}>цена из закупок</Text>}
              </View>
              {v.ings.map((ing, ii) => (
                <View key={ii} style={styles.ingRow}>
                  <Text style={styles.ingName} numberOfLines={1}>{ing.name}</Text>
                  <TextInput color={colors.text} style={styles.ingInput}
                    keyboardType="numeric" value={ing.amount}
                    onChangeText={val => setIngField(vi, ii, 'amount', val)}
                    placeholder="0" placeholderTextColor={colors.muted} />
                  <Text style={styles.ingUnit}>{ing.unit}</Text>
                  <TextInput color={colors.text} style={[styles.ingInput, { width: 60 }]}
                    keyboardType="numeric" value={ing.price_per_unit}
                    onChangeText={val => setIngField(vi, ii, 'price_per_unit', val)}
                    placeholder={ing.price_per_unit ? ing.price_per_unit : 'авто'} placeholderTextColor={colors.muted} />
                  <Text style={styles.ingUnit}>₽</Text>
                  <Pressable onPress={() => removeIng(vi, ii)} hitSlop={10}>
                    <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable style={styles.addIngBtn} onPress={() => setIngPicker(vi)}>
                <Text style={styles.addIngTxt}>+ Добавить позицию из склада</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {/* Активен */}
        <View style={styles.activeRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.activeLabel}>Продаётся сейчас</Text>
          <InfoTip title="Продаётся сейчас" text="Если выключить — товар пропадёт из кассы но не удалится. Удобно для сезонных позиций или когда закончился ингредиент." />
        </View>
          <Toggle value={active} onValueChange={setActive} size="sm" />
        </View>

        {/* Кнопки */}
        <Pressable style={({ pressed }) => [styles.confirmBtn, { marginTop: 20 }, pressed && { opacity: 0.88 }]} onPress={save}>
          <Text style={styles.confirmBtnTxt}>Сохранить</Text>
        </Pressable>

        {product?.id && (
          <Pressable style={styles.deleteBtn} onPress={() => onDelete(product.id)}>
            <Text style={styles.deleteBtnTxt}>Убрать из меню навсегда</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Пикер ингредиентов */}
      {ingPicker !== null && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setIngPicker(null)}>
          <View style={styles.pickerRoot}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setIngPicker(null)} />
            <View style={styles.pickerBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Выбрать ингредиент</Text>
                <Pressable onPress={() => setIngPicker(null)} hitSlop={14} style={styles.closeBtn}>
                  <Text style={styles.closeTxt}>✕</Text>
                </Pressable>
              </View>
              <View style={{ padding: 12 }}>
                <TextInput color={colors.text} style={styles.input} value={ingSearch} onChangeText={setIngSearch}
                  placeholder="Поиск..." placeholderTextColor={colors.muted} autoFocus />
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                {filteredStock.map((s, idx) => (
                  <Pressable key={s.id}
                    style={({ pressed }) => [styles.stockRow, idx < filteredStock.length-1 && styles.rowDiv, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
                    onPress={() => addIngredient(ingPicker, s)}>
                    <Text style={[styles.ingName, { flex: 1 }]}>{s.name}</Text>
                    <Text style={styles.ingUnit}>{s.остаток} {s.unit}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable style={[styles.confirmBtn, { margin: 12 }]} onPress={() => setIngPicker(null)}>
                <Text style={styles.confirmBtnTxt}>Готово</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ─── Главный экран ────────────────────────────────────────────────────────────
export default function ProductsScreen({ navigation }) {
  const [products, setProducts]   = useState([]);
  const [stock, setStock]         = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch]       = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [openCats, setOpenCats]   = useState({});
  const [modal, setModal]         = useState(null); // { product, variants, techCards }

  const load = useCallback(() => {
    try {
      cleanOrphanCostIngredients();
      setProducts(getAllProductsAdmin());
      setStock(getAllStock());
      const cats = getCategories ? getCategories() : [];
      setCategories(cats.length ? cats : ['Кофе', 'Допы', 'Прочее']);
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openProduct = (product) => {
    const variants = product?.id ? (getProductVariants(product.id) || []) : [];
    const techCards = {};
    for (const v of variants) {
      const card = getCostCardForVariant(v.id);
      if (card) techCards[v.id] = card.ingredients.map(i => ({
        ...i, amount: String(i.amount), price_per_unit: String(i.price_per_unit || '')
      }));
    }
    setModal({ product, variants, techCards });
  };

  const handleSave = ({ name, category, active, vars }) => {
    const step = { n: 0 };
    try {
      const db = getDb();
      let productId = modal.product?.id;

      // 1. Создаём или обновляем товар
      step.n = 1;
      if (!productId) {
        const res = db.runSync(
          `INSERT INTO products (name, category, price, active) VALUES (?, ?, ?, 1)`,
          [name, category, parseFloat(vars[0]?.price) || 0]
        );
        productId = Number(res.lastInsertRowId);
      } else {
        db.runSync(
          `UPDATE products SET name=?, category=?, active=? WHERE id=?`,
          [name, category, active ? 1 : 0, productId]
        );
      }

      // 2. Сохраняем варианты
      step.n = 2;
      const varData = vars.map(v => ({
        id: v.id ? Number(v.id) : null,
        label: String(v.label || ''),
        price: String(v.price || '0'),
      }));
      const savedVariants = upsertProductVariants(Number(productId), varData);

      // 3. Обновляем базовую цену
      step.n = 3;
      const prices = vars.map(v => parseFloat(v.price) || 0).filter(p => p > 0);
      if (prices.length > 0) {
        db.runSync(`UPDATE products SET price=? WHERE id=?`, [Math.min(...prices), productId]);
      }

      // 4. Сохраняем техкарты
      step.n = 4;
      savedVariants.forEach((sv, i) => {
        if (!sv?.id) return;
        const varIng = vars[i]?.ings || [];
        const ings = varIng
          .filter(r => r.name && parseFloat(r.amount) > 0)
          .map(r => ({
            name: r.name,
            amount: parseFloat(r.amount),
            unit: r.unit,
            pricePerUnit: parseFloat(r.price_per_unit) || 0,
            factor: 1,
          }));
        saveCostCardForVariant(Number(sv.id), ings);
      });

      step.n = 5;
      load();
      setModal(null);
    } catch (e) { console.error(e); Alert.alert(`Ошибка на шаге ${step.n}`, String(e.message || e)); }
  };

  const handleDelete = (id) => {
    Alert.alert('Удалить товар?', 'Техкарты и варианты будут удалены. Продажи сохранятся.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => {
        try { deleteProduct(id); load(); setModal(null); } catch (e) { console.error(e); }
      }},
    ]);
  };

  // Фильтрация и группировка
  const filtered = products.filter(p =>
    !search.trim() || p.name.toLowerCase().includes(search.toLowerCase())
  );
  const cats = [...new Set(filtered.map(p => p.category || 'Без категории'))].sort();
  const allCats = [...new Set(products.map(p => p.category || 'Без категории'))].sort();

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Товары"
        onBack={() => navigation.navigate(getHomeRoute())}
        rightElement={
          <Pressable style={styles.addBtn} onPress={() => openProduct(null)} hitSlop={8}>
            <Text style={styles.addBtnTxt}>＋</Text>
          </Pressable>
        }
      />

      {/* Поиск */}
      <View style={styles.searchBar}>
        {searchOpen ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <TextInput color={colors.text} style={[styles.searchInput, { flex: 1 }]}
              value={search} onChangeText={setSearch}
              placeholder="Поиск товара..." placeholderTextColor={colors.muted} autoFocus />
            <Pressable onPress={() => { setSearchOpen(false); setSearch(''); }} hitSlop={10} style={styles.badgeBtn}>
              <Text style={styles.badgeTxt}>✕</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
            <Text style={styles.searchPlaceholder}>{products.length} позиций</Text>
            <Pressable onPress={() => setSearchOpen(true)} hitSlop={10} style={styles.badgeBtn}>
              <Text style={styles.badgeTxt}>🔍</Text>
            </Pressable>
          </View>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        {products.length === 0 ? (
          <EmptyState icon="🛍" title="Товаров нет" text="Нажмите ＋ чтобы добавить первый товар. Укажите название, цену — и можно принимать заказы. Техкарту (для учёта склада) можно добавить позже." />
        ) : filtered.length === 0 ? (
          <EmptyState icon="🔍" title="Ничего не найдено" text={`Нет товаров по запросу «${search}»`} />
        ) : (
          cats.map(cat => {
            const catProducts = filtered.filter(p => (p.category || 'Без категории') === cat);
            const isOpen = openCats[cat] !== false;
            return (
              <View key={cat} style={styles.catGroup}>
                <Pressable style={styles.catHead} onPress={() => setOpenCats(p => ({ ...p, [cat]: !isOpen }))}>
                  <Text style={styles.catTitle}>{cat}</Text>
                  <Text style={styles.catCount}>{catProducts.length} поз.</Text>
                  <Text style={[styles.catArrow, isOpen && { transform: [{ rotate: '180deg' }] }]}>▼</Text>
                </Pressable>

                {isOpen && (
                  <View style={styles.groupCard}>
                    {catProducts.map((p, idx) => {
                      const hasVariants = p.variant_count > 1;
                      const displayPrice = p.min_price || p.price;
                      const priceLabel = hasVariants ? `от ${fmt(displayPrice)} ₽` : displayPrice > 0 ? `${fmt(displayPrice)} ₽` : 'цена не задана';
                      return (
                        <Pressable key={p.id}
                          style={({ pressed }) => [
                            styles.productRow,
                            idx < catProducts.length - 1 && styles.rowDiv,
                            pressed && { backgroundColor: 'rgba(255,255,255,0.03)' },
                            !p.active && { opacity: 0.45 },
                          ]}
                          onPress={() => openProduct(p)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.productName}>{p.name}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                              {p.avg_cost > 0
                                ? <Text style={styles.productCost}>🧾 себест. {p.avg_cost.toFixed(2)} ₽</Text>
                                : <Text style={styles.productSub}>🧾 нет техкарты</Text>
                              }
                            </View>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.productPrice, !p.price && styles.productPriceNone]}>{priceLabel}</Text>

                            {!p.active && <Text style={styles.inactiveBadge}>неакт.</Text>}
                          </View>
                          <Text style={styles.productArrow}>›</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <BottomBar navigation={navigation} activeTab="Kassa" />

      {/* Модалка товара */}
      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setModal(null)} />
          {modal && (
            <ProductModal
              product={modal.product}
              variants={modal.variants}
              techCards={modal.techCards}
              stock={stock}
              categories={allCats.length ? allCats : ['Кофе', 'Допы', 'Прочее']}
              onClose={() => setModal(null)}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { padding: 16, paddingBottom: 24 },

  addBtn:    { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(61,158,146,0.15)', borderWidth: 1, borderColor: 'rgba(61,158,146,0.4)', alignItems: 'center', justifyContent: 'center' },
  addBtnTxt: { fontSize: 20, color: colors.greenLight, lineHeight: 26 },

  searchBar:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInput:       { padding: 8, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.text, fontSize: 13, fontFamily: fonts.family },
  searchPlaceholder: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  badgeBtn:          { width: 32, height: 32, borderRadius: 10, backgroundColor: '#0e0f11', borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', alignItems: 'center', justifyContent: 'center' },
  badgeTxt:          { fontSize: 14, color: colors.muted },

  catGroup: { marginBottom: 8 },
  catHead:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#0e0f11', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', marginBottom: 6 },
  catTitle: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, flex: 1 },
  catCount: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginRight: 8 },
  catArrow: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },

  groupCard:    { backgroundColor: '#0b0c0f', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', overflow: 'hidden' },
  productRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14, gap: 8 },
  rowDiv:       { borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.2)' },
  productName:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  productSub:   { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  productPrice: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  productPriceNone: { color: colors.muted, fontStyle: 'italic', fontSize: 11 },
  productArrow: { fontSize: 18, color: 'rgba(74,77,84,0.4)' },
  inactiveBadge:{ fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted },
  productCost:  { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.greenLight },

  // Модалка
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalBox:  { width: '52%', maxHeight: '90%', backgroundColor: '#0e0f11', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(74,77,84,0.5)', overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.3)' },
  modalTitle:  { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text, flex: 1 },
  closeBtn:    { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(74,77,84,0.25)', alignItems: 'center', justifyContent: 'center' },
  closeTxt:    { fontSize: 13, color: colors.text, fontFamily: fonts.familySemibold },

  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  input:      { padding: 12, backgroundColor: '#07080a', borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', borderRadius: 12, color: colors.text, fontSize: 14, fontFamily: fonts.family, marginBottom: 4 },

  catChip:       { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', backgroundColor: '#07080a' },
  catChipActive: { borderColor: 'rgba(61,158,146,0.5)', backgroundColor: 'rgba(61,158,146,0.1)' },
  catChipTxt:    { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  catChipTxtActive: { color: colors.greenLight },

  addVarBtn: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(61,158,146,0.4)', backgroundColor: 'rgba(61,158,146,0.08)' },
  addVarTxt: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.greenLight },

  varBlock: { backgroundColor: '#07080a', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', padding: 12 },
  varRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },

  techBlock:  { borderTopWidth: 1, borderTopColor: 'rgba(74,77,84,0.2)', paddingTop: 10, marginTop: 4 },
  techTitle:  { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, marginBottom: 8 },
  ingRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  ingName:    { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text, flex: 1 },
  ingInput:   { width: 70, padding: 6, backgroundColor: '#0e0f11', borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', borderRadius: 8, color: colors.text, fontFamily: fonts.family, fontSize: 13, textAlign: 'center' },
  ingUnit:    { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
  addIngBtn:  { paddingVertical: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(74,77,84,0.15)', marginTop: 4 },
  addIngTxt:  { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.greenLight },

  activeRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(74,77,84,0.2)' },
  activeLabel: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },

  confirmBtn:    { paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(61,158,146,0.85)', alignItems: 'center' },
  confirmBtnTxt: { fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: '#fff' },
  deleteBtn:     { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  deleteBtnTxt:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.redLight },

  pickerRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  pickerBox:  { width: 340, maxHeight: '75%', backgroundColor: '#0e0f11', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(74,77,84,0.5)', overflow: 'hidden' },
  stockRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
});
