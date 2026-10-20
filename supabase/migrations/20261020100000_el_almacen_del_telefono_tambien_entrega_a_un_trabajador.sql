-- La casilla ya existía (20261019160000): se actualiza su texto porque la
-- pantalla a la que aterriza ahora ofrece una tercera tarea, Entregar a un
-- trabajador (préstamo o consumible). El código no cambia, así que a quien ya
-- se la prestaron no hay que volver a prestársela.
insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente)
values
  ('INVENTARIO.ALMACEN_TELEFONO', 'INVENTARIO',
   'Entrar directo al almacén del teléfono',
   'Quien la tiene aterriza en la pantalla de registrar entrada, entregar '
   'material o entregar a un trabajador del teléfono nada más entrar, en vez '
   'de en el tablero. Es para quien trabaja en el almacén. No da permiso de '
   'nada por sí sola: cada tarea sigue pidiendo su propio permiso.',
   160, null)
on conflict (codigo) do update
   set modulo = excluded.modulo, nombre = excluded.nombre, dice = excluded.dice,
       orden = excluded.orden, nivel_equivalente = excluded.nivel_equivalente;
