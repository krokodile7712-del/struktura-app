import React from 'react';
import { View, Text, Image, StyleSheet, ScrollView } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { colors, fonts, spacing } from '../constants/theme';

export default function LoyaltyScreen({ navigation }) {
  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Лояльность" />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <View style={styles.brandHeader}>
          <Image
            source={{ uri: 'https://i.ibb.co/hRZxPz8b/19-20260514150523.png' }}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.subLogo}>System Loyalty</Text>
        </View>
        <MetalCard>
          <MetalButton title="👤 Регистрация клиента" variant="default" onPress={() => navigation.navigate('Reg')} />
          <MetalButton title="🔍 Поиск клиента" variant="default" onPress={() => navigation.navigate('Search')} />
          <MetalButton title="👥 Все клиенты" variant="default" onPress={() => navigation.navigate('ClientsList')} />
        </MetalCard>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Loyalty" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  brandHeader: { alignItems: 'center', paddingVertical: 24 },
  logo: { width: 280, height: 160, borderRadius: 14, marginBottom: 10 },
  subLogo: {
    fontFamily: fonts.familySemibold, fontSize: 11,
    letterSpacing: 5, color: colors.muted, textTransform: 'uppercase',
  },
});
