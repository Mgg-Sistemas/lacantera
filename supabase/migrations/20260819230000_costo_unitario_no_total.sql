-- ---------------------------------------------------------------------------
-- Tres funciones pasaban el costo total donde va el unitario
--
-- QUÉ ESTABA MAL
--
-- `inventario_movimientos.costo_usd` es el costo **de una unidad**. El valor
-- del movimiento no se guarda: se genera, `valor_usd = cantidad * costo_usd`.
--
-- Las tres funciones que escribí para consumir inventario calculaban
-- `costo_promedio(...) * cantidad` —el total, que es lo que querían guardar en
-- su propia fila— y le pasaban ese mismo número a `registrar_movimiento`. Como
-- allí se vuelve a multiplicar por la cantidad, el libro salía inflado al
-- cuadrado: dos filtros de 50 USD descontaban 200 en vez de 100.
--
-- CÓMO SALIÓ
--
-- Probando el despacho de combustible. El primer despacho de 300 litros dejó
-- el valor del tanque tan por encima de lo real que el costo promedio del
-- segundo salió negativo, y el CHECK de la tabla lo paró. Es lo que se espera
-- de un CHECK bien puesto: el error no se convirtió en un dato.
--
-- Con cantidad 1 no se nota —un total de una unidad es su unitario—, y por eso
-- las pruebas de herramientas pasaron sin decir nada. La cantera lo habría
-- notado el día del inventario, cuadrando existencias contra valores.
--
-- No hay datos que corregir: los tres módulos son nuevos y no hay movimientos
-- suyos en el libro. Se comprobó antes de escribir esto.
-- ---------------------------------------------------------------------------

create or replace function public.cerrar_mantenimiento(
  p_id            bigint,
  p_detalle       text,
  p_costo_usd     numeric default null,
  p_repuestos     jsonb   default '[]'::jsonb,
  p_estado_salida text    default 'EN_ESPERA',
  p_fecha_salida  date    default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_orden   record;
  v_maq     record;
  v_salida  date := coalesce(p_fecha_salida, current_date);
  v_r       jsonb;
  v_art     bigint;
  v_cant    numeric;
  v_unitario numeric;
  v_costo   numeric;
  v_hay     numeric;
  v_mov     bigint;
  v_total   numeric := 0;
  v_nombre  text;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  if p_estado_salida not in ('EN_ESPERA', 'ACTIVA', 'FUERA_DE_SERVICIO') then
    raise exception 'Al salir del taller una máquina queda en espera, activa o fuera de servicio.'
      using errcode = '22023';
  end if;

  select * into v_orden from public.mantenimientos where id = p_id for update;
  if v_orden.id is null then
    raise exception 'No existe la orden de mantenimiento %.', p_id using errcode = 'P0002';
  end if;
  if v_orden.estado <> 'ABIERTO' then
    raise exception 'La orden % está %.', coalesce(v_orden.numero, p_id::text),
      lower(v_orden.estado) using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_detalle, ''))) < 3 then
    raise exception 'Hay que decir qué se le hizo a la máquina.' using errcode = '23514';
  end if;
  if v_salida < v_orden.fecha then
    raise exception 'No puede salir del taller antes de haber entrado.' using errcode = '22023';
  end if;
  if v_salida > current_date then
    raise exception 'No se puede sacar una máquina del taller con fecha futura.'
      using errcode = '22023';
  end if;

  select * into v_maq from public.maquinaria where id = v_orden.maquina_id for update;

  if jsonb_array_length(coalesce(p_repuestos, '[]'::jsonb)) > 0 and v_orden.taller_id is null then
    raise exception 'Para descontar repuestos la orden tiene que decir en qué taller se hizo.'
      using errcode = '23514';
  end if;

  for v_r in select * from jsonb_array_elements(coalesce(p_repuestos, '[]'::jsonb))
  loop
    v_art  := (v_r ->> 'articulo_id')::bigint;
    v_cant := (v_r ->> 'cantidad')::numeric;

    if v_art is null or coalesce(v_cant, 0) <= 0 then
      raise exception 'Cada repuesto necesita un artículo y una cantidad mayor que cero.'
        using errcode = '23514';
    end if;

    select nombre into v_nombre from public.articulos where id = v_art;
    if v_nombre is null then
      raise exception 'No existe el artículo %.', v_art using errcode = 'P0002';
    end if;

    v_hay := private.existencia(v_orden.taller_id, v_art);
    if v_hay < v_cant then
      raise exception 'El taller solo tiene % de "%": no alcanza para %.',
        v_hay, v_nombre, v_cant using errcode = '55000';
    end if;

    -- El unitario va al movimiento, que lo multiplica por la cantidad. El
    -- total se guarda aparte, en la fila del repuesto.
    v_unitario := private.costo_promedio(v_orden.taller_id, v_art);
    v_costo    := v_unitario * v_cant;

    v_mov := private.registrar_movimiento(
      'SALIDA_CONSUMO', -1, v_orden.taller_id, v_art, v_cant, v_unitario,
      format('Mantenimiento %s · %s', coalesce(v_orden.numero, p_id::text), v_maq.nombre),
      null, null, null, v_salida);

    insert into public.mantenimiento_repuestos
      (mantenimiento_id, articulo_id, cantidad, costo_usd, movimiento_id)
    values (p_id, v_art, v_cant, v_costo, v_mov);

    v_total := v_total + v_costo;
  end loop;

  update public.mantenimientos
     set estado              = 'CERRADO',
         detalle             = btrim(p_detalle),
         fecha_salida        = v_salida,
         costo_usd           = p_costo_usd,
         costo_repuestos_usd = v_total,
         cerrado_por         = (select auth.uid()),
         cerrado_en          = now()
   where id = p_id;

  update public.maquinaria set estado = p_estado_salida where id = v_orden.maquina_id;

  perform private.notificar(
    'MAQUINARIA', 'MANTENIMIENTO_CERRADO',
    format('%s salió del taller', v_maq.nombre),
    case when v_orden.tipo = 'MANTENIMIENTO'
         then 'Su contador de horas vuelve a cero.'
         else 'El contador de horas sigue donde estaba.' end,
    '/app/maquinaria', array['OPERACIONES','ALMACEN'], 'INFO');

  return p_id;
end;
$func$;

create or replace function public.reportar_incidencia_asignacion(
  p_id bigint, p_tipo text, p_motivo text,
  p_de_baja boolean default null, p_fecha date default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_a record; v_fecha date := coalesce(p_fecha, current_date);
  v_art record; v_emp record;
  v_unitario numeric; v_costo numeric; v_mov bigint;
  v_baja boolean; v_estado text;
begin
  perform private.exigir_permiso('ASIGNACIONES', 'ESCRITURA');

  if p_tipo not in ('PERDIDA', 'DANO') then
    raise exception 'La incidencia es una pérdida o un daño (recibido: %).', p_tipo
      using errcode = '22023';
  end if;

  select * into v_a from public.asignaciones_herramienta where id = p_id for update;
  if v_a.id is null then
    raise exception 'No existe la asignación %.', p_id using errcode = 'P0002';
  end if;
  if v_a.estado <> 'ASIGNADA' then
    raise exception 'Esa asignación está %.', lower(v_a.estado) using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Hay que decir qué pasó.' using errcode = '23514';
  end if;
  if v_fecha < v_a.fecha_entrega then
    raise exception 'No pudo pasar antes de haberse entregado.' using errcode = '22023';
  end if;
  if v_fecha > current_date then
    raise exception 'No se reporta algo que todavía no ha pasado.' using errcode = '22023';
  end if;

  v_baja   := coalesce(p_de_baja, p_tipo = 'PERDIDA');
  v_estado := case when p_tipo = 'PERDIDA' then 'PERDIDA' else 'DANADA' end;

  select * into v_art from public.articulos where id = v_a.articulo_id;
  select * into v_emp from public.empleados where id = v_a.empleado_id;

  v_unitario := private.costo_promedio(v_a.almacen_id, v_a.articulo_id);
  v_costo    := v_unitario * v_a.cantidad;

  if v_baja then
    v_mov := private.registrar_movimiento(
      'SALIDA_MERMA', -1, v_a.almacen_id, v_a.articulo_id, v_a.cantidad, v_unitario,
      format('%s · %s · %s',
             case when p_tipo = 'PERDIDA' then 'Bien perdido' else 'Bien dañado' end,
             coalesce(v_a.numero, p_id::text),
             v_emp.nombres || ' ' || v_emp.apellidos),
      null, null, null, v_fecha);
  else
    v_mov := null;
  end if;

  update public.asignaciones_herramienta
     set estado = v_estado, fecha_perdida = v_fecha, motivo = btrim(p_motivo),
         costo_usd = v_costo, movimiento_id = v_mov, dado_de_baja = v_baja
   where id = p_id;

  perform private.notificar(
    'ASIGNACIONES',
    case when p_tipo = 'PERDIDA' then 'BIEN_PERDIDO' else 'BIEN_DANADO' end,
    format('%s reportó %s de %s',
           v_emp.nombres || ' ' || v_emp.apellidos,
           case when p_tipo = 'PERDIDA' then 'la pérdida' else 'un daño en' end,
           v_art.nombre),
    case when v_baja
         then format('Salió del inventario. Queda pendiente de resolver: %s.', btrim(p_motivo))
         else format('Sigue en el inventario. Queda pendiente de resolver: %s.', btrim(p_motivo))
    end,
    '/app/asignaciones/incidencias', array['RRHH','ADMIN','ALMACEN'], 'ATENCION');

  return p_id;
end;
$func$;

create or replace function public.despachar_combustible(
  p_articulo_id bigint, p_almacen_id bigint, p_cantidad numeric,
  p_maquina_id bigint default null, p_destino text default null,
  p_horometro numeric default null, p_empleado_id bigint default null,
  p_fecha date default null, p_nota text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_fecha date := coalesce(p_fecha, current_date);
  v_art record; v_maq record; v_hay numeric;
  v_unitario numeric; v_costo numeric;
  v_ultimo numeric; v_mov bigint; v_id bigint; v_donde text;
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if v_fecha > current_date then
    raise exception 'No se despacha combustible con fecha futura.' using errcode = '22023';
  end if;

  select * into v_art from public.articulos where id = p_articulo_id;
  if v_art.id is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;
  if v_art.categoria <> 'COMBUSTIBLE' then
    raise exception '"%" no es combustible.', v_art.nombre using errcode = '22023';
  end if;

  if p_maquina_id is not null then
    select * into v_maq from public.maquinaria where id = p_maquina_id;
    if v_maq.id is null then
      raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
    end if;
    v_donde := v_maq.nombre;
  else
    if length(btrim(coalesce(p_destino, ''))) < 3 then
      raise exception 'Hay que decir a qué se le echó.' using errcode = '23514';
    end if;
    v_donde := btrim(p_destino);
  end if;

  v_hay := private.existencia(p_almacen_id, p_articulo_id);
  if v_hay < p_cantidad then
    raise exception 'En el tanque solo quedan % % de %.',
      v_hay, v_art.unidad, v_art.nombre using errcode = '55000';
  end if;

  if p_horometro is not null and p_maquina_id is not null then
    select max(horometro) into v_ultimo
      from public.despachos_combustible
     where maquina_id = p_maquina_id and horometro is not null;
    if v_ultimo is not null and p_horometro < v_ultimo then
      raise exception 'El horómetro de "%" marcaba % en el despacho anterior: no puede marcar % ahora.',
        v_maq.nombre, v_ultimo, p_horometro using errcode = '22023';
    end if;
  end if;

  v_unitario := private.costo_promedio(p_almacen_id, p_articulo_id);
  v_costo    := v_unitario * p_cantidad;

  v_mov := private.registrar_movimiento(
    'SALIDA_CONSUMO', -1, p_almacen_id, p_articulo_id, p_cantidad, v_unitario,
    format('Combustible · %s', v_donde), null, null, null, v_fecha);

  insert into public.despachos_combustible
    (numero, fecha, articulo_id, almacen_id, cantidad, maquina_id, destino,
     horometro, empleado_id, costo_usd, movimiento_id, nota, registrado_por)
  values
    (private.siguiente_numero('CMB'), v_fecha, p_articulo_id, p_almacen_id, p_cantidad,
     p_maquina_id, nullif(btrim(coalesce(p_destino, '')), ''), p_horometro, p_empleado_id,
     v_costo, v_mov, nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  if v_art.stock_minimo > 0 and (v_hay - p_cantidad) <= v_art.stock_minimo then
    perform private.notificar(
      'COMBUSTIBLE', 'TANQUE_BAJO',
      format('Queda poco %s', v_art.nombre),
      format('Quedan %s %s, y el mínimo son %s.',
             v_hay - p_cantidad, v_art.unidad, v_art.stock_minimo),
      '/app/combustible', array['ALMACEN','OPERACIONES','COMPRAS'], 'ATENCION');
  end if;

  return v_id;
end;
$func$;
