import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Group, SwitchRow, ChipsRow, InputRow, ChoiceCards, Note } from './ui';
import { PRESET_LIST, TERM_CONFIGS, MODULE_LIST, ROLE_LIST } from './bizData';
import { colors, fonts } from '../../constants/theme';

const ICON = { coffee: 'cafe', retail: 'package', services: 'tag', production: 'grid' };

/** «Модули и термины»: тип бизнеса (стартовый набор), как называются заказ и клиент, какие разделы включены, названия должностей. */
export default function ModulesSection({ draft: d, setDraft, onChoosePreset }) {
  const setTerm = (k, v) => setDraft(x => ({ ...x, terms: { ...x.terms, [k]: v } }));
  return (
    <>
      <Text style={s.h}>Тип бизнеса</Text>
      <ChoiceCards items={PRESET_LIST.map(p => ({ key: p.key, icon: ICON[p.key] || 'grid', title: p.label, desc: p.desc, hint: `Включает: ${p.modules.join(', ')}` }))} value={d.preset} onChange={onChoosePreset} />
      <Note>Выбор подставит термины и стартовый набор разделов под этот тип; их можно подправить ниже вручную.</Note>

      {TERM_CONFIGS.map((tc, i) => (
        <Group key={tc.key} title={tc.title} delay={i * 50}>
          <ChipsRow title={tc.desc} items={tc.presets.map(x => [x, x])} value={d.terms?.[tc.key]} onChange={v => setTerm(tc.key, v)} />
          <InputRow title="Или своё слово" value={d.terms?.[tc.key] || ''} onChange={v => setTerm(tc.key, v)} placeholder="Введите своё слово" />
        </Group>
      ))}

      <Group title="Какие разделы включены">
        {MODULE_LIST.map(m => <SwitchRow key={m.key} title={m.label} sub={m.desc} value={d.modules?.[m.key] !== false} onChange={() => setDraft(x => ({ ...x, modules: { ...x.modules, [m.key]: x.modules?.[m.key] === false } }))} />)}
      </Group>
      <Note>Выключенный модуль пропадает из меню у всех сотрудников; данные при этом не удаляются.</Note>

      <Group title="Как называются должности">
        {ROLE_LIST.map(r => <InputRow key={r.key} title={r.label} value={d.roles?.[r.key] || ''} onChange={v => setDraft(x => ({ ...x, roles: { ...x.roles, [r.key]: v } }))} placeholder={r.placeholder} />)}
      </Group>
      <Note>Только отображение: права доступа названия не меняют.</Note>
    </>
  );
}
const s = StyleSheet.create({ h: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.muted, marginLeft: 8, marginBottom: 8 } });
