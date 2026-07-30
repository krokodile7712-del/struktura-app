import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Modal, Alert, Animated,
} from 'react-native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import Toggle from '../components/Toggle';
import InfoTip from '../components/InfoTip';
import { useFocusEffect } from '@react-navigation/native';
import {
  getAllProductsAdmin, insertProduct, setProductActive, deleteProduct,
  getProductVariants, upsertProductVariants,
  getCostCardForVariant, saveCostCardForVariant,
  getAllStock, getCategories, cleanOrphanCostIngredients, deleteOldCostCards,
  getAllModifierGroups, insertModifierGroup, updateModifierGroup, deleteModifierGroup,
  getCategoryOrder, saveCategoryOrder,
  insertModifierOption, updateModifierOption, deleteModifierOption,
  getProductModifierGroups, setProductModifierGroups,
} from '../db/queries';
import { getDb } from '../db/database';
import { getHomeRoute, can } from '../db/session';
import { colors, fonts } from '../constants/theme';

const fmt = n => (n||0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ─── Правая панель редактирования товара ─────────────────────────────────────
function ProductEditor({ product, onSave, onDelete, onToggleActive, categories, allModGroups, onClose, onIngPicker }) {
  const isNew = !product?.id;
  const canEditCost = can('edit_cost_cards');
  const [stock, setStock] = useState(() => { try { return getAllStock(); } catch { return []; } });

  const [name, setName]           = useState(product?.name || '');
  const [category, setCategory]   = useState(product?.category || ((categories || [])[0] || ''));
  const [active, setActive]       = useState(product?.active !== 0);
  const [vars, setVars]           = useState(() => {
    try {
      const v = isNew ? [] : getProductVariants(product.id);
      const tc = {};
      v.forEach(vi => { try { tc[vi.id] = getCostCardForVariant(vi.id); } catch(_) {} });
      return v.length > 0
        ? v.map(vi => ({ id: vi.id, label: vi.label || vi.size || '', price: String(vi.price || ''), ings: tc[vi.id] || [] }))
        : [{ id: null, label: '', price: String(product?.price || ''), ings: [] }];
    } catch { return [{ id: null, label: '', price: '', ings: [] }]; }
  });
  const [selGroups, setSelGroups] = useState(() => {
    try { return product?.id ? getProductModifierGroups(product.id).map(g => Number(g.id)) : []; } catch { return []; }
  });
  const [ingPickerVar, setIngPickerVar] = useState(null); // индекс варианта
  const [expandedVar, setExpandedVar] = useState(0);

  const slideAnim = useState(new Animated.Value(20))[0];
  const fadeAnim  = useState(new Animated.Value(0))[0];

  useEffect(() => {
    slideAnim.setValue(20); fadeAnim.setValue(0);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
    ]).start();
  }, [product?.id]);

  const addVariant   = () => setVars(v => [...v, { id: null, label: '', price: '', ings: [] }]);
  const removeVariant= (i) => setVars(v => v.filter((_,j) => j !== i));
  const setVarField  = (i, f, val) => setVars(v => v.map((r,j) => j===i ? {...r,[f]:val} : r));
  const addIng = (vi, s) => {
    setVars(v => v.map((r,j) => j===vi ? { ...r, ings: [...(Array.isArray(r.ings) ? r.ings : []), { name: s.name, amount: '', unit: s.unit, price_per_unit: String(s.avg_price || s.last_price || '') }] } : r));
    setIngPickerVar(null);
  };

  const removeIng    = (vi, ii) => setVars(v => v.map((r,j) => j===vi ? { ...r, ings: r.ings.filter((_,k)=>k!==ii) } : r));
  const setIngField  = (vi, ii, f, val) => setVars(v => v.map((r,j) => j===vi ? { ...r, ings: r.ings.map((ing,k) => k===ii ? {...ing,[f]:val} : ing) } : r));

  const handleSave = () => {
    if (!name.trim()) { Alert.alert('Введите название товара'); return; }
    onSave({ name: name.trim(), category, active, vars, selGroups });
  };

  const totalCost = (v) => { const ings = Array.isArray(v?.ings) ? v.ings : []; return ings.reduce((s, ing) => s + (parseFloat(ing?.amount)||0) * (parseFloat(ing?.price_per_unit)||0), 0); };
  const margin    = (v) => { const c = totalCost(v); const p = parseFloat(v.price)||0; return p > 0 && c > 0 ? Math.round((1 - c/p)*100) : null; };

  return (
    <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">

        {/* Шапка */}
        <View style={styles.editorHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.editorTitle}>{isNew ? 'Новый товар' : name || 'Товар'}</Text>
            {!isNew && <Text style={styles.editorSub}>{category}</Text>}
          </View>
          {!isNew && (
            <View style={styles.activeToggleRow}>
              <Text style={styles.activeLabel}>{active ? 'Активен' : 'Неактивен'}</Text>
              <Toggle value={active} onValueChange={setActive} size="sm" />
            </View>
          )}
        </View>

        <View style={styles.editorDivider} />

        {/* Название */}
        <Text style={styles.fieldLabel}>Название товара <Text style={{ color: colors.orange }}>*</Text></Text>
        <TextInput
          style={styles.input}
          color={colors.text}
          value={name}
          onChangeText={setName}
          placeholder="Латте, Круассан, Услуга..."
          placeholderTextColor={colors.muted}
          autoFocus={isNew}
        />

        {/* Категория */}
        <View style={styles.labelRow}>
          <Text style={styles.fieldLabel}>Категория</Text>
          <InfoTip title="Категория" text="Группирует товары в списке и в кассе. Клиент её не видит." />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {categories.map(cat => (
            <Pressable key={cat} style={[styles.chip, category === cat && styles.chipActive]} onPress={() => setCategory(cat)}>
              <Text style={[styles.chipTxt, category === cat && styles.chipTxtActive]}>{cat}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Варианты и цены */}
        <View style={styles.labelRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Text style={styles.fieldLabel}>{vars.length > 1 ? 'Размеры / Виды' : 'Цена продажи'}</Text>
            <InfoTip title="Размеры" text="Один вариант — просто введите цену. Несколько — добавьте S/M/L или виды." />
          </View>
          <Pressable style={styles.addVarBtn} onPress={addVariant}>
            <Text style={styles.addVarTxt}>+ Размер</Text>
          </Pressable>
        </View>

        {vars.map((v, vi) => {
          const cost   = totalCost(v);
          const mrg    = margin(v);
          const isOpen = expandedVar === vi;
          return (
            <View key={vi} style={styles.varCard}>
              {/* Строка варианта */}
              <View style={styles.varRow}>
                {vars.length > 1 && (
                  <TextInput style={[styles.input, { flex: 1 }]} color={colors.text}
                    value={v.label} onChangeText={val => setVarField(vi, 'label', val)}
                    placeholder="S, M, L..." placeholderTextColor={colors.muted} />
                )}
                <View style={styles.priceRow}>
                  <TextInput style={[styles.input, { width: 90, textAlign: 'center' }]} color={colors.text}
                    keyboardType="numeric" value={v.price} onChangeText={val => setVarField(vi, 'price', val)}
                    placeholder="0" placeholderTextColor={colors.muted} />
                  <Text style={styles.currencyTxt}>₽</Text>
                  {mrg !== null && (
                    <View style={[styles.marginBadge, { backgroundColor: mrg >= 50 ? 'rgba(123,175,142,0.12)' : mrg >= 30 ? 'rgba(123,175,142,0.08)' : 'rgba(217,95,95,0.1)' }]}>
                      <Text style={[styles.marginTxt, { color: mrg >= 30 ? colors.green : colors.red }]}>{mrg}%</Text>
                    </View>
                  )}
                  {vars.length > 1 && (
                    <Pressable onPress={() => removeVariant(vi)} hitSlop={10}>
                      <Text style={{ color: colors.muted, fontSize: 18 }}>✕</Text>
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Техкарта */}
              {canEditCost ? (
              <>
              <Pressable style={styles.techToggle} onPress={() => setExpandedVar(isOpen ? -1 : vi)}>
                <Text style={styles.techToggleTxt}>
                  Техкарта{(Array.isArray(v.ings) && v.ings.length > 0) ? ` · ${v.ings.length} поз. · ${cost.toFixed(2)} ₽` : ' · не задана'}
                </Text>
                <Text style={[styles.chevron, isOpen && styles.chevronOpen]}>›</Text>
              </Pressable>

              {isOpen && (
                <View style={styles.techBody}>
                  {(Array.isArray(v.ings) ? v.ings : []).map((ing, ii) => (
                    <View key={ii} style={styles.ingRow}>
                      <Text style={styles.ingName} numberOfLines={1}>{ing.name}</Text>
                      <TextInput style={styles.ingInput} color={colors.text}
                        keyboardType="numeric" value={ing.amount}
                        onChangeText={val => setIngField(vi, ii, 'amount', val)}
                        placeholder="0" placeholderTextColor={colors.muted} />
                      <Text style={styles.ingUnit}>{ing.unit}</Text>
                      <TextInput style={[styles.ingInput, { width: 58 }]} color={colors.text}
                        keyboardType="numeric" value={ing.price_per_unit}
                        onChangeText={val => setIngField(vi, ii, 'price_per_unit', val)}
                        placeholder="авто" placeholderTextColor={colors.muted} />
                      <Text style={styles.ingUnit}>₽</Text>
                      <Pressable onPress={() => removeIng(vi, ii)} hitSlop={10}>
                        <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
                      </Pressable>
                    </View>
                  ))}
                  <Pressable style={styles.addIngBtn} onPress={() => { setIngPickerVar(vi); onIngPicker?.(vi, (s) => addIng(vi, s)); }}>
                    <Text style={styles.addIngTxt}>+ Добавить из склада</Text>
                  </Pressable>
                  {v.ings.length === 0 && (
                    <Text style={styles.ingHint}>Не обязательно — нужно для автосписания и расчёта маржи</Text>
                  )}
                </View>
              )}
              </>
              ) : (
              <View style={[styles.techToggle, { opacity: 0.4 }]}>
                <Text style={styles.techToggleTxt}>Техкарта · нет доступа</Text>
              </View>
              )}
            </View>
          );
        })}

        {/* Модификаторы */}
        {allModGroups && allModGroups.length > 0 && (
          <>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Предлагать при заказе</Text>
              <InfoTip title="Модификаторы" text="Кассир увидит эти варианты при добавлении товара в заказ." />
            </View>
            <View style={styles.modsCard}>
              {allModGroups.map((g, idx) => {
                const on = selGroups.includes(Number(g.id));
                return (
                  <Pressable key={g.id}
                    style={[styles.modRow, idx < allModGroups.length-1 && styles.modRowDiv]}
                    onPress={() => setSelGroups(s => on ? s.filter(x=>x!==Number(g.id)) : [...s, Number(g.id)])}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modName}>{g.name}</Text>
                      <Text style={styles.modSub}>{g.mode === 'replace' ? 'Замена' : 'Добавление'}</Text>
                    </View>
                    <View style={[styles.modCheck, on && styles.modCheckActive]}>
                      {on && <Text style={styles.modCheckMark}>✓</Text>}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* Кнопки */}
        <Pressable style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnTxt}>{isNew ? 'Создать товар' : 'Сохранить изменения'}</Text>
        </Pressable>

        {!isNew && (
          <View style={styles.dangerRow}>
            <Pressable style={styles.deactivateBtn} onPress={() => { onToggleActive(product); }}>
              <Text style={styles.deactivateTxt}>{active ? 'Деактивировать' : 'Активировать'}</Text>
            </Pressable>
            <Pressable style={styles.deleteBtn} onPress={() => {
              Alert.alert('Удалить товар?', `«${product.name}» будет удалён.`, [
                { text: 'Отмена' },
                { text: 'Удалить', style: 'destructive', onPress: () => onDelete(product.id) }
              ]);
            }}>
              <Text style={styles.deleteTxt}>Удалить</Text>
            </Pressable>
          </View>
        )}

      </ScrollView>


    </Animated.View>
  );
}

// ─── Главный экран ─────────────────────────────────────────────────────────────
export default function ProductsScreen({ navigation }) {
  const [tab, setTab]               = useState('products'); // products | modifiers
  const [products, setProducts]     = useState([]);
  const [stock, setStock]           = useState([]);
  const [categories, setCategories] = useState([]);
  const [catOrder, setCatOrder]     = useState([]);
  const [modGroups, setModGroups]   = useState([]);
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState(null);      // {id, name, ...} | 'new'
  const [expandedCats, setExpandedCats] = useState({});
  const [orderModal, setOrderModal] = useState(false);
  const [orderDraft, setOrderDraft] = useState([]);
  const [groupModal, setGroupModal] = useState(null);
  const [ingPickerState, setIngPickerState] = useState(null); // {vi}
  const [ingSearch, setIngSearch]           = useState('');
  const pendingIngCallback = React.useRef(null);

  const load = useCallback(() => {
    try {
      const prods = getAllProductsAdmin();
      setProducts(prods);
      setStock(getAllStock());
      const cats = getCategories();
      setCategories(cats);
      const ord = getCategoryOrder();
      setCatOrder(ord.length > 0 ? ord : cats);
      setModGroups(getAllModifierGroups());
      // Раскрываем все категории по умолчанию
      const exp = {};
      cats.forEach(c => { exp[c] = true; });
      setExpandedCats(exp);
    } catch(e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filteredStock = (stock || []).filter(s =>
    !ingSearch.trim() || s.name.toLowerCase().includes(ingSearch.toLowerCase())
  );

  const handleSave = (data) => {
    try {
      let pid = selected?.id;
      if (!pid) {
        pid = insertProduct({ name: data.name, category: data.category, price: parseFloat(data.vars[0]?.price)||0, active: 1 });
      } else {
        const db = getDb();
        db.runSync(`UPDATE products SET name=?, category=?, active=? WHERE id=?`, [data.name, data.category, data.active ? 1 : 0, pid]);
      }
      upsertProductVariants(pid, data.vars.map(v => ({ id: v.id, label: v.label, size: v.label, price: parseFloat(v.price)||0 })));
      // Техкарты
      const newVars = getProductVariants(pid);
      newVars.forEach((v, i) => {
        const ings = data.vars[i]?.ings || [];
        saveCostCardForVariant(v.id, ings.map(ing => ({ ...ing, amount: parseFloat(ing.amount)||0, price_per_unit: parseFloat(ing.price_per_unit)||0, pricePerUnit: parseFloat(ing.price_per_unit)||0 })));
      });
      // Модификаторы
      setProductModifierGroups(pid, data.selGroups);
      load();
      setSelected(null);
    } catch(e) { Alert.alert('Ошибка', e.message); }
  };

  const handleDelete = (id) => {
    try {
      cleanOrphanCostIngredients(id);
      deleteOldCostCards(id);
      deleteProduct(id);
      load();
      setSelected(null);
    } catch(e) { Alert.alert('Ошибка', e.message); }
  };

  const handleToggleActive = (p) => {
    try { setProductActive(p.id, !p.active); load(); setSelected(null); } catch(e) {}
  };

  // Группируем по категориям
  const filtered = search.trim()
    ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : products;

  const catGroups = (catOrder.length > 0 ? catOrder : categories).map(cat => ({
    cat,
    items: filtered.filter(p => p.category === cat),
  })).filter(g => g.items.length > 0);

  // Модификаторы - сохранение
  const saveGroup = (data) => {
    try {
      if (data.id) { updateModifierGroup(data.id, data); }
      else { insertModifierGroup(data); }
      load(); setGroupModal(null);
    } catch(e) { Alert.alert('Ошибка', e.message); }
  };

  return (
    <View style={styles.root}>
      <TopBar
        title="Товары"
        onBack={() => navigation.navigate(getHomeRoute())}
        rightElement={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {tab === 'products' && (
              <>
                <Pressable style={styles.headerBtn} onPress={() => { setOrderDraft([...catOrder]); setOrderModal(true); }}>
                  <Text style={styles.headerBtnTxt}>⇅</Text>
                </Pressable>
                <Pressable style={styles.addBtn} onPress={() => setSelected('new')}>
                  <Text style={styles.addBtnTxt}>+ Товар</Text>
                </Pressable>
              </>
            )}
            {tab === 'modifiers' && (
              <Pressable style={styles.addBtn} onPress={() => setGroupModal({ name: '', mode: 'add' })}>
                <Text style={styles.addBtnTxt}>+ Группа</Text>
              </Pressable>
            )}
          </View>
        }
      />

      <View style={styles.layout}>

        {/* ── Левая панель ── */}
        <View style={styles.left}>
          {/* Вкладки */}
          <View style={styles.tabBar}>
            {[{ key: 'products', label: 'Товары' }, { key: 'modifiers', label: 'Модификаторы' }].map(t => (
              <Pressable key={t.key} style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]} onPress={() => { setTab(t.key); setSelected(null); }}>
                <Text style={[styles.tabTxt, tab === t.key && styles.tabTxtActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {tab === 'products' && (
            <>
              {/* Поиск */}
              <View style={styles.searchWrap}>
                <TextInput style={styles.searchInput} color={colors.text}
                  value={search} onChangeText={setSearch}
                  placeholder="Поиск товара..." placeholderTextColor={colors.muted} />
              </View>

              {/* Список по категориям */}
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                {catGroups.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyTxt}>{search ? 'Ничего не найдено' : 'Нет товаров'}</Text>
                    <Text style={styles.emptyHint}>Нажмите «+ Товар» чтобы добавить</Text>
                  </View>
                ) : (
                  catGroups.map(({ cat, items }) => {
                    const isOpen = expandedCats[cat] !== false;
                    return (
                      <View key={cat}>
                        <Pressable style={styles.catHeader} onPress={() => setExpandedCats(e => ({ ...e, [cat]: !isOpen }))}>
                          <Text style={styles.catLabel}>{cat}</Text>
                          <Text style={styles.catCount}>{items.length}</Text>
                          <Text style={[styles.catChevron, isOpen && styles.catChevronOpen]}>›</Text>
                        </Pressable>
                        {isOpen && items.map(p => {
                          const isActive = selected?.id === p.id;
                          return (
                            <Pressable
                              key={p.id}
                              style={({ pressed }) => [
                                styles.productRow,
                                isActive && styles.productRowActive,
                                !p.active && { opacity: 0.45 },
                                pressed && { backgroundColor: 'rgba(245,240,232,0.03)' },
                              ]}
                              onPress={() => setSelected(p)}
                            >
                              {isActive && <View style={styles.activeBar} />}
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.productName, isActive && styles.productNameActive]} numberOfLines={1}>{p.name}</Text>
                                <Text style={styles.productPrice}>{fmt(p.price)} ₽</Text>
                              </View>
                              {!p.active && <Text style={styles.inactiveDot}>●</Text>}
                            </Pressable>
                          );
                        })}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </>
          )}

          {tab === 'modifiers' && (
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 10 }}>
              {modGroups.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyTxt}>Нет групп</Text>
                  <Text style={styles.emptyHint}>Нажмите «+ Группа» чтобы создать</Text>
                </View>
              ) : modGroups.map(g => (
                <Pressable key={g.id} style={styles.modGroupCard} onPress={() => setGroupModal(g)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modGroupName}>{g.name}</Text>
                    <Text style={styles.modGroupSub}>{g.mode === 'replace' ? 'Замена' : 'Добавление'}</Text>
                  </View>
                  <Text style={styles.modGroupArrow}>›</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── Правая панель ── */}
        <View style={styles.right}>
          {selected ? (
            <ProductEditor
              key={selected === 'new' ? 'new' : selected.id}
              product={selected === 'new' ? null : selected}
              onSave={handleSave}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
              onClose={() => setSelected(null)}
              categories={categories}
              allModGroups={modGroups}
              onIngPicker={(vi, callback) => { try { setStock(getAllStock()); } catch(_){} setIngPickerState(vi !== null ? { vi } : null); setIngSearch(''); pendingIngCallback.current = callback; }}
            />
          ) : (
            <View style={styles.emptyRight}>
              <Text style={styles.emptyRightTxt}>
                {tab === 'products' ? 'Выберите товар слева или нажмите «+ Товар»' : 'Выберите группу модификаторов'}
              </Text>
            </View>
          )}
        </View>
      </View>

      <BottomBar navigation={navigation} activeTab="Kassa" />

      {/* Пикер ингредиентов — на уровне экрана */}
      <Modal visible={ingPickerState !== null} transparent animationType="fade" onRequestClose={() => setIngPickerState(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setIngPickerState(null)} />
          <View style={styles.ingPickerBox}>
            <View style={styles.ingPickerHeader}>
              <Text style={styles.ingPickerTitle}>Выбрать из склада</Text>
              <Pressable onPress={() => setIngPickerState(null)} hitSlop={12}>
                <Text style={{ color: colors.muted, fontSize: 18 }}>✕</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.ingPickerSearch}
              color={colors.text}
              value={ingSearch}
              onChangeText={setIngSearch}
              placeholder="Поиск по складу..."
              placeholderTextColor={colors.muted}
              autoFocus
            />
            <ScrollView keyboardShouldPersistTaps="handled">
              {filteredStock.map(s => (
                <Pressable key={s.id} style={styles.ingPickerRow} onPress={() => {
                  if (pendingIngCallback.current) {
                    pendingIngCallback.current(s);
                    pendingIngCallback.current = null;
                  }
                  setIngPickerState(null);
                  setIngSearch('');
                }}>
                  <Text style={styles.ingPickerName}>{s.name}</Text>
                  <Text style={styles.ingPickerUnit}>{s.unit}</Text>
                </Pressable>
              ))}
              {filteredStock.length === 0 && (
                <Text style={styles.ingPickerEmpty}>Ничего не найдено</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Модалка порядка категорий */}
      <Modal visible={orderModal} transparent animationType="fade" onRequestClose={() => setOrderModal(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setOrderModal(false)} />
          <View style={styles.orderModalBox}>
            <Text style={styles.orderModalTitle}>Порядок категорий</Text>
            <Text style={styles.orderModalHint}>Порядок влияет на отображение в кассе</Text>
            <ScrollView>
              {orderDraft.map((cat, idx) => (
                <View key={cat} style={styles.orderRow}>
                  <Text style={styles.orderRowTxt}>{cat}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {idx > 0 && (
                      <Pressable style={styles.orderBtn} onPress={() => {
                        const d = [...orderDraft];
                        [d[idx-1], d[idx]] = [d[idx], d[idx-1]];
                        setOrderDraft(d);
                      }}>
                        <Text style={styles.orderBtnTxt}>↑</Text>
                      </Pressable>
                    )}
                    {idx < orderDraft.length-1 && (
                      <Pressable style={styles.orderBtn} onPress={() => {
                        const d = [...orderDraft];
                        [d[idx], d[idx+1]] = [d[idx+1], d[idx]];
                        setOrderDraft(d);
                      }}>
                        <Text style={styles.orderBtnTxt}>↓</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>
            <Pressable style={styles.saveBtn} onPress={() => { saveCategoryOrder(orderDraft); setCatOrder(orderDraft); setOrderModal(false); }}>
              <Text style={styles.saveBtnTxt}>Сохранить порядок</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Модалка группы модификаторов */}
      {groupModal !== null && (
        <ModGroupModal
          group={groupModal}
          onSave={saveGroup}
          onDelete={(id) => { try { deleteModifierGroup(id); load(); setGroupModal(null); } catch(e) {} }}
          onClose={() => setGroupModal(null)}
          stock={stock}
        />
      )}
    </View>
  );
}

// ─── Модалка группы модификаторов ────────────────────────────────────────────
function ModGroupModal({ group, onSave, onDelete, onClose, stock }) {
  const isNew = !group?.id;
  const [name, setName]       = useState(group?.name || '');
  const [mode, setMode]       = useState(group?.mode || 'add');
  const [options, setOptions] = useState(() => {
    try { return group?.id ? (getAllModifierGroups().find(g=>g.id===group.id)?.options || []) : []; } catch { return []; }
  });
  const [ingPickerVar, setIngPickerVar] = useState(null); // индекс варианта

  const addOption = () => setOptions(o => [...o, { id: null, name: '', price: '', ingr_to_replace: '' }]);
  const removeOpt = (i) => setOptions(o => o.filter((_,j)=>j!==i));
  const setOptField = (i, f, val) => setOptions(o => o.map((r,j)=>j===i?{...r,[f]:val}:r));

  const handleSave = () => {
    if (!name.trim()) { Alert.alert('Введите название группы'); return; }
    const data = { ...group, name: name.trim(), mode, options };
    if (data.id) {
      try {
        updateModifierGroup(data.id, { name: data.name, mode: data.mode });
        options.forEach(opt => {
          const optData = { name: opt.name, price: parseFloat(opt.price)||0, group_id: data.id, ingr_to_replace: opt.ingr_to_replace||'' };
          if (opt.id) updateModifierOption(opt.id, optData);
          else insertModifierOption(optData);
        });
      } catch(e) { Alert.alert('Ошибка', e.message); return; }
    }
    onSave(data);
  };

  const filteredStock = (stock || []).filter(s => !ingSearch.trim() || s.name.toLowerCase().includes(ingSearch.toLowerCase()));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.groupModalBox}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{isNew ? 'Новая группа' : group.name}</Text>
            <Pressable onPress={onClose} hitSlop={14} style={styles.closeBtn}>
              <Text style={styles.closeTxt}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">

            <Text style={styles.fieldLabel}>Название группы</Text>
            <TextInput style={styles.input} color={colors.text} value={name}
              onChangeText={setName} placeholder="Молоко, Топпинг, Размер..." placeholderTextColor={colors.muted} autoFocus={isNew} />

            <Text style={styles.fieldLabel}>Режим</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
              {[{ key: 'add', label: 'Добавление' }, { key: 'replace', label: 'Замена' }].map(m => (
                <Pressable key={m.key} style={[styles.chip, mode === m.key && styles.chipActive]} onPress={() => setMode(m.key)}>
                  <Text style={[styles.chipTxt, mode === m.key && styles.chipTxtActive]}>{m.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.ingHint}>
              {mode === 'add' ? 'Добавляется к товару за доп. плату' : 'Заменяет ингредиент (напр. тип молока)'}
            </Text>

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Варианты</Text>
            {options.map((opt, i) => (
              <View key={i} style={[styles.varCard, { marginBottom: 8 }]}>
                <View style={styles.varRow}>
                  <TextInput style={[styles.input, { flex: 1 }]} color={colors.text}
                    value={opt.name} onChangeText={val => setOptField(i, 'name', val)} placeholder="Название варианта" placeholderTextColor={colors.muted} />
                  <TextInput style={[styles.input, { width: 70, textAlign: 'center' }]} color={colors.text}
                    keyboardType="numeric" value={opt.price} onChangeText={val => setOptField(i, 'price', val)} placeholder="0" placeholderTextColor={colors.muted} />
                  <Text style={styles.currencyTxt}>₽</Text>
                  <Pressable onPress={() => removeOpt(i)} hitSlop={10}>
                    <Text style={{ color: colors.muted, fontSize: 18 }}>✕</Text>
                  </Pressable>
                </View>
                {mode === 'replace' && (
                  <Pressable style={styles.addIngBtn} onPress={() => setIngPicker(i)}>
                    <Text style={styles.addIngTxt}>{opt.ingr_to_replace ? `Заменяет: ${opt.ingr_to_replace}` : '+ Что заменяет'}</Text>
                  </Pressable>
                )}
              </View>
            ))}
            <Pressable style={styles.addIngBtn} onPress={addOption}>
              <Text style={styles.addIngTxt}>+ Добавить вариант</Text>
            </Pressable>

            <Pressable style={[styles.saveBtn, { marginTop: 20 }]} onPress={handleSave}>
              <Text style={styles.saveBtnTxt}>{isNew ? 'Создать группу' : 'Сохранить'}</Text>
            </Pressable>
            {!isNew && (
              <Pressable style={[styles.deleteBtn, { marginTop: 8, flex: 0 }]} onPress={() => {
                Alert.alert('Удалить группу?', '', [{ text: 'Отмена' }, { text: 'Удалить', style: 'destructive', onPress: () => onDelete(group.id) }]);
              }}>
                <Text style={styles.deleteTxt}>Удалить группу</Text>
              </Pressable>
            )}
          </ScrollView>

          <Modal visible={ingPicker !== null} transparent animationType="fade" onRequestClose={() => setIngPicker(null)}>
            <View style={styles.modalOverlay}>
              <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setIngPicker(null)} />
              <View style={styles.ingPickerBox}>
                <Text style={styles.ingPickerTitle}>Что заменяет</Text>
                <TextInput style={styles.ingPickerSearch} color={colors.text}
                  value={ingSearch} onChangeText={setIngSearch} placeholder="Поиск..." placeholderTextColor={colors.muted} autoFocus />
                <ScrollView>
                  {filteredStock.map(s => (
                    <Pressable key={s.id} style={styles.ingPickerRow} onPress={() => { setOptField(ingPicker, 'ingr_to_replace', s.name); setIngPicker(null); setIngSearch(''); }}>
                      <Text style={styles.ingPickerName}>{s.name}</Text>
                      <Text style={styles.ingPickerUnit}>{s.unit}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.bg },
  layout: { flex: 1, flexDirection: 'row' },

  // Левая панель
  left:   { width: 280, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface },

  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBtn: { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: colors.orange },
  tabTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  tabTxtActive: { color: colors.orange },

  searchWrap: { padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInput:{ backgroundColor: colors.surface2, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 13 },

  catHeader:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  catLabel:   { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, flex: 1 },
  catCount:   { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginRight: 6 },
  catChevron: { fontSize: 16, color: colors.muted, transform: [{ rotate: '90deg' }] },
  catChevronOpen: { transform: [{ rotate: '-90deg' }] },

  productRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.borderLo, position: 'relative' },
  productRowActive: { backgroundColor: 'rgba(240,160,80,0.06)' },
  activeBar:     { position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 3, borderRadius: 2, backgroundColor: colors.orange },
  productName:   { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  productNameActive: { color: colors.orange },
  productPrice:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  inactiveDot:   { fontSize: 8, color: colors.muted, opacity: 0.5 },

  modGroupCard:  { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: 'row', alignItems: 'center' },
  modGroupName:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  modGroupSub:   { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  modGroupArrow: { fontSize: 18, color: colors.muted },

  emptyWrap: { padding: 32, alignItems: 'center' },
  emptyTxt:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  emptyHint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 6, opacity: 0.7 },

  // Правая панель
  right:      { flex: 1, backgroundColor: colors.bg },
  emptyRight: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyRightTxt: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', opacity: 0.6 },

  // Редактор товара
  editorContent: { padding: 24, paddingBottom: 40 },
  editorHeader:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  editorTitle:   { fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text },
  editorSub:     { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  editorDivider: { height: 1, backgroundColor: colors.border, marginBottom: 20 },
  activeToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeLabel:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },

  fieldLabel:  { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  labelRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 8 },
  input:       { paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 14 },

  chip:        { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive:  { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.08)' },
  chipTxt:     { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  chipTxtActive:{ color: colors.orange },

  addVarBtn:   { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  addVarTxt:   { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },

  varCard:    { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10, overflow: 'hidden' },
  varRow:     { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  priceRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  currencyTxt:{ fontFamily: fonts.familySemibold, fontSize: 16, color: colors.muted },
  marginBadge:{ paddingVertical: 3, paddingHorizontal: 7, borderRadius: 8 },
  marginTxt:  { fontFamily: fonts.familySemibold, fontSize: 11 },

  techToggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface2 },
  techToggleTxt: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, flex: 1 },
  chevron:    { fontSize: 16, color: colors.muted, transform: [{ rotate: '90deg' }] },
  chevronOpen:{ transform: [{ rotate: '-90deg' }] },

  techBody:   { padding: 12, borderTopWidth: 1, borderTopColor: colors.border },
  ingRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  ingName:    { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text, flex: 1 },
  ingInput:   { width: 52, paddingVertical: 7, paddingHorizontal: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 12, textAlign: 'center' },
  ingUnit:    { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, width: 28 },
  ingHint:    { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, fontStyle: 'italic', marginTop: 4, opacity: 0.8 },

  addIngBtn:  { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start', marginTop: 4 },
  addIngTxt:  { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },

  modsCard:   { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  modRow:     { flexDirection: 'row', alignItems: 'center', padding: 13, gap: 10 },
  modRowDiv:  { borderBottomWidth: 1, borderBottomColor: colors.border },
  modName:    { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  modSub:     { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  modCheck:   { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  modCheckActive: { borderColor: colors.orange, backgroundColor: colors.orange },
  modCheckMark:   { fontFamily: fonts.familySemibold, fontSize: 12, color: '#fff' },

  saveBtn:    { backgroundColor: colors.orange, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  saveBtnTxt: { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: '#fff' },

  dangerRow:     { flexDirection: 'row', gap: 10, marginTop: 10 },
  deactivateBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center' },
  deactivateTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  deleteBtn:     { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(217,95,95,0.4)', backgroundColor: 'rgba(217,95,95,0.07)', alignItems: 'center' },
  deleteTxt:     { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.red },

  // Шапки и кнопки
  headerBtn:  { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  headerBtnTxt:{ fontFamily: fonts.familySemibold, fontSize: 16, color: colors.muted },
  addBtn:     { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: 'rgba(240,160,80,0.12)', borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)' },
  addBtnTxt:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orange },

  // Модалки
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  ingPickerInline: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginTop: 8, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  ingPickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface2 },
  ingPickerBox:  { width: '50%', maxHeight: '70%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', alignSelf: 'center' },
  ingPickerTitle:{ fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text },
  ingPickerSearch:{ margin: 12, marginTop: 14, backgroundColor: colors.surface2, borderRadius: 10, padding: 11, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 14, borderWidth: 1, borderColor: colors.border },
  ingPickerRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  ingPickerName: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, flex: 1 },
  ingPickerUnit: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, backgroundColor: colors.surface2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  ingPickerEmpty:{ fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', padding: 32 },

  orderModalBox:   { width: '45%', maxHeight: '70%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 24 },
  orderModalTitle: { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 4 },
  orderModalHint:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginBottom: 16 },
  orderRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  orderRowTxt:{ fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, flex: 1 },
  orderBtn:  { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  orderBtnTxt:{ fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },

  groupModalBox: { width: '55%', maxHeight: '85%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  modalHeader:   { flexDirection: 'row', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface2 },
  modalTitle:    { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text, flex: 1 },
  closeBtn:      { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  closeTxt:      { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted },
});
