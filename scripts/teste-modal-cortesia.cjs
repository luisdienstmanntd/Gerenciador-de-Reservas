const fs=require('fs'),assert=require('assert');
const {JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://localhost/'});global.document=dom.window.document;global.window=dom.window;global.getDataAtual=()=> '2026-11-04';
 let src=fs.readFileSync('js/features/reservas/modal.js','utf8').replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];/g,'');
 const {ReservaModal}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));const modal=new ReservaModal(),e=modal.elementos;
 e.tipoCliente.value='cortesia';modal._toggleCampos();
 assert.equal(e.containerWhatsapp.style.display,'block');assert.equal(e.containerApto.style.display,'none');assert.equal(e.campoSinal.style.display,'none');
 assert.equal(e.containerExterno.style.display,'none');assert.notEqual(e.checkMenuDegustacao.style.display,'none');
 e.nomes.value='TESTE';e.whatsapp.value='(51) 99999-9999';assert.equal(modal.obterDados().tipo,'cortesia');
 dom.window.close();console.log('Modal de Cortesia: tipo, WhatsApp, degustação e campos ocultos verificados.');
})().catch(e=>{console.error(e);process.exitCode=1});
