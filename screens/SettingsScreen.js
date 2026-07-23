import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, Share, Animated, LayoutAnimation, Platform, Alert, BackHandler, useWindowDimensions, Dimensions } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
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
  exportAllData,
} from '../db/queries';
import { canConvert, conversionFactor } from '../constants/units';
import Hint from '../components/Hint';
import InfoTip from '../components/InfoTip';
import Toggle from '../components/Toggle';
import { can } from '../db/session';
import EmptyState from '../components/EmptyState';
import { colors, fonts, spacing } from '../constants/theme';
import { useToast } from '../components/Toast';

// SectionAccordion — в 2-колоночном layout просто передаёт children
function SectionAccordion({ sectionKey, selectedSection, children }) {
  if (selectedSection !== sectionKey) return null;
  return <View style={{ flex: 1 }}>{children}</View>;
}


// LayoutAnimation работает автоматически в New Architecture

export default function SettingsScreen({ navigation }) {
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
  const [productModal, setProductModal]   = useState(null);
  const [priceSchedules, setPriceSchedules] = useState([]);
  // { product, variants: [{id, label, price, sku, active}], groupIds: [], techCards: { [variantKey]: [{name, amount, unit}] } }
  const [ingredientPicker, setIngredientPicker] = useState(null); // { variantKey, search }
  const [newProductModal, setNewProductModal]   = useState(null); // { name, category, price }
  const [discountModal, setDiscountModal]       = useState(null);
  const [stockModal, setStockModal]             = useState(null);
  const [groupModal, setGroupModal]             = useState(null);
  // { id, name, selectionType, options: [{id, name, priceDelta, ingrToReplace, ingrToDeduct, deductAmount, deductUnit}] }
  const [optionModal, setOptionModal]           = useState(null); // { groupId, id, name, priceDelta, ingrToReplace, ingrToDeduct, deductAmount, deductUnit }

  // ── PIN ──
  const [pinBarista, setPinBarista] = useState('');
  const [pinAdmin, setPinAdmin]     = useState('');

  // ── Общие настройки ──
  const [loyaltyModel,  setLoyaltyModel]  = useState('points');
  const [loyaltyConfig, setLoyaltyConfig] = useState({ earn_pct: 10, allow_spend: false, point_value: 1, pct: 5, deduct_per_visit: 1 });
  const [exporting, setExporting] = useState(false);

  // ── Скрытый доступ к профилю бизнеса ──
  const [titleTaps, setTitleTaps]         = useState(0);
  const [profileUnlocked, setProfileUnlocked] = useState(false);
  const [keyPromptOpen, setKeyPromptOpen] = useState(false);
  const [keyInput, setKeyInput]           = useState('');
  const [profileDraft, setProfileDraft]   = useState(null);
  const toast = useToast();
  const { width: SW } = useWindowDimensions();
  const isPhone = SW < 600;
  const [selectedSection, setSelectedSection] = useState('menu');
  const [menuSearch, setMenuSearch]   = useState('');
  const [stockSearch, setStockSearch]   = useState('');
  const [bizDraft, setBizDraft]         = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(false);
  const [stockSearchOpen, setStockSearchOpen] = useState(false);
  const [openStockCats, setOpenStockCats] = useState({});
  const [empModal, setEmpModal]         = useState(null);
  const [roleNames, setRoleNames]       = useState({ admin: 'Администратор', barista: 'Сотрудник' });

  const [techCardModal, setTechCardModal] = useState(null); // { variantKey, variantLabel }
  const [menuSearchOpen, setMenuSearchOpen] = useState(false);
  const [stockCatModal, setStockCatModal] = useState(null); // {oldName, newName}
  const [stockCats, setStockCats] = useState([]);
  const [openSections, setOpenSections] = useState({ menu: true, employees: false, loyalty: false, payment: false, stock: false, business: false, system: false });  const renameStockCategory = (oldName, newName) => {
    if (!newName.trim() || newName === oldName) return;
    try {
      const db = require('../db/database').getDb();
      db.runSync('UPDATE stock SET category = ? WHERE category = ?', [newName.trim(), oldName]);
      const s = getAllStock();
      const cats = [...new Set(s.map(i => i.category || 'Без категории'))].filter(Boolean).sort();
      setStockCats(cats);
      loadAll();
    } catch (e) { console.error(e); }
    setStockCatModal(null);
  };

  const toggleSection = (key) => {
    LayoutAnimation.configureNext({
      duration: 260,
      create:  { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update:  { type: LayoutAnimation.Types.easeInEaseOut },
      delete:  { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
    setOpenSections(s => ({ ...s, [key]: !s[key] }));
  }; // { businessName, modules, terms, units, unitInput }

  useEffect(() => { loadAll(); }, []);

  // Открываем редактор профиля при переходе в секцию
  React.useEffect(() => {
    if (selectedSection === 'business' && profile) {
      setBizDraft({
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
        theme:         profile.theme          || 'dark',
      });
    }
  }, [selectedSection, profile]);

  const saveBizDraft = () => {
    if (!bizDraft) return;
    try {
      updateBusinessProfile({
        businessName:  bizDraft.businessName,
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
        modules:       profile?.modules || {},
        terms:         profile?.terms   || {},
        roles:         profile?.roles   || {},
        units:         profile?.units   || [],
        accessKey:     profile?.access_key || '',
        preset:        profile?.preset  || 'custom',
      });
      loadAll();
    } catch(e) { console.error(e); }
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

  // ── Товары + варианты + модификаторы + техкарты ──

  // Уникальный ключ для варианта в techCards (стабильный пока открыта модалка)
  const variantKey = (v, idx) => v.id != null ? String(v.id) : `new-${idx}`;

  // Уникальный ключ для оси (id из БД или временный _uid)
  const axisUid = (a) => a.id != null ? String(a.id) : a._uid;
  const valueUid = (v) => v.id != null ? String(v.id) : v._uid;

  // Вспомогательная: счётчик для временных uid (не нужен счётчик — Date.now достаточно)
  const mkUid = () => `t_${Date.now()}_${Math.floor(Math.random()*10000)}`;

  const openProduct = (product) => {
    let raw = getProductVariants(product.id);
    if (raw.length === 0) {
      raw = [{ id: null, label: '', price: product.price || 0, sku: product.sku || '', active: true, axisValues: {} }];
    }
    const variants = raw.map(v => ({
      id: v.id, label: v.label, price: String(v.price), sku: v.sku || '',
      active: v.active !== false, axisValues: v.axisValues || {},
    }));
    const axes = getProductAxesWithValues(product.id).map(a => ({
      id: a.id, name: a.name,
      values: a.values.map(vv => ({ id: vv.id, label: vv.label })),
    }));
    const groups = getProductModifierGroups(product.id);
    const techCards = {};
    variants.forEach((v, idx) => {
      const key = variantKey(v, idx);
      const card = v.id != null ? getCostCardForVariant(v.id) : null;
      techCards[key] = card ? card.ingredients.map(ing => {
        const stockItem = stock.find(s => s.name === ing.name);
        return {
          name: ing.name,
          amount: String(ing.amount),
          unit: ing.unit,
          stockUnit: stockItem?.unit || ing.unit,
          factor: String(ing.factor ?? 1),
        };
      }) : [];
    });
    setProductModal({ product, axes, variants, groupIds: groups.map(g => g.id), techCards });
    try { setPriceSchedules(getPriceSchedules(product.id)); } catch(_) { setPriceSchedules([]); }
  };

  // ── Управление осями вариативности ──
  const addAxis = () => {
    setProductModal(m => ({
      ...m,
      axes: [...m.axes, { _uid: mkUid(), name: '', values: [] }],
    }));
  };
  const removeAxis = (aKey) => {
    setProductModal(m => ({ ...m, axes: m.axes.filter(a => axisUid(a) !== aKey) }));
  };
  const setAxisName = (aKey, name) => {
    setProductModal(m => ({
      ...m,
      axes: m.axes.map(a => axisUid(a) === aKey ? { ...a, name } : a),
    }));
  };
  const addAxisValue = (aKey) => {
    const uid = mkUid();
    setProductModal(m => ({
      ...m,
      axes: m.axes.map(a => axisUid(a) !== aKey ? a : {
        ...a, values: [...a.values, { _uid: uid, label: '' }],
      }),
    }));
  };
  const removeAxisValue = (aKey, vKey) => {
    setProductModal(m => ({
      ...m,
      axes: m.axes.map(a => axisUid(a) !== aKey ? a : {
        ...a, values: a.values.filter(v => valueUid(v) !== vKey),
      }),
    }));
  };
  const setAxisValueLabel = (aKey, vKey, label) => {
    setProductModal(m => ({
      ...m,
      axes: m.axes.map(a => axisUid(a) !== aKey ? a : {
        ...a, values: a.values.map(v => valueUid(v) !== vKey ? v : { ...v, label }),
      }),
    }));
  };

  // Декартово произведение значений осей → создаёт варианты
  const generateCombinations = () => {
    if (!productModal) return;
    const validAxes = productModal.axes.filter(a => a.values.some(v => v.label.trim()));
    if (validAxes.length === 0) return;
    const arrays = validAxes.map(a => a.values.filter(v => v.label.trim()));
    const combos = arrays.reduce(
      (acc, vals) => acc.flatMap(combo => vals.map(val => [...combo, val])),
      [[]]
    );
    const newVariants = combos.map(combo => {
      const axisValues = {};
      combo.forEach((val, i) => {
        axisValues[axisUid(validAxes[i])] = valueUid(val);
      });
      return { id: null, label: combo.map(v => v.label).join(' / '), price: '', sku: '', active: true, axisValues };
    });
    setProductModal(m => ({ ...m, variants: newVariants, techCards: {} }));
  };

  // ── Управление вариантами ──
  const addVariantRow = () => {
    setProductModal(m => ({
      ...m,
      variants: [...m.variants, { id: null, label: '', price: '', sku: '', active: true, axisValues: {} }],
    }));
  };
  const removeVariantRow = (idx) => {
    setProductModal(m => {
      const key = variantKey(m.variants[idx], idx);
      const techCards = { ...m.techCards };
      delete techCards[key];
      return { ...m, variants: m.variants.filter((_, i) => i !== idx), techCards };
    });
  };
  const setVariantField = (idx, field, value) => {
    setProductModal(m => {
      const variants = [...m.variants];
      variants[idx] = { ...variants[idx], [field]: value };
      return { ...m, variants };
    });
  };

  const toggleGroupForProduct = (groupId) => {
    setProductModal(m => {
      const has = m.groupIds.includes(groupId);
      return { ...m, groupIds: has ? m.groupIds.filter(id => id !== groupId) : [...m.groupIds, groupId] };
    });
  };

  const addIngredientRow = (key, stockItem) => {
    setProductModal(m => ({
      ...m,
      techCards: { ...m.techCards, [key]: [...(m.techCards[key] || []), {
        name: stockItem.name, amount: '', unit: stockItem.unit, stockUnit: stockItem.unit, factor: '1',
      }]},
    }));
  };
  const removeIngredientRow = (key, index) => {
    setProductModal(m => ({
      ...m,
      techCards: { ...m.techCards, [key]: m.techCards[key].filter((_, i) => i !== index) },
    }));
  };
  const setIngredientAmount = (key, index, value) => {
    setProductModal(m => {
      const rows = [...m.techCards[key]];
      rows[index] = { ...rows[index], amount: value };
      return { ...m, techCards: { ...m.techCards, [key]: rows } };
    });
  };
  // Смена единицы измерения для ингредиента техкарты.
  // Если новая единица совпадает со складской — сбрасываем фактор на 1.
  // Если совместима (та же группа) — подставляем авто-фактор.
  // Несовместимые единицы (разные группы) не принимаются.
  const setIngredientUnit = (key, index, unit) => {
    setProductModal(m => {
      const rows = [...m.techCards[key]];
      const row = rows[index];
      if (unit === row.stockUnit) {
        rows[index] = { ...row, unit, factor: '1', autoFactor: false };
      } else if (canConvert(unit, row.stockUnit)) {
        const auto = conversionFactor(unit, row.stockUnit);
        rows[index] = {
          ...row, unit,
          factor: auto != null ? String(auto) : row.factor,
          autoFactor: auto != null,
        };
      }
      // несовместимая единица — просто игнорируем
      return { ...m, techCards: { ...m.techCards, [key]: rows } };
    });
  };
  const setIngredientFactor = (key, index, factor) => {
    setProductModal(m => {
      const rows = [...m.techCards[key]];
      rows[index] = { ...rows[index], factor };
      return { ...m, techCards: { ...m.techCards, [key]: rows } };
    });
  };

  const saveProduct = () => {
    if (!productModal) return;
    // Фильтруем пустые оси и значения
    const axesPayload = (productModal.axes || [])
      .filter(a => a.name.trim())
      .map(a => ({
        id: a.id, _uid: a._uid, name: a.name.trim(),
        values: (a.values || []).filter(v => v.label?.trim()).map(v => ({
          id: v.id, _uid: v._uid, label: v.label.trim(),
        })),
      }));
    const variantsPayload = productModal.variants.map(v => ({
      id: v.id, label: v.label.trim(),
      price: parseFloat(v.price) || 0, sku: (v.sku || '').trim(),
      active: v.active, axisValues: v.axisValues || {},
    }));
    try {
      const { variants: savedVariants } = saveProductAxesAndVariants(
        productModal.product.id, axesPayload, variantsPayload
      );
      setProductModifierGroups(productModal.product.id, productModal.groupIds);
      productModal.variants.forEach((v, idx) => {
        const oldKey = variantKey(v, idx);
        const savedVariant = savedVariants[idx];
        if (!savedVariant) return;
        const ingredients = (productModal.techCards[oldKey] || [])
          .filter(r => r.name && parseFloat(r.amount) > 0)
          .map(r => ({
            name: r.name, amount: parseFloat(r.amount) || 0, unit: r.unit,
            pricePerUnit: 0, factor: parseFloat(r.factor) || 1,
          }));
        saveCostCardForVariant(savedVariant.id, ingredients);
      });
      // Обновляем базовую цену продукта минимальной ценой варианта
      try {
        const db = require('../db/database').getDb();
        const minPrice = Math.min(...variantsPayload.map(v => v.price).filter(p => p > 0));
        if (isFinite(minPrice) && minPrice > 0) {
          db.runSync('UPDATE products SET price = ? WHERE id = ?', [minPrice, productModal.product.id]);
        }
      } catch (_) {}
      loadAll();
    } catch (e) { console.error(e); }
    setProductModal(null);
  };

  const toggleProductActive = () => {
    if (!productModal) return;
    try {
      setProductActive(productModal.product.id, !productModal.product.active);
      // Обновляем базовую цену продукта минимальной ценой варианта
      try {
        const db = require('../db/database').getDb();
        const minPrice = Math.min(...variantsPayload.map(v => v.price).filter(p => p > 0));
        if (isFinite(minPrice) && minPrice > 0) {
          db.runSync('UPDATE products SET price = ? WHERE id = ?', [minPrice, productModal.product.id]);
        }
      } catch (_) {}
      loadAll();
    } catch (e) { console.error(e); }
    setProductModal(null);
  };

  // ── Новый товар ──
  const openNewProduct = () => setNewProductModal({ name: '', category: products[0]?.category || '', price: '' });
  const saveNewProduct = () => {
    if (!newProductModal || !newProductModal.name.trim() || !newProductModal.category.trim()) return;
    try {
      insertProduct({
        name: newProductModal.name.trim(),
        category: newProductModal.category.trim(),
        price_s: 0, price_m: 0, price_l: 0,
        has_milk: false, has_syrup: false,
      });
      loadAll();
    } catch (e) { console.error(e); }
    setNewProductModal(null);
  };

  // ── Пороги склада ──
  const openStockModal = (item) => setStockModal({ id: item.id, name: item.name, unit: item.unit, порог: String(item['порог'] ?? 0) });
  const saveStockModal = () => {
    if (!stockModal) return;
    try {
      updateStockThreshold(stockModal.id, parseFloat(stockModal['порог']) || 0);
      loadAll();
    } catch (e) { console.error(e); }
    setStockModal(null);
  };

  // ── Лояльность ──
  const saveLoyalty = () => {
    try { updateLoyaltyConfig(loyaltyModel, loyaltyConfig); loadAll(); } catch (e) { console.error(e); }
  };

  // ── PIN ──
  const savePins = () => {
    try {
      if (pinBarista.trim()) updateUserPin('barista', pinBarista.trim());
      if (pinAdmin.trim()) updateUserPin('admin', pinAdmin.trim());
      loadAll();
    } catch (e) { console.error(e); }
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
    try { setSetting('discounts', JSON.stringify(list)); setDiscounts(list); } catch (e) { console.error(e); }
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

  // ── Группы модификаторов ──
  const openNewGroup = () => setGroupModal({ id: null, name: '', selectionType: 'single' });
  const openEditGroup = (g) => setGroupModal({ id: g.id, name: g.name, selectionType: g.selection_type });
  const saveGroupModal = () => {
    if (!groupModal || !groupModal.name.trim()) return;
    try {
      if (groupModal.id) updateModifierGroup(groupModal.id, { name: groupModal.name.trim(), selectionType: groupModal.selectionType });
      else insertModifierGroup({ name: groupModal.name.trim(), selectionType: groupModal.selectionType });
      loadAll();
    } catch (e) { console.error(e); }
    setGroupModal(null);
  };
  const deleteGroupModal = () => {
    if (!groupModal?.id) return;
    try { deleteModifierGroup(groupModal.id); loadAll(); } catch (e) { console.error(e); }
    setGroupModal(null);
  };

  const openNewOption = (groupId) => setOptionModal({ groupId, id: null, name: '', priceDelta: '', ingrToReplace: '', ingrToDeduct: '', deductAmount: '', deductUnit: 'мл' });
  const openEditOption = (groupId, opt) => setOptionModal({
    groupId, id: opt.id, name: opt.name, priceDelta: String(opt.price_delta || 0),
    ingrToReplace: opt.ingr_to_replace || '', ingrToDeduct: opt.ingr_to_deduct || '',
    deductAmount: opt.deduct_amount ? String(opt.deduct_amount) : '', deductUnit: opt.deduct_unit || 'мл',
  });
  const saveOptionModal = () => {
    if (!optionModal || !optionModal.name.trim()) return;
    const payload = {
      name: optionModal.name.trim(),
      priceDelta: parseFloat(optionModal.priceDelta) || 0,
      ingrToReplace: optionModal.ingrToReplace.trim(),
      ingrToDeduct: optionModal.ingrToDeduct.trim(),
      deductAmount: parseFloat(optionModal.deductAmount) || 0,
      deductUnit: optionModal.deductUnit.trim(),
    };
    try {
      if (optionModal.id) updateModifierOption(optionModal.id, payload);
      else insertModifierOption({ groupId: optionModal.groupId, ...payload });
      loadAll();
    } catch (e) { console.error(e); }
    setOptionModal(null);
  };
  const deleteOptionModal = () => {
    if (!optionModal?.id) return;
    try { deleteModifierOption(optionModal.id); loadAll(); } catch (e) { console.error(e); }
    setOptionModal(null);
  };

  // ── Профиль бизнеса (скрытый доступ) ──
  const handleTitleTap = () => {
    const next = titleTaps + 1;
    setTitleTaps(next);
    if (next >= 5) {
      setTitleTaps(0);
      if (profile?.access_key) setKeyPromptOpen(true);
      else openProfileEditor(); // ключ ещё не задан — пускаем сразу один раз, чтобы можно было его установить
    }
  };
  const checkKey = () => {
    if (keyInput === profile?.access_key) {
      setKeyPromptOpen(false);
      setKeyInput('');
      openProfileEditor();
    } else {
      setKeyInput('');
    }
  };
  const openProfileEditor = () => {
    setProfileDraft({
      businessName: profile?.business_name || '',
      modules: { ...(profile?.modules || {}) },
      terms: { ...(profile?.terms || {}) },
      roles: { ...(profile?.roles || {}) },
      units: [...(profile?.units || [])],
      accessKey: profile?.access_key || '',
      unitInput: '',
    });
    setProfileUnlocked(true);
  };
  const applyPresetDraft = (key) => {
    const preset = BUSINESS_PRESETS[key];
    if (!preset) return;
    setProfileDraft(d => ({ ...d, modules: { ...preset.modules }, terms: { ...preset.terms }, roles: { ...(preset.roles || {}) }, units: [...preset.units] }));
  };
  const toggleModuleDraft = (key) => {
    setProfileDraft(d => ({ ...d, modules: { ...d.modules, [key]: !d.modules[key] } }));
  };
  const setTermDraft = (key, value) => {
    setProfileDraft(d => ({ ...d, terms: { ...d.terms, [key]: value } }));
  };
  const addUnitDraft = () => {
    const val = profileDraft.unitInput.trim();
    if (!val || profileDraft.units.includes(val)) return;
    setProfileDraft(d => ({ ...d, units: [...d.units, val], unitInput: '' }));
  };
  const removeUnitDraft = (u) => {
    setProfileDraft(d => ({ ...d, units: d.units.filter(x => x !== u) }));
  };
  const saveProfileDraft = () => {
    if (!profileDraft) return;
    try {
      updateBusinessProfile({
        businessName: profileDraft.businessName,
        modules: profileDraft.modules,
        terms: profileDraft.terms,
        roles: profileDraft.roles,
        units: profileDraft.units,
        accessKey: profileDraft.accessKey,
      });
      loadAll();
    } catch (e) { console.error(e); }
    setProfileUnlocked(false);
  };

  // ── Экспорт / бэкап ──
  const handleExport = async () => {
    setExporting(true);
    try {
      const data = exportAllData();
      const json = JSON.stringify(data, null, 2);
      await Share.share({ title: `Бэкап ${new Date().toISOString().slice(0, 10)}`, message: json });
    } catch (e) { console.error(e); }
    setExporting(false);
  };

  const categories = [...new Set(products.map(p => p.category))];
  const modules = profile?.modules || {};
  const terms = getTerms();

  const SECTIONS = [
    { key: 'menu',      icon: '🍽',  label: 'Меню и цены' },
    { key: 'employees', icon: '👥',  label: 'Сотрудники' },
    { key: 'loyalty',   icon: '⭐',  label: 'Лояльность' },
    { key: 'payment',   icon: '💳',  label: 'Оплата и скидки' },
    { key: 'stock',     icon: '📦',  label: 'Склад' },
    { key: 'business',  icon: '⚙️',  label: 'Профиль бизнеса' },
    { key: 'system',    icon: '🔧',  label: 'Система' },
  ];

  const visibleSections = SECTIONS.filter(s => {
    if (s.key === 'stock' && modules.stock === false) return false;
    if (s.key === 'loyalty' && modules.loyalty === false) return false;
    return true;
  });

  const rightPanel = (
    <>
    {/* Шапка поиска вынесена НАД ScrollView — всегда видна, touch работает */}
    {selectedSection === 'menu' && (
      <View style={styles.menuTopBarSticky}>
        {/* Заголовок — на всю ширину */}
        <Text style={styles.menuTopTitle}>{pluralizeRu(terms.item)}</Text>

        {/* Плавающие кнопки — поверх через position:absolute */}
        <View style={styles.menuFloatBtns} pointerEvents="box-none">
          {menuSearchOpen ? (
            <View style={styles.menuSearchExpanded}>
              <TextInput
                style={styles.menuSearchInput}
                value={menuSearch}
                onChangeText={setMenuSearch}
                placeholder="Поиск..."
                placeholderTextColor={colors.muted}
                autoFocus
              />
              <Pressable
                onPress={() => { setMenuSearchOpen(false); setMenuSearch(''); }}
                hitSlop={14}
                style={styles.menuBadge}
              >
                <Text style={styles.menuBadgeText}>✕</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.menuFloatRow}>
              <Pressable onPress={() => setMenuSearchOpen(true)} hitSlop={14} style={styles.menuBadge}>
                <Text style={styles.menuBadgeText}>🔍</Text>
              </Pressable>
              <Pressable onPress={openNewProduct} hitSlop={14} style={[styles.menuBadge, styles.menuBadgeAdd]}>
                <Text style={[styles.menuBadgeText, { color: colors.greenLight }]}>＋</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    )}

    {/* Скролл закрывает поиск */}
    <Pressable
      style={{ flex: 1 }}
      onPress={() => menuSearchOpen && (setMenuSearchOpen(false), setMenuSearch(''))}
    >
    <ScrollView
      style={styles.rightPanel}
      contentContainerStyle={styles.rightInner}
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={() => { if (menuSearchOpen) { setMenuSearchOpen(false); setMenuSearch(''); } }}
    >
      {/* Заголовок секции */}
      <Text style={styles.sectionTitle}>
        {SECTIONS.find(s => s.key === selectedSection)?.label || ''}
      </Text>

        {/* Меню и цены */}
        <SectionAccordion sectionKey="menu" selectedSection={selectedSection}>

        {/* Список товаров по категориям */}
        {(() => {
          const filtered = products.filter(p =>
            !menuSearch.trim() ||
            p.name?.toLowerCase().includes(menuSearch.toLowerCase())
          );
          const cats = [...new Set(filtered.map(p => p.category || 'Без категории'))];
          if (filtered.length === 0) {
            return <Text style={[styles.empty, { paddingVertical: 24 }]}>Нет {genitivePluralRu(terms.item).toLowerCase()}{menuSearch ? ` по запросу «${menuSearch}»` : ''}.</Text>;
          }
          return cats.map(cat => {
            const catProducts = filtered.filter(p => (p.category || 'Без категории') === cat);
            return (
              <View key={cat} style={styles.menuCatGroup}>
                {/* Заголовок категории */}
                <View style={styles.menuCatRow}>
                  <View style={styles.menuCatLine} />
                  <Text style={styles.menuCatName}>{cat}</Text>
                  <View style={styles.menuCatLine} />
                </View>
                {/* Карточка с товарами */}
                <View style={styles.menuCard}>
                  {catProducts.map((p, idx) => {
                    const inactive = !p.active;
                    const hasVariants = p.variants && p.variants.length > 1;
                    const price = p.price > 0
                      ? (hasVariants ? `от ${p.price} ₽` : `${p.price} ₽`)
                      : null;
                    return (
                      <Pressable
                        key={p.id}
                        style={({ pressed }) => [
                          styles.menuRow,
                          idx < catProducts.length - 1 && styles.menuRowDiv,
                          pressed && { backgroundColor: 'rgba(255,255,255,0.03)' },
                          inactive && { opacity: 0.45 },
                        ]}
                        onPress={() => openProduct(p)}
                      >
                        <Text style={styles.menuItemName} numberOfLines={1}>
                          {inactive ? '🚫 ' : ''}{p.name}
                        </Text>
                        <Text style={[styles.menuItemPrice, !price && styles.menuItemPriceNone]}>
                          {price || 'цена не задана'}
                        </Text>
                        <Text style={styles.menuItemArrow}>›</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          });
        })()}

        {/* Модификаторы */}
        {modules.modifiers !== false && (
          <View style={{ marginTop: 24 }}>
            <View style={styles.menuTopBarSticky}>
              <Text style={styles.menuTopTitle}>Модификаторы</Text>
              <View style={styles.menuFloatBtns} pointerEvents="box-none">
                <View style={styles.menuFloatRow}>
                  <Pressable onPress={openNewGroup} hitSlop={14} style={[styles.menuBadge, styles.menuBadgeAdd]}>
                    <Text style={[styles.menuBadgeText, { color: colors.greenLight }]}>＋</Text>
                  </Pressable>
                </View>
              </View>
            </View>
            {modifierGroups.length === 0 ? (
              <Text style={[styles.empty, { paddingVertical: 16 }]}>Групп пока нет.</Text>
            ) : (
              <View style={styles.menuCard}>
                {modifierGroups.map((g, idx) => (
                  <Pressable
                    key={g.id}
                    style={({ pressed }) => [
                      styles.menuRow,
                      idx < modifierGroups.length - 1 && styles.menuRowDiv,
                      pressed && { backgroundColor: 'rgba(255,255,255,0.03)' },
                    ]}
                    onPress={() => openEditGroup(g)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuItemName}>{g.name}</Text>
                      <Text style={styles.menuItemSub}>
                        {g.selection_type === 'multiple' ? 'Несколько вариантов' : 'Один вариант'} · {g.options.length} опц.
                      </Text>
                    </View>
                    <Text style={styles.menuItemArrow}>›</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        </SectionAccordion>

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
                <Text style={[styles.menuBadgeText, { color: colors.greenLight }]}>＋</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Список сотрудников */}
        {users.length === 0 ? (
          <Text style={[styles.empty, { paddingVertical: 20 }]}>Нет сотрудников. Нажмите ＋ чтобы добавить.</Text>
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
                tip: 'Подходит для кофеен, ресторанов, магазинов — стимулирует повторные покупки.',
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
                style={[styles.menuRow, idx < 2 && styles.menuRowDiv, loyaltyModel === m.key && { backgroundColor: 'rgba(61,158,146,0.06)' }]}
                onPress={() => setLoyaltyModel(m.key)}
              >
                <Text style={{ fontSize: 22, marginRight: 12 }}>{m.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuItemName, loyaltyModel === m.key && { color: colors.greenLight }]}>{m.label}</Text>
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
                  <Text style={styles.loyaltyExampleLine}>Клиент заплатит <Text style={styles.loyaltyExampleAccent}>{example - disc} ₽</Text> вместо {example} ₽ <Text style={{ color: colors.redLight }}>(−{disc} ₽)</Text></Text>
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
              <Pressable onPress={openNewPayMethod} hitSlop={14} style={[styles.menuBadge, styles.menuBadgeAdd]}>
                <Text style={[styles.menuBadgeText, { color: colors.greenLight }]}>＋</Text>
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
                <Text style={[styles.menuBadgeText, { color: colors.greenLight }]}>＋</Text>
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
                <Text style={[styles.menuItemPrice, { color: colors.redLight, marginRight: 8 }]}>−{d.pct}%</Text>
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
                    <Text style={[styles.menuBadgeText, { color: colors.greenLight }]}>＋</Text>
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
        {modules.stock !== false ? (<>

          {/* Поиск — sticky как в Меню и ценах */}
          {selectedSection === 'stock' && (
            <View style={styles.menuTopBarSticky}>
              {stockSearchOpen ? (
                <View style={styles.menuSearchRow}>
                  <TextInput
                    color={colors.text}
                    style={styles.menuSearchInput}
                    value={stockSearch}
                    onChangeText={setStockSearch}
                    placeholder="Поиск позиции..."
                    placeholderTextColor={colors.muted}
                    autoFocus
                  />
                  <Pressable onPress={() => { setStockSearchOpen(false); setStockSearch(''); }} hitSlop={10} style={styles.menuBadge}>
                    <Text style={styles.menuBadgeText}>✕</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.menuSearchRow}>
                  <Text style={styles.menuTopTitle}>Пороги остатков</Text>
                  <Pressable onPress={() => setStockSearchOpen(true)} hitSlop={14} style={styles.menuBadge}>
                    <Text style={styles.menuBadgeText}>🔍</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {stock.length === 0 ? (
            <View style={[styles.menuCard, { padding: 16 }]}>
              <Text style={styles.menuItemSub}>Позиции склада появятся здесь после заполнения техкарт в разделе Меню и цены.</Text>
            </View>
          ) : (() => {
            const filtered = stock.filter(s =>
              !stockSearch.trim() || s.name?.toLowerCase().includes(stockSearch.toLowerCase())
            );
            const cats = [...new Set(filtered.map(s => s.category || 'Без категории'))].sort();
            if (filtered.length === 0) return (
              <Text style={[styles.empty, { paddingVertical: 16 }]}>Ничего не найдено</Text>
            );
            return cats.map(cat => {
              const items = filtered.filter(s => (s.category || 'Без категории') === cat);
              const isOpen = openStockCats[cat] === true; // закрыто по умолчанию
              return (
                <View key={cat} style={{ marginBottom: 12 }}>
                  {/* Заголовок категории — тап раскрывает/скрывает */}
                  <Pressable
                    style={({ pressed }) => [styles.stockAccHead, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
                    onPress={() => setOpenStockCats(prev => ({ ...prev, [cat]: !isOpen }))}
                  >
                    <Text style={styles.stockAccTitle}>{cat}</Text>
                    <Text style={[styles.stockAccArrow, isOpen && { transform: [{ rotate: '180deg' }] }]}>▼</Text>
                  </Pressable>

                  {/* Список позиций */}
                  {isOpen && (
                    <View style={styles.menuCard}>
                      {items.map((s, idx) => (
                        <View
                          key={s.id}
                          style={[styles.menuRow, idx < items.length - 1 && styles.menuRowDiv]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.menuItemName}>{s.name}</Text>
                          </View>
                          <TextInput
                            color={colors.text}
                            style={styles.loyaltyInput}
                            keyboardType="numeric"
                            value={String(s['порог'] || '')}
                            placeholder="0"
                            placeholderTextColor={colors.muted}
                            onChangeText={v => {
                              const val = parseFloat(v) || 0;
                              try { updateStockThreshold(s.id, val); loadAll(); } catch (_) {}
                            }}
                          />
                          <Text style={[styles.loyaltyUnit, { width: 40 }]}>{s.unit}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            });
          })()}

          {/* Категории склада */}
          {stockCats.length > 0 && (<>
            <View style={[styles.menuTopBarSticky, { marginTop: 24 }]}>
              <Text style={styles.menuTopTitle}>Категории склада</Text>
            </View>
            <Text style={[styles.menuItemSub, { marginBottom: 10 }]}>
              Нажмите чтобы переименовать — изменится у всех позиций категории
            </Text>
            <View style={styles.menuCard}>
              {stockCats.map((cat, idx) => (
                <Pressable
                  key={cat}
                  style={({ pressed }) => [styles.menuRow, idx < stockCats.length - 1 && styles.menuRowDiv, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
                  onPress={() => setStockCatModal({ oldName: cat, newName: cat })}
                >
                  <Text style={[styles.menuItemName, { flex: 1 }]}>{cat}</Text>
                  <Text style={styles.menuItemArrow}>›</Text>
                </Pressable>
              ))}
            </View>
          </>)}

          {/* Несвязанные техкарты — аккордеон */}
          {unlinkedCards.length > 0 && (
            <View style={{ marginTop: 20 }}>
              <Pressable
                style={({ pressed }) => [styles.stockAccHead, { backgroundColor: pressed ? 'rgba(160,16,32,0.06)' : 'rgba(160,16,32,0.04)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(160,16,32,0.2)' }]}
                onPress={() => setOpenStockCats(prev => ({ ...prev, __unlinked: !prev.__unlinked }))}
              >
                <Text style={{ fontSize: 16, marginRight: 8 }}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stockAccTitle, { color: colors.redLight }]}>Несвязанные техкарты</Text>
                  <Text style={styles.menuItemSub}>Пересоздайте через карточку товара</Text>
                </View>
                <Text style={[styles.stockAccArrow, openStockCats.__unlinked && { transform: [{ rotate: '180deg' }] }]}>▼</Text>
              </Pressable>
              {openStockCats.__unlinked && (
                <View style={[styles.menuCard, { marginTop: 6, borderColor: 'rgba(160,16,32,0.2)' }]}>
                  {unlinkedCards.map((uc, idx) => (
                    <View key={uc.id} style={[styles.menuRow, idx < unlinkedCards.length - 1 && styles.menuRowDiv]}>
                      <Text style={[styles.menuItemName, { flex: 1, color: colors.muted }]}>{uc.name}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

        </>) : (
          <View style={[styles.menuCard, { padding: 16 }]}>
            <Text style={styles.menuItemSub}>Модуль склада отключён в настройках профиля бизнеса.</Text>
          </View>
        )}
        </SectionAccordion>

        <SectionAccordion sectionKey="business" selectedSection={selectedSection}>
        {bizDraft ? (<>

          {/* ОСНОВНОЕ */}
          <Text style={styles.bizGroupLabel}>Основное</Text>
          <View style={styles.menuCard}>
            {[
              { key: 'businessName', label: 'Название бизнеса', placeholder: 'Кофейня «Берёза»' },
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput color={colors.text} style={[styles.bizInput, { width: 70, textAlign: 'center' }]} value={bizDraft.hoursFrom} onChangeText={v => setBizDraft(d => ({ ...d, hoursFrom: v }))} placeholder="09:00" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />
                <Text style={{ color: colors.muted }}>—</Text>
                <TextInput color={colors.text} style={[styles.bizInput, { width: 70, textAlign: 'center' }]} value={bizDraft.hoursTo} onChangeText={v => setBizDraft(d => ({ ...d, hoursTo: v }))} placeholder="21:00" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />
              </View>
            </View>
          </View>

          {/* ЧЕК */}
          <Text style={styles.bizGroupLabel}>Чек и печать</Text>
          <View style={styles.menuCard}>
            <View style={[styles.bizFieldRow, styles.menuRowDiv]}>
              <Text style={styles.bizFieldLabel}>Название на чеке</Text>
              <TextInput color={colors.text} style={styles.bizInput} value={bizDraft.receiptName} onChangeText={v => setBizDraft(d => ({ ...d, receiptName: v }))} placeholder={bizDraft.businessName || 'Как в основном'} placeholderTextColor={colors.muted} />
            </View>
            <View style={styles.bizFieldRow}>
              <Text style={styles.bizFieldLabel}>Текст подвала</Text>
              <TextInput color={colors.text} style={styles.bizInput} value={bizDraft.receiptFooter} onChangeText={v => setBizDraft(d => ({ ...d, receiptFooter: v }))} placeholder="Спасибо за покупку!" placeholderTextColor={colors.muted} />
            </View>
          </View>
          <Pressable style={({ pressed }) => [styles.bizPreviewBtn, pressed && { opacity: 0.8 }]} onPress={() => setReceiptPreview(true)}>
            <Text style={styles.bizPreviewBtnText}>👁 Предпросмотр чека</Text>
          </Pressable>

          {/* ВАЛЮТА */}
          <Text style={styles.bizGroupLabel}>Валюта и формат</Text>
          <View style={styles.menuCard}>
            <View style={[styles.bizFieldRow, styles.menuRowDiv]}>
              <Text style={styles.bizFieldLabel}>Символ валюты</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['₽','$','€','₸','₴'].map(cur => (
                  <Pressable key={cur} style={[styles.bizCurrencyChip, bizDraft.currency === cur && styles.bizCurrencyChipActive]} onPress={() => setBizDraft(d => ({ ...d, currency: cur }))}>
                    <Text style={[styles.bizCurrencyText, bizDraft.currency === cur && { color: colors.greenLight }]}>{cur}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.bizFieldRow}>
              <Text style={styles.bizFieldLabel}>Формат даты</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['DD.MM.YYYY','MM/DD/YYYY','YYYY-MM-DD'].map(fmt => (
                  <Pressable key={fmt} style={[styles.bizCurrencyChip, bizDraft.dateFormat === fmt && styles.bizCurrencyChipActive]} onPress={() => setBizDraft(d => ({ ...d, dateFormat: fmt }))}>
                    <Text style={[{ fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted }, bizDraft.dateFormat === fmt && { color: colors.greenLight }]}>{fmt}</Text>
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
              { key: 'instagram', label: '📸 Instagram', placeholder: '@coffee.shop'    },
              { key: 'vk',        label: '🔵 ВКонтакте', placeholder: 'vk.com/coffee'  },
              { key: 'website',   label: '🌐 Сайт',      placeholder: 'coffee.ru'       },
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
              onPress={() => { setSetting('onboarding_done', ''); navigation.navigate('Onboarding'); }}
            >
              <Text style={{ fontSize: 20, marginRight: 12 }}>🚀</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemName}>Мастер настройки</Text>
                <Text style={styles.menuItemSub}>Перезапустить первоначальную настройку</Text>
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
                  const data = exportAllData();
                  await Share.share({ message: data, title: 'Резервная копия СТРУКТУРА' });
                } catch (e) { console.error(e); }
              }}
            >
              <Text style={{ fontSize: 20, marginRight: 12 }}>💾</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemName}>Сохранить резервную копию</Text>
                <Text style={styles.menuItemSub}>Товары, клиенты, продажи, настройки — всё в одном файле</Text>
              </View>
              <Text style={styles.menuItemArrow}>›</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: 'rgba(255,59,48,0.04)' }]}
              onPress={() => {
                Alert.alert(
                  'Сбросить все данные?',
                  'Удалятся все продажи, клиенты, товары и настройки. Это действие невозможно отменить.',
                  [
                    { text: 'Отмена', style: 'cancel' },
                    { text: 'Сбросить', style: 'destructive', onPress: () => {
                      try {
                        const db = require('../db/database').getDb();
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
                      } catch (e) { console.error(e); }
                    }},
                  ]
                );
              }}
            >
              <Text style={{ fontSize: 20, marginRight: 12 }}>🗑</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuItemName, { color: colors.redLight }]}>Сбросить все данные</Text>
                <Text style={styles.menuItemSub}>Удалить продажи, клиентов, товары. Настройки сохранятся</Text>
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
              <Text style={{ fontSize: 20, marginRight: 12 }}>📦</Text>
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
    </Pressable>
    </>
  );

  if (!can('access_settings')) return (
    <View style={{ flex: 1 }}>
      <TopBar title="Настройки" onBack={() => navigation.navigate(getHomeRoute())} />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Text style={{ fontSize: 32, marginBottom: 16 }}>🔒</Text>
        <Text style={{ fontFamily: 'AnekDevanagari_700Bold', fontSize: 18, color: '#ddd8d0', textAlign: 'center' }}>Нет доступа</Text>
        <Text style={{ fontFamily: 'AnekDevanagari_400Regular', fontSize: 14, color: '#4a4d54', textAlign: 'center', marginTop: 8 }}>Настройки доступны только администратору.</Text>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Настройки" onBack={() => navigation.navigate('Admin')} />
      <View style={styles.twoCol}>

        {/* Левая панель навигации */}
        {(!isPhone || !selectedSection) && (
          <View style={styles.leftPanel}>
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
      <BottomBar navigation={navigation} activeTab="Kassa" />

      {/* Модалка товара */}
      <Modal visible={!!productModal} transparent animationType="slide" onRequestClose={() => setProductModal(null)}>
        <View style={styles.prodModalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setProductModal(null)} />
          {productModal && (
            <View style={styles.prodModalBox}>
              {/* Заголовок */}
              <View style={styles.prodModalHeader}>
                <Text style={styles.prodModalTitle}>
                  {productModal.product.id ? 'Редактировать' : `Новый ${terms.item.toLowerCase()}`}
                </Text>
                <Pressable onPress={() => setProductModal(null)} hitSlop={14} style={styles.itemModalClose}>
                  <Text style={styles.itemModalCloseText}>✕</Text>
                </Pressable>
              </View>

              {/* Контент */}
              <ScrollView
                contentContainerStyle={{ padding: 20, paddingTop: 8 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Название */}
                <Text style={styles.productFieldLabel}>Название</Text>
                <TextInput
                  color={colors.text}
                  style={styles.prodInput}
                  value={productModal.product.name}
                  onChangeText={v => setProductModal(m => ({ ...m, product: { ...m.product, name: v } }))}
                  placeholder="Название товара"
                  placeholderTextColor={colors.muted}
                />

                {/* Категория */}
                <Text style={styles.productFieldLabel}>Категория</Text>
                <View style={styles.productCatRow}>
                  {categories.map(cat => (
                    <Pressable
                      key={cat}
                      style={[styles.productCatChip, productModal.product.category === cat && styles.productCatChipActive]}
                      onPress={() => setProductModal(m => ({ ...m, product: { ...m.product, category: cat } }))}
                    >
                      <Text style={[styles.productCatChipText, productModal.product.category === cat && styles.productCatChipTextActive]}>{cat}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* Цена / Варианты */}
                <View style={styles.productSectionHead}>
                  <Text style={styles.productFieldLabel}>
                    {productModal.variants.length > 1 ? 'Варианты и цены' : 'Цена'}
                  </Text>
                  <InfoTip title="Варианты" text="Если товар продаётся в нескольких размерах или видах — добавьте вариант для каждого. Если один вариант — оставьте название пустым, только цену." />
                </View>

                <View style={styles.menuCard}>
                  {productModal.variants.map((v, idx) => (
                    <View key={idx} style={[styles.productVariantRow, idx < productModal.variants.length - 1 && styles.menuRowDiv]}>
                      {productModal.variants.length > 1 && (
                        <TextInput
                          color={colors.text}
                          style={styles.productVariantName}
                          placeholder="Название (напр. Маленький)"
                          placeholderTextColor={colors.muted}
                          value={v.label}
                          onChangeText={val => setVariantField(idx, 'label', val)}
                        />
                      )}
                      <View style={styles.productVariantPriceRow}>
                        <TextInput
                          color={colors.text}
                          style={styles.productVariantPrice}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={colors.muted}
                          value={v.price}
                          onChangeText={val => setVariantField(idx, 'price', val)}
                        />
                        <Text style={styles.productVariantUnit}>₽</Text>
                        <Pressable
                          style={styles.techCardBtn}
                          onPress={() => setTechCardModal({ variantKey: variantKey(v, idx), variantLabel: v.label || productModal.product.name })}
                        >
                          <Text style={styles.techCardBtnText}>
                            🧾 {(productModal.techCards[variantKey(v, idx)] || []).length > 0
                              ? `${(productModal.techCards[variantKey(v, idx)] || []).length} ингр.`
                              : 'Техкарта'}
                          </Text>
                        </Pressable>
                        {productModal.variants.length > 1 && (
                          <Pressable onPress={() => removeVariantRow(idx)} hitSlop={10}>
                            <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  ))}
                </View>

                <Pressable style={styles.productAddVariant} onPress={addVariantRow}>
                  <Text style={styles.productAddVariantText}>+ Добавить вариант</Text>
                </Pressable>
                <Text style={styles.productHint}>💡 Несколько вариантов — например Латте S и Латте L с разными ценами</Text>

                {/* Модификаторы */}
                {modifierGroups.length > 0 && (
                  <>
                    <Text style={[styles.productFieldLabel, { marginTop: 16 }]}>Модификаторы</Text>
                    <View style={styles.menuCard}>
                      {modifierGroups.map((g, idx) => {
                        const checked = productModal.groupIds.includes(g.id);
                        return (
                          <Pressable key={g.id}
                            style={[styles.productVariantRow, idx < modifierGroups.length - 1 && styles.menuRowDiv]}
                            onPress={() => toggleGroupForProduct(g.id)}
                          >
                            <Text style={[styles.productVariantName, { flex: 1 }]}>{g.name}</Text>
                            <View style={[styles.productCheckbox, checked && styles.productCheckboxOn]}>
                              {checked && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}

                {/* Статус */}
                <View style={[styles.productVariantRow, { marginTop: 16, backgroundColor: '#0b0c0f', borderRadius: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)' }]}>
                  <Text style={{ flex: 1, fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text }}>Активен</Text>
                  <Toggle value={!!productModal.product.active} onValueChange={() => toggleProductActive()} />
                </View>

              </ScrollView>

              {/* Кнопка — фиксированный footer, всегда видна */}
              <View style={styles.prodModalFooter}>
                <Pressable
                  style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.88 }]}
                  onPress={saveProduct}
                >
                  <Text style={styles.confirmBtnText}>Сохранить</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Модалка сотрудника */}
      <Modal visible={!!empModal} transparent animationType="fade" onRequestClose={() => setEmpModal(null)}>
        <View style={styles.prodModalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setEmpModal(null)} />
          {empModal && (
            <View style={[styles.prodModalBox, { width: '44%' }]}>
              <View style={styles.prodModalHeader}>
                <Text style={styles.prodModalTitle}>{empModal.id ? 'Редактировать' : 'Новый сотрудник'}</Text>
                <Pressable onPress={() => setEmpModal(null)} hitSlop={14} style={styles.itemModalClose}>
                  <Text style={styles.itemModalCloseText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                <Text style={styles.productFieldLabel}>Имя</Text>
                <TextInput
                  color={colors.text}
                  style={styles.prodInput}
                  value={empModal.name}
                  onChangeText={v => setEmpModal(m => ({ ...m, name: v }))}
                  placeholder="Имя сотрудника"
                  placeholderTextColor={colors.muted}
                />

                <Text style={styles.productFieldLabel}>PIN-код</Text>
                <TextInput
                  color={colors.text}
                  style={[styles.prodInput, { textAlign: 'center', letterSpacing: 6, fontSize: 18 }]}
                  value={empModal.pin}
                  onChangeText={v => setEmpModal(m => ({ ...m, pin: v.replace(/\D/g,'') }))}
                  keyboardType="number-pad"
                  maxLength={6}
                  secureTextEntry
                  placeholder="• • • •"
                  placeholderTextColor={colors.muted}
                />

                <Text style={styles.productFieldLabel}>Подтвердите PIN</Text>
                <TextInput
                  color={colors.text}
                  style={[styles.prodInput, { textAlign: 'center', letterSpacing: 6, fontSize: 18 }]}
                  value={empModal.pin2}
                  onChangeText={v => setEmpModal(m => ({ ...m, pin2: v.replace(/\D/g,'') }))}
                  keyboardType="number-pad"
                  maxLength={6}
                  secureTextEntry
                  placeholder="• • • •"
                  placeholderTextColor={colors.muted}
                />

                <Text style={styles.productFieldLabel}>Роль</Text>
                <View style={styles.menuCard}>
                  {[
                    { key: 'admin',   label: roleNames.admin,   sub: 'Полный доступ к настройкам и отчётам' },
                    { key: 'barista', label: roleNames.barista, sub: 'Только касса и базовые функции' },
                  ].map((r, idx) => (
                    <Pressable
                      key={r.key}
                      style={[styles.menuRow, idx === 0 && styles.menuRowDiv]}
                      onPress={() => setEmpModal(m => ({ ...m, role: r.key }))}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.menuItemName}>{r.label}</Text>
                        <Text style={styles.menuItemSub}>{r.sub}</Text>
                      </View>
                      <View style={[styles.productCheckbox, empModal.role === r.key && styles.productCheckboxOn]}>
                        {empModal.role === r.key && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                      </View>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.productFieldLabel}>Ставка</Text>
                <View style={styles.menuCard}>
                  {[
                    { key: 'shift',       label: 'За смену',         unit: '₽/смена' },
                    { key: 'hourly',      label: 'Почасовая',        unit: '₽/час' },
                    { key: 'monthly',     label: 'Оклад',            unit: '₽/мес' },
                    { key: 'revenue_pct', label: '% от выручки',     unit: '%' },
                  ].map((s, idx) => (
                    <Pressable
                      key={s.key}
                      style={[styles.menuRow, idx < 3 && styles.menuRowDiv]}
                      onPress={() => setEmpModal(m => ({ ...m, salaryType: s.key }))}
                    >
                      <Text style={[styles.menuItemName, { flex: 1 }]}>{s.label}</Text>
                      {empModal.salaryType === s.key && (
                        <TextInput
                          color={colors.text}
                          style={[styles.prodInput, { width: 80, marginRight: 8, padding: 6, textAlign: 'right', marginBottom: 0 }]}
                          value={empModal.salaryAmount}
                          onChangeText={v => setEmpModal(m => ({ ...m, salaryAmount: v }))}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={colors.muted}
                        />
                      )}
                      <Text style={[styles.menuItemSub, { marginRight: 8 }]}>{s.unit}</Text>
                      <View style={[styles.productCheckbox, empModal.salaryType === s.key && styles.productCheckboxOn]}>
                        {empModal.salaryType === s.key && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                      </View>
                    </Pressable>
                  ))}
                </View>


                {/* Права доступа — только для сотрудника */}
                {empModal.role !== 'admin' && empModal.permissions && (
                  <>
                    {[
                      {
                        group: 'Касса',
                        items: [
                          { key: 'apply_discounts',    label: 'Применять скидки' },
                          { key: 'view_order_history', label: 'История заказов' },
                          { key: 'cancel_orders',      label: 'Отменять заказы' },
                        ],
                      },
                      {
                        group: 'Клиенты',
                        items: [
                          { key: 'view_clients',   label: 'Просматривать клиентов' },
                          { key: 'edit_clients',   label: 'Редактировать клиентов' },
                          { key: 'manage_loyalty', label: 'Управлять баллами' },
                        ],
                      },
                      {
                        group: 'Склад',
                        items: [
                          { key: 'view_stock',     label: 'Просматривать остатки' },
                          { key: 'edit_stock',     label: 'Закупки и списания' },
                          { key: 'edit_thresholds',label: 'Изменять пороги' },
                        ],
                      },
                      {
                        group: 'Меню',
                        items: [
                          { key: 'edit_cost_cards', label: 'Редактировать техкарты' },
                          { key: 'edit_products',   label: 'Редактировать товары и цены' },
                        ],
                      },
                      {
                        group: 'Финансы',
                        items: [
                          { key: 'view_reports', label: 'Видеть отчётность и P&L' },
                          { key: 'add_expenses', label: 'Добавлять расходы' },
                          { key: 'view_revenue', label: 'Видеть выручку смены' },
                        ],
                      },
                      {
                        group: 'Смена',
                        items: [
                          { key: 'open_shift',  label: 'Открывать смену' },
                          { key: 'close_shift', label: 'Закрывать смену' },
                        ],
                      },
                      {
                        group: 'Прочее',
                        items: [
                          { key: 'access_settings', label: 'Доступ к настройкам' },
                        ],
                      },
                    ].map(group => (
                      <View key={group.group} style={{ marginTop: 20 }}>
                        {/* Заголовок группы */}
                        <View style={styles.menuCatRow}>
                          <View style={styles.menuCatLine} />
                          <Text style={styles.menuCatName}>{group.group}</Text>
                          <View style={styles.menuCatLine} />
                        </View>
                        {/* Переключатели */}
                        <View style={styles.menuCard}>
                          {group.items.map((item, idx) => (
                            <Pressable
                              key={item.key}
                              style={[styles.menuRow, idx < group.items.length - 1 && styles.menuRowDiv]}
                              onPress={() => setEmpModal(m => ({
                                ...m,
                                permissions: { ...m.permissions, [item.key]: !m.permissions[item.key] }
                              }))}
                            >
                              <Text style={[styles.menuItemName, { flex: 1 }]}>{item.label}</Text>
                              <Toggle
                                value={!!empModal.permissions[item.key]}
                                onValueChange={() => setEmpModal(m => ({
                                  ...m,
                                  permissions: { ...m.permissions, [item.key]: !m.permissions[item.key] }
                                }))}
                                size="sm"
                              />
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    ))}
                  </>
                )}

                {/* Сохранить */}
                <Pressable
                  style={({ pressed }) => [styles.confirmBtn, { marginTop: 20 }, pressed && { opacity: 0.88 }]}
                  onPress={() => {
                    if (!empModal.name.trim()) return;
                    if (empModal.pin !== empModal.pin2) return;
                    if (empModal.pin.length < 4) return;
                    try {
                      if (empModal.id) {
                        updateUser(empModal.id, empModal.name, empModal.pin, empModal.role, empModal.salaryType, parseFloat(empModal.salaryAmount) || 0);
                        if (empModal.role !== 'admin') saveUserPermissions(empModal.id, empModal.permissions || DEFAULT_PERMISSIONS);
                      } else {
                        addUser(empModal.name, empModal.pin, empModal.role, empModal.salaryType, parseFloat(empModal.salaryAmount) || 0);
                        if (empModal.role !== 'admin') {
                          const newUser = getUsers().find(u => u.name === empModal.name.trim());
                          if (newUser) saveUserPermissions(newUser.id, empModal.permissions || DEFAULT_PERMISSIONS);
                        }
                      }
                      loadAll();
                      setEmpModal(null);
                    } catch (e) { console.error(e); }
                  }}
                >
                  <Text style={styles.confirmBtnText}>Сохранить</Text>
                </Pressable>

                {empModal.id && (
                  <Pressable
                    style={{ paddingVertical: 14, alignItems: 'center', marginTop: 8 }}
                    onPress={() => {
                      try { deleteUser(empModal.id); loadAll(); setEmpModal(null); } catch (e) { console.error(e); }
                    }}
                  >
                    <Text style={{ fontFamily: fonts.familySemibold, fontSize: 14, color: colors.redLight }}>Удалить сотрудника</Text>
                  </Pressable>
                )}

              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* Предпросмотр чека */}
      <Modal visible={receiptPreview} transparent animationType="fade" onRequestClose={() => setReceiptPreview(false)}>
        <View style={styles.prodModalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setReceiptPreview(false)} />
          <View style={styles.receiptBox}>
            <View style={styles.prodModalHeader}>
              <Text style={styles.prodModalTitle}>Предпросмотр чека</Text>
              <Pressable onPress={() => setReceiptPreview(false)} hitSlop={14} style={styles.itemModalClose}>
                <Text style={styles.itemModalCloseText}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <View style={styles.receiptPaper}>
                {/* Логотип / название */}
                <Text style={styles.receiptBizName}>{bizDraft?.receiptName || bizDraft?.businessName || 'Название бизнеса'}</Text>
                {bizDraft?.address ? <Text style={styles.receiptBizSub}>{bizDraft.address}</Text> : null}
                {bizDraft?.phone   ? <Text style={styles.receiptBizSub}>{bizDraft.phone}</Text>   : null}
                <View style={styles.receiptDivider} />

                {/* Дата и время */}
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptMeta}>22.07.2026  14:32</Text>
                  <Text style={styles.receiptMeta}>Смена #12</Text>
                </View>
                <View style={styles.receiptDivider} />

                {/* Позиции */}
                {[
                  { name: 'Американо', price: 100 },
                  { name: 'Латте S',   price: 90  },
                  { name: 'Круассан',  price: 120 },
                ].map((item, i) => (
                  <View key={i} style={styles.receiptRow}>
                    <Text style={styles.receiptItem}>{item.name}</Text>
                    <Text style={styles.receiptItem}>{item.price} {bizDraft?.currency || '₽'}</Text>
                  </View>
                ))}
                <View style={styles.receiptDivider} />

                {/* Итого */}
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptTotal}>ИТОГО</Text>
                  <Text style={styles.receiptTotal}>310 {bizDraft?.currency || '₽'}</Text>
                </View>
                <View style={[styles.receiptRow, { marginTop: 4 }]}>
                  <Text style={styles.receiptMeta}>Наличные</Text>
                  <Text style={styles.receiptMeta}>400 {bizDraft?.currency || '₽'}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptMeta}>Сдача</Text>
                  <Text style={styles.receiptMeta}>90 {bizDraft?.currency || '₽'}</Text>
                </View>

                {/* Подвал */}
                {(bizDraft?.receiptFooter || bizDraft?.inn) ? (
                  <>
                    <View style={styles.receiptDivider} />
                    {bizDraft?.inn         ? <Text style={styles.receiptFooter}>{bizDraft.inn}</Text>   : null}
                    {bizDraft?.receiptFooter ? <Text style={styles.receiptFooter}>{bizDraft.receiptFooter}</Text> : null}
                  </>
                ) : null}
              </View>
              <Text style={[styles.menuItemSub, { textAlign: 'center', marginTop: 12 }]}>
                Это предварительный макет. Реальный чек зависит от принтера.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Модалка техкарты — список ингредиентов варианта */}
      <Modal visible={!!techCardModal} transparent animationType="fade" onRequestClose={() => setTechCardModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setTechCardModal(null)} />
          {techCardModal && productModal && (() => {
            const vKey = techCardModal.variantKey;
            const ingredients = productModal.techCards[vKey] || [];
            return (
              <View style={[styles.modalInner, { width: '48%', maxHeight: '80%' }]}>
                {/* Заголовок */}
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>Техкарта</Text>
                    <Text style={styles.productHint}>{techCardModal.variantLabel}</Text>
                  </View>
                  <Pressable onPress={() => setTechCardModal(null)} hitSlop={14} style={styles.itemModalClose}>
                    <Text style={styles.itemModalCloseText}>✕</Text>
                  </Pressable>
                </View>

                <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {ingredients.length === 0 && (
                    <View style={styles.techCardEmpty}>
                      <Text style={styles.techCardEmptyIcon}>🧪</Text>
                      <Text style={styles.techCardEmptyText}>Ингредиенты не добавлены</Text>
                      <Text style={styles.productHint}>Добавьте ингредиенты — они будут списываться со склада при каждой продаже</Text>
                    </View>
                  )}

                  {/* Список ингредиентов */}
                  {ingredients.length > 0 && (
                    <View style={styles.menuCard}>
                      {ingredients.map((row, ri) => {
                        const availableUnits = [...new Set([row.stockUnit, ...(profile?.units || [])])].filter(Boolean);
                        const compatible = availableUnits.filter(u => u === row.stockUnit || canConvert(u, row.stockUnit));
                        const needsFactor = row.unit && row.stockUnit && row.unit !== row.stockUnit;
                        const cycleUnit = () => {
                          if (compatible.length <= 1) return;
                          const i = compatible.indexOf(row.unit);
                          setIngredientUnit(vKey, ri, compatible[(i + 1) % compatible.length]);
                        };
                        return (
                          <View key={ri} style={[styles.techIngRow, ri < ingredients.length - 1 && styles.menuRowDiv]}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.techIngName}>{row.name}</Text>
                              {needsFactor && (
                                <Text style={styles.techIngFactor}>× коэф. {row.factor || '1'} ({row.unit} → {row.stockUnit})</Text>
                              )}
                            </View>
                            <TextInput
                              color={colors.text}
                              style={styles.techIngAmount}
                              keyboardType="numeric"
                              value={row.amount}
                              onChangeText={val => setIngredientAmount(vKey, ri, val)}
                              placeholder="0"
                              placeholderTextColor={colors.muted}
                            />
                            <Pressable onPress={cycleUnit} hitSlop={8} style={styles.techIngUnitBtn}>
                              <Text style={styles.techIngUnitText}>{row.unit || row.stockUnit}</Text>
                            </Pressable>
                            <Pressable onPress={() => removeIngredientRow(vKey, ri)} hitSlop={10} style={{ paddingLeft: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Кнопка добавить */}
                  <Pressable
                    style={styles.techIngAddBtn}
                    onPress={() => { setIngredientPicker({ variantKey: vKey, search: '' }); }}
                  >
                    <Text style={styles.techIngAddText}>+ Добавить ингредиент со склада</Text>
                  </Pressable>

                  {ingredients.length === 0 && stock.length === 0 && (
                    <Text style={[styles.productHint, { marginTop: 8, textAlign: 'center' }]}>
                      Сначала добавьте позиции на склад
                    </Text>
                  )}
                </ScrollView>

                <Pressable
                  style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.88 }, { marginTop: 12 }]}
                  onPress={() => setTechCardModal(null)}
                >
                  <Text style={styles.confirmBtnText}>Сохранить</Text>
                </Pressable>
              </View>
            );
          })()}
        </View>
      </Modal>

      {/* Модалка выбора ингредиента со склада */}
      <Modal visible={!!ingredientPicker} transparent animationType="fade" onRequestClose={() => setIngredientPicker(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setIngredientPicker(null)} />
          {ingredientPicker && (
            <View style={[styles.modalInner, { maxHeight: '75%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Ингредиент со склада</Text>
                <Pressable onPress={() => setIngredientPicker(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <TextInput
                style={styles.input}
                placeholder="Поиск..."
                placeholderTextColor={colors.muted}
                value={ingredientPicker.search}
                onChangeText={(v) => setIngredientPicker(p => ({ ...p, search: v }))}
              />
              <ScrollView style={{ marginTop: 8 }} showsVerticalScrollIndicator={false}>
                {stock.length === 0 && <Text style={styles.hintText}>На складе пока нет позиций.</Text>}
                {stock
                  .filter(s => s.name.toLowerCase().includes(ingredientPicker.search.trim().toLowerCase()))
                  .map(s => (
                    <Pressable
                      key={s.id}
                      style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8 }]}
                      onPress={() => { addIngredientRow(ingredientPicker.variantKey, s); setIngredientPicker(null); }}
                    >
                      <Text style={styles.rowName}>{s.name}</Text>
                      <Text style={styles.rowPrice}>{s.unit}</Text>
                    </Pressable>
                  ))}
              </ScrollView>
              <Pressable
                style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.88 }, { marginTop: 10 }]}
                onPress={() => setIngredientPicker(null)}
              >
                <Text style={styles.confirmBtnText}>Готово</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>

      {/* Модалка нового товара */}
      <Modal visible={!!newProductModal} transparent animationType="fade" onRequestClose={() => setNewProductModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setNewProductModal(null)} />
          {newProductModal && (
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Новый {terms.item.toLowerCase()}</Text>
                <Pressable onPress={() => setNewProductModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <Text style={styles.fieldLabel}>Название</Text>
              <TextInput style={[styles.input, {color: colors.text}]} value={newProductModal.name} onChangeText={(v) => setNewProductModal(m => ({ ...m, name: v }))} placeholderTextColor={colors.muted} />
              <Text style={styles.fieldLabel}>{terms.category}</Text>
              <TextInput style={[styles.input, {color: colors.text}]} value={newProductModal.category} onChangeText={(v) => setNewProductModal(m => ({ ...m, category: v }))} placeholder={`Название ${terms.category.toLowerCase()}и`} placeholderTextColor={colors.muted} />
              {categories.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {categories.map(c => (
                    <Pressable key={c} style={styles.catChip} onPress={() => setNewProductModal(m => ({ ...m, category: c }))}>
                      <Text style={styles.catChipLabel}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <Text style={styles.hintText}>Цену и варианты настроишь сразу после создания — тапни на новый {terms.item.toLowerCase()} в списке.</Text>
              <MetalButton title="Добавить" variant="success" onPress={saveNewProduct} style={{ marginTop: 10 }} />
            </View>
          )}
        </View>
      </Modal>

      {/* Модалка порога склада */}
      <Modal visible={!!stockModal} transparent animationType="fade" onRequestClose={() => setStockModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setStockModal(null)} />
          {stockModal && (
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{stockModal.name}</Text>
                <Pressable onPress={() => setStockModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <Text style={styles.fieldLabel}>Порог нехватки ({stockModal.unit})</Text>
              <TextInput style={[styles.input, {color: colors.text}]} keyboardType="numeric" value={stockModal['порог']} onChangeText={(v) => setStockModal(m => ({ ...m, порог: v }))} placeholderTextColor={colors.muted} />
              <MetalButton title="Сохранить" variant="success" onPress={saveStockModal} style={{ marginTop: 10 }} />
            </View>
          )}
        </View>
      </Modal>

      {/* Модалка зоны */}
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
                          <Text style={{ fontSize: 13, color: colors.redLight, marginLeft: 4 }}>✕</Text>
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
                <MetalButton title="Сохранить" variant="success" onPress={saveDiscountModal} style={{ flex: 1 }} />
                {discountModal.index !== -1 && (
                  <MetalButton title="Удалить" variant="danger" onPress={deleteDiscountModal} style={{ flex: 1 }} />
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
                    <Text style={[styles.catChipLabel, payMethodModal.type === t.key && { color: colors.greenLight }]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.hintText}>Тип определяет учёт в отчётах. «Смешанная» показывает UI разделения суммы на нал и безнал.</Text>

              <Pressable style={[styles.row, { marginTop: 8 }]} onPress={() => setPayMethodModal(m => ({ ...m, active: !m.active }))}>
                <Text style={styles.rowName}>Включён в кассе</Text>
                <Text style={styles.rowPrice}>{payMethodModal.active !== false ? '☑' : '☐'}</Text>
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

      {/* Модалка группы модификаторов */}
      <Modal visible={!!groupModal} transparent animationType="fade" onRequestClose={() => setGroupModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setGroupModal(null)} />
          {groupModal && (
            <View style={[styles.modalInner, { maxHeight: '80%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{groupModal.id ? 'Группа модификаторов' : 'Новая группа'}</Text>
                <Pressable onPress={() => setGroupModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <Text style={styles.fieldLabel}>Название группы</Text>
              <TextInput style={styles.input} value={groupModal.name} onChangeText={(v) => setGroupModal(m => ({ ...m, name: v }))} placeholder="напр. Молоко" placeholderTextColor={colors.muted} />
              <View style={styles.chipsRowSmall}>
                <Pressable style={[styles.chipSmall, groupModal.selectionType === 'single' && styles.chipSmallActive]} onPress={() => setGroupModal(m => ({ ...m, selectionType: 'single' }))}>
                  <Text style={[styles.chipSmallLabel, groupModal.selectionType === 'single' && styles.chipSmallLabelActive]}>Один вариант</Text>
                </Pressable>
                <Pressable style={[styles.chipSmall, groupModal.selectionType === 'multiple' && styles.chipSmallActive]} onPress={() => setGroupModal(m => ({ ...m, selectionType: 'multiple' }))}>
                  <Text style={[styles.chipSmallLabel, groupModal.selectionType === 'multiple' && styles.chipSmallLabelActive]}>Несколько</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <MetalButton title="Сохранить" variant="success" onPress={saveGroupModal} style={{ flex: 1 }} />
                {groupModal.id && <MetalButton title="Удалить группу" variant="danger" onPress={deleteGroupModal} style={{ flex: 1 }} />}
              </View>

              {groupModal.id && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Опции</Text>
                  {(modifierGroups.find(g => g.id === groupModal.id)?.options || []).map(opt => (
                    <Pressable key={opt.id} style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8 }]} onPress={() => openEditOption(groupModal.id, opt)}>
                      <Text style={styles.rowName}>{opt.name}</Text>
                      <Text style={styles.rowPrice}>{opt.price_delta > 0 ? `+${opt.price_delta}₽ ` : ''}›</Text>
                    </Pressable>
                  ))}
                  <MetalButton title="+ Добавить опцию" variant="default" onPress={() => openNewOption(groupModal.id)} style={{ marginTop: 8 }} />
                </>
              )}
            </View>
          )}
        </View>
      </Modal>

      {/* Модалка опции модификатора */}
      <Modal visible={!!optionModal} transparent animationType="fade" onRequestClose={() => setOptionModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setOptionModal(null)} />
          {optionModal && (
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{optionModal.id ? 'Изменить опцию' : 'Новая опция'}</Text>
                <Pressable onPress={() => setOptionModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <Text style={styles.fieldLabel}>Название</Text>
              <TextInput style={styles.input} value={optionModal.name} onChangeText={(v) => setOptionModal(m => ({ ...m, name: v }))} placeholderTextColor={colors.muted} />
              <Text style={styles.fieldLabel}>Доплата, ₽</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={optionModal.priceDelta} onChangeText={(v) => setOptionModal(m => ({ ...m, priceDelta: v }))} placeholderTextColor={colors.muted} />

              <Text style={styles.fieldLabel}>Заменяет ингредиент склада на (если это замена)</Text>
              <TextInput style={styles.input} value={optionModal.ingrToReplace} onChangeText={(v) => setOptionModal(m => ({ ...m, ingrToReplace: v }))} placeholder="напр. Овсяное молоко" placeholderTextColor={colors.muted} />
              <Text style={styles.hintText}>Сработает, если в техкарте {genitiveSingularRu(terms.item).toLowerCase()} есть ингредиент с названием как у группы модификатора (напр. группа «Молоко» → ингредиент «Молоко»).</Text>

              <Text style={styles.fieldLabel}>Или списывает дополнительно (если это добавка)</Text>
              <TextInput style={styles.input} value={optionModal.ingrToDeduct} onChangeText={(v) => setOptionModal(m => ({ ...m, ingrToDeduct: v }))} placeholder="напр. Сироп ваниль" placeholderTextColor={colors.muted} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.fieldLabel}>Расход</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={optionModal.deductAmount} onChangeText={(v) => setOptionModal(m => ({ ...m, deductAmount: v }))} placeholderTextColor={colors.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Ед.</Text>
                  <TextInput style={styles.input} value={optionModal.deductUnit} onChangeText={(v) => setOptionModal(m => ({ ...m, deductUnit: v }))} placeholderTextColor={colors.muted} />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <MetalButton title="Сохранить" variant="success" onPress={saveOptionModal} style={{ flex: 1 }} />
                {optionModal.id && <MetalButton title="Удалить" variant="danger" onPress={deleteOptionModal} style={{ flex: 1 }} />}
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Модалка ввода ключа доступа к профилю бизнеса */}
      <Modal visible={keyPromptOpen} transparent animationType="fade" onRequestClose={() => setKeyPromptOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setKeyPromptOpen(false)} />
          <View style={styles.modalInner}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ключ доступа</Text>
              <Pressable onPress={() => setKeyPromptOpen(false)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
            </View>
            <TextInput style={styles.input} secureTextEntry value={keyInput} onChangeText={setKeyInput} placeholderTextColor={colors.muted} />
            <MetalButton title="Войти" variant="success" onPress={checkKey} style={{ marginTop: 10 }} />
          </View>
        </View>
      </Modal>

      {/* Модалка переименования категории склада */}
      <Modal visible={!!stockCatModal} transparent animationType="fade" onRequestClose={() => setStockCatModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setStockCatModal(null)} />
          {stockCatModal && (
            <View style={[styles.modalInner, { maxWidth: 380 }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Переименовать категорию</Text>
                <Pressable onPress={() => setStockCatModal(null)} hitSlop={14}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <Text style={styles.fieldLabel}>Новое название</Text>
              <TextInput
                style={styles.input}
                value={stockCatModal.newName}
                onChangeText={v => setStockCatModal(m => ({ ...m, newName: v }))}
                placeholder={stockCatModal.oldName}
                placeholderTextColor={colors.muted}
                autoFocus
              />
              <Text style={styles.hintText}>Будет применено ко всем позициям категории «{stockCatModal.oldName}»</Text>
              <MetalButton
                title="Переименовать"
                variant="success"
                onPress={() => renameStockCategory(stockCatModal.oldName, stockCatModal.newName)}
                style={{ marginTop: 12 }}
              />
            </View>
          )}
        </View>
      </Modal>

      {/* Модалка профиля бизнеса */}
      <Modal visible={profileUnlocked} transparent animationType="fade" onRequestClose={() => setProfileUnlocked(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setProfileUnlocked(false)} />
          {profileDraft && (
            <View style={[styles.modalInner, { maxHeight: '88%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Профиль бизнеса</Text>
                <Pressable onPress={() => setProfileUnlocked(false)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>Название бизнеса</Text>
                <TextInput style={styles.input} value={profileDraft.businessName} onChangeText={(v) => setProfileDraft(d => ({ ...d, businessName: v }))} placeholderTextColor={colors.muted} />

                <Text style={styles.sectionTitle}>Быстрый старт (пресет)</Text>
                <View style={styles.chipsRowSmall}>
                  {Object.keys(BUSINESS_PRESETS).map(key => (
                    <Pressable key={key} style={styles.chipSmall} onPress={() => applyPresetDraft(key)}>
                      <Text style={styles.chipSmallLabel}>{BUSINESS_PRESETS[key].label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.hintText}>Применяет стартовый набор модулей/терминов/единиц — дальше можно поменять вручную.</Text>

                <Text style={styles.sectionTitle}>Модули</Text>
                {[
                  ['stock',      'Склад'],
                  ['shifts',     'Смены'],
                  ['clients',    'Клиенты'],
                  ['loyalty',    'Лояльность'],
                  ['modifiers',  'Модификаторы'],
                  ['inventory',  'Инвентаризация'],
                  ['locations',  'Локации (несколько точек хранения)'],
                  ['zones',      'Зоны / Столы (нумерация мест)'],
                  ['templates',  'Шаблоны заказов'],
                ].map(([key, label]) => (
                  <Pressable key={key} style={styles.checkRow} onPress={() => toggleModuleDraft(key)}>
                    <Text style={styles.rowName}>{label}</Text>
                    <Toggle value={!!profileDraft.modules[key]} onValueChange={() => toggleModuleDraft(key)} />
                  </Pressable>
                ))}

                <Text style={styles.sectionTitle}>Терминология</Text>
                {[
                  ['item', 'Товар/услуга'], ['client', 'Клиент'], ['order', 'Заказ'], ['category', 'Категория'],
                ].map(([key, label]) => (
                  <View key={key}>
                    <Text style={styles.fieldLabel}>{label}</Text>
                    <TextInput style={styles.input} value={profileDraft.terms[key] || ''} onChangeText={(v) => setTermDraft(key, v)} placeholderTextColor={colors.muted} />
                  </View>
                ))}

                <Text style={styles.sectionTitle}>Названия должностей</Text>
                <Text style={styles.hintText}>Как называются роли в вашем бизнесе. Права доступа не меняются — только отображение.</Text>
                {[
                  ['barista', 'Рядовой сотрудник (бариста / кассир / мастер...)'],
                  ['admin',   'Администратор / управляющий / владелец...'],
                ].map(([key, label]) => (
                  <View key={key}>
                    <Text style={styles.fieldLabel}>{label}</Text>
                    <TextInput
                      style={styles.input}
                      value={profileDraft.roles?.[key] || ''}
                      onChangeText={(v) => setProfileDraft(d => ({ ...d, roles: { ...(d.roles || {}), [key]: v } }))}
                      placeholder={key === 'barista' ? 'напр. Кассир, Мастер, Продавец' : 'напр. Управляющий, Директор'}
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                ))}

                <Text style={styles.sectionTitle}>Единицы измерения</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {profileDraft.units.map(u => (
                    <Pressable key={u} style={styles.unitChip} onPress={() => removeUnitDraft(u)}>
                      <Text style={styles.catChipLabel}>{u} ✕</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[styles.input, { flex: 1 }]} value={profileDraft.unitInput} onChangeText={(v) => setProfileDraft(d => ({ ...d, unitInput: v }))} placeholder="напр. шт" placeholderTextColor={colors.muted} />
                  <MetalButton title="+" variant="default" onPress={addUnitDraft} style={{ width: 50 }} />
                </View>

                <Text style={styles.sectionTitle}>Ключ доступа к этому разделу</Text>
                <TextInput style={styles.input} value={profileDraft.accessKey} onChangeText={(v) => setProfileDraft(d => ({ ...d, accessKey: v }))} placeholder="оставь пустым — раздел без пароля" placeholderTextColor={colors.muted} />
              </ScrollView>
              <MetalButton title="Сохранить профиль" variant="success" onPress={saveProfileDraft} style={{ marginTop: 10 }} />
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Двухколоночный layout
  twoCol: { flex: 1, flexDirection: 'row' },

  // Левая панель навигации
  leftPanel: {
    width: 220,
    backgroundColor: '#07080a',
    borderRightWidth: 1,
    borderRightColor: 'rgba(74,77,84,0.3)',
    paddingVertical: 12,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 18,
    position: 'relative',
  },
  navItemActive: {
    backgroundColor: 'rgba(61,158,146,0.08)',
  },
  navIcon:  { fontSize: 17, width: 24, textAlign: 'center' },
  navLabel: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, flex: 1 },
  navLabelActive: { color: colors.greenLight },
  navActiveBar: {
    position: 'absolute',
    left: 0, top: '15%', bottom: '15%',
    width: 3, borderRadius: 2,
    backgroundColor: colors.greenLight,
  },
  navArrow: { fontSize: 16, color: colors.muted },

  // Правая панель
  rightPanel: { flex: 1 },
  rightInner: { padding: 20, paddingBottom: 40 },
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
  phoneBackText: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.greenLight },

  // Двухколоночный layout
  twoCol: { flex: 1, flexDirection: 'row' },
  leftPanel: { width: 220, backgroundColor: '#07080a', borderRightWidth: 1, borderRightColor: 'rgba(74,77,84,0.3)', paddingVertical: 12 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 18, position: 'relative' },
  navItemActive: { backgroundColor: 'rgba(61,158,146,0.08)' },
  navIcon: { fontSize: 17, width: 24, textAlign: 'center' },
  navLabel: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, flex: 1 },
  navLabelActive: { color: colors.greenLight },
  navActiveBar: { position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 3, borderRadius: 2, backgroundColor: colors.greenLight },
  navArrow: { fontSize: 16, color: colors.muted },
  rightPanel: { flex: 1 },
  rightInner: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontFamily: fonts.family, fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 18, letterSpacing: -0.3 },
  phoneback: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  phoneBackText: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.greenLight },
  // Модалка товара — position:absolute для надёжного scroll
  prodModalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  prodModalBox: {
    width: '50%',
    maxHeight: '85%',
    backgroundColor: '#0e0f11',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(74,77,84,0.5)',
    overflow: 'hidden',
  },
  prodModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.3)',
  },
  prodModalTitle: { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text },
  receiptBox: { width: 320, maxHeight: '88%', backgroundColor: '#0e0f11', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(74,77,84,0.5)', overflow: 'hidden' },
  receiptPaper: { backgroundColor: '#ffffff', borderRadius: 12, padding: 20 },
  receiptBizName: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: '#111', textAlign: 'center', marginBottom: 4 },
  receiptBizSub:  { fontFamily: fonts.familyRegular, fontSize: 12, color: '#555', textAlign: 'center', lineHeight: 18 },
  receiptDivider: { height: 1, backgroundColor: '#ddd', marginVertical: 12, borderStyle: 'dashed' },
  receiptRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  receiptMeta:    { fontFamily: fonts.familyRegular, fontSize: 11, color: '#888' },
  receiptItem:    { fontFamily: fonts.familyRegular, fontSize: 13, color: '#222' },
  receiptTotal:   { fontFamily: fonts.family, fontSize: 14, fontWeight: '800', color: '#111' },
  receiptFooter:  { fontFamily: fonts.familyRegular, fontSize: 11, color: '#888', textAlign: 'center', marginTop: 4 },
  bizGroupLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 20, marginBottom: 8, marginLeft: 2 },
  bizFieldRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 12 },
  bizFieldLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, width: 140 },
  bizInput: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 13, color: colors.text, textAlign: 'right', padding: 0 },
  bizPreviewBtn: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(61,158,146,0.4)', alignItems: 'center', backgroundColor: 'rgba(61,158,146,0.06)' },
  bizPreviewBtnText: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.greenLight },
  bizCurrencyChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', backgroundColor: '#07080a' },
  bizCurrencyChipActive: { borderColor: 'rgba(61,158,146,0.5)', backgroundColor: 'rgba(61,158,146,0.08)' },
  bizCurrencyText: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  stockCatGroup: { marginBottom: 4 },
  stockAccHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#0e0f11', borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', marginBottom: 6 },
  stockAccTitle: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, flex: 1 },
  stockAccArrow: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  loyaltyInput: { width: 60, padding: 8, backgroundColor: '#07080a', borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', borderRadius: 10, color: colors.text, fontFamily: fonts.family, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  loyaltyUnit: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, width: 36 },
  loyaltyExample: { marginTop: 10, padding: 14, backgroundColor: 'rgba(61,95,168,0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(61,95,168,0.2)', gap: 4 },
  loyaltyExampleTitle: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  loyaltyExampleLine: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.text, lineHeight: 20 },
  loyaltyExampleAccent: { fontFamily: fonts.familySemibold, color: colors.greenLight },
  prodModalFooter: { padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(74,77,84,0.3)', backgroundColor: '#0e0f11' },
  confirmBtn: { paddingVertical: 15, borderRadius: 14, backgroundColor: 'rgba(61,158,146,0.85)', alignItems: 'center' },
  confirmBtnText: { fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: '#fff' },
  prodInput: {
    padding: 13, backgroundColor: '#07080a', borderWidth: 1,
    borderColor: 'rgba(74,77,84,0.5)', borderRadius: 12,
    fontSize: 15, fontFamily: fonts.familySemibold, color: colors.text, marginBottom: 4,
  },

  // Модалка товара
  productNameInput: { fontSize: 16, fontFamily: fonts.familySemibold, color: colors.text },
  productFieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  productSectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 8 },
  productCatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  productCatChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', backgroundColor: '#07080a' },
  productCatChipActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.1)' },
  productCatChipText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  productCatChipTextActive: { color: colors.greenLight },
  productVariantRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  productVariantName: { flex: 1, fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, padding: 10, backgroundColor: '#07080a', borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', borderRadius: 10, marginRight: 8 },
  productVariantPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  productVariantPrice: { fontFamily: fonts.family, fontSize: 16, fontWeight: '700', color: colors.text, width: 72, textAlign: 'right', padding: 8, backgroundColor: '#07080a', borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', borderRadius: 10 },
  productVariantUnit: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted },
  techCardBtn: { flex: 1, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(74,77,84,0.35)', backgroundColor: '#07080a', alignItems: 'center' },
  techCardBtnText: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted },
  productAddVariant: { paddingVertical: 12, alignItems: 'center' },
  productAddVariantText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.greenLight },
  productHint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, lineHeight: 18, marginBottom: 4 },
  productCheckbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(74,77,84,0.5)', alignItems: 'center', justifyContent: 'center' },
  productCheckboxOn: { backgroundColor: colors.greenLight, borderColor: colors.greenLight },

  // Техкарта модалка
  techCardEmpty: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  techCardEmptyIcon: { fontSize: 32 },
  techCardEmptyText: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  techIngRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  techIngName: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginBottom: 2 },
  techIngFactor: { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted },
  techIngAmount: { width: 64, padding: 8, backgroundColor: '#07080a', borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', borderRadius: 10, color: colors.text, fontFamily: fonts.family, fontSize: 16, textAlign: 'right' },
  techIngUnitBtn: { paddingVertical: 7, paddingHorizontal: 10, backgroundColor: '#07080a', borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', borderRadius: 10 },
  techIngUnitText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  techIngAddBtn: { paddingVertical: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(74,77,84,0.2)', marginTop: 8 },
  techIngAddText: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.greenLight },

  // Меню и цены — шапка
  menuTopBar: { marginBottom: 12 },
  menuTopBarSticky: {
    backgroundColor: '#060608',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(74,77,84,0.2)',
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
  menuSearchInput: { flex: 1, padding: 9, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 14, fontFamily: fonts.family },
  menuBadge: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#0e0f11', borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', alignItems: 'center', justifyContent: 'center' },
  menuBadgeAdd: { borderColor: 'rgba(61,158,146,0.4)', backgroundColor: 'rgba(61,158,146,0.06)' },
  menuBadgeText: { fontSize: 16, color: colors.muted },
  // Категории меню
  menuCatGroup: { marginBottom: 16 },
  menuCatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  menuCatLine: { flex: 1, height: 1, backgroundColor: 'rgba(74,77,84,0.25)' },
  menuCatName: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5 },
  // Карточка товаров
  menuCard: { backgroundColor: '#0b0c0f', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
  menuRowDiv: { borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.2)' },
  menuItemName: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, flex: 1, marginRight: 8 },
  menuItemSub: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  menuItemPrice: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginRight: 8 },
  menuItemPriceNone: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, fontStyle: 'italic' },
  menuItemArrow: { fontSize: 18, color: 'rgba(74,77,84,0.5)', fontFamily: fonts.family },

  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  hiddenHint: { textAlign: 'center', fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginBottom: 10 },
  blockTitle: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12, textAlign: 'center' },
  catHeader: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowName: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.text, flex: 1 },
  rowSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  tableChipEdit: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(61,95,168,0.4)', backgroundColor: 'rgba(61,95,168,0.1)' },
  tableChipEditText: { fontFamily: fonts.familySemibold, fontSize: 12, color: '#7a9be8' },
  rowNameInactive: { color: colors.muted },
  rowPrice: { fontFamily: fonts.family, fontSize: 13, fontWeight: '700', color: colors.greenLight },
  empty: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', paddingVertical: 12 },
  hintText: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginBottom: 10, lineHeight: 17 },
  catChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e' },
  catChipActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.12)' },
  catChipLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted },
  unitChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e' },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 10 },
  sectionTitle: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text, textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  input: { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 14, fontFamily: fonts.familyRegular },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalInner: { width: '55%', maxWidth: 540, backgroundColor: '#0e0f11', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.borderHi },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, flex: 1 },
  modalClose: { fontSize: 18, color: colors.muted, padding: 4 },
  itemModalClose: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(74,77,84,0.25)', alignItems: 'center', justifyContent: 'center' },
  itemModalCloseText: { fontSize: 13, color: colors.text, fontFamily: fonts.familySemibold },
  variantBlock: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  variantHeaderRow: { flexDirection: 'row', alignItems: 'center' },

  // Оси вариативности
  axisBlock: { marginTop: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(61,95,168,0.35)', borderRadius: 12, backgroundColor: 'rgba(61,95,168,0.06)' },
  axisHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  axisValuesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  axisValueChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(61,158,146,0.45)', borderRadius: 10, backgroundColor: 'rgba(61,158,146,0.08)', paddingHorizontal: 8, paddingVertical: 4 },
  axisValueInput: { fontFamily: fonts.family, fontSize: 13, color: colors.text, minWidth: 40, maxWidth: 90, padding: 0 },
  axisValueRemove: { fontSize: 14, color: colors.redLight },
  addValueBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  addValueBtnText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.greenLight },
  techCardTitle: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text, marginTop: 10, marginBottom: 6 },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  ingredientName: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 13, color: colors.text },
  ingredientAmount: { width: 64, padding: 8, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.text, fontSize: 13, fontFamily: fonts.family, textAlign: 'center' },
  ingredientUnit: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, width: 30 },
  ingredientUnitBtn: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(61,95,168,0.5)', backgroundColor: 'rgba(61,95,168,0.1)', minWidth: 36, alignItems: 'center' },
  ingredientUnitBtnText: { fontFamily: fonts.familySemibold, fontSize: 12, color: '#7a9be8' },
  factorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, paddingLeft: 8 },
  factorLabel: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
  factorInput: { width: 72, padding: 6, backgroundColor: '#07080a', borderWidth: 1, borderColor: 'rgba(122,158,82,0.4)', borderRadius: 8, color: colors.text, fontSize: 12, fontFamily: fonts.family, textAlign: 'center' },
  factorInputAuto: { borderColor: 'rgba(61,158,146,0.4)', color: colors.greenLight },
  factorAutoLabel: { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.greenLight, textTransform: 'uppercase', letterSpacing: 1 },
  ingredientRemove: { fontSize: 15, color: colors.redLight, paddingHorizontal: 4 },
  addIngredientBtn: { paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, borderStyle: 'dashed', marginTop: 2 },
  addIngredientBtnLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.greenLight },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  checkBox: { fontSize: 18, color: colors.greenLight, width: 22 },
  chipsRowSmall: { flexDirection: 'row', gap: 8, marginTop: 8 },
  chipSmall: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e' },
  chipSmallActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.18)' },
  chipSmallLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  chipSmallLabelActive: { color: colors.greenLight },
});
