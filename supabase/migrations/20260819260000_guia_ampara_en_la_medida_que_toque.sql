-- ---------------------------------------------------------------------------
-- Una guía ampara metros cúbicos o toneladas, no siempre toneladas
--
-- La columna se llamaba `toneladas` y el formulario pedía «Toneladas que
-- ampara». La cantera opera en metros cúbicos mientras tramita la licencia de
-- toneladas, y el papel del ministerio dice una o la otra según el caso, así
-- que una columna con nombre de unidad era una trampa: el día que alguien
-- escribiera metros cúbicos ahí, el número quedaría guardado como toneladas
-- para siempre y nadie lo sabría.
--
-- Se renombra a `cantidad` y se le pone al lado la unidad. Por defecto M3, que
-- es con lo que se opera hoy.
--
-- Se renombra en vez de añadir otra columna porque no hay ninguna guía
-- registrada: hacerlo después, con datos, obligaría a adivinar cuáles de los
-- números viejos eran toneladas de verdad.
-- ---------------------------------------------------------------------------
alter table public.guias_movilizacion rename column toneladas to cantidad;

alter table public.guias_movilizacion
  add column if not exists unidad text not null default 'M3'
    references public.unidades(codigo);

alter table public.guias_movilizacion drop constraint if exists guias_unidad_de_material;
alter table public.guias_movilizacion
  add constraint guias_unidad_de_material check (unidad in ('M3', 'TON'));

comment on column public.guias_movilizacion.cantidad is
  'Cuánto ampara la guía, en la unidad de al lado. Se llamaba `toneladas` y '
  'solo admitía eso.';

comment on column public.guias_movilizacion.unidad is
  'M3 o TON, lo que diga el papel del ministerio. Por defecto M3, que es con '
  'lo que se opera hoy.';

-- ---------------------------------------------------------------------------
-- La función, con la unidad y el parámetro renombrado
--
-- Copiada de su definición viva; solo cambian el nombre del parámetro, la
-- unidad y el mensaje que hablaba de tonelaje.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_guia(
  p_numero_guia    text,
  p_vigencia_hasta date,
  p_destino        text,
  p_articulo_id    bigint,
  p_cantidad       numeric,
  p_unidad         text default 'M3',
  p_cliente_id     bigint default null,
  p_frente_id      bigint default null,
  p_origen         text default null,
  p_transportista  text default null,
  p_vehiculo       text default null,
  p_chofer         text default null,
  p_cedula_chofer  text default null,
  p_fecha_emision  date default null,
  p_observacion    text default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_fecha date := coalesce(p_fecha_emision, current_date);
  v_id    bigint;
begin
  perform private.exigir_permiso('DESPACHOS', 'ESCRITURA');

  if length(trim(coalesce(p_numero_guia, ''))) = 0 then
    raise exception 'La guía necesita su número, que es el que lleva el papel del ministerio.'
      using errcode = '22023';
  end if;

  if length(trim(coalesce(p_destino, ''))) = 0 then
    raise exception 'La guía necesita el destino: una guía ampara un viaje a un sitio.'
      using errcode = '22023';
  end if;

  if p_vigencia_hasta < v_fecha then
    raise exception 'La guía no puede vencer antes de emitirse.' using errcode = '22023';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La guía tiene que amparar una cantidad mayor que cero.' using errcode = '22023';
  end if;

  if coalesce(p_unidad, '') not in ('M3', 'TON') then
    raise exception 'Una guía ampara metros cúbicos o toneladas, no "%".', p_unidad
      using errcode = '22023';
  end if;

  insert into public.guias_movilizacion
    (numero, numero_guia, fecha_emision, vigencia_hasta, frente_id, origen, destino,
     cliente_id, articulo_id, cantidad, unidad, transportista, vehiculo, chofer, cedula_chofer,
     observacion, registrada_por)
  values
    (private.siguiente_numero('GMV'), trim(p_numero_guia), v_fecha, p_vigencia_hasta,
     p_frente_id, nullif(trim(coalesce(p_origen, '')), ''), trim(p_destino),
     p_cliente_id, p_articulo_id, p_cantidad, p_unidad,
     nullif(trim(coalesce(p_transportista, '')), ''), nullif(trim(coalesce(p_vehiculo, '')), ''),
     nullif(trim(coalesce(p_chofer, '')), ''), nullif(trim(coalesce(p_cedula_chofer, '')), ''),
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$function$;

revoke execute on function public.registrar_guia(
  text, date, text, bigint, numeric, text, bigint, bigint, text, text, text, text, text, date, text)
  from public, anon;
grant execute on function public.registrar_guia(
  text, date, text, bigint, numeric, text, bigint, bigint, text, text, text, text, text, date, text)
  to authenticated;

-- La firma vieja quedaria como sobrecarga y PostgREST no sabria cual llamar.
drop function if exists public.registrar_guia(
  text, date, text, bigint, numeric, bigint, bigint, text, text, text, text, text, date, text);
