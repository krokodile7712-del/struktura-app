import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, Animated, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import KeyboardSafe from './KeyboardSafe';
import GlassSurface from './GlassSurface';
import GlassButton from './GlassButton';
import PhoneInput from './PhoneInput';
import { maskBirth, birthError } from './ClientEditModal';
import { insertClient, getClientByCode, findClientByPhone, getTerms, getLoyaltyConfig, genitiveSingularRu } from '../db/queries';
import { isPhoneOkOrEmpty, PHONE_ERROR } from '../utils/phone';
import { useToast } from './Toast';
import { colors, fonts } from '../constants/theme';
import { useReduceMotion } from '../hooks/useReduceMotion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

// Что клиент получит по программе лояльности (показывается после регистрации)
function loyaltyBlurb(model, config, terms) {
  const clientGen = genitiveSingularRu(terms.client || 'Клиент').toLowerCase();
  if (model === 'points') {
    return {
      title: 'Баллы за покупки',
      text: config.allow_spend
        ? `${terms.client} будет получать ${config.earn_pct}% от суммы покупки баллами и сможет списывать их при следующих покупках.`
        : `${terms.client} будет получать ${config.earn_pct}% от суммы покупки баллами.`,
    };
  }
  if (model === 'discount') return { title: 'Постоянная скидка', text: `На все покупки этого ${clientGen} автоматически действует скидка ${config.pct}%.` };
  if (model === 'subscription') return { title: 'Абонемент', text: `Каждое посещение будет списывать ${config.deduct_per_visit} ${config.deduct_per_visit === 1 ? 'визит' : 'визита'} с абонемента.` };
  return null;
}

const generateUniqueCode = () => {
  let code;
  do { code = 'CLI-' + String(Math.floor(Math.random() * 9000) + 1000); } while (getClientByCode(code));
  return code;
};

/**
 * Регистрация нового клиента всплывающим окном (вместо отдельной страницы): ФИО, телефон, дата рождения.
 * Проверка на лету (имя, номер с проверкой дубля, дата). После создания окно показывает результат:
 * ID клиента, что он получит по лояльности и действия — открыть карточку, оформить первый заказ,
 * зарегистрировать ещё. Результат не закрывается сам — закрывается касанием вне окна.
 * Props: visible, onClose, onCreated(client), onOpenCard(clientId), onFirstOrder({id, fio}), isNarrow.
 */
export default function ClientCreateModal({ visible, onClose, onCreated, onOpenCard, onFirstOrder, isNarrow }) {
  const toast = useToast();
  const reduce = useReduceMotion();
  const pop = useRef(new Animated.Value(0)).current;
  const check = useRef(new Animated.Value(0)).current;
  const [fio, setFio] = useState('');
  const [phone, setPhone] = useState('');
  const [birth, setBirth] = useState('');
  const [created, setCreated] = useState(null);   // { id, fio, code }
  const [formErr, setFormErr] = useState('');
  const [terms, setTerms] = useState({ client: 'Клиент' });
  const [blurb, setBlurb] = useState(null);
  const busy = useRef(false);                       // защита от двойного нажатия «Зарегистрировать»

  const reset = () => { setFio(''); setPhone(''); setBirth(''); setCreated(null); setFormErr(''); busy.current = false; };
  useEffect(() => {
    if (!visible) return;
    reset();
    try { const t = getTerms(); setTerms(t); const { model, config } = getLoyaltyConfig(); setBlurb(loyaltyBlurb(model, config || {}, t)); } catch (e) { console.error(e); }
    if (reduce) pop.setValue(1);
    else { pop.setValue(0); Animated.spring(pop, { toValue: 1, speed: 22, bounciness: 0, useNativeDriver: true }).start(); }
  }, [visible]);

  const clientWord = terms.client || 'Клиент';
  const errs = {};
  const touched = fio.length > 0 || phone.length > 0 || birth.length > 0;
  if (touched && !fio.trim()) errs.fio = `Введите имя ${genitiveSingularRu(clientWord).toLowerCase()}`;
  if (phone.trim()) {
    if (!isPhoneOkOrEmpty(phone)) errs.phone = PHONE_ERROR + ' — или оставьте поле пустым';
    else { try { const dup = findClientByPhone(phone); if (dup) errs.phone = `Этот номер уже записан на клиента «${dup.fio}»`; } catch (_) {} }
  }
  const be = birthError(birth);
  if (be) errs.birth = be;
  const canSave = !!fio.trim() && Object.keys(errs).length === 0;

  const submit = () => {
    if (!canSave || busy.current) return;
    busy.current = true;
    setFormErr('');
    try {
      const code = generateUniqueCode();
      const id = insertClient({ fio: fio.trim(), phone: phone.trim(), code, birth_date: birth.trim() });
      const c = { id, fio: fio.trim(), code };
      setCreated(c);
      toast.show(`${clientWord} зарегистрирован`);
      onCreated && onCreated(c);
      check.setValue(0);
      if (reduce) check.setValue(1); else Animated.timing(check, { toValue: 1, duration: 650, useNativeDriver: false }).start();
    } catch (e) {
      console.error('[ClientCreateModal]', e);
      busy.current = false;
      setFormErr('Не удалось создать карту. Попробуйте ещё раз.');
    }
  };

  const ringOffset = check.interpolate({ inputRange: [0, 0.6], outputRange: [290, 0], extrapolate: 'clamp' });
  const tickOffset = check.interpolate({ inputRange: [0.5, 1], outputRange: [70, 0], extrapolate: 'clamp' });

  const field = (key, label, input) => (
    <>
      <View style={[styles.fld, !!errs[key] && styles.fldBad]}><Text style={styles.fldLbl}>{label}</Text>{input}</View>
      {!!errs[key] && <Text style={styles.err}>{errs[key]}</Text>}
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardSafe style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.wrap, isNarrow && { width: '96%', minWidth: 0 }, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }]}>
          <GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating>
            {!created ? (
              <>
                <View style={styles.head}>
                  <Text style={styles.title}>Новый {clientWord.toLowerCase()}</Text>
                  <Text style={styles.sub}>Достаточно имени — остальное можно добавить позже</Text>
                </View>
                <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingHorizontal: 26, paddingBottom: 6 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {field('fio', 'ФИО', <TextInput style={styles.input} color={colors.text} value={fio} onChangeText={setFio} placeholder="Анна Смирнова" placeholderTextColor="rgba(255,255,255,0.22)" autoFocus />)}
                  {field('phone', 'Телефон', <PhoneInput color={colors.text} style={styles.input} value={phone} onChangeText={setPhone} placeholderTextColor="rgba(255,255,255,0.22)" />)}
                  {field('birth', 'Дата рождения', <TextInput style={styles.input} color={colors.text} value={birth} onChangeText={v => setBirth(maskBirth(v))} keyboardType="number-pad" placeholder="ДД.ММ.ГГГГ" placeholderTextColor="rgba(255,255,255,0.22)" />)}
                  {!errs.birth && <Text style={styles.hint}>Телефон и дата рождения — необязательно</Text>}
                  {!!formErr && <Text style={[styles.err, { marginTop: 8 }]}>{formErr}</Text>}
                </ScrollView>
                <View style={styles.foot}>
                  <GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={onClose} />
                  <GlassButton style={{ flex: 1.4 }} tone="accent" label="Зарегистрировать" height={54} disabled={!canSave} onPress={submit} />
                </View>
              </>
            ) : (
              <View style={styles.done}>
                <Svg width={84} height={84} viewBox="0 0 100 100">
                  <AnimatedCircle cx={50} cy={50} r={46} stroke={colors.green} strokeWidth={5} fill="none" strokeLinecap="round" strokeDasharray="290" strokeDashoffset={ringOffset} />
                  <AnimatedPath d="M30 52l14 14 27-30" stroke={colors.green} strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="70" strokeDashoffset={tickOffset} />
                </Svg>
                <Text style={styles.doneName} numberOfLines={2}>{created.fio}</Text>
                <Text style={styles.doneSub}>{clientWord} успешно зарегистрирован</Text>
                <View style={styles.idBox}>
                  <Text style={styles.idLbl}>ID {clientWord.toLowerCase()}</Text>
                  <Text style={styles.idVal}>{created.code}</Text>
                </View>
                {!!blurb && (
                  <View style={styles.blurb}>
                    <Text style={styles.blurbTitle}>{blurb.title}</Text>
                    <Text style={styles.blurbTxt}>{blurb.text}</Text>
                  </View>
                )}
                <View style={styles.doneBtns}>
                  <GlassButton tone="accent" label={`Открыть карточку ${genitiveSingularRu(clientWord).toLowerCase()}`} height={54} onPress={() => onOpenCard && onOpenCard(created.id)} />
                  <GlassButton label="Оформить первый заказ" height={50} style={{ marginTop: 10 }} onPress={() => onFirstOrder && onFirstOrder(created)} />
                  <Pressable onPress={reset} style={styles.again} hitSlop={8}><Text style={styles.againTxt}>Зарегистрировать ещё</Text></Pressable>
                </View>
                <Text style={styles.closeHint}>Нажмите в любом месте экрана вне окна, чтобы закрыть</Text>
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
  wrap: { width: '50%', minWidth: 520, maxWidth: 600 },
  head: { paddingHorizontal: 26, paddingTop: 24, paddingBottom: 14 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text, letterSpacing: -0.2 },
  sub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 3 },
  fld: { flexDirection: 'row', alignItems: 'center', minHeight: 58, borderRadius: 16, paddingHorizontal: 18, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  fldBad: { borderColor: 'rgba(219,129,120,0.65)', backgroundColor: 'rgba(219,129,120,0.07)' },
  fldLbl: { width: 128, fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim },
  input: { flex: 1, minWidth: 0, padding: 0, fontFamily: fonts.familySemibold, fontSize: 18, color: colors.text },
  hint: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginHorizontal: 4, marginTop: 2 },
  err: { fontFamily: fonts.familyMedium, fontSize: 13, color: colors.red, marginHorizontal: 4, marginBottom: 6, lineHeight: 18 },
  foot: { flexDirection: 'row', gap: 10, paddingHorizontal: 26, paddingTop: 16, paddingBottom: 22 },
  done: { alignItems: 'center', padding: 26, paddingBottom: 22 },
  doneName: { fontFamily: fonts.display, fontSize: 24, color: colors.text, marginTop: 14, textAlign: 'center' },
  doneSub: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim, marginTop: 4 },
  idBox: { alignSelf: 'stretch', marginTop: 18, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  idLbl: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textDim },
  idVal: { fontFamily: fonts.display, fontSize: 28, color: colors.orangeLight, marginTop: 4, letterSpacing: 1 },
  blurb: { alignSelf: 'stretch', marginTop: 12, padding: 16, borderRadius: 16, backgroundColor: 'rgba(127,168,217,0.08)', borderWidth: 1, borderColor: 'rgba(157,191,230,0.22)' },
  blurbTitle: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  blurbTxt: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.textDim, marginTop: 4, lineHeight: 19 },
  doneBtns: { alignSelf: 'stretch', marginTop: 18 },
  again: { alignSelf: 'center', paddingVertical: 12 },
  againTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  closeHint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
});
