import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, StyleSheet } from 'react-native';
import KeyboardSafe from './KeyboardSafe';
import GlassSurface from './GlassSurface';
import GlassButton from './GlassButton';
import DurationField, { fmtDur } from './DurationField';
import { getBookingServices, getCatalogForBooking, saveBookingService, removeBookingService } from '../db/bookings';
import { colors, fonts } from '../constants/theme';

const rub = n => Math.round(n || 0).toLocaleString('ru-RU');
const Fld = ({ label, children }) => <View style={st.fld}><Text style={st.fl}>{label}</Text>{children}</View>;

/**
 * «Услуги для записи»: список услуг, доступных в записи (онлайн и по телефону); добавить из каталога «Товаров» или создать новую,
 * изменить (название и цена общие с Кассой), длительность любая, убрать из записи (товар остаётся в каталоге).
 * Views: list → add → edit → remove.
 */
export default function BookingServicesModal({ visible, onChanged, onClose, isNarrow }) {
  const [view, setView] = useState('list'); const [rows, setRows] = useState([]); const [cat, setCat] = useState([]); const [q, setQ] = useState('');
  const [ed, setEd] = useState(null);       // { id, mode: 'new'|'catalog'|'edit', name, price, dur, desc }
  const [err, setErr] = useState('');
  const load = () => { try { setRows(getBookingServices()); setCat(getCatalogForBooking()); } catch (e) { console.error(e); } };
  useEffect(() => { if (visible) { setView('list'); setQ(''); setErr(''); load(); } }, [visible]);
  const open = (s, mode) => { setEd({ id: s?.id || null, mode, name: s?.name || '', price: s ? String(s.price) : '', dur: s?.duration || 60, desc: s?.description || '' }); setErr(''); setView('edit'); };
  const price = parseFloat(String(ed?.price).replace(',', '.')) || 0;
  const bad = !ed ? '' : !ed.name.trim() ? 'Введите название' : !(price > 0) ? 'Укажите цену' : ed.dur < 5 ? 'Длительность — не меньше 5 минут' : '';
  const save = () => {
    try { saveBookingService({ id: ed.id, name: ed.name, price, duration: ed.dur, description: ed.desc }); load(); onChanged && onChanged(); setView('list'); }
    catch (e) { console.error(e); setErr(e.message || 'Не удалось сохранить'); }
  };
  const remove = () => { try { removeBookingService(ed.id); load(); onChanged && onChanged(); setView('list'); } catch (e) { console.error(e); setErr('Не удалось убрать'); } };
  const list = rows.filter(r => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardSafe style={st.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.wrap, isNarrow && { width: '96%', minWidth: 0 }]}><GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating padding={24}>
          {view === 'list' && <>
            <Text style={st.title}>Услуги для записи</Text><Text style={st.sub}>Что можно выбрать в записи — онлайн и по телефону. Услуга — тот же товар из «Товаров»: название и цена общие с Кассой.</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}><View style={[st.fld, { flex: 1, marginBottom: 0 }]}><Text style={[st.fl, { width: 60 }]}>Поиск</Text><TextInput style={st.in} color={colors.text} value={q} onChangeText={setQ} placeholder="Название услуги" placeholderTextColor="rgba(255,255,255,0.25)" /></View>
              <GlassButton tone="solid" label="+ Услуга" height={54} onPress={() => setView('add')} /></View>
            <ScrollView style={{ maxHeight: 380, marginTop: 6 }} showsVerticalScrollIndicator={false}>
              {list.length === 0 ? <Text style={st.empty}>{q ? 'Ничего не найдено' : 'Пока нет услуг для записи. Нажмите «+ Услуга»: добавьте из каталога или создайте новую.'}</Text> : list.map(s => (
                <View key={s.id} style={st.row}><View style={{ flex: 1, minWidth: 0 }}><Text style={st.rN}>{s.name}</Text><Text style={st.rS}>{rub(s.price)} ₽ · {fmtDur(s.duration)}</Text>{!!s.description && <Text style={st.rD} numberOfLines={1}>{s.description}</Text>}</View>
                  <Pressable style={st.ib} onPress={() => open(s, 'edit')} hitSlop={6}><Text style={st.ibT}>✎</Text></Pressable>
                  <Pressable style={[st.ib, { marginLeft: 8 }]} onPress={() => { setEd({ id: s.id, name: s.name }); setView('remove'); }} hitSlop={6}><Text style={[st.ibT, { color: colors.red }]}>✕</Text></Pressable></View>))}
            </ScrollView>
            <Text style={st.note}>В записи: {rows.length}. Онлайн-страница обновится после «Обновить услуги на странице».</Text>
            <View style={st.foot}><GlassButton style={{ flex: 1 }} tone="accent" label="Готово" height={54} onPress={onClose} /></View></>}
          {view === 'add' && <>
            <Text style={st.title}>Добавить услугу</Text><Text style={st.sub}>Выберите из каталога или создайте новую</Text>
            <Pressable style={st.mk} onPress={() => open(null, 'new')}><View style={st.mkI}><Text style={st.mkIT}>+</Text></View><View><Text style={st.rN}>Создать новую услугу</Text><Text style={st.rS}>появится и в «Товарах», её можно продавать в Кассе</Text></View></Pressable>
            <Text style={st.gl}>Из каталога «Товаров»</Text>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>{cat.length === 0 ? <Text style={st.empty}>Все товары каталога уже в записи</Text> : cat.map(s => (
              <View key={s.id} style={st.row}><View style={{ flex: 1 }}><Text style={st.rN}>{s.name}</Text><Text style={st.rS}>{rub(s.price)} ₽</Text></View><GlassButton label="Добавить" height={38} onPress={() => open(s, 'catalog')} /></View>))}</ScrollView>
            <View style={st.foot}><GlassButton style={{ flex: 1 }} label="Назад" height={54} onPress={() => setView('list')} /></View></>}
          {view === 'edit' && ed && <>
            <Text style={st.title}>{ed.mode === 'new' ? 'Новая услуга' : ed.mode === 'catalog' ? 'Добавить в запись' : 'Изменить услугу'}</Text>
            <Text style={st.sub}>{ed.mode === 'new' ? 'Появится и в «Товарах» (категория «Услуги»), её можно продавать в Кассе' : 'Название и цена общие с «Товарами» и Кассой'}</Text>
            <Fld label="Название"><TextInput style={st.in} color={colors.text} value={ed.name} onChangeText={v => { setErr(''); setEd(p => ({ ...p, name: v })); }} /></Fld>
            <Fld label="Цена"><TextInput style={st.in} color={colors.text} value={ed.price} keyboardType="decimal-pad" onChangeText={v => { setErr(''); setEd(p => ({ ...p, price: v.replace(/[^0-9.,]/g, '') })); }} /><Text style={st.suf}>₽</Text></Fld>
            <Text style={st.gl}>Длительность</Text><DurationField value={ed.dur} onChange={v => setEd(p => ({ ...p, dur: v }))} presets={[30, 45, 60, 90, 120, 150]} />
            <Fld label="Описание"><TextInput style={st.in} color={colors.text} value={ed.desc} onChangeText={v => setEd(p => ({ ...p, desc: v }))} placeholder="Что видит клиент на странице записи" placeholderTextColor="rgba(255,255,255,0.25)" /></Fld>
            <Text style={[st.note, !bad && !err && st.noteOk]}>{err || bad || `Так увидит клиент: ${ed.name.trim()} · ${fmtDur(ed.dur)} · ${rub(price)} ₽`}</Text>
            {ed.mode === 'edit' && <Pressable onPress={() => setView('remove')}><Text style={st.rm}>Убрать из записи</Text></Pressable>}
            <View style={st.foot}><GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={() => setView('list')} /><GlassButton style={{ flex: 1 }} tone="accent" label="Сохранить" height={54} disabled={!!bad} onPress={save} /></View></>}
          {view === 'remove' && ed && <>
            <Text style={st.title}>Убрать «{ed.name}» из записи?</Text><Text style={st.sub}>Услуга перестанет предлагаться в записи (онлайн и по телефону). Она останется в «Товарах» и в Кассе, прошлые записи не изменятся.</Text>
            <View style={st.foot}><GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={() => setView('list')} /><GlassButton style={{ flex: 1 }} tone="danger" label="Убрать" height={54} onPress={remove} /></View></>}
        </GlassSurface></View>
      </KeyboardSafe>
    </Modal>
  );
}
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', alignItems: 'center', justifyContent: 'center' }, wrap: { width: '50%', minWidth: 540, maxWidth: 640 },
  title: { fontFamily: fonts.display, fontSize: 21, color: colors.text }, sub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 3, marginBottom: 6, lineHeight: 19 },
  gl: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginTop: 14, marginBottom: 8 },
  fld: { flexDirection: 'row', alignItems: 'center', minHeight: 54, borderRadius: 16, paddingHorizontal: 18, marginTop: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, fl: { width: 90, fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim }, in: { flex: 1, minWidth: 0, padding: 0, fontFamily: fonts.familySemibold, fontSize: 17, color: colors.text }, suf: { fontFamily: fonts.familyMedium, fontSize: 15, color: colors.orangeLight, marginLeft: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }, rN: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, rS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 }, rD: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2, fontStyle: 'italic' },
  ib: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, ibT: { fontSize: 15, color: colors.textDim },
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, padding: 26, textAlign: 'center', lineHeight: 21 },
  mk: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, marginTop: 8, backgroundColor: 'rgba(127,168,217,0.10)', borderWidth: 1, borderColor: 'rgba(157,191,230,0.4)' }, mkI: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(127,168,217,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }, mkIT: { fontSize: 22, color: colors.orangeLight },
  note: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.warning, lineHeight: 19, padding: 10, borderRadius: 14, backgroundColor: 'rgba(217,172,98,0.08)', borderWidth: 1, borderColor: 'rgba(217,172,98,0.25)', marginTop: 10 }, noteOk: { color: colors.green, backgroundColor: 'rgba(120,183,150,0.07)', borderColor: 'rgba(120,183,150,0.25)' },
  rm: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red, marginTop: 10, paddingVertical: 6 }, foot: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
