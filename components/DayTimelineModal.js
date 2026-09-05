import React, { useRef, useEffect } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { colors, fonts } from '../constants/theme';

const HOUR_HEIGHT = 60; // px на один час шкалы
const DEFAULT_DURATION_MIN = 30; // когда реальная длительность неизвестна (записи по телефону)

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * items — объединённый список записей на один день, каждая:
 * { id, time_start, client_name, service_name, source: 'online' | 'manual', duration_min? }
 */
export default function DayTimelineModal({ visible, dateLabel, items = [], onClose, onSelectItem }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      // Прокручиваем к первой записи дня (с небольшим отступом сверху),
      // не заставляя листать от полуночи каждый раз
      const firstMin = items.length > 0
        ? Math.min(...items.map(i => timeToMinutes(i.time_start)))
        : 8 * 60;
      const y = Math.max(0, (firstMin / 60) * HOUR_HEIGHT - HOUR_HEIGHT);
      scrollRef.current?.scrollTo({ y, animated: false });
    }, 50);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{dateLabel}</Text>
            <Pressable onPress={onClose} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
          </View>

          <ScrollView ref={scrollRef} style={{ flex: 1 }}>
            <View style={{ height: 24 * HOUR_HEIGHT }}>
              {Array.from({ length: 24 }).map((_, h) => (
                <View key={h} style={[styles.hourRow, { top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }]}>
                  <Text style={styles.hourLabel}>{String(h).padStart(2, '0')}:00</Text>
                  <View style={styles.hourLine} />
                </View>
              ))}

              {items.map(item => {
                const startMin = timeToMinutes(item.time_start);
                const durationMin = item.duration_min > 0 ? item.duration_min : DEFAULT_DURATION_MIN;
                const top = (startMin / 60) * HOUR_HEIGHT;
                const height = Math.max(28, (durationMin / 60) * HOUR_HEIGHT);
                const color = item.source === 'online' ? colors.orange : colors.purple;
                return (
                  <Pressable
                    key={`${item.source}-${item.id}`}
                    style={[styles.eventBlock, { top, height, borderColor: color, backgroundColor: `${color}22` }]}
                    onPress={() => onSelectItem?.(item)}
                  >
                    <Text style={[styles.eventTime, { color }]}>{item.time_start?.slice(0, 5)}</Text>
                    <Text style={styles.eventName} numberOfLines={1}>{item.client_name}</Text>
                    {item.service_name ? <Text style={styles.eventService} numberOfLines={1}>{item.service_name}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { height: '80%', backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  close: { fontSize: 18, color: colors.muted },

  hourRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-start' },
  hourLabel: { width: 52, fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, paddingLeft: 12, paddingTop: 2 },
  hourLine: { flex: 1, height: 1, backgroundColor: colors.border, marginTop: 8, marginRight: 12 },

  eventBlock: { position: 'absolute', left: 60, right: 12, borderRadius: 10, borderWidth: 1, padding: 8, justifyContent: 'center' },
  eventTime: { fontFamily: fonts.familySemibold, fontSize: 11 },
  eventName: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, marginTop: 1 },
  eventService: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
});
