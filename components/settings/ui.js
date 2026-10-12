import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, StyleSheet, TextInput } from 'react-native';
import Icon from '../Icon';
import GlassSurface from '../GlassSurface';
import { parseNum, fmtNum, rangeError } from '../../utils/num';
import Toggle from '../Toggle';
import { colors, fonts, glass } from '../../constants/theme';

// Общий набор элементов экрана «Настройки»: группа-карточка, строка, переключатель, выбор из значений, примечание.
// Все разделы собираются из них — без своих стилей и без встроенных стилей в JSX.

// Плавное появление группы снизу (с задержкой — волной)
export function useEntrance(delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, duration: 520, delay, useNativeDriver: true }).start(); }, []);
  return { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] };
}

export function Group({ title, delay = 0, danger, children }) {
  const e = useEntrance(delay);
  const kids = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={st.gap}>
      {!!title && <Text style={[st.gt, danger && { color: colors.red }]}>{title}</Text>}
      <Animated.View style={e}>
        <GlassSurface radius={glass.radius.tile} tint={danger ? '219,129,120' : undefined} alpha={danger ? 0.12 : glass.alpha} style={st.grp}>
          {kids.map((c, i) => <View key={i} style={i > 0 && [st.div, danger && st.divDanger]}>{c}</View>)}
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

// Строка: название, пояснение, значение справа, стрелка; нажатие — onPress
export function Row({ title, sub, value, onPress, chevron, right, danger, disabled }) {
  const body = (
    <View style={st.row}>
      <View style={st.l}><Text style={[st.t, danger && { color: colors.red }]}>{title}</Text>{!!sub && <Text style={st.s}>{sub}</Text>}</View>
      {!!value && <Text style={st.v}>{value}</Text>}{right}
      {(chevron || (onPress && chevron !== false)) && <Text style={st.ch}>›</Text>}
    </View>
  );
  return onPress ? <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [pressed && st.pressed, disabled && { opacity: 0.5 }]}>{body}</Pressable> : body;
}

export const SwitchRow = ({ title, sub, value, onChange }) => <Row title={title} sub={sub} right={<Toggle value={!!value} onValueChange={onChange} />} />;
SwitchRow.Toggle = ({ value, onChange }) => <Toggle value={!!value} onValueChange={onChange} />;

// Выбор из нескольких значений чипами (внутри строки)
export function ChipsRow({ title, sub, items, value, onChange }) {
  return (
    <View style={st.row}>
      <View style={{ flex: 1 }}>
        <Text style={st.t}>{title}</Text>{!!sub && <Text style={st.s}>{sub}</Text>}
        <View style={st.chips}>{items.map(([k, label]) => (
          <Pressable key={String(k)} style={st.chip} onPress={() => onChange(k)}>
            {value === k && <GlassSurface radius={18} tint="127,168,217" alpha={0.28} style={StyleSheet.absoluteFill} />}
            <Text style={[st.chipT, value === k && { color: colors.orangeLight }]}>{label}</Text>
          </Pressable>))}
        </View>
      </View>
    </View>
  );
}

/**
 * Число: минус, поле, плюс, единица. Понимает запятую («5,5»), проверяет диапазон и показывает ошибку под полем;
 * неверное значение наружу не отдаётся (остаётся последнее верное).
 */
export function NumField({ value, onChange, min = 0, max = Infinity, gt, step = 1, unit, int, width = 80 }) {
  const [text, setText] = useState(fmtNum(value)); const [err, setErr] = useState('');
  useEffect(() => { if (parseNum(text) !== value) { setText(fmtNum(value)); setErr(''); } }, [value]);
  const apply = t => {
    setText(t); const n = parseNum(t), e = rangeError(n, { min, max, gt }); setErr(e);
    if (!e) onChange(int ? Math.round(n) : n);
  };
  const bump = d => { const n = parseNum(text) ?? value ?? 0; const next = Math.round((n + d * step) * 100) / 100; apply(fmtNum(Math.min(max, Math.max(gt != null ? gt + step : min, next)))); };
  return (
    <View>
      <View style={st.nf}>
        <Pressable style={st.nfB} onPress={() => bump(-1)} hitSlop={6}><GlassSurface radius={11} tint="127,168,217" alpha={0.16} style={StyleSheet.absoluteFill} /><Icon name="minus" size={16} color={colors.orangeLight} /></Pressable>
        <View style={[{ width, height: 34 }, !!err && st.nfBad]}><GlassSurface radius={11} style={StyleSheet.absoluteFill} /><TextInput style={st.nfIn} value={text} onChangeText={apply} onBlur={() => !err && setText(fmtNum(parseNum(text) ?? value))} keyboardType="decimal-pad" selectTextOnFocus color={colors.text} /></View>
        <Pressable style={st.nfB} onPress={() => bump(1)} hitSlop={6}><GlassSurface radius={11} tint="127,168,217" alpha={0.16} style={StyleSheet.absoluteFill} /><Icon name="plus" size={16} color={colors.orangeLight} /></Pressable>
        {!!unit && <Text style={st.nfU}>{unit}</Text>}
      </View>
      {!!err && <Text style={st.nfErr}>{err}</Text>}
    </View>
  );
}

// Предложение с полями внутри: <Sentence>{['За каждые 100 ₽ клиент получает', <NumField .../>, 'баллов']}</Sentence>
export function Sentence({ children }) {
  return <View style={st.sen}>{React.Children.toArray(children).map((c, i) => (typeof c === 'string' ? <Text key={i} style={st.senT}>{c}</Text> : <View key={i} style={st.senF}>{c}</View>))}</View>;
}

// Крупные карточки выбора одного варианта: items = [{ key, icon, title, desc, hint }]
export function ChoiceCards({ items, value, onChange }) {
  return (
    <View style={st.cc}>
      {items.map(it => (
        <Pressable key={it.key} style={st.card} onPress={() => onChange(it.key)}>
          <GlassSurface radius={20} tint={value === it.key ? '127,168,217' : undefined} alpha={value === it.key ? 0.24 : glass.alpha} floating={value === it.key} style={StyleSheet.absoluteFill} />
          <View style={[st.cardIc, value === it.key && st.cardIcOn]}><Icon name={it.icon} size={20} color={value === it.key ? '#0A121C' : colors.textDim} /></View>
          <Text style={st.cardT}>{it.title}</Text><Text style={st.cardD}>{it.desc}</Text>{!!it.hint && <Text style={st.cardH}>{it.hint}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

// Строка выбора одного варианта: название, пояснение, отметка справа у выбранного
export const PickRow = ({ title, sub, selected, onPress, right }) => <Row title={title} sub={sub} onPress={onPress} chevron={false} right={<>{right}{selected ? <View style={st.pk}><Icon name="check" size={14} color="#0A121C" /></View> : <View style={st.pkOff} />}</>} />;

// Строка с полем ввода: название слева, текст справа
export function InputRow({ title, value, onChange, placeholder, keyboardType }) {
  return <View style={st.row}><Text style={st.irT}>{title}</Text><TextInput style={st.ir} color={colors.text} value={value == null ? '' : String(value)} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="rgba(255,255,255,0.25)" keyboardType={keyboardType} autoCapitalize="none" /></View>;
}

export const Note = ({ children, warn }) => <Text style={[st.note, warn && { color: colors.warning }]}>{children}</Text>;

export const st = StyleSheet.create({
  gap: { marginTop: 18 },
  gt: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.muted, marginLeft: 8, marginBottom: 8 },
  grp: { borderRadius: 20, overflow: 'hidden' },
  div: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' }, divDanger: { borderTopColor: 'rgba(219,129,120,0.18)' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 58, paddingHorizontal: 18, paddingVertical: 10 },
  l: { flex: 1, minWidth: 0 }, t: { fontFamily: fonts.familySemibold, fontSize: 15.5, color: colors.text }, s: { fontFamily: fonts.familyRegular, fontSize: 12.5, color: colors.muted, marginTop: 2, lineHeight: 18 },
  v: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.textDim, marginLeft: 12 }, ch: { fontSize: 22, color: colors.muted, marginLeft: 10 }, pressed: { backgroundColor: 'rgba(255,255,255,0.04)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, chip: { height: 36, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 13.5, color: colors.textDim },
  nf: { flexDirection: 'row', alignItems: 'center', gap: 6 }, nfB: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  nfIn: { flex: 1, textAlign: 'center', padding: 0, fontFamily: fonts.familySemibold, fontSize: 15.5, color: colors.text }, nfBad: { borderRadius: 11, borderWidth: 1, borderColor: colors.red },
  nfU: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginLeft: 4 }, nfErr: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.red, marginTop: 4 },
  sen: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 14 }, senT: { fontFamily: fonts.familyRegular, fontSize: 16, color: colors.textDim }, senF: { marginVertical: 2 },
  cc: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' }, card: { flex: 1, minWidth: 180, borderRadius: 20, padding: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }, cardOn: { backgroundColor: 'rgba(127,168,217,0.14)', borderColor: 'rgba(157,191,230,0.65)' },
  cardIc: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)', marginBottom: 10 }, cardIcOn: { backgroundColor: colors.orangeLight },
  cardT: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text }, cardD: { fontFamily: fonts.familyRegular, fontSize: 12.5, color: colors.muted, marginTop: 4, lineHeight: 18 }, cardH: { fontFamily: fonts.familySemibold, fontSize: 11.5, color: colors.orangeLight, marginTop: 8 },
  pk: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.orangeLight, marginLeft: 12 }, pkOff: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', marginLeft: 12 },
  irT: { width: 160, fontFamily: fonts.familySemibold, fontSize: 15.5, color: colors.text }, ir: { flex: 1, textAlign: 'right', padding: 0, fontFamily: fonts.familySemibold, fontSize: 15.5, color: colors.text },
  note: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, lineHeight: 19, marginHorizontal: 8, marginTop: 8 },
});
