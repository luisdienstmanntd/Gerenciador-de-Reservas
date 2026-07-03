/* =========================================================================================
   OSTERIA DI LUCCA - DASHBOARD.JS v3.9
   ✅ v3.8: Padroniza error handling — usa notificacao.js
   ✅ v3.9: Bug #7 — usa buscarReservasPorPeriodo() de service.js — elimina acesso direto ao Firestore
   ✅ v3.10: ocupacaoHorario construído a partir de getHorariosPadrao() — elimina array hardcoded (Manutenção #6)
   ✅ v3.11: Curva de horário agora é barra empilhada por tipo (hóspede/externo/passante),
             em vez de só o total de pax
   ========================================================================================= */

import { buscarReservasPorPeriodo } from './reservas/service.js';
import { notificarErro } from '../core/notificacao.js';
import { getHorariosPadrao } from '../core/state.js';

// --- VARIÁVEIS GLOBAIS ---
let chartHorarioInstance = null;
let chartTipoInstance = null;
let chartComposicaoInstance = null;
let chartMesasInstance = null;

const CAPACIDADE_NOITE = 30;

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
    renderizarGraficosAvancados(ocupacaoHorario, mixCliente, kpis.adultos, kpis.criancas, usoMesas);
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

function renderizarGraficosAvancados(dadosHorario, dadosTipo, adt, chd, dadosMesas) {
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
                    { label: 'Hóspede', data: horariosOrdenados.map(h => dadosHorario[h].hospede), backgroundColor: '#3498db', borderRadius: 4 },
                    { label: 'Externo', data: horariosOrdenados.map(h => dadosHorario[h].externo), backgroundColor: '#f39c12', borderRadius: 4 },
                    { label: 'Passante', data: horariosOrdenados.map(h => dadosHorario[h].passante), backgroundColor: '#95a5a6', borderRadius: 4 },
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

    const ctxComp = document.getElementById('chartComposicao');
    if (ctxComp) {
        chartComposicaoInstance = new Chart(ctxComp.getContext('2d'), {
            type: 'pie',
            data: { labels: ['Adultos', 'Crianças'], datasets: [{ data: [adt, chd], backgroundColor: ['#4a1a1a', '#e67e22'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: corTexto, font: { size: 11 } } } } }
        });
    }
}

function destruirGraficos() {
    if (chartHorarioInstance) { chartHorarioInstance.destroy(); chartHorarioInstance = null; }
    if (chartTipoInstance) { chartTipoInstance.destroy(); chartTipoInstance = null; }
    if (chartComposicaoInstance) { chartComposicaoInstance.destroy(); chartComposicaoInstance = null; }
    if (chartMesasInstance) { chartMesasInstance.destroy(); chartMesasInstance = null; }
}

async function carregarDadosDashboard() {
    console.log("🔄 Carregando Dashboard...");

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

    console.log("📅 Buscando dados de", inicio, "até", fim);

    try {
        const reservasPeriodo = await buscarReservasPorPeriodo(inicio, fim);
        console.log("✅ Carregadas", reservasPeriodo.length, "reservas");

        const diffDays = Math.ceil(Math.abs(new Date(fim) - new Date(inicio)) / (1000 * 60 * 60 * 24)) + 1;
        processarDashboard(reservasPeriodo, diffDays);

    } catch (e) {
        console.error("❌ Erro ao carregar Dashboard:", e);
        notificarErro("Erro ao carregar dados do dashboard.");
    }
}

window.processarDashboard = processarDashboard;
window.destruirGraficos = destruirGraficos;
window.carregarDadosDashboard = carregarDadosDashboard;
