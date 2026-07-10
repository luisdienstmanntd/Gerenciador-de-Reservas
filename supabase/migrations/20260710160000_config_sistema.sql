-- =========================================================================================
-- OSTERIA DI LUCCA — Configurações do Sistema sincronizadas (capacidade/mesas/bloqueio)
--
-- Antes viviam só no localStorage de cada navegador/tablet — cada usuário (recepção,
-- osteria, gerência) podia ver um valor diferente. Vira uma linha única compartilhada,
-- sincronizada em tempo real (mesmo padrão de config_dia/linhasExtras).
--
-- Linha única (singleton): `id` travado em 1 via check constraint — nunca existe mais de
-- uma linha nesta tabela.
-- =========================================================================================

create table config_sistema (
  id int primary key default 1 check (id = 1),
  capacidade int not null default 30,
  mesas int not null default 18,
  bloqueio_automatico boolean not null default true,
  atualizado_em timestamptz not null default now()
);

insert into config_sistema (id) values (1);

create trigger trg_config_sistema_atualizado_em
  before update on config_sistema
  for each row
  execute function set_atualizado_em(); -- função já criada na migration inicial (Fase 2)

alter table config_sistema enable row level security;

create policy "Autenticados podem tudo em config_sistema" on config_sistema
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

grant select, update on config_sistema to authenticated;

-- REPLICA IDENTITY FULL: mesma lição da Fase 5 (bug de DELETE não aparecendo em tempo
-- real) — aqui não tem filtro de coluna, mas mantém consistente com as outras tabelas
-- realtime do sistema, sem custo real numa tabela de 1 linha.
alter table config_sistema replica identity full;

alter publication supabase_realtime add table config_sistema;
