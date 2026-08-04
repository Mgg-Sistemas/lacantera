-- ============================================================================
-- Ventas: los cerrojos que faltaban
--
-- La revisión del módulo encontró tres huecos que no se ven probando a mano,
-- porque solo aparecen cuando dos cosas pasan a la vez o cuando alguien teclea
-- un número absurdo. Los tres tienen la misma forma: el sistema mira, decide, y
-- entre el mirar y el decidir cabe otra operación.
--
-- 1. DOS FACTURAS POR EL MISMO CAMIÓN. `facturar_notas` comprobaba que las
--    notas estuvieran DESPACHADAS y después las marcaba FACTURADA, sin bloquear
--    nada entremedio. Dos clics seguidos en "Emitir la factura" —o dos personas
--    facturándole al mismo cliente— pasan los dos la comprobación, porque
--    ninguna transacción ve lo que la otra todavía no ha confirmado. Salen dos
--    facturas fiscales, cada una con su número de control, por el mismo
--    material. Ante una fiscalización eso no se explica.
--
-- 2. COBRAR MÁS DE LO QUE SE DEBE, SIN QUE SE NOTE. `registrar_cobro` leía el
--    saldo y comparaba contra él. Dos cobros simultáneos de $900 sobre una
--    factura de $1.000 leen los dos "faltan $1.000" y los dos pasan. El saldo se
--    calcula con `greatest(..., 0)`, así que el sistema muestra cero y los $800
--    de más quedan absorbidos en silencio. Peor todavía: anular una factura
--    comprobaba que no tuviera cobros, y un cobro que se estaba registrando en
--    paralelo no se ve — la factura queda ANULADA con un cobro REGISTRADO
--    encima, que es exactamente el estado que esa comprobación existía para
--    impedir.
--
-- 3. UNA FACTURA EN NEGATIVO. El descuento de cabecera no tenía techo. Quien se
--    equivoque y escriba el monto completo en el campo del descuento emite un
--    documento con total negativo: `saldo_usd` da cero de entrada, la factura
--    nunca aparece en cuentas por cobrar, nunca se puede cobrar, y ya consumió
--    un número de control fiscal.
--
-- El arreglo es el mismo en los tres casos: cerrar la puerta antes de mirar.
-- Un `for update` no es una optimización que se pueda dejar para después; es lo
-- único que hace que la comprobación signifique algo.
--
-- Se toca también el patio: `despachar` comprobaba la existencia y después
-- restaba, con la misma ventana en medio. Dos camiones cargando el mismo
-- material a la vez podían dejar el almacén en negativo, y una existencia
-- negativa no es un dato: es un error que alguien tendrá que deshacer a mano.
-- Ahí no hay fila que bloquear —la existencia se suma del libro, no se guarda—
-- así que se usa un cerrojo por casilla de patio, tomado siempre en el mismo
-- orden para que dos despachos no se traben el uno al otro.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 3. El total no puede ser negativo
--
-- La comprobación no puede vivir en el disparador que suma los totales: los
-- renglones entran de uno en uno, y con un descuento de cabecera de 100 el
-- primer renglón de 50 deja el total en negativo un instante antes de que
-- entren los demás. Rechazar ahí sería rechazar documentos correctos.
--
-- Por eso es un disparador de restricción diferido: no mira cuando pasa, mira
-- al cerrar la operación, cuando ya están todos los renglones. Y relee la fila
-- en vez de fiarse de la imagen que quedó encolada, que es del momento del
-- cambio y no del final.
-- ---------------------------------------------------------------------------
create or replace function private.trg_total_no_negativo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total  numeric;
  v_numero text;
begin
  execute format('select total, numero from public.%I where id = $1', TG_TABLE_NAME)
    into v_total, v_numero using NEW.id;

  -- Si la fila ya no está, alguien la borró en la misma operación: nada que
  -- comprobar.
  if v_total is null then
    return null;
  end if;

  if v_total < 0 then
    raise exception 'El documento % quedaría en %: el descuento se come el total. Un papel con total negativo no se puede cobrar ni declarar; si hay que devolverle dinero al cliente, eso es una nota de crédito y no un descuento.',
      v_numero, v_total using errcode = '22023';
  end if;

  return null;
end;
$$;

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['cotizaciones_venta', 'notas_entrega', 'facturas_venta'] loop
    execute format('drop trigger if exists trg_total_no_negativo on public.%I', v_tabla);
    execute format(
      'create constraint trigger trg_total_no_negativo
         after insert or update on public.%I
         deferrable initially deferred
         for each row execute function private.trg_total_no_negativo()', v_tabla);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Despachar, con el patio cerrado mientras se resta
-- ---------------------------------------------------------------------------
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
  p_observacion  text    default null
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
  v_fecha    date := coalesce(p_fecha, current_date);
  v_moneda   char(3);
  v_tasas    record;
  v_id       bigint;
  v_reng     record;
  v_existe   numeric;
  v_costo    numeric;
  v_mov      bigint;
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

  v_moneda := coalesce(p_moneda, v_cliente.moneda_preferida);
  select * into v_tasas from private.tasas_del_dia(v_moneda, v_fecha);

  insert into public.notas_entrega
    (numero, cliente_id, cotizacion_id, almacen_id, fecha, vehiculo, chofer,
     cedula_chofer, peso_bruto, peso_tara, ticket_romana, moneda, tasa, tasa_usd,
     alicuota_iva, descuento, flete, observacion, despachada_por)
  values
    (private.siguiente_numero('NE'), p_cliente_id, p_cotizacion_id, p_almacen_id,
     v_fecha, nullif(trim(coalesce(p_vehiculo, '')), ''),
     nullif(trim(coalesce(p_chofer, '')), ''), nullif(trim(coalesce(p_cedula_chofer, '')), ''),
     p_peso_bruto, p_peso_tara, nullif(trim(coalesce(p_ticket, '')), ''),
     v_moneda, v_tasas.tasa, v_tasas.tasa_usd,
     case when v_cliente.exento_iva then 0 else coalesce(p_alicuota_iva, 16) end,
     coalesce(p_descuento, 0), coalesce(p_flete, 0),
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()))
  returning id into v_id;

  perform private.cargar_renglones_venta(
    'nota_entrega_renglones', 'nota_id', v_id, p_renglones, v_moneda, v_fecha);

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
-- Anular la nota, con la nota bloqueada
--
-- Dos anulaciones simultáneas de la misma nota devolvían el material al patio
-- dos veces: las dos leen estado DESPACHADA y las dos escriben el reverso.
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
  -- Anular un despacho devuelve material al patio con un asiento que nadie
  -- contó. Es una corrección, no una operación del día.
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

  update public.notas_entrega
     set estado = 'ANULADA',
         motivo_anulacion = trim(p_motivo),
         anulada_por = (select auth.uid()),
         anulada_en = now()
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Facturar, con las notas bloqueadas
-- ---------------------------------------------------------------------------
create or replace function public.facturar_notas(
  p_notas          bigint[],
  p_condicion_pago text default null,
  p_fecha          date default null,
  p_observacion    text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cliente   record;
  v_fecha     date := coalesce(p_fecha, current_date);
  v_notas     record;
  v_condicion text;
  v_dias      smallint;
  v_id        bigint;
  v_linea     smallint := 0;
  v_reng      record;
  v_deuda     numeric;
  v_total_usd numeric;
  v_iva       numeric;
begin
  perform private.exigir_permiso('VENTAS', 'ESCRITURA');

  if p_notas is null or array_length(p_notas, 1) is null then
    raise exception 'No hay notas de entrega que facturar.' using errcode = '22023';
  end if;

  -- Las notas se cierran ANTES de mirarles el estado. Sin esto, dos facturas
  -- emitidas a la vez leen las dos "DESPACHADA", las dos consumen un número de
  -- control fiscal y la segunda pisa el factura_id de la primera: dos papeles
  -- por el mismo camión. En orden de id para que dos tandas que se solapen no
  -- se queden esperándose.
  perform 1 from public.notas_entrega
   where id = any(p_notas) order by id for update;

  select count(*)                       as cuantas,
         count(distinct n.cliente_id)   as clientes,
         count(distinct n.moneda)       as monedas,
         count(distinct n.alicuota_iva) as alicuotas,
         min(n.cliente_id)              as cliente_id,
         min(n.moneda)                  as moneda,
         min(n.alicuota_iva)            as alicuota,
         sum(n.descuento)               as descuento,
         sum(n.flete)                   as flete,
         count(*) filter (where n.estado <> 'DESPACHADA') as no_despachadas
    into v_notas
  from public.notas_entrega n
  where n.id = any(p_notas);

  if v_notas.cuantas <> array_length(p_notas, 1) then
    raise exception 'Alguna de las notas indicadas no existe.' using errcode = 'P0002';
  end if;

  if v_notas.no_despachadas > 0 then
    raise exception 'Solo se facturan notas despachadas: % de las indicadas ya están facturadas o anuladas.',
      v_notas.no_despachadas using errcode = '55000';
  end if;

  if v_notas.clientes > 1 then
    raise exception 'Las notas son de % clientes distintos. Una factura es de un solo cliente.',
      v_notas.clientes using errcode = '22023';
  end if;

  if v_notas.monedas > 1 then
    raise exception 'Las notas están en monedas distintas y no se pueden sumar en una factura.'
      using errcode = '22023';
  end if;

  if v_notas.alicuotas > 1 then
    raise exception 'Las notas llevan alícuotas de IVA distintas. Factúralas por separado.'
      using errcode = '22023';
  end if;

  select * into v_cliente from public.clientes where id = v_notas.cliente_id;

  v_condicion := coalesce(p_condicion_pago, v_cliente.condicion_pago);
  v_dias := case v_condicion
              when 'CREDITO_15' then 15
              when 'CREDITO_30' then 30
              when 'CREDITO_60' then 60
              else 0
            end;

  insert into public.facturas_venta
    (numero, numero_control, cliente_id, fecha, condicion_pago, dias_credito, vence_el,
     moneda, tasa, tasa_usd, alicuota_iva, descuento, flete, observacion, emitida_por)
  select
    private.siguiente_numero('FAC'), private.siguiente_control(), v_cliente.id, v_fecha,
    v_condicion, v_dias, v_fecha + v_dias,
    v_notas.moneda, t.tasa, t.tasa_usd, v_notas.alicuota,
    coalesce(v_notas.descuento, 0), coalesce(v_notas.flete, 0),
    nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid())
  from private.tasas_del_dia(v_notas.moneda, v_fecha) t
  returning id into v_id;

  -- Los renglones se copian, no se referencian: la factura tiene que seguir
  -- diciendo lo mismo aunque después alguien anule la nota de la que salió.
  for v_reng in
    select r.*, n.id as origen
    from public.nota_entrega_renglones r
    join public.notas_entrega n on n.id = r.nota_id
    where r.nota_id = any(p_notas)
    order by n.fecha, n.numero, r.linea
  loop
    v_linea := v_linea + 1;
    insert into public.factura_venta_renglones
      (factura_id, linea, articulo_id, descripcion, cantidad, unidad,
       precio_unitario, exento_iva, nota_id)
    values
      (v_id, v_linea, v_reng.articulo_id, v_reng.descripcion, v_reng.cantidad,
       v_reng.unidad, v_reng.precio_unitario, v_reng.exento_iva, v_reng.origen);
  end loop;

  -- La retención se calcula sobre el IVA ya cuadrado por el disparador.
  if v_cliente.contribuyente_especial then
    select iva into v_iva from public.facturas_venta where id = v_id;
    update public.facturas_venta
       set retencion_iva = round(v_iva * v_cliente.retencion_iva / 100, 2)
     where id = v_id;
  end if;

  -- El techo del crédito, después de conocer el total y antes de dar el
  -- documento por bueno. Un aviso que se salta con un clic, se salta.
  if v_dias > 0 then
    select total_usd into v_total_usd from public.facturas_venta where id = v_id;

    if v_cliente.limite_credito <= 0 then
      raise exception 'A "%" no se le tiene autorizado crédito. Fija su límite o factúrale de contado.',
        v_cliente.nombre using errcode = '55000';
    end if;

    -- La deuda ya incluye esta factura: acaba de emitirse como EMITIDA.
    v_deuda := private.deuda_cliente(v_cliente.id);

    if v_deuda > v_cliente.limite_credito and not private.tiene_permiso('VENTAS', 'TOTAL') then
      raise exception 'Con esta factura "%" quedaría debiendo % $ y su límite es % $.',
        v_cliente.nombre, round(v_deuda, 2), round(v_cliente.limite_credito, 2)
        using errcode = '55000';
    end if;
  end if;

  update public.notas_entrega
     set estado = 'FACTURADA', factura_id = v_id
   where id = any(p_notas);

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Anular la factura, con la factura bloqueada
--
-- La comprobación de "no tiene cobros" solo significa algo si nadie puede
-- registrar uno mientras se comprueba.
-- ---------------------------------------------------------------------------
create or replace function public.anular_factura(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fac    record;
  v_cobros integer;
begin
  perform private.exigir_permiso('VENTAS', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula. Una factura anulada sin motivo no se puede explicar.'
      using errcode = '22023';
  end if;

  select * into v_fac from public.facturas_venta where id = p_id for update;

  if v_fac.id is null then
    raise exception 'No existe la factura %.', p_id using errcode = 'P0002';
  end if;

  if v_fac.estado = 'ANULADA' then
    raise exception 'La factura % ya estaba anulada.', v_fac.numero using errcode = '55000';
  end if;

  select count(*) into v_cobros
  from public.cobros_venta where factura_id = p_id and estado = 'REGISTRADO';

  if v_cobros > 0 then
    raise exception 'La factura % tiene % cobro(s) registrados. Anúlalos primero: el dinero entró y tiene que salir del libro con su propio asiento.',
      v_fac.numero, v_cobros using errcode = '55000';
  end if;

  update public.facturas_venta
     set estado = 'ANULADA',
         motivo_anulacion = trim(p_motivo),
         anulada_por = (select auth.uid()),
         anulada_en = now()
   where id = p_id;

  -- El material salió igual. Las notas vuelven a estar por facturar para que
  -- esa entrega no se pierda con el papel que se anuló.
  update public.notas_entrega
     set estado = 'DESPACHADA', factura_id = null
   where factura_id = p_id and estado = 'FACTURADA';
end;
$$;

-- ---------------------------------------------------------------------------
-- Cobrar, con la factura bloqueada
--
-- Todo lo que toca el saldo de una factura —cobrar, anular el cobro, anular la
-- factura— pasa primero por la fila de la factura. Es la fila que hace de
-- portero: mientras uno la tiene, los demás esperan.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_cobro(
  p_factura_id bigint,
  p_cuenta_id  bigint,
  p_monto      numeric,
  p_metodo     text default 'TRANSFERENCIA',
  p_fecha      date default null,
  p_referencia text default null,
  p_igtf       boolean default null,
  p_nota       text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fac     record;
  v_cuenta  record;
  v_cliente record;
  v_fecha   date := coalesce(p_fecha, current_date);
  v_tasas   record;
  v_saldo   numeric;
  v_monto_usd numeric;
  v_igtf    boolean;
  v_id      bigint;
  v_mov     bigint;
  v_mov_igtf bigint;
  v_igtf_monto numeric;
begin
  perform private.exigir_permiso('VENTAS', 'ESCRITURA');

  -- El portero. Sin esto, dos cobros de $900 sobre una factura de $1.000 leen
  -- los dos "faltan $1.000" y los dos pasan; el saldo se queda en cero por el
  -- greatest y los $800 de más no aparecen en ningún sitio.
  perform 1 from public.facturas_venta where id = p_factura_id for update;

  select * into v_fac from public.v_facturas_venta where id = p_factura_id;

  if v_fac.id is null then
    raise exception 'No existe la factura %.', p_factura_id using errcode = 'P0002';
  end if;

  if v_fac.estado <> 'EMITIDA' then
    raise exception 'La factura % está % y no admite cobros.', v_fac.numero, lower(v_fac.estado)
      using errcode = '55000';
  end if;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

  if v_cuenta.id is null then
    raise exception 'No existe la cuenta %.', p_cuenta_id using errcode = 'P0002';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto del cobro tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se registra un cobro con fecha futura.' using errcode = '22023';
  end if;

  -- El cobro entra en la moneda de la cuenta donde cae el dinero: si el pago
  -- llegó a la cuenta en bolívares, el cobro es en bolívares aunque la factura
  -- esté en dólares. Por eso el saldo se compara en dólares y no en la moneda
  -- de la factura.
  select * into v_tasas from private.tasas_del_dia(v_cuenta.moneda, v_fecha);
  v_monto_usd := round(p_monto * v_tasas.tasa / v_tasas.tasa_usd, 2);
  v_saldo := v_fac.saldo_usd;

  if v_monto_usd > v_saldo + 0.01 then
    raise exception 'A la factura % le faltan % $ y se están abonando % $. Si el cliente pagó de más, regístralo como dos cobros o revisa la tasa del día.',
      v_fac.numero, round(v_saldo, 2), round(v_monto_usd, 2) using errcode = '22023';
  end if;

  -- El IGTF grava los pagos en divisas. Se propone según la moneda de la
  -- cuenta y se puede desactivar: hay cobros exentos y quien registra lo sabe.
  v_igtf := coalesce(p_igtf, v_cuenta.moneda <> 'VES');

  select * into v_cliente from public.clientes where id = v_fac.cliente_id;

  insert into public.cobros_venta
    (numero, factura_id, cuenta_id, fecha, metodo, moneda, tasa, tasa_usd,
     monto, igtf_aplica, referencia, nota, registrado_por)
  values
    (private.siguiente_numero('COB'), p_factura_id, p_cuenta_id, v_fecha,
     coalesce(p_metodo, 'TRANSFERENCIA'), v_cuenta.moneda, v_tasas.tasa, v_tasas.tasa_usd,
     p_monto, v_igtf, nullif(trim(coalesce(p_referencia, '')), ''),
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  select igtf_monto into v_igtf_monto from public.cobros_venta where id = v_id;

  v_mov := private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'INGRESO', 1, p_monto,
    format('COBRO DE LA FACTURA %s', v_fac.numero),
    v_fecha, p_referencia, v_cliente.nombre, null, null, null, p_nota);

  -- El IGTF entra como asiento aparte porque no es de la empresa: es un
  -- impuesto que se recauda y se entrega. Mezclado con el cobro haría creer
  -- que el cliente pagó más de lo que abonó.
  if v_igtf and v_igtf_monto > 0 then
    v_mov_igtf := private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'IGTF', 1, v_igtf_monto,
      format('IGTF COBRADO EN LA FACTURA %s', v_fac.numero),
      v_fecha, p_referencia, v_cliente.nombre, null, null, v_mov, null);
  end if;

  update public.cobros_venta
     set movimiento_id = v_mov, movimiento_igtf_id = v_mov_igtf
   where id = v_id;

  -- Cerrada cuando no queda saldo. El centavo de tolerancia es del redondeo de
  -- las tasas, no de la cuenta.
  if (select saldo_usd from public.v_facturas_venta where id = p_factura_id) <= 0.01 then
    update public.facturas_venta set estado = 'COBRADA' where id = p_factura_id;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Anular el cobro, por el mismo portero
--
-- Se lee el cobro sin bloquearlo solo para saber de qué factura es; después se
-- bloquea la factura y se vuelve a leer el cobro, ya cerrado. El orden importa:
-- siempre la factura primero, igual que en las otras tres, para que nunca haya
-- dos operaciones esperándose en sentidos contrarios.
-- ---------------------------------------------------------------------------
create or replace function public.anular_cobro(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cobro      record;
  v_fac        record;
  v_factura_id bigint;
begin
  perform private.exigir_permiso('VENTAS', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula el cobro.' using errcode = '22023';
  end if;

  select factura_id into v_factura_id from public.cobros_venta where id = p_id;

  if v_factura_id is null then
    raise exception 'No existe el cobro %.', p_id using errcode = 'P0002';
  end if;

  perform 1 from public.facturas_venta where id = v_factura_id for update;

  select * into v_cobro from public.cobros_venta where id = p_id for update;

  if v_cobro.estado = 'ANULADO' then
    raise exception 'El cobro % ya estaba anulado.', v_cobro.numero using errcode = '55000';
  end if;

  select * into v_fac from public.facturas_venta where id = v_cobro.factura_id;

  -- El dinero que entró tiene que salir del libro con su propio asiento. El
  -- libro de tesorería no se edita: se le escribe el contrario.
  perform private.registrar_movimiento_tesoreria(
    v_cobro.cuenta_id, 'REVERSO', -1, v_cobro.monto,
    format('ANULACIÓN DEL COBRO %s DE LA FACTURA %s: %s',
           v_cobro.numero, v_fac.numero, trim(p_motivo)),
    current_date, v_cobro.referencia, null, null, null, v_cobro.movimiento_id, null);

  if v_cobro.igtf_monto > 0 then
    perform private.registrar_movimiento_tesoreria(
      v_cobro.cuenta_id, 'REVERSO', -1, v_cobro.igtf_monto,
      format('ANULACIÓN DEL IGTF DEL COBRO %s', v_cobro.numero),
      current_date, v_cobro.referencia, null, null, null, v_cobro.movimiento_igtf_id, null);
  end if;

  update public.cobros_venta
     set estado = 'ANULADO',
         motivo_anulacion = trim(p_motivo),
         anulado_por = (select auth.uid()),
         anulado_en = now()
   where id = p_id;

  -- Vuelve a deber. Una factura marcada como cobrada con un cobro que se anuló
  -- desaparecería de la cobranza debiendo dinero.
  update public.facturas_venta set estado = 'EMITIDA'
   where id = v_cobro.factura_id and estado = 'COBRADA';
end;
$$;

-- ---------------------------------------------------------------------------
-- Los permisos se vuelven a poner: create or replace conserva los grants, pero
-- dejarlo escrito cuesta menos que descubrir un día que no.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.despachar(bigint, bigint, jsonb, char, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text)',
    'public.anular_nota_entrega(bigint, text)',
    'public.facturar_notas(bigint[], text, date, text)',
    'public.anular_factura(bigint, text)',
    'public.registrar_cobro(bigint, bigint, numeric, text, date, text, boolean, text)',
    'public.anular_cobro(bigint, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant   execute on function %s to authenticated', v_fn);
  end loop;
end
$$;
