-- تحديث جدول النتائج ليقبل اختبارات من 10 إلى 50 سؤالاً.
-- شغّل هذا الملف مرة واحدة في Supabase ← SQL Editor.
-- لا يحذف أي نتيجة سابقة.
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
