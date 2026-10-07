import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import TourGuide from '../components/TourGuide';
import GlassSurface from '../components/GlassSurface';
import GlassButton from '../components/GlassButton';
import Icon from '../components/Icon';
import SoftGlow from '../components/SoftGlow';
import KeyboardSafe from '../components/KeyboardSafe';
import { useToast } from '../components/Toast';
import { useResponsive } from '../hooks/useResponsive';
import { useTourHighlight } from '../components/TourRegistry';
import {
  getAllStock, getBusinessProfile, markTourSeen, getLocations, getInventoryActs, getInventoryAct, getInventoryDraft,
  createInventoryAct, setInventoryItemActual, confirmInventoryAct, deleteInventoryAct,
} from '../db/queries';
import { goBackSmart, getCurrentLocationId } from '../db/session';
import { colors, fonts, glass } from '../constants/theme';

// Инвентаризация: подсчёт запоминается (черновик не стирается), «по системе» берётся в момент ввода факта,
// а подтверждение применяет РАЗНИЦУ к текущему остатку — продажи во время подсчёта не теряются.
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };
const q = n => (Math.round((n || 0) * 1000) / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 3 });
const rub = n => Math.round(n || 0).toLocaleString('ru-RU');
const sgn = n => (n > 0 ? '+' : '−');
const dateOf = iso => { try { return new Date(iso).toLocaleDateString('ru-RU'); } catch (_) { return ''; } };
const scopeText = a => (a.scope === 'category' ? `Категория: ${a.scope_value}` : a.scope === 'manual' ? `Выбранные позиции: ${String(a.scope_value).split(',').filter(Boolean).length}` : 'Весь склад');

export default function InventoryScreen({ navigation }) {
  const { isLandscape } = useResponsive();
  const toast = useToast();
  const [acts, setActs] = useState([]);
  const [sel, setSel] = useState(null);
  const [act, setAct] = useState(null);
  const [vals, setVals] = useState({});
  const [flt, setFlt] = useState('all');
  const [stock, setStock] = useState([]);
  const [newOpen, setNewOpen] = useState(false);
  const [scope, setScope] = useState('all');
  const [scopeCat, setScopeCat] = useState('');
  const [scopeIds, setScopeIds] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const hl = { add: useTourHighlight('inventory.addBtn'), list: useTourHighlight('inventory.list'), fill: useTourHighlight('inventory.fill'), confirm: useTourHighlight('inventory.confirm'), stats: useTourHighlight('inventory.stats') };

  const openAct = useCallback((id) => {
    const a = id ? getInventoryAct(id) : null;
    setAct(a); setSel(a ? a.id : null); setFlt('all');
    const v = {}; (a?.items || []).forEach(i => { v[i.id] = i.actual === null ? '' : String(i.actual).replace('.', ','); }); setVals(v);
  }, []);
  const load = useCallback((pick) => {
    try {
      const list = getInventoryActs(); setActs(list); setStock(getAllStock());
      openAct(pick || sel || (getInventoryDraft()?.id) || list[0]?.id || null);
    } catch (e) { console.error(e); }
  }, [sel]);
  useFocusEffect(useCallback(() => { load(); }, []));

  const steps = [
    { key: 'inventory.addBtn', title: 'Новый акт', text: 'Отсюда начинается инвентаризация: весь склад, категория или выбранные позиции. Подсчёт можно прервать и продолжить позже.' },
    { key: 'inventory.list', title: 'Список актов', text: 'Черновик — подсчёт в процессе, «Подтверждён» — остатки уже приведены к факту. Нажмите на акт, чтобы открыть.' },
    { key: 'inventory.fill', title: 'Подсчёт', text: 'Вводите то, что реально на складе (дробные — через запятую). Разница видна сразу, остатки изменятся только после подтверждения.' },
    { key: 'inventory.confirm', title: 'Подтверждение', text: 'Перед применением — итог. Продажи, прошедшие во время подсчёта, не пропадут: меняется только разница. Недостача попадёт в отчёт «Прибыль».' },
    { key: 'inventory.stats', title: 'Итоги', text: 'Сколько актов, расхождение по последнему подтверждённому и сколько позиций ниже порога.' },
  ];
  useEffect(() => {
    try { if (!getBusinessProfile()?.tours_seen?.Inventory) { const t = setTimeout(() => setTourOpen(true), 500); return () => clearTimeout(t); } } catch (_) {}
  }, []);

  // ── подсчёт ──
  const items = act?.items || [];
  const isDraft = act?.status === 'draft';
  const saveItem = (i) => {
    const t = vals[i.id] ?? '', v = t.trim() === '' ? null : num(t);
    if ((i.actual ?? null) === v) return;
    try { setInventoryItemActual(i.id, v); } catch (e) { console.error(e); toast.show('Не удалось сохранить значение', 'warn'); }
  };
  const refreshItems = () => { const a = getInventoryAct(act.id); setAct(a); return a; };
  const diffOf = i => { const a = num(vals[i.id]); return a === null ? null : a - i.expected; };
  const counted = items.filter(i => num(vals[i.id]) !== null).length;
  let lack = 0, over = 0;
  items.forEach(i => { const d = diffOf(i); if (d === null) return; const m = d * (i.cost_per_unit || 0); if (m < 0) lack += m; else over += m; });
  const shown = items.filter(i => flt === 'all' || (flt === 'todo' && num(vals[i.id]) === null) || (flt === 'diff' && diffOf(i) !== null && Math.abs(diffOf(i)) > 1e-9));

  const askConfirm = () => {
    try { items.forEach(saveItem); refreshItems(); setConfirmOpen(true); } catch (e) { console.error(e); toast.show('Не удалось сохранить значения', 'warn'); }
  };
  const apply = () => {
    const r = confirmInventoryAct(act.id);
    setConfirmOpen(false);
    if (r.ok) { toast.show('Остатки обновлены'); load(act.id); } else toast.show(r.message || 'Не удалось применить', 'warn');
  };
  const removeDraft = () => Alert.alert('Удалить черновик?', 'Введённые значения пропадут, остатки не изменятся.', [{ text: 'Отмена' }, { text: 'Удалить', style: 'destructive', onPress: () => { deleteInventoryAct(act.id); load(null); } }]);

  // ── новый акт ──
  const draft = acts.find(a => a.status === 'draft');
  const cats = [...new Set(stock.map(s => s.category || 'Без категории'))].sort();
  const startAct = () => {
    try {
      const scopeValue = scope === 'category' ? scopeCat : scope === 'manual' ? scopeIds.join(',') : '';
      if (scope === 'category' && !scopeCat) { toast.show('Выберите категорию', 'warn'); return; }
      if (scope === 'manual' && scopeIds.length === 0) { toast.show('Отметьте позиции', 'warn'); return; }
      const locOn = getBusinessProfile()?.modules?.locations === true;
      const locId = locOn ? getCurrentLocationId() : null;
      const locName = locId ? (getLocations().find(l => l.id === locId)?.name || '') : '';
      const id = createInventoryAct({ scope, scopeValue, locationId: locId, locationName: locName, replaceDraft: !!draft });
      setNewOpen(false); load(id);
    } catch (e) { console.error(e); toast.show('Не удалось создать акт', 'warn'); }
  };

  const lastConfirmed = acts.find(a => a.status === 'confirmed');
  const lowCount = stock.filter(s => (s['порог'] || 0) > 0 && (s['остаток'] || 0) <= s['порог']).length;
  const Tile = ({ k, v, s, st: sty }) => (
    <GlassSurface radius={glass.radius.tile} padding={16} style={{ flex: 1, minWidth: 180 }}>
      <Text style={st.kl}>{k}</Text><Text style={[st.val, sty]}>{v}</Text>{!!s && <Text style={st.sub}>{s}</Text>}
    </GlassSurface>
  );
  const Pill = ({ d }) => <View style={[st.pill, { borderColor: d ? 'rgba(217,172,98,0.45)' : 'rgba(120,183,150,0.4)' }]}><Text style={[st.pillT, { color: d ? colors.warning : colors.green }]}>{d ? 'Черновик' : 'Подтверждён'}</Text></View>;

  const detail = !act ? (
    <View style={st.center}><View style={st.ico}><Icon name="list" size={34} color={colors.textDim} /></View><Text style={st.cT}>{acts.length ? 'Выберите акт' : 'Инвентаризаций ещё не было'}</Text>
      <Text style={st.cX}>{acts.length ? 'Подсчёт откроется здесь' : 'Сверьте фактические остатки склада с тем, что в системе — так вы увидите недостачи и излишки.'}</Text></View>
  ) : isDraft ? (
    <View style={{ flex: 1 }}>
      <View style={st.dh}><Text style={st.dT}>Подсчёт</Text><Text style={st.dS}>посчитано {counted} из {items.length}</Text></View>
      <View style={st.chips}>{[['all', 'Все'], ['todo', 'Не посчитано'], ['diff', 'С расхождением']].map(([k, t]) => <Pressable key={k} style={[st.chip, flt === k && st.chipOn]} onPress={() => setFlt(k)}><Text style={[st.chipT, flt === k && { color: colors.orangeLight }]}>{t}</Text></Pressable>)}</View>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {shown.length === 0 ? <Text style={st.cX}>{items.length ? 'Нет позиций по этому условию' : 'В акте нет позиций'}</Text> : shown.map(i => {
          const d = diffOf(i), money = d === null ? 0 : d * (i.cost_per_unit || 0), zero = d !== null && Math.abs(d) < 1e-9;
          return (
            <View key={i.id} style={st.ir}>
              <View style={{ flex: 1, minWidth: 0 }}><Text style={st.irN} numberOfLines={1}>{i.stock_name}</Text><Text style={st.irS}>по системе {q(i.expected)} {i.unit}</Text></View>
              <TextInput style={st.inp} color={colors.text} value={vals[i.id] ?? ''} placeholder="факт" placeholderTextColor="rgba(255,255,255,0.25)" keyboardType="decimal-pad"
                onChangeText={v => setVals(p => ({ ...p, [i.id]: v.replace(/[^0-9.,]/g, '') }))} onEndEditing={() => { saveItem(i); refreshItems(); }} />
              <Text style={st.unit}>{i.unit}</Text>
              <View style={st.dif}>{d === null ? <Text style={st.z}>—</Text> : zero ? <Text style={st.z}>сошлось</Text> : <><Text style={[st.dv, { color: d > 0 ? colors.green : '#E9A9A2' }]}>{sgn(d)}{q(Math.abs(d))} {i.unit}</Text><Text style={st.dm}>{sgn(money)}{rub(Math.abs(money))} ₽</Text></>}</View>
            </View>
          );
        })}
      </ScrollView>
      <View style={st.sm}>
        <Text style={st.smT}>Недостача <Text style={{ color: '#E9A9A2', fontFamily: fonts.familySemibold }}>{rub(lack)} ₽</Text> · Излишек <Text style={{ color: colors.green, fontFamily: fonts.familySemibold }}>+{rub(over)} ₽</Text>{'\n'}Остатки изменятся только после подтверждения.</Text>
        <View style={hl.confirm.style}><GlassButton tone="accent" label="Подтвердить" height={52} disabled={counted === 0} onPress={askConfirm} />{hl.confirm.overlay}</View>
      </View>
      <Pressable onPress={removeDraft} hitSlop={8} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}><Text style={st.del}>Удалить черновик</Text></Pressable>
    </View>
  ) : (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={st.dh}><Text style={st.dT}>Акт от {dateOf(act.created_at)}</Text><Pill d={false} /></View>
      <Text style={st.cX2}>{scopeText(act)}{act.location_name ? ` · ${act.location_name}` : ''}. Остатки приведены к факту, продажи во время подсчёта сохранены.</Text>
      <View style={st.box}>{items.filter(i => i.actual !== null && Math.abs(i.diff_qty || 0) > 1e-9).length === 0 ? <Text style={st.cX}>Расхождений не было</Text>
        : items.filter(i => i.actual !== null && Math.abs(i.diff_qty || 0) > 1e-9).map(i => <View key={i.id} style={st.lr}><Text style={st.lN}>{i.stock_name}</Text><Text style={st.lV}>{sgn(i.diff_qty)}{q(Math.abs(i.diff_qty))} {i.unit} · {sgn(i.diff_money)}{rub(Math.abs(i.diff_money))} ₽</Text></View>)}</View>
      <Text style={st.cX2}>Итог: <Text style={{ color: lastTotal(act) < 0 ? '#E9A9A2' : colors.green, fontFamily: fonts.familySemibold }}>{sgn(lastTotal(act))}{rub(Math.abs(lastTotal(act)))} ₽</Text>. Сумма учтена в отчёте «Прибыль» строкой «Недостачи» или «Излишки».</Text>
    </ScrollView>
  );

  return (
    <View style={st.root}>
      <TopBar title="Инвентаризация" onBack={() => goBackSmart(navigation)} navigation={navigation} activeScreen="Inventory"
        rightElement={<Pressable style={st.tourBtn} onPress={() => setTourOpen(true)} hitSlop={10} accessibilityLabel="Подсказка"><Text style={st.tourTxt}>?</Text></Pressable>} />
      <View style={StyleSheet.absoluteFill} pointerEvents="none"><SoftGlow size={620} color="127,168,217" alpha={0.14} style={{ position: 'absolute', left: -170, top: -150 }} /></View>
      <View style={st.tb}>
        <Text style={st.hint}>Сверка фактических остатков с системой: помогает найти недостачи и излишки</Text>
        <View style={{ position: 'relative', ...hl.add.style }}><GlassButton tone="solid" icon="plus" label="Новый акт" height={52} onPress={() => { setScope('all'); setNewOpen(true); }} />{hl.add.overlay}</View>
      </View>
      <View style={{ flex: 1, padding: 20, paddingTop: 12 }}>
        <View style={[st.tiles, hl.stats.style]}>
          <Tile k="Актов всего" v={String(acts.length)} s={`подтверждено: ${acts.filter(a => a.status === 'confirmed').length}`} />
          <Tile k="Расхождение по последнему" v={lastConfirmed ? `${sgn(lastConfirmed.diff)}${rub(Math.abs(lastConfirmed.diff))} ₽` : '—'} s="недостача учтена в отчёте «Прибыль»" />
          <Tile k="Мало на складе" v={String(lowCount)} s="позиций ниже порога" />
          {hl.stats.overlay}
        </View>
        <View style={[st.two, isLandscape && { flexDirection: 'row' }]}>
          <View style={[st.lc, isLandscape && { flex: 0.8 }, hl.list.style]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {acts.length === 0 ? <Text style={st.cX}>Актов пока нет</Text> : acts.map(a => (
                <Pressable key={a.id} style={[st.ac, sel === a.id && st.acSel]} onPress={() => openAct(a.id)}>
                  <View style={st.acT}><Text style={st.acD}>{dateOf(a.created_at)}</Text><Pill d={a.status === 'draft'} />
                    {a.status === 'confirmed' && <Text style={[st.acM, { color: a.diff < 0 ? '#E9A9A2' : colors.green }]}>{sgn(a.diff)}{rub(Math.abs(a.diff))} ₽</Text>}</View>
                  <Text style={st.acS}>{scopeText(a)} · {a.status === 'draft' ? `посчитано ${a.counted} из ${a.total}` : `${a.total} позиций`}</Text>
                </Pressable>))}
            </ScrollView>
          </View>
          <View style={[st.rc, isLandscape && { flex: 1.2 }, hl.fill.style]}>{detail}{hl.fill.overlay}</View>
        </View>
      </View>

      {/* Новый акт */}
      <Modal visible={newOpen} transparent animationType="fade" onRequestClose={() => setNewOpen(false)}>
        <KeyboardSafe style={st.ov}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setNewOpen(false)} />
          <View style={st.win}>
            <GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating padding={24}>
              <Text style={st.wT}>Новый акт инвентаризации</Text><Text style={st.wS}>Выберите охват пересчёта</Text>
              {!!draft && <View style={st.warn}><Text style={st.warnT}>Есть незаконченный подсчёт от {dateOf(draft.created_at)} — посчитано {draft.counted} из {draft.total}. Новый акт заменит этот черновик; чтобы продолжить его, закройте окно и откройте черновик в списке.</Text></View>}
              {[['all', 'Весь склад', 'все позиции'], ['category', 'Категория', 'например, «Молочные»'], ['manual', 'Выбранные позиции', 'отметите вручную']].map(([k, t, s]) => (
                <Pressable key={k} style={[st.opt, scope === k && st.optOn]} onPress={() => setScope(k)}><View><Text style={st.optT}>{t}</Text><Text style={st.optS}>{s}</Text></View><View style={[st.rad, scope === k && st.radOn]} /></Pressable>))}
              {scope === 'category' && (cats.length === 0 ? <Text style={st.wS}>На складе пока нет категорий</Text> : <View style={st.chips}>{cats.map(c => <Pressable key={c} style={[st.chip, scopeCat === c && st.chipOn]} onPress={() => setScopeCat(c)}><Text style={[st.chipT, scopeCat === c && { color: colors.orangeLight }]}>{c}</Text></Pressable>)}</View>)}
              {scope === 'manual' && <ScrollView style={{ maxHeight: 190 }}>{stock.map(s => { const on = scopeIds.includes(s.id); return (
                <Pressable key={s.id} style={st.mr} onPress={() => setScopeIds(p => (on ? p.filter(x => x !== s.id) : [...p, s.id]))}><View style={[st.cb, on && st.cbOn]}>{on && <Icon name="check" size={14} color={colors.onAccent} />}</View><Text style={st.optT}>{s.name}</Text></Pressable>); })}</ScrollView>}
              <View style={st.row2}><GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={() => setNewOpen(false)} /><GlassButton style={{ flex: 1 }} tone="accent" label="Начать подсчёт" height={54} onPress={startAct} /></View>
            </GlassSurface>
          </View>
        </KeyboardSafe>
      </Modal>

      {/* Подтверждение */}
      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View style={st.ov}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmOpen(false)} />
          <View style={st.win}>
            <GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating padding={24}>
              <Text style={st.wT}>Подтвердить инвентаризацию?</Text>
              <Text style={st.wP}>Остатки склада будут приведены к факту по {items.filter(i => i.actual !== null).length} из {items.length} позиций. Продажи, прошедшие во время подсчёта, не потеряются: меняется только разница.</Text>
              <ScrollView style={st.box2}>{items.filter(i => i.actual !== null && Math.abs(i.diff_qty || 0) > 1e-9).map(i => <View key={i.id} style={st.lr}><Text style={st.lN}>{i.stock_name}</Text><Text style={st.lV}>{sgn(i.diff_qty)}{q(Math.abs(i.diff_qty))} {i.unit}</Text></View>)}
                {items.filter(i => i.actual !== null && Math.abs(i.diff_qty || 0) > 1e-9).length === 0 && <Text style={st.cX}>Расхождений нет</Text>}</ScrollView>
              <Text style={[st.wP, { marginTop: 10 }]}>Недостача <Text style={{ color: '#E9A9A2', fontFamily: fonts.familySemibold }}>{rub(items.reduce((s, i) => s + Math.min(0, i.diff_money || 0), 0))} ₽</Text> · Излишек <Text style={{ color: colors.green, fontFamily: fonts.familySemibold }}>+{rub(items.reduce((s, i) => s + Math.max(0, i.diff_money || 0), 0))} ₽</Text></Text>
              <View style={st.row2}><GlassButton style={{ flex: 1 }} label="Назад" height={54} onPress={() => setConfirmOpen(false)} /><GlassButton style={{ flex: 1 }} tone="accent" label="Применить" height={54} onPress={apply} /></View>
            </GlassSurface>
          </View>
        </View>
      </Modal>
      <TourGuide visible={tourOpen} onClose={() => { setTourOpen(false); markTourSeen('Inventory'); }} steps={steps} />
    </View>
  );
}
const lastTotal = a => Math.round((a.items || []).reduce((s, i) => s + (i.diff_money || 0), 0));

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tourBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(127,168,217,0.1)', borderWidth: 1, borderColor: 'rgba(127,168,217,0.3)', alignItems: 'center', justifyContent: 'center' }, tourTxt: { fontFamily: fonts.family, fontSize: 18, color: colors.orange },
  tb: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 14 }, hint: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12, position: 'relative' },
  kl: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textDim }, val: { fontFamily: fonts.display, fontSize: 26, color: colors.text, marginTop: 6 }, sub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 5, lineHeight: 17 },
  two: { flex: 1, gap: 12 }, lc: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 12 }, rc: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 18 },
  ac: { padding: 13, borderRadius: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }, acSel: { backgroundColor: 'rgba(127,168,217,0.10)' }, acT: { flexDirection: 'row', alignItems: 'center' }, acD: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text, flex: 1 }, acM: { fontFamily: fonts.familySemibold, fontSize: 15, marginLeft: 12 }, acS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 4 },
  pill: { height: 24, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginLeft: 10 }, pillT: { fontFamily: fonts.familySemibold, fontSize: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }, ico: { width: 76, height: 76, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  cT: { fontFamily: fonts.familySemibold, fontSize: 19, color: colors.text, marginBottom: 6, textAlign: 'center' }, cX: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 21, padding: 16 }, cX2: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim, lineHeight: 21, marginVertical: 8 },
  dh: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, dT: { fontFamily: fonts.display, fontSize: 22, color: colors.text }, dS: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }, chip: { height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }, chipOn: { backgroundColor: 'rgba(127,168,217,0.2)', borderColor: 'rgba(157,191,230,0.5)' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  ir: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }, irN: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, irS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  inp: { width: 96, height: 44, borderRadius: 12, textAlign: 'right', paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', color: colors.text, fontFamily: fonts.familySemibold, fontSize: 17 }, unit: { width: 36, fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginHorizontal: 6 },
  dif: { width: 118, alignItems: 'flex-end' }, dv: { fontFamily: fonts.familySemibold, fontSize: 15 }, dm: { fontFamily: fonts.familyMedium, fontSize: 12, color: colors.muted }, z: { fontFamily: fonts.familyMedium, fontSize: 14, color: colors.muted },
  sm: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', marginTop: 6 }, smT: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, lineHeight: 20 }, del: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  box: { borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 14, paddingVertical: 4, marginVertical: 8 }, box2: { maxHeight: 160, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 14, marginTop: 10 },
  lr: { flexDirection: 'row', paddingVertical: 7 }, lN: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim }, lV: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  ov: { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', alignItems: 'center', justifyContent: 'center' }, win: { width: '48%', minWidth: 520, maxWidth: 600 },
  wT: { fontFamily: fonts.display, fontSize: 21, color: colors.text }, wS: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 3, marginBottom: 10 }, wP: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim, lineHeight: 21, marginTop: 8 },
  warn: { padding: 12, borderRadius: 14, backgroundColor: 'rgba(217,172,98,0.08)', borderWidth: 1, borderColor: 'rgba(217,172,98,0.25)', marginBottom: 10 }, warnT: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.warning, lineHeight: 19 },
  opt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 16, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, optOn: { backgroundColor: 'rgba(127,168,217,0.12)', borderColor: 'rgba(157,191,230,0.55)' }, optT: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, optS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  rad: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' }, radOn: { borderColor: colors.orange, backgroundColor: colors.orange },
  mr: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 }, cb: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }, cbOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  row2: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
