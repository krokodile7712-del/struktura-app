import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Modal, useWindowDimensions,
} from 'react-native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import MetalButton from '../components/MetalButton';
import EmptyState from '../components/EmptyState';
import { getAllStock, addPurchase, updateMaxOstatok, setStockForLocation, adjustStockForLocation, getStockHistory, getLocations, getCurrentLocationId, setCurrentLocationId, getBusinessProfile } from '../db/queries';
import { getDb } from '../db/database';
import { getHomeRoute } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';
import { useFocusEffect } from '@react-navigation/native';

// ─── Полоска уровня запаса ────────────────────────────────────────────────────
// 100% = max_ostatok (пик после закупок)
// Заполнение справа налево: полная = вся залита справа, пустеет слева
// Маркер порога = фиксированная позиция от правого края
function StockBar({ current, maxVal, threshold }) {
  // maxVal = исторический максимум (max_ostatok из БД)
  const max     = Math.max(maxVal || 0, current, threshold || 0, 1);
  const fillPct = Math.max(0, Math.min(current / max, 1));
  const isLow   = threshold > 0 && current <= threshold;
  const isEmpty = current <= 0;
  // Маркер порога: отступ от правого края = (1 - порог/max) * 100%
  const markerRightPct = threshold > 0 ? (1 - Math.min(threshold / max, 1)) * 100 : null;

  return (
    <View style={barStyles.track}>
      {/* Заполнение справа налево */}
      {!isEmpty && (
        <View style={[
          barStyles.fill,
          { width: `${fillPct * 100}%`, right: 0 },
          isLow ? barStyles.fillLow : barStyles.fillOk,
        ]} />
      )}
      {/* Маркер порога */}
      {markerRightPct !== null && (
        <View style={[barStyles.marker, { right: `${markerRightPct}%` }]} />
      )}
    </View>
  );
}

const barStyles = StyleSheet.create({
  track: {
    width: 110,
    height: 5,
    backgroundColor: 'rgba(74,77,84,0.2)',
    borderRadius: 3,
    overflow: 'visible',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    top: 0, bottom: 0,
    borderRadius: 3,
  },
  fillOk:  { backgroundColor: 'rgba(61,158,146,0.45)' },
  fillLow: { backgroundColor: 'rgba(160,16,32,0.5)' },
  marker: {
    position: 'absolute',
    top: -2, bottom: -2,
    width: 2,
    backgroundColor: 'rgba(221,216,208,0.7)',
    borderRadius: 1,
  },
});

// ─── Локальные функции склада ────────────────────────────────────────────────
function updateStockLocal(itemId, newValue) {
  const db = getDb();
  db.runSync('UPDATE stock SET остаток = ? WHERE id = ?', [newValue, itemId]);
  // Обновляем исторический максимум если остаток вырос
  db.runSync('UPDATE stock SET max_ostatok = MAX(max_ostatok, ?) WHERE id = ?', [newValue, itemId]);
}

// ─── Режимы изменения ─────────────────────────────────────────────────────────
const MODES = [
  { key: 'purchase', label: 'Закупка',   icon: '📦', desc: 'Добавить с фиксацией цены закупки' },
  { key: 'add',      label: 'Добавить',  icon: '+',   desc: 'Пополнить остаток без закупки' },
  { key: 'subtract', label: 'Списать',   icon: '−',   desc: 'Уменьшить остаток (брак, расход)' },
  { key: 'set',      label: 'Установить',icon: '=',   desc: 'Задать точное значение вручную' },
];

// ─── Экран ───────────────────────────────────────────────────────────────────
export default function StockScreen({ navigation }) {
  const { width: W } = useWindowDimensions();
  const isPhone = W < 480;
  const [stock, setStock]       = useState([]);
  const [search, setSearch]     = useState('');
  const [modalItem, setModalItem] = useState(null);
  const [mode, setMode]         = useState(null);
  const [qty, setQty]           = useState('');
  const [price, setPrice]       = useState('');
  const [history, setHistory]   = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [locations, setLocations] = useState([]);
  const [selectedLocId, setSelectedLocId] = useState(null);
  const [locEnabled, setLocEnabled] = useState(false);

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
      setStock(getAllStock());
    } catch (e) { console.error(e); }
  }, []));

  const reload = () => { try { setStock(getAllStock()); } catch (e) {} };

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
      const id   = modalItem.id;
      const name = modalItem.name;
      const cur  = modalItem['остаток'] || 0;
      if (mode === 'purchase') {
        addPurchase(name, n, parseFloat(price) || 0);
        // Обновляем максимум после закупки
        setTimeout(() => { try { updateMaxOstatok(id); } catch(_){} }, 100);
      } else if (locEnabled && selectedLocId) {
        if (mode === 'add') {
          adjustStockForLocation(id, selectedLocId, n);
        } else if (mode === 'subtract') {
          adjustStockForLocation(id, selectedLocId, -n);
        } else if (mode === 'set') {
          setStockForLocation(id, selectedLocId, n);
        }
      } else {
        if (mode === 'add') {
          updateStockLocal(id, cur + n);
        } else if (mode === 'subtract') {
          updateStockLocal(id, Math.max(0, cur - n));
        } else if (mode === 'set') {
          updateStockLocal(id, n);
        }
      }
      reload();
      closeModal();
    } catch (e) { console.error(e); }
  };

  // Фильтрация и группировка
  const filtered = stock.filter(i =>
    !search.trim() || i.name?.toLowerCase().includes(search.toLowerCase())
  );
  const cats = [...new Set(filtered.map(i => i.category || 'Без категории'))].sort();

  // Предпросмотр нового значения
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
      <TopBar title="Склад" onBack={() => navigation.navigate(getHomeRoute())} />

      {/* Локации */}
      {locEnabled && locations.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.locBar} contentContainerStyle={styles.locInner}>
          {locations.map(l => (
            <Pressable key={l.id}
              style={[styles.locChip, selectedLocId === l.id && styles.locChipActive]}
              onPress={() => { setCurrentLocationId(l.id); setSelectedLocId(l.id); reload(); }}>
              <Text style={[styles.locChipText, selectedLocId === l.id && styles.locChipTextActive]}>
                {selectedLocId === l.id ? '📍 ' : ''}{l.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Поиск */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="🔍 Поиск по названию..."
          placeholderTextColor={colors.muted}
        />
      </View>

      {/* Заголовки колонок */}
      <View style={styles.colHeaders}>
        <Text style={[styles.colHead, { flex: 1 }]}>Позиция</Text>
        <Text style={[styles.colHead, { width: isPhone ? 64 : 88, textAlign: 'right' }]}>Остаток</Text>
        {!isPhone && <Text style={[styles.colHead, { width: 130, textAlign: 'center' }]}>Уровень</Text>}
        <Text style={[styles.colHead, { width: isPhone ? 52 : 68, textAlign: 'center' }]}>Статус</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        {filtered.length === 0 ? (
          <EmptyState icon="📦" title="Склад пуст"
            text="Добавьте товары и ингредиенты в Настройках → Меню и цены → Техкарты. Они появятся здесь автоматически." />
        ) : cats.map(cat => {
          const items = filtered.filter(i => (i.category || 'Без категории') === cat);
          const hasLow = items.some(i => i['порог'] > 0 && i['остаток'] <= i['порог']);
          return (
            <View key={cat} style={styles.catGroup}>
              {/* Заголовок категории */}
              <View style={styles.catHeaderRow}>
                <View style={styles.catHeaderLine} />
                <Text style={[styles.catHeader, hasLow && styles.catHeaderWarn]}>{cat}</Text>
                {hasLow && <View style={styles.warnBadge}><Text style={styles.warnBadgeText}>мало</Text></View>}
                <View style={styles.catHeaderLine} />
              </View>

              {/* Строки */}
              {items.map((item, idx) => {
                const cur      = item['остаток'] ?? 0;
                const thr      = item['порог']   ?? 0;
                const isNeg    = cur < 0;
                const isLow    = thr > 0 && cur <= thr;
                const isOk     = !isNeg && !isLow;
                const isLast   = idx === items.length - 1;
                return (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [
                      styles.row,
                      isLast && styles.rowLast,
                      pressed && styles.rowPressed,
                    ]}
                    onPress={() => openModal(item)}
                  >
                    {/* Название */}
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[
                        styles.itemName,
                        isNeg && styles.itemNameNeg,
                        isLow && !isNeg && styles.itemNameLow,
                      ]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.avg_price > 0 && (
                        <Text style={styles.itemAvg}>{item.avg_price} ₽/ед.</Text>
                      )}
                    </View>

                    {/* Остаток */}
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[
                        styles.itemQty,
                        isNeg && styles.itemNameNeg,
                        isLow && !isNeg && styles.itemNameLow,
                      ]}>
                        {cur}
                      </Text>
                      <Text style={styles.itemUnit}>{item.unit}</Text>
                    </View>

                    {/* Полоска с маркером порога */}
                    <View style={{ paddingHorizontal: 10, gap: 3 }}>
                      <StockBar current={cur} threshold={thr} maxVal={item['max_ostatok'] || cur} />
                      {thr > 0 && (
                        <Text style={styles.thrLabel}>{thr}</Text>
                      )}
                    </View>

                    {/* Статус */}
                    <View style={{ alignItems: 'center' }}>
                      <Text style={[
                        styles.statusLabel,
                        isNeg && { color: '#ff3b30' },
                        isLow && !isNeg && { color: colors.redLight },
                        isOk && { color: 'rgba(61,158,146,0.7)' },
                      ]}>
                        {isNeg ? 'минус' : isLow ? 'мало' : 'норма'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      <BottomBar navigation={navigation} activeTab="Kassa" />

      {/* ── Модалка изменения остатка — Apple стиль ── */}
      <Modal visible={!!modalItem} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeModal} />
          {modalItem && (
            <View style={styles.modalInner}>
              {/* Заголовок */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle} numberOfLines={2}>{modalItem.name}</Text>
                <Pressable onPress={closeModal} hitSlop={14} style={styles.modalCloseBtn}>
                  <Text style={styles.modalCloseTxt}>✕</Text>
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Текущий остаток */}
                <View style={styles.curStockBox}>
                  <View style={styles.curStockRow}>
                    <View>
                      <Text style={styles.curStockLabel}>Текущий остаток</Text>
                      <Text style={[
                        styles.curStockVal,
                        modalItem['остаток'] < 0 && { color: '#ff3b30' },
                        modalItem['порог'] > 0 && modalItem['остаток'] <= modalItem['порог'] && { color: colors.redLight },
                      ]}>
                        {modalItem['остаток']} {modalItem.unit}
                      </Text>
                    </View>
                    {modalItem['порог'] > 0 && (
                      <Text style={styles.curThrLabel}>порог {modalItem['порог']} {modalItem.unit}</Text>
                    )}
                  </View>
                  {/* Полоска в модалке — шире */}
                  {modalItem['порог'] > 0 && (
                    <View style={[barStyles.track, { width: '100%', height: 6, marginTop: 10 }]}>
                      {modalItem['остаток'] > 0 && (() => {
                        const maxVal = Math.max(modalItem['max_ostatok'] || 0, modalItem['остаток'], modalItem['порог'], 1);
                        const fillPct = Math.min(modalItem['остаток'] / maxVal, 1);
                        const markPct = Math.min(modalItem['порог'] / maxVal, 1);
                        const isLow = modalItem['остаток'] <= modalItem['порог'];
                        return (
                          <>
                            <View style={[barStyles.fill, { width: `${fillPct * 100}%`, right: 0 }, isLow ? barStyles.fillLow : barStyles.fillOk]} />
                <View style={[barStyles.marker, { right: `${(1 - markPct) * 100}%` }]} />
                          </>
                        );
                      })()}
                    </View>
                  )}
                  {modalItem.avg_price > 0 && (
                    <Text style={styles.curAvgPrice}>Средняя цена закупки: {modalItem.avg_price} ₽/ед.</Text>
                  )}
                </View>

                {/* Выбор режима */}
                {!mode ? (
                  <View style={styles.modeList}>
                    {MODES.map(m => (
                      <Pressable
                        key={m.key}
                        style={({ pressed }) => [styles.modeRow, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
                        onPress={() => setMode(m.key)}
                      >
                        <View style={styles.modeIconBox}>
                          <Text style={styles.modeIcon}>{m.icon}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.modeLabel}>{m.label}</Text>
                          <Text style={styles.modeDesc}>{m.desc}</Text>
                        </View>
                        <Text style={styles.modeArrow}>›</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <View style={styles.inputSection}>
                    <Pressable style={styles.backToModes} onPress={() => { setMode(null); setQty(''); setPrice(''); }}>
                      <Text style={styles.backToModesText}>← {MODES.find(m2 => m2.key === mode)?.label}</Text>
                    </Pressable>

                    <Text style={styles.inputLabel}>
                      Количество, {modalItem.unit}
                    </Text>
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
                        <Text style={styles.inputLabel}>Цена закупки, ₽/ед. (необязательно)</Text>
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

                    {/* Предпросмотр */}
                    {qty !== '' && (
                      <View style={styles.previewBox}>
                        <Text style={styles.previewLabel}>Станет</Text>
                        <Text style={[
                          styles.previewVal,
                          previewQty < 0 && { color: '#ff3b30' },
                          modalItem['порог'] > 0 && previewQty <= modalItem['порог'] && previewQty >= 0 && { color: colors.redLight },
                        ]}>
                          {previewQty.toFixed(1)} {modalItem.unit}
                        </Text>
                      </View>
                    )}

                    <Pressable
                      style={({ pressed }) => [styles.confirmBtn, !qty && styles.confirmBtnDisabled, pressed && qty && { opacity: 0.88 }]}
                      onPress={confirm}
                      disabled={!qty}
                    >
                      <Text style={styles.confirmBtnText}>{actionLabel}</Text>
                    </Pressable>
                  </View>
                )}

                {/* История */}
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

// Колонки адаптируются через переменные в компоненте (см. ниже)

const styles = StyleSheet.create({
  inner: { paddingBottom: 20 },
  searchWrap: { paddingHorizontal: spacing.lg, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInput: { padding: 10, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 14, fontFamily: fonts.family },

  // Заголовки колонок
  colHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(74,77,84,0.3)',
    backgroundColor: '#07080a',
  },
  colHead: { fontFamily: fonts.familySemibold, fontSize: 10, color: 'rgba(74,77,84,0.8)', textTransform: 'uppercase', letterSpacing: 1 },
  colQty:   { textAlign: 'right' },
  colBar:   { textAlign: 'center', paddingHorizontal: 10 },
  colStatus:{ textAlign: 'center' },

  // Группы категорий
  catGroup: { paddingHorizontal: spacing.lg, marginTop: 14 },
  catHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  catHeaderLine: { flex: 1, height: 1, backgroundColor: 'rgba(74,77,84,0.25)' },
  catHeader: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1.5 },
  catHeaderWarn: { color: '#c47a5a' },
  warnBadge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8, backgroundColor: 'rgba(160,16,32,0.15)', borderWidth: 1, borderColor: 'rgba(160,16,32,0.3)' },
  warnBadgeText: { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.redLight },

  // Строки
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(74,77,84,0.2)',
  },
  rowLast:    { borderBottomWidth: 0 },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.03)' },

  itemName:    { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  itemNameLow: { color: colors.redLight },
  itemNameNeg: { color: '#ff3b30' },
  itemAvg:     { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },

  itemQty:  { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text },
  itemUnit: { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, marginTop: 1 },
  thrLabel: { fontFamily: fonts.familyRegular, fontSize: 9, color: 'rgba(74,77,84,0.6)', textAlign: 'right' },

  statusChip:    { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  statusChipOk:  { backgroundColor: 'rgba(61,158,146,0.08)', borderColor: 'rgba(61,158,146,0.25)' },
  statusChipLow: { backgroundColor: 'rgba(160,16,32,0.08)', borderColor: 'rgba(160,16,32,0.25)' },
  statusChipNeg: { backgroundColor: 'rgba(255,59,48,0.08)',  borderColor: 'rgba(255,59,48,0.25)'  },
  statusLabel:   { fontFamily: fonts.familySemibold, fontSize: 11 },

  // Локации
  locBar:       { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.border },
  locInner:     { paddingHorizontal: spacing.lg, paddingVertical: 8, gap: 8, flexDirection: 'row', alignItems: 'center' },
  locChip:      { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e' },
  locChipActive:{ borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.1)' },
  locChipText:  { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  locChipTextActive: { color: colors.greenLight },

  // Модалка
  modalRoot:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalInner: { width: '50%', maxWidth: 480, maxHeight: '88%', backgroundColor: '#0e0f11', borderRadius: 20, padding: 22, borderWidth: 1, borderColor: 'rgba(74,77,84,0.5)' },
  modalHeader:{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, flex: 1, marginRight: 12, lineHeight: 24 },
  modalCloseBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(74,77,84,0.25)', alignItems: 'center', justifyContent: 'center' },
  modalCloseTxt: { fontSize: 13, color: colors.muted, fontFamily: fonts.familySemibold },

  // Текущий остаток в модалке
  curStockBox:  { padding: 14, backgroundColor: '#07080a', borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  curStockRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  curStockLabel:{ fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  curStockVal:  { fontFamily: fonts.family, fontSize: 28, fontWeight: '800', color: colors.text },
  curThrLabel:  { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
  curAvgPrice:  { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 8 },

  // Режимы
  modeList: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(74,77,84,0.25)' },
  modeRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.15)', backgroundColor: '#07080a', gap: 12 },
  modeIconBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(74,77,84,0.2)', alignItems: 'center', justifyContent: 'center' },
  modeIcon:    { fontSize: 14, color: colors.text, fontFamily: fonts.familySemibold },
  modeLabel:   { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginBottom: 2 },
  modeDesc:    { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
  modeArrow:   { fontSize: 18, color: colors.muted },

  // Ввод
  inputSection: { gap: 0 },
  backToModes:  { paddingVertical: 10, marginBottom: 10 },
  backToModesText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.greenLight },
  inputLabel:   { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 12 },
  inputField:   { padding: 14, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 20, fontFamily: fonts.family, textAlign: 'center', marginBottom: 4 },

  // Предпросмотр
  previewBox:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: 'rgba(61,95,168,0.08)', borderRadius: 10, marginVertical: 10, borderWidth: 1, borderColor: 'rgba(61,95,168,0.2)' },
  previewLabel:{ fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  previewVal:  { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text },

  // Кнопка подтверждения
  confirmBtn:         { paddingVertical: 15, borderRadius: 14, backgroundColor: 'rgba(61,158,146,0.85)', alignItems: 'center', marginTop: 8 },
  confirmBtnDisabled: { backgroundColor: 'rgba(74,77,84,0.3)' },
  confirmBtnText:     { fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: '#fff' },

  // История
  histToggle: { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  histToggleText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  histRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.15)' },
  histDate:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, flex: 1 },
  histQty:    { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text, flex: 1, textAlign: 'center' },
  histPrice:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.greenLight, flex: 1, textAlign: 'right' },
});
