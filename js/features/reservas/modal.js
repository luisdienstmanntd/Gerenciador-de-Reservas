/* =========================================================================================
   OSTERIA DI LUCCA - RESERVAS/MODAL.JS v3.12
   RESPONSABILIDADE: Gerenciamento Completo do Modal de Reservas
   ✅ v2.2: Ao clicar em reserva existente, exibe resumo com 3 botões
   ✅ v2.3: Ao clicar em linha disponível, exibe seletor de ação
            Botão EXCLUIR removido do formulário de edição
   ✅ v2.4: Controle do modal-header-controls por fluxo individual
            Corrige checkboxes visíveis na tela de resumo
            Corrige botão ALTERAR HORA ausente ao editar reserva
   ✅ v2.5: Botão ALTERAR HORÁRIO no resumo de reserva existente (ordem: editar, alterar horário, cancelar, fechar)
   ✅ v2.6: { once: true } em todos os addEventListener dos botões dinâmicos do #resumoReserva
            Corrige acúmulo de listeners após múltiplas aberturas (duplo disparo em CANCELAR RESERVA)
   ✅ v2.7: _abrirFormularioNovo oculta barra inteira; BLOQUEAR restaura só containerBloqueio
   ✅ v2.8: _abrirFormularioCompleto oculta headerControls e --:-- sempre — editar = só título + dados + botões
   ✅ v2.9: _limparFormulario restaura labelObs e obs — corrige campo obs invisível ao editar após ALTERAR HORÁRIO
   ✅ v3.0: Botão ALTERAR DATA no seletor de reserva existente — input date + salva via alterarData()
   ✅ v3.1: _limparFormulario reseta btnSalvar.innerText para "SALVAR" — corrige botão SALVAR exibindo
            "DESBLOQUEAR" ao abrir ALTERAR HORÁRIO de reserva normal após ter aberto um bloqueio na
            mesma sessão. Causa: _abrirFormularioCompleto não definia innerText para reservas normais,
            herdando o texto do fluxo anterior.
   ✅ v3.2: btnResumoCancelar substitui confirm() nativo por window.modalConfirmar() — elimina última
            violação da regra 5 (nunca usar alert/confirm). Requer window.modalConfirmar exposto
            em init.js v2.0 via exponerFuncoesGlobais().
   ✅ v3.3: validar() delega para validarReserva() de validators.js — elimina Bug #9 (dead code)
            _formatarTelefone() delega para formatarTelefone() de validators.js
   ✅ v3.4: fechar() chama limparHighlightCampos() — remove bordas amarelas ao fechar modal
   ✅ v3.5: stopPropagation no clique do overlay — impede bubble para o grid ao fechar modal
   ✅ v3.6: abrirEditar() — reserva em atendimento (inicioMesa sem fimMesa) exibe apenas
            EDITAR RESERVA + FECHAR (sem ALTERAR HORÁRIO, ALTERAR DATA, CANCELAR RESERVA)
   ✅ v3.9: _limparFormulario() oculta colMenuDeg após o forEach — corrige checkbox visível
            na abertura inicial (tipoCliente resetado para "hospede" antes de _toggleCampos).
   ✅ v3.10: Escapa reserva.nomes na mensagem de confirmação de CANCELAR RESERVA — corrige XSS armazenado
   ✅ v3.11: _limparFormulario() centraliza reset de isBloqueioExistente/obsOriginalBloqueio/
             bloqueadoOriginal/hospedesOriginal — remove fragilidade de estado da instância (Manutenção #5)
   ========================================================================================= */

import { getTodasReservas, getDataAtual } from "../../core/state.js";
import {
  salvarReserva,
  cancelarReserva,
  _calcularDepositoRetido,
  desbloquearReserva,
  salvarApenasHorario,
  alterarData,
} from "./service.js";
import { validarReserva, formatarTelefone, limparHighlightCampos, escapeHtml } from "./validators.js";

export class ReservaModal {
  constructor() {
    this.modal = document.getElementById("modalReserva");
    this.modoEdicao = false;

    this.elementos = {
      reservaId: document.getElementById("reservaId"),
      horario: document.getElementById("horario"),
      originalBase: document.getElementById("originalBase"),
      posicaoReserva: document.getElementById("posicaoReserva"),
      tipoCliente: document.getElementById("tipoCliente"),
      nomes: document.getElementById("nomes"),
      apto: document.getElementById("apto"),
      codigoReserva: document.getElementById("codigoReserva"),
      whatsapp: document.getElementById("whatsapp"),
      avulsa: document.getElementById("avulsa"),
      paxs: document.getElementById("paxs"),
      chd: document.getElementById("chd"),
      obs: document.getElementById("obs"),
      checkBloquear: document.getElementById("checkBloquear"),
      checkHospedes: document.getElementById("checkHospedes"),
      checkAlterarHorario: document.getElementById("checkAlterarHorario"),
      checkMenuDegustacao: document.getElementById("checkMenuDegustacao"),
      containerApto: document.getElementById("containerApto"),
      containerExterno: document.getElementById("containerExterno"),
      containerNovoHorario: document.getElementById("containerNovoHorario"),
      camposReserva: document.getElementById("camposReserva"),
      btnSalvar: document.getElementById("btnSalvar"),
      btnExcluir: document.getElementById("btnExcluir"),
      displayHoras: document.getElementById("displayHoras"),
      displayMinutos: document.getElementById("displayMinutos"),
    };

    this._bindEventos();
  }

  // =========================================================================
  // EVENTOS — registrados UMA vez no constructor. Não acumulam.
  // =========================================================================

  _bindEventos() {
    if (this.modal) {
      this.modal.addEventListener("click", (e) => {
        if (e.target === this.modal) {
          e.stopPropagation();
          this.fechar();
        }
      });
    }

    if (this.elementos.tipoCliente) {
      this.elementos.tipoCliente.addEventListener("change", () => {
        this._toggleCampos();
      });
    }

    if (this.elementos.checkBloquear) {
      this.elementos.checkBloquear.addEventListener("change", () => {
        this._toggleCampos();
        this._verificarMudancaBloqueio();
        this._atualizarTituloModal();
      });
    }

    if (this.elementos.checkHospedes) {
      this.elementos.checkHospedes.addEventListener("change", () => {
        this._toggleCampos();
        this._verificarMudancaBloqueio();
        this._atualizarTituloModal();
      });
    }

    if (this.elementos.obs) {
      this.elementos.obs.addEventListener("input", () => {
        if (
          this.elementos.btnSalvar &&
          this.elementos.btnSalvar.innerText === "DESBLOQUEAR"
        ) {
          const obsOriginal = this.obsOriginalBloqueio || "";
          const obsAtual = this.elementos.obs.value.trim();
          if (obsAtual !== obsOriginal) {
            this.elementos.btnSalvar.innerText = "SALVAR";
          } else {
            this.elementos.btnSalvar.innerText = "DESBLOQUEAR";
          }
        }
      });
    }

    if (this.elementos.whatsapp) {
      this.elementos.whatsapp.addEventListener("input", (e) => {
        e.target.value = this._formatarTelefone(e.target.value);
      });
    }

    if (this.elementos.avulsa) {
      this.elementos.avulsa.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/\D/g, "");
      });
    }
  }

  // =========================================================================
  // ENTRADA PÚBLICA — LINHA DISPONÍVEL
  // =========================================================================

  /**
   * Clicou em linha disponível → exibe seletor de ação
   */
  abrirNova(horario, posicao, hrBase) {
    console.log(`📋 Abrindo seletor de ação: ${horario} pos ${posicao}`);

    this._limparFormulario();
    this._fecharResumo();

    const titulo = this.modal?.querySelector("h3");
    if (titulo) titulo.innerText = horario;

    this._ocultarConteudoModal();

    const resumo = document.createElement("div");
    resumo.id = "resumoReserva";
    resumo.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;padding:10px 0;">
        <button type="button" id="btnAcaoNova"     style="padding:14px;background:#27ae60;color:#fff;border:none;border-radius:8px;font-weight:900;font-size:1rem;cursor:pointer;letter-spacing:1px;">NOVA RESERVA</button>
        <button type="button" id="btnAcaoBloquear" style="padding:14px;background:#e74c3c;color:#fff;border:none;border-radius:8px;font-weight:900;font-size:1rem;cursor:pointer;letter-spacing:1px;">BLOQUEAR</button>
        <button type="button" id="btnAcaoHorario"  style="padding:14px;background:#f39c12;color:#fff;border:none;border-radius:8px;font-weight:900;font-size:1rem;cursor:pointer;letter-spacing:1px;">ALTERAR HORÁRIO</button>
        <button type="button" id="btnAcaoFechar"   style="padding:14px;background:transparent;color:var(--texto-principal);border:2px solid var(--borda,#555);border-radius:8px;font-weight:700;font-size:1rem;cursor:pointer;letter-spacing:1px;">FECHAR</button>
      </div>
    `;
    if (titulo) titulo.after(resumo);

    // ✅ v2.6: { once: true } — listener se auto-remove após o primeiro clique.
    // O elemento #resumoReserva é recriado a cada abertura, mas sem { once: true }
    // os handlers do ciclo anterior persistiam na memória causando duplo disparo.

    document.getElementById("btnAcaoNova")?.addEventListener("click", () => {
      this._fecharResumo();
      this._abrirFormularioNovo(horario, posicao, hrBase);
    }, { once: true });

    document.getElementById("btnAcaoBloquear")?.addEventListener("click", () => {
      this._fecharResumo();
      this._abrirFormularioNovo(horario, posicao, hrBase);
      // ✅ BLOQUEAR: restaura barra e mostra só BLOQUEAR/SÓ HOSP. (sem ALTERAR HORA)
      const headerControls = document.getElementById("modal-header-controls");
      if (headerControls) headerControls.style.display = "";
      const containerBloqueio = document.getElementById("containerBloqueio");
      if (containerBloqueio) containerBloqueio.style.display = "";
      const wrapperAltHora = document.getElementById("wrapperAlterarHorario");
      if (wrapperAltHora) wrapperAltHora.style.display = "none";
      if (this.elementos.checkBloquear) {
        this.elementos.checkBloquear.checked = true;
        this.elementos.checkBloquear.dispatchEvent(new Event("change"));
      }
    }, { once: true });

    document.getElementById("btnAcaoHorario")?.addEventListener("click", () => {
      this._fecharResumo();
      this._abrirFormularioNovo(horario, posicao, hrBase);
      if (this.elementos.checkAlterarHorario) {
        this.elementos.checkAlterarHorario.checked = true;
        this.elementos.checkAlterarHorario.dispatchEvent(new Event("change"));
      }
      // ✅ Corrige título
      const titulo = this.modal?.querySelector("h3");
      if (titulo) titulo.innerText = `ALTERAR HORÁRIO - ${horario}`;
      // ✅ Oculta barra de checkboxes
      const headerControls = document.getElementById("modal-header-controls");
      if (headerControls) headerControls.style.display = "none";
      // ✅ Inicializa relógio com a hora real do slot (após _abrirFormularioNovo que chama _limparFormulario)
      if (this.elementos.displayHoras) this.elementos.displayHoras.innerText = horario.split(':')[0];
      if (this.elementos.displayMinutos) this.elementos.displayMinutos.innerText = horario.split(':')[1];
      // ✅ Oculta campos do formulário — só relógio, SALVAR e FECHAR devem aparecer
      if (this.elementos.camposReserva) this.elementos.camposReserva.style.display = "none";
      if (this.elementos.containerApto) this.elementos.containerApto.style.display = "none";
      if (this.elementos.containerExterno) this.elementos.containerExterno.style.display = "none";
      const labelObs = document.getElementById("labelObs");
      const obsEl = document.getElementById("obs");
      if (labelObs) labelObs.style.display = "none";
      if (obsEl) obsEl.style.display = "none";
    }, { once: true });

    document.getElementById("btnAcaoFechar")?.addEventListener("click", () => {
      this.fechar();
    }, { once: true });

    this._mostrarModal();
  }

  // =========================================================================
  // ENTRADA PÚBLICA — RESERVA EXISTENTE
  // =========================================================================

  /**
   * Clicou em reserva existente → exibe resumo (horário + nome + 3 botões)
   * Bloqueios abrem direto no formulário completo.
   */
  abrirEditar(id) {
    console.log(`✏️ Abrindo resumo reserva: ${id}`);

    const reservas = getTodasReservas();
    const reserva = reservas.find((r) => r.id === id);

    if (!reserva) {
      console.error("❌ Reserva não encontrada:", id);
      return;
    }

    if (reserva.bloqueado || reserva.somenteHospedes) {
      this._abrirFormularioCompleto(id);
      return;
    }

    this._limparFormulario();
    this._fecharResumo();

    const titulo = this.modal?.querySelector("h3");
    if (titulo) titulo.innerText = `${reserva.horario} — ${reserva.nomes || ""}`;

    this._ocultarConteudoModal();

    // ✅ Mesa finalizada: apenas mensagem + fechar
    if (reserva.fimMesa) {
      const resumo = document.createElement("div");
      resumo.id = "resumoReserva";
      resumo.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;padding:10px 0;">
          <div style="text-align:center;padding:16px;background:rgba(127,140,141,0.15);border-radius:8px;font-weight:700;font-size:1rem;opacity:0.8;">✅ MESA FINALIZADA</div>
          <button type="button" id="btnResumoFechar" style="padding:14px;background:transparent;color:var(--texto-principal);border:2px solid var(--borda,#555);border-radius:8px;font-weight:700;font-size:1rem;cursor:pointer;letter-spacing:1px;">FECHAR</button>
        </div>
      `;
      if (titulo) titulo.after(resumo);
      // ✅ v2.6: { once: true }
      document.getElementById("btnResumoFechar")?.addEventListener("click", () => this.fechar(), { once: true });
      this._mostrarModal();
      return;
    }

    // ✅ v3.6: Reserva em atendimento ativo — bloqueia ações destrutivas/temporais.
    // Alterar horário/data ou cancelar uma reserva com mesa em curso causaria
    // inconsistência (timer ativo + doc modificado/removido). Só EDITAR e FECHAR.
    if (reserva.inicioMesa && !reserva.fimMesa) {
      const resumo = document.createElement("div");
      resumo.id = "resumoReserva";
      resumo.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;padding:10px 0;">
          <div style="text-align:center;padding:10px 14px;background:rgba(231,76,60,0.12);border-radius:8px;font-size:0.82rem;font-weight:700;color:#e74c3c;letter-spacing:0.5px;">⏱️ MESA EM ATENDIMENTO</div>
          <button type="button" id="btnResumoEditar" style="padding:14px;background:#f39c12;color:#fff;border:none;border-radius:8px;font-weight:900;font-size:1rem;cursor:pointer;letter-spacing:1px;">EDITAR RESERVA</button>
          <button type="button" id="btnResumoFechar" style="padding:14px;background:transparent;color:var(--texto-principal);border:2px solid var(--borda,#555);border-radius:8px;font-weight:700;font-size:1rem;cursor:pointer;letter-spacing:1px;">FECHAR</button>
        </div>
      `;
      if (titulo) titulo.after(resumo);
      document.getElementById("btnResumoEditar")?.addEventListener("click", () => {
        this._fecharResumo();
        this._abrirFormularioCompleto(id);
      }, { once: true });
      document.getElementById("btnResumoFechar")?.addEventListener("click", () => this.fechar(), { once: true });
      this._mostrarModal();
      return;
    }

    const resumo = document.createElement("div");
    resumo.id = "resumoReserva";
    resumo.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;padding:10px 0;">
        <button type="button" id="btnResumoEditar"    style="padding:14px;background:#f39c12;color:#fff;border:none;border-radius:8px;font-weight:900;font-size:1rem;cursor:pointer;letter-spacing:1px;">EDITAR RESERVA</button>
        <button type="button" id="btnResumoHorario"   style="padding:14px;background:#3498db;color:#fff;border:none;border-radius:8px;font-weight:900;font-size:1rem;cursor:pointer;letter-spacing:1px;">ALTERAR HORÁRIO</button>
        <button type="button" id="btnResumoData"      style="padding:14px;background:#8e44ad;color:#fff;border:none;border-radius:8px;font-weight:900;font-size:1rem;cursor:pointer;letter-spacing:1px;">ALTERAR DATA</button>
        <button type="button" id="btnResumoCancelar"  style="padding:14px;background:#e74c3c;color:#fff;border:none;border-radius:8px;font-weight:900;font-size:1rem;cursor:pointer;letter-spacing:1px;">CANCELAR RESERVA</button>
        <button type="button" id="btnResumoFechar"    style="padding:14px;background:transparent;color:var(--texto-principal);border:2px solid var(--borda,#555);border-radius:8px;font-weight:700;font-size:1rem;cursor:pointer;letter-spacing:1px;">FECHAR</button>
      </div>
    `;
    if (titulo) titulo.after(resumo);

    // ✅ v2.6: { once: true } em todos os botões do resumo

    document.getElementById("btnResumoEditar")?.addEventListener("click", () => {
      this._fecharResumo();
      this._abrirFormularioCompleto(id);
    }, { once: true });

    document.getElementById("btnResumoHorario")?.addEventListener("click", () => {
      this._fecharResumo();
      // Abre formulário completo com checkAlterarHorario já marcado
      this._abrirFormularioCompleto(id);
      if (this.elementos.checkAlterarHorario) {
        this.elementos.checkAlterarHorario.checked = true;
        this.elementos.checkAlterarHorario.dispatchEvent(new Event("change"));
      }
      // Inicializa relógio com o horário atual da reserva
      if (this.elementos.displayHoras)   this.elementos.displayHoras.innerText   = reserva.horario.split(':')[0];
      if (this.elementos.displayMinutos) this.elementos.displayMinutos.innerText = reserva.horario.split(':')[1];
      // Atualiza título
      const t = this.modal?.querySelector("h3");
      if (t) t.innerText = `ALTERAR HORÁRIO - ${reserva.horario}`;
      // Oculta barra de checkboxes e campos — só relógio, SALVAR e FECHAR
      const headerControls = document.getElementById("modal-header-controls");
      if (headerControls) headerControls.style.display = "none";
      if (this.elementos.camposReserva)    this.elementos.camposReserva.style.display    = "none";
      if (this.elementos.containerApto)    this.elementos.containerApto.style.display    = "none";
      if (this.elementos.containerExterno) this.elementos.containerExterno.style.display = "none";
      const labelObs = document.getElementById("labelObs");
      const obsEl    = document.getElementById("obs");
      if (labelObs) labelObs.style.display = "none";
      if (obsEl)    obsEl.style.display    = "none";
    }, { once: true });

    document.getElementById("btnResumoData")?.addEventListener("click", () => {
      this._fecharResumo();
      this._abrirFormularioAlterarData(id, reserva);
    }, { once: true });

    document.getElementById("btnResumoCancelar")?.addEventListener("click", () => {
      // ✅ v3.2: window.modalConfirmar substitui confirm() nativo — regra 5 (nunca usar confirm)
      // window.modalConfirmar é exposto por init.js v2.0 via exponerFuncoesGlobais()
      // ✅ Cancelamento é soft-delete (mantém histórico pra análise) — não usa mais
      // excluirReserva(). Externo com <48h de antecedência perde o adiantamento de R$200,
      // avisado já na confirmação pra recepção comunicar o cliente.
      let mensagem = `Cancelar reserva de ${escapeHtml(reserva.nomes)}?`;
      const depositoRetido = _calcularDepositoRetido(reserva);
      if (depositoRetido === true) {
        mensagem += " ⚠️ Menos de 48h de antecedência — o cliente perde o adiantamento de R$200.";
      } else if (depositoRetido === false) {
        mensagem += " ✅ Dentro do prazo de 48h — o adiantamento será devolvido.";
      }

      window.modalConfirmar(mensagem, async () => {
        await cancelarReserva(id);
        this.fechar();
      });
    }, { once: true });

    document.getElementById("btnResumoFechar")?.addEventListener("click", () => {
      this.fechar();
    }, { once: true });

    this._mostrarModal();
  }

  // =========================================================================
  // FORMULÁRIOS COMPLETOS (PRIVADOS)
  // =========================================================================

  _abrirFormularioNovo(horario, posicao, hrBase) {
    console.log(`📝 Abrindo formulário NOVA reserva: ${horario} pos ${posicao}`);

    this.modoEdicao = false;
    this._limparFormulario();
    this.isBloqueioExistente = false;

    if (this.elementos.reservaId) this.elementos.reservaId.value = "";
    if (this.elementos.horario) this.elementos.horario.value = horario;
    if (this.elementos.originalBase) this.elementos.originalBase.value = hrBase;
    if (this.elementos.posicaoReserva) this.elementos.posicaoReserva.value = posicao;

    const titulo = this.modal?.querySelector("h3");
    if (titulo) titulo.innerText = `NOVA RESERVA - ${horario}`;

    if (this.elementos.btnExcluir) this.elementos.btnExcluir.classList.add("hidden");
    if (this.elementos.btnSalvar) this.elementos.btnSalvar.innerText = "SALVAR";

    this._toggleCampos();

    // ✅ Oculta --:-- mas mostra os checkboxes (ALTERAR HORA, BLOQUEAR, SÓ HOSP.)
    const textoHorarioContainer = document.getElementById("textoHorarioContainer");
    if (textoHorarioContainer) textoHorarioContainer.style.display = "none";

    // ✅ v2.7: Nova reserva — oculta barra inteira (fundo + checkboxes)
    // Barra restaurada em _abrirFormularioCompleto quando necessário
    const headerControls = document.getElementById("modal-header-controls");
    if (headerControls) headerControls.style.display = "none";

    this._mostrarModal();
  }

  _abrirFormularioCompleto(id) {
    console.log(`📋 Abrindo formulário completo: ${id}`);

    const reservas = getTodasReservas();
    const reserva = reservas.find((r) => r.id === id);

    if (!reserva) {
      console.error("❌ Reserva não encontrada:", id);
      return;
    }

    this.modoEdicao = true;
    this._limparFormulario();
    this._preencherFormulario(reserva);

    const titulo = this.modal?.querySelector("h3");
    if (titulo) {
      titulo.innerText = reserva.bloqueado || reserva.somenteHospedes
        ? `BLOQUEIO - ${reserva.horario}`
        : `EDITAR - ${reserva.nomes || reserva.horario}`;
    }

    // ✅ Botão EXCLUIR nunca aparece no formulário de edição
    if (this.elementos.btnExcluir) {
      this.elementos.btnExcluir.classList.add("hidden");
    }

    if (reserva.fimMesa) {
      this._modoApenasObs();
    }

    if (reserva.bloqueado || reserva.somenteHospedes) {
      if (this.elementos.btnSalvar) this.elementos.btnSalvar.innerText = "DESBLOQUEAR";
      if (this.elementos.checkAlterarHorario) {
        const labelAlterarHora = document.querySelector('label[for="checkAlterarHorario"]');
        this.elementos.checkAlterarHorario.style.display = "none";
        if (labelAlterarHora) labelAlterarHora.style.display = "none";
      }
      this.isBloqueioExistente = true;
      this.obsOriginalBloqueio = reserva.obs || "";
      this.bloqueadoOriginal = reserva.bloqueado || false;
      this.hospedesOriginal = reserva.somenteHospedes || false;
    } else {
      this.isBloqueioExistente = false;
    }

    this._toggleCampos();

    // ✅ v2.8: Editar reserva — sem checkboxes, sem --:--
    const headerControls = document.getElementById("modal-header-controls");
    if (headerControls) headerControls.style.display = "none";

    const textoHorarioContainer = document.getElementById("textoHorarioContainer");
    if (textoHorarioContainer) textoHorarioContainer.style.display = "none";

    this._mostrarModal();
  }

  // =========================================================================
  // HELPERS DE VISIBILIDADE
  // =========================================================================

  _ocultarConteudoModal() {
    const textoHorarioContainer = document.getElementById("textoHorarioContainer");
    if (textoHorarioContainer) textoHorarioContainer.style.display = "none";

    // ✅ Oculta header-controls ao mostrar tela de resumo (seletor de ação)
    const headerControls = document.getElementById("modal-header-controls");
    if (headerControls) headerControls.style.display = "none";

    const formReserva = document.getElementById("formReserva");
    if (formReserva) formReserva.style.display = "none";

    const modalActions = this.modal?.querySelector(".modal-actions");
    if (modalActions) modalActions.style.display = "none";
  }

  _fecharResumo() {
    const resumo = this.modal?.querySelector("#resumoReserva");
    if (resumo) resumo.remove();

    const textoHorarioContainer = document.getElementById("textoHorarioContainer");
    if (textoHorarioContainer) textoHorarioContainer.style.display = "";

    // ✅ NÃO restaura modal-header-controls aqui — cada fluxo controla individualmente
    // (_abrirFormularioNovo e _abrirFormularioCompleto fazem isso)

    const formReserva = document.getElementById("formReserva");
    if (formReserva) formReserva.style.display = "";

    const modalActions = this.modal?.querySelector(".modal-actions");
    if (modalActions) modalActions.style.display = "";
  }

  // =========================================================================
  // FORMULÁRIO
  // =========================================================================

  _preencherFormulario(reserva) {
    if (this.elementos.reservaId) this.elementos.reservaId.value = reserva.id || "";
    if (this.elementos.horario) this.elementos.horario.value = reserva.horario || "";
    if (this.elementos.originalBase)
      this.elementos.originalBase.value = reserva.originalBase || reserva.horario || "";
    if (this.elementos.posicaoReserva) this.elementos.posicaoReserva.value = reserva.posicao || 0;
    if (this.elementos.tipoCliente) this.elementos.tipoCliente.value = reserva.tipo || "hospede";
    if (this.elementos.nomes) this.elementos.nomes.value = reserva.nomes || "";
    if (this.elementos.apto) this.elementos.apto.value = reserva.apto || "";
    if (this.elementos.codigoReserva) this.elementos.codigoReserva.value = reserva.codigoReserva || "";
    if (this.elementos.whatsapp) this.elementos.whatsapp.value = reserva.whatsapp || "";
    if (this.elementos.avulsa) this.elementos.avulsa.value = reserva.avulsa || "";
    if (this.elementos.paxs) this.elementos.paxs.value = reserva.paxs || 0;
    if (this.elementos.chd) this.elementos.chd.value = reserva.chd || 0;
    if (this.elementos.obs) this.elementos.obs.value = reserva.obs || "";
    if (this.elementos.checkBloquear) {
      this.elementos.checkBloquear.checked = reserva.bloqueado || false;
      this.elementos.checkBloquear.setAttribute('data-era-bloqueio', String(reserva.bloqueado || false));
    }
    if (this.elementos.checkHospedes) {
      this.elementos.checkHospedes.checked = reserva.somenteHospedes || false;
      this.elementos.checkHospedes.setAttribute('data-era-hospedes', String(reserva.somenteHospedes || false));
    }
    if (this.elementos.checkMenuDegustacao) {
      this.elementos.checkMenuDegustacao.checked = reserva.menuDegustacao || false;
    }
  }

  _limparFormulario() {
    // ✅ Centraliza reset do estado de instância relacionado a bloqueios (Manutenção #5).
    // _abrirFormularioCompleto() sobrescreve estes valores logo em seguida quando aplicável —
    // este reset é uma rede de segurança para qualquer fluxo futuro que chame _limparFormulario()
    // sem depois definir esses campos explicitamente.
    this.isBloqueioExistente = false;
    this.obsOriginalBloqueio = "";
    this.bloqueadoOriginal = false;
    this.hospedesOriginal = false;

    if (this.elementos.reservaId) this.elementos.reservaId.value = "";
    if (this.elementos.horario) this.elementos.horario.value = "";
    if (this.elementos.originalBase) this.elementos.originalBase.value = "";
    if (this.elementos.posicaoReserva) this.elementos.posicaoReserva.value = "";
    if (this.elementos.tipoCliente) this.elementos.tipoCliente.value = "hospede";
    if (this.elementos.nomes) this.elementos.nomes.value = "";
    if (this.elementos.apto) this.elementos.apto.value = "";
    if (this.elementos.codigoReserva) this.elementos.codigoReserva.value = "";
    if (this.elementos.whatsapp) this.elementos.whatsapp.value = "";
    if (this.elementos.avulsa) this.elementos.avulsa.value = "";
    if (this.elementos.paxs) this.elementos.paxs.value = "2";
    if (this.elementos.chd) this.elementos.chd.value = "0";
    if (this.elementos.obs) this.elementos.obs.value = "";
    if (this.elementos.checkBloquear) this.elementos.checkBloquear.checked = false;
    if (this.elementos.checkHospedes) this.elementos.checkHospedes.checked = false;
    if (this.elementos.checkAlterarHorario) this.elementos.checkAlterarHorario.checked = false;
    if (this.elementos.checkMenuDegustacao) this.elementos.checkMenuDegustacao.checked = false;
    // ✅ v2.9: Restaura obs e labelObs — podem ter sido ocultados pelo fluxo ALTERAR HORÁRIO.
    // Sem este reset, abrir ALTERAR HORÁRIO e depois EDITAR RESERVA deixava o campo obs invisível.
    const labelObs = document.getElementById("labelObs");
    const obsEl = document.getElementById("obs");
    if (labelObs) labelObs.style.display = "";
    if (obsEl) obsEl.style.display = "";
    const containerNovoHorario = document.getElementById('containerNovoHorario');
    if (containerNovoHorario) containerNovoHorario.classList.add('hidden');
    // ✅ v3.1: Reseta texto do btnSalvar para "SALVAR".
    // Sem este reset, abrir um bloqueio (que escreve "DESBLOQUEAR" no botão) e depois
    // abrir ALTERAR HORÁRIO de uma reserva normal deixava o botão com "DESBLOQUEAR".
    // _abrirFormularioCompleto só sobrescreve o texto para bloqueios existentes,
    // nunca para reservas normais — herdando o estado do fluxo anterior.
    if (this.elementos.btnSalvar) this.elementos.btnSalvar.innerText = "SALVAR";

    if (this.elementos.camposReserva) {
      this.elementos.camposReserva.style.display = "block";
      this.elementos.camposReserva.querySelectorAll("*").forEach((el) => {
        el.style.display = "";
      });
    }
  }

  _modoApenasObs() {
    if (this.elementos.camposReserva) {
      const campos = this.elementos.camposReserva.querySelectorAll("*:not(#labelObs):not(#obs)");
      campos.forEach((campo) => { campo.style.display = "none"; });
    }
    if (this.elementos.btnSalvar) this.elementos.btnSalvar.innerText = "ADICIONAR OBS";
  }

  // =========================================================================
  // BLOQUEIO
  // =========================================================================

  _verificarMudancaBloqueio() {
    if (!this.isBloqueioExistente || !this.elementos.btnSalvar) return;

    const bloqueadoAtual = this.elementos.checkBloquear?.checked || false;
    const hospedesAtual = this.elementos.checkHospedes?.checked || false;

    if (!bloqueadoAtual && !hospedesAtual) return;

    if (bloqueadoAtual !== (this.bloqueadoOriginal || false) ||
        hospedesAtual !== (this.hospedesOriginal || false)) {
      this.elementos.btnSalvar.innerText = "SALVAR";
    } else {
      const obsAtual = this.elementos.obs?.value.trim() || "";
      if (obsAtual === (this.obsOriginalBloqueio || "")) {
        this.elementos.btnSalvar.innerText = "DESBLOQUEAR";
      }
    }
  }

  _atualizarTituloModal() {
    const titulo = this.modal?.querySelector("h3");
    if (!titulo || this.isBloqueioExistente) return;

    const isBloqueado = this.elementos.checkBloquear?.checked;
    const isSomenteHospedes = this.elementos.checkHospedes?.checked;
    const horario = this.elementos.horario?.value;

    titulo.innerText = (isBloqueado || isSomenteHospedes)
      ? `BLOQUEIO - ${horario}`
      : `NOVA RESERVA - ${horario}`;
  }

  // =========================================================================
  // TOGGLE DE CAMPOS
  // =========================================================================

  _toggleCampos() {
    const tipo = this.elementos.tipoCliente?.value;
    const isBloqueado = this.elementos.checkBloquear?.checked;
    const isSomenteHospedes = this.elementos.checkHospedes?.checked;

    if (isBloqueado || isSomenteHospedes) {
      this._ocultarTodosCamposExcetoObs();
      return;
    }

    if (this.isBloqueioExistente) return;

    this._mostrarCamposBasicos();

    if (this.elementos.containerApto) {
      this.elementos.containerApto.style.display =
        tipo === "hospede" || tipo === "roomservice" ? "block" : "none";
    }

    if (this.elementos.containerExterno) {
      this.elementos.containerExterno.style.display =
        tipo === "externo" ? "block" : "none";
    }

    // ✅ v3.10: Controle via classe CSS no modal — invulnerável ao forEach de reset.
    // O forEach em _mostrarCamposBasicos/_limparFormulario reseta style.display de todos
    // os filhos, anulando qualquer display inline. A classe no elemento pai (#modalReserva)
    // não é afetada pelo forEach — é a única abordagem que sobrevive ao reset.
    if (this.modal) {
      this.modal.classList.toggle("tipo-roomservice", tipo === "roomservice");
    }

    if (this.elementos.containerNovoHorario) {
      this.elementos.containerNovoHorario.style.display = "block";
    }
  }

  _ocultarTodosCamposExcetoObs() {
    if (this.elementos.camposReserva) this.elementos.camposReserva.style.display = "none";
    if (this.elementos.containerApto) this.elementos.containerApto.style.display = "none";
    if (this.elementos.containerExterno) this.elementos.containerExterno.style.display = "none";
    if (this.elementos.containerNovoHorario) this.elementos.containerNovoHorario.style.display = "none";

    const textoHorarioContainer = document.getElementById("textoHorarioContainer");
    if (textoHorarioContainer) textoHorarioContainer.style.display = "none";

    if (this.elementos.checkAlterarHorario) {
      const labelAlterarHora = document.querySelector('label[for="checkAlterarHorario"]');
      this.elementos.checkAlterarHorario.style.display = "none";
      if (labelAlterarHora) labelAlterarHora.style.display = "none";
    }

    const labelObs = document.getElementById("labelObs");
    const obsElemento = document.getElementById("obs");
    if (labelObs) labelObs.style.display = "block";
    if (obsElemento) obsElemento.style.display = "block";

    if (this.elementos.btnExcluir && !this.elementos.reservaId?.value) {
      this.elementos.btnExcluir.style.display = "none";
    }
  }

  _mostrarCamposBasicos() {
    if (this.elementos.camposReserva) {
      this.elementos.camposReserva.style.display = "block";
      this.elementos.camposReserva.querySelectorAll("*").forEach((el) => {
        el.style.display = "";
      });
    }
    // ✅ v3.10: Sem manipulação de colMenuDeg aqui — controlado via CSS classe .tipo-roomservice
    // no #modalReserva. O forEach acima não afeta classes no elemento pai.
  }

  // =========================================================================
  // DADOS E VALIDAÇÃO
  // =========================================================================

  obterDados() {
    const checkAlt = this.elementos.checkAlterarHorario?.checked || false;
    let horarioFinal = this.elementos.horario?.value || "";

    if (checkAlt && this.elementos.displayHoras && this.elementos.displayMinutos) {
      horarioFinal = `${this.elementos.displayHoras.innerText}:${this.elementos.displayMinutos.innerText}`;
    }

    return {
      id: this.elementos.reservaId?.value || null,
      data: getDataAtual(),
      horario: horarioFinal,
      originalBase: this.elementos.originalBase?.value || horarioFinal,
      posicao: parseInt(this.elementos.posicaoReserva?.value) || 0,
      tipo: this.elementos.tipoCliente?.value || "hospede",
      nomes: this.elementos.nomes?.value?.trim().toUpperCase() || "",
      apto: this.elementos.apto?.value?.trim() || "",
      codigoReserva: this.elementos.codigoReserva?.value?.trim() || "",
      whatsapp: this.elementos.whatsapp?.value || "",
      avulsa: this.elementos.avulsa?.value || "",
      paxs: parseInt(this.elementos.paxs?.value) || 0,
      chd: parseInt(this.elementos.chd?.value) || 0,
      obs: this.elementos.obs?.value?.trim().toUpperCase() || "",
      bloqueado: this.elementos.checkBloquear?.checked || false,
      somenteHospedes: this.elementos.checkHospedes?.checked || false,
      menuDegustacao: this.elementos.checkMenuDegustacao?.checked || false,
    };
  }

  validar() {
    const dados = this.obterDados();
    // ✅ v3.3: delega para validarReserva() de validators.js — fonte única de validação
    return validarReserva(dados);
  }

  // =========================================================================
  // UTILITÁRIOS
  // =========================================================================

  // ✅ v3.3: delega para formatarTelefone() de validators.js
  _formatarTelefone(valor) {
    return formatarTelefone(valor);
  }

  _mostrarModal() {
    if (this.modal) this.modal.style.display = "flex";
  }

  // =========================================================================
  // ALTERAR DATA
  // =========================================================================

  /**
   * Abre formulário simples para trocar a data de uma reserva existente.
   * Exibe um input[date] pré-preenchido com a data atual da reserva,
   * confirmação e botão cancelar. Salva via alterarData() do service.js.
   *
   * ✅ v3.0: Novo fluxo — não reutiliza _abrirFormularioCompleto para manter
   *          a tela limpa (só o seletor de data, sem campos desnecessários).
   */
  _abrirFormularioAlterarData(id, reserva) {
    console.log(`📅 Abrindo alterar data: ${id}`);

    this._limparFormulario();
    this._ocultarConteudoModal();

    const titulo = this.modal?.querySelector("h3");
    if (titulo) titulo.innerText = `ALTERAR DATA — ${reserva.nomes || reserva.horario}`;

    const dataAtualReserva = reserva.data || getDataAtual();

    const painel = document.createElement("div");
    painel.id = "resumoReserva";
    painel.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;padding:10px 0;">
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;font-size:0.9rem;">
          <span style="opacity:0.7;">Data atual:</span>
          <strong id="textoDataAtual">${dataAtualReserva}</strong>
          <span id="btnAbrirCalendario" style="cursor:pointer;font-size:1.3rem;line-height:1;" title="Selecionar nova data">📅</span>
          <input
            type="date"
            id="inputNovaData"
            value="${dataAtualReserva}"
            style="position:absolute;visibility:hidden;width:1px;height:1px;"
          />
        </div>
        <button type="button" id="btnConfirmarData" style="padding:14px;background:#8e44ad;color:#fff;border:none;border-radius:8px;font-weight:900;font-size:1rem;cursor:pointer;letter-spacing:1px;">CONFIRMAR</button>
        <button type="button" id="btnCancelarData"  style="padding:14px;background:transparent;color:var(--texto-principal);border:2px solid var(--borda,#555);border-radius:8px;font-weight:700;font-size:1rem;cursor:pointer;letter-spacing:1px;">CANCELAR</button>
      </div>
    `;
    if (titulo) titulo.after(painel);

    const inputData = document.getElementById("inputNovaData");
    document.getElementById("btnAbrirCalendario")?.addEventListener("click", () => {
      if (inputData) {
        try { inputData.showPicker(); } catch(e) { inputData.click(); }
      }
    });

    inputData?.addEventListener("change", (e) => {
      const texto = document.getElementById("textoDataAtual");
      if (texto) texto.textContent = e.target.value;
    });

    document.getElementById("btnConfirmarData")?.addEventListener("click", async () => {
      const novaData = document.getElementById("inputNovaData")?.value;
      if (!novaData) return;
      if (novaData === dataAtualReserva) {
        this.fechar();
        return;
      }
      const btn = document.getElementById("btnConfirmarData");
      if (btn) { btn.disabled = true; btn.innerText = "SALVANDO..."; }
      try {
        await alterarData(id, novaData);
        this.fechar();
      } catch (e) {
        if (btn) { btn.disabled = false; btn.innerText = "CONFIRMAR"; }
      }
    }, { once: true });

    document.getElementById("btnCancelarData")?.addEventListener("click", () => {
      this.fechar();
    }, { once: true });

    this._mostrarModal();
  }

  fechar() {
    if (this.modal) {
      limparHighlightCampos();
      this._fecharResumo();
      this.modal.classList.remove("tipo-roomservice");
      this.modal.style.display = "none";
    }
  }
}
