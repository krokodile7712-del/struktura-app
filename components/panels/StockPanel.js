import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Modal, Animated,
} from 'react-native';
import EmptyState from '../EmptyState';
import {
  getAllStock, addPurchase, updateMaxOstatok, insertStockItem, getAvgCostLast10,
  getProductsUsingStockName, deleteStockItem,
  setStockForLocation, adjustStockForLocation,
  getStockHistory, getLocations,
  getCurrentLocationId, setCurrentLocationId,
  getBusinessProfile, updateStockThreshold,
} from '../../db/queries';
import { getDb } from '../../db/database';
import { can } from '../../db/session';
import { colors, fonts, spacing } from '../../constants/theme';
import { useToast } from '../Toast';
import Sheet from '../Sheet';
import InfoTip from '../InfoTip';
import UnitPicker from '../UnitPicker';

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
export default function StockPanel({ navigation, openCreateSignal, hideOwnCreateButton }) {
  const toast = useToast();
  const [stock, setStock]           = useState([]);
  const [search, setSearch]         = useState('');
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [viewMode, setViewMode]     = useState('categories'); // categories | list
  const [selected, setSelected]     = useState(null);
  const [mode, setMode]             = useState(null);
  const [qty, setQty]               = useState('');
  const [price, setPrice]           = useState('');
  const [history, setHistory]       = useState([]);
  const [avgCost, setAvgCost]       = useState(0);
  const [deletePrompt, setDeletePrompt] = useState(null); // {id, name, usedIn: [{id,name}]}
  const [lowStockSheetOpen, setLowStockSheetOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [locations, setLocations]   = useState([]);
  const [selectedLocId, setSelectedLocId] = useState(null);
  const [locEnabled, setLocEnabled] = useState(false);
  const [catModal, setCatModal]     = useState(false);
  const [newItemModal, setNewItemModal] = useState(null); // { name, unit, category, threshold }
  const [stockCats, setStockCats]   = useState([]);
  const [catModal2, setCatModal2]   = useState(null); // {oldName, newName}
  const [catDeletePrompt, setCatDeletePrompt] = useState(null); // {name, count, moveTo}

  const openMode = (key) => {
    setMode(key);
    setQty('');
    setPrice('');
  };

  const closeSlidePanel = () => {
    setMode(null);
    setQty('');
    setPrice('');
  };

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

  useEffect(() => {
    if (openCreateSignal) setNewItemModal({ name: '', unit: 'шт', category: '', threshold: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCreateSignal]);

  const reload = () => { try { setStock(getAllStock()); } catch (_) {} };

  const saveNewItem = () => {
    if (!newItemModal?.name?.trim()) return;
    const res = insertStockItem({
      name: newItemModal.name,
      unit: newItemModal.unit?.trim() || 'шт',
      category: newItemModal.category?.trim() || 'Прочее',
      threshold: parseFloat(newItemModal.threshold) || 0,
    });
    if (!res.ok) { toast.show(res.error, 'warn'); return; }
    reload();
    setStockCats(prev => [...new Set([...prev, newItemModal.category?.trim() || 'Прочее'])].sort());
    setNewItemModal(null);
    const created = getAllStock().find(s => s.id === res.id);
    if (created) selectItem(created);
  };

  const selectItem = (item) => {
    setSelected(item);
    setMode(null);
    setQty('');
    setPrice('');
    setShowHistory(false);
    try { setHistory(getStockHistory(item.id).slice(0, 10)); } catch (_) { setHistory([]); }
    try { setAvgCost(getAvgCostLast10(item.name)); } catch (_) { setAvgCost(0); }
  };

  const saveSellPrice = (newPrice) => {
    if (!selected) return;
    const p = parseFloat(newPrice);
    if (isNaN(p) || p < 0) return;
    try {
      const db = getDb();
      db.runSync(`UPDATE stock SET sell_price = ? WHERE id = ?`, [p, selected.id]);
      reload();
      setSelected(m => ({ ...m, sell_price: p }));
      toast.show(`Цена продажи ${p} ₽/ед. сохранена ✓`, 'info');
    } catch(e) { console.error(e); toast.show('Ошибка сохранения', 'warn'); }
  };

  const requestDelete = () => {
    if (!selected) return;
    const usedIn = getProductsUsingStockName(selected.name);
    setDeletePrompt({ id: selected.id, name: selected.name, usedIn });
  };

  const confirmDelete = (removeFromRecipes) => {
    if (!deletePrompt) return;
    const res = deleteStockItem(deletePrompt.id, deletePrompt.name, removeFromRecipes);
    if (!res.ok) { toast.show(res.error || 'Не удалось удалить', 'warn'); return; }
    toast.show(`«${deletePrompt.name}» удалено со склада`, 'info');
    setDeletePrompt(null);
    setSelected(null);
    reload();
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
      setMode(null);
      setQty('');
      setPrice('');
      if (updated) {
        setSelected(updated);
        try { setHistory(getStockHistory(id).slice(0, 10)); } catch (_) {}
        try { setAvgCost(getAvgCostLast10(name)); } catch (_) {}
      }
    } catch (e) { console.error(e); }
  };

  const isLowOrNeg = (i) => {
    const cur = i['остаток'] ?? 0;
    const thr = i['порог'] ?? 0;
    return cur < 0 || (thr > 0 && cur <= thr);
  };

  const filtered = stock.filter(i =>
    (!search.trim() || i.name?.toLowerCase().includes(search.toLowerCase())) &&
    (!showLowOnly || isLowOrNeg(i))
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

  const renderItemRow = (item, isLast) => {
    const cur   = item['остаток'] ?? 0;
    const thr   = item['порог']   ?? 0;
    const isNeg = cur < 0;
    const isLow = thr > 0 && cur <= thr;
    const isOk  = !isNeg && !isLow;
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
  };

  return (
    <View style={styles.layout}>

      {/* Список — теперь единственная колонка на весь экран */}
      <View style={styles.left}>

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
          {!hideOwnCreateButton && (
          <Pressable onPress={() => setNewItemModal({ name: '', unit: 'шт', category: '', threshold: '' })} hitSlop={8} style={styles.addStockBtn}>
            <Text style={styles.addStockBtnText}>+ Позиция</Text>
          </Pressable>
          )}
          <Pressable onPress={() => setLowStockSheetOpen(true)} hitSlop={8} style={styles.catBtn}>
            <Text style={styles.catBtnText}>⚠️</Text>
          </Pressable>
          <Pressable onPress={() => setCatModal(true)} hitSlop={8} style={styles.catBtn}>
            <Text style={styles.catBtnText}>⚙</Text>
          </Pressable>
        </View>

        <View style={styles.filterRow}>
          <Pressable style={[styles.filterChip, showLowOnly && styles.filterChipActive]} onPress={() => setShowLowOnly(v => !v)}>
            <Text style={[styles.filterChipTxt, showLowOnly && styles.filterChipTxtActive]}>⚠️ Мало</Text>
          </Pressable>
          <View style={styles.viewSwitch}>
            <Pressable style={[styles.viewSwitchBtn, viewMode === 'categories' && styles.viewSwitchBtnActive]} onPress={() => setViewMode('categories')}>
              <Text style={[styles.viewSwitchTxt, viewMode === 'categories' && styles.viewSwitchTxtActive]}>По категориям</Text>
            </Pressable>
            <Pressable style={[styles.viewSwitchBtn, viewMode === 'list' && styles.viewSwitchBtnActive]} onPress={() => setViewMode('list')}>
              <Text style={[styles.viewSwitchTxt, viewMode === 'list' && styles.viewSwitchTxtActive]}>Список</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled">
          {filtered.length === 0 ? (
            stock.length === 0 ? (
              <EmptyState icon="📦" title="Склад пуст"
                text="Добавьте первую позицию — то, что физически заканчивается: ингредиенты, расходники, товары для перепродажи."
                action={hideOwnCreateButton ? undefined : '+ Добавить позицию'}
                onAction={hideOwnCreateButton ? undefined : () => setNewItemModal({ name: '', unit: 'шт', category: '', threshold: '' })} />
            ) : (
              <EmptyState icon="✅" title={showLowOnly ? 'Ничего не заканчивается' : 'Ничего не найдено'}
                text={showLowOnly ? 'Все остатки в норме' : 'Попробуйте другой поиск'} />
            )
          ) : viewMode === 'list' ? (
            <View style={styles.catCard}>
              {[...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru')).map((item, idx, arr) =>
                renderItemRow(item, idx === arr.length - 1)
              )}
            </View>
          ) : cats.map(cat => {
            const items = [...filtered.filter(i => (i.category || 'Без категории') === cat)]
              .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
            const hasLow = items.some(i => i['порог'] > 0 && i['остаток'] <= i['порог']);
            return (
              <View key={cat} style={styles.catGroup}>
                <View style={styles.catHeadRow}>
                  <Text style={[styles.catName, hasLow && styles.catNameWarn]}>{cat}</Text>
                  {hasLow && <Text style={styles.catWarnDot}>⚠️</Text>}
                </View>

                <View style={styles.catCard}>
                  {items.map((item, idx) => renderItemRow(item, idx === items.length - 1))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Карточка товара — выезжающий слой поверх списка */}
      <Sheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={mode ? MODES.find(m => m.key === mode)?.label : selected?.name}
      >
        {selected && (mode ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Pressable style={styles.backToDetailBtn} onPress={closeSlidePanel}>
              <Text style={styles.backToDetailTxt}>← Назад к товару</Text>
            </Pressable>
            <Text style={styles.slidePanelDesc}>{MODES.find(m => m.key === mode)?.desc}</Text>

            <Text style={styles.inputLabel}>Количество, {selected?.unit}</Text>
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
                    ≈ {(parseFloat(price) / parseFloat(qty)).toFixed(2)} ₽/{selected?.unit}
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
                  selected?.['порог'] > 0 && previewQty <= selected['порог'] && previewQty >= 0 && styles.qtyLow,
                ]}>
                  {previewQty.toFixed(1)} {selected?.unit}
                </Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [styles.confirmBtn, !qty && styles.confirmBtnOff, pressed && qty && { opacity: 0.88 }]}
              onPress={confirm} disabled={!qty}
            >
              <Text style={styles.confirmBtnText}>{actionLabel}</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 22 }}>

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
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.curAvg}>Себестоимость:</Text>
                  <InfoTip title="Себестоимость" text="Считается автоматически по последним закупкам этой позиции — не редактируется вручную. Если закупок ещё не было, тут прочерк, пока не оформите первую («Закупка»)." />
                </View>
                <Text style={styles.curAvgVal}>
                  {avgCost > 0 ? `${avgCost} ₽/ед.` : '— (нет закупок)'}
                </Text>
              </View>

              <View style={[styles.priceRow, { marginTop: 10 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.curAvg}>Цена продажи:</Text>
                  <InfoTip title="Цена продажи" text="Сколько это стоит клиенту за единицу — используется, когда позицию продают напрямую (например, краску на развес) или добавляют в заказ по факту расхода. Отдельно от себестоимости." />
                </View>
                <TextInput
                  color={colors.text}
                  style={styles.priceInput}
                  keyboardType="numeric"
                  value={String(selected.sell_price || '')}
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  onChangeText={v => setSelected(m => ({ ...m, sell_price: v }))}
                />
                <Text style={styles.curAvg}>₽/ед.</Text>
                <Pressable
                  style={({ pressed }) => [styles.priceSaveBtn, pressed && { opacity: 0.7, backgroundColor: 'rgba(240,160,80,0.3)' }]}
                  onPress={() => saveSellPrice(String(selected.sell_price || ''))}
                >
                  <Text style={styles.priceSaveTxt}>✓</Text>
                </Pressable>
              </View>
            </View>

            {/* Режимы */}
            {!can('edit_stock') ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <Text style={{ fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted }}>Изменение остатков недоступно</Text>
              </View>
            ) : (
              <View style={styles.modeList}>
                {MODES.filter(m => m.key !== 'set' || can('edit_thresholds')).map((m, i, arr) => (
                  <Pressable
                    key={m.key}
                    style={({ pressed }) => [
                      styles.modeRow,
                      i < arr.length - 1 && styles.modeRowDiv,
                      pressed && { backgroundColor: 'rgba(255,255,255,0.03)' },
                    ]}
                    onPress={() => openMode(m.key)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modeLabel}>{m.label}</Text>
                      <Text style={styles.modeDesc}>{m.desc}</Text>
                    </View>
                    <Text style={styles.modeArrow}>›</Text>
                  </Pressable>
                ))}
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

            {can('edit_stock') && (
              <Pressable style={styles.deleteItemBtn} onPress={requestDelete}>
                <Text style={styles.deleteItemTxt}>Удалить позицию</Text>
              </Pressable>
            )}
          </ScrollView>
        ))}
      </Sheet>

      {/* Предупреждение при удалении — позиция может использоваться в техкартах */}
      <Modal visible={!!deletePrompt} transparent animationType="fade" onRequestClose={() => setDeletePrompt(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setDeletePrompt(null)} />
          <View style={[styles.catModalBox, { maxHeight: '70%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Удалить «{deletePrompt?.name}»?</Text>
              <Pressable onPress={() => setDeletePrompt(null)} hitSlop={14} style={styles.modalClose}>
                <Text style={styles.modalCloseTxt}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {deletePrompt?.usedIn?.length > 0 ? (
                <>
                  <Text style={styles.sectionLabel}>
                    Эта позиция используется в техкарте {deletePrompt.usedIn.length === 1 ? 'товара' : 'товаров'}:
                  </Text>
                  <View style={{ marginTop: 8, marginBottom: 16 }}>
                    {deletePrompt.usedIn.map(p => (
                      <Text key={p.id} style={styles.catItemName}>• {p.name}</Text>
                    ))}
                  </View>

                  <Pressable style={styles.confirmBtn} onPress={() => confirmDelete(false)}>
                    <Text style={styles.confirmBtnText}>Удалить со склада, оставить в техкартах</Text>
                  </Pressable>
                  <Text style={styles.sectionLabel}>Товары продолжат ссылаться на это название, но остаток по нему больше не будет отслеживаться.</Text>

                  <Pressable style={[styles.catDeleteBtn, { marginTop: 16 }]} onPress={() => confirmDelete(true)}>
                    <Text style={styles.catDeleteTxt}>Удалить и убрать из техкарт тоже</Text>
                  </Pressable>

                  <Pressable style={[styles.cancelBtn, { marginTop: 10 }]} onPress={() => setDeletePrompt(null)}>
                    <Text style={styles.cancelTxt}>Отменить</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.sectionLabel}>Позиция нигде не используется в техкартах — можно удалить без последствий.</Text>
                  <Pressable style={[styles.catDeleteBtn, { marginTop: 16 }]} onPress={() => confirmDelete(false)}>
                    <Text style={styles.catDeleteTxt}>Удалить</Text>
                  </Pressable>
                  <Pressable style={[styles.cancelBtn, { marginTop: 10 }]} onPress={() => setDeletePrompt(null)}>
                    <Text style={styles.cancelTxt}>Отменить</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Отдельный экран — всё, что скоро закончится, в одном месте */}
      <Sheet visible={lowStockSheetOpen} onClose={() => setLowStockSheetOpen(false)} title="Скоро закончится">
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {(() => {
            const negItems = stock.filter(s => (s['остаток'] ?? 0) < 0);
            const lowItems = stock.filter(s => {
              const cur = s['остаток'] ?? 0;
              const thr = s['порог'] ?? 0;
              return cur >= 0 && thr > 0 && cur <= thr;
            });
            if (negItems.length === 0 && lowItems.length === 0) {
              return (
                <EmptyState icon="✅" title="Всё в норме" text="Ни одна позиция не приближается к порогу" />
              );
            }
            return (
              <>
                {negItems.length > 0 && (
                  <>
                    <Text style={styles.lowSheetSectionTitle}>В минусе</Text>
                    <View style={styles.catCard}>
                      {negItems.map((item, idx) => renderItemRow(item, idx === negItems.length - 1))}
                    </View>
                  </>
                )}
                {lowItems.length > 0 && (
                  <>
                    <Text style={[styles.lowSheetSectionTitle, { marginTop: negItems.length > 0 ? 20 : 0 }]}>Ниже порога</Text>
                    <View style={styles.catCard}>
                      {lowItems.map((item, idx) => renderItemRow(item, idx === lowItems.length - 1))}
                    </View>
                  </>
                )}
              </>
            );
          })()}
        </ScrollView>
      </Sheet>

      {/* Модалка новой позиции склада */}
      <Modal visible={!!newItemModal} transparent animationType="fade" onRequestClose={() => setNewItemModal(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setNewItemModal(null)} />
          {newItemModal && (
            <View style={styles.catModalBox}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Text style={styles.modalTitle}>Новая позиция склада</Text>
                  <InfoTip title="Позиция склада" text="Это то, что физически есть в ограниченном количестве и заканчивается: ингредиенты, расходники, товары для перепродажи. Отдельно от «Товаров» — там то, что вы продаёте клиенту." />
                </View>
                <Pressable onPress={() => setNewItemModal(null)} hitSlop={14} style={styles.modalClose}>
                  <Text style={styles.modalCloseTxt}>✕</Text>
                </Pressable>
              </View>
              <View style={{ padding: 16 }}>
                <Text style={styles.sectionLabel}>Название</Text>
                <TextInput
                  color={colors.text}
                  style={[styles.input, { marginBottom: 12 }]}
                  value={newItemModal.name}
                  onChangeText={v => setNewItemModal(m => ({ ...m, name: v }))}
                  placeholder="напр. Молоко"
                  placeholderTextColor={colors.muted}
                  autoFocus
                />
                <Text style={styles.sectionLabel}>Единица</Text>
                <View style={{ marginBottom: 12 }}>
                  <UnitPicker value={newItemModal.unit} onChange={v => setNewItemModal(m => ({ ...m, unit: v }))} />
                </View>
                <Text style={styles.sectionLabel}>Порог (необязательно)</Text>
                <TextInput
                  color={colors.text}
                  style={[styles.input, { marginBottom: 12 }]}
                  value={newItemModal.threshold}
                  onChangeText={v => setNewItemModal(m => ({ ...m, threshold: v }))}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                />
                <Text style={styles.sectionLabel}>Категория</Text>
                {stockCats.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
                    {stockCats.map(cat => (
                      <Pressable key={cat} style={[styles.catChip, newItemModal.category === cat && styles.catChipActive]} onPress={() => setNewItemModal(m => ({ ...m, category: cat }))}>
                        <Text style={[styles.catChipTxt, newItemModal.category === cat && styles.catChipTxtActive]}>{cat}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
                <TextInput
                  color={colors.text}
                  style={styles.input}
                  value={newItemModal.category}
                  onChangeText={v => setNewItemModal(m => ({ ...m, category: v }))}
                  placeholder="Или впишите новую категорию"
                  placeholderTextColor={colors.muted}
                />
                <Pressable
                  style={({ pressed }) => [styles.confirmBtn, { marginTop: 14 }, pressed && { opacity: 0.88 }]}
                  onPress={saveNewItem}
                >
                  <Text style={styles.confirmBtnText}>Создать</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </Modal>

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
                Нажмите на категорию, чтобы переименовать, удалить или посмотреть позиции. Новая категория создаётся прямо при заведении позиции склада — впишите название, если нужной ещё нет.
              </Text>
              <View style={styles.card}>
                {stockCats.map((cat, idx) => {
                  const count = stock.filter(s => (s.category || 'Прочее') === cat).length;
                  return (
                    <Pressable
                      key={cat}
                      style={({ pressed }) => [styles.catRow, idx < stockCats.length - 1 && styles.rowDiv, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
                      onPress={() => setCatModal2({ oldName: cat, newName: cat })}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.catName}>{cat}</Text>
                        <Text style={styles.catCountTxt}>{count} {count === 1 ? 'позиция' : count >= 2 && count <= 4 ? 'позиции' : 'позиций'}</Text>
                      </View>
                      <Text style={styles.catArrow}>›</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Переименование / удаление категории */}
      <Modal visible={!!catModal2} transparent animationType="fade" onRequestClose={() => setCatModal2(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setCatModal2(null)} />
          <View style={[styles.catModalBox, { maxHeight: '70%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{catModal2?.oldName}</Text>
              <Pressable onPress={() => setCatModal2(null)} hitSlop={14} style={styles.modalClose}>
                <Text style={styles.modalCloseTxt}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={styles.sectionLabel}>Название категории</Text>
              <TextInput
                color={colors.text}
                style={[styles.input, { marginTop: 6 }]}
                value={catModal2?.newName || ''}
                onChangeText={v => setCatModal2(m => ({ ...m, newName: v }))}
                placeholder="Название категории"
                placeholderTextColor={colors.muted}
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
                <Text style={styles.confirmBtnText}>Сохранить название</Text>
              </Pressable>

              {catModal2 && (() => {
                const itemsInCat = stock.filter(s => (s.category || 'Прочее') === catModal2.oldName);
                return (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 20, marginBottom: 8 }]}>Позиции в категории ({itemsInCat.length})</Text>
                    {itemsInCat.map(it => (
                      <View key={it.id} style={styles.catItemRow}>
                        <Text style={styles.catItemName}>{it.name}</Text>
                        <Text style={styles.catItemQty}>{it['остаток']} {it.unit}</Text>
                      </View>
                    ))}
                    <Pressable
                      style={[styles.catDeleteBtn, { marginTop: 16 }]}
                      onPress={() => {
                        if (itemsInCat.length === 0) { setCatModal2(null); return; }
                        setCatDeletePrompt({ name: catModal2.oldName, count: itemsInCat.length, moveTo: '' });
                      }}
                    >
                      <Text style={styles.catDeleteTxt}>Удалить категорию</Text>
                    </Pressable>
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Удаление категории — перенос позиций в другую */}
      <Modal visible={!!catDeletePrompt} transparent animationType="fade" onRequestClose={() => setCatDeletePrompt(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setCatDeletePrompt(null)} />
          <View style={[styles.catModalBox, { maxHeight: '60%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Куда перенести позиции?</Text>
              <Pressable onPress={() => setCatDeletePrompt(null)} hitSlop={14} style={styles.modalClose}>
                <Text style={styles.modalCloseTxt}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={styles.sectionLabel}>
                В категории «{catDeletePrompt?.name}» — {catDeletePrompt?.count} {catDeletePrompt?.count === 1 ? 'позиция' : 'позиций'}. Выберите, куда их перенести, прежде чем удалить категорию.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {stockCats.filter(c => c !== catDeletePrompt?.name).map(c => (
                  <Pressable
                    key={c}
                    style={[styles.catChip, catDeletePrompt?.moveTo === c && styles.catChipActive]}
                    onPress={() => setCatDeletePrompt(p => ({ ...p, moveTo: c }))}
                  >
                    <Text style={[styles.catChipTxt, catDeletePrompt?.moveTo === c && styles.catChipTxtActive]}>{c}</Text>
                  </Pressable>
                ))}
                <Pressable
                  style={[styles.catChip, catDeletePrompt?.moveTo === 'Прочее' && styles.catChipActive]}
                  onPress={() => setCatDeletePrompt(p => ({ ...p, moveTo: 'Прочее' }))}
                >
                  <Text style={[styles.catChipTxt, catDeletePrompt?.moveTo === 'Прочее' && styles.catChipTxtActive]}>Прочее</Text>
                </Pressable>
              </View>
              <Pressable
                style={[styles.catDeleteBtn, { marginTop: 20 }]}
                onPress={() => {
                  if (!catDeletePrompt?.moveTo) { toast.show('Выберите категорию', 'warn'); return; }
                  try {
                    const db = getDb();
                    db.runSync(`UPDATE stock SET category = ? WHERE category = ?`, [catDeletePrompt.moveTo, catDeletePrompt.name]);
                    const allStock = getAllStock();
                    setStock(allStock);
                    setStockCats([...new Set(allStock.map(s => s.category || 'Без категории'))].sort());
                    setCatDeletePrompt(null);
                    setCatModal2(null);
                    toast.show('Категория удалена, позиции перенесены', 'info');
                  } catch (e) { console.error(e); }
                }}
              >
                <Text style={styles.catDeleteTxt}>Перенести и удалить категорию</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1 },
  left:   { flex: 1, backgroundColor: colors.surface },
  right:  { flex: 1, backgroundColor: colors.bg },

  emptyRight:    { flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.3 },
  emptyRightTxt: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted, marginTop: 12 },
  detailTitle:   { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 16 },

  inner: { paddingBottom: 24 },

  filterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingBottom: 10, gap: 8,
  },
  filterChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: 'rgba(217,95,95,0.1)', borderColor: 'rgba(217,95,95,0.4)' },
  filterChipTxt: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  filterChipTxtActive: { color: colors.red },
  viewSwitch: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  viewSwitchBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  viewSwitchBtnActive: { backgroundColor: 'rgba(240,160,80,0.12)' },
  viewSwitchTxt: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted },
  viewSwitchTxtActive: { color: colors.orange },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    padding: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.family,
  },
  catBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  catChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  catChipActive: { backgroundColor: 'rgba(240,160,80,0.12)', borderColor: 'rgba(240,160,80,0.5)' },
  catCountTxt: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  catItemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  catItemName: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.text },
  catItemQty: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  catDeleteBtn: { backgroundColor: 'rgba(160,16,32,0.06)', borderWidth: 1, borderColor: 'rgba(160,16,32,0.35)', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  deleteItemBtn: { marginTop: 20, marginBottom: 8, paddingVertical: 13, alignItems: 'center', borderRadius: 12, backgroundColor: 'rgba(160,16,32,0.06)', borderWidth: 1, borderColor: 'rgba(160,16,32,0.3)' },
  deleteItemTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red },
  cancelBtn: { paddingVertical: 13, alignItems: 'center', borderRadius: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  cancelTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  catDeleteTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red },
  catChipTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  catChipTxtActive: { color: colors.orange },
  catBtnText: { fontSize: 16, color: colors.muted },
  addStockBtn: { paddingHorizontal: 12, height: 38, borderRadius: 10, backgroundColor: 'rgba(240,160,80,0.1)', borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)', alignItems: 'center', justifyContent: 'center' },
  addStockBtnText: { fontSize: 13, color: colors.orange, fontFamily: fonts.familySemibold },

  catGroup: { marginTop: 24, paddingHorizontal: spacing.lg },
  lowSheetSectionTitle: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.red, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },

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
  curAvgVal: { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: colors.text },

  modeList:   { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(64,60,55,0.25)' },
  modeRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.surface2 },
  modeRowDiv: { borderBottomWidth: 1, borderBottomColor: 'rgba(64,60,55,0.18)' },
  modeLabel:  { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text, marginBottom: 2 },
  modeDesc:   { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
  modeArrow:  { fontSize: 18, color: colors.muted },
  modeRowActive: { backgroundColor: 'rgba(240,160,80,0.08)' },

  slidePanel: { overflow: 'hidden', borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: colors.surface },
  slidePanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  slidePanelTitle: { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text },
  slidePanelClose: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  slidePanelCloseTxt: { fontSize: 13, color: colors.muted, fontFamily: fonts.familySemibold },
  slidePanelDesc: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginBottom: 12 },
  backToDetailBtn: { paddingVertical: 8, marginBottom: 4 },
  backToDetailTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orange },

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
