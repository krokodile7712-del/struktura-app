import React from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from 'react-native';
import GlassSurface from './GlassSurface';
import { colors, fonts } from '../constants/theme';

/**
 * Одно компактное меню вместо чипов: выбор склада (по локациям) + «Все склады» и действия со складом.
 * Props: visible, anchor {top, left, width}, warehouses [{id, name, location_name}], currentId (0 — все склады),
 * actions [{key, icon, label, hint}], onPick(id), onAction(key), onClose.
 */
export default function WarehouseMenu({ visible, anchor, warehouses = [], currentId, actions = [], onPick, onAction, onClose }) {
  const groups = [...new Set(warehouses.map(w => w.location_name))];
  const multi = groups.length > 1;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.wrap, { top: anchor?.top || 120, left: anchor?.left || 20, width: Math.max(380, anchor?.width || 380) }]}>
          <GlassSurface floating radius={22} tint="32,40,55" alpha={0.985} padding={14}>
            <ScrollView style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
              <Text style={st.gh}>Склад</Text>
              {warehouses.map(w => (
                <Pressable key={w.id} style={st.row} onPress={() => onPick(w.id)}>
                  <Text style={st.t}>{w.name}</Text>{multi && <Text style={st.s}>{w.location_name}</Text>}
                  {currentId === w.id && <Text style={st.ck}>✓</Text>}
                </Pressable>))}
              <Pressable style={st.row} onPress={() => onPick(0)}><Text style={st.t}>Все склады</Text><Text style={st.s}>сумма по всем</Text>{currentId === 0 && <Text style={st.ck}>✓</Text>}</Pressable>
              <View style={st.sep} />
              <Text style={st.gh}>Действия</Text>
              {actions.map(a => (
                <Pressable key={a.key} style={[st.row, a.disabled && { opacity: 0.4 }]} onPress={() => onAction(a.key)}>
                  <View style={st.ic}><Text style={st.icT}>{a.icon}</Text></View><Text style={st.t}>{a.label}</Text>{!!a.hint && <Text style={st.s}>{a.hint}</Text>}
                </Pressable>))}
            </ScrollView>
          </GlassSurface>
        </View>
      </View>
    </Modal>
  );
}
const st = StyleSheet.create({
  wrap: { position: 'absolute' },
  gh: { fontFamily: fonts.familySemibold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginHorizontal: 6, marginTop: 4, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12 },
  t: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, s: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginLeft: 8, flexShrink: 1 },
  ck: { marginLeft: 'auto', fontFamily: fonts.family, fontSize: 16, color: colors.orangeLight },
  sep: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 8, marginHorizontal: 4 },
  ic: { width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(127,168,217,0.14)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }, icT: { fontSize: 14, color: colors.orangeLight },
});
