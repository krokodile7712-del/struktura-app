import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, Share, StyleSheet } from 'react-native';
import GlassSurface from './GlassSurface';
import GlassButton from './GlassButton';
import { getTransfers, getPurchaseList } from '../db/warehouses';
import { colors, fonts } from '../constants/theme';

const rub = n => Math.round(n || 0).toLocaleString('ru-RU');
const q = n => (Math.round((n || 0) * 100) / 100).toLocaleString('ru-RU');
const when = iso => { try { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } catch (_) { return ''; } };

function Shell({ visible, title, sub, onClose, children, footer }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={st.wrap}><GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating padding={24}>
          <Text style={st.title}>{title}</Text>{!!sub && <Text style={st.sub}>{sub}</Text>}
          <ScrollView style={{ maxHeight: 380, marginTop: 8 }} showsVerticalScrollIndicator={false}>{children}</ScrollView>
          <View style={st.foot}>{footer}</View>
        </GlassSurface></View>
      </View>
    </Modal>
  );
}

/** История перемещений между складами (по складу или по всем). */
export function TransfersModal({ visible, warehouseId, onClose }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { if (visible) { try { setRows(getTransfers({ warehouseId: warehouseId || null })); } catch (e) { console.error(e); } } }, [visible, warehouseId]);
  return (
    <Shell visible={visible} title="История перемещений" sub="Последние передачи между складами" onClose={onClose} footer={<GlassButton style={{ flex: 1 }} label="Закрыть" height={50} onPress={onClose} />}>
      {rows.length === 0 ? <Text style={st.empty}>Перемещений пока не было</Text> : rows.map(t => (
        <View key={t.id} style={st.hr}><View style={{ flex: 1 }}><Text style={st.hN}>{t.from_name} → {t.to_name}</Text><Text style={st.hS}>{t.user_name || '—'} · {when(t.created_at)}{t.note ? ` · ${t.note}` : ''}</Text></View>
          <Text style={st.hA}>{t.positions} поз. · {rub(t.total)} ₽</Text></View>))}
    </Shell>
  );
}

/** Список для закупки: позиции ниже порога и сколько докупить до двойного порога; можно поделиться текстом. */
export function PurchaseListModal({ visible, warehouseId, warehouseName, onClose }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { if (visible) { try { setRows(getPurchaseList(warehouseId || null)); } catch (e) { console.error(e); } } }, [visible, warehouseId]);
  const text = `Список для закупки · ${warehouseName || 'Все склады'}\n` + rows.map(r => `• ${r.name} — купить ${q(r.need)} ${r.unit} (сейчас ${q(r.have)})`).join('\n');
  return (
    <Shell visible={visible} title="Список для закупки" sub={`${warehouseName || 'Все склады'} · до двойного порога`} onClose={onClose}
      footer={<><GlassButton style={{ flex: 1 }} label="Закрыть" height={50} onPress={onClose} /><GlassButton style={{ flex: 1 }} tone="accent" label="Поделиться списком" height={50} disabled={rows.length === 0} onPress={() => Share.share({ message: text }).catch(() => {})} /></>}>
      {rows.length === 0 ? <Text style={st.empty}>Всё в порядке: ниже порога ничего нет</Text> : rows.map(r => (
        <View key={r.name} style={st.hr}><View style={{ flex: 1 }}><Text style={st.hN}>{r.name}</Text><Text style={st.hS}>сейчас {q(r.have)} {r.unit}</Text></View>
          <Text style={st.hA}>купить {q(r.need)} {r.unit}{r.sum ? ` · ≈ ${rub(r.sum)} ₽` : ''}</Text></View>))}
    </Shell>
  );
}
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', alignItems: 'center', justifyContent: 'center' }, wrap: { width: '46%', minWidth: 500, maxWidth: 600 },
  title: { fontFamily: fonts.display, fontSize: 21, color: colors.text }, sub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 2 }, foot: { flexDirection: 'row', gap: 10, marginTop: 14 },
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, padding: 24, textAlign: 'center' },
  hr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }, hN: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, hS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 }, hA: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginLeft: 12, textAlign: 'right', maxWidth: 220 },
});
