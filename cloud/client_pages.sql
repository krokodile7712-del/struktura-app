-- ════════════════════════════════════════════════════════════════════════
-- СТРУКТУРА — страницы для клиентов (регистрация по QR и онлайн-запись), облако Supabase
-- Как выполнить: панель Supabase → SQL Editor → вставить ВЕСЬ файл → Run.
-- Выполнять ПОСЛЕ loyalty_signups.sql. Файл безопасно запускать повторно (ничего не стирает).
--
-- Что делает:
--   1) client_pages — оформление и содержимое страниц (публикуется из приложения: меню, тексты, цвет, схема проезда);
--   2) busy_slots — занятое время записей по телефону (приложение присылает начало и конец, без имён и телефонов);
--   3) защита от записи на занятое время: триггер на bookings учитывает длительность услуги, записи по телефону
--      и число мастеров (одновременных записей). Работает и при прямой вставке со старой страницы;
--   4) публичные функции для страниц: get_client_page, get_booking_page, get_busy, create_booking_public.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.businesses') is null or to_regclass('public.bookings') is null or to_regclass('public.services') is null then
    raise exception 'Нет таблиц businesses / bookings / services — пришлите результат диагностики из loyalty_signups.sql';
  end if;
  if to_regprocedure('public.loyalty_secret_ok(' || (select format_type(a.atttypid, null) from pg_attribute a where a.attrelid = 'public.businesses'::regclass and a.attname = 'id') || ', text)') is null then
    raise exception 'Сначала выполните loyalty_signups.sql (нет функции loyalty_secret_ok)';
  end if;
end $$;

-- ── 1. Таблицы ─────────────────────────────────────────────────────────
do $$
declare t text;
begin
  select format_type(a.atttypid, a.atttypmod) into t
  from pg_attribute a where a.attrelid = 'public.businesses'::regclass and a.attname = 'id' and not a.attisdropped;

  execute format($f$
    create table if not exists public.client_pages (
      business_id %s primary key references public.businesses(id) on delete cascade,
      config      jsonb       not null default '{}'::jsonb,
      updated_at  timestamptz not null default now()
    )$f$, t);

  execute format($f$
    create table if not exists public.busy_slots (
      id          bigint generated always as identity primary key,
      business_id %s not null references public.businesses(id) on delete cascade,
      day         date not null,
      start_min   int  not null check (start_min between 0 and 1439),
      end_min     int  not null check (end_min between 1 and 1440),
      created_at  timestamptz not null default now(),
      check (end_min > start_min)
    )$f$, t);
end $$;
create index if not exists busy_slots_day_idx on public.busy_slots (business_id, day);

-- Колонки, нужные для защиты и согласия (если их ещё нет)
alter table public.bookings add column if not exists created_at      timestamptz not null default now();
alter table public.bookings add column if not exists consent_at      timestamptz;
alter table public.bookings add column if not exists consent_version text;

alter table public.client_pages enable row level security;
alter table public.busy_slots   enable row level security;
revoke all on public.client_pages, public.busy_slots from anon, authenticated;

-- ── 2. Внутренние помощники ────────────────────────────────────────────
-- Число одновременных записей = число мастеров, принимающих записи (минимум 1) — приложение кладёт его в настройки страницы
create or replace function public.page_capacity(p_business_id public.businesses.id%type)
returns int language sql stable security definer set search_path = public as $$
  select greatest(1, coalesce((select (c.config ->> 'capacity')::int from public.client_pages c where c.business_id = p_business_id), 1));
$$;
revoke all on function public.page_capacity(public.businesses.id%type) from public, anon, authenticated;

-- Местное «сейчас» бизнеса: сервер работает по UTC, сдвиг (мин) приложение присылает при публикации
create or replace function public.page_local_now(p_business_id public.businesses.id%type)
returns timestamp language sql stable security definer set search_path = public as $$
  select (now() at time zone 'utc') + make_interval(mins => coalesce((select (c.config ->> 'tz')::int from public.client_pages c where c.business_id = p_business_id), 0));
$$;
revoke all on function public.page_local_now(public.businesses.id%type) from public, anon, authenticated;

-- Занятые интервалы за период: записи по телефону + все не отменённые онлайн-записи с длительностью их услуги
create or replace function public.busy_intervals(p_business_id public.businesses.id%type, p_from date, p_to date)
returns table (day date, s int, e int)
language sql stable security definer set search_path = public as $$
  select bs.day, bs.start_min, bs.end_min from public.busy_slots bs
  where bs.business_id = p_business_id and bs.day between p_from and p_to
  union all
  select b.date::date,
         (extract(hour from b.time_start::time) * 60 + extract(minute from b.time_start::time))::int,
         (extract(hour from b.time_start::time) * 60 + extract(minute from b.time_start::time))::int + coalesce(sv.duration_min, 60)
  from public.bookings b
  left join public.services sv on sv.id = b.service_id
  where b.business_id = p_business_id and b.date::date between p_from and p_to and coalesce(b.status, 'pending') <> 'cancelled';
$$;
revoke all on function public.busy_intervals(public.businesses.id%type, date, date) from public, anon, authenticated;

-- ── 3. Защита: нельзя вставить запись на занятое время ─────────────────
create or replace function public.bookings_overlap_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_dur   int;
  v_s     int;
  v_e     int;
  v_set   jsonb;
  v_from  int := 0;
  v_to    int := 1440;
  v_slots boolean := true;
  v_cnt   int;
begin
  select coalesce(b.settings, '{}'::jsonb) into v_set from public.businesses b where b.id = new.business_id;
  v_slots := coalesce((v_set ->> 'timeSlotsEnabled')::boolean, true);
  if not v_slots or new.time_start is null then return new; end if;     -- запись «на день» без времени — не проверяем

  v_s := (extract(hour from new.time_start::time) * 60 + extract(minute from new.time_start::time))::int;
  v_dur := coalesce((select sv.duration_min from public.services sv where sv.id = new.service_id), 60);
  v_e := v_s + v_dur;
  if v_set ->> 'hoursFrom' ~ '^\d{1,2}:\d{2}$' then v_from := split_part(v_set ->> 'hoursFrom', ':', 1)::int * 60 + split_part(v_set ->> 'hoursFrom', ':', 2)::int; end if;
  if v_set ->> 'hoursTo'   ~ '^\d{1,2}:\d{2}$' then v_to   := split_part(v_set ->> 'hoursTo',   ':', 1)::int * 60 + split_part(v_set ->> 'hoursTo',   ':', 2)::int; end if;
  if v_s < v_from or v_e > v_to then
    raise exception 'out_of_hours';
  end if;

  select count(*) into v_cnt from public.busy_intervals(new.business_id, new.date::date, new.date::date) x
  where x.s < v_e and v_s < x.e;
  if v_cnt >= public.page_capacity(new.business_id) then
    raise exception 'slot_busy';
  end if;
  return new;
end $$;
drop trigger if exists bookings_overlap_guard on public.bookings;
create trigger bookings_overlap_guard before insert on public.bookings
  for each row execute function public.bookings_overlap_guard();

-- ── 4. Приложение (по секрету бизнеса) ─────────────────────────────────
create or replace function public.publish_client_pages_secure(p_business_id public.businesses.id%type, p_secret text, p_config jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.loyalty_secret_ok(p_business_id, p_secret) then return false; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' or pg_column_size(p_config) > 600000 then return false; end if;
  insert into public.client_pages (business_id, config, updated_at) values (p_business_id, p_config, now())
  on conflict (business_id) do update set config = excluded.config, updated_at = now();
  return true;
end $$;

-- Включение регистрации по QR, сумма приветственного бонуса и срок (раньше задавались только вручную в облаке)
create or replace function public.set_loyalty_config_secure(p_business_id public.businesses.id%type, p_secret text, p_enabled boolean, p_bonus numeric, p_valid_days int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.loyalty_secret_ok(p_business_id, p_secret) then return false; end if;
  if p_bonus is null or p_bonus < 0 or p_bonus > 100000 or p_valid_days is null or p_valid_days < 1 or p_valid_days > 3650 then return false; end if;
  insert into public.loyalty_config (business_id, enabled, bonus, valid_days, updated_at)
  values (p_business_id, coalesce(p_enabled, false), p_bonus, p_valid_days, now())
  on conflict (business_id) do update set enabled = excluded.enabled, bonus = excluded.bonus, valid_days = excluded.valid_days, updated_at = now();
  return true;
end $$;

-- Заменяет занятые интервалы записей по телефону за период [p_from, p_to] присланными. Возвращает число строк.
create or replace function public.sync_busy_slots_secure(p_business_id public.businesses.id%type, p_secret text, p_from date, p_to date, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int := 0;
begin
  if not public.loyalty_secret_ok(p_business_id, p_secret) then return -1; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then return -2; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then return -3; end if;
  delete from public.busy_slots where business_id = p_business_id and day between p_from and p_to;
  insert into public.busy_slots (business_id, day, start_min, end_min)
  select p_business_id, x.d, x.s, x.e
  from jsonb_to_recordset(p_rows) as x(d date, s int, e int)
  where x.d between p_from and p_to and x.s between 0 and 1439 and x.e between 1 and 1440 and x.e > x.s;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ── 5. Публичное: для страниц ──────────────────────────────────────────
create or replace function public.get_client_page(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', b.name, 'config', coalesce(c.config, '{}'::jsonb), 'published', c.business_id is not null)
  from public.businesses b left join public.client_pages c on c.business_id = b.id
  where b.slug = p_slug limit 1;
$$;

create or replace function public.get_booking_page(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', b.name, 'type', b.type, 'settings', coalesce(b.settings, '{}'::jsonb),
    'config', coalesce(c.config, '{}'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', sv.id, 'name', sv.name, 'price', sv.price, 'duration_min', coalesce(sv.duration_min, 60), 'description', sv.description) order by sv.name)
                          from public.services sv where sv.business_id = b.id and sv.active is true), '[]'::jsonb))
  from public.businesses b left join public.client_pages c on c.business_id = b.id
  where b.slug = p_slug limit 1;
$$;

-- Занятое время для страницы записи: только начало и конец — без имён и телефонов
create or replace function public.get_busy(p_slug text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_biz public.businesses.id%type;
begin
  select b.id into v_biz from public.businesses b where b.slug = p_slug limit 1;
  if v_biz is null or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('d', x.day, 's', x.s, 'e', x.e)) from public.busy_intervals(v_biz, p_from, p_to) x), '[]'::jsonb);
end $$;

-- Создание онлайн-записи. Ошибки: consent_required, bad_name, bad_phone, bad_date, bad_time, no_service, too_many, slot_busy, out_of_hours, not_found
create or replace function public.create_booking_public(
  p_slug text, p_service_id text, p_name text, p_phone text, p_note text, p_date date, p_time text,
  p_consent boolean, p_consent_version text default '', p_hp text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_biz    public.businesses.id%type;
  v_name   text;
  v_digits text;
  v_phone  text;
  v_note   text;
  v_svc    public.services.id%type;
  v_today  date;
  v_id     public.bookings.id%type;
  v_recent int;
  v_slots  boolean;
begin
  if coalesce(p_hp, '') <> '' then return jsonb_build_object('status', 'ok'); end if;
  if p_consent is distinct from true then return jsonb_build_object('status', 'error', 'code', 'consent_required'); end if;
  select b.id, coalesce((b.settings ->> 'timeSlotsEnabled')::boolean, true) into v_biz, v_slots from public.businesses b where b.slug = p_slug limit 1;
  if v_biz is null then return jsonb_build_object('status', 'error', 'code', 'not_found'); end if;

  v_name := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'));
  if char_length(v_name) < 1 or char_length(v_name) > 60 then return jsonb_build_object('status', 'error', 'code', 'bad_name'); end if;
  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if char_length(v_digits) = 11 and left(v_digits, 1) in ('7', '8') then v_digits := substr(v_digits, 2); end if;
  if char_length(v_digits) <> 10 or left(v_digits, 1) <> '9' then return jsonb_build_object('status', 'error', 'code', 'bad_phone'); end if;
  v_phone := '+7 (' || substr(v_digits, 1, 3) || ') ' || substr(v_digits, 4, 3) || '-' || substr(v_digits, 7, 2) || '-' || substr(v_digits, 9, 2);
  v_note := nullif(btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]', ' ', 'g')), '');
  if v_note is not null and char_length(v_note) > 200 then v_note := left(v_note, 200); end if;

  v_today := public.page_local_now(v_biz)::date;
  if p_date is null or p_date < v_today or p_date > v_today + 90 then return jsonb_build_object('status', 'error', 'code', 'bad_date'); end if;
  if v_slots then
    if coalesce(p_time, '') !~ '^\d{1,2}:\d{2}$' then return jsonb_build_object('status', 'error', 'code', 'bad_time'); end if;
    if p_date = v_today and p_time::time <= public.page_local_now(v_biz)::time then return jsonb_build_object('status', 'error', 'code', 'bad_time'); end if;
  else
    p_time := '00:00';          -- запись «на день»: время не выбирается
  end if;

  if coalesce(p_service_id, '') <> '' then
    select sv.id into v_svc from public.services sv where sv.business_id = v_biz and sv.id::text = p_service_id and sv.active is true limit 1;
    if v_svc is null then return jsonb_build_object('status', 'error', 'code', 'no_service'); end if;
  end if;

  select count(*) into v_recent from public.bookings b
  where b.business_id = v_biz and regexp_replace(coalesce(b.client_phone, ''), '\D', '', 'g') like '%' || v_digits and b.created_at > now() - interval '1 hour';
  if v_recent >= 3 then return jsonb_build_object('status', 'error', 'code', 'too_many'); end if;

  begin
    insert into public.bookings (business_id, service_id, client_name, client_phone, note, date, time_start, status, consent_at, consent_version)
    values (v_biz, v_svc, v_name, v_phone, v_note, p_date, p_time::time, 'pending', now(), coalesce(p_consent_version, ''))
    returning id into v_id;
  exception when raise_exception then
    return jsonb_build_object('status', 'error', 'code', case when sqlerrm in ('slot_busy', 'out_of_hours') then sqlerrm else 'busy' end);
  end;
  return jsonb_build_object('status', 'ok', 'id', v_id);
end $$;

-- ── 6. Права ───────────────────────────────────────────────────────────
revoke all on function public.publish_client_pages_secure(public.businesses.id%type, text, jsonb) from public;
revoke all on function public.set_loyalty_config_secure(public.businesses.id%type, text, boolean, numeric, int) from public;
revoke all on function public.sync_busy_slots_secure(public.businesses.id%type, text, date, date, jsonb) from public;
revoke all on function public.get_client_page(text) from public;
revoke all on function public.get_booking_page(text) from public;
revoke all on function public.get_busy(text, date, date) from public;
revoke all on function public.create_booking_public(text, text, text, text, text, date, text, boolean, text, text) from public;
revoke all on function public.bookings_overlap_guard() from public, anon, authenticated;
grant execute on function public.publish_client_pages_secure(public.businesses.id%type, text, jsonb)        to anon, authenticated;
grant execute on function public.set_loyalty_config_secure(public.businesses.id%type, text, boolean, numeric, int) to anon, authenticated;
grant execute on function public.sync_busy_slots_secure(public.businesses.id%type, text, date, date, jsonb) to anon, authenticated;
grant execute on function public.get_client_page(text)                                                       to anon, authenticated;
grant execute on function public.get_booking_page(text)                                                      to anon, authenticated;
grant execute on function public.get_busy(text, date, date)                                                  to anon, authenticated;
grant execute on function public.create_booking_public(text, text, text, text, text, date, text, boolean, text, text) to anon, authenticated;

-- ── 7. Обновить кеш схемы Supabase, чтобы приложение и страницы сразу увидели новые функции ──
notify pgrst, 'reload schema';
