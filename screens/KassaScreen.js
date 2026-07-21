import React, { useState, useEffect, useCallback } from 'react';
import SwipeableRow from '../components/SwipeableRow';
import { useToast } from '../components/Toast';
import { useFocusEffect } from '@react-navigation/native';
import { getHomeRoute, getCurrentLocationId } from '../db/session';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  FlatList, Modal, ActivityIndicator, TextInput, Alert,
} from 'react-native';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getAllProducts, getAllClients, getCategories, getProductVariants, getProductAxesWithValues, getProductModifierGroups, getDiscounts, getPayMethods, getAllVariantsWithSku, getZones, getOrderTemplates, saveOrderTemplate, deleteOrderTemplate, applyPendingPriceSchedules, createOrder, getOpenShift, addClientVisit, getBusinessProfile, getTerms, getLoyaltyConfig, spendPoints } from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

const CAT_ICONS = { 'Кофе': '☕', 'Лимонады': '🍹', 'Допы': '🍬', 'Прочее': '🫙' };

export default function KassaScreen({ navigation, route }) {
  const loading2 = false; // placeholder
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [activeCat, setActiveCat] = useState(null);
  // appliedDiscount теперь в слоте
  const [modalItem, setModalItem] = useState(null);
  const [modalVariants, setModalVariants] = useState([]);
  const [modalGroups, setModalGroups] = useState([]);
  const [modalAxes, setModalAxes] = useState([]); // [{id, name, values:[{id,label}]}]
  const [selVariantId, setSelVariantId] = useState(null);
  const [selAxisValues, setSelAxisValues] = useState({}); // {axisId: valueId} при выборе по осям
  const [selModifiers, setSelModifiers] = useState({}); // { [groupId]: optionId | optionId[] }
  const [currentShift, setCurrentShift] = useState(null);
  const [shiftsEnabled, setShiftsEnabled] = useState(true);
  const [terms, setTerms] = useState({ item: 'Товар', client: 'Клиент', order: 'Заказ', category: 'Категория' });
  const [loyaltyModel, setLoyaltyModel] = useState('points');
  const [loyaltyConfig, setLoyaltyConfig] = useState({});
  const [payMethods, setPayMethods] = useState([]);
  // Поиск
  const [searchQuery, setSearchQuery] = useState('');
  const [skuMap, setSkuMap] = useState({});       // {sku_lower: product_id}
  // ── Парковка заказов (слоты) ────────────────────────────────────────────────
  // Каждый слот = один активный чек со своим состоянием
  const [slots, setSlots] = useState([
    { id: 1, order: [], orderNote: '', appliedDiscount: null, pointsToSpend: '', zone: null, forClient: route?.params?.forClient || null }
  ]);
  const [activeSlotId, setActiveSlotId] = useState(1);
  const [nextSlotId, setNextSlotId] = useState(2);

  // Зоны и шаблоны
  const [zones, setZones]               = useState([]);
  const [zonesEnabled, setZonesEnabled] = useState(false);
  const [templates, setTemplates]       = useState([]);
  const [templatesEnabled, setTemplatesEnabled] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateNameInput, setTemplateNameInput] = useState('');
  const [templatesListOpen, setTemplatesListOpen] = useState(false);

  // Заметка к заказу
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  // Редактирование позиции корзины
  const [editingCartItemId, setEditingCartItemId] = useState(null);
  // Развёрнутая позиция (модификаторы)
  const [expandedCartId, setExpandedCartId] = useState(null);
  // Заметка к позиции корзины
  const [itemNoteModal, setItemNoteModal] = useState(null); // {id, note}
  const [prePayOpen, setPrePayOpen]       = useState(false);
  const [discountDropOpen, setDiscountDropOpen] = useState(false);
  const [clientSearch, setClientSearch]   = useState('');
  const [clientsList, setClientsList]     = useState([]);

  // ── Хелперы активного слота ─────────────────────────────────────────────────
  const activeSlot = slots.find(s => s.id === activeSlotId) || slots[0];
  const order          = activeSlot.order;
  const orderNote      = activeSlot.orderNote;
  const appliedDiscount = activeSlot.appliedDiscount;
  const pointsToSpend  = activeSlot.pointsToSpend;
  const activeZone     = activeSlot.zone;
  const activeTable    = activeSlot.table || null;
  const forClient      = activeSlot.forClient;

  const updateSlot = (updates) =>
    setSlots(prev => prev.map(s => s.id === activeSlotId ? { ...s, ...updates } : s));

  const setOrder          = (fn) => setSlots(prev => prev.map(s =>
    s.id !== activeSlotId ? s : { ...s, order: typeof fn === 'function' ? fn(s.order) : fn }));
  const setOrderNote      = (v) => updateSlot({ orderNote: v });
  const setAppliedDiscount = (v) => updateSlot({ appliedDiscount: v });
  const setPointsToSpend  = (v) => updateSlot({ pointsToSpend: v });
  const setActiveZone     = (v) => updateSlot({ zone: v, table: null }); // при смене зоны сбрасываем стол
  const setActiveTable    = (v) => updateSlot({ table: v });

  // Парковать текущий чек и открыть новый
  const parkAndNew = () => {
    const newId = nextSlotId;
    setNextSlotId(newId + 1);
    setSlots(prev => [...prev, { id: newId, order: [], orderNote: '', appliedDiscount: null, pointsToSpend: '', zone: null, forClient: null }]);
    setActiveSlotId(newId);
    setExpandedCartId(null);
  };

  // Закрыть слот после оплаты или вручную
  const closeSlot = (id) => {
    setSlots(prev => {
      const remaining = prev.filter(s => s.id !== id);
      if (remaining.length === 0) return [{ id: 1, order: [], orderNote: '', appliedDiscount: null, pointsToSpend: '', zone: null, forClient: null }];
      return remaining;
    });
    setActiveSlotId(prev => {
      const remaining = slots.filter(s => s.id !== id);
      if (remaining.length === 0) return 1;
      return remaining[remaining.length - 1].id;
    });
  }; // для оплаты баллами

  // Модалка оплаты
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payMethod, setPayMethod] = useState('Наличные'); // Наличные | Карта | QR | Смешанная
  const [mixedCash, setMixedCash] = useState('');
  const [mixedCard, setMixedCard] = useState('');

  // Модалка скидки
  const [discountModalOpen, setDiscountModalOpen] = useState(false);

  useEffect(() => { loadData(); }, []);

  // Перезагружаем настройки при каждом возврате на экран
  // (зоны, шаблоны, модули могли измениться в Настройках)
  useFocusEffect(useCallback(() => {
    try {
      const profile = getBusinessProfile();
      const zonesOn = profile?.modules?.zones === true;
      const templatesOn = profile?.modules?.templates === true;
      setZonesEnabled(zonesOn);
      setTemplatesEnabled(templatesOn);
      if (zonesOn) setZones(getZones());
      if (templatesOn) setTemplates(getOrderTemplates());
      setPayMethods(getPayMethods().filter(m => m.active !== false));
    } catch (e) { console.error(e); }
  }, []));

  const loadData = () => {
    try {
      try { applyPendingPriceSchedules(); } catch (_) {}
      try { setClientsList(getAllClients()); } catch (_) {}
      const products = getAllProducts();
      const cats = getCategories();
      const shift = getOpenShift();
      const disc = getDiscounts();
      const profile = getBusinessProfile();

      setShiftsEnabled(profile?.modules?.shifts !== false);
      setTerms(getTerms());
      const lc = getLoyaltyConfig();
      setLoyaltyModel(lc.model);
      setLoyaltyConfig(lc.config);
      // Строим SKU-карту для поиска по артикулу
      const skuEntries = getAllVariantsWithSku();
      const map = {};
      for (const e of skuEntries) { if (e.sku) map[e.sku.toLowerCase()] = e.product_id; }
      setSkuMap(map);
      setAllProducts(products);
      setGroups(cats);
      setActiveCat(cats[0] || null);
      setDiscounts(disc);
      setCurrentShift(shift);
    } catch (e) { console.error('[KassaScreen] loadData error:', e); }
    setLoading(false);
  };

  // Фильтр товаров по поиску (имя + SKU)
  const filteredProducts = (() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allProducts.filter(p => p.category === activeCat);
    const skuMatches = new Set(
      Object.entries(skuMap)
        .filter(([sku]) => sku.includes(q))
        .map(([, pid]) => pid)
    );
    return allProducts.filter(p =>
      p.name.toLowerCase().includes(q) || skuMatches.has(p.id)
    );
  })();

  // Счётчик: сколько раз товар есть в корзине (учитывая quantity)
  const cartQtyByProduct = order.reduce((acc, item) => {
    acc[item.product_id] = (acc[item.product_id] || 0) + (item.quantity || 1);
    return acc;
  }, {});

  // Показывает цену "от", учитывая либо варианты, либо простую цену без вариантов
  const displayPrice = (product) => {
    const variants = getProductVariants(product.id);
    if (variants.length > 0) {
      const min = Math.min(...variants.map(v => v.price));
      return { price: min, hasRange: variants.length > 1 };
    }
    return { price: product.price || 0, hasRange: false };
  };

  // Находит вариант, у которого axisValues совпадает с выбором по осям
  const findVariantByAxes = (variants, axisSelection) => {
    const keys = Object.keys(axisSelection);
    if (keys.length === 0) return variants[0] || null;
    return variants.find(v => {
      const av = v.axisValues || {};
      return keys.every(axisId => String(av[axisId]) === String(axisSelection[axisId]));
    }) || null;
  };

  // Открывает модалку варианта/модификаторов для добавления или редактирования
  const openModal = (product, preselectedVariantId = null, preselectedMods = null) => {
    const variants = getProductVariants(product.id).filter(v => v.active);
    const groups = getProductModifierGroups(product.id);
    const axes = getProductAxesWithValues(product.id);
    if (variants.length <= 1 && groups.length === 0 && !preselectedVariantId) {
      addDirectToOrder(product, variants[0] || null);
      return;
    }
    setModalItem(product);
    setModalVariants(variants);
    setModalGroups(groups);
    setModalAxes(axes);
    if (axes.length > 0) {
      const targetVariant = preselectedVariantId
        ? variants.find(v => v.id === preselectedVariantId)
        : null;
      const initSel = targetVariant?.axisValues || {};
      if (!targetVariant) axes.forEach(a => { if (a.values.length > 0) initSel[a.id] = a.values[0].id; });
      setSelAxisValues(initSel);
      setSelVariantId(findVariantByAxes(variants, initSel)?.id || null);
    } else {
      setSelAxisValues({});
      setSelVariantId(preselectedVariantId || variants[0]?.id || null);
    }
    const initialMods = {};
    groups.forEach(g => {
      if (preselectedMods) {
        initialMods[g.id] = preselectedMods[g.id] ?? (g.selection_type === 'multiple' ? [] : null);
      } else {
        initialMods[g.id] = g.selection_type === 'multiple' ? [] : null;
      }
    });
    setSelModifiers(initialMods);
  };

  // Объединяет дубли (одинаковый товар + вариант + модификаторы) вместо новой строки
  const addToCart = (newItem) => {
    setOrder(prev => {
      const dupIdx = prev.findIndex(it =>
        it.product_id === newItem.product_id &&
        it.variant_id === newItem.variant_id &&
        JSON.stringify(it.modifiers) === JSON.stringify(newItem.modifiers)
      );
      if (dupIdx !== -1) {
        return prev.map((it, i) => i === dupIdx ? { ...it, quantity: (it.quantity || 1) + 1 } : it);
      }
      return [...prev, { ...newItem, id: Date.now() + Math.random(), quantity: 1 }];
    });
  };

  // + в корзине — новая строка с тем же товаром (для выбора другого размера)
  const duplicateCartItem = (item) => {
    setOrder(prev => [...prev, { ...item, id: Date.now() + Math.random(), quantity: 1, note: '' }]);
  };

  // Изменяет количество позиции в корзине (удаляет если <= 0)
  const setItemQty = (id, qty) => {
    if (qty <= 0) {
      setOrder(prev => prev.filter(i => i.id !== id));
      if (expandedCartId === id) setExpandedCartId(null);
    } else {
      setOrder(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
    }
  };

  // Открывает модалку для редактирования позиции уже в корзине
  const editCartItemMods = (item) => {
    const product = allProducts.find(p => p.id === item.product_id);
    if (!product) return;

    const variants = getProductVariants(product.id).filter(v => v.active);
    const groups   = getProductModifierGroups(product.id);
    const axes     = getProductAxesWithValues(product.id);

    // Если нечего редактировать — тихо выходим (кнопка не должна была появиться)
    if (variants.length <= 1 && groups.length === 0 && axes.length === 0) return;

    // Предзаполняем выбранные модификаторы из сохранённых в позиции корзины
    const preselectedMods = {};
    groups.forEach(g => {
      const existing = (item.modifiers || []).filter(m => m.groupId === g.id);
      preselectedMods[g.id] = g.selection_type === 'multiple'
        ? existing.map(m => m.optionId)
        : existing[0]?.optionId ?? null;
    });

    // Напрямую устанавливаем состояние модалки, минуя проверки openModal
    setModalItem(product);
    setModalVariants(variants);
    setModalGroups(groups);
    setModalAxes(axes);
    setEditingCartItemId(item.id);

    if (axes.length > 0) {
      const currentVariant = variants.find(v => v.id === item.variant_id);
      const initSel = currentVariant?.axisValues ? { ...currentVariant.axisValues } : {};
      if (!currentVariant) axes.forEach(a => { if (a.values.length > 0) initSel[a.id] = a.values[0].id; });
      setSelAxisValues(initSel);
      setSelVariantId(findVariantByAxes(variants, initSel)?.id || null);
    } else {
      setSelAxisValues({});
      setSelVariantId(item.variant_id || variants[0]?.id || null);
    }

    setSelModifiers(preselectedMods);
  };
  const closeModal = () => setModalItem(null);

  const buildSelectedModifiers = (groups, selMods) => {
    const result = [];
    for (const g of groups) {
      const sel = selMods[g.id];
      const selectedIds = g.selection_type === 'multiple' ? (sel || []) : (sel ? [sel] : []);
      for (const optId of selectedIds) {
        const opt = g.options.find(o => o.id === optId);
        if (!opt) continue;
        result.push({
          groupName: g.name, optionName: opt.name, priceDelta: opt.price_delta || 0,
          ingrToReplace: opt.ingr_to_replace || '', ingrToDeduct: opt.ingr_to_deduct || '',
          deductAmount: opt.deduct_amount || 0, deductUnit: opt.deduct_unit || '',
        });
      }
    }
    return result;
  };

  const modalPrice = () => {
    if (!modalItem) return 0;
    let base;
    if (modalAxes.length > 0) {
      const matched = findVariantByAxes(modalVariants, selAxisValues);
      base = matched ? matched.price : 0;
    } else {
      const variant = modalVariants.find(v => v.id === selVariantId);
      base = variant ? variant.price : (modalItem.price || 0);
    }
    const mods = buildSelectedModifiers(modalGroups, selModifiers);
    return base + mods.reduce((s, m) => s + m.priceDelta, 0);
  };

  const toggleModifierOption = (group, optionId) => {
    setSelModifiers(prev => {
      if (group.selection_type === 'multiple') {
        const current = prev[group.id] || [];
        const next = current.includes(optionId) ? current.filter(id => id !== optionId) : [...current, optionId];
        return { ...prev, [group.id]: next };
      }
      return { ...prev, [group.id]: prev[group.id] === optionId ? null : optionId };
    });
  };

  const addDirectToOrder = (product, variant) => {
    addToCart({
      id: Date.now() + Math.random(),
      product_id: product.id,
      variant_id: variant?.id || null,
      name: product.name,
      size: variant?.label || '',
      price: variant ? variant.price : (product.price || 0),
      modifiers: [],
    });
  };

  const confirmAdd = () => {
    if (!modalItem) return;
    let variant;
    if (modalAxes.length > 0) {
      variant = findVariantByAxes(modalVariants, selAxisValues);
      if (!variant) return;
    } else {
      variant = modalVariants.find(v => v.id === selVariantId);
    }
    const mods = buildSelectedModifiers(modalGroups, selModifiers);
    const unitPrice = modalPrice();

    if (editingCartItemId) {
      setOrder(prev => prev.map(item =>
        item.id === editingCartItemId
          ? { ...item, variant_id: variant?.id || null, size: variant?.label || '', price: unitPrice, modifiers: mods }
          : item
      ));
      setEditingCartItemId(null);
    } else {
      addToCart({
        id: Date.now() + Math.random(),
        product_id: modalItem.id,
        variant_id: variant?.id || null,
        name: modalItem.name,
        size: variant?.label || '',
        price: unitPrice,
        modifiers: mods,
      });
    }
    closeModal();
  };

  const removeFromOrder = (id) => {
    setOrder(prev => prev.filter(i => i.id !== id));
    if (expandedCartId === id) setExpandedCartId(null);
  };

  const rawTotal = order.reduce((s, i) => s + i.price * (i.quantity || 1), 0);
  const maxDiscountPct = loyaltyConfig.max_discount_pct ?? 100;

  // Личная скидка клиента имеет приоритет над глобальной моделью discount
  const effectiveDiscount = (() => {
    if (forClient?.discount_pct > 0) {
      const pct = Math.min(forClient.discount_pct, maxDiscountPct);
      return { name: `Личная скидка ${pct}%`, pct };
    }
    if (loyaltyModel === 'discount' && forClient && loyaltyConfig.pct) {
      const pct = Math.min(loyaltyConfig.pct, maxDiscountPct);
      return { name: `Скидка клиента ${pct}%`, pct };
    }
    if (appliedDiscount) {
      const pct = Math.min(appliedDiscount.pct, maxDiscountPct);
      return { ...appliedDiscount, pct };
    }
    return null;
  })();

  const discountAmount = effectiveDiscount ? Math.round(rawTotal * effectiveDiscount.pct / 100) : 0;

  // Оплата баллами с ограничением max_spend_pct
  const maxSpendRub = loyaltyModel === 'points' && loyaltyConfig.allow_spend
    ? Math.round(rawTotal * (loyaltyConfig.max_spend_pct ?? 100) / 100)
    : 0;
  const pointsDiscount = loyaltyModel === 'points' && loyaltyConfig.allow_spend
    ? Math.min(
        Math.round((parseFloat(pointsToSpend) || 0) * (loyaltyConfig.point_value || 1)),
        maxSpendRub,
        Math.max(0, rawTotal - discountAmount) // нельзя уйти ниже нуля с учётом уже применённой скидки
      )
    : 0;

  const total = Math.max(0, rawTotal - discountAmount - pointsDiscount);

  // ─── Оплата ──────────────────────────────────────────────────────────────

  const [noShiftWarning, setNoShiftWarning] = useState(false);

  const openPrePay = () => {
    if (order.length === 0) return;
    setClientSearch('');
    setPrePayOpen(true);
  };

  const openPayModal = () => {
    if (order.length === 0) return;
    if (shiftsEnabled && !currentShift) {
      setNoShiftWarning(true);
      return;
    }
    const firstMethod = payMethods.find(m => m.active !== false) || payMethods[0];
    setPayMethod(firstMethod?.name || 'Наличные');
    setMixedCash('');
    setMixedCard('');
    setPayModalOpen(true);
  };
  const closePayModal = () => setPayModalOpen(false);

  const handleMixedCashChange = (v) => {
    setMixedCash(v);
    const cashNum = parseFloat(v) || 0;
    const rest = Math.max(0, total - cashNum);
    setMixedCard(rest > 0 ? String(rest) : '');
  };
  const handleMixedCardChange = (v) => {
    setMixedCard(v);
    const cardNum = parseFloat(v) || 0;
    const rest = Math.max(0, total - cardNum);
    setMixedCash(rest > 0 ? String(rest) : '');
  };

  const confirmPay = () => {
    if (order.length === 0) return;
    const selectedMethod = payMethods.find(m => m.name === payMethod) || { type: 'card' };
    const isMixed = selectedMethod.type === 'mixed';
    const isCash  = selectedMethod.type === 'cash';
    let cashAmount = 0, cardAmount = 0;
    if (isMixed) {
      cashAmount = parseFloat(mixedCash) || 0;
      cardAmount = parseFloat(mixedCard) || 0;
    } else if (isCash) {
      cashAmount = total;
    } else {
      cardAmount = total;
    }
    try {
      const { stockWarnings } = createOrder({
        total, method: payMethod, methodType: selectedMethod.type,
        shift_id: currentShift?.id || null,
        client_id: forClient?.id || null,
        items: order,
        cashAmount, cardAmount,
        discountPct: effectiveDiscount?.pct || 0,
        locationId: getCurrentLocationId(),
        note: orderNote,
        zone: activeZone ? (activeTable ? `${activeZone.name} · ${activeTable.name}` : activeZone.name) : '',
      });
      if (forClient?.id) {
        if (loyaltyModel === 'points' && loyaltyConfig.allow_spend && pointsToSpend) {
          const pts = parseFloat(pointsToSpend) || 0;
          if (pts > 0) spendPoints(forClient.id, pts);
        }
        addClientVisit(forClient.id, rawTotal);
      }
      setExpandedCartId(null);
      setPayModalOpen(false);
      closeSlot(activeSlotId);
      toast.show(`Оплата ${total} ₽ принята ✓`);
      if (stockWarnings && stockWarnings.length > 0) {
        const lines = stockWarnings.map(w => `${w.name}: ${w.amount.toFixed(1)} ${w.unit || ''}`).join('\n');
        Alert.alert('⚠️ Склад ушёл в минус', lines);
      }
    } catch (e) { console.error('[KassaScreen] createOrder error:', e); }
  };

  if (loading) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={colors.greenLight} /></View>;
  }

  if (allProducts.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Касса" onBack={() => navigation.navigate(getHomeRoute())} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <Text style={styles.emptyTitle}>Меню пустое</Text>
          <Text style={styles.emptyHint}>Импортируйте данные из Google Sheets через Admin → Импорт</Text>
          <MetalButton title="← Назад" variant="back" onPress={() => navigation.navigate(getHomeRoute())} />
        </View>
        <BottomBar navigation={navigation} activeTab="Kassa" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Касса" onBack={() => navigation.navigate(getHomeRoute())} />

      {forClient && (
        <View style={styles.clientBadgeWrap}>
          <View style={styles.clientBadge}>
            <View style={styles.clientAvatar}>
              <Text style={styles.clientAvatarText}>{(forClient.fio || '?').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.clientBadgeName}>{forClient.fio}</Text>
              {loyaltyModel === 'points' && (
                <Text style={styles.clientBadgeSub}>
                  ★ {forClient.balance || 0} баллов · +{Math.round(rawTotal * (loyaltyConfig.earn_pct || 10) / 100)} за этот заказ
                </Text>
              )}
              {loyaltyModel === 'subscription' && (
                <Text style={[styles.clientBadgeSub, (forClient.balance || 0) <= 0 && { color: colors.redLight }]}>
                  🎟 {forClient.balance || 0} посещений осталось
                </Text>
              )}
              {loyaltyModel === 'discount' && (
                <Text style={styles.clientBadgeSub}>🏷 Скидка {loyaltyConfig.pct || 0}% применена</Text>
              )}
            </View>
          </View>
        </View>
      )}

      <View style={styles.layout}>
        <View style={styles.left}>
          {/* Строка поиска */}
          <View style={styles.searchWrap}>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={v => { setSearchQuery(v); if (v) setActiveCat(groups[0]); }}
              placeholder="🔍 Поиск по названию или артикулу..."
              placeholderTextColor={colors.muted}
              clearButtonMode="while-editing"
            />
          </View>
          {!searchQuery && (
            <FlatList
              horizontal data={groups} keyExtractor={(g) => g} showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catList}
              renderItem={({ item: group }) => (
                <Pressable style={[styles.catBtn, activeCat === group && styles.catBtnActive]} onPress={() => setActiveCat(group)}>
                  <Text style={styles.catIcon}>{CAT_ICONS[group] || '🫙'}</Text>
                  <Text style={[styles.catLabel, activeCat === group && styles.catLabelActive]}>{group}</Text>
                </Pressable>
              )}
            />
          )}
          <ScrollView contentContainerStyle={styles.menuGrid}>
            {filteredProducts.map((item) => {
              const { price, hasRange } = displayPrice(item);
              const cartQty = cartQtyByProduct[item.id] || 0;
              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.menuItem,
                    pressed && { transform: [{ scale: 0.97 }], opacity: 0.85 },
                    cartQty > 0 && styles.menuItemInCart,
                  ]}
                  onPress={() => openModal(item)}
                >
                  {cartQty > 0 && (
                    <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{cartQty}</Text></View>
                  )}
                  <Text style={styles.menuItemName}>{item.name}</Text>
                  {price > 0
                    ? <Text style={styles.menuItemPrice}>{hasRange ? `от ${price}` : `${price}`} ₽</Text>
                    : <Text style={styles.menuItemPriceNone}>цена не назначена</Text>
                  }
                </Pressable>
              );
            })}
            {filteredProducts.length === 0 && (
              <Text style={styles.emptyOrder}>Ничего не найдено</Text>
            )}
          </ScrollView>
        </View>

        <View style={styles.orderPanel}>
          {/* Вкладки парковки — показываются когда есть 2+ слота */}
          {slots.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.slotBar} contentContainerStyle={styles.slotBarInner}>
              {slots.map((s, i) => {
                const qty = s.order.reduce((sum, it) => sum + (it.quantity || 1), 0);
                const isActive = s.id === activeSlotId;
                return (
                  <Pressable key={s.id} style={[styles.slotTab, isActive && styles.slotTabActive]} onPress={() => { setActiveSlotId(s.id); setExpandedCartId(null); }}>
                    <Text style={[styles.slotTabText, isActive && styles.slotTabTextActive]}>
                      {s.zone ? (s.table ? `${s.zone.name}·${s.table.name}` : s.zone.name) : `№${i + 1}`}{qty > 0 ? ` (${qty})` : ''}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable style={styles.slotTabNew} onPress={parkAndNew}>
                <Text style={styles.slotTabNewText}>+ Чек</Text>
              </Pressable>
            </ScrollView>
          )}

          {/* Выбор зоны */}
          {zonesEnabled && zones.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.zoneBar} contentContainerStyle={styles.zoneBarInner}>
              <Pressable style={[styles.zoneChip, !activeZone && styles.zoneChipActive]} onPress={() => setActiveZone(null)}>
                <Text style={[styles.zoneChipText, !activeZone && styles.zoneChipTextActive]}>Без зоны</Text>
              </Pressable>
              {zones.map(z => (
                <Pressable key={z.id} style={[styles.zoneChip, activeZone?.id === z.id && styles.zoneChipActive]} onPress={() => setActiveZone(z)}>
                  <Text style={[styles.zoneChipText, activeZone?.id === z.id && styles.zoneChipTextActive]}>
                    📍 {z.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* Выбор стола — показывается если у зоны есть столы */}
          {zonesEnabled && activeZone?.tables?.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.zoneBar} contentContainerStyle={styles.zoneBarInner}>
              <Pressable style={[styles.zoneChip, !activeTable && styles.zoneChipActive]} onPress={() => setActiveTable(null)}>
                <Text style={[styles.zoneChipText, !activeTable && styles.zoneChipTextActive]}>Без стола</Text>
              </Pressable>
              {activeZone.tables.map(t => (
                <Pressable key={t.id} style={[styles.zoneChip, activeTable?.id === t.id && styles.zoneChipActive]} onPress={() => setActiveTable(t)}>
                  <Text style={[styles.zoneChipText, activeTable?.id === t.id && styles.zoneChipTextActive]}>
                    {t.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View style={styles.orderHeader}>
            <View>
              <Text style={styles.orderHeaderTitle}>
                {terms.order}
              </Text>
              <Text style={styles.orderHeaderCount}>
                {order.reduce((s,i)=>s+(i.quantity||1),0)} позиций
              </Text>
            </View>
            <View style={styles.orderHeaderBtns}>
              {templatesEnabled && (
                <Pressable onPress={() => setTemplatesListOpen(true)} hitSlop={8} style={styles.orderHeaderBtn}>
                  <Text style={styles.orderHeaderBtnIcon}>⚡</Text>
                  <Text style={styles.orderHeaderBtnLabel}>Шаблон</Text>
                </Pressable>
              )}
              <Pressable onPress={() => setNoteModalOpen(true)} hitSlop={8} style={[styles.orderHeaderBtn, orderNote && styles.orderHeaderBtnActive]}>
                <Text style={styles.orderHeaderBtnIcon}>📝</Text>
                <Text style={[styles.orderHeaderBtnLabel, orderNote && { color: colors.greenLight }]}>Заметка</Text>
              </Pressable>
              {slots.length === 1 && (
                <Pressable onPress={parkAndNew} hitSlop={8} style={styles.orderHeaderBtn}>
                  <Text style={styles.orderHeaderBtnIcon}>⏸</Text>
                  <Text style={styles.orderHeaderBtnLabel}>Парковать</Text>
                </Pressable>
              )}
              {order.length > 0 && (
                <Pressable onPress={() => { setOrder([]); setExpandedCartId(null); }} hitSlop={8} style={[styles.orderHeaderBtn, styles.orderHeaderBtnDanger]}>
                  <Text style={styles.orderHeaderBtnIcon}>🗑</Text>
                  <Text style={[styles.orderHeaderBtnLabel, { color: colors.redLight }]}>Очистить</Text>
                </Pressable>
              )}
            </View>
          </View>
          {orderNote ? <Text style={styles.orderNotePreview}>📝 {orderNote}</Text> : null}
          <ScrollView style={{ flex: 1 }}>
            {order.map((item) => {
              const isExpanded = expandedCartId === item.id;
              const hasMods = (item.modifiers || []).length > 0;
              return (
                <SwipeableRow key={item.id} onAction={() => removeFromOrder(item.id)} label="Удалить">
                {/* Вся строка реагирует на долгий тап — открывает заметку */}
                <View style={styles.orderItem}>
                  {/* Тап на верхнюю часть → редактировать (выбор размера/мод), долгий тап → заметка */}
                  <Pressable
                    style={styles.orderItemMain}
                    onPress={() => editCartItemMods(item)}
                    onLongPress={() => setItemNoteModal({ id: item.id, note: item.note || '' })}
                    delayLongPress={280}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderItemName}>
                        {item.name}{item.size ? ` · ${item.size}` : ''}
                      </Text>
                      {(item.modifiers || []).length > 0 && (item.modifiers || []).map((m, mi) => (
                        <Text key={mi} style={styles.orderItemMod}>· {m.optionName}{m.priceDelta > 0 ? ` +${m.priceDelta}₽` : ''}</Text>
                      ))}
                      {item.note
                        ? <Text style={styles.cartItemNote}>💬 {item.note}</Text>
                        : <Text style={styles.cartItemNoteHint}>удержите для заметки</Text>
                      }
                    </View>
                    <Text style={styles.orderItemPrice}>{(item.price * (item.quantity || 1)).toFixed(0)} ₽</Text>
                  </Pressable>
                  {/* −qty+ | + новая строка */}
                  <View style={styles.orderItemControls}>
                    <Pressable style={styles.qtyBtn} onPress={() => setItemQty(item.id, (item.quantity || 1) - 1)} hitSlop={8}>
                      <Text style={styles.qtyBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.qtyVal}>{item.quantity || 1}</Text>
                    <Pressable style={styles.qtyBtn} onPress={() => duplicateCartItem(item)} hitSlop={8}>
                      <Text style={styles.qtyBtnText}>+</Text>
                    </Pressable>
                  </View>
                  </View>
                </SwipeableRow>
              );
            })}
            {order.length === 0 && <Text style={styles.emptyOrder}>Корзина пуста</Text>}
          </ScrollView>

          <View style={styles.orderFooter}>
            {/* Краткая строка скидки если уже выбрана */}
            {(effectiveDiscount || forClient || (pointsDiscount > 0)) && (
              <View style={styles.footerSummary}>
                {forClient && (
                  <Text style={styles.footerSummaryLine}>👤 {forClient.fio}</Text>
                )}
                {effectiveDiscount && (
                  <Text style={styles.footerSummaryLine}>🏷 {effectiveDiscount.name} −{effectiveDiscount.pct}%</Text>
                )}
                {pointsDiscount > 0 && (
                  <Text style={styles.footerSummaryLine}>★ Баллы −{pointsDiscount} ₽</Text>
                )}
              </View>
            )}

            {/* Итого */}
            <View style={styles.footerTotalRow}>
              {(discountAmount > 0 || pointsDiscount > 0) && (
                <Text style={styles.footerRawTotal}>{rawTotal} ₽</Text>
              )}
              <Text style={styles.footerTotal}>{total} ₽</Text>
            </View>

            {/* Одна кнопка Оплатить */}
            <Pressable
              style={({ pressed }) => [
                styles.payBtn,
                order.length === 0 && styles.payBtnDisabled,
                pressed && order.length > 0 && { opacity: 0.88 },
              ]}
              onPress={() => order.length > 0 && openPrePay()}
              disabled={order.length === 0}
            >
              <Text style={styles.payBtnIcon}>💰</Text>
              <Text style={styles.payBtnText}>Оплатить</Text>
              <Text style={styles.payBtnTotal}>{total} ₽</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <BottomBar navigation={navigation} activeTab="Kassa" />


      {/* ── Предмодалка оплаты — клиент / скидка / баллы ── */}
      <Modal visible={prePayOpen} transparent animationType="slide" onRequestClose={() => setPrePayOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setPrePayOpen(false)} />
          <View style={[styles.modalInner, { width: '52%', maxHeight: '88%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Оформление заказа</Text>
              <Pressable onPress={() => setPrePayOpen(false)} hitSlop={14}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Состав заказа */}
              <View style={styles.prePaySummary}>
                <Text style={styles.prePaySummaryTitle}>{order.length} поз. · {order.reduce((s,i)=>s+(i.quantity||1),0)} ед.</Text>
                {order.slice(0, 4).map((item, i) => (
                  <Text key={i} style={styles.prePaySummaryItem}>
                    {item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ''} — {(item.price*(item.quantity||1)).toFixed(0)} ₽
                  </Text>
                ))}
                {order.length > 4 && (
                  <Text style={styles.prePaySummaryMore}>и ещё {order.length - 4} поз.</Text>
                )}
              </View>

              {/* ── Клиент ── */}
              <Text style={styles.prePayLabel}>👤 Клиент</Text>
              {forClient ? (
                <View style={styles.prePayClientRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prePayClientName}>{forClient.fio}</Text>
                    <Text style={styles.prePayClientSub}>
                      {forClient.phone ? `${forClient.phone} · ` : ''}{loyaltyModel === 'points' ? `★ ${forClient.balance || 0} балл.` : `скидка ${forClient.discount_pct || 0}%`}
                    </Text>
                  </View>
                  <Pressable onPress={() => updateSlot({ forClient: null })} hitSlop={10} style={styles.prePayClientRemove}>
                    <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <View style={{ position: 'relative', zIndex: 100 }}>
                  <TextInput
                    style={styles.input}
                    value={clientSearch}
                    onChangeText={setClientSearch}
                    placeholder="Поиск по имени или телефону..."
                    placeholderTextColor={colors.muted}
                  />
                  {clientSearch.length > 0 && (
                    <View style={styles.clientDropdown}>
                      <ScrollView keyboardShouldPersistTaps="always" nestedScrollEnabled scrollEnabled showsVerticalScrollIndicator={false}>
                      {clientsList
                        .filter(cl =>
                          cl.fio?.toLowerCase().includes(clientSearch.toLowerCase()) ||
                          cl.phone?.includes(clientSearch)
                        )
                        .slice(0, 6)
                        .map(cl => (
                          <Pressable
                            key={cl.id}
                            style={({ pressed }) => [styles.clientDropdownItem, pressed && { backgroundColor: 'rgba(255,255,255,0.04)' }]}
                            onPress={() => {
                              updateSlot({ forClient: cl });
                              setClientSearch('');
                            }}
                          >
                            <Text style={styles.clientDropdownName}>{cl.fio}</Text>
                            <Text style={styles.clientDropdownSub}>
                              {cl.phone || ''}{cl.phone && '  '}
                              {loyaltyModel === 'points' ? `★ ${cl.balance || 0}` : `${cl.discount_pct || 0}%`}
                            </Text>
                          </Pressable>
                        ))
                      }
                      {clientsList.filter(cl =>
                        cl.fio?.toLowerCase().includes(clientSearch.toLowerCase()) ||
                        cl.phone?.includes(clientSearch)
                      ).length === 0 && (
                        <Text style={styles.prePaySummaryMore}>Клиент не найден</Text>
                      )}
                      </ScrollView>
                    </View>
                  )}
                  </View>
                </>
              )}

              {/* ── Скидка ── */}
              {loyaltyModel !== 'discount' && (
                <>
                  <Text style={styles.prePayLabel}>🏷 Скидка</Text>
                  {effectiveDiscount ? (
                    <View style={styles.prePayClientRow}>
                      <Text style={{ flex: 1, color: colors.text, fontFamily: fonts.familySemibold, fontSize: 14 }}>
                        {effectiveDiscount.name} −{effectiveDiscount.pct}% (−{discountAmount} ₽)
                      </Text>
                      <Pressable onPress={() => setAppliedDiscount(null)} hitSlop={10} style={styles.prePayClientRemove}>
                        <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ position: 'relative', zIndex: 100 }}>
                      <Pressable
                        style={[styles.discountListRow, { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: '#07080a' }]}
                        onPress={() => setDiscountDropOpen(v => !v)}
                      >
                        <Text style={{ flex: 1, fontFamily: fonts.familySemibold, fontSize: 13, color: appliedDiscount ? colors.greenLight : colors.text }}>
                          {appliedDiscount ? `${appliedDiscount.name} −${appliedDiscount.pct}% (−${Math.round(rawTotal * appliedDiscount.pct / 100)} ₽)` : 'Без скидки'}
                        </Text>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>{discountDropOpen ? '▲' : '▼'}</Text>
                      </Pressable>
                      {discountDropOpen && (
                        <View style={styles.discountDropdown}>
                          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                            <Pressable
                              style={[styles.discountListRow, !appliedDiscount && styles.discountListRowActive]}
                              onPress={() => { setAppliedDiscount(null); setDiscountDropOpen(false); }}
                            >
                              <Text style={[styles.discountListName, !appliedDiscount && { color: colors.greenLight }]}>Без скидки</Text>
                              {!appliedDiscount ? <Text style={styles.discountListCheck}>✓</Text> : null}
                            </Pressable>
                            {discounts.map(d => {
                              const isActive = appliedDiscount?.id != null && appliedDiscount.id === d.id;
                              return (
                                <Pressable
                                  key={d.id}
                                  style={[styles.discountListRow, isActive && styles.discountListRowActive]}
                                  onPress={() => { setAppliedDiscount(d); setDiscountDropOpen(false); }}
                                >
                                  <View style={{ flex: 1 }}>
                                    <Text style={[styles.discountListName, isActive && { color: colors.greenLight }]}>{d.name}</Text>
                                    <Text style={styles.discountListSub}>−{d.pct}%  ≈ −{Math.round(rawTotal * d.pct / 100)} ₽</Text>
                                  </View>
                                  {isActive ? <Text style={styles.discountListCheck}>✓</Text> : null}
                                </Pressable>
                              );
                            })}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  )}
                </>
              )}

              {/* ── Баллы ── */}
              {loyaltyModel === 'points' && loyaltyConfig.allow_spend && forClient && (forClient.balance || 0) > 0 && (
                <>
                  <Text style={styles.prePayLabel}>★ Списать баллы</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      keyboardType="numeric"
                      value={pointsToSpend}
                      onChangeText={v => setPointsToSpend(v)}
                      placeholder={`макс ${forClient.balance}`}
                      placeholderTextColor={colors.muted}
                    />
                    <Text style={{ color: colors.muted, fontFamily: fonts.familyRegular, fontSize: 13 }}>
                      = −{pointsDiscount} ₽
                    </Text>
                  </View>
                </>
              )}

              {/* ── Итого ── */}
              <View style={styles.prePayTotalBox}>
                {(discountAmount > 0 || pointsDiscount > 0) && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={styles.prePayTotalLabel}>Скидка</Text>
                    <Text style={[styles.prePayTotalLabel, { color: colors.redLight }]}>−{discountAmount + pointsDiscount} ₽</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.prePayTotalTitle}>Итого к оплате</Text>
                  <Text style={styles.prePayTotalValue}>{total} ₽</Text>
                </View>
              </View>
            </ScrollView>

            {/* Кнопки */}
            <View style={{ gap: 8, marginTop: 16 }}>
              <Pressable
                style={({ pressed }) => [styles.payBtn, pressed && { opacity: 0.88 }]}
                onPress={() => { setPrePayOpen(false); openPayModal(); }}
              >
                <Text style={styles.payBtnIcon}>💰</Text>
                <Text style={styles.payBtnText}>К выбору способа оплаты</Text>
                <Text style={styles.payBtnTotal}>{total} ₽</Text>
              </Pressable>
              <Pressable style={styles.prePayCancelBtn} onPress={() => setPrePayOpen(false)}>
                <Text style={styles.prePayCancelText}>Вернуться к заказу</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Модалка сохранения шаблона */}
      <Modal visible={templateModalOpen} transparent animationType="fade" onRequestClose={() => setTemplateModalOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setTemplateModalOpen(false)} />
          <View style={[styles.modalInner, { width: '45%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⚡ Сохранить шаблон</Text>
              <Pressable onPress={() => setTemplateModalOpen(false)} hitSlop={12}><Text style={styles.modalCloseText}>✕</Text></Pressable>
            </View>
            <TextInput
              style={styles.input}
              value={templateNameInput}
              onChangeText={setTemplateNameInput}
              placeholder="Название шаблона (напр. Бизнес-ланч)"
              placeholderTextColor={colors.muted}
              autoFocus
            />
            <MetalButton title="Сохранить" variant="success" onPress={() => {
              if (!templateNameInput.trim()) return;
              saveOrderTemplate(templateNameInput.trim(), order);
              setTemplates(getOrderTemplates());
              setTemplateModalOpen(false);
            }} style={{ marginTop: 10 }} />
          </View>
        </View>
      </Modal>

      {/* Модалка выбора шаблона */}
      <Modal visible={templatesListOpen} transparent animationType="fade" onRequestClose={() => setTemplatesListOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setTemplatesListOpen(false)} />
          <View style={[styles.modalInner, { width: '50%', maxHeight: '70%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⚡ Шаблоны заказов</Text>
              <Pressable onPress={() => setTemplatesListOpen(false)} hitSlop={12}><Text style={styles.modalCloseText}>✕</Text></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {templates.length === 0 && <Text style={{ color: colors.muted, textAlign: 'center', paddingVertical: 20 }}>Шаблонов пока нет. Оформите заказ и нажмите «Сохранить как шаблон» в корзине.</Text>}
              {templates.map(t => (
                <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Pressable style={{ flex: 1 }} onPress={() => {
                    const items = t.items.map(i => ({ ...i, id: Date.now() + Math.random() }));
                    items.forEach(item => addToCart(item));
                    setTemplatesListOpen(false);
                  }}>
                    <Text style={{ fontFamily: fonts.family, fontSize: 15, color: colors.text }}>⚡ {t.name}</Text>
                    <Text style={{ fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 }}>{t.items.length} позиций</Text>
                  </Pressable>
                  <Pressable hitSlop={10} onPress={() => { deleteOrderTemplate(t.id); setTemplates(getOrderTemplates()); }}>
                    <Text style={{ color: colors.redLight, fontSize: 15, padding: 6 }}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Модалка заметки к позиции */}
      <Modal visible={!!itemNoteModal} transparent animationType="fade" onRequestClose={() => setItemNoteModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setItemNoteModal(null)} />
          {itemNoteModal && (
            <View style={[styles.modalInner, { width: '45%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>💬 Заметка к позиции</Text>
                <Pressable onPress={() => setItemNoteModal(null)} hitSlop={12}>
                  <Text style={styles.modalCloseText}>✕</Text>
                </Pressable>
              </View>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                value={itemNoteModal.note}
                onChangeText={v => setItemNoteModal(m => ({ ...m, note: v }))}
                placeholder="Без сахара, аллергия на орехи..."
                placeholderTextColor={colors.muted}
                multiline
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                {itemNoteModal.note ? (
                  <Pressable
                    style={styles.noteModalBtnSecondary}
                    onPress={() => {
                      setOrder(prev => prev.map(it => it.id === itemNoteModal.id ? { ...it, note: '' } : it));
                      setItemNoteModal(null);
                    }}
                  >
                    <Text style={styles.noteModalBtnSecondaryText}>Удалить заметку</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={[styles.noteModalBtnPrimary, { flex: 1 }]}
                  onPress={() => {
                    setOrder(prev => prev.map(it => it.id === itemNoteModal.id ? { ...it, note: itemNoteModal.note } : it));
                    setItemNoteModal(null);
                  }}
                >
                  <Text style={styles.noteModalBtnPrimaryText}>Сохранить</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Модалка заметки к заказу */}
      <Modal visible={noteModalOpen} transparent animationType="fade" onRequestClose={() => setNoteModalOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setNoteModalOpen(false)} />
          <View style={[styles.modalInner, { width: '45%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📝 Заметка к заказу</Text>
              <Pressable onPress={() => setNoteModalOpen(false)} hitSlop={12}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, { height: 100, textAlignVertical: 'top', fontSize: 15 }]}
              value={orderNote}
              onChangeText={setOrderNote}
              placeholder="Без сахара, на вынос, стол 5..."
              placeholderTextColor={colors.muted}
              multiline
              autoFocus
            />
            <MetalButton title="Готово" variant="success" onPress={() => setNoteModalOpen(false)} style={{ marginTop: 10 }} />
            {orderNote ? (
              <MetalButton title="Очистить заметку" variant="back" onPress={() => { setOrderNote(''); setNoteModalOpen(false); }} style={{ marginTop: 6 }} />
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Модалка товара — Apple стиль */}
      <Modal visible={!!modalItem} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeModal} />
          {modalItem && (
            <View style={[styles.modalInner, { width: '46%' }]}>
              {/* Заголовок */}
              <View style={styles.itemModalHeader}>
                <Text style={styles.itemModalName}>{modalItem.name}</Text>
                <Pressable onPress={closeModal} hitSlop={14} style={styles.itemModalClose}>
                  <Text style={styles.itemModalCloseText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Варианты по осям */}
                {modalAxes.length > 0 ? modalAxes.map(axis => (
                  <View key={axis.id} style={styles.itemModalSection}>
                    <Text style={styles.itemModalSectionLabel}>{axis.name}</Text>
                    {axis.values.map(val => {
                      const isSelected = String(selAxisValues[axis.id]) === String(val.id);
                      const testSel = { ...selAxisValues, [axis.id]: val.id };
                      const testVariant = findVariantByAxes(modalVariants, testSel);
                      const unavailable = !testVariant;
                      return (
                        <Pressable
                          key={val.id}
                          style={[styles.itemModalRow, isSelected && styles.itemModalRowActive, unavailable && { opacity: 0.35 }]}
                          onPress={() => {
                            if (unavailable) return;
                            const newSel = { ...selAxisValues, [axis.id]: val.id };
                            setSelAxisValues(newSel);
                            setSelVariantId(findVariantByAxes(modalVariants, newSel)?.id || null);
                          }}
                        >
                          <Text style={[styles.itemModalRowText, isSelected && styles.itemModalRowTextActive]}>{val.label}</Text>
                          {isSelected && <Text style={styles.itemModalRowCheck}>✓</Text>}
                        </Pressable>
                      );
                    })}
                  </View>
                )) : (
                  modalVariants.length > 1 && (
                    <View style={styles.itemModalSection}>
                      <Text style={styles.itemModalSectionLabel}>Вариант</Text>
                      {modalVariants.map(v => (
                        <Pressable
                          key={v.id}
                          style={[styles.itemModalRow, selVariantId === v.id && styles.itemModalRowActive]}
                          onPress={() => setSelVariantId(v.id)}
                        >
                          <Text style={[styles.itemModalRowText, selVariantId === v.id && styles.itemModalRowTextActive]}>{v.label || '—'}</Text>
                          <Text style={[styles.itemModalRowPrice, selVariantId === v.id && { color: colors.greenLight }]}>{v.price} ₽</Text>
                          {selVariantId === v.id && <Text style={styles.itemModalRowCheck}>✓</Text>}
                        </Pressable>
                      ))}
                    </View>
                  )
                )}

                {/* Модификаторы */}
                {modalGroups.map(group => {
                  const sel = selModifiers[group.id];
                  const isSelected = (optId) => group.selection_type === 'multiple' ? (sel || []).includes(optId) : sel === optId;
                  return (
                    <View key={group.id} style={styles.itemModalSection}>
                      <Text style={styles.itemModalSectionLabel}>{group.name}</Text>
                      {group.options.map(opt => (
                        <Pressable
                          key={opt.id}
                          style={[styles.itemModalRow, isSelected(opt.id) && styles.itemModalRowActive]}
                          onPress={() => toggleModifierOption(group, opt.id)}
                        >
                          <Text style={[styles.itemModalRowText, isSelected(opt.id) && styles.itemModalRowTextActive]}>{opt.name}</Text>
                          {opt.price_delta > 0 && (
                            <Text style={[styles.itemModalRowPrice, isSelected(opt.id) && { color: colors.greenLight }]}>+{opt.price_delta} ₽</Text>
                          )}
                          {isSelected(opt.id) && <Text style={styles.itemModalRowCheck}>✓</Text>}
                        </Pressable>
                      ))}
                    </View>
                  );
                })}
              </ScrollView>

              {/* Кнопка добавить с ценой */}
              <Pressable
                style={({ pressed }) => [styles.itemModalAddBtn, pressed && { opacity: 0.88 }]}
                onPress={confirmAdd}
              >
                <Text style={styles.itemModalAddText}>Добавить в заказ</Text>
                <Text style={styles.itemModalAddPrice}>{modalPrice()} ₽</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>

      {/* Модалка скидки */}
      <Modal visible={discountModalOpen} transparent animationType="fade" onRequestClose={() => setDiscountModalOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setDiscountModalOpen(false)} />
          <View style={styles.modalInner}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Скидка на {terms.order.toLowerCase()}</Text>
              <Pressable onPress={() => setDiscountModalOpen(false)} hitSlop={12}><Text style={styles.modalCloseText}>✕</Text></Pressable>
            </View>
            {discounts.length === 0 && <Text style={styles.emptyOrder}>Скидки не настроены</Text>}
            <View style={styles.discountGrid}>
              <Pressable
                style={[styles.discountCard, !appliedDiscount && styles.discountCardActive]}
                onPress={() => { setAppliedDiscount(null); setDiscountModalOpen(false); }}
              >
                <Text style={styles.discountCardPct}>0%</Text>
                <Text style={styles.discountCardName}>Без скидки</Text>
              </Pressable>
              {discounts.map((d, i) => {
                const isActive = appliedDiscount?.name === d.name && appliedDiscount?.pct === d.pct;
                return (
                  <Pressable
                    key={i}
                    style={[styles.discountCard, isActive && styles.discountCardActive]}
                    onPress={() => { setAppliedDiscount(d); setDiscountModalOpen(false); }}
                  >
                    <Text style={[styles.discountCardPct, isActive && styles.discountCardPctActive]}>−{d.pct}%</Text>
                    <Text style={styles.discountCardName}>{d.name}</Text>
                    {isActive && <Text style={styles.discountCardCheck}>✓</Text>}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* Модалка оплаты — Apple стиль */}
      <Modal visible={payModalOpen} transparent animationType="fade" onRequestClose={closePayModal}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closePayModal} />
          <View style={[styles.modalInner, { width: '44%' }]}>
            {/* Сумма */}
            <View style={styles.payModalHeader}>
              <View>
                <Text style={styles.payModalLabel}>К оплате</Text>
                <Text style={styles.payModalTotal}>{total} ₽</Text>
              </View>
              <Pressable onPress={closePayModal} hitSlop={14} style={styles.itemModalClose}>
                <Text style={styles.itemModalCloseText}>✕</Text>
              </Pressable>
            </View>

            {/* Способы оплаты — строки */}
            <Text style={styles.payModalSectionLabel}>Способ оплаты</Text>
            <View style={styles.payMethodsList}>
              {payMethods.map(m => (
                <Pressable
                  key={m.id}
                  style={[styles.payMethodRow, payMethod === m.name && styles.payMethodRowActive]}
                  onPress={() => setPayMethod(m.name)}
                >
                  {m.icon ? <Text style={styles.payMethodIcon}>{m.icon}</Text> : null}
                  <Text style={[styles.payMethodName, payMethod === m.name && { color: colors.greenLight }]}>{m.name}</Text>
                  {payMethod === m.name && <Text style={styles.payMethodCheck}>✓</Text>}
                </Pressable>
              ))}
            </View>

            {/* Смешанная оплата */}
            {payMethods.find(m => m.name === payMethod)?.type === 'mixed' && (
              <View style={styles.mixedPayBox}>
                <View style={styles.mixedPayRow}>
                  <Text style={styles.mixedPayLabel}>Наличными</Text>
                  <TextInput
                    style={styles.mixedPayInput}
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    value={mixedCash}
                    onChangeText={handleMixedCashChange}
                  />
                  <Text style={styles.mixedPayUnit}>₽</Text>
                </View>
                <View style={styles.mixedPayRow}>
                  <Text style={styles.mixedPayLabel}>Картой</Text>
                  <TextInput
                    style={styles.mixedPayInput}
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    value={mixedCard}
                    onChangeText={handleMixedCardChange}
                  />
                  <Text style={styles.mixedPayUnit}>₽</Text>
                </View>
              </View>
            )}

            {/* Кнопка подтверждения */}
            <Pressable
              style={({ pressed }) => [styles.payConfirmBtn, pressed && { opacity: 0.88 }]}
              onPress={confirmPay}
            >
              <Text style={styles.payConfirmText}>Принять оплату · {total} ₽</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Модалка: смена не открыта */}
      <Modal visible={noShiftWarning} transparent animationType="fade" onRequestClose={() => setNoShiftWarning(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setNoShiftWarning(false)} />
          <View style={styles.modalInner}>
            <Text style={styles.warnIcon}>⚠️</Text>
            <Text style={styles.warnTitle}>Смена не открыта</Text>
            <Text style={styles.warnText}>Чтобы принять оплату, сначала откройте смену.</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <MetalButton title="Отмена" variant="back" onPress={() => setNoShiftWarning(false)} style={{ flex: 1 }} />
              <MetalButton title="📅 Открыть смену" variant="action" onPress={() => { setNoShiftWarning(false); navigation.navigate('Shift'); }} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1, flexDirection: 'row' },
  left: { flex: 1 },
  catList: { paddingHorizontal: 10, paddingVertical: 6 },
  catBtn: { height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', backgroundColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: 6 },
  catBtnActive: { borderColor: 'rgba(61,158,146,0.7)', backgroundColor: 'rgba(61,158,146,0.12)' },
  catActiveDot: { display: 'none' },
  catIcon: { fontSize: 13 },
  catLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, letterSpacing: 0.5 },
  catLabelActive: { color: colors.greenLight },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 10, alignContent: 'flex-start' },
  menuItem: { width: '30%', minWidth: 100, paddingVertical: 14, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', backgroundColor: '#0b0c0f', alignItems: 'center', position: 'relative', gap: 5 },
  menuItemInCart: { borderColor: 'rgba(61,158,146,0.5)', backgroundColor: 'rgba(61,158,146,0.07)' },
  menuItemName: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text, textAlign: 'center', letterSpacing: 0.3 },
  menuItemPrice: { fontFamily: fonts.family, fontSize: 13, fontWeight: '700', color: colors.greenLight, textAlign: 'center' },
  menuItemPriceNone: { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, textAlign: 'center', fontStyle: 'italic' },
  prePaySummary: { padding: 12, backgroundColor: '#07080a', borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  prePaySummaryTitle: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, marginBottom: 6 },
  prePaySummaryItem: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginBottom: 2 },
  prePaySummaryMore: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 4, fontStyle: 'italic' },
  prePayLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  prePayClientRow: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: 'rgba(61,158,146,0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(61,158,146,0.3)' },
  prePayClientName: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  prePayClientSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  prePayClientRemove: { padding: 6 },
  prePayDiscountChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: '#07080a' },
  prePayDiscountChipText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text },
  clientDropdown: { position: 'absolute', top: 48, left: 0, right: 0, zIndex: 200, backgroundColor: '#0b0c0f', borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', maxHeight: 220, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 20 },
  clientDropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.2)' },
  clientDropdownName: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  clientDropdownSub: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  prePayTotalBox: { marginTop: 16, padding: 14, backgroundColor: '#07080a', borderRadius: 14, borderWidth: 1, borderColor: colors.border, gap: 6 },
  prePayTotalLabel: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  prePayTotalTitle: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  prePayTotalValue: { fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.greenLight },
  prePayCancelBtn: { padding: 14, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)' },
  prePayCancelText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },

  // Список скидок
  discountScrollBox: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', maxHeight: 160 },
  discountDropdown: { position: 'absolute', top: 42, left: 0, right: 0, zIndex: 200, backgroundColor: '#0b0c0f', borderRadius: 12, borderWidth: 1, borderColor: colors.border, maxHeight: 200, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 20 },
  discountListRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.15)' },
  discountListRowActive: { backgroundColor: 'rgba(61,158,146,0.07)' },
  discountListName: { flex: 1, fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  discountListSub: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  discountListCheck: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.greenLight, marginLeft: 8 },

  // Модалка товара — Apple стиль
  itemModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemModalName: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, flex: 1, marginRight: 12 },
  itemModalClose: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(74,77,84,0.25)', alignItems: 'center', justifyContent: 'center' },
  itemModalCloseText: { fontSize: 14, color: colors.muted, fontFamily: fonts.familySemibold },
  itemModalSection: { marginBottom: 4 },
  itemModalSectionLabel: { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 14 },
  itemModalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 12, marginBottom: 4, backgroundColor: '#07080a', borderWidth: 1, borderColor: 'rgba(74,77,84,0.2)' },
  itemModalRowActive: { borderColor: 'rgba(61,158,146,0.5)', backgroundColor: 'rgba(61,158,146,0.07)' },
  itemModalRowText: { flex: 1, fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  itemModalRowTextActive: { color: colors.greenLight },
  itemModalRowPrice: { fontFamily: fonts.family, fontSize: 13, color: colors.muted, marginRight: 6 },
  itemModalRowCheck: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.greenLight },
  itemModalAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingVertical: 16, paddingHorizontal: 20, borderRadius: 16, backgroundColor: 'rgba(122,158,82,0.85)' },
  itemModalAddText: { fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: '#fff' },
  itemModalAddPrice: { fontFamily: fonts.familySemibold, fontSize: 15, color: 'rgba(255,255,255,0.85)' },

  // Модалка оплаты — Apple стиль
  payModalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: 16, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  payModalLabel: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  payModalTotal: { fontFamily: fonts.family, fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 2 },
  payModalSectionLabel: { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 14, marginBottom: 8 },
  payMethodsList: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(74,77,84,0.25)' },
  payMethodRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.15)', backgroundColor: '#07080a', gap: 10 },
  payMethodRowActive: { backgroundColor: 'rgba(61,158,146,0.07)' },
  payMethodIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  payMethodName: { flex: 1, fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  payMethodCheck: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.greenLight },
  mixedPayBox: { marginTop: 14, padding: 14, backgroundColor: '#07080a', borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: 10 },
  mixedPayRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mixedPayLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, width: 80 },
  mixedPayInput: { flex: 1, padding: 10, backgroundColor: '#0e0f11', borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: colors.text, fontFamily: fonts.family, fontSize: 16, textAlign: 'right' },
  mixedPayUnit: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, width: 16 },
  payConfirmBtn: { marginTop: 16, paddingVertical: 16, borderRadius: 16, backgroundColor: 'rgba(61,158,146,0.85)', alignItems: 'center' },
  payConfirmText: { fontFamily: fonts.family, fontSize: 16, fontWeight: '700', color: '#fff' },

  // Кнопки модалки заметки
  noteModalBtnPrimary: { paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(61,158,146,0.85)', alignItems: 'center' },
  noteModalBtnPrimaryText: { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: '#fff' },
  noteModalBtnSecondary: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(160,16,32,0.4)', alignItems: 'center' },
  noteModalBtnSecondaryText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.redLight },
  cartBadge: { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center', zIndex: 1, paddingHorizontal: 4 },
  cartBadgeText: { fontFamily: fonts.familySemibold, fontSize: 11, color: '#000' },
  searchWrap: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 },
  searchInput: { padding: 10, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 14, color: colors.text, fontSize: 14, fontFamily: fonts.family },
  orderNotePreview: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.greenLight, paddingHorizontal: 14, paddingBottom: 4, fontStyle: 'italic' },
  orderHeaderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(74,77,84,0.35)', backgroundColor: '#0e0f11' },
  orderHeaderBtnActive: { borderColor: 'rgba(61,158,146,0.5)', backgroundColor: 'rgba(61,158,146,0.1)' },
  orderHeaderBtnDanger: { borderColor: 'rgba(160,16,32,0.35)', backgroundColor: 'rgba(160,16,32,0.06)' },
  orderHeaderBtnIcon: { fontSize: 12 },
  orderHeaderBtnLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted },
  orderHeaderBtnText: { fontSize: 11, color: colors.muted },
  orderItemMain: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12, paddingTop: 10 },
  orderItemControls: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingBottom: 8, paddingTop: 4 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontFamily: fonts.family, fontSize: 16, color: colors.text, lineHeight: 20 },
  qtyVal: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, minWidth: 22, textAlign: 'center' },
  editTextBtn: { marginLeft: 8, paddingHorizontal: 12, height: 28, borderRadius: 8, backgroundColor: 'rgba(61,95,168,0.12)', borderWidth: 1, borderColor: 'rgba(61,95,168,0.3)', alignItems: 'center', justifyContent: 'center' },
  editTextBtnText: { fontFamily: fonts.familySemibold, fontSize: 11, color: '#7a9be8' },
  removeBtn: { marginLeft: 2, paddingHorizontal: 10, height: 28, borderRadius: 8, backgroundColor: 'rgba(160,16,32,0.12)', borderWidth: 1, borderColor: 'rgba(160,16,32,0.3)', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { fontSize: 13, color: colors.redLight },
  modsToggle: { fontSize: 10, color: colors.muted },
  cartItemNote: { fontFamily: fonts.familyRegular, fontSize: 11, color: '#7a9be8', marginTop: 2 },
  cartItemNoteHint: { fontFamily: fonts.familyRegular, fontSize: 9, color: 'rgba(74,77,84,0.5)', marginTop: 1, fontStyle: 'italic' },
  itemNoteIndicator: { fontSize: 10, color: '#7a9be8' },
  input: { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 15, fontFamily: fonts.family },
  orderPanel: { width: '33%', minWidth: 240, borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: colors.surface },
  orderHeader: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderHeaderBtns: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderHeaderText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2 },
  orderItem: { borderBottomWidth: 1, borderBottomColor: colors.border },
  // Слоты парковки
  slotBar: { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.border },
  slotBarInner: { paddingHorizontal: 10, paddingVertical: 8, gap: 6, flexDirection: 'row', alignItems: 'center' },
  slotTab: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#07080a' },
  slotTabActive: { borderColor: 'rgba(61,95,168,0.6)', backgroundColor: 'rgba(61,95,168,0.15)' },
  slotTabText: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted },
  slotTabTextActive: { color: '#7a9be8' },
  slotTabNew: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(61,158,146,0.4)', borderStyle: 'dashed' },
  slotTabNewText: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.greenLight },
  // Зоны
  zoneBar: { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.border },
  zoneBarInner: { paddingHorizontal: 10, paddingVertical: 8, gap: 6, flexDirection: 'row', alignItems: 'center' },
  zoneChip: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#07080a' },
  zoneChipActive: { borderColor: 'rgba(122,158,82,0.5)', backgroundColor: 'rgba(122,158,82,0.12)' },
  zoneChipText: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted },
  zoneChipTextActive: { color: colors.greenLight },
  orderItemName: { fontFamily: fonts.family, fontSize: 14, color: colors.text },
  orderItemMod: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  orderItemPrice: { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: colors.text },
  emptyOrder: { textAlign: 'center', color: colors.muted, padding: 20, fontFamily: fonts.familyRegular },
  emptyTitle: { fontFamily: fonts.family, fontSize: 18, color: colors.text, marginBottom: 8 },
  emptyHint: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  orderFooter: { padding: 14, borderTopWidth: 1, borderTopColor: 'rgba(74,77,84,0.3)', backgroundColor: '#08090b' },
  footerSummary: { marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.2)' },
  footerSummaryLine: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginBottom: 2 },
  footerTotalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', gap: 8, marginBottom: 12 },
  footerRawTotal: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textDecorationLine: 'line-through' },
  footerTotal: { fontFamily: fonts.family, fontSize: 28, fontWeight: '800', color: colors.text },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 18, borderRadius: 16, backgroundColor: 'rgba(122,158,82,0.85)', gap: 8 },
  payBtnDisabled: { backgroundColor: 'rgba(74,77,84,0.3)' },
  payBtnIcon: { fontSize: 18 },
  payBtnText: { fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: '#fff', flex: 1 },
  payBtnTotal: { fontFamily: fonts.familySemibold, fontSize: 15, color: 'rgba(255,255,255,0.85)' },
  discountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  pointsInput: { width: 70, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#07080a', borderWidth: 1, borderColor: 'rgba(122,158,82,0.5)', borderRadius: 8, color: colors.greenLight, fontSize: 13, fontFamily: fonts.family, textAlign: 'center' },
  discountText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.greenLight },
  discountRemove: { fontSize: 14, color: colors.muted, paddingHorizontal: 6 },
  rawTotal: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', marginBottom: 2 },
  orderTotal: { fontFamily: fonts.family, fontSize: 28, fontWeight: '800', color: colors.greenLight, textAlign: 'center', marginBottom: 10 },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalInner: { width: '55%', maxWidth: 540, backgroundColor: '#0e0f11', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.borderHi },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text, textTransform: 'uppercase', letterSpacing: 2, flex: 1 },
  modalCloseBtn: { padding: 6 },
  modalCloseText: { fontSize: 18, color: colors.muted },
  modalSection: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2, marginTop: 14, marginBottom: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e' },
  chipActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.18)' },
  chipDisabled: { borderColor: 'rgba(74,77,84,0.3)', backgroundColor: 'rgba(14,15,17,0.4)', opacity: 0.45 },
  chipLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  chipLabelActive: { color: colors.greenLight },
  chipLabelDisabled: { color: colors.muted },
  modalFooter: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 20 },
  modalPrice: { fontFamily: fonts.family, fontSize: 26, fontWeight: '800', color: colors.text, minWidth: 80, textAlign: 'right' },
  discountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  discountCard: {
    width: '47%', backgroundColor: '#0b0c0e', borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center', position: 'relative',
  },
  discountCardActive: { borderColor: 'rgba(61,158,146,0.75)', backgroundColor: 'rgba(61,158,146,0.14)' },
  discountCardPct: { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text },
  discountCardPctActive: { color: colors.greenLight },
  discountCardName: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 4, textAlign: 'center' },
  discountCardCheck: { position: 'absolute', top: 8, right: 10, fontSize: 13, color: colors.greenLight, fontWeight: '800' },
  mixedInput: { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 16, marginBottom: 10, textAlign: 'center', fontFamily: fonts.family },
  clientBadgeWrap: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2 },
  clientBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start',
    backgroundColor: '#0e0f11', borderWidth: 1, borderColor: 'rgba(122,158,82,0.45)',
    borderRadius: 18, paddingVertical: 7, paddingHorizontal: 12, paddingRight: 16,
    shadowColor: '#7a9e52', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 3,
  },
  clientAvatar: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(122,158,82,0.18)', borderWidth: 1, borderColor: 'rgba(122,158,82,0.55)',
  },
  clientAvatarText: { fontFamily: fonts.family, fontWeight: '800', fontSize: 13, color: colors.greenLight },
  clientBadgeName: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  clientBadgeSub: { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.greenLight, marginTop: 1 },
  warnIcon: { fontSize: 40, textAlign: 'center', marginBottom: 8 },
  warnTitle: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 8 },
  warnText: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center' },
});
