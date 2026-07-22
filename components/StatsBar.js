import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { fonts, colors } from '../constants/theme';

export default function StatsBar({ stats, modules, onShiftPress, onStockPress }) {
  const [stockOpen, setStockOpen] = useState(false);
  if (!stats) return null;

  const { shift, shiftDuration, todayOrders, todayTotal, todayCash, todayCard, todayMixed, lowStockCount, lowStockItems } = stats;

  return (
    <View style={styles.bar}>
      {/* Смена */}
      <Pressable style={styles.item} onPress={onShiftPress} hitSlop={6}>
        <View style={[styles.dot, shift ? styles.dotOpen : styles.dotClosed]} />
        <View>
          <Text style={[styles.val, !shift && styles.valMuted]}>
            {shift ? (shiftDuration || '—') : 'нет смены'}
          </Text>
          <Text style={styles.label}>смена</Text>
        </View>
      </Pressable>

      <View style={styles.divider} />

      {/* Заказы */}
      <View style={styles.item}>
        <Text style={[styles.val, todayOrders === 0 && styles.valMuted]}>{todayOrders}</Text>
        <Text style={styles.label}>заказов</Text>
      </View>

      <View style={styles.divider} />

      {/* Выручка */}
      <View style={[styles.item, { flex: 1 }]}>
        <Text style={[styles.val, styles.valAccent, todayTotal === 0 && styles.valMuted]}>
          {todayTotal > 0 ? `${Math.round(todayTotal).toLocaleString('ru-RU')} ₽` : '—'}
        </Text>
        <Text style={styles.label}>
          {todayCash > 0 && todayCard + todayMixed > 0
            ? `💵 ${Math.round(todayCash).toLocaleString('ru-RU')} · 💳 ${Math.round(todayCard + todayMixed).toLocaleString('ru-RU')}`
            : 'выручка сегодня'}
        </Text>
      </View>

      {/* Бейдж склада */}
      {modules?.stock !== false && lowStockCount > 0 && (
        <>
          <View style={styles.divider} />
          <Pressable style={styles.stockItem} onPress={() => setStockOpen(true)} hitSlop={6}>
            <Text style={styles.stockIcon}>⚠️</Text>
            <View>
              <Text style={styles.stockVal}>{lowStockCount} поз.</Text>
              <Text style={styles.stockLabel}>мало на складе</Text>
            </View>
          </Pressable>
        </>
      )}

      {/* Выпадающий список */}
      <Modal visible={stockOpen} transparent animationType="fade" onRequestClose={() => setStockOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setStockOpen(false)}>
          <View style={styles.dropdown}>
            <View style={styles.dropHeader}>
              <Text style={styles.dropTitle}>⚠️ Заканчивается</Text>
              <Pressable onPress={() => setStockOpen(false)} hitSlop={12}>
                <Text style={styles.dropClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {(lowStockItems || []).map((item, i) => (
                <View key={i} style={[styles.dropRow, i < (lowStockItems.length - 1) && styles.dropRowDiv]}>
                  <Text style={styles.dropName} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.dropQty, { color: item['остаток'] < 0 ? '#ff3b30' : colors.redLight }]}>
                    {item['остаток']} {item.unit}
                  </Text>
                </View>
              ))}
            </ScrollView>
            <Pressable style={styles.dropGoBtn} onPress={() => { setStockOpen(false); onStockPress?.(); }}>
              <Text style={styles.dropGoBtnText}>Открыть склад →</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#0b0c0f', borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.3)', gap: 4 },
  divider: { width: 1, height: 28, backgroundColor: 'rgba(74,77,84,0.3)', marginHorizontal: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dotOpen:   { backgroundColor: '#3d9e92' },
  dotClosed: { backgroundColor: '#4a4d54' },
  val: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text, lineHeight: 20 },
  valAccent: { color: '#3d9e92' },
  valMuted:  { color: colors.muted },
  label: { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, lineHeight: 13 },
  stockItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: 'rgba(160,16,32,0.1)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(160,16,32,0.3)' },
  stockIcon: { fontSize: 14 },
  stockVal:  { fontFamily: fonts.familySemibold, fontSize: 13, color: '#e05555', lineHeight: 17 },
  stockLabel:{ fontFamily: fonts.familyRegular, fontSize: 10, color: '#e05555', lineHeight: 13, opacity: 0.8 },

  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 56, paddingRight: 12 },
  dropdown:  { width: 280, backgroundColor: '#0e0f11', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(74,77,84,0.5)', overflow: 'hidden', maxHeight: 320, elevation: 16 },
  dropHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.3)' },
  dropTitle: { fontFamily: fonts.familySemibold, fontSize: 13, color: '#ddd8d0' },
  dropClose: { fontSize: 16, color: '#4a4d54', padding: 2 },
  dropRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14 },
  dropRowDiv:{ borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.15)' },
  dropName:  { fontFamily: fonts.familySemibold, fontSize: 13, color: '#ddd8d0', flex: 1, marginRight: 8 },
  dropQty:   { fontFamily: fonts.familySemibold, fontSize: 13 },
  dropGoBtn: { padding: 14, borderTopWidth: 1, borderTopColor: 'rgba(74,77,84,0.3)', alignItems: 'center' },
  dropGoBtnText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.greenLight },
});
