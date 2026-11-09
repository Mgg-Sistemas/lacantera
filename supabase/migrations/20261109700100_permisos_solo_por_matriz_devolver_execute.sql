-- Corrección de 20261109700000_permisos_solo_por_matriz (09/11/2026).
--
-- Esa migración redefinió las funciones que preguntan por el rol y por las
-- acciones con `revoke all ... from public, anon`. Antes tenían el EXECUTE por
-- omisión (de PUBLIC), y las políticas y vistas que las llaman corren como el
-- usuario: sin el permiso, cada pantalla que las usaba respondía «permission
-- denied for function puede_accion» («Su usuario no tiene permiso para esta
-- acción», p.ej. en Cocina). Se devuelve el EXECUTE como estaba.

grant execute on function
  private.roles_actuales(),
  private.tiene_rol(text[]),
  private.puede_accion_propia(text),
  private.puede_accion(text),
  private.autoriza_delegacion(text),
  private.como_aprueba_salida(bigint),
  private.accion_quitada(text)
to public;
