-- =========================================================================================
-- BLOQUEIOS ANTECIPADOS POR DIA DA SEMANA (dias de movimento do hotel)
--
-- Contexto de negócio: qui/sex/sáb são os dias de maior movimento de hóspedes.
-- Pra evitar que reservas de externos em datas futuras consumam as vagas dos
-- hóspedes, algumas linhas já nascem bloqueadas nesses dias — por padrão
-- 1 linha às 20:00, 2 às 20:30 e 1 às 21:00.
--
-- A regra é configurável na tela de Configurações (config_sistema, sincronizada
-- entre todos os usuários): quantas linhas, quais horários, quais dias da semana.
--
-- Formato do jsonb: { "<dia getDay 0-6>": { "<HH:MM>": <qtd linhas> } }
--   0=domingo, 1=segunda ... 4=quinta, 5=sexta, 6=sábado
-- =========================================================================================

alter table config_sistema
    add column if not exists bloqueios_semanais jsonb not null default
    '{"4": {"20:00": 1, "20:30": 2, "21:00": 1},
      "5": {"20:00": 1, "20:30": 2, "21:00": 1},
      "6": {"20:00": 1, "20:30": 2, "21:00": 1}}'::jsonb;

-- Flag por data: os bloqueios da data já foram materializados (uma única vez).
-- Depois de aplicados, a recepção tem controle manual total — desbloquear ou
-- excluir um bloqueio NÃO faz o sistema recriá-lo (a flag impede reaplicação).
alter table config_dia
    add column if not exists bloqueios_semanais_aplicados boolean not null default false;
