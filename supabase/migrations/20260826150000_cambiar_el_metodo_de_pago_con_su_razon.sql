/*
  CAMBIAR POR DÓNDE SE PAGA, SIN DESHACER LA APROBACIÓN

  Lo pidió la líder: una orden aprobada puede necesitar que se cambie el método
  de pago —se equivocaron al armarlo, la cuenta no tiene fondos, el proveedor
  cambió la seña—. Hoy la única salida era devolver la instrucción a compras,
  que retrocede la orden entera y obliga a rehacer un paso que estaba bien.

  Cambia el método y los datos que lo acompañan. NO cambia el monto, ni la
  moneda, ni el estado de la orden: sigue aprobada y sigue en la cola de pago.

  LOS DATOS SE REESCRIBEN ENTEROS, NO SE MEZCLAN

  Pasar de transferencia a efectivo deja un número de cuenta viejo colgando si
  solo se toca el método. Y un número de cuenta viejo en un pago en efectivo es
  exactamente cómo se le paga a quien no era. Se escriben los ocho campos con lo
  que venga, y lo que no venga queda en nulo.

  HAY QUE DECIR POR QUÉ

  Es lo único que va a leer quien pague, y es lo que distingue una corrección de
  un cambio de destinatario. Sin motivo no se guarda.

  Y SE AVISA. Quien está a punto de pagar tiene delante los datos viejos: si el
  cambio no le llega, paga con ellos.

  ENSAYADO ANTES DE DARLO POR BUENO

  En una transacción deshecha, con una cadena completa de prueba: motivo corto
  rechazado, pago móvil en dólares rechazado por la regla de moneda, efectivo
  sin receptor rechazado por falta de datos, el caso bueno dejando el banco y la
  cuenta en nulo con el monto y la moneda intactos, la bitácora contando
  «Transferencia bancaria → Efectivo» con su razón, un aviso emitido, y una
  instrucción ya pagada negándose a cambiar.
*/

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente)
values (
  'COMPRAS.CAMBIAR_METODO_PAGO', 'COMPRAS',
  'Cambiar el método de pago de una orden ya aprobada',
  'Cambia solo por dónde se paga —la cuenta, el teléfono, quién recibe el efectivo—, nunca cuánto ni de qué orden. La orden sigue aprobada y sigue en la cola. Hay que escribir por qué se cambia, porque es lo único que va a leer quien pague.',
  121, 'TOTAL'
)
on conflict (codigo) do nothing;

/*
  Los roles se sacan de quien ya puede armar la instrucción, no se escriben a
  mano. Escribir «COMPRAS» aquí sería suponer: la lista de verdad está en la
  base, y ya hubo un reparto hecho a mano que dejó dos contadores fuera.
*/
insert into public.rol_acciones (rol, accion)
select r.rol, 'COMPRAS.CAMBIAR_METODO_PAGO'
from public.rol_acciones r
where r.accion = 'COMPRAS.INDICAR_PAGO'
on conflict do nothing;

create or replace function public.cambiar_metodo_de_pago(
  p_instruccion_id bigint,
  p_metodo         text,
  p_datos          jsonb,
  p_motivo         text
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_estado     text;
  v_metodo     text;
  v_orden      bigint;
  v_solicitud  bigint;
  v_numero     text;
  v_antes      text;
  v_despues    text;
  v_cuenta     text;
begin
  perform private.exigir_accion('COMPRAS.CAMBIAR_METODO_PAGO');

  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Hay que decir por qué se cambia el método de pago.'
      using errcode = '23514';
  end if;

  select i.estado, i.metodo, i.orden_id
    into v_estado, v_metodo, v_orden
  from public.instrucciones_pago i where i.id = p_instruccion_id;

  if v_estado is null then
    raise exception 'No existe esa instrucción de pago.' using errcode = 'P0002';
  end if;

  /*
    Solo mientras esté por pagar.

    Una instrucción ya pagada tiene un movimiento de dinero detrás con su
    referencia: cambiarle el método por donde no salió el dinero deja el libro
    diciendo una cosa y el banco otra. Y una anulada o devuelta ya no va a
    pagarse por ningún método.
  */
  if v_estado <> 'POR_PAGAR' then
    raise exception 'Esta instrucción está en «%» y ya no admite cambio de método.', v_estado
      using errcode = '55000';
  end if;

  update public.instrucciones_pago set
    metodo         = p_metodo,
    banco          = nullif(btrim(coalesce(p_datos->>'banco', '')), ''),
    numero_cuenta  = nullif(btrim(coalesce(p_datos->>'numero_cuenta', '')), ''),
    titular        = nullif(btrim(coalesce(p_datos->>'titular', '')), ''),
    documento      = nullif(btrim(coalesce(p_datos->>'documento', '')), ''),
    telefono       = nullif(btrim(coalesce(p_datos->>'telefono', '')), ''),
    correo_binance = nullif(btrim(coalesce(p_datos->>'correo_binance', '')), ''),
    red_cripto     = nullif(btrim(coalesce(p_datos->>'red_cripto', '')), ''),
    receptor       = nullif(btrim(coalesce(p_datos->>'receptor', '')), '')
  where id = p_instruccion_id;

  -- El disparador `trg_validar_metodo_pago` ya comprobó, dentro del UPDATE, que
  -- el método existe, que está en uso, que admite esta moneda y que no le falta
  -- ningún dato. No hay nada que repetir aquí.

  select m.nombre into v_antes from public.metodos_pago m where m.codigo = v_metodo;
  select m.nombre into v_despues from public.metodos_pago m where m.codigo = p_metodo;

  select o.solicitud_id, s.numero into v_solicitud, v_numero
  from public.ordenes_compra o
  join public.solicitudes_pedido s on s.id = o.solicitud_id
  where o.id = v_orden;

  /*
    Cuando el método es el mismo, lo que cambió es la cuenta.

    Decir «Transferencia → Transferencia» no informa de nada y esconde el caso
    más frecuente de todos: el proveedor mandó otra seña.
  */
  v_cuenta := case
    when v_metodo is distinct from p_metodo
      then format('%s → %s', coalesce(v_antes, v_metodo), coalesce(v_despues, p_metodo))
    else format('%s: otros datos', coalesce(v_despues, p_metodo))
  end;

  -- «POR_PAGAR» a «POR_PAGAR» a propósito: la instrucción no se movió de sitio.
  -- `private.anotar` no avisa de ese estado, y el aviso se manda aquí abajo con
  -- las palabras que corresponden a esto y no a un cambio de estado.
  perform private.anotar('PAGO', p_instruccion_id, 'POR_PAGAR', 'POR_PAGAR',
    format('Método de pago — %s. %s', v_cuenta, btrim(p_motivo)));

  perform private.notificar(
    'COMPRAS', 'COMPRA_METODO_PAGO_CAMBIADO',
    'Cambió el método de pago de una orden',
    format('%s · %s — «%s»', coalesce(v_numero, 'Orden ' || v_orden), v_cuenta, btrim(p_motivo)),
    '/app/compras/' || v_solicitud, array['COMPRAS'], 'ATENCION');
end;
$function$;

revoke all on function public.cambiar_metodo_de_pago(bigint, text, jsonb, text) from public;
grant execute on function public.cambiar_metodo_de_pago(bigint, text, jsonb, text) to authenticated;
