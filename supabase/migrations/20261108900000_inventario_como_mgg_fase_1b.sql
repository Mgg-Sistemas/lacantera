/*
  ALMACÉN E INVENTARIO COMO MGG · FASE 1b (08/11/2026)

  El teléfono del almacenista (`/app/inventario/almacen`) hace ya todo su día
  desde una sola pantalla, como `InventarioMovilView` de MGG: salida, traslado,
  por retornar, reporte de stock e históricos. Casi todo corre sobre las
  funciones de siempre (`pedir_salida`, `entregar_solicitud_salida`,
  `transferir_existencia`, `entregar_a_trabajador`, `devolver_herramienta`).
  Aquí va solo lo que no existía, y todo es aditivo: cuatro funciones nuevas y
  una columna nueva que nace vacía. No se toca ninguna función que ya exista ni
  ningún dato.

  1. `salida_desde_el_telefono`: la salida MIXTA (decisión 0.1 «C» de la dueña,
     08/11/2026). Se pide siempre con `pedir_salida`; si quien la registra
     puede aprobar salidas en ese almacén —la misma regla de la base,
     `private.como_aprueba_salida`— y puede entregar (Salidas en escritura),
     en la misma transacción queda aprobada por él y se entrega con
     `entregar_solicitud_salida`. Si no, queda «Por aprobar».

     OJO, ES UNA EXCEPCIÓN A «NADIE APRUEBA LO QUE ÉL MISMO PIDIÓ» (Angélica,
     18/09/2026, `aprobar_solicitud_salida`). Por eso no se llama a
     `aprobar_solicitud_salida`, que la rechazaría con «la pidió usted»: la
     aprobación se escribe aquí con las mismas columnas que allá. Solo pasa
     cuando la registra alguien que podría aprobarla igual, desde el teléfono,
     y queda a la vista: «Aprobó» y «Entregó» llevan el mismo nombre.

  2. `asignaciones_herramienta.devuelta_de` + `devolver_parte_de_prestamo`:
     el retorno PARCIAL de un préstamo (decisión 0.3). `devolver_herramienta`
     devuelve la asignación entera; aquí la parte que vuelve se separa en su
     propia fila DEVUELTA, colgada de la original por `devuelta_de`, y la
     original sigue ASIGNADA con lo que falta. Lo prestado (`v_existencias.
     prestadas`) baja solo, porque cuenta las ASIGNADAS.

  3. `prestamos_por_retornar`: la lista «🔄 Por retornar · {almacén}» con
     «Ya retornó {x} de {total}», que sale de esa columna.

  4. `reporte_de_stock`: solo lectura. Lo que había al cierre del «hasta» y lo
     que entró y salió en las fechas, por producto, para el
     `📦 *STOCK · {ALMACÉN}*` de WhatsApp.

  No hay correlativo por almacenista (SAT-/TRA-): se usan los números de aquí
  (SS, NS, MOV, ASG).
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. La salida desde el teléfono: se pide y, si se puede, se aprueba y entrega
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.salida_desde_el_telefono(
  p_almacen_id  bigint,
  p_renglones   jsonb,
  p_motivo      text,
  p_empleado_id bigint default null,
  p_externo     text default null,
  p_responsable text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_numero text;
  v_s      public.solicitudes_salida;
  v_como   text;
  v_nota   text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelva a entrar.' using errcode = '28000';
  end if;

  -- Pedirla es la puerta de siempre, con todas sus reglas: Salidas en lectura,
  -- motivo de diez letras, sin palabra de venta, para quién sale y renglones.
  v_numero := public.pedir_salida(
    p_almacen_id, p_renglones, p_motivo, p_empleado_id, p_externo, p_responsable, false);

  select * into v_s from public.solicitudes_salida where numero = v_numero for update;

  -- ¿Puede aprobarla quien la registra? La misma regla que usa
  -- `aprobar_solicitud_salida`: responde por el almacén, o está en la lista de
  -- autorizados (o es administrador), y no se le restringió. Además tiene que
  -- poder entregarla: si no, queda «Por aprobar» y la aprueba otro.
  v_como := private.como_aprueba_salida(v_s.almacen_id);
  if v_como is null or not private.tiene_permiso('SALIDAS', 'ESCRITURA') then
    return jsonb_build_object(
      'id', v_s.id, 'numero', v_numero, 'estado', 'PEDIDA', 'nota_salida', null);
  end if;

  -- Aprobada por quien la registra (decisión 0.1 «C», 08/11/2026): las mismas
  -- columnas que escribe `aprobar_solicitud_salida`, con su firma si la tiene
  -- encendida.
  update public.solicitudes_salida
     set estado = 'APROBADA',
         aprobada_por = (select auth.uid()), aprobada_en = now(),
         aprobada_de_respaldo = (v_como = 'RESPALDO'),
         firma_de_quien_aprueba = private.tengo_firma_encendida()
   where id = v_s.id;

  -- Y entregada por la puerta de siempre: descuenta, emite la nota NS y avisa.
  v_nota := public.entregar_solicitud_salida(v_s.id);

  return jsonb_build_object(
    'id', v_s.id, 'numero', v_numero, 'estado', 'ENTREGADA', 'nota_salida', v_nota);
end;
$function$;

comment on function public.salida_desde_el_telefono(bigint, jsonb, text, bigint, text, text) is
  'Salida del teléfono del almacenista (fase 1b, 08/11/2026): se pide con pedir_salida y, si quien la registra puede aprobar salidas en ese almacén y entregarlas, queda aprobada por él y entregada en la misma transacción. Si no, queda PEDIDA («Por aprobar»).';

revoke all on function public.salida_desde_el_telefono(bigint, jsonb, text, bigint, text, text) from public, anon;
grant execute on function public.salida_desde_el_telefono(bigint, jsonb, text, bigint, text, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. El retorno parcial de un préstamo
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.asignaciones_herramienta
  add column if not exists devuelta_de bigint references public.asignaciones_herramienta(id);

comment on column public.asignaciones_herramienta.devuelta_de is
  'Cuando la fila es la parte de un préstamo que ya volvió (retorno parcial, 08/11/2026): el préstamo del que se separó. La original sigue ASIGNADA con lo que falta.';

create index if not exists asignaciones_herramienta_devuelta_de
  on public.asignaciones_herramienta (devuelta_de)
  where devuelta_de is not null;

create or replace function public.devolver_parte_de_prestamo(
  p_id       bigint,
  p_cantidad numeric,
  p_nota     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_a         public.asignaciones_herramienta;
  v_cantidad  numeric := coalesce(p_cantidad, 0);
  v_ya        numeric;
  v_nota      text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  -- La misma reja que `devolver_herramienta`.
  perform private.exigir_permiso('ASIGNACIONES', 'ESCRITURA');

  select * into v_a from public.asignaciones_herramienta where id = p_id for update;
  if v_a.id is null then
    raise exception 'No existe el préstamo %.', p_id using errcode = 'P0002';
  end if;
  if v_a.clase <> 'ASIGNACION' then
    raise exception 'Esa entrega no retorna: es dotación.' using errcode = '55000';
  end if;
  if v_a.estado = 'DEVUELTA' then
    raise exception 'Ese préstamo ya retornó completo.' using errcode = '55000';
  end if;
  if v_a.estado <> 'ASIGNADA' then
    raise exception 'Ese préstamo está %.', lower(v_a.estado) using errcode = '55000';
  end if;
  if v_cantidad <= 0 then
    raise exception 'Escribe cuánto retorna.' using errcode = '22023';
  end if;
  if v_cantidad > v_a.cantidad then
    raise exception 'Solo faltan % por retornar.', private.cantidad_es(v_a.cantidad)
      using errcode = '22023';
  end if;

  select coalesce(sum(h.cantidad), 0) into v_ya
    from public.asignaciones_herramienta h
   where h.devuelta_de = v_a.id;

  if v_cantidad = v_a.cantidad then
    -- Vuelve todo lo que faltaba: la puerta de siempre cierra el préstamo.
    perform public.devolver_herramienta(v_a.id, current_date, v_nota);
  else
    -- Vuelve una parte: se separa en su fila DEVUELTA y la original se queda
    -- con lo que falta.
    update public.asignaciones_herramienta
       set cantidad = cantidad - v_cantidad
     where id = v_a.id;

    insert into public.asignaciones_herramienta
      (numero, articulo_id, almacen_id, empleado_id, cantidad, estado, fecha_entrega,
       fecha_devolucion, clase, nota, entregado_por, fecha_limite, devuelta_de)
    values
      (private.siguiente_numero('ASG'), v_a.articulo_id, v_a.almacen_id, v_a.empleado_id,
       v_cantidad, 'DEVUELTA', v_a.fecha_entrega, greatest(current_date, v_a.fecha_entrega),
       v_a.clase, coalesce(v_nota, v_a.nota), v_a.entregado_por, v_a.fecha_limite, v_a.id);
  end if;

  return jsonb_build_object(
    'numero',    v_a.numero,
    'retorna',   v_cantidad,
    'retornado', v_ya + v_cantidad,
    'total',     v_ya + v_a.cantidad,
    'falta',     v_a.cantidad - v_cantidad);
end;
$function$;

comment on function public.devolver_parte_de_prestamo(bigint, numeric, text) is
  'Retorno de un préstamo, todo o una parte (teléfono del almacenista, fase 1b, 08/11/2026). Si vuelve todo lo que falta llama a devolver_herramienta; si vuelve una parte, la separa en una fila DEVUELTA con devuelta_de = el préstamo.';

revoke all on function public.devolver_parte_de_prestamo(bigint, numeric, text) from public, anon;
grant execute on function public.devolver_parte_de_prestamo(bigint, numeric, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Lo que falta por retornar en un almacén
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.prestamos_por_retornar(p_almacen_id bigint)
returns table (
  id              bigint,
  numero          text,
  articulo_id     bigint,
  articulo_codigo text,
  articulo        text,
  unidad          text,
  empleado_id     bigint,
  empleado        text,
  fecha_entrega   date,
  fecha_limite    date,
  entregada_en    timestamptz,
  nota            text,
  falta           numeric,
  retornado       numeric,
  total           numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  -- La misma reja que la pantalla de préstamos: el módulo Asignaciones o el
  -- rol de siempre (Almacén, RRHH, Administrador).
  if not private.tiene_permiso('ASIGNACIONES', 'LECTURA')
     and not private.tiene_rol('ALMACEN', 'RRHH', 'ADMIN') then
    raise exception 'Su usuario no puede ver los préstamos.' using errcode = '42501';
  end if;

  return query
  select a.id, a.numero, a.articulo_id, art.codigo, art.nombre, art.unidad,
         a.empleado_id, btrim(coalesce(e.nombres, '') || ' ' || coalesce(e.apellidos, '')),
         a.fecha_entrega, a.fecha_limite, a.creado_en, a.nota,
         a.cantidad,
         coalesce(d.retornado, 0),
         a.cantidad + coalesce(d.retornado, 0)
    from public.asignaciones_herramienta a
    join public.articulos art on art.id = a.articulo_id
    left join public.empleados e on e.id = a.empleado_id
    left join lateral (
      select sum(h.cantidad) as retornado
        from public.asignaciones_herramienta h
       where h.devuelta_de = a.id
    ) d on true
   where a.almacen_id = p_almacen_id
     and a.estado = 'ASIGNADA'
     and a.clase = 'ASIGNACION'
   order by a.creado_en, a.id;
end;
$function$;

comment on function public.prestamos_por_retornar(bigint) is
  'Préstamos (ASIGNACION) sin devolver de un almacén, del más viejo al más nuevo, con lo que ya retornó y el total que salió (teléfono del almacenista, fase 1b, 08/11/2026).';

revoke all on function public.prestamos_por_retornar(bigint) from public, anon;
grant execute on function public.prestamos_por_retornar(bigint) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Reporte de stock por fechas (solo lectura)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.reporte_de_stock(
  p_almacen_id bigint,
  p_desde      date,
  p_hasta      date
)
returns table (
  articulo_id bigint,
  codigo      text,
  nombre      text,
  categoria   text,
  unidad      text,
  cierre      numeric,
  entradas    numeric,
  salidas     numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  -- Quien lee el libro lee esto: la misma regla que la política de lectura de
  -- `inventario_movimientos`.
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Revisa las fechas: «desde» no puede ir después de «hasta».' using errcode = '22023';
  end if;

  /*
    El cierre es la suma del libro hasta el «hasta», como `v_existencias` hasta
    hoy. Lo que entró y salió en las fechas no cuenta la corrección de costo
    (`AJUSTE_COSTO`): va en pareja, sale y vuelve a entrar la misma cantidad, y
    no es material que se movió.
  */
  return query
  select art.id, art.codigo, art.nombre, art.categoria, art.unidad,
         sum(m.cantidad * m.signo),
         coalesce(sum(m.cantidad) filter (
           where m.signo = 1 and m.fecha >= p_desde and m.tipo <> 'AJUSTE_COSTO'), 0),
         coalesce(sum(m.cantidad) filter (
           where m.signo = -1 and m.fecha >= p_desde and m.tipo <> 'AJUSTE_COSTO'), 0)
    from public.inventario_movimientos m
    join public.articulos art on art.id = m.articulo_id
   where m.almacen_id = p_almacen_id
     and m.fecha <= p_hasta
   group by art.id, art.codigo, art.nombre, art.categoria, art.unidad
  having sum(m.cantidad * m.signo) <> 0
      or count(*) filter (where m.fecha >= p_desde and m.tipo <> 'AJUSTE_COSTO') > 0
   order by art.categoria, art.nombre;
end;
$function$;

comment on function public.reporte_de_stock(bigint, date, date) is
  'Existencia al cierre de p_hasta y lo que entró y salió entre p_desde y p_hasta, por producto, de un almacén (📲 Reporte de stock del teléfono, fase 1b, 08/11/2026). Solo lectura.';

revoke all on function public.reporte_de_stock(bigint, date, date) from public, anon;
grant execute on function public.reporte_de_stock(bigint, date, date) to authenticated, service_role;
