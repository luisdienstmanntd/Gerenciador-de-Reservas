-- =========================================================================================
-- OSTERIA DI LUCCA — Governança de dados: confiabilidade para métricas de tempo
--
-- Problema: reservas históricas migradas manualmente das planilhas Google (datas de jantar
-- anteriores a 30/06/2026) não têm o timestamp real de criação — `criado_em` registra o
-- momento da DIGITAÇÃO na migração, não o momento em que o cliente pediu a reserva.
-- Qualquer métrica de "tempo entre solicitação e jantar" calculada sobre elas sai distorcida.
--
-- Solução (Data Governance): em vez de apagar ou "consertar" dados que não têm conserto,
-- rotulamos cada registro com o que ele É confiável para medir:
--   1. `origem_dados`          — de onde o registro veio ('sistema' | 'importacao').
--   2. `confiavel_para_tempo`  — FALSE = nunca usar em métricas baseadas em criado_em.
--   3. `vw_reservas_tempo_real`— view pré-filtrada pro Power BI: só registros confiáveis,
--      com `dias_antecedencia` já calculado. Seleciona e esquece que o problema existe.
--
-- Regra de corte: data de jantar < 2026-06-30 ⇒ confiavel_para_tempo = FALSE.
-- O app replica essa regra no insert/update (database.js _paraColunasReserva); qualquer
-- import em lote FUTURO deve setar origem_dados = 'importacao' explicitamente.
-- Documentado em prompt.md §6.1.
-- =========================================================================================

alter table reservas
  add column if not exists origem_dados text not null default 'sistema',
  add column if not exists confiavel_para_tempo boolean not null default true;

comment on column reservas.origem_dados is 'De onde o registro veio: ''sistema'' (criado pelo app) ou ''importacao'' (migração de planilhas/carga em lote). Imports futuros devem setar explicitamente.';
comment on column reservas.confiavel_para_tempo is 'FALSE = criado_em não reflete o momento real da solicitação (dado histórico digitado depois). Nunca usar em métricas de tempo (antecedência, lead time). Regra: data < 2026-06-30.';

-- Backfill do histórico migrado das planilhas — o UPDATE é idempotente (re-rodar não muda nada).
update reservas
set origem_dados = 'importacao',
    confiavel_para_tempo = false
where data < '2026-06-30';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- vw_reservas_detalhado ganha as 2 colunas de governança (SEMPRE no fim da lista —
-- restrição do `create or replace view`). Base: definição de 20260712130000 (cancelamento).
-- GRANTs existentes (authenticated) são preservados pelo replace.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace view vw_reservas_detalhado as
select
  r.id,
  r.data,
  extract(year  from r.data)::int as ano,
  extract(month from r.data)::int as mes,
  extract(isodow from r.data)::int as dia_semana_num, -- 1=segunda ... 7=domingo (ISO)
  trim(to_char(r.data, 'Day')) as dia_semana_nome,
  r.horario,
  r.original_base,
  r.paxs,
  r.chd,
  (r.paxs + r.chd) as pax_total,
  r.avulsa,
  r.obs,
  r.bloqueado,
  r.somente_hospedes,
  r.pagamento,
  r.menu_degustacao,
  r.inicio_mesa,
  r.fim_mesa,
  case when r.inicio_mesa is not null and r.fim_mesa is not null
       then round(extract(epoch from (r.fim_mesa - r.inicio_mesa)) / 60)
       else null end as tempo_mesa_minutos,
  r.mesa_identificador,
  m.tipo as mesa_tipo,
  h.id as hospede_id,
  h.nome as hospede_nome,
  h.apto,
  h.telefone,
  nullif(substring(regexp_replace(coalesce(h.telefone, ''), '\D', '', 'g') from 1 for 2), '') as ddd_telefone,
  h.tipo as tipo_cliente,
  (h.id is not null and not r.bloqueado and not r.somente_hospedes
     and r.cancelado_em is null) as eh_reserva_real,
  (r.bloqueado or r.somente_hospedes) as eh_bloqueio,
  r.criado_em,
  r.atualizado_em,
  r.cancelado_em,
  r.deposito_retido,
  (r.cancelado_em is not null) as eh_cancelada,
  -- ✅ Novas colunas de governança (sempre no fim)
  r.origem_dados,
  r.confiavel_para_tempo
from reservas r
left join hospedes h on h.id = r.hospede_id
left join mesas m    on m.identificador = r.mesa_identificador;

comment on view vw_reservas_detalhado is 'Uma linha por reserva, com hóspede/mesa já resolvidos e colunas de calendário prontas. Fonte principal para o Power BI. eh_reserva_real exclui canceladas; origem_dados/confiavel_para_tempo permitem filtrar dados históricos em métricas de tempo.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- View pré-filtrada para métricas SENSÍVEIS AO TEMPO (lead time, antecedência, tempo de
-- mesa por período de criação). Já esconde o histórico não-confiável e as não-reservas
-- (bloqueios/canceladas) — no Power BI, basta selecionar esta view.
--
-- dias_antecedencia: dias entre a solicitação e o jantar. `criado_em` é timestamptz em UTC;
-- converter para o fuso do restaurante ANTES de extrair a data evita o erro clássico de
-- off-by-one (reserva criada 22h de Brasília já é "amanhã" em UTC).
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace view vw_reservas_tempo_real as
select
  *,
  (data - (criado_em at time zone 'America/Sao_Paulo')::date) as dias_antecedencia
from vw_reservas_detalhado
where confiavel_para_tempo
  and eh_reserva_real;

comment on view vw_reservas_tempo_real is 'Só reservas reais (não bloqueio, não cancelada) com criado_em confiável — fonte segura para métricas de tempo. dias_antecedencia = dias entre a solicitação e o jantar (fuso America/Sao_Paulo).';

grant select on vw_reservas_tempo_real to authenticated;
