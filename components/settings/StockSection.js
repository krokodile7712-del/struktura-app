import React from 'react';
import { Group, Row, SwitchRow, Note } from './ui';
import { setModuleFlag } from '../../db/settings';

/** «Склад»: поведение (автосписание, предупреждение о низком остатке) и переход к самому складу. */
export default function StockSection({ modules, navigation, onChanged }) {
  const flip = (key, v) => { try { setModuleFlag(key, v); onChanged && onChanged(); } catch (e) { console.error('[Склад]', e); } };
  return (
    <>
      <Group title="Поведение склада">
        <SwitchRow title="Автосписание при продаже" sub="Ингредиенты из техкарты списываются автоматически при оплате" value={modules.autoDebit !== false} onChange={v => flip('autoDebit', v)} />
        <SwitchRow title="Предупреждение о низком остатке" sub="Показывать уведомление на главном экране" value={modules.stockWarning !== false} onChange={v => flip('stockWarning', v)} />
      </Group>
      <Group title="Работа" delay={60}>
        <Row title="Открыть склад" sub="Остатки, закупки, пороги и списания" onPress={() => navigation.navigate('Products', { initialTab: 'stock' })} />
      </Group>
      <Note>Пороги остатка задаются у каждой позиции на складе; здесь только общее поведение.</Note>
    </>
  );
}
