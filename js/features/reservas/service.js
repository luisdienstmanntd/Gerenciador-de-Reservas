/* =========================================================================================
   OSTERIA DI LUCCA - RESERVAS.SERVICE.JS (v4.6)
   ✅ v2.8-v3.11: histórico Firestore — ver git log para versões anteriores.
   ✅ v4.0: Fase 5 da migração Firestore → Supabase. Todas as operações de escrita/leitura
            passam a falar com o Supabase. `firestore.batch()` (atômico) não tem equivalente
            client-side no Supabase — os pares insert+delete/update viram chamadas
            sequenciais. Tradeoff aceito: uma falha no meio pode deixar um doc "fantasma"
            temporário, mas limparFantasmasDoDia() (já existe, roda no boot) varre e limpa
            isso sozinho — risco real baixo. Ver plano_de_ação.md §Fase 5.
            _calcularPosicaoLivre() muda de assinatura: recebe array simples de reservas
            (formato achatado de sempre) em vez de um QuerySnapshot do Firestore.
   ✅ v4.1: Bloqueio automático de reserva grande (4+ pessoas) — ver bug #52.
   ✅ v4.2: cancelarReserva() — soft-delete com histórico (bug #57). Substitui a exclusão
            de vez no botão "CANCELAR RESERVA" do resumo. _calcularDepositoRetido()
            calcula automaticamente se o cliente Externo perde o adiantamento de R$200
            (menos de 48h de antecedência). _calcularPosicaoLivre() passa a ignorar
            reservas canceladas ao determinar posições ocupadas — a linha fica livre
            de novo pra uma reserva nova.
   ✅ v4.3: salvarApenasHorario() — ao mudar reserva real de horário, busca posição livre
            a partir de 0 no bloco de destino (não mais a partir da posição antiga, que não
            tem relação nenhuma com o bloco novo — bug reportado: mover reserva de uma linha
            extra criava linha nova no destino mesmo com as 3 linhas base livres). Se as
            linhas base do destino estiverem todas ocupadas, lança erro `semDisponibilidade`
            em vez de criar linha nova direto — init.js pergunta antes via modalConfirmar
            (aceita opções.permitirNovaLinha pra prosseguir depois da confirmação)
   ✅ v4.4: alterarData() ganha a mesma checagem de capacidade/aviso do v4.3 — mover uma
            reserva pra uma data em que o mesmo horário já está com as linhas base cheias
            também pergunta antes de criar linha nova (aceita opções.permitirNovaLinha)
   ✅ v4.5: aplicarBloqueiosSemanais() — bloqueios antecipados nos dias de movimento do
            hotel (config_sistema.bloqueiosSemanais, editável em Configurações). Semeia
            uma data UMA vez (flag em config_dia) quando ela é visualizada; depois disso
            controle manual total da recepção. Nunca atropela reserva nem abre linha extra
   ✅ v4.6: cancelarReserva() deixa de calcular _calcularDepositoRetido() (regra automática
            de 48h) — o desfecho do depósito agora é escolhido manualmente pela recepção no
            modal "CANCELAR RESERVA" (SEM ESTORNO/ESTORNADO/SEM DEPÓSITO, init.js), repassado
            direto como parâmetro. Função e constante PRAZO_CANCELAMENTO_HORAS removidas.
   ========================================================================================= */

import {
    getDataAtual,
    getLinhasExtras,
    setLinhasExtras,
    removerLinhaExtra,
    getHorariosPadrao,
    getConfig,
    isConfigSistemaCarregada,
} from '../../core/state.js';
import { registrarLog } from './log.js';
import { db } from '../../core/database.js';
import { notificarErro, notificarAviso, notificarSucesso } from '../../core/notificacao.js';

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
        // Reserva cancelada libera a posição pra uma reserva nova reaproveitar —
        // ela continua existindo no banco (soft-delete), só não "trava" o slot.
        if ((r.nomes && !r.canceladoEm) || r.bloqueado || r.somenteHospedes) {
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

export const OBS_BLOQUEIO_AUTOMATICO = 'consultar cozinha';

/** Total de linhas visíveis (base + extras) de um bloco — mesmo cálculo de removerLinhaDoBloco().
 *  Exportada para testes (mesmo padrão de _calcularPosicaoLivre). */
export function _totalLinhasBloco(hr) {
    const baseLinhas = new Set(getHorariosPadrao()).has(hr) ? 3 : 1;
    const extras = getLinhasExtras()[hr] !== undefined ? getLinhasExtras()[hr] : 0;
    return baseLinhas + extras;
}

/**
 * Quantas linhas extras uma reserva consome, além da própria — cada linha cobre 2
 * pessoas. 4-5 pessoas → 1 linha extra; 6-7 → 2; 8-9 → 3; e assim por diante.
 * Retorna 0 (nenhuma linha extra) pra reservas abaixo de 4 pessoas.
 */
export function _linhasExtrasNecessarias(paxs) {
    return Math.max(0, Math.floor(paxs / 2) - 1);
}

/**
 * Regra de negócio: o padrão é atender 2 pessoas por linha sem atrasar a cozinha.
 * Uma reserva grande consome a capacidade de mais de uma linha — bloqueia as
 * próximas linhas livres do mesmo bloco automaticamente, na quantidade calculada
 * por _linhasExtrasNecessarias().
 *
 * Nunca força um bloqueio que atropele outra reserva ou pule uma linha ocupada:
 * a varredura para na primeira linha que já tem dono (reserva real ou bloqueio de
 * outra origem) ou que não existe (fora do range visual do bloco) — só avisa a
 * recepção nesses casos, a decisão de abrir mais linha fica com ela. Bloqueia o
 * que der antes de parar (ex: bloco com só mais 1 linha livre → bloqueia só essa 1,
 * mesmo que a reserva precisasse de 2).
 *
 * @param {string} reservaId  - ID da reserva grande que originou a checagem
 * @param {string} data
 * @param {string} originalBase - Bloco/horário da reserva
 * @param {number} posicao      - Posição da reserva dentro do bloco
 * @param {number} paxs         - Adultos da reserva (crianças não contam)
 * @param {Array<Object>|null} [blocoPreCarregado] - Reservas do bloco já buscadas por quem
 *   chamou (ex: salvarReserva já consulta o bloco antes de criar) — evita repetir a consulta.
 */
async function _verificarBloqueioAutomatico(reservaId, data, originalBase, posicao, paxs, blocoPreCarregado = null) {
    const linhasNecessarias = _linhasExtrasNecessarias(paxs);
    if (linhasNecessarias === 0) return;

    const totalLinhas = _totalLinhasBloco(originalBase);
    const blocoReservas = blocoPreCarregado || await db.buscarReservasPorBloco(data, originalBase);

    let novasBloqueadas = 0;
    let parouPorOcupada = false;

    for (let i = 1; i <= linhasNecessarias; i++) {
        const posAlvo = posicao + i;
        if (posAlvo >= totalLinhas) break; // acabaram as linhas do bloco

        const naPosAlvo = blocoReservas.find(r => r.posicao === posAlvo);

        // Já bloqueada E ativa por esta mesma reserva — segue conferindo a próxima.
        // Checa `bloqueado` além do vínculo: desbloquearReserva() só limpa
        // `bloqueado`, não o vínculo (bloqueioOrigemId) — sem checar `bloqueado`
        // aqui, uma reserva desbloqueada manualmente e depois editada (ex: 4 → 5
        // pessoas) nunca seria re-bloqueada.
        if (naPosAlvo && naPosAlvo.bloqueado && naPosAlvo.bloqueioOrigemId === reservaId) {
            continue;
        }

        // Ocupada por outra coisa (reserva real, ou bloqueio de outra origem) —
        // nunca atropela nem pula pra bloquear a linha seguinte. Uma linha
        // vinculada a ESTA reserva mas desbloqueada manualmente (bloqueado:false)
        // NÃO conta como "ocupada por outra coisa" — cai pro bloco abaixo, que
        // re-bloqueia.
        if (naPosAlvo && (naPosAlvo.nomes || naPosAlvo.bloqueado || naPosAlvo.somenteHospedes)
            && naPosAlvo.bloqueioOrigemId !== reservaId) {
            parouPorOcupada = true;
            break;
        }

        const colunasBloqueio = {
            data, horario: originalBase, originalBase, posicao: posAlvo,
            nomes: '', tipo: 'hospede', paxs: 0, chd: 0,
            bloqueado: true,
            obs: OBS_BLOQUEIO_AUTOMATICO,
            bloqueioOrigemId: reservaId,
        };

        if (naPosAlvo) {
            await db.atualizarReserva(naPosAlvo.id, colunasBloqueio);
        } else {
            await db.criarReserva(colunasBloqueio);
        }
        novasBloqueadas++;
    }

    if (parouPorOcupada) {
        notificarAviso(`Horário ${originalBase}: reserva com ${paxs} pessoas precisaria de ${linhasNecessarias} linha(s) extra(s), mas uma delas já está ocupada — bloqueie manualmente se necessário.`);
    }
    if (novasBloqueadas > 0) {
        notificarSucesso(`${novasBloqueadas} linha(s) do horário ${originalBase} bloqueada(s) automaticamente (reserva com ${paxs} pessoas).`);
    }
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
 *
 * Sempre que a reserva continua "grande" (4+ pessoas), reconfere se a próxima linha
 * está de fato bloqueada — cobre o caso de a recepção ter desbloqueado manualmente
 * e depois editado a reserva (ex: 4 → 5 pessoas), sem exigir uma mudança de bloco ou
 * uma travessia do limiar de 4 pessoas pra disparar a checagem de novo.
 * _verificarBloqueioAutomatico() é idempotente — não faz nada (nem notifica) se o
 * bloqueio já existe e está ativo, então chamar sempre que ehGrande é seguro.
 *
 * @param {string} reservaId
 * @param {Object|null} dadosAntes - Estado anterior no formato achatado (null = criação)
 * @param {Object} reservaData     - Estado novo, mesmo formato achatado
 * @param {Array<Object>|null} [blocoPreCarregado] - Repassado pra _verificarBloqueioAutomatico
 *   (só é válido quando o bloco não mudou — ver uso abaixo)
 */
async function _reconciliarBloqueioAutomatico(reservaId, dadosAntes, reservaData, blocoPreCarregado = null) {
    // Configurável em Configurações do Sistema (por navegador/tablet, mesmo padrão
    // de capacidade/mesas). Desligado: não cria nem remove bloqueio automático —
    // bloqueios já existentes ficam como estão, a recepção desbloqueia manualmente
    // se quiser.
    if (getConfig().bloqueioAutomatico === false) return;

    const mudouDeLinha = !dadosAntes
        || dadosAntes.data !== reservaData.data
        || (dadosAntes.originalBase || dadosAntes.horario) !== reservaData.originalBase
        || dadosAntes.posicao !== reservaData.posicao;

    const eraGrande = (dadosAntes?.paxs || 0) >= PAX_MINIMO_BLOQUEIO_AUTOMATICO;
    const ehGrande = (reservaData.paxs || 0) >= PAX_MINIMO_BLOQUEIO_AUTOMATICO;

    // Mudou de bloco/posição, ou deixou de ser grande: remove o bloqueio antigo
    // (se existir) antes de reavaliar — ele não se aplica mais ao lugar certo.
    if (mudouDeLinha || (eraGrande && !ehGrande)) {
        await _removerBloqueioAutomatico(reservaId);
    }

    if (ehGrande) {
        await _verificarBloqueioAutomatico(
            reservaId, reservaData.data, reservaData.originalBase, reservaData.posicao, reservaData.paxs,
            mudouDeLinha ? null : blocoPreCarregado,
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUEIOS ANTECIPADOS — dias de movimento do hotel (qui/sex/sáb por padrão)
// ─────────────────────────────────────────────────────────────────────────────

export const OBS_BLOQUEIO_SEMANAL = 'somente hóspedes';

/** Dia da semana (getDay 0-6, 0=domingo) de uma data ISO. T12:00 evita rollover
 *  de fuso — mesmo padrão já usado em home.js/dashboard.js. Exportada pra teste. */
export function _diaSemanaDe(dataStr) {
    return new Date(dataStr + 'T12:00:00').getDay();
}

/**
 * Materializa os bloqueios antecipados de uma data, UMA única vez (flag em
 * config_dia). Regra de negócio: nos dias de movimento do hotel, algumas linhas
 * já nascem bloqueadas pra reserva de externo em data futura não consumir as
 * vagas dos hóspedes. Configurável em Configurações (dia da semana, horário,
 * quantidade — config_sistema.bloqueiosSemanais, sincronizado entre usuários).
 *
 * Depois de semeada, a data fica sob controle manual total da recepção:
 * desbloquear ou excluir um bloqueio antecipado NÃO faz o sistema recriá-lo.
 *
 * Só bloqueia linhas base LIVRES (posições 0-2) — nunca atropela reserva
 * existente nem abre linha extra. Datas passadas nunca são semeadas.
 *
 * @param {string} dataAlvo - Data ISO (YYYY-MM-DD) sendo visualizada
 * @returns {Promise<number>} quantos bloqueios foram criados
 */
export async function aplicarBloqueiosSemanais(dataAlvo) {
    if (!dataAlvo) return 0;
    // Nunca decide com base nos defaults do state — espera a config real chegar
    // do Supabase (o listener chama de novo quando ela carrega).
    if (!isConfigSistemaCarregada()) return 0;

    const hoje = new Date().toLocaleDateString('en-CA');
    if (dataAlvo < hoje) return 0;

    const regras = (getConfig().bloqueiosSemanais || {})[String(_diaSemanaDe(dataAlvo))];
    if (!regras || Object.keys(regras).length === 0) return 0;

    if (await db.getBloqueiosSemanaisAplicados(dataAlvo)) return 0;

    let criados = 0;
    for (const [horario, qtd] of Object.entries(regras)) {
        const bloco = await db.buscarReservasPorBloco(dataAlvo, horario);
        for (let i = 0; i < qtd; i++) {
            const pos = _calcularPosicaoLivre(bloco, 0);
            if (pos >= 3) break; // linhas base cheias — nunca abre linha extra sozinho
            await db.criarReserva({
                data: dataAlvo, horario, originalBase: horario, posicao: pos,
                nomes: '', tipo: 'hospede', paxs: 0, chd: 0,
                bloqueado: true,
                obs: OBS_BLOQUEIO_SEMANAL,
            });
            bloco.push({ bloqueado: true, posicao: pos }); // ocupa localmente pra próxima volta
            criados++;
        }
    }

    await db.marcarBloqueiosSemanaisAplicados(dataAlvo);
    if (criados > 0) {
        console.log(`🔒 ${criados} bloqueio(s) antecipado(s) aplicados em ${dataAlvo}`);
    }
    return criados;
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
            codigoReserva: dados.codigoReserva || '',
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
        let blocoPreCarregado = null;
        if (dados.id) {
            dadosAntesReserva = await db.getReservaPorId(dados.id);
            await db.atualizarReserva(dados.id, reservaData);
            docRef = dados.id;
        } else {
            // Calcula posicao livre no bloco antes de salvar nova reserva
            const snapBloco = await db.buscarReservasPorBloco(reservaData.data, reservaData.originalBase);
            blocoPreCarregado = snapBloco;

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

        // A reserva em si já foi gravada — o Realtime já dispara a atualização da grade
        // a partir daqui. Bloqueio automático e log de auditoria rodam em segundo plano
        // (não bloqueiam o retorno) para a tela não ficar esperando por eles; ambos já
        // tratam os próprios erros internamente, então um catch aqui é só rede de segurança.
        _reconciliarBloqueioAutomatico(docRef, dadosAntesReserva, reservaData, blocoPreCarregado)
            .catch(e => console.error('❌ Erro ao reconciliar bloqueio automático:', e));

        if (dados.id) {
            // ✅ dadosAntesReserva é o estado REAL anterior (buscado no banco antes do
            // UPDATE, linha acima) — usar `dados` aqui (o que acabou de ser submetido)
            // comparava os dados novos contra eles mesmos, então nenhuma edição gerava
            // diff detectável no log (bug reportado: paxs alterado não abria detalhes).
            registrarLog('EDITAR', dadosAntesReserva || { id: dados.id }, { id: docRef, ...reservaData });
        } else {
            registrarLog('CRIAR', null, { id: docRef, ...reservaData });
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
    try {
        const dadosAntes = await db.getReservaPorId(id) || { id };
        await db.excluirReserva(id);
        await registrarLog('EXCLUIR', dadosAntes, null);
        console.log('✅ Reserva excluída:', id);
    } catch (error) {
        console.error('❌ Erro ao excluir reserva:', error);
        notificarErro('Erro ao excluir reserva. Tente novamente.');
        throw error;
    }
}

/**
 * Cancela uma reserva — soft-delete: mantém o registro no banco (histórico pra
 * análise, visível no Log do dia), mas some da grade/KPIs como reserva ativa.
 * Diferente de excluirReserva(), que apaga de vez (uso: erro de digitação).
 *
 * O desfecho do depósito é escolhido manualmente pela recepção no momento do
 * cancelamento (modal "CANCELAR RESERVA" — SEM ESTORNO/ESTORNADO/SEM DEPÓSITO),
 * não é mais calculado automaticamente pela regra de 48h.
 *
 * @param {string} id
 * @param {boolean|null} depositoRetido - true = cliente perde o depósito, false = devolvido, null = não houve depósito
 * @returns {Promise<{depositoRetido: boolean|null}>}
 */
export async function cancelarReserva(id, depositoRetido = null) {
    if (!id) throw new Error('ID obrigatório');
    try {
        const dadosAntes = await db.getReservaPorId(id) || { id };

        await db.cancelarReserva(id, depositoRetido);
        await registrarLog('CANCELAR', dadosAntes, {
            ...dadosAntes,
            canceladoEm: new Date().toISOString(),
            depositoRetido,
        });

        console.log('✅ Reserva cancelada:', id, '| depósito retido:', depositoRetido);
        return { depositoRetido };
    } catch (error) {
        console.error('❌ Erro ao cancelar reserva:', error);
        notificarErro('Erro ao cancelar reserva. Tente novamente.');
        throw error;
    }
}

/**
 * Desfaz o cancelamento de uma reserva — volta a ocupar o local/data/horário
 * de origem (nunca alterados pelo cancelamento) e some do filtro "Cancelamentos".
 * O cancelamento em si só continua rastreável pelo log de alterações.
 * @param {string} id
 */
export async function restaurarReserva(id) {
    if (!id) throw new Error('ID obrigatório');
    try {
        const dadosAntes = await db.getReservaPorId(id) || { id };

        // Enquanto cancelada, a posição dela fica livre (_calcularPosicaoLivre ignora
        // canceladas) e uma reserva nova pode tê-la ocupado. Restaurar na mesma posição
        // sobreporia as duas na mesma célula da grade — mesma colisão do bug corrigido
        // em f686423, no sentido inverso. Recalcula como alterarData() faz.
        const originalBase = dadosAntes.originalBase || dadosAntes.horario;
        let novaPosicao = dadosAntes.posicao ?? 0;
        if (dadosAntes.data && originalBase) {
            // A própria reserva ainda está cancelada neste momento, então não conta a si mesma.
            const snapBloco = await db.buscarReservasPorBloco(dadosAntes.data, originalBase);
            novaPosicao = _calcularPosicaoLivre(snapBloco, novaPosicao);
            if (novaPosicao !== dadosAntes.posicao) {
                console.log(`ℹ️ restaurarReserva: posição ${dadosAntes.posicao} ocupada — usando ${novaPosicao}`);
            }
        }

        await db.restaurarReserva(id, novaPosicao);
        await registrarLog('RESTAURAR', dadosAntes, { ...dadosAntes, canceladoEm: null, depositoRetido: null, posicao: novaPosicao });

        console.log('✅ Cancelamento desfeito:', id);
    } catch (error) {
        console.error('❌ Erro ao desfazer cancelamento:', error);
        notificarErro('Erro ao desfazer cancelamento. Tente novamente.');
        throw error;
    }
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

export async function salvarApenasHorario(dados, opcoes = {}) {
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
                //
                // ✅ Busca a partir da posição 0, não da posição antiga (dadosAtuais.posicao).
                // A numeração de posição só faz sentido DENTRO do bloco onde foi calculada —
                // usar a posição de origem como "desejada" aqui só funciona se ela por acaso
                // já estiver livre no destino, senão passa direto por linhas base livres com
                // índice menor. Bug reportado: mover uma reserva que estava numa linha extra
                // (posição 3+) pra outro horário criava uma linha nova mesmo com as 3 linhas
                // base do destino livres, porque a busca nunca considerava as posições 0-2.
                novaPosicao = _calcularPosicaoLivre(snapBloco, 0);

                const capacidadeBase = _totalLinhasBloco(novoOriginalBase);
                if (novaPosicao >= capacidadeBase && !opcoes.permitirNovaLinha) {
                    const erro = new Error(`Sem linha disponível em ${novoHorario}`);
                    erro.semDisponibilidade = true;
                    throw erro;
                }

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
 * @param {{permitirNovaLinha?: boolean}} [opcoes]
 */
export async function alterarData(id, novaData, opcoes = {}) {
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

    // ✅ Mesma checagem de capacidade do bug #65 (salvarApenasHorario) — aqui o bloco
    // (originalBase) não muda, só a data, então reaproveitar a posição antiga como
    // desejada continua fazendo sentido. Mas se as linhas base do destino já estiverem
    // todas ocupadas, também precisa perguntar antes de criar uma linha nova sozinha.
    const capacidadeBase = _totalLinhasBloco(originalBase);
    if (novaPosicao >= capacidadeBase && !opcoes.permitirNovaLinha) {
        const erro = new Error(`Sem linha disponível em ${novaData} ${originalBase}`);
        erro.semDisponibilidade = true;
        throw erro;
    }

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
