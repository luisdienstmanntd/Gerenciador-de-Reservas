// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest';
import { db } from './js/core/database.js';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it('R1: paginação lê todas as 1141 linhas mesmo com limite de servidor menor que o solicitado', async () => {
    const rows=Array.from({length:1141},(_,i)=>({id:String(i),data:'2026-10-21',horario:'20:00:00',original_base:'20:00:00',paxs:2,hospedes:{nome:'FICTÍCIO',tipo:'hospede'}}));
    const calls=[];
    const chain={select:(_columns,options)=>{expect(options.count).toBe('exact');return chain;},gte:(...args)=>{calls.push(['gte',...args]);return chain;},lte:()=>chain,order:column=>{expect(column).toBe('id');return chain;},range:async(a,b)=>({data:rows.slice(a,Math.min(a+300,b+1)),count:rows.length,error:null})};
    const original=db.client;db.client={from:()=>chain};
    try {
        const result=await db.getReservasPorPeriodo('2026-02-23','2026-11-12');
        expect(result).toHaveLength(1141);expect(calls).toHaveLength(4);expect(new Set(result.map(r=>r.id)).size).toBe(1141);
    } finally { db.client=original; }
});

it.each(['erro','vazia','contagem','duplicada'])('R1: leitura %s falha sem devolver resultado parcial',async(mode)=>{
    let page=0; const original=db.client;
    const chain={select:()=>chain,gte:()=>chain,lte:()=>chain,order:()=>chain,range:async()=>{
        page++;
        if(page===1)return {data:[{id:'r1'}],count:2};
        if(mode==='erro')return {error:new Error('offline')};
        if(mode==='vazia')return {data:[],count:2};
        if(mode==='contagem')return {data:[{id:'r2'}],count:3};
        return {data:[{id:'r1'}],count:2};
    }};db.client={from:()=>chain};
    try{await expect(db.getReservasPorPeriodo('2026-10-20','2026-10-21')).rejects.toBeTruthy();}finally{db.client=original;}
});

it('assinatura observa transferências e reconexão e revisa periodicamente alterações sem evento',async()=>{
    vi.useFakeTimers();
    const original=db.client;const events={},callback=vi.fn(),error=vi.fn();let status;
    const channel={on(_kind,filter,cb){events[filter.table]=cb;expect(filter.filter).toBeUndefined();return this;},subscribe(cb){status=cb;return this;}};
    const removeChannel=vi.fn();db.client={channel:()=>channel,removeChannel};
    try{const stop=db.escutarAlteracoesReservas(callback,error);events.reservas();status('SUBSCRIBED');await vi.advanceTimersByTimeAsync(60000);expect(callback).toHaveBeenCalledTimes(3);expect(events.hospedes).toBeUndefined();status('CHANNEL_ERROR');expect(error).toHaveBeenCalledTimes(1);stop();events.reservas();status('CLOSED');await vi.advanceTimersByTimeAsync(60000);expect(callback).toHaveBeenCalledTimes(3);expect(error).toHaveBeenCalledTimes(1);expect(removeChannel).toHaveBeenCalledWith(channel);}finally{db.client=original;}
});

it('consulta do intervalo descarta resposta antiga e também resultados após unsubscribe',async()=>{
    vi.useFakeTimers();const releases=[];let changed;const callback=vi.fn();
    vi.spyOn(db,'getReservasPorPeriodo').mockImplementation(()=>new Promise(resolve=>releases.push(resolve)));
    vi.spyOn(db,'escutarAlteracoesReservas').mockImplementation(cb=>{changed=cb;return vi.fn();});
    const stop=db.escutarReservasPorPeriodo('2026-10-20','2026-10-26',callback);
    changed();await vi.advanceTimersByTimeAsync(150);
    releases[1]([{id:'novo'}]);await Promise.resolve();releases[0]([{id:'antigo'}]);await Promise.resolve();
    expect(callback).toHaveBeenCalledExactlyOnceWith([{id:'novo'}]);
    changed();await vi.advanceTimersByTimeAsync(150);stop();releases[2]([{id:'depois'}]);await Promise.resolve();expect(callback).toHaveBeenCalledTimes(1);
});

it('grade atualiza origem quando outro dispositivo transfere reserva para fora do dia',async()=>{
    let changed;const original=db.client;const callback=vi.fn();
    const channel={on(_kind,filter,cb){expect(filter.filter).toBeUndefined();changed=cb;return this;},subscribe(){return this;}};
    vi.spyOn(db,'getReservasPorData').mockResolvedValueOnce([{id:'r',data:'2026-10-20'}]).mockResolvedValueOnce([]);
    db.client={channel:()=>channel,removeChannel:vi.fn()};
    try {const stop=db.escutarReservasPorDataComMudancas('2026-10-20',callback,vi.fn());await Promise.resolve();
        expect(callback).toHaveBeenLastCalledWith([{id:'r',data:'2026-10-20'}]);
        await changed({eventType:'UPDATE',new:{id:'r',data:'2026-10-22'}});await Promise.resolve();expect(callback).toHaveBeenLastCalledWith([]);stop();
    }finally{db.client=original;}
});

it('OK: tradução do banco preserva data, tipo, PAX, crianças, cancelamento e horário curto', () => {
    expect(db._paraReservaApp({id:'r',data:'2026-10-21',horario:'20:30:00',original_base:'20:00:00',paxs:2,chd:1,cancelado_em:'2026-10-21T15:00:00Z',hospedes:{nome:'FICTÍCIO',tipo:'externo'}}))
        .toMatchObject({data:'2026-10-21',horario:'20:30',originalBase:'20:00',paxs:2,chd:1,canceladoEm:'2026-10-21T15:00:00Z',tipo:'externo'});
});
