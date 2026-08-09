import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRef } from 'react';
import { getUserByPin, getBusinessProfile, getUserPermissions } from '../db/queries';
import { setSession, setPermissions } from '../db/session';
import { colors, fonts } from '../constants/theme';

const PIN_LENGTH = 4;

export default function LoginScreen({ navigation, route }) {
  const navTo = route?.params?.navTo;
  const navParams = route?.params?.navParams;
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const inputRef = useRef(null);

  const businessName = (() => {
    try { return getBusinessProfile()?.business_name || 'СТРУКТУРА'; } catch { return 'СТРУКТУРА'; }
  })();

  const handlePress = (val) => {
    if (val === '⌫') {
      setPin(p => p.slice(0, -1));
      setError('');
      return;
    }
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + val;
    setPin(next);
    setError('');

    if (next.length === PIN_LENGTH) {
      setTimeout(() => tryLogin(next), 120);
    }
  };

  const tryLogin = (code) => {
    const user = getUserByPin(code);
    if (!user) {
      setError('Неверный PIN-код');
      setPin('');
      return;
    }
    setSession(user);
    setPermissions(user.role === 'admin' ? null : getUserPermissions(user.id));
    const home = user.role === 'admin' ? 'Admin' : 'Dashboard';
    if (navTo && navTo !== home) {
      navigation.reset({ index: 1, routes: [{ name: home }, { name: navTo, params: navParams }] });
    } else {
      navigation.navigate(home);
    }
  };

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', '⌫'],
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
          const digits = v.replace(/\D/g, '').slice(0, PIN_LENGTH);
          setPin(digits);
          setError('');
          if (digits.length === PIN_LENGTH) {
            setTimeout(() => tryLogin(digits), 120);
          }
        }}
        keyboardType="number-pad"
        maxLength={PIN_LENGTH}
        autoFocus
        caretHidden
      />

      {/* Шапка */}
      <View style={styles.header}>
        <Text style={styles.bizName}>{businessName}</Text>
        <Text style={styles.prompt}>Введите PIN-код для входа</Text>
      </View>

      {/* Индикатор точек */}
      <View style={styles.dotsRow}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
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
      <Text style={styles.errorTxt}>{error}</Text>

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
                    pressed && styles.keyPressed,
                  ]}
                  onPress={() => handlePress(k)}
                >
                  <Text style={[styles.keyTxt, k === '⌫' && styles.keyBackTxt]}>
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
        PIN-код назначает администратор в разделе Сотрудники
      </Text>

    </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const KEY_SIZE = 80;

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  header:    { alignItems: 'center', marginBottom: 48 },
  bizName:   { fontFamily: fonts.family, fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: 0.5 },
  prompt:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 8 },

  dotsRow:   { flexDirection: 'row', gap: 18, marginBottom: 12 },
  dot:       { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.border, backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: colors.orange, borderColor: colors.orange },
  dotError:  { borderColor: colors.red, backgroundColor: colors.red },

  errorTxt:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.red, height: 20, marginBottom: 32, textAlign: 'center' },

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
  keyTxt:    { fontFamily: fonts.family, fontSize: 26, fontWeight: '700', color: colors.text },
  keyBackTxt:{ fontSize: 22, color: colors.muted },

  hint:      { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', maxWidth: 280, lineHeight: 18 },
  hiddenInput: { position: 'absolute', width: 0, height: 0, opacity: 0 },
});
