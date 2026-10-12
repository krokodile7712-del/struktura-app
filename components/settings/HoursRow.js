import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import TimeWheel from '../TimeWheel';
import { Row, st } from './ui';
import { colors, fonts } from '../../constants/theme';

const mins = s => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const parts = s => { const [h, m] = String(s || '0:0').split(':').map(Number); return { h: h || 0, m: m || 0 }; };
const fmt = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/** Рабочие часы: две строки «Открытие» и «Закрытие», по нажатию — наш барабан времени; закрытие обязано быть позже открытия. */
export default function HoursRow({ from, to, onChange }) {
  const [open, setOpen] = useState(null);                       // 'from' | 'to' | null
  const [draft, setDraft] = useState({ from, to });              // то, что видно на барабане (может быть неверным — тогда не сохраняется)
  useEffect(() => { setDraft({ from, to }); }, [from, to]);
  const bad = mins(draft.to) <= mins(draft.from);
  const pick = ({ h, m }) => {
    const next = { ...draft, [open]: fmt(h, m) };
    setDraft(next);
    if (mins(next.to) > mins(next.from)) onChange(next);
  };
  return (
    <View>
      <Row title="Открытие" value={draft.from} chevron onPress={() => setOpen(o => (o === 'from' ? null : 'from'))} />
      {open === 'from' && <View style={s.wheel}><TimeWheel {...parts(draft.from)} onChange={pick} /></View>}
      <View style={st.div}><Row title="Закрытие" value={draft.to} chevron onPress={() => setOpen(o => (o === 'to' ? null : 'to'))} /></View>
      {open === 'to' && <View style={s.wheel}><TimeWheel {...parts(draft.to)} onChange={pick} /></View>}
      {bad && <Text style={s.err}>Закрытие должно быть позже открытия — это время не сохранено</Text>}
    </View>
  );
}
const s = StyleSheet.create({
  wheel: { paddingHorizontal: 18, paddingBottom: 12 },
  err: { fontFamily: fonts.familyRegular, fontSize: 12.5, color: colors.red, paddingHorizontal: 18, paddingBottom: 10 },
});
