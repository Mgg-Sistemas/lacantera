/*
  FLUJO NUEVO DE COMPRAS
  EL PEDIDO NO EXIGE JUSTIFICACIÓN, Y LO QUE ENTREGA EL ALMACÉN LO RECIBE EL ALMACÉN

  Angélica, 06/11/2026: «quién recibe, eso vamos a quitarlo, recibe es ALMACÉN
  o inventario. Y además … eso de "explique para qué, quien aprueba no está en
  el frente y necesita el porqué", lo vamos a quitar … ya se está colocando
  una observación».

  QUÉ CAMBIA
  1. `crear_pedido` y `actualizar_pedido` ya no exigen la justificación: cada
     renglón lleva su observación. Si viene vacía se guarda vacía.
  2. `revisar_pedido_en_almacen` ya no pide quién recibe: la solicitud de
     salida la recibe el almacén general (inventario), a nombre de quien pidió.
     Si la pantalla manda una persona de la nómina, se respeta.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Sin justificación obligatoria
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.crear_pedido(
  p_titulo text,
  p_justificacion text,
  p_renglones jsonb,
  p_prioridad text default 'NORMAL',
  p_requerida_para date default null,
  p_destino text default null,
  p_enviar boolean default true,
  p_solicitante_id uuid default null,
  p_solicitante_nombre text default null,
  p_solicitante_cargo text default null,
  p_destino_almacen_id bigint default null,
  p_con_firma boolean default false
) returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id      bigint;
  v_sol     record;
  v_destino text := nullif(trim(coalesce(p_destino, '')), '');
  v_nombre  text;
  v_estado  text := case when p_enviar then 'REVISION_ALMACEN' else 'BORRADOR' end;
begin
  perform private.exigir_rol('SOLICITANTE', 'COMPRAS', 'OPERACIONES', 'ALMACEN', 'RRHH');

  if length(trim(coalesce(p_titulo, ''))) < 4 then
    raise exception 'Póngale un título al pedido: es lo que se lee en el tablero.' using errcode = '22023';
  end if;

  if p_destino_almacen_id is not null then
    select nombre into v_nombre from public.almacenes where id = p_destino_almacen_id;
    if v_nombre is null then
      raise exception 'No existe el almacén %.', p_destino_almacen_id using errcode = '23503';
    end if;
    v_destino := v_nombre;
  end if;

  select * into v_sol from private.normalizar_solicitante(
    coalesce(p_solicitante_id,
             case when nullif(trim(coalesce(p_solicitante_nombre, '')), '') is null
                  then (select auth.uid()) end),
    p_solicitante_nombre, p_solicitante_cargo);

  insert into public.solicitudes_pedido
    (numero, titulo, justificacion, prioridad, requerida_para, destino,
     destino_almacen_id, estado,
     registrada_por, solicitante_id, solicitante_nombre, solicitante_cargo, enviada_en,
     firma_de_quien_pide)
  values
    (private.siguiente_numero('SOL'), trim(p_titulo), trim(coalesce(p_justificacion, '')),
     coalesce(p_prioridad, 'NORMAL'), p_requerida_para, v_destino,
     p_destino_almacen_id,
     v_estado,
     (select auth.uid()), v_sol.o_id, v_sol.o_nombre, v_sol.o_cargo,
     case when p_enviar then now() end,
     -- La firma de otro no se estampa: solo cuenta si quien carga es quien pide.
     coalesce(p_con_firma, false)
       and v_sol.o_id is not distinct from (select auth.uid())
       and private.tengo_firma_encendida())
  returning id into v_id;

  perform private.escribir_renglones(v_id, p_renglones);
  perform private.anotar('SOLICITUD', v_id, null, v_estado);

  return v_id;
end;
$function$;

create or replace function public.actualizar_pedido(
  p_id bigint,
  p_titulo text,
  p_justificacion text,
  p_renglones jsonb,
  p_prioridad text default 'NORMAL',
  p_requerida_para date default null,
  p_destino text default null,
  p_solicitante_id uuid default null,
  p_solicitante_nombre text default null,
  p_solicitante_cargo text default null,
  p_destino_almacen_id bigint default null,
  p_con_firma boolean default null
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_estado  text;
  v_dueno   uuid;
  v_sol     record;
  v_destino text := nullif(trim(coalesce(p_destino, '')), '');
  v_nombre  text;
  v_cotiza  integer;
  v_antes   uuid;
begin
  select estado, registrada_por, solicitante_id into v_estado, v_dueno, v_antes
  from public.solicitudes_pedido where id = p_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_id using errcode = 'P0002';
  end if;

  if v_estado not in ('BORRADOR', 'PEDIDO', 'CONFIRMADA') then
    raise exception 'Este pedido está en "%" y ya no se corrige aquí. Si está con el gerente, retire lo propuesto; si ya se aprobó, la orden manda.', v_estado
      using errcode = '55000';
  end if;

  if v_dueno <> (select auth.uid()) and not private.tiene_rol('COMPRAS') then
    raise exception 'Solo quien creó el pedido puede corregirlo.' using errcode = '42501';
  end if;

  select count(*) into v_cotiza
  from public.cotizaciones where solicitud_id = p_id;

  if v_cotiza > 0 then
    raise exception 'Este pedido ya tiene % cotización(es) cargada(s), y están puestas sobre estos renglones: corregirlo ahora las dejaría vacías. Elimine las cotizaciones y vuelva a cargarlas después.', v_cotiza
      using errcode = '55000';
  end if;

  if p_destino_almacen_id is not null then
    select nombre into v_nombre from public.almacenes where id = p_destino_almacen_id;
    if v_nombre is null then
      raise exception 'No existe el almacén %.', p_destino_almacen_id using errcode = '23503';
    end if;
    v_destino := v_nombre;
  end if;

  select * into v_sol from private.normalizar_solicitante(
    coalesce(p_solicitante_id,
             case when nullif(trim(coalesce(p_solicitante_nombre, '')), '') is null
                  then v_dueno end),
    p_solicitante_nombre, p_solicitante_cargo);

  update public.solicitudes_pedido set
    titulo = trim(p_titulo),
    justificacion = trim(coalesce(p_justificacion, '')),
    prioridad = coalesce(p_prioridad, 'NORMAL'),
    requerida_para = p_requerida_para,
    destino = v_destino,
    destino_almacen_id = p_destino_almacen_id,
    solicitante_id = v_sol.o_id,
    solicitante_nombre = v_sol.o_nombre,
    solicitante_cargo = v_sol.o_cargo,
    firma_de_quien_pide = case
      when p_con_firma is not null
        then p_con_firma
             and v_sol.o_id is not distinct from (select auth.uid())
             and private.tengo_firma_encendida()
      -- Lo que eligió quien pedía no pasa a quien pide ahora.
      when v_sol.o_id is not distinct from v_antes then firma_de_quien_pide
      else false
    end
  where id = p_id;

  perform private.escribir_renglones(p_id, p_renglones);

  if v_estado <> 'BORRADOR' then
    perform private.anotar('SOLICITUD', p_id, v_estado, v_estado, 'Se corrigió el pedido');
  end if;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Lo que entrega el almacén lo recibe el almacén (inventario)
--
-- La `revisar_pedido_en_almacen` de la fase 2; solo cambia a quién va la
-- solicitud de salida.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.revisar_pedido_en_almacen(
  p_id bigint,
  p_renglones jsonb default '[]'::jsonb,
  p_empleado_id bigint default null,
  p_nota text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_s        public.solicitudes_pedido;
  v_alm      bigint;
  v_lista    jsonb := coalesce(p_renglones, '[]'::jsonb);
  v_x        jsonb;
  v_ren      public.solicitud_renglones;
  v_rid      bigint;
  v_art      bigint;
  v_cant     numeric;
  v_nombre   text;
  v_hay      numeric;
  v_y        record;
  v_entregas jsonb;
  v_quien    text;
  v_ss       text;
  v_todo     boolean;
  v_nota     text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  perform private.exigir_rol('ALMACEN');

  v_alm := private.almacen_que_revisa_pedidos();
  if v_alm is null then
    raise exception 'No está el almacén general (ALM-GEN), o está apagado.' using errcode = '23503';
  end if;

  select s.* into v_s from public.solicitudes_pedido s where s.id = p_id for update;

  if v_s.id is null then
    raise exception 'No existe el pedido %.', p_id using errcode = 'P0002';
  end if;

  if v_s.estado <> 'REVISION_ALMACEN' then
    raise exception 'El pedido % está en "%": ya no espera la revisión del almacén.', v_s.numero, v_s.estado
      using errcode = '55000';
  end if;

  if jsonb_typeof(v_lista) <> 'array' then
    raise exception 'Los renglones de la revisión van en una lista.' using errcode = '22023';
  end if;

  if (select count(*) from jsonb_array_elements(v_lista))
     <> (select count(distinct x ->> 'renglon_id') from jsonb_array_elements(v_lista) x) then
    raise exception 'Un renglón del pedido viene dos veces en la revisión.' using errcode = '22023';
  end if;

  -- Cada renglón: que sea de este pedido, que no se entregue más de lo pedido y
  -- que diga qué artículo del almacén sale.
  for v_x in select * from jsonb_array_elements(v_lista) loop
    v_rid  := nullif(btrim(coalesce(v_x ->> 'renglon_id', '')), '')::bigint;
    v_art  := nullif(btrim(coalesce(v_x ->> 'articulo_id', '')), '')::bigint;
    v_cant := coalesce(nullif(btrim(coalesce(v_x ->> 'cantidad', '')), '')::numeric, 0);

    select r.* into v_ren from public.solicitud_renglones r where r.id = v_rid and r.solicitud_id = p_id;
    if v_ren.id is null then
      raise exception 'Ese renglón no es de este pedido.' using errcode = '22023';
    end if;

    if v_cant < 0 then
      raise exception 'El renglón % (%): la cantidad no puede ser negativa.', v_ren.linea, v_ren.descripcion
        using errcode = '22023';
    end if;

    if v_cant > v_ren.cantidad then
      raise exception 'El renglón % (%): se pidieron % y se intentan entregar %.',
        v_ren.linea, v_ren.descripcion, private.numero_es(v_ren.cantidad, 2), private.numero_es(v_cant, 2)
        using errcode = '22023';
    end if;

    if v_cant > 0 then
      if v_art is null then
        raise exception 'El renglón % (%): diga qué artículo del almacén entrega.', v_ren.linea, v_ren.descripcion
          using errcode = '22023';
      end if;

      if not exists (select 1 from public.articulos a where a.id = v_art and a.activo) then
        raise exception 'El renglón % (%): ese artículo no existe o está inactivo.', v_ren.linea, v_ren.descripcion
          using errcode = '23503';
      end if;
    end if;
  end loop;

  -- Lo que se entrega, junto por artículo, y que lo haya en el almacén.
  for v_y in
    select (x ->> 'articulo_id')::bigint as articulo_id, sum((x ->> 'cantidad')::numeric) as cantidad
      from jsonb_array_elements(v_lista) x
     where coalesce(nullif(btrim(coalesce(x ->> 'cantidad', '')), '')::numeric, 0) > 0
     group by 1
  loop
    select e.articulo, coalesce(e.disponibles, e.existencia) into v_nombre, v_hay
      from public.v_existencias e
     where e.almacen_id = v_alm and e.articulo_id = v_y.articulo_id;

    if coalesce(v_hay, 0) < v_y.cantidad then
      raise exception 'De % hay % en el almacén general y se quieren entregar %.',
        coalesce(v_nombre, (select a.nombre from public.articulos a where a.id = v_y.articulo_id)),
        private.numero_es(coalesce(v_hay, 0), 2), private.numero_es(v_y.cantidad, 2)
        using errcode = '22023';
    end if;
  end loop;

  select jsonb_agg(jsonb_build_object('articulo_id', t.articulo_id, 'cantidad', t.cantidad) order by t.articulo_id)
    into v_entregas
    from (select (x ->> 'articulo_id')::bigint as articulo_id, sum((x ->> 'cantidad')::numeric) as cantidad
            from jsonb_array_elements(v_lista) x
           where coalesce(nullif(btrim(coalesce(x ->> 'cantidad', '')), '')::numeric, 0) > 0
           group by 1) t;

  if v_entregas is not null then
    if p_empleado_id is not null then
      -- La pantalla ya no lo pregunta; si alguien lo manda, se respeta.
      v_ss := public.pedir_salida(
        v_alm, v_entregas,
        format('Pedido de compra %s: %s', v_s.numero, v_s.titulo),
        p_empleado_id);
    else
      -- Lo recibe el almacén (inventario), a nombre de quien pidió.
      v_quien := coalesce(
        nullif(btrim(coalesce(v_s.solicitante_nombre, '')), ''),
        (select p.nombre from public.perfiles p where p.id = v_s.solicitante_id),
        (select p.nombre from public.perfiles p where p.id = (select auth.uid())),
        'ALMACÉN GENERAL');

      v_ss := public.pedir_salida(
        v_alm, v_entregas,
        format('Pedido de compra %s: %s', v_s.numero, v_s.titulo),
        null,
        'ALMACÉN GENERAL (INVENTARIO)',
        v_quien);
    end if;

    insert into public.solicitud_atendido_almacen
      (solicitud_id, renglon_id, linea, descripcion, unidad, cantidad_pedida, cantidad_entregada,
       articulo_id, almacen_id, salida_numero)
    select p_id, r.id, r.linea, r.descripcion, r.unidad, r.cantidad,
           (x ->> 'cantidad')::numeric, (x ->> 'articulo_id')::bigint, v_alm, v_ss
      from jsonb_array_elements(v_lista) x
      join public.solicitud_renglones r on r.id = (x ->> 'renglon_id')::bigint
     where coalesce(nullif(btrim(coalesce(x ->> 'cantidad', '')), '')::numeric, 0) > 0;
  end if;

  v_todo := not exists (
    select 1
      from public.solicitud_renglones r
     where r.solicitud_id = p_id
       and r.cantidad > coalesce((select sum(a.cantidad_entregada)
                                    from public.solicitud_atendido_almacen a
                                   where a.renglon_id = r.id), 0));

  update public.solicitudes_pedido
     set revisada_almacen_por  = (select auth.uid()),
         revisada_almacen_en   = now(),
         revision_almacen_nota = v_nota,
         salida_almacen_numero = v_ss
   where id = p_id;

  if v_todo then
    update public.solicitudes_pedido
       set estado = 'FINALIZADA', finalizada_en = now()
     where id = p_id;

    perform private.anotar('SOLICITUD', p_id, 'REVISION_ALMACEN', 'FINALIZADA',
      concat_ws(' · ', format('El almacén general entrega todo (%s)', v_ss), v_nota));
    return v_ss;
  end if;

  -- A Compras solo lo que falta. Primero sale lo entregado entero; después se
  -- rebaja lo parcial.
  delete from public.solicitud_renglones r
   using public.solicitud_atendido_almacen a
   where a.renglon_id = r.id
     and a.solicitud_id = p_id
     and a.cantidad_entregada >= r.cantidad;

  update public.solicitud_renglones r
     set cantidad = r.cantidad - a.cantidad_entregada
    from public.solicitud_atendido_almacen a
   where a.renglon_id = r.id
     and a.solicitud_id = p_id
     and a.cantidad_entregada < r.cantidad;

  update public.solicitudes_pedido set estado = 'PEDIDO' where id = p_id;

  perform private.anotar('SOLICITUD', p_id, 'REVISION_ALMACEN', 'PEDIDO',
    concat_ws(' · ',
      case when v_ss is null then 'El almacén general no tiene nada de lo pedido'
           else format('El almacén general entrega una parte (%s); a compras pasa lo que falta', v_ss) end,
      v_nota));

  return v_ss;
end;
$function$;
