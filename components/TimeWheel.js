import React, { useRef, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts } from '../constants/theme';

const H = 40;
function Col({ max, value, onChange }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollTo({ y: value * H, animated: false }); }, [value]);
  const settle = e => { const i = Math.max(0, Math.min(max, Math.round(e.nativeEvent.contentOffset.y / H))); if (i !== value) onChange(i); };
  return (
    <ScrollView ref={ref} style={st.col} showsVerticalScrollIndicator={false} snapToInterval={H} decelerationRate="fast"
      contentContainerStyle={{ paddingVertical: 2 * H }} onMomentumScrollEnd={settle} onScrollEndDrag={settle} nestedScrollEnabled>
      {Array.from({ length: max + 1 }, (_, i) => (
        <Pressable key={i} style={st.item} onPress={() => { ref.current?.scrollTo({ y: i * H, animated: true }); onChange(i); }}>
          <Text style={[st.txt, i === value && st.txtOn]}>{String(i).padStart(2, '0')}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Барабан времени как в iOS: часы и минуты прокручиваются, центральная строка выделена. onChange({ h, m }). */
export default function TimeWheel({ h, m, onChange }) {
  return (
    <View style={st.wrap}>
      <View style={st.band} pointerEvents="none" />
      <Col max={23} value={h} onChange={v => onChange({ h: v, m })} />
      <Text style={st.colon}>:</Text>
      <Col max={59} value={m} onChange={v => onChange({ h, m: v })} />
      <LinearGradient pointerEvents="none" colors={['rgba(20,26,36,0.95)', 'rgba(20,26,36,0)']} style={[st.fade, { top: 0 }]} />
      <LinearGradient pointerEvents="none" colors={['rgba(20,26,36,0)', 'rgba(20,26,36,0.95)']} style={[st.fade, { bottom: 0 }]} />
    </View>
  );
}
const st = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: 5 * H, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.18)', overflow: 'hidden' },
  band: { position: 'absolute', left: 14, right: 14, top: 2 * H, height: H, borderRadius: 12, backgroundColor: 'rgba(127,168,217,0.14)', borderWidth: 1, borderColor: 'rgba(157,191,230,0.35)' },
  col: { width: 96, height: 5 * H }, item: { height: H, alignItems: 'center', justifyContent: 'center' },
  txt: { fontFamily: fonts.familySemibold, fontSize: 24, color: colors.textDim }, txtOn: { color: colors.text },
  colon: { fontFamily: fonts.familySemibold, fontSize: 24, color: colors.muted, marginHorizontal: 2 },
  fade: { position: 'absolute', left: 0, right: 0, height: 2 * H - 10 },
});
