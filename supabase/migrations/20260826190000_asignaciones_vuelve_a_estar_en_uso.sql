/*
  ASIGNACIONES VUELVE A ESTAR EN USO, Y SE DESHACE LO QUE LE HICE

  El 2026-08-25 a las 12:44 una migración mía —la que sacó de la matriz los
  módulos que estaban en obra— dejó ASIGNACIONES en NINGUNO para todos los roles
  menos ADMIN. Era coherente entonces: el módulo estaba marcado fuera del MVP y
  un permiso sobre una pantalla con candado no sirve de nada.

  Ya no está en obra. Christopher lo puso en uso: «las personas con jerarquía
  pueden usar asignaciones para asignar o dar dotación al personal». Así que la
  matriz vuelve a como estaba.

  LOS NIVELES NO SE ESCRIBEN DE MEMORIA

  Salen de `public.auditoria`, que guardó fila por fila lo que cada rol tenía
  antes de aquel UPDATE. Se consultaron y se copian aquí tal cual, en vez de
  reconstruirlos a ojo: reconstruir a ojo un reparto de permisos es cómo se le
  abre un módulo a quien no le tocaba.

  Lo que había, y por tanto lo que vuelve:

    ALMACEN          ESCRITURA   entrega la herramienta, es quien la tiene en la mano
    RRHH             ESCRITURA   lleva el personal y decide qué le toca a cada quien
    GERENTE_GENERAL  LECTURA     supervisa
    OPERACIONES      LECTURA     supervisa
    CONSULTA         LECTURA     mira y no toca
    ADMIN            TOTAL       nunca se le quitó

  Gerencia se queda en LECTURA porque es lo que tenía. Si tiene que poder asignar
  también, es una línea más, pero se decide antes y no se supone aquí.

  COMPROBADO CONTRA LA PROPIA AUDITORÍA

  Después de aplicarlo se cruzó `rol_permisos` con la primera entrada de
  `auditoria` de cada rol: los cinco salen «restaurado» y los otros cinco
  «intacto». Y se ejecutó el cálculo del menú —no se leyó, se ejecutó— para ver
  que los módulos en obra bajan de cinco a cuatro y que ASIGNACIONES ya no está
  entre ellos.
*/

update public.rol_permisos set nivel = 'ESCRITURA'
 where modulo = 'ASIGNACIONES' and rol in ('ALMACEN', 'RRHH');

update public.rol_permisos set nivel = 'LECTURA'
 where modulo = 'ASIGNACIONES' and rol in ('GERENTE_GENERAL', 'OPERACIONES', 'CONSULTA');
