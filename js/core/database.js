/* =========================================================================================
   OSTERIA DI LUCCA - DATABASE.JS v1.4
   RESPONSABILIDADE: Camada de Abstração do Firebase (Singleton)
   ✅ v1.0: Remove dependência de window.db
   ✅ v1.1: Etapa 5 — métodos config_dia adicionados
   ✅ v1.2: Firebase inicializado diretamente aqui — elimina window.db e polling setInterval
            firebase-config.js agora é apenas declarativo (sem efeitos colaterais)
   ✅ v1.3: limparConfigDiasAntigos() — exclui docs de config_dia anteriores ao período de
            retenção configurável. Roda client-side via batch, sem precisar de Cloud Function.
   ✅ v1.4: Callbacks de erro dos listeners de reservas não relançam mais (throw) — evita
            "Uncaught FirebaseError" quando o onSnapshot inicial cai em permission-denied
            antes do login terminar de resolver (bug #38).
   ✅ v1.5: Persistência offline do Firestore ativada — recria feature perdida na migração
            pra este repositório (dívida técnica #2, PWA/offline).
   ========================================================================================= */

// ─────────────────────────────────────────────────────────────────────────────
// Configuração do Firebase — centralizada aqui, não mais em firebase-config.js
// ─────────────────────────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAIWarcirpkReNggjMPw1Ba_rft4iNSoUc",
    authDomain: "osteriadilucca-afea6.firebaseapp.com",
    projectId: "osteriadilucca-afea6",
    storageBucket: "osteriadilucca-afea6.firebasestorage.app",
    messagingSenderId: "311839746930",
    appId: "1:311839746930:web:a05d98c70f68c39fd38beb",
};

class DatabaseService {
    constructor() {
        if (DatabaseService.instance) {
            return DatabaseService.instance;
        }

        this.db = null;
        this.inicializado = false;
        this._persistenciaSolicitada = false;

        DatabaseService.instance = this;

        // ✅ v1.2: Inicializa o Firebase imediatamente no construtor.
        // Os scripts do CDN (firebase-app.js, firebase-firestore.js) são carregados
        // como <script> clássico ANTES deste módulo no index.html, portanto
        // `firebase` já está disponível de forma síncrona aqui.
        this._inicializarFirebase();
    }

    /**
     * Inicializa o Firebase e instancia o Firestore de forma síncrona.
     * Chamado pelo construtor e, como fallback, por aguardarInicializacao().
     * @private
     */
    _inicializarFirebase() {
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(FIREBASE_CONFIG);
                console.log('✅ Firebase inicializado pelo DatabaseService');
            } else {
                console.log('✅ Firebase já estava inicializado — DatabaseService reutiliza instância');
            }
            this.db = firebase.firestore();
            this.inicializado = true;
            console.log('✅ Firestore instanciado pelo DatabaseService');
            this._ativarPersistenciaOffline();
        } catch (e) {
            // SDK ainda não disponível — aguardarInicializacao() tentará novamente
            console.warn('⚠️ Firebase ainda não disponível no construtor, aguardando...', e.message);
        }
    }

    /**
     * Ativa o cache offline do Firestore — leituras funcionam offline (vindas do
     * cache local) e escritas ficam enfileiradas até a conexão voltar, sincronizando
     * sozinhas. Relevante para rede instável (ex: rede do hotel).
     *
     * Chamada uma única vez (guard `_persistenciaSolicitada`) porque
     * `_inicializarFirebase()` pode rodar mais de uma vez (fallback de polling
     * em `aguardarInicializacao()`), e `enablePersistence()` só pode ser chamada
     * uma vez por instância do Firestore.
     * @private
     */
    _ativarPersistenciaOffline() {
        if (this._persistenciaSolicitada) return;
        this._persistenciaSolicitada = true;

        this.db.enablePersistence().then(() => {
            console.log('✅ Persistência offline do Firestore ativada');
        }).catch((e) => {
            if (e.code === 'failed-precondition') {
                // Múltiplas abas abertas — só a primeira consegue ativar o cache.
                // Não é um erro real: o app continua funcionando normalmente,
                // só sem cache offline nesta aba específica.
                console.warn('⚠️ Persistência offline não ativada: múltiplas abas abertas.');
            } else if (e.code === 'unimplemented') {
                console.warn('⚠️ Persistência offline não suportada neste navegador.');
            } else {
                console.error('❌ Erro ao ativar persistência offline:', e);
            }
        });
    }

    static getInstance() {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }

    /**
     * Garante que o Firestore está pronto antes de usá-lo.
     *
     * Na v1.2, na esmagadora maioria dos casos retorna imediatamente porque
     * this.inicializado já é true após o construtor.
     *
     * O fallback de polling cobre o edge case em que o SDK do Firebase
     * demore mais que o esperado (ex: conexão lenta, cache miss no CDN).
     *
     * @returns {Promise<void>}
     */
    async aguardarInicializacao() {
        if (this.inicializado && this.db) return;

        // Tenta inicializar agora (pode ter falhado silenciosamente no construtor)
        this._inicializarFirebase();
        if (this.inicializado && this.db) return;

        // Fallback final: polling com timeout de 10s
        console.warn('⚠️ Firebase não estava pronto no construtor — aguardando via polling...');
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Firebase não carregou em 10 segundos'));
            }, 10000);

            const verificar = setInterval(() => {
                this._inicializarFirebase();
                if (this.inicializado && this.db) {
                    clearInterval(verificar);
                    clearTimeout(timeout);
                    resolve();
                }
            }, 100);
        });
    }

    /**
     * Obtém referência ao Firestore.
     * ⚠️ Sempre chame await aguardarInicializacao() antes de usar.
     * @returns {firebase.firestore.Firestore}
     */
    getFirestore() {
        if (!this.inicializado || !this.db) {
            throw new Error('DatabaseService não inicializado. Chame await aguardarInicializacao() primeiro.');
        }
        return this.db;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RESERVAS
    // ─────────────────────────────────────────────────────────────────────────

    async getReservasPorData(data) {
        const db = this.getFirestore();
        const snapshot = await db.collection('reservas').where('data', '==', data).get();
        const reservas = [];
        snapshot.forEach(doc => reservas.push({ id: doc.id, ...doc.data() }));
        return reservas;
    }

    async getReservasPorPeriodo(dataInicio, dataFim) {
        const db = this.getFirestore();
        const snapshot = await db.collection('reservas')
            .where('data', '>=', dataInicio)
            .where('data', '<=', dataFim)
            .get();
        const reservas = [];
        snapshot.forEach(doc => reservas.push({ id: doc.id, ...doc.data() }));
        return reservas;
    }

    async getReservaPorId(id) {
        const db = this.getFirestore();
        const doc = await db.collection('reservas').doc(id).get();
        if (doc.exists) return { id: doc.id, ...doc.data() };
        return null;
    }

    async criarReserva(dados) {
        const db = this.getFirestore();
        const docRef = await db.collection('reservas').add(dados);
        return docRef.id;
    }

    async atualizarReserva(id, dados) {
        const db = this.getFirestore();
        await db.collection('reservas').doc(id).update(dados);
    }

    async excluirReserva(id) {
        const db = this.getFirestore();
        await db.collection('reservas').doc(id).delete();
    }

    escutarReservasPorData(data, callback) {
        const db = this.getFirestore();
        return db.collection('reservas')
            .where('data', '==', data)
            .onSnapshot(
                (snapshot) => {
                    const reservas = [];
                    snapshot.forEach(doc => reservas.push({ id: doc.id, ...doc.data() }));
                    callback(reservas);
                },
                (error) => {
                    // ✅ Não relança — relançar dentro do callback de erro do onSnapshot vira uma
                    // exceção não tratada dentro do SDK do Firestore ("Uncaught FirebaseError"),
                    // sem nenhum benefício sobre só logar (ninguém está ouvindo esse throw).
                    console.error('❌ Erro ao escutar reservas:', error);
                }
            );
    }

    /**
     * Salva uma notificação para todos os usuários lerem.
     * @param {{texto: string, reservaId: string, tipo: string}} dados
     */
    async salvarNotificacao(dados) {
        const firestore = this.getFirestore();
        await firestore.collection('notificacoes').add({
            ...dados,
            timestamp: new Date().toISOString(),
            lido_por: [],
        });
    }

    /**
     * Marca notificação como lida pelo usuário atual.
     * @param {string} id - ID do doc na coleção notificacoes
     * @param {string} usuario
     */
    async marcarNotificacaoLida(id, usuario) {
        const firestore = this.getFirestore();
        await firestore.collection('notificacoes').doc(id).update({
            lido_por: firebase.firestore.FieldValue.arrayUnion(usuario),
        });
    }

    /**
     * Escuta notificações não lidas pelo usuário em tempo real.
     * Retorna apenas docs onde lido_por NÃO contém o usuário.
     * @param {string} usuario
     * @param {Function} callback - (notificacoes[])
     * @returns {Function} unsubscribe
     */
    escutarNotificacoesNaoLidas(usuario, callback) {
        const firestore = this.getFirestore();
        // Firestore não suporta "not contains" — buscamos recentes e filtramos no cliente
        const corte = new Date();
        corte.setHours(corte.getHours() - 12); // janela de 12h
        return firestore.collection('notificacoes')
            .where('timestamp', '>=', corte.toISOString())
            .orderBy('timestamp', 'desc')
            .onSnapshot(snap => {
                const pendentes = [];
                snap.forEach(doc => {
                    const data = { id: doc.id, ...doc.data() };
                    if (!data.lido_por || !data.lido_por.includes(usuario)) {
                        pendentes.push(data);
                    }
                });
                callback(pendentes);
            }, error => {
                console.error('❌ Erro ao escutar notificações:', error);
            });
    }

    /**
     * Igual a escutarReservasPorData mas também passa docChanges para detectar
     * inserções, edições e remoções com dados completos (usado pelo sino).
     * @param {string} data
     * @param {Function} callbackReservas  - (reservas[]) igual ao anterior
     * @param {Function} callbackMudancas  - (changes[{type, antes, depois}]) só após carga inicial
     */
    escutarReservasPorDataComMudancas(data, callbackReservas, callbackMudancas) {
        const db = this.getFirestore();
        let primeiraEntrega = true;
        return db.collection('reservas')
            .where('data', '==', data)
            .onSnapshot(
                (snapshot) => {
                    const reservas = [];
                    snapshot.forEach(doc => reservas.push({ id: doc.id, ...doc.data() }));
                    callbackReservas(reservas);

                    if (primeiraEntrega) { primeiraEntrega = false; return; }

                    // Mapeia mudanças para formato simples
                    const mudancas = snapshot.docChanges().map(change => ({
                        type:   change.type, // 'added' | 'modified' | 'removed'
                        antes:  change.type === 'added'   ? null : { id: change.doc.id, ...change.doc.data() },
                        depois: change.type === 'removed' ? null : { id: change.doc.id, ...change.doc.data() },
                    }));

                    if (mudancas.length > 0) callbackMudancas(mudancas);
                },
                (error) => {
                    // ✅ Não relança — ver comentário equivalente em escutarReservasPorData
                    console.error('❌ Erro ao escutar reservas:', error);
                }
            );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONFIG_DIA — linhasExtras persistidas (Etapa 5)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Salva (merge) o mapa linhasExtras para um dia específico.
     * @param {string} data         - Ex: '2026-02-22'
     * @param {Object} linhasExtras - Ex: { '20:00': 1, '21:00': -1 }
     */
    async salvarConfigDia(data, linhasExtras) {
        const firestore = this.getFirestore();
        await firestore
            .collection('config_dia')
            .doc(data)
            .set({ linhasExtras }, { merge: true });
        console.log(`💾 config_dia/${data} salvo:`, JSON.stringify(linhasExtras));
    }

    /**
     * Escuta em tempo real o documento config_dia/{data}.
     * Chama callback({}) se o documento não existir.
     * @param {string}   data     - Ex: '2026-02-22'
     * @param {Function} callback - Recebe (linhasExtras: Object)
     * @returns {Function} unsubscribe
     */
    escutarConfigDia(data, callback) {
        const firestore = this.getFirestore();
        return firestore
            .collection('config_dia')
            .doc(data)
            .onSnapshot(
                (doc) => {
                    const linhasExtras = doc.exists ? (doc.data().linhasExtras || {}) : {};
                    console.log(`📡 config_dia/${data} recebido:`, JSON.stringify(linhasExtras));
                    callback(linhasExtras);
                },
                (error) => {
                    console.error('❌ Erro ao escutar config_dia:', error);
                    callback({});
                }
            );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONFIG_DIA — limpeza de documentos antigos (v1.3)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Remove documentos de config_dia anteriores ao período de retenção.
     *
     * Por que client-side e não Cloud Function:
     *   Cloud Functions requerem plano Blaze (pago). Esta solução roda uma vez
     *   por sessão de usuário, em background, sem bloquear a UI. O custo de
     *   leitura é mínimo (apenas IDs, sem dados completos) e as exclusões são
     *   feitas em batch (máximo 500 ops por commit, nunca atingido na prática
     *   pois o restaurante dificilmente terá centenas de datas cadastradas).
     *
     * Estratégia:
     *   1. Lista TODOS os docs de config_dia (apenas IDs, sem payload).
     *   2. Filtra os cujo ID (YYYY-MM-DD) seja anterior ao corte.
     *   3. Exclui em batches de até 490 ops (margem de segurança abaixo de 500).
     *   4. Falha silenciosa — não interrompe o fluxo principal.
     *
     * @param {number} [diasRetencao=90] - Quantos dias de histórico manter.
     *                                     90 = mantém 3 meses; use 365 para 1 ano.
     * @returns {Promise<number>} Quantidade de docs excluídos (0 se nenhum).
     */
    async limparConfigDiasAntigos(diasRetencao = 90) {
        const firestore = this.getFirestore();

        // Calcula a data-corte no mesmo formato dos IDs (YYYY-MM-DD)
        const corte = new Date();
        corte.setDate(corte.getDate() - diasRetencao);
        const dataCorte = corte.toISOString().split('T')[0]; // 'YYYY-MM-DD'

        console.log(`🧹 config_dia: verificando docs anteriores a ${dataCorte} (retenção: ${diasRetencao} dias)`);

        // ── 1. Lista todos os docs — select() traz só IDs, sem dados (leitura barata) ──
        // Nota: o SDK v8 (compat) não suporta select() via .select('__name__'),
        // mas get() numa coleção pequena (<365 docs) é igualmente eficiente.
        const snap = await firestore.collection('config_dia').get();

        // ── 2. Filtra apenas os anteriores ao corte ──
        // Os IDs são strings YYYY-MM-DD — comparação lexicográfica é idêntica à cronológica.
        const parasExcluir = [];
        snap.forEach(doc => {
            if (doc.id < dataCorte) {
                parasExcluir.push(doc.id);
            }
        });

        if (parasExcluir.length === 0) {
            console.log('🧹 config_dia: nenhum documento antigo encontrado.');
            return 0;
        }

        console.log(`🧹 config_dia: ${parasExcluir.length} doc(s) antigo(s) para excluir:`, parasExcluir);

        // ── 3. Exclui em batches de até 490 ops ──
        // O Firestore limita um batch a 500 operações. Usamos 490 como margem segura.
        const LIMITE_BATCH = 490;
        let totalExcluidos = 0;

        for (let i = 0; i < parasExcluir.length; i += LIMITE_BATCH) {
            const lote = parasExcluir.slice(i, i + LIMITE_BATCH);
            const batch = firestore.batch();
            lote.forEach(id => {
                batch.delete(firestore.collection('config_dia').doc(id));
            });
            await batch.commit();
            totalExcluidos += lote.length;
            console.log(`🧹 config_dia: batch ${Math.floor(i / LIMITE_BATCH) + 1} — ${lote.length} doc(s) excluído(s)`);
        }

        console.log(`✅ config_dia: limpeza concluída — ${totalExcluidos} doc(s) removido(s)`);
        return totalExcluidos;
    }
}

// Exporta instância única — o construtor já inicializa o Firebase
export const db = DatabaseService.getInstance();
export { DatabaseService };
