/*
  Un vehiculo que nunca movio nada se puede eliminar.

  ═══════════════════════════════════════════════════════════════════════════
  LO QUE SE PIDIO
  ═══════════════════════════════════════════════════════════════════════════

  «En el modulo de despachos no me deja eliminar los vehiculos.» No habia
  forma: el navegador no escribe en la tabla y no existia funcion. Solo se
  podia desmarcar «En servicio».

  ═══════════════════════════════════════════════════════════════════════════
  SON DOS COSAS DISTINTAS Y HACEN FALTA LAS DOS
  ═══════════════════════════════════════════════════════════════════════════

  Sacar de servicio — el camion existio y trabajo, pero ya no. Se vendio, se
  acabo el contrato con el transportista, se accidento. Sus viajes siguen
  siendo suyos y el pago de ese mes tiene que seguir cuadrando. Eso ya existe.

  Eliminar — el camion nunca debio existir: placa mal tecleada, uno cargado
  dos veces, uno de prueba. No hizo nada, y dejarlo ahi confunde para siempre
  en la lista de la planilla.

  ═══════════════════════════════════════════════════════════════════════════
  LA REGLA PARA ELIMINAR
  ═══════════════════════════════════════════════════════════════════════════

  Solo si no tiene historia: ni viajes, ni pesajes, ni guias, ni notas de
  entrega. Esas cuatro tablas apuntan al vehiculo sin borrado en cascada, y
  esta bien que asi sea: un viaje sin camion es un pago sin a quien.

  Los periodos de chofer si se van con el: son configuracion del camion, no
  historia de lo que movio, y la clave foranea ya los borra en cascada.

  Y el mensaje dice cuanta historia tiene. Es la misma leccion que la de los
  parametros de nomina: «no se puede» sin el porque obliga a adivinar; con
  «tiene 11 viajes» se entiende de una vez que lo que se quiere es sacarlo de
  servicio.

  El error de clave foranea se atrapa ademas alrededor del borrado, por si
  manana otra tabla apunta a vehiculos y nadie se acuerda de sumarla aqui.

  ═══════════════════════════════════════════════════════════════════════════
  LA CASILLA VIENE CON TOTAL
  ═══════════════════════════════════════════════════════════════════════════

  Como anular un pesaje o una guia: lo que no se puede deshacer es de Total.
*/

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente)
values
  ('DESPACHOS.ELIMINAR_VEHICULO', 'DESPACHOS',
   'Eliminar un vehiculo que nunca se uso',
   'Borra un vehiculo cargado por error: placa mal escrita, uno repetido, uno de '
   'prueba. Si ya hizo viajes, pesajes, guias o notas de entrega, la base no lo '
   'deja y hay que sacarlo de servicio. La trae cualquiera con Total en Despachos.',
   100, 'TOTAL')
on conflict (codigo) do nothing;

create or replace function public.eliminar_vehiculo(p_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_placa   text;
  v_viajes  bigint;
  v_pesajes bigint;
  v_guias   bigint;
  v_notas   bigint;
  v_tiene   text[];
begin
  perform private.exigir_accion('DESPACHOS.ELIMINAR_VEHICULO');

  -- `for update` para que nadie le cargue un viaje entre la cuenta y el
  -- borrado: la comprobacion de clave foranea de ese viaje pide un candado
  -- sobre esta misma fila y tiene que esperar.
  select placa into v_placa
    from public.vehiculos
   where id = p_id
     for update;

  if v_placa is null then
    raise exception 'Ese vehículo ya no está.' using errcode = 'P0002';
  end if;

  select count(*) into v_viajes  from public.acarreos           where vehiculo_id = p_id;
  select count(*) into v_pesajes from public.romana_tickets     where vehiculo_id = p_id;
  select count(*) into v_guias   from public.guias_movilizacion where vehiculo_id = p_id;
  select count(*) into v_notas   from public.notas_entrega      where vehiculo_id = p_id;

  v_tiene := array_remove(array[
    case when v_viajes  = 1 then '1 viaje'
         when v_viajes  > 1 then v_viajes  || ' viajes' end,
    case when v_pesajes = 1 then '1 pesaje'
         when v_pesajes > 1 then v_pesajes || ' pesajes' end,
    case when v_guias   = 1 then '1 guía'
         when v_guias   > 1 then v_guias   || ' guías' end,
    case when v_notas   = 1 then '1 nota de entrega'
         when v_notas   > 1 then v_notas   || ' notas de entrega' end
  ], null);

  if cardinality(v_tiene) > 0 then
    raise exception 'El vehículo % tiene %, y borrarlo dejaría esa historia sin camión. Sácalo de servicio: deja de ofrecerse y lo registrado sigue cuadrando.',
      v_placa, array_to_string(v_tiene, ', ')
      using errcode = '55000',
            hint = 'En el formulario del vehículo, desmarca «En servicio».';
  end if;

  begin
    delete from public.vehiculos where id = p_id;
  exception
    when foreign_key_violation then
      raise exception 'El vehículo % ya se usó en algún registro, y borrarlo dejaría esa historia sin sentido. Sácalo de servicio.',
        v_placa
        using errcode = '23503';
  end;
end;
$function$;

comment on function public.eliminar_vehiculo(bigint) is
  'Borra un vehiculo que nunca movio nada. Con viajes, pesajes, guias o notas de '
  'entrega lo impide y dice cuantos tiene: ese se saca de servicio.';

revoke execute on function public.eliminar_vehiculo(bigint) from public, anon;
grant  execute on function public.eliminar_vehiculo(bigint) to authenticated;
