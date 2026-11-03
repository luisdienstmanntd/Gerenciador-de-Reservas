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
// ── Log de auditoria (20261103120000): imutável, retenção 2 anos, view plana ──
await db.exec('reset role');
await db.exec(readFileSync(new URL('20260712120000_desfazer_cancelamento.sql',dir),'utf8'));
await db.exec(readFileSync(new URL('20261103120000_log_auditoria.sql',dir),'utf8'));
await db.exec('set role authenticated');
const logId=await scalar("insert into reservas_log(acao,usuario,dados_depois) values ('CRIAR','Fulano','{\"data\":\"2099-02-01\",\"nomes\":\"A\"}') returning id");
assert.equal(await scalar('select usuario_id::text from reservas_log where id=$1',[logId]),'00000000-0000-0000-0000-000000000001');
assert.equal(await scalar('select count(*)::int from reservas_log where id=$1',[logId]),1);
// UPDATE/DELETE negados (privilégio revogado) — nada muda
await assert.rejects(db.query("update reservas_log set usuario='X' where id=$1",[logId]),e=>e.code==='42501');
await assert.rejects(db.query('delete from reservas_log where id=$1',[logId]),e=>e.code==='42501');
assert.equal(await scalar('select usuario from reservas_log where id=$1',[logId]),'Fulano');
// Ações novas passam; inválida falha
for(const a of ['CRIAR','EDITAR','EXCLUIR','DESBLOQUEAR','CANCELAR','RESTAURAR','RECRIAR','OBSERVAR','NOSHOW','CONFIG','LOGIN','LOGOUT']){
  await db.query('insert into reservas_log(acao,usuario) values ($1,$2)',[a,'T']);
}
await assert.rejects(db.query("insert into reservas_log(acao,usuario) values ('APAGAR','T')"),e=>e.code==='23514');
// Retenção: só apaga > 24 meses; janela menor é ignorada
// criado_em retroativo como authenticated é ignorado (fica now()); semeia datas antigas como papel privilegiado
await db.query("insert into reservas_log(acao,usuario,criado_em) values ('CRIAR','FORJADO',now()-interval '30 months')");
assert.ok(await scalar("select criado_em > now()-interval '1 minute' from reservas_log where usuario='FORJADO'"));
await assert.rejects(db.query("insert into reservas_log(acao,usuario,usuario_id) values ('CRIAR','X','00000000-0000-0000-0000-000000000002')"),e=>e.code==='42501');
await db.exec('reset role');
await db.query("insert into reservas_log(acao,usuario,criado_em) values ('CRIAR','VELHO',now()-interval '25 months'),('CRIAR','MEIO',now()-interval '3 months'),('CRIAR','MEIO2',now()-interval '23 months')");
await db.exec('set role authenticated');
await assert.rejects(db.query('delete from vw_log_auditoria'),e=>e.code==='42501');
await assert.rejects(db.query("update vw_log_auditoria set usuario='X'"),e=>e.code==='42501'||e.code==='55000');
assert.equal(await scalar('select limpar_logs_antigos(1)'),1);
assert.equal(await scalar("select count(*)::int from reservas_log where usuario='MEIO'"),1);
assert.equal(await scalar("select count(*)::int from reservas_log where usuario='MEIO2'"),1);
assert.equal(await scalar("select count(*)::int from reservas_log where usuario='VELHO'"),0);
assert.equal(await scalar('select limpar_logs_antigos()'),0);
// View plana
const editId=await scalar(`insert into reservas_log(acao,usuario,dados_antes,dados_depois) values ('EDITAR','Ana',
  '{"data":"2099-03-05","nomes":"MARIA","horario":"20:00","paxs":2,"chd":0,"obs":"","mesa":"1"}',
  '{"data":"2099-03-05","nomes":"MARIA","horario":"20:30","paxs":4,"chd":0,"obs":"","mesa":"1"}') returning id`);
const edit=(await db.query('select * from vw_log_auditoria where id=$1',[editId])).rows[0];
assert.equal(edit.nomes,'MARIA'); assert.equal(new Date(edit.data_reserva).toISOString().slice(0,10),'2099-03-05');
assert.deepEqual(edit.campos_alterados,['horario','paxs']); assert.equal(edit.paxs,4);
assert.equal(edit.usuario_id,'00000000-0000-0000-0000-000000000001');
const delId=await scalar(`insert into reservas_log(acao,usuario,dados_antes) values ('EXCLUIR','Ana','{"data":"2099-04-01","nomes":"JOSE","apto":"12"}') returning id`);
const del=(await db.query('select * from vw_log_auditoria where id=$1',[delId])).rows[0];
assert.equal(del.nomes,'JOSE'); assert.equal(del.apto,'12'); assert.equal(new Date(del.data_reserva).toISOString().slice(0,10),'2099-04-01'); assert.equal(del.campos_alterados,null);
const cfgId=await scalar(`insert into reservas_log(acao,usuario,dados_depois) values ('CONFIG','Ana','{"capacidade":40,"mesas":[1,2]}') returning id`);
const cfg=(await db.query('select * from vw_log_auditoria where id=$1',[cfgId])).rows[0];
assert.equal(cfg.data_reserva,null); assert.equal(cfg.nomes,null); assert.equal(cfg.paxs,null);
const nsId=await scalar(`insert into reservas_log(acao,usuario,dados_depois) values ('NOSHOW','Ana','{"quantidade":3,"data":"2099-05-02"}') returning id`);
assert.equal(new Date((await db.query('select data_reserva from vw_log_auditoria where id=$1',[nsId])).rows[0].data_reserva).toISOString().slice(0,10),'2099-05-02');
const loId=await scalar(`insert into reservas_log(acao,usuario,dados_depois) values ('LOGIN','Ana','{"paxs":"abc","data":"x"}') returning id`);
assert.equal((await db.query('select paxs,data_reserva from vw_log_auditoria where id=$1',[loId])).rows[0].paxs,null);
const emptyId=await scalar(`insert into reservas_log(acao,usuario,dados_depois) values ('CRIAR','Ana','{"data":""}') returning id`);
assert.equal((await db.query('select data_reserva from vw_log_auditoria where id=$1',[emptyId])).rows[0].data_reserva,null);
await db.exec('reset role; set role anon;');
await assert.rejects(db.query('select limpar_logs_antigos()'),e=>e.code==='42501');
await assert.rejects(db.query('select aplicar_bloqueios_semanais($1)',[future]),e=>e.code==='42501');
console.log('SQL: log de auditoria (autor, imutável, ações, retenção 24m, view) + 20 cenários passaram com RLS/role authenticated: preflight futuro, backfill legado preserva todos campos/hóspedes/avisos/leituras, 5 exceções históricas, chave canônica única, flags forjadas negadas, atualização histórica, realocação/restauração perde exceção, dedup legado e novo, conflito, notificação única, edição, redução, cancelamento, leitura idempotente, semeadura idempotente, ROOM fora grade e RPC negada a anon.');
await db.close();

