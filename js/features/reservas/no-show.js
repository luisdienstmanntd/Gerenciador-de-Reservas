import { db } from '../../core/database.js';

const ATRASO_APOS_MEIA_NOITE_MS = 5000;
let timerVirada = null;

export function dataLocalHoje(data = new Date()) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

export function proximaVirada(data = new Date()) {
    const proxima = new Date(data);
    proxima.setHours(24, 0, 0, ATRASO_APOS_MEIA_NOITE_MS);
    return proxima;
}

/**
 * Executa a regra de fechamento também quando o sistema é aberto depois da
 * meia-noite. A operação é idempotente: só altera reservas ainda aguardando.
 */
export async function atualizarNoShowsAutomaticamente() {
    try {
        const { data: sessao } = await db.getClient().auth.getSession();
        if (!sessao?.session) return 0;

        const quantidade = await db.marcarNoShowsAnteriores(dataLocalHoje());
        if (quantidade > 0) {
            console.info(`✅ ${quantidade} reserva(s) marcada(s) como no-show após a virada do dia.`);
        }
        return quantidade;
    } catch (error) {
        console.error('❌ Não foi possível atualizar no-shows automaticamente:', error);
        return 0;
    }
}

function agendarProximaVirada() {
    if (timerVirada) clearTimeout(timerVirada);
    timerVirada = setTimeout(async () => {
        await atualizarNoShowsAutomaticamente();
        agendarProximaVirada();
    }, Math.max(1000, proximaVirada().getTime() - Date.now()));
}

export function iniciarFechamentoAutomaticoNoShows() {
    atualizarNoShowsAutomaticamente();
    agendarProximaVirada();
}
