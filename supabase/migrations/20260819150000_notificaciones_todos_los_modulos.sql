-- ---------------------------------------------------------------------------
-- Las notificaciones se quedaron con una lista de módulos de hace un mes
--
-- `notificaciones.modulo` era un CHECK con seis códigos escritos a mano:
-- COMPRAS, INVENTARIO, NOMINA, TESORERIA, VENTAS y SISTEMA. Desde entonces el
-- catálogo creció a trece. Explotación, Despachos, Maquinaria, Tasas y
-- Configuración no podían avisar de nada: el INSERT reventaba con una
-- violación de restricción.
--
-- Salió a la luz porque `abrir_mantenimiento` intenta avisar cuando una
-- máquina entra al taller. Habría pasado igual con cualquier aviso de
-- Explotación o de Despachos.
--
-- POR QUÉ UNA CLAVE FORÁNEA Y NO UN CHECK MÁS LARGO
--
-- La casa usa CHECK sobre `text` para los vocabularios cerrados, y está bien
-- para los que no viven en una tabla. Este sí vive en una: `modulos` es un
-- catálogo real, con su nombre, su descripción y su orden. Un CHECK aquí
-- obliga a acordarse de dos sitios cada vez que nace un módulo, que es
-- exactamente lo que no pasó las últimas tres veces. La clave foránea no se
-- puede olvidar.
-- ---------------------------------------------------------------------------
alter table public.notificaciones drop constraint if exists notificaciones_modulo_check;

alter table public.notificaciones
  drop constraint if exists notificaciones_modulo_existe;
alter table public.notificaciones
  add constraint notificaciones_modulo_existe
    foreign key (modulo) references public.modulos(codigo);

comment on column public.notificaciones.modulo is
  'Apunta al catálogo de módulos. Antes era un CHECK con seis códigos escritos '
  'a mano y se quedó viejo: Explotación, Despachos y Maquinaria no podían '
  'avisar de nada porque nadie se acordó de añadirlos a la lista.';
