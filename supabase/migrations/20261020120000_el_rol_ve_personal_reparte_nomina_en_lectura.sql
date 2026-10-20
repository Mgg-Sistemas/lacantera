/*
  UN ROL A LA MEDIDA PARA QUIEN NECESITA ELEGIR UN TRABAJADOR Y NO ES DE RRHH.

  Christopher, 20/10/2026: a Cesar (almacén) no le salían los trabajadores en
  "Entregar a un trabajador" de la vista de teléfono del almacén. La causa:
  `empleados` tiene una sola política de lectura, `tiene_permiso('NOMINA',
  'LECTURA')`, y el rol ALMACEN no reparte ese módulo — ni falta que hace
  para el resto de Inventario.

  «Entregar a un trabajador» (18.3, llevada al teléfono el 20/10/2026) SÍ
  necesita ver la lista de personal para elegir a quién se le entrega, así
  que alguien del almacén que use esa pantalla necesita Nómina en lectura.

  DARLE NÓMINA ENTERA AL ROL ALMACEN NO ES LA RESPUESTA. Repartir el módulo
  a TODO el que tenga ese rol abre de una vez el tablero de Nómina, el
  personal, los procesos de pago y los parámetros a cualquier almacenista,
  cuando lo único que hacía falta era una lista de nombres para un
  desplegable.

  Por eso un rol aparte, del mismo tipo que ya existían (`AUDITOR`,
  `VENDE_Y_FACTURA`): se presta a la persona que lo necesita, sin tocar lo
  que ya reparte ALMACEN. Es exactamente el patrón que el propio sistema ya
  documentaba — «a alguien de tesorería se le puede dar Nómina en lectura»
  (`src/config/navigation.ts`) — llevado del dicho al hecho.

  INSERT DIRECTO Y NO LAS PUERTAS DE SIEMPRE (`crear_rol`,
  `guardar_permiso_rol`): las dos exigen `exigir_rol('ADMIN')`, que mira
  `auth.uid()`. Una migración corre sin sesión de ningún usuario, así que
  esas puertas rechazarían esto mismo si se repitiera la historia completa
  en una base nueva. El resultado final es idéntico al que dejan esas
  funciones; esto solo le quita la reja que no aplica aquí.
*/
insert into public.roles (codigo, nombre, descripcion, a_la_medida)
values (
  'VE_PERSONAL', 'Ve el personal',
  'Ve la lista de trabajadores y sus datos básicos (ficha, nombre, cargo), '
  'sin nómina ni pagos. Para quien necesita elegir a un trabajador en otro '
  'módulo, como Asignaciones, sin pertenecer a Recursos Humanos.',
  true
)
on conflict (codigo) do nothing;

insert into public.rol_permisos (rol, modulo, nivel)
values ('VE_PERSONAL', 'NOMINA', 'LECTURA')
on conflict (rol, modulo) do update set nivel = excluded.nivel;
