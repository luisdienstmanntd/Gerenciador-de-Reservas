/* Tokens compartilhados entre CSS e gráficos Canvas. */
export const CORES_OSTERIA = Object.freeze({
    hospede: '#7896a3', externo: '#b9895b', passante: '#7a9a80',
    roomservice: '#8f7a9f', criancas: '#b18d67', accent: '#8c6f55',
    sucesso: '#789878', aviso: '#b9895b', erro: '#a45b52',
    textoClaro: '#4a403b', textoEscuro: '#f4efea',
});

export function coresGrafico(modoEscuro = false) {
    return {
        texto: modoEscuro ? CORES_OSTERIA.textoEscuro : CORES_OSTERIA.textoClaro,
        grade: modoEscuro ? 'rgba(244,239,234,.14)' : 'rgba(106,86,68,.14)',
        livre: modoEscuro ? 'rgba(244,239,234,.16)' : 'rgba(106,86,68,.14)',
    };
}
