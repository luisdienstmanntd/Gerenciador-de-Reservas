/* =========================================================================================
   OSTERIA DI LUCCA - STATE.JS v6.0
   ✅ v5.0: Remove toda dependência de window.* — módulo é a única fonte da verdade
   ✅ v6.0: Etapa 5 — adiciona unsubscribeConfig para listener de config_dia
   ========================================================================================= */

let dataAtual = new Date().toLocaleDateString('en-CA');
let todasReservas = [];
let unsubscribe = null;
let unsubscribeConfig = null; // ✅ v6.0: listener separado para config_dia
let linhasExtras = {};
let filtroAtivo = null;

export function getDataAtual() {
    const inputData = document.getElementById("dataFiltro");
    if (inputData && inputData.value) {
        return inputData.value;
    }
    return dataAtual;
}

export function setDataAtual(novaData) {
    dataAtual = novaData;
    const inputData = document.getElementById("dataFiltro");
    if (inputData) inputData.value = novaData;
}

export function getTodasReservas() {
    return todasReservas;
}

export function setTodasReservas(reservas) {
    todasReservas = reservas;
}

export function getHorariosPadrao() {
    return ["20:00", "20:30", "21:00", "21:30", "22:00", "22:30"];
}

export function getConfig() {
    const configStr = localStorage.getItem("osteria_config");
    if (configStr) {
        return JSON.parse(configStr);
    }
    return {
        capacidade: 30,
        mesas: 18,
        bloqueioAutomatico: true
    };
}

export function getLinhasExtras() {
    return linhasExtras;
}

export function setLinhasExtras(novasLinhas) {
    linhasExtras = novasLinhas;
}

export function adicionarLinhaExtra(horario) {
    if (linhasExtras[horario] === undefined) {
        linhasExtras[horario] = 0;
    }
    linhasExtras[horario]++;
    console.log(`✅ Linha adicionada. Total: ${linhasExtras[horario]}`);
}

export function removerLinhaExtra(horario) {
    if (linhasExtras[horario] === undefined) {
        linhasExtras[horario] = 0;
    }
    linhasExtras[horario]--;
    console.log(`➖ Linha removida. Total: ${linhasExtras[horario]}`);
}

export function getFiltroAtivo() {
    return filtroAtivo;
}

export function setFiltroAtivo(novoFiltro) {
    filtroAtivo = novoFiltro;
}

// ── Listener de reservas ──
export function getUnsubscribe() {
    return unsubscribe;
}

export function setUnsubscribe(fn) {
    unsubscribe = fn;
}

// ── Listener de config_dia (v6.0) ──

/**
 * Retorna a função de cancelamento do listener de config_dia.
 * @returns {Function|null}
 */
export function getUnsubscribeConfig() {
    return unsubscribeConfig;
}

/**
 * Armazena (ou limpa) a função de cancelamento do listener de config_dia.
 * @param {Function|null} fn
 */
export function setUnsubscribeConfig(fn) {
    unsubscribeConfig = fn;
}
