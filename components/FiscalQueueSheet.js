import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ModalSheet from './ModalSheet';
import GlassButton from './GlassButton';
import GlassSurface from './GlassSurface';
import { useToast } from './Toast';
import { getFiscalSummary, listFiscal, processFiscalQueue, retryFiscal, STATUS_LABEL } from '../db/fiscal';
import { colors, fonts } from '../constants/theme';

const rub = n => `${Math.round(n || 0).toLocaleString('ru-RU')} ₽`;
const TONE = { pending: ['127,168,217', colors.orangeLight], sent: ['120,183,150', '#78B796'], error: ['219,129,120', colors.red] };

/** Очередь чеков: сводка, список с состоянием каждого чека, «Отправить сейчас» и «Повторить». Без подключённой кассы чеки копятся. */
export default function FiscalQueueSheet({ visible, onClose, onChanged }) {
  const toast = useToast(); const [sum, setSum] = useState(null); const [rows, setRows] = useState([]); const [busy, setBusy] = useState(false);
  const load = useCallback(() => { try { setSum(getFiscalSummary()); setRows(listFiscal()); } catch (e) { console.error('[Очередь чеков]', e); } }, []);
  useEffect(() => { if (visible) load(); }, [visible, load]);
  const send = async () => {
    setBusy(true);
    try { const r = await processFiscalQueue(); toast.show(r.reason || `Отправлено: ${r.sent}${r.failed ? `, с ошибкой: ${r.failed}` : ''}`, r.failed ? 'warn' : 'info'); } catch (e) { console.error(e); toast.show('Не удалось отправить', 'warn'); }
    load(); setBusy(false); onChanged && onChanged();
  };
  return (
    <ModalSheet visible={visible} onClose={onClose} title="Очередь чеков" width="62%" maxWidth={620} footer={<GlassButton tone="accent" label={busy ? 'Отправляю…' : 'Отправить сейчас'} height={50} disabled={busy || !sum || sum.pending + sum.error === 0} onPress={send} />}>
      {sum && (
        <GlassSurface radius={18} tint={sum.connected ? '120,183,150' : '217,172,98'} alpha={0.12} padding={14} style={s.card}>
          <Text style={s.cardT}>Онлайн-касса: {sum.provider}</Text>
          <Text style={s.cardS}>{sum.connected ? 'Чеки отправляются автоматически.' : 'Чеки копятся здесь и отправятся в налоговую автоматически, как только будет подключена онлайн-касса.'}</Text>
          <Text style={s.cardS}>В очереди: {sum.pending} · отправлено: {sum.sent} · с ошибкой: {sum.error}</Text>
        </GlassSurface>
      )}
      {rows.length === 0 && <Text style={s.empty}>Чеков в очереди пока нет. Они появляются при оплате (если включена автоматическая очередь) и по кнопке «Чек» в «Продажах».</Text>}
      {rows.map(r => {
        const [tint, col] = TONE[r.status] || TONE.pending;
        return (
          <View key={r.id} style={s.row}>
            <View style={{ flex: 1 }}><Text style={s.t}>Заказ № {r.order_id} · {rub(r.total)}</Text><Text style={s.sub}>{r.order_date || r.created_at}{r.error_msg ? ` · ${r.error_msg}` : ''}</Text></View>
            <View style={[s.chip, { borderColor: `rgba(${tint},0.5)` }]}><Text style={[s.chipT, { color: col }]}>{STATUS_LABEL[r.status] || r.status}</Text></View>
            {r.status === 'error' && <GlassButton label="Повторить" height={36} onPress={() => { retryFiscal(r.order_id); load(); }} style={{ marginLeft: 8 }} />}
          </View>
        );
      })}
    </ModalSheet>
  );
}
const s = StyleSheet.create({
  card: { marginBottom: 12 }, cardT: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, cardS: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 4, lineHeight: 19 },
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, paddingVertical: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  t: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, sub: { fontFamily: fonts.familyRegular, fontSize: 12.5, color: colors.muted, marginTop: 2 },
  chip: { height: 28, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 12 },
});
