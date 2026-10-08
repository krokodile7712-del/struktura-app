import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, StyleSheet } from 'react-native';
import KeyboardSafe from './KeyboardSafe';
import GlassSurface from './GlassSurface';
import GlassButton from './GlassButton';
import TimeWheel from './TimeWheel';
import DatePicker from './DatePicker';
import DurationField from './DurationField';
import Toggle from './Toggle';
import PhoneInput from './PhoneInput';
import { searchClients, localDateStr } from '../db/queries';
import { saveManualBooking, findBookingConflict, toHHMM, toMin, endOf } from '../db/bookings';
import { colors, fonts } from '../constants/theme';

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'], MO = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const t2 = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dl = s => { const d = parseD(s); return `${d.getDate()} ${MO[d.getMonth()]}`; };
const rub = n => Math.round(n || 0).toLocaleString('ru-RU');

// Поле с подписью — на уровне модуля (внутри компонента оно пересоздавалось бы на каждую букву и сбрасывало курсор)
const Fld = ({ label, children }) => <View style={st.fld}><Text style={st.fl}>{label}</Text>{children}</View>;

/**
 * Окно записи (новая / перенос и правка): клиент (поиск в базе, привязка), услуга из каталога записи или «Другая услуга»
 * (в каталог или разовая), дни ближайшей недели и любая дата, время барабаном, длительность любая, мастер, проверка занятости.
 * Props: visible, booking (null — новая), presetDate, services [{id,name,price,duration}], staff [{id,name}], onSaved(id), onClose, isNarrow.
 */
export default function BookingEditModal({ visible, booking, presetDate, services = [], staff = [], onSaved, onClose, isNarrow }) {
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [clientId, setClientId] = useState(null); const [mk, setMk] = useState(false);
  const [svc, setSvc] = useState(null); const [cName, setCName] = useState(''); const [toCat, setToCat] = useState(true); const [price, setPrice] = useState('');
  const [date, setDate] = useState(localDateStr()); const [h, setH] = useState(12); const [m, setM] = useState(0); const [dur, setDur] = useState(60);
  const [staffId, setStaffId] = useState(null); const [comment, setComment] = useState(''); const [wheel, setWheel] = useState(false); const [dp, setDp] = useState(false); const [err, setErr] = useState('');
  const list = services.slice();
  if (booking?.product_id && !list.some(s => s.id === booking.product_id)) list.push({ id: booking.product_id, name: booking.service_name, price: booking.price, duration: booking.duration_min });

  useEffect(() => {
    if (!visible) return;
    const b = booking;
    setName(b?.client_name || ''); setPhone(b?.client_phone || ''); setClientId(b?.client_id || null); setMk(false); setComment(b?.comment || ''); setErr(''); setWheel(false);
    setDate(b?.date || presetDate || localDateStr());
    const [bh, bm] = (b?.time_start || '12:00').split(':').map(Number); setH(bh); setM(bm);
    if (b) {
      setDur(b.duration_min || 60); setPrice(String(b.price || '')); setStaffId(b.staff_id || null);
      if (b.product_id) { setSvc(b.product_id); setCName(''); } else { setSvc('custom'); setCName(b.service_name); setToCat(false); }
    } else {
      const f = services[0]; setSvc(f ? f.id : 'custom'); setCName(''); setToCat(true); setPrice(f ? String(f.price) : ''); setDur(f ? f.duration : 60); setStaffId(staff[0]?.id || null);
    }
  }, [visible, booking?.key]);

  const custom = svc === 'custom', cur = list.find(s => s.id === svc);
  const priceN = parseFloat(String(price).replace(',', '.')) || 0;
  const svcName = custom ? cName.trim() : cur?.name || '';
  const hit = staffId ? findBookingConflict({ date, time_start: t2(h, m), duration_min: dur, staff_id: staffId, excludeId: booking?.id }) : null;
  let bad = '';
  if (!name.trim()) bad = 'Введите имя клиента'; else if (!svcName) bad = custom ? 'Введите название услуги' : 'Выберите услугу';
  else if (!(priceN > 0)) bad = 'Укажите стоимость'; else if (dur < 5) bad = 'Длительность — не меньше 5 минут'; else if (hit) bad = `У мастера в это время запись: ${hit.client_name}, ${hit.time_start}–${endOf(hit)}`;
  const sug = !clientId && name.trim().length >= 2 && visible ? searchClients(name.trim()).slice(0, 4) : [];
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return localDateStr(d); });
  const dayList = days.includes(date) ? days : [date, ...days.slice(0, 6)];

  const pickSvc = s => { setSvc(s ? s.id : 'custom'); if (s) { setPrice(String(s.price)); setDur(s.duration || 60); } else { setCName(''); } };
  const save = () => {
    if (bad) { setErr(bad); return; }
    try {
      const id = saveManualBooking({ id: booking?.id, date, time_start: t2(h, m), duration_min: dur, client_name: name, client_phone: phone, client_id: clientId, createClient: mk && !clientId,
        service_name: svcName, service_price: priceN, product_id: custom ? null : svc, saveToCatalog: custom && toCat, staff_id: staffId, comment });
      onSaved && onSaved(id, custom && toCat); onClose && onClose();
    } catch (e) { console.error(e); setErr(e.message || 'Не удалось сохранить запись'); }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardSafe style={st.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.wrap, isNarrow && { width: '96%', minWidth: 0 }]}>
          <GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating>
            <ScrollView style={{ maxHeight: 740 }} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={st.title}>{booking ? 'Перенос и правка записи' : 'Новая запись'}</Text><Text style={st.sub}>Клиент, услуга, время и мастер — остальное по желанию</Text>
              <Text style={st.gl}>Клиент</Text>
              <View><Fld label="Имя"><TextInput style={st.in} color={colors.text} value={name} onChangeText={v => { setName(v); setClientId(null); setErr(''); }} placeholder="Начните вводить — найдём в базе клиентов" placeholderTextColor="rgba(255,255,255,0.25)" /></Fld>
                {sug.length > 0 && <View style={st.sg}>{sug.map(c => <Pressable key={c.id} style={st.sgR} onPress={() => { setName(c.fio); setPhone(c.phone || ''); setClientId(c.id); }}><Text style={st.sgT}>{c.fio}</Text><Text style={st.sgS}>{c.phone}</Text></Pressable>)}</View>}</View>
              <Fld label="Телефон"><PhoneInput color={colors.text} style={st.in} value={phone} onChangeText={v => { setPhone(v); setErr(''); }} placeholder="+7 (___) ___-__-__" placeholderTextColor="rgba(255,255,255,0.25)" /></Fld>
              {!clientId && !!name.trim() && !booking && <View style={st.tg}><Text style={st.tgT}>Создать нового клиента в базе</Text><Toggle value={mk} onValueChange={setMk} /></View>}
              {!!clientId && <Text style={st.ok}>Клиент найден в базе — запись привяжется к нему</Text>}
              <Text style={st.gl}>Услуга</Text>
              <View style={st.chips}>{list.map(s => <Pressable key={s.id} style={[st.chip, svc === s.id && st.chipOn]} onPress={() => pickSvc(s)}><Text style={[st.chipT, svc === s.id && { color: colors.orangeLight }]}>{s.name}</Text></Pressable>)}
                <Pressable style={[st.chip, custom && st.chipOn]} onPress={() => pickSvc(null)}><Text style={[st.chipT, custom && { color: colors.orangeLight }]}>Другая услуга…</Text></Pressable></View>
              {custom && <>
                <Fld label="Название"><TextInput style={st.in} color={colors.text} value={cName} onChangeText={v => { setCName(v); setErr(''); }} placeholder="Например, Уход за бородой" placeholderTextColor="rgba(255,255,255,0.25)" /></Fld>
                {!booking && <View style={st.tg}><Text style={st.tgT}>Сохранить в каталог услуг</Text><Toggle value={toCat} onValueChange={setToCat} /></View>}
                <Text style={[st.note, toCat && !booking && st.noteOk]}>{booking ? 'Разовая позиция: в Кассе пройдёт по названию и цене записи.' : toCat ? 'Услуга появится в «Товарах» и в списке услуг для записи; в Кассе пройдёт как обычная услуга — с отчётами и материалами.' : 'Разовая позиция: в Кассе пройдёт по названию и цене из записи, без каталога, себестоимости и списания материалов.'}</Text></>}
              <Fld label="Стоимость"><TextInput style={st.in} color={colors.text} value={price} onChangeText={v => { setPrice(v.replace(/[^0-9.,]/g, '')); setErr(''); }} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="rgba(255,255,255,0.25)" /><Text style={st.suf}>₽</Text></Fld>
              <Text style={st.gl}>Когда</Text>
              <View style={st.days}>{dayList.map(k => { const d = parseD(k), on = k === date; return <Pressable key={k} style={[st.day, on && st.dayOn]} onPress={() => setDate(k)}><Text style={st.dayW}>{WD[d.getDay()]}</Text><Text style={[st.dayD, on && { color: colors.orangeLight }]}>{d.getDate()}</Text></Pressable>; })}</View>
              <Pressable onPress={() => setDp(true)} hitSlop={6}><Text style={st.link}>Другая дата… ({dl(date)})</Text></Pressable>
              <Pressable style={[st.trow, wheel && st.trowOn]} onPress={() => setWheel(!wheel)}><Text style={st.trl}>Время</Text><Text style={st.trv}>{t2(h, m)} — {toHHMM(toMin(t2(h, m)) + dur)}</Text><Text style={st.trh}>начало — конец</Text></Pressable>
              {wheel && <View style={{ marginBottom: 8 }}><TimeWheel h={h} m={m} onChange={v => { if (v.h != null) setH(v.h); if (v.m != null) setM(v.m); }} /></View>}
              <Text style={st.gl}>Длительность</Text><DurationField value={dur} onChange={setDur} />
              {staff.length > 0 && <><Text style={st.gl}>Мастер</Text><View style={st.chips}>{staff.map(u => <Pressable key={u.id} style={[st.chip, staffId === u.id && st.chipOn]} onPress={() => setStaffId(u.id)}><Text style={[st.chipT, staffId === u.id && { color: colors.orangeLight }]}>{u.name}</Text></Pressable>)}</View></>}
              <Text style={[st.note, !hit && st.noteOk, { marginTop: 10 }]}>{err || bad || (staffId ? `Время свободно у «${staff.find(u => u.id === staffId)?.name || ''}»` : 'Мастер не выбран — занятость не проверяется')}</Text>
              <Fld label="Комментарий"><TextInput style={st.in} color={colors.text} value={comment} onChangeText={setComment} placeholder="необязательно" placeholderTextColor="rgba(255,255,255,0.25)" /></Fld>
              <View style={st.foot}><GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={onClose} /><GlassButton style={{ flex: 1 }} tone="accent" label="Сохранить" height={54} disabled={!!bad} onPress={save} /></View>
            </ScrollView>
          </GlassSurface>
        </View>
        <DatePicker visible={dp} value={date} title="Дата записи" onClose={() => setDp(false)} onChange={v => { setDate(v); setDp(false); }} />
      </KeyboardSafe>
    </Modal>
  );
}
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', alignItems: 'center', justifyContent: 'center' }, wrap: { width: '52%', minWidth: 560, maxWidth: 660 },
  title: { fontFamily: fonts.display, fontSize: 21, color: colors.text }, sub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  gl: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginTop: 16, marginBottom: 8 },
  fld: { flexDirection: 'row', alignItems: 'center', minHeight: 54, borderRadius: 16, paddingHorizontal: 18, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, fl: { width: 100, fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim }, in: { flex: 1, minWidth: 0, padding: 0, fontFamily: fonts.familySemibold, fontSize: 17, color: colors.text }, suf: { fontFamily: fonts.familyMedium, fontSize: 15, color: colors.orangeLight, marginLeft: 8 },
  sg: { borderRadius: 14, backgroundColor: 'rgba(32,40,55,0.99)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', marginBottom: 6 }, sgR: { paddingVertical: 11, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }, sgT: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text }, sgS: { marginLeft: 10, fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  tg: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 4 }, tgT: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim }, ok: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.green, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }, chipOn: { backgroundColor: 'rgba(127,168,217,0.2)', borderColor: 'rgba(157,191,230,0.5)' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  note: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.warning, lineHeight: 19, padding: 10, borderRadius: 14, backgroundColor: 'rgba(217,172,98,0.08)', borderWidth: 1, borderColor: 'rgba(217,172,98,0.25)', marginTop: 6 }, noteOk: { color: colors.green, backgroundColor: 'rgba(120,183,150,0.07)', borderColor: 'rgba(120,183,150,0.25)' },
  days: { flexDirection: 'row', gap: 6 }, day: { flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, dayOn: { backgroundColor: 'rgba(127,168,217,0.2)', borderColor: 'rgba(157,191,230,0.6)' }, dayW: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted }, dayD: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text, marginTop: 2 },
  link: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orangeLight, marginTop: 8, marginBottom: 8 },
  trow: { flexDirection: 'row', alignItems: 'center', height: 60, borderRadius: 16, paddingHorizontal: 18, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, trowOn: { backgroundColor: 'rgba(127,168,217,0.10)', borderColor: 'rgba(157,191,230,0.6)' }, trl: { width: 80, fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim }, trv: { flex: 1, fontFamily: fonts.display, fontSize: 20, color: colors.text }, trh: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  foot: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
