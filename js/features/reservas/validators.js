/* =========================================================================================
   OSTERIA DI LUCCA - VALIDATORS.JS v1.2
   RESPONSABILIDADE: Validações Reutilizáveis
   ✅ v1.1: validarPax corrigido — mínimo 1 (era >= 0, reserva sem adulto não é válida)
            validarReserva() agora é a fonte única de validação — importado por reservas/modal.js
   ✅ v1.2: destacarCamposInvalidos() + limparHighlightCampos() — borda amarela em campos obrigatórios
   ========================================================================================= */

/**
 * Valida se uma string não está vazia
 * @param {string} valor - Valor a validar
 * @returns {boolean}
 */
export function validarNaoVazio(valor) {
    return valor && valor.trim().length > 0;
}

/**
 * Valida formato de telefone brasileiro (XX) XXXXX-XXXX
 * @param {string} telefone - Telefone a validar
 * @returns {boolean}
 */
export function validarTelefone(telefone) {
    if (!telefone) return true; // Telefone é opcional
    const regex = /^\(\d{2}\) \d{5}-\d{4}$/;
    return regex.test(telefone);
}

/**
 * Valida número de apartamento (apenas dígitos)
 * @param {string} apto - Número do apartamento
 * @returns {boolean}
 */
export function validarApartamento(apto) {
    if (!apto) return true; // Pode ser vazio para externos/passantes
    const regex = /^\d+$/;
    return regex.test(apto.toString());
}

/**
 * Valida quantidade de PAX (adultos)
 * @param {number} pax - Quantidade de adultos
 * @returns {boolean}
 */
export function validarPax(pax) {
    const numero = parseInt(pax);
    return !isNaN(numero) && numero >= 1 && numero <= 20;
}

/**
 * Valida quantidade de crianças
 * @param {number} chd - Quantidade de crianças
 * @returns {boolean}
 */
export function validarCriancas(chd) {
    const numero = parseInt(chd);
    return !isNaN(numero) && numero >= 0 && numero <= 10;
}

/**
 * Valida formato de horário HH:MM
 * @param {string} horario - Horário a validar
 * @returns {boolean}
 */
export function validarHorario(horario) {
    if (!horario) return false;
    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return regex.test(horario);
}

/**
 * Valida dados completos de uma reserva
 * @param {Object} dados - Objeto com dados da reserva
 * @returns {Object} { valido: boolean, erros: string[] }
 */
export function validarReserva(dados) {
    const erros = [];

    // Validações obrigatórias
    if (!validarNaoVazio(dados.nomes) && !dados.bloqueado && !dados.somenteHospedes) {
        erros.push("Nome do cliente é obrigatório");
    }

    if (!validarHorario(dados.horario)) {
        erros.push("Horário inválido");
    }

    if (!validarPax(dados.paxs)) {
        erros.push("Quantidade de adultos inválida (mínimo 1)");
    }

    if (!validarCriancas(dados.chd)) {
        erros.push("Quantidade de crianças inválida (0-10)");
    }

    // Validações específicas por tipo
    if (dados.tipo === 'roomservice' && !validarNaoVazio(dados.apto)) {
        erros.push("Room Service exige número de apartamento");
    }

    if (dados.tipo === 'hospede' && !validarNaoVazio(dados.apto)) {
        erros.push("Hóspede exige número de apartamento");
    }

    if (dados.whatsapp && !validarTelefone(dados.whatsapp)) {
        erros.push("Telefone em formato inválido. Use: (XX) XXXXX-XXXX");
    }

    return {
        valido: erros.length === 0,
        erros: erros
    };
}

/**
 * Formata telefone enquanto digita
 * @param {string} valor - Valor atual do input
 * @returns {string} Telefone formatado
 */
export function formatarTelefone(valor) {
    let numeros = valor.replace(/\D/g, "");
    
    if (numeros.length > 11) {
        numeros = numeros.slice(0, 11);
    }
    
    if (numeros.length > 6) {
        return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
    } else if (numeros.length > 2) {
        return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
    } else if (numeros.length > 0) {
        return `(${numeros}`;
    }
    
    return "";
}

/**
 * Formata valor monetário (apenas números)
 * @param {string} valor - Valor atual do input
 * @returns {string} Apenas dígitos
 */
export function formatarValorMonetario(valor) {
    return valor.replace(/\D/g, "");
}

/**
 * Valida se total de pessoas não excede capacidade
 * @param {number} adultos - Quantidade de adultos
 * @param {number} criancas - Quantidade de crianças
 * @param {number} capacidadeMaxima - Capacidade do restaurante
 * @returns {boolean}
 */
export function validarCapacidade(adultos, criancas, capacidadeMaxima = 30) {
    const total = parseInt(adultos || 0) + parseInt(criancas || 0);
    return total > 0 && total <= capacidadeMaxima;
}

/**
 * Aplica borda amarela nos campos obrigatórios não preenchidos.
 * Chamado por init.js após validacao.valido === false.
 * @param {Object} dados - Retorno de reservaModal.obterDados()
 */
export function destacarCamposInvalidos(dados) {
    // Limpa estado anterior antes de re-avaliar
    limparHighlightCampos();

    if (dados.bloqueado || dados.somenteHospedes) return;

    const tipo = dados.tipo;

    // Nome obrigatório para todos
    if (!validarNaoVazio(dados.nomes)) {
        _marcar('nomes');
    }

    // Apto obrigatório para hóspede e room service — vazio = inválido
    if ((tipo === 'hospede' || tipo === 'roomservice') && !validarNaoVazio(dados.apto)) {
        _marcar('apto');
    }

    // Adultos obrigatório para todos — valor <= 0 = inválido
    if (!validarPax(dados.paxs)) {
        _marcar('paxs');
    }
}

/**
 * Remove borda amarela de todos os campos do formulário.
 * Chamado ao fechar o modal ou ao salvar com sucesso.
 */
export function limparHighlightCampos() {
    document.querySelectorAll('#formReserva .campo-invalido').forEach(el => {
        el.classList.remove('campo-invalido');
    });
}

/** @private */
function _marcar(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('campo-invalido');
}

/**
 * Escapa caracteres HTML perigosos em texto livre digitado pelo usuário
 * (nomes, observações, etc.) antes de inserir em template strings de innerHTML.
 * Sem isso, um usuário digitando "<img src=x onerror=alert(1)>" em Observações
 * executaria esse código para qualquer pessoa que abrir a grade (XSS armazenado).
 * @param {string} texto - Texto potencialmente perigoso
 * @returns {string} Texto seguro para inserir em HTML
 */
export function escapeHtml(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
