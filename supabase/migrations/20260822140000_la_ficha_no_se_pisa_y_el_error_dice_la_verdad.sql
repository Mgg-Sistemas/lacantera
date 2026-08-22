-- ---------------------------------------------------------------------------
-- La ficha no se pisa, y el error dice la verdad
--
-- Reportado desde nómina: «Para crear ficha en nómina no deja poner la cédula,
-- dice que ya está en uso. (ya usé varias)».
--
-- No era la cédula. El choque era por FICHA, y el mensaje culpaba a la cédula,
-- así que quien lo sufría probaba cédula tras cédula sin que ninguna
-- funcionara. Un error que señala el campo equivocado es peor que un error
-- técnico: manda a corregir lo que estaba bien.
--
-- LO QUE PASABA
--
-- `siguiente_ficha()` lleva la cuenta en la tabla `correlativos`. Si no hay
-- fila para FICHA, el `insert ... on conflict do update` la crea con
-- `ultimo = 1` y devuelve 0001 — que ya existe desde el primer trabajador.
--
-- Y no había fila: los 22 empleados entraron por la carga por planilla, que
-- calcula la ficha con `max(ficha) + 1` y nunca toca el correlativo. Es un
-- fallo de esa carga, escrita ayer: dejó la cuenta en cero mientras la tabla se
-- llenaba, y la bomba estalló al crear el primero a mano.
--
-- SE ARREGLA POR TRES SITIOS
--
-- Reponer la fila no bastaría: cualquier carga futura volvería a
-- desincronizarla.
--
--   1. `siguiente_ficha()` arranca del máximo que ya existe cuando no hay
--      cuenta, y salta las ocupadas si la cuenta se quedó atrás. Deja de
--      depender de que nadie inserte fichas por fuera.
--   2. La carga por planilla pone la cuenta al día al terminar.
--   3. El mensaje mira QUÉ restricción falló, y cuando es la cédula dice cuál.
-- ---------------------------------------------------------------------------

create or replace function private.siguiente_ficha()
returns text
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_ultimo integer;
  v_maximo integer;
  v_vueltas integer := 0;
begin
  -- El mayor que ya existe. Es la verdad de la tabla; el correlativo es solo la
  -- forma rápida de no tener que mirarlo cada vez.
  select coalesce(max(ficha::integer), 0) into v_maximo
    from public.empleados where ficha ~ '^[0-9]+$';

  -- Año 0: la ficha no se reinicia nunca. Se reutiliza la tabla de correlativos
  -- por el bloqueo de fila que trae `on conflict do update ... returning`, que
  -- es justo lo que impide el número repetido cuando dos personas guardan a la
  -- vez.
  insert into public.correlativos (prefijo, anio, ultimo)
  values ('FICHA', 0, v_maximo + 1)
  on conflict (prefijo, anio) do update
    set ultimo = public.correlativos.ultimo + 1
  returning ultimo into v_ultimo;

  -- Si la cuenta se quedó atrás —una carga masiva, una restauración— se avanza
  -- hasta pasar de lo que ya hay. El tope evita un bucle infinito si alguien
  -- llegara a meter fichas no numéricas.
  while v_ultimo <= v_maximo and v_vueltas < 10000 loop
    update public.correlativos set ultimo = v_maximo + 1
     where prefijo = 'FICHA' and anio = 0
     returning ultimo into v_ultimo;
    v_vueltas := v_vueltas + 1;
  end loop;

  return lpad(v_ultimo::text, 4, '0');
end;
$func$;

comment on function private.siguiente_ficha() is
  'El proximo numero de ficha. Arranca del mayor que ya existe si la cuenta esta '
  'vacia o se quedo atras: una carga masiva llena la tabla sin tocar el '
  'correlativo, y entonces el siguiente que se cree a mano chocaria con el 0001.';

-- ---------------------------------------------------------------------------
-- Que la carga por planilla no vuelva a dejar la cuenta atrás
-- ---------------------------------------------------------------------------
create or replace function private.poner_al_dia_ficha()
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_maximo integer;
begin
  select coalesce(max(ficha::integer), 0) into v_maximo
    from public.empleados where ficha ~ '^[0-9]+$';

  insert into public.correlativos (prefijo, anio, ultimo)
  values ('FICHA', 0, v_maximo)
  on conflict (prefijo, anio) do update
    set ultimo = greatest(public.correlativos.ultimo, v_maximo);
end;
$func$;

comment on function private.poner_al_dia_ficha() is
  'Sube la cuenta de fichas hasta la mayor que exista. La llama la carga por '
  'planilla, que asigna fichas por su cuenta y dejaba el correlativo atras.';

-- ---------------------------------------------------------------------------
-- El mensaje mira qué restricción falló
--
-- `guardar_empleado` y `cargar_personal_por_lote` se reescriben desde el
-- catálogo con `pg_get_functiondef` y una sustitución, en vez de copiar aquí
-- sus cuerpos enteros. Son funciones largas, y pegarlas completas por cambiar
-- ocho líneas es la forma más segura de que en el siguiente cambio alguien
-- reviva sin querer una versión vieja.
-- ---------------------------------------------------------------------------
do $ajuste$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'guardar_empleado';

  v_def := replace(v_def,
$viejo$exception
  when unique_violation then
    raise exception 'Ya hay un trabajador con esa cédula.' using errcode = '23505';$viejo$,
$nuevo$exception
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
    end;$nuevo$);

  execute v_def;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'cargar_personal_por_lote';

  v_def := replace(v_def,
$viejo2$  return jsonb_build_object(
    'total', v_n, 'nuevos', v_nuevos, 'actualizados', v_actualiz,$viejo2$,
$nuevo2$  -- La cuenta de fichas queda al día. Esta carga las asigna por su cuenta
  -- con max+1, y sin esto el correlativo se queda en cero: el primero que se
  -- cree después a mano intentaría llevarse la ficha 0001, que ya existe.
  if p_confirmar and v_errores = 0 then
    perform private.poner_al_dia_ficha();
  end if;

  return jsonb_build_object(
    'total', v_n, 'nuevos', v_nuevos, 'actualizados', v_actualiz,$nuevo2$);

  execute v_def;
end
$ajuste$;
