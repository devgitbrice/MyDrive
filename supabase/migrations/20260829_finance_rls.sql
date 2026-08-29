-- Politiques RLS pour les tables de la page /finances.
-- Sans elles, toute écriture (insert/update/delete) est refusée (42501),
-- y compris depuis le bouton « Ajouter » de la page.
-- À exécuter dans le SQL Editor du dashboard Supabase (ou via supabase db push).

alter table public.mydrive_finance_transactions enable row level security;
alter table public.mydrive_finance_echeances enable row level security;

drop policy if exists "finance_tx_select" on public.mydrive_finance_transactions;
drop policy if exists "finance_tx_insert" on public.mydrive_finance_transactions;
drop policy if exists "finance_tx_update" on public.mydrive_finance_transactions;
drop policy if exists "finance_tx_delete" on public.mydrive_finance_transactions;

create policy "finance_tx_select" on public.mydrive_finance_transactions
  for select to authenticated using (true);
create policy "finance_tx_insert" on public.mydrive_finance_transactions
  for insert to authenticated with check (user_id = auth.uid());
create policy "finance_tx_update" on public.mydrive_finance_transactions
  for update to authenticated using (user_id = auth.uid());
create policy "finance_tx_delete" on public.mydrive_finance_transactions
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "finance_ech_select" on public.mydrive_finance_echeances;
drop policy if exists "finance_ech_insert" on public.mydrive_finance_echeances;
drop policy if exists "finance_ech_update" on public.mydrive_finance_echeances;
drop policy if exists "finance_ech_delete" on public.mydrive_finance_echeances;

create policy "finance_ech_select" on public.mydrive_finance_echeances
  for select to authenticated using (true);
create policy "finance_ech_insert" on public.mydrive_finance_echeances
  for insert to authenticated with check (user_id = auth.uid());
create policy "finance_ech_update" on public.mydrive_finance_echeances
  for update to authenticated using (user_id = auth.uid());
create policy "finance_ech_delete" on public.mydrive_finance_echeances
  for delete to authenticated using (user_id = auth.uid());
