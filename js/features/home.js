/* =========================================================================================
   OSTERIA DI LUCCA - HOME.JS v2.7
   ✅ v1.1: onSnapshot em tempo real
   ✅ v1.2: Gauge de taxa de ocupação
   ✅ v1.3: rosca 360° ocupação com legenda
   ✅ v1.4: Giro de Mesa + ticker portrait mobile (RAF + flag de geração)
   ✅ v1.5: BUG FIX ticker — offset como variável LOCAL em iniciarLoop()
            Remove _tickerOffset/_tickerConjW de módulo; evita sobrescrita por RAFs órfãos
   ✅ v1.6: Card "Observações da Noite" — lê r.obs das reservas com mesa, edição inline
   ✅ v1.7: Tipografia Giro de Mesa uniforme — 0.85rem/700 igual ao home-card-titulo
   ✅ v1.8: Obs da Noite: cor/tamanho igual ao Giro; labels em minúsculas
   ✅ v1.9: KPI cards deslizam em ticker no mobile/tablet — desktop intocado
   ✅ v2.0: BUG FIX ticker height:0 — wrap/inner com altura explícita via JS + CSS
            Separa _atualizarClonesKpiTicker() de _iniciarKpiTicker()
            Clones recriados APÓS _renderizarKPIs() — cards sempre com dados reais
   ✅ v2.1: BUG FIX ticker invisível no tablet — breakpoint corrigido 1024px → 1200px
            em _atualizarClonesKpiTicker() e _iniciarKpiTicker()
            Tab A9 landscape (1138px) passava pelo guard e retornava sem renderizar
   ✅ v2.2: Escapa r.obs/r.nomes no card "Observações da Noite" — corrige XSS armazenado
   ✅ v2.3: HORARIOS/horarios usam getHorariosPadrao() de state.js — elimina 2 arrays hardcoded (Manutenção #6)
   ✅ v2.4: Gráfico "PAX por Horário" vira barra empilhada por tipo de cliente
            (hóspede/externo/passante), mesma quebra do Dashboard (bug #45)
   ✅ v2.5: Remove borderRadius das séries empilhadas — cantos arredondados por segmento
            deixavam um "degrau" visual entre hóspede/externo/passante (bug #49)
   ✅ v2.6: Reservas canceladas não contam mais nos KPIs; novo card "Cancelamentos"
            mostra quantas ocorreram no dia (soft-delete — histórico completo no Log)
   ✅ v2.7: Reserva cancelada aparece em "Observações da Noite" (ex: "20:30 - CANCELADA -
            NOME"), mesmo sem obs/degustação registrada
   ========================================================================================= */

import { db } from '../core/database.js';
import { escapeHtml } from './reservas/validators.js';
import { getHorariosPadrao, getConfig } from '../core/state.js';

let chartGaugeInstance  = null;
let chartBarrasInstance = null;
let chartSemanaInstance = null;

let _unsubscribeHome    = null;
let _tickerInicializado = false;

const PALETA = {
    hospede:     '#4a90e2',
    externo:     '#f39c12',
    passante:    '#95a5a6',
    roomservice: '#9b59b6',
    criancas:    '#e67e22',
    accent:      '#6c63ff',
    grid:        'rgba(255,255,255,0.07)',
};

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export async function carregarHome() {
    console.log('🏠 Carregando Home v1.5...');

    _mostrarSkeleton();
    _tickerInicializado = false;

    try {
        await db.aguardarInicializacao();
    } catch (e) {
        console.error('❌ Erro ao inicializar DB:', e);
        _mostrarErro();
        return;
    }

    if (_unsubscribeHome) {
        _unsubscribeHome();
        _unsubscribeHome = null;
    }

    const hoje = _dataHoje();

    _unsubscribeHome = db.escutarReservasPorData(hoje, async (reservasHoje) => {
        console.log(`📡 Home: ${reservasHoje.length} reservas recebidas`);

        const reaisHoje = reservasHoje.filter(r => r.nomes && !r.bloqueado && !r.somenteHospedes && !r.canceladoEm);
        const cancelamentosHoje = reservasHoje.filter(r => r.canceladoEm).length;

        _renderizarKPIs(reaisHoje, cancelamentosHoje);
        _atualizarClonesKpiTicker();
        if (!_tickerInicializado) { _tickerInicializado = true; _iniciarKpiTicker(); }

        _renderizarGiroMesa(reservasHoje);
        _renderizarObsNoite(reservasHoje);

        try {
            const reaisSemana = (await db.getReservasPorPeriodo(hoje, _somarDias(hoje, 6)))
                .filter(r => r.nomes && !r.bloqueado && !r.somenteHospedes && !r.canceladoEm);
            _renderizarGraficos(reaisHoje, reaisSemana, hoje);
        } catch (e) {
            console.error('❌ Erro ao carregar semana:', e);
            _renderizarGraficos(reaisHoje, [], hoje);
        }

        console.log('✅ Home atualizada');
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────────────────────────────────────
function _renderizarKPIs(reservas, cancelamentos = 0) {
    let totalPax = 0, hospedes = 0, externos = 0, passantes = 0, roomservice = 0, criancas = 0, degustacao = 0;

    reservas.forEach(r => {
        const adt  = parseInt(r.paxs) || 0;
        const chd  = parseInt(r.chd)  || 0;
        const tipo = (r.tipo || 'hospede').toLowerCase();

        totalPax  += adt + chd;
        criancas  += chd;

        if      (tipo === 'hospede')      hospedes    += adt + chd;
        else if (tipo === 'externo')      externos    += adt + chd;
        else if (tipo === 'passante')     passantes   += adt + chd;
        else if (tipo === 'roomservice')  roomservice += 1;

        if (r.menuDegustacao) degustacao += adt;

    });

    _setKPI('home-kpi-pax',         totalPax);
    _setKPI('home-kpi-hospedes',    hospedes);
    _setKPI('home-kpi-externos',    externos);
    _setKPI('home-kpi-passantes',   passantes);
    _setKPI('home-kpi-roomservice', roomservice);
    _setKPI('home-kpi-criancas',    criancas);
    _setKPI('home-kpi-degustacao',  degustacao);
    _setKPI('home-kpi-cancelamentos', cancelamentos);

    // Oculta cards condicionais quando não há registros
    ['home-kpi-criancas', 'home-kpi-roomservice', 'home-kpi-degustacao', 'home-kpi-cancelamentos'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const totais_map = { 'home-kpi-criancas': criancas, 'home-kpi-roomservice': roomservice, 'home-kpi-degustacao': degustacao, 'home-kpi-cancelamentos': cancelamentos };
            el.closest('.home-kpi-card').style.display = totais_map[id] > 0 ? '' : 'none';
        }
    });
}

function _setKPI(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Giro de Mesa
// ─────────────────────────────────────────────────────────────────────────────
function _renderizarGiroMesa(reservas) {
    const container = document.getElementById('home-giro');
    if (!container) return;

    const isDark   = document.body.classList.contains('dark-theme');
    const agora    = new Date();
    const HORARIOS = getHorariosPadrao();

    const finalizadas = reservas.filter(r => r.inicioMesa && r.fimMesa);
    let tempoMedioMin = null;

    if (finalizadas.length > 0) {
        const somaMs = finalizadas.reduce((acc, r) =>
            acc + (new Date(r.fimMesa) - new Date(r.inicioMesa)), 0);
        tempoMedioMin = Math.round(somaMs / finalizadas.length / 60000);
    }

    const emCurso   = reservas.filter(r => r.inicioMesa && !r.fimMesa && r.mesa && r.mesa !== 'ROOM');
    const referencia = tempoMedioMin || 90;

    const horaAtual = agora.getHours() * 60 + agora.getMinutes();
    let alertaAtraso = null;

    for (const hr of HORARIOS) {
        const [h, m] = hr.split(':').map(Number);
        const hrMin  = h * 60 + m;
        if (hrMin <= horaAtual) continue;

        const resDoHr = reservas.filter(r => {
            const base = r.originalBase || r.horario;
            return base === hr && !r.mesa;
        });

        if (resDoHr.length > 0) {
            const mesasLivres = emCurso.filter(r => {
                const prevFim = new Date(new Date(r.inicioMesa).getTime() + referencia * 60000);
                return prevFim.getHours() * 60 + prevFim.getMinutes() <= hrMin;
            });
            const totalMesas  = getConfig().mesas || 18;
            const disponiveis = totalMesas - emCurso.length + mesasLivres.length;
            if (disponiveis < resDoHr.length) {
                alertaAtraso = { horario: hr, faltam: resDoHr.length - disponiveis };
            }
            break;
        }
    }

    const bgAlert = isDark ? 'rgba(231,76,60,0.12)' : 'rgba(231,76,60,0.07)';

    const elTempoLabel = document.getElementById('home-giro-tempo-label');
    if (elTempoLabel) {
        elTempoLabel.textContent = tempoMedioMin === null ? '' : `TEMPO MÉDIO · ${tempoMedioMin} MIN`;
        elTempoLabel.style.color = tempoMedioMin === null ? '' :
            tempoMedioMin > 110 ? '#e74c3c' :
            tempoMedioMin > 85  ? '#f39c12' : '#27ae60';
    }

    let html = '';

    if (emCurso.length === 0) {
        html += `<div style="padding:8px 0; opacity:.5; font-size:0.8rem;">Nenhuma mesa em atendimento agora.</div>`;
    } else {
        const previsoes = emCurso.map(r => {
            const prevFim = new Date(new Date(r.inicioMesa).getTime() + referencia * 60000);
            const diffMin = Math.round((prevFim - agora) / 60000);
            return { reserva: r, prevFim, diffMin };
        }).sort((a, b) => a.prevFim - b.prevFim);

        html += `<div style="font-size:0.85rem;font-weight:700;letter-spacing:0.4px;opacity:.75;margin-bottom:8px;">Próxima liberação prevista</div>`;

        previsoes.forEach(({ reserva: r, prevFim, diffMin }) => {
            const hrPrev   = prevFim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const corLib   = diffMin <= 0 ? '#e74c3c' : diffMin <= 15 ? '#27ae60' : diffMin <= 30 ? '#f39c12' : 'var(--texto)';
            const labelMin = diffMin <= 0 ? 'agora' : `em ${diffMin} min`;
            const border   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
            html += `
        <div style="display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid ${border};">
            <span style="font-size:0.85rem;font-weight:700;color:${corLib};min-width:46px;letter-spacing:0.2px;">${hrPrev}</span>
            <span style="font-size:0.85rem;font-weight:700;opacity:.75;flex:1;">Mesa ${r.mesa}</span>
            <span style="font-size:0.85rem;font-weight:400;opacity:.45;">· ${labelMin}</span>
        </div>`;
        });
    }

    if (alertaAtraso) {
        html += `
        <div style="background:${bgAlert};border-radius:12px;padding:14px 18px;border-left:4px solid #e74c3c;margin-top:10px;">
            <div style="font-size:0.72rem;font-weight:700;letter-spacing:.8px;color:#e74c3c;margin-bottom:4px;">⚠️ POSSÍVEL ATRASO</div>
            <div style="font-size:0.85rem;font-weight:600;">Horário ${alertaAtraso.horario}: faltam ${alertaAtraso.faltam} mesa${alertaAtraso.faltam > 1 ? 's' : ''} para acomodar todas as reservas a tempo.</div>
        </div>`;
    }

    container.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gráficos
// ─────────────────────────────────────────────────────────────────────────────
function _renderizarGraficos(reaisHoje, reaisSemana, hoje) {
    const isDark   = document.body.classList.contains('dark-theme');
    const corTexto = isDark ? '#b0b8d1' : '#555e7a';
    const corGrid  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(26,29,46,0.08)';

    _destruirGraficos();

    const ctxGauge = document.getElementById('home-chart-gauge');
    if (ctxGauge) {
        const capacidade = getConfig().capacidade || 30;
        let totalPax     = 0;
        reaisHoje.forEach(r => { totalPax += (parseInt(r.paxs) || 0) + (parseInt(r.chd) || 0); });

        const taxa    = Math.min(totalPax / capacidade, 1);
        const taxaPct = Math.round(taxa * 100);
        const livre   = Math.max(0, capacidade - totalPax);
        const cor     = taxa > 0.9 ? '#e74c3c' : taxa > 0.7 ? '#f39c12' : PALETA.accent;
        const corLivre = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

        const elPct = document.getElementById('home-gauge-pct');
        if (elPct) { elPct.textContent = taxaPct + '%'; elPct.style.color = cor; }

        const legOcupado = document.getElementById('home-gauge-leg-ocupado');
        const legLivre   = document.getElementById('home-gauge-leg-livre');
        if (legOcupado) {
            legOcupado.querySelector('span').style.background = cor;
            legOcupado.lastChild.textContent = ` Ocupado — ${totalPax}`;
        }
        if (legLivre) { legLivre.lastChild.textContent = ` Livre — ${livre}`; }

        chartGaugeInstance = new Chart(ctxGauge.getContext('2d'), {
            type: 'doughnut',
            data: { datasets: [{ data: [totalPax || 0.001, livre || 0.001], backgroundColor: [cor, corLivre], borderWidth: 0, hoverOffset: 6 }] },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '72%',
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ctx.dataIndex === 0 ? ` ${totalPax} pax ocupados (${taxaPct}%)` : ` ${livre} pax livres (${100 - taxaPct}%)` } }
                }
            }
        });
    }

    const ctxBarras = document.getElementById('home-chart-barras');
    if (ctxBarras) {
        // ✅ v2.4: Barra empilhada por tipo de cliente (hóspede/externo/passante),
        // mesma quebra do gráfico "Curva de Horário" do Dashboard (bug #45)
        const horarios  = getHorariosPadrao();
        const paxPorHr  = {};
        horarios.forEach(h => paxPorHr[h] = { hospede: 0, externo: 0, passante: 0 });
        reaisHoje.forEach(r => {
            const hr = r.originalBase || r.horario;
            const tipo = r.tipo ? r.tipo.toLowerCase() : 'hospede';
            if (paxPorHr[hr] !== undefined && paxPorHr[hr][tipo] !== undefined) {
                paxPorHr[hr][tipo] += (parseInt(r.paxs) || 0) + (parseInt(r.chd) || 0);
            }
        });

        chartBarrasInstance = new Chart(ctxBarras.getContext('2d'), {
            type: 'bar',
            data: {
                labels: horarios,
                datasets: [
                    { label: 'Hóspede', data: horarios.map(h => paxPorHr[h].hospede), backgroundColor: PALETA.hospede },
                    { label: 'Externo', data: horarios.map(h => paxPorHr[h].externo), backgroundColor: PALETA.externo },
                    { label: 'Passante', data: horarios.map(h => paxPorHr[h].passante), backgroundColor: PALETA.passante },
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { color: corTexto, font: { size: 10 }, boxWidth: 10 } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.x} pax` } }
                },
                scales: {
                    x: { stacked: true, ticks: { color: corTexto, font: { size: 11 } }, grid: { color: corGrid }, beginAtZero: true },
                    y: { stacked: true, ticks: { color: corTexto, font: { size: 11, weight: '700' } }, grid: { display: false } }
                }
            }
        });
    }

    const ctxSemana = document.getElementById('home-chart-semana');
    if (ctxSemana) {
        const paxPorData = {};
        for (let i = 0; i < 7; i++) paxPorData[_somarDias(hoje, i)] = 0;
        reaisSemana.forEach(r => { if (paxPorData[r.data] !== undefined) paxPorData[r.data] += (parseInt(r.paxs) || 0) + (parseInt(r.chd) || 0); });

        const datas   = Object.keys(paxPorData).sort();
        const labels  = datas.map(d => { const dt = new Date(d + 'T12:00:00'); return `${DIAS_SEMANA[dt.getDay()]} ${dt.getDate()}`; });
        const valores = datas.map(d => paxPorData[d]);

        chartSemanaInstance = new Chart(ctxSemana.getContext('2d'), {
            type: 'line',
            data: { labels, datasets: [{ label: 'PAX', data: valores, borderColor: PALETA.accent, backgroundColor: isDark ? 'rgba(108,99,255,0.15)' : 'rgba(108,99,255,0.10)', pointBackgroundColor: PALETA.accent, pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7, borderWidth: 2.5, fill: true, tension: 0.4 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { title: ctx => ctx[0].label, label: ctx => ` ${ctx.parsed.y} pax previstos` } } },
                scales: { x: { ticks: { color: corTexto, font: { size: 11 } }, grid: { color: corGrid } }, y: { ticks: { color: corTexto, font: { size: 11 }, stepSize: 5 }, grid: { color: corGrid }, beginAtZero: true } }
            }
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticker de cotações — portrait mobile
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// KPI Ticker — mobile/tablet (≤1024px)
// Clona os cards do grid original para o ticker e anima via RAF.
// Desktop: grid intocado, ticker display:none via CSS.
// ─────────────────────────────────────────────────────────────────────────────
let _kpiRafId  = null;
let _kpiPaused = false;
let _kpiGen    = 0;

// ── Obs Noite Ticker (scroll vertical) ──
let _obsRafId = null;
let _obsGen   = 0;

/**
 * Recria os clones no ticker com os valores atuais dos KPI cards.
 * Chamado após _renderizarKPIs() a cada update do Firebase.
 * Preserva o RAF em andamento — só atualiza o conteúdo, não reinicia a animação.
 */
function _atualizarClonesKpiTicker() {
    if (!window.matchMedia('(max-width: 1200px)').matches) return;
    const grid  = document.getElementById('home-kpis-grid');
    const inner = document.getElementById('kpi-ticker-inner');
    if (!grid || !inner) return;

    // Guarda offset atual para não pular visualmente
    const transformAtual = inner.style.transform;

    inner.innerHTML = '';
    const clone = () => {
        [...grid.children].forEach(card => inner.appendChild(card.cloneNode(true)));
    };
    clone(); clone(); clone();

    // Restaura posição para não haver salto
    if (transformAtual) inner.style.transform = transformAtual;
}

/**
 * Inicia o loop RAF do ticker. Chamado apenas uma vez por sessão de home.
 * Conteúdo dos cards é gerenciado por _atualizarClonesKpiTicker().
 */
function _iniciarKpiTicker() {
    if (!window.matchMedia('(max-width: 1200px)').matches) return;

    const wrap  = document.getElementById('kpi-ticker-wrap');
    const inner = document.getElementById('kpi-ticker-inner');
    if (!wrap || !inner) return;

    // Garante alturas explícitas — corrige o colapso height:0 no pai flex
    wrap.style.height    = '88px';
    wrap.style.minHeight = '88px';
    wrap.style.flexShrink = '0';
    wrap.style.overflow  = 'hidden';
    inner.style.height   = '88px';

    if (_kpiRafId) { cancelAnimationFrame(_kpiRafId); _kpiRafId = null; }
    _kpiPaused = false;

    inner.addEventListener('touchstart', () => { _kpiPaused = true; }, { passive: true });
    inner.addEventListener('touchend',   () => { setTimeout(() => { _kpiPaused = false; }, 1500); }, { passive: true });

    _kpiGen++;
    const gen = _kpiGen;

    function iniciarLoop() {
        if (_kpiGen !== gen) return;
        const conjW = inner.scrollWidth / 3;
        if (conjW <= 0) {
            // Ainda sem conteúdo — tenta novamente no próximo frame
            requestAnimationFrame(iniciarLoop);
            return;
        }

        let offset = 0;
        let lastTs = null;
        inner.style.transform = 'translateX(0)';

        function tick(ts) {
            if (_kpiGen !== gen) return;
            if (lastTs === null) lastTs = ts;
            const dt = Math.min(ts - lastTs, 50);
            lastTs = ts;
            if (!_kpiPaused) {
                offset += 0.04 * dt;
                if (offset >= conjW) offset -= conjW;
                inner.style.transform = `translateX(-${offset}px)`;
            }
            _kpiRafId = requestAnimationFrame(tick);
        }
        _kpiRafId = requestAnimationFrame(tick);
    }

    requestAnimationFrame(() => requestAnimationFrame(iniciarLoop));
}


// ─────────────────────────────────────────────────────────────────────────────
// Observações da Noite
// ─────────────────────────────────────────────────────────────────────────────
function _renderizarObsNoite(reservas) {
    const lista = document.getElementById('home-obs-lista');
    if (!lista) return;

    // Cancela ticker anterior
    if (_obsRafId) { cancelAnimationFrame(_obsRafId); _obsRafId = null; }
    _obsGen++;

    // ✅ v2.2: Inclui reservas com obs OU com menuDegustacao.
    // Antes: filtrava apenas r.obs — reservas com Menu Degustação sem obs ficavam invisíveis.
    // ✅ v2.6: Inclui também reservas canceladas — o restaurante precisa ver quem cancelou,
    // mesmo sem obs/degustação registrada.
    const comObs = reservas
        .filter(r => r.nomes && !r.bloqueado && !r.somenteHospedes &&
            (r.obs?.trim() || r.menuDegustacao || r.canceladoEm))
        .sort((a, b) => (a.horario || '').localeCompare(b.horario || ''));

    if (comObs.length === 0) {
        lista.innerHTML = `<div class="home-obs-vazio">Nenhuma observação registrada para esta noite.</div>`;
        return;
    }

    const isDark = document.body.classList.contains('dark-theme');
    const border = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

    const itemHtml = comObs.map(r => {
        const linhas = [];
        if (r.canceladoEm)    linhas.push(`<span class="home-obs-cancelada">❌ CANCELADA</span>`);
        if (r.menuDegustacao) linhas.push(`<span class="home-obs-deg">🍽️ Menu Degustação</span>`);
        if (r.obs?.trim())    linhas.push(`<span>${escapeHtml(r.obs)}</span>`);
        // Cancelada não tem mesa relevante (nunca chegou a sentar) — sempre mostra o horário.
        const mesaLabel = (!r.canceladoEm && r.mesa && r.mesa !== '' && r.mesa !== '-')
            ? (r.mesa === 'ROOM' ? 'RS' : `Mesa ${r.mesa}`)
            : r.horario;
        return `
        <div class="home-obs-row" style="border-bottom:1px solid ${border};" data-id="${r.id}">
            <div class="home-obs-mesa">${mesaLabel}</div>
            <div class="home-obs-texto">${r.nomes ? `<span class="home-obs-nome">${escapeHtml(r.nomes)}</span>` : ''}${linhas.join('')}</div>
        </div>`;
    }).join('');

    if (comObs.length === 1) {
        lista.innerHTML = itemHtml;
        return;
    }

    lista.innerHTML = `<div class="home-obs-inner">${itemHtml}${itemHtml}${itemHtml}</div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => _iniciarObsTicker(lista, _obsGen)));
}

/**
 * Anima o scroll vertical do card Observações da Noite via RAF.
 * Loop contínuo: triplicou o conteúdo, reseta ao atingir 1/3 do total.
 * Velocidade suave: ~20px/s.
 */
function _iniciarObsTicker(lista, gen) {
    const inner = lista.querySelector('.home-obs-inner');
    if (!inner) return;

    const conjH = inner.scrollHeight / 3;
    if (conjH <= 0) return;

    let offset  = 0;
    let lastTs  = null;

    function tick(ts) {
        if (_obsGen !== gen) return;
        if (lastTs === null) lastTs = ts;
        const dt = Math.min(ts - lastTs, 50);
        lastTs = ts;

        offset += 0.02 * dt;          // 20px/s — devagar para leitura confortável
        if (offset >= conjH) offset -= conjH;
        inner.style.transform = `translateY(-${offset}px)`;

        _obsRafId = requestAnimationFrame(tick);
    }
    _obsRafId = requestAnimationFrame(tick);
}


function _destruirGraficos() {
    if (chartGaugeInstance)  { chartGaugeInstance.destroy();  chartGaugeInstance  = null; }
    if (chartBarrasInstance) { chartBarrasInstance.destroy(); chartBarrasInstance = null; }
    if (chartSemanaInstance) { chartSemanaInstance.destroy(); chartSemanaInstance = null; }
}

function _dataHoje() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _somarDias(dataStr, dias) {
    const d = new Date(dataStr + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _mostrarSkeleton() {
    ['home-kpi-pax','home-kpi-hospedes','home-kpi-externos',
     'home-kpi-passantes','home-kpi-roomservice','home-kpi-criancas']
        .forEach(id => _setKPI(id, '…'));
    const giro = document.getElementById('home-giro');
    if (giro) giro.innerHTML = `<div style="text-align:center;padding:28px 0;opacity:.4;font-size:0.85rem;">Carregando…</div>`;
}

function _mostrarErro() {
    const giro = document.getElementById('home-giro');
    if (giro) giro.innerHTML = `<div style="text-align:center;padding:28px 0;color:#e74c3c;font-size:0.85rem;">Erro ao carregar dados.</div>`;
}

window.carregarHome = carregarHome;
