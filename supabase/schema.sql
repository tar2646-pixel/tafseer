-- =============================================================
-- مراجعة التفسير — إعداد قاعدة البيانات في Supabase
-- الصق هذا الملف كاملاً في: SQL Editor ← New query ← Run
-- قبل التشغيل: غيّر البريد في السطر الأخير إلى بريد المدير.
-- =============================================================

create extension if not exists pgcrypto;

-- المدير والمشرفون
create table if not exists public.staff (
  email     text primary key check (email = lower(email)),
  role      text not null check (role in ('admin', 'supervisor')),
  added_at  timestamptz not null default now()
);

-- بنوك أسئلة التفسير
create table if not exists public.banks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 120),
  file        text,
  questions   jsonb not null check (jsonb_typeof(questions) = 'array'),
  created_at  timestamptz not null default now(),
  created_by  text default (auth.jwt() ->> 'email')
);

-- نتائج المشاركين
create table if not exists public.scores (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  kind        text not null check (kind in ('t', 'h')),   -- t = تفسير، h = حفظ
  points      int  not null check (points between 0 and 450),
  correct     int  not null check (correct between 0 and 50),
  total       int  not null check (total between 1 and 50),
  created_at  timestamptz not null default now(),
  edit_key    uuid,   -- مفتاح سري للجهاز لتعديل الاسم، لا يُقرأ
  -- النقاط محوّلة إلى مقياس 30 سؤالاً (أقصى 15 نقطة للسؤال)
  check (correct <= total and points * total <= correct * 450)
);
create index if not exists scores_kind_player on public.scores (kind, player_id);

-- صلاحية المستخدم الحالي: admin أو supervisor أو null
create or replace function public.my_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.staff where email = lower(auth.jwt() ->> 'email')
$$;
revoke all on function public.my_role() from public;
grant execute on function public.my_role() to anon, authenticated;

-- لوحة الصدارة: أفضل نتيجة لكل مشارك وآخر اسم استخدمه
create or replace view public.leaderboard
with (security_invoker = true) as
select
  kind,
  player_id,
  (array_agg(name order by created_at desc))[1] as name,
  max(points) as best,
  count(*)    as plays
from public.scores
group by kind, player_id;

-- ---------------- الصلاحيات (Row Level Security) ----------------
alter table public.staff  enable row level security;
alter table public.banks  enable row level security;
alter table public.scores enable row level security;

grant select on public.banks, public.leaderboard to anon, authenticated;
grant select (id, player_id, name, kind, points, correct, total, created_at) on public.scores to anon, authenticated;
grant insert on public.scores to anon, authenticated;
grant insert, update, delete on public.banks to authenticated;
grant delete on public.scores to authenticated;
grant select, insert, update, delete on public.staff to authenticated;

drop policy if exists staff_admin on public.staff;
create policy staff_admin on public.staff
  for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists banks_read   on public.banks;
drop policy if exists banks_write  on public.banks;
drop policy if exists banks_update on public.banks;
drop policy if exists banks_delete on public.banks;
create policy banks_read   on public.banks for select to anon, authenticated using (true);
create policy banks_write  on public.banks for insert to authenticated with check (public.my_role() in ('admin','supervisor'));
create policy banks_update on public.banks for update to authenticated using (public.my_role() in ('admin','supervisor'));
create policy banks_delete on public.banks for delete to authenticated using (public.my_role() in ('admin','supervisor'));

drop policy if exists scores_read   on public.scores;
drop policy if exists scores_insert on public.scores;
drop policy if exists scores_delete on public.scores;
create policy scores_read   on public.scores for select to anon, authenticated using (true);
create policy scores_insert on public.scores for insert to anon, authenticated with check (true);
create policy scores_delete on public.scores for delete to authenticated using (public.my_role() = 'admin');

-- تغيير الاسم خلال 24 ساعة
create or replace function public.rename_player(p_player uuid, p_key uuid, p_name text)
returns int
language plpgsql security definer
set search_path = public
as $$
declare n int;
begin
  p_name := btrim(coalesce(p_name, ''));
  if p_key is null or char_length(p_name) not between 1 and 40 then
    raise exception 'invalid name';
  end if;
  update public.scores set name = p_name
   where player_id = p_player and edit_key = p_key
     and created_at > now() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.rename_player(uuid, uuid, text) from public;
grant execute on function public.rename_player(uuid, uuid, text) to anon, authenticated;

-- ---------------- المدير الأول ----------------
-- غيّر البريد التالي إلى بريدك (بحروف صغيرة)، ثم شغّل الملف.
insert into public.staff (email, role) values ('your-email@example.com', 'admin')
on conflict (email) do update set role = 'admin';

-- ---------------- العضوية وخطط الأعضاء ----------------

-- ملف العضو: الاسم والبريد
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '' check (char_length(name) <= 60),
  email       text,
  created_at  timestamptz not null default now()
);

-- خطة العضو: سجل واحد لكل نوع (حفظ / مراجعة)
create table if not exists public.plans (
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in ('hifz', 'review')),
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, type),
  check (pg_column_size(data) < 1000000)
);

-- إنشاء ملف العضو تلقائياً عند التسجيل
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(left(btrim(new.raw_user_meta_data ->> 'name'), 60), ''), lower(new.email))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ملفات للحسابات الموجودة من قبل
insert into public.profiles (id, name, email)
select id, coalesce(left(btrim(raw_user_meta_data ->> 'name'), 60), ''), lower(email) from auth.users
on conflict (id) do nothing;

-- الصلاحيات
alter table public.profiles enable row level security;
alter table public.plans    enable row level security;
revoke all on public.profiles, public.plans from anon, authenticated;
grant select, update (name) on public.profiles to authenticated;
grant select, insert, update, delete on public.plans to authenticated;

drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists plans_own       on public.plans;
drop policy if exists plans_staff     on public.plans;
-- العضو يرى ملفه، والمدير والمشرف يرون الجميع
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() in ('admin', 'supervisor'));
-- العضو يعدّل اسمه فقط
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- العضو يملك خططه كاملة
create policy plans_own on public.plans for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- المدير والمشرف يطّلعون على الخطط للمتابعة فقط
create policy plans_staff on public.plans for select to authenticated
  using (public.my_role() in ('admin', 'supervisor'));
