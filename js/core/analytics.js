import { getHorariosPadrao } from './state.js';

export const reservaAtiva = r => Boolean(r.nomes?.trim() && !r.bloqueado && !r.somenteHospedes && !r.canceladoEm);
// Cards operacionais excluem faltas; a regra analítica mantém o histórico de reservas.
export const reservaOperacional = r => reservaAtiva(r) && r.statusRecepcao !== 'no_show';
export const tipoCliente = r => (r.tipo || 'hospede').toLowerCase();
export const paxReserva = r => Math.max(0, parseInt(r.paxs) || 0) + Math.max(0, parseInt(r.chd) || 0);
export const horariosAnalise = reservas => [...new Set([...getHorariosPadrao(), ...reservas.filter(reservaAtiva)
    .filter(r => tipoCliente(r) !== 'roomservice').map(r => r.originalBase || r.horario).filter(Boolean)])].sort();
