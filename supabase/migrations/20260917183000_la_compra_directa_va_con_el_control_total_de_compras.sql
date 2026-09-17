/*
  LA COMPRA DIRECTA VA CON EL CONTROL TOTAL DE COMPRAS

  Christopher, 17/09/2026: una compradora con el rol COMPRAS no podía cargar una
  compra directa. La casilla `COMPRAS.COMPRA_DIRECTA` nació el 31/08 sin nivel
  equivalente y sin marcarse en ningún rol, así que solo pasaba el
  administrador. Se le dio un permiso extendido por la premura, y la regla:
  «quien tiene control total de compras debe poder gestionar ese módulo».

  Ahora la casilla equivale a TOTAL en Compras: la tiene todo rol que no sea a la
  medida con control total del módulo (hoy ADMIN, GERENTE_GENERAL y COMPRAS).
  Una restricción a la persona sigue mandando por encima.

  Aprobar la compra y devolverla a cotización siguen sin nivel equivalente, a
  propósito: son del gerente, y darlas con el control total de Compras dejaría
  a quien compra aprobándose a sí mismo.
*/

update public.acciones
   set nivel_equivalente = 'TOTAL'
 where codigo = 'COMPRAS.COMPRA_DIRECTA'
   and nivel_equivalente is null;

do $ver$
begin
  if (select nivel_equivalente from public.acciones where codigo = 'COMPRAS.COMPRA_DIRECTA') is distinct from 'TOTAL' then
    raise exception 'la compra directa no quedó con el control total de Compras';
  end if;
end
$ver$;
