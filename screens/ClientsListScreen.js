import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, FlatList, Animated, Linking, Alert, Modal, Dimensions } from 'react-native';
import TopBar from '../components/TopBar';
import TourGuide from '../components/TourGuide';
import { useTourHighlight, useTourActiveKey } from '../components/TourRegistry';
import { useResponsive } from '../hooks/useResponsive';
import EmptyState from '../components/EmptyState';
import Sheet from '../components/Sheet';
import { useFocusEffect } from '@react-navigation/native';
import { getAllClients, searchClients, getClientOrders, getTerms, pluralizeRu, countRu,
         getLoyaltyConfig, updateClientNote, getClientById, getBusinessProfile, markTourSeen } from '../db/queries';
import { updateClient, findClientByPhone, getSetting, setSetting, expireWelcomeBonuses } from '../db/queries';
import WelcomeBonusBlock from '../components/WelcomeBonusBlock';
import { syncLoyaltySignups, deleteClientEverywhere } from '../db/loyaltySync';
import { useToast } from '../components/Toast';
import PhoneInput from '../components/PhoneInput';
import { isPhoneOkOrEmpty, isNonStandardPhone, toStoredPhone, PHONE_ERROR } from '../utils/phone';
import { getHomeRoute, goBackSmart, getSession, can } from '../db/session';
import { colors, fonts, glass } from '../constants/theme';
import GlassSurface from '../components/GlassSurface';
import GlassButton from '../components/GlassButton';
import Icon from '../components/Icon';
import SoftGlow from '../components/SoftGlow';
import ClientEditModal from '../components/ClientEditModal';

// Перенесено из LoyaltyScreen.js (экран удалён — дублировал список клиентов,
// единственная уникальная часть была эта сводка по модели лояльности)
const MODEL_INFO = {
  points: {
    label: 'Бонусные баллы',
    desc: 'За каждую покупку клиент получает баллы. Баллы можно тратить на скидки при следующих заказах.',
  },
  discount: {
    label: 'Скидочная карта',
    desc: 'Зарегистрированные клиенты получают автоматическую скидку на каждый заказ.',
  },
  subscription: {
    label: 'Абонемент',
    desc: 'Клиенты покупают фиксированное количество посещений вперёд.',
  },
};

// Инициалы для кружка: две буквы имени и фамилии
const initials = (name) => { const p = String(name || '').trim().split(/\s+/); return ((p[0]?.[0] || '?') + (p[1]?.[0] || '')).toUpperCase(); };

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}
function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function daysSince(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / 86400000);
}

function ClientCard({ client, onNewOrder, onSaved, onDeleted, loyaltyModel, loyaltyConfig }) {
  const [orders, setOrders]     = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing]   = useState(false);
  const [fio, setFio]           = useState(client.fio || '');
  const [phone, setPhone]       = useState(client.phone || '');
  const [balance, setBalance]   = useState(String(client.balance || 0));
  const [discountPct, setDiscountPct] = useState(String(client.discount_pct || 0));
  const [birthDate, setBirthDate] = useState(client.birth_date || '');
  const [notes, setNotes]       = useState(client.notes || '');
  const [editingNote, setEditingNote] = useState(false);
  const [, setTick] = useState(0); // перерисовать блок бонуса после активации
  const isAdmin = getSession()?.role === 'admin';
  const [deleting, setDeleting] = useState(false);

  // Удаление клиента: из приложения и, если он регистрировался по QR, копии в облаке
  const toast = useToast();
  const deleteText = (() => {
    let hasCloud = false;
    try { hasCloud = !!(client.phone && getBusinessProfile()?.booking_slug); } catch (_) {}
    const bal = Math.floor(client.balance || 0);
    return `${client.fio}\n\nКарточка${bal > 0 ? `, ${bal} баллов на счёте` : ''} и приветственный бонус будут удалены. ` +
      'Заказы останутся в продажах, но без привязки к клиенту.' +
      (hasCloud ? '\n\nКопия его регистрации в облаке тоже будет стёрта.' : '');
  })();
  const runDelete = async () => {
    setDeleting(true);
    try { onDeleted?.(await deleteClientEverywhere(client.id)); }
    catch (e) { console.error(e); Alert.alert('Не удалось удалить клиента'); setDeleting(false); }
  };
  const cardHighlight = useTourHighlight('clients.card', 18);

  React.useEffect(() => {
    try { setOrders(getClientOrders(client.id)); } catch (_) {}
    setFio(client.fio || '');
    setPhone(client.phone || '');
    setBalance(String(client.balance || 0));
    setDiscountPct(String(client.discount_pct || 0));
    setBirthDate(client.birth_date || '');
    setNotes(client.notes || '');
    setEditing(false);
    setEditingNote(false);
    setExpanded(null);
  }, [client.id]);

  const lastOrder = orders[0];
  const days = daysSince(lastOrder?.created_at);
  const avgCheck = orders.length > 0
    ? Math.round(orders.reduce((s, o) => s + o.total, 0) / orders.length) : 0;

  // Номер проверяем, только если его меняли: у клиента со старым номером остальные данные сохраняются как раньше
  const validatePhone = (ph) => {
    if ((ph || '').trim() === (client.phone || '').trim()) return '';
    if (!isPhoneOkOrEmpty(ph)) return PHONE_ERROR + ' — или очистите поле.';
    const dup = (ph || '').trim() ? findClientByPhone(ph, client.id) : null;
    return dup ? `Этот номер записан на клиента «${dup.fio}».` : '';
  };
  const saveFromModal = (v) => {
    const pe = validatePhone(v.phone);
    if (pe) return { ok: false, message: pe };
    try {
      updateClient(client.id, { fio: v.fio, phone: v.phone.trim(), balance: v.balance || 0, discount_pct: v.discount || 0, birth_date: v.birth });
      client.fio = v.fio; client.phone = toStoredPhone(v.phone);
      client.balance = v.balance || 0; client.discount_pct = v.discount || 0; client.birth_date = v.birth;
      onSaved?.();
      toast.show('Сохранено');
      return { ok: true };
    } catch (e) { console.error(e); return { ok: false, message: 'Не удалось сохранить. Попробуйте ещё раз.' }; }
  };

  const handleSaveNote = () => {
    try { updateClientNote(client.id, notes); client.notes = notes; setEditingNote(false); } catch (e) { console.error(e); }
  };

  const isBirthday = (() => {
    if (!client.birth_date) return false;
    const t = new Date(); const mm = String(t.getMonth()+1).padStart(2,'0'); const dd = String(t.getDate()).padStart(2,'0');
    return client.birth_date.includes(`${dd}.${mm}`) || client.birth_date.includes(`-${mm}-${dd}`);
  })();

  return (
    <View style={{ flex: 1 }}>
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      <SoftGlow size={520} color="127,168,217" alpha={0.16} style={{ position: 'absolute', left: -140, top: -110 }} />
      <SoftGlow size={460} color="127,168,217" alpha={0.11} style={{ position: 'absolute', right: -160, bottom: -130 }} />
    </View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingBottom: 32 }} showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">

      <View style={[{ position: 'relative', marginBottom: 4 }, cardHighlight.style]}>
      {/* Шапка */}
      <View style={[styles.cardHead, { flexDirection: 'row', alignItems: 'center' }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarTxt}>{initials(client.fio)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={[styles.cardName, { textAlign: 'left' }]} numberOfLines={1}>{client.fio}</Text>
          <Text style={[styles.cardCode, { textAlign: 'left' }]}>{client.code}</Text>
          {isBirthday && <Text style={[styles.birthday, { textAlign: 'left', marginTop: 4 }]}>🎂 Сегодня день рождения!</Text>}
        </View>
      </View>

      {/* Баллы / визиты */}
      <GlassSurface radius={glass.radius.tile} style={{ marginBottom: 12 }}>
        <View style={styles.cStripe} />
        <View style={{ paddingVertical: 20, paddingLeft: 26, paddingRight: 22 }}>
          <Text style={styles.cTileLbl}>{loyaltyModel === 'subscription' ? 'Визитов' : loyaltyModel === 'points' ? 'Баллов' : `Скидка ${loyaltyConfig?.pct || 0}%`}</Text>
          <Text style={styles.cHeroVal}>{loyaltyModel === 'discount' ? `${loyaltyConfig?.pct || 0}%` : (client.balance || 0)}</Text>
          {client.discount_pct > 0 && <Text style={styles.cHeroSub}>Личная скидка {client.discount_pct}%</Text>}
        </View>
      </GlassSurface>
      {cardHighlight.overlay}
      </View>

      {/* Приветственный бонус за регистрацию по QR */}
      <WelcomeBonusBlock
        client={client}
        onActivated={(fresh) => {
          Object.assign(client, fresh);
          setBalance(String(fresh.balance || 0));
          setTick(t => t + 1);
          onSaved?.();
        }}
      />

      {/* Статистика */}
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
        {[
          { val: client.visits || 0, lbl: 'Визитов' },
          { val: `${(client.total_sum || 0).toLocaleString('ru-RU')} ₽`, lbl: 'Сумма' },
          { val: `${avgCheck.toLocaleString('ru-RU')} ₽`, lbl: 'Средний чек' },
        ].map((st, k) => (
          <GlassSurface key={k} radius={glass.radius.tile} padding={14} style={{ flex: 1 }}>
            <Text style={styles.cTileLbl}>{st.lbl}</Text>
            <Text style={styles.cTileVal}>{st.val}</Text>
          </GlassSurface>
        ))}
      </View>

      {/* Последний визит / телефон / день рождения — общая карточка */}
      <View style={styles.infoCard}>
      {lastOrder && (
        <View style={[styles.infoRow, (client.phone || client.birth_date) && styles.infoRowDiv]}>
          <Text style={styles.infoIcon}>🕐</Text>
          <Text style={styles.infoTxt}>
            Последний визит: {fmtDate(lastOrder.created_at)}
            {days === 0 ? ' (сегодня)' : days === 1 ? ' (вчера)' : ` (${days} дн. назад)`}
          </Text>
        </View>
      )}
      {client.phone ? (
        <Pressable
          style={[styles.infoRow, client.birth_date && styles.infoRowDiv]}
          onPress={() => {
            Alert.alert('Позвонить?', client.phone, [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Позвонить', onPress: () => Linking.openURL(`tel:${client.phone.replace(/\s+/g, '')}`) },
            ]);
          }}
        >
          <Text style={styles.infoIcon}>📞</Text>
          <Text style={[styles.infoTxt, { color: colors.indigo }]}>
            {client.phone}{isNonStandardPhone(client.phone) ? '   ⚠ старый формат — поправьте в «Редактировать»' : ''}
          </Text>
        </Pressable>
      ) : null}
      {client.birth_date ? (
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>🎂</Text>
          <Text style={styles.infoTxt}>{client.birth_date}</Text>
        </View>
      ) : null}
      </View>

      {/* Заметки */}
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Заметки</Text>
          {!editingNote && (
            <Pressable onPress={() => setEditingNote(true)} hitSlop={10}>
              <Text style={styles.sectionAction}>{notes ? 'Изменить' : 'Добавить'}</Text>
            </Pressable>
          )}
        </View>
        {editingNote ? (
          <>
            <TextInput
              color={colors.text}
              style={styles.noteInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Предпочтения, аллергии, особые пожелания..." // Подсказка кассиру перед заказом
              placeholderTextColor={colors.muted}
              multiline
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Pressable style={[styles.btn, { flex: 1 }]} onPress={handleSaveNote}>
                <Text style={styles.btnTxt}>Сохранить</Text>
              </Pressable>
              <Pressable style={[styles.btnSec, { flex: 1 }]} onPress={() => setEditingNote(false)}>
                <Text style={styles.btnSecTxt}>Отмена</Text>
              </Pressable>
            </View>
          </>
        ) : notes ? (
          <Text style={styles.noteText}>{notes}</Text>
        ) : (
          <Text style={styles.notePlaceholder}>Нет заметок</Text>
        )}
      </View>

      {/* Действия */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <GlassButton tone="accent" icon="plus" label="Новый заказ" height={54} style={{ flex: 1 }} onPress={() => onNewOrder(client)} />
        {can('edit_clients') && <GlassButton label="Изменить" height={54} style={{ flex: 1 }} onPress={() => setEditing(true)} />}
      </View>

      {/* История заказов */}
      <View style={[styles.section, { marginTop: 20 }]}>
        <Text style={styles.sectionTitle}>История заказов ({orders.length})</Text>
        {orders.length === 0 ? (
          <Text style={styles.notePlaceholder}>Нет заказов</Text>
        ) : (
          <View style={styles.ordersCard}>
            {orders.map((order, idx) => (
              <View key={order.id}>
                <Pressable
                  style={[styles.orderRow, idx < orders.length-1 && styles.orderDiv]}
                  onPress={() => setExpanded(expanded === order.id ? null : order.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderDate}>{fmtDate(order.created_at)} · {fmtTime(order.created_at)}</Text>
                    <Text style={styles.orderMethod}>{order.method}</Text>
                  </View>
                  <Text style={styles.orderTotal}>{order.total} ₽</Text>
                  <Text style={[styles.orderChevron, expanded === order.id && styles.orderChevronOpen]}>›</Text>
                </Pressable>
                {expanded === order.id && (
                  <View style={styles.orderItems}>
                    {(order.items || []).map((item, i) => (
                      <View key={i} style={styles.orderItem}>
                        <Text style={styles.orderItemName}>
                          {item.name}{item.size ? ` ${item.size}` : ''}
                        </Text>
                        <Text style={styles.orderItemPrice}>{item.price} ₽</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

    </ScrollView>
    <ClientEditModal
      visible={editing} client={client} onClose={() => setEditing(false)}
      canLoyalty={can('manage_loyalty')} loyaltyModel={loyaltyModel}
      validatePhone={validatePhone} onSave={saveFromModal}
      canDelete={isAdmin} deleteText={deleteText} deleting={deleting} onDelete={runDelete}
    />
    </View>
  );
}

export default function ClientsListScreen({ navigation, route, initialClientId }) {
  const { isLandscape } = useResponsive();
  // load — useCallback без зависимостей, поэтому свежие параметры перехода читаем через ref
  const routeRef = useRef(route);
  routeRef.current = route;
  const [query, setQuery]       = useState('');
  const [sortMode, setSortMode] = useState('name'); // name | added
  const [popOpen, setPopOpen] = useState(false);       // окно «Фильтры»
  const [popAnchor, setPopAnchor] = useState({ top: 76, right: 12 });
  const fbtnRef = useRef(null);
  const openFilters = () => {
    try {
      fbtnRef.current.measureInWindow((bx, by, bw, bh) => {
        setPopAnchor({ top: by + bh + 8, right: Math.max(8, Dimensions.get('window').width - (bx + bw)) });
        setPopOpen(true);
      });
    } catch (e) { setPopOpen(true); }
  };
  const [clients, setClients]   = useState([]);
  const [selected, setSelected] = useState(null);
  const cardAnim = useState(new Animated.Value(0))[0];
  const cardSlide = useState(new Animated.Value(24))[0];

  const selectClient = (c) => {
    cardAnim.setValue(0);
    cardSlide.setValue(24);
    setSelected(c);
    Animated.parallel([
      Animated.timing(cardAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(cardSlide, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
    ]).start();
  };

  const [tourOpen, setTourOpen] = useState(false);
  const searchHighlight = useTourHighlight('clients.search');
  const listHighlight   = useTourHighlight('clients.list');
  const activeTourKey   = useTourActiveKey();

  // Автозапуск тура при первом заходе в раздел
  React.useEffect(() => {
    try {
      const p = getBusinessProfile();
      if (!p?.tours_seen?.ClientsList) {
        const t = setTimeout(() => setTourOpen(true), 500);
        return () => clearTimeout(t);
      }
    } catch (_) {}
  }, []);

  // Шаг тура «Карточка клиента» — если ещё никто не выбран, показываем первого
  // из списка, чтобы было что подсветить; если клиент уже выбран, не трогаем
  // (сам эффект — ниже, после объявления filtered)

  const tourSteps = [
    { key: 'clients.search', title: 'Поиск и сортировка', text: 'Ищите клиента по имени или телефону. Рядом — сортировка по алфавиту или сначала новые.' },
    { key: 'clients.list',   title: 'Список клиентов', text: 'Нажмите на клиента, чтобы открыть его карточку.' },
    { key: 'clients.card',   title: 'Карточка клиента', text: 'Баллы/визиты, история заказов, личная скидка и заметки — всё в одной карточке. Кнопка «Новый заказ» ведёт сразу в Кассу с выбранным клиентом.', cardPosition: 'top' },
  ];
  const [terms, setTerms]       = useState({ client: 'Клиент', order: 'Заказ' });
  const [loyaltyModel, setLoyaltyModel] = useState('points');
  const [loyaltySummaryOpen, setLoyaltySummaryOpen] = useState(false);
  const [loyaltyConfig, setLoyaltyConfig] = useState({});

  const load = useCallback(() => {
    try {
      try { expireWelcomeBonuses(); } catch (_) {}
      const all = getAllClients();
      setClients(all);
      // Открыть конкретного клиента: из Кассы (тап по имени), поиска и результата регистрации
      const routeClientId = routeRef.current?.params?.clientId;
      const targetId = routeClientId ?? initialClientId;
      if (targetId) {
        const found = all.find(c => c.id === Number(targetId));
        if (routeClientId) { try { navigation.setParams({ clientId: undefined }); } catch (_) {} } // один раз, не при каждом возврате на экран
        if (found) {
          setSelected(found);
          // Сразу показываем карточку без анимации при первой загрузке
          cardAnim.setValue(1);
          cardSlide.setValue(0);
        }
      }
      setTerms(getTerms());
      const lc = getLoyaltyConfig();
      setLoyaltyModel(lc.model);
      setLoyaltyConfig(lc.config);
    } catch (_) {}
    // Один раз после обновления — итог приведения номеров к единому формату
    try {
      const rep = getSetting('phones_migration_report');
      if (rep && !getSetting('phones_report_shown')) {
        setSetting('phones_report_shown', '1');
        const { fixed, left } = JSON.parse(rep);
        if (fixed > 0 || left > 0) {
          Alert.alert(
            'Номера телефонов',
            `Номера приведены к единому виду +7 (9XX) XXX-XX-XX: исправлено ${fixed}.` +
            (left > 0 ? `\n\nНе удалось привести автоматически: ${left} — у таких клиентов в карточке стоит пометка ⚠, поправьте вручную.` : '') +
            '\n\nПрежние значения сохранены во внутренней копии.'
          );
        }
      }
    } catch (_) {}
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    // Новые регистрации по QR — при заходе (не чаще раза в полминуты)
    syncLoyaltySignups().then(r => { if (r && r.imported > 0) load(); });
  }, [load]));

  const toast = useToast();
  const onClientDeleted = (res) => {
    setSelected(null);
    load();
    if (res?.cloud === 'queued') {
      Alert.alert('Клиент удалён', 'Копия его регистрации в облаке будет стёрта, как только появится связь.');
    } else {
      toast.show('Клиент удалён');
    }
  };

  const refreshSignups = async () => {
    const r = await syncLoyaltySignups({ force: true });
    if (r === null) {
      Alert.alert('Регистрации по QR', 'Не удалось загрузить: нет связи или онлайн-запись не подключена.');
      return;
    }
    if (r.imported > 0) load();
    Alert.alert('Регистрации по QR',
      r.imported > 0 ? `Новых клиентов: ${r.imported}` : 'Новых регистраций нет' + (r.skipped ? ` (пропущено: ${r.skipped} — номер уже есть в базе)` : ''));
  };

  const filteredRaw = query.length >= 1 ? searchClients(query) : clients;
  const filtered = [...filteredRaw].sort((a, b) => {
    if (sortMode === 'added') return (b.created_at || '').localeCompare(a.created_at || ''); // новые сверху
    return (a.fio || '').localeCompare(b.fio || '', 'ru');
  });

  // Шаг тура «Карточка клиента» — если ещё никто не выбран, показываем первого
  // из списка, чтобы было что подсветить; если клиент уже выбран, не трогаем
  React.useEffect(() => {
    if (activeTourKey === 'clients.card' && !selected && filtered.length > 0) {
      selectClient(filtered[0]);
    }
  }, [activeTourKey]);

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title={pluralizeRu(terms.client)}
        onBack={() => goBackSmart(navigation)}
        navigation={navigation}
        activeScreen="ClientsList"
        rightElement={
          <Pressable onPress={() => setTourOpen(true)} hitSlop={10} style={styles.tourBtn}>
            <Text style={styles.tourBtnTxt}>?</Text>
          </Pressable>
        }
      />

      {/* Верхняя строка: поиск на всю ширину, «Фильтры», «+ Клиент» */}
      <View style={[styles.tb, { position: 'relative' }, searchHighlight.style]}>
        <View style={styles.tbSearch}>
          <Icon name="search" size={22} color={colors.muted} />
          <TextInput color={colors.text} style={styles.tbInput} value={query} onChangeText={setQuery}
            placeholder="Поиск по имени, телефону или коду" placeholderTextColor={colors.muted} />
        </View>
        <Pressable ref={fbtnRef} collapsable={false} style={[styles.tbFilt, sortMode !== 'name' && styles.tbFiltOn]} onPress={openFilters}>
          <Icon name="sliders" size={18} color={sortMode !== 'name' || popOpen ? colors.orangeLight : colors.textDim} />
          <Text style={[styles.tbFiltTxt, (sortMode !== 'name' || popOpen) && { color: colors.orangeLight }]}>Фильтры</Text>
        </Pressable>
        <GlassButton tone="accent" icon="plus" label={terms.client} height={54} onPress={() => navigation.navigate('Reg')} />
        {searchHighlight.overlay}
      </View>
      {sortMode !== 'name' && (
        <View style={styles.afil}>
          <Pressable style={styles.afChip} onPress={() => setSortMode('name')} hitSlop={4}>
            <Text style={styles.afChipTxt}>Сначала новые</Text><Icon name="x" size={14} color={colors.orangeLight} />
          </Pressable>
          <Pressable onPress={() => setSortMode('name')} hitSlop={8}><Text style={styles.afReset}>Сбросить</Text></Pressable>
        </View>
      )}

      <View key={isLandscape ? 'landscape' : 'portrait'} style={[styles.layout, !isLandscape && { flexDirection: 'column' }]}>
        {/* Левая колонка — список */}
        <View style={[styles.listCol, !isLandscape && { width: undefined, maxWidth: undefined, flex: 1, margin: 0, borderRadius: 0, borderWidth: 0, borderRightWidth: 0 }]}>
          <Pressable onPress={() => setLoyaltySummaryOpen(v => !v)} style={styles.loyaltyStrip}>
            <View>
              <Text style={styles.loyaltyStripLabel}>{MODEL_INFO[loyaltyModel]?.label || 'Лояльность'}</Text>
              <Text style={styles.loyaltyStripVal}>{countRu(clients.length, terms.client.toLowerCase())}</Text>
            </View>
            <Text style={styles.loyaltyStripChevron}>{loyaltySummaryOpen ? '▲' : '▼'}</Text>
          </Pressable>
          {loyaltySummaryOpen && (
            <View style={styles.loyaltyStripBody}>
              <Text style={styles.loyaltyStripDesc}>{MODEL_INFO[loyaltyModel]?.desc}</Text>
              <View style={styles.loyaltyStatRow}>
                <View style={styles.loyaltyStatBox}>
                  <Text style={styles.loyaltyStatVal}>{clients.reduce((s, c) => s + (c.visits || 0), 0)}</Text>
                  <Text style={styles.loyaltyStatLbl}>Визитов</Text>
                </View>
                <View style={styles.loyaltyStatBox}>
                  <Text style={styles.loyaltyStatVal}>{Math.round(clients.reduce((s, c) => s + (c.balance || 0), 0))}</Text>
                  <Text style={styles.loyaltyStatLbl}>{loyaltyModel === 'subscription' ? 'Визитов выдано' : 'Баллов выдано'}</Text>
                </View>
              </View>
            </View>
          )}


          <View style={[{ flex: 1, position: 'relative' }, listHighlight.style]}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
            {filtered.length === 0 ? (
              <View style={styles.emptyBox}>
                <View style={styles.emptyIco}><Icon name="users" size={34} color={colors.textDim} /></View>
                <Text style={styles.emptyTitle}>{clients.length === 0 ? 'Нет клиентов' : 'Никого не найдено'}</Text>
                <Text style={styles.emptyText}>{clients.length === 0 ? 'Зарегистрируйте первого клиента — он появится в списке, а на Кассе его можно будет выбрать.' : 'Попробуйте другой запрос.'}</Text>
                {clients.length === 0 && <GlassButton tone="accent" icon="plus" label="Зарегистрировать клиента" height={50} onPress={() => navigation.navigate('Reg')} />}
              </View>
            ) : (
              <View style={styles.clientsCard}>
                {filtered.map((c, idx) => {
                  const isActive = selected?.id === c.id;
                  return (
                    <Pressable key={c.id}
                      style={({ pressed }) => [
                        styles.clientRow,
                        idx < filtered.length-1 && styles.clientRowDiv,
                        isActive && styles.clientRowActive,
                        pressed && !isActive && { backgroundColor: 'rgba(127,168,217,0.06)' },
                      ]}
                      onPress={() => selectClient(c)}
                    >
                      <View style={[styles.cAv, isActive && styles.cAvOn]}>
                        <Text style={[styles.cAvTxt, isActive && { color: colors.onAccent }]}>{initials(c.fio)}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.cName} numberOfLines={1}>{c.fio}</Text>
                        {!!c.phone && <Text style={styles.cSub} numberOfLines={1}>{c.phone}</Text>}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.cBal}>{loyaltyModel === 'discount' ? (c.visits || 0) : (c.balance || 0)}</Text>
                        <Text style={styles.cBalLbl}>{loyaltyModel === 'points' ? 'баллов' : 'визитов'}</Text>
                      </View>
                      {isActive && <View style={styles.activeBar} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
          {listHighlight.overlay}
          </View>
        </View>

        {isLandscape ? (
          <View style={styles.cardCol}>
            {selected ? (
              <Animated.View style={{ flex: 1, opacity: cardAnim, transform: [{ translateY: cardSlide }] }}>
                <ClientCard
                  key={selected.id}
                  client={selected}
                  loyaltyModel={loyaltyModel}
                  loyaltyConfig={loyaltyConfig}
                  onNewOrder={(c) => navigation.navigate('Kassa', { forClient: { id: c.id, fio: c.fio, code: c.code } })}
                  onSaved={() => load()}
                  onDeleted={onClientDeleted}
                />
              </Animated.View>
            ) : (
              <View style={[styles.emptyBox, { opacity: 0.75 }]}>
                <View style={styles.emptyIco}><Icon name="user" size={34} color={colors.textDim} /></View>
                <Text style={[styles.emptyTitle, { fontSize: 17, color: colors.textDim }]}>Выберите клиента</Text>
                <Text style={[styles.emptyText, { marginBottom: 0 }]}>Карточка с баллами, историей и заметками откроется здесь</Text>
              </View>
            )}
          </View>
        ) : (
          <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.fio || 'Клиент'} fixedHeightPct={0.9}>
            {selected && (
              <ClientCard
                key={selected.id}
                client={selected}
                loyaltyModel={loyaltyModel}
                loyaltyConfig={loyaltyConfig}
                onNewOrder={(c) => navigation.navigate('Kassa', { forClient: { id: c.id, fio: c.fio, code: c.code } })}
                onSaved={() => load()}
                onDeleted={onClientDeleted}
              />
            )}
          </Sheet>
        )}
      </View>

      {/* Окно «Фильтры» — под кнопкой, в прозрачном слое: тап вне окна закрывает */}
      <Modal visible={popOpen} transparent animationType="fade" onRequestClose={() => setPopOpen(false)}>
        <View style={{ flex: 1 }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPopOpen(false)} />
          <View style={[styles.popWrap, { top: popAnchor.top, right: popAnchor.right }]}>
            <GlassSurface floating radius={22} tint="32,40,55" alpha={0.97} padding={20} sheen={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.01)']}>
              <Text style={styles.popLbl}>Сортировка</Text>
              <View style={styles.popChips}>
                {[{ k: 'name', t: 'По алфавиту' }, { k: 'added', t: 'Сначала новые' }].map(o => (
                  <Pressable key={o.k} style={[styles.popChip, sortMode === o.k && styles.popChipOn]} onPress={() => setSortMode(o.k)}>
                    <Text style={[styles.popChipTxt, sortMode === o.k && { color: colors.orangeLight }]}>{o.t}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.popLbl, { marginTop: 16 }]}>QR-регистрации</Text>
              <GlassButton icon="refresh" label="Загрузить новые" height={46} onPress={() => { setPopOpen(false); refreshSignups(); }} />
              <View style={styles.popFoot}>
                <Pressable onPress={() => setSortMode('name')} disabled={sortMode === 'name'} hitSlop={8}>
                  <Text style={[styles.popReset, sortMode === 'name' && { opacity: 0.4 }]}>Сбросить</Text>
                </Pressable>
                <Text style={styles.popCount}>Найдено <Text style={styles.popCountB}>{countRu(filtered.length, terms.client.toLowerCase())}</Text></Text>
              </View>
            </GlassSurface>
          </View>
        </View>
      </Modal>

      <TourGuide
        visible={tourOpen}
        onClose={() => { setTourOpen(false); markTourSeen('ClientsList'); }}
        steps={tourSteps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tourBtn:  { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(127,168,217,0.1)', borderWidth: 1, borderColor: 'rgba(127,168,217,0.4)', alignItems: 'center', justifyContent: 'center' },
  tourBtnTxt: { fontFamily: fonts.family, fontSize: 18, color: colors.orange },
  layout:     { flex: 1, flexDirection: 'row' },
  listCol:    { width: '38%', maxWidth: 480, margin: 12, marginRight: 0, borderRadius: 16, borderWidth: 1, borderColor: colors.borderHi, backgroundColor: colors.surface2, overflow: 'hidden' },
  cardCol:    { flex: 1, backgroundColor: colors.bg },
  loyaltyStrip:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface2, borderBottomWidth: 1, borderBottomColor: colors.border },
  loyaltyStripLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  loyaltyStripVal:   { fontFamily: fonts.family, fontSize: 16, color: colors.text, marginTop: 2 },
  loyaltyStripChevron: { fontSize: 12, color: colors.muted, opacity: 0.6 },
  loyaltyStripBody:  { padding: 14, gap: 10, backgroundColor: colors.surface2, borderBottomWidth: 1, borderBottomColor: colors.border },
  loyaltyStripDesc:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, lineHeight: 18 },
  loyaltyStatRow:    { flexDirection: 'row', gap: 8 },
  loyaltyStatBox:    { flex: 1, backgroundColor: colors.surface3, borderRadius: 10, borderWidth: 1, borderColor: colors.borderHi, padding: 10, alignItems: 'center' },
  loyaltyStatVal:    { fontFamily: fonts.family, fontSize: 16, color: colors.text },
  loyaltyStatLbl:    { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },

  searchWrap: { padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  sortChip: { paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  sortChipActive: { backgroundColor: 'rgba(127,168,217,0.14)', borderColor: colors.orange },
  sortChipTxt: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.muted },
  sortChipTxtActive: { color: colors.orange },
  searchInput:{ backgroundColor: colors.surface2, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12, fontFamily: fonts.familyRegular, fontSize: 16, color: colors.text },
  addBtn:     { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(127,168,217,0.15)', borderWidth: 1, borderColor: 'rgba(127,168,217,0.4)', alignItems: 'center', justifyContent: 'center' },
  addBtnTxt:  { fontSize: 24, color: colors.orange, lineHeight: 31 },
  addBtnBig:  { margin: 12, marginBottom: 0, paddingVertical: 15, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center' },
  addBtnBigTxt: { fontFamily: fonts.family, fontSize: 16, color: colors.onAccent },

  clientsCard:   { margin: 8, backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  clientRow:     { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, position: 'relative' },
  clientRowDiv:  { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  clientRowActive:{ backgroundColor: 'rgba(127,168,217,0.07)' },
  clientName:    { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  clientSub:     { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 3 },
  listAvatar:    { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  listAvatarActive:{ backgroundColor: colors.orange },
  listAvatarTxt: { fontFamily: fonts.familySemibold, fontSize: 18, color: colors.muted },
  activeBar:     { position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 3, borderRadius: 2, backgroundColor: colors.orange },

  // Карточка клиента
  cardHead:    { alignItems: 'center', marginBottom: 20 },
  avatar:      { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(165,168,212,0.15)', borderWidth: 2, borderColor: 'rgba(165,168,212,0.35)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarTxt:   { fontFamily: fonts.family, fontSize: 28, color: colors.indigo },
  cardName:    { fontFamily: fonts.family, fontSize: 24, color: colors.text },
  cardCode:    { fontFamily: 'monospace', fontSize: 12, color: colors.muted, marginTop: 4 },
  birthday:    { fontFamily: fonts.familySemibold, fontSize: 14, color: '#D9AC62', marginTop: 6 },

  balanceBox:  { alignItems: 'center', marginBottom: 20 },
  balanceNum:  { fontFamily: fonts.family, fontSize: 48, color: colors.text },
  balanceLbl:  { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5 },
  personalDiscount: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.orange, marginTop: 4 },

  statsRow:    { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statBox:     { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderHi, borderRadius: 14, padding: 14, alignItems: 'center' },
  statVal:     { fontFamily: fonts.family, fontSize: 20, color: colors.text },
  statLbl:     { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textTransform: 'uppercase', marginTop: 3 },

  infoCard:    { backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, marginBottom: 16, overflow: 'hidden' },
  infoRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  infoRowDiv:  { borderBottomWidth: 1, borderBottomColor: colors.border },
  infoIcon:    { fontSize: 16, width: 22, textAlign: 'center' },
  infoTxt:     { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted },

  section:     { marginTop: 16 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle:{ fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5 },
  sectionAction:{ fontFamily: fonts.familySemibold, fontSize: 12, color: colors.greenLight },
  noteInput:   { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  noteText:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim, lineHeight: 22, backgroundColor: colors.surface2, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  notePlaceholder: { fontFamily: fonts.familyRegular, fontSize: 14, color: 'rgba(255,255,255,0.2)' },

  btn:        { paddingVertical: 18, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center' },
  btnTxt:     { fontFamily: fonts.family, fontSize: 16, color: colors.onAccent },
  delBtn:     { marginTop: 28, marginBottom: 12, paddingVertical: 15, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(219,129,120,0.35)', alignItems: 'center' },
  delBtnTxt:  { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.red },
  btnSec:     { paddingVertical: 18, borderRadius: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderHi, alignItems: 'center' },
  btnSecTxt:  { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.textDim },

  editBox:    { marginTop: 16, padding: 16, backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, gap: 4 },
  fieldLbl:   { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 10, marginBottom: 4 },
  input:      { padding: 15, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderHi, borderRadius: 12, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 16 },

  ordersCard:    { backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.borderHi, overflow: 'hidden' },
  orderRow:      { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 },
  orderDiv:      { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  orderDate:     { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  orderMethod:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 3 },
  orderTotal:    { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.orange },
  orderChevron:  { fontSize: 18, color: 'rgba(255,255,255,0.16)', transform: [{ rotate: '90deg' }] },
  orderChevronOpen: { transform: [{ rotate: '-90deg' }] },
  orderItems:    { backgroundColor: colors.surface2, paddingHorizontal: 14, paddingVertical: 10 },
  orderItem:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  orderItemName: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, flex: 1 },
  orderItemPrice:{ fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  // ── Новый вид экрана «Клиенты» ──
  tb:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 2 },
  tbSearch:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 54, borderRadius: 16, paddingHorizontal: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  tbInput:     { flex: 1, padding: 0, color: colors.text, fontSize: 17, fontFamily: fonts.familyMedium },
  tbFilt:      { flexDirection: 'row', alignItems: 'center', gap: 8, height: 54, paddingHorizontal: 20, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  tbFiltOn:    { backgroundColor: 'rgba(127,168,217,0.18)', borderColor: 'rgba(157,191,230,0.5)' },
  tbFiltTxt:   { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.textDim },
  afil:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 10 },
  afChip:      { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingLeft: 14, paddingRight: 10, borderRadius: 999, backgroundColor: 'rgba(127,168,217,0.18)', borderWidth: 1, borderColor: 'rgba(157,191,230,0.45)' },
  afChipTxt:   { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orangeLight },
  afReset:     { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, paddingHorizontal: 6 },
  popWrap:     { position: 'absolute', width: 400, maxWidth: '94%' },
  popLbl:      { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.textDim, marginBottom: 10 },
  popChips:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  popChip:     { height: 40, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  popChipOn:   { backgroundColor: 'rgba(127,168,217,0.22)', borderColor: 'rgba(157,191,230,0.5)' },
  popChipTxt:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  popFoot:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)' },
  popReset:    { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  popCount:    { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  popCountB:   { fontFamily: fonts.familySemibold, color: colors.text },
  cAv:         { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(127,168,217,0.16)', borderWidth: 1, borderColor: 'rgba(157,191,230,0.3)' },
  cAvOn:       { backgroundColor: colors.orange },
  cAvTxt:      { fontFamily: fonts.family, fontSize: 15, color: colors.orangeLight },
  cName:       { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  cSub:        { fontFamily: fonts.familyMedium, fontSize: 12, color: colors.muted, marginTop: 2 },
  cBal:        { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.orangeLight },
  cBalLbl:     { fontFamily: fonts.familyMedium, fontSize: 12, color: colors.muted, marginTop: 2 },
  cStripe:     { position: 'absolute', left: 0, top: 24, bottom: 24, width: 3, borderTopRightRadius: 2, borderBottomRightRadius: 2, backgroundColor: colors.orange },
  cTileLbl:    { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.1, textTransform: 'uppercase', color: colors.textDim },
  cTileVal:    { fontFamily: fonts.display, fontSize: 22, color: colors.text, marginTop: 6, letterSpacing: -0.3 },
  cHeroVal:    { fontFamily: fonts.display, fontSize: 52, color: colors.text, marginTop: 6, letterSpacing: -1.6 },
  cHeroSub:    { fontFamily: fonts.familyMedium, fontSize: 14, color: colors.textDim, marginTop: 6 },
  emptyBox:    { alignItems: 'center', justifyContent: 'center', padding: 24, flexGrow: 1 },
  emptyIco:    { width: 76, height: 76, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle:  { fontFamily: fonts.familySemibold, fontSize: 20, color: colors.text, marginBottom: 8 },
  emptyText:   { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 21, maxWidth: 300, marginBottom: 20 },
});
