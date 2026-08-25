-- Se puede autorizar a alguien, por un tiempo o para siempre.
--
-- La líder: «Coloca que Jesmary pueda aprobar las órdenes marcando un check que
-- diga: Autorizada bajo autorización del gerente general».
--
-- Y Christopher lee lo que hay detrás: van a aparecer más casos en que alguien
-- con jerarquía le presta a otro un permiso que no le compete, de forma
-- temporal o indefinida. Y lo aterriza: «en usuarios, se pueda extender
-- permisos que no competen a un rol, bajo una justificación».
--
-- NOTA DE ORDEN, para quien lea esto seguido: aquí la tabla nace como
-- `delegaciones` y la migración siguiente la renombra a `autorizaciones`, que
-- es la palabra que usan la líder y Christopher y la que sale impresa en el
-- papel. Se deja en dos archivos y no en uno corregido porque es lo que corrió,
-- y un archivo que no coincide con lo que corrió es justo lo que este proyecto
-- lleva un mes pagando (regla 7).
--
-- =========================================================================
-- POR QUÉ EL CHECK NECESITA ALGO DETRÁS
-- =========================================================================
--
-- `aprobar_compra` escribe hoy `aprobada_gg_por = auth.uid()`. Si Jesmary
-- aprueba, esa columna —que se llama «aprobada por el gerente general»— pasaría
-- a decir Jesmary. Y el check sería una frase que teclea quien aprueba sobre sí
-- mismo: no prueba nada, y en un papel que compromete dinero eso es peor que no
-- tenerlo.
--
-- Con un registro detrás, la orden puede decir la verdad entera: aprobada por
-- Jesmary, bajo autorización de Jesús Lozada, por la autorización del 25/08. Y
-- se retira de un clic.
--
-- =========================================================================
-- LAS CUATRO DECISIONES, Y POR QUÉ
-- =========================================================================
--
-- 1. SE PRESTA UNA CASILLA, no un rol ni un módulo. El catálogo de acciones ya
--    tiene nombre para cada cosa que se puede hacer; prestar «aprobar la
--    compra» es prestar exactamente eso y nada más. Prestar un rol prestaría de
--    paso todo lo demás que ese rol abre.
--
-- 2. LA GESTIONAN ADMINISTRACIÓN Y LA GERENCIA. Lo pidió así Christopher. Pero
--    con un freno que no contradice eso y que hace falta: NADIE PRESTA LO QUE
--    NO PUEDE HACER. Sin ese freno, el gerente general podría concederle a
--    cualquiera «crear usuarios», que es algo que él mismo no puede — y eso no
--    es delegar, es fabricar permiso de la nada.
--
-- 3. HAY DOS QUE NO SE PRESTAN NUNCA: repartir permisos y decidir los roles de
--    una persona. Prestar la llave que reparte llaves es una escalera a todo el
--    sistema, y con un peldaño intermedio que además la disimula.
--
-- 4. LA AUTORIZACIÓN NO SE NOTA CUANDO NO HACE FALTA. Si quien actúa ya podía
--    hacerlo por su rol o por su nivel, no se registra ninguna autoridad: la
--    orden diría «bajo autorización de» sobre alguien que no autorizó nada. Por
--    eso `puede_accion` se parte en dos y hay una función aparte que responde
--    «¿estás pasando por prestado, y de quién?».

create table if not exists public.delegaciones (
  id          bigint generated always as identity primary key,

  accion      text not null references public.acciones(codigo) on delete cascade,
  a_usuario   uuid not null references public.perfiles(id),

  -- Quien la concede. No es lo mismo que quien la teclea si un administrador la
  -- registra en nombre de la gerencia, pero hoy son la misma persona y así
  -- queda dicho de quién es la autoridad que se invoca en el papel.
  por_usuario uuid not null references public.perfiles(id),

  desde       date not null default current_date,
  -- Nulo es «indefinida», que es la mitad de lo que se pidió. No se pone una
  -- fecha lejana por defecto: una caducidad falsa es peor que ninguna, porque
  -- el día que venza nadie va a saber por qué dejó de funcionar.
  hasta       date,

  motivo      text not null,

  revocada_en     timestamptz,
  revocada_por    uuid references public.perfiles(id),
  revocada_motivo text,

  creada_en   timestamptz not null default now(),
  creada_por  uuid references public.perfiles(id),

  constraint delegaciones_fechas    check (hasta is null or hasta >= desde),
  constraint delegaciones_motivo    check (length(btrim(motivo)) >= 5),
  constraint delegaciones_no_a_si_mismo check (a_usuario <> por_usuario)
);

create index if not exists delegaciones_vigentes_idx
  on public.delegaciones (a_usuario, accion)
  where revocada_en is null;

alter table public.delegaciones enable row level security;

-- Se lee entera: quien mira una orden aprobada por autorización tiene que poder
-- ver de quién era la autoridad. Esconderlo dejaría el papel diciendo «bajo
-- autorización de» sin poder comprobar de quién.
drop policy if exists delegaciones_lectura on public.delegaciones;
create policy delegaciones_lectura on public.delegaciones
  for select using (auth.uid() is not null);

revoke all on public.delegaciones from anon, authenticated;
grant select on public.delegaciones to authenticated;

create trigger trg_auditar
  after insert or delete or update on public.delegaciones
  for each row execute function private.auditar('accion', 'a_usuario');

comment on table public.delegaciones is
  'Permisos prestados: alguien con jerarquia le concede a otra persona una casilla concreta, por un tiempo o indefinidamente.';

-- ---------------------------------------------------------------------------
-- La puerta se parte en dos
--
-- `puede_accion_propia` es lo que había: rol de administrador, casilla marcada,
-- o el escalón equivalente. `puede_accion` es eso MÁS lo prestado.
--
-- La partición no es cosmética: es lo que permite responder «¿estás pasando por
-- prestado?», que es lo único que hace honesto el papel.
-- ---------------------------------------------------------------------------
create or replace function private.puede_accion_propia(p_accion text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $func$
  select private.tiene_rol('ADMIN')

     or exists (
          select 1
            from public.usuarios_roles ur
            join public.perfiles p on p.id = ur.usuario_id
            join public.rol_acciones ra on ra.rol = ur.rol
           where ur.usuario_id = (select auth.uid())
             and p.activo
             and ra.accion = p_accion
        )

     or exists (
          select 1
            from public.usuarios_roles ur
            join public.perfiles     p  on p.id = ur.usuario_id
            join public.roles        r  on r.codigo = ur.rol
            join public.acciones     a  on a.codigo = p_accion
            join public.rol_permisos rp on rp.rol = ur.rol and rp.modulo = a.modulo
           where ur.usuario_id = (select auth.uid())
             and p.activo
             and not r.a_la_medida
             and a.nivel_equivalente is not null
             and private.rango_nivel(rp.nivel) >= private.rango_nivel(a.nivel_equivalente)
        );
$func$;

comment on function private.puede_accion_propia(text) is
  'Si quien llama puede hacer esa accion POR DERECHO PROPIO: por ser administrador, por tener la casilla marcada en alguno de sus roles, o por el escalon equivalente. No mira lo prestado.';

-- Quién le presta a quien llama esta acción, ahora mismo. Nulo si no se la
-- presta nadie, y nulo también si ya podía por su cuenta — que es el caso que
-- evita firmar «bajo autorización de» a quien no necesitaba autorización.
create or replace function private.autoriza_delegacion(p_accion text)
returns uuid
language sql
stable
security definer
set search_path to ''
as $func$
  select case when private.puede_accion_propia(p_accion) then null
              else (
                select d.por_usuario
                  from public.delegaciones d
                  join public.perfiles p on p.id = d.a_usuario
                 where d.a_usuario = (select auth.uid())
                   and d.accion = p_accion
                   and d.revocada_en is null
                   and p.activo
                   and d.desde <= current_date
                   and (d.hasta is null or d.hasta >= current_date)
                 order by d.creada_en desc
                 limit 1
              )
         end;
$func$;

comment on function private.autoriza_delegacion(text) is
  'De quien es la autoridad con la que quien llama esta haciendo esto, o nulo si va por derecho propio. Es lo que se estampa en el papel: «aprobada por X, bajo autorizacion de Y».';

create or replace function private.puede_accion(p_accion text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $func$
  select private.puede_accion_propia(p_accion)
      or exists (
           select 1
             from public.delegaciones d
             join public.perfiles p on p.id = d.a_usuario
            where d.a_usuario = (select auth.uid())
              and d.accion = p_accion
              and d.revocada_en is null
              and p.activo
              and d.desde <= current_date
              and (d.hasta is null or d.hasta >= current_date)
         );
$func$;

comment on function private.puede_accion(text) is
  'Si quien llama puede hacer esa accion: por derecho propio o porque alguien con jerarquia se la presto por un tiempo. Para saber cual de las dos, private.autoriza_delegacion.';
