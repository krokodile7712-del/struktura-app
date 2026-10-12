import React, { useState, useEffect, useRef } from 'react';
import {View, Text, StyleSheet, ScrollView, Pressable, TextInput, Animated, LayoutAnimation, Alert, useWindowDimensions} from 'react-native';

import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';

import LocationsSettings from '../components/LocationsSettings';
import TourGuide from '../components/TourGuide';
import {useTourHighlight, useTourActiveKey} from '../components/TourRegistry';
import {useResponsive} from '../hooks/useResponsive';
import {getAllProductsAdmin, getAllModifierGroups, getUsers, getLoyaltyConfig, getPayMethods, getZones, getAllStock, getUnlinkedCostCards, getBusinessProfile, updateBusinessProfile, applyBusinessPreset, getTerms, getRoleNames, markTourSeen} from '../db/queries';

import Hint from '../components/Hint';
import InfoTip from '../components/InfoTip';
import Toggle from '../components/Toggle';
import {can, getSession, goBackSmart} from '../db/session';

import EmptyState from '../components/EmptyState';
import {colors, fonts} from '../constants/theme';
import {useToast} from '../components/Toast';
import DataSection from '../components/settings/DataSection';
import Icon from '../components/Icon';
import GlassSurface from '../components/GlassSurface';
import HoursRow from '../components/settings/HoursRow';
import LoyaltySection from '../components/settings/LoyaltySection';
import EmployeesSection from '../components/settings/EmployeesSection';
import PaymentSection from '../components/settings/PaymentSection';
import ZonesSection from '../components/settings/ZonesSection';
import StockSection from '../components/settings/StockSection';
import ProfileSection from '../components/settings/ProfileSection';
import ModulesSection from '../components/settings/ModulesSection';
import ReceiptSection from '../components/settings/ReceiptSection';
import ViewSection from '../components/settings/ViewSection';
import ReceiptPreview from '../components/settings/ReceiptPreview';
import DiscountsSection from '../components/settings/DiscountsSection';
import {NAV_GROUPS, PAGE_INFO, OLD_TO_PAGE, pageFromParam, searchSettings, plural} from '../components/settings/nav';
import FitView from '../components/FitView';
import PinConfirmModal from '../components/PinConfirmModal';
import BackupPasswordModal from '../components/BackupPasswordModal';

import KeyboardSafe from '../components/KeyboardSafe';

// Показывает часть раздела только на своей странице
function Part({ page, id, children }) { return page === id ? <>{children}</> : null; }

function SectionAccordion({ sectionKey, selectedSection, children }) {
  if (selectedSection !== sectionKey) return null;
  return <View style={{ flex: 1 }}>{children}</View>;
}

// LayoutAnimation работает автоматически в New Architecture

export default function SettingsScreen({ navigation, route }) {
  // ── Данные ──
  const [products, setProducts]             = useState([]);
  const [users, setUsers]                   = useState([]);
  const [discountsStackable, setDiscountsStackable] = useState(true);
  const [payMethodsList, setPayMethodsList] = useState([]);
  const [zones, setZones]           = useState([]);
  const [modifierGroups, setModifierGroups] = useState([]);
  const [stock, setStock]                   = useState([]);
  const [unlinkedCards, setUnlinkedCards]   = useState([]);
  const [profile, setProfile]               = useState(null);

  // ── Модалки ──

  // ── PIN ──

  // ── Общие настройки ──
  const [loyaltyModel,  setLoyaltyModel]  = useState('points');

  const toast = useToast();
  const { width: SW } = useWindowDimensions();
  const isPhone = SW < 600;
  const [page, setPage] = useState(() => pageFromParam(route?.params?.section || 'prof'));
  const selectedSection = page ? PAGE_INFO[page].section : null;   // раздел содержимого; части внутри него показывает Part
  const [q, setQ] = useState('');                                    // поиск по настройкам
  const [saved, setSaved] = useState(false); const savedT = useRef(null);
  const flashSaved = () => { setSaved(true); clearTimeout(savedT.current); savedT.current = setTimeout(() => setSaved(false), 1800); };
  const draftSaved = useRef('');                                     // последний сохранённый вид черновика профиля (автосохранение)
  const sectionFadeAnim = useRef(new Animated.Value(1)).current;

  // Плавный переход при смене раздела настроек — затухание + лёгкое
  // смещение содержимого, а не мгновенный рывок
  useEffect(() => {
    sectionFadeAnim.setValue(0);
    Animated.timing(sectionFadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [selectedSection]);
  const [bizDraft, setBizDraft]         = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(false);
  const [pinAsk, setPinAsk]             = useState(null); // подтверждение PIN администратора перед опасным действием
  const isAdminUser = getSession()?.role === 'admin';    // управлять сотрудниками и опасными действиями — только администратор
  const [roleNames, setRoleNames]       = useState({ admin: 'Администратор', barista: 'Сотрудник' });

  useEffect(() => { loadAll(); }, []);

  // ── Лояльность ──
  // ── Способы оплаты ──
  // ── Зоны/столы ──
  // Тип бизнеса — применяется сразу (не через общее «Сохранить»), т.к. одним
  // тапом переписывает термины и модули целиком. Если это не первый выбор —
  // предупреждаем, что текущая ручная настройка терминов/модулей будет заменена
  const choosePreset = (key) => {
    const apply = () => {
      try {
        applyBusinessPreset(key);
        const updated = getBusinessProfile();
        setProfile(updated);
        setBizDraft(d => ({ ...d, preset: key, terms: updated.terms || d.terms, modules: updated.modules || d.modules }));
        toast.show('Тип бизнеса применён', 'info');
      } catch (e) { console.error(e); toast.show('Ошибка применения', 'warn'); }
    };
    if (bizDraft?.preset) {
      Alert.alert(
        'Сменить тип бизнеса?',
        'Термины и включённые разделы будут заменены на стартовый набор для нового типа. Ручные правки, сделанные ниже, будут перезаписаны.',
        [{ text: 'Отмена', style: 'cancel' }, { text: 'Сменить', style: 'destructive', onPress: apply }]
      );
    } else {
      apply();
    }
  };

  // Открываем редактор профиля при переходе в секцию
  React.useEffect(() => {
    if (selectedSection === 'business' && profile) {
      const d0 = {
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
        preset:        profile.preset         || '',
        roles:         getRoleNames(),
        theme:         profile.theme          || 'dark',
      };
      draftSaved.current = JSON.stringify(d0);
      setBizDraft(d0);
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
        preset:        bizDraft.preset  || 'custom',
      });
      loadAll();
      flashSaved();
    } catch(e) { console.error(e); toast.show('Ошибка сохранения', 'warn'); }
  };

  // Профиль сохраняется сам: через 0,7 с после правки, без кнопки «Сохранить» (как и остальные настройки)
  useEffect(() => {
    if (!bizDraft) return;
    const cur = JSON.stringify(bizDraft);
    if (!draftSaved.current) { draftSaved.current = cur; return; }
    if (cur === draftSaved.current) return;
    const t = setTimeout(() => { draftSaved.current = cur; saveBizDraft(); }, 700);
    return () => clearTimeout(t);
  }, [bizDraft]);

  const loadAll = () => {
    try { setProducts(getAllProductsAdmin()); } catch(e) { console.error('products',e); }
    try {
      const u = getUsers();
      setUsers(u);
      setRoleNames(getRoleNames());
    } catch(e) { console.error('users',e); }
    try { setDiscountsStackable(getBusinessProfile()?.discounts_stackable !== 0); } catch(e) {}
    try { setPayMethodsList(getPayMethods()); } catch(e) {}
    try { setZones(getZones()); } catch(e) {}
    try { setModifierGroups(getAllModifierGroups()); } catch(e) {}
    try { setStock(getAllStock()); } catch(e) {}
    try {
      const lc = getLoyaltyConfig();
      setLoyaltyModel(lc.model || 'points');
    } catch(e) {}
    try { setUnlinkedCards(getUnlinkedCostCards()); } catch(e) {}
    try { setProfile(getBusinessProfile()); } catch(e) {}
  };

  // Опасное действие: только администратор и только после ввода его PIN
  const askAdminPin = (title, message, action) => {
    if (getSession()?.role !== 'admin') { toast.show('Это действие доступно только администратору', 'warn'); return; }
    setPinAsk({ title, message, action });
  };

  const categories = [...new Set(products.map(p => p.category))];
  const modules = profile?.modules || {};
  const terms = getTerms();

  const SECTIONS = [
    { key: 'employees', label: 'Сотрудники' },
    { key: 'loyalty',   label: 'Лояльность' },
    { key: 'payment',   label: 'Оплата' },
    { key: 'discounts', label: 'Скидки' },
    { key: 'stock',     label: 'Склад' },
    { key: 'locations', label: 'Локации и склады' },
    { key: 'business',  label: 'Профиль бизнеса' },
    { key: 'system',    label: 'Система' },
  ];

  const navVisible = it => !((it.page === 'stk' && modules.stock === false) || (it.page === 'loy' && modules.loyalty === false) || (it.page === 'zone' && modules.zones !== true));
  const TAX = { usn_income: 'УСН доходы', usn_income_expense: 'УСН доходы−расходы', osno: 'ОСНО', patent: 'Патент', npd: 'НПД' };
  const navSub = pg => ({
    prof: [profile?.business_name || 'Без названия', profile?.city].filter(Boolean).join(' · '),
    mods: `${Object.values(modules).filter(Boolean).length} включено`, emp: `${users.length} ${plural(users.length, 'сотрудник', 'сотрудника', 'сотрудников')}`,
    loy: ({ points: 'Баллы', fixed: 'Фиксированная скидка', subscription: 'Абонемент' })[loyaltyModel] || 'Лояльность', disc: discountsStackable ? 'Скидки суммируются' : 'Действует наибольшая',
    pay: payMethodsList.filter(m => m.active !== 0).map(m => m.name).join(', ') || 'Не настроено', rcpt: `${TAX[profile?.tax_system] || 'Налоги'} · фискализация ${profile?.auto_fiscal === '1' ? 'вкл' : 'выкл'}`,
    stk: `${stock.length} ${plural(stock.length, 'позиция', 'позиции', 'позиций')}`, loc: modules.locations ? 'Несколько локаций' : 'Одна точка', zone: `${zones.length} ${plural(zones.length, 'зона', 'зоны', 'зон')}`,
    sys: 'Копия, PIN, сброс', view: profile?.theme === 'light' ? 'Светлая тема' : 'Тёмная тема',
  })[pg] || '';
  const visibleSections = SECTIONS.filter(s => {
    if (s.key === 'stock' && modules.stock === false) return false;
    if (s.key === 'loyalty' && modules.loyalty === false) return false;
    return true;
  });

  // Тур раздела «Настройки» — по шагам: список разделов слева, затем по
  // одному шагу на каждый раздел (переключает выбранный раздел по ходу,
  // тот же принцип, что и в других многовкладочных турах). Высокоуровневый
  // обзор, не разбор каждого поля — раздел слишком большой для этого.
  const [tourOpen, setTourOpen] = useState(false);
  const activeTourKey = useTourActiveKey();
  const navHighlight = useTourHighlight('settings.nav', 16);
  const SECTION_TOUR_TEXT = {
    employees: 'Сотрудники, их PIN-коды и права доступа — что каждый может видеть и делать в приложении.',
    loyalty:   'Модель лояльности — баллы или скидки, настройка начислений и списаний.',
    payment:   'Способы оплаты, налоговый режим, автоматическая фискализация чеков.',
    discounts: 'Скидка на товар (общий процент) и скидка на заказ (личная скидка клиента, ручная скидка кассира) — раздельно, с приоритетом между ними.',
    stock:     'Пороги допустимого остатка и связанные с ним настройки склада.',
    locations: 'Несколько точек и складов: локации, склады, рабочие места (планшеты), отключение и удаление.',
    business:  'Название, адрес, тип бизнеса (подставляет термины и разделы под конкретную отрасль), онлайн-запись, вид чека.',
    system:    'Резервное копирование, смена аккаунта, сброс приложения — и кнопка показать все подсказки заново.',
  };
  const sectionTourSteps = visibleSections.map(s => ({
    key: `settings.nav.${s.key}`,
    title: s.label,
    text: SECTION_TOUR_TEXT[s.key] || '',
  }));
  const tourSteps = [
    { key: 'settings.nav', title: 'Разделы настроек', text: 'Слева — список разделов, справа — содержимое выбранного. На узком экране список и содержимое меняются местами — сначала список, тап открывает раздел на весь экран.' },
    ...sectionTourSteps,
  ];
  const sectionHighlights = {
    employees: useTourHighlight('settings.nav.employees', 16),
    loyalty:   useTourHighlight('settings.nav.loyalty', 16),
    payment:   useTourHighlight('settings.nav.payment', 16),
    discounts: useTourHighlight('settings.nav.discounts', 16),
    stock:     useTourHighlight('settings.nav.stock', 16),
    locations: useTourHighlight('settings.nav.locations', 16),
    business:  useTourHighlight('settings.nav.business', 16),
    system:    useTourHighlight('settings.nav.system', 16),
  };
  const activeSectionHighlight = Object.values(sectionHighlights).find(h => h.isActive);
  const rightPanelHighlight = {
    style: null,
    overlay: activeSectionHighlight ? activeSectionHighlight.overlay : sectionHighlights.employees.overlay,
  };

  // Автозапуск при первом визите в раздел
  useEffect(() => {
    try {
      const p = getBusinessProfile();
      if (!p?.tours_seen?.Settings) {
        const t = setTimeout(() => setTourOpen(true), 500);
        return () => clearTimeout(t);
      }
    } catch (_) {}
  }, []);

  // Шаг про конкретный раздел переключает на него — та же логика, что и тап
  // по пункту навигации вручную
  useEffect(() => {
    if (typeof activeTourKey === 'string' && activeTourKey.startsWith('settings.nav.')) {
      setPage(pageFromParam(activeTourKey.replace('settings.nav.', '')));
    }
  }, [activeTourKey]);

  const rightPanel = (
    <>
    <ScrollView
      style={styles.rightPanel}
      contentContainerStyle={styles.rightInner}
      keyboardShouldPersistTaps="handled"
    >
      {/* Заголовок секции */}
      <Text style={styles.sectionTitle}>
        {PAGE_INFO[page]?.label || ''}
      </Text>
      <View style={[styles.savedRow, !saved && { opacity: 0 }]}><Icon name="check" size={14} color={colors.green} /><Text style={styles.savedTxt}>Сохранено</Text></View>

        <SectionAccordion sectionKey="employees" selectedSection={selectedSection}>
          <EmployeesSection users={users} roleNames={roleNames} isAdmin={isAdminUser} askPin={askAdminPin} onChanged={() => { flashSaved(); loadAll(); }} />
        </SectionAccordion>

        <SectionAccordion sectionKey="loyalty" selectedSection={selectedSection}>
          <LoyaltySection onSaved={() => { flashSaved(); loadAll(); }} />
        </SectionAccordion>

        <SectionAccordion sectionKey="payment" selectedSection={selectedSection}>
          <Part page={page} id="pay"><PaymentSection onSaved={() => { flashSaved(); loadAll(); }} /></Part>
          <Part page={page} id="zone"><ZonesSection onSaved={() => { flashSaved(); loadAll(); }} /></Part>
        </SectionAccordion>

        <SectionAccordion sectionKey="discounts" selectedSection={selectedSection}>
          <DiscountsSection onSaved={() => { flashSaved(); loadAll(); }} />
        </SectionAccordion>

        <SectionAccordion sectionKey="stock" selectedSection={selectedSection}>
          <StockSection modules={modules} navigation={navigation} onChanged={() => { flashSaved(); loadAll(); }} />
        </SectionAccordion>

        <SectionAccordion sectionKey="locations" selectedSection={selectedSection}>
          <LocationsSettings />
        </SectionAccordion>

        <SectionAccordion sectionKey="business" selectedSection={selectedSection}>
          {bizDraft ? (
            <>
              <Part page={page} id="prof"><ProfileSection draft={bizDraft} setDraft={setBizDraft} navigation={navigation} /></Part>
              <Part page={page} id="mods"><ModulesSection draft={bizDraft} setDraft={setBizDraft} onChoosePreset={choosePreset} /></Part>
              <Part page={page} id="rcpt"><ReceiptSection draft={bizDraft} setDraft={setBizDraft} onPreview={() => setReceiptPreview(true)} /></Part>
              <Part page={page} id="view"><ViewSection draft={bizDraft} setDraft={setBizDraft} /></Part>
            </>
          ) : (
            <Text style={styles.menuItemSub}>Загрузка...</Text>
          )}
        </SectionAccordion>

        <SectionAccordion sectionKey="system" selectedSection={selectedSection}>
          <DataSection navigation={navigation} onChanged={loadAll} />
        </SectionAccordion>
      </ScrollView>
    </>
  );

  if (!can('access_settings')) return (
    <View style={{ flex: 1 }}>
      <TopBar title="Настройки" onBack={() => goBackSmart(navigation)} navigation={navigation} activeScreen="Settings" />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.text, textAlign: 'center' }}>Нет доступа</Text>
        <Text style={{ fontFamily: 'Manrope_400Regular', fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8 }}>Обратитесь к администратору, чтобы получить доступ к этому разделу.</Text>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Настройки"
        onBack={() => navigation.navigate('Admin')}
        navigation={navigation}
        activeScreen="Settings"
        rightElement={
          <Pressable onPress={() => setTourOpen(true)} hitSlop={10} style={styles.tourBtn}>
            <Text style={styles.tourBtnTxt}>?</Text>
          </Pressable>
        }
      />
      <View style={styles.twoCol}>

        {/* Левая панель навигации */}
        {(!isPhone || !selectedSection) && (
          <View style={[styles.leftPanelBase, isPhone && { width: undefined, maxWidth: undefined, flex: 1 }, !isPhone && styles.leftPanelMargin, { position: 'relative' }, navHighlight.style]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <GlassSurface radius={14} style={styles.navSearch} contentStyle={styles.navSearchRow}>
                <View style={styles.navSearchIc}><Icon name="search" size={16} color={colors.muted} /></View>
                <TextInput style={styles.navSearchIn} color={colors.text} value={q} onChangeText={setQ} placeholder="Найти настройку" placeholderTextColor="rgba(255,255,255,0.3)" />
              </GlassSurface>
              {q.trim() ? (
                searchSettings(q).map(r => (
                  <Pressable key={r.text} style={styles.navRes} onPress={() => { setPage(r.page); setQ(''); }}>
                    <Text style={styles.navResT}>{r.text}</Text><Text style={styles.navResS}>{r.label}</Text>
                  </Pressable>
                ))
              ) : NAV_GROUPS.map(g => {
                const items = g.items.filter(navVisible);
                if (!items.length) return null;
                return (
                  <View key={g.title}>
                    <Text style={styles.navGroup}>{g.title}</Text>
                    {items.map(it => {
                      const active = page === it.page, hl = sectionHighlights[Object.keys(OLD_TO_PAGE).find(k => OLD_TO_PAGE[k] === it.page)];
                      return (
                        <Pressable key={it.page} style={({ pressed }) => [styles.navItem, active && styles.navItemActive, { position: 'relative' }, hl?.style, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]} onPress={() => setPage(it.page)}>
                          {active && <GlassSurface radius={14} tint="127,168,217" alpha={0.2} style={StyleSheet.absoluteFill} />}
                          <View style={[styles.navIc, active && styles.navIcOn]}><Icon name={it.icon} size={18} color={active ? '#0A121C' : colors.textDim} /></View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.navLabel, active && styles.navLabelActive]} numberOfLines={1}>{it.label}</Text>
                            <Text style={styles.navSub} numberOfLines={1}>{navSub(it.page)}</Text>
                          </View>
                          {isPhone && <Text style={styles.navArrow}>›</Text>}
                          {hl?.overlay}
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>
            {navHighlight.overlay}
          </View>
        )}

        {/* Правая панель */}
        {(!isPhone || selectedSection) && (
          <View style={[styles.rightPanelBase, !isPhone && styles.rightPanelMargin, { position: 'relative' }, rightPanelHighlight.style]}>
            {isPhone && (
              <Pressable style={styles.phoneback} onPress={() => setPage(null)}>
                <Text style={styles.phoneBackText}>
                  ← {PAGE_INFO[page]?.label}
                </Text>
              </Pressable>
            )}
            <Animated.View key={selectedSection} style={{ flex: 1, opacity: sectionFadeAnim }}>
              {rightPanel}
            </Animated.View>
            {rightPanelHighlight.overlay}
          </View>
        )}

      </View>

      {/* Модалка скидки */}

      {/* Пикер добавления товара в скидку на товар */}

      {/* Пикер добавления клиента в личную скидку */}

      {/* Ввод процента личной скидки для выбранного клиента */}

      {/* Модалка способа оплаты */}

      <PinConfirmModal
        visible={!!pinAsk}
        title={pinAsk?.title}
        message={pinAsk?.message}
        onCancel={() => setPinAsk(null)}
        onConfirm={() => { const a = pinAsk?.action; setPinAsk(null); a?.(); }}
      />

      {/* QR Модалка */}
      {/* Модалка «Предпросмотр чека» */}
      <ReceiptPreview visible={receiptPreview} onClose={() => setReceiptPreview(false)} draft={bizDraft} />

      {/* Модалка «Позиции для записи» */}

      {/* Модалка описания товара из меню — только для страницы записи */}

      {/* Модалка своей позиции для записи */}

      <TourGuide
        visible={tourOpen}
        onClose={() => { setTourOpen(false); markTourSeen('Settings'); }}
        steps={tourSteps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tourBtn:    { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(127,168,217,0.1)', borderWidth: 1, borderColor: 'rgba(127,168,217,0.4)', alignItems: 'center', justifyContent: 'center' },
  tourBtnTxt: { fontFamily: fonts.family, fontSize: 18, color: colors.orange },
  // Двухколоночный layout
  twoCol: { flex: 1, flexDirection: 'row' },

  // Двухколоночный layout
  leftPanelBase: { width: '30%', maxWidth: 340, paddingVertical: 12 },
  leftPanelMargin: { margin: 12, marginRight: 0 },
  rightPanelBase: { flex: 1 },
  rightPanelMargin: { margin: 12, marginLeft: 12 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 17, paddingHorizontal: 18, position: 'relative' },
  navItemActive: {},
  navLabel: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.muted, flex: 1 },
  navLabelActive: { color: colors.orange, fontFamily: fonts.family },
  navArrow: { fontSize: 16, color: colors.muted },
  rightPanel: { flex: 1 },
  rightInner: { padding: 24, paddingBottom: 48 },
  sectionTitle: { fontFamily: fonts.family, fontSize: 24, color: colors.text, marginBottom: 20, letterSpacing: -0.3 },
  phoneback: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  phoneBackText: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },
  // Модалка товара — position:absolute для надёжного scroll

  // Модалка товара

  // Техкарта модалка

  // Меню и цены — шапка
  // Категории меню
  // Карточка товаров
  menuItemSub: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 2 },

  // Оси вариативности
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -8, marginBottom: 8 }, savedTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.green },
  navSearch: { marginBottom: 6 }, navSearchRow: { flexDirection: 'row', alignItems: 'center', height: 46, paddingHorizontal: 14 },
  navSearchIc: { fontSize: 15, color: colors.muted, marginRight: 10 }, navSearchIn: { flex: 1, padding: 0, fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  navRes: { paddingVertical: 11, paddingHorizontal: 14, borderRadius: 14, marginBottom: 2 }, navResT: { fontFamily: fonts.familySemibold, fontSize: 14.5, color: colors.text }, navResS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  navGroup: { fontFamily: fonts.familySemibold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.muted, marginLeft: 8, marginTop: 14, marginBottom: 6 },
  navIc: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: 'rgba(255,255,255,0.06)' }, navIcOn: { backgroundColor: colors.orangeLight }, navIcT: { fontSize: 16, color: colors.textDim },
  navSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 1 },
  navIcOn: { backgroundColor: colors.orangeLight },
  navSearchRow: { flexDirection: 'row', alignItems: 'center', height: 46, paddingHorizontal: 14 },
  navSearchIn: { flex: 1, padding: 0, fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  navResT: { fontFamily: fonts.familySemibold, fontSize: 14.5, color: colors.text },
  navResS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  savedTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.green },
});
