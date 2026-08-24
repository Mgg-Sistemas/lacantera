-- ---------------------------------------------------------------------------
-- Un hecho se ordena por cuándo pasó, no por cuándo alguien lo escribió
--
-- Salió al EJECUTAR `historial_vehiculo` con datos fabricados —que es como hay
-- que probar una función, y no leyéndola—. Con un chofer que se hizo cargo el 25
-- de julio, la línea de tiempo lo ponía arriba del todo, por delante de cosas
-- del 24 de agosto:
--
--   CHOFER       Se hizo cargo CHOFER DE ENSAYO      2026-07-25   <- primero
--   ALTA         Se dio de alta                      2026-08-24
--   COMBUSTIBLE  Se le echó 10,00 de GASOIL          2026-08-24
--
-- Porque ordenaba por `creada_en` —el instante en que alguien tecleó la fila— y
-- enseñaba `desde`. Las dos columnas son ciertas y no son la misma cosa: un
-- traspaso de chofer se anota cuando se acuerda uno, y un vale de combustible
-- transcrito al día siguiente lleva la fecha del día en que se surtió.
--
-- La regla queda: **`cuando` es el instante en que OCURRIÓ**. El de registro se
-- reserva para lo que no tiene otra fecha —una anulación, un cambio de estado—,
-- donde teclear y ocurrir son lo mismo.
--
-- El vale usa `fecha + hora` con el huso de Caracas, porque la hora sí se guarda
-- cuando se sabe. Un vale sin hora entra a las 00:00 del día que le toca, que en
-- una lista ordenada por día es exactamente donde debe estar.
--
-- =========================================================================
-- Y EL ALTA NO SE DA DOS VECES
-- =========================================================================
--
-- La ficha del camión enseñaba dos «Se dio de alta»: la del vehículo y la de su
-- máquina. Son el mismo camión contado dos veces desde dos módulos, y en una
-- línea de tiempo eso solo confunde. Se queda la del vehículo, que es la ficha
-- en la que se está.
--
-- COMPROBADO, con un vehículo y un chofer fabricados en transacción revertida:
--
--   ALTA         Se dio de alta                      2026-08-24
--   COMBUSTIBLE  Se le echó 10,00 de GASOIL          2026-08-24
--   ESTADO       Pasó a en espera                    2026-08-24
--   FICHA        Se corrigió la ficha                2026-08-24
--   CHOFER       Lo dejó CHOFER DE ENSAYO            2026-08-19
--   CHOFER       Se hizo cargo CHOFER DE ENSAYO      2026-07-25
--
-- Un alta, y de lo más nuevo a lo más viejo.
-- ---------------------------------------------------------------------------

create or replace function private.hechos_de_maquina(p_maquina_id bigint)
returns table (
  cuando    timestamptz,
  fecha     date,
  clase     text,
  titulo    text,
  detalle   text,
  cantidad  numeric,
  unidad    text,
  signo     smallint,
  valor_usd numeric,
  lugar     text,
  persona   text,
  quien     text,
  documento text,
  ruta      text
)
language sql
stable
security definer
set search_path to ''
as $func$
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

  -- La anulación sí se fecha por el registro: anular y que ocurra son lo mismo.
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
$func$;

comment on function private.hechos_de_maquina(bigint) is
  'Todo lo que le ha pasado a una máquina, SIN comprobar permiso, y fechado por cuándo pasó y no por cuándo se tecleó. Lo usan la ficha de la máquina y la del camión que es esa máquina.';

create or replace function public.historial_vehiculo(
  p_vehiculo_id bigint,
  p_limite      integer default 200
)
returns table (
  cuando    timestamptz,
  fecha     date,
  clase     text,
  titulo    text,
  detalle   text,
  cantidad  numeric,
  unidad    text,
  signo     smallint,
  valor_usd numeric,
  lugar     text,
  persona   text,
  quien     text,
  documento text,
  ruta      text
)
language plpgsql
stable
security definer
set search_path to ''
as $func$
declare
  v_maquina bigint;
begin
  perform private.exigir_permiso('DESPACHOS', 'LECTURA');

  select v.maquina_id into v_maquina from public.vehiculos v where v.id = p_vehiculo_id;

  return query
  select * from (
    select v.creado_en as cuando, v.creado_en::date as fecha, 'ALTA'::text as clase,
           'Se dio de alta'::text as titulo,
           concat_ws(' · ', v.tipo,
             case when v.propio then 'propio' else 'de ' || coalesce(v.transportista, 'un transportista') end,
             nullif(v.descripcion, '')) as detalle,
           null::numeric as cantidad, null::text as unidad, 0::smallint as signo,
           null::numeric as valor_usd, null::text as lugar, null::text as persona,
           coalesce(p.nombre, p.usuario) as quien,
           v.placa as documento, '/app/despachos/vehiculos'::text as ruta
      from public.vehiculos v
      left join public.perfiles p on p.id = v.creado_por
     where v.id = p_vehiculo_id

    union all

    select a.fecha::timestamptz, a.fecha, a.tipo,
           concat_ws(' · ', a.tipo, nullif(a.estado, '')),
           a.detalle, a.cantidad, a.unidad, 0::smallint, null::numeric,
           null::text, null::text, null::text,
           a.numero, '/app/despachos'
      from public.v_vehiculo_actividad a
     where a.vehiculo_id = p_vehiculo_id

    union all

    -- Se hizo cargo el día que empezó, no el día que alguien lo anotó.
    select c.desde::timestamptz, c.desde, 'CHOFER'::text,
           format('Se hizo cargo %s', coalesce(c.nombre, 'alguien')),
           concat_ws(' · ', nullif(c.motivo, ''), nullif(c.nota, '')),
           null::numeric, null::text, 0::smallint, null::numeric,
           null::text, c.nombre, null::text,
           nullif(c.cedula, ''), '/app/despachos/vehiculos'
      from public.vehiculo_choferes c
     where c.vehiculo_id = p_vehiculo_id

    union all

    select c.hasta::timestamptz, c.hasta, 'CHOFER'::text,
           format('Lo dejó %s', coalesce(c.nombre, 'alguien')),
           concat_ws(' · ', nullif(c.motivo, ''),
             format('lo manejó %s días', (c.hasta - c.desde))),
           null::numeric, null::text, 0::smallint, null::numeric,
           null::text, c.nombre, null::text,
           nullif(c.cedula, ''), '/app/despachos/vehiculos'
      from public.vehiculo_choferes c
     where c.vehiculo_id = p_vehiculo_id
       and c.hasta is not null

    union all

    -- Lo de su máquina, menos el alta: el camión ya tiene la suya arriba, y dos
    -- «se dio de alta» en la misma línea de tiempo solo confunden.
    select m.cuando, m.fecha, m.clase, m.titulo, m.detalle, m.cantidad, m.unidad,
           m.signo, m.valor_usd, m.lugar, m.persona, m.quien, m.documento, m.ruta
      from private.hechos_de_maquina(v_maquina) m
     where v_maquina is not null
       and m.clase <> 'ALTA'
       and private.tiene_permiso('MAQUINARIA', 'LECTURA')
  ) h
  order by h.cuando desc nulls last
  limit coalesce(p_limite, 200);
end;
$func$;

comment on function public.historial_vehiculo(bigint, integer) is
  'Lo que le ha pasado a un vehículo: viajes, traspasos de chofer y —si es propio y quien mira tiene maquinaria— también su combustible, sus horas y sus pasos por el taller.';

revoke all on function public.historial_vehiculo(bigint, integer) from public;
revoke all on function public.historial_vehiculo(bigint, integer) from anon;
grant execute on function public.historial_vehiculo(bigint, integer) to authenticated;
