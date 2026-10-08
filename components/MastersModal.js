import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import GlassSurface from './GlassSurface';
import GlassButton from './GlassButton';
import Toggle from './Toggle';
import { getStaffSettings, setStaffTakesBookings } from '../db/bookings';
import { colors, fonts } from '../constants/theme';

/** «Мастера»: сотрудники (из раздела «Сотрудники»), которых можно выбрать в записи; по ним же проверяется занятость. */
export default function MastersModal({ visible, onChanged, onClose }) {
  const [rows, setRows] = useState([]);
  const load = () => { try { setRows(getStaffSettings()); } catch (e) { console.error(e); } };
  useEffect(() => { if (visible) load(); }, [visible]);
  const toggle = (u, v) => { try { setStaffTakesBookings(u.id, v); load(); onChanged && onChanged(); } catch (e) { console.error(e); } };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.root}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={st.wrap}><GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating padding={24}>
          <Text style={st.title}>Мастера</Text><Text style={st.sub}>Сотрудники, к которым можно записать клиента (список — из раздела «Сотрудники»)</Text>
          <View style={{ marginTop: 8 }}>{rows.length === 0 ? <Text style={st.empty}>Сотрудников пока нет</Text> : rows.map(u => (
            <View key={u.id} style={st.row}><View style={{ flex: 1 }}><Text style={st.n}>{u.name}</Text><Text style={st.s}>{u.takes ? 'принимает записи' : 'не принимает записи'}</Text></View><Toggle value={!!u.takes} onValueChange={v => toggle(u, v)} /></View>))}</View>
          <View style={st.foot}><GlassButton style={{ flex: 1 }} tone="accent" label="Готово" height={54} onPress={onClose} /></View>
        </GlassSurface></View>
      </View>
    </Modal>
  );
}
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', alignItems: 'center', justifyContent: 'center' }, wrap: { width: '44%', minWidth: 480, maxWidth: 560 },
  title: { fontFamily: fonts.display, fontSize: 21, color: colors.text }, sub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 3, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }, n: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, s: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, padding: 20, textAlign: 'center' }, foot: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
