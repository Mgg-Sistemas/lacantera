/*
  A CADA CARGO LE TOCA SU DOTACIÓN

  Lo pidió la líder: definir qué le corresponde a cada puesto —botas, guantes,
  casco—, cada cuánto se repone, y que el sistema avise cuando a alguien le
  toca. Hoy la entrega es a pulso: alguien se acuerda, o alguien reclama.

  CUELGA DEL TABULADOR, NO DEL TEXTO DEL CARGO

  `empleados.cargo` es texto libre y hay trece variantes escritas a mano. El
  tabulador es el catálogo de verdad —doce cargos, con su sueldo— y los
  diecinueve trabajadores activos ya apuntan a él. Colgar la dotación de un
  texto habría dejado fuera al primero que escribiera «AYUDANTE DE PATIO» en vez
  de «PATIO».

  `cada_meses` PUEDE IR VACÍO

  Unas botas se reponen cada seis meses; la llave del casillero se entrega una
  vez y ya. Sin este hueco habría que inventarse un número enorme para decir
  «no se repone», y ese número acabaría sonando un día.

  ENSAYADO EN UNA TRANSACCIÓN DESHECHA

  Las cuatro situaciones comprobadas una por una —NUNCA sin entrega previa,
  AL_DIA con la fecha calculada a doce meses, VENCIDA al bajar el plazo a uno,
  ENTREGADA al quitar el plazo—, el resumen semanal agrupando por artículo, y
  quitar una línea apagándola sin borrarla.
*/

create table if not exists public.dotacion_por_cargo (
  id           bigint generated always as identity primary key,
  tabulador_id bigint  not null references public.nomina_tabulador(id) on delete cascade,
  articulo_id  bigint  not null references public.articulos(id)        on delete restrict,
  cantidad     numeric not null check (cantidad > 0),
  -- Cada cuántos meses se repone. Vacío: se entrega una vez y no se repone.
  cada_meses   integer check (cada_meses is null or cada_meses > 0),
  nota         text,
  activo       boolean not null default true,
  creada_por   uuid references auth.users(id),
  creada_en    timestamptz not null default now(),
  unique (tabulador_id, articulo_id)
);

alter table public.dotacion_por_cargo enable row level security;

drop policy if exists dotacion_lectura on public.dotacion_por_cargo;
create policy dotacion_lectura on public.dotacion_por_cargo
  for select to authenticated
  using (private.tiene_permiso('ASIGNACIONES', 'LECTURA'));

drop trigger if exists trg_auditar on public.dotacion_por_cargo;
create trigger trg_auditar
after insert or update or delete on public.dotacion_por_cargo
for each row execute function private.auditar('id');

drop trigger if exists trg_normalizar on public.dotacion_por_cargo;
create trigger trg_normalizar
before insert or update on public.dotacion_por_cargo
for each row execute function private.normalizar_texto('nota');

/*
  A QUIÉN LE TOCA QUÉ, Y DESDE CUÁNDO

  Cruza cada trabajador activo con lo que su cargo tiene definido, y busca
  cuándo fue la última vez que se le entregó esa pieza como DOTACIÓN. Con eso
  salen cuatro situaciones y no dos: nunca se le dio, se le dio y no se repone,
  se le dio y todavía le dura, o se le pasó la fecha.

  «NUNCA» no es lo mismo que «VENCIDA» aunque las dos pidan entregar: a quien
  nunca recibió las botas hay que dárselas por primera vez, y eso suele querer
  decir que entró hace poco. Distinguirlo evita que la lista de pendientes se
  lea como una lista de descuidos.
*/
create or replace view public.v_dotacion_pendiente
with (security_invoker = on) as
select
  e.id                              as empleado_id,
  e.ficha,
  (e.nombres || ' ') || e.apellidos as empleado,
  e.cargo,
  e.departamento,
  t.id                              as tabulador_id,
  t.cargo                           as cargo_tabulador,
  d.id                              as dotacion_id,
  d.articulo_id,
  ar.codigo                         as articulo_codigo,
  ar.nombre                         as articulo,
  ar.unidad,
  d.cantidad,
  d.cada_meses,
  d.nota,
  ult.fecha_entrega                 as ultima_entrega,
  case
    when ult.fecha_entrega is null or d.cada_meses is null then null
    else (ult.fecha_entrega + (d.cada_meses || ' months')::interval)::date
  end                               as toca_el,
  case
    when ult.fecha_entrega is null then 'NUNCA'
    when d.cada_meses is null      then 'ENTREGADA'
    when (ult.fecha_entrega + (d.cada_meses || ' months')::interval)::date <= current_date
                                   then 'VENCIDA'
    else 'AL_DIA'
  end                               as situacion
from public.empleados e
join public.nomina_tabulador   t on t.id = e.tabulador_id
join public.dotacion_por_cargo d on d.tabulador_id = t.id and d.activo
join public.articulos         ar on ar.id = d.articulo_id
left join lateral (
  select max(a.fecha_entrega) as fecha_entrega
  from public.asignaciones_herramienta a
  where a.empleado_id = e.id
    and a.articulo_id = d.articulo_id
    and a.clase = 'DOTACION'
) ult on true
where e.fecha_egreso is null;

create or replace function public.guardar_dotacion_de_cargo(
  p_tabulador_id bigint,
  p_articulo_id  bigint,
  p_cantidad     numeric,
  p_cada_meses   integer default null,
  p_nota         text default null,
  p_id           bigint default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint;
begin
  perform private.exigir_permiso('ASIGNACIONES', 'ESCRITURA');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if p_cada_meses is not null and p_cada_meses <= 0 then
    raise exception 'Cada cuántos meses se repone tiene que ser un número de meses, o quedar vacío si no se repone.'
      using errcode = '22023';
  end if;

  if p_id is null then
    /*
      Si ya había una línea para ese cargo y ese artículo, se corrige en vez de
      reventar contra la restricción única. Quien vuelve a añadir lo mismo está
      cambiando la cantidad o el plazo, no creando otra cosa.
    */
    insert into public.dotacion_por_cargo
      (tabulador_id, articulo_id, cantidad, cada_meses, nota, creada_por)
    values
      (p_tabulador_id, p_articulo_id, p_cantidad, p_cada_meses,
       nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
    on conflict (tabulador_id, articulo_id) do update
      set cantidad = excluded.cantidad,
          cada_meses = excluded.cada_meses,
          nota = excluded.nota,
          activo = true
    returning id into v_id;
  else
    update public.dotacion_por_cargo
       set tabulador_id = p_tabulador_id,
           articulo_id  = p_articulo_id,
           cantidad     = p_cantidad,
           cada_meses   = p_cada_meses,
           nota         = nullif(btrim(coalesce(p_nota, '')), '')
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe esa línea de dotación.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$function$;

/*
  Quitar una línea la APAGA, no la borra.

  Lo entregado ya está entregado y sigue apuntando a este artículo. Borrar la
  fila dejaría las entregas pasadas sin la regla que las explicaba, y el día que
  alguien pregunte por qué a un vigilante se le dieron botas no habría respuesta.
*/
create or replace function public.quitar_dotacion_de_cargo(p_id bigint)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare v_id bigint;
begin
  perform private.exigir_permiso('ASIGNACIONES', 'ESCRITURA');

  update public.dotacion_por_cargo set activo = false where id = p_id returning id into v_id;

  if v_id is null then
    raise exception 'No existe esa línea de dotación.' using errcode = 'P0002';
  end if;

  return v_id;
end;
$function$;

revoke all on function public.guardar_dotacion_de_cargo(bigint, bigint, numeric, integer, text, bigint) from public;
grant execute on function public.guardar_dotacion_de_cargo(bigint, bigint, numeric, integer, text, bigint) to authenticated;
revoke all on function public.quitar_dotacion_de_cargo(bigint) from public;
grant execute on function public.quitar_dotacion_de_cargo(bigint) to authenticated;

/*
  EL AVISO ES UN RESUMEN SEMANAL, NO UNO POR PERSONA

  Que a nueve trabajadores les toquen las botas no son nueve noticias: es una,
  y es «hay que pedir botas». Un aviso por cabeza —y encima repetido cada día,
  porque «le toca» no deja de ser verdad hasta que se entrega— vaciaría la
  campana de todo lo demás.
*/
create or replace function private.avisar_dotacion_pendiente()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_personas integer;
  v_detalle  text;
begin
  select count(distinct empleado_id) into v_personas
  from public.v_dotacion_pendiente
  where situacion in ('NUNCA', 'VENCIDA');

  if coalesce(v_personas, 0) = 0 then
    return 0;
  end if;

  select string_agg(x.linea, ' · ') into v_detalle
  from (
    select format('%s a %s', articulo, count(distinct empleado_id)) as linea
    from public.v_dotacion_pendiente
    where situacion in ('NUNCA', 'VENCIDA')
    group by articulo
    order by count(distinct empleado_id) desc
    limit 6
  ) x;

  perform private.notificar(
    'ASIGNACIONES', 'DOTACION_PENDIENTE',
    format('A %s trabajador%s les toca dotación',
           v_personas, case when v_personas = 1 then '' else 'es' end),
    coalesce(v_detalle, 'Ver el detalle en Asignaciones.'),
    '/app/asignaciones', array['ALMACEN', 'RRHH', 'ADMIN'], 'INFO');

  return v_personas;
end;
$function$;

select cron.unschedule('dotacion-pendiente')
where exists (select 1 from cron.job where jobname = 'dotacion-pendiente');

-- Los lunes a las 11:30 UTC —7:30 de aquí—, para que la semana empiece sabiendo
-- qué hay que pedir.
select cron.schedule('dotacion-pendiente', '30 11 * * 1',
                     'select private.avisar_dotacion_pendiente()');
