/*
  COMPRAS COMO MGG · FASES 0 Y 1
  LA SOLICITUD DE PEDIDO Y SU REVISIÓN EN EL ALMACÉN GENERAL, SOBRE UNA SOLA TABLA

  Angélica, 07/11/2026: el módulo de compras se reemplaza por una copia exacta
  del de MGG («Pedidos / Compras»): la misma estructura, las mismas pestañas,
  columnas, tarjetas, botones y textos, dibujados con los componentes de La
  Cantera. Esta migración pone el modelo de datos (fase 0) y lo que necesita la
  fase 1: crear, editar, cancelar y aprobar la Solicitud de Pedido, y la
  revisión del almacén.

  POR QUÉ UNA SOLA TABLA (`compras_ordenes`)

  En MGG una fila es a la vez la Solicitud de Pedido (SP) y, después, su orden
  de compra: la OC se distingue por `oc_codigo`, y cuando una SP se reparte
  entre varios proveedores cada parte es una fila hija (`parent_orden_id`). Se
  copia tal cual para que las fases 2 a 4 (cotizar, aprobar la OC, pagar,
  recibir) no tengan que rehacer el modelo: las columnas que esas fases van a
  llenar ya están aquí, vacías.

  LO QUE CAMBIA RESPECTO A MGG (decisiones de la dueña, 07/11/2026)

  1. UN SOLO ALMACÉN REVISA: todo llega a ALM-GEN
     (`private.almacen_que_revisa_pedidos()`). Las dos sedes de MGG (Los Pinos
     y Matanza) se reducen a una, así que no hay «Traslados por hacer» ni RPC
     de traslado. La forma de los datos se conserva —`almacen_sedes`,
     `almacen_origenes`, `revision_sedes` con la clave 'ALM-GEN'— para que las
     pantallas y los PDF lean lo mismo que en MGG.

  2. LO QUE EL ALMACÉN TIENE SALE POR UNA SOLICITUD DE SALIDA. En MGG la sede
     entrega sin movimiento de kardex; aquí toda salida necesita autorización,
     así que la revisión llama a `public.pedir_salida` como ya lo hacía
     `revisar_pedido_en_almacen` (20261107020000): la recibe «ALMACÉN GENERAL
     (INVENTARIO)» a nombre de quien pidió. Por eso el almacenista dice, por
     renglón, QUÉ ARTÍCULO del inventario entrega (un renglón de MGG puede ser
     «nombre general», sin ficha). Si esa salida se rechaza o se cancela, lo
     «entregado» vuelve a Compras (disparador del punto 6).

  3. QUIÉN HACE QUÉ, EN LA BASE Y NO SOLO EN LA PANTALLA. En MGG las reglas
     viven en el navegador y la tabla se escribe directo. Aquí nada se escribe
     directo: todo pasa por funciones SECURITY DEFINER que preguntan el permiso.
       - Crear una SP: cualquier usuario activo. Quien no puede pedir por otro
         (`private.puede_pedir_por_otro()`) pide a su nombre.
       - «canManageProcurement» de MGG (admin o analista): COMPRAS en TOTAL
         (el administrador pasa siempre).
       - Revisar en almacén: INVENTARIO o SALIDAS en escritura (MGG:
         `puede_modulo('inventario'|'salidas','escritura')`).
       - Aprobar OC (fase 3): `private.es_aprobador_de_compras()`.

  4. SIEMPRE EN DÓLARES, como el disparador `ordenes_siempre_usd` de MGG: cada
     renglón llevará su precio BCV (`precio`) y el efectivo (`precio_usd`), y la
     orden su `modalidad_pago` ('usd' | 'bs'). En la fase 1 no hay precios.

  5. SIN TESORERÍA NI DELIVERY: no hay caja, cuenta por pagar ni flota. Las
     retenciones se cargarán al indicar el método de pago (fase 3); aquí solo
     queda su sitio: `comprobante_tipo` y `retenciones` jsonb.

  6. LOS ACTORES: MGG guarda correos; aquí el uuid del perfil y, al lado, el
     nombre tal como era ese día (`*_por_nombre`, y `actor_nombre` en cada
     evento del historial). Un nombre que cambia mañana no reescribe quién
     aprobó ayer.

  LO QUE NO SE TOCA: las tablas del flujo anterior (solicitudes_pedido,
  cotizaciones, ordenes_compra…) siguen corriendo en paralelo hasta la fase 4.
  La compra directa sigue siendo la de La Cantera.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. La tabla
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.compras_ordenes (
  id                    bigint generated always as identity primary key,

  -- ── Identidad y solicitud ────────────────────────────────────────────────
  -- SP-AAAA-NNNN; la sub-OC de una SP repartida, SP-AAAA-NNNN-n (fase 2).
  codigo                text not null unique,
  parent_orden_id       bigint references public.compras_ordenes(id) on delete set null,
  -- 'servicio' llega en la fase 5 (Servicios / Servicio directo).
  clase                 text not null default 'producto' check (clase in ('producto', 'servicio')),
  estado                text not null default 'revision_almacen',
  proveedor_id          bigint references public.proveedores(id) on delete restrict,

  -- Quién la cargó (MGG: `solicitante_email` + `solicitante_persona`).
  creado_por            uuid not null references public.perfiles(id),
  creado_por_nombre     text,
  -- Quién la pide (MGG: `ci_solicitante`). El uuid solo si es un usuario.
  solicitante_id        uuid references public.perfiles(id),
  solicitante_nombre    text,
  -- La unidad o el departamento que pide (MGG: `solicitante`).
  unidad_solicitante    text,

  items                 jsonb not null default '[]'::jsonb,
  total                 numeric(14, 2) not null default 0,
  moneda                text not null default 'USD',
  notas                 text,
  motivo                text,
  finalidad             text,
  clasificacion         text[] not null default '{}',
  urgente               boolean not null default false,
  -- Hasta cuatro fotos de referencia: [{path, filename}] en `compras-pedidos`.
  imagenes              jsonb not null default '[]'::jsonb,
  -- Dónde se necesita (MGG: `sede_destino`). Siempre ALM-GEN.
  almacen_destino_id    bigint references public.almacenes(id),
  historial             jsonb not null default '[]'::jsonb,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz,

  -- ── Revisión del almacén ────────────────────────────────────────────────
  revisada_almacen_por        uuid references public.perfiles(id),
  revisada_almacen_por_nombre text,
  revisada_almacen_en         timestamptz,
  nota_almacen                text,
  -- {'ALM-GEN': {confirmada_por, confirmada_por_nombre, confirmada_en, nota}}
  revision_sedes              jsonb,
  -- La solicitud de salida (SS-…) con la que el almacén entrega lo que tenía.
  salida_almacen_numero       text,

  -- ── Hitos ───────────────────────────────────────────────────────────────
  aprobada_por          uuid references public.perfiles(id),
  aprobada_por_nombre   text,
  aprobada_en           timestamptz,
  rechazada_por         uuid references public.perfiles(id),
  rechazada_por_nombre  text,
  rechazada_en          timestamptz,
  motivo_rechazo        text,
  cancelada_por         uuid references public.perfiles(id),
  cancelada_por_nombre  text,
  cancelada_en          timestamptz,
  motivo_cancelacion    text,
  anulada_por           uuid references public.perfiles(id),
  anulada_por_nombre    text,
  anulada_en            timestamptz,
  motivo_anulacion      text,

  -- ── La OC (fases 2 y 3) ─────────────────────────────────────────────────
  oc_codigo             text,
  oc_creada_por         uuid references public.perfiles(id),
  oc_creada_por_nombre  text,
  oc_creada_en          timestamptz,
  oc_aprobada_por       uuid references public.perfiles(id),
  oc_aprobada_por_nombre text,
  oc_aprobada_en        timestamptz,
  condiciones_pago      text check (condiciones_pago in ('contado', 'contra_entrega', 'anticipado', 'credito')),

  -- La oferta elegida.
  oferta_detalle        jsonb,
  oferta_precio_efectivo numeric(14, 2),
  oferta_precio_bcv     numeric(14, 2),
  oferta_motivo         text,
  oferta_motivo_adjuntos jsonb,

  -- Montos (fórmula única de `impuestosOc.ts` de MGG).
  descuento_obtenido    numeric(14, 2),
  iva                   numeric(14, 2),
  igtf                  numeric(14, 2),
  iva_incluido          boolean not null default false,
  ajuste                numeric(14, 2),
  ajuste_motivo         text,
  modalidad_pago        text check (modalidad_pago in ('usd', 'bs')),
  pago_en_divisa        boolean,
  total_divisa          numeric(14, 2),

  -- ── El pago (fase 3; sin Tesorería: se marca dentro de Compras) ─────────
  -- [{metodo, moneda, monto, datos?}]
  metodo_pago           jsonb,
  metodo_pago_por       uuid references public.perfiles(id),
  metodo_pago_por_nombre text,
  metodo_pago_en        timestamptz,
  descuento_pago        numeric(14, 2),
  pago_qr_path          text,
  pago_qr_nombre        text,
  numero_administracion text,
  comprobante_tipo      text check (comprobante_tipo in ('factura', 'nota_entrega')),
  -- [{tipo: IVA|ISLR|IGTF|ISAE, modo: 'pct'|'monto', valor, monto}]
  retenciones           jsonb not null default '[]'::jsonb,
  pagada_por            uuid references public.perfiles(id),
  pagada_por_nombre     text,
  pagada_en             timestamptz,
  -- Crédito (cuenta abierta) y anticipo de servicios.
  abonado_total         numeric(14, 2) not null default 0,
  anticipo_monto        numeric(14, 2),
  anticipo_en           timestamptz,

  -- ── Recepción y cierre (fase 4) ─────────────────────────────────────────
  recibida_por          uuid references public.perfiles(id),
  recibida_por_nombre   text,
  recibida_en           timestamptz,
  recibido_total        numeric(14, 2),
  nota_recepcion        text,
  sin_inventario        boolean not null default false,
  recepcion_fotos       jsonb,
  factura_path          text,
  factura_nombre        text,
  finalizada_por        uuid references public.perfiles(id),
  finalizada_por_nombre text,
  finalizada_en         timestamptz,

  -- Los estados de MGG (sin los dos de legado que ningún botón usa:
  -- `oc_emitida` y `reasignada`; `rechazada` tampoco la usa nadie).
  constraint compras_ordenes_estado_check check (estado in (
    'revision_almacen', 'atendida_almacen', 'pendiente', 'aprobada', 'asignada',
    'oc_creada', 'confirmada_metodo', 'cuenta_abierta', 'oc_aprobada', 'por_recibir',
    'pagada', 'recibida', 'finalizada', 'cancelada', 'anulada', 'desistida_proveedor')),
  -- Como el disparador `ordenes_siempre_usd` de MGG: si el proveedor da el
  -- precio en Bs, se pasa a $ con la tasa del día.
  constraint compras_ordenes_moneda_check check (moneda = 'USD'),
  constraint compras_ordenes_items_lista check (jsonb_typeof(items) = 'array'),
  constraint compras_ordenes_historial_lista check (jsonb_typeof(historial) = 'array'),
  constraint compras_ordenes_retenciones_lista check (jsonb_typeof(retenciones) = 'array'),
  constraint compras_ordenes_imagenes_cuatro check (
    jsonb_typeof(imagenes) = 'array' and jsonb_array_length(imagenes) <= 4)
);

comment on table public.compras_ordenes is
  'Pedidos / Compras como en MGG: una fila es la Solicitud de Pedido y, después, su orden de compra (oc_codigo). Las sub-OC por proveedor son filas hijas (parent_orden_id). Solo se escribe por funciones.';
comment on column public.compras_ordenes.items is
  'Renglones como en MGG: {sku, nombre, cantidad, precio, precio_usd?, articulo_id?, unidad, comprar, finalidad?, general?, marca?, modelo?, cantidad_solicitada?, cantidad_almacen?, almacen_revisado?, almacen_sedes?, almacen_origenes?, almacen_articulo_id?, …}.';
comment on column public.compras_ordenes.historial is
  'Trazabilidad: [{at, evento, actor (uuid), actor_nombre, …}] con los nombres de evento de MGG (creada, editada, aprobada, cancelada, revisada_almacen, …).';

create unique index if not exists compras_ordenes_oc_codigo_key
  on public.compras_ordenes (oc_codigo) where oc_codigo is not null;
create index if not exists compras_ordenes_estado_idx on public.compras_ordenes (estado);
create index if not exists compras_ordenes_proveedor_idx on public.compras_ordenes (proveedor_id);
create index if not exists compras_ordenes_parent_idx on public.compras_ordenes (parent_orden_id);
create index if not exists compras_ordenes_creado_por_idx on public.compras_ordenes (creado_por);
create index if not exists compras_ordenes_solicitante_idx on public.compras_ordenes (solicitante_id);
create index if not exists compras_ordenes_salida_idx
  on public.compras_ordenes (salida_almacen_numero) where salida_almacen_numero is not null;

-- La hora de la última escritura, sin depender de que cada función se acuerde.
create or replace function private.compras_ordenes_tocada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_tocada on public.compras_ordenes;
create trigger trg_tocada
  before update on public.compras_ordenes
  for each row execute function private.compras_ordenes_tocada();

-- Los textos del negocio en mayúscula y sin tildes, como el resto de la casa.
drop trigger if exists trg_normalizar on public.compras_ordenes;
create trigger trg_normalizar
  before insert or update on public.compras_ordenes
  for each row execute function private.normalizar_texto(
    'unidad_solicitante', 'solicitante_nombre', 'notas', 'motivo', 'finalidad',
    'nota_almacen', 'motivo_cancelacion', 'motivo_rechazo', 'motivo_anulacion');

drop trigger if exists trg_auditar on public.compras_ordenes;
create trigger trg_auditar
  after insert or update or delete on public.compras_ordenes
  for each row execute function private.auditar('id');

-- Lectura: quien lleva compras ve todo; cada quien ve las suyas (las cargó o
-- las pide); el almacén ve las que revisa o ya revisó. Escritura: ninguna
-- directa.
alter table public.compras_ordenes enable row level security;

drop policy if exists compras_ordenes_lectura on public.compras_ordenes;
create policy compras_ordenes_lectura on public.compras_ordenes
  for select to authenticated
  using (
    private.tiene_permiso('COMPRAS', 'LECTURA')
    or creado_por = (select auth.uid())
    or solicitante_id = (select auth.uid())
    or ((estado = 'revision_almacen' or revisada_almacen_en is not null)
        and private.tiene_permiso('INVENTARIO', 'LECTURA'))
  );

revoke all on public.compras_ordenes from anon, public, authenticated;
grant select on public.compras_ordenes to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. El catálogo de unidades solicitantes (MGG: `catalogos_pedido`,
--    scope 'unidad_solicitante')
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.compras_unidades_solicitantes (
  id         bigint generated always as identity primary key,
  nombre     text not null unique,
  activo     boolean not null default true,
  creado_por uuid references public.perfiles(id) default auth.uid(),
  creado_en  timestamptz not null default now()
);

comment on table public.compras_unidades_solicitantes is
  'Las unidades o departamentos que piden (Categorías → Unidad solicitante en MGG). Se agregan al vuelo desde la Solicitud de Pedido.';

alter table public.compras_unidades_solicitantes enable row level security;

drop policy if exists compras_unidades_lectura on public.compras_unidades_solicitantes;
create policy compras_unidades_lectura on public.compras_unidades_solicitantes
  for select to authenticated using (true);

revoke all on public.compras_unidades_solicitantes from anon, public, authenticated;
grant select on public.compras_unidades_solicitantes to authenticated;

drop trigger if exists trg_auditar on public.compras_unidades_solicitantes;
create trigger trg_auditar
  after insert or update or delete on public.compras_unidades_solicitantes
  for each row execute function private.auditar('id');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Ayudantes
-- ═══════════════════════════════════════════════════════════════════════════

-- «canManageProcurement» de MGG (admin o analista): aprobar la OP, cotizar,
-- elegir la oferta, recibir y finalizar. Aquí, COMPRAS en total.
create or replace function private.compras_gestiona()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.tiene_permiso('COMPRAS', 'TOTAL');
$$;

-- Quién responde la revisión de almacén (MGG: inventario o salidas en escritura).
create or replace function private.compras_revisa_almacen()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.tiene_permiso('INVENTARIO', 'ESCRITURA')
      or private.tiene_permiso('SALIDAS', 'ESCRITURA');
$$;

create or replace function private.compras_mi_nombre()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.nombre from public.perfiles p where p.id = (select auth.uid());
$$;

/*
  Un evento del historial, listo para concatenar: `historial || compras_evento(…)`.
  Siempre con quién y cuándo; lo demás (motivo, detalle…) lo pone quien llama.
*/
create or replace function private.compras_evento(p_evento text, p_extra jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_array(
    jsonb_strip_nulls(
      jsonb_build_object(
        'at', now(),
        'evento', p_evento,
        'actor', (select auth.uid()),
        'actor_nombre', private.compras_mi_nombre())
      || coalesce(p_extra, '{}'::jsonb)));
$$;

-- El subtotal de lo que se compra: Σ cantidad × precio de los renglones con
-- `comprar` distinto de falso (MGG: `totalesOc.subtotalItems`).
create or replace function private.compras_total_items(p_items jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select coalesce(round(sum(coalesce((i ->> 'cantidad')::numeric, 0) * coalesce((i ->> 'precio')::numeric, 0)), 2), 0)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
   where coalesce((i ->> 'comprar')::boolean, true);
$$;

/*
  LOS RENGLONES QUE MANDA LA PANTALLA, LIMPIOS.

  En MGG el navegador escribe el jsonb tal cual. Aquí se rehace renglón por
  renglón y solo con las claves conocidas: si no, cualquiera podría mandar un
  renglón con `cantidad_almacen` o un precio ya puesto y saltarse la revisión.

  - Con `articulo_id`: el SKU es el código del artículo (no el que diga la
    pantalla) y la unidad, la suya si no viene otra.
  - Sin `articulo_id`: es un renglón de «nombre general» (MGG `general:true`),
    con SKU GEN-….
  - Lo que el almacén o Compras ya escribieron en ese renglón (por SKU) se
    conserva: editar la SP no borra la revisión ni los precios.
  - `p_con_inventario` falso: quien no es de Compras pide con nombres
    generales (regla de MGG del 30-10-2026). Solo se le admiten artículos del
    inventario que ya estaban en la SP.
*/
create or replace function private.compras_normalizar_items(
  p_items jsonb,
  p_previos jsonb,
  p_con_inventario boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_x       jsonb;
  v_n       integer := 0;
  v_out     jsonb := '[]'::jsonb;
  v_art     public.articulos;
  v_art_id  bigint;
  v_nombre  text;
  v_cant    numeric;
  v_sku     text;
  v_unidad  text;
  v_previo  jsonb;
  v_nuevo   jsonb;
  v_base    text := upper(to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint));
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Añade al menos un producto' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 200 then
    raise exception 'Una solicitud lleva hasta 200 renglones.' using errcode = '22023';
  end if;

  for v_x in select * from jsonb_array_elements(p_items) loop
    v_n := v_n + 1;

    if jsonb_typeof(v_x) <> 'object' then
      raise exception 'El renglón % no se entiende.', v_n using errcode = '22023';
    end if;

    v_nombre := private.en_mayuscula(btrim(coalesce(v_x ->> 'nombre', '')));
    if v_nombre = '' then
      raise exception 'El renglón % no dice qué se pide.', v_n using errcode = '22023';
    end if;

    begin
      v_cant := nullif(btrim(coalesce(v_x ->> 'cantidad', '')), '')::numeric;
    exception when others then
      v_cant := null;
    end;

    v_art_id := nullif(btrim(coalesce(v_x ->> 'articulo_id', '')), '')::bigint;
    v_unidad := private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'unidad', '')), ''));

    if v_art_id is not null then
      select a.* into v_art from public.articulos a where a.id = v_art_id and a.activo;
      if v_art.id is null then
        raise exception '"%": ese artículo no existe en el inventario o está inactivo.', v_nombre
          using errcode = '23503';
      end if;

      if not coalesce(p_con_inventario, false)
         and not exists (select 1 from jsonb_array_elements(coalesce(p_previos, '[]'::jsonb)) p
                          where (p ->> 'articulo_id')::bigint = v_art_id) then
        raise exception 'La solicitud va con nombres generales: el analista de Compras pone el nombre de inventario al cotizar.'
          using errcode = '42501';
      end if;

      v_sku := v_art.codigo;
      v_unidad := coalesce(v_unidad, v_art.unidad);
    else
      v_sku := nullif(btrim(coalesce(v_x ->> 'sku', '')), '');
      if v_sku is null or v_sku not like 'GEN-%' then
        v_sku := format('GEN-%s-%s', v_base, v_n - 1);
      end if;
    end if;

    if exists (select 1 from jsonb_array_elements(v_out) o where o ->> 'sku' = v_sku) then
      raise exception '"%" ya está en la solicitud: cambiá su cantidad en la lista.', v_nombre
        using errcode = '22023';
    end if;

    select p into v_previo
      from jsonb_array_elements(coalesce(p_previos, '[]'::jsonb)) p
     where p ->> 'sku' = v_sku
     limit 1;

    -- Cero solo vale en el renglón que el almacén ya entregó entero: queda en
    -- la SP (con lo pedido y lo que dio el almacén) aunque no se compre nada.
    if v_cant is null or v_cant < 0
       or (v_cant = 0 and coalesce((v_previo ->> 'cantidad_almacen')::numeric, 0) <= 0) then
      raise exception 'La cantidad de "%" debe ser mayor que 0.', v_nombre using errcode = '22023';
    end if;

    v_nuevo := jsonb_strip_nulls(jsonb_build_object(
      'sku', v_sku,
      'nombre', v_nombre,
      'cantidad', v_cant,
      'precio', coalesce((v_previo ->> 'precio')::numeric, 0),
      'precio_usd', (v_previo ->> 'precio_usd')::numeric,
      'articulo_id', v_art_id,
      'unidad', coalesce(v_unidad, 'UND'),
      'comprar', coalesce((v_x ->> 'comprar')::boolean, true),
      'finalidad', private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'finalidad', '')), '')),
      'general', case when v_art_id is null then true end,
      'marca', private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'marca', '')), '')),
      'modelo', private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'modelo', '')), ''))));

    -- Lo que escribió el almacén en ese renglón, intacto.
    if v_previo is not null then
      v_nuevo := v_nuevo || jsonb_strip_nulls(jsonb_build_object(
        'cantidad_solicitada', v_previo -> 'cantidad_solicitada',
        'cantidad_almacen', v_previo -> 'cantidad_almacen',
        'almacen_revisado', v_previo -> 'almacen_revisado',
        'almacen_sedes', v_previo -> 'almacen_sedes',
        'almacen_origenes', v_previo -> 'almacen_origenes',
        'almacen_articulo_id', v_previo -> 'almacen_articulo_id',
        'almacen_sin_salida', v_previo -> 'almacen_sin_salida'));
    end if;

    v_out := v_out || jsonb_build_array(v_nuevo);
  end loop;

  if not exists (select 1 from jsonb_array_elements(v_out) o where coalesce((o ->> 'comprar')::boolean, true)) then
    raise exception 'Marcá al menos un artículo a comprar' using errcode = '22023';
  end if;

  return v_out;
end;
$$;

/*
  Quién pide. MGG lo deja libre («Persona que solicita», precargado con quien
  carga). Aquí, quien no puede pedir por otro solo pide a su nombre; quien sí,
  escribe el nombre, y si coincide con un usuario activo la SP le queda a él
  también (la ve en sus solicitudes).
*/
create or replace function private.compras_quien_pide(p_nombre text, out o_id uuid, out o_nombre text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_yo     uuid := (select auth.uid());
  v_mio    text := private.compras_mi_nombre();
  v_nombre text := private.en_mayuscula(nullif(btrim(coalesce(p_nombre, '')), ''));
begin
  if v_nombre is null or v_nombre = private.en_mayuscula(btrim(coalesce(v_mio, ''))) then
    o_id := v_yo;
    o_nombre := coalesce(v_nombre, private.en_mayuscula(v_mio));
    return;
  end if;

  if not private.puede_pedir_por_otro() then
    raise exception 'Solo puede hacer solicitudes a su nombre.' using errcode = '42501';
  end if;

  o_nombre := v_nombre;
  select p.id into o_id
    from public.perfiles p
   where p.activo and private.en_mayuscula(btrim(p.nombre)) = v_nombre
   limit 2;
  -- Dos usuarios con el mismo nombre: no se adivina cuál.
  if (select count(*) from public.perfiles p
       where p.activo and private.en_mayuscula(btrim(p.nombre)) = v_nombre) <> 1 then
    o_id := null;
  end if;
end;
$$;

-- La unidad solicitante escrita queda en el catálogo (MGG: `ensureUnidadSolicitante`).
create or replace function private.compras_asegurar_unidad(p_nombre text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := private.en_mayuscula(nullif(btrim(coalesce(p_nombre, '')), ''));
begin
  if v_nombre is null then
    return null;
  end if;

  if length(v_nombre) > 60 then
    raise exception 'La unidad solicitante va en 60 letras como mucho.' using errcode = '22023';
  end if;

  insert into public.compras_unidades_solicitantes (nombre) values (v_nombre)
  on conflict (nombre) do nothing;

  return v_nombre;
end;
$$;

-- El aviso de cada paso, en la campana de quien le toca.
create or replace function private.compras_avisar(
  p_orden public.compras_ordenes,
  p_tipo text,
  p_titulo text,
  p_roles text[],
  p_ruta text default '/app/pedidos',
  p_importancia text default 'INFO'
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notificar(
    'COMPRAS', p_tipo, p_titulo,
    concat_ws(' · ', p_orden.unidad_solicitante, p_orden.solicitante_nombre, nullif(left(coalesce(p_orden.notas, ''), 140), '')),
    p_ruta || '?detalle=' || p_orden.id,
    p_roles,
    case when p_orden.urgente then 'URGENTE' else p_importancia end);
end;
$$;

-- ¿Puede ver esta orden? La misma regla que la política de lectura, para las
-- fotos del depósito, que se piden por la ruta y no por la fila.
create or replace function private.compras_puede_ver_orden(p_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.compras_ordenes o
     where o.id = p_id
       and (private.tiene_permiso('COMPRAS', 'LECTURA')
            or o.creado_por = (select auth.uid())
            or o.solicitante_id = (select auth.uid())
            or ((o.estado = 'revision_almacen' or o.revisada_almacen_en is not null)
                and private.tiene_permiso('INVENTARIO', 'LECTURA'))));
$$;

-- ¿Puede tocar las fotos? Quien puede editar la SP, mientras se puede editar.
create or replace function private.compras_puede_editar_orden(p_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.compras_ordenes o
     where o.id = p_id
       and o.estado in ('revision_almacen', 'pendiente', 'aprobada')
       and o.oc_codigo is null
       and (private.compras_gestiona()
            or o.creado_por = (select auth.uid())
            or o.solicitante_id = (select auth.uid())));
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Lo que la pantalla pregunta antes de dibujar
-- ═══════════════════════════════════════════════════════════════════════════

-- Los permisos de MGG traducidos, para decidir qué botones se dibujan. La base
-- vuelve a preguntar en cada función: esto es cortesía, no seguridad.
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
    -- MGG `canManageProcurement` (y `esAnalistaCompras`, que pide del inventario).
    'gestiona', private.compras_gestiona(),
    -- MGG `puedeAprobarOc` (fase 3).
    'aprueba_oc', private.es_aprobador_de_compras(),
    'revisa_almacen', private.compras_revisa_almacen(),
    'pide_por_otro', private.puede_pedir_por_otro(),
    'yo', (select auth.uid()),
    'mi_nombre', private.compras_mi_nombre());
end;
$$;

-- El código que tendrá la próxima SP, solo para enseñarlo en el formulario. No
-- lo reserva: el de verdad lo da `siguiente_numero` al crear, sin carreras.
create or replace function public.compras_proximo_codigo()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_anio smallint := extract(year from (now() at time zone 'America/Caracas'))::smallint;
  v_n    integer;
begin
  perform private.exigir_usuario_activo();

  select c.ultimo + 1 into v_n from public.correlativos c where c.prefijo = 'SP' and c.anio = v_anio;
  return format('SP-%s-%s', v_anio, lpad(coalesce(v_n, 1)::text, 4, '0'));
end;
$$;

-- «+ Añadir» una unidad solicitante nueva desde el formulario.
create or replace function public.compras_agregar_unidad_solicitante(p_nombre text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();

  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Escribí el nombre de la unidad' using errcode = '22023';
  end if;

  return private.compras_asegurar_unidad(p_nombre);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. La Solicitud de Pedido: crear, editar, cancelar, aprobar
-- ═══════════════════════════════════════════════════════════════════════════

/*
  CREAR (MGG `crearOrden`). La SP de productos nace «En revisión de almacén»
  (en MGG, con el interruptor prendido; aquí siempre: el almacén general revisa
  todo pedido antes de Compras, Angélica 06/11/2026). El número sale de
  `siguiente_numero('SP')`, que reserva con un upsert: dos personas creando a la
  vez no se llevan el mismo, que en MGG («máximo + 1» en el navegador) sí pasaba.
*/
create or replace function public.compras_crear_solicitud(
  p_items jsonb,
  p_notas text,
  p_unidad_solicitante text default null,
  p_solicitante_nombre text default null,
  p_urgente boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alm    bigint;
  v_items  jsonb;
  v_pide   record;
  v_unidad text;
  v_o      public.compras_ordenes;
begin
  perform private.exigir_usuario_activo();

  v_items := private.compras_normalizar_items(p_items, '[]'::jsonb, private.compras_gestiona());

  if nullif(btrim(coalesce(p_notas, '')), '') is null then
    raise exception 'Escribe la nota del analista: qué se pide y para quién. Se lee al aprobar y al pagar.'
      using errcode = '22023';
  end if;

  v_alm := private.almacen_que_revisa_pedidos();
  if v_alm is null then
    raise exception 'No está el almacén general (ALM-GEN), o está apagado.' using errcode = '23503';
  end if;

  select * into v_pide from private.compras_quien_pide(p_solicitante_nombre);
  v_unidad := private.compras_asegurar_unidad(p_unidad_solicitante);

  insert into public.compras_ordenes
    (codigo, clase, estado, creado_por, creado_por_nombre, solicitante_id, solicitante_nombre,
     unidad_solicitante, items, total, notas, urgente, almacen_destino_id, historial)
  values
    (private.siguiente_numero('SP'), 'producto', 'revision_almacen',
     (select auth.uid()), private.compras_mi_nombre(), v_pide.o_id, v_pide.o_nombre,
     v_unidad, v_items, private.compras_total_items(v_items), btrim(p_notas),
     coalesce(p_urgente, false), v_alm,
     private.compras_evento('creada',
       jsonb_build_object('detalle', case when coalesce(p_urgente, false) then 'ORDEN URGENTE' end)))
  returning * into v_o;

  -- MGG: «{código}[ · URGENTE] enviada a Almacén para revisión».
  perform private.compras_avisar(v_o, 'PEDIDO_REVISION_ALMACEN',
    format('%s%s enviada a Almacén para revisión', v_o.codigo, case when v_o.urgente then ' · URGENTE' else '' end),
    array['ALMACEN'], '/app/solicitudes-pedido', 'ATENCION');

  return jsonb_build_object('id', v_o.id, 'codigo', v_o.codigo, 'estado', v_o.estado);
end;
$$;

/*
  EDITAR (MGG `actualizarOrden`): en «En revisión de almacén», «Pendiente» o
  «Aprobada», sin OC creada, y solo quien la cargó o quien lleva compras. La
  revisión del almacén que ya estaba en cada renglón se conserva.
*/
create or replace function public.compras_editar_solicitud(
  p_id bigint,
  p_items jsonb,
  p_notas text,
  p_unidad_solicitante text default null,
  p_solicitante_nombre text default null,
  p_urgente boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o      public.compras_ordenes;
  v_items  jsonb;
  v_pide   record;
  v_unidad text;
begin
  perform private.exigir_usuario_activo();

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;

  if v_o.estado not in ('revision_almacen', 'pendiente', 'aprobada') or v_o.oc_codigo is not null then
    raise exception 'La orden % ya no se edita aquí (está en «%»).', v_o.codigo, v_o.estado using errcode = '55000';
  end if;

  if not (private.compras_gestiona() or v_o.creado_por = (select auth.uid())) then
    raise exception 'Solo quien cargó la solicitud o Compras pueden editarla.' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_notas, '')), '') is null then
    raise exception 'Escribe la nota del analista: qué se pide y para quién. Se lee al aprobar y al pagar.'
      using errcode = '22023';
  end if;

  v_items := private.compras_normalizar_items(p_items, v_o.items, private.compras_gestiona());
  select * into v_pide from private.compras_quien_pide(p_solicitante_nombre);
  v_unidad := private.compras_asegurar_unidad(p_unidad_solicitante);

  update public.compras_ordenes
     set items = v_items,
         total = private.compras_total_items(v_items),
         notas = btrim(p_notas),
         unidad_solicitante = v_unidad,
         solicitante_id = v_pide.o_id,
         solicitante_nombre = v_pide.o_nombre,
         urgente = coalesce(p_urgente, false),
         historial = historial || private.compras_evento('editada')
   where id = p_id
  returning * into v_o;

  -- MGG: «Orden {código} editada[ · URGENTE]».
  perform private.compras_avisar(v_o, 'PEDIDO_EDITADO',
    format('Orden %s editada%s', v_o.codigo, case when v_o.urgente then ' · URGENTE' else '' end),
    case when v_o.estado = 'revision_almacen' then array['ALMACEN', 'COMPRAS'] else array['COMPRAS'] end);

  return jsonb_build_object('id', v_o.id, 'codigo', v_o.codigo, 'estado', v_o.estado);
end;
$$;

/*
  CANCELAR (MGG `cancelarOrden`): desde «Pendiente», «Aprobada» o «En revisión
  de almacén», con motivo. MGG ofrece el botón a quien vea el detalle; aquí la
  base lo deja a quien la cargó o la pide y a quien lleva compras.

  Lo que el almacén ya mandó por solicitud de salida no se deshace desde aquí:
  esa salida se aprueba o se rechaza en Salidas.
*/
create or replace function public.compras_cancelar_orden(p_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.compras_ordenes;
begin
  perform private.exigir_usuario_activo();

  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribe el motivo de la cancelación.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;

  if v_o.estado not in ('pendiente', 'aprobada', 'revision_almacen') then
    raise exception 'La orden % está en «%»: ya no se cancela.', v_o.codigo, v_o.estado using errcode = '55000';
  end if;

  if not (private.tiene_permiso('COMPRAS', 'ESCRITURA')
          or v_o.creado_por = (select auth.uid())
          or v_o.solicitante_id = (select auth.uid())) then
    raise exception 'Solo quien cargó o pidió la solicitud, o Compras, pueden cancelarla.' using errcode = '42501';
  end if;

  update public.compras_ordenes
     set estado = 'cancelada',
         cancelada_por = (select auth.uid()),
         cancelada_por_nombre = private.compras_mi_nombre(),
         cancelada_en = now(),
         motivo_cancelacion = btrim(p_motivo),
         historial = historial || private.compras_evento('cancelada', jsonb_build_object('motivo', btrim(p_motivo)))
   where id = p_id
  returning * into v_o;

  -- MGG: «Orden cancelada: {código}».
  perform private.compras_avisar(v_o, 'PEDIDO_CANCELADO', format('Orden cancelada: %s', v_o.codigo),
    array['COMPRAS', 'ALMACEN']);
end;
$$;

-- APROBAR LA ORDEN DE PEDIDO (MGG `aprobarOrden`): «Pendiente» → «Aprobada»,
-- quien lleva compras. Desde aquí entra a la pestaña Órdenes de Compra.
create or replace function public.compras_aprobar_orden(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.compras_ordenes;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'La Orden de Pedido la aprueba quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;

  if v_o.estado <> 'pendiente' then
    raise exception 'La orden % está en «%»: solo se aprueba una orden pendiente.', v_o.codigo, v_o.estado
      using errcode = '55000';
  end if;

  update public.compras_ordenes
     set estado = 'aprobada',
         aprobada_por = (select auth.uid()),
         aprobada_por_nombre = private.compras_mi_nombre(),
         aprobada_en = now(),
         historial = historial || private.compras_evento('aprobada')
   where id = p_id
  returning * into v_o;

  -- MGG: «Orden aprobada: {código}».
  perform private.compras_avisar(v_o, 'PEDIDO_APROBADO', format('Orden aprobada: %s', v_o.codigo), array['COMPRAS']);
end;
$$;

-- Marcar qué renglones se compran (MGG `actualizarComprarItems`): antes de que
-- haya precio, quien lleva compras, fuera de los estados del almacén.
create or replace function public.compras_marcar_comprar(p_id bigint, p_sku text, p_comprar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o     public.compras_ordenes;
  v_items jsonb;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'Qué se compra lo decide quien lleva Compras.' using errcode = '42501';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;

  if v_o.estado not in ('pendiente', 'aprobada') or v_o.total > 0 then
    raise exception 'En «%» ya no se cambia qué se compra.', v_o.estado using errcode = '55000';
  end if;

  if not exists (select 1 from jsonb_array_elements(v_o.items) i where i ->> 'sku' = p_sku) then
    raise exception 'Ese renglón no es de esta orden.' using errcode = '22023';
  end if;

  select jsonb_agg(case when i ->> 'sku' = p_sku then i || jsonb_build_object('comprar', coalesce(p_comprar, true)) else i end
                   order by n)
    into v_items
    from jsonb_array_elements(v_o.items) with ordinality as e(i, n);

  if not exists (select 1 from jsonb_array_elements(v_items) i where coalesce((i ->> 'comprar')::boolean, true)) then
    raise exception 'Marcá al menos un artículo a comprar' using errcode = '22023';
  end if;

  update public.compras_ordenes
     set items = v_items,
         total = private.compras_total_items(v_items),
         historial = historial || private.compras_evento('items_actualizados',
           jsonb_build_object('sku', p_sku, 'comprar', coalesce(p_comprar, true)))
   where id = p_id;
end;
$$;

/*
  «✎ Cantidades» (MGG `actualizarCantidadesOrden`): corregir cuántas unidades
  o sacar productos en «Pendiente», «Aprobada» u «OC creada», quien lleva
  compras o quien la cargó. En la fase 2, cuando haya ofertas, también tendrá
  que reescalar las pendientes como hace MGG.
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
begin
  perform private.exigir_usuario_activo();

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;

  if v_o.estado not in ('pendiente', 'aprobada', 'oc_creada') then
    raise exception 'En «%» ya no se editan las cantidades.', v_o.estado using errcode = '55000';
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
                        then i || jsonb_build_object('cantidad', (p_cantidades ->> (i ->> 'sku'))::numeric)
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
         total = private.compras_total_items(v_items),
         historial = historial || case
           when coalesce(array_length(p_eliminar, 1), 0) > 0
             then private.compras_evento('items_eliminados', jsonb_build_object('skus', to_jsonb(p_eliminar)))
           else private.compras_evento('cantidades_editadas') end
   where id = p_id;
end;
$$;

-- Las fotos de referencia (máximo 4). Se suben al depósito y aquí se anota la
-- lista final: cada ruta tiene que ser de la carpeta de esta orden.
create or replace function public.compras_guardar_imagenes(p_id bigint, p_imagenes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();

  if not private.compras_puede_editar_orden(p_id) then
    raise exception 'Las imágenes las cambia quien puede editar la solicitud, mientras se puede editar.'
      using errcode = '42501';
  end if;

  if p_imagenes is null or jsonb_typeof(p_imagenes) <> 'array' then
    raise exception 'Las imágenes van en una lista.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_imagenes) > 4 then
    raise exception 'Máximo 4 imágenes.' using errcode = '22023';
  end if;

  if exists (select 1 from jsonb_array_elements(p_imagenes) a
              where coalesce(a ->> 'path', '') not like p_id::text || '/%'
                 or nullif(btrim(coalesce(a ->> 'filename', '')), '') is null) then
    raise exception 'Una imagen no es de esta orden.' using errcode = '22023';
  end if;

  update public.compras_ordenes
     set imagenes = (select coalesce(jsonb_agg(jsonb_build_object('path', a ->> 'path', 'filename', a ->> 'filename')), '[]'::jsonb)
                       from jsonb_array_elements(p_imagenes) a)
   where id = p_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. La revisión del almacén (MGG `almacen_revisar_solicitud`, una sola sede)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  p_items: [{sku, disponible, revisado, articulo_id}, …]

  MARCAR (p_confirmar falso): guarda las marcas que llegan —solo los renglones
  tocados, como el autoguardado de MGG— en `items[].almacen_sedes['ALM-GEN']`.
  No cambia el estado.

  CONFIRMAR (p_confirmar cierto): exige todo revisado, pide la salida de lo que
  el almacén tiene y reparte como MGG: cada renglón queda con
  `cantidad_solicitada` (lo pedido), `cantidad_almacen` (lo que da el almacén)
  y `cantidad` = lo que falta, con `comprar` = falta > 0. Si falta algo, la SP
  pasa a «Pendiente» (Compras); si no, queda «Atendida por almacén».

  Los errores son los de MGG, con «Almacén General» donde decía la sede.
*/
create or replace function public.compras_revisar_en_almacen(
  p_id bigint,
  p_items jsonb default '[]'::jsonb,
  p_confirmar boolean default false,
  p_nota text default null
) returns public.compras_ordenes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o        public.compras_ordenes;
  v_alm      bigint;
  v_lista    jsonb := coalesce(p_items, '[]'::jsonb);
  v_x        jsonb;
  v_it       jsonb;
  v_items    jsonb;
  v_art      bigint;
  v_disp     numeric;
  v_sol      numeric;
  v_falta    numeric;
  v_y        record;
  v_nombre   text;
  v_hay      numeric;
  v_entregas jsonb;
  v_ss       text;
  v_quien    text;
  v_total    integer;
  v_faltan   integer;
  v_tiene    integer;
  v_estado   text;
  v_detalle  text;
  v_nota     text := nullif(btrim(coalesce(p_nota, '')), '');
  v_marca    jsonb;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_revisa_almacen() then
    raise exception 'Sin permiso para revisar solicitudes de pedido en almacén.' using errcode = '42501';
  end if;

  v_alm := private.almacen_que_revisa_pedidos();
  if v_alm is null then
    raise exception 'No está el almacén general (ALM-GEN), o está apagado.' using errcode = '23503';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Solicitud de pedido no encontrada.' using errcode = 'P0002';
  end if;

  if v_o.estado <> 'revision_almacen' then
    raise exception 'La solicitud % ya no está en revisión de almacén (estado: %).', v_o.codigo, v_o.estado
      using errcode = '55000';
  end if;

  if jsonb_typeof(v_lista) <> 'array' then
    raise exception 'Las marcas de la revisión van en una lista.' using errcode = '22023';
  end if;

  if (select count(*) from jsonb_array_elements(v_lista))
     <> (select count(distinct x ->> 'sku') from jsonb_array_elements(v_lista) x) then
    raise exception 'Un renglón viene dos veces en la revisión.' using errcode = '22023';
  end if;

  -- Paso 1: las marcas que llegan.
  for v_x in select * from jsonb_array_elements(v_lista) loop
    select i into v_it
      from jsonb_array_elements(v_o.items) i
     where i ->> 'sku' = v_x ->> 'sku' and coalesce((i ->> 'comprar')::boolean, true)
     limit 1;

    if v_it is null then
      raise exception 'Ese renglón no es de esta solicitud.' using errcode = '22023';
    end if;

    begin
      v_disp := coalesce(nullif(btrim(coalesce(v_x ->> 'disponible', '')), '')::numeric, 0);
    exception when others then
      raise exception '«%»: la cantidad no se entiende.', v_it ->> 'nombre' using errcode = '22023';
    end;

    v_sol := coalesce((v_it ->> 'cantidad_solicitada')::numeric, (v_it ->> 'cantidad')::numeric, 0);
    v_disp := least(greatest(v_disp, 0), v_sol);

    v_art := coalesce(nullif(btrim(coalesce(v_x ->> 'articulo_id', '')), '')::bigint,
                      (v_it ->> 'articulo_id')::bigint);
    if v_art is not null and not exists (select 1 from public.articulos a where a.id = v_art and a.activo) then
      raise exception '«%»: ese artículo no existe en el inventario o está inactivo.', v_it ->> 'nombre'
        using errcode = '23503';
    end if;

    v_marca := jsonb_strip_nulls(jsonb_build_object(
      'disponible', v_disp,
      'revisado', coalesce((v_x ->> 'revisado')::boolean, true),
      'articulo_id', v_art,
      'por', (select auth.uid()),
      'por_nombre', private.compras_mi_nombre(),
      'en', now()));

    select jsonb_agg(case when i ->> 'sku' = v_x ->> 'sku'
                          then i || jsonb_build_object('almacen_sedes',
                                 coalesce(i -> 'almacen_sedes', '{}'::jsonb) || jsonb_build_object('ALM-GEN', v_marca))
                          else i end order by n)
      into v_items
      from jsonb_array_elements(v_o.items) with ordinality as e(i, n);

    v_o.items := v_items;
  end loop;

  if not coalesce(p_confirmar, false) then
    update public.compras_ordenes set items = v_o.items where id = p_id returning * into v_o;
    return v_o;
  end if;

  -- Paso 2: confirmar. Todo revisado y, lo que se entrega, con su artículo.
  select count(*),
         count(*) filter (where not coalesce((i -> 'almacen_sedes' -> 'ALM-GEN' ->> 'revisado')::boolean, false))
    into v_total, v_faltan
    from jsonb_array_elements(v_o.items) i
   where coalesce((i ->> 'comprar')::boolean, true);

  if v_total = 0 then
    raise exception 'La solicitud % no tiene renglones para revisar.', v_o.codigo using errcode = '22023';
  end if;

  if v_faltan > 0 then
    raise exception 'Falta revisar % renglón(es) de % en %.', v_faltan, v_o.codigo, 'Almacén General'
      using errcode = '22023';
  end if;

  select i ->> 'nombre' into v_nombre
    from jsonb_array_elements(v_o.items) i
   where coalesce((i ->> 'comprar')::boolean, true)
     and coalesce((i -> 'almacen_sedes' -> 'ALM-GEN' ->> 'disponible')::numeric, 0) > 0
     and (i -> 'almacen_sedes' -> 'ALM-GEN' ->> 'articulo_id') is null
   limit 1;
  if v_nombre is not null then
    raise exception '«%»: diga qué artículo del almacén entrega.', v_nombre using errcode = '22023';
  end if;

  -- Lo que se entrega, junto por artículo, y que lo haya. La entrega de la
  -- salida lo vuelve a comprobar: esto es para no prometer lo que no hay.
  for v_y in
    select (i -> 'almacen_sedes' -> 'ALM-GEN' ->> 'articulo_id')::bigint as articulo_id,
           sum((i -> 'almacen_sedes' -> 'ALM-GEN' ->> 'disponible')::numeric) as cantidad
      from jsonb_array_elements(v_o.items) i
     where coalesce((i ->> 'comprar')::boolean, true)
       and coalesce((i -> 'almacen_sedes' -> 'ALM-GEN' ->> 'disponible')::numeric, 0) > 0
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
    from (select (i -> 'almacen_sedes' -> 'ALM-GEN' ->> 'articulo_id')::bigint as articulo_id,
                 sum((i -> 'almacen_sedes' -> 'ALM-GEN' ->> 'disponible')::numeric) as cantidad
            from jsonb_array_elements(v_o.items) i
           where coalesce((i ->> 'comprar')::boolean, true)
             and coalesce((i -> 'almacen_sedes' -> 'ALM-GEN' ->> 'disponible')::numeric, 0) > 0
           group by 1) t;

  -- La salida de siempre, con su autorización: el almacén no se salta Salidas.
  -- La recibe el almacén (inventario), a nombre de quien pidió.
  if v_entregas is not null then
    v_quien := coalesce(
      nullif(btrim(coalesce(v_o.solicitante_nombre, '')), ''),
      (select p.nombre from public.perfiles p where p.id = v_o.solicitante_id),
      v_o.creado_por_nombre,
      'ALMACÉN GENERAL');

    -- El «para qué» va sin texto libre a propósito: `pedir_salida` rechaza un
    -- motivo que nombre una venta, y la nota o la unidad («VENTAS») de la SP
    -- tumbarían la revisión entera por una palabra.
    v_ss := public.pedir_salida(
      p_almacen_id  => v_alm,
      p_renglones   => v_entregas,
      p_motivo      => format('Solicitud de pedido %s (revisión del almacén general)', v_o.codigo),
      p_externo     => 'ALMACÉN GENERAL (INVENTARIO)',
      p_responsable => v_quien);
  end if;

  -- Paso 3: el reparto. Cada renglón pedido queda con lo que da el almacén y lo
  -- que falta; los que venían desmarcados en la SP no se tocan.
  select jsonb_agg(
           case when not coalesce((i ->> 'comprar')::boolean, true) then i
           else i || jsonb_build_object(
                  'cantidad_solicitada', s.sol,
                  'cantidad_almacen', s.disp,
                  'almacen_origenes', case when s.disp > 0 then jsonb_build_object('ALM-GEN', s.disp) else '{}'::jsonb end,
                  'almacen_revisado', true,
                  'cantidad', s.sol - s.disp,
                  'comprar', (s.sol - s.disp) > 0)
                || case when s.disp > 0
                        then jsonb_build_object('almacen_articulo_id', (i -> 'almacen_sedes' -> 'ALM-GEN' ->> 'articulo_id')::bigint)
                        else '{}'::jsonb end
           end order by n)
    into v_items
    from jsonb_array_elements(v_o.items) with ordinality as e(i, n)
    cross join lateral (
      select coalesce((i ->> 'cantidad_solicitada')::numeric, (i ->> 'cantidad')::numeric, 0) as sol,
             least(greatest(case when coalesce((i -> 'almacen_sedes' -> 'ALM-GEN' ->> 'revisado')::boolean, false)
                                 then coalesce((i -> 'almacen_sedes' -> 'ALM-GEN' ->> 'disponible')::numeric, 0)
                                 else 0 end, 0),
                   coalesce((i ->> 'cantidad_solicitada')::numeric, (i ->> 'cantidad')::numeric, 0)) as disp
    ) s;

  select count(*) filter (where coalesce((i ->> 'cantidad_almacen')::numeric, 0) > 0),
         count(*) filter (where coalesce((i ->> 'comprar')::boolean, true))
    into v_tiene, v_faltan
    from jsonb_array_elements(v_items) i
   where (i ->> 'cantidad_solicitada') is not null;

  v_estado := case when v_faltan > 0 then 'pendiente' else 'atendida_almacen' end;

  v_detalle := concat_ws(' · ',
    case when v_faltan > 0 then 'Revisión completa: pasa a Compras con lo que falta'
         else 'Revisión completa: almacén tiene todo, no pasa a Compras' end,
    case when v_tiene > 0 then format('entrega Almacén General %s renglón(es)', v_tiene) end,
    case when v_ss is not null then format('salida %s', v_ss) end);

  update public.compras_ordenes
     set items = v_items,
         total = private.compras_total_items(v_items),
         estado = v_estado,
         revisada_almacen_por = (select auth.uid()),
         revisada_almacen_por_nombre = private.compras_mi_nombre(),
         revisada_almacen_en = now(),
         nota_almacen = v_nota,
         salida_almacen_numero = v_ss,
         revision_sedes = jsonb_build_object('ALM-GEN', jsonb_strip_nulls(jsonb_build_object(
           'confirmada_por', (select auth.uid()),
           'confirmada_por_nombre', private.compras_mi_nombre(),
           'confirmada_en', now(),
           'nota', v_nota))),
         historial = historial || private.compras_evento('revisada_almacen', jsonb_build_object(
           'sede', 'ALM-GEN', 'detalle', v_detalle, 'salida', v_ss))
   where id = p_id
  returning * into v_o;

  if v_estado = 'pendiente' then
    -- MGG avisa al crear «Nueva orden de pedido … enviada para aprobación»: aquí
    -- es ahora cuando llega a Compras para aprobarla.
    perform private.compras_avisar(v_o, 'PEDIDO_PENDIENTE',
      format('Nueva orden de pedido %s%s enviada para aprobación', v_o.codigo, case when v_o.urgente then ' · URGENTE' else '' end),
      array['COMPRAS'], '/app/pedidos', 'ATENCION');
  else
    perform private.compras_avisar(v_o, 'PEDIDO_ATENDIDO_ALMACEN',
      format('%s: los almacenes tienen todo, no pasa a Compras', v_o.codigo),
      array['COMPRAS']);
  end if;

  return v_o;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Si la salida no se aprueba, lo «entregado» vuelve a Compras
--
-- Lo mismo que `la_salida_rechazada_vuelve_a_compras` (20261106210000) hace con
-- el flujo anterior. La revisión decide en el momento, pero el material sale
-- cuando la solicitud de salida se aprueba y se entrega. Si se RECHAZA o se
-- CANCELA, lo que el almacén iba a dar no llegó:
--   - «Atendida por almacén» → vuelve a «Pendiente» con eso a comprar.
--   - «Pendiente» o «Aprobada» → lo entregado vuelve a sumarse a lo que se
--     compra (todavía no hay OC; en la fase 2 habrá que reescalar las ofertas
--     pendientes, como hace «✎ Cantidades»).
--   - Más adelante → no se mueve nada: queda en el historial y Compras recibe
--     el aviso para pedirlo aparte.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.compras_salida_rechazada_vuelve()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o       public.compras_ordenes;
  v_items   jsonb;
  v_detalle text;
  v_vuelve  boolean;
begin
  if new.estado not in ('RECHAZADA', 'CANCELADA') or old.estado in ('RECHAZADA', 'CANCELADA') then
    return new;
  end if;

  for v_o in
    select o.* from public.compras_ordenes o
     where o.salida_almacen_numero = new.numero
       and o.estado not in ('cancelada', 'anulada')
     for update
  loop
    v_vuelve := v_o.estado in ('atendida_almacen', 'pendiente', 'aprobada');
    v_detalle := format('La solicitud de salida %s se %s: el almacén no lo entregó y vuelve a compras',
                        new.numero, case new.estado when 'RECHAZADA' then 'rechazó' else 'canceló' end);

    if v_vuelve then
      select jsonb_agg(
               case when coalesce((i ->> 'cantidad_almacen')::numeric, 0) > 0
                    then i || jsonb_build_object(
                           'cantidad', coalesce((i ->> 'cantidad')::numeric, 0) + (i ->> 'cantidad_almacen')::numeric,
                           'cantidad_almacen', 0,
                           'almacen_origenes', '{}'::jsonb,
                           'comprar', true,
                           'almacen_sin_salida', new.numero)
                    else i end order by n)
        into v_items
        from jsonb_array_elements(v_o.items) with ordinality as e(i, n);

      update public.compras_ordenes
         set items = v_items,
             total = private.compras_total_items(v_items),
             estado = case when estado = 'atendida_almacen' then 'pendiente' else estado end,
             historial = historial || private.compras_evento('salida_rechazada',
               jsonb_build_object('salida', new.numero, 'detalle', v_detalle))
       where id = v_o.id
      returning * into v_o;
    else
      update public.compras_ordenes
         set historial = historial || private.compras_evento('salida_rechazada',
               jsonb_build_object('salida', new.numero,
                 'detalle', v_detalle || format(' (la compra ya está en «%s»: hay que pedirlo aparte)', v_o.estado)))
       where id = v_o.id
      returning * into v_o;
    end if;

    perform private.compras_avisar(v_o, 'PEDIDO_SALIDA_RECHAZADA',
      format('%s: el almacén no entregó, la salida %s no se aprobó y vuelve a compras', v_o.codigo, new.numero),
      array['COMPRAS', 'ALMACEN'], '/app/pedidos', 'ATENCION');
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_compras_salida_rechazada_vuelve on public.solicitudes_salida;
create trigger trg_compras_salida_rechazada_vuelve
  after update of estado on public.solicitudes_salida
  for each row execute function private.compras_salida_rechazada_vuelve();

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Las fotos de referencia: un depósito privado
-- ═══════════════════════════════════════════════════════════════════════════

-- Rutas `{orden_id}/{algo}-{archivo}`. Se ve si se ve la orden; se sube o se
-- borra si se puede editar. 10 MB, solo imágenes (MGG: «Fotos del
-- repuesto/modelo a comprar»).
-- La orden de una ruta del depósito, o nulo si la carpeta no es un número. Va
-- en función y no en la política para que el «::bigint» nunca se intente sobre
-- una carpeta cualquiera: en SQL el AND no garantiza el orden.
create or replace function private.compras_orden_de_ruta(p_ruta text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when split_part(p_ruta, '/', 1) ~ '^[0-9]{1,18}$'
              then split_part(p_ruta, '/', 1)::bigint end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compras-pedidos', 'compras-pedidos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists compras_pedidos_lectura on storage.objects;
drop policy if exists compras_pedidos_subida on storage.objects;
drop policy if exists compras_pedidos_borrado on storage.objects;

create policy compras_pedidos_lectura on storage.objects
  for select to authenticated
  using (bucket_id = 'compras-pedidos'
         and private.compras_puede_ver_orden(private.compras_orden_de_ruta(name)));

create policy compras_pedidos_subida on storage.objects
  for insert to authenticated
  with check (bucket_id = 'compras-pedidos'
              and private.compras_puede_editar_orden(private.compras_orden_de_ruta(name)));

create policy compras_pedidos_borrado on storage.objects
  for delete to authenticated
  using (bucket_id = 'compras-pedidos'
         and private.compras_puede_editar_orden(private.compras_orden_de_ruta(name)));

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. La pantalla de teléfono del almacén (MGG vista «solicitudes»)
-- ═══════════════════════════════════════════════════════════════════════════

-- Una casilla, como surtidor, cocina, almacén y compras: solo la tiene quien
-- la marque. No se le da a ningún rol aquí: con la casilla, `Entrada.tsx`
-- aterriza en el teléfono, y eso es decisión de quien asigna los permisos.
insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
values ('INVENTARIO.SOLICITUDES_TELEFONO', 'INVENTARIO', 'Pantalla de teléfono de solicitudes de pedido',
        'Revisa desde el teléfono qué tiene el almacén general de cada solicitud de pedido antes de Compras.',
        coalesce((select max(orden) + 1 from public.acciones where modulo = 'INVENTARIO'), 1),
        null, true)
on conflict (codigo) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Auditoría y tiempo real
-- ═══════════════════════════════════════════════════════════════════════════

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    return;
  end if;
  insert into public.auditoria_modulos (tabla, modulo) values
    ('compras_ordenes', 'COMPRAS'),
    ('compras_unidades_solicitantes', 'COMPRAS')
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
  foreach t in array array['compras_ordenes', 'compras_unidades_solicitantes'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$vivo$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. Permisos de las funciones
-- ═══════════════════════════════════════════════════════════════════════════

-- Los ayudantes no se llaman desde fuera.
do $$
declare
  f text;
begin
  foreach f in array array[
    'private.compras_ordenes_tocada()',
    'private.compras_gestiona()',
    'private.compras_revisa_almacen()',
    'private.compras_mi_nombre()',
    'private.compras_evento(text, jsonb)',
    'private.compras_total_items(jsonb)',
    'private.compras_normalizar_items(jsonb, jsonb, boolean)',
    'private.compras_quien_pide(text)',
    'private.compras_asegurar_unidad(text)',
    'private.compras_avisar(public.compras_ordenes, text, text, text[], text, text)',
    'private.compras_salida_rechazada_vuelve()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Las dos que leen las políticas del depósito: las evalúa quien pide el archivo.
revoke all on function private.compras_orden_de_ruta(text) from public, anon;
grant execute on function private.compras_orden_de_ruta(text) to authenticated;
revoke all on function private.compras_puede_ver_orden(bigint) from public, anon;
revoke all on function private.compras_puede_editar_orden(bigint) from public, anon;
grant execute on function private.compras_puede_ver_orden(bigint) to authenticated;
grant execute on function private.compras_puede_editar_orden(bigint) to authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.compras_mis_permisos_de_pedidos()',
    'public.compras_proximo_codigo()',
    'public.compras_agregar_unidad_solicitante(text)',
    'public.compras_crear_solicitud(jsonb, text, text, text, boolean)',
    'public.compras_editar_solicitud(bigint, jsonb, text, text, text, boolean)',
    'public.compras_cancelar_orden(bigint, text)',
    'public.compras_aprobar_orden(bigint)',
    'public.compras_marcar_comprar(bigint, text, boolean)',
    'public.compras_editar_cantidades(bigint, jsonb, text[])',
    'public.compras_guardar_imagenes(bigint, jsonb)',
    'public.compras_revisar_en_almacen(bigint, jsonb, boolean, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. Comprobación
-- ═══════════════════════════════════════════════════════════════════════════

do $ver$
begin
  if has_table_privilege('authenticated', 'public.compras_ordenes', 'INSERT')
     or has_table_privilege('authenticated', 'public.compras_ordenes', 'UPDATE')
     or has_table_privilege('authenticated', 'public.compras_ordenes', 'DELETE') then
    raise exception 'compras_ordenes no puede escribirse directo: todo pasa por las funciones.';
  end if;
  if to_regprocedure('public.pedir_salida(bigint, jsonb, text, bigint, text, text, boolean, bigint, text, text, text, boolean)') is null then
    raise exception 'pedir_salida cambió de firma: la revisión del almacén la llama por nombre de parámetro, revísela.';
  end if;
  if private.almacen_que_revisa_pedidos() is null then
    raise notice 'No hay ALM-GEN activo: las solicitudes de pedido no se podrán crear hasta que exista.';
  end if;
end
$ver$;
