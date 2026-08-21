-- ---------------------------------------------------------------------------
-- Cargar personal y proveedores por planilla
--
-- Christopher: «la metodología es la misma o similar». Lo es a propósito —
-- misma función en dos pasadas, mismo informe fila por fila, mismo todo o
-- nada— porque quien aprendió a cargar el catálogo de artículos no tiene que
-- aprender nada nuevo para cargar la gente.
--
-- Lo que cambia es lo que cada tabla exige, y eso no se puede unificar:
--
--   Personal    — la cédula manda. Tiene formato («V-12345678») y es única, y
--                 es lo que decide si una fila crea o corrige. La ficha se
--                 pone sola si no viene: es un correlativo, no un dato que
--                 nadie recuerde.
--
--   Proveedores — manda el RIF, con su formato («J-12345678-9»). Un proveedor
--                 repetido con dos RIF distintos es como se acaba pagando dos
--                 veces la misma factura.
--
-- Los dos formatos se comprueban aquí y no solo en el CHECK de la tabla,
-- porque el CHECK diría «viola la restricción empleados_cedula_formato» y eso
-- no le dice a nadie qué escribir.
-- ---------------------------------------------------------------------------

create or replace function public.cargar_personal_por_lote(
  p_filas jsonb,
  p_confirmar boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_fila     jsonb;
  v_n        int := 0;
  v_informe  jsonb := '[]'::jsonb;
  v_errores  int := 0;
  v_nuevos   int := 0;
  v_actualiz int := 0;

  v_cedula   text;
  v_nombres  text;
  v_apellidos text;
  v_cargo    text;
  v_dpto     text;
  v_ingreso  date;
  v_nacim    date;
  v_salario  numeric;
  v_moneda   text;
  v_frec     text;
  v_base     text;
  v_jornada  text;
  v_ficha    text;
  v_genero   text;
  v_civil    text;

  v_motivo   text;
  v_estado   text;
  v_id       bigint;
  v_vistas   text[] := array[]::text[];
  v_siguiente int;
begin
  perform private.exigir_rol('RRHH');

  if jsonb_typeof(p_filas) <> 'array' then
    raise exception 'La planilla no trae filas.' using errcode = '22023';
  end if;

  select coalesce(max(ficha::int), 0) into v_siguiente
    from public.empleados where ficha ~ '^[0-9]+$';

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_n := v_n + 1;
    v_motivo := null;
    v_estado := null;
    v_ingreso := null;
    v_nacim := null;

    v_cedula    := upper(btrim(coalesce(v_fila->>'cedula', '')));
    v_nombres   := btrim(coalesce(v_fila->>'nombres', ''));
    v_apellidos := btrim(coalesce(v_fila->>'apellidos', ''));
    v_cargo     := btrim(coalesce(v_fila->>'cargo', ''));
    v_dpto      := nullif(btrim(coalesce(v_fila->>'departamento', '')), '');
    v_ficha     := nullif(btrim(coalesce(v_fila->>'ficha', '')), '');
    v_moneda    := upper(coalesce(nullif(btrim(coalesce(v_fila->>'moneda_salario','')),''), 'VES'));
    v_frec      := upper(coalesce(nullif(btrim(coalesce(v_fila->>'frecuencia','')),''), 'QUINCENAL'));
    v_base      := upper(coalesce(nullif(btrim(coalesce(v_fila->>'base_estipulacion','')),''), 'MENSUAL'));
    v_jornada   := upper(coalesce(nullif(btrim(coalesce(v_fila->>'tipo_jornada','')),''), 'DIURNA'));
    v_genero    := upper(nullif(btrim(coalesce(v_fila->>'genero','')), ''));
    v_civil     := upper(nullif(btrim(coalesce(v_fila->>'estado_civil','')), ''));

    if v_cedula = '' then
      v_motivo := 'Falta la cédula.';
    elsif v_cedula !~ '^[VE]-[0-9]{6,9}$' then
      v_motivo := format('La cédula «%s» no tiene la forma que el sistema espera: V-12345678 o E-12345678, con el guion.', v_cedula);
    elsif v_cedula = any(v_vistas) then
      v_motivo := format('La cédula %s se repite en la planilla.', v_cedula);
    elsif v_nombres = '' then
      v_motivo := 'Faltan los nombres.';
    elsif v_apellidos = '' then
      v_motivo := 'Faltan los apellidos.';
    elsif v_cargo = '' then
      v_motivo := 'Falta el cargo. Es de donde sale el sueldo si se usa el tabulador.';
    elsif v_frec not in ('SEMANAL','QUINCENAL','MENSUAL') then
      v_motivo := format('«%s» no es una frecuencia de pago: SEMANAL, QUINCENAL o MENSUAL.', v_frec);
    elsif v_base not in ('MENSUAL','DIARIO','HORA') then
      v_motivo := format('«%s» no dice cómo se estipula el sueldo: MENSUAL, DIARIO u HORA.', v_base);
    elsif v_jornada not in ('DIURNA','NOCTURNA','MIXTA') then
      v_motivo := format('«%s» no es un tipo de jornada: DIURNA, NOCTURNA o MIXTA.', v_jornada);
    elsif v_genero is not null and v_genero not in ('MASCULINO','FEMENINO') then
      v_motivo := 'El género se escribe MASCULINO o FEMENINO, o se deja vacío.';
    elsif v_civil is not null and v_civil not in ('SOLTERO','CASADO','DIVORCIADO','VIUDO','CONCUBINATO') then
      v_motivo := 'El estado civil es SOLTERO, CASADO, DIVORCIADO, VIUDO o CONCUBINATO.';
    elsif not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
      v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
    else
      begin
        v_ingreso := nullif(btrim(coalesce(v_fila->>'fecha_ingreso','')), '')::date;
        v_nacim   := nullif(btrim(coalesce(v_fila->>'fecha_nacimiento','')), '')::date;
        v_salario := coalesce(nullif(btrim(coalesce(v_fila->>'salario_base','')), '')::numeric, 0);
      exception when others then
        v_motivo := 'Hay una fecha o un número que no se entiende. Las fechas van como 2026-08-21 y los números sin separador de miles.';
      end;

      if v_motivo is not null then
        null;
      elsif v_ingreso is null then
        v_motivo := 'Falta la fecha de ingreso. Sin ella no se puede calcular antigüedad ni prestaciones.';
      elsif v_ingreso > current_date then
        v_motivo := 'La fecha de ingreso es futura.';
      elsif v_salario < 0 then
        v_motivo := 'El salario no puede ser negativo.';
      end if;
    end if;

    if v_motivo is not null then
      v_errores := v_errores + 1;
      v_estado  := 'ERROR';
    else
      v_vistas := v_vistas || v_cedula;
      select id into v_id from public.empleados where cedula = v_cedula;

      if v_id is null then
        v_estado := 'NUEVO';
        v_nuevos := v_nuevos + 1;
      else
        v_estado := 'ACTUALIZA';
        v_actualiz := v_actualiz + 1;
      end if;

      if p_confirmar then
        if v_id is null then
          -- La ficha se pone sola si no viene: es un correlativo interno, no
          -- algo que quien llena la planilla tenga por qué saberse.
          if v_ficha is null then
            v_siguiente := v_siguiente + 1;
            v_ficha := lpad(v_siguiente::text, 4, '0');
          end if;

          insert into public.empleados
            (ficha, cedula, nombres, apellidos, cargo, departamento, fecha_ingreso,
             fecha_nacimiento, telefono, direccion, salario_base, moneda_salario,
             frecuencia, base_estipulacion, tipo_jornada, banco, numero_cuenta,
             genero, estado_civil, nacionalidad, creado_por)
          values
            (v_ficha, v_cedula, v_nombres, v_apellidos, v_cargo, v_dpto, v_ingreso,
             v_nacim,
             nullif(btrim(coalesce(v_fila->>'telefono','')), ''),
             nullif(btrim(coalesce(v_fila->>'direccion','')), ''),
             v_salario, v_moneda, v_frec, v_base, v_jornada,
             nullif(btrim(coalesce(v_fila->>'banco','')), ''),
             nullif(btrim(coalesce(v_fila->>'numero_cuenta','')), ''),
             v_genero, v_civil,
             nullif(btrim(coalesce(v_fila->>'nacionalidad','')), ''),
             (select auth.uid()));
        else
          update public.empleados
             set nombres = v_nombres,
                 apellidos = v_apellidos,
                 cargo = v_cargo,
                 departamento = coalesce(v_dpto, departamento),
                 fecha_ingreso = v_ingreso,
                 fecha_nacimiento = coalesce(v_nacim, fecha_nacimiento),
                 telefono = coalesce(nullif(btrim(coalesce(v_fila->>'telefono','')), ''), telefono),
                 direccion = coalesce(nullif(btrim(coalesce(v_fila->>'direccion','')), ''), direccion),
                 salario_base = v_salario,
                 moneda_salario = v_moneda,
                 frecuencia = v_frec,
                 base_estipulacion = v_base,
                 tipo_jornada = v_jornada,
                 banco = coalesce(nullif(btrim(coalesce(v_fila->>'banco','')), ''), banco),
                 numero_cuenta = coalesce(nullif(btrim(coalesce(v_fila->>'numero_cuenta','')), ''), numero_cuenta),
                 genero = coalesce(v_genero, genero),
                 estado_civil = coalesce(v_civil, estado_civil),
                 nacionalidad = coalesce(nullif(btrim(coalesce(v_fila->>'nacionalidad','')), ''), nacionalidad)
           where id = v_id;
        end if;
      end if;
    end if;

    v_informe := v_informe || jsonb_build_object(
      'fila', v_n,
      'codigo', v_cedula,
      'nombre', btrim(v_nombres || ' ' || v_apellidos),
      'estado', v_estado,
      'motivo', v_motivo);
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
$func$;

comment on function public.cargar_personal_por_lote(jsonb, boolean) is
  'Carga fichas de personal desde una planilla. La cédula decide si crea o '
  'corrige. Con p_confirmar en false solo comprueba. Todo o nada.';

revoke execute on function public.cargar_personal_por_lote(jsonb, boolean) from public, anon;
grant  execute on function public.cargar_personal_por_lote(jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------

create or replace function public.cargar_proveedores_por_lote(
  p_filas jsonb,
  p_confirmar boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $func$
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
  v_especial boolean;

  v_motivo   text;
  v_estado   text;
  v_id       bigint;
  v_vistos   text[] := array[]::text[];
begin
  perform private.exigir_rol('COMPRAS');

  if jsonb_typeof(p_filas) <> 'array' then
    raise exception 'La planilla no trae filas.' using errcode = '22023';
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_n := v_n + 1;
    v_motivo := null;
    v_estado := null;

    v_rif       := upper(btrim(coalesce(v_fila->>'rif', '')));
    v_nombre    := btrim(coalesce(v_fila->>'nombre', ''));
    v_condicion := upper(coalesce(nullif(btrim(coalesce(v_fila->>'condicion_pago','')),''), 'CONTADO'));
    v_moneda    := upper(coalesce(nullif(btrim(coalesce(v_fila->>'moneda_preferida','')),''), 'USD'));

    v_especial := case lower(btrim(coalesce(v_fila->>'contribuyente_especial', '')))
                    when '' then false
                    when 'si' then true when 'sí' then true when 'true' then true when '1' then true
                    when 'no' then false when 'false' then false when '0' then false
                    else null end;

    if v_rif = '' then
      v_motivo := 'Falta el RIF.';
    elsif v_rif !~ '^[VEJPGC]-[0-9]{8}-[0-9]$' then
      v_motivo := format('El RIF «%s» no tiene la forma que el sistema espera: J-12345678-9, con los dos guiones.', v_rif);
    elsif v_rif = any(v_vistos) then
      v_motivo := format('El RIF %s se repite en la planilla.', v_rif);
    elsif v_nombre = '' then
      v_motivo := 'Falta la razón social.';
    elsif v_condicion not in ('CONTADO','CREDITO_15','CREDITO_30','CREDITO_60','CONTRA_ENTREGA') then
      v_motivo := format('«%s» no es una condición de pago: CONTADO, CREDITO_15, CREDITO_30, CREDITO_60 o CONTRA_ENTREGA.', v_condicion);
    elsif v_especial is null then
      v_motivo := 'La columna «contribuyente_especial» se responde SI o NO.';
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
             condicion_pago, moneda_preferida, contribuyente_especial, notas, creado_por)
          values
            (v_rif, v_nombre,
             nullif(btrim(coalesce(v_fila->>'nombre_comercial','')), ''),
             nullif(btrim(coalesce(v_fila->>'contacto','')), ''),
             nullif(btrim(coalesce(v_fila->>'telefono','')), ''),
             nullif(btrim(coalesce(v_fila->>'correo','')), ''),
             nullif(btrim(coalesce(v_fila->>'direccion','')), ''),
             v_condicion, v_moneda, v_especial,
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
                 condicion_pago = v_condicion,
                 moneda_preferida = v_moneda,
                 contribuyente_especial = v_especial,
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
$func$;

comment on function public.cargar_proveedores_por_lote(jsonb, boolean) is
  'Carga proveedores desde una planilla. El RIF decide si crea o corrige. Con '
  'p_confirmar en false solo comprueba. Todo o nada.';

revoke execute on function public.cargar_proveedores_por_lote(jsonb, boolean) from public, anon;
grant  execute on function public.cargar_proveedores_por_lote(jsonb, boolean) to authenticated;
