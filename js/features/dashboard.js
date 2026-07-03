/* =========================================================================================
   OSTERIA DI LUCCA - DASHBOARD.JS v3.9
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
   ========================================================================================= */

import { buscarReservasPorPeriodo, buscarReservasPorData } from './reservas/service.js';
import { notificarErro } from '../core/notificacao.js';
import { getHorariosPadrao } from '../core/state.js';

// --- VARIÁVEIS GLOBAIS ---
let chartHorarioInstance = null;
let chartTipoInstance = null;
let chartDiaSemanaInstance = null;
let chartMesasInstance = null;

const CAPACIDADE_NOITE = 30;
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ✅ v3.13: Consulta por período com exceções, ou por datas específicas (bug #48)
let modoConsulta = 'periodo'; // 'periodo' | 'especificas'
let datasExcluidas = [];      // usado no modo 'periodo' — datas dentro do intervalo a ignorar
let datasEspecificas = [];    // usado no modo 'especificas' — datas avulsas a analisar

function processarDashboard(reservas, diasNoPeriodo = 1) {
    console.log("📊 Dashboard processando", reservas.length, "reservas em", diasNoPeriodo, "dias");

    let kpis = { totalPax: 0, adultos: 0, criancas: 0, tempoTotalMinutos: 0, mesasFinalizadasCount: 0 };
    let mixCliente = { hospede: 0, externo: 0, passante: 0, roomservice: 0 };
    // ✅ v3.11: ocupacaoHorario agora separa por tipo (hospede/externo/passante) — Room
    // Service fica de fora dessa quebra específica (decisão do dono do projeto)
    let ocupacaoHorario = Object.fromEntries(
        getHorariosPadrao().map(h => [h, { hospede: 0, externo: 0, passante: 0 }])
    );
    let usoMesas = {};
    for (let i = 1; i <= 18; i++) usoMesas[i] = 0;

    // ✅ v3.12: Movimento por dia da semana, separado por tipo de cliente (bug #47)
    let porDiaSemana = DIAS_SEMANA.map(() => ({ hospede: 0, externo: 0, passante: 0 }));

    reservas.forEach(r => {
        if (r.somenteHospedes && !r.nomes) return;
        if (!r.nomes) return;

        let qtdAdultos = parseInt(r.paxs) || 0;
        let qtdCriancas = parseInt(r.chd) || 0;
        let totalReserva = qtdAdultos + qtdCriancas;

        kpis.totalPax += totalReserva;
        kpis.adultos += qtdAdultos;
        kpis.criancas += qtdCriancas;

        let tipo = r.tipo ? r.tipo.toLowerCase() : 'hospede';
        if (mixCliente[tipo] !== undefined) {
            // ✅ Room service conta por apto (1), demais por pessoa
            mixCliente[tipo] += (tipo === 'roomservice') ? 1 : totalReserva;
        }

        let h = r.originalBase || r.horario;
        if (ocupacaoHorario[h] !== undefined && ocupacaoHorario[h][tipo] !== undefined) {
            ocupacaoHorario[h][tipo] += totalReserva;
        }

        // ✅ v3.12: 'T12:00:00' evita problema de fuso horário na conversão de string pra Date
        if (r.data) {
            const diaSemana = new Date(r.data + 'T12:00:00').getDay();
            if (porDiaSemana[diaSemana][tipo] !== undefined) {
                porDiaSemana[diaSemana][tipo] += totalReserva;
            }
        }

        if (r.mesa && r.mesa !== "-" && r.mesa !== "" && r.mesa !== "ROOM") {
            let numMesa = parseInt(r.mesa);
            if (usoMesas[numMesa] !== undefined) usoMesas[numMesa]++;
        }

        if (r.inicioMesa && r.fimMesa) {
            let diffMins = Math.floor((new Date(r.fimMesa) - new Date(r.inicioMesa)) / 1000 / 60);
            if (diffMins >= 0 && diffMins < 300) {
                kpis.tempoTotalMinutos += diffMins;
                kpis.mesasFinalizadasCount++;
            }
        }
    });

    let capacidadeTotalPeriodo = CAPACIDADE_NOITE * diasNoPeriodo;
    let taxaOcupacao = capacidadeTotalPeriodo > 0 ? (kpis.totalPax / capacidadeTotalPeriodo) * 100 : 0;
    let tempoMedio = kpis.mesasFinalizadasCount > 0 ? Math.round(kpis.tempoTotalMinutos / kpis.mesasFinalizadasCount) : 0;
    let mesaTop = Object.keys(usoMesas).reduce((a, b) => usoMesas[a] > usoMesas[b] ? a : b);
    if (usoMesas[mesaTop] === 0) mesaTop = "-";

    atualizarKpisNaTela(taxaOcupacao, kpis.totalPax, tempoMedio, mesaTop, kpis.criancas);
    renderizarGraficosAvancados(ocupacaoHorario, mixCliente, porDiaSemana, usoMesas);
}

function atualizarKpisNaTela(ocupacao, total, tempo, mesaTop, criancas) {
    const el = {
        ocupacao: document.getElementById('kpiOcupacao'),
        total: document.getElementById('kpiTotalPax'),
        tempo: document.getElementById('kpiTempoMedio'),
        mesa: document.getElementById('kpiMesaTop'),
        criancas: document.getElementById('kpiCancelados'),
        opTotal: document.getElementById('dashTotalPax')
    };

    if (el.opTotal) el.opTotal.innerText = total;
    if (el.ocupacao) {
        el.ocupacao.innerText = ocupacao.toFixed(1) + '%';
        el.ocupacao.style.color = ocupacao > 90 ? '#e74c3c' : (ocupacao > 70 ? '#27ae60' : 'var(--texto-principal)');
    }
    if (el.total) el.total.innerText = total;
    if (el.tempo) el.tempo.innerText = tempo > 0 ? tempo + ' min' : '--';
    if (el.mesa) el.mesa.innerText = mesaTop !== "-" ? 'Mesa ' + mesaTop : '--';
    if (el.criancas) el.criancas.innerText = criancas;
}

function renderizarGraficosAvancados(dadosHorario, dadosTipo, dadosDiaSemana, dadosMesas) {
    const isDark = document.body.classList.contains('dark-theme');
    const corTexto = isDark ? '#e0e0e0' : '#333333';
    const corGrid = isDark ? '#444' : '#ddd';

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
                    { label: 'Hóspede', data: horariosOrdenados.map(h => dadosHorario[h].hospede), backgroundColor: '#3498db' },
                    { label: 'Externo', data: horariosOrdenados.map(h => dadosHorario[h].externo), backgroundColor: '#f39c12' },
                    { label: 'Passante', data: horariosOrdenados.map(h => dadosHorario[h].passante), backgroundColor: '#95a5a6' },
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
        for (let i = 1; i <= 18; i++) {
            if (dadosMesas[i] > 0) { mesasLabels.push('Mesa ' + i); mesasValores.push(dadosMesas[i]); }
        }
        chartMesasInstance = new Chart(ctxMesas.getContext('2d'), {
            type: 'bar',
            data: { labels: mesasLabels, datasets: [{ label: 'Vezes utilizada', data: mesasValores, backgroundColor: '#27ae60', borderRadius: 3 }] },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: corTexto, stepSize: 1 }, grid: { color: corGrid } }, y: { ticks: { color: corTexto }, grid: { display: false } } } }
        });
    }

    const ctxTipo = document.getElementById('chartTipo');
    if (ctxTipo) {
        chartTipoInstance = new Chart(ctxTipo.getContext('2d'), {
            type: 'doughnut',
            data: { labels: ['Hóspede', 'Externo', 'Passante', 'Room Service'], datasets: [{ data: [dadosTipo.hospede, dadosTipo.externo, dadosTipo.passante, dadosTipo.roomservice], backgroundColor: ['#3498db', '#f39c12', '#95a5a6', '#9b59b6'], borderWidth: 0 }] },
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
                    { label: 'Hóspede', data: dadosDiaSemana.map(d => d.hospede), backgroundColor: '#3498db' },
                    { label: 'Externo', data: dadosDiaSemana.map(d => d.externo), backgroundColor: '#f39c12' },
                    { label: 'Passante', data: dadosDiaSemana.map(d => d.passante), backgroundColor: '#95a5a6' },
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

async function carregarDadosDashboard() {
    console.log("🔄 Carregando Dashboard...");

    try {
        let reservasPeriodo, diasNoPeriodo;

        if (modoConsulta === 'especificas') {
            if (datasEspecificas.length === 0) {
                notificarErro('Adicione ao menos uma data específica para analisar.');
                return;
            }
            console.log("📅 Buscando", datasEspecificas.length, "data(s) específica(s):", datasEspecificas);
            const resultados = await Promise.all(datasEspecificas.map(d => buscarReservasPorData(d)));
            reservasPeriodo = resultados.flat();
            diasNoPeriodo = datasEspecificas.length;

        } else {
            let inicio = document.getElementById("dashInicio")?.value;
            let fim = document.getElementById("dashFim")?.value;

            if (!inicio || !fim) {
                const hoje = new Date();
                const dataLocal = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;
                const inputInicio = document.getElementById("dashInicio");
                const inputFim = document.getElementById("dashFim");
                if (inputInicio && !inputInicio.value) { inputInicio.value = dataLocal; inicio = dataLocal; }
                if (inputFim && !inputFim.value) { inputFim.value = dataLocal; fim = dataLocal; }
                if (!inicio || !fim) return;
            }

            console.log("📅 Buscando dados de", inicio, "até", fim, "— excluindo", datasExcluidas.length, "data(s)");

            const todasReservasPeriodo = await buscarReservasPorPeriodo(inicio, fim);
            reservasPeriodo = todasReservasPeriodo.filter(r => !datasExcluidas.includes(r.data));

            const diffDays = Math.ceil(Math.abs(new Date(fim) - new Date(inicio)) / (1000 * 60 * 60 * 24)) + 1;
            // Só desconta do denominador as exceções que realmente caem dentro do intervalo pesquisado
            const excluidasNoIntervalo = datasExcluidas.filter(d => d >= inicio && d <= fim).length;
            diasNoPeriodo = Math.max(1, diffDays - excluidasNoIntervalo);
        }

        console.log("✅ Carregadas", reservasPeriodo.length, "reservas em", diasNoPeriodo, "dia(s)");
        processarDashboard(reservasPeriodo, diasNoPeriodo);

    } catch (e) {
        console.error("❌ Erro ao carregar Dashboard:", e);
        notificarErro("Erro ao carregar dados do dashboard.");
    }
}

/**
 * Alterna entre "Período contínuo" e "Datas específicas" — mostra/oculta os
 * campos correspondentes e re-renderiza os chips do modo ativo.
 */
function alternarModoDashboard() {
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
    const isDark = document.body.classList.contains('dark-theme');
    const bgChip = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

    container.innerHTML = [...lista].sort().map(d => `
        <span style="background:${bgChip}; border-radius:20px; padding:4px 6px 4px 12px; font-size:0.8rem; display:inline-flex; align-items:center; gap:6px;">
            ${_formatarDataChip(d)}
            <span onclick="${funcaoRemover}('${d}')" style="cursor:pointer; font-weight:700; opacity:0.7; padding:0 4px;">✕</span>
        </span>
    `).join('');
}

function adicionarDataExcluida() {
    const input = document.getElementById('dashDataExcluir');
    const data = input?.value;
    if (!data) return;
    if (!datasExcluidas.includes(data)) datasExcluidas.push(data);
    input.value = '';
    _renderizarChipsDatas();
}

function removerDataExcluida(data) {
    datasExcluidas = datasExcluidas.filter(d => d !== data);
    _renderizarChipsDatas();
}

function adicionarDataEspecifica() {
    const input = document.getElementById('dashDataEspecifica');
    const data = input?.value;
    if (!data) return;
    if (!datasEspecificas.includes(data)) datasEspecificas.push(data);
    input.value = '';
    _renderizarChipsDatas();
}

function removerDataEspecifica(data) {
    datasEspecificas = datasEspecificas.filter(d => d !== data);
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
