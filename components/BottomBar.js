import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts } from '../constants/theme';
import { isLoggedIn } from '../db/session';

const TABS = [
  { key: 'Loyalty', icon: '🏠', label: 'Лояльность' },
  { key: 'Kassa',   icon: '☕', label: 'Касса' },
];

export default function BottomBar({ navigation, activeTab }) {
  const handlePress = (tab) => {
    if (tab.key === 'Cart') return;
    if (tab.key === 'Kassa') {
      navigation.navigate('Dashboard');
      return;
    }
    navigation.navigate(tab.key);
  };

  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={[styles.button, isActive && styles.buttonActive]}
            onPress={() => handlePress(tab)}
          >
            <Text style={styles.icon}>{tab.icon}</Text>
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderHi,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
  },
  button: {
    flex: 1, paddingVertical: 10,
    backgroundColor: '#0b0c0e',
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, alignItems: 'center', gap: 4,
  },
  buttonActive: {
    borderColor: 'rgba(61,158,146,0.5)',
    backgroundColor: 'rgba(61,158,146,0.15)',
  },
  icon: { fontSize: 18 },
  label: {
    fontFamily: fonts.familySemibold, fontSize: 10,
    color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  labelActive: { color: colors.greenLight },
});
