import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, StyleSheet } from 'react-native';
import KeyboardSafe from './KeyboardSafe';
import GlassSurface from './GlassSurface';
import GlassButton from './GlassButton';
import { getStockForWarehouse } from '../db/queries';
import { createTransfer } from '../db/warehouses';
import { colors, fonts } from '../constants/theme';

const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };
const q = n => (Math.round((n || 0) * 1000) / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 3 });
const rub = n => Math.round(n || 0).toLocaleString('ru-RU');

/**
 * Перемещение остатков между складами (любых локаций). Нельзя больше, чем есть на складе-источнике; общий остаток не меняется.
 * Props: visible, warehouses [{id, name, location_name}], fromId, toId?, preset {stockId, qty}?, onDone(), onClose, isNarrow.
 */
export default function TransferModal({ visible, warehouses = [], fromId, toId, preset, onDone, onClose, isNarrow }) {
  const [to, setTo] = useState(null); const [vals, setVals] = useState({}); const [rows, setRows] = useState([]); const [err, setErr] = useState('');
  const multi = new Set(warehouses.map(w => w.location_name)).size > 1;
  const nm = id => { const w = warehouses.find(x => x.id === id); return w ? (multi ? `${w.location_name} · ${w.name}` : w.name) : ''; };
  useEffect(() => {
    if (!visible || !fromId) return;
    const others = warehouses.filter(w => w.id !== fromId);
    setTo(toId && others.some(w => w.id === toId) ? toId : others[0]?.id || null);
    setRows(getStockForWarehouse(fromId).filter(s => s['остаток'] > 0));
    setVals(preset ? { [preset.stockId]: String(preset.qty).replace('.', ',') } : {}); setErr('');
  }, [visible, fromId]);
  const dest = to && getStockForWarehouse(to).reduce((m, s) => { m[s.id] = s['остаток']; return m; }, {});
  let n = 0, total = 0, bad = false;
  rows.forEach(s => { const v = num(vals[s.id]); if (v === null || v <= 0) return; if (v > s['остаток'] + 1e-9) bad = true; else { n++; total += v * (s.avg_price || 0); } });
  const ok = n > 0 && !bad && !!to;
  const go = () => {
    if (!ok) return;
    try {
      createTransfer({ fromId, toId: to, items: rows.filter(s => num(vals[s.id]) > 0).map(s => ({ stockId: s.id, qty: num(vals[s.id]) })) });
      onDone && onDone(n); onClose && onClose();
    } catch (e) { console.error(e); setErr(e.message || 'Не удалось переместить'); }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardSafe style={st.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.wrap, isNarrow && { width: '96%', minWidth: 0 }]}>
          <GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating padding={24}>
            <Text style={st.title}>Переместить остатки</Text><Text style={st.sub}>Передача между складами — общий остаток не меняется</Text>
            <View style={st.dest}>
              <View style={st.pl}><Text style={st.plK}>Откуда</Text><Text style={st.plV} numberOfLines={1}>{nm(fromId)}</Text></View><Text style={st.ar}>→</Text>
              <View style={st.pl}><Text style={st.plK}>Куда</Text><Text style={st.plV} numberOfLines={1}>{nm(to)}</Text></View>
            </View>
            <View style={st.chips}>{warehouses.filter(w => w.id !== fromId).map(w => <Pressable key={w.id} style={[st.chip, to === w.id && st.chipOn]} onPress={() => setTo(w.id)}><Text style={[st.chipT, to === w.id && { color: colors.orangeLight }]}>{nm(w.id)}</Text></Pressable>)}</View>
            <Text style={st.gl}>Позиции</Text>
            <ScrollView style={{ maxHeight: 250 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {rows.length === 0 ? <Text style={st.empty}>На этом складе пусто</Text> : rows.map(s => {
                const v = num(vals[s.id]), b = v !== null && v > s['остаток'] + 1e-9;
                return (
                  <View key={s.id} style={st.ir}>
                    <View style={{ flex: 1, minWidth: 0 }}><Text style={st.irN} numberOfLines={1}>{s.name}</Text><Text style={st.irS}>в наличии {q(s['остаток'])} {s.unit} · там {q(dest?.[s.id] || 0)}</Text></View>
                    <TextInput style={[st.inp, b && st.inpBad]} color={colors.text} value={vals[s.id] ?? ''} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="rgba(255,255,255,0.25)" onChangeText={t => { setErr(''); setVals(p => ({ ...p, [s.id]: t.replace(/[^0-9.,]/g, '') })); }} />
                    <Text style={st.u}>{s.unit}</Text>
                    <Pressable onPress={() => setVals(p => ({ ...p, [s.id]: String(s['остаток']).replace('.', ',') }))} hitSlop={6}><Text style={st.all}>всё</Text></Pressable>
                  </View>);
              })}
            </ScrollView>
            <Text style={st.sum}>{err || (n ? `Будет перемещено: ${n} поз. на ${rub(total)} ₽. Общий остаток не меняется.` : bad ? 'Нельзя переместить больше, чем есть на складе.' : 'Укажите количество хотя бы у одной позиции.')}</Text>
            <View style={st.foot}><GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={onClose} /><GlassButton style={{ flex: 1 }} tone="accent" label="Переместить" height={54} disabled={!ok} onPress={go} /></View>
          </GlassSurface>
        </View>
      </KeyboardSafe>
    </Modal>
  );
}
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', alignItems: 'center', justifyContent: 'center' }, wrap: { width: '50%', minWidth: 540, maxWidth: 640 },
  title: { fontFamily: fonts.display, fontSize: 21, color: colors.text }, sub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: 12 },
  dest: { flexDirection: 'row', alignItems: 'center', gap: 10 }, pl: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, plK: { fontFamily: fonts.familySemibold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted, marginBottom: 3 }, plV: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, ar: { fontSize: 22, color: colors.orangeLight },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, chip: { height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }, chipOn: { backgroundColor: 'rgba(127,168,217,0.2)', borderColor: 'rgba(157,191,230,0.5)' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim },
  gl: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginTop: 14, marginBottom: 6 }, empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, padding: 20 },
  ir: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }, irN: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, irS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  inp: { width: 92, height: 42, borderRadius: 12, textAlign: 'right', paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', color: colors.text, fontFamily: fonts.familySemibold, fontSize: 16 }, inpBad: { borderColor: 'rgba(219,129,120,0.7)' },
  u: { width: 34, fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginHorizontal: 6 }, all: { width: 40, textAlign: 'right', fontFamily: fonts.familySemibold, fontSize: 12, color: colors.orangeLight },
  sum: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.textDim, lineHeight: 19, marginTop: 12 }, foot: { flexDirection: 'row', gap: 10, marginTop: 14 },
});
