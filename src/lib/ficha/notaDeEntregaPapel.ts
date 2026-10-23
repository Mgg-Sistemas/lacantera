import { densidadesDeArticulos } from '@/lib/api/catalogo'
import { empresaDelPapel, type useEmpresa } from '@/lib/api/empresa'
import type { Cliente, NotaEntrega, RenglonGuardado } from '@/lib/api/ventas'
import { enteros } from '@/lib/formato'
import { conversionDeRenglon } from '@/pages/ventas/filas'
import { armarDocumento, armarVariosDocumentos, type DatosDocumento } from './ventaPdf'
import type { EmpresaPapel } from './papel'

/*
  EL PAPEL DE LA NOTA DE ENTREGA, EN UN SOLO SITIO.

  Lo imprimen dos pantallas: Facturación › Notas de entrega, de siempre, y desde
  el 21/09/2026 también Salidas, cuando una nota de salida dejó su nota de
  entrega de respaldo (Christopher: «a nivel de sistema se pueden imprimir las
  dos en cualquier momento»). Es el mismo papel, así que se arma aquí y no dos
  veces.

  La que todavía no tiene cliente o precios sale con el sello PENDIENTE: se
  puede archivar, pero nadie la confunde con una nota terminada.
*/

/** Los datos de una nota, listos para `armarDocumento` — sin construir el PDF todavía. */
function datosDeNota(
  n: NotaEntrega,
  renglones: RenglonGuardado[],
  cliente: Pick<Cliente, 'direccion' | 'telefono'> | null,
  densidadDe: (r: RenglonGuardado) => string | null | undefined,
  empresa: EmpresaPapel,
  emitidoPor: string,
): DatosDocumento {
  return {
    tipo: 'NOTA',
    numero: n.numero,
    fecha: n.fecha,
    contraparte: {
      nombre: n.cliente ?? 'CLIENTE POR CONCRETAR',
      rif: n.cliente_rif ?? '',
      direccion: cliente?.direccion ?? null,
      // El hueco del teléfono existía en el papel desde el primer día y nadie
      // lo llenaba: salía «TELÉFONO —» en todas las notas y todas las
      // cotizaciones. El dato está aquí mismo, en la lista de clientes.
      telefono: cliente?.telefono ?? null,
    },
    despacho: {
      vehiculo: n.vehiculo,
      chofer: n.chofer,
      cedulaChofer: n.cedula_chofer,
      ticket: n.ticket_romana,
      pesoNeto: n.peso_neto ? `${enteros(n.peso_neto)} kg` : null,
      // Los de la tabla de camiones, cuando los hay: mandan sobre el de arriba.
      camiones: (n.camiones ?? []).map((c) => ({
        vehiculo: c.vehiculo,
        chofer: c.chofer,
        cedulaChofer: c.cedula_chofer,
        ticket: c.ticket,
        pesoNeto: c.peso_neto ? `${enteros(c.peso_neto)} kg` : null,
      })),
    },
    moneda: n.moneda,
    tasa: n.tasa,
    tasaUsd: n.tasa_usd,
    renglones: renglones.map((r) => ({
      descripcion: r.descripcion,
      // Sin línea de detalle: la nota no lleva más notas que el total.
      detalle: null,
      cantidad: r.cantidad,
      unidad: r.unidad,
      conversion: conversionDeRenglon(r, densidadDe(r)),
      precio_unitario: r.precio_unitario,
      subtotal: r.subtotal,
      exento_iva: r.exento_iva,
    })),
    notaConversion: null,
    subtotal: n.subtotal,
    descuento: n.descuento,
    flete: n.flete,
    baseImponible: n.base_imponible,
    iva: n.iva,
    alicuotaIva: n.alicuota_iva,
    total: n.total,
    observacion: n.observacion,
    sello: n.estado === 'ANULADA' ? 'ANULADA' : n.estado === 'PENDIENTE' ? 'PENDIENTE' : null,
    empresa,
    emitidoPor,
  }
}

export async function armarNotaDeEntrega(d: {
  nota: NotaEntrega
  renglones: RenglonGuardado[]
  cliente: Pick<Cliente, 'direccion' | 'telefono'> | null
  empresa: ReturnType<typeof useEmpresa>['data']
  emitidoPor: string
}) {
  const { nota: n, renglones } = d
  const densidades = await densidadesDeArticulos({ ids: renglones.map((r) => r.articulo_id) })
  const densidadDe = (r: RenglonGuardado) =>
    densidades.find((a) => a.id === r.articulo_id)?.densidad_ton_m3

  return armarDocumento(
    datosDeNota(n, renglones, d.cliente, densidadDe, empresaDelPapel(d.empresa), d.emitidoPor),
  )
}

/**
 * Varias notas de entrega en un solo PDF, cada una completa —con su propia
 * hoja o sus propias hojas, si le hacen falta—, tal como sale al pedirla sola.
 *
 * Nace el 23/10/2026: «Imprimir notas» en Notas de entrega arma esto con lo
 * que está filtrado en pantalla, sin un tope de cuántas: Christopher pidió
 * que el propio filtro de categoría (Estado, fechas…) se encargue de acotar
 * cuántas entran, no un límite escrito aquí.
 */
export async function armarNotasDeEntrega(d: {
  notas: NotaEntrega[]
  renglonesPorNota: Map<number, RenglonGuardado[]>
  clientePorId: Map<number, Pick<Cliente, 'direccion' | 'telefono'>>
  empresa: ReturnType<typeof useEmpresa>['data']
  emitidoPor: string
}) {
  const todosLosIds = [...d.renglonesPorNota.values()].flat().map((r) => r.articulo_id)
  const densidades = await densidadesDeArticulos({ ids: todosLosIds })
  const densidadDe = (r: RenglonGuardado) =>
    densidades.find((a) => a.id === r.articulo_id)?.densidad_ton_m3
  const empresaPapel = empresaDelPapel(d.empresa)

  const lista = d.notas.map((n) =>
    datosDeNota(
      n,
      d.renglonesPorNota.get(n.id) ?? [],
      d.clientePorId.get(n.cliente_id ?? -1) ?? null,
      densidadDe,
      empresaPapel,
      d.emitidoPor,
    ),
  )

  return armarVariosDocumentos(lista, {
    titulo: `Notas de entrega (${d.notas.length})`,
    archivo: `notas-de-entrega-${d.notas.length}.pdf`,
  })
}
