-- ============================================================================
-- Averías de maquinaria, aparte del mantenimiento
--
-- Christopher, 13/10/2026: clonar la idea del módulo de Servicios de
-- Control-de-Combustible/SOS La Guaira, adaptada —sin su membrete, sin sus
-- repuestos en texto libre (los nuestros ya descuentan inventario de verdad,
-- eso no se toca)—. Se traen las tres piezas que sí faltaban:
--
--   1. LA AVERÍA ES UNA COSA, EL TRABAJO QUE LA ATIENDE ES OTRA.
--      Se reporta lo que se dañó en el momento en que se nota, sin esperar a
--      que alguien decida qué hacer con eso. Queda PENDIENTE hasta que una
--      orden de taller la atiende —opcional, no toda avería termina en una
--      orden formal— y se marca ATENDIDA al cerrar esa orden, o a mano si se
--      resolvió sin pasar por el taller.
--
--      Regla de oro, tomada tal cual del sistema de origen: esto NUNCA
--      cambia el estado operativo de la máquina. Son dos preguntas
--      distintas —¿se resolvió el papel? / ¿la máquina sirve hoy?— y
--      mezclarlas deja una pila de reportes sin cerrar distorsionando si la
--      flota está sana.
--
--   2. TIPO DE INTERVENCIÓN, VARIOS A LA VEZ. Aparte del tipo de la orden
--      (Mantenimiento/Servicio/Reparación, que decide si resetea el
--      contador de horas), qué clase de trabajo fue: mecánica, eléctrica,
--      hidráulica… Un `text[]` sin catálogo en la base, a propósito —si
--      mañana aparece un tipo nuevo, se agrega en la pantalla, no en una
--      migración—.
--
--   3. ORIGEN DEL TÉCNICO: interno o externo, aparte de su nombre (que ya
--      se guardaba desde la migración anterior).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La avería, como tabla propia.
-- ---------------------------------------------------------------------------
create table if not exists public.averias_maquinaria (
  id              bigint generated always as identity primary key,
  numero          text not null unique,
  maquina_id      bigint not null references public.maquinaria(id),

  categoria       text not null check (categoria in (
                    'MOTOR', 'HIDRAULICA', 'ELECTRICA', 'TREN_DE_RODAJE', 'ESTRUCTURA', 'OTRA'
                  )),
  descripcion     text not null check (length(btrim(descripcion)) >= 3),

  estado          text not null default 'PENDIENTE'
                  check (estado in ('PENDIENTE', 'ATENDIDA', 'ANULADA')),

  reportada_por   uuid references auth.users(id),
  reportada_en    timestamptz not null default now(),

  atendida_en     timestamptz,
  -- Qué orden de taller la atendió, si alguna. Null no significa sin atender:
  -- también se marca atendida a mano, sin pasar por el taller.
  mantenimiento_id bigint references public.mantenimientos(id) on delete set null,

  motivo_anulacion text,
  anulada_por     uuid references auth.users(id),
  anulada_en      timestamptz
);

comment on table public.averias_maquinaria is
  'Lo que se dañó, reportado en el momento. No cambia el estado operativo de la máquina: '
  'eso se decide aparte. Una orden de taller puede atenderla, opcionalmente.';

create index if not exists averias_maquinaria_maquina_idx
  on public.averias_maquinaria (maquina_id, estado);

alter table public.averias_maquinaria enable row level security;
revoke insert, update, delete on public.averias_maquinaria from anon, authenticated;
grant select on public.averias_maquinaria to authenticated;

drop policy if exists averias_maquinaria_lectura on public.averias_maquinaria;
create policy averias_maquinaria_lectura on public.averias_maquinaria
  for select to authenticated using (private.tiene_permiso('MAQUINARIA', 'LECTURA'));

-- ---------------------------------------------------------------------------
-- 2. Las columnas nuevas en la orden de taller: a qué avería atiende, y el
--    tipo de intervención y origen del técnico, que se guardan al cerrar.
-- ---------------------------------------------------------------------------
alter table public.mantenimientos
  add column if not exists averia_id bigint references public.averias_maquinaria(id) on delete set null,
  add column if not exists intervenciones text[] not null default '{}',
  add column if not exists origen_tecnico text check (origen_tecnico is null or origen_tecnico in ('INTERNO', 'EXTERNO'));

comment on column public.mantenimientos.averia_id is
  'La avería que esta orden atiende, si alguna. Se elige al abrir la orden.';
comment on column public.mantenimientos.intervenciones is
  'Qué clase de trabajo fue (mecánica, eléctrica, hidráulica…), varios a la vez. '
  'Sin catálogo en la base a propósito: un tipo nuevo se agrega en la pantalla.';

-- ---------------------------------------------------------------------------
-- 3. Reportar una avería, marcarla atendida a mano, o anularla si se
--    reportó por error.
-- ---------------------------------------------------------------------------
create or replace function public.reportar_averia(
  p_maquina_id  bigint,
  p_categoria   text,
  p_descripcion text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maq record;
  v_id  bigint;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select * into v_maq from public.maquinaria where id = p_maquina_id;
  if v_maq.id is null then
    raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
  end if;

  if length(btrim(coalesce(p_descripcion, ''))) < 3 then
    raise exception 'Hay que describir qué pasó.' using errcode = '23514';
  end if;

  insert into public.averias_maquinaria (numero, maquina_id, categoria, descripcion, reportada_por)
  values (private.siguiente_numero('AVE'), p_maquina_id, p_categoria, btrim(p_descripcion), (select auth.uid()))
  returning id into v_id;

  perform private.notificar(
    'MAQUINARIA', 'AVERIA_REPORTADA',
    format('Avería en %s', v_maq.nombre),
    btrim(p_descripcion), '/app/maquinaria', array['OPERACIONES', 'ALMACEN'], 'ATENCION');

  return v_id;
end;
$$;

create or replace function public.marcar_averia_atendida(p_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_averia record;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select * into v_averia from public.averias_maquinaria where id = p_id;
  if v_averia.id is null then
    raise exception 'No existe la avería %.', p_id using errcode = 'P0002';
  end if;
  if v_averia.estado <> 'PENDIENTE' then
    raise exception 'La avería % ya está %.', v_averia.numero, lower(v_averia.estado)
      using errcode = '55000';
  end if;

  update public.averias_maquinaria set estado = 'ATENDIDA', atendida_en = now() where id = p_id;
end;
$$;

create or replace function public.anular_averia(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_averia record;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula.' using errcode = '22023';
  end if;

  select * into v_averia from public.averias_maquinaria where id = p_id;
  if v_averia.id is null then
    raise exception 'No existe la avería %.', p_id using errcode = 'P0002';
  end if;
  if v_averia.estado <> 'PENDIENTE' then
    raise exception 'Solo se anula una avería pendiente; esta ya está %.', lower(v_averia.estado)
      using errcode = '55000';
  end if;

  update public.averias_maquinaria
     set estado = 'ANULADA', motivo_anulacion = btrim(p_motivo),
         anulada_por = (select auth.uid()), anulada_en = now()
   where id = p_id;
end;
$$;

revoke all on function public.reportar_averia(bigint, text, text) from public, anon;
grant execute on function public.reportar_averia(bigint, text, text) to authenticated;
revoke all on function public.marcar_averia_atendida(bigint) from public, anon;
grant execute on function public.marcar_averia_atendida(bigint) to authenticated;
revoke all on function public.anular_averia(bigint, text) from public, anon;
grant execute on function public.anular_averia(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. abrir_mantenimiento acepta la avería que esta orden atiende.
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_def   text := pg_get_functiondef('public.abrir_mantenimiento(bigint,text,text,bigint,date,smallint,bigint,numeric,bigint,text,text,jsonb)'::regprocedure);
  v_ancla text := $a$p_repuestos jsonb DEFAULT '[]'::jsonb)
 RETURNS bigint$a$;
  v_nueva text := $n$p_repuestos jsonb DEFAULT '[]'::jsonb,
 p_averia_id bigint DEFAULT NULL::bigint)
 RETURNS bigint$n$;
  v_ancla2 text := $a2$  insert into public.mantenimientos
    (numero, maquina_id, articulo_id, cantidad, fecha, tipo, estado, motivo,
     horometro, taller_id, estado_previo, dias_estimados, urgencia, especialidad,
     registrado_por)
  values
    (private.siguiente_numero('MTO'), p_maquina_id, p_articulo_id, p_cantidad,
     v_fecha, p_tipo, 'ABIERTO', btrim(p_motivo), v_horas, p_taller_id,
     v_estado_previo, coalesce(p_dias_estimados, v_dias_maq),
     p_urgencia, p_especialidad, (select auth.uid()))
  returning id into v_id;$a2$;
  v_nueva2 text := $n2$  if p_averia_id is not null then
    if p_maquina_id is null then
      raise exception 'Una avería solo se atiende en una orden sobre máquina.' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.averias_maquinaria
       where id = p_averia_id and maquina_id = p_maquina_id and estado = 'PENDIENTE'
    ) then
      raise exception 'Esa avería no existe, no es de esta máquina, o ya no está pendiente.'
        using errcode = '22023';
    end if;
  end if;

  insert into public.mantenimientos
    (numero, maquina_id, articulo_id, cantidad, fecha, tipo, estado, motivo,
     horometro, taller_id, estado_previo, dias_estimados, urgencia, especialidad,
     registrado_por, averia_id)
  values
    (private.siguiente_numero('MTO'), p_maquina_id, p_articulo_id, p_cantidad,
     v_fecha, p_tipo, 'ABIERTO', btrim(p_motivo), v_horas, p_taller_id,
     v_estado_previo, coalesce(p_dias_estimados, v_dias_maq),
     p_urgencia, p_especialidad, (select auth.uid()), p_averia_id)
  returning id into v_id;$n2$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'abrir_mantenimiento: el ancla de la firma no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, v_nueva);

  if (length(v_def) - length(replace(v_def, v_ancla2, ''))) / length(v_ancla2) <> 1 then
    raise exception 'abrir_mantenimiento: el ancla del insert no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla2, v_nueva2);

  execute 'drop function public.abrir_mantenimiento(bigint,text,text,bigint,date,smallint,bigint,numeric,bigint,text,text,jsonb)';
  execute v_def;
end
$mig$;

revoke all on function public.abrir_mantenimiento(
  bigint, text, text, bigint, date, smallint, bigint, numeric, bigint, text, text, jsonb, bigint
) from public, anon;
grant execute on function public.abrir_mantenimiento(
  bigint, text, text, bigint, date, smallint, bigint, numeric, bigint, text, text, jsonb, bigint
) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. cerrar_mantenimiento acepta el tipo de intervención, el origen del
--    técnico, y si esta orden deja atendida la avería que elegiste al abrir.
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_def    text := pg_get_functiondef('public.cerrar_mantenimiento(bigint,text,numeric,jsonb,text,date,numeric,bigint,text,numeric)'::regprocedure);
  v_anclas text[] := array[
    $a$p_tecnico text DEFAULT NULL::text, p_intervalo_horas numeric DEFAULT NULL::numeric)
 RETURNS bigint$a$,
    $a$if p_intervalo_horas is not null and p_intervalo_horas <= 0 then
    raise exception 'El intervalo del próximo mantenimiento tiene que ser mayor que cero.'
      using errcode = '22023';
  end if;$a$,
    $a$         tecnico = nullif(btrim(coalesce(p_tecnico, '')), ''),
         intervalo_horas = case
           when v_orden.maquina_id is not null and v_orden.tipo = 'MANTENIMIENTO'
             then coalesce(p_intervalo_horas, v_maq.tope_horas)
           else null
         end,
         cerrado_por = (select auth.uid()), cerrado_en = now()
   where id = p_id;$a$
  ];
  v_nuevas text[] := array[
    $n$p_tecnico text DEFAULT NULL::text, p_intervalo_horas numeric DEFAULT NULL::numeric,
 p_intervenciones text[] DEFAULT '{}'::text[], p_origen_tecnico text DEFAULT NULL::text,
 p_marcar_averia_atendida boolean DEFAULT false)
 RETURNS bigint$n$,
    $n$if p_intervalo_horas is not null and p_intervalo_horas <= 0 then
    raise exception 'El intervalo del próximo mantenimiento tiene que ser mayor que cero.'
      using errcode = '22023';
  end if;

  if p_origen_tecnico is not null and p_origen_tecnico not in ('INTERNO', 'EXTERNO') then
    raise exception 'El origen del técnico es INTERNO o EXTERNO.' using errcode = '22023';
  end if;$n$,
    $n$         tecnico = nullif(btrim(coalesce(p_tecnico, '')), ''),
         origen_tecnico = p_origen_tecnico,
         intervenciones = coalesce(p_intervenciones, '{}'::text[]),
         intervalo_horas = case
           when v_orden.maquina_id is not null and v_orden.tipo = 'MANTENIMIENTO'
             then coalesce(p_intervalo_horas, v_maq.tope_horas)
           else null
         end,
         cerrado_por = (select auth.uid()), cerrado_en = now()
   where id = p_id;

  if p_marcar_averia_atendida and v_orden.averia_id is not null then
    update public.averias_maquinaria
       set estado = 'ATENDIDA', atendida_en = now(), mantenimiento_id = p_id
     where id = v_orden.averia_id and estado = 'PENDIENTE';
  end if;$n$
  ];
begin
  for i in 1 .. array_length(v_anclas, 1) loop
    if (length(v_def) - length(replace(v_def, v_anclas[i], ''))) / length(v_anclas[i]) <> 1 then
      raise exception 'cerrar_mantenimiento: el ancla % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_anclas[i], v_nuevas[i]);
  end loop;

  execute 'drop function public.cerrar_mantenimiento(bigint,text,numeric,jsonb,text,date,numeric,bigint,text,numeric)';
  execute v_def;
end
$mig$;

revoke all on function public.cerrar_mantenimiento(
  bigint, text, numeric, jsonb, text, date, numeric, bigint, text, numeric, text[], text, boolean
) from public, anon;
grant execute on function public.cerrar_mantenimiento(
  bigint, text, numeric, jsonb, text, date, numeric, bigint, text, numeric, text[], text, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Las fotos de carga aprenden el origen AVERIA.
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_tiene_constraint boolean;
begin
  select exists (
    select 1 from pg_constraint
     where conrelid = 'public.fotos_de_carga'::regclass
       and conname = 'fotos_de_carga_origen_check'
  ) into v_tiene_constraint;

  if v_tiene_constraint then
    alter table public.fotos_de_carga drop constraint fotos_de_carga_origen_check;
  else
    alter table public.fotos_de_carga drop constraint if exists fotos_de_carga_origen_check1;
  end if;

  alter table public.fotos_de_carga
    add constraint fotos_de_carga_origen_check
    check (origen = any (array['SALIDA'::text, 'DESPACHO'::text, 'COMBUSTIBLE'::text, 'AVERIA'::text]));
end
$mig$;

drop policy if exists fotos_de_carga_lectura on public.fotos_de_carga;
create policy fotos_de_carga_lectura on public.fotos_de_carga
  for select to authenticated
  using ((origen = 'SALIDA' and private.tiene_permiso('SALIDAS', 'LECTURA'))
      or (origen = 'DESPACHO' and private.tiene_permiso('FACTURACION', 'LECTURA'))
      or (origen = 'COMBUSTIBLE' and private.tiene_permiso('MAQUINARIA', 'LECTURA'))
      or (origen = 'AVERIA' and private.tiene_permiso('MAQUINARIA', 'LECTURA')));

create or replace function private.exigir_escribir_carga(p_origen text, p_referencia text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_origen = 'SALIDA' then
    perform private.exigir_permiso('SALIDAS', 'ESCRITURA');
    if not exists (select 1 from public.solicitudes_salida where numero = p_referencia) then
      raise exception 'La salida % no existe.', p_referencia using errcode = 'P0002';
    end if;
  elsif p_origen = 'DESPACHO' then
    perform private.exigir_permiso('FACTURACION', 'ESCRITURA');
    if not exists (select 1 from public.solicitudes_despacho where numero = p_referencia) then
      raise exception 'El despacho % no existe.', p_referencia using errcode = 'P0002';
    end if;
  elsif p_origen = 'COMBUSTIBLE' then
    perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
  elsif p_origen = 'AVERIA' then
    perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
    if not exists (select 1 from public.averias_maquinaria where numero = p_referencia) then
      raise exception 'La avería % no existe.', p_referencia using errcode = 'P0002';
    end if;
  else
    raise exception 'Origen desconocido: %', p_origen using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. La vista de la avería, y las dos vistas existentes que enseñan lo nuevo.
-- ---------------------------------------------------------------------------
create or replace view public.v_averias_maquinaria
with (security_invoker = on) as
select
  a.id, a.numero, a.maquina_id, m.codigo as maquina_codigo, m.nombre as maquina,
  a.categoria, a.descripcion, a.estado,
  a.reportada_por, a.reportada_en, a.atendida_en,
  a.mantenimiento_id, mt.numero as mantenimiento_numero,
  a.motivo_anulacion, a.anulada_por, a.anulada_en
from public.averias_maquinaria a
join public.maquinaria m on m.id = a.maquina_id
left join public.mantenimientos mt on mt.id = a.mantenimiento_id;

grant select on public.v_averias_maquinaria to authenticated;

do $mig$
declare
  v_def   text := pg_get_viewdef('public.v_mantenimientos'::regclass, true);
  v_ancla text := $a$mt.tecnico,
    mt.intervalo_horas
   FROM mantenimientos mt
     JOIN maquinaria mq ON mq.id = mt.maquina_id
     LEFT JOIN almacenes al ON al.id = mt.taller_id;$a$;
  v_nueva text := $n$mt.tecnico,
    mt.intervalo_horas,
    mt.origen_tecnico,
    mt.intervenciones,
    mt.averia_id,
    av.numero AS averia_numero
   FROM mantenimientos mt
     JOIN maquinaria mq ON mq.id = mt.maquina_id
     LEFT JOIN almacenes al ON al.id = mt.taller_id
     LEFT JOIN averias_maquinaria av ON av.id = mt.averia_id;$n$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'v_mantenimientos: el ancla no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, v_nueva);
  execute 'create or replace view public.v_mantenimientos with (security_invoker = on) as ' || v_def;
end
$mig$;

do $mig$
declare
  v_def   text := pg_get_viewdef('public.v_maquinaria'::regclass, true);
  v_ancla text := $a$    op.ficha AS operador_ficha,
    m.clase,
    COALESCE(um.intervalo_horas, m.tope_horas) AS tope_horas_efectivo
   FROM maquinaria m$a$;
  v_nueva text := $n$    op.ficha AS operador_ficha,
    m.clase,
    COALESCE(um.intervalo_horas, m.tope_horas) AS tope_horas_efectivo,
    COALESCE(av.pendientes, 0::bigint) AS averias_pendientes
   FROM maquinaria m
     LEFT JOIN (
       SELECT a.maquina_id, count(*) AS pendientes
         FROM averias_maquinaria a
        WHERE a.estado = 'PENDIENTE'
        GROUP BY a.maquina_id
     ) av ON av.maquina_id = m.id$n$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'v_maquinaria: el ancla no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, v_nueva);
  execute 'create or replace view public.v_maquinaria with (security_invoker = on) as ' || v_def;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 8. Comprobación
-- ---------------------------------------------------------------------------
do $comprueba$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'averias_maquinaria') then
    raise exception 'averias_maquinaria no quedó creada.';
  end if;
  if not exists (
    select 1 from pg_proc where proname = 'abrir_mantenimiento' and pronamespace = 'public'::regnamespace
      and pg_get_functiondef(oid) like '%p_averia_id%'
  ) then
    raise exception 'abrir_mantenimiento no quedó con la avería.';
  end if;
  if not exists (
    select 1 from pg_proc where proname = 'cerrar_mantenimiento' and pronamespace = 'public'::regnamespace
      and pg_get_functiondef(oid) like '%p_marcar_averia_atendida%'
  ) then
    raise exception 'cerrar_mantenimiento no quedó con la avería/intervenciones/origen.';
  end if;
  if position('av.numero AS averia_numero' in pg_get_viewdef('public.v_mantenimientos'::regclass, true)) = 0 then
    raise exception 'v_mantenimientos no enseña la avería.';
  end if;
  if position('averias_pendientes' in pg_get_viewdef('public.v_maquinaria'::regclass, true)) = 0 then
    raise exception 'v_maquinaria no cuenta las averías pendientes.';
  end if;
  if (select array_to_string(reloptions, ',') from pg_class where oid = 'public.v_mantenimientos'::regclass)
     is distinct from 'security_invoker=on' then
    raise exception 'v_mantenimientos perdió security_invoker.';
  end if;
  if (select array_to_string(reloptions, ',') from pg_class where oid = 'public.v_maquinaria'::regclass)
     is distinct from 'security_invoker=on' then
    raise exception 'v_maquinaria perdió security_invoker.';
  end if;
  if (select array_to_string(reloptions, ',') from pg_class where oid = 'public.v_averias_maquinaria'::regclass)
     is distinct from 'security_invoker=on' then
    raise exception 'v_averias_maquinaria perdió security_invoker.';
  end if;
end
$comprueba$;
