-- =========================================================================================
-- OSTERIA DI LUCCA — SCHEMA INICIAL (Fase 2 da migração Firestore → Supabase)
-- Ver plano_de_ação.md para contexto completo.
--
-- Modelo extraído dos campos reais usados em produção (js/features/reservas/service.js,
-- js/core/database.js), não do schema especulativo original do plano.
--
-- Decisões de design (confirmadas com o dono do projeto em 2026-07-09):
--   - hospedes: dedup por (apto, nome) p/ hóspede/roomservice, ou (codigo_reserva, nome)
--     quando o apto ainda não foi atribuído, ou (telefone, nome) para externo/passante.
--     Essa lógica de busca em cascata vive na aplicação (Fase 5), não em constraint do banco.
--   - codigo_reserva é um campo NOVO: hoje (Firestore) o número da reserva feita por
--     telefone/WhatsApp é digitado temporariamente no campo `apto` até o apto ser definido.
--     Nesta migração, os dois viram campos separados — corrige a sobrecarga do campo antigo.
--   - mesas: lista fixa de referência (1–18 + ROOM), sem dado próprio além do identificador.
-- =========================================================================================

-- ── HÓSPEDES / CLIENTES ──────────────────────────────────────────────────────────────────
create table hospedes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  apto text,
  codigo_reserva text,
  telefone text,
  tipo text not null check (tipo in ('hospede', 'externo', 'passante', 'roomservice')),
  criado_em timestamptz not null default now()
);

comment on table hospedes is 'Identificação de quem reservou. Dedup por apto+nome (hóspede/roomservice), codigo_reserva+nome (pré-checkin) ou telefone+nome (externo/passante) — lógica de busca fica na aplicação.';

-- ── MESAS ────────────────────────────────────────────────────────────────────────────────
create table mesas (
  identificador text primary key, -- '1'..'18' ou 'ROOM'
  tipo text not null default 'numerada' check (tipo in ('numerada', 'room_service'))
);

insert into mesas (identificador, tipo)
select generate_series(1, 18)::text, 'numerada'
union all
select 'ROOM', 'room_service';

-- ── RESERVAS (tabela central) ────────────────────────────────────────────────────────────
create table reservas (
  id uuid primary key default gen_random_uuid(),
  hospede_id uuid references hospedes(id),
  mesa_identificador text references mesas(identificador),
  data date not null,
  horario time not null,
  original_base time not null, -- slot/bloco da grade (pode ser diferente de horario — ver §7.1 do prompt.md)
  posicao int not null default 0, -- ordem dentro do slot (metadado de layout da grade, não de negócio)
  paxs int not null default 0,
  chd int not null default 0,
  avulsa text, -- taxa avulsa (tipo externo)
  obs text,
  bloqueado boolean not null default false,
  somente_hospedes boolean not null default false,
  pagamento text check (pagamento in ('pago', 'pendente') or pagamento is null),
  menu_degustacao boolean not null default false,
  inicio_mesa timestamptz,
  fim_mesa timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on column reservas.original_base is 'Define o bloco/slot da grade — equivalente a originalBase no Firestore. Regra crítica: sempre atualizado junto com horario ao mover a reserva (ver prompt.md §7.1).';
comment on column reservas.posicao is 'Posição (linha) dentro do slot na grade visual — não é dado de negócio, é metadado de layout.';

-- ── LOG DE AUDITORIA (equivalente à coleção 'logs') ──────────────────────────────────────
create table reservas_log (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid references reservas(id),
  acao text not null check (acao in ('CRIAR', 'EDITAR', 'EXCLUIR', 'DESBLOQUEAR')),
  usuario text not null,
  dados_antes jsonb,
  dados_depois jsonb,
  criado_em timestamptz not null default now()
);

-- ── CONFIGURAÇÃO DE LINHAS EXTRAS POR DIA (equivalente à coleção 'config_dia') ───────────
create table config_dia (
  data date primary key,
  linhas_extras jsonb not null default '{}'::jsonb
);

-- ── NOTIFICAÇÕES (sino) ───────────────────────────────────────────────────────────────────
create table notificacoes (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  reserva_id uuid references reservas(id),
  lido_por text[] not null default '{}',
  criado_em timestamptz not null default now()
);

-- ── ÍNDICES para consultas analíticas (Dashboard: período, dia da semana, hóspede) ───────
create index idx_reservas_data on reservas(data);
create index idx_reservas_hospede on reservas(hospede_id);
create index idx_reservas_mesa on reservas(mesa_identificador);
create index idx_logs_reserva on reservas_log(reserva_id);
create index idx_notificacoes_reserva on notificacoes(reserva_id);

-- ── TRIGGER: atualiza reservas.atualizado_em automaticamente ─────────────────────────────
create or replace function set_atualizado_em()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_reservas_atualizado_em
  before update on reservas
  for each row
  execute function set_atualizado_em();
