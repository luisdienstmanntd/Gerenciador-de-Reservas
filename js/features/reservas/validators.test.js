// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
    validarNaoVazio,
    validarTelefone,
    validarApartamento,
    validarPax,
    validarCriancas,
    validarHorario,
    validarReserva,
    formatarTelefone,
    formatarValorMonetario,
    validarCapacidade,
    escapeHtml,
    destacarCamposInvalidos,
    limparHighlightCampos,
} from './validators.js';

describe('validarNaoVazio', () => {
    it('rejeita string vazia', () => {
        expect(validarNaoVazio('')).toBeFalsy();
    });

    it('rejeita string só com espaços', () => {
        expect(validarNaoVazio('   ')).toBeFalsy();
    });

    it('aceita texto com conteúdo real', () => {
        expect(validarNaoVazio('JOÃO')).toBeTruthy();
    });
});

describe('validarTelefone', () => {
    it('aceita vazio (telefone é opcional)', () => {
        expect(validarTelefone('')).toBe(true);
    });

    it('aceita formato correto (XX) XXXXX-XXXX', () => {
        expect(validarTelefone('(54) 99999-8888')).toBe(true);
    });

    it('rejeita formato sem parênteses', () => {
        expect(validarTelefone('54 99999-8888')).toBe(false);
    });

    it('rejeita número incompleto', () => {
        expect(validarTelefone('(54) 9999-888')).toBe(false);
    });
});

describe('validarApartamento', () => {
    it('aceita vazio (opcional para externos/passantes)', () => {
        expect(validarApartamento('')).toBe(true);
    });

    it('aceita apenas dígitos', () => {
        expect(validarApartamento('101')).toBe(true);
    });

    it('rejeita letras misturadas', () => {
        expect(validarApartamento('101A')).toBe(false);
    });
});

describe('validarPax', () => {
    it('rejeita zero adultos', () => {
        expect(validarPax(0)).toBe(false);
    });

    it('aceita 1 adulto (mínimo)', () => {
        expect(validarPax(1)).toBe(true);
    });

    it('aceita 20 adultos (máximo)', () => {
        expect(validarPax(20)).toBe(true);
    });

    it('rejeita 21 adultos (acima do máximo)', () => {
        expect(validarPax(21)).toBe(false);
    });

    it('rejeita valores não numéricos', () => {
        expect(validarPax('abc')).toBe(false);
    });

    it('rejeita negativos', () => {
        expect(validarPax(-1)).toBe(false);
    });
});

describe('validarCriancas', () => {
    it('aceita zero (nenhuma criança)', () => {
        expect(validarCriancas(0)).toBe(true);
    });

    it('aceita 10 (máximo)', () => {
        expect(validarCriancas(10)).toBe(true);
    });

    it('rejeita 11 (acima do máximo)', () => {
        expect(validarCriancas(11)).toBe(false);
    });

    it('rejeita negativos', () => {
        expect(validarCriancas(-1)).toBe(false);
    });
});

describe('validarHorario', () => {
    it('aceita horário válido no formato HH:MM', () => {
        expect(validarHorario('20:30')).toBe(true);
    });

    it('aceita meia-noite (00:00)', () => {
        expect(validarHorario('00:00')).toBe(true);
    });

    it('aceita a última hora do dia (23:59)', () => {
        expect(validarHorario('23:59')).toBe(true);
    });

    it('rejeita hora inválida (24:00)', () => {
        expect(validarHorario('24:00')).toBe(false);
    });

    it('rejeita minuto inválido (20:60)', () => {
        expect(validarHorario('20:60')).toBe(false);
    });

    it('rejeita vazio', () => {
        expect(validarHorario('')).toBe(false);
    });

    it('rejeita formato sem zero à esquerda', () => {
        expect(validarHorario('9:30')).toBe(false);
    });
});

describe('validarReserva', () => {
    const base = { tipo: 'passante', nomes: 'MARIA', horario: '20:00', paxs: 2, chd: 0 };

    it('aprova uma reserva completa e válida', () => {
        const resultado = validarReserva(base);
        expect(resultado.valido).toBe(true);
        expect(resultado.erros).toEqual([]);
    });

    it('reprova sem nome (e não é bloqueio)', () => {
        const resultado = validarReserva({ ...base, nomes: '' });
        expect(resultado.valido).toBe(false);
        expect(resultado.erros).toContain('Nome do cliente é obrigatório');
    });

    it('aprova bloqueio sem nome', () => {
        const resultado = validarReserva({ ...base, nomes: '', bloqueado: true });
        expect(resultado.erros).not.toContain('Nome do cliente é obrigatório');
    });

    it('reprova hóspede sem apto (não é bloqueio)', () => {
        const resultado = validarReserva({ ...base, tipo: 'hospede', apto: '' });
        expect(resultado.erros).toContain('Hóspede exige número de apartamento');
    });

    it('aprova bloqueio sem apto, mesmo com tipo hospede (default do form)', () => {
        const resultado = validarReserva({ ...base, tipo: 'hospede', nomes: '', apto: '', bloqueado: true });
        expect(resultado.valido).toBe(true);
        expect(resultado.erros).not.toContain('Hóspede exige número de apartamento');
    });

    it('aprova somenteHospedes sem apto, mesmo com tipo hospede', () => {
        const resultado = validarReserva({ ...base, tipo: 'hospede', nomes: '', apto: '', somenteHospedes: true });
        expect(resultado.erros).not.toContain('Hóspede exige número de apartamento');
    });

    it('reprova horário inválido', () => {
        const resultado = validarReserva({ ...base, horario: '99:99' });
        expect(resultado.erros).toContain('Horário inválido');
    });

    it('reprova paxs = 0', () => {
        const resultado = validarReserva({ ...base, paxs: 0 });
        expect(resultado.erros).toContain('Quantidade de adultos inválida (mínimo 1)');
    });

    it('exige apartamento para hóspede', () => {
        const resultado = validarReserva({ ...base, tipo: 'hospede', apto: '' });
        expect(resultado.erros).toContain('Hóspede exige número de apartamento');
    });

    it('exige apartamento para room service', () => {
        const resultado = validarReserva({ ...base, tipo: 'roomservice', apto: '' });
        expect(resultado.erros).toContain('Room Service exige número de apartamento');
    });

    it('não exige apartamento para externo/passante', () => {
        const resultado = validarReserva({ ...base, tipo: 'passante', apto: '' });
        expect(resultado.erros).not.toContain('Room Service exige número de apartamento');
        expect(resultado.erros).not.toContain('Hóspede exige número de apartamento');
    });

    it('reprova telefone em formato inválido quando preenchido', () => {
        const resultado = validarReserva({ ...base, whatsapp: '5499998888' });
        expect(resultado.erros).toContain('Telefone em formato inválido. Use: (XX) XXXXX-XXXX');
    });
});

describe('formatarTelefone', () => {
    it('formata progressivamente enquanto digita', () => {
        expect(formatarTelefone('5')).toBe('(5');
        expect(formatarTelefone('54999')).toBe('(54) 999');
        expect(formatarTelefone('54999988888')).toBe('(54) 99998-8888');
    });

    it('ignora caracteres não numéricos', () => {
        expect(formatarTelefone('(54) 99999-8888')).toBe('(54) 99999-8888');
    });

    it('trunca além de 11 dígitos', () => {
        expect(formatarTelefone('549999988887777')).toBe('(54) 99999-8888');
    });
});

describe('formatarValorMonetario', () => {
    it('remove tudo que não é dígito', () => {
        expect(formatarValorMonetario('R$ 1.234,56')).toBe('123456');
    });
});

describe('validarCapacidade', () => {
    it('rejeita total zero', () => {
        expect(validarCapacidade(0, 0)).toBe(false);
    });

    it('aceita total dentro da capacidade padrão (30)', () => {
        expect(validarCapacidade(20, 5)).toBe(true);
    });

    it('rejeita total acima da capacidade padrão', () => {
        expect(validarCapacidade(25, 10)).toBe(false);
    });

    it('respeita capacidade customizada', () => {
        expect(validarCapacidade(10, 0, 5)).toBe(false);
    });
});

describe('escapeHtml', () => {
    it('escapa tags HTML perigosas', () => {
        expect(escapeHtml('<img src=x onerror=alert(1)>'))
            .toBe('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('escapa aspas duplas e simples', () => {
        expect(escapeHtml(`ela disse "oi" e 'tchau'`))
            .toBe('ela disse &quot;oi&quot; e &#39;tchau&#39;');
    });

    it('escapa &', () => {
        expect(escapeHtml('Maria & João')).toBe('Maria &amp; João');
    });

    it('trata null/undefined como string vazia', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });

    it('não altera texto sem caracteres especiais', () => {
        expect(escapeHtml('MESA 5 PARA JANTAR')).toBe('MESA 5 PARA JANTAR');
    });
});

describe('destacarCamposInvalidos / limparHighlightCampos', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <form id="formReserva">
                <input id="nomes" />
                <input id="apto" />
                <input id="paxs" />
            </form>
        `;
    });

    it('marca o campo nomes quando vazio', () => {
        destacarCamposInvalidos({ tipo: 'passante', nomes: '', paxs: 2 });
        expect(document.getElementById('nomes').classList.contains('campo-invalido')).toBe(true);
    });

    it('marca apto quando hóspede sem apartamento', () => {
        destacarCamposInvalidos({ tipo: 'hospede', nomes: 'ANA', apto: '', paxs: 2 });
        expect(document.getElementById('apto').classList.contains('campo-invalido')).toBe(true);
    });

    it('não marca nada quando os dados são válidos', () => {
        destacarCamposInvalidos({ tipo: 'passante', nomes: 'ANA', paxs: 2 });
        expect(document.querySelectorAll('.campo-invalido').length).toBe(0);
    });

    it('não marca campos em bloqueios (sem nome exigido)', () => {
        destacarCamposInvalidos({ bloqueado: true, nomes: '' });
        expect(document.querySelectorAll('.campo-invalido').length).toBe(0);
    });

    it('limparHighlightCampos remove todas as marcações', () => {
        destacarCamposInvalidos({ tipo: 'passante', nomes: '', paxs: 0 });
        expect(document.querySelectorAll('.campo-invalido').length).toBeGreaterThan(0);
        limparHighlightCampos();
        expect(document.querySelectorAll('.campo-invalido').length).toBe(0);
    });
});
