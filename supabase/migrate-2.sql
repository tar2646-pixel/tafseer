-- تحديث قاعدة البيانات لميزات: عدد الأسئلة (10–50)، واسم الزائر، وتعديل الاسم خلال 24 ساعة.
-- شغّل هذا الملف مرة واحدة في Supabase ← SQL Editor. لا يحذف أي نتيجة سابقة،
-- ويمكن تشغيله أكثر من مرة دون ضرر.

-- 1) قبول اختبارات من 10 إلى 50 سؤالاً
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.scores'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ '(correct|total)'
  loop
    execute format('alter table public.scores drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.scores
  add constraint scores_correct_range check (correct between 0 and 50),
  add constraint scores_total_range   check (total between 1 and 50),
  add constraint scores_points_valid  check (correct <= total and points * total <= correct * 450);

-- 2) مفتاح سري لكل جهاز، لا يقرؤه أحد، ويُستخدم لإثبات أن صاحب النتيجة هو من يغيّر اسمه
alter table public.scores add column if not exists edit_key uuid;
revoke select on public.scores from anon, authenticated;
grant select (id, player_id, name, kind, points, correct, total, created_at) on public.scores to anon, authenticated;

-- 3) تغيير الاسم: يغيّر اسم المشارك في نتائجه المسجّلة خلال آخر 24 ساعة فقط
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
