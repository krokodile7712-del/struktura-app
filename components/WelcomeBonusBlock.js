import React from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { colors, fonts } from '../constants/theme';
import { getWelcomeBonusInfo, activateWelcomeBonus, getClientById, getLoyaltyConfig } from '../db/queries';
import { useToast } from './Toast';

const fmtDay = (iso) => {
  try { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); } catch (_) { return ''; }
};
const fmtSum = (n) => Math.round(n || 0).toLocaleString('ru-RU');

// Приветственный бонус клиента, пришедшего по QR: резерв с кнопкой
// «Активировать», итог после активации или пометка об истёкшем сроке.
// У клиентов без бонуса ничего не рисует. onActivated получает свежую
// карточку клиента из базы — вызывающий экран обновляет свои данные.
export default function WelcomeBonusBlock({ client, onActivated }) {
  const toast = useToast();
  const info = getWelcomeBonusInfo(client);
  if (info.status === 'none') return null;

  const activate = () => {
    const r = activateWelcomeBonus(client.id);
    if (r.ok) {
      toast.show(`Бонус ${fmtSum(r.amount)} ₽ зачислен на баланс`);
      onActivated?.(r.client);
      return;
    }
    Alert.alert(
      'Бонус не активирован',
      r.reason === 'expired' ? 'Срок приветственного бонуса истёк.'
        : (r.reason === 'activated' || r.reason === 'already') ? 'Бонус уже активирован.'
        : 'Не удалось активировать бонус.'
    );
    const fresh = getClientById(client.id);
    if (fresh) onActivated?.(fresh);
  };

  if (info.status === 'reserved') {
    // Если списание баллов выключено, бонус зачислится, но потратить его будет нельзя
    let canSpend = true;
    try { const lc = getLoyaltyConfig(); canSpend = lc.model === 'points' && !!lc.config.allow_spend; } catch (_) {}
    return (
      <View style={[styles.box, styles.boxReserved]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🎁 Приветственный бонус {fmtSum(info.amount)} ₽</Text>
          <Text style={styles.sub}>Зарезервирован{info.until ? ` до ${fmtDay(info.until)}` : ''} · регистрация по QR</Text>
          {!canSpend && (
            <Text style={styles.warn}>Списание баллов выключено в настройках лояльности — потратить бонус пока нельзя</Text>
          )}
        </View>
        <Pressable style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]} onPress={activate}>
          <Text style={styles.btnTxt}>Активировать</Text>
        </Pressable>
      </View>
    );
  }

  if (info.status === 'activated') {
    return (
      <View style={[styles.box, styles.boxDone]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.titleDone}>🎁 Бонус {fmtSum(info.amount)} ₽ активирован</Text>
          <Text style={styles.sub}>
            {info.activatedAt ? fmtDay(info.activatedAt) : ''}{info.activatedBy ? ` · ${info.activatedBy}` : ''}
          </Text>
        </View>
      </View>
    );
  }

  // expired
  return (
    <View style={[styles.box, styles.boxDone]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.titleMuted}>🎁 Бонус {fmtSum(info.amount)} ₽ — срок истёк</Text>
        <Text style={styles.sub}>{info.until ? `Действовал до ${fmtDay(info.until)}` : ''}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 14 },
  boxReserved: { backgroundColor: 'rgba(127,168,217,0.10)', borderColor: 'rgba(127,168,217,0.45)' },
  boxDone: { backgroundColor: colors.surface2, borderColor: colors.border },
  title: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.orange },
  titleDone: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.green },
  titleMuted: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.muted },
  sub: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 3 },
  warn: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.orange, marginTop: 6, lineHeight: 19 },
  btn: { backgroundColor: colors.orange, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18 },
  btnTxt: { fontFamily: fonts.familySemibold, fontSize: 16, color: '#fff' },
});
