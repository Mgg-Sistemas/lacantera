/*
  UNA SALIDA DE VARIOS ALMACENES SON VARIAS SOLICITUDES

  Christopher, 17/09/2026, después de poder elegir el patio de cada renglón de
  un despacho: «desean que se aplique el mismo caso para la salida de
  inventario». Y a la pregunta de si sale un papel por almacén: sí, una
  solicitud por almacén. Aprobar es responder por lo que sale de un sitio, así
  que cada almacenista aprueba y entrega la suya.

  `pedir_salidas` recibe los renglones ya agrupados por almacén y llama a
  `pedir_salida` una vez por grupo, dentro de la misma transacción: si la del
  segundo almacén no pasa —no hay tanto, falta el responsable—, la del primero
  tampoco queda. Devuelve los números en el orden en que llegaron.

  No repite ninguna regla: todas son las de `pedir_salida`.
*/

create or replace function public.pedir_salidas(
  p_por_almacen jsonb,
  p_motivo      text,
  p_grupo_id    bigint  default null,
  p_externo     text    default null,
  p_responsable text    default null,
  p_con_firma   boolean default false
)
returns text[]
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_grupo    jsonb;
  v_numeros  text[] := '{}';
  v_vistos   bigint[] := '{}';
  v_almacen  bigint;
begin
  if p_por_almacen is null or jsonb_typeof(p_por_almacen) <> 'array' or jsonb_array_length(p_por_almacen) = 0 then
    raise exception 'No hay nada que solicitar.' using errcode = '22023';
  end if;

  for v_grupo in select * from jsonb_array_elements(p_por_almacen) loop
    v_almacen := nullif(v_grupo ->> 'almacen_id', '')::bigint;

    if v_almacen is null then
      raise exception 'Cada grupo de renglones dice de qué almacén sale.' using errcode = '22023';
    end if;

    -- Dos grupos del mismo almacén serían dos solicitudes para el mismo
    -- almacenista por lo que se pidió de una vez.
    if v_almacen = any(v_vistos) then
      raise exception 'El mismo almacén llegó dos veces: sus renglones van en una sola solicitud.'
        using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_almacen;

    v_numeros := v_numeros || public.pedir_salida(
      v_almacen, v_grupo -> 'renglones', p_motivo, p_grupo_id, p_externo, p_responsable, p_con_firma);
  end loop;

  return v_numeros;
end;
$func$;

revoke all on function public.pedir_salidas(jsonb, text, bigint, text, text, boolean) from public, anon;
grant execute on function public.pedir_salidas(jsonb, text, bigint, text, text, boolean) to authenticated, service_role;
