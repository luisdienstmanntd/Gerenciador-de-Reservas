-- =========================================================================================
-- OSTERIA DI LUCCA — Habilita Realtime (Fase 5, substitui o onSnapshot do Firestore)
--
-- O Postgres não avisa o navegador sozinho quando uma linha muda — é preciso
-- publicar explicitamente quais tabelas entram no canal de Realtime do Supabase.
-- Sem isso, supabase.channel(...).on('postgres_changes', ...) nunca dispara.
--
-- Tabelas escolhidas: as 3 que hoje têm listener em tempo real no Firestore
-- (escutarReservasPorData/ComMudancas, escutarConfigDia, escutarNotificacoesNaoLidas).
-- 'hospedes' e 'mesas' não precisam — nada escuta mudança neles em tempo real.
-- =========================================================================================

alter publication supabase_realtime add table reservas, config_dia, notificacoes;
