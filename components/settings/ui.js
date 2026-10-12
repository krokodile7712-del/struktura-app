import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import Toggle from '../Toggle';
import { colors, fonts } from '../../constants/theme';

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
      <Animated.View style={[st.grp, danger && st.grpDanger, e]}>
        {kids.map((c, i) => <View key={i} style={i > 0 && [st.div, danger && st.divDanger]}>{c}</View>)}
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

// Выбор из нескольких значений чипами (внутри строки)
export function ChipsRow({ title, sub, items, value, onChange }) {
  return (
    <View style={st.row}>
      <View style={{ flex: 1 }}>
        <Text style={st.t}>{title}</Text>{!!sub && <Text style={st.s}>{sub}</Text>}
        <View style={st.chips}>{items.map(([k, label]) => (
          <Pressable key={String(k)} style={[st.chip, value === k && st.chipOn]} onPress={() => onChange(k)}>
            <Text style={[st.chipT, value === k && { color: colors.orangeLight }]}>{label}</Text>
          </Pressable>))}
        </View>
      </View>
    </View>
  );
}

export const Note = ({ children, warn }) => <Text style={[st.note, warn && { color: colors.warning }]}>{children}</Text>;

export const st = StyleSheet.create({
  gap: { marginTop: 18 },
  gt: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.muted, marginLeft: 8, marginBottom: 8 },
  grp: { borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  grpDanger: { backgroundColor: 'rgba(219,129,120,0.06)', borderColor: 'rgba(219,129,120,0.25)' },
  div: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' }, divDanger: { borderTopColor: 'rgba(219,129,120,0.18)' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 58, paddingHorizontal: 18, paddingVertical: 10 },
  l: { flex: 1, minWidth: 0 }, t: { fontFamily: fonts.familySemibold, fontSize: 15.5, color: colors.text }, s: { fontFamily: fonts.familyRegular, fontSize: 12.5, color: colors.muted, marginTop: 2, lineHeight: 18 },
  v: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.textDim, marginLeft: 12 }, ch: { fontSize: 22, color: colors.muted, marginLeft: 10 }, pressed: { backgroundColor: 'rgba(255,255,255,0.04)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, chip: { height: 36, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }, chipOn: { backgroundColor: 'rgba(127,168,217,0.2)', borderColor: 'rgba(157,191,230,0.5)' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 13.5, color: colors.textDim },
  note: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, lineHeight: 19, marginHorizontal: 8, marginTop: 8 },
});
