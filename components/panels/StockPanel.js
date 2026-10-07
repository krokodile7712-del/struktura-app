import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Modal, Animated, LayoutAnimation,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  getAllStock, getStockForWarehouse, getStockByWarehouses, getWarehouses, getWorkContext, isLocationsOn, addPurchase, adjustStock, setStockSellPrice,
  insertStockItem, getAvgCostLast10, getProductsUsingStockName, deleteStockItem,
  updateStockThreshold,
} from '../../db/queries';
import WarehouseMenu from '../WarehouseMenu';
import TransferModal from '../TransferModal';
import PurchaseInvoiceModal from '../PurchaseInvoiceModal';
import { TransfersModal, PurchaseListModal } from '../WarehouseLists';
import { getDb } from '../../db/database';
import { can } from '../../db/session';
import { Share } from 'react-native';
import { colors, fonts, spacing, glass } from '../../constants/theme';
import { useToast } from '../Toast';
import Sheet from '../Sheet';
import GlassSurface from '../GlassSurface';
import Icon from '../Icon';
import { useResponsive } from '../../hooks/useResponsive';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { useTourHighlight } from '../TourRegistry';
import InfoTip from '../InfoTip';
import UnitPicker from '../UnitPicker';
import FitView from '../FitView';
import KeyboardSafe from '../KeyboardSafe';

// Число из поля ввода: понимает и запятую, и точку («0,5» раньше читалось как 0)
const parseNum = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, ''));
  return isNaN(n) ? 0 : n;
};
const fmtNum = (n) => (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 3 });
const toField = (n) => String(Math.round(n * 1000) / 1000).replace('.', ',');
// Состояние позиции: «в минусе» / «скоро закончится» (остаток не выше порога) / «в норме»
const statusOf = (item) => {
  const q = item['остаток'] ?? 0;
  const t = item['порог'] || 0;
  return q < 0 ? 'neg' : (t > 0 && q <= t ? 'low' : 'ok');
};

const MODES = [
  { key: 'purchase', label: 'Закупка',    desc: 'Принять с ценой',      icon: 'cart',   primary: true },
  { key: 'add',      label: 'Добавить',   desc: 'Пополнить остаток',    icon: 'plus' },
  { key: 'subtract', label: 'Списать',    desc: 'Брак, расход',         icon: 'minus' },
  { key: 'set',      label: 'Установить', desc: 'Точное значение',      icon: 'pencil' },
];

// Действие со склада — стеклянная плитка с объёмом (как способы оплаты на Кассе)
function ActionTile({ icon, title, sub, primary, onPress }) {
  return (
    <Pressable style={({ pressed }) => [styles.actWrap, pressed && { transform: [{ scale: 0.97 }] }]} onPress={onPress} accessibilityRole="button">
      <GlassSurface
        radius={16} floating shadowScale={0.4}
        tint={primary ? '127,168,217' : '150,172,204'}
        alpha={primary ? 0.30 : 0.14}
        sheen={primary ? ['rgba(255,255,255,0.30)', 'rgba(255,255,255,0.03)'] : ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.01)']}
        rimColors={primary
          ? { top: 'rgba(210,230,252,0.75)', left: 'rgba(180,208,240,0.5)', right: 'rgba(157,191,230,0.38)', bottom: 'rgba(157,191,230,0.22)' }
          : { top: 'rgba(255,255,255,0.30)', left: 'rgba(255,255,255,0.16)', right: 'rgba(255,255,255,0.10)', bottom: 'rgba(255,255,255,0.05)' }}
        contentStyle={styles.actInner}
      >
        <LinearGradient
          pointerEvents="none"
          colors={primary ? ['rgba(127,168,217,0)', 'rgba(127,168,217,0.34)'] : ['rgba(0,0,0,0)', 'rgba(0,0,0,0.28)']}
          start={{ x: 0, y: 0.4 }} end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
        />
        <View style={[styles.actIcon, primary && styles.actIconPri]}>
          <Icon name={icon} size={22} color={primary ? colors.orangeLight : colors.textDim} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.actTitle, primary && { color: colors.orangeLight }]}>{title}</Text>
          <Text style={styles.actSub}>{sub}</Text>
        </View>
      </GlassSurface>
    </Pressable>
  );
}

function FilterChip({ label, on, onPress, count, tone }) {
  return (
    <Pressable style={[styles.fChip, on && styles.fChipOn]} onPress={onPress}>
      <Text style={[styles.fChipTxt, on && styles.fChipTxtOn]}>{label}</Text>
      {count != null && <Text style={[styles.fChipCnt, { color: tone === 'danger' ? colors.red : colors.warning }]}>{count}</Text>}
    </Pressable>
  );
}

function StatusPill({ status }) {
  const txt = status === 'neg' ? 'В минусе' : status === 'low' ? 'Скоро закончится' : 'В норме';
  const color = status === 'neg' ? colors.red : status === 'low' ? colors.warning : colors.green;
  const border = status === 'neg' ? 'rgba(219,129,120,0.45)' : status === 'low' ? 'rgba(217,172,98,0.45)' : 'rgba(120,183,150,0.4)';
  return (
    <View style={[styles.pill, { borderColor: border }]}>
      <Text style={[styles.pillTxt, { color }]}>{txt}</Text>
    </View>
  );
}

// Единая реализация Склада — используется и отдельным экраном (StockScreen),
// и встроенной панелью внутри Admin/Dashboard (раньше это были два отдельных
// файла с продублированной логикой, из-за чего они периодически расходились).
export default function StockPanel({ navigation, openCreateSignal, hideOwnCreateButton, onSelectedChange }) {
  const stockSearchHighlight = useTourHighlight('products.stock.search');
  const stockItemHighlight   = useTourHighlight('products.stock.item');
  const stockLowHighlight    = useTourHighlight('products.stock.low');
  const { isLandscape } = useResponsive();
  const toast = useToast();
  const reduceMotion = useReduceMotion();
  const [stock, setStock]           = useState([]);
  const [search, setSearch]         = useState('');
  const [viewMode, setViewMode]     = useState('categories'); // categories | list
  const [statusFilter, setStatusFilter] = useState('all');    // all | low | neg
  const [selected, setSelected]     = useState(null);
  const editorFadeAnim = useRef(new Animated.Value(0)).current;

  // Плавное появление карточки при выборе позиции (альбомная)
  useEffect(() => {
    if (selected) {
      editorFadeAnim.setValue(reduceMotion ? 1 : 0);
      if (!reduceMotion) Animated.timing(editorFadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    }
  }, [selected?.id]);
  useEffect(() => { onSelectedChange?.(!!selected); }, [selected]);
  const [mode, setMode]             = useState(null);
  const [qty, setQty]               = useState('');
  const [price, setPrice]           = useState('');   // сумма закупки
  const [sellDraft, setSellDraft]   = useState('');   // цена за единицу при расходе по факту (черновик поля)
  const [thrDraft, setThrDraft]     = useState(null); // порог в редактировании (null — не редактируется)
  const [avgCost, setAvgCost]       = useState(0);
  const [deletePrompt, setDeletePrompt] = useState(null); // {id, name, usedIn: [{id,name}]}
  // Склады: выбранный склад (0 — все склады), остатки позиции по складам, меню склада и окна действий
  const [whs, setWhs]               = useState([]);
  const [whId, setWhId]             = useState(() => { try { return getWorkContext().warehouseId; } catch (_) { return 0; } });
  const [locEnabled, setLocEnabled] = useState(() => { try { return isLocationsOn(); } catch (_) { return false; } });
  const [byWh, setByWh]             = useState({});
  const [menuAt, setMenuAt]         = useState(null);
  const [trModal, setTrModal]       = useState(null);     // { fromId, toId, preset }
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [histOpen, setHistOpen]     = useState(false);
  const [buyOpen, setBuyOpen]       = useState(false);
  const [opWid, setOpWid]           = useState(null);     // склад операции (закупка/списание/пересчёт)
  const whBtnRef = useRef(null);
  const [catModal, setCatModal]     = useState(false);
  const [newItemModal, setNewItemModal] = useState(null); // { name, unit, category, threshold }
  const [stockCats, setStockCats]   = useState([]);
  const [catModal2, setCatModal2]   = useState(null); // {oldName, newName}
  const [catDeletePrompt, setCatDeletePrompt] = useState(null); // {name, count, moveTo}

  const animate = () => { if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.create(240, 'easeInEaseOut', 'opacity')); };

  const openMode = (key) => { animate(); setMode(key); setQty(''); setPrice(''); try { setOpWid(whId || getWorkContext().warehouseId); } catch (_) {} };
  const closeSlidePanel = () => { animate(); setMode(null); setQty(''); setPrice(''); };

  // Остатки: выбранного склада, а при «Все склады» — общие (они всегда равны сумме по складам).
  // Раньше список всегда показывал общий остаток, поэтому после операции в локации число на экране не менялось.
  const readStock = (on = locEnabled, wid = whId) => (wid ? getStockForWarehouse(wid) : getAllStock());
  const applyStock = (rows, keepId) => {
    setStock(rows);
    try { setByWh(getStockByWarehouses()); } catch (_) {}
    setStockCats([...new Set(rows.map(s => s.category || 'Без категории'))].sort());
    if (keepId != null) {
      const u = rows.find(s => s.id === keepId);
      if (u) { setSelected(u); try { setAvgCost(getAvgCostLast10(u.name)); } catch (_) {} }
      else setSelected(null);
    }
  };
  const reload = (keepId = selected?.id ?? null, on, loc) => { try { applyStock(readStock(on, loc), keepId); } catch (e) { console.error(e); } };

  useEffect(() => {
    try {
      const on = isLocationsOn(), ctx = getWorkContext();
      setLocEnabled(on); setWhs(getWarehouses()); setWhId(ctx.warehouseId);
      applyStock(readStock(on, ctx.warehouseId), null);
    } catch (e) { console.error(e); }
  }, []);

  // При возврате на экран остатки перечитываются: за это время могли пройти продажи
  useFocusEffect(useCallback(() => { reload(); }, [locEnabled, whId]));

  useEffect(() => {
    if (openCreateSignal) setNewItemModal({ name: '', unit: 'шт', category: '', threshold: '', initialStock: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCreateSignal]);

  const saveNewItem = () => {
    if (!newItemModal?.name?.trim()) return;
    const res = insertStockItem({
      name: newItemModal.name,
      unit: newItemModal.unit?.trim() || 'шт',
      category: newItemModal.category?.trim() || 'Прочее',
      threshold: parseNum(newItemModal.threshold),
      initialQty: parseNum(newItemModal.initialStock),
      warehouseId: whId || undefined,
    });
    if (!res.ok) { toast.show(res.error, 'warn'); return; }
    setNewItemModal(null);
    reload(res.id);
    const created = readStock().find(s => s.id === res.id);
    if (created) selectItem(created);
  };

  const whName = whId ? (whs.find(w => w.id === whId)?.name || '') : 'Все склады';
  const openWhMenu = () => {
    try { whBtnRef.current.measureInWindow((x, y, w, h) => setMenuAt({ top: y + h + 6, left: x, width: w })); } catch (_) { setMenuAt({ top: 200, left: 40, width: 420 }); }
  };
  const menuActions = [
    { key: 'move', icon: '⇄', label: 'Переместить остатки…', hint: whId ? '' : 'выберите склад', disabled: !whId || !can('edit_stock') },
    { key: 'invoice', icon: '＋', label: 'Закупка списком (накладная)', disabled: !can('edit_stock') },
    { key: 'history', icon: '⏱', label: 'История перемещений' },
    { key: 'buy', icon: '🛒', label: 'Список для закупки' },
    { key: 'share', icon: '↗', label: 'Поделиться остатками' },
    { key: 'inv', icon: '☑', label: 'Инвентаризация этого склада', hint: whId ? '' : 'выберите склад', disabled: !whId },
    { key: 'cfg', icon: '⚙', label: 'Настроить склады', hint: 'в Настройках' },
  ];
  const onMenuAction = (key) => {
    const act = menuActions.find(a => a.key === key);
    if (act?.disabled) { toast.show(act.hint || 'Недоступно', 'info'); return; }
    setMenuAt(null);
    if (key === 'move') setTrModal({ fromId: whId, toId: null, preset: null });
    else if (key === 'invoice') setInvoiceOpen(true);
    else if (key === 'history') setHistOpen(true);
    else if (key === 'buy') setBuyOpen(true);
    else if (key === 'share') {
      const lines = stock.filter(s => (s['остаток'] || 0) !== 0).map(s => `• ${s.name} — ${fmtNum(s['остаток'])} ${s.unit}`);
      Share.share({ message: `Остатки · ${whName}\n${lines.join('\n') || 'Пусто'}` }).catch(() => {});
    }
    else if (key === 'inv') navigation?.navigate?.('Inventory', { warehouseId: whId });
    else if (key === 'cfg') navigation?.navigate?.('Settings', { section: 'locations' });
  };

  const selectItem = (item) => {
    animate();
    setSelected(item);
    setMode(null);
    setQty('');
    setPrice('');
    setThrDraft(null);
    setSellDraft(item.sell_price > 0 ? toField(item.sell_price) : '');
    try { setAvgCost(getAvgCostLast10(item.name)); } catch (_) { setAvgCost(0); }
  };

  // Цена за единицу при «расходе по факту»
  const saveSellPrice = () => {
    if (!selected) return;
    const empty = String(sellDraft).trim() === '';
    const p = empty ? 0 : parseNum(sellDraft);
    if (!empty && (!isFinite(p) || p < 0)) { toast.show('Введите цену числом', 'warn'); return; }
    try {
      setStockSellPrice(selected.id, p);
      reload(selected.id);
      toast.show(p > 0 ? `Цена ${fmtNum(p)} ₽ за ${selected.unit} сохранена` : 'Цена за единицу снята', 'info');
    } catch (e) { console.error(e); toast.show('Не удалось сохранить цену', 'warn'); }
  };

  // Порог «скоро закончится» — раньше задавался только при создании позиции и потом не менялся
  const saveThreshold = () => {
    if (!selected || thrDraft === null) return;
    const t = String(thrDraft).trim() === '' ? 0 : parseNum(thrDraft);
    if (!isFinite(t) || t < 0) { toast.show('Введите порог числом', 'warn'); return; }
    try {
      updateStockThreshold(selected.id, t);
      setThrDraft(null);
      reload(selected.id);
      toast.show(t > 0 ? `Порог ${fmtNum(t)} ${selected.unit} сохранён` : 'Порог снят', 'info');
    } catch (e) { console.error(e); toast.show('Не удалось сохранить порог', 'warn'); }
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
    reload(null);
  };

  // Ввод количества: цифры, запятая, точка
  const onQtyChange = (v) => setQty(String(v).replace(/[^0-9.,]/g, ''));
  const onPriceChange = (v) => setPrice(String(v).replace(/[^0-9.,]/g, ''));
  const stepQty = (delta) => setQty(toField(Math.max(0, parseNum(qty) + delta)));

  // Остаток для расчёта «Станет»: при операции — на складе операции, иначе — как в списке
  const curQty = mode && opWid && selected ? (byWh[selected.id]?.[opWid] ?? 0) : (selected?.['остаток'] ?? 0);
  const nQty = parseNum(qty);
  const nSum = parseNum(price);
  // «Станет»: считается от текущего остатка; списание больше остатка уводит в минус (как и продажа), но с предупреждением
  const previewQty = mode === 'set' ? nQty : mode === 'subtract' ? curQty - nQty : curQty + nQty;
  const previewStatus = previewQty < 0 ? 'neg' : ((selected?.['порог'] || 0) > 0 && previewQty <= selected['порог'] ? 'low' : 'ok');
  const canConfirm = !!mode && (
    mode === 'set' ? qty !== '' && isFinite(nQty) && nQty >= 0
    : mode === 'purchase' ? nQty > 0 && nSum > 0
    : nQty > 0
  );
  const actionLabel = !canConfirm ? 'Применить'
    : `${({ purchase: 'Принять', add: 'Добавить', subtract: 'Списать', set: 'Установить' })[mode]} ${fmtNum(nQty)} ${selected?.unit || ''}`.trim();
  const hintText = mode === 'purchase'
    ? (nQty > 0 && nSum > 0
        ? `≈ ${fmtNum(nSum / nQty)} ₽ за ${selected?.unit}. Сумма автоматически попадёт в «Расходы» (категория «Закупка»).`
        : nQty > 0 ? 'Укажите сумму закупки — или выберите «Добавить», если цена неизвестна.' : 'Введите количество и сумму закупки.')
    : mode === 'subtract' && nQty > curQty
      ? `Списываем больше, чем есть: остаток уйдёт в минус на ${fmtNum(nQty - Math.max(curQty, 0))} ${selected?.unit}.`
      : mode === 'set' ? 'Остаток станет ровно таким.' : '';

  const confirm = () => {
    if (!selected || !canConfirm) return;
    try {
      const wid = opWid || whId || getWorkContext().warehouseId;
      if (mode === 'purchase') {
        addPurchase(selected.name, nQty, nSum / nQty, wid);
        toast.show(`Закупка записана · расход ${fmtNum(nSum)} ₽ добавлен`, 'info');
      } else {
        adjustStock({ stockId: selected.id, mode, qty: nQty, warehouseId: wid });
        toast.show('Остаток обновлён', 'info');
      }
      setMode(null); setQty(''); setPrice('');
      reload(selected.id);
    } catch (e) {
      console.error(e);
      toast.show('Не удалось сохранить: ничего не записано, попробуйте ещё раз', 'warn');
    }
  };

  const counts = {
    low: stock.filter(i => statusOf(i) === 'low').length,
    neg: stock.filter(i => statusOf(i) === 'neg').length,
  };
  const filtered = stock.filter(i =>
    (!search.trim() || i.name?.toLowerCase().includes(search.toLowerCase())) &&
    (statusFilter === 'all' || statusOf(i) === statusFilter)
  );
  const cats = [...new Set(filtered.map(i => i.category || 'Без категории'))].sort();

  const renderRow = (item, first, highlightFirst) => {
    const cur = item['остаток'] ?? 0;
    const thr = item['порог'] || 0;
    const st = statusOf(item);
    const active = selected?.id === item.id;
    return (
      <Pressable
        key={item.id}
        style={({ pressed }) => [
          styles.row2, !first && styles.rowDiv2, active && styles.rowActive2,
          pressed && { backgroundColor: 'rgba(255,255,255,0.03)' },
          highlightFirst && { position: 'relative' }, highlightFirst && stockItemHighlight.style,
        ]}
        onPress={() => can('view_stock') && selectItem(item)}
      >
        {active && <View style={styles.rowBar2} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rName} numberOfLines={1}>{item.name}</Text>
          {thr > 0 && <Text style={styles.rThr}>порог {fmtNum(thr)} {item.unit}</Text>}
        </View>
        <Text style={[styles.rQty, st === 'low' && { color: colors.warning }, st === 'neg' && { color: colors.red }]}>
          {fmtNum(cur)}<Text style={styles.rUnit}> {item.unit}</Text>
        </Text>
        {highlightFirst && stockItemHighlight.overlay}
      </Pressable>
    );
  };


  // ── Правая часть: редактор операции или карточка позиции ──
  const editorContent = selected && mode ? (
    <View style={{ flex: 1 }}>
      <View style={styles.edHead}>
        <Pressable onPress={closeSlidePanel} hitSlop={10}><Text style={styles.edBack}>‹ Назад</Text></Pressable>
        <Text style={styles.edTitle}>{MODES.find(m => m.key === mode)?.label}</Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
        {locEnabled && whs.length > 1 && (
          <View style={{ marginBottom: 10 }}>
            <Text style={styles.fldLbl}>{mode === 'purchase' ? 'Придёт на склад' : 'Склад'}</Text>
            <View style={styles.whRow}>{whs.map(w => (
              <Pressable key={w.id} style={[styles.whChip, opWid === w.id && styles.whChipOn]} onPress={() => setOpWid(w.id)}>
                <Text style={[styles.whChipT, opWid === w.id && { color: colors.orangeLight }]}>{new Set(whs.map(x => x.location_name)).size > 1 ? `${w.location_name} · ${w.name}` : w.name}</Text></Pressable>))}</View>
          </View>
        )}
        <View style={styles.fld}>
          <Text style={styles.fldLbl}>Количество</Text>
          <TextInput
            style={styles.fldInput} value={qty} onChangeText={onQtyChange}
            keyboardType="decimal-pad" placeholder="0" placeholderTextColor="rgba(255,255,255,0.22)" autoFocus
          />
          <Text style={styles.fldUnit}>{selected.unit}</Text>
          <Pressable style={styles.stepBtn} onPress={() => stepQty(-1)} hitSlop={6}><Icon name="minus" size={20} color={colors.textDim} /></Pressable>
          <Pressable style={styles.stepBtn} onPress={() => stepQty(1)} hitSlop={6}><Icon name="plus" size={20} color={colors.textDim} /></Pressable>
        </View>
        {mode !== 'set' && (
          <View style={styles.qdRow}>
            {[1, 5, 10].map(v => (
              <Pressable key={v} style={styles.qdChip} onPress={() => stepQty(v)}>
                <Text style={styles.qdTxt}>+{v}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {mode === 'purchase' && (
          <View style={styles.fld}>
            <Text style={styles.fldLbl}>Сумма закупки</Text>
            <TextInput
              style={styles.fldInput} value={price} onChangeText={onPriceChange}
              keyboardType="decimal-pad" placeholder="0" placeholderTextColor="rgba(255,255,255,0.22)"
            />
            <Text style={styles.fldUnit}>₽</Text>
          </View>
        )}
        <GlassSurface radius={18} padding={18}>
          <View style={styles.preRow}>
            <Text style={styles.preLbl}>Станет</Text>
            <Text style={[styles.preVal, previewStatus === 'low' && { color: colors.warning }, previewStatus === 'neg' && { color: colors.red }]}>
              {fmtNum(previewQty)}<Text style={styles.heroUnit}> {selected.unit}</Text>
            </Text>
          </View>
        </GlassSurface>
        {!!hintText && (
          <Text style={[styles.hint2, mode === 'subtract' && nQty > curQty && { color: colors.warning }, mode === 'purchase' && nQty > 0 && nSum > 0 && { color: colors.green }]}>
            {hintText}
          </Text>
        )}
      </ScrollView>
      <Pressable
        style={({ pressed }) => [styles.confirm2, !canConfirm && styles.confirm2Off, pressed && canConfirm && { transform: [{ scale: 0.98 }] }]}
        onPress={confirm} disabled={!canConfirm}
      >
        <Text style={styles.confirm2Txt}>{actionLabel}</Text>
      </Pressable>
    </View>
  ) : null;

  const cardContent = selected && !mode ? (() => {
    const st = statusOf(selected);
    const thr = selected['порог'] || 0;
    const canThr = can('edit_thresholds');
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
        <View style={styles.dHead}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.dTitle} numberOfLines={2}>{selected.name}</Text>
            {thrDraft === null ? (
              <Pressable disabled={!canThr} onPress={() => setThrDraft(thr > 0 ? toField(thr) : '')} hitSlop={6}>
                <Text style={styles.dSub}>
                  {selected.category || 'Без категории'}{thr > 0 ? ` · порог ${fmtNum(thr)} ${selected.unit}` : (canThr ? ' · задать порог' : '')}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.thrEdit}>
                <TextInput style={styles.thrInput} value={thrDraft} onChangeText={v => setThrDraft(String(v).replace(/[^0-9.,]/g, ''))}
                  keyboardType="decimal-pad" placeholder="Порог" placeholderTextColor={colors.muted} autoFocus />
                <Text style={styles.dSub}>{selected.unit}</Text>
                <Pressable style={styles.miniBtn} onPress={saveThreshold}><Icon name="check" size={18} color={colors.orangeLight} /></Pressable>
                <Pressable style={[styles.miniBtn, { backgroundColor: 'rgba(255,255,255,0.06)' }]} onPress={() => setThrDraft(null)}><Icon name="x" size={18} color={colors.textDim} /></Pressable>
              </View>
            )}
          </View>
          <StatusPill status={st} />
        </View>

        <GlassSurface radius={glass.radius.tile} style={{ marginBottom: 12 }}>
          <View style={styles.stripe2} />
          <View style={{ paddingVertical: 20, paddingLeft: 26, paddingRight: 22 }}>
            <Text style={styles.tileLbl}>Текущий остаток</Text>
            <Text style={[styles.heroVal, st === 'low' && { color: colors.warning }, st === 'neg' && { color: colors.red }]}>
              {fmtNum(curQty)}<Text style={styles.heroUnit}> {selected.unit}</Text>
            </Text>
          </View>
        </GlassSurface>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <GlassSurface radius={glass.radius.tile} padding={16} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.tileLbl}>Себестоимость</Text>
              <InfoTip title="Себестоимость" text="Средняя цена за единицу по последним 10 закупкам этой позиции (закупки без цены не учитываются). Считается автоматически и в карточке, и в техкартах. Если закупок ещё не было — прочерк, пока не оформите первую («Закупка»)." />
            </View>
            <Text style={styles.tileVal}>{avgCost > 0 ? `${fmtNum(avgCost)} ₽/${selected.unit}` : '—'}</Text>
            <Text style={styles.tileSmall}>по последним 10 закупкам</Text>
          </GlassSurface>
          <GlassSurface radius={glass.radius.tile} padding={16} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.tileLbl}>Цена за ед.</Text>
              <InfoTip title="Цена за единицу" text="Сколько клиент платит за единицу этого материала при «расходе по факту» на Кассе: итог позиции = базовая цена + количество × эта цена. Если цена 0 — материал спишется со склада, но в счёт не попадёт. На цену обычных товаров не влияет — она задаётся в разделе «Товары»." />
            </View>
            <View style={styles.sellRow}>
              <TextInput
                style={styles.sellInput} value={sellDraft}
                onChangeText={v => setSellDraft(String(v).replace(/[^0-9.,]/g, ''))}
                keyboardType="decimal-pad" placeholder="0" placeholderTextColor="rgba(255,255,255,0.22)"
                editable={can('edit_stock')}
              />
              <Text style={[styles.fldUnit, { fontSize: 15, minWidth: 0, marginRight: 8 }]}>₽/{selected.unit}</Text>
              {can('edit_stock') && (
                <Pressable style={styles.miniBtn} onPress={saveSellPrice} hitSlop={6}><Icon name="check" size={18} color={colors.orangeLight} /></Pressable>
              )}
            </View>
            <Text style={styles.tileSmall}>при расходе по факту</Text>
          </GlassSurface>
        </View>

        {locEnabled && whs.length > 1 && (
          <View style={{ marginTop: 14 }}>
            <Text style={styles.tileLbl}>По складам</Text>
            {whs.map(w => {
              const have = byWh[selected.id]?.[w.id] ?? 0, here = whId && w.id !== whId && have > 0 && curQty <= thr;
              return (
                <View key={w.id} style={styles.bq}>
                  <Text style={styles.bqN} numberOfLines={1}>{w.name}<Text style={styles.bqL}>  {w.location_name}</Text></Text>
                  <Text style={styles.bqV}>{fmtNum(have)} {selected.unit}</Text>
                  {here && can('edit_stock') && (
                    <Pressable style={styles.bqGo} onPress={() => setTrModal({ fromId: w.id, toId: whId, preset: { stockId: selected.id, qty: Math.min(have, Math.max(0, Math.ceil((thr * 2 - curQty) * 10) / 10) || have) } })}>
                      <Text style={styles.bqGoT}>Взять сюда</Text></Pressable>)}
                </View>);
            })}
            {whId > 0 && curQty <= thr && thr > 0 && <Text style={styles.lockNote}>На складе «{whs.find(w => w.id === whId)?.name}» не хватает. Продажи сами не берут с других складов — нажмите «Взять сюда», чтобы переместить.</Text>}
          </View>
        )}

        {!can('edit_stock') ? (
          <Text style={styles.lockNote}>Изменение остатков недоступно — попросите администратора выдать право «Редактирование склада».</Text>
        ) : (
          <View style={styles.actGrid}>
            {MODES.filter(m => m.key !== 'set' || can('edit_thresholds')).map(m => (
              <ActionTile key={m.key} icon={m.icon} title={m.label} sub={m.desc} primary={m.primary} onPress={() => openMode(m.key)} />
            ))}
          </View>
        )}

        {can('edit_stock') && (
          <Pressable onPress={requestDelete} style={{ alignSelf: 'flex-end', marginTop: 18 }}>
            <Text style={styles.delLink}>Удалить позицию</Text>
          </Pressable>
        )}
      </ScrollView>
    );
  })() : null;

  const detailContent = editorContent || cardContent;

  return (
    <View style={[styles.layout2, isLandscape && { flexDirection: 'row' }]}>

      {/* Список — карточкой слева (альбомная) или на всю ширину (портрет) */}
      <View style={[styles.lcard, isLandscape && styles.lcardLand]}>

        <View style={[styles.toolbar, { position: 'relative' }, stockSearchHighlight.style]}>
          <View style={styles.searchBox}>
            <Icon name="search" size={20} color={colors.muted} />
            <TextInput
              style={styles.searchInput2} value={search} onChangeText={setSearch}
              placeholder="Поиск" placeholderTextColor={colors.muted}
            />
          </View>
          {!hideOwnCreateButton && (
            <Pressable
              style={({ pressed }) => [styles.addBtn2, pressed && { opacity: 0.88 }]}
              onPress={() => setNewItemModal({ name: '', unit: 'шт', category: '', threshold: '', initialStock: '' })}
            >
              <Icon name="plus" size={18} color={colors.onAccent} />
              <Text style={styles.addBtn2Txt}>Позиция</Text>
            </Pressable>
          )}
          <Pressable style={styles.gearBtn} onPress={() => setCatModal(true)} accessibilityLabel="Категории склада">
            <Icon name="gear" size={20} color={colors.textDim} />
          </Pressable>
          {stockSearchHighlight.overlay}
        </View>

        {locEnabled && whs.length > 0 && (
          <Pressable ref={whBtnRef} collapsable={false} style={styles.whBtn} onPress={openWhMenu}>
            <Text style={styles.whK}>Склад</Text>
            <Text style={styles.whV} numberOfLines={1}>{whId ? whs.find(w => w.id === whId)?.name : 'Все склады'}</Text>
            <Text style={styles.whS}>{whId ? whs.find(w => w.id === whId)?.location_name : 'сумма по всем'}</Text>
            <Text style={styles.whC}>▾</Text>
          </Pressable>
        )}

        {stock.length > 0 && (
          <View style={styles.chipsRow}>
            <FilterChip label="Все" on={statusFilter === 'all'} onPress={() => setStatusFilter('all')} />
            <View style={{ position: 'relative' }}>
              <FilterChip label="Заканчивается" on={statusFilter === 'low'} count={counts.low} tone="warn" onPress={() => setStatusFilter(f => f === 'low' ? 'all' : 'low')} />
              {stockLowHighlight.overlay}
            </View>
            <FilterChip label="В минусе" on={statusFilter === 'neg'} count={counts.neg} tone="danger" onPress={() => setStatusFilter(f => f === 'neg' ? 'all' : 'neg')} />
            <View style={styles.vSwitch}>
              <Pressable style={[styles.vSwitchBtn, viewMode === 'categories' && styles.vSwitchOn]} onPress={() => setViewMode('categories')} accessibilityLabel="По категориям">
                <Icon name="grid" size={16} color={viewMode === 'categories' ? colors.orangeLight : colors.muted} />
              </Pressable>
              <Pressable style={[styles.vSwitchBtn, viewMode === 'list' && styles.vSwitchOn]} onPress={() => setViewMode('list')} accessibilityLabel="Списком">
                <Icon name="rows" size={16} color={viewMode === 'list' ? colors.orangeLight : colors.muted} />
              </Pressable>
            </View>
          </View>
        )}

        {stock.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIco}><Icon name="package" size={34} color={colors.textDim} /></View>
            <Text style={styles.emptyTitle}>Склад пуст</Text>
            <Text style={styles.emptyText}>Добавьте первую позицию — то, что физически заканчивается: ингредиенты, расходники, товары для перепродажи.</Text>
            {!hideOwnCreateButton && (
              <Pressable style={({ pressed }) => [styles.emptyCta, pressed && { opacity: 0.88 }]}
                onPress={() => setNewItemModal({ name: '', unit: 'шт', category: '', threshold: '', initialStock: '' })}>
                <Icon name="plus" size={18} color={colors.onAccent} />
                <Text style={styles.emptyCtaTxt}>Добавить позицию</Text>
              </Pressable>
            )}
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyBox}><Text style={styles.emptyText}>{search ? 'Ничего не найдено' : 'В этой группе позиций нет'}</Text></View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {viewMode === 'categories' ? cats.map((cat, ci) => {
              const items = filtered.filter(i => (i.category || 'Без категории') === cat);
              return (
                <View key={cat}>
                  <View style={styles.grpHead}><Text style={styles.grpName}>{cat}</Text><Text style={styles.grpCnt}>{items.length}</Text></View>
                  <View style={styles.grpCard}>
                    {items.map((it, idx) => renderRow(it, idx === 0, ci === 0 && idx === 0))}
                  </View>
                </View>
              );
            }) : (
              <View style={[styles.grpCard, { marginTop: 8 }]}>
                {[...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru')).map((it, idx) => renderRow(it, idx === 0, idx === 0))}
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {isLandscape ? (
        /* Правая карточка: позиция или подсказка */
        <View style={styles.rcard}>
          {selected ? (
            <Animated.View style={{ flex: 1, opacity: editorFadeAnim }}>{detailContent}</Animated.View>
          ) : (
            <View style={[styles.emptyBox, { opacity: 0.7 }]}>
              <View style={styles.emptyIco}><Icon name="package" size={34} color={colors.textDim} /></View>
              <Text style={[styles.emptyTitle, { fontSize: 17, color: colors.textDim, marginBottom: 0 }]}>Выберите позицию</Text>
            </View>
          )}
        </View>
      ) : (
        /* Портретная ориентация — карточка позиции выезжающим слоем поверх списка */
        <Sheet
          visible={!!selected}
          onClose={() => { setSelected(null); setMode(null); }}
          onBack={mode ? closeSlidePanel : undefined}
          title={mode ? MODES.find(m => m.key === mode)?.label : selected?.name}
        >
          <View style={{ padding: 16, flex: 1 }}>{detailContent}</View>
        </Sheet>
      )}

      {/* Предупреждение при удалении — позиция может использоваться в техкартах */}
      <Modal visible={!!deletePrompt} transparent animationType="fade" onRequestClose={() => setDeletePrompt(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDeletePrompt(null)} />
          <FitView style={[styles.catModalBox, { maxHeight: '70%' }]}>
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
          </FitView>
        </View>
      </Modal>

      <WarehouseMenu visible={!!menuAt} anchor={menuAt} warehouses={whs} currentId={whId} actions={menuActions}
        onPick={(id) => { setMenuAt(null); setWhId(id); reload(selected?.id ?? null, true, id); }}
        onAction={onMenuAction} onClose={() => setMenuAt(null)} />
      <TransferModal visible={!!trModal} warehouses={whs} fromId={trModal?.fromId} toId={trModal?.toId} preset={trModal?.preset} isNarrow={!isLandscape}
        onDone={(n) => { toast.show(`Перемещено позиций: ${n}`, 'info'); reload(selected?.id ?? null); }} onClose={() => setTrModal(null)} />
      <PurchaseInvoiceModal visible={invoiceOpen} warehouses={whs} warehouseId={whId || undefined} firstStockId={selected?.id} isNarrow={!isLandscape}
        onDone={(n, sum) => { toast.show(`Закупка записана: ${n} поз.${sum ? ` · расход ${fmtNum(sum)} ₽` : ''}`, 'info'); reload(selected?.id ?? null); }} onClose={() => setInvoiceOpen(false)} />
      <TransfersModal visible={histOpen} warehouseId={whId || null} onClose={() => setHistOpen(false)} />
      <PurchaseListModal visible={buyOpen} warehouseId={whId || null} warehouseName={whName} onClose={() => setBuyOpen(false)} />

      {/* Новая позиция склада — выезжающий слой */}
      <Sheet visible={!!newItemModal} onClose={() => setNewItemModal(null)} title="Новая позиция склада">
        {newItemModal && (
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: -4 }}>
              <InfoTip title="Позиция склада" text="Это то, что физически есть в ограниченном количестве и заканчивается: ингредиенты, расходники, товары для перепродажи. Отдельно от «Товаров» — там то, что вы продаёте клиенту." />
            </View>
            <Text style={styles.sectionLabel}>Название</Text>
            <TextInput
              color={colors.text}
              style={[styles.input, { marginBottom: 12 }]}
              value={newItemModal.name}
              onChangeText={v => setNewItemModal(m => ({ ...m, name: v }))}
              placeholder="Название позиции"
              placeholderTextColor={colors.muted}
              autoFocus
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
              style={[styles.input, { marginBottom: 12 }]}
              value={newItemModal.category}
              onChangeText={v => setNewItemModal(m => ({ ...m, category: v }))}
              placeholder="Или впишите новую категорию"
              placeholderTextColor={colors.muted}
            />

            <Text style={styles.sectionLabel}>Единица</Text>
            <View style={{ marginBottom: 12 }}>
              <UnitPicker value={newItemModal.unit} onChange={v => setNewItemModal(m => ({ ...m, unit: v }))} />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.sectionLabel}>Остаток сейчас</Text>
                  <InfoTip title="Остаток сейчас" text="Сколько этой позиции у вас физически есть на момент создания. Если ещё нет — оставьте 0, пополните через «Закупка» позже." />
                </View>
                <TextInput
                  color={colors.text}
                  style={[styles.input, { marginBottom: 12 }]}
                  value={newItemModal.initialStock}
                  onChangeText={v => setNewItemModal(m => ({ ...m, initialStock: v }))}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
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
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.confirmBtn, { marginTop: 14 }, pressed && { opacity: 0.88 }]}
              onPress={saveNewItem}
            >
              <Text style={styles.confirmBtnText}>Создать</Text>
            </Pressable>
          </ScrollView>
        )}
      </Sheet>

      {/* Модалка категорий */}
      <Modal visible={catModal} transparent animationType="fade" onRequestClose={() => setCatModal(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCatModal(false)} />
          <FitView style={styles.catModalBox}>
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
          </FitView>
        </View>
      </Modal>

      {/* Переименование / удаление категории */}
      <Modal visible={!!catModal2} transparent animationType="fade" onRequestClose={() => setCatModal2(null)}>
        <KeyboardSafe style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCatModal2(null)} />
          <FitView style={[styles.catModalBox, { maxHeight: '70%' }]}>
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
          </FitView>
        </KeyboardSafe>
      </Modal>

      {/* Удаление категории — перенос позиций в другую */}
      <Modal visible={!!catDeletePrompt} transparent animationType="fade" onRequestClose={() => setCatDeletePrompt(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCatDeletePrompt(null)} />
          <FitView style={[styles.catModalBox, { maxHeight: '60%' }]}>
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
          </FitView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bridgeTxt:       { fontFamily: fonts.familyRegular, fontSize: 16, color: colors.text, lineHeight: 23 },
  bridgeAmountBox: { marginTop: 16, backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.borderHi, padding: 16, alignItems: 'center' },
  bridgeAmountVal: { fontFamily: fonts.family, fontSize: 28, color: colors.orange },
  bridgeAmountLbl: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 4 },
  bridgeAddBtn:    { marginTop: 20, paddingVertical: 15, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center' },
  bridgeAddBtnTxt: { fontFamily: fonts.family, fontSize: 16, color: colors.onAccent },
  bridgeSkipBtn:   { marginTop: 10, paddingVertical: 15, borderRadius: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  bridgeSkipBtnTxt:{ fontFamily: fonts.familySemibold, fontSize: 16, color: colors.muted },
  layout: { flex: 1 },
  left:   { flex: 1, backgroundColor: colors.surface },
  leftLandscape: { flex: 0, width: '38%', maxWidth: 480, marginLeft: 0, marginTop: 12, marginBottom: 12, marginRight: 0, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  landscapeDetail: { flex: 1, backgroundColor: colors.bg, margin: 12, marginLeft: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  landscapeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  landscapeHeaderTxt: { fontFamily: fonts.family, fontSize: 18, color: colors.text, flex: 1 },
  landscapeBackBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  landscapeBackTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },
  right:  { flex: 1, backgroundColor: colors.bg },

  emptyRight:    { flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.3 },
  emptyRightTxt: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.muted, marginTop: 12 },
  detailTitle:   { fontFamily: fonts.family, fontSize: 20, color: colors.text, marginBottom: 16 },

  inner: { paddingBottom: 24 },

  filterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingBottom: 10, gap: 8,
  },
  viewSwitch: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  viewSwitchBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  viewSwitchBtnActive: { backgroundColor: 'rgba(127,168,217,0.12)' },
  viewSwitchTxt: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  viewSwitchTxtActive: { color: colors.orange },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    position: 'relative',
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
  catBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  catChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  catChipActive: { backgroundColor: 'rgba(127,168,217,0.12)', borderColor: 'rgba(127,168,217,0.5)' },
  catCountTxt: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  catItemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  catItemName: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.text },
  catItemQty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted },
  catDeleteBtn: { backgroundColor: 'rgba(219,129,120,0.06)', borderWidth: 1, borderColor: 'rgba(219,129,120,0.35)', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  deleteItemBtn: { marginTop: 20, marginBottom: 8, paddingVertical: 13, alignItems: 'center', borderRadius: 12, backgroundColor: 'rgba(219,129,120,0.06)', borderWidth: 1, borderColor: 'rgba(219,129,120,0.3)' },
  deleteItemTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red },
  cancelBtn: { paddingVertical: 13, alignItems: 'center', borderRadius: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  cancelTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  catDeleteTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red },
  catChipTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  catChipTxtActive: { color: colors.orange },
  catBtnText: { fontSize: 16, color: colors.muted },
  addStockBtn: { paddingHorizontal: 12, height: 38, borderRadius: 10, backgroundColor: 'rgba(127,168,217,0.1)', borderWidth: 1, borderColor: 'rgba(127,168,217,0.4)', alignItems: 'center', justifyContent: 'center' },
  addStockBtnText: { fontSize: 14, color: colors.orange, fontFamily: fonts.familySemibold },

  catGroup: { marginTop: 18, paddingHorizontal: 14 },
  lowSheetSectionTitle: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },

  catHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: colors.surface2, borderRadius: 10 },
  catName: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, flex: 1 },
  catCount: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginRight: 6 },
  catNameWarn: { color: '#D9AC62' },
  catWarnDot:  { fontSize: 14 },

  catCard: { backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, position: 'relative' },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.03)' },
  rowActive:  { backgroundColor: 'rgba(127,168,217,0.08)' },
  activeBar:  { position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 3, borderRadius: 2, backgroundColor: colors.orange },

  itemName: { fontFamily: fonts.family, fontSize: 16, color: colors.text, marginBottom: 3 },
  itemThreshold: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },

  itemRight: { alignItems: 'flex-end', marginRight: 10 },
  itemQty: { fontFamily: fonts.family, fontSize: 18, color: colors.text },
  itemUnit: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },

  qtyOk:     { color: colors.green },
  qtyLow:    { color: colors.red },
  qtyNeg:    { color: '#DB8178' },

  rowArrow: { fontFamily: fonts.family, fontSize: 20, color: colors.border },

  whBtn: { flexDirection: 'row', alignItems: 'center', height: 50, borderRadius: 14, paddingHorizontal: 16, marginHorizontal: 12, marginBottom: 8, backgroundColor: 'rgba(150,172,204,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  whK: { fontFamily: fonts.familySemibold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted, marginRight: 12 }, whV: { flex: 1, fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text }, whS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginRight: 10 }, whC: { fontSize: 12, color: colors.muted },
  whRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }, whChip: { height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }, whChipOn: { backgroundColor: 'rgba(127,168,217,0.2)', borderColor: 'rgba(157,191,230,0.5)' }, whChipT: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim },
  bq: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14, borderRadius: 14, marginTop: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }, bqN: { flex: 1, fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, bqL: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted }, bqV: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text, marginHorizontal: 10 },
  bqGo: { height: 32, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(157,191,230,0.4)', backgroundColor: 'rgba(127,168,217,0.08)', alignItems: 'center', justifyContent: 'center' }, bqGoT: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orangeLight },
  locBar:   { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.border },
  locInner: { paddingHorizontal: spacing.lg, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  locChip:  { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  locChipActive: { borderColor: 'rgba(127,168,217,0.6)', backgroundColor: 'rgba(127,168,217,0.08)' },
  locChipText:   { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  catModalBox: { width: '45%', maxWidth: 420, maxHeight: '80%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  modalHeader:{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontFamily: fonts.family, fontSize: 18, color: colors.text, flex: 1, marginRight: 12 },
  modalClose: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  modalCloseTxt: { fontSize: 14, color: colors.muted, fontFamily: fonts.familySemibold },
  sectionLabel: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, lineHeight: 17 },
  card: { backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  catRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
  rowDiv: { borderBottomWidth: 1, borderBottomColor: colors.border },
  catArrow: { fontSize: 18, color: colors.muted },
  input: { padding: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 14 },

  curBox:    { padding: 16, backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  curRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  curLabel:  { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  curVal:    { fontFamily: fonts.family, fontSize: 28, color: colors.text },
  curUnit:   { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted },
  curThrBox: { alignItems: 'flex-end' },
  curThrLabel:{ fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  curThrVal: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, marginTop: 2 },
  curAvg:    { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim, marginTop: 10 },
  curAvgVal: { fontFamily: fonts.family, fontSize: 14, color: colors.text },

  modeList:   { gap: 10 },
  modeRow:    {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 14,
    backgroundColor: colors.surface2, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  modeIconBadge: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modeIconTxt: { fontSize: 18 },
  modeLabel:  { fontFamily: fonts.family, fontSize: 16, color: colors.text, marginBottom: 2 },
  modeDesc:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  modeArrow:  { fontSize: 18, color: colors.muted },
  modeRowActive: { backgroundColor: 'rgba(127,168,217,0.08)' },

  slidePanel: { overflow: 'hidden', borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: colors.surface },
  slidePanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  slidePanelTitle: { fontFamily: fonts.family, fontSize: 18, color: colors.text },
  slidePanelClose: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  slidePanelCloseTxt: { fontSize: 14, color: colors.muted, fontFamily: fonts.familySemibold },
  slidePanelDesc: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginBottom: 12 },
  backToDetailBtn: { paddingVertical: 8, marginBottom: 4 },
  backToDetailTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },

  backBtn:     { paddingVertical: 10, marginBottom: 8 },
  backBtnText: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },
  inputLabel:  { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 14 },
  inputField:  { padding: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 24, fontFamily: fonts.family, textAlign: 'center', marginBottom: 4 },

  previewBox:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: 'rgba(127,168,217,0.08)', borderRadius: 12, marginVertical: 10, borderWidth: 1, borderColor: 'rgba(127,168,217,0.2)' },
  previewLabel: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted },
  previewVal:   { fontFamily: fonts.family, fontSize: 24, color: colors.text },

  confirmBtn:    { paddingVertical: 15, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center', marginTop: 8 },
  confirmBtnOff: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  confirmBtnText:{ fontFamily: fonts.family, fontSize: 16, color: colors.onAccent },

  histToggle:     { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  histToggleText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  histRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.borderLo },
  histDate:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, flex: 1 },
  histQty:    { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text, flex: 1, textAlign: 'center' },
  priceRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  priceInput: { paddingVertical: 4, paddingHorizontal: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.text, fontFamily: fonts.family, fontSize: 14, minWidth: 70, textAlign: 'center' },
  priceSaveBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: 'rgba(127,168,217,0.1)', borderWidth: 1, borderColor: 'rgba(127,168,217,0.4)' },
  priceSaveTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },
  priceCalcToggle: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.orange, marginTop: 8 },
  priceCalcBox: { marginTop: 8, padding: 10, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, gap: 8 },
  priceCalcRow: { flexDirection: 'row', gap: 8 },
  priceCalcInput: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.text, fontFamily: fonts.family, fontSize: 14, textAlign: 'center' },
  priceCalcApplyBtn: { paddingVertical: 10, borderRadius: 8, backgroundColor: colors.orange, alignItems: 'center' },
  priceCalcApplyTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.onAccent },
  purchasePerUnitHint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.green, textAlign: 'center', marginBottom: 4 },
  purchaseExpenseNote: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 4 },
  histPrice:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.orange, flex: 1, textAlign: 'right' },
  // ── Новый вид склада (карточки, стеклянные плитки, действия) ──
  layout2:     { flex: 1, padding: 12 },
  lcard:       { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 16, flex: 1 },
  lcardLand:   { flex: 0, width: '38%', maxWidth: 480, marginRight: 12 },
  rcard:       { flex: 1, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 24 },
  toolbar:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  searchBox:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 14, paddingHorizontal: 14, backgroundColor: colors.bg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  searchInput2:{ flex: 1, padding: 0, color: colors.text, fontSize: 16, fontFamily: fonts.familyRegular },
  addBtn2:     { flexDirection: 'row', alignItems: 'center', gap: 6, height: 46, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.orange },
  addBtn2Txt:  { fontFamily: fonts.family, fontSize: 15, color: colors.onAccent },
  gearBtn:     { width: 46, height: 46, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  chipsRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  fChip:       { flexDirection: 'row', alignItems: 'center', height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', marginRight: 6 },
  fChipOn:     { backgroundColor: 'rgba(127,168,217,0.2)', borderColor: 'rgba(157,191,230,0.5)' },
  fChipTxt:    { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  fChipTxtOn:  { color: colors.orangeLight },
  fChipCnt:    { fontFamily: fonts.familySemibold, fontSize: 13, marginLeft: 6 },
  vSwitch:     { flexDirection: 'row', height: 34, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', marginLeft: 'auto' },
  vSwitchBtn:  { width: 38, alignItems: 'center', justifyContent: 'center' },
  vSwitchOn:   { backgroundColor: 'rgba(127,168,217,0.2)' },
  grpHead:     { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 4, paddingTop: 12, paddingBottom: 6 },
  grpName:     { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  grpCnt:      { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginLeft: 8 },
  grpCard:     { backgroundColor: colors.bg, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  row2:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, position: 'relative' },
  rowDiv2:     { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  rowActive2:  { backgroundColor: 'rgba(127,168,217,0.10)' },
  rowBar2:     { position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderTopRightRadius: 2, borderBottomRightRadius: 2, backgroundColor: colors.orange },
  rName:       { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  rThr:        { fontFamily: fonts.familyMedium, fontSize: 12, color: colors.muted, marginTop: 2 },
  rQty:        { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text, marginLeft: 12 },
  rUnit:       { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  emptyBox:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  emptyIco:    { width: 76, height: 76, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle:  { fontFamily: fonts.familySemibold, fontSize: 20, color: colors.text, marginBottom: 8 },
  emptyText:   { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 21, maxWidth: 300, marginBottom: 20 },
  emptyCta:    { flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 24, borderRadius: 14, backgroundColor: colors.orange },
  emptyCtaTxt: { fontFamily: fonts.family, fontSize: 15, color: colors.onAccent },
  dHead:       { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  dTitle:      { fontFamily: fonts.display, fontSize: 26, color: colors.text, letterSpacing: -0.3 },
  dSub:        { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 3 },
  thrEdit:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  thrInput:    { width: 110, height: 40, borderRadius: 10, paddingHorizontal: 12, backgroundColor: colors.bg, borderWidth: 1, borderColor: 'rgba(157,191,230,0.5)', color: colors.text, fontFamily: fonts.familySemibold, fontSize: 16 },
  miniBtn:     { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(127,168,217,0.2)', alignItems: 'center', justifyContent: 'center' },
  pill:        { height: 28, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  pillTxt:     { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim },
  stripe2:     { position: 'absolute', left: 0, top: 24, bottom: 24, width: 3, borderTopRightRadius: 2, borderBottomRightRadius: 2, backgroundColor: colors.orange },
  tileLbl:     { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textDim },
  heroVal:     { fontFamily: fonts.display, fontSize: 52, color: colors.text, letterSpacing: -1.6, marginTop: 8 },
  heroUnit:    { fontFamily: fonts.familyMedium, fontSize: 22, color: colors.orangeLight, letterSpacing: 0 },
  tileVal:     { fontFamily: fonts.familySemibold, fontSize: 22, color: colors.text, marginTop: 8, letterSpacing: -0.2 },
  tileSmall:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 3 },
  sellRow:     { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  sellInput:   { flex: 1, minWidth: 0, padding: 0, color: colors.text, fontFamily: fonts.familySemibold, fontSize: 22 },
  actGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  actWrap:     { flexGrow: 1, flexBasis: '45%' },
  actInner:    { height: 76, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  actIcon:     { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  actIconPri:  { backgroundColor: 'rgba(127,168,217,0.3)' },
  actTitle:    { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  actSub:      { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 1 },
  lockNote:    { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 16, lineHeight: 19 },
  delLink:     { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, paddingVertical: 8 },
  edHead:      { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  edBack:      { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.orangeLight, marginRight: 16 },
  edTitle:     { fontFamily: fonts.familySemibold, fontSize: 20, color: colors.text },
  fld:         { flexDirection: 'row', alignItems: 'center', height: 76, borderRadius: 18, paddingHorizontal: 20, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  fldLbl:      { width: 130, fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  fldInput:    { flex: 1, minWidth: 0, textAlign: 'right', padding: 0, fontFamily: fonts.display, fontSize: 34, color: colors.text, letterSpacing: -0.6 },
  fldUnit:     { fontFamily: fonts.familyMedium, fontSize: 20, color: colors.orangeLight, marginLeft: 10, minWidth: 26 },
  stepBtn:     { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  qdRow:       { flexDirection: 'row', gap: 8, marginBottom: 12 },
  qdChip:      { height: 36, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  qdTxt:       { fontFamily: fonts.familyMedium, fontSize: 14, color: colors.muted },
  preRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  preLbl:      { fontFamily: fonts.familySemibold, fontSize: 13, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.textDim },
  preVal:      { fontFamily: fonts.display, fontSize: 30, color: colors.text, letterSpacing: -0.5 },
  hint2:       { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 12, lineHeight: 19, marginHorizontal: 2 },
  confirm2:    { marginTop: 14, height: 58, borderRadius: 16, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  confirm2Off: { opacity: 0.35 },
  confirm2Txt: { fontFamily: fonts.family, fontSize: 18, color: colors.onAccent },
});
