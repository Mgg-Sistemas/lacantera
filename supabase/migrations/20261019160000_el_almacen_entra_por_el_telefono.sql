-- La casilla del teléfono para Inventario, con `nivel_equivalente` en NULO
-- por lo mismo que la del surtidor (20261005105213) y la de la cocina
-- (20261005115952): se presta a mano a quien trabaja en el almacén, y a
-- nadie se le regala por su nivel. Cubre las dos tareas de campo —entrada y
-- salida—, no solo una.
insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente)
values
  ('INVENTARIO.ALMACEN_TELEFONO', 'INVENTARIO',
   'Entrar directo al almacén del teléfono',
   'Quien la tiene aterriza en la pantalla de registrar entrada o entregar '
   'material del teléfono nada más entrar, en vez de en el tablero. Es para '
   'quien trabaja en el almacén. No da permiso de nada por sí sola: para '
   'registrar entrada sigue haciendo falta escritura en Inventario, y para '
   'entregar material, escritura en Salidas.',
   160, null)
on conflict (codigo) do update
   set modulo = excluded.modulo, nombre = excluded.nombre, dice = excluded.dice,
       orden = excluded.orden, nivel_equivalente = excluded.nivel_equivalente;
