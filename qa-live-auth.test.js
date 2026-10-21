// @vitest-environment jsdom
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
const html=readFileSync('index.html','utf8');
let auth,onState;
beforeEach(()=>{
 vi.useFakeTimers();
 const parsed=new DOMParser().parseFromString(html,'text/html');document.body.innerHTML=parsed.body.innerHTML;
 auth={resetPasswordForEmail:vi.fn().mockResolvedValue({}),updateUser:vi.fn().mockResolvedValue({}),signOut:vi.fn(),onAuthStateChange:vi.fn(cb=>{onState=cb;})};
 const source=parsed.querySelector('script[type="module"]:not([src])').textContent.replace(/^\s*import .*;$/gm,'');
 new Function('supabase','recarregarReservas','recarregarNotificacoes','recarregarConfigSistema','carregarHome',source)({auth},vi.fn(),vi.fn(),vi.fn(),vi.fn());
});
afterEach(()=>vi.useRealTimers());
it('preserves password recovery form and valid profile request',async()=>{
 window.mostrarRecuperacaoSenha();expect(document.getElementById('recuperacaoSenha').hidden).toBe(false);
 document.getElementById('recuperacaoUsuario').value='recepcao';await window.solicitarRecuperacaoSenha();
 expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('recepcao@osteriadilucca.app',{redirectTo:expect.stringContaining('?recuperacao=1')});
 expect(document.getElementById('btnEnviarRecuperacao').disabled).toBe(false);
 window.voltarParaLogin();expect(document.getElementById('recuperacaoSenha').hidden).toBe(true);
 expect(document.getElementById('btnEntrar').hidden).toBe(false);
});
it('recovery event opens new password panel and rejects mismatched passwords',async()=>{
 onState('PASSWORD_RECOVERY',{user:{id:'test'}});expect(document.getElementById('telaNovaSenha').hidden).toBe(false);
 document.getElementById('novaSenha').value='new-password';document.getElementById('confirmarNovaSenha').value='different';
 document.getElementById('formNovaSenha').dispatchEvent(new Event('submit',{cancelable:true}));await Promise.resolve();
 expect(auth.updateUser).not.toHaveBeenCalled();expect(document.getElementById('novaSenhaMensagem').textContent).toContain('não conferem');
});
it('new password submission keeps existing update and signout flow',async()=>{
 document.getElementById('novaSenha').value='new-password';document.getElementById('confirmarNovaSenha').value='new-password';
 document.getElementById('formNovaSenha').dispatchEvent(new Event('submit',{cancelable:true}));await Promise.resolve();
 expect(auth.updateUser).toHaveBeenCalledWith({password:'new-password'});await vi.advanceTimersByTimeAsync(1400);
 expect(auth.signOut).toHaveBeenCalled();
});
