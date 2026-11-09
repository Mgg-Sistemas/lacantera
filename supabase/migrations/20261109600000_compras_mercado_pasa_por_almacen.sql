/*
  LA SOLICITUD DE MERCADO PASA POR EL ALMACÉN (la dueña, 09/11/2026)

  «La solicitud de mercado pasa directo, sin que el almacenista confirme si
  tiene o no en stock.» Hasta hoy (fase 5a, como en MGG) nacía en «Pendiente»
  y avisaba a Compras para aprobarla, sin revisión del almacén. Ahora sigue el
  mismo camino que una Solicitud de Pedido normal (`compras_crear_solicitud`):

    - nace en 'revision_almacen', con el almacén general (ALM-GEN) de destino;
    - avisa al almacén: «SP-… · URGENTE enviada a Almacén para revisión»
      (PEDIDO_REVISION_ALMACEN, a '/app/solicitudes-pedido');
    - el almacenista confirma qué tiene con `compras_revisar_en_almacen`: lo
      que hay sale del almacén y solo lo que falta pasa a «Pendiente», donde
      Compras la recibe y la aprueba como cualquier SP (ese paso ya avisa con
      PEDIDO_PENDIENTE). Si el almacén tiene todo, queda «Atendida por
      almacén».

  Se redefinen las dos puertas que crean la Solicitud de Mercado, para que
  ninguna se salte al almacén:

    1. `compras_crear_solicitud_mercado` — «🛒 Solicitud de Mercado» de
       Pedidos / Compras (fase 5a).
    2. `solicitar_mercado` — «Pedir el mercado» de Alimentación (fase 5b),
       que crea la misma SP de mercado.

  Todo lo demás queda igual que en su definición vigente (leída con
  pg_get_functiondef el 09/11/2026 y cotejada con las migraciones
  20261108400000 y 20261108500000): permisos, validaciones, finalidad
  «PEDIDO PARA RESTABLECER EL MERCADO», clasificación «Mercado», urgente, y
  las firmas públicas. Las SP de mercado ya creadas no se tocan.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. 🛒 Solicitud de Mercado (Pedidos / Compras)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.compras_crear_solicitud_mercado(
  p_items jsonb,
  p_notas text default null,
  p_unidad_solicitante text default 'COCINA',
  p_solicitante_nombre text default 'COCINA'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alm    bigint;
  v_items  jsonb;
  v_unidad text;
  v_quien  text := private.en_mayuscula(nullif(btrim(coalesce(p_solicitante_nombre, '')), ''));
  v_qid    uuid;
  v_o      public.compras_ordenes;
begin
  perform private.exigir_usuario_activo();

  if not private.tiene_permiso('COMPRAS', 'LECTURA') then
    raise exception 'La Solicitud de Mercado la carga quien ve Compras.' using errcode = '42501';
  end if;

  v_items := private.compras_normalizar_items(p_items, '[]'::jsonb, true);
  if not exists (select 1 from jsonb_array_elements(v_items) i where coalesce((i ->> 'comprar')::boolean, true)) then
    raise exception 'Marcá al menos un producto' using errcode = '22023';
  end if;

  v_unidad := private.compras_asegurar_unidad(p_unidad_solicitante);
  if v_unidad is null then
    raise exception 'Indicá la unidad solicitante' using errcode = '22023';
  end if;
  if length(coalesce(v_quien, '')) > 80 then
    raise exception 'Quien solicita va en 80 letras como mucho.' using errcode = '22023';
  end if;

  -- Como en `compras_crear_solicitud`: sin el almacén que revisa no se crea.
  v_alm := private.almacen_que_revisa_pedidos();
  if v_alm is null then
    raise exception 'No está el almacén general (ALM-GEN), o está apagado.' using errcode = '23503';
  end if;

  -- Si «Solicitado por» es exactamente un usuario activo, la SP le queda a él.
  if v_quien is not null and (select count(*) from public.perfiles p
                               where p.activo and private.en_mayuscula(btrim(p.nombre)) = v_quien) = 1 then
    select p.id into v_qid from public.perfiles p
     where p.activo and private.en_mayuscula(btrim(p.nombre)) = v_quien;
  end if;

  insert into public.compras_ordenes
    (codigo, clase, estado, creado_por, creado_por_nombre, solicitante_id, solicitante_nombre,
     unidad_solicitante, items, total, notas, finalidad, clasificacion, urgente, almacen_destino_id, historial)
  values
    (private.siguiente_numero('SP'), 'producto', 'revision_almacen',
     (select auth.uid()), private.compras_mi_nombre(), v_qid, coalesce(v_quien, v_unidad),
     v_unidad, v_items, private.compras_total_items(v_items),
     nullif(btrim(coalesce(p_notas, '')), ''), 'PEDIDO PARA RESTABLECER EL MERCADO', array['Mercado'], true,
     v_alm,
     private.compras_evento('creada', jsonb_build_object('detalle', 'SOLICITUD DE MERCADO · ORDEN URGENTE')))
  returning * into v_o;

  -- Como la SP normal: «{código} · URGENTE enviada a Almacén para revisión».
  perform private.compras_avisar(v_o, 'PEDIDO_REVISION_ALMACEN',
    format('Solicitud de MERCADO %s · URGENTE enviada a Almacén para revisión', v_o.codigo),
    array['ALMACEN'], '/app/solicitudes-pedido', 'ATENCION');

  return jsonb_build_object('id', v_o.id, 'codigo', v_o.codigo, 'estado', v_o.estado);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. «Pedir el mercado» (Alimentación)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.solicitar_mercado(
  p_renglones jsonb,
  p_almacen_id bigint default null,
  p_nota text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item     jsonb;
  v_articulo record;
  v_nombre   text;
  v_vistos   bigint[] := '{}';
  v_items    jsonb    := '[]'::jsonb;
  v_obs      text[]   := '{}';
  v_destino  text;
  v_general  bigint   := private.almacen_que_revisa_pedidos();
  v_unidad   text;
  v_notas    text;
  v_o        public.compras_ordenes;
begin
  perform private.exigir_permiso('ALIMENTACION', 'ESCRITURA');

  if p_renglones is null
     or jsonb_typeof(p_renglones) <> 'array'
     or jsonb_array_length(p_renglones) = 0 then
    raise exception 'La lista del mercado está vacía: marque al menos un víver.'
      using errcode = '22023';
  end if;

  -- Como en `compras_crear_solicitud`: sin el almacén que revisa no se crea.
  if v_general is null then
    raise exception 'No está el almacén general (ALM-GEN), o está apagado.' using errcode = '23503';
  end if;

  if p_almacen_id is not null then
    select nombre into v_destino
    from public.almacenes
    where id = p_almacen_id and activo;

    if v_destino is null then
      raise exception 'Ese almacén no existe o está inactivo.' using errcode = '23503';
    end if;
  end if;

  /*
    Cada renglón trae un artículo del catálogo (articulo_id) o un texto libre
    (descripcion), igual que antes. Con artículo, el nombre y la unidad salen
    del catálogo; sin él, va como renglón general (Compras le pone el nombre
    de inventario al cotizar).
  */
  for v_item in select * from jsonb_array_elements(p_renglones) loop
    if coalesce((v_item->>'cantidad')::numeric, 0) <= 0 then
      raise exception 'Hay un renglón sin cantidad: póngala o quítelo de la lista.'
        using errcode = '22023';
    end if;

    if nullif(v_item->>'articulo_id', '') is not null then
      select id, nombre, unidad into v_articulo
      from public.articulos
      where id = (v_item->>'articulo_id')::bigint and activo;

      if v_articulo.id is null then
        raise exception 'Un renglón trae un artículo que no existe o está inactivo.'
          using errcode = '23503';
      end if;

      if v_articulo.id = any(v_vistos) then
        raise exception '«%» está repetido en la lista: junta sus cantidades.',
          v_articulo.nombre using errcode = '23505';
      end if;
      v_vistos := v_vistos || v_articulo.id;
      v_nombre := v_articulo.nombre;

      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'articulo_id', v_articulo.id,
        'nombre',      v_articulo.nombre,
        'cantidad',    (v_item->>'cantidad')::numeric,
        'unidad',      v_articulo.unidad));
    else
      if nullif(btrim(coalesce(v_item->>'descripcion', '')), '') is null then
        raise exception 'Hay un renglón sin descripción: escríbala o quítelo de la lista.'
          using errcode = '22023';
      end if;
      v_nombre := btrim(v_item->>'descripcion');
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'nombre',   v_nombre,
        'cantidad', (v_item->>'cantidad')::numeric,
        'unidad',   'UND'));
    end if;

    if nullif(btrim(coalesce(v_item->>'observacion', '')), '') is not null then
      v_obs := v_obs || format('%s: %s', v_nombre, btrim(v_item->>'observacion'));
    end if;
  end loop;

  v_items := private.compras_normalizar_items(v_items, '[]'::jsonb, true);
  v_unidad := private.compras_asegurar_unidad('COCINA');

  v_notas := concat_ws(' ',
    'Reposición de víveres y artículos para la cocina, armada desde Alimentación.',
    case when nullif(btrim(coalesce(p_nota, '')), '') is not null
         then 'Nota de quien pide: ' || btrim(p_nota) || '.' end,
    case when cardinality(v_obs) > 0 then 'Observaciones: ' || array_to_string(v_obs, '; ') || '.' end,
    case when p_almacen_id is not null and p_almacen_id is distinct from v_general
         then format('La cocina lo pidió para %s: se recibe en el almacén general y se traslada.', v_destino) end);

  insert into public.compras_ordenes
    (codigo, clase, estado, creado_por, creado_por_nombre, solicitante_id, solicitante_nombre,
     unidad_solicitante, items, total, notas, finalidad, clasificacion, urgente, almacen_destino_id, historial)
  values
    (private.siguiente_numero('SP'), 'producto', 'revision_almacen',
     (select auth.uid()), private.compras_mi_nombre(), (select auth.uid()), private.compras_mi_nombre(),
     v_unidad, v_items, private.compras_total_items(v_items),
     v_notas, 'PEDIDO PARA RESTABLECER EL MERCADO', array['Mercado'], true,
     v_general,
     private.compras_evento('creada', jsonb_build_object('detalle', 'SOLICITUD DE MERCADO · ORDEN URGENTE · DESDE ALIMENTACIÓN')))
  returning * into v_o;

  -- Como la SP normal: «{código} · URGENTE enviada a Almacén para revisión».
  perform private.compras_avisar(v_o, 'PEDIDO_REVISION_ALMACEN',
    format('Solicitud de MERCADO %s · URGENTE enviada a Almacén para revisión', v_o.codigo),
    array['ALMACEN'], '/app/solicitudes-pedido', 'ATENCION');

  return jsonb_build_object('id', v_o.id, 'numero', v_o.codigo, 'codigo', v_o.codigo, 'estado', v_o.estado);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Permisos de las funciones
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function public.compras_crear_solicitud_mercado(jsonb, text, text, text) from public, anon;
grant execute on function public.compras_crear_solicitud_mercado(jsonb, text, text, text) to authenticated;

revoke all on function public.solicitar_mercado(jsonb, bigint, text) from public, anon;
grant execute on function public.solicitar_mercado(jsonb, bigint, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Comprobación (no escribe nada)
-- ═══════════════════════════════════════════════════════════════════════════

do $ver$
declare
  f text;
begin
  foreach f in array array[
    'public.compras_crear_solicitud_mercado(jsonb, text, text, text)',
    'public.solicitar_mercado(jsonb, bigint, text)'
  ] loop
    if position('''revision_almacen''' in pg_get_functiondef(f::regprocedure)) = 0
       or position('PEDIDO_REVISION_ALMACEN' in pg_get_functiondef(f::regprocedure)) = 0 then
      raise exception '% tiene que crear la SP en revisión de almacén y avisar al almacén.', f;
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = f::regprocedure)
       or not exists (select 1 from pg_proc p, unnest(p.proconfig) c
                       where p.oid = f::regprocedure and c in ('search_path=""', 'search_path=')) then
      raise exception '% tiene que ser SECURITY DEFINER con search_path vacío.', f;
    end if;
    if has_function_privilege('anon', f, 'EXECUTE') then
      raise exception '% no se le abre a anon.', f;
    end if;
    if not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '% la tiene que poder llamar quien inició sesión.', f;
    end if;
  end loop;
end $ver$;
