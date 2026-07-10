-- =========================================================================================
-- OSTERIA DI LUCCA — Views analíticas para Power BI (Fase 7)
--
-- O rascunho original do plano (`plano_de_ação.md`) sugeria colunas que não existem no
-- schema real (`status`, `data_reserva`) — mesmo problema já corrigido na Fase 2. As views
-- abaixo usam só colunas reais (ver 20260709133321_initial_schema.sql).
--
-- vw_reservas_detalhado: view "larga" (uma linha por reserva, já com os joins resolvidos
-- e colunas de calendário prontas). É a view principal — em vez de várias views pré-
-- agregadas para cada pergunta possível, o Power BI consegue montar qualquer tabela
-- dinâmica/gráfico a partir desta única fonte. As duas views seguintes são atalhos prontos
-- para as perguntas mais comuns (dia/semana), mas nada que já não dê pra fazer a partir
-- da primeira.
-- =========================================================================================

create view vw_reservas_detalhado as
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
  -- Melhor esforço: pega os 2 primeiros dígitos do telefone só com números.
  -- Depende de o telefone ter sido digitado com DDD — não há validação de formato
  -- na entrada de dados hoje, então nem todo registro terá um DDD confiável.
  nullif(substring(regexp_replace(coalesce(h.telefone, ''), '\D', '', 'g') from 1 for 2), '') as ddd_telefone,
  h.tipo as tipo_cliente,
  -- Réplica do filtro que o app já usa no cliente (home.js/dashboard.js) pra decidir
  -- o que é reserva de verdade vs. slot vazio vs. bloqueio da grade.
  (h.id is not null and not r.bloqueado and not r.somente_hospedes) as eh_reserva_real,
  (r.bloqueado or r.somente_hospedes) as eh_bloqueio,
  r.criado_em,
  r.atualizado_em
from reservas r
left join hospedes h on h.id = r.hospede_id
left join mesas m    on m.identificador = r.mesa_identificador;

comment on view vw_reservas_detalhado is 'Uma linha por reserva, com hóspede/mesa já resolvidos e colunas de calendário prontas. Fonte principal para o Power BI — monte tabelas dinâmicas e gráficos a partir daqui.';

create view vw_reservas_por_dia as
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
  count(*) filter (where eh_bloqueio)                     as total_bloqueios
from vw_reservas_detalhado
group by data, ano, mes, dia_semana_num, dia_semana_nome;

comment on view vw_reservas_por_dia is 'Agregado diário — total de reservas/pax por dia, já quebrado por tipo de cliente.';

create view vw_reservas_por_dia_semana as
select
  dia_semana_num,
  dia_semana_nome,
  count(*) filter (where eh_reserva_real)      as total_reservas,
  sum(pax_total) filter (where eh_reserva_real) as total_pax,
  round(avg(pax_total) filter (where eh_reserva_real), 1) as media_pax_por_reserva
from vw_reservas_detalhado
group by dia_semana_num, dia_semana_nome
order by dia_semana_num;

comment on view vw_reservas_por_dia_semana is 'Agregado por dia da semana (segunda a domingo) — útil para identificar padrões semanais de movimento.';

-- Mesma regra das tabelas: só 'authenticated' tem acesso (dados incluem nome/telefone de
-- hóspede). Views não são exceção — precisam de GRANT próprio, RLS das tabelas de base
-- continua valendo por trás (avaliado pelo usuário real da sessão, não pelo dono da view).
grant select on vw_reservas_detalhado, vw_reservas_por_dia, vw_reservas_por_dia_semana to authenticated;
