import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Alert } from 'react-native';
import { colors, fonts } from '../constants/theme';
import DateTimeField from './DateTimeField';
import { useToast } from './Toast';
import { createManualShift, getTransferableOrders } from '../db/queries';
import { getCurrentLocationId } from '../db/session';

const hoursBetween = (a, b) => Math.round((b - a) / 3600000 * 10) / 10;

// Смена, которую сотрудник отработал, но не открывал в приложении. Раскрывается в детализации
// сотрудника. После создания вызывает onCreated(id, найденоЗаказов): экран открывает смену
// на вкладке переноса заказов, если в её время есть продажи, записанные на другие смены.
export default function AddShiftBox({ employee, onCreated, onCancel }) {
  const toast = useToast();
  // По умолчанию — сегодня с 09:00 на 8 часов, но не дальше «сейчас»; до девяти утра — вчерашний день
  const now0 = new Date();
  const base = new Date(); base.setHours(9, 0, 0, 0);
  if (base > now0) base.setDate(base.getDate() - 1);
  const [opened, setOpened] = useState(base);
  const [closed, setClosed] = useState(new Date(Math.min(base.getTime() + 8 * 3600000, now0.getTime())));
  const [stillOpen, setStillOpen] = useState(false);
  const [reason, setReason] = useState('');

  const hours = stillOpen ? null : hoursBetween(opened, closed);

  const create = () => {
    if (!stillOpen && closed <= opened) { Alert.alert('Проверьте время', 'Смена не может закончиться раньше, чем началась.'); return; }
    if (opened > new Date()) { Alert.alert('Проверьте время', 'Начало смены в будущем. Задним числом можно завести только уже прошедшую смену.'); return; }
    if (!stillOpen && closed > new Date()) { Alert.alert('Проверьте время', 'Время закрытия ещё не наступило. Если смена идёт, отметьте «Смена ещё идёт».'); return; }
    const doCreate = () => {
      try {
        const id = createManualShift(
          employee.id, employee.name, opened.toISOString(), stillOpen ? null : closed.toISOString(),
          getCurrentLocationId() || null, reason.trim() || 'Смена создана задним числом'
        );
        let found = 0;
        try { found = getTransferableOrders(id).length; } catch (_) {}
        toast.show(found > 0 ? `Смена создана. Найдено заказов из других смен: ${found}` : 'Смена создана');
        onCreated?.(id, found);
      } catch (e) { console.error(e); toast.show('Не удалось создать смену', 'warn'); }
    };
    if (hours !== null && hours > 24) {
      Alert.alert('Очень длинная смена', `Получается ${hours} ч. Всё верно?`, [{ text: 'Проверить', style: 'cancel' }, { text: 'Создать', onPress: doCreate }]);
    } else doCreate();
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Смена задним числом · {employee.name}</Text>
      <Text style={styles.hint}>Для случая, когда человек работал, но смену в приложении не открывал.</Text>

      <DateTimeField label="Открыта" value={opened} onChange={setOpened} />
      <DateTimeField label="Закрыта" value={closed} onChange={setClosed} disabled={stillOpen} />
      <Pressable style={styles.checkRow} onPress={() => setStillOpen(v => !v)}>
        <View style={[styles.check, stillOpen && styles.checkOn]}>{stillOpen && <Text style={styles.checkMark}>✓</Text>}</View>
        <Text style={styles.checkTxt}>Смена ещё идёт (не закрывать)</Text>
      </Pressable>
      {hours !== null && <Text style={styles.preview}>Получается {hours} ч</Text>}

      <Text style={styles.label}>Причина</Text>
      <TextInput
        style={styles.input} color={colors.text} multiline
        value={reason} onChangeText={setReason}
        placeholder="Например: работала, но не отметилась" placeholderTextColor={colors.muted}
      />

      <View style={styles.btns}>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={onCancel}><Text style={styles.btnGhostTxt}>Отмена</Text></Pressable>
        <Pressable style={[styles.btn, styles.btnMain]} onPress={create}><Text style={styles.btnMainTxt}>Создать смену</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surface3, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginTop: 12 },
  title: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  hint: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: 4 },
  label: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, marginTop: 14, marginBottom: 6 },
  preview: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange, marginTop: 10 },
  input: { minHeight: 44, backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, paddingHorizontal: 14, fontFamily: fonts.familyRegular, fontSize: 16, color: colors.text },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  checkMark: { color: '#fff', fontSize: 14, fontFamily: fonts.familySemibold },
  checkTxt: { fontFamily: fonts.familyRegular, fontSize: 15, color: colors.text },
  btns: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnGhost: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  btnGhostTxt: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted },
  btnMain: { backgroundColor: colors.orange },
  btnMainTxt: { fontFamily: fonts.familySemibold, fontSize: 15, color: '#fff' },
});
