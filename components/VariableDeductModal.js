import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from 'react-native';
import GlassSurface from './GlassSurface';
import SoftGlow from './SoftGlow';
import Icon from './Icon';
import AnimatedNumber from './AnimatedNumber';
import { colors, fonts } from '../constants/theme';

const num = (s) => { const n = parseFloat(String(s || '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const fmt = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmtS = (n) => fmt(n).toLocaleString('ru-RU');
const toStr = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

function Key({ label, icon, onPress, wide }) {
  return (
    <Pressable style={({ pressed }) => [styles.keyWrap, wide && { width: '100%' }, pressed && { transform: [{ scale: 0.95 }] }]} onPress={onPress}>
      <GlassSurface radius={14} floating shadowScale={0.3} tint="150,172,204" alpha={0.14} contentStyle={styles.keyIn}
        sheen={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.01)']}>
        {icon ? <Icon name={icon} size={24} color={colors.text} /> : <Text style={styles.keyTxt}>{label}</Text>}
      </GlassSurface>
    </Pressable>
  );
}

/**
 * «Расход по факту»: базовая цена + количество каждого материала. Ввод — встроенной цифровой клавиатурой
 * (без системной: она перекрывала окно, а запятая терялась), шаги «−/+» по единице материала, «Как в прошлый раз».
 * У материала видны цена, остаток на складе и сумма; строки округляются до рубля, итог = сумма строк.
 * Props: visible, title, base (число), ings [{name, unit, price, stock, step, qty}], last ({имя: qty} | null),
 * onConfirm({ base, ings:[{name, amount}], total }), onClose, isNarrow.
 */
export default function VariableDeductModal({ visible, title, base = 0, ings = [], last = null, onConfirm, onClose, isNarrow }) {
  const [vals, setVals] = useState([]);
  const [act, setAct] = useState(1);

  useEffect(() => {
    if (!visible) return;
    setVals([String(base || '')].concat(ings.map(i => (i.qty ? toStr(i.qty) : ''))));
    setAct(ings.length > 0 ? 1 : 0);
  }, [visible]);

  const setVal = (i, v) => setVals(arr => arr.map((x, j) => (j === i ? v : x)));
  const key = (k) => {
    let s = vals[act] || '';
    if (k === 'b') s = s.slice(0, -1);
    else if (k === ',') { if (!s.includes(',')) s = (s || '0') + ','; }
    else { if (s === '0') s = ''; if (s.length < 8) s += k; }
    setVal(act, s);
  };
  const step = (i, dir) => {
    const m = ings[i - 1];
    const v = Math.max(0, Math.round((num(vals[i]) + dir * (m.step || 1)) * 100) / 100);
    setAct(i); setVal(i, v ? toStr(v) : '');
  };
  const useLast = () => {
    if (!last) return;
    setVals(arr => arr.map((x, i) => (i === 0 ? x : (last[ings[i - 1].name] != null ? toStr(last[ings[i - 1].name]) : ''))));
    setAct(1);
  };

  const baseR = Math.round(num(vals[0]));
  const lines = ings.map((m, i) => Math.round(num(vals[i + 1]) * (m.price || 0)));
  const mats = lines.reduce((s, x) => s + x, 0);
  const total = baseR + mats;
  const notes = [];
  ings.forEach((m, i) => {
    const q = num(vals[i + 1]);
    if (q > 0 && m.stock != null && q > m.stock) notes.push(`«${m.name}»: на складе меньше, чем вводите — остаток уйдёт в минус.`);
    else if (q > 0 && !(m.price > 0)) notes.push(`У «${m.name}» не задана цена: он спишется со склада, но в счёт не попадёт.`);
  });

  const confirm = () => onConfirm && onConfirm({
    base: baseR,
    ings: ings.map((m, i) => ({ name: m.name, amount: num(vals[i + 1]) })).filter(a => a.amount > 0),
    total,
  });

  const field = (i, name, unit, valStr, sub, subColor, sum, stepper) => (
    <Pressable key={i} style={[styles.f, act === i && styles.fOn]} onPress={() => setAct(i)}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.fName} numberOfLines={1}>{name}</Text>
        {!!sub && <Text style={[styles.fSub, subColor && { color: subColor }]} numberOfLines={2}>{sub}</Text>}
      </View>
      <Text style={[styles.fVal, !valStr && { color: 'rgba(255,255,255,0.25)' }]}>{valStr || '0'}<Text style={styles.fUnit}> {unit}</Text></Text>
      {stepper && (
        <View style={{ flexDirection: 'row', marginLeft: 10 }}>
          <Pressable style={styles.stepBtn} onPress={() => step(i, -1)} hitSlop={4}><Icon name="minus" size={18} color={colors.textDim} /></Pressable>
          <Pressable style={styles.stepBtn} onPress={() => step(i, 1)} hitSlop={4}><Icon name="plus" size={18} color={colors.textDim} /></Pressable>
        </View>
      )}
      {sum != null && <Text style={styles.fSum}>{sum}</Text>}
    </Pressable>
  );

  const left = (
    <View style={styles.left}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.sub}>Расход по факту · введите, сколько материала ушло</Text>
        </View>
        {!!last && (
          <Pressable style={styles.lastBtn} onPress={useLast}>
            <Icon name="list" size={16} color={colors.orangeLight} /><Text style={styles.lastTxt}>Как в прошлый раз</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.sec}>Работа</Text>
      {field(0, 'Базовая цена', '₽', vals[0], 'Можно поправить для этого заказа', null, null, false)}
      <Text style={styles.sec}>Материалы</Text>
      <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
        {ings.length === 0
          ? <Text style={styles.sub}>Для этой услуги не указаны материалы — задайте их в «Товары» → техкарта.</Text>
          : ings.map((m, k) => {
              const i = k + 1; const q = num(vals[i]);
              const over = q > 0 && m.stock != null && q > m.stock;
              const sub = `${m.price > 0 ? `${fmtS(m.price)} ₽/${m.unit}` : 'цена не задана'}${m.stock != null ? ` · ост. ${fmtS(m.stock)} ${m.unit}` : ''}${over ? ' · не хватает' : ''}`;
              return field(i, m.name, m.unit, vals[i], sub, over ? colors.red : (!(m.price > 0) && q > 0 ? colors.warning : null), q > 0 ? `${fmtS(lines[k])} ₽` : '', true);
            })}
      </ScrollView>
      {notes.length > 0 && <Text style={styles.note}>{notes.slice(0, 2).join('\n')}</Text>}
    </View>
  );

  const right = (
    <View style={[styles.right, isNarrow && { width: '100%', borderLeftWidth: 0, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }]}>
      <View style={styles.glow} pointerEvents="none"><SoftGlow size={340} color="127,168,217" alpha={0.2} /></View>
      <View style={styles.sl}><Text style={styles.slT}>Работа</Text><Text style={styles.slV}>{fmtS(baseR)} ₽</Text></View>
      <View style={styles.sl}><Text style={styles.slT}>Материалы</Text><Text style={styles.slV}>{fmtS(mats)} ₽</Text></View>
      <View style={styles.tot}>
        <Text style={styles.totLbl}>Итого за позицию</Text>
        <AnimatedNumber value={total} style={styles.totVal} />
      </View>
      <View style={styles.kp}>
        {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map(k => <Key key={k} label={k} onPress={() => key(k)} />)}
        <Key label="," onPress={() => key(',')} /><Key label="0" onPress={() => key('0')} /><Key icon="backspace" onPress={() => key('b')} />
      </View>
      {ings.length > 1 && (
        <Pressable style={styles.next} onPress={() => setAct(a => (a >= ings.length ? 1 : a + 1))}>
          <Text style={styles.nextTxt}>Следующее поле  ›</Text>
        </Pressable>
      )}
      <Pressable style={({ pressed }) => [styles.confirm, pressed && { transform: [{ scale: 0.98 }] }]} onPress={confirm}>
        <Text style={styles.confirmTxt}>Добавить в заказ · {fmtS(total)} ₽</Text>
      </Pressable>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.wrap, isNarrow && { width: '96%', maxHeight: '94%' }]}>
          <GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating>
            <ScrollView scrollEnabled={!!isNarrow} contentContainerStyle={[styles.cols, isNarrow && { flexDirection: 'column' }]}>
              {left}{right}
            </ScrollView>
          </GlassSurface>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', alignItems: 'center', justifyContent: 'center' },
  wrap: { width: '70%', minWidth: 700, maxWidth: 900 },
  cols: { flexDirection: 'row', borderRadius: 26, overflow: 'hidden' },
  left: { flex: 1, minWidth: 0, padding: 22 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  sub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  lastBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(157,191,230,0.5)', backgroundColor: 'rgba(127,168,217,0.14)' },
  lastTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orangeLight },
  sec: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginTop: 14, marginBottom: 8 },
  f: { flexDirection: 'row', alignItems: 'center', minHeight: 66, borderRadius: 16, paddingVertical: 8, paddingLeft: 16, paddingRight: 14, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  fOn: { backgroundColor: 'rgba(127,168,217,0.10)', borderColor: 'rgba(157,191,230,0.6)' },
  fName: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  fSub: { fontFamily: fonts.familyMedium, fontSize: 12, color: colors.muted, marginTop: 2 },
  fVal: { fontFamily: fonts.display, fontSize: 26, color: colors.text, marginLeft: 10, letterSpacing: -0.4 },
  fUnit: { fontFamily: fonts.familyMedium, fontSize: 14, color: colors.orangeLight },
  stepBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  fSum: { width: 78, textAlign: 'right', fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim, marginLeft: 10 },
  note: { fontFamily: fonts.familyMedium, fontSize: 13, color: colors.warning, marginTop: 8, lineHeight: 19 },
  right: { width: 330, padding: 22, backgroundColor: 'rgba(0,0,0,0.14)', borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  glow: { position: 'absolute', right: -90, top: -90 },
  sl: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  slT: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim },
  slV: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  tot: { marginTop: 10, marginBottom: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  totLbl: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.textDim, marginBottom: 4 },
  totVal: { fontFamily: fonts.display, fontSize: 48, color: colors.text, letterSpacing: -1.6 },
  kp: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  keyWrap: { width: '31.5%' },
  keyIn: { height: 54, alignItems: 'center', justifyContent: 'center' },
  keyTxt: { fontFamily: fonts.familySemibold, fontSize: 22, color: colors.text },
  next: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(157,191,230,0.4)', backgroundColor: 'rgba(127,168,217,0.12)', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  nextTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orangeLight },
  confirm: { marginTop: 14, height: 56, borderRadius: 16, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  confirmTxt: { fontFamily: fonts.family, fontSize: 17, color: colors.onAccent },
});
