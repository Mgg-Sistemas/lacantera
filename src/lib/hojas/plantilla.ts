import { armarLibro, ESTILO } from '@/lib/hojas/escribirLibro'
import type { CeldaDeLibro } from '@/lib/hojas/escribirLibro'

/*
  LA PLANTILLA QUE SE REPARTE, PARA CUALQUIER CARGA

  Empezó siendo solo la de artículos. Cuando hicieron falta la de personal y la
  de proveedores, la elección era copiarla dos veces o describirla como datos.
  Copiar es como acaban divergiendo: alguien arregla algo en una y no en las
  otras dos, y la que se quedó atrás rompe en el Excel de la persona que menos
  sabe qué hacer con eso.

  POR QUÉ DEJÓ DE SER UN CSV

  Se repartía en CSV con punto y coma, dando por hecho que Excel en español lo
  entiende. El Excel de Christopher usa coma como separador de lista, así que
  le metió las doce columnas dentro de la celda A1. Una plantilla que hay que
  repartir a mano en columnas no es una plantilla.

  Y hacía falta una segunda hoja con las instrucciones —la leyenda vive en la
  pantalla, y quien llena el archivo lo hace con la pantalla cerrada—, y un CSV
  no tiene hojas.

  Ahora es un `.xlsx` de verdad, escrito sin librería: ver `escribirLibro.ts`.

  QUÉ LLEVA CADA HOJA

    Plantilla      El título de qué se está cargando, una línea que dice qué
                   hacer, la cabecera de columnas en el naranja de la casa, y
                   dos filas de ejemplo. Las columnas van anchas: una columna
                   de 8 caracteres con «CONSUMIBLE» dentro se lee «####».

    Instrucciones  Una fila por columna, con si es obligatoria, qué va ahí y
                   qué se admite. Es la misma leyenda de la pantalla, para
                   quien ya la cerró.
*/

export interface ColumnaPlantilla {
  columna: string
  obligatoria: boolean
  /** Qué va ahí, dicho para quien llena la planilla y no para quien programa. */
  dice: string
  /** Lo que aparece en la primera fila de ejemplo. */
  ejemplo?: string
  /** La segunda fila. Sirve para enseñar el caso distinto: lo que va vacío. */
  otro?: string
}

const celda = (texto: string, estilo?: number): CeldaDeLibro => ({ texto, estilo })

/**
 * El ancho de cada columna, en caracteres.
 *
 * Se calcula de lo que va a llevar —su nombre, su ejemplo— y no se deja fijo:
 * `codigo` necesita doce y `descripcion` treinta, y darles lo mismo a las dos
 * deja una a medias y la otra vacía.
 */
function anchoDe(c: ColumnaPlantilla): number {
  const largos = [c.columna.length, (c.ejemplo ?? '').length, (c.otro ?? '').length]
  return Math.min(38, Math.max(12, ...largos) + 3)
}

export function libroDePlantilla(
  queSeCarga: string,
  columnas: ColumnaPlantilla[],
): Blob {
  const obligatorias = columnas.filter((c) => c.obligatoria).map((c) => c.columna)

  return armarLibro([
    {
      nombre: 'Plantilla',
      anchos: columnas.map(anchoDe),
      filas: [
        [celda(`Carga de ${queSeCarga} — Minería Internacional TS`, ESTILO.titulo)],
        [
          celda(
            `Borra las dos filas de ejemplo y escribe las tuyas debajo de la cabecera. ` +
              `No cambies los nombres de las columnas. Obligatorias: ${obligatorias.join(', ')}.`,
            ESTILO.subtitulo,
          ),
        ],
        [],
        columnas.map((c) => celda(c.columna, ESTILO.cabecera)),
        columnas.map((c) => celda(c.ejemplo ?? '')),
        columnas.map((c) => celda(c.otro ?? '')),
      ],
    },
    {
      nombre: 'Instrucciones',
      anchos: [26, 14, 78],
      filas: [
        [celda(`Cómo se llena la plantilla de ${queSeCarga}`, ESTILO.titulo)],
        [
          celda(
            'Las columnas que no son obligatorias se pueden dejar vacías. Al subir el archivo, ' +
              'el sistema revisa fila por fila y dice qué va a pasar con cada una antes de escribir nada.',
            ESTILO.subtitulo,
          ),
        ],
        [],
        [
          celda('Columna', ESTILO.cabecera),
          celda('¿Obligatoria?', ESTILO.cabecera),
          celda('Qué va ahí', ESTILO.cabecera),
        ],
        ...columnas.map((c) => [
          celda(c.columna, ESTILO.etiqueta),
          celda(c.obligatoria ? 'Sí' : 'No', c.obligatoria ? ESTILO.obligatoria : undefined),
          celda(c.dice, ESTILO.parrafo),
        ]),
        [],
        [celda('Si una fila queda mal', ESTILO.etiqueta)],
        [
          celda(
            'No entra ninguna. Es a propósito: una carga a medias deja a nadie sabiendo qué quedó dentro, ' +
              'y el archivo ya no sirve para volver a intentarlo. El sistema dice el número de fila y el motivo, ' +
              'se corrige aquí y se sube otra vez.',
            ESTILO.parrafo,
          ),
        ],
      ],
    },
  ])
}

export function descargarPlantilla(
  nombreArchivo: string,
  queSeCarga: string,
  columnas: ColumnaPlantilla[],
): void {
  const url = URL.createObjectURL(libroDePlantilla(queSeCarga, columnas))
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Artículos
// ---------------------------------------------------------------------------

export const COLUMNAS_ARTICULOS: ColumnaPlantilla[] = [
  { columna: 'codigo', obligatoria: true, dice: 'El código con el que se pide. Si ya existe, la fila lo actualiza en vez de crearlo.', ejemplo: 'PRD-ARENA-L', otro: 'SRV-FLETE' },
  { columna: 'nombre', obligatoria: true, dice: 'Cómo se llama.', ejemplo: 'Arena lavada', otro: 'Flete por viaje' },
  { columna: 'descripcion', obligatoria: false, dice: 'Detalle. Si se deja vacía en un artículo que ya existe, se respeta la que tenía.', ejemplo: 'Granulometria fina, patio 1' },
  { columna: 'categoria', obligatoria: true, dice: 'PRODUCTO, REPUESTO, INSUMO, COMBUSTIBLE, LUBRICANTE, EPP, HERRAMIENTA, EXPLOSIVO o SERVICIO.', ejemplo: 'PRODUCTO', otro: 'SERVICIO' },
  { columna: 'unidad', obligatoria: true, dice: 'UND, M3, TON, KG, L, GAL, M, PAR, JGO, CAJA, SACO, ROLLO, HORA o SERV.', ejemplo: 'M3', otro: 'SERV' },
  { columna: 'inventariable', obligatoria: false, dice: 'SI o NO. Vacío es SI. Un SERVICIO tiene que ser NO.', ejemplo: 'SI', otro: 'NO' },
  { columna: 'modo_entrega', obligatoria: false, dice: 'Qué pasa al entregarlo: RETORNABLE vuelve, CONSUMIBLE se gasta, NO es que no se entrega a nadie. Vacío es CONSUMIBLE.', ejemplo: 'CONSUMIBLE', otro: 'NO' },
  { columna: 'stock_minimo', obligatoria: false, dice: 'A partir de cuánto avisa. Vacío es cero, que es no avisar.', ejemplo: '50' },
  { columna: 'densidad_ton_m3', obligatoria: false, dice: 'Toneladas por metro cúbico. Solo para lo que se pesa y se mide de las dos formas.', ejemplo: '1.6' },
  { columna: 'precio', obligatoria: false, dice: 'Precio de venta. Poner precio exige permiso de escritura en Ventas.', ejemplo: '18.50', otro: '40' },
  { columna: 'precio_minimo', obligatoria: false, dice: 'Lo más bajo que se puede vender. Vacío es cero: sin suelo.', ejemplo: '16' },
  { columna: 'moneda', obligatoria: false, dice: 'La moneda del precio. Vacío es USD.', ejemplo: 'USD', otro: 'USD' },
]

// ---------------------------------------------------------------------------
// Personal
// ---------------------------------------------------------------------------

export const COLUMNAS_PERSONAL: ColumnaPlantilla[] = [
  { columna: 'cedula', obligatoria: true, dice: 'Con la letra y el guion: V-12345678 o E-12345678. Es lo que decide si la fila crea a alguien o corrige su ficha.', ejemplo: 'V-12345678', otro: 'V-9876543' },
  { columna: 'nombres', obligatoria: true, dice: 'Como aparece en la cédula.', ejemplo: 'Juan Carlos', otro: 'Maria' },
  { columna: 'apellidos', obligatoria: true, dice: 'Como aparece en la cédula.', ejemplo: 'Perez Blanco', otro: 'Rojas' },
  { columna: 'cargo', obligatoria: true, dice: 'El cargo que ocupa. Si coincide con uno del tabulador, de ahí sale el sueldo.', ejemplo: 'OPERADOR EQUIPO PESADO', otro: 'ANALISTA ADMINISTRATIVO' },
  { columna: 'fecha_ingreso', obligatoria: true, dice: 'Cuándo entró, como 2026-01-15. De aquí salen la antigüedad y las prestaciones.', ejemplo: '2026-01-15', otro: '2025-06-01' },
  { columna: 'salario_base', obligatoria: false, dice: 'Lo que gana según su estipulación. Vacío es cero: se le pondrá desde el tabulador.', ejemplo: '350', otro: '500' },
  { columna: 'moneda_salario', obligatoria: false, dice: 'La moneda del sueldo. Vacío es VES.', ejemplo: 'USD', otro: 'USD' },
  { columna: 'base_estipulacion', obligatoria: false, dice: 'Si ese sueldo es MENSUAL, DIARIO o por HORA. Vacío es MENSUAL.', ejemplo: 'MENSUAL', otro: 'MENSUAL' },
  { columna: 'frecuencia', obligatoria: false, dice: 'Cada cuánto cobra: SEMANAL, QUINCENAL o MENSUAL. Vacío es QUINCENAL.', ejemplo: 'QUINCENAL', otro: 'QUINCENAL' },
  { columna: 'tipo_jornada', obligatoria: false, dice: 'DIURNA, NOCTURNA o MIXTA. Vacío es DIURNA.', ejemplo: 'DIURNA', otro: 'DIURNA' },
  { columna: 'departamento', obligatoria: false, dice: 'Dónde trabaja. Es lo que enlaza a la persona con el organigrama.', ejemplo: 'OPERACIONES', otro: 'ADMINISTRATIVO' },
  { columna: 'ficha', obligatoria: false, dice: 'El número de ficha. Si se deja vacío, el sistema pone el siguiente.', ejemplo: '' },
  { columna: 'telefono', obligatoria: false, dice: 'Para localizarlo.', ejemplo: '0414-1234567' },
  { columna: 'direccion', obligatoria: false, dice: 'Dónde vive.', ejemplo: 'Puerto Ordaz' },
  { columna: 'fecha_nacimiento', obligatoria: false, dice: 'Como 1990-03-22.', ejemplo: '1990-03-22' },
  { columna: 'genero', obligatoria: false, dice: 'MASCULINO o FEMENINO, o vacío.', ejemplo: 'MASCULINO', otro: 'FEMENINO' },
  { columna: 'estado_civil', obligatoria: false, dice: 'SOLTERO, CASADO, DIVORCIADO, VIUDO o CONCUBINATO.', ejemplo: 'SOLTERO' },
  { columna: 'nacionalidad', obligatoria: false, dice: 'Vacío se entiende venezolana.', ejemplo: '' },
  { columna: 'banco', obligatoria: false, dice: 'Dónde cobra. Se escribe como en el sistema: «0102 · BANCO DE VENEZUELA».', ejemplo: '0102 · BANCO DE VENEZUELA' },
  { columna: 'numero_cuenta', obligatoria: false, dice: 'Los veinte dígitos de la cuenta.', ejemplo: '01020000000000000000' },
]

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

export const COLUMNAS_PROVEEDORES: ColumnaPlantilla[] = [
  { columna: 'rif', obligatoria: true, dice: 'Con los dos guiones: J-12345678-9. Es lo que decide si la fila crea al proveedor o lo corrige.', ejemplo: 'J-12345678-9', otro: 'V-87654321-0' },
  { columna: 'nombre', obligatoria: true, dice: 'La razón social, como aparece en el RIF.', ejemplo: 'Ferreteria Industrial C.A.', otro: 'Jose Ramirez' },
  { columna: 'nombre_comercial', obligatoria: false, dice: 'Con qué nombre se le conoce, si es otro.', ejemplo: 'Ferreindustrial' },
  { columna: 'contacto', obligatoria: false, dice: 'Con quién se habla ahí.', ejemplo: 'Luis Marcano' },
  { columna: 'telefono', obligatoria: false, dice: 'Para llamarlo cuando el pedido se atrasa.', ejemplo: '0286-9515000', otro: '0414-1234567' },
  { columna: 'correo', obligatoria: false, dice: 'A dónde se le manda la orden de compra.', ejemplo: 'ventas@ferreindustrial.com' },
  { columna: 'direccion', obligatoria: false, dice: 'Dónde está. Va impresa en la orden de compra.', ejemplo: 'Puerto Ordaz, zona industrial' },
  { columna: 'condicion_pago', obligatoria: false, dice: 'CONTADO, CREDITO_15, CREDITO_30, CREDITO_60 o CONTRA_ENTREGA. Vacío es CONTADO.', ejemplo: 'CREDITO_30', otro: 'CONTADO' },
  { columna: 'moneda_preferida', obligatoria: false, dice: 'En qué suele cobrar. Vacío es USD.', ejemplo: 'USD', otro: 'VES' },
  { columna: 'contribuyente_especial', obligatoria: false, dice: 'SI o NO. Decide si hay que retenerle el IVA. Vacío es NO.', ejemplo: 'SI', otro: 'NO' },
  { columna: 'notas', obligatoria: false, dice: 'Lo que convenga recordar de él.', ejemplo: '' },
]
