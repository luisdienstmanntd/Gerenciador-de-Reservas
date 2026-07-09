-- =========================================================================================
-- OSTERIA DI LUCCA — POLÍTICAS DE RLS (Fase 3 da migração Firestore → Supabase)
-- Ver plano_de_ação.md para contexto completo.
--
-- Regra: qualquer usuário autenticado (Supabase Auth) pode ler/escrever em qualquer tabela.
-- Mesma regra hoje usada no firestore.rules (`request.auth != null`) — sem diferenciação
-- de papel entre recepção/osteria/gerência, igual ao sistema atual.
--
-- Login de produção (index.html) continua no Firebase Auth até a Fase 5 — estas políticas
-- só passam a valer de verdade quando o app trocar de fato para o Supabase Auth.
-- =========================================================================================

-- Garante RLS ativo mesmo que o toggle "RLS automático" do projeto não tenha pego
-- (defensivo — idempotente, não dá erro se já estiver ativo)
alter table hospedes enable row level security;
alter table mesas enable row level security;
alter table reservas enable row level security;
alter table reservas_log enable row level security;
alter table config_dia enable row level security;
alter table notificacoes enable row level security;

create policy "Autenticados podem tudo em hospedes"
  on hospedes for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "Autenticados podem tudo em mesas"
  on mesas for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "Autenticados podem tudo em reservas"
  on reservas for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "Autenticados podem tudo em reservas_log"
  on reservas_log for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "Autenticados podem tudo em config_dia"
  on config_dia for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "Autenticados podem tudo em notificacoes"
  on notificacoes for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
