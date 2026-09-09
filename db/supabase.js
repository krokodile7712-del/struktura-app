import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nwmczqsugimvrwlimxtj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_O4Qchdzcl0hId_2EC3z3Ug_wSopGD1O';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Публичное — можно без секрета (то, что и должно быть открыто) ──

// id бизнеса в Supabase по slug — просто чтение, не требует секрета
export async function getBusinessIdBySlug(slug) {
  try {
    const { data, error } = await supabase.from('businesses').select('id').eq('slug', slug).single();
    if (error) throw error;
    return data?.id || null;
  } catch (e) {
    console.error('[Supabase] getBusinessIdBySlug error:', e);
    return null;
  }
}

// Свои позиции для записи — это те же данные, что и так видны на публичной
// странице (source='custom' услуги всегда active=true), секрет не нужен
export async function getCustomServices(businessId) {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('business_id', businessId)
      .eq('source', 'custom')
      .order('id', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('[Supabase] getCustomServices error:', e);
    return [];
  }
}

// ── Защищённое — требует секрет бизнеса (db/queries.js: getOrCreateBookingSecret) ──

// Регистрирует новый бизнес или обновляет существующий (по секрету).
// Возвращает { id } либо null при ошибке/неверном секрете.
export async function claimBusiness(slug, name, type, settings, secret) {
  try {
    const { data, error } = await supabase.rpc('claim_business', {
      p_slug: slug, p_name: name, p_type: type, p_settings: settings, p_secret: secret,
    });
    if (error) throw error;
    return data ? { id: data } : null;
  } catch (e) {
    console.error('[Supabase] claimBusiness error:', e);
    return null;
  }
}

// Синхронизирует товары/услуги из SQLite в Supabase для веб-формы.
// Затрагивает только строки с source='menu' — ручные позиции (source='custom')
// не трогает, чтобы не стереть их при повторной синхронизации.
export async function syncServicesToSupabase(businessId, secret, products) {
  try {
    const rows = products.map(p => ({
      name:         p.name,
      price:        p.price || 0,
      category:     p.category || '',
      duration_min: p.duration_min || 60,
      description:  p.booking_description || null,
      active:       p.active !== 0 && p.booking_visible !== 0,
    }));
    const { error } = await supabase.rpc('sync_menu_services_secure', {
      p_business_id: businessId, p_secret: secret, p_rows: rows,
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('[Supabase] syncServices error:', e);
    return false;
  }
}

export async function addCustomService(businessId, secret, { name, description, price }) {
  try {
    const { data, error } = await supabase.rpc('add_custom_service_secure', {
      p_business_id: businessId, p_secret: secret,
      p_name: name, p_description: description || null, p_price: price || 0,
    });
    if (error) throw error;
    return data ? { id: data } : null;
  } catch (e) {
    console.error('[Supabase] addCustomService error:', e);
    return null;
  }
}

export async function updateCustomService(id, secret, { name, description, price }) {
  try {
    const { error } = await supabase.rpc('update_custom_service_secure', {
      p_service_id: id, p_secret: secret,
      p_name: name, p_description: description || null, p_price: price || 0,
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('[Supabase] updateCustomService error:', e);
    return false;
  }
}

export async function deleteCustomService(id, secret) {
  try {
    const { error } = await supabase.rpc('delete_custom_service_secure', {
      p_service_id: id, p_secret: secret,
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('[Supabase] deleteCustomService error:', e);
    return false;
  }
}

// Получает записи для этого бизнеса (secret обязателен — здесь телефоны
// и имена клиентов, это уже не публичные данные)
export async function getBookings(secret, date, slug, dateRange) {
  try {
    const businessId = await getBusinessIdBySlug(slug);
    if (!businessId) return [];
    const { data, error } = await supabase.rpc('get_bookings_secure', {
      p_business_id: businessId,
      p_secret: secret,
      p_date: date || null,
      p_from: dateRange?.from || null,
      p_to: dateRange?.to || null,
    });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('[Supabase] getBookings error:', e);
    return [];
  }
}

// Обновляет статус записи
export async function updateBookingStatus(bookingId, secret, status) {
  try {
    const { error } = await supabase.rpc('update_booking_status_secure', {
      p_booking_id: bookingId, p_secret: secret, p_status: status,
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('[Supabase] updateBookingStatus error:', e);
    return false;
  }
}
