import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import FitView from './FitView';
import KeyboardSafe from './KeyboardSafe';
import { validateBackupPassword, BACKUP_PASSWORD_MIN, BACKUP_PASSWORD_RULES } from '../db/backupCrypto';
import { colors, fonts } from '../constants/theme';

// Окно пароля резервной копии.
//   mode="set"   — задать пароль при сохранении копии (два поля);
//   mode="enter" — ввести пароль, чтобы открыть защищённую копию.
// onSubmit(пароль) возвращает {ok:true} или {ok:false, error}. Расчёт ключа из
// пароля занимает несколько секунд (так и задумано — это замедляет подбор),
// поэтому перед ним окно успевает показать индикатор.
export default function BackupPasswordModal({ visible, mode = 'set', title, message, onSubmit, onCancel }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) { setPw(''); setPw2(''); setShow(false); setError(''); setBusy(false); }
  }, [visible]);

  const isSet = mode === 'set';

  const submit = async () => {
    if (busy) return;
    if (isSet) {
      const v = validateBackupPassword(pw);
      if (!v.ok) { setError(v.error); return; }
      if (pw !== pw2) { setError('Пароли не совпадают'); return; }
    } else if (!pw) { setError('Введите пароль'); return; }
    setError('');
    setBusy(true);
    await new Promise(r => setTimeout(r, 80)); // даём экрану показать индикатор
    let res;
    try { res = await onSubmit(pw); }
    catch (e) { console.error('[Пароль копии]', e); res = { ok: false, error: 'Не удалось выполнить: ' + (e?.message || 'ошибка') }; }
    setBusy(false);
    if (res && res.ok === false) setError(res.error || 'Ошибка');
  };

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={busy ? () => {} : onCancel}>
      <KeyboardSafe style={styles.root}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={busy ? undefined : onCancel} />
        <FitView style={styles.box}>
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}

          <TextInput
            style={styles.input}
            value={pw}
            onChangeText={v => { setPw(v); setError(''); }}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            editable={!busy}
            placeholder={isSet ? `Пароль (не короче ${BACKUP_PASSWORD_MIN} символов)` : 'Пароль копии'}
            placeholderTextColor={colors.muted}
            onSubmitEditing={isSet ? undefined : submit}
          />
          {isSet && (
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              value={pw2}
              onChangeText={v => { setPw2(v); setError(''); }}
              secureTextEntry={!show}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              placeholder="Повторите пароль"
              placeholderTextColor={colors.muted}
              onSubmitEditing={submit}
            />
          )}
          <Pressable onPress={() => setShow(v => !v)} style={{ marginTop: 8 }} hitSlop={8}>
            <Text style={styles.showTxt}>{show ? '🙈 Скрыть пароль' : '👁 Показать пароль'}</Text>
          </Pressable>

          {isSet && <Text style={styles.rules}>{BACKUP_PASSWORD_RULES}</Text>}

          {isSet && (
            <Text style={styles.warn}>
              Запишите пароль и сохраните отдельно от файла. Если вы его забудете, открыть копию будет невозможно — восстановить пароль нельзя.
            </Text>
          )}

          <View style={styles.statusRow}>
            {busy ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator color={colors.orange} />
                <Text style={styles.busyTxt}>{isSet ? 'Шифрование… это займёт несколько секунд' : 'Проверка пароля… это займёт несколько секунд'}</Text>
              </View>
            ) : (
              <Text style={styles.error}>{error}</Text>
            )}
          </View>

          <View style={styles.row}>
            <Pressable style={[styles.btn, styles.btnCancel]} onPress={onCancel} disabled={busy}>
              <Text style={styles.btnCancelTxt}>Отмена</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnOk, busy && { opacity: 0.4 }]} onPress={submit} disabled={busy}>
              <Text style={styles.btnOkTxt}>{isSet ? 'Зашифровать' : 'Открыть'}</Text>
            </Pressable>
          </View>
        </FitView>
      </KeyboardSafe>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  box:     { width: '42%', minWidth: 340, maxWidth: 460, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 22 },
  title:   { fontFamily: fonts.family, fontSize: 18, color: colors.text },
  message: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 8, lineHeight: 20, marginBottom: 6 },
  input:   { marginTop: 12, height: 50, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, color: colors.text, paddingHorizontal: 14, fontSize: 16, fontFamily: fonts.familyRegular },
  showTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  rules:   { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, marginTop: 10, lineHeight: 20 },
  warn:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 12, lineHeight: 20 },
  statusRow: { minHeight: 28, marginTop: 10, justifyContent: 'center' },
  error:   { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red },
  busyTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, flexShrink: 1 },
  row:     { flexDirection: 'row', gap: 10, marginTop: 6 },
  btn:     { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnCancel: { borderWidth: 1, borderColor: colors.border },
  btnCancelTxt: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.muted },
  btnOk:   { backgroundColor: colors.orange },
  btnOkTxt:{ fontFamily: fonts.family, fontSize: 16, color: '#0A121C' },
});
