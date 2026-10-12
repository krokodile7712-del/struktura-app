import React from 'react';
import { Group, Row, SwitchRow, ChipsRow, InputRow, Note } from './ui';
import { TAX, VAT } from './bizData';

const set = (setDraft, patch) => setDraft(d => ({ ...d, ...patch }));

/** «Чек и налоги»: налоговый режим, НДС, очередь чеков, название и подвал чека, предпросмотр, валюта и формат даты. */
export default function ReceiptSection({ draft: d, setDraft, onPreview }) {
  return (
    <>
      <Group title="Налоги">
        <ChipsRow title="Система налогообложения" items={TAX} value={d.taxSystem} onChange={k => set(setDraft, { taxSystem: k })} />
        <ChipsRow title="НДС по умолчанию" items={VAT} value={d.vatRate} onChange={k => set(setDraft, { vatRate: k })} />
        <SwitchRow title="Автоматическая очередь чеков" sub="Чеки сами попадают в очередь на отправку в ФНС" value={!!d.autoFiscal} onChange={v => set(setDraft, { autoFiscal: v })} />
      </Group>
      <Note>Касса не подключена: чеки копятся в очереди в разделе «Продажи» и отправятся в ФНС автоматически, как только будет подключено оборудование или облачная касса.</Note>
      <Group title="Чек" delay={60}>
        <InputRow title="Название на чеке" value={d.receiptName} onChange={v => set(setDraft, { receiptName: v })} placeholder={d.businessName || 'Как называется бизнес'} />
        <InputRow title="Текст подвала" value={d.receiptFooter} onChange={v => set(setDraft, { receiptFooter: v })} placeholder="Спасибо за покупку!" />
        <Row title="Предпросмотр чека" onPress={onPreview} />
      </Group>
      <Group title="Валюта и формат" delay={120}>
        <ChipsRow title="Валюта" items={['₽', '$', '€', '₸', '₴'].map(x => [x, x])} value={d.currency} onChange={k => set(setDraft, { currency: k })} />
        <ChipsRow title="Формат даты" items={['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].map(x => [x, x])} value={d.dateFormat} onChange={k => set(setDraft, { dateFormat: k })} />
      </Group>
    </>
  );
}
