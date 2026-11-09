-- El administrador tiene TODOS los permisos por defecto (la dueña, 09/11/2026).
--
-- En la base ya pasaba siempre (private.tiene_rol, tiene_permiso, puede_accion
-- y puede_respaldar le abren la puerta a ADMIN), pero su matriz no lo decía:
-- RESPALDO en NINGUNO y ninguna casilla de «acciones especiales» marcada. Se
-- deja la matriz completa —cada módulo en Control total y cada acción
-- marcada—, también en su «↺ Por defecto», y lo que se agregue mañana (un
-- módulo o una acción nueva) le llega solo.

-- Cada módulo, en TOTAL.
update public.rol_permisos set nivel = 'TOTAL' where rol = 'ADMIN' and nivel <> 'TOTAL';
insert into public.rol_permisos (rol, modulo, nivel)
select 'ADMIN', m.modulo, 'TOTAL'
  from (select distinct modulo from public.rol_permisos) m
 where not exists (select 1 from public.rol_permisos x where x.rol = 'ADMIN' and x.modulo = m.modulo);

update public.rol_permisos_por_defecto set nivel = 'TOTAL' where rol = 'ADMIN' and nivel <> 'TOTAL';
insert into public.rol_permisos_por_defecto (rol, modulo, nivel)
select 'ADMIN', m.modulo, 'TOTAL'
  from (select distinct modulo from public.rol_permisos) m
 where not exists (select 1 from public.rol_permisos_por_defecto x where x.rol = 'ADMIN' and x.modulo = m.modulo);

-- Cada acción, marcada.
insert into public.rol_acciones (rol, accion)
select 'ADMIN', a.codigo
  from public.acciones a
 where not exists (select 1 from public.rol_acciones x where x.rol = 'ADMIN' and x.accion = a.codigo);

-- Lo que nazca después, también.
create or replace function private.admin_recibe_accion_nueva()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.rol_acciones (rol, accion)
  select 'ADMIN', new.codigo
   where not exists (select 1 from public.rol_acciones x where x.rol = 'ADMIN' and x.accion = new.codigo);
  return new;
end;
$$;

drop trigger if exists trg_admin_recibe_accion_nueva on public.acciones;
create trigger trg_admin_recibe_accion_nueva
  after insert on public.acciones
  for each row execute function private.admin_recibe_accion_nueva();

create or replace function private.admin_recibe_modulo_nuevo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rol <> 'ADMIN' then
    insert into public.rol_permisos (rol, modulo, nivel)
    select 'ADMIN', new.modulo, 'TOTAL'
     where not exists (select 1 from public.rol_permisos x where x.rol = 'ADMIN' and x.modulo = new.modulo);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_admin_recibe_modulo_nuevo on public.rol_permisos;
create trigger trg_admin_recibe_modulo_nuevo
  after insert on public.rol_permisos
  for each row execute function private.admin_recibe_modulo_nuevo();

-- Verificación.
do $$
begin
  if exists (select 1 from public.rol_permisos where rol = 'ADMIN' and nivel <> 'TOTAL') then
    raise exception 'ADMIN quedó con algún módulo por debajo de Control total.';
  end if;
  if exists (select 1 from public.acciones a
              where not exists (select 1 from public.rol_acciones x where x.rol = 'ADMIN' and x.accion = a.codigo)) then
    raise exception 'ADMIN quedó sin alguna acción marcada.';
  end if;
end $$;
