/*
  Prueba unitaria de la lógica pura del reporte «Cuentas por cobrar pagadas»
  en Facturación › Notas de entrega:

      node scripts/test-cuentas-pagadas-notas.mjs
*/
import assert from 'node:assert/strict'
import {
  agruparCuentasPagadasPorCliente,
  diasDeMoraAlPagar,
  fechaCaracas,
  filtrarNotasCobradas,
  resumenDeCuentasPagadas,
} from '../src/lib/cuentasPagadasDeNotas.ts'

// 1. Extracción de fecha calendario en hora de Caracas (UTC-4)
assert.equal(fechaCaracas('2026-11-08T15:20:00Z'), '2026-11-08')
// 22:30 en Caracas equivale a 02:30Z del día siguiente en UTC: debe conservar el día de Caracas
assert.equal(fechaCaracas('2026-11-09T02:30:00Z'), '2026-11-08')
assert.equal(fechaCaracas('2026-11-05'), '2026-11-05')
assert.equal(fechaCaracas(null), null)
assert.equal(fechaCaracas('invalido'), null)

// 2. Cálculo de mora efectiva al momento del pago
assert.equal(diasDeMoraAlPagar('2026-11-09', '2026-11-08T18:00:00Z'), 0, 'pagada antes del vencimiento: en plazo')
assert.equal(diasDeMoraAlPagar('2026-11-08', '2026-11-09T02:00:00Z'), 0, 'pagada el mismo día 08/11 a las 22:00 Caracas')
assert.equal(diasDeMoraAlPagar('2026-11-04', '2026-11-08T14:00:00Z'), 4, 'pagada 4 días después del vencimiento')
assert.equal(diasDeMoraAlPagar(null, '2026-11-08T14:00:00Z'), 0, 'sin fecha de vencimiento: 0 días')

// 3. Filtrado de notas elegibles (pendiente_por_cobrar + cobrada_en + vigentes + período + cliente)
const base = [
  {
    cliente_id: 10,
    cliente: 'CONSTRUCTORA EJEMPLO NORTE, C.A.',
    cliente_rif: 'J000000101',
    numero: 'NE-2026-0219',
    fecha: '2026-10-25',
    fecha_pago: '2026-11-09',
    cobrada_en: '2026-11-08T16:00:00Z',
    pendiente_por_cobrar: true,
    estado: 'DESPACHADA',
    moneda: 'USD',
    total: '700',
    total_bs: '626290',
    total_usd: '700',
  },
  {
    cliente_id: 10,
    cliente: 'CONSTRUCTORA EJEMPLO NORTE, C.A.',
    cliente_rif: 'J000000101',
    numero: 'NE-2026-0204',
    fecha: '2026-10-20',
    fecha_pago: '2026-11-04',
    cobrada_en: '2026-11-09T01:30:00Z', // 08/11/2026 21:30 Caracas -> 4 días de mora
    pendiente_por_cobrar: true,
    estado: 'FACTURADA',
    moneda: 'USD',
    total: 700,
    total_bs: 626290,
    total_usd: 700,
  },
  {
    cliente_id: 25,
    cliente: 'DISTRIBUIDORA EJEMPLO SUR, C.A.',
    cliente_rif: 'J000000258',
    numero: 'NE-2026-0211',
    fecha: '2026-10-22',
    fecha_pago: '2026-11-01',
    cobrada_en: '2026-11-05T14:00:00Z', // 4 días de mora
    pendiente_por_cobrar: true,
    estado: 'DESPACHADA',
    moneda: 'VES',
    total: '335526.15',
    total_bs: '335526.15',
    total_usd: '375',
  },
  // Excluidas:
  {
    cliente_id: 25,
    cliente: 'DISTRIBUIDORA EJEMPLO SUR, C.A.',
    cliente_rif: 'J000000258',
    numero: 'NE-2026-0230',
    fecha: '2026-11-02',
    fecha_pago: '2026-11-10',
    cobrada_en: null, // aún sin cobrar
    pendiente_por_cobrar: true,
    estado: 'DESPACHADA',
    moneda: 'USD',
    total: 500,
    total_bs: 447000,
    total_usd: 500,
  },
  {
    cliente_id: 30,
    cliente: 'COMERCIAL DEMO, C.A.',
    cliente_rif: 'J000000304',
    numero: 'NE-2026-0231',
    fecha: '2026-11-03',
    fecha_pago: null,
    cobrada_en: '2026-11-03T15:00:00Z',
    pendiente_por_cobrar: false, // no era cuenta por cobrar
    estado: 'DESPACHADA',
    moneda: 'USD',
    total: 200,
    total_bs: 179000,
    total_usd: 200,
  },
  {
    cliente_id: 10,
    cliente: 'CONSTRUCTORA EJEMPLO NORTE, C.A.',
    cliente_rif: 'J000000101',
    numero: 'NE-2026-0199',
    fecha: '2026-10-18',
    fecha_pago: '2026-11-01',
    cobrada_en: '2026-11-02T15:00:00Z',
    pendiente_por_cobrar: true,
    estado: 'ANULADA', // anulada: no entra
    moneda: 'USD',
    total: 900,
    total_bs: 800000,
    total_usd: 900,
  },
]

const elegibles = filtrarNotasCobradas(base)
assert.equal(elegibles.length, 3, 'solo quedan las 3 vigentes de cuentas por cobrar ya pagadas')

const soloDel06Al08 = filtrarNotasCobradas(base, { desde: '2026-11-06', hasta: '2026-11-08' })
assert.equal(soloDel06Al08.length, 2, 'rango por fecha de pago en Caracas incluye la pagada el 08/11 a las 21:30')

const soloCliente25 = filtrarNotasCobradas(base, { clienteId: '25' })
assert.equal(soloCliente25.length, 1)
assert.equal(soloCliente25[0].numero, 'NE-2026-0211')

// 4. Agrupación por cliente (ordenado de mayor a menor monto en USD)
const grupos = agruparCuentasPagadasPorCliente(elegibles)
assert.equal(grupos.length, 2)
assert.equal(grupos[0].cliente_id, 10)
assert.equal(grupos[0].usd, 1400)
assert.equal(grupos[0].bs, 1252580)
assert.equal(grupos[0].ultimoPago, '2026-11-08')
assert.equal(grupos[0].enPlazo, 1)
assert.equal(grupos[0].conMora, 1)
assert.equal(grupos[0].notas[0].numero, 'NE-2026-0219', 'dentro del mismo día ordena por correlativo descendente')

assert.equal(grupos[1].cliente_id, 25)
assert.equal(grupos[1].usd, 375)
assert.equal(grupos[1].ultimoPago, '2026-11-05')

// 5. Resumen ejecutivo global
const r = resumenDeCuentasPagadas(elegibles)
assert.equal(r.usd, 1775)
assert.equal(Math.round(r.bs * 100) / 100, 1588106.15)
assert.equal(r.enPlazoCount, 1)
assert.equal(r.enPlazoUsd, 700)
assert.equal(r.conMoraCount, 2)
assert.equal(r.conMoraUsd, 1075)
assert.equal(Math.round(r.pctEnPlazo * 10) / 10, 33.3)
assert.equal(r.usdEmitidasCount, 2)
assert.equal(r.usdEmitidasMonto, 1400)
assert.equal(r.vesEmitidasCount, 1)
assert.equal(r.vesEmitidasMonto, 335526.15)
assert.equal(r.vesEmitidasEquivUsd, 375)

console.log('OK: cuentas pagadas de notas de entrega (fecha Caracas, mora al pagar, filtros, agrupación y resumen).')
