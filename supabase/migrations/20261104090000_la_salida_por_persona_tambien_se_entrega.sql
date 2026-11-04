/*
  LA SALIDA POR PERSONA TAMBIÉN SE ENTREGA.

  Regresión del cambio de ayer (`20261103090000_el_destinatario_interno_de_una_salida_es_una_persona.sql`):
  `pedir_salida`/`pedir_salidas` ya aceptan `empleado_id` como destinatario
  interno, pero `entregar_solicitud_salida` seguía llamando a
  `registrar_salidas` sin pasarlo —solo `grupo_id`/`destino_externo`—, así que
  cualquier solicitud pedida para una persona se atascaba al confirmar la
  entrega con «Falta decir para quién sale», aunque la solicitud ya lo decía
  con nombre y apellido.

  NUEVA COLUMNA, Y NO SE REUTILIZA `empleado_id`. `inventario_movimientos` ya
  tenía una columna `empleado_id`, pero es de Asignaciones/Dotación:
  `v_dotaciones`, `v_dotacion_entregada` y `v_entregado_a_trabajador` la leen
  para listar lo entregado como dotación, filtrando
  `tipo = 'SALIDA_CONSUMO' and empleado_id is not null`. Una salida pedida
  para una persona (`SALIDA_CONSUMO`, el tipo por defecto) con ese mismo campo
  habría aparecido mezclada en esos reportes como si fuera una dotación. Por
  eso `destinatario_empleado_id`, aparte.

  EL CAMBIO BAJA POR TRES PISOS, LOS MISMOS QUE YA TENÍAN GRUPO/EXTERNO:
  `private.registrar_movimiento` (guarda la columna) → `registrar_salidas`
  (valida y es el que de verdad descuenta) → `entregar_solicitud_salida`
  (quien lo llama al confirmar la entrega, con lo que ya trae la solicitud).
*/

alter table public.inventario_movimientos
  add column if not exists destinatario_empleado_id bigint references public.empleados(id);

comment on column public.inventario_movimientos.destinatario_empleado_id is
  'Para qué persona salió, cuando el destinatario interno de la solicitud es una persona (03/11/2026). Distinta de empleado_id: esa es la de Asignaciones/Dotación (asignaciones_herramienta y las vistas v_dotaciones/v_entregado_a_trabajador filtran por ella), y confundirlas haría aparecer una salida cualquiera como si fuera una dotación.';

CREATE OR REPLACE FUNCTION private.registrar_movimiento(p_tipo text, p_signo integer, p_almacen bigint, p_articulo bigint, p_cantidad numeric, p_costo_usd numeric, p_nota text DEFAULT NULL::text, p_orden bigint DEFAULT NULL::bigint, p_renglon bigint DEFAULT NULL::bigint, p_origen bigint DEFAULT NULL::bigint, p_fecha date DEFAULT NULL::date, p_empleado bigint DEFAULT NULL::bigint, p_clase text DEFAULT NULL::text, p_nota_salida text DEFAULT NULL::text, p_aviso_costo numeric DEFAULT NULL::numeric, p_cantidad_capturada numeric DEFAULT NULL::numeric, p_unidad_capturada text DEFAULT NULL::text, p_suelto_capturado numeric DEFAULT NULL::numeric, p_costo_capturado numeric DEFAULT NULL::numeric, p_costo_unidad_capturada text DEFAULT NULL::text, p_moneda_capturada text DEFAULT NULL::text, p_propietario text DEFAULT NULL::text, p_razon_salida text DEFAULT NULL::text, p_grupo bigint DEFAULT NULL::bigint, p_externo text DEFAULT NULL::text, p_responsable text DEFAULT NULL::text, p_empleado_destino bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_unidad text; v_id bigint; v_capacidad numeric; v_nombre text; v_hay numeric;
  v_dueno text; v_duenos text[];
begin
  if p_signo not in (-1, 1) then
    raise exception 'El signo de un movimiento solo puede ser +1 o -1 (recibido: %).', p_signo
      using errcode = '22023';
  end if;

  if exists (select 1 from public.almacenes a
              where a.id = p_almacen and a.tipo = 'PATIO_MAQUINAS') then
    raise exception '«%» es un patio de maquinas: ahi no se guarda material.',
      (select nombre from public.almacenes where id = p_almacen)
      using errcode = '22023',
            hint = 'Sirve para decir donde se resguarda una maquina o un vehiculo, no para llevar existencias.';
  end if;

  if exists (select 1 from public.almacenes a
              where a.id = p_almacen and a.tipo = 'TRANSITO')
     and coalesce(current_setting('cantera.traslado_en_curso', true), '') <> 'si' then
    raise exception '«%» es donde espera lo que va de un sitio a otro: solo lo mueven los traslados.',
      (select nombre from public.almacenes where id = p_almacen)
      using errcode = '22023',
            hint = 'Para sacar algo de ahí, reciba o cancele su traslado en Transferencias.';
  end if;

  select unidad into v_unidad from public.articulos where id = p_articulo;
  if v_unidad is null then
    raise exception 'No existe el artículo %.', p_articulo using errcode = 'P0002';
  end if;

  v_dueno := nullif(btrim(coalesce(p_propietario, '')), '');

  if v_dueno is null then
    if p_signo = 1 then
      select a.propietario into v_dueno from public.almacenes a where a.id = p_almacen;
      v_dueno := coalesce(v_dueno, 'LACANTERA');
    else
      v_dueno := private.dueno_del_saldo(p_almacen, p_articulo, null);
    end if;
  end if;

  if p_signo = -1 then
    select coalesce(sum(m.cantidad * m.signo), 0) into v_hay
      from public.inventario_movimientos m
     where m.almacen_id = p_almacen and m.articulo_id = p_articulo
       and m.propietario = v_dueno;
    if v_hay < p_cantidad then
      select nombre into v_nombre from public.articulos where id = p_articulo;
      raise exception 'De «%» ahi solo hay % de ese dueño: no alcanza para %.',
        v_nombre, private.cantidad_es(v_hay), private.cantidad_es(p_cantidad)
        using errcode = '55000';
    end if;
  end if;

  if p_signo = 1 then
    select capacidad, nombre into v_capacidad, v_nombre from public.almacenes where id = p_almacen;
    if v_capacidad is not null then
      perform pg_catalog.pg_advisory_xact_lock(p_almacen::int, 0);
      select coalesce(sum(m.cantidad * m.signo), 0) into v_hay
        from public.inventario_movimientos m
       where m.almacen_id = p_almacen and m.unidad = v_unidad;
      if v_hay + p_cantidad > v_capacidad then
        raise exception 'En "%" caben % % y ya hay %: no entran % más.',
          v_nombre, private.cantidad_es(v_capacidad), v_unidad, private.cantidad_es(v_hay), private.cantidad_es(p_cantidad)
          using errcode = '22023', hint = format('Quedan %s libres.', private.cantidad_es(v_capacidad - v_hay));
      end if;
    end if;
  end if;

  insert into public.inventario_movimientos
    (numero, fecha, tipo, signo, almacen_id, articulo_id, cantidad, unidad,
     costo_usd, orden_id, orden_renglon_id, movimiento_origen, nota, empleado_id,
     entrega_clase, registrado_por, nota_salida, aviso_costo, propietario,
     cantidad_capturada, unidad_capturada, suelto_capturado, costo_capturado, costo_unidad_capturada, moneda_capturada, razon_salida, grupo_id, destino_externo, responsable_externo, destinatario_empleado_id, hecho_con)
  values
    (private.siguiente_numero('MOV'), coalesce(p_fecha, current_date), p_tipo, p_signo,
     p_almacen, p_articulo, p_cantidad, v_unidad, p_costo_usd,
     p_orden, p_renglon, p_origen, nullif(trim(coalesce(p_nota, '')), ''), p_empleado,
     p_clase, (select auth.uid()), p_nota_salida, p_aviso_costo, v_dueno,
     nullif(p_cantidad_capturada, 0),
     nullif(btrim(coalesce(p_unidad_capturada, '')), ''),
     nullif(p_suelto_capturado, 0),
     p_costo_capturado,
     nullif(btrim(coalesce(p_costo_unidad_capturada, '')), ''),
     nullif(btrim(coalesce(p_moneda_capturada, '')), ''),
     nullif(btrim(coalesce(p_razon_salida, '')), ''),
     p_grupo,
     nullif(btrim(coalesce(p_externo, '')), ''),
     nullif(btrim(coalesce(p_responsable, '')), ''),
     p_empleado_destino,
     nullif(current_setting('request.path', true), ''))
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_salidas(p_almacen_id bigint DEFAULT NULL::bigint, p_renglones jsonb DEFAULT NULL::jsonb, p_motivo text DEFAULT NULL::text, p_tipo text DEFAULT 'SALIDA_CONSUMO'::text, p_fecha date DEFAULT NULL::date, p_grupo_id bigint DEFAULT NULL::bigint, p_externo text DEFAULT NULL::text, p_responsable text DEFAULT NULL::text, p_empleado_id bigint DEFAULT NULL::bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_r jsonb; v_n int := 0; v_almacen bigint; v_articulo bigint; v_cantidad numeric;
  v_nombre text; v_sitio text; v_hay numeric; v_costo numeric; v_nota text;
  v_clase public.clases_de_salida; v_tipo text; v_mov bigint;
  v_pres numeric; v_sueltas numeric; v_unidad_pres text;
  v_nombre_pres text; v_dueno text; v_orden bigint;
begin
  perform private.exigir_permiso('SALIDAS', 'ESCRITURA');

  if nullif(current_setting('lacantera.entregando_solicitud', true), '') is null then
    raise exception 'Por ahora toda salida necesita autorización: solicítela en Salidas › Salidas y se entrega cuando la apruebe quien responde por el almacén.'
      using errcode = '42501';
  end if;

  if private.nombra_una_venta(p_motivo) then
    raise exception 'La solicitud dice «%», y una venta no sale por aquí: se registra en Facturación › Notas de entrega, con cliente, precio y su número.',
      lower(private.palabra_de_venta(p_motivo)) using errcode = '22023';
  end if;

  select i.orden_id into v_orden
    from public.solicitudes_salida s
    join public.instrucciones_pago i on i.id = s.instruccion_pago_id
   where s.numero = nullif(current_setting('lacantera.entregando_solicitud', true), '');

  select * into v_clase from public.clases_de_salida where codigo = p_tipo;
  if v_clase.codigo is not null then
    if not v_clase.activa then
      raise exception 'La clase "%" está apagada.', v_clase.nombre using errcode = '22023';
    end if;
    if v_clase.codigo = 'ENTREGA_POR_SOLICITUD'
       and nullif(current_setting('lacantera.entregando_solicitud', true), '') is null then
      raise exception 'La razón "%" la pone la entrega de una solicitud: en una salida directa elija otra.', v_clase.nombre
        using errcode = '22023';
    end if;
    if v_clase.codigo = 'ENTREGA_POR_INTERCAMBIO' and v_orden is null then
      raise exception 'La razón "%" la pone el pago de una compra con material: una salida pedida a mano elige otra.', v_clase.nombre
        using errcode = '22023';
    end if;
    if v_clase.tipo = 'SALIDA_BAJA' then
      raise exception 'La razón "%" ya no se usa: elija otra de la lista.', v_clase.nombre
        using errcode = '22023';
    end if;
    v_tipo := v_clase.tipo;
  else
    v_tipo := p_tipo;
    if v_tipo not in ('SALIDA_CONSUMO', 'SALIDA_MERMA', 'SALIDA_DESPACHO') then
      raise exception 'Tipo de salida no válido: %.', p_tipo using errcode = '22023';
    end if;
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'No hay nada que sacar: la salida no trae renglones.' using errcode = '22023';
  end if;

  /*
    PARA QUIÉN SALE, y no vale dejarlo en blanco. Desde el 03/11/2026 puede ser
    también una persona de nómina, no solo un grupo del organigrama o alguien
    de fuera — mismo cambio que ya tiene pedir_salida.
  */
  if p_grupo_id is null and p_empleado_id is null and nullif(btrim(coalesce(p_externo, '')), '') is null then
    raise exception 'Falta decir para quién sale: un grupo de la empresa, una persona, o quién es de fuera.'
      using errcode = '22023';
  end if;

  if (case when p_grupo_id is not null then 1 else 0 end
    + case when p_empleado_id is not null then 1 else 0 end
    + case when nullif(btrim(coalesce(p_externo, '')), '') is not null then 1 else 0 end) > 1 then
    raise exception 'Una salida va a un grupo de la empresa, a una persona, o a alguien de fuera — no a más de uno.'
      using errcode = '22023';
  end if;

  if p_grupo_id is not null
     and not exists (select 1 from public.organigrama_nodos o
                      where o.id = p_grupo_id and o.activo) then
    raise exception 'Ese grupo no está en el organigrama, o está apagado.'
      using errcode = '23503';
  end if;

  if p_empleado_id is not null
     and not exists (
       select 1 from public.empleados e
        where e.id = p_empleado_id and e.activo and e.fecha_egreso is null
     ) then
    raise exception 'Esa persona no está activa en la nómina.' using errcode = '23503';
  end if;

  if nullif(btrim(coalesce(p_externo, '')), '') is not null
     and length(btrim(coalesce(p_responsable, ''))) < 3 then
    raise exception 'Diga quién responde por lo que sale: el nombre de quien lo recibe.'
      using errcode = '22023';
  end if;

  if coalesce(v_clase.exige_detalle, false) then
    if length(btrim(coalesce(p_motivo, ''))) < 10 then
      raise exception 'Explique qué pasó, con detalle. Dentro de un año esta frase será lo único que quede.'
        using errcode = '22023';
    end if;
  elsif length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escriba para qué sale. Una salida sin motivo no se puede auditar.' using errcode = '22023';
  end if;

  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_n := v_n + 1;
    v_almacen  := coalesce(nullif(btrim(coalesce(v_r->>'almacen_id', '')), '')::bigint, p_almacen_id);
    v_articulo := nullif(btrim(coalesce(v_r->>'articulo_id', '')), '')::bigint;
    v_sueltas  := coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0);
    v_pres     := coalesce(nullif(btrim(coalesce(v_r->>'presentaciones', '')), '')::numeric, 0);

    select nombre into v_sitio from public.almacenes where id = v_almacen and activo;
    if v_sitio is null then
      raise exception 'El renglón %: no dice de qué almacén sale, o ese almacén está inactivo.', v_n using errcode = '23503';
    end if;
    select nombre into v_nombre from public.articulos where id = v_articulo and activo;
    if v_nombre is null then
      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n using errcode = '23503';
    end if;

    v_cantidad := private.en_unidad_base(v_articulo, v_pres, v_sueltas, nullif(btrim(coalesce(v_r->>'presentacion', '')), ''));

    if v_cantidad <= 0 then
      raise exception 'El renglón % (%): la cantidad tiene que ser mayor que cero.', v_n, v_nombre using errcode = '22023';
    end if;

    v_hay := private.existencia_para_escribir(v_almacen, v_articulo,
                 private.dueno_del_saldo(v_almacen, v_articulo, v_r->>'propietario')) - coalesce((
      select sum(private.en_unidad_base(
                   v_articulo,
                   coalesce(nullif(btrim(coalesce(r->>'presentaciones', '')), '')::numeric, 0),
                   coalesce(nullif(btrim(coalesce(r->>'cantidad', '')), '')::numeric, 0),
                   nullif(btrim(coalesce(r->>'presentacion', '')), '')))
        from jsonb_array_elements(p_renglones) with ordinality as t(r, i)
       where t.i < v_n
         and coalesce(nullif(btrim(coalesce(r->>'almacen_id', '')), '')::bigint, p_almacen_id) = v_almacen
         and nullif(btrim(coalesce(r->>'articulo_id', '')), '')::bigint = v_articulo), 0);

    if v_cantidad > v_hay then
      raise exception 'El renglón % (% en %): solo quedan % y se intentan sacar %.',
        v_n, v_nombre, v_sitio, private.numero_es(v_hay, 4), private.numero_es(v_cantidad, 4) using errcode = '22023';
    end if;
  end loop;

  v_nota := private.siguiente_numero('NS');

  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_almacen  := coalesce(nullif(btrim(coalesce(v_r->>'almacen_id', '')), '')::bigint, p_almacen_id);
    v_articulo := (v_r->>'articulo_id')::bigint;
    v_sueltas  := coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0);
    v_pres     := coalesce(nullif(btrim(coalesce(v_r->>'presentaciones', '')), '')::numeric, 0);
    v_cantidad := private.en_unidad_base(v_articulo, v_pres, v_sueltas, nullif(btrim(coalesce(v_r->>'presentacion', '')), ''));

    select presentacion into v_unidad_pres from public.articulos where id = v_articulo;
    v_dueno := private.dueno_del_saldo(v_almacen, v_articulo, v_r->>'propietario');
    v_costo := private.costo_promedio(v_almacen, v_articulo, v_dueno);

    v_mov := private.registrar_movimiento(
      v_tipo, -1, v_almacen, v_articulo, v_cantidad, v_costo,
      btrim(p_motivo), v_orden, null, null, p_fecha, null, null, v_nota, null,
      p_cantidad_capturada => nullif(v_pres, 0),
      p_propietario => v_dueno,
      p_unidad_capturada => case when v_pres > 0 then private.presentacion_usada(v_articulo, nullif(btrim(coalesce(v_r->>'presentacion', '')), '')) end,
      p_suelto_capturado => case when v_pres > 0 then nullif(v_sueltas, 0) end,
      p_razon_salida => v_clase.nombre,
      p_grupo => p_grupo_id,
      p_externo => p_externo,
      p_responsable => p_responsable,
      p_empleado_destino => p_empleado_id);
  end loop;

  return v_nota;
end;
$function$;

CREATE OR REPLACE FUNCTION public.entregar_solicitud_salida(p_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s         public.solicitudes_salida;
  v_alm       public.almacenes;
  v_renglones jsonb;
  v_nota      text;
begin
  perform private.exigir_permiso('SALIDAS', 'ESCRITURA');

  select * into v_s from public.solicitudes_salida where id = p_id for update;
  if v_s.id is null then
    raise exception 'No existe la solicitud %.', p_id using errcode = 'P0002';
  end if;
  if v_s.estado <> 'APROBADA' then
    raise exception 'La solicitud % no se puede entregar: está %.', v_s.numero, lower(v_s.estado)
      using errcode = '55000';
  end if;

  select * into v_alm from public.almacenes where id = v_s.almacen_id;

  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'almacen_id',     v_s.almacen_id::text,
           'articulo_id',    r.articulo_id::text,
           'cantidad',       coalesce(r.suelto, r.cantidad)::text,
           'presentaciones', r.presentaciones::text,
           'presentacion',   r.presentacion,
           'propietario',    r.propietario)))
    into v_renglones
    from public.solicitud_salida_renglones r
   where r.solicitud_id = p_id;

  perform set_config('lacantera.entregando_solicitud', v_s.numero, true);

  v_nota := public.registrar_salidas(
    p_almacen_id  => v_s.almacen_id,
    p_renglones   => v_renglones,
    p_motivo      => format('Solicitud %s. Para: %s', v_s.numero, v_s.motivo),
    p_tipo        => v_s.clase,
    p_grupo_id    => v_s.grupo_id,
    p_externo     => v_s.destino_externo,
    p_responsable => v_s.responsable_externo,
    p_empleado_id => v_s.empleado_id);

  perform set_config('lacantera.entregando_solicitud', '', true);

  update public.solicitudes_salida
     set estado = 'ENTREGADA',
         entregada_por = (select auth.uid()), entregada_en = now(),
         nota_salida = v_nota
   where id = p_id;

  if v_s.instruccion_pago_id is not null then
    perform private.material_entregado(v_s.instruccion_pago_id, v_nota);
  end if;

  perform private.notificar(
    'SALIDAS', 'SALIDA_ENTREGADA',
    format('%s: entregada con la nota %s', v_s.numero, v_nota),
    format('Salió de %s.', v_alm.nombre),
    '/app/salidas/solicitudes', array['ALMACEN'], 'INFO');

  return v_nota;
end;
$function$;
