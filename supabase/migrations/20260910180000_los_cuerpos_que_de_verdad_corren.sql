/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  1 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
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
  viva —no normalizado, no perdonando comentarios— y los 1 coinciden. Y el
  detector, que antes marcaba estas 1, pasa a cero.

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

-- private.hechos_de_maquina(p_maquina_id bigint)
-- venia de: 20260824330000_un_hecho_se_ordena_por_cuando_paso.sql
CREATE OR REPLACE FUNCTION private.hechos_de_maquina(p_maquina_id bigint)
 RETURNS TABLE(cuando timestamp with time zone, fecha date, clase text, titulo text, detalle text, cantidad numeric, unidad text, signo smallint, valor_usd numeric, lugar text, persona text, quien text, documento text, ruta text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.creada_en, m.creada_en::date, 'ALTA'::text,
         'Se dio de alta'::text,
         concat_ws(' · ', m.tipo, nullif(m.marca, ''), nullif(m.modelo, '')),
         null::numeric, null::text, 0::smallint, null::numeric,
         a.nombre, null::text, coalesce(p.nombre, p.usuario),
         m.codigo, '/app/maquinaria/' || m.id::text
    from public.maquinaria m
    left join public.almacenes a on a.id = m.almacen_id
    left join public.perfiles  p on p.id = m.creada_por
   where m.id = p_maquina_id

  union all

  -- El instante del surtido, no el del tecleo: un vale transcrito al día
  -- siguiente lleva la fecha del día que se surtió, y ahí es donde va en la
  -- línea. La hora entra cuando se sabe; si no, el día a secas.
  select (d.fecha + coalesce(d.hora, '00:00'::time)) at time zone 'America/Caracas',
         d.fecha, 'COMBUSTIBLE'::text,
         format('Se le echó %s de %s', round(d.cantidad, 2), ar.nombre),
         concat_ws(' · ',
           nullif(coalesce(mo.nombre, d.motivo), ''),
           nullif(d.motivo_detalle, ''),
           case when d.horometro is not null
                then format('horómetro %s', round(d.horometro, 2)) end,
           nullif(d.nota, '')),
         d.cantidad, ar.unidad, 1::smallint, d.costo_usd,
         al.nombre, nullif(d.recibio_nombre, ''), nullif(d.surtio_nombre, ''),
         d.numero, '/app/combustible'
    from public.despachos_combustible d
    join public.articulos ar on ar.id = d.articulo_id
    left join public.almacenes al on al.id = d.almacen_id
    left join public.motivos_despacho mo on mo.codigo = d.motivo
   where d.maquina_id = p_maquina_id

  union all

  select (l.fecha::timestamptz), l.fecha, 'HOROMETRO'::text,
         format('Trabajó %s horas', round(l.horas, 2)),
         concat_ws(' · ',
           format('de %s a %s', round(l.inicial, 2), round(l.final, 2)),
           nullif(l.nota, '')),
         l.horas, 'h'::text, 0::smallint, null::numeric,
         null::text,
         case when e.id is not null then e.nombres || ' ' || e.apellidos end,
         coalesce(p.nombre, p.usuario),
         null::text, '/app/maquinaria/' || p_maquina_id::text
    from public.horometro_lecturas l
    left join public.empleados e on e.id = l.operador_id
    left join public.perfiles  p on p.id = l.creada_por
   where l.maquina_id = p_maquina_id

  union all

  select o.fecha::timestamptz, o.fecha, 'TALLER'::text,
         format('Entró al taller · %s', lower(o.tipo)),
         concat_ws(' · ',
           o.motivo,
           nullif(esp.nombre, ''),
           case when o.urgencia is not null then 'urgencia ' || lower(o.urgencia) end,
           case when o.dias_estimados is not null
                then format('%s días previstos', o.dias_estimados) end),
         null::numeric, null::text, 0::smallint, null::numeric,
         t.nombre, null::text, coalesce(p.nombre, p.usuario),
         o.numero, '/app/maquinaria/mantenimientos'
    from public.mantenimientos o
    left join public.almacenes t on t.id = o.taller_id
    left join public.especialidades_taller esp on esp.codigo = o.especialidad
    left join public.perfiles p on p.id = o.registrado_por
   where o.maquina_id = p_maquina_id

  union all

  select coalesce(o.fecha_salida::timestamptz, o.cerrado_en),
         coalesce(o.fecha_salida, o.cerrado_en::date), 'TALLER'::text,
         format('Salió del taller · %s', lower(o.tipo)),
         concat_ws(' · ',
           nullif(o.detalle, ''),
           case when o.fecha_salida is not null
                then format('%s días dentro', (o.fecha_salida - o.fecha)) end),
         null::numeric, null::text, 0::smallint,
         coalesce(o.costo_usd, 0) + coalesce(o.costo_repuestos_usd, 0),
         t.nombre, null::text, coalesce(p.nombre, p.usuario),
         o.numero, '/app/maquinaria/mantenimientos'
    from public.mantenimientos o
    left join public.almacenes t on t.id = o.taller_id
    left join public.perfiles p on p.id = o.cerrado_por
   where o.maquina_id = p_maquina_id
     and o.estado = 'CERRADO'
     and coalesce(o.fecha_salida::timestamptz, o.cerrado_en) is not null

  union all

  select o.anulado_en, o.anulado_en::date, 'TALLER'::text,
         format('Se anuló la orden · %s', lower(o.tipo)),
         coalesce(nullif(o.motivo_anulacion, ''), o.motivo),
         null::numeric, null::text, 0::smallint, null::numeric,
         t.nombre, null::text, coalesce(p.nombre, p.usuario),
         o.numero, '/app/maquinaria/mantenimientos'
    from public.mantenimientos o
    left join public.almacenes t on t.id = o.taller_id
    left join public.perfiles p on p.id = o.anulado_por
   where o.maquina_id = p_maquina_id
     and o.estado = 'ANULADO'
     and o.anulado_en is not null

  union all

  select coalesce(o.fecha_salida::timestamptz, r.creado_en),
         coalesce(o.fecha_salida, o.fecha), 'REPUESTO'::text,
         format('Se le montó %s de %s', round(r.cantidad, 2), ar.nombre),
         case r.estado when 'PREVISTO' then 'Previsto, todavía sin montar'
                       else 'Usado en ' || o.numero end,
         r.cantidad, ar.unidad, 1::smallint, r.costo_usd,
         t.nombre, null::text, null::text,
         o.numero, '/app/maquinaria/mantenimientos'
    from public.mantenimiento_repuestos r
    join public.mantenimientos o on o.id = r.mantenimiento_id
    join public.articulos ar on ar.id = r.articulo_id
    left join public.almacenes t on t.id = o.taller_id
   where o.maquina_id = p_maquina_id

  union all

  select au.ocurrido_en, au.ocurrido_en::date, 'ESTADO'::text,
         format('Pasó a %s',
           lower(replace(coalesce(au.despues->>'estado', ''), '_', ' '))),
         concat_ws(' · ',
           format('venía de %s',
             lower(replace(coalesce(au.antes->>'estado', ''), '_', ' '))),
           nullif(au.despues->>'nota', '')),
         null::numeric, null::text, 0::smallint, null::numeric,
         null::text, null::text, nullif(au.nombre, ''),
         null::text, '/app/maquinaria/' || p_maquina_id::text
    from public.auditoria au
   where au.tabla = 'maquinaria'
     and au.fila_id = p_maquina_id::text
     and au.operacion = 'UPDATE'
     and au.antes->>'estado' is distinct from au.despues->>'estado'

  union all

  select au.ocurrido_en, au.ocurrido_en::date, 'FICHA'::text,
         'Se corrigió la ficha'::text,
         'Cambió ' || array_to_string(au.cambios, ', '),
         null::numeric, null::text, 0::smallint, null::numeric,
         null::text, null::text, nullif(au.nombre, ''),
         null::text, '/app/maquinaria/' || p_maquina_id::text
    from public.auditoria au
   where au.tabla = 'maquinaria'
     and au.fila_id = p_maquina_id::text
     and au.operacion = 'UPDATE'
     and au.antes->>'estado' is not distinct from au.despues->>'estado'
     and coalesce(array_length(au.cambios, 1), 0) > 0

  union all

  select g.fecha::timestamptz, g.fecha, 'MODIFICACION'::text,
         format('Se le instaló %s', g.nombre),
         concat_ws(' · ',
           g.motivo,
           nullif(g.serial, ''),
           case when g.cantidad is not null
                then format('%s unidades', private.cantidad_es(g.cantidad)) end,
           nullif(g.nota, '')),
         g.cantidad, null::text, 1::smallint, g.costo_usd,
         null::text, nullif(g.hecho_por, ''), coalesce(pp.nombre, pp.usuario),
         null::text, '/app/maquinaria/' || p_maquina_id::text
    from public.maquina_agregados g
    left join public.perfiles pp on pp.id = g.puesto_por
   where g.maquina_id = p_maquina_id

  union all

  select g.retirado_el::timestamptz, g.retirado_el, 'MODIFICACION'::text,
         format('Se le quitó %s', g.nombre),
         concat_ws(' · ',
           g.motivo_retiro,
           format('lo llevó desde el %s', to_char(g.fecha, 'DD/MM/YYYY'))),
         g.cantidad, null::text, -1::smallint, null::numeric,
         null::text, null::text, coalesce(pr.nombre, pr.usuario),
         null::text, '/app/maquinaria/' || p_maquina_id::text
    from public.maquina_agregados g
    left join public.perfiles pr on pr.id = g.retirado_por
   where g.maquina_id = p_maquina_id
     and g.retirado_el is not null
$function$;
