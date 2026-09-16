/*
  RRHH SOLO LO SUYO

  Christopher, 16/09/2026: «RRHH no gestiona explotación ni nada referente,
  solo nómina, personal, incidencias y lo referente a lo que su rol indica», y
  enseguida: «RRHH no maneja compras». Explotación ya quedó en NINGUNO en
  `20260916172000`; esto recorta el resto.

    DESPACHOS    TOTAL     → NINGUNO   la romana y las guías son de la operación
    COMPRAS      ESCRITURA → NINGUNO   y fuera la casilla de crear pedidos
    INVENTARIO   ESCRITURA → LECTURA   ver lo que hay, para dotar al personal
    SALIDAS      ESCRITURA → LECTURA   solicitar para el personal; entregar es del almacén
    TASAS        TOTAL     → LECTURA   la nómina lee la tasa; registrarla no es suyo

  Se quedan NÓMINA (con sus casillas), ASIGNACIONES —la dotación y las
  herramientas del personal— y el PANEL.

  NADIE PIERDE HOY LO QUE USA. Las ocho cuentas con RRHH tienen además almacén,
  compras y operaciones por otros roles. Esto corrige lo que el rol dice de sí
  mismo, que es lo que heredará quien mañana tenga solo RRHH.

  UN HILO SUELTO, anotado y no resuelto aquí: pagar la nómina pide elegir una
  cuenta, y las cuentas las abre el permiso de Compras. Quien tenga SOLO RRHH no
  las vería. Abrirlas por Nómina sin sus movimientos enseñaría los saldos en
  cero, que es peor que no enseñarlos; se decide aparte.
*/

update public.rol_permisos set nivel = 'NINGUNO'
 where rol = 'RRHH' and modulo in ('DESPACHOS', 'COMPRAS') and nivel <> 'NINGUNO';

update public.rol_permisos set nivel = 'LECTURA'
 where rol = 'RRHH' and modulo in ('INVENTARIO', 'SALIDAS', 'TASAS') and nivel in ('ESCRITURA', 'TOTAL');

delete from public.rol_acciones
 where rol = 'RRHH' and accion = 'COMPRAS.CREAR_PEDIDO';

do $ver$
begin
  if exists (select 1 from public.rol_permisos
              where rol = 'RRHH'
                and ((modulo in ('EXPLOTACION', 'DESPACHOS', 'COMPRAS') and nivel <> 'NINGUNO')
                  or (modulo in ('INVENTARIO', 'SALIDAS', 'TASAS') and nivel not in ('NINGUNO', 'LECTURA')))) then
    raise exception 'RRHH sigue con más de lo suyo';
  end if;
  if exists (select 1 from public.rol_acciones ra join public.acciones a on a.codigo = ra.accion
              where ra.rol = 'RRHH' and a.modulo = 'COMPRAS') then
    raise exception 'RRHH sigue con casillas de Compras';
  end if;
end
$ver$;
