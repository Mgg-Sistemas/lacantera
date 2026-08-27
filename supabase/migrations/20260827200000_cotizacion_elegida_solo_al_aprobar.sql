/*
  «APROBADA» DECIA QUE SI SIN SERLO.

  Se vio en pantalla: SOL-2026-0002, esperando al gerente, con sus dos
  cotizaciones propuestas y una de ellas marcada «Aprobada». No lo estaba.

  La causa es mia y es de esta misma tarde. La migracion que trajo las varias
  propuestas le cambio el significado a `cotizacion_elegida_id` —de «la que
  compras propone» a «la que el gerente aprobo»— y relleno el marbete
  `propuesta` de los pedidos que ya estaban esperando. Lo que no hizo fue
  vaciar la columna en esos mismos pedidos, asi que se quedo apuntando con el
  sentido antiguo y la pantalla la leyo con el nuevo.

  Es la peor clase de etiqueta equivocada: la que dice que algo ya se decidio.

  Se limpia el dato aqui, y la pantalla ademas pregunta por el estado del
  pedido antes de pintar la etiqueta. Lo segundo es lo que impide que vuelva a
  pasar: el dato puede traer algo viejo, pero un pedido que no esta aprobado no
  va a decir que lo esta.
*/

update public.solicitudes_pedido
   set cotizacion_elegida_id = null
 where estado <> 'APROBADA'
   and cotizacion_elegida_id is not null;

/*
  COMPROBADO DESPUES DE APLICARLA

    select numero, estado, cotizacion_elegida_id
      from public.solicitudes_pedido
     where cotizacion_elegida_id is not null or estado = 'POR_CONFIRMAR_GERENTE';
    -- SOL-2026-0002 | POR_CONFIRMAR_GERENTE | null
*/
