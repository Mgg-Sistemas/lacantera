-- Habilita la opción «Precio manual (pisa la lista)» (`VENTAS.PRECIO_MANUAL_CON_LISTA`)
-- para el usuario de Génesis sin otorgársela por accidente a otros usuarios que
-- pudieran compartir su rol actual.

begin;

do $$
declare
  v_genesis_id  uuid;
  v_rol_actual  text;
  v_rol_destino text;
  v_compartido  boolean;
begin
  -- 1. Asegurar que la casilla VENTAS.PRECIO_MANUAL_CON_LISTA exista y esté activa.
  insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
  values (
    'VENTAS.PRECIO_MANUAL_CON_LISTA',
    'VENTAS',
    'Poner un precio a mano aunque haya lista',
    'Escribir un precio acordado en un material que ya tiene lista, diciendo por qué. Puede quedar por encima o por debajo de la lista.',
    22,
    null,
    true
  )
  on conflict (codigo) do update
    set activa = true,
        nombre = excluded.nombre,
        dice   = excluded.dice;

  -- 2. Ubicar el usuario activo de Génesis (con o sin tilde en el nombre).
  select p.id
    into v_genesis_id
    from public.perfiles p
   where p.activo
     and p.archivado_en is null
     and (
       lower(btrim(p.usuario)) like '%genesis%'
       or upper(translate(btrim(p.nombre), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) like '%GENESIS%'
     )
   order by p.creado_en
   limit 1;

  if v_genesis_id is null then
    raise exception 'No se encontró ningún usuario activo para Génesis en public.perfiles.';
  end if;

  -- 3. Leer su rol actual (respaldo a VENTAS si no tuviera fila en usuarios_roles).
  select ur.rol
    into v_rol_actual
    from public.usuarios_roles ur
   where ur.usuario_id = v_genesis_id
   limit 1;

  if v_rol_actual is null then
    v_rol_actual := 'VENTAS';
  end if;

  -- 4. Verificar si otro usuario activo comparte ese mismo rol (p. ej. VENTAS).
  select exists (
    select 1
      from public.usuarios_roles ur
      join public.perfiles p on p.id = ur.usuario_id
     where ur.rol = v_rol_actual
       and ur.usuario_id <> v_genesis_id
       and p.activo
       and p.archivado_en is null
  ) into v_compartido;

  if v_compartido and v_rol_actual <> 'ADMIN' then
    v_rol_destino := 'ROL_GENESIS';

    insert into public.roles (codigo, nombre, descripcion, orden, sistema, a_la_medida, solo_telefono, color)
    select
      v_rol_destino,
      'Ventas y operaciones (Genesis)',
      'Permisos propios de Génesis (incluye precio manual sobre lista).',
      r.orden + 1,
      false,
      r.a_la_medida,
      r.solo_telefono,
      r.color
    from public.roles r
    where r.codigo = v_rol_actual
    on conflict (codigo) do nothing;

    insert into public.rol_permisos (rol, modulo, nivel)
    select v_rol_destino, rp.modulo, rp.nivel
      from public.rol_permisos rp
     where rp.rol = v_rol_actual
    on conflict (rol, modulo) do nothing;

    insert into public.rol_permisos_por_defecto (rol, modulo, nivel)
    select v_rol_destino, rp.modulo, rp.nivel
      from public.rol_permisos rp
     where rp.rol = v_rol_destino
    on conflict (rol, modulo) do nothing;

    insert into public.rol_acciones (rol, accion)
    select v_rol_destino, ra.accion
      from public.rol_acciones ra
     where ra.rol = v_rol_actual
    on conflict (rol, accion) do nothing;

    insert into public.rol_incluye (rol, incluye)
    values (v_rol_destino, v_rol_actual)
    on conflict (rol, incluye) do nothing;

    insert into public.rol_incluye (rol, incluye)
    select v_rol_destino, ri.incluye
      from public.rol_incluye ri
     where ri.rol = v_rol_actual
       and ri.incluye <> v_rol_destino
       and ri.incluye <> 'ADMIN'
    on conflict (rol, incluye) do nothing;

    delete from public.usuarios_roles
     where usuario_id = v_genesis_id
       and rol <> v_rol_destino;

    insert into public.usuarios_roles (usuario_id, rol)
    values (v_genesis_id, v_rol_destino)
    on conflict (usuario_id) do update
      set rol = excluded.rol;
  else
    v_rol_destino := v_rol_actual;

    if not exists (select 1 from public.usuarios_roles where usuario_id = v_genesis_id) then
      insert into public.usuarios_roles (usuario_id, rol)
      values (v_genesis_id, v_rol_destino);
    end if;
  end if;

  -- 5. Garantizar acceso de escritura/total en VENTAS y encender la casilla de precio manual.
  if v_rol_destino <> 'ADMIN' then
    insert into public.rol_permisos (rol, modulo, nivel)
    values (v_rol_destino, 'VENTAS', 'ESCRITURA')
    on conflict (rol, modulo) do update
      set nivel = case
        when public.rol_permisos.nivel in ('NINGUNO', 'LECTURA') then 'ESCRITURA'
        else public.rol_permisos.nivel
      end;

    insert into public.rol_acciones (rol, accion)
    values (v_rol_destino, 'VENTAS.PRECIO_MANUAL_CON_LISTA')
    on conflict (rol, accion) do nothing;
  end if;
end;
$$;

commit;
