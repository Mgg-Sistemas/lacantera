/*
  CERRAR Y CEDER CON SU LISTA DE COMPROBACIÓN

  Christopher, 16/09/2026: «¿Cómo atendemos el aspecto de qué pasa si se crea o
  elimina una planta, qué pasa si se crea un nuevo proceso para adquirir un
  material diferente o se elimina alguno? (Conociendo el enlace que tiene con
  los otros módulos, como inventario, posiblemente maquinaria, salidas y
  traslados, etc.)».

  La respuesta de diseño está en docs/explotacion-mina-plantas-y-procesos.md
  §11. Esta es su fase 1b, con lo que él decidió:

    - una planta cerrada deja su patio ABIERTO: la pila no desaparece, y lo que
      queda se vende o se traslada. El patio solo se desactiva vacío;
    - cerrar con pendientes se BLOQUEA hasta resolverlos;
    - al ceder una planta, el material del patio y las máquinas ubicadas ahí se
      PREGUNTAN en cada cesión: lo que se marca pasa al nuevo operador, con su
      asiento de cambio de dueño; lo demás sigue siendo de quien era.

  UNA SOLA LISTA POR COSA, Y LA CALCULA LA BASE

  Cerrar un sitio, desactivar un patio y desactivar un producto miran cada uno
  una lista de «qué bloquea» y «qué avisa». La misma función que usa la puerta
  para negarse es la que la pantalla enseña ANTES de confirmar: así lo que dice
  la ventana y lo que hace la base no se separan nunca.

  Y cierra tres huecos que ya existían, sin plantas de por medio:

    guardar_almacen .......... dejaba desactivar un patio con material dentro;
    cambiar_estado_articulo .. desactivaba un producto sin mirar nada;
    cerrar_sitio ............. (de esta mañana) no comprobaba nada.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- Lo que tiene pendiente un patio: lo comparten el sitio y el almacén
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.pendientes_de_patio(p_almacen bigint)
returns table (nivel text, que text, cuantos integer, detalle text)
language sql
stable
security definer
set search_path to ''
as $func$
  with a as (select id, nombre from public.almacenes where id = p_almacen)
  select 'BLOQUEA', 'TRASLADOS', count(*)::int,
         format('%s traslado(s) pedido(s) o en camino desde o hacia «%s»: %s. Se envían y reciben, o se cancelan, en Salidas y traslados › Traslados.',
                count(*), max(a.nombre), string_agg(t.numero, ', ' order by t.numero))
    from public.traslados t, a
   where t.estado in ('SOLICITUD', 'ACEPTADA') and (t.origen_id = a.id or t.destino_id = a.id)
  having count(*) > 0
  union all
  select 'BLOQUEA', 'SOLICITUDES_SALIDA', count(*)::int,
         format('%s solicitud(es) de salida de «%s» sin entregar: %s. Se entregan, no se aprueban o se cancelan en Salidas y traslados › Salidas.',
                count(*), max(a.nombre), string_agg(s.numero, ', ' order by s.numero))
    from public.solicitudes_salida s, a
   where s.estado in ('PEDIDA', 'APROBADA') and s.almacen_id = a.id
  having count(*) > 0
  union all
  select 'BLOQUEA', 'MANTENIMIENTOS', count(*)::int,
         format('%s mantenimiento(s) abierto(s) en «%s»: %s. Se cierran en Maquinaria.',
                count(*), max(a.nombre), string_agg(coalesce(m.numero, m.id::text), ', '))
    from public.mantenimientos m, a
   where m.estado = 'ABIERTO' and m.taller_id = a.id
  having count(*) > 0
  union all
  select 'AVISA', 'MAQUINAS', count(*)::int,
         format('%s máquina(s) ubicada(s) en «%s»: %s. Se cambian de sitio en Maquinaria.',
                count(*), max(a.nombre), string_agg(q.nombre, ', ' order by q.nombre))
    from public.maquinaria q, a
   where q.almacen_id = a.id and q.estado <> 'DESINCORPORADA'
  having count(*) > 0
  union all
  select 'AVISA', 'NOTAS_SIN_FACTURAR', count(*)::int,
         format('%s nota(s) de entrega de «%s» sin facturar. Se facturan igual en Facturación.',
                count(*), max(a.nombre))
    from public.notas_entrega n, a
   where n.estado = 'DESPACHADA' and n.almacen_id = a.id
  having count(*) > 0
  union all
  select 'AVISA', 'PEDIDOS_DE_COMPRA', count(*)::int,
         format('%s pedido(s) de compra con destino «%s» todavía sin orden. Conviene cambiarles el destino en Compras.',
                count(*), max(a.nombre))
    from public.solicitudes_pedido sp, a
   where sp.destino_almacen_id = a.id and sp.estado in ('BORRADOR', 'PEDIDO', 'CONFIRMADA', 'POR_CONFIRMAR_GERENTE')
  having count(*) > 0
$func$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Cerrar un sitio
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.comprobar_cierre_de_sitio(p_sitio bigint)
returns table (nivel text, que text, cuantos integer, detalle text)
language sql
stable
security definer
set search_path to ''
as $func$
  with s as (select * from public.sitios_operacion where id = p_sitio)
  select 'BLOQUEA', 'VIAJES_POR_APROBAR', count(*)::int,
         format('%s viaje(s) por aprobar en rutas que salen de «%s» o llegan a él. Se aprueban o rechazan en Explotación › Viajes de camiones.',
                count(*), max(s.nombre))
    from public.acarreos x
    join public.rutas_acarreo r on r.id = x.ruta_id, s
   where x.estado = 'POR_APROBAR' and (r.origen_id = s.id or r.destino_id = s.id)
  having count(*) > 0
  union all
  select p.nivel, p.que, p.cuantos, p.detalle
    from s, private.pendientes_de_patio(s.almacen_id) p
   where s.almacen_id is not null
  union all
  select 'AVISA', 'EXISTENCIAS', count(distinct e.articulo_id)::int,
         format('Su patio «%s» sigue abierto con %s producto(s): %s. Lo que queda se vende o se traslada; el patio se desactiva en Inventario cuando esté vacío.',
                max(e.almacen), count(distinct e.articulo_id),
                string_agg(e.articulo || ' (' || private.cantidad_es(e.existencia) || ' ' || e.unidad || ')', ', ' order by e.articulo))
    from public.v_existencias e, s
   where e.almacen_id = s.almacen_id and e.existencia <> 0
  having count(*) > 0
  union all
  select 'AVISA', 'RUTAS', count(*)::int,
         format('%s ruta(s) dejan de ofrecerse para viajes nuevos: %s. Sus viajes de antes se quedan.',
                count(*), string_agg(r.nombre, ', ' order by r.nombre))
    from public.rutas_acarreo r, s
   where r.activa and (r.origen_id = s.id or r.destino_id = s.id)
  having count(*) > 0
$func$;

create or replace function public.que_impide_cerrar_sitio(p_id bigint)
returns table (nivel text, que text, cuantos integer, detalle text)
language plpgsql
stable
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_permiso('EXPLOTACION', 'LECTURA');
  return query select * from private.comprobar_cierre_de_sitio(p_id) c order by c.nivel desc, c.que;
end;
$func$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Desactivar un patio o almacén
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.comprobar_desactivar_almacen(p_almacen bigint)
returns table (nivel text, que text, cuantos integer, detalle text)
language sql
stable
security definer
set search_path to ''
as $func$
  select 'BLOQUEA', 'EXISTENCIAS', count(distinct e.articulo_id)::int,
         format('«%s» todavía tiene %s producto(s): %s. Se venden, se trasladan o se cuentan a cero antes de desactivarlo.',
                max(e.almacen), count(distinct e.articulo_id),
                string_agg(e.articulo || ' (' || private.cantidad_es(e.existencia) || ' ' || e.unidad || ')', ', ' order by e.articulo))
    from public.v_existencias e
   where e.almacen_id = p_almacen and e.existencia <> 0
  having count(*) > 0
  union all
  select 'BLOQUEA', 'SITIO_ABIERTO', count(*)::int,
         format('Lo usa como patio %s, que está abierto: %s. Se cierra primero, o se le cambia el patio, en Explotación › Plantas y rutas.',
                case when count(*) = 1 then 'un sitio' else count(*) || ' sitios' end,
                string_agg(s.nombre, ', ' order by s.nombre))
    from public.sitios_operacion s
   where s.almacen_id = p_almacen and s.estado = 'ACTIVO'
  having count(*) > 0
  union all
  select * from private.pendientes_de_patio(p_almacen)
$func$;

create or replace function public.que_impide_desactivar_almacen(p_id bigint)
returns table (nivel text, que text, cuantos integer, detalle text)
language plpgsql
stable
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');
  return query select * from private.comprobar_desactivar_almacen(p_id) c order by c.nivel desc, c.que;
end;
$func$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Desactivar un producto (o cualquier artículo)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.comprobar_desactivar_articulo(p_articulo bigint)
returns table (nivel text, que text, cuantos integer, detalle text)
language sql
stable
security definer
set search_path to ''
as $func$
  select 'BLOQUEA', 'EXISTENCIAS', count(*)::int,
         format('Todavía hay existencia en %s sitio(s): %s. Se vende, se traslada o se cuenta a cero antes de desactivarlo.',
                count(*), string_agg(e.almacen || ' (' || private.cantidad_es(e.existencia) || ' ' || e.unidad || ')', ', ' order by e.almacen))
    from public.v_existencias e
   where e.articulo_id = p_articulo and e.existencia <> 0
  having count(*) > 0
  union all
  select 'BLOQUEA', 'COTIZACIONES', count(distinct c.id)::int,
         format('%s cotización(es) enviada(s) sin respuesta lo incluyen: %s. Se cierran en Ventas › Cotizaciones.',
                count(distinct c.id), string_agg(distinct c.numero, ', '))
    from public.cotizacion_venta_renglones r
    join public.cotizaciones_venta c on c.id = r.cotizacion_id
   where r.articulo_id = p_articulo and c.estado = 'ENVIADA'
  having count(*) > 0
  union all
  select 'BLOQUEA', 'SOLICITUDES_SALIDA', count(distinct s.id)::int,
         format('%s solicitud(es) de salida sin entregar lo piden: %s.', count(distinct s.id), string_agg(distinct s.numero, ', '))
    from public.solicitud_salida_renglones r
    join public.solicitudes_salida s on s.id = r.solicitud_id
   where r.articulo_id = p_articulo and s.estado in ('PEDIDA', 'APROBADA')
  having count(*) > 0
  union all
  select 'BLOQUEA', 'TRASLADOS', count(*)::int,
         format('%s traslado(s) pedido(s) o en camino lo llevan: %s.', count(*), string_agg(t.numero, ', ' order by t.numero))
    from public.traslados t
   where t.articulo_id = p_articulo and t.estado in ('SOLICITUD', 'ACEPTADA')
  having count(*) > 0
  union all
  select 'BLOQUEA', 'ORDENES_DE_COMPRA', count(distinct o.id)::int,
         format('%s orden(es) de compra todavía sin recibir lo traen: %s. Se reciben o se cancelan en Compras.',
                count(distinct o.id), string_agg(distinct o.numero, ', '))
    from public.orden_renglones r
    join public.ordenes_compra o on o.id = r.orden_id
   where r.articulo_id = p_articulo
     and o.estado in ('POR_RECIBIR', 'POR_INDICAR_PAGO', 'EN_TESORERIA', 'PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL')
  having count(*) > 0
  union all
  select 'AVISA', 'PRECIO', count(*)::int,
         'Tiene precio en la lista de venta: deja de ofrecerse para cotizar y despachar.'
    from public.precios_venta p
   where p.articulo_id = p_articulo
  having count(*) > 0
  union all
  select 'AVISA', 'DOTACION', count(*)::int,
         format('Forma parte de la dotación de %s cargo(s): deja de ofrecerse al entregarla.', count(*))
    from public.dotacion_por_cargo d
   where d.articulo_id = p_articulo
  having count(*) > 0
$func$;

create or replace function public.que_impide_desactivar_articulo(p_id bigint)
returns table (nivel text, que text, cuantos integer, detalle text)
language plpgsql
stable
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');
  return query select * from private.comprobar_desactivar_articulo(p_id) c order by c.nivel desc, c.que;
end;
$func$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Qué le falta a cada sitio para operar
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.lo_que_le_falta_a_los_sitios()
returns table (sitio_id bigint, que text, detalle text)
language plpgsql
stable
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_permiso('EXPLOTACION', 'LECTURA');

  return query
  select s.id, 'SIN_PATIO'::text,
         'Sin patio de inventario: lo que llegue o salga de aquí no tiene dónde quedar.'::text
    from public.sitios_operacion s
   where s.estado = 'ACTIVO' and s.tipo in ('PLANTA', 'PATIO', 'BASE') and s.almacen_id is null
  union all
  select s.id, 'PATIO_DESACTIVADO',
         format('Su patio «%s» está desactivado en Inventario.', a.nombre)
    from public.sitios_operacion s
    join public.almacenes a on a.id = s.almacen_id
   where s.estado = 'ACTIVO' and not a.activo
  union all
  select s.id, 'SIN_RESPONSABLE',
         'Sin responsable: sus viajes solo los aprueba quien tenga la casilla «Aprobar o rechazar viajes».'
    from public.sitios_operacion s
   where s.estado = 'ACTIVO' and s.responsable_id is null
  union all
  select s.id, 'SIN_RUTAS',
         'Sin rutas encendidas: no se le pueden cargar viajes.'
    from public.sitios_operacion s
   where s.estado = 'ACTIVO'
     and not exists (select 1 from public.rutas_acarreo r
                      where r.activa and (r.origen_id = s.id or r.destino_id = s.id))
  union all
  select s.id, 'RUTA_SIN_TARIFA',
         format('La ruta «%s» no tiene tarifa: no se le pueden cargar viajes.', r.nombre)
    from public.sitios_operacion s
    join public.rutas_acarreo r on r.activa and (r.origen_id = s.id or r.destino_id = s.id)
   where s.estado = 'ACTIVO'
     and not r.precio_libre
     and not exists (select 1 from public.ruta_tarifas t
                      where t.ruta_id = r.id and t.vigente_desde <= private.hoy_aqui())
  order by 1, 2;
end;
$func$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Ceder o transferir: qué hay y qué pasa con ello
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.que_hay_en_sitio(p_id bigint)
returns table (tipo text, id bigint, codigo text, nombre text, unidad text, propietario text, cantidad numeric)
language plpgsql
stable
security definer
set search_path to ''
as $func$
declare
  v_almacen bigint;
begin
  perform private.exigir_permiso('EXPLOTACION', 'LECTURA');

  select s.almacen_id into v_almacen from public.sitios_operacion s where s.id = p_id;
  if v_almacen is null then
    return;
  end if;

  return query
  select 'MATERIAL'::text, ar.id, ar.codigo, ar.nombre, ar.unidad, m.propietario, sum(m.cantidad * m.signo)
    from public.inventario_movimientos m
    join public.articulos ar on ar.id = m.articulo_id
   where m.almacen_id = v_almacen
   group by ar.id, ar.codigo, ar.nombre, ar.unidad, m.propietario
  having sum(m.cantidad * m.signo) > 0
  union all
  select 'MAQUINA'::text, q.id, q.codigo, q.nombre, null::text, q.propietario, null::numeric
    from public.maquinaria q
   where q.almacen_id = v_almacen and q.estado <> 'DESINCORPORADA'
  order by 1, 4, 6;
end;
$func$;

/*
  CEDER ES CAMBIAR EL OPERADOR, Y ADEMÁS LO QUE SE MARQUE.

  `p_material` es una lista de {articulo_id, de, cantidad}: cada renglón pasa al
  nuevo operador con el cambio de dueño que ya existe —asiento de salida del
  dueño viejo y de entrada del nuevo, al mismo costo—. `p_maquinas` son las
  máquinas ubicadas en el patio que pasan también.

  Cada parte exige su propio permiso: el material, Inventario total (lo pide
  `cambiar_dueno_de_material`); las máquinas, Maquinaria en escritura. Quien solo
  gestiona sitios puede ceder la planta, y lo demás se lo dice la base con
  nombre y apellido si no le alcanza.

  El material cambia de dueño en la fecha de la cesión, y por eso esa fecha no
  puede ser futura cuando se cede material: un asiento de inventario no se
  escribe por adelantado.
*/
create or replace function public.ceder_sitio(
  p_id       bigint,
  p_operador text,
  p_desde    date,
  p_motivo   text,
  p_material jsonb default '[]'::jsonb,
  p_maquinas bigint[] default '{}'::bigint[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_s        public.sitios_operacion;
  v_operador text;
  v_r        jsonb;
  v_n_mat    integer := 0;
  v_n_maq    integer := 0;
  v_q        record;
begin
  perform private.exigir_accion('EXPLOTACION.GESTIONAR_SITIOS');

  select * into v_s from public.sitios_operacion where id = p_id;
  if v_s.id is null then
    raise exception 'Ese sitio no existe.' using errcode = 'P0002';
  end if;

  if jsonb_typeof(coalesce(p_material, '[]'::jsonb)) <> 'array' then
    raise exception 'El material que pasa tiene que llegar como lista.' using errcode = '22023';
  end if;

  if (jsonb_array_length(coalesce(p_material, '[]'::jsonb)) > 0 or cardinality(coalesce(p_maquinas, '{}')) > 0)
     and p_desde > private.hoy_aqui() then
    raise exception 'El material y las máquinas cambian de dueño el día de la cesión, y ese día todavía no ha llegado.'
      using errcode = '22023',
            hint = 'Cede hoy lo que pasa, o registra la cesión cuando llegue la fecha.';
  end if;

  perform public.cambiar_operador_sitio(p_id, p_operador, p_desde, p_motivo);

  select nombre into v_operador from public.propietarios where codigo = p_operador;

  for v_r in select * from jsonb_array_elements(coalesce(p_material, '[]'::jsonb)) loop
    if v_s.almacen_id is null then
      raise exception '«%» no tiene patio: no hay material que ceder.', v_s.nombre using errcode = '22023';
    end if;
    perform public.cambiar_dueno_de_material(
      v_s.almacen_id,
      (v_r->>'articulo_id')::bigint,
      (v_r->>'cantidad')::numeric,
      v_r->>'de',
      p_operador,
      format('Cesión de «%s» a %s desde el %s. %s', v_s.nombre, v_operador, to_char(p_desde, 'DD/MM/YYYY'), btrim(p_motivo)),
      p_desde,
      null);
    v_n_mat := v_n_mat + 1;
  end loop;

  if cardinality(coalesce(p_maquinas, '{}')) > 0 then
    perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
    for v_q in
      select q.id, q.nombre, q.almacen_id, q.propietario
        from public.maquinaria q
       where q.id = any (p_maquinas)
         for update
    loop
      if v_q.almacen_id is distinct from v_s.almacen_id then
        raise exception 'La máquina «%» no está ubicada en «%»: no pasa con esta cesión.', v_q.nombre, v_s.nombre
          using errcode = '22023';
      end if;
      update public.maquinaria set propietario = p_operador where id = v_q.id;
      v_n_maq := v_n_maq + 1;
    end loop;
    if v_n_maq <> (select count(distinct x) from unnest(p_maquinas) x) then
      raise exception 'Alguna de esas máquinas no existe.' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object('material', v_n_mat, 'maquinas', v_n_maq);
end;
$func$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Las tres puertas miran su lista
-- ═══════════════════════════════════════════════════════════════════════════

do $parche$
declare
  v_def text;
  r     record;
begin
  for r in
    select * from (values
      ('public.cerrar_sitio(bigint, date, text)',
       $a$  update public.sitios_operacion
     set estado = 'CERRADO', cerrado_en = p_fecha, motivo_cierre = btrim(p_motivo)$a$,
       $b$  if exists (select 1 from private.comprobar_cierre_de_sitio(p_id) c where c.nivel = 'BLOQUEA') then
    raise exception '«%» no se puede cerrar todavía: %', v_s.nombre,
      (select string_agg(c.detalle, ' ' order by c.que)
         from private.comprobar_cierre_de_sitio(p_id) c where c.nivel = 'BLOQUEA')
      using errcode = '55000',
            hint = 'La ventana de cierre enseña cada pendiente y dónde se resuelve.';
  end if;

  update public.sitios_operacion
     set estado = 'CERRADO', cerrado_en = p_fecha, motivo_cierre = btrim(p_motivo)$b$),

      ('public.guardar_almacen(bigint, text, text, text, text, boolean, boolean, numeric, smallint, text, bigint)',
       $a$  if p_id is null then
    insert into public.almacenes$a$,
       $b$  /*
    UN PATIO SE DESACTIVA VACÍO Y SIN PENDIENTES. Antes se podía con material
    dentro, y ese material quedaba en un sitio que ya no se ofrecía para sacarlo.
  */
  if p_id is not null and not coalesce(p_activo, true)
     and exists (select 1 from public.almacenes a where a.id = p_id and a.activo)
     and exists (select 1 from private.comprobar_desactivar_almacen(p_id) c where c.nivel = 'BLOQUEA') then
    raise exception 'No se puede desactivar todavía: %',
      (select string_agg(c.detalle, ' ' order by c.que)
         from private.comprobar_desactivar_almacen(p_id) c where c.nivel = 'BLOQUEA')
      using errcode = '55000';
  end if;

  if p_id is null then
    insert into public.almacenes$b$),

      ('public.cambiar_estado_articulo(bigint, boolean)',
       $a$  update public.articulos set activo = p_activo where id = p_id;$a$,
       $b$  /*
    UN ARTÍCULO SE DESACTIVA SIN NADA A MEDIAS. Antes se desactivaba sin mirar:
    con existencia en un patio, o dentro de una cotización enviada.
  */
  if not coalesce(p_activo, true)
     and exists (select 1 from public.articulos a where a.id = p_id and a.activo)
     and exists (select 1 from private.comprobar_desactivar_articulo(p_id) c where c.nivel = 'BLOQUEA') then
    raise exception 'No se puede desactivar todavía: %',
      (select string_agg(c.detalle, ' ' order by c.que)
         from private.comprobar_desactivar_articulo(p_id) c where c.nivel = 'BLOQUEA')
      using errcode = '55000';
  end if;

  update public.articulos set activo = p_activo where id = p_id;$b$)
    ) as t(funcion, antes, despues)
  loop
    v_def := pg_get_functiondef(r.funcion::regprocedure);
    if (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes) <> 1 then
      raise exception 'En % el texto «%» no aparece exactamente una vez.', r.funcion, r.antes;
    end if;
    execute replace(v_def, r.antes, r.despues);
  end loop;
end
$parche$;

do $permisos$
declare f text;
begin
  foreach f in array array[
    'private.pendientes_de_patio(bigint)',
    'private.comprobar_cierre_de_sitio(bigint)',
    'private.comprobar_desactivar_almacen(bigint)',
    'private.comprobar_desactivar_articulo(bigint)'
  ] loop
    -- Solo las llaman funciones de la casa: nadie de fuera las necesita.
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  foreach f in array array[
    'public.que_impide_cerrar_sitio(bigint)',
    'public.que_impide_desactivar_almacen(bigint)',
    'public.que_impide_desactivar_articulo(bigint)',
    'public.lo_que_le_falta_a_los_sitios()',
    'public.que_hay_en_sitio(bigint)',
    'public.ceder_sitio(bigint, text, date, text, jsonb, bigint[])'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end
$permisos$;

do $ver$
begin
  if position('comprobar_cierre_de_sitio' in pg_get_functiondef('public.cerrar_sitio(bigint, date, text)'::regprocedure)) = 0
     or position('comprobar_desactivar_almacen' in pg_get_functiondef('public.guardar_almacen(bigint, text, text, text, text, boolean, boolean, numeric, smallint, text, bigint)'::regprocedure)) = 0
     or position('comprobar_desactivar_articulo' in pg_get_functiondef('public.cambiar_estado_articulo(bigint, boolean)'::regprocedure)) = 0 then
    raise exception 'alguna de las tres puertas no quedó mirando su lista';
  end if;
end
$ver$;
