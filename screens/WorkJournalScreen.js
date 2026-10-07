import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, Alert, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import TourGuide from '../components/TourGuide';
import DatePicker from '../components/DatePicker';
import GlassSurface from '../components/GlassSurface';
import GlassSegmented from '../components/GlassSegmented';
import GlassButton from '../components/GlassButton';
import Icon from '../components/Icon';
import SoftGlow from '../components/SoftGlow';
import KeyboardSafe from '../components/KeyboardSafe';
import ShiftTimeModal from '../components/ShiftTimeModal';
import NewShiftModal from '../components/NewShiftModal';
import { useToast } from '../components/Toast';
import { useResponsive } from '../hooks/useResponsive';
import { useTourHighlight } from '../components/TourRegistry';
import {
  getWorkJournal, getShiftCard, closeShift, deleteShift, updateShiftHours, createManualShift, openShift, setShiftAdjustment,
  getAllEmployeesSalary, calcEmployeeSalary, getUsers, getBusinessProfile, markTourSeen,
} from '../db/queries';
import { getReport, PRESETS, rangeOf } from '../db/reports';
import { goBackSmart, getSession, getCurrentLocationId } from '../db/session';
import { rateText, shiftPay, fmtDur } from '../utils/shiftPay';
import { colors, fonts, glass } from '../constants/theme';

// Журнал работы: «Смены» (история со статусами и деталями) и «Зарплата» (расчёт по сотрудникам). Период и пресеты — общие
// с «Отчётностью»; зарплата считается той же функцией, что и в отчёте, поэтому «к выплате» совпадает со строкой «Зарплата» в «Прибыли».
const fmt = n => Math.round(n || 0).toLocaleString('ru-RU');
const MO = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const dl = iso => { const d = new Date(iso); return `${d.getDate()} ${MO[d.getMonth()]}`; };
const tm = iso => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const ddmm = s => String(s || '').slice(0, 10).split('-').reverse().join('.');
const minsOf = sh => Math.round(((sh.closed_at ? new Date(sh.closed_at) : new Date()) - new Date(sh.opened_at)) / 60000);
const sg = n => (n < 0 ? '−' : '+');

export default function WorkJournalScreen({ navigation }) {
  const { isLandscape } = useResponsive();
  const toast = useToast();
  const isAdmin = getSession()?.role === 'admin';
  const [tab, setTab] = useState('shifts');
  const [preset, setPreset] = useState('month');
  const [range, setRange] = useState(() => rangeOf('month30'));
  const [q, setQ] = useState('');
  const [shifts, setShifts] = useState([]); const [sel, setSel] = useState(null); const [card, setCard] = useState(null); const [showAll, setShowAll] = useState(false);
  const [salary, setSalary] = useState([]); const [selEmp, setSelEmp] = useState(null); const [detail, setDetail] = useState(null);
  const [users, setUsers] = useState([]);
  const [pop, setPop] = useState(false); const [anchor, setAnchor] = useState({ top: 70, right: 20 }); const [picker, setPicker] = useState(null);
  const [timeModal, setTimeModal] = useState(null); const [newOpen, setNewOpen] = useState(false); const [adjModal, setAdjModal] = useState(null);
  const [tourOpen, setTourOpen] = useState(false);
  const pRef = useRef(null);
  const hl = { period: useTourHighlight('journal.period'), list: useTourHighlight('journal.list'), card: useTourHighlight('journal.card'), add: useTourHighlight('journal.add') };

  const period = () => (preset === 'custom' ? range : rangeOf(preset));
  const load = useCallback(() => {
    try {
      const { from, to } = period();
      const list = getWorkJournal({ dateFrom: from, dateTo: to, limit: 500 });
      setShifts(list);
      setSel(p => (p && list.find(x => x.id === p) ? p : list[0]?.id || null));
      setUsers((getUsers() || []).filter(u => u.active !== 0));
      if (isAdmin) {
        const sal = getAllEmployeesSalary(from, to); setSalary(sal);
        setSelEmp(p => (p && sal.find(r => r.user.id === p) ? p : sal[0]?.user.id || null));
      }
    } catch (e) { console.error(e); }
  }, [preset, range]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { try { setCard(sel ? getShiftCard(sel) : null); setShowAll(false); } catch (e) { console.error(e); } }, [sel, shifts]);
  useEffect(() => { try { setDetail(selEmp ? calcEmployeeSalary(selEmp, period().from, period().to) : null); } catch (e) { console.error(e); } }, [selEmp, salary]);
  useEffect(() => { try { if (!getBusinessProfile()?.tours_seen?.WorkJournal) { const t = setTimeout(() => setTourOpen(true), 500); return () => clearTimeout(t); } } catch (_) {} }, []);

  const steps = [
    { key: 'journal.period', title: 'Период', text: 'Те же «Сегодня», «Неделя», «Месяц», что и в «Отчётности». Зарплата считается по смене и по времени — одна формула на весь экран и отчёт.' },
    { key: 'journal.list', title: 'Смены', text: 'История смен со статусом: идёт или закрыта. Найти смену можно по сотруднику или дате.' },
    { key: 'journal.card', title: 'Карточка', text: 'Время, выручка, оплата, начисление и что продано. Время смены можно поправить (администратор), причина запоминается.' },
    { key: 'journal.add', title: '+ Смена', text: 'Открыть смену сейчас или добавить задним числом — выберите сотрудника, которому она засчитывается.' },
  ];
  const openPop = () => {
    try { pRef.current.measureInWindow((x, y, w, h) => { setAnchor({ top: y + h + 8, right: Math.max(8, Dimensions.get('window').width - (x + w)) }); setPop(true); }); }
    catch (_) { setPop(true); }
  };
  const label = preset === 'custom' ? `${ddmm(range.from).slice(0, 5)} — ${ddmm(range.to).slice(0, 5)}` : PRESETS.find(p => p.key === preset).label;

  // ── действия ──
  const closeIt = () => { try { closeShift(card.shift.id); toast.show('Смена закрыта'); load(); } catch (e) { console.error(e); toast.show('Не удалось закрыть смену', 'warn'); } };
  const askDelete = () => Alert.alert('Удалить смену?', card.orders > 0 ? `В смене ${card.orders} заказов — они останутся в продажах, но без привязки к смене.` : 'Смена будет удалена.', [{ text: 'Отмена' }, { text: 'Удалить', style: 'destructive', onPress: () => { try { deleteShift(card.shift.id); load(); } catch (e) { console.error(e); } } }]);
  const saveTime = ({ openedAt, closedAt, reason }) => { try { updateShiftHours(card.shift.id, { openedAt, closedAt, reason }); toast.show('Время смены сохранено'); load(); } catch (e) { console.error(e); toast.show('Не удалось сохранить время', 'warn'); } };
  const createShifts = ({ mode, employee, days, reason, adjustment }) => {
    try {
      if (mode === 'now') { openShift(0, employee.id, employee.name, getCurrentLocationId()); toast.show(`Смена открыта: ${employee.name}`); }
      else {
        let first = null;
        days.forEach((d, i) => { const id = createManualShift(employee.id, employee.name, d.start, d.end, getCurrentLocationId(), reason); if (i === 0) first = id; });
        // Доплата ложится на первую из созданных смен — иначе при нескольких днях сумма незаметно умножалась бы
        if (adjustment && first) setShiftAdjustment(first, adjustment, reason);
        toast.show(`Добавлено смен: ${days.length}`);
      }
      load(); return { ok: true };
    } catch (e) { console.error(e); return { ok: false, message: 'Не удалось создать смену. Попробуйте ещё раз.' }; }
  };
  const saveAdj = () => {
    try { setShiftAdjustment(adjModal.shift.id, adjModal.value, adjModal.reason.trim()); setAdjModal(null); toast.show('Сохранено'); load(); } catch (e) { console.error(e); toast.show('Не удалось сохранить', 'warn'); }
  };

  const sf = shifts.filter(x => !q.trim() || `${x.user_name} ${dl(x.opened_at)}`.toLowerCase().includes(q.trim().toLowerCase()));
  const revenue = shifts.reduce((a, x) => a + (x.total_revenue || 0), 0), orders = shifts.reduce((a, x) => a + (x.order_count || 0), 0);
  const nowOn = [...new Set(shifts.filter(x => x.status === 'open').map(x => x.user_name))];
  const Tile = ({ k, v, s }) => <GlassSurface radius={glass.radius.tile} padding={16} style={{ flex: 1, minWidth: 180 }}><Text style={st.kl}>{k}</Text><Text style={st.val} numberOfLines={1}>{v}</Text>{!!s && <Text style={st.sub}>{s}</Text>}</GlassSurface>;

  // ── карточка смены ──
  const shiftCard = !card ? <Text style={st.empty}>Выберите смену</Text> : (() => {
    const sh = card.shift, open = !sh.closed_at, mins = minsOf(sh), pay = !open ? shiftPay(sh, mins) : null;
    const items = showAll ? card.items : card.items.slice(0, 5), pcs = card.items.reduce((a, i) => a + i.qty, 0);
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={st.who}><View style={st.av}><Text style={st.avT}>{(sh.user_name || '?')[0].toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}><Text style={st.wN}>{sh.user_name}</Text><Text style={st.wS}>{rateText(sh)}</Text></View>
          <View style={[st.pill, { borderColor: open ? 'rgba(157,191,230,0.5)' : 'rgba(120,183,150,0.4)' }]}><Text style={[st.pillT, { color: open ? colors.orangeLight : colors.green }]}>{open ? 'Идёт' : 'Закрыта'}</Text></View></View>
        <View style={st.mini}>
          {[['Начало', `${dl(sh.opened_at)} · ${tm(sh.opened_at)}`], ['Конец', open ? 'идёт сейчас' : `${dl(sh.closed_at)} · ${tm(sh.closed_at)}`], ['Длительность', fmtDur(mins)]].map(([k, v], i) => (
            <View key={k} style={st.miniI}><Text style={st.miniK}>{k}</Text><Text style={[st.miniV, i === 1 && open && { color: colors.orangeLight }]}>{v}</Text></View>))}
        </View>
        {!!sh.hours_edited && <Text style={st.edited}>Время изменено вручную{sh.edit_reason ? `: ${sh.edit_reason}` : ''}</Text>}
        {!!sh.created_manually && !sh.hours_edited && <Text style={st.edited}>Смена добавлена вручную</Text>}
        <GlassSurface radius={glass.radius.tile} style={{ marginBottom: 12 }}>
          <View style={st.stripe} /><View style={{ flexDirection: 'row', alignItems: 'center', padding: 18, paddingLeft: 24 }}>
            <View style={{ flex: 1 }}><Text style={st.kl}>Выручка</Text><Text style={st.big}>{fmt(card.revenue)} ₽</Text></View>
            <View style={{ alignItems: 'flex-end' }}><Text style={st.kl}>{card.orders} заказов</Text><Text style={st.avg}>{card.orders ? `ср. чек ${fmt(card.revenue / card.orders)} ₽` : '—'}</Text></View></View>
        </GlassSurface>
        <View style={st.pay2}>{[['Наличные', card.cash], ['Карта', card.card], ...card.other.map(o => [o.name, o.sum])].map(([n, v]) => <View key={n} style={st.pay2I}><Text style={st.pay2N}>{n}</Text><Text style={st.pay2V}>{fmt(v)} ₽</Text></View>)}</View>
        <View style={st.earn}><View style={{ flexDirection: 'row', alignItems: 'baseline' }}><Text style={st.earnL}>Начислено за смену</Text><Text style={st.earnV}>{open ? 'после закрытия' : pay.amount != null ? `${fmt(pay.amount + (sh.adjustment_amount || 0))} ₽` : '—'}</Text></View>
          <Text style={st.earnS}>{open ? 'Зарплата рассчитывается после закрытия смены.' : pay.text}{sh.adjustment_amount ? ` Доплата/удержание: ${sg(sh.adjustment_amount)}${fmt(Math.abs(sh.adjustment_amount))} ₽.` : ''}</Text></View>
        <View style={st.grp}><View style={st.gh}><Text style={st.ghT}>Продано</Text><Text style={st.ghS}>{card.items.length ? `${card.items.length} позиций · ${pcs} шт` : 'продаж не было'}</Text></View>
          {items.map((i, k) => <View key={k} style={st.pi}><View style={st.q}><Text style={st.qT}>× {i.qty}</Text></View><Text style={st.piN} numberOfLines={1}>{i.name}</Text><Text style={st.piS}>{fmt(i.sum)} ₽</Text></View>)}
          {card.items.length > 5 && <Pressable onPress={() => setShowAll(v => !v)}><Text style={st.more}>{showAll ? 'Свернуть' : `Ещё ${card.items.length - 5} поз.`}</Text></Pressable>}</View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          {open && <GlassButton style={{ flex: 1 }} label="Закрыть смену" height={50} onPress={closeIt} />}
          {isAdmin && <GlassButton style={{ flex: 1 }} label="Изменить время" height={50} onPress={() => setTimeModal(sh)} />}
        </View>
        {isAdmin && <Pressable onPress={askDelete} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 12 }}><Text style={st.del}>Удалить смену</Text></Pressable>}
      </ScrollView>
    );
  })();

  const shiftsView = (
    <>
      <View style={st.tiles}>
        <Tile k="Выручка за смены" v={`${fmt(revenue)} ₽`} s={`${shifts.length} смен${shifts.length ? ` · в среднем ${fmt(revenue / shifts.length)} ₽` : ''}`} />
        <Tile k="Заказов" v={String(orders)} s="во всех сменах периода" />
        <Tile k="Сейчас на смене" v={nowOn.length ? nowOn.join(', ') : '—'} s={nowOn.length ? 'смена открыта' : 'открытых смен нет'} />
      </View>
      <View style={[st.two, isLandscape && { flexDirection: 'row' }]}>
        <View style={[st.lc, isLandscape && { flex: 0.9 }, hl.list.style]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {sf.length === 0 ? <Text style={st.empty}>{shifts.length ? 'Ничего не найдено' : 'За период смен нет'}</Text> : sf.map(x => {
              const open = x.status === 'open';
              return (
                <Pressable key={x.id} style={[st.sh, sel === x.id && st.shSel]} onPress={() => setSel(x.id)}>
                  <View style={[st.dot, { backgroundColor: open ? colors.orange : colors.green }]} />
                  <View style={{ flex: 1 }}><Text style={st.shD}>{dl(x.opened_at)} · {tm(x.opened_at)}</Text><Text style={st.shS}>{x.user_name}{open ? ' · идёт' : ''}</Text></View>
                  <View style={{ alignItems: 'flex-end' }}><Text style={st.shA}>{fmt(x.total_revenue)} ₽</Text><Text style={st.shS}>{open ? 'идёт' : fmtDur(minsOf(x))}</Text></View>
                </Pressable>);
            })}
          </ScrollView>
        </View>
        <View style={[st.rc, isLandscape && { flex: 1.1 }, hl.card.style]}>{shiftCard}</View>
      </View>
    </>
  );

  // ── зарплата ──
  const sum = k => salary.reduce((a, r) => a + (r[k] || 0), 0), lastSh = detail?.shiftBreakdown?.[0];
  const salaryView = (
    <>
      <View style={st.tiles}>
        <Tile k="К выплате за период" v={`${fmt(sum('total'))} ₽`} s="та же цифра — в отчёте «Прибыль», строка «Зарплата»" />
        <Tile k="Премии" v={`${fmt(sum('kpiBonus'))} ₽`} s="по выполнению плана" />
        <Tile k="Доплаты и удержания" v={`${sg(sum('adjustments'))}${fmt(Math.abs(sum('adjustments')))} ₽`} s="ручные правки по сменам" />
      </View>
      <View style={[st.two, isLandscape && { flexDirection: 'row' }]}>
        <View style={[st.lc, isLandscape && { flex: 0.9 }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {salary.length === 0 ? <Text style={st.empty}>За период начислений нет</Text> : salary.map(r => (
              <Pressable key={r.user.id} style={[st.sh, selEmp === r.user.id && st.shSel]} onPress={() => setSelEmp(r.user.id)}>
                <View style={{ flex: 1 }}><Text style={st.shD}>{r.user.name}{r.user.active === 0 ? ' · не работает' : ''}</Text><Text style={st.shS}>{rateText(r.user)}</Text></View><Text style={st.shA}>{fmt(r.total)} ₽</Text></Pressable>))}
          </ScrollView>
        </View>
        <View style={[st.rc, isLandscape && { flex: 1.1 }]}>
          {!detail ? <Text style={st.empty}>Выберите сотрудника</Text> : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={st.sec}>{detail.user.name}</Text><Text style={st.wS}>{rateText(detail.user)}</Text>
              <Text style={st.hv}>{fmt(detail.total)} ₽</Text>
              <View style={st.kv}><Text style={st.kvL}>База по ставке</Text><Text style={st.kvV}>{fmt(detail.base)} ₽</Text></View>
              <View style={st.kv}><Text style={st.kvL}>Премия за KPI</Text><Text style={[st.kvV, { color: colors.green }]}>+{fmt(detail.kpiBonus)} ₽</Text></View>
              <View style={st.kv}><Text style={st.kvL}>Доплаты и удержания</Text><Text style={[st.kvV, { color: detail.adjustments < 0 ? '#E9A9A2' : colors.green }]}>{sg(detail.adjustments)}{fmt(Math.abs(detail.adjustments))} ₽</Text></View>
              <Text style={[st.sec, { marginTop: 18 }]}>Смены</Text>
              {detail.shiftBreakdown.length === 0 ? <Text style={st.wS}>Смен за период нет</Text> : detail.shiftBreakdown.map(s => (
                <Pressable key={s.id} style={st.kv} onPress={() => isAdmin && setAdjModal({ shift: s, value: s.adjustmentAmount, reason: s.adjustmentReason })}>
                  <Text style={st.kvL}>{dl(s.opened_at)} · {s.hours != null ? `${String(s.hours).replace('.', ',')} ч` : 'идёт'}{s.adjustmentAmount ? ` · ${sg(s.adjustmentAmount)}${fmt(Math.abs(s.adjustmentAmount))}` : ''}</Text>
                  <Text style={st.kvV}>{s.pay != null ? `${fmt(s.pay)} ₽` : '—'}</Text></Pressable>))}
              {isAdmin && lastSh && <GlassButton label="Доплата / удержание" height={50} style={{ marginTop: 14 }} onPress={() => setAdjModal({ shift: lastSh, value: lastSh.adjustmentAmount, reason: lastSh.adjustmentReason })} />}
              {isAdmin && lastSh && <Text style={st.hint}>Применяется к последней смене периода — {dl(lastSh.opened_at)}. Другую смену выберите нажатием на строку.</Text>}
            </ScrollView>)}
        </View>
      </View>
    </>
  );

  return (
    <View style={st.root}>
      <TopBar title="Журнал работы" onBack={() => goBackSmart(navigation)} navigation={navigation} activeScreen="WorkJournal"
        rightElement={<Pressable style={st.tourBtn} onPress={() => setTourOpen(true)} hitSlop={10} accessibilityLabel="Подсказка"><Text style={st.tourTxt}>?</Text></Pressable>} />
      <View style={StyleSheet.absoluteFill} pointerEvents="none"><SoftGlow size={620} color="127,168,217" alpha={0.14} style={{ position: 'absolute', left: -170, top: -150 }} /></View>
      <View style={st.tb}>
        {isAdmin ? <View style={{ width: 300 }}><GlassSegmented items={[{ key: 'shifts', label: 'Смены' }, { key: 'salary', label: 'Зарплата' }]} value={tab} onChange={setTab} height={46} /></View> : null}
        <View style={st.search}><Icon name="search" size={20} color={colors.muted} /><TextInput style={st.searchIn} color={colors.text} value={q} onChangeText={setQ} placeholder="Поиск по сотруднику или дате" placeholderTextColor={colors.muted} /></View>
        <Pressable ref={pRef} collapsable={false} style={[st.pbtn, pop && st.pbtnOn, hl.period.style, { position: 'relative' }]} onPress={openPop}>
          <Icon name="calendar" size={18} color={colors.textDim} /><Text style={st.pbtnT}>{label}</Text><Text style={st.car}>▾</Text>{hl.period.overlay}</Pressable>
        {isAdmin && <View style={{ position: 'relative', ...hl.add.style }}><GlassButton tone="solid" icon="plus" label="Смена" height={50} onPress={() => setNewOpen(true)} />{hl.add.overlay}</View>}
      </View>
      <View style={{ flex: 1, padding: 20, paddingTop: 14 }}>{tab === 'shifts' || !isAdmin ? shiftsView : salaryView}</View>

      <Modal visible={pop} transparent animationType="fade" onRequestClose={() => setPop(false)}>
        <View style={{ flex: 1 }}><Pressable style={StyleSheet.absoluteFill} onPress={() => setPop(false)} />
          <View style={[st.pop, { top: anchor.top, right: anchor.right }]}>
            <GlassSurface floating radius={22} tint="32,40,55" alpha={0.97} padding={20} sheen={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.01)']}>
              <Text style={st.pl}>Период</Text>
              <View style={st.chips}>{[...PRESETS, { key: 'custom', label: 'Свой период…' }].map(p => (
                <Pressable key={p.key} style={[st.chip, preset === p.key && st.chipOn]} onPress={() => { if (p.key === 'custom') { setPop(false); setPicker('from'); } else { setPreset(p.key); setPop(false); } }}>
                  <Text style={[st.chipT, preset === p.key && { color: colors.orangeLight }]}>{p.label}</Text></Pressable>))}</View>
              <Text style={st.pf}>{ddmm(period().from)} — {ddmm(period().to)}</Text>
            </GlassSurface></View></View>
      </Modal>
      <DatePicker visible={picker === 'from'} value={range.from} title="Начало периода" onClose={() => setPicker(null)} onChange={v => { setRange(x => ({ ...x, from: v })); setPicker('to'); }} />
      <DatePicker visible={picker === 'to'} value={range.to} title="Конец периода" onClose={() => setPicker(null)} onChange={v => { setRange(x => ({ ...x, to: v })); setPreset('custom'); setPicker(null); }} />

      <ShiftTimeModal visible={!!timeModal} shift={timeModal} user={timeModal} onSave={saveTime} onClose={() => setTimeModal(null)} isNarrow={!isLandscape} />
      <NewShiftModal visible={newOpen} employees={users} defaultEmployeeId={tab === 'salary' ? selEmp : card?.shift?.user_id} onCreate={createShifts} onClose={() => setNewOpen(false)} isNarrow={!isLandscape} />

      <Modal visible={!!adjModal} transparent animationType="fade" onRequestClose={() => setAdjModal(null)}>
        <KeyboardSafe style={st.ov}><Pressable style={StyleSheet.absoluteFill} onPress={() => setAdjModal(null)} />
          <View style={st.win}><GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating padding={24}>
            <Text style={st.wT}>Доплата или удержание</Text>
            <Text style={st.wSub}>Смена от {adjModal ? dl(adjModal.shift.opened_at) : ''}. Минус — удержание.</Text>
            <View style={st.fld}><Text style={st.fl}>Сумма</Text><TextInput style={st.in} color={colors.text} value={adjModal ? String(adjModal.value || '') : ''} keyboardType="numbers-and-punctuation" placeholder="+300 или −200" placeholderTextColor="rgba(255,255,255,0.22)"
              onChangeText={v => setAdjModal(p => ({ ...p, value: parseFloat(String(v).replace(',', '.').replace('−', '-')) || 0, raw: v }))} /><Text style={st.suf}>₽</Text></View>
            <View style={st.fld}><Text style={st.fl}>Причина</Text><TextInput style={st.in} color={colors.text} value={adjModal?.reason || ''} onChangeText={v => setAdjModal(p => ({ ...p, reason: v }))} placeholder="Например, премия за вечер" placeholderTextColor="rgba(255,255,255,0.22)" /></View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}><GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={() => setAdjModal(null)} /><GlassButton style={{ flex: 1 }} tone="accent" label="Сохранить" height={54} onPress={saveAdj} /></View>
          </GlassSurface></View></KeyboardSafe>
      </Modal>
      <TourGuide visible={tourOpen} onClose={() => { setTourOpen(false); markTourSeen('WorkJournal'); }} steps={steps} />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tourBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(127,168,217,0.1)', borderWidth: 1, borderColor: 'rgba(127,168,217,0.3)', alignItems: 'center', justifyContent: 'center' }, tourTxt: { fontFamily: fonts.family, fontSize: 18, color: colors.orange },
  tb: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 14 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderRadius: 14, paddingHorizontal: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }, searchIn: { flex: 1, padding: 0, fontSize: 16, fontFamily: fonts.familyMedium, color: colors.text },
  pbtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, pbtnOn: { backgroundColor: 'rgba(127,168,217,0.18)', borderColor: 'rgba(157,191,230,0.5)' }, pbtnT: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, car: { fontSize: 11, color: colors.muted },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }, kl: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textDim }, val: { fontFamily: fonts.display, fontSize: 26, color: colors.text, marginTop: 6 }, sub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 5, lineHeight: 17 },
  two: { flex: 1, gap: 12 }, lc: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 12 }, rc: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 18 },
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', padding: 28 },
  sh: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }, shSel: { backgroundColor: 'rgba(127,168,217,0.10)' }, dot: { width: 10, height: 10, borderRadius: 5, marginRight: 14 },
  shD: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text }, shS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 }, shA: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  who: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 }, av: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(127,168,217,0.16)', borderWidth: 1, borderColor: 'rgba(157,191,230,0.3)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }, avT: { fontFamily: fonts.family, fontSize: 17, color: colors.orangeLight },
  wN: { fontFamily: fonts.display, fontSize: 20, color: colors.text }, wS: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 2 }, pill: { height: 26, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, pillT: { fontFamily: fonts.familySemibold, fontSize: 12 },
  mini: { flexDirection: 'row', gap: 10, marginBottom: 12 }, miniI: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }, miniK: { fontFamily: fonts.familySemibold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted, marginBottom: 5 }, miniV: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  edited: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.warning, marginBottom: 12 },
  stripe: { position: 'absolute', left: 0, top: 18, bottom: 18, width: 3, borderTopRightRadius: 2, borderBottomRightRadius: 2, backgroundColor: colors.orange }, big: { fontFamily: fonts.display, fontSize: 36, color: colors.text, marginTop: 4, letterSpacing: -1 }, avg: { fontFamily: fonts.familySemibold, fontSize: 17, color: colors.text, marginTop: 4 },
  pay2: { flexDirection: 'row', gap: 10, marginBottom: 12 }, pay2I: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }, pay2N: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim }, pay2V: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  earn: { padding: 14, borderRadius: 16, backgroundColor: 'rgba(127,168,217,0.08)', borderWidth: 1, borderColor: 'rgba(157,191,230,0.22)', marginBottom: 12 }, earnL: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 13, color: colors.textDim }, earnV: { fontFamily: fonts.display, fontSize: 22, color: colors.text }, earnS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 4, lineHeight: 18 },
  grp: { borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 14, marginBottom: 12 }, gh: { flexDirection: 'row', alignItems: 'baseline', paddingTop: 12, paddingBottom: 6 }, ghT: { flex: 1, fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted }, ghS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  pi: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }, q: { minWidth: 44, height: 26, borderRadius: 8, backgroundColor: 'rgba(127,168,217,0.14)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }, qT: { fontFamily: fonts.family, fontSize: 13, color: colors.orangeLight }, piN: { flex: 1, fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, piS: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.textDim },
  more: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orangeLight, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }, del: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  sec: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginBottom: 6 }, hv: { fontFamily: fonts.display, fontSize: 44, color: colors.text, letterSpacing: -1.4, marginVertical: 8 },
  kv: { flexDirection: 'row', paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }, kvL: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 15, color: colors.textDim }, kvV: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, hint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 18 },
  pop: { position: 'absolute', width: 420, maxWidth: '94%' }, pl: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.textDim, marginBottom: 10 }, pf: { marginTop: 14, fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { height: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }, chipOn: { backgroundColor: 'rgba(127,168,217,0.22)', borderColor: 'rgba(157,191,230,0.5)' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  ov: { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', alignItems: 'center', justifyContent: 'center' }, win: { width: '44%', minWidth: 440, maxWidth: 520 }, wT: { fontFamily: fonts.display, fontSize: 21, color: colors.text }, wSub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 3, marginBottom: 12 },
  fld: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: 16, paddingHorizontal: 18, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, fl: { width: 90, fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim }, in: { flex: 1, padding: 0, fontFamily: fonts.familySemibold, fontSize: 17, color: colors.text }, suf: { fontFamily: fonts.familyMedium, fontSize: 15, color: colors.orangeLight, marginLeft: 8 },
});
