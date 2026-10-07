import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import TourGuide from '../components/TourGuide';
import DatePicker from '../components/DatePicker';
import Toggle from '../components/Toggle';
import GlassSurface from '../components/GlassSurface';
import GlassSegmented from '../components/GlassSegmented';
import GlassButton from '../components/GlassButton';
import Icon from '../components/Icon';
import SoftGlow from '../components/SoftGlow';
import ExpenseEditModal from '../components/ExpenseEditModal';
import InvestmentEditModal, { INV_CATEGORIES } from '../components/InvestmentEditModal';
import { useTourHighlight, useTourActiveKey } from '../components/TourRegistry';
import { useResponsive } from '../hooks/useResponsive';
import {
  getExpensesInPeriod, insertExpense, updateExpense, deleteExpense, getOverheadItems, addOverheadItem, updateOverheadItem, deleteOverheadItem,
  getInvestments, addInvestment, updateInvestment, deleteInvestment, getBusinessProfile, markTourSeen, getOpenShift,
} from '../db/queries';
import { getReport, PRESETS, rangeOf, getInvestmentStats, investmentProgress, amortMonths } from '../db/reports';
import { getSession, goBackSmart, can, getCurrentLocationId } from '../db/session';
import { colors, fonts, glass } from '../constants/theme';

// Расходы: вкладки «Расходы» и «Крупные покупки», одна строка периода на экран (общие пресеты с «Отчётностью»).
// Все суммы согласованы с отчётом: закупки из «Склада» — отдельно, повторяющиеся начисляются по дням.
const fmt = n => Math.round(n || 0).toLocaleString('ru-RU');
const ddmm = s => String(s || '').slice(0, 10).split('-').reverse().join('.');
const monthly = o => (o.period === 'year' ? o.amount / 12 : o.period === 'week' ? o.amount * 4.33 : o.amount);
const PER = { week: 'в неделю', month: 'в месяц', year: 'в год' };
const COLORS = ['#9DBFE6', '#A5A8D4', '#78B796', '#D9AC62', '#DB8178', '#8C95A4'];
const FLT0 = { src: 'all', cat: 'all', sort: 'new', photo: false };

export default function FinancesScreen({ navigation, route }) {
  const { isLandscape } = useResponsive();
  const isAdmin = getSession()?.role === 'admin';
  const canAdd = can('add_expenses') !== false, seeCosts = can('view_reports');
  const [tab, setTab] = useState(isAdmin ? (route?.params?.initialTab || 'expenses') : 'expenses');
  const [preset, setPreset] = useState('week');
  const [range, setRange] = useState(() => rangeOf('month30'));
  const [flt, setFlt] = useState(FLT0);
  const [rows, setRows] = useState([]); const [rep, setRep] = useState(null); const [over, setOver] = useState([]);
  const [invs, setInvs] = useState([]); const [stats, setStats] = useState(null); const [selInv, setSelInv] = useState(null);
  const [pop, setPop] = useState(null); const [anchor, setAnchor] = useState({ top: 70, right: 20 });
  const [picker, setPicker] = useState(null); const [expModal, setExpModal] = useState(null); const [invModal, setInvModal] = useState(null);
  const [tourOpen, setTourOpen] = useState(false);
  const pRef = useRef(null), fRef = useRef(null);
  const activeTourKey = useTourActiveKey();
  const hl = { period: useTourHighlight('finances.period'), tiles: useTourHighlight('finances.tiles'), list: useTourHighlight('finances.list'), add: useTourHighlight('finances.add') };

  const period = () => (preset === 'custom' ? range : rangeOf(preset));
  const load = useCallback(() => {
    try {
      const { from, to } = period();
      setRows(getExpensesInPeriod(from, to).filter(e => e.recurring_id == null && !(e.comment === 'Автоматически' && ['Амортизация', 'Накладные'].includes(e.category))));
      if (seeCosts) { setRep(getReport(from, to)); setOver(getOverheadItems()); }
      if (isAdmin) { const l = getInvestments(); setInvs(l); setStats(getInvestmentStats()); setSelInv(p => (p && l.find(x => x.id === p.id)) || l[0] || null); }
    } catch (e) { console.error(e); }
  }, [preset, range]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { if (isAdmin && route?.params?.initialTab) setTab(route.params.initialTab); }, [route?.params?.initialTab]);

  const steps = [
    { key: 'finances.period', title: 'Период', text: 'Один период на весь экран — те же «Сегодня», «Неделя», «Месяц», что и в «Отчётности».' },
    { key: 'finances.tiles', title: 'Итоги', text: 'Расходы за период, закупки материалов из «Склада» (в прибыли они учтены через себестоимость) и повторяющиеся расходы.' },
    { key: 'finances.list', title: 'Список', text: 'Нажмите на расход, чтобы изменить. Закупки из «Склада» открываются только для просмотра.' },
    { key: 'finances.add', title: 'Добавить', text: 'Новый расход. Включите «Повторять» для аренды, интернета и т. п. — они будут начисляться по дням.' },
  ];
  useEffect(() => {
    try { if (!getBusinessProfile()?.tours_seen?.Finances) { const t = setTimeout(() => setTourOpen(true), 500); return () => clearTimeout(t); } } catch (_) {}
  }, []);

  const openPop = (kind, ref) => {
    try { ref.current.measureInWindow((x, y, w, h) => { setAnchor({ top: y + h + 8, right: Math.max(8, Dimensions.get('window').width - (x + w)) }); setPop(kind); }); }
    catch (_) { setPop(kind); }
  };
  const label = preset === 'custom' ? `${ddmm(range.from).slice(0, 5)} — ${ddmm(range.to).slice(0, 5)}` : PRESETS.find(p => p.key === preset).label;

  // ── расходы ──
  const ops = rows.filter(r => r.category !== 'Закупка'), buys = rows.filter(r => r.category === 'Закупка');
  const cats = [...new Set(ops.map(r => r.category))];
  const view = rows.filter(r =>
    (flt.src === 'all' || (flt.src === 'stock') === (r.category === 'Закупка')) && (flt.cat === 'all' || r.category === flt.cat) && (!flt.photo || !!r.photo_uri))
    .sort((a, b) => (flt.sort === 'sum' ? b.amount - a.amount : 0));
  const filtersOn = flt.src !== 'all' || flt.cat !== 'all' || flt.sort !== 'new' || flt.photo;
  const byCat = {}; view.filter(r => r.category !== 'Закупка').forEach(r => { byCat[r.category] = (byCat[r.category] || 0) + r.amount; });
  const catList = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]), catMax = Math.max(1, ...catList.map(k => byCat[k]));
  const days = rep?.workedDays || 0;

  const saveExpense = (v) => {
    try {
      if (v.kind === 'recurring') {
        const data = { name: v.name, amount: v.amount, period: v.period };
        if (expModal?.mode === 'recurring' && expModal.item) updateOverheadItem(expModal.item.id, data); else addOverheadItem(data);
      } else if (expModal?.item) updateExpense(expModal.item.id, { category: v.category, amount: v.amount, comment: v.comment, photo_uri: v.photo, date: v.date });
      else insertExpense({ date: v.date, category: v.category, amount: v.amount, comment: v.comment, photo_uri: v.photo, location_id: getCurrentLocationId(), shift_id: getOpenShift()?.id || null });
      load(); return { ok: true };
    } catch (e) { console.error(e); return { ok: false, message: 'Не удалось сохранить. Попробуйте ещё раз.' }; }
  };
  const delExpense = () => { try { expModal.mode === 'recurring' ? deleteOverheadItem(expModal.item.id) : deleteExpense(expModal.item.id); load(); } catch (e) { console.error(e); } };
  const saveInv = (v) => {
    try { invModal?.item ? updateInvestment(invModal.item.id, v) : addInvestment(v); load(); return { ok: true }; }
    catch (e) { console.error(e); return { ok: false, message: 'Не удалось сохранить. Попробуйте ещё раз.' }; }
  };

  const Tile = ({ k, v, s, style }) => (
    <GlassSurface radius={glass.radius.tile} padding={16} style={[{ flex: 1, minWidth: 180 }, style]}>
      <Text style={st.kl}>{k}</Text><Text style={st.val}>{v}</Text>{!!s && <Text style={st.sub}>{s}</Text>}
    </GlassSurface>
  );
  const Chip = ({ on, t, onPress }) => <Pressable style={[st.chip, on && st.chipOn]} onPress={onPress}><Text style={[st.chipT, on && { color: colors.orangeLight }]}>{t}</Text></Pressable>;

  const expensesView = (
    <>
      <View style={[st.tiles, hl.tiles.style]}>
        <Tile k="Расходы за период" v={`${fmt(ops.reduce((a, r) => a + r.amount, 0))} ₽`} s="внесены вручную, без закупок материалов" />
        <Tile k="Закупки материалов" v={`${fmt(buys.reduce((a, r) => a + r.amount, 0))} ₽`} s="автоматически из «Склада»; в прибыли учтены через себестоимость" />
        {seeCosts && <Tile k="Повторяющиеся" v={`${fmt(rep?.overhead)} ₽`} s="начислено за период (аренда, связь и т. д.)" />}
        {hl.tiles.overlay}
      </View>
      <View style={[st.two, isLandscape && { flexDirection: 'row' }]}>
        <View style={[st.lc, isLandscape && { flex: 1.4 }, hl.list.style]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {view.length === 0 ? <Text style={st.empty}>{rows.length ? 'Нет расходов по этим условиям' : 'За период расходов нет'}</Text> : view.map(e => {
              const stock = e.source === 'stock', buy = e.category === 'Закупка';
              return (
                <Pressable key={e.id} style={st.er} onPress={() => setExpModal({ mode: 'expense', item: e })}>
                  <View style={[st.cd, buy && { backgroundColor: 'rgba(127,168,217,0.16)' }]}><Text style={[st.cdT, { color: COLORS[(cats.indexOf(e.category) + 6) % 6] }]}>{e.category.slice(0, 2)}</Text></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={st.erN} numberOfLines={1}>{e.comment || e.category}</Text>{stock && <View style={st.bdg}><Text style={st.bdgT}>Склад</Text></View>}{!!e.photo_uri && <Icon name="receipt" size={14} color={colors.muted} />}</View>
                    <Text style={st.erS}>{e.category} · {ddmm(e.date).slice(0, 5)}</Text>
                  </View>
                  <Text style={st.erA}>{fmt(e.amount)} ₽</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        <View style={[st.rc, isLandscape && { flex: 1 }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={st.sh}>По категориям</Text>
            {catList.length === 0 ? <Text style={st.empty}>Нет данных</Text> : catList.map((k, i) => (
              <View key={k} style={st.cb}><Text style={st.cbN}>{k}</Text><View style={st.cbB}><View style={[st.cbF, { width: `${byCat[k] / catMax * 100}%`, backgroundColor: COLORS[i % 6] }]} /></View><Text style={st.cbV}>{fmt(byCat[k])} ₽</Text></View>))}
            {seeCosts && (
              <>
                <View style={[st.shRow, { marginTop: 22 }]}><Text style={st.sh}>Повторяющиеся</Text>{canAdd && <Pressable onPress={() => setExpModal({ mode: 'recurring', item: null })} hitSlop={8}><Text style={st.link}>+ Добавить</Text></Pressable>}</View>
                {over.length === 0 ? <Text style={st.empty}>Нет повторяющихся расходов</Text> : over.map(o => (
                  <Pressable key={o.id} style={st.rt} onPress={() => setExpModal({ mode: 'recurring', item: o })}>
                    <View style={{ flex: 1 }}><Text style={st.erN}>{o.name}</Text><Text style={st.erS}>{fmt(o.amount)} ₽ {PER[o.period] || 'в месяц'}</Text></View>
                    <Text style={st.erA2}>≈ {fmt(monthly(o) * days / 30)} ₽</Text>
                  </Pressable>))}
                <Text style={st.note}>Повторяющиеся расходы начисляются по дням, отдельные строки каждый месяц не создаются — поэтому в отчёте они не дублируются.</Text>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </>
  );

  const sel = selInv && invs.find(i => i.id === selInv.id);
  const pr = sel && !sel.returnable ? investmentProgress(sel) : null;
  const investView = (
    <>
      <View style={[st.tiles, hl.tiles.style]}>
        <Tile k="Вложено всего" v={`${fmt(stats?.total)} ₽`} s={`${invs.filter(i => !i.returnable).length} вложений`} />
        <Tile k="Амортизация в месяц" v={`${fmt(stats?.monthly)} ₽`} s="попадает в отчёт «Прибыль» отдельной строкой" />
        <Tile k="Окупаемость" v={stats?.payback ? `≈ ${stats.payback.toFixed(1).replace('.', ',')} мес` : '—'} s={stats ? `по прибыли за последние ${stats.days} дн.${stats.lowData ? ' — данных пока мало' : ''}` : ''} />
      </View>
      <View style={[st.two, isLandscape && { flexDirection: 'row' }]}>
        <View style={[st.lc, isLandscape && { flex: 1.4 }, hl.list.style]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {invs.length === 0 ? <Text style={st.empty}>Нет вложений. Добавьте оборудование, ремонт, рекламу — срок окупаемости посчитается сам.</Text> : invs.map(i => (
              <Pressable key={i.id} style={[st.er, sel?.id === i.id && st.erSel]} onPress={() => setSelInv(i)} onLongPress={() => setInvModal({ item: i })}>
                <View style={st.cd}><Text style={[st.cdT, { color: colors.orangeLight }]}>{i.name.slice(0, 2)}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}><Text style={st.erN} numberOfLines={1}>{i.name}</Text><Text style={st.erS}>{INV_CATEGORIES.find(c => c.key === i.category)?.label || 'Прочее'} · с {ddmm(i.invest_date)}</Text></View>
                <Text style={[st.erA, { color: colors.text }]}>{fmt(i.amount)} ₽</Text>
              </Pressable>))}
          </ScrollView>
        </View>
        <View style={[st.rc, isLandscape && { flex: 1 }]}>
          {!sel ? <Text style={st.empty}>Выберите вложение</Text> : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={st.sh}>{sel.name}</Text><Text style={st.big}>{fmt(sel.amount)} ₽</Text>
              {pr ? (
                <>
                  <Text style={st.sub2}>Списывается в амортизацию ≈ {fmt(sel.amount / pr.termDays * 30)} ₽ в месяц — {pr.term} мес, по дням.</Text>
                  <View style={st.cb}><Text style={[st.cbN, { width: 80 }]}>Списано</Text><View style={st.cbB}><View style={[st.cbF, { width: `${pr.done / pr.termDays * 100}%`, backgroundColor: COLORS[0] }]} /></View><Text style={[st.cbV, { width: 130 }]}>{fmt(pr.amortized)} из {fmt(sel.amount)} ₽</Text></View>
                  <Text style={st.note}>Считается с {ddmm(pr.start)} (покупка или начало работы в приложении — что позже), только за прошедшие дни.</Text>
                </>
              ) : <Text style={st.note}>Возвратное вложение (депозит): в затраты и амортизацию не входит.</Text>}
              <GlassButton label="Изменить" height={50} style={{ marginTop: 18 }} onPress={() => setInvModal({ item: sel })} />
            </ScrollView>
          )}
        </View>
      </View>
    </>
  );

  return (
    <View style={st.root}>
      <TopBar title="Расходы" onBack={() => goBackSmart(navigation)} navigation={navigation} activeScreen="Finances"
        rightElement={<Pressable style={st.tourBtn} onPress={() => setTourOpen(true)} hitSlop={10} accessibilityLabel="Подсказка"><Text style={st.tourTxt}>?</Text></Pressable>} />
      <View style={StyleSheet.absoluteFill} pointerEvents="none"><SoftGlow size={620} color="127,168,217" alpha={0.14} style={{ position: 'absolute', left: -170, top: -150 }} /></View>
      <View style={st.tb}>
        {/* Вкладки слева, остальное прижато к правому краю */}
        <View style={{ flex: 1 }}>{isAdmin && <View style={{ maxWidth: 420 }}><GlassSegmented items={[{ key: 'expenses', label: 'Расходы' }, { key: 'investments', label: 'Крупные покупки' }]} value={tab} onChange={setTab} height={46} /></View>}</View>
        <Pressable ref={pRef} collapsable={false} style={[st.pbtn, hl.period.style, pop === 'p' && st.pbtnOn, { position: 'relative' }]} onPress={() => openPop('p', pRef)}>
          <Icon name="calendar" size={18} color={colors.textDim} /><Text style={st.pbtnT}>{label}</Text><Text style={st.car}>▾</Text>{hl.period.overlay}
        </Pressable>
        {tab === 'expenses' && (
          <Pressable ref={fRef} collapsable={false} style={[st.pbtn, filtersOn && st.pbtnOn]} onPress={() => openPop('f', fRef)}>
            <Icon name="sliders" size={18} color={filtersOn ? colors.orangeLight : colors.textDim} /><Text style={[st.pbtnT, filtersOn && { color: colors.orangeLight }]}>Фильтры</Text>
          </Pressable>
        )}
        {canAdd && <View style={{ position: 'relative', ...hl.add.style }}><GlassButton tone="solid" icon="plus" label={tab === 'expenses' ? 'Расход' : 'Вложение'} height={52} onPress={() => (tab === 'expenses' ? setExpModal({ mode: 'expense', item: null }) : setInvModal({ item: null }))} />{hl.add.overlay}</View>}
      </View>
      <View style={{ flex: 1, padding: 20, paddingTop: 14 }}>{tab === 'expenses' || !isAdmin ? expensesView : investView}</View>

      <Modal visible={!!pop} transparent animationType="fade" onRequestClose={() => setPop(null)}>
        <View style={{ flex: 1 }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPop(null)} />
          <View style={[st.pop, { top: anchor.top, right: anchor.right }]}>
            <GlassSurface floating radius={22} tint="32,40,55" alpha={0.97} padding={20} sheen={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.01)']}>
              {pop === 'p' ? (
                <>
                  <Text style={st.pl}>Период</Text>
                  <View style={st.chips}>{[...PRESETS, { key: 'custom', label: 'Свой период…' }].map(p => <Chip key={p.key} on={preset === p.key} t={p.label} onPress={() => { if (p.key === 'custom') { setPop(null); setPicker('from'); } else { setPreset(p.key); setPop(null); } }} />)}</View>
                  <Text style={st.pf}>{ddmm(period().from)} — {ddmm(period().to)}</Text>
                </>
              ) : (
                <>
                  <Text style={st.pl}>Показывать</Text>
                  <View style={st.chips}>{[['all', 'Все'], ['manual', 'Внесённые вручную'], ['stock', 'Закупки из «Склада»']].map(([k, t]) => <Chip key={k} on={flt.src === k} t={t} onPress={() => setFlt(f => ({ ...f, src: k }))} />)}</View>
                  {cats.length > 0 && <><Text style={[st.pl, { marginTop: 16 }]}>Категория</Text><View style={st.chips}>{['all', ...cats].map(k => <Chip key={k} on={flt.cat === k} t={k === 'all' ? 'Все' : k} onPress={() => setFlt(f => ({ ...f, cat: k }))} />)}</View></>}
                  <Text style={[st.pl, { marginTop: 16 }]}>Порядок</Text>
                  <View style={st.chips}>{[['new', 'Сначала новые'], ['sum', 'По сумме']].map(([k, t]) => <Chip key={k} on={flt.sort === k} t={t} onPress={() => setFlt(f => ({ ...f, sort: k }))} />)}</View>
                  <View style={st.tg}><Text style={st.tgT}>Только с фото чека</Text><Toggle value={flt.photo} onValueChange={v => setFlt(f => ({ ...f, photo: v }))} /></View>
                  <View style={st.pfoot}>
                    <Pressable onPress={() => setFlt(FLT0)} disabled={!filtersOn} hitSlop={8}><Text style={[st.reset, !filtersOn && { opacity: 0.4 }]}>Сбросить</Text></Pressable>
                    <Text style={st.cnt}>Найдено <Text style={st.cntB}>{view.length} · {fmt(view.reduce((a, r) => a + r.amount, 0))} ₽</Text></Text>
                  </View>
                </>
              )}
            </GlassSurface>
          </View>
        </View>
      </Modal>

      <DatePicker visible={picker === 'from'} value={range.from} title="Начало периода" onClose={() => setPicker(null)} onChange={v => { setRange(x => ({ ...x, from: v })); setPicker('to'); }} />
      <DatePicker visible={picker === 'to'} value={range.to} title="Конец периода" onClose={() => setPicker(null)} onChange={v => { setRange(x => ({ ...x, to: v })); setPreset('custom'); setPicker(null); }} />
      <ExpenseEditModal visible={!!expModal} mode={expModal?.mode} item={expModal?.item} onSave={saveExpense} onDelete={delExpense} onClose={() => setExpModal(null)} isNarrow={!isLandscape} />
      <InvestmentEditModal visible={!!invModal} item={invModal?.item} onSave={saveInv} onDelete={() => { try { deleteInvestment(invModal.item.id); load(); } catch (e) { console.error(e); } }} onClose={() => setInvModal(null)} isNarrow={!isLandscape} />
      <TourGuide visible={tourOpen} onClose={() => { setTourOpen(false); markTourSeen('Finances'); }} steps={steps} />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tourBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(127,168,217,0.1)', borderWidth: 1, borderColor: 'rgba(127,168,217,0.3)', alignItems: 'center', justifyContent: 'center' }, tourTxt: { fontFamily: fonts.family, fontSize: 18, color: colors.orange },
  tb: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 14 },
  pbtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, pbtnOn: { backgroundColor: 'rgba(127,168,217,0.18)', borderColor: 'rgba(157,191,230,0.5)' },
  pbtnT: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, car: { fontSize: 11, color: colors.muted },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12, position: 'relative' },
  kl: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textDim }, val: { fontFamily: fonts.display, fontSize: 26, color: colors.text, marginTop: 6, letterSpacing: -0.4 }, sub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 5, lineHeight: 17 },
  two: { flex: 1, gap: 12 }, lc: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 14, paddingVertical: 8 }, rc: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 18 },
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', padding: 28, lineHeight: 21 },
  er: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }, erSel: { backgroundColor: 'rgba(127,168,217,0.09)', borderRadius: 10 },
  cd: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }, cdT: { fontFamily: fonts.family, fontSize: 12 },
  erN: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text, flexShrink: 1 }, erS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 }, erA: { fontFamily: fonts.familySemibold, fontSize: 16, color: '#E9A9A2' }, erA2: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  bdg: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(157,191,230,0.4)' }, bdgT: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.orangeLight },
  sh: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginBottom: 8 }, shRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, link: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orangeLight },
  cb: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 }, cbN: { width: 110, fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim }, cbB: { flex: 1, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }, cbF: { height: 10, borderRadius: 5 }, cbV: { width: 96, textAlign: 'right', fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  rt: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  note: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  big: { fontFamily: fonts.display, fontSize: 34, color: colors.text, letterSpacing: -0.6, marginBottom: 6 }, sub2: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim, lineHeight: 21 },
  pop: { position: 'absolute', width: 420, maxWidth: '94%' }, pl: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.textDim, marginBottom: 10 }, pf: { marginTop: 14, fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { height: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }, chipOn: { backgroundColor: 'rgba(127,168,217,0.22)', borderColor: 'rgba(157,191,230,0.5)' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  tg: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }, tgT: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  pfoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)' }, reset: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim }, cnt: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted }, cntB: { fontFamily: fonts.familySemibold, color: colors.text },
});
