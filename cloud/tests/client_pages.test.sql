-- Проверка облачной логики страниц для клиентов (cloud/client_pages.sql) на ОБЫЧНОЙ PostgreSQL, не на Supabase.
-- Как: создать пустую базу, выполнить setup (ниже, закомментирован как «заглушки»), затем loyalty_signups.sql и client_pages.sql, затем этот файл.
-- Ожидаемое поведение описано в строках «\echo ===». Ошибки slot_busy / out_of_hours в шагах 4, 6, 7, 8 — ЭТО ПРАВИЛЬНО (защита сработала).
\set ON_ERROR_STOP off
-- ── ЗАГЛУШКИ ТАБЛИЦ SUPABASE (выполнить один раз до loyalty_signups.sql) ──
-- drop schema public cascade; create schema public; grant usage on schema public to public;
-- do $$ begin
--   if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
--   if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
-- end $$;
-- grant usage on schema public to anon, authenticated;
-- -- заглушки таблиц Supabase, какими их видит страница записи
-- create table businesses (id bigint generated always as identity primary key, slug text unique, name text, type text, settings jsonb default '{}'::jsonb);
-- create table business_secrets (business_id bigint references businesses(id), secret text);
-- create table services (id uuid primary key default gen_random_uuid(), business_id bigint references businesses(id), name text, price numeric, category text, duration_min int, description text, active boolean default true);
-- create table bookings (id bigint generated always as identity primary key, business_id bigint references businesses(id), service_id uuid, client_name text, client_phone text, note text, date date, time_start time, status text default 'pending');
-- insert into businesses (slug,name,type,settings) values ('salon','Салон','services','{"hoursFrom":"11:00","hoursTo":"20:00","slotDuration":30,"timeSlotsEnabled":true}');
-- insert into business_secrets values (1,'0123456789abcdef0123');
-- insert into services (business_id,name,price,duration_min) values (1,'Стрижка',1500,60),(1,'Окрашивание',4500,150),(1,'Укладка',1200,30);
-- 

\pset tuples_only on
\echo === 1. публикация настроек: неверный секрет / верный
select public.publish_client_pages_secure(1,'wrong-secret-wrong-secret','{"a":1}'::jsonb);
select public.publish_client_pages_secure(1,'0123456789abcdef0123','{"capacity":1,"tz":180,"title":"Привет"}'::jsonb);
select public.get_client_page('salon')->'config'->>'title';
\echo === 2. занятость по телефону 13:00-15:30 и 17:30-19:00 на 2026-10-20 (сырые минуты)
select public.sync_busy_slots_secure(1,'0123456789abcdef0123','2026-10-01','2026-10-31','[{"d":"2026-10-20","s":780,"e":930},{"d":"2026-10-20","s":1050,"e":1140},{"d":"2026-11-05","s":600,"e":660}]'::jsonb);
select public.get_busy('salon','2026-10-20','2026-10-20');
\echo === 3. повторная синхронизация заменяет период (остаётся одна запись)
select public.sync_busy_slots_secure(1,'0123456789abcdef0123','2026-10-01','2026-10-31','[{"d":"2026-10-20","s":780,"e":930}]'::jsonb);
select count(*) from busy_slots where business_id=1;
select public.sync_busy_slots_secure(1,'bad-secret-bad-secret-1','2026-10-01','2026-10-31','[]'::jsonb) as неверный_секрет;
\echo === 4. прямая вставка (старая страница) на занятое время 14:00 — должна быть отклонена
insert into bookings (business_id,service_id,client_name,client_phone,date,time_start) select 1,id,'Тест','+7 (900) 111-22-33','2026-10-20','14:00' from services where name='Стрижка';
\echo === 5. вставка впритык 15:30 (после занятого) — ок
insert into bookings (business_id,service_id,client_name,client_phone,date,time_start) select 1,id,'Тест','+7 (900) 111-22-33','2026-10-20','15:30' from services where name='Стрижка';
select count(*) as записей from bookings;
\echo === 6. окрашивание (150 мин) в 12:00 пересекается с 13:00 — отклонить; в 10:30 (до 13:00) — ок
insert into bookings (business_id,service_id,client_name,client_phone,date,time_start) select 1,id,'Тест','+7 (900) 111-22-33','2026-10-21','12:00' from services where name='Окрашивание';
insert into bookings (business_id,service_id,client_name,client_phone,date,time_start) select 1,id,'Тест','+7 (900) 111-22-33','2026-10-20','10:30' from services where name='Окрашивание';
\echo === 7. вне рабочих часов (11:00-20:00): 19:30 на 60 минут — отклонить
insert into bookings (business_id,service_id,client_name,client_phone,date,time_start) select 1,id,'Тест','+7 (900) 111-22-33','2026-10-22','19:30' from services where name='Стрижка';
\echo === 8. два мастера (capacity=2): то же время 14:00 допустимо один раз, второй раз — нет
select public.publish_client_pages_secure(1,'0123456789abcdef0123','{"capacity":2,"tz":180}'::jsonb);
insert into bookings (business_id,service_id,client_name,client_phone,date,time_start) select 1,id,'Двое-1','+7 (900) 222-33-44','2026-10-20','14:00' from services where name='Стрижка';
insert into bookings (business_id,service_id,client_name,client_phone,date,time_start) select 1,id,'Двое-2','+7 (900) 333-44-55','2026-10-20','14:00' from services where name='Стрижка';
select count(*) as на_14_00 from bookings where date='2026-10-20' and time_start='14:00';
\echo === 9. отменённая запись освобождает время
update bookings set status='cancelled' where client_name='Двое-1';
insert into bookings (business_id,service_id,client_name,client_phone,date,time_start) select 1,id,'Двое-3','+7 (900) 444-55-66','2026-10-20','14:00' from services where name='Стрижка';
select count(*) as активных_на_14_00 from bookings where date='2026-10-20' and time_start='14:00' and status<>'cancelled';

\pset tuples_only on
truncate bookings; truncate busy_slots;
select public.publish_client_pages_secure(1,'0123456789abcdef0123','{"capacity":1,"tz":0}'::jsonb);
\set d '(current_date + 5)'
select public.sync_busy_slots_secure(1,'0123456789abcdef0123',current_date,current_date+30, jsonb_build_array(jsonb_build_object('d',current_date+5,'s',780,'e',930)));
\echo === A. успешная запись Стрижка 16:00
select public.create_booking_public('salon',(select id::text from services where name='Стрижка'),'Анна','8 (912) 345-67-89','хочу у окна',current_date+5,'16:00',true,'v1','');
\echo === B. то же время 16:00 — slot_busy (капасити 1)
select public.create_booking_public('salon',(select id::text from services where name='Стрижка'),'Борис','+7 (903) 111-22-33',null,current_date+5,'16:00',true,'v1','');
\echo === C. занято телефоном 14:00 — slot_busy
select public.create_booking_public('salon',(select id::text from services where name='Стрижка'),'Борис','+7 (903) 111-22-33',null,current_date+5,'14:00',true,'v1','');
\echo === D. окрашивание 11:00 (до 13:30) пересекается с 13:00 — slot_busy
select public.create_booking_public('salon',(select id::text from services where name='Окрашивание'),'Борис','+7 (903) 111-22-33',null,current_date+5,'11:00',true,'v1','');
\echo === E. без согласия / плохой телефон / плохое имя / прошлая дата / нет услуги / бот
select public.create_booking_public('salon',(select id::text from services where name='Стрижка'),'Анна','+7 (912) 345-67-89',null,current_date+6,'12:00',false,'v1','');
select public.create_booking_public('salon',(select id::text from services where name='Стрижка'),'Анна','123',null,current_date+6,'12:00',true,'v1','');
select public.create_booking_public('salon',(select id::text from services where name='Стрижка'),'  ',null,null,current_date+6,'12:00',true,'v1','');
select public.create_booking_public('salon',(select id::text from services where name='Стрижка'),'Анна','+7 (912) 345-67-89',null,current_date-1,'12:00',true,'v1','');
select public.create_booking_public('salon','00000000-0000-0000-0000-000000000000','Анна','+7 (912) 345-67-89',null,current_date+6,'12:00',true,'v1','');
select public.create_booking_public('salon',(select id::text from services where name='Стрижка'),'Бот','+7 (912) 999-99-99',null,current_date+6,'12:00',true,'v1','spam');
\echo === F. лимит: четвёртая запись с одного номера за час — too_many
select public.create_booking_public('salon',(select id::text from services where name='Укладка'),'Анна','+7 (912) 345-67-89',null,current_date+7,'12:00',true,'v1','');
select public.create_booking_public('salon',(select id::text from services where name='Укладка'),'Анна','+7 (912) 345-67-89',null,current_date+7,'13:00',true,'v1','');
select public.create_booking_public('salon',(select id::text from services where name='Укладка'),'Анна','+7 (912) 345-67-89',null,current_date+7,'14:00',true,'v1','');
\echo === G. что сохранилось
select client_name, client_phone, date - current_date as через_дней, time_start, status, consent_version from bookings order by id;
\echo === H. get_busy отдаёт интервалы без имён и телефонов
select public.get_busy('salon',current_date+5,current_date+5);
select jsonb_path_exists(public.get_busy('salon',current_date+5,current_date+5),'$[*].client_name') as есть_имена;
\echo === I. get_booking_page: услуги и настройки
select jsonb_array_length(public.get_booking_page('salon')->'services') as услуг, public.get_booking_page('salon')->'settings'->>'hoursFrom' as с;

\pset tuples_only on
update businesses set settings = settings || '{"timeSlotsEnabled":false}'::jsonb where slug='salon';
select public.create_booking_public('salon',(select id::text from services where name='Стрижка'),'Иван','+7 (905) 555-44-33',null,current_date,'',true,'v1','');
select time_start from bookings where client_name='Иван';
update businesses set settings = settings || '{"timeSlotsEnabled":true}'::jsonb where slug='salon';

\pset tuples_only on
select public.set_loyalty_config_secure(1,'bad-secret-bad-secret-1',true,300,60) as неверный_секрет;
select public.set_loyalty_config_secure(1,'0123456789abcdef0123',true,-5,60) as плохая_сумма;
select public.set_loyalty_config_secure(1,'0123456789abcdef0123',true,300,60) as ок;
select * from public.get_loyalty_public_info('salon');
select public.set_loyalty_config_secure(1,'0123456789abcdef0123',false,500,30) as ок2;
select enabled,bonus,valid_days from loyalty_config where business_id=1;
select public.register_loyalty_signup('salon','Анна','+7 (912) 345-67-89',true,false,'v1','') as при_выключенной;
select public.set_loyalty_config_secure(1,'0123456789abcdef0123',true,500,30);
select public.register_loyalty_signup('salon','Анна','+7 (912) 345-67-89',true,false,'v1','') as при_включённой;
