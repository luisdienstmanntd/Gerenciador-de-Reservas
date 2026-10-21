// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
vi.mock('./js/core/database.js',()=>({db:{aguardarInicializacao:vi.fn(),escutarConfigDia:vi.fn(()=>()=>{}),escutarReservasPorDataComMudancas:vi.fn(()=>()=>{}),salvarNotificacao:vi.fn(),escutarNotificacoesNaoLidas:vi.fn(()=>()=>{}),getClient:vi.fn()}}));
vi.mock('./js/ui/render.js',()=>({renderizarGrid:vi.fn(),atualizarMiniCards:vi.fn()}));
vi.mock('./js/features/reservas/service.js',()=>({aplicarBloqueiosSemanais:vi.fn().mockResolvedValue(0)}));
import {db} from './js/core/database.js';
it('QA10: usuario do log e sino acompanha login sem recarregar pagina',async()=>{
 localStorage.removeItem('usuario_nome');
 const listener=await import('./js/features/reservas/listener.js');
 const {registrarLog}=await import('./js/features/reservas/log.js');
 const insert=vi.fn().mockResolvedValue({});db.getClient.mockReturnValue({from:()=>({insert})});
 localStorage.setItem('usuario_nome','recepcao');
 db.aguardarInicializacao.mockResolvedValue(undefined);
 listener.recarregarNotificacoes();await Promise.resolve();await Promise.resolve();
 await registrarLog('CRIAR',null,{id:'r1',nomes:'ANA'});
 expect(db.escutarNotificacoesNaoLidas).toHaveBeenCalledWith('recepcao',expect.any(Function));
 expect(insert).toHaveBeenCalledWith(expect.objectContaining({usuario:'recepcao'}));
 localStorage.setItem('usuario_nome','osteria');
 listener.recarregarNotificacoes();await Promise.resolve();await Promise.resolve();
 await registrarLog('EDITAR',{id:'r1'},{id:'r1',nomes:'BRUNO'});
 expect(db.escutarNotificacoesNaoLidas).toHaveBeenLastCalledWith('osteria',expect.any(Function));
 expect(insert).toHaveBeenLastCalledWith(expect.objectContaining({usuario:'osteria'}));
});
it('QA11: tablets nao geram notificacoes extras ao receber INSERT',async()=>{
 const listener=await import('./js/features/reservas/listener.js');
 await listener.escutarReservas('2027-07-15');
 const callback=db.escutarReservasPorDataComMudancas.mock.calls.at(-1)[2];
 const changes=[{type:'added',depois:{id:'r1',nomes:'ANA',horario:'20:00',tipo:'hospede'}}];
 callback(changes);callback(changes);await Promise.resolve();
 expect(db.salvarNotificacao).not.toHaveBeenCalled();
});
