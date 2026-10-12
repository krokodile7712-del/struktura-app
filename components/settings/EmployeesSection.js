import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Group, Row, SwitchRow, ChipsRow, PickRow, NumField, Note } from './ui';
import ModalSheet from '../ModalSheet';
import GlassButton from '../GlassButton';
import { getUsers, addUser, updateUser, deleteUser, getUserPermissions, saveUserPermissions, DEFAULT_PERMISSIONS } from '../../db/queries';
import { setUserPermissions } from '../../db/session';
import { useToast } from '../Toast';
import { colors, fonts } from '../../constants/theme';

const SALARY = [['shift', 'За смену', '₽/смена', 'Фиксированная сумма за каждую смену'], ['hourly', 'Почасовая', '₽/час', 'Ставка умножается на часы смены'], ['monthly', 'Оклад', '₽/мес', 'Месячный оклад ÷ 22 рабочих дня'], ['revenue_pct', '% от выручки', '%', 'Процент от выручки за смену']];
const KPI = [['', 'Без плана', '', 'KPI не отслеживается'], ['revenue', 'Выручка', '₽', 'План по сумме продаж за период'], ['orders', 'Число чеков', 'шт', 'Важен поток, а не сумма'], ['avg_check', 'Средний чек', '₽', 'Упор на допродажи'], ['services', 'Кол-во услуг', 'шт', 'Для мастеров — не в деньгах'], ['returning_clients', 'Возврат клиентов', 'чел', 'Сколько клиентов вернулись повторно']];
const PERIOD = [['shift', 'За смену'], ['week', 'За неделю'], ['month', 'За месяц']];
const PERMS = [
  ['Касса', [['apply_discounts', 'Применять скидки'], ['view_order_history', 'История заказов'], ['cancel_orders', 'Отменять заказы']]],
  ['Клиенты', [['view_clients', 'Просматривать клиентов'], ['edit_clients', 'Редактировать клиентов'], ['manage_loyalty', 'Управлять баллами']]],
  ['Записи', [['edit_bookings', 'Добавлять, изменять и удалять записи']]],
  ['Склад', [['view_stock', 'Просматривать остатки'], ['edit_stock', 'Закупки и списания'], ['edit_thresholds', 'Изменять пороги']]],
  ['Товары', [['edit_products', 'Редактировать товары'], ['edit_cost_cards', 'Себестоимость и техкарты']]],
  ['Финансы', [['view_reports', 'Отчётность и P&L'], ['add_expenses', 'Добавлять расходы'], ['view_revenue', 'Видеть выручку смены']]],
  ['Настройки', [['access_settings', 'Доступ к разделу Настройки']]],
  ['Смена', [['open_shift', 'Открывать смену'], ['close_shift', 'Закрывать смену']]],
];
// Поля листа — на уровне модуля: иначе пересоздаются при каждой букве и курсор сбрасывается
const Field = ({ label, value, onChange, placeholder, secure, keyboardType, maxLength }) => (
  <View style={s.fl}><Text style={s.fll}>{label}</Text><TextInput style={s.fi} color={colors.text} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="rgba(255,255,255,0.25)" secureTextEntry={secure} keyboardType={keyboardType} maxLength={maxLength} /></View>
);
const blank = { id: null, name: '', pin: '', pin2: '', role: 'barista', salaryType: 'shift', salaryAmount: 0, kpiType: '', kpiAmount: 0, kpiPeriod: 'month', permissions: null };

/** «Сотрудники»: список, карточка сотрудника листом (имя, PIN, роль, оплата, KPI, права), удаление с PIN администратора. */
export default function EmployeesSection({ users, roleNames, isAdmin, askPin, onChanged }) {
  const toast = useToast(); const [m, setM] = useState(null); const [showPin, setShowPin] = useState(false);
  const set = patch => setM(x => ({ ...x, ...patch }));
  const open = u => { if (!isAdmin) return; setShowPin(false); setM(u ? { id: u.id, name: u.name, pin: '', pin2: '', role: u.role, salaryType: u.salary_type || 'shift', salaryAmount: Number(u.salary_amount) || 0, kpiType: u.kpi_type || '', kpiAmount: Number(u.kpi_amount) || 0, kpiPeriod: u.kpi_period || 'month', permissions: getUserPermissions(u.id) } : { ...blank, permissions: { ...DEFAULT_PERMISSIONS } }); };

  const save = () => {
    if (!m.name.trim()) { toast.show('Введите имя сотрудника', 'warn'); return; }
    if (m.pin !== m.pin2) { toast.show('PIN-коды не совпадают', 'warn'); return; }
    if (!m.id && m.pin.length < 4) { toast.show('PIN — минимум 4 цифры', 'warn'); return; }
    try {
      const extra = { kpiType: m.kpiType || '', kpiAmount: m.kpiAmount || 0, kpiPeriod: m.kpiPeriod || 'month' };
      const perms = m.permissions || DEFAULT_PERMISSIONS;
      // Результат обязательно проверяем: PIN может быть занят, нельзя понизить последнего администратора и т. п.
      const res = m.id ? updateUser(m.id, m.name, m.pin, m.role, m.salaryType, m.salaryAmount || 0, extra) : addUser(m.name, m.pin, m.role, m.salaryType, m.salaryAmount || 0, extra);
      if (!res?.ok) { toast.show(res?.error || 'Не удалось сохранить', 'warn'); return; }
      const id = m.id ?? res.id ?? getUsers().find(u => u.name === m.name.trim())?.id;
      if (m.role !== 'admin' && id) { saveUserPermissions(id, perms); if (m.id) setUserPermissions(id, perms); }
      setM(null); onChanged && onChanged();
    } catch (e) { console.error('[Сотрудники]', e); toast.show('Не удалось сохранить', 'warn'); }
  };
  const remove = () => askPin('Удалить сотрудника', `Введите ваш PIN-код администратора, чтобы удалить «${m.name}».`, () => {
    try { const r = deleteUser(m.id); if (!r?.ok) { toast.show(r?.error || 'Не удалось удалить', 'warn'); return; } setM(null); onChanged && onChanged(); } catch (e) { console.error(e); toast.show('Не удалось удалить', 'warn'); }
  });
  const unit = (list, key) => (list.find(x => x[0] === key) || [])[2] || '';

  return (
    <>
      {!isAdmin && <Note warn>Управлять сотрудниками и PIN-кодами может только администратор.</Note>}
      <Group title="Команда">
        {users.map(u => <Row key={u.id} title={u.name} sub={`${u.role === 'admin' ? roleNames.admin : roleNames.barista}${u.salary_amount > 0 ? `  ·  ${u.salary_amount} ₽` : ''}`} onPress={isAdmin ? () => open(u) : undefined} />)}
        {isAdmin && <Row title="Добавить сотрудника" onPress={() => open(null)} />}
      </Group>
      {users.length === 0 && <Note>Сотрудников нет. Добавьте первого.</Note>}

      <ModalSheet visible={!!m} onClose={() => setM(null)} title={m?.id ? 'Сотрудник' : 'Новый сотрудник'} width="72%" maxWidth={680}
        footer={<View style={s.fb}><GlassButton tone="accent" label="Сохранить" height={50} onPress={save} style={{ flex: 1 }} />{m?.id && <GlassButton label="Удалить" height={50} onPress={remove} style={{ marginLeft: 8 }} />}</View>}>
        {m && (<>
          <Field label="Имя" value={m.name} onChange={v => set({ name: v })} placeholder="Иван Петров" />
          <Field label={m.id ? 'Новый PIN (пусто — не менять)' : 'PIN-код'} value={m.pin} onChange={v => set({ pin: v.replace(/\D/g, '') })} placeholder="4 цифры и больше" secure={!showPin} keyboardType="number-pad" maxLength={8} />
          <Field label="Повтор PIN" value={m.pin2} onChange={v => set({ pin2: v.replace(/\D/g, '') })} placeholder="Повторите" secure={!showPin} keyboardType="number-pad" maxLength={8} />
          <Pressable onPress={() => setShowPin(v => !v)} hitSlop={8}><Text style={s.link}>{showPin ? 'Скрыть PIN' : 'Показать PIN'}</Text></Pressable>
          <Group title="Роль"><ChipsRow title="Доступ" sub={m.role === 'admin' ? 'Полный доступ: настройки, отчёты, все разделы' : 'Базовый доступ: касса, клиенты. Права ниже'} items={[['admin', roleNames.admin], ['barista', roleNames.barista]]} value={m.role} onChange={k => set({ role: k })} /></Group>
          <Group title="Оплата труда">
            {SALARY.map(([k, t, u, h]) => <PickRow key={k} title={t} sub={h} selected={m.salaryType === k} onPress={() => set({ salaryType: k })} />)}
            <View style={s.amt}><Text style={s.amtT}>Размер</Text><NumField value={m.salaryAmount} onChange={v => set({ salaryAmount: v })} min={0} max={m.salaryType === 'revenue_pct' ? 100 : 10000000} step={m.salaryType === 'revenue_pct' ? 1 : 100} unit={unit(SALARY, m.salaryType)} width={110} /></View>
          </Group>
          <Group title="План KPI">
            {KPI.map(([k, t, u, h]) => <PickRow key={k || 'none'} title={t} sub={h} selected={m.kpiType === k} onPress={() => set({ kpiType: k })} />)}
            {!!m.kpiType && <View style={s.amt}><Text style={s.amtT}>План</Text><NumField value={m.kpiAmount} onChange={v => set({ kpiAmount: v })} min={0} step={100} unit={unit(KPI, m.kpiType)} width={110} /></View>}
            {!!m.kpiType && <ChipsRow title="За какой период" items={PERIOD} value={m.kpiPeriod} onChange={k => set({ kpiPeriod: k })} />}
          </Group>
          {m.role !== 'admin' && m.permissions && PERMS.map(([g, items]) => <Group key={g} title={`Права: ${g}`}>{items.map(([k, t]) => <SwitchRow key={k} title={t} value={!!m.permissions[k]} onChange={() => set({ permissions: { ...m.permissions, [k]: !m.permissions[k] } })} />)}</Group>)}
        </>)}
      </ModalSheet>
    </>
  );
}
const s = StyleSheet.create({
  fl: { marginBottom: 12 }, fll: { fontFamily: fonts.familySemibold, fontSize: 12.5, color: colors.textDim, marginBottom: 6 },
  fi: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.familySemibold, fontSize: 15.5, color: colors.text, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  link: { fontFamily: fonts.familySemibold, fontSize: 13.5, color: colors.orangeLight, marginBottom: 4 }, fb: { flexDirection: 'row' },
  amt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12 }, amtT: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.textDim },
});
