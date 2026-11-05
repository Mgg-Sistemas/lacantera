-- ============================================================================
-- REGISTROS DE PAGOS: LOS DEPÓSITOS DEL BANCO Y LAS NOTAS QUE PAGAN (06/11/2026)
--
-- Christopher: un apartado en Ventas que muestre los pagos que llegaron al
-- banco y, al tocar uno, las notas de entrega que ese pago cubre. Un pago
-- puede cubrir varias notas, y una nota puede quedar repartida en más de un
-- pago. Todo editable; las diferencias mínimas se ajustan.
--
-- A PROPÓSITO NO VA EN TESORERÍA. `tesoreria_movimientos` es el libro de las
-- cuentas y mueve sus saldos; meter ahí la caja de septiembre cambiaría
-- números de otro módulo. Esto es solo un registro: no cobra notas, no toca
-- inventario ni montos de las notas. Relaciona y muestra.
--
-- LA DIFERENCIA MÍNIMA SE AJUSTA EN EL ENLACE, NO EN LA NOTA. Cada enlace
-- pago↔nota lleva su `monto_aplicado` (en la moneda del pago), que nace igual
-- al total de la nota y se puede corregir para absorber el redondeo de la
-- tasa. La nota de entrega no se toca nunca desde aquí.
--
-- PERMISOS: ver, cualquiera con Ventas. Registrar, importar, editar, anular y
-- asociar, la acción `VENTAS.REGISTRAR_PAGOS` — un permiso extendido que
-- ningún nivel de módulo regala (se da persona por persona); ADMIN la pasa por
-- derecho propio. Las notas se leen por funciones con `security definer`
-- porque su tabla solo la ven Salidas y Facturación, y quien entra por Ventas
-- tiene que poder ver qué notas cubre un pago.
--
-- NADA SE BORRA: un pago se anula con motivo; un enlace se quita marcándolo
-- (`quitado_en`), y la bitácora guarda el antes y el después.
-- ============================================================================

-- ─────────────────────────────── el permiso ─────────────────────────────────
insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente)
values (
  'VENTAS.REGISTRAR_PAGOS', 'VENTAS',
  'Registrar pagos del banco y asociarlos a notas',
  'En Ventas › Registros de pagos: registrar, importar, editar y anular los pagos que llegaron al banco, y asociarles las notas de entrega que cubren. No la concede ningún nivel de módulo: hay que dársela a la persona.',
  60, null
)
on conflict (codigo) do update
   set modulo = excluded.modulo, nombre = excluded.nombre, dice = excluded.dice,
       orden = excluded.orden, nivel_equivalente = excluded.nivel_equivalente;

-- ─────────────────────────────── los pagos ──────────────────────────────────
create table if not exists public.pagos_bancarios (
  id               bigint generated always as identity primary key,
  fecha            date not null,
  moneda           text not null references public.monedas(codigo),
  monto            numeric(20,2) not null check (monto > 0),
  tasa             numeric(20,6) check (tasa is null or tasa > 0),
  monto_usd        numeric(20,2),
  referencia       text,
  descripcion      text,
  registrado_por   uuid not null,
  registrado_en    timestamptz not null default now(),
  anulado_en       timestamptz,
  anulado_por      uuid,
  motivo_anulacion text
);

comment on table public.pagos_bancarios is
  'Pagos recibidos en el banco, para relacionarlos con las notas de entrega que cubren (Ventas › Registros de pagos). No es el libro de Tesorería: no mueve saldos.';

create index if not exists pagos_bancarios_fecha on public.pagos_bancarios (fecha);

alter table public.pagos_bancarios enable row level security;
create policy pagos_bancarios_lectura on public.pagos_bancarios
  for select to authenticated using (private.tiene_permiso('VENTAS', 'LECTURA'));

create trigger trg_auditar
  after insert or update or delete on public.pagos_bancarios
  for each row execute function private.auditar('id');

create trigger trg_normalizar
  before insert or update on public.pagos_bancarios
  for each row execute function private.normalizar_texto('referencia', 'descripcion', 'motivo_anulacion');

-- ─────────────────────────────── los enlaces ────────────────────────────────
create table if not exists public.pagos_bancarios_notas (
  id              bigint generated always as identity primary key,
  pago_id         bigint not null references public.pagos_bancarios(id),
  nota_id         bigint not null references public.notas_entrega(id),
  monto_aplicado  numeric(20,2) not null check (monto_aplicado > 0),
  asociado_por    uuid not null,
  asociado_en     timestamptz not null default now(),
  quitado_por     uuid,
  quitado_en      timestamptz
);

comment on column public.pagos_bancarios_notas.monto_aplicado is
  'Cuánto de este pago cubre esta nota, en la moneda del pago. Nace igual al total de la nota y se ajusta para absorber diferencias de redondeo. No cambia la nota.';

create unique index if not exists pagos_bancarios_notas_vigente
  on public.pagos_bancarios_notas (pago_id, nota_id) where quitado_en is null;
create index if not exists pagos_bancarios_notas_nota
  on public.pagos_bancarios_notas (nota_id) where quitado_en is null;

alter table public.pagos_bancarios_notas enable row level security;
create policy pagos_bancarios_notas_lectura on public.pagos_bancarios_notas
  for select to authenticated using (private.tiene_permiso('VENTAS', 'LECTURA'));

create trigger trg_auditar
  after insert or update or delete on public.pagos_bancarios_notas
  for each row execute function private.auditar('id');

-- ─────────────────────────────── ayudantes ──────────────────────────────────

-- Lo que vale una nota en la moneda del pago. Bs y $ salen directos de la
-- nota, con la tasa que se congeló al emitirla; otra moneda, por el dólar.
create or replace function private.nota_en_moneda_del_pago(p_nota_id bigint, p_pago_id bigint)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select round(case
           when n.moneda = p.moneda then n.total
           when p.moneda = 'VES' then n.total_bs
           when p.moneda = 'USD' then n.total_usd
           else n.total_usd * p.monto / nullif(p.monto_usd, 0)
         end, 2)
    from public.notas_entrega n, public.pagos_bancarios p
   where n.id = p_nota_id and p.id = p_pago_id;
$$;

-- Hasta cuánto se considera redondeo: el 0,01 % del pago, nunca menos de
-- Bs 1 o un centavo de otra moneda.
create or replace function private.pago_tolerancia(p_monto numeric, p_moneda text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select greatest(case when p_moneda = 'VES' then 1 else 0.01 end, abs(p_monto) * 0.0001);
$$;

-- El equivalente en dólares: con la tasa que trae la fila si la trae; si no,
-- con la del BCV de ese día.
create or replace function private.pago_en_dolares(p_monto numeric, p_moneda text, p_tasa numeric, p_fecha date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select round(case
           when p_moneda = 'USD' then p_monto
           when p_moneda = 'VES' and p_tasa is not null then p_monto / p_tasa
           else private.en_dolares(p_monto, p_moneda::character(3), p_fecha)
         end, 2);
$$;

-- ─────────────────────────────── leer ───────────────────────────────────────

create or replace function public.listar_pagos_bancarios(
  p_desde date default null,
  p_hasta date default null
)
returns table (
  id bigint, fecha date, moneda text, monto numeric, tasa numeric, monto_usd numeric,
  referencia text, descripcion text, registrado_en timestamptz, registrado_por_nombre text,
  anulado_en timestamptz, motivo_anulacion text,
  notas integer, aplicado numeric, diferencia numeric, estado text,
  numeros text, clientes text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_permiso('VENTAS', 'LECTURA');

  return query
  select p.id, p.fecha, p.moneda, p.monto, p.tasa, p.monto_usd,
         p.referencia, p.descripcion, p.registrado_en, pr.nombre,
         p.anulado_en, p.motivo_anulacion,
         coalesce(e.notas, 0)::integer,
         coalesce(e.aplicado, 0),
         p.monto - coalesce(e.aplicado, 0),
         case
           when p.anulado_en is not null then 'ANULADO'
           when coalesce(e.notas, 0) = 0 then 'SIN_NOTAS'
           when abs(p.monto - e.aplicado) < 0.005 then 'CUADRA'
           when abs(p.monto - e.aplicado) <= private.pago_tolerancia(p.monto, p.moneda) then 'MINIMA'
           else 'DIFERENCIA'
         end,
         e.numeros, e.clientes
    from public.pagos_bancarios p
    left join public.perfiles pr on pr.id = p.registrado_por
    left join lateral (
      select count(*) as notas,
             sum(l.monto_aplicado) as aplicado,
             string_agg(n.numero, ', ' order by n.numero) as numeros,
             string_agg(distinct cl.nombre, ', ') as clientes
        from public.pagos_bancarios_notas l
        join public.notas_entrega n on n.id = l.nota_id
        left join public.clientes cl on cl.id = n.cliente_id
       where l.pago_id = p.id and l.quitado_en is null
    ) e on true
   where (p_desde is null or p.fecha >= p_desde)
     and (p_hasta is null or p.fecha <= p_hasta)
   order by p.fecha desc, p.id desc
   limit 2000;
end;
$$;

create or replace function public.notas_de_pago_bancario(p_pago_id bigint)
returns table (
  enlace_id bigint, nota_id bigint, numero text, fecha date, cliente text,
  moneda text, total numeric, total_bs numeric, total_usd numeric,
  en_moneda_del_pago numeric, monto_aplicado numeric, estado text, otros_pagos integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_permiso('VENTAS', 'LECTURA');

  return query
  select l.id, n.id, n.numero, n.fecha, cl.nombre,
         n.moneda::text, n.total, n.total_bs, n.total_usd,
         private.nota_en_moneda_del_pago(n.id, l.pago_id),
         l.monto_aplicado, n.estado,
         (select count(*)::integer from public.pagos_bancarios_notas o
           join public.pagos_bancarios op on op.id = o.pago_id
          where o.nota_id = n.id and o.pago_id <> l.pago_id
            and o.quitado_en is null and op.anulado_en is null)
    from public.pagos_bancarios_notas l
    join public.notas_entrega n on n.id = l.nota_id
    left join public.clientes cl on cl.id = n.cliente_id
   where l.pago_id = p_pago_id and l.quitado_en is null
   order by n.fecha, n.numero;
end;
$$;

-- Las candidatas para un pago: sin texto, las de una semana antes o después,
-- de la más parecida en monto a la menos; con texto, cualquier nota cuyo
-- número o cliente lo contenga.
create or replace function public.notas_candidatas_pago_bancario(p_pago_id bigint, p_texto text default null)
returns table (
  nota_id bigint, numero text, fecha date, cliente text, moneda text,
  total numeric, en_moneda_del_pago numeric, otros_pagos integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pago     public.pagos_bancarios;
  v_restante numeric;
  v_texto    text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  perform private.exigir_permiso('VENTAS', 'LECTURA');

  select * into v_pago from public.pagos_bancarios where id = p_pago_id;
  if v_pago.id is null then
    raise exception 'Ese pago no existe.' using errcode = 'P0002';
  end if;

  select v_pago.monto - coalesce(sum(l.monto_aplicado), 0) into v_restante
    from public.pagos_bancarios_notas l
   where l.pago_id = p_pago_id and l.quitado_en is null;

  return query
  select n.id, n.numero, n.fecha, cl.nombre, n.moneda::text, n.total,
         private.nota_en_moneda_del_pago(n.id, p_pago_id),
         (select count(*)::integer from public.pagos_bancarios_notas o
           join public.pagos_bancarios op on op.id = o.pago_id
          where o.nota_id = n.id and o.quitado_en is null and op.anulado_en is null)
    from public.notas_entrega n
    left join public.clientes cl on cl.id = n.cliente_id
   where n.estado <> 'ANULADA'
     and not exists (select 1 from public.pagos_bancarios_notas l
                      where l.pago_id = p_pago_id and l.nota_id = n.id and l.quitado_en is null)
     and (case
            when v_texto is null then n.fecha between v_pago.fecha - 7 and v_pago.fecha + 7
            else n.numero ilike '%' || v_texto || '%' or cl.nombre ilike '%' || v_texto || '%'
          end)
   order by abs(private.nota_en_moneda_del_pago(n.id, p_pago_id) - v_restante), n.fecha desc
   limit 40;
end;
$$;

-- ─────────────────────────────── escribir ───────────────────────────────────

create or replace function public.registrar_pago_bancario(
  p_fecha       date,
  p_moneda      text,
  p_monto       numeric,
  p_tasa        numeric default null,
  p_referencia  text default null,
  p_descripcion text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_moneda text := upper(btrim(coalesce(p_moneda, '')));
  v_id     bigint;
begin
  perform private.exigir_accion('VENTAS.REGISTRAR_PAGOS');

  if p_fecha is null then
    raise exception 'Falta la fecha del pago.' using errcode = '22023';
  end if;
  if p_fecha > current_date then
    raise exception 'La fecha del pago no puede ser futura.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.monedas where codigo = v_moneda) then
    raise exception 'Esa moneda no existe.' using errcode = '22023';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  insert into public.pagos_bancarios
    (fecha, moneda, monto, tasa, monto_usd, referencia, descripcion, registrado_por)
  values
    (p_fecha, v_moneda, round(p_monto, 2),
     case when v_moneda = 'USD' then null else p_tasa end,
     private.pago_en_dolares(p_monto, v_moneda, p_tasa, p_fecha),
     nullif(btrim(coalesce(p_referencia, '')), ''),
     nullif(btrim(coalesce(p_descripcion, '')), ''),
     (select auth.uid()))
  returning id into v_id;

  -- Sin tasa en la fila, se guarda la que resultó del BCV de ese día.
  update public.pagos_bancarios
     set tasa = round(monto / nullif(monto_usd, 0), 6)
   where id = v_id and moneda = 'VES' and tasa is null;

  return v_id;
end;
$$;

-- Importar muchas filas de una vez (pegadas de Excel o de un archivo). Todo
-- o nada: si una fila está mal, no entra ninguna y se dice cuál. Una fila
-- idéntica a un pago que ya está (misma fecha, moneda, monto y referencia) se
-- salta, para que importar dos veces el mismo archivo no duplique.
create or replace function public.importar_pagos_bancarios(p_filas jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fila      jsonb;
  v_i         integer := 0;
  v_nuevos    integer := 0;
  v_repetidos integer := 0;
  v_fecha     date;
  v_moneda    text;
  v_monto     numeric;
  v_ref       text;
begin
  perform private.exigir_accion('VENTAS.REGISTRAR_PAGOS');

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'No hay filas que importar.' using errcode = '22023';
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_i := v_i + 1;
    begin
      v_fecha := (v_fila ->> 'fecha')::date;
      v_monto := (v_fila ->> 'monto')::numeric;
    exception when others then
      raise exception 'Fila %: la fecha o el monto no se entienden.', v_i using errcode = '22023';
    end;
    v_moneda := upper(btrim(coalesce(v_fila ->> 'moneda', '')));
    v_ref := nullif(upper(btrim(coalesce(v_fila ->> 'referencia', ''))), '');

    if exists (
      select 1 from public.pagos_bancarios p
       where p.fecha = v_fecha and p.moneda = v_moneda and p.monto = round(v_monto, 2)
         and coalesce(p.referencia, '') = coalesce(v_ref, '')
         and p.anulado_en is null
    ) then
      v_repetidos := v_repetidos + 1;
      continue;
    end if;

    begin
      perform public.registrar_pago_bancario(
        v_fecha, v_moneda, v_monto,
        nullif(v_fila ->> 'tasa', '')::numeric,
        v_ref,
        v_fila ->> 'descripcion');
    exception when others then
      raise exception 'Fila %: %', v_i, sqlerrm using errcode = '22023';
    end;
    v_nuevos := v_nuevos + 1;
  end loop;

  return jsonb_build_object('nuevos', v_nuevos, 'repetidos', v_repetidos);
end;
$$;

create or replace function public.editar_pago_bancario(
  p_id          bigint,
  p_fecha       date,
  p_moneda      text,
  p_monto       numeric,
  p_tasa        numeric default null,
  p_referencia  text default null,
  p_descripcion text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pago   public.pagos_bancarios;
  v_moneda text := upper(btrim(coalesce(p_moneda, '')));
begin
  perform private.exigir_accion('VENTAS.REGISTRAR_PAGOS');

  select * into v_pago from public.pagos_bancarios where id = p_id for update;
  if v_pago.id is null then
    raise exception 'Ese pago no existe.' using errcode = 'P0002';
  end if;
  if v_pago.anulado_en is not null then
    raise exception 'Ese pago está anulado: no se edita.' using errcode = '55000';
  end if;
  if p_fecha is null or p_fecha > current_date then
    raise exception 'La fecha del pago falta o es futura.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.monedas where codigo = v_moneda) then
    raise exception 'Esa moneda no existe.' using errcode = '22023';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  update public.pagos_bancarios
     set fecha       = p_fecha,
         moneda      = v_moneda,
         monto       = round(p_monto, 2),
         tasa        = case when v_moneda = 'USD' then null else p_tasa end,
         monto_usd   = private.pago_en_dolares(p_monto, v_moneda, p_tasa, p_fecha),
         referencia  = nullif(btrim(coalesce(p_referencia, '')), ''),
         descripcion = nullif(btrim(coalesce(p_descripcion, '')), '')
   where id = p_id;

  update public.pagos_bancarios
     set tasa = round(monto / nullif(monto_usd, 0), 6)
   where id = p_id and moneda = 'VES' and tasa is null;

  -- Si cambió la moneda, lo aplicado estaba en la otra: se recalcula.
  if v_moneda <> v_pago.moneda then
    update public.pagos_bancarios_notas l
       set monto_aplicado = greatest(0.01, private.nota_en_moneda_del_pago(l.nota_id, p_id))
     where l.pago_id = p_id and l.quitado_en is null;
  end if;
end;
$$;

create or replace function public.anular_pago_bancario(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pago public.pagos_bancarios;
begin
  perform private.exigir_accion('VENTAS.REGISTRAR_PAGOS');

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Diga por qué se anula el pago.' using errcode = '22023';
  end if;
  select * into v_pago from public.pagos_bancarios where id = p_id for update;
  if v_pago.id is null then
    raise exception 'Ese pago no existe.' using errcode = 'P0002';
  end if;
  if v_pago.anulado_en is not null then
    raise exception 'Ese pago ya estaba anulado.' using errcode = '55000';
  end if;

  update public.pagos_bancarios
     set anulado_en = now(), anulado_por = (select auth.uid()), motivo_anulacion = btrim(p_motivo)
   where id = p_id;
end;
$$;

-- Asociar notas a un pago. `p_notas` es [{nota_id, monto?}]: sin monto, el
-- total de la nota en la moneda del pago. Si la nota ya estaba asociada a
-- este pago, solo se le cambia el monto.
create or replace function public.asociar_notas_a_pago_bancario(p_pago_id bigint, p_notas jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pago  public.pagos_bancarios;
  v_item  jsonb;
  v_nota  public.notas_entrega;
  v_monto numeric;
begin
  perform private.exigir_accion('VENTAS.REGISTRAR_PAGOS');

  select * into v_pago from public.pagos_bancarios where id = p_pago_id for update;
  if v_pago.id is null then
    raise exception 'Ese pago no existe.' using errcode = 'P0002';
  end if;
  if v_pago.anulado_en is not null then
    raise exception 'Ese pago está anulado: no se le asocian notas.' using errcode = '55000';
  end if;
  if p_notas is null or jsonb_typeof(p_notas) <> 'array' or jsonb_array_length(p_notas) = 0 then
    raise exception 'No hay notas que asociar.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_notas) loop
    select * into v_nota from public.notas_entrega where id = (v_item ->> 'nota_id')::bigint;
    if v_nota.id is null then
      raise exception 'Una de las notas no existe.' using errcode = 'P0002';
    end if;
    if v_nota.estado = 'ANULADA' then
      raise exception 'La nota % está anulada: no se asocia a un pago.', v_nota.numero using errcode = '55000';
    end if;

    v_monto := round(coalesce(nullif(v_item ->> 'monto', '')::numeric,
                              private.nota_en_moneda_del_pago(v_nota.id, p_pago_id)), 2);
    if coalesce(v_monto, 0) <= 0 then
      raise exception 'El monto aplicado a % tiene que ser mayor que cero.', v_nota.numero using errcode = '22023';
    end if;

    update public.pagos_bancarios_notas
       set monto_aplicado = v_monto
     where pago_id = p_pago_id and nota_id = v_nota.id and quitado_en is null;

    if not found then
      insert into public.pagos_bancarios_notas (pago_id, nota_id, monto_aplicado, asociado_por)
      values (p_pago_id, v_nota.id, v_monto, (select auth.uid()));
    end if;
  end loop;
end;
$$;

create or replace function public.cambiar_monto_aplicado_pago(p_enlace_id bigint, p_monto numeric)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enlace public.pagos_bancarios_notas;
begin
  perform private.exigir_accion('VENTAS.REGISTRAR_PAGOS');

  select * into v_enlace from public.pagos_bancarios_notas where id = p_enlace_id for update;
  if v_enlace.id is null or v_enlace.quitado_en is not null then
    raise exception 'Esa nota ya no está asociada a ese pago.' using errcode = 'P0002';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto aplicado tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  update public.pagos_bancarios_notas set monto_aplicado = round(p_monto, 2) where id = p_enlace_id;
end;
$$;

create or replace function public.quitar_nota_de_pago_bancario(p_enlace_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_accion('VENTAS.REGISTRAR_PAGOS');

  update public.pagos_bancarios_notas
     set quitado_en = now(), quitado_por = (select auth.uid())
   where id = p_enlace_id and quitado_en is null;

  if not found then
    raise exception 'Esa nota ya no está asociada a ese pago.' using errcode = 'P0002';
  end if;
end;
$$;

-- ─────────────────────────────── quién puede ────────────────────────────────
revoke all on function private.nota_en_moneda_del_pago(bigint, bigint) from public, anon;
revoke all on function public.listar_pagos_bancarios(date, date) from public, anon;
revoke all on function public.notas_de_pago_bancario(bigint) from public, anon;
revoke all on function public.notas_candidatas_pago_bancario(bigint, text) from public, anon;
revoke all on function public.registrar_pago_bancario(date, text, numeric, numeric, text, text) from public, anon;
revoke all on function public.importar_pagos_bancarios(jsonb) from public, anon;
revoke all on function public.editar_pago_bancario(bigint, date, text, numeric, numeric, text, text) from public, anon;
revoke all on function public.anular_pago_bancario(bigint, text) from public, anon;
revoke all on function public.asociar_notas_a_pago_bancario(bigint, jsonb) from public, anon;
revoke all on function public.cambiar_monto_aplicado_pago(bigint, numeric) from public, anon;
revoke all on function public.quitar_nota_de_pago_bancario(bigint) from public, anon;

grant execute on function public.listar_pagos_bancarios(date, date) to authenticated;
grant execute on function public.notas_de_pago_bancario(bigint) to authenticated;
grant execute on function public.notas_candidatas_pago_bancario(bigint, text) to authenticated;
grant execute on function public.registrar_pago_bancario(date, text, numeric, numeric, text, text) to authenticated;
grant execute on function public.importar_pagos_bancarios(jsonb) to authenticated;
grant execute on function public.editar_pago_bancario(bigint, date, text, numeric, numeric, text, text) to authenticated;
grant execute on function public.anular_pago_bancario(bigint, text) to authenticated;
grant execute on function public.asociar_notas_a_pago_bancario(bigint, jsonb) to authenticated;
grant execute on function public.cambiar_monto_aplicado_pago(bigint, numeric) to authenticated;
grant execute on function public.quitar_nota_de_pago_bancario(bigint) to authenticated;

-- ─────────────────────────────── comprobación ───────────────────────────────
do $comprueba$
begin
  if not exists (select 1 from public.acciones where codigo = 'VENTAS.REGISTRAR_PAGOS' and nivel_equivalente is null) then
    raise exception 'No quedó la acción VENTAS.REGISTRAR_PAGOS como permiso extendido.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.pagos_bancarios'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.pagos_bancarios_notas'::regclass) then
    raise exception 'Las tablas de pagos quedaron sin RLS.';
  end if;
  if has_function_privilege('anon', 'public.registrar_pago_bancario(date, text, numeric, numeric, text, text)', 'execute') then
    raise exception 'anon no puede registrar pagos.';
  end if;
end
$comprueba$;
