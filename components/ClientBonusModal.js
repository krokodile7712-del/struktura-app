import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, TextInput, StyleSheet } from 'react-native';
import KeyboardSafe from './KeyboardSafe';
import GlassSurface from './GlassSurface';
import GlassButton from './GlassButton';
import Icon from './Icon';
import { colors, fonts } from '../constants/theme';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
const MAX = 1000000;

/**
 * Ручное начисление баллов (или визитов — при модели «абонемент»): сумма с «−/+» и быстрыми значениями,
 * подсказка «Было → станет», подтверждение. Props: visible, client, model ('points' | 'subscription'),
 * onConfirm(amount) → { ok, message }, onClose.
 */
export default function ClientBonusModal({ visible, client, model, onConfirm, onClose }) {
  const [val, setVal] = useState('');
  const [error, setError] = useState('');
  const isVisits = model === 'subscription';
  const unit = isVisits ? 'визитов' : 'баллов';
  const quick = isVisits ? [1, 5, 10] : [50, 100, 500];

  useEffect(() => { if (visible) { setVal(''); setError(''); } }, [visible, client?.id]);

  const n = parseInt(String(val).replace(/\D/g, ''), 10) || 0;
  const cur = Math.round(client?.balance || 0);
  const valid = n >= 1 && n <= MAX;
  const add = (d) => { setError(''); setVal(String(Math.min(MAX, Math.max(0, n + d)) || '')); };

  const submit = () => {
    if (!valid) return;
    let res;
    try { res = onConfirm(n); } catch (e) { console.error('[ClientBonusModal]', e); res = { ok: false, message: 'Не удалось начислить. Попробуйте ещё раз.' }; }
    if (res && res.ok) onClose && onClose();
    else setError((res && res.message) || 'Не удалось начислить. Попробуйте ещё раз.');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardSafe style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.wrap}>
          <GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating padding={24}>
            <Text style={styles.title}>{isVisits ? 'Добавить визиты' : 'Начислить баллы'}</Text>
            <Text style={styles.sub} numberOfLines={1}>{client?.fio}</Text>

            <View style={styles.fld}>
              <TextInput
                style={styles.input} value={val} onChangeText={v => { setError(''); setVal(String(v).replace(/\D/g, '').slice(0, 7)); }}
                keyboardType="number-pad" placeholder="0" placeholderTextColor="rgba(255,255,255,0.22)" autoFocus
              />
              <Text style={styles.unit}>{unit}</Text>
              <Pressable style={styles.step} onPress={() => add(-1)} hitSlop={6}><Icon name="minus" size={18} color={colors.textDim} /></Pressable>
              <Pressable style={styles.step} onPress={() => add(1)} hitSlop={6}><Icon name="plus" size={18} color={colors.textDim} /></Pressable>
            </View>
            <View style={styles.qd}>
              {quick.map(q => (
                <Pressable key={q} style={styles.chip} onPress={() => add(q)}><Text style={styles.chipTxt}>+{q}</Text></Pressable>
              ))}
            </View>

            <Text style={styles.delta}>
              Было <Text style={styles.deltaB}>{fmt(cur)}</Text> → станет <Text style={styles.deltaB}>{fmt(cur + n)}</Text>
              {n > 0 ? ` (+${fmt(n)})` : ''}
            </Text>
            {!!error && <Text style={styles.err}>{error}</Text>}

            <View style={styles.row}>
              <GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={onClose} />
              <GlassButton style={{ flex: 1 }} tone="accent" label={valid ? `Начислить ${fmt(n)}` : 'Начислить'} height={54} disabled={!valid} onPress={submit} />
            </View>
          </GlassSurface>
        </View>
      </KeyboardSafe>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', alignItems: 'center', justifyContent: 'center' },
  wrap: { width: '44%', minWidth: 440, maxWidth: 520 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text, letterSpacing: -0.2 },
  sub: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 2, marginBottom: 18 },
  fld: { flexDirection: 'row', alignItems: 'center', height: 72, borderRadius: 18, paddingHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(157,191,230,0.45)' },
  input: { flex: 1, minWidth: 0, padding: 0, textAlign: 'right', fontFamily: fonts.display, fontSize: 34, color: colors.text, letterSpacing: -0.6 },
  unit: { fontFamily: fonts.familyMedium, fontSize: 16, color: colors.orangeLight, marginHorizontal: 10 },
  step: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  qd: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 6 },
  chip: { height: 36, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  chipTxt: { fontFamily: fonts.familyMedium, fontSize: 14, color: colors.muted },
  delta: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 10, marginBottom: 6 },
  deltaB: { fontFamily: fonts.familySemibold, color: colors.text },
  err: { fontFamily: fonts.familyMedium, fontSize: 13, color: colors.red, marginTop: 4 },
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
