import { paxReserva, reservaAtiva, tipoCliente } from './analytics.js';

export const PERFIS_BI = ['hospede', 'externo', 'passante', 'roomservice'];
export const DIAS_BI = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
// Ministério das Comunicações, consultado em 03/11/2026. 61 abrange DF e GO.
// https://www.gov.br/mcom/pt-br/noticias/2026/agosto/saiba-a-importancia-da-discagem-direta-a-distancia-ddd
const CODIGOS_UF = {
    SP: '11 12 13 14 15 16 17 18 19', RJ: '21 22 24', ES: '27 28', MG: '31 32 33 34 35 37 38',
    PR: '41 42 43 44 45 46', SC: '47 48 49', RS: '51 53 54 55', 'DF/GO': '61', GO: '62 64',
    TO: '63', MT: '65 66', MS: '67', AC: '68', RO: '69', BA: '71 73 74 75 77', SE: '79',
    PE: '81 87', AL: '82', PB: '83', RN: '84', CE: '85 88', PI: '86 89', PA: '91 93 94',
    AM: '92 97', RR: '95', AP: '96', MA: '98 99',
};
const UF_POR_DDD = Object.fromEntries(Object.entries(CODIGOS_UF).flatMap(([uf, codigos]) => codigos.split(' ').map(ddd => [ddd, uf])));

export function identificarDDD(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return { situacao: 'ausente' };
    let numero = texto.replace(/\D/g, '');
    if (/^\+/.test(texto)) {
        if (!numero.startsWith('55')) return { situacao: 'internacional' };
        numero = numero.slice(2);
    } else if (numero.startsWith('00')) {
        // 00 + código do país; formatos com código de operadora não são inferidos.
        if (!numero.startsWith('0055')) return { situacao: 'internacional' };
        numero = numero.slice(4);
    } else if ((numero.length === 12 || numero.length === 13) && numero.startsWith('55')) {
        numero = numero.slice(2);
    } else if (/^0\d{10,11}$/.test(numero)) {
        numero = numero.slice(1);
    }
    if (!/^\d{10,11}$/.test(numero)) return { situacao: 'invalido' };
    const ddd = numero.slice(0, 2), assinante = numero.slice(2);
    if (!UF_POR_DDD[ddd] || !/^(?:[2-5]\d{7}|9\d{8})$/.test(assinante)) return { situacao: 'invalido' };
    return { situacao: 'valido', ddd, uf: UF_POR_DDD[ddd] };
}

export function dataBIValida(data) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) return false;
    const d = new Date(data + 'T12:00:00Z');
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === data;
}

export function datasDaConsultaBI(consulta) {
    if (consulta.modo === 'especificas') return [...new Set(consulta.datas)].filter(dataBIValida).sort();
    if (!dataBIValida(consulta.inicio) || !dataBIValida(consulta.fim) || consulta.inicio > consulta.fim) return [];
    const excluidas = new Set(consulta.excluidas || []), datas = [];
    for (let d = new Date(consulta.inicio + 'T12:00:00Z'), fim = new Date(consulta.fim + 'T12:00:00Z'); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
        const data = d.toISOString().slice(0, 10);
        if (!excluidas.has(data)) datas.push(data);
    }
    return datas;
}

const contagem = () => ({ reservas: 0, pax: 0 });
const porPerfil = () => Object.fromEntries(PERFIS_BI.map(p => [p, contagem()]));
const diaSemana = data => (new Date(data + 'T12:00:00Z').getUTCDay() + 6) % 7;
const somar = (alvo, pax) => { alvo.reservas++; alvo.pax += pax; };

/** Função pura: nenhum acesso a DOM/banco; datas são o calendário aplicado, inclusive dias sem lançamento. */
export function calcularBI(reservas, datas = []) {
    const calendario = [...new Set(datas)].filter(dataBIValida).sort();
    const datasPermitidas = new Set(calendario);
    const elegiveis = reservas.filter(r => (!datasPermitidas.size || datasPermitidas.has(r.data)) && reservaAtiva({ ...r, canceladoEm: null }));
    const ativas = elegiveis.filter(r => !r.canceladoEm);
    const m = {
        datas: calendario, dias: calendario.length, perfis: porPerfil(), restaurante: contagem(), total: contagem(),
        degustacao: contagem(), degustacaoPerfil: porPerfil(), criancas: 0, adultos: 0,
        diario: Object.fromEntries(calendario.map(d => [d, porPerfil()])),
        semana: DIAS_BI.map(() => ({ ocorrencias: 0, perfis: porPerfil() })), horarios: {},
        grupos: { '1 pessoa': 0, '2 pessoas': 0, '3–4 pessoas': 0, '5–6 pessoas': 0, '7+ pessoas': 0, 'PAX não informado': 0 },
        pagamentos: { pago: 0, pendente: 0, direto: 0, desconhecido: 0, outro: 0 }, pagamentoTotal: 0,
        avulsaAusente: 0, canceladas: contagem(), canceladasPerfil: porPerfil(), noShows: contagem(),
        estornos: { estornado: 0, retido: 0, desconhecido: 0 },
        origem: { valido: 0, ausente: 0, invalido: 0, internacional: 0, ufs: {}, ddds: {} },
        dadosInvalidos: 0,
    };
    calendario.forEach(data => m.semana[diaSemana(data)].ocorrencias++);
    elegiveis.forEach(r => {
        const tipo = tipoCliente(r), pax = paxReserva(r);
        if (r.canceladoEm) {
            somar(m.canceladas, pax);
            if (m.canceladasPerfil[tipo]) somar(m.canceladasPerfil[tipo], pax);
            m.estornos[r.depositoRetido === false ? 'estornado' : r.depositoRetido === true ? 'retido' : 'desconhecido']++;
            return;
        }
        if (r.statusRecepcao === 'no_show') somar(m.noShows, pax);
        somar(m.total, pax);
        if (m.perfis[tipo]) somar(m.perfis[tipo], pax);
        if (dataBIValida(r.data)) {
            if (!m.diario[r.data]) m.diario[r.data] = porPerfil();
            if (m.diario[r.data][tipo]) somar(m.diario[r.data][tipo], pax);
        }
        if (!PERFIS_BI.includes(tipo) || !dataBIValida(r.data) || [r.paxs, r.chd].some(v => v != null && v !== '' && (!Number.isInteger(Number(v)) || Number(v) < 0))) m.dadosInvalidos++;
        if (tipo !== 'roomservice') {
        const origem = identificarDDD(r.whatsapp);
        m.origem[origem.situacao]++;
        if (origem.situacao === 'valido') {
            m.origem.ufs[origem.uf] = (m.origem.ufs[origem.uf] || 0) + 1;
            m.origem.ddds[origem.ddd] = (m.origem.ddds[origem.ddd] || 0) + 1;
        }
        }
        // Degustação refere-se à marca da reserva, não ao consumo individual.
        if (r.menuDegustacao) {
            somar(m.degustacao, pax);
            if (m.degustacaoPerfil[tipo]) somar(m.degustacaoPerfil[tipo], pax);
        }
        if (tipo === 'roomservice') return;
        somar(m.restaurante, pax);
        m.adultos += Math.max(0, parseInt(r.paxs) || 0);
        m.criancas += Math.max(0, parseInt(r.chd) || 0);
        if (dataBIValida(r.data)) {
            const dia = diaSemana(r.data);
            if (m.semana[dia].perfis[tipo]) somar(m.semana[dia].perfis[tipo], pax);
            const horario = r.horario || r.originalBase;
            if (/^\d{2}:\d{2}$/.test(horario || '')) {
                if (!m.horarios[horario]) m.horarios[horario] = DIAS_BI.map(porPerfil);
                if (m.horarios[horario][dia][tipo]) somar(m.horarios[horario][dia][tipo], pax);
            }
        }
        const grupo = pax === 0 ? 'PAX não informado' : pax === 1 ? '1 pessoa' : pax === 2 ? '2 pessoas' : pax <= 4 ? '3–4 pessoas' : pax <= 6 ? '5–6 pessoas' : '7+ pessoas';
        m.grupos[grupo]++;
        const pagamento = String(r.pagamento || '').trim().toLowerCase();
        // O campo legado vazio foi oferecido apenas a externos; outros perfis vazios
        // não significam pagamento direto. Mantém valores explícitos de qualquer perfil.
        if (pagamento || tipo === 'externo') {
            const categoria = !pagamento && tipo === 'externo' ? 'direto' : pagamento;
            m.pagamentos[['pago', 'pendente', 'direto'].includes(categoria) ? categoria : 'outro']++;
            m.pagamentoTotal++;
        }
        if (pagamento === 'pago' && !String(r.avulsa || '').trim()) m.avulsaAusente++;
    });
    m.diario = Object.fromEntries(Object.entries(m.diario).sort(([a], [b]) => a.localeCompare(b)));
    m.taxaCancelamento = elegiveis.length ? m.canceladas.reservas / elegiveis.length * 100 : null;
    m.taxaDegustacao = ativas.length ? m.degustacao.reservas / ativas.length * 100 : null;
    const decididos = m.estornos.estornado + m.estornos.retido;
    m.taxaEstorno = decididos ? m.estornos.estornado / decididos * 100 : null;
    return m;
}
