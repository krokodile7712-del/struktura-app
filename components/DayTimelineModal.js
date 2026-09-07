import React from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { colors, fonts } from '../constants/theme';

/**
 * Записи выбранного дня — тот же карточный язык, что и основной список
 * раздела Записи (не собственная часовая сетка), просто в компактном
 * всплывающем окне. Цветная полоска слева у каждой карточки — тот же
 * акцент, что и точки в самом календаре (оранжевый — онлайн, фиолетовый —
 * по телефону).
 * items — [{ id, time_start, client_name, service_name, source, raw }],
 * уже отсортированы по времени.
 */
export default function DayTimelineModal({ visible, dateLabel, items = [], onClose, onSelectItem }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{dateLabel}</Text>
              <Text style={styles.subtitle}>
                {items.length === 0 ? 'Нет записей' : items.length === 1 ? '1 запись' : `${items.length} записи`}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {items.map((item, i) => {
              const accent = item.source === 'online' ? colors.orange : colors.purple;
              return (
                <Pressable
                  key={`${item.source}-${item.id}`}
                  style={[styles.row, i < items.length - 1 && styles.rowMargin]}
                  onPress={() => onSelectItem?.(item)}
                >
                  <View style={[styles.accent, { backgroundColor: accent }]} />
                  <Text style={styles.time}>{item.time_start?.slice(0, 5)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{item.client_name}</Text>
                    {item.service_name ? <Text style={styles.service} numberOfLines={1}>{item.service_name}</Text> : null}
                  </View>
                  <Text style={styles.arrow}>›</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  sheet: { width: '90%', maxWidth: 440, maxHeight: '75%', backgroundColor: colors.bg, borderRadius: 20, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  subtitle: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  close: { fontSize: 18, color: colors.muted },

  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 13, gap: 10, overflow: 'hidden' },
  rowMargin: { marginBottom: 10 },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  time: { fontFamily: fonts.familySemibold, fontSize: 17, color: colors.text, width: 50, marginLeft: 4 },
  name: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  service: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 2 },
  arrow: { fontSize: 18, color: colors.muted },
});
