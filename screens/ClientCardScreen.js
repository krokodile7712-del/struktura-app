import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import { colors, fonts, spacing } from '../constants/theme';

export default function ClientCardScreen({ route, navigation }) {
  const { client } = route.params || {};
  if (!client) {
    return (
      <View style={styles.screen}>
        <Text style={{ color: colors.text, textAlign: 'center', marginTop: 40 }}>Клиент не найден</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
      <MetalCard>
        <Text style={styles.fio}>{client.fio}</Text>
        <Text style={styles.code}>{client.code}</Text>
        <Text style={styles.balance}>{client.balance}</Text>
        <Text style={styles.balanceLabel}>баллов</Text>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{client.visits || 0}</Text>
            <Text style={styles.statLabel}>визитов</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{client.totalSum || 0}</Text>
            <Text style={styles.statLabel}>сумма ₽</Text>
          </View>
        </View>

        <Text style={styles.phone}>📞 {client.phone || '—'}</Text>

        <MetalButton title="☕ Новый заказ" variant="success" onPress={() => navigation.navigate('Login')} />
        <MetalButton title="✕ Закрыть" variant="back" onPress={() => navigation.navigate('Loyalty')} />
      </MetalCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingTop: 40, paddingBottom: 80, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  fio: { fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 4 },
  code: { fontFamily: 'monospace', fontSize: 12, color: colors.muted, textAlign: 'center', marginBottom: 14 },
  balance: { fontFamily: fonts.family, fontSize: 56, fontWeight: '800', color: colors.greenLight, textAlign: 'center' },
  balanceLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textAlign: 'center', textTransform: 'uppercase', marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: '#07090f', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, alignItems: 'center' },
  statValue: { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text },
  statLabel: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, textTransform: 'uppercase', marginTop: 2 },
  phone: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 16 },
});
