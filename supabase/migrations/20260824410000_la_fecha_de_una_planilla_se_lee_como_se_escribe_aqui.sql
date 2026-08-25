-- ---------------------------------------------------------------------------
-- La fecha de una planilla se lee como se escribe aquí
--
-- Salió tropezando yo mismo al montar el ensayo: escribí `21/08/2026` en la
-- planilla de personal y me contestó «hay una fecha o un número que no se
-- entiende». Y si a mí me pasa escribiéndolo a propósito, a quien llene la
-- planilla le va a pasar siempre: en Venezuela se escribe día/mes/año, y Excel
-- exporta en el idioma de la hoja.
--
-- =========================================================================
-- LO GRAVE NO ES QUE FALLE. ES QUE A VECES NO FALLA
-- =========================================================================
--
-- El casteo era `::date` a secas, y eso lo resuelve el `DateStyle` del servidor,
-- que aquí es `ISO, MDY` — mes primero, a la americana. Comprobado en la base:
--
--   select '08/09/2026'::date   ->   2026-08-09
--
-- Quien escribe «08/09/2026» quiere decir 8 de septiembre. Entra 9 de agosto.
--
-- Así que las fechas se partían en dos grupos:
--
--   día 13 al 31 ... revienta, con un mensaje que no dice cuál es el formato
--   día 1 al 12 .... ENTRA MAL Y CALLADA
--
-- Es la peor mezcla posible, porque parece que funciona. Y `fecha_ingreso` no es
-- un dato decorativo: de ahí salen la antigüedad, las vacaciones y las
-- prestaciones. Un mes de diferencia se paga.
--
-- Nota de alcance: la plantilla `.xlsx` marca sus columnas de fecha y el lector
-- del navegador traduce el número de serie de Excel antes de mandarlo, así que
-- por ese camino ya llegaba en ISO. Esto arregla el otro: el CSV, la celda
-- formateada como texto, y el que escribe la fecha a mano.
--
-- =========================================================================
-- SE LEE LO QUE LA GENTE ESCRIBE, Y LO AMBIGUO SE RECHAZA
-- =========================================================================
--
--   2026-08-21 .... ISO, que es lo que da Excel con una celda de fecha de verdad
--   21/08/2026 .... día/mes/año, que es como se escribe aquí
--   21-08-2026 .... igual, con guiones
--   21/08/26 ...... con el año corto, que sale de las hojas viejas
--
-- Cualquier otra cosa se rechaza diciendo el formato, en vez de adivinar.
-- Adivinar es lo que nos trajo hasta aquí.
--
-- El día y el mes NO se intercambian nunca: `03/04/2026` es el 3 de abril y
-- punto. Un sistema que a veces lee día/mes y a veces mes/día según le cuadre es
-- un sistema en el que no se puede confiar ninguna fecha.
--
-- COMPROBADO, los ocho casos:
--
--   2026-08-21 -> 2026-08-21        21/08/2026 -> 2026-08-21
--   21-08-2026 -> 2026-08-21        21/08/26   -> 2026-08-21
--   08/09/2026 -> 2026-09-08  (antes entraba 2026-08-09, en silencio)
--   31/02/2026 -> rechazada: «no existe: revisa el día y el mes»
--   ayer       -> rechazada, con el formato en el mensaje
--   vacía      -> nula
--
-- Y por la planilla de verdad: ingreso «05/03/2026» entra 5 de marzo y
-- nacimiento «11/07/1988» entra 11 de julio.
-- ---------------------------------------------------------------------------

create or replace function private.fecha_de_planilla(p_texto text)
returns date
language plpgsql
immutable
set search_path to ''
as $func$
declare
  v_t text := btrim(coalesce(p_texto, ''));
  v_d int;
  v_m int;
  v_a int;
  v_partes text[];
begin
  if v_t = '' then
    return null;
  end if;

  -- ISO. Es lo que da Excel cuando la celda es una fecha de verdad, y lo que
  -- escribe quien ya conoce el sistema.
  if v_t ~ '^\d{4}-\d{1,2}-\d{1,2}$' then
    begin
      return v_t::date;
    exception when others then
      raise exception 'La fecha «%» no existe.', p_texto using errcode = '22007';
    end;
  end if;

  -- Día/mes/año, que es como se escribe en Venezuela. Con barra o con guion, y
  -- con el año de cuatro cifras o de dos.
  if v_t ~ '^\d{1,2}[/-]\d{1,2}[/-]\d{2}(\d{2})?$' then
    v_partes := regexp_split_to_array(v_t, '[/-]');
    v_d := v_partes[1]::int;
    v_m := v_partes[2]::int;
    v_a := v_partes[3]::int;

    -- Año corto. El corte en 70 es el de siempre: nadie carga en una planilla a
    -- alguien nacido antes de 1970 con el año en dos cifras, y sí a alguien que
    -- entró en el 24.
    if v_a < 100 then
      v_a := case when v_a < 70 then 2000 + v_a else 1900 + v_a end;
    end if;

    begin
      return make_date(v_a, v_m, v_d);
    exception when others then
      raise exception 'La fecha «%» no existe: revisa el día y el mes.', p_texto
        using errcode = '22007';
    end;
  end if;

  raise exception 'La fecha «%» no se entiende.', p_texto
    using errcode = '22007',
          hint = 'Se escriben como 21/08/2026 (día/mes/año) o como 2026-08-21.';
end;
$func$;

comment on function private.fecha_de_planilla(text) is
  'Lee una fecha de una planilla como se escribe en Venezuela: día/mes/año, o ISO. Nunca intercambia el día y el mes — el casteo a secas leía 08/09/2026 como 9 de agosto, en silencio, y de fecha_ingreso salen la antigüedad y las prestaciones.';

-- ---------------------------------------------------------------------------
-- La planilla de personal la usa
--
-- Es la única de las tres que lleva fechas hoy. El ayudante vive en `private`
-- para que la siguiente que las lleve lo encuentre — que es la regla 2 de la
-- casa, y la que este casteo a secas se saltó.
-- ---------------------------------------------------------------------------
do $migracion$
declare
  v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where proname = 'cargar_personal_por_lote' and pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception 'No existe public.cargar_personal_por_lote.';
  end if;

  if v_def like '%fecha_de_planilla%' then
    return;   -- ya está puesto
  end if;

  v_def := replace(v_def,
    'nullif(btrim(coalesce(v_fila->>''fecha_ingreso'','''')), '''')::date',
    'private.fecha_de_planilla(v_fila->>''fecha_ingreso'')');

  v_def := replace(v_def,
    'nullif(btrim(coalesce(v_fila->>''fecha_nacimiento'','''')), '''')::date',
    'private.fecha_de_planilla(v_fila->>''fecha_nacimiento'')');

  if v_def not like '%fecha_de_planilla%' then
    raise exception 'No se pudo inyectar: los casteos de fecha no tienen la forma esperada.';
  end if;

  execute v_def;
end;
$migracion$;
