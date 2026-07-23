import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Modal, useWindowDimensions,
} from 'react-native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import EmptyState from '../components/EmptyState';
import {
  getAllStock, addPurchase, updateMaxOstatok,
  setStockForLocation, adjustStockForLocation,
  getStockHistory, getLocations,
  getCurrentLocationId, setCurrentLocationId,
  getBusinessProfile, updateStockThreshold,
} from '../db/queries';
import { getDb } from '../db/database';
import { getHomeRoute, can } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';
import { useFocusEffect } from '@react-navigation/native';

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

export default function StockScreen({ navigation }) {
  const { width: W } = useWindowDimensions();
  const [stock, setStock]           = useState([]);
  const [search, setSearch]         = useState('');
  const [modalItem, setModalItem]   = useState(null);
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

  useFocusEffect(useCallback(() => {
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
  }, []));

  const reload = () => { try { setStock(getAllStock()); } catch (_) {} };

  const openModal = (item) => {
    setModalItem(item);
    setMode(null);
    setQty('');
    setPrice('');
    setShowHistory(false);
    try { setHistory(getStockHistory(item.id).slice(0, 10)); } catch (_) { setHistory([]); }
  };
  const closeModal = () => { setModalItem(null); setMode(null); };

  const confirm = () => {
    if (!modalItem || !qty) return;
    const n = parseFloat(qty);
    if (isNaN(n) || n < 0) return;
    try {
      const id  = modalItem.id;
      const name = modalItem.name;
      const cur  = modalItem['остаток'] || 0;
      if (mode === 'purchase') {
        addPurchase(name, n, parseFloat(price) || 0);
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
      reload();
      closeModal();
    } catch (e) { console.error(e); }
  };

  const filtered = stock.filter(i =>
    !search.trim() || i.name?.toLowerCase().includes(search.toLowerCase())
  );
  const cats = [...new Set(filtered.map(i => i.category || 'Без категории'))].sort();

  const previewQty = (() => {
    const n = parseFloat(qty) || 0;
    const cur = modalItem?.['остаток'] || 0;
    if (mode === 'add')      return cur + n;
    if (mode === 'subtract') return Math.max(0, cur - n);
    if (mode === 'set')      return n;
    if (mode === 'purchase') return cur + n;
    return cur;
  })();

  const actionLabel = (() => {
    const n = parseFloat(qty);
    if (!n || !mode) return 'Применить';
    const u = modalItem?.unit || '';
    if (mode === 'purchase') return `Принять ${n} ${u}`;
    if (mode === 'add')      return `Добавить ${n} ${u}`;
    if (mode === 'subtract') return `Списать ${n} ${u}`;
    if (mode === 'set')      return `Установить ${n} ${u}`;
    return 'Применить';
  })();

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Склад"
        onBack={() => navigation.navigate(getHomeRoute())}
        rightElement={
          <Pressable onPress={() => setCatModal(true)} hitSlop={8} style={styles.catBtn}>
            <Text style={styles.catBtnText}>⚙ Категории</Text>
          </Pressable>
        }
      />

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
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Поиск..."
          placeholderTextColor={colors.muted}
        />
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

              {/* Заголовок категории — выразительный */}
              <View style={styles.catHeadRow}>
                <Text style={[styles.catName, hasLow && styles.catNameWarn]}>{cat}</Text>
                {hasLow && (
                  <Text style={styles.catWarnDot}>⚠️</Text>
                )}
              </View>

              {/* Карточка со списком */}
              <View style={styles.catCard}>
                {items.map((item, idx) => {
                  const cur   = item['остаток'] ?? 0;
                  const thr   = item['порог']   ?? 0;
                  const isNeg = cur < 0;
                  const isLow = thr > 0 && cur <= thr;
                  const isOk  = !isNeg && !isLow;
                  const isLast = idx === items.length - 1;

                  return (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [
                        styles.row,
                        !isLast && styles.rowDivider,
                        pressed && styles.rowPressed,
                      ]}
                      onPress={() => can('view_stock') && openModal(item)}
                    >
                      {/* Левая часть: название + порог */}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                        {thr > 0 && (
                          <Text style={styles.itemThreshold}>
                            порог {thr} {item.unit}
                          </Text>
                        )}
                      </View>

                      {/* Правая часть: остаток + статус */}
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

      <BottomBar navigation={navigation} activeTab="Kassa" />

      {/* Модалка */}
      <Modal visible={!!modalItem} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeModal} />
          {modalItem && (
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle} numberOfLines={2}>{modalItem.name}</Text>
                <Pressable onPress={closeModal} hitSlop={14} style={styles.modalCloseBtn}>
                  <Text style={styles.modalCloseTxt}>✕</Text>
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Текущий остаток */}
                <View style={styles.curBox}>
                  <View style={styles.curRow}>
                    <View>
                      <Text style={styles.curLabel}>Текущий остаток</Text>
                      <Text style={[
                        styles.curVal,
                        modalItem['остаток'] < 0 && styles.qtyNeg,
                        modalItem['порог'] > 0 && modalItem['остаток'] <= modalItem['порог'] && styles.qtyLow,
                      ]}>
                        {modalItem['остаток']} <Text style={styles.curUnit}>{modalItem.unit}</Text>
                      </Text>
                    </View>
                    {modalItem['порог'] > 0 && (
                      <View style={styles.curThrBox}>
                        <Text style={styles.curThrLabel}>порог</Text>
                        <Text style={styles.curThrVal}>{modalItem['порог']} {modalItem.unit}</Text>
                      </View>
                    )}
                  </View>
                  {modalItem.avg_price > 0 && (
                    <Text style={styles.curAvg}>Средняя цена: {modalItem.avg_price} ₽/ед.</Text>
                  )}
                </View>

                {/* Режимы */}
                {!mode && can('edit_stock') ? (
                  <View style={styles.modeList}>
                    {MODES.map((m, i) => (
                      <Pressable
                        key={m.key}
                        style={({ pressed }) => [
                          styles.modeRow,
                          i < MODES.length - 1 && styles.modeRowDiv,
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

                    <Text style={styles.inputLabel}>Количество, {modalItem.unit}</Text>
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
                        <Text style={styles.inputLabel}>Цена закупки, ₽/ед.</Text>
                        <TextInput
                          style={styles.inputField}
                          value={price}
                          onChangeText={setPrice}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={colors.muted}
                        />
                      </>
                    )}

                    {qty !== '' && (
                      <View style={styles.previewBox}>
                        <Text style={styles.previewLabel}>Станет</Text>
                        <Text style={[
                          styles.previewVal,
                          previewQty < 0 && styles.qtyNeg,
                          modalItem['порог'] > 0 && previewQty <= modalItem['порог'] && previewQty >= 0 && styles.qtyLow,
                        ]}>
                          {previewQty.toFixed(1)} {modalItem.unit}
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
                    <Text style={styles.histQty}>{h.qty > 0 ? '+' : ''}{h.qty} {modalItem.unit}</Text>
                    {h.price > 0 && <Text style={styles.histPrice}>{h.price} ₽/ед.</Text>}
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { paddingBottom: 24 },

  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    padding: 11,
    backgroundColor: '#07080a',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.family,
  },

  // Категории
  catGroup: { marginTop: 24, paddingHorizontal: spacing.lg },

  catHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  catName: {
    fontFamily: fonts.family,
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  catNameWarn: { color: '#e0906a' },
  catWarnDot:  { fontSize: 14 },

  // Карточка категории
  catCard: {
    backgroundColor: '#0b0c0f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(74,77,84,0.3)',
    overflow: 'hidden',
  },

  // Строки
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(74,77,84,0.18)',
  },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.03)' },

  itemName: {
    fontFamily: fonts.familySemibold,
    fontSize: 15,
    color: colors.text,
    marginBottom: 3,
  },
  itemThreshold: {
    fontFamily: fonts.familyRegular,
    fontSize: 12,
    color: colors.muted,
  },

  // Правая часть
  itemRight: { alignItems: 'flex-end', marginRight: 10 },
  itemQty: {
    fontFamily: fonts.family,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  itemUnit: {
    fontFamily: fonts.familyRegular,
    fontSize: 12,
    color: colors.muted,
    fontWeight: '400',
  },
  itemStatus: {
    fontFamily: fonts.familySemibold,
    fontSize: 11,
    marginTop: 2,
  },

  statusOk:  { color: 'rgba(61,158,146,0.7)' },
  statusLow: { color: colors.redLight },
  statusNeg: { color: '#ff3b30' },
  qtyLow:    { color: colors.redLight },
  qtyNeg:    { color: '#ff3b30' },

  rowArrow: {
    fontFamily: fonts.family,
    fontSize: 20,
    color: 'rgba(74,77,84,0.5)',
  },

  // Локации
  locBar:   { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.border },
  locInner: { paddingHorizontal: spacing.lg, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  locChip:  { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e' },
  locChipActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.1)' },
  locChipText:   { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },

  // Модалка
  modalRoot:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalInner: { width: '50%', maxWidth: 480, maxHeight: '88%', backgroundColor: '#0e0f11', borderRadius: 20, padding: 22, borderWidth: 1, borderColor: 'rgba(74,77,84,0.5)' },
  modalHeader:{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, flex: 1, marginRight: 12 },
  modalCloseBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(74,77,84,0.25)', alignItems: 'center', justifyContent: 'center' },
  modalCloseTxt: { fontSize: 13, color: colors.muted, fontFamily: fonts.familySemibold },

  curBox:    { padding: 16, backgroundColor: '#07080a', borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  curRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  curLabel:  { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  curVal:    { fontFamily: fonts.family, fontSize: 28, fontWeight: '800', color: colors.text },
  curUnit:   { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, fontWeight: '400' },
  curThrBox: { alignItems: 'flex-end' },
  curThrLabel:{ fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  curThrVal: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, marginTop: 2 },
  curAvg:    { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 10 },

  modeList:   { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(74,77,84,0.25)' },
  modeRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#07080a' },
  modeRowDiv: { borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.18)' },
  modeLabel:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginBottom: 2 },
  modeDesc:   { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
  modeArrow:  { fontSize: 18, color: colors.muted },

  backBtn:     { paddingVertical: 10, marginBottom: 8 },
  backBtnText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.greenLight },
  inputLabel:  { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 14 },
  inputField:  { padding: 14, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 22, fontFamily: fonts.family, textAlign: 'center', marginBottom: 4 },

  previewBox:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: 'rgba(61,95,168,0.08)', borderRadius: 12, marginVertical: 10, borderWidth: 1, borderColor: 'rgba(61,95,168,0.2)' },
  previewLabel: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  previewVal:   { fontFamily: fonts.family, fontSize: 22, fontWeight: '800', color: colors.text },

  confirmBtn:    { paddingVertical: 15, borderRadius: 14, backgroundColor: 'rgba(61,158,146,0.85)', alignItems: 'center', marginTop: 8 },
  confirmBtnOff: { backgroundColor: 'rgba(74,77,84,0.3)' },
  confirmBtnText:{ fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: '#fff' },

  histToggle:     { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  histToggleText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  histRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.15)' },
  histDate:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, flex: 1 },
  histQty:    { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text, flex: 1, textAlign: 'center' },
  histPrice:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.greenLight, flex: 1, textAlign: 'right' },
});
