-- Habilitar la casilla SALIDAS.GENERAR_NOTA_ENTREGA para Antoni Vargas (antoni204)
-- y Genesis, de modo que puedan generar y consultar las notas de entrega de
-- respaldo en salidas externas (convenios, despachos externos, etc.).

-- 1. Asegurar que la acción exista y esté activa en el catálogo
insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
values (
  'SALIDAS.GENERAR_NOTA_ENTREGA',
  'SALIDAS',
  'Generar la nota de entrega de una salida',
  'Permite generar desde una salida externa su nota de entrega de respaldo (facturable o solo de control) y registrar sus camiones.',
  95,
  null,
  true
)
on conflict (codigo) do update
  set activa = true,
      nombre = excluded.nombre,
      dice   = excluded.dice;

-- 2. Encender la casilla SALIDAS.GENERAR_NOTA_ENTREGA en los roles asignados
--    a Antoni Vargas y a Genesis
insert into public.rol_acciones (rol, accion)
select distinct ur.rol, 'SALIDAS.GENERAR_NOTA_ENTREGA'
  from public.perfiles p
  join public.usuarios_roles ur on ur.usuario_id = p.id
 where p.activo
   and (
     lower(btrim(p.usuario)) = 'antoni204'
     or upper(btrim(p.nombre)) = 'ANTONI VARGAS'
     or lower(btrim(p.usuario)) like '%genesis%'
     or upper(btrim(p.nombre)) like '%GENESIS%'
   )
on conflict (rol, accion) do nothing;

-- 3. Asegurar lectura mínima en SALIDAS e INVENTARIO si algún rol asignado
--    estuviera en NINGUNO (sin bajar ESCRITURA ni TOTAL)
insert into public.rol_permisos (rol, modulo, nivel)
select distinct ur.rol, m.modulo, 'LECTURA'
  from public.perfiles p
  join public.usuarios_roles ur on ur.usuario_id = p.id
  cross join (values ('SALIDAS'), ('INVENTARIO')) as m(modulo)
 where p.activo
   and (
     lower(btrim(p.usuario)) = 'antoni204'
     or upper(btrim(p.nombre)) = 'ANTONI VARGAS'
     or lower(btrim(p.usuario)) like '%genesis%'
     or upper(btrim(p.nombre)) like '%GENESIS%'
   )
on conflict (rol, modulo) do update
  set nivel = case
    when public.rol_permisos.nivel = 'NINGUNO' then 'LECTURA'
    else public.rol_permisos.nivel
  end;
