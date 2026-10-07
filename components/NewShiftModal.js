import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, StyleSheet } from 'react-native';
import KeyboardSafe from './KeyboardSafe';
import GlassSurface from './GlassSurface';
import GlassButton from './GlassButton';
import TimeWheel from './TimeWheel';
import { findShiftOverlap, getOpenShift, getLastClosedShift, localDateStr } from '../db/queries';
import { rateText, shiftPay, fmtDur } from '../utils/shiftPay';
import { colors, fonts } from '../constants/theme';

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const REASONS = ['Забыли открыть', 'Работал без отметки', 'Подмена', 'Другое'];
const t2 = p => `${String(p.h).padStart(2, '0')}:${String(p.m).padStart(2, '0')}`;
const rub = n => Math.round(n || 0).toLocaleString('ru-RU');
const dayBack = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
// Интервал смены в выбранный день; конец раньше или равен началу — смена через полночь (конец — следующего дня)
const interval = (day, s, e) => {
  const [y, mo, d] = day.split('-').map(Number);
  const a = new Date(y, mo - 1, d, s.h, s.m, 0, 0), b = new Date(y, mo - 1, d, e.h, e.m, 0, 0);
  if (s.h * 60 + s.m >= e.h * 60 + e.m) b.setDate(b.getDate() + 1);
  return [a, b];
};

/**
 * «Новая смена»: кому зачесть смену (сотрудник), «открыть сейчас» или за прошедшее время, несколько дней сразу, время с барабаном,
 * проверка пересечений, расчёт начисления, причина (при «Другое» — своя строка) и необязательная доплата.
 * Props: visible, employees [{id, name, salary_type, salary_amount}], defaultEmployeeId,
 * onCreate({ mode, employee, days:[{start,end}], reason, adjustment }) → { ok, message }, onClose, isNarrow.
 */
export default function NewShiftModal({ visible, employees = [], defaultEmployeeId, onCreate, onClose, isNarrow }) {
  const [emp, setEmp] = useState(null); const [mode, setMode] = useState('past');
  const [days, setDays] = useState({}); const [s, setS] = useState({ h: 9, m: 0 }); const [e, setE] = useState({ h: 18, m: 0 });
  const [which, setWhich] = useState(null); const [reason, setReason] = useState(''); const [other, setOther] = useState(''); const [adj, setAdj] = useState(''); const [err, setErr] = useState('');
  useEffect(() => {
    if (!visible) return;
    setEmp(defaultEmployeeId || employees[0]?.id || null); setMode('past'); setDays({ [localDateStr(dayBack(1))]: true });
    setS({ h: 9, m: 0 }); setE({ h: 18, m: 0 }); setWhich(null); setReason(''); setOther(''); setAdj(''); setErr('');
  }, [visible]);

  const u = employees.find(x => x.id === emp);
  const list = Array.from({ length: 7 }, (_, i) => dayBack(i));
  const conflict = day => { if (!u) return null; const [a, b] = interval(day, s, e); return findShiftOverlap(u.id, a.toISOString(), b.toISOString()); };
  const chosen = Object.keys(days).filter(d => days[d] && !conflict(d)).sort();
  const adjN = parseFloat(String(adj).replace(',', '.').replace('−', '-')) || 0;
  const reasonText = reason === 'Другое' ? other.trim() : reason;

  let msg = '', ok = true, head = '', total = '';
  if (!u) { ok = false; msg = 'Выберите сотрудника.'; }
  else if (mode === 'now') {
    const op = getOpenShift(u.id);
    if (op) { ok = false; msg = `У сотрудника «${u.name}» уже открыта смена. Сначала закройте её.`; }
    else msg = `Смена откроется сейчас на «${u.name}». Выручка и заказы пойдут в неё.`;
    head = 'Открыть смену';
  } else {
    const [a, b] = chosen.length ? interval(chosen[0], s, e) : [null, null];
    const mins = a ? Math.round((b - a) / 60000) : 0;
    head = `Будет создано смен: ${chosen.length}`;
    if (!chosen.length) { ok = false; msg = 'Выберите хотя бы один день без пересечений.'; }
    else if (mins > 16 * 60) { ok = false; msg = 'Смена длиннее 16 часов — проверьте время.'; }
    else {
      const p = shiftPay(u, mins);
      msg = `${p.text}${chosen.length > 1 ? ` · смен: ${chosen.length}` : ''}${adjN ? ` · ${adjN > 0 ? 'доплата +' : 'удержание −'}${rub(Math.abs(adjN))} ₽` : ''}`;
      if (p.amount != null) total = `${rub(p.amount * chosen.length + adjN)} ₽`;
      if (!reasonText) { ok = false; msg += `${msg ? ' ' : ''}${reason === 'Другое' ? 'Опишите причину.' : 'Выберите причину.'}`; }
    }
  }

  const submit = () => {
    if (!ok || !u) return;
    let res;
    try {
      res = onCreate({ mode, employee: u, reason: reasonText, adjustment: adjN, days: mode === 'past' ? chosen.map(d => { const [a, b] = interval(d, s, e); return { start: a.toISOString(), end: b.toISOString() }; }) : [] });
    } catch (x) { console.error('[NewShiftModal]', x); res = { ok: false, message: 'Не удалось создать смену. Попробуйте ещё раз.' }; }
    if (res && res.ok) onClose && onClose(); else setErr((res && res.message) || 'Не удалось создать смену.');
  };
  const quickLast = () => { const l = u && getLastClosedShift(u.id); if (!l) return; const a = new Date(l.opened_at), b = new Date(l.closed_at); setS({ h: a.getHours(), m: a.getMinutes() }); setE({ h: b.getHours(), m: b.getMinutes() }); };

  const timeRow = (k, label, p, hint) => (
    <>
      <Pressable style={[st.row, which === k && st.rowOn]} onPress={() => setWhich(which === k ? null : k)}>
        <Text style={st.lbl}>{label}</Text><Text style={st.val}>{t2(p)}</Text><Text style={st.hint}>{hint}</Text>
      </Pressable>
      {which === k && <View style={{ marginBottom: 8 }}><TimeWheel h={p.h} m={p.m} onChange={v => (k === 's' ? setS({ ...p, ...v }) : setE({ ...p, ...v }))} /></View>}
    </>
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardSafe style={st.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.wrap, isNarrow && { width: '96%', minWidth: 0 }]}>
          <GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating>
            <ScrollView style={{ maxHeight: 720 }} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={st.title}>Новая смена</Text><Text style={st.sub}>Кому зачесть смену и за какое время</Text>
              <Text style={st.gl}>Сотрудник</Text>
              <View style={st.ems}>{employees.map(x => (
                <Pressable key={x.id} style={[st.emc, emp === x.id && st.emcOn]} onPress={() => setEmp(x.id)}>
                  <View style={st.av}><Text style={st.avT}>{(x.name || '?')[0].toUpperCase()}</Text></View>
                  <Text style={st.emN} numberOfLines={1}>{x.name}</Text>
                  <Text style={[st.emS, !x.salary_amount && { color: colors.warning }]} numberOfLines={1}>{rateText(x)}</Text>
                </Pressable>))}</View>
              <Text style={st.gl}>Когда</Text>
              <View style={st.seg}>{[['now', 'Открыть сейчас'], ['past', 'За прошедшее время']].map(([k, t]) => <Pressable key={k} style={[st.segI, mode === k && st.segOn]} onPress={() => setMode(k)}><Text style={[st.segT, mode === k && { color: colors.orangeLight }]}>{t}</Text></Pressable>)}</View>
              {mode === 'past' && (
                <>
                  <Text style={st.gl}>Дни</Text>
                  <View style={st.dys}>{list.map(d => { const di = localDateStr(d), bad = !!conflict(di), on = !!days[di] && !bad; return (
                    <Pressable key={di} disabled={bad} style={[st.dy, on && st.dyOn, bad && { opacity: 0.35 }]} onPress={() => setDays(p => ({ ...p, [di]: !p[di] }))}>
                      <Text style={st.dyW}>{WD[d.getDay()]}</Text><Text style={[st.dyD, on && { color: colors.orangeLight }]}>{d.getDate()}</Text></Pressable>); })}</View>
                  <Text style={st.gl}>Время</Text>
                  {timeRow('s', 'Начало', s, '')}
                  {timeRow('e', 'Конец', e, (s.h * 60 + s.m >= e.h * 60 + e.m) ? 'следующего дня' : '')}
                  <View style={st.qk}>
                    <Pressable style={st.qkI} onPress={quickLast}><Text style={st.qkT}>Как в прошлый раз</Text></Pressable>
                    <Pressable style={st.qkI} onPress={() => { setS({ h: 9, m: 0 }); setE({ h: 18, m: 0 }); }}><Text style={st.qkT}>09:00 — 18:00</Text></Pressable>
                  </View>
                  <Text style={st.gl}>Причина</Text>
                  <View style={st.chips}>{REASONS.map(r => <Pressable key={r} style={[st.chip, reason === r && st.chipOn]} onPress={() => setReason(r)}><Text style={[st.chipT, reason === r && { color: colors.orangeLight }]}>{r}</Text></Pressable>)}</View>
                  {reason === 'Другое' && <View style={st.fld}><Text style={st.fl}>Опишите</Text><TextInput style={st.in} color={colors.text} value={other} onChangeText={setOther} autoFocus placeholder="Что произошло" placeholderTextColor="rgba(255,255,255,0.22)" /></View>}
                  <View style={st.fld}><Text style={st.fl}>Доплата</Text><TextInput style={st.in} color={colors.text} value={adj} onChangeText={v => setAdj(v.replace(/[^0-9.,+\-−]/g, ''))} keyboardType="numbers-and-punctuation" placeholder="необязательно, например +300 или −200" placeholderTextColor="rgba(255,255,255,0.22)" /><Text style={st.suf}>₽</Text></View>
                </>
              )}
              <View style={[st.sum, !ok && st.sumBad]}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}><Text style={st.sumH}>{head}</Text><Text style={st.sumT}>{total}</Text></View>
                {!!(err || msg) && <Text style={[st.sumM, !!err && { color: '#E9A9A2' }]}>{err || msg}</Text>}
              </View>
              <View style={st.foot}>
                <GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={onClose} />
                <GlassButton style={{ flex: 1 }} tone="accent" label={mode === 'now' ? 'Открыть смену' : chosen.length > 1 ? 'Создать смены' : 'Создать смену'} height={54} disabled={!ok} onPress={submit} />
              </View>
            </ScrollView>
          </GlassSurface>
        </View>
      </KeyboardSafe>
    </Modal>
  );
}
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', alignItems: 'center', justifyContent: 'center' }, wrap: { width: '50%', minWidth: 540, maxWidth: 640 },
  title: { fontFamily: fonts.display, fontSize: 21, color: colors.text }, sub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  gl: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginTop: 16, marginBottom: 8 },
  ems: { flexDirection: 'row', gap: 8 }, emc: { flex: 1, minWidth: 0, padding: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, emcOn: { backgroundColor: 'rgba(127,168,217,0.12)', borderColor: 'rgba(157,191,230,0.6)' },
  av: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(127,168,217,0.16)', borderWidth: 1, borderColor: 'rgba(157,191,230,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }, avT: { fontFamily: fonts.family, fontSize: 15, color: colors.orangeLight },
  emN: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, emS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  seg: { flexDirection: 'row', height: 42, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' }, segI: { flex: 1, alignItems: 'center', justifyContent: 'center' }, segOn: { backgroundColor: 'rgba(127,168,217,0.2)' }, segT: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  dys: { flexDirection: 'row', gap: 6 }, dy: { flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, dyOn: { backgroundColor: 'rgba(127,168,217,0.2)', borderColor: 'rgba(157,191,230,0.6)' }, dyW: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted }, dyD: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', height: 60, borderRadius: 16, paddingHorizontal: 18, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, rowOn: { backgroundColor: 'rgba(127,168,217,0.10)', borderColor: 'rgba(157,191,230,0.6)' },
  lbl: { width: 90, fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim }, val: { fontFamily: fonts.display, fontSize: 20, color: colors.text }, hint: { marginLeft: 10, fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  qk: { flexDirection: 'row', gap: 8, marginTop: 2 }, qkI: { height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(157,191,230,0.4)', backgroundColor: 'rgba(127,168,217,0.08)', alignItems: 'center', justifyContent: 'center' }, qkT: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orangeLight },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }, chip: { height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }, chipOn: { backgroundColor: 'rgba(127,168,217,0.2)', borderColor: 'rgba(157,191,230,0.5)' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim },
  fld: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: 16, paddingHorizontal: 18, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, fl: { width: 100, fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim }, in: { flex: 1, minWidth: 0, padding: 0, fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text }, suf: { fontFamily: fonts.familyMedium, fontSize: 15, color: colors.orangeLight, marginLeft: 8 },
  sum: { padding: 14, borderRadius: 16, backgroundColor: 'rgba(127,168,217,0.08)', borderWidth: 1, borderColor: 'rgba(157,191,230,0.22)', marginTop: 8 }, sumBad: { backgroundColor: 'rgba(219,129,120,0.08)', borderColor: 'rgba(219,129,120,0.35)' },
  sumH: { flex: 1, fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim }, sumT: { fontFamily: fonts.display, fontSize: 22, color: colors.text }, sumM: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 4, lineHeight: 18 },
  foot: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
