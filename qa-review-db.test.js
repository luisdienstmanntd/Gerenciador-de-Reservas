// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {db} from './js/core/database.js';
it('RV05 leitura é delegada a UPDATE atômico no servidor',async()=>{
 const original=db.client;const rpc=vi.fn().mockResolvedValue({data:true});db.client={rpc};
 try{await Promise.all([db.marcarNotificacaoLida('n','recepcao'),db.marcarNotificacaoLida('n','osteria')]);}finally{db.client=original;}
 expect(rpc).toHaveBeenCalledWith('marcar_notificacao_lida',{p_id:'n',p_usuario:'recepcao'});
 expect(rpc).toHaveBeenCalledWith('marcar_notificacao_lida',{p_id:'n',p_usuario:'osteria'});
});
it('RV04b removing channel suppresses old pending HTTP callback',async()=>{
 const original=db.client;let release;
 const deferred=new Promise(r=>{release=r;});const channel={on(){return this;},subscribe(){return this;}};
 const callback=vi.fn();const removeChannel=vi.fn();
 db.client={from:()=>({select:()=>({eq:()=>deferred})}),channel:()=>channel,removeChannel};
 try{
  const stop=db.escutarReservasPorDataComMudancas('2026-10-20',callback,vi.fn());stop();
  release({data:[{id:'old',data:'2026-10-20',hospedes:{nome:'ANA'}}]});
  await deferred;await Promise.resolve();await Promise.resolve();
  expect(removeChannel).toHaveBeenCalledWith(channel);expect(callback).not.toHaveBeenCalled();
 }finally{db.client=original;}
});
