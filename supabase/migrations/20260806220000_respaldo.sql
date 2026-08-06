-- ============================================================================
-- El respaldo de la base, descargable desde el sistema
--
-- Los datos son de la empresa y hasta hoy no había forma de sacarlos sin
-- entrar al panel de Supabase. Esto pone un botón dentro del sistema.
--
-- QUÉ SE ESTÁ CREANDO, EXACTAMENTE
--
-- Un archivo con TODOS los datos del esquema `public`, tabla por tabla, en un
-- formato que los vuelve a meter. Con las migraciones de este repositorio
-- —que son la estructura— y este archivo —que son los datos— se reconstruye la
-- base entera en una instalación limpia.
--
-- No lleva claves. Las contraseñas viven cifradas en el esquema `auth`, que
-- esta función no toca. Un respaldo que las llevara sería un archivo del que no
-- se puede uno fiar ni guardándolo bien.
--
-- POR QUÉ ESTE ARCHIVO ES EL MÁS PELIGROSO DE LA EMPRESA
--
-- Lleva juntas las cédulas, los sueldos y las cuentas bancarias de todo el
-- personal, los precios, los clientes y la bitácora entera. Todo lo que el
-- sistema protege con permisos y con RLS, en un solo archivo que ya no está
-- protegido por nada.
--
-- De ahí salen las tres decisiones de abajo: quién puede pedirlo, que cada
-- descarga quede anotada, y que el archivo diga en su cabecera lo que es.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- El módulo
--
-- Va a la matriz de permisos como cualquier otro para que se pueda repartir y
-- quitar desde la pantalla de Usuarios y roles, sin tocar código ni desplegar.
-- ---------------------------------------------------------------------------
insert into public.modulos (codigo, nombre, descripcion, orden) values
  ('RESPALDO', 'Respaldo de la base',
   'Descargar una copia completa de los datos del sistema.', 120)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion,
      orden = excluded.orden;

-- ---------------------------------------------------------------------------
-- El rol
--
-- Un rol propio y no un nivel dentro de otro. El permiso vive en el rol, no en
-- la persona, así que "solo estas dos personas" se escribe como "un rol que
-- solo tienen estas dos personas". Con `sistema = true` no se puede borrar ni
-- renombrar desde la pantalla: es la llave de la caja fuerte, no un rol de la
-- casa que alguien reorganiza un martes.
--
-- No trae ningún otro permiso. Quien lo tenga sigue viendo del sistema
-- exactamente lo que le den sus otros roles.
-- ---------------------------------------------------------------------------
insert into public.roles (codigo, nombre, descripcion, orden) values
  ('RESPALDO', 'Respaldo de la base',
   'Puede descargar la copia completa de los datos. Es el archivo más sensible del sistema: no se reparte.',
   900)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion;

update public.roles set sistema = true where codigo = 'RESPALDO';

insert into public.rol_permisos (rol, modulo, nivel) values
  ('RESPALDO', 'RESPALDO', 'TOTAL')
on conflict (rol, modulo) do update set nivel = excluded.nivel;

-- El resto de los roles, incluido ADMIN, se quedan explícitamente fuera. Se
-- escribe la fila en NINGUNO en vez de dejarla ausente: en la pantalla, un
-- módulo sin fila y un módulo en NINGUNO se ven igual, pero escrito se lee como
-- una decisión y no como un olvido.
insert into public.rol_permisos (rol, modulo, nivel)
select r.codigo, 'RESPALDO', 'NINGUNO'
  from public.roles r
 where r.codigo <> 'RESPALDO'
on conflict (rol, modulo) do nothing;

-- ---------------------------------------------------------------------------
-- La puerta, sin el atajo de ADMIN
--
-- `private.tiene_permiso` deja pasar siempre a ADMIN, y con razón: si la matriz
-- pudiera dejar a ADMIN fuera de un módulo, una tarde de clics distraídos
-- cerraría la pantalla de usuarios y no habría forma de volver a abrirla desde
-- dentro.
--
-- Aquí ese atajo no sirve. "Puede administrar el sistema" y "puede llevarse
-- todos los datos de la empresa en un archivo" no son la misma autorización, y
-- con el atajo puesto cualquier administrador podría descargarlo sin que nadie
-- se lo hubiera dado.
--
-- Así que se comprueba el permiso a mano, contra la matriz y nada más. Un
-- administrador sigue pudiendo otorgárselo —esa llave no se le puede quitar sin
-- dejar el sistema sin salida de emergencia— pero tiene que hacerlo, y ese
-- movimiento queda escrito en la auditoría con su nombre.
-- ---------------------------------------------------------------------------
create or replace function private.puede_respaldar()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.usuarios_roles ur
      join public.perfiles     p  on p.id = ur.usuario_id
      join public.rol_permisos rp on rp.rol = ur.rol
     where ur.usuario_id = (select auth.uid())
       and p.activo
       and rp.modulo = 'RESPALDO'
       and rp.nivel  = 'TOTAL'
  );
$$;

-- ---------------------------------------------------------------------------
-- El volcado
--
-- CÓMO SE ESCRIBEN LOS DATOS
--
-- No se genera un INSERT por fila con los valores escritos uno a uno. Esa forma
-- obliga a citar cada tipo a mano —comillas, escapes, fechas, arreglos, nulos—
-- y basta una columna de un tipo que nadie previó para que el archivo salga
-- roto de una manera que solo se descubre al intentar restaurarlo.
--
-- En vez de eso, cada tabla sale como UNA instrucción con sus filas en JSON, y
-- se restaura con `jsonb_populate_record`, que es el mismo mecanismo con el que
-- Postgres convierte JSON en filas. La conversión de ida y de vuelta la hace la
-- base, no una concatenación de texto: los arreglos, las fechas, los `inet` y
-- los `numeric` de veinte dígitos vuelven como salieron.
--
-- EN QUÉ ORDEN
--
-- Por dependencias. Una tabla se escribe después de aquellas a las que apunta,
-- porque restaurar los renglones de una factura antes que la factura choca
-- contra la clave foránea. El orden sale del catálogo, no de una lista escrita
-- a mano que se quedaría vieja con la primera tabla nueva.
--
-- LO QUE NO ENTRA
--
-- El esquema `auth`, donde viven las contraseñas cifradas. Y las vistas, que no
-- guardan nada: se recalculan solas cuando la estructura vuelve a existir.
-- ---------------------------------------------------------------------------
create or replace function public.respaldo_datos()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tabla   text;
  v_datos   jsonb;
  v_filas   bigint;
  v_total   bigint := 0;
  v_tablas  int := 0;
  v_partes  text[] := '{}';
  v_orden   text[];
  v_forzar  text;
begin
  if not private.puede_respaldar() then
    raise exception 'Descargar el respaldo de la base requiere el rol Respaldo de la base. Este archivo lleva las cédulas, los sueldos y las cuentas bancarias de todo el personal: no se reparte.'
      using errcode = '42501';
  end if;

  /*
    El orden de las tablas, por dependencias.

    `with recursive` sobre las claves foráneas: una tabla entra cuando ya
    entraron todas a las que apunta. Las que se apuntan a sí mismas —una
    jerarquía— no bloquean, porque una fila puede apuntar a otra de su propia
    tabla y eso se resuelve dentro del mismo INSERT.
  */
  with recursive
  tablas as (
    select c.oid, c.relname::text as nombre
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  ),
  aristas as (
    select con.conrelid as hija, con.confrelid as madre
      from pg_constraint con
      join tablas h on h.oid = con.conrelid
      join tablas m on m.oid = con.confrelid
     where con.contype = 'f' and con.conrelid <> con.confrelid
  ),
  niveles as (
    select t.oid, t.nombre, 0 as nivel
      from tablas t
     where not exists (select 1 from aristas a where a.hija = t.oid)
    union all
    select t.oid, t.nombre, n.nivel + 1
      from tablas t
      join aristas a on a.hija = t.oid
      join niveles n on n.oid = a.madre
     where n.nivel < 20
  )
  /*
    Toda tabla entra, tenga nivel o no.

    El recorrido de arriba solo alcanza a las tablas que cuelgan de alguna sin
    dependencias. Dos tablas que se apunten entre sí no colgarían de ninguna y
    NO APARECERÍAN — se quedarían fuera del respaldo sin que nada lo dijera, que
    es la única forma en que un respaldo puede fallar de verdad: pareciendo que
    salió bien. A las que no alcanzó el recorrido se les pone el nivel 99 y van
    al final, donde de todos modos los disparadores están apagados.
  */
  select array_agg(x.nombre order by x.nivel, x.nombre)
    into v_orden
    from (
      select t.nombre,
             coalesce((select max(n.nivel) from niveles n where n.nombre = t.nombre), 99) as nivel
        from tablas t
    ) x;

  v_partes := v_partes || format(
$cab$-- ============================================================================
-- RESPALDO DE LA BASE DE DATOS
-- %s · RIF %s
--
-- Generado el %s por %s.
--
-- QUÉ ES ESTE ARCHIVO
--
-- Todos los datos del sistema. No la estructura: esa vive en las migraciones
-- del repositorio. Para reconstruir la base hacen falta las dos cosas, y en
-- este orden: primero las migraciones sobre una base limpia, después este
-- archivo.
--
-- No lleva contraseñas. Los usuarios habrá que volver a crearlos.
--
-- CÓMO SE RESTAURA
--
--   psql "URL-DE-LA-BASE-NUEVA" -f este-archivo.sql
--
-- Va entero dentro de una transacción: si algo falla, no queda nada a medias.
--
-- CUIDADO CON ESTE ARCHIVO
--
-- Lleva las cédulas, los sueldos y las cuentas bancarias de todo el personal,
-- los precios, los clientes y la bitácora completa. Todo lo que el sistema
-- protege con permisos, junto y sin ninguna protección. No se manda por correo
-- ni queda en la carpeta de descargas de una computadora compartida.
-- ============================================================================

begin;

-- Los disparadores se apagan mientras se restaura. Si no, el de auditoría
-- anotaría cada fila restaurada como si alguien la acabara de escribir, y la
-- bitácora del sistema nuevo nacería con miles de renglones falsos.
set session_replication_role = replica;

$cab$,
    coalesce((select e.razon_social from public.empresa e where e.id = 1), 'MINERIA INTERNACIONAL TS, C.A.'),
    coalesce((select e.rif from public.empresa e where e.id = 1), '—'),
    to_char(now() at time zone 'America/Caracas', 'DD/MM/YYYY HH24:MI'),
    coalesce((select p.nombre || ' (' || p.usuario || ')' from public.perfiles p where p.id = (select auth.uid())), 'el sistema')
  );

  foreach v_tabla in array coalesce(v_orden, '{}'::text[]) loop
    execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb), count(*) from public.%I t', v_tabla)
      into v_datos, v_filas;

    v_tablas := v_tablas + 1;
    v_total  := v_total + v_filas;

    if v_filas = 0 then
      -- Se anota igual. Una tabla vacía es un dato: dice que se miró y no
      -- había nada, que no es lo mismo que no haberla mirado.
      v_partes := v_partes || format(E'-- %s · sin filas\n', v_tabla);
      continue;
    end if;

    /*
      `overriding system value` solo donde hace falta.

      Sirve para meter el id original en una columna `generated always as
      identity`, que si no lo rechaza. Pero en una tabla que NO tiene columna de
      identidad —`modulos`, `roles`, `perfiles`, que se identifican por un
      código o por un uuid— esa cláusula no es inofensiva: Postgres la rechaza, y
      con ella se caería la restauración entera. Se pregunta al catálogo tabla
      por tabla en vez de suponerlo.
    */
    select case when exists (
             select 1
               from pg_attribute a
               join pg_class c on c.oid = a.attrelid
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = v_tabla
                and a.attidentity = 'a' and a.attnum > 0 and not a.attisdropped
           ) then ' overriding system value' else '' end
      into v_forzar;

    v_partes := v_partes || format(
      E'-- %s · %s fila(s)\ndelete from public.%I;\ninsert into public.%I%s\nselect (jsonb_populate_record(null::public.%I, x)).*\n  from jsonb_array_elements(%L::jsonb) as x;\n\n',
      v_tabla, v_filas, v_tabla, v_tabla, v_forzar, v_tabla, v_datos::text);
  end loop;

  /*
    La cuenta tiene que cuadrar antes de entregar el archivo.

    Si por lo que sea se escribieran menos tablas de las que hay, el archivo
    saldría igual y con buena cara, y el día que hiciera falta faltaría algo.
    Mejor no entregar nada y decirlo.
  */
  if v_tablas <> (select count(*) from pg_class c
                    join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relkind = 'r') then
    raise exception 'El respaldo salió incompleto: se escribieron % tablas y en la base hay otra cantidad. No se entrega a medias.', v_tablas
      using errcode = 'XX000';
  end if;

  v_partes := v_partes || format(
    E'\nset session_replication_role = default;\n\ncommit;\n\n-- %s tabla(s) · %s fila(s) en total.\n',
    v_tablas, v_total);

  -- Cada descarga queda escrita. Es lo mínimo que se le puede pedir a la
  -- acción de sacar todos los datos de la empresa por la puerta: que dentro de
  -- un año se pueda saber quién lo hizo y qué día.
  perform private.anotar_respaldo(v_tablas, v_total);

  return array_to_string(v_partes, '');
end;
$$;

-- ---------------------------------------------------------------------------
-- La anotación
--
-- Aparte, y no un `insert` dentro de la función de arriba, porque la tabla de
-- auditoría no acepta escrituras desde la aplicación: las pone el disparador.
-- Esta es la misma excepción que ya se hace para los cambios de clave, que
-- tampoco dejan rastro por sí solos.
--
-- Se anota con la operación ACCESO. Descargar el respaldo no cambia ni una
-- fila: es la lectura más grande que puede hacer alguien en este sistema, y eso
-- es exactamente lo que significa ACCESO en esta bitácora.
-- ---------------------------------------------------------------------------
create or replace function private.anotar_respaldo(p_tablas int, p_filas bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_quien record;
begin
  select * into v_quien from private.quien_escribe();

  insert into public.auditoria
    (usuario_id, usuario, nombre, tabla, operacion, fila_id, etiqueta, ip)
  values
    (v_quien.id, v_quien.usuario, v_quien.nombre, 'respaldo', 'ACCESO', null,
     format('Descargó el respaldo completo · %s tablas · %s filas', p_tablas, p_filas),
     private.ip_de_la_peticion());
end;
$$;

revoke execute on function public.respaldo_datos() from public, anon;
grant   execute on function public.respaldo_datos() to authenticated;

-- ---------------------------------------------------------------------------
-- Cuánto pesa y de cuándo es el último
--
-- La pantalla lo pregunta antes de ofrecer el botón. Un respaldo de una base
-- grande tarda, y sin esto la persona pulsa y se queda mirando una pantalla
-- quieta sin saber si son tres segundos o tres minutos.
--
-- No pide el permiso de respaldo: son dos cuentas y una fecha, no datos. Lo que
-- sí pide es sesión, como todo.
-- ---------------------------------------------------------------------------
create or replace function public.respaldo_resumen()
returns table (tablas int, filas bigint, ultimo timestamptz, ultimo_por text, autorizado boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::int from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'),
    -- Estimación del planificador, no un conteo real: contar todas las filas de
    -- todas las tablas para pintar un número en pantalla costaría más que el
    -- propio respaldo.
    (select coalesce(sum(greatest(c.reltuples, 0))::bigint, 0) from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'),
    (select max(a.ocurrido_en) from public.auditoria a where a.tabla = 'respaldo'),
    (select a.nombre from public.auditoria a where a.tabla = 'respaldo'
      order by a.ocurrido_en desc limit 1),
    private.puede_respaldar();
$$;

revoke execute on function public.respaldo_resumen() from public, anon;
grant   execute on function public.respaldo_resumen() to authenticated;
