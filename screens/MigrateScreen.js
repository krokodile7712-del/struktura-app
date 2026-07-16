import React, { useState } from 'react';
import Hint from '../components/Hint';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import Hint from '../components/Hint';
import { migrateFromSheets } from '../db/migrate';
import Hint from '../components/Hint';
import { colors, fonts, spacing } from '../constants/theme';

export default function MigrateScreen({ navigation }) {
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);

  const handleMigrate = async () => {
    setStatus('loading');
    setProgress('Подключаемся...');
    setResult(null);
    try {
      const res = await migrateFromSheets((msg) => setProgress(msg));
      setResult(res);
      setStatus(res.success ? 'done' : 'error');
    } catch (e) {
      setResult({ success: false, errors: [e.message], imported: {} });
      setStatus('error');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Импорт из Google Sheets" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.inner}>
        <MetalCard>
          <Text style={styles.hint}>
            Загружает данные из вашего Google Sheets (меню, клиентов, расходы, склад, себестоимость, настройки PIN).
            {'\n\n'}
            ⚠️ Перед импортом убедитесь что в Code.gs добавлена функция handleApiRequest (файл GAS_PATCH.js в папке db/).
          </Text>

          {status === 'idle' && (
            <MetalButton title="▶ Начать импорт" variant="action" onPress={handleMigrate} />
          )}

          {status === 'loading' && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.greenLight} />
              <Text style={styles.progressText}>{progress}</Text>
            </View>
          )}

          {(status === 'done' || status === 'error') && result && (
            <>
              <Text style={[styles.resultTitle, { color: result.success ? colors.greenLight : colors.redLight }]}>
                {result.success ? '✅ Импорт завершён' : '⚠️ Импорт с ошибками'}
              </Text>

              {Object.entries(result.imported || {}).map(([key, val]) => (
                <View key={key} style={styles.row}>
                  <Text style={styles.rowLabel}>{key}</Text>
                  <Text style={styles.rowValue}>{typeof val === 'number' ? `${val} записей` : '✓'}</Text>
                </View>
              ))}

              {(result.errors || []).map((err, i) => (
                <Text key={i} style={styles.errorText}>✗ {err}</Text>
              ))}

              <View style={{ gap: 10, marginTop: 16 }}>
                <MetalButton title="🔄 Повторить" variant="default" onPress={handleMigrate} />
                <MetalButton title="← Назад" variant="back" onPress={() => navigation.goBack()} />
              </View>
            </>
          )}
        </MetalCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { padding: spacing.lg, paddingBottom: 40, maxWidth: 900, width: '100%', alignSelf: 'center' },
  hint: {
    fontFamily: fonts.familyRegular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 20,
  },
  loadingBox: { alignItems: 'center', gap: 16, paddingVertical: 30 },
  progressText: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  resultTitle: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, textTransform: 'capitalize' },
  rowValue: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.greenLight },
  errorText: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.redLight, marginTop: 6 },
});
