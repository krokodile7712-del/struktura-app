import React, { useState, useEffect } from 'react';
import { getHomeRoute } from '../db/session';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  FlatList, Modal, ActivityIndicator, TextInput, Alert,
} from 'react-native';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getAllProducts, getCategories, getProductVariants, getProductAxesWithValues, getProductModifierGroups, getDiscounts, createOrder, getOpenShift, addClientVisit, getBusinessProfile, getTerms } from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

const CAT_ICONS = { 'Кофе': '☕', 'Лимонады': '🍹', 'Допы': '🍬', 'Прочее': '🫙' };

export default function KassaScreen({ navigation, route }) {
  const forClient = route?.params?.forClient || null;
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [activeCat, setActiveCat] = useState(null);
  const [order, setOrder] = useState([]);
  const [appliedDiscount, setAppliedDiscount] = useState(null); // { name, pct }
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

  // Модалка оплаты
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payMethod, setPayMethod] = useState('Наличные'); // Наличные | Карта | QR | Смешанная
  const [mixedCash, setMixedCash] = useState('');
  const [mixedCard, setMixedCard] = useState('');

  // Модалка скидки
  const [discountModalOpen, setDiscountModalOpen] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    try {
      const products = getAllProducts();
      const cats = getCategories();
      const shift = getOpenShift();
      const disc = getDiscounts();
      const profile = getBusinessProfile();

      setShiftsEnabled(profile?.modules?.shifts !== false);
      setTerms(getTerms());
      setAllProducts(products);
      setGroups(cats);
      setActiveCat(cats[0] || null);
      setDiscounts(disc);
      setCurrentShift(shift);
    } catch (e) { console.error('[KassaScreen] loadData error:', e); }
    setLoading(false);
  };

  const itemsInCategory = allProducts.filter(p => p.category === activeCat);

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

  const openModal = (product) => {
    const variants = getProductVariants(product.id).filter(v => v.active);
    const groups = getProductModifierGroups(product.id);
    const axes = getProductAxesWithValues(product.id);
    // Нет вариантов и нет модификаторов — сразу в чек, без модалки
    if (variants.length <= 1 && groups.length === 0) {
      addDirectToOrder(product, variants[0] || null);
      return;
    }
    setModalItem(product);
    setModalVariants(variants);
    setModalGroups(groups);
    setModalAxes(axes);
    if (axes.length > 0) {
      // Инициализируем выбор — первое значение каждой оси
      const initSel = {};
      axes.forEach(a => { if (a.values.length > 0) initSel[a.id] = a.values[0].id; });
      setSelAxisValues(initSel);
      setSelVariantId(findVariantByAxes(variants, initSel)?.id || null);
    } else {
      setSelAxisValues({});
      setSelVariantId(variants[0]?.id || null);
    }
    const initialMods = {};
    groups.forEach(g => { initialMods[g.id] = g.selection_type === 'multiple' ? [] : null; });
    setSelModifiers(initialMods);
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
    setOrder(prev => [...prev, {
      id: Date.now() + Math.random(),
      product_id: product.id,
      variant_id: variant?.id || null,
      name: product.name,
      size: variant?.label || '',
      price: variant ? variant.price : (product.price || 0),
      modifiers: [],
    }]);
  };

  const confirmAdd = () => {
    if (!modalItem) return;
    let variant;
    if (modalAxes.length > 0) {
      variant = findVariantByAxes(modalVariants, selAxisValues);
      if (!variant) return; // комбинация недоступна
    } else {
      variant = modalVariants.find(v => v.id === selVariantId);
    }
    const mods = buildSelectedModifiers(modalGroups, selModifiers);
    setOrder(prev => [...prev, {
      id: Date.now() + Math.random(),
      product_id: modalItem.id,
      variant_id: variant?.id || null,
      name: modalItem.name,
      size: variant?.label || '',
      price: modalPrice(),
      modifiers: mods,
    }]);
    closeModal();
  };

  const removeFromOrder = (id) => setOrder(prev => prev.filter(i => i.id !== id));

  const rawTotal = order.reduce((s, i) => s + i.price, 0);
  const discountAmount = appliedDiscount ? Math.round(rawTotal * appliedDiscount.pct / 100) : 0;
  const total = rawTotal - discountAmount;

  // ─── Оплата ──────────────────────────────────────────────────────────────

  const [noShiftWarning, setNoShiftWarning] = useState(false);

  const openPayModal = () => {
    if (order.length === 0) return;
    if (shiftsEnabled && !currentShift) {
      setNoShiftWarning(true);
      return;
    }
    setPayMethod('Наличные');
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
    let cashAmount = 0, cardAmount = 0;
    if (payMethod === 'Смешанная') {
      cashAmount = parseFloat(mixedCash) || 0;
      cardAmount = parseFloat(mixedCard) || 0;
    } else if (payMethod === 'Наличные') {
      cashAmount = total;
    } else {
      cardAmount = total;
    }
    try {
      const { stockWarnings } = createOrder({
        total, method: payMethod,
        shift_id: currentShift?.id || null,
        client_id: forClient?.id || null,
        items: order,
        cashAmount, cardAmount,
        discountPct: appliedDiscount?.pct || 0,
      });
      if (forClient?.id) {
        addClientVisit(forClient.id, total);
      }
      setOrder([]);
      setAppliedDiscount(null);
      setPayModalOpen(false);
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
            <View>
              <Text style={styles.clientBadgeName}>{forClient.fio}</Text>
              <Text style={styles.clientBadgeSub}>★ баллы начислятся автоматически</Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.layout}>
        <View style={styles.left}>
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
          <ScrollView contentContainerStyle={styles.menuGrid}>
            {itemsInCategory.map((item) => {
              const { price, hasRange } = displayPrice(item);
              return (
                <Pressable key={item.id} style={styles.menuItem} onPress={() => openModal(item)}>
                  <Text style={styles.menuItemName}>{item.name}</Text>
                  <Text style={styles.menuItemPrice}>{hasRange ? `от ${price}` : price} ₽</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.orderPanel}>
          <View style={styles.orderHeader}>
            <Text style={styles.orderHeaderText}>🛒 {terms.order} ({order.length})</Text>
          </View>
          <ScrollView style={{ flex: 1 }}>
            {order.map((item) => (
              <Pressable key={item.id} style={styles.orderItem} onPress={() => removeFromOrder(item.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderItemName}>{item.name}{item.size ? ` ${item.size}` : ''}</Text>
                  {(item.modifiers || []).map((m, mi) => (
                    <Text key={mi} style={styles.orderItemMod}>· {m.optionName}{m.priceDelta > 0 ? ` +${m.priceDelta}₽` : ''}</Text>
                  ))}
                </View>
                <Text style={styles.orderItemPrice}>{item.price} ₽</Text>
              </Pressable>
            ))}
            {order.length === 0 && <Text style={styles.emptyOrder}>Корзина пуста</Text>}
          </ScrollView>

          <View style={styles.orderFooter}>
            {appliedDiscount && (
              <View style={styles.discountRow}>
                <Text style={styles.discountText}>🏷 {appliedDiscount.name} −{appliedDiscount.pct}%</Text>
                <Pressable onPress={() => setAppliedDiscount(null)}><Text style={styles.discountRemove}>✕</Text></Pressable>
              </View>
            )}
            {discountAmount > 0 && (
              <Text style={styles.rawTotal}>{rawTotal} ₽ → −{discountAmount} ₽</Text>
            )}
            <Text style={styles.orderTotal}>{total} ₽</Text>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <MetalButton title="🏷 Скидка" variant="default" onPress={() => setDiscountModalOpen(true)} style={{ flex: 1 }} />
            </View>
            <MetalButton title="💰 Оплатить" variant="action" onPress={openPayModal} />
          </View>
        </View>
      </View>

      <BottomBar navigation={navigation} activeTab="Kassa" />

      {/* Модалка товара */}
      <Modal visible={!!modalItem} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeModal} />
          {modalItem && (
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{modalItem.name}</Text>
                <Pressable onPress={closeModal} style={styles.modalCloseBtn} hitSlop={12}><Text style={styles.modalCloseText}>✕</Text></Pressable>
              </View>

              {/* Выбор варианта — по осям или плоский список (обратная совместимость) */}
              {modalAxes.length > 0 ? (
                modalAxes.map(axis => (
                  <View key={axis.id}>
                    <Text style={styles.modalSection}>{axis.name}</Text>
                    <View style={styles.chipsRow}>
                      {axis.values.map(val => {
                        const isSelected = String(selAxisValues[axis.id]) === String(val.id);
                        // Проверяем доступность комбинации с этим значением
                        const testSel = { ...selAxisValues, [axis.id]: val.id };
                        const testVariant = findVariantByAxes(modalVariants, testSel);
                        const unavailable = !testVariant;
                        return (
                          <Pressable
                            key={val.id}
                            style={[styles.chip, isSelected && styles.chipActive, unavailable && styles.chipDisabled]}
                            onPress={() => {
                              if (unavailable) return;
                              const newSel = { ...selAxisValues, [axis.id]: val.id };
                              setSelAxisValues(newSel);
                              setSelVariantId(findVariantByAxes(modalVariants, newSel)?.id || null);
                            }}
                          >
                            <Text style={[styles.chipLabel, isSelected && styles.chipLabelActive, unavailable && styles.chipLabelDisabled]}>
                              {val.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))
              ) : (
                modalVariants.length > 1 && (
                  <>
                    <Text style={styles.modalSection}>Вариант</Text>
                    <View style={styles.chipsRow}>
                      {modalVariants.map(v => (
                        <Pressable key={v.id} style={[styles.chip, selVariantId === v.id && styles.chipActive]} onPress={() => setSelVariantId(v.id)}>
                          <Text style={[styles.chipLabel, selVariantId === v.id && styles.chipLabelActive]}>{v.label || '—'} · {v.price} ₽</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )
              )}

              {modalGroups.map(group => {
                const sel = selModifiers[group.id];
                const isSelected = (optId) => group.selection_type === 'multiple' ? (sel || []).includes(optId) : sel === optId;
                return (
                  <View key={group.id}>
                    <Text style={styles.modalSection}>{group.name}</Text>
                    <View style={styles.chipsRow}>
                      {group.options.map(opt => (
                        <Pressable key={opt.id} style={[styles.chip, isSelected(opt.id) && styles.chipActive]} onPress={() => toggleModifierOption(group, opt.id)}>
                          <Text style={[styles.chipLabel, isSelected(opt.id) && styles.chipLabelActive]}>{opt.name}{opt.price_delta > 0 ? ` +${opt.price_delta}₽` : ''}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                );
              })}

              <View style={styles.modalFooter}>
                <Text style={styles.modalPrice}>{modalPrice()} ₽</Text>
                <MetalButton title="Добавить" variant="action" onPress={confirmAdd} style={{ flex: 1 }} />
              </View>
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

      {/* Модалка оплаты */}
      <Modal visible={payModalOpen} transparent animationType="fade" onRequestClose={closePayModal}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closePayModal} />
          <View style={styles.modalInner}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Оплата {total} ₽</Text>
              <Pressable onPress={closePayModal} hitSlop={12}><Text style={styles.modalCloseText}>✕</Text></Pressable>
            </View>

            <View style={styles.chipsRow}>
              {['Наличные', 'Карта', 'QR', 'Смешанная'].map(m => (
                <Pressable key={m} style={[styles.chip, payMethod === m && styles.chipActive]} onPress={() => setPayMethod(m)}>
                  <Text style={[styles.chipLabel, payMethod === m && styles.chipLabelActive]}>{m}</Text>
                </Pressable>
              ))}
            </View>

            {payMethod === 'Смешанная' && (
              <View style={{ marginTop: 14 }}>
                <Text style={styles.modalSection}>Наличными</Text>
                <TextInput style={styles.mixedInput} placeholder="0" placeholderTextColor={colors.muted} keyboardType="numeric" value={mixedCash} onChangeText={handleMixedCashChange} />
                <Text style={styles.modalSection}>Картой</Text>
                <TextInput style={styles.mixedInput} placeholder="0" placeholderTextColor={colors.muted} keyboardType="numeric" value={mixedCard} onChangeText={handleMixedCardChange} />
              </View>
            )}

            <MetalButton title="✅ Подтвердить оплату" variant="success" onPress={confirmPay} style={{ marginTop: 16 }} />
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
  catBtn: { minWidth: 90, height: 40, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginRight: 8 },
  catBtnActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.18)' },
  catIcon: { fontSize: 16 },
  catLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textTransform: 'uppercase' },
  catLabelActive: { color: colors.greenLight },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 10 },
  menuItem: { width: '30%', minWidth: 110, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.borderHi, backgroundColor: colors.surface2, alignItems: 'center' },
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
  discountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
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
