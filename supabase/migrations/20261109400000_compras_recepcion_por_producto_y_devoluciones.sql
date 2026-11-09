-- Recepción producto por producto, con el motivo de lo que no entra
-- (la dueña, 09/11/2026):
--
--   «Al momento de recepcionar: confirmar que de verdad se está recibiendo ese
--   producto, uno a uno o por lote marcando o desmarcando todos. Si el
--   almacenista no seleccionó uno, ese producto debe tener un motivo por el
--   cual no va a entrar en el inventario: que van a cambiarlo con el
--   proveedor, que hubo una equivocación al momento de la compra, o que vino
--   defectuoso. Con estas opciones la compra vuelve a cotizarse, solo por ese
--   producto, por si existe un cambio y se debe pagar la diferencia. Eso lo
--   sabrá el analista de compras: solo los de compras determinan qué hacer
--   con el producto que se devolverá o se cambiará.»
--
-- 1. Cada renglón de la recepción trae `motivo` cuando no entra todo lo que
--    falta: 'no_llego' (queda pendiente, como siempre), 'cambio' (lo cambia el
--    proveedor), 'equivocacion' (se compró mal) o 'defectuoso'. Los tres
--    últimos abren una devolución en `compras_devoluciones`.
-- 2. Compras decide con `compras_resolver_devolucion`:
--      cambio_proveedor  el proveedor trae el reemplazo: el producto sigue
--                        pendiente de recibir en la misma OC.
--      recotizar         nace una SP nueva, ya aprobada, solo con ese
--                        producto, para cotizarlo otra vez (y pagar la
--                        diferencia si la hay). En la OC ya no se espera.
--      descartar         no se repone: en la OC ya no se espera.
--    «Ya no se espera» = `cantidad_devuelta` en el renglón de la OC; si con
--    eso no falta nada, la recepción de la OC se cierra.
-- 3. Mientras haya una devolución sin decidir, la recepción no se cierra con
--    «No llega más».

-- ---------------------------------------------------------------------------
-- La tabla de devoluciones
-- ---------------------------------------------------------------------------

create table if not exists public.compras_devoluciones (
  id                  bigint generated always as identity primary key,
  orden_id            bigint not null references public.compras_ordenes (id) on delete cascade,
  recepcion_id        bigint references public.compras_recepciones (id) on delete set null,
  sku                 text not null,
  nombre              text not null,
  cantidad            numeric(18, 4) not null check (cantidad > 0),
  unidad              text,
  precio              numeric,
  motivo              text not null check (motivo in ('cambio', 'equivocacion', 'defectuoso')),
  nota                text check (length(nota) <= 300),
  estado              text not null default 'pendiente'
                        check (estado in ('pendiente', 'cambio_proveedor', 'recotizada', 'descartada')),
  decision_nota       text check (length(decision_nota) <= 300),
  nueva_orden_id      bigint references public.compras_ordenes (id) on delete set null,
  creada_por          uuid references public.perfiles (id),
  creada_por_nombre   text,
  creada_en           timestamptz not null default now(),
  resuelta_por        uuid references public.perfiles (id),
  resuelta_por_nombre text,
  resuelta_en         timestamptz
);

comment on table public.compras_devoluciones is
  'Productos que el almacén no recibió por cambio, equivocación o defecto (09/11/2026). Compras decide: cambio del proveedor, recotizar o descartar. Solo se escribe por funciones.';

create index if not exists compras_devoluciones_orden_idx on public.compras_devoluciones (orden_id);
create index if not exists compras_devoluciones_pendientes_idx on public.compras_devoluciones (orden_id) where estado = 'pendiente';
create index if not exists compras_devoluciones_nueva_orden_idx on public.compras_devoluciones (nueva_orden_id);
create index if not exists compras_devoluciones_recepcion_idx on public.compras_devoluciones (recepcion_id);

alter table public.compras_devoluciones enable row level security;

drop policy if exists compras_devoluciones_lectura on public.compras_devoluciones;
create policy compras_devoluciones_lectura on public.compras_devoluciones
  for select to authenticated
  using ((select private.compras_puede_ver_orden(orden_id)));

revoke all on public.compras_devoluciones from anon;
revoke insert, update, delete on public.compras_devoluciones from authenticated;
grant select on public.compras_devoluciones to authenticated;

-- Lo que no entró en cada recepción (todos los motivos, también «no llegó»).
alter table public.compras_recepciones
  add column if not exists no_entraron jsonb not null default '[]'::jsonb
    constraint compras_recepciones_no_entraron_lista check (jsonb_typeof(no_entraron) = 'array');

comment on column public.compras_recepciones.no_entraron is
  'Renglones que no entraron completos en esta recepción: {sku, nombre, cantidad, unidad, motivo, nota} (09/11/2026).';

-- ---------------------------------------------------------------------------
-- Lo que falta: sin lo que ya no se espera (devuelto y recotizado o descartado)
-- ---------------------------------------------------------------------------

create or replace function private.compras_faltan(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'sku', i ->> 'sku',
           'nombre', i ->> 'nombre',
           'falta', round(coalesce((i ->> 'cantidad')::numeric, 0)
                          - coalesce((i ->> 'cantidad_recibida')::numeric, 0)
                          - coalesce((i ->> 'cantidad_devuelta')::numeric, 0), 4),
           'unidad', coalesce(i ->> 'unidad_compra', i ->> 'unidad')) order by n), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as e(i, n)
   where coalesce((i ->> 'comprar')::boolean, true)
     and coalesce((i ->> 'cantidad_recibida')::numeric, 0) + coalesce((i ->> 'cantidad_devuelta')::numeric, 0)
         < coalesce((i ->> 'cantidad')::numeric, 0) - 0.0001;
$$;

create or replace function private.compras_motivo_txt(p_motivo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_motivo
           when 'cambio' then 'lo cambia el proveedor'
           when 'equivocacion' then 'equivocación en la compra'
           when 'defectuoso' then 'vino defectuoso'
           when 'no_llego' then 'no llegó'
           else p_motivo end;
$$;

-- ---------------------------------------------------------------------------
-- Recibir: lo de siempre, más el motivo de lo que no entra
-- ---------------------------------------------------------------------------

create or replace function public.compras_recibir_orden(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o          public.compras_ordenes;
  v_alm        bigint;
  v_lista      jsonb;
  v_x          jsonb;
  v_it         jsonb;
  v_items      jsonb;
  v_sku        text;
  v_nombre     text;
  v_cant       numeric;
  v_pedido     numeric;
  v_previo     numeric;
  v_devuelta   numeric;
  v_resto      numeric;
  v_motivo     text;
  v_nota_mot   text;
  v_factor     numeric;
  v_uso        numeric;
  v_precio     numeric;
  v_costo      numeric;
  v_ucompra    text;
  v_art        public.articulos;
  v_art_id     bigint;
  v_ficha      jsonb;
  v_crear      jsonb;
  v_creada     boolean;
  v_cat        text;
  v_uni        text;
  v_sin_orden  boolean;
  v_sin        boolean;
  v_marca      text;
  v_marca_ped  text;
  v_nota_marca text;
  v_ref        numeric;
  v_veces      numeric;
  v_mov        bigint;
  v_mov_num    text;
  v_n          integer;
  v_oc         text;
  v_codigo     text;
  v_prov       text;
  v_ren        jsonb := '[]'::jsonb;
  v_no_entra   jsonb := '[]'::jsonb;
  v_devs       jsonb := '[]'::jsonb;
  v_d          jsonb;
  v_hay        boolean := false;
  v_completa   boolean;
  v_cerrar     boolean;
  v_cierra     boolean;
  v_nota       text;
  v_fotos      jsonb := '[]'::jsonb;
  v_f          jsonb;
  v_doc        jsonb;
  v_doc_tipo   text;
  v_valor      numeric := 0;
  v_rec_total  numeric;
  v_estado     text;
  v_faltan     jsonb;
  v_rec_id     bigint;
  v_vistos     text[] := '{}';
  v_creadas    text[] := '{}';
  v_marcas     text[] := '{}';
  v_titulo     text;
  v_tmp        public.compras_ordenes;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_recibe_almacen() then
    raise exception 'La mercancía la recibe el almacén: hace falta Inventario en escritura o el rol de almacén.'
      using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos de la recepción.' using errcode = '22023';
  end if;

  v_alm := private.almacen_que_revisa_pedidos();
  if v_alm is null then
    raise exception 'No está el almacén general (ALM-GEN), o está apagado.' using errcode = '23503';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.recibida_en is not null then
    raise exception 'Esta orden ya fue recibida.' using errcode = '55000';
  end if;
  if v_o.oc_codigo is null or v_o.estado not in ('por_recibir', 'cuenta_abierta', 'pagada') then
    raise exception 'La orden no está en un estado recibible.' using errcode = '55000';
  end if;

  v_lista := coalesce(p_datos -> 'renglones', '[]'::jsonb);
  if jsonb_typeof(v_lista) <> 'array' then
    raise exception 'Los renglones de la recepción van en una lista.' using errcode = '22023';
  end if;

  v_cerrar := coalesce((p_datos ->> 'cerrar')::boolean, false);
  -- MGG: «No sumar al inventario» (la recepción entera) y el servicio, que nunca entra.
  v_sin_orden := coalesce((p_datos ->> 'sin_inventario')::boolean, false) or v_o.sin_inventario or v_o.clase = 'servicio';
  v_nota := nullif(btrim(coalesce(p_datos ->> 'nota', '')), '');
  if length(coalesce(v_nota, '')) > 500 then
    raise exception 'La nota va en 500 letras como mucho.' using errcode = '22023';
  end if;

  -- Fotos (hasta 4, MGG teléfono) y la factura / nota de entrega escaneada.
  if p_datos ? 'fotos' and jsonb_typeof(p_datos -> 'fotos') = 'array' then
    if jsonb_array_length(p_datos -> 'fotos') > 4 then
      raise exception 'Hasta 4 fotos por recepción.' using errcode = '22023';
    end if;
    for v_f in select * from jsonb_array_elements(p_datos -> 'fotos') loop
      v_fotos := v_fotos || jsonb_build_array(private.compras_archivo_recepcion(v_f, p_id, 'foto'));
    end loop;
  end if;
  v_doc := private.compras_archivo_recepcion(p_datos -> 'documento', p_id, 'documento');
  if v_doc is not null then
    v_doc_tipo := coalesce(nullif(btrim(coalesce(p_datos -> 'documento' ->> 'tipo', '')), ''), 'factura');
    if v_doc_tipo not in ('factura', 'nota_entrega') then
      raise exception 'El documento es Factura o Nota de entrega.' using errcode = '22023';
    end if;
  end if;

  select coalesce(max(r.numero), 0) + 1 into v_n from public.compras_recepciones r where r.orden_id = p_id;
  v_oc := coalesce(v_o.oc_codigo, v_o.codigo);
  v_codigo := format('%s · R%s', v_oc, v_n);
  select p.nombre into v_prov from public.proveedores p where p.id = v_o.proveedor_id;

  v_items := v_o.items;

  for v_x in select * from jsonb_array_elements(v_lista) loop
    if jsonb_typeof(v_x) <> 'object' then
      raise exception 'Un renglón de la recepción no se entiende.' using errcode = '22023';
    end if;
    v_sku := nullif(btrim(coalesce(v_x ->> 'sku', '')), '');
    if v_sku is null or v_sku = any (v_vistos) then
      raise exception 'Un renglón viene vacío o dos veces en la recepción.' using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_sku;

    select i into v_it
      from jsonb_array_elements(v_items) i
     where i ->> 'sku' = v_sku and coalesce((i ->> 'comprar')::boolean, true)
     limit 1;
    if v_it is null then
      raise exception 'Ese renglón no es de esta orden.' using errcode = '22023';
    end if;
    v_nombre := v_it ->> 'nombre';

    begin
      v_cant := round(coalesce(nullif(btrim(coalesce(v_x ->> 'cantidad', '')), '')::numeric, 0), 4);
    exception when others then
      raise exception '«%»: la cantidad recibida no se entiende.', v_nombre using errcode = '22023';
    end;
    if v_cant < 0 then
      raise exception '«%»: la cantidad recibida no puede ser negativa.', v_nombre using errcode = '22023';
    end if;

    v_pedido := coalesce((v_it ->> 'cantidad')::numeric, 0);
    v_previo := coalesce((v_it ->> 'cantidad_recibida')::numeric, 0);
    v_devuelta := coalesce((v_it ->> 'cantidad_devuelta')::numeric, 0);
    if v_previo + v_devuelta + v_cant > v_pedido + 0.0001 then
      raise exception 'No podés recibir más de lo pedido en %.', v_nombre using errcode = '22023';
    end if;

    -- LO QUE NO ENTRA, CON SU MOTIVO (09/11/2026). Sin motivo, «no llegó»:
    -- queda pendiente, como antes.
    v_resto := round(v_pedido - v_previo - v_devuelta - v_cant, 4);
    v_motivo := coalesce(nullif(btrim(coalesce(v_x ->> 'motivo', '')), ''), 'no_llego');
    if v_motivo not in ('no_llego', 'cambio', 'equivocacion', 'defectuoso') then
      raise exception '«%»: el motivo es no llegó, lo cambia el proveedor, equivocación en la compra o vino defectuoso.', v_nombre
        using errcode = '22023';
    end if;
    v_nota_mot := nullif(btrim(coalesce(v_x ->> 'nota_motivo', '')), '');
    if length(coalesce(v_nota_mot, '')) > 300 then
      raise exception '«%»: la nota del motivo va en 300 letras como mucho.', v_nombre using errcode = '22023';
    end if;
    if v_resto > 0.0001 then
      if v_motivo <> 'no_llego' and exists (
        select 1 from public.compras_devoluciones d
         where d.orden_id = p_id and d.sku = v_sku and d.estado = 'pendiente') then
        raise exception '«%» ya tiene una devolución esperando la decisión de Compras.', v_nombre using errcode = '55000';
      end if;
      v_no_entra := v_no_entra || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'sku', v_sku,
        'nombre', v_nombre,
        'cantidad', v_resto,
        'unidad', coalesce(nullif(btrim(coalesce(v_it ->> 'unidad_compra', '')), ''), v_it ->> 'unidad'),
        'motivo', v_motivo,
        'nota', v_nota_mot)));
      if v_motivo <> 'no_llego' then
        v_devs := v_devs || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'sku', v_sku,
          'nombre', v_nombre,
          'cantidad', v_resto,
          'unidad', coalesce(nullif(btrim(coalesce(v_it ->> 'unidad_compra', '')), ''), v_it ->> 'unidad'),
          'precio', greatest(coalesce((v_it ->> 'precio')::numeric, 0), 0),
          'motivo', v_motivo,
          'nota', v_nota_mot)));
      end if;
    end if;

    if v_cant = 0 then
      continue;
    end if;

    -- La marca con la que llegó. Si es otra, la nota es obligatoria (MGG `marcaRecibida.ts`).
    v_marca := private.compras_norm_marca(v_x ->> 'marca_recibida');
    v_marca_ped := private.compras_norm_marca(v_it ->> 'marca');
    v_nota_marca := nullif(btrim(coalesce(v_x ->> 'nota_marca', '')), '');
    if v_marca is not null and v_marca is not distinct from v_marca_ped then
      v_marca := null;
    end if;
    if v_marca is not null and v_marca_ped is not null and length(coalesce(v_nota_marca, '')) < 3 then
      raise exception '%: llegó % en vez de %. Escribí una nota corta explicando el cambio de marca.',
        v_nombre, v_marca, v_marca_ped using errcode = '22023';
    end if;
    if v_marca is not null and v_marca_ped is not null then
      v_marcas := v_marcas || v_nombre;
    end if;

    v_sin := v_sin_orden or coalesce((v_x ->> 'sin_inventario')::boolean, false)
             or coalesce((v_it ->> 'sin_inventario')::boolean, false);

    -- La ficha: la del renglón; si es de nombre general, la que diga el almacén.
    v_art := null;
    v_creada := false;
    v_art_id := nullif(btrim(coalesce(v_it ->> 'articulo_id', '')), '')::bigint;
    if v_art_id is null and not v_sin then
      v_ficha := v_x -> 'ficha';
      if v_ficha is not null and jsonb_typeof(v_ficha) = 'object' and nullif(btrim(coalesce(v_ficha ->> 'articulo_id', '')), '') is not null then
        v_art_id := (v_ficha ->> 'articulo_id')::bigint;
      elsif v_ficha is not null and jsonb_typeof(v_ficha -> 'crear') = 'object' then
        v_crear := v_ficha -> 'crear';
        v_cat := upper(nullif(btrim(coalesce(v_crear ->> 'categoria', '')), ''));
        v_uni := upper(coalesce(nullif(btrim(coalesce(v_crear ->> 'unidad', '')), ''), v_it ->> 'unidad'));
        if v_cat is null or not exists (select 1 from public.categorias_articulo c where c.codigo = v_cat) then
          raise exception 'Elegí la categoría de la ficha nueva de «%».', v_nombre using errcode = '22023';
        end if;
        if v_uni is null or not exists (select 1 from public.unidades u where u.codigo = v_uni) then
          raise exception '«%»: elegí la unidad de la ficha nueva (la de uso, en la que se cuenta en el almacén).', v_nombre
            using errcode = '22023';
        end if;
        v_art_id := public.crear_articulo(
          p_codigo => null,
          p_nombre => coalesce(nullif(btrim(coalesce(v_crear ->> 'nombre', '')), ''), v_nombre),
          p_categoria => v_cat,
          p_unidad => v_uni,
          p_marca => coalesce(v_marca, v_marca_ped),
          p_confirmado => coalesce((v_crear ->> 'confirmado')::boolean, false));
        v_creada := true;
      else
        raise exception '%: sin ficha de inventario. Elegí con qué nombre se guarda en inventario: una ficha que ya existe o una nueva.',
          v_nombre using errcode = '22023';
      end if;
    end if;

    if v_art_id is not null then
      select a.* into v_art from public.articulos a where a.id = v_art_id;
      if v_art.id is null or not v_art.activo then
        raise exception '«%»: ese artículo no existe en el inventario o está inactivo.', v_nombre using errcode = '23503';
      end if;
      if v_creada then
        v_creadas := v_creadas || v_art.nombre;
      end if;
    end if;

    -- Al inventario: en la unidad de uso, al costo por unidad de uso, en $.
    v_ucompra := nullif(btrim(coalesce(v_it ->> 'unidad_compra', '')), '');
    v_factor := case when v_ucompra is not null then coalesce(nullif((v_it ->> 'factor_compra')::numeric, 0), 1) else 1 end;
    v_uso := round(v_cant * v_factor, 4);
    v_precio := greatest(coalesce((v_it ->> 'precio')::numeric, 0), 0);
    v_costo := round(v_precio / v_factor, 6);
    v_mov := null;
    v_mov_num := null;
    v_veces := null;

    if not v_sin and v_art.id is not null and v_art.inventariable then
      -- La misma reja de costo que la entrada: diez veces fuera de lo que viene
      -- costando queda marcado. No para: el precio ya se aprobó en la OC.
      v_ref := private.costo_promedio(v_alm, v_art.id);
      if coalesce(v_ref, 0) > 0 and v_costo > 0 then
        v_veces := round(v_costo / v_ref, 2);
        if v_veces < 10 and v_veces > 0.1 then
          v_veces := null;
        end if;
      end if;

      v_mov := private.registrar_movimiento(
        p_tipo        => 'ENTRADA_COMPRA',
        p_signo       => 1,
        p_almacen     => v_alm,
        p_articulo    => v_art.id,
        p_cantidad    => v_uso,
        p_costo_usd   => v_costo,
        p_nota        => concat_ws(' · ', 'Recepción ' || v_codigo, v_o.codigo, v_prov,
                           case when v_ucompra is not null
                                then format('%s %s × %s = %s %s', private.cantidad_es(v_cant), v_ucompra,
                                            private.cantidad_es(v_factor), private.cantidad_es(v_uso), v_art.unidad) end,
                           case when v_marca is not null then 'llegó marca ' || v_marca end),
        p_aviso_costo => v_veces);
      select m.numero into v_mov_num from public.inventario_movimientos m where m.id = v_mov;
    end if;

    v_valor := v_valor + v_cant * v_precio;

    -- El renglón de la OC: lo recibido acumulado, la marca y la ficha si se ligó ahora.
    select jsonb_agg(case when i ->> 'sku' = v_sku and coalesce((i ->> 'comprar')::boolean, true)
                          then i
                               || jsonb_build_object('cantidad_recibida', round(v_previo + v_cant, 4))
                               || case when v_marca is not null
                                       then jsonb_build_object('marca_recibida', v_marca, 'nota_marca', v_nota_marca)
                                       else '{}'::jsonb end
                               || case when coalesce((v_x ->> 'sin_inventario')::boolean, false)
                                       then jsonb_build_object('sin_inventario', true) else '{}'::jsonb end
                               || case when (i ->> 'articulo_id') is null and v_art.id is not null
                                       then jsonb_build_object('articulo_id', v_art.id, 'articulo_nombre', v_art.nombre)
                                            || case when v_creada then jsonb_build_object('ficha_creada', true) else '{}'::jsonb end
                                       else '{}'::jsonb end
                          else i end order by n)
      into v_items
      from jsonb_array_elements(v_items) with ordinality as e(i, n);

    v_ren := v_ren || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'sku', v_sku,
      'nombre', v_nombre,
      'articulo_id', v_art.id,
      'articulo_nombre', v_art.nombre,
      'cantidad', v_cant,
      'unidad', coalesce(v_ucompra, v_it ->> 'unidad'),
      'factor', case when v_ucompra is not null then v_factor end,
      'cantidad_inventario', case when v_mov is not null then v_uso end,
      'unidad_inventario', case when v_mov is not null then v_art.unidad end,
      'precio', v_precio,
      'costo_usd', case when v_mov is not null then v_costo end,
      'valor', round(v_cant * v_precio, 2),
      'movimiento_id', v_mov,
      'movimiento_numero', v_mov_num,
      'aviso_costo', v_veces,
      'sin_inventario', case when v_sin or (v_art.id is not null and not v_art.inventariable) then true end,
      'ficha_creada', case when v_creada then true end,
      'marca_recibida', v_marca,
      'nota_marca', case when v_marca is not null then v_nota_marca end,
      'pedido', v_pedido,
      'recibido', round(v_previo + v_cant, 4))));
    v_hay := true;
  end loop;

  -- Al menos una cantidad o una devolución. Cerrar sin mercancía nueva solo después de una recepción.
  if not v_hay and jsonb_array_length(v_devs) = 0 and not (v_cerrar and v_o.recibido_total is not null) then
    raise exception 'Marcá al menos un producto recibido, o indicá por qué no entra.' using errcode = '22023';
  end if;

  v_faltan := private.compras_faltan(v_items);
  v_completa := jsonb_array_length(v_faltan) = 0;

  if v_cerrar and not v_completa and (
       jsonb_array_length(v_devs) > 0
       or exists (select 1 from public.compras_devoluciones d where d.orden_id = p_id and d.estado = 'pendiente')) then
    raise exception 'Hay productos para cambiar o devolver: Compras decide qué hacer con ellos antes de cerrar la recepción.'
      using errcode = '55000';
  end if;

  v_cierra := v_completa or v_cerrar;

  if v_cierra and not v_completa and v_nota is null then
    raise exception 'Recibiste menos de lo pedido: indicá una nota explicando la diferencia.' using errcode = '22023';
  end if;

  -- Lo recibido en dinero: el total de la OC por la fracción recibida.
  v_rec_total := round(coalesce(v_o.total, 0) * private.compras_fraccion_recibida(v_items), 2);

  insert into public.compras_recepciones
    (orden_id, numero, codigo, orden_codigo, oc_codigo, proveedor_id, proveedor_nombre, almacen_id,
     renglones, valor, nota, sin_inventario, completa, cierra, faltan, fotos,
     documento_tipo, documento_path, documento_nombre, recibida_por, recibida_por_nombre, no_entraron)
  values
    (p_id, v_n, v_codigo, v_o.codigo, v_o.oc_codigo, v_o.proveedor_id, v_prov, v_alm,
     v_ren, round(v_valor, 2), v_nota, coalesce((p_datos ->> 'sin_inventario')::boolean, false), v_completa, v_cierra,
     v_faltan, v_fotos, v_doc_tipo, v_doc ->> 'path', v_doc ->> 'filename',
     (select auth.uid()), private.compras_mi_nombre(), v_no_entra)
  returning id into v_rec_id;

  for v_d in select * from jsonb_array_elements(v_devs) loop
    insert into public.compras_devoluciones
      (orden_id, recepcion_id, sku, nombre, cantidad, unidad, precio, motivo, nota, creada_por, creada_por_nombre)
    values
      (p_id, v_rec_id, v_d ->> 'sku', v_d ->> 'nombre', (v_d ->> 'cantidad')::numeric, v_d ->> 'unidad',
       (v_d ->> 'precio')::numeric, v_d ->> 'motivo', v_d ->> 'nota', (select auth.uid()), private.compras_mi_nombre());
  end loop;

  -- El estado: solo cambia al cerrar la recepción (MGG).
  v_estado := v_o.estado;
  if v_cierra then
    v_tmp := v_o;
    v_tmp.items := v_items;
    v_tmp.recibido_total := v_rec_total;
    v_estado := case when v_o.condiciones_pago = 'credito' and v_o.pagada_en is null
                           and private.compras_saldo_credito(v_tmp) > 0.01
                     then 'cuenta_abierta' else 'recibida' end;
  end if;

  update public.compras_ordenes
     set estado = v_estado,
         items = v_items,
         recibido_total = v_rec_total,
         sin_inventario = sin_inventario or coalesce((p_datos ->> 'sin_inventario')::boolean, false),
         nota_recepcion = case
                            when v_nota is not null then concat_ws(E'\n', nota_recepcion, format('R%s: %s', v_n, v_nota))
                            when v_cierra and not v_completa and nota_recepcion is null
                              then 'Recepción parcial: llegó menos de lo solicitado.'
                            else nota_recepcion end,
         recepcion_fotos = coalesce(recepcion_fotos, '[]'::jsonb)
                           || coalesce((select jsonb_agg(f || jsonb_build_object('recepcion', v_n))
                                          from jsonb_array_elements(v_fotos) f), '[]'::jsonb),
         factura_path = coalesce(v_doc ->> 'path', factura_path),
         factura_nombre = coalesce(v_doc ->> 'filename', factura_nombre),
         factura_tipo = coalesce(v_doc_tipo, factura_tipo),
         recibida_por = case when v_cierra then (select auth.uid()) else recibida_por end,
         recibida_por_nombre = case when v_cierra then private.compras_mi_nombre() else recibida_por_nombre end,
         recibida_en = case when v_cierra then now() else recibida_en end,
         historial = historial || private.compras_evento(
           case when v_cierra then 'recibida' else 'recibida_parcial' end,
           jsonb_strip_nulls(jsonb_build_object(
             'recepcion', v_codigo,
             'recepcion_id', v_rec_id,
             'numero', v_n,
             'almacen', 'ALM-GEN',
             'renglones', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                             'nombre', r ->> 'nombre', 'cantidad', r -> 'cantidad', 'unidad', r ->> 'unidad',
                             'pedido', r -> 'pedido', 'recibido', r -> 'recibido',
                             'movimiento', r ->> 'movimiento_numero'))), '[]'::jsonb)
                             from jsonb_array_elements(v_ren) r),
             'no_entraron', case when jsonb_array_length(v_no_entra) > 0 then v_no_entra end,
             'valor', round(v_valor, 2),
             'recibido_total', v_rec_total,
             'faltan', case when jsonb_array_length(v_faltan) > 0 then v_faltan end,
             'parcial', not v_completa,
             'cerrada_sin_completar', case when v_cierra and not v_completa then true end,
             'nota', v_nota,
             'sin_inventario', case when coalesce((p_datos ->> 'sin_inventario')::boolean, false) then true end,
             'fichas_creadas', case when cardinality(v_creadas) > 0 then to_jsonb(v_creadas) end,
             'marcas_cambiadas', case when cardinality(v_marcas) > 0 then to_jsonb(v_marcas) end,
             'fotos', case when jsonb_array_length(v_fotos) > 0 then jsonb_array_length(v_fotos) end,
             'documento', v_doc ->> 'filename',
             'a', case when v_cierra then v_estado end)))
   where id = p_id
  returning * into v_o;

  -- Una sub-OC: la madre se resuelve como en MGG (sigue «Repartida entre
  -- proveedores» mientras sus hijas vivan; cada una se recibe por separado).
  if v_o.parent_orden_id is not null then
    perform private.compras_reestado_madre(v_o.parent_orden_id);
  end if;

  -- MGG: «Mercancía recibida · {código} · stock actualizado», o «Recepción
  -- confirmada · {código} · …» en contra entrega y sin inventario.
  v_titulo := case
    when not v_cierra then
      format('Recepción parcial · %s · R%s · falta por recibir', v_oc, v_n)
    when v_o.condiciones_pago = 'contra_entrega' and v_o.pagada_en is null then
      format('Recepción confirmada · %s · indicá el método para pagar lo recibido', v_oc)
    when v_sin_orden then
      format('Recepción confirmada · %s · sin sumar al inventario (carga manual)', v_oc)
    else
      format('Mercancía recibida · %s · stock actualizado', v_oc) end;

  perform private.compras_avisar(v_o, case when v_cierra then 'OC_RECIBIDA' else 'OC_RECIBIDA_PARCIAL' end,
    v_titulo, array['COMPRAS'], '/app/pedidos',
    case when v_cierra and v_o.condiciones_pago = 'contra_entrega' and v_o.pagada_en is null then 'ATENCION' else 'INFO' end);
  perform private.compras_avisar_solicitante(v_o, case when v_cierra then 'OC_RECIBIDA' else 'OC_RECIBIDA_PARCIAL' end,
    case when v_cierra then format('Tu pedido %s llegó al Almacén General', v_o.codigo)
         else format('Tu pedido %s llegó en parte al Almacén General', v_o.codigo) end);

  -- Lo que vuelve al proveedor lo decide Compras.
  if jsonb_array_length(v_devs) > 0 then
    perform private.compras_avisar(v_o, 'OC_DEVOLUCION',
      format('%s · %s producto(s) para cambiar o devolver: decidí qué hacer', v_oc, jsonb_array_length(v_devs)),
      array['COMPRAS'], '/app/pedidos', 'ATENCION');
  end if;

  return jsonb_build_object(
    'id', v_o.id,
    'estado', v_o.estado,
    'recepcion_id', v_rec_id,
    'codigo', v_codigo,
    'numero', v_n,
    'completa', v_completa,
    'cerrada', v_cierra,
    'valor', round(v_valor, 2),
    'recibido_total', v_rec_total,
    'devoluciones', jsonb_array_length(v_devs));
end;
$$;

revoke all on function public.compras_recibir_orden(bigint, jsonb) from public, anon;
grant execute on function public.compras_recibir_orden(bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Compras decide qué pasa con lo devuelto
-- ---------------------------------------------------------------------------

create or replace function public.compras_resolver_devolucion(p_id bigint, p_decision text, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d       public.compras_devoluciones;
  v_o       public.compras_ordenes;
  v_it      jsonb;
  v_nota    text := nullif(btrim(coalesce(p_nota, '')), '');
  v_queda   numeric;
  v_cant    numeric;
  v_items   jsonb;
  v_nueva   public.compras_ordenes;
  v_estado  text;
  v_cierra  boolean := false;
  v_tmp     public.compras_ordenes;
  v_oc      text;
  v_rec     numeric;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'Qué hacer con un producto devuelto lo decide Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;
  if p_decision not in ('cambio_proveedor', 'recotizar', 'descartar') then
    raise exception 'La decisión es: lo cambia el proveedor, volver a cotizarlo o no reponerlo.' using errcode = '22023';
  end if;
  if length(coalesce(v_nota, '')) > 300 then
    raise exception 'La nota va en 300 letras como mucho.' using errcode = '22023';
  end if;

  select * into v_d from public.compras_devoluciones where id = p_id for update;
  if v_d.id is null then
    raise exception 'Esa devolución no existe.' using errcode = 'P0002';
  end if;
  if v_d.estado <> 'pendiente' then
    raise exception 'Esa devolución ya se decidió.' using errcode = '55000';
  end if;

  select * into v_o from public.compras_ordenes where id = v_d.orden_id for update;
  v_oc := coalesce(v_o.oc_codigo, v_o.codigo);
  if v_o.estado in ('cancelada', 'anulada', 'finalizada') then
    raise exception 'La orden % ya está cerrada.', v_oc using errcode = '55000';
  end if;

  select i into v_it
    from jsonb_array_elements(v_o.items) i
   where i ->> 'sku' = v_d.sku and coalesce((i ->> 'comprar')::boolean, true)
   limit 1;
  if v_it is null then
    raise exception 'Ese producto ya no está en la orden.' using errcode = '55000';
  end if;

  if p_decision in ('recotizar', 'descartar') then
    -- Lo que todavía se espera de ese producto en esta OC.
    v_queda := round(coalesce((v_it ->> 'cantidad')::numeric, 0)
                     - coalesce((v_it ->> 'cantidad_recibida')::numeric, 0)
                     - coalesce((v_it ->> 'cantidad_devuelta')::numeric, 0), 4);
    v_cant := least(v_d.cantidad, v_queda);
    if v_cant <= 0 then
      raise exception '«%» ya se recibió completo: no queda nada que devolver.', v_d.nombre using errcode = '55000';
    end if;

    select jsonb_agg(case when i ->> 'sku' = v_d.sku and coalesce((i ->> 'comprar')::boolean, true)
                          then i || jsonb_build_object('cantidad_devuelta',
                                     round(coalesce((i ->> 'cantidad_devuelta')::numeric, 0) + v_cant, 4))
                          else i end order by n)
      into v_items
      from jsonb_array_elements(v_o.items) with ordinality as e(i, n);
  else
    v_items := v_o.items;
  end if;

  -- Recotizar: una SP nueva, ya aprobada, solo con ese producto.
  if p_decision = 'recotizar' then
    insert into public.compras_ordenes
      (codigo, clase, estado, creado_por, creado_por_nombre, solicitante_id, solicitante_nombre,
       unidad_solicitante, items, total, notas, motivo, finalidad, urgente, almacen_destino_id,
       aprobada_por, aprobada_por_nombre, aprobada_en, historial)
    values
      (private.siguiente_numero('SP'), 'producto', 'aprobada',
       (select auth.uid()), private.compras_mi_nombre(), v_o.solicitante_id, v_o.solicitante_nombre,
       v_o.unidad_solicitante,
       jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
         'sku', v_it ->> 'sku',
         'nombre', v_it ->> 'nombre',
         'unidad', v_it ->> 'unidad',
         'cantidad', v_cant,
         'cantidad_solicitada', v_cant,
         'precio', 0,
         'comprar', true,
         'articulo_id', v_it -> 'articulo_id',
         'general', v_it -> 'general',
         'marca', v_it ->> 'marca',
         'finalidad', v_it ->> 'finalidad'))),
       0,
       left(concat_ws(' · ', format('Recotización de %s (%s)', v_oc, private.compras_motivo_txt(v_d.motivo)),
                      v_d.nota, v_nota), 1000),
       v_o.motivo, v_o.finalidad, v_o.urgente, v_o.almacen_destino_id,
       (select auth.uid()), private.compras_mi_nombre(), now(),
       private.compras_evento('creada', jsonb_build_object(
         'detalle', format('Recotización de %s: %s (%s)', v_oc, v_d.nombre, private.compras_motivo_txt(v_d.motivo)),
         'origen_orden_id', v_o.id)))
    returning * into v_nueva;
  end if;

  update public.compras_devoluciones
     set estado = case p_decision when 'recotizar' then 'recotizada'
                                  when 'descartar' then 'descartada'
                                  else 'cambio_proveedor' end,
         decision_nota = v_nota,
         nueva_orden_id = v_nueva.id,
         resuelta_por = (select auth.uid()),
         resuelta_por_nombre = private.compras_mi_nombre(),
         resuelta_en = now()
   where id = p_id;

  -- Si con eso ya no falta nada, la recepción de la OC se cierra.
  v_estado := v_o.estado;
  if v_o.recibida_en is null and v_o.recibido_total is not null
     and v_o.estado in ('por_recibir', 'pagada', 'cuenta_abierta')
     and jsonb_array_length(private.compras_faltan(v_items)) = 0 then
    v_cierra := true;
    v_rec := round(coalesce(v_o.total, 0) * private.compras_fraccion_recibida(v_items), 2);
    v_tmp := v_o;
    v_tmp.items := v_items;
    v_tmp.recibido_total := v_rec;
    v_estado := case when v_o.condiciones_pago = 'credito' and v_o.pagada_en is null
                           and private.compras_saldo_credito(v_tmp) > 0.01
                     then 'cuenta_abierta' else 'recibida' end;
  end if;

  update public.compras_ordenes
     set items = v_items,
         estado = v_estado,
         recibido_total = case when v_cierra then v_rec else recibido_total end,
         recibida_por = case when v_cierra then (select auth.uid()) else recibida_por end,
         recibida_por_nombre = case when v_cierra then private.compras_mi_nombre() else recibida_por_nombre end,
         recibida_en = case when v_cierra then now() else recibida_en end,
         historial = historial
                     || private.compras_evento('devolucion_decidida', jsonb_strip_nulls(jsonb_build_object(
                          'producto', v_d.nombre,
                          'cantidad', v_d.cantidad,
                          'unidad', v_d.unidad,
                          'motivo', private.compras_motivo_txt(v_d.motivo),
                          'decision', p_decision,
                          'nota', v_nota,
                          'nueva_sp', v_nueva.codigo)))
                     || case when v_cierra then private.compras_evento('recibida', jsonb_build_object(
                          'detalle', 'Recepción cerrada: lo que faltaba se devolvió', 'a', v_estado))
                        else '[]'::jsonb end
   where id = v_o.id
  returning * into v_o;

  if v_o.parent_orden_id is not null then
    perform private.compras_reestado_madre(v_o.parent_orden_id);
  end if;

  if v_nueva.id is not null then
    perform private.compras_avisar(v_nueva, 'PEDIDO_APROBADO',
      format('%s · recotización de %s: %s', v_nueva.codigo, v_oc, v_d.nombre),
      array['COMPRAS'], '/app/pedidos', 'ATENCION');
  end if;

  return jsonb_build_object(
    'id', p_id,
    'orden_id', v_o.id,
    'estado_orden', v_o.estado,
    'nueva_orden_id', v_nueva.id,
    'nueva_codigo', v_nueva.codigo,
    'cerro_recepcion', v_cierra);
end;
$$;

revoke all on function public.compras_resolver_devolucion(bigint, text, text) from public, anon;
grant execute on function public.compras_resolver_devolucion(bigint, text, text) to authenticated;
