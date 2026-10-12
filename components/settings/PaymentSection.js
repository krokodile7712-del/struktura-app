import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Group, Row, SwitchRow, ChipsRow, Note } from './ui';
import ModalSheet from '../ModalSheet';
import GlassButton from '../GlassButton';
import { getPayMethods, savePayMethods } from '../../db/queries';
import { colors, fonts } from '../../constants/theme';

const TYPES = [['cash', 'Наличные'], ['card', 'Безнал'], ['mixed', 'Смешанная']];
const typeLabel = t => (TYPES.find(x => x[0] === t) || [])[1] || 'Безнал';

/** «Оплата»: способы оплаты в кассе. Включить или выключить — переключателем; изменить, добавить и удалить — листом. Сохраняется сразу. */
export default function PaymentSection({ onSaved }) {
  const [list, setList] = useState(() => getPayMethods() || []); const [m, setM] = useState(null);
  const put = next => { try { savePayMethods(next); setList(next); onSaved && onSaved(); } catch (e) { console.error('[Оплата]', e); } };
  const toggle = i => put(list.map((x, k) => (k === i ? { ...x, active: !x.active } : x)));
  const save = () => {
    if (!m.name.trim()) return;
    const e = { id: m.id, name: m.name.trim(), icon: '', type: m.type, active: m.active }, next = [...list];
    if (m.index < 0) next.push(e); else next[m.index] = e;
    put(next); setM(null);
  };
  const remove = () => { if (list.length <= 1) return; put(list.filter((_, i) => i !== m.index)); setM(null); };
  return (
    <>
      <Group title="Способы оплаты в кассе">
        {list.map((x, i) => (
          <Row key={x.id} title={x.name} sub={typeLabel(x.type)} onPress={() => setM({ ...x, index: i })} right={<View style={s.sw}><SwitchRow.Toggle value={!!x.active} onChange={() => toggle(i)} /></View>} chevron={false} />
        ))}
        <Row title="Добавить способ оплаты" onPress={() => setM({ index: -1, id: 'pm_' + Date.now(), name: '', type: 'card', active: true })} />
      </Group>
      <Note>Выключенный способ не показывается в кассе, но остаётся в истории продаж. Последний способ удалить нельзя.</Note>
      <ModalSheet visible={!!m} onClose={() => setM(null)} title={m?.index < 0 ? 'Новый способ оплаты' : 'Способ оплаты'}
        footer={<View style={s.fb}><GlassButton tone="accent" label="Сохранить" height={50} disabled={!m?.name?.trim()} onPress={save} style={{ flex: 1 }} />{m?.index >= 0 && list.length > 1 && <GlassButton label="Удалить" height={50} onPress={remove} style={{ marginLeft: 8 }} />}</View>}>
        {m && (<>
          <Text style={s.fll}>Название</Text><TextInput style={s.fi} color={colors.text} value={m.name} onChangeText={v => setM(x => ({ ...x, name: v }))} placeholder="Например, СБП" placeholderTextColor="rgba(255,255,255,0.25)" />
          <Group title="Тип"><ChipsRow title="Как считать в отчётах" items={TYPES} value={m.type} onChange={k => setM(x => ({ ...x, type: k }))} /></Group>
          <Group title="В кассе"><SwitchRow title="Показывать способ" value={m.active} onChange={v => setM(x => ({ ...x, active: v }))} /></Group>
        </>)}
      </ModalSheet>
    </>
  );
}
const s = StyleSheet.create({
  sw: { marginLeft: 12 }, fb: { flexDirection: 'row' }, fll: { fontFamily: fonts.familySemibold, fontSize: 12.5, color: colors.textDim, marginBottom: 6 },
  fi: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.familySemibold, fontSize: 15.5, color: colors.text, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
});
