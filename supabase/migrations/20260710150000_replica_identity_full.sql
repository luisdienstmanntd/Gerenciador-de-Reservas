-- =========================================================================================
-- OSTERIA DI LUCCA — REPLICA IDENTITY FULL em reservas (corrige DELETE no Realtime)
--
-- Bug encontrado em produção: criar reserva aparecia em tempo real, excluir não.
--
-- Motivo: por padrão (REPLICA IDENTITY DEFAULT), um evento de DELETE do Postgres só
-- inclui a chave primária da linha excluída (id), não as outras colunas. As escutas em
-- tempo real deste app filtram por `data=eq.<data>` (ver database.js, escutarReservasPorData
-- /ComMudancas) — como `data` não é a chave primária de `reservas`, o Supabase Realtime não
-- consegue avaliar esse filtro num evento de DELETE (falta o dado) e descarta o evento sem
-- avisar. Resultado: a exclusão acontece no banco, mas nenhum cliente é notificado.
--
-- REPLICA IDENTITY FULL faz o Postgres incluir TODAS as colunas da linha (não só a PK) nos
-- eventos de UPDATE/DELETE, permitindo o filtro ser avaliado corretamente.
-- =========================================================================================

alter table reservas       replica identity full;
alter table config_dia     replica identity full;
alter table notificacoes   replica identity full;
