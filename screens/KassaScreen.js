import React, { useState, useEffect, useCallback } from 'react';
import SwipeableRow from '../components/SwipeableRow';
import { useToast } from '../components/Toast';
import { useFocusEffect } from '@react-navigation/native';
import { getHomeRoute, getCurrentLocationId, can, getSession } from '../db/session';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  FlatList, Modal, ActivityIndicator, TextInput, Alert,
} from 'react-native';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import ShiftBanner from '../components/ShiftBanner';
import BottomBar from '../components/BottomBar';
import { getAllProducts, getAllClients, getCategories, getProductVariants, getProductAxesWithValues, getProductModifierGroups, getDiscounts, getPayMethods, getAllVariantsWithSku, getZones, getOrderTemplates, saveOrderTemplate, deleteOrderTemplate, applyPendingPriceSchedules, createOrder, getOpenShift, addClientVisit, getBusinessProfile, getTerms, getLoyaltyConfig, spendPoints, checkSubscriptionBalance } from '../db/queries';
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
  const [openGroups, setOpenGroups] = useState({});
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
  const [hasShift, setHasShift] = useState(!!getOpenShift());
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
  const [clientPickerOpen, setClientPickerOpen]   = useState(false);
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

  // Отложить текущий чек и открыть новый
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
      setHasShift(!!getOpenShift());
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
      setActiveCat(cats.find(c => c === 'Кофе') || cats[0] || null);
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
    setOpenGroups({});
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
    if (!hasShift) {
      Alert.alert(
        'Смена не открыта',
        'Чтобы провести продажу, сначала откройте смену.',
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Открыть смену', onPress: () => navigation.navigate('Shift') },
        ]
      );
      return;
    }
    // Fix 4: проверка абонемента
    if (forClient?.id && loyaltyModel === 'subscription') {
      const check = checkSubscriptionBalance(forClient.id);
      if (!check.ok) {
        Alert.alert(
          '🎟 Абонемент исчерпан',
          `У клиента ${forClient.fio} не осталось визитов. Пополните абонемент в карточке клиента.`,
          [{ text: 'ОК' }]
        );
        return;
      }
    }
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
      const currentUser = getSession();
      const { stockWarnings } = createOrder({
        total, method: payMethod, methodType: selectedMethod.type,
        shift_id: currentShift?.id || null,
        client_id: forClient?.id || null,
        cashier_id: currentUser?.id || null,
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
        const visitResult = addClientVisit(forClient.id, total); // total = после скидки
      }
      setExpandedCartId(null);
      setPayModalOpen(false);
      closeSlot(activeSlotId);
      // Fix 3: обратная связь по баллам
      let toastMsg = `Оплата ${total} ₽ принята ✓`;
      if (forClient?.id) {
        if (loyaltyModel === 'points') {
          const earned = Math.round(total * (loyaltyConfig.earn_pct ?? 10) / 100);
          if (earned > 0) toastMsg += `  •  +${earned} балл.`;
        } else if (loyaltyModel === 'subscription') {
          toastMsg += `  •  -1 визит`;
        }
      }
      toast.show(toastMsg);
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

      {!hasShift && <ShiftBanner onOpen={() => navigation.navigate('Shift')} />}
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

          {/* Строка клиента */}
          <Pressable
            style={[styles.clientRow, forClient && styles.clientRowActive]}
            onPress={() => setClientPickerOpen(true)}
          >
            {forClient ? (
              <>
                <View style={styles.clientRowAvatar}>
                  <Text style={styles.clientRowAvatarTxt}>{(forClient.fio||'?').charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientRowName}>{forClient.fio}</Text>
                  <Text style={styles.clientRowSub}>
                    {loyaltyModel === 'points' ? `${forClient.balance || 0} баллов · +${Math.round(rawTotal * (loyaltyConfig.earn_pct || 10) / 100)} за заказ` :
                     loyaltyModel === 'subscription' ? `${forClient.balance || 0} визитов` :
                     forClient.discount_pct ? `-${forClient.discount_pct}% скидка` : ''}
                  </Text>
                </View>
                <Pressable onPress={() => updateSlot({ forClient: null })} hitSlop={10}>
                  <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.clientRowIcon}>👤</Text>
                <Text style={styles.clientRowEmpty}>Добавить клиента</Text>
                <Text style={styles.clientRowChevron}>›</Text>
              </>
            )}
          </Pressable>

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
                  <Text style={styles.orderHeaderBtnLabel}>Шаблоны</Text>
                </Pressable>
              )}
              <Pressable onPress={() => setNoteModalOpen(true)} hitSlop={8} style={[styles.orderHeaderBtn, orderNote && styles.orderHeaderBtnActive]}>
                <Text style={[styles.orderHeaderBtnLabel, orderNote && { color: colors.greenLight }]}>Заметка</Text>
              </Pressable>
              {slots.length === 1 && (
                <Pressable onPress={parkAndNew} hitSlop={8} style={styles.orderHeaderBtn}>
                  <Text style={styles.orderHeaderBtnLabel}>Отложить</Text>
                </Pressable>
              )}
              {order.length > 0 && (
                <Pressable onPress={() => { setOrder([]); setExpandedCartId(null); }} hitSlop={8} style={[styles.orderHeaderBtn, styles.orderHeaderBtnDanger]}>
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
                  <Pressable
                    style={styles.orderItemMain}
                    onPress={() => editCartItemMods(item)}
                    onLongPress={() => setItemNoteModal({ id: item.id, note: item.note || '' })}
                    delayLongPress={280}
                  >
                    {/* Название + цена */}
                    <View style={styles.orderItemTopRow}>
                      <Text style={styles.orderItemName} numberOfLines={1}>
                        {item.name}{item.size ? ` ${item.size}` : ''}
                      </Text>
                      <Text style={styles.orderItemPrice}>{(item.price * (item.quantity || 1)).toFixed(0)} ₽</Text>
                    </View>
                    {/* Цена за единицу если кол-во > 1 */}
                    {(item.quantity || 1) > 1 && (
                      <Text style={styles.orderItemUnitPrice}>{item.price} ₽ × {item.quantity}</Text>
                    )}
                    {/* Модификаторы — чипы */}
                    {(item.modifiers || []).length > 0 && (
                      <View style={styles.orderItemMods}>
                        {(item.modifiers || []).map((m, mi) => (
                          <View key={mi} style={styles.orderItemModChip}>
                            <Text style={styles.orderItemModText}>
                              {m.optionName}{m.priceDelta > 0 ? ` +${m.priceDelta}₽` : ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {/* Заметка */}
                    {item.note
                      ? <Text style={styles.cartItemNote}>💬 {item.note}</Text>
                      : null
                    }
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
      
