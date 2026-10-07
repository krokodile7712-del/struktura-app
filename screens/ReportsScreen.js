import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, Dimensions, LayoutAnimation } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import TourGuide from '../components/TourGuide';
import DatePicker from '../components/DatePicker';
import Toggle from '../components/Toggle';
import GlassSurface from '../components/GlassSurface';
import GlassSegmented from '../components/GlassSegmented';
import Icon from '../components/Icon';
import SoftGlow from '../components/SoftGlow';
import { useTourHighlight, useTourActiveKey } from '../components/TourRegistry';
import { useResponsive } from '../hooks/useResponsive';
import { getBusinessProfile, markTourSeen } from '../db/queries';
import { getReport, prevPeriod, localDate, PRESETS, rangeOf } from '../db/reports';
import { goBackSmart, can } from '../db/session';
import { colors, fonts, glass } from '../constants/theme';

// Отчётность: четыре вкладки на единой модели db/reports.js — каждая цифра считается один раз и
// показывается в одном месте (раньше «P&L», «Полный» и правая панель считали и показывали «чистую прибыль» по-разному).
const TABS = [{ key: 'sum', label: 'Итоги' }, { key: 'profit', label: 'Прибыль' }, { key: 'kpi', label: 'Показатели' }, { key: 'charts', label: 'Графики' }];
const fmt = n => Math.round(n || 0).toLocaleString('ru-RU');
const pct = n => `${(Math.round((n || 0) * 10) / 10).toString().replace('.', ',')}%`;
const dm = k => (k.length === 7 ? `${k.slice(5)}.${k.slice(2, 4)}` : k.slice(8) + '.' + k.slice(5, 7));
const ddmm = s => s.split('-').reverse().join('.');

function Tile({ label, value, delta, style, big }) {
  return (
    <GlassSurface radius={glass.radius.tile} padding={big ? 22 : 16} style={style}>
      <Text style={s.kl}>{label}</Text>
      <Text style={big ? s.big : s.val}>{value}</Text>
      {delta}
    </GlassSurface>
  );
}
const Card = ({ title, children }) => <View style={s.card}>{!!title && <Text style={s.cardT}>{title}</Text>}{children}</View>;

export default function ReportsScreen({ navigation }) {
  const { isLandscape } = useResponsive();
  const [preset, setPreset] = useState('week');
  const [range, setRange] = useState(() => rangeOf('month30'));
  const [tab, setTab] = useState('sum');
  const [compare, setCompare] = useState(true);
  const [r, setR] = useState(null);
  const [prev, setPrev] = useState(null);
  const [isCoffee, setIsCoffee] = useState(false);
  const [popOpen, setPopOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 70, right: 20 });
  const [picker, setPicker] = useState(null);   // 'from' | 'to'
  const [open, setOpen] = useState(null);       // раскрытая строка прибыли
  const [topMode, setTopMode] = useState('qty');
  const [sel, setSel] = useState(null);         // выбранный столбец графика
  const [tourOpen, setTourOpen] = useState(false);
  const btnRef = useRef(null);
  const activeTourKey = useTourActiveKey();
  const hl = { sum: useTourHighlight('reports.summary'), profit: useTourHighlight('reports.profit'), kpi: useTourHighlight('reports.metrics'), charts: useTourHighlight('reports.charts') };
  const filtersHl = useTourHighlight('reports.filters');

  const period = () => (preset === 'custom' ? range : rangeOf(preset));
  const load = useCallback(() => {
    try {
      const { from, to } = period();
      setR(getReport(from, to));
      const pp = prevPeriod(from, to);
      setPrev(compare ? getReport(pp.from, pp.to) : null);
      setIsCoffee(getBusinessProfile()?.preset === 'coffee');
    } catch (e) { console.error(e); }
  }, [preset, range, compare]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { setSel(null); }, [tab, preset, range]);

  const steps = [
    { key: 'reports.filters', title: 'Период', text: 'Выберите «Сегодня», «Неделя», «Месяц» или свой период — все вкладки пересчитаются. Можно включить сравнение с прошлым периодом.' },
    { key: 'reports.summary', title: 'Итоги', text: 'Чистая прибыль, выручка, заказы, средний чек и способы оплаты — главное за период одним взглядом.' },
    { key: 'reports.profit', title: 'Прибыль', text: 'Путь от выручки до чистой прибыли. Нажмите на строку с стрелкой — увидите, из чего она состоит.' },
    { key: 'reports.metrics', title: 'Показатели', text: 'Здоровье бизнеса: доля зарплаты, себестоимость, точка безубыточности и запас прочности, эффективность сотрудников.' },
    { key: 'reports.charts', title: 'Графики', text: 'Выручка по дням, загруженные часы и самые продаваемые товары — наглядно.' },
  ];
  const tabByKey = { 'reports.summary': 'sum', 'reports.profit': 'profit', 'reports.metrics': 'kpi', 'reports.charts': 'charts' };
  useEffect(() => { if (tabByKey[activeTourKey]) setTab(tabByKey[activeTourKey]); }, [activeTourKey]);
  useEffect(() => {
    try { if (!getBusinessProfile()?.tours_seen?.Reports) { const t = setTimeout(() => setTourOpen(true), 500); return () => clearTimeout(t); } } catch (_) {}
  }, []);

  if (!can('view_reports')) return (
    <View style={s.root}><TopBar title="Отчётность" onBack={() => goBackSmart(navigation)} />
      <View style={s.center}><Text style={s.emptyT}>Нет доступа</Text><Text style={s.emptyX}>Обратитесь к администратору</Text></View></View>
  );

  const openPop = () => {
    try { btnRef.current.measureInWindow((x, y, w, h) => { setAnchor({ top: y + h + 8, right: Math.max(8, Dimensions.get('window').width - (x + w)) }); setPopOpen(true); }); }
    catch (_) { setPopOpen(true); }
  };
  const label = preset === 'custom' ? `${ddmm(range.from).slice(0, 5)} — ${ddmm(range.to).slice(0, 5)}` : PRESETS.find(p => p.key === preset).label;
  const Delta = ({ a, b, invert }) => {
    if (!prev || !b) return null;
    const d = (a - b) / Math.abs(b) * 100, good = invert ? d < 0 : d > 0;
    return <Text style={[s.delta, Math.abs(d) >= 0.05 && { color: good ? colors.green : colors.warning }]}>{d > 0 ? '↑' : '↓'} {Math.abs(d).toFixed(1).replace('.', ',')}% к прошлому</Text>;
  };
  const empty = !r || (r.orders === 0 && r.expenses === 0 && r.fixed === 0);

  // ── строка цепочки прибыли ──
  const Row = ({ k, name, sub, amount, kind, items }) => {
    const isOpen = open === k, can_ = items && items.length > 0;
    return (
      <>
        <Pressable disabled={!can_} style={[s.row, kind === 'sub' && s.rowSub, kind === 'total' && s.rowTotal]}
          onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity')); setOpen(isOpen ? null : k); }}>
          <View style={{ flex: 1 }}><Text style={s.rowN}>{name}</Text>{!!sub && <Text style={s.rowS}>{sub}</Text>}</View>
          <Text style={s.rowP}>{r.revenue ? pct(Math.abs(amount) / r.revenue * 100) : ''}</Text>
          <Text style={[s.rowA, kind === 'cost' && { color: colors.red }, kind === 'plus' && { color: colors.green }, kind === 'total' && { color: amount >= 0 ? colors.green : colors.red, fontSize: 24 }]}>{kind === 'cost' ? '−' : kind === 'plus' ? '+' : ''}{fmt(Math.abs(amount))} ₽</Text>
          <Text style={[s.chev, isOpen && { transform: [{ rotate: '90deg' }] }]}>{can_ ? '›' : ''}</Text>
        </Pressable>
        {isOpen && can_ && <View style={s.det}>{items.map((x, i) => <View key={i} style={s.detRow}><Text style={s.detN}>{x.name}</Text><Text style={s.detA}>{fmt(x.sum)} ₽</Text></View>)}</View>}
      </>
    );
  };

  const Bars = ({ data, k, label, val, color }) => {
    const m = Math.max(1, ...data.map(val));
    return (
      <View style={s.chart}>
        {data.map((d, i) => {
          const on = sel && sel.k === k && sel.i === i;
          return (
            <Pressable key={i} style={s.col} onPress={() => setSel(on ? null : { k, i })}>
              <Text style={[s.colV, on && { color: colors.text }]} numberOfLines={1}>{data.length <= 13 || on ? fmt(val(d)) : ''}</Text>
              <View style={[s.bar, { height: Math.max(4, val(d) / m * 150), backgroundColor: color, opacity: sel && !on ? 0.45 : 1 }]} />
              <Text style={s.colL} numberOfLines={1}>{label(d)}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const kpi = r && [
    { ok: r.payrollPct < 35, n: 'Зарплата к выручке', x: 'норма: до 35%', v: pct(r.payrollPct) },
    { ok: isCoffee ? r.cogsPct < 30 : null, n: 'Себестоимость к выручке', x: isCoffee ? 'норма для кофейни: 25–30%' : 'зависит от отрасли — ориентируйтесь на свою историю', v: pct(r.cogsPct) },
    ...(r.breakEven != null ? [
      { ok: null, n: 'Точка безубыточности', x: `выручка за период, покрывающая постоянные затраты (${fmt(r.fixed)} ₽)`, v: `${fmt(r.breakEven)} ₽` },
      { ok: r.safetyPct >= 0, n: 'Запас прочности', x: 'насколько выручка выше точки безубыточности', v: pct(r.safetyPct) }] : []),
    ...(r.perShift != null ? [{ ok: null, n: 'Выручка за смену', x: `смен за период: ${r.shiftsCount}`, v: `${fmt(r.perShift)} ₽` }] : []),
  ];

  const page = !r ? null : empty ? (
    <View style={s.center}><Text style={s.emptyT}>Нет данных за период</Text><Text style={s.emptyX}>Измените период или оформите первые заказы</Text></View>
  ) : tab === 'sum' ? (
    <>
      <Tile big label="Чистая прибыль" value={`${fmt(r.net)} ₽`} delta={<Delta a={r.net} b={prev?.net} />} style={{ marginBottom: 12 }} />
      <View style={s.grid}>
        <Tile label="Выручка" value={`${fmt(r.revenue)} ₽`} delta={<Delta a={r.revenue} b={prev?.revenue} />} style={s.cell} />
        <Tile label="Заказов" value={String(r.orders)} delta={<Delta a={r.orders} b={prev?.orders} />} style={s.cell} />
        <Tile label="Средний чек" value={`${fmt(r.avgCheck)} ₽`} delta={<Delta a={r.avgCheck} b={prev?.avgCheck} />} style={s.cell} />
        <Tile label="Валовая маржа" value={pct(r.grossPct)} delta={<Delta a={r.grossPct} b={prev?.grossPct} />} style={s.cell} />
      </View>
      <Card title="Способы оплаты">
        {r.payments.length === 0 ? <Text style={s.emptyX}>Нет оплат</Text> : <>
          <View style={s.stack}>{r.payments.map((p, i) => <View key={i} style={{ flex: p.sum, backgroundColor: PAY[i % PAY.length] }} />)}</View>
          {r.payments.map((p, i) => <View key={i} style={s.pr}><View style={[s.dot, { backgroundColor: PAY[i % PAY.length] }]} /><Text style={s.prN}>{p.name}</Text><Text style={s.prP}>{pct(p.sum / r.payments.reduce((a, x) => a + x.sum, 0) * 100)}</Text><Text style={s.prV}>{fmt(p.sum)} ₽</Text></View>)}</>}
      </Card>
      {r.returns.count > 0 && <View style={s.warn}><Text style={s.warnT}>Возвраты: {r.returns.count} на {fmt(r.returns.sum)} ₽ — в выручку не входят.</Text></View>}
    </>
  ) : tab === 'profit' ? (
    <>
      <View style={s.card}>
        <Row k="rev" kind="sub" name="Выручка" sub={`заказов: ${r.orders}`} amount={r.revenue} />
        <Row k="cogs" kind="cost" name="Себестоимость" sub="по техкартам проданных позиций" amount={r.cogs} />
        {r.purchasesAsCost > 0 && <Row k="buy" kind="cost" name="Закупки материалов" sub="себестоимость не заполнена — закупки считаются затратами" amount={r.purchasesAsCost} />}
        <Row k="gross" kind="sub" name="Валовая прибыль" sub="выручка − себестоимость" amount={r.gross} />
        <Row k="exp" kind="cost" name="Расходы" sub="из раздела «Расходы», без закупок материалов" amount={r.expenses} items={r.expItems} />
        <Row k="oh" kind="cost" name="Накладные" sub="аренда и др. за период" amount={r.overhead} items={r.overheadItems} />
        <Row k="sal" kind="cost" name="Зарплата" sub="по сменам" amount={r.salary} items={r.salaryItems} />
        <Row k="dep" kind="cost" name="Амортизация" sub="оборудование" amount={r.depreciation} />
        {r.shrinkage !== 0 && <Row k="shr" kind={r.shrinkage > 0 ? 'cost' : 'plus'} name={r.shrinkage > 0 ? 'Недостачи' : 'Излишки'} sub="по подтверждённым инвентаризациям" amount={Math.abs(r.shrinkage)} />}
        <Row k="net" kind="total" name="Чистая прибыль" sub="после всех затрат" amount={r.net} />
      </View>
      {r.purchasesAsCost > 0
        ? <View style={s.warn}><Text style={s.warnT}>Себестоимость = 0: заполните техкарты в разделе «Товары» — тогда закупки не будут вычитаться как затраты, а прибыль станет точнее.</Text></View>
        : r.purchases > 0 && <Card><View style={s.pr}><View style={{ flex: 1 }}><Text style={s.rowN}>Закупки материалов за период</Text><Text style={s.rowS}>Не вычитаются отдельно: материалы уже учтены через себестоимость проданного — затраты не считаются дважды.</Text></View><Text style={s.prV}>{fmt(r.purchases)} ₽</Text></View></Card>}
    </>
  ) : tab === 'kpi' ? (
    <>
      <View style={s.card}>{kpi.map((k, i) => (
        <View key={i} style={[s.kp, i > 0 && s.kpDiv]}><View style={[s.dot, { backgroundColor: k.ok == null ? colors.muted : k.ok ? colors.green : colors.warning, marginRight: 14 }]} />
          <View style={{ flex: 1 }}><Text style={s.rowN}>{k.n}</Text><Text style={s.rowS}>{k.x}</Text></View><Text style={s.kv}>{k.v}</Text></View>))}</View>
      <Card title="Эффективность сотрудников">
        {r.employees.length === 0 ? <Text style={s.emptyX}>Нет данных</Text> : r.employees.map((e, i) => <View key={i} style={s.pr}><Text style={s.prN}>{e.name}</Text><Text style={s.prP}>{e.orders} заказов · ср. чек {fmt(e.sum / e.orders)} ₽</Text><Text style={s.prV}>{fmt(e.sum)} ₽</Text></View>)}
      </Card>
    </>
  ) : (
    <>
      <Card title={r.byDay.length && r.byDay[0].key.length === 7 ? 'Выручка по месяцам' : 'Выручка по дням'}>
        <Bars k="day" data={r.byDay} val={d => d.total} label={d => dm(d.key)} color={colors.orange} />
      </Card>
      <Card title="Пиковые часы · заказов по часам">
        <Bars k="hr" data={r.byHour} val={d => d.orders} label={d => String(d.hour).padStart(2, '0')} color={colors.indigo} />
      </Card>
      <Card>
        <View style={s.topHead}><Text style={s.cardT}>Топ товаров</Text><View style={{ width: 280 }}><GlassSegmented height={36} items={[{ key: 'qty', label: 'По количеству' }, { key: 'sum', label: 'По выручке' }]} value={topMode} onChange={setTopMode} /></View></View>
        {[...r.top].sort((a, b) => b[topMode] - a[topMode]).map((t, i, a) => (
          <View key={i} style={s.hb}><Text style={s.hbN} numberOfLines={1}>{t.name}</Text>
            <View style={s.hbB}><View style={[s.hbF, { width: `${t[topMode] / Math.max(1, a[0][topMode]) * 100}%` }]} /></View>
            <Text style={s.hbV}>{topMode === 'qty' ? `${t.qty} шт` : `${fmt(t.sum)} ₽`}</Text></View>))}
        {r.top.length === 0 && <Text style={s.emptyX}>Нет продаж</Text>}
      </Card>
    </>
  );

  return (
    <View style={s.root}>
      <TopBar title="Отчётность" onBack={() => goBackSmart(navigation)} navigation={navigation} activeScreen="Reports"
        rightElement={<Pressable style={s.tourBtn} onPress={() => setTourOpen(true)} hitSlop={10} accessibilityLabel="Подсказка"><Text style={s.tourTxt}>?</Text></Pressable>} />
      <View style={[s.glow]} pointerEvents="none"><SoftGlow size={620} color="127,168,217" alpha={0.15} style={{ position: 'absolute', left: -170, top: -150 }} /></View>
      <View style={[s.tb, { position: 'relative' }, filtersHl.style]}>
        <View style={{ flex: 1, maxWidth: 640 }}><GlassSegmented items={TABS} value={tab} onChange={k => { setTab(k); setOpen(null); }} height={46} /></View>
        {compare && <Text style={s.cmp}>↑ сравнение включено</Text>}
        <Pressable ref={btnRef} collapsable={false} style={[s.pbtn, popOpen && s.pbtnOn]} onPress={openPop}>
          <Icon name="calendar" size={18} color={colors.textDim} /><Text style={s.pbtnT}>{label}</Text><Text style={s.car}>▾</Text>
        </Pressable>
        {filtersHl.overlay}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ position: 'relative' }}>{page}{hl[tab].overlay}</View>
      </ScrollView>

      <Modal visible={popOpen} transparent animationType="fade" onRequestClose={() => setPopOpen(false)}>
        <View style={{ flex: 1 }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPopOpen(false)} />
          <View style={[s.pop, { top: anchor.top, right: anchor.right }]}>
            <GlassSurface floating radius={22} tint="32,40,55" alpha={0.97} padding={20} sheen={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.01)']}>
              <Text style={s.popL}>Период</Text>
              <View style={s.chips}>
                {[...PRESETS, { key: 'custom', label: 'Свой период…' }].map(p => (
                  <Pressable key={p.key} style={[s.chip, preset === p.key && s.chipOn]}
                    onPress={() => { if (p.key === 'custom') { setPopOpen(false); setPicker('from'); } else { setPreset(p.key); setPopOpen(false); } }}>
                    <Text style={[s.chipT, preset === p.key && { color: colors.orangeLight }]}>{p.label}</Text></Pressable>))}
              </View>
              <Text style={[s.popL, { marginTop: 16 }]}>Сравнение</Text>
              <View style={s.tg}><Text style={s.tgT}>С прошлым периодом</Text><Toggle value={compare} onValueChange={setCompare} /></View>
              {!!r && <View style={s.popF}><Text style={s.popR}>{ddmm(r.from)} — {ddmm(r.to)}</Text></View>}
            </GlassSurface>
          </View>
        </View>
      </Modal>

      <DatePicker visible={picker === 'from'} value={range.from} title="Начало периода" onClose={() => setPicker(null)}
        onChange={v => { setRange(x => ({ ...x, from: v })); setPicker('to'); }} />
      <DatePicker visible={picker === 'to'} value={range.to} title="Конец периода" onClose={() => setPicker(null)}
        onChange={v => { setRange(x => ({ ...x, to: v })); setPreset('custom'); setPicker(null); }} />
      <TourGuide visible={tourOpen} onClose={() => { setTourOpen(false); markTourSeen('Reports'); }} steps={steps} />
    </View>
  );
}

const PAY = ['#9DBFE6', '#A5A8D4', '#78B796', '#D9AC62', '#DB8178'];
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg }, glow: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyT: { fontFamily: fonts.family, fontSize: 18, color: colors.text, textAlign: 'center' }, emptyX: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8 },
  tourBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(127,168,217,0.1)', borderWidth: 1, borderColor: 'rgba(127,168,217,0.3)', alignItems: 'center', justifyContent: 'center' }, tourTxt: { fontFamily: fonts.family, fontSize: 18, color: colors.orange },
  tb: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 14 },
  cmp: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.green, marginLeft: 'auto' },
  pbtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', marginLeft: 'auto' }, pbtnOn: { backgroundColor: 'rgba(127,168,217,0.18)', borderColor: 'rgba(157,191,230,0.5)' },
  pbtnT: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, car: { fontSize: 11, color: colors.muted },
  kl: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textDim },
  val: { fontFamily: fonts.display, fontSize: 26, color: colors.text, marginTop: 6, letterSpacing: -0.4 }, big: { fontFamily: fonts.display, fontSize: 56, color: colors.text, marginTop: 8, letterSpacing: -1.8 },
  delta: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }, cell: { flexGrow: 1, flexBasis: '22%', minWidth: 160 },
  card: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 20, paddingVertical: 8, marginBottom: 12 },
  cardT: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginTop: 10, marginBottom: 8 },
  stack: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
  pr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 }, dot: { width: 9, height: 9, borderRadius: 5, marginRight: 10 },
  prN: { flex: 1, fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, prP: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginRight: 16 }, prV: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  warn: { padding: 14, borderRadius: 14, backgroundColor: 'rgba(217,172,98,0.08)', borderWidth: 1, borderColor: 'rgba(217,172,98,0.25)', marginBottom: 12 }, warnT: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.warning, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 62, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' }, rowSub: { backgroundColor: 'rgba(127,168,217,0.06)', marginHorizontal: -20, paddingHorizontal: 20 }, rowTotal: { minHeight: 72 },
  rowN: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text }, rowS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  rowP: { width: 64, textAlign: 'right', fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted }, rowA: { width: 140, textAlign: 'right', fontFamily: fonts.familySemibold, fontSize: 18, color: colors.text }, chev: { width: 24, textAlign: 'center', fontSize: 20, color: colors.muted },
  det: { paddingLeft: 16, paddingBottom: 8 }, detRow: { flexDirection: 'row', paddingVertical: 5 }, detN: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim }, detA: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginRight: 88 },
  kp: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }, kpDiv: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' }, kv: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 210, gap: 8, paddingTop: 8 }, col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '100%', maxWidth: 70, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  colV: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim, marginBottom: 6 }, colL: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 8 },
  topHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }, hb: { flexDirection: 'row', alignItems: 'center', marginVertical: 7 },
  hbN: { width: 130, fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim }, hbB: { flex: 1, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }, hbF: { height: 12, borderRadius: 6, backgroundColor: colors.indigo }, hbV: { width: 110, textAlign: 'right', fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  pop: { position: 'absolute', width: 420, maxWidth: '94%' }, popL: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.textDim, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { height: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }, chipOn: { backgroundColor: 'rgba(127,168,217,0.22)', borderColor: 'rgba(157,191,230,0.5)' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  tg: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, tgT: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  popF: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }, popR: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
});
