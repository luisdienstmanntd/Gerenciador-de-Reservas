-- =========================================================================================
-- OSTERIA DI LUCCA — GRANTS pro papel 'authenticated' (Fase 3, complemento ao RLS)
--
-- Contexto: o projeto foi criado com "Expor automaticamente novas tabelas" desmarcado
-- (decisão consciente, ver Fase 1). Isso significa que nenhum papel tem privilégio de base
-- nas tabelas — RLS sozinho não é suficiente, o Postgres bloqueia antes mesmo de avaliar
-- as políticas. GRANT concede o privilégio de tocar na tabela; RLS decide quais LINHAS.
-- As duas camadas juntas = comportamento equivalente ao `request.auth != null` do Firestore.
--
-- Propositalmente NÃO concedemos nada ao papel 'anon' — usuário não-logado continua sem
-- nenhum acesso, nem tentando.
-- =========================================================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete on hospedes       to authenticated;
grant select, insert, update, delete on mesas           to authenticated;
grant select, insert, update, delete on reservas        to authenticated;
grant select, insert, update, delete on reservas_log    to authenticated;
grant select, insert, update, delete on config_dia      to authenticated;
grant select, insert, update, delete on notificacoes    to authenticated;
