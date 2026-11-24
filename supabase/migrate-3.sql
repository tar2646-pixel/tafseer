-- العضوية: ملفات الأعضاء، وحفظ خطط الحفظ والمراجعة في الحساب، وصلاحية المشرف بالمتابعة.
-- شغّل هذا الملف مرة واحدة في Supabase ← SQL Editor (بعد migrate-2.sql).
-- لا يحذف أي بيانات، ويمكن تشغيله أكثر من مرة.

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
