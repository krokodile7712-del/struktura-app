import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getTerms } from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

export default function RegResultScreen({ route, navigation }) {
  const { fio, code } = route.params || {};
  const [terms, setTerms] = useState({ item: 'Товар', client: 'Клиент', order: 'Заказ', category: 'Категория' });

  useEffect(() => { try { setTerms(getTerms()); } catch (e) { console.error(e); } }, []);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Карта создана" onBack={() => navigation.navigate('Loyalty')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          <Text style={styles.check}>✅</Text>
          <Text style={styles.fioText}>{fio}</Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>ID: {terms.client}</Text>
            <Text style={styles.codeValue}>{code}</Text>
          </View>
          <MetalButton title="В меню лояльности" variant="action" onPress={() => navigation.navigate('Loyalty')} />
        </MetalCard>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Loyalty" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  check: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  fioText: { fontFamily: fonts.family, fontSize: 20, color: colors.text, textAlign: 'center', marginBottom: 16 },
  codeBox: {
    backgroundColor: '#07090f', borderWidth: 1,
    borderColor: colors.border, borderRadius: 12, padding: 16, marginBottom: 16,
  },
  codeLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', marginBottom: 8 },
  codeValue: { fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: 1 },
});
