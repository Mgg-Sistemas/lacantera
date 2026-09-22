-- EL CAMIÓN SIN VEHÍCULO NO REVIENTA LA FUNCIÓN
--
-- En la primera versión, `v_veh := null` sobre una variable `record` la dejaba
-- «sin asignar», y leer `v_veh.id` en el camión siguiente daba error 55000.
-- Se cambian los dos records por variables con tipo, que sí admiten nulo.
-- Lo demás es idéntico a la migración anterior.

create or replace function public.guardar_camiones_de_nota(p_nota_id bigint, p_camiones jsonb)
returns integer
language plpgsql security definer set search_path to ''
as $$
declare
  v_nota      record;
  v_x         jsonb;
  v_orden     smallint := 0;
  v_veh_id    bigint;
  v_placa     text;
  v_descr     text;
  v_chofer_id bigint;
  v_nombre    text;
  v_cedula    text;
  v_peso      numeric;
begin
  select id, numero, estado, nota_salida into v_nota
    from public.notas_entrega where id = p_nota_id for update;
  if v_nota.id is null then
    raise exception 'No existe la nota de entrega %.', p_nota_id using errcode = 'P0002';
  end if;

  if not (
       private.tiene_permiso('FACTURACION', 'ESCRITURA')
       or (v_nota.nota_salida is not null and private.puede_accion('SALIDAS.GENERAR_NOTA_ENTREGA'))
     ) then
    raise exception 'Los camiones de la nota los pone quien escribe en Facturación, o quien generó la nota desde la salida.'
      using errcode = '42501';
  end if;

  if v_nota.estado = 'ANULADA' then
    raise exception 'La nota % está anulada: no se le cambian los camiones.', v_nota.numero using errcode = '55000';
  end if;

  if p_camiones is null or jsonb_typeof(p_camiones) <> 'array' then
    raise exception 'Los camiones llegaron con una forma que no se entiende.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_camiones) > 20 then
    raise exception 'Son demasiados camiones para una sola nota.' using errcode = '22023';
  end if;

  delete from public.nota_entrega_camiones where nota_id = p_nota_id;

  for v_x in select * from jsonb_array_elements(p_camiones) loop
    v_orden := v_orden + 1;
    v_veh_id := null; v_placa := null; v_descr := null;
    v_chofer_id := null; v_nombre := null; v_cedula := null;

    if nullif(v_x ->> 'vehiculo_id', '') is not null then
      select id, placa, descripcion into v_veh_id, v_placa, v_descr
        from public.vehiculos_de_despacho where id = (v_x ->> 'vehiculo_id')::bigint;
      if v_veh_id is null then
        raise exception 'El vehículo del camión % no está en el catálogo.', v_orden using errcode = 'P0002';
      end if;
    end if;

    if nullif(v_x ->> 'chofer_id', '') is not null then
      select id, nombre, cedula into v_chofer_id, v_nombre, v_cedula
        from public.choferes where id = (v_x ->> 'chofer_id')::bigint;
      if v_chofer_id is null then
        raise exception 'El chofer del camión % no está en el catálogo.', v_orden using errcode = 'P0002';
      end if;
    end if;

    if v_veh_id is null and v_chofer_id is null then
      raise exception 'El camión % no tiene ni vehículo ni chofer.', v_orden using errcode = '22023';
    end if;

    v_peso := nullif(btrim(coalesce(v_x ->> 'peso_neto', '')), '')::numeric;
    if v_peso is not null and v_peso < 0 then
      raise exception 'El peso del camión % no puede ser negativo.', v_orden using errcode = '22023';
    end if;

    insert into public.nota_entrega_camiones
      (nota_id, orden, vehiculo_id, chofer_id, vehiculo, chofer, cedula_chofer, ticket, peso_neto, registrado_por)
    values
      (p_nota_id, v_orden, v_veh_id, v_chofer_id,
       case when v_veh_id is null then null
            else v_placa || coalesce(' · ' || nullif(btrim(v_descr), ''), '') end,
       v_nombre, v_cedula,
       nullif(btrim(coalesce(v_x ->> 'ticket', '')), ''),
       v_peso, (select auth.uid()));
  end loop;

  return v_orden;
end;
$$;
