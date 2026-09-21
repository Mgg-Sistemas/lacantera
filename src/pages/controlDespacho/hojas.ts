import { ROTULO_DEL_DOCUMENTO, type EstadoDeControl, type FilaDeControl, type FilaParaCargar } from '@/lib/api/controlDespacho'
import type { HojaXlsx } from '@/lib/xlsx'

/*
  LAS HOJAS DE EXCEL DEL CONTROL DE DESPACHO

  Dos que salen y una que entra:
  - LA PLANILLA, para mirarla o pasarla: lo que se ve, o lo que se marcó.
  - LA PLANTILLA DE CARGA: las mismas filas con su CLAVE, y las cinco columnas
    que se llenan a mano con la cabecera en otro color.
  - LA CARGA: la plantilla de vuelta, ya llena.

  LA CLAVE ES LO ÚNICO QUE ATA UNA FILA DE EXCEL A LA SUYA DEL SISTEMA. El
  número de nota no sirve: una nota con tres materiales son tres filas. Por eso
  la plantilla se baja de aquí y no se arma a mano.

  LO QUE SE SUBE ES CÓMO QUEDA LA FILA, no un parche: una celda vacía borra lo
  que había. Es lo que uno espera de una hoja —lo que veo es lo que queda—, y
  como la plantilla baja con lo que ya está escrito, nada se pierde por subirla
  tal cual. Una COLUMNA que falte entera sí se respeta: ese dato no se toca.

  Aquí no hay nada de pantalla: son funciones que reciben filas y devuelven
  filas, para poder probarlas sin navegador.
*/

const num = (v: number | string | null): number | null => (v === null || v === '' ? null : Number(v))

export function hojaDeLaPlanilla(filas: FilaDeControl[], columnaLibre: string): HojaXlsx {
  return {
    nombre: 'Control de despacho',
    columnas: [
      { titulo: '# NOTA', ancho: 16 },
      { titulo: 'FECHA', ancho: 12 },
      { titulo: 'CLIENTE', ancho: 34 },
      { titulo: 'RIF', ancho: 15 },
      { titulo: 'MATERIAL', ancho: 26 },
      { titulo: 'CANTIDAD', ancho: 12 },
      { titulo: 'UNIDAD', ancho: 9 },
      { titulo: 'PRECIO US$', ancho: 12 },
      { titulo: 'MONTO US$', ancho: 14 },
      { titulo: 'STATUS', ancho: 14 },
      { titulo: 'OBSERVACIONES', ancho: 34 },
      { titulo: columnaLibre.toUpperCase(), ancho: 18 },
      { titulo: 'DOCUMENTO', ancho: 22 },
    ],
    filas: filas.map((f) => [
      f.documento,
      f.fecha ?? '',
      f.cliente ?? '',
      f.rif ?? '',
      f.material ?? '',
      num(f.cantidad),
      f.unidad ?? '',
      num(f.precio),
      num(f.monto),
      f.estado_control_nombre ?? '',
      f.observacion ?? '',
      f.extra ?? '',
      ROTULO_DEL_DOCUMENTO[f.estado_doc],
    ]),
  }
}

/** Solo lo VIGENTE: lo anulado o interno no lleva precio ni status. */
export function plantillaDeCarga(filas: FilaDeControl[], columnaLibre: string): HojaXlsx {
  return {
    nombre: 'Carga de control de despacho',
    columnas: [
      { titulo: 'CLAVE', ancho: 11 },
      { titulo: '# NOTA', ancho: 16 },
      { titulo: 'FECHA', ancho: 12 },
      { titulo: 'CLIENTE', ancho: 34 },
      { titulo: 'MATERIAL', ancho: 26 },
      { titulo: 'CANTIDAD', ancho: 12 },
      { titulo: 'UNIDAD', ancho: 9 },
      { titulo: 'RIF', ancho: 15, realce: true },
      { titulo: 'PRECIO US$', ancho: 12, realce: true },
      { titulo: 'STATUS', ancho: 14, realce: true },
      { titulo: 'OBSERVACIONES', ancho: 34, realce: true },
      { titulo: columnaLibre.toUpperCase(), ancho: 18, realce: true },
    ],
    filas: filas
      .filter((f) => f.estado_doc === 'VIGENTE')
      .map((f) => [
        f.clave,
        f.documento,
        f.fecha ?? '',
        f.cliente ?? '',
        f.material ?? '',
        num(f.cantidad),
        f.unidad ?? '',
        f.rif ?? '',
        num(f.precio),
        f.estado_control_nombre ?? '',
        f.observacion ?? '',
        f.extra ?? '',
      ]),
  }
}

/* ─────────────────────────────────────────────────────────────── la carga */

export interface CambioDeCarga {
  fila: FilaDeControl
  /** Qué cambia, para enseñarlo antes de guardar: «precio 25,00 → 27,50». */
  resumen: string[]
  paraGuardar: FilaParaCargar
}

export interface CargaInterpretada {
  cambios: CambioDeCarga[]
  iguales: number
  errores: string[]
}

const sinAcentos = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()

/**
 * «25,5», «25.5», «1.944,00» y «1,944.00»: cuando hay punto y coma, el último
 * es el decimal; cuando hay solo uno, es el decimal. Excel manda «25.5».
 */
export function leerNumero(texto: string): number | null {
  let t = texto.replace(/[\s$]/g, '')
  if (t === '') return null
  const coma = t.lastIndexOf(',')
  const punto = t.lastIndexOf('.')
  if (coma >= 0 && punto >= 0) {
    t = coma > punto ? t.replaceAll('.', '').replace(',', '.') : t.replaceAll(',', '')
  } else if (coma >= 0) t = t.replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN
  // Seis decimales, que es lo que guarda la base: Excel a veces manda 30.750000000000004.
  return Math.round(Number(t) * 1e6) / 1e6
}

const dec2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ver = (v: string | number | null) => (v === null || v === '' ? 'vacío' : typeof v === 'number' ? dec2.format(v) : `«${v}»`)

export function interpretarCarga(
  celdas: string[][],
  filas: FilaDeControl[],
  estados: EstadoDeControl[],
  columnaLibre: string,
): CargaInterpretada {
  const errores: string[] = []
  const cabecera = (celdas[0] ?? []).map((c) => sinAcentos(String(c ?? '')))
  const col = (titulo: string) => cabecera.indexOf(sinAcentos(titulo))

  const cClave = col('CLAVE')
  if (cClave < 0) {
    return {
      cambios: [],
      iguales: 0,
      errores: ['La hoja no tiene la columna CLAVE. Baja la plantilla desde aquí y llena esa: la clave es lo que ata cada fila a la suya.'],
    }
  }
  const cRif = col('RIF')
  const cPrecio = [col('PRECIO US$'), col('PRECIO')].find((i) => i >= 0) ?? -1
  const cStatus = col('STATUS')
  const cObs = col('OBSERVACIONES')
  const cExtra = col(columnaLibre)
  if ([cRif, cPrecio, cStatus, cObs, cExtra].every((i) => i < 0)) {
    return { cambios: [], iguales: 0, errores: ['La hoja no trae ninguna de las columnas que se llenan: RIF, PRECIO US$, STATUS, OBSERVACIONES.'] }
  }

  const porClave = new Map(filas.map((f) => [f.clave, f]))
  const vistas = new Set<string>()
  const cambios: CambioDeCarga[] = []
  let iguales = 0

  celdas.slice(1).forEach((renglon, i) => {
    const donde = `Fila ${i + 2}`
    const celda = (c: number) => String(renglon[c] ?? '').trim()
    const clave = celda(cClave).toUpperCase()
    if (clave === '') return

    const fila = porClave.get(clave)
    if (!fila) {
      errores.push(`${donde}: la clave ${clave} no está entre las fechas que se ven en pantalla.`)
      return
    }
    if (fila.estado_doc !== 'VIGENTE') {
      errores.push(`${donde}: ${fila.documento} no es un despacho vigente y no se llena.`)
      return
    }
    if (vistas.has(clave)) {
      errores.push(`${donde}: la clave ${clave} está repetida en la hoja.`)
      return
    }
    vistas.add(clave)

    // Lo tecleado hoy en el sistema: lo que viene del cliente o de la nota no cuenta como tecleado.
    const rifHoy = fila.rif_del_cliente ? null : (fila.rif ?? null)
    const precioHoy = fila.precio_de_la_nota ? null : num(fila.precio)
    const resumen: string[] = []

    let rif = rifHoy
    if (cRif >= 0) {
      const t = celda(cRif).toUpperCase()
      // El RIF del cliente, devuelto tal cual, no se guarda como tecleado: si
      // mañana se corrige en la ficha del cliente, la planilla debe seguirlo.
      rif = t === '' || (fila.rif_del_cliente && t === fila.rif) ? null : t
      if (rif !== rifHoy) resumen.push(`RIF ${ver(rifHoy)} → ${ver(rif)}`)
    }

    let precio = precioHoy
    if (cPrecio >= 0) {
      const p = leerNumero(celda(cPrecio))
      if (p !== null && (Number.isNaN(p) || p < 0)) {
        errores.push(`${donde}: «${celda(cPrecio)}» no es un precio.`)
        return
      }
      precio = p !== null && fila.precio_de_la_nota && p === Number(fila.precio) ? null : p
      if (precio !== precioHoy) resumen.push(`precio ${ver(precioHoy)} → ${ver(precio)}`)
    }

    let estado = fila.estado_control
    if (cStatus >= 0) {
      const t = sinAcentos(celda(cStatus))
      if (t === '') estado = null
      else {
        const e = estados.find((x) => sinAcentos(x.nombre) === t || x.codigo === t)
        if (!e || (!e.activo && e.codigo !== fila.estado_control)) {
          errores.push(`${donde}: el status «${celda(cStatus)}» no está en la lista${e ? ' (está apagado)' : ''}.`)
          return
        }
        estado = e.codigo
      }
      if (estado !== fila.estado_control) {
        resumen.push(`status ${ver(fila.estado_control_nombre)} → ${ver(estados.find((x) => x.codigo === estado)?.nombre ?? null)}`)
      }
    }

    // La base guarda en mayúscula: se compara igual para no ver cambios donde no los hay.
    const texto = (c: number, hoy: string | null, rotulo: string): string | null => {
      if (c < 0) return hoy
      const t = celda(c).toUpperCase() || null
      if (t !== (hoy ?? null)) resumen.push(`${rotulo} ${ver(hoy)} → ${ver(t)}`)
      return t
    }
    const observacion = texto(cObs, fila.observacion, 'observaciones')
    const extra = texto(cExtra, fila.extra, columnaLibre.toLowerCase())

    if (resumen.length === 0) {
      iguales++
      return
    }
    cambios.push({
      fila,
      resumen,
      paraGuardar: {
        origen: fila.origen,
        id: (fila.origen === 'NOTA_ENTREGA' ? fila.renglon_id : fila.movimiento_id) as number,
        rif,
        precio,
        estado,
        observacion,
        extra,
      },
    })
  })

  return { cambios, iguales, errores }
}
