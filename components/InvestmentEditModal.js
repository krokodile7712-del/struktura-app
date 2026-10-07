import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, Alert, StyleSheet } from 'react-native';
import KeyboardSafe from './KeyboardSafe';
import GlassSurface from './GlassSurface';
import GlassButton from './GlassButton';
import DatePicker from './DatePicker';
import { localDate } from '../db/reports';
import { colors, fonts } from '../constants/theme';

export const INV_CATEGORIES = [{ key: 'equipment', label: 'Оборудование' }, { key: 'renovation', label: 'Ремонт' }, { key: 'marketing', label: 'Реклама' }, { key: 'deposit', label: 'Депозит' }, { key: 'other', label: 'Прочее' }];
const TERMS = [3, 6, 12, 24, 36];
const ddmm = s => String(s || '').slice(0, 10).split('-').reverse().join('.');
const fmt = n => Math.round(n || 0).toLocaleString('ru-RU');

/**
 * Окно вложения («крупная покупка»). Срок списания — минимум 3 месяца (меньше нельзя), по умолчанию 3; списывается по дням:
 * пока бизнесу меньше срока, в отчёт попадают только уже отработанные дни. Депозит (возвратный) в затраты не идёт.
 * Props: visible, item, onSave({name, amount, invest_date, amort_months, category, returnable}) → {ok, message}, onDelete, onClose.
 */
export default function InvestmentEditModal({ visible, item, onSave, onDelete, onClose, isNarrow }) {
  const [name, setName] = useState(''); const [amount, setAmount] = useState(''); const [date, setDate] = useState(localDate());
  const [months, setMonths] = useState(3); const [cat, setCat] = useState('equipment'); const [picker, setPicker] = useState(false); const [err, setErr] = useState('');
  useEffect(() => {
    if (!visible) return;
    setErr(''); setPicker(false);
    setName(item?.name || ''); setAmount(item ? String(item.amount) : ''); setDate((item?.invest_date || localDate()).slice(0, 10));
    setMonths(Math.max(3, item?.amort_months || 3)); setCat(item?.returnable ? 'deposit' : (item?.category || 'equipment'));
  }, [visible, item?.id]);
  const a = parseFloat(String(amount).replace(',', '.')) || 0;
  const deposit = cat === 'deposit';
  const valid = name.trim().length > 0 && a > 0;
  const submit = () => {
    if (!valid) return;
    let res;
    try { res = onSave({ name: name.trim(), amount: a, invest_date: date, amort_months: Math.max(3, months), category: cat, returnable: deposit }); }
    catch (e) { console.error('[InvestmentEditModal]', e); res = { ok: false, message: 'Не удалось сохранить. Попробуйте ещё раз.' }; }
    if (res && res.ok) onClose && onClose(); else setErr((res && res.message) || 'Не удалось сохранить.');
  };
  const askDelete = () => Alert.alert('Удалить вложение?', `«${item?.name}» — ${fmt(item?.amount)} ₽`, [{ text: 'Отмена' }, { text: 'Удалить', style: 'destructive', onPress: () => { onDelete && onDelete(); onClose && onClose(); } }]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardSafe style={s.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.wrap, isNarrow && { width: '96%', minWidth: 0 }]}>
          <GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating>
            <ScrollView style={{ maxHeight: 640 }} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.title}>{item ? 'Редактирование вложения' : 'Новое вложение'}</Text>
              <Text style={s.sub}>Оборудование, ремонт, реклама и другие крупные покупки</Text>
              <Text style={s.grp}>Вид</Text>
              <View style={s.chips}>{INV_CATEGORIES.map(c => <Pressable key={c.key} style={[s.chip, cat === c.key && s.chipOn]} onPress={() => setCat(c.key)}><Text style={[s.chipT, cat === c.key && { color: colors.orangeLight }]}>{c.label}</Text></Pressable>)}</View>
              <Text style={s.grp}>Данные</Text>
              <View style={s.fld}><Text style={s.lbl}>Название</Text><TextInput style={s.in} color={colors.text} value={name} onChangeText={setName} placeholder="Например, кофемашина" placeholderTextColor="rgba(255,255,255,0.22)" /></View>
              <View style={s.fld}><Text style={s.lbl}>Сумма</Text><TextInput style={s.in} color={colors.text} value={amount} onChangeText={v => setAmount(v.replace(/[^0-9.,]/g, ''))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="rgba(255,255,255,0.22)" /><Text style={s.suf}>₽</Text></View>
              <Pressable onPress={() => setPicker(true)}><View style={s.fld}><Text style={s.lbl}>Дата покупки</Text><Text style={s.in}>{ddmm(date)}</Text></View></Pressable>
              {!deposit && (
                <>
                  <Text style={s.grp}>Растянуть на</Text>
                  <View style={s.chips}>{TERMS.map(t => <Pressable key={t} style={[s.chip, months === t && s.chipOn]} onPress={() => setMonths(t)}><Text style={[s.chipT, months === t && { color: colors.orangeLight }]}>{t} мес</Text></Pressable>)}</View>
                  <Text style={s.hint}>{a > 0 ? `≈ ${fmt(a / months)} ₽ в месяц. ` : ''}Минимум 3 месяца. Списывается по дням: пока вы работаете меньше срока, в отчёт идут только уже отработанные дни.</Text>
                </>
              )}
              {deposit && <Text style={s.hint}>Депозит возвращается, поэтому в затраты и амортизацию не входит.</Text>}
              {!!err && <Text style={s.err}>{err}</Text>}
              {!!item && <Pressable onPress={askDelete} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 14 }}><Text style={s.del}>Удалить</Text></Pressable>}
              <View style={s.foot}>
                <GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={onClose} />
                <GlassButton style={{ flex: 1 }} tone="accent" label="Сохранить" height={54} disabled={!valid} onPress={submit} />
              </View>
            </ScrollView>
          </GlassSurface>
        </View>
      </KeyboardSafe>
      <DatePicker visible={picker} value={date} title="Дата покупки" onClose={() => setPicker(false)} onChange={v => { setDate(v); setPicker(false); }} />
    </Modal>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', alignItems: 'center', justifyContent: 'center' }, wrap: { width: '48%', minWidth: 520, maxWidth: 600 },
  title: { fontFamily: fonts.display, fontSize: 21, color: colors.text }, sub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  grp: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginTop: 16, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { height: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: 'rgba(127,168,217,0.22)', borderColor: 'rgba(157,191,230,0.5)' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  fld: { flexDirection: 'row', alignItems: 'center', minHeight: 58, borderRadius: 16, paddingHorizontal: 18, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  lbl: { width: 120, fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim }, in: { flex: 1, minWidth: 0, padding: 0, fontFamily: fonts.familySemibold, fontSize: 18, color: colors.text }, suf: { fontFamily: fonts.familyMedium, fontSize: 16, color: colors.orangeLight, marginLeft: 8 },
  hint: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 8, lineHeight: 19 }, err: { fontFamily: fonts.familyMedium, fontSize: 13, color: colors.red, marginTop: 10 },
  del: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red }, foot: { flexDirection: 'row', gap: 10, marginTop: 18 },
});
