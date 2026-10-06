import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, Animated, StyleSheet } from 'react-native';
import KeyboardSafe from './KeyboardSafe';
import GlassSurface from './GlassSurface';
import GlassButton from './GlassButton';
import PhoneInput from './PhoneInput';
import Icon from './Icon';
import { colors, fonts } from '../constants/theme';
import { useReduceMotion } from '../hooks/useReduceMotion';

const digits = (v) => String(v || '').replace(/\D/g, '');
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
export const initials = (name) => {
  const p = String(name || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '?') + (p[1]?.[0] || '')).toUpperCase();
};
// Дата рождения «ДД.ММ.ГГГГ»: маска при вводе и проверка существования даты
export const maskBirth = (v) => {
  const d = digits(v).slice(0, 8);
  let o = d.slice(0, 2);
  if (d.length > 2) o += '.' + d.slice(2, 4);
  if (d.length > 4) o += '.' + d.slice(4, 8);
  return o;
};
export const birthError = (s) => {
  if (!s) return '';
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  if (!m) return 'Дата в формате ДД.ММ.ГГГГ';
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(y, mo - 1, d);
  const ok = dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d && y >= 1900 && dt <= new Date();
  return ok ? '' : 'Такой даты не существует';
};

/**
 * Окно редактирования клиента: личные данные, лояльность, удаление.
 * Проверка на лету (ошибка под полем), «Сохранить» недоступна без изменений и при ошибках,
 * касание вне окна при несохранённых изменениях спрашивает «Сохранить изменения?»,
 * удаление — отдельным подтверждением внутри окна.
 * Props: visible, client, canLoyalty, loyaltyModel, validatePhone(phone) → строка ошибки,
 * onSave({fio, phone, balance, discount, birth}) → {ok, message}, onClose,
 * canDelete, deleteText, deleting, onDelete(), isNarrow.
 */
export default function ClientEditModal({
  visible, client, canLoyalty, loyaltyModel, validatePhone, onSave, onClose,
  canDelete, deleteText, deleting, onDelete, isNarrow,
}) {
  const reduce = useReduceMotion();
  const pop = useRef(new Animated.Value(0)).current;
  const [f, setF] = useState({ fio: '', phone: '', balance: '', discount: '', birth: '' });
  const [init, setInit] = useState(null);
  const [ask, setAsk] = useState(false);
  const [delAsk, setDelAsk] = useState(false);
  const [formErr, setFormErr] = useState('');

  useEffect(() => {
    if (!visible || !client) return;
    const v = {
      fio: client.fio || '', phone: client.phone || '',
      balance: String(client.balance || 0), discount: String(client.discount_pct || 0), birth: client.birth_date || '',
    };
    setF(v); setInit(v); setAsk(false); setDelAsk(false); setFormErr('');
    if (reduce) pop.setValue(1);
    else { pop.setValue(0); Animated.spring(pop, { toValue: 1, speed: 22, bounciness: 0, useNativeDriver: true }).start(); }
  }, [visible, client?.id]);

  const set = (k) => (val) => setF(p => ({ ...p, [k]: val }));
  const bal = parseFloat(String(f.balance).replace(',', '.'));
  const dis = parseFloat(String(f.discount).replace(',', '.'));
  const errs = {};
  if (!f.fio.trim()) errs.fio = 'Введите имя клиента';
  const pe = visible ? (validatePhone ? validatePhone(f.phone) : '') : '';
  if (pe) errs.phone = pe;
  const be = birthError(f.birth);
  if (be) errs.birth = be;
  if (canLoyalty && (!isFinite(bal) || bal < 0)) errs.balance = 'Только число не меньше нуля';
  if (!isFinite(dis) || dis < 0 || dis > 100) errs.discount = 'Скидка — от 0 до 100%';
  const dirty = !!init && (f.fio !== init.fio || f.phone !== init.phone || f.birth !== init.birth || (canLoyalty && f.balance !== init.balance) || f.discount !== init.discount);
  const canSave = dirty && Object.keys(errs).length === 0;

  const save = () => {
    if (!canSave) return;
    let res;
    try { res = onSave({ fio: f.fio.trim(), phone: f.phone, balance: canLoyalty ? bal : (client.balance || 0), discount: dis, birth: f.birth.trim() }); }
    catch (e) { console.error('[ClientEditModal]', e); res = { ok: false, message: 'Не удалось сохранить. Попробуйте ещё раз.' }; }
    if (res && res.ok) onClose && onClose();
    else { setAsk(false); setFormErr((res && res.message) || 'Не удалось сохранить. Попробуйте ещё раз.'); }
  };
  const tryClose = () => { if (dirty) setAsk(true); else onClose && onClose(); };
  const stepBal = (d) => set('balance')(String(Math.max(0, Math.round(((isFinite(bal) ? bal : 0) + d) * 100) / 100)));
  const balDiff = canLoyalty && isFinite(bal) ? bal - (client?.balance || 0) : 0;
  const unit = loyaltyModel === 'subscription' ? 'визитов' : 'баллов';

  const field = (key, label, input, hasErr) => (
    <View style={[styles.fld, !!errs[key] && styles.fldBad]}>
      <Text style={styles.fldLbl}>{label}</Text>
      {input}
    </View>
  );
  const err = (k) => (errs[k] ? <Text style={styles.err}>{errs[k]}</Text> : null);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={tryClose}>
      <KeyboardSafe style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={tryClose} />
        <Animated.View style={[styles.wrap, isNarrow && { width: '96%', minWidth: 0 }, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }]}>
          <GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating>
            <View style={styles.head}>
              <View style={styles.av}><Text style={styles.avTxt}>{initials(client?.fio)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Редактирование клиента</Text>
                <Text style={styles.sub} numberOfLines={1}>{init?.fio}</Text>
              </View>
              {dirty && <View style={styles.dirty}><View style={styles.dirtyDot} /><Text style={styles.dirtyTxt}>Есть изменения</Text></View>}
            </View>

            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingHorizontal: 26, paddingBottom: 6 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.grp, { marginTop: 4 }]}>Личные данные</Text>
              {field('fio', 'ФИО', <TextInput style={styles.input} color={colors.text} value={f.fio} onChangeText={set('fio')} placeholder="Имя клиента" placeholderTextColor={colors.muted} />)}
              {err('fio')}
              {field('phone', 'Телефон', <PhoneInput color={colors.text} style={styles.input} value={f.phone} onChangeText={set('phone')} placeholderTextColor={colors.muted} />)}
              {err('phone')}
              {field('birth', 'Дата рождения', <TextInput style={styles.input} color={colors.text} value={f.birth} onChangeText={v => set('birth')(maskBirth(v))} keyboardType="number-pad" placeholder="ДД.ММ.ГГГГ" placeholderTextColor="rgba(255,255,255,0.22)" />)}
              {err('birth') || <Text style={styles.hint}>Необязательно</Text>}

              <Text style={styles.grp}>Лояльность</Text>
              {canLoyalty && (
                <>
                  <View style={[styles.fld, !!errs.balance && styles.fldBad]}>
                    <Text style={styles.fldLbl}>{loyaltyModel === 'subscription' ? 'Визитов' : 'Баллов'}</Text>
                    <TextInput style={[styles.input, { textAlign: 'right' }]} color={colors.text} value={f.balance} onChangeText={v => set('balance')(String(v).replace(/[^0-9.,]/g, ''))} keyboardType="decimal-pad" />
                    <Text style={styles.suffix}>{unit}</Text>
                    <Pressable style={styles.stepBtn} onPress={() => stepBal(-1)} hitSlop={6}><Icon name="minus" size={18} color={colors.textDim} /></Pressable>
                    <Pressable style={styles.stepBtn} onPress={() => stepBal(1)} hitSlop={6}><Icon name="plus" size={18} color={colors.textDim} /></Pressable>
                  </View>
                  <View style={styles.qd}>
                    {[10, 50, -10].map(d => (
                      <Pressable key={d} style={styles.qdChip} onPress={() => stepBal(d)}><Text style={styles.qdTxt}>{d > 0 ? '+' : '−'}{Math.abs(d)}</Text></Pressable>
                    ))}
                  </View>
                  {balDiff !== 0 && <Text style={styles.delta}>Было <Text style={styles.deltaB}>{fmt(client.balance)}</Text> → станет <Text style={styles.deltaB}>{fmt(bal)}</Text> ({balDiff > 0 ? '+' : '−'}{fmt(Math.abs(balDiff))})</Text>}
                  {err('balance')}
                </>
              )}
              <View style={[styles.fld, !!errs.discount && styles.fldBad]}>
                <Text style={styles.fldLbl}>Личная скидка</Text>
                <TextInput style={[styles.input, { textAlign: 'right' }]} color={colors.text} value={f.discount} onChangeText={v => set('discount')(String(v).replace(/[^0-9.,]/g, ''))} keyboardType="decimal-pad" />
                <Text style={styles.suffix}>%</Text>
              </View>
              <View style={styles.qd}>
                {[0, 5, 10, 15].map(d => (
                  <Pressable key={d} style={[styles.qdChip, dis === d && styles.qdOn]} onPress={() => set('discount')(String(d))}><Text style={[styles.qdTxt, dis === d && { color: colors.text }]}>{d}%</Text></Pressable>
                ))}
              </View>
              {err('discount') || <Text style={styles.hint}>Применяется автоматически на Кассе</Text>}

              {!!formErr && <Text style={[styles.err, { marginTop: 10 }]}>{formErr}</Text>}
              {canDelete && (
                <Pressable onPress={() => setDelAsk(true)} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 16, paddingVertical: 6 }}>
                  <Text style={styles.delLink}>Удалить клиента</Text>
                </Pressable>
              )}
            </ScrollView>

            <View style={styles.foot}>
              <GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={tryClose} />
              <GlassButton style={{ flex: 1 }} tone="accent" label="Сохранить" height={54} disabled={!canSave} onPress={save} />
            </View>

            {ask && (
              <View style={styles.cover}>
                <Text style={styles.coverTitle}>Сохранить изменения?</Text>
                <Text style={styles.coverTxt}>Вы изменили данные клиента. Без сохранения они пропадут.</Text>
                <View style={styles.coverRow}>
                  <GlassButton style={{ flex: 1 }} label="Не сохранять" height={50} onPress={() => { setAsk(false); onClose && onClose(); }} />
                  <GlassButton style={{ flex: 1 }} tone="accent" label="Сохранить" height={50} disabled={!canSave} onPress={save} />
                </View>
                {!canSave && <Text style={[styles.err, { marginTop: 10 }]}>Исправьте ошибки в полях, чтобы сохранить</Text>}
              </View>
            )}
            {delAsk && (
              <View style={styles.cover}>
                <Text style={styles.coverTitle}>Удалить клиента?</Text>
                <Text style={styles.coverTxt}>{deleteText}</Text>
                <View style={styles.coverRow}>
                  <GlassButton style={{ flex: 1 }} label="Отмена" height={50} onPress={() => setDelAsk(false)} />
                  <GlassButton style={{ flex: 1 }} tone="danger" label={deleting ? 'Удаляем…' : 'Удалить'} height={50} disabled={deleting} onPress={() => onDelete && onDelete()} />
                </View>
              </View>
            )}
          </GlassSurface>
        </Animated.View>
      </KeyboardSafe>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', alignItems: 'center', justifyContent: 'center' },
  wrap: { width: '56%', minWidth: 560, maxWidth: 660 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 26, paddingTop: 22, paddingBottom: 12 },
  av: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(127,168,217,0.16)', borderWidth: 1, borderColor: 'rgba(157,191,230,0.3)', marginRight: 14 },
  avTxt: { fontFamily: fonts.family, fontSize: 17, color: colors.orangeLight },
  title: { fontFamily: fonts.display, fontSize: 21, color: colors.text, letterSpacing: -0.2 },
  sub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  dirty: { flexDirection: 'row', alignItems: 'center', marginLeft: 10 },
  dirtyDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warning, marginRight: 7 },
  dirtyTxt: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.warning },
  grp: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginTop: 16, marginBottom: 8, marginHorizontal: 2 },
  fld: { flexDirection: 'row', alignItems: 'center', minHeight: 58, borderRadius: 16, paddingHorizontal: 18, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  fldBad: { borderColor: 'rgba(219,129,120,0.65)', backgroundColor: 'rgba(219,129,120,0.07)' },
  fldLbl: { width: 128, fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim },
  input: { flex: 1, minWidth: 0, padding: 0, fontFamily: fonts.familySemibold, fontSize: 18, color: colors.text },
  suffix: { fontFamily: fonts.familyMedium, fontSize: 15, color: colors.orangeLight, marginHorizontal: 8 },
  stepBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  qd: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 6 },
  qdChip: { height: 34, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  qdOn: { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.26)' },
  qdTxt: { fontFamily: fonts.familyMedium, fontSize: 14, color: colors.muted },
  delta: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginHorizontal: 4, marginBottom: 6 },
  deltaB: { fontFamily: fonts.familySemibold, color: colors.text },
  hint: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginHorizontal: 4, marginBottom: 4 },
  err: { fontFamily: fonts.familyMedium, fontSize: 13, color: colors.red, marginHorizontal: 4, marginBottom: 6, lineHeight: 18 },
  delLink: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red },
  foot: { flexDirection: 'row', gap: 10, paddingHorizontal: 26, paddingTop: 14, paddingBottom: 22, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  cover: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(14,18,26,0.97)', borderRadius: 26, alignItems: 'center', justifyContent: 'center', padding: 30 },
  coverTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text, marginBottom: 8 },
  coverTxt: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim, lineHeight: 21, textAlign: 'center', maxWidth: 400, marginBottom: 20 },
  coverRow: { flexDirection: 'row', gap: 10, width: '100%', maxWidth: 420 },
});
