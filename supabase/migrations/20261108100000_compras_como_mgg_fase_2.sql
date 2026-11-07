/*
  COMPRAS COMO MGG · FASE 2
  COTIZACIÓN, OFERTAS Y ORDEN DE COMPRA

  Angélica, 07/11/2026: el módulo de compras se reemplaza por una copia exacta
  del de MGG, por fases. La fase 1 dejó la Solicitud de Pedido, la revisión del
  almacén y la aprobación de la Orden de Pedido. Esta fase pone lo que sigue en
  la pestaña «🧾 Órdenes de Compra»: cargar las cotizaciones de los
  proveedores (`ofertas_proveedor` de MGG → `compras_ofertas`), compararlas con
  el score, elegir una (la OC nace en «Ordenes pendiente por aprobar») o
  repartir los productos entre varios proveedores (sub-OC hijas), y corregir la
  OC antes de que la aprueben: editarla, cambiarle la modalidad de pago,
  volver a cotizar, registrar que el proveedor desistió o anularla. Más el chat
  interno de cada orden (`oc_mensajes` → `compras_mensajes`).

  LO QUE CAMBIA RESPECTO A MGG

  1. TODO EN LA BASE. En MGG elegir una oferta son dos escrituras desde el
     navegador (aceptar la oferta y luego crear la OC) y, si la segunda falla,
     el navegador intenta deshacer la primera; de ahí el aviso «oferta huérfana»
     y el botón «↩ Liberar y volver a elegir». Aquí es una sola función en una
     sola transacción: o queda la OC con su oferta aceptada, o no queda nada.
     No hay huérfanas, así que no hay aviso ni botón para liberarlas.

  2. EL CÁLCULO EN UN SOLO SITIO. La fórmula del total (MGG `impuestosOc.ts`):
       total = r2( max(0, subtotal − descuento) + (iva_incluido ? 0 : iva) + igtf + ajuste )
     y el recorte de una oferta a lo que se le compra (MGG `recortarOfertaAHija`:
     descuento, IVA, IGTF, efectivo y ajuste prorrateados por la fracción) viven
     en `private.compras_armar_oc`. La pantalla los repite para enseñar el
     resumen antes de confirmar, pero lo que se guarda lo calcula la base.

  3. LAS VARIANTES DE MARCA NO SE SUMAN. MGG suma todas las filas de la
     cotización en `precio_total` aunque dos filas del mismo producto sean
     alternativas («una u otra»); su propio `variantesOferta.ts` dice que no se
     suman. Aquí el total de la oferta toma una fila por producto, la más cara
     (el representante de MGG), así la comparativa no infla a quien cotizó dos
     marcas.

  4. UNA SUB-OC QUE EL PROVEEDOR DEJA (desistió o se anuló) MUERE: sus
     productos vuelven a la OP madre para asignarlos de nuevo, como hace MGG al
     contar las hijas muertas (cancelada, anulada, desistida_proveedor).

  5. SIN TESORERÍA, SIN DELIVERY, UN SOLO ALMACÉN. El destino de entrega de
     MGG (Los Pinos / Matanza) no se pregunta: todo llega al almacén general
     (fase 1). Los textos que nombran Tesorería se omiten.

  6. QUIÉN: cotizar, elegir, repartir, editar, reabrir, desistir y anular una
     OC por aprobar es de quien lleva Compras (`private.compras_gestiona()`:
     COMPRAS en total, ADMIN siempre). Anular una OC ya aprobada (fase 3) es de
     `private.compras_aprueba_oc()`.

  LO QUE NO SE TOCA: el flujo anterior (ordenes_compra, cotizaciones…). La OC
  nueva comparte el correlativo 'OC' con él (`siguiente_numero('OC')`), así
  ninguna OC-AAAA-NNNN se repite entre los dos.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Las cotizaciones (MGG `ofertas_proveedor`)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.compras_ofertas (
  id                      bigint generated always as identity primary key,
  -- Siempre la OP madre: las ofertas de una sub-OC viven en su madre.
  orden_id                bigint not null references public.compras_ordenes(id) on delete cascade,
  proveedor_id            bigint not null references public.proveedores(id) on delete restrict,
  -- [{sku, nombre, cantidad, precio (BCV, $), precio_usd (efectivo), unidad,
  --   marca, modelo, unidad_compra, factor_compra, articulo_id, articulo_nombre,
  --   agregado}] — varias filas con el mismo sku son variantes de marca.
  items                   jsonb not null default '[]'::jsonb,
  -- Subtotal BCV (o el USD si solo cotizó en divisa), una fila por producto.
  precio_total            numeric(14, 2) not null default 0,
  -- Total si se paga en divisa efectivo (descuento por pagar así).
  precio_efectivo         numeric(14, 2),
  descuento               numeric(14, 2),
  iva                     numeric(14, 2),
  igtf                    numeric(14, 2),
  iva_incluido            boolean not null default false,
  ajuste                  numeric(14, 2),
  ajuste_motivo           text,
  fecha_entrega_prometida date,
  condiciones_pago        text check (condiciones_pago in ('contado', 'contra_entrega', 'anticipado', 'credito')),
  notas                   text,
  -- {marca, modelo, procedencia, materiales, dimensiones, peso, calidad,
  --  logistica: {flete, transporte, embalaje, seguros}}
  detalle                 jsonb,
  estado                  text not null default 'pendiente'
                            check (estado in ('pendiente', 'aceptada', 'descartada')),
  score_calculado         numeric(8, 4),
  motivo_descarte         text,
  -- [{path, filename}] en el depósito `compras-ofertas`.
  adjuntos                jsonb not null default '[]'::jsonb,
  registrada_por          uuid not null references public.perfiles(id),
  registrada_por_nombre   text,
  registrada_en           timestamptz not null default now(),
  actualizado_en          timestamptz,
  decidida_por            uuid references public.perfiles(id),
  decidida_por_nombre     text,
  decidida_en             timestamptz,

  constraint compras_ofertas_items_lista check (jsonb_typeof(items) = 'array'),
  constraint compras_ofertas_adjuntos_lista check (
    jsonb_typeof(adjuntos) = 'array' and jsonb_array_length(adjuntos) <= 12),
  -- MGG: «Una sola oferta por proveedor y orden; las variantes de marca van
  -- dentro de esa oferta.» Allá lo cuida la pantalla; aquí, la base.
  constraint compras_ofertas_una_por_proveedor unique (orden_id, proveedor_id)
);

comment on table public.compras_ofertas is
  'Cotizaciones de los proveedores para una OP (MGG ofertas_proveedor). Una por proveedor y orden; viven en la OP madre. Solo se escribe por funciones.';

create index if not exists compras_ofertas_proveedor_idx on public.compras_ofertas (proveedor_id);
create index if not exists compras_ofertas_estado_idx on public.compras_ofertas (estado);

drop trigger if exists trg_tocada on public.compras_ofertas;
create trigger trg_tocada
  before update on public.compras_ofertas
  for each row execute function private.compras_ordenes_tocada();

drop trigger if exists trg_normalizar on public.compras_ofertas;
create trigger trg_normalizar
  before insert or update on public.compras_ofertas
  for each row execute function private.normalizar_texto('notas', 'ajuste_motivo', 'motivo_descarte');

drop trigger if exists trg_auditar on public.compras_ofertas;
create trigger trg_auditar
  after insert or update or delete on public.compras_ofertas
  for each row execute function private.auditar('id');

-- Las cotizaciones son de Compras: quien solo pide no las ve.
alter table public.compras_ofertas enable row level security;

drop policy if exists compras_ofertas_lectura on public.compras_ofertas;
create policy compras_ofertas_lectura on public.compras_ofertas
  for select to authenticated
  using (private.tiene_permiso('COMPRAS', 'LECTURA'));

revoke all on public.compras_ofertas from anon, public, authenticated;
grant select on public.compras_ofertas to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. El chat interno de la orden (MGG `oc_mensajes`)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.compras_mensajes (
  id           bigint generated always as identity primary key,
  orden_id     bigint not null references public.compras_ordenes(id) on delete cascade,
  texto        text not null check (length(btrim(texto)) > 0 and length(texto) <= 2000),
  autor        uuid not null references public.perfiles(id),
  autor_nombre text,
  -- Quiénes ya lo leyeron (uuid del perfil): alimenta el «💬 n» de las tarjetas.
  leido_por    uuid[] not null default '{}',
  creado_en    timestamptz not null default now()
);

comment on table public.compras_mensajes is
  'Chat interno de una orden de compras (MGG oc_mensajes): no se envía al proveedor. Lo lee quien puede ver la orden.';

create index if not exists compras_mensajes_orden_idx on public.compras_mensajes (orden_id, creado_en);

alter table public.compras_mensajes enable row level security;

drop policy if exists compras_mensajes_lectura on public.compras_mensajes;
create policy compras_mensajes_lectura on public.compras_mensajes
  for select to authenticated
  using (private.compras_puede_ver_orden(orden_id));

revoke all on public.compras_mensajes from anon, public, authenticated;
grant select on public.compras_mensajes to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Ayudantes
-- ═══════════════════════════════════════════════════════════════════════════

-- «Puede aprobar la OC» (MGG `puedeAprobarOc`): Compras en total o un
-- aprobador de compras (ADMIN siempre). La aprobación en sí es de la fase 3;
-- aquí manda en «⊘ Anular OC» de una OC ya aprobada.
create or replace function private.compras_aprueba_oc()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.compras_gestiona() or private.es_aprobador_de_compras();
$$;

-- La fórmula única del total (MGG `totalDesdePartes`, impuestosOc.ts).
create or replace function private.compras_total_partes(
  p_subtotal numeric,
  p_descuento numeric,
  p_iva numeric,
  p_igtf numeric,
  p_iva_incluido boolean,
  p_ajuste numeric
) returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
           greatest(0, round(coalesce(p_subtotal, 0), 2) - greatest(0, coalesce(p_descuento, 0)))
           + case when coalesce(p_iva_incluido, false) then 0 else greatest(0, coalesce(p_iva, 0)) end
           + greatest(0, coalesce(p_igtf, 0))
           + round(coalesce(p_ajuste, 0), 2),
         2);
$$;

/*
  Los totales de una cotización con UNA fila por producto (MGG
  `totalesRepresentativos`): de las variantes de marca de un mismo sku manda la
  de mayor total BCV; a igualdad, la primera.
*/
create or replace function private.compras_oferta_totales(p_items jsonb, out o_bcv numeric, out o_usd numeric)
language sql
immutable
set search_path = ''
as $$
  with r as (
    select distinct on (i ->> 'sku') i
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as e(i, n)
     where coalesce((i ->> 'comprar')::boolean, true)
     order by i ->> 'sku',
              coalesce((i ->> 'cantidad')::numeric, 0) * coalesce((i ->> 'precio')::numeric, 0) desc,
              n
  )
  select round(coalesce(sum(coalesce((i ->> 'cantidad')::numeric, 0) * coalesce((i ->> 'precio')::numeric, 0)), 0), 2),
         round(coalesce(sum(coalesce((i ->> 'cantidad')::numeric, 0) * coalesce((i ->> 'precio_usd')::numeric, 0)), 0), 2)
    from r;
$$;

-- «RAZÓN SOCIAL · RIF», como lo guarda MGG en los eventos de cambio de proveedor.
create or replace function private.compras_texto_proveedor(p_id bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select concat_ws(' · ', p.nombre, p.rif) from public.proveedores p where p.id = p_id), '—');
$$;

-- Los SKU que ya tienen dueño en una sub-OC viva de esta madre (MGG: las hijas
-- muertas son cancelada, anulada y desistida_proveedor).
create or replace function private.compras_skus_tomados(p_madre_id bigint, p_excepto bigint default null)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct i ->> 'sku'), '{}')
    from public.compras_ordenes h
    cross join lateral jsonb_array_elements(h.items) i
   where h.parent_orden_id = p_madre_id
     and h.id is distinct from p_excepto
     and h.estado not in ('cancelada', 'anulada', 'desistida_proveedor')
     and coalesce((i ->> 'comprar')::boolean, true);
$$;

-- Lo que de la madre todavía no tiene proveedor.
create or replace function private.compras_skus_pendientes(p_madre public.compras_ordenes)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(i ->> 'sku' order by n), '{}')
    from jsonb_array_elements(p_madre.items) with ordinality as e(i, n)
   where coalesce((i ->> 'comprar')::boolean, true)
     and not ((i ->> 'sku') = any (private.compras_skus_tomados(p_madre.id)));
$$;

/*
  LA OC QUE SALE DE UNA OFERTA (MGG `aprobarOrdenConOferta`, `recortarOfertaAHija`,
  `itemHijaDesdeOferta` y `reprecioPorEfectivo`, juntos).

  p_items:     los renglones de la orden (de ahí salen nombre, finalidad, unidad).
  p_seleccion: [{sku, idx?}] — qué productos se le compran a este proveedor y,
               con variantes, cuál fila (idx, desde 0, en `oferta.items`). Sin
               idx manda el representante (la variante más cara).
  p_modalidad: 'usd' (pago en divisa: cada renglón a su precio efectivo) o
               'bs' (al cambio BCV: el precio BCV, o el USD si solo cotizó así).

  La cantidad sale de la cotización (MGG 14-10-2026: la cotización aceptada es
  la compra); el descuento, el IVA, el IGTF, el efectivo y el ajuste se
  prorratean por la parte que se compra.
*/
create or replace function private.compras_armar_oc(
  p_items jsonb,
  p_oferta public.compras_ofertas,
  p_seleccion jsonb,
  p_modalidad text
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sel       jsonb;
  v_sku       text;
  v_idx       integer;
  v_fila      jsonb;
  v_sp        jsonb;
  v_unit      numeric;
  v_cant      numeric;
  v_items     jsonb := '[]'::jsonb;
  v_faltan    text[] := '{}';
  v_sin_usd   text[] := '{}';
  v_vistos    text[] := '{}';
  v_sub       numeric := 0;
  v_bcv       numeric := 0;
  v_usd       numeric := 0;
  v_todo_usd  boolean := true;
  v_gross_of  numeric;
  v_gross     numeric := 0;
  v_frac      numeric;
  v_desc      numeric;
  v_iva       numeric;
  v_igtf      numeric;
  v_efe       numeric;
  v_aj        numeric;
  v_tot       numeric;
  v_tot_div   numeric;
begin
  if p_modalidad not in ('usd', 'bs') then
    raise exception 'Indicá cómo se va a pagar: en $ (divisa) o en Bs al cambio (BCV).' using errcode = '22023';
  end if;

  if p_seleccion is null or jsonb_typeof(p_seleccion) <> 'array' or jsonb_array_length(p_seleccion) = 0 then
    raise exception 'Tildá al menos un producto para comprarle a este proveedor' using errcode = '22023';
  end if;

  for v_sel in select * from jsonb_array_elements(p_seleccion) loop
    v_sku := nullif(btrim(coalesce(v_sel ->> 'sku', '')), '');
    if v_sku is null or v_sku = any (v_vistos) then
      raise exception 'Un producto viene vacío o dos veces en la selección.' using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_sku;

    v_idx := nullif(btrim(coalesce(v_sel ->> 'idx', '')), '')::integer;
    v_fila := null;
    if v_idx is not null then
      v_fila := p_oferta.items -> v_idx;
      if v_fila is null or v_fila ->> 'sku' is distinct from v_sku then
        raise exception 'La marca elegida no es de esta cotización.' using errcode = '22023';
      end if;
    else
      select i into v_fila
        from jsonb_array_elements(p_oferta.items) with ordinality as e(i, n)
       where i ->> 'sku' = v_sku and coalesce((i ->> 'comprar')::boolean, true)
       order by coalesce((i ->> 'cantidad')::numeric, 0) * coalesce((i ->> 'precio')::numeric, 0) desc, n
       limit 1;
    end if;

    select i into v_sp from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i where i ->> 'sku' = v_sku limit 1;

    -- precioRenglon de MGG: el BCV si lo hay; si no, el USD.
    v_unit := case when coalesce((v_fila ->> 'precio')::numeric, 0) > 0 then (v_fila ->> 'precio')::numeric
                   else coalesce((v_fila ->> 'precio_usd')::numeric, 0) end;
    if v_fila is null or v_unit <= 0 then
      v_faltan := v_faltan || coalesce(v_sp ->> 'nombre', v_fila ->> 'nombre', v_sku);
      continue;
    end if;

    if coalesce((v_fila ->> 'precio_usd')::numeric, 0) <= 0 then
      v_todo_usd := false;
      v_sin_usd := v_sin_usd || coalesce(v_sp ->> 'nombre', v_fila ->> 'nombre', v_sku);
    end if;

    v_cant := case when coalesce((v_fila ->> 'cantidad')::numeric, 0) > 0 then (v_fila ->> 'cantidad')::numeric
                   else coalesce((v_sp ->> 'cantidad')::numeric, 0) end;
    if v_cant <= 0 then
      v_faltan := v_faltan || coalesce(v_sp ->> 'nombre', v_fila ->> 'nombre', v_sku);
      continue;
    end if;

    v_gross := v_gross + v_cant * v_unit;
    v_bcv := v_bcv + v_cant * coalesce((v_fila ->> 'precio')::numeric, 0);
    v_usd := v_usd + v_cant * coalesce((v_fila ->> 'precio_usd')::numeric, 0);
    if p_modalidad = 'usd' then
      v_unit := coalesce((v_fila ->> 'precio_usd')::numeric, 0);
    end if;
    v_sub := v_sub + v_cant * v_unit;

    v_items := v_items || jsonb_build_array(
      coalesce(v_sp, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
           'sku', v_sku,
           'nombre', coalesce(v_sp ->> 'nombre', v_fila ->> 'nombre'),
           'cantidad', v_cant,
           'precio', v_unit,
           'precio_usd', nullif(coalesce((v_fila ->> 'precio_usd')::numeric, 0), 0),
           'precio_bcv', nullif(coalesce((v_fila ->> 'precio')::numeric, 0), 0),
           'unidad', coalesce(v_sp ->> 'unidad', v_fila ->> 'unidad'),
           'marca', v_fila ->> 'marca',
           'modelo', v_fila ->> 'modelo',
           'unidad_compra', v_fila ->> 'unidad_compra',
           'factor_compra', (v_fila ->> 'factor_compra')::numeric,
           'articulo_id', coalesce((v_sp ->> 'articulo_id')::bigint, (v_fila ->> 'articulo_id')::bigint),
           'articulo_nombre', v_fila ->> 'articulo_nombre',
           'agregado', case when v_sp is null then true end))
      || jsonb_build_object('comprar', true));
  end loop;

  if cardinality(v_faltan) > 0 then
    raise exception 'Esta oferta no cotiza %. Elegí otra oferta o cargá esos precios primero.',
      array_to_string(v_faltan, ', ') using errcode = '22023';
  end if;

  if p_modalidad = 'usd' and not v_todo_usd then
    raise exception 'Esta oferta no cotizó precio en USD para %: elegí «Pagar en Bs al cambio (tasa BCV)».',
      array_to_string(v_sin_usd, ', ') using errcode = '22023';
  end if;

  if round(v_sub, 2) <= 0 then
    raise exception 'No se puede crear la OC: todos los productos están en $0. Cargá al menos un precio antes de aceptar la oferta.'
      using errcode = '22023';
  end if;

  -- La fracción de la oferta que se compra (MGG `recortarOfertaAHija`).
  v_gross_of := coalesce(nullif(round(p_oferta.precio_total, 2), 0),
                         (select o_usd from private.compras_oferta_totales(p_oferta.items)));
  v_frac := case when coalesce(v_gross_of, 0) > 0 then least(1, round(v_gross, 2) / v_gross_of)
                 when v_gross > 0 then 1 else 0 end;

  v_desc := nullif(round(greatest(coalesce(p_oferta.descuento, 0), 0) * v_frac, 2), 0);
  v_iva  := nullif(round(greatest(coalesce(p_oferta.iva, 0), 0) * v_frac, 2), 0);
  v_igtf := nullif(round(greatest(coalesce(p_oferta.igtf, 0), 0) * v_frac, 2), 0);
  v_efe  := nullif(round(greatest(coalesce(p_oferta.precio_efectivo, 0), 0) * v_frac, 2), 0);
  v_aj   := nullif(round(coalesce(p_oferta.ajuste, 0) * v_frac, 2), 0);

  v_tot := private.compras_total_partes(v_sub, v_desc, v_iva, v_igtf, p_oferta.iva_incluido, v_aj);
  v_tot_div := case when v_todo_usd
                    then private.compras_total_partes(v_usd, v_desc, v_iva, v_igtf, p_oferta.iva_incluido, v_aj) end;

  return jsonb_build_object(
    'items', v_items,
    'skus', to_jsonb(v_vistos),
    'subtotal', round(v_sub, 2),
    'descuento', v_desc,
    'iva', v_iva,
    'igtf', v_igtf,
    'iva_incluido', coalesce(p_oferta.iva_incluido, false),
    'ajuste', v_aj,
    'ajuste_motivo', case when v_aj is not null then p_oferta.ajuste_motivo end,
    'total', v_tot,
    'total_divisa', v_tot_div,
    'precio_bcv', nullif(round(v_bcv, 2), 0),
    'precio_efectivo', case when v_todo_usd then coalesce(v_efe, nullif(round(v_usd, 2), 0)) end,
    'fraccion', v_frac);
end;
$$;

/*
  Después de crear, desistir o anular una sub-OC: la madre queda «Repartida
  entre proveedores» si todo lo que se compra tiene dueño, o «Aprobada» si
  queda algo por asignar (MGG `asignarProveedoresAOrden`). Devuelve si quedó
  completa. Las ofertas pendientes se descartan cuando ya no queda nada.
*/
create or replace function private.compras_reestado_madre(p_madre_id bigint, p_extra jsonb default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m        public.compras_ordenes;
  v_completo boolean;
begin
  select o.* into v_m from public.compras_ordenes o where o.id = p_madre_id for update;
  if v_m.id is null or v_m.estado not in ('aprobada', 'asignada', 'desistida_proveedor') then
    return false;
  end if;

  v_completo := cardinality(private.compras_skus_pendientes(v_m)) = 0;

  update public.compras_ordenes
     set estado = case when v_completo then 'asignada' else 'aprobada' end,
         historial = case when p_extra is null then historial
                          else historial || private.compras_evento('proveedores_asignados',
                                 p_extra || jsonb_build_object('completo', v_completo)) end
   where id = p_madre_id;

  if v_completo then
    update public.compras_ofertas
       set estado = 'descartada',
           motivo_descarte = 'Todos los productos quedaron asignados a otros proveedores',
           decidida_por = (select auth.uid()),
           decidida_por_nombre = private.compras_mi_nombre(),
           decidida_en = now()
     where orden_id = p_madre_id and estado = 'pendiente';
  end if;

  return v_completo;
end;
$$;

-- Los adjuntos que manda la pantalla: [{path, filename}] dentro de la carpeta
-- de la orden madre en `compras-ofertas`.
create or replace function private.compras_adjuntos_validos(p_adjuntos jsonb, p_madre_id bigint, p_max integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_adjuntos is null or jsonb_typeof(p_adjuntos) = 'null' then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p_adjuntos) <> 'array' then
    raise exception 'Los adjuntos van en una lista.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_adjuntos) > p_max then
    raise exception 'Máximo % archivos adjuntos.', p_max using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_adjuntos) a
              where coalesce(a ->> 'path', '') not like p_madre_id::text || '/%'
                 or nullif(btrim(coalesce(a ->> 'filename', '')), '') is null) then
    raise exception 'Un adjunto no es de esta orden.' using errcode = '22023';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('path', a ->> 'path', 'filename', a ->> 'filename')), '[]'::jsonb)
            from jsonb_array_elements(p_adjuntos) a);
end;
$$;

/*
  LOS RENGLONES DE UNA COTIZACIÓN, LIMPIOS (como `compras_normalizar_items`).

  Cada fila es de un producto de la orden (por su SKU) o un producto del
  inventario que el proveedor agregó (`agregado`, con su `articulo_id`). El
  nombre y la unidad los pone la orden; el proveedor pone cantidad, precios,
  marca y modelo y la medida en que vende («Se compra en»: BULTO de 50).
  «Se guarda en inventario como»: un renglón de nombre general puede quedar
  ligado a una ficha del inventario (`articulo_id`).
*/
create or replace function private.compras_normalizar_items_oferta(p_items jsonb, p_orden public.compras_ordenes)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_x      jsonb;
  v_n      integer := 0;
  v_out    jsonb := '[]'::jsonb;
  v_sp     jsonb;
  v_art    public.articulos;
  v_sku    text;
  v_nombre text;
  v_unidad text;
  v_cant   numeric;
  v_prec   numeric;
  v_usd    numeric;
  v_uc     text;
  v_factor numeric;
  v_ligado bigint;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La cotización no trae productos.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 300 then
    raise exception 'Una cotización lleva hasta 300 renglones.' using errcode = '22023';
  end if;

  for v_x in select * from jsonb_array_elements(p_items) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_x) <> 'object' then
      raise exception 'El renglón % de la cotización no se entiende.', v_n using errcode = '22023';
    end if;

    v_sku := nullif(btrim(coalesce(v_x ->> 'sku', '')), '');
    select i into v_sp from jsonb_array_elements(p_orden.items) i where i ->> 'sku' = v_sku limit 1;
    v_art := null;
    v_ligado := null;

    if v_sp is not null then
      v_nombre := v_sp ->> 'nombre';
      v_unidad := v_sp ->> 'unidad';
      -- «Se guarda en inventario como»: solo un renglón sin ficha se liga.
      if (v_sp ->> 'articulo_id') is null then
        v_ligado := nullif(btrim(coalesce(v_x ->> 'articulo_id', '')), '')::bigint;
        if v_ligado is not null then
          select a.* into v_art from public.articulos a where a.id = v_ligado and a.activo;
          if v_art.id is null then
            raise exception '«%»: ese artículo no existe en el inventario o está inactivo.', v_nombre using errcode = '23503';
          end if;
        end if;
      end if;
    else
      -- Un producto que la orden no pedía: tiene que ser del inventario.
      v_ligado := nullif(btrim(coalesce(v_x ->> 'articulo_id', '')), '')::bigint;
      if v_ligado is null or not coalesce((v_x ->> 'agregado')::boolean, false) then
        raise exception 'El renglón % de la cotización no es de esta orden.', v_n using errcode = '22023';
      end if;
      select a.* into v_art from public.articulos a where a.id = v_ligado and a.activo;
      if v_art.id is null then
        raise exception 'El producto agregado no existe en el inventario o está inactivo.' using errcode = '23503';
      end if;
      v_sku := v_art.codigo;
      v_nombre := v_art.nombre;
      v_unidad := coalesce(private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'unidad', '')), '')), v_art.unidad);
    end if;

    begin
      v_cant := coalesce(nullif(btrim(coalesce(v_x ->> 'cantidad', '')), '')::numeric, 0);
      v_prec := round(coalesce(nullif(btrim(coalesce(v_x ->> 'precio', '')), '')::numeric, 0), 4);
      v_usd := round(nullif(btrim(coalesce(v_x ->> 'precio_usd', '')), '')::numeric, 4);
      v_factor := nullif(btrim(coalesce(v_x ->> 'factor_compra', '')), '')::numeric;
    exception when others then
      raise exception '«%»: una cantidad o un precio no se entiende.', v_nombre using errcode = '22023';
    end;

    if v_cant < 0 or v_prec < 0 or coalesce(v_usd, 0) < 0 then
      raise exception '«%»: la cantidad y los precios no pueden ser negativos.', v_nombre using errcode = '22023';
    end if;

    -- «Se compra en»: si la medida del proveedor no es la de uso, hace falta
    -- cuántas trae cada una (MGG unidadCompra.ts).
    v_uc := private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'unidad_compra', '')), ''));
    if v_uc is not null and v_uc = upper(coalesce(v_unidad, '')) then
      v_uc := null;
    end if;
    if v_uc is not null and coalesce(v_factor, 0) <= 0 then
      raise exception '%: indicá cuántas % trae cada %.', v_nombre, coalesce(v_unidad, 'unidades'), v_uc
        using errcode = '22023';
    end if;
    if v_uc is null then
      v_factor := null;
    end if;

    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'sku', v_sku,
      'nombre', v_nombre,
      'cantidad', v_cant,
      'precio', v_prec,
      'precio_usd', nullif(v_usd, 0),
      'unidad', v_unidad,
      'marca', private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'marca', '')), '')),
      'modelo', private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'modelo', '')), '')),
      'unidad_compra', v_uc,
      'factor_compra', v_factor,
      'articulo_id', case when v_art.id is not null then v_art.id end,
      'articulo_nombre', case when v_art.id is not null then v_art.nombre end,
      'agregado', case when v_sp is null then true end)));
  end loop;

  return v_out;
end;
$$;

/*
  Sincronizar las OC de una oferta aceptada con lo que dice la oferta (MGG
  `resincronizarOcDesdeOferta` y el disparador `sync_orden_total_desde_oferta`):
  precios, IVA, IGTF, descuento y ajuste, en las OC de ese proveedor que todavía
  no se pagaron. Cada OC toma la fila de la oferta de su misma marca.
*/
create or replace function private.compras_resincronizar_oferta(p_oferta public.compras_ofertas)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o     public.compras_ordenes;
  v_sel   jsonb;
  v_arm   jsonb;
  v_items jsonb;
  v_sub   numeric;
  v_tot   numeric;
  v_n     integer := 0;
begin
  for v_o in
    select o.* from public.compras_ordenes o
     where o.proveedor_id = p_oferta.proveedor_id
       and o.estado in ('oc_creada', 'confirmada_metodo', 'oc_aprobada')
       and (o.id = p_oferta.orden_id or o.parent_orden_id = p_oferta.orden_id)
     for update
  loop
    -- La fila de la oferta de cada producto de la OC: la de su marca, o la primera.
    select coalesce(jsonb_agg(jsonb_build_object('sku', t.sku, 'idx', t.idx)), '[]'::jsonb)
      into v_sel
      from (
        select distinct on (i ->> 'sku') i ->> 'sku' as sku, (f.n - 1) as idx
          from jsonb_array_elements(v_o.items) i
          join jsonb_array_elements(p_oferta.items) with ordinality as f(r, n) on f.r ->> 'sku' = i ->> 'sku'
         where coalesce((i ->> 'comprar')::boolean, true)
         order by i ->> 'sku',
                  (coalesce(f.r ->> 'marca', '') = coalesce(i ->> 'marca', '')
                   and coalesce(f.r ->> 'modelo', '') = coalesce(i ->> 'modelo', '')) desc,
                  f.n
      ) t;

    if jsonb_array_length(v_sel) = 0 then
      continue;
    end if;

    begin
      v_arm := private.compras_armar_oc(v_o.items, p_oferta, v_sel, coalesce(v_o.modalidad_pago, 'bs'));
    exception when others then
      -- La oferta ya no cotiza algo de esta OC: se deja como está y se corrige a mano.
      continue;
    end;

    -- Los renglones de la OC que la oferta ya no trae se quedan como estaban.
    select coalesce(jsonb_agg(coalesce(
             (select a from jsonb_array_elements(v_arm -> 'items') a where a ->> 'sku' = i ->> 'sku' limit 1),
             i) order by n), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(v_o.items) with ordinality as e(i, n);

    v_sub := private.compras_total_items(v_items);
    v_tot := private.compras_total_partes(v_sub, (v_arm ->> 'descuento')::numeric, (v_arm ->> 'iva')::numeric,
               (v_arm ->> 'igtf')::numeric, (v_arm ->> 'iva_incluido')::boolean, (v_arm ->> 'ajuste')::numeric);

    if v_items = v_o.items and v_tot = v_o.total
       and v_o.iva is not distinct from (v_arm ->> 'iva')::numeric
       and v_o.igtf is not distinct from (v_arm ->> 'igtf')::numeric
       and v_o.descuento_obtenido is not distinct from (v_arm ->> 'descuento')::numeric
       and v_o.ajuste is not distinct from (v_arm ->> 'ajuste')::numeric
       and v_o.iva_incluido = (v_arm ->> 'iva_incluido')::boolean then
      continue;
    end if;

    update public.compras_ordenes
       set items = v_items,
           total = v_tot,
           total_divisa = (v_arm ->> 'total_divisa')::numeric,
           descuento_obtenido = (v_arm ->> 'descuento')::numeric,
           iva = (v_arm ->> 'iva')::numeric,
           igtf = (v_arm ->> 'igtf')::numeric,
           iva_incluido = (v_arm ->> 'iva_incluido')::boolean,
           ajuste = (v_arm ->> 'ajuste')::numeric,
           ajuste_motivo = v_arm ->> 'ajuste_motivo',
           condiciones_pago = coalesce(p_oferta.condiciones_pago, condiciones_pago),
           oferta_detalle = p_oferta.detalle,
           oferta_precio_bcv = (v_arm ->> 'precio_bcv')::numeric,
           oferta_precio_efectivo = (v_arm ->> 'precio_efectivo')::numeric,
           historial = historial || private.compras_evento('oc_editada', jsonb_build_object(
             'motivo', 'Sincronización de IVA y total desde la cotización',
             'iva', coalesce((v_arm ->> 'iva')::numeric, 0), 'total', v_tot))
     where id = v_o.id;
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Lo que la pantalla pregunta antes de dibujar
-- ═══════════════════════════════════════════════════════════════════════════

-- Igual que en la fase 1, con «aprueba_oc» = Compras en total o aprobador.
create or replace function public.compras_mis_permisos_de_pedidos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();

  return jsonb_build_object(
    -- MGG `!soloSolicitud`: ve las pestañas de Compras.
    'compras', private.tiene_permiso('COMPRAS', 'LECTURA'),
    -- Cancela órdenes ajenas.
    'escribe', private.tiene_permiso('COMPRAS', 'ESCRITURA'),
    -- MGG `canManageProcurement` (cotizar, elegir la oferta, editar la OC).
    'gestiona', private.compras_gestiona(),
    -- MGG `puedeAprobarOc`.
    'aprueba_oc', private.compras_aprueba_oc(),
    'revisa_almacen', private.compras_revisa_almacen(),
    'pide_por_otro', private.puede_pedir_por_otro(),
    'yo', (select auth.uid()),
    'mi_nombre', private.compras_mi_nombre());
end;
$$;

/*
  Lo que alimenta el score de cada proveedor (MGG `getStatsForProveedores`).
  MGG lo saca de las evaluaciones al finalizar el pedido, que llegan en la fase
  4: hasta entonces la puntualidad y la calidad son las neutras de MGG (50 % y
  3/5) y el cumplimiento sale de las veces que el proveedor desistió.
*/
create or replace function public.compras_estadisticas_proveedores()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();

  if not private.tiene_permiso('COMPRAS', 'LECTURA') then
    raise exception 'Sin permiso para ver Compras.' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'proveedor_id', t.proveedor_id,
             'puntualidad_pct', 0.5,
             'calidad_avg', 3,
             'cumplimiento_pct', case when t.total > 0 then greatest(0, 1 - t.desistidas::numeric / t.total) else 1 end,
             'total_evaluaciones', 0,
             'total_ordenes', t.total)), '[]'::jsonb)
      from (
        select f.proveedor_id,
               count(*) filter (where f.estado = 'aceptada' or f.motivo_descarte like 'PROVEEDOR DESISTIO%') as total,
               count(*) filter (where f.motivo_descarte like 'PROVEEDOR DESISTIO%') as desistidas
          from public.compras_ofertas f
         group by f.proveedor_id
      ) t);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Las cotizaciones: registrar, editar, eliminar
-- ═══════════════════════════════════════════════════════════════════════════

/*
  REGISTRAR O EDITAR UNA OFERTA (MGG `AgregarOfertaModal` → `crearOferta` /
  `actualizarOferta`, con `crearProveedor` y `revisarCambioProveedorOferta`).

  p_oferta_id nulo = alta. p_proveedor_nuevo = {razon_social, rif, telefono,
  correo, direccion} cuando el proveedor no está registrado.
  p_datos = {items, descuento, iva, igtf, iva_incluido, ajuste, ajuste_motivo,
  fecha_entrega_prometida, condiciones_pago, notas, detalle, adjuntos}.

  Las validaciones van en el orden de MGG y con sus textos.
*/
create or replace function public.compras_guardar_oferta(
  p_orden_id bigint,
  p_oferta_id bigint,
  p_proveedor_id bigint,
  p_proveedor_nuevo jsonb,
  p_datos jsonb,
  p_motivo_cambio text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o        public.compras_ordenes;
  v_m        public.compras_ordenes;
  v_of       public.compras_ofertas;
  v_items    jsonb;
  v_tot      record;
  v_total    numeric;
  v_efe      numeric;
  v_desc     numeric;
  v_iva      numeric;
  v_igtf     numeric;
  v_aj       numeric;
  v_cond     text;
  v_prov     bigint := p_proveedor_id;
  v_creado   boolean := false;
  v_rif      text;
  v_razon    text;
  v_correo   text;
  v_cambia   boolean := false;
  v_motivo   text := nullif(btrim(coalesce(p_motivo_cambio, '')), '');
  v_bloquea  public.compras_ordenes;
  v_detalle  jsonb;
  v_adj      jsonb;
  v_fecha    date;
  v_ligadas  public.compras_ordenes;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'Las cotizaciones las carga quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;

  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos de la oferta.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_orden_id;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;

  -- Las ofertas viven en la madre (MGG `ordenDeOfertas`).
  select o.* into v_m from public.compras_ordenes o where o.id = coalesce(v_o.parent_orden_id, v_o.id) for update;

  if p_oferta_id is not null then
    select f.* into v_of from public.compras_ofertas f where f.id = p_oferta_id for update;
    if v_of.id is null or v_of.orden_id <> v_m.id then
      raise exception 'Esa oferta no es de esta orden.' using errcode = 'P0002';
    end if;
  elsif v_m.estado not in ('aprobada', 'asignada', 'desistida_proveedor') then
    raise exception 'Las ofertas se cargan con la orden de pedido aprobada (está en «%»).', v_m.estado
      using errcode = '55000';
  end if;

  v_items := private.compras_normalizar_items_oferta(p_datos -> 'items', v_m);
  select * into v_tot from private.compras_oferta_totales(v_items);

  -- 1. Al menos un precio.
  if coalesce(v_tot.o_bcv, 0) <= 0 and coalesce(v_tot.o_usd, 0) <= 0 then
    raise exception 'Ingresá el precio en Bs (BCV) y/o en USD efectivo: al menos uno.' using errcode = '22023';
  end if;

  -- 2. La condición de pago.
  v_cond := nullif(btrim(coalesce(p_datos ->> 'condiciones_pago', '')), '');
  if v_cond is null or v_cond not in ('contado', 'contra_entrega', 'anticipado', 'credito') then
    raise exception 'Elegí la condición de pago (define el flujo: contado, crédito, contra entrega…)' using errcode = '22023';
  end if;

  -- 3. El efectivo es un descuento por pagar en divisa.
  if v_tot.o_bcv > 0 and v_tot.o_usd > 0 and v_tot.o_usd >= v_tot.o_bcv then
    raise exception 'El precio en divisa efectivo debe ser menor al total BCV (es un descuento por pago en efectivo).'
      using errcode = '22023';
  end if;

  v_total := case when v_tot.o_bcv > 0 then v_tot.o_bcv else v_tot.o_usd end;
  v_efe := case when v_tot.o_bcv > 0 and v_tot.o_usd > 0 then v_tot.o_usd end;

  begin
    v_desc := nullif(round(greatest(coalesce(nullif(p_datos ->> 'descuento', '')::numeric, 0), 0), 2), 0);
    v_iva := nullif(round(greatest(coalesce(nullif(p_datos ->> 'iva', '')::numeric, 0), 0), 2), 0);
    v_igtf := nullif(round(greatest(coalesce(nullif(p_datos ->> 'igtf', '')::numeric, 0), 0), 2), 0);
    v_aj := nullif(round(coalesce(nullif(p_datos ->> 'ajuste', '')::numeric, 0), 2), 0);
    v_fecha := nullif(p_datos ->> 'fecha_entrega_prometida', '')::date;
  exception when others then
    raise exception 'Un monto o la fecha de entrega no se entienden.' using errcode = '22023';
  end;

  if coalesce(v_desc, 0) > v_total then
    raise exception 'El descuento no puede superar el total de la oferta.' using errcode = '22023';
  end if;

  if length(coalesce(p_datos ->> 'ajuste_motivo', '')) > 120 then
    raise exception 'El motivo del ajuste va en 120 letras como mucho.' using errcode = '22023';
  end if;

  -- 6. El cambio de proveedor de una oferta ya aceptada pasa a sus órdenes.
  if v_of.id is not null and v_prov is not null and v_prov <> v_of.proveedor_id then
    v_cambia := true;
    if v_of.estado = 'aceptada' then
      if v_motivo is null then
        raise exception 'Indique el motivo del cambio de proveedor: la oferta ya está aceptada y el cambio pasa a la orden.'
          using errcode = '22023';
      end if;
      if length(v_motivo) < 5 then
        raise exception 'El motivo es muy corto (mínimo 5 letras).' using errcode = '22023';
      end if;
    end if;
  end if;

  -- Una oferta aceptada no se toca con la orden pagada o recibida.
  if v_of.estado = 'aceptada' then
    select o.* into v_bloquea
      from public.compras_ordenes o
     where o.proveedor_id = v_of.proveedor_id
       and (o.id = v_m.id or o.parent_orden_id = v_m.id)
       and o.estado not in ('cancelada', 'anulada', 'desistida_proveedor')
       and (o.estado in ('pagada', 'recibida', 'finalizada') or o.recibida_en is not null)
     limit 1;
    if v_bloquea.id is not null then
      if v_bloquea.recibida_en is not null and v_bloquea.estado not in ('pagada', 'recibida', 'finalizada') then
        raise exception 'La orden % ya tiene mercancía recibida: el proveedor y los precios de su oferta aceptada ya no se pueden cambiar.',
          coalesce(v_bloquea.oc_codigo, v_bloquea.codigo) using errcode = '55000';
      end if;
      raise exception 'La orden % ya está pagada/recibida/finalizada: el proveedor de su oferta aceptada ya no se puede cambiar.',
        coalesce(v_bloquea.oc_codigo, v_bloquea.codigo) using errcode = '55000';
    end if;
  end if;

  -- 7. El proveedor nuevo, creado junto con la oferta.
  if v_of.id is null and p_proveedor_nuevo is not null and jsonb_typeof(p_proveedor_nuevo) = 'object' then
    v_razon := nullif(btrim(coalesce(p_proveedor_nuevo ->> 'razon_social', '')), '');
    v_rif := upper(regexp_replace(coalesce(p_proveedor_nuevo ->> 'rif', ''), '[\s.]', '', 'g'));
    if v_rif ~ '^[VEJPGC][0-9]{9}$' then
      v_rif := substr(v_rif, 1, 1) || '-' || substr(v_rif, 2, 8) || '-' || substr(v_rif, 10, 1);
    elsif v_rif ~ '^[VEJPGC]-[0-9]{9}$' then
      v_rif := substr(v_rif, 1, 2) || substr(v_rif, 3, 8) || '-' || substr(v_rif, 11, 1);
    end if;
    if v_razon is null or v_rif !~ '^[VEJPGC]-[0-9]{8}-[0-9]$' then
      raise exception 'Razón social y RIF (con número) son obligatorios para el nuevo proveedor' using errcode = '22023';
    end if;
    v_correo := nullif(btrim(coalesce(p_proveedor_nuevo ->> 'correo', '')), '');
    if v_correo is not null and v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'El correo del proveedor no tiene un formato válido' using errcode = '22023';
    end if;
    if exists (select 1 from public.proveedores p where p.rif = v_rif) then
      raise exception 'Ya hay un proveedor registrado con el RIF %. Búsquelo en la lista.', v_rif using errcode = '23505';
    end if;
    insert into public.proveedores (rif, nombre, telefono, correo, direccion, condicion_pago, moneda_preferida, activo, creado_por)
    values (v_rif, v_razon,
            nullif(regexp_replace(coalesce(p_proveedor_nuevo ->> 'telefono', ''), '\D', '', 'g'), ''),
            v_correo,
            nullif(btrim(coalesce(p_proveedor_nuevo ->> 'direccion', '')), ''),
            'CONTADO', 'USD', true, (select auth.uid()))
    returning id into v_prov;
    v_creado := true;
  end if;

  -- 8. El proveedor.
  if v_prov is null then
    if v_of.id is not null then
      v_prov := v_of.proveedor_id;
    else
      raise exception 'Selecciona un proveedor' using errcode = '22023';
    end if;
  end if;
  if not exists (select 1 from public.proveedores p where p.id = v_prov and (p.activo or p.id = v_of.proveedor_id)) then
    raise exception 'Ese proveedor no existe o está inactivo.' using errcode = '23503';
  end if;

  if exists (select 1 from public.compras_ofertas f
              where f.orden_id = v_m.id and f.proveedor_id = v_prov and f.id is distinct from v_of.id) then
    raise exception '% ya cargó una oferta en esta orden. Para corregir un precio, editá la oferta desde la comparativa con el ✎.',
      (select p.nombre from public.proveedores p where p.id = v_prov) using errcode = '23505';
  end if;

  if v_of.id is null and (select count(*) from public.compras_ofertas f where f.orden_id = v_m.id) >= 6 then
    raise exception 'Ya hay 6 ofertas cargadas en % (máximo 6).', v_m.codigo using errcode = '22023';
  end if;

  -- Los datos técnicos y la logística, solo con las claves conocidas.
  v_detalle := jsonb_strip_nulls(jsonb_build_object(
    'marca', private.en_mayuscula(nullif(btrim(coalesce(p_datos -> 'detalle' ->> 'marca', '')), '')),
    'modelo', private.en_mayuscula(nullif(btrim(coalesce(p_datos -> 'detalle' ->> 'modelo', '')), '')),
    'procedencia', private.en_mayuscula(nullif(btrim(coalesce(p_datos -> 'detalle' ->> 'procedencia', '')), '')),
    'materiales', private.en_mayuscula(nullif(btrim(coalesce(p_datos -> 'detalle' ->> 'materiales', '')), '')),
    'dimensiones', nullif(btrim(coalesce(p_datos -> 'detalle' ->> 'dimensiones', '')), ''),
    'peso', nullif(btrim(coalesce(p_datos -> 'detalle' ->> 'peso', '')), ''),
    'calidad', private.en_mayuscula(nullif(btrim(coalesce(p_datos -> 'detalle' ->> 'calidad', '')), '')),
    'logistica', nullif(jsonb_strip_nulls(jsonb_build_object(
      'flete', case when p_datos -> 'detalle' -> 'logistica' ->> 'flete' in ('incluido', 'comprador') then p_datos -> 'detalle' -> 'logistica' ->> 'flete' end,
      'transporte', case when p_datos -> 'detalle' -> 'logistica' ->> 'transporte' in ('incluido', 'comprador') then p_datos -> 'detalle' -> 'logistica' ->> 'transporte' end,
      'embalaje', case when p_datos -> 'detalle' -> 'logistica' ->> 'embalaje' in ('incluido', 'comprador') then p_datos -> 'detalle' -> 'logistica' ->> 'embalaje' end,
      'seguros', case when p_datos -> 'detalle' -> 'logistica' ->> 'seguros' in ('incluido', 'comprador') then p_datos -> 'detalle' -> 'logistica' ->> 'seguros' end)),
      '{}'::jsonb)));
  if v_detalle = '{}'::jsonb then
    v_detalle := null;
  end if;

  v_adj := private.compras_adjuntos_validos(p_datos -> 'adjuntos', v_m.id, 12);

  if v_of.id is null then
    insert into public.compras_ofertas
      (orden_id, proveedor_id, items, precio_total, precio_efectivo, descuento, iva, igtf, iva_incluido,
       ajuste, ajuste_motivo, fecha_entrega_prometida, condiciones_pago, notas, detalle, adjuntos,
       registrada_por, registrada_por_nombre)
    values
      (v_m.id, v_prov, v_items, v_total, v_efe, v_desc, v_iva, v_igtf,
       coalesce((p_datos ->> 'iva_incluido')::boolean, false) and v_iva is not null,
       v_aj, case when v_aj is not null then nullif(btrim(coalesce(p_datos ->> 'ajuste_motivo', '')), '') end,
       v_fecha, v_cond, nullif(btrim(coalesce(p_datos ->> 'notas', '')), ''), v_detalle, v_adj,
       (select auth.uid()), private.compras_mi_nombre())
    returning * into v_of;

    -- MGG: «Oferta registrada para {codigo}».
    perform private.compras_avisar(v_m, 'OFERTA_REGISTRADA', format('Oferta registrada para %s', v_m.codigo), array['COMPRAS']);
  else
    -- El proveedor de una oferta aceptada cambia también en sus órdenes.
    if v_cambia and v_of.estado = 'aceptada' then
      for v_ligadas in
        select o.* from public.compras_ordenes o
         where o.proveedor_id = v_of.proveedor_id
           and (o.id = v_m.id or o.parent_orden_id = v_m.id)
           and o.estado not in ('cancelada', 'anulada', 'desistida_proveedor')
         for update
      loop
        update public.compras_ordenes
           set proveedor_id = v_prov,
               historial = historial || private.compras_evento('proveedor_cambiado', jsonb_build_object(
                 'desde', 'oferta_aceptada',
                 'proveedorAnteriorId', v_of.proveedor_id,
                 'proveedorNuevoId', v_prov,
                 'proveedorAnterior', private.compras_texto_proveedor(v_of.proveedor_id),
                 'proveedorNuevo', private.compras_texto_proveedor(v_prov),
                 'motivo', v_motivo))
         where id = v_ligadas.id;
      end loop;
    end if;

    update public.compras_ofertas
       set proveedor_id = v_prov,
           items = v_items,
           precio_total = v_total,
           precio_efectivo = v_efe,
           descuento = v_desc,
           iva = v_iva,
           igtf = v_igtf,
           iva_incluido = coalesce((p_datos ->> 'iva_incluido')::boolean, false) and v_iva is not null,
           ajuste = v_aj,
           ajuste_motivo = case when v_aj is not null then nullif(btrim(coalesce(p_datos ->> 'ajuste_motivo', '')), '') end,
           fecha_entrega_prometida = v_fecha,
           condiciones_pago = v_cond,
           notas = nullif(btrim(coalesce(p_datos ->> 'notas', '')), ''),
           detalle = v_detalle,
           adjuntos = v_adj
     where id = v_of.id
    returning * into v_of;

    if v_of.estado = 'aceptada' then
      perform private.compras_resincronizar_oferta(v_of);
    end if;

    -- MGG: «Oferta actualizada para {codigo}».
    perform private.compras_avisar(v_m, 'OFERTA_ACTUALIZADA', format('Oferta actualizada para %s', v_m.codigo), array['COMPRAS']);
  end if;

  if v_creado then
    -- MGG: «Proveedor "{razón}" registrado».
    perform private.notificar('COMPRAS', 'PROVEEDOR_REGISTRADO',
      format('Proveedor "%s" registrado', (select p.nombre from public.proveedores p where p.id = v_prov)),
      format('Desde la oferta de %s', v_m.codigo), '/app/compras/proveedores', array['COMPRAS'], 'INFO');
  end if;

  return jsonb_build_object('id', v_of.id, 'proveedor_id', v_prov, 'proveedor_creado', v_creado, 'orden_id', v_m.id);
end;
$$;

-- «🗑 Eliminar oferta» (MGG `eliminarOferta`): solo una pendiente. Devuelve los
-- adjuntos para que la pantalla los saque del depósito.
create or replace function public.compras_eliminar_oferta(p_oferta_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_of public.compras_ofertas;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'Las cotizaciones las maneja quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;

  select f.* into v_of from public.compras_ofertas f where f.id = p_oferta_id for update;
  if v_of.id is null then
    raise exception 'Esa oferta no existe o ya fue eliminada.' using errcode = 'P0002';
  end if;
  if v_of.estado <> 'pendiente' then
    raise exception 'Solo se elimina una oferta pendiente.' using errcode = '55000';
  end if;

  delete from public.compras_ofertas where id = p_oferta_id;
  return v_of.adjuntos;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Elegir la oferta → la OC
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Una sub-OC hija con lo que se le compra a un proveedor (MGG
  `asignarProveedoresAOrden`): código «{SP}-n», su propio OC-, «Ordenes
  pendiente por aprobar», y hereda de la madre la solicitud y su contexto.
*/
create or replace function private.compras_crear_hija(
  p_madre public.compras_ordenes,
  p_oferta public.compras_ofertas,
  p_armado jsonb,
  p_modalidad text,
  p_motivo text,
  p_adjuntos jsonb,
  p_score numeric
) returns public.compras_ordenes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n   integer;
  v_cod text;
  v_oc  text := private.siguiente_numero('OC');
  v_h   public.compras_ordenes;
begin
  select count(*) + 1 into v_n from public.compras_ordenes h where h.parent_orden_id = p_madre.id;
  loop
    v_cod := format('%s-%s', p_madre.codigo, v_n);
    exit when not exists (select 1 from public.compras_ordenes o where o.codigo = v_cod);
    v_n := v_n + 1;
  end loop;

  insert into public.compras_ordenes
    (codigo, parent_orden_id, clase, estado, proveedor_id,
     creado_por, creado_por_nombre, solicitante_id, solicitante_nombre, unidad_solicitante,
     items, total, notas, motivo, finalidad, clasificacion, urgente, almacen_destino_id,
     aprobada_por, aprobada_por_nombre, aprobada_en,
     oc_codigo, oc_creada_por, oc_creada_por_nombre, oc_creada_en, condiciones_pago,
     oferta_detalle, oferta_precio_efectivo, oferta_precio_bcv, oferta_motivo, oferta_motivo_adjuntos,
     descuento_obtenido, iva, igtf, iva_incluido, ajuste, ajuste_motivo,
     modalidad_pago, pago_en_divisa, total_divisa, historial)
  values
    (v_cod, p_madre.id, p_madre.clase, 'oc_creada', p_oferta.proveedor_id,
     p_madre.creado_por, p_madre.creado_por_nombre, p_madre.solicitante_id, p_madre.solicitante_nombre,
     p_madre.unidad_solicitante,
     p_armado -> 'items', (p_armado ->> 'total')::numeric, p_madre.notas, p_madre.motivo, p_madre.finalidad,
     p_madre.clasificacion, p_madre.urgente, p_madre.almacen_destino_id,
     p_madre.aprobada_por, p_madre.aprobada_por_nombre, p_madre.aprobada_en,
     v_oc, (select auth.uid()), private.compras_mi_nombre(), now(), p_oferta.condiciones_pago,
     p_oferta.detalle, (p_armado ->> 'precio_efectivo')::numeric, (p_armado ->> 'precio_bcv')::numeric,
     nullif(btrim(coalesce(p_motivo, '')), ''), nullif(p_adjuntos, '[]'::jsonb),
     (p_armado ->> 'descuento')::numeric, (p_armado ->> 'iva')::numeric, (p_armado ->> 'igtf')::numeric,
     (p_armado ->> 'iva_incluido')::boolean, (p_armado ->> 'ajuste')::numeric, p_armado ->> 'ajuste_motivo',
     p_modalidad, p_modalidad = 'usd', (p_armado ->> 'total_divisa')::numeric,
     private.compras_evento('oc_creada', jsonb_build_object(
       'oc_codigo', v_oc,
       'proveedor_id', p_oferta.proveedor_id,
       'proveedor', private.compras_texto_proveedor(p_oferta.proveedor_id),
       'precio', (p_armado ->> 'total')::numeric,
       'score', p_score,
       'parent', p_madre.codigo,
       'modalidad_pago', p_modalidad,
       'pago_en_divisa', p_modalidad = 'usd')))
  returning * into v_h;

  return v_h;
end;
$$;

/*
  «★ Aceptar oferta recomendada» / «Aceptar esta oferta» → «Elegir oferta»
  (MGG `AceptarOfertaModal` → `aceptarOferta` + `aprobarOrdenConOferta`).

  p_seleccion: [{sku, idx?}] los productos tildados y la marca de cada uno.
  p_modalidad: 'usd' | 'bs' («🪙 ¿Cómo se va a pagar esta compra?»).

  - Si se le compra TODO lo pendiente a este proveedor y la orden no tiene
    sub-OC, la orden misma pasa a ser la OC («Ordenes pendiente por aprobar»).
  - Si se destildó algo (o ya hay sub-OC), lo tildado sale en una sub-OC hija
    y lo demás queda pendiente en la OP madre (MGG: «quedan pendientes por
    asignar en la OP madre»).
  - En una sub-OC que se reabrió (sin proveedor), la sub-OC misma pasa a ser
    la OC con esta oferta (MGG «reelegible»).
*/
create or replace function public.compras_aceptar_oferta(
  p_orden_id bigint,
  p_oferta_id bigint,
  p_seleccion jsonb,
  p_modalidad text,
  p_motivo text default null,
  p_motivo_adjuntos jsonb default '[]'::jsonb,
  p_score numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o       public.compras_ordenes;
  v_m       public.compras_ordenes;
  v_of      public.compras_ofertas;
  v_es_hija boolean;
  v_pend    text[];
  v_validos text[];
  v_skus    text[];
  v_arm     jsonb;
  v_adj     jsonb;
  v_res     public.compras_ordenes;
  v_oc      text;
  v_conv    boolean;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'La oferta la elige quien lleva Compras (Compras en total) o un administrador.' using errcode = '42501';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_orden_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  v_es_hija := v_o.parent_orden_id is not null;

  if v_o.estado not in ('aprobada', 'desistida_proveedor') or (v_es_hija and v_o.estado <> 'aprobada') then
    raise exception 'Solo se crea la OC sobre órdenes de pedido aprobadas' using errcode = '55000';
  end if;
  if v_es_hija and v_o.proveedor_id is not null then
    raise exception 'Esta sub-orden ya tiene proveedor.' using errcode = '55000';
  end if;

  if v_es_hija then
    select o.* into v_m from public.compras_ordenes o where o.id = v_o.parent_orden_id for update;
  else
    v_m := v_o;
  end if;

  select f.* into v_of from public.compras_ofertas f where f.id = p_oferta_id for update;
  if v_of.id is null or v_of.orden_id <> v_m.id then
    raise exception 'Esa oferta no es de esta orden.' using errcode = 'P0002';
  end if;

  if not v_es_hija and v_of.estado <> 'pendiente' then
    raise exception 'Esa oferta ya no está pendiente: refrescá la comparativa.' using errcode = '55000';
  end if;
  if v_es_hija and exists (
       select 1 from public.compras_ordenes h
        where h.parent_orden_id = v_m.id and h.id <> v_o.id and h.proveedor_id = v_of.proveedor_id
          and h.estado not in ('cancelada', 'anulada', 'desistida_proveedor')) then
    raise exception 'Ese proveedor ya tiene otra sub-OC viva en %.', v_m.codigo using errcode = '55000';
  end if;

  -- Lo que se puede tildar: lo pendiente de la orden y lo que el proveedor agregó.
  if v_es_hija then
    select coalesce(array_agg(i ->> 'sku'), '{}') into v_pend
      from jsonb_array_elements(v_o.items) i where coalesce((i ->> 'comprar')::boolean, true);
  else
    v_pend := private.compras_skus_pendientes(v_o);
  end if;

  select coalesce(array_agg(distinct f ->> 'sku'), '{}') into v_validos
    from jsonb_array_elements(v_of.items) f
   where (f ->> 'sku') = any (v_pend) or coalesce((f ->> 'agregado')::boolean, false);

  if p_seleccion is null or jsonb_typeof(p_seleccion) <> 'array' or jsonb_array_length(p_seleccion) = 0 then
    raise exception '%', case when v_es_hija
      then 'Tildá al menos un producto de esta sub-OC para comprarle a este proveedor.'
      else 'Tildá al menos un producto para comprarle a este proveedor' end using errcode = '22023';
  end if;

  select array_agg(s ->> 'sku') into v_skus from jsonb_array_elements(p_seleccion) s;
  if exists (select 1 from unnest(v_skus) k where not (k = any (v_validos))) then
    raise exception 'Un producto tildado ya se le compró a otro proveedor o no es de esta orden.' using errcode = '22023';
  end if;

  v_arm := private.compras_armar_oc(v_o.items, v_of, p_seleccion, p_modalidad);
  v_adj := private.compras_adjuntos_validos(p_motivo_adjuntos, v_m.id, 12);

  -- ¿La orden misma es la OC, o sale una sub-OC?
  v_conv := v_es_hija
         or (cardinality(private.compras_skus_tomados(v_o.id)) = 0
             and not exists (select 1 from unnest(v_pend) k where not (k = any (v_skus))));

  update public.compras_ofertas
     set estado = 'aceptada',
         decidida_por = (select auth.uid()),
         decidida_por_nombre = private.compras_mi_nombre(),
         decidida_en = now(),
         motivo_descarte = null,
         score_calculado = p_score
   where id = v_of.id;

  if v_conv then
    v_oc := coalesce(v_o.oc_codigo, private.siguiente_numero('OC'));
    update public.compras_ordenes
       set estado = 'oc_creada',
           proveedor_id = v_of.proveedor_id,
           oc_codigo = v_oc,
           oc_creada_por = (select auth.uid()),
           oc_creada_por_nombre = private.compras_mi_nombre(),
           oc_creada_en = now(),
           oc_aprobada_por = null,
           oc_aprobada_por_nombre = null,
           oc_aprobada_en = null,
           -- Lo que se compra, como lo cotizó; lo desmarcado en la SP se conserva.
           items = (v_arm -> 'items')
                   || coalesce((select jsonb_agg(i order by n) from jsonb_array_elements(v_o.items) with ordinality as e(i, n)
                                 where not coalesce((i ->> 'comprar')::boolean, true)), '[]'::jsonb),
           total = (v_arm ->> 'total')::numeric,
           total_divisa = (v_arm ->> 'total_divisa')::numeric,
           modalidad_pago = p_modalidad,
           pago_en_divisa = p_modalidad = 'usd',
           descuento_obtenido = (v_arm ->> 'descuento')::numeric,
           iva = (v_arm ->> 'iva')::numeric,
           igtf = (v_arm ->> 'igtf')::numeric,
           iva_incluido = (v_arm ->> 'iva_incluido')::boolean,
           ajuste = (v_arm ->> 'ajuste')::numeric,
           ajuste_motivo = v_arm ->> 'ajuste_motivo',
           condiciones_pago = v_of.condiciones_pago,
           oferta_detalle = v_of.detalle,
           oferta_precio_efectivo = (v_arm ->> 'precio_efectivo')::numeric,
           oferta_precio_bcv = (v_arm ->> 'precio_bcv')::numeric,
           oferta_motivo = nullif(btrim(coalesce(p_motivo, '')), ''),
           oferta_motivo_adjuntos = nullif(v_adj, '[]'::jsonb),
           historial = historial || private.compras_evento('oc_creada', jsonb_build_object(
             'oc_codigo', v_oc,
             'proveedor_id', v_of.proveedor_id,
             'proveedor', private.compras_texto_proveedor(v_of.proveedor_id),
             'precio', (v_arm ->> 'total')::numeric,
             'score', p_score,
             'modalidad_pago', p_modalidad,
             'total', (v_arm ->> 'total')::numeric))
     where id = v_o.id
    returning * into v_res;

    if not v_es_hija then
      -- Toda la orden quedó con este proveedor: las demás se descartan.
      update public.compras_ofertas
         set estado = 'descartada',
             motivo_descarte = 'Se eligió otra oferta',
             decidida_por = (select auth.uid()),
             decidida_por_nombre = private.compras_mi_nombre(),
             decidida_en = now()
       where orden_id = v_m.id and id <> v_of.id and estado = 'pendiente';
    end if;
  else
    v_res := private.compras_crear_hija(v_o, v_of, v_arm, p_modalidad, p_motivo, v_adj, p_score);
    perform private.compras_reestado_madre(v_o.id, jsonb_build_object(
      'proveedores', jsonb_build_array(private.compras_texto_proveedor(v_of.proveedor_id))));
  end if;

  -- MGG: «Oferta elegida · pago en $ (divisa)|pago en Bs (BCV) · pendiente por aprobación».
  perform private.compras_avisar(v_res, 'OC_CREADA',
    format('Oferta elegida · %s · pendiente por aprobación',
      case p_modalidad when 'usd' then 'pago en $ (divisa)' else 'pago en Bs (BCV)' end),
    array['COMPRAS', 'GERENTE_GENERAL'], '/app/pedidos', 'ATENCION');

  return jsonb_build_object('id', v_res.id, 'codigo', v_res.codigo, 'oc_codigo', v_res.oc_codigo,
                            'sub_oc', not v_conv);
end;
$$;

/*
  «🧩 Asignar por producto (multi-proveedor)» → «Confirmar asignación»
  (MGG `asignarProveedoresAOrden`). Una sub-OC por proveedor.

  p_asignaciones: [{oferta_id, skus: [..], modalidad: 'usd'|'bs'}].
  Los productos que el proveedor agregó en su cotización van con su sub-OC.
*/
create or replace function public.compras_asignar_proveedores(p_orden_id bigint, p_asignaciones jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m      public.compras_ordenes;
  v_a      jsonb;
  v_of     public.compras_ofertas;
  v_pend   text[];
  v_usados text[] := '{}';
  v_skus   text[];
  v_sel    jsonb;
  v_arm    jsonb;
  v_h      public.compras_ordenes;
  v_out    jsonb := '[]'::jsonb;
  v_provs  jsonb := '[]'::jsonb;
  v_mod    text;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'Los proveedores los asigna quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;

  select o.* into v_m from public.compras_ordenes o where o.id = p_orden_id for update;
  if v_m.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_m.parent_orden_id is not null or v_m.estado not in ('aprobada', 'asignada', 'desistida_proveedor') then
    raise exception 'Solo se asignan proveedores sobre una OP aprobada.' using errcode = '55000';
  end if;

  if p_asignaciones is null or jsonb_typeof(p_asignaciones) <> 'array' or jsonb_array_length(p_asignaciones) = 0 then
    raise exception 'Asigná al menos un producto a un proveedor.' using errcode = '22023';
  end if;

  v_pend := private.compras_skus_pendientes(v_m);

  for v_a in select * from jsonb_array_elements(p_asignaciones) loop
    select f.* into v_of from public.compras_ofertas f
     where f.id = nullif(v_a ->> 'oferta_id', '')::bigint and f.orden_id = v_m.id
     for update;
    if v_of.id is null then
      raise exception 'Una oferta de la asignación no es de esta orden.' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.compras_ordenes h
                where h.parent_orden_id = v_m.id and h.proveedor_id = v_of.proveedor_id
                  and h.estado not in ('cancelada', 'anulada', 'desistida_proveedor')) then
      raise exception '% ya tiene una sub-OC en %: anulala o asignale los productos a otro proveedor.',
        (select p.nombre from public.proveedores p where p.id = v_of.proveedor_id), v_m.codigo using errcode = '55000';
    end if;

    select coalesce(array_agg(distinct k), '{}') into v_skus
      from jsonb_array_elements_text(coalesce(v_a -> 'skus', '[]'::jsonb)) k;
    if cardinality(v_skus) = 0 then
      continue;
    end if;
    if exists (select 1 from unnest(v_skus) k where not (k = any (v_pend)) or k = any (v_usados)) then
      raise exception 'Un producto ya está asignado a otro proveedor (o no es de esta orden).' using errcode = '22023';
    end if;
    v_usados := v_usados || v_skus;

    -- Lo que el proveedor agregó en su cotización va con él.
    select coalesce(jsonb_agg(jsonb_build_object('sku', k)), '[]'::jsonb) into v_sel
      from (select unnest(v_skus) as k
            union
            select distinct f ->> 'sku' from jsonb_array_elements(v_of.items) f
             where coalesce((f ->> 'agregado')::boolean, false)
               and not ((f ->> 'sku') = any (private.compras_skus_tomados(v_m.id)))) t;

    v_mod := coalesce(nullif(v_a ->> 'modalidad', ''), 'bs');
    begin
      v_arm := private.compras_armar_oc(v_m.items, v_of, v_sel, v_mod);
    exception when sqlstate '22023' then
      raise exception 'El proveedor no cotizó lo asignado: %', sqlerrm using errcode = '22023';
    end;

    -- Antes de crear la hija, la oferta de ese proveedor pasa a aceptada.
    update public.compras_ofertas
       set estado = 'aceptada',
           decidida_por = (select auth.uid()),
           decidida_por_nombre = private.compras_mi_nombre(),
           decidida_en = now(),
           motivo_descarte = null
     where id = v_of.id;

    v_h := private.compras_crear_hija(v_m, v_of, v_arm, v_mod, null, '[]'::jsonb, null);
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_h.id, 'codigo', v_h.codigo, 'oc_codigo', v_h.oc_codigo));
    v_provs := v_provs || jsonb_build_array(private.compras_texto_proveedor(v_of.proveedor_id));
  end loop;

  if jsonb_array_length(v_out) = 0 then
    raise exception 'Marcá al menos un producto para algún proveedor.' using errcode = '22023';
  end if;

  perform private.compras_reestado_madre(v_m.id, jsonb_build_object('proveedores', v_provs));

  -- MGG: «{n} OC creada(s) por proveedor · pendientes de aprobación».
  perform private.compras_avisar(v_m, 'OC_CREADA',
    format('%s OC creada(s) por proveedor · pendientes de aprobación', jsonb_array_length(v_out)),
    array['COMPRAS', 'GERENTE_GENERAL'], '/app/pedidos', 'ATENCION');

  return v_out;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Corregir la OC antes de la aprobación
-- ═══════════════════════════════════════════════════════════════════════════

/*
  «↩ Re-elegir oferta» (en «Ordenes pendiente por aprobar») y «🔁 Cambiar de
  proveedor (volver a cotizar)» (en «Confirmada (indicar método de pago)»,
  con motivo): MGG `reabrirOcAOfertas`. La OC vuelve a «Pendiente (cargar
  ofertas)», sin proveedor ni condición, con sus ofertas otra vez pendientes.
  El código OC se conserva: al elegir de nuevo, la OC sigue siendo la misma.
*/
create or replace function public.compras_reabrir_oc(p_id bigint, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o      public.compras_ordenes;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_cambio boolean;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'La OC la reabre quien lleva Compras (Compras en total) o un administrador.' using errcode = '42501';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;

  if v_o.estado not in ('oc_creada', 'confirmada_metodo') then
    raise exception 'Solo se reabre una OC pendiente de aprobación del gerente o pendiente de indicar el método de pago'
      using errcode = '55000';
  end if;

  v_cambio := v_o.estado = 'confirmada_metodo';
  if v_cambio then
    if v_motivo is null then
      raise exception 'Escribí el motivo del cambio de proveedor.' using errcode = '22023';
    end if;
    if length(v_motivo) < 5 then
      raise exception 'El motivo es muy corto (mínimo 5 letras).' using errcode = '22023';
    end if;
  end if;

  -- En una sub-OC se reabre solo la oferta de SU proveedor (las demás respaldan
  -- a las otras hijas); en la orden entera, todas.
  if v_o.parent_orden_id is null then
    update public.compras_ofertas
       set estado = 'pendiente', motivo_descarte = null, decidida_por = null, decidida_por_nombre = null, decidida_en = null
     where orden_id = v_o.id and estado in ('aceptada', 'descartada');
  elsif v_o.proveedor_id is not null then
    update public.compras_ofertas
       set estado = 'pendiente', motivo_descarte = null, decidida_por = null, decidida_por_nombre = null, decidida_en = null
     where orden_id = v_o.parent_orden_id and proveedor_id = v_o.proveedor_id and estado in ('aceptada', 'descartada');
  end if;

  update public.compras_ordenes
     set estado = 'aprobada',
         proveedor_id = null,
         condiciones_pago = null,
         oc_creada_por = null,
         oc_creada_por_nombre = null,
         oc_creada_en = null,
         oc_aprobada_por = case when v_cambio then null else oc_aprobada_por end,
         oc_aprobada_por_nombre = case when v_cambio then null else oc_aprobada_por_nombre end,
         oc_aprobada_en = case when v_cambio then null else oc_aprobada_en end,
         numero_administracion = case when v_cambio then null else numero_administracion end,
         historial = historial || private.compras_evento('oc_reabierta',
           case when v_cambio then jsonb_build_object(
                  'proveedorAnteriorId', v_o.proveedor_id,
                  'proveedorAnterior', private.compras_texto_proveedor(v_o.proveedor_id),
                  'motivo', v_motivo,
                  'desde', v_o.estado,
                  'confirmada_por', v_o.oc_aprobada_por_nombre,
                  'confirmada_en', v_o.oc_aprobada_en,
                  'total', v_o.total)
                else jsonb_build_object('motivo', 'Modificación: volver a elegir oferta') end)
   where id = p_id
  returning * into v_o;

  perform private.compras_avisar(v_o, 'OC_REABIERTA',
    case when v_cambio
      then format('OC %s · cambio de proveedor: vuelve a «cargar ofertas» para escoger nueva cotización', coalesce(v_o.oc_codigo, v_o.codigo))
      else format('OC %s reabierta para re-elegir oferta', coalesce(v_o.oc_codigo, v_o.codigo)) end,
    array['COMPRAS']);
end;
$$;

/*
  «⚠ Proveedor desistió» → «Registrar desistimiento» (MGG `desistirProveedor`):
  el proveedor no cumplió. Su oferta queda descartada («Proveedor desistió: …»)
  y las demás vuelven a estar pendientes para elegir otra.
    - La orden entera queda «Proveedor desistió», sin proveedor, abierta para
      elegir otra oferta (conserva su código OC).
    - Una sub-OC muere y sus productos vuelven a la madre para asignarlos.
  MGG muestra el botón en «Ordenes pendiente por aprobar» pero su función solo
  lo acepta en «aprobada»; aquí vale donde está el botón.
*/
create or replace function public.compras_desistir_proveedor(p_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o      public.compras_ordenes;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_madre  bigint;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'El desistimiento lo registra quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;

  if v_motivo is null then
    raise exception 'Debes indicar por qué no cumplió el proveedor' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.estado <> 'oc_creada' or v_o.proveedor_id is null then
    raise exception 'El desistimiento se registra sobre una OC pendiente por aprobar (está en «%»).', v_o.estado
      using errcode = '55000';
  end if;

  v_madre := coalesce(v_o.parent_orden_id, v_o.id);

  -- Las descartadas vuelven a estar pendientes; la de este proveedor se descarta.
  update public.compras_ofertas
     set estado = 'pendiente', motivo_descarte = null, decidida_por = null, decidida_por_nombre = null, decidida_en = null
   where orden_id = v_madre and estado = 'descartada' and proveedor_id <> v_o.proveedor_id;

  update public.compras_ofertas
     set estado = 'descartada',
         motivo_descarte = 'Proveedor desistió: ' || v_motivo,
         decidida_por = (select auth.uid()),
         decidida_por_nombre = private.compras_mi_nombre(),
         decidida_en = now()
   where orden_id = v_madre and proveedor_id = v_o.proveedor_id;

  update public.compras_ordenes
     set estado = 'desistida_proveedor',
         proveedor_id = case when parent_orden_id is null then null else proveedor_id end,
         condiciones_pago = case when parent_orden_id is null then null else condiciones_pago end,
         oc_creada_por = case when parent_orden_id is null then null else oc_creada_por end,
         oc_creada_por_nombre = case when parent_orden_id is null then null else oc_creada_por_nombre end,
         oc_creada_en = case when parent_orden_id is null then null else oc_creada_en end,
         historial = historial || private.compras_evento('desistida_proveedor', jsonb_build_object(
           'motivo', v_motivo,
           'proveedor_id', v_o.proveedor_id,
           'proveedor', private.compras_texto_proveedor(v_o.proveedor_id)))
   where id = p_id
  returning * into v_o;

  if v_o.parent_orden_id is not null then
    perform private.compras_reestado_madre(v_o.parent_orden_id);
  end if;

  -- MGG: «Proveedor desistió en {código} · abierta para reasignar».
  perform private.compras_avisar(v_o, 'OC_DESISTIDA',
    format('Proveedor desistió en %s · abierta para reasignar', coalesce(v_o.oc_codigo, v_o.codigo)),
    array['COMPRAS'], '/app/pedidos', 'ATENCION');
end;
$$;

/*
  «⊘ Anular OC» (MGG `anularOrden` y el disparador `ordenes_anular_solo_gerente`):
  por aprobar, quien lleva Compras; ya aprobada (confirmada, a pagar, por
  recibir sin recibir, o crédito sin abonos), solo quien aprueba OC. No mueve
  inventario ni dinero. Una sub-OC anulada devuelve sus productos a la madre.
*/
create or replace function public.compras_anular_oc(p_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o      public.compras_ordenes;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform private.exigir_usuario_activo();

  if v_motivo is null then
    raise exception 'Escribe el motivo de la anulación.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;

  if v_o.estado = 'oc_creada' then
    if not private.compras_gestiona() then
      raise exception 'La OC por aprobar la anula quien lleva Compras (Compras en total) o un administrador.'
        using errcode = '42501';
    end if;
  elsif v_o.estado in ('confirmada_metodo', 'oc_aprobada')
     or (v_o.estado = 'por_recibir' and v_o.recibida_en is null)
     or (v_o.estado = 'cuenta_abierta' and coalesce(v_o.abonado_total, 0) = 0) then
    if not private.compras_aprueba_oc() then
      raise exception 'Esta OC ya fue aprobada: solo un usuario autorizado para aprobar órdenes de compra puede anularla o cancelarla.'
        using errcode = '42501';
    end if;
  else
    raise exception 'La OC % está en «%»: ya no se anula.', coalesce(v_o.oc_codigo, v_o.codigo), v_o.estado
      using errcode = '55000';
  end if;

  update public.compras_ordenes
     set estado = 'anulada',
         anulada_por = (select auth.uid()),
         anulada_por_nombre = private.compras_mi_nombre(),
         anulada_en = now(),
         motivo_anulacion = v_motivo,
         historial = historial || private.compras_evento('anulada', jsonb_build_object(
           'motivo', v_motivo, 'oc_codigo', v_o.oc_codigo, 'desde', v_o.estado))
   where id = p_id
  returning * into v_o;

  -- La oferta de una sub-OC anulada vuelve a estar disponible en la madre.
  if v_o.parent_orden_id is not null then
    update public.compras_ofertas
       set estado = 'pendiente', motivo_descarte = null, decidida_por = null, decidida_por_nombre = null, decidida_en = null
     where orden_id = v_o.parent_orden_id and proveedor_id = v_o.proveedor_id and estado = 'aceptada';
    perform private.compras_reestado_madre(v_o.parent_orden_id);
  end if;

  -- MGG: «OC anulada: {oc}».
  perform private.compras_avisar(v_o, 'OC_ANULADA', format('OC anulada: %s', coalesce(v_o.oc_codigo, v_o.codigo)),
    array['COMPRAS', 'GERENTE_GENERAL']);
end;
$$;

/*
  «✎ Editar OC (todo)» (en «Ordenes pendiente por aprobar») y «✎ Modificar OC»
  (en «Confirmada (indicar método de pago)»): MGG `actualizarOc`.

  p_datos = {items: [{sku, nombre, cantidad, precio, marca, modelo, finalidad,
  articulo_id?}], proveedor_id, condiciones_pago, notas, descuento, iva, igtf,
  iva_incluido, ajuste, ajuste_motivo, unidad_solicitante, solicitante_nombre,
  motivo, finalidad, urgente}.

  - Por aprobar se corrige todo (los datos de la solicitud, IVA, IGTF, ajuste).
  - Confirmada: un cambio MATERIAL (ítems, cantidades, precios, proveedor,
    condición, descuento) la devuelve a aprobación (`oc_reabierta_edicion`);
    la nota y los nombres se guardan sin reabrir.
  Devuelve {sin_cambios, reabierta}.
*/
create or replace function public.compras_editar_oc(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o        public.compras_ordenes;
  v_todo     boolean;
  v_x        jsonb;
  v_n        integer := 0;
  v_prev     jsonb;
  v_art      public.articulos;
  v_items    jsonb := '[]'::jsonb;
  v_sku      text;
  v_cant     numeric;
  v_prec     numeric;
  v_sub      numeric;
  v_desc     numeric;
  v_iva      numeric;
  v_igtf     numeric;
  v_inc      boolean;
  v_aj       numeric;
  v_ajm      text;
  v_cond     text;
  v_prov     bigint;
  v_tot      numeric;
  v_cambia_p boolean;
  v_material boolean;
  v_texto    boolean;
  v_reabre   boolean;
  v_evento   text;
  v_sol_id   uuid;
  v_sol_nom  text;
  v_unidad   text;
  v_notas    text;
  v_pide     record;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'La OC la edita quien lleva Compras (Compras en total) o un administrador.' using errcode = '42501';
  end if;

  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos de la OC.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.estado not in ('oc_creada', 'confirmada_metodo') then
    raise exception 'Solo se puede editar la OC mientras está por aprobar o pendiente de método de pago.' using errcode = '55000';
  end if;
  v_todo := v_o.estado = 'oc_creada';

  if jsonb_typeof(p_datos -> 'items') is distinct from 'array' or jsonb_array_length(p_datos -> 'items') = 0 then
    raise exception 'La OC debe tener al menos un producto.' using errcode = '22023';
  end if;

  for v_x in select * from jsonb_array_elements(p_datos -> 'items') loop
    v_n := v_n + 1;
    v_sku := nullif(btrim(coalesce(v_x ->> 'sku', '')), '');
    select i into v_prev from jsonb_array_elements(v_o.items) i where i ->> 'sku' = v_sku limit 1;

    if v_prev is null then
      -- Un producto nuevo, del inventario (MGG `AgregarProductoCompra`).
      select a.* into v_art from public.articulos a
       where a.id = nullif(btrim(coalesce(v_x ->> 'articulo_id', '')), '')::bigint and a.activo;
      if v_art.id is null then
        raise exception 'El renglón % no es de esta OC ni del inventario.', v_n using errcode = '22023';
      end if;
      v_sku := v_art.codigo;
      v_prev := jsonb_build_object('sku', v_art.codigo, 'nombre', v_art.nombre, 'unidad', v_art.unidad,
                                   'articulo_id', v_art.id, 'agregado', true, 'comprar', true);
    end if;

    if exists (select 1 from jsonb_array_elements(v_items) y where y ->> 'sku' = v_sku) then
      raise exception '"%" está dos veces en la OC.', v_prev ->> 'nombre' using errcode = '22023';
    end if;

    begin
      v_cant := nullif(btrim(coalesce(v_x ->> 'cantidad', '')), '')::numeric;
      v_prec := round(coalesce(nullif(btrim(coalesce(v_x ->> 'precio', '')), '')::numeric, 0), 4);
    exception when others then
      raise exception '«%»: la cantidad o el precio no se entienden.', v_prev ->> 'nombre' using errcode = '22023';
    end;
    if coalesce(v_cant, 0) <= 0 then
      raise exception 'La cantidad de "%" debe ser mayor que 0.', v_prev ->> 'nombre' using errcode = '22023';
    end if;
    if v_prec < 0 then
      raise exception 'El precio de "%" no puede ser negativo.', v_prev ->> 'nombre' using errcode = '22023';
    end if;

    v_items := v_items || jsonb_build_array(
      v_prev || jsonb_strip_nulls(jsonb_build_object(
        'nombre', coalesce(private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'nombre', '')), '')), v_prev ->> 'nombre'),
        'cantidad', v_cant,
        'precio', v_prec))
      || jsonb_build_object(
        'marca', private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'marca', v_prev ->> 'marca', '')), '')),
        'modelo', private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'modelo', v_prev ->> 'modelo', '')), '')),
        'finalidad', case when v_todo
                          then private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'finalidad', v_prev ->> 'finalidad', '')), ''))
                          else v_prev ->> 'finalidad' end,
        'comprar', true));
  end loop;

  -- Lo desmarcado en la SP se conserva tal cual.
  v_items := v_items || coalesce((select jsonb_agg(i order by n) from jsonb_array_elements(v_o.items) with ordinality as e(i, n)
                                   where not coalesce((i ->> 'comprar')::boolean, true)
                                     and not exists (select 1 from jsonb_array_elements(v_items) y where y ->> 'sku' = i ->> 'sku')),
                                 '[]'::jsonb);
  -- jsonb_strip_nulls de las claves vacías (marca, modelo, finalidad nulos).
  select jsonb_agg(jsonb_strip_nulls(i) order by n) into v_items from jsonb_array_elements(v_items) with ordinality as e(i, n);

  v_sub := private.compras_total_items(v_items);

  begin
    v_desc := case when p_datos ? 'descuento'
                   then nullif(round(greatest(coalesce(nullif(p_datos ->> 'descuento', '')::numeric, 0), 0), 2), 0)
                   else v_o.descuento_obtenido end;
    if v_todo then
      v_iva := case when p_datos ? 'iva' then nullif(round(greatest(coalesce(nullif(p_datos ->> 'iva', '')::numeric, 0), 0), 2), 0) else v_o.iva end;
      v_igtf := case when p_datos ? 'igtf' then nullif(round(greatest(coalesce(nullif(p_datos ->> 'igtf', '')::numeric, 0), 0), 2), 0) else v_o.igtf end;
      v_inc := case when p_datos ? 'iva_incluido' then coalesce((p_datos ->> 'iva_incluido')::boolean, false) else v_o.iva_incluido end;
      v_aj := case when p_datos ? 'ajuste' then nullif(round(coalesce(nullif(p_datos ->> 'ajuste', '')::numeric, 0), 2), 0) else v_o.ajuste end;
      v_ajm := case when p_datos ? 'ajuste_motivo' then nullif(btrim(coalesce(p_datos ->> 'ajuste_motivo', '')), '') else v_o.ajuste_motivo end;
    else
      v_iva := v_o.iva;
      v_igtf := v_o.igtf;
      v_inc := v_o.iva_incluido;
      v_aj := v_o.ajuste;
      v_ajm := v_o.ajuste_motivo;
    end if;
  exception when others then
    raise exception 'Un monto (descuento, IVA, IGTF o ajuste) no se entiende.' using errcode = '22023';
  end;
  v_inc := coalesce(v_inc, false) and v_iva is not null;
  if v_aj is null then
    v_ajm := null;
  end if;

  if coalesce(v_desc, 0) > v_sub then
    raise exception 'El descuento no puede superar el total de la OC.' using errcode = '22023';
  end if;

  v_cond := case when p_datos ? 'condiciones_pago' then nullif(btrim(coalesce(p_datos ->> 'condiciones_pago', '')), '') else v_o.condiciones_pago end;
  if v_cond is not null and v_cond not in ('contado', 'contra_entrega', 'anticipado', 'credito') then
    raise exception 'Esa condición de pago no existe.' using errcode = '22023';
  end if;

  v_prov := coalesce(nullif(p_datos ->> 'proveedor_id', '')::bigint, v_o.proveedor_id);
  if v_prov is distinct from v_o.proveedor_id
     and not exists (select 1 from public.proveedores p where p.id = v_prov and p.activo) then
    raise exception 'Ese proveedor no existe o está inactivo.' using errcode = '23503';
  end if;
  v_cambia_p := v_prov is distinct from v_o.proveedor_id;

  v_notas := case when p_datos ? 'notas' then nullif(btrim(coalesce(p_datos ->> 'notas', '')), '') else v_o.notas end;

  v_tot := private.compras_total_partes(v_sub, v_desc, v_iva, v_igtf, v_inc, v_aj);

  -- ¿Qué cambió? (MGG `hayCambiosMateriales`, `cambiaTexto`).
  v_material := v_cambia_p
    or v_cond is distinct from v_o.condiciones_pago
    or v_desc is distinct from v_o.descuento_obtenido
    or (select coalesce(jsonb_agg(jsonb_build_array(i ->> 'sku', (i ->> 'cantidad')::numeric, (i ->> 'precio')::numeric,
                                                    i ->> 'marca', i ->> 'modelo') order by i ->> 'sku'), '[]'::jsonb)
          from jsonb_array_elements(v_items) i where coalesce((i ->> 'comprar')::boolean, true))
       is distinct from
       (select coalesce(jsonb_agg(jsonb_build_array(i ->> 'sku', (i ->> 'cantidad')::numeric, (i ->> 'precio')::numeric,
                                                    i ->> 'marca', i ->> 'modelo') order by i ->> 'sku'), '[]'::jsonb)
          from jsonb_array_elements(v_o.items) i where coalesce((i ->> 'comprar')::boolean, true))
    or (v_todo and (v_iva is distinct from v_o.iva or v_igtf is distinct from v_o.igtf
                    or v_inc is distinct from v_o.iva_incluido or v_aj is distinct from v_o.ajuste
                    or v_ajm is distinct from v_o.ajuste_motivo));

  v_sol_id := v_o.solicitante_id;
  v_sol_nom := v_o.solicitante_nombre;
  v_unidad := v_o.unidad_solicitante;
  if v_todo then
    if p_datos ? 'solicitante_nombre'
       and private.en_mayuscula(nullif(btrim(coalesce(p_datos ->> 'solicitante_nombre', '')), '')) is distinct from v_o.solicitante_nombre then
      select * into v_pide from private.compras_quien_pide(p_datos ->> 'solicitante_nombre');
      v_sol_id := v_pide.o_id;
      v_sol_nom := v_pide.o_nombre;
    end if;
    if p_datos ? 'unidad_solicitante' then
      v_unidad := private.compras_asegurar_unidad(p_datos ->> 'unidad_solicitante');
    end if;
  end if;

  v_texto := v_items is distinct from v_o.items
    or private.en_mayuscula(v_notas) is distinct from v_o.notas
    or (v_todo and (v_unidad is distinct from v_o.unidad_solicitante
                    or v_sol_nom is distinct from v_o.solicitante_nombre
                    or private.en_mayuscula(nullif(btrim(coalesce(p_datos ->> 'motivo', v_o.motivo, '')), '')) is distinct from v_o.motivo
                    or private.en_mayuscula(nullif(btrim(coalesce(p_datos ->> 'finalidad', v_o.finalidad, '')), '')) is distinct from v_o.finalidad
                    or coalesce((p_datos ->> 'urgente')::boolean, v_o.urgente) is distinct from v_o.urgente));

  if not v_material and not v_texto and abs(v_tot - v_o.total) <= 0.005 then
    return jsonb_build_object('sin_cambios', true, 'reabierta', false);
  end if;

  v_reabre := v_o.estado = 'confirmada_metodo' and (v_cambia_p or v_material);
  v_evento := case when v_reabre then 'oc_reabierta_edicion'
                   when v_material or abs(v_tot - v_o.total) > 0.005 or v_items is distinct from v_o.items then 'oc_editada'
                   else 'nota_editada' end;

  update public.compras_ordenes
     set items = v_items,
         total = v_tot,
         descuento_obtenido = v_desc,
         iva = v_iva,
         igtf = v_igtf,
         iva_incluido = v_inc,
         ajuste = v_aj,
         ajuste_motivo = v_ajm,
         condiciones_pago = v_cond,
         notas = v_notas,
         proveedor_id = v_prov,
         unidad_solicitante = v_unidad,
         solicitante_id = v_sol_id,
         solicitante_nombre = v_sol_nom,
         motivo = case when v_todo then nullif(btrim(coalesce(p_datos ->> 'motivo', v_o.motivo, '')), '') else motivo end,
         finalidad = case when v_todo then nullif(btrim(coalesce(p_datos ->> 'finalidad', v_o.finalidad, '')), '') else finalidad end,
         urgente = case when v_todo then coalesce((p_datos ->> 'urgente')::boolean, urgente) else urgente end,
         estado = case when v_reabre then 'oc_creada' else estado end,
         oc_aprobada_por = case when v_reabre then null else oc_aprobada_por end,
         oc_aprobada_por_nombre = case when v_reabre then null else oc_aprobada_por_nombre end,
         oc_aprobada_en = case when v_reabre then null else oc_aprobada_en end,
         historial = historial || private.compras_evento(v_evento,
           case when v_cambia_p then jsonb_build_object(
                  'proveedorAnteriorId', v_o.proveedor_id,
                  'proveedorNuevoId', v_prov,
                  'proveedorAnterior', private.compras_texto_proveedor(v_o.proveedor_id),
                  'proveedorNuevo', private.compras_texto_proveedor(v_prov),
                  'vuelve_a', 'oc_creada',
                  'confirmada_por', case when v_reabre then v_o.oc_aprobada_por_nombre end,
                  'confirmada_en', case when v_reabre then v_o.oc_aprobada_en end,
                  'total', v_tot)
                else jsonb_build_object('total', v_tot) end)
   where id = p_id
  returning * into v_o;

  if v_reabre then
    perform private.compras_avisar(v_o, 'OC_REABIERTA_EDICION',
      format('OC %s modificada · vuelve a aprobación', coalesce(v_o.oc_codigo, v_o.codigo)),
      array['COMPRAS', 'GERENTE_GENERAL'], '/app/pedidos', 'ATENCION');
  end if;

  return jsonb_build_object('sin_cambios', false, 'reabierta', v_reabre);
end;
$$;

/*
  «🔄 Cambiar a Pago en Bs (BCV)» / «🔄 Cambiar a Pago en $ (Divisa)» (MGG
  `cambiarModalidadPagoOc`): reprecia los renglones al precio efectivo ('usd')
  o al BCV ('bs') y rehace el total con sus impuestos.
*/
create or replace function public.compras_cambiar_modalidad_pago(p_id bigint, p_modalidad text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o     public.compras_ordenes;
  v_items jsonb;
  v_falta text;
  v_tot   numeric;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'La modalidad de pago la cambia quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;
  if p_modalidad not in ('usd', 'bs') then
    raise exception 'La modalidad es «usd» o «bs».' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.estado not in ('oc_creada', 'confirmada_metodo') then
    raise exception 'La modalidad de pago se cambia con la OC por aprobar o pendiente de método de pago.' using errcode = '55000';
  end if;
  if v_o.modalidad_pago is not distinct from p_modalidad then
    return;
  end if;

  if p_modalidad = 'usd' then
    select i ->> 'nombre' into v_falta from jsonb_array_elements(v_o.items) i
     where coalesce((i ->> 'comprar')::boolean, true) and coalesce((i ->> 'precio_usd')::numeric, 0) <= 0
     limit 1;
    if v_falta is not null then
      raise exception 'Esta OC no tiene precio en USD para «%»: no se puede pasar a Pago en $ (Divisa).', v_falta
        using errcode = '22023';
    end if;
  end if;

  select jsonb_agg(case when not coalesce((i ->> 'comprar')::boolean, true) then i
                        when p_modalidad = 'usd' then i || jsonb_build_object('precio', (i ->> 'precio_usd')::numeric)
                        else i || jsonb_build_object('precio', coalesce(nullif((i ->> 'precio_bcv')::numeric, 0), (i ->> 'precio_usd')::numeric, (i ->> 'precio')::numeric))
                   end order by n)
    into v_items
    from jsonb_array_elements(v_o.items) with ordinality as e(i, n);

  v_tot := private.compras_total_partes(private.compras_total_items(v_items), v_o.descuento_obtenido, v_o.iva,
             v_o.igtf, v_o.iva_incluido, v_o.ajuste);

  update public.compras_ordenes
     set items = v_items,
         total = v_tot,
         modalidad_pago = p_modalidad,
         pago_en_divisa = p_modalidad = 'usd',
         historial = historial || private.compras_evento('modalidad_pago_cambiada', jsonb_build_object(
           'de', v_o.modalidad_pago, 'a', p_modalidad, 'total', v_tot))
   where id = p_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. «✎ Cantidades», ahora con las ofertas (MGG `actualizarCantidadesOrden`)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Lo de la fase 1, más:
    - Las cotizaciones PENDIENTES de la orden se reescalan: la misma cantidad
      nueva y los mismos precios unitarios, sin los productos eliminados; si se
      eliminó alguno, el IVA, el IGTF y el descuento bajan en la misma
      proporción («su presupuesto baja y el IVA/IGTF se ajusta a lo que queda»).
    - En una OC por aprobar el total conserva sus impuestos (MGG lo dejaba en
      la suma de los renglones y el total dejaba de cuadrar con sus partes).
*/
create or replace function public.compras_editar_cantidades(
  p_id bigint,
  p_cantidades jsonb,
  p_eliminar text[] default '{}'
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o      public.compras_ordenes;
  v_items  jsonb;
  v_malo   text;
  v_quedan integer;
  v_of     public.compras_ofertas;
  v_oit    jsonb;
  v_prev   record;
  v_nuevo  record;
  v_ratio  numeric;
  v_elim   boolean := coalesce(array_length(p_eliminar, 1), 0) > 0;
begin
  perform private.exigir_usuario_activo();

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;

  if v_o.estado not in ('pendiente', 'aprobada', 'oc_creada') then
    raise exception 'Las cantidades solo se editan antes de aprobar la OC (pendiente, aprobada u OC creada).' using errcode = '55000';
  end if;

  if not (private.compras_gestiona() or v_o.creado_por = (select auth.uid())) then
    raise exception 'Solo quien cargó la solicitud o Compras pueden editar las cantidades.' using errcode = '42501';
  end if;

  if p_cantidades is null or jsonb_typeof(p_cantidades) <> 'object' then
    raise exception 'Las cantidades van como {sku: cantidad}.' using errcode = '22023';
  end if;

  select i ->> 'nombre' into v_malo
    from jsonb_array_elements(v_o.items) i
   where not (i ->> 'sku' = any (coalesce(p_eliminar, '{}')))
     and p_cantidades ? (i ->> 'sku')
     and coalesce(nullif(p_cantidades ->> (i ->> 'sku'), '')::numeric, 0) <= 0
   limit 1;
  if v_malo is not null then
    raise exception 'La cantidad de "%" debe ser mayor que 0.', v_malo using errcode = '22023';
  end if;

  select jsonb_agg(case when p_cantidades ? (i ->> 'sku')
                        then i || jsonb_build_object('cantidad', round((p_cantidades ->> (i ->> 'sku'))::numeric, 3))
                        else i end order by n)
    into v_items
    from jsonb_array_elements(v_o.items) with ordinality as e(i, n)
   where not (i ->> 'sku' = any (coalesce(p_eliminar, '{}')));

  select count(*) into v_quedan from jsonb_array_elements(coalesce(v_items, '[]'::jsonb));
  if v_quedan = 0 then
    raise exception 'La orden debe conservar al menos un producto: no se pueden eliminar todos.' using errcode = '22023';
  end if;

  update public.compras_ordenes
     set items = v_items,
         total = case when estado = 'oc_creada'
                      then private.compras_total_partes(private.compras_total_items(v_items), descuento_obtenido,
                             iva, igtf, iva_incluido, ajuste)
                      else private.compras_total_items(v_items) end,
         historial = historial || case
           when v_elim then private.compras_evento('items_eliminados', jsonb_build_object('skus', to_jsonb(p_eliminar)))
           else private.compras_evento('cantidades_editadas') end
   where id = p_id;

  -- Las cotizaciones pendientes de esta orden, con las cantidades nuevas.
  for v_of in select f.* from public.compras_ofertas f where f.orden_id = p_id and f.estado = 'pendiente' for update loop
    select coalesce(jsonb_agg(case when p_cantidades ? (i ->> 'sku')
                                   then i || jsonb_build_object('cantidad', round((p_cantidades ->> (i ->> 'sku'))::numeric, 3))
                                   else i end order by n), '[]'::jsonb)
      into v_oit
      from jsonb_array_elements(v_of.items) with ordinality as e(i, n)
     where not (i ->> 'sku' = any (coalesce(p_eliminar, '{}')));

    select * into v_prev from private.compras_oferta_totales(v_of.items);
    select * into v_nuevo from private.compras_oferta_totales(v_oit);
    v_ratio := case when coalesce(v_prev.o_bcv, 0) > 0 then least(1, v_nuevo.o_bcv / v_prev.o_bcv)
                    when coalesce(v_prev.o_usd, 0) > 0 then least(1, v_nuevo.o_usd / v_prev.o_usd)
                    else 1 end;

    update public.compras_ofertas
       set items = v_oit,
           precio_total = case when v_nuevo.o_bcv > 0 then v_nuevo.o_bcv else v_nuevo.o_usd end,
           precio_efectivo = case when v_nuevo.o_bcv > 0 and v_nuevo.o_usd > 0 then v_nuevo.o_usd end,
           iva = case when v_elim then nullif(round(coalesce(iva, 0) * v_ratio, 2), 0) else iva end,
           igtf = case when v_elim then nullif(round(coalesce(igtf, 0) * v_ratio, 2), 0) else igtf end,
           descuento = case when v_elim then nullif(round(coalesce(descuento, 0) * v_ratio, 2), 0) else descuento end,
           iva_incluido = case when v_elim and nullif(round(coalesce(iva, 0) * v_ratio, 2), 0) is null then false else iva_incluido end
     where id = v_of.id;
  end loop;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. El chat interno (MGG `ocChat.repository.ts`)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.compras_enviar_mensaje(p_orden_id bigint, p_texto text)
returns public.compras_mensajes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_texto text := btrim(coalesce(p_texto, ''));
  v_m     public.compras_mensajes;
begin
  perform private.exigir_usuario_activo();

  if v_texto = '' then
    raise exception 'El mensaje no puede estar vacío.' using errcode = '22023';
  end if;
  if length(v_texto) > 2000 then
    raise exception 'El mensaje va en 2000 letras como mucho.' using errcode = '22023';
  end if;
  if not private.compras_puede_ver_orden(p_orden_id) then
    raise exception 'No puede escribir en el chat de esa orden.' using errcode = '42501';
  end if;

  insert into public.compras_mensajes (orden_id, texto, autor, autor_nombre, leido_por)
  values (p_orden_id, v_texto, (select auth.uid()), private.compras_mi_nombre(), array[(select auth.uid())])
  returning * into v_m;

  return v_m;
end;
$$;

-- Al abrir el chat se marcan leídos los mensajes de esa orden.
create or replace function public.compras_marcar_mensajes_leidos(p_orden_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();

  if not private.compras_puede_ver_orden(p_orden_id) then
    return;
  end if;

  update public.compras_mensajes
     set leido_por = leido_por || (select auth.uid())
   where orden_id = p_orden_id
     and not ((select auth.uid()) = any (leido_por));
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Los adjuntos de las cotizaciones: un depósito privado
-- ═══════════════════════════════════════════════════════════════════════════

-- Rutas `{orden_madre_id}/{proveedor}-{nonce}-{archivo}` (MGG `ofertas-pdf`).
-- Los ve Compras; los sube y los borra quien lleva Compras (Compras en total,
-- que es `compras_gestiona`: la política pregunta directo a `tiene_permiso`,
-- que quien pide el archivo sí puede ejecutar). PDF o imagen, 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compras-ofertas', 'compras-ofertas', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists compras_ofertas_archivos_lectura on storage.objects;
drop policy if exists compras_ofertas_archivos_subida on storage.objects;
drop policy if exists compras_ofertas_archivos_borrado on storage.objects;

create policy compras_ofertas_archivos_lectura on storage.objects
  for select to authenticated
  using (bucket_id = 'compras-ofertas' and private.tiene_permiso('COMPRAS', 'LECTURA'));

create policy compras_ofertas_archivos_subida on storage.objects
  for insert to authenticated
  with check (bucket_id = 'compras-ofertas'
              and private.compras_orden_de_ruta(name) is not null
              and private.tiene_permiso('COMPRAS', 'TOTAL'));

create policy compras_ofertas_archivos_borrado on storage.objects
  for delete to authenticated
  using (bucket_id = 'compras-ofertas' and private.tiene_permiso('COMPRAS', 'TOTAL'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. Auditoría y tiempo real
-- ═══════════════════════════════════════════════════════════════════════════

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    return;
  end if;
  insert into public.auditoria_modulos (tabla, modulo) values
    ('compras_ofertas', 'COMPRAS')
  on conflict (tabla) do update set modulo = excluded.modulo;
end
$mapa$;

do $vivo$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['compras_ofertas', 'compras_mensajes'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$vivo$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. Permisos de las funciones
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  f text;
begin
  foreach f in array array[
    'private.compras_aprueba_oc()',
    'private.compras_total_partes(numeric, numeric, numeric, numeric, boolean, numeric)',
    'private.compras_oferta_totales(jsonb)',
    'private.compras_texto_proveedor(bigint)',
    'private.compras_skus_tomados(bigint, bigint)',
    'private.compras_skus_pendientes(public.compras_ordenes)',
    'private.compras_armar_oc(jsonb, public.compras_ofertas, jsonb, text)',
    'private.compras_reestado_madre(bigint, jsonb)',
    'private.compras_adjuntos_validos(jsonb, bigint, integer)',
    'private.compras_normalizar_items_oferta(jsonb, public.compras_ordenes)',
    'private.compras_resincronizar_oferta(public.compras_ofertas)',
    'private.compras_crear_hija(public.compras_ordenes, public.compras_ofertas, jsonb, text, text, jsonb, numeric)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.compras_mis_permisos_de_pedidos()',
    'public.compras_estadisticas_proveedores()',
    'public.compras_guardar_oferta(bigint, bigint, bigint, jsonb, jsonb, text)',
    'public.compras_eliminar_oferta(bigint)',
    'public.compras_aceptar_oferta(bigint, bigint, jsonb, text, text, jsonb, numeric)',
    'public.compras_asignar_proveedores(bigint, jsonb)',
    'public.compras_reabrir_oc(bigint, text)',
    'public.compras_desistir_proveedor(bigint, text)',
    'public.compras_anular_oc(bigint, text)',
    'public.compras_editar_oc(bigint, jsonb)',
    'public.compras_cambiar_modalidad_pago(bigint, text)',
    'public.compras_editar_cantidades(bigint, jsonb, text[])',
    'public.compras_enviar_mensaje(bigint, text)',
    'public.compras_marcar_mensajes_leidos(bigint)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. Comprobación
-- ═══════════════════════════════════════════════════════════════════════════

do $ver$
declare
  t text;
begin
  foreach t in array array['public.compras_ofertas', 'public.compras_mensajes'] loop
    if has_table_privilege('authenticated', t, 'INSERT')
       or has_table_privilege('authenticated', t, 'UPDATE')
       or has_table_privilege('authenticated', t, 'DELETE') then
      raise exception '% no puede escribirse directo: todo pasa por las funciones.', t;
    end if;
  end loop;
  if private.compras_total_partes(100, 10, 14.4, 2.7, false, -0.1) <> 107.00 then
    raise exception 'La fórmula del total no da lo de MGG.';
  end if;
  if private.compras_total_partes(100, 0, 13.79, 0, true, 0) <> 100.00 then
    raise exception 'Con el IVA adentro de los precios, el IVA no se suma.';
  end if;
end
$ver$;
