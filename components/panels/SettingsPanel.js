import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { getBusinessProfile, saveBusinessProfile } from '../../db/queries';
import { colors, fonts } from '../../constants/theme';

export default function SettingsPanel() {
  const [profile, setProfile] = useState(null);
  const [editing, setEditing]  = useState(false);
  const [draft, setDraft]       = useState({});

  useEffect(() => {
    try {
      const p = getBusinessProfile();
      setProfile(p);
      setDraft({
        business_name: p?.business_name || '',
        city:          p?.city          || '',
        phone:         p?.phone         || '',
        address:       p?.address       || '',
        inn:           p?.inn           || '',
        work_hours_from: p?.work_hours_from || '09:00',
        work_hours_to:   p?.work_hours_to   || '21:00',
        receipt_name:  p?.receipt_name  || '',
        receipt_footer: p?.receipt_footer || '',
      });
    } catch(e) { console.error(e); }
  }, []);

  const handleSave = () => {
    try {
      saveBusinessProfile(draft);
      setProfile({ ...profile, ...draft });
      setEditing(false);
      Alert.alert('Сохранено ✓', '');
    } catch(e) { Alert.alert('Ошибка', e.message); }
  };

  const fields = [
    { key: 'business_name', label: 'Название' },
    { key: 'city',          label: 'Город' },
    { key: 'phone',         label: 'Телефон' },
    { key: 'address',       label: 'Адрес' },
    { key: 'inn',           label: 'ИНН / ИП' },
    { key: 'work_hours_from', label: 'Начало работы' },
    { key: 'work_hours_to',   label: 'Конец работы' },
    { key: 'receipt_name',    label: 'Название на чеке' },
    { key: 'receipt_footer',  label: 'Подвал чека' },
  ];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Профиль бизнеса</Text>
        <Pressable
          style={[styles.editBtn, editing && styles.editBtnActive]}
          onPress={() => editing ? handleSave() : setEditing(true)}>
          <Text style={[styles.editBtnTxt, editing && styles.editBtnTxtActive]}>
            {editing ? 'Сохранить' : '✎ Изменить'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        {fields.map((f, idx) => (
          <View key={f.key} style={[styles.row, idx < fields.length-1 && styles.rowDiv]}>
            <Text style={styles.rowLabel}>{f.label}</Text>
            {editing ? (
              <TextInput
                color={colors.text}
                style={styles.input}
                value={draft[f.key] || ''}
                onChangeText={v => setDraft(d => ({ ...d, [f.key]: v }))}
                placeholderTextColor={colors.muted}
              />
            ) : (
              <Text style={styles.rowValue} numberOfLines={1}>
                {profile?.[f.key] || '—'}
              </Text>
            )}
          </View>
        ))}
      </View>

      {editing && (
        <Pressable style={styles.cancelBtn} onPress={() => setEditing(false)}>
          <Text style={styles.cancelTxt}>Отмена</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content:     { padding: 24, paddingBottom: 40 },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title:       { fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text },
  editBtn:     { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  editBtnActive: { backgroundColor: colors.orange, borderColor: colors.orange },
  editBtnTxt:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  editBtnTxtActive: { color: '#fff' },
  card:        { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, gap: 12 },
  rowDiv:      { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel:    { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, width: 130 },
  rowValue:    { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.text, flex: 1, textAlign: 'right' },
  input:       { flex: 1, fontFamily: fonts.familyRegular, fontSize: 13, color: colors.text, textAlign: 'right', padding: 4 },
  cancelBtn:   { marginTop: 12, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center' },
  cancelTxt:   { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
});
