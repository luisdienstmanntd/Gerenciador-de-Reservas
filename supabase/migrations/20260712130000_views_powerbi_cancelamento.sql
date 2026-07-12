-- =========================================================================================
-- OSTERIA DI LUCCA — Views do Power BI passam a conhecer o cancelamento (REVISAO_TECNICA.md A1)
--
-- As views da Fase 7 (20260710130000) foram criadas um dia ANTES da feature de cancelamento
-- (20260711120000). Sem esta correção, `eh_reserva_real` conta reservas canceladas como
-- reservas de verdade — todos os agregados (por dia / por dia da semana) saem inflados e
-- divergem do Dashboard interno, que já exclui canceladas (dashboard.js v3.15).
--
-- Mudanças:
--   1. eh_reserva_real agora exige `cancelado_em is null` — mesma regra do app.
--   2. Novas colunas em vw_reservas_detalhado: cancelado_em, deposito_retido, eh_cancelada
--      (no FIM da lista — `create or replace view` só permite adicionar colunas no final).
--   3. Agregados ganham total_cancelamentos — permite analisar taxa de cancelamento por
--      dia e por dia da semana no Power BI. Lembrete: mede cancelamentos VIGENTES; um
--      cancelamento desfeito (RESTAURAR) sai daqui e só permanece em reservas_log.
-- =========================================================================================

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
  -- ✅ Cancelada (soft-delete) deixa de contar como reserva real — mesma regra do app
  (h.id is not null and not r.bloqueado and not r.somente_hospedes
     and r.cancelado_em is null) as eh_reserva_real,
  (r.bloqueado or r.somente_hospedes) as eh_bloqueio,
  r.criado_em,
  r.atualizado_em,
  -- ✅ Novas colunas (sempre no fim — restrição do create or replace view)
  r.cancelado_em,
  r.deposito_retido,
  (r.cancelado_em is not null) as eh_cancelada
from reservas r
left join hospedes h on h.id = r.hospede_id
left join mesas m    on m.identificador = r.mesa_identificador;

comment on view vw_reservas_detalhado is 'Uma linha por reserva, com hóspede/mesa já resolvidos e colunas de calendário prontas. Fonte principal para o Power BI. eh_reserva_real exclui canceladas (soft-delete); eh_cancelada/cancelado_em/deposito_retido permitem análise de cancelamentos vigentes.';

create or replace view vw_reservas_por_dia as
select
  data,
  ano,
  mes,
  dia_semana_num,
  dia_semana_nome,
  count(*) filter (where eh_reserva_real)                as total_reservas,
  sum(pax_total) filter (where eh_reserva_real)           as total_pax,
  count(*) filter (where eh_reserva_real and tipo_cliente = 'hospede')     as qtd_hospede,
  count(*) filter (where eh_reserva_real and tipo_cliente = 'externo')     as qtd_externo,
  count(*) filter (where eh_reserva_real and tipo_cliente = 'passante')    as qtd_passante,
  count(*) filter (where eh_reserva_real and tipo_cliente = 'roomservice') as qtd_roomservice,
  count(*) filter (where eh_bloqueio)                     as total_bloqueios,
  count(*) filter (where eh_cancelada)                    as total_cancelamentos
from vw_reservas_detalhado
group by data, ano, mes, dia_semana_num, dia_semana_nome;

comment on view vw_reservas_por_dia is 'Agregado diário — total de reservas/pax por dia (canceladas excluídas), quebrado por tipo de cliente, com contagem de cancelamentos vigentes.';

create or replace view vw_reservas_por_dia_semana as
select
  dia_semana_num,
  dia_semana_nome,
  count(*) filter (where eh_reserva_real)      as total_reservas,
  sum(pax_total) filter (where eh_reserva_real) as total_pax,
  round(avg(pax_total) filter (where eh_reserva_real), 1) as media_pax_por_reserva,
  count(*) filter (where eh_cancelada)          as total_cancelamentos
from vw_reservas_detalhado
group by dia_semana_num, dia_semana_nome
order by dia_semana_num;

comment on view vw_reservas_por_dia_semana is 'Agregado por dia da semana (canceladas excluídas) — inclui cancelamentos vigentes por dia da semana.';

-- `create or replace view` preserva os GRANTs existentes (authenticated) — nada a refazer.
