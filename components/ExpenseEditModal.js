import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, Alert, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import KeyboardSafe from './KeyboardSafe';
import GlassSurface from './GlassSurface';
import GlassButton from './GlassButton';
import DatePicker from './DatePicker';
import Toggle from './Toggle';
import { localDate } from '../db/reports';
import { colors, fonts } from '../constants/theme';

export const EXPENSE_CATEGORIES = ['Аренда', 'Коммуналка', 'Расходники', 'Реклама', 'Прочее'];
const PERIODS = [{ key: 'week', label: 'Неделя' }, { key: 'month', label: 'Месяц' }, { key: 'year', label: 'Год' }];
const ddmm = s => String(s || '').slice(0, 10).split('-').reverse().join('.');
const num = v => parseFloat(String(v).replace(',', '.').replace(/\s/g, ''));

/**
 * Окно расхода. mode «expense» — разовый расход (можно включить «Повторять» — тогда он станет повторяющимся и
 * будет начисляться по дням), mode «recurring» — правка повторяющегося расхода. Закупка из «Склада» открывается
 * только для просмотра: править и удалять её можно только в «Складе».
 * Props: visible, mode, item, onSave({kind, category, amount, comment, date, photo, name, period}) → {ok, message},
 * onDelete(), onClose, isNarrow.
 */
export default function ExpenseEditModal({ visible, mode = 'expense', item, onSave, onDelete, onClose, isNarrow }) {
  const rec = mode === 'recurring';
  const readOnly = !rec && item?.source === 'stock';
  const [cat, setCat] = useState('Прочее');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [period, setPeriod] = useState('month');
  const [date, setDate] = useState(localDate());
  const [photo, setPhoto] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [picker, setPicker] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!visible) return;
    setErr(''); setRepeat(false); setPicker(false);
    if (rec) { setName(item?.name || ''); setAmount(item ? String(item.amount) : ''); setPeriod(item?.period || 'month'); }
    else {
      setCat(item?.category || 'Прочее'); setAmount(item ? String(item.amount) : ''); setComment(item?.comment || '');
      setDate((item?.date || localDate()).slice(0, 10)); setPhoto(item?.photo_uri || ''); setPeriod('month');
    }
  }, [visible, item?.id]);

  const a = num(amount);
  const valid = a > 0 && (rec ? name.trim().length > 0 : true);
  const cats = item && !EXPENSE_CATEGORIES.includes(item.category) ? [...EXPENSE_CATEGORIES, item.category] : EXPENSE_CATEGORIES;
  const asRecurring = rec || repeat;

  const pickPhoto = async (camera) => {
    try {
      const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Нет доступа', camera ? 'Разрешите доступ к камере в настройках устройства' : 'Разрешите доступ к фото в настройках устройства'); return; }
      const r = camera ? await ImagePicker.launchCameraAsync({ quality: 0.6 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
      if (!r.canceled && r.assets?.[0]?.uri) setPhoto(r.assets[0].uri);
    } catch (e) { console.error(e); Alert.alert('Ошибка', 'Не удалось получить фото'); }
  };
  const submit = () => {
    if (!valid || readOnly) return;
    let res;
    try { res = onSave({ kind: asRecurring ? 'recurring' : 'expense', category: cat, amount: a, comment: comment.trim(), date, photo, name: (rec ? name : comment || cat).trim(), period }); }
    catch (e) { console.error('[ExpenseEditModal]', e); res = { ok: false, message: 'Не удалось сохранить. Попробуйте ещё раз.' }; }
    if (res && res.ok) onClose && onClose(); else setErr((res && res.message) || 'Не удалось сохранить.');
  };
  const askDelete = () => Alert.alert(rec ? 'Удалить повторяющийся расход?' : 'Удалить расход?', rec ? `«${item?.name}» перестанет начисляться.` : `${item?.comment || item?.category}, ${a} ₽`, [
    { text: 'Отмена' }, { text: 'Удалить', style: 'destructive', onPress: () => { onDelete && onDelete(); onClose && onClose(); } }]);

  const Fld = ({ label, children, bad }) => <View style={[s.fld, bad && s.bad]}><Text style={s.lbl}>{label}</Text>{children}</View>;
  const Chips = ({ items, value, onPick }) => (
    <View style={s.chips}>{items.map(i => { const k = i.key || i, l = i.label || i; return (
      <Pressable key={k} style={[s.chip, value === k && s.chipOn]} onPress={() => onPick(k)}><Text style={[s.chipT, value === k && { color: colors.orangeLight }]}>{l}</Text></Pressable>); })}</View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardSafe style={s.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.wrap, isNarrow && { width: '96%', minWidth: 0 }]}>
          <GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating>
            <ScrollView style={{ maxHeight: 640 }} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.title}>{readOnly ? 'Закупка' : rec ? 'Повторяющийся расход' : item ? 'Редактирование расхода' : 'Новый расход'}</Text>
              <Text style={s.sub}>{rec ? 'Начисляется по дням — отдельные строки каждый месяц не создаются' : 'Сумма, категория и дата — остальное по желанию'}</Text>
              {readOnly && <View style={s.ro}><Text style={s.roT}>Эта запись создана автоматически при закупке в «Складе». Изменить или отменить её можно только там — так склад и расходы не разойдутся.</Text></View>}

              {!rec && <><Text style={s.grp}>Категория</Text><View pointerEvents={readOnly ? 'none' : 'auto'}><Chips items={cats} value={cat} onPick={setCat} /></View></>}
              <Text style={s.grp}>Данные</Text>
              {rec && <Fld label="Название"><TextInput style={s.in} color={colors.text} value={name} onChangeText={setName} placeholder="Аренда, интернет…" placeholderTextColor="rgba(255,255,255,0.22)" /></Fld>}
              <Fld label="Сумма" bad={!!amount && !(a > 0)}><TextInput style={s.in} color={colors.text} value={amount} editable={!readOnly} onChangeText={v => { setErr(''); setAmount(v.replace(/[^0-9.,]/g, '')); }} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="rgba(255,255,255,0.22)" /><Text style={s.suf}>₽</Text></Fld>
              {rec ? <><Text style={s.grp}>Как часто</Text><Chips items={PERIODS} value={period} onPick={setPeriod} /></> : <>
                <Fld label="Описание"><TextInput style={s.in} color={colors.text} value={comment} editable={!readOnly} onChangeText={setComment} placeholder="Например, баннер у входа" placeholderTextColor="rgba(255,255,255,0.22)" /></Fld>
                {!repeat && <Pressable disabled={readOnly} onPress={() => setPicker(true)}><Fld label="Дата"><Text style={s.in}>{ddmm(date)}</Text></Fld></Pressable>}
              </>}
              {!rec && !item && (
                <View style={s.tg}><Text style={s.tgT}>Повторять</Text><Toggle value={repeat} onValueChange={setRepeat} /></View>
              )}
              {repeat && <><Text style={s.grp}>Как часто</Text><Chips items={PERIODS} value={period} onPick={setPeriod} /><Text style={s.hint}>Появится в блоке «Повторяющиеся» и в отчёте строкой «Накладные».</Text></>}
              {!rec && !repeat && !readOnly && (
                <View style={s.photoRow}>
                  <Text style={s.photoT}>{photo ? 'Фото чека прикреплено' : 'Фото чека (по желанию)'}</Text>
                  <Pressable onPress={() => pickPhoto(true)} hitSlop={6}><Text style={s.link}>Снять</Text></Pressable>
                  <Pressable onPress={() => pickPhoto(false)} hitSlop={6}><Text style={s.link}>Из галереи</Text></Pressable>
                  {!!photo && <Pressable onPress={() => setPhoto('')} hitSlop={6}><Text style={[s.link, { color: colors.red }]}>Убрать</Text></Pressable>}
                </View>
              )}
              {!!err && <Text style={s.err}>{err}</Text>}
              {(rec || (item && !readOnly)) && <Pressable onPress={askDelete} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 14 }}><Text style={s.del}>Удалить</Text></Pressable>}
              <View style={s.foot}>
                <GlassButton style={{ flex: 1 }} label={readOnly ? 'Закрыть' : 'Отмена'} height={54} onPress={onClose} />
                {!readOnly && <GlassButton style={{ flex: 1 }} tone="accent" label="Сохранить" height={54} disabled={!valid} onPress={submit} />}
              </View>
            </ScrollView>
          </GlassSurface>
        </View>
      </KeyboardSafe>
      <DatePicker visible={picker} value={date} title="Дата расхода" onClose={() => setPicker(false)} onChange={v => { setDate(v); setPicker(false); }} />
    </Modal>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', alignItems: 'center', justifyContent: 'center' }, wrap: { width: '48%', minWidth: 520, maxWidth: 600 },
  title: { fontFamily: fonts.display, fontSize: 21, color: colors.text }, sub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  grp: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginTop: 16, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { height: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: 'rgba(127,168,217,0.22)', borderColor: 'rgba(157,191,230,0.5)' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  fld: { flexDirection: 'row', alignItems: 'center', minHeight: 58, borderRadius: 16, paddingHorizontal: 18, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, bad: { borderColor: 'rgba(219,129,120,0.65)' },
  lbl: { width: 100, fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim }, in: { flex: 1, minWidth: 0, padding: 0, fontFamily: fonts.familySemibold, fontSize: 18, color: colors.text }, suf: { fontFamily: fonts.familyMedium, fontSize: 16, color: colors.orangeLight, marginLeft: 8 },
  tg: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, paddingVertical: 6 }, tgT: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  hint: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 8, lineHeight: 19 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 }, photoT: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim }, link: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orangeLight },
  ro: { padding: 12, borderRadius: 14, backgroundColor: 'rgba(217,172,98,0.08)', borderWidth: 1, borderColor: 'rgba(217,172,98,0.25)', marginTop: 12 }, roT: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.warning, lineHeight: 19 },
  err: { fontFamily: fonts.familyMedium, fontSize: 13, color: colors.red, marginTop: 10 }, del: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red },
  foot: { flexDirection: 'row', gap: 10, marginTop: 18 },
});
