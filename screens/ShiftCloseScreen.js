import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Animated, Modal, Dimensions } from 'react-native';
import TopBar from '../components/TopBar';
import { getOpenShift, getShiftSummary, closeShift, getTerms, pluralizeRu, getPayMethods } from '../db/queries';
import { useToast } from '../components/Toast';
import { useFocusEffect } from '@react-navigation/native';
import { clearSession, getHomeRoute, goBackSmart } from '../db/session';
import { resetKassaCart } from '../db/cartStore';
import { colors, fonts } from '../constants/theme';

const fmt = (n) => (n || 0).toLocaleString('ru-RU');

export default function ShiftCloseScreen({ navigation }) {
  const toast = useToast();
  const [summary, setSummary]   = useState(null);
  const [factCash, setFactCash] = useState('');
  const [closed, setClosed]     = useState(false);
  const [terms, setTerms]       = useState({ order: 'Заказ' });
  const [payMethods, setPayMethods] = useState([]);

  const [showResult, setShowResult] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];

  // Анимации для модалки результата
  const overlayAnim   = useState(new Animated.Value(0))[0];
  const titleAnim     = useState(new Animated.Value(0))[0];
  const card1Anim     = useState(new Animated.Value(60))[0];
  const card2Anim     = useState(new Animated.Value(60))[0];
  const card3Anim     = useState(new Animated.Value(60))[0];
  const card4Anim     = useState(new Animated.Value(60))[0];
  const btnAnim       = useState(new Animated.Value(0))[0];

  const slideAnim= useState(new Animated.Value(20))[0];
  const btnScale = useState(new Animated.Value(1))[0];

  useFocusEffect(useCallback(() => {
    // Сбрасываем состояние при каждом открытии экрана
    setClosed(false);
    setShowResult(false);
    setFactCash('');
    try {
      const shift = getOpenShift();
      setSummary(shift ? getShiftSummary(shift.id) : null);
      setTerms(getTerms());
      setPayMethods(getPayMethods());
    } catch(e) { console.error(e); }

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
    ]).start();
  }, []));



  const showResultModal = (s) => {
    setShowResult(true);
    // Последовательная анимация
    Animated.timing(overlayAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    Animated.timing(titleAnim, { toValue: 1, duration: 600, delay: 300, useNativeDriver: true }).start();
    Animated.sequence([Animated.delay(600),  Animated.timing(card1Anim, { toValue: 0, duration: 400, useNativeDriver: true })]).start();
    Animated.sequence([Animated.delay(900),  Animated.timing(card2Anim, { toValue: 0, duration: 400, useNativeDriver: true })]).start();
    Animated.sequence([Animated.delay(1200), Animated.timing(card3Anim, { toValue: 0, duration: 400, useNativeDriver: true })]).start();
    Animated.sequence([Animated.delay(1500), Animated.timing(card4Anim, { toValue: 0, duration: 400, useNativeDriver: true })]).start();
    Animated.sequence([Animated.delay(1800), Animated.timing(btnAnim,   { toValue: 1, duration: 500, useNativeDriver: true })]).start();

  };

  const handleConfirm = () => {
    if (!summary) return;
    try {
      closeShift(summary.shift.id);
      setClosed(true);
      toast.show('Смена закрыта');
      showResultModal(summary);
      Animated.spring(btnScale, { toValue: 0.95, useNativeDriver: true }).start(() =>
        Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start()
      );
    } catch(e) { console.error(e); }
  };

  const handleFinish = () => {
    setShowResult(false);
    setClosed(false);
    resetKassaCart();
    clearSession();
    navigation.navigate('Login');
  };

  const animBtn = (to) => Animated.spring(btnScale, { toValue: to, useNativeDriver: true, tension: 200 }).start();

  const factNum = parseFloat(factCash) || 0;
  const diff    = summary ? factNum - summary.cashRemaining : 0;

  const cashLabel = payMethods.find(m => m.type === 'cash')?.name || 'Наличные';
  const cardLabel = payMethods.filter(m => m.type === 'card').map(m => m.name).join(' / ') || 'Карта';

  const { width: SW, height: SH } = Dimensions.get('window');

  const ResultModal = () => (
    <Modal visible={showResult} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
        <View style={styles.modalBox}>

          {/* Заголовок */}
          <Animated.View style={[styles.modalHeader, {
            opacity: titleAnim,
            transform: [{ scale: titleAnim }],
          }]}>
            <Text style={styles.modalTitle}>День завершён</Text>
            <Text style={styles.modalDate}>{new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
          </Animated.View>

          {/* Карточки статистики */}
          <View style={styles.modalGrid}>

            <Animated.View style={[styles.modalCard, styles.modalCardOrange, { transform: [{ translateY: card1Anim }] }]}>
              <Text style={styles.modalCardLabel}>Выручка</Text>
              <Text style={[styles.modalCardVal, { color: colors.orange }]}>{fmt(summary?.total || 0)} ₽</Text>
              {summary.cash > 0 && <Text style={styles.modalCardSub}>Нал: {fmt(summary.cash)} ₽</Text>}
              {summary.card > 0 && <Text style={styles.modalCardSub}>Карта: {fmt(summary.card)} ₽</Text>}
            </Animated.View>

            <Animated.View style={[styles.modalCard, { transform: [{ translateY: card2Anim }] }]}>
              <Text style={styles.modalCardLabel}>Заказов</Text>
              <Text style={styles.modalCardVal}>{summary?.orders || 0}</Text>
              <Text style={styles.modalCardSub}>
                Ср. чек: {summary.orders > 0 ? Math.round((summary.total || 0) / summary.orders).toLocaleString('ru-RU') : 0} ₽
              </Text>
            </Animated.View>

            <Animated.View style={[styles.modalCard, { transform: [{ translateY: card3Anim }] }]}>
              <Text style={styles.modalCardLabel}>Расходы</Text>
              <Text style={[styles.modalCardVal, { color: colors.red }]}>{fmt(summary?.expTotal || 0)} ₽</Text>
              <Text style={styles.modalCardSub}>
                {Object.keys(summary.expByCategory || {}).length} категор.
              </Text>
            </Animated.View>

            <Animated.View style={[styles.modalCard, { transform: [{ translateY: card4Anim }] }]}>
              <Text style={styles.modalCardLabel}>Прибыль</Text>
              <Text style={[styles.modalCardVal, { color: ((summary?.total||0)-(summary?.expTotal||0)) >= 0 ? colors.green : colors.red }]}>
                {((summary?.total||0)-(summary?.expTotal||0)) >= 0 ? '+' : ''}{fmt((summary?.total||0)-(summary?.expTotal||0))} ₽
              </Text>
              <Text style={styles.modalCardSub}>Выручка минус расходы</Text>
            </Animated.View>

          </View>

          {/* Кнопка */}
          <Animated.View style={{ opacity: btnAnim, transform: [{ translateY: btnAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
            <Pressable style={styles.modalBtn} onPress={handleFinish}>
              <Text style={styles.modalBtnTxt}>Завершить и выйти</Text>
              <Text style={styles.modalBtnSub}>До следующего рабочего дня!</Text>
            </Pressable>
          </Animated.View>

        </View>
      </Animated.View>
    </Modal>
  );

  if (!summary) return (
    <View style={styles.root}>
      <TopBar title="Закрытие смены" onBack={() => goBackSmart(navigation)} />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
        <Text style={styles.emptyTitle}>Смена не открыта</Text>
        <Text style={styles.emptyText}>Нечего закрывать — сначала откройте смену на главном экране.</Text>
        <Pressable style={styles.backBtn} onPress={() => goBackSmart(navigation)}>
          <Text style={styles.backBtnTxt}>Вернуться назад</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <ResultModal />
      <TopBar title="Конец рабочего дня" onBack={() => goBackSmart(navigation)} />
      <ScrollView contentContainerStyle={styles.inner}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* Сотрудник */}
          {summary.employeeName ? (
            <Text style={styles.employee}>{summary.employeeName}</Text>
          ) : null}

          {/* Итоги продаж */}
          <Text style={styles.sectionLabel}>Итоги смены</Text>
          <View style={styles.card}>
            {[
              summary.cash > 0 && { label: cashLabel, value: `${fmt(summary.cash)} ₽` },
              summary.card > 0 && { label: cardLabel, value: `${fmt(summary.card)} ₽` },
            ].filter(Boolean).map((r, i, arr) => (
              <View key={r.label} style={[styles.row, i < arr.length - 1 && styles.rowDiv]}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowVal}>{r.value}</Text>
              </View>
            ))}
            <View style={[styles.row, styles.totalRow]}>
              <Text style={styles.totalLabel}>
                Итого · {summary.orders} {summary.orders === 1 ? terms.order?.toLowerCase() : pluralizeRu(terms.order)?.toLowerCase()}
              </Text>
              <Text style={styles.totalVal}>{fmt(summary.total)} ₽</Text>
            </View>
          </View>

          {/* Расходы */}
          {Object.keys(summary.expByCategory || {}).length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Расходы за день</Text>
              <View style={styles.card}>
                {Object.entries(summary.expByCategory).map(([cat, sum], i, arr) => (
                  <View key={cat} style={[styles.row, i < arr.length - 1 && styles.rowDiv]}>
                    <Text style={styles.rowLabel}>{cat}</Text>
                    <Text style={[styles.rowVal, { color: colors.red }]}>{fmt(sum)} ₽</Text>
                  </View>
                ))}
                <View style={[styles.row, styles.totalRow]}>
                  <Text style={styles.totalLabel}>Расходы итого</Text>
                  <Text style={[styles.totalVal, { color: colors.red }]}>{fmt(summary.expTotal)} ₽</Text>
                </View>
              </View>
            </>
          )}

          {/* Сверка наличных */}
          {!closed && (
            <>
              <Text style={styles.sectionLabel}>Сверка наличных</Text>
              <View style={styles.card}>
                {[
                  { label: 'Было в начале смены', value: `${fmt(summary.openingCash)} ₽` },
                  { label: '+ Принято наличными', value: `${fmt(summary.cash)} ₽` },
                ].map((r, i) => (
                  <View key={r.label} style={[styles.row, styles.rowDiv]}>
                    <Text style={styles.rowLabel}>{r.label}</Text>
                    <Text style={styles.rowVal}>{r.value}</Text>
                  </View>
                ))}
                <View style={[styles.row, { borderBottomWidth: 0 }]}>
                  <Text style={[styles.totalLabel, { color: colors.orange }]}>Должно быть в кассе</Text>
                  <Text style={[styles.totalVal, { color: colors.orange }]}>{fmt(summary.cashRemaining)} ₽</Text>
                </View>
              </View>

              <Text style={styles.sectionLabel}>Фактический остаток</Text>
              <Text style={styles.sectionHint}>
                Пересчитайте купюры и введите сумму — система покажет расхождение
              </Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.cashInput}
                  color={colors.text}
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  value={factCash}
                  onChangeText={setFactCash}
                />
                <Text style={styles.currency}>₽</Text>
              </View>

              {factCash !== '' && (
                <Animated.View style={[
                  styles.diffBox,
                  diff === 0
                    ? { borderColor: 'rgba(123,175,142,0.4)', backgroundColor: 'rgba(123,175,142,0.08)' }
                    : { borderColor: 'rgba(217,95,95,0.4)', backgroundColor: 'rgba(217,95,95,0.08)' }
                ]}>
                  <Text style={[styles.diffTxt, { color: diff === 0 ? colors.green : colors.red }]}>
                    {diff === 0
                      ? 'Касса сходится — всё верно'
                      : diff > 0
                        ? `Излишек +${fmt(diff)} ₽ — в кассе больше ожидаемого`
                        : `Недостача ${fmt(diff)} ₽ — в кассе меньше ожидаемого`}
                  </Text>
                </Animated.View>
              )}

              <Text style={styles.sectionHint} />

              <Animated.View style={{ transform: [{ scale: btnScale }] }}>
                <Pressable
                  style={styles.closeBtn}
                  onPressIn={() => animBtn(0.97)}
                  onPressOut={() => animBtn(1)}
                  onPress={handleConfirm}
                >
                  <Text style={styles.closeBtnTxt}>Закрыть смену</Text>
                  <Text style={styles.closeBtnSub}>Данные будут сохранены в отчёт</Text>
                </Pressable>
              </Animated.View>
            </>
          )}

          {/* Успешно закрыто */}
          {closed && (
            <Animated.View style={[styles.closedCard, { opacity: fadeAnim }]}>
              <Text style={styles.closedTitle}>Смена закрыта</Text>
              <Text style={styles.closedSub}>Данные сохранены. Хорошего отдыха!</Text>
              <Pressable style={styles.logoutBtn} onPress={handleFinish}>
                <Text style={styles.logoutBtnTxt}>Выйти из аккаунта</Text>
              </Pressable>
            </Animated.View>
          )}

        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: colors.bg },
  inner:      { padding: 24, paddingBottom: 60, maxWidth: 680, width: '100%', alignSelf: 'center' },

  employee:   { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.textDim, textAlign: 'center', marginBottom: 20 },

  sectionLabel:{ fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 20 },
  sectionHint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginBottom: 10, lineHeight: 17 },

  card:       { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  rowDiv:     { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel:   { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim },
  rowVal:     { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  totalRow:   { borderTopWidth: 1, borderTopColor: colors.borderHi },
  totalLabel: { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: colors.text },
  totalVal:   { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: colors.text },

  inputWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 20, marginBottom: 12 },
  cashInput:  { flex: 1, paddingVertical: 18, fontSize: 32, fontFamily: fonts.family, fontWeight: '800', color: colors.text, textAlign: 'center' },
  currency:   { fontFamily: fonts.familySemibold, fontSize: 22, color: colors.muted },

  diffBox:    { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  diffTxt:    { fontFamily: fonts.familySemibold, fontSize: 13, textAlign: 'center', lineHeight: 19 },

  closeBtn:   { backgroundColor: colors.orange, borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  closeBtnTxt:{ fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: '#fff' },
  closeBtnSub:{ fontFamily: fonts.familyRegular, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3 },

  closedCard: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 32, alignItems: 'center', marginTop: 20 },
  closedTitle:{ fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.green, marginBottom: 8 },
  closedSub:  { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginBottom: 24 },
  logoutBtn:  { backgroundColor: colors.surface2, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 32, borderWidth: 1, borderColor: colors.border },
  logoutBtnTxt:{ fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },

  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox:     { width: '100%', maxWidth: 700, backgroundColor: colors.surface, borderRadius: 28, borderWidth: 1, borderColor: colors.border, padding: 32, gap: 24 },
  modalHeader:  { alignItems: 'center' },
  modalTitle:   { fontFamily: fonts.family, fontSize: 34, fontWeight: '800', color: colors.text, marginBottom: 6 },
  modalDate:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted },
  modalGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  modalCard:    { flex: 1, minWidth: '45%', backgroundColor: colors.surface2, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 20 },
  modalCardOrange: { borderColor: 'rgba(240,160,80,0.3)', backgroundColor: 'rgba(240,160,80,0.07)' },
  modalCardLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  modalCardVal:  { fontFamily: fonts.family, fontSize: 32, fontWeight: '800', color: colors.text, marginBottom: 6 },
  modalCardSub:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  modalBtn:     { backgroundColor: colors.orange, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  modalBtnTxt:  { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: '#fff' },
  modalBtnSub:  { fontFamily: fonts.familyRegular, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3 },
  emptyTitle: { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 8, textAlign: 'center' },
  emptyText:  { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  backBtn:    { backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 28, borderWidth: 1, borderColor: colors.border },
  backBtnTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
});
