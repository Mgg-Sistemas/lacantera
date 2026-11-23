import type { GuiaPasoAPaso } from './tipos'

export const GUIAS_PASO_A_PASO: GuiaPasoAPaso[] = [
  {
    id: 'guia-emitir-retencion-iva',
    titulo: 'Cómo emitir un comprobante de retención de IVA (R14)',
    area: 'COMPRAS_RETENCIONES',
    rolRequerido: 'Compras, Tesorería o Administrador',
    rutaMenu: 'Administración › Retenciones › «Facturas por retener»',
    rutaDirecta: '/app/retenciones',
    resumen:
      'Generación del comprobante oficial de 14 dígitos (formato AAAAMMSSSSSSSS) conforme a la Providencia SNAT/2026/00093 para compras respaldadas en factura fiscal.',
    pasos: [
      {
        numero: 1,
        titulo: 'Localizar la factura pendiente',
        detalle:
          'En la pestaña «Por realizar», identifique la compra por su número de orden o nombre del proveedor. Compruebe que el soporte sea FACTURA.',
        boton: 'Retener',
        ruta: '/app/retenciones',
      },
      {
        numero: 2,
        titulo: 'Verificar datos fiscales del proveedor',
        detalle:
          'El modal precargará RIF, N° Factura, N° de Control, base imponible e IVA causado. Si falta el correo fiscal o el domicilio, complételos.',
      },
      {
        numero: 3,
        titulo: 'Seleccionar alícuota y monto retenido',
        detalle:
          'Por defecto aplica el 75% del IVA causado (o 100% si el proveedor es contribuyente especial según consulta fiscal). El monto retenido y su equivalente en bolívares se calculan en vivo.',
      },
      {
        numero: 4,
        titulo: 'Emitir comprobante legal',
        detalle:
          'Pulse el botón «Emitir comprobante R14». El sistema genera el correlativo único de 14 dígitos y registra la retención en el libro fiscal.',
        boton: 'Emitir comprobante R14',
      },
    ],
    resultado:
      'El comprobante queda asentado en el Libro de Retenciones con estado REGISTRADA y el botón de descarga en PDF disponible para entregar al proveedor.',
    revertir:
      'Si se emitió con datos erróneos, abra la pestaña «Libro fiscal», localice el comprobante y pulse el icono rojo de basurero para anularlo indicando el motivo formal. El número correlativo queda anulado e inhabilitado.',
    palabrasClave: ['retencion', 'iva', 'r14', 'seniat', 'comprobante', 'factura', 'alicuota', '75%'],
  },
  {
    id: 'guia-gestionar-reintegro-postpago',
    titulo: 'Cómo gestionar y cobrar un reintegro diferido de proveedor',
    area: 'COMPRAS_RETENCIONES',
    rolRequerido: 'Compras, Tesorería o Administrador',
    rutaMenu: 'Administración › Retenciones › «Reintegros pendientes»',
    rutaDirecta: '/app/retenciones?tab=reintegros',
    resumen:
      'Procedimiento para recuperar el monto retenido a una orden de compra que ya había sido cancelada al 100% al proveedor.',
    pasos: [
      {
        numero: 1,
        titulo: 'Entregar comprobante al proveedor',
        detalle:
          'Descargue el comprobante PDF de retención y remítalo a la administración del proveedor para que procesen la devolución bancaria.',
        boton: 'Descargar PDF',
      },
      {
        numero: 2,
        titulo: 'Monitorear los días en espera',
        detalle:
          'El sistema muestra un contador automático de días transcurridos desde la emisión. Contacte al proveedor usando el teléfono y correo que figuran en la fila.',
      },
      {
        numero: 3,
        titulo: 'Confirmar el ingreso en cuenta',
        detalle:
          'Una vez que el proveedor envíe el comprobante de transferencia o pago móvil, diríjase a la fila y pulse «Registrar reintegro».',
        boton: 'Registrar reintegro',
      },
      {
        numero: 4,
        titulo: 'Asentar en Tesorería',
        detalle:
          'Seleccione la cuenta bancaria de la empresa que recibió los fondos, ingrese el número de referencia y confirme el monto recibido.',
        boton: 'Asentar ingreso en tesorería',
      },
    ],
    resultado:
      'El reintegro pasa a estado COBRADO, se archiva de la lista de pendientes y los fondos quedan reflejados en el saldo de la cuenta de tesorería seleccionada.',
    revertir:
      'Si asentó el reintegro en una cuenta bancaria equivocada, diríjase a Tesorería para registrar el traspaso interno entre cuentas con la misma referencia.',
    palabrasClave: ['reintegro', 'devolucion', 'postpago', 'proveedor', 'espera', 'tesoreria', 'banco'],
  },
  {
    id: 'guia-exportar-txt-seniat',
    titulo: 'Cómo generar y exportar el TXT oficial para el SENIAT',
    area: 'COMPRAS_RETENCIONES',
    rolRequerido: 'Administración o Auditoría Fiscal',
    rutaMenu: 'Administración › Retenciones › «Reportes y SENIAT (TXT)»',
    rutaDirecta: '/app/retenciones?tab=reportes',
    resumen:
      'Generación del archivo de 16 campos separados por tabuladores reglamentarios para cargar en el portal fiscal del SENIAT.',
    pasos: [
      {
        numero: 1,
        titulo: 'Definir el período fiscal',
        detalle:
          'Ingrese los 6 dígitos del período a declarar en formato AAAAMM (por ejemplo, «202611» para noviembre de 2026).',
      },
      {
        numero: 2,
        titulo: 'Comprobar el resumen consolidado',
        detalle:
          'Revise que la cantidad de comprobantes emitidos, el monto total retenido en bolívares y el equivalente en divisas coincidan con su contabilidad quincenal.',
      },
      {
        numero: 3,
        titulo: 'Descargar archivo TXT',
        detalle:
          'Pulse «Descargar TXT SENIAT». El navegador guardará el archivo nombrado con el RIF de la empresa y el período (ej. «J-123456789_202611_IVA.txt»).',
        boton: 'Descargar TXT SENIAT',
      },
      {
        numero: 4,
        titulo: 'Cargar en el portal del SENIAT',
        detalle:
          'Ingrese a seniat.gob.ve › Contribuyentes Especiales › Retenciones de IVA › Carga de Archivo y seleccione el archivo generado.',
      },
    ],
    resultado:
      'Archivo plano 100% conforme con las 16 columnas requeridas por la normativa tributaria venezolana.',
    revertir:
      'Si el portal del SENIAT reporta inconsistencia en algún RIF, corrija los datos del proveedor en el módulo de Compras y vuelva a generar el TXT.',
    palabrasClave: ['txt', 'seniat', 'declaracion', 'quincenal', 'exportar', '16 columnas', 'iva'],
  },
  {
    id: 'guia-despachar-cotizacion',
    titulo: 'Cómo despachar una cotización de venta a báscula o facturación',
    area: 'FACTURACION_VENTAS',
    rolRequerido: 'Ventas, Facturación o Administrador',
    rutaMenu: 'Ventas › Cotizaciones',
    rutaDirecta: '/app/ventas/cotizaciones',
    resumen:
      'Envío formal de una cotización aprobada hacia el área de despacho/romana, dejando el registro listo para completar los datos reales de carga.',
    pasos: [
      {
        numero: 1,
        titulo: 'Ubicar la cotización aprobada',
        detalle:
          'Filtre la lista por cliente o fecha. Asegúrese de que la cotización esté en estado APROBADA y con los precios acordados vigentes.',
      },
      {
        numero: 2,
        titulo: 'Solicitar despacho',
        detalle:
          'Abra el menú de acciones de la fila y pulse «Despachar esta cotización». Confirme el almacén o planta de retiro.',
        boton: 'Despachar esta cotización',
      },
      {
        numero: 3,
        titulo: 'Completar datos en Facturación / Romana',
        detalle:
          'El despacho queda en estado «Por completar». Cuando el camión cargue en patio, el operador pulsa «Completar datos» para asentar el tonelaje de báscula, chofer y placa.',
        boton: 'Completar datos',
      },
    ],
    resultado:
      'Se genera la Nota de Entrega asociada a la cotización y se descuentan las existencias del material vendido.',
    revertir:
      'Si el cliente canceló el pedido antes de cargar, un usuario con permisos de Facturación puede anular el despacho pendiente desde la lista de notas de entrega.',
    palabrasClave: ['cotizacion', 'despacho', 'completar', 'romana', 'venta', 'nota de entrega'],
  },
  {
    id: 'guia-formato-salida-autorizada',
    titulo: 'Cómo generar el Formato de Salida Autorizada con anexo fotográfico',
    area: 'ROMANA_DESPACHOS',
    rolRequerido: 'Romana, Seguridad de Planta o Administrador',
    rutaMenu: 'Operaciones › Salidas › Solicitudes',
    rutaDirecta: '/app/salidas',
    resumen:
      'Emisión del documento de control para camiones y materiales que abandonan las instalaciones de la cantera.',
    pasos: [
      {
        numero: 1,
        titulo: 'Seleccionar la salida verificada',
        detalle:
          'En la pestaña de Salidas del día, ubique el registro correspondiente al vehículo pesado en puerta.',
      },
      {
        numero: 2,
        titulo: 'Cargar anexo fotográfico',
        detalle:
          'Presione «Formato de salida autorizada». Adjunte las fotografías del camión con carga visible y el precinto de seguridad.',
        boton: 'Formato de salida autorizada',
      },
      {
        numero: 3,
        titulo: 'Validar firmas requeridas',
        detalle:
          'El formato incluye los casilleros de firma digitalizada del despachador, conductor y vigilante de turno.',
      },
      {
        numero: 4,
        titulo: 'Imprimir o enviar PDF',
        detalle:
          'Genere el PDF de salida autorizada. El sistema omite automáticamente cualquier tabla o casillero que no haya sido completado.',
        boton: 'Generar PDF',
      },
    ],
    resultado:
      'El camión queda habilitado para traspasar la garita de seguridad con respaldo físico y digital.',
    revertir:
      'Las salidas autorizadas quedan grabadas en auditoría. Si hubo error en placa o chofer, emita una aclaratoria firmada por el jefe de romana.',
    palabrasClave: ['salida', 'formato', 'anexo fotografico', 'camion', 'garita', 'seguridad', 'romana'],
  },
  {
    id: 'guia-carga-masiva-banco-tesoro',
    titulo: 'Cómo procesar el pago masivo de nómina (Banco del Tesoro 0163)',
    area: 'NOMINA_PERSONAL',
    rolRequerido: 'Nómina, Recursos Humanos o Gerencia',
    rutaMenu: 'Administración › Nómina › Procesos',
    rutaDirecta: '/app/nomina/procesos',
    resumen:
      'Generación y validación del archivo de dispersión bancaria para transferencias masivas a cuentas del Banco del Tesoro.',
    pasos: [
      {
        numero: 1,
        titulo: 'Cerrar período de nómina',
        detalle:
          'Verifique que todas las asistencias, horas extras y deducciones de la quincena estén computadas y la prenómina esté aprobada.',
      },
      {
        numero: 2,
        titulo: 'Abrir conciliador bancario',
        detalle:
          'En la barra superior de Nómina, pulse «Pago bancario masivo». Seleccione la plantilla Banco del Tesoro (0163).',
        boton: 'Pago bancario masivo',
      },
      {
        numero: 3,
        titulo: 'Validar las 44 columnas reglamentarias',
        detalle:
          'El sistema revisa que no haya cédulas repetidas, cuentas incompletas (deben ser 20 dígitos comenzando por 0163) ni montos negativos.',
      },
      {
        numero: 4,
        titulo: 'Descargar archivo TXT / Excel',
        detalle:
          'Descargue el archivo de texto estructurado y súbalo a la plataforma Tesoro en Línea para aplicar los pagos.',
        boton: 'Descargar archivo bancario',
      },
    ],
    resultado:
      'El período de nómina pasa a estado PAGADO y los recibos quedan disponibles para firma de los trabajadores.',
    revertir:
      'Si el banco rechaza alguna cuenta, el sistema permite descargar el reporte de inconsistencias para corregir la ficha del trabajador y reintentar solo los fallidos.',
    palabrasClave: ['nomina', 'banco del tesoro', '0163', 'carga masiva', 'pago', 'dispersion', 'quincena'],
  },
  {
    id: 'guia-feriado-bancario-tasa-bcv',
    titulo: 'Cómo consultar y aplicar la tasa BCV en feriados bancarios SUDEBAN',
    area: 'TESORERIA_TASAS',
    rolRequerido: 'Cualquier usuario con acceso a montos',
    rutaMenu: 'Barra superior (Topbar) › Pastilla de Tasa BCV',
    rutaDirecta: '/app/tasas',
    resumen:
      'Comportamiento automático del sistema ante lunes bancarios y feriados nacionales según el calendario oficial de SUDEBAN.',
    pasos: [
      {
        numero: 1,
        titulo: 'Identificar la pastilla en cabecera',
        detalle:
          'En días feriados, la pastilla superior indica «Tasa BCV · feriado (fecha anterior)». Esto no es un error: indica que el sistema opera con la tasa oficial protegida.',
      },
      {
        numero: 2,
        titulo: 'Detección de tasa anticipada',
        detalle:
          'Si el BCV ya publicó en la tarde previa la tasa con fecha efectiva del siguiente día hábil, el sistema la toma automáticamente sin generar alertas de desfase.',
      },
      {
        numero: 3,
        titulo: 'Registro manual de contingencia',
        detalle:
          'Si el servicio web del BCV se encuentra inaccesible, el administrador puede entrar a «Tasas de cambio» y pulsar «Registrar tasa» para asentar la cotización manual.',
        boton: 'Registrar tasa',
        ruta: '/app/tasas',
      },
    ],
    resultado:
      'Todas las conversiones de facturas, cotizaciones y retenciones utilizan la tasa oficial correspondiente sin frenar la facturación.',
    revertir:
      'Las tasas ya registradas con operaciones atadas no se pueden eliminar para proteger la integridad de los libros fiscales.',
    palabrasClave: ['tasa', 'bcv', 'feriado', 'sudeban', 'dolar', 'bolivares', 'cambio'],
  },
]
