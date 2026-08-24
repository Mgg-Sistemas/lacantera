import type { Pestana } from '@/components/Pestanas'

/*
  LAS BARRAS DE PESTAÑAS DEL SISTEMA

  Viven aparte del componente y no junto a él por un motivo mecánico: un
  archivo que exporta un componente y además constantes rompe el refresco en
  caliente de Vite, que solo sabe reemplazar un módulo cuando todo lo que
  exporta son componentes. El lint lo avisa, y tiene razón.

  Que estén juntas tiene además una ventaja: se ve de un vistazo en qué se
  agrupó cada módulo, que es la decisión que de verdad importa aquí.
*/

/** Las tres miradas al mismo material. */
export const PESTANAS_MATERIAL: Pestana[] = [
  { etiqueta: 'Existencias', a: '/app/inventario/existencias' },
  { etiqueta: 'Catálogo', a: '/app/inventario/articulos' },
  { etiqueta: 'Movimientos', a: '/app/inventario/movimientos' },
]

/** Dónde se guarda: un taller es un almacén con máquinas dentro. */
export const PESTANAS_SITIOS: Pestana[] = [
  { etiqueta: 'Almacenes y patios', a: '/app/inventario/almacenes' },
  { etiqueta: 'Talleres', a: '/app/inventario/talleres' },
]

/** Quién trabaja aquí, y cuánto cobra su cargo. */
export const PESTANAS_PERSONAL: Pestana[] = [
  { etiqueta: 'Personal', a: '/app/nomina/personal' },
  { etiqueta: 'Tabulador de cargos', a: '/app/nomina/tabulador' },
]

/** El período, en el orden en que se hace. */
export const PESTANAS_PERIODO: Pestana[] = [
  { etiqueta: '1 · Novedades', a: '/app/nomina/asistencia' },
  { etiqueta: '2 · Procesar', a: '/app/nomina/procesos' },
  { etiqueta: '3 · Recibos', a: '/app/nomina/recibos' },
]

/** Lo que no cambia cada quincena. */
export const PESTANAS_REGLAS: Pestana[] = [
  { etiqueta: 'Prestaciones sociales', a: '/app/nomina/prestaciones' },
  { etiqueta: 'Parámetros de nómina', a: '/app/nomina/parametros' },
]

/** A quién se le compra, y qué papeles nos ha pasado. */
export const PESTANAS_PROVEEDORES: Pestana[] = [
  { etiqueta: 'Proveedores', a: '/app/compras/proveedores' },
  { etiqueta: 'Facturas recibidas', a: '/app/compras/facturas' },
]

/** Lo que se debe, por documento y agrupado por a quién. */
export const PESTANAS_DEUDAS: Pestana[] = [
  { etiqueta: 'Pagos por hacer', a: '/app/tesoreria/pagos' },
  { etiqueta: 'Por proveedor', a: '/app/tesoreria/por-pagar' },
]

/*
  Lo que dicen las compras cuando se miran juntas.

  El libro es una obligación fiscal —lo pide el SENIAT con ese formato— y el
  gasto por unidad es una pregunta de gerencia. Comparten pestaña porque las
  dos se responden con lo mismo: las compras del período, sumadas de otra
  manera.
*/
export const PESTANAS_ANALISIS: Pestana[] = [
  { etiqueta: 'Centro de costos', a: '/app/compras/centro-de-costos' },
  { etiqueta: 'Libro de compras', a: '/app/compras/libro' },
  { etiqueta: 'Gasto por unidad', a: '/app/compras/gasto' },
]
