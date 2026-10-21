/* A paleta dos gráficos é a mesma dos componentes DOM, inclusive após trocar tema. */
const FALLBACK = Object.freeze({
    hospede: ['--cor-hospede', '#486676'], externo: ['--cor-externo', '#805a30'],
    passante: ['--cor-passante', '#3f6948'], roomservice: ['--cor-roomservice', '#72557e'],
    criancas: ['--cor-criancas', '#805a30'], accent: ['--primaria', '#6a5644'],
    sucesso: ['--cor-sucesso', '#3f6948'], aviso: ['--cor-aviso', '#805a30'],
    erro: ['--cor-erro', '#a34d42'], textoClaro: ['--texto', '#332e2b'],
    textoEscuro: ['--texto', '#f4efea'],
});
function token(nome, fallback) {
    if (typeof document === 'undefined' || !document.body) return fallback;
    return document.defaultView?.getComputedStyle(document.body).getPropertyValue(nome).trim() || fallback;
}
export const CORES_OSTERIA = Object.freeze(Object.defineProperties({}, Object.fromEntries(
    Object.entries(FALLBACK).map(([nome, [variavel, fallback]]) => [nome, {
        enumerable: true, get: () => token(variavel, fallback),
    }]),
)));
export function coresGrafico(modoEscuro = false) {
    return {
        texto: token('--texto', modoEscuro ? '#f4efea' : '#332e2b'),
        grade: token('--chart-grid', modoEscuro ? 'rgba(244,239,234,.22)' : 'rgba(106,86,68,.22)'),
        livre: token('--chart-livre', modoEscuro ? 'rgba(244,239,234,.20)' : 'rgba(106,86,68,.20)'),
    };
}
