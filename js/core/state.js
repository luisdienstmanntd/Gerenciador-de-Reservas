/* =========================================================================================
   OSTERIA DI LUCCA - STATE.JS v6.0
   ✅ v5.0: Remove toda dependência de window.* — módulo é a única fonte da verdade
   ✅ v6.0: Etapa 5 — adiciona unsubscribeConfig para listener de config_dia
   ========================================================================================= */

let dataAtual = new Date().toLocaleDateString('en-CA');
let todasReservas = [];
let unsubscribe = null;
let unsubscribeConfig = null; // ✅ v6.0: listener separado para config_dia
let unsubscribeConfigSistema = null; // ✅ v7.0: listener de config_sistema (capacidade/mesas/bloqueio)
let linhasExtras = {};
let filtroAtivo = null;

// ✅ v7.0: config_sistema sincronizado via Supabase (antes vivia só no localStorage
// de cada navegador/tablet — cada usuário podia ver um valor diferente). Cache em
// memória, atualizado pelo listener registrado em listener.js — mesmo padrão de
// linhasExtras/config_dia. Valores default usados até o primeiro carregamento chegar.
let configSistema = {
    capacidade: 30,
    mesas: 18,
    bloqueioAutomatico: true,
    // Bloqueios antecipados por dia da semana (dias de movimento do hotel).
    // Formato: { "<getDay 0-6>": { "<HH:MM>": <qtd linhas> } }. Default espelha
    // a migration 20260716120000: qui/sex/sáb → 1×20:00, 2×20:30, 1×21:00.
    bloqueiosSemanais: {
        4: { '20:00': 1, '20:30': 2, '21:00': 1 },
        5: { '20:00': 1, '20:30': 2, '21:00': 1 },
        6: { '20:00': 1, '20:30': 2, '21:00': 1 },
    },
};
// true depois que a primeira carga real chegou do Supabase — usado pra não aplicar
// bloqueios antecipados com base nos defaults acima antes de saber a config real.
let configSistemaCarregada = false;

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
    return configSistema;
}

/**
 * Atualiza o cache em memória de config_sistema. Chamada pelo listener em
 * tempo real (listener.js) sempre que a linha muda no Supabase — nunca
 * diretamente pela UI (use db.salvarConfigSistema() pra persistir uma mudança).
 * @param {{capacidade:number, mesas:number, bloqueioAutomatico:boolean}} novaConfig
 */
export function setConfigSistema(novaConfig) {
    configSistema = novaConfig;
    configSistemaCarregada = true;
}

/** true depois que a config real chegou do Supabase (não estamos mais nos defaults). */
export function isConfigSistemaCarregada() {
    return configSistemaCarregada;
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

// ── Listener de config_sistema (v7.0) ──

export function getUnsubscribeConfigSistema() {
    return unsubscribeConfigSistema;
}

export function setUnsubscribeConfigSistema(fn) {
    unsubscribeConfigSistema = fn;
}
