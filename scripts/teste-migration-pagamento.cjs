const {PGlite}=require('@electric-sql/pglite');
const fs=require('fs');
(async()=>{
 const db=new PGlite();
 await db.exec("create table public.reservas(id int primary key, pagamento text constraint reservas_pagamento_check check(pagamento in ('pago','pendente') or pagamento is null)); insert into reservas values (1,'pago'),(2,null)");
 const sql=fs.readFileSync('supabase/migrations/20261105012710_pagamento_direto.sql','utf8');
 await db.exec(sql); await db.exec(sql); await db.exec("insert into reservas values (3,'direto'),(4,'pendente')");
 const r=await db.query('select count(*)::int n from reservas'); if(r.rows[0].n!==4) throw Error('Dados perdidos');
 let rejeitado=false; try { await db.exec("insert into reservas values (5,'invalido')"); } catch { rejeitado=true; }
 if(!rejeitado) throw Error('Valor inválido aceito');
 console.log('Migration idempotente, dados preservados e restrição verificada.'); await db.close();
})().catch(e=>{console.error(e);process.exitCode=1});
