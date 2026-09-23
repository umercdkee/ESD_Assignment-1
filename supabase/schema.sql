-- Pennywise single-user starter schema.
-- This demo policy is intentionally convenient for local coursework, but permits
-- anyone with the anon key to access the table. Add Supabase Auth and user_id
-- policies before exposing a deployed instance to the public internet.
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  amount numeric(12, 2) not null check (amount > 0),
  category text not null check (category in ('Food', 'Transport', 'Housing', 'Bills', 'Shopping', 'Health', 'Entertainment', 'Other')),
  expense_date date not null,
  notes text not null default '' check (char_length(notes) <= 500),
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;
grant select, insert, delete on public.expenses to anon, authenticated;
drop policy if exists "starter can read expenses" on public.expenses;
drop policy if exists "starter can create expenses" on public.expenses;
drop policy if exists "starter can delete expenses" on public.expenses;
create policy "starter can read expenses" on public.expenses for select to anon, authenticated using (true);
create policy "starter can create expenses" on public.expenses for insert to anon, authenticated with check (true);
create policy "starter can delete expenses" on public.expenses for delete to anon, authenticated using (true);

create index if not exists expenses_expense_date_idx on public.expenses (expense_date desc);
