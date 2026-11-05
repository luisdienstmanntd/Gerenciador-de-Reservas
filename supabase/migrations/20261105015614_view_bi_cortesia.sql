-- Acrescenta colunas ao final para preservar o contrato das colunas existentes.
create or replace view public.vw_reservas_por_dia as
select
  data, ano, mes, dia_semana_num, dia_semana_nome,
  count(*) filter (where eh_reserva_real) as total_reservas,
  sum(pax_total) filter (where eh_reserva_real) as total_pax,
  count(*) filter (where eh_reserva_real and tipo_cliente = 'hospede') as qtd_hospede,
  count(*) filter (where eh_reserva_real and tipo_cliente = 'externo') as qtd_externo,
  count(*) filter (where eh_reserva_real and tipo_cliente = 'passante') as qtd_passante,
  count(*) filter (where eh_reserva_real and tipo_cliente = 'roomservice') as qtd_roomservice,
  count(*) filter (where eh_bloqueio) as total_bloqueios,
  count(*) filter (where eh_cancelada) as total_cancelamentos,
  count(*) filter (where eh_reserva_real and tipo_cliente = 'cortesia') as qtd_cortesia,
  coalesce(sum(pax_total) filter (where eh_reserva_real and tipo_cliente = 'cortesia'), 0) as pax_cortesia
from public.vw_reservas_detalhado
group by data, ano, mes, dia_semana_num, dia_semana_nome;
