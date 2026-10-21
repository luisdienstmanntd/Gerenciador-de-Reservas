-- Aplicar antes do novo frontend. Não elimina registros conflitantes.
-- Se o preflight falhar, revisar os IDs com a equipe e resolver os conflitos
-- explicitamente; executar novamente só depois de uma cópia de segurança.
begin;

-- O tipo vive em hospedes; materializa somente a participação na grade para
-- permitir um índice parcial (Postgres não permite JOIN no predicado do índice).
alter table public.reservas add column fora_grade_roomservice boolean not null default false;
update public.reservas r set fora_grade_roomservice = true
from public.hospedes h where h.id = r.hospede_id and h.tipo = 'roomservice';
create function public.classificar_grade_reserva()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.fora_grade_roomservice := coalesce((select tipo = 'roomservice' from public.hospedes where id = new.hospede_id), false);
  return new;
end $$;
create trigger trg_classificar_grade_reserva before insert or update on public.reservas
for each row execute function public.classificar_grade_reserva();

do $$
begin
  if exists (
    select 1 from public.reservas
    where cancelado_em is null and not fora_grade_roomservice and (hospede_id is not null or bloqueado or somente_hospedes)
    group by data, original_base, posicao having count(*) > 1
  ) then
    raise exception 'Existem reservas/bloqueios ativos na mesma posição. Consulte data, original_base, posicao, array_agg(id) agrupados com count(*) > 1 e resolva os conflitos antes de aplicar esta migration. Nenhuma reserva foi removida.';
  end if;
  if exists (select 1 from public.notificacoes where reserva_id is not null group by reserva_id having count(*) > 1) then
    raise exception 'Existem notificações duplicadas por reserva_id. Revise os IDs e as leituras antes de aplicar esta migration. Nenhuma notificação foi removida.';
  end if;
end $$;

create unique index reservas_posicao_ativa_unica
on public.reservas (data, original_base, posicao)
where cancelado_em is null and not fora_grade_roomservice and (hospede_id is not null or bloqueado or somente_hospedes);

create unique index notificacoes_reserva_unica
on public.notificacoes (reserva_id) where reserva_id is not null;

-- Soft-delete deve liberar os bloqueios na mesma transação da reserva.
-- Também remove vínculos que já não pertencem ao bloco/quantidade atual.
create function public.limpar_bloqueios_reserva()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.cancelado_em is not null
      or new.data is distinct from old.data
      or new.original_base is distinct from old.original_base then
    delete from public.reservas where bloqueio_origem_id = new.id;
  elsif new.paxs < old.paxs then
    delete from public.reservas
    where bloqueio_origem_id = new.id
      and (posicao <= new.posicao or posicao > new.posicao + greatest(0, new.paxs / 2 - 1));
  end if;
  return new;
end $$;
create trigger trg_limpar_bloqueios_reserva after update of cancelado_em, data, original_base, paxs
on public.reservas for each row execute function public.limpar_bloqueios_reserva();

-- Uma transação por data, flag e INSERTs juntos. Se qualquer etapa falhar,
-- o rollback deixa a data disponível para uma tentativa posterior.
create function public.aplicar_bloqueios_semanais(p_data date)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  regras jsonb;
  regra record;
  semeada boolean;
  quantidade integer;
  pos integer;
  inseridos integer;
  criados integer := 0;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória' using errcode = '42501'; end if;
  if p_data is null or p_data < (now() at time zone 'America/Sao_Paulo')::date then return 0; end if;
  select bloqueios_semanais -> extract(dow from p_data)::integer::text into regras
    from public.config_sistema where id = 1;
  if regras is null or regras = '{}'::jsonb then return 0; end if;
  insert into public.config_dia(data) values (p_data) on conflict (data) do nothing;
  select bloqueios_semanais_aplicados into semeada from public.config_dia where data = p_data for update;
  if semeada then return 0; end if;
  for regra in select key, value from jsonb_each_text(regras) order by key loop
    quantidade := least(3, greatest(0, regra.value::integer));
    for pos in 0..2 loop
      exit when quantidade <= 0;
      if not exists (
        select 1 from public.reservas where data = p_data and original_base = regra.key::time
          and posicao = pos and cancelado_em is null and not fora_grade_roomservice
          and (hospede_id is not null or bloqueado or somente_hospedes)
      ) then
        insert into public.reservas(data, horario, original_base, posicao, bloqueado, obs)
        values (p_data, regra.key::time, regra.key::time, pos, true, 'somente hóspedes')
        on conflict do nothing;
        get diagnostics inseridos = row_count;
        criados := criados + inseridos;
        quantidade := quantidade - inseridos;
      end if;
    end loop;
  end loop;
  update public.config_dia set bloqueios_semanais_aplicados = true where data = p_data;
  return criados;
end $$;

create function public.marcar_notificacao_lida(p_id uuid, p_usuario text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare afetadas integer;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória' using errcode = '42501'; end if;
  if p_usuario is null or btrim(p_usuario) = '' then raise exception 'Usuário obrigatório'; end if;
  update public.notificacoes
    set lido_por = case when p_usuario = any(coalesce(lido_por, '{}'::text[])) then lido_por
                       else array_append(coalesce(lido_por, '{}'::text[]), p_usuario) end
    where id = p_id;
  get diagnostics afetadas = row_count;
  return afetadas = 1;
end $$;

-- O servidor emite uma vez; clientes apenas exibem a lista.
create function public.notificar_nova_reserva()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare cliente public.hospedes%rowtype; rotulo text;
begin
  if new.data <> (now() at time zone 'America/Sao_Paulo')::date
     or new.cancelado_em is not null or new.bloqueado or new.somente_hospedes or new.hospede_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.hospede_id is not null then return new; end if;
  select * into cliente from public.hospedes where id = new.hospede_id;
  if cliente.nome is null or btrim(cliente.nome) = '' then return new; end if;
  rotulo := case cliente.tipo when 'hospede' then 'Hóspede' when 'externo' then 'Externo'
               when 'passante' then 'Passante' when 'roomservice' then 'Room Service' else cliente.tipo end;
  insert into public.notificacoes(texto, reserva_id)
    values (to_char(new.horario, 'HH24:MI') || '  ·  ' || rotulo || '  ·  ' || cliente.nome, new.id)
    on conflict do nothing;
  return new;
end $$;
create trigger trg_notificar_nova_reserva after insert or update of hospede_id
on public.reservas for each row execute function public.notificar_nova_reserva();

revoke execute on function public.aplicar_bloqueios_semanais(date) from public, anon;
revoke execute on function public.marcar_notificacao_lida(uuid, text) from public, anon;
revoke execute on function public.limpar_bloqueios_reserva() from public, anon;
revoke execute on function public.notificar_nova_reserva() from public, anon;
revoke execute on function public.classificar_grade_reserva() from public, anon;
grant execute on function public.aplicar_bloqueios_semanais(date) to authenticated;
grant execute on function public.marcar_notificacao_lida(uuid, text) to authenticated;
grant execute on function public.limpar_bloqueios_reserva() to authenticated;
grant execute on function public.notificar_nova_reserva() to authenticated;
grant execute on function public.classificar_grade_reserva() to authenticated;
commit;
