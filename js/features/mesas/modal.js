/* =========================================================================================
   OSTERIA DI LUCCA - MESAS/MODAL.JS v1.4
   ✅ v1.1: Padroniza error handling — usa notificacao.js
   ✅ v1.2: Delega operações Firestore para service.js — elimina db.getFirestore() direto
            confirmarMesa   → atribuirMesa()
            iniciarAtendimento → iniciarAtendimento()
            cancelarMesa    → cancelarMesa()
            liberarMesa     → finalizarAtendimento()
   ✅ v1.3: stopPropagation no overlay — impede bubble para o grid ao fechar modal (chat 22)
   ✅ v1.4: stopPropagation movido para ANTES do guard e.target === this.modal (Regra 7) (chat 22)
            Antes: clique em qualquer área do modal não fazia stopPropagation, só no overlay.
            Agora: todo clique dentro do modal para o bubble — independente do alvo.
   ========================================================================================= */

import { getTodasReservas, getDataAtual, getConfig } from '../../core/state.js';
import {
    atribuirMesa,
    iniciarAtendimento,
    finalizarAtendimento,
    cancelarMesa,
} from '../reservas/service.js';
import { notificarErro } from '../../core/notificacao.js';

export class MesaModal {
    constructor() {
        this.modal = document.getElementById('modalMesa');
        this.intervaloTimer = null;
        
        this.elementos = {
            titulo: this.modal?.querySelector('h3'),
            mesaReservaId: document.getElementById('mesaReservaId'),
            containerListaMesas: document.getElementById('containerListaMesas'),
            btnLiberar: document.getElementById('btnLiberarMesa'),
            btnIniciar: document.getElementById('btnIniciarAtendimento'),
            btnTrocar: document.getElementById('btnTrocarMesa'),
            btnCancelar: document.getElementById('btnCancelarMesa')
        };

        this._bindEventos();
    }

    _bindEventos() {
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                // ✅ v1.4: stopPropagation em TODO clique dentro do modal —
                // não só no overlay. Garante que nenhum clique (em botões, inputs,
                // ou no fundo) faça bubble para o gridReservas em init.js.
                e.stopPropagation();
                if (e.target === this.modal) this.fechar();
            });
        }
    }

    gerarBotoesMesas() {
        if (!this.elementos.containerListaMesas) return;
        this.elementos.containerListaMesas.innerHTML = "";
        const config = getConfig();
        const totalMesas = config.totalMesas || config.mesas || 18;
        for (let i = 1; i <= totalMesas; i++) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn-mesa";
            btn.innerText = i;
            btn.onclick = () => this.confirmarMesa(i);
            this.elementos.containerListaMesas.appendChild(btn);
        }
    }

    _aplicarBloqueioMesas(mesaAtualReserva = null) {
        if (!this.elementos.containerListaMesas) return;
        const dataAtual = getDataAtual();
        const reservas = getTodasReservas();
        const mesasOcupadas = reservas
            .filter(r => r.mesa && !r.fimMesa && r.data === dataAtual && r.mesa !== "ROOM")
            .map(r => r.mesa);
        
        this.elementos.containerListaMesas.querySelectorAll('.btn-mesa').forEach(btn => {
            const numeroMesa = btn.innerText;
            if (mesasOcupadas.includes(numeroMesa) && numeroMesa !== mesaAtualReserva) {
                btn.disabled = true;
                btn.style.opacity = '0.3';
                btn.style.cursor = 'not-allowed';
                btn.style.background = '#95a5a6';
            } else {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.style.background = "var(--primaria)";
            }
        });
    }

    async abrir(id) {
        if (this.intervaloTimer) {
            clearInterval(this.intervaloTimer);
            this.intervaloTimer = null;
        }
        
        if (this.elementos.mesaReservaId) this.elementos.mesaReservaId.value = id;
        
        const reservas = getTodasReservas();
        const reserva = reservas.find(r => r.id === id);
        
        this._esconderTodosBotoes();
        
        if (reserva && reserva.mesa && reserva.mesa !== "" && reserva.mesa !== "-") {
            this.elementos.containerListaMesas.style.display = "none";
            if (reserva.fimMesa) {
                this._configurarMesaFinalizada(reserva);
            } else if (reserva.inicioMesa) {
                this._configurarMesaEmCurso(reserva);
            } else {
                this._configurarMesaAguardando(reserva);
            }
        } else {
            this._configurarSemMesa(reserva);
        }
        
        if (this.modal) this.modal.style.display = "flex";
    }

    _configurarMesaFinalizada(reserva) {
        const inicio = new Date(reserva.inicioMesa);
        const fim = new Date(reserva.fimMesa);
        const totalSegundos = Math.floor((fim - inicio) / 1000);
        const h = Math.floor(totalSegundos / 3600).toString().padStart(2, '0');
        const m = Math.floor((totalSegundos % 3600) / 60).toString().padStart(2, '0');
        const s = (totalSegundos % 60).toString().padStart(2, '0');
        if (this.elementos.titulo) {
            this.elementos.titulo.innerHTML = `MESA ${reserva.mesa} (FINALIZADA)<br><span style="color:#7f8c8d; font-size:1.5rem">${h}:${m}:${s}</span>`;
        }
    }

    _configurarMesaEmCurso(reserva) {
        this.elementos.btnLiberar?.classList.remove("hidden");
        const atualizar = () => {
            const totalSegundos = Math.floor((new Date() - new Date(reserva.inicioMesa)) / 1000);
            const h = Math.floor(totalSegundos / 3600).toString().padStart(2, '0');
            const m = Math.floor((totalSegundos % 3600) / 60).toString().padStart(2, '0');
            const s = (totalSegundos % 60).toString().padStart(2, '0');
            if (this.elementos.titulo) {
                this.elementos.titulo.innerHTML = `MESA ${reserva.mesa} (EM CURSO)<br><span style="color:var(--vermelho); font-size:1.5rem">${h}:${m}:${s}</span>`;
            }
        };
        atualizar();
        this.intervaloTimer = setInterval(atualizar, 1000);
    }

    _configurarMesaAguardando(reserva) {
        if (this.elementos.titulo) this.elementos.titulo.innerText = `MESA ${reserva.mesa} (AGUARDANDO)`;
        this.elementos.btnIniciar?.classList.remove("hidden");
        // ✅ Room Service: sem trocar/cancelar mesa
        if (reserva.mesa !== "ROOM") {
            this.elementos.btnTrocar?.classList.remove("hidden");
            this.elementos.btnCancelar?.classList.remove("hidden");
        }
    }

    _configurarSemMesa(reserva) {
        this.elementos.containerListaMesas.style.display = "grid";
        if (this.elementos.titulo) this.elementos.titulo.innerText = "SELECIONAR MESA";
        this.gerarBotoesMesas();
        this._aplicarBloqueioMesas(reserva?.mesa);
    }

    _esconderTodosBotoes() {
        this.elementos.btnLiberar?.classList.add("hidden");
        this.elementos.btnIniciar?.classList.add("hidden");
        this.elementos.btnTrocar?.classList.add("hidden");
        this.elementos.btnCancelar?.classList.add("hidden");
    }

    // ✅ v1.2: usa atribuirMesa() de service.js — sem Firestore direto
    async confirmarMesa(numMesa) {
        const id = this.elementos.mesaReservaId?.value;
        if (!id) return;
        try {
            await atribuirMesa(id, numMesa.toString());
            this.fechar();
        } catch (e) {
            console.error("Erro ao atribuir mesa:", e);
            notificarErro("Erro ao atribuir mesa.");
        }
    }

    // ✅ v1.2: usa iniciarAtendimento() de service.js — sem Firestore direto
    async iniciarAtendimento() {
        const id = this.elementos.mesaReservaId?.value;
        if (!id) return;
        try {
            await iniciarAtendimento(id);
            this.fechar();
        } catch (e) {
            console.error("Erro ao iniciar atendimento:", e);
            notificarErro("Erro ao iniciar atendimento.");
        }
    }

    trocarMesa() {
        const id = this.elementos.mesaReservaId?.value;
        const reservas = getTodasReservas();
        const reserva = reservas.find(r => r.id === id);
        this.elementos.containerListaMesas.style.display = "grid";
        if (this.elementos.titulo) this.elementos.titulo.innerText = "SELECIONAR NOVA MESA";
        this._esconderTodosBotoes();
        this.gerarBotoesMesas();
        this._aplicarBloqueioMesas(reserva?.mesa);
    }

    // ✅ v1.2: usa cancelarMesa() de service.js — sem Firestore direto
    async cancelarMesa() {
        const id = this.elementos.mesaReservaId?.value;
        if (!id) return;
        try {
            await cancelarMesa(id);
            this.fechar();
        } catch (e) {
            console.error("Erro ao cancelar mesa:", e);
            notificarErro("Erro ao cancelar mesa.");
        }
    }

    // ✅ v1.2: usa finalizarAtendimento() de service.js — sem Firestore direto
    async liberarMesa() {
        const id = this.elementos.mesaReservaId?.value;
        if (!id) return;
        try {
            await finalizarAtendimento(id);
            this.fechar();
        } catch (e) {
            console.error("Erro ao finalizar mesa:", e);
            notificarErro("Erro ao finalizar mesa.");
        }
    }

    fechar() {
        if (this.intervaloTimer) {
            clearInterval(this.intervaloTimer);
            this.intervaloTimer = null;
        }
        if (this.modal) this.modal.style.display = "none";
    }
}
