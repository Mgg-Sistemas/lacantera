-- ============================================================================
-- El tabulador se queda con el mensual y la quincena
--
-- El tabulador guardaba un `bono_mensual` por cargo, sembrado en 40, y la
-- pantalla lo enseñaba en una columna y lo sumaba en otra llamada "Total mes".
-- Nunca sirvió para nada:
--
--   · La nómina NO lo lee. El beneficio de alimentación sale de
--     `private.parametro('cestaticket_mensual_usd', …)`, que es un parámetro con
--     vigencia por fecha y con su origen legal anotado —Decreto 4.805 y la
--     sentencia 712 del 19/12/2024—. Es el único número que se paga.
--
--   · Es el mismo dato escrito dos veces. Y escrito dos veces se desfasa: el día
--     que el Ejecutivo anuncie un cestaticket distinto, quien lo actualice en
--     Parámetros dejará el tabulador diciendo el viejo, y el tabulador es
--     justamente la pantalla que se consulta para saber cuánto gana un cargo.
--     Una cifra que se ve, no se paga y puede mentir es peor que no tenerla.
--
-- Se quita entera: la columna, las dos derivadas de la vista y el parámetro de
-- la función. Lo que quedaba en la tabla no se guarda en ningún sitio porque no
-- es información: era 40 en todas las filas, copiado del parámetro.
--
-- El semanal y el diario de la vista se quedan como están. Ya estaban ocultos
-- desde antes y no son lo mismo: son el mismo sueldo mirado con otro divisor,
-- no un concepto de pago aparte.
-- ============================================================================

-- La vista se borra y se rehace: `create or replace view` no sabe quitar
-- columnas, solo añadirlas al final.
drop view if exists public.v_tabulador;

alter table public.nomina_tabulador
  drop column if exists bono_mensual;

create view public.v_tabulador
with (security_invoker = on) as
select
  t.id,
  t.cargo,
  t.sueldo_mensual,
  t.moneda,
  t.orden,
  t.activo,
  t.nota,
  t.actualizado_en,
  round(t.sueldo_mensual / 2, 2)                     as sueldo_quincenal,
  round(t.sueldo_mensual * 7 / nullif(d.dias, 0), 2) as sueldo_semanal,
  round(t.sueldo_mensual / nullif(d.dias, 0), 2)     as sueldo_diario,
  d.dias                                             as dias_mes,
  (select count(*)
     from public.empleados e
    where e.tabulador_id = t.id and e.activo)::int   as personas
from public.nomina_tabulador t
-- LEFT y no CROSS: si el parámetro faltara, un CROSS JOIN dejaría la vista sin
-- una sola fila y el tabulador se vería vacío, como si nadie lo hubiera
-- cargado. Así se ve entero y lo único que falta son las cifras derivadas.
left join lateral (
  select valor as dias
    from public.nomina_parametros
   where clave = 'tabulador_dias_mes'
     and vigencia_desde <= current_date
     and (vigencia_hasta is null or vigencia_hasta >= current_date)
   order by vigencia_desde desc
   limit 1
) d on true;

grant select on public.v_tabulador to authenticated;

-- ---------------------------------------------------------------------------
-- Guardar un nivel, ya sin el bono
--
-- La firma cambia de argumentos, así que hay que borrar la vieja: un
-- `create or replace` con otra lista de parámetros no la reemplaza, deja las dos
-- y la llamada se vuelve ambigua.
-- ---------------------------------------------------------------------------
drop function if exists public.guardar_cargo_tabulador(
  bigint, text, numeric, numeric, char, integer, boolean, text
);

create function public.guardar_cargo_tabulador(
  p_id       bigint  default null,
  p_cargo    text    default null,
  p_sueldo   numeric default null,
  p_moneda   char(3) default 'USD',
  p_orden    integer default 100,
  p_activo   boolean default true,
  p_nota     text    default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.exigir_rol('RRHH');

  if length(trim(coalesce(p_cargo, ''))) < 3 then
    raise exception 'El cargo no puede quedar vacío: es el nombre con el que las fichas se enganchan al tabulador.'
      using errcode = '22023';
  end if;

  if p_sueldo is null or p_sueldo < 0 then
    raise exception 'El sueldo mensual tiene que ser un número de cero para arriba.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.nomina_tabulador
      (cargo, sueldo_mensual, moneda, orden, activo, nota, actualizado_por)
    values
      (trim(p_cargo), p_sueldo, p_moneda, coalesce(p_orden, 100),
       coalesce(p_activo, true), nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
    returning id into v_id;

    return v_id;
  end if;

  update public.nomina_tabulador set
    cargo          = trim(p_cargo),
    sueldo_mensual = p_sueldo,
    moneda         = p_moneda,
    orden          = coalesce(p_orden, 100),
    activo         = coalesce(p_activo, true),
    nota           = nullif(trim(coalesce(p_nota, '')), ''),
    actualizado_por = (select auth.uid()),
    actualizado_en  = now()
  where id = p_id;

  if not found then
    raise exception 'No existe ese cargo en el tabulador.' using errcode = 'P0002';
  end if;

  return p_id;
exception
  when unique_violation then
    raise exception 'Ya hay un cargo con ese nombre en el tabulador.' using errcode = '23505';
end;
$$;

revoke execute on function public.guardar_cargo_tabulador(bigint, text, numeric, char, integer, boolean, text) from public, anon;
grant   execute on function public.guardar_cargo_tabulador(bigint, text, numeric, char, integer, boolean, text) to authenticated;
