/*
  Prueba de la antigüedad de la deuda del reporte «Clientes con cuentas por
  cobrar». Lógica pura, sin red:

      node scripts/test-antiguedad-de-deuda.mjs
*/
import assert from 'node:assert/strict'
import {
  antiguedadDeLaDeuda,
  diasVencida,
  porcentaje,
  tramoDeAtraso,
  vencimientoMasViejo,
} from '../src/lib/antiguedadDeDeuda.ts'

const hoy = new Date(2026, 10, 9, 10, 18) // 09/11/2026 10:18 hora local

// Días de atraso
assert.equal(diasVencida('2026-11-09', hoy), 0, 'vence hoy: 0 días')
assert.equal(diasVencida('2026-11-08', hoy), 1)
assert.equal(diasVencida('2026-10-23', hoy), 17)
assert.equal(diasVencida('2026-11-20', hoy), 0, 'todavía no vence: 0')
assert.equal(diasVencida(null, hoy), 0)
assert.equal(diasVencida('basura', hoy), 0)
// A las 11 p. m. sigue siendo el mismo día (no se corre por UTC)
assert.equal(diasVencida('2026-11-08', new Date(2026, 10, 9, 23, 30)), 1)

// Tramos: manda `vencida`, que la calcula la base
const n = (fecha_pago, vencida, total_usd) => ({ fecha_pago, vencida, total_usd })
assert.equal(tramoDeAtraso(n('2026-10-01', false, 10), hoy), 'AL_DIA')
assert.equal(tramoDeAtraso(n('2026-11-09', true, 10), hoy), 'D1_15')
assert.equal(tramoDeAtraso(n('2026-10-25', true, 10), hoy), 'D1_15') // 15 días
assert.equal(tramoDeAtraso(n('2026-10-24', true, 10), hoy), 'D16_30') // 16 días
assert.equal(tramoDeAtraso(n('2026-10-10', true, 10), hoy), 'D16_30') // 30 días
assert.equal(tramoDeAtraso(n('2026-10-09', true, 10), hoy), 'D31_60') // 31 días
assert.equal(tramoDeAtraso(n('2026-09-10', true, 10), hoy), 'D31_60') // 60 días
assert.equal(tramoDeAtraso(n('2026-09-09', true, 10), hoy), 'MAS_60') // 61 días

// Sumas por tramo (los totales llegan como texto desde la base)
const notas = [
  n('2026-11-01', true, '306.36'),
  n('2026-10-20', true, '400'),
  n('2026-09-01', true, '4800'),
  n('2026-11-30', false, '375'),
]
const t = antiguedadDeLaDeuda(notas, hoy)
assert.deepEqual(t.D1_15, { notas: 1, usd: 306.36 })
assert.deepEqual(t.D16_30, { notas: 1, usd: 400 })
assert.deepEqual(t.MAS_60, { notas: 1, usd: 4800 })
assert.deepEqual(t.AL_DIA, { notas: 1, usd: 375 })
assert.deepEqual(t.D31_60, { notas: 0, usd: 0 })
const sumaTramos = Object.values(t).reduce((s, x) => s + x.usd, 0)
assert.equal(Math.round(sumaTramos * 100) / 100, 5881.36, 'los tramos suman el total')

// Vencimiento más viejo: solo de las vencidas
assert.equal(vencimientoMasViejo(notas), '2026-09-01')
assert.equal(vencimientoMasViejo([n('2026-01-01', false, 1)]), null)

// Porcentaje
assert.equal(porcentaje(0, 0), 0)
assert.equal(Math.round(porcentaje(11195, 12201.36) * 10) / 10, 91.8)

console.log('OK: antigüedad de la deuda (días, tramos, sumas, vencimiento más viejo, porcentaje).')
