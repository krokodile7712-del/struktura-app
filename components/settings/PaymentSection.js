import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Group, SwitchRow, ChipsRow, Note } from './ui';
import ModalSheet from '../ModalSheet';
import GlassButton from '../GlassButton';
import GlassSurface from '../GlassSurface';
import Toggle from '../Toggle';
import Icon from '../Icon';
import { getPayMethods, savePayMethods } from '../../db/queries';
import { colors, fonts } from '../../constants/theme';

const TYPES = [['cash', 'Наличные'], ['card', 'Безнал'], ['mixed', 'Смешанная']];
const typeLabel = t => (TYPES.find(x => x[0] === t) || [])[1] || 'Безнал';
const iconFor = m => (/qr|сбп/i.test(`${m.id} ${m.name}`) ? 'qr' : m.type === 'cash' ? 'cash' : m.type === 'mixed' ? 'split' : 'card');

// Плашка способа оплаты: стекло с объёмом, значок в своём квадрате, название, тип и состояние с переключателем
function Tile({ m, onPress, onToggle }) {
  const on = !!m.active;
  return (
    <Pressable style={s.cell} onPress={onPress} accessibilityRole="button">
      <GlassSurface radius={22} floating shadowScale={0.5} tint={on ? '127,168,217' : '150,172,204'} alpha={on ? 0.2 : 0.1} sheen={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.01)']}
        rimColors={on ? { top: 'rgba(210,230,252,0.6)', left: 'rgba(180,208,240,0.4)', right: 'rgba(157,191,230,0.3)', bottom: 'rgba(157,191,230,0.18)' } : undefined} padding={16} style={s.fill}>
        <View style={s.top}>
          <View style={[s.ic, on && s.icOn]}><Icon name={iconFor(m)} size={24} color={on ? '#0A121C' : colors.textDim} /></View>
          <Toggle value={on} onValueChange={onToggle} size="sm" />
        </View>
        <Text style={s.name} numberOfLines={1}>{m.name}</Text>
        <Text style={s.sub}>{typeLabel(m.type)} · {on ? 'в кассе' : 'выключен'}</Text>
      </GlassSurface>
    </Pressable>
  );
}

/** «Оплата»: способы оплаты стеклянными плашками (нажатие — изменить, переключатель — в кассе или нет) и крупная плашка «Новый способ оплаты». Сохраняется сразу. */
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
      <Text style={s.h}>Способы оплаты в кассе</Text>
      <View style={s.grid}>
        {list.map((x, i) => <Tile key={x.id} m={x} onPress={() => setM({ ...x, index: i })} onToggle={() => toggle(i)} />)}
        <Pressable style={s.cell} onPress={() => setM({ index: -1, id: 'pm_' + Date.now(), name: '', type: 'card', active: true })} accessibilityRole="button">
          <GlassSurface radius={22} floating shadowScale={0.5} tint="127,168,217" alpha={0.12} sheen={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.01)']}
            rimColors={{ top: 'rgba(210,230,252,0.55)', left: 'rgba(180,208,240,0.35)', right: 'rgba(157,191,230,0.25)', bottom: 'rgba(157,191,230,0.15)' }} style={s.fill} contentStyle={s.add}>
            <View style={s.plus}><Icon name="plus" size={26} color="#0A121C" /></View>
            <Text style={s.addT}>Новый способ оплаты</Text>
            <Text style={s.sub}>Например, СБП или перевод</Text>
          </GlassSurface>
        </Pressable>
      </View>
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
  h: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.muted, marginLeft: 8, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, cell: { flexGrow: 1, flexBasis: '30%', minWidth: 210, minHeight: 138 }, fill: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  ic: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' }, icOn: { backgroundColor: colors.orangeLight },
  name: { fontFamily: fonts.familySemibold, fontSize: 17, color: colors.text }, sub: { fontFamily: fonts.familyRegular, fontSize: 12.5, color: colors.muted, marginTop: 3 },
  add: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }, plus: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.orangeLight, marginBottom: 10 }, addT: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.orangeLight },
  fb: { flexDirection: 'row' }, fll: { fontFamily: fonts.familySemibold, fontSize: 12.5, color: colors.textDim, marginBottom: 6 },
  fi: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.familySemibold, fontSize: 15.5, color: colors.text, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
});
