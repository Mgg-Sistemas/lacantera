/*
  LA VISTA DE TELÉFONO, Y NADA MÁS.

  Christopher: «el usuario de Cesar solo puede ver la vista de teléfono de
  los módulos que tiene asignados». Hasta hoy, aterrizar en el teléfono
  (`INVENTARIO.ALMACEN_TELEFONO` y hermanas, 19-20/10/2026) era solo una
  comodidad al entrar: `Entrada.tsx` lo manda derecho a Almacén, pero nada le
  impedía después navegar al Tablero de escritorio, a Existencias, a Salidas
  o a Nómina —esta última por el rol VE_PERSONAL (20/10/2026), que solo
  quería prestarle el desplegable de «Entregar a un trabajador» y de paso le
  abrió el módulo entero en el menú—.

  SOLO_TELEFONO ES DEL ROL, NO DE LA PERSONA. Mismo criterio que
  `a_la_medida`: si mañana otra persona entra con las mismas tareas, se le da
  ALMACEN_TELEFONO y hereda la restricción sin que nadie tenga que acordarse
  de marcarla dos veces.

  LA RESTRICCIÓN LA HACE EL FRONTEND (`ExigePermiso`), no la base — igual que
  ya es comodidad y no seguridad el aterrizaje que decide `Entrada.tsx`. La
  seguridad sigue siendo que la base no devuelve filas sin el permiso de
  módulo; esto solo le cierra, a quien tiene el rol marcado, las pantallas de
  escritorio que esos permisos abrirían.
*/

alter table public.roles
  add column if not exists solo_telefono boolean not null default false;

comment on column public.roles.solo_telefono is
  'Cierto si quien tiene este rol solo debe ver la vista de teléfono de sus módulos, nunca la de escritorio. Lo hace cumplir el frontend (ExigePermiso); la base sigue sin repartir ni quitar ninguna fila por esto.';

update public.roles set solo_telefono = true where codigo = 'ALMACEN_TELEFONO';

-- ---------------------------------------------------------------------------
-- Si quien mira tiene algún rol solo_telefono. ADMIN nunca entra aquí, igual
-- que en Entrada.tsx: pasa todas las casillas por definición y se quedaría
-- fuera de su propio tablero sin esta excepción.
-- ---------------------------------------------------------------------------
create or replace function public.mi_solo_telefono()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.usuarios_roles ur
      join public.perfiles p on p.id = ur.usuario_id
      join public.roles r on r.codigo = ur.rol
     where ur.usuario_id = (select auth.uid())
       and p.activo
       and r.solo_telefono
  )
  and not private.tiene_rol('ADMIN');
$$;

revoke execute on function public.mi_solo_telefono() from public, anon;
grant execute on function public.mi_solo_telefono() to authenticated;

comment on function public.mi_solo_telefono() is
  'Cierto si quien llama solo debe ver la vista de teléfono de sus módulos. Lo usa ExigePermiso para cerrar las pantallas de escritorio; ADMIN nunca entra aquí.';
