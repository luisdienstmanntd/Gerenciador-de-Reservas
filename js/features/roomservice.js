/* =========================================================================================
   OSTERIA DI LUCCA - ROOMSERVICE.JS v2.2
   ✅ v2.1: Padroniza error handling — usa notificacao.js
   ✅ v2.2: Bug #8 — usa buscarReservasPorData() de service.js — elimina acesso direto ao Firestore
   ✅ v2.3: Escapa rs.nomes/rs.obs no card — corrige XSS armazenado
   ========================================================================================= */

import { getDataAtual } from '../core/state.js';
import { buscarReservasPorData } from './reservas/service.js';
import { notificarErro } from '../core/notificacao.js';
import { escapeHtml } from './reservas/validators.js';

/**
 * Carrega room services de uma data específica
 */
export async function carregarRoomServices() {
    const dataInput = document.getElementById('dataRoomService');
    const data = dataInput ? dataInput.value : getDataAtual();
    const container = document.getElementById('listaRoomServices');
    
    if (!container) return;
    
    container.innerHTML = '<p style="text-align: center; padding: 40px;">Carregando...</p>';
    
    try {
        const todasReservas = await buscarReservasPorData(data);
        const roomServices = todasReservas.filter(r => r.tipo === 'roomservice');
        
        if (roomServices.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px; opacity: 0.6;">
                    <div style="font-size: 4rem;">🍽️</div>
                    <p style="margin-top: 20px; font-size: 1.1rem;">Nenhum Room Service nesta data</p>
                </div>
            `;
            return;
        }
        
        // Ordena por horário
        roomServices.sort((a, b) => a.horario.localeCompare(b.horario));
        
        let html = '<div style="display: grid; gap: 15px;">';
        
        roomServices.forEach(rs => {
            const statusMesa = rs.fimMesa ? '✅ Finalizado' : (rs.inicioMesa ? '🔥 Em preparo' : '⏳ Aguardando');
            const corStatus = rs.fimMesa ? '#27ae60' : (rs.inicioMesa ? '#e67e22' : '#95a5a6');
            
            let tempo = '--';
            if (rs.inicioMesa && rs.fimMesa) {
                const diff = Math.floor((new Date(rs.fimMesa) - new Date(rs.inicioMesa)) / 1000 / 60);
                tempo = `${diff} min`;
            }
            
            html += `
                <div style="background: var(--fundo); padding: 20px; border-radius: 10px; border-left: 5px solid var(--roomservice); cursor: pointer;" onclick="abrirEditar('${rs.id}')">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div>
                            <div style="font-size: 0.8rem; opacity: 0.7; margin-bottom: 5px;">${rs.horario}</div>
                            <div style="font-size: 1.3rem; font-weight: 900; color: var(--roomservice);">APTO ${rs.apto}</div>
                            <div style="margin-top: 8px; font-size: 0.95rem;">${rs.nomes ? escapeHtml(rs.nomes) : 'Sem nome'}</div>
                            <div style="margin-top: 5px; font-size: 0.85rem; opacity: 0.8;">
                                👤 ${rs.paxs || 0} adultos ${rs.chd ? `+ ${rs.chd} crianças` : ''}
                            </div>
                            ${rs.obs ? `<div style="margin-top: 8px; font-size: 0.8rem; background: #fff3cd; color: #856404; padding: 5px 10px; border-radius: 5px; display: inline-block;">${escapeHtml(rs.obs)}</div>` : ''}
                        </div>
                        <div style="text-align: right;">
                            <div style="background: ${corStatus}; color: white; padding: 5px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; margin-bottom: 10px;">
                                ${statusMesa}
                            </div>
                            ${tempo !== '--' ? `<div style="font-size: 0.9rem; opacity: 0.7;">⏱️ ${tempo}</div>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        
        html += `
            <div style="margin-top: 30px; padding: 20px; background: linear-gradient(135deg, #9b59b6, #8e44ad); color: white; border-radius: 10px; text-align: center;">
                <div style="font-size: 0.9rem; opacity: 0.9; margin-bottom: 10px;">TOTAL DE ROOM SERVICES</div>
                <div style="font-size: 3rem; font-weight: 900;">${roomServices.length}</div>
            </div>
        `;
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error("Erro ao carregar room services:", error);
        notificarErro("Erro ao carregar room services.");
        container.innerHTML = '<p style="color: red; text-align: center; padding: 40px;">Erro ao carregar dados</p>';
    }
}

// Expor função globalmente
window.carregarRoomServices = carregarRoomServices;
