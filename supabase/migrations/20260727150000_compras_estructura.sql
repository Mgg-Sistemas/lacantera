-- ============================================================================
-- Compras: estructura
--
-- El tablero tiene siete columnas y cada columna es un estado real, no una
-- etiqueta visual. Una compra nace como pedido y avanza por una sola vía:
--
--   PEDIDO
--     → CONFIRMADA · indicar proveedores      (compras aprueba y pide precios)
--     → CONFIRMAR POR EL GERENTE              (se propone una cotización)
--     → APROBADA · indicar método de pago     (nace la orden de compra)
--     → PAGADA · pendiente por recepcionar    (tesorería pagó)
--
-- y dos salidas que no son fracaso del sistema sino hechos del negocio:
--
--     → CANCELADA
--     → EL PROVEEDOR DESISTIÓ
--
-- La última existe porque aquí se paga antes de recibir. Entre el pago y la
-- entrega hay dinero de la empresa en manos de un tercero, y el sistema tiene
-- que poder decir cuánto y desde hace cuántos días. Una compra que se cae
-- después de pagada no se borra: se queda a la vista con su monto hasta que
-- alguien decida si se recuperó, quedó a favor o se perdió.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Proveedores
-- ---------------------------------------------------------------------------
create table if not exists public.proveedores (
  id                     bigint generated always as identity primary key,
  rif                    text not null unique,
  nombre                 text not null,
  nombre_comercial       text,
  contacto               text,
  telefono               text,
  correo                 text,
  direccion              text,

  condicion_pago         text not null default 'CONTADO'
                         check (condicion_pago in ('CONTADO', 'CREDITO_15', 'CREDITO_30', 'CREDITO_60')),
  moneda_preferida       char(3) not null default 'USD' references public.monedas(codigo),

  -- Un contribuyente especial retiene IVA al pagar. Cambia el monto que sale
  -- de tesorería, así que se sabe desde el registro del proveedor.
  contribuyente_especial boolean not null default false,

  activo                 boolean not null default true,
  notas                  text,
  creado_por             uuid references auth.users(id),
  creado_en              timestamptz not null default now()
);

-- RIF venezolano: letra de tipo + 8 dígitos + dígito verificador.
alter table public.proveedores drop constraint if exists proveedores_rif_formato;
alter table public.proveedores add constraint proveedores_rif_formato
  check (rif ~ '^[VEJPGC]-[0-9]{8}-[0-9]$');

create index if not exists proveedores_nombre_idx on public.proveedores (nombre) where activo;

-- ---------------------------------------------------------------------------
-- Solicitudes de pedido
--
-- Es la tarjeta del tablero. Vive desde que alguien pide hasta que el gerente
-- aprueba; a partir de ahí la que manda es la orden de compra, pero la tarjeta
-- sigue siendo la misma para quien mira el tablero.
-- ---------------------------------------------------------------------------
create table if not exists public.solicitudes_pedido (
  id              bigint generated always as identity primary key,
  numero          text not null unique,
  titulo          text not null,
  justificacion   text not null,
  prioridad       text not null default 'NORMAL' check (prioridad in ('NORMAL', 'ALTA', 'URGENTE')),
  requerida_para  date,
  destino         text,

  estado          text not null default 'BORRADOR' check (estado in (
                    'BORRADOR',               -- se está redactando; solo lo ve quien lo escribe
                    'PEDIDO',                 -- enviado, espera confirmación de compras
                    'CONFIRMADA',             -- confirmada: toca indicar proveedores
                    'POR_CONFIRMAR_GERENTE',  -- hay una cotización propuesta
                    'APROBADA',               -- el gerente aprobó; existe orden de compra
                    'CANCELADA')),

  solicitante_id  uuid not null references auth.users(id),
  creada_en       timestamptz not null default now(),
  enviada_en      timestamptz,

  confirmada_por  uuid references auth.users(id),
  confirmada_en   timestamptz,

  cotizacion_elegida_id bigint,
  propuesta_en    timestamptz,

  aprobada_gg_por uuid references auth.users(id),
  aprobada_gg_en  timestamptz,

  motivo_cancelacion text,
  cancelada_por   uuid references auth.users(id),
  cancelada_en    timestamptz
);

create index if not exists solicitudes_estado_idx      on public.solicitudes_pedido (estado, creada_en desc);
create index if not exists solicitudes_solicitante_idx on public.solicitudes_pedido (solicitante_id, creada_en desc);

create table if not exists public.solicitud_renglones (
  id           bigint generated always as identity primary key,
  solicitud_id bigint not null references public.solicitudes_pedido(id) on delete cascade,
  linea        smallint not null,

  -- Nulo a propósito: se pide mucho que no está en catálogo ("empacadura del
  -- motor de la 966"). Obligar a crear el artículo antes frena el pedido.
  articulo_id  bigint references public.articulos(id),
  descripcion  text not null,
  cantidad     numeric(20,4) not null check (cantidad > 0),
  unidad       text not null references public.unidades(codigo),
  observacion  text,

  unique (solicitud_id, linea)
);

create index if not exists solicitud_renglones_solicitud_idx on public.solicitud_renglones (solicitud_id);

-- ---------------------------------------------------------------------------
-- Cotizaciones
--
-- Bimoneda: `tasa` son bolívares por unidad de la moneda de la cotización
-- (1 si cotiza en Bs) y `tasa_usd` son bolívares por dólar ese mismo día.
-- Con las dos, cualquier monto se expresa en Bs y en USD sin volver a
-- consultar nada. Quedan congeladas en la fila: son la evidencia de con qué
-- tasa se decidió, no el valor de hoy.
-- ---------------------------------------------------------------------------
create table if not exists public.cotizaciones (
  id               bigint generated always as identity primary key,
  solicitud_id     bigint not null references public.solicitudes_pedido(id) on delete cascade,
  proveedor_id     bigint not null references public.proveedores(id),
  numero_proveedor text,
  fecha            date not null default current_date,
  validez_dias     smallint not null default 15 check (validez_dias > 0),
  dias_entrega     smallint check (dias_entrega >= 0),
  condicion_pago   text not null default 'CONTADO'
                   check (condicion_pago in ('CONTADO', 'CREDITO_15', 'CREDITO_30', 'CREDITO_60')),

  moneda           char(3) not null references public.monedas(codigo),
  tasa             numeric(20,10) not null check (tasa > 0),
  tasa_usd         numeric(20,10) not null check (tasa_usd > 0),
  alicuota_iva     numeric(5,2) not null default 16 check (alicuota_iva >= 0 and alicuota_iva <= 100),

  descuento        numeric(20,6) not null default 0 check (descuento >= 0),
  flete            numeric(20,6) not null default 0 check (flete >= 0),

  -- Calculados por disparador desde los renglones. No se escriben a mano.
  subtotal         numeric(20,6) not null default 0,
  base_imponible   numeric(20,6) not null default 0,
  iva              numeric(20,6) not null default 0,
  total            numeric(20,6) not null default 0,

  total_bs         numeric(20,6) generated always as (round(total * tasa, 2)) stored,
  total_usd        numeric(20,6) generated always as (round(total * tasa / tasa_usd, 2)) stored,

  observacion      text,
  registrada_por   uuid references auth.users(id),
  registrada_en    timestamptz not null default now(),

  -- Un proveedor cotiza una vez por solicitud. Si mejora el precio, se corrige
  -- la cotización; dos cotizaciones del mismo proveedor solo confunden.
  unique (solicitud_id, proveedor_id)
);

create index if not exists cotizaciones_solicitud_idx on public.cotizaciones (solicitud_id);

create table if not exists public.cotizacion_renglones (
  id                    bigint generated always as identity primary key,
  cotizacion_id         bigint not null references public.cotizaciones(id) on delete cascade,
  solicitud_renglon_id  bigint not null references public.solicitud_renglones(id) on delete cascade,

  -- Puede diferir de lo pedido: el proveedor vende por caja de 12.
  cantidad              numeric(20,4) not null check (cantidad > 0),
  precio_unitario       numeric(20,6) not null check (precio_unitario >= 0),
  exento_iva            boolean not null default false,
  observacion           text,

  subtotal              numeric(20,6) generated always as (round(cantidad * precio_unitario, 6)) stored,

  unique (cotizacion_id, solicitud_renglon_id)
);

-- La solicitud elegida apunta a una cotización; la cotización apunta a la
-- solicitud. La llave se añade después de crear ambas tablas.
alter table public.solicitudes_pedido drop constraint if exists solicitudes_cotizacion_elegida_fk;
alter table public.solicitudes_pedido add constraint solicitudes_cotizacion_elegida_fk
  foreign key (cotizacion_elegida_id) references public.cotizaciones(id) on delete set null;

-- Recalcula los totales de una cotización desde sus renglones.
create or replace function private.recalcular_cotizacion(p_cotizacion_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_subtotal   numeric(20,6);
  v_gravado    numeric(20,6);
  v_descuento  numeric(20,6);
  v_flete      numeric(20,6);
  v_alicuota   numeric(5,2);
  v_base       numeric(20,6);
  v_iva        numeric(20,6);
begin
  select coalesce(sum(r.subtotal), 0),
         coalesce(sum(r.subtotal) filter (where not r.exento_iva), 0)
    into v_subtotal, v_gravado
  from public.cotizacion_renglones r
  where r.cotizacion_id = p_cotizacion_id;

  select c.descuento, c.flete, c.alicuota_iva
    into v_descuento, v_flete, v_alicuota
  from public.cotizaciones c
  where c.id = p_cotizacion_id;

  -- El descuento se reparte proporcionalmente sobre lo gravado: si se restara
  -- entero de la base, un descuento sobre renglones exentos rebajaría el IVA
  -- que sí se debe.
  if v_subtotal > 0 then
    v_base := round(greatest(v_gravado - v_descuento * (v_gravado / v_subtotal), 0), 6);
  else
    v_base := 0;
  end if;

  -- El flete es parte de la base imponible cuando lo factura el proveedor.
  v_base := v_base + v_flete;
  v_iva  := round(v_base * v_alicuota / 100, 2);

  update public.cotizaciones
     set subtotal       = v_subtotal,
         base_imponible = v_base,
         iva            = v_iva,
         total          = round(v_subtotal - v_descuento + v_flete + v_iva, 2)
   where id = p_cotizacion_id;
end;
$$;

create or replace function private.trg_recalcular_cotizacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.recalcular_cotizacion(coalesce(new.cotizacion_id, old.cotizacion_id));
  return null;
end;
$$;

drop trigger if exists trg_cotizacion_renglones_total on public.cotizacion_renglones;
create trigger trg_cotizacion_renglones_total
  after insert or update or delete on public.cotizacion_renglones
  for each row execute function private.trg_recalcular_cotizacion();

-- ---------------------------------------------------------------------------
-- Órdenes de compra
--
-- Nace del acto de aprobación del gerente general y copia los importes de la
-- cotización aprobada. Copiar y no referenciar es deliberado: la orden es lo
-- que se autorizó pagar, y tiene que seguir diciendo lo mismo aunque alguien
-- corrija la cotización después.
-- ---------------------------------------------------------------------------
create table if not exists public.ordenes_compra (
  id              bigint generated always as identity primary key,
  numero          text not null unique,
  solicitud_id    bigint not null references public.solicitudes_pedido(id),
  cotizacion_id   bigint not null references public.cotizaciones(id),
  proveedor_id    bigint not null references public.proveedores(id),

  estado          text not null default 'POR_INDICAR_PAGO' check (estado in (
                    'POR_INDICAR_PAGO',   -- aprobada; falta decir cómo se paga
                    'EN_TESORERIA',       -- método indicado, esperando el pago
                    'PAGADA_POR_RECIBIR', -- plata fuera, material sin llegar
                    'RECIBIDA_PARCIAL',
                    'RECIBIDA',
                    'PROVEEDOR_DESISTIO',
                    'CANCELADA')),

  moneda          char(3) not null references public.monedas(codigo),
  tasa            numeric(20,10) not null,
  tasa_usd        numeric(20,10) not null,
  subtotal        numeric(20,6) not null,
  descuento       numeric(20,6) not null default 0,
  flete           numeric(20,6) not null default 0,
  iva             numeric(20,6) not null default 0,
  total           numeric(20,6) not null,
  total_bs        numeric(20,6) generated always as (round(total * tasa, 2)) stored,
  total_usd       numeric(20,6) generated always as (round(total * tasa / tasa_usd, 2)) stored,

  dias_entrega    smallint,
  entrega_estimada date,

  creada_por      uuid references auth.users(id),
  creada_en       timestamptz not null default now(),
  aprobada_gg_por uuid references auth.users(id),
  aprobada_gg_en  timestamptz,

  fecha_pago      date,
  pagada_en       timestamptz,
  recibida_en     timestamptz,

  -- El proveedor desistió: qué pasó y qué se hizo con el dinero.
  -- `resolucion` arranca en PENDIENTE a propósito. Mientras esté ahí, la
  -- tarjeta sigue en el tablero: el dinero no se da por perdido en silencio.
  desistio_motivo    text,
  desistio_en        timestamptz,
  desistio_resolucion text check (desistio_resolucion in
                       ('PENDIENTE', 'REEMBOLSADO', 'SALDO_FAVOR', 'PERDIDA')),
  desistio_resuelto_en timestamptz,
  desistio_nota      text,

  motivo_cancelacion text,
  cancelada_en    timestamptz
);

create index if not exists ordenes_estado_idx    on public.ordenes_compra (estado, creada_en desc);
create index if not exists ordenes_proveedor_idx on public.ordenes_compra (proveedor_id);
create index if not exists ordenes_por_recibir_idx on public.ordenes_compra (fecha_pago)
  where estado in ('PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL', 'PROVEEDOR_DESISTIO');

create table if not exists public.orden_renglones (
  id                   bigint generated always as identity primary key,
  orden_id             bigint not null references public.ordenes_compra(id) on delete cascade,
  linea                smallint not null,
  articulo_id          bigint references public.articulos(id),
  descripcion          text not null,
  cantidad             numeric(20,4) not null check (cantidad > 0),
  unidad               text not null references public.unidades(codigo),
  precio_unitario      numeric(20,6) not null check (precio_unitario >= 0),
  exento_iva           boolean not null default false,
  subtotal             numeric(20,6) generated always as (round(cantidad * precio_unitario, 6)) stored,

  -- Lo que almacén ha dado por recibido. Lo actualiza el módulo de inventario;
  -- vive aquí porque una orden se cierra cuando todos sus renglones llegaron.
  cantidad_recibida    numeric(20,4) not null default 0 check (cantidad_recibida >= 0),

  unique (orden_id, linea)
);

create index if not exists orden_renglones_orden_idx on public.orden_renglones (orden_id);

-- ---------------------------------------------------------------------------
-- Instrucciones de pago
--
-- Una orden puede pagarse en varias partes (mitad ahora, mitad al entregar),
-- así que la instrucción es una tabla, no unas columnas de la orden.
--
-- Los datos de cada método se guardan en columnas propias y no en un JSON: un
-- número de cuenta mal puesto se paga con dinero, y una columna con
-- restricción se puede verificar; un JSON no.
-- ---------------------------------------------------------------------------
create table if not exists public.instrucciones_pago (
  id             bigint generated always as identity primary key,
  orden_id       bigint not null references public.ordenes_compra(id) on delete cascade,

  metodo         text not null check (metodo in ('TRANSFERENCIA', 'PAGO_MOVIL', 'BINANCE', 'EFECTIVO')),
  moneda         char(3) not null references public.monedas(codigo),
  monto          numeric(20,6) not null check (monto > 0),
  tasa           numeric(20,10) not null check (tasa > 0),
  tasa_usd       numeric(20,10) not null check (tasa_usd > 0),
  monto_bs       numeric(20,6) generated always as (round(monto * tasa, 2)) stored,
  monto_usd      numeric(20,6) generated always as (round(monto * tasa / tasa_usd, 2)) stored,

  -- IGTF: 3% sobre pagos en moneda distinta al bolívar, incluidos los pagos
  -- en criptoactivos. Un pago móvil o una transferencia en Bs no lo causan.
  igtf_alicuota  numeric(5,2) not null default 3 check (igtf_alicuota >= 0),
  igtf_aplica    boolean not null default false,
  igtf_monto     numeric(20,6) generated always as (
                   case when igtf_aplica then round(monto * igtf_alicuota / 100, 2) else 0 end
                 ) stored,

  -- Datos del destino. Cuáles son obligatorios depende del método; lo impone
  -- la restricción de más abajo.
  banco          text,
  numero_cuenta  text,
  titular        text,
  documento      text,   -- cédula o RIF del titular
  telefono       text,   -- pago móvil
  correo_binance text,
  red_cripto     text,   -- TRC20, BEP20, …
  receptor       text,   -- efectivo: quién recibe

  estado         text not null default 'POR_PAGAR'
                 check (estado in ('POR_PAGAR', 'PAGADA', 'DEVUELTA', 'ANULADA')),

  nota           text,
  creada_por     uuid references auth.users(id),
  creada_en      timestamptz not null default now(),

  referencia     text,   -- número de la transacción, lo pone tesorería
  fecha_pago     date,
  pagada_por     uuid references auth.users(id),
  pagada_en      timestamptz,
  motivo_devolucion text
);

create index if not exists instrucciones_orden_idx  on public.instrucciones_pago (orden_id);
create index if not exists instrucciones_estado_idx on public.instrucciones_pago (estado, creada_en desc);

alter table public.instrucciones_pago drop constraint if exists instrucciones_datos_por_metodo;
alter table public.instrucciones_pago add constraint instrucciones_datos_por_metodo check (
  case metodo
    when 'TRANSFERENCIA' then
      banco is not null and numero_cuenta is not null and titular is not null and documento is not null
    when 'PAGO_MOVIL' then
      banco is not null and telefono is not null and documento is not null
    when 'BINANCE' then
      (correo_binance is not null or numero_cuenta is not null) and titular is not null
    when 'EFECTIVO' then
      receptor is not null and documento is not null
  end
);

-- El pago móvil solo existe en bolívares; Binance no liquida en bolívares.
alter table public.instrucciones_pago drop constraint if exists instrucciones_moneda_por_metodo;
alter table public.instrucciones_pago add constraint instrucciones_moneda_por_metodo check (
  (metodo <> 'PAGO_MOVIL' or moneda = 'VES') and
  (metodo <> 'BINANCE'    or moneda <> 'VES')
);

-- Una referencia es obligatoria al marcar pagado, salvo en efectivo.
alter table public.instrucciones_pago drop constraint if exists instrucciones_referencia_al_pagar;
alter table public.instrucciones_pago add constraint instrucciones_referencia_al_pagar check (
  estado <> 'PAGADA' or metodo = 'EFECTIVO' or referencia is not null
);

-- ---------------------------------------------------------------------------
-- Bitácora
--
-- Cada cambio de estado deja rastro con quién y cuándo. Sin esto, "¿quién
-- aprobó esta compra?" no tiene respuesta: el documento solo guarda el último
-- estado, no el camino.
-- ---------------------------------------------------------------------------
create table if not exists public.compras_bitacora (
  id              bigint generated always as identity primary key,
  documento_tipo  text not null check (documento_tipo in ('SOLICITUD', 'COTIZACION', 'ORDEN', 'PAGO')),
  documento_id    bigint not null,
  estado_anterior text,
  estado_nuevo    text not null,
  nota            text,
  actor_id        uuid references auth.users(id),
  ocurrido_en     timestamptz not null default now()
);

create index if not exists bitacora_documento_idx on public.compras_bitacora (documento_tipo, documento_id, ocurrido_en);

create or replace function private.anotar(
  p_tipo   text,
  p_id     bigint,
  p_ant    text,
  p_nuevo  text,
  p_nota   text default null
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.compras_bitacora
    (documento_tipo, documento_id, estado_anterior, estado_nuevo, nota, actor_id)
  values
    (p_tipo, p_id, p_ant, p_nuevo, nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()));
$$;

-- ---------------------------------------------------------------------------
-- Permisos
--
-- Todas estas tablas se leen desde la aplicación y NINGUNA se escribe desde
-- ella. Cada cambio pasa por una función que valida el rol y la transición.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'proveedores', 'solicitudes_pedido', 'solicitud_renglones',
    'cotizaciones', 'cotizacion_renglones', 'ordenes_compra',
    'orden_renglones', 'instrucciones_pago', 'compras_bitacora'
  ] loop
    execute format('alter table public.%I enable row level security', v_tabla);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', v_tabla);
    execute format('grant select on public.%I to authenticated', v_tabla);
    execute format('drop policy if exists %I on public.%I', v_tabla || '_lectura', v_tabla);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      v_tabla || '_lectura', v_tabla);
  end loop;
end
$$;
