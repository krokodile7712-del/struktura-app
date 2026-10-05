import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { colors, fonts } from '../constants/theme';
import { pointsView } from '../utils/points';

const fmt = (n) => Math.round(n || 0).toLocaleString('ru-RU');

// Управление списанием баллов в окне оплаты. Строка раскрывается прямо на месте
// (не отдельным окном поверх окна оплаты): свёрнуто — что будет списано, раскрыто —
// «Не списывать» / «Половина» / «Максимум» / своё число и пересчёт вживую.
// Лимит (max_spend_pct) задаётся в настройках лояльности и здесь не обходится:
// maxPoints уже учитывает и лимит, и баланс, и остаток суммы после скидки.
//   value / onChange — строка с количеством баллов (хранится в заказе на кассе)
//   pointsDiscount   — скидка в ₽, которую реально даёт списание (считает Касса)
//   total            — итог к оплате с учётом всего
export default function PointsSpendPanel({ balance, maxPoints, limitPct, value, onChange, pointsDiscount, total }) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false); // пытались ввести больше допустимого
  const view = pointsView({ value, maxPoints, balance });
  const set = (n) => onChange(n > 0 ? String(n) : '');
  const canSpend = maxPoints > 0;

  const onType = (text) => {
    const digits = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    if (!digits) { onChange(''); return; }
    // Выше допустимого ввести нельзя: сразу подставляем максимум, ниже показываем причину
    onChange(String(Math.min(Number(digits), Math.max(maxPoints, 0))));
    if (Number(digits) > maxPoints) setHint(true); else setHint(false);
  };

  return (
    <View style={styles.box}>
      <Pressable style={styles.head} onPress={() => setOpen(o => !o)} hitSlop={6}>
        <Text style={styles.star}>★</Text>
        <View style={{ flex: 1 }}>
          {view.applied > 0 ? (
            <Text style={styles.headTxt}>Списать {fmt(view.applied)} б.</Text>
          ) : (
            <Text style={styles.headTxt}>Баллы на карте: {fmt(balance)}</Text>
          )}
          {view.applied === 0 && (
            <Text style={styles.headSub}>{canSpend ? 'Не списывать · нажмите, чтобы изменить' : 'Сейчас списать нельзя'}</Text>
          )}
        </View>
        {view.applied > 0 && <Text style={styles.headRub}>−{fmt(pointsDiscount)} ₽</Text>}
        <Text style={[styles.chevron, open && styles.chevronOpen]}>›</Text>
      </Pressable>

      {open && (
        <View style={styles.body}>
          {canSpend ? (
            <Text style={styles.info}>
              На карте {fmt(balance)} б. · можно списать до {fmt(maxPoints)} б. (лимит {limitPct ?? 100}% от суммы чека)
            </Text>
          ) : (
            <Text style={styles.info}>
              Списать баллы сейчас нельзя: {balance > 0 ? 'сумма заказа или лимит не позволяют' : 'на карте нет баллов'}.
            </Text>
          )}

          <View style={styles.chips}>
            <Pressable style={[styles.chip, view.mode === 'none' && styles.chipOn]} onPress={() => { set(0); setHint(false); }}>
              <Text style={[styles.chipTxt, view.mode === 'none' && styles.chipTxtOn]}>Не списывать</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, view.mode === 'half' && styles.chipOn, view.half <= 0 && styles.chipOff]}
              disabled={view.half <= 0}
              onPress={() => { set(view.half); setHint(false); }}
            >
              <Text style={[styles.chipTxt, view.mode === 'half' && styles.chipTxtOn]}>Половина{view.half > 0 ? ` · ${fmt(view.half)}` : ''}</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, view.mode === 'max' && styles.chipOn, !canSpend && styles.chipOff]}
              disabled={!canSpend}
              onPress={() => { set(maxPoints); setHint(false); }}
            >
              <Text style={[styles.chipTxt, view.mode === 'max' && styles.chipTxtOn]}>Максимум{canSpend ? ` · ${fmt(maxPoints)}` : ''}</Text>
            </Pressable>
          </View>

          {canSpend && (
            <>
              <Text style={styles.label}>Своё количество</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  color={colors.text}
                  keyboardType="numeric"
                  value={view.exceeded ? String(view.applied) : (value || '')}
                  onChangeText={onType}
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                />
                <Text style={styles.suffix}>баллов</Text>
              </View>
              {hint && <Text style={styles.hint}>Больше {fmt(maxPoints)} списать нельзя — лимит {limitPct ?? 100}% чека</Text>}
            </>
          )}

          <View style={styles.sum}>
            <View style={styles.sumRow}>
              <Text style={styles.sumLbl}>Списывается</Text>
              <Text style={styles.sumVal}>{fmt(view.applied)} б. · −{fmt(pointsDiscount)} ₽</Text>
            </View>
            <View style={styles.sumRow}>
              <Text style={styles.sumLbl}>К оплате</Text>
              <Text style={[styles.sumVal, { color: colors.orange }]}>{fmt(total)} ₽</Text>
            </View>
            <View style={styles.sumRow}>
              <Text style={styles.sumLbl}>Останется на карте</Text>
              <Text style={styles.sumVal}>{fmt(view.remaining)} б.</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.borderHi, marginBottom: 14, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 14 },
  star: { fontSize: 18, color: colors.orange },
  headTxt: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  headSub: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 2 },
  headRub: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.green },
  chevron: { fontSize: 20, color: colors.muted, transform: [{ rotate: '0deg' }] },
  chevronOpen: { transform: [{ rotate: '90deg' }] },

  body: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: colors.border },
  info: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: 12 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3 },
  chipOn: { borderColor: 'rgba(127,168,217,0.6)', backgroundColor: 'rgba(127,168,217,0.12)' },
  chipOff: { opacity: 0.4 },
  chipTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  chipTxtOn: { color: colors.orange },

  label: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, marginTop: 14, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, backgroundColor: colors.surface3, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, paddingHorizontal: 14, fontFamily: fonts.familySemibold, fontSize: 18, color: colors.text },
  suffix: { fontFamily: fonts.familyRegular, fontSize: 16, color: colors.muted },
  hint: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.orange, marginTop: 6 },

  sum: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumLbl: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted },
  sumVal: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
});
