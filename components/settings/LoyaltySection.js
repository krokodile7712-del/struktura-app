import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Group, Row, SwitchRow, NumField, Sentence, ChoiceCards, Note } from './ui';
import { getLoyaltyConfig, updateLoyaltyConfig } from '../../db/queries';
import { getClientPages, saveClientPages } from '../../db/clientPages';
import GlassSurface from '../GlassSurface';
import { colors, fonts } from '../../constants/theme';

const MODELS = [
  { key: 'points', icon: 'zap', title: 'Баллы', desc: 'Клиент копит баллы с покупок и тратит их как скидку', hint: 'Подходит: кофейни, магазины' },
  { key: 'discount', icon: 'tag', title: 'Постоянная скидка', desc: 'Один процент для каждого клиента из базы', hint: 'Подходит: салоны, мастерские' },
  { key: 'subscription', icon: 'calendar', title: 'Абонемент', desc: 'Клиент покупает визиты, каждый заказ списывает один', hint: 'Подходит: студии, залы' },
];
const DEFAULT_CFG = { earn_pct: 10, allow_spend: false, point_value: 1, pct: 5, deduct_per_visit: 1, max_spend_pct: 50 };
const rub = n => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

function Example({ title, children }) { return <GlassSurface radius={18} tint="127,168,217" alpha={0.12} padding={16} style={s.ex}><Text style={s.exT}>{title}</Text><Text style={s.exB}>{children}</Text></GlassSurface>; }

/** «Лояльность»: выбор модели карточками, настройка выбранной модели предложениями, живой пример «что получит клиент», бонус за регистрацию по QR. Всё сохраняется сразу. */
export default function LoyaltySection({ onSaved }) {
  const [st, setSt] = useState(() => { const lc = getLoyaltyConfig(); return { model: lc.model || 'points', cfg: { ...DEFAULT_CFG, ...(lc.config || {}) } }; });
  const [bonus, setBonus] = useState(() => getClientPages().bonus);
  const save = next => { setSt(next); try { updateLoyaltyConfig(next.model, next.cfg); onSaved && onSaved(); } catch (e) { console.error('[Лояльность]', e); } };
  const set = patch => save({ ...st, cfg: { ...st.cfg, ...patch } });
  const setBon = patch => { try { saveClientPages('bonus', patch); setBonus(b => ({ ...b, ...patch })); onSaved && onSaved(); } catch (e) { console.error(e); } };
  const { model, cfg } = st, order = 500;
  const earned = Math.floor(order * (cfg.earn_pct || 0) / 100), earnedRub = earned * (cfg.point_value || 1), discount = Math.round(order * (cfg.pct || 0) / 100);

  return (
    <>
      <Text style={s.h}>Как клиент получает выгоду</Text>
      <ChoiceCards items={MODELS} value={model} onChange={k => save({ ...st, model: k })} />

      {model === 'points' && (
        <>
          <Group title="Настройка модели «Баллы»">
            <Sentence>{['За каждые 100 ₽ клиент получает', <NumField key="e" value={cfg.earn_pct} onChange={v => set({ earn_pct: v })} min={0} max={1000} step={0.5} />, 'баллов']}</Sentence>
            <Sentence>{['1 балл равен', <NumField key="v" value={cfg.point_value} onChange={v => set({ point_value: v })} gt={0} max={1000} step={0.5} unit="₽" />, 'скидки при оплате']}</Sentence>
            <SwitchRow title="Разрешить тратить баллы" sub="Клиент может оплатить часть заказа баллами" value={cfg.allow_spend} onChange={v => set({ allow_spend: v })} />
            {cfg.allow_spend && <Sentence>{['Баллами можно оплатить до', <NumField key="m" value={cfg.max_spend_pct} onChange={v => set({ max_spend_pct: v })} min={0} max={100} step={5} unit="%" />, 'чека']}</Sentence>}
          </Group>
          <Example title={`Что получит клиент: заказ на ${rub(order)}`}>Начислится {earned} баллов; в следующий раз ими можно оплатить {rub(earnedRub)}</Example>
        </>
      )}
      {model === 'discount' && (
        <>
          <Group title="Настройка модели «Постоянная скидка»">
            <Sentence>{['Скидка клиентам из базы', <NumField key="p" value={cfg.pct} onChange={v => set({ pct: v })} min={0} max={100} step={1} unit="%" />]}</Sentence>
            <Row title="Применяется автоматически при выборе клиента" sub="Личный процент можно задать в карточке клиента: он важнее общего" />
          </Group>
          <Example title={`Что получит клиент: заказ на ${rub(order)}`}>Скидка {rub(discount)}, к оплате {rub(order - discount)}</Example>
        </>
      )}
      {model === 'subscription' && (
        <>
          <Group title="Настройка модели «Абонемент»">
            <Sentence>{['За один заказ списывается', <NumField key="d" value={cfg.deduct_per_visit} onChange={v => set({ deduct_per_visit: v })} gt={0} max={100} step={1} int unit="виз." />]}</Sentence>
          </Group>
          <Example title="Как это работает">Пополните баланс клиента в его карточке, и при каждом заказе автоматически спишется {cfg.deduct_per_visit} виз.</Example>
        </>
      )}

      <Group title="Приветственный бонус за регистрацию по QR" delay={80}>
        <SwitchRow title="Регистрация по QR включена" sub="Гость сам заполняет карту, бонус активирует кассир при первой покупке" value={bonus.enabled} onChange={v => setBon({ enabled: v })} />
        <Sentence>{['Бонус', <NumField key="b" value={bonus.amount} onChange={v => setBon({ amount: v })} min={0} max={100000} step={50} int width={96} unit="₽" />, 'на', <NumField key="dd" value={bonus.days} onChange={v => setBon({ days: v })} gt={0} max={3650} step={5} int unit="дней" />]}</Sentence>
      </Group>
      <Note>Оформление страницы, меню и схема проезда: «Клиенты», кнопка «⋯». Настройки бонуса уходят в облако при публикации страницы.</Note>
    </>
  );
}
const s = StyleSheet.create({
  h: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.muted, marginLeft: 8, marginBottom: 8 },
  ex: { marginTop: 12 },
  exT: { fontFamily: fonts.familySemibold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginBottom: 6 }, exB: { fontFamily: fonts.familyRegular, fontSize: 14.5, color: colors.textDim, lineHeight: 21 },
});
