-- =========================================================================================
-- OSTERIA DI LUCCA — Log de auditoria: autor confiável, imutabilidade, retenção e view plana
--
-- Contexto: a aba "Log" (tabela reservas_log) vira uma trilha de auditoria de verdade.
-- Hoje qualquer usuário autenticado pode editar/apagar linhas do log (policy "for all"),
-- o autor é só um texto digitado no navegador e não há política de retenção. Esta migration:
--   1. usuario_id   — autor CONFIÁVEL (auth.uid() preenchido pelo banco). O campo texto
--                     `usuario` continua existindo só para exibição.
--   2. acao         — check ampliado com as ações novas (OBSERVAR, NOSHOW, CONFIG, RECRIAR, LOGIN, LOGOUT).
--   3. Índices      — para filtrar por período, usuário, ação e noite da reserva.
--   4. Imutável     — o app só consegue LER e INSERIR. UPDATE/DELETE negados a `authenticated`.
--   5. Retenção     — limpar_logs_antigos(): 2 anos (piso fixo; o app chama no boot).
--   6. vw_log_auditoria — colunas planas (sem JSONB) para a tela e para o Power BI.
-- =========================================================================================

-- ── 1. AUTOR CONFIÁVEL ───────────────────────────────────────────────────────────────────
-- Sem FK em auth.users de propósito (mesma lógica de 20260709161500: o log precisa sobreviver
-- a qualquer exclusão). Linhas antigas ficam com NULL — não há como saber o autor com certeza.
-- Default em passo separado: linhas existentes ficam NULL sem depender de JWT na migration.
alter table reservas_log add column usuario_id uuid;
alter table reservas_log alter column usuario_id set default auth.uid();
comment on column reservas_log.usuario_id is 'Autor confiável (auth.uid() no INSERT). `usuario` é só o texto de exibição digitado no login.';

-- ── 2. AÇÕES PERMITIDAS ──────────────────────────────────────────────────────────────────
-- Última definição: 20260712120000 (CRIAR, EDITAR, EXCLUIR, DESBLOQUEAR, CANCELAR, RESTAURAR).
alter table reservas_log drop constraint reservas_log_acao_check;
alter table reservas_log add constraint reservas_log_acao_check
  check (acao in ('CRIAR', 'EDITAR', 'EXCLUIR', 'DESBLOQUEAR', 'CANCELAR', 'RESTAURAR',
                  'RECRIAR', 'OBSERVAR', 'NOSHOW', 'CONFIG', 'LOGIN', 'LOGOUT'));

-- ── 3. ÍNDICES ───────────────────────────────────────────────────────────────────────────
create index idx_logs_criado_em      on reservas_log (criado_em desc);
create index idx_logs_usuario        on reservas_log (usuario);
create index idx_logs_acao_criado_em on reservas_log (acao, criado_em desc);
-- Filtro por noite da reserva (a data fica dentro do JSONB). Texto ISO 'YYYY-MM-DD' ordena
-- cronologicamente, então serve para igualdade e intervalo.
create index idx_logs_data_depois    on reservas_log ((dados_depois->>'data'));
create index idx_logs_data_antes     on reservas_log ((dados_antes->>'data'));

-- ── 4. LOG IMUTÁVEL ──────────────────────────────────────────────────────────────────────
-- A policy "for all" permitia UPDATE/DELETE. Trocamos por SELECT + INSERT separados e
-- revogamos o privilégio de tabela (defesa em profundidade: mesmo se alguém recriar uma
-- policy permissiva, o GRANT continua barrando).
drop policy "Autenticados podem tudo em reservas_log" on reservas_log;

create policy "Autenticados podem ler reservas_log"
  on reservas_log for select
  using (auth.uid() is not null);

create policy "Autenticados podem inserir em reservas_log"
  on reservas_log for insert
  with check (usuario_id = auth.uid());  -- default preenche usuario_id antes do check; impede forjar autor

revoke update, delete on reservas_log from authenticated;
revoke update, delete on reservas_log from anon;

-- criado_em também é confiável: um cliente (authenticated/anon) não pode datar o log
-- retroativamente. Papéis privilegiados (postgres, service_role, migrations/importações)
-- continuam livres. SECURITY INVOKER: current_user é o papel da sessão.
create or replace function public.reservas_log_criado_em_servidor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.criado_em := now();
  end if;
  return new;
end;
$$;

create trigger trg_reservas_log_criado_em
  before insert on public.reservas_log
  for each row execute function public.reservas_log_criado_em_servidor();

-- ── 5. RETENÇÃO: 2 ANOS ──────────────────────────────────────────────────────────────────
-- Única forma sancionada de apagar log (SECURITY DEFINER ignora o revoke acima). O piso de
-- 24 meses é imposto AQUI: nem um cliente adulterado consegue encurtar a janela.
create or replace function public.limpar_logs_antigos(p_meses int default 24)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_apagados integer;
begin
  delete from public.reservas_log
  where criado_em < now() - (greatest(coalesce(p_meses, 24), 24) || ' months')::interval;
  get diagnostics v_apagados = row_count;
  return v_apagados;
end;
$$;

revoke all on function public.limpar_logs_antigos(int) from public;
revoke all on function public.limpar_logs_antigos(int) from anon;
grant execute on function public.limpar_logs_antigos(int) to authenticated;

-- ── 6. VIEW PLANA ────────────────────────────────────────────────────────────────────────
-- security_invoker = true: a view respeita o RLS de quem consulta (mesmo padrão das views
-- do Power BI). Dados da reserva vêm de dados_depois, com fallback em dados_antes (EXCLUIR
-- só tem "antes"). data_reserva tolera string vazia/inválida (vira NULL, não estoura erro).
create or replace view public.vw_log_auditoria
with (security_invoker = true) as
select
  l.id,
  l.criado_em,
  (l.criado_em at time zone 'America/Sao_Paulo')::date as data_alteracao,
  (l.criado_em at time zone 'America/Sao_Paulo')::time as hora_alteracao,
  l.acao,
  l.usuario,
  l.usuario_id,
  l.reserva_id,
  case when coalesce(l.dados_depois->>'data', l.dados_antes->>'data') ~ '^\d{4}-\d{2}-\d{2}$'
       then (coalesce(l.dados_depois->>'data', l.dados_antes->>'data'))::date end as data_reserva,
  coalesce(l.dados_depois->>'horario', l.dados_antes->>'horario') as horario,
  coalesce(l.dados_depois->>'nomes', l.dados_antes->>'nomes') as nomes,
  coalesce(l.dados_depois->>'apto', l.dados_antes->>'apto') as apto,
  coalesce(l.dados_depois->>'codigoReserva', l.dados_antes->>'codigoReserva') as codigo_reserva,
  coalesce(l.dados_depois->>'tipo', l.dados_antes->>'tipo') as tipo,
  case when coalesce(l.dados_depois->>'paxs', l.dados_antes->>'paxs') ~ '^\d{1,9}$'
       then (coalesce(l.dados_depois->>'paxs', l.dados_antes->>'paxs'))::int end as paxs,
  case when coalesce(l.dados_depois->>'chd', l.dados_antes->>'chd') ~ '^\d{1,9}$'
       then (coalesce(l.dados_depois->>'chd', l.dados_antes->>'chd'))::int end as chd,
  coalesce(l.dados_depois->>'mesa', l.dados_antes->>'mesa') as mesa,
  coalesce(l.dados_depois->>'obs', l.dados_antes->>'obs') as obs,
  -- CONFIG/LOGIN/LOGOUT/NOSHOW não são snapshot de reserva: dados_* têm formato livre, então os
  -- campos de reserva saem NULL (todos os casts são protegidos por regex). NOSHOW expõe data_reserva.
  -- Só para EDITAR: quais campos rastreados mudaram entre antes e depois.
  case when l.acao = 'EDITAR' then
    array(
      select k
      from unnest(array['data','nomes','apto','codigoReserva','horario','tipo','paxs','chd','obs',
                        'mesa','bloqueado','somenteHospedes','whatsapp','avulsa','menuDegustacao',
                        'canceladoEm','depositoRetido']) as k
      where (l.dados_antes->>k) is distinct from (l.dados_depois->>k)
    )
  end as campos_alterados
from public.reservas_log l;

grant select on public.vw_log_auditoria to authenticated;
