/*
  Prueba del calendario bancario SUDEBAN y resolución de fecha valor BCV en Venezuela.
  Lógica pura, sin red:

      node scripts/test-calendario-bancario.mjs
*/
import assert from 'node:assert/strict'
import {
  esFeriadoBancario,
  esFinDeSemana,
  esDiaNoBancario,
  proximoDiaHabilBancario,
  infoDiaBancario,
  resolverDiaValorBcv,
  siguienteDiaHabilBancario,
} from '../src/lib/calendarioBancario.ts'

// 1. Detección del Lunes Bancario de hoy (23 de noviembre de 2026 - Virgen de Chiquinquirá)
assert.equal(esFeriadoBancario('2026-11-23'), true, 'El 23-11-2026 es feriado bancario')
assert.equal(esDiaNoBancario('2026-11-23'), true, 'El 23-11-2026 es día no bancario')

const infoHoy = infoDiaBancario('2026-11-23')
assert.equal(infoHoy.esBancario, true)
assert.ok(infoHoy.motivo?.includes('Chiquinquirá'))
// La tasa efectiva BCV para el lunes bancario corresponde automáticamente al día siguiente (martes 24-11)
assert.equal(infoHoy.fechaEfectivaBcv, '2026-11-24', 'Debe tomar fecha del día martes 24-11-2026')
assert.equal(proximoDiaHabilBancario('2026-11-23'), '2026-11-24')

const resHoy = resolverDiaValorBcv('2026-11-23')
assert.equal(resHoy.esBancario, true)
assert.equal(resHoy.fechaValor, '2026-11-24')
assert.equal(resHoy.diaValorNombre, 'Martes')
assert.ok(resHoy.textoExplicativo.includes('Martes'))

// 2. Día de semana normal (Miércoles 25 de noviembre de 2026)
const infoMiercoles = infoDiaBancario('2026-11-25')
assert.equal(infoMiercoles.esBancario, false)
assert.equal(infoMiercoles.esFinDeSemana, false)
assert.equal(infoMiercoles.esFeriado, false)
assert.equal(infoMiercoles.fechaEfectivaBcv, '2026-11-25')

const resMiercoles = resolverDiaValorBcv('2026-11-25')
assert.equal(resMiercoles.esBancario, false)
assert.equal(resMiercoles.fechaValor, '2026-11-25')
assert.equal(resMiercoles.diaValorNombre, 'Miércoles')

// 3. Fines de semana saltan al próximo día hábil bancario
// Sábado 21-11-2026 salta a Martes 24-11-2026 (porque lunes 23 es bancario)
assert.equal(esFinDeSemana('2026-11-21'), true)
assert.equal(esDiaNoBancario('2026-11-21'), true)
assert.equal(siguienteDiaHabilBancario('2026-11-21'), '2026-11-24')

// Domingo 22-11-2026 salta a Martes 24-11-2026
assert.equal(esFinDeSemana('2026-11-22'), true)
assert.equal(siguienteDiaHabilBancario('2026-11-22'), '2026-11-24')

// 4. Feriados nacionales clave
assert.equal(esFeriadoBancario('2026-01-01'), true, 'Año Nuevo')
assert.equal(esFeriadoBancario('2026-05-01'), true, 'Día del Trabajador')
assert.equal(esFeriadoBancario('2026-12-25'), true, 'Navidad')

console.log('✓ Todas las pruebas de calendario bancario SUDEBAN pasaron limpias.')
