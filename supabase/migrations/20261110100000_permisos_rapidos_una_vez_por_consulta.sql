-- El panel dejó de cargar (09/11/2026): `v_panel_resumen` tardaba ~9,8 s y el
-- tope de los usuarios es 8 s («canceling statement due to statement timeout»).
--
-- Causa: las políticas de seguridad por filas preguntan el permiso FILA POR
-- FILA (`private.tiene_permiso('INVENTARIO','LECTURA')` en cada movimiento), y
-- desde 20261109700000 `tiene_rol` pasaba por `roles_actuales()` (que además
-- expande los roles combinados): dos funciones anidadas por cada fila.
--
-- Arreglo, sin cambiar QUIÉN ve QUÉ:
--   1. `tiene_rol` vuelve a preguntar directo a la tabla (con los roles
--      combinados de `rol_incluye`), sin llamar a `roles_actuales()`.
--   2. En las políticas, cada llamada con argumentos fijos
--      (`private.tiene_permiso('X','Y')`, `private.tiene_rol(...)`,
--      `private.puede_accion('...')`) se envuelve en `(select ...)`: Postgres
--      la calcula UNA vez por consulta en vez de una por fila. Es el patrón que
--      recomienda Supabase. Las llamadas que reciben columnas de la fila
--      (p.ej. `compras_puede_ver_orden(id)`) no se tocan.
--
-- `create or replace` conserva el EXECUTE de PUBLIC (lección de 20261109700100).

create or replace function private.tiene_rol(variadic p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- ADMIN pasa siempre. Un rol combinado («Compras + Almacén») cuenta como
  -- cada uno de los roles que incluye (public.rol_incluye).
  select exists (
    select 1
      from public.usuarios_roles ur
      join public.perfiles p on p.id = ur.usuario_id
     where ur.usuario_id = (select auth.uid())
       and p.activo
       and (
             ur.rol = 'ADMIN'
          or ur.rol = any(p_roles)
          or exists (
               select 1
                 from public.rol_incluye ri
                where ri.rol = ur.rol
                  and (ri.incluye = 'ADMIN' or ri.incluye = any(p_roles))
             )
           )
  );
$$;

do $envolver$
declare
  -- private.<función>( argumentos que solo son literales: 'texto'::text,
  -- ARRAY['A'::text, 'B'::text], comas y espacios ). No se envuelve lo que ya
  -- viene precedido de «SELECT ».
  v_re constant text :=
    '(?<!SELECT )private\.(tiene_permiso|tiene_rol|puede_accion)\(((?:\s|,|''[^'']*''::text(?:\[\])?|ARRAY\[(?:\s|,|''[^'']*''::text)*\])*)\)';
  r record;
  v_qual text;
  v_check text;
  v_sql text;
  v_n int := 0;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~ v_re or coalesce(with_check, '') ~ v_re)
  loop
    v_qual  := regexp_replace(r.qual,       v_re, '(SELECT private.\1(\2))', 'g');
    v_check := regexp_replace(r.with_check, v_re, '(SELECT private.\1(\2))', 'g');
    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if r.qual is not null and v_qual is distinct from r.qual then
      v_sql := v_sql || ' using (' || v_qual || ')';
    end if;
    if r.with_check is not null and v_check is distinct from r.with_check then
      v_sql := v_sql || ' with check (' || v_check || ')';
    end if;
    execute v_sql;
    v_n := v_n + 1;
  end loop;
  raise notice 'Políticas ajustadas: %', v_n;
end
$envolver$;
