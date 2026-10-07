import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Modal, TextInput, ScrollView, StyleSheet } from 'react-native';
import GlassSurface from './GlassSurface';
import GlassButton from './GlassButton';
import KeyboardSafe from './KeyboardSafe';
import { useToast } from './Toast';
import { getStructure, needsWorkstationBinding, bindThisDevice, saveWorkstation } from '../db/warehouses';
import { subscribe } from '../db/events';
import { getSession } from '../db/session';
import { colors, fonts } from '../constants/theme';

/**
 * «К какому месту относится этот планшет?» — показывается один раз, когда включены несколько локаций или складов,
 * а планшет ещё не привязан к рабочему месту: от привязки зависит, с какого склада списываются продажи.
 * «Позже» скрывает окно до следующего запуска (продажи пока идут со склада смены или точки сотрудника).
 */
export default function WorkstationGate({ route, active }) {
  const toast = useToast();
  const [open, setOpen] = useState(false); const [tree, setTree] = useState({ active: [] });
  const [loc, setLoc] = useState(null); const [ws, setWs] = useState(null); const [name, setName] = useState(''); const [wh, setWh] = useState(null);
  const dismissed = useRef(false);
  const check = () => {
    try {
      const need = !!active && !!getSession() && !dismissed.current && needsWorkstationBinding();
      if (need && !open) { const t = getStructure(); setTree(t); const l = t.active[0]; setLoc(l?.id || null); setWs(l?.workstations[0]?.id || 'new'); setWh(l?.warehouses[0]?.id || null); setName(`Планшет ${((l?.workstations.length) || 0) + 1}`); }
      setOpen(need);
    } catch (e) { console.error(e); }
  };
  useEffect(check, [route, active]);
  useEffect(() => { const off = subscribe('structureChanged', () => { dismissed.current = false; check(); }); return () => off && off(); }, []);
  if (!open) return null;
  const L = tree.active.find(l => l.id === loc);
  const pickLoc = l => { setLoc(l.id); setWs(l.workstations[0]?.id || 'new'); setWh(l.warehouses[0]?.id || null); setName(`Планшет ${l.workstations.length + 1}`); };
  const ok = !!L && (ws !== 'new' || (name.trim() && wh));
  const go = () => {
    try {
      if (ws === 'new') saveWorkstation({ locationId: L.id, warehouseId: wh, name, bindThisDevice: true }); else bindThisDevice(ws);
      toast.show(`Планшет привязан: ${L.name}`, 'info'); setOpen(false);
    } catch (e) { console.error(e); toast.show(e.message || 'Не удалось привязать', 'warn'); }
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { dismissed.current = true; setOpen(false); }}>
      <KeyboardSafe style={st.ov}>
        <View style={st.win}><GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating padding={24}>
          <Text style={st.t}>К какому месту относится этот планшет?</Text>
          <Text style={st.s}>Выбирается один раз. От этого зависит, с какого склада списываются продажи.</Text>
          <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
            <Text style={st.gl}>Локация</Text>
            <View style={st.chips}>{tree.active.map(l => <Pressable key={l.id} style={[st.chip, loc === l.id && st.on]} onPress={() => pickLoc(l)}><Text style={[st.ct, loc === l.id && { color: colors.orangeLight }]}>{l.name}</Text></Pressable>)}</View>
            {!!L && <>
              <Text style={st.gl}>Рабочее место</Text>
              <View style={st.chips}>
                {L.workstations.map(z => <Pressable key={z.id} style={[st.chip, ws === z.id && st.on]} onPress={() => setWs(z.id)}><Text style={[st.ct, ws === z.id && { color: colors.orangeLight }]}>{z.name}</Text><Text style={st.cs}>склад «{z.warehouse_name}»</Text></Pressable>)}
                <Pressable style={[st.chip, ws === 'new' && st.on]} onPress={() => setWs('new')}><Text style={[st.ct, ws === 'new' && { color: colors.orangeLight }]}>Новое…</Text></Pressable>
              </View>
              {ws === 'new' && <>
                <View style={st.fld}><Text style={st.fl}>Название</Text><TextInput style={st.in} color={colors.text} value={name} onChangeText={setName} /></View>
                <Text style={st.gl}>Списывает со склада</Text>
                <View style={st.chips}>{L.warehouses.map(w => <Pressable key={w.id} style={[st.chip, wh === w.id && st.on]} onPress={() => setWh(w.id)}><Text style={[st.ct, wh === w.id && { color: colors.orangeLight }]}>{w.name}</Text></Pressable>)}</View>
              </>}
            </>}
          </ScrollView>
          <View style={st.foot}><GlassButton style={{ flex: 1 }} label="Позже" height={54} onPress={() => { dismissed.current = true; setOpen(false); }} /><GlassButton style={{ flex: 1 }} tone="accent" label="Привязать" height={54} disabled={!ok} onPress={go} /></View>
        </GlassSurface></View>
      </KeyboardSafe>
    </Modal>
  );
}
const st = StyleSheet.create({
  ov: { flex: 1, backgroundColor: 'rgba(5,8,12,0.7)', alignItems: 'center', justifyContent: 'center' }, win: { width: '46%', minWidth: 500, maxWidth: 580 },
  t: { fontFamily: fonts.display, fontSize: 21, color: colors.text }, s: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 3, marginBottom: 6, lineHeight: 19 },
  gl: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginTop: 14, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, on: { backgroundColor: 'rgba(127,168,217,0.16)', borderColor: 'rgba(157,191,230,0.6)' },
  ct: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim }, cs: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  fld: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderRadius: 16, paddingHorizontal: 16, marginTop: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, fl: { width: 90, fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim }, in: { flex: 1, padding: 0, fontFamily: fonts.familySemibold, fontSize: 17, color: colors.text },
  foot: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
