import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import FitView from './FitView';
import KeyboardSafe from './KeyboardSafe';
import { confirmAdminPin } from '../db/queries';
import { colors, fonts } from '../constants/theme';

// Подтверждение PIN администратора перед опасным действием (стереть всё,
// восстановить из копии, удалить сотрудника). Проверяет PIN именно того
// администратора, который сейчас вошёл. Неверные попытки считаются так же,
// как при входе, и так же приводят к блокировке — подбор через это окно
// защиту не обходит.
function formatWait(sec) {
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r ? `${m} мин ${r} с` : `${m} мин`;
}

export default function PinConfirmModal({ visible, title, message, confirmLabel = 'Подтвердить', onConfirm, onCancel }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockUntil, setLockUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (visible) { setPin(''); setError(''); setBusy(false); }
  }, [visible]);

  useEffect(() => {
    if (!lockUntil) return undefined;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lockUntil) { setLockUntil(0); setError(''); }
    }, 500);
    return () => clearInterval(id);
  }, [lockUntil]);

  const lockLeft = lockUntil ? Math.max(0, Math.ceil((lockUntil - now) / 1000)) : 0;

  const submit = () => {
    if (busy || lockLeft > 0 || pin.length < 4) return;
    setBusy(true);
    // Расчёт отпечатка занимает долю секунды — даём экрану перерисоваться
    setTimeout(() => {
      let res;
      try { res = confirmAdminPin(pin); }
      catch (e) { console.error('[Подтверждение PIN]', e); res = { ok: false, error: 'Ошибка проверки' }; }
      setBusy(false);
      setPin('');
      if (res.ok) { setError(''); onConfirm?.(); return; }
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

  const canSubmit = pin.length >= 4 && !busy && lockLeft === 0;

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardSafe style={styles.root}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onCancel} />
        <FitView style={styles.box}>
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={v => { setPin(v.replace(/\D/g, '').slice(0, 6)); setError(''); }}
            onSubmitEditing={submit}
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            autoFocus
            editable={lockLeft === 0}
            placeholder="• • • •"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.error}>
            {lockLeft > 0 ? `Слишком много попыток. Повторите через ${formatWait(lockLeft)}` : error}
          </Text>
          <View style={styles.row}>
            <Pressable style={[styles.btn, styles.btnCancel]} onPress={onCancel}>
              <Text style={styles.btnCancelTxt}>Отмена</Text>
            </Pressable>
            <Pressable style={[styles.btn, canSubmit ? styles.btnOk : styles.btnOff]} onPress={submit} disabled={!canSubmit}>
              <Text style={[styles.btnOkTxt, !canSubmit && { opacity: 0.5 }]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </FitView>
      </KeyboardSafe>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  box:     { width: '40%', minWidth: 320, maxWidth: 420, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 22 },
  title:   { fontFamily: fonts.family, fontSize: 18, color: colors.text },
  message: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 8, lineHeight: 20 },
  input:   { marginTop: 16, height: 52, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, color: colors.text, textAlign: 'center', letterSpacing: 8, fontSize: 24, fontFamily: fonts.family },
  error:   { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red, minHeight: 20, marginTop: 8, textAlign: 'center' },
  row:     { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn:     { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnCancel: { borderWidth: 1, borderColor: colors.border },
  btnCancelTxt: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.muted },
  btnOk:   { backgroundColor: colors.orange },
  btnOff:  { backgroundColor: colors.orange, opacity: 0.4 },
  btnOkTxt:{ fontFamily: fonts.family, fontSize: 16, color: '#0A121C' },
});
