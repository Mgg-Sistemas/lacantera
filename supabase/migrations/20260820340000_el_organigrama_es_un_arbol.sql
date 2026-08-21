-- ---------------------------------------------------------------------------
-- El organigrama, que es un árbol
--
-- La líder de sistemas mandó el organigrama dibujado a mano y pidió que el
-- sistema lo enseñe, con leyenda, y que se pueda editar — porque no es seguro
-- que la empresa se quede siempre así.
--
-- UNA SOLA TABLA
--
-- La tentación es dos: unidades por un lado y cargos por otro. Pero un cargo
-- con su gente —«2 cocineros»— cuelga de una unidad igual que una unidad
-- cuelga de otra, y separarlos obligaría a dos juegos de funciones para mover,
-- renombrar y borrar lo mismo. `tipo` distingue lo que hay que distinguir para
-- pintarlo, y el árbol es uno solo.
--
-- Un nodo lleva:
--   `nombre`       — Presidencia, Cocina, Cocineros
--   `titular`      — la persona, cuando el cargo tiene nombre y apellido
--   `cuantos`      — cuánta gente hay prevista en ese nodo
--   `departamento` — con qué departamento de la nómina se corresponde
--
-- POR QUÉ `cuantos` Y NO CONTAR LOS EMPLEADOS
--
-- Porque son dos cosas distintas y la diferencia entre ellas es justo lo que
-- interesa mirar. El organigrama dice cuánta gente **debería** haber; la nómina
-- dice cuánta hay. Christopher decidió que en esta discrepancia manda el
-- dibujo y que la nómina se irá acomodando, así que la pantalla enseña las dos
-- cifras en vez de esconder ninguna.
--
-- Hoy no cuadran: el dibujo reparte 21 personas y la nómina tiene 20 en diez
-- departamentos con otros nombres, entre ellos SEGURIDAD con cuatro personas
-- que en el dibujo no aparece. Eso se ve en la pantalla y se corrige editando.
--
-- LA REGLA QUE NO PUEDE ROMPERSE
--
-- Un nodo no puede colgar de sí mismo ni de ninguno de sus descendientes. Sin
-- ese freno, arrastrar Administración dentro de Cocina dejaría un trozo del
-- árbol suelto y girando, y cualquier consulta recursiva sobre él no
-- terminaría nunca.
-- ---------------------------------------------------------------------------

create table if not exists public.organigrama_nodos (
  id           bigint generated always as identity primary key,
  padre_id     bigint references public.organigrama_nodos(id) on delete restrict,
  nombre       text    not null check (length(btrim(nombre)) >= 2),
  titular      text,
  tipo         text    not null default 'UNIDAD'
                 check (tipo in ('UNIDAD', 'CARGO')),
  cuantos      integer not null default 1 check (cuantos >= 0),
  -- Con qué departamento de la nómina se corresponde. Texto y no clave foránea
  -- porque `empleados.departamento` también es texto libre: atarlos con una FK
  -- exigiría normalizar la nómina antes, y el encargo es al revés — primero el
  -- dibujo, la nómina se acomoda después.
  departamento text,
  nota         text,
  orden        integer not null default 0,
  activo       boolean not null default true,
  creado_por   uuid references auth.users(id),
  creado_en    timestamptz not null default now()
);

create index if not exists organigrama_nodos_padre_idx
  on public.organigrama_nodos (padre_id, orden);

-- Una sola raíz. El organigrama de una empresa tiene una cabeza; dos raíces
-- serían dos organigramas, y la pantalla no sabría cuál pintar.
create unique index if not exists organigrama_una_sola_raiz
  on public.organigrama_nodos ((padre_id is null)) where padre_id is null;

comment on table public.organigrama_nodos is
  'El organigrama, como árbol. Una fila por unidad o por cargo. `cuantos` es la '
  'gente prevista, que no tiene por qué coincidir con la registrada en nómina.';

-- Los disparadores de la casa: toda tabla nueva los lleva.
drop trigger if exists trg_auditar on public.organigrama_nodos;
create trigger trg_auditar
  after insert or update or delete on public.organigrama_nodos
  for each row execute function private.auditar('id');

-- `nota` queda fuera a propósito: es prosa libre, y una frase entera en
-- mayúscula se lee como un grito. Lo que se normaliza es lo que después se
-- compara o se busca.
drop trigger if exists trg_normalizar on public.organigrama_nodos;
create trigger trg_normalizar
  before insert or update on public.organigrama_nodos
  for each row execute function private.normalizar_texto('nombre', 'titular', 'departamento');

alter table public.organigrama_nodos enable row level security;

drop policy if exists organigrama_lectura on public.organigrama_nodos;
create policy organigrama_lectura on public.organigrama_nodos
  for select to authenticated
  using (private.tiene_permiso('NOMINA', 'LECTURA'));

revoke insert, update, delete on public.organigrama_nodos from authenticated;
grant select on public.organigrama_nodos to authenticated;

-- ---------------------------------------------------------------------------
-- La vista: el árbol ya recorrido, con profundidad y con la nómina al lado
-- ---------------------------------------------------------------------------

create or replace view public.v_organigrama as
with recursive arbol as (
  select n.id, n.padre_id, n.nombre, n.titular, n.tipo, n.cuantos,
         n.departamento, n.nota, n.orden, n.activo,
         0 as nivel,
         -- El camino ordena el árbol entero en una sola consulta: basta con
         -- ordenar por él para que cada hijo salga debajo de su padre.
         lpad(n.orden::text, 6, '0') || '/' || n.id::text as camino,
         n.nombre as rama
    from public.organigrama_nodos n
   where n.padre_id is null

  union all

  select h.id, h.padre_id, h.nombre, h.titular, h.tipo, h.cuantos,
         h.departamento, h.nota, h.orden, h.activo,
         a.nivel + 1,
         a.camino || '.' || lpad(h.orden::text, 6, '0') || '/' || h.id::text,
         a.rama
    from public.organigrama_nodos h
    join arbol a on a.id = h.padre_id
)
select a.*,
       (select count(*) from public.organigrama_nodos c where c.padre_id = a.id) as hijos,
       -- La gente que la nómina tiene puesta en ese departamento. Null cuando
       -- el nodo no está enganchado a ninguno: no es cero, es «no se sabe».
       case when a.departamento is not null
            then (select count(*) from public.empleados e
                   where e.activo and upper(btrim(e.departamento)) = upper(btrim(a.departamento)))
       end as registrados
  from arbol a;

alter view public.v_organigrama set (security_invoker = on);

comment on view public.v_organigrama is
  'El organigrama recorrido en orden, con el nivel de cada nodo y la gente que '
  'la nómina tiene registrada en su departamento.';

grant select on public.v_organigrama to authenticated;

-- ---------------------------------------------------------------------------
-- Guardar un nodo
-- ---------------------------------------------------------------------------

create or replace function public.guardar_nodo_organigrama(
  p_id bigint,
  p_nombre text,
  p_padre_id bigint default null,
  p_titular text default null,
  p_tipo text default 'UNIDAD',
  p_cuantos integer default 1,
  p_departamento text default null,
  p_nota text default null,
  p_orden integer default 0
) returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_id bigint;
begin
  perform private.exigir_permiso('NOMINA', 'ESCRITURA');

  if length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El nombre del cargo o la unidad no puede quedar vacío.'
      using errcode = '23514';
  end if;

  if p_tipo not in ('UNIDAD', 'CARGO') then
    raise exception 'Un nodo del organigrama es una UNIDAD o un CARGO.'
      using errcode = '22023';
  end if;

  if p_id is null and p_padre_id is null
     and exists (select 1 from public.organigrama_nodos where padre_id is null) then
    raise exception 'Ya hay una cabeza en el organigrama. Cuelga este nodo de alguna.'
      using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.organigrama_nodos
      (padre_id, nombre, titular, tipo, cuantos, departamento, nota, orden, creado_por)
    values
      (p_padre_id, p_nombre, nullif(btrim(coalesce(p_titular, '')), ''), p_tipo,
       coalesce(p_cuantos, 1), nullif(btrim(coalesce(p_departamento, '')), ''),
       nullif(btrim(coalesce(p_nota, '')), ''), coalesce(p_orden, 0), (select auth.uid()))
    returning id into v_id;
  else
    -- El padre se cambia con `mover_nodo_organigrama`, que es quien sabe
    -- comprobar que no se forme un bucle. Aquí se deja donde está.
    update public.organigrama_nodos
       set nombre = p_nombre,
           titular = nullif(btrim(coalesce(p_titular, '')), ''),
           tipo = p_tipo,
           cuantos = coalesce(p_cuantos, 1),
           departamento = nullif(btrim(coalesce(p_departamento, '')), ''),
           nota = nullif(btrim(coalesce(p_nota, '')), ''),
           orden = coalesce(p_orden, 0)
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese nodo del organigrama ya no existe.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$func$;

-- ---------------------------------------------------------------------------
-- Mover un nodo, sin dejar que se enrede
-- ---------------------------------------------------------------------------

create or replace function public.mover_nodo_organigrama(
  p_id bigint,
  p_padre_id bigint,
  p_orden integer default 0
) returns void
language plpgsql
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_permiso('NOMINA', 'ESCRITURA');

  if p_padre_id is null then
    raise exception 'Un nodo tiene que colgar de alguno. La cabeza ya está puesta.'
      using errcode = '22023';
  end if;

  if p_id = p_padre_id then
    raise exception 'Un cargo no puede depender de sí mismo.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.organigrama_nodos where id = p_id) then
    raise exception 'Ese nodo del organigrama ya no existe.' using errcode = 'P0002';
  end if;

  -- El freno que importa: colgar algo de su propio descendiente partiría el
  -- árbol en un anillo suelto, y cualquier recorrido recursivo sobre él no
  -- terminaría. Se busca `p_padre_id` entre los descendientes de `p_id`.
  if exists (
    with recursive descendientes as (
      select id from public.organigrama_nodos where id = p_id
      union all
      select h.id from public.organigrama_nodos h
        join descendientes d on d.id = h.padre_id
    )
    select 1 from descendientes where id = p_padre_id
  ) then
    raise exception 'No se puede mover ahí: ese puesto ya depende de este.'
      using errcode = '22023';
  end if;

  update public.organigrama_nodos
     set padre_id = p_padre_id, orden = coalesce(p_orden, 0)
   where id = p_id;
end;
$func$;

-- ---------------------------------------------------------------------------
-- Quitar un nodo
-- ---------------------------------------------------------------------------

create or replace function public.eliminar_nodo_organigrama(p_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_hijos int;
begin
  perform private.exigir_permiso('NOMINA', 'ESCRITURA');

  select count(*) into v_hijos from public.organigrama_nodos where padre_id = p_id;

  -- Se niega en vez de arrastrar a los hijos. Borrar en cascada una rama
  -- entera de un organigrama por un clic es de las cosas que no se pueden
  -- deshacer y nadie espera; mover los hijos «hacia arriba» por nuestra cuenta
  -- sería inventarle una jerarquía a la empresa.
  if v_hijos > 0 then
    raise exception 'De ahí cuelgan % puesto(s). Muévelos o quítalos primero.', v_hijos
      using errcode = '23503';
  end if;

  delete from public.organigrama_nodos where id = p_id;
end;
$func$;

revoke execute on function public.guardar_nodo_organigrama(bigint, text, bigint, text, text, integer, text, text, integer) from public, anon;
grant  execute on function public.guardar_nodo_organigrama(bigint, text, bigint, text, text, integer, text, text, integer) to authenticated;
revoke execute on function public.mover_nodo_organigrama(bigint, bigint, integer) from public, anon;
grant  execute on function public.mover_nodo_organigrama(bigint, bigint, integer) to authenticated;
revoke execute on function public.eliminar_nodo_organigrama(bigint) from public, anon;
grant  execute on function public.eliminar_nodo_organigrama(bigint) to authenticated;
