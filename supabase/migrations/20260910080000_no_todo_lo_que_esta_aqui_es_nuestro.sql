/*
  NO TODO LO QUE ESTÁ AQUÍ ES NUESTRO.

  Christopher: «debemos permitir identificar los items de la cantera y
  distinguirlos de los items de la gobernación. Según lo hablado, hay elementos,
  sillas, mesas, equipos, etc. que son de la gobernación, entre los items que
  tiene a disposición la cantera».

  ═══════════════════════════════════════════════════════════════════════════
  ESTO YA TENÍA UN PRECEDENTE EN LA CASA, Y SE SIGUE
  ═══════════════════════════════════════════════════════════════════════════

  No es la primera vez que aparece material que no es de la empresa. El almacén
  «COMBUSTIBLE INICIAL (SIN COSTO)» existe justo por eso: lo que hay ahí lo puso
  otra empresa, entró sin precio, y `transferir_existencia` ya prohíbe moverlo a
  un almacén normal en los dos sentidos.

  O sea que el sistema ya resolvió una vez «esto no es nuestro» separando el
  sitio. Lo que faltaba era DECIR DE QUIÉN ES, en vez de que se deduzca de un
  booleano llamado `admite_sin_costo`.

  ═══════════════════════════════════════════════════════════════════════════
  EL DUEÑO VA EN EL ALMACÉN, Y NO EN EL ARTÍCULO
  ═══════════════════════════════════════════════════════════════════════════

  Se miraron los tres sitios donde podía ir, y el del artículo se descarta
  primero: si veinte sillas son ocho de la gobernación y doce compradas, marcar
  el ARTÍCULO obliga a inventar dos artículos para la misma silla, y a partir de
  ahí nadie puede preguntar cuántas sillas hay.

  El sitio correcto de verdad sería una dimensión del propio saldo —existencia
  por almacén, artículo Y dueño— y se descarta a conciencia: tocaría
  `private.existencia`, `costo_promedio` y las catorce puertas del inventario,
  que es justo el núcleo que acabamos de mover dos días seguidos. El riesgo no lo
  paga esta necesidad.

  El almacén sí lo resuelve, y sin mentir: ocho sillas en «BIENES DE LA
  GOBERNACIÓN» y doce en «BIENES E INMUEBLES», el mismo artículo, y la existencia
  por sitio ya funciona. Además hereda gratis lo que ya está probado: los
  traslados, los conteos, las salidas y la valoración.

  QUE UN ALMACÉN SEA TAMBIÉN UN RÉGIMEN Y NO SOLO UN LUGAR ya estaba aceptado en
  esta casa: «TANQUE DE COMBUSTIBLE» y «COMBUSTIBLE INICIAL» son el mismo tanque
  físico y dos almacenes distintos.

  ═══════════════════════════════════════════════════════════════════════════
  POR QUÉ UNA TABLA Y NO UN BOOLEANO «ES_DE_LA_GOBERNACION»
  ═══════════════════════════════════════════════════════════════════════════

  Porque ya se sabe que van a ser más de dos. En la conversación de facturación
  aparecieron la gobernación, Rápido y la comunidad, y un booleano obliga a
  añadir una columna por cada dueño nuevo. Con una tabla, el dueño que aparezca
  mañana es una fila.

  `es_la_casa` marca cuál de ellos somos nosotros, y solo puede haberlo una vez:
  es lo que permite preguntar «cuánto vale lo NUESTRO» sin escribir el nombre de
  la empresa dentro de una consulta.

  NADA QUE MIGRAR: los tres almacenes donde vivirían las sillas, las mesas y los
  equipos —BIENES E INMUEBLES, ARTICULOS DE OFICINA y ARTICULOS DE COMPUTACION—
  están hoy vacíos. Comprobado antes de elegir el modelo, y por eso se pudo
  elegir el bueno en vez del que menos molestara.
*/

-- ---------------------------------------------------------------------------
-- 1. De quién puede ser algo
-- ---------------------------------------------------------------------------
create table if not exists public.propietarios (
  codigo      text primary key,
  nombre      text not null,
  /* Cuál de todos somos nosotros. Solo puede haber uno. */
  es_la_casa  boolean not null default false,
  orden       smallint not null default 100,
  activo      boolean not null default true
);

comment on table public.propietarios is
  'De quien es el material que la cantera tiene a mano. Nace porque hay sillas, mesas y equipos de la gobernacion entre las cosas de las que la cantera dispone, y el libro no sabia decirlo. Es una tabla y no un booleano «es_de_la_gobernacion» porque ya se sabe que seran mas de dos: en la conversacion de facturacion aparecieron la gobernacion, Rapido y la comunidad.';

comment on column public.propietarios.es_la_casa is
  'Cual de los duenos somos nosotros. Solo puede haber uno, y es lo que permite preguntar «cuanto vale lo NUESTRO» sin escribir el nombre de la empresa dentro de una consulta.';

/*
  UNO Y SOLO UNO ES LA CASA. Con dos, «lo nuestro» deja de tener respuesta y
  ninguna consulta avisaría: sumaría las dos y daría un número creíble.
*/
create unique index if not exists propietarios_una_sola_casa
  on public.propietarios ((true)) where es_la_casa;

alter table public.propietarios enable row level security;

drop policy if exists propietarios_lectura on public.propietarios;
create policy propietarios_lectura on public.propietarios
  for select to authenticated using (true);

revoke insert, update, delete on public.propietarios from authenticated;
grant select on public.propietarios to authenticated;

drop trigger if exists trg_auditar on public.propietarios;
create trigger trg_auditar
  after insert or update or delete on public.propietarios
  for each row execute function private.auditar('codigo');

/*
  Los dos que existen hoy. El nombre va como rótulo —se lee en una lista— y por
  eso no lo toca `trg_normalizar`: el que va en mayúsculas y sin tildes es el
  código, como en el resto de los catálogos de esta casa.
*/
insert into public.propietarios (codigo, nombre, es_la_casa, orden) values
  ('LACANTERA',   'La Cantera',  true,  10),
  ('GOBERNACION', 'Gobernación', false, 20)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Cada almacén dice de quién es lo que guarda
-- ---------------------------------------------------------------------------
alter table public.almacenes
  add column if not exists propietario text not null default 'LACANTERA';

do $fk$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'almacenes_propietario_fkey'
                    and conrelid = 'public.almacenes'::regclass) then
    alter table public.almacenes
      add constraint almacenes_propietario_fkey
      foreign key (propietario) references public.propietarios(codigo);
  end if;
end $fk$;

comment on column public.almacenes.propietario is
  'De quien es lo que hay en este almacen. Va en el ALMACEN y no en el articulo porque veinte sillas pueden ser ocho de la gobernacion y doce compradas: marcar el articulo obligaria a inventar dos articulos para la misma silla y nadie podria preguntar cuantas sillas hay. Que un almacen sea tambien un regimen y no solo un lugar ya estaba aceptado aqui: «TANQUE DE COMBUSTIBLE» y «COMBUSTIBLE INICIAL» son el mismo tanque fisico.';

-- ---------------------------------------------------------------------------
-- 3. Lo de un dueño no se mezcla con lo de otro
-- ---------------------------------------------------------------------------
/*
  La misma forma que la reja del tanque sin costo, que ya vive en esa función.
  Se parchea y no se reescribe porque `transferir_existencia` tiene doscientas
  líneas y su archivo es de ayer: copiarla entera invita a que las dos copias
  diverjan. El anclaje se comprobó contra el cuerpo vivo antes de escribirlo.
*/
do $reja$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'transferir_existencia';
  v_antes := v_def;

  if position('no se mezcla con lo de otro' in v_def) = 0 then
    v_def := replace(v_def,
'  v_existencia := private.existencia_para_escribir(p_origen_id, p_articulo_id);',
'  /*
    LO DE UN DUENO NO SE MEZCLA CON LO DE OTRO. Mover una silla de la
    gobernacion a un almacen nuestro no es un traslado: es cambiar de dueno, y
    eso no lo decide quien esta moviendo una silla.
  */
  if v_origen.propietario is distinct from v_destino.propietario then
    raise exception ''De "%" no se puede trasladar a "%": lo de un dueno no se mezcla con lo de otro.'',
      v_origen.nombre, v_destino.nombre
      using errcode = ''22023'',
            hint = ''Si de verdad cambio de dueno, eso se anota como una salida y una entrada, no como un traslado: hace falta decir por que dejo de ser de uno y paso a ser del otro.'';
  end if;

  v_existencia := private.existencia_para_escribir(p_origen_id, p_articulo_id);');
  end if;

  if v_def = v_antes then
    raise notice 'transferir_existencia ya separaba por dueno.';
  else
    execute v_def;
    raise notice 'transferir_existencia no mezcla duenos.';
  end if;
end $reja$;

-- ---------------------------------------------------------------------------
-- 4. La puerta del almacén acepta el dueño
-- ---------------------------------------------------------------------------
/*
  SE REESCRIBE ENTERA EN VEZ DE PARCHEARLA, y por una razón concreta: al ir a
  anclar las sustituciones, TRES DE LAS CUATRO no existían en el cuerpo real. El
  insertador dice `coalesce(p_recibe_compras, false)` y yo buscaba `true`; la
  corrección no usa `coalesce(..., recibe_compras)` sino `false`. Aplicadas a
  ciegas, la lista de columnas habría crecido y la de valores no — que es
  exactamente el «INSERT has more target columns than expressions» del 8 de
  septiembre.

  Una función de sesenta líneas se copia; una de trescientas se parchea. Ésta
  cabe, y copiándola se ve lo que se está firmando.

  La firma cambia —un parámetro más— así que la vieja se va en la MISMA
  migración: `create or replace` con otra firma AÑADE una función, y con dos
  toda llamada con argumentos con nombre revienta con «42725: is not unique».
*/
drop function if exists public.guardar_almacen(
  bigint, text, text, text, text, boolean, boolean, numeric, smallint);

create or replace function public.guardar_almacen(
  p_id                bigint   default null,
  p_codigo            text     default null,
  p_nombre            text     default null,
  p_tipo              text     default 'ALMACEN',
  p_ubicacion         text     default null,
  p_recibe_compras    boolean  default false,
  p_activo            boolean  default true,
  p_capacidad         numeric  default null,
  p_trabajos_a_la_vez smallint default null,
  p_propietario       text     default null
)
returns bigint language plpgsql security definer set search_path to ''
as $function$
declare
  v_id     bigint;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_dueno  text := nullif(btrim(coalesce(p_propietario, '')), '');
begin
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');

  if length(v_codigo) < 2 then
    raise exception 'El almacén necesita un código que lo identifique.' using errcode = '23514';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El almacén necesita un nombre.' using errcode = '23514';
  end if;
  if p_tipo not in ('PATIO', 'ALMACEN', 'TALLER', 'COMBUSTIBLE', 'TRANSITO') then
    raise exception 'Tipo de almacén no válido: %.', p_tipo using errcode = '22023';
  end if;

  if p_capacidad is not null and p_capacidad <= 0 then
    raise exception 'La capacidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  -- La capacidad solo significa algo en un tanque: un patio no tiene tope y un
  -- almacén tampoco. Guardarla en los demás dejaría un número que nadie lee y
  -- que alguien acabaría interpretando.
  if p_capacidad is not null and p_tipo <> 'COMBUSTIBLE' then
    raise exception 'Solo un tanque de combustible dice cuánto le cabe.'
      using errcode = '22023',
            hint = 'Un patio o un almacén no tienen tope: déjalo vacío.';
  end if;

  if p_trabajos_a_la_vez is not null and p_tipo <> 'TALLER' then
    raise exception 'Solo un taller dice cuántos trabajos aguanta a la vez.'
      using errcode = '22023';
  end if;

  /*
    EL DUEÑO SE COMPRUEBA AQUÍ Y NO SE DEJA A LA CLAVE FORÁNEA. El error de la
    base diría «viola la restricción almacenes_propietario_fkey», que no le sirve
    a nadie; con el nombre delante se corrige sin salir de la pantalla.
  */
  if v_dueno is not null
     and not exists (select 1 from public.propietarios d
                      where d.codigo = v_dueno and d.activo) then
    raise exception 'No hay ningún dueño que se llame "%".', v_dueno
      using errcode = '23503',
            hint = 'Hoy están La Cantera y la Gobernación.';
  end if;

  /*
    EL DUEÑO NO CAMBIA CON EL ALMACÉN LLENO. Cambiarlo no mueve nada, pero
    reescribe de quién es todo lo que hay dentro sin un solo asiento que lo
    explique: veinte sillas de la gobernación pasarían a ser nuestras porque
    alguien tocó un desplegable. Vacío sí, que es corregir una equivocación.
  */
  if p_id is not null and v_dueno is not null then
    if exists (select 1 from public.almacenes a
                where a.id = p_id and a.propietario is distinct from v_dueno)
       and exists (select 1 from public.v_existencias e
                    where e.almacen_id = p_id and e.existencia <> 0) then
      raise exception 'No se puede cambiar de dueño un almacén que tiene cosas dentro.'
        using errcode = '22023',
              hint = 'Sácalo todo primero. Cambiarlo lleno reescribiría de quién es lo que hay sin dejar rastro de por qué.';
    end if;
  end if;

  if p_id is null then
    insert into public.almacenes
      (codigo, nombre, tipo, ubicacion, recibe_compras, activo, capacidad,
       trabajos_a_la_vez, propietario)
    values
      (v_codigo, btrim(p_nombre), p_tipo,
       nullif(btrim(coalesce(p_ubicacion, '')), ''),
       coalesce(p_recibe_compras, false), coalesce(p_activo, true),
       p_capacidad, p_trabajos_a_la_vez, coalesce(v_dueno, 'LACANTERA'))
    returning id into v_id;
  else
    update public.almacenes
       set codigo = v_codigo,
           nombre = btrim(p_nombre),
           tipo = p_tipo,
           ubicacion = nullif(btrim(coalesce(p_ubicacion, '')), ''),
           recibe_compras = coalesce(p_recibe_compras, false),
           activo = coalesce(p_activo, true),
           capacidad = p_capacidad,
           trabajos_a_la_vez = p_trabajos_a_la_vez,
           propietario = coalesce(v_dueno, propietario)
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe el almacén %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un almacén con el código %.', v_codigo using errcode = '23505';
end;
$function$;

comment on function public.guardar_almacen(bigint, text, text, text, text, boolean, boolean, numeric, smallint, text) is
  'Da de alta o corrige un almacen. Desde el 10/09/2026 dice tambien DE QUIEN es lo que guarda: hay sillas, mesas y equipos de la gobernacion entre las cosas de las que la cantera dispone. El dueno no se puede cambiar con el almacen lleno —reescribiria de quien es lo que hay dentro sin un solo asiento que lo explique— y se comprueba aqui en vez de dejarlo a la clave foranea, porque «viola la restriccion almacenes_propietario_fkey» no le sirve a nadie.';

grant execute on function public.guardar_almacen(bigint, text, text, text, text, boolean, boolean, numeric, smallint, text) to authenticated;
