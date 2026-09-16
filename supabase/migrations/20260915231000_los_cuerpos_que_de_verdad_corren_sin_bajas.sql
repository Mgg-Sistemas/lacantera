/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  5 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
  las crea. No cambia nada en la base: son los mismos cuerpos que ya corren,
  puestos donde reconstruir desde cero da lo mismo que hay.

  POR QUE APARECIO ESTA DIFERENCIA, que es lo unico interesante de este archivo:
  las migraciones de esta casa parchean con `pg_get_functiondef` + `replace` en
  vez de reescribir funciones de siete mil letras. El parche es correcto y el
  motivo es bueno —copiar a mano es lo que introduce diferencias—, pero deja el
  cuerpo repartido entre el archivo que la creo y los cinco que la tocaron
  despues. El archivo deja de servir para reconstruir aunque cada parche este
  bien.

  Lo levanto el carril de base de datos, tres veces en un dia, y la tercera con
  el diagnostico que lo explica: no es falta de cuidado, es que la verificacion
  se hace UNA VEZ al escribir y seis migraciones despues otra cosa toca la misma
  funcion. Un md5 comprobado el lunes no dice nada del miercoles.

  Por eso esto es generado y no transcrito: volcar la salida de Postgres no puede
  introducir una diferencia, y teclearla si.

  QUE SE COMPROBO ANTES DE GUARDARLO

  Cada cuerpo de aqui se comparo BYTE A BYTE contra `pg_proc.prosrc` de la base
  viva —no normalizado, no perdonando comentarios— y los 5 coinciden. Y el
  detector, que antes marcaba estas 5, pasa a cero.

  NO SE APLICO, Y ES A PROPOSITO

  Aplicarlo seria un no-op: son exactamente los cuerpos que ya corren, sacados de
  `pg_get_functiondef`. Su valor no esta en cambiar la base sino en que
  reconstruirla desde cero de lo mismo que hay.

  Y LA TRAMPA QUE ESO DEJA, dicha aqui para que no sorprenda: si manana otra
  migracion toca una de estas funciones y alguien corre ESTE archivo suelto,
  despues, la revierte al cuerpo de hoy. En orden no pasa —va fechado con su dia y
  detras de todo lo de ese dia—, pero un volcado no es una migracion normal y
  conviene saberlo antes de ejecutarlo a mano.
*/

-- private.registrar_movimiento(p_tipo text, p_signo integer, p_almacen bigint, p_articulo bigint, p_cantidad numeric, p_costo_usd numeric, p_nota text, p_orden bigint, p_renglon bigint, p_origen bigint, p_fecha date, p_empleado bigint, p_clase text, p_nota_salida text, p_aviso_costo numeric, p_cantidad_capturada numeric, p_unidad_capturada text, p_suelto_capturado numeric, p_costo_capturado numeric, p_costo_unidad_capturada text, p_moneda_capturada text, p_propietario text, p_razon_salida text)
-- venia de: 20260915171000_los_traslados_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION private.registrar_movimiento(p_tipo text, p_signo integer, p_almacen bigint, p_articulo bigint, p_cantidad numeric, p_costo_usd numeric, p_nota text DEFAULT NULL::text, p_orden bigint DEFAULT NULL::bigint, p_renglon bigint DEFAULT NULL::bigint, p_origen bigint DEFAULT NULL::bigint, p_fecha date DEFAULT NULL::date, p_empleado bigint DEFAULT NULL::bigint, p_clase text DEFAULT NULL::text, p_nota_salida text DEFAULT NULL::text, p_aviso_costo numeric DEFAULT NULL::numeric, p_cantidad_capturada numeric DEFAULT NULL::numeric, p_unidad_capturada text DEFAULT NULL::text, p_suelto_capturado numeric DEFAULT NULL::numeric, p_costo_capturado numeric DEFAULT NULL::numeric, p_costo_unidad_capturada text DEFAULT NULL::text, p_moneda_capturada text DEFAULT NULL::text, p_propietario text DEFAULT NULL::text, p_razon_salida text DEFAULT NULL::text)
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

  /*
    UN PATIO DE MAQUINAS NO GUARDA MATERIAL, y este es el unico sitio de toda la
    base que escribe en `inventario_movimientos` — comprobado contra pg_proc, no
    de memoria. Poniendo el cierre aqui lo heredan las catorce puertas del
    inventario y las que se escriban mañana.
  */
  if exists (select 1 from public.almacenes a
              where a.id = p_almacen and a.tipo = 'PATIO_MAQUINAS') then
    raise exception '«%» es un patio de maquinas: ahi no se guarda material.',
      (select nombre from public.almacenes where id = p_almacen)
      using errcode = '22023',
            hint = 'Sirve para decir donde se resguarda una maquina o un vehiculo, no para llevar existencias.';
  end if;

  /*
    «EN CAMINO» SOLO LO MUEVEN LOS TRASLADOS.

    Es donde espera lo que ya salió de un sitio y todavía no llegó al otro. Una
    salida o una entrada suelta ahí dejaría un traslado sin su material, o
    material sin traslado. Las funciones de traslado encienden esta marca, que
    muere con la transacción, y ninguna otra puerta la tiene.
  */
  if exists (select 1 from public.almacenes a
              where a.id = p_almacen and a.tipo = 'TRANSITO')
     and coalesce(current_setting('cantera.traslado_en_curso', true), '') <> 'si' then
    raise exception '«%» es donde espera lo que va de un sitio a otro: solo lo mueven los traslados.',
      (select nombre from public.almacenes where id = p_almacen)
      using errcode = '22023',
            hint = 'Para sacar algo de ahí, recibe o cancela su traslado en Transferencias.';
  end if;

  select unidad into v_unidad from public.articulos where id = p_articulo;
  if v_unidad is null then
    raise exception 'No existe el artículo %.', p_articulo using errcode = 'P0002';
  end if;

  /*
    DE QUIEN ES LO QUE SE MUEVE. Ver el comentario de la columna: al entrar es
    del dueño del almacen salvo que se diga; al salir, del unico que haya; y si
    hay varios se para, porque adivinar seria inventar de quien era.
  */
  v_dueno := nullif(btrim(coalesce(p_propietario, '')), '');

  if v_dueno is null then
    if p_signo = 1 then
      select a.propietario into v_dueno from public.almacenes a where a.id = p_almacen;
      v_dueno := coalesce(v_dueno, 'LACANTERA');
    else
      -- La regla vive en un solo sitio: ver `private.dueno_del_saldo`.
      v_dueno := private.dueno_del_saldo(p_almacen, p_articulo, null);
    end if;
  end if;

  /*
    Y QUE ALCANCE LO DE ESE DUEÑO, no lo que hay en total. Solo se comprueba
    cuando el sitio tiene mezcla: en un sitio de un solo dueño el saldo suyo ES
    el total, y la comprobacion de quien llama ya lo cubrio con mejor mensaje.
  */
  -- Siempre en las salidas, lo diga quien lo diga: la version anterior solo
  -- comprobaba cuando el dueño se habia resuelto solo, que es justo el caso en
  -- que no hace falta.
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

  /*
    Todo esto se escribe AQUI y no despues con un update, porque el libro es
    inmutable: `trg_movimientos_inmutables` rechaza UPDATE y DELETE. Un dato del
    movimiento nace con el movimiento.

    COMO SE CONTO, ADEMAS DE CUANTO ES. `cantidad` es siempre la unidad de
    operacion —de ahi salen la existencia y todos los calculos— y al lado queda
    lo que la persona dijo: «7 TAMBOR + 10 L». Se guarda el trio entero y no se
    deriva ninguno de los otros dos, porque `unidades_por_presentacion` puede
    cambiar en el catalogo y entonces el movimiento viejo contaria una mentira
    nueva. Un asiento tiene que poder leerse dentro de diez anos sin depender de
    una tabla que se edita.
  */
  insert into public.inventario_movimientos
    (numero, fecha, tipo, signo, almacen_id, articulo_id, cantidad, unidad,
     costo_usd, orden_id, orden_renglon_id, movimiento_origen, nota, empleado_id,
     entrega_clase, registrado_por, nota_salida, aviso_costo, propietario,
     cantidad_capturada, unidad_capturada, suelto_capturado, costo_capturado, costo_unidad_capturada, moneda_capturada, razon_salida)
  values
    (private.siguiente_numero('MOV'), coalesce(p_fecha, current_date), p_tipo, p_signo,
     p_almacen, p_articulo, p_cantidad, v_unidad, p_costo_usd, -- un hueco es un hueco
     p_orden, p_renglon, p_origen, nullif(trim(coalesce(p_nota, '')), ''), p_empleado,
     p_clase, (select auth.uid()), p_nota_salida, p_aviso_costo, v_dueno,
     nullif(p_cantidad_capturada, 0),
     nullif(btrim(coalesce(p_unidad_capturada, '')), ''),
     nullif(p_suelto_capturado, 0),
     p_costo_capturado,
     nullif(btrim(coalesce(p_costo_unidad_capturada, '')), ''),
     nullif(btrim(coalesce(p_moneda_capturada, '')), ''),
     -- Por qué salió, con las palabras de la lista: ver la columna.
     nullif(btrim(coalesce(p_razon_salida, '')), ''))
  returning id into v_id;

  return v_id;
end;
$function$;

-- public.clases_de_salida(p_incluir_apagadas boolean)
-- venia de: 20260824350000_la_clase_de_salida_la_lleva_la_empresa.sql
CREATE OR REPLACE FUNCTION public.clases_de_salida(p_incluir_apagadas boolean DEFAULT false)
 RETURNS SETOF clases_de_salida
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.clases_de_salida
   where tipo <> 'SALIDA_BAJA'
     and (activa or coalesce(p_incluir_apagadas, false))
   order by orden, nombre;
$function$;

-- public.guardar_clase_de_salida(p_codigo text, p_nombre text, p_pista text, p_tipo text, p_causa_baja text, p_orden smallint, p_exige_detalle boolean, p_activa boolean)
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.guardar_clase_de_salida(p_codigo text DEFAULT NULL::text, p_nombre text DEFAULT NULL::text, p_pista text DEFAULT NULL::text, p_tipo text DEFAULT 'SALIDA_CONSUMO'::text, p_causa_baja text DEFAULT NULL::text, p_orden smallint DEFAULT NULL::smallint, p_exige_detalle boolean DEFAULT false, p_activa boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_codigo text;
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');

  -- Las razones que daban el material por perdido se quitaron el 15/09/2026.
  if p_tipo = 'SALIDA_BAJA'
     or nullif(btrim(coalesce(p_causa_baja, '')), '') is not null
     or exists (select 1 from public.clases_de_salida c
                 where c.codigo = p_codigo and c.tipo = 'SALIDA_BAJA') then
    raise exception 'Esa razón ya no se puede usar.' using errcode = '22023';
  end if;

  if length(v_nombre) < 3 then
    raise exception 'La clase necesita un nombre.' using errcode = '22023';
  end if;

  if p_codigo is null then
    v_codigo := private.codigo_desde_nombre(v_nombre);
    if exists (select 1 from public.clases_de_salida c where c.codigo = v_codigo) then
      raise exception 'Ya hay una clase que se llama así.' using errcode = '23505';
    end if;

    insert into public.clases_de_salida
      (codigo, nombre, pista, tipo, causa_baja, orden, exige_detalle, activa)
    values
      (v_codigo, v_nombre, nullif(btrim(coalesce(p_pista, '')), ''),
       p_tipo, nullif(btrim(coalesce(p_causa_baja, '')), ''),
       coalesce(p_orden, 100::smallint), coalesce(p_exige_detalle, false),
       coalesce(p_activa, true));

    return v_codigo;
  end if;

  if not exists (select 1 from public.clases_de_salida c where c.codigo = p_codigo) then
    raise exception 'No existe la clase "%".', p_codigo using errcode = 'P0002';
  end if;

  -- El nombre y la pista se corrigen; a dónde va NO se toca al editar. Recolgar
  -- «se usó trabajando» a una baja cambiaría informes ya emitidos, y quien lo
  -- hiciera no tendría forma de saberlo.
  update public.clases_de_salida
     set nombre = v_nombre,
         pista = nullif(btrim(coalesce(p_pista, '')), ''),
         orden = coalesce(p_orden, orden),
         exige_detalle = coalesce(p_exige_detalle, exige_detalle),
         activa = coalesce(p_activa, true)
   where codigo = p_codigo;

  return p_codigo;
end;
$function$;

-- public.historial_articulo(p_articulo_id bigint, p_limite integer)
-- venia de: 20260824310000_cada_ficha_cuenta_lo_que_le_ha_pasado.sql
CREATE OR REPLACE FUNCTION public.historial_articulo(p_articulo_id bigint, p_limite integer DEFAULT 200)
 RETURNS TABLE(cuando timestamp with time zone, fecha date, clase text, titulo text, detalle text, cantidad numeric, unidad text, signo smallint, valor_usd numeric, lugar text, persona text, quien text, documento text, ruta text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  return query
  select * from (
    select a.creado_en as cuando, a.creado_en::date as fecha, 'ALTA'::text as clase,
           'Se creó en el catálogo'::text as titulo,
           a.categoria || ' · ' || a.unidad as detalle,
           null::numeric as cantidad, null::text as unidad, 0::smallint as signo,
           null::numeric as valor_usd, null::text as lugar, null::text as persona,
           coalesce(p.nombre, p.usuario) as quien,
           a.codigo as documento, '/app/inventario/articulos'::text as ruta
      from public.articulos a
      left join public.perfiles p on p.id = a.creado_por
     where a.id = p_articulo_id

    union all

    select m.registrado_en, m.fecha, m.tipo,
           case m.tipo
             when 'ENTRADA_COMPRA'        then 'Entró por una compra'
             when 'ENTRADA_PRODUCCION'    then 'Entró por producción'
             when 'ENTRADA_DEVOLUCION'    then 'Volvió al almacén'
             when 'ENTRADA_DIRECTA'       then 'Entró sin compra de por medio'
             when 'SALIDA_CONSUMO'        then 'Salió para consumo'
             when 'SALIDA_DESPACHO'       then 'Salió en un despacho'
             when 'SALIDA_MERMA'          then 'Se perdió en el manejo'
             when 'SALIDA_BAJA'           then 'Salió'
             when 'AJUSTE_POSITIVO'       then 'Ajuste: sobraba'
             when 'AJUSTE_NEGATIVO'       then 'Ajuste: faltaba'
             when 'TRANSFERENCIA_SALIDA'  then 'Se trasladó a otro almacén'
             when 'TRANSFERENCIA_ENTRADA' then 'Llegó de otro almacén'
             when 'REVERSO'               then 'Se deshizo un movimiento'
             else m.tipo
           end
            -- El motivo, con las mismas palabras que el libro y el papel.
            || coalesce(' · ' || coalesce(m.razon_salida,
                 (select case b.causa when 'DANADO'     then 'Dañado'
                                      when 'OBSOLETO'   then 'Obsoleto'
                                      when 'VENCIDO'    then 'Vencido'
                                      when 'EXTRAVIADO' then 'Extraviado'
                                      when 'ROBADO'     then 'Robado'
                                      else b.causa end
                    from public.inventario_bajas b
                   where b.movimiento_id = m.id
                   limit 1)), ''),
           m.nota, m.cantidad, m.unidad, m.signo::smallint, m.valor_usd,
           al.nombre,
           case when e.id is not null then e.nombres || ' ' || e.apellidos end,
           coalesce(pf.nombre, pf.usuario),
           coalesce(m.nota_salida, m.numero), '/app/inventario/movimientos'
      from public.inventario_movimientos m
      join public.almacenes al on al.id = m.almacen_id
      left join public.perfiles  pf on pf.id = m.registrado_por
      left join public.empleados e  on e.id  = m.empleado_id
     where m.articulo_id = p_articulo_id

    union all

    select g.creado_en, g.fecha_entrega, 'ENTREGA'::text,
           case g.clase when 'DOTACION' then 'Se entregó como dotación'
                        else 'Se asignó para una actividad' end,
           g.nota, g.cantidad, null::text, (-1)::smallint, g.costo_usd,
           al.nombre, e.nombres || ' ' || e.apellidos,
           coalesce(pf.nombre, pf.usuario),
           g.numero, '/app/inventario/articulos'
      from public.asignaciones_herramienta g
      join public.almacenes al on al.id = g.almacen_id
      join public.empleados e  on e.id  = g.empleado_id
      left join public.perfiles pf on pf.id = g.entregado_por
     where g.articulo_id = p_articulo_id

    union all

    select g.fecha_devolucion::timestamptz, g.fecha_devolucion, 'DEVOLUCION'::text,
           'La devolvió'::text,
           g.nota, g.cantidad, null::text, 1::smallint, null::numeric,
           al.nombre, e.nombres || ' ' || e.apellidos, null::text,
           g.numero, '/app/inventario/articulos'
      from public.asignaciones_herramienta g
      join public.almacenes al on al.id = g.almacen_id
      join public.empleados e  on e.id  = g.empleado_id
     where g.articulo_id = p_articulo_id
       and g.fecha_devolucion is not null

    union all

    select g.fecha_perdida::timestamptz, g.fecha_perdida, g.estado,
           case g.estado when 'PERDIDA' then 'Se dio por perdida'
                         when 'DANADA'  then 'Se reportó dañada'
                         else 'Incidencia' end,
           g.motivo, g.cantidad, null::text, 0::smallint, g.costo_usd,
           al.nombre, e.nombres || ' ' || e.apellidos, null::text,
           g.numero, '/app/inventario/articulos'
      from public.asignaciones_herramienta g
      join public.almacenes al on al.id = g.almacen_id
      join public.empleados e  on e.id  = g.empleado_id
     where g.articulo_id = p_articulo_id
       and g.fecha_perdida is not null
       and g.estado in ('PERDIDA', 'DANADA', 'REPUESTA')

    union all

    select g.saldado_el::timestamptz, g.saldado_el, 'REPUESTA'::text,
           case g.saldado_como
             when 'DESCUENTO'  then 'Se saldó con descuento de nómina'
             when 'REPOSICION' then 'La repuso'
             when 'EXONERADO'  then 'Se le exoneró'
             else 'Se saldó' end,
           g.motivo, g.cantidad, null::text, 0::smallint, null::numeric,
           al.nombre, e.nombres || ' ' || e.apellidos, null::text,
           g.numero, '/app/inventario/articulos'
      from public.asignaciones_herramienta g
      join public.almacenes al on al.id = g.almacen_id
      join public.empleados e  on e.id  = g.empleado_id
     where g.articulo_id = p_articulo_id
       and g.saldado_el is not null

    union all

    select o.registrado_en, o.fecha, 'TALLER'::text,
           format('Se mandó al taller · %s', lower(o.tipo)),
           concat_ws(' · ', o.motivo, nullif(esp.nombre, ''),
             case when o.urgencia is not null then 'urgencia ' || lower(o.urgencia) end),
           o.cantidad, null::text, (-1)::smallint, null::numeric,
           t.nombre, null::text, coalesce(p.nombre, p.usuario),
           o.numero, '/app/inventario/talleres'
      from public.mantenimientos o
      left join public.almacenes t on t.id = o.taller_id
      left join public.especialidades_taller esp on esp.codigo = o.especialidad
      left join public.perfiles p on p.id = o.registrado_por
     where o.articulo_id = p_articulo_id

    union all

    select coalesce(o.cerrado_en, o.fecha_salida::timestamptz),
           coalesce(o.fecha_salida, o.cerrado_en::date), 'TALLER'::text,
           'Volvió del taller'::text,
           concat_ws(' · ', nullif(o.detalle, ''),
             case when o.cantidad_devuelta is not null and o.cantidad is not null
                       and o.cantidad_devuelta < o.cantidad
                  then format('faltaron %s', o.cantidad - o.cantidad_devuelta) end),
           coalesce(o.cantidad_devuelta, o.cantidad), null::text, 1::smallint,
           coalesce(o.costo_usd, 0) + coalesce(o.costo_repuestos_usd, 0),
           t.nombre, null::text, coalesce(p.nombre, p.usuario),
           o.numero, '/app/inventario/talleres'
      from public.mantenimientos o
      left join public.almacenes t on t.id = o.taller_id
      left join public.perfiles p on p.id = o.cerrado_por
     where o.articulo_id = p_articulo_id
       and o.estado = 'CERRADO'
       and coalesce(o.cerrado_en, o.fecha_salida::timestamptz) is not null
  ) h
  order by h.cuando desc nulls last
  limit coalesce(p_limite, 200);
end;
$function$;

-- public.registrar_salidas(p_almacen_id bigint, p_renglones jsonb, p_motivo text, p_tipo text, p_fecha date)
-- venia de: 20260910390000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.registrar_salidas(p_almacen_id bigint DEFAULT NULL::bigint, p_renglones jsonb DEFAULT NULL::jsonb, p_motivo text DEFAULT NULL::text, p_tipo text DEFAULT 'SALIDA_CONSUMO'::text, p_fecha date DEFAULT NULL::date)
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
  v_nombre_pres text; v_dueno text;
begin
  perform private.exigir_rol('ALMACEN');

  select * into v_clase from public.clases_de_salida where codigo = p_tipo;
  if v_clase.codigo is not null then
    if not v_clase.activa then
      raise exception 'La clase "%" está apagada.', v_clase.nombre using errcode = '22023';
    end if;
    if v_clase.tipo = 'SALIDA_BAJA' then
      raise exception 'La razón "%" ya no se usa: elige otra de la lista.', v_clase.nombre
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

  if coalesce(v_clase.exige_detalle, false) then
    if length(btrim(coalesce(p_motivo, ''))) < 10 then
      raise exception 'Explica qué pasó, con detalle. Dentro de un año esta frase será lo único que quede.'
        using errcode = '22023';
    end if;
  elsif length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe para qué sale. Una salida sin motivo no se puede auditar.' using errcode = '22023';
  end if;

  /*
    Primera pasada: comprobar. Nada se mueve todavia, para que un renglon malo
    no deje tres salidas hechas y dos no.

    LA CONVERSION ENTRA EN LOS TRES SITIOS, y esto es lo delicado de esta
    funcion: aqui, en la suma de los renglones anteriores, y en la pasada de
    escritura. Convertir solo en uno dejaria la reja de existencia comparando
    tambores contra litros, que es peor que no convertir.
  */
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
      btrim(p_motivo), null, null, null, p_fecha, null, null, v_nota, null,
      p_cantidad_capturada => nullif(v_pres, 0),
      p_propietario => v_dueno,
      p_unidad_capturada => case when v_pres > 0 then private.presentacion_usada(v_articulo, nullif(btrim(coalesce(v_r->>'presentacion', '')), '')) end,
      p_suelto_capturado => case when v_pres > 0 then nullif(v_sueltas, 0) end,
      -- Por qué salió, con las palabras de la lista: ver la columna del libro.
      p_razon_salida => v_clase.nombre);
  end loop;

  return v_nota;
end;
$function$;
