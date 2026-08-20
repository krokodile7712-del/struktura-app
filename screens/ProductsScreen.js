import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Modal, Alert, Animated,
} from 'react-native';
import TopBar from '../components/TopBar';
import EmptyState from '../components/EmptyState';
import StockPanel from '../components/panels/StockPanel';
import { useResponsive } from '../hooks/useResponsive';
import Sheet from '../components/Sheet';
import UnitPicker from '../components/UnitPicker';
import AppNav from '../components/AppNav';
import Toggle from '../components/Toggle';
import InfoTip from '../components/InfoTip';
import { useToast } from '../components/Toast';
import { useFocusEffect } from '@react-navigation/native';
import {
  getAllProductsAdmin, insertProduct, setProductActive, deleteProduct,
  getProductVariants, upsertProductVariants,
  getCostCardForVariant, saveCostCardForVariant,
  getAllStock, getCategories, cleanOrphanCostIngredients, deleteOldCostCards, insertStockItem,
  getAllModifierGroups, insertModifierGroup, updateModifierGroup, deleteModifierGroup,
  getCategoryOrder, saveCategoryOrder,
  getAllCategoriesFull, createCategory, renameCategory, deleteCategory, getCategoryProducts,
  insertModifierOption, updateModifierOption, deleteModifierOption,
  getProductModifierGroups, setProductModifierGroups,
  getBusinessProfile, createCombinedProductAndStock,
} from '../db/queries';
import { getDb } from '../db/database';
import { getHomeRoute, goBackSmart, can } from '../db/session';
import { colors, fonts, anim } from '../constants/theme';

const fmt = n => (n||0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function pluralizeProducts(n) {
  const num = Math.abs(n || 0);
  const mod10 = num % 10, mod100 = num % 100;
  if (mod10 === 1 && mod100 !== 11) return 'товар';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'товара';
  return 'товаров';
}

// ─── Правая панель редактирования товара ─────────────────────────────────────
function ProductEditor({ product, onSave, onDelete, onToggleActive, categories, allModGroups, onClose, onIngPicker, onCreateGroup, modifiersEnabled = true }) {
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
        ? v.map(vi => ({ id: vi.id, label: vi.label || vi.size || '', price: String(vi.price || ''), unit: vi.unit || 'шт', deduction_mode: vi.deduction_mode === 'variable' ? 'variable' : 'fixed', ings: Array.isArray(tc[vi.id]?.ingredients) ? tc[vi.id].ingredients.map(ing => ({ ...ing, amount: String(ing.amount || ''), price_per_unit: String(ing.price_per_unit || '') })) : [] }))
        : [{ id: null, label: '', price: String(product?.price || ''), unit: 'шт', deduction_mode: 'fixed', ings: [] }];
    } catch { return [{ id: null, label: '', price: '', unit: 'шт', deduction_mode: 'fixed', ings: [] }]; }
  });
  const [selGroups, setSelGroups] = useState(() => {
    try { return product?.id ? getProductModifierGroups(product.id).map(g => Number(g.id)) : []; } catch { return []; }
  });
  const [ingPickerVar, setIngPickerVar] = useState(null); // индекс варианта
  const [expandedVar, setExpandedVar] = useState(-1);
  const [unitOpenVar, setUnitOpenVar] = useState(-1);
  const [optionsOpen, setOptionsOpen] = useState(selGroups.length > 0);


  const addVariant   = () => setVars(v => [...v, { id: null, label: '', price: '', deduction_mode: 'fixed', ings: [] }]);
  const removeVariant= (i) => setVars(v => v.filter((_,j) => j !== i));
  const setVarField  = (i, f, val) => setVars(v => v.map((r,j) => j===i ? {...r,[f]:val} : r));
  const addIng = (vi, s) => {
    setVars(v => v.map((r,j) => j===vi ? { ...r, ings: [...(Array.isArray(r.ings) ? r.ings : []), { name: s.name, amount: '', unit: s.unit, price_per_unit: String(s.avg_price || s.last_price || '') }] } : r));
    setIngPickerVar(null);
  };

  const removeIng    = (vi, ii) => setVars(v => v.map((r,j) => j===vi ? { ...r, ings: (Array.isArray(r.ings) ? r.ings : []).filter((_,k)=>k!==ii) } : r));
  const setIngField  = (vi, ii, f, val) => setVars(v => v.map((r,j) => j===vi ? { ...r, ings: (Array.isArray(r.ings) ? r.ings : []).map((ing,k) => k===ii ? {...ing,[f]:val} : ing) } : r));
  const setDeductionMode = (vi, mode) => setVars(v => v.map((r,j) => j===vi ? { ...r, deduction_mode: mode } : r));

  const handleSave = () => {
    if (!name.trim()) { Alert.alert('Введите название товара'); return; }
    onSave({ name: name.trim(), category, active, vars, selGroups });
  };

  const totalCost = (v) => { const ings = Array.isArray(v?.ings) ? v.ings : []; return ings.reduce((s, ing) => s + (parseFloat(ing?.amount)||0) * (parseFloat(ing?.price_per_unit)||0), 0); };
  const margin    = (v) => { const c = totalCost(v); const p = parseFloat(v.price)||0; return p > 0 && c > 0 ? Math.round((1 - c/p)*100) : null; };

  return (
      <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">

        {/* Шапка */}
        <View style={styles.editorHeader}>
          <View style={{ flex: 1 }}>
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
          placeholder="Название товара или услуги"
          placeholderTextColor={colors.muted}
          autoFocus={isNew}
        />

        {/* Категория */}
        <View style={styles.labelRow}>
          <Text style={styles.fieldLabel}>Категория</Text>
          <InfoTip title="Категория" text="Группирует товары в списке и в кассе. Клиент её не видит. Есть нужная — выберите её; нет — впишите новую, она появится в списке для следующих товаров." />
        </View>
        {categories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {categories.map(cat => (
              <Pressable key={cat} style={[styles.chip, category === cat && styles.chipActive]} onPress={() => setCategory(cat)}>
                <Text style={[styles.chipTxt, category === cat && styles.chipTxtActive]}>{cat}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <TextInput
          style={[styles.input, { marginTop: categories.length > 0 ? 8 : 0 }]}
          color={colors.text}
          value={category}
          onChangeText={setCategory}
          placeholder={categories.length > 0 ? 'Или впишите новую категорию' : 'Название категории (например, Напитки)'}
          placeholderTextColor={colors.muted}
        />

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

              <Pressable onPress={() => setUnitOpenVar(o => o === vi ? -1 : vi)} style={styles.unitToggleRow}>
                <Text style={styles.unitToggleTxt}>
                  Единица продажи: {v.unit || 'шт'}{unitOpenVar !== vi ? '  ›' : '  ▾'}
                </Text>
              </Pressable>
              {unitOpenVar === vi && (
                <View style={{ marginBottom: 10 }}>
                  <UnitPicker value={v.unit || 'шт'} onChange={val => setVarField(vi, 'unit', val)} />
                </View>
              )}

              {/* Списание со склада (была "Техкарта") */}
              {canEditCost ? (() => {
                const hasIngs = Array.isArray(v.ings) && v.ings.length > 0;
                const deductOn = isOpen || hasIngs;
                return (
                <>
                {!deductOn ? (
                  <View style={styles.deductQuestion}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <Text style={styles.deductQuestionTxt}>Нужна техкарта?</Text>
                      <InfoTip title="Техкарта" text="Список того, что расходуется на одну продажу — ингредиенты, материалы, расходники. Например, для «Стрижка мужская» — шампунь и бальзам. Каждая продажа автоматически спишет остаток нужных позиций на складе. Не нужна — просто пропустите." />
                    </View>
                    <Toggle value={false} onValueChange={() => setExpandedVar(vi)} size="sm" />
                  </View>
                ) : (
                <>
                <Pressable style={styles.techToggle} onPress={() => setExpandedVar(hasIngs ? (isOpen ? -1 : vi) : vi)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Text style={styles.techToggleTxt}>
                      Техкарта{hasIngs ? ` · ${v.ings.length} поз.` : ''}
                    </Text>
                    <InfoTip title="Техкарта" text="Каждая продажа автоматически спишет остаток указанных позиций на складе. Уберите все позиции, чтобы отключить техкарту для этого товара." />
                  </View>
                  <Toggle value={true} onValueChange={() => setExpandedVar(-1)} size="sm" />
                </Pressable>

                {isOpen && (
                  <View style={styles.techBody}>
                    <View style={styles.modeSwitchRow}>
                      <Pressable
                        style={[styles.modeSwitchBtn, (v.deduction_mode || 'fixed') === 'fixed' && styles.modeSwitchBtnActive]}
                        onPress={() => setDeductionMode(vi, 'fixed')}
                      >
                        <Text style={[styles.modeSwitchTxt, (v.deduction_mode || 'fixed') === 'fixed' && styles.modeSwitchTxtActive]}>Фиксированный расход</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.modeSwitchBtn, v.deduction_mode === 'variable' && styles.modeSwitchBtnActive]}
                        onPress={() => setDeductionMode(vi, 'variable')}
                      >
                        <Text style={[styles.modeSwitchTxt, v.deduction_mode === 'variable' && styles.modeSwitchTxtActive]}>Расход по факту</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.ingListHint}>
                      {v.deduction_mode === 'variable'
                        ? 'Количество каждого материала вводится заново при каждой продаже — цена и списание считаются по факту (подходит, когда расход у каждого клиента разный)'
                        : 'Сколько расходуется на одну продажу этого товара — при каждом заказе именно столько спишется со склада'}
                    </Text>
                    {(Array.isArray(v.ings) ? v.ings : []).map((ing, ii) => (
                      <View key={ii} style={styles.ingCard}>
                        <View style={styles.ingCardHead}>
                          <Text style={styles.ingName} numberOfLines={1}>{ing.name}</Text>
                          <Pressable onPress={() => removeIng(vi, ii)} hitSlop={10}>
                            <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
                          </Pressable>
                        </View>
                        {v.deduction_mode !== 'variable' && (
                        <View style={styles.ingFieldRow}>
                          <Text style={styles.ingFieldLabel}>Расход на 1 продажу</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TextInput style={styles.ingInput} color={colors.text}
                              keyboardType="numeric" value={ing.amount}
                              onChangeText={val => setIngField(vi, ii, 'amount', val)}
                              placeholder="0" placeholderTextColor={colors.muted} />
                            <Text style={styles.ingUnit}>{ing.unit}</Text>
                          </View>
                        </View>
                        )}
                      </View>
                    ))}
                    <Pressable style={styles.addIngBtn} onPress={() => { setIngPickerVar(vi); onIngPicker?.(vi, (s) => addIng(vi, s)); }}>
                      <Text style={styles.addIngTxt}>+ Добавить со склада</Text>
                    </Pressable>
                  </View>
                )}
                </>
                )}
                </>
                );
              })() : (
              <View style={[styles.techToggle, { opacity: 0.4 }]}>
                <Text style={styles.techToggleTxt}>Списание со склада · нет доступа</Text>
              </View>
              )}
            </View>
          );
        })}

        {/* Опции (модификаторы) */}
        {modifiersEnabled && (
        <>
        <View style={styles.priceRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Text style={styles.fieldLabel}>Есть доп. опции с доплатой?</Text>
            <InfoTip title="Опции" text="Дополнительные варианты, которые кассир предложит при заказе — доп. порция, замена одного на другое и т.п., за отдельную плату или без неё. Один список опций можно переиспользовать в разных товарах." />
          </View>
          <Toggle value={optionsOpen} onValueChange={setOptionsOpen} size="sm" />
        </View>

        {optionsOpen && (
          <>
            {allModGroups && allModGroups.length > 0 && (
              <View style={[styles.modsCard, { marginTop: 8 }]}>
                {allModGroups.map((g, idx) => {
                  const on = selGroups.includes(Number(g.id));
                  return (
                    <View key={g.id}
                      style={[styles.modRow, idx < allModGroups.length-1 && styles.modRowDiv]}>
                      <Pressable style={{ flex: 1 }} onPress={() => onCreateGroup(g)}>
                        <Text style={styles.modName}>{g.name}</Text>
                        <Text style={styles.modSub}>{g.apply_mode === 'replace' ? 'Замена' : 'Добавление'} · нажмите, чтобы изменить</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.modCheck, on && styles.modCheckActive]}
                        hitSlop={10}
                        onPress={() => setSelGroups(s => on ? s.filter(x=>x!==Number(g.id)) : [...s, Number(g.id)])}
                      >
                        {on && <Text style={styles.modCheckMark}>✓</Text>}
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
            <Pressable style={styles.addIngBtn} onPress={() => onCreateGroup()}>
              <Text style={styles.addIngTxt}>+ Создать опцию</Text>
            </Pressable>
          </>
        )}
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
  );
}

// ─── Главный экран ─────────────────────────────────────────────────────────────
export default function ProductsScreen({ navigation, route }) {
  const toast = useToast();
  const { isLandscape } = useResponsive();
  const [tab, setTab]               = useState(route?.params?.initialTab || 'products'); // products | stock | modifiers
  const [modules, setModules]       = useState({});
  const [products, setProducts]     = useState([]);
  const [stock, setStock]           = useState([]);
  const [categories, setCategories] = useState([]);
  const [allCategoryNames, setAllCategoryNames] = useState([]); // включая пустые — для выбора в редакторе товара
  const [catOrder, setCatOrder]     = useState([]);
  const [modGroups, setModGroups]   = useState([]);
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState(null);      // {id, name, ...} | 'new'
  const [stockCreateSignal, setStockCreateSignal] = useState(0);
  const [ingCreateForm, setIngCreateForm] = useState(null);
  const [expandedCats, setExpandedCats] = useState({});
  const [catMgmtOpen, setCatMgmtOpen] = useState(false);
  const [catList, setCatList]       = useState([]); // [{id, name, productCount}]
  const [catDetail, setCatDetail]   = useState(null); // {id, name, productCount} | null
  const [catNameDraft, setCatNameDraft] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [catDetailProducts, setCatDetailProducts] = useState([]);
  const [deletePrompt, setDeletePrompt] = useState(null); // {id, name, count, moveTo} | null
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
      try { setAllCategoryNames(getAllCategoriesFull().map(c => c.name)); } catch(_) { setAllCategoryNames(cats); }
      const ord = getCategoryOrder();
      setCatOrder(ord.length > 0 ? ord : cats);
      setModGroups(getAllModifierGroups());
      try { setModules(getBusinessProfile()?.modules || {}); } catch (_) {}
      // Раскрываем все категории по умолчанию
      const exp = {};
      cats.forEach(c => { exp[c] = true; });
      setExpandedCats(exp);
    } catch(e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    if (route?.params?.initialTab) setTab(route.params.initialTab);
  }, [load, route?.params?.initialTab]));

  const loadCategories = useCallback(() => {
    try { setCatList(getAllCategoriesFull()); } catch(e) { console.error(e); }
  }, []);

  const openCategoryMgmt = () => {
    loadCategories();
    setNewCatName('');
    setCatDetail(null);
    setCatMgmtOpen(true);
  };

  const handleCreateCategory = () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    try {
      createCategory(trimmed);
      setNewCatName('');
      loadCategories();
      load(); // обновляем список категорий и в основном экране
    } catch(e) { console.error(e); }
  };

  const openCategoryDetail = (cat) => {
    setCatDetail(cat);
    setCatNameDraft(cat.name);
    try { setCatDetailProducts(getCategoryProducts(cat.name)); } catch(_) { setCatDetailProducts([]); }
  };

  const handleRenameCategory = () => {
    if (!catDetail) return;
    const trimmed = catNameDraft.trim();
    if (!trimmed || trimmed === catDetail.name) return;
    const res = renameCategory(catDetail.id, trimmed);
    if (res?.error === 'duplicate') { Alert.alert('Такая категория уже есть', 'Придумайте другое название.'); return; }
    if (res?.error) { Alert.alert('Не удалось переименовать'); return; }
    loadCategories();
    load();
    setCatDetail({ ...catDetail, name: trimmed });
    try { setCatDetailProducts(getCategoryProducts(trimmed)); } catch(_) {}
  };

  const requestDeleteCategory = () => {
    if (!catDetail) return;
    if (catDetail.productCount > 0) {
      setDeletePrompt({ id: catDetail.id, name: catDetail.name, count: catDetail.productCount, moveTo: '' });
    } else {
      deleteCategory(catDetail.id, null);
      loadCategories();
      load();
      setCatDetail(null);
    }
  };

  const confirmDeleteCategory = () => {
    if (!deletePrompt) return;
    if (!deletePrompt.moveTo) { Alert.alert('Выберите категорию', 'Укажите, куда перенести товары.'); return; }
    const res = deleteCategory(deletePrompt.id, deletePrompt.moveTo);
    if (res?.error) { Alert.alert('Не удалось удалить'); return; }
    setDeletePrompt(null);
    loadCategories();
    load();
    setCatDetail(null);
  };

  const reorderCategory = (idx, dir) => {
    const d = [...catList];
    const j = idx + dir;
    if (j < 0 || j >= d.length) return;
    [d[idx], d[j]] = [d[j], d[idx]];
    setCatList(d);
    saveCategoryOrder(d.map(c => c.name));
    setCatOrder(d.map(c => c.name));
  };

  const isLowStock = (s) => {
    const cur = s['остаток'] ?? 0;
    const thr = s['порог'] ?? 0;
    return cur < 0 || (thr > 0 && cur <= thr);
  };

  const filteredStock = (stock || []).filter(s =>
    !ingSearch.trim() || s.name.toLowerCase().includes(ingSearch.toLowerCase())
  );
  const stockCatsList = [...new Set((stock || []).map(s => s.category).filter(Boolean))].sort();

  const saveIngCreateForm = () => {
    if (!ingCreateForm?.name?.trim()) { toast.show('Укажите название', 'warn'); return; }
    const res = insertStockItem({
      name: ingCreateForm.name,
      unit: ingCreateForm.unit || 'шт',
      category: ingCreateForm.category || 'Прочее',
      threshold: parseFloat(ingCreateForm.threshold) || 0,
      initialQty: parseFloat(ingCreateForm.initialStock) || 0,
    });
    if (!res.ok) { toast.show(res.error, 'warn'); return; }
    if (parseFloat(ingCreateForm.sellPrice) > 0) {
      try {
        const db = getDb();
        db.runSync(`UPDATE stock SET sell_price = ? WHERE id = ?`, [parseFloat(ingCreateForm.sellPrice), res.id]);
      } catch (_) {}
    }
    const created = { id: res.id, name: ingCreateForm.name, unit: ingCreateForm.unit || 'шт' };
    try { setStock(getAllStock()); } catch (_) {}
    if (pendingIngCallback.current) {
      pendingIngCallback.current(created);
      pendingIngCallback.current = null;
    }
    setIngCreateForm(null);
    setIngPickerState(null);
    setIngSearch('');
  };

  const handleSave = (data) => {
    try {
      let pid = selected?.id;
      if (!pid) {
        pid = insertProduct({ name: data.name, category: data.category, price: parseFloat(data.vars[0]?.price)||0, active: 1 });
      } else {
        const db = getDb();
        db.runSync(`UPDATE products SET name=?, category=?, active=?, price=? WHERE id=?`, [data.name, data.category, data.active ? 1 : 0, parseFloat(data.vars[0]?.price)||0, pid]);
      }
      upsertProductVariants(pid, data.vars.map(v => ({ id: v.id, label: v.label, size: v.label, price: parseFloat(v.price)||0, deduction_mode: v.deduction_mode === 'variable' ? 'variable' : 'fixed', unit: v.unit || 'шт' })));
      // Техкарты
      const newVars = getProductVariants(pid);
      newVars.forEach((v, i) => {
        const ings = Array.isArray(data.vars[i]?.ings) ? data.vars[i].ings : [];
        saveCostCardForVariant(v.id, ings.map(ing => ({

          name: ing.name || '',
          amount: parseFloat(ing.amount)||0,
          unit: ing.unit || '',
          pricePerUnit: parseFloat(ing.price_per_unit)||0,
          factor: 1,
        })));
      });
      // Модификаторы
      setProductModifierGroups(pid, data.selGroups || []);
      setSelected(null);
      load();
    } catch(e) { console.error('[handleSave ERROR]', e.message, e.stack?.split('\n')[1]); Alert.alert('Ошибка', e.message); }
  };

  const handleDelete = (id) => {
    try {
      cleanOrphanCostIngredients(id);
      deleteOldCostCards(id);
      deleteProduct(id);
      setSelected(null);
      load();
    } catch(e) { console.error('[handleSave ERROR]', e.message, e.stack?.split('\n')[1]); Alert.alert('Ошибка', e.message); }
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
    } catch(e) { console.error('[handleSave ERROR]', e.message, e.stack?.split('\n')[1]); Alert.alert('Ошибка', e.message); }
  };

  return (
    <View style={styles.root}>
      <TopBar
        title="Товары"
        onBack={() => goBackSmart(navigation)}
        rightElement={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {tab === 'products' && (
              <Pressable style={styles.headerBtn} onPress={openCategoryMgmt}>
                <Text style={styles.headerBtnTxt}>🗂</Text>
              </Pressable>
            )}
            {tab === 'modifiers' && (
              <Pressable style={styles.addBtn} onPress={() => setGroupModal({ name: '', mode: 'add' })}>
                <Text style={styles.addBtnTxt}>+ Группа</Text>
              </Pressable>
            )}
          </View>
        }
      />

      {/* Вкладки — всегда видны, независимо от активной */}
      <View style={styles.tabBarOuter}>
        {[{ key: 'products', label: 'Товары' }, { key: 'stock', label: 'Склад' }]
          .filter(t => t.key !== 'stock' || modules.stock !== false)
          .map(t => (
          <Pressable key={t.key} style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]} onPress={() => { setTab(t.key); setSelected(null); }}>
            <Text style={[styles.tabTxt, tab === t.key && styles.tabTxtActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'stock' ? (
        <StockPanel navigation={navigation} openCreateSignal={stockCreateSignal} hideOwnCreateButton />
      ) : (
      <View style={[styles.layout, isLandscape && { flexDirection: 'row' }]}>

        {/* ── Левая панель ── */}
        <View style={[styles.left, isLandscape && styles.leftLandscape]}>

          {tab === 'products' && (
            <>
              {/* Поиск */}
              <View style={styles.searchWrap}>
                <TextInput style={styles.searchInput} color={colors.text}
                  value={search} onChangeText={setSearch}
                  placeholder="Поиск товара..." placeholderTextColor={colors.muted} />
              </View>

              {/* Список по категориям */}
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}
                contentContainerStyle={catGroups.length === 0 ? { flexGrow: 1, justifyContent: 'center' } : undefined}>
                {catGroups.length === 0 ? (
                  <EmptyState icon="🛍" title={search ? 'Ничего не найдено' : 'Нет товаров'}
                    text={search ? undefined : 'Добавьте первый товар или услугу, чтобы начать продавать'}
                    action={search ? undefined : '+ Добавить товар'}
                    onAction={search ? undefined : () => setSelected('new')} />
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
                    <Text style={styles.modGroupSub}>{g.apply_mode === 'replace' ? 'Замена' : 'Добавление'}</Text>
                  </View>
                  <Text style={styles.modGroupArrow}>›</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      {(() => {
        const editorContent = selected && (
          <ProductEditor
            key={selected?.id ? selected.id : `new-${selected?.category || ''}`}
            product={selected === 'new' ? null : selected}
            onSave={handleSave}
            onDelete={handleDelete}
            onToggleActive={handleToggleActive}
            onClose={() => setSelected(null)}
            categories={allCategoryNames}
            allModGroups={modGroups}
            onIngPicker={(vi, callback) => { try { setStock(getAllStock()); } catch(_){} setIngPickerState(vi !== null ? { vi } : null); setIngSearch(''); pendingIngCallback.current = callback; }}
            onCreateGroup={(g) => setGroupModal(g || { name: '', mode: 'add' })}
            modifiersEnabled={modules.modifiers !== false}
          />
        );
        const editorTitle = selected === 'new' ? 'Новый товар' : (selected?.name || 'Товар');

        return isLandscape && tab === 'products' ? (
          /* Альбомная ориентация — редактор товара постоянной панелью справа от списка */
          <View style={styles.landscapeEditorPanel}>
            {selected ? (
              <>
                <View style={styles.landscapeHeader}>
                  <Text style={styles.landscapeHeaderTxt} numberOfLines={1}>{editorTitle}</Text>
                </View>
                {editorContent}
              </>
            ) : (
              <View style={styles.emptyRight}>
                <Text style={{ fontSize: 48 }}>🛍</Text>
                <Text style={styles.emptyRightTxt}>Выберите товар</Text>
              </View>
            )}
          </View>
        ) : (
          /* Редактор товара — выезжающий слой поверх списка, а не соседняя колонка */
          <Sheet visible={!!selected} onClose={() => setSelected(null)} title={editorTitle}>
            {editorContent}
          </Sheet>
        );
      })()}

      </View>
      )}

      {tab !== 'modifiers' && (
        <Pressable style={styles.fab} onPress={() => { if (tab === 'stock') { setStockCreateSignal(s => s + 1); } else { setTab('products'); setSelected('new'); } }}>
          <Text style={styles.fabTxt}>+</Text>
        </Pressable>
      )}

      {/* Пикер ингредиентов — на уровне экрана */}
      <Sheet
        visible={ingPickerState !== null}
        onClose={() => { setIngPickerState(null); setIngCreateForm(null); }}
        title="Выбрать материал"
      >
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
          {/* Создание новой позиции — наверху списка, раскрывается на месте */}
          <Pressable
            style={styles.ingPickerCreateRow}
            onPress={() => setIngCreateForm(f => f
              ? null
              : { name: ingSearch.trim(), unit: 'шт', category: '', sellPrice: '', threshold: '', initialStock: '' }
            )}
          >
            <Text style={styles.ingPickerCreateTxt}>
              {ingCreateForm ? '✕ Свернуть' : `+ Новая позиция${ingSearch.trim() ? ` «${ingSearch.trim()}»` : ''}`}
            </Text>
          </Pressable>

          {ingCreateForm && (
            <View style={styles.inlineCreateCard}>
              <Text style={styles.combLabel}>Название</Text>
              <TextInput color={colors.text} style={styles.combInput}
                value={ingCreateForm.name} onChangeText={v => setIngCreateForm(f => ({ ...f, name: v }))}
                placeholder="Название" placeholderTextColor={colors.muted} autoFocus={!ingSearch.trim()} />

              <Text style={styles.combLabel}>Категория склада</Text>
              {stockCatsList.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                  {stockCatsList.map(cat => (
                    <Pressable key={cat} style={[styles.chip, ingCreateForm.category === cat && styles.chipActive]} onPress={() => setIngCreateForm(f => ({ ...f, category: cat }))}>
                      <Text style={[styles.chipTxt, ingCreateForm.category === cat && styles.chipTxtActive]}>{cat}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              <TextInput color={colors.text} style={[styles.combInput, { marginTop: stockCatsList.length > 0 ? 8 : 0 }]}
                value={ingCreateForm.category} onChangeText={v => setIngCreateForm(f => ({ ...f, category: v }))}
                placeholder="Или впишите новую категорию" placeholderTextColor={colors.muted} />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.combLabel}>Единица</Text>
                  <UnitPicker value={ingCreateForm.unit} onChange={v => setIngCreateForm(f => ({ ...f, unit: v }))} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.combLabel}>Остаток сейчас</Text>
                  <TextInput color={colors.text} style={styles.combInput} keyboardType="numeric"
                    value={ingCreateForm.initialStock} onChangeText={v => setIngCreateForm(f => ({ ...f, initialStock: v }))}
                    placeholder="0" placeholderTextColor={colors.muted} />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.combLabel}>Порог (необязательно)</Text>
                  <TextInput color={colors.text} style={styles.combInput} keyboardType="numeric"
                    value={ingCreateForm.threshold} onChangeText={v => setIngCreateForm(f => ({ ...f, threshold: v }))}
                    placeholder="0" placeholderTextColor={colors.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.combLabel}>Цена продажи (необязательно)</Text>
                  <TextInput color={colors.text} style={styles.combInput} keyboardType="numeric"
                    value={ingCreateForm.sellPrice} onChangeText={v => setIngCreateForm(f => ({ ...f, sellPrice: v }))}
                    placeholder="0" placeholderTextColor={colors.muted} />
                </View>
              </View>
              <Text style={styles.combHint}>Себестоимость появится сама после первой закупки на складе.</Text>

              <Pressable style={styles.combSaveBtn} onPress={saveIngCreateForm}>
                <Text style={styles.combSaveTxt}>Создать и добавить в товар</Text>
              </Pressable>
            </View>
          )}

          {filteredStock.map(s => (
            <Pressable key={s.id} style={[styles.ingPickerRow, isLowStock(s) && styles.ingPickerRowLow]} onPress={() => {
              if (pendingIngCallback.current) {
                pendingIngCallback.current(s);
                pendingIngCallback.current = null;
              }
              setIngPickerState(null);
              setIngSearch('');
              setIngCreateForm(null);
            }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.ingPickerName, isLowStock(s) && styles.ingPickerNameLow]}>{s.name}</Text>
                <Text style={[styles.ingPickerStockQty, isLowStock(s) && styles.ingPickerNameLow]}>
                  Остаток: {s['остаток'] ?? 0} {s.unit}
                </Text>
              </View>
              <Text style={styles.ingPickerUnit}>{s.unit}</Text>
            </Pressable>
          ))}
          {filteredStock.length === 0 && (
            <Text style={styles.ingPickerEmpty}>Ничего не найдено</Text>
          )}
        </ScrollView>
      </Sheet>

      {/* Модалка управления категориями */}
      <Sheet
        visible={catMgmtOpen}
        onClose={() => { setCatMgmtOpen(false); setCatDetail(null); }}
        onBack={catDetail ? () => setCatDetail(null) : undefined}
        title={catDetail ? catDetail.name : 'Категории'}
      >
            {!catDetail ? (
              <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
                {/* ── Список категорий ── */}
                <Text style={styles.orderModalHint}>Стрелками меняете порядок в кассе. Нажмите на категорию, чтобы переименовать, удалить или посмотреть товары.</Text>

                <View style={styles.newCatRow}>
                  <TextInput
                    style={styles.newCatInput}
                    color={colors.text}
                    value={newCatName}
                    onChangeText={setNewCatName}
                    placeholder="Название новой категории"
                    placeholderTextColor={colors.muted}
                    onSubmitEditing={handleCreateCategory}
                    returnKeyType="done"
                  />
                  <Pressable style={styles.newCatBtn} onPress={handleCreateCategory}>
                    <Text style={styles.newCatBtnTxt}>+</Text>
                  </Pressable>
                </View>

                {catList.length === 0 && (
                  <Text style={{ color: colors.muted, textAlign: 'center', paddingVertical: 20 }}>Категорий пока нет</Text>
                )}
                {catList.map((cat, idx) => (
                  <Pressable key={cat.id} style={styles.orderRow} onPress={() => openCategoryDetail(cat)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderRowTxt}>{cat.name}</Text>
                      <Text style={styles.catCountTxt}>{cat.productCount} {pluralizeProducts(cat.productCount)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {idx > 0 && (
                        <Pressable style={styles.orderBtn} onPress={(e) => { e.stopPropagation?.(); reorderCategory(idx, -1); }}>
                          <Text style={styles.orderBtnTxt}>↑</Text>
                        </Pressable>
                      )}
                      {idx < catList.length - 1 && (
                        <Pressable style={styles.orderBtn} onPress={(e) => { e.stopPropagation?.(); reorderCategory(idx, 1); }}>
                          <Text style={styles.orderBtnTxt}>↓</Text>
                        </Pressable>
                      )}
                      <Text style={styles.orderRowChevron}>›</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
                {/* ── Детальный вид категории ── */}
                <Text style={styles.fieldLabel}>Название категории</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    color={colors.text}
                    value={catNameDraft}
                    onChangeText={setCatNameDraft}
                    placeholderTextColor={colors.muted}
                  />
                  <Pressable
                    style={[styles.newCatBtn, catNameDraft.trim() === catDetail.name && { opacity: 0.4 }]}
                    onPress={handleRenameCategory}
                    disabled={catNameDraft.trim() === catDetail.name}
                  >
                    <Text style={styles.newCatBtnTxt}>✓</Text>
                  </Pressable>
                </View>

                <View style={styles.labelRow}>
                  <Text style={styles.fieldLabel}>Товары в категории ({catDetailProducts.length})</Text>
                  <Pressable onPress={() => { setCatMgmtOpen(false); setCatDetail(null); setSelected({ id: null, category: catDetail.name }); }}>
                    <Text style={styles.catAddProductTxt}>+ Добавить товар</Text>
                  </Pressable>
                </View>

                {catDetailProducts.length === 0 && (
                  <Text style={{ color: colors.muted, paddingVertical: 12 }}>В этой категории пока нет товаров</Text>
                )}
                {catDetailProducts.map(p => (
                  <Pressable
                    key={p.id}
                    style={styles.catProductRow}
                    onPress={() => { setCatMgmtOpen(false); setCatDetail(null); setSelected(p); }}
                  >
                    <Text style={styles.catProductTxt}>{p.name}</Text>
                    <Text style={styles.orderRowChevron}>›</Text>
                  </Pressable>
                ))}

                <Pressable style={styles.catDeleteBtn} onPress={requestDeleteCategory}>
                  <Text style={styles.catDeleteTxt}>Удалить категорию</Text>
                </Pressable>
              </ScrollView>
            )}
      </Sheet>

      {/* Модалка: категория не пуста — куда перенести товары перед удалением */}
      <Modal visible={!!deletePrompt} transparent animationType="fade" onRequestClose={() => setDeletePrompt(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setDeletePrompt(null)} />
          <View style={styles.modalBoxSm}>
            <Text style={styles.orderModalTitle}>Перенести товары</Text>
            <Text style={styles.orderModalHint}>
              В категории «{deletePrompt?.name}» ещё {deletePrompt?.count} {pluralizeProducts(deletePrompt?.count)}. Выберите, куда их перенести перед удалением.
            </Text>
            <ScrollView style={{ maxHeight: 220 }}>
              {catList.filter(c => c.id !== deletePrompt?.id).map(c => (
                <Pressable
                  key={c.id}
                  style={[styles.orderRow, deletePrompt?.moveTo === c.name && styles.orderRowActive]}
                  onPress={() => setDeletePrompt(p => ({ ...p, moveTo: c.name }))}
                >
                  <Text style={styles.orderRowTxt}>{c.name}</Text>
                  {deletePrompt?.moveTo === c.name && <Text style={{ color: colors.orange }}>✓</Text>}
                </Pressable>
              ))}
              {catList.length <= 1 && (
                <Text style={{ color: colors.muted, paddingVertical: 12 }}>Больше категорий нет — сначала создайте другую категорию, куда можно перенести товары.</Text>
              )}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setDeletePrompt(null)}>
                <Text style={styles.cancelTxt}>Отмена</Text>
              </Pressable>
              <Pressable style={[styles.catDeleteBtn, { flex: 1, marginTop: 0 }]} onPress={confirmDeleteCategory}>
                <Text style={styles.catDeleteTxt}>Удалить</Text>
              </Pressable>
            </View>
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
  const [mode, setMode]       = useState(group?.apply_mode || 'add');
  const [options, setOptions] = useState(() => {
    try { return group?.id ? (getAllModifierGroups().find(g=>g.id===group.id)?.options || []) : []; } catch { return []; }
  });
  const [ingPickerVar, setIngPickerVar] = useState(null); // индекс варианта
  const [ingPicker, setIngPicker] = useState(null); // индекс опции, для которой выбираем замену
  const [ingSearch, setIngSearch] = useState('');

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
    <Sheet
      visible
      onClose={onClose}
      onBack={ingPicker !== null ? () => { setIngPicker(null); setIngSearch(''); } : undefined}
      title={ingPicker !== null ? 'Что заменяет' : (isNew ? 'Новая группа' : group.name)}
    >
      {ingPicker !== null ? (
        <View style={{ flex: 1, padding: 20 }}>
          <TextInput style={styles.ingPickerSearch} color={colors.text}
            value={ingSearch} onChangeText={setIngSearch} placeholder="Поиск..." placeholderTextColor={colors.muted} autoFocus />
          <ScrollView>
            {filteredStock.map(s => (
              <Pressable key={s.id} style={styles.ingPickerRow} onPress={() => { setOptField(ingPicker, 'ingr_to_replace', s.name); setIngPicker(null); setIngSearch(''); }}>
                <Text style={[styles.ingPickerName, { flex: 1 }]}>{s.name}</Text>
                <Text style={styles.ingPickerUnit}>{s.unit}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : (
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">

            <Text style={styles.fieldLabel}>Название группы</Text>
            <TextInput style={styles.input} color={colors.text} value={name}
              onChangeText={setName} placeholder="Название группы (Размер, Цвет, Начинка...)" placeholderTextColor={colors.muted} autoFocus={isNew} />

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
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.bg },
  layout: { flex: 1 },

  // Левая панель
  left:   { flex: 1, backgroundColor: colors.surface },
  leftLandscape: { flex: 0, width: '38%', maxWidth: 420, borderRightWidth: 1, borderRightColor: colors.border },

  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBarOuter: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },

  fab: {
    position: 'absolute', right: 20, bottom: 92,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.orange,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6, zIndex: 20,
  },
  fabTxt: { fontSize: 28, color: '#fff', fontFamily: fonts.family, fontWeight: '700', marginTop: -2 },

  modeCard: { backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 10 },
  modeCardHighlight: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.06)' },
  modeCardTitle: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text, marginBottom: 4 },
  modeCardSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, lineHeight: 17 },

  combLabel: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12, marginBottom: 6 },
  combInput: { padding: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontFamily: fonts.family, fontSize: 15 },
  combHint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, lineHeight: 17, marginTop: 16 },
  combSaveBtn: { backgroundColor: colors.orange, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  combSaveTxt: { fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: '#fff' },

  tabBtn: { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: colors.orange },
  tabTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  tabTxtActive: { color: colors.orange },

  searchWrap: { padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInput:{ backgroundColor: colors.surface2, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 16 },

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
  landscapeEditorPanel: { flex: 1, backgroundColor: colors.bg, borderLeftWidth: 1, borderLeftColor: colors.border },
  landscapeHeader: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  landscapeHeaderTxt: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text },

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
  unitToggleRow: { paddingHorizontal: 12, paddingBottom: 10 },
  unitToggleTxt: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  varRow:     { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  priceRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  currencyTxt:{ fontFamily: fonts.familySemibold, fontSize: 16, color: colors.muted },
  marginBadge:{ paddingVertical: 3, paddingHorizontal: 7, borderRadius: 8 },
  marginTxt:  { fontFamily: fonts.familySemibold, fontSize: 11 },

  techToggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface2 },
  techToggleTxt: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, flex: 1 },
  chevron:    { fontSize: 16, color: colors.muted, transform: [{ rotate: '90deg' }] },
  chevronOpen:{ transform: [{ rotate: '-90deg' }] },
  deductQuestion: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: colors.border },
  deductQuestionTxt: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, flex: 1 },

  techBody:   { padding: 12, borderTopWidth: 1, borderTopColor: colors.border },
  ingRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  ingListHint: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, lineHeight: 16, marginBottom: 10 },
  modeSwitchRow: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 10, padding: 3, marginBottom: 10 },
  modeSwitchBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  modeSwitchBtnActive: { backgroundColor: colors.orange },
  modeSwitchTxt: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textAlign: 'center' },
  modeSwitchTxtActive: { color: '#fff' },
  ingCard:    { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 8 },
  ingCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  ingFieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  ingFieldLabel: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
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
  ingPickerName: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  ingPickerStockQty: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  ingPickerRowLow: { backgroundColor: 'rgba(217,95,95,0.08)' },
  ingPickerNameLow: { color: colors.red },
  ingPickerUnit: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, backgroundColor: colors.surface2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  ingPickerEmpty:{ fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', padding: 32 },
  ingPickerCreateRow: { paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: 'rgba(240,160,80,0.06)' },
  inlineCreateCard: { padding: 16, backgroundColor: colors.surface2, margin: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  ingPickerCreateTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },

  orderModalBox:   { width: '45%', maxHeight: '70%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 24 },
  orderModalTitle: { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 4 },
  orderModalHint:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginBottom: 16 },
  modalCloseBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  modalCloseTxt: { fontSize: 14, color: colors.muted, fontFamily: fonts.familySemibold },
  orderRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  orderRowActive: { backgroundColor: 'rgba(240,160,80,0.08)', borderRadius: 10, paddingHorizontal: 8 },
  orderRowTxt:{ fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, flex: 1 },
  orderRowChevron: { fontSize: 18, color: colors.muted, marginLeft: 4 },
  orderBtn:  { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  orderBtnTxt:{ fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },

  newCatRow:   { flexDirection: 'row', gap: 8, marginTop: 14 },
  newCatInput: { flex: 1, paddingVertical: 11, paddingHorizontal: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 14 },
  newCatBtn:   { width: 44, borderRadius: 12, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  newCatBtnTxt:{ fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: '#fff' },
  catCountTxt: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },

  catBackTxt:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },
  catAddProductTxt: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.orange },
  catProductRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  catProductTxt: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.text },
  catDeleteBtn: { marginTop: 16, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(160,16,32,0.35)', backgroundColor: 'rgba(160,16,32,0.06)', alignItems: 'center' },
  catDeleteTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.redLight },

  cancelBtn: { paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  modalBoxSm: { width: '40%', minWidth: 320, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 24 },

  groupModalBox: { width: '55%', maxHeight: '85%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  modalHeader:   { flexDirection: 'row', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface2 },
  modalTitle:    { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text, flex: 1 },
  closeBtn:      { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  closeTxt:      { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted },
});
