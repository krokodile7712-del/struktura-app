-- ════════════════════════════════════════════════════════════════════════
-- СТРУКТУРА — саморегистрация клиентов по QR (тестовая версия, облако Supabase)
-- Как выполнить: панель Supabase → SQL Editor → вставить ВЕСЬ файл → Run.
-- Файл безопасно запускать повторно (ничего не стирает).
--
-- ПЕРЕД ЗАПУСКОМ — диагностика (выполнить отдельно, результат прислать мне,
-- если ниже блок «проверка окружения» остановится с ошибкой):
--
--   select table_name, column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name in ('businesses', 'business_secrets')
--   order by table_name, ordinal_position;
-- ════════════════════════════════════════════════════════════════════════


-- ── 0. Проверка окружения ──────────────────────────────────────────────
-- Новые функции проверяют секрет бизнеса так же, как существующие защищённые
-- (таблица business_secrets). Если структура другая — остановимся здесь, а не
-- получим молчаливо неработающую защиту.
do $$
begin
  if to_regclass('public.businesses') is null then
    raise exception 'Нет таблицы public.businesses — пришлите результат диагностики';
  end if;
  if to_regclass('public.business_secrets') is null then
    raise exception 'Нет таблицы public.business_secrets — пришлите результат диагностики';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'business_secrets' and column_name = 'business_id') then
    raise exception 'В business_secrets нет колонки business_id — пришлите результат диагностики';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'business_secrets' and column_name = 'secret') then
    raise exception 'В business_secrets нет колонки secret (ожидался ключ открытым текстом) — пришлите результат диагностики';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'businesses' and column_name = 'slug') then
    raise exception 'В businesses нет колонки slug — пришлите результат диагностики';
  end if;
end $$;


-- ── 1. Таблицы ─────────────────────────────────────────────────────────
-- Тип business_id берётся у businesses.id — подойдёт и bigint, и uuid.
do $$
declare t text;
begin
  select format_type(a.atttypid, a.atttypmod) into t
  from pg_attribute a
  where a.attrelid = 'public.businesses'::regclass and a.attname = 'id' and not a.attisdropped;

  -- Настройки регистрации по QR для бизнеса. Отдельная таблица (а не поле
  -- businesses.settings): приложение перезаписывает settings при синхронизации,
  -- и выключатель/сумма бонуса там могли бы пропасть.
  execute format($f$
    create table if not exists public.loyalty_config (
      business_id  %s primary key references public.businesses(id) on delete cascade,
      enabled      boolean       not null default false,   -- регистрация включена (по умолчанию ВЫКЛЮЧЕНА)
      bonus        numeric(10,2) not null default 500,     -- приветственный бонус, ₽
      valid_days   int           not null default 60,      -- сколько дней действует резерв
      updated_at   timestamptz   not null default now()
    )$f$, t);

  -- Заявки на регистрацию. Телефон — 11 цифр (7XXXXXXXXXX), уникален в рамках бизнеса.
  execute format($f$
    create table if not exists public.loyalty_signups (
      id                bigint generated always as identity primary key,
      business_id       %s not null references public.businesses(id) on delete cascade,
      name              text          not null,
      phone             text          not null,
      bonus             numeric(10,2) not null default 0,
      valid_until       timestamptz,
      created_at        timestamptz   not null default now(),
      consent_at        timestamptz   not null default now(),
      consent_version   text          not null default '',
      marketing_consent boolean       not null default false,
      ip_hash           text,
      imported_at       timestamptz,
      unique (business_id, phone)
    )$f$, t);

  -- Попытки регистрации — для ограничения частоты (хранится хэш IP, не сам адрес)
  execute format($f$
    create table if not exists public.loyalty_signup_attempts (
      id          bigint generated always as identity primary key,
      business_id %s not null,
      ip_hash     text,
      created_at  timestamptz not null default now()
    )$f$, t);
end $$;

create index if not exists loyalty_signups_new_idx
  on public.loyalty_signups (business_id) where imported_at is null;
create index if not exists loyalty_attempts_ip_idx
  on public.loyalty_signup_attempts (ip_hash, created_at);
create index if not exists loyalty_attempts_biz_idx
  on public.loyalty_signup_attempts (business_id, created_at);

-- Соль для хэша IP — хранится в базе, из приложения и со страницы недоступна
create table if not exists public.loyalty_private (
  key   text primary key,
  value text not null
);
insert into public.loyalty_private (key, value)
values ('ip_salt', gen_random_uuid()::text)
on conflict (key) do nothing;

-- Прямой доступ закрыт: RLS включён, политик нет. Данные — только через функции ниже.
alter table public.loyalty_config           enable row level security;
alter table public.loyalty_signups          enable row level security;
alter table public.loyalty_signup_attempts  enable row level security;
alter table public.loyalty_private          enable row level security;
revoke all on public.loyalty_config, public.loyalty_signups,
              public.loyalty_signup_attempts, public.loyalty_private from anon, authenticated;


-- ── 2. Проверка секрета бизнеса (внутренняя) ───────────────────────────
create or replace function public.loyalty_secret_ok(p_business_id public.businesses.id%type, p_secret text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_secret is not null and length(p_secret) >= 16 and exists (
    select 1 from public.business_secrets s
    where s.business_id = p_business_id and s.secret = p_secret
  );
$$;
revoke all on function public.loyalty_secret_ok(public.businesses.id%type, text) from public, anon, authenticated;


-- ── 3. Публичное: данные для страницы регистрации ──────────────────────
-- Отдаёт только то, что и так видно гостю: название, включена ли регистрация,
-- сумма бонуса и срок. Никаких клиентов и секретов.
create or replace function public.get_loyalty_public_info(p_slug text)
returns table (name text, enabled boolean, bonus numeric, valid_days int)
language sql stable security definer set search_path = public
as $$
  select b.name::text,
         coalesce(c.enabled, false),
         coalesce(c.bonus, 0),
         coalesce(c.valid_days, 60)
  from public.businesses b
  left join public.loyalty_config c on c.business_id = b.id
  where b.slug = p_slug
  limit 1;
$$;


-- ── 4. Публичное: регистрация гостя ────────────────────────────────────
-- Возвращает jsonb: {"status":"ok", "bonus":500, "valid_days":60, "valid_until":"…"}
-- или {"status":"error", "code":"…"}. Коды: consent_required, bad_name, bad_phone,
-- disabled, not_found, too_many, busy, already.
-- Сумма бонуса берётся ИЗ БАЗЫ (loyalty_config) — со страницы её подделать нельзя.
create or replace function public.register_loyalty_signup(
  p_slug            text,
  p_name            text,
  p_phone           text,
  p_consent         boolean,
  p_marketing       boolean default false,
  p_consent_version text    default '',
  p_hp              text    default ''      -- «ловушка» для ботов: настоящий гость её не заполняет
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_biz      public.businesses.id%type;
  v_cfg      public.loyalty_config%rowtype;
  v_name     text;
  v_digits   text;
  v_phone    text;
  v_hdrs     json;
  v_ip       text;
  v_salt     text;
  v_hash     text;
  v_until    timestamptz;
  v_new_id   bigint;
begin
  -- Бот заполнил скрытое поле: отвечаем «успехом», ничего не сохраняя
  if coalesce(p_hp, '') <> '' then
    return jsonb_build_object('status', 'ok');
  end if;

  if p_consent is distinct from true then
    return jsonb_build_object('status', 'error', 'code', 'consent_required');
  end if;

  -- Имя: без управляющих символов, 1–60 знаков
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'));
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    return jsonb_build_object('status', 'error', 'code', 'bad_name');
  end if;

  -- Телефон: 10 цифр на 9… или 11 на 7…/8… → единый вид 79XXXXXXXXX (только мобильные)
  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if char_length(v_digits) = 11 and left(v_digits, 1) in ('7', '8') then
    v_digits := substr(v_digits, 2);
  end if;
  if char_length(v_digits) <> 10 or left(v_digits, 1) <> '9' then
    return jsonb_build_object('status', 'error', 'code', 'bad_phone');
  end if;
  v_phone := '7' || v_digits;

  select b.id into v_biz from public.businesses b where b.slug = p_slug limit 1;
  if v_biz is null then
    return jsonb_build_object('status', 'error', 'code', 'not_found');
  end if;
  select * into v_cfg from public.loyalty_config c where c.business_id = v_biz;
  if not found or v_cfg.enabled is not true then
    return jsonb_build_object('status', 'error', 'code', 'disabled');
  end if;

  -- IP из заголовков запроса — только для ограничения частоты, хранится хэш
  begin
    v_hdrs := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_hdrs := null;
  end;
  v_ip := btrim(split_part(coalesce(v_hdrs ->> 'cf-connecting-ip', v_hdrs ->> 'x-forwarded-for', ''), ',', 1));
  select value into v_salt from public.loyalty_private where key = 'ip_salt';
  v_hash := case when v_ip <> '' then encode(sha256(convert_to(v_ip || ':' || coalesce(v_salt, ''), 'UTF8')), 'hex') else null end;

  -- Ограничения: с одного адреса — не более 5 попыток в час; на бизнес — не более 300 в час
  if v_hash is not null and (
       select count(*) from public.loyalty_signup_attempts
       where ip_hash = v_hash and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('status', 'error', 'code', 'too_many');
  end if;
  if (select count(*) from public.loyalty_signup_attempts
      where business_id = v_biz and created_at > now() - interval '1 hour') >= 300 then
    return jsonb_build_object('status', 'error', 'code', 'busy');
  end if;

  insert into public.loyalty_signup_attempts (business_id, ip_hash) values (v_biz, v_hash);
  if random() < 0.05 then   -- изредка чистим старые попытки
    delete from public.loyalty_signup_attempts where created_at < now() - interval '30 days';
  end if;

  v_until := now() + make_interval(days => v_cfg.valid_days);

  insert into public.loyalty_signups
    (business_id, name, phone, bonus, valid_until, consent_version, marketing_consent, ip_hash)
  values
    (v_biz, v_name, v_phone, v_cfg.bonus, v_until, left(coalesce(p_consent_version, ''), 40), coalesce(p_marketing, false), v_hash)
  on conflict (business_id, phone) do nothing
  returning id into v_new_id;

  if v_new_id is null then
    return jsonb_build_object('status', 'error', 'code', 'already');
  end if;

  return jsonb_build_object('status', 'ok', 'bonus', v_cfg.bonus, 'valid_days', v_cfg.valid_days, 'valid_until', v_until);
end;
$$;


-- ── 5. Только по секрету бизнеса: чтение и закрытие заявок ─────────────
create or replace function public.get_loyalty_signups_secure(p_business_id public.businesses.id%type, p_secret text)
returns table (id bigint, name text, phone text, bonus numeric, valid_until timestamptz,
               created_at timestamptz, marketing_consent boolean)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.loyalty_secret_ok(p_business_id, p_secret) then
    raise exception 'invalid_secret' using errcode = '28000';
  end if;
  return query
    select s.id, s.name, s.phone, s.bonus, s.valid_until, s.created_at, s.marketing_consent
    from public.loyalty_signups s
    where s.business_id = p_business_id and s.imported_at is null
    order by s.id
    limit 200;
end;
$$;

create or replace function public.mark_loyalty_signups_imported_secure(
  p_business_id public.businesses.id%type, p_secret text, p_ids bigint[])
returns int
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  if not public.loyalty_secret_ok(p_business_id, p_secret) then
    raise exception 'invalid_secret' using errcode = '28000';
  end if;
  update public.loyalty_signups
     set imported_at = now()
   where business_id = p_business_id and id = any(p_ids) and imported_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Удаление данных клиента из облака по его просьбе (отзыв согласия): по номеру.
-- Вызывать из приложения при удалении клиента; возвращает число удалённых строк.
create or replace function public.delete_loyalty_signup_secure(
  p_business_id public.businesses.id%type, p_secret text, p_phone text)
returns int
language plpgsql security definer set search_path = public
as $$
declare v_n int; v_digits text;
begin
  if not public.loyalty_secret_ok(p_business_id, p_secret) then
    raise exception 'invalid_secret' using errcode = '28000';
  end if;
  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if char_length(v_digits) = 11 and left(v_digits, 1) in ('7', '8') then v_digits := substr(v_digits, 2); end if;
  delete from public.loyalty_signups where business_id = p_business_id and phone = '7' || v_digits;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;


-- ── 6. Права на вызов ──────────────────────────────────────────────────
revoke all on function public.get_loyalty_public_info(text) from public;
revoke all on function public.register_loyalty_signup(text, text, text, boolean, boolean, text, text) from public;
revoke all on function public.get_loyalty_signups_secure(public.businesses.id%type, text) from public;
revoke all on function public.mark_loyalty_signups_imported_secure(public.businesses.id%type, text, bigint[]) from public;
revoke all on function public.delete_loyalty_signup_secure(public.businesses.id%type, text, text) from public;

grant execute on function public.get_loyalty_public_info(text)                                  to anon, authenticated;
grant execute on function public.register_loyalty_signup(text, text, text, boolean, boolean, text, text) to anon, authenticated;
grant execute on function public.get_loyalty_signups_secure(public.businesses.id%type, text)          to anon, authenticated;
grant execute on function public.mark_loyalty_signups_imported_secure(public.businesses.id%type, text, bigint[]) to anon, authenticated;
grant execute on function public.delete_loyalty_signup_secure(public.businesses.id%type, text, text)  to anon, authenticated;


-- ── 7. Включить регистрацию для своей кофейни ──────────────────────────
-- Регистрация выключена по умолчанию. Подставьте код вашего бизнеса (тот, что в
-- ссылке записи после slug=) и выполните отдельно:
--
--   insert into public.loyalty_config (business_id, enabled, bonus, valid_days)
--   select id, true, 500, 60 from public.businesses where slug = 'ВАШ_КОД'
--   on conflict (business_id) do update
--     set enabled = excluded.enabled, bonus = excluded.bonus,
--         valid_days = excluded.valid_days, updated_at = now();
--
-- Изменить сумму или срок позже — тем же запросом. Выключить: enabled = false.

-- Обновить кэш облачного API, чтобы новые функции стали видны сразу
notify pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════
-- ДОБАВЛЕНО ПОЗЖЕ: удаление персональных данных (152-ФЗ)
-- Безопасно выполнять этот файл повторно целиком — весь блок выше не трогает
-- существующие данные, только создаёт недостающее.
-- ════════════════════════════════════════════════════════════════════════

-- ── 8. Проверка окружения для этого блока ──────────────────────────────
-- Таблица bookings (онлайн-записи) создавалась не этим файлом — структуру
-- предполагаем по тому, что читает приложение (client_name, client_phone,
-- business_id). Если её нет или поля другие — точно узнаем это здесь,
-- а не получим молча неработающее удаление.
do $$
begin
  if to_regclass('public.bookings') is null then
    raise exception 'Нет таблицы public.bookings — пришлите результат: select table_name, column_name, data_type from information_schema.columns where table_schema=''public'' and table_name=''bookings'' order by ordinal_position;';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='business_id') then
    raise exception 'В bookings нет колонки business_id — пришлите ту же диагностику, что выше';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='client_phone') then
    raise exception 'В bookings нет колонки client_phone — пришлите ту же диагностику, что выше';
  end if;
end $$;

-- ── 9. Удаление одной онлайн-записи (кнопка «Удалить» в приложении) ────
create or replace function public.delete_booking_secure(
  p_business_id public.businesses.id%type, p_secret text, p_booking_id public.bookings.id%type)
returns int
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  if not public.loyalty_secret_ok(p_business_id, p_secret) then
    raise exception 'invalid_secret' using errcode = '28000';
  end if;
  delete from public.bookings where id = p_booking_id and business_id = p_business_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.delete_booking_secure(public.businesses.id%type, text, public.bookings.id%type) from public;
grant execute on function public.delete_booking_secure(public.businesses.id%type, text, public.bookings.id%type) to anon, authenticated;

-- ── 10. Полная очистка бизнеса в облаке — для «Начать заново» ──────────
-- Стирает всё, что этот бизнес когда-либо клал в облако: онлайн-записи
-- (имена и телефоны гостей), заявки на регистрацию по QR, настройки
-- лояльности и саму строку бизнеса. Вызывается ДО того, как приложение
-- сотрёт свою локальную базу (иначе стирать будет нечем — код и секрет
-- бизнеса исчезнут вместе с локальными данными).
create or replace function public.wipe_business_cloud_data_secure(
  p_business_id public.businesses.id%type, p_secret text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_bookings int; v_signups int; v_attempts int;
begin
  if not public.loyalty_secret_ok(p_business_id, p_secret) then
    raise exception 'invalid_secret' using errcode = '28000';
  end if;
  delete from public.bookings where business_id = p_business_id;
  get diagnostics v_bookings = row_count;
  delete from public.loyalty_signups where business_id = p_business_id;
  get diagnostics v_signups = row_count;
  delete from public.loyalty_signup_attempts where business_id = p_business_id;
  get diagnostics v_attempts = row_count;
  delete from public.loyalty_config where business_id = p_business_id;
  delete from public.business_secrets where business_id = p_business_id;
  delete from public.businesses where id = p_business_id;
  return jsonb_build_object('bookings', v_bookings, 'signups', v_signups, 'attempts', v_attempts);
end;
$$;
revoke all on function public.wipe_business_cloud_data_secure(public.businesses.id%type, text) from public;
grant execute on function public.wipe_business_cloud_data_secure(public.businesses.id%type, text) to anon, authenticated;

notify pgrst, 'reload schema';
