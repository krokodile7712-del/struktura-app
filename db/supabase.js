import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nwmczqsugimvrwlimxtj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_O4Qchdzcl0hId_2EC3z3Ug_wSopGD1O';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Синхронизирует товары/услуги из SQLite в Supabase для веб-формы
export async function syncServicesToSupabase(businessId, products) {
  try {
    // Удаляем старые
    await supabase.from('services').delete().eq('business_id', businessId);
    // Вставляем актуальные
    const rows = products.map(p => ({
      business_id:  businessId,
      name:         p.name,
      price:        p.price || 0,
      category:     p.category || '',
      duration_min: p.duration_min || 60,
      active:       p.active !== 0,
    }));
    if (rows.length > 0) {
      await supabase.from('services').insert(rows);
    }
    return true;
  } catch (e) {
    console.error('[Supabase] syncServices error:', e);
    return false;
  }
}

// Получает записи для этого бизнеса
export async function getBookings(businessId, date, slug, dateRange) {
  try {
    // Если передан slug — сначала получаем businessId
    let bizId = businessId;
    if (!bizId && slug) {
      const { data: biz } = await supabase.from('businesses').select('id').eq('slug', slug).single();
      bizId = biz?.id;
    }
    if (!bizId) return [];
    let query = supabase
      .from('bookings')
      .select('*, services(name, price, duration_min)')
      .eq('business_id', bizId)
      .order('date', { ascending: true })
      .order('time_start', { ascending: true });
    if (date) query = query.eq('date', date);
    // dateRange: { from, to } — для календаря, чтобы не грузить всю историю
    // бизнеса разом, только видимый месяц
    if (dateRange?.from) query = query.gte('date', dateRange.from);
    if (dateRange?.to) query = query.lte('date', dateRange.to);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('[Supabase] getBookings error:', e);
    return [];
  }
}

// Обновляет статус записи
export async function updateBookingStatus(bookingId, status) {
  try {
    const { error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', bookingId);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('[Supabase] updateBookingStatus error:', e);
    return false;
  }
}

// Регистрирует или обновляет бизнес в Supabase
export async function upsertBusiness(slug, name, type, settings) {
  try {
    // Проверяем существует ли slug
    const { data: existing } = await supabase
      .from('businesses')
      .select('*')
      .eq('slug', slug)
      .single();

    if (existing) {
      // Обновляем настройки существующего
      const { data, error } = await supabase
        .from('businesses')
        .update({ name, type, settings })
        .eq('slug', slug)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    // Создаём новый
    const { data, error } = await supabase
      .from('businesses')
      .insert({ slug, name, type, settings })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('[Supabase] upsertBusiness error:', e);
    return null;
  }
}
