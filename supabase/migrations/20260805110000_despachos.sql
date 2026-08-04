-- ============================================================================
-- Despachos: la romana y la guía
--
-- Entre el patio y la calle hay dos papeles que no son de ventas y que hasta
-- ahora se escribían a mano dentro de la nota de entrega: el pesaje y la guía
-- de movilización. Los dos existen aunque no haya venta —se pesa lo que entra,
-- y una guía se emite antes de que el camión cargue—, y por eso viven aparte.
--
-- TRES DECISIONES:
--
-- 1. LA ROMANA PESA TODO, NO SOLO LO QUE SE VENDE. Un ticket puede ser de
--    salida (material que se va) o de entrada (una gandola de gasoil, una
--    recepción de compra). Limitarla a las ventas obligaría a llevar el resto
--    en un cuaderno, que es de donde se está viniendo.
--
-- 2. UN TICKET SE USA UNA VEZ. Un pesaje pertenece a un viaje. Si el mismo
--    ticket pudiera colgarse de dos notas de entrega, el mismo camión estaría
--    justificando dos despachos. Al usarlo queda marcado; al anular la nota,
--    vuelve a quedar libre, porque el camión se pesó igual.
--
-- 3. NINGUNA SALIDA DE MINERAL VIAJA SIN GUÍA. La guía de movilización es lo
--    que hace legal que el camión circule con la piedra. Despachar producto sin
--    guía se rechaza, no se avisa. Quien tenga control total sobre Despachos
--    puede saltarlo —hay días en que el papel llega tarde y el cliente está
--    esperando—, y esa nota queda marcada como despachada sin guía, a la vista
--    de todo el mundo, que es lo contrario de que no se note.
--
-- La guía vencida no es un estado que se guarde: se calcula comparando su
-- vigencia con hoy. Un estado guardado obligaría a que algo lo cambiara todas
-- las noches, y la noche que no corriera, una guía vencida seguiría diciendo
-- que está vigente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tickets de romana
-- ---------------------------------------------------------------------------
create table if not exists public.romana_tickets (
  id             bigint generated always as identity primary key,
  numero         text not null unique,
  fecha          date not null default current_date,
  hora           time,

  tipo           text not null check (tipo in ('SALIDA', 'ENTRADA')),

  vehiculo       text not null,
  chofer         text,
  cedula_chofer  text,
  transportista  text,

  articulo_id    bigint references public.articulos(id),
  cliente_id     bigint references public.clientes(id),
  proveedor_id   bigint references public.proveedores(id),

  peso_bruto     numeric(20,4) not null check (peso_bruto > 0),
  peso_tara      numeric(20,4) not null check (peso_tara >= 0),
  peso_neto      numeric(20,4) generated always as (peso_bruto - peso_tara) stored,

  romana         text,   -- cuál báscula, si hay más de una
  operador       text,
  nota           text,

  estado         text not null default 'LIBRE'
                 check (estado in ('LIBRE', 'USADO', 'ANULADO')),
  nota_entrega_id bigint,   -- la llave se pone abajo, cuando existan las dos

  motivo_anulacion text,
  anulado_por    uuid references auth.users(id),
  anulado_en     timestamptz,

  registrado_por uuid references auth.users(id),
  registrado_en  timestamptz not null default now(),

  constraint romana_bruto_mayor_que_tara check (peso_bruto > peso_tara),
  constraint romana_anulado_con_motivo check (estado <> 'ANULADO' or motivo_anulacion is not null),
  -- Una salida es a un cliente y una entrada es de un proveedor. Al revés no
  -- es un caso raro: es un error de captura.
  constraint romana_destino_segun_tipo check (
    (tipo = 'SALIDA'  and proveedor_id is null) or
    (tipo = 'ENTRADA' and cliente_id is null))
);

create index if not exists romana_libres_idx on public.romana_tickets (estado, fecha desc);
create index if not exists romana_recientes_idx on public.romana_tickets (fecha desc, id desc);

-- ---------------------------------------------------------------------------
-- Guías de movilización
-- ---------------------------------------------------------------------------
create table if not exists public.guias_movilizacion (
  id             bigint generated always as identity primary key,
  numero         text not null unique,        -- el nuestro, para poder nombrarla
  numero_guia    text not null unique,        -- el del ministerio

  fecha_emision  date not null default current_date,
  vigencia_hasta date not null,

  frente_id      bigint references public.frentes_explotacion(id),
  origen         text,        -- la mina, cuando no sale de un frente del sistema
  destino        text not null,

  cliente_id     bigint references public.clientes(id),
  articulo_id    bigint not null references public.articulos(id),
  toneladas      numeric(20,4) not null check (toneladas > 0),

  transportista  text,
  vehiculo       text,
  chofer         text,
  cedula_chofer  text,

  observacion    text,
  estado         text not null default 'VIGENTE'
                 check (estado in ('VIGENTE', 'USADA', 'ANULADA')),
  nota_entrega_id bigint,

  motivo_anulacion text,
  anulada_por    uuid references auth.users(id),
  anulada_en     timestamptz,

  registrada_por uuid references auth.users(id),
  registrada_en  timestamptz not null default now(),

  constraint guias_vigencia_posterior check (vigencia_hasta >= fecha_emision),
  constraint guias_anulada_con_motivo check (estado <> 'ANULADA' or motivo_anulacion is not null)
);

create index if not exists guias_vigentes_idx on public.guias_movilizacion (estado, vigencia_hasta);
create index if not exists guias_recientes_idx on public.guias_movilizacion (fecha_emision desc, id desc);

-- ---------------------------------------------------------------------------
-- La nota de entrega se cuelga de los dos
-- ---------------------------------------------------------------------------
alter table public.notas_entrega
  add column if not exists ticket_id bigint references public.romana_tickets(id),
  add column if not exists guia_id   bigint references public.guias_movilizacion(id);

alter table public.romana_tickets
  drop constraint if exists romana_tickets_nota_entrega_id_fkey;
alter table public.romana_tickets
  add constraint romana_tickets_nota_entrega_id_fkey
  foreign key (nota_entrega_id) references public.notas_entrega(id);

alter table public.guias_movilizacion
  drop constraint if exists guias_movilizacion_nota_entrega_id_fkey;
alter table public.guias_movilizacion
  add constraint guias_movilizacion_nota_entrega_id_fkey
  foreign key (nota_entrega_id) references public.notas_entrega(id);

-- ---------------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------------
create or replace view public.v_romana_tickets
with (security_invoker = on) as
select
  t.*,
  a.nombre as articulo,
  a.unidad,
  c.nombre as cliente,
  p.nombre as proveedor,
  n.numero as nota_entrega
from public.romana_tickets t
left join public.articulos a    on a.id = t.articulo_id
left join public.clientes c     on c.id = t.cliente_id
left join public.proveedores p  on p.id = t.proveedor_id
left join public.notas_entrega n on n.id = t.nota_entrega_id;

grant select on public.v_romana_tickets to authenticated;

create or replace view public.v_guias_movilizacion
with (security_invoker = on) as
select
  g.*,
  a.nombre as articulo,
  a.unidad,
  c.nombre as cliente,
  f.codigo as frente_codigo,
  f.nombre as frente,
  n.numero as nota_entrega,
  -- Vencida se calcula, no se guarda: un estado guardado necesitaría que algo
  -- lo cambiara cada noche, y la noche que no corriera mentiría.
  (g.estado = 'VIGENTE' and g.vigencia_hasta < current_date) as vencida,
  g.vigencia_hasta - current_date as dias_para_vencer
from public.guias_movilizacion g
join public.articulos a  on a.id = g.articulo_id
left join public.clientes c on c.id = g.cliente_id
left join public.frentes_explotacion f on f.id = g.frente_id
left join public.notas_entrega n on n.id = g.nota_entrega_id;

grant select on public.v_guias_movilizacion to authenticated;

-- ---------------------------------------------------------------------------
-- Escribir
-- ---------------------------------------------------------------------------
create or replace function public.registrar_ticket(
  p_tipo          text,
  p_vehiculo      text,
  p_peso_bruto    numeric,
  p_peso_tara     numeric,
  p_articulo_id   bigint default null,
  p_cliente_id    bigint default null,
  p_proveedor_id  bigint default null,
  p_chofer        text default null,
  p_cedula_chofer text default null,
  p_transportista text default null,
  p_romana        text default null,
  p_operador      text default null,
  p_fecha         date default null,
  p_hora          time default null,
  p_nota          text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fecha date := coalesce(p_fecha, current_date);
  v_id    bigint;
begin
  perform private.exigir_permiso('DESPACHOS', 'ESCRITURA');

  if length(trim(coalesce(p_vehiculo, ''))) = 0 then
    raise exception 'Un pesaje sin placa no se puede atribuir a nadie.' using errcode = '22023';
  end if;

  if coalesce(p_peso_bruto, 0) <= coalesce(p_peso_tara, 0) then
    raise exception 'El peso bruto (%) tiene que ser mayor que la tara (%).',
      coalesce(p_peso_bruto, 0), coalesce(p_peso_tara, 0) using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se registra un pesaje con fecha futura.' using errcode = '22023';
  end if;

  insert into public.romana_tickets
    (numero, fecha, hora, tipo, vehiculo, chofer, cedula_chofer, transportista,
     articulo_id, cliente_id, proveedor_id, peso_bruto, peso_tara, romana, operador,
     nota, registrado_por)
  values
    (private.siguiente_numero('TCK'), v_fecha, p_hora, p_tipo, trim(p_vehiculo),
     nullif(trim(coalesce(p_chofer, '')), ''), nullif(trim(coalesce(p_cedula_chofer, '')), ''),
     nullif(trim(coalesce(p_transportista, '')), ''),
     p_articulo_id,
     case when p_tipo = 'SALIDA'  then p_cliente_id   end,
     case when p_tipo = 'ENTRADA' then p_proveedor_id end,
     p_peso_bruto, p_peso_tara,
     nullif(trim(coalesce(p_romana, '')), ''), nullif(trim(coalesce(p_operador, '')), ''),
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.anular_ticket(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t record;
begin
  perform private.exigir_permiso('DESPACHOS', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula el pesaje.' using errcode = '22023';
  end if;

  select * into v_t from public.romana_tickets where id = p_id for update;

  if v_t.id is null then
    raise exception 'No existe el ticket %.', p_id using errcode = 'P0002';
  end if;

  if v_t.estado = 'ANULADO' then
    raise exception 'El ticket % ya estaba anulado.', v_t.numero using errcode = '55000';
  end if;

  if v_t.estado = 'USADO' then
    raise exception 'El ticket % está en la nota de entrega. Anula primero la nota.', v_t.numero
      using errcode = '55000';
  end if;

  update public.romana_tickets
     set estado = 'ANULADO',
         motivo_anulacion = trim(p_motivo),
         anulado_por = (select auth.uid()),
         anulado_en = now()
   where id = p_id;
end;
$$;

create or replace function public.registrar_guia(
  p_numero_guia    text,
  p_vigencia_hasta date,
  p_destino        text,
  p_articulo_id    bigint,
  p_toneladas      numeric,
  p_cliente_id     bigint default null,
  p_frente_id      bigint default null,
  p_origen         text default null,
  p_transportista  text default null,
  p_vehiculo       text default null,
  p_chofer         text default null,
  p_cedula_chofer  text default null,
  p_fecha_emision  date default null,
  p_observacion    text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fecha date := coalesce(p_fecha_emision, current_date);
  v_id    bigint;
begin
  perform private.exigir_permiso('DESPACHOS', 'ESCRITURA');

  if length(trim(coalesce(p_numero_guia, ''))) = 0 then
    raise exception 'La guía necesita su número, que es el que lleva el papel del ministerio.'
      using errcode = '22023';
  end if;

  if length(trim(coalesce(p_destino, ''))) = 0 then
    raise exception 'La guía necesita el destino: una guía ampara un viaje a un sitio.'
      using errcode = '22023';
  end if;

  if p_vigencia_hasta < v_fecha then
    raise exception 'La guía no puede vencer antes de emitirse.' using errcode = '22023';
  end if;

  if coalesce(p_toneladas, 0) <= 0 then
    raise exception 'La guía tiene que amparar un tonelaje mayor que cero.' using errcode = '22023';
  end if;

  insert into public.guias_movilizacion
    (numero, numero_guia, fecha_emision, vigencia_hasta, frente_id, origen, destino,
     cliente_id, articulo_id, toneladas, transportista, vehiculo, chofer, cedula_chofer,
     observacion, registrada_por)
  values
    (private.siguiente_numero('GMV'), trim(p_numero_guia), v_fecha, p_vigencia_hasta,
     p_frente_id, nullif(trim(coalesce(p_origen, '')), ''), trim(p_destino),
     p_cliente_id, p_articulo_id, p_toneladas,
     nullif(trim(coalesce(p_transportista, '')), ''), nullif(trim(coalesce(p_vehiculo, '')), ''),
     nullif(trim(coalesce(p_chofer, '')), ''), nullif(trim(coalesce(p_cedula_chofer, '')), ''),
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.anular_guia(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_g record;
begin
  perform private.exigir_permiso('DESPACHOS', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula la guía.' using errcode = '22023';
  end if;

  select * into v_g from public.guias_movilizacion where id = p_id for update;

  if v_g.id is null then
    raise exception 'No existe la guía %.', p_id using errcode = 'P0002';
  end if;

  if v_g.estado = 'ANULADA' then
    raise exception 'La guía % ya estaba anulada.', v_g.numero_guia using errcode = '55000';
  end if;

  if v_g.estado = 'USADA' then
    raise exception 'La guía % amparó un despacho. Anula primero la nota de entrega.', v_g.numero_guia
      using errcode = '55000';
  end if;

  update public.guias_movilizacion
     set estado = 'ANULADA',
         motivo_anulacion = trim(p_motivo),
         anulada_por = (select auth.uid()),
         anulada_en = now()
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Despachar, ahora con el pesaje y la guía enganchados
--
-- La firma cambia, así que la anterior se retira: dejar las dos convertiría a
-- `despachar` en dos funciones distintas con el mismo nombre y la aplicación
-- llamaría a cualquiera de ellas.
-- ---------------------------------------------------------------------------
drop function if exists public.despachar(
  bigint, bigint, jsonb, char, bigint, text, text, text, numeric, numeric, text,
  numeric, numeric, numeric, date, text);

create or replace function public.despachar(
  p_cliente_id   bigint,
  p_almacen_id   bigint,
  p_renglones    jsonb,
  p_moneda       char(3) default null,
  p_cotizacion_id bigint default null,
  p_vehiculo     text    default null,
  p_chofer       text    default null,
  p_cedula_chofer text   default null,
  p_peso_bruto   numeric default null,
  p_peso_tara    numeric default null,
  p_ticket       text    default null,
  p_alicuota_iva numeric default null,
  p_descuento    numeric default 0,
  p_flete        numeric default 0,
  p_fecha        date    default null,
  p_observacion  text    default null,
  p_ticket_id    bigint  default null,
  p_guia_id      bigint  default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cliente  record;
  v_almacen  record;
  v_tk       record;
  v_guia     record;
  v_fecha    date := coalesce(p_fecha, current_date);
  v_moneda   char(3);
  v_tasas    record;
  v_id       bigint;
  v_reng     record;
  v_existe   numeric;
  v_costo    numeric;
  v_mov      bigint;
  v_bruto    numeric := p_peso_bruto;
  v_tara     numeric := p_peso_tara;
  v_ticket   text    := nullif(trim(coalesce(p_ticket, '')), '');
  v_vehiculo text    := nullif(trim(coalesce(p_vehiculo, '')), '');
  v_chofer   text    := nullif(trim(coalesce(p_chofer, '')), '');
  v_cedula   text    := nullif(trim(coalesce(p_cedula_chofer, '')), '');
  v_producto boolean;
begin
  perform private.exigir_permiso('VENTAS', 'ESCRITURA');

  select * into v_cliente from public.clientes where id = p_cliente_id;
  if v_cliente.id is null then
    raise exception 'No existe el cliente %.', p_cliente_id using errcode = 'P0002';
  end if;
  if not v_cliente.activo then
    raise exception 'El cliente "%" está inactivo.', v_cliente.nombre using errcode = '22023';
  end if;

  select * into v_almacen from public.almacenes where id = p_almacen_id;
  if v_almacen.id is null then
    raise exception 'No existe el almacén %.', p_almacen_id using errcode = 'P0002';
  end if;
  if not v_almacen.activo then
    raise exception 'El almacén "%" está cerrado.', v_almacen.nombre using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se despacha con fecha futura.' using errcode = '22023';
  end if;

  -- El pesaje. Se cierra el ticket antes de mirarlo: dos notas de entrega
  -- emitidas a la vez podrían colgarse del mismo pesaje.
  if p_ticket_id is not null then
    select * into v_tk from public.romana_tickets where id = p_ticket_id for update;

    if v_tk.id is null then
      raise exception 'No existe el ticket de romana %.', p_ticket_id using errcode = 'P0002';
    end if;
    if v_tk.tipo <> 'SALIDA' then
      raise exception 'El ticket % es de una entrada a la cantera, no de una salida.', v_tk.numero
        using errcode = '22023';
    end if;
    if v_tk.estado <> 'LIBRE' then
      raise exception 'El ticket % está %.', v_tk.numero, lower(v_tk.estado) using errcode = '55000';
    end if;
    if v_tk.cliente_id is not null and v_tk.cliente_id <> p_cliente_id then
      raise exception 'El ticket % se pesó para otro cliente.', v_tk.numero using errcode = '22023';
    end if;

    -- Los pesos salen de la romana, no del teclado: para eso se pesó.
    v_bruto    := v_tk.peso_bruto;
    v_tara     := v_tk.peso_tara;
    v_ticket   := v_tk.numero;
    v_vehiculo := coalesce(v_vehiculo, v_tk.vehiculo);
    v_chofer   := coalesce(v_chofer, v_tk.chofer);
    v_cedula   := coalesce(v_cedula, v_tk.cedula_chofer);
  end if;

  -- La guía.
  if p_guia_id is not null then
    select * into v_guia from public.guias_movilizacion where id = p_guia_id for update;

    if v_guia.id is null then
      raise exception 'No existe la guía %.', p_guia_id using errcode = 'P0002';
    end if;
    if v_guia.estado <> 'VIGENTE' then
      raise exception 'La guía % está %.', v_guia.numero_guia, lower(v_guia.estado)
        using errcode = '55000';
    end if;
    if v_guia.vigencia_hasta < v_fecha then
      raise exception 'La guía % venció el %.', v_guia.numero_guia,
        to_char(v_guia.vigencia_hasta, 'DD/MM/YYYY') using errcode = '55000';
    end if;
    if v_guia.cliente_id is not null and v_guia.cliente_id <> p_cliente_id then
      raise exception 'La guía % se emitió para otro cliente.', v_guia.numero_guia
        using errcode = '22023';
    end if;
  end if;

  v_moneda := coalesce(p_moneda, v_cliente.moneda_preferida);
  select * into v_tasas from private.tasas_del_dia(v_moneda, v_fecha);

  insert into public.notas_entrega
    (numero, cliente_id, cotizacion_id, almacen_id, fecha, vehiculo, chofer,
     cedula_chofer, peso_bruto, peso_tara, ticket_romana, moneda, tasa, tasa_usd,
     alicuota_iva, descuento, flete, observacion, despachada_por, ticket_id, guia_id)
  values
    (private.siguiente_numero('NE'), p_cliente_id, p_cotizacion_id, p_almacen_id,
     v_fecha, v_vehiculo, v_chofer, v_cedula, v_bruto, v_tara, v_ticket,
     v_moneda, v_tasas.tasa, v_tasas.tasa_usd,
     case when v_cliente.exento_iva then 0 else coalesce(p_alicuota_iva, 16) end,
     coalesce(p_descuento, 0), coalesce(p_flete, 0),
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()),
     p_ticket_id, p_guia_id)
  returning id into v_id;

  perform private.cargar_renglones_venta(
    'nota_entrega_renglones', 'nota_id', v_id, p_renglones, v_moneda, v_fecha);

  -- Ninguna salida de mineral viaja sin guía. Se comprueba después de cargar
  -- los renglones porque hasta aquí no se sabía si esta nota lleva producto o
  -- es solo un flete.
  select exists (
    select 1
    from public.nota_entrega_renglones r
    join public.articulos a on a.id = r.articulo_id
    where r.nota_id = v_id and a.categoria = 'PRODUCTO'
  ) into v_producto;

  if v_producto and p_guia_id is null and not private.tiene_permiso('DESPACHOS', 'TOTAL') then
    raise exception 'Este despacho lleva mineral y no tiene guía de movilización. Cárgala en Despachos › Guías, o pídele a quien tenga control total sobre Despachos que lo autorice sin ella.'
      using errcode = '55000';
  end if;

  -- Un cerrojo por casilla de patio —almacén y artículo—, tomados todos antes
  -- de tocar nada y siempre en orden de artículo. En orden porque dos despachos
  -- que pidan las mismas casillas al revés se quedarían esperando el uno al
  -- otro para siempre. No hay fila que bloquear: la existencia se suma del
  -- libro de movimientos, no se guarda en ningún sitio.
  for v_reng in
    select distinct r.articulo_id
    from public.nota_entrega_renglones r
    join public.articulos a on a.id = r.articulo_id
    where r.nota_id = v_id and a.inventariable
    order by r.articulo_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(format('patio:%s:%s', p_almacen_id, v_reng.articulo_id), 0));
  end loop;

  -- Ahora sí el patio. Renglón por renglón, comprobando existencia antes de
  -- restar: sacar más de lo que hay deja el almacén en negativo, y una
  -- existencia negativa no es un dato sino un error que alguien tendrá que
  -- deshacer a mano.
  for v_reng in
    select r.id, r.articulo_id, r.cantidad, a.nombre, a.inventariable
    from public.nota_entrega_renglones r
    join public.articulos a on a.id = r.articulo_id
    where r.nota_id = v_id
    order by r.linea
  loop
    -- Un servicio —un flete— se cobra pero no sale de ningún almacén.
    continue when not v_reng.inventariable;

    v_existe := private.existencia(p_almacen_id, v_reng.articulo_id);

    if v_reng.cantidad > v_existe then
      raise exception 'En "%" hay % de "%" y se están despachando %.',
        v_almacen.nombre, v_existe, v_reng.nombre, v_reng.cantidad
        using errcode = '22023';
    end if;

    v_costo := private.costo_promedio(p_almacen_id, v_reng.articulo_id);

    v_mov := private.registrar_movimiento(
      'SALIDA_DESPACHO', (-1)::smallint, p_almacen_id, v_reng.articulo_id,
      v_reng.cantidad, v_costo,
      format('DESPACHO A %s', v_cliente.nombre), null, null, null, v_fecha);

    update public.nota_entrega_renglones set movimiento_id = v_mov where id = v_reng.id;
  end loop;

  -- Los dos papeles quedan gastados en este viaje.
  if p_ticket_id is not null then
    update public.romana_tickets
       set estado = 'USADO', nota_entrega_id = v_id where id = p_ticket_id;
  end if;

  if p_guia_id is not null then
    update public.guias_movilizacion
       set estado = 'USADA', nota_entrega_id = v_id where id = p_guia_id;
  end if;

  -- Si venía de una cotización, esa cotización quedó aceptada de hecho.
  if p_cotizacion_id is not null then
    update public.cotizaciones_venta
       set estado = 'ACEPTADA', cerrada_por = (select auth.uid()), cerrada_en = now()
     where id = p_cotizacion_id and estado = 'ENVIADA';
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Anular la nota devuelve los dos papeles
--
-- El camión se pesó igual y la guía se emitió igual: si la nota se anula, ese
-- pesaje y esa guía vuelven a estar disponibles para la nota que la corrige.
-- ---------------------------------------------------------------------------
create or replace function public.anular_nota_entrega(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nota record;
  v_reng record;
begin
  perform private.exigir_permiso('VENTAS', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula. Un despacho anulado sin motivo no se puede auditar.'
      using errcode = '22023';
  end if;

  select * into v_nota from public.notas_entrega where id = p_id for update;

  if v_nota.id is null then
    raise exception 'No existe la nota de entrega %.', p_id using errcode = 'P0002';
  end if;

  if v_nota.estado = 'ANULADA' then
    raise exception 'La nota % ya estaba anulada.', v_nota.numero using errcode = '55000';
  end if;

  if v_nota.estado = 'FACTURADA' then
    raise exception 'La nota % ya está en la factura. Anula primero la factura.', v_nota.numero
      using errcode = '55000';
  end if;

  -- Se reversa exactamente lo que esta nota descontó, por su número de
  -- movimiento. Buscar "una salida parecida" devolvería la del camión de al
  -- lado el día que dos despachos coincidan en artículo y cantidad.
  for v_reng in
    select r.movimiento_id, m.almacen_id, m.articulo_id, m.cantidad, m.costo_usd
    from public.nota_entrega_renglones r
    join public.inventario_movimientos m on m.id = r.movimiento_id
    where r.nota_id = p_id and r.movimiento_id is not null
  loop
    perform private.registrar_movimiento(
      'REVERSO', (1)::smallint, v_reng.almacen_id, v_reng.articulo_id,
      v_reng.cantidad, v_reng.costo_usd,
      format('ANULACIÓN DE LA NOTA %s: %s', v_nota.numero, trim(p_motivo)),
      null, null, v_reng.movimiento_id, current_date);
  end loop;

  update public.romana_tickets
     set estado = 'LIBRE', nota_entrega_id = null
   where nota_entrega_id = p_id and estado = 'USADO';

  update public.guias_movilizacion
     set estado = 'VIGENTE', nota_entrega_id = null
   where nota_entrega_id = p_id and estado = 'USADA';

  update public.notas_entrega
     set estado = 'ANULADA',
         motivo_anulacion = trim(p_motivo),
         anulada_por = (select auth.uid()),
         anulada_en = now()
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['romana_tickets', 'guias_movilizacion'] loop
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

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.registrar_ticket(text, text, numeric, numeric, bigint, bigint, bigint, text, text, text, text, text, date, time, text)',
    'public.anular_ticket(bigint, text)',
    'public.registrar_guia(text, date, text, bigint, numeric, bigint, bigint, text, text, text, text, text, date, text)',
    'public.anular_guia(bigint, text)',
    'public.despachar(bigint, bigint, jsonb, char, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)',
    'public.anular_nota_entrega(bigint, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant   execute on function %s to authenticated', v_fn);
  end loop;
end
$$;

insert into public.rol_permisos (rol, modulo, nivel)
values ('ADMIN', 'DESPACHOS', 'TOTAL')
on conflict (rol, modulo) do nothing;

-- Ventas necesita ver la romana y las guías para colgarlas de la nota.
insert into public.rol_permisos (rol, modulo, nivel)
values ('VENTAS', 'DESPACHOS', 'ESCRITURA')
on conflict (rol, modulo) do nothing;

-- ---------------------------------------------------------------------------
-- Los datos, en mayúscula y sin tildes
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla text;
  v_cols  text;
  v_col   text;
  v_mapa  text[][] := array[
    ['romana_tickets',     'vehiculo, chofer, cedula_chofer, transportista, romana, operador, nota, motivo_anulacion'],
    ['guias_movilizacion', 'numero_guia, origen, destino, transportista, vehiculo, chofer, cedula_chofer, observacion, motivo_anulacion']
  ];
begin
  for i in 1 .. array_length(v_mapa, 1) loop
    v_tabla := v_mapa[i][1];
    v_cols  := (select string_agg(format('%L', trim(c)), ', ')
                  from unnest(string_to_array(v_mapa[i][2], ',')) c);

    execute format('drop trigger if exists trg_normalizar on public.%I', v_tabla);
    execute format(
      'create trigger trg_normalizar before insert or update on public.%I
         for each row execute function private.normalizar_texto(%s)',
      v_tabla, v_cols);

    foreach v_col in array string_to_array(replace(v_mapa[i][2], ' ', ''), ',') loop
      execute format(
        'update public.%I set %I = private.en_mayuscula(%I)
          where %I is not null and %I is distinct from private.en_mayuscula(%I)',
        v_tabla, v_col, v_col, v_col, v_col, v_col);
    end loop;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Auditoría y tiempo real
-- ---------------------------------------------------------------------------
do $$
declare
  v_t record;
begin
  for v_t in
    select c.relname as tabla,
           coalesce(
             (select string_agg(format('%L', a.attname), ', ' order by k.ord)
                from pg_index i
                cross join lateral unnest(i.indkey) with ordinality as k(att, ord)
                join pg_attribute a on a.attrelid = c.oid and a.attnum = k.att
               where i.indrelid = c.oid and i.indisprimary),
             '') as clave
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname in ('romana_tickets', 'guias_movilizacion')
  loop
    execute format('drop trigger if exists trg_auditar on public.%I', v_t.tabla);
    execute format(
      'create trigger trg_auditar after insert or update or delete on public.%I
         for each row execute function private.auditar(%s)',
      v_t.tabla, v_t.clave);
  end loop;
end
$$;

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['romana_tickets', 'guias_movilizacion'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabla
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tabla);
    end if;
  end loop;
end
$$;
