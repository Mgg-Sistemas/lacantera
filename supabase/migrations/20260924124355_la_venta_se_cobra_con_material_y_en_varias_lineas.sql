-- LA VENTA SE COBRA CON MATERIAL, Y EN VARIAS LÍNEAS (24/09/2026)
--
-- Christopher: «a la hora de una venta o una compra sea multipagos, porque
-- puede ser por intercambio de materiales, pero también puedo pagar con otro
-- método de pago el resto ahí mismo; en venta coloca también, como en compra,
-- que puedo vender por intercambio, y ten en cuenta que puede generar cuentas
-- por pagar o cobrar si hay diferencia».
--
-- Compras ya lo hacía desde el 17/09: una orden se paga con varias
-- instrucciones y una de ellas puede ser material de la empresa. Esto es el
-- espejo para Ventas, con las tres decisiones que tomó Christopher el 24/09:
--
--   1. El material que trae el cliente ENTRA AL INVENTARIO CON COSTO: el
--      valor acordado en la venta. Es una compra, aunque se pague con una
--      venta.
--   2. ALMACÉN CONFIRMA QUE LLEGÓ antes de que el cobro cuente. Hasta
--      entonces está «por recibir» y la factura sigue con su saldo. Evita
--      cobrar con piedra que nunca llegó, y separa a quien vende de quien
--      cuenta.
--   3. Si el material vale más que la factura, QUIEN COBRA ELIGE CADA VEZ:
--      crédito del cliente para su próxima factura, o por pagarle en dinero
--      desde una cuenta de tesorería.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LO QUE CAMBIA EN LO QUE YA EXISTÍA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- - `cobros_venta.cuenta_id` deja de ser obligatoria: un cobro con material o
--   con crédito del cliente no cae en ninguna cuenta. La reja que exigía un
--   método que mueve dinero se queda, pero admite un salvoconducto que solo
--   ponen las funciones de aquí, igual que hace Compras con INTERCAMBIO.
-- - `saldos_a_favor` ya sabía de clientes (`cliente_id`, `CONTRAPARTE`,
--   `POR_PAGAR`) pero solo nacía de compras. Se le abre el origen.
-- - `saldo_movimientos` gana dos tipos: ACREDITADO (el crédito se descontó de
--   una factura) y PAGADO (se le devolvió dinero al cliente).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LO QUE NO SE HACE, A PROPÓSITO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Un cobro con material ya recibido NO se anula desde aquí: el material ya
-- está en el patio y puede haberse consumido. Se corrige como todo lo que ya
-- salió de la empresa: nota de crédito para la factura y una salida para
-- devolver el material. Mientras esté «por recibir» sí se anula, porque no
-- movió nada.

-- ───────────────────────────────────────── el cobro sin cuenta, con permiso

alter table public.cobros_venta alter column cuenta_id drop not null;

alter table public.cobros_venta
  add constraint cobros_venta_cuenta_o_sin_dinero
  check (cuenta_id is not null or metodo in ('INTERCAMBIO', 'SALDO_A_FAVOR'));

-- La reja de «solo métodos que mueven dinero», con salvoconducto. Es la misma
-- de las cinco tablas de dinero, más una puerta que solo abren las funciones
-- de abajo dentro de su propia transacción.
create or replace function private.exigir_metodo_de_dinero_o_salvoconducto()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_codigo text;
  v_nombre text;
begin
  execute format('select ($1).%I::text', tg_argv[0]) into v_codigo using new;
  if v_codigo is null then
    return new;
  end if;

  select m.nombre into v_nombre
    from public.metodos_pago m
   where m.codigo = v_codigo and not m.mueve_dinero;

  if v_nombre is not null
     and coalesce(current_setting('lacantera.cobro_sin_dinero', true), '') <> v_codigo then
    raise exception '«%» no mueve dinero: aquí solo van formas de cobrar en dinero.', v_nombre
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_metodo_de_dinero on public.cobros_venta;
create trigger trg_metodo_de_dinero
  before insert or update of metodo on public.cobros_venta
  for each row execute function private.exigir_metodo_de_dinero_o_salvoconducto('metodo');

-- ───────────────────────────────────────── los saldos a favor saben de ventas

alter table public.saldos_a_favor drop constraint if exists saldos_a_favor_origen_check;
alter table public.saldos_a_favor
  add constraint saldos_a_favor_origen_check
  check (origen in ('PAGO_CON_MATERIAL', 'COBRO_CON_MATERIAL'));

alter table public.saldos_a_favor
  add column if not exists factura_id bigint references public.facturas_venta(id),
  add column if not exists cobro_material_id bigint;

create index if not exists saldos_a_favor_cliente_abiertos
  on public.saldos_a_favor (cliente_id) where estado = 'ABIERTO';

alter table public.saldo_movimientos
  add column if not exists factura_id bigint references public.facturas_venta(id),
  add column if not exists cobro_id bigint references public.cobros_venta(id);

alter table public.saldo_movimientos drop constraint if exists saldo_movimientos_tipo_check;
alter table public.saldo_movimientos drop constraint if exists saldo_movimiento_dice_donde;
alter table public.saldo_movimientos
  add constraint saldo_movimientos_tipo_check
  check (tipo in ('APLICADO', 'COBRADO', 'ACREDITADO', 'PAGADO'));
alter table public.saldo_movimientos
  add constraint saldo_movimiento_dice_donde
  check (
    (tipo = 'APLICADO'   and instruccion_id is not null)
    or (tipo = 'COBRADO'    and tesoreria_movimiento_id is not null)
    or (tipo = 'ACREDITADO' and factura_id is not null)
    or (tipo = 'PAGADO'     and tesoreria_movimiento_id is not null)
  );

-- Facturación lee los saldos: el cobro de una factura ofrece el crédito del
-- cliente, y sin lectura el selector saldría vacío.
drop policy if exists saldos_a_favor_lectura on public.saldos_a_favor;
create policy saldos_a_favor_lectura on public.saldos_a_favor
  for select to authenticated
  using (
    private.tiene_permiso('COMPRAS', 'LECTURA')
    or private.tiene_permiso('TESORERIA', 'LECTURA')
    or private.tiene_permiso('FACTURACION', 'LECTURA')
  );

drop policy if exists saldo_movimientos_lectura on public.saldo_movimientos;
create policy saldo_movimientos_lectura on public.saldo_movimientos
  for select to authenticated
  using (
    private.tiene_permiso('COMPRAS', 'LECTURA')
    or private.tiene_permiso('TESORERIA', 'LECTURA')
    or private.tiene_permiso('FACTURACION', 'LECTURA')
  );

-- ───────────────────────────────────────── lo que trae el cliente

create table if not exists public.cobros_con_material (
  id                  bigint generated always as identity primary key,
  factura_id          bigint not null references public.facturas_venta(id),
  cliente_id          bigint not null references public.clientes(id),
  articulo_id         bigint not null references public.articulos(id),
  almacen_id          bigint not null references public.almacenes(id),
  cantidad            numeric(14,4) not null check (cantidad > 0),
  unidad              text not null,
  /** Lo que entra al patio, en la unidad del patio. */
  cantidad_inventario numeric(14,4) not null check (cantidad_inventario > 0),
  medida              text not null check (medida in ('DIRECTA', 'ESTIMADA')),
  densidad_usada      numeric(8,4),
  condicion           text not null,
  precio_lista        numeric(14,4),
  descuento_pct       numeric(6,2),
  descuento_unitario  numeric(14,4),
  motivo_condicion    text,
  moneda              text not null,
  precio_unitario     numeric(14,4) not null check (precio_unitario > 0),
  valor               numeric(14,2) not null check (valor > 0),
  /** Lo que se le aplica a la factura y lo que sobra. Estimados al registrar; firmes al recibir. */
  aplicado            numeric(14,2) not null default 0,
  excedente           numeric(14,2) not null default 0,
  excedente_como      text check (excedente_como in ('CREDITO', 'POR_PAGAR')),
  estado              text not null default 'POR_RECIBIR'
                        check (estado in ('POR_RECIBIR', 'RECIBIDO', 'ANULADO')),
  cobro_id            bigint references public.cobros_venta(id),
  entrada_id          bigint references public.inventario_movimientos(id),
  saldo_id            bigint references public.saldos_a_favor(id),
  nota                text,
  registrado_por      uuid not null,
  registrado_en       timestamptz not null default now(),
  recibido_por        uuid,
  recibido_en         timestamptz,
  anulado_por         uuid,
  anulado_en          timestamptz,
  motivo_anulacion    text,
  constraint cobro_material_recibido_completo
    check (estado <> 'RECIBIDO' or (entrada_id is not null and recibido_en is not null)),
  constraint cobro_material_excedente_dice_como
    check (excedente <= 0 or excedente_como is not null)
);

alter table public.saldos_a_favor
  add constraint saldos_a_favor_cobro_material_fk
  foreign key (cobro_material_id) references public.cobros_con_material(id);

create index if not exists cobros_con_material_factura on public.cobros_con_material (factura_id);
create index if not exists cobros_con_material_pendientes
  on public.cobros_con_material (almacen_id) where estado = 'POR_RECIBIR';

alter table public.cobros_con_material enable row level security;

-- Lo ve quien factura y quien recibe en el patio.
create policy cobros_con_material_lectura on public.cobros_con_material
  for select to authenticated
  using (
    private.tiene_permiso('FACTURACION', 'LECTURA')
    or private.tiene_permiso('INVENTARIO', 'LECTURA')
  );

create trigger trg_auditar
  after insert or update or delete on public.cobros_con_material
  for each row execute function private.auditar('id');

-- ───────────────────────────────────────── 1. el vendedor registra qué trae

create or replace function public.cobrar_con_material(
  p_factura_id        bigint,
  p_articulo_id       bigint,
  p_almacen_id        bigint,
  p_cantidad          numeric,
  p_unidad            text,
  p_condicion         text,
  p_descuento_pct     numeric default null,
  p_descuento_unitario numeric default null,
  p_precio_acordado   numeric default null,
  p_motivo_condicion  text default null,
  p_excedente_como    text default null,
  p_nota              text default null)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_f         public.facturas_venta;
  v_cli       record;
  v_art       record;
  v_alm       public.almacenes;
  v_hoy       date := private.hoy_aqui();
  v_unidad    text;
  v_cant_inv  numeric;
  v_medida    text;
  v_densidad  numeric;
  v_precio    record;
  v_valor     numeric;
  v_saldo_usd numeric;
  v_saldo_m   numeric;
  v_aplicado  numeric;
  v_excedente numeric;
  v_como      text := upper(nullif(btrim(coalesce(p_excedente_como, '')), ''));
  v_id        bigint;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  select * into v_f from public.facturas_venta where id = p_factura_id for update;
  if v_f.id is null then
    raise exception 'No existe la factura %.', p_factura_id using errcode = 'P0002';
  end if;
  if v_f.estado <> 'EMITIDA' then
    raise exception 'La factura % está % y no admite cobros.', v_f.numero, lower(v_f.estado)
      using errcode = '55000';
  end if;

  select id, nombre into v_cli from public.clientes where id = v_f.cliente_id;

  select a.id, a.nombre, a.unidad, a.activo, a.inventariable, a.densidad_ton_m3
    into v_art from public.articulos a where a.id = p_articulo_id;
  if v_art.id is null or not v_art.activo then
    raise exception 'Ese artículo no existe o está dado de baja.' using errcode = '23503';
  end if;
  if not v_art.inventariable then
    raise exception '«%» no se lleva en inventario: no hay patio donde recibirlo.', v_art.nombre
      using errcode = '22023';
  end if;

  select * into v_alm from public.almacenes where id = p_almacen_id and activo;
  if v_alm.id is null then
    raise exception 'Ese almacén no existe o está apagado.' using errcode = '23503';
  end if;
  if coalesce(v_alm.admite_sin_costo, false) then
    raise exception 'En «%» solo entra lo que no costó nada, y este material vale lo que se le descuenta al cliente.', v_alm.nombre
      using errcode = '22023';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad de «%» tiene que ser mayor que cero.', v_art.nombre using errcode = '22023';
  end if;

  -- Lo que entra al patio, como en la nota de entrega y en el pago con
  -- material: en la unidad del patio entra igual; entre m³ y toneladas se
  -- convierte con la densidad y queda escrito que es estimado.
  v_unidad := coalesce(upper(nullif(btrim(coalesce(p_unidad, '')), '')), v_art.unidad);
  if v_unidad = v_art.unidad then
    v_cant_inv := p_cantidad;
    v_medida := 'DIRECTA';
  elsif v_art.unidad in ('M3', 'TON') and v_unidad in ('M3', 'TON') and v_art.densidad_ton_m3 is not null then
    v_densidad := v_art.densidad_ton_m3;
    v_cant_inv := case when v_unidad = 'TON' then round(p_cantidad / v_densidad, 4)
                       else round(p_cantidad * v_densidad, 4) end;
    v_medida := 'ESTIMADA';
  else
    raise exception '«%» se lleva en % y no se recibe por %.', v_art.nombre, v_art.unidad, v_unidad
      using errcode = '22023';
  end if;

  if upper(btrim(coalesce(p_condicion, ''))) = 'SIN_CARGO' then
    raise exception 'Un cobro no va sin cargo: el material tiene que valer algo para pagar la factura.'
      using errcode = '22023';
  end if;

  -- El precio, con la regla de ventas y en la moneda de la factura.
  select * into v_precio
    from private.precio_por_condicion(v_art.id, v_unidad, p_condicion, p_descuento_pct,
                                      p_descuento_unitario, p_precio_acordado, p_motivo_condicion,
                                      v_f.moneda::bpchar, v_hoy);

  /*
    AQUÍ EL RIESGO ES AL REVÉS QUE EN UNA VENTA.

    Vendiendo, el peligro es regalar: por eso bajar del mínimo pide una casilla.
    Recibiendo material del cliente, el peligro es pagarle de más: valorar su
    arena por encima de la lista es descontarle de la factura más de lo que
    vale. Así que por encima de la lista, o sin lista contra qué comparar,
    lo firma quien tiene control total sobre Facturación.
  */
  if v_precio.precio_lista is null or v_precio.precio > v_precio.precio_lista then
    perform private.exigir_permiso('FACTURACION', 'TOTAL');
  end if;

  v_valor := round(p_cantidad * v_precio.precio, 2);
  if v_valor <= 0 then
    raise exception 'Con ese precio el material no llega a valer un céntimo.' using errcode = '22023';
  end if;

  -- Cuánto falta, en la moneda de la factura. El saldo se lleva en dólares;
  -- se pasa con la tasa congelada de la propia factura, no con la de hoy.
  v_saldo_usd := private.saldo_de_factura(p_factura_id);
  if v_saldo_usd is null or v_saldo_usd <= 0.01 then
    raise exception 'A la factura % no le falta nada por cobrar.', v_f.numero using errcode = '22023';
  end if;
  v_saldo_m := case when v_f.moneda = 'USD' then v_saldo_usd
                    else round(v_saldo_usd * v_f.tasa_usd / nullif(v_f.tasa, 0), 2) end;

  v_aplicado := least(v_valor, v_saldo_m);
  v_excedente := round(v_valor - v_aplicado, 2);

  if v_excedente > 0 then
    if v_como is null or v_como not in ('CREDITO', 'POR_PAGAR') then
      raise exception 'El material vale % % y a la factura le faltan % %: di qué pasa con los % % que sobran, si quedan como crédito del cliente para su próxima factura o se le pagan.',
        private.numero_es(v_valor, 2), v_f.moneda, private.numero_es(v_saldo_m, 2), v_f.moneda,
        private.numero_es(v_excedente, 2), v_f.moneda
        using errcode = '22023';
    end if;
  else
    v_como := null;
  end if;

  insert into public.cobros_con_material
    (factura_id, cliente_id, articulo_id, almacen_id,
     cantidad, unidad, cantidad_inventario, medida, densidad_usada,
     condicion, precio_lista, descuento_pct, descuento_unitario, motivo_condicion,
     moneda, precio_unitario, valor, aplicado, excedente, excedente_como, nota, registrado_por)
  values
    (p_factura_id, v_f.cliente_id, v_art.id, p_almacen_id,
     p_cantidad, v_unidad, v_cant_inv, v_medida, v_densidad,
     v_precio.condicion, v_precio.precio_lista, v_precio.descuento_pct, v_precio.descuento_unitario,
     v_precio.motivo, v_f.moneda, v_precio.precio, v_valor, v_aplicado, v_excedente, v_como,
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  perform private.notificar(
    'INVENTARIO', 'MATERIAL_POR_RECIBIR',
    format('Recibir %s %s de %s que entrega %s', private.cantidad_es(p_cantidad), v_unidad, v_art.nombre, v_cli.nombre),
    format('Es el pago con material de la factura %s. Entra a %s y la factura no baja hasta que almacén confirme que llegó.',
           v_f.numero, v_alm.nombre),
    '/app/inventario', array['ALMACEN', 'GERENTE_GENERAL'], 'ATENCION');

  return v_id;
end;
$$;

comment on function public.cobrar_con_material is
  'Registra que un cliente paga parte de una factura con material. No baja el saldo ni mueve inventario: eso pasa cuando almacén confirma que llegó (recibir_material_de_cobro).';

-- ───────────────────────────────────────── 2. almacén confirma, y entonces cuenta

create or replace function public.recibir_material_de_cobro(p_id bigint, p_nota text default null)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_m         public.cobros_con_material;
  v_f         public.facturas_venta;
  v_cli       record;
  v_art       record;
  v_alm       record;
  v_hoy       date := private.hoy_aqui();
  v_saldo_usd numeric;
  v_saldo_m   numeric;
  v_aplicado  numeric;
  v_excedente numeric;
  v_valor_usd numeric;
  v_costo_usd numeric;
  v_entrada   bigint;
  v_entrada_numero text;
  v_cobro     bigint;
  v_saldo     bigint;
begin
  perform private.exigir_rol('ALMACEN');

  select * into v_m from public.cobros_con_material where id = p_id for update;
  if v_m.id is null then
    raise exception 'No existe ese cobro con material.' using errcode = 'P0002';
  end if;
  if v_m.estado <> 'POR_RECIBIR' then
    raise exception 'Este material ya está %.', lower(v_m.estado) using errcode = '55000';
  end if;

  select * into v_f from public.facturas_venta where id = v_m.factura_id for update;
  if v_f.estado <> 'EMITIDA' then
    raise exception 'La factura % ya está % y no admite este cobro. Anúlalo y, si hace falta, regístralo contra otra factura.',
      v_f.numero, lower(v_f.estado) using errcode = '55000';
  end if;

  select id, nombre into v_cli from public.clientes where id = v_m.cliente_id;
  select id, nombre, unidad into v_art from public.articulos where id = v_m.articulo_id;
  select id, nombre into v_alm from public.almacenes where id = v_m.almacen_id;

  -- Lo que se aplica se decide HOY, con el saldo de hoy: entre registrar y
  -- recibir pudo entrar otro cobro. Lo que sobre va a donde dijo quien cobró.
  v_saldo_usd := coalesce(private.saldo_de_factura(v_f.id), 0);
  v_saldo_m := case when v_f.moneda = 'USD' then v_saldo_usd
                    else round(v_saldo_usd * v_f.tasa_usd / nullif(v_f.tasa, 0), 2) end;
  v_aplicado := least(v_m.valor, v_saldo_m);
  v_excedente := round(v_m.valor - v_aplicado, 2);

  if v_excedente > 0 and v_m.excedente_como is null then
    raise exception 'Desde que se registró, a la factura % le cobraron otra cosa y ahora sobran % %: anula este cobro con material y vuelve a registrarlo diciendo qué pasa con la diferencia.',
      v_f.numero, private.numero_es(v_excedente, 2), v_f.moneda using errcode = '55000';
  end if;

  -- 1. Entra al patio con costo: lo que se le descuenta al cliente por unidad
  --    del patio, en dólares, con la tasa congelada de la factura.
  v_valor_usd := case when v_f.moneda = 'USD' then v_m.valor
                      else round(v_m.valor * v_f.tasa / nullif(v_f.tasa_usd, 0), 2) end;
  v_costo_usd := round(v_valor_usd / v_m.cantidad_inventario, 6);

  v_entrada := public.registrar_entrada(
    v_m.almacen_id, v_m.articulo_id, v_m.cantidad_inventario, v_costo_usd,
    format('Intercambio: %s %s de «%s» que entrega %s como pago de la factura %s',
           private.cantidad_es(v_m.cantidad), v_m.unidad, v_art.nombre, v_cli.nombre, v_f.numero),
    v_f.numero, v_hoy, false, true, false);
  select numero into v_entrada_numero from public.inventario_movimientos where id = v_entrada;

  -- 2. El cobro, sin cuenta y sin dinero, con la tasa de la factura. Solo esta
  --    función pone INTERCAMBIO: ver el salvoconducto del disparador.
  if v_aplicado > 0 then
    perform set_config('lacantera.cobro_sin_dinero', 'INTERCAMBIO', true);
    insert into public.cobros_venta
      (numero, factura_id, cuenta_id, fecha, metodo, moneda, tasa, tasa_usd,
       monto, igtf_aplica, referencia, nota, registrado_por)
    values
      (private.siguiente_numero('COB'), v_f.id, null, v_hoy, 'INTERCAMBIO', v_f.moneda,
       v_f.tasa, v_f.tasa_usd, v_aplicado, false, v_entrada_numero,
       format('%s %s de %s recibidos en %s', private.cantidad_es(v_m.cantidad), v_m.unidad, v_art.nombre, v_alm.nombre),
       (select auth.uid()))
    returning id into v_cobro;
    perform set_config('lacantera.cobro_sin_dinero', '', true);
  end if;

  -- 3. Lo que sobra, como lo pidió quien cobró.
  if v_excedente > 0 then
    insert into public.saldos_a_favor
      (numero, cliente_id, a_favor_de, forma, moneda, monto, pendiente, estado, origen,
       factura_id, cobro_material_id, motivo, creado_por)
    values
      (private.siguiente_numero('SAF'), v_m.cliente_id, 'CONTRAPARTE', v_m.excedente_como,
       v_f.moneda, v_excedente, v_excedente, 'ABIERTO', 'COBRO_CON_MATERIAL',
       v_f.id, v_m.id,
       format('El material de la factura %s valía %s %s más de lo que faltaba por cobrar.',
              v_f.numero, private.numero_es(v_excedente, 2), v_f.moneda),
       (select auth.uid()))
    returning id into v_saldo;
  end if;

  update public.cobros_con_material
     set estado = 'RECIBIDO', aplicado = v_aplicado, excedente = v_excedente,
         cobro_id = v_cobro, entrada_id = v_entrada, saldo_id = v_saldo,
         recibido_por = (select auth.uid()), recibido_en = now(),
         nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), nota)
   where id = p_id;

  if private.saldo_de_factura(v_f.id) <= 0.01 then
    update public.facturas_venta set estado = 'COBRADA' where id = v_f.id;
  end if;

  perform private.notificar(
    'FACTURACION', 'MATERIAL_RECIBIDO',
    format('Llegó el material de %s: la factura %s %s', v_cli.nombre, v_f.numero,
           case when v_aplicado > 0 then 'baja ' || private.numero_es(v_aplicado, 2) || ' ' || v_f.moneda else 'ya estaba cobrada' end),
    case when v_excedente > 0
         then format('Sobraron %s %s y quedaron %s.', private.numero_es(v_excedente, 2), v_f.moneda,
                     case when v_m.excedente_como = 'CREDITO' then 'como crédito del cliente' else 'por pagarle al cliente desde Tesorería' end)
         else format('Entró a %s con la entrada %s.', v_alm.nombre, v_entrada_numero) end,
    '/app/facturacion', array['VENDE_Y_FACTURA', 'VENTAS', 'GERENTE_GENERAL'], 'INFO');

  return p_id;
end;
$$;

comment on function public.recibir_material_de_cobro is
  'Almacén confirma que llegó el material con el que un cliente paga una factura: entra al inventario con costo, el cobro se registra y la diferencia queda como crédito del cliente o por pagarle.';

-- ───────────────────────────────────────── 3. anular, solo lo que no movió nada

create or replace function public.anular_cobro_con_material(p_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_m public.cobros_con_material;
begin
  perform private.exigir_permiso('FACTURACION', 'TOTAL');

  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escribe por qué se anula, con al menos diez letras.' using errcode = '22023';
  end if;

  select * into v_m from public.cobros_con_material where id = p_id for update;
  if v_m.id is null then
    raise exception 'No existe ese cobro con material.' using errcode = 'P0002';
  end if;
  if v_m.estado = 'ANULADO' then
    raise exception 'Ya estaba anulado.' using errcode = '55000';
  end if;
  if v_m.estado = 'RECIBIDO' then
    raise exception 'El material ya entró al patio y el cobro ya bajó la factura. Eso no se anula: la factura se corrige con nota de crédito y el material se devuelve con una salida.'
      using errcode = '55000';
  end if;

  update public.cobros_con_material
     set estado = 'ANULADO', anulado_por = (select auth.uid()), anulado_en = now(),
         motivo_anulacion = btrim(p_motivo)
   where id = p_id;
end;
$$;

-- ───────────────────────────────────────── 4. el crédito del cliente se descuenta

create or replace function public.acreditar_saldo_de_cliente(
  p_factura_id bigint, p_saldo_id bigint, p_monto numeric, p_nota text default null)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_f      public.facturas_venta;
  v_s      public.saldos_a_favor;
  v_hoy    date := private.hoy_aqui();
  v_saldo_usd numeric;
  v_saldo_m   numeric;
  v_cobro  bigint;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  select * into v_f from public.facturas_venta where id = p_factura_id for update;
  if v_f.id is null then
    raise exception 'No existe la factura %.', p_factura_id using errcode = 'P0002';
  end if;
  if v_f.estado <> 'EMITIDA' then
    raise exception 'La factura % está % y no admite cobros.', v_f.numero, lower(v_f.estado) using errcode = '55000';
  end if;

  select * into v_s from public.saldos_a_favor where id = p_saldo_id for update;
  if v_s.id is null then
    raise exception 'No existe ese saldo a favor.' using errcode = 'P0002';
  end if;
  if v_s.estado <> 'ABIERTO' or v_s.a_favor_de <> 'CONTRAPARTE' or v_s.forma <> 'CREDITO' then
    raise exception 'El saldo % no es un crédito abierto de un cliente.', v_s.numero using errcode = '55000';
  end if;
  if v_s.cliente_id is distinct from v_f.cliente_id then
    raise exception 'El crédito % es de otro cliente: no se descuenta de esta factura.', v_s.numero using errcode = '22023';
  end if;
  if v_s.moneda <> v_f.moneda then
    raise exception 'El crédito % está en % y la factura en %. Se descuenta solo de facturas en su misma moneda.',
      v_s.numero, v_s.moneda, v_f.moneda using errcode = '22023';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if p_monto > v_s.pendiente + 0.001 then
    raise exception 'Del crédito % quedan % % y se quieren usar %.', v_s.numero,
      private.numero_es(v_s.pendiente, 2), v_s.moneda, private.numero_es(p_monto, 2) using errcode = '22023';
  end if;

  v_saldo_usd := coalesce(private.saldo_de_factura(p_factura_id), 0);
  v_saldo_m := case when v_f.moneda = 'USD' then v_saldo_usd
                    else round(v_saldo_usd * v_f.tasa_usd / nullif(v_f.tasa, 0), 2) end;
  if p_monto > v_saldo_m + 0.01 then
    raise exception 'A la factura % le faltan % % y se están acreditando %.', v_f.numero,
      private.numero_es(v_saldo_m, 2), v_f.moneda, private.numero_es(p_monto, 2) using errcode = '22023';
  end if;

  perform set_config('lacantera.cobro_sin_dinero', 'SALDO_A_FAVOR', true);
  insert into public.cobros_venta
    (numero, factura_id, cuenta_id, fecha, metodo, moneda, tasa, tasa_usd,
     monto, igtf_aplica, referencia, nota, registrado_por)
  values
    (private.siguiente_numero('COB'), p_factura_id, null, v_hoy, 'SALDO_A_FAVOR', v_f.moneda,
     v_f.tasa, v_f.tasa_usd, p_monto, false, v_s.numero,
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_cobro;
  perform set_config('lacantera.cobro_sin_dinero', '', true);

  insert into public.saldo_movimientos
    (saldo_id, tipo, monto, factura_id, cobro_id, fecha, nota, registrado_por)
  values
    (p_saldo_id, 'ACREDITADO', p_monto, p_factura_id, v_cobro, v_hoy,
     format('Descontado de la factura %s', v_f.numero), (select auth.uid()));

  update public.saldos_a_favor
     set pendiente = round(pendiente - p_monto, 2),
         estado = case when round(pendiente - p_monto, 2) <= 0 then 'LIQUIDADO' else 'ABIERTO' end
   where id = p_saldo_id;

  if private.saldo_de_factura(p_factura_id) <= 0.01 then
    update public.facturas_venta set estado = 'COBRADA' where id = p_factura_id;
  end if;

  return v_cobro;
end;
$$;

-- ───────────────────────────────────────── 5. lo que se le debe al cliente se paga

create or replace function public.pagar_saldo_a_cliente(
  p_saldo_id bigint, p_cuenta_id bigint, p_monto numeric,
  p_referencia text default null, p_fecha date default null, p_nota text default null)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_s      public.saldos_a_favor;
  v_cuenta public.cuentas_tesoreria;
  v_cli    record;
  v_fecha  date := coalesce(p_fecha, private.hoy_aqui());
  v_mov    bigint;
begin
  perform private.exigir_permiso('TESORERIA', 'ESCRITURA');

  select * into v_s from public.saldos_a_favor where id = p_saldo_id for update;
  if v_s.id is null then
    raise exception 'No existe ese saldo.' using errcode = 'P0002';
  end if;
  if v_s.estado <> 'ABIERTO' or v_s.a_favor_de <> 'CONTRAPARTE' or v_s.forma <> 'POR_PAGAR' then
    raise exception 'El saldo % no es una deuda abierta con un cliente.', v_s.numero using errcode = '55000';
  end if;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id and activa;
  if v_cuenta.id is null then
    raise exception 'Esa cuenta no existe o está archivada.' using errcode = 'P0002';
  end if;
  if v_cuenta.moneda <> v_s.moneda then
    raise exception 'La deuda está en % y «%» es en %. Se paga desde una cuenta en la misma moneda.',
      v_s.moneda, v_cuenta.nombre, v_cuenta.moneda using errcode = '22023';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if p_monto > v_s.pendiente + 0.001 then
    raise exception 'De % quedan % % por pagar y se quieren pagar %.', v_s.numero,
      private.numero_es(v_s.pendiente, 2), v_s.moneda, private.numero_es(p_monto, 2) using errcode = '22023';
  end if;
  if v_fecha > private.hoy_aqui() then
    raise exception 'No se registra un pago con fecha futura.' using errcode = '22023';
  end if;

  select id, nombre into v_cli from public.clientes where id = v_s.cliente_id;

  v_mov := private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'EGRESO', -1, p_monto,
    format('DEVOLUCIÓN A %s POR EL SALDO %s', v_cli.nombre, v_s.numero),
    v_fecha, p_referencia, v_cli.nombre, null, null, null, p_nota);

  insert into public.saldo_movimientos
    (saldo_id, tipo, monto, cuenta_id, tesoreria_movimiento_id, referencia, fecha, nota, registrado_por)
  values
    (p_saldo_id, 'PAGADO', p_monto, p_cuenta_id, v_mov, nullif(btrim(coalesce(p_referencia, '')), ''),
     v_fecha, nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()));

  update public.saldos_a_favor
     set pendiente = round(pendiente - p_monto, 2),
         estado = case when round(pendiente - p_monto, 2) <= 0 then 'LIQUIDADO' else 'ABIERTO' end
   where id = p_saldo_id;

  return v_mov;
end;
$$;

-- ───────────────────────────────────────── 6. varias líneas, una transacción

/*
  EL MULTIPAGO ES UNA SOLA LLAMADA.

  Cada línea la registra la función que ya existe para ella —dinero, crédito
  del cliente o material—, con su propia reja y su propio candado sobre la
  factura. Lo que añade esto es que van todas en la misma transacción: si la
  tercera línea no pasa, no queda ninguna registrada a medias.

  Las líneas de dinero van primero y el material al final, a propósito: el
  material se aplica contra lo que FALTE cuando llegue, y lo que se cobró en
  dinero ya no falta.
*/
create or replace function public.registrar_cobros(p_factura_id bigint, p_lineas jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_l    jsonb;
  v_tipo text;
  v_ids  jsonb := '[]'::jsonb;
  v_id   bigint;
  v_n    integer := 0;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'No hay ninguna línea que cobrar.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lineas) > 20 then
    raise exception 'Son demasiadas líneas para un solo cobro.' using errcode = '22023';
  end if;

  for v_l in
    select x from jsonb_array_elements(p_lineas) x
     order by case upper(x->>'tipo') when 'DINERO' then 1 when 'CREDITO' then 2 when 'MATERIAL' then 3 else 9 end
  loop
    v_n := v_n + 1;
    v_tipo := upper(coalesce(v_l->>'tipo', ''));

    if v_tipo = 'DINERO' then
      v_id := public.registrar_cobro(
        p_factura_id, (v_l->>'cuenta_id')::bigint, (v_l->>'monto')::numeric,
        coalesce(v_l->>'metodo', 'TRANSFERENCIA'), (v_l->>'fecha')::date,
        v_l->>'referencia', (v_l->>'igtf')::boolean, v_l->>'nota');
      v_ids := v_ids || jsonb_build_object('tipo', 'DINERO', 'cobro_id', v_id);

    elsif v_tipo = 'CREDITO' then
      v_id := public.acreditar_saldo_de_cliente(
        p_factura_id, (v_l->>'saldo_id')::bigint, (v_l->>'monto')::numeric, v_l->>'nota');
      v_ids := v_ids || jsonb_build_object('tipo', 'CREDITO', 'cobro_id', v_id);

    elsif v_tipo = 'MATERIAL' then
      v_id := public.cobrar_con_material(
        p_factura_id, (v_l->>'articulo_id')::bigint, (v_l->>'almacen_id')::bigint,
        (v_l->>'cantidad')::numeric, v_l->>'unidad', v_l->>'condicion',
        (v_l->>'descuento_pct')::numeric, (v_l->>'descuento_unitario')::numeric,
        (v_l->>'precio_acordado')::numeric, v_l->>'motivo_condicion',
        v_l->>'excedente_como', v_l->>'nota');
      v_ids := v_ids || jsonb_build_object('tipo', 'MATERIAL', 'cobro_material_id', v_id);

    else
      raise exception 'La línea % no dice qué es: dinero, crédito o material.', v_n using errcode = '22023';
    end if;
  end loop;

  return v_ids;
end;
$$;

-- ───────────────────────────────────────── lo que se enseña

-- Los cobros con material, con nombres. Va por función y no por vista porque
-- cruza a facturas y a clientes, que no lee quien recibe en el patio.
create or replace function public.cobros_con_material(
  p_factura_id bigint default null, p_solo_pendientes boolean default false)
returns table (
  id bigint, factura_id bigint, factura text, cliente text, articulo_id bigint, articulo text,
  almacen_id bigint, almacen text, cantidad numeric, unidad text, cantidad_inventario numeric,
  medida text, condicion text, precio_unitario numeric, moneda text, valor numeric,
  aplicado numeric, excedente numeric, excedente_como text, estado text,
  entrada_numero text, cobro_numero text, saldo_numero text, nota text,
  registrado_en timestamptz, recibido_en timestamptz, motivo_anulacion text)
language sql
stable
security definer
set search_path to ''
as $$
  select m.id, m.factura_id, f.numero, c.nombre, m.articulo_id, a.nombre,
         m.almacen_id, al.nombre, m.cantidad, m.unidad, m.cantidad_inventario,
         m.medida, m.condicion, m.precio_unitario, m.moneda, m.valor,
         m.aplicado, m.excedente, m.excedente_como, m.estado,
         e.numero, co.numero, s.numero, m.nota,
         m.registrado_en, m.recibido_en, m.motivo_anulacion
    from public.cobros_con_material m
    join public.facturas_venta f on f.id = m.factura_id
    join public.clientes c on c.id = m.cliente_id
    join public.articulos a on a.id = m.articulo_id
    join public.almacenes al on al.id = m.almacen_id
    left join public.inventario_movimientos e on e.id = m.entrada_id
    left join public.cobros_venta co on co.id = m.cobro_id
    left join public.saldos_a_favor s on s.id = m.saldo_id
   where (p_factura_id is null or m.factura_id = p_factura_id)
     and (not p_solo_pendientes or m.estado = 'POR_RECIBIR')
     and (private.tiene_permiso('FACTURACION', 'LECTURA') or private.tiene_permiso('INVENTARIO', 'LECTURA'))
   order by m.registrado_en desc;
$$;

-- Lo que la empresa le debe a sus clientes, para Pagos por hacer.
create or replace function public.por_pagar_a_clientes()
returns table (
  saldo_id bigint, numero text, cliente text, rif text, factura text,
  moneda text, monto numeric, pendiente numeric, motivo text, desde date, dias integer)
language sql
stable
security definer
set search_path to ''
as $$
  select s.id, s.numero, c.nombre, c.rif, f.numero, s.moneda, s.monto, s.pendiente, s.motivo,
         private.dia_aqui(s.creado_en), private.hoy_aqui() - private.dia_aqui(s.creado_en)
    from public.saldos_a_favor s
    join public.clientes c on c.id = s.cliente_id
    left join public.facturas_venta f on f.id = s.factura_id
   where s.estado = 'ABIERTO' and s.a_favor_de = 'CONTRAPARTE' and s.forma = 'POR_PAGAR'
     and (private.tiene_permiso('TESORERIA', 'LECTURA')
          or private.tiene_permiso('COMPRAS', 'LECTURA')
          or private.tiene_permiso('FACTURACION', 'LECTURA'))
   order by s.creado_en;
$$;

-- ───────────────────────────────────────── permisos de ejecución

revoke all on function public.cobrar_con_material(bigint,bigint,bigint,numeric,text,text,numeric,numeric,numeric,text,text,text) from public, anon;
revoke all on function public.recibir_material_de_cobro(bigint,text) from public, anon;
revoke all on function public.anular_cobro_con_material(bigint,text) from public, anon;
revoke all on function public.acreditar_saldo_de_cliente(bigint,bigint,numeric,text) from public, anon;
revoke all on function public.pagar_saldo_a_cliente(bigint,bigint,numeric,text,date,text) from public, anon;
revoke all on function public.registrar_cobros(bigint,jsonb) from public, anon;
revoke all on function public.cobros_con_material(bigint,boolean) from public, anon;
revoke all on function public.por_pagar_a_clientes() from public, anon;

grant execute on function public.cobrar_con_material(bigint,bigint,bigint,numeric,text,text,numeric,numeric,numeric,text,text,text) to authenticated;
grant execute on function public.recibir_material_de_cobro(bigint,text) to authenticated;
grant execute on function public.anular_cobro_con_material(bigint,text) to authenticated;
grant execute on function public.acreditar_saldo_de_cliente(bigint,bigint,numeric,text) to authenticated;
grant execute on function public.pagar_saldo_a_cliente(bigint,bigint,numeric,text,date,text) to authenticated;
grant execute on function public.registrar_cobros(bigint,jsonb) to authenticated;
grant execute on function public.cobros_con_material(bigint,boolean) to authenticated;
grant execute on function public.por_pagar_a_clientes() to authenticated;
