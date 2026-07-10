-- =========================================================================================
-- OSTERIA DI LUCCA — Remove FK de reservas_log.reserva_id e notificacoes.reserva_id (Fase 5)
--
-- Problema encontrado ao portar excluirReserva() para o Supabase: o fluxo sempre foi
-- "lê a reserva → apaga a reserva → registra o log com reserva_id apontando pra ela".
-- No Firestore isso nunca foi um problema (sem schema/FK). No Postgres, com a FK original
-- (reservas_log.reserva_id references reservas(id)), o INSERT do log falharia com violação
-- de chave estrangeira, porque a reserva referenciada já não existe mais no momento do log.
--
-- Um log de auditoria (e uma notificação já disparada) precisa sobreviver à exclusão da
-- reserva que o originou — é o propósito de um histórico. reserva_id vira só uma referência
-- informativa (sem integridade referencial forçada), os dados relevantes já ficam
-- preservados em dados_antes/dados_depois (jsonb).
-- =========================================================================================

alter table reservas_log   drop constraint if exists reservas_log_reserva_id_fkey;
alter table notificacoes   drop constraint if exists notificacoes_reserva_id_fkey;
