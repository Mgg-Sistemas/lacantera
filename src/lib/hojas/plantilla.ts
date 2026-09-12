import { armarLibro, ESTILO, letraDeColumna } from '@/lib/hojas/escribirLibro'
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
  /**
   * Que esta columna lleva una fecha.
   *
   * NO es decoracion. Una fecha escrita en Excel NO se guarda como texto: se
   * guarda como el numero de dias desde 1900, y la hoja solo la enseña bonita.
   * Quien escribe 15/01/2026 en la casilla de `fecha_ingreso` manda «46037».
   *
   * Con esta marca, el lector la traduce antes de mandarla. Sin ella, la
   * planilla de personal —donde la fecha de ingreso es obligatoria— la rechaza
   * entera y quien la llena no entiende por que.
   */
  fecha?: boolean
  /**
   * Los valores admitidos, cuando son una lista cerrada.
   *
   * Christopher: «quien la use pueda alimentar el catálogo y existencias, por
   * tanto el campo de almacén necesitará ser una lista desplegable».
   *
   * Con esto la celda se convierte en un desplegable de Excel y deja de admitir
   * lo tecleado a mano. Es la diferencia entre escribir «almacen general» y
   * elegir «ALM-GEN»: la carga rechaza la fila entera por una tilde, y quien
   * llena la planilla lo hace con la pantalla cerrada, sin manera de saber cómo
   * se escribe.
   *
   * Las listas que la empresa puede cambiar —almacenes, unidades, monedas— no
   * se escriben aquí: se las pasa la pantalla desde la base, para que la
   * plantilla que se baja hoy traiga los almacenes de hoy.
   */
  opciones?: string[]
}

/** La fila donde empiezan los datos: título, línea de ayuda, hueco, cabecera. */
const PRIMERA_FILA_DE_DATOS = 5
/** Hasta dónde llega el desplegable. Nadie carga quinientos renglones a mano. */
const ULTIMA_FILA_CON_LISTA = 500

/** Lo que admite una casilla de sí o no en cualquier planilla. */
export const SI_NO = ['SI', 'NO']

/*
  LAS CATEGORIAS SON LAS DE LA BASE, Y FALTABA UNA.

  La planilla enumeraba nueve y el CHECK de `articulos.categoria` admite diez:
  faltaba EQUIPO, que es justo la de la laptop donada que trajo todo esto. Quien
  llenaba la planilla no tenia forma de saber que existia.

  Es una lista cerrada por CHECK y no una tabla, asi que se escribe aqui. Si
  algun dia se abre, esto pasa a leerse de la base como los almacenes.
*/
export const CATEGORIAS_DE_ARTICULO = [
  'PRODUCTO',
  'REPUESTO',
  'INSUMO',
  'COMBUSTIBLE',
  'LUBRICANTE',
  'EPP',
  'HERRAMIENTA',
  'EXPLOSIVO',
  'EQUIPO',
  'SERVICIO',
]

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

  /*
    LOS DESPLEGABLES VIVEN EN UNA HOJA ESCONDIDA.

    Excel admite la lista escrita a mano entre comillas, pero se corta a los 255
    caracteres y doce almacenes con su código ya los pasan. Apuntando a un rango
    de otra hoja no hay tope, y de paso la lista se puede leer entera si alguien
    necesita comprobarla.

    La hoja va oculta: existe para que los desplegables tengan de dónde leer, no
    para que nadie la edite. Visible, invita a que alguien borre una fila y deje
    media columna sin opciones.

    Una columna por cada campo con lista, en el mismo orden que en la plantilla.
  */
  const conLista = columnas
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c.opciones && x.c.opciones.length > 0)

  const hojaDeListas =
    conLista.length > 0
      ? [
          {
            nombre: 'Listas',
            oculta: true,
            anchos: conLista.map((x) => Math.min(38, Math.max(14, x.c.columna.length + 3))),
            filas: [
              conLista.map((x) => celda(x.c.columna, ESTILO.cabecera)),
              // Tantas filas como valores tenga la lista más larga.
              ...Array.from(
                { length: Math.max(...conLista.map((x) => x.c.opciones!.length)) },
                (_, f) => conLista.map((x) => celda(x.c.opciones![f] ?? '')),
              ),
            ],
          },
        ]
      : []

  const validaciones = conLista.map((x, orden) => {
    const col = letraDeColumna(orden)
    return {
      columna: x.i,
      desde: PRIMERA_FILA_DE_DATOS,
      hasta: ULTIMA_FILA_CON_LISTA,
      // Fila 1 es la cabecera de la hoja de listas; los valores empiezan en la 2.
      origen: `Listas!$${col}$2:$${col}$${x.c.opciones!.length + 1}`,
    }
  })

  return armarLibro([
    {
      nombre: 'Plantilla',
      anchos: columnas.map(anchoDe),
      validaciones,
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
    ...hojaDeListas,
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
  /*
    EL CODIGO DEJO DE SER OBLIGATORIO, Y EXIGIRLO ES DE DONDE VINO EL PROBLEMA.

    Once de los quince articulos del catalogo llevan el nombre metido en el
    campo del codigo —«ACEITE AGROFLUIDOS» es a la vez nombre y codigo— porque
    esta columna lo pedia y quien lleno la planilla no tenia ninguno que
    escribir. Un codigo que es el nombre no distingue nada: el indice unico deja
    pasar el mismo articulo dos veces con una letra de diferencia.

    Vacio, la base busca por el nombre; si no encuentra a nadie, pone un codigo
    con el prefijo de la categoria.
  */
  { columna: 'codigo', obligatoria: false, dice: 'El código con el que se pide. Si ya existe, la fila lo actualiza en vez de crearlo. Vacío, se busca por el nombre y, si es nuevo, la base le pone uno.', ejemplo: 'PRD-ARENA-L', otro: '' },
  { columna: 'nombre', obligatoria: true, dice: 'Cómo se llama.', ejemplo: 'Arena lavada', otro: 'Flete por viaje' },
  { columna: 'descripcion', obligatoria: false, dice: 'Detalle. Si se deja vacía en un artículo que ya existe, se respeta la que tenía.', ejemplo: 'Granulometria fina, patio 1' },
  { columna: 'categoria', obligatoria: true, dice: 'Elige una de la lista.', ejemplo: 'PRODUCTO', otro: 'SERVICIO', opciones: CATEGORIAS_DE_ARTICULO },
  { columna: 'unidad', obligatoria: true, dice: 'Con qué se mide. Elige una de la lista: sale de las unidades que la empresa tiene cargadas.', ejemplo: 'M3', otro: 'SERV' },
  { columna: 'inventariable', obligatoria: false, dice: 'SI o NO. En uno nuevo, vacío es SI; en uno que ya existe, vacío respeta lo que tenía. Un SERVICIO tiene que ser NO.', ejemplo: 'SI', otro: 'NO', opciones: SI_NO },
  { columna: 'modo_entrega', obligatoria: false, dice: 'Qué pasa al entregarlo: RETORNABLE vuelve, CONSUMIBLE se gasta, NO es que no se entrega a nadie. En uno nuevo, vacío es CONSUMIBLE; en uno que ya existe, vacío respeta lo que tenía.', ejemplo: 'CONSUMIBLE', otro: 'NO', opciones: ['RETORNABLE', 'CONSUMIBLE', 'NO'] },
  { columna: 'reparable', obligatoria: false, dice: 'SI o NO: si esto se puede mandar al taller y vuelve arreglado. Vacío se deduce de la categoría — un repuesto o una herramienta sí, lo demás no. En un artículo que ya existe, vacío respeta lo que tenía.', ejemplo: 'NO', otro: 'SI', opciones: SI_NO },
  { columna: 'stock_minimo', obligatoria: false, dice: 'A partir de cuánto avisa. En uno nuevo, vacío es cero —que es no avisar—; en uno que ya existe, vacío respeta lo que tenía.', ejemplo: '50' },
  { columna: 'densidad_ton_m3', obligatoria: false, dice: 'Toneladas por metro cúbico. Solo para lo que se pesa y se mide de las dos formas.', ejemplo: '1.6' },
  { columna: 'precio', obligatoria: false, dice: 'Precio de venta. Poner precio exige permiso de escritura en Ventas.', ejemplo: '18.50', otro: '40' },
  { columna: 'precio_minimo', obligatoria: false, dice: 'Lo más bajo que se puede vender. Vacío es cero: sin suelo.', ejemplo: '16' },
  { columna: 'moneda', obligatoria: false, dice: 'La moneda del precio y del costo. Vacío es USD.', ejemplo: 'USD', otro: 'USD' },

  /*
    LAS TRES DE LA EXISTENCIA

    Van juntas o no va ninguna: media fila —un almacén sin cantidad, una
    cantidad sin costo— casi siempre es una celda que se quedó sin llenar, y
    adivinar el resto sería meter existencia que nadie pidió.

    Y `costo` no es `precio`. El precio es a cuánto se le vende al cliente; el
    costo es cuánto vale lo que está en el almacén, y de ahí sale el costo
    promedio y lo que se va a cargar en cada salida futura. Confundirlos infla
    el inventario y encarece cada consumo, en silencio y para siempre. Por eso
    son dos columnas y el texto lo dice en las dos.
  */
  { columna: 'almacen', obligatoria: false, dice: 'Dónde está lo que hay. Se escribe el código o el nombre, como se lee en la pantalla de almacenes. Va con cantidad y costo: las tres o ninguna.', ejemplo: 'ALM-GEN', otro: '' },
  /*
    DE QUIÉN ES LO QUE ENTRA.

    Christopher: «debes considerar que ahora los ítems tienen dueño, esto también
    es una celda con lista desplegable».

    VACÍA NO ES «LA CANTERA»: es «el del almacén». La base ya resuelve esa parte
    —al entrar, el material es del dueño del sitio salvo que se diga— y repetir
    la regla aquí sería tener dos sitios opinando de lo mismo.

    Hace falta desde que el dueño viaja con el material: el inventario de la
    gobernación se está cargando renglón a renglón, y sus cosas pueden acabar en
    un almacén nuestro sin dejar de ser suyas.
  */
  { columna: 'propietario', obligatoria: false, dice: 'De quién es lo que entra. Vacío significa «del dueño del almacén», que es lo normal. Se llena cuando el material es de otro: cosas de la gobernación guardadas en un almacén nuestro.', ejemplo: '', otro: '' },
  { columna: 'cantidad', obligatoria: false, dice: 'Cuánto hay de esto en ese almacén. Entra como carga inicial, con su movimiento y su fecha.', ejemplo: '120', otro: '' },
  { columna: 'costo', obligatoria: false, dice: 'Cuánto vale la unidad de lo que entra. NO es el precio de venta: de este número salen el valor del inventario y lo que costará cada salida futura. Si nadie sabe cuánto costó, déjalo vacío y escribe SI en la siguiente.', ejemplo: '0.75', otro: '' },

  /*
    LO DONADO ENTRA SIN CIFRA, Y NO CON UN CERO.

    Christopher: «tenemos que considerar que puede ser una donación de otra
    empresa o entidad o fuente, así que por ello no tiene una factura o costo».
    El caso que lo trajo fue una laptop donada desde otra base: sin factura, sin
    precio aproximado, y sin haber salido del presupuesto de la cantera.

    Escribir cero ahí diría que no vale nada, y ese cero se promedia con lo que
    el artículo ya tenía y abarata cada salida futura, en silencio y para
    siempre. Marcando esta columna el renglón entra con el costo en nulo: el
    hueco se guarda como hueco, queda fuera del promedio por los dos lados, y se
    cuenta aparte para que una valoración a medias no se lea como completa.

    Va al final y vacía significa NO, que es lo que tiene que pasar: quien no
    sepa que existe sigue teniendo que escribir el costo.
  */
  { columna: 'sin_valorar', obligatoria: false, dice: 'SI cuando llegó sin saber cuánto costó: una donación, algo sin factura. Va con cantidad y con el costo VACÍO. Entra pendiente de valorar, y no se cuenta como si valiera cero. Vacío es NO.', ejemplo: '', otro: 'SI', opciones: SI_NO },
]

// ---------------------------------------------------------------------------
// Personal
// ---------------------------------------------------------------------------

export const COLUMNAS_PERSONAL: ColumnaPlantilla[] = [
  { columna: 'cedula', obligatoria: true, dice: 'Con la letra y el guion: V-12345678 o E-12345678. Es lo que decide si la fila crea a alguien o corrige su ficha.', ejemplo: 'V-12345678', otro: 'V-9876543' },
  { columna: 'nombres', obligatoria: true, dice: 'Como aparece en la cédula.', ejemplo: 'Juan Carlos', otro: 'Maria' },
  { columna: 'apellidos', obligatoria: true, dice: 'Como aparece en la cédula.', ejemplo: 'Perez Blanco', otro: 'Rojas' },
  { columna: 'cargo', obligatoria: true, dice: 'El cargo que ocupa. Si coincide con uno del tabulador, de ahí sale el sueldo.', ejemplo: 'OPERADOR EQUIPO PESADO', otro: 'ANALISTA ADMINISTRATIVO' },
  { columna: 'fecha_ingreso', obligatoria: true, fecha: true, dice: 'Cuándo entró: 15/01/2026 o 2026-01-15. De aquí salen la antigüedad y las prestaciones, así que revísala.', ejemplo: '2026-01-15', otro: '2025-06-01' },
  { columna: 'salario_base', obligatoria: false, dice: 'Lo que gana según su estipulación. En uno nuevo, vacío es cero y se le pone desde el tabulador; en uno que ya está cargado, vacío NO le toca el sueldo.', ejemplo: '350', otro: '500' },
  { columna: 'moneda_salario', obligatoria: false, dice: 'La moneda del sueldo. En uno nuevo, vacío es VES; en uno que ya está cargado, vacío respeta la que tenía.', ejemplo: 'USD', otro: 'USD' },
  { columna: 'base_estipulacion', obligatoria: false, dice: 'Si ese sueldo es MENSUAL, DIARIO o por HORA. En uno nuevo, vacío es MENSUAL; en uno que ya está cargado, vacío respeta lo que tenía.', ejemplo: 'MENSUAL', otro: 'MENSUAL' },
  { columna: 'frecuencia', obligatoria: false, dice: 'Cada cuánto cobra: SEMANAL, QUINCENAL o MENSUAL. En uno nuevo, vacío es QUINCENAL; en uno que ya está cargado, vacío respeta lo que tenía.', ejemplo: 'QUINCENAL', otro: 'QUINCENAL' },
  { columna: 'tipo_jornada', obligatoria: false, dice: 'DIURNA, NOCTURNA o MIXTA. En uno nuevo, vacío es DIURNA; en uno que ya está cargado, vacío respeta lo que tenía.', ejemplo: 'DIURNA', otro: 'DIURNA' },
  { columna: 'departamento', obligatoria: false, dice: 'Dónde trabaja. Es lo que enlaza a la persona con el organigrama.', ejemplo: 'OPERACIONES', otro: 'ADMINISTRATIVO' },
  { columna: 'ficha', obligatoria: false, dice: 'El número de ficha. Si se deja vacío, el sistema pone el siguiente.', ejemplo: '' },
  { columna: 'telefono', obligatoria: false, dice: 'Para localizarlo.', ejemplo: '0414-1234567' },
  { columna: 'direccion', obligatoria: false, dice: 'Dónde vive.', ejemplo: 'Puerto Ordaz' },
  { columna: 'fecha_nacimiento', obligatoria: false, fecha: true, dice: 'Como 22/03/1990 o 1990-03-22.', ejemplo: '1990-03-22' },
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
