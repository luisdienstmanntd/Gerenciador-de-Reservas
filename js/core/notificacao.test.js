// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    notificar,
    notificarSucesso,
    notificarAviso,
    notificarErro,
    notificarErrosValidacao,
} from './notificacao.js';

beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('notificar', () => {
    it('cria o container de toasts uma única vez e anexa o toast nele', () => {
        notificar('sucesso', 'Primeira');
        notificar('erro', 'Segunda');
        const containers = document.querySelectorAll('#toast-container');
        expect(containers.length).toBe(1);
        expect(containers[0].children.length).toBe(2);
    });

    it('exibe o rótulo do tipo em caixa alta e a mensagem', () => {
        const toast = notificar('aviso', 'Capacidade quase cheia');
        expect(toast.innerHTML).toContain('AVISO');
        expect(toast.innerHTML).toContain('Capacidade quase cheia');
    });

    it('usa a cor de acento do tipo na borda esquerda', () => {
        const sucesso = notificar('sucesso', 'ok');
        const erro = notificar('erro', 'falhou');
        expect(sucesso.style.borderLeft).toContain('rgb(39, 174, 96)');   // #27ae60
        expect(erro.style.borderLeft).toContain('rgb(231, 76, 60)');      // #e74c3c
    });

    it('remove o toast sozinho após a duração padrão do tipo', () => {
        notificar('sucesso', 'some sozinho'); // padrão sucesso = 3000ms
        expect(document.querySelectorAll('#toast-container > div').length).toBe(1);
        vi.advanceTimersByTime(3000 + 200); // duração + animação de saída
        expect(document.querySelectorAll('#toast-container > div').length).toBe(0);
    });

    it('duração 0 = não fecha sozinho (só ao clicar)', () => {
        const toast = notificar('aviso', 'persistente', 0);
        vi.advanceTimersByTime(60000);
        expect(document.contains(toast)).toBe(true);
        toast.click();
        vi.advanceTimersByTime(200); // animação de saída
        expect(document.contains(toast)).toBe(false);
    });

    it('adapta as cores no dark mode', () => {
        document.body.classList.add('dark-theme');
        const toast = notificar('sucesso', 'escuro');
        expect(toast.style.background).toContain('rgb(45, 45, 45)'); // #2d2d2d
    });
});

describe('atalhos tipados', () => {
    it('notificarSucesso/notificarAviso/notificarErro delegam pro tipo certo', () => {
        expect(notificarSucesso('a').innerHTML).toContain('SUCESSO');
        expect(notificarAviso('b').innerHTML).toContain('AVISO');
        expect(notificarErro('c').innerHTML).toContain('ERRO');
    });
});

describe('notificarErrosValidacao', () => {
    it('lista cada erro com bullet e quebra de linha, sem fechar sozinho', () => {
        notificarErrosValidacao(['Nome é obrigatório', 'Horário inválido']);
        const toast = document.querySelector('#toast-container > div');
        expect(toast.innerHTML).toContain('• Nome é obrigatório');
        expect(toast.innerHTML).toContain('• Horário inválido');
        expect(toast.innerHTML).toContain('<br>');
        vi.advanceTimersByTime(60000);
        expect(document.contains(toast)).toBe(true); // duração 0 — só fecha ao clicar
    });
});
