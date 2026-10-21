// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
import {db} from './js/core/database.js';
afterEach(()=>vi.restoreAllMocks());
function fakeClient() {
 const updates=[];const inserts=[];
 const fake={from:table=>({
  select:()=>{
   const chain={eq:()=>chain,limit:async()=>({data:[]}),maybeSingle:async()=>({data:table==='reservas'?{hospede_id:'shared'}:{nome:'ANA',tipo:'hospede'}})};return chain;
  },
  insert:cols=>({select:()=>({single:async()=>{inserts.push({table,cols});return {data:{id:'novo'}};}})}),
  update:cols=>({eq:(_key,id)=>{
   const result={data:[{id}]};updates.push({table,cols,id});
   return {then:resolve=>resolve(result),select:async()=>result};
  }})
 })};return {fake,updates,inserts};
}
it('QA12: substituir cliente troca vínculo sem reescrever cadastro compartilhado',async()=>{
 const {fake,updates,inserts}=fakeClient();const old=db.client;db.client=fake;
 try{await db.atualizarReserva('reserva-A',{nomes:'BRUNO',tipo:'externo',horario:'20:00',data:'2027-07-15',paxs:2});}finally{db.client=old;}
 expect(updates.some(x=>x.table==='hospedes')).toBe(false);
 expect(inserts).toContainEqual(expect.objectContaining({table:'hospedes',cols:expect.objectContaining({nome:'BRUNO'})}));
 expect(updates).toContainEqual(expect.objectContaining({table:'reservas',id:'reserva-A',cols:expect.objectContaining({hospede_id:'novo'})}));
});
it('preencher apartamento do mesmo hóspede mantém cadastro e código da reserva',async()=>{
 const {fake,updates}=fakeClient();const old=db.client;db.client=fake;
 try{await db.atualizarReserva('reserva-A',{nomes:'ANA',tipo:'hospede',apto:'101',codigoReserva:'ABC',horario:'20:00',data:'2027-07-15',paxs:2});}finally{db.client=old;}
 expect(updates).toContainEqual(expect.objectContaining({table:'hospedes',id:'shared',cols:expect.objectContaining({apto:'101',codigo_reserva:'ABC'})}));
});
it('UPDATE de zero linhas na camada de banco rejeita',async()=>{
 const old=db.client;db.client={from:()=>({update:()=>({eq:()=>({select:async()=>({data:[]})})})})};
 try{await expect(db.atualizarCamposReserva('r1',{})).rejects.toThrow('não encontrada');}finally{db.client=old;}
});
it('preserva status de recepção do deploy na tradução e na atualização validada',async()=>{
 expect(db._paraReservaApp({id:'r',status_recepcao:'chegou'}).statusRecepcao).toBe('chegou');
 expect(db._paraReservaApp({id:'r'}).statusRecepcao).toBe('aguardando');
 const {fake,updates}=fakeClient();const old=db.client;db.client=fake;
 try{
  await db.atualizarStatusRecepcao('r','no_show');
  await expect(db.atualizarStatusRecepcao('r','invalido')).rejects.toThrow('inválido');
 }finally{db.client=old;}
 expect(updates).toHaveLength(1);expect(updates[0].cols).toEqual({status_recepcao:'no_show'});
});
it('no-show automático preserva chegadas, atendimento, canceladas, vazios e o dia atual',async()=>{
 const base={data:'2026-10-19',status_recepcao:'aguardando',cancelado_em:null,inicio_mesa:null,fim_mesa:null,hospede_id:'h'};
 const rows=[{...base,id:'pendente'},{...base,id:'hoje',data:'2026-10-20'},{...base,id:'chegou',status_recepcao:'chegou'},{...base,id:'cancelada',cancelado_em:'agora'},{...base,id:'iniciada',inicio_mesa:'agora'},{...base,id:'finalizada',fim_mesa:'agora'},{...base,id:'vazia',hospede_id:null}];
 let selecionadas=rows;let cols;
 const query={lt:(key,v)=>{selecionadas=selecionadas.filter(r=>r[key]<v);return query;},eq:(key,v)=>{selecionadas=selecionadas.filter(r=>r[key]===v);return query;},is:(key,v)=>{selecionadas=selecionadas.filter(r=>r[key]===v);return query;},not:(key,_op,v)=>{selecionadas=selecionadas.filter(r=>r[key]!==v);return query;},select:async()=>{selecionadas.forEach(r=>Object.assign(r,cols));return {data:selecionadas};}};
 const old=db.client;db.client={from:()=>({update:c=>{cols=c;return query;}})};
 try{expect(await db.marcarNoShowsAnteriores('2026-10-20')).toBe(1);}finally{db.client=old;}
 expect(rows.filter(r=>r.status_recepcao==='no_show').map(r=>r.id)).toEqual(['pendente']);
});
