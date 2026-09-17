/*
  LA COMPRA SE PUEDE PAGAR CON MATERIAL — COMPRA POR INTERCAMBIO

  Christopher, 17/09/2026, 08:45: «nos han solicitado construir o permitir la
  opción de Compra con materiales, donde se puede comprar un item, y pagar con
  ej. Arena lavada». Y lo que decidió al preguntarle:

  1. NO ES UNA VENTA. «Se debe reflejar el valor per se, y en el inventario se
     deberá descontar la cantidad indicada. La compra con materiales es lo mismo
     que decir compra por intercambio.» Ni nota de entrega ni factura de venta:
     queda el valor acordado del material y el patio descuenta lo que sale.
  2. LA COMPRA SE AUTORIZA COMO HOY, Y EL MATERIAL SALE POR SALIDAS. «Genera la
     orden de compra […] y la nota de salida asociada, que debe ser aprobada por
     el almacenista […] y deberá haber sido notificado mediante sistema.»
  3. LA SOLICITUD A ALMACÉN NACE AL PAGAR. «Solo creará la solicitud para almacén
     cuando sea pagada (caso alterno la orden de compra pudiera ser modificada o
     rechazada/cancelada y la solicitud del almacén quedaría en el aire).»
  4. LA SALIDA DEPENDE DE LA COMPRA. «La salida del almacén, al estar relacionada
     con una compra o venta, deberá depender del estatus de esa compra o venta: si
     es cancelada/rechazada, la salida del material también.»
  5. EL PRECIO, COMO EN VENTAS: de lista, con descuento o acordado, con el mínimo
     y su casilla. Es `private.precio_por_condicion` (`20260917100000`).
  6. SI EL MATERIAL VALE MÁS DE LO QUE SE DEBE, LA DIFERENCIA QUEDA A FAVOR
     NUESTRO: como crédito para la próxima compra o como cuenta por cobrar.

  EL RECORRIDO

    Compras indica el pago con material ─► instrucción POR_PAGAR (INTERCAMBIO)
    Compras registra el pago             ─► instrucción PAGADA, orden pagada si ya se cubrió
                                         ─► orden de salida SS (ENTREGA_POR_INTERCAMBIO), aviso a almacén
    Almacén aprueba y entrega la SS      ─► nota de salida NS, asiento SALIDA_INTERCAMBIO con la orden
                                         ─► lo que sobró, saldo a favor; aviso a Compras
    Almacén no la aprueba, o se cancela  ─► el pago vuelve a Compras (DEVUELTA) con el motivo
    La compra se cancela o el proveedor desiste, sin que el material haya salido
                                         ─► la SS se cancela y el pago se anula

  Lo que queda escrito aquí para no tener que deducirlo:
  - Dos métodos nuevos que NO mueven dinero, INTERCAMBIO y SALDO_A_FAVOR. Una reja
    impide usarlos en cobros, pagos de factura, nómina o como método preferido, y
    `indicar_pago` no los acepta: solo los ponen sus propias funciones.
  - `saldos_a_favor` es general —proveedor o cliente, a favor de quién— porque
    Ventas parte B es la misma operación al revés y va a usar la misma tabla.
  - La reja de palabras de venta en salidas sigue frenando «pago con material»
    en una salida pedida a mano: ese camino ahora es Compras.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Métodos de pago que no mueven dinero
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.metodos_pago
  add column mueve_dinero boolean not null default true;

comment on column public.metodos_pago.mueve_dinero is
  'Falso en los métodos que no mueven dinero —pagar con material, con un saldo a favor—. No se ofrecen donde se mueve dinero, y solo los ponen sus propias funciones.';

insert into public.metodos_pago (codigo, nombre, orden, moneda_regla, campos_exigidos, exige_comprobante, activo, mueve_dinero)
values ('INTERCAMBIO', 'Material (intercambio)', 90, 'CUALQUIERA', '{}', false, true, false),
       ('SALDO_A_FAVOR', 'Saldo a favor', 91, 'CUALQUIERA', '{}', false, true, false);

create function private.exigir_metodo_de_dinero()
returns trigger
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_codigo text;
  v_nombre text;
begin
  -- La columna llega como argumento: la reja es la misma en las cinco tablas.
  execute format('select ($1).%I::text', tg_argv[0]) into v_codigo using new;
  if v_codigo is null then
    return new;
  end if;

  select m.nombre into v_nombre
    from public.metodos_pago m
   where m.codigo = v_codigo and not m.mueve_dinero;

  if v_nombre is not null then
    raise exception '«%» no mueve dinero: aquí solo van formas de pagar o cobrar en dinero.', v_nombre
      using errcode = '22023';
  end if;
  return new;
end;
$func$;

revoke all on function private.exigir_metodo_de_dinero() from public, anon;

create trigger trg_metodo_de_dinero before insert or update of forma_pago on public.empleados
  for each row execute function private.exigir_metodo_de_dinero('forma_pago');
create trigger trg_metodo_de_dinero before insert or update of metodo on public.pagos_compra
  for each row execute function private.exigir_metodo_de_dinero('metodo');
create trigger trg_metodo_de_dinero before insert or update of metodo on public.cobros_venta
  for each row execute function private.exigir_metodo_de_dinero('metodo');
create trigger trg_metodo_de_dinero before insert or update of metodo_pago_preferido on public.proveedores
  for each row execute function private.exigir_metodo_de_dinero('metodo_pago_preferido');
create trigger trg_metodo_de_dinero before insert or update of metodo_pago on public.nomina_novedades_montos
  for each row execute function private.exigir_metodo_de_dinero('metodo_pago');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. El inventario conoce el intercambio
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.inventario_movimientos drop constraint inventario_movimientos_tipo_check;
alter table public.inventario_movimientos add constraint inventario_movimientos_tipo_check
  check (tipo = any (array['ENTRADA_COMPRA', 'ENTRADA_PRODUCCION', 'ENTRADA_DEVOLUCION', 'ENTRADA_DIRECTA',
                           'SALIDA_CONSUMO', 'SALIDA_DESPACHO', 'SALIDA_MERMA', 'SALIDA_BAJA',
                           'SALIDA_INTERCAMBIO',
                           'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'AJUSTE_COSTO',
                           'TRANSFERENCIA_SALIDA', 'TRANSFERENCIA_ENTRADA', 'REVERSO',
                           'CAMBIO_DUENO_SALIDA', 'CAMBIO_DUENO_ENTRADA']));

alter table public.clases_de_salida drop constraint clases_de_salida_tipo_check;
alter table public.clases_de_salida add constraint clases_de_salida_tipo_check
  check (tipo = any (array['SALIDA_CONSUMO', 'SALIDA_MERMA', 'SALIDA_BAJA', 'SALIDA_INTERCAMBIO']));

insert into public.clases_de_salida (codigo, nombre, pista, tipo, orden, exige_detalle, activa)
values ('ENTREGA_POR_INTERCAMBIO', 'Entregado a un proveedor por intercambio',
        'La pone el sistema cuando una compra se paga con material. No se elige a mano.',
        'SALIDA_INTERCAMBIO', 90, false, true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Tablas: saldos a favor y pagos con material
-- ═══════════════════════════════════════════════════════════════════════════

create table public.saldos_a_favor (
  id              bigint generated always as identity primary key,
  numero          text not null unique,
  proveedor_id    bigint references public.proveedores(id),
  cliente_id      bigint references public.clientes(id),
  a_favor_de      text not null check (a_favor_de in ('EMPRESA', 'CONTRAPARTE')),
  forma           text not null check (forma in ('CREDITO', 'POR_COBRAR', 'POR_PAGAR')),
  moneda          text not null references public.monedas(codigo),
  monto           numeric(20,2) not null check (monto > 0),
  pendiente       numeric(20,2) not null check (pendiente >= 0),
  estado          text not null default 'ABIERTO' check (estado in ('ABIERTO', 'LIQUIDADO', 'ANULADO')),
  origen          text not null check (origen in ('PAGO_CON_MATERIAL')),
  orden_id        bigint references public.ordenes_compra(id),
  instruccion_id  bigint references public.instrucciones_pago(id),
  motivo          text not null,
  creado_por      uuid references auth.users(id),
  creado_en       timestamptz not null default now(),
  constraint saldo_de_alguien check (num_nonnulls(proveedor_id, cliente_id) = 1),
  constraint saldo_forma_segun_de_quien check (
    (a_favor_de = 'EMPRESA' and forma in ('CREDITO', 'POR_COBRAR'))
    or (a_favor_de = 'CONTRAPARTE' and forma in ('CREDITO', 'POR_PAGAR'))),
  constraint saldo_pendiente_cabe check (pendiente <= monto),
  constraint saldo_estado_segun_pendiente check (
    (estado <> 'ABIERTO' or pendiente > 0) and (estado <> 'LIQUIDADO' or pendiente = 0))
);

comment on table public.saldos_a_favor is
  'Lo que una contraparte le debe a la empresa, o la empresa a ella, fuera de un documento: la diferencia de un intercambio. Como crédito se aplica a otra orden; por cobrar o por pagar se liquida en dinero. General a propósito: proveedores hoy, clientes en Ventas parte B.';

create table public.saldo_movimientos (
  id                       bigint generated always as identity primary key,
  saldo_id                 bigint not null references public.saldos_a_favor(id),
  tipo                     text not null check (tipo in ('APLICADO', 'COBRADO')),
  monto                    numeric(20,2) not null check (monto > 0),
  orden_id                 bigint references public.ordenes_compra(id),
  instruccion_id           bigint references public.instrucciones_pago(id),
  cuenta_id                bigint references public.cuentas_tesoreria(id),
  tesoreria_movimiento_id  bigint references public.tesoreria_movimientos(id),
  referencia               text,
  fecha                    date not null,
  nota                     text,
  registrado_por           uuid references auth.users(id),
  registrado_en            timestamptz not null default now(),
  constraint saldo_movimiento_dice_donde check (
    (tipo = 'APLICADO' and instruccion_id is not null)
    or (tipo = 'COBRADO' and tesoreria_movimiento_id is not null))
);

comment on table public.saldo_movimientos is
  'Cómo se fue gastando un saldo a favor: aplicado a otra orden (con su instrucción) o cobrado a una cuenta (con su movimiento de tesorería).';

alter table public.solicitudes_salida
  add column instruccion_pago_id bigint unique references public.instrucciones_pago(id);

comment on column public.solicitudes_salida.instruccion_pago_id is
  'Cuando la salida paga una compra con material: su instrucción de pago. La salida nace al registrar el pago; si almacén no la aprueba o se cancela, el pago vuelve a Compras, y si la compra se cancela o el proveedor desiste, la salida se cancela con ella.';

create table public.pagos_con_material (
  id                   bigint generated always as identity primary key,
  instruccion_id       bigint not null unique references public.instrucciones_pago(id) on delete cascade,
  orden_id             bigint not null references public.ordenes_compra(id),
  solicitud_id         bigint unique references public.solicitudes_salida(id),
  articulo_id          bigint not null references public.articulos(id),
  almacen_id           bigint not null references public.almacenes(id),
  propietario          text not null references public.propietarios(codigo),
  cantidad             numeric(20,4) not null check (cantidad > 0),
  unidad               text not null references public.unidades(codigo),
  cantidad_inventario  numeric(20,4) not null check (cantidad_inventario > 0),
  medida               text not null check (medida in ('DIRECTA', 'ESTIMADA')),
  densidad_usada       numeric(10,4),
  condicion            text not null check (condicion in ('LISTA', 'DESCUENTO', 'ACORDADO')),
  precio_lista         numeric(20,6),
  descuento_pct        numeric(7,4),
  descuento_unitario   numeric(20,6),
  motivo_condicion     text,
  moneda               text not null references public.monedas(codigo),
  precio_unitario      numeric(20,6) not null check (precio_unitario > 0),
  valor                numeric(20,2) not null check (valor > 0),
  aplicado             numeric(20,2) not null check (aplicado > 0),
  excedente            numeric(20,2) not null default 0 check (excedente >= 0),
  excedente_como       text check (excedente_como in ('CREDITO', 'POR_COBRAR')),
  saldo_id             bigint references public.saldos_a_favor(id),
  creado_en            timestamptz not null default now(),
  constraint pago_material_cuadra check (valor = aplicado + excedente),
  constraint pago_material_excedente_dice_que_pasa check ((excedente > 0) = (excedente_como is not null)),
  constraint pago_material_medida_coherente check ((medida = 'ESTIMADA') = (densidad_usada is not null))
);

comment on table public.pagos_con_material is
  'Lo que dice una instrucción de pago INTERCAMBIO: qué material, de qué patio, cuánto, a qué precio y por qué condición; cuánto se aplicó a la orden y qué pasó con lo que sobró. Sale por la orden de salida `solicitud_id`, que nace al registrar el pago.';

-- Leer: quien ve compras o tesorería, como las instrucciones de pago.
alter table public.saldos_a_favor enable row level security;
alter table public.saldo_movimientos enable row level security;
alter table public.pagos_con_material enable row level security;

create policy saldos_a_favor_lectura on public.saldos_a_favor for select to authenticated
  using (private.tiene_permiso('COMPRAS', 'LECTURA') or private.tiene_permiso('TESORERIA', 'LECTURA'));
create policy saldo_movimientos_lectura on public.saldo_movimientos for select to authenticated
  using (private.tiene_permiso('COMPRAS', 'LECTURA') or private.tiene_permiso('TESORERIA', 'LECTURA'));
create policy pagos_con_material_lectura on public.pagos_con_material for select to authenticated
  using (private.tiene_permiso('COMPRAS', 'LECTURA') or private.tiene_permiso('TESORERIA', 'LECTURA'));

revoke all on public.saldos_a_favor, public.saldo_movimientos, public.pagos_con_material from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.saldos_a_favor, public.saldo_movimientos, public.pagos_con_material from authenticated;

create trigger trg_auditar after insert or delete or update on public.saldos_a_favor
  for each row execute function private.auditar('id');
create trigger trg_normalizar before insert or update on public.saldos_a_favor
  for each row execute function private.normalizar_texto('motivo');
create trigger trg_auditar after insert or delete or update on public.saldo_movimientos
  for each row execute function private.auditar('id');
create trigger trg_normalizar before insert or update on public.saldo_movimientos
  for each row execute function private.normalizar_texto('referencia', 'nota');
create trigger trg_auditar after insert or delete or update on public.pagos_con_material
  for each row execute function private.auditar('id');
create trigger trg_normalizar before insert or update on public.pagos_con_material
  for each row execute function private.normalizar_texto('motivo_condicion');

insert into public.auditoria_modulos (tabla, modulo)
values ('saldos_a_favor', 'COMPRAS'), ('saldo_movimientos', 'COMPRAS'), ('pagos_con_material', 'COMPRAS');

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Lo que le pasa a un pago con material cuando se mueve su salida
-- ═══════════════════════════════════════════════════════════════════════════

/*
  LO QUE HAY PROMETIDO DE UN MATERIAL. Pagos con material por pagar, y pagados
  cuya orden de salida todavía no salió. La reja definitiva es la de la entrega;
  esta evita prometer dos veces la misma arena.
*/
create function private.material_prometido(
  p_almacen_id bigint, p_articulo_id bigint, p_propietario text, p_menos_instruccion bigint default null)
returns numeric
language sql
stable
security definer
set search_path to ''
as $func$
  select coalesce(sum(m.cantidad_inventario), 0)
    from public.pagos_con_material m
    join public.instrucciones_pago i on i.id = m.instruccion_id
    left join public.solicitudes_salida s on s.id = m.solicitud_id
   where m.almacen_id = p_almacen_id and m.articulo_id = p_articulo_id and m.propietario = p_propietario
     and i.id is distinct from p_menos_instruccion
     and (i.estado = 'POR_PAGAR'
          or (i.estado = 'PAGADA' and s.estado in ('PEDIDA', 'APROBADA')));
$func$;

revoke all on function private.material_prometido(bigint, bigint, text, bigint) from public, anon;

/*
  Al entregarse la orden de salida. Lo llama `entregar_solicitud_salida` dentro
  de su transacción: el material sale y lo que sobró queda a favor, o no pasa
  ninguna de las dos cosas.
*/
create function private.material_entregado(p_instruccion_id bigint, p_nota_salida text)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_i      public.instrucciones_pago;
  v_m      public.pagos_con_material;
  v_o      record;
  v_saldo  bigint;
begin
  select * into v_i from public.instrucciones_pago where id = p_instruccion_id for update;
  if v_i.estado is distinct from 'PAGADA' then
    raise exception 'El pago con material de esta salida está %: la salida no se entrega.',
      lower(coalesce(v_i.estado, 'borrado')) using errcode = '55000';
  end if;

  select * into v_m from public.pagos_con_material where instruccion_id = p_instruccion_id;

  select o.id, o.numero, o.proveedor_id, o.solicitud_id, p.nombre as proveedor
    into v_o
    from public.ordenes_compra o
    left join public.proveedores p on p.id = o.proveedor_id
   where o.id = v_i.orden_id;

  perform private.anotar('PAGO', p_instruccion_id, 'PAGADA', 'PAGADA',
    format('El material salió con la nota de salida %s.', p_nota_salida));

  -- Lo que sobró queda a favor de la empresa, con su número y su porqué.
  if v_m.excedente > 0 then
    insert into public.saldos_a_favor
      (numero, proveedor_id, a_favor_de, forma, moneda, monto, pendiente, origen,
       orden_id, instruccion_id, motivo, creado_por)
    values
      (private.siguiente_numero('SAF'), v_o.proveedor_id, 'EMPRESA', v_m.excedente_como, v_m.moneda,
       v_m.excedente, v_m.excedente, 'PAGO_CON_MATERIAL', v_o.id, p_instruccion_id,
       format('El material entregado con la nota %s valió %s %s y a la orden %s se le aplicaron %s %s.',
              p_nota_salida, private.numero_es(v_m.valor, 2), v_m.moneda, v_o.numero,
              private.numero_es(v_m.aplicado, 2), v_m.moneda),
       (select auth.uid()))
    returning id into v_saldo;

    update public.pagos_con_material set saldo_id = v_saldo where id = v_m.id;
  end if;

  perform private.notificar(
    'COMPRAS', 'COMPRA_MATERIAL_ENTREGADO',
    format('%s: salió el material del pago', v_o.numero),
    format('Se entregó a %s con la nota %s.%s', coalesce(v_o.proveedor, 'el proveedor'), p_nota_salida,
           case when v_m.excedente > 0
                then format(' Sobraron %s %s: quedan a favor de la empresa.',
                            private.numero_es(v_m.excedente, 2), v_m.moneda)
                else '' end),
    '/app/compras/' || v_o.solicitud_id, array['COMPRAS'], 'INFO');
end;
$func$;

revoke all on function private.material_entregado(bigint, text) from public, anon;

/*
  Cuando almacén no aprueba la salida o se cancela: el material no salió, así
  que el pago no se hizo. Vuelve a Compras con el motivo, y la orden deja de
  contarse como pagada si lo estaba.
*/
create function private.devolver_pago_con_material(p_instruccion_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_i      public.instrucciones_pago;
  v_o      record;
  v_vivas  boolean;
  v_nuevo  text;
begin
  select * into v_i from public.instrucciones_pago where id = p_instruccion_id for update;
  if v_i.estado is distinct from 'PAGADA' then
    return;
  end if;

  update public.instrucciones_pago
     set estado = 'DEVUELTA', motivo_devolucion = btrim(p_motivo)
   where id = p_instruccion_id;

  perform private.anotar('PAGO', p_instruccion_id, 'PAGADA', 'DEVUELTA', p_motivo);

  select o.id, o.numero, o.estado, o.solicitud_id into v_o
    from public.ordenes_compra o where o.id = v_i.orden_id for update;

  v_vivas := exists (select 1 from public.instrucciones_pago
                      where orden_id = v_o.id and estado in ('POR_PAGAR', 'PAGADA'));

  -- Pagada ya no lo está; recibida lo sigue estando, y admite otro pago.
  v_nuevo := case
    when v_o.estado = 'PAGADA_POR_RECIBIR' then case when v_vivas then 'EN_TESORERIA' else 'POR_INDICAR_PAGO' end
    when v_o.estado = 'EN_TESORERIA' and not v_vivas then 'POR_INDICAR_PAGO'
  end;

  if v_nuevo is not null then
    update public.ordenes_compra
       set estado = v_nuevo,
           fecha_pago = case when v_o.estado = 'PAGADA_POR_RECIBIR' then null else fecha_pago end,
           pagada_en  = case when v_o.estado = 'PAGADA_POR_RECIBIR' then null else pagada_en end
     where id = v_o.id;
    perform private.anotar('ORDEN', v_o.id, v_o.estado, v_nuevo, p_motivo);
  end if;

  perform private.notificar(
    'COMPRAS', 'COMPRA_MATERIAL_DEVUELTO',
    format('%s: el pago con material volvió a Compras', v_o.numero),
    btrim(p_motivo),
    '/app/compras/' || v_o.solicitud_id, array['COMPRAS'], 'ATENCION');
end;
$func$;

revoke all on function private.devolver_pago_con_material(bigint, text) from public, anon;

/*
  LA SALIDA SIGUE A LA COMPRA. Christopher: «si es cancelada/rechazada, la salida
  del material también». Cancela las órdenes de salida que no han salido y anula
  su pago, que no llegó a hacerse. Devuelve cuántas soltó.
*/
create function private.soltar_salidas_de_orden(p_orden_id bigint, p_motivo text)
returns integer
language plpgsql
security definer
set search_path to ''
as $func$
declare
  r   record;
  v_n integer := 0;
begin
  for r in
    select s.id as solicitud_id, s.numero, i.id as instruccion_id
      from public.pagos_con_material m
      join public.instrucciones_pago i on i.id = m.instruccion_id
      join public.solicitudes_salida s on s.id = m.solicitud_id
     where m.orden_id = p_orden_id and i.estado = 'PAGADA' and s.estado in ('PEDIDA', 'APROBADA')
       for update of s, i
  loop
    update public.solicitudes_salida
       set estado = 'CANCELADA', cierre_motivo = btrim(p_motivo)
     where id = r.solicitud_id;

    update public.instrucciones_pago set estado = 'ANULADA' where id = r.instruccion_id;
    perform private.anotar('PAGO', r.instruccion_id, 'PAGADA', 'ANULADA',
      format('El material no salió: se canceló la orden de salida %s. %s', r.numero, btrim(p_motivo)));

    v_n := v_n + 1;
  end loop;

  if v_n > 0 then
    perform private.notificar(
      'SALIDAS', 'SALIDA_CANCELADA_POR_COMPRA',
      format('%s orden(es) de salida canceladas: su compra ya no sigue', v_n),
      btrim(p_motivo),
      '/app/salidas/solicitudes', array['ALMACEN'], 'ATENCION');
  end if;

  return v_n;
end;
$func$;

revoke all on function private.soltar_salidas_de_orden(bigint, text) from public, anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Indicar y registrar un pago con material
-- ═══════════════════════════════════════════════════════════════════════════

create function public.indicar_pago_con_material(
  p_orden_id            bigint,
  p_articulo_id         bigint,
  p_almacen_id          bigint,
  p_cantidad            numeric,
  p_unidad              text,
  p_condicion           text,
  p_descuento_pct       numeric default null,
  p_descuento_unitario  numeric default null,
  p_precio_acordado     numeric default null,
  p_motivo_condicion    text default null,
  p_excedente_como      text default null,
  p_propietario         text default null,
  p_nota                text default null)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_o            record;
  v_art          record;
  v_alm          public.almacenes;
  v_hoy          date := private.hoy_aqui();
  v_unidad       text;
  v_cant_inv     numeric;
  v_medida       text;
  v_densidad     numeric;
  v_precio       record;
  v_valor        numeric;
  v_dueno        text;
  v_prometido    numeric;
  v_hay          numeric;
  v_tope         numeric;
  v_pagado       numeric;
  v_pendiente    numeric;
  v_aplicado     numeric;
  v_excedente    numeric;
  v_como         text := upper(nullif(btrim(coalesce(p_excedente_como, '')), ''));
  v_tasa         numeric;
  v_tasa_usd     numeric;
  v_id           bigint;
begin
  perform private.exigir_rol('COMPRAS');

  select o.id, o.numero, o.estado, o.total, o.moneda, o.condicion_pago, o.tasa, o.comprobante_tipo
    into v_o
    from public.ordenes_compra o
   where o.id = p_orden_id
     for update;

  if v_o.id is null then
    raise exception 'No existe la orden %.', p_orden_id using errcode = 'P0002';
  end if;

  -- Las mismas rejas que `indicar_pago`: pagar con material sigue siendo pagar.
  if v_o.comprobante_tipo is null then
    raise exception 'Antes de pagar hay que decir con qué entrega el proveedor: nota de entrega o factura. Solo la factura da derecho al crédito fiscal y entra en el libro de compras.'
      using errcode = '22023';
  end if;

  if v_o.condicion_pago = 'CONTRA_ENTREGA' and v_o.estado = 'POR_RECIBIR' then
    raise exception 'Esta compra es contra entrega: se paga lo que llegue, y todavía no se ha recibido nada.'
      using errcode = '55000';
  end if;

  if v_o.estado not in ('POR_INDICAR_PAGO', 'EN_TESORERIA', 'RECIBIDA_PARCIAL', 'RECIBIDA') then
    raise exception 'Esta orden está en «%» y no admite instrucciones de pago.', v_o.estado
      using errcode = '55000';
  end if;

  select a.id, a.nombre, a.unidad, a.activo, a.inventariable, a.densidad_ton_m3
    into v_art
    from public.articulos a where a.id = p_articulo_id;

  if v_art.id is null or not v_art.activo then
    raise exception 'Ese artículo no existe o está dado de baja.' using errcode = '23503';
  end if;
  if not v_art.inventariable then
    raise exception '«%» no se lleva en inventario: no hay patio de donde sacarlo para pagar.', v_art.nombre
      using errcode = '22023';
  end if;

  select * into v_alm from public.almacenes where id = p_almacen_id and activo;
  if v_alm.id is null then
    raise exception 'Ese almacén no existe o está apagado.' using errcode = '23503';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad de «%» tiene que ser mayor que cero.', v_art.nombre using errcode = '22023';
  end if;

  /*
    LO QUE SALE DEL PATIO. Como en la nota de entrega: en la unidad del patio sale
    igual; en la otra, entre m³ y toneladas, se convierte con la densidad y queda
    escrito que es estimado.
  */
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
    raise exception '«%» se lleva en % y no se entrega por %.', v_art.nombre, v_art.unidad, v_unidad
      using errcode = '22023';
  end if;

  if v_cant_inv <= 0 then
    raise exception '% % de «%» no llega a mover el patio.', private.cantidad_es(p_cantidad), v_unidad, v_art.nombre
      using errcode = '22023';
  end if;

  -- El precio, con la regla de ventas. Sin cargo no paga nada.
  if upper(btrim(coalesce(p_condicion, ''))) = 'SIN_CARGO' then
    raise exception 'Un pago no va sin cargo: el material tiene que valer algo para pagar la compra.'
      using errcode = '22023';
  end if;

  select * into v_precio
    from private.precio_por_condicion(v_art.id, v_unidad, p_condicion, p_descuento_pct,
                                      p_descuento_unitario, p_precio_acordado, p_motivo_condicion,
                                      v_o.moneda, v_hoy);

  v_valor := round(p_cantidad * v_precio.precio, 2);
  if v_valor <= 0 then
    raise exception 'Con ese precio el material no llega a valer un céntimo.' using errcode = '22023';
  end if;

  -- Solo lo de la empresa paga lo de la empresa.
  v_dueno := private.dueno_del_saldo(p_almacen_id, v_art.id, p_propietario);
  if not exists (select 1 from public.propietarios where codigo = v_dueno and es_la_casa) then
    raise exception 'Ese material es de %: con lo que no es de la empresa no se paga una compra.',
      coalesce((select nombre from public.propietarios where codigo = v_dueno), v_dueno)
      using errcode = '22023';
  end if;

  v_prometido := private.material_prometido(p_almacen_id, v_art.id, v_dueno);
  v_hay := private.existencia(p_almacen_id, v_art.id, v_dueno) - v_prometido;
  if v_cant_inv > v_hay then
    raise exception 'De «%» en % quedan % % libres%: no alcanza para %.',
      v_art.nombre, v_alm.nombre, private.cantidad_es(greatest(v_hay, 0)), v_art.unidad,
      case when v_prometido > 0
           then format(' (hay %s prometidos en otros pagos con material)', private.cantidad_es(v_prometido))
           else '' end,
      private.cantidad_es(v_cant_inv)
      using errcode = '22023';
  end if;

  -- Cuánto falta por pagar, con la misma cuenta que `indicar_pago`.
  v_tope := private.tope_pagable(p_orden_id);
  select coalesce(sum(
           case when i.moneda = v_o.moneda then i.monto
                else round(i.monto * i.tasa / nullif(v_o.tasa, 0), 6) end), 0)
    into v_pagado
    from public.instrucciones_pago i
   where i.orden_id = p_orden_id and i.estado in ('POR_PAGAR', 'PAGADA');

  v_pendiente := round(v_tope - v_pagado, 2);
  if v_pendiente <= 0.01 then
    raise exception 'La orden % ya tiene instruido todo lo que se debe. Para pagarla de otra forma, devuelve antes una instrucción.',
      v_o.numero using errcode = '22023';
  end if;

  v_aplicado := least(v_valor, v_pendiente);
  v_excedente := v_valor - v_aplicado;

  if v_excedente > 0 then
    if v_como is null or v_como not in ('CREDITO', 'POR_COBRAR') then
      raise exception 'El material vale % % y a la orden le faltan % %: di qué pasa con los % % que sobran, si quedan como crédito para la próxima compra a este proveedor o por cobrarle.',
        private.numero_es(v_valor, 2), v_o.moneda, private.numero_es(v_pendiente, 2), v_o.moneda,
        private.numero_es(v_excedente, 2), v_o.moneda
        using errcode = '22023';
    end if;
  else
    v_como := null;
  end if;

  select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
    from private.tasas_del_dia(v_o.moneda::bpchar, v_hoy) t;

  -- La instrucción. Solo esta función pone INTERCAMBIO: ver `validar_metodo_pago`.
  perform set_config('lacantera.pago_sin_dinero', 'INTERCAMBIO', true);
  insert into public.instrucciones_pago
    (orden_id, metodo, moneda, monto, tasa, tasa_usd, igtf_aplica, nota, creada_por)
  values
    (p_orden_id, 'INTERCAMBIO', v_o.moneda, v_aplicado, v_tasa, v_tasa_usd, false,
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;
  perform set_config('lacantera.pago_sin_dinero', '', true);

  insert into public.pagos_con_material
    (instruccion_id, orden_id, articulo_id, almacen_id, propietario,
     cantidad, unidad, cantidad_inventario, medida, densidad_usada,
     condicion, precio_lista, descuento_pct, descuento_unitario, motivo_condicion,
     moneda, precio_unitario, valor, aplicado, excedente, excedente_como)
  values
    (v_id, p_orden_id, v_art.id, p_almacen_id, v_dueno,
     p_cantidad, v_unidad, v_cant_inv, v_medida, v_densidad,
     v_precio.condicion, v_precio.precio_lista, v_precio.descuento_pct, v_precio.descuento_unitario,
     v_precio.motivo, v_o.moneda, v_precio.precio, v_valor, v_aplicado, v_excedente, v_como);

  update public.ordenes_compra set estado = 'EN_TESORERIA' where id = p_orden_id;

  perform private.anotar('PAGO', v_id, null, 'POR_PAGAR',
    format('Con material: %s %s de %s, por %s %s.',
           private.cantidad_es(p_cantidad), v_unidad, v_art.nombre,
           private.numero_es(v_valor, 2), v_o.moneda));
  if v_o.estado <> 'EN_TESORERIA' then
    perform private.anotar('ORDEN', p_orden_id, v_o.estado, 'EN_TESORERIA');
  end if;

  return v_id;
end;
$func$;

revoke all on function public.indicar_pago_con_material(bigint, bigint, bigint, numeric, text, text, numeric, numeric, numeric, text, text, text, text) from public, anon;
grant execute on function public.indicar_pago_con_material(bigint, bigint, bigint, numeric, text, text, numeric, numeric, numeric, text, text, text, text) to authenticated, service_role;

/*
  REGISTRAR EL PAGO CON MATERIAL. Es el «pagar» de este método: la compra queda
  pagada en lo que valga el material, y NACE la orden de salida para almacén.
  Antes no, por lo que dijo Christopher: la solicitud se crea «cuando sea pagada»,
  para que una orden que se corrige o se cancela no deje una salida en el aire.
*/
create function public.registrar_pago_con_material(
  p_instruccion_id bigint, p_recibe text, p_nota text default null, p_con_firma boolean default false)
returns text
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_i        public.instrucciones_pago;
  v_m        public.pagos_con_material;
  v_o        record;
  v_art      text;
  v_alm      text;
  v_recibe   text := nullif(btrim(coalesce(p_recibe, '')), '');
  v_hoy      date := private.hoy_aqui();
  v_hay      numeric;
  v_numero   text;
  v_sol      bigint;
  v_faltan   numeric;
begin
  perform private.exigir_rol('COMPRAS');

  select * into v_i from public.instrucciones_pago where id = p_instruccion_id for update;
  if v_i.id is null then
    raise exception 'No existe la instrucción de pago %.', p_instruccion_id using errcode = 'P0002';
  end if;
  if v_i.metodo <> 'INTERCAMBIO' then
    raise exception 'Esta instrucción no es con material: se paga contra una cuenta.' using errcode = '22023';
  end if;
  if v_i.estado <> 'POR_PAGAR' then
    raise exception 'Esta instrucción está en «%» y no se puede volver a pagar.', v_i.estado using errcode = '55000';
  end if;

  if v_recibe is null or length(v_recibe) < 3 then
    raise exception 'Di quién recibe el material por el proveedor: su nombre va en la nota de salida.'
      using errcode = '22023';
  end if;

  select * into v_m from public.pagos_con_material where instruccion_id = p_instruccion_id;

  select o.id, o.numero, o.estado, o.solicitud_id, p.nombre as proveedor
    into v_o
    from public.ordenes_compra o
    left join public.proveedores p on p.id = o.proveedor_id
   where o.id = v_i.orden_id
     for update of o;

  select nombre into v_art from public.articulos where id = v_m.articulo_id;
  select nombre into v_alm from public.almacenes where id = v_m.almacen_id;

  -- Tiene que alcanzar hoy, sin lo prometido a otros pagos.
  v_hay := private.existencia(v_m.almacen_id, v_m.articulo_id, v_m.propietario)
           - private.material_prometido(v_m.almacen_id, v_m.articulo_id, v_m.propietario, p_instruccion_id);
  if v_m.cantidad_inventario > v_hay then
    raise exception 'De «%» en % quedan % libres: no alcanza para %. Devuelve la instrucción y vuelve a indicarla con otra cantidad o de otro patio.',
      v_art, v_alm, private.cantidad_es(greatest(v_hay, 0)), private.cantidad_es(v_m.cantidad_inventario)
      using errcode = '22023';
  end if;

  -- La orden de salida, que es la que aprueba y entrega almacén.
  v_numero := private.siguiente_numero('SS');
  insert into public.solicitudes_salida
    (numero, almacen_id, clase, motivo, destino_externo, responsable_externo, pedida_por,
     firma_de_quien_pide, instruccion_pago_id)
  values
    (v_numero, v_m.almacen_id, 'ENTREGA_POR_INTERCAMBIO',
     format('Intercambio de la orden de compra %s: se entrega al proveedor como parte de lo que se le debe',
            v_o.numero),
     coalesce(v_o.proveedor, 'Proveedor de la orden ' || v_o.numero), v_recibe, (select auth.uid()),
     coalesce(p_con_firma, false) and private.tengo_firma_encendida(), p_instruccion_id)
  returning id into v_sol;

  insert into public.solicitud_salida_renglones (solicitud_id, articulo_id, cantidad, propietario)
  values (v_sol, v_m.articulo_id, v_m.cantidad_inventario, v_m.propietario);

  update public.pagos_con_material set solicitud_id = v_sol where id = v_m.id;

  update public.instrucciones_pago
     set estado = 'PAGADA',
         referencia = v_numero,
         fecha_pago = v_hoy,
         pagada_por = (select auth.uid()),
         pagada_en = now()
   where id = p_instruccion_id;

  perform private.anotar('PAGO', p_instruccion_id, 'POR_PAGAR', 'PAGADA',
    format('Pagado con material. Sale con la orden de salida %s. %s', v_numero, coalesce(btrim(p_nota), '')));

  -- La misma cuenta que `registrar_pago`: la orden queda pagada cuando lo pagado cubre el total.
  select o.total - coalesce(sum(
           case when i.moneda = o.moneda then i.monto
                else round(i.monto * i.tasa / nullif(o.tasa, 0), 6) end), 0)
    into v_faltan
    from public.ordenes_compra o
    left join public.instrucciones_pago i on i.orden_id = o.id and i.estado = 'PAGADA'
   where o.id = v_o.id
   group by o.total;

  if v_faltan <= 0.01 then
    update public.ordenes_compra
       set estado = 'PAGADA_POR_RECIBIR', fecha_pago = v_hoy, pagada_en = now()
     where id = v_o.id;
    perform private.anotar('ORDEN', v_o.id, v_o.estado, 'PAGADA_POR_RECIBIR');
  end if;

  perform private.notificar(
    'SALIDAS', 'SALIDA_PEDIDA',
    format('%s: entregar %s %s de %s a %s', v_numero, private.cantidad_es(v_m.cantidad), v_m.unidad,
           v_art, coalesce(v_o.proveedor, 'un proveedor')),
    format('Es el pago con material de la orden de compra %s, ya registrado por Compras. Sale de %s y la aprueba quien responde por ese almacén. Lo recibe %s.',
           v_o.numero, v_alm, v_recibe),
    '/app/salidas/solicitudes', array['ALMACEN', 'GERENTE_GENERAL'], 'ATENCION');

  return v_numero;
end;
$func$;

revoke all on function public.registrar_pago_con_material(bigint, text, text, boolean) from public, anon;
grant execute on function public.registrar_pago_con_material(bigint, text, text, boolean) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Usar y cobrar un saldo a favor
-- ═══════════════════════════════════════════════════════════════════════════

create function public.usar_saldo_a_favor(
  p_orden_id bigint, p_saldo_id bigint, p_monto numeric default null, p_nota text default null)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_o         record;
  v_s         public.saldos_a_favor;
  v_hoy       date := private.hoy_aqui();
  v_tope      numeric;
  v_pagado    numeric;
  v_pendiente numeric;
  v_monto     numeric;
  v_tasa      numeric;
  v_tasa_usd  numeric;
  v_id        bigint;
  v_faltan    numeric;
begin
  perform private.exigir_rol('COMPRAS');

  select o.id, o.numero, o.estado, o.total, o.moneda, o.condicion_pago, o.tasa, o.comprobante_tipo,
         o.proveedor_id
    into v_o
    from public.ordenes_compra o where o.id = p_orden_id for update;

  if v_o.id is null then
    raise exception 'No existe la orden %.', p_orden_id using errcode = 'P0002';
  end if;
  if v_o.comprobante_tipo is null then
    raise exception 'Antes de pagar hay que decir con qué entrega el proveedor: nota de entrega o factura.'
      using errcode = '22023';
  end if;
  if v_o.estado not in ('POR_INDICAR_PAGO', 'EN_TESORERIA', 'RECIBIDA_PARCIAL', 'RECIBIDA') then
    raise exception 'Esta orden está en «%» y no admite pagos.', v_o.estado using errcode = '55000';
  end if;

  select * into v_s from public.saldos_a_favor where id = p_saldo_id for update;
  if v_s.id is null then
    raise exception 'No existe ese saldo a favor.' using errcode = 'P0002';
  end if;
  if v_s.estado <> 'ABIERTO' or v_s.a_favor_de <> 'EMPRESA' or v_s.forma <> 'CREDITO' then
    raise exception 'El saldo % no es un crédito abierto a favor de la empresa: no paga una orden.', v_s.numero
      using errcode = '55000';
  end if;
  if v_s.proveedor_id is distinct from v_o.proveedor_id then
    raise exception 'El saldo % es con otro proveedor.', v_s.numero using errcode = '22023';
  end if;
  if v_s.moneda <> v_o.moneda then
    raise exception 'El saldo % está en % y la orden en %.', v_s.numero, v_s.moneda, v_o.moneda
      using errcode = '22023';
  end if;

  v_tope := private.tope_pagable(p_orden_id);
  select coalesce(sum(
           case when i.moneda = v_o.moneda then i.monto
                else round(i.monto * i.tasa / nullif(v_o.tasa, 0), 6) end), 0)
    into v_pagado
    from public.instrucciones_pago i
   where i.orden_id = p_orden_id and i.estado in ('POR_PAGAR', 'PAGADA');
  v_pendiente := round(v_tope - v_pagado, 2);

  v_monto := coalesce(p_monto, least(v_s.pendiente, v_pendiente));
  if v_monto <= 0 or v_pendiente <= 0.01 then
    raise exception 'La orden % ya tiene instruido todo lo que se debe.', v_o.numero using errcode = '22023';
  end if;
  if v_monto > v_s.pendiente then
    raise exception 'Del saldo % quedan % %.', v_s.numero, private.numero_es(v_s.pendiente, 2), v_s.moneda
      using errcode = '22023';
  end if;
  if v_monto > v_pendiente then
    raise exception 'A la orden % le faltan % %.', v_o.numero, private.numero_es(v_pendiente, 2), v_o.moneda
      using errcode = '22023';
  end if;

  select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
    from private.tasas_del_dia(v_o.moneda::bpchar, v_hoy) t;

  -- Aplicar un crédito no mueve dinero: la instrucción nace pagada.
  perform set_config('lacantera.pago_sin_dinero', 'SALDO_A_FAVOR', true);
  insert into public.instrucciones_pago
    (orden_id, metodo, moneda, monto, tasa, tasa_usd, igtf_aplica, nota, creada_por,
     estado, referencia, fecha_pago, pagada_por, pagada_en)
  values
    (p_orden_id, 'SALDO_A_FAVOR', v_o.moneda, v_monto, v_tasa, v_tasa_usd, false,
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()),
     'PAGADA', v_s.numero, v_hoy, (select auth.uid()), now())
  returning id into v_id;
  perform set_config('lacantera.pago_sin_dinero', '', true);

  insert into public.saldo_movimientos
    (saldo_id, tipo, monto, orden_id, instruccion_id, fecha, nota, registrado_por)
  values
    (v_s.id, 'APLICADO', v_monto, p_orden_id, v_id, v_hoy, nullif(btrim(coalesce(p_nota, '')), ''),
     (select auth.uid()));

  update public.saldos_a_favor
     set pendiente = pendiente - v_monto,
         estado = case when pendiente - v_monto <= 0 then 'LIQUIDADO' else 'ABIERTO' end
   where id = v_s.id;

  perform private.anotar('PAGO', v_id, null, 'PAGADA',
    format('Con el saldo a favor %s: %s %s.', v_s.numero, private.numero_es(v_monto, 2), v_o.moneda));

  if v_o.estado <> 'EN_TESORERIA' then
    update public.ordenes_compra set estado = 'EN_TESORERIA' where id = p_orden_id;
    perform private.anotar('ORDEN', p_orden_id, v_o.estado, 'EN_TESORERIA');
  end if;

  select o.total - coalesce(sum(
           case when i.moneda = o.moneda then i.monto
                else round(i.monto * i.tasa / nullif(o.tasa, 0), 6) end), 0)
    into v_faltan
    from public.ordenes_compra o
    left join public.instrucciones_pago i on i.orden_id = o.id and i.estado = 'PAGADA'
   where o.id = p_orden_id
   group by o.total;

  if v_faltan <= 0.01 then
    update public.ordenes_compra
       set estado = 'PAGADA_POR_RECIBIR', fecha_pago = v_hoy, pagada_en = now()
     where id = p_orden_id;
    perform private.anotar('ORDEN', p_orden_id, 'EN_TESORERIA', 'PAGADA_POR_RECIBIR');
  end if;

  return v_id;
end;
$func$;

revoke all on function public.usar_saldo_a_favor(bigint, bigint, numeric, text) from public, anon;
grant execute on function public.usar_saldo_a_favor(bigint, bigint, numeric, text) to authenticated, service_role;

create function public.cobrar_saldo_a_favor(
  p_saldo_id bigint, p_cuenta_id bigint, p_monto numeric,
  p_referencia text default null, p_fecha date default null, p_nota text default null)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_s      public.saldos_a_favor;
  v_cuenta public.cuentas_tesoreria;
  v_prov   text;
  v_fecha  date := coalesce(p_fecha, private.hoy_aqui());
  v_mov    bigint;
begin
  perform private.exigir_rol('COMPRAS');

  select * into v_s from public.saldos_a_favor where id = p_saldo_id for update;
  if v_s.id is null then
    raise exception 'No existe ese saldo a favor.' using errcode = 'P0002';
  end if;
  if v_s.estado <> 'ABIERTO' or v_s.a_favor_de <> 'EMPRESA' or v_s.forma <> 'POR_COBRAR' then
    raise exception 'El saldo % no es una cuenta por cobrar abierta.', v_s.numero using errcode = '55000';
  end if;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;
  if v_cuenta.id is null then
    raise exception 'Di a qué cuenta entra el dinero.' using errcode = '22023';
  end if;
  if v_cuenta.moneda <> v_s.moneda then
    raise exception 'El saldo % está en % y la cuenta «%» en %.', v_s.numero, v_s.moneda, v_cuenta.nombre, v_cuenta.moneda
      using errcode = '22023';
  end if;

  if coalesce(p_monto, 0) <= 0 or p_monto > v_s.pendiente then
    raise exception 'Del saldo % se cobran entre 0,01 y % %.', v_s.numero, private.numero_es(v_s.pendiente, 2), v_s.moneda
      using errcode = '22023';
  end if;
  if v_fecha > private.hoy_aqui() then
    raise exception 'Un cobro no puede tener fecha futura.' using errcode = '22023';
  end if;

  select nombre into v_prov from public.proveedores where id = v_s.proveedor_id;

  v_mov := private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'INGRESO', 1, p_monto,
    format('Cobro del saldo a favor %s de %s', v_s.numero, coalesce(v_prov, 'un proveedor')),
    v_fecha, p_referencia, v_prov, null, v_s.orden_id, null, p_nota);

  insert into public.saldo_movimientos
    (saldo_id, tipo, monto, cuenta_id, tesoreria_movimiento_id, referencia, fecha, nota, registrado_por)
  values
    (v_s.id, 'COBRADO', p_monto, p_cuenta_id, v_mov, nullif(btrim(coalesce(p_referencia, '')), ''),
     v_fecha, nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()));

  update public.saldos_a_favor
     set pendiente = pendiente - p_monto,
         estado = case when pendiente - p_monto <= 0 then 'LIQUIDADO' else 'ABIERTO' end
   where id = v_s.id;

  return v_mov;
end;
$func$;

revoke all on function public.cobrar_saldo_a_favor(bigint, bigint, numeric, text, date, text) from public, anon;
grant execute on function public.cobrar_saldo_a_favor(bigint, bigint, numeric, text, date, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Parches: que lo demás respete el intercambio
-- ═══════════════════════════════════════════════════════════════════════════

do $parche$
declare
  v_def text;
  v_n   integer;
  f     record;
begin
  for f in
    select * from (values
      -- validar_metodo_pago: un método que no mueve dinero solo lo pone su función.
      (1, 'private.validar_metodo_pago()',
       $a$  if not v_m.activo then
    raise exception 'El metodo "%" ya no esta en uso.', v_m.nombre using errcode = '55000';
  end if;$a$,
       $b$  if not v_m.activo then
    raise exception 'El metodo "%" ya no esta en uso.', v_m.nombre using errcode = '55000';
  end if;

  -- Pagar con material o con un saldo a favor tiene su propio camino, que
  -- enciende esta marca. Solo se mira cuando el método se pone, no cuando la
  -- instrucción cambia de estado.
  if not v_m.mueve_dinero
     and (tg_op = 'INSERT' or new.metodo is distinct from old.metodo)
     and coalesce(current_setting('lacantera.pago_sin_dinero', true), '') is distinct from v_m.codigo then
    raise exception '«%» no se indica como un pago en dinero: tiene su propio botón en la orden.', v_m.nombre
      using errcode = '22023';
  end if;$b$),

      -- registrar_pago: el material no sale de una cuenta.
      (2, 'public.registrar_pago(bigint, bigint, text, date, text)',
       $a$  if v_i.estado <> 'POR_PAGAR' then
    raise exception 'Esta instrucción está en "%" y no se puede volver a pagar.', v_i.estado
      using errcode = '55000';
  end if;$a$,
       $b$  if v_i.estado <> 'POR_PAGAR' then
    raise exception 'Esta instrucción está en "%" y no se puede volver a pagar.', v_i.estado
      using errcode = '55000';
  end if;

  if exists (select 1 from public.metodos_pago m where m.codigo = v_i.metodo and not m.mueve_dinero) then
    raise exception 'Este pago es con material: no sale de una cuenta. Se registra con «Registrar el pago con material», que manda la orden de salida a almacén.'
      using errcode = '55000';
  end if;$b$),

      -- cambiar_metodo_de_pago: el material no cambia de método; se devuelve.
      (3, 'public.cambiar_metodo_de_pago(bigint, text, jsonb, text)',
       $a$  if v_estado <> 'POR_PAGAR' then
    raise exception 'Esta instrucción está en «%» y ya no admite cambio de método.', v_estado
      using errcode = '55000';
  end if;$a$,
       $b$  if v_estado <> 'POR_PAGAR' then
    raise exception 'Esta instrucción está en «%» y ya no admite cambio de método.', v_estado
      using errcode = '55000';
  end if;

  if exists (select 1 from public.metodos_pago m where m.codigo = v_metodo and not m.mueve_dinero) then
    raise exception 'Un pago con material no cambia de método: devuélvelo y vuelve a indicar el pago.'
      using errcode = '55000';
  end if;$b$),

      -- cancelar_orden: con material ya entregado no se cancela; lo que no salió, se suelta.
      (4, 'public.cancelar_orden(bigint, text)',
       $a$  -- Lo que haya entrado por esta orden sale.$a$,
       $b$  /*
    SI YA SALIÓ MATERIAL COMO PAGO, O SE APLICÓ UN SALDO A FAVOR, NO SE CANCELA.
    El proveedor tiene ese material, o el saldo ya se gastó en ella.
  */
  if exists (select 1
               from public.instrucciones_pago i
               left join public.pagos_con_material m on m.instruccion_id = i.id
               left join public.solicitudes_salida s on s.id = m.solicitud_id
              where i.orden_id = p_orden_id and i.estado = 'PAGADA'
                and (i.metodo = 'SALDO_A_FAVOR' or (i.metodo = 'INTERCAMBIO' and s.estado = 'ENTREGADA'))) then
    raise exception 'De esta orden ya salió material como pago, o se le aplicó un saldo a favor: cancelarla dejaría ese pago sin compra detrás.'
      using errcode = '55000',
            hint = 'Si el proveedor no va a cumplir, lo que se le entregó se acuerda con él y se registra aparte.';
  end if;

  -- La salida sigue a la compra: lo que no ha salido, no sale.
  perform private.soltar_salidas_de_orden(p_orden_id, format('Se canceló la orden de compra: %s', trim(p_motivo)));

  -- Lo que haya entrado por esta orden sale.$b$),

      -- marcar_desistimiento: el proveedor no cumple; el material que no salió, no sale.
      (5, 'public.marcar_desistimiento(bigint, text, boolean)',
       $a$  update public.ordenes_compra
     set estado = 'PROVEEDOR_DESISTIO',$a$,
       $b$  -- La salida sigue a la compra: lo que no ha salido como pago, no sale.
  perform private.soltar_salidas_de_orden(p_orden_id, format('El proveedor desistió: %s', trim(p_motivo)));

  update public.ordenes_compra
     set estado = 'PROVEEDOR_DESISTIO',$b$),

      -- registrar_salidas: la clase del sistema y la orden de compra en el asiento.
      (6, 'public.registrar_salidas(bigint, jsonb, text, text, date, bigint, text, text)',
       $a$  v_nombre_pres text; v_dueno text;
begin$a$,
       $b$  v_nombre_pres text; v_dueno text; v_orden bigint;
begin$b$),

      (7, 'public.registrar_salidas(bigint, jsonb, text, text, date, bigint, text, text)',
       $a$  select * into v_clase from public.clases_de_salida where codigo = p_tipo;$a$,
       $b$  -- La orden de compra que paga esta salida, cuando la entrega es de un intercambio.
  select i.orden_id into v_orden
    from public.solicitudes_salida s
    join public.instrucciones_pago i on i.id = s.instruccion_pago_id
   where s.numero = nullif(current_setting('lacantera.entregando_solicitud', true), '');

  select * into v_clase from public.clases_de_salida where codigo = p_tipo;$b$),

      (8, 'public.registrar_salidas(bigint, jsonb, text, text, date, bigint, text, text)',
       $a$    if v_clase.tipo = 'SALIDA_BAJA' then$a$,
       $b$    if v_clase.codigo = 'ENTREGA_POR_INTERCAMBIO' and v_orden is null then
      raise exception 'La razón "%" la pone el pago de una compra con material: una salida pedida a mano elige otra.', v_clase.nombre
        using errcode = '22023';
    end if;
    if v_clase.tipo = 'SALIDA_BAJA' then$b$),

      (9, 'public.registrar_salidas(bigint, jsonb, text, text, date, bigint, text, text)',
       $a$      btrim(p_motivo), null, null, null, p_fecha, null, null, v_nota, null,$a$,
       $b$      btrim(p_motivo), v_orden, null, null, p_fecha, null, null, v_nota, null,$b$),

      -- entregar_solicitud_salida: al salir, lo que sobró queda a favor y Compras se entera.
      (10, 'public.entregar_solicitud_salida(bigint)',
       $a$         nota_salida = v_nota
   where id = p_id;$a$,
       $b$         nota_salida = v_nota
   where id = p_id;

  -- Si la salida paga una compra con material, su pago se cierra aquí.
  if v_s.instruccion_pago_id is not null then
    perform private.material_entregado(v_s.instruccion_pago_id, v_nota);
  end if;$b$),

      -- rechazar y cancelar la salida: el material no salió, el pago vuelve a Compras.
      (11, 'public.rechazar_solicitud_salida(bigint, text)',
       $a$         aprobada_por = (select auth.uid()), aprobada_en = now()
   where id = p_id;$a$,
       $b$         aprobada_por = (select auth.uid()), aprobada_en = now()
   where id = p_id;

  if v_s.instruccion_pago_id is not null then
    perform private.devolver_pago_con_material(v_s.instruccion_pago_id,
      format('El almacén no aprobó la salida %s: %s', v_s.numero, btrim(p_motivo)));
  end if;$b$),

      (12, 'public.cancelar_solicitud_salida(bigint, text)',
       $a$     set estado = 'CANCELADA', cierre_motivo = btrim(p_motivo)
   where id = p_id;$a$,
       $b$     set estado = 'CANCELADA', cierre_motivo = btrim(p_motivo)
   where id = p_id;

  if v_s.instruccion_pago_id is not null then
    perform private.devolver_pago_con_material(v_s.instruccion_pago_id,
      format('Se canceló la salida %s: %s', v_s.numero, btrim(p_motivo)));
  end if;$b$),

      -- reversar_movimiento: el material ya es del proveedor.
      (13, 'public.reversar_movimiento(bigint, text)',
       $a$  perform private.exigir_no_reversado(v_mov.id, v_mov.numero);$a$,
       $b$  if v_mov.tipo = 'SALIDA_INTERCAMBIO' then
    raise exception 'El movimiento % pagó una compra con material: ese material ya es del proveedor, y no se reversa suelto.', v_mov.numero
      using errcode = '55000',
            hint = 'Lo que se acuerde con el proveedor se registra aparte.';
  end if;

  perform private.exigir_no_reversado(v_mov.id, v_mov.numero);$b$),

      -- Las clases de salida: la del intercambio es del sistema.
      (14, 'public.clases_de_salida(boolean)',
       $a$     and codigo <> 'ENTREGA_POR_SOLICITUD'$a$,
       $b$     and codigo not in ('ENTREGA_POR_SOLICITUD', 'ENTREGA_POR_INTERCAMBIO')$b$),

      (15, 'public.guardar_clase_de_salida(text, text, text, text, text, smallint, boolean, boolean)',
       $a$  if p_codigo = 'ENTREGA_POR_SOLICITUD' then
    raise exception 'Esa razón la pone el sistema al entregar una solicitud: no se edita.' using errcode = '22023';$a$,
       $b$  if p_codigo in ('ENTREGA_POR_SOLICITUD', 'ENTREGA_POR_INTERCAMBIO') or p_tipo = 'SALIDA_INTERCAMBIO' then
    raise exception 'Esa razón la pone el sistema al entregar una solicitud o un pago con material: no se edita.' using errcode = '22023';$b$),

      (16, 'public.borrar_clase_de_salida(text)',
       $a$  if p_codigo = 'ENTREGA_POR_SOLICITUD' then
    raise exception 'Esa razón la pone el sistema al entregar una solicitud: no se apaga.' using errcode = '22023';$a$,
       $b$  if p_codigo in ('ENTREGA_POR_SOLICITUD', 'ENTREGA_POR_INTERCAMBIO') then
    raise exception 'Esa razón la pone el sistema al entregar una solicitud o un pago con material: no se apaga.' using errcode = '22023';$b$),

      -- El historial del artículo dice qué fue.
      (17, 'public.historial_articulo(bigint, integer)',
       $a$             when 'SALIDA_DESPACHO'       then 'Salió en un despacho'$a$,
       $b$             when 'SALIDA_DESPACHO'       then 'Salió en un despacho'
             when 'SALIDA_INTERCAMBIO'    then 'Salió como pago de una compra'$b$)
    ) as t(n, firma, antes, despues)
    order by n
  loop
    v_def := pg_get_functiondef(f.firma::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, f.antes, ''))) / length(f.antes);
    if v_n <> 1 then
      raise exception 'Parche %: en % el texto aparece % veces.', f.n, f.firma, v_n;
    end if;
    execute replace(v_def, f.antes, f.despues);
  end loop;

  -- La vista del historial, con la misma etiqueta. Se rehace con su opción.
  v_def := pg_get_viewdef('public.v_historial_articulo'::regclass, true);
  v_n := (length(v_def) - length(replace(v_def, $a$WHEN 'SALIDA_DESPACHO'::text THEN 'Salió en un despacho'::text$a$, '')))
         / length($a$WHEN 'SALIDA_DESPACHO'::text THEN 'Salió en un despacho'::text$a$);
  if v_n <> 1 then
    raise exception 'v_historial_articulo: la etiqueta del despacho aparece % veces.', v_n;
  end if;
  v_def := replace(v_def,
    $a$WHEN 'SALIDA_DESPACHO'::text THEN 'Salió en un despacho'::text$a$,
    $b$WHEN 'SALIDA_DESPACHO'::text THEN 'Salió en un despacho'::text
            WHEN 'SALIDA_INTERCAMBIO'::text THEN 'Salió como pago de una compra'::text$b$);
  execute 'create or replace view public.v_historial_articulo with (security_invoker = on) as ' || v_def;
end
$parche$;
