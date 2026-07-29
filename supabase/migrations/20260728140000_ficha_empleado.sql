-- ============================================================================
-- La ficha del trabajador: número propio, datos de persona y foto
--
-- Hasta ahora el empleado tenía lo que hace falta para pagarle y nada más. Una
-- ficha —la que se imprime, la que se plastifica y la que se busca cuando hay
-- un accidente— necesita otras cosas: un número corto que la gente pueda
-- decir en voz alta, el grupo sanguíneo, a quién llamar y una foto.
--
-- Tres decisiones que conviene entender antes de leer el código:
--
-- 1. El número de ficha NO lleva año. Un documento se numera por año porque el
--    año lo identifica ("la orden 47 del 2026"); un trabajador conserva su
--    número mientras trabaje aquí, aunque entre en 2026 y siga en 2031. Por eso
--    usa la tabla de correlativos con año 0: es el mismo mecanismo con bloqueo
--    de fila que ya impide que dos personas saquen el mismo número, pero sin
--    reinicio anual.
--
-- 2. El encuadre de la foto se guarda aparte de la foto. Se guarda el punto de
--    interés (dos fracciones de 0 a 1) y el acercamiento, no una imagen ya
--    recortada. Así se puede recentrar la cara después sin volver a pedirle la
--    foto al trabajador, y el mismo encuadre sirve para el carnet vertical y
--    para el recuadro de la hoja A4, que no tienen la misma proporción.
--
-- 3. La foto vive en un bucket privado. Una foto de la cédula de alguien con su
--    nombre y su cargo al lado es un dato personal: si el bucket fuera público,
--    cualquiera con la URL la vería sin sesión.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Datos de persona
-- ---------------------------------------------------------------------------
alter table public.empleados
  add column if not exists genero              text,
  add column if not exists nacionalidad        text,
  add column if not exists estado_civil        text,
  add column if not exists grupo_sanguineo     text,
  add column if not exists contacto_emergencia text,
  add column if not exists telefono_emergencia text,
  add column if not exists foto_path           text,
  add column if not exists foto_zoom           numeric(5,3) not null default 1,
  add column if not exists foto_x              numeric(5,4) not null default 0.5,
  add column if not exists foto_y              numeric(5,4) not null default 0.5;

do $$
begin
  -- El grupo sanguíneo se valida contra la lista real. Escrito a mano acaba
  -- siendo "A positivo", "a+", "A +" y deja de servir justo cuando hace falta.
  if not exists (select 1 from pg_constraint where conname = 'empleados_grupo_sanguineo') then
    alter table public.empleados add constraint empleados_grupo_sanguineo
      check (grupo_sanguineo is null or grupo_sanguineo in
        ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'empleados_genero') then
    alter table public.empleados add constraint empleados_genero
      check (genero is null or genero in ('MASCULINO', 'FEMENINO'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'empleados_estado_civil') then
    alter table public.empleados add constraint empleados_estado_civil
      check (estado_civil is null or estado_civil in
        ('SOLTERO', 'CASADO', 'DIVORCIADO', 'VIUDO', 'CONCUBINATO'));
  end if;

  -- El encuadre solo tiene sentido dentro de la imagen. Un punto fuera de
  -- [0,1] o un acercamiento menor que 1 dejaría la foto con bordes vacíos.
  if not exists (select 1 from pg_constraint where conname = 'empleados_foto_encuadre') then
    alter table public.empleados add constraint empleados_foto_encuadre
      check (foto_zoom between 1 and 4 and foto_x between 0 and 1 and foto_y between 0 and 1);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- El número de ficha
-- ---------------------------------------------------------------------------
create or replace function private.siguiente_ficha()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ultimo integer;
begin
  -- Año 0: la ficha no se reinicia nunca. Se reutiliza la tabla de
  -- correlativos por el bloqueo de fila que trae `on conflict do update
  -- ... returning`, que es justo lo que impide el número repetido.
  insert into public.correlativos (prefijo, anio, ultimo)
  values ('FICHA', 0, 1)
  on conflict (prefijo, anio) do update
    set ultimo = public.correlativos.ultimo + 1
  returning ultimo into v_ultimo;

  return lpad(v_ultimo::text, 4, '0');
end;
$$;

-- Los que ya están cargados se renumeran por orden de ingreso: el más antiguo
-- es la ficha 0001. Va en dos pasos porque `ficha` es única y un solo UPDATE
-- podría chocar consigo mismo si alguna ficha vieja ya fuera un número.
do $$
declare
  v_n integer;
begin
  update public.empleados set ficha = 'TMP-' || id::text;

  with orden as (
    select id, row_number() over (order by fecha_ingreso, id) as n
      from public.empleados
  )
  update public.empleados e
     set ficha = lpad(orden.n::text, 4, '0')
    from orden
   where e.id = orden.id;

  select count(*) into v_n from public.empleados;

  insert into public.correlativos (prefijo, anio, ultimo)
  values ('FICHA', 0, v_n)
  on conflict (prefijo, anio) do update set ultimo = excluded.ultimo;
end
$$;

-- ---------------------------------------------------------------------------
-- La foto
--
-- Bucket privado. El límite de 5 MB no es capricho: una foto de teléfono ronda
-- los 3 MB y sin tope alguien sube un archivo de cámara de 40 MB que después
-- hay que descargar entero cada vez que se abre la ficha.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('personal', 'personal', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists fotos_personal_lectura on storage.objects;
drop policy if exists fotos_personal_escritura on storage.objects;
drop policy if exists fotos_personal_reemplazo on storage.objects;
drop policy if exists fotos_personal_borrado on storage.objects;

-- Ver la foto lo puede hacer quien puede ver al empleado; cambiarla, solo
-- recursos humanos. Es la misma línea que separa leer una nómina de tocarla.
create policy fotos_personal_lectura on storage.objects
  for select to authenticated
  using (bucket_id = 'personal'
         and (select public.mis_roles()) && array['ADMIN', 'RRHH', 'GERENTE_GENERAL', 'TESORERIA']::text[]);

create policy fotos_personal_escritura on storage.objects
  for insert to authenticated
  with check (bucket_id = 'personal'
              and (select public.mis_roles()) && array['ADMIN', 'RRHH']::text[]);

create policy fotos_personal_reemplazo on storage.objects
  for update to authenticated
  using (bucket_id = 'personal'
         and (select public.mis_roles()) && array['ADMIN', 'RRHH']::text[]);

create policy fotos_personal_borrado on storage.objects
  for delete to authenticated
  using (bucket_id = 'personal'
         and (select public.mis_roles()) && array['ADMIN', 'RRHH']::text[]);

-- ---------------------------------------------------------------------------
-- Guardar la foto y su encuadre
--
-- El archivo lo sube el navegador directo al bucket; aquí solo se anota dónde
-- quedó y cómo se recorta. Separarlo así evita que la ficha entera dependa de
-- que la subida termine: si falla, no queda una fila a medias.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_foto_empleado(
  p_id   bigint,
  p_path text default null,
  p_zoom numeric default 1,
  p_x    numeric default 0.5,
  p_y    numeric default 0.5
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_anterior text;
begin
  perform private.exigir_rol('RRHH');

  select foto_path into v_anterior from public.empleados where id = p_id;

  if not found then
    raise exception 'No existe el trabajador %.', p_id using errcode = 'P0002';
  end if;

  update public.empleados
     set foto_path = coalesce(nullif(trim(coalesce(p_path, '')), ''), foto_path),
         foto_zoom = coalesce(p_zoom, 1),
         foto_x    = coalesce(p_x, 0.5),
         foto_y    = coalesce(p_y, 0.5)
   where id = p_id;

  -- Se devuelve la ruta anterior para que la pantalla borre el archivo viejo
  -- del bucket. Borrarlo aquí obligaría a esta función a hablar con storage,
  -- y si esa parte fallara se caería el guardado del encuadre con ella.
  if p_path is not null and v_anterior is distinct from p_path then
    return v_anterior;
  end if;

  return null;
exception
  when check_violation then
    raise exception 'El encuadre quedó fuera de la foto. Vuelve a centrarla.'
      using errcode = '23514';
end;
$$;

create or replace function public.quitar_foto_empleado(p_id bigint)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_anterior text;
begin
  perform private.exigir_rol('RRHH');

  -- Se lee antes de borrar: después de la actualización la ruta ya no existe,
  -- y es justo la que la pantalla necesita para borrar el archivo del bucket.
  select foto_path into v_anterior from public.empleados where id = p_id;

  update public.empleados
     set foto_path = null, foto_zoom = 1, foto_x = 0.5, foto_y = 0.5
   where id = p_id;

  return v_anterior;
end;
$$;

-- ---------------------------------------------------------------------------
-- Alta y edición con los datos de persona
--
-- Cambia la firma, así que hay que tirar la anterior: Postgres las trataría
-- como dos funciones distintas y `guardar_empleado` quedaría ambiguo.
-- ---------------------------------------------------------------------------
drop function if exists public.guardar_empleado(
  bigint, text, text, text, text, text, text, date, text, text, numeric, char,
  text, numeric, text, text, text, text, text, boolean, text);

create or replace function public.guardar_empleado(
  p_id             bigint default null,
  p_cedula         text default null,
  p_nombres        text default null,
  p_apellidos      text default null,
  p_cargo          text default null,
  p_departamento   text default null,
  p_fecha_ingreso  date default null,
  p_fecha_nacimiento date default null,
  p_genero         text default null,
  p_nacionalidad   text default null,
  p_estado_civil   text default null,
  p_grupo_sanguineo text default null,
  p_telefono       text default null,
  p_direccion      text default null,
  p_contacto_emergencia text default null,
  p_telefono_emergencia text default null,
  p_frecuencia     text default 'QUINCENAL',
  p_base           text default 'MENSUAL',
  p_salario        numeric default 0,
  p_moneda         char(3) default 'VES',
  p_jornada        text default 'DIURNA',
  p_dias_utilidades numeric default null,
  p_forma_pago     text default 'TRANSFERENCIA',
  p_banco          text default null,
  p_numero_cuenta  text default null,
  p_telefono_pago  text default null,
  p_activo         boolean default true,
  p_nota           text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.exigir_rol('RRHH');

  if length(trim(coalesce(p_nombres, ''))) < 2 or length(trim(coalesce(p_apellidos, ''))) < 2 then
    raise exception 'Faltan el nombre y el apellido del trabajador.' using errcode = '22023';
  end if;

  if p_fecha_ingreso is null then
    raise exception 'La fecha de ingreso decide la antigüedad, el bono vacacional y las prestaciones. No puede quedar vacía.'
      using errcode = '22023';
  end if;

  if p_fecha_nacimiento is not null and p_fecha_nacimiento > current_date - interval '14 years' then
    raise exception 'La fecha de nacimiento da menos de 14 años. Es la edad mínima para trabajar (LOPNNA art. 96); revísala.'
      using errcode = '22023';
  end if;

  if p_id is null then
    -- La ficha se pide aquí adentro, no la manda la pantalla: si la mandara,
    -- dos personas cargando a la vez podrían proponer el mismo número.
    insert into public.empleados
      (ficha, cedula, nombres, apellidos, cargo, departamento, fecha_ingreso,
       fecha_nacimiento, genero, nacionalidad, estado_civil, grupo_sanguineo,
       telefono, direccion, contacto_emergencia, telefono_emergencia,
       frecuencia, base_estipulacion, salario_base, moneda_salario, tipo_jornada,
       dias_utilidades, forma_pago, banco, numero_cuenta, telefono_pago,
       activo, nota, creado_por)
    values
      (private.siguiente_ficha(),
       upper(trim(p_cedula)), trim(p_nombres), trim(p_apellidos), trim(p_cargo),
       nullif(trim(coalesce(p_departamento, '')), ''), p_fecha_ingreso,
       p_fecha_nacimiento,
       nullif(trim(coalesce(p_genero, '')), ''),
       nullif(trim(coalesce(p_nacionalidad, '')), ''),
       nullif(trim(coalesce(p_estado_civil, '')), ''),
       nullif(trim(coalesce(p_grupo_sanguineo, '')), ''),
       nullif(trim(coalesce(p_telefono, '')), ''),
       nullif(trim(coalesce(p_direccion, '')), ''),
       nullif(trim(coalesce(p_contacto_emergencia, '')), ''),
       nullif(trim(coalesce(p_telefono_emergencia, '')), ''),
       p_frecuencia, p_base, p_salario, p_moneda, p_jornada, p_dias_utilidades,
       p_forma_pago,
       nullif(trim(coalesce(p_banco, '')), ''),
       nullif(trim(coalesce(p_numero_cuenta, '')), ''),
       nullif(trim(coalesce(p_telefono_pago, '')), ''),
       coalesce(p_activo, true), nullif(trim(coalesce(p_nota, '')), ''),
       (select auth.uid()))
    returning id into v_id;

    return v_id;
  end if;

  update public.empleados set
    cedula = upper(trim(p_cedula)),
    nombres = trim(p_nombres),
    apellidos = trim(p_apellidos),
    cargo = trim(p_cargo),
    departamento = nullif(trim(coalesce(p_departamento, '')), ''),
    fecha_ingreso = p_fecha_ingreso,
    fecha_nacimiento = p_fecha_nacimiento,
    genero = nullif(trim(coalesce(p_genero, '')), ''),
    nacionalidad = nullif(trim(coalesce(p_nacionalidad, '')), ''),
    estado_civil = nullif(trim(coalesce(p_estado_civil, '')), ''),
    grupo_sanguineo = nullif(trim(coalesce(p_grupo_sanguineo, '')), ''),
    telefono = nullif(trim(coalesce(p_telefono, '')), ''),
    direccion = nullif(trim(coalesce(p_direccion, '')), ''),
    contacto_emergencia = nullif(trim(coalesce(p_contacto_emergencia, '')), ''),
    telefono_emergencia = nullif(trim(coalesce(p_telefono_emergencia, '')), ''),
    frecuencia = p_frecuencia,
    base_estipulacion = p_base,
    salario_base = p_salario,
    moneda_salario = p_moneda,
    tipo_jornada = p_jornada,
    dias_utilidades = p_dias_utilidades,
    forma_pago = p_forma_pago,
    banco = nullif(trim(coalesce(p_banco, '')), ''),
    numero_cuenta = nullif(trim(coalesce(p_numero_cuenta, '')), ''),
    telefono_pago = nullif(trim(coalesce(p_telefono_pago, '')), ''),
    activo = coalesce(p_activo, true),
    nota = nullif(trim(coalesce(p_nota, '')), '')
  where id = p_id;

  return p_id;
exception
  when unique_violation then
    raise exception 'Ya hay un trabajador con esa cédula.' using errcode = '23505';
  when check_violation then
    raise exception 'Hay un dato con formato inválido: la cédula se escribe V-12345678, y el grupo sanguíneo es uno de A+, A-, B+, B-, AB+, AB-, O+ u O-.'
      using errcode = '23514';
end;
$$;

do $$
declare
  v_firma text;
begin
  foreach v_firma in array array[
    'public.guardar_empleado(bigint, text, text, text, text, text, date, date, text, text, text, text, text, text, text, text, text, text, numeric, char, text, numeric, text, text, text, text, boolean, text)',
    'public.guardar_foto_empleado(bigint, text, numeric, numeric, numeric)',
    'public.quitar_foto_empleado(bigint)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_firma);
    execute format('grant execute on function %s to authenticated', v_firma);
  end loop;
end
$$;
