import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('css/base.css', 'utf8');
const declarations = block => Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const light = declarations(css.match(/:root\s*\{([^}]+)\}/s)[1]);
const dark = { ...light, ...declarations(css.match(/body\.dark-theme\s*\{([^}]+)\}/s)[1]) };
// Aliases herdados do :root ficam resolvidos no claro. Reaplicá-los no body
// escuro é parte do contrato necessário para os componentes legados.
const aliases = declarations(css.match(/:root,\s*body\.dark-theme\s*\{([^}]+)\}/s)[1]);
Object.assign(light, aliases);
Object.assign(dark, aliases);
function resolve(tokens, name) {
    const value = tokens[name];
    if (!value) throw new Error(`Token ausente: ${name}`);
    return value.startsWith('var(') ? resolve(tokens, value.slice(4, -1)) : value;
}
function luminance(hex) {
    const rgb = hex.slice(1).match(/.{2}/g).map(n => parseInt(n, 16) / 255);
    return rgb.map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)
        .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
    const [x, y] = [luminance(a), luminance(b)].sort((a, b) => b - a);
    return (x + 0.05) / (y + 0.05);
}
const textPairs = [
    ['--acao-texto', '--acao-bg'], ['--acao-texto', '--acao-hover'],
    ['--texto', '--card-bg'], ['--texto', '--input-bg'],
    ['--texto-suave', '--card-bg'], ['--texto-suave', '--fundo'],
    ['--texto-suave', '--accent-soft'], ['--sidebar-texto', '--sidebar-bg'],
    ['--cor-sucesso', '--sucesso-bg'], ['--cor-aviso', '--aviso-bg'],
    ['--cor-erro', '--erro-bg'], ['--cor-info', '--info-bg'],
    ['--cor-roomservice', '--roomservice-bg'], ['--primaria', '--card-bg'],
    ['--cor-sucesso', '--card-bg'], ['--cor-aviso', '--card-bg'],
    ['--cor-erro', '--card-bg'], ['--cor-info', '--accent-soft'],
    ['--cor-roomservice', '--accent-soft'],
    ['--vermelho', '--erro-bg'], ['--roomservice', '--roomservice-bg'],
    ['--menu', '--card-bg'],
];
for (const [mode, tokens] of [['claro', light], ['escuro', dark]]) {
    describe(`Contraste de tokens — ${mode}`, () => {
        for (const [foreground, background] of textPairs) {
            it(`${foreground} sobre ${background} atende texto normal`, () => {
                expect(contrast(resolve(tokens, foreground), resolve(tokens, background))).toBeGreaterThanOrEqual(4.5);
            });
        }
        for (const surface of ['--card-bg', '--input-bg', '--fundo']) {
            it(`foco visível contra ${surface}`, () => {
                expect(contrast(resolve(tokens, '--focus-ring'), resolve(tokens, surface))).toBeGreaterThanOrEqual(3);
            });
        }
        it('limite de campos atende contraste não textual', () => {
            expect(contrast(resolve(tokens, '--input-border'), resolve(tokens, '--input-bg'))).toBeGreaterThanOrEqual(3);
        });
    });
}
