import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Animated, KeyboardAvoidingView, Platform } from 'react-native';
import { openShift, getOpenShift } from '../db/queries';
import { getSession } from '../db/session';
import { colors, fonts } from '../constants/theme';

export default function ShiftScreen({ navigation, route }) {
  const [cash, setCash]   = useState('');
  const [error, setError] = useState('');
  const inputRef          = useRef(null);

  const fadeAnim  = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(32))[0];
  const btnScale  = useState(new Animated.Value(1))[0];
  const inputScale= useState(new Animated.Value(1))[0];

  const today   = new Date();
  const dateStr = today.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = today.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    try {
      if (getOpenShift()) {
        const returnTo = route?.params?.returnTo;
        if (returnTo) { navigation.replace(returnTo); return; }
        const user = getSession();
        navigation.replace(user?.role === 'admin' ? 'Admin' : 'Dashboard');
        return;
      }
    } catch(e) {}
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
    ]).start(() => setTimeout(() => inputRef.current?.focus(), 100));
  }, []);

  const handleOpen = () => {
    try {
      const user = getSession();
      openShift(parseFloat(cash) || 0, user?.id || null, user?.name || '');
      const returnTo = route?.params?.returnTo;
      if (returnTo) navigation.navigate(returnTo);
      else navigation.navigate(user?.role === 'admin' ? 'Admin' : 'Dashboard');
    } catch(e) { setError('Не удалось открыть смену: ' + e.message); }
  };

  const handleSkip = () => {
    const returnTo = route?.params?.returnTo;
    if (returnTo) { navigation.navigate(returnTo); return; }
    const user = getSession();
    navigation.navigate(user?.role === 'admin' ? 'Admin' : 'Dashboard');
  };

  const animBtn   = (to) => Animated.spring(btnScale,   { toValue: to, useNativeDriver: true, tension: 200 }).start();
  const animInput = (to) => Animated.spring(inputScale, { toValue: to, useNativeDriver: true, tension: 150 }).start();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.root}>
      <Pressable style={{ flex: 1 }} onPress={() => inputRef.current?.focus()}>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          <View style={styles.dateBlock}>
            <Text style={styles.timeStr}>{timeStr}</Text>
            <Text style={styles.dateStr}>{dateStr}</Text>
          </View>

          <Text style={styles.title}>Начало рабочего дня</Text>
          <Text style={styles.subtitle}>
            Введите остаток наличных в кассе — это поможет свести кассу в конце смены
          </Text>

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Наличные в кассе</Text>
            <Animated.View style={[styles.inputWrap, { transform: [{ scale: inputScale }] }]}>
              <TextInput
                ref={inputRef}
                style={styles.cashInput}
                color={colors.text}
                placeholder="0"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                value={cash}
                onChangeText={v => { setCash(v); setError(''); }}
                onFocus={() => animInput(1.02)}
                onBlur={() => animInput(1)}
                returnKeyType="done"
                onSubmitEditing={handleOpen}
              />
              <Text style={styles.currency}>₽</Text>
            </Animated.View>
            <Text style={styles.inputHint}>
              Пересчитайте купюры и введите сумму. Если не знаете точно — оставьте 0.
            </Text>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTxt}>{error}</Text>
            </View>
          ) : null}

          <Animated.View style={{ transform: [{ scale: btnScale }] }}>
            <Pressable
              style={styles.startBtn}
              onPressIn={() => animBtn(0.97)}
              onPressOut={() => animBtn(1)}
              onPress={handleOpen}
            >
              <Text style={styles.startBtnTxt}>Начать рабочий день</Text>
              <Text style={styles.startBtnSub}>Все продажи будут записаны в эту смену</Text>
            </Pressable>
          </Animated.View>

          <Pressable style={styles.skipBtn} onPress={handleSkip}>
            <Text style={styles.skipTxt}>Войти без открытия смены</Text>
          </Pressable>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Что такое смена?</Text>
            <Text style={styles.infoText}>
              Смена — один рабочий период. В течение смены записываются продажи, расходы и действия сотрудников. В конце смены вы получите итоговый отчёт: выручка, средний чек, способы оплаты.
            </Text>
          </View>

        </Animated.View>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: colors.bg },
  content:     { flex: 1, paddingHorizontal: 32, paddingTop: 48, paddingBottom: 32, maxWidth: 560, width: '100%', alignSelf: 'center' },
  dateBlock:   { alignItems: 'center', marginBottom: 32 },
  timeStr:     { fontFamily: fonts.family, fontSize: 48, fontWeight: '800', color: colors.text, letterSpacing: -1 },
  dateStr:     { fontFamily: fonts.familyRegular, fontSize: 15, color: colors.muted, marginTop: 4, textTransform: 'capitalize' },
  title:       { fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 8 },
  subtitle:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, lineHeight: 21, marginBottom: 28 },
  inputSection:{ marginBottom: 24 },
  inputLabel:  { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 },
  inputWrap:   { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 20 },
  cashInput:   { flex: 1, paddingVertical: 20, fontSize: 36, fontFamily: fonts.family, fontWeight: '800', color: colors.text, textAlign: 'center' },
  currency:    { fontFamily: fonts.familySemibold, fontSize: 24, color: colors.muted },
  inputHint:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 17 },
  errorBox:    { marginBottom: 16, padding: 14, backgroundColor: 'rgba(217,95,95,0.1)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(217,95,95,0.3)' },
  errorTxt:    { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.red, textAlign: 'center' },
  startBtn:    { backgroundColor: colors.orange, borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginBottom: 12 },
  startBtnTxt: { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: '#fff' },
  startBtnSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3 },
  skipBtn:     { paddingVertical: 14, alignItems: 'center', marginBottom: 28 },
  skipTxt:     { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  infoCard:    { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 18 },
  infoTitle:   { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginBottom: 8 },
  infoText:    { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, lineHeight: 20 },
});
