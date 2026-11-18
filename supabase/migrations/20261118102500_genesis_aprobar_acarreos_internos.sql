-- Dar permiso a Genesis únicamente para consultar y aprobar acarreos internos
-- (EXPLOTACION en LECTURA + casilla EXPLOTACION.APROBAR_VIAJES), sin afectar a
-- otros usuarios que pudieran compartir su rol actual.

do $$
declare
  v_genesis_id   uuid;
  v_genesis_nom  text;
  v_rol_actual   text;
  v_rol_destino  text;
  v_compartido   boolean;
begin
  -- 1. Ubicar el usuario activo de Genesis
  select p.id, p.nombre
    into v_genesis_id, v_genesis_nom
    from public.perfiles p
   where p.activo
     and (
       lower(btrim(p.usuario)) like '%genesis%'
       or upper(btrim(p.nombre)) like '%GENESIS%'
     )
   order by p.creado_en
   limit 1;

  if v_genesis_id is null then
    raise exception 'No se encontró ningún usuario activo para GENESIS en public.perfiles.';
  end if;

  -- 2. Asegurar que la casilla EXPLOTACION.APROBAR_VIAJES exista y esté activa
  insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
  values (
    'EXPLOTACION.APROBAR_VIAJES',
    'EXPLOTACION',
    'Aprobar o rechazar viajes',
    'Un viaje nuevo no cuenta para el pago hasta que lo aprueba el responsable de la mina o planta de origen o de destino, o alguien con esta casilla.',
    75,
    'TOTAL',
    true
  )
  on conflict (codigo) do update
    set activa = true;

  -- 3. Leer su rol actual
  select ur.rol
    into v_rol_actual
    from public.usuarios_roles ur
   where ur.usuario_id = v_genesis_id
   limit 1;

  if v_rol_actual is null then
    v_rol_actual := 'ALMACEN';
  end if;

  -- 4. Verificar si otro usuario activo comparte ese mismo rol
  select exists (
    select 1
      from public.usuarios_roles ur
      join public.perfiles p on p.id = ur.usuario_id
     where ur.rol = v_rol_actual
       and ur.usuario_id <> v_genesis_id
       and p.activo
  ) into v_compartido;

  if v_compartido then
    -- Crear un rol propio para Genesis clonando sus permisos actuales para no
    -- darle aprobación de acarreos a otros usuarios que compartan su rol.
    v_rol_destino := 'ROL_GENESIS';

    insert into public.roles (codigo, nombre, descripcion, orden, sistema, a_la_medida, solo_telefono)
    select
      v_rol_destino,
      'Almacén y operaciones (Genesis)',
      'Permisos de Genesis con aprobación de acarreos internos.',
      r.orden + 1,
      false,
      r.a_la_medida,
      r.solo_telefono
    from public.roles r
    where r.codigo = v_rol_actual
    on conflict (codigo) do nothing;

    -- Copiar matriz de módulos del rol actual si es nuevo
    insert into public.rol_permisos (rol, modulo, nivel)
    select v_rol_destino, rp.modulo, rp.nivel
      from public.rol_permisos rp
     where rp.rol = v_rol_actual
    on conflict (rol, modulo) do nothing;

    -- Copiar casillas del rol actual
    insert into public.rol_acciones (rol, accion)
    select v_rol_destino, ra.accion
      from public.rol_acciones ra
     where ra.rol = v_rol_actual
    on conflict (rol, accion) do nothing;

    -- Mantener equivalencia de rol (salvo ADMIN) para funciones que consulten tiene_rol()
    if v_rol_actual <> 'ADMIN' then
      insert into public.rol_incluye (rol, incluye)
      values (v_rol_destino, v_rol_actual)
      on conflict (rol, incluye) do nothing;

      insert into public.rol_incluye (rol, incluye)
      select v_rol_destino, ri.incluye
        from public.rol_incluye ri
       where ri.rol = v_rol_actual
         and ri.incluye <> v_rol_destino
      on conflict (rol, incluye) do nothing;
    end if;

    -- Asignar a Genesis a su rol propio
    delete from public.usuarios_roles where usuario_id = v_genesis_id and rol <> v_rol_destino;
    insert into public.usuarios_roles (usuario_id, rol)
    values (v_genesis_id, v_rol_destino)
    on conflict (usuario_id, rol) do nothing;
  else
    v_rol_destino := v_rol_actual;
  end if;

  -- 5. Darle a Genesis EXPLOTACION solo en LECTURA (para que pueda entrar a
  --    Acarreos internos a ver los pendientes, pero sin registrar viajes ni
  --    modificar plantas/rutas/frentes)
  insert into public.rol_permisos (rol, modulo, nivel)
  values (v_rol_destino, 'EXPLOTACION', 'LECTURA')
  on conflict (rol, modulo) do update
    set nivel = 'LECTURA';

  -- 6. Quitar cualquier otra casilla de EXPLOTACION que no sea APROBAR_VIAJES
  --    y activar únicamente EXPLOTACION.APROBAR_VIAJES
  delete from public.rol_acciones
   where rol = v_rol_destino
     and accion like 'EXPLOTACION.%'
     and accion <> 'EXPLOTACION.APROBAR_VIAJES';

  insert into public.rol_acciones (rol, accion)
  values (v_rol_destino, 'EXPLOTACION.APROBAR_VIAJES')
  on conflict (rol, accion) do nothing;
end;
$$;
