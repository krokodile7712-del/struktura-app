import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import { colors, fonts, spacing } from '../constants/theme';

export default function RegResultScreen({ route, navigation }) {
  const { fio, code } = route.params || {};

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
      <MetalCard>
        <Text style={styles.cardTitle}>✅ Карта создана</Text>
        <Text style={styles.fioText}>{fio}</Text>
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>ID клиента</Text>
          <Text style={styles.codeValue}>{code}</Text>
        </View>
        <MetalButton title="В меню" variant="back" onPress={() => navigation.navigate('Loyalty')} />
      </MetalCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingTop: 40, paddingBottom: 80, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  cardTitle: {
    fontFamily: fonts.family,
    fontSize: 11,
    letterSpacing: 3,
    color: colors.textDim,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 18,
  },
  fioText: {
    fontFamily: fonts.family,
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  codeBox: {
    backgroundColor: '#07090f',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  codeLabel: {
    fontFamily: fonts.familySemibold,
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  codeValue: {
    fontFamily: fonts.family,
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 1,
  },
});
