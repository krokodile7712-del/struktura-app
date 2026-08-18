import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TouchableOpacity, Modal, TextInput, Share, Animated, LayoutAnimation, Platform, Alert, BackHandler, useWindowDimensions, Dimensions, Image, Clipboard } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import AppNav from '../components/AppNav';
import {
  getAllProductsAdmin, insertProduct, setProductActive,
  getProductVariants, getProductAxesWithValues, saveProductAxesAndVariants,
  getProductModifierGroups, setProductModifierGroups, getAllModifierGroups,
  insertModifierGroup, updateModifierGroup, deleteModifierGroup,
  insertModifierOption, updateModifierOption, deleteModifierOption,
  getCostCardForVariant, saveCostCardForVariant,
  getUsers, updateUserPin, addUser, updateUser, deleteUser,
  getUserPermissions, saveUserPermissions, DEFAULT_PERMISSIONS,
  getDiscounts, setSetting, getSetting, getLoyaltyConfig, updateLoyaltyConfig,
  getPayMethods, savePayMethods,
  getZones, addZone, updateZone, deleteZone,
  addZoneTable, updateZoneTable, deleteZoneTable, bulkAddZoneTables,
  getPriceSchedules, addPriceSchedule, deletePriceSchedule, applyPendingPriceSchedules,
  getAllStock, updateStockThreshold,
  getUnlinkedCostCards,
  getBusinessProfile, updateBusinessProfile, applyBusinessPreset, BUSINESS_PRESETS,
  getTerms, getRoleNames, pluralizeRu, genitivePluralRu, genitiveSingularRu,
  exportAllData, importAllData, BACKUP_TABLES_INFO, resetDatabase,
} from '../db/queries';
import { canConvert, conversionFactor } from '../constants/units';
import { getDb } from '../db/database';
import Hint from '../components/Hint';
import InfoTip from '../components/InfoTip';
import Toggle from '../components/Toggle';
import { can, getSession, setPermissions, setUserPermissions, clearSession, goBackSmart } from '../db/session';
import { resetKassaCart } from '../db/cartStore';
import EmptyState from '../components/EmptyState';
import { colors, fonts, spacing } from '../constants/theme';
import { upsertBusiness, syncServicesToSupabase } from '../db/supabase';
import { useToast } from '../components/Toast';

// SectionAccordion — в 2-колоночном layout просто передаёт children
// Пресеты терминологии — та же логика, что в мастере настройки (Онбординг),
// но доступна отдельно в Настройках без прохождения всего мастера заново
const TERM_CONFIGS = [
  {
    key: 'order',
    icon: '🛒',
    title: 'Как называть заказ?',
    desc: 'Слово видно при создании нового чека в кассе, в истории продаж и отчётах',
    presets: ['Заказ', 'Запись', 'Чек', 'Счёт', 'Бронь', 'Позиция', 'Партия'],
  },
  {
    key: 'client',
    icon: '👤',
    title: 'Как называть клиента?',
    desc: 'Используется в карточках лояльности, поиске и карточке клиента',
    presets: ['Клиент', 'Гость', 'Покупатель', 'Пациент', 'Участник', 'Студент', 'Заказчик'],
  },
  {
    key: 'item',
    icon: '📦',
    title: 'Как называть товар / услугу?',
    desc: 'Позиция в меню, на складе и в техкартах',
    presets: ['Товар', 'Услуга', 'Блюдо', 'Позиция', 'Продукт', 'Процедура', 'Изделие'],
  },
  {
    key: 'category',
    icon: '🗂',
    title: 'Как называть категорию?',
    desc: 'Группировка товаров/услуг в меню кассы',
    presets: ['Категория', 'Раздел', 'Группа', 'Тип', 'Вид', 'Секция'],
  },
];

// Модули — какие разделы функциональности включены для бизнеса в целом
// (не путать с правами доступа сотрудника — те настраиваются отдельно, в Сотрудниках)
const MODULE_LIST = [
  { key: 'stock',      label: 'Склад',      desc: 'Учёт остатков, закупки, списания' },
  { key: 'shifts',     label: 'Смены',      desc: 'Открытие/закрытие смен, касса наличных' },
  { key: 'clients',    label: 'Клиенты',    desc: 'База клиентов, карточки, история покупок' },
  { key: 'loyalty',    label: 'Лояльность', desc: 'Баллы, скидки или абонементы для клиентов' },
  { key: 'modifiers',  label: 'Опции',         desc: 'Доп. опции у товара — размер, вкус, добавки за отдельную плату' },
  { key: 'inventory',  label: 'Инвентаризация', desc: 'Сверка фактических остатков склада' },
  { key: 'locations',  label: 'Локации',    desc: 'Несколько точек хранения/продажи' },
  { key: 'zones',      label: 'Зоны и столы', desc: 'Нумерация мест в зале' },
  { key: 'templates',  label: 'Шаблоны заказов', desc: 'Быстрый повтор частых заказов' },
];

const ROLE_LIST = [
  { key: 'barista', label: 'Рядовой сотрудник', placeholder: 'напр. Кассир, Мастер, Продавец' },
  { key: 'admin',   label: 'Администратор',     placeholder: 'напр. Управляющий, Директор' },
];

function SectionAccordion({ sectionKey, selectedSection, children }) {
  if (selectedSection !== sectionKey) return null;
  return <View style={{ flex: 1 }}>{children}</View>;
}


// LayoutAnimation работает автоматически в New Architecture

export default function SettingsScreen({ navigation, route }) {
  // ── Данные ──
  const [products, setProducts]             = useState([]);
  const [users, setUsers]                   = useState([]);
  const [discounts, setDiscounts]           = useState([]);
  const [payMethodsList, setPayMethodsList] = useState([]);
  const [payMethodModal, setPayMethodModal] = useState(null);
  const [zones, setZones]           = useState([]);
  const [zoneModal, setZoneModal]   = useState(null); // {id?, name, tables:[{id,name}], newTableInput, bulkPrefix, bulkFrom, bulkTo} // {index, id, name, icon, type, active}
  const [modifierGroups, setModifierGroups] = useState([]);
  const [stock, setStock]                   = useState([]);
  const [unlinkedCards, setUnlinkedCards]   = useState([]);
  const [profile, setProfile]               = useState(null);

  // ── Модалки ──
  const [discountModal, setDiscountModal]       = useState(null);

  // ── PIN ──
  const [pinBarista, setPinBarista] = useState('');
  const [pinAdmin, setPinAdmin]     = useState('');

  // ── Общие настройки ──
  const [loyaltyModel,  setLoyaltyModel]  = useState('points');
  const [loyaltyConfig, setLoyaltyConfig] = useState({ earn_pct: 10, allow_spend: false, point_value: 1, pct: 5, deduct_per_visit: 1 });

  const toast = useToast();
  const { width: SW } = useWindowDimensions();
  const isPhone = SW < 600;
  const [selectedSection, setSelectedSection] = useState(route?.params?.section || 'employees');
  const [qrModal, setQrModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [bookingSlug, setBookingSlug] = useState(() => {
    try { return getBusinessProfile()?.booking_slug || ''; } catch { return ''; }
  });
  const [bookingConnected, setBookingConnected] = useState(() => {
    try { return !!(getBusinessProfile()?.booking_slug); } catch { return false; }
  });
  const [bizDraft, setBizDraft]         = useState(null);
  const [termsOpen, setTermsOpen]       = useState(false);
  const [modulesOpen, setModulesOpen]   = useState(false);
  const [rolesOpen, setRolesOpen]       = useState(false);
  const [receiptPreview, setReceiptPreview] = useState(false);
  const [empModal, setEmpModal]         = useState(null);
  const [showPin, setShowPin]           = useState(false);
  const [roleNames, setRoleNames]       = useState({ admin: 'Администратор', barista: 'Сотрудник' });

  useEffect(() => { loadAll(); }, []);

  // ── Лояльность ──
  const saveLoyalty = () => {
    try { updateLoyaltyConfig(loyaltyModel, loyaltyConfig); loadAll(); toast.show('Лояльность сохранена ✓', 'info'); } catch (e) { console.error(e); toast.show('Ошибка', 'warn'); }
  };

  // ── PIN ──
  const savePins = () => {
    try {
      if (pinBarista.trim()) updateUserPin('barista', pinBarista.trim());
      if (pinAdmin.trim()) updateUserPin('admin', pinAdmin.trim());
      loadAll();
      toast.show('PIN-коды сохранены ✓', 'info');
    } catch (e) { console.error(e); toast.show('Ошибка', 'warn'); }
  };

  // ── Способы оплаты ──
  const openNewPayMethod = () => {
    const id = 'pm_' + Date.now();
    setPayMethodModal({ index: -1, id, name: '', icon: '💳', type: 'card', active: true });
  };
  const openEditPayMethod = (m, idx) => setPayMethodModal({ ...m, index: idx });
  const savePayMethod = () => {
    if (!payMethodModal || !payMethodModal.name.trim()) return;
    const list = [...payMethodsList];
    const m = { id: payMethodModal.id, name: payMethodModal.name.trim(), icon: payMethodModal.icon || '💳', type: payMethodModal.type, active: payMethodModal.active };
    if (payMethodModal.index === -1) list.push(m);
    else list[payMethodModal.index] = m;
    savePayMethods(list);
    setPayMethodsList(list);
    setPayMethodModal(null);
  };
  const deletePayMethod = () => {
    if (!payMethodModal || payMethodsList.length <= 1) return;
    const list = payMethodsList.filter((_, i) => i !== payMethodModal.index);
    savePayMethods(list);
    setPayMethodsList(list);
    setPayMethodModal(null);
  };
  const togglePayMethodActive = (idx) => {
    const list = payMethodsList.map((m, i) => i === idx ? { ...m, active: !m.active } : m);
    savePayMethods(list);
    setPayMethodsList(list);
  };

  // ── Зоны/столы ──
  const saveZoneName = () => {
    if (!zoneModal || !zoneModal.name.trim()) return;
    try {
      if (zoneModal.id) updateZone(zoneModal.id, zoneModal.name.trim());
      else {
        const newId = addZone(zoneModal.name.trim());
        setZoneModal(m => ({ ...m, id: newId, tables: [] }));
        setZones(getZones());
        return; // остаёмся в модалке для добавления столов
      }
      setZones(getZones());
    } catch (e) { console.error(e); }
    setZoneModal(null);
  };
  const addTableToZone = () => {
    if (!zoneModal?.id || !zoneModal.newTableInput?.trim()) return;
    try {
      addZoneTable(zoneModal.id, zoneModal.newTableInput.trim());
      const updated = getZones();
      setZones(updated);
      const z = updated.find(z => z.id === zoneModal.id);
      setZoneModal(m => ({ ...m, tables: z?.tables || [], newTableInput: '' }));
    } catch (e) { console.error(e); }
  };
  const removeTableFromZone = (tableId) => {
    try {
      deleteZoneTable(tableId);
      const updated = getZones();
      setZones(updated);
      const z = updated.find(z => z.id === zoneModal?.id);
      setZoneModal(m => ({ ...m, tables: z?.tables || [] }));
    } catch (e) { console.error(e); }
  };
  const bulkAddTables = () => {
    if (!zoneModal?.id) return;
    const prefix = zoneModal.bulkPrefix?.trim() || 'Стол';
    const from = parseInt(zoneModal.bulkFrom) || 1;
    const to = parseInt(zoneModal.bulkTo) || from;
    if (from > to || to - from > 99) return;
    try {
      bulkAddZoneTables(zoneModal.id, prefix, from, to);
      const updated = getZones();
      setZones(updated);
      const z = updated.find(z => z.id === zoneModal.id);
      setZoneModal(m => ({ ...m, tables: z?.tables || [], bulkFrom: '', bulkTo: '' }));
    } catch (e) { console.error(e); }
  };
  const removeZone = () => {
    if (!zoneModal?.id) return;
    try { deleteZone(zoneModal.id); setZones(getZones()); } catch (e) { console.error(e); }
    setZoneModal(null);
  };

  // ── Скидки ──
  const saveDiscounts = (list) => {
    try { setSetting('discounts', JSON.stringify(list)); setDiscounts(list); toast.show('Скидки сохранены ✓', 'info'); } catch (e) { console.error(e); toast.show('Ошибка', 'warn'); }
  };
  const openNewDiscount = () => setDiscountModal({ index: -1, name: '', pct: '', desc: '' });
  const openEditDiscount = (i) => setDiscountModal({ index: i, name: discounts[i].name, pct: String(discounts[i].pct), desc: discounts[i].desc || '' });
  const saveDiscountModal = () => {
    if (!discountModal || !discountModal.name.trim() || !discountModal.pct) return;
    const entry = { name: discountModal.name.trim(), pct: parseFloat(discountModal.pct) || 0, desc: (discountModal.desc || '').trim() };
    const list = [...discounts];
    if (discountModal.index === -1) list.push(entry); else list[discountModal.index] = entry;
    saveDiscounts(list);
    setDiscountModal(null);
  };
  const deleteDiscountModal = () => {
    if (!discountModal || discountModal.index === -1) return;
    saveDiscounts(discounts.filter((_, i) => i !== discountModal.index));
    setDiscountModal(null);
  };

  // Открываем редактор профиля при переходе в секцию
  React.useEffect(() => {
    if (selectedSection === 'business' && profile) {
      setBizDraft({
        taxSystem:     profile.tax_system      || 'usn_income',
        vatRate:       profile.vat_rate        || 'none',
        autoFiscal:    profile.auto_fiscal     === '1',
        businessType:  profile.business_type  || 'cafe',
        timeSlotsEnabled: profile.time_slots_enabled !== false,
        slotDuration:  String(profile.slot_duration || '60'),
        businessName:  profile.business_name  || '',
        logoUrl:       profile.logo_base64    || profile.logo_url || '',
        city:          profile.city           || '',
        phone:         profile.phone          || '',
        address:       profile.address        || '',
        hoursFrom:     profile.work_hours_from || '09:00',
        hoursTo:       profile.work_hours_to   || '21:00',
        inn:           profile.inn            || '',
        receiptName:   profile.receipt_name   || '',
        receiptFooter: profile.receipt_footer || '',
        currency:      profile.currency       || '₽',
        dateFormat:    profile.date_format    || 'DD.MM.YYYY',
        email:         profile.email          || '',
        whatsapp:      profile.whatsapp       || '',
        telegram:      profile.telegram       || '',
        instagram:     profile.instagram      || '',
        vk:            profile.vk             || '',
        website:       profile.website        || '',
        terms:         getTerms(),
        modules:       profile.modules || {},
        roles:         getRoleNames(),
        theme:         profile.theme          || 'dark',
      });
    }
  }, [selectedSection, profile]);

  const saveBizDraft = () => {
    if (!bizDraft) return;
    try {
      updateBusinessProfile({
        businessName:  bizDraft.businessName,
        taxSystem:         bizDraft.taxSystem,
        vatRate:           bizDraft.vatRate,
        autoFiscal:        !!bizDraft.autoFiscal,
        businessType:      bizDraft.businessType,
        timeSlotsEnabled:  bizDraft.timeSlotsEnabled !== false,
        slotDuration:      parseInt(bizDraft.slotDuration) || 60,
        logoBase64:    bizDraft.logoUrl,
        city:          bizDraft.city,
        phone:         bizDraft.phone,
        address:       bizDraft.address,
        workHoursFrom: bizDraft.hoursFrom,
        workHoursTo:   bizDraft.hoursTo,
        inn:           bizDraft.inn,
        receiptName:   bizDraft.receiptName,
        receiptFooter: bizDraft.receiptFooter,
        currency:      bizDraft.currency,
        dateFormat:    bizDraft.dateFormat,
        email:         bizDraft.email,
        whatsapp:      bizDraft.whatsapp,
        telegram:      bizDraft.telegram,
        instagram:     bizDraft.instagram,
        vk:            bizDraft.vk,
        website:       bizDraft.website,
        theme:         bizDraft.theme,
        modules:       bizDraft.modules || {},
        terms:         bizDraft.terms   || {},
        roles:         bizDraft.roles   || {},
        units:         profile?.units   || [],
        accessKey:     profile?.access_key || '',
        preset:        profile?.preset  || 'custom',
      });
      loadAll();
      toast.show('Профиль сохранён ✓', 'info');
    } catch(e) { console.error(e); toast.show('Ошибка сохранения', 'warn'); }
  };

  const loadAll = () => {
    try { setProducts(getAllProductsAdmin()); } catch(e) { console.error('products',e); }
    try {
      const u = getUsers();
      setUsers(u);
      setRoleNames(getRoleNames());
      setPinBarista(u.find(x => x.role === 'barista')?.pin || '');
      setPinAdmin(u.find(x => x.role === 'admin')?.pin || '');
    } catch(e) { console.error('users',e); }
    try { setDiscounts(getDiscounts()); } catch(e) {}
    try { setPayMethodsList(getPayMethods()); } catch(e) {}
    try { setZones(getZones()); } catch(e) {}
    try { setModifierGroups(getAllModifierGroups()); } catch(e) {}
    try { setStock(getAllStock()); } catch(e) {}
    try {
      const lc = getLoyaltyConfig();
      setLoyaltyModel(lc.model || 'points');
      setLoyaltyConfig(c => ({ ...c, ...lc.config }));
    } catch(e) {}
    try { setUnlinkedCards(getUnlinkedCostCards()); } catch(e) {}
    try { setProfile(getBusinessProfile()); } catch(e) {}
  };

  const handleExportSave = async () => {
    try {
      const data = exportAllData();
      const json = JSON.stringify(data, null, 2);
      const fileName = `struktura-backup-${new Date().toISOString().slice(0, 10)}.json`;

      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permissions.granted) return;
        const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, fileName, 'application/json');
        await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
        toast.show('Резервная копия сохранена ✓', 'info');
      } else {
        await Share.share({ message: json, title: fileName });
      }
    } catch (e) {
      console.error('[handleExportSave]', e);
      toast.show('Не удалось сохранить копию: ' + (e?.message || ''), 'warn');
    }
  };

  const handleExportShare = async () => {
    try {
      const data = exportAllData();
      const json = JSON.stringify(data, null, 2);
      await Share.share({ message: json, title: 'Резервная копия СТРУКТУРА' });
    } catch (e) { console.error(e); toast.show('Не удалось создать копию', 'warn'); }
  };

  // ── Импорт / восстановление из бэкапа ──
  const [importing, setImporting] = useState(false);

  const doImport = (data) => {
    setImporting(true);
    try {
      const res = importAllData(data);
      setImporting(false);
      if (!res.ok) {
        Alert.alert('Ошибка', res.error || 'Не удалось восстановить данные');
        return;
      }
      let msg = `Восстановлено разделов: ${res.restored.length} из ${BACKUP_TABLES_INFO.length}.`;
      if (res.skipped.length > 0) {
        msg += `\n\nПропущено (отсутствовали в файле):\n${res.skipped.map(l => '• ' + l).join('\n')}`;
      }
      if (res.errors.length > 0) {
        msg += `\n\nОшибки при восстановлении:\n${res.errors.map(l => '• ' + l).join('\n')}`;
      }
      Alert.alert('Восстановление завершено', msg, [
        { text: 'Ок', onPress: () => { resetKassaCart(); clearSession(); navigation.navigate('Login'); } },
      ]);
    } catch (e) {
      setImporting(false);
      console.error('[doImport]', e);
      toast.show('Ошибка восстановления: ' + (e?.message || ''), 'warn');
    }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets?.[0];
      if (!file) return;
      setImporting(true);
      const response = await fetch(file.uri);
      const content = await response.text();
      let data;
      try { data = JSON.parse(content); }
      catch (_) { throw new Error('Файл повреждён или это не резервная копия (не JSON)'); }
      setImporting(false);

      const list = BACKUP_TABLES_INFO.map(t => '• ' + t.label).join('\n');
      Alert.alert(
        'Восстановить из резервной копии?',
        `Это ПОЛНОСТЬЮ заменит все текущие данные приложения на данные из файла:\n\n${list}\n\nОтменить это действие нельзя. Продолжить?`,
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Восстановить', style: 'destructive', onPress: () => doImport(data) },
        ]
      );
    } catch (e) {
      setImporting(false);
      console.error('[handleImport]', e);
      toast.show('Не удалось прочитать файл: ' + (e?.message || 'ошибка'), 'warn');
    }
  };

  const categories = [...new Set(products.map(p => p.category))];
  const modules = profile?.modules || {};
  const terms = getTerms();

  const SECTIONS = [
    { key: 'employees', label: 'Сотрудники' },
    { key: 'loyalty',   label: 'Лояльность' },
    { key: 'payment',   label: 'Оплата и скидки' },
    { key: 'stock',     label: 'Склад' },
    { key: 'business',  label: 'Профиль бизнеса' },
    { key: 'system',    label: 'Система' },
  ];

  const visibleSections = SECTIONS.filter(s => {
    if (s.key === 'stock' && modules.stock === false) return false;
    if (s.key === 'loyalty' && modules.loyalty === false) return false;
    return true;
  });

  const rightPanel = (
    <>
    <ScrollView
      style={styles.rightPanel}
      contentContainerStyle={styles.rightInner}
      keyboardShouldPersistTaps="handled"
    >
      {/* Заголовок секции */}
      <Text style={styles.sectionTitle}>
        {SECTIONS.find(s => s.key === selectedSection)?.label || ''}
      </Text>

        <SectionAccordion sectionKey="employees" selectedSection={selectedSection}>

        {/* Шапка с кнопкой + */}
        <View style={styles.menuTopBarSticky}>
          <Text style={styles.menuTopTitle}>Сотрудники</Text>
          <View style={styles.menuFloatBtns} pointerEvents="box-none">
            <View style={styles.menuFloatRow}>
              <Pressable
                onPress={() => setEmpModal({ id: null, name: '', pin: '', pin2: '', role: 'barista', salaryType: 'shift', salaryAmount: '', permissions: { ...DEFAULT_PERMISSIONS } })}
                hitSlop={14}
                style={[styles.menuBadge, styles.menuBadgeAdd]}
              >
                <Text style={[styles.menuBadgeText, { color: colors.orange }]}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Список сотрудников */}
        {users.length === 0 ? (
          <Text style={[styles.empty, { paddingVertical: 20 }]}>Нет сотрудников. Нажмите + чтобы добавить.</Text>
        ) : (
          <View style={styles.menuCard}>
            {users.map((u, idx) => (
              <Pressable
                key={u.id}
                style={({ pressed }) => [
                  styles.menuRow,
                  idx < users.length - 1 && styles.menuRowDiv,
                  pressed && { backgroundColor: 'rgba(255,255,255,0.03)' },
                ]}
                onPress={() => setEmpModal({ id: u.id, name: u.name, pin: u.pin, pin2: u.pin, role: u.role, salaryType: u.salary_type || 'shift', salaryAmount: String(u.salary_amount || ''), permissions: getUserPermissions(u.id) })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemName}>{u.name}</Text>
                  <Text style={styles.menuItemSub}>
                    {u.role === 'admin' ? roleNames.admin : roleNames.barista}
                    {u.salary_amount > 0 ? `  ·  ${u.salary_amount} ₽` : ''}
                  </Text>
                </View>
                <Text style={styles.menuItemArrow}>›</Text>
              </Pressable>
            ))}
          </View>
        )}

        </SectionAccordion>

        <SectionAccordion sectionKey="loyalty" selectedSection={selectedSection}>
        {modules.loyalty !== false ? (<>

          {/* Выбор модели */}
          <View style={styles.menuCard}>
            {[
              {
                key: 'points',
                icon: '⭐',
                label: 'Баллы',
                desc: 'Клиент копит баллы с каждой покупки и тратит их как скидку',
                tip: 'Подходит для любого бизнеса — стимулирует повторные покупки.',
              },
              {
                key: 'discount',
                icon: '🏷',
                label: 'Фиксированная скидка',
                desc: 'Постоянная скидка для каждого клиента из базы',
                tip: 'Подходит для салонов и услуг — у каждого клиента своя скидка.',
              },
              {
                key: 'subscription',
                icon: '🎟',
                label: 'Абонемент',
                desc: 'Клиент покупает N визитов, каждый заказ списывает один',
                tip: 'Идеально для занятий, стрижек, массажа — продаёте пакет заранее.',
              },
            ].map((m, idx) => (
              <Pressable
                key={m.key}
                style={[styles.menuRow, idx < 2 && styles.menuRowDiv, loyaltyModel === m.key && { backgroundColor: 'rgba(240,160,80,0.06)' }]}
                onPress={() => setLoyaltyModel(m.key)}
              >
                <Text style={{ fontSize: 22, marginRight: 12 }}>{m.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuItemName, loyaltyModel === m.key && { color: colors.orange }]}>{m.label}</Text>
                  <Text style={styles.menuItemSub}>{m.desc}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <InfoTip title={m.label} text={m.tip} />
                  <View style={[styles.productCheckbox, loyaltyModel === m.key && styles.productCheckboxOn]}>
                    {loyaltyModel === m.key && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                  </View>
                </View>
              </Pressable>
            ))}
          </View>

          {/* ── Настройки модели Баллы ── */}
          {loyaltyModel === 'points' && (() => {
            const earnPct   = loyaltyConfig.earn_pct   ?? 10;
            const ptValue   = loyaltyConfig.point_value ?? 1;
            const example   = 500;
            const earned    = Math.round(example * earnPct / 100);
            const earnedRub = Math.round(earned * ptValue);
            return (
              <View style={{ marginTop: 16 }}>
                <View style={styles.menuCard}>
                  <View style={[styles.menuRow, styles.menuRowDiv]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuItemName}>За каждые 100 ₽</Text>
                      <Text style={styles.menuItemSub}>Сколько баллов начисляется</Text>
                    </View>
                    <TextInput
                      color={colors.text}
                      style={styles.loyaltyInput}
                      keyboardType="numeric"
                      value={String(earnPct)}
                      onChangeText={v => setLoyaltyConfig(c => ({ ...c, earn_pct: parseFloat(v) || 0 }))}
                      placeholderTextColor={colors.muted}
                    />
                    <Text style={styles.loyaltyUnit}>балл.</Text>
                  </View>
                  <View style={styles.menuRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuItemName}>1 балл равен</Text>
                      <Text style={styles.menuItemSub}>Ценность при списании</Text>
                    </View>
                    <TextInput
                      color={colors.text}
                      style={styles.loyaltyInput}
                      keyboardType="numeric"
                      value={String(ptValue)}
                      onChangeText={v => setLoyaltyConfig(c => ({ ...c, point_value: parseFloat(v) || 1 }))}
                      placeholderTextColor={colors.muted}
                    />
                    <Text style={styles.loyaltyUnit}>₽</Text>
                  </View>
                </View>

                {/* Живой пример */}
                <View style={styles.loyaltyExample}>
                  <Text style={styles.loyaltyExampleTitle}>Пример: заказ на {example} ₽</Text>
                  <Text style={styles.loyaltyExampleLine}>Клиент получит <Text style={styles.loyaltyExampleAccent}>{earned} баллов</Text> = <Text style={styles.loyaltyExampleAccent}>{earnedRub} ₽</Text> скидки при следующем заказе</Text>
                </View>

                {/* Списание баллов */}
                <View style={[styles.menuCard, { marginTop: 12 }]}>
                  <Pressable
                    style={[styles.menuRow, loyaltyConfig.allow_spend && styles.menuRowDiv]}
                    onPress={() => setLoyaltyConfig(c => ({ ...c, allow_spend: !c.allow_spend }))}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuItemName}>Разрешить тратить баллы</Text>
                      <Text style={styles.menuItemSub}>Клиент может оплатить часть заказа баллами</Text>
                    </View>
                    <Toggle value={!!loyaltyConfig.allow_spend} onValueChange={v => setLoyaltyConfig(c => ({ ...c, allow_spend: v }))} size="sm" />
                  </Pressable>
                  {loyaltyConfig.allow_spend && (
                    <View style={styles.menuRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.menuItemName}>Максимум баллами</Text>
                        <Text style={styles.menuItemSub}>% от суммы заказа</Text>
                      </View>
                      <TextInput
                        color={colors.text}
                        style={styles.loyaltyInput}
                        keyboardType="numeric"
                        value={String(loyaltyConfig.max_spend_pct ?? 50)}
                        onChangeText={v => setLoyaltyConfig(c => ({ ...c, max_spend_pct: parseFloat(v) || 0 }))}
                        placeholderTextColor={colors.muted}
                      />
                      <Text style={styles.loyaltyUnit}>%</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })()}

          {/* ── Настройки модели Скидка ── */}
          {loyaltyModel === 'discount' && (() => {
            const pct = loyaltyConfig.pct ?? 5;
            const example = 500;
            const disc = Math.round(example * pct / 100);
            return (
              <View style={{ marginTop: 16 }}>
                <View style={styles.menuCard}>
                  <View style={styles.menuRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuItemName}>Скидка клиентам из базы</Text>
                      <Text style={styles.menuItemSub}>Применяется автоматически при выборе клиента</Text>
                    </View>
                    <TextInput
                      color={colors.text}
                      style={styles.loyaltyInput}
                      keyboardType="numeric"
                      value={String(pct)}
                      onChangeText={v => setLoyaltyConfig(c => ({ ...c, pct: parseFloat(v) || 0 }))}
                      placeholderTextColor={colors.muted}
                    />
                    <Text style={styles.loyaltyUnit}>%</Text>
                  </View>
                </View>
                <View style={styles.loyaltyExample}>
                  <Text style={styles.loyaltyExampleTitle}>Пример: заказ на {example} ₽</Text>
                  <Text style={styles.loyaltyExampleLine}>Клиент заплатит <Text style={styles.loyaltyExampleAccent}>{example - disc} ₽</Text> вместо {example} ₽ <Text style={{ color: colors.red }}>(−{disc} ₽)</Text></Text>
                </View>
                <View style={[styles.menuCard, { marginTop: 12 }]}>
                  <View style={styles.menuRow}>
                    <Text style={[styles.menuItemSub, { flex: 1 }]}>💡 Скидку для конкретного клиента можно изменить в карточке клиента</Text>
                  </View>
                </View>
              </View>
            );
          })()}

          {/* ── Настройки модели Абонемент ── */}
          {loyaltyModel === 'subscription' && (
            <View style={{ marginTop: 16 }}>
              <View style={styles.menuCard}>
                <View style={styles.menuRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuItemName}>Списывать за 1 заказ</Text>
                    <Text style={styles.menuItemSub}>Сколько визитов расходуется</Text>
                  </View>
                  <TextInput
                    color={colors.text}
                    style={styles.loyaltyInput}
                    keyboardType="numeric"
                    value={String(loyaltyConfig.deduct_per_visit ?? 1)}
                    onChangeText={v => setLoyaltyConfig(c => ({ ...c, deduct_per_visit: parseFloat(v) || 1 }))}
                    placeholderTextColor={colors.muted}
                  />
                  <Text style={styles.loyaltyUnit}>виз.</Text>
                </View>
              </View>
              <View style={styles.loyaltyExample}>
                <Text style={styles.loyaltyExampleTitle}>Как это работает</Text>
                <Text style={styles.loyaltyExampleLine}>Пополните баланс клиента в его карточке → при каждом заказе автоматически спишется <Text style={styles.loyaltyExampleAccent}>{loyaltyConfig.deduct_per_visit ?? 1} виз.</Text></Text>
              </View>
            </View>
          )}

          {/* Общий лимит */}
          <View style={[styles.menuCard, { marginTop: 16 }]}>
            <View style={styles.menuRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemName}>Максимальная скидка на заказ</Text>
                <Text style={styles.menuItemSub}>Сумма всех скидок не превысит этот %</Text>
              </View>
              <TextInput
                color={colors.text}
                style={styles.loyaltyInput}
                keyboardType="numeric"
                value={String(loyaltyConfig.max_discount_pct ?? 100)}
                onChangeText={v => setLoyaltyConfig(c => ({ ...c, max_discount_pct: parseFloat(v) || 100 }))}
                placeholderTextColor={colors.muted}
              />
              <Text style={styles.loyaltyUnit}>%</Text>
            </View>
          </View>

          {/* Сохранить */}
          <Pressable
            style={({ pressed }) => [styles.confirmBtn, { marginTop: 16 }, pressed && { opacity: 0.88 }]}
            onPress={saveLoyalty}
          >
            <Text style={styles.confirmBtnText}>Сохранить</Text>
          </Pressable>

        </>) : (
          <View style={[styles.menuCard, { marginTop: 12 }]}>
            <View style={styles.menuRow}>
              <Text style={styles.menuItemSub}>Модуль лояльности отключён в настройках профиля бизнеса.</Text>
            </View>
          </View>
        )}
        </SectionAccordion>

        <SectionAccordion sectionKey="payment" selectedSection={selectedSection}>

        {/* ── Способы оплаты ── */}
        <View style={styles.menuTopBarSticky}>
          <Text style={styles.menuTopTitle}>Способы оплаты</Text>
          <View style={styles.menuFloatBtns} pointerEvents="box-none">
            <View style={styles.menuFloatRow}>
              <Pressable onPress={openNewPayMethod} hitSlop={14} style={styles.addPayMethodBtn}>
                <Text style={styles.addPayMethodBtnText}>+ Способ</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {payMethodsList.length === 0 ? (
          <Text style={[styles.empty, { paddingVertical: 16 }]}>Нет способов оплаты</Text>
        ) : (
          <View style={styles.menuCard}>
            {payMethodsList.map((m, i) => {
              const typeLabel = m.type === 'cash' ? 'Наличный расчёт · фиксируется как нал в отчётах'
                : m.type === 'mixed' ? 'Разделить чек на наличные и карту'
                : 'Безналичный расчёт · карта, QR, СБП';
              return (
                <Pressable
                  key={m.id || i}
                  style={({ pressed }) => [
                    styles.menuRow,
                    i < payMethodsList.length - 1 && styles.menuRowDiv,
                    pressed && { backgroundColor: 'rgba(255,255,255,0.03)' },
                    m.active === false && { opacity: 0.45 },
                  ]}
                  onPress={() => openEditPayMethod(m, i)}
                >
                  <Text style={{ fontSize: 20, marginRight: 12 }}>{m.icon || '💳'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuItemName}>{m.name}</Text>
                    <Text style={styles.menuItemSub}>{typeLabel}</Text>
                    <Text style={styles.payEditHint}>Нажмите для редактирования</Text>
                  </View>
                  <Text style={styles.menuItemArrow}>›</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Скидки ── */}
        <View style={[styles.menuTopBarSticky, { marginTop: 24 }]}>
          <Text style={styles.menuTopTitle}>Скидки</Text>
          <View style={styles.menuFloatBtns} pointerEvents="box-none">
            <View style={styles.menuFloatRow}>
              <Pressable onPress={openNewDiscount} hitSlop={14} style={[styles.menuBadge, styles.menuBadgeAdd]}>
                <Text style={[styles.menuBadgeText, { color: colors.orange }]}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <Text style={[styles.menuItemSub, { marginBottom: 10 }]}>
          Сотрудник применяет вручную в кассе при оформлении заказа
        </Text>

        {discounts.length === 0 ? (
          <Text style={[styles.empty, { paddingVertical: 16 }]}>Скидки не настроены</Text>
        ) : (
          <View style={styles.menuCard}>
            {discounts.map((d, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [
                  styles.menuRow,
                  i < discounts.length - 1 && styles.menuRowDiv,
                  pressed && { backgroundColor: 'rgba(255,255,255,0.03)' },
                ]}
                onPress={() => openEditDiscount(i)}
              >
                <Text style={{ fontSize: 18, marginRight: 12 }}>🏷</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemName}>{d.name}</Text>
                  {d.desc ? (
                    <Text style={styles.menuItemSub}>{d.desc}</Text>
                  ) : (
                    <Text style={styles.menuItemSub}>Нажмите чтобы добавить описание</Text>
                  )}
                </View>
                <Text style={[styles.menuItemPrice, { color: colors.red, marginRight: 8 }]}>−{d.pct}%</Text>
                <Text style={styles.menuItemArrow}>›</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Зоны (если включены) */}
        {modules.zones === true && zones.length > 0 && (
          <>
            <View style={[styles.menuTopBarSticky, { marginTop: 24 }]}>
              <Text style={styles.menuTopTitle}>Зоны и столы</Text>
              <View style={styles.menuFloatBtns} pointerEvents="box-none">
                <View style={styles.menuFloatRow}>
                  <Pressable onPress={() => setZoneModal({ name: '', tables: [], newTableInput: '', bulkPrefix: 'Стол', bulkFrom: '', bulkTo: '' })} hitSlop={14} style={[styles.menuBadge, styles.menuBadgeAdd]}>
                    <Text style={[styles.menuBadgeText, { color: colors.orange }]}>+</Text>
                  </Pressable>
                </View>
              </View>
            </View>
            <View style={styles.menuCard}>
              {zones.map((z, i) => (
                <Pressable
                  key={z.id}
                  style={({ pressed }) => [styles.menuRow, i < zones.length - 1 && styles.menuRowDiv, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
                  onPress={() => setZoneModal({ id: z.id, name: z.name, tables: z.tables || [], newTableInput: '', bulkPrefix: 'Стол', bulkFrom: '', bulkTo: '' })}
                >
                  <Text style={{ fontSize: 18, marginRight: 12 }}>📍</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuItemName}>{z.name}</Text>
                    {z.tables?.length > 0 && <Text style={styles.menuItemSub}>{z.tables.length} {z.tables.length < 5 ? 'стола' : 'столов'}: {z.tables.slice(0,3).map(t=>t.name).join(', ')}{z.tables.length > 3 ? '...' : ''}</Text>}
                  </View>
                  <Text style={styles.menuItemArrow}>›</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        </SectionAccordion>

        <SectionAccordion sectionKey="stock" selectedSection={selectedSection}>

          {/* Автосписание */}
          <Text style={styles.bizGroupLabel}>Поведение склада</Text>
          <View style={styles.menuCard}>
            <View style={[styles.menuRow, styles.menuRowDiv]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemName}>Автосписание при продаже</Text>
                <Text style={styles.menuItemSub}>Ингредиенты из техкарты списываются автоматически при оплате</Text>
              </View>
              <Toggle
                value={!!(profile?.modules?.autoDebit)}
                onValueChange={v => {
                  try {
                    const db = getDb();
                    const mods = { ...(profile?.modules || {}), autoDebit: v };
                    db.runSync('UPDATE business_profile SET modules = ? WHERE id = 1', [JSON.stringify(mods)]);
                    loadAll();
                  } catch(e) {}
                }}
                size="sm"
              />
            </View>
            <View style={styles.menuRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemName}>Предупреждение о низком остатке</Text>
                <Text style={styles.menuItemSub}>Показывать уведомление на главном экране</Text>
              </View>
              <Toggle
                value={!!(profile?.modules?.stockWarning !== false)}
                onValueChange={v => {
                  try {
                    const db = getDb();
                    const mods = { ...(profile?.modules || {}), stockWarning: v };
                    db.runSync('UPDATE business_profile SET modules = ? WHERE id = 1', [JSON.stringify(mods)]);
                    loadAll();
                  } catch(e) {}
                }}
                size="sm"
              />
            </View>
          </View>

          {/* Переход */}
          <Text style={styles.bizGroupLabel}>Управление</Text>
          <View style={styles.menuCard}>
            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.75 }]}
              onPress={() => navigation.navigate('Products', { initialTab: 'stock' })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemName}>Открыть склад</Text>
                <Text style={styles.menuItemSub}>Остатки, закупки, пороги и списания</Text>
              </View>
              <Text style={styles.menuItemArrow}>›</Text>
            </Pressable>
          </View>

        </SectionAccordion>

        <SectionAccordion sectionKey="business" selectedSection={selectedSection}>
        {bizDraft ? (<>

          {/* ОСНОВНОЕ */}
          <Text style={styles.bizGroupLabel}>Основное</Text>
          <View style={styles.menuCard}>
            {[
              { key: 'businessName', label: 'Название бизнеса', placeholder: 'Название вашего бизнеса' },
              { key: 'logoUrl',      label: 'Логотип (URL)',     placeholder: 'https://...' },
              { key: 'city',         label: 'Город',             placeholder: 'Москва' },
            ].map((f, idx) => (
              <View key={f.key} style={[styles.bizFieldRow, idx < 2 && styles.menuRowDiv]}>
                <Text style={styles.bizFieldLabel}>{f.label}</Text>
                <TextInput
                  color={colors.text}
                  style={styles.bizInput}
                  value={bizDraft[f.key]}
                  onChangeText={v => setBizDraft(d => ({ ...d, [f.key]: v }))}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.muted}
                />
              </View>
            ))}
          </View>

          <View style={[styles.menuCard, { marginTop: 10 }]}>
            {[
              { key: 'phone',   label: 'Телефон',  placeholder: '+7 999 123-45-67', kb: 'phone-pad' },
              { key: 'address', label: 'Адрес',    placeholder: 'ул. Ленина, 1',    kb: 'default'   },
              { key: 'inn',     label: 'ИНН / ИП', placeholder: 'ИП Иванов И.И.',  kb: 'default'   },
            ].map((f, idx) => (
              <View key={f.key} style={[styles.bizFieldRow, idx < 2 && styles.menuRowDiv]}>
                <Text style={styles.bizFieldLabel}>{f.label}</Text>
                <TextInput
                  color={colors.text}
                  style={styles.bizInput}
                  value={bizDraft[f.key]}
                  onChangeText={v => setBizDraft(d => ({ ...d, [f.key]: v }))}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.muted}
                  keyboardType={f.kb}
                />
              </View>
            ))}
            <View style={styles.bizFieldRow}>
              <Text style={styles.bizFieldLabel}>Часы работы</Text>
              <View style={styles.hoursGroup}>
                <TextInput color={colors.text} style={[styles.bizInput, styles.hoursInput]} value={bizDraft.hoursFrom} onChangeText={v => setBizDraft(d => ({ ...d, hoursFrom: v }))} placeholder="09:00" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />
                <Text style={styles.hoursDash}>—</Text>
                <TextInput color={colors.text} style={[styles.bizInput, styles.hoursInput]} value={bizDraft.hoursTo} onChangeText={v => setBizDraft(d => ({ ...d, hoursTo: v }))} placeholder="21:00" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />
              </View>
            </View>
          </View>

          {/* ОНЛАЙН ЗАПИСЬ */}
          <Text style={styles.bizGroupLabel}>Онлайн запись</Text>
          <View style={styles.menuCard}>
            <View style={[styles.bizFieldRow, styles.menuRowDiv]}>
              <Text style={styles.bizFieldLabel}>Тип бизнеса</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { key: 'cafe',       label: 'Кафе' },
                  { key: 'services',   label: 'Услуги' },
                  { key: 'production', label: 'Производство' },
                ].map(t => (
                  <Pressable key={t.key}
                    style={[styles.typeChip, bizDraft.businessType === t.key && styles.typeChipActive]}
                    onPress={() => setBizDraft(d => ({ ...d, businessType: t.key }))}>
                    <Text style={[styles.typeChipTxt, bizDraft.businessType === t.key && styles.typeChipTxtActive]}>
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {/* Статус подключения */}
            <View style={[styles.bizFieldRow, styles.menuRowDiv]}>
              <Text style={styles.bizFieldLabel}>Статус</Text>
              <Text style={{ fontFamily: fonts.familySemibold, fontSize: 13, color: bookingConnected ? colors.orange : colors.muted }}>
                {bookingConnected ? '● Подключено' : '○ Не подключено'}
              </Text>
            </View>
            {bookingConnected ? (
              <>
                <TouchableOpacity
                  style={[styles.bizFieldRow, styles.menuRowDiv]}
                  onPress={() => {
                    const link = `https://krokodile7712-del.github.io/struktura-booking/?slug=${bookingSlug}`;
                    Clipboard.setString(link);
                    Alert.alert('Скопировано', link);
                  }}>
                  <Text style={styles.bizFieldLabel}>Ссылка</Text>
                  <Text style={{ fontFamily: fonts.familyRegular, fontSize: 11, color: colors.orange, flex: 1, textAlign: 'right' }} numberOfLines={1}>
                    .../{bookingSlug} 📋
                  </Text>
                </TouchableOpacity>
                <View style={[styles.bizFieldRow, styles.menuRowDiv]}>
                  <Pressable
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(240,160,80,0.08)', alignItems: 'center' }}
                    onPress={() => setQrModal(true)}>
                    <Text style={{ fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orange }}>📷 QR код</Text>
                  </Pressable>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={{ flex: 1, marginLeft: 8, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.borderLo, alignItems: 'center' }}
                    onPress={() => syncMenu()}>
                    <Text style={{ fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted }}>{syncing ? '⏳...' : '🔄 Меню'}</Text>
                  </TouchableOpacity>
                  <Pressable
                    style={{ flex: 1, marginLeft: 8, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(200,50,50,0.12)', alignItems: 'center' }}
                    onPress={() => { setBookingConnected(false); setBookingSlug(''); }}>
                    <Text style={{ fontFamily: fonts.familySemibold, fontSize: 13, color: colors.red }}>↺ Сбросить</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
            <View style={[styles.bizFieldRow, styles.menuRowDiv]}>
              <Text style={styles.bizFieldLabel}>Выбор времени</Text>
              <Toggle
                value={bizDraft.timeSlotsEnabled !== false}
                onValueChange={v => setBizDraft(d => ({ ...d, timeSlotsEnabled: v }))}
                size="sm"
              />
            </View>
            {bizDraft.timeSlotsEnabled !== false && <View style={styles.bizFieldRow}>
              <Text style={styles.bizFieldLabel}>
                {bizDraft.businessType === 'cafe' ? 'Интервал слотов (мин)' : 'Длительность услуги (мин)'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(bizDraft.businessType === 'cafe' ? ['15', '30', '45', '60'] : ['30', '60', '90', '120']).map(d => (
                  <Pressable key={d}
                    style={[styles.typeChip, bizDraft.slotDuration === d && styles.typeChipActive]}
                    onPress={() => setBizDraft(dr => ({ ...dr, slotDuration: d }))}>
                    <Text style={[styles.typeChipTxt, bizDraft.slotDuration === d && styles.typeChipTxtActive]}>{d}</Text>
                  </Pressable>
                ))}
              </View>
            </View>}
          </View>

          {!bookingConnected && (
            <>
              <Text style={{ fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 18 }}>
                После подключения клиенты смогут записываться через форму по QR-коду. Ссылка генерируется автоматически из названия бизнеса — никаких ручных настроек.
              </Text>
              <TouchableOpacity
                activeOpacity={0.7}
                style={{ marginTop: 10, paddingVertical: 15, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center' }}
                onPress={() => connectBooking()}>
                <Text style={{ fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: '#fff' }}>Подключить онлайн запись</Text>
                <Text style={{ fontFamily: fonts.familyRegular, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>Займёт секунду — ссылка создаётся автоматически</Text>
              </TouchableOpacity>
            </>
          )}

          {/* КАССА И ЧЕК */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.bizGroupLabel}>Касса и чек</Text>
            <InfoTip
              title="Фискализация"
              text="Эти настройки определяют, что будет указано на чеке (ИНН, система налогообложения, ставка НДС), когда вы подключите кассовое оборудование или облачную кассу. Пока оборудования нет — чеки копятся в очереди без отправки в ФНС."
            />
          </View>
          <View style={styles.menuCard}>
            <View style={[styles.menuRow, styles.menuRowDiv, { flexDirection: 'column', alignItems: 'flex-start', paddingVertical: 14 }]}>
              <Text style={[styles.bizFieldLabel, { marginBottom: 10 }]}>Система налогообложения (СНО)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { key: 'usn_income',        label: 'УСН доходы' },
                  { key: 'usn_income_outcome', label: 'УСН доходы-расходы' },
                  { key: 'osn',               label: 'ОСНО' },
                  { key: 'esn',               label: 'ЕСХН' },
                  { key: 'patent',            label: 'Патент' },
                ].map(t => (
                  <TouchableOpacity key={t.key}
                    style={[styles.typeChip, bizDraft.taxSystem === t.key && styles.typeChipActive]}
                    onPress={() => setBizDraft(d => ({ ...d, taxSystem: t.key }))}>
                    <Text style={[styles.typeChipTxt, bizDraft.taxSystem === t.key && styles.typeChipTxtActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={[styles.menuRow, styles.menuRowDiv, { flexDirection: 'column', alignItems: 'flex-start', paddingVertical: 14 }]}>
              <Text style={[styles.bizFieldLabel, { marginBottom: 10 }]}>НДС по умолчанию</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { key: 'none', label: 'Без НДС' },
                  { key: 'vat0', label: '0%' },
                  { key: 'vat5', label: '5%' },
                  { key: 'vat7', label: '7%' },
                  { key: 'vat10', label: '10%' },
                  { key: 'vat20', label: '20%' },
                ].map(t => (
                  <TouchableOpacity key={t.key}
                    style={[styles.typeChip, bizDraft.vatRate === t.key && styles.typeChipActive]}
                    onPress={() => setBizDraft(d => ({ ...d, vatRate: t.key }))}>
                    <Text style={[styles.typeChipTxt, bizDraft.vatRate === t.key && styles.typeChipTxtActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={[styles.bizFieldRow, styles.menuRowDiv]}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingRight: 12 }}>
                <Text style={styles.bizFieldLabel}>Автоматическая очередь чеков</Text>
                <InfoTip
                  title="Автоматическая очередь чеков"
                  text="Если включено — каждый оплаченный или возвращённый заказ сам встаёт в очередь на фискализацию. Если выключено — чек нужно ставить в очередь вручную кнопкой «Чек» в разделе Продажи."
                />
              </View>
              <Toggle value={!!bizDraft.autoFiscal} onValueChange={v => setBizDraft(d => ({ ...d, autoFiscal: v }))} />
            </View>
            <View style={[styles.bizFieldRow, styles.menuRowDiv]}>
              <Text style={styles.bizFieldLabel}>Название на чеке</Text>
              <TextInput color={colors.text} style={styles.bizInput} value={bizDraft.receiptName} onChangeText={v => setBizDraft(d => ({ ...d, receiptName: v }))} placeholder={bizDraft.businessName || 'Как в основном'} placeholderTextColor={colors.muted} />
            </View>
            <View style={styles.bizFieldRow}>
              <Text style={styles.bizFieldLabel}>Текст подвала</Text>
              <TextInput color={colors.text} style={styles.bizInput} value={bizDraft.receiptFooter} onChangeText={v => setBizDraft(d => ({ ...d, receiptFooter: v }))} placeholder="Спасибо за покупку!" placeholderTextColor={colors.muted} />
            </View>
          </View>
          <View style={styles.fiscalStatusCard}>
            <Text style={styles.fiscalStatusTxt}>Касса не подключена</Text>
            <Text style={styles.fiscalStatusHint}>Чеки копятся в очереди в разделе Продажи и отправятся в ФНС автоматически, как только будет подключено оборудование или облачная касса.</Text>
          </View>
          <Pressable style={({ pressed }) => [styles.bizPreviewBtn, pressed && { opacity: 0.8 }]} onPress={() => setReceiptPreview(true)}>
            <Text style={styles.bizPreviewBtnText}>👁 Предпросмотр чека</Text>
          </Pressable>

          {/* ТЕРМИНОЛОГИЯ */}
          <Text style={styles.bizGroupLabel}>Термины</Text>
          <Pressable
            style={[styles.menuCard, styles.termsAccordionHeader]}
            onPress={() => {
              try {
                LayoutAnimation.configureNext({
                  duration: 220,
                  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                  update: { type: LayoutAnimation.Types.easeInEaseOut },
                  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                });
              } catch (e) { console.error('[Термины] LayoutAnimation error:', e); }
              setTermsOpen(o => !o);
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.menuItemName}>Заказ, клиент, товар, категория</Text>
              <Text style={styles.menuItemSub}>Как эти слова звучат в приложении</Text>
            </View>
            <InfoTip
              title="Термины"
              text="Как называть заказ, клиента, товар и категорию в интерфейсе — эти слова используются в кнопках, заголовках и отчётах по всему приложению. Выберите готовый вариант или впишите своё слово."
            />
            <Text style={styles.menuItemArrow}>{termsOpen ? '⌄' : '›'}</Text>
          </Pressable>
          {termsOpen && TERM_CONFIGS.map(tc => (
            <View key={tc.key} style={styles.termBlock}>
              <View style={styles.termHeader}>
                <Text style={styles.termIcon}>{tc.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.termTitle}>{tc.title}</Text>
                  <Text style={styles.termDesc}>{tc.desc}</Text>
                </View>
              </View>
              <View style={styles.termPresets}>
                {tc.presets.map(p => (
                  <Pressable
                    key={p}
                    style={[styles.termChip, bizDraft.terms?.[tc.key] === p && styles.termChipActive]}
                    onPress={() => setBizDraft(d => ({ ...d, terms: { ...d.terms, [tc.key]: p } }))}
                  >
                    <Text style={[styles.termChipText, bizDraft.terms?.[tc.key] === p && styles.termChipTextActive]}>{p}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={[styles.input, styles.termInput]}
                color={colors.text}
                value={bizDraft.terms?.[tc.key] || ''}
                onChangeText={v => setBizDraft(d => ({ ...d, terms: { ...d.terms, [tc.key]: v } }))}
                placeholder="Или введите своё слово..."
                placeholderTextColor={colors.muted}
              />
            </View>
          ))}

          {/* МОДУЛИ */}
          <Text style={styles.bizGroupLabel}>Модули</Text>
          <Pressable
            style={[styles.menuCard, styles.termsAccordionHeader]}
            onPress={() => {
              try {
                LayoutAnimation.configureNext({
                  duration: 220,
                  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                  update: { type: LayoutAnimation.Types.easeInEaseOut },
                  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                });
              } catch (e) { console.error('[Модули] LayoutAnimation error:', e); }
              setModulesOpen(o => !o);
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.menuItemName}>Какие разделы включены</Text>
              <Text style={styles.menuItemSub}>Склад, смены, лояльность и другие — для всего бизнеса</Text>
            </View>
            <InfoTip
              title="Модули"
              text="Включает или отключает целые разделы функциональности для всего бизнеса — например, если у вас нет склада, выключите модуль «Склад», и он пропадёт из меню у всех сотрудников. Это не права доступа — те настраиваются отдельно, в разделе «Сотрудники»."
            />
            <Text style={styles.menuItemArrow}>{modulesOpen ? '⌄' : '›'}</Text>
          </Pressable>
          {modulesOpen && (
            <View style={styles.menuCard}>
              {MODULE_LIST.map((m, idx) => (
                <View key={m.key} style={[styles.menuRow, idx < MODULE_LIST.length - 1 && styles.menuRowDiv]}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.menuItemName}>{m.label}</Text>
                    <Text style={styles.menuItemSub}>{m.desc}</Text>
                  </View>
                  <Toggle
                    value={bizDraft.modules?.[m.key] !== false}
                    onValueChange={() => setBizDraft(d => ({ ...d, modules: { ...d.modules, [m.key]: d.modules?.[m.key] === false } }))}
                  />
                </View>
              ))}
            </View>
          )}

          {/* РОЛИ */}
          <Text style={styles.bizGroupLabel}>Роли</Text>
          <Pressable
            style={[styles.menuCard, styles.termsAccordionHeader]}
            onPress={() => {
              try {
                LayoutAnimation.configureNext({
                  duration: 220,
                  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                  update: { type: LayoutAnimation.Types.easeInEaseOut },
                  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                });
              } catch (e) { console.error('[Роли] LayoutAnimation error:', e); }
              setRolesOpen(o => !o);
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.menuItemName}>Как называются должности</Text>
              <Text style={styles.menuItemSub}>Только отображение — права доступа не меняются</Text>
            </View>
            <InfoTip
              title="Роли"
              text="Как называются роли сотрудников в интерфейсе — например, «Мастер» вместо «Сотрудник» для салона. Это только текст, права доступа настраиваются отдельно в разделе «Сотрудники»."
            />
            <Text style={styles.menuItemArrow}>{rolesOpen ? '⌄' : '›'}</Text>
          </Pressable>
          {rolesOpen && (
            <View style={styles.menuCard}>
              {ROLE_LIST.map((r, idx) => (
                <View key={r.key} style={[styles.bizFieldRow, idx < ROLE_LIST.length - 1 && styles.menuRowDiv]}>
                  <Text style={styles.bizFieldLabel}>{r.label}</Text>
                  <TextInput
                    color={colors.text}
                    style={styles.bizInput}
                    value={bizDraft.roles?.[r.key] || ''}
                    onChangeText={v => setBizDraft(d => ({ ...d, roles: { ...d.roles, [r.key]: v } }))}
                    placeholder={r.placeholder}
                    placeholderTextColor={colors.muted}
                  />
                </View>
              ))}
            </View>
          )}

          {/* ВАЛЮТА */}
          <Text style={styles.bizGroupLabel}>Валюта и формат</Text>
          <View style={styles.menuCard}>
            <View style={[styles.bizFieldRow, styles.menuRowDiv]}>
              <Text style={styles.bizFieldLabel}>Символ валюты</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['₽','$','€','₸','₴'].map(cur => (
                  <Pressable key={cur} style={[styles.bizCurrencyChip, bizDraft.currency === cur && styles.bizCurrencyChipActive]} onPress={() => setBizDraft(d => ({ ...d, currency: cur }))}>
                    <Text style={[styles.bizCurrencyText, bizDraft.currency === cur && { color: colors.orange }]}>{cur}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.bizFieldRow}>
              <Text style={styles.bizFieldLabel}>Формат даты</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['DD.MM.YYYY','MM/DD/YYYY','YYYY-MM-DD'].map(fmt => (
                  <Pressable key={fmt} style={[styles.bizCurrencyChip, bizDraft.dateFormat === fmt && styles.bizCurrencyChipActive]} onPress={() => setBizDraft(d => ({ ...d, dateFormat: fmt }))}>
                    <Text style={[{ fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted }, bizDraft.dateFormat === fmt && { color: colors.orange }]}>{fmt}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* КОНТАКТЫ */}
          <Text style={styles.bizGroupLabel}>Контакты для клиентов</Text>
          <View style={styles.menuCard}>
            {[
              { key: 'email',    label: '✉️ Email',     placeholder: 'hello@business.ru', kb: 'email-address' },
              { key: 'whatsapp', label: '💬 WhatsApp',  placeholder: '+7 999 123-45-67',  kb: 'phone-pad'     },
              { key: 'telegram', label: '✈️ Telegram',  placeholder: '@username',          kb: 'default'       },
            ].map((f, idx) => (
              <View key={f.key} style={[styles.bizFieldRow, idx < 2 && styles.menuRowDiv]}>
                <Text style={styles.bizFieldLabel}>{f.label}</Text>
                <TextInput color={colors.text} style={styles.bizInput} value={bizDraft[f.key]} onChangeText={v => setBizDraft(d => ({ ...d, [f.key]: v }))} placeholder={f.placeholder} placeholderTextColor={colors.muted} keyboardType={f.kb} autoCapitalize="none" />
              </View>
            ))}
          </View>

          {/* СОЦСЕТИ */}
          <Text style={styles.bizGroupLabel}>Социальные сети</Text>
          <View style={styles.menuCard}>
            {[
              { key: 'instagram', label: '📸 Instagram', placeholder: '@mybusiness'    },
              { key: 'vk',        label: '🔵 ВКонтакте', placeholder: 'vk.com/mybusiness'  },
              { key: 'website',   label: '🌐 Сайт',      placeholder: 'mysite.ru'       },
            ].map((f, idx) => (
              <View key={f.key} style={[styles.bizFieldRow, idx < 2 && styles.menuRowDiv]}>
                <Text style={styles.bizFieldLabel}>{f.label}</Text>
                <TextInput color={colors.text} style={styles.bizInput} value={bizDraft[f.key]} onChangeText={v => setBizDraft(d => ({ ...d, [f.key]: v }))} placeholder={f.placeholder} placeholderTextColor={colors.muted} autoCapitalize="none" />
              </View>
            ))}
          </View>

          {/* ТЕМА */}
          <Text style={styles.bizGroupLabel}>Тема оформления</Text>
          <View style={styles.menuCard}>
            {[
              { key: 'dark',  label: '🌙 Тёмная',   sub: 'Чёрный фон, оливковый акцент' },
              { key: 'light', label: '☀️ Светлая',  sub: 'Белый фон, тёмный текст' },
            ].map((t, idx) => (
              <Pressable key={t.key} style={[styles.menuRow, idx === 0 && styles.menuRowDiv]} onPress={() => setBizDraft(d => ({ ...d, theme: t.key }))}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemName}>{t.label}</Text>
                  <Text style={styles.menuItemSub}>{t.sub}</Text>
                </View>
                <View style={[styles.productCheckbox, bizDraft.theme === t.key && styles.productCheckboxOn]}>
                  {bizDraft.theme === t.key && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                </View>
              </Pressable>
            ))}
          </View>

          {/* Сохранить */}
          <Pressable style={({ pressed }) => [styles.confirmBtn, { marginTop: 20 }, pressed && { opacity: 0.88 }]} onPress={saveBizDraft}>
            <Text style={styles.confirmBtnText}>Сохранить</Text>
          </Pressable>

        </>) : (
          <View style={[styles.menuCard, { padding: 16, marginTop: 8 }]}>
            <Text style={styles.menuItemSub}>Загрузка...</Text>
          </View>
        )}
        </SectionAccordion>

        <SectionAccordion sectionKey="system" selectedSection={selectedSection}>

          {/* Настройка */}
          <Text style={styles.bizGroupLabel}>Настройка</Text>
          <View style={styles.menuCard}>
            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
              onPress={() => {
                const list = BACKUP_TABLES_INFO.map(t => '• ' + t.label).join('\n');
                Alert.alert(
                  'Начать заново с чистого листа?',
                  `Это ПОЛНОСТЬЮ удалит абсолютно все данные приложения без возможности восстановить — включая вашу учётную запись:\n\n${list}\n\nЕсли данные ещё понадобятся — сначала сделайте резервную копию (Настройки → Резервная копия) и только потом продолжайте. Отменить это действие нельзя. Продолжить?`,
                  [
                    { text: 'Отмена', style: 'cancel' },
                    {
                      text: 'Стереть всё и начать заново', style: 'destructive',
                      onPress: () => {
                        try {
                          const res = resetDatabase(true); // true — стереть и сотрудников тоже
                          resetKassaCart();
                          clearSession();
                          if (res && res.ok === false) {
                            console.error('[Начать заново] Не все таблицы удалились:', res.errors);
                          }
                          setTimeout(() => {
                            try {
                              navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
                            } catch (navErr) {
                              console.error('[Начать заново] Ошибка перехода на Onboarding:', navErr);
                              toast.show('Данные стёрты, но не удалось открыть регистрацию — перезапустите приложение', 'warn');
                            }
                          }, 50);
                        } catch (e) {
                          console.error('[Регистрация бизнеса] ошибка запуска:', e);
                          toast.show('Не удалось начать заново: ' + (e?.message || 'ошибка'), 'warn');
                        }
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={{ fontSize: 20, marginRight: 12 }}>🚀</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemName}>Начать заново</Text>
                <Text style={styles.menuItemSub}>Полностью сотрёт текущие данные и запустит регистрацию нового бизнеса</Text>
              </View>
              <Text style={styles.menuItemArrow}>›</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.menuRow, styles.menuRowDiv, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
              onPress={() => {
                Alert.alert('Сменить аккаунт?', 'Вы выйдете из текущего аккаунта и вернётесь на экран входа.', [
                  { text: 'Отмена', style: 'cancel' },
                  { text: 'Выйти', style: 'destructive', onPress: () => { resetKassaCart(); clearSession(); navigation.navigate('Login'); } },
                ]);
              }}
            >
              <Text style={{ fontSize: 20, marginRight: 12 }}>🔑</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemName}>Сменить аккаунт</Text>
                <Text style={styles.menuItemSub}>Выйти и войти под другим PIN</Text>
              </View>
              <Text style={styles.menuItemArrow}>›</Text>
            </Pressable>
          </View>



          {/* Данные */}
          <Text style={styles.bizGroupLabel}>Данные</Text>
          <View style={styles.menuCard}>
            <Pressable
              style={({ pressed }) => [styles.menuRow, styles.menuRowDiv, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
              onPress={async () => {
                try {
                  await handleExportSave();
                } catch (e) { console.error(e); }
              }}
            >
              <Text style={{ fontSize: 20, marginRight: 12 }}>💾</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemName}>Сохранить резервную копию</Text>
                <Text style={styles.menuItemSub}>Выберите папку на устройстве — товары, клиенты, продажи, настройки</Text>
              </View>
              <Text style={styles.menuItemArrow}>›</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.menuRow, styles.menuRowDiv, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
              onPress={handleExportShare}
            >
              <Text style={{ fontSize: 20, marginRight: 12 }}>📤</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemName}>Поделиться копией</Text>
                <Text style={styles.menuItemSub}>Отправить в мессенджер или облако вместо сохранения на устройство</Text>
              </View>
              <Text style={styles.menuItemArrow}>›</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.menuRow, styles.menuRowDiv, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
              onPress={handleImport}
              disabled={importing}
            >
              <Text style={{ fontSize: 20, marginRight: 12 }}>📥</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemName}>Восстановить из резервной копии</Text>
                <Text style={styles.menuItemSub}>{importing ? 'Восстановление...' : 'Заменит все текущие данные файлом бэкапа'}</Text>
              </View>
              <Text style={styles.menuItemArrow}>›</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: 'rgba(255,59,48,0.04)' }]}
              onPress={() => {
                Alert.alert(
                  'Сбросить продажи и клиентов?',
                  'Удалятся все продажи, клиенты, смены и расходы. Остатки на складе обнулятся.\n\nТовары, техкарты, сотрудники и настройки останутся как есть.\n\nЭто действие нельзя отменить.',
                  [
                    { text: 'Отмена', style: 'cancel' },
                    { text: 'Сбросить', style: 'destructive', onPress: () => {
                      try {
                        const db = getDb();
                        // Очищаем все данные кроме настроек и профиля
                        [
                          'orders', 'order_items', 'stock_deductions',
                          'clients',
                          'shifts', 'expenses',
                          'stock_movements',
                          'stock_by_location',
                        ].forEach(t => {
                          try { db.runSync(`DELETE FROM ${t}`); } catch (_) {}
                        });
                        // Сбрасываем остатки склада в 0
                        try { db.runSync(`UPDATE stock SET остаток = 0, max_ostatok = 0`); } catch (_) {}
                        loadAll();
                        toast.show('Продажи и клиенты сброшены ✓', 'info');
                      } catch (e) { console.error(e); toast.show('Ошибка сброса', 'warn'); }
                    }},
                  ]
                );
              }}
            >
              <Text style={{ fontSize: 20, marginRight: 12 }}>🗑</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuItemName, { color: colors.red }]}>Сбросить продажи и клиентов</Text>
                <Text style={styles.menuItemSub}>Начать статистику заново — товары и настройки останутся как есть</Text>
              </View>
              <Text style={styles.menuItemArrow}>›</Text>
            </Pressable>
          </View>

          {/* Уведомления */}
          <Text style={styles.bizGroupLabel}>Уведомления</Text>
          <View style={styles.menuCard}>
            <Pressable
              style={[styles.menuRow]}
              onPress={() => setSetting('notify_low_stock', getSetting('notify_low_stock') === '1' ? '0' : '1')}
            >
                            <View style={{ flex: 1 }}>
                <Text style={styles.menuItemName}>Низкий остаток на складе</Text>
                <Text style={styles.menuItemSub}>Предупреждение ⚠️ когда товар заканчивается</Text>
              </View>
              <Toggle
                value={getSetting('notify_low_stock') !== '0'}
                onValueChange={v => setSetting('notify_low_stock', v ? '1' : '0')}
                size="sm"
              />
            </Pressable>
          </View>

          {/* О приложении */}
          <Text style={styles.bizGroupLabel}>О приложении</Text>
          <View style={styles.menuCard}>
            <View style={[styles.menuRow, styles.menuRowDiv]}>
              <Text style={{ fontSize: 20, marginRight: 12 }}>📱</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemName}>СТРУКТУРА</Text>
                <Text style={styles.menuItemSub}>Версия 1.0.0 · POS/CRM для малого бизнеса</Text>
              </View>
            </View>
            <View style={styles.menuRow}>
              <Text style={{ fontSize: 20, marginRight: 12 }}>🆘</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemName}>Поддержка</Text>
                <Text style={styles.menuItemSub}>По вопросам: написать в Telegram</Text>
              </View>
              <Text style={styles.menuItemArrow}>›</Text>
            </View>
          </View>

        </SectionAccordion>
      </ScrollView>
    </>
  );

  if (!can('access_settings')) return (
    <View style={{ flex: 1 }}>
      <TopBar title="Настройки" onBack={() => goBackSmart(navigation)} />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Text style={{ fontSize: 32, marginBottom: 16 }}>🔒</Text>
        <Text style={{ fontFamily: 'AnekDevanagari_700Bold', fontSize: 18, color: colors.text, textAlign: 'center' }}>Нет доступа</Text>
        <Text style={{ fontFamily: 'AnekDevanagari_400Regular', fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8 }}>Обратитесь к администратору, чтобы получить доступ к этому разделу.</Text>
      </View>
    </View>
  );



  const transliterate = (str) => {
    const map = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
    return str.toLowerCase().split('').map(c => map[c] || (/[a-z0-9]/.test(c) ? c : '-')).join('').replace(/-+/g, '-').replace(/^-|-$/g, '');
  };

  const connectBooking = async () => {
    Alert.alert('', 'Подключение...');
    try {
      const profile = getBusinessProfile();
      const name = profile?.business_name || 'Мой бизнес';
      const type = profile?.business_type || 'cafe';
      const slug = (transliterate(name) || 'business').substring(0, 30).replace(/-+$/,'');
      const settings = {
        hoursFrom: profile?.work_hours_from || '09:00',
        hoursTo: profile?.work_hours_to || '21:00',
        slotDuration: profile?.slot_duration || 60,
        timeSlotsEnabled: profile?.time_slots_enabled !== false,
      };
      const biz = await upsertBusiness(slug, name, type, settings);
      if (biz) {
        setBookingSlug(slug);
        setBookingConnected(true);
        try {
          const db = getDb();
          try { db.execSync(`ALTER TABLE business_profile ADD COLUMN booking_slug TEXT DEFAULT ''`); } catch(_) {}
          db.runSync('UPDATE business_profile SET booking_slug = ? WHERE id = 1', [slug]);
        } catch(dbErr) { console.error(dbErr); }
        Alert.alert('Готово', 'Онлайн запись подключена!');
      } else {
        Alert.alert('Ошибка', 'Не удалось подключить. Проверьте интернет.');
      }
    } catch (e) { console.error('[BOOKING ERROR]', e); Alert.alert('Ошибка', String(e.message || e)); }
  };

  const syncMenu = async () => {
    if (!bookingSlug) return;
    setSyncing(true);
    try {
      const profile = getBusinessProfile();
      const settings = {
        hoursFrom: profile?.work_hours_from || '09:00',
        hoursTo: profile?.work_hours_to || '21:00',
        slotDuration: profile?.slot_duration || 60,
        timeSlotsEnabled: profile?.time_slots_enabled !== false,
      };
      const biz = await upsertBusiness(bookingSlug, profile?.business_name, profile?.business_type, settings);
      if (biz) {
        const products = getAllProductsAdmin();
        await syncServicesToSupabase(biz.id, products);
        Alert.alert('Синхронизировано', `Меню обновлено: ${products.length} позиций`);
      }
    } catch (e) { Alert.alert('Ошибка', e.message); }
    setSyncing(false);
  };

  const shareBookingLink = async () => {
    const url = `https://nwmczqsugimvrwlimxtj.supabase.co/storage/v1/object/public/booking/${bookingSlug}`;
    const link = `https://struktura.app/book/${bookingSlug}`;
    try {
      await Share.share({
        message: `Запишитесь онлайн: ${link}`,
        url: link,
        title: 'Онлайн запись',
      });
    } catch (_) {}
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Настройки" onBack={() => navigation.navigate('Admin')} />
      <View style={styles.twoCol}>

        {/* Левая панель навигации */}
        {(!isPhone || !selectedSection) && (
          <View style={[styles.leftPanel, { width: Math.min(380, Math.max(260, SW * 0.3)) }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {visibleSections.map(s => (
                <Pressable
                  key={s.key}
                  style={({ pressed }) => [
                    styles.navItem,
                    selectedSection === s.key && styles.navItemActive,
                    pressed && { backgroundColor: 'rgba(255,255,255,0.03)' },
                  ]}
                  onPress={() => setSelectedSection(s.key)}
                >
                  <Text style={styles.navIcon}>{s.icon}</Text>
                  <Text style={[styles.navLabel, selectedSection === s.key && styles.navLabelActive]}>
                    {s.label}
                  </Text>
                  {selectedSection === s.key && !isPhone && <View style={styles.navActiveBar} />}
                  {isPhone && <Text style={styles.navArrow}>›</Text>}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Правая панель */}
        {(!isPhone || selectedSection) && (
          <View style={{ flex: 1 }}>
            {isPhone && (
              <Pressable style={styles.phoneback} onPress={() => setSelectedSection(null)}>
                <Text style={styles.phoneBackText}>
                  ← {SECTIONS.find(s => s.key === selectedSection)?.label}
                </Text>
              </Pressable>
            )}
            {rightPanel}
          </View>
        )}

      </View>
      <AppNav navigation={navigation} activeScreen="Settings" />


      <Modal visible={!!zoneModal} transparent animationType="fade" onRequestClose={() => setZoneModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setZoneModal(null)} />
          {zoneModal && (
            <View style={[styles.modalInner, { width: '55%', maxWidth: 500, maxHeight: '88%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{zoneModal.id ? `Зона: ${zoneModal.name}` : 'Новая зона'}</Text>
                <Pressable onPress={() => setZoneModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Название зоны */}
                <Text style={styles.fieldLabel}>Название зоны</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={zoneModal.name}
                    onChangeText={v => setZoneModal(m => ({ ...m, name: v }))}
                    placeholder="Зал, Терраса, Бар, Вынос..."
                    placeholderTextColor={colors.muted}
                    autoFocus={!zoneModal.id}
                  />
                  <MetalButton title={zoneModal.id ? 'Сохранить' : 'Создать →'} variant="success" onPress={saveZoneName} style={{ paddingHorizontal: 16 }} />
                </View>

                {/* Столы — только если зона уже сохранена */}
                {zoneModal.id ? (<>
                  <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Столы в этой зоне ({(zoneModal.tables || []).length})</Text>

                  {/* Список столов */}
                  {(zoneModal.tables || []).length === 0 && (
                    <Text style={styles.empty}>Столов пока нет. Добавьте вручную или используйте быстрое добавление.</Text>
                  )}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {(zoneModal.tables || []).map(t => (
                      <View key={t.id} style={styles.tableChipEdit}>
                        <Text style={styles.tableChipEditText}>{t.name}</Text>
                        <Pressable onPress={() => removeTableFromZone(t.id)} hitSlop={6}>
                          <Text style={{ fontSize: 13, color: colors.red, marginLeft: 4 }}>✕</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>

                  {/* Добавить один стол */}
                  <Text style={styles.fieldLabel}>Добавить стол</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={zoneModal.newTableInput || ''}
                      onChangeText={v => setZoneModal(m => ({ ...m, newTableInput: v }))}
                      placeholder="Стол 1 / VIP / Место у окна"
                      placeholderTextColor={colors.muted}
                      onSubmitEditing={addTableToZone}
                      returnKeyType="done"
                    />
                    <MetalButton title="+" variant="default" onPress={addTableToZone} style={{ paddingHorizontal: 20 }} />
                  </View>

                  {/* Быстрое добавление диапазона */}
                  <Text style={styles.fieldLabel}>Быстро добавить диапазон</Text>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextInput
                      style={[styles.input, { flex: 2 }]}
                      value={zoneModal.bulkPrefix || 'Стол'}
                      onChangeText={v => setZoneModal(m => ({ ...m, bulkPrefix: v }))}
                      placeholder="Стол"
                      placeholderTextColor={colors.muted}
                    />
                    <Text style={{ color: colors.muted, fontFamily: fonts.family }}>с</Text>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={zoneModal.bulkFrom || ''}
                      onChangeText={v => setZoneModal(m => ({ ...m, bulkFrom: v }))}
                      keyboardType="numeric"
                      placeholder="1"
                      placeholderTextColor={colors.muted}
                    />
                    <Text style={{ color: colors.muted, fontFamily: fonts.family }}>по</Text>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={zoneModal.bulkTo || ''}
                      onChangeText={v => setZoneModal(m => ({ ...m, bulkTo: v }))}
                      keyboardType="numeric"
                      placeholder="10"
                      placeholderTextColor={colors.muted}
                    />
                    <MetalButton title="Добавить" variant="default" onPress={bulkAddTables} style={{ flex: 2 }} />
                  </View>
                  <Hint>Например: префикс "Стол", с 1 по 10 → создаст Стол 1, Стол 2 ... Стол 10</Hint>

                  {/* Удалить зону */}
                  <MetalButton title="Удалить зону" variant="danger" onPress={removeZone} style={{ marginTop: 12 }} />
                </>) : (
                  <Hint>После создания вы сможете добавить столы к этой зоне.</Hint>
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* Модалка скидки */}
      <Modal visible={!!discountModal} transparent animationType="fade" onRequestClose={() => setDiscountModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setDiscountModal(null)} />
          {discountModal && (
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{discountModal.index === -1 ? 'Новая скидка' : 'Изменить скидку'}</Text>
                <Pressable onPress={() => setDiscountModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <Text style={styles.fieldLabel}>Название</Text>
              <TextInput style={styles.input} value={discountModal.name} onChangeText={(v) => setDiscountModal(m => ({ ...m, name: v }))} placeholderTextColor={colors.muted} />
              <Text style={styles.fieldLabel}>Процент</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={discountModal.pct} onChangeText={(v) => setDiscountModal(m => ({ ...m, pct: v }))} placeholderTextColor={colors.muted} />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <Pressable style={({ pressed }) => [styles.discSaveBtn, { flex: 1 }, pressed && { opacity: 0.85 }]} onPress={saveDiscountModal}>
                  <Text style={styles.discSaveBtnTxt}>Сохранить</Text>
                </Pressable>
                {discountModal.index !== -1 && (
                  <Pressable style={({ pressed }) => [styles.discDeleteBtn, { flex: 1 }, pressed && { opacity: 0.85 }]} onPress={deleteDiscountModal}>
                    <Text style={styles.discDeleteBtnTxt}>Удалить</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Модалка способа оплаты */}
      <Modal visible={!!payMethodModal} transparent animationType="fade" onRequestClose={() => setPayMethodModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setPayMethodModal(null)} />
          {payMethodModal && (
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{payMethodModal.index === -1 ? 'Новый способ оплаты' : 'Изменить способ оплаты'}</Text>
                <Pressable onPress={() => setPayMethodModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>

              <Text style={styles.fieldLabel}>Название</Text>
              <TextInput
                style={styles.input}
                value={payMethodModal.name}
                onChangeText={v => setPayMethodModal(m => ({ ...m, name: v }))}
                placeholder="напр. Наличные, СБП, ЮMoney"
                placeholderTextColor={colors.muted}
              />

              <Text style={styles.fieldLabel}>Иконка (эмодзи)</Text>
              <TextInput
                style={[styles.input, { fontSize: 22 }]}
                value={payMethodModal.icon}
                onChangeText={v => setPayMethodModal(m => ({ ...m, icon: v }))}
                placeholder="💳"
                placeholderTextColor={colors.muted}
              />

              <Text style={styles.fieldLabel}>Тип</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {[
                  { key: 'cash',  label: '💵 Наличные' },
                  { key: 'card',  label: '💳 Безнал' },
                  { key: 'mixed', label: '💰 Смешанная' },
                ].map(t => (
                  <Pressable
                    key={t.key}
                    style={[styles.catChip, payMethodModal.type === t.key && styles.catChipActive]}
                    onPress={() => setPayMethodModal(m => ({ ...m, type: t.key }))}
                  >
                    <Text style={[styles.catChipLabel, payMethodModal.type === t.key && { color: colors.orange }]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.hintText}>Тип определяет учёт в отчётах. «Смешанная» показывает UI разделения суммы на нал и безнал.</Text>

              <Pressable style={[styles.row, { marginTop: 8 }]} onPress={() => setPayMethodModal(m => ({ ...m, active: !m.active }))}>
                <Text style={styles.rowName}>Включён в кассе</Text>
                <Toggle value={payMethodModal.active !== false} onValueChange={() => setPayMethodModal(m => ({ ...m, active: !m.active }))} size="sm" />
              </Pressable>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <MetalButton title="Сохранить" variant="success" onPress={savePayMethod} style={{ flex: 1 }} />
                {payMethodModal.index !== -1 && payMethodsList.length > 1 && (
                  <MetalButton title="Удалить" variant="danger" onPress={deletePayMethod} style={{ flex: 1 }} />
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>


      {/* QR Модалка */}
      <Modal visible={qrModal} transparent animationType="fade" onRequestClose={() => setQrModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', gap: 24 }}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setQrModal(false)} />
          <Text style={{ fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: '#fff' }}>
            Онлайн запись
          </Text>
          <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 20 }}>
            <Image
              source={{ uri: `https://quickchart.io/qr?text=https://struktura.app/book/${bookingSlug}&size=260&margin=2` }}
              style={{ width: 260, height: 260 }}
            />
          </View>
          <Text style={{ fontFamily: fonts.familyRegular, fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
            struktura.app/book/{bookingSlug}
          </Text>
          <Pressable
            style={{ paddingVertical: 14, paddingHorizontal: 40, borderRadius: 16, backgroundColor: colors.orange }}
            onPress={shareBookingLink}>
            <Text style={{ fontFamily: fonts.family, fontSize: 16, fontWeight: '700', color: '#fff' }}>Поделиться ссылкой</Text>
          </Pressable>
          <Pressable onPress={() => setQrModal(false)} hitSlop={20}>
            <Text style={{ fontFamily: fonts.familySemibold, fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Закрыть</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Двухколоночный layout
  twoCol: { flex: 1, flexDirection: 'row' },

  navArrow: { fontSize: 16, color: colors.muted },

  // Правая панель
  rightPanel: { flex: 1, backgroundColor: colors.bg },
  rightInner: { padding: 24, paddingBottom: 48 },
  sectionTitle: {
    fontFamily: fonts.family,
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 18,
    letterSpacing: -0.3,
  },

  // Телефон
  phoneback: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  phoneBackText: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },

  // Двухколоночный layout
  twoCol: { flex: 1, flexDirection: 'row' },
  leftPanel: { width: 220, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border, paddingVertical: 12 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 17, paddingHorizontal: 18, position: 'relative' },
  navItemActive: { backgroundColor: 'rgba(240,160,80,0.06)' },
  navIcon: { fontSize: 17, width: 24, textAlign: 'center' },
  navLabel: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.muted, flex: 1 },
  navLabelActive: { color: colors.orange, fontFamily: fonts.family },
  navActiveBar: { position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 3, borderRadius: 2, backgroundColor: colors.orange },
  navArrow: { fontSize: 16, color: colors.muted },
  rightPanel: { flex: 1, backgroundColor: colors.bg },
  rightInner: { padding: 24, paddingBottom: 48 },
  sectionTitle: { fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 20, letterSpacing: -0.3 },
  phoneback: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  phoneBackText: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },
  // Модалка товара — position:absolute для надёжного scroll
  prodModalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  prodModalBox: { width: '50%', maxHeight: '85%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  empModalBox:  { width: '75%', height: '82%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', flexDirection: 'column' },
  prodModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  prodModalTitle: { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text },
  receiptBox: { width: 320, maxHeight: '88%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  receiptPaper: { backgroundColor: '#ffffff', borderRadius: 12, padding: 20 },
  receiptBizName: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: '#111', textAlign: 'center', marginBottom: 4 },
  receiptBizSub:  { fontFamily: fonts.familyRegular, fontSize: 12, color: '#555', textAlign: 'center', lineHeight: 18 },
  receiptDivider: { height: 1, backgroundColor: '#ddd', marginVertical: 12, borderStyle: 'dashed' },
  receiptRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  receiptMeta:    { fontFamily: fonts.familyRegular, fontSize: 11, color: '#888' },
  receiptItem:    { fontFamily: fonts.familyRegular, fontSize: 13, color: '#222' },
  receiptTotal:   { fontFamily: fonts.family, fontSize: 14, fontWeight: '800', color: '#111' },
  receiptFooter:  { fontFamily: fonts.familyRegular, fontSize: 11, color: '#888', textAlign: 'center', marginTop: 4 },
  typeChip:       { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(64,60,55,0.35)', backgroundColor: colors.surface2 },
  typeChipActive: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.08)' },
  typeChipTxt:    { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted },
  typeChipTxtActive: { color: colors.orange },
  bizGroupLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 20, marginBottom: 8, marginLeft: 2 },
  bizFieldRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 12 },
  bizFieldLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, width: 140 },
  bizInput: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 13, color: colors.text, textAlign: 'right', padding: 0 },
  hoursGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  hoursInput: { flex: 0, width: 56, textAlign: 'center' },
  hoursDash: { color: colors.muted, fontSize: 13 },
  bizPreviewBtn: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)', alignItems: 'center', backgroundColor: 'rgba(240,160,80,0.06)' },
  bizPreviewBtnText: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },

  fiscalStatusCard: { marginTop: 8, marginBottom: 8, backgroundColor: 'rgba(240,160,80,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(240,160,80,0.2)', padding: 12 },
  fiscalStatusTxt:  { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.orange, marginBottom: 4 },
  fiscalStatusHint: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, lineHeight: 16 },

  termsAccordionHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 8, marginBottom: 12 },

  discSaveBtn: { backgroundColor: colors.orange, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  discSaveBtnTxt: { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: '#fff' },
  discDeleteBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(160,16,32,0.35)', backgroundColor: 'rgba(160,16,32,0.06)' },
  discDeleteBtnTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red },

  termBlock: { marginBottom: 14, padding: 16, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  termHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  termIcon: { fontSize: 22, marginTop: 2 },
  termTitle: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginBottom: 3 },
  termDesc: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, lineHeight: 17 },
  termPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  termChip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  termChipActive: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.08)' },
  termChipText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  termChipTextActive: { color: colors.orange },
  termInput: { marginTop: 4, marginBottom: 0, fontSize: 14 },
  bizCurrencyChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  bizCurrencyChipActive: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.08)' },
  bizCurrencyText: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  stockCatGroup: { marginBottom: 4 },
  stockAccHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
  stockAccTitle: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, flex: 1 },
  stockAccArrow: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  loyaltyInput: { width: 60, padding: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.text, fontFamily: fonts.family, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  loyaltyUnit: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, width: 36 },
  loyaltyExample: { marginTop: 10, padding: 14, backgroundColor: 'rgba(61,95,168,0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(61,95,168,0.2)', gap: 4 },
  loyaltyExampleTitle: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  loyaltyExampleLine: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.text, lineHeight: 20 },
  loyaltyExampleAccent: { fontFamily: fonts.familySemibold, color: colors.orange },
  prodModalFooter: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  confirmBtn: { paddingVertical: 15, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center' },
  confirmBtnText: { fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: '#fff' },
  prodInput: {
    padding: 13, backgroundColor: colors.surface2, borderWidth: 1,
    borderColor: colors.border, borderRadius: 12,
    fontSize: 15, fontFamily: fonts.familySemibold, color: colors.text, marginBottom: 4,
  },

  // Модалка товара
  productNameInput: { fontSize: 16, fontFamily: fonts.familySemibold, color: colors.text },
  productFieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  productSectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 8 },
  productCatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  productCatChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  productCatChipActive: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.08)' },
  productCatChipText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  productCatChipTextActive: { color: colors.orange },
  productVariantRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  productVariantName: { flex: 1, fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, padding: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10, marginRight: 8 },
  productVariantPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  productVariantPrice: { fontFamily: fonts.family, fontSize: 16, fontWeight: '700', color: colors.text, width: 72, textAlign: 'right', padding: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  productVariantUnit: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted },
  techCardBtn: { flex: 1, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(64,60,55,0.35)', backgroundColor: colors.surface2, alignItems: 'center' },
  techCardBtnText: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted },
  productAddVariant: { paddingVertical: 12, alignItems: 'center' },
  productAddVariantText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orange },
  productHint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, lineHeight: 18, marginBottom: 4 },
  productCheckbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  productCheckboxOn: { backgroundColor: colors.orange, borderColor: colors.orange },

  // Техкарта модалка
  techCardEmpty: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  techCardEmptyIcon: { fontSize: 32 },
  techCardEmptyText: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  techIngRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  techIngName: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginBottom: 2 },
  techIngFactor: { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted },
  techIngAmount: { width: 64, padding: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.text, fontFamily: fonts.family, fontSize: 16, textAlign: 'right' },
  techIngUnitBtn: { paddingVertical: 7, paddingHorizontal: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  techIngUnitText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  techIngAddBtn: { paddingVertical: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8 },
  techIngAddText: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },

  // Меню и цены — шапка
  menuTopBar: { marginBottom: 12 },
  menuTopBarSticky: {
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    position: 'relative',
    justifyContent: 'center',
  },
  menuTopTitle: {
    fontFamily: fonts.family,
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    paddingRight: 100,
  },
  menuFloatBtns: {
    position: 'absolute',
    right: 20,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  menuFloatRow: { flexDirection: 'row', gap: 6 },
  menuSearchExpanded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 240,
  },
  menuSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuSearchInput: { flex: 1, padding: 9, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 14, fontFamily: fonts.family },
  menuBadge: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  addPayMethodBtn: { paddingHorizontal: 14, height: 36, borderRadius: 12, backgroundColor: 'rgba(240,160,80,0.08)', borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)', alignItems: 'center', justifyContent: 'center' },
  addPayMethodBtnText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orange },
  payEditHint: { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, marginTop: 2, opacity: 0.7 },
  menuBadgeAdd: { borderColor: 'rgba(240,160,80,0.4)', backgroundColor: 'rgba(240,160,80,0.08)' },
  menuBadgeText: { fontSize: 16, color: colors.muted },
  // Категории меню
  menuCatGroup: { marginBottom: 16 },
  menuCatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  menuCatLine: { flex: 1, height: 1, backgroundColor: 'rgba(64,60,55,0.25)' },
  menuCatName: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5 },
  // Карточка товаров
  menuCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  menuRowDiv: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuItemName: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, flex: 1, marginRight: 8 },
  menuItemSub: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  menuItemPrice: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginRight: 8 },
  menuItemPriceNone: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, fontStyle: 'italic' },
  menuItemArrow: { fontSize: 18, color: colors.border, fontFamily: fonts.family },

  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  hiddenHint: { textAlign: 'center', fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginBottom: 10 },
  blockTitle: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12, textAlign: 'center' },
  catHeader: { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8, marginTop: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowName: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, flex: 1 },
  rowSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  tableChipEdit: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(61,95,168,0.4)', backgroundColor: 'rgba(61,95,168,0.1)' },
  tableChipEditText: { fontFamily: fonts.familySemibold, fontSize: 12, color: '#7a9be8' },
  rowNameInactive: { color: colors.muted },
  rowPrice: { fontFamily: fonts.family, fontSize: 14, fontWeight: '800', color: colors.orange },
  empty: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', paddingVertical: 12 },
  fieldHint: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 5, marginBottom: 4, lineHeight: 15 },
  hintText: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginBottom: 10, lineHeight: 17 },
  catChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  catChipActive: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.1)' },
  catChipLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted },
  unitChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 10 },
  sectionTitle: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text, textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  input: { padding: 13, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 14, fontFamily: fonts.familyRegular },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalInner: { width: '55%', maxWidth: 540, backgroundColor: colors.surface, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.borderHi },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, flex: 1 },
  modalClose: { fontSize: 18, color: colors.muted, padding: 4 },
  itemModalClose: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(64,60,55,0.25)', alignItems: 'center', justifyContent: 'center' },
  itemModalCloseText: { fontSize: 13, color: colors.text, fontFamily: fonts.familySemibold },
  variantBlock: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  variantHeaderRow: { flexDirection: 'row', alignItems: 'center' },

  // Оси вариативности
  axisBlock: { marginTop: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(61,95,168,0.35)', borderRadius: 12, backgroundColor: 'rgba(61,95,168,0.06)' },
  axisHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  axisValuesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  axisValueChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(240,160,80,0.45)', borderRadius: 10, backgroundColor: 'rgba(240,160,80,0.08)', paddingHorizontal: 8, paddingVertical: 4 },
  axisValueInput: { fontFamily: fonts.family, fontSize: 13, color: colors.text, minWidth: 40, maxWidth: 90, padding: 0 },
  axisValueRemove: { fontSize: 14, color: colors.red },
  addValueBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  addValueBtnText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.orange },
  techCardTitle: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text, marginTop: 10, marginBottom: 6 },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  ingredientName: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 13, color: colors.text },
  ingredientAmount: { width: 64, padding: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.text, fontSize: 13, fontFamily: fonts.family, textAlign: 'center' },
  ingredientUnit: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, width: 30 },
  ingredientUnitBtn: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(61,95,168,0.5)', backgroundColor: 'rgba(61,95,168,0.1)', minWidth: 36, alignItems: 'center' },
  ingredientUnitBtnText: { fontFamily: fonts.familySemibold, fontSize: 12, color: '#7a9be8' },
  factorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, paddingLeft: 8 },
  factorLabel: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
  factorInput: { width: 72, padding: 6, backgroundColor: colors.surface2, borderWidth: 1, borderColor: 'rgba(122,158,82,0.4)', borderRadius: 8, color: colors.text, fontSize: 12, fontFamily: fonts.family, textAlign: 'center' },
  factorInputAuto: { borderColor: 'rgba(240,160,80,0.4)', color: colors.orange },
  factorAutoLabel: { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.orange, textTransform: 'uppercase', letterSpacing: 1 },
  ingredientRemove: { fontSize: 15, color: colors.red, paddingHorizontal: 4 },
  addIngredientBtn: { paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, borderStyle: 'dashed', marginTop: 2 },
  addIngredientBtnLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.orange },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  checkBox: { fontSize: 18, color: colors.orange, width: 22 },
  chipsRowSmall: { flexDirection: 'row', gap: 8, marginTop: 8 },
  chipSmall: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipSmallActive: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.18)' },
  chipSmallLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  chipSmallLabelActive: { color: colors.orange },
});
