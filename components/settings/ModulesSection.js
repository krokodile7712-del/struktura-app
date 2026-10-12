import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Group, Row, SwitchRow, ChipsRow, InputRow, ChoiceCards, Note } from './ui';
import ModalSheet from '../ModalSheet';
import GlassButton from '../GlassButton';
import { PRESET_LIST, TERM_CONFIGS, MODULE_LIST, ROLE_LIST } from './bizData';
import { colors, fonts } from '../../constants/theme';

const LABEL = { order: 'Заказ', client: 'Клиент', item: 'Товар или услуга', category: 'Категория' };
const ICON = { coffee: 'cafe', retail: 'package', services: 'tag', production: 'grid' };

/** «Модули и термины»: тип бизнеса (стартовый набор), как называются заказ и клиент, какие разделы включены, названия должностей. */
export default function ModulesSection({ draft: d, setDraft, onChoosePreset }) {
  const setTerm = (k, v) => setDraft(x => ({ ...x, terms: { ...x.terms, [k]: v } }));
  const [open, setOpen] = useState(null); const tc = TERM_CONFIGS.find(x => x.key === open);
  return (
    <>
      <Text style={s.h}>Тип бизнеса</Text>
      <ChoiceCards items={PRESET_LIST.map(p => ({ key: p.key, icon: ICON[p.key] || 'grid', title: p.label, desc: p.desc, hint: `Включает: ${p.modules.join(', ')}` }))} value={d.preset} onChange={onChoosePreset} />
      <Note>Выбор подставит термины и стартовый набор разделов под этот тип; их можно подправить ниже вручную.</Note>

      <Group title="Как у вас всё называется">
        {TERM_CONFIGS.map(tc => <Row key={tc.key} title={LABEL[tc.key] || tc.key} sub={tc.desc} value={d.terms?.[tc.key] || '—'} onPress={() => setOpen(tc.key)} />)}
      </Group>

      <Group title="Какие разделы включены">
        {MODULE_LIST.map(m => <SwitchRow key={m.key} title={m.label} sub={m.desc} value={d.modules?.[m.key] !== false} onChange={() => setDraft(x => ({ ...x, modules: { ...x.modules, [m.key]: x.modules?.[m.key] === false } }))} />)}
      </Group>
      <Note>Выключенный модуль пропадает из меню у всех сотрудников; данные при этом не удаляются.</Note>

      <Group title="Как называются должности">
        {ROLE_LIST.map(r => <InputRow key={r.key} title={r.label} value={d.roles?.[r.key] || ''} onChange={v => setDraft(x => ({ ...x, roles: { ...x.roles, [r.key]: v } }))} placeholder={r.placeholder} />)}
      </Group>
      <Note>Только отображение: права доступа названия не меняют.</Note>
      <ModalSheet visible={!!tc} onClose={() => setOpen(null)} title={tc ? tc.title : ''} footer={<GlassButton tone="accent" label="Готово" height={50} onPress={() => setOpen(null)} />}>
        {tc && (<>
          <Text style={s.hint}>{tc.desc}</Text>
          <Group><ChipsRow title="Варианты" items={tc.presets.map(x => [x, x])} value={d.terms?.[tc.key]} onChange={v => setTerm(tc.key, v)} /><InputRow title="Своё слово" value={d.terms?.[tc.key] || ''} onChange={v => setTerm(tc.key, v)} placeholder="Введите слово" /></Group>
        </>)}
      </ModalSheet>
    </>
  );
}
const s = StyleSheet.create({ hint: { fontFamily: fonts.familyRegular, fontSize: 13.5, color: colors.muted, lineHeight: 20, marginBottom: 6 }, h: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.muted, marginLeft: 8, marginBottom: 8 } });
