-- =========================================================================================
-- OSTERIA DI LUCCA — Desfazer cancelamento de reserva
--
-- Contexto: cancelamento (soft-delete) precisa ser reversível — clicar na reserva cancelada,
-- no filtro "Cancelamentos", deve permitir restaurá-la ao local/data/horário de origem
-- (nunca alterados pelo cancelamento). 'RESTAURAR' vira uma ação própria no log de auditoria,
-- já que o registro de cancelado_em/deposito_retido é apagado da linha da reserva — o log
-- passa a ser a única fonte histórica de que o cancelamento existiu.
-- =========================================================================================

alter table reservas_log drop constraint reservas_log_acao_check;
alter table reservas_log add constraint reservas_log_acao_check
  check (acao in ('CRIAR', 'EDITAR', 'EXCLUIR', 'DESBLOQUEAR', 'CANCELAR', 'RESTAURAR'));
