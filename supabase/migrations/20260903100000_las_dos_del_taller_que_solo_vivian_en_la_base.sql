/*
  LAS DOS DEL TALLER QUE SOLO VIVÍAN EN LA BASE.

  Salieron al replicar las migraciones sobre un proyecto de Supabase vacío y
  comparar el catálogo resultante contra el de producción: producción tenía 209
  funciones en `public` y la réplica 208, y la diferencia eran éstas dos.

      guardar_capacidad_taller       ninguna migración la crea
      guardar_especialidades_taller  ninguna migración la crea

  No es que estuvieran mal escritas: es que nunca llegaron a un archivo. Se
  aplicaron a mano por MCP y el repositorio no las tiene. Es el mismo hueco que
  se ve al contar: `supabase_migrations.schema_migrations` lleva 235 filas y en
  `supabase/migrations/` hay 209 archivos.

  Importa porque el front las llama —las dos están en la pantalla de Taller—,
  así que una base reconstruida desde el repositorio arrancaría con esa pantalla
  rota y sin que nada avisara. Se traen aquí tal como corren hoy, leídas de
  `pg_get_functiondef`, para que el archivo y la base digan lo mismo.

  APLICAR EN PRODUCCIÓN NO CAMBIA NADA: los cuerpos son idénticos a los vivos y
  el `create or replace` conserva la misma firma. Está escrita para cerrar el
  hueco, no para modificar lo que ya funciona.
*/

-- ---------------------------------------------------------------------------
-- Cuántos trabajos aguanta un taller a la vez
-- ---------------------------------------------------------------------------
create or replace function public.guardar_capacidad_taller(
  p_taller_id bigint,
  p_trabajos  smallint default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  if p_trabajos is not null and p_trabajos <= 0 then
    raise exception 'Un taller que aguanta cero trabajos no es un taller.' using errcode = '22023';
  end if;

  update public.almacenes
     set trabajos_a_la_vez = p_trabajos
   where id = p_taller_id and tipo = 'TALLER';

  if not found then
    raise exception 'El almacén % no es un taller.', p_taller_id using errcode = '22023';
  end if;

  return p_taller_id;
end;
$function$;

comment on function public.guardar_capacidad_taller(bigint, smallint) is
  'Cuántos trabajos puede llevar un taller a la vez. Nulo es sin tope.';

revoke all on function public.guardar_capacidad_taller(bigint, smallint) from public, anon;
grant execute on function public.guardar_capacidad_taller(bigint, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- Qué sabe hacer un taller
-- ---------------------------------------------------------------------------
create or replace function public.guardar_especialidades_taller(
  p_taller_id      bigint,
  p_especialidades text[] default '{}'::text[]
) returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_taller record;
  v_falta  text;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select * into v_taller from public.almacenes where id = p_taller_id and tipo = 'TALLER';
  if v_taller.id is null then
    raise exception 'El almacén % no es un taller.', p_taller_id using errcode = '22023';
  end if;

  select e into v_falta
    from unnest(coalesce(p_especialidades, '{}')) as e
   where not exists (select 1 from public.especialidades_taller x where x.codigo = e)
   limit 1;

  if v_falta is not null then
    raise exception 'No existe la especialidad "%".', v_falta using errcode = '22023';
  end if;

  -- Se reemplaza la lista entera en vez de ir añadiendo y quitando: la pantalla
  -- manda lo que quedó marcado, y así no hay forma de que se descuadren las dos.
  delete from public.taller_especialidades where taller_id = p_taller_id;

  insert into public.taller_especialidades (taller_id, especialidad)
  select p_taller_id, e from unnest(coalesce(p_especialidades, '{}')) as e;

  return coalesce(array_length(p_especialidades, 1), 0);
end;
$function$;

comment on function public.guardar_especialidades_taller(bigint, text[]) is
  'Dice qué sabe hacer un taller. Reemplaza la lista entera: la pantalla manda lo que quedó marcado.';

revoke all on function public.guardar_especialidades_taller(bigint, text[]) from public, anon;
grant execute on function public.guardar_especialidades_taller(bigint, text[]) to authenticated;
