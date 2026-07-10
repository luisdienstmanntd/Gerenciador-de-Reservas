-- =========================================================================================
-- OSTERIA DI LUCCA — Bloqueio automático da próxima linha (reserva grande)
--
-- Regra de negócio: o padrão é atender 2 pessoas por linha/horário sem gerar atraso na
-- cozinha. Se uma reserva com 4+ adultos é criada, a próxima linha livre do mesmo bloco
-- (horário) é bloqueada automaticamente, reservando a capacidade que essa mesa grande já
-- consome.
--
-- bloqueio_origem_id identifica QUAL reserva gerou o bloqueio automático — necessário pra
-- desfazer o bloqueio sozinho se a reserva de origem for editada pra menos de 4 pessoas.
-- `on delete cascade`: se a reserva de origem for excluída, o bloqueio some junto,
-- automaticamente, sem precisar de nenhum código extra pra esse caso.
-- =========================================================================================

alter table reservas
  add column bloqueio_origem_id uuid references reservas(id) on delete cascade;

create index idx_reservas_bloqueio_origem on reservas(bloqueio_origem_id);
