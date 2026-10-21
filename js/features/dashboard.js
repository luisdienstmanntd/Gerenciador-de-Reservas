/* =========================================================================================
   OSTERIA DI LUCCA - DASHBOARD.JS v3.15
   ✅ v3.8: Padroniza error handling — usa notificacao.js
   ✅ v3.9: Bug #7 — usa buscarReservasPorPeriodo() de service.js — elimina acesso direto ao Firestore
   ✅ v3.10: ocupacaoHorario construído a partir de getHorariosPadrao() — elimina array hardcoded (Manutenção #6)
   ✅ v3.11: Curva de horário agora é barra empilhada por tipo (hóspede/externo/passante),
             em vez de só o total de pax
   ✅ v3.12: Gráfico "Composição" (adultos/crianças) substituído por "Movimento por Dia da
             Semana" — barra empilhada por tipo de cliente, por dia (bug #47)
   ✅ v3.13: Modo "Datas específicas" (analisa datas avulsas) e exceções de data no modo
             "Período" (exclui dias com eventos fechados que distorceriam a análise) (bug #48)
   ✅ v3.14: Remove borderRadius das séries empilhadas (chartHorario e chartDiaSemana) — mesmo
             "degrau" visual do bug #49
   ✅ v3.15: Card CANCELAMENTOS — conta reservas canceladas (soft-delete) no período, fora
             de qualquer KPI/gráfico de reserva ativa (bug #57). Corrige de quebra um id
             desalinhado: #kpiCancelados exibia CRIANÇAS por engano — renomeado p/ #kpiCriancas
   ========================================================================================= */

import { buscarReservasPorPeriodo, buscarReservasPorData } from './reservas/service.js';
import { notificarErro } from '../core/notificacao.js';
import { getConfig } from '../core/state.js';
import { db } from '../core/database.js';
import { reservaAtiva, tipoCliente, horariosAnalise } from '../core/analytics.js';
import { CORES_OSTERIA, coresGrafico } from '../core/theme.js';

// --- VARIÁVEIS GLOBAIS ---
let chartHorarioInstance = null;
let chartTipoInstance = null;
let chartDiaSemanaInstance = null;
let chartMesasInstance = null;

let ultimosDadosGraficos = null;
document.addEventListener('osteria:themechange', () => {
    if (ultimosDadosGraficos && (chartHorarioInstance || chartTipoInstance || chartDiaSemanaInstance || chartMesasInstance)) {
        renderizarGraficosAvancados(...ultimosDadosGraficos);
    }
});

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ✅ v3.13: Consulta por período com exceções, ou por datas específicas (bug #48)
let modoConsulta = 'periodo'; // 'periodo' | 'especificas'
let datasExcluidas = [];      // usado no modo 'periodo' — datas dentro do intervalo a ignorar
let datasEspecificas = [];    // usado no modo 'especificas' — datas avulsas a analisar

function processarDashboard(reservas, diasNoPeriodo = 1) {
    console.log("📊 Dashboard processando", reservas.length, "reservas em", diasNoPeriodo, "dias");

    let kpis = { totalPax: 0, adultos: 0, criancas: 0, tempoTotalMinutos: 0, mesasFinalizadasCount: 0, cancelamentos: 0, paxRestaurante: 0 };
    let mixCliente = { hospede: 0, externo: 0, passante: 0, roomservice: 0 };
    // ✅ v3.11: ocupacaoHorario agora separa por tipo (hospede/externo/passante) — Room
    // Service fica de fora dessa quebra específica (decisão do dono do projeto)
    let ocupacaoHorario = Object.fromEntries(
        horariosAnalise(reservas).map(h => [h, { hospede: 0, externo: 0, passante: 0 }])
    );
    let usoMesas = {};
    const config = getConfig();
    const totalMesas = Math.max(1, Number(config.totalMesas || config.mesas) || 18);
    for (let i = 1; i <= totalMesas; i++) usoMesas[i] = 0;

    // ✅ v3.12: Movimento por dia da semana, separado por tipo de cliente (bug #47)
    let porDiaSemana = DIAS_SEMANA.map(() => ({ hospede: 0, externo: 0, passante: 0 }));

    reservas.forEach(r => {
        // Cancelada (soft-delete) conta separadamente — não entra em nenhum KPI/gráfico
        // de reserva ativa, mas o restaurante precisa ver que aconteceu (bug #57).
        if (r.canceladoEm) { kpis.cancelamentos++; return; }
        if (!reservaAtiva(r)) return;

        let qtdAdultos = parseInt(r.paxs) || 0;
        let qtdCriancas = parseInt(r.chd) || 0;
        let totalReserva = qtdAdultos + qtdCriancas;

        kpis.totalPax += totalReserva;
        kpis.adultos += qtdAdultos;
        kpis.criancas += qtdCriancas;

        let tipo = tipoCliente(r);
        if (tipo !== 'roomservice') kpis.paxRestaurante += totalReserva;
        if (mixCliente[tipo] !== undefined) {
            // A composição usa a mesma unidade (PAX) para todos os tipos.
            mixCliente[tipo] += totalReserva;
        }

        let h = r.originalBase || r.horario;
        if (ocupacaoHorario[h] !== undefined && ocupacaoHorario[h][tipo] !== undefined) {
            ocupacaoHorario[h][tipo] += totalReserva;
        }

        // ✅ v3.12: 'T12:00:00' evita problema de fuso horário na conversão de string pra Date
        if (r.data) {
            const diaSemana = new Date(r.data + 'T12:00:00').getDay();
            if (porDiaSemana[diaSemana]?.[tipo] !== undefined) {
                porDiaSemana[diaSemana][tipo] += totalReserva;
            }
        }

        if (r.mesa && r.mesa !== "-" && r.mesa !== "" && r.mesa !== "ROOM") {
            let numMesa = parseInt(r.mesa);
            if (usoMesas[numMesa] !== undefined) usoMesas[numMesa]++;
        }

        if (tipo !== 'roomservice' && r.statusRecepcao !== 'no_show' && r.inicioMesa && r.fimMesa) {
            let diffMins = Math.floor((new Date(r.fimMesa) - new Date(r.inicioMesa)) / 1000 / 60);
            if (diffMins >= 0 && diffMins < 300) {
                kpis.tempoTotalMinutos += diffMins;
                kpis.mesasFinalizadasCount++;
            }
        }
    });

    let capacidadeTotalPeriodo = (Number(config.capacidade) || 30) * diasNoPeriodo;
    let taxaOcupacao = capacidadeTotalPeriodo > 0 ? (kpis.paxRestaurante / capacidadeTotalPeriodo) * 100 : 0;
    let tempoMedio = kpis.mesasFinalizadasCount > 0 ? Math.round(kpis.tempoTotalMinutos / kpis.mesasFinalizadasCount) : 0;
    let mesaTop = Object.keys(usoMesas).reduce((a, b) => usoMesas[a] > usoMesas[b] ? a : b);
    if (usoMesas[mesaTop] === 0) mesaTop = "-";

    atualizarKpisNaTela(taxaOcupacao, kpis.totalPax, tempoMedio, mesaTop, kpis.criancas, kpis.cancelamentos);
    renderizarGraficosAvancados(ocupacaoHorario, mixCliente, porDiaSemana, usoMesas);
}

function atualizarKpisNaTela(ocupacao, total, tempo, mesaTop, criancas, cancelamentos) {
    const el = {
        ocupacao: document.getElementById('kpiOcupacao'),
        total: document.getElementById('kpiTotalPax'),
        tempo: document.getElementById('kpiTempoMedio'),
        mesa: document.getElementById('kpiMesaTop'),
        criancas: document.getElementById('kpiCriancas'),
        cancelamentos: document.getElementById('kpiCancelamentos'),
    };

    if (el.ocupacao) {
        el.ocupacao.innerText = ocupacao.toFixed(1) + '%';
        el.ocupacao.style.color = ocupacao > 90 ? 'var(--cor-erro)' : (ocupacao > 70 ? 'var(--cor-sucesso)' : 'var(--texto)');
    }
    if (el.total) el.total.innerText = total;
    if (el.tempo) el.tempo.innerText = tempo > 0 ? tempo + ' min' : '--';
    if (el.mesa) el.mesa.innerText = mesaTop !== "-" ? 'Mesa ' + mesaTop : '--';
    if (el.criancas) el.criancas.innerText = criancas;
    if (el.cancelamentos) el.cancelamentos.innerText = cancelamentos;
}

function renderizarGraficosAvancados(dadosHorario, dadosTipo, dadosDiaSemana, dadosMesas) {
    ultimosDadosGraficos = [dadosHorario, dadosTipo, dadosDiaSemana, dadosMesas];
    const isDark = document.body.classList.contains('dark-theme');
    const { texto: corTexto, grade: corGrid } = coresGrafico(isDark);

    destruirGraficos();

    const ctxHorario = document.getElementById('chartHorario');
    if (ctxHorario) {
        const horariosOrdenados = Object.keys(dadosHorario).sort();
        // ✅ v3.11: Barras empilhadas por tipo de cliente — mesmas cores do gráfico de pizza
        // "Tipo de Cliente" (chartTipo), pra manter consistência visual no dashboard.
        chartHorarioInstance = new Chart(ctxHorario.getContext('2d'), {
            type: 'bar',
            data: {
                labels: horariosOrdenados,
                datasets: [
                    { label: 'Hóspede', data: horariosOrdenados.map(h => dadosHorario[h].hospede), backgroundColor: CORES_OSTERIA.hospede },
                    { label: 'Externo', data: horariosOrdenados.map(h => dadosHorario[h].externo), backgroundColor: CORES_OSTERIA.externo },
                    { label: 'Passante', data: horariosOrdenados.map(h => dadosHorario[h].passante), backgroundColor: CORES_OSTERIA.passante },
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top', labels: { color: corTexto, font: { size: 11 } } } },
                scales: {
                    x: { stacked: true, ticks: { color: corTexto }, grid: { display: false } },
                    y: { stacked: true, ticks: { color: corTexto }, grid: { color: corGrid } }
                }
            }
        });
    }

    const ctxMesas = document.getElementById('chartMesas');
    if (ctxMesas) {
        let mesasLabels = [], mesasValores = [];
        for (const i of Object.keys(dadosMesas)) {
            if (dadosMesas[i] > 0) { mesasLabels.push('Mesa ' + i); mesasValores.push(dadosMesas[i]); }
        }
        chartMesasInstance = new Chart(ctxMesas.getContext('2d'), {
            type: 'bar',
            data: { labels: mesasLabels, datasets: [{ label: 'Vezes utilizada', data: mesasValores, backgroundColor: CORES_OSTERIA.sucesso, borderRadius: 3 }] },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: corTexto, stepSize: 1 }, grid: { color: corGrid } }, y: { ticks: { color: corTexto }, grid: { display: false } } } }
        });
    }

    const ctxTipo = document.getElementById('chartTipo');
    if (ctxTipo) {
        chartTipoInstance = new Chart(ctxTipo.getContext('2d'), {
            type: 'doughnut',
            data: { labels: ['Hóspede (PAX)', 'Externo (PAX)', 'Passante (PAX)', 'Room Service (PAX)'], datasets: [{ data: [dadosTipo.hospede, dadosTipo.externo, dadosTipo.passante, dadosTipo.roomservice], backgroundColor: [CORES_OSTERIA.hospede, CORES_OSTERIA.externo, CORES_OSTERIA.passante, CORES_OSTERIA.roomservice], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: corTexto, font: { size: 11 } } } } }
        });
    }

    const ctxDiaSemana = document.getElementById('chartDiaSemana');
    if (ctxDiaSemana) {
        // ✅ v3.12: Movimento por dia da semana, empilhado por tipo de cliente (bug #47)
        chartDiaSemanaInstance = new Chart(ctxDiaSemana.getContext('2d'), {
            type: 'bar',
            data: {
                labels: DIAS_SEMANA,
                datasets: [
                    { label: 'Hóspede', data: dadosDiaSemana.map(d => d.hospede), backgroundColor: CORES_OSTERIA.hospede },
                    { label: 'Externo', data: dadosDiaSemana.map(d => d.externo), backgroundColor: CORES_OSTERIA.externo },
                    { label: 'Passante', data: dadosDiaSemana.map(d => d.passante), backgroundColor: CORES_OSTERIA.passante },
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top', labels: { color: corTexto, font: { size: 11 } } } },
                scales: {
                    x: { stacked: true, ticks: { color: corTexto }, grid: { display: false } },
                    y: { stacked: true, ticks: { color: corTexto }, grid: { color: corGrid } }
                }
            }
        });
    }
}

function destruirGraficos() {
    if (chartHorarioInstance) { chartHorarioInstance.destroy(); chartHorarioInstance = null; }
    if (chartTipoInstance) { chartTipoInstance.destroy(); chartTipoInstance = null; }
    if (chartDiaSemanaInstance) { chartDiaSemanaInstance.destroy(); chartDiaSemanaInstance = null; }
    if (chartMesasInstance) { chartMesasInstance.destroy(); chartMesasInstance = null; }
}

let geracaoConsulta = 0;
let ultimaConsulta = null;
let pararAtualizacoes = null;
let timerAtualizacao;

function statusAnalise(mensagem, estado) {
    const el = document.getElementById('dashStatus');
    if (el) { el.textContent = mensagem; el.dataset.estado = estado; }
}

function limparAnalise() {
    destruirGraficos(); ultimosDadosGraficos = null;
    for (const id of ['kpiOcupacao','kpiTotalPax','kpiTempoMedio','kpiMesaTop','kpiCriancas','kpiCancelamentos']) {
        const el = document.getElementById(id); if (el) el.innerText = '—';
    }
}

function invalidarAnalise() {
    ++geracaoConsulta; ultimaConsulta = null; clearTimeout(timerAtualizacao);
    limparAnalise(); statusAnalise('Filtros alterados. Clique em ANALISAR para atualizar os resultados.', 'pendente');
}

function suspenderDashboard() {
    ++geracaoConsulta; clearTimeout(timerAtualizacao);
    if (pararAtualizacoes) { pararAtualizacoes(); pararAtualizacoes = null; }
}

function iniciarAtualizacoesDashboard() {
    if (pararAtualizacoes || typeof db.escutarAlteracoesReservas !== 'function') return;
    pararAtualizacoes = db.escutarAlteracoesReservas(() => {
        if (!ultimaConsulta || document.getElementById('tela-dashboard')?.classList.contains('hidden')) return;
        ++geracaoConsulta; limparAnalise(); statusAnalise('Atualizando o período analisado…', 'carregando');
        clearTimeout(timerAtualizacao);
        timerAtualizacao = setTimeout(() => carregarDadosDashboard(ultimaConsulta), 200);
    }, () => {
        ++geracaoConsulta; clearTimeout(timerAtualizacao); limparAnalise();
        statusAnalise('Conexão interrompida. Clique em ANALISAR para consultar novamente.', 'erro');
    });
}

function capturarConsulta() {
    if (modoConsulta === 'especificas') {
        const datas = [...new Set(datasEspecificas)].sort();
        if (!datas.length) throw new Error('Adicione ao menos uma data específica para analisar.');
        return { modo: 'especificas', datas, dias: datas.length };
    }
    const inputInicio = document.getElementById('dashInicio'), inputFim = document.getElementById('dashFim');
    if (!inputInicio || !inputFim) return null;
    if (!inputInicio.value && !inputFim.value) {
        const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        inputInicio.value = hoje; inputFim.value = hoje;
    }
    const inicio = inputInicio.value, fim = inputFim.value;
    if (!inicio || !fim || inicio > fim) throw new Error('Informe um período válido: a data inicial deve ser anterior ou igual à final.');
    const excluidas = [...new Set(datasExcluidas)].filter(d => d >= inicio && d <= fim);
    const dias = Math.round((new Date(fim) - new Date(inicio)) / 86400000) + 1 - excluidas.length;
    if (dias <= 0) throw new Error('O período não contém dias para analisar. Remova uma exclusão ou escolha outro período.');
    return { modo: 'periodo', inicio, fim, excluidas, dias };
}

async function carregarDadosDashboard(contexto = null) {
    const geracao = ++geracaoConsulta;
    if (!contexto) ultimaConsulta = null;
    clearTimeout(timerAtualizacao); limparAnalise();
    statusAnalise('Consultando reservas…', 'carregando');
    try {
        const consulta = contexto || capturarConsulta();
        if (!consulta) return;
        // Cópias imutáveis: nenhuma lista global é lida depois dos awaits.
        ultimaConsulta = consulta;
        const reservas = consulta.modo === 'especificas'
            ? (await Promise.all(consulta.datas.map(d => buscarReservasPorData(d)))).flat()
            : (await buscarReservasPorPeriodo(consulta.inicio, consulta.fim)).filter(r => !consulta.excluidas.includes(r.data));
        if (geracao !== geracaoConsulta) return;
        processarDashboard(reservas, consulta.dias);
        const periodo = consulta.modo === 'especificas' ? consulta.datas.map(_formatarDataChip).join(', ') : _formatarDataChip(consulta.inicio) + ' a ' + _formatarDataChip(consulta.fim);
        statusAnalise('Análise: ' + periodo + ' · ' + consulta.dias + ' dia(s) · Atualizado às ' + new Date().toLocaleTimeString('pt-BR', {timeZone:'America/Sao_Paulo'}), 'pronto');
        iniciarAtualizacoesDashboard();
    } catch (error) {
        if (geracao !== geracaoConsulta) return;
        limparAnalise(); statusAnalise(error.message || 'Não foi possível consultar os dados.', 'erro');
        notificarErro(error.message || 'Erro ao carregar dados do dashboard.');
    }
}

document.addEventListener('change', event => {
    if (['dashInicio', 'dashFim'].includes(event.target.id)) invalidarAnalise();
});
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ultimaConsulta && !document.getElementById('tela-dashboard')?.classList.contains('hidden')) carregarDadosDashboard(ultimaConsulta);
});
document.addEventListener('osteria:configchange', () => {
    if (ultimaConsulta && !document.getElementById('tela-dashboard')?.classList.contains('hidden')) carregarDadosDashboard(ultimaConsulta);
});

/**
 * Alterna entre "Período contínuo" e "Datas específicas" — mostra/oculta os
 * campos correspondentes e re-renderiza os chips do modo ativo.
 */
function alternarModoDashboard() {
    invalidarAnalise();
    modoConsulta = document.getElementById('dashModo')?.value || 'periodo';

    const grupoPeriodo = document.getElementById('dashGrupoPeriodo');
    const grupoExclusao = document.getElementById('dashGrupoExclusao');
    const grupoEspecificas = document.getElementById('dashGrupoEspecificas');

    if (grupoPeriodo) grupoPeriodo.style.display = modoConsulta === 'periodo' ? 'flex' : 'none';
    if (grupoExclusao) grupoExclusao.style.display = modoConsulta === 'periodo' ? 'flex' : 'none';
    if (grupoEspecificas) grupoEspecificas.style.display = modoConsulta === 'especificas' ? 'flex' : 'none';

    _renderizarChipsDatas();
}

/** Formata 'YYYY-MM-DD' como 'DD/MM/AAAA' pro chip, sem depender de fuso horário. */
function _formatarDataChip(data) {
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
}

function _renderizarChipsDatas() {
    const container = document.getElementById('dashChipsDatas');
    if (!container) return;

    const lista = modoConsulta === 'periodo' ? datasExcluidas : datasEspecificas;
    const funcaoRemover = modoConsulta === 'periodo' ? 'removerDataExcluida' : 'removerDataEspecifica';
    const bgChip = 'var(--accent-soft)';

    container.innerHTML = [...lista].sort().map(d => `
        <span style="background:${bgChip}; border-radius:20px; padding:4px 6px 4px 12px; font-size:0.8rem; display:inline-flex; align-items:center; gap:6px;">
            ${_formatarDataChip(d)}
            <button type="button" aria-label="Remover data ${_formatarDataChip(d)}" onclick="${funcaoRemover}('${d}')" style="cursor:pointer; font-weight:700; color:var(--texto-suave); background:transparent; border:0; padding:0 4px;">✕</button>
        </span>
    `).join('');
}

function adicionarDataExcluida() {
    const input = document.getElementById('dashDataExcluir');
    const data = input?.value;
    if (!data) return;
    if (!datasExcluidas.includes(data)) datasExcluidas.push(data);
    input.value = '';
    invalidarAnalise();
    _renderizarChipsDatas();
}

function removerDataExcluida(data) {
    datasExcluidas = datasExcluidas.filter(d => d !== data);
    invalidarAnalise();
    _renderizarChipsDatas();
}

function adicionarDataEspecifica() {
    const input = document.getElementById('dashDataEspecifica');
    const data = input?.value;
    if (!data) return;
    if (!datasEspecificas.includes(data)) datasEspecificas.push(data);
    input.value = '';
    invalidarAnalise();
    _renderizarChipsDatas();
}

function removerDataEspecifica(data) {
    datasEspecificas = datasEspecificas.filter(d => d !== data);
    invalidarAnalise();
    _renderizarChipsDatas();
}

window.processarDashboard = processarDashboard;
window.destruirGraficos = destruirGraficos;
window.carregarDadosDashboard = carregarDadosDashboard;
window.alternarModoDashboard = alternarModoDashboard;
window.adicionarDataExcluida = adicionarDataExcluida;
window.removerDataExcluida = removerDataExcluida;
window.adicionarDataEspecifica = adicionarDataEspecifica;
window.removerDataEspecifica = removerDataEspecifica;


window.suspenderDashboard = suspenderDashboard;
