/* =========================================================================================
   OSTERIA DI LUCCA - DATABASE.JS v2.0
   RESPONSABILIDADE: Camada de Abstração do Supabase (Singleton)
   ✅ v1.0-v1.5: histórico Firestore — ver git log para versões anteriores.
   ✅ v2.0: Fase 5 da migração Firestore → Supabase. Reescrito por dentro para falar com
            o Supabase (Postgres), mas mantém EXATAMENTE os mesmos nomes de método e o
            mesmo formato de retorno (objeto achatado em camelCase) de antes — quem consome
            esta classe (listener.js, home.js, service.js, log.js) não precisa mudar nada
            além da própria migração de service.js/log.js. Ver plano_de_ação.md §Fase 5.

            Duas tabelas viraram uma na visão da aplicação: o Postgres normalizou
            `reservas` + `hospedes`, mas a UI continua enxergando um único objeto achatado
            (nomes, apto, whatsapp, tipo, mesa, originalBase, somenteHospedes...). A tradução
            entre os dois formatos vive nos helpers privados _paraReservaApp()/_paraColunasReserva().

            Persistência offline (enablePersistence do Firestore) NÃO foi recriada aqui —
            o Supabase não tem equivalente pronto; ver dívida técnica no prompt.md.
   ========================================================================================= */

import { supabase } from './supabaseClient.js';

class DatabaseService {
    constructor() {
        if (DatabaseService.instance) {
            return DatabaseService.instance;
        }

        this.client = supabase;
        DatabaseService.instance = this;
    }

    static getInstance() {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }

    /**
     * Mantida por compatibilidade de interface — service.js/log.js/listener.js/home.js
     * chamam isso antes de usar o banco. O cliente Supabase já é criado de forma síncrona
     * no construtor (sem SDK de app tipo firebase.initializeApp para esperar), então não
     * há nada de fato assíncrono aqui; a função existe só para não exigir mudança nos
     * chamadores.
     * @returns {Promise<void>}
     */
    async aguardarInicializacao() {
        return;
    }

    /**
     * Acesso direto ao cliente do Supabase — usado por service.js/log.js para consultas
     * que não se encaixam nos métodos de alto nível abaixo (ex: filtros compostos por
     * data+originalBase). Equivalente ao antigo getFirestore().
     * @returns {import('@supabase/supabase-js').SupabaseClient}
     */
    getClient() {
        return this.client;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRADUÇÃO Postgres (normalizado) ↔ formato antigo da app (achatado)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Postgres guarda horario/original_base como tipo `time`, que a API retorna como
     * "HH:MM:SS" (ex: "20:30:00"). O app inteiro compara horários como string "HH:MM"
     * (ex: '20:30' === '20:30'), herdado do Firestore que guardava string simples.
     * Corta os segundos pra manter esse formato — sem isso, toda comparação de horário
     * (grade, blocos, dashboard) quebra silenciosamente.
     * @private
     */
    _horaCurta(t) {
        if (!t) return t;
        return t.length > 5 ? t.slice(0, 5) : t;
    }

    /**
     * Converte uma linha de `reservas` (com `hospedes` embutido via join) para o
     * formato achatado que a UI sempre conheceu.
     * @private
     */
    _paraReservaApp(row) {
        const hospede = row.hospedes || {};
        return {
            id: row.id,
            data: row.data,
            horario: this._horaCurta(row.horario),
            originalBase: this._horaCurta(row.original_base),
            posicao: row.posicao ?? 0,
            tipo: hospede.tipo || 'hospede',
            nomes: hospede.nome || '',
            apto: hospede.apto || '',
            codigoReserva: hospede.codigo_reserva || '',
            whatsapp: hospede.telefone || '',
            avulsa: row.avulsa || '',
            paxs: row.paxs || 0,
            chd: row.chd || 0,
            obs: row.obs || '',
            mesa: row.mesa_identificador || '',
            bloqueado: row.bloqueado || false,
            somenteHospedes: row.somente_hospedes || false,
            pagamento: row.pagamento || '',
            menuDegustacao: row.menu_degustacao || false,
            inicioMesa: row.inicio_mesa || null,
            fimMesa: row.fim_mesa || null,
            bloqueioOrigemId: row.bloqueio_origem_id || null,
            canceladoEm: row.cancelado_em || null,
            depositoRetido: row.deposito_retido,
        };
    }

    /**
     * Encontra o hóspede correspondente aos dados da reserva, ou cria um novo.
     *
     * Editando uma reserva que JÁ tem hóspede vinculado (hospedeIdExistente):
     * atualiza o mesmo cadastro em vez de buscar/criar outro. Isso é o que faz o
     * fluxo "reservou com código, apto foi definido depois" funcionar sem duplicar
     * cadastro — a recepção edita a reserva preenchendo o apto, e o mesmo hóspede é
     * atualizado (não perde o codigo_reserva original, que só deixa de aparecer na
     * grade porque a exibição prioriza apto quando os dois existem — ver render.js).
     *
     * Criação nova (sem hóspede vinculado ainda): dedup em cascata (documentada
     * desde a Fase 2, ver supabase/migrations/20260709133321_initial_schema.sql):
     *   - hóspede/roomservice → apto+nome, ou codigo_reserva+nome quando ainda não
     *     há apto definido (reserva feita por telefone/WhatsApp antes do check-in)
     *   - externo/passante    → telefone+nome
     *
     * @param {Object} dados
     * @param {string|null} [hospedeIdExistente] - hospede_id já vinculado à reserva
     *   sendo editada (null numa criação nova)
     * @private
     */
    async _resolverHospedeId(dados, hospedeIdExistente = null) {
        if (!dados.nomes || !dados.nomes.trim()) return null; // slot vazio ou bloqueio — sem hóspede

        const nome = dados.nomes.trim().toUpperCase();
        const tipo = dados.tipo || 'hospede';
        const isHospedeOuRoom = tipo === 'hospede' || tipo === 'roomservice';

        if (hospedeIdExistente) {
            const { error: erroUpdate } = await this.client.from('hospedes').update({
                nome,
                apto: isHospedeOuRoom ? (dados.apto || null) : null,
                codigo_reserva: isHospedeOuRoom ? (dados.codigoReserva || null) : null,
                telefone: dados.whatsapp || null,
                tipo,
            }).eq('id', hospedeIdExistente);
            if (erroUpdate) throw erroUpdate;
            return hospedeIdExistente;
        }

        let query = this.client.from('hospedes').select('id').eq('nome', nome).eq('tipo', tipo);
        if (isHospedeOuRoom && dados.apto) {
            query = query.eq('apto', dados.apto);
        } else if (isHospedeOuRoom && dados.codigoReserva) {
            query = query.eq('codigo_reserva', dados.codigoReserva);
        } else if (!isHospedeOuRoom && dados.whatsapp) {
            query = query.eq('telefone', dados.whatsapp);
        }

        const { data: existentes, error: erroConsulta } = await query.limit(1);
        if (erroConsulta) throw erroConsulta;
        if (existentes && existentes.length > 0) return existentes[0].id;

        const { data: novo, error: erroCriar } = await this.client
            .from('hospedes')
            .insert({
                nome,
                apto: isHospedeOuRoom ? (dados.apto || null) : null,
                codigo_reserva: isHospedeOuRoom ? (dados.codigoReserva || null) : null,
                telefone: dados.whatsapp || null,
                tipo,
            })
            .select('id')
            .single();

        if (erroCriar) throw erroCriar;
        return novo.id;
    }

    /**
     * Garante que a mesa existe na tabela de referência antes de vincular uma reserva a
     * ela. Necessário porque o número de mesas é configurável pelo restaurante (tela de
     * Configurações) — não é uma lista fixa. Mesmo problema real encontrado na Fase 4
     * (mesas 19/20 não existiam na lista pré-populada de 1-18).
     * @private
     */
    async garantirMesaExiste(identificador) {
        if (!identificador) return;
        const tipo = identificador === 'ROOM' ? 'room_service' : 'numerada';
        const { error } = await this.client
            .from('mesas')
            .upsert({ identificador, tipo }, { onConflict: 'identificador' });
        if (error) throw error;
    }

    /**
     * Converte o objeto achatado que a UI usa para criar/atualizar uma reserva nas
     * colunas reais de `reservas`, resolvendo hospede_id e garantindo mesa_identificador
     * como efeitos colaterais (ambos exigem ida ao banco).
     * @param {Object} dados
     * @param {string|null} [hospedeIdExistente] - Repassado pra _resolverHospedeId
     * @private
     */
    async _paraColunasReserva(dados, hospedeIdExistente = null) {
        const hospedeId = await this._resolverHospedeId(dados, hospedeIdExistente);
        const mesaId = dados.mesa && dados.mesa !== '' && dados.mesa !== '-' ? dados.mesa : null;
        if (mesaId) await this.garantirMesaExiste(mesaId);

        return {
            hospede_id: hospedeId,
            mesa_identificador: mesaId,
            data: dados.data,
            horario: dados.horario,
            original_base: dados.originalBase || dados.horario,
            posicao: parseInt(dados.posicao) || 0,
            paxs: parseInt(dados.paxs) || 0,
            chd: parseInt(dados.chd) || 0,
            avulsa: dados.avulsa || null,
            obs: dados.obs || null,
            bloqueado: dados.bloqueado || false,
            somente_hospedes: dados.somenteHospedes || false,
            pagamento: dados.pagamento || null,
            menu_degustacao: dados.menuDegustacao || false,
            bloqueio_origem_id: dados.bloqueioOrigemId || null,
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RESERVAS
    // ─────────────────────────────────────────────────────────────────────────

    async getReservasPorData(data) {
        const { data: rows, error } = await this.client
            .from('reservas').select('*, hospedes(*)').eq('data', data);
        if (error) throw error;
        return rows.map(r => this._paraReservaApp(r));
    }

    async getReservasPorPeriodo(dataInicio, dataFim) {
        const { data: rows, error } = await this.client
            .from('reservas').select('*, hospedes(*)')
            .gte('data', dataInicio).lte('data', dataFim);
        if (error) throw error;
        return rows.map(r => this._paraReservaApp(r));
    }

    /**
     * Busca as reservas de um bloco específico (data + horário-base). Usado por
     * service.js para calcular posição livre e detectar docs "fantasma" — precisa do
     * hóspede embutido (join) porque a checagem de "slot ocupado" depende de `nomes`.
     * @returns {Promise<Array>} reservas no formato achatado de sempre
     */
    async buscarReservasPorBloco(data, originalBase) {
        const { data: rows, error } = await this.client
            .from('reservas').select('*, hospedes(*)')
            .eq('data', data).eq('original_base', originalBase);
        if (error) throw error;
        return rows.map(r => this._paraReservaApp(r));
    }

    /**
     * Busca bloqueios automáticos gerados por uma reserva específica (reserva grande
     * que bloqueou a próxima linha do bloco). Usado pra desfazer o bloqueio quando a
     * reserva de origem deixa de ter 4+ pessoas.
     */
    async buscarBloqueiosAutomaticos(reservaOrigemId) {
        const { data: rows, error } = await this.client
            .from('reservas').select('*, hospedes(*)').eq('bloqueio_origem_id', reservaOrigemId);
        if (error) throw error;
        return rows.map(r => this._paraReservaApp(r));
    }

    async getReservaPorId(id) {
        const { data: row, error } = await this.client
            .from('reservas').select('*, hospedes(*)').eq('id', id).maybeSingle();
        if (error) throw error;
        return row ? this._paraReservaApp(row) : null;
    }

    async criarReserva(dados) {
        const colunas = await this._paraColunasReserva(dados);
        const { data: nova, error } = await this.client
            .from('reservas').insert(colunas).select('id').single();
        if (error) throw error;
        return nova.id;
    }

    async atualizarReserva(id, dados) {
        // Busca o hospede_id já vinculado, se houver — pra _resolverHospedeId()
        // atualizar o mesmo cadastro em vez de buscar/criar outro (ver seu docstring).
        const { data: atual } = await this.client.from('reservas').select('hospede_id').eq('id', id).maybeSingle();
        const colunas = await this._paraColunasReserva(dados, atual?.hospede_id || null);
        const { error } = await this.client.from('reservas').update(colunas).eq('id', id);
        if (error) throw error;
    }

    async excluirReserva(id) {
        const { error } = await this.client.from('reservas').delete().eq('id', id);
        if (error) throw error;
    }

    /**
     * Cancela uma reserva (soft-delete) — mantém a linha no banco pra análise,
     * mas marca `cancelado_em` pra ela parar de contar como reserva ativa (grade,
     * KPIs, Dashboard). `depositoRetido` é calculado por quem chama (service.js),
     * com base no prazo de 48h — só relevante pra tipo='externo'.
     * @param {string} id
     * @param {boolean|null} depositoRetido
     */
    async cancelarReserva(id, depositoRetido) {
        const { error } = await this.client.from('reservas').update({
            cancelado_em: new Date().toISOString(),
            deposito_retido: depositoRetido,
        }).eq('id', id);
        if (error) throw error;
    }

    /**
     * Escuta reservas de uma data em tempo real via Supabase Realtime.
     * Igual ao comportamento antigo do Firestore: a cada mudança, refaz a busca inteira
     * e entrega a lista completa (não tenta reconciliar diffs incrementalmente).
     *
     * ⚠️ Requer Realtime habilitado na tabela `reservas` (ver migration
     * 20260709160000_habilitar_realtime.sql) — sem isso o evento nunca dispara.
     *
     * @returns {Function} unsubscribe
     */
    escutarReservasPorData(data, callback) {
        const buscar = async () => {
            try {
                callback(await this.getReservasPorData(data));
            } catch (error) {
                console.error('❌ Erro ao escutar reservas:', error);
            }
        };
        buscar();

        const channel = this.client
            .channel(`reservas-${data}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas', filter: `data=eq.${data}` }, buscar)
            .subscribe();

        return () => this.client.removeChannel(channel);
    }

    /**
     * Salva uma notificação para todos os usuários lerem.
     * @param {{texto: string, reservaId: string}} dados
     */
    async salvarNotificacao(dados) {
        const { error } = await this.client.from('notificacoes').insert({
            texto: dados.texto,
            reserva_id: dados.reservaId || null,
            lido_por: [],
        });
        if (error) throw error;
    }

    /**
     * Marca notificação como lida pelo usuário atual.
     * ⚠️ Não é atômico como o arrayUnion do Firestore (lê o array, adiciona e regrava) —
     * tradeoff aceito dado o volume baixo de usuários internos clicando "OK" ao mesmo tempo.
     */
    async marcarNotificacaoLida(id, usuario) {
        const { data: row, error: erroLeitura } = await this.client
            .from('notificacoes').select('lido_por').eq('id', id).single();
        if (erroLeitura) throw erroLeitura;

        const atual = row.lido_por || [];
        if (atual.includes(usuario)) return;

        const { error } = await this.client
            .from('notificacoes').update({ lido_por: [...atual, usuario] }).eq('id', id);
        if (error) throw error;
    }

    /**
     * Escuta notificações não lidas pelo usuário em tempo real.
     * @returns {Function} unsubscribe
     */
    escutarNotificacoesNaoLidas(usuario, callback) {
        const corte = new Date();
        corte.setHours(corte.getHours() - 12); // janela de 12h, igual antes

        const buscar = async () => {
            try {
                const { data: rows, error } = await this.client
                    .from('notificacoes').select('*')
                    .gte('criado_em', corte.toISOString())
                    .order('criado_em', { ascending: false });
                if (error) throw error;

                const pendentes = rows
                    .filter(n => !n.lido_por || !n.lido_por.includes(usuario))
                    .map(n => ({ id: n.id, texto: n.texto, reservaId: n.reserva_id, lido_por: n.lido_por, timestamp: n.criado_em }));
                callback(pendentes);
            } catch (error) {
                console.error('❌ Erro ao escutar notificações:', error);
            }
        };
        buscar();

        const channel = this.client
            .channel('notificacoes-pendentes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacoes' }, buscar)
            .subscribe();

        return () => this.client.removeChannel(channel);
    }

    /**
     * Igual a escutarReservasPorData mas também dispara callbackMudancas quando uma
     * reserva NOVA é inserida (usado pelo sino de notificação).
     *
     * Diferente do Firestore: o Realtime do Postgres só entrega eventos que acontecem
     * DEPOIS da inscrição no canal — não existe o "primeiro snapshot com tudo marcado
     * como added" que o Firestore tinha, então não precisamos do flag `primeiraEntrega`
     * pra ignorar a carga inicial.
     *
     * @param {string} data
     * @param {Function} callbackReservas - (reservas[])
     * @param {Function} callbackMudancas  - (changes[{type, antes, depois}])
     * @returns {Function} unsubscribe
     */
    escutarReservasPorDataComMudancas(data, callbackReservas, callbackMudancas) {
        const buscar = async () => {
            try {
                callbackReservas(await this.getReservasPorData(data));
            } catch (error) {
                console.error('❌ Erro ao escutar reservas:', error);
            }
        };
        buscar();

        const tratarMudanca = async (payload) => {
            buscar(); // sempre refaz a lista completa, igual ao comportamento anterior

            if (payload.eventType !== 'INSERT') return;

            const row = payload.new;
            let hospede = null;
            if (row.hospede_id) {
                const { data: h } = await this.client.from('hospedes').select('*').eq('id', row.hospede_id).maybeSingle();
                hospede = h;
            }
            const depois = this._paraReservaApp({ ...row, hospedes: hospede });
            if (!depois.nomes || depois.bloqueado || depois.somenteHospedes) return;

            callbackMudancas([{ type: 'added', antes: null, depois }]);
        };

        const channel = this.client
            .channel(`reservas-mudancas-${data}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas', filter: `data=eq.${data}` }, tratarMudanca)
            .subscribe();

        return () => this.client.removeChannel(channel);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONFIG_DIA — linhasExtras persistidas
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Salva (upsert) o mapa linhasExtras para um dia específico.
     * @param {string} data         - Ex: '2026-02-22'
     * @param {Object} linhasExtras - Ex: { '20:00': 1, '21:00': -1 }
     */
    async salvarConfigDia(data, linhasExtras) {
        const { error } = await this.client
            .from('config_dia').upsert({ data, linhas_extras: linhasExtras });
        if (error) throw error;
        console.log(`💾 config_dia/${data} salvo:`, JSON.stringify(linhasExtras));
    }

    /**
     * Escuta em tempo real a linha config_dia da data indicada.
     * Chama callback({}) se a linha não existir.
     * @returns {Function} unsubscribe
     */
    escutarConfigDia(data, callback) {
        const buscar = async () => {
            try {
                const { data: row, error } = await this.client
                    .from('config_dia').select('linhas_extras').eq('data', data).maybeSingle();
                if (error) throw error;
                const linhasExtras = row ? (row.linhas_extras || {}) : {};
                console.log(`📡 config_dia/${data} recebido:`, JSON.stringify(linhasExtras));
                callback(linhasExtras);
            } catch (error) {
                console.error('❌ Erro ao escutar config_dia:', error);
                callback({});
            }
        };
        buscar();

        const channel = this.client
            .channel(`config-dia-${data}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'config_dia', filter: `data=eq.${data}` }, buscar)
            .subscribe();

        return () => this.client.removeChannel(channel);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONFIG_DIA — limpeza de linhas antigas
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Remove linhas de config_dia anteriores ao período de retenção.
     *
     * No Firestore isso exigia ~50 linhas de batch manual (sem "delete where <").
     * No Postgres é um filtro nativo — grande simplificação.
     *
     * @param {number} [diasRetencao=90] - Quantos dias de histórico manter.
     * @returns {Promise<number>} Quantidade de linhas excluídas (0 se nenhuma).
     */
    async limparConfigDiasAntigos(diasRetencao = 90) {
        const corte = new Date();
        corte.setDate(corte.getDate() - diasRetencao);
        const dataCorte = corte.toISOString().split('T')[0]; // 'YYYY-MM-DD'

        console.log(`🧹 config_dia: verificando linhas anteriores a ${dataCorte} (retenção: ${diasRetencao} dias)`);

        const { data: apagados, error } = await this.client
            .from('config_dia').delete().lt('data', dataCorte).select('data');

        if (error) {
            console.error('❌ Erro ao limpar config_dia antigos:', error);
            return 0;
        }

        console.log(`✅ config_dia: limpeza concluída — ${apagados.length} linha(s) removida(s)`);
        return apagados.length;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONFIG_SISTEMA — capacidade/mesas/bloqueioAutomatico, sincronizados entre
    // recepção/osteria/gerência (antes viviam só no localStorage de cada tablet)
    // ─────────────────────────────────────────────────────────────────────────

    /** Converte a linha (snake_case) pro formato achatado que a UI usa. */
    _paraConfigSistemaApp(row) {
        return {
            capacidade: row.capacidade,
            mesas: row.mesas,
            bloqueioAutomatico: row.bloqueio_automatico,
        };
    }

    /**
     * Salva (update) a linha única de config_sistema.
     * @param {{capacidade:number, mesas:number, bloqueioAutomatico:boolean}} config
     */
    async salvarConfigSistema(config) {
        const { error } = await this.client.from('config_sistema').update({
            capacidade: config.capacidade,
            mesas: config.mesas,
            bloqueio_automatico: config.bloqueioAutomatico,
        }).eq('id', 1);
        if (error) throw error;
        console.log('💾 config_sistema salvo:', config);
    }

    /**
     * Escuta em tempo real a linha única de config_sistema.
     * @param {Function} callback - Recebe {capacidade, mesas, bloqueioAutomatico}
     * @returns {Function} unsubscribe
     */
    escutarConfigSistema(callback) {
        const buscar = async () => {
            try {
                const { data: row, error } = await this.client
                    .from('config_sistema').select('*').eq('id', 1).maybeSingle();
                if (error) throw error;
                if (row) callback(this._paraConfigSistemaApp(row));
            } catch (error) {
                console.error('❌ Erro ao escutar config_sistema:', error);
            }
        };
        buscar();

        const channel = this.client
            .channel('config-sistema')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'config_sistema' }, buscar)
            .subscribe();

        return () => this.client.removeChannel(channel);
    }
}

// Exporta instância única
export const db = DatabaseService.getInstance();
export { DatabaseService };
