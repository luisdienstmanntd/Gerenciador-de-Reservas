/* =========================================================================================
   OSTERIA DI LUCCA - RENDER.JS (v5.9)
   RESPONSABILIDADE: Renderização da Interface (Grid e Cards)
   ✅ v4.0: Adicionado data-timer-id na linha do timer ativo
   ✅ v4.1: Substituído window.linhasExtras por getLinhasExtras() (arquitetura correta)
   ✅ v4.2: Adicionado data-tipo no timer ATIVO (corrige regra de cor do room service)
   ✅ v4.3: linhasMigradas indexado por hrBase — linha vazia com horário editado renderiza corretamente
   ✅ v5.0: Horários editados aparecem como blocos próprios na ordem cronológica correta
   ✅ v5.1: rowspan do bloco padrão inclui linhas migradas — corrige células HORA ausentes
   ✅ v5.2: Reservas com nome e horário editado para slot padrão renderizam no bloco do originalBase
   ✅ v5.3: Blocos editados detectados por originalBase (não só linhas vazias) — reservas com nome geram bloco próprio
   ✅ v5.4: Branch de filtro ativo corrigido — inclui blocos editados + hrSlot na célula HORA (fix rowspan)
   ✅ v5.5: Remove onclick inline das células vazias — usa data-* attributes para evitar duplo disparo
            com o event listener do init.js (bubbling + onclick = duas chamadas por clique)
   ✅ v5.6: Remove onclick inline das células de reserva (com nome) e bloqueio — usa data-id
            Elimina duplo disparo confirmado: onclick inline + event delegation do init.js
   ✅ v5.7: Remove onclick inline das células .linha-horario — usa data-hrbase + event delegation
   ✅ v5.8: Expande limiteConfigurado quando reserva real (bloqueio/nome) existe além do range visual
            Completa a eliminação de todos os onclicks inline da tabela (regra arquitetural)
   ✅ v5.9: Reservas reais têm prioridade sobre docs vazios na mesma posição ao preencher slotsBase
            Evita que doc vazio fantasma sobrescreva reserva real quando ambos estão na mesma posição
   ========================================================================================= */

import { getHorariosPadrao, getLinhasExtras, getFiltroAtivo } from '../core/state.js';

/**
 * Atualiza os mini-cards do header com totais
 */
export function atualizarMiniCards(reservas) {
    let totais = {
        totalPax: 0,
        criancas: 0,
        hospedes: 0,
        externos: 0,
        passantes: 0,
        roomservice: 0,
        menuDegustacao: 0,
        tempoTotal: 0,
        mesasFinalizadas: 0
    };

    reservas.forEach(r => {
        if (r.bloqueado || r.somenteHospedes || !r.nomes) return;

        let qtdAdultos = parseInt(r.paxs) || 0;
        let qtdCriancas = parseInt(r.chd) || 0;
        let totalReserva = qtdAdultos + qtdCriancas;

        totais.totalPax += totalReserva;
        totais.criancas += qtdCriancas;

        let tipo = r.tipo ? r.tipo.toLowerCase() : 'hospede';
        if (tipo === 'hospede') totais.hospedes += totalReserva;
        else if (tipo === 'externo') totais.externos += totalReserva;
        else if (tipo === 'passante') totais.passantes += totalReserva;
        else if (tipo === 'roomservice') totais.roomservice += 1;

        if (r.menuDegustacao) totais.menuDegustacao += qtdAdultos;

        if (r.inicioMesa && r.fimMesa) {
            let inicio = new Date(r.inicioMesa);
            let fim = new Date(r.fimMesa);
            let diffMins = Math.floor((fim - inicio) / 1000 / 60);
            
            if (diffMins >= 0 && diffMins < 300) {
                totais.tempoTotal += diffMins;
                totais.mesasFinalizadas++;
            }
        }
    });

    const elTotal = document.getElementById('dashTotalPax');
    const elCriancas = document.getElementById('dashCriancas');
    const elHosp = document.getElementById('dashHospedes');
    const elExt = document.getElementById('dashExternos');
    const elPass = document.getElementById('dashPassantes');
    const elRoom = document.getElementById('dashRoomService');
    const elDeg  = document.getElementById('dashMenuDegustacao');
    const elTempo = document.getElementById('countTempo');

    if (elTotal) elTotal.innerText = totais.totalPax;
    if (elCriancas) elCriancas.innerText = totais.criancas;
    if (elHosp) elHosp.innerText = totais.hospedes;
    if (elExt) elExt.innerText = totais.externos;
    if (elPass) elPass.innerText = totais.passantes;
    if (elRoom) elRoom.innerText = totais.roomservice;
    if (elDeg)  elDeg.innerText  = totais.menuDegustacao;

    // Oculta cards condicionais quando não há registros
    if (elCriancas) elCriancas.closest('.mini-card').style.display = totais.criancas      > 0 ? '' : 'none';
    if (elRoom)     elRoom.closest('.mini-card').style.display     = totais.roomservice   > 0 ? '' : 'none';
    if (elDeg)      elDeg.closest('.mini-card').style.display      = totais.menuDegustacao > 0 ? '' : 'none';
    
    if (elTempo) {
        let tempoMedio = totais.mesasFinalizadas > 0 
            ? Math.round(totais.tempoTotal / totais.mesasFinalizadas) 
            : 0;
        elTempo.innerText = tempoMedio > 0 ? tempoMedio + ' min' : '-- min';
    }
}

/**
 * Renderiza a grid completa de reservas
 */
export function renderizarGrid(reservas) {
    const container = document.getElementById("gridReservas");
    if (!container) return;

    atualizarMiniCards(reservas);

    let reservasFiltradas = reservas;
    const filtro = getFiltroAtivo();
    
    if (filtro) {
        reservasFiltradas = reservas.filter(r => {
            if (r.bloqueado || r.somenteHospedes || !r.nomes) return false;
            if (filtro === 'todos') return true;
            if (filtro === 'criancas') return parseInt(r.chd || 0) > 0;
            if (filtro === 'menuDegustacao') return r.menuDegustacao === true;
            return (r.tipo || 'hospede').toLowerCase() === filtro;
        });
    }

    let html = `
<table class="tabela-reservas">
    <thead>
        <tr>
            <th>HORA</th>
            <th>DADOS DA RESERVA</th>
            <th class="col-pax">PAX</th>
            <th class="col-chd">CHD</th>
            <th>MESA</th>
            <th class="col-av">AV</th>
        </tr>
    </thead>
    <tbody>`;

    const horariosPadrao = getHorariosPadrao();
    const linhasExtras = getLinhasExtras();

    if (filtro && reservasFiltradas.length > 0) {
        // ✅ v5.4: Inclui blocos editados (fora do padrão) no branch de filtro
        const horariosPadraoSet = new Set(horariosPadrao);

        // Agrupa reservas filtradas por slot (originalBase ou horario)
        const reservasPorHorario = {};
        reservasFiltradas.forEach(r => {
            const h = r.originalBase || r.horario;
            if (!reservasPorHorario[h]) reservasPorHorario[h] = [];
            reservasPorHorario[h].push(r);
        });

        // Monta lista ordenada de slots que têm reservas filtradas (padrão + editados)
        const slotsComFiltro = Object.keys(reservasPorHorario).sort((a, b) => a.localeCompare(b));

        slotsComFiltro.forEach(hrSlot => {
            const reservasDoSlot = reservasPorHorario[hrSlot];
            reservasDoSlot.forEach((res, idx) => {
                const tdHora = idx === 0
                    ? `<td class="linha-horario" rowspan="${reservasDoSlot.length}">${hrSlot}</td>`
                    : '';
                html += renderizarLinha(res, res.horario, res.posicao, tdHora, hrSlot);
            });
            html += `<tr class="separador-horario"><td colspan="6"></td></tr>`;
        });

    } else if (!filtro) {

        // ── Monta lista de blocos a renderizar ──────────────────────────────────────────
        const horariosPadraoSet = new Set(horariosPadrao);
        const horariosEditados = new Set();
        reservas.forEach(r => {
            const base = r.originalBase || r.horario;
            if (base && !horariosPadraoSet.has(base)) {
                horariosEditados.add(base);
            }
        });

        // Monta lista ordenada de todos os blocos (padrão + editados)
        const todosOsBlocos = [...horariosPadrao, ...horariosEditados]
            .sort((a, b) => a.localeCompare(b));

        // Renderiza cada bloco
        todosOsBlocos.forEach((hrBloco) => {
            const isEditado = !horariosPadraoSet.has(hrBloco);

            if (isEditado) {
                // ── Bloco de horário editado ──
                const linhasEditadas = reservas.filter(r =>
                    (r.originalBase || r.horario) === hrBloco
                );
                if (linhasEditadas.length === 0) return;

                linhasEditadas.sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0));

                const totalLinhas = linhasEditadas.length;
                linhasEditadas.forEach((res, i) => {
                    const tdHora = i === 0
                        ? `<td class="linha-horario" rowspan="${totalLinhas}" data-hrbase="${hrBloco}">${hrBloco}</td>`
                        : '';
                    html += renderizarLinha(res, res.horario || hrBloco, res.posicao, tdHora, hrBloco);
                });
                html += `<tr class="separador-horario"><td colspan="6"></td></tr>`;

            } else {
                // ── Bloco padrão ──
                const hrBase = hrBloco;

                const filtradasBase = reservas.filter(r => {
                    if (r.originalBase === hrBase || (!r.originalBase && r.horario === hrBase)) {
                        if (!r.nomes && !r.bloqueado && !r.somenteHospedes &&
                            r.horario && !horariosPadraoSet.has(r.horario)) return false;
                        return true;
                    }
                    return false;
                });

                let limiteConfigurado = 3 + (linhasExtras[hrBase] || 0);

                // ✅ v5.8: Expande limite se houver reserva real (bloqueio/nome) além do range.
                // Cenário: 3 linhas → remove 1 → limite=2 → bloqueia pos 2 (salva fora do range)
                // Sem expansão, o bloqueio ficaria invisível na grade.
                filtradasBase.forEach(r => {
                    if ((r.nomes || r.bloqueado || r.somenteHospedes) &&
                        r.posicao != null && r.posicao >= limiteConfigurado) {
                        limiteConfigurado = r.posicao + 1;
                    }
                });

                // ✅ v5.9: Reservas reais têm prioridade sobre docs vazios na mesma posição.
                // Antes, um único loop sobrescrevia indiscriminadamente — se um vazio fantasma
                // chegasse depois da reserva real no array (ordem não garantida pelo Firestore),
                // o slot exibia "+ DISPONÍVEL" em vez do nome da reserva.
                const reaisBase = filtradasBase.filter(r => r.nomes || r.bloqueado || r.somenteHospedes);
                const vaziosBase = filtradasBase.filter(r => !r.nomes && !r.bloqueado && !r.somenteHospedes);

                let slotsBase = new Array(limiteConfigurado).fill(null);
                reaisBase.forEach(r => {
                    if (r.posicao != null && r.posicao < limiteConfigurado) {
                        slotsBase[r.posicao] = r;
                    }
                });
                vaziosBase.forEach(r => {
                    if (r.posicao != null && r.posicao < limiteConfigurado && slotsBase[r.posicao] === null) {
                        slotsBase[r.posicao] = r;
                    }
                });

                let linhasOrdenadas = slotsBase.map((res, index) => ({ res, idxOrig: index }));

                const linhasMigradas = reservas.filter(r =>
                    r.originalBase === hrBase &&
                    r.horario && r.horario !== hrBase &&
                    horariosPadraoSet.has(r.horario) &&
                    !filtradasBase.includes(r)
                );
                const linhasForaPadrao = reservas.filter(r =>
                    r.originalBase === hrBase &&
                    !r.nomes && !r.bloqueado && !r.somenteHospedes &&
                    r.horario && !horariosPadraoSet.has(r.horario)
                );
                const totalLinhas = linhasOrdenadas.length + linhasMigradas.length + linhasForaPadrao.length;

                for (let i = 0; i < linhasOrdenadas.length; i++) {
                    const item = linhasOrdenadas[i];
                    const res = item.res;
                    const horarioVisivel = (res && res.horario) ? res.horario : hrBase;
                    const hrBaseReal = (res && res.originalBase) ? res.originalBase : hrBase;
                    const tdHora = i === 0
                        ? `<td class="linha-horario" rowspan="${totalLinhas}" data-hrbase="${hrBase}">${hrBase}</td>`
                        : '';
                    html += renderizarLinha(res, horarioVisivel, item.idxOrig, tdHora, hrBaseReal);
                }

                linhasMigradas.forEach(res => {
                    html += renderizarLinha(res, res.horario, res.posicao, '', res.originalBase || hrBase);
                });

                linhasForaPadrao.forEach(res => {
                    html += renderizarLinha(res, res.horario, res.posicao, '', res.originalBase || hrBase);
                });
                html += `<tr class="separador-horario"><td colspan="6"></td></tr>`;
            }
        });
    }

    html += `</tbody></table>`;
    container.innerHTML = html;
}

/**
 * Renderiza uma linha individual da tabela
 * ✅ v5.5: Células vazias usam data-* em vez de onclick inline
 *          Evita duplo disparo: onclick inline + event delegation do init.js
 */
function renderizarLinha(res, horarioVisual, posicao, tdHora, hrBase) {
    if (res && (res.nomes || res.bloqueado || res.somenteHospedes)) {
        let adultos = parseInt(res.paxs) || 0;
        let criancas = parseInt(res.chd) || 0;
        const isB = res.bloqueado || res.somenteHospedes;
        
        if (isB) {
            let txt = res.bloqueado ? "BLOQUEADO" : "SOMENTE HÓSPEDES";
            let classeBloqueio = res.bloqueado ? "reserva-bloqueada" : "reserva-somente-hospedes";
            let obsTexto = res.obs ? ` - ${res.obs}` : '';
            
            return `
<tr>
    ${tdHora}
    <td class="${classeBloqueio} reserva-clicavel" colspan="5" style="text-align: center; padding: 15px; cursor: pointer;" data-id="${res.id}">
        ${txt}${obsTexto}
    </td>
</tr>`;
        }

        let conteudoMesa = res.mesa 
            ? (res.mesa === "ROOM" ? `<span class="mesa-room">${res.mesa}</span>` : res.mesa)
            : "-";
        
        if (res.mesa && res.inicioMesa) {
            const inicio = new Date(res.inicioMesa);
            const fim = res.fimMesa ? new Date(res.fimMesa) : new Date();
            const diferencaMs = Math.max(0, fim - inicio);
            const totalSegundos = Math.floor(diferencaMs / 1000);
            const horas = Math.floor(totalSegundos / 3600);
            const mins = Math.floor((totalSegundos % 3600) / 60);
            const segs = totalSegundos % 60;
            const tempoString = `${horas.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${segs.toString().padStart(2, '0')}`;
            
            const classeRoom = (res.mesa === "ROOM") ? ' class="mesa-room"' : '';

            if (res.fimMesa) {
                conteudoMesa = `<span${classeRoom}>${res.mesa}</span><span class="timer-mesa timer-finalizado" data-timer-id="${res.id}" data-inicio="${res.inicioMesa}">${tempoString}</span>`;
            } else {
                // ✅ v4.2: Timer ATIVO — data-tipo necessário para regra de cor do room service
                conteudoMesa = `<span${classeRoom}>${res.mesa}</span><span class="timer-mesa timer-ativo" data-timer-id="${res.id}" data-inicio="${res.inicioMesa}" data-tipo="${res.tipo || ''}">${tempoString}</span>`;
            }
        }

        let label = res.tipo === "hospede" ? `<b>APTO ${res.apto || "?"}</b>` : 
            (res.tipo === "externo" ? "<b>EXT</b>" : 
            (res.tipo === "roomservice" ? `<b>APTO ${res.apto || "?"}</b>` : 
            "<b>PASS</b>"));
        let classePag = res.pagamento === 'pago' ? 'pg-confirmado' : (res.pagamento === 'pendente' ? 'pg-pendente' : '');
        let textoPag = (res.tipo === 'externo' && res.avulsa) ? res.avulsa : (res.pagamento || "-");

        return `
<tr>
    ${tdHora}
    <td class="reserva-clicavel border-${res.tipo}" data-id="${res.id}">
        ${label} — ${res.nomes} ${res.menuDegustacao ? `<span class="badge-deg">🍽 DEG</span>` : ''}${res.obs ? `<span class="obs-exibicao">${res.obs}</span>` : ""}
    </td>
    <td class="col-pax"><div class="td-content">${adultos}</div></td>
    <td class="col-chd"><div class="td-content">${criancas}</div></td>
    <td class="celula-mesa" data-id-mesa="${res.id}" style="cursor: pointer;">
        <div class="td-content">${conteudoMesa}</div>
    </td>
    <td class="col-av"><div class="td-content ${classePag}">${textoPag}</div></td>
</tr>`;

    } else {
        // ✅ v5.5: Sem onclick inline — init.js captura via event delegation em .reserva-vazia
        //          e lê os dados pelos atributos data-horario, data-posicao, data-hrbase.
        //          Antes: onclick inline + bubbling para o listener do grid = dois disparos por clique.
        const horario = (res && res.horario) ? res.horario : horarioVisual;
        const pos = (res && res.posicao != null) ? res.posicao : posicao;

        return `
<tr>
    ${tdHora}
    <td class="reserva-clicavel reserva-vazia"
        data-horario="${horario}"
        data-posicao="${pos}"
        data-hrbase="${hrBase}">
       + DISPONÍVEL
    </td>
    <td class="col-pax"><div class="td-content">-</div></td>
    <td class="col-chd"><div class="td-content">-</div></td>
    <td class="col-mesa"><div class="td-content">-</div></td>
    <td class="col-av"><div class="td-content">-</div></td>
</tr>`;
    }
}

// Expor globalmente para debug
window.renderizarGrid = renderizarGrid;

console.log('✅ render.js v6.0 carregado - reservas reais têm prioridade sobre docs vazios na mesma posição');