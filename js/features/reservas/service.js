/* =========================================================================================
   OSTERIA DI LUCCA - RESERVAS.SERVICE.JS (v3.8)
   ✅ v2.8: Padroniza error handling — usa notificacao.js
   ✅ v2.9: Etapa 3 — salvarApenasHorario() branch "linha vazia" usa batch write (atômico)
   ✅ v3.0: salvarReserva() ignora docs vazios ao calcular posições ocupadas — evita pos fantasma
   ✅ v3.1: salvarReserva() usa batch para criar reserva + deletar doc vazio da mesma posição
   ✅ v3.2: alterarData() — move reserva para outra data via update simples
   ✅ v3.9: alterarData() recalcula posição no bloco destino — evita colisão quando
            outro doc já ocupa a mesma posição na data de destino
   ✅ v3.3: removerLinhaDoBloco() — absorve lógica de acaoExcluir() do controls.js
            Responsabilidade: toda operação de escrita no Firestore fica em service.js
            controls.js passa a ser puramente UI (regra 4 da arquitetura)
   ✅ v3.4: limparFantasmasDoDia(data) — limpeza PROATIVA de docs fantasmas no boot.
            Complementa a limpeza reativa de removerLinhaDoBloco().
            Fantasmas = vazios na mesma (originalBase, posicao) de um real, ou vazios duplicados.
            Chamada uma vez por sessão via init.js, em background, falha silenciosa.
   ✅ v3.5: salvarApenasHorario() registra log de auditoria no branch temReservaReal — Bug #4
   ✅ v3.6: Bug #13 — helper _getFirestore() centraliza aguardarInicializacao() + getFirestore()
            Elimina 15 pares duplicados de await db.aguardarInicializacao() / db.getFirestore()
   ✅ v3.7: Bug #14 — helper _calcularPosicaoLivre() elimina lógica duplicada em
            salvarReserva() e salvarApenasHorario()
   ✅ v3.8: salvarApenasHorario() branch "linha vazia" agora consulta snapshot do bloco
            destino e usa _calcularPosicaoLivre() — evita posição fora do range visual
            quando a posição original não existe no bloco destino.
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
import { notificarErro } from '../../core/notificacao.js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Garante inicialização e retorna instância do Firestore.
 * @returns {Promise<firebase.firestore.Firestore>}
 */
async function _getFirestore() {
    await db.aguardarInicializacao();
    return db.getFirestore();
}

/**
 * Calcula o menor índice de posição livre num bloco de reservas.
 * Ignora docs vazios (sem nomes, bloqueado ou somenteHospedes) ao determinar
 * posições ocupadas — comportamento idêntico ao v3.0 de salvarReserva().
 *
 * @param {firebase.firestore.QuerySnapshot} snapBloco - Snapshot do bloco
 * @param {number} [posicaoDesejada=0] - Posição preferida (usada se livre)
 * @returns {number} Menor posição disponível
 */
function _calcularPosicaoLivre(snapBloco, posicaoDesejada = 0) {
    const ocupadas = [];
    snapBloco.forEach(d => {
        const r = d.data();
        if (r.nomes || r.bloqueado || r.somenteHospedes) {
            ocupadas.push(r.posicao ?? 0);
        }
    });
    let pos = ocupadas.includes(posicaoDesejada) ? 0 : posicaoDesejada;
    while (ocupadas.includes(pos)) pos++;
    return pos;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESERVAS — CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function salvarReserva(dados) {
    try {
        const firestore = await _getFirestore();

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
        if (dados.id) {
            await firestore.collection('reservas').doc(dados.id).update(reservaData);
            docRef = dados.id;
        } else {
            // v2.6: Calcula posicao livre no bloco antes de salvar nova reserva
            // Evita conflito de posicao:0 quando multiplas linhas no mesmo bloco editado
            const snapBloco = await firestore.collection('reservas')
                .where('data', '==', reservaData.data)
                .where('originalBase', '==', reservaData.originalBase)
                .get();

            // ✅ v3.0: Ignora docs vazios ao calcular posições ocupadas.
            // ✅ v3.7: Usa _calcularPosicaoLivre() — elimina duplicação com salvarApenasHorario()
            const posicaoFinal = _calcularPosicaoLivre(snapBloco, reservaData.posicao);
            if (posicaoFinal !== reservaData.posicao) {
                console.log('Posicao ' + reservaData.posicao + ' ocupada, usando: ' + posicaoFinal);
            }
            reservaData.posicao = posicaoFinal;

            // ✅ v3.1: Usa batch para criar reserva + deletar doc vazio da mesma posição atomicamente.
            // Garante que o slot não fique com dois docs (vazio + real) após a criação.
            const vazioNaPosicao = [];
            snapBloco.forEach(d => {
                const r = d.data();
                if (!r.nomes && !r.bloqueado && !r.somenteHospedes && (r.posicao ?? 0) === posicaoFinal) {
                    vazioNaPosicao.push(d.id);
                }
            });

            const batch = firestore.batch();
            const novoRef = firestore.collection('reservas').doc();
            batch.set(novoRef, reservaData);
            vazioNaPosicao.forEach(id => {
                batch.delete(firestore.collection('reservas').doc(id));
            });
            await batch.commit();
            docRef = novoRef.id;
        }

        if (reservaData.tipo === 'roomservice') {
            await atribuirMesa(docRef, 'ROOM');
        }

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
    const firestore = await _getFirestore();
    const docSnap = await firestore.collection('reservas').doc(id).get();
    const dadosAntes = docSnap.exists ? { id, ...docSnap.data() } : { id };
    await firestore.collection('reservas').doc(id).delete();
    await registrarLog('EXCLUIR', dadosAntes, null);
    console.log('✅ Reserva excluída:', id);
}

export async function desbloquearReserva(id) {
    if (!id) throw new Error('ID obrigatório');
    const firestore = await _getFirestore();
    const docSnap = await firestore.collection('reservas').doc(id).get();
    const dadosAntes = docSnap.exists ? { id, ...docSnap.data() } : { id };
    // v2.2: update() em vez de delete() — documento permanece com bloqueado: false
    await firestore.collection('reservas').doc(id).update({
        bloqueado: false,
        somenteHospedes: false
    });
    await registrarLog('DESBLOQUEAR', dadosAntes, null);
    console.log('✅ Reserva desbloqueada (update):', id);
}

export async function salvarApenasHorario(dados) {
    const firestore = await _getFirestore();
    const novoHorario = dados.horario;
    const data = getDataAtual();

    if (dados.id) {
        const docSnap = await firestore.collection('reservas').doc(dados.id).get();
        const dadosAtuais = docSnap.exists ? docSnap.data() : {};
        const temReservaReal = dadosAtuais.nomes || dadosAtuais.bloqueado || dadosAtuais.somenteHospedes;

        if (temReservaReal) {
            // v2.5: originalBase sempre atualiza para o novo horário
            // → comportamento idêntico ao de linha vazia: reserva muda de bloco
            // → funciona para slots padrão (20:30) e fora do padrão (20:15)
            const novoOriginalBase = novoHorario;

            // v2.4: Calcula posição livre no novo bloco para evitar conflito de posição
            // ✅ v3.7: Usa _calcularPosicaoLivre() — elimina duplicação com salvarReserva()
            let novaPosicao = dadosAtuais.posicao || 0;
            if (novoOriginalBase !== (dadosAtuais.originalBase || dadosAtuais.horario)) {
                const snapBloco = await firestore.collection('reservas')
                    .where('data', '==', data)
                    .where('originalBase', '==', novoOriginalBase)
                    .get();
                // v2.4 fix: não exclui o próprio doc — no momento da query ele ainda
                // está no bloco antigo, então todos os docs do novo bloco são concorrentes
                novaPosicao = _calcularPosicaoLivre(snapBloco, novaPosicao);
                console.log(`✅ Nova posição no bloco ${novoOriginalBase}: ${novaPosicao}`);
            }

            // Linha com reserva real: update simples (sem risco de inconsistência)
            const dadosAntes = { id: dados.id, ...dadosAtuais };
            await firestore.collection('reservas').doc(dados.id).update({
                horario: novoHorario,
                originalBase: novoOriginalBase,
                posicao: novaPosicao
            });
            await registrarLog('EDITAR', dadosAntes, { ...dadosAntes, horario: novoHorario, originalBase: novoOriginalBase, posicao: novaPosicao });
            return dados.id;

        } else {
            // ── Linha vazia: BATCH — deleta doc antigo + cria novo com originalBase = novoHorario ──
            // ✅ v2.9: Etapa 3 — substitui delete() + add() sequenciais por batch write atômico.
            // Antes: se o delete() tivesse sucesso mas o add() falhasse, a linha desaparecia
            // do bloco original sem aparecer no novo bloco — estado inconsistente na grade.
            // Agora: as duas operações são aplicadas juntas ou nenhuma é aplicada.
            //
            // ⚠️ batch.add() não existe no SDK do Firestore —
            //    usa-se batch.set() com uma referência nova (doc() sem argumento gera ID).
            //
            // ✅ v3.8: Consulta snapshot do bloco destino antes do batch para calcular a
            // posição correta via _calcularPosicaoLivre(). Antes, a posição original era
            // copiada diretamente — se não existia no destino, o doc ficava fora do range
            // visual (ex: pos:3 num bloco base:3), gerando um fantasma invisível na grade.
            const snapBlocoDestino = await firestore.collection('reservas')
                .where('data', '==', data)
                .where('originalBase', '==', novoHorario)
                .get();

            const posicaoDestino = _calcularPosicaoLivre(
                snapBlocoDestino,
                parseInt(dadosAtuais.posicao) || 0
            );

            const novoDocRef = firestore.collection('reservas').doc();
            const batch = firestore.batch();

            batch.delete(firestore.collection('reservas').doc(dados.id));

            batch.set(novoDocRef, {
                data,
                horario: novoHorario,
                originalBase: novoHorario,
                posicao: posicaoDestino,
                nomes: '',
                tipo: 'hospede',
                paxs: 0,
                chd: 0,
                obs: ''
            });

            await batch.commit();
            console.log(`✅ [batch] Linha vazia movida: ${dados.id} → ${novoDocRef.id} (${novoHorario}) pos:${posicaoDestino}`);

            return novoDocRef.id;
        }
    } else {
        // Sem id: cria novo doc direto com originalBase = novoHorario
        const doc = await firestore.collection('reservas').add({
            data,
            horario: novoHorario,
            originalBase: novoHorario,
            posicao: parseInt(dados.posicao) || 0,
            nomes: '', tipo: 'hospede', paxs: 0, chd: 0, obs: ''
        });
        return doc.id;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MESAS
// ─────────────────────────────────────────────────────────────────────────────

export async function atribuirMesa(id, mesa) {
    if (!id) throw new Error('ID obrigatório');
    const firestore = await _getFirestore();
    await firestore.collection('reservas').doc(id).update({ mesa: mesa.toString() });
}

export async function iniciarAtendimento(id) {
    if (!id) throw new Error('ID obrigatório');
    const firestore = await _getFirestore();
    await firestore.collection('reservas').doc(id).update({ inicioMesa: new Date().toISOString() });
}

export async function finalizarAtendimento(id) {
    if (!id) throw new Error('ID obrigatório');
    const firestore = await _getFirestore();
    await firestore.collection('reservas').doc(id).update({ fimMesa: new Date().toISOString() });
}

export async function cancelarMesa(id) {
    if (!id) throw new Error('ID obrigatório');
    const firestore = await _getFirestore();
    await firestore.collection('reservas').doc(id).update({ mesa: '' });
}

/**
 * Atualiza tipo e obs de um bloqueio existente (BLOQUEADO ou SÓ HÓSPEDES)
 * @param {string} id - ID da reserva
 * @param {Object} dados - { obs, bloqueado, somenteHospedes }
 */
export async function atualizarBloqueio(id, dados) {
    if (!id) throw new Error('ID obrigatório');
    const firestore = await _getFirestore();
    await firestore.collection('reservas').doc(id).update({
        obs: dados.obs ? dados.obs.toUpperCase() : '',
        bloqueado: dados.bloqueado || false,
        somenteHospedes: dados.somenteHospedes || false,
    });
    console.log('✅ Bloqueio atualizado (tipo + OBS):', id);
}

export async function adicionarObservacao(id, novaObs) {
    if (!id || !novaObs?.trim()) return;
    const firestore = await _getFirestore();
    const doc = await firestore.collection('reservas').doc(id).get();
    let obs = doc.data().obs || '';
    if (obs) obs += ' | ';
    obs += novaObs.toUpperCase();
    await firestore.collection('reservas').doc(id).update({ obs });
}

/**
 * Altera a data de uma reserva existente.
 * Atualiza apenas o campo `data` — horario, posicao e todos os outros campos
 * permanecem intactos. Registra log de auditoria com a mudança.
 *
 * @param {string} id        - ID do documento no Firestore
 * @param {string} novaData  - Nova data no formato YYYY-MM-DD
 */
export async function alterarData(id, novaData) {
    if (!id) throw new Error('ID obrigatório');
    if (!novaData) throw new Error('Nova data é obrigatória');

    const firestore = await _getFirestore();

    const docSnap = await firestore.collection('reservas').doc(id).get();
    const dadosAntes = docSnap.exists ? { id, ...docSnap.data() } : { id };

    // ✅ v3.9: Verifica colisão de posição no bloco destino.
    // Sem isso, se o bloco (originalBase, posicao) já existir na data destino,
    // dois docs reais ficam sobrepostos na mesma célula da grade — apenas um
    // aparece visualmente, mas ambos existem no Firestore e corrompem operações futuras.
    const originalBase = dadosAntes.originalBase || dadosAntes.horario;
    const snapBlocoDestino = await firestore.collection('reservas')
        .where('data', '==', novaData)
        .where('originalBase', '==', originalBase)
        .get();

    const novaPosicao = _calcularPosicaoLivre(snapBlocoDestino, dadosAntes.posicao ?? 0);

    if (novaPosicao !== dadosAntes.posicao) {
        console.log(`ℹ️ alterarData: posição ${dadosAntes.posicao} ocupada no destino — usando ${novaPosicao}`);
    }

    await firestore.collection('reservas').doc(id).update({
        data: novaData,
        posicao: novaPosicao,
    });

    const dadosDepois = { ...dadosAntes, data: novaData, posicao: novaPosicao };
    await registrarLog('EDITAR', dadosAntes, dadosDepois);

    console.log(`✅ Data alterada: ${dadosAntes.data} → ${novaData} | pos: ${dadosAntes.posicao} → ${novaPosicao} (id: ${id})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// LEITURAS
// ─────────────────────────────────────────────────────────────────────────────

export async function buscarReservasPorData(data) {
    const firestore = await _getFirestore();
    const snap = await firestore.collection('reservas').where('data', '==', data).get();
    const reservas = [];
    snap.forEach(doc => reservas.push({ id: doc.id, ...doc.data() }));
    return reservas;
}

export async function buscarReservasPorPeriodo(dataInicio, dataFim) {
    const firestore = await _getFirestore();
    const snap = await firestore.collection('reservas')
        .where('data', '>=', dataInicio)
        .where('data', '<=', dataFim)
        .get();
    const reservas = [];
    snap.forEach(doc => reservas.push({ id: doc.id, ...doc.data() }));
    return reservas;
}

// ─────────────────────────────────────────────────────────────────────────────
// GERENCIAMENTO DE LINHAS DO BLOCO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove uma linha livre de um bloco de horário.
 *
 * Responsabilidade: toda a lógica que antes vivia em acaoExcluir() (controls.js)
 * agora reside aqui — controls.js passa a ser puramente UI (regra 4).
 *
 * Algoritmo:
 *   1. Busca todos os docs do bloco direto no Firebase (fonte da verdade)
 *   2. Limpa docs vazios fantasmas (duplicatas e fora do range visual)
 *   3. Valida se há linha removível (mínimo 1, sem reserva real)
 *   4. Batch atômico: deleta doc vazio da linha removida + reposiciona docs acima
 *   5. Atualiza linhasExtras em memória via setLinhasExtras() / removerLinhaExtra()
 *
 * @param {string} hr   - Horário do bloco (ex: '20:00')
 * @param {string} data - Data no formato YYYY-MM-DD
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   motivo?: string,             // presente quando ok === false
 *   linhasExtrasAtualizado: Object  // estado atualizado para persistir no Firestore
 * }>}
 */
export async function removerLinhaDoBloco(hr, data) {
    const firestore = await _getFirestore();

    // ── 1. Busca estado direto do Firebase ──────────────────────────────────
    const snap = await firestore.collection('reservas')
        .where('data', '==', data)
        .where('originalBase', '==', hr)
        .get();

    const reservasHr = [];
    snap.forEach(doc => reservasHr.push({ id: doc.id, ...doc.data() }));

    console.log(`🔍 removerLinhaDoBloco ${hr}: ${reservasHr.length} docs no Firebase`);
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
            await firestore.collection('reservas').doc(vazios[i].id).delete();
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

    // ── 5. BATCH: deleta vazio + reposiciona docs acima ──────────────────────
    const docParaDeletar = docVazioNaPosicao(linhaParaRemover);
    const batch = firestore.batch();

    if (docParaDeletar) {
        batch.delete(firestore.collection('reservas').doc(docParaDeletar.id));
        console.log(`🗑️ [batch] Doc para deletar: ${docParaDeletar.id} pos ${linhaParaRemover}`);
    }

    const paraAtualizar = reservasHr.filter(r =>
        r.posicao > linhaParaRemover && r.id !== docParaDeletar?.id
    );
    for (const r of paraAtualizar) {
        batch.update(firestore.collection('reservas').doc(r.id), { posicao: r.posicao - 1 });
        console.log(`  ↑ [batch] ${r.nomes || '(vazio)'}: pos ${r.posicao} → ${r.posicao - 1}`);
    }

    await batch.commit();
    console.log(`✅ Batch commitado — ${1 + paraAtualizar.length} operações aplicadas atomicamente`);

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
 * Contexto:
 *   Versões anteriores ao v3.0 podiam gerar docs vazios em posições já ocupadas
 *   (bug de posição fantasma). removerLinhaDoBloco() já faz limpeza reativa quando
 *   o usuário remove uma linha, mas docs gerados em sessões antigas nunca eram varridos.
 *   Esta função resolve isso de forma proativa, uma vez por sessão.
 *
 * O que É removido (fantasmas):
 *   1. Doc vazio na mesma (originalBase, posicao) de um doc real
 *      → posição está ocupada; o vazio é redundante e nunca aparece na grade.
 *   2. Docs vazios duplicados na mesma (originalBase, posicao)
 *      → máximo 1 vazio por posição representa o slot disponível.
 *
 * O que NÃO é removido:
 *   - Docs reais (nomes, bloqueado ou somenteHospedes preenchidos)
 *   - Doc vazio ÚNICO numa posição → slot disponível legítimo na grade
 *
 * Segurança:
 *   - Lê apenas os docs do dia atual (query barata)
 *   - Batch delete — atômico, max 490 ops por commit
 *   - Falha silenciosa — nunca interrompe o fluxo principal
 *
 * @param {string} data - Data no formato YYYY-MM-DD
 * @returns {Promise<number>} Quantidade de docs excluídos (0 se nenhum fantasma)
 */
export async function limparFantasmasDoDia(data) {
    const firestore = await _getFirestore();

    console.log(`🧹 limparFantasmasDoDia: varrendo ${data}...`);

    const snap = await firestore.collection('reservas').where('data', '==', data).get();
    const todos = [];
    snap.forEach(doc => todos.push({ id: doc.id, ...doc.data() }));

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

    const LIMITE_BATCH = 490;
    let totalExcluidos = 0;

    for (let i = 0; i < parasExcluir.length; i += LIMITE_BATCH) {
        const lote = parasExcluir.slice(i, i + LIMITE_BATCH);
        const batch = firestore.batch();
        lote.forEach(id => batch.delete(firestore.collection('reservas').doc(id)));
        await batch.commit();
        totalExcluidos += lote.length;
        console.log(`🧹 limparFantasmasDoDia: batch ${Math.floor(i / LIMITE_BATCH) + 1} — ${lote.length} excluído(s)`);
    }

    console.log(`✅ limparFantasmasDoDia: ${totalExcluidos} fantasma(s) removido(s) de ${data}`);
    return totalExcluidos;
}