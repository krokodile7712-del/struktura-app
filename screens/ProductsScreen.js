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
  getAllStock, getCategories, cleanOrphanCostIngredients, deleteOldCostCards,
  getAllModifierGroups, insertModifierGroup, updateModifierGroup, deleteModifierGroup,
  insertModifierOption, updateModifierOption, deleteModifierOption,
  getProductModifierGroups, setProductModifierGroups,
} from '../db/queries';
import { getDb } from '../db/database';
import { getHomeRoute } from '../db/session';
import { colors, fonts } from '../constants/theme';

const fmt = n => (n || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ─── Модалка товара ───────────────────────────────────────────────────────────
function ProductModal({ product, variants, techCards, stock, categories, allModGroups, onClose, onSave, onDelete }) {
  const [name, setName]           = useState(product?.name || '');
  const [category, setCategory]   = useState(product?.category || (categories[0] || ''));
  const [active, setActive]       = useState(product?.active !== 0);
  const [vars, setVars]           = useState(
    variants.length > 0
      ? variants.map(v => ({ id: v.id, label: v.label || v.size || '', price: String(v.price || ''), ings: techCards[v.id] || [] }))
      : [{ id: null, label: '', price: String(product?.price || ''), ings: [] }]
  );
  const [selGroups, setSelGroups] = useState(() => {
    try { return product?.id ? (getProductModifierGroups(product.id).map(g => Number(g.id))) : []; } catch { return []; }
  });
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
    onSave({ name: name.trim(), category, active, vars, selGroups });
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
            {/* Себестоимость варианта */}
            {(() => {
              const cost = v.ings.reduce((s, ing) =>
                s + (parseFloat(ing.amount) || 0) * (parseFloat(ing.price_per_unit) || 0), 0);
              const price = parseFloat(v.price) || 0;
              const margin = price > 0 && cost > 0 ? Math.round((1 - cost / price) * 100) : null;
              if (cost <= 0) return null;
              return (
                <View style={styles.costRow}>
                  <Text style={styles.costLabel}>Себестоимость</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.costValue}>{cost.toFixed(2)} ₽</Text>
                    {margin !== null && (
                      <View style={[styles.marginBadge, { backgroundColor: margin >= 50 ? 'rgba(61,158,146,0.12)' : margin >= 30 ? 'rgba(122,158,82,0.12)' : 'rgba(160,16,32,0.1)' }]}>
                        <Text style={[styles.marginText, { color: margin >= 50 ? colors.greenLight : margin >= 30 ? '#7a9e52' : colors.redLight }]}>
                          {margin}% маржа
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}

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

        {/* Модификаторы */}
        {allModGroups && allModGroups.length > 0 && (
          <>
            <Text style={[styles.fieldLabel, { marginTop: 20, marginBottom: 4 }]}>Предлагать при заказе</Text>
            <Text style={[styles.productSub, { marginBottom: 10, paddingHorizontal: 2 }]}>
              Включите что кассир увидит при добавлении этого товара в заказ
            </Text>
            <View style={styles.groupCard}>
              {allModGroups.map((g, idx) => {
                const on = selGroups.includes(Number(g.id));
                return (
                  <Pressable key={g.id}
                    style={({ pressed }) => [styles.productRow, idx < allModGroups.length-1 && styles.rowDiv, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
                    onPress={() => setSelGroups(prev =>
                      prev.includes(Number(g.id)) ? prev.filter(id => id !== Number(g.id)) : [...prev, Number(g.id)]
                    )}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.productName, on && { color: colors.greenLight }]}>{g.name}</Text>
                      <Text style={styles.productSub}>
                        {g.options?.map(o => `${o.name}${o.price_delta > 0 ? ` +${o.price_delta}₽` : ''}`).join(' · ')}
                      </Text>
                    </View>
                    <View style={[styles.checkbox, on && styles.checkboxOn]}>
                      {on && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {selGroups.length > 0 && (
              <Text style={[styles.productSub, { marginTop: 6, paddingHorizontal: 2, color: colors.greenLight }]}>
                ✓ При заказе кассир увидит выбор: {allModGroups.filter(g => selGroups.includes(Number(g.id))).map(g => g.name).join(', ')}
              </Text>
            )}
          </>
        )}

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
  const [tab, setTab]             = useState('products'); // 'products' | 'modifiers'
  const [modGroups, setModGroups] = useState([]);
  const [groupModal, setGroupModal] = useState(null); // {id,name,selectionType,options}
  const [stockPicker, setStockPicker] = useState(null); // { optIdx }
  const [stockPickerSearch, setStockPickerSearch] = useState('');
  const [openCats, setOpenCats]   = useState({});
  const [modal, setModal]         = useState(null); // { product, variants, techCards }

  const load = useCallback(() => {
    try {
      deleteOldCostCards();
      cleanOrphanCostIngredients();
      setProducts(getAllProductsAdmin());
      setModGroups(getAllModifierGroups());
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
    // Всегда берём свежие модификаторы из БД
    const freshModGroups = getAllModifierGroups();
    setModGroups(freshModGroups);
    setModal({ product, variants, techCards, freshModGroups });
  };

  const handleSave = ({ name, category, active, vars, selGroups }) => {
    try {
      const db = getDb();
      let productId = modal.product?.id;

      if (!productId) {
        const res = db.runSync(
          `INSERT INTO products (name, category, price, active) VALUES (?, ?, ?, 1)`,
          [name, category, parseFloat(vars[0]?.price) || 0]
        );
        productId = Number(res.lastInsertRowId);
      } else {
        db.runSync(`UPDATE products SET name=?, category=?, active=? WHERE id=?`,
          [name, category, active ? 1 : 0, productId]);
      }

      const savedVariants = upsertProductVariants(Number(productId), vars.map(v => ({
        id: v.id ? Number(v.id) : null,
        label: String(v.label || ''),
        price: String(v.price || '0'),
      })));

      const prices = vars.map(v => parseFloat(v.price) || 0).filter(p => p > 0);
      if (prices.length > 0) {
        db.runSync(`UPDATE products SET price=? WHERE id=?`, [Math.min(...prices), productId]);
      }

      savedVariants.forEach((sv, i) => {
        if (!sv?.id) return;
        const ings = (vars[i]?.ings || [])
          .filter(r => r.name && parseFloat(r.amount) > 0)
          .map(r => ({ name: r.name, amount: parseFloat(r.amount), unit: r.unit, pricePerUnit: parseFloat(r.price_per_unit) || 0, factor: 1 }));
        saveCostCardForVariant(Number(sv.id), ings);
      });

      // Сохраняем привязку модификаторов
      if (selGroups !== undefined) {
        try { setProductModifierGroups(productId, selGroups); } catch(_) {}
      }
      load();
      setModal(null);
    } catch (e) { console.error(e); Alert.alert('Ошибка сохранения', String(e.message || e)); }
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

      {/* Вкладки */}
      <View style={styles.tabBar}>
        <Pressable style={[styles.tabBtn, tab === 'products' && styles.tabBtnActive]} onPress={() => setTab('products')}>
          <Text style={[styles.tabTxt, tab === 'products' && styles.tabTxtActive]}>Товары</Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, tab === 'modifiers' && styles.tabBtnActive]} onPress={() => setTab('modifiers')}>
          <Text style={[styles.tabTxt, tab === 'modifiers' && styles.tabTxtActive]}>Модификаторы</Text>
        </Pressable>
      </View>

      {/* Поиск */}
      {tab === 'products' && <View style={styles.searchBar}>
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
      </View>}

      {tab === 'modifiers' && (
        <View style={styles.searchBar}>
          <Pressable style={styles.addBtn} onPress={() => setGroupModal({ id: null, name: '', selectionType: 'single', selProducts: [], options: [] })} >
            <Text style={styles.addBtnTxt}>＋</Text>
          </Pressable>
          <Text style={[styles.searchPlaceholder, { flex: 1, marginLeft: 10 }]}>Группы модификаторов</Text>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        {tab === 'modifiers' && (
          <>
            {modGroups.length === 0 ? (
              <EmptyState icon="🧂" title="Нет групп" text="Нажмите ＋ чтобы создать первую группу модификаторов — например Сироп или Альт. молоко." />
            ) : (
              <View style={styles.groupCard}>
                {modGroups.map((g, idx) => (
                  <Pressable key={g.id}
                    style={({ pressed }) => [styles.productRow, idx < modGroups.length-1 && styles.rowDiv, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
                    onPress={() => {
                    // Загружаем к каким товарам привязана группа
                    const linkedProductIds = (() => {
                      try {
                        const db = getDb();
                        return db.getAllSync('SELECT product_id FROM product_modifier_groups WHERE group_id = ?', [g.id]).map(r => Number(r.product_id));
                      } catch(_) { return []; }
                    })();
                    setGroupModal({ id: g.id, name: g.name, selectionType: g.selection_type || 'single', selProducts: linkedProductIds, options: (g.options || []).map(o => ({ ...o, price_delta: String(o.price_delta || ''), deductAmount: String(o.deduct_amount || ''), ingrToDeduct: o.ingr_to_deduct || '', ingrToReplace: o.ingr_to_replace || '', mode: o.ingr_to_replace ? 'replace' : 'add' })) });
                  }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.productName}>{g.name}</Text>
                      <Text style={styles.productSub}>
                        {g.selection_type === 'multiple' ? 'Выбор нескольких' : 'Выбор одного'}
                        {g.options?.length > 0 ? ` · ${g.options.map(o => `${o.name}${o.price_delta > 0 ? ` +${o.price_delta}₽` : ''}`).join(', ')}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.productArrow}>›</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}

        {tab === 'products' && (products.length === 0 ? (
          <EmptyState icon="🛍" title="Товаров нет" text="Нажмите ＋ чтобы добавить первый товар. Укажите название, цену — и можно принимать заказы. Техкарту (для учёта склада) можно добавить позже." />
        ) : filtered.length === 0 ? (
          <EmptyState icon="🔍" title="Ничего не найдено" text={`Нет товаров по запросу «${search}»`} />
        ) : (
          <View style={styles.allCatsCard}>
          {cats.map((cat, catIdx) => {
            const catProducts = filtered.filter(p => (p.category || 'Без категории') === cat);
            const isOpen = openCats[cat] === true;
            return (
              <View key={cat}>
                {catIdx > 0 && <View style={styles.catDivider} />}
                <Pressable
                  style={({ pressed }) => [styles.catHead, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
                  onPress={() => setOpenCats(p => ({ ...p, [cat]: !isOpen }))}
                >
                  <Text style={styles.catTitle}>{cat}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.catCount}>{catProducts.length} поз.</Text>
                    <Text style={[styles.catChevron, isOpen && styles.catChevronOpen]}>›</Text>
                  </View>
                </Pressable>

                {isOpen && (
                  <View style={styles.catInner}>
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
                            <Text style={styles.productSub}>
                              {p.cost_card_count > 0 ? '🧾 есть техкарта' : '🧾 нет техкарты'}
                            </Text>
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
          })}
          </View>
        ))}
      </ScrollView>

      <BottomBar navigation={navigation} activeTab="Kassa" />


      {/* Пикер позиции склада для модификатора */}
      <Modal visible={!!stockPicker} transparent animationType="slide" onRequestClose={() => setStockPicker(null)}>
        <View style={styles.pickerSheet}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setStockPicker(null)} />
          <View style={styles.pickerBox}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Выбрать из склада</Text>
              <Pressable onPress={() => setStockPicker(null)} hitSlop={12} style={styles.closeBtn}>
                <Text style={styles.closeTxt}>✕</Text>
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <TextInput color={colors.text} style={styles.searchInput}
                value={stockPickerSearch} onChangeText={setStockPickerSearch}
                placeholder="Поиск..." placeholderTextColor={colors.muted} autoFocus />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320 }}>
              <View style={[styles.groupCard, { margin: 16, marginTop: 0 }]}>
                {stock.filter(s => !stockPickerSearch || s.name.toLowerCase().includes(stockPickerSearch.toLowerCase()))
                  .map((s, idx, arr) => (
                  <Pressable key={s.id}
                    style={({ pressed }) => [styles.productRow, idx < arr.length-1 && styles.rowDiv, pressed && { backgroundColor: 'rgba(255,255,255,0.04)' }]}
                    onPress={() => {
                      if (stockPicker !== null) {
                        const { optIdx, field } = stockPicker;
                        setGroupModal(m => ({ ...m, options: m.options.map((o,i) => i===optIdx
                          ? field === 'replace'
                            ? { ...o, ingrToReplace: s.name }
                            : { ...o, ingrToDeduct: s.name, deductUnit: s.unit }
                          : o
                        )}));
                      }
                      setStockPicker(null);
                      setStockPickerSearch('');
                    }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.productName}>{s.name}</Text>
                      <Text style={styles.productSub}>{s['остаток']} {s.unit} на складе</Text>
                    </View>
                    <Text style={styles.productArrow}>›</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Модалка группы модификаторов */}
      <Modal visible={!!groupModal} transparent animationType="fade" onRequestClose={() => setGroupModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setGroupModal(null)} />
          {groupModal && (
            <View style={[styles.modalBox, { width: '50%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{groupModal.id ? 'Группа модификаторов' : 'Новая группа'}</Text>
                <Pressable onPress={() => setGroupModal(null)} hitSlop={14} style={styles.closeBtn}>
                  <Text style={styles.closeTxt}>✕</Text>
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">

                {/* Название */}
                <Text style={styles.fieldLabel}>Название группы</Text>
                <TextInput color={colors.text} style={styles.input}
                  value={groupModal.name}
                  onChangeText={v => setGroupModal(m => ({ ...m, name: v }))}
                  placeholder="Например: Сироп, Альт. молоко, Топпинг"
                  placeholderTextColor={colors.muted} />

                {/* Тип выбора */}
                <Text style={styles.fieldLabel}>Тип выбора</Text>
                <View style={styles.groupCard}>
                  {[
                    { key: 'single',   label: 'Один вариант',      sub: 'Клиент выбирает один из списка' },
                    { key: 'multiple', label: 'Несколько вариантов', sub: 'Можно выбрать несколько сразу' },
                  ].map((t, idx) => (
                    <Pressable key={t.key}
                      style={[styles.productRow, idx === 0 && styles.rowDiv]}
                      onPress={() => setGroupModal(m => ({ ...m, selectionType: t.key }))}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.productName}>{t.label}</Text>
                        <Text style={styles.productSub}>{t.sub}</Text>
                      </View>
                      <View style={[styles.checkbox, groupModal.selectionType === t.key && styles.checkboxOn]}>
                        {groupModal.selectionType === t.key && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                      </View>
                    </Pressable>
                  ))}
                </View>

                {/* Варианты */}
                <Text style={styles.fieldLabel}>Варианты</Text>
                {groupModal.options.map((opt, idx) => (
                  <View key={idx} style={styles.optCard}>
                    {/* Строка 1: название + цена + удалить */}
                    <View style={styles.optRow}>
                      <TextInput color={colors.text}
                        style={[styles.input, { flex: 1, marginBottom: 0, marginRight: 8, padding: 10 }]}
                        value={opt.name} placeholder="Название (напр: Овсяное молоко)"
                        placeholderTextColor={colors.muted}
                        onChangeText={v => setGroupModal(m => ({ ...m, options: m.options.map((o,i) => i===idx ? {...o, name: v} : o) }))} />
                      <TextInput color={colors.text}
                        style={[styles.input, { width: 64, marginBottom: 0, padding: 10, textAlign: 'center' }]}
                        value={String(opt.price_delta || '')} placeholder="+0"
                        placeholderTextColor={colors.muted} keyboardType="numeric"
                        onChangeText={v => setGroupModal(m => ({ ...m, options: m.options.map((o,i) => i===idx ? {...o, price_delta: v} : o) }))} />
                      <Text style={styles.optUnit}>₽</Text>
                      <Pressable onPress={() => setGroupModal(m => ({ ...m, options: m.options.filter((_,i) => i!==idx) }))} hitSlop={12}>
                        <Text style={{ color: 'rgba(74,77,84,0.5)', fontSize: 18 }}>✕</Text>
                      </Pressable>
                    </View>

                    {/* Строка 2: режим */}
                    <View style={styles.optModeRow}>
                      {[{key:'add',label:'＋ Добавление'},{key:'replace',label:'↔ Замена'}].map(mode => (
                        <Pressable key={mode.key}
                          style={[styles.modeBtn, (opt.mode||'add') === mode.key && styles.modeBtnActive]}
                          onPress={() => setGroupModal(m => ({ ...m, options: m.options.map((o,i) => i===idx ? {...o, mode: mode.key} : o) }))}>
                          <Text style={[styles.modeBtnTxt, (opt.mode||'add') === mode.key && styles.modeBtnTxtActive]}>{mode.label}</Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* Строка 3: склад */}
                    {(opt.mode||'add') === 'replace' && (
                      <View style={styles.optStockRow}>
                        <Text style={styles.optLabel}>Заменить:</Text>
                        <Pressable style={[styles.input, { flex: 1, marginBottom: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10 }]}
                          onPress={() => setStockPicker({ optIdx: idx, field: 'replace' })}>
                          <Text style={{ fontFamily: fonts.familySemibold, fontSize: 13, color: opt.ingrToReplace ? colors.text : colors.muted }}>
                            {opt.ingrToReplace || 'Выбрать ингредиент →'}
                          </Text>
                          <Text style={{ color: colors.muted }}>📦</Text>
                        </Pressable>
                      </View>
                    )}
                    <View style={styles.optStockRow}>
                      <Text style={styles.optLabel}>{(opt.mode||'add') === 'replace' ? 'На:' : 'Из склада:'}</Text>
                      <Pressable style={[styles.input, { flex: 1, marginBottom: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10 }]}
                        onPress={() => setStockPicker({ optIdx: idx, field: 'deduct' })}>
                        <Text style={{ fontFamily: fonts.familySemibold, fontSize: 13, color: opt.ingrToDeduct ? colors.text : colors.muted }}>
                          {opt.ingrToDeduct || 'Выбрать из склада →'}
                        </Text>
                        <Text style={{ color: colors.muted }}>📦</Text>
                      </Pressable>
                      <TextInput color={colors.text}
                        style={[styles.input, { width: 60, marginBottom: 0, marginLeft: 8, padding: 10, textAlign: 'center' }]}
                        value={String(opt.deductAmount || '')} placeholder="0"
                        placeholderTextColor={colors.muted} keyboardType="numeric"
                        onChangeText={v => setGroupModal(m => ({ ...m, options: m.options.map((o,i) => i===idx ? {...o, deductAmount: v} : o) }))} />
                      <Text style={styles.optUnit}>{opt.deductUnit || 'мл'}</Text>
                    </View>
                  </View>
                ))}
                <Pressable style={styles.addIngBtn}
                  onPress={() => setGroupModal(m => ({ ...m, options: [...m.options, { name: '', price_delta: '' }] }))}>
                  <Text style={styles.addIngTxt}>+ Добавить вариант</Text>
                </Pressable>

                {/* Для каких товаров */}
                <Text style={styles.fieldLabel}>Для каких товаров</Text>
                <Text style={[styles.productSub, { marginBottom: 10 }]}>Модификатор появится в кассе при заказе этих товаров</Text>
                {products.length > 0 ? (
                  <View style={styles.groupCard}>
                    {products.map((p, idx) => {
                      const on = (groupModal.selProducts || []).includes(Number(p.id));
                      return (
                        <Pressable key={p.id}
                          style={({ pressed }) => [styles.productRow, idx < products.length-1 && styles.rowDiv, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
                          onPress={() => setGroupModal(m => ({
                            ...m,
                            selProducts: on
                              ? (m.selProducts||[]).filter(id => id !== Number(p.id))
                              : [...(m.selProducts||[]), Number(p.id)]
                          }))}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.productName, on && { color: colors.greenLight }]}>{p.name}</Text>
                            <Text style={styles.productSub}>{p.category}</Text>
                          </View>
                          <View style={[styles.checkbox, on && styles.checkboxOn]}>
                            {on && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.productSub}>Сначала добавьте товары в разделе Товары</Text>
                )}

                {/* Сохранить */}
                <Pressable style={({ pressed }) => [styles.confirmBtn, { marginTop: 16 }, pressed && { opacity: 0.88 }]}
                  onPress={() => {
                    if (!groupModal.name.trim()) return;
                    try {
                      const opts = groupModal.options.filter(o => o.name.trim());
                      if (groupModal.id) {
                        updateModifierGroup(groupModal.id, { name: groupModal.name, selectionType: groupModal.selectionType });
                        // Пересоздаём опции
                        opts.forEach(o => {
                          if (o.id) updateModifierOption(o.id, { name: o.name, priceDelta: parseFloat(o.price_delta)||0, ingrToReplace: o.ingrToReplace||'', ingrToDeduct: o.ingrToDeduct||'', deductAmount: parseFloat(o.deductAmount)||0, deductUnit: o.deductUnit||'' });
                          else insertModifierOption({ groupId: groupModal.id, name: o.name, priceDelta: parseFloat(o.price_delta)||0, ingrToReplace: o.ingrToReplace||'', ingrToDeduct: o.ingrToDeduct||'', deductAmount: parseFloat(o.deductAmount)||0, deductUnit: o.deductUnit||'' });
                        });
                      } else {
                        const res = insertModifierGroup({ name: groupModal.name, selectionType: groupModal.selectionType });
                        opts.forEach(o => insertModifierOption({ groupId: res.lastInsertRowId || res, name: o.name, priceDelta: parseFloat(o.price_delta)||0, ingrToReplace: o.ingrToReplace||'', ingrToDeduct: o.ingrToDeduct||'', deductAmount: parseFloat(o.deductAmount)||0, deductUnit: o.deductUnit||'' }));
                      }
                      // Сохраняем привязку к товарам
                      const db2 = getDb();
                      const gId = groupModal.id || Number(db2.getFirstSync('SELECT last_insert_rowid() as id')?.id);
                      (groupModal.selProducts || []).forEach(pid => {
                        try {
                          const exists = db2.getFirstSync('SELECT id FROM product_modifier_groups WHERE product_id = ? AND group_id = ?', [pid, groupModal.id || gId]);
                          if (!exists) db2.runSync('INSERT INTO product_modifier_groups (product_id, group_id) VALUES (?, ?)', [pid, groupModal.id || gId]);
                        } catch(_) {}
                      });
                      // Удаляем отвязанные товары
                      db2.runSync('DELETE FROM product_modifier_groups WHERE group_id = ?', [groupModal.id || gId]);
                      (groupModal.selProducts || []).forEach(pid => {
                        try { db2.runSync('INSERT INTO product_modifier_groups (product_id, group_id) VALUES (?, ?)', [pid, groupModal.id || gId]); } catch(_) {}
                      });
                      load();
                      setGroupModal(null);
                    } catch(e) { console.error(e); }
                  }}>
                  <Text style={styles.confirmBtnTxt}>Сохранить</Text>
                </Pressable>

                {groupModal.id && (
                  <Pressable style={styles.deleteBtn}
                    onPress={() => { deleteModifierGroup(groupModal.id); load(); setGroupModal(null); }}>
                    <Text style={styles.deleteBtnTxt}>Удалить группу</Text>
                  </Pressable>
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

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
              allModGroups={modal.freshModGroups || modGroups}
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

  allCatsCard: { backgroundColor: '#0b0c0f', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', overflow: 'hidden', marginBottom: 12 },
  catInner:    { borderTopWidth: 1, borderTopColor: 'rgba(74,77,84,0.2)' },
  optCard:     { backgroundColor: '#07080a', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', padding: 12, marginBottom: 8 },
  optRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  optModeRow:  { flexDirection: 'row', gap: 8, marginBottom: 10 },
  optStockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  optLabel:    { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, width: 72 },
  optUnit:     { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  modeBtn:     { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(74,77,84,0.35)', alignItems: 'center', backgroundColor: '#07080a' },
  modeBtnActive:   { borderColor: 'rgba(61,158,146,0.5)', backgroundColor: 'rgba(61,158,146,0.1)' },
  modeBtnTxt:      { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  modeBtnTxtActive:{ color: colors.greenLight },
  pickerSheet:  { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerBox:    { backgroundColor: '#0e0f11', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', paddingBottom: 24 },
  pickerHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(74,77,84,0.5)', alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 8 },
  pickerTitle:  { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text },
  checkbox:    { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(74,77,84,0.5)', alignItems: 'center', justifyContent: 'center' },
  checkboxOn:  { backgroundColor: colors.greenLight, borderColor: colors.greenLight },
  tabBar:      { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.3)' },
  tabBtn:      { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive:{ borderBottomWidth: 2, borderBottomColor: colors.greenLight },
  tabTxt:      { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  tabTxtActive:{ color: colors.greenLight },
  addBtn:    { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(61,158,146,0.15)', borderWidth: 1, borderColor: 'rgba(61,158,146,0.4)', alignItems: 'center', justifyContent: 'center' },
  addBtnTxt: { fontSize: 20, color: colors.greenLight, lineHeight: 26 },

  searchBar:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInput:       { padding: 8, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.text, fontSize: 13, fontFamily: fonts.family },
  searchPlaceholder: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  badgeBtn:          { width: 32, height: 32, borderRadius: 10, backgroundColor: '#0e0f11', borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', alignItems: 'center', justifyContent: 'center' },
  badgeTxt:          { fontSize: 14, color: colors.muted },

  catGroup:        { marginBottom: 4 },
  catHead:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 0 },
  catDivider:      { height: 1, backgroundColor: 'rgba(74,77,84,0.2)', marginHorizontal: 16 },
  catTitle:        { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  catCount:        { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  catChevron:      { fontSize: 20, color: colors.muted, transform: [{ rotate: '90deg' }] },
  catChevronOpen:  { transform: [{ rotate: '-90deg' }] },

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

  costRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 2, borderTopWidth: 1, borderTopColor: 'rgba(74,77,84,0.15)', marginTop: 4 },
  costLabel:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  costValue:   { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  marginBadge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8 },
  marginText:  { fontFamily: fonts.familySemibold, fontSize: 11 },
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
