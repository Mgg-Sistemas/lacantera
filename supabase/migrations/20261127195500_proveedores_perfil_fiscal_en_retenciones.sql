-- Compras mantiene el catálogo. Retenciones administra el perfil fiscal.

CREATE OR REPLACE FUNCTION public.guardar_proveedor(p_id bigint, p_rif text, p_nombre text, p_nombre_comercial text DEFAULT NULL::text, p_contacto text DEFAULT NULL::text, p_telefono text DEFAULT NULL::text, p_correo text DEFAULT NULL::text, p_direccion text DEFAULT NULL::text, p_condicion_pago text DEFAULT 'CONTADO'::text, p_moneda_preferida character DEFAULT 'USD'::bpchar, p_contribuyente_especial boolean DEFAULT false, p_notas text DEFAULT NULL::text, p_activo boolean DEFAULT true, p_metodo_pago_preferido text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rif text := upper(regexp_replace(coalesce(p_rif, ''), '\s', '', 'g'));
  v_id  bigint;
begin
  perform private.exigir_usuario_activo();
  if not private.tiene_permiso('COMPRAS', 'ESCRITURA') then
    raise exception 'Se requiere permiso de escritura en Compras.' using errcode = '42501';
  end if;

  -- Se acepta "J123456789" y se guarda "J-12345678-9": la gente lo escribe de
  -- las dos formas y buscar por RIF tiene que encontrar siempre.
  if v_rif ~ '^[VEJPGC][0-9]{9}$' then
    v_rif := substr(v_rif, 1, 1) || '-' || substr(v_rif, 2, 8) || '-' || substr(v_rif, 10, 1);
  end if;

  if v_rif !~ '^[VEJPGC]-[0-9]{8}-[0-9]$' then
    raise exception 'El RIF "%" no tiene forma válida. Se espera J-12345678-9.', p_rif
      using errcode = '22023';
  end if;

  if length(trim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'El nombre o razón social del proveedor es obligatorio.' using errcode = '22023';
  end if;

  -- El método tiene que existir y estar activo: proponer uno que ya nadie usa
  -- es peor que no proponer ninguno.
  if p_metodo_pago_preferido is not null then
    perform 1 from public.metodos_pago where codigo = p_metodo_pago_preferido and activo;
    if not found then
      raise exception 'El método de pago "%" no existe o está desactivado.', p_metodo_pago_preferido
        using errcode = '23503';
    end if;
  end if;

  if p_id is null then
    insert into public.proveedores
      (rif, nombre, nombre_comercial, contacto, telefono, correo, direccion,
       condicion_pago, moneda_preferida, contribuyente_especial, notas, activo, creado_por,
       metodo_pago_preferido)
    values
      (v_rif, trim(p_nombre), nullif(trim(coalesce(p_nombre_comercial, '')), ''),
       nullif(trim(coalesce(p_contacto, '')), ''), nullif(trim(coalesce(p_telefono, '')), ''),
       nullif(trim(coalesce(p_correo, '')), ''), nullif(trim(coalesce(p_direccion, '')), ''),
       p_condicion_pago, p_moneda_preferida, (private.tiene_permiso('RETENCIONES', 'ESCRITURA') and coalesce(p_contribuyente_especial, false)),
       nullif(trim(coalesce(p_notas, '')), ''), coalesce(p_activo, true), (select auth.uid()),
       p_metodo_pago_preferido)
    returning id into v_id;
  else
    update public.proveedores set
      rif = v_rif,
      nombre = trim(p_nombre),
      nombre_comercial = nullif(trim(coalesce(p_nombre_comercial, '')), ''),
      contacto = nullif(trim(coalesce(p_contacto, '')), ''),
      telefono = nullif(trim(coalesce(p_telefono, '')), ''),
      correo = nullif(trim(coalesce(p_correo, '')), ''),
      direccion = nullif(trim(coalesce(p_direccion, '')), ''),
      condicion_pago = p_condicion_pago,
      moneda_preferida = p_moneda_preferida,
      contribuyente_especial = case when private.tiene_permiso('RETENCIONES', 'ESCRITURA')
        then coalesce(p_contribuyente_especial, contribuyente_especial) else contribuyente_especial end,
      notas = nullif(trim(coalesce(p_notas, '')), ''),
      activo = coalesce(p_activo, true),
      metodo_pago_preferido = p_metodo_pago_preferido
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe el proveedor %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya hay un proveedor registrado con el RIF %.', v_rif using errcode = '23505';
end;
$function$;

CREATE OR REPLACE FUNCTION public.cargar_proveedores_por_lote(p_filas jsonb, p_confirmar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fila     jsonb;
  v_n        int := 0;
  v_informe  jsonb := '[]'::jsonb;
  v_errores  int := 0;
  v_nuevos   int := 0;
  v_actualiz int := 0;

  v_rif      text;
  v_nombre   text;
  v_condicion text;
  v_moneda   text;

  v_motivo   text;
  v_estado   text;
  v_id       bigint;
  v_vistos   text[] := array[]::text[];
begin
  perform private.exigir_usuario_activo();
  if not private.tiene_permiso('COMPRAS', 'ESCRITURA') then
    raise exception 'Se requiere permiso de escritura en Compras.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_filas) <> 'array' then
    raise exception 'La planilla no trae filas.' using errcode = '22023';
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_n := v_n + 1;
    v_motivo := null;
    v_estado := null;

    v_rif := upper(regexp_replace(coalesce(v_fila->>'rif', ''), '\s', '', 'g'));
    if v_rif ~ '^[VEJPGC][0-9]{9}$' then
      v_rif := substr(v_rif, 1, 1) || '-' || substr(v_rif, 2, 8) || '-' || substr(v_rif, 10, 1);
    end if;
    v_nombre    := btrim(coalesce(v_fila->>'nombre', ''));
    v_condicion := upper(coalesce(nullif(btrim(coalesce(v_fila->>'condicion_pago','')),''), 'CONTADO'));
    v_moneda    := upper(coalesce(nullif(btrim(coalesce(v_fila->>'moneda_preferida','')),''), 'USD'));

    if v_rif = '' then
      v_motivo := 'Falta el RIF.';
    elsif v_rif !~ '^[VEJPGC]-[0-9]{8}-[0-9]$' then
      v_motivo := format('El RIF «%s» no tiene la forma que el sistema espera: J-12345678-9.', v_rif);
    elsif v_rif = any(v_vistos) then
      v_motivo := format('El RIF %s se repite en la planilla.', v_rif);
    elsif v_nombre = '' then
      v_motivo := 'Falta la razón social.';
    elsif v_condicion not in ('CONTADO','CREDITO_15','CREDITO_30','CREDITO_60','CONTRA_ENTREGA') then
      v_motivo := format('«%s» no es una condición de pago: CONTADO, CREDITO_15, CREDITO_30, CREDITO_60 o CONTRA_ENTREGA.', v_condicion);
    elsif not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
      v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
    end if;

    if v_motivo is not null then
      v_errores := v_errores + 1;
      v_estado  := 'ERROR';
    else
      v_vistos := v_vistos || v_rif;
      select id into v_id from public.proveedores where rif = v_rif;

      if v_id is null then
        v_estado := 'NUEVO';
        v_nuevos := v_nuevos + 1;
      else
        v_estado := 'ACTUALIZA';
        v_actualiz := v_actualiz + 1;
      end if;

      if p_confirmar then
        if v_id is null then
          insert into public.proveedores
            (rif, nombre, nombre_comercial, contacto, telefono, correo, direccion,
             condicion_pago, moneda_preferida, notas, creado_por)
          values
            (v_rif, v_nombre,
             nullif(btrim(coalesce(v_fila->>'nombre_comercial','')), ''),
             nullif(btrim(coalesce(v_fila->>'contacto','')), ''),
             nullif(btrim(coalesce(v_fila->>'telefono','')), ''),
             nullif(btrim(coalesce(v_fila->>'correo','')), ''),
             nullif(btrim(coalesce(v_fila->>'direccion','')), ''),
             v_condicion, v_moneda,
             nullif(btrim(coalesce(v_fila->>'notas','')), ''),
             (select auth.uid()));
        else
          update public.proveedores
             set nombre = v_nombre,
                 nombre_comercial = coalesce(nullif(btrim(coalesce(v_fila->>'nombre_comercial','')), ''), nombre_comercial),
                 contacto = coalesce(nullif(btrim(coalesce(v_fila->>'contacto','')), ''), contacto),
                 telefono = coalesce(nullif(btrim(coalesce(v_fila->>'telefono','')), ''), telefono),
                 correo = coalesce(nullif(btrim(coalesce(v_fila->>'correo','')), ''), correo),
                 direccion = coalesce(nullif(btrim(coalesce(v_fila->>'direccion','')), ''), direccion),
                 condicion_pago = case
                   when nullif(btrim(coalesce(v_fila->>'condicion_pago','')), '') is null
                     then condicion_pago else v_condicion end,
                 moneda_preferida = case
                   when nullif(btrim(coalesce(v_fila->>'moneda_preferida','')), '') is null
                     then moneda_preferida else v_moneda end,
                 notas = coalesce(nullif(btrim(coalesce(v_fila->>'notas','')), ''), notas)
           where id = v_id;
        end if;
      end if;
    end if;

    v_informe := v_informe || jsonb_build_object(
      'fila', v_n, 'codigo', v_rif, 'nombre', v_nombre,
      'estado', v_estado, 'motivo', v_motivo);
  end loop;

  if v_n = 0 then
    raise exception 'La planilla está vacía.' using errcode = '22023';
  end if;

  if p_confirmar and v_errores > 0 then
    raise exception 'La planilla tiene % fila(s) con problemas. No se cargó nada.', v_errores
      using errcode = '22023';
  end if;

  return jsonb_build_object(
    'total', v_n, 'nuevos', v_nuevos, 'actualizados', v_actualiz,
    'errores', v_errores, 'aplicado', p_confirmar and v_errores = 0,
    'filas', v_informe);
end;
$function$;

CREATE OR REPLACE FUNCTION public.retencion_guardar_perfil_proveedor(p_id bigint, p_datos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.exigir_usuario_activo();
  if not private.tiene_permiso('RETENCIONES', 'ESCRITURA') then
    raise exception 'Se requiere permiso para editar el perfil fiscal.' using errcode = '42501';
  end if;
  update public.proveedores
     set actividad_economica = case when p_datos ? 'actividad_economica'
           then nullif(btrim(p_datos ->> 'actividad_economica'), '') else actividad_economica end,
         tipo_persona = case when p_datos ? 'tipo_persona'
           then nullif(btrim(p_datos ->> 'tipo_persona'), '') else tipo_persona end,
         numero_administracion = case when p_datos ? 'numero_administracion'
           then nullif(btrim(p_datos ->> 'numero_administracion'), '') else numero_administracion end,
         contribuyente_especial = coalesce((p_datos ->> 'contribuyente_especial')::boolean, contribuyente_especial)
   where id = p_id;
  if not found then
    raise exception 'No existe ese proveedor.' using errcode = 'P0002';
  end if;
end;
$function$;

revoke all on function public.retencion_guardar_perfil_proveedor(bigint,jsonb) from public, anon;
grant execute on function public.retencion_guardar_perfil_proveedor(bigint,jsonb) to authenticated;
