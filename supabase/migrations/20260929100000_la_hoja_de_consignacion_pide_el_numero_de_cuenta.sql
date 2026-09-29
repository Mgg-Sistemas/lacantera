/*
  LA HOJA DE CONSIGNACIÓN PIDE EL NÚMERO DE CUENTA

  Angélica, 29/09/2026, mirando la hoja impresa: el título «Datos para el Pago
  y el Contrato» pasa a «Datos Bancarios», y la casilla «Carta o cuenta
  bancaria» pasa a «Número de cuenta».

  POR QUÉ ES UNA MIGRACIÓN Y NO UN CLIC EN LA PANTALLA

  Estos dos textos son datos: viven en `requisitos_titulos` y
  `requisitos_ingreso`, y la pantalla de requisitos los deja editar. Cambiarlos
  ahí a mano habría bastado para la hoja de hoy — y habría dejado la base de
  producción diciendo una cosa y la semilla del repositorio otra, que es como
  se construye un sistema que nadie sabe reproducir desde cero.

  Se hace por UPDATE y no tocando la semilla del 22/09/2026: una migración
  aplicada no se edita, porque quien ya la corrió no la vuelve a correr y se
  quedaría con los nombres viejos para siempre.

  Y VA TAMBIÉN AL CATÁLOGO DE PAPELES, que es la mitad que se olvida. El papel
  que el trabajador entrega se archiva en su ficha con el nombre de
  `tipos_documento_personal`. Si la hoja pide «Número de cuenta» y la ficha lo
  guarda como «Carta o cuenta bancaria», quien busque el papel meses después no
  lo reconoce. Es el mismo papel y tiene que llamarse igual en los dos sitios.

  El código `CARTA_BANCARIA` no se toca. Es la llave por la que se enlazan el
  requisito y el papel archivado; renombrarla rompería las fichas que ya lo
  tienen guardado, y el código no se le enseña a nadie.
*/

update public.requisitos_titulos
   set nombre = 'Datos Bancarios'
 where nombre = 'Datos para el Pago y el Contrato';

update public.requisitos_ingreso
   set nombre = 'Número de cuenta'
 where tipo_documento_codigo = 'CARTA_BANCARIA'
   and nombre = 'Carta o cuenta bancaria';

update public.tipos_documento_personal
   set nombre = 'Número de cuenta'
 where codigo = 'CARTA_BANCARIA'
   and nombre = 'Carta o cuenta bancaria';
