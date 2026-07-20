import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts } from '../constants/theme';
import Drawer from './Drawer';

export default function TopBar({ title, onBack, rightElement, syncPending, navigation, activeScreen }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <View style={styles.bar}>
        <View style={styles.side}>
          {onBack ? (
            <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12} accessibilityLabel="Назад" accessibilityRole="button">
              <Text style={styles.backArrow}>‹</Text>
              <Text style={styles.backLabel}>Назад</Text>
            </Pressable>
          ) : navigation ? (
            <Pressable onPress={() => setDrawerOpen(true)} style={styles.menuBtn} hitSlop={12} accessibilityLabel="Открыть меню" accessibilityRole="button">
              <Text style={styles.menuIcon}>☰</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.title} numberOfLines={1}>{title || ''}</Text>

        <View style={[styles.side, { alignItems: 'flex-end' }]}>
          {syncPending > 0
            ? <Text style={styles.syncBadge}>↑{syncPending}</Text>
            : null}
          {rightElement || null}
        </View>
      </View>

      {navigation && (
        <Drawer
          visible={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          navigation={navigation}
          activeScreen={activeScreen}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHi,
    paddingHorizontal: 8,
  },
  side: {
    width: 110,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 2,
  },
  menuBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  menuIcon: {
    fontSize: 20,
    color: colors.greenLight,
    fontFamily: fonts.family,
  },
  backArrow: {
    fontSize: 26,
    color: colors.greenLight,
    lineHeight: 28,
    fontFamily: fonts.family,
  },
  backLabel: {
    fontFamily: fonts.familySemibold,
    fontSize: 14,
    color: colors.greenLight,
    letterSpacing: 0.5,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.familySemibold,
    fontSize: 11,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
  syncBadge: {
    fontFamily: fonts.familySemibold,
    fontSize: 11,
    color: 'rgba(122,158,82,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(122,158,82,0.3)',
    backgroundColor: 'rgba(122,158,82,0.08)',
  },
});
