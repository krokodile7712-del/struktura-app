import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, StyleSheet } from 'react-native';
import KeyboardSafe from './KeyboardSafe';
import GlassSurface from './GlassSurface';
import GlassButton from './GlassButton';
import Icon from './Icon';
import { getAllStock, addPurchases } from '../db/queries';
import { colors, fonts } from '../constants/theme';

const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const rub = n => Math.round(n || 0).toLocaleString('ru-RU');

/**
 * Закупка списком (накладная): несколько позиций на ОДИН склад прихода, у каждой количество и цена за единицу.
 * Записывается одной операцией: не получилось — не записано ничего. Позиция без цены только пополняет остаток.
 * Props: visible, warehouses [{id, name, location_name}], warehouseId, firstStockId?, onDone(n), onClose, isNarrow.
 */
export default function PurchaseInvoiceModal({ visible, warehouses = [], warehouseId, firstStockId, onDone, onClose, isNarrow }) {
  const [wid, setWid] = useState(null); const [lines, setLines] = useState([]); const [stock, setStock] = useState([]);
  const [pick, setPick] = useState(false); const [search, setSearch] = useState(''); const [err, setErr] = useState('');
  const multi = new Set(warehouses.map(w => w.location_name)).size > 1;
  useEffect(() => {
    if (!visible) return;
    const all = getAllStock(); setStock(all); setWid(warehouseId || warehouses[0]?.id || null); setPick(false); setSearch(''); setErr('');
    const f = firstStockId && all.find(s => s.id === firstStockId);
    setLines(f ? [{ id: f.id, name: f.name, unit: f.unit, qty: '', price: f.last_price ? String(f.last_price).replace('.', ',') : '' }] : []);
  }, [visible]);
  const total = lines.reduce((a, l) => a + num(l.qty) * num(l.price), 0);
  const valid = lines.length > 0 && lines.every(l => num(l.qty) > 0) && !!wid;
  const setLine = (id, k, v) => setLines(p => p.map(l => (l.id === id ? { ...l, [k]: v.replace(/[^0-9.,]/g, '') } : l)));
  const save = () => {
    if (!valid) return;
    try { const n = addPurchases(lines.map(l => ({ name: l.name, qty: num(l.qty), price: num(l.price) })), wid); onDone && onDone(n, total); onClose && onClose(); }
    catch (e) { console.error(e); setErr('Не удалось записать закупку — ничего не сохранено. Попробуйте ещё раз.'); }
  };
  const list = stock.filter(s => !lines.some(l => l.id === s.id) && (!search.trim() || s.name.toLowerCase().includes(search.trim().toLowerCase())));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardSafe style={st.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.wrap, isNarrow && { width: '96%', minWidth: 0 }]}>
          <GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating padding={24}>
            <Text style={st.title}>{pick ? 'Выберите позицию' : 'Закупка списком'}</Text>
            {pick ? (
              <>
                <TextInput style={st.search} color={colors.text} value={search} onChangeText={setSearch} autoFocus placeholder="Поиск позиции" placeholderTextColor={colors.muted} />
                <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
                  {list.length === 0 ? <Text style={st.empty}>Ничего не найдено</Text> : list.map(s => (
                    <Pressable key={s.id} style={st.pk} onPress={() => { setLines(p => [...p, { id: s.id, name: s.name, unit: s.unit, qty: '', price: s.last_price ? String(s.last_price).replace('.', ',') : '' }]); setPick(false); setSearch(''); }}>
                      <Text style={st.pkN}>{s.name}</Text><Text style={st.pkS}>{s.unit}</Text></Pressable>))}
                </ScrollView>
                <View style={st.foot}><GlassButton style={{ flex: 1 }} label="Назад" height={50} onPress={() => setPick(false)} /></View>
              </>
            ) : (
              <>
                <Text style={st.gl}>Придёт на склад</Text>
                <View style={st.chips}>{warehouses.map(w => <Pressable key={w.id} style={[st.chip, wid === w.id && st.chipOn]} onPress={() => setWid(w.id)}><Text style={[st.chipT, wid === w.id && { color: colors.orangeLight }]}>{multi ? `${w.location_name} · ${w.name}` : w.name}</Text></Pressable>)}</View>
                <Text style={st.gl}>Позиции</Text>
                <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {lines.map(l => (
                    <View key={l.id} style={st.ln}>
                      <View style={{ flex: 1, minWidth: 0 }}><Text style={st.lnN} numberOfLines={1}>{l.name}</Text><Text style={st.lnS}>{l.unit}</Text></View>
                      <TextInput style={st.inp} color={colors.text} value={l.qty} keyboardType="decimal-pad" placeholder="кол-во" placeholderTextColor="rgba(255,255,255,0.25)" onChangeText={v => setLine(l.id, 'qty', v)} />
                      <TextInput style={st.inp} color={colors.text} value={l.price} keyboardType="decimal-pad" placeholder="цена ₽" placeholderTextColor="rgba(255,255,255,0.25)" onChangeText={v => setLine(l.id, 'price', v)} />
                      <Pressable onPress={() => setLines(p => p.filter(x => x.id !== l.id))} hitSlop={8} style={{ paddingHorizontal: 6 }}><Icon name="x" size={16} color={colors.muted} /></Pressable>
                    </View>))}
                  <Pressable style={st.add} onPress={() => setPick(true)}><Text style={st.addT}>+ Добавить позицию</Text></Pressable>
                </ScrollView>
                <View style={st.sum}><Text style={st.sumL}>Сумма закупки</Text><Text style={st.sumV}>{rub(total)} ₽</Text></View>
                <Text style={st.hint}>{err || 'Цена за единицу. Без цены позиция только пополнит остаток, расход не создаётся. Закупка не делится между складами — на другой склад перемещением.'}</Text>
                <View style={st.foot}><GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={onClose} /><GlassButton style={{ flex: 1 }} tone="accent" label="Записать закупку" height={54} disabled={!valid} onPress={save} /></View>
              </>
            )}
          </GlassSurface>
        </View>
      </KeyboardSafe>
    </Modal>
  );
}
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', alignItems: 'center', justifyContent: 'center' }, wrap: { width: '50%', minWidth: 540, maxWidth: 640 },
  title: { fontFamily: fonts.display, fontSize: 21, color: colors.text }, gl: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginTop: 14, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }, chipOn: { backgroundColor: 'rgba(127,168,217,0.2)', borderColor: 'rgba(157,191,230,0.5)' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim },
  ln: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }, lnN: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, lnS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  inp: { width: 100, height: 42, borderRadius: 12, textAlign: 'right', paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', color: colors.text, fontFamily: fonts.familySemibold, fontSize: 15 },
  add: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }, addT: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orangeLight },
  sum: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10, padding: 14, borderRadius: 16, backgroundColor: 'rgba(127,168,217,0.08)', borderWidth: 1, borderColor: 'rgba(157,191,230,0.22)' }, sumL: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 13, color: colors.textDim }, sumV: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  hint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, lineHeight: 18, marginTop: 8 }, foot: { flexDirection: 'row', gap: 10, marginTop: 14 },
  search: { height: 48, borderRadius: 14, paddingHorizontal: 16, marginTop: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', fontFamily: fonts.familyMedium, fontSize: 16, color: colors.text }, empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, padding: 20, textAlign: 'center' },
  pk: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }, pkN: { flex: 1, fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, pkS: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
});
