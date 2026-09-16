/*
  RRHH NO LLEVA EXPLOTACIÓN

  Christopher, 16/09/2026: «RRHH no debe tener control total sobre explotación,
  no tiene nada que ver eso con el módulo».

  Lo había levantado el carril de base de datos: con TOTAL, RRHH heredaba por el
  escalón de cada acción aprobar y rechazar viajes, ajustar su precio, fijar
  tarifas, gestionar plantas y rutas, y anular. Nadie que tuviera solo RRHH había
  cargado viajes, así que el cambio no deja a nadie sin su trabajo de todos los
  días.

  Queda en NINGUNO. Despachos, que RRHH también tiene en TOTAL, no se toca aquí:
  no es lo que se decidió.
*/

update public.rol_permisos
   set nivel = 'NINGUNO'
 where rol = 'RRHH'
   and modulo = 'EXPLOTACION'
   and nivel <> 'NINGUNO';

do $ver$
begin
  if exists (select 1 from public.rol_permisos
              where rol = 'RRHH' and modulo = 'EXPLOTACION' and nivel <> 'NINGUNO') then
    raise exception 'RRHH sigue con acceso a Explotación';
  end if;
end
$ver$;
