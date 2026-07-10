/* =========================================================================================
   OSTERIA DI LUCCA - RESERVAS.SERVICE.JS (v4.0)
   ✅ v2.8-v3.11: histórico Firestore — ver git log para versões anteriores.
   ✅ v4.0: Fase 5 da migração Firestore → Supabase. Todas as operações de escrita/leitura
            passam a falar com o Supabase. `firestore.batch()` (atômico) não tem equivalente
            client-side no Supabase — os pares insert+delete/update viram chamadas
            sequenciais. Tradeoff aceito: uma falha no meio pode deixar um doc "fantasma"
            temporário, mas limparFantasmasDoDia() (já existe, roda no boot) varre e limpa
            isso sozinho — risco real baixo. Ver plano_de_ação.md §Fase 5.
            _calcularPosicaoLivre() muda de assinatura: recebe array simples de reservas
            (formato achatado de sempre) em vez de um QuerySnapshot do Firestore.
   ========================================================================================= */

import {
    getDataAtual,
    getLinhasExtras,
    setLinhasExtras,
    removerLinhaExtra,
    getHorariosPadrao,
} from '../../core/state.js';
import { registrarLog } from './log.js';
import { db } from '../../core/database.js';
import { notificarErro, notificarAviso } from '../../core/notificacao.js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Garante inicialização e retorna o cliente do Supabase.
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
async function _getClient() {
    await db.aguardarInicializacao();
    return db.getClient();
}

/**
 * Calcula o menor índice de posição livre num bloco de reservas.
 * Ignora reservas vazias (sem nomes, bloqueado ou somenteHospedes) ao determinar
 * posições ocupadas.
 *
 * @param {Array<Object>} reservasBloco - Reservas do bloco (formato achatado de sempre)
 * @param {number} [posicaoDesejada=0] - Posição preferida (usada se livre)
 * @returns {number} Menor posição disponível
 */
export function _calcularPosicaoLivre(reservasBloco, posicaoDesejada = 0) {
    const ocupadas = [];
    reservasBloco.forEach(r => {
        if (r.nomes || r.bloqueado || r.somenteHospedes) {
            ocupadas.push(r.posicao ?? 0);
        }
    });
    let pos = ocupadas.includes(posicaoDesejada) ? 0 : posicaoDesejada;
    while (ocupadas.includes(pos)) pos++;
    return pos;
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUEIO AUTOMÁTICO — reserva grande (4+ adultos) bloqueia a próxima linha
// ─────────────────────────────────────────────────────────────────────────────

const PAX_MINIMO_BLOQUEIO_AUTOMATICO = 4;

/** Total de linhas visíveis (base + extras) de um bloco — mesmo cálculo de removerLinhaDoBloco(). */
function _totalLinhasBloco(hr) {
    const baseLinhas = new Set(getHorariosPadrao()).has(hr) ? 3 : 1;
    const extras = getLinhasExtras()[hr] !== undefined ? getLinhasExtras()[hr] : 0;
    return baseLinhas + extras;
}

/**
 * Regra de negócio: o padrão é atender 2 pessoas por linha sem atrasar a cozinha.
 * Uma reserva com 4+ adultos consome a capacidade de duas linhas — bloqueia a
 * próxima linha livre do mesmo bloco automaticamente.
 *
 * Nunca força um bloqueio que atropele outra reserva: se a próxima linha já tem
 * dono (reserva real ou outro bloqueio) ou não existe (fora do range visual do
 * bloco), só avisa a recepção — a decisão de abrir mais uma linha fica com ela.
 *
 * @param {string} reservaId  - ID da reserva grande que originou a checagem
 * @param {string} data
 * @param {string} originalBase - Bloco/horário da reserva
 * @param {number} posicao      - Posição da reserva dentro do bloco
 * @param {number} paxs         - Adultos da reserva (crianças não contam)
 */
async function _verificarBloqueioAutomatico(reservaId, data, originalBase, posicao, paxs) {
    if (paxs < PAX_MINIMO_BLOQUEIO_AUTOMATICO) return;

    const posAlvo = posicao + 1;
    if (posAlvo >= _totalLinhasBloco(originalBase)) return; // não há próxima linha no bloco

    const blocoReservas = await db.buscarReservasPorBloco(data, originalBase);
    const naPosAlvo = blocoReservas.find(r => r.posicao === posAlvo);

    if (naPosAlvo && naPosAlvo.bloqueioOrigemId === reservaId) {
        return; // já bloqueado por esta mesma reserva — idempotente
    }

    if (naPosAlvo && (naPosAlvo.nomes || naPosAlvo.bloqueado || naPosAlvo.somenteHospedes)) {
        notificarAviso(`Horário ${originalBase}: reserva com ${paxs} pessoas, mas a próxima linha já está ocupada — bloqueie manualmente se necessário.`);
        return;
    }

    const colunasBloqueio = {
        data, horario: originalBase, originalBase, posicao: posAlvo,
        nomes: '', tipo: 'hospede', paxs: 0, chd: 0,
        bloqueado: true,
        obs: 'BLOQUEIO AUTOMÁTICO — RESERVA COM 4+ PESSOAS NA LINHA ANTERIOR',
        bloqueioOrigemId: reservaId,
    };

    if (naPosAlvo) {
        await db.atualizarReserva(naPosAlvo.id, colunasBloqueio);
    } else {
        await db.criarReserva(colunasBloqueio);
    }
    notificarAviso(`Próxima linha do horário ${originalBase} bloqueada automaticamente (reserva com ${paxs} pessoas).`);
}

/**
 * Remove qualquer bloqueio automático gerado por uma reserva — chamado quando ela
 * deixa de ter 4+ pessoas ou muda de bloco/horário/posição. A exclusão da própria
 * reserva de origem já limpa isso sozinha via ON DELETE CASCADE no banco (não
 * precisa chamar esta função em excluirReserva()).
 */
async function _removerBloqueioAutomatico(reservaId) {
    const bloqueios = await db.buscarBloqueiosAutomaticos(reservaId);
    for (const b of bloqueios) {
        await db.excluirReserva(b.id);
    }
}

/**
 * Reavalia o bloqueio automático de uma reserva depois de criada/editada/movida.
 * Só recria o bloqueio quando algo relevante mudou (evita atropelar um desbloqueio
 * manual feito pela recepção numa edição de campo não relacionado, tipo a OBS).
 *
 * @param {string} reservaId
 * @param {Object|null} dadosAntes - Estado anterior no formato achatado (null = criação)
 * @param {Object} reservaData     - Estado novo, mesmo formato achatado
 */
async function _reconciliarBloqueioAutomatico(reservaId, dadosAntes, reservaData) {
    const mudouDeLinha = !dadosAntes
        || dadosAntes.data !== reservaData.data
        || (dadosAntes.originalBase || dadosAntes.horario) !== reservaData.originalBase
        || dadosAntes.posicao !== reservaData.posicao;

    const eraGrande = (dadosAntes?.paxs || 0) >= PAX_MINIMO_BLOQUEIO_AUTOMATICO;
    const ehGrande = (reservaData.paxs || 0) >= PAX_MINIMO_BLOQUEIO_AUTOMATICO;

    if (mudouDeLinha || (eraGrande && !ehGrande)) {
        await _removerBloqueioAutomatico(reservaId);
    }
    if (ehGrande && (mudouDeLinha || !eraGrande)) {
        await _verificarBloqueioAutomatico(reservaId, reservaData.data, reservaData.originalBase, reservaData.posicao, reservaData.paxs);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESERVAS — CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function salvarReserva(dados) {
    try {
        const client = await _getClient();

        if (!dados.horario) throw new Error('Horário é obrigatório');

        const reservaData = {
            data: dados.data || getDataAtual(),
            horario: dados.horario,
            originalBase: dados.originalBase || dados.horario,
            posicao: parseInt(dados.posicao) || 0,
            tipo: dados.tipo || 'hospede',
            nomes: dados.nomes ? dados.nomes.toUpperCase() : '',
            apto: dados.apto || '',
            whatsapp: dados.whatsapp || '',
            avulsa: dados.avulsa || '',
            paxs: parseInt(dados.paxs) || 0,
            chd: parseInt(dados.chd) || 0,
            obs: dados.obs ? dados.obs.toUpperCase() : '',
            bloqueado: dados.bloqueado || false,
            somenteHospedes: dados.somenteHospedes || false,
            pagamento: dados.pagamento || '',
            menuDegustacao: dados.menuDegustacao || false
        };

        let docRef;
        let dadosAntesReserva = null;
        if (dados.id) {
            dadosAntesReserva = await db.getReservaPorId(dados.id);
            await db.atualizarReserva(dados.id, reservaData);
            docRef = dados.id;
        } else {
            // Calcula posicao livre no bloco antes de salvar nova reserva
            const snapBloco = await db.buscarReservasPorBloco(reservaData.data, reservaData.originalBase);

            const posicaoFinal = _calcularPosicaoLivre(snapBloco, reservaData.posicao);
            if (posicaoFinal !== reservaData.posicao) {
                console.log('Posicao ' + reservaData.posicao + ' ocupada, usando: ' + posicaoFinal);
            }
            reservaData.posicao = posicaoFinal;

            // Insere a reserva + remove doc vazio da mesma posição, sequencialmente
            // (sem transação atômica no Supabase — ver cabeçalho do arquivo).
            const vazioNaPosicao = snapBloco.filter(r =>
                !r.nomes && !r.bloqueado && !r.somenteHospedes && (r.posicao ?? 0) === posicaoFinal
            );

            docRef = await db.criarReserva(reservaData);
            for (const v of vazioNaPosicao) {
                await client.from('reservas').delete().eq('id', v.id);
            }
        }

        if (reservaData.tipo === 'roomservice') {
            await atribuirMesa(docRef, 'ROOM');
        }

        await _reconciliarBloqueioAutomatico(docRef, dadosAntesReserva, reservaData);

        // Log
        if (dados.id) {
            await registrarLog('EDITAR', { id: dados.id, ...dados }, { id: docRef, ...reservaData });
        } else {
            await registrarLog('CRIAR', null, { id: docRef, ...reservaData });
        }

        return docRef;
    } catch (error) {
        console.error('❌ Erro ao salvar reserva:', error);
        notificarErro('Erro ao salvar reserva. Tente novamente.');
        throw error;
    }
}

export async function excluirReserva(id) {
    if (!id) throw new Error('ID obrigatório');
    const dadosAntes = await db.getReservaPorId(id) || { id };
    await db.excluirReserva(id);
    await registrarLog('EXCLUIR', dadosAntes, null);
    console.log('✅ Reserva excluída:', id);
}

export async function desbloquearReserva(id) {
    if (!id) throw new Error('ID obrigatório');
    const client = await _getClient();
    const dadosAntes = await db.getReservaPorId(id) || { id };
    // update() em vez de delete() — reserva permanece com bloqueado: false
    await client.from('reservas').update({
        bloqueado: false,
        somente_hospedes: false,
    }).eq('id', id);
    await registrarLog('DESBLOQUEAR', dadosAntes, null);
    console.log('✅ Reserva desbloqueada (update):', id);
}

export async function salvarApenasHorario(dados) {
    const client = await _getClient();
    const novoHorario = dados.horario;
    const data = getDataAtual();

    if (dados.id) {
        const dadosAtuais = await db.getReservaPorId(dados.id) || {};
        const temReservaReal = dadosAtuais.nomes || dadosAtuais.bloqueado || dadosAtuais.somenteHospedes;

        if (temReservaReal) {
            // originalBase sempre atualiza para o novo horário — reserva muda de bloco
            const novoOriginalBase = novoHorario;

            // Calcula posição livre no novo bloco para evitar conflito de posição
            let novaPosicao = dadosAtuais.posicao || 0;
            if (novoOriginalBase !== (dadosAtuais.originalBase || dadosAtuais.horario)) {
                const snapBloco = await db.buscarReservasPorBloco(data, novoOriginalBase);
                // Não exclui o próprio doc — no momento da query ele ainda está no bloco
                // antigo, então todos os docs do novo bloco são concorrentes.
                novaPosicao = _calcularPosicaoLivre(snapBloco, novaPosicao);
                console.log(`✅ Nova posição no bloco ${novoOriginalBase}: ${novaPosicao}`);
            }

            // Linha com reserva real: update simples (sem risco de inconsistência)
            const dadosAntes = { id: dados.id, ...dadosAtuais };
            await client.from('reservas').update({
                horario: novoHorario,
                original_base: novoOriginalBase,
                posicao: novaPosicao,
            }).eq('id', dados.id);

            await _reconciliarBloqueioAutomatico(dados.id, dadosAtuais, {
                data, originalBase: novoOriginalBase, posicao: novaPosicao, paxs: dadosAtuais.paxs,
            });

            await registrarLog('EDITAR', dadosAntes, { ...dadosAntes, horario: novoHorario, originalBase: novoOriginalBase, posicao: novaPosicao });
            return dados.id;

        } else {
            // Linha vazia: deleta doc antigo + cria novo com originalBase = novoHorario.
            // Sequencial (sem transação atômica — ver cabeçalho do arquivo).
            const snapBlocoDestino = await db.buscarReservasPorBloco(data, novoHorario);

            const posicaoDestino = _calcularPosicaoLivre(
                snapBlocoDestino,
                parseInt(dadosAtuais.posicao) || 0
            );

            await client.from('reservas').delete().eq('id', dados.id);

            const novoId = await db.criarReserva({
                data,
                horario: novoHorario,
                originalBase: novoHorario,
                posicao: posicaoDestino,
                nomes: '', tipo: 'hospede', paxs: 0, chd: 0, obs: ''
            });

            console.log(`✅ Linha vazia movida: ${dados.id} → ${novoId} (${novoHorario}) pos:${posicaoDestino}`);
            return novoId;
        }
    } else {
        // Sem id: cria novo doc direto com originalBase = novoHorario
        return db.criarReserva({
            data,
            horario: novoHorario,
            originalBase: novoHorario,
            posicao: parseInt(dados.posicao) || 0,
            nomes: '', tipo: 'hospede', paxs: 0, chd: 0, obs: ''
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MESAS
// ─────────────────────────────────────────────────────────────────────────────

export async function atribuirMesa(id, mesa) {
    if (!id) throw new Error('ID obrigatório');
    const client = await _getClient();
    const mesaStr = mesa.toString();
    await db.garantirMesaExiste(mesaStr);
    await client.from('reservas').update({ mesa_identificador: mesaStr }).eq('id', id);
}

export async function iniciarAtendimento(id) {
    if (!id) throw new Error('ID obrigatório');
    const client = await _getClient();
    await client.from('reservas').update({ inicio_mesa: new Date().toISOString() }).eq('id', id);
}

export async function finalizarAtendimento(id) {
    if (!id) throw new Error('ID obrigatório');
    const client = await _getClient();
    await client.from('reservas').update({ fim_mesa: new Date().toISOString() }).eq('id', id);
}

export async function cancelarMesa(id) {
    if (!id) throw new Error('ID obrigatório');
    const client = await _getClient();
    await client.from('reservas').update({ mesa_identificador: null }).eq('id', id);
}

/**
 * Atualiza tipo e obs de um bloqueio existente (BLOQUEADO ou SÓ HÓSPEDES)
 * @param {string} id - ID da reserva
 * @param {Object} dados - { obs, bloqueado, somenteHospedes }
 */
export async function atualizarBloqueio(id, dados) {
    if (!id) throw new Error('ID obrigatório');
    const client = await _getClient();
    await client.from('reservas').update({
        obs: dados.obs ? dados.obs.toUpperCase() : '',
        bloqueado: dados.bloqueado || false,
        somente_hospedes: dados.somenteHospedes || false,
    }).eq('id', id);
    console.log('✅ Bloqueio atualizado (tipo + OBS):', id);
}

export async function adicionarObservacao(id, novaObs) {
    if (!id || !novaObs?.trim()) return;
    const client = await _getClient();
    const atual = await db.getReservaPorId(id);
    let obs = atual?.obs || '';
    if (obs) obs += ' | ';
    obs += novaObs.toUpperCase();
    await client.from('reservas').update({ obs }).eq('id', id);
}

/**
 * Altera a data de uma reserva existente.
 * Atualiza apenas o campo `data` — horario, posicao e todos os outros campos
 * permanecem intactos. Registra log de auditoria com a mudança.
 *
 * @param {string} id        - ID da reserva
 * @param {string} novaData  - Nova data no formato YYYY-MM-DD
 */
export async function alterarData(id, novaData) {
    if (!id) throw new Error('ID obrigatório');
    if (!novaData) throw new Error('Nova data é obrigatória');

    const client = await _getClient();

    const dadosAntes = await db.getReservaPorId(id) || { id };

    // Verifica colisão de posição no bloco destino. Sem isso, se o bloco
    // (originalBase, posicao) já existir na data destino, duas reservas reais ficam
    // sobrepostas na mesma célula da grade.
    const originalBase = dadosAntes.originalBase || dadosAntes.horario;
    const snapBlocoDestino = await db.buscarReservasPorBloco(novaData, originalBase);

    const novaPosicao = _calcularPosicaoLivre(snapBlocoDestino, dadosAntes.posicao ?? 0);

    if (novaPosicao !== dadosAntes.posicao) {
        console.log(`ℹ️ alterarData: posição ${dadosAntes.posicao} ocupada no destino — usando ${novaPosicao}`);
    }

    await client.from('reservas').update({
        data: novaData,
        posicao: novaPosicao,
    }).eq('id', id);

    await _reconciliarBloqueioAutomatico(id, dadosAntes, {
        data: novaData, originalBase, posicao: novaPosicao, paxs: dadosAntes.paxs,
    });

    const dadosDepois = { ...dadosAntes, data: novaData, posicao: novaPosicao };
    await registrarLog('EDITAR', dadosAntes, dadosDepois);

    console.log(`✅ Data alterada: ${dadosAntes.data} → ${novaData} | pos: ${dadosAntes.posicao} → ${novaPosicao} (id: ${id})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// LEITURAS
// ─────────────────────────────────────────────────────────────────────────────

export async function buscarReservasPorData(data) {
    return db.getReservasPorData(data);
}

export async function buscarReservasPorPeriodo(dataInicio, dataFim) {
    return db.getReservasPorPeriodo(dataInicio, dataFim);
}

// ─────────────────────────────────────────────────────────────────────────────
// GERENCIAMENTO DE LINHAS DO BLOCO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove uma linha livre de um bloco de horário.
 *
 * Algoritmo:
 *   1. Busca todos os docs do bloco direto no banco (fonte da verdade)
 *   2. Limpa docs vazios fantasmas (duplicatas e fora do range visual)
 *   3. Valida se há linha removível (mínimo 1, sem reserva real)
 *   4. Deleta doc vazio da linha removida + reposiciona docs acima (sequencial)
 *   5. Atualiza linhasExtras em memória via setLinhasExtras() / removerLinhaExtra()
 *
 * @param {string} hr   - Horário do bloco (ex: '20:00')
 * @param {string} data - Data no formato YYYY-MM-DD
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   motivo?: string,
 *   linhasExtrasAtualizado: Object
 * }>}
 */
export async function removerLinhaDoBloco(hr, data) {
    const client = await _getClient();

    // ── 1. Busca estado direto do banco ─────────────────────────────────────
    let reservasHr = await db.buscarReservasPorBloco(data, hr);

    console.log(`🔍 removerLinhaDoBloco ${hr}: ${reservasHr.length} docs no banco`);
    reservasHr.forEach(r =>
        console.log(`  pos:${r.posicao} nomes:"${r.nomes}" horario:${r.horario}`)
    );

    // ── 2. Limpa fantasmas ───────────────────────────────────────────────────
    const horariosPadraoSet = new Set(getHorariosPadrao());
    const baseLinhas = horariosPadraoSet.has(hr) ? 3 : 1;
    const extrasAtualPre = getLinhasExtras()[hr] !== undefined ? getLinhasExtras()[hr] : 0;
    const limiteVisual = baseLinhas + extrasAtualPre;

    const porPosicao = {};
    reservasHr.forEach(r => {
        const pos = r.posicao ?? -1;
        if (!porPosicao[pos]) porPosicao[pos] = [];
        porPosicao[pos].push(r);
    });

    for (const [pos, docs] of Object.entries(porPosicao)) {
        const posNum = parseInt(pos);
        const temReal = docs.some(r => r.nomes || r.bloqueado || r.somenteHospedes);
        const vazios = docs.filter(r => !r.nomes && !r.bloqueado && !r.somenteHospedes);

        const manter = (!temReal && posNum >= 0 && posNum < limiteVisual) ? 1 : 0;

        for (let i = manter; i < vazios.length; i++) {
            await client.from('reservas').delete().eq('id', vazios[i].id);
            console.log(`🗑️ Fantasma removido: ${vazios[i].id} pos ${posNum}`);
            const idx = reservasHr.findIndex(r => r.id === vazios[i].id);
            if (idx !== -1) reservasHr.splice(idx, 1);
        }
    }

    // ── 3. Calcula totalLinhas e valida ──────────────────────────────────────
    const reservasReais = reservasHr.filter(r => r.nomes || r.bloqueado || r.somenteHospedes);
    const extrasAtual = getLinhasExtras()[hr] !== undefined ? getLinhasExtras()[hr] : 0;
    const totalVisual = baseLinhas + extrasAtual;

    const maiorPosicaoDoc = reservasHr.length > 0
        ? Math.max(...reservasHr.map(r => r.posicao ?? 0))
        : -1;
    const totalLinhasReal = Math.max(totalVisual, maiorPosicaoDoc + 1);

    const posicoesComReservaReal = new Set(reservasReais.map(r => r.posicao ?? 0));
    const linhasLivres = totalLinhasReal - posicoesComReservaReal.size;

    console.log(
        `Reais: ${reservasReais.length} (${posicoesComReservaReal.size} pos) | ` +
        `extras: ${extrasAtual} | TotalReal: ${totalLinhasReal} | Livres: ${linhasLivres}`
    );

    if (totalLinhasReal <= 1) {
        return { ok: false, motivo: 'Mínimo de 1 linha por horário atingido.', linhasExtrasAtualizado: getLinhasExtras() };
    }
    if (linhasLivres <= 0) {
        return { ok: false, motivo: 'Todas as linhas têm reserva. Não é possível remover.', linhasExtrasAtualizado: getLinhasExtras() };
    }

    // ── 4. Busca linha removível de baixo para cima ──────────────────────────
    const temReservaReal = (pos) =>
        reservasHr.some(r => r.posicao === pos && (r.nomes || r.bloqueado || r.somenteHospedes));
    const docVazioNaPosicao = (pos) =>
        reservasHr.find(r => r.posicao === pos && !r.nomes && !r.bloqueado && !r.somenteHospedes) || null;

    let linhaParaRemover = -1;
    for (let pos = totalLinhasReal - 1; pos >= 0; pos--) {
        if (!temReservaReal(pos)) { linhaParaRemover = pos; break; }
    }

    console.log(`🎯 Linha para remover: ${linhaParaRemover} (totalLinhasReal: ${totalLinhasReal})`);

    if (linhaParaRemover === -1) {
        return { ok: false, motivo: 'Todas as linhas têm reserva. Não é possível remover.', linhasExtrasAtualizado: getLinhasExtras() };
    }

    // ── 5. Deleta vazio + reposiciona docs acima (sequencial) ────────────────
    const docParaDeletar = docVazioNaPosicao(linhaParaRemover);

    if (docParaDeletar) {
        await client.from('reservas').delete().eq('id', docParaDeletar.id);
        console.log(`🗑️ Doc deletado: ${docParaDeletar.id} pos ${linhaParaRemover}`);
    }

    const paraAtualizar = reservasHr.filter(r =>
        r.posicao > linhaParaRemover && r.id !== docParaDeletar?.id
    );
    for (const r of paraAtualizar) {
        await client.from('reservas').update({ posicao: r.posicao - 1 }).eq('id', r.id);
        console.log(`  ↑ ${r.nomes || '(vazio)'}: pos ${r.posicao} → ${r.posicao - 1}`);
    }

    console.log(`✅ ${1 + paraAtualizar.length} operações aplicadas`);

    // ── 6. Atualiza linhasExtras em memória ──────────────────────────────────
    if (horariosPadraoSet.has(hr)) {
        removerLinhaExtra(hr);
    } else {
        const novoExtra = (totalLinhasReal - 1) - 1; // base editado = 1
        setLinhasExtras({ ...getLinhasExtras(), [hr]: novoExtra });
        console.log(`🔧 linhasExtras[${hr}] (editado) = ${novoExtra}`);
    }

    console.log(`🔧 linhasExtras[${hr}] final = ${getLinhasExtras()[hr]}`);
    console.log(`✅ Linha ${linhaParaRemover} removida. Novo total: ${totalLinhasReal - 1}`);

    return { ok: true, linhasExtrasAtualizado: getLinhasExtras() };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIMPEZA PROATIVA DE FANTASMAS — boot do dia atual
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove docs fantasmas do dia especificado. Chamada UMA VEZ no boot, em background.
 *
 * O que É removido (fantasmas):
 *   1. Doc vazio na mesma (originalBase, posicao) de um doc real
 *   2. Docs vazios duplicados na mesma (originalBase, posicao)
 *
 * O que NÃO é removido:
 *   - Docs reais (nomes, bloqueado ou somenteHospedes preenchidos)
 *   - Doc vazio ÚNICO numa posição → slot disponível legítimo na grade
 *
 * @param {string} data - Data no formato YYYY-MM-DD
 * @returns {Promise<number>} Quantidade de docs excluídos (0 se nenhum fantasma)
 */
export async function limparFantasmasDoDia(data) {
    const client = await _getClient();

    console.log(`🧹 limparFantasmasDoDia: varrendo ${data}...`);

    const todos = await db.getReservasPorData(data);

    console.log(`🧹 limparFantasmasDoDia: ${todos.length} docs encontrados`);

    if (todos.length === 0) return 0;

    const grupos = {};
    todos.forEach(r => {
        const base  = r.originalBase || r.horario || '_sem_base_';
        const pos   = r.posicao ?? -1;
        const chave = `${base}__${pos}`;

        if (!grupos[chave]) grupos[chave] = { reais: [], vazios: [] };

        const isReal = !!(r.nomes || r.bloqueado || r.somenteHospedes);
        if (isReal) {
            grupos[chave].reais.push(r);
        } else {
            grupos[chave].vazios.push(r);
        }
    });

    const parasExcluir = [];

    for (const grupo of Object.values(grupos)) {
        const { reais, vazios } = grupo;

        if (reais.length > 0) {
            vazios.forEach(v => parasExcluir.push(v.id));
        } else if (vazios.length > 1) {
            for (let i = 1; i < vazios.length; i++) {
                parasExcluir.push(vazios[i].id);
            }
        }
    }

    if (parasExcluir.length === 0) {
        console.log('🧹 limparFantasmasDoDia: nenhum fantasma encontrado ✅');
        return 0;
    }

    console.log(`🧹 limparFantasmasDoDia: ${parasExcluir.length} fantasma(s) identificado(s)`);

    let totalExcluidos = 0;
    for (const id of parasExcluir) {
        await client.from('reservas').delete().eq('id', id);
        totalExcluidos++;
    }

    console.log(`✅ limparFantasmasDoDia: ${totalExcluidos} fantasma(s) removido(s) de ${data}`);
    return totalExcluidos;
}
