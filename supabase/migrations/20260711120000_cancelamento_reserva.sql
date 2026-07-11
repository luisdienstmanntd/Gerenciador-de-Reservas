-- =========================================================================================
-- OSTERIA DI LUCCA — Cancelamento de reserva (soft-delete, com controle de adiantamento)
--
-- Contexto: reservas de clientes Externos exigem adiantamento PIX de R$200. Cancelamento
-- com 48h+ de antecedência devolve o valor; em cima da hora, o cliente perde o adiantamento.
-- Até agora, cancelar uma reserva a excluía de vez do banco — sem registro pra análise.
--
-- cancelado_em: data/hora do cancelamento. NULL = reserva ativa (comportamento padrão).
-- deposito_retido: só relevante pra tipo='externo'. NULL pra quem não paga adiantamento
-- (hóspede/roomservice/passante) ou pra reservas ainda ativas.
-- =========================================================================================

alter table reservas add column cancelado_em timestamptz;
alter table reservas add column deposito_retido boolean;

-- 'CANCELAR' vira uma ação própria no log de auditoria — distinta de EXCLUIR (que continua
-- existindo pra apagar de vez um erro de digitação, sem o significado de negócio de cancelamento).
alter table reservas_log drop constraint reservas_log_acao_check;
alter table reservas_log add constraint reservas_log_acao_check
  check (acao in ('CRIAR', 'EDITAR', 'EXCLUIR', 'DESBLOQUEAR', 'CANCELAR'));
