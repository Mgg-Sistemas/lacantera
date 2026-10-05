-- ═══════════════════════════════════════════════════════════════════════════
-- EL SURTIDOR ENTRA POR EL TELÉFONO
--
-- Christopher, 05/10/2026, después de comparar La Cantera con MGG y Golden
-- Touch: «las vistas de teléfono de campo, empezando por el surtidor de
-- combustible… es lo que convierte a La Cantera de app de escritorio en app de
-- campo».
--
-- La brecha era esa y no el control: despachar combustible aquí ya está
-- resuelto por detrás —máquina, horómetro, tope de tres al día, consumo por
-- hora, vale firmado—. Lo que no existía era una pantalla para usarlo DE PIE
-- AL LADO DEL TANQUE, con el celular en una mano y la manguera en la otra.
--
-- POR ESO ESTA MIGRACIÓN ES DIMINUTA. No hace falta tabla, ni función, ni
-- cambiar el despacho: `despachar_combustible` se queda exactamente como está
-- y la pantalla nueva lo llama igual que el escritorio. Lo único que la base
-- tiene que saber es QUIÉN entra directo al surtidor.
--
-- `nivel_equivalente` VA EN NULO A PROPÓSITO. Con un nivel puesto, cualquiera
-- con ESCRITURA en Combustible heredaría la casilla y al entrar al sistema
-- aterrizaría en el surtidor sin haberlo pedido —incluida la gente de oficina—.
-- En nulo, la casilla solo la tiene quien se la den a mano, que es lo que
-- significa «rol solo teléfono»: se le presta a la persona que está en la
-- bomba, y a nadie más.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente)
values
  ('COMBUSTIBLE.SURTIDOR_TELEFONO', 'COMBUSTIBLE',
   'Entrar directo al surtidor del teléfono',
   'Quien la tiene aterriza en la pantalla de surtir del teléfono nada más '
   'entrar, en vez de en el tablero. Es para el que está en la bomba: abre el '
   'sistema y ya está donde trabaja. No da permiso de nada por sí sola — para '
   'despachar sigue haciendo falta escritura en Combustible — y cualquiera con '
   'ese permiso puede abrir la misma pantalla desde el botón de Combustible.',
   50, null)
on conflict (codigo) do update
   set modulo            = excluded.modulo,
       nombre            = excluded.nombre,
       dice              = excluded.dice,
       orden             = excluded.orden,
       nivel_equivalente = excluded.nivel_equivalente;
