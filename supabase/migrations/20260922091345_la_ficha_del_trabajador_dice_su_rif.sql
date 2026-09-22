-- LA FICHA DEL TRABAJADOR DICE SU RIF
--
-- Christopher, 22/09/2026: «en RRHH, poder adjuntar el RIF de la persona». La
-- ficha guardaba la cédula y nada más. El RIF hace falta para el SENIAT, para
-- una constancia y para cualquier trámite donde la persona figure como
-- contribuyente.
--
-- VA COMO CAMPO APARTE Y NO SE DERIVA DE LA CÉDULA. El RIF de una persona
-- natural suele ser su cédula con una letra delante y un dígito verificador
-- detrás, pero no siempre —quien tiene firma personal lleva J— y el dígito se
-- calcula con una fórmula. Calcularlo aquí sería imprimir en un papel un
-- número que el sistema se inventó, y un RIF equivocado en una constancia lo
-- descubre el banco, no nosotros.
--
-- ES OPCIONAL. Hay 24 fichas vivas y ninguna lo tiene: si fuera obligatorio,
-- nadie podría guardar una ficha hasta ir a buscar 24 papeles.

alter table public.empleados add column if not exists rif text;

comment on column public.empleados.rif is
  'RIF de la persona, V-12345678-9. Nulo mientras no se sepa: la ficha no se traba por él.';

-- Mismo criterio que la cédula: se comprueba la forma, no la existencia.
alter table public.empleados drop constraint if exists empleados_rif_formato;
alter table public.empleados add constraint empleados_rif_formato
  check (rif is null or rif ~ '^[VEJPG]-[0-9]{6,9}(-[0-9])?$');

-- El RIF entra a la normalización con los demás textos: siempre en mayúscula.
drop trigger if exists trg_normalizar on public.empleados;
create trigger trg_normalizar before insert or update on public.empleados
  for each row execute function private.normalizar_texto(
    'nombres', 'apellidos', 'cedula', 'rif', 'direccion', 'cargo', 'departamento',
    'motivo_egreso', 'nota', 'nacionalidad', 'estado_civil', 'contacto_emergencia', 'banco');

-- ───────────────────────────────────────────────────────────────────────────
-- guardar_empleado, con el RIF
--
-- Se borra la firma vieja antes de crear la nueva: con las dos a la vez,
-- PostgREST no sabría cuál llamar. El parámetro va al final y con valor por
-- omisión, así que quien la llame sin él —el código del compañero, una
-- pantalla que no se haya tocado— sigue funcionando igual.
--
-- Y POR ESO NO VENIR Y VENIR VACÍO SON COSAS DISTINTAS:
--   · `p_rif` nulo      → no se manda: el RIF que haya se queda como está.
--   · `p_rif` en blanco → se manda vacío: se borra.
-- Sin esa distinción, cualquier guardado desde una pantalla vieja —la que
-- está publicada ahora mismo, la del compañero— borraría el RIF sin que nadie
-- lo pidiera, y quien guardó un teléfono se llevaría por delante otro dato.
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists public.guardar_empleado(bigint, text, text, text, text, text, date, date,
  text, text, text, text, text, text, text, text, text, text, numeric, character, text, numeric,
  text, text, text, text, boolean, text, bigint);

create function public.guardar_empleado(
  p_id bigint default null,
  p_cedula text default null,
  p_nombres text default null,
  p_apellidos text default null,
  p_cargo text default null,
  p_departamento text default null,
  p_fecha_ingreso date default null,
  p_fecha_nacimiento date default null,
  p_genero text default null,
  p_nacionalidad text default null,
  p_estado_civil text default null,
  p_grupo_sanguineo text default null,
  p_telefono text default null,
  p_direccion text default null,
  p_contacto_emergencia text default null,
  p_telefono_emergencia text default null,
  p_frecuencia text default 'QUINCENAL',
  p_base text default 'MENSUAL',
  p_salario numeric default 0,
  p_moneda character default 'VES',
  p_jornada text default 'DIURNA',
  p_dias_utilidades numeric default null,
  p_forma_pago text default 'TRANSFERENCIA',
  p_banco text default null,
  p_numero_cuenta text default null,
  p_telefono_pago text default null,
  p_activo boolean default true,
  p_nota text default null,
  p_tabulador_id bigint default null,
  p_rif text default null)
returns bigint
language plpgsql security definer set search_path to ''
as $function$
declare
  v_id bigint;
  v_rif text := nullif(upper(trim(coalesce(p_rif, ''))), '');
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

  if v_rif is not null and v_rif !~ '^[VEJPG]-[0-9]{6,9}(-[0-9])?$' then
    raise exception 'El RIF se escribe V-12345678-9: la letra, el número y el dígito verificador.'
      using errcode = '22023';
  end if;

  if p_tabulador_id is not null
     and not exists (select 1 from public.nomina_tabulador where id = p_tabulador_id) then
    raise exception 'Ese cargo del tabulador ya no existe.' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.empleados
      (ficha, cedula, rif, nombres, apellidos, cargo, departamento, fecha_ingreso,
       fecha_nacimiento, genero, nacionalidad, estado_civil, grupo_sanguineo,
       telefono, direccion, contacto_emergencia, telefono_emergencia,
       frecuencia, base_estipulacion, salario_base, moneda_salario, tipo_jornada,
       dias_utilidades, forma_pago, banco, numero_cuenta, telefono_pago,
       activo, nota, tabulador_id, fecha_ingreso_confirmada, creado_por)
    values
      (private.siguiente_ficha(),
       upper(trim(p_cedula)), v_rif, trim(p_nombres), trim(p_apellidos), trim(p_cargo),
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
       p_tabulador_id, true,
       (select auth.uid()))
    returning id into v_id;

    return v_id;
  end if;

  update public.empleados set
    cedula = upper(trim(p_cedula)),
    -- El de la derecha es el valor que ya tenía la fila: si no vino RIF, se queda.
    rif = case when p_rif is null then rif else v_rif end,
    nombres = trim(p_nombres),
    apellidos = trim(p_apellidos),
    cargo = trim(p_cargo),
    departamento = nullif(trim(coalesce(p_departamento, '')), ''),
    fecha_ingreso = p_fecha_ingreso,
    -- Alguien abrió la ficha, vio la fecha de ingreso —es obligatoria y está en
    -- el formulario— y guardó. Eso es la revisión que le faltaba.
    fecha_ingreso_confirmada = true,
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
    nota = nullif(trim(coalesce(p_nota, '')), ''),
    tabulador_id = p_tabulador_id
  where id = p_id;

  return p_id;
exception
  when unique_violation then
    -- Se mira QUÉ restricción falló. Antes cualquier choque de unicidad decía
    -- «ya hay un trabajador con esa cédula», y el que chocaba de verdad era el
    -- número de ficha: quien lo sufría probaba cédula tras cédula sin que
    -- ninguna sirviera, porque el problema estaba en otro campo.
    declare v_cual text;
    begin
      get stacked diagnostics v_cual = constraint_name;
      if v_cual = 'empleados_ficha_key' then
        raise exception 'El número de ficha que iba a asignarse ya está en uso. No es cosa de la cédula: es la numeración interna, que se quedó atrás. Vuelve a intentarlo.'
          using errcode = '23505';
      end if;
      raise exception 'Ya hay un trabajador con la cédula %.', upper(trim(coalesce(p_cedula, '')))
        using errcode = '23505';
    end;
  when check_violation then
    raise exception 'Hay un dato con formato inválido: la cédula se escribe V-12345678, el RIF V-12345678-9, y el grupo sanguíneo es uno de A+, A-, B+, B-, AB+, AB-, O+ u O-.'
      using errcode = '23514';
end;
$function$;

revoke execute on function public.guardar_empleado(bigint, text, text, text, text, text, date, date,
  text, text, text, text, text, text, text, text, text, text, numeric, character, text, numeric,
  text, text, text, text, boolean, text, bigint, text) from public, anon;
grant execute on function public.guardar_empleado(bigint, text, text, text, text, text, date, date,
  text, text, text, text, text, text, text, text, text, text, numeric, character, text, numeric,
  text, text, text, text, boolean, text, bigint, text) to authenticated;
