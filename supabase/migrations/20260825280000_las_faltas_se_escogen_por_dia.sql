-- Las faltas se escogen por día, no se teclean como un número.
--
-- La líder: «QUE DEL PAGO QUINCENAL SE VEA DIARIO, Y QUE PERMITA INDICAR SI NO
-- TRABAJÓ ALGÚN DÍA PARA DESCONTARLO. QUE PUEDA ESCOGER LOS DÍAS QUE FALTÓ Y SE
-- LE DESCUENTE. Y QUE SE REFLEJE EN EL RECIBO DE PAGO DÍAS FACTURADOS, DÍAS
-- LABORADOS, DÍAS A PAGAR».
--
-- =========================================================================
-- QUÉ CAMBIA Y QUÉ NO
-- =========================================================================
--
-- El cálculo NO cambia. Hoy ya es
--
--   dias_pagados = periodo.dias - faltas_injustificadas
--
-- y una falta justificada no descuenta, que es lo correcto. Lo que cambia es de
-- dónde sale ese número: hasta ahora se tecleaba «2» en una casilla, y ahora se
-- señalan los días 18 y 23.
--
-- La diferencia importa el día del reclamo. Un «2» no se puede discutir: no dice
-- qué días, ni quién lo escribió, ni cuándo. Dos fechas señaladas sí, y quedan
-- en la auditoría con su autor.
--
-- Las columnas `faltas_injustificadas` y `faltas_justificadas` de
-- `nomina_novedades` se quedan donde están y las mantiene esta migración al día
-- cada vez que se marca un día. Así `calcular_nomina` no se entera del cambio y
-- no hay que volver a comprobar toda la nómina — que es la parte cara de
-- equivocarse.
--
-- =========================================================================
-- LOS TRES NÚMEROS
-- =========================================================================
--
--   FACTURADOS  los días que paga la quincena. Es `periodo.dias`, que vale 15
--               aunque el rango tenga 16 fechas: una quincena paga quince.
--   LABORADOS   facturados menos TODAS las faltas, justificadas o no. Es lo que
--               de verdad estuvo.
--   A PAGAR     facturados menos solo las INJUSTIFICADAS, porque la justificada
--               se paga. Es el `dias_pagados` que ya existía.
--
-- Confirmado con Christopher antes de escribirlo, porque los tres son dinero.

create table if not exists public.nomina_faltas (
  periodo_id  bigint not null references public.nomina_periodos(id) on delete cascade,
  empleado_id bigint not null references public.empleados(id) on delete cascade,
  fecha       date   not null,

  tipo        text   not null
    check (tipo in ('INJUSTIFICADA', 'JUSTIFICADA')),

  -- Por qué faltó. Opcional en la injustificada y casi obligatorio en la
  -- justificada: una falta que no descuenta y no dice por qué es la que nadie
  -- puede defender seis meses después.
  motivo      text,

  registrado_por uuid references public.perfiles(id),
  registrado_en  timestamptz not null default now(),

  primary key (periodo_id, empleado_id, fecha)
);

alter table public.nomina_faltas enable row level security;

drop policy if exists nomina_faltas_lectura on public.nomina_faltas;
create policy nomina_faltas_lectura on public.nomina_faltas
  for select using (private.tiene_permiso('NOMINA', 'LECTURA'));

revoke all on public.nomina_faltas from anon, authenticated;
grant select on public.nomina_faltas to authenticated;

create trigger trg_auditar
  after insert or delete or update on public.nomina_faltas
  for each row execute function private.auditar('periodo_id', 'empleado_id', 'fecha');

comment on table public.nomina_faltas is
  'Los dias que cada quien no trabajo, senalados uno a uno en vez de tecleados como un numero. Mantiene al dia las columnas faltas_* de nomina_novedades, que es de donde sigue leyendo calcular_nomina.';

-- ---------------------------------------------------------------------------
-- El recibo dice los tres números
-- ---------------------------------------------------------------------------
alter table public.nomina_recibos
  add column if not exists dias_facturados numeric,
  add column if not exists dias_laborados  numeric;

comment on column public.nomina_recibos.dias_facturados is
  'Los dias que paga el periodo: 15 en una quincena, aunque el rango tenga 16 fechas.';
comment on column public.nomina_recibos.dias_laborados is
  'Facturados menos TODAS las faltas, justificadas o no. Lo que de verdad estuvo.';
comment on column public.nomina_recibos.dias_pagados is
  'Facturados menos solo las faltas INJUSTIFICADAS: la justificada se paga. Es sobre este numero que se calcula el sueldo del periodo.';

-- ---------------------------------------------------------------------------
-- Marcar y desmarcar un día
--
-- Una sola función para las tres cosas —injustificada, justificada y limpiar—
-- porque en la pantalla es un solo gesto: se pulsa el día y va rotando. Dos
-- funciones obligarían a la pantalla a decidir cuál llamar, que es una decisión
-- que no le toca.
-- ---------------------------------------------------------------------------
create or replace function public.marcar_falta(
  p_periodo_id  bigint,
  p_empleado_id bigint,
  p_fecha       date,
  p_tipo        text default null,
  p_motivo      text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_p   record;
  v_emp record;
begin
  perform private.exigir_rol('RRHH');

  select * into v_p from public.nomina_periodos where id = p_periodo_id;
  if v_p.id is null then
    raise exception 'No existe el período %.', p_periodo_id using errcode = 'P0002';
  end if;

  -- Una nómina aprobada o pagada ya no admite faltas nuevas: el recibo está
  -- emitido y el número que lleva impreso dejaría de coincidir.
  if v_p.estado not in ('BORRADOR', 'CALCULADA') then
    raise exception 'El período está en "%" y ya no admite cambios. Para corregirlo hay que anularlo.', v_p.estado
      using errcode = '55000';
  end if;

  if p_fecha < v_p.desde or p_fecha > v_p.hasta then
    raise exception 'El % no cae dentro del período, que va del % al %.',
      to_char(p_fecha, 'DD/MM/YYYY'), to_char(v_p.desde, 'DD/MM/YYYY'), to_char(v_p.hasta, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  select * into v_emp from public.empleados where id = p_empleado_id;
  if v_emp.id is null then
    raise exception 'No existe esa ficha de personal.' using errcode = 'P0002';
  end if;

  -- Un día antes de entrar o después de salir no es una falta: es un día en el
  -- que esta persona no trabajaba aquí.
  if p_fecha < v_emp.fecha_ingreso then
    raise exception '% entró el %. Antes de esa fecha no se le puede marcar falta.',
      concat_ws(' ', v_emp.nombres, v_emp.apellidos), to_char(v_emp.fecha_ingreso, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  if v_emp.fecha_egreso is not null and p_fecha > v_emp.fecha_egreso then
    raise exception '% salió el %. Después de esa fecha no se le puede marcar falta.',
      concat_ws(' ', v_emp.nombres, v_emp.apellidos), to_char(v_emp.fecha_egreso, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  if p_tipo is null then
    delete from public.nomina_faltas
     where periodo_id = p_periodo_id and empleado_id = p_empleado_id and fecha = p_fecha;
  else
    if upper(btrim(p_tipo)) not in ('INJUSTIFICADA', 'JUSTIFICADA') then
      raise exception 'Una falta es INJUSTIFICADA —descuenta— o JUSTIFICADA —no descuenta—.'
        using errcode = '22023';
    end if;

    insert into public.nomina_faltas
      (periodo_id, empleado_id, fecha, tipo, motivo, registrado_por)
    values
      (p_periodo_id, p_empleado_id, p_fecha, upper(btrim(p_tipo)),
       nullif(btrim(coalesce(p_motivo, '')), ''), (select auth.uid()))
    on conflict (periodo_id, empleado_id, fecha) do update
      set tipo = excluded.tipo,
          motivo = coalesce(excluded.motivo, public.nomina_faltas.motivo),
          registrado_por = excluded.registrado_por,
          registrado_en = now();
  end if;

  perform private.recontar_faltas(p_periodo_id, p_empleado_id);
end;
$func$;

revoke all on function public.marcar_falta(bigint, bigint, date, text, text) from public, anon;
grant execute on function public.marcar_falta(bigint, bigint, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Y las cuentas se rehacen solas
--
-- `nomina_novedades` sigue siendo lo que lee `calcular_nomina`. Aquí se
-- mantiene al día contando los días señalados, en vez de que alguien teclee el
-- número y los dos digan cosas distintas.
-- ---------------------------------------------------------------------------
create or replace function private.recontar_faltas(p_periodo_id bigint, p_empleado_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_inj numeric;
  v_jus numeric;
begin
  select count(*) filter (where tipo = 'INJUSTIFICADA'),
         count(*) filter (where tipo = 'JUSTIFICADA')
    into v_inj, v_jus
    from public.nomina_faltas
   where periodo_id = p_periodo_id and empleado_id = p_empleado_id;

  update public.nomina_novedades
     set faltas_injustificadas = v_inj,
         faltas_justificadas   = v_jus,
         registrado_por = (select auth.uid()),
         registrado_en = now()
   where periodo_id = p_periodo_id and empleado_id = p_empleado_id;

  if not found and (v_inj > 0 or v_jus > 0) then
    insert into public.nomina_novedades
      (periodo_id, empleado_id, faltas_injustificadas, faltas_justificadas, registrado_por)
    values (p_periodo_id, p_empleado_id, v_inj, v_jus, (select auth.uid()));
  end if;
end;
$func$;

comment on function private.recontar_faltas(bigint, bigint) is
  'Rehace las columnas faltas_* de nomina_novedades contando los dias senalados. Es lo que deja que calcular_nomina siga leyendo donde siempre.';

-- ---------------------------------------------------------------------------
-- Lo que la pantalla necesita leer
-- ---------------------------------------------------------------------------
create or replace function public.faltas_del_periodo(p_periodo_id bigint)
returns table (empleado_id bigint, fecha date, tipo text, motivo text, quien text)
language sql
stable
security definer
set search_path to ''
as $func$
  select f.empleado_id, f.fecha, f.tipo, f.motivo, p.nombre
    from public.nomina_faltas f
    left join public.perfiles p on p.id = f.registrado_por
   where f.periodo_id = p_periodo_id
   order by f.empleado_id, f.fecha;
$func$;

revoke all on function public.faltas_del_periodo(bigint) from public, anon;
grant execute on function public.faltas_del_periodo(bigint) to authenticated;
