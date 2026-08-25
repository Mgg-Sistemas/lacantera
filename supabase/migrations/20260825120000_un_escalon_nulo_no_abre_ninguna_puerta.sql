-- ---------------------------------------------------------------------------
-- Un escalón nulo no abre ninguna puerta
--
-- Fallo mío, cazado en el ensayo, y del peor tipo: significaba lo contrario de
-- lo que decía.
--
-- `nivel_equivalente` nulo se puso para decir «a esta acción no la abre ningún
-- nivel; solo la marca explícita». Pero la comparación era
--
--   private.rango_nivel(rp.nivel) >= private.rango_nivel(a.nivel_equivalente)
--
-- y `private.rango_nivel(null)` devuelve CERO — lo mismo que NINGUNO. Así que
-- la condición quedaba «tu nivel >= 0», que es cierta para cualquiera que
-- tenga una fila de ese módulo, aunque esa fila diga NINGUNO.
--
-- Resultado medido antes de arreglarlo: «corregir los datos de la empresa»
-- salía que podían las DOCE cuentas activas. Debían ser cinco.
--
-- La comparación era razonable de leer y falsa de ejecutar, que es la
-- combinación que se cuela en una revisión. Lo que la cazó fue ejecutarla
-- persona por persona y comparar con quién podía antes — no leerla.
--
-- Ahora la rama del escalón exige que el escalón EXISTA.
--
-- Y queda una enseñanza que vale para el resto del sistema, no solo para aquí:
-- `private.rango_nivel(null)` devolviendo cero es una trampa puesta. Cualquier
-- comparación de niveles que pueda recibir un nulo dice que sí cuando debería
-- decir que no. Merece un repaso a las otras funciones que lo usan.
-- ---------------------------------------------------------------------------

create or replace function private.puede_accion(p_accion text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $func$
  -- ADMIN pasa siempre, igual que en tiene_permiso y por el mismo motivo: si la
  -- pantalla de permisos pudiera dejar fuera a ADMIN, una tarde de clics podría
  -- cerrarla y no habría manera de volver a abrirla desde dentro.
  select private.tiene_rol('ADMIN')

     -- La casilla, marcada en cualquiera de sus roles. Vale para las dos clases
     -- de rol: marcar siempre abre.
     or exists (
          select 1
            from public.usuarios_roles ur
            join public.perfiles p on p.id = ur.usuario_id
            join public.rol_acciones ra on ra.rol = ur.rol
           where ur.usuario_id = (select auth.uid())
             and p.activo
             and ra.accion = p_accion
        )

     -- Y el escalón de siempre, SOLO para los roles que no son a la medida y
     -- SOLO si la acción declara uno.
     --
     -- Ese `is not null` es la línea que faltaba: sin ella, una acción sin
     -- escalón se comparaba contra cero y la abría cualquiera que tuviera una
     -- fila del módulo, aunque dijera NINGUNO.
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

comment on function private.puede_accion(text) is
  'Si quien llama puede hacer esa acción. Mira la casilla en cualquiera de sus roles, y para los roles de escalón mira además el nivel equivalente —cuando la acción declara uno; si no lo declara, ningún nivel la abre.';
