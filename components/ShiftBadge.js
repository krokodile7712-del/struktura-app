import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { fonts, colors } from '../constants/theme';

export default function ShiftBadge({ stats, onShiftPress, onStockPress }) {
  const [stockOpen, setStockOpen] = useState(false);
  if (!stats) return null;

  const { shift, shiftDuration, todayOrders, todayTotal, lowStockCount, lowStockItems } = stats;

  return (
    <View style={styles.wrap}>
      {/* Бейдж склада */}
      {lowStockCount > 0 && (
        <>
          <Pressable
            style={styles.stockBadge}
            onPress={() => setStockOpen(true)}
            hitSlop={8}
          >
            <Text style={styles.stockIcon}>⚠️</Text>
            <Text style={styles.stockCount}>{lowStockCount}</Text>
          </Pressable>

          {/* Выпадающий список заканчивающихся позиций */}
          <Modal
            visible={stockOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setStockOpen(false)}
          >
            <Pressable
              style={styles.backdrop}
              onPress={() => setStockOpen(false)}
            >
              <View style={styles.dropdown}>
                <View style={styles.dropdownHeader}>
                  <Text style={styles.dropdownTitle}>⚠️ Заканчивается</Text>
                  <Pressable onPress={() => setStockOpen(false)} hitSlop={12}>
                    <Text style={styles.dropdownClose}>✕</Text>
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                  {(lowStockItems || []).map((item, i) => (
                    <Pressable
                      key={i}
                      style={[styles.stockRow, i < (lowStockItems.length - 1) && styles.stockRowDiv]}
                      onPress={() => { setStockOpen(false); onStockPress?.(); }}
                    >
                      <Text style={styles.stockName} numberOfLines={1}>{item.name}</Text>
                      <Text style={[
                        styles.stockQty,
                        item['остаток'] < 0 && { color: '#ff3b30' },
                        item['остаток'] >= 0 && { color: colors.redLight },
                      ]}>
                        {item['остаток']} {item.unit}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable
                  style={styles.goToStock}
                  onPress={() => { setStockOpen(false); onStockPress?.(); }}
                >
                  <Text style={styles.goToStockText}>Открыть склад →</Text>
                </Pressable>
              </View>
            </Pressable>
          </Modal>
        </>
      )}

      {/* Бейдж смены */}
      <Pressable
        style={[styles.mainBadge, !shift && styles.mainBadgeClosed]}
        onPress={onShiftPress}
        hitSlop={8}
      >
        <View style={styles.dotWrap}>
          <View style={[styles.dot, shift ? styles.dotOpen : styles.dotClosed]} />
        </View>
        <View style={styles.info}>
          <Text style={shift ? styles.shiftTime : styles.shiftNone}>
            {shift ? (shiftDuration || '—') : 'нет смены'}
          </Text>
          {shift && (
            <Text style={styles.stats}>
              {todayOrders > 0
                ? `${todayOrders} зак · ${Math.round(todayTotal).toLocaleString('ru-RU')} ₽`
                : 'заказов нет'}
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // Бейдж склада
  stockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingVertical: 4, paddingHorizontal: 8,
    backgroundColor: 'rgba(160,16,32,0.12)',
    borderRadius: 18, borderWidth: 1,
    borderColor: 'rgba(160,16,32,0.35)',
  },
  stockIcon:  { fontSize: 11, lineHeight: 14 },
  stockCount: { fontFamily: fonts.familySemibold, fontSize: 12, color: '#e05555', lineHeight: 14 },

  // Дропдаун
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 56,
    paddingRight: 8,
  },
  dropdown: {
    width: 280,
    backgroundColor: '#0e0f11',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(74,77,84,0.5)',
    overflow: 'hidden',
    maxHeight: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 16,
  },
  dropdownHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.3)',
  },
  dropdownTitle: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  dropdownClose: { fontSize: 16, color: colors.muted, padding: 2 },

  stockRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 11, paddingHorizontal: 14,
  },
  stockRowDiv: { borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.15)' },
  stockName:   { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, flex: 1, marginRight: 8 },
  stockQty:    { fontFamily: fonts.familySemibold, fontSize: 13 },

  goToStock: {
    padding: 14, borderTopWidth: 1, borderTopColor: 'rgba(74,77,84,0.3)',
    alignItems: 'center',
  },
  goToStockText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.greenLight },

  // Бейдж смены
  mainBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 5, paddingHorizontal: 10,
    backgroundColor: 'rgba(61,158,146,0.1)',
    borderRadius: 18, borderWidth: 1,
    borderColor: 'rgba(61,158,146,0.35)',
  },
  mainBadgeClosed: {
    backgroundColor: 'rgba(74,77,84,0.1)',
    borderColor: 'rgba(74,77,84,0.25)',
  },
  dotWrap: { justifyContent: 'center' },
  dot:       { width: 7, height: 7, borderRadius: 4 },
  dotOpen:   { backgroundColor: '#3d9e92' },
  dotClosed: { backgroundColor: '#4a4d54' },
  info:      { alignItems: 'flex-start' },
  shiftTime: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.greenLight, lineHeight: 15 },
  shiftNone: { fontFamily: fonts.familyRegular,  fontSize: 11, color: colors.muted, lineHeight: 15 },
  stats:     { fontFamily: fonts.familyRegular,  fontSize: 10, color: colors.muted, lineHeight: 13 },
});
