import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, Modal, Animated, TextInput, ScrollView, StyleSheet, LayoutAnimation,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import KeyboardSafe from './KeyboardSafe';
import GlassSurface from './GlassSurface';
import SoftGlow from './SoftGlow';
import Icon from './Icon';
import AnimatedNumber from './AnimatedNumber';
import { colors, fonts } from '../constants/theme';
import { useReduceMotion } from '../hooks/useReduceMotion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const fmt = n => Math.round(n || 0).toLocaleString('ru-RU');
const digits = v => parseInt(String(v || '').replace(/\D/g, ''), 10) || 0;

// Значок способа оплаты — по типу (наличные / карта / смешанная / прочее), а не по эмодзи из настроек:
// эмодзи на разных устройствах выглядят по-разному и выбиваются из сдержанного стиля.
const ICON_BY_TYPE = { cash: 'cash', card: 'card', mixed: 'split', qr: 'qr', sbp: 'qr' };

// Быстрые суммы «получено от клиента»: ровно к оплате и ближайшие «круглые» купюры.
function quickAmounts(total) {
  const c = [
    total,
    Math.ceil(total / 100) * 100,
    Math.ceil(total / 500) * 500,
    Math.ceil(total / 1000) * 1000,
    Math.ceil(total / 1000) * 1000 + 1000,
    5000,
  ].filter(v => v >= total);
  return Array.from(new Set(c)).slice(0, 5);
}

/**
 * Окно оплаты. Слева — способ оплаты (наличные со сдачей, смешанная с двумя полями), справа —
 * состав заказа и крупный итог. После успешной оплаты внутри окна показывается подтверждение
 * («Оплачено», сдача клиенту); оно НЕ закрывается само — закрывается касанием в любом месте экрана
 * вне окна (или кнопкой «назад» на устройстве), чтобы кассир успел увидеть сумму сдачи.
 *
 * Props:
 * - visible, onClose
 * - lines: [{ key, label, sum }] — позиции заказа
 * - subtotal, discountAmount, discountLabel — сумма до скидки и скидка (если есть)
 * - total — к оплате
 * - methods: [{ id, name, type }], selected (имя), onSelect(name)
 * - extra — необязательный блок над способами оплаты (списание баллов)
 * - onSubmit({ methodName, cashAmount, cardAmount }) → { ok, message?, notes?, warnings? }
 * - isNarrow — телефон: колонки друг под другом
 */
export default function PaymentModal({
  visible, onClose, lines = [], subtotal = 0, discountAmount = 0, discountLabel = 'Скидка',
  total = 0, methods = [], selected, onSelect, extra = null, onSubmit, isNarrow = false,
}) {
  const reduce = useReduceMotion();
  const [custom, setCustom]       = useState(false);
  const [recvQuick, setRecvQuick] = useState(null);   // null — «без сдачи»
  const [customVal, setCustomVal] = useState('');
  const [mixCash, setMixCash]     = useState('');
  const [mixCard, setMixCard]     = useState('');
  const [done, setDone]           = useState(null);
  const [error, setError]         = useState('');
  const busy = useRef(false);                          // защита от двойного нажатия «Принять оплату»
  const pop = useRef(new Animated.Value(0)).current;
  const check = useRef(new Animated.Value(0)).current;

  // При каждом открытии — чистое состояние
  useEffect(() => {
    if (!visible) return;
    busy.current = false;
    setCustom(false); setRecvQuick(null); setCustomVal(''); setMixCash(''); setMixCard('');
    setDone(null); setError('');
    check.setValue(0);
    if (reduce) { pop.setValue(1); return; }
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, speed: 22, bounciness: 0, useNativeDriver: true }).start();
  }, [visible]);

  const method = methods.find(m => m.name === selected) || methods[0] || { name: '', type: 'card' };
  const type = method.type;

  // Наличные
  const recv = custom ? digits(customVal) : (recvQuick == null ? total : recvQuick);
  const change = recv - total;
  const cashOk = recv >= total;

  // Смешанная
  const mc = digits(mixCash);
  const mk = digits(mixCard);
  const mixOk = mc > 0 && mk > 0 && Math.abs(mc + mk - total) < 0.5;

  const canConfirm = total > 0 && lines.length > 0 && (type === 'cash' ? cashOk : type === 'mixed' ? mixOk : true);

  const animate = () => { if (!reduce) LayoutAnimation.configureNext(LayoutAnimation.create(260, 'easeInEaseOut', 'opacity')); };
  const pickMethod = (name) => { animate(); setError(''); onSelect && onSelect(name); };

  const onMixCashChange = (v) => {
    const c = Math.min(digits(v), total);
    setMixCash(c ? String(c) : ''); setMixCard(c && total - c > 0 ? String(total - c) : '');
  };
  const onMixCardChange = (v) => {
    const k = Math.min(digits(v), total);
    setMixCard(k ? String(k) : ''); setMixCash(k && total - k > 0 ? String(total - k) : '');
  };
  const mixQuick = [{ label: 'Пополам', c: Math.round(total / 2) }]
    .concat([200, 500, 1000].filter(v => v < total - 50).map(v => ({ label: `Нал. ${fmt(v)} ₽`, c: v })))
    .slice(0, 3);

  const submit = () => {
    if (!canConfirm || busy.current) return;       // второе нажатие подряд — игнорируем
    busy.current = true;
    setError('');
    const cashAmount = type === 'cash' ? total : type === 'mixed' ? mc : 0;
    const cardAmount = type === 'cash' ? 0 : type === 'mixed' ? mk : total;
    let res;
    try { res = onSubmit({ methodName: method.name, cashAmount, cardAmount }); }
    catch (e) { console.error('[PaymentModal] onSubmit:', e); res = { ok: false, message: 'Не удалось провести оплату. Ничего не записано — попробуйте ещё раз.' }; }
    if (!res || !res.ok) {
      busy.current = false;                         // ошибка — можно повторить
      setError((res && res.message) || 'Не удалось провести оплату. Ничего не записано — попробуйте ещё раз.');
      return;
    }
    setDone({
      type, total, method: method.name, cash: cashAmount, card: cardAmount,
      change: type === 'cash' ? Math.max(0, change) : 0,
      notes: res.notes || [], warnings: res.warnings || [],
    });
    check.setValue(0);
    if (reduce) check.setValue(1);
    else Animated.timing(check, { toValue: 1, duration: 650, useNativeDriver: false }).start();
  };

  // Касание вне окна: закрывает окно оплаты и (после оплаты) окно «Оплачено»
  const close = () => { onClose && onClose(); };

  const ringOffset = check.interpolate({ inputRange: [0, 0.6], outputRange: [290, 0], extrapolate: 'clamp' });
  const tickOffset = check.interpolate({ inputRange: [0.5, 1], outputRange: [70, 0], extrapolate: 'clamp' });

  const left = (
    <View style={[styles.left, isNarrow && styles.leftNarrow]}>
      {extra}
      <Text style={styles.label}>Способ оплаты</Text>
      <View style={styles.methods}>
        {methods.map(m => {
          const on = m.name === method.name;
          return (
            <Pressable
              key={m.id != null ? String(m.id) : m.name}
              style={({ pressed }) => [styles.method, on && styles.methodOn, pressed && { transform: [{ scale: 0.97 }] }]}
              onPress={() => pickMethod(m.name)}
              accessibilityRole="button" accessibilityState={{ selected: on }}
            >
              <Icon name={ICON_BY_TYPE[m.type] || 'card'} size={26} color={on ? colors.orangeLight : colors.textDim} />
              <Text style={[styles.methodTxt, on && { color: colors.orangeLight }]} numberOfLines={1}>{m.name}</Text>
            </Pressable>
          );
        })}
      </View>

      {type === 'cash' && (
        <View>
          <Text style={[styles.label, styles.labelSoft]}>Получено от клиента</Text>
          <View style={styles.quick}>
            {quickAmounts(total).map((v, i) => {
              const on = !custom && (recvQuick == null ? i === 0 : recvQuick === v);
              return (
                <Pressable key={v} style={[styles.qChip, on && styles.qChipOn]}
                  onPress={() => { setCustom(false); setRecvQuick(i === 0 ? null : v); }}>
                  <Text style={[styles.qTxt, on && styles.qTxtOn]}>{i === 0 ? 'Без сдачи' : `${fmt(v)} ₽`}</Text>
                </Pressable>
              );
            })}
            <Pressable style={[styles.qChip, custom && styles.qChipOn]} onPress={() => { animate(); setCustom(true); }}>
              <Text style={[styles.qTxt, custom && styles.qTxtOn]}>Другая…</Text>
            </Pressable>
          </View>
          {custom && (
            <View style={styles.field}>
              <Text style={styles.fieldLbl}>Получено</Text>
              <TextInput
                style={styles.fieldInput} value={customVal} onChangeText={v => setCustomVal(String(digits(v) || ''))}
                keyboardType="numeric" placeholder="0" placeholderTextColor="rgba(255,255,255,0.22)" autoFocus
              />
              <Text style={styles.fieldRub}>₽</Text>
            </View>
          )}
          <View style={styles.changeRow}>
            <Text style={styles.changeLbl}>{cashOk ? 'Сдача' : 'Не хватает'}</Text>
            <Text style={[styles.changeVal, !cashOk && { color: colors.warning }, cashOk && change > 0 && { color: colors.text }]}>
              {fmt(cashOk ? change : -change)} ₽
            </Text>
          </View>
        </View>
      )}

      {type === 'mixed' && (
        <View>
          <Text style={[styles.label, styles.labelSoft]}>Как делится оплата</Text>
          <View style={[styles.field, styles.fieldFocusable]}>
            <Icon name="cash" size={20} color={colors.textDim} />
            <Text style={[styles.fieldLbl, { marginLeft: 10 }]}>Наличными</Text>
            <TextInput style={styles.fieldInput} value={mixCash} onChangeText={onMixCashChange}
              keyboardType="numeric" placeholder="0" placeholderTextColor="rgba(255,255,255,0.22)" />
            <Text style={styles.fieldRub}>₽</Text>
          </View>
          <View style={[styles.field, styles.fieldFocusable]}>
            <Icon name="card" size={20} color={colors.textDim} />
            <Text style={[styles.fieldLbl, { marginLeft: 10 }]}>Картой</Text>
            <TextInput style={styles.fieldInput} value={mixCard} onChangeText={onMixCardChange}
              keyboardType="numeric" placeholder="0" placeholderTextColor="rgba(255,255,255,0.22)" />
            <Text style={styles.fieldRub}>₽</Text>
          </View>
          <View style={styles.splitBar}>
            <View style={{ width: `${total ? Math.min(100, mc / total * 100) : 0}%`, backgroundColor: 'rgba(255,255,255,0.55)' }} />
            <View style={{ width: `${total ? Math.min(100, mk / total * 100) : 0}%`, backgroundColor: colors.orange }} />
          </View>
          <Text style={[styles.mixHint, mixOk && { color: colors.green }]}>
            {mixOk ? `Наличными ${fmt(mc)} ₽ + картой ${fmt(mk)} ₽ = ${fmt(total)} ₽`
              : mc > 0 && !mk ? 'Всю сумму наличными — выберите способ «Наличные»'
              : mk > 0 && !mc ? 'Всю сумму картой — выберите способ «Карта»'
              : 'Введите одну сумму — вторая подставится сама'}
          </Text>
          <View style={styles.quick}>
            {mixQuick.map(q => (
              <Pressable key={q.label} style={styles.qChip} onPress={() => onMixCashChange(String(q.c))}>
                <Text style={styles.qTxt}>{q.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={({ pressed }) => [styles.confirm, !canConfirm && styles.confirmOff, pressed && canConfirm && { transform: [{ scale: 0.98 }] }]}
        onPress={submit} disabled={!canConfirm} accessibilityRole="button"
      >
        <Text style={styles.confirmTxt}>Принять оплату · {fmt(total)} ₽</Text>
      </Pressable>
      <Pressable style={styles.back} onPress={close}><Text style={styles.backTxt}>Вернуться к заказу</Text></Pressable>
    </View>
  );

  const right = (
    <View style={[styles.right, isNarrow && styles.rightNarrow]}>
      <View style={styles.glowWrap} pointerEvents="none"><SoftGlow size={380} color="127,168,217" alpha={0.22} /></View>
      <Text style={styles.label}>Заказ</Text>
      <ScrollView style={styles.lines} showsVerticalScrollIndicator={false}>
        {lines.map(l => (
          <View key={l.key} style={styles.line}>
            <Text style={styles.lineName} numberOfLines={1}>{l.label}</Text>
            <Text style={styles.lineSum}>{fmt(l.sum)} ₽</Text>
          </View>
        ))}
      </ScrollView>
      {discountAmount > 0 && (
        <View style={{ marginTop: 6 }}>
          <View style={styles.line}><Text style={styles.lineName}>Сумма</Text><Text style={styles.lineSum}>{fmt(subtotal)} ₽</Text></View>
          <View style={styles.line}><Text style={styles.lineName}>{discountLabel}</Text><Text style={[styles.lineSum, { color: colors.green }]}>−{fmt(discountAmount)} ₽</Text></View>
        </View>
      )}
      <View style={styles.bigWrap}>
        <Text style={styles.bigLbl}>К оплате</Text>
        <AnimatedNumber value={total} style={styles.bigVal} />
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardSafe style={styles.root}>
        {/* Касание вне окна — закрыть (в том числе окно «Оплачено») */}
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <Animated.View style={[styles.windowWrap, isNarrow && styles.windowWrapNarrow, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }]}>
          <GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating>
            <View style={[styles.cols, isNarrow && { flexDirection: 'column' }]}>
              {left}
              {right}
            </View>

            {done && (
              <View style={styles.done}>
                <Svg width={96} height={96} viewBox="0 0 100 100">
                  <AnimatedCircle cx={50} cy={50} r={46} stroke={colors.green} strokeWidth={5} fill="none" strokeLinecap="round" strokeDasharray="290" strokeDashoffset={ringOffset} />
                  <AnimatedPath d="M30 52l14 14 27-30" stroke={colors.green} strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="70" strokeDashoffset={tickOffset} />
                </Svg>
                <Text style={styles.doneTitle}>Оплачено</Text>
                {done.change > 0 ? (
                  <>
                    <Text style={styles.doneLbl}>Сдача клиенту</Text>
                    <Text style={styles.doneBig}>{fmt(done.change)}<Text style={styles.doneRub}> ₽</Text></Text>
                    <Text style={styles.doneLine}>Оплата {fmt(done.total)} ₽ наличными</Text>
                  </>
                ) : (
                  <Text style={[styles.doneLine, styles.doneLineMain]}>
                    {done.type === 'mixed' ? `Наличными ${fmt(done.cash)} ₽ · картой ${fmt(done.card)} ₽` : `Оплата ${fmt(done.total)} ₽ принята`}
                  </Text>
                )}
                {done.notes.map((n, i) => <Text key={'n' + i} style={styles.doneNote}>{n}</Text>)}
                {done.warnings.map((w, i) => <Text key={'w' + i} style={styles.doneWarn}>{w}</Text>)}
                <Text style={styles.doneHint}>Нажмите в любом месте экрана, чтобы закрыть</Text>
              </View>
            )}
          </GlassSurface>
        </Animated.View>
      </KeyboardSafe>
    </Modal>
  );
}

const HAIR = 'rgba(255,255,255,0.08)';
const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', justifyContent: 'center', alignItems: 'center' },
  windowWrap:  { width: '64%', minWidth: 660, maxWidth: 860 },
  windowWrapNarrow: { width: '94%', minWidth: 0, maxHeight: '92%' },
  cols:        { flexDirection: 'row', borderRadius: 26, overflow: 'hidden' },

  left:        { flex: 1, minWidth: 0, padding: 24 },
  leftNarrow:  { padding: 18 },
  right:       { width: 300, padding: 24, backgroundColor: 'rgba(0,0,0,0.14)', borderLeftWidth: 1, borderLeftColor: HAIR, overflow: 'hidden' },
  rightNarrow: { width: '100%', borderLeftWidth: 0, borderTopWidth: 1, borderTopColor: HAIR, padding: 18 },
  glowWrap:    { position: 'absolute', right: -90, bottom: -130 },

  label:       { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.textDim, marginBottom: 12 },
  labelSoft:   { fontFamily: fonts.familyMedium, color: colors.muted, marginTop: 18, marginBottom: 10 },

  methods:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  method:      { flexGrow: 1, flexBasis: 96, height: 84, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 6 },
  methodOn:    { backgroundColor: 'rgba(127,168,217,0.2)', borderColor: 'rgba(157,191,230,0.55)' },
  methodTxt:   { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },

  quick:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  qChip:       { height: 38, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  qChipOn:     { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.26)' },
  qTxt:        { fontFamily: fonts.familyMedium, fontSize: 14, color: colors.muted },
  qTxtOn:      { color: colors.text },

  changeRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  changeLbl:   { fontFamily: fonts.familyMedium, fontSize: 14, color: colors.muted },
  changeVal:   { fontFamily: fonts.familySemibold, fontSize: 20, color: colors.textDim, letterSpacing: -0.2 },

  field:       { flexDirection: 'row', alignItems: 'center', height: 64, borderRadius: 16, paddingHorizontal: 20, marginTop: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  fieldFocusable: {},
  fieldLbl:    { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  fieldInput:  { flex: 1, minWidth: 0, textAlign: 'right', fontFamily: fonts.display, fontSize: 28, color: colors.text, padding: 0, letterSpacing: -0.4 },
  fieldRub:    { fontFamily: fonts.familyMedium, fontSize: 20, color: colors.orangeLight, marginLeft: 8 },
  splitBar:    { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 14, marginHorizontal: 2 },
  mixHint:     { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginVertical: 10, marginHorizontal: 2, minHeight: 18 },

  error:       { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red, marginTop: 14, lineHeight: 20 },
  confirm:     { marginTop: 18, height: 58, borderRadius: 16, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  confirmOff:  { opacity: 0.35 },
  confirmTxt:  { fontFamily: fonts.family, fontSize: 18, color: colors.onAccent },
  back:        { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  backTxt:     { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },

  lines:       { maxHeight: 230 },
  line:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  lineName:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim, flex: 1, marginRight: 10 },
  lineSum:     { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  bigWrap:     { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)' },
  bigLbl:      { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.textDim, marginBottom: 6 },
  bigVal:      { fontFamily: fonts.display, fontSize: 56, color: colors.text, letterSpacing: -2 },

  // Окно «Оплачено» — поверх обоих столбцов, не закрывается само
  done:        { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(26,33,45,0.995)', alignItems: 'center', justifyContent: 'center', borderRadius: 26, padding: 24 },
  doneTitle:   { fontFamily: fonts.familySemibold, fontSize: 24, color: colors.text, marginTop: 16 },
  doneLbl:     { fontFamily: fonts.familySemibold, fontSize: 13, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.textDim, marginTop: 22 },
  doneBig:     { fontFamily: fonts.display, fontSize: 64, color: colors.text, letterSpacing: -2.2, marginTop: 2 },
  doneRub:     { fontFamily: fonts.familyMedium, fontSize: 38, color: colors.orangeLight },
  doneLine:    { fontFamily: fonts.familyRegular, fontSize: 16, color: colors.textDim, marginTop: 10 },
  doneLineMain:{ fontFamily: fonts.familySemibold, fontSize: 20, color: colors.text },
  doneNote:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim, marginTop: 8 },
  doneWarn:    { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.warning, marginTop: 8, textAlign: 'center' },
  doneHint:    { position: 'absolute', bottom: 18, fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
});
