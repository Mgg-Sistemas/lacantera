/*
  LO QUE ENTRA AL LIBRO SE ACEPTA.

  Sin disparadores. La cola es una función que lee las fuentes y resta lo ya
  decidido; aceptar copia al libro con referencia. Así los viajes y las salidas
  de planta siguen funcionando aunque el centro de costo no exista, y nada se
  pierde en silencio: un trigger AFTER INSERT corre en la misma transacción que
  el viaje, y si fallara reventaría el registro del viaje o, envuelto en
  EXCEPTION, se perdería sin que nadie se enterara.

  ═══════════════════════════════════════════════════════════════════════════
  ES SECURITY DEFINER Y NO UNA VISTA
  ═══════════════════════════════════════════════════════════════════════════

  `acarreos` solo la lee quien tiene EXPLOTACION. Una vista `security_invoker`
  devolvería CERO FILAS sin error a quien tenga COSTOS y nada más — el fallo
  que este repositorio ya cazó dos veces (el vale de combustible, el detalle
  del centro de costos viejo). La función lee las fuentes saltándose su RLS y
  pone su propia reja de COSTOS dentro.

  Y el dinero del viaje se tapa AQUÍ con la misma reja de `v_acarreos`: quien
  no tiene EXPLOTACION.VER_PAGO_VIAJES recibe el precio en blanco, y aceptar
  un viaje que cobra vuelve a exigir la casilla. Abrir `acarreos` a COSTOS por
  RLS habría filtrado la columna entera, porque RLS es por fila.

  Tercera pieza de siete.
*/

-- ---------------------------------------------------------------------------
-- 0. Las salidas de planta, en esqueleto
--
-- La función de candidatos las lee, y la pieza 5 las completa con sus puertas
-- y su pantalla. Va aquí el `create table if not exists` para que esta
-- migración compile sola; la 5 repite el mismo DDL sin efecto.
-- ---------------------------------------------------------------------------
create table if not exists public.salidas_planta (
  id              bigint generated always as identity primary key,
  numero          text unique,
  fecha           date not null,
  vehiculo_id     bigint not null references public.vehiculos(id),
  producto_id     bigint not null references public.articulos(id),
  m3              numeric(12,2) check (m3 is null or m3 > 0),
  cliente_id      bigint references public.clientes(id),
  nota_entrega_id bigint references public.notas_entrega(id),
  nota            text,
  estado          text not null default 'REGISTRADO' check (estado in ('REGISTRADO', 'ANULADO')),
  motivo_anulacion text,
  anulado_por     uuid references auth.users(id),
  anulado_en      timestamptz,
  registrado_por  uuid references auth.users(id),
  registrado_en   timestamptz not null default now(),
  constraint salida_anulada_con_motivo check ((estado = 'ANULADO') = (motivo_anulacion is not null))
);

alter table public.salidas_planta enable row level security;
revoke all on public.salidas_planta from anon, authenticated;
grant select on public.salidas_planta to authenticated;

-- Una salida de planta no es costo: es la medida. Tiene su propia clase para
-- que el libro no la disfrace de viaje.
alter table public.costo_movimientos drop constraint if exists costo_movimientos_clase_check;
alter table public.costo_movimientos add constraint costo_movimientos_clase_check
  check (clase in ('ENTREGA', 'ABONO', 'VIAJE', 'SALIDA', 'COMBUSTIBLE', 'NOMINA', 'COMPRA', 'GASTO', 'FIJO'));

-- ---------------------------------------------------------------------------
-- 1. Lo que está por aceptar
-- ---------------------------------------------------------------------------
create or replace function public.costo_candidatos(p_caja_id bigint default null)
returns table (
  origen      text,
  origen_id   bigint,
  fecha       date,
  descripcion text,
  clase       text,
  moneda      text,
  monto       numeric,
  m3          numeric,
  producto_id bigint,
  medida      text,
  vehiculo_id bigint,
  placa       text,
  aviso       text
)
language plpgsql security definer set search_path to ''
as $$
declare
  v_caja    public.costo_cajas;
  v_ve_pago boolean := private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES');
begin
  perform private.exigir_permiso('COSTOS', 'LECTURA');

  if p_caja_id is null then
    v_caja := private.costo_caja_abierta(false);
  else
    select * into v_caja from public.costo_cajas c where c.id = p_caja_id;
    if v_caja.id is null then
      raise exception 'Esa caja no existe.' using errcode = 'P0002';
    end if;
  end if;

  return query
  with mediana as (
    -- Solo la coraza tiene precio tecleado; los otros tramos van por tarifa y
    -- no pueden salirse de lo usual.
    select percentile_cont(0.5) within group (order by a.precio_usd) as p
      from public.acarreos a
     where a.estado = 'REGISTRADO'
       and a.tramo = 'MINA_BASE'
       and a.precio_usd > 0
       and date_trunc('month', a.fecha) = date_trunc('month', private.hoy_aqui())
  )
  -- Viajes: el precio solo de terceros y solo para quien puede verlo; los m³
  -- en todos, camión propio incluido.
  select 'ACARREO'::text,
         a.id,
         a.fecha,
         ('Viaje ' || a.secuencia || ' · ' || v.placa || ' · ' || a.transportista || ' · ' ||
          case a.tramo when 'MINA_PLANTA' then 'a planta fija'
                       when 'PLANTA_LAVADO' then 'a lavado'
                       else 'coraza a base' end)::text,
         'VIAJE'::text,
         'USD'::text,
         case when v.propio then null
              when v_ve_pago then a.precio_usd end::numeric,
         a.carga_m3,
         null::bigint,
         case when a.carga_m3 is null then null else 'MINA' end::text,
         a.vehiculo_id,
         v.placa,
         case
           when not v.propio and a.precio_usd <= 0 then 'SIN_PRECIO'
           when not v.propio and a.tramo = 'MINA_BASE' and md.p > 0 and a.precio_usd > md.p * 3 then 'PRECIO_RARO'
           when a.carga_m3 is null then 'SIN_M3'
         end::text
    from public.acarreos a
    join public.vehiculos v on v.id = a.vehiculo_id
    left join mediana md on true
   where a.estado = 'REGISTRADO'
     and not exists (select 1 from public.costo_decisiones d
                      where d.origen = 'ACARREO' and d.origen_id = a.id and d.deshecha_en is null)

  union all
  -- Salidas de planta: la medida, sin dinero.
  select 'SALIDA_PLANTA',
         s.id,
         s.fecha,
         ('Salida ' || s.numero || ' · ' || v.placa || ' · ' || ar.nombre)::text,
         'SALIDA',
         'USD',
         null::numeric,
         s.m3,
         s.producto_id,
         case when s.m3 is null then null else 'PLANTA' end,
         s.vehiculo_id,
         v.placa,
         case when s.m3 is null then 'SIN_M3' end
    from public.salidas_planta s
    join public.vehiculos v on v.id = s.vehiculo_id
    join public.articulos ar on ar.id = s.producto_id
   where s.estado = 'REGISTRADO'
     and not exists (select 1 from public.costo_decisiones d
                      where d.origen = 'SALIDA_PLANTA' and d.origen_id = s.id and d.deshecha_en is null)

  union all
  -- Gastos fijos: uno por caja, con fecha dentro de ella.
  select 'FIJO',
         f.id,
         greatest(v_caja.fecha_inicio, least(private.hoy_aqui(), coalesce(v_caja.fecha_fin, private.hoy_aqui()))),
         f.nombre,
         'FIJO',
         f.moneda::text,
         f.monto,
         null, null, null, null, null,
         null
    from public.costo_gastos_fijos f
   where f.activo
     and not exists (select 1 from public.costo_decisiones d
                      where d.caja_id = v_caja.id and d.origen = 'FIJO' and d.origen_id = f.id
                        and d.deshecha_en is null)
  order by 3, 1, 2;
end;
$$;

comment on function public.costo_candidatos(bigint) is
  'Lo que esta por aceptar: viajes, salidas de planta y gastos fijos, menos lo '
  'ya decidido. El precio del viaje llega en blanco a quien no tiene '
  'EXPLOTACION.VER_PAGO_VIAJES.';

-- ---------------------------------------------------------------------------
-- 2. Aceptar: se recalcula desde la fuente, no se confía en la pantalla
-- ---------------------------------------------------------------------------
create or replace function public.costo_aceptar(
  p_origen    text,
  p_origen_id bigint,
  p_monto     numeric default null,
  p_nota      text default null
) returns bigint
language plpgsql security definer set search_path to ''
as $$
declare
  v_caja  public.costo_cajas;
  v_c     record;
  v_a     record;
  v_monto numeric;
  v_cat   text;
  v_mov   bigint;
begin
  perform private.exigir_accion('COSTOS.ACEPTAR');
  v_caja := private.costo_caja_abierta(true);

  if exists (select 1 from public.costo_decisiones d
              where d.origen = p_origen and d.origen_id = p_origen_id and d.deshecha_en is null
                and (p_origen <> 'FIJO' or d.caja_id = v_caja.id)) then
    raise exception 'Eso ya se decidio.' using errcode = '55000';
  end if;

  select * into v_c from public.costo_candidatos(v_caja.id) k
   where k.origen = p_origen and k.origen_id = p_origen_id;

  if v_c.origen is null then
    raise exception 'Eso no esta por aceptar.' using errcode = 'P0002';
  end if;

  if v_c.aviso = 'SIN_PRECIO' then
    raise exception 'Ese viaje no tiene precio. Corrigelo en Viajes de camiones antes de aceptarlo.'
      using errcode = '55000';
  end if;

  if p_origen = 'ACARREO' then
    select a.precio_usd, v.propio into v_a
      from public.acarreos a join public.vehiculos v on v.id = a.vehiculo_id
     where a.id = p_origen_id;

    -- Un camión propio no cobra: sus viajes entran solo por los m³.
    if v_a.propio then
      v_monto := 0;
    else
      -- Copiar el precio al libro es ver el pago. La casilla se exige aquí y
      -- no solo en la función de candidatos, porque este RPC recibe un id.
      perform private.exigir_accion('EXPLOTACION.VER_PAGO_VIAJES');
      v_monto := v_a.precio_usd;
    end if;

  elsif p_origen = 'FIJO' then
    v_monto := coalesce(p_monto, v_c.monto);
    if v_monto <= 0 then
      raise exception 'El monto del gasto fijo tiene que ser mayor que cero.' using errcode = '22023';
    end if;
    select f.categoria into v_cat from public.costo_gastos_fijos f where f.id = p_origen_id;

  else
    v_monto := coalesce(v_c.monto, 0);
  end if;

  v_mov := private.costo_escribir(
    v_c.fecha, v_c.descripcion, v_c.clase, v_c.moneda, v_monto,
    p_origen, p_origen_id, v_c.m3, v_c.producto_id, v_c.medida,
    v_cat, null, v_c.vehiculo_id, p_nota);

  insert into public.costo_decisiones (caja_id, origen, origen_id, decision, movimiento_id, decidido_por)
  values (v_caja.id, p_origen, p_origen_id, 'ACEPTADA', v_mov, (select auth.uid()));

  return v_mov;
end;
$$;

comment on function public.costo_aceptar(text, bigint, numeric, text) is
  'Copia al libro algo que esta por aceptar. Recalcula desde la fuente; un '
  'gasto fijo admite otro monto. Para el precio de un viaje exige ver el pago.';

-- Solo viajes y salidas: son las fuentes de mucho volumen y poco riesgo por
-- fila. Lo que trae aviso se salta y se dice cuántos.
create or replace function public.costo_aceptar_dia(p_fecha date, p_origen text)
returns table (aceptados integer, saltados integer)
language plpgsql security definer set search_path to ''
as $$
declare v_k record; v_ok integer := 0; v_no integer := 0;
begin
  perform private.exigir_accion('COSTOS.ACEPTAR');

  if p_origen not in ('ACARREO', 'SALIDA_PLANTA') then
    raise exception 'Solo los viajes y las salidas de planta se aceptan por dia.' using errcode = '22023';
  end if;

  for v_k in
    select * from public.costo_candidatos() k where k.origen = p_origen and k.fecha = p_fecha
  loop
    if v_k.aviso in ('SIN_PRECIO', 'SIN_M3', 'PRECIO_RARO') then
      v_no := v_no + 1;
    else
      perform public.costo_aceptar(v_k.origen, v_k.origen_id);
      v_ok := v_ok + 1;
    end if;
  end loop;

  return query select v_ok, v_no;
end;
$$;

create or replace function public.costo_rechazar(p_origen text, p_origen_id bigint, p_motivo text)
returns bigint
language plpgsql security definer set search_path to ''
as $$
declare v_caja public.costo_cajas; v_id bigint;
begin
  perform private.exigir_accion('COSTOS.RECHAZAR');

  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Hay que decir por que se rechaza.'
      using errcode = '22023',
            hint = 'Queda en el registro con tu nombre y la hora.';
  end if;

  v_caja := private.costo_caja_abierta(true);

  if not exists (select 1 from public.costo_candidatos(v_caja.id) k
                  where k.origen = p_origen and k.origen_id = p_origen_id) then
    raise exception 'Eso no esta por aceptar.' using errcode = 'P0002';
  end if;

  insert into public.costo_decisiones (caja_id, origen, origen_id, decision, motivo, decidido_por)
  values (v_caja.id, p_origen, p_origen_id, 'RECHAZADA', btrim(p_motivo), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

-- Deshacer pide Total y no Escritura a propósito: un viaje incómodo no puede
-- entrar y salir de la tasa según convenga a quien mira el número esa semana.
create or replace function public.costo_deshacer_rechazo(p_decision_id bigint)
returns void
language plpgsql security definer set search_path to ''
as $$
declare v_d record;
begin
  perform private.exigir_accion('COSTOS.DESHACER_RECHAZO');

  select d.*, c.estado as caja_estado into v_d
    from public.costo_decisiones d
    join public.costo_cajas c on c.id = d.caja_id
   where d.id = p_decision_id
     for update of d;

  if v_d.id is null then
    raise exception 'Esa decision no existe.' using errcode = 'P0002';
  end if;
  if v_d.decision <> 'RECHAZADA' then
    raise exception 'Solo se deshace un rechazo.' using errcode = '55000';
  end if;
  if v_d.deshecha_en is not null then
    raise exception 'Ese rechazo ya se deshizo.' using errcode = '55000';
  end if;
  if v_d.caja_estado <> 'ABIERTA' then
    raise exception 'La caja ya cerro: el rechazo queda firme.' using errcode = '55000';
  end if;

  update public.costo_decisiones
     set deshecha_por = (select auth.uid()), deshecha_en = now()
   where id = p_decision_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reversos: aceptados cuyo origen se anuló después
--
-- El reverso cae en la caja ABIERTA con la fecha de hoy. Si la fila original
-- era de una caja cerrada, `costo_escribir` lo marca llegado tarde solo si la
-- fecha es anterior al inicio de la abierta; con la fecha de hoy nunca lo es,
-- así que se enseña en la caja corriente como lo que es: una corrección de
-- hoy.
-- ---------------------------------------------------------------------------
create or replace function public.costo_reversos_pendientes()
returns table (
  movimiento_id bigint,
  fecha         date,
  descripcion   text,
  monto_usd     numeric,
  m3            numeric,
  motivo        text
)
language plpgsql security definer set search_path to ''
as $$
begin
  perform private.exigir_permiso('COSTOS', 'LECTURA');

  return query
  select m.id, m.fecha, m.descripcion, m.monto_usd, m.m3,
         coalesce(a.motivo_anulacion, s.motivo_anulacion)
    from public.costo_movimientos m
    left join public.acarreos a       on m.origen = 'ACARREO' and a.id = m.origen_id
    left join public.salidas_planta s on m.origen = 'SALIDA_PLANTA' and s.id = m.origen_id
   where m.sentido = 'ORIGINAL'
     and ((m.origen = 'ACARREO' and a.estado = 'ANULADO')
       or (m.origen = 'SALIDA_PLANTA' and s.estado = 'ANULADO'))
     and not exists (select 1 from public.costo_movimientos r where r.reversa_a = m.id)
   order by m.fecha, m.id;
end;
$$;

create or replace function public.costo_reversar(p_movimiento_id bigint, p_motivo text)
returns bigint
language plpgsql security definer set search_path to ''
as $$
declare v_m public.costo_movimientos;
begin
  perform private.exigir_accion('COSTOS.ACEPTAR');

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Hay que decir por que se reversa.' using errcode = '22023';
  end if;

  select * into v_m from public.costo_movimientos where id = p_movimiento_id for update;

  if v_m.id is null then
    raise exception 'Ese movimiento no existe.' using errcode = 'P0002';
  end if;
  if v_m.sentido = 'REVERSO' then
    raise exception 'Un reverso no se reversa.' using errcode = '55000';
  end if;
  if exists (select 1 from public.costo_movimientos r where r.reversa_a = v_m.id) then
    raise exception 'Ese movimiento ya tiene reverso.' using errcode = '55000';
  end if;

  return private.costo_escribir(
    private.hoy_aqui(), 'Reverso · ' || v_m.descripcion, v_m.clase, v_m.moneda, v_m.monto,
    v_m.origen, v_m.origen_id, v_m.m3, v_m.producto_id, v_m.medida, v_m.categoria,
    v_m.origen_fondo, v_m.vehiculo_id, btrim(p_motivo), 'REVERSO', v_m.id);
end;
$$;

revoke execute on function public.costo_candidatos(bigint) from public, anon;
grant  execute on function public.costo_candidatos(bigint) to authenticated;
revoke execute on function public.costo_aceptar(text, bigint, numeric, text) from public, anon;
grant  execute on function public.costo_aceptar(text, bigint, numeric, text) to authenticated;
revoke execute on function public.costo_aceptar_dia(date, text) from public, anon;
grant  execute on function public.costo_aceptar_dia(date, text) to authenticated;
revoke execute on function public.costo_rechazar(text, bigint, text) from public, anon;
grant  execute on function public.costo_rechazar(text, bigint, text) to authenticated;
revoke execute on function public.costo_deshacer_rechazo(bigint) from public, anon;
grant  execute on function public.costo_deshacer_rechazo(bigint) to authenticated;
revoke execute on function public.costo_reversos_pendientes() from public, anon;
grant  execute on function public.costo_reversos_pendientes() to authenticated;
revoke execute on function public.costo_reversar(bigint, text) from public, anon;
grant  execute on function public.costo_reversar(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Un viaje aceptado no se corrige: se anula y se carga de nuevo
--
-- Es el cuerpo de `20260912110953` con una comprobación más. Si se dejara
-- corregir el precio o la carga de un viaje ya copiado, el libro se quedaría
-- con el monto viejo para siempre y nada lo señalaría. Anular sí deja rastro:
-- aparece en reversos pendientes.
-- ---------------------------------------------------------------------------
create or replace function public.corregir_acarreo(
  p_id         bigint,
  p_hora       time default null,
  p_carga_m3   numeric default null,
  p_precio_usd numeric default null,
  p_nota       text default null
) returns void
language plpgsql security definer set search_path to ''
as $$
declare v_a record; v_cap numeric;
begin
  perform private.exigir_accion('EXPLOTACION.REGISTRAR_VIAJES');

  select a.id, a.estado, a.vehiculo_id into v_a
    from public.acarreos a where a.id = p_id;

  if v_a.id is null then
    raise exception 'Ese viaje no existe.' using errcode = 'P0002';
  end if;

  if v_a.estado = 'ANULADO' then
    raise exception 'Ese viaje esta anulado: lo anulado no se corrige.'
      using errcode = '55000',
            hint = 'Si hizo falta, registra el viaje de nuevo.';
  end if;

  if exists (select 1 from public.costo_decisiones d
              where d.origen = 'ACARREO' and d.origen_id = p_id
                and d.decision = 'ACEPTADA' and d.deshecha_en is null) then
    raise exception 'Ese viaje ya entro al centro de costo. Anulalo y cargalo de nuevo.'
      using errcode = '55000',
            hint = 'El anulado aparece en el centro de costo para reversarlo.';
  end if;

  if p_carga_m3 is not null then
    select v.capacidad_m3 into v_cap from public.vehiculos v where v.id = v_a.vehiculo_id;
    if p_carga_m3 <= 0 then
      raise exception 'La carga tiene que ser mayor que cero.' using errcode = '22023';
    end if;
    if p_carga_m3 > v_cap then
      raise exception 'Ese camion no carga %, le caben %.', p_carga_m3, v_cap
        using errcode = '22023';
    end if;
  end if;

  if p_precio_usd is not null and p_precio_usd < 0 then
    raise exception 'El precio del viaje no puede ser negativo.' using errcode = '22023';
  end if;

  update public.acarreos
     set hora       = coalesce(p_hora, hora),
         carga_m3   = coalesce(p_carga_m3, carga_m3),
         precio_usd = coalesce(p_precio_usd, precio_usd),
         nota       = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), nota)
   where id = p_id;
end;
$$;

comment on function public.corregir_acarreo(bigint, time, numeric, numeric, text) is
  'Arregla la hora, la carga, el precio o la nota de un viaje vivo que no haya '
  'entrado al centro de costo. Lo que no se manda se queda como esta.';
