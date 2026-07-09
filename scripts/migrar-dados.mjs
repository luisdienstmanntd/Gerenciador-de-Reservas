/* =========================================================================================
   OSTERIA DI LUCCA - MIGRAR-DADOS.MJS v1.0
   RESPONSABILIDADE: Fase 4 da migração Firestore → Supabase — migração única dos dados
   existentes. Roda uma vez, localmente, via Node.

   Como rodar:
     node --env-file=.env scripts/migrar-dados.mjs

   Requer um .env local (nunca commitado) com:
     MIGRATION_EMAIL=recepcao@osteriadilucca.app
     MIGRATION_FIREBASE_SENHA=<senha do Firebase Auth>
     MIGRATION_SUPABASE_SENHA=<senha do Supabase Auth>

   Estratégia: em vez de usar a service_role key do Supabase (acesso total, ignora RLS),
   o script loga como um usuário real dos dois lados — mesma conta que a equipe já usa.
   Evita introduzir uma chave mais perigosa só pra essa migração pontual.
   ========================================================================================= */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { createClient } from '@supabase/supabase-js';

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAIWarcirpkReNggjMPw1Ba_rft4iNSoUc",
    authDomain: "osteriadilucca-afea6.firebaseapp.com",
    projectId: "osteriadilucca-afea6",
    storageBucket: "osteriadilucca-afea6.firebasestorage.app",
    messagingSenderId: "311839746930",
    appId: "1:311839746930:web:a05d98c70f68c39fd38beb",
};

const SUPABASE_URL = 'https://fiamtckdglzdrynmrlpj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_y1q0B_PIHkTz_Zk_HQhOHQ_3wPRRiS1';

function exigirEnv(nome) {
    const valor = process.env[nome];
    if (!valor) {
        console.error(`❌ Variável de ambiente ${nome} não definida. Crie um .env local (ver cabeçalho deste arquivo).`);
        process.exit(1);
    }
    return valor;
}

async function main() {
    const email = exigirEnv('MIGRATION_EMAIL');
    const senhaFirebase = exigirEnv('MIGRATION_FIREBASE_SENHA');
    const senhaSupabase = exigirEnv('MIGRATION_SUPABASE_SENHA');

    // ── 1. Login nos dois lados ──────────────────────────────────────────────────────────
    console.log('🔐 Autenticando no Firebase...');
    const firebaseApp = initializeApp(FIREBASE_CONFIG);
    const firebaseAuth = getAuth(firebaseApp);
    await signInWithEmailAndPassword(firebaseAuth, email, senhaFirebase);
    const db = getFirestore(firebaseApp);
    console.log('✅ Firebase autenticado como', email);

    console.log('🔐 Autenticando no Supabase...');
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const { error: erroLoginSupabase } = await supabase.auth.signInWithPassword({ email, password: senhaSupabase });
    if (erroLoginSupabase) {
        console.error('❌ Login no Supabase falhou:', erroLoginSupabase.message);
        process.exit(1);
    }
    console.log('✅ Supabase autenticado como', email);

    // Suporta reprocessar só IDs específicos, sem repetir a migração inteira
    // (ex: node --env-file=.env scripts/migrar-dados.mjs --retry-ids=id1,id2)
    const argRetry = process.argv.find((a) => a.startsWith('--retry-ids='));

    // ── 2. Trava de segurança — evita migrar duas vezes por engano ──────────────────────
    const { count: reservasExistentes } = await supabase.from('reservas').select('*', { count: 'exact', head: true });
    if (reservasExistentes > 0 && !process.argv.includes('--force') && !argRetry) {
        console.error(`❌ A tabela 'reservas' no Supabase já tem ${reservasExistentes} linha(s). Rode com --force se quiser migrar mesmo assim (pode duplicar dados).`);
        process.exit(1);
    }

    // ── 3. Lê reservas do Firestore ───────────────────────────────────────────────────────
    console.log('\n📥 Lendo reservas do Firestore...');
    const snapReservas = await getDocs(collection(db, 'reservas'));
    const reservas = [];
    snapReservas.forEach((doc) => reservas.push({ id: doc.id, ...doc.data() }));
    console.log(`   ${reservas.length} reserva(s) encontrada(s)`);

    // ── 4. Resolve/cria hóspedes com dedup ────────────────────────────────────────────────
    // Regra (definida com o dono do projeto): hóspede/roomservice por apto+nome; sem apto
    // ainda, por telefone+nome (cobre o caso de reserva feita por telefone antes do apto
    // ser definido); externo/passante sempre por telefone+nome.
    const hospedeCache = new Map();

    async function resolverHospedeId(r) {
        if (!r.nomes || !r.nomes.trim()) return null; // slot vazio ou bloqueio — sem hóspede
        const nome = r.nomes.trim().toUpperCase();
        const tipo = r.tipo || 'hospede';
        const isHospedeOuRoom = tipo === 'hospede' || tipo === 'roomservice';

        const chave = isHospedeOuRoom
            ? `apto:${r.apto || ''}:${nome}`
            : `tel:${r.whatsapp || ''}:${nome}`;

        if (hospedeCache.has(chave)) return hospedeCache.get(chave);

        let query = supabase.from('hospedes').select('id').eq('nome', nome).eq('tipo', tipo);
        if (isHospedeOuRoom && r.apto) query = query.eq('apto', r.apto);
        if (!isHospedeOuRoom && r.whatsapp) query = query.eq('telefone', r.whatsapp);

        const { data: existentes } = await query.limit(1);
        if (existentes && existentes.length > 0) {
            hospedeCache.set(chave, existentes[0].id);
            return existentes[0].id;
        }

        const { data: novo, error } = await supabase
            .from('hospedes')
            .insert({
                nome,
                apto: isHospedeOuRoom ? (r.apto || null) : null,
                telefone: r.whatsapp || null,
                tipo,
            })
            .select('id')
            .single();

        if (error) throw new Error(`Falha ao criar hóspede "${nome}": ${error.message}`);
        hospedeCache.set(chave, novo.id);
        return novo.id;
    }

    // ── 4b. Garante que a mesa existe na tabela de referência ────────────────────────────
    // O total de mesas é CONFIGURÁVEL pelo restaurante (tela de Configurações) — o salão
    // pode ser reorganizado com mais mesas a qualquer momento. Por isso 'mesas' não é uma
    // lista fixa: criamos a mesa sob demanda na primeira vez que aparece uma reserva com
    // esse número, em vez de exigir um cadastro prévio.
    const mesasConhecidas = new Set();
    async function garantirMesaExiste(identificador) {
        if (mesasConhecidas.has(identificador)) return;
        const tipo = identificador === 'ROOM' ? 'room_service' : 'numerada';
        const { error } = await supabase.from('mesas').upsert({ identificador, tipo }, { onConflict: 'identificador' });
        if (error) throw new Error(`Falha ao garantir mesa "${identificador}": ${error.message}`);
        mesasConhecidas.add(identificador);
    }

    // ── 5. Insere reservas ─────────────────────────────────────────────────────────────────
    console.log('\n📤 Migrando reservas...');
    const idMap = new Map(); // id antigo (Firestore) → id novo (Supabase)
    let reservasMigradas = 0;
    let reservasComErro = 0;

    const reservasParaProcessar = argRetry
        ? reservas.filter((r) => argRetry.slice('--retry-ids='.length).split(',').includes(r.id))
        : reservas;
    if (argRetry) console.log(`   (modo retry: reprocessando ${reservasParaProcessar.length} reserva(s) específica(s))`);

    for (const r of reservasParaProcessar) {
        try {
            const hospedeId = await resolverHospedeId(r);
            const mesaId = r.mesa && r.mesa !== '' && r.mesa !== '-' ? r.mesa : null;
            if (mesaId) await garantirMesaExiste(mesaId);

            const { data: nova, error } = await supabase
                .from('reservas')
                .insert({
                    hospede_id: hospedeId,
                    mesa_identificador: mesaId,
                    data: r.data,
                    horario: r.horario,
                    original_base: r.originalBase || r.horario,
                    posicao: r.posicao ?? 0,
                    paxs: r.paxs || 0,
                    chd: r.chd || 0,
                    avulsa: r.avulsa || null,
                    obs: r.obs || null,
                    bloqueado: !!r.bloqueado,
                    somente_hospedes: !!r.somenteHospedes,
                    pagamento: r.pagamento || null,
                    menu_degustacao: !!r.menuDegustacao,
                    inicio_mesa: r.inicioMesa || null,
                    fim_mesa: r.fimMesa || null,
                })
                .select('id')
                .single();

            if (error) throw new Error(error.message);
            idMap.set(r.id, nova.id);
            reservasMigradas++;
        } catch (e) {
            console.error(`   ❌ Reserva ${r.id} (${r.data} ${r.horario}): ${e.message}`);
            reservasComErro++;
        }
    }
    console.log(`✅ ${reservasMigradas} reserva(s) migrada(s), ${reservasComErro} com erro`);

    let snapLogs = { size: 0 }, logsMigrados = 0;
    let snapConfig = { size: 0 }, configMigrados = 0;
    let snapNotif = { size: 0 }, notifMigradas = 0;

    if (!argRetry) {
        // ── 6. Migra logs → reservas_log ──────────────────────────────────────────────────
        console.log('\n📤 Migrando logs...');
        snapLogs = await getDocs(collection(db, 'logs'));
        for (const doc of snapLogs.docs) {
            const l = doc.data();
            const { error } = await supabase.from('reservas_log').insert({
                reserva_id: idMap.get(l.reservaId) || null,
                acao: l.acao,
                usuario: l.usuario,
                dados_antes: l.dadosAntes || null,
                dados_depois: l.dadosDepois || null,
                criado_em: l.timestamp || new Date().toISOString(),
            });
            if (!error) logsMigrados++;
            else console.error(`   ❌ Log ${doc.id}: ${error.message}`);
        }
        console.log(`✅ ${logsMigrados} log(s) migrado(s) de ${snapLogs.size}`);

        // ── 7. Migra config_dia ─────────────────────────────────────────────────────────────
        console.log('\n📤 Migrando config_dia...');
        snapConfig = await getDocs(collection(db, 'config_dia'));
        for (const doc of snapConfig.docs) {
            const c = doc.data();
            const { error } = await supabase.from('config_dia').upsert({
                data: doc.id,
                linhas_extras: c.linhasExtras || {},
            });
            if (!error) configMigrados++;
            else console.error(`   ❌ config_dia ${doc.id}: ${error.message}`);
        }
        console.log(`✅ ${configMigrados} config_dia migrado(s) de ${snapConfig.size}`);

        // ── 8. Migra notificacoes ───────────────────────────────────────────────────────────
        console.log('\n📤 Migrando notificações...');
        snapNotif = await getDocs(collection(db, 'notificacoes'));
        for (const doc of snapNotif.docs) {
            const n = doc.data();
            const { error } = await supabase.from('notificacoes').insert({
                texto: n.texto,
                reserva_id: idMap.get(n.reservaId) || null,
                lido_por: n.lido_por || [],
                criado_em: n.timestamp || new Date().toISOString(),
            });
            if (!error) notifMigradas++;
            else console.error(`   ❌ Notificação ${doc.id}: ${error.message}`);
        }
        console.log(`✅ ${notifMigradas} notificação(ões) migrada(s) de ${snapNotif.size}`);
    } else {
        console.log('\n(modo retry: logs/config_dia/notificações não são reprocessados)');
    }

    // ── 9. Validação final ────────────────────────────────────────────────────────────────
    console.log('\n=== VALIDAÇÃO ===');
    console.log(`reservas:      Firestore ${reservasParaProcessar.length} → Supabase ${reservasMigradas}${reservasComErro ? ` (⚠️ ${reservasComErro} com erro)` : ' ✅'}`);
    if (!argRetry) {
        console.log(`logs:          Firestore ${snapLogs.size} → Supabase ${logsMigrados}${logsMigrados === snapLogs.size ? ' ✅' : ' ⚠️'}`);
        console.log(`config_dia:    Firestore ${snapConfig.size} → Supabase ${configMigrados}${configMigrados === snapConfig.size ? ' ✅' : ' ⚠️'}`);
        console.log(`notificacoes:  Firestore ${snapNotif.size} → Supabase ${notifMigradas}${notifMigradas === snapNotif.size ? ' ✅' : ' ⚠️'}`);
    }
    console.log(`hóspedes criados/reaproveitados: ${hospedeCache.size}`);
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('\n💥 Erro fatal na migração:', e.message);
        process.exit(1);
    });
