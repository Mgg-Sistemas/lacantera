-- ---------------------------------------------------------------------------
-- La ficha de la máquina guarda su combustible, su capacidad y su foto
--
-- Las columnas ya estaban; lo que faltaba era que alguien pudiera escribirlas y
-- que el front pudiera leerlas.
--
-- EL FALLO QUE ESTO ARREGLA, Y CÓMO SALIÓ
--
-- La pantalla lee de `v_maquinaria`, no de la tabla. Se añadieron `foto_path`,
-- `combustible_id` y `capacidad_combustible` a `maquinaria` y la vista se quedó
-- como estaba, así que la ficha habría salido siempre sin foto y con los campos
-- de combustible en blanco — sin dar ningún error, porque el campo simplemente
-- no venía.
--
-- Lo cazó el mapeo del repositorio antes de que llegara a nadie. Es la misma
-- clase de fallo que ya apareció dos veces hoy: la pantalla mira un sitio y el
-- dato vive en otro.
--
-- POR QUÉ LAS COLUMNAS NUEVAS VAN AL FINAL DE LA VISTA
--
-- `create or replace view` no deja reordenar ni renombrar columnas: solo añadir
-- por la cola. Al intentar meterlas junto a las suyas, Postgres lo leyó como un
-- renombrado —«cannot change name of view column "creada_por" to
-- "combustible_id"»— y se negó. Van al final aunque queden lejos de sus
-- hermanas, que es el precio de no tener que borrar y rehacer la vista con todo
-- lo que cuelga de ella.
--
-- Y `security_invoker` se vuelve a poner explícitamente después del reemplazo,
-- porque `create or replace view` descarta las reloptions. Es lo que provocó
-- tres incidentes esta semana y por lo que existe el disparador que lo vigila.
-- ---------------------------------------------------------------------------

do $migracion$
declare
  v_def   text;
  v_viejo text;
  v_nuevo text;
begin
  v_def := pg_get_viewdef('public.v_maquinaria'::regclass);

  if position('foto_path' in v_def) > 0 then
    return;
  end if;

  v_viejo := 'END AS semaforo
   FROM';
  v_nuevo := 'END AS semaforo,
    m.combustible_id,
    m.capacidad_combustible,
    m.foto_path,
    m.foto_zoom,
    m.foto_x,
    m.foto_y
   FROM';

  if position(v_viejo in v_def) = 0 then
    raise exception 'La vista v_maquinaria no termina como se esperaba: revísala antes de aplicar esto.';
  end if;

  execute 'create or replace view public.v_maquinaria as ' || replace(v_def, v_viejo, v_nuevo);
  execute 'alter view public.v_maquinaria set (security_invoker = on)';
end;
$migracion$;

-- ---------------------------------------------------------------------------
-- Guardar la máquina, ahora con su combustible
--
-- Se borra y se crea porque cambia la lista de argumentos: PostgREST resuelve
-- por nombre, y un `create or replace` con dos parámetros nuevos dejaría DOS
-- funciones, resolviendo cada llamada según lo que mandara el navegador.
--
-- La comprobación de que el combustible ES combustible va aquí y no solo en el
-- despacho: elegir por error un filtro de aire dejaría la máquina sin poder
-- surtirse nunca, y el mensaje del vale hablaría de un artículo que no pinta
-- nada. Es más barato pararlo donde se elige.
-- ---------------------------------------------------------------------------
drop function if exists public.guardar_maquina(
  bigint, text, text, text, text, text, text, smallint, bigint,
  numeric, numeric, numeric, smallint, text);

create or replace function public.guardar_maquina(
  p_id                    bigint,
  p_codigo                text,
  p_nombre                text,
  p_tipo                  text,
  p_marca                 text default null,
  p_modelo                text default null,
  p_serial                text default null,
  p_anio                  smallint default null,
  p_almacen_id            bigint default null,
  p_tope_horas            numeric default 250,
  p_aviso_horas           numeric default 200,
  p_alarma_horas          numeric default 220,
  p_dias_mantenimiento    smallint default null,
  p_nota                  text default null,
  p_combustible_id        bigint default null,
  p_capacidad_combustible numeric default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id     bigint;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_art    record;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  if length(v_codigo) < 2 then
    raise exception 'La máquina necesita un código que la identifique.' using errcode = '23514';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'La máquina necesita un nombre.' using errcode = '23514';
  end if;
  if p_tipo not in ('EXCAVADORA','CARGADOR','CAMION','PLANTA','PERFORADORA',
                    'VEHICULO','GENERADOR','OTRO') then
    raise exception 'Tipo de máquina no válido: %.', p_tipo using errcode = '22023';
  end if;
  if not (p_aviso_horas <= p_alarma_horas and p_alarma_horas <= p_tope_horas) then
    raise exception 'El aviso (%) tiene que ir antes que la alarma (%), y la alarma antes que el tope (%).',
      p_aviso_horas, p_alarma_horas, p_tope_horas using errcode = '22023';
  end if;
  if p_tope_horas <= 0 then
    raise exception 'El tope de horas tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if p_almacen_id is not null then
    perform 1 from public.almacenes where id = p_almacen_id;
    if not found then
      raise exception 'No existe el almacén %.', p_almacen_id using errcode = '23503';
    end if;
  end if;

  if p_combustible_id is not null then
    select id, nombre, categoria into v_art
      from public.articulos where id = p_combustible_id;
    if v_art.id is null then
      raise exception 'No existe el artículo %.', p_combustible_id using errcode = '23503';
    end if;
    if v_art.categoria <> 'COMBUSTIBLE' then
      raise exception '"%" no es combustible.', v_art.nombre using errcode = '22023';
    end if;
  end if;

  if p_capacidad_combustible is not null and p_capacidad_combustible <= 0 then
    raise exception 'La capacidad del tanque tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.maquinaria
      (codigo, nombre, tipo, marca, modelo, serial, anio, almacen_id, estado,
       tope_horas, aviso_horas, alarma_horas, dias_mantenimiento, nota,
       combustible_id, capacidad_combustible, creada_por)
    values
      (v_codigo, btrim(p_nombre), p_tipo,
       nullif(btrim(coalesce(p_marca, '')), ''), nullif(btrim(coalesce(p_modelo, '')), ''),
       nullif(btrim(coalesce(p_serial, '')), ''), p_anio, p_almacen_id, 'ACTIVA',
       p_tope_horas, p_aviso_horas, p_alarma_horas, p_dias_mantenimiento,
       nullif(btrim(coalesce(p_nota, '')), ''),
       p_combustible_id, p_capacidad_combustible, (select auth.uid()))
    returning id into v_id;
  else
    update public.maquinaria
       set codigo = v_codigo, nombre = btrim(p_nombre), tipo = p_tipo,
           marca  = nullif(btrim(coalesce(p_marca, '')), ''),
           modelo = nullif(btrim(coalesce(p_modelo, '')), ''),
           serial = nullif(btrim(coalesce(p_serial, '')), ''),
           anio   = p_anio, almacen_id = p_almacen_id,
           tope_horas = p_tope_horas, aviso_horas = p_aviso_horas,
           alarma_horas = p_alarma_horas, dias_mantenimiento = p_dias_mantenimiento,
           nota = nullif(btrim(coalesce(p_nota, '')), ''),
           combustible_id = p_combustible_id,
           capacidad_combustible = p_capacidad_combustible
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe la máquina %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe una máquina con el código %.', v_codigo using errcode = '23505';
end;
$function$;

comment on function public.guardar_maquina(bigint, text, text, text, text, text, text, smallint, bigint, numeric, numeric, numeric, smallint, text, bigint, numeric) is
  'Da de alta o corrige una máquina, con qué combustible quema y cuánto le cabe.';

revoke all on function public.guardar_maquina(bigint, text, text, text, text, text, text, smallint, bigint, numeric, numeric, numeric, smallint, text, bigint, numeric) from public;
revoke all on function public.guardar_maquina(bigint, text, text, text, text, text, text, smallint, bigint, numeric, numeric, numeric, smallint, text, bigint, numeric) from anon;
grant execute on function public.guardar_maquina(bigint, text, text, text, text, text, text, smallint, bigint, numeric, numeric, numeric, smallint, text, bigint, numeric) to authenticated;
