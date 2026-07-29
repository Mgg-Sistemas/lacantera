-- ============================================================================
-- Los datos, en mayúscula y sin tildes
--
-- "Minería", "MINERIA" y "mineria" son la misma cosa para quien trabaja aquí y
-- tres cosas distintas para la base. De ahí salen los artículos duplicados, las
-- búsquedas que no encuentran lo que está delante y los proveedores repetidos
-- con el nombre escrito de dos maneras.
--
-- Se hace con disparadores y no dentro de cada función de escritura. Hay más de
-- cuarenta funciones que escriben texto; normalizar en cada una significa que
-- la primera que se escriba mañana se olvidará, y el sistema volverá a tener
-- dos formas del mismo dato sin que nadie lo note. Aquí no hay puerta trasera:
-- se escriba desde donde se escriba, la fila entra normalizada.
--
-- QUÉ NO SE TOCA, y por qué:
--
--   - Las contraseñas. Van cifradas en auth.users y no pasan por aquí.
--   - `perfiles.usuario`. Es el nombre con el que se entra al sistema, y se
--     compara contra el correo interno que se genera en minúscula. Cambiarlo
--     dejaría a todo el mundo fuera.
--   - Los correos. Se escriben en minúscula por convención y la parte anterior
--     a la arroba puede distinguir mayúsculas en algunos servidores.
--   - Las rutas de archivo, los tipos MIME y las direcciones internas. Son
--     valores de máquina; en mayúscula sencillamente dejan de encontrarse.
--   - Los códigos de estado, tipo, rol y nivel. Ya nacen en mayúscula y tienen
--     restricciones que los vigilan.
--   - Los catálogos del sistema (roles, módulos, unidades, conceptos de
--     nómina). No los carga nadie: son rótulos que se leen en pantalla.
--
-- LA EÑE SE QUEDA. No es una tilde, es una letra: PEÑA y PENA son dos apellidos
-- distintos, y el recibo de pago de un trabajador es un documento con
-- consecuencias legales. Unificar la tilde de MINERÍA evita duplicados; borrar
-- la eñe de MUÑOZ crea un error en un papel firmado.
-- ============================================================================

create or replace function private.en_mayuscula(p_texto text)
returns text
language sql
immutable
parallel safe
as $$
  select upper(
    translate(
      p_texto,
      'áàäâãéèëêíìïîóòöôõúùüûýÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÝ',
      'aaaaaeeeeiiiiooooouuuuyAAAAAEEEEIIIIOOOOOUUUUY'
    )
  );
$$;

comment on function private.en_mayuscula(text) is
  'Mayúsculas sin tildes, conservando la eñe. La eñe es una letra, no un acento.';

-- ---------------------------------------------------------------------------
-- El disparador genérico
--
-- Recibe los nombres de columna como argumentos, así que una sola función
-- sirve para las veintitantas tablas. Se pasa por JSON porque plpgsql no puede
-- asignar a una columna cuyo nombre solo se conoce en tiempo de ejecución.
-- ---------------------------------------------------------------------------
create or replace function private.normalizar_texto()
returns trigger
language plpgsql
as $$
declare
  v_fila  jsonb := to_jsonb(NEW);
  v_col   text;
  v_valor text;
begin
  foreach v_col in array TG_ARGV loop
    v_valor := v_fila ->> v_col;
    if v_valor is not null then
      v_fila := jsonb_set(v_fila, array[v_col],
                          to_jsonb(private.en_mayuscula(v_valor)));
    end if;
  end loop;

  NEW := jsonb_populate_record(NEW, v_fila);
  return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- Los libros inmutables
--
-- Tres tablas rechazan cualquier UPDATE a propósito: el libro de inventario, el
-- de tesorería y el de tasas. Ahí una corrección se escribe como un asiento
-- nuevo que la explica, nunca editando el que estaba mal.
--
-- Eso vale para el contenido, no para la ortografía. Aquí no se cambia lo que
-- dice ningún asiento: se cambia cómo está escrito, y el importe, la fecha y la
-- cuenta siguen siendo los mismos. Por eso la protección se aparta un momento y
-- se repone acto seguido, todo dentro de la misma transacción — si algo falla,
-- vuelve sola.
-- ---------------------------------------------------------------------------
create or replace function private.normalizar_libro(
  p_tabla text, p_disparador text, p_columna text
)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I disable trigger %I', p_tabla, p_disparador);

  execute format(
    'update public.%I set %I = private.en_mayuscula(%I)
      where %I is not null and %I is distinct from private.en_mayuscula(%I)',
    p_tabla, p_columna, p_columna, p_columna, p_columna, p_columna);

  execute format('alter table public.%I enable trigger %I', p_tabla, p_disparador);
end;
$$;

-- ---------------------------------------------------------------------------
-- Dónde se aplica
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla text;
  v_cols  text;
  v_mapa  text[][] := array[
    ['almacenes',              'nombre, ubicacion'],
    ['articulos',              'nombre, descripcion'],
    ['proveedores',            'rif, nombre, nombre_comercial, contacto, direccion, condicion_pago, notas'],
    ['empleados',              'nombres, apellidos, cedula, direccion, cargo, departamento, motivo_egreso, nota, nacionalidad, estado_civil, contacto_emergencia, banco'],
    ['perfiles',               'nombre, cargo, cedula'],
    ['empresa',                'rif, razon_social, domicilio_fiscal, ciudad, estado, gerencia_seniat, comprobante_rif, condicion_iva'],
    ['empresa_documentos',     'nombre, nota'],
    ['cuentas_tesoreria',      'nombre, banco, titular, documento, nota'],
    ['instrucciones_pago',     'banco, titular, documento, receptor, nota, referencia, motivo_devolucion'],
    ['solicitudes_pedido',     'titulo, justificacion, destino, motivo_cancelacion, solicitante_nombre, solicitante_cargo'],
    ['solicitud_renglones',    'descripcion, observacion'],
    ['cotizaciones',           'numero_proveedor, condicion_pago, observacion'],
    ['cotizacion_renglones',   'observacion'],
    ['ordenes_compra',         'desistio_motivo, desistio_resolucion, desistio_nota, motivo_cancelacion'],
    ['orden_renglones',        'descripcion'],
    ['compras_bitacora',       'nota'],
    ['nomina_periodos',        'descripcion, motivo_anulacion'],
    ['nomina_novedades',       'nota'],
    ['nomina_novedades_montos','nota'],
    ['nomina_recibos',         'nota'],
    ['nomina_parametros',      'descripcion, fuente, valor_texto']
  ];
begin
  for i in 1 .. array_length(v_mapa, 1) loop
    v_tabla := v_mapa[i][1];
    -- Las columnas viajan como argumentos sueltos del disparador.
    v_cols  := (select string_agg(format('%L', trim(c)), ', ')
                  from unnest(string_to_array(v_mapa[i][2], ',')) c);

    execute format('drop trigger if exists trg_normalizar on public.%I', v_tabla);
    execute format(
      'create trigger trg_normalizar before insert or update on public.%I
         for each row execute function private.normalizar_texto(%s)',
      v_tabla, v_cols);

    foreach v_cols in array string_to_array(replace(v_mapa[i][2], ' ', ''), ',') loop
      execute format(
        'update public.%I set %I = private.en_mayuscula(%I)
          where %I is not null and %I is distinct from private.en_mayuscula(%I)',
        v_tabla, v_cols, v_cols, v_cols, v_cols, v_cols);
    end loop;
  end loop;
end
$$;

-- Los libros. Entrada normalizada de ahora en adelante, y una pasada por lo que
-- ya estaba escrito con la protección apartada un momento.
drop trigger if exists trg_normalizar on public.inventario_movimientos;
create trigger trg_normalizar before insert on public.inventario_movimientos
  for each row execute function private.normalizar_texto('nota');

drop trigger if exists trg_normalizar on public.tesoreria_movimientos;
create trigger trg_normalizar before insert on public.tesoreria_movimientos
  for each row execute function private.normalizar_texto('concepto', 'referencia', 'contraparte', 'nota');

do $$
declare
  v_col text;
begin
  perform private.normalizar_libro('inventario_movimientos', 'trg_movimientos_inmutables', 'nota');

  foreach v_col in array array['concepto', 'referencia', 'contraparte', 'nota'] loop
    perform private.normalizar_libro('tesoreria_movimientos', 'tesoreria_movimientos_inmutable', v_col);
  end loop;
end
$$;
