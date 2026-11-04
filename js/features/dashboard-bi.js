import { calcularBI, DIAS_BI, PERFIS_BI } from '../core/bi.js';
import { CORES_OSTERIA, coresGrafico } from '../core/theme.js';
import { escapeHtml } from './reservas/validators.js';

const NOMES = { hospede: 'Hóspedes', externo: 'Externos', passante: 'Passantes', roomservice: 'Room Service' };
let metricas = null;
const graficos = new Map();
const fmt = n => n == null ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(n);
const diaBR = data => data.split('-').reverse().join('/');
function escrever(id, valor) { const el = document.getElementById(id); if (el) el.textContent = valor; }

export function limparBI() {
    for (const chart of graficos.values()) chart.destroy();
    graficos.clear(); metricas = null;
    const evolucao = document.getElementById('biEvolucaoPainel');
    if (evolucao) evolucao.hidden = true;
    document.querySelectorAll('#tela-dashboard [data-bi-value]').forEach(el => { el.textContent = '—'; });
    document.querySelectorAll('#tela-dashboard [data-bi-content]').forEach(el => { el.replaceChildren(); });
    document.querySelectorAll('#tela-dashboard canvas[data-bi-chart]').forEach(el => { el.setAttribute('aria-label', 'Dados indisponíveis. Aplique uma análise.'); });
}

export function processarBI(reservas, datas) {
    metricas = calcularBI(reservas, datas);
    renderizarBI();
}

function grafico(id, tipo, labels, datasets, { horizontal = false, yTitle = 'Reservas', xTitle = '', decimal = false, legenda = false } = {}) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    graficos.get(id)?.destroy(); graficos.delete(id);
    if (typeof Chart === 'undefined') throw new Error('Os gráficos não carregaram. Recarregue a página.');
    const cores = coresGrafico(document.body.classList.contains('dark-theme'));
    canvas.setAttribute('aria-label', labels.map((label, i) => `${label}: ${datasets.map(d => `${d.label} ${fmt(d.data[i])}`).join(', ')}`).join('; ') || 'Nenhum registro no período');
    const options = {
        responsive: true, maintainAspectRatio: false, animation: false, indexAxis: horizontal ? 'y' : 'x',
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: legenda, position: 'bottom', labels: { color: cores.texto, boxWidth: 10, font: { size: 11 } } } },
        scales: {
            x: { ticks: { color: cores.texto, autoSkip: true, maxTicksLimit: horizontal ? 7 : 10 }, grid: { color: horizontal ? cores.grade : 'transparent' }, title: { display: !!xTitle, text: xTitle, color: cores.texto } },
            y: { ticks: { color: cores.texto }, grid: { color: horizontal ? 'transparent' : cores.grade }, title: { display: !!yTitle, text: yTitle, color: cores.texto } },
        },
    };
    const numerico = horizontal ? options.scales.x : options.scales.y;
    numerico.beginAtZero = true;
    if (!decimal) numerico.ticks.precision = 0;
    graficos.set(id, new Chart(canvas.getContext('2d'), { type: tipo, data: { labels, datasets }, options }));
}

function barras(id, entradas, color = CORES_OSTERIA.accent, titulo = 'Reservas') {
    grafico(id, 'bar', entradas.map(([label]) => label), [{ label: titulo, data: entradas.map(([,n]) => n), backgroundColor: color, borderRadius: 3 }], { horizontal: true, xTitle: titulo, yTitle: '' });
}

function renderizarMapa(m) {
    const el = document.getElementById('biMapa'); if (!el) return;
    const perfil = document.getElementById('dashMapaPerfil')?.value || 'todos';
    const perfis = perfil === 'todos' ? PERFIS_BI.filter(p => p !== 'roomservice') : [perfil];
    const linhas = Object.entries(m.horarios).sort(([a],[b]) => a.localeCompare(b)).map(([hora, dias]) => [hora, dias.map(d => perfis.reduce((s,p) => s + (d[p]?.pax || 0), 0))]);
    if (!linhas.length) { el.textContent = 'Nenhum horário de restaurante registrado nesta seleção.'; return; }
    const max = Math.max(1, ...linhas.flatMap(([,valores]) => valores));
    el.innerHTML = `<table class="bi-heatmap"><caption>Pessoas reservadas por horário e dia da semana · ${escapeHtml(perfil === 'todos' ? 'todos os perfis de restaurante' : NOMES[perfil])}</caption><thead><tr><th scope="col">Horário</th>${DIAS_BI.map(d => `<th scope="col">${d}</th>`).join('')}</tr></thead><tbody>${linhas.map(([hora, valores]) => `<tr><th scope="row">${escapeHtml(hora)}</th>${valores.map(v => `<td><span style="--bi-intensidade:${Math.round(v / max * 60) + 5}%">${v}</span></td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderizarBI() {
    if (!metricas) return;
    const m = metricas;
    const unidade = document.getElementById('dashUnidadeBI')?.value || 'pax';
    const media = (document.getElementById('dashSemanaModo')?.value || 'media') === 'media';
    const unidadeNome = unidade === 'pax' ? 'Pessoas' : 'Reservas';
    escrever('biPaxRestaurante', fmt(m.restaurante.pax)); escrever('biReservas', fmt(m.restaurante.reservas));
    escrever('biAdultos', fmt(m.adultos)); escrever('biCriancas', fmt(m.criancas));
    escrever('biMediaDia', fmt(m.dias ? m.restaurante.pax / m.dias : null));
    escrever('biDegustacao', fmt(m.degustacao.reservas));
    escrever('biDegustacaoPax', fmt(m.degustacao.pax));
    escrever('biDegustacaoTaxa', fmt(m.taxaDegustacao) + (m.taxaDegustacao == null ? '' : '%'));
    escrever('biDDDValidos', fmt(m.origem.valido)); escrever('biDDDTotal', fmt(m.total.reservas));
    escrever('biDDDCobertura', m.total.reservas ? fmt(m.origem.valido / m.total.reservas * 100) + '%' : '—');
    escrever('biDDDFaltantes', `${m.origem.ausente} sem telefone · ${m.origem.invalido} inválidos · ${m.origem.internacional} internacionais`);
    escrever('biRecebidos', fmt(m.pagamentos.pago)); escrever('biPendentes', fmt(m.pagamentos.pendente)); escrever('biDireto', fmt(m.pagamentos.direto));
    escrever('biPagamentosEscopo', `${m.pagamentoTotal} reservas não canceladas de restaurante · ${m.pagamentos.desconhecido} sem informação/não aplicável · ${m.pagamentos.outro} com outro valor`);
    escrever('biAvulsaAusente', `${m.avulsaAusente} reservas com depósito recebido sem número de avulsa registrado.`);
    escrever('biCancelamentos', fmt(m.canceladas.reservas)); escrever('biCancelamentosPax', fmt(m.canceladas.pax));
    escrever('biCancelTaxa', fmt(m.taxaCancelamento) + (m.taxaCancelamento == null ? '' : '%'));
    escrever('biCancelBase', `${m.total.reservas + m.canceladas.reservas} reservas elegíveis · data do jantar`);
    escrever('biEstornados', fmt(m.estornos.estornado)); escrever('biRetidos', fmt(m.estornos.retido)); escrever('biSemDeposito', fmt(m.estornos.desconhecido));
    escrever('biEstornoTaxa', m.taxaEstorno == null ? 'Sem decisão informada' : `${fmt(m.taxaEstorno)}% estornados entre ${m.estornos.estornado + m.estornos.retido} decisões informadas`);
    escrever('biRoom', `${m.perfis.roomservice.reservas} atendimentos · ${m.perfis.roomservice.pax} PAX registrados`);
    escrever('biFamilias', `${m.adultos} adultos · ${m.criancas} crianças no restaurante`);
    escrever('biQualidade', m.dadosInvalidos ? `${m.dadosInvalidos} registros com data, tipo ou PAX inconsistentes. Quantidades negativas não são somadas.` : 'Tempos de atendimento usam apenas cronômetros registrados. No-show automático não comprova falta.');

    const perfis = PERFIS_BI.filter(p => p !== 'roomservice');
    const datas = Object.keys(m.diario);
    const mostrarEvolucao = m.dias > 1;
    const painelEvolucao = document.getElementById('biEvolucaoPainel');
    if (painelEvolucao) painelEvolucao.hidden = !mostrarEvolucao;
    if (mostrarEvolucao) {
        grafico('chartEvolucaoBI', 'line', datas.map(diaBR), perfis.map(p => ({ label: NOMES[p], data: datas.map(d => m.diario[d][p][unidade]), borderColor: CORES_OSTERIA[p], backgroundColor: CORES_OSTERIA[p], tension: .2, pointRadius: datas.length > 45 ? 0 : 2, borderWidth: 2, ...(p === 'passante' ? { borderDash: [4,3] } : {}) })), { yTitle: unidadeNome, xTitle: 'Data do jantar', legenda: true });
    } else {
        graficos.get('chartEvolucaoBI')?.destroy(); graficos.delete('chartEvolucaoBI');
    }
    grafico('chartSemanaBI', 'bar', DIAS_BI, perfis.map(p => ({ label: NOMES[p], data: m.semana.map(d => media ? (d.ocorrencias ? d.perfis[p][unidade] / d.ocorrencias : null) : d.perfis[p][unidade]), backgroundColor: CORES_OSTERIA[p], borderRadius: 2 })), { yTitle: media ? `${unidadeNome} / ocorrência do dia` : unidadeNome, xTitle: 'Dia da semana', decimal: media, legenda: true });
    escrever('biSemanaBase', DIAS_BI.map((d,i) => `${d}: ${m.semana[i].ocorrencias}`).join(' · ') + ' ocorrências nas datas selecionadas.');
    const resumo = document.getElementById('biPerfis');
    if (resumo) resumo.innerHTML = `<table class="bi-table"><caption>Movimento por tipo de cliente · reservas não canceladas</caption><thead><tr><th scope="col">Perfil</th><th scope="col">Reservas</th><th scope="col">Pessoas</th><th scope="col">% pessoas</th></tr></thead><tbody>${PERFIS_BI.map(p => `<tr><th scope="row">${NOMES[p]}</th><td>${m.perfis[p].reservas}</td><td>${m.perfis[p].pax}</td><td>${m.total.pax ? fmt(m.perfis[p].pax / m.total.pax * 100) + '%' : '—'}</td></tr>`).join('')}</tbody></table>`;
    barras('chartUFBI', Object.entries(m.origem.ufs).sort((a,b) => b[1]-a[1]), CORES_OSTERIA.accent);
    barras('chartDegustacaoBI', PERFIS_BI.map(p => [NOMES[p], m.degustacaoPerfil[p].reservas]), PERFIS_BI.map(p => CORES_OSTERIA[p]));
    barras('chartGruposBI', Object.entries(m.grupos), CORES_OSTERIA.hospede);
    barras('chartPagamentosBI', [['Depósito recebido',m.pagamentos.pago],['Depósito pendente',m.pagamentos.pendente],['Pagamento direto',m.pagamentos.direto],['Não informado / N.A.',m.pagamentos.desconhecido],['Outro valor',m.pagamentos.outro]], [CORES_OSTERIA.sucesso,CORES_OSTERIA.aviso,CORES_OSTERIA.hospede,CORES_OSTERIA.accent,CORES_OSTERIA.erro]);
    barras('chartCancelamentosBI', PERFIS_BI.map(p => [NOMES[p],m.canceladasPerfil[p].reservas]), PERFIS_BI.map(p => CORES_OSTERIA[p]));
    barras('chartCancelamentosNoShowBI', [['Canceladas',m.canceladas.reservas],['No-show registrado',m.noShows.reservas]], [CORES_OSTERIA.erro,CORES_OSTERIA.aviso]);
    renderizarMapa(m);
}

function ativarAba(botao) {
    document.querySelectorAll('#tela-dashboard [data-bi-tab]').forEach(b => {
        const selecionado = b === botao;
        b.setAttribute('aria-selected', String(selecionado));
        const painel = document.getElementById(b.getAttribute('aria-controls'));
        if (painel) painel.hidden = !selecionado;
    });
    for (const chart of graficos.values()) chart.resize?.();
    // Também redimensiona os gráficos complementares após sair de uma aba oculta.
    document.querySelectorAll('#tela-dashboard canvas:not([data-bi-chart])').forEach(canvas => {
        if (typeof Chart !== 'undefined' && typeof Chart.getChart === 'function') Chart.getChart(canvas)?.resize();
    });
}
document.addEventListener('click', e => {
    const botao = e.target.closest?.('[data-bi-tab]');
    if (botao) ativarAba(botao);
});
document.addEventListener('keydown', e => {
    if (!e.target.matches?.('[data-bi-tab]') || !['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
    const botoes = [...document.querySelectorAll('#tela-dashboard [data-bi-tab]')];
    const i = botoes.indexOf(e.target), n = botoes.length;
    const proximo = e.key === 'Home' ? 0 : e.key === 'End' ? n-1 : (i + (e.key === 'ArrowRight' ? 1 : n-1)) % n;
    e.preventDefault(); ativarAba(botoes[proximo]); botoes[proximo].focus();
});
document.addEventListener('change', e => {
    if (['dashUnidadeBI','dashSemanaModo','dashMapaPerfil'].includes(e.target.id)) renderizarBI();
});
document.addEventListener('osteria:themechange', renderizarBI);
document.addEventListener('toggle', e => {
    if (!e.target.matches?.('#tela-dashboard .bi-details') || !e.target.open) return;
    document.querySelectorAll('#tela-dashboard canvas').forEach(canvas => {
        if (typeof Chart !== 'undefined' && typeof Chart.getChart === 'function') Chart.getChart(canvas)?.resize();
    });
}, true);
