const fs=require('fs'),assert=require('assert');
const {JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://localhost/'});
 global.document=dom.window.document; global.window=dom.window; global.getDataAtual=()=> '2026-11-04';
 let src=fs.readFileSync('js/features/reservas/modal.js','utf8').replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];/g,'');
 const {ReservaModal}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
 const modal=new ReservaModal(),e=modal.elementos;
 const opcoes=[...e.pagamento.options].map(x=>x.value); assert.deepEqual(opcoes,['pendente','pago','direto']);
 let r={id:'1',tipo:'externo',pagamento:'',data:'2026-11-04',horario:'20:00'};
 modal._reservaContexto=r; modal._preencherFormulario(r); assert.equal(e.pagamento.value,'direto'); assert.equal(modal.obterDados().pagamento,'direto');
 r={...r,tipo:'passante',pagamento:'direto'};modal._reservaContexto=r;modal._preencherFormulario(r);assert.equal(modal.obterDados().pagamento,'direto');
 r={...r,tipo:'externo',pagamento:'pago'};modal._reservaContexto=r;modal._preencherFormulario(r);e.tipoCliente.value='hospede';assert.equal(modal.obterDados().pagamento,'');
 dom.window.close(); console.log('Modal: opções, legado externo, passante e troca de perfil verificados.');
})().catch(e=>{console.error(e);process.exitCode=1});
