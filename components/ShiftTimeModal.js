import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, StyleSheet } from 'react-native';
import KeyboardSafe from './KeyboardSafe';
import GlassSurface from './GlassSurface';
import GlassButton from './GlassButton';
import TimeWheel from './TimeWheel';
import { findShiftOverlap } from '../db/queries';
import { localDateStr } from '../db/queries';
import { shiftPay, fmtDur } from '../utils/shiftPay';
import { colors, fonts } from '../constants/theme';

const MO = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const parts = iso => { const d = new Date(iso); return { date: localDateStr(d), h: d.getHours(), m: d.getMinutes() }; };
const toIso = p => { const [y, mo, d] = p.date.split('-').map(Number); return new Date(y, mo - 1, d, p.h, p.m, 0, 0).toISOString(); };
const dl = date => { const [, mo, d] = date.split('-').map(Number); return `${d} ${MO[mo - 1]}`; };
const shiftDay = (date, n) => { const [y, mo, d] = date.split('-').map(Number); return localDateStr(new Date(y, mo - 1, d + n)); };
const t2 = p => `${String(p.h).padStart(2, '0')}:${String(p.m).padStart(2, '0')}`;

/**
 * «Время смены»: строки «Начало» и «Конец» с барабаном времени, выбор даты, живая длительность и начисление.
 * Проверки: конец позже начала, не в будущем, без пересечения с другими сменами сотрудника; причина обязательна.
 * Props: visible, shift (из журнала), user ({salary_type, salary_amount}), onSave({openedAt, closedAt, reason}), onClose, isNarrow.
 */
export default function ShiftTimeModal({ visible, shift, user, onSave, onClose, isNarrow }) {
  const [s, setS] = useState(null); const [e, setE] = useState(null); const [open, setOpen] = useState(false);
  const [which, setWhich] = useState('s'); const [reason, setReason] = useState('');
  useEffect(() => {
    if (!visible || !shift) return;
    const a = parts(shift.opened_at); setS(a);
    setOpen(!shift.closed_at); setE(shift.closed_at ? parts(shift.closed_at) : { date: localDateStr(), h: new Date().getHours(), m: new Date().getMinutes() });
    setWhich('s'); setReason('');
  }, [visible, shift?.id]);
  if (!shift || !s || !e) return null;

  const sIso = toIso(s), eIso = open ? null : toIso(e);
  const mins = open ? null : Math.round((new Date(eIso) - new Date(sIso)) / 60000);
  let err = '';
  if (!open) {
    if (mins <= 0) err = 'Конец смены должен быть позже начала.';
    else if (new Date(eIso) > new Date()) err = 'Конец смены не может быть в будущем.';
  }
  if (!err && shift.user_id) {
    const ov = findShiftOverlap(shift.user_id, sIso, eIso, shift.id);
    if (ov) err = `Пересекается со сменой ${dl(parts(ov.opened_at).date)} ${t2(parts(ov.opened_at))}.`;
  }
  const edited = sIso !== shift.opened_at || (!open && eIso !== shift.closed_at) || (open !== !shift.closed_at);
  const canSave = !err && edited && reason.trim().length > 0;
  const pay = !open && mins > 0 ? shiftPay(user, mins) : null;
  const cur = which === 's' ? s : e, setCur = which === 's' ? setS : setE;

  const pick = (p, set) => (
      <View style={{ marginBottom: 10 }}>
        <View style={st.dts}>
          <Pressable style={st.step} onPress={() => set({ ...p, date: shiftDay(p.date, -1) })} hitSlop={8}><Text style={st.stepT}>‹</Text></Pressable>
          <Text style={st.dateT}>{dl(p.date)}</Text>
          <Pressable style={st.step} onPress={() => set({ ...p, date: shiftDay(p.date, 1) })} hitSlop={8}><Text style={st.stepT}>›</Text></Pressable>
          {[['Сегодня', 0], ['Вчера', -1]].map(([t, n]) => (
            <Pressable key={t} style={[st.chip, p.date === shiftDay(localDateStr(), n) && st.chipOn]} onPress={() => set({ ...p, date: shiftDay(localDateStr(), n) })}><Text style={[st.chipT, p.date === shiftDay(localDateStr(), n) && { color: colors.orangeLight }]}>{t}</Text></Pressable>))}
        </View>
        <TimeWheel h={p.h} m={p.m} onChange={v => set({ ...p, ...v })} />
      </View>
  );

  const row = (k, label, p, live) => (
    <Pressable style={[st.row, which === k && st.rowOn]} onPress={() => { if (k === 'e' && open) setOpen(false); setWhich(k); }}>
      <Text style={st.lbl}>{label}</Text><Text style={st.val}>{live ? 'идёт сейчас' : `${dl(p.date)} · ${t2(p)}`}</Text>
    </Pressable>
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardSafe style={st.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.wrap, isNarrow && { width: '96%', minWidth: 0 }]}>
          <GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating>
            <ScrollView style={{ maxHeight: 700 }} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={st.title}>Время смены</Text>
              <Text style={st.sub}>{shift.user_name} · смена от {dl(parts(shift.opened_at).date)}</Text>
              {row('s', 'Начало', s, false)}
              {which === 's' && pick(s, setS)}
              {row('e', 'Конец', e, open)}
              {which === 'e' && !open && pick(e, setE)}
              <View style={st.dur}><Text style={st.durL}>Длительность</Text><Text style={[st.durV, !!err && { color: colors.red }]}>{open ? 'идёт' : mins > 0 ? fmtDur(mins) : '—'}</Text></View>
              <Text style={[st.pay, !!err && { color: colors.red }]}>{err || (open ? 'Зарплата будет рассчитана после закрытия смены.' : (mins > 16 * 60 ? 'Смена длиннее 16 часов — проверьте время. ' : '') + (pay ? pay.text : ''))}</Text>
              <View style={st.fld}><Text style={st.fl}>Причина</Text>
                <TextInput style={st.in} color={colors.text} value={reason} onChangeText={setReason} placeholder="Например, забыл закрыть смену" placeholderTextColor="rgba(255,255,255,0.22)" /></View>
              <View style={st.foot}>
                <GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={onClose} />
                <GlassButton style={{ flex: 1 }} tone="accent" label="Сохранить" height={54} disabled={!canSave} onPress={() => { onSave({ openedAt: sIso, closedAt: eIso, reason: reason.trim() }); onClose && onClose(); }} />
              </View>
            </ScrollView>
          </GlassSurface>
        </View>
      </KeyboardSafe>
    </Modal>
  );

}
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', alignItems: 'center', justifyContent: 'center' }, wrap: { width: '46%', minWidth: 500, maxWidth: 560 },
  title: { fontFamily: fonts.display, fontSize: 21, color: colors.text }, sub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', height: 62, borderRadius: 16, paddingHorizontal: 18, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, rowOn: { backgroundColor: 'rgba(127,168,217,0.10)', borderColor: 'rgba(157,191,230,0.6)' },
  lbl: { width: 90, fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim }, val: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  dts: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }, step: { width: 36, height: 34, borderRadius: 10, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' }, stepT: { fontSize: 20, color: colors.textDim }, dateT: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text, minWidth: 70, textAlign: 'center' },
  chip: { height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }, chipOn: { backgroundColor: 'rgba(127,168,217,0.2)', borderColor: 'rgba(157,191,230,0.5)' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim },
  dur: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 4, marginTop: 4 }, durL: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim }, durV: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  pay: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, lineHeight: 19, paddingHorizontal: 4, marginTop: 2 },
  fld: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: 16, paddingHorizontal: 18, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, fl: { width: 100, fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim }, in: { flex: 1, padding: 0, fontFamily: fonts.familySemibold, fontSize: 17, color: colors.text },
  foot: { flexDirection: 'row', gap: 10, marginTop: 18 },
});
