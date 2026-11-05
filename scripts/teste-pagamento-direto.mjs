import assert from 'node:assert/strict';
import { calcularBI } from '../js/core/bi.js';
const base = { nomes: 'Teste', data: '2026-11-04', horario: '20:00', paxs: 2, chd: 0 };
const reservas = [
  { ...base, tipo:'externo', pagamento: null },
  { ...base, tipo:'externo', pagamento:'direto' },
  { ...base, tipo:'externo', pagamento:'pago' },
  { ...base, tipo:'externo', pagamento:'pendente' },
  { ...base, tipo:'hospede', pagamento:null },
  { ...base, tipo:'passante', pagamento:null },
  { ...base, tipo:'passante', pagamento:'direto' },
  { ...base, tipo:'roomservice', pagamento:'direto' },
  { ...base, tipo:'externo', pagamento:'pago', canceladoEm:'2026-11-01' },
];
const m=calcularBI(reservas,['2026-11-04']);
assert.equal(m.pagamentos.direto,3);
assert.equal(m.pagamentos.pago,1);
assert.equal(m.pagamentos.pendente,1);
assert.equal(m.pagamentoTotal,5);
assert.equal(m.canceladas.reservas,1);
console.log('Pagamentos: direto legado e explícito, outros perfis, Room Service e cancelamentos verificados.');
