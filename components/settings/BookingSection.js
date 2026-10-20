import React from 'react';
import { Group, Row, SwitchRow, ChipsRow } from './ui';

const set = (setDraft, patch) => setDraft(d => ({ ...d, ...patch }));

// Что значит «вид записи» — объяснение под выбором (раньше был голый выбор «Тип бизнеса» без пояснений,
// и его путали с типом бизнеса в «Модули и термины»).
const TYPE_HINT = {
  cafe: 'Клиент занимает время (например, столик): интервал между записями одинаков для всех.',
  services: 'Клиент записывается на услугу: время занято на длительность этой услуги.',
  production: 'Клиент записывается на время получения или выполнения заказа.',
};

/**
 * «Онлайн-запись»: подключение страницы, вид записи, выбор времени. Подключение — одна кнопка здесь
 * (раньше было спрятано в «Записи → ⋯»). Часы работы — в «Профиле бизнеса».
 * Props: draft, setDraft, connected, onOpenOnline (открыть окно подключения, ссылки и QR), navigation.
 */
export default function BookingSection({ draft: d, setDraft, connected, onOpenOnline, navigation }) {
  const slots = d.businessType === 'cafe' ? ['15', '30', '45', '60'] : ['30', '60', '90', '120'];
  return (
    <>
      <Group title="Подключение">
        <Row title="Онлайн-страница записи" sub={connected ? 'Ссылка, QR-код, обновление услуг на странице' : 'Не подключена — клиенты пока не могут записываться через интернет'}
          value={connected ? 'Подключена' : 'Подключить'} onPress={onOpenOnline} />
        <Row title="Услуги и мастера" sub="Что и у кого можно заказать, оформление страницы" onPress={() => navigation.navigate('Bookings')} />
      </Group>
      <Group title="Вид записи" delay={60}>
        <ChipsRow title="Что записываем" sub={TYPE_HINT[d.businessType] || TYPE_HINT.cafe}
          items={[['cafe', 'Кафе'], ['services', 'Услуги'], ['production', 'Производство']]} value={d.businessType} onChange={k => set(setDraft, { businessType: k })} />
      </Group>
      <Group title="Время записи" delay={120}>
        <SwitchRow title="Выбор времени" sub="Клиент выбирает время, а не только день" value={d.timeSlotsEnabled !== false} onChange={v => set(setDraft, { timeSlotsEnabled: v })} />
        {d.timeSlotsEnabled !== false && <ChipsRow title={d.businessType === 'cafe' ? 'Интервал между записями, мин' : 'Длительность услуги по умолчанию, мин'} items={slots.map(x => [x, x])} value={d.slotDuration} onChange={k => set(setDraft, { slotDuration: k })} />}
        <Row title="Рабочие часы" sub="Задаются в «Профиле бизнеса»" />
      </Group>
    </>
  );
}
