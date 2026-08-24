-- ---------------------------------------------------------------------------
-- Cada ficha cuenta lo que le ha pasado
--
-- Christopher: «necesito que cada item, maquinaria, vehiculo, equipo, tenga su
-- propio historial, desde entradas, salidas, hasta reabastecimiento o
-- reparaciones, etc», y al preguntarle dónde: «dentro de las fichas que ya
-- existen».
--
-- Y encima de eso, la instrucción que manda sobre todas:
--
--   «recuerda evaluar lo existente antes de hacer cambios, así evitamos doble
--    trabajo o falso positivo»
--
-- Se evaluó, y salió caro: había DOS funciones creadas ayer —`historial_maquina`
-- e `historial_articulo`— que no estaban en ningún archivo de migración, que no
-- llamaba nadie desde el front, y una de las dos NI SIQUIERA CORRÍA. Ejecutarla
-- daba «column h.cuando does not exist», porque las ramas del union no llevaban
-- alias y el `order by h.cuando` de fuera no encontraba la columna. Se aplicó y
-- nunca se ejecutó. Es exactamente el fallo que la regla 7 avisa: no se
-- comprueba contra el archivo, se comprueba corriéndolo.
--
-- =========================================================================
-- UN SOLO CONTRATO DE FILA, PARA QUE NO HAYA UN OCTAVO DIALECTO
-- =========================================================================
--
-- Hoy hay SIETE formas distintas de pintar «una lista de hechos con fecha»
-- repartidas por las pantallas, y ninguna es un componente compartido. La
-- petición añade tres historiales más. Copiando, se pasa de siete a diez.
--
-- Así que las tres funciones devuelven EXACTAMENTE las mismas catorce columnas.
-- Ni una de ellas es superconjunto casual de las otras: es un contrato, y la
-- pantalla escribe un solo componente contra él.
--
-- El `signo` es lo que hace que una línea de tiempo se lea de un vistazo, y
-- significa: **desde el punto de vista de lo que estás mirando**, ¿entró o
-- salió? Doscientos litros de gasoil SALEN del tanque pero ENTRAN en la
-- excavadora; en la ficha de la excavadora son +1. Un repuesto que se le monta,
-- +1. Una lectura de horómetro no mueve nada: 0.
--
-- =========================================================================
-- FUNCIONES, NO VISTAS, Y ESTA VEZ POR UN MOTIVO CONCRETO
-- =========================================================================
--
-- `v_historial_articulo` es `security_invoker` y se apoya en RLS. Suena bien y
-- miente: `empleados` exige NOMINA:LECTURA, y ALMACEN tiene NOMINA en NINGUNO.
-- Un almacenista mirando la ficha de un casco ve «se entregó» sin A QUIÉN. La
-- columna sale nula y nada avisa. Ya pasó esta misma semana con el vale de
-- combustible, y se arregló igual: una función SECURITY DEFINER que hace su
-- propia comprobación de permiso y luego lee lo que necesita.
--
-- Y el modo de fallar queda igual en las tres: si falta el permiso, se LANZA.
-- Una vista sin permiso devuelve cero filas, y cero filas se pinta como «no ha
-- pasado nada», que es una mentira peor que un error.
--
-- =========================================================================
-- QUÉ SE AÑADE QUE NO ESTABA
-- =========================================================================
--
-- De la máquina:
--   · los repuestos que se le montaron, uno a uno (mantenimiento_repuestos),
--     que hasta hoy no se veían por máquina en ninguna pantalla
--   · el alta, que cierra la línea de tiempo por abajo
--   · los cambios de ficha que no son de estado —se mudó de almacén, le
--     cambiaron los umbrales—, que la auditoría ya guardaba y nadie leía
--   · la anulación de una orden fechada EL DÍA QUE SE ANULÓ. Antes la orden
--     anulada aparecía con la fecha en que se abrió, así que en la lista salía
--     en un sitio donde no pasó nada
--   · entrar y salir del taller como DOS hechos con DOS fechas, no uno
--
-- Del artículo:
--   · los viajes al taller (mantenimientos.articulo_id). El módulo de taller es
--     de ayer y la vista es anterior: las varillas que se mandan a rectificar no
--     aparecían en su propia historia
--   · el número de la nota de salida en papel, que también es de ayer
--
-- Del vehículo, que no tenía casi nada:
--   · lo de su máquina, cuando la tiene. Un chofer que abre la ficha de su
--     camión no veía cuándo se le echó gasoil: eso vivía del lado de maquinaria
--     y la ficha solo ponía un enlace «Ver en Maquinaria»
--   · los traspasos de chofer como hechos, no como periodos
--
-- El cruce de módulos se hace con `tiene_permiso` y no con `exigir_permiso`: si
-- quien mira el camión no tiene maquinaria, ve su parte y no revienta.
--
-- =========================================================================
-- LO QUE NO SE TOCA TODAVÍA, Y POR QUÉ
-- =========================================================================
--
-- `v_historial_articulo` se queda viva aunque ya no haga falta. El front que hay
-- en producción la lee AHORA MISMO, y esta base es la de producción: borrarla
-- rompería la ficha del artículo en vivo hasta que se publique el front nuevo.
-- Se marca como superada en su comentario y se borra en cuanto el front nuevo
-- esté publicado.
--
-- COMPROBADO, con datos fabricados en transacción revertida: ver la migración
-- gemela de ensayo al pie de este archivo, en el bloque `do $ensayo$`.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Los hechos de una máquina, sin comprobar permiso
--
-- Vive en `private` porque lo necesitan DOS puertas: la ficha de la máquina y
-- la del camión que es esa máquina. Escribir el union dos veces es garantizar
-- que dentro de un mes digan cosas distintas.
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
  -- El alta, que cierra la línea por abajo
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

  -- Lo que se le echó. Entra en la máquina, así que +1 aunque salga del tanque.
  select d.registrado_en, d.fecha, 'COMBUSTIBLE'::text,
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

  -- Lo que trabajó
  select l.creada_en, l.fecha, 'HOROMETRO'::text,
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

  -- Entró al taller
  select o.registrado_en, o.fecha, 'TALLER'::text,
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

  -- Salió del taller. Fecha propia: es otro día y otro hecho.
  select coalesce(o.cerrado_en, o.fecha_salida::timestamptz),
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
     and coalesce(o.cerrado_en, o.fecha_salida::timestamptz) is not null

  union all

  -- Se anuló la orden, el día que se anuló y no el día que se abrió
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

  -- Lo que se le montó. Hasta hoy no se veía por máquina en ninguna pantalla.
  select r.creado_en, coalesce(o.fecha_salida, o.fecha), 'REPUESTO'::text,
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

  -- Cuándo cambió de estado, y quién la mandó
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

  -- Los demás cambios de ficha. La auditoría ya los guardaba y nadie los leía.
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
  'Todo lo que le ha pasado a una máquina, SIN comprobar permiso. Lo usan la ficha de la máquina y la del camión que es esa máquina: escribir el union dos veces es garantizar que dentro de un mes digan cosas distintas.';

-- ---------------------------------------------------------------------------
-- La historia de una máquina
-- ---------------------------------------------------------------------------
drop function if exists public.historial_maquina(bigint, integer);

create or replace function public.historial_maquina(
  p_maquina_id bigint,
  p_limite     integer default 200
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
begin
  perform private.exigir_permiso('MAQUINARIA', 'LECTURA');

  return query
  select h.* from private.hechos_de_maquina(p_maquina_id) h
   order by h.cuando desc nulls last
   limit coalesce(p_limite, 200);
end;
$func$;

comment on function public.historial_maquina(bigint, integer) is
  'Lo que le ha pasado a una máquina: combustible, horas, taller, repuestos, cambios de estado y de ficha, en un solo hilo.';

revoke all on function public.historial_maquina(bigint, integer) from public;
revoke all on function public.historial_maquina(bigint, integer) from anon;
grant execute on function public.historial_maquina(bigint, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- La historia de un artículo
--
-- Se reescribe al contrato común. Añade lo que la vista no tiene: los viajes al
-- taller y el número de la nota de salida en papel, los dos de ayer.
-- ---------------------------------------------------------------------------
drop function if exists public.historial_articulo(bigint, integer);

create or replace function public.historial_articulo(
  p_articulo_id bigint,
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
begin
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  return query
  select * from (
    -- Nació en el catálogo
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

    -- Lo que lo movió. El documento es la nota de salida cuando la hay: es el
    -- papel que alguien firmó, y pesa más que el número interno del movimiento.
    select m.registrado_en, m.fecha, m.tipo,
           case m.tipo
             when 'ENTRADA_COMPRA'        then 'Entró por una compra'
             when 'ENTRADA_PRODUCCION'    then 'Entró por producción'
             when 'ENTRADA_DEVOLUCION'    then 'Volvió al almacén'
             when 'ENTRADA_DIRECTA'       then 'Entró sin compra de por medio'
             when 'SALIDA_CONSUMO'        then 'Salió para consumo'
             when 'SALIDA_DESPACHO'       then 'Salió en un despacho'
             when 'SALIDA_MERMA'          then 'Se perdió en el manejo'
             when 'SALIDA_BAJA'           then 'Se dio de baja'
             when 'AJUSTE_POSITIVO'       then 'Ajuste: sobraba'
             when 'AJUSTE_NEGATIVO'       then 'Ajuste: faltaba'
             when 'TRANSFERENCIA_SALIDA'  then 'Se trasladó a otro almacén'
             when 'TRANSFERENCIA_ENTRADA' then 'Llegó de otro almacén'
             when 'REVERSO'               then 'Se deshizo un movimiento'
             else m.tipo
           end,
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

    -- Se lo llevó alguien
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

    -- Y la devolvió
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

    -- O no la devolvió
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

    -- Y cómo se saldó
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

    -- Se fue al taller. El módulo de taller es de ayer y la vista es anterior:
    -- las varillas que se mandan a rectificar no salían en su propia historia.
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

    -- Y volvió
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
$func$;

comment on function public.historial_articulo(bigint, integer) is
  'Lo que le ha pasado a un artículo: entradas, salidas, entregas, viajes al taller y bajas, en un solo hilo. Sustituye a v_historial_articulo, que se borrará cuando el front nuevo esté publicado.';

revoke all on function public.historial_articulo(bigint, integer) from public;
revoke all on function public.historial_articulo(bigint, integer) from anon;
grant execute on function public.historial_articulo(bigint, integer) to authenticated;

comment on view public.v_historial_articulo is
  'SUPERADA por public.historial_articulo(). Se deja viva solo porque el front publicado todavía la lee; se borra en cuanto se publique el nuevo. No construir nada encima.';

-- ---------------------------------------------------------------------------
-- La historia de un vehículo
--
-- Un camión propio es DOS cosas a la vez: un vehículo que hace viajes y una
-- máquina que se mantiene. Hasta hoy la ficha del camión solo enseñaba la
-- primera mitad y ponía un enlace «Ver en Maquinaria» para la otra.
--
-- Lo de la máquina se incluye solo si quien mira TIENE maquinaria. Con
-- `exigir_permiso` la ficha del camión reventaría para un usuario de despachos;
-- con `tiene_permiso` ve su parte y ya.
-- ---------------------------------------------------------------------------
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
    -- El alta
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

    -- Lo que ha hecho: viajes, pesajes, guías
    select a.fecha::timestamptz, a.fecha, a.tipo,
           concat_ws(' · ', a.tipo, nullif(a.estado, '')),
           a.detalle, a.cantidad, a.unidad, 0::smallint, null::numeric,
           null::text, null::text, null::text,
           a.numero, '/app/despachos'
      from public.v_vehiculo_actividad a
     where a.vehiculo_id = p_vehiculo_id

    union all

    -- Quién se hizo cargo
    select c.creada_en, c.desde, 'CHOFER'::text,
           format('Se hizo cargo %s', coalesce(c.nombre, 'alguien')),
           concat_ws(' · ', nullif(c.motivo, ''), nullif(c.nota, '')),
           null::numeric, null::text, 0::smallint, null::numeric,
           null::text, c.nombre, null::text,
           nullif(c.cedula, ''), '/app/despachos/vehiculos'
      from public.vehiculo_choferes c
     where c.vehiculo_id = p_vehiculo_id

    union all

    -- Y cuándo lo dejó
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

    -- Y lo de su máquina, si la tiene y si quien mira puede verlo
    select m.cuando, m.fecha, m.clase, m.titulo, m.detalle, m.cantidad, m.unidad,
           m.signo, m.valor_usd, m.lugar, m.persona, m.quien, m.documento, m.ruta
      from private.hechos_de_maquina(v_maquina) m
     where v_maquina is not null
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
