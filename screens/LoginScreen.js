import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRef } from 'react';
import { attemptLogin, getLoginLock, getBusinessProfile, getUserPermissions } from '../db/queries';
import { setSession, setPermissions } from '../db/session';
import { colors, fonts } from '../constants/theme';

// PIN — от 4 до 6 цифр (то же, что допускают формы создания сотрудника).
// Раньше экран принимал ровно 4 цифры и сам проверял на четвёртой, поэтому
// PIN из 5–6 цифр (формы это разрешали) войти не позволял. Теперь вход —
// кнопкой ✓ (или автоматически на шестой цифре).
const PIN_MIN = 4;
const PIN_MAX = 6;

function formatWait(sec) {
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r ? `${m} мин ${r} с` : `${m} мин`;
}

// embedded + onUnlocked — режим экрана блокировки (поверх приложения, см. LockGuard):
// при успехе экран не переходит никуда, а сообщает, кто вошёл.
export default function LoginScreen({ navigation, route, embedded = false, onUnlocked }) {
  const navTo = route?.params?.navTo;
  const navParams = route?.params?.navParams;
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Блокировка подбора: после серии неверных PIN вход закрыт на время.
  // Состояние хранится в базе (переживает перезапуск приложения).
  const [lockUntil, setLockUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef(null);

  const businessName = (() => {
    try { return getBusinessProfile()?.business_name || 'СТРУКТУРА'; } catch { return 'СТРУКТУРА'; }
  })();

  useEffect(() => {
    try {
      const l = getLoginLock();
      if (l.locked) { setLockUntil(Date.now() + l.remainingMs); setNow(Date.now()); }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!lockUntil) return undefined;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lockUntil) { setLockUntil(0); setError(''); }
    }, 500);
    return () => clearInterval(id);
  }, [lockUntil]);

  const lockLeftSec = lockUntil ? Math.max(0, Math.ceil((lockUntil - now) / 1000)) : 0;
  const locked = lockLeftSec > 0;

  const submit = (code) => {
    if (busy || locked || code.length < PIN_MIN) return;
    setBusy(true);
    // Расчёт отпечатка занимает долю секунды — даём экрану успеть перерисоваться
    setTimeout(() => {
      let res;
      try { res = attemptLogin(code); }
      catch (e) { console.error('[Вход]', e); res = { ok: false, error: 'Ошибка входа' }; }
      setBusy(false);
      if (res.ok) {
        const user = res.user;
        if (onUnlocked) { onUnlocked(user); return; }
        setSession(user);
        setPermissions(user.role === 'admin' ? null : getUserPermissions(user.id));
        const home = user.role === 'admin' ? 'Admin' : 'Dashboard';
        if (navTo && navTo !== home) {
          navigation.reset({ index: 1, routes: [{ name: home }, { name: navTo, params: navParams }] });
        } else {
          navigation.navigate(home);
        }
        return;
      }
      setPin('');
      if (res.locked) {
        setLockUntil(Date.now() + res.remainingMs);
        setNow(Date.now());
        setError('');
      } else {
        setError(res.attemptsLeft != null && res.attemptsLeft <= 3
          ? `${res.error}. Осталось попыток: ${res.attemptsLeft}`
          : (res.error || 'Неверный PIN-код'));
      }
    }, 60);
  };

  const handlePress = (val) => {
    if (busy || locked) return;
    if (val === '⌫') {
      setPin(p => p.slice(0, -1));
      setError('');
      return;
    }
    if (val === '✓') { submit(pin); return; }
    if (pin.length >= PIN_MAX) return;
    const next = pin + val;
    setPin(next);
    setError('');
    if (next.length === PIN_MAX) submit(next);
  };

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['✓', '0', '⌫'],
  ];

  return (
    <TouchableWithoutFeedback onPress={() => inputRef.current?.focus()}>
    <SafeAreaView style={styles.root}>
      {/* Скрытый ввод для клавиатуры */}
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={pin}
        onChangeText={v => {
          if (busy || locked) return;
          const digits = v.replace(/\D/g, '').slice(0, PIN_MAX);
          setPin(digits);
          setError('');
          if (digits.length === PIN_MAX) submit(digits);
        }}
        onSubmitEditing={() => submit(pin)}
        keyboardType="number-pad"
        maxLength={PIN_MAX}
        autoFocus
        caretHidden
      />

      {/* Шапка */}
      <View style={styles.header}>
        <Text style={styles.bizName}>{businessName}</Text>
        <Text style={styles.prompt}>{embedded ? 'Экран заблокирован. Введите PIN-код' : 'Введите PIN-код для входа'}</Text>
      </View>

      {/* Индикатор точек */}
      <View style={styles.dotsRow}>
        {Array.from({ length: Math.max(PIN_MIN, pin.length) }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < pin.length && styles.dotFilled,
              error && styles.dotError,
            ]}
          />
        ))}
      </View>

      {/* Ошибка */}
      <Text style={styles.errorTxt}>
        {locked ? `Слишком много попыток. Повторите через ${formatWait(lockLeftSec)}` : error}
      </Text>

      {/* Цифровой пад */}
      <View style={styles.pad}>
        {keys.map((row, ri) => (
          <View key={ri} style={styles.padRow}>
            {row.map((k, ki) => (
              k === '' ? (
                <View key={ki} style={styles.keyEmpty} />
              ) : (
                <Pressable
                  key={ki}
                  style={({ pressed }) => [
                    styles.key,
                    k === '⌫' && styles.keyBack,
                    k === '✓' && (pin.length >= PIN_MIN && !busy && !locked ? styles.keyEnter : styles.keyEnterOff),
                    pressed && styles.keyPressed,
                  ]}
                  onPress={() => handlePress(k)}
                >
                  <Text style={[styles.keyTxt, k === '⌫' && styles.keyBackTxt, k === '✓' && styles.keyEnterTxt]}>
                    {k}
                  </Text>
                </Pressable>
              )
            ))}
          </View>
        ))}
      </View>

      {/* Подсказка */}
      <Text style={styles.hint}>
        PIN-код — от 4 до 6 цифр. Назначает администратор в разделе «Сотрудники».
      </Text>

    </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const KEY_SIZE = 80;

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  header:    { alignItems: 'center', marginBottom: 48 },
  bizName:   { fontFamily: fonts.family, fontSize: 28, color: colors.text, letterSpacing: 0.5 },
  prompt:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 8 },

  dotsRow:   { flexDirection: 'row', gap: 18, marginBottom: 12 },
  dot:       { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.border, backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: colors.orange, borderColor: colors.orange },
  dotError:  { borderColor: colors.red, backgroundColor: colors.red },

  errorTxt:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red, height: 20, marginBottom: 32, textAlign: 'center' },

  pad:       { gap: 12, marginBottom: 32 },
  padRow:    { flexDirection: 'row', gap: 12 },

  key:       {
    width: KEY_SIZE, height: KEY_SIZE, borderRadius: KEY_SIZE / 2,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  keyPressed:{ backgroundColor: colors.surface2, transform: [{ scale: 0.94 }] },
  keyBack:   { backgroundColor: 'transparent', borderColor: 'transparent' },
  keyEmpty:  { width: KEY_SIZE, height: KEY_SIZE },
  keyTxt:    { fontFamily: fonts.family, fontSize: 28, color: colors.text },
  keyBackTxt:{ fontSize: 24, color: colors.muted },
  keyEnter:  { backgroundColor: colors.orange, borderColor: colors.orange },
  keyEnterOff:{ backgroundColor: 'transparent', borderColor: 'transparent' },
  keyEnterTxt:{ fontSize: 28, color: '#0A121C' },

  hint:      { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', maxWidth: 280, lineHeight: 18 },
  hiddenInput: { position: 'absolute', width: 0, height: 0, opacity: 0 },
});
