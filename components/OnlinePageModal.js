import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, Image, Share, Alert, StyleSheet } from 'react-native';
import GlassSurface from './GlassSurface';
import GlassButton from './GlassButton';
import { useToast } from './Toast';
import { copyText } from '../utils/clipboard';
import { getOnlinePage, connectOnlinePage, syncBookingServices, getBookingServices, getLegacyCustomItems, removeLegacyCustomItems } from '../db/bookings';
import { colors, fonts } from '../constants/theme';

const when = iso => { try { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} в ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } catch (_) { return ''; } };

/** «Онлайн-страница»: статус подключения, ссылка и QR, список услуг на странице и «Обновить услуги на странице». */
export default function OnlinePageModal({ visible, onChanged, onClose }) {
  const toast = useToast();
  const [page, setPage] = useState({ connected: false }); const [svc, setSvc] = useState([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [legacy, setLegacy] = useState([]);
  const load = () => { try { const p = getOnlinePage(); setPage(p); setSvc(getBookingServices()); if (p.connected) getLegacyCustomItems().then(setLegacy).catch(() => setLegacy([])); } catch (e) { console.error(e); } };
  useEffect(() => { if (visible) { setErr(''); load(); } }, [visible]);
  const run = async (fn, okMsg) => { setBusy(true); setErr(''); try { await fn(); toast.show(okMsg, 'info'); load(); onChanged && onChanged(); } catch (e) { console.error(e); setErr(e.message || 'Не получилось. Проверьте интернет.'); } setBusy(false); };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.root}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={st.wrap}><GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating padding={24}>
          <Text style={st.title}>Онлайн-страница записи</Text><Text style={st.sub}>Клиенты записываются сами: выбирают услугу, день и время</Text>
          {!page.connected ? <>
            <Text style={st.p}>Страница не подключена. После подключения появятся ссылка и QR-код, а услуги записи будут видны клиентам.</Text>
            {!!err && <Text style={st.err}>{err}</Text>}
            <View style={st.foot}><GlassButton style={{ flex: 1 }} label="Закрыть" height={54} onPress={onClose} /><GlassButton style={{ flex: 1 }} tone="accent" label={busy ? 'Подключаю…' : 'Подключить'} height={54} disabled={busy} onPress={() => run(connectOnlinePage, 'Онлайн-страница подключена')} /></View></> : <>
            <View style={{ flexDirection: 'row', gap: 18, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={st.gl}>Статус</Text><View style={st.pill}><Text style={st.pillT}>Подключена</Text></View>
                <Text style={st.gl}>Ссылка</Text><Text style={st.link} numberOfLines={2}>{page.link}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <GlassButton style={{ flex: 1 }} label="Скопировать" height={44} onPress={() => copyText(page.link).then(ok => toast.show(ok ? 'Ссылка скопирована' : 'Не удалось скопировать', ok ? 'info' : 'warn'))} />
                  <GlassButton style={{ flex: 1 }} label="Поделиться" height={44} onPress={() => Share.share({ message: `Запишитесь онлайн: ${page.link}`, url: page.link }).catch(() => {})} /></View></View>
              <View style={st.qr}><Image source={{ uri: `https://quickchart.io/qr?text=${encodeURIComponent(page.link)}&size=260&margin=1` }} style={{ width: 150, height: 150 }} /></View></View>
            <Text style={st.gl}>Услуги на странице</Text>
            <Text style={[st.note, svc.length > 0 && st.noteOk]}>{svc.length ? `На странице ${svc.length}: ${svc.map(s => s.name).join(', ')}` : 'В записи пока нет услуг — добавьте их в «Услуги для записи».'}</Text>
            <GlassButton label={busy ? 'Обновляю…' : 'Обновить услуги на странице'} height={48} disabled={busy} style={{ marginTop: 8 }} onPress={() => run(syncBookingServices, 'Услуги на странице обновлены')} />
            <Text style={st.t}>{page.syncedAt ? `обновлено ${when(page.syncedAt)}` : 'ещё не обновлялась'}</Text>
            {legacy.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={st.gl}>Старые «свои позиции» на странице</Text>
                <Text style={st.note}>{legacy.length} шт.: {legacy.map(i => i.name).join(', ')}. Они остались от прежней версии и больше не управляются из приложения.</Text>
                <GlassButton tone="danger" label="Удалить старые позиции" height={44} disabled={busy} style={{ marginTop: 8 }}
                  onPress={() => Alert.alert('Удалить старые позиции?', 'Они пропадут с онлайн-страницы. Услуги записи это не затронет.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: () => run(async () => { await removeLegacyCustomItems(); setLegacy([]); }, 'Старые позиции удалены') }])} />
              </View>)}
            {!!err && <Text style={st.err}>{err}</Text>}
            <View style={st.foot}><GlassButton style={{ flex: 1 }} tone="accent" label="Готово" height={54} onPress={onClose} /></View></>}
        </GlassSurface></View>
      </View>
    </Modal>
  );
}
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', alignItems: 'center', justifyContent: 'center' }, wrap: { width: '50%', minWidth: 540, maxWidth: 640 },
  title: { fontFamily: fonts.display, fontSize: 21, color: colors.text }, sub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 3 }, p: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim, lineHeight: 21, marginTop: 12 },
  gl: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginTop: 12, marginBottom: 6 }, pill: { alignSelf: 'flex-start', height: 28, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(120,183,150,0.4)', alignItems: 'center', justifyContent: 'center' }, pillT: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.green },
  link: { fontFamily: fonts.familyMedium, fontSize: 13, color: colors.orangeLight, lineHeight: 18 }, qr: { width: 170, height: 170, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  note: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.warning, lineHeight: 19, padding: 10, borderRadius: 14, backgroundColor: 'rgba(217,172,98,0.08)', borderWidth: 1, borderColor: 'rgba(217,172,98,0.25)' }, noteOk: { color: colors.green, backgroundColor: 'rgba(120,183,150,0.07)', borderColor: 'rgba(120,183,150,0.25)' },
  t: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 8 }, err: { fontFamily: fonts.familyMedium, fontSize: 13, color: colors.red, marginTop: 10 }, foot: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
