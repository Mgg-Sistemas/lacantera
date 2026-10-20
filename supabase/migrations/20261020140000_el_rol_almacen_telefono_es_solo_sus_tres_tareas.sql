/*
  UN ROL A LA MEDIDA PARA QUIEN SOLO TRABAJA DESDE EL ALMACÉN DEL TELÉFONO.

  Christopher, 20/10/2026: Cesar (almacén) veía, en el menú de escritorio,
  módulos que no tienen nada que ver con sus tres tareas del teléfono —
  Alimentación, Combustible, Compras, Configuración, Maquinaria—, todos
  repartidos por el rol ALMACEN, que es un rol compartido por catorce
  personas más y no se toca por uno solo.

  ESTE ROL REPARTE EXACTAMENTE LO QUE PIDEN LAS TRES TAREAS DEL TELÉFONO:
    - INVENTARIO:ESCRITURA  → Registrar entrada
    - SALIDAS:ESCRITURA     → Entregar material
    - ASIGNACIONES:ESCRITURA → Entregar a un trabajador (el RPC
      `entregar_a_trabajador` ya acepta este permiso o el rol ALMACEN/RRHH/
      ADMIN, lo que sea que tenga quien llama — ver su propia reja)
    - PANEL:LECTURA         → el tablero, por si acaso

  Nada de Alimentación, Combustible, Compras, Configuración ni Maquinaria:
  ese es justamente el punto. Quien necesite además alguna de esas tareas
  se le presta el rol que le falte, o se le da ALMACEN si de verdad hace
  también trabajo de escritorio.

  INSERT DIRECTO Y NO `crear_rol`/`guardar_permiso_rol`: las dos exigen
  `exigir_rol('ADMIN')` vía `auth.uid()`, y una migración corre sin sesión.
  Ver el mismo razonamiento en 20261020120000.
*/
insert into public.roles (codigo, nombre, descripcion, a_la_medida)
values (
  'ALMACEN_TELEFONO', 'Almacén (teléfono)',
  'Las tres tareas del almacén en el teléfono y nada más: registrar entrada, '
  'entregar material ya aprobado, y entregar a un trabajador. Sin '
  'Alimentación, Combustible, Compras, Configuración ni Maquinaria, que el '
  'rol Almacén sí reparte y esto no necesita.',
  true
)
on conflict (codigo) do nothing;

insert into public.rol_permisos (rol, modulo, nivel)
values
  ('ALMACEN_TELEFONO', 'INVENTARIO', 'ESCRITURA'),
  ('ALMACEN_TELEFONO', 'SALIDAS', 'ESCRITURA'),
  ('ALMACEN_TELEFONO', 'ASIGNACIONES', 'ESCRITURA'),
  ('ALMACEN_TELEFONO', 'PANEL', 'LECTURA')
on conflict (rol, modulo) do update set nivel = excluded.nivel;
