import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Modal,
} from 'react-native';
import EmptyState from '../EmptyState';
import {
  getAllStock, addPurchase, updateMaxOstatok,
  setStockForLocation, adjustStockForLocation,
  getStockHistory, getLocations,
  getCurrentLocationId, setCurrentLocationId,
  getBusinessProfile, updateStockThreshold,
} from '../../db/queries';
import { getDb } from '../../db/database';
import { can } from '../../db/session';
import { colors, fonts, spacing } from '../../constants/theme';
import { useToast } from '../Toast';

function updateStockLocal(itemId, newValue) {
  const db = getDb();
  db.runSync('UPDATE stock SET остаток = ? WHERE id = ?', [newValue, itemId]);
  db.runSync('UPDATE stock SET max_ostatok = MAX(COALESCE(max_ostatok,0), ?) WHERE id = ?', [newValue, itemId]);
}

const MODES = [
  { key: 'purchase', label: 'Закупка',    desc: 'Добавить с фиксацией цены' },
  { key: 'add',      label: 'Добавить',   desc: 'Пополнить остаток' },
  { key: 'subtract', label: 'Списать',    desc: 'Уменьшить (брак, расход)' },
  { key: 'set',      label: 'Установить', desc: 'Задать точное значение' },
];

// Единая реализация Склада — используется и отдельным экраном (StockScreen),
// и встроенной панелью внутри Admin/Dashboard (раньше это были два отдельных
// файла с продублированной логикой, из-за чего они периодически расходились).
export default function StockPanel() {
  const toast = useToast();
  const [stock, setStock]           = useState([]);
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState(null);
  const [mode, setMode]             = useState(null);
  const [qty, setQty]               = useState('');
  const [price, setPrice]           = useState('');
  const [history, setHistory]       = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [locations, setLocations]   = useState([]);
  const [selectedLocId, setSelectedLocId] = useState(null);
  const [locEnabled, setLocEnabled] = useState(false);
  const [catModal, setCatModal]     = useState(false);
  const [stockCats, setStockCats]   = useState([]);
  const [catModal2, setCatModal2]   = useState(null); // {oldName, newName}
  const [priceCalcOpen, setPriceCalcOpen] = useState(false);
  const [priceCalcQty, setPriceCalcQty]   = useState('');
  const [priceCalcSum, setPriceCalcSum]   = useState('');
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    try {
      const profile = getBusinessProfile();
      const locOn = profile?.modules?.locations === true;
      setLocEnabled(locOn);
      if (locOn) {
        const locs = getLocations();
        setLocations(locs);
        setSelectedLocId(getCurrentLocationId());
      }
      const allStock = getAllStock();
      setStock(allStock);
      setStockCats([...new Set(allStock.map(s => s.category || 'Без категории'))].sort());
    } catch (e) { console.error(e); }
  }, []);

  const reload = () => { try { setStock(getAllStock()); } catch (_) {} };

  const selectItem = (item) => {
    setSelected(item);
    setMode(null);
    setQty('');
    setPrice('');
    setShowHistory(false);
    setPriceCalcOpen(false);
    setPriceCalcQty('');
    setPriceCalcSum('');
    try { setHistory(getStockHistory(item.id).slice(0, 10)); } catch (_) { setHistory([]); }
  };

  const savePrice = (newPrice) => {
    if (!selected) return;
    const p = parseFloat(newPrice);
    if (isNaN(p) || p < 0) return;
    try {
      const db = getDb();
      db.runSync(`UPDATE stock SET avg_price = ?, last_price = ? WHERE id = ?`, [p, p, selected.id]);
      db.runSync(`UPDATE cost_ingredients SET price_per_unit = ? WHERE LOWER(name) = LOWER(?)`, [p, selected.name]);
      reload();
      setSelected(m => ({ ...m, avg_price: p }));
      toast.show(`Цена ${p} ₽/ед. сохранена ✓`, 'info');
    } catch(e) { console.error(e); toast.show('Ошибка сохранения', 'warn'); }
  };

  const confirm = () => {
    if (!selected || !qty) return;
    const n = parseFloat(qty);
    if (isNaN(n) || n < 0) return;
    try {
      const id  = selected.id;
      const name = selected.name;
      const cur  = selected['остаток'] || 0;
      if (mode === 'purchase') {
        const totalSum = parseFloat(price) || 0;
        const perUnit = n > 0 ? totalSum / n : 0;
        addPurchase(name, n, perUnit);
        setTimeout(() => { try { updateMaxOstatok(id); } catch (_) {} }, 80);
      } else if (locEnabled && selectedLocId) {
        if (mode === 'add')      adjustStockForLocation(id, selectedLocId, n);
        if (mode === 'subtract') adjustStockForLocation(id, selectedLocId, -n);
        if (mode === 'set')      setStockForLocation(id, selectedLocId, n);
      } else {
        if (mode === 'add')      updateStockLocal(id, cur + n);
        if (mode === 'subtract') updateStockLocal(id, Math.max(0, cur - n));
        if (mode === 'set')      updateStockLocal(id, n);
      }
      const fresh = getAllStock();
      setStock(fresh);
      const updated = fresh.find(s => s.id === id);
      if (updated) selectItem(updated); else { setMode(null); setQty(''); setPrice(''); }
    } catch (e) { console.error(e); }
  };

  const filtered = stock.filter(i =>
    !search.trim() || i.name?.toLowerCase().includes(search.toLowerCase())
  );
  const cats = [...new Set(filtered.map(i => i.category || 'Без категории'))].sort();

  const previewQty = (() => {
    const n = parseFloat(qty) || 0;
    const cur = selected?.['остаток'] || 0;
    if (mode === 'add')      return cur + n;
    if (mode === 'subtract') return Math.max(0, cur - n);
    if (mode === 'set')      return n;
    if (mode === 'purchase') return cur + n;
    return cur;
  })();

  const actionLabel = (() => {
    const n = parseFloat(qty);
    if (!n || !mode) return 'Применить';
    const u = selected?.unit || '';
    if (mode === 'purchase') return `Принять ${n} ${u}`;
    if (mode === 'add')      return `Добавить ${n} ${u}`;
    if (mode === 'subtract') return `Списать ${n} ${u}`;
    if (mode === 'set')      return `Установить ${n} ${u}`;
    return 'Применить';
  })();

  return (
    <View style={styles.layout} onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}>

      {/* Левая колонка — список */}
      <View style={[styles.left, containerWidth > 0 && { width: Math.min(380, Math.max(260, containerWidth * 0.3)) }]}>

        {locEnabled && locations.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={styles.locBar} contentContainerStyle={styles.locInner}>
            {locations.map(l => (
              <Pressable key={l.id}
                style={[styles.locChip, selectedLocId === l.id && styles.locChipActive]}
                onPress={() => { setCurrentLocationId(l.id); setSelectedLocId(l.id); reload(); }}>
                <Text style={[styles.locChipText, selectedLocId === l.id && styles.locChipActive]}>
                  {l.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.searchWrap}>
          <TextInput
            style={[styles.searchInput, { flex: 1 }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Поиск..."
            placeholderTextColor={colors.muted}
          />
          <Pressable onPress={() => setCatModal(true)} hitSlop={8} style={styles.catBtn}>
            <Text style={styles.catBtnText}>⚙</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled">
          {filtered.length === 0 ? (
            <EmptyState icon="📦" title="Склад пуст"
              text="Добавьте ингредиенты через Настройки → Техкарты." />
          ) : cats.map(cat => {
            const items = filtered.filter(i => (i.category || 'Без категории') === cat);
            const hasLow = items.some(i => i['порог'] > 0 && i['остаток'] <= i['порог']);
            return (
              <View key={cat} style={styles.catGroup}>
                <View style={styles.catHeadRow}>
                  <Text style={[styles.catName, hasLow && styles.catNameWarn]}>{cat}</Text>
                  {hasLow && <Text style={styles.catWarnDot}>⚠️</Text>}
                </View>

                <View style={styles.catCard}>
                  {items.map((item, idx) => {
                    const cur   = item['остаток'] ?? 0;
                    const thr   = item['порог']   ?? 0;
                    const isNeg = cur < 0;
                    const isLow = thr > 0 && cur <= thr;
                    const isOk  = !isNeg && !isLow;
                    const isLast = idx === items.length - 1;
                    const isActive = selected?.id === item.id;

                    return (
                      <Pressable
                        key={item.id}
                        style={({ pressed }) => [
                          styles.row,
                          !isLast && styles.rowDivider,
                          isActive && styles.rowActive,
                          pressed && !isActive && styles.rowPressed,
                        ]}
                        onPress={() => can('view_stock') && selectItem(item)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.itemName, isActive && { color: colors.orange }]} numberOfLines={1}>{item.name}</Text>
                          {thr > 0 && (
                            <Text style={styles.itemThreshold}>порог {thr} {item.unit}</Text>
                          )}
                        </View>

                        <View style={styles.itemRight}>
                          <Text style={[
                            styles.itemQty,
                            isNeg && styles.qtyNeg,
                            isLow && !isNeg && styles.qtyLow,
                          ]}>
                            {cur} <Text style={styles.itemUnit}>{item.unit}</Text>
                          </Text>
                          <Text style={[
                            styles.itemStatus,
                            isNeg && styles.statusNeg,
                            isLow && !isNeg && styles.statusLow,
                            isOk && styles.statusOk,
                          ]}>
                            {isNeg ? 'минус' : isLow ? 'мало' : 'норма'}
                          </Text>
                        </View>

                        <Text style={styles.rowArrow}>›</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Правая колонка — карточка товара */}
      <View style={styles.right}>
        {!selected ? (
          <View style={styles.emptyRight}>
            <Text style={{ fontSize: 48 }}>📦</Text>
            <Text style={styles.emptyRightTxt}>Выберите товар</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 22, maxWidth: 520 }}>
            <Text style={styles.detailTitle} numberOfLines={2}>{selected.name}</Text>

            {/* Текущий остаток */}
            <View style={styles.curBox}>
              <View style={styles.curRow}>
                <View>
                  <Text style={styles.curLabel}>Текущий остаток</Text>
                  <Text style={[
                    styles.curVal,
                    selected['остаток'] < 0 && styles.qtyNeg,
                    selected['порог'] > 0 && selected['остаток'] <= selected['порог'] && styles.qtyLow,
                  ]}>
                    {selected['остаток']} <Text style={styles.curUnit}>{selected.unit}</Text>
                  </Text>
                </View>
                {selected['порог'] > 0 && (
                  <View style={styles.curThrBox}>
                    <Text style={styles.curThrLabel}>порог</Text>
                    <Text style={styles.curThrVal}>{selected['порог']} {selected.unit}</Text>
                  </View>
                )}
                {!can('edit_thresholds') && selected['порог'] > 0 && (
                  <Text style={{ fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, marginTop: 4 }}>Изменение порога недоступно</Text>
                )}
              </View>

              <View style={styles.priceRow}>
                <Text style={styles.curAvg}>Цена за единицу:</Text>
                <TextInput
                  color={colors.text}
                  style={styles.priceInput}
                  keyboardType="numeric"
                  value={String(selected.avg_price || '')}
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  onChangeText={v => setSelected(m => ({ ...m, avg_price: v }))}
                />
                <Text style={styles.curAvg}>₽/ед.</Text>
                <Pressable
                  style={({ pressed }) => [styles.priceSaveBtn, pressed && { opacity: 0.7, backgroundColor: 'rgba(240,160,80,0.3)' }]}
                  onPress={() => savePrice(String(selected.avg_price || ''))}
                >
                  <Text style={styles.priceSaveTxt}>✓</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => setPriceCalcOpen(o => !o)}>
                <Text style={styles.priceCalcToggle}>{priceCalcOpen ? '✕ скрыть калькулятор' : '🧮 посчитать по сумме (без записи в Расходы)'}</Text>
              </Pressable>
              {priceCalcOpen && (
                <View style={styles.priceCalcBox}>
                  <View style={styles.priceCalcRow}>
                    <TextInput
                      color={colors.text}
                      style={styles.priceCalcInput}
                      keyboardType="numeric"
                      value={priceCalcQty}
                      onChangeText={setPriceCalcQty}
                      placeholder={`Кол-во, ${selected.unit}`}
                      placeholderTextColor={colors.muted}
                    />
                    <TextInput
                      color={colors.text}
                      style={styles.priceCalcInput}
                      keyboardType="numeric"
                      value={priceCalcSum}
                      onChangeText={setPriceCalcSum}
                      placeholder="Сумма, ₽"
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                  {!!priceCalcQty && !!priceCalcSum && parseFloat(priceCalcQty) > 0 && (
                    <Text style={styles.purchasePerUnitHint}>
                      ≈ {(parseFloat(priceCalcSum) / parseFloat(priceCalcQty)).toFixed(2)} ₽/{selected.unit}
                    </Text>
                  )}
                  <Pressable
                    style={({ pressed }) => [styles.priceCalcApplyBtn, pressed && { opacity: 0.8 }]}
                    onPress={() => {
                      const q = parseFloat(priceCalcQty), s = parseFloat(priceCalcSum);
                      if (!q || q <= 0 || isNaN(s)) return;
                      const per = s / q;
                      setSelected(m => ({ ...m, avg_price: per.toFixed(2) }));
                      savePrice(String(per));
                      setPriceCalcOpen(false);
                      setPriceCalcQty(''); setPriceCalcSum('');
                    }}
                  >
                    <Text style={styles.priceCalcApplyTxt}>Применить</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* Режимы */}
            {!can('edit_stock') ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <Text style={{ fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted }}>Изменение остатков недоступно</Text>
              </View>
            ) : !mode ? (
              <View style={styles.modeList}>
                {MODES.filter(m => m.key !== 'set' || can('edit_thresholds')).map((m, i, arr) => (
                  <Pressable
                    key={m.key}
                    style={({ pressed }) => [
                      styles.modeRow,
                      i < arr.length - 1 && styles.modeRowDiv,
                      pressed && { backgroundColor: 'rgba(255,255,255,0.03)' },
                    ]}
                    onPress={() => setMode(m.key)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modeLabel}>{m.label}</Text>
                      <Text style={styles.modeDesc}>{m.desc}</Text>
                    </View>
                    <Text style={styles.modeArrow}>›</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View>
                <Pressable style={styles.backBtn} onPress={() => { setMode(null); setQty(''); setPrice(''); }}>
                  <Text style={styles.backBtnText}>← {MODES.find(m => m.key === mode)?.label}</Text>
                </Pressable>

                <Text style={styles.inputLabel}>Количество, {selected.unit}</Text>
                <TextInput
                  style={styles.inputField}
                  value={qty}
                  onChangeText={setQty}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  autoFocus
                />

                {mode === 'purchase' && (
                  <>
                    <Text style={styles.inputLabel}>Сумма закупки, ₽</Text>
                    <TextInput
                      style={styles.inputField}
                      value={price}
                      onChangeText={setPrice}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={colors.muted}
                    />
                    {!!qty && !!price && parseFloat(qty) > 0 && (
                      <Text style={styles.purchasePerUnitHint}>
                        ≈ {(parseFloat(price) / parseFloat(qty)).toFixed(2)} ₽/{selected.unit}
                      </Text>
                    )}
                    <Text style={styles.purchaseExpenseNote}>💡 Сумма автоматически попадёт в Расходы, категория «Закупка»</Text>
                  </>
                )}

                {qty !== '' && (
                  <View style={styles.previewBox}>
                    <Text style={styles.previewLabel}>Станет</Text>
                    <Text style={[
                      styles.previewVal,
                      previewQty < 0 && styles.qtyNeg,
                      selected['порог'] > 0 && previewQty <= selected['порог'] && previewQty >= 0 && styles.qtyLow,
                    ]}>
                      {previewQty.toFixed(1)} {selected.unit}
                    </Text>
                  </View>
                )}

                <Pressable
                  style={({ pressed }) => [styles.confirmBtn, !qty && styles.confirmBtnOff, pressed && qty && { opacity: 0.88 }]}
                  onPress={confirm} disabled={!qty}
                >
                  <Text style={styles.confirmBtnText}>{actionLabel}</Text>
                </Pressable>
              </View>
            )}

            {history.length > 0 && (
              <Pressable style={styles.histToggle} onPress={() => setShowHistory(v => !v)}>
                <Text style={styles.histToggleText}>{showHistory ? '▲' : '▼'} История движения</Text>
              </Pressable>
            )}
            {showHistory && history.map((h, i) => (
              <View key={i} style={styles.histRow}>
                <Text style={styles.histDate}>{h.date?.slice(0, 10) || '—'}</Text>
                <Text style={styles.histQty}>{h.qty > 0 ? '+' : ''}{h.qty} {selected.unit}</Text>
                {h.price > 0 && <Text style={styles.histPrice}>{h.price} ₽/ед.</Text>}
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Модалка категорий */}
      <Modal visible={catModal} transparent animationType="fade" onRequestClose={() => setCatModal(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setCatModal(false)} />
          <View style={styles.catModalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Категории склада</Text>
              <Pressable onPress={() => setCatModal(false)} hitSlop={14} style={styles.modalClose}>
                <Text style={styles.modalCloseTxt}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={[styles.sectionLabel, { marginBottom: 12 }]}>
                Нажмите на категорию чтобы переименовать — изменится у всех позиций
              </Text>
              <View style={styles.card}>
                {stockCats.map((cat, idx) => (
                  <Pressable
                    key={cat}
                    style={({ pressed }) => [styles.catRow, idx < stockCats.length - 1 && styles.rowDiv, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
                    onPress={() => setCatModal2({ oldName: cat, newName: cat })}
                  >
                    <Text style={styles.catName}>{cat}</Text>
                    <Text style={styles.catArrow}>›</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Переименование категории */}
      <Modal visible={!!catModal2} transparent animationType="fade" onRequestClose={() => setCatModal2(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setCatModal2(null)} />
          <View style={[styles.catModalBox, { maxHeight: 260 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Переименовать</Text>
              <Pressable onPress={() => setCatModal2(null)} hitSlop={14} style={styles.modalClose}>
                <Text style={styles.modalCloseTxt}>✕</Text>
              </Pressable>
            </View>
            <View style={{ padding: 16 }}>
              <TextInput
                color={colors.text}
                style={styles.input}
                value={catModal2?.newName || ''}
                onChangeText={v => setCatModal2(m => ({ ...m, newName: v }))}
                placeholder="Название категории"
                placeholderTextColor={colors.muted}
                autoFocus
              />
              <Pressable
                style={({ pressed }) => [styles.confirmBtn, { marginTop: 12 }, pressed && { opacity: 0.88 }]}
                onPress={() => {
                  if (!catModal2?.newName?.trim()) return;
                  try {
                    const db = getDb();
                    db.runSync(`UPDATE stock SET category = ? WHERE category = ?`, [catModal2.newName.trim(), catModal2.oldName]);
                    const allStock = getAllStock();
                    setStock(allStock);
                    setStockCats([...new Set(allStock.map(s => s.category || 'Без категории'))].sort());
                    setCatModal2(null);
                  } catch (e) { console.error(e); }
                }}
              >
                <Text style={styles.confirmBtnText}>Сохранить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1, flexDirection: 'row' },
  left:   { borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface },
  right:  { flex: 1, backgroundColor: colors.bg },

  emptyRight:    { flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.3 },
  emptyRightTxt: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted, marginTop: 12 },
  detailTitle:   { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 16 },

  inner: { paddingBottom: 24 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    padding: 11,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.family,
  },
  catBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  catBtnText: { fontSize: 16, color: colors.muted },

  catGroup: { marginTop: 24, paddingHorizontal: spacing.lg },

  catHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  catName: { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  catNameWarn: { color: '#e0906a' },
  catWarnDot:  { fontSize: 14 },

  catCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(64,60,55,0.18)' },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.03)' },
  rowActive:  { backgroundColor: 'rgba(240,160,80,0.07)' },

  itemName: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text, marginBottom: 3 },
  itemThreshold: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },

  itemRight: { alignItems: 'flex-end', marginRight: 10 },
  itemQty: { fontFamily: fonts.family, fontSize: 17, fontWeight: '700', color: colors.text },
  itemUnit: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, fontWeight: '400' },
  itemStatus: { fontFamily: fonts.familySemibold, fontSize: 11, marginTop: 2 },

  statusOk:  { color: colors.green },
  statusLow: { color: colors.red },
  statusNeg: { color: '#ff3b30' },
  qtyLow:    { color: colors.red },
  qtyNeg:    { color: '#ff3b30' },

  rowArrow: { fontFamily: fonts.family, fontSize: 20, color: colors.border },

  locBar:   { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.border },
  locInner: { paddingHorizontal: spacing.lg, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  locChip:  { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  locChipActive: { borderColor: 'rgba(240,160,80,0.6)', backgroundColor: 'rgba(240,160,80,0.08)' },
  locChipText:   { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  catModalBox: { width: '45%', maxWidth: 420, maxHeight: '80%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  modalHeader:{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, flex: 1, marginRight: 12 },
  modalClose: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  modalCloseTxt: { fontSize: 13, color: colors.muted, fontFamily: fonts.familySemibold },
  sectionLabel: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, lineHeight: 17 },
  card: { backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  catRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
  rowDiv: { borderBottomWidth: 1, borderBottomColor: colors.border },
  catArrow: { fontSize: 18, color: colors.muted },
  input: { padding: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 14 },

  curBox:    { padding: 16, backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  curRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  curLabel:  { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  curVal:    { fontFamily: fonts.family, fontSize: 28, fontWeight: '800', color: colors.text },
  curUnit:   { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, fontWeight: '400' },
  curThrBox: { alignItems: 'flex-end' },
  curThrLabel:{ fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  curThrVal: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, marginTop: 2 },
  curAvg:    { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim, marginTop: 10 },

  modeList:   { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(64,60,55,0.25)' },
  modeRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.surface2 },
  modeRowDiv: { borderBottomWidth: 1, borderBottomColor: 'rgba(64,60,55,0.18)' },
  modeLabel:  { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text, marginBottom: 2 },
  modeDesc:   { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
  modeArrow:  { fontSize: 18, color: colors.muted },

  backBtn:     { paddingVertical: 10, marginBottom: 8 },
  backBtnText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orange },
  inputLabel:  { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 14 },
  inputField:  { padding: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 22, fontFamily: fonts.family, textAlign: 'center', marginBottom: 4 },

  previewBox:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: 'rgba(61,95,168,0.08)', borderRadius: 12, marginVertical: 10, borderWidth: 1, borderColor: 'rgba(61,95,168,0.2)' },
  previewLabel: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  previewVal:   { fontFamily: fonts.family, fontSize: 22, fontWeight: '800', color: colors.text },

  confirmBtn:    { paddingVertical: 15, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center', marginTop: 8 },
  confirmBtnOff: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  confirmBtnText:{ fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: '#fff' },

  histToggle:     { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  histToggleText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  histRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.borderLo },
  histDate:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, flex: 1 },
  histQty:    { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text, flex: 1, textAlign: 'center' },
  priceRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  priceInput: { paddingVertical: 4, paddingHorizontal: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.text, fontFamily: fonts.family, fontSize: 14, minWidth: 70, textAlign: 'center' },
  priceSaveBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: 'rgba(240,160,80,0.1)', borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)' },
  priceSaveTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },
  priceCalcToggle: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.orange, marginTop: 8 },
  priceCalcBox: { marginTop: 8, padding: 10, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, gap: 8 },
  priceCalcRow: { flexDirection: 'row', gap: 8 },
  priceCalcInput: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.text, fontFamily: fonts.family, fontSize: 14, textAlign: 'center' },
  priceCalcApplyBtn: { paddingVertical: 10, borderRadius: 8, backgroundColor: colors.orange, alignItems: 'center' },
  priceCalcApplyTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: '#fff' },
  purchasePerUnitHint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.green, textAlign: 'center', marginBottom: 4 },
  purchaseExpenseNote: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 4 },
  histPrice:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.orange, flex: 1, textAlign: 'right' },
});
