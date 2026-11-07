/*
  COMPRAS COMO MGG · FASE 5a
  SERVICIOS, SERVICIO DIRECTO Y SOLICITUD DE MERCADO

  Angélica, 07/11/2026: el módulo de compras se reemplaza por una copia exacta
  del de MGG, por fases. Las fases 0 a 4 dejaron la Solicitud de Pedido de
  productos de punta a punta. Esta fase pone las tres piezas de MGG que faltan
  en «Pedidos / Compras»:

  1. «🛠 SERVICIOS» (MGG `NuevoServicioModal`, `clase = 'servicio'`). Una
     solicitud de servicio con su correlativo SV-AAAA-NNNN, que NO pasa por la
     revisión del almacén (MGG `crearOrden`: los servicios nacen en
     «Pendiente»). Después sigue el mismo camino que una SP: aprobar, cotizar
     con ofertas y comparativa (fase 2), aprobar la OC, indicar el método con
     su documento y retenciones, marcar pagada (fase 3) y finalizar con la
     evaluación del proveedor (fase 4). Como en MGG:
       - el servicio NO recibe código OC: conserva su SV (MGG
         `aprobarOrdenConOferta`: «no son OC»). Una sub-orden por proveedor sí
         lleva su OC-, como allá;
       - un servicio no entra al inventario ni lo recibe el almacén: Compras
         deja constancia de que se prestó con «🔧 Servicio realizado» (MGG
         `RecepcionParcialModal` con `esServicio`: por renglón, cuánto se
         prestó, y la nota si fue menos). Por eso pagado no va a «Pendiente
         por recepción» sino a «Pagado», y el almacén no recibe avisos.
     Los renglones llevan la forma de MGG: `servicio_categoria`,
     `servicio_tipo`, `equipo_id/equipo_nombre`, `bombonas`, `kg_recarga` y
     `detalle_items` (el «▸ Detalle» de piezas y trabajos).

  2. «🔧 SERVICIO DIRECTO» (MGG `ServicioDirectoView` /
     `serviciosDirectos.repository.ts`): un servicio ya contratado o ya
     prestado que se registra directo, sin solicitud ni cotización. Tabla
     propia, `compras_servicios_directos`, como `servicios_directos` de MGG.
     Donde MGG lo manda a Tesorería, aquí sigue el esquema de la fase 3:
       en_proceso ──Cargar factura y monto──► por_pagar ──💳 Indicar método
       (documento y retenciones)──► confirmada_pagar ──💵 Marcar pagado──►
       finalizada
     Sin Tesorería no hay cajas, ni crédito por Cuenta por Pagar, ni anticipo
     (en MGG los dos crean una Cuenta por Pagar en Tesorería).

  3. «🛒 SOLICITUD DE MERCADO» (MGG `SolicitudMercadoModal`): víveres y
     artículos de limpieza para la cocina, URGENTE, con la finalidad
     «PEDIDO PARA RESTABLECER EL MERCADO»; tampoco pasa por el almacén. En La
     Cantera no hay `alertas_mercado`: la cocina pide el mercado ella misma
     desde Alimentación (`solicitar_mercado`, flujo anterior, que esta fase no
     toca), así que no hay tarjeta de alertas.

  4. «📒 CATEGORÍAS» (MGG `catalogos_pedido`): las pestañas «Unidad
     solicitante», «Categorías de servicio» y «Tipos de servicio», con alta,
     edición, deshabilitar y eliminar. Cada catálogo es su tabla, como
     `compras_unidades_solicitantes` de la fase 1.

  LO QUE CAMBIA RESPECTO A MGG
    - SIEMPRE EN DÓLARES. MGG deja elegir la moneda del servicio y convertir
      a Bs; aquí todo va en $ (precio BCV y efectivo, modalidad $ o Bs), como
      el resto del módulo.
    - SIN REPUESTOS DEL INVENTARIO AL CREAR. En MGG el formulario descuenta el
      repuesto del stock en el momento; aquí toda salida pasa por una
      solicitud de salida autorizada en Salidas, así que el repuesto se pide
      por ahí. El servicio sí se casa con el equipo de Maquinaria.
    - SERVICIO DIRECTO: el código es SVD-AAAA-NNNN (en La Cantera «SD» ya es
      la Solicitud de Despacho), y «+ Nuevo servicio directo» está a la vista
      (MGG lo escondió «por ahora»): sin él la pestaña no tendría de dónde
      llenarse.
    - QUIÉN: crear un servicio o una Solicitud de Mercado, quien ve Compras
      (MGG: quien ve la pestaña). Aprobar, cotizar, confirmar el servicio
      prestado, finalizar y todo el servicio directo, quien lleva Compras
      (`private.compras_gestiona()`); aprobar la OC y registrar el pago,
      `private.compras_aprueba_oc()`.

  LO QUE NO SE TOCA: el flujo anterior (`ordenes_compra`, «Tablero
  (anterior)»), la Compra Directa de La Cantera, combustible y la pantalla de
  la cocina.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Los catálogos de servicio (MGG `catalogos_pedido` scope servicio_*)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.compras_categorias_servicio (
  id         bigint generated always as identity primary key,
  nombre     text not null unique,
  activo     boolean not null default true,
  creado_por uuid references public.perfiles(id) default auth.uid(),
  creado_en  timestamptz not null default now()
);

comment on table public.compras_categorias_servicio is
  'Categorías de servicio (Categorías → Categorías de servicio en MGG): recarga de gas, mantenimiento de maquinaria… Solo se escribe por funciones.';

create table if not exists public.compras_tipos_servicio (
  id         bigint generated always as identity primary key,
  nombre     text not null unique,
  activo     boolean not null default true,
  creado_por uuid references public.perfiles(id) default auth.uid(),
  creado_en  timestamptz not null default now()
);

comment on table public.compras_tipos_servicio is
  'Tipos de servicio (Categorías → Tipos de servicio en MGG): cambio de aceite, recarga 20 kg… El formulario de servicio agrega los nuevos al vuelo. Solo se escribe por funciones.';

do $$
declare
  t text;
begin
  foreach t in array array['compras_categorias_servicio', 'compras_tipos_servicio'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_lectura', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_lectura', t);
    execute format('revoke all on public.%I from anon, public, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop trigger if exists trg_auditar on public.%I', t);
    execute format('create trigger trg_auditar after insert or update or delete on public.%I for each row execute function private.auditar(%L)', t, 'id');
  end loop;
end $$;

-- Las categorías con las que el formulario de MGG cambia de forma (recarga
-- de gas o de agua, mantenimiento de equipo, de vehículos o de
-- electrodomésticos). Se editan o se apagan en «📒 Categorías».
insert into public.compras_categorias_servicio (nombre, creado_por) values
  ('RECARGA DE GAS', null),
  ('RECARGA DE AGUA', null),
  ('RECARGA DE EXTINTORES', null),
  ('MANTENIMIENTO DE MAQUINARIA', null),
  ('MANTENIMIENTO DE VEHICULOS', null),
  ('MANTENIMIENTO DE ELECTRODOMESTICOS', null)
on conflict (nombre) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. El servicio directo (MGG `servicios_directos`)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.compras_servicios_directos (
  id                      bigint generated always as identity primary key,
  -- SVD-AAAA-NNNN («SD» ya es la Solicitud de Despacho en La Cantera).
  codigo                  text not null unique,
  -- El renglón si es uno; «N SERVICIOS» si son varios (MGG `descripcion`).
  descripcion             text not null,
  proveedor_id            bigint references public.proveedores(id) on delete restrict,
  proveedor_nombre        text,
  -- El equipo de Maquinaria, si todos los renglones son del mismo.
  equipo_id               bigint references public.maquinaria(id) on delete set null,
  equipo_nombre           text,
  cantidad                numeric(14, 4) not null default 0,
  -- [{servicio_categoria, servicio_tipo, equipo_id, equipo_nombre, descripcion,
  --   cantidad, bombonas, kg_recarga, gasto, detalle_items: [{descripcion, cantidad, precio}]}]
  items                   jsonb not null default '[]'::jsonb,
  estado                  text not null default 'en_proceso'
                            check (estado in ('en_proceso', 'por_pagar', 'confirmada_pagar', 'finalizada')),
  -- Siempre en $ (decisión de la dueña), como las órdenes.
  moneda                  text not null default 'USD' check (moneda = 'USD'),
  -- El total de la factura: Σ gasto de los renglones.
  gasto                   numeric(14, 2),
  unidad_solicitante      text,
  solicitante_nombre      text,
  nota                    text,
  -- MGG: «💳 Pago a externo (lo pagó otra persona; hay que reintegrarle)».
  pago_externo            boolean not null default false,
  pago_externo_datos      text,
  -- [{path, filename, at}] en el depósito `compras-servicios-directos`.
  facturas                jsonb not null default '[]'::jsonb,
  historial               jsonb not null default '[]'::jsonb,
  creado_por              uuid not null references public.perfiles(id),
  creado_por_nombre       text,
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz,
  montado_por             uuid references public.perfiles(id),
  montado_por_nombre      text,
  montado_en              timestamptz,
  -- El pago, como la fase 3 (sin Tesorería).
  metodo_pago             jsonb,
  metodo_pago_por         uuid references public.perfiles(id),
  metodo_pago_por_nombre  text,
  metodo_pago_en          timestamptz,
  comprobante_tipo        text check (comprobante_tipo in ('factura', 'nota_entrega')),
  retenciones             jsonb not null default '[]'::jsonb,
  descuento_pago          numeric(14, 2),
  numero_administracion   text,
  pago_qr_path            text,
  pago_qr_nombre          text,
  pagada_por              uuid references public.perfiles(id),
  pagada_por_nombre       text,
  pagada_en               timestamptz,
  pago_fecha              date,
  pago_referencia         text,
  pago_monto              numeric(14, 2),
  pago_moneda             text check (pago_moneda in ('USD', 'Bs', 'USDT')),
  pago_tasa               numeric(14, 4),
  pago_monto_usd          numeric(14, 2),
  pago_comprobante_path   text,
  pago_comprobante_nombre text,
  pago_nota               text,
  finalizada_en           timestamptz,

  constraint compras_sd_items_lista check (jsonb_typeof(items) = 'array'),
  constraint compras_sd_historial_lista check (jsonb_typeof(historial) = 'array'),
  constraint compras_sd_retenciones_lista check (jsonb_typeof(retenciones) = 'array'),
  constraint compras_sd_facturas_lista check (jsonb_typeof(facturas) = 'array' and jsonb_array_length(facturas) <= 20)
);

comment on table public.compras_servicios_directos is
  'Servicio Directo (MGG servicios_directos): un servicio ya contratado que se registra sin solicitud. En proceso → Por pagar → Confirmado pagar → Finalizado, todo en Compras (sin Tesorería). Solo se escribe por funciones.';

create index if not exists compras_sd_estado_idx on public.compras_servicios_directos (estado);
create index if not exists compras_sd_proveedor_idx on public.compras_servicios_directos (proveedor_id);
create index if not exists compras_sd_equipo_idx on public.compras_servicios_directos (equipo_id);

drop trigger if exists trg_tocada on public.compras_servicios_directos;
create trigger trg_tocada
  before update on public.compras_servicios_directos
  for each row execute function private.compras_ordenes_tocada();

drop trigger if exists trg_normalizar on public.compras_servicios_directos;
create trigger trg_normalizar
  before insert or update on public.compras_servicios_directos
  for each row execute function private.normalizar_texto(
    'descripcion', 'unidad_solicitante', 'solicitante_nombre', 'nota');

drop trigger if exists trg_auditar on public.compras_servicios_directos;
create trigger trg_auditar
  after insert or update or delete on public.compras_servicios_directos
  for each row execute function private.auditar('id');

-- Lo ve quien ve Compras; nadie lo escribe directo.
alter table public.compras_servicios_directos enable row level security;

drop policy if exists compras_servicios_directos_lectura on public.compras_servicios_directos;
create policy compras_servicios_directos_lectura on public.compras_servicios_directos
  for select to authenticated
  using (private.tiene_permiso('COMPRAS', 'LECTURA'));

revoke all on public.compras_servicios_directos from anon, public, authenticated;
grant select on public.compras_servicios_directos to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Ayudantes
-- ═══════════════════════════════════════════════════════════════════════════

-- El catálogo que se nombra, a su tabla. Nada fuera de estos tres.
create or replace function private.compras_tabla_catalogo(p_catalogo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_catalogo
           when 'unidad_solicitante' then 'compras_unidades_solicitantes'
           when 'servicio_categoria' then 'compras_categorias_servicio'
           when 'servicio_tipo' then 'compras_tipos_servicio'
         end;
$$;

-- Un número de la pantalla, o nulo si viene vacío. Lo que no es número, error.
create or replace function private.compras_numero(p_valor text, p_que text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  return nullif(btrim(coalesce(p_valor, '')), '')::numeric;
exception when others then
  raise exception '%: el número no se entiende.', p_que using errcode = '22023';
end;
$$;

/*
  El «▸ Detalle (opcional)» de un renglón (MGG `limpiarDetalleItems`): las
  piezas o trabajos, sin descripciones vacías; cantidad y precio solo si son
  mayores que cero.
*/
create or replace function private.compras_limpiar_detalle(p_detalle jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_d   jsonb;
  v_out jsonb := '[]'::jsonb;
  v_des text;
  v_c   numeric;
  v_p   numeric;
begin
  if p_detalle is null or jsonb_typeof(p_detalle) <> 'array' then
    return '[]'::jsonb;
  end if;
  if jsonb_array_length(p_detalle) > 50 then
    raise exception 'El detalle de un renglón lleva hasta 50 piezas o trabajos.' using errcode = '22023';
  end if;
  for v_d in select * from jsonb_array_elements(p_detalle) loop
    continue when jsonb_typeof(v_d) <> 'object';
    v_des := private.en_mayuscula(nullif(btrim(coalesce(v_d ->> 'descripcion', '')), ''));
    continue when v_des is null;
    v_c := private.compras_numero(v_d ->> 'cantidad', v_des);
    v_p := private.compras_numero(v_d ->> 'precio', v_des);
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'descripcion', left(v_des, 200),
      'cantidad', case when v_c > 0 then v_c end,
      'precio', case when v_p > 0 then round(v_p, 2) end)));
  end loop;
  return v_out;
end;
$$;

/*
  El equipo de Maquinaria de un renglón (MGG `equipo_id`): el que exista, con
  su nombre de ese día. Un electrodoméstico no es un equipo de Maquinaria:
  va solo con su nombre (`equipo_nombre`).
*/
create or replace function private.compras_equipo(p_id text, p_nombre text, out o_id bigint, out o_nombre text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  o_id := nullif(btrim(coalesce(p_id, '')), '')::bigint;
  if o_id is not null then
    select concat_ws(' · ', m.codigo, m.nombre) into o_nombre from public.maquinaria m where m.id = o_id;
    if o_nombre is null then
      raise exception 'Ese equipo no existe en Maquinaria.' using errcode = '23503';
    end if;
  else
    o_nombre := private.en_mayuscula(nullif(btrim(coalesce(p_nombre, '')), ''));
  end if;
exception when invalid_text_representation then
  raise exception 'El equipo no se entiende.' using errcode = '22023';
end;
$$;

/*
  LOS RENGLONES DE UNA SOLICITUD DE SERVICIO, LIMPIOS (MGG `NuevoServicioModal`).

  Cada renglón: categoría (del catálogo), tipo (si es nuevo, entra al
  catálogo, como MGG), equipo o electrodoméstico, cantidad (en una recarga,
  las bombonas o botellones), kg o litros, el precio estimado y el detalle.
  Si el detalle trae precios, su suma es el precio del renglón (MGG
  `precioLinea`). El SKU es SRV-n; al editar se conserva el que ya tenía el
  renglón, así las ofertas cargadas siguen apuntando a lo mismo.
*/
create or replace function private.compras_normalizar_items_servicio(p_items jsonb, p_previos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_x      jsonb;
  v_n      integer := 0;
  v_out    jsonb := '[]'::jsonb;
  v_cat    text;
  v_tipo   text;
  v_nombre text;
  v_cant   numeric;
  v_precio numeric;
  v_bomb   numeric;
  v_kg     numeric;
  v_det    jsonb;
  v_suma   numeric;
  v_eq     record;
  v_sku    text;
  v_usados text[] := '{}';
  v_k      integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Agregá al menos un servicio con su categoría.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Una solicitud de servicio lleva hasta 50 renglones.' using errcode = '22023';
  end if;

  -- Los SKU que se conservan, para no repetirlos en los nuevos.
  select coalesce(array_agg(x ->> 'sku'), '{}') into v_usados
    from jsonb_array_elements(p_items) x
   where jsonb_typeof(x) = 'object'
     and coalesce(x ->> 'sku', '') ~ '^SRV-[0-9]+$'
     and exists (select 1 from jsonb_array_elements(coalesce(p_previos, '[]'::jsonb)) p where p ->> 'sku' = x ->> 'sku');

  for v_x in select * from jsonb_array_elements(p_items) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_x) <> 'object' then
      raise exception 'El servicio % no se entiende.', v_n using errcode = '22023';
    end if;

    -- MGG: un renglón sin categoría no cuenta.
    v_cat := private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'servicio_categoria', '')), ''));
    continue when v_cat is null;

    if not exists (select 1 from public.compras_categorias_servicio c where c.nombre = v_cat and c.activo)
       and not exists (select 1 from jsonb_array_elements(coalesce(p_previos, '[]'::jsonb)) p
                        where p ->> 'servicio_categoria' = v_cat) then
      raise exception 'La categoría «%» no está en el catálogo (Categorías → Categorías de servicio).', v_cat
        using errcode = '23503';
    end if;

    v_tipo := private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'servicio_tipo', '')), ''));
    if length(coalesce(v_tipo, '')) > 80 then
      raise exception 'El tipo de servicio va en 80 letras como mucho.' using errcode = '22023';
    end if;

    v_cant := private.compras_numero(v_x ->> 'cantidad', v_cat);
    v_precio := greatest(coalesce(private.compras_numero(v_x ->> 'precio', v_cat), 0), 0);
    v_bomb := private.compras_numero(v_x ->> 'bombonas', v_cat);
    v_kg := private.compras_numero(v_x ->> 'kg_recarga', v_cat);

    if coalesce(v_cant, 0) <= 0 then
      raise exception 'Cada servicio debe tener cantidad mayor que 0.' using errcode = '22023';
    end if;
    if coalesce(v_bomb, 0) < 0 or coalesce(v_kg, 0) < 0 then
      raise exception '«%»: las bombonas y los kg o litros no pueden ser negativos.', v_cat using errcode = '22023';
    end if;

    select * into v_eq from private.compras_equipo(v_x ->> 'equipo_id', v_x ->> 'equipo_nombre');

    v_det := private.compras_limpiar_detalle(v_x -> 'detalle_items');
    select coalesce(sum((d ->> 'precio')::numeric), 0) into v_suma from jsonb_array_elements(v_det) d;
    if v_suma > 0 then
      v_precio := round(v_suma, 2);
    end if;

    v_nombre := private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'nombre', '')), ''));
    if v_nombre is null then
      v_nombre := concat_ws(' · ', v_cat, v_eq.o_nombre, v_tipo);
    end if;
    if v_tipo is null and v_eq.o_nombre is null and v_bomb is null and v_nombre = v_cat then
      raise exception 'Indicá el servicio de "%".', v_cat using errcode = '22023';
    end if;

    -- El SKU: el del renglón si ya era de esta solicitud; si no, el próximo libre.
    v_sku := nullif(btrim(coalesce(v_x ->> 'sku', '')), '');
    if v_sku is null or not (v_sku = any (v_usados))
       or exists (select 1 from jsonb_array_elements(v_out) o where o ->> 'sku' = v_sku) then
      v_k := 1;
      loop
        v_sku := 'SRV-' || v_k;
        exit when not (v_sku = any (v_usados))
              and not exists (select 1 from jsonb_array_elements(v_out) o where o ->> 'sku' = v_sku);
        v_k := v_k + 1;
      end loop;
    end if;

    -- El tipo nuevo alimenta el catálogo compartido (MGG `crearCatalogoPedido`).
    if v_tipo is not null then
      insert into public.compras_tipos_servicio (nombre) values (v_tipo) on conflict (nombre) do nothing;
    end if;

    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'sku', v_sku,
      'nombre', left(v_nombre, 300),
      'cantidad', v_cant,
      'precio', round(v_precio, 4),
      'unidad', 'UND',
      'comprar', true,
      'servicio_categoria', v_cat,
      'servicio_tipo', v_tipo,
      'equipo_id', v_eq.o_id,
      'equipo_nombre', v_eq.o_nombre,
      'bombonas', v_bomb,
      'kg_recarga', v_kg,
      'detalle_items', case when jsonb_array_length(v_det) > 0 then v_det end)));
  end loop;

  if jsonb_array_length(v_out) = 0 then
    raise exception 'Agregá al menos un servicio con su categoría.' using errcode = '22023';
  end if;

  return v_out;
end;
$$;

/*
  El proveedor nuevo de un servicio directo (MGG `crearProveedorRapido`): razón
  social y RIF, activo y sin categorías. Las mismas reglas de RIF que la
  oferta de la fase 2.
*/
create or replace function private.compras_proveedor_rapido(p jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_razon text := nullif(btrim(coalesce(p ->> 'razon_social', '')), '');
  v_rif   text := upper(regexp_replace(coalesce(p ->> 'rif', ''), '[\s.]', '', 'g'));
  v_id    bigint;
begin
  if v_rif ~ '^[VEJPGC][0-9]{9}$' then
    v_rif := substr(v_rif, 1, 1) || '-' || substr(v_rif, 2, 8) || '-' || substr(v_rif, 10, 1);
  elsif v_rif ~ '^[VEJPGC]-[0-9]{9}$' then
    v_rif := substr(v_rif, 1, 2) || substr(v_rif, 3, 8) || '-' || substr(v_rif, 11, 1);
  end if;
  if v_razon is null or v_rif !~ '^[VEJPGC]-[0-9]{8}-[0-9]$' then
    raise exception 'RIF (con número) y razón social son obligatorios' using errcode = '22023';
  end if;
  if exists (select 1 from public.proveedores pr where pr.rif = v_rif) then
    raise exception 'Ya existe un proveedor con ese RIF (%). Búsquelo en la lista.', v_rif using errcode = '23505';
  end if;

  insert into public.proveedores (rif, nombre, condicion_pago, moneda_preferida, activo, creado_por)
  values (v_rif, v_razon, 'CONTADO', 'USD', true, (select auth.uid()))
  returning id into v_id;

  perform private.notificar('COMPRAS', 'PROVEEDOR_REGISTRADO',
    format('Proveedor "%s" registrado', (select pr.nombre from public.proveedores pr where pr.id = v_id)),
    'Desde un servicio directo', '/app/compras/proveedores', array['COMPRAS'], 'INFO');

  return v_id;
end;
$$;

/*
  LOS RENGLONES DE UN SERVICIO DIRECTO (MGG `crearServicioDirecto`): categoría
  (libre, como el «allowCreate» de MGG), tipo, equipo o electrodoméstico,
  cantidad (las bombonas o botellones en una recarga), kg o litros y el
  detalle. La descripción la arma la pantalla («CATEGORÍA · EQUIPO · TIPO ·
  2 BOMBONA(S) · 86 KG»); si no viene, se arma aquí.
*/
create or replace function private.compras_normalizar_items_directo(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_x    jsonb;
  v_n    integer := 0;
  v_out  jsonb := '[]'::jsonb;
  v_cat  text;
  v_tipo text;
  v_des  text;
  v_cant numeric;
  v_bomb numeric;
  v_kg   numeric;
  v_eq   record;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agregá al menos un servicio con su categoría y cantidad.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Un servicio directo lleva hasta 50 renglones.' using errcode = '22023';
  end if;

  for v_x in select * from jsonb_array_elements(p_items) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_x) <> 'object' then
      raise exception 'El servicio % no se entiende.', v_n using errcode = '22023';
    end if;
    v_cat := private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'servicio_categoria', '')), ''));
    if v_cat is null then
      raise exception 'Indicá la categoría del servicio en cada renglón.' using errcode = '22023';
    end if;
    v_tipo := private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'servicio_tipo', '')), ''));
    v_cant := private.compras_numero(v_x ->> 'cantidad', v_cat);
    v_bomb := private.compras_numero(v_x ->> 'bombonas', v_cat);
    v_kg := private.compras_numero(v_x ->> 'kg_recarga', v_cat);
    if coalesce(v_cant, 0) <= 0 then
      raise exception 'Cada servicio debe tener cantidad mayor que 0.' using errcode = '22023';
    end if;
    if coalesce(v_bomb, 0) < 0 or coalesce(v_kg, 0) < 0 then
      raise exception '«%»: las bombonas y los kg o litros no pueden ser negativos.', v_cat using errcode = '22023';
    end if;
    select * into v_eq from private.compras_equipo(v_x ->> 'equipo_id', v_x ->> 'equipo_nombre');
    v_des := private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'descripcion', '')), ''));
    if v_des is null then
      v_des := concat_ws(' · ', v_cat, v_eq.o_nombre, v_tipo);
    end if;
    if v_tipo is not null then
      insert into public.compras_tipos_servicio (nombre) values (v_tipo) on conflict (nombre) do nothing;
    end if;

    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'servicio_categoria', v_cat,
      'servicio_tipo', v_tipo,
      'equipo_id', v_eq.o_id,
      'equipo_nombre', v_eq.o_nombre,
      'descripcion', left(v_des, 300),
      'cantidad', v_cant,
      'bombonas', v_bomb,
      'kg_recarga', v_kg,
      'detalle_items', nullif(private.compras_limpiar_detalle(v_x -> 'detalle_items'), '[]'::jsonb))));
  end loop;

  return v_out;
end;
$$;

/*
  Un servicio directo como si fuera una orden, para reusar las cuentas del
  pago de la fase 3 (bases, retenciones, monto a pagar). Un servicio directo
  no lleva IVA ni descuento de cotización: la base imponible y el total son la
  factura.
*/
create or replace function private.compras_sd_como_orden(p public.compras_servicios_directos)
returns public.compras_ordenes
language plpgsql
immutable
set search_path = ''
as $$
declare
  v public.compras_ordenes;
begin
  v.id := p.id;
  v.codigo := p.codigo;
  v.total := coalesce(p.gasto, 0);
  v.items := jsonb_build_array(jsonb_build_object('sku', 'SD', 'cantidad', 1, 'precio', coalesce(p.gasto, 0)));
  v.iva := null;
  v.iva_incluido := false;
  v.descuento_obtenido := null;
  v.condiciones_pago := null;
  v.recibido_total := null;
  v.descuento_pago := p.descuento_pago;
  v.retenciones := coalesce(p.retenciones, '[]'::jsonb);
  v.abonado_total := 0;
  return v;
end;
$$;

-- Lo que se le paga: factura − descuento en el pago − retenciones.
create or replace function private.compras_sd_monto_a_pagar(p public.compras_servicios_directos)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select private.compras_monto_a_pagar(private.compras_sd_como_orden(p));
$$;

-- Las retenciones del servicio directo, con el texto de un servicio.
create or replace function private.compras_sd_retenciones(p public.compras_servicios_directos, p_lista jsonb, p_estricto boolean)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  return private.compras_calcular_retenciones(private.compras_sd_como_orden(p), p_lista, p_estricto);
exception when sqlstate '22023' then
  raise exception '%', replace(replace(sqlerrm, 'La OC no tiene IVA', 'El servicio no lleva IVA'), 'de la OC', 'del servicio')
    using errcode = '22023';
end;
$$;

/*
  Un archivo del servicio directo ya subido al depósito
  `compras-servicios-directos`: {path, filename}, en su carpeta y con su
  prefijo (factura-, pago-, qr-). Nulo si no viene.
*/
create or replace function private.compras_sd_archivo(p_archivo jsonb, p_id bigint, p_prefijo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_nom  text;
begin
  if p_archivo is null or jsonb_typeof(p_archivo) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_archivo) <> 'object' then
    raise exception 'El archivo no se entiende.' using errcode = '22023';
  end if;
  v_path := coalesce(p_archivo ->> 'path', '');
  v_nom := nullif(btrim(coalesce(p_archivo ->> 'filename', '')), '');
  if v_path not like p_id::text || '/' || p_prefijo || '-%' or v_nom is null then
    raise exception 'El archivo no es de este servicio.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects s where s.bucket_id = 'compras-servicios-directos' and s.name = v_path) then
    raise exception 'El archivo no se terminó de subir: vuelva a elegirlo.' using errcode = '22023';
  end if;
  return jsonb_build_object('path', v_path, 'filename', left(v_nom, 200));
end;
$$;

-- El aviso de un servicio directo, en la campana de Compras.
create or replace function private.compras_sd_avisar(
  p public.compras_servicios_directos,
  p_tipo text,
  p_titulo text,
  p_roles text[] default array['COMPRAS'],
  p_importancia text default 'INFO'
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notificar(
    'COMPRAS', p_tipo, p_titulo,
    concat_ws(' · ', p.descripcion, p.proveedor_nombre, nullif(left(coalesce(p.nota, ''), 140), '')),
    '/app/pedidos?scope=servicio_directo&sd=' || p.id,
    p_roles, p_importancia);
end;
$$;

-- ¿Puede subir o quitar archivos del servicio directo? Quien lleva Compras;
-- el comprobante del pago, también quien aprueba la OC.
create or replace function private.compras_puede_subir_sd(p_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_id is not null
     and exists (select 1 from public.compras_servicios_directos s where s.id = p_id)
     and (private.compras_gestiona() or private.compras_aprueba_oc());
$$;

-- ¿Puede borrar archivos de esa carpeta? Lo mismo, y además lo que quedó de
-- un servicio ya eliminado lo limpia quien lleva Compras.
create or replace function private.compras_puede_borrar_sd(p_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_id is not null
     and (private.compras_puede_subir_sd(p_id)
          or (private.compras_gestiona()
              and not exists (select 1 from public.compras_servicios_directos s where s.id = p_id)));
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Lo que la pantalla pregunta antes de dibujar
-- ═══════════════════════════════════════════════════════════════════════════

-- El código que tendrá el próximo servicio (MGG `nextCodigoServicio`). Solo
-- para enseñarlo: el de verdad lo da `siguiente_numero('SV')` al crear.
create or replace function public.compras_proximo_codigo_servicio()
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
  select c.ultimo + 1 into v_n from public.correlativos c where c.prefijo = 'SV' and c.anio = v_anio;
  return format('SV-%s-%s', v_anio, lpad(coalesce(v_n, 1)::text, 4, '0'));
end;
$$;

-- Los equipos de Maquinaria para casar un servicio (MGG `listEquipos`): quien
-- ve Compras no necesariamente lee Maquinaria.
create or replace function public.compras_equipos_para_servicio()
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
             'id', m.id, 'codigo', m.codigo, 'nombre', m.nombre, 'tipo', m.tipo,
             'clase', m.clase, 'estado', m.estado, 'marca', m.marca, 'modelo', m.modelo)
           order by (m.estado = 'ACTIVA') desc, m.nombre), '[]'::jsonb)
      from public.maquinaria m);
end;
$$;

/*
  La última Solicitud de Mercado, para sugerir las cantidades (MGG: «🧾
  Cantidades sugeridas de la última compra {código} · {fecha}»).
*/
create or replace function public.compras_ultima_solicitud_mercado()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform private.exigir_usuario_activo();
  if not private.tiene_permiso('COMPRAS', 'LECTURA') then
    raise exception 'Sin permiso para ver Compras.' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'codigo', o.codigo,
           'fecha', o.creado_en,
           'renglones', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'articulo_id', (i ->> 'articulo_id')::bigint,
                      'cantidad', coalesce((i ->> 'cantidad_solicitada')::numeric, (i ->> 'cantidad')::numeric)))
               from jsonb_array_elements(o.items) i
              where (i ->> 'articulo_id') is not null), '[]'::jsonb))
    into v
    from public.compras_ordenes o
   where o.finalidad = 'PEDIDO PARA RESTABLECER EL MERCADO'
     and o.parent_orden_id is null
     and o.estado not in ('cancelada', 'anulada')
   order by o.creado_en desc
   limit 1;

  return v;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. 📒 Categorías (MGG `CatalogosPedidoModal`)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  «+ Agregar» y «✎ Editar» de un catálogo: unidad_solicitante,
  servicio_categoria o servicio_tipo. Lo administra quien lleva Compras. Un
  nombre que cambia no reescribe las órdenes viejas (guardan el texto de ese
  día, como MGG).
*/
create or replace function public.compras_catalogo_guardar(p_catalogo text, p_id bigint, p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tabla  text := private.compras_tabla_catalogo(p_catalogo);
  v_nombre text := private.en_mayuscula(nullif(btrim(coalesce(p_nombre, '')), ''));
  v_id     bigint;
  v_otro   bigint;
begin
  perform private.exigir_usuario_activo();
  if not private.compras_gestiona() then
    raise exception 'Los catálogos de pedidos los administra quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;
  if v_tabla is null then
    raise exception 'Ese catálogo no existe.' using errcode = '22023';
  end if;
  if v_nombre is null then
    raise exception 'Escribí el nombre.' using errcode = '22023';
  end if;
  if length(v_nombre) > 80 then
    raise exception 'El nombre va en 80 letras como mucho.' using errcode = '22023';
  end if;

  execute format('select id from public.%I where nombre = $1', v_tabla) into v_otro using v_nombre;
  if v_otro is not null and v_otro is distinct from p_id then
    raise exception '«%» ya está en el catálogo.', v_nombre using errcode = '23505';
  end if;

  if p_id is null then
    execute format('insert into public.%I (nombre) values ($1) returning id', v_tabla) into v_id using v_nombre;
  else
    execute format('update public.%I set nombre = $1 where id = $2 returning id', v_tabla) into v_id using v_nombre, p_id;
    if v_id is null then
      raise exception 'Ese registro del catálogo no existe.' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'nombre', v_nombre);
end;
$$;

-- «Deshabilitar» / «Habilitar».
create or replace function public.compras_catalogo_activar(p_catalogo text, p_id bigint, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tabla text := private.compras_tabla_catalogo(p_catalogo);
  v_id    bigint;
begin
  perform private.exigir_usuario_activo();
  if not private.compras_gestiona() then
    raise exception 'Los catálogos de pedidos los administra quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;
  if v_tabla is null then
    raise exception 'Ese catálogo no existe.' using errcode = '22023';
  end if;
  execute format('update public.%I set activo = $1 where id = $2 returning id', v_tabla)
    into v_id using coalesce(p_activo, true), p_id;
  if v_id is null then
    raise exception 'Ese registro del catálogo no existe.' using errcode = 'P0002';
  end if;
end;
$$;

-- «🗑 Eliminar»: «¿Eliminar definitivamente «X» del catálogo?».
create or replace function public.compras_catalogo_eliminar(p_catalogo text, p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tabla text := private.compras_tabla_catalogo(p_catalogo);
  v_id    bigint;
begin
  perform private.exigir_usuario_activo();
  if not private.compras_gestiona() then
    raise exception 'Los catálogos de pedidos los administra quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;
  if v_tabla is null then
    raise exception 'Ese catálogo no existe.' using errcode = '22023';
  end if;
  execute format('delete from public.%I where id = $1 returning id', v_tabla) into v_id using p_id;
  if v_id is null then
    raise exception 'Ese registro del catálogo no existe.' using errcode = 'P0002';
  end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. 🛠 La solicitud de servicio (MGG `NuevoServicioModal`)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  CREAR (MGG `crearOrden` con clase 'servicio'): SV-AAAA-NNNN, «Pendiente»
  (sin revisión del almacén), clasificación «Servicios». La nota es opcional
  (MGG «Nota (opcional)»); la unidad solicitante no.
*/
create or replace function public.compras_crear_servicio(
  p_items jsonb,
  p_notas text default null,
  p_unidad_solicitante text default null,
  p_solicitante_nombre text default null,
  p_urgente boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items  jsonb;
  v_pide   record;
  v_unidad text;
  v_o      public.compras_ordenes;
begin
  perform private.exigir_usuario_activo();

  if not private.tiene_permiso('COMPRAS', 'LECTURA') then
    raise exception 'Las solicitudes de servicio las carga quien ve Compras.' using errcode = '42501';
  end if;

  v_unidad := private.compras_asegurar_unidad(p_unidad_solicitante);
  if v_unidad is null then
    raise exception 'Indicá la unidad solicitante.' using errcode = '22023';
  end if;

  v_items := private.compras_normalizar_items_servicio(p_items, '[]'::jsonb);
  select * into v_pide from private.compras_quien_pide(p_solicitante_nombre);

  insert into public.compras_ordenes
    (codigo, clase, estado, creado_por, creado_por_nombre, solicitante_id, solicitante_nombre,
     unidad_solicitante, items, total, notas, urgente, clasificacion, historial)
  values
    (private.siguiente_numero('SV'), 'servicio', 'pendiente',
     (select auth.uid()), private.compras_mi_nombre(), v_pide.o_id, v_pide.o_nombre,
     v_unidad, v_items, private.compras_total_items(v_items),
     nullif(btrim(coalesce(p_notas, '')), ''), coalesce(p_urgente, false), array['Servicios'],
     private.compras_evento('creada', jsonb_build_object(
       'detalle', concat_ws(' · ', 'SOLICITUD DE SERVICIO', case when coalesce(p_urgente, false) then 'ORDEN URGENTE' end))))
  returning * into v_o;

  -- MGG: «Nueva orden de pedido {código}[ · URGENTE] enviada para aprobación».
  perform private.compras_avisar(v_o, 'SERVICIO_PENDIENTE',
    format('Nueva solicitud de servicio %s%s enviada para aprobación', v_o.codigo, case when v_o.urgente then ' · URGENTE' else '' end),
    array['COMPRAS'], '/app/pedidos', 'ATENCION');

  return jsonb_build_object('id', v_o.id, 'codigo', v_o.codigo, 'estado', v_o.estado);
end;
$$;

/*
  EDITAR (MGG `NuevoServicioModal` en edición → `actualizarOrden`): en
  «Pendiente» o «Aprobada», antes de elegir oferta y sin sub-órdenes vivas;
  quien la cargó o quien lleva Compras.
*/
create or replace function public.compras_editar_servicio(
  p_id bigint,
  p_items jsonb,
  p_notas text default null,
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
  if v_o.clase <> 'servicio' then
    raise exception 'Esa orden no es una solicitud de servicio.' using errcode = '22023';
  end if;
  if v_o.estado not in ('pendiente', 'aprobada') or v_o.proveedor_id is not null or v_o.parent_orden_id is not null then
    raise exception 'El servicio % ya no se edita aquí (está en «%»).', v_o.codigo, v_o.estado using errcode = '55000';
  end if;
  if cardinality(private.compras_skus_tomados(v_o.id)) > 0 then
    raise exception 'El servicio % ya tiene sub-órdenes por proveedor: corregí cada una desde su OC.', v_o.codigo
      using errcode = '55000';
  end if;
  if not (private.compras_gestiona() or v_o.creado_por = (select auth.uid())) then
    raise exception 'Solo quien cargó la solicitud o Compras pueden editarla.' using errcode = '42501';
  end if;

  v_unidad := private.compras_asegurar_unidad(p_unidad_solicitante);
  if v_unidad is null then
    raise exception 'Indicá la unidad solicitante.' using errcode = '22023';
  end if;

  v_items := private.compras_normalizar_items_servicio(p_items, v_o.items);
  select * into v_pide from private.compras_quien_pide(p_solicitante_nombre);

  update public.compras_ordenes
     set items = v_items,
         total = private.compras_total_items(v_items),
         notas = nullif(btrim(coalesce(p_notas, '')), ''),
         unidad_solicitante = v_unidad,
         solicitante_id = v_pide.o_id,
         solicitante_nombre = v_pide.o_nombre,
         urgente = coalesce(p_urgente, false),
         historial = historial || private.compras_evento('editada')
   where id = p_id
  returning * into v_o;

  -- MGG: «Orden {código} editada[ · URGENTE]».
  perform private.compras_avisar(v_o, 'PEDIDO_EDITADO',
    format('Orden %s editada%s', v_o.codigo, case when v_o.urgente then ' · URGENTE' else '' end), array['COMPRAS']);

  return jsonb_build_object('id', v_o.id, 'codigo', v_o.codigo, 'estado', v_o.estado);
end;
$$;

/*
  La SP de productos no se edita como servicio, ni el servicio como SP: los
  renglones son de otra forma. Lo de la fase 1, más esa guarda.
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

  if v_o.clase = 'servicio' then
    raise exception 'El servicio % se edita con el formato de servicio.', v_o.codigo using errcode = '22023';
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
  «🔧 Servicio realizado» (MGG `RecepcionParcialModal` con `esServicio` →
  `recibirOrdenParcial`): Compras deja constancia de que el servicio se
  prestó. No entra al inventario, no elige almacén. Por renglón, cuánto se
  prestó (no más de lo pedido); si fue menos, la nota es obligatoria. La
  orden cierra en una sola vez, como MGG («la orden cierra sin saldo
  pendiente»).

  p_datos = {renglones: [{sku, cantidad}], nota}

  Estados: «Pendiente por realizar» (contra entrega o crédito enviado a
  recepción), «Crédito · cuenta abierta» o «Pagado».
    crédito con saldo → sigue en cuenta_abierta (con recibida_en)
    el resto          → recibida («Servicio realizado»)
*/
create or replace function public.compras_servicio_realizado(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o       public.compras_ordenes;
  v_x       jsonb;
  v_it      jsonb;
  v_items   jsonb;
  v_sku     text;
  v_cant    numeric;
  v_pedido  numeric;
  v_vistos  text[] := '{}';
  v_hay     boolean := false;
  v_menos   boolean := false;
  v_nota    text;
  v_rec     numeric;
  v_estado  text;
  v_tmp     public.compras_ordenes;
  v_ren     jsonb := '[]'::jsonb;
  v_titulo  text;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'El servicio prestado lo confirma quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos del servicio prestado.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.clase <> 'servicio' then
    raise exception 'Esa orden no es un servicio: la mercancía la recibe el almacén.' using errcode = '22023';
  end if;
  if v_o.recibida_en is not null then
    raise exception 'Este servicio ya quedó realizado.' using errcode = '55000';
  end if;
  if v_o.estado not in ('por_recibir', 'cuenta_abierta', 'pagada') then
    raise exception 'La orden no está en un estado recibible.' using errcode = '55000';
  end if;

  v_nota := nullif(btrim(coalesce(p_datos ->> 'nota', '')), '');
  if length(coalesce(v_nota, '')) > 500 then
    raise exception 'La nota va en 500 letras como mucho.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_datos -> 'renglones', '[]'::jsonb)) <> 'array' then
    raise exception 'Los renglones van en una lista.' using errcode = '22023';
  end if;

  v_items := v_o.items;
  for v_x in select * from jsonb_array_elements(coalesce(p_datos -> 'renglones', '[]'::jsonb)) loop
    v_sku := nullif(btrim(coalesce(v_x ->> 'sku', '')), '');
    if v_sku is null or v_sku = any (v_vistos) then
      raise exception 'Un renglón viene vacío o dos veces.' using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_sku;

    select i into v_it from jsonb_array_elements(v_items) i
     where i ->> 'sku' = v_sku and coalesce((i ->> 'comprar')::boolean, true) limit 1;
    if v_it is null then
      raise exception 'Ese renglón no es de esta orden.' using errcode = '22023';
    end if;

    v_cant := round(coalesce(private.compras_numero(v_x ->> 'cantidad', v_it ->> 'nombre'), 0), 4);
    v_pedido := coalesce((v_it ->> 'cantidad')::numeric, 0);
    if v_cant < 0 then
      raise exception '«%»: la cantidad no puede ser negativa.', v_it ->> 'nombre' using errcode = '22023';
    end if;
    if v_cant > v_pedido + 0.0001 then
      raise exception 'No podés recibir más de lo pedido en %.', v_it ->> 'nombre' using errcode = '22023';
    end if;
    if v_cant > 0 then
      v_hay := true;
    end if;

    select jsonb_agg(case when i ->> 'sku' = v_sku and coalesce((i ->> 'comprar')::boolean, true)
                          then i || jsonb_build_object('cantidad_recibida', v_cant)
                          else i end order by n)
      into v_items
      from jsonb_array_elements(v_items) with ordinality as e(i, n);

    v_ren := v_ren || jsonb_build_array(jsonb_build_object(
      'nombre', v_it ->> 'nombre', 'cantidad', v_cant, 'pedido', v_pedido, 'recibido', v_cant));
  end loop;

  if not v_hay then
    raise exception 'Indicá al menos una cantidad recibida.' using errcode = '22023';
  end if;

  -- Lo que no vino en la lista cuenta como no prestado.
  select bool_or(coalesce((i ->> 'cantidad_recibida')::numeric, 0) < coalesce((i ->> 'cantidad')::numeric, 0) - 0.0001)
    into v_menos
    from jsonb_array_elements(v_items) i
   where coalesce((i ->> 'comprar')::boolean, true);

  if coalesce(v_menos, false) and v_nota is null then
    raise exception 'Recibiste menos de lo pedido: indicá una nota explicando la diferencia.' using errcode = '22023';
  end if;

  v_rec := round(coalesce(v_o.total, 0) * private.compras_fraccion_recibida(v_items), 2);
  v_tmp := v_o;
  v_tmp.items := v_items;
  v_tmp.recibido_total := v_rec;
  v_estado := case when v_o.condiciones_pago = 'credito' and v_o.pagada_en is null
                         and private.compras_saldo_credito(v_tmp) > 0.01
                   then 'cuenta_abierta' else 'recibida' end;

  update public.compras_ordenes
     set estado = v_estado,
         items = v_items,
         recibido_total = v_rec,
         recibida_por = (select auth.uid()),
         recibida_por_nombre = private.compras_mi_nombre(),
         recibida_en = now(),
         nota_recepcion = coalesce(v_nota, case when v_menos then 'Servicio prestado en parte: menos de lo solicitado.' end),
         historial = historial || private.compras_evento('servicio_realizado', jsonb_strip_nulls(jsonb_build_object(
           'renglones', v_ren,
           'recibido_total', v_rec,
           'parcial', case when v_menos then true end,
           'nota', v_nota,
           'a', v_estado)))
   where id = p_id
  returning * into v_o;

  if v_o.parent_orden_id is not null then
    perform private.compras_reestado_madre(v_o.parent_orden_id);
  end if;

  -- MGG: «Recepción confirmada · {código} · …».
  v_titulo := case
    when v_o.condiciones_pago = 'contra_entrega' and v_o.pagada_en is null then
      format('Servicio realizado · %s · indicá el método para pagar lo prestado', v_o.codigo)
    when v_o.pagada_en is not null then
      format('Servicio realizado · %s · listo para finalizar', v_o.codigo)
    else
      format('Servicio realizado · %s · pendiente por pagar', v_o.codigo) end;

  perform private.compras_avisar(v_o, 'SERVICIO_REALIZADO', v_titulo, array['COMPRAS'], '/app/pedidos',
    case when v_o.condiciones_pago = 'contra_entrega' and v_o.pagada_en is null then 'ATENCION' else 'INFO' end);
  perform private.compras_avisar_solicitante(v_o, 'SERVICIO_REALIZADO', format('Tu servicio %s quedó realizado', v_o.codigo));

  return jsonb_build_object('id', v_o.id, 'estado', v_o.estado, 'recibido_total', v_rec);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Lo de las fases 2 y 3 que cambia para un servicio
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Elegir la oferta (fase 2), con lo de MGG para los servicios: la solicitud
  de servicio NO recibe código OC, conserva su SV (MGG `aprobarOrdenConOferta`:
  «Las SOLICITUDES DE SERVICIO conservan su propio correlativo»). Lo demás,
  idéntico a la fase 2.
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
    -- MGG: el servicio conserva su SV; el producto toma (o conserva) su OC-.
    v_oc := case when v_o.clase = 'servicio' and not v_es_hija then v_o.oc_codigo
                 else coalesce(v_o.oc_codigo, private.siguiente_numero('OC')) end;
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
           historial = historial || private.compras_evento('oc_creada', jsonb_strip_nulls(jsonb_build_object(
             'oc_codigo', v_oc,
             'proveedor_id', v_of.proveedor_id,
             'proveedor', private.compras_texto_proveedor(v_of.proveedor_id),
             'precio', (v_arm ->> 'total')::numeric,
             'score', p_score,
             'modalidad_pago', p_modalidad,
             'total', (v_arm ->> 'total')::numeric)))
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
  ✔ Aprobar OC (fase 3), con lo de un servicio: en contra entrega va a
  «Pendiente por realizar» y el aviso no es para el almacén (un servicio no
  se recibe en ALM-GEN): lo confirma Compras.
*/
create or replace function public.compras_aprobar_oc(p_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o    public.compras_ordenes;
  v_dest text;
  v_oc   text;
  v_out  jsonb := '[]'::jsonb;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_aprueba_oc() then
    raise exception 'Solo los usuarios autorizados para aprobar órdenes de compra (Usuarios > Roles y Permisos) pueden confirmar las órdenes de compra.'
      using errcode = '42501';
  end if;

  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Seleccioná al menos una OC por confirmar' using errcode = '22023';
  end if;

  for v_o in
    select o.* from public.compras_ordenes o
     where o.id = any (p_ids) and o.estado = 'oc_creada'
     order by o.id
     for update
  loop
    v_dest := case v_o.condiciones_pago
                when 'contra_entrega' then 'por_recibir'
                when 'credito' then 'cuenta_abierta'
                else 'confirmada_metodo' end;
    v_oc := coalesce(v_o.oc_codigo, v_o.codigo);

    update public.compras_ordenes
       set estado = v_dest,
           oc_aprobada_por = (select auth.uid()),
           oc_aprobada_por_nombre = private.compras_mi_nombre(),
           oc_aprobada_en = now(),
           historial = historial || private.compras_evento('confirmada_' || v_dest, jsonb_build_object(
             'oc_codigo', v_o.oc_codigo,
             'condicion', v_o.condiciones_pago,
             'lote', cardinality(p_ids) > 1,
             'total', v_o.total))
     where id = v_o.id
    returning * into v_o;

    -- MGG: «OC confirmada: {oc} · falta indicar el método de pago».
    perform private.compras_avisar(v_o, 'OC_CONFIRMADA',
      format('%s confirmada: %s · %s', case when v_o.clase = 'servicio' then 'Servicio' else 'OC' end, v_oc,
        case v_dest
          when 'confirmada_metodo' then 'falta indicar el método de pago'
          when 'cuenta_abierta' then 'crédito (cuenta abierta)'
          else case when v_o.clase = 'servicio' then 'contra entrega: pendiente por realizar'
                    else 'contra entrega: pendiente por recepción' end end),
      array['COMPRAS'], '/app/pedidos', 'ATENCION');

    if v_dest = 'por_recibir' and v_o.clase <> 'servicio' then
      perform private.compras_avisar_por_recibir(v_o,
        format('OC %s (contra entrega) · pendiente por recepción en el Almacén General', v_oc));
    end if;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', v_o.id, 'codigo', v_o.codigo, 'oc_codigo', v_o.oc_codigo, 'estado', v_dest));
  end loop;

  if jsonb_array_length(v_out) = 0 then
    raise exception 'No hay órdenes de compra por confirmar.' using errcode = '55000';
  end if;

  return v_out;
end;
$$;

/*
  💵 Marcar pagada (fase 3), con lo de un servicio: sin prestar todavía queda
  en «Pagado» (MGG `pagada`) para que Compras confirme «🔧 Servicio
  realizado»; no va a «Pendiente por recepción» ni avisa al almacén.
*/
create or replace function public.compras_marcar_pagada(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o      public.compras_ordenes;
  v_p      record;
  v_ref    text;
  v_comp   jsonb;
  v_debe   numeric;
  v_tol    numeric;
  v_dest   text;
  v_oc     text;
  v_efe    boolean;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_aprueba_oc() then
    raise exception 'El pago lo registra un usuario autorizado para aprobar órdenes de compra o quien lleva Compras.'
      using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos del pago.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.estado <> 'oc_aprobada' or v_o.pagada_en is not null then
    raise exception 'Solo se paga una OC en «Confirmada pagar» (está en «%»).', v_o.estado using errcode = '55000';
  end if;

  select * into v_p from private.compras_leer_pago(p_datos);

  v_efe := coalesce(jsonb_array_length(v_o.metodo_pago), 0) > 0
           and not exists (select 1 from jsonb_array_elements(v_o.metodo_pago) l
                            where l ->> 'metodo' not in ('divisas_efectivo', 'efectivo_bs'));
  v_ref := nullif(btrim(coalesce(p_datos ->> 'referencia', '')), '');
  if v_ref is null and not v_efe then
    raise exception 'Indicá la referencia del pago.' using errcode = '22023';
  end if;
  if length(coalesce(v_ref, '')) > 80 then
    raise exception 'La referencia va en 80 letras como mucho.' using errcode = '22023';
  end if;

  v_debe := private.compras_monto_a_pagar(v_o);
  v_tol := case when v_p.o_moneda = 'Bs' then greatest(0.01, round(v_debe * 0.01, 2)) else 0.01 end;
  if v_p.o_monto_usd < v_debe - v_tol then
    raise exception 'Lo pagado (%) no cubre el monto a pagar (%).',
      private.compras_monto_txt(v_p.o_monto_usd), private.compras_monto_txt(v_debe) using errcode = '22023';
  end if;

  v_comp := private.compras_archivo_de_pago(p_datos -> 'comprobante', p_id, 'pago');
  v_dest := case when v_o.recibida_en is not null or v_o.clase = 'servicio' then 'pagada' else 'por_recibir' end;
  v_oc := coalesce(v_o.oc_codigo, v_o.codigo);

  update public.compras_ordenes
     set estado = v_dest,
         pagada_por = (select auth.uid()),
         pagada_por_nombre = private.compras_mi_nombre(),
         pagada_en = now(),
         pago_fecha = v_p.o_fecha,
         pago_referencia = v_ref,
         pago_monto = v_p.o_monto,
         pago_moneda = v_p.o_moneda,
         pago_tasa = v_p.o_tasa,
         pago_monto_usd = v_p.o_monto_usd,
         pago_comprobante_path = v_comp ->> 'path',
         pago_comprobante_nombre = v_comp ->> 'filename',
         pago_nota = private.en_mayuscula(nullif(btrim(coalesce(p_datos ->> 'nota', '')), '')),
         historial = historial || private.compras_evento('pagada', jsonb_build_object(
           'fecha', v_p.o_fecha,
           'referencia', v_ref,
           'monto', v_p.o_monto,
           'moneda', v_p.o_moneda,
           'tasa', v_p.o_tasa,
           'monto_usd', v_p.o_monto_usd,
           'monto_a_pagar', v_debe,
           'comprobante_path', v_comp ->> 'path',
           'comprobante_nombre', v_comp ->> 'filename',
           'a', v_dest))
   where id = p_id
  returning * into v_o;

  -- MGG: «OC {oc} pagada · {monto}».
  perform private.compras_avisar(v_o, 'OC_PAGADA',
    format('%s %s pagad%s · %s%s', case when v_o.clase = 'servicio' then 'Servicio' else 'OC' end, v_oc,
      case when v_o.clase = 'servicio' then 'o' else 'a' end,
      private.compras_monto_txt(v_p.o_monto_usd),
      case when v_dest = 'por_recibir' then ' · pendiente por recepción'
           when v_o.recibida_en is null then ' · falta confirmar el servicio realizado'
           else ' · lista para finalizar' end),
    array['COMPRAS', 'GERENTE_GENERAL']);

  if v_dest = 'por_recibir' then
    perform private.compras_avisar_por_recibir(v_o,
      format('OC %s pagada · pendiente por recepción en el Almacén General', v_oc));
  end if;

  return jsonb_build_object('id', v_o.id, 'estado', v_o.estado, 'monto_usd', v_p.o_monto_usd);
end;
$$;

-- «📦 Enviar a Pendiente por recepción» (fase 3): un servicio a crédito va a
-- «Pendiente por realizar» y el aviso es para Compras, no para el almacén.
create or replace function public.compras_enviar_credito_a_recepcion(p_id bigint)
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
    raise exception 'El crédito lo manda a recepción quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.estado <> 'cuenta_abierta' then
    raise exception 'Solo aplica a créditos con cuenta abierta.' using errcode = '55000';
  end if;
  if v_o.recibida_en is not null then
    raise exception 'La mercancía ya fue recibida.' using errcode = '55000';
  end if;

  update public.compras_ordenes
     set estado = 'por_recibir',
         historial = historial || private.compras_evento('credito_a_recepcion', jsonb_build_object(
           'abonado', abonado_total,
           'monto_a_pagar', private.compras_monto_a_pagar(v_o),
           'saldo', private.compras_saldo_credito(v_o)))
   where id = p_id
  returning * into v_o;

  if v_o.clase = 'servicio' then
    perform private.compras_avisar(v_o, 'SERVICIO_POR_REALIZAR',
      format('Servicio %s (crédito) · pendiente por realizar', v_o.codigo), array['COMPRAS']);
  else
    perform private.compras_avisar_por_recibir(v_o,
      format('OC %s (crédito) · pendiente por recepción en el Almacén General', coalesce(v_o.oc_codigo, v_o.codigo)));
  end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. 🛒 Solicitud de Mercado (MGG `SolicitudMercadoModal`)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Una SP de productos con la finalidad «PEDIDO PARA RESTABLECER EL MERCADO»,
  clasificación «Mercado», URGENTE y en «Pendiente» (no pasa por el almacén,
  MGG `crearOrden`). La unidad y quien solicita vienen precargadas con
  COCINA y se pueden cambiar; «Solicitado por» es un texto (la cocina no es
  una persona). La nota es opcional.
*/
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
    (private.siguiente_numero('SP'), 'producto', 'pendiente',
     (select auth.uid()), private.compras_mi_nombre(), v_qid, coalesce(v_quien, v_unidad),
     v_unidad, v_items, private.compras_total_items(v_items),
     nullif(btrim(coalesce(p_notas, '')), ''), 'PEDIDO PARA RESTABLECER EL MERCADO', array['Mercado'], true,
     private.almacen_que_revisa_pedidos(),
     private.compras_evento('creada', jsonb_build_object('detalle', 'SOLICITUD DE MERCADO · ORDEN URGENTE')))
  returning * into v_o;

  -- MGG: «Solicitud de MERCADO {código} · URGENTE enviada para aprobación».
  perform private.compras_avisar(v_o, 'MERCADO_PENDIENTE',
    format('Solicitud de MERCADO %s · URGENTE enviada para aprobación', v_o.codigo),
    array['COMPRAS'], '/app/pedidos', 'ATENCION');

  return jsonb_build_object('id', v_o.id, 'codigo', v_o.codigo, 'estado', v_o.estado);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. 🔧 Servicio directo (MGG `serviciosDirectos.repository.ts`)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  «Nuevo servicio directo» (MGG `CrearServicioModal` → `crearServicioDirecto`):
  sin montos ni aprobación. p_datos = {lineas: [...], proveedor_id?,
  proveedor_nuevo?: {razon_social, rif}, unidad_solicitante?,
  solicitante_nombre?}. Si todos los renglones son del mismo equipo, el equipo
  queda en la cabecera.
*/
create or replace function public.compras_crear_servicio_directo(p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items  jsonb;
  v_prov   bigint;
  v_pnom   text;
  v_unidad text;
  v_quien  text;
  v_eqs    bigint[];
  v_eq     bigint;
  v_eqn    text;
  v_des    text;
  v_s      public.compras_servicios_directos;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'El servicio directo lo registra quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos del servicio.' using errcode = '22023';
  end if;

  v_items := private.compras_normalizar_items_directo(p_datos -> 'lineas');

  if jsonb_typeof(p_datos -> 'proveedor_nuevo') = 'object'
     and nullif(btrim(coalesce(p_datos -> 'proveedor_nuevo' ->> 'razon_social', '')), '') is not null then
    v_prov := private.compras_proveedor_rapido(p_datos -> 'proveedor_nuevo');
  else
    v_prov := private.compras_numero(p_datos ->> 'proveedor_id', 'El proveedor')::bigint;
    if v_prov is not null and not exists (select 1 from public.proveedores p where p.id = v_prov and p.activo) then
      raise exception 'Ese proveedor no existe o está inactivo.' using errcode = '23503';
    end if;
  end if;
  select p.nombre into v_pnom from public.proveedores p where p.id = v_prov;

  v_unidad := private.compras_asegurar_unidad(p_datos ->> 'unidad_solicitante');
  v_quien := private.en_mayuscula(nullif(btrim(coalesce(p_datos ->> 'solicitante_nombre', '')), ''));
  if length(coalesce(v_quien, '')) > 80 then
    raise exception 'Quien lo solicita va en 80 letras como mucho.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct (i ->> 'equipo_id')::bigint), '{}') into v_eqs
    from jsonb_array_elements(v_items) i where (i ->> 'equipo_id') is not null;
  if cardinality(v_eqs) = 1 then
    v_eq := v_eqs[1];
    select i ->> 'equipo_nombre' into v_eqn from jsonb_array_elements(v_items) i
     where (i ->> 'equipo_id')::bigint = v_eq limit 1;
  end if;

  v_des := case when jsonb_array_length(v_items) = 1 then v_items -> 0 ->> 'descripcion'
                else format('%s SERVICIOS', jsonb_array_length(v_items)) end;

  insert into public.compras_servicios_directos
    (codigo, descripcion, proveedor_id, proveedor_nombre, equipo_id, equipo_nombre, cantidad, items,
     unidad_solicitante, solicitante_nombre, creado_por, creado_por_nombre, historial)
  values
    (private.siguiente_numero('SVD'), v_des, v_prov, v_pnom, v_eq, v_eqn,
     (select coalesce(sum((i ->> 'cantidad')::numeric), 0) from jsonb_array_elements(v_items) i), v_items,
     v_unidad, v_quien, (select auth.uid()), private.compras_mi_nombre(),
     private.compras_evento('creada', jsonb_strip_nulls(jsonb_build_object(
       'detalle', format('%s servicio(s)', jsonb_array_length(v_items)), 'proveedor', v_pnom))))
  returning * into v_s;

  -- MGG: «Servicio directo creado · n servicio(s)[ · proveedor]».
  perform private.compras_sd_avisar(v_s, 'SERVICIO_DIRECTO_CREADO',
    format('Servicio directo creado · %s servicio(s)%s', jsonb_array_length(v_items),
      case when v_pnom is not null then ' · ' || v_pnom else '' end));

  return jsonb_build_object('id', v_s.id, 'codigo', v_s.codigo, 'estado', v_s.estado);
end;
$$;

/*
  «✎ Detalle» (MGG `DetalleEditModal` → `guardarDetalleServicioDirecto`): las
  piezas y trabajos de cada renglón, en cualquier estado, sin tocar montos.
  p_detalles = [[{descripcion, cantidad, precio}], …] en el orden de los renglones.
*/
create or replace function public.compras_detalle_servicio_directo(p_id bigint, p_detalles jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s     public.compras_servicios_directos;
  v_items jsonb;
begin
  perform private.exigir_usuario_activo();
  if not private.compras_gestiona() then
    raise exception 'El detalle lo edita quien lleva Compras (Compras en total) o un administrador.' using errcode = '42501';
  end if;

  select s.* into v_s from public.compras_servicios_directos s where s.id = p_id for update;
  if v_s.id is null then
    raise exception 'Ese servicio directo no existe o fue eliminado.' using errcode = 'P0002';
  end if;
  if p_detalles is null or jsonb_typeof(p_detalles) <> 'array'
     or jsonb_array_length(p_detalles) <> jsonb_array_length(v_s.items) then
    raise exception 'El detalle va por cada renglón del servicio.' using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_strip_nulls(
           (i - 'detalle_items')
           || jsonb_build_object('detalle_items', nullif(private.compras_limpiar_detalle(p_detalles -> (n::integer - 1)), '[]'::jsonb)))
         order by n)
    into v_items
    from jsonb_array_elements(v_s.items) with ordinality as e(i, n);

  update public.compras_servicios_directos
     set items = v_items,
         historial = historial || private.compras_evento('detalle_editado')
   where id = p_id;
end;
$$;

/*
  «Cargar factura y monto» / «✎ Factura/monto» (MGG `MontarServicioModal` →
  `montarServicioDirecto`): el monto de cada renglón y la factura. Queda «Por
  pagar»: falta indicar el método de pago (en MGG va a Tesorería).
  p_datos = {gastos: [n, …], nota, pago_externo, pago_externo_datos,
             facturas: [{path, filename}] (las que se acaban de subir)}
*/
create or replace function public.compras_montar_servicio_directo(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s      public.compras_servicios_directos;
  v_items  jsonb;
  v_total  numeric;
  v_ext    boolean;
  v_extd   text;
  v_f      jsonb;
  v_arch   jsonb;
  v_nuevas jsonb := '[]'::jsonb;
  v_antes  text;
  v_g      numeric;
  v_n      integer := 0;
begin
  perform private.exigir_usuario_activo();
  if not private.compras_gestiona() then
    raise exception 'La factura y el monto los carga quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos del servicio.' using errcode = '22023';
  end if;

  select s.* into v_s from public.compras_servicios_directos s where s.id = p_id for update;
  if v_s.id is null then
    raise exception 'Ese servicio directo no existe o fue eliminado.' using errcode = 'P0002';
  end if;
  if v_s.estado not in ('en_proceso', 'por_pagar') then
    raise exception 'El servicio % ya tiene el método de pago indicado: la factura y el monto ya no se cambian aquí.', v_s.codigo
      using errcode = '55000';
  end if;
  if jsonb_typeof(p_datos -> 'gastos') <> 'array' or jsonb_array_length(p_datos -> 'gastos') <> jsonb_array_length(v_s.items) then
    raise exception 'Indicá cuánto costó cada servicio.' using errcode = '22023';
  end if;

  for v_f in select * from jsonb_array_elements(p_datos -> 'gastos') loop
    v_g := private.compras_numero(v_f #>> '{}', 'El monto');
    if coalesce(v_g, 0) < 0 then
      raise exception 'Los montos no pueden ser negativos.' using errcode = '22023';
    end if;
  end loop;

  select jsonb_agg(i || jsonb_build_object('gasto', round(greatest(coalesce(nullif(p_datos -> 'gastos' ->> (n::integer - 1), '')::numeric, 0), 0), 2))
                   order by n)
    into v_items
    from jsonb_array_elements(v_s.items) with ordinality as e(i, n);
  select round(coalesce(sum((i ->> 'gasto')::numeric), 0), 2) into v_total from jsonb_array_elements(v_items) i;
  if v_total <= 0 then
    raise exception 'Indicá cuánto costó cada servicio.' using errcode = '22023';
  end if;

  v_ext := coalesce((p_datos ->> 'pago_externo')::boolean, false);
  v_extd := nullif(btrim(coalesce(p_datos ->> 'pago_externo_datos', '')), '');
  if v_ext and v_extd is null then
    raise exception 'Ingresá los datos de la persona externa que pagó (para reintegrarle).' using errcode = '22023';
  end if;
  if length(coalesce(v_extd, '')) > 500 or length(coalesce(p_datos ->> 'nota', '')) > 1000 then
    raise exception 'La nota o los datos de quien pagó son demasiado largos.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_datos -> 'facturas') = 'array' then
    for v_f in select * from jsonb_array_elements(p_datos -> 'facturas') loop
      v_arch := private.compras_sd_archivo(v_f, p_id, 'factura');
      v_nuevas := v_nuevas || jsonb_build_array(v_arch || jsonb_build_object('at', now()));
      v_n := v_n + 1;
    end loop;
  end if;
  if jsonb_array_length(v_s.facturas) + v_n > 20 then
    raise exception 'Hasta 20 facturas por servicio.' using errcode = '22023';
  end if;

  v_antes := v_s.estado;

  update public.compras_servicios_directos
     set estado = 'por_pagar',
         items = v_items,
         gasto = v_total,
         nota = nullif(btrim(coalesce(p_datos ->> 'nota', '')), ''),
         pago_externo = v_ext,
         pago_externo_datos = case when v_ext then v_extd end,
         facturas = facturas || v_nuevas,
         montado_por = (select auth.uid()),
         montado_por_nombre = private.compras_mi_nombre(),
         montado_en = now(),
         historial = historial || private.compras_evento('montado', jsonb_strip_nulls(jsonb_build_object(
           'total', v_total,
           'facturas', case when v_n > 0 then v_n end,
           'pago_externo', case when v_ext then true end,
           'edicion', case when v_antes = 'por_pagar' then true end)))
   where id = p_id
  returning * into v_s;

  -- MGG: «Servicio enviado a Tesorería · X por pagar». Aquí falta el método.
  perform private.compras_sd_avisar(v_s, 'SERVICIO_DIRECTO_POR_PAGAR',
    format('Servicio directo %s · %s por pagar · falta indicar el método de pago', v_s.codigo, private.compras_monto_txt(v_total)),
    array['COMPRAS'], 'ATENCION');

  return jsonb_build_object('id', v_s.id, 'estado', v_s.estado, 'gasto', v_total);
end;
$$;

/*
  «💳 Indicar método de pago» y «💳 Editar método de pago / datos» del
  servicio directo: lo que en MGG hace Tesorería, con el esquema de la fase 3.
  Desde «Por pagar» pasa a «Confirmado pagar»; en «Confirmado pagar» corrige
  sin moverlo. El teléfono de administración y los datos de pago van a la
  ficha del proveedor si hay proveedor.
  p_datos = {metodos, numero_administracion, comprobante_tipo, retenciones,
             descuento_pago, qr}
*/
create or replace function public.compras_metodo_pago_servicio_directo(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s       public.compras_servicios_directos;
  v_corrige boolean;
  v_tel     text;
  v_metodos jsonb;
  v_doc     text;
  v_desc    numeric;
  v_ret     jsonb;
  v_qr      jsonb;
  v_monto   numeric;
  v_antes   jsonb;
begin
  perform private.exigir_usuario_activo();
  if not private.compras_gestiona() then
    raise exception 'El método de pago lo indica quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos del pago.' using errcode = '22023';
  end if;

  select s.* into v_s from public.compras_servicios_directos s where s.id = p_id for update;
  if v_s.id is null then
    raise exception 'Ese servicio directo no existe o fue eliminado.' using errcode = 'P0002';
  end if;
  if v_s.estado not in ('por_pagar', 'confirmada_pagar') or v_s.pagada_en is not null then
    raise exception 'El método de pago se indica con el servicio «Por pagar» (está en «%»).', v_s.estado using errcode = '55000';
  end if;
  v_corrige := v_s.estado = 'confirmada_pagar';

  v_antes := jsonb_strip_nulls(jsonb_build_object(
    'metodos', v_s.metodo_pago, 'comprobante', v_s.comprobante_tipo, 'retenciones', v_s.retenciones,
    'numero_administracion', v_s.numero_administracion, 'monto_a_pagar', private.compras_sd_monto_a_pagar(v_s)));

  -- Los errores, en el orden de MGG. Sin proveedor no hay ficha que guarde el teléfono.
  if v_s.proveedor_id is not null then
    v_tel := private.compras_telefono_admin(p_datos ->> 'numero_administracion');
  else
    v_tel := nullif(btrim(coalesce(p_datos ->> 'numero_administracion', '')), '');
  end if;
  v_metodos := private.compras_normalizar_metodos(p_datos -> 'metodos', v_s.proveedor_id, false);

  v_doc := coalesce(nullif(btrim(coalesce(p_datos ->> 'comprobante_tipo', '')), ''), 'factura');
  if v_doc not in ('factura', 'nota_entrega') then
    raise exception 'Elegí el documento: Factura o Nota de entrega.' using errcode = '22023';
  end if;

  if v_corrige then
    v_desc := coalesce(v_s.descuento_pago, 0);
  else
    v_desc := round(greatest(coalesce(private.compras_numero(p_datos ->> 'descuento_pago', 'El descuento'), 0), 0), 2);
  end if;
  if v_desc > coalesce(v_s.gasto, 0) then
    raise exception 'El descuento no puede superar el total del servicio.' using errcode = '22023';
  end if;

  v_s.comprobante_tipo := v_doc;
  v_s.descuento_pago := nullif(v_desc, 0);
  v_ret := case when v_doc = 'factura'
                then private.compras_sd_retenciones(v_s, coalesce(p_datos -> 'retenciones', '[]'::jsonb), true)
                else '[]'::jsonb end;
  v_s.retenciones := v_ret;
  if private.compras_suma_retenciones(v_ret) > round(coalesce(v_s.gasto, 0) - v_desc, 2) then
    raise exception 'Las retenciones no pueden superar el monto a pagar.' using errcode = '22023';
  end if;

  v_metodos := private.compras_normalizar_metodos(p_datos -> 'metodos', v_s.proveedor_id, v_s.proveedor_id is not null);
  if not v_corrige then
    v_qr := private.compras_sd_archivo(p_datos -> 'qr', p_id, 'qr');
  end if;
  v_monto := private.compras_sd_monto_a_pagar(v_s);

  if v_s.proveedor_id is not null and v_tel is not null then
    update public.proveedores
       set numero_administracion = v_tel
     where id = v_s.proveedor_id and numero_administracion is distinct from v_tel;
  end if;

  update public.compras_servicios_directos
     set estado = 'confirmada_pagar',
         metodo_pago = v_metodos,
         metodo_pago_por = (select auth.uid()),
         metodo_pago_por_nombre = private.compras_mi_nombre(),
         metodo_pago_en = now(),
         comprobante_tipo = v_doc,
         retenciones = v_ret,
         descuento_pago = nullif(v_desc, 0),
         numero_administracion = v_tel,
         pago_qr_path = case when v_corrige then pago_qr_path else v_qr ->> 'path' end,
         pago_qr_nombre = case when v_corrige then pago_qr_nombre else v_qr ->> 'filename' end,
         historial = historial || private.compras_evento(
           case when v_corrige then 'metodo_pago_corregido' else 'metodo_pago' end,
           jsonb_strip_nulls(jsonb_build_object(
             'metodos', v_metodos,
             'comprobante', v_doc,
             'retenciones', v_ret,
             'total_retenciones', private.compras_suma_retenciones(v_ret),
             'descuento_pago', nullif(v_desc, 0),
             'total', v_s.gasto,
             'monto_a_pagar', v_monto,
             'numero_administracion', v_tel,
             'antes', case when v_corrige then v_antes end)))
   where id = p_id
  returning * into v_s;

  perform private.compras_sd_avisar(v_s,
    case when v_corrige then 'SERVICIO_DIRECTO_METODO_CORREGIDO' else 'SERVICIO_DIRECTO_POR_PAGAR' end,
    format('Servicio directo %s %s · monto a pagar %s', v_s.codigo,
      case when v_corrige then '· método de pago corregido' else 'enviado para pagar' end, private.compras_monto_txt(v_monto)),
    array['COMPRAS', 'GERENTE_GENERAL'], case when v_corrige then 'INFO' else 'ATENCION' end);

  return jsonb_build_object('id', v_s.id, 'estado', v_s.estado, 'monto_a_pagar', v_monto);
end;
$$;

/*
  «💵 Marcar pagado» del servicio directo (MGG `pagarServicioDirecto`, que es
  de Tesorería): fecha, referencia, monto y el comprobante, que se puede subir
  o no. Lo registra quien aprueba la OC. Queda «Finalizado».
  p_datos = {fecha, referencia, monto, moneda, tasa, comprobante, nota}
*/
create or replace function public.compras_pagar_servicio_directo(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s    public.compras_servicios_directos;
  v_p    record;
  v_ref  text;
  v_comp jsonb;
  v_debe numeric;
  v_tol  numeric;
  v_efe  boolean;
begin
  perform private.exigir_usuario_activo();
  if not private.compras_aprueba_oc() then
    raise exception 'El pago lo registra un usuario autorizado para aprobar órdenes de compra o quien lleva Compras.'
      using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos del pago.' using errcode = '22023';
  end if;

  select s.* into v_s from public.compras_servicios_directos s where s.id = p_id for update;
  if v_s.id is null then
    raise exception 'Ese servicio directo no existe o fue eliminado.' using errcode = 'P0002';
  end if;
  if v_s.estado <> 'confirmada_pagar' or v_s.pagada_en is not null then
    raise exception 'Solo se paga un servicio en «Confirmado pagar» (está en «%»).', v_s.estado using errcode = '55000';
  end if;

  select * into v_p from private.compras_leer_pago(p_datos);

  v_efe := coalesce(jsonb_array_length(v_s.metodo_pago), 0) > 0
           and not exists (select 1 from jsonb_array_elements(v_s.metodo_pago) l
                            where l ->> 'metodo' not in ('divisas_efectivo', 'efectivo_bs'));
  v_ref := nullif(btrim(coalesce(p_datos ->> 'referencia', '')), '');
  if v_ref is null and not v_efe then
    raise exception 'Indicá la referencia del pago.' using errcode = '22023';
  end if;
  if length(coalesce(v_ref, '')) > 80 then
    raise exception 'La referencia va en 80 letras como mucho.' using errcode = '22023';
  end if;

  v_debe := private.compras_sd_monto_a_pagar(v_s);
  v_tol := case when v_p.o_moneda = 'Bs' then greatest(0.01, round(v_debe * 0.01, 2)) else 0.01 end;
  if v_p.o_monto_usd < v_debe - v_tol then
    raise exception 'Lo pagado (%) no cubre el monto a pagar (%).',
      private.compras_monto_txt(v_p.o_monto_usd), private.compras_monto_txt(v_debe) using errcode = '22023';
  end if;

  v_comp := private.compras_sd_archivo(p_datos -> 'comprobante', p_id, 'pago');

  update public.compras_servicios_directos
     set estado = 'finalizada',
         pagada_por = (select auth.uid()),
         pagada_por_nombre = private.compras_mi_nombre(),
         pagada_en = now(),
         finalizada_en = now(),
         pago_fecha = v_p.o_fecha,
         pago_referencia = v_ref,
         pago_monto = v_p.o_monto,
         pago_moneda = v_p.o_moneda,
         pago_tasa = v_p.o_tasa,
         pago_monto_usd = v_p.o_monto_usd,
         pago_comprobante_path = v_comp ->> 'path',
         pago_comprobante_nombre = v_comp ->> 'filename',
         pago_nota = private.en_mayuscula(nullif(btrim(coalesce(p_datos ->> 'nota', '')), '')),
         historial = historial || private.compras_evento('pagada', jsonb_strip_nulls(jsonb_build_object(
           'fecha', v_p.o_fecha,
           'referencia', v_ref,
           'monto', v_p.o_monto,
           'moneda', v_p.o_moneda,
           'tasa', v_p.o_tasa,
           'monto_usd', v_p.o_monto_usd,
           'monto_a_pagar', v_debe,
           'comprobante_path', v_comp ->> 'path',
           'comprobante_nombre', v_comp ->> 'filename',
           'a', 'finalizada')))
   where id = p_id
  returning * into v_s;

  -- MGG: «Servicio directo X pagado · Y».
  perform private.compras_sd_avisar(v_s, 'SERVICIO_DIRECTO_PAGADO',
    format('Servicio directo %s pagado · %s', v_s.codigo, private.compras_monto_txt(v_p.o_monto_usd)),
    array['COMPRAS', 'GERENTE_GENERAL']);

  return jsonb_build_object('id', v_s.id, 'estado', v_s.estado, 'monto_usd', v_p.o_monto_usd);
end;
$$;

/*
  «✎ Editar montos» de un servicio ya finalizado (MGG `EditarMontosModal` →
  `editarServicioDirectoFinalizado`). En MGG reajusta el egreso de Tesorería;
  aquí no hay egreso: queda el monto nuevo y, en la trazabilidad, el de antes
  y el pago registrado, que no cambia. Las retenciones en % se ponen al día.
  p_datos = {gastos: [n, …], nota, pago_externo, pago_externo_datos}
*/
create or replace function public.compras_editar_montos_servicio_directo(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s     public.compras_servicios_directos;
  v_items jsonb;
  v_total numeric;
  v_ext   boolean;
  v_extd  text;
  v_f     jsonb;
  v_g     numeric;
  v_antes numeric;
begin
  perform private.exigir_usuario_activo();
  if not private.compras_gestiona() then
    raise exception 'Los montos los corrige quien lleva Compras (Compras en total) o un administrador.' using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos.' using errcode = '22023';
  end if;

  select s.* into v_s from public.compras_servicios_directos s where s.id = p_id for update;
  if v_s.id is null then
    raise exception 'Ese servicio directo no existe o fue eliminado.' using errcode = 'P0002';
  end if;
  if v_s.estado <> 'finalizada' then
    raise exception 'Solo se edita un servicio ya finalizado.' using errcode = '55000';
  end if;
  if jsonb_typeof(p_datos -> 'gastos') <> 'array' or jsonb_array_length(p_datos -> 'gastos') <> jsonb_array_length(v_s.items) then
    raise exception 'Indicá el monto de cada renglón.' using errcode = '22023';
  end if;
  for v_f in select * from jsonb_array_elements(p_datos -> 'gastos') loop
    v_g := private.compras_numero(v_f #>> '{}', 'El monto');
    if coalesce(v_g, 0) < 0 then
      raise exception 'Los montos no pueden ser negativos.' using errcode = '22023';
    end if;
  end loop;

  select jsonb_agg(i || jsonb_build_object('gasto', round(greatest(coalesce(nullif(p_datos -> 'gastos' ->> (n::integer - 1), '')::numeric, 0), 0), 2))
                   order by n)
    into v_items
    from jsonb_array_elements(v_s.items) with ordinality as e(i, n);
  select round(coalesce(sum((i ->> 'gasto')::numeric), 0), 2) into v_total from jsonb_array_elements(v_items) i;
  if v_total <= 0 then
    raise exception 'El total debe ser mayor que 0.' using errcode = '22023';
  end if;

  v_ext := coalesce((p_datos ->> 'pago_externo')::boolean, false);
  v_extd := nullif(btrim(coalesce(p_datos ->> 'pago_externo_datos', '')), '');
  if v_ext and v_extd is null then
    raise exception 'Ingresá los datos de la persona externa que pagó.' using errcode = '22023';
  end if;

  v_antes := v_s.gasto;
  v_s.gasto := v_total;

  update public.compras_servicios_directos
     set items = v_items,
         gasto = v_total,
         retenciones = private.compras_sd_retenciones(v_s, retenciones, false),
         nota = nullif(btrim(coalesce(p_datos ->> 'nota', '')), ''),
         pago_externo = v_ext,
         pago_externo_datos = case when v_ext then v_extd end,
         historial = historial || private.compras_evento('montos_editados', jsonb_build_object(
           'antes', v_antes, 'total', v_total, 'pagado', pago_monto_usd))
   where id = p_id
  returning * into v_s;

  return jsonb_build_object('id', v_s.id, 'gasto', v_total);
end;
$$;

/*
  «🧾 Facturas» (MGG `FacturasModal` → `gestionarFacturasServicio`): la lista
  final. Las que se quitan las borra la pantalla del depósito después; se
  devuelven para eso.
*/
create or replace function public.compras_facturas_servicio_directo(p_id bigint, p_facturas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s      public.compras_servicios_directos;
  v_f      jsonb;
  v_arch   jsonb;
  v_lista  jsonb := '[]'::jsonb;
  v_quitar jsonb;
begin
  perform private.exigir_usuario_activo();
  if not private.compras_gestiona() then
    raise exception 'Las facturas las carga quien lleva Compras (Compras en total) o un administrador.' using errcode = '42501';
  end if;

  select s.* into v_s from public.compras_servicios_directos s where s.id = p_id for update;
  if v_s.id is null then
    raise exception 'Ese servicio directo no existe o fue eliminado.' using errcode = 'P0002';
  end if;
  if p_facturas is null or jsonb_typeof(p_facturas) <> 'array' then
    raise exception 'Las facturas van en una lista.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_facturas) > 20 then
    raise exception 'Hasta 20 facturas por servicio.' using errcode = '22023';
  end if;

  for v_f in select * from jsonb_array_elements(p_facturas) loop
    v_arch := private.compras_sd_archivo(v_f, p_id, 'factura');
    v_lista := v_lista || jsonb_build_array(v_arch || jsonb_build_object(
      'at', coalesce((select a -> 'at' from jsonb_array_elements(v_s.facturas) a where a ->> 'path' = v_arch ->> 'path' limit 1),
                     to_jsonb(now()))));
  end loop;

  select coalesce(jsonb_agg(a ->> 'path'), '[]'::jsonb) into v_quitar
    from jsonb_array_elements(v_s.facturas) a
   where not exists (select 1 from jsonb_array_elements(v_lista) b where b ->> 'path' = a ->> 'path');

  update public.compras_servicios_directos
     set facturas = v_lista,
         historial = historial || private.compras_evento('facturas_actualizadas', jsonb_build_object(
           'facturas', jsonb_array_length(v_lista), 'quitadas', jsonb_array_length(v_quitar)))
   where id = p_id;

  return v_quitar;
end;
$$;

/*
  «🗑 Eliminar» (MGG `eliminarServicioDirecto`): un servicio finalizado no se
  elimina (registro definitivo). Devuelve los archivos para que la pantalla
  los saque del depósito. La auditoría guarda la fila borrada.
*/
create or replace function public.compras_eliminar_servicio_directo(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s     public.compras_servicios_directos;
  v_paths jsonb;
begin
  perform private.exigir_usuario_activo();
  if not private.compras_gestiona() then
    raise exception 'El servicio directo lo elimina quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;

  select s.* into v_s from public.compras_servicios_directos s where s.id = p_id for update;
  if v_s.id is null then
    raise exception 'Ese servicio directo no existe o fue eliminado.' using errcode = 'P0002';
  end if;
  if v_s.estado = 'finalizada' or v_s.pagada_en is not null then
    raise exception 'No se puede eliminar un servicio directo FINALIZADO.' using errcode = '55000';
  end if;

  select coalesce(jsonb_agg(p), '[]'::jsonb) into v_paths
    from (select a ->> 'path' as p from jsonb_array_elements(v_s.facturas) a
          union all select v_s.pago_qr_path where v_s.pago_qr_path is not null) t;

  delete from public.compras_servicios_directos where id = p_id;

  perform private.notificar('COMPRAS', 'SERVICIO_DIRECTO_ELIMINADO',
    format('Servicio directo eliminado: %s', v_s.codigo), v_s.descripcion,
    '/app/pedidos?scope=servicio_directo', array['COMPRAS'], 'INFO');

  return v_paths;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Los archivos del servicio directo: un depósito privado
-- ═══════════════════════════════════════════════════════════════════════════

-- Rutas `{id}/{factura|pago|qr}-{nonce}-{archivo}`. Se ven con Compras; los
-- sube y los borra quien lleva Compras (el comprobante, también quien
-- aprueba la OC). PDF o imagen, 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compras-servicios-directos', 'compras-servicios-directos', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists compras_sd_archivos_lectura on storage.objects;
drop policy if exists compras_sd_archivos_subida on storage.objects;
drop policy if exists compras_sd_archivos_borrado on storage.objects;

create policy compras_sd_archivos_lectura on storage.objects
  for select to authenticated
  using (bucket_id = 'compras-servicios-directos' and private.tiene_permiso('COMPRAS', 'LECTURA'));

create policy compras_sd_archivos_subida on storage.objects
  for insert to authenticated
  with check (bucket_id = 'compras-servicios-directos'
              and private.compras_puede_subir_sd(private.compras_orden_de_ruta(name)));

create policy compras_sd_archivos_borrado on storage.objects
  for delete to authenticated
  using (bucket_id = 'compras-servicios-directos'
         and private.compras_puede_borrar_sd(private.compras_orden_de_ruta(name)));

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. Auditoría y tiempo real
-- ═══════════════════════════════════════════════════════════════════════════

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    return;
  end if;
  insert into public.auditoria_modulos (tabla, modulo) values
    ('compras_categorias_servicio', 'COMPRAS'),
    ('compras_tipos_servicio', 'COMPRAS'),
    ('compras_servicios_directos', 'COMPRAS')
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
  foreach t in array array['compras_categorias_servicio', 'compras_tipos_servicio', 'compras_servicios_directos'] loop
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
    'private.compras_tabla_catalogo(text)',
    'private.compras_numero(text, text)',
    'private.compras_limpiar_detalle(jsonb)',
    'private.compras_equipo(text, text)',
    'private.compras_normalizar_items_servicio(jsonb, jsonb)',
    'private.compras_proveedor_rapido(jsonb)',
    'private.compras_normalizar_items_directo(jsonb)',
    'private.compras_sd_como_orden(public.compras_servicios_directos)',
    'private.compras_sd_monto_a_pagar(public.compras_servicios_directos)',
    'private.compras_sd_retenciones(public.compras_servicios_directos, jsonb, boolean)',
    'private.compras_sd_archivo(jsonb, bigint, text)',
    'private.compras_sd_avisar(public.compras_servicios_directos, text, text, text[], text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- La que lee la política del depósito: la evalúa quien pide el archivo.
revoke all on function private.compras_puede_subir_sd(bigint) from public, anon;
grant execute on function private.compras_puede_subir_sd(bigint) to authenticated;
revoke all on function private.compras_puede_borrar_sd(bigint) from public, anon;
grant execute on function private.compras_puede_borrar_sd(bigint) to authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.compras_proximo_codigo_servicio()',
    'public.compras_equipos_para_servicio()',
    'public.compras_ultima_solicitud_mercado()',
    'public.compras_catalogo_guardar(text, bigint, text)',
    'public.compras_catalogo_activar(text, bigint, boolean)',
    'public.compras_catalogo_eliminar(text, bigint)',
    'public.compras_crear_servicio(jsonb, text, text, text, boolean)',
    'public.compras_editar_servicio(bigint, jsonb, text, text, text, boolean)',
    'public.compras_editar_solicitud(bigint, jsonb, text, text, text, boolean)',
    'public.compras_servicio_realizado(bigint, jsonb)',
    'public.compras_aceptar_oferta(bigint, bigint, jsonb, text, text, jsonb, numeric)',
    'public.compras_aprobar_oc(bigint[])',
    'public.compras_marcar_pagada(bigint, jsonb)',
    'public.compras_enviar_credito_a_recepcion(bigint)',
    'public.compras_crear_solicitud_mercado(jsonb, text, text, text)',
    'public.compras_crear_servicio_directo(jsonb)',
    'public.compras_detalle_servicio_directo(bigint, jsonb)',
    'public.compras_montar_servicio_directo(bigint, jsonb)',
    'public.compras_metodo_pago_servicio_directo(bigint, jsonb)',
    'public.compras_pagar_servicio_directo(bigint, jsonb)',
    'public.compras_editar_montos_servicio_directo(bigint, jsonb)',
    'public.compras_facturas_servicio_directo(bigint, jsonb)',
    'public.compras_eliminar_servicio_directo(bigint)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. Comprobación (no escribe nada)
-- ═══════════════════════════════════════════════════════════════════════════

do $ver$
declare
  t   text;
  v_d jsonb;
  v_s public.compras_servicios_directos;
  v_r jsonb;
begin
  foreach t in array array['public.compras_servicios_directos', 'public.compras_categorias_servicio', 'public.compras_tipos_servicio'] loop
    if has_table_privilege('authenticated', t, 'INSERT')
       or has_table_privilege('authenticated', t, 'UPDATE')
       or has_table_privilege('authenticated', t, 'DELETE') then
      raise exception '% no puede escribirse directo: todo pasa por las funciones.', t;
    end if;
  end loop;

  -- Los tres catálogos y nada más.
  if private.compras_tabla_catalogo('servicio_tipo') <> 'compras_tipos_servicio'
     or private.compras_tabla_catalogo('perfiles') is not null then
    raise exception 'compras_tabla_catalogo no da lo esperado.';
  end if;

  -- El detalle: sin vacíos, cantidades y precios solo si son mayores que cero.
  v_d := private.compras_limpiar_detalle('[{"descripcion":" pastillas ","cantidad":2,"precio":"10.5"},
                                           {"descripcion":"","precio":3},
                                           {"descripcion":"mano de obra","cantidad":0,"precio":0}]'::jsonb);
  if jsonb_array_length(v_d) <> 2 or v_d -> 0 ->> 'descripcion' <> 'PASTILLAS'
     or (v_d -> 0 ->> 'precio')::numeric <> 10.5 or v_d -> 1 ? 'precio' or v_d -> 1 ? 'cantidad' then
    raise exception 'compras_limpiar_detalle no da lo esperado: %', v_d;
  end if;

  -- El monto a pagar de un servicio directo: $100 − $5 de descuento − ISLR 2 % de $100.
  v_s.gasto := 100;
  v_s.descuento_pago := 5;
  v_s.retenciones := '[]'::jsonb;
  v_r := private.compras_sd_retenciones(v_s, '[{"tipo":"ISLR","modo":"porcentaje","valor":2}]'::jsonb, true);
  v_s.retenciones := v_r;
  if (v_r -> 0 ->> 'monto')::numeric <> 2 or private.compras_sd_monto_a_pagar(v_s) <> 93 then
    raise exception 'El monto a pagar del servicio directo no da lo esperado: % / %', v_r, private.compras_sd_monto_a_pagar(v_s);
  end if;

  -- Las funciones que se llaman por posición o nombre desde aquí.
  if to_regprocedure('private.compras_quien_pide(text)') is null
     or to_regprocedure('private.compras_calcular_retenciones(public.compras_ordenes, jsonb, boolean)') is null
     or to_regprocedure('private.compras_normalizar_metodos(jsonb, bigint, boolean)') is null then
    raise exception 'Cambió la firma de un ayudante de las fases 1 a 3: revise esta migración.';
  end if;

  if not exists (select 1 from public.compras_categorias_servicio where activo) then
    raise notice 'No hay categorías de servicio activas: el formulario de servicios no tendrá qué elegir.';
  end if;
end
$ver$;
