-- سجل نتائج الاختبارات لكل عضو (يظهر في صفحة «حسابي» ولدى المشرف).
-- شغّل هذا الملف مرة واحدة في Supabase ← SQL Editor (بعد migrate-3.sql).
-- لا يحذف أي بيانات، ويمكن تشغيله أكثر من مرة.

create table if not exists public.quiz_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('t', 'h')),          -- t = تفسير، h = حفظ
  scope       text not null default '' check (char_length(scope) <= 120),
  correct     int  not null check (correct between 0 and 50),
  total       int  not null check (total between 1 and 50),
  points      int  not null check (points between 0 and 750),
  taken_at    timestamptz not null default now(),
  check (correct <= total and points <= correct * 15)
);
create index if not exists quiz_results_user on public.quiz_results (user_id, taken_at desc);

alter table public.quiz_results enable row level security;
revoke all on public.quiz_results from anon, authenticated;
grant select, insert, delete on public.quiz_results to authenticated;

drop policy if exists results_own_read   on public.quiz_results;
drop policy if exists results_own_insert on public.quiz_results;
drop policy if exists results_own_delete on public.quiz_results;
drop policy if exists results_staff      on public.quiz_results;
create policy results_own_read   on public.quiz_results for select to authenticated using (user_id = auth.uid());
create policy results_own_insert on public.quiz_results for insert to authenticated with check (user_id = auth.uid());
create policy results_own_delete on public.quiz_results for delete to authenticated using (user_id = auth.uid());
-- المدير والمشرف يطّلعون على النتائج للمتابعة
create policy results_staff on public.quiz_results for select to authenticated using (public.my_role() in ('admin', 'supervisor'));
