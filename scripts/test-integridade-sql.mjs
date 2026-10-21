import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
create publication supabase_realtime;`);
const dir=new URL('../supabase/migrations/',import.meta.url);
for(const name of ['20260709133321_initial_schema.sql','20260709135200_rls_policies.sql','20260709140241_grants_authenticated.sql','20260711120000_cancelamento_reserva.sql','20260710140000_bloqueio_automatico.sql','20260710160000_config_sistema.sql','20260716120000_bloqueios_semanais.sql']){
 await db.exec(readFileSync(new URL(name,dir),'utf8'));
}
const migration=readFileSync(new URL('20261021005822_corrigir_integridade_reservas_notificacoes.sql',dir),'utf8');
await db.exec("insert into reservas(data,horario,original_base,posicao,bloqueado) values ('2099-01-01','20:00','20:00',0,true),('2099-01-01','20:00','20:00',0,true)");
await assert.rejects(db.exec(migration),e=>e.message.includes('Existem reservas/bloqueios ativos'));
await db.exec('rollback');
assert.equal((await db.query("select count(*)::int as n from reservas where data='2099-01-01'")).rows[0].n,2);
await db.exec("delete from reservas where data='2099-01-01'");
// Fixture legada: 9 reservas em 4 posições de dias passados (5 excedentes),
// 3 avisos/leituras da mesma reserva e uma coluna de produção desconhecida.
await db.exec("alter table reservas add column status_recepcao text default 'CONFIRMADA'");
const pastGuest=(await db.query("insert into hospedes(nome,tipo,apto) values ('CLIENTE LEGADO','hospede','101') returning id")).rows[0].id;
await db.query(`insert into reservas(hospede_id,data,horario,original_base,posicao,paxs,criado_em,atualizado_em,status_recepcao)
  select $1, (now() at time zone 'America/Sao_Paulo')::date - grupo, '20:00','20:00',0,2,
         '2026-01-01T12:00:00Z'::timestamptz + (grupo*10+i)*interval '1 minute',
         '2026-01-01T12:00:00Z'::timestamptz, 'LEGADO ' || grupo || '/' || i
  from generate_series(7,10) grupo cross join generate_series(1,3) i
  where i <= case when grupo=7 then 3 else 2 end`,[pastGuest]);
const pastReservation=(await db.query("select id from reservas order by criado_em limit 1")).rows[0].id;
await db.query("insert into notificacoes(texto,reserva_id,lido_por,criado_em) values ('Aviso 1',$1,array['recepcao'],'2026-01-01T12:00:00Z'),('Aviso 2',$1,array['osteria'],'2026-01-01T12:01:00Z'),('Aviso 3',$1,array['gerencia'],'2026-01-01T12:02:00Z')",[pastReservation]);
const snapshotReservations=(await db.query('select to_jsonb(r) as r from reservas r order by id')).rows.map(row=>row.r);
const snapshotGuests=(await db.query('select * from hospedes order by id')).rows;
const snapshotNotices=(await db.query('select to_jsonb(n) as n from notificacoes n order by id')).rows.map(row=>row.n);
await db.exec(migration);
assert.deepEqual((await db.query('select to_jsonb(r) - array[\'fora_grade_roomservice\',\'conflito_posicao_legado\'] as r from reservas r order by id')).rows.map(row=>row.r),snapshotReservations);
assert.deepEqual((await db.query('select * from hospedes order by id')).rows,snapshotGuests);
assert.deepEqual((await db.query('select to_jsonb(n) - \'evento_reserva_id\' as n from notificacoes n order by id')).rows.map(row=>row.n),snapshotNotices);
assert.equal((await db.query('select count(*)::int as n from reservas where conflito_posicao_legado')).rows[0].n,5);
assert.equal((await db.query('select count(*)::int as n from notificacoes where evento_reserva_id is not null')).rows[0].n,1);
await db.exec('grant usage on schema auth to authenticated; set role authenticated;');
const scalar=async(sql,params=[])=>Object.values((await db.query(sql,params)).rows[0])[0];
// Cliente não pode conceder exceção nem apagar chave canônica para burlar índices.
await assert.rejects(db.query("insert into reservas(hospede_id,data,horario,original_base,posicao,conflito_posicao_legado) select hospede_id,data,horario,original_base,posicao,true from reservas where id=$1",[pastReservation]),e=>e.code==='23505');
await db.query('update reservas set conflito_posicao_legado=true where id=$1',[pastReservation]);
assert.equal(await scalar('select conflito_posicao_legado from reservas where id=$1',[pastReservation]),false);
const exceptionId=await scalar('select id from reservas where conflito_posicao_legado order by criado_em limit 1');
await db.query("update reservas set obs='INFORMAÇÃO ADICIONAL',conflito_posicao_legado=false where id=$1",[exceptionId]);
assert.equal(await scalar('select conflito_posicao_legado from reservas where id=$1',[exceptionId]),true);
await db.query('update reservas set posicao=4,conflito_posicao_legado=true where id=$1',[exceptionId]);
assert.equal(await scalar('select conflito_posicao_legado from reservas where id=$1',[exceptionId]),false);
await db.query('update reservas set cancelado_em=now() where id=(select id from reservas where conflito_posicao_legado order by criado_em limit 1)');
const cancelledLegacy=await scalar('select id from reservas where cancelado_em is not null limit 1');
assert.equal(await scalar('select conflito_posicao_legado from reservas where id=$1',[cancelledLegacy]),false);
await assert.rejects(db.query('update reservas set cancelado_em=null,conflito_posicao_legado=true where id=$1',[cancelledLegacy]),e=>e.code==='23505');
await db.query('update notificacoes set evento_reserva_id=null where reserva_id=$1',[pastReservation]);
assert.equal(await scalar('select count(*)::int from notificacoes where evento_reserva_id=$1',[pastReservation]),1);
await assert.rejects(db.query("insert into notificacoes(texto,reserva_id,evento_reserva_id) values ('Duplicada',$1,null)",[pastReservation]),e=>e.code==='23505');
await db.query('select marcar_notificacao_lida(id,\'recepcao\') from notificacoes where reserva_id=$1',[pastReservation]);
assert.equal(await scalar('select count(*)::int from notificacoes where reserva_id=$1',[pastReservation]),3);
const guest=await scalar("insert into hospedes(nome,tipo) values ('TESTE','hospede') returning id");
const reserva=await scalar("insert into reservas(hospede_id,data,horario,original_base,posicao,paxs) values ($1,(now() at time zone 'America/Sao_Paulo')::date,'20:00','20:00',0,6) returning id",[guest]);
assert.equal(await scalar('select count(*)::int from notificacoes where reserva_id=$1',[reserva]),1);
await db.query('update reservas set paxs=5 where id=$1',[reserva]);
assert.equal(await scalar('select count(*)::int from notificacoes where reserva_id=$1',[reserva]),1);
await assert.rejects(db.query("insert into reservas(hospede_id,data,horario,original_base,posicao) values ($1,(now() at time zone 'America/Sao_Paulo')::date,'20:00','20:00',0)",[guest]),e=>e.code==='23505');
await db.query("insert into reservas(data,horario,original_base,posicao,bloqueado,bloqueio_origem_id) select data,'20:00','20:00',i,true,id from reservas cross join generate_series(1,2) i where id=$1",[reserva]);
await db.query('update reservas set paxs=4 where id=$1',[reserva]);
assert.equal(await scalar('select count(*)::int from reservas where bloqueio_origem_id=$1',[reserva]),1);
await db.query('update reservas set cancelado_em=now() where id=$1',[reserva]);
assert.equal(await scalar('select count(*)::int from reservas where bloqueio_origem_id=$1',[reserva]),0);
const notice=await scalar('select id from notificacoes where reserva_id=$1',[reserva]);
await Promise.all(['recepcao','osteria'].map(user=>db.query('select marcar_notificacao_lida($1,$2)',[notice,user])));
await db.query("select marcar_notificacao_lida($1,'recepcao')",[notice]);
assert.deepEqual((await db.query('select lido_por from notificacoes where id=$1',[notice])).rows[0].lido_por.sort(),['osteria','recepcao']);
const future=await scalar("select ((now() at time zone 'America/Sao_Paulo')::date + 7)::text");
await db.query("update config_sistema set bloqueios_semanais=jsonb_build_object(extract(dow from $1::date)::integer::text,jsonb_build_object('20:00',2)) where id=1",[future]);
const results=await Promise.all([db.query('select aplicar_bloqueios_semanais($1)',[future]),db.query('select aplicar_bloqueios_semanais($1)',[future])]);
assert.deepEqual(results.map(r=>r.rows[0].aplicar_bloqueios_semanais),[2,0]);
assert.equal(await scalar('select count(*)::int from reservas where data=$1',[future]),2);
const room=await scalar("insert into hospedes(nome,tipo) values ('ROOM TESTE','roomservice') returning id");
await db.query("insert into reservas(hospede_id,data,horario,original_base,posicao) values ($1,$2,'20:00','20:00',0),($1,$2,'20:00','20:00',0)",[room,future]);
assert.equal(await scalar('select count(*)::int from reservas where data=$1 and fora_grade_roomservice',[future]),2);
await db.exec('reset role; set role anon;');
await assert.rejects(db.query('select aplicar_bloqueios_semanais($1)',[future]),e=>e.code==='42501');
console.log('SQL: 20 cenários passaram com RLS/role authenticated: preflight futuro, backfill legado preserva todos campos/hóspedes/avisos/leituras, 5 exceções históricas, chave canônica única, flags forjadas negadas, atualização histórica, realocação/restauração perde exceção, dedup legado e novo, conflito, notificação única, edição, redução, cancelamento, leitura idempotente, semeadura idempotente, ROOM fora grade e RPC negada a anon.');
await db.close();

