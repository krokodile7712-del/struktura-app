import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions, Modal, TextInput, Share } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import InfoTip from '../components/InfoTip';
import Toggle from '../components/Toggle';
import { getPnL, getPnLFull, getBusinessMetrics, getRevenueByDay, getTopProducts, getBusinessProfile } from '../db/queries';
import { getHomeRoute, can } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';
import { useFocusEffect } from '@react-navigation/native';

// ─── Утилиты дат ────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }
function nDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function startOfMonth() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function startOfLastMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}
function endOfLastMonth() {
  const d = new Date(); d.setDate(0);
  return d.toISOString().slice(0, 10);
}
function startOfQuarter() {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1).toISOString().slice(0, 10);
}
function startOfYear() {
  return `${new Date().getFullYear()}-01-01`;
}
// Предыдущий период той же длины
function prevPeriod(from, to) {
  const f = new Date(from), t = new Date(to);
  const days = Math.round((t - f) / 86400000) + 1;
  const pTo = new Date(f); pTo.setDate(pTo.getDate() - 1);
  const pFrom = new Date(pTo); pFrom.setDate(pFrom.getDate() - days + 1);
  return { from: pFrom.toISOString().slice(0, 10), to: pTo.toISOString().slice(0, 10) };
}
function fmt(n) {
  return (n || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDelta(cur, prev) {
  if (!prev || prev === 0) return null;
  const d = Math.round((cur - prev) / prev * 100);
  return { value: d, label: `${d >= 0 ? '+' : ''}${d}%` };
}

// ─── Пресеты периодов ────────────────────────────────────────────────────────
const PRESETS = [
  { key: 'day',       label: 'Сегодня',       from: () => todayStr(),       to: () => todayStr() },
  { key: 'week',      label: '7 дней',         from: () => nDaysAgo(6),      to: () => todayStr() },
  { key: 'month',     label: '30 дней',        from: () => nDaysAgo(29),     to: () => todayStr() },
  { key: 'thisMonth', label: 'Этот месяц',     from: () => startOfMonth(),   to: () => todayStr() },
  { key: 'lastMonth', label: 'Прошлый месяц',  from: () => startOfLastMonth(), to: () => endOfLastMonth() },
  { key: 'quarter',   label: 'Квартал',        from: () => startOfQuarter(), to: () => todayStr() },
  { key: 'year',      label: 'Год',            from: () => startOfYear(),    to: () => todayStr() },
  { key: 'custom',    label: 'Свой период',    from: null, to: null },
];

// ─── Бар-чарт ────────────────────────────────────────────────────────────────
function BarChart({ data, valueKey = 'total', labelKey = 'label', color = colors.greenLight, unit = '₽' }) {
  if (!data || data.length === 0) {
    return <Text style={{ color: colors.muted, textAlign: 'center', paddingVertical: 20 }}>Нет данных</Text>;
  }
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <View>
      {data.map((item, i) => {
        const val = item[valueKey] || 0;
        return (
          <View key={i} style={styles.barRow}>
            <Text style={styles.barLabel} numberOfLines={1}>{item[labelKey]}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${(val / max) * 100}%`, backgroundColor: color }]} />
            </View>
            <Text style={styles.barValue}>{fmt(val)}{unit ? ' ' + unit : ''}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Метрика с дельтой ───────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color: col, tip, delta }) {
  return (
    <View style={styles.metricCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={styles.metricLabel}>{label}</Text>
        {tip && <InfoTip title={tip.title} text={tip.text} />}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={[styles.metricValue, col && { color: col }]}>{value}</Text>
        {delta && (
          <Text style={[styles.deltaText, { color: delta.value >= 0 ? colors.greenLight : colors.redLight }]}>
            {delta.label}
          </Text>
        )}
      </View>
      {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
    </View>
  );
}

// ─── Экран ───────────────────────────────────────────────────────────────────
export default function ReportsScreen({ navigation }) {
  const [preset, setPreset]       = useState('week');
  const [customFrom, setCustomFrom] = useState(nDaysAgo(29));
  const [customTo, setCustomTo]   = useState(todayStr());
  const [showPresets, setShowPresets] = useState(false);
  const [showCustom, setShowCustom]   = useState(false);
  const [tab, setTab]             = useState('pnl'); // 'pnl' | 'full' | 'metrics' | 'charts'
  const [compare, setCompare]     = useState(false);
  const [exporting, setExporting] = useState(false);

  const [pnl, setPnl]             = useState(null);
  const [pnlFull, setPnlFull]     = useState(null);
  const [metrics, setMetrics]     = useState([]);
  const [businessPreset, setBusinessPreset] = useState('custom');
  const [pnlPrev, setPnlPrev]     = useState(null);
  const [revenueByDay, setRevenueByDay] = useState([]);
  const [topProducts, setTopProducts]   = useState([]);

  // Текущий диапазон дат
  const getRange = useCallback(() => {
    if (preset === 'custom') return { from: customFrom, to: customTo };
    const p = PRESETS.find(p => p.key === preset);
    return { from: p.from(), to: p.to() };
  }, [preset, customFrom, customTo]);

  const currentPreset = PRESETS.find(p => p.key === preset);
  const rangeLabel = preset === 'custom'
    ? `${customFrom.slice(5).replace('-', '.')} — ${customTo.slice(5).replace('-', '.')}`
    : currentPreset?.label || '';

  const load = useCallback(() => {
    const { from, to } = getRange();
    try {
      const profile = getBusinessProfile();
      const bPreset = profile?.preset || 'custom';
      setBusinessPreset(bPreset);
      const cur = getPnL(from, to);
      setPnl(cur);
      setRevenueByDay(getRevenueByDay(from, to).map(r => ({
        label: r.day.slice(5).replace('-', '.'),
        total: Math.round(r.total),
      })));
      setTopProducts(getTopProducts(from, to, 8).map(r => ({
        label: r.name, total: r.qty,
      })));
      const full = getPnLFull(from, to);
      setPnlFull(full);
      setMetrics(getBusinessMetrics(full, bPreset));
      if (compare) {
        const prev = prevPeriod(from, to);
        setPnlPrev(getPnL(prev.from, prev.to));
      } else {
        setPnlPrev(null);
      }
    } catch (e) { console.error(e); }
  }, [getRange, compare]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Экспорт
  const handleExport = async () => {
    if (!pnl) return;
    setExporting(true);
    const { from, to } = getRange();
    const prev = pnlPrev;
    const lines = [
      `СТРУКТУРА — Отчёт P&L`,
      `Период: ${from} — ${to}`,
      ``,
      `Выручка:          ${fmt(pnl.revenue)} ₽${prev ? `  (пред.: ${fmt(prev.revenue)} ₽)` : ''}`,
      `Себестоимость:    ${fmt(pnl.cogs)} ₽`,
      `Валовая прибыль:  ${fmt(pnl.grossProfit)} ₽  (маржа ${pnl.grossMarginPct}%)`,
      `Расходы:          ${fmt(pnl.expenses)} ₽`,
      `Чистая прибыль:   ${fmt(pnl.netProfit)} ₽  (маржа ${pnl.netMarginPct}%)`,
      ``,
      `Заказов: ${pnl.orderCount}  ·  Средний чек: ${fmt(pnl.avgCheck)} ₽`,
      ``,
      `Топ товаров:`,
      ...topProducts.map((p, i) => `  ${i + 1}. ${p.label} — ${p.total} шт.`),
    ];
    try {
      await Share.share({ message: lines.join('\n'), title: 'Отчёт СТРУКТУРА' });
    } catch (_) {}
    setExporting(false);
  };

  if (!can('view_reports')) return (
    <View style={{ flex: 1 }}>
      <TopBar title="Отчётность" onBack={() => navigation.navigate(getHomeRoute())} />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Text style={{ fontSize: 32, marginBottom: 16 }}>🔒</Text>
        <Text style={{ fontFamily: 'AnekDevanagari_700Bold', fontSize: 18, color: '#ddd8d0', textAlign: 'center' }}>Нет доступа</Text>
        <Text style={{ fontFamily: 'AnekDevanagari_400Regular', fontSize: 14, color: '#4a4d54', textAlign: 'center', marginTop: 8 }}>Обратитесь к администратору для получения доступа к отчётности.</Text>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Отчётность"
        onBack={() => navigation.navigate(getHomeRoute())}
        rightElement={
          <Pressable onPress={handleExport} hitSlop={8} style={styles.exportBtn} disabled={exporting}>
            <Text style={styles.exportBtnText}>{exporting ? '...' : '↑ Экспорт'}</Text>
          </Pressable>
        }
      />

      {/* ── Период ── */}
      <View style={styles.periodBar}>
        {/* Быстрые пресеты — первые 3 */}
        {PRESETS.slice(0, 3).map(p => (
          <Pressable
            key={p.key}
            style={[styles.periodBtn, preset === p.key && styles.periodBtnActive]}
            onPress={() => { setPreset(p.key); setShowPresets(false); }}
          >
            <Text style={[styles.periodBtnText, preset === p.key && styles.periodBtnTextActive]}>{p.label}</Text>
          </Pressable>
        ))}
        {/* Кнопка "Период ▼" */}
        <Pressable
          style={[styles.periodBtn, ['thisMonth','lastMonth','quarter','year','custom'].includes(preset) && styles.periodBtnActive]}
          onPress={() => setShowPresets(v => !v)}
        >
          <Text style={[styles.periodBtnText, ['thisMonth','lastMonth','quarter','year','custom'].includes(preset) && styles.periodBtnTextActive]}>
            {['thisMonth','lastMonth','quarter','year','custom'].includes(preset) ? rangeLabel : 'Период ▼'}
          </Text>
        </Pressable>
      </View>

      {/* ── Выпадающий список пресетов ── */}
      {showPresets && (
        <View style={styles.presetsDropdown}>
          {PRESETS.slice(3).map(p => (
            <Pressable
              key={p.key}
              style={[styles.presetItem, preset === p.key && styles.presetItemActive]}
              onPress={() => {
                if (p.key === 'custom') { setShowCustom(true); }
                else { setPreset(p.key); }
                setShowPresets(false);
              }}
            >
              <Text style={[styles.presetItemText, preset === p.key && styles.presetItemTextActive]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* ── Вкладки + сравнение ── */}
      <View style={styles.tabRow}>
        <View style={styles.tabBar}>
          <Pressable style={[styles.tabBtn, tab === 'pnl' && styles.tabBtnActive]} onPress={() => setTab('pnl')}>
            <Text style={[styles.tabBtnText, tab === 'pnl' && styles.tabBtnTextActive]}>📊 P&L</Text>
          </Pressable>
          <Pressable style={[styles.tabBtn, tab === 'full' && styles.tabBtnActive]} onPress={() => setTab('full')}>
            <Text style={[styles.tabBtnText, tab === 'full' && styles.tabBtnTextActive]}>📋 Полный</Text>
          </Pressable>
          <Pressable style={[styles.tabBtn, tab === 'metrics' && styles.tabBtnActive]} onPress={() => setTab('metrics')}>
            <Text style={[styles.tabBtnText, tab === 'metrics' && styles.tabBtnTextActive]}>🎯 KPI</Text>
          </Pressable>
          <Pressable style={[styles.tabBtn, tab === 'charts' && styles.tabBtnActive]} onPress={() => setTab('charts')}>
            <Text style={[styles.tabBtnText, tab === 'charts' && styles.tabBtnTextActive]}>📈 Графики</Text>
          </Pressable>
        </View>
        <View style={styles.compareWrap}>
          <Text style={styles.compareLabel}>Сравнить</Text>
          <Toggle value={compare} onValueChange={v => { setCompare(v); }} size="sm" />
        </View>
      </View>

      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>

        {tab === 'pnl' && pnl && (<>
          {/* Если сравнение — показываем подзаголовки */}
          {compare && pnlPrev && (
            <View style={styles.compareHeader}>
              <Text style={styles.compareHeaderText}>Текущий период</Text>
              <Text style={styles.compareHeaderText}>Пред. период</Text>
            </View>
          )}

          <View style={styles.metricsGrid}>
            <MetricCard label="Выручка" value={`${fmt(pnl.revenue)} ₽`}
              sub={`${pnl.orderCount} зак. · ср. чек ${fmt(pnl.avgCheck)} ₽`}
              color={colors.greenLight}
              delta={compare && pnlPrev ? fmtDelta(pnl.revenue, pnlPrev.revenue) : null}
              tip={{ title: 'Выручка', text: 'Сумма всех оплаченных заказов за период (без возвратов).' }} />
            <MetricCard label="Себестоимость (COGS)" value={`${fmt(pnl.cogs)} ₽`}
              sub={pnl.revenue > 0 ? `${Math.round(pnl.cogs / pnl.revenue * 100)}% от выручки` : ''}
              delta={compare && pnlPrev ? fmtDelta(pnl.cogs, pnlPrev.cogs) : null}
              tip={{ title: 'Себестоимость', text: 'Затраты на ингредиенты по техкартам.' }} />
            <MetricCard label="Валовая прибыль" value={`${fmt(pnl.grossProfit)} ₽`}
              sub={`Маржа ${pnl.grossMarginPct}%`}
              color={pnl.grossProfit >= 0 ? colors.greenLight : colors.redLight}
              delta={compare && pnlPrev ? fmtDelta(pnl.grossProfit, pnlPrev.grossProfit) : null}
              tip={{ title: 'Валовая прибыль', text: 'Выручка − Себестоимость. До учёта расходов.' }} />
            <MetricCard label="Расходы" value={`${fmt(pnl.expenses)} ₽`}
              sub="из раздела Расходы"
              delta={compare && pnlPrev ? fmtDelta(pnl.expenses, pnlPrev.expenses) : null}
              tip={{ title: 'Расходы', text: 'Аренда, зарплата и другие записи из раздела Расходы.' }} />
          </View>

          {/* Чистая прибыль */}
          <MetalCard style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.netLabel}>Чистая прибыль</Text>
              <InfoTip title="Чистая прибыль" text="Выручка − Себестоимость − Расходы." />
              {compare && pnlPrev && (() => {
                const d = fmtDelta(pnl.netProfit, pnlPrev.netProfit);
                return d ? (
                  <Text style={[styles.deltaText, { color: d.value >= 0 ? colors.greenLight : colors.redLight, marginLeft: 10 }]}>
                    {d.label}
                  </Text>
                ) : null;
              })()}
            </View>
            <Text style={[styles.netValue, { color: pnl.netProfit >= 0 ? colors.greenLight : colors.redLight }]}>
              {pnl.netProfit >= 0 ? '+' : ''}{fmt(pnl.netProfit)} ₽
            </Text>
            <Text style={styles.netSub}>Чистая маржа: {pnl.netMarginPct}%</Text>

            {compare && pnlPrev && (
              <View style={styles.prevRow}>
                <Text style={styles.prevLabel}>Предыдущий период:</Text>
                <Text style={[styles.prevValue, { color: pnlPrev.netProfit >= 0 ? colors.greenLight : colors.redLight }]}>
                  {pnlPrev.netProfit >= 0 ? '+' : ''}{fmt(pnlPrev.netProfit)} ₽
                </Text>
              </View>
            )}

            {/* Водопад */}
            {pnl.revenue > 0 && (
              <View style={{ marginTop: 14, gap: 6 }}>
                {[
                  { label: 'Выручка',      val: pnl.revenue,     color: colors.greenLight },
                  { label: '− Себест.',    val: -pnl.cogs,       color: colors.redLight },
                  { label: '− Расходы',   val: -pnl.expenses,   color: '#e0a040' },
                  { label: '= Прибыль',   val: pnl.netProfit,   color: pnl.netProfit >= 0 ? colors.greenLight : colors.redLight, bold: true },
                ].map((row, i) => (
                  <View key={i} style={styles.waterfallRow}>
                    <Text style={[styles.waterfallLabel, row.bold && { fontFamily: fonts.familySemibold }]}>{row.label}</Text>
                    <Text style={[styles.waterfallVal, { color: row.color }, row.bold && { fontFamily: fonts.familySemibold }]}>
                      {row.val >= 0 ? '+' : ''}{fmt(row.val)} ₽
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </MetalCard>

          {pnl.cogs === 0 && (
            <MetalCard style={{ marginTop: 12 }}>
              <Text style={styles.hintCard}>💡 Себестоимость = 0. Заполните техкарты в Настройках → Меню и цены чтобы видеть реальную маржу.</Text>
            </MetalCard>
          )}
        </>)}


        {tab === 'full' && pnlFull && (
          <MetalCard>
            <Text style={styles.netLabel}>Полный управленческий P&L</Text>
            {[
              { label: 'Выручка',                  val: pnlFull.revenue,        color: colors.greenLight },
              { label: '− Себестоимость (COGS)',    val: -pnlFull.cogs,          color: colors.redLight },
              { label: '= Валовая прибыль',         val: pnlFull.grossProfit,    color: pnlFull.grossProfit >= 0 ? colors.greenLight : colors.redLight, bold: true },
              { label: '− Прямые расходы',          val: -pnlFull.expenses,      color: '#e0a040' },
              { label: '− Накладные расходы',       val: -pnlFull.overheadTotal, color: '#e0a040' },
              { label: '− Зарплата',                val: -pnlFull.salaryTotal,   color: '#e0a040' },
              { label: '− Амортизация',             val: -pnlFull.deprTotal,     color: '#e0a040' },
              { label: '= Чистая прибыль (полная)', val: pnlFull.fullNetProfit,  color: pnlFull.fullNetProfit >= 0 ? colors.greenLight : colors.redLight, bold: true },
            ].map((row, i) => (
              <View key={i} style={[styles.waterfallRow, { paddingVertical: 8 }]}>
                <Text style={[styles.waterfallLabel, row.bold && { fontFamily: fonts.familySemibold, color: colors.text }]}>{row.label}</Text>
                <Text style={[styles.waterfallVal, { color: row.color }, row.bold && { fontFamily: fonts.familySemibold, fontSize: 15 }]}>
                  {row.val >= 0 ? '+' : ''}{fmt(Math.round(row.val))} ₽
                </Text>
              </View>
            ))}
            <View style={{ marginTop: 14, padding: 12, backgroundColor: 'rgba(61,158,146,0.06)', borderRadius: 12 }}>
              <Text style={[styles.netValue, { fontSize: 26, color: pnlFull.fullNetProfit >= 0 ? colors.greenLight : colors.redLight }]}>
                {pnlFull.fullNetProfit >= 0 ? '+' : ''}{fmt(pnlFull.fullNetProfit)} ₽
              </Text>
              <Text style={styles.netSub}>Полная чистая маржа: {pnlFull.fullNetMarginPct}%</Text>
            </View>
            {(pnlFull.overheadTotal === 0 && pnlFull.salaryTotal === 0 && pnlFull.deprTotal === 0) && (
              <Text style={[styles.hintCard, { marginTop: 12 }]}>
                💡 Накладные, зарплата и амортизация = 0. Заполните разделы Накладные расходы, Сотрудники (ставки) и Оборудование для полного расчёта.
              </Text>
            )}
          </MetalCard>
        )}

        {tab === 'metrics' && (
          <>
            {metrics.length > 0 ? metrics.map(m => (
              <MetalCard key={m.key} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.metricLabel}>{m.label}</Text>
                    {m.tip && <InfoTip title={m.label} text={m.tip} />}
                  </View>
                  {m.benchmark && <Text style={styles.benchmarkLabel}>норма: {m.benchmark}</Text>}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  <Text style={[styles.metricValue, { color: m.ok ? colors.greenLight : m.warn ? colors.redLight : colors.text }]}>{m.value}</Text>
                  {m.ok && <Text style={styles.statusOk}>✓ норма</Text>}
                  {m.warn && <Text style={styles.statusWarn}>⚠️ выше нормы</Text>}
                </View>
              </MetalCard>
            )) : (
              <MetalCard>
                <Text style={styles.hintCard}>
                  {'🎯 Метрики появятся когда будут данные о продажах за выбранный период.\n\nДля расширенных KPI заполните техкарты, ставки сотрудников и накладные расходы.'}
                </Text>
              </MetalCard>
            )}
          </>
        )}

        {tab === 'charts' && (<>
          <MetalCard>
            <Text style={styles.chartTitle}>Выручка по дням</Text>
            <BarChart data={revenueByDay} valueKey="total" labelKey="label" color={colors.greenLight} unit="₽" />
          </MetalCard>
          <MetalCard style={{ marginTop: 12 }}>
            <Text style={styles.chartTitle}>Топ товаров по количеству</Text>
            <BarChart data={topProducts} valueKey="total" labelKey="label" color="#7a9be8" unit="шт" />
          </MetalCard>
        </>)}
      </ScrollView>

      <BottomBar navigation={navigation} activeTab="Kassa" />

      {/* ── Модалка кастомного периода ── */}
      <Modal visible={showCustom} transparent animationType="fade" onRequestClose={() => setShowCustom(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowCustom(false)} />
          <View style={styles.modalInner}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Свой период</Text>
              <Pressable onPress={() => setShowCustom(false)} hitSlop={14}><Text style={styles.modalClose}>✕</Text></Pressable>
            </View>
            <Text style={styles.fieldLabel}>С (ГГГГ-ММ-ДД)</Text>
            <TextInput
              style={styles.input}
              value={customFrom}
              onChangeText={setCustomFrom}
              placeholder="2024-01-01"
              placeholderTextColor={colors.muted}
              keyboardType="numbers-and-punctuation"
            />
            <Text style={styles.fieldLabel}>По (ГГГГ-ММ-ДД)</Text>
            <TextInput
              style={styles.input}
              value={customTo}
              onChangeText={setCustomTo}
              placeholder="2024-01-31"
              placeholderTextColor={colors.muted}
              keyboardType="numbers-and-punctuation"
            />
            <MetalButton title="Применить" variant="success" onPress={() => {
              setPreset('custom');
              setShowCustom(false);
            }} style={{ marginTop: 12 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },

  // Период
  periodBar: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border, flexWrap: 'wrap' },
  periodBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  periodBtnActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.15)' },
  periodBtnText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  periodBtnTextActive: { color: colors.greenLight },

  // Дропдаун пресетов
  presetsDropdown: {
    position: 'absolute', top: 120, right: 16, zIndex: 100,
    backgroundColor: '#0e0f11', borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    padding: 8, minWidth: 180,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 10,
  },
  presetItem: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  presetItemActive: { backgroundColor: 'rgba(61,158,146,0.1)' },
  presetItemText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  presetItemTextActive: { color: colors.greenLight },

  // Вкладки + сравнение
  tabRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBar: { flex: 1, flexDirection: 'row' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: colors.greenLight },
  tabBtnText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  tabBtnTextActive: { color: colors.greenLight },
  compareWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  compareLabel: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },

  // Метрики
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { flex: 1, minWidth: 180, padding: 14, backgroundColor: '#0b0c0f', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(74,77,84,0.35)' },
  metricLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  metricValue: { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 6 },
  metricSub: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 4 },
  deltaText: { fontFamily: fonts.familySemibold, fontSize: 13 },

  // Сравнение
  compareHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  compareHeaderText: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  prevRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  prevLabel: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  prevValue: { fontFamily: fonts.familySemibold, fontSize: 13 },

  // Чистая прибыль
  netLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, flex: 1 },
  netValue: { fontFamily: fonts.family, fontSize: 32, fontWeight: '800', marginTop: 6 },
  netSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 4 },
  waterfallRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.2)' },
  waterfallLabel: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  waterfallVal: { fontFamily: fonts.familyRegular, fontSize: 13 },
  hintCard: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, lineHeight: 20 },

  benchmarkLabel: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
  statusOk: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.greenLight },
  statusWarn: { fontFamily: fonts.familySemibold, fontSize: 12, color: '#e0a040' },

  // Графики
  chartTitle: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, marginBottom: 14 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  barLabel: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, width: 64, textAlign: 'right' },
  barTrack: { flex: 1, height: 18, backgroundColor: '#07080a', borderRadius: 9, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 9 },
  barValue: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.text, width: 70, textAlign: 'right' },

  // Экспорт
  exportBtn: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(61,158,146,0.4)', backgroundColor: 'rgba(61,158,146,0.08)' },
  exportBtnText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.greenLight },

  // Модалка кастомного периода
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalInner: { width: '44%', maxWidth: 400, backgroundColor: '#0e0f11', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: 'rgba(74,77,84,0.5)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text },
  modalClose: { fontSize: 18, color: colors.muted },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6, marginTop: 12 },
  input: { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 15, fontFamily: fonts.family, marginBottom: 4 },
});
