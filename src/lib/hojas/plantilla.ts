/*
  LA PLANTILLA QUE SE REPARTE, PARA CUALQUIER CARGA

  Empezó siendo solo la de artículos. Cuando hicieron falta la de personal y la
  de proveedores, la elección era copiarla dos veces o describirla como datos.
  Copiarla es como acaban divergiendo: alguien arregla el separador en una y no
  en las otras dos, y la que se quedó atrás rompe en el Excel de la persona que
  menos sabe qué hacer con eso.

  Se entrega en CSV y no en `.xlsx` a propósito: Excel lo abre de un doble clic
  y escribirlo no obliga a arrastrar media librería al paquete. Quien luego lo
  guarde como `.xlsx` tampoco tiene problema — `leerHoja` sabe leer los dos.

  Va con punto y coma y con BOM. Sin el BOM, Excel en Windows abre el archivo
  en la codificación del sistema y las tildes salen rotas; con punto y coma,
  Excel en español reparte las columnas solo en vez de meterlo todo en la A.

  Las dos filas de ejemplo no son adorno: enseñan de un vistazo cómo se escribe
  un número, qué se pone en una columna que se deja vacía, y qué palabras
  admite cada catálogo. Se borran y se escriben los propios encima.
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

/** Un campo con separador, comillas o salto dentro va entrecomillado. */
function escapar(valor: string): string {
  return /[;"\n\r]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
}

export function plantillaCsv(columnas: ColumnaPlantilla[]): string {
  const lineas = [
    columnas.map((c) => c.columna).join(';'),
    columnas.map((c) => escapar(c.ejemplo ?? '')).join(';'),
    columnas.map((c) => escapar(c.otro ?? '')).join(';'),
  ]
  // El BOM va delante, o Excel en Windows rompe las tildes.
  return '﻿' + lineas.join('\r\n') + '\r\n'
}

export function descargarPlantilla(nombreArchivo: string, columnas: ColumnaPlantilla[]): void {
  const blob = new Blob([plantillaCsv(columnas)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
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
