import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, Alert, Linking, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import TourGuide from '../components/TourGuide';
import BookingsCalendar from '../components/BookingsCalendar';
import GlassSurface from '../components/GlassSurface';
import GlassSegmented from '../components/GlassSegmented';
import GlassButton from '../components/GlassButton';
import Icon from '../components/Icon';
import SoftGlow from '../components/SoftGlow';
import BookingEditModal from '../components/BookingEditModal';
import BookingServicesModal from '../components/BookingServicesModal';
import OnlinePageModal from '../components/OnlinePageModal';
import MastersModal from '../components/MastersModal';
import { useToast } from '../components/Toast';
import { useResponsive } from '../hooks/useResponsive';
import { useTourHighlight } from '../components/TourRegistry';
import { getBusinessProfile, markTourSeen, localDateStr } from '../db/queries';
import {
  getManualBookingsList, loadOnlineBookings, setOnlineStatus, setManualStatus, deleteManual, deleteOnlineBooking, bookingStats,
  getBookingServices, getBookingStaff, endOf, toMin, isLive, STATUS_LABEL,
} from '../db/bookings';
import { goBackSmart, can } from '../db/session';
import { colors, fonts } from '../constants/theme';

// Записи: две вкладки («Онлайн» и «По телефону») с общим календарём; сводка в панели управления, лента дня в две строки,
// карточка записи с действиями, «Оформить в Кассе»; настройки записи (услуги, онлайн-страница, мастера) — в скрытом меню «⋯».
const MO = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const dl = s => { const [, m, d] = s.split('-').map(Number); return `${d} ${MO[m - 1]}`; };
const rub = n => Math.round(n || 0).toLocaleString('ru-RU');
const pillColor = { pending: colors.warning, confirmed: colors.green, done: colors.muted, cancelled: colors.red };
const STATUSES = [['all', 'Все'], ['pending', 'Новые'], ['confirmed', 'Подтверждены'], ['done', 'Выполнены'], ['cancelled', 'Отменены']];

export default function BookingsScreen({ navigation }) {
  const { isLandscape } = useResponsive();
  const toast = useToast();
  const canEdit = can('edit_bookings');
  const [tab, setTab] = useState(() => { try { return getBusinessProfile()?.booking_slug ? 'online' : 'manual'; } catch (_) { return 'manual'; } });
  const [flt, setFlt] = useState('all'); const [sel, setSel] = useState(localDateStr()); const [cur, setCur] = useState(null);
  const [manual, setManual] = useState([]); const [online, setOnline] = useState({ connected: false, ok: true, list: [] }); const [updated, setUpdated] = useState('');
  const [win, setWin] = useState(null);                 // окно записи: { booking } | null
  const [menuAt, setMenuAt] = useState(null); const [fAt, setFAt] = useState(null); const [panel, setPanel] = useState(null);   // services | online | masters
  const [tourOpen, setTourOpen] = useState(false); const [stamp, setStamp] = useState(0);
  const range = useRef(null); const fRef = useRef(null); const mRef = useRef(null);
  const hl = { tabs: useTourHighlight('bookings.tabs'), cal: useTourHighlight('bookings.calendar'), menu: useTourHighlight('bookings.menu'), add: useTourHighlight('bookings.manualAdd', 14) };

  const loadManual = useCallback(() => { try { setManual(getManualBookingsList()); } catch (e) { console.error(e); } }, []);
  const loadOnline = useCallback(async () => {
    const t = new Date(), a = new Date(t.getFullYear(), t.getMonth() - 1, 1), b = new Date(t.getFullYear(), t.getMonth() + 3, 0);
    const r = range.current || { from: localDateStr(a), to: localDateStr(b) };
    const res = await loadOnlineBookings(r); setOnline(res);
    if (res.connected && res.ok) { const n = new Date(); setUpdated(`${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`); }
    else if (res.connected && !res.ok) toast.show('Не удалось обновить онлайн-заявки — проверьте интернет', 'warn');
  }, []);
  useFocusEffect(useCallback(() => { loadManual(); loadOnline(); try { if (!getBusinessProfile()?.tours_seen?.Bookings) setTimeout(() => setTourOpen(true), 500); } catch (_) {} }, [loadManual, loadOnline]));
  // «Сегодня» меняется в полночь, пока экран открыт — раз в минуту обновляем отсчёт
  useEffect(() => { const t = setInterval(() => setStamp(x => x + 1), 60000); return () => clearInterval(t); }, []);

  const all = manual.concat(online.list), mine = tab === 'online' ? online.list : manual;
  const st = bookingStats(mine);
  const day = mine.filter(b => b.date === sel && (flt === 'all' || b.status === flt)).sort((a, b) => toMin(a.time_start) - toMin(b.time_start));
  const other = (tab === 'online' ? manual : online.list).filter(b => b.date === sel && b.status !== 'cancelled').length;
  const b0 = all.find(x => x.key === cur) || null;
  const dots = list => new Set(list.filter(b => b.status !== 'cancelled').map(b => b.date));
  const pendingN = online.list.filter(b => b.status === 'pending').length, phoneN = manual.filter(b => isLive(b) && b.date >= localDateStr()).length;

  const anchor = (ref, set) => { try { ref.current.measureInWindow((x, y, w, h) => set({ top: y + h + 8, right: Math.max(8, Dimensions.get('window').width - (x + w)) })); } catch (_) { set({ top: 130, right: 20 }); } };
  const changeStatus = async (b, status) => {
    if (b.source === 'manual') { setManualStatus(b.id, status); loadManual(); return; }
    const ok = await setOnlineStatus(b.id, status);
    if (ok) setOnline(p => ({ ...p, list: p.list.map(x => (x.id === b.id ? { ...x, status } : x)) })); else toast.show('Облако не ответило — статус не изменён', 'warn');
  };
  const remove = b => Alert.alert('Удалить запись?', `${b.client_name} · ${b.time_start}`, [{ text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: async () => {
    try { if (b.source === 'manual') { deleteManual(b.id); loadManual(); } else { await deleteOnlineBooking(b.id); setOnline(p => ({ ...p, list: p.list.filter(x => x.id !== b.id) })); } setCur(null); }
    catch (e) { console.error(e); Alert.alert('Не удалось удалить', e.message); } } }]);

  const steps = [
    { key: 'bookings.tabs', title: 'Две вкладки', text: '«Онлайн» — заявки клиентов со страницы записи, «По телефону» — записи, которые вы вносите сами. Цифра — что требует внимания.' },
    { key: 'bookings.calendar', title: 'Календарь', text: 'Точки показывают дни с записями: оранжевая — онлайн, фиолетовая — по телефону. Нажмите на день — лента ниже покажет его записи.' },
    { key: 'bookings.menu', title: 'Настройки записи', text: 'Меню «⋯»: услуги для записи, онлайн-страница со ссылкой и QR, мастера.' },
  ];
  const Pill = ({ s }) => <View style={[styles.pill, { borderColor: pillColor[s] + '66' }]}><Text style={[styles.pillT, { color: pillColor[s] }]}>{STATUS_LABEL[s]}</Text></View>;
  const KV = ({ k, v, a, onA }) => <View style={styles.kv}><Text style={styles.kvK}>{k}</Text><Text style={styles.kvV} numberOfLines={1}>{v}</Text>{!!a && <Pressable onPress={onA} hitSlop={8}><Text style={styles.kvA}>{a}</Text></Pressable>}</View>;

  const detail = !b0 ? (
    <View style={styles.center}><View style={styles.ico}><Icon name="calendar" size={34} color={colors.textDim} /></View><Text style={styles.cT}>Выберите запись</Text><Text style={styles.cX}>Подробности и действия откроются здесь</Text></View>
  ) : (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={styles.dN} numberOfLines={1}>{b0.client_name}</Text><Pill s={b0.status} /></View>
      <Text style={styles.dS}>{dl(b0.date)} · {b0.time_start}–{endOf(b0)} · {b0.source === 'online' ? 'онлайн-заявка' : 'запись по телефону'}</Text>
      <KV k="Услуга" v={`${b0.service_name}${b0.once ? ' · разовая' : ''}`} /><KV k="Стоимость" v={`${rub(b0.price)} ₽`} />
      {!!b0.staff_name && <KV k="Мастер" v={b0.staff_name} />}
      {!!b0.client_phone && <KV k="Телефон" v={b0.client_phone} a="Позвонить" onA={() => Linking.openURL(`tel:${b0.client_phone.replace(/[^\d+]/g, '')}`)} />}
      {!!b0.client_id && <KV k="Клиент" v="есть в базе клиентов" a="Открыть" onA={() => navigation.navigate('ClientsList', { clientId: b0.client_id })} />}
      {!!b0.comment && <KV k="Комментарий" v={b0.comment} />}
      {!!b0.order_id && <KV k="Заказ" v={`№${b0.order_id}`} />}
      {canEdit && (
        <View style={styles.acts}>
          {b0.status === 'pending' && <><GlassButton style={styles.act} tone="accent" label="Подтвердить" height={50} onPress={() => changeStatus(b0, 'confirmed')} /><GlassButton style={styles.act} label="Отклонить" height={50} onPress={() => changeStatus(b0, 'cancelled')} /></>}
          {b0.status === 'confirmed' && <><GlassButton style={styles.act} tone="accent" label="Оформить в Кассе" height={50} onPress={() => navigation.navigate('Kassa', { fromBooking: b0 })} />
            {b0.source === 'manual' && <GlassButton style={styles.act} label="Перенести" height={50} onPress={() => setWin({ booking: b0 })} />}
            <GlassButton style={styles.act} label="Отменить" height={50} onPress={() => changeStatus(b0, 'cancelled')} /></>}
          {b0.status === 'done' && <GlassButton style={styles.act} label="Вернуть в подтверждённые" height={50} onPress={() => changeStatus(b0, 'confirmed')} />}
          {b0.status === 'cancelled' && <GlassButton style={styles.act} label="Восстановить" height={50} onPress={() => changeStatus(b0, 'confirmed')} />}
        </View>)}
      {canEdit && <Pressable onPress={() => remove(b0)} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 12 }}><Text style={styles.del}>Удалить запись</Text></Pressable>}
    </ScrollView>
  );

  return (
    <View style={styles.root}>
      <TopBar title="Записи" onBack={() => goBackSmart(navigation)} navigation={navigation} activeScreen="Bookings"
        rightElement={<Pressable style={styles.tourBtn} onPress={() => setTourOpen(true)} hitSlop={10} accessibilityLabel="Подсказка"><Text style={styles.tourTxt}>?</Text></Pressable>} />
      <View style={StyleSheet.absoluteFill} pointerEvents="none"><SoftGlow size={620} color="127,168,217" alpha={0.14} style={{ position: 'absolute', left: -170, top: -150 }} /></View>

      <View style={styles.tb}>
        <View style={[{ width: 340 }, hl.tabs.style]}><GlassSegmented items={[{ key: 'online', label: pendingN ? `Онлайн · ${pendingN}` : 'Онлайн' }, { key: 'manual', label: phoneN ? `По телефону · ${phoneN}` : 'По телефону' }]} value={tab} onChange={k => { setTab(k); setCur(null); }} height={46} />{hl.tabs.overlay}</View>
        <Pressable ref={fRef} collapsable={false} style={[styles.fbtn, flt !== 'all' && styles.fbtnOn]} onPress={() => anchor(fRef, setFAt)}><Icon name="sliders" size={18} color={colors.textDim} /><Text style={styles.fbtnT}>Фильтры</Text></Pressable>
        <View style={{ flex: 1 }} />
        <View style={styles.sts}>
          <View><Text style={styles.sk}>Сегодня</Text><Text style={styles.sv}>{st.today}<Text style={styles.ss}>  ещё {st.todayLeft}</Text></Text></View>
          <View><Text style={styles.sk}>Ожидается</Text><Text style={styles.sv}>{rub(st.expected)} ₽</Text></View>
          {tab === 'online' ? <View><Text style={styles.sk}>Ждут ответа</Text><Text style={[styles.sv, st.pending > 0 && { color: colors.warning }]}>{st.pending}</Text></View>
            : <View><Text style={styles.sk}>Ближайшая</Text><Text style={styles.sv} numberOfLines={1}>{st.next ? `${st.next.time_start}` : '—'}<Text style={styles.ss}>  {st.next ? st.next.client_name.split(' ')[0] : ''}</Text></Text></View>}
        </View>
        {tab === 'online' && online.connected && <Pressable style={styles.rbtn} onPress={loadOnline} accessibilityLabel="Обновить"><Icon name="refresh" size={20} color={colors.textDim} /></Pressable>}
        {canEdit && <Pressable ref={mRef} collapsable={false} style={[styles.rbtn, hl.menu.style]} onPress={() => anchor(mRef, setMenuAt)}><Text style={styles.dots}>⋯</Text>{hl.menu.overlay}</Pressable>}
        {canEdit && tab === 'manual' && <View style={{ position: 'relative', ...hl.add.style }}><GlassButton tone="solid" icon="plus" label="Запись" height={52} onPress={() => setWin({ booking: null })} />{hl.add.overlay}</View>}
      </View>

      <View style={[styles.two, isLandscape && { flexDirection: 'row' }]}>
        <View style={[styles.lc, isLandscape && { flex: 0.8 }]}>
          <View style={hl.cal.style}><BookingsCalendar onlineDates={dots(online.list)} manualDates={dots(manual)} selectedDate={sel} onSelectDay={d => { setSel(d); setCur(null); }}
            onMonthChange={(y, m0) => { range.current = { from: localDateStr(new Date(y, m0 - 1, 1)), to: localDateStr(new Date(y, m0 + 2, 0)) }; loadOnline(); }} />{hl.cal.overlay}</View>
          <Text style={styles.agh}>{sel === localDateStr() ? 'Сегодня · ' : ''}{dl(sel)} · {day.length}</Text>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {tab === 'online' && !online.connected ? (
              <View style={styles.empty}><Text style={styles.cT}>Онлайн-страница не подключена</Text><Text style={styles.cX}>Клиенты пока не могут записываться через интернет</Text>{canEdit && <GlassButton label="Подключить" height={46} style={{ marginTop: 12 }} onPress={() => setPanel('online')} />}</View>
            ) : day.length === 0 ? (
              <View style={styles.empty}><Text style={styles.cT}>В этот день записей нет</Text><Text style={styles.cX}>{tab === 'manual' ? 'Нажмите «+ Запись», чтобы добавить' : 'Новые заявки появятся здесь после обновления'}</Text></View>
            ) : day.map(b => {
              const past = b.date === localDateStr() && b.status !== 'pending' && toMin(b.time_start) + b.duration_min < new Date().getHours() * 60 + new Date().getMinutes();
              return (
                <Pressable key={b.key} style={[styles.bk, cur === b.key && styles.bkSel, (past || b.status === 'done' || b.status === 'cancelled') && { opacity: 0.55 }]} onPress={() => setCur(b.key)}>
                  <View style={{ width: 66 }}><Text style={styles.bT}>{b.time_start}</Text><Text style={styles.bTs}>до {endOf(b)}</Text></View>
                  <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.bN} numberOfLines={1}>{b.client_name}</Text><Text style={styles.bS} numberOfLines={1}>{b.service_name}{b.staff_name ? ` · ${b.staff_name}` : ''}</Text></View>
                  <Text style={styles.bP}>{rub(b.price)} ₽</Text><Pill s={b.status} />
                </Pressable>);
            })}
            {other > 0 && <Pressable style={styles.oth} onPress={() => { setTab(tab === 'online' ? 'manual' : 'online'); setCur(null); }}><Text style={styles.othT}>В этот день на вкладке «{tab === 'online' ? 'По телефону' : 'Онлайн'}» есть записи: {other}  <Text style={{ color: colors.orangeLight }}>Открыть</Text></Text></Pressable>}
            {tab === 'online' && online.connected && !!updated && <Text style={styles.upd}>обновлено {updated}</Text>}
          </ScrollView>
        </View>
        <View style={[styles.rc, isLandscape && { flex: 1 }]}>{detail}</View>
      </View>

      <Modal visible={!!fAt} transparent animationType="fade" onRequestClose={() => setFAt(null)}><View style={{ flex: 1 }}><Pressable style={StyleSheet.absoluteFill} onPress={() => setFAt(null)} />
        <View style={[styles.pop, { top: fAt?.top, right: fAt?.right, width: 420 }]}><GlassSurface floating radius={22} tint="32,40,55" alpha={0.97} padding={20}><Text style={styles.pl}>Статус</Text>
          <View style={styles.chips}>{STATUSES.map(([k, t]) => <Pressable key={k} style={[styles.chip, flt === k && styles.chipOn]} onPress={() => { setFlt(k); setFAt(null); }}><Text style={[styles.chipT, flt === k && { color: colors.orangeLight }]}>{t}</Text></Pressable>)}</View></GlassSurface></View></View></Modal>
      <Modal visible={!!menuAt} transparent animationType="fade" onRequestClose={() => setMenuAt(null)}><View style={{ flex: 1 }}><Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuAt(null)} />
        <View style={[styles.pop, { top: menuAt?.top, right: menuAt?.right, width: 380 }]}><GlassSurface floating radius={22} tint="32,40,55" alpha={0.985} padding={12}><Text style={[styles.pl, { marginLeft: 8 }]}>Настройки записи</Text>
          {[['services', '▤', 'Услуги для записи', `${getBookingServices().length} в записи`], ['online', '◎', 'Онлайн-страница', online.connected ? 'подключена · ссылка и QR-код' : 'не подключена'], ['masters', '☺', 'Мастера', `${getBookingStaff().length} принимают записи`]].map(([k, ic, t, s]) => (
            <Pressable key={k} style={styles.mi} onPress={() => { setMenuAt(null); setPanel(k); }}><View style={styles.miI}><Text style={styles.miIT}>{ic}</Text></View><View><Text style={styles.miT}>{t}</Text><Text style={styles.miS}>{s}</Text></View></Pressable>))}</GlassSurface></View></View></Modal>

      <BookingEditModal visible={!!win} booking={win?.booking || null} presetDate={sel} services={win ? getBookingServices() : []} staff={win ? getBookingStaff() : []} isNarrow={!isLandscape}
        onSaved={(id, toCat) => { toast.show(win?.booking ? 'Запись перенесена' : 'Запись добавлена', 'info'); loadManual(); setCur('m' + id); if (toCat) toast.show('Услуга добавлена в каталог', 'info'); }} onClose={() => setWin(null)} />
      <BookingServicesModal visible={panel === 'services'} isNarrow={!isLandscape} onChanged={() => setStamp(x => x + 1)} onClose={() => setPanel(null)} />
      <OnlinePageModal visible={panel === 'online'} onChanged={loadOnline} onClose={() => { setPanel(null); setStamp(x => x + 1); }} />
      <MastersModal visible={panel === 'masters'} onClose={() => setPanel(null)} />
      <TourGuide visible={tourOpen} onClose={() => { setTourOpen(false); markTourSeen('Bookings'); }} steps={steps} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tourBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(127,168,217,0.1)', borderWidth: 1, borderColor: 'rgba(127,168,217,0.3)', alignItems: 'center', justifyContent: 'center' }, tourTxt: { fontFamily: fonts.family, fontSize: 18, color: colors.orange },
  tb: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  fbtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(150,172,204,0.10)' }, fbtnOn: { borderColor: 'rgba(157,191,230,0.5)', backgroundColor: 'rgba(127,168,217,0.18)' }, fbtnT: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  sts: { flexDirection: 'row', gap: 22, marginRight: 8 }, sk: { fontFamily: fonts.familySemibold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted }, sv: { fontFamily: fonts.familySemibold, fontSize: 18, color: colors.text, marginTop: 1 }, ss: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  rbtn: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, dots: { fontSize: 22, color: colors.textDim, marginTop: -4 },
  two: { flex: 1, paddingHorizontal: 20, paddingBottom: 20, gap: 12 }, lc: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 12 }, rc: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 18 },
  agh: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, paddingHorizontal: 4, marginTop: 8, marginBottom: 4 },
  bk: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 10, borderRadius: 14, marginBottom: 5, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }, bkSel: { backgroundColor: 'rgba(127,168,217,0.12)', borderColor: 'rgba(157,191,230,0.5)' },
  bT: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, bTs: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted }, bN: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, bS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 }, bP: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim, marginHorizontal: 10 },
  pill: { height: 24, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }, pillT: { fontFamily: fonts.familySemibold, fontSize: 11 },
  oth: { padding: 10, borderRadius: 12, marginTop: 4, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }, othT: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.textDim }, upd: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }, ico: { width: 76, height: 76, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  empty: { alignItems: 'center', padding: 24 }, cT: { fontFamily: fonts.familySemibold, fontSize: 17, color: colors.text, marginBottom: 6, textAlign: 'center' }, cX: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  dN: { flex: 1, fontFamily: fonts.display, fontSize: 24, color: colors.text }, dS: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 3, marginBottom: 14 },
  kv: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }, kvK: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 15, color: colors.textDim }, kvV: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text, maxWidth: '60%' }, kvA: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orangeLight, marginLeft: 12 },
  acts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }, act: { flexGrow: 1, minWidth: 150 }, del: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red },
  pop: { position: 'absolute', maxWidth: '94%' }, pl: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.textDim, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { height: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }, chipOn: { backgroundColor: 'rgba(127,168,217,0.22)', borderColor: 'rgba(157,191,230,0.5)' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  mi: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 14 }, miI: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(127,168,217,0.14)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }, miIT: { fontSize: 16, color: colors.orangeLight }, miT: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, miS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
});
