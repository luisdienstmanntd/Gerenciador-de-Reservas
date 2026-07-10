-- =========================================================================================
-- OSTERIA DI LUCCA — Tabela de heartbeat (Fase 6)
--
-- O Supabase free tier pausa o projeto após 7 dias sem atividade de banco de dados.
-- Esta tabela existe só pra dar uma "batida de coração" periódica (via GitHub Actions,
-- ver .github/workflows/supabase-heartbeat.yml) e manter o projeto ativo.
--
-- Sem dado sensível nenhum (só um timestamp) — por isso liberamos pro papel `anon`
-- (usuário não-logado), diferente de todas as outras tabelas do sistema. O workflow
-- roda fora de qualquer sessão de usuário, não faz sentido exigir login só pra isso.
-- =========================================================================================

create table heartbeat (
  id serial primary key,
  checado_em timestamptz not null default now()
);

alter table heartbeat enable row level security;

create policy "Qualquer um pode inserir heartbeat" on heartbeat
  for insert to anon, authenticated
  with check (true);

create policy "Qualquer um pode ver heartbeat" on heartbeat
  for select to anon, authenticated
  using (true);

create policy "Qualquer um pode limpar heartbeat antigo" on heartbeat
  for delete to anon, authenticated
  using (true);

grant usage on schema public to anon;
grant select, insert, delete on heartbeat to anon;
grant select, insert, delete on heartbeat to authenticated;
