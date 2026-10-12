import React, { useState, useEffect } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import GlassSurface from '../GlassSurface';
import GlassButton from '../GlassButton';
import { getDb } from '../../db/database';
import { previewSalesReset, resetSalesAndClients } from '../../db/dataReset';
import { colors, fonts } from '../../constants/theme';

const num = n => Number(n).toLocaleString('ru-RU');

/**
 * Безопасный сброс «продажи и клиенты»: что будет удалено (с числами) → сначала копия или сразу дальше → PIN администратора → итог.
 * Props: visible, onClose, onBackup() — запустить создание копии, askPin(action) — запросить PIN и выполнить action, onDone().
 */
export default function ResetSheet({ visible, onClose, onBackup, askPin, onDone }) {
  const [pv, setPv] = useState(null); const [res, setRes] = useState(null);
  useEffect(() => { if (visible) { setRes(null); try { setPv(previewSalesReset(getDb())); } catch (e) { console.error(e); setPv(null); } } }, [visible]);
  const run = () => askPin(() => { const r = resetSalesAndClients(getDb()); setRes(r); if (r.ok && onDone) onDone(r); });
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.ov}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={st.win}><GlassSurface radius={26} tint="28,34,50" alpha={0.99} floating padding={24}>
          {!res ? (<>
            <Text style={st.title}>Сбросить продажи и клиентов?</Text>
            <Text style={st.sub}>Будет удалено то, что ниже. Товары, техкарты, сотрудники, склады и настройки останутся, остатки склада обнулятся. Это нельзя отменить.</Text>
            <ScrollView style={st.list} showsVerticalScrollIndicator={false}>
              {pv && pv.rows.length === 0 && <Text style={st.empty}>Удалять нечего: данных нет.</Text>}
              {pv && pv.rows.map(r => <View key={r.table} style={st.li}><Text style={st.liT}>{r.label}</Text><Text style={st.liV}>{num(r.count)}</Text></View>)}
              {pv && pv.stockRows > 0 && <View style={st.li}><Text style={st.liT}>Остатки склада обнулятся</Text><Text style={st.liV}>{num(pv.stockRows)} поз.</Text></View>}
            </ScrollView>
            {pv && pv.unprotected.length > 0 && <Text style={st.warn}>Не тронуты таблицы, которых нет в реестре данных: {pv.unprotected.join(', ')}.</Text>}
            <GlassButton tone="solid" label="Сначала сохранить копию" height={52} style={{ marginTop: 14 }} onPress={() => { onClose(); onBackup(); }} />
            <GlassButton tone="danger" label="Продолжить без копии" height={52} style={{ marginTop: 10 }} disabled={!pv || pv.total + pv.stockRows === 0} onPress={run} />
            <GlassButton label="Отмена" height={52} style={{ marginTop: 10 }} onPress={onClose} />
          </>) : res.ok ? (<>
            <Text style={st.title}>Готово</Text>
            <Text style={st.sub}>Удалено записей: {num(res.deleted)}. Остатки склада обнулены. Товары, сотрудники и настройки на месте.</Text>
            <GlassButton tone="accent" label="Хорошо" height={52} style={{ marginTop: 14 }} onPress={onClose} />
          </>) : (<>
            <Text style={[st.title, { color: colors.red }]}>Не выполнено</Text>
            <Text style={st.sub}>{res.error}</Text>
            <GlassButton label="Закрыть" height={52} style={{ marginTop: 14 }} onPress={onClose} />
          </>)}
        </GlassSurface></View>
      </View>
    </Modal>
  );
}
const st = StyleSheet.create({
  ov: { flex: 1, backgroundColor: 'rgba(5,8,12,0.66)', alignItems: 'center', justifyContent: 'center' }, win: { width: '86%', maxWidth: 560 },
  title: { fontFamily: fonts.display, fontSize: 21, color: colors.text }, sub: { fontFamily: fonts.familyRegular, fontSize: 13.5, color: colors.muted, marginTop: 6, marginBottom: 12, lineHeight: 20 },
  list: { maxHeight: 300, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  li: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }, liT: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 14.5, color: colors.textDim }, liV: { fontFamily: fonts.familySemibold, fontSize: 14.5, color: colors.text },
  empty: { padding: 18, fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted }, warn: { fontFamily: fonts.familyRegular, fontSize: 12.5, color: colors.warning, marginTop: 10, lineHeight: 18 },
});
