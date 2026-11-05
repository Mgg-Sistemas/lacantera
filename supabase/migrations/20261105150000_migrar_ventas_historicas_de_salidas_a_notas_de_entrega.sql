-- ============================================================================
-- MIGRAR 8 VENTAS HISTÓRICAS DE "SALIDA A CONSUMO" A NOTAS DE ENTREGA (05/11/2026)
--
-- Christopher: estas 8 salidas (NS-2026-0004 a NS-2026-0011, del 15 al
-- 17/09/2026) se hicieron antes de que Facturación estuviera lista —de
-- hecho la primera nota de entrega real, NE-2026-0001, es del mismo 17/09—.
-- Nunca tuvieron nota de entrega. Las 8 ya están cobradas; se pidió traerlas
-- a Facturación sin romper el correlativo de NE.
--
-- DOS PROBLEMAS, DOS SOLUCIONES:
--
-- 1. NS-2026-0004 y NS-2026-0005 quedaron en UND en vez de M3 —un error de
--    tipeo: el saldo de ARENA LAVADA en UND hoy es 999.999.979, un número que
--    no significa nada real; nadie más lo usó nunca—. El libro de inventario
--    es inmutable (`private.movimientos_inmutables`, confirmado al intentar
--    un UPDATE directo). Y no se puede «reversar» tampoco: `registrar_movimiento`
--    SIEMPRE toma la unidad del artículo (comprobado en su cuerpo), que para
--    Arena Lavada es M3 —nunca puede escribir UND—, así que un reverso de la
--    fila original saldría en M3 y no cancelaría nada; solo ensuciaría el
--    libro con un +10 M3 que nunca salió. La fila vieja en UND se queda tal
--    cual, inofensiva (nadie más tocó jamás ese balde). Lo que de verdad
--    falta es el movimiento real que nunca se registró: 10 M3 el 15/09, uno
--    por cada nota. Eso es lo que se registra aquí, con la fecha de
--    septiembre pero el número de hoy —el mismo trato que el correlativo de
--    notas de entrega, más abajo—.
--
-- 2. No hay ningún número de NE libre en la fecha real (NE-2026-0001 y 0002
--    ya son del 17/09): la única forma honesta de traerlas sin tocar una nota
--    real es crearlas HOY, con el próximo número de la secuencia de hoy pero
--    con su `fecha` de septiembre —así el correlativo nunca tiene huecos ni
--    duplicados, aunque el número no siga el orden cronológico en esta
--    ventana puntual—. Queda escrito en la observación de cada una.
--
--    Como el material YA SALIÓ del patio en septiembre (`registrar_salidas`,
--    tipo SALIDA_CONSUMO), esto NO puede llamar a `private.despachar` tal
--    cual: esa función vuelve a descontar inventario, y descontaría el mismo
--    material dos veces. Por eso existe esta función aparte —una sola vez,
--    no se usa desde ningún botón—, que hace lo mismo que `despachar` salvo
--    la parte de inventario, y en vez de eso enlaza el renglón al movimiento
--    real de septiembre (`movimiento_id`), para que quede trazable.
--
--    `facturable = false` en las 8: son solo el respaldo en papel de una
--    venta que ya se cobró y ya movió inventario; no deben poder enlazarse a
--    ninguna factura nueva. `pendiente_por_cobrar = false`: ya están cobradas,
--    no son un recordatorio de cobro.
-- ============================================================================

-- ─────────────── 2 · la función de una sola vez ────────────────────────────
create or replace function private.migrar_venta_historica_sin_tocar_inventario(
  p_cliente_id   bigint,
  p_almacen_id   bigint,
  p_renglones    jsonb,
  p_moneda       character,
  p_fecha        date,
  p_vehiculo     text,
  p_observacion  text,
  p_nota_salida  text,
  p_movimiento_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     bigint;
  v_tasas  record;
begin
  perform private.exigir_rol('ADMIN');

  if p_cliente_id is not null and not exists (select 1 from public.clientes where id = p_cliente_id) then
    raise exception 'No existe el cliente %.', p_cliente_id using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.almacenes where id = p_almacen_id) then
    raise exception 'No existe el almacén %.', p_almacen_id using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.inventario_movimientos where id = p_movimiento_id and nota_salida = p_nota_salida) then
    raise exception 'El movimiento % no corresponde a %.', p_movimiento_id, p_nota_salida using errcode = '22023';
  end if;

  select * into v_tasas from private.tasas_del_dia(p_moneda, p_fecha);

  insert into public.notas_entrega
    (numero, cliente_id, almacen_id, fecha, vehiculo, moneda, tasa, tasa_usd,
     alicuota_iva, descuento, flete, observacion, despachada_por,
     pago_combinado, pendiente_por_cobrar, nota_salida, facturable, estado)
  values
    (private.siguiente_numero('NE'), p_cliente_id, p_almacen_id, p_fecha,
     nullif(btrim(coalesce(p_vehiculo, '')), ''), p_moneda, v_tasas.tasa, v_tasas.tasa_usd,
     0, 0, 0, p_observacion, (select auth.uid()),
     false, false, p_nota_salida, false,
     -- Sin cliente identificado en el registro original, la base exige
     -- PENDIENTE (lo completa quien sepa quién fue, igual que una nota
     -- nacida de una salida sin cliente); con cliente, DESPACHADA de una vez.
     case when p_cliente_id is null then 'PENDIENTE' else 'DESPACHADA' end)
  returning id into v_id;

  perform private.cargar_renglones_venta(
    'nota_entrega_renglones', 'nota_id', v_id, p_renglones, p_moneda, p_fecha);

  update public.nota_entrega_renglones set movimiento_id = p_movimiento_id where nota_id = v_id;

  return v_id;
end;
$$;

comment on function private.migrar_venta_historica_sin_tocar_inventario(
  bigint, bigint, jsonb, character, date, text, text, text, bigint
) is
  'Herramienta de una sola vez (05/11/2026): migró 8 salidas de antes de Facturación a notas de entrega sin volver a mover inventario. No la usa nada más; no se reutiliza.';

-- ─────────────── 3 · las 8 notas, impersonando al ADMIN real ───────────────
do $migrar$
declare
  v_mov4 bigint;
  v_mov5 bigint;
begin
  perform set_config('request.jwt.claim.sub', '81fe81bb-5572-4b36-95b5-b4007a798c8b', true);
  perform set_config('request.jwt.claims',
    '{"sub":"81fe81bb-5572-4b36-95b5-b4007a798c8b","role":"authenticated"}', true);

  -- El movimiento real en M3 que faltaba (la fila vieja en UND se deja
  -- intacta; no se reversa, por lo explicado arriba). El tipo original era
  -- SALIDA_BAJA (no SALIDA_CONSUMO, aunque el texto hable de un convenio y
  -- un despacho comercial): se preserva tal cual.
  v_mov4 := private.registrar_movimiento(
    p_tipo => 'SALIDA_BAJA', p_signo => -1, p_almacen => 46, p_articulo => 509,
    p_cantidad => 10, p_costo_usd => null,
    p_nota => 'CONVENIO CON FERRETERIA PARA DONACION. Repone en M3 el movimiento real: NS-2026-0004 había quedado registrada en UND, que no existe para este artículo.',
    p_fecha => '2026-09-15', p_nota_salida => 'NS-2026-0004');

  v_mov5 := private.registrar_movimiento(
    p_tipo => 'SALIDA_BAJA', p_signo => -1, p_almacen => 46, p_articulo => 509,
    p_cantidad => 10, p_costo_usd => null,
    p_nota => 'DESPACHO MATERIAL COMERCIAL. Repone en M3 el movimiento real: NS-2026-0005 había quedado registrada en UND, que no existe para este artículo.',
    p_fecha => '2026-09-15', p_nota_salida => 'NS-2026-0005');

  -- NS-2026-0004 · Convenio de donación, ferretería no identificada en el original.
  perform private.migrar_venta_historica_sin_tocar_inventario(
    null, 46,
    jsonb_build_array(jsonb_build_object(
      'articulo_id', 509, 'cantidad', 10, 'unidad', 'M3', 'condicion', 'SIN_CARGO',
      'motivo_condicion', 'Donación por convenio con una ferretería no identificada en el registro original de la salida (NS-2026-0004), aprobada por Antoni Vargas el 15/09/2026.'
    )),
    'USD', '2026-09-15', null,
    'Migrada el 05/11/2026 desde la salida NS-2026-0004 (convenio de donación), de cuando aún no existía Facturación. No es una venta: no se cobró nada. La cantidad se corrigió de 10 UND a 10 M3.',
    'NS-2026-0004', v_mov4);

  -- NS-2026-0005 · Venta sin comprador ni monto identificado en el original.
  perform private.migrar_venta_historica_sin_tocar_inventario(
    null, 46,
    jsonb_build_array(jsonb_build_object(
      'articulo_id', 509, 'cantidad', 10, 'unidad', 'M3', 'condicion', 'LISTA'
    )),
    'USD', '2026-09-15', null,
    'Migrada el 05/11/2026 desde NS-2026-0005 ("despacho material comercial"), de cuando aún no existía Facturación. No se identificó comprador ni monto en el registro original; se usa el precio de lista. Ya estaba cobrada. La cantidad se corrigió de 10 UND a 10 M3.',
    'NS-2026-0005', v_mov5);

  -- NS-2026-0006 · Yohan Sánchez, depósito Fondo Común.
  perform private.migrar_venta_historica_sin_tocar_inventario(
    122, 46,
    jsonb_build_array(jsonb_build_object(
      'articulo_id', 509, 'cantidad', 2, 'unidad', 'M3', 'condicion', 'LISTA'
    )),
    'USD', '2026-09-15', 'CAMION 350 BLANCO',
    'Migrada el 05/11/2026 desde NS-2026-0006. Depósito recibido el 15/09/2026 desde Fondo Común, por Bs 42.110,34 — ya cobrada.',
    'NS-2026-0006', 839);

  -- NS-2026-0007 · Materiales Osmaira Roe C.A., piedra, patio de planta fija.
  perform private.migrar_venta_historica_sin_tocar_inventario(
    126, 45,
    jsonb_build_array(jsonb_build_object(
      'articulo_id', 513, 'cantidad', 16, 'unidad', 'M3', 'condicion', 'LISTA'
    )),
    'USD', '2026-09-15', 'PLACA A64BI8R',
    'Migrada el 05/11/2026 desde NS-2026-0007. No se especificó el monto cobrado en el registro original; se usa el precio de lista. Ya estaba cobrada.',
    'NS-2026-0007', 856);

  -- NS-2026-0008 · Manuel González, transferencia bancaria.
  perform private.migrar_venta_historica_sin_tocar_inventario(
    141, 46,
    jsonb_build_array(jsonb_build_object(
      'articulo_id', 509, 'cantidad', 28, 'unidad', 'M3', 'condicion', 'LISTA'
    )),
    'USD', '2026-09-16', '2 CAMIONES DE 14 M3 C/U',
    'Migrada el 05/11/2026 desde NS-2026-0008. Pagada el 16/09/2026 por transferencia bancaria, Bs 592.557,00 — ya cobrada.',
    'NS-2026-0008', 891);

  -- NS-2026-0009 · Ferremateriales Victoria, cruce de facturas acordado por Moisés.
  perform private.migrar_venta_historica_sin_tocar_inventario(
    120, 46,
    jsonb_build_array(jsonb_build_object(
      'articulo_id', 509, 'cantidad', 77.76, 'unidad', 'M3', 'condicion', 'ACORDADO',
      'precio_unitario', 25.643004,
      'motivo_condicion', 'Cruce de facturas acordado por Moisés: $1.994,20 para 77,76 m³ (el precio de lista habría dado $1.944,00). Se respeta el monto realmente cruzado.'
    )),
    'USD', '2026-09-16', null,
    'Migrada el 05/11/2026 desde NS-2026-0009. Pago por cruce de facturas con materiales, acordado por Moisés el 16/09/2026 — ya cobrada (liquidada en especie).',
    'NS-2026-0009', 897);

  -- NS-2026-0010 · Materiales Osmaira Roe C.A., entrega por la solicitud SS-2026-0001.
  perform private.migrar_venta_historica_sin_tocar_inventario(
    126, 46,
    jsonb_build_array(jsonb_build_object(
      'articulo_id', 509, 'cantidad', 16, 'unidad', 'M3', 'condicion', 'LISTA'
    )),
    'USD', '2026-09-16', null,
    'Migrada el 05/11/2026 desde NS-2026-0010 (entrega por la solicitud SS-2026-0001). No se especificó el monto cobrado en el registro original; se usa el precio de lista. Ya estaba cobrada.',
    'NS-2026-0010', 903);

  -- NS-2026-0011 · Maite Blanco, entrega por la solicitud SS-2026-0004 (diferencia).
  perform private.migrar_venta_historica_sin_tocar_inventario(
    133, 46,
    jsonb_build_array(jsonb_build_object(
      'articulo_id', 509, 'cantidad', 2, 'unidad', 'M3', 'condicion', 'LISTA'
    )),
    'USD', '2026-09-17', null,
    'Migrada el 05/11/2026 desde NS-2026-0011 (entrega por la solicitud SS-2026-0004, diferencia de 2 m³ más para la Srta. Maite Blanco). Se usa el precio de lista. Ya estaba cobrada.',
    'NS-2026-0011', 920);
end
$migrar$;

-- ─────────────────────────────────── comprobación ───────────────────────────
do $comprueba$
declare
  v_cuantas integer;
begin
  select count(*) into v_cuantas from public.notas_entrega
   where nota_salida in (
     'NS-2026-0004','NS-2026-0005','NS-2026-0006','NS-2026-0007',
     'NS-2026-0008','NS-2026-0009','NS-2026-0010','NS-2026-0011');
  if v_cuantas <> 8 then
    raise exception 'Debían quedar 8 notas migradas y quedaron %.', v_cuantas;
  end if;

  if exists (
    select 1 from public.notas_entrega
     where nota_salida in (
       'NS-2026-0004','NS-2026-0005','NS-2026-0006','NS-2026-0007',
       'NS-2026-0008','NS-2026-0009','NS-2026-0010','NS-2026-0011')
       and (facturable or pendiente_por_cobrar)
  ) then
    raise exception 'Alguna de las 8 quedó facturable o pendiente por cobrar.';
  end if;

  -- La fila vieja en UND queda intacta (inmutable, inofensiva); lo que
  -- importa es que ya exista el movimiento real en M3 que faltaba.
  if exists (
    select nota_salida
      from public.inventario_movimientos
     where nota_salida in ('NS-2026-0004', 'NS-2026-0005')
     group by nota_salida
    having coalesce(sum(cantidad * signo) filter (where unidad = 'M3'), 0) <> -10
  ) then
    raise exception 'NS-2026-0004/0005 no quedaron con su movimiento real de -10 M3.';
  end if;
end
$comprueba$;
