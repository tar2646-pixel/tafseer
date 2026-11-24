-- موافقة المشرف على العضويات الجديدة (بدلاً من تأكيد البريد).
-- شغّل هذا الملف مرة واحدة في Supabase ← SQL Editor (بعد migrate-4.sql).
-- لا يحذف أي بيانات، ويمكن تشغيله أكثر من مرة.

-- حالة العضوية: pending بانتظار الموافقة، approved مقبول، rejected مرفوض
alter table public.profiles add column if not exists status text;
alter table public.profiles add column if not exists decided_at timestamptz;
-- الأعضاء الموجودون حالياً يُقبلون تلقائياً
update public.profiles set status = 'approved' where status is null;
alter table public.profiles alter column status set default 'pending';
alter table public.profiles alter column status set not null;
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check check (status in ('pending', 'approved', 'rejected'));
create index if not exists profiles_pending on public.profiles (created_at) where status = 'pending';

-- عند التسجيل: العضو الجديد بانتظار الموافقة، إلا إن كان بريده من المشرفين
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, status)
  values (new.id,
          coalesce(left(btrim(new.raw_user_meta_data ->> 'name'), 60), ''),
          lower(new.email),
          case when exists (select 1 from public.staff s where lower(s.email) = lower(new.email))
               then 'approved' else 'pending' end)
  on conflict (id) do nothing;
  return new;
end $$;

-- هل العضو الحالي مقبول؟
create or replace function public.is_approved()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'approved')
      or public.my_role() is not null
$$;
revoke all on function public.is_approved() from public;
grant execute on function public.is_approved() to authenticated;

-- قبول أو رفض عضو (للمدير والمشرف فقط)
create or replace function public.set_member_status(member uuid, new_status text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if public.my_role() not in ('admin', 'supervisor') or public.my_role() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if new_status not in ('approved', 'rejected', 'pending') then
    raise exception 'bad status';
  end if;
  update public.profiles set status = new_status, decided_at = now() where id = member;
end $$;
revoke all on function public.set_member_status(uuid, text) from public;
grant execute on function public.set_member_status(uuid, text) to authenticated;

-- العضو غير المقبول لا يحفظ خطة ولا نتيجة في قاعدة البيانات
drop policy if exists plans_own on public.plans;
create policy plans_own on public.plans for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());

drop policy if exists results_own_insert on public.quiz_results;
create policy results_own_insert on public.quiz_results for insert to authenticated
  with check (user_id = auth.uid() and public.is_approved());
