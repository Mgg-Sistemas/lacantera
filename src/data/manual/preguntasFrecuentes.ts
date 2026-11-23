import type { PreguntaFrecuente } from './tipos'

export const PREGUNTAS_FRECUENTES: PreguntaFrecuente[] = [
  {
    id: 'qa-retencion-post-pago',
    pregunta: '¿Qué hago si una compra ya se pagó y después me piden el comprobante de retención?',
    area: 'COMPRAS_RETENCIONES',
    respuestaCorta:
      'Emita la retención con normalidad. El sistema detecta automáticamente que la compra ya fue pagada al 100% y la coloca en «Reintegros pendientes» para rastrear la devolución de los fondos.',
    causaRaiz:
      'Ocurre cuando el pago se liquidó íntegramente al proveedor sin deducir el porcentaje tributario previo. Como el impuesto debe enterarse obligatoriamente al SENIAT, el proveedor tiene la obligación legal de reintegrar ese monto a la empresa.',
    accionSolucion:
      '1. Vaya a Administración › Retenciones › «Facturas por retener» y emita el comprobante R14.\n2. El sistema lo marcará como «Reintegro pendiente» y comenzará a contar los días en espera.\n3. Entregue el comprobante PDF al proveedor.\n4. Cuando el proveedor transfiera el dinero, vaya a «Reintegros pendientes» y pulse «Registrar reintegro» indicando la cuenta de tesorería donde ingresó el dinero.',
    rutaRecomendada: '/app/retenciones?tab=reintegros',
    textoRuta: 'Ver reintegros pendientes',
    palabrasClave: ['reintegro', 'ya pagada', 'postpago', 'retencion', 'devolucion', 'proveedor'],
  },
  {
    id: 'qa-retencion-nota-entrega',
    pregunta: '¿Por qué el sistema no me deja emitir retención sobre una Nota de Entrega?',
    area: 'COMPRAS_RETENCIONES',
    respuestaCorta:
      'Las retenciones fiscales de IVA e ISLR aplican exclusivamente a FACTURAS legales. Las notas de entrega no causan retención tributaria ante el SENIAT.',
    causaRaiz:
      'La Providencia SNAT/2026/00093 (G.O. 43.484) y la Ley del IVA establecen taxativamente que los agentes de retención solo practican retención sobre documentos con número de control y factura fiscal formal. Retener sobre una nota de entrega generaría un archivo TXT rechazado por el portal del SENIAT.',
    accionSolucion:
      '1. Si el proveedor debe emitir factura, solicítele la factura fiscal con su número de control.\n2. Al recibirla, edite la orden de compra o el registro del documento cambiando el tipo de comprobante de NOTA_ENTREGA a FACTURA.\n3. Una vez guardado como Factura, aparecerá de inmediato en la cola de retenciones.',
    rutaRecomendada: '/app/compras',
    textoRuta: 'Ir a Compras',
    palabrasClave: ['nota de entrega', 'factura', 'seniat', 'bloqueo', 'gaceta', '43.484'],
  },
  {
    id: 'qa-tasa-lunes-bancario',
    pregunta: '¿Por qué hoy no hay tasa BCV del día si es lunes o feriado bancario?',
    area: 'TESORERIA_TASAS',
    respuestaCorta:
      'En feriados bancarios de la SUDEBAN y fines de semana, el BCV no emite rueda cambiaria. El sistema toma automáticamente la tasa anticipada publicada para el siguiente día hábil o mantiene la tasa vigente oficial.',
    causaRaiz:
      'El calendario oficial de feriados bancarios de la SUDEBAN (incluyendo San José, Corpus Christi, Día de la Chiquinquirá, etc.) suspende las mesas de dinero. Por normativa del BCV, la última tasa fijada rige durante todo el período no hábil.',
    accionSolucion:
      'El sistema está programado con el calendario oficial de SUDEBAN. No se requiere ninguna acción manual. En la barra superior verá la pastilla indicando «feriado» y el sistema operará con total normalidad para conversiones y cálculos.',
    rutaRecomendada: '/app/tasas',
    textoRuta: 'Consultar Tasas de Cambio',
    palabrasClave: ['feriado', 'sudeban', 'lunes bancario', 'tasa', 'bcv', 'festivo'],
  },
  {
    id: 'qa-anular-comprobante-r14',
    pregunta: '¿Puedo reutilizar el número de un comprobante de retención anulado?',
    area: 'COMPRAS_RETENCIONES',
    respuestaCorta:
      'No. El número correlativo de 14 dígitos (R14) es de asignación estricta y única. Al anular un comprobante, ese correlativo se quema y se conserva en el historial con el motivo registrado.',
    causaRaiz:
      'El Artículo 18 de la G.O. 43.484 exige que la numeración sea consecutiva e ininterrumpida. Si se reutilizara un número, el portal del SENIAT rechazaría la declaración por duplicidad de correlativo.',
    accionSolucion:
      'Si un comprobante fue emitido con errores materiales:\n1. Vaya a «Libro fiscal» y pulse «Anular» ingresando la justificación.\n2. Emita un nuevo comprobante para la factura; el sistema le asignará el siguiente correlativo libre.\n3. Ambos números constarán en el libro para tranquilidad de cualquier auditoría fiscal.',
    rutaRecomendada: '/app/retenciones?tab=libro',
    textoRuta: 'Abrir Libro Fiscal',
    palabrasClave: ['anular', 'reutilizar', 'correlativo', 'r14', 'seniat', 'auditoria'],
  },
  {
    id: 'qa-despacho-por-completar',
    pregunta: '¿Por qué una cotización despachada queda en estado «Por completar» en Facturación?',
    area: 'FACTURACION_VENTAS',
    respuestaCorta:
      'Porque una cotización solo estima lo que el cliente desea comprar; el despacho real depende de las toneladas exactas pesadas en la báscula de romana.',
    causaRaiz:
      'En cantera, un camión puede pedir 15 toneladas de piedra pero cargar 15.42 tn según la báscula. Si el sistema facturara a ciegas la cotización, se generarían descuadres inmediatos de existencias y dinero.',
    accionSolucion:
      'Cuando el camión pasa por romana:\n1. El operador ingresa a Facturación › Notas de Entrega.\n2. Pulsa «Completar datos» en el despacho pendiente.\n3. Registra el peso bruto, la tara, el chofer y la placa.\n4. Al guardar, se asienta la Nota de Entrega con la cifra real y se descuenta el inventario.',
    rutaRecomendada: '/app/facturacion/notas',
    textoRuta: 'Ver Notas de Entrega',
    palabrasClave: ['cotizacion', 'por completar', 'bascula', 'romana', 'peso', 'toneladas'],
  },
  {
    id: 'qa-surtir-maquina-inactiva',
    pregunta: '¿Por qué no puedo surtir combustible a un equipo que está en la mina?',
    area: 'COMBUSTIBLE_MAQUINAS',
    respuestaCorta:
      'El surtidor de combustible solo admite despachar a equipos marcados como OPERATIVOS. Los equipos en taller, dados de baja o en mantenimiento no pueden recibir combustible directo.',
    causaRaiz:
      'Regla de control interno para prevenir desvío o fugas de diésel cargado a maquinarias paradas.',
    accionSolucion:
      '1. Verifique en Maquinaria el estado del equipo.\n2. Si la máquina fue reparada y reincorporada al frente de trabajo, el jefe de taller debe cambiar su estatus a «Operativa».\n3. Si el combustible se usó para una planta auxiliar o transporte externo, regístrelo bajo el catálogo correspondiente (Planta o Acarreo interno) en lugar de maquinaria.',
    rutaRecomendada: '/app/maquinaria',
    textoRuta: 'Ir a Maquinaria',
    palabrasClave: ['combustible', 'surtidor', 'diesel', 'inactiva', 'taller', 'operativa'],
  },
  {
    id: 'qa-descargar-txt-seniat-error',
    pregunta: '¿Qué columnas exige el SENIAT en el archivo TXT de retenciones de IVA?',
    area: 'COMPRAS_RETENCIONES',
    respuestaCorta:
      'El SENIAT exige exactamente 16 campos separados por tabuladores, incluyendo RIF del agente, período, fecha de factura, tipo de operación, tipo de documento, RIF del proveedor, número de factura, número de control, total, base, alícuota y monto retenido.',
    causaRaiz:
      'El formato TXT del SENIAT es rígido y automatizado. Cualquier campo con comas en lugar de puntos, o con tabuladores de más o de menos, genera error inmediato de carga en el portal tributario.',
    accionSolucion:
      'Nuestro módulo exporta el formato oficial verificado contra el validador del SENIAT. Solo ingrese a Retenciones › «Reportes y SENIAT (TXT)», escriba el período AAAAMM y descargue el archivo listo para subir.',
    rutaRecomendada: '/app/retenciones?tab=reportes',
    textoRuta: 'Generar TXT SENIAT',
    palabrasClave: ['columnas', '16 campos', 'validador', 'txt', 'seniat', 'iva'],
  },
  {
    id: 'qa-reintegro-otra-cuenta',
    pregunta: '¿Qué ocurre si el proveedor devuelve el reintegro en una cuenta bancaria distinta a la que se le pagó?',
    area: 'TESORERIA_TASAS',
    respuestaCorta:
      'No hay ningún problema. El modal «Registrar reintegro» permite seleccionar con total libertad cualquiera de las cuentas activas de la empresa (Banesco, Mercantil, Tesoro, Binance o Caja).',
    causaRaiz:
      'Muchos proveedores no pueden devolver por el mismo banco por límites diarios o disponibilidad de fondos.',
    accionSolucion:
      'Al pulsar «Registrar reintegro» en la fila correspondiente, elija en el desplegable la cuenta que efectivamente recibió el depósito o transferencia y asiente el número de referencia bancaria.',
    rutaRecomendada: '/app/retenciones?tab=reintegros',
    textoRuta: 'Ver Reintegros',
    palabrasClave: ['cuenta bancaria', 'reintegro', 'tesoreria', 'banco', 'transferencia'],
  },
  {
    id: 'qa-recepcion-parcial-inventario',
    pregunta: '¿Qué pasa si el proveedor trajo menos material del que dice la orden de compra?',
    area: 'INVENTARIO_ALMACEN',
    respuestaCorta:
      'Debe marcar «Recepción parcial». Ingrese la cantidad real recibida en almacén; el sistema mantendrá la orden como RECIBIDA_PARCIAL hasta que llegue el resto del pedido.',
    causaRaiz:
      'Confirmar la recepción total sin haber descargado el material completo distorsiona las existencias físicas y autoriza pagos por mercancía inexistente.',
    accionSolucion:
      '1. Diríjase a Inventario › Solicitudes de pedido › Recepciones.\n2. Pulse «Recibir» sobre la orden.\n3. Active «Recepción parcial» e ingrese la cantidad medida en patio.\n4. Cuando el proveedor entregue el remanente, repita el proceso para completar la orden.',
    rutaRecomendada: '/app/inventario/solicitudes',
    textoRuta: 'Ir a Recepciones',
    palabrasClave: ['recepcion parcial', 'faltante', 'inventario', 'almacen', 'orden'],
  },
  {
    id: 'qa-nomina-banco-tesoro-error-cuenta',
    pregunta: '¿Por qué el archivo de nómina del Banco del Tesoro rechaza a un trabajador?',
    area: 'NOMINA_PERSONAL',
    respuestaCorta:
      'Las cuentas del Banco del Tesoro deben tener obligatoriamente 20 dígitos y comenzar con los cuatro dígitos 0163. Si el trabajador tiene cuenta de otro banco, se debe pagar por transferencia interbancaria separada.',
    causaRaiz:
      'La plantilla de pago masivo del Tesoro (0163) solo procesa transferencias directas entre clientes del mismo banco.',
    accionSolucion:
      '1. Revise en la ficha del trabajador que el número de cuenta no tenga espacios, guiones ni falte ningún dígito.\n2. Asegúrese de que el código inicial sea 0163.\n3. Vuelva a generar el archivo de dispersión desde Nómina › Procesos.',
    rutaRecomendada: '/app/nomina/personal',
    textoRuta: 'Fichas de Personal',
    palabrasClave: ['banco del tesoro', '0163', 'cuenta', 'nomina', 'rechazo', 'error'],
  },
]
