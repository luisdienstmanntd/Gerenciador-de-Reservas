/* =========================================================================================
   OSTERIA DI LUCCA - CONTROLS.JS v9.1
   RESPONSABILIDADE: Controles de Interface e Tema
   ✅ CORRIGIDO: Migrado para DatabaseService
   ✅ O Tema agora obedece estritamente a posição do switch
   ✅ v7.7: Reverte tentativa de desmarcação em bloqueios existentes
   ✅ v7.8: salvarConfiguracoes() adicionada — grava em localStorage (offline)
   ✅ v7.9: ajustarHora() adicionada — controle de horas no relógio
   ✅ v8.1: linhasLivres usa posicoes unicas — evita travamento com dados sujos
   ✅ v8.0: acaoExcluir corrigida — blocos editados usam base 1 (não 3), evita negativos infinitos
   ✅ v8.3: Etapa 3 — acaoExcluir usa batch write (atômico) + alert() → notificarAviso()
   ✅ v8.4: Etapa 5 — acaoAdicionar/acaoExcluir persistem linhasExtras no Firestore (config_dia)
   ✅ v8.5: Corrige mutação direta de estado em acaoExcluir — usa setLinhasExtras() em vez de
            getLinhasExtras()[hr] = novoExtra (violava a regra arquitetural do state.js)
   ✅ v8.6: Limpa também vazios em posições redundantes (gerados pelo bug do service.js anterior)
   ✅ v8.7: acaoExcluir() delegada para removerLinhaDoBloco() em service.js — regra 4
            controls.js é agora puramente UI: sem acesso direto ao Firestore
   ✅ v9.0: salvarConfiguracoes()/carregarConfiguracoes() passam a ler/gravar em
            config_sistema (Supabase) — ver docstrings abaixo
   ✅ v9.1: Editor de "Bloqueios Antecipados" (dia da semana × horário × qtd) — mesmo
            padrão de trava de capacidade/mesas: switch desligado por padrão, "+
            ADICIONAR REGRA" só aparece com o switch ligado (alternarEdicaoBloqueiosSemanais)
   ========================================================================================= */

import { adicionarLinhaExtra, getLinhasExtras, getTodasReservas, getDataAtual, getConfig, setConfigSistema, getHorariosPadrao } from '../core/state.js';
import { renderizarGrid } from './render.js';
import { removerLinhaDoBloco } from '../features/reservas/service.js';
import { db } from '../core/database.js';
import { notificarAviso, notificarErro } from '../core/notificacao.js';

let horarioGerenciamento = "";

/**
 * Alterna entre Modo Claro e Escuro
 * ✅ Lógica: Switch Ligado (Direita) = Dark Mode
 */
export function alternarTema() {
    const switchBtn = document.getElementById('theme-switch');
    const body = document.body;

    if (switchBtn && switchBtn.checked) {
        body.classList.add('dark-theme');
        localStorage.setItem('tema', 'dark');
        console.log('🌑 Tema alterado para: Escuro');
    } else {
        body.classList.remove('dark-theme');
        localStorage.setItem('tema', 'light');
        console.log('☀️ Tema alterado para: Claro');
    }
}

/**
 * Ajusta horas do seletor de hora
 */
export function ajustarHora(delta) {
    const display = document.getElementById("displayHoras");
    if (!display) return;

    let val = parseInt(display.innerText);
    val += delta;
    if (val > 23) val = 0;
    if (val < 0) val = 23;
    display.innerText = val.toString().padStart(2, '0');
}

/**
 * Ajusta minutos do seletor de hora
 */
export function ajustarMinuto(delta) {
    const display = document.getElementById("displayMinutos");
    if (!display) return;

    let val = parseInt(display.innerText);
    val += delta;
    if (val >= 60) val = 0;
    if (val < 0) val = 45;
    display.innerText = val.toString().padStart(2, '0');
}

/**
 * Toggle do checkbox de bloqueio
 * ✅ v7.7: Reverte tentativa de desmarcação em bloqueios existentes
 */
export function toggleBloqueio(origem) {
    const elBloq = document.getElementById("checkBloquear");
    const elHosp = document.getElementById("checkHospedes");
    const btnExcluir = document.getElementById("btnExcluir");

    if (!elBloq || !elHosp) return true;

    const isEdit = document.getElementById("reservaId")?.value !== "";
    const eraBloqueioAntes = elBloq.getAttribute('data-era-bloqueio') === 'true';
    const eraHospedesAntes = elHosp.getAttribute('data-era-hospedes') === 'true';
    const isBloqueioExistente = isEdit && (eraBloqueioAntes || eraHospedesAntes);

    if (isBloqueioExistente) {
        const bloqMarcadoAntes = eraBloqueioAntes;
        const hospMarcadoAntes = eraHospedesAntes;

        if (origem === 'bloq' && bloqMarcadoAntes && !hospMarcadoAntes) {
            console.log('⚠️ Não pode desmarcar BLOQUEIO. Clique em SÓ HOSP para trocar.');
            return false;
        }
        if (origem === 'hosp' && hospMarcadoAntes && !bloqMarcadoAntes) {
            console.log('⚠️ Não pode desmarcar SÓ HOSP. Clique em BLOQUEIO para trocar.');
            return false;
        }

        if (origem === 'bloq') {
            elBloq.checked = true;
            elHosp.checked = false;
            elBloq.setAttribute('data-era-bloqueio', 'true');
            elHosp.setAttribute('data-era-hospedes', 'false');
        } else {
            elHosp.checked = true;
            elBloq.checked = false;
            elHosp.setAttribute('data-era-hospedes', 'true');
            elBloq.setAttribute('data-era-bloqueio', 'false');
        }
    } else {
        if (origem === 'bloq' && elBloq.checked) {
            elHosp.checked = false;
        } else if (origem === 'hosp' && elHosp.checked) {
            elBloq.checked = false;
        }
    }

    if (btnExcluir) {
        if ((elBloq.checked || elHosp.checked) && !isEdit) {
            btnExcluir.style.display = "none";
        } else if (isEdit) {
            btnExcluir.style.display = "inline-block";
        }
    }

    if (typeof window.toggleCampos === 'function') {
        window.toggleCampos();
    }

    return true;
}

/**
 * Abre menu de adicionar/remover linha
 */
export function abrirMenuHorario(horario) {
    horarioGerenciamento = horario;
    const titulo = document.getElementById("tituloMenuHorario");
    if (titulo) titulo.innerText = `GERENCIAR ${horario}`;

    const menu = document.getElementById("menuHorario");
    if (menu) menu.style.display = "flex";
}

/**
 * Fecha menu de horário
 */
export function fecharMenuHorario() {
    const menu = document.getElementById("menuHorario");
    if (menu) menu.style.display = "none";
}

export async function acaoAdicionar() {
    const hr = horarioGerenciamento;
    if (!hr) return;

    // 1. Atualiza memória local imediatamente (UI responde sem esperar o Firestore)
    adicionarLinhaExtra(hr);
    renderizarGrid(getTodasReservas());
    fecharMenuHorario();

    // 2. Persiste no Firestore em background
    // ✅ v8.4: Etapa 5 — linhasExtras agora sobrevive a reload e sincroniza entre dispositivos
    try {
        await db.aguardarInicializacao();
        await db.salvarConfigDia(getDataAtual(), getLinhasExtras());
    } catch (error) {
        console.error('❌ Erro ao persistir linhasExtras (adicionar):', error);
        // Falha silenciosa — UI já atualizou; apenas a persistência falhou
    }
}

export async function acaoExcluir() {
    const hr = horarioGerenciamento;
    if (!hr) return;

    const data = getDataAtual();

    let resultado;
    try {
        // ✅ v8.7: Toda a lógica (query, limpeza de fantasmas, batch, linhasExtras)
        // delegada para removerLinhaDoBloco() em service.js — regra 4.
        resultado = await removerLinhaDoBloco(hr, data);
    } catch (error) {
        console.error('❌ Erro ao remover linha:', error);
        notificarErro('Erro ao remover linha. Nenhuma alteração foi salva.');
        fecharMenuHorario();
        return;
    }

    if (!resultado.ok) {
        notificarAviso(resultado.motivo);
        fecharMenuHorario();
        return;
    }

    renderizarGrid(getTodasReservas());
    fecharMenuHorario();

    // Persiste linhasExtras no Firestore em background
    // resultado.linhasExtrasAtualizado já reflete o estado pós-remoção
    try {
        await db.salvarConfigDia(data, resultado.linhasExtrasAtualizado);
    } catch (error) {
        console.error('❌ Erro ao persistir linhasExtras (excluir):', error);
        // Falha silenciosa — o batch principal (reservas) já concluiu com sucesso
    }
}

/**
 * Alterna modo tela cheia
 */
export function alternarTelaCheia() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error('❌ Erro ao entrar em tela cheia:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

/**
 * Exibe/oculta o seletor de horário (relógio) ao marcar o checkbox
 */
export function toggleAlterarHorario() {
    const check = document.getElementById('checkAlterarHorario');
    const container = document.getElementById('containerNovoHorario');
    if (!container) return;
    if (check && check.checked) {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
}

/**
 * Habilita/desabilita a edição de um campo de configuração, de acordo com a
 * posição do switch ao lado — evita alteração acidental de um valor sensível
 * (capacidade/mesas afetam cálculos usados no sistema inteiro).
 * @param {string} inputId   - ID do <input> a travar/destravar
 * @param {boolean} habilitado - true = switch ligado, campo editável
 */
export function alternarEdicaoConfig(inputId, habilitado) {
    const input = document.getElementById(inputId);
    if (input) input.disabled = !habilitado;
}

/**
 * Carrega os valores salvos (getConfig()) nos campos da tela de Configurações
 * e garante que todos comecem travados (switch desligado) — nunca ficam
 * editáveis por padrão, mesmo que a última visita tenha deixado destravado.
 * Chamada por navigation.js sempre que a tela é aberta.
 */
export function carregarConfiguracoes() {
    const config = getConfig();

    const inputCapacidade = document.getElementById('configCapacidade');
    const inputMesas = document.getElementById('configMesas');
    const toggleCapacidade = document.getElementById('toggleConfigCapacidade');
    const toggleMesas = document.getElementById('toggleConfigMesas');
    const toggleBloqueioAutomatico = document.getElementById('toggleBloqueioAutomatico');
    const toggleBloqueiosSemanais = document.getElementById('toggleConfigBloqueiosSemanais');

    if (inputCapacidade) { inputCapacidade.value = config.capacidade; inputCapacidade.disabled = true; }
    if (inputMesas)      { inputMesas.value = config.mesas; inputMesas.disabled = true; }
    if (toggleCapacidade) toggleCapacidade.checked = false;
    if (toggleMesas)      toggleMesas.checked = false;
    // Diferente de capacidade/mesas: é liga/desliga direto, sem trava — não é um
    // valor sensível que precise de confirmação extra pra editar.
    if (toggleBloqueioAutomatico) toggleBloqueioAutomatico.checked = config.bloqueioAutomatico !== false;

    // Trava igual capacidade/mesas: começa sempre desligado, "+ ADICIONAR REGRA"
    // só aparece com o switch ligado — evita adicionar regra sem querer.
    if (toggleBloqueiosSemanais) toggleBloqueiosSemanais.checked = false;
    alternarEdicaoBloqueiosSemanais(false);

    _renderizarRegrasBloqueioSemanal(config.bloqueiosSemanais || {});
}

/** Mostra/esconde o botão "+ ADICIONAR REGRA" de acordo com o switch da seção. */
export function alternarEdicaoBloqueiosSemanais(habilitado) {
    const btn = document.getElementById('btnAdicionarRegraBloqueio');
    if (btn) btn.classList.toggle('hidden', !habilitado);
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUEIOS ANTECIPADOS — editor de regras (dia da semana × horário × qtd)
// ─────────────────────────────────────────────────────────────────────────────

const DIAS_SEMANA_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Monta uma linha do editor: [dia da semana][horário][qtd][remover]. */
function _criarLinhaRegra(dia = 4, horario = '20:00', qtd = 1) {
    const linha = document.createElement('div');
    linha.className = 'regra-bloqueio-semanal';

    const selDia = document.createElement('select');
    selDia.className = 'config-input regra-dia';
    DIAS_SEMANA_LABEL.forEach((label, i) => {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = label;
        if (i === Number(dia)) opt.selected = true;
        selDia.appendChild(opt);
    });

    const selHorario = document.createElement('select');
    selHorario.className = 'config-input regra-horario';
    getHorariosPadrao().forEach(h => {
        const opt = document.createElement('option');
        opt.value = h; opt.textContent = h;
        if (h === horario) opt.selected = true;
        selHorario.appendChild(opt);
    });

    const inputQtd = document.createElement('input');
    inputQtd.type = 'number';
    inputQtd.className = 'config-input regra-qtd';
    inputQtd.min = '1'; inputQtd.max = '3';
    inputQtd.value = Math.min(3, Math.max(1, Number(qtd) || 1));
    inputQtd.title = 'Quantas linhas bloquear (1-3)';

    const btnRemover = document.createElement('button');
    btnRemover.type = 'button';
    btnRemover.className = 'regra-remover';
    btnRemover.textContent = '✕';
    btnRemover.title = 'Remover regra';
    btnRemover.addEventListener('click', () => linha.remove());

    linha.append(selDia, selHorario, inputQtd, btnRemover);
    return linha;
}

/** Preenche o editor a partir do mapa salvo { dia: { horario: qtd } }. */
function _renderizarRegrasBloqueioSemanal(mapa) {
    const container = document.getElementById('listaBloqueiosSemanais');
    if (!container) return;
    container.innerHTML = '';
    Object.keys(mapa).sort().forEach(dia => {
        Object.keys(mapa[dia]).sort().forEach(horario => {
            container.appendChild(_criarLinhaRegra(dia, horario, mapa[dia][horario]));
        });
    });
}

export function adicionarRegraBloqueioSemanal() {
    const container = document.getElementById('listaBloqueiosSemanais');
    if (container) container.appendChild(_criarLinhaRegra());
}

/** Lê as linhas do editor de volta pro mapa { dia: { horario: qtd } }.
 *  Regras duplicadas (mesmo dia+horário): a última vence. */
function _serializarRegrasBloqueioSemanal() {
    const mapa = {};
    document.querySelectorAll('#listaBloqueiosSemanais .regra-bloqueio-semanal').forEach(linha => {
        const dia = linha.querySelector('.regra-dia')?.value;
        const horario = linha.querySelector('.regra-horario')?.value;
        const qtd = Math.min(3, Math.max(1, parseInt(linha.querySelector('.regra-qtd')?.value) || 1));
        if (dia == null || !horario) return;
        if (!mapa[dia]) mapa[dia] = {};
        mapa[dia][horario] = qtd;
    });
    return mapa;
}

/**
 * Salva configurações do restaurante — sincronizadas via Supabase, visíveis pra
 * recepção/osteria/gerência em tempo real (antes viviam só no localStorage de
 * cada navegador/tablet, cada usuário podia ver um valor diferente).
 * ✅ v7.8: Offline. Silencioso. Lido por getConfig() em state.js.
 * ✅ v8.8: Re-trava os campos e desliga os switches depois de salvar.
 * ✅ v8.9: bloqueioAutomatico — liga/desliga o bloqueio automático de reservas
 *          grandes (service.js), sem trava (não é valor sensível).
 * ✅ v9.0: Grava em config_sistema (Supabase) em vez de localStorage — sincroniza
 *          entre todos os usuários.
 */
export async function salvarConfiguracoes() {
    const inputCapacidade = document.getElementById('configCapacidade');
    const inputMesas = document.getElementById('configMesas');
    const toggleBloqueioAutomatico = document.getElementById('toggleBloqueioAutomatico');

    const capacidade = parseInt(inputCapacidade?.value) || 30;
    const mesas = parseInt(inputMesas?.value) || 18;
    const bloqueioAutomatico = toggleBloqueioAutomatico ? toggleBloqueioAutomatico.checked : true;
    const bloqueiosSemanais = _serializarRegrasBloqueioSemanal();

    const config = { capacidade, mesas, bloqueioAutomatico, bloqueiosSemanais };

    try {
        await db.salvarConfigSistema(config);
        // Atualiza o cache local na hora — não espera a volta do Realtime pra
        // refletir a própria escrita (outros usuários recebem via listener normal).
        setConfigSistema(config);
        console.log('✅ Configurações salvas (config_sistema):', config);
    } catch (error) {
        console.error('❌ Erro ao salvar configurações:', error);
        notificarErro('Erro ao salvar configurações. Tente novamente.');
        return;
    }

    carregarConfiguracoes();

    const btnSalvar = document.querySelector('#tela-configuracoes .save-btn');
    if (btnSalvar) {
        const textoOriginal = btnSalvar.innerText;
        btnSalvar.innerText = '✅ SALVO!';
        btnSalvar.disabled = true;
        setTimeout(() => {
            btnSalvar.innerText = textoOriginal;
            btnSalvar.disabled = false;
        }, 1500);
    }
}

// =========================================================================================
// EXPOSIÇÃO GLOBAL
// =========================================================================================
window.ajustarHora = ajustarHora;
window.alternarTema = alternarTema;
window.ajustarMinuto = ajustarMinuto;
window.toggleBloqueio = toggleBloqueio;
window.abrirMenuHorario = abrirMenuHorario;
window.fecharMenuHorario = fecharMenuHorario;
window.acaoAdicionar = acaoAdicionar;
window.acaoExcluir = acaoExcluir;
window.alternarTelaCheia = alternarTelaCheia;
window.adicionarRegraBloqueioSemanal = adicionarRegraBloqueioSemanal;
window.alternarEdicaoBloqueiosSemanais = alternarEdicaoBloqueiosSemanais;
window.toggleAlterarHorario = toggleAlterarHorario;
window.salvarConfiguracoes = salvarConfiguracoes;
window.carregarConfiguracoes = carregarConfiguracoes;
window.alternarEdicaoConfig = alternarEdicaoConfig;
