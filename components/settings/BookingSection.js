import React from 'react';
import { Group, Row, ChipsRow } from './ui';
import HoursRow from './HoursRow';
import { getBookingServices, getBookingStaff } from '../../db/bookings';

const set = (setDraft, patch) => setDraft(d => ({ ...d, ...patch }));

// Один выбор вместо двух (раньше были отдельно «Вид записи» и переключатель «Выбор времени» — оба ничего
// не объясняли): либо клиент выбирает только день, либо время с выбранным шагом.
const STEPS = [['day', 'Только день'], ['15', '15 мин'], ['30', '30 мин'], ['60', '1 час'], ['120', '2 часа']];

const count = fn => { try { return fn().length; } catch (_) { return 0; } };

/**
 * «Онлайн-запись»: подключение страницы, что видят клиенты, расписание. Подключение — одна кнопка здесь.
 * Props: draft, setDraft, connected, onOpenOnline (окно со ссылкой, QR и обновлением услуг), navigation.
 * Строки «Услуги», «Мастера», «Оформление» открывают нужное окно в «Записях» сразу.
 */
export default function BookingSection({ draft: d, setDraft, connected, onOpenOnline, navigation }) {
  const go = panel => navigation.navigate('Bookings', { panel });
  const value = d.timeSlotsEnabled === false ? 'day' : String(d.slotDuration || '60');
  const steps = STEPS.some(([k]) => k === value) ? STEPS : [...STEPS, [value, `${value} мин`]];
  const nSvc = count(getBookingServices), nStaff = count(getBookingStaff);
  return (
    <>
      <Group title="Подключение">
        <Row title="Онлайн-страница записи" sub={connected ? 'Ссылка, QR-код, обновление услуг на странице' : 'Не подключена — клиенты пока не могут записываться через интернет'}
          value={connected ? 'Подключена' : 'Подключить'} onPress={onOpenOnline} />
      </Group>
      <Group title="Что видят клиенты" delay={60}>
        <Row title="Услуги для записи" sub={`${nSvc} в записи — название, цена, длительность`} onPress={() => go('services')} />
        <Row title="Мастера" sub={`${nStaff} принимают записи`} onPress={() => go('masters')} />
        <Row title="Оформление страницы" sub="Логотип, цвета, тексты, схема проезда, публикация" onPress={() => go('page')} />
      </Group>
      <Group title="Расписание" delay={120}>
        <HoursRow from={d.hoursFrom} to={d.hoursTo} onChange={h => set(setDraft, { hoursFrom: h.from, hoursTo: h.to })} />
        <ChipsRow title="Как клиент выбирает время" sub="«Только день» — без времени. Иначе клиент выбирает время с этим шагом; сколько оно занято, определяет длительность услуги."
          items={steps} value={value}
          onChange={k => set(setDraft, k === 'day' ? { timeSlotsEnabled: false } : { timeSlotsEnabled: true, slotDuration: k })} />
      </Group>
    </>
  );
}
