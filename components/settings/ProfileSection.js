import React from 'react';
import { Group, Row, SwitchRow, ChipsRow, InputRow } from './ui';
import HoursRow from './HoursRow';

const set = (setDraft, patch) => setDraft(d => ({ ...d, ...patch }));

/** «Профиль бизнеса»: заведение, рабочие часы, тип бизнеса и запись, контакты для клиентов, соцсети. Сохраняется само. */
export default function ProfileSection({ draft: d, setDraft, navigation }) {
  const slots = d.businessType === 'cafe' ? ['15', '30', '45', '60'] : ['30', '60', '90', '120'];
  return (
    <>
      <Group title="Заведение">
        <InputRow title="Название бизнеса" value={d.businessName} onChange={v => set(setDraft, { businessName: v })} placeholder="Название вашего бизнеса" />
        <InputRow title="Логотип (ссылка)" value={d.logoUrl} onChange={v => set(setDraft, { logoUrl: v })} placeholder="https://..." />
        <InputRow title="Город" value={d.city} onChange={v => set(setDraft, { city: v })} placeholder="Москва" />
        <InputRow title="Телефон" value={d.phone} onChange={v => set(setDraft, { phone: v })} placeholder="+7 999 123-45-67" keyboardType="phone-pad" />
        <InputRow title="Адрес" value={d.address} onChange={v => set(setDraft, { address: v })} placeholder="ул. Ленина, 1" />
        <InputRow title="ИНН / ИП" value={d.inn} onChange={v => set(setDraft, { inn: v })} placeholder="ИП Иванов И.И." />
      </Group>
      <Group title="Рабочие часы" delay={60}><HoursRow from={d.hoursFrom} to={d.hoursTo} onChange={h => set(setDraft, { hoursFrom: h.from, hoursTo: h.to })} /></Group>
      <Group title="Онлайн-запись" delay={120}>
        <ChipsRow title="Тип бизнеса" items={[['cafe', 'Кафе'], ['services', 'Услуги'], ['production', 'Производство']]} value={d.businessType} onChange={k => set(setDraft, { businessType: k })} />
        <Row title="Подключение и услуги" sub="в разделе «Записи»" onPress={() => navigation.navigate('Bookings')} />
        <SwitchRow title="Выбор времени" sub="Клиент выбирает время, а не только день" value={d.timeSlotsEnabled !== false} onChange={v => set(setDraft, { timeSlotsEnabled: v })} />
        {d.timeSlotsEnabled !== false && <ChipsRow title={d.businessType === 'cafe' ? 'Интервал слотов, мин' : 'Длительность услуги, мин'} items={slots.map(x => [x, x])} value={d.slotDuration} onChange={k => set(setDraft, { slotDuration: k })} />}
      </Group>
      <Group title="Контакты для клиентов" delay={180}>
        <InputRow title="Email" value={d.email} onChange={v => set(setDraft, { email: v })} placeholder="hello@business.ru" keyboardType="email-address" />
        <InputRow title="WhatsApp" value={d.whatsapp} onChange={v => set(setDraft, { whatsapp: v })} placeholder="+7 999 123-45-67" keyboardType="phone-pad" />
        <InputRow title="Telegram" value={d.telegram} onChange={v => set(setDraft, { telegram: v })} placeholder="@username" />
      </Group>
      <Group title="Социальные сети" delay={240}>
        <InputRow title="Instagram" value={d.instagram} onChange={v => set(setDraft, { instagram: v })} placeholder="@mybusiness" />
        <InputRow title="ВКонтакте" value={d.vk} onChange={v => set(setDraft, { vk: v })} placeholder="vk.com/mybusiness" />
        <InputRow title="Сайт" value={d.website} onChange={v => set(setDraft, { website: v })} placeholder="mysite.ru" />
      </Group>
    </>
  );
}
