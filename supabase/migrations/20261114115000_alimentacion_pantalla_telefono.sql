-- 1. Casilla «🍽️ Alimentación» en Pantallas de teléfono:
-- Permite que un rol «Solo teléfono» (o quien entra desde el móvil) aterrice y
-- acceda al módulo completo de Alimentación (/app/alimentacion) además de la
-- pantalla rápida de Cocina (/app/alimentacion/cocina).

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
values (
  'ALIMENTACION.TELEFONO',
  'ALIMENTACION',
  'Pantalla de teléfono de alimentación',
  'Entra al módulo de Alimentación desde el teléfono: víveres en existencia, comidas servidas, pedir el mercado y servir comidas.',
  coalesce((select max(orden) + 1 from public.acciones where modulo = 'ALIMENTACION'), 11),
  null,
  true
)
on conflict (codigo) do update
  set modulo = excluded.modulo,
      nombre = excluded.nombre,
      dice = excluded.dice,
      nivel_equivalente = excluded.nivel_equivalente,
      activa = true;

-- Asegurar también que ALIMENTACION.COCINA_TELEFONO exista y esté activa
insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
values (
  'ALIMENTACION.COCINA_TELEFONO',
  'ALIMENTACION',
  'Entrar directo a la cocina del teléfono',
  'Quien la tiene aterriza en la pantalla de servir comidas del teléfono nada más entrar, en vez de en el tablero.',
  10,
  null,
  true
)
on conflict (codigo) do update
  set activa = true;

-- 2. Permitir que quien tiene lectura en ALIMENTACION pueda leer v_existencias
-- (v_existencias tiene security_invoker = on y lee de public.inventario_movimientos;
-- sin esto, un rol que solo tiene ALIMENTACION y no INVENTARIO recibe 0 víveres
-- y la pantalla de teléfono de Cocina no muestra el formulario).
drop policy if exists inventario_movimientos_lectura on public.inventario_movimientos;
create policy inventario_movimientos_lectura on public.inventario_movimientos
  for select to authenticated
  using (
    private.tiene_permiso('INVENTARIO', 'LECTURA')
    or private.tiene_permiso('ALIMENTACION', 'LECTURA')
  );

-- Asegurar que la categoría VIVERES esté marcada como de_cocina = true
update public.categorias_articulo
   set de_cocina = true, activa = true
 where codigo = 'VIVERES';

-- 3. Asignar las casillas de teléfono de Alimentación y Cocina tanto al rol
-- «AYUDANTE DE COCINA» como al rol que tenga asignado el usuario Maribela.
insert into public.rol_acciones (rol, accion)
select distinct r.codigo, a.accion
  from public.roles r
  left join public.usuarios_roles ur on ur.rol = r.codigo
  left join public.perfiles p on p.id = ur.usuario_id
  cross join (values ('ALIMENTACION.TELEFONO'), ('ALIMENTACION.COCINA_TELEFONO')) as a(accion)
 where upper(btrim(r.nombre)) like '%COCINA%'
    or upper(btrim(r.codigo)) like '%COCINA%'
    or upper(btrim(coalesce(p.nombre, ''))) like '%MARIBELA%'
    or upper(btrim(coalesce(p.usuario, ''))) like '%MARIBELA%'
on conflict (rol, accion) do nothing;
