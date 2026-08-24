-- ---------------------------------------------------------------------------
-- La enmienda de una tasa automática tiene que poder pasar el disparador
--
-- Lo encontró el carril de base de datos, y tenía razón: `corregir_tasa_automatica`
-- **no podía ejecutarse nunca**. Hace un UPDATE sobre `tasas_cambio`, y
-- `trg_tasas_cambio_inmutables` es BEFORE UPDATE OR DELETE FOR EACH ROW y
-- lanzaba sin mirar nada:
--
--   sqlstate 23001 — Las tasas de cambio no se modifican ni se borran.
--
-- La función se escribió el mismo día que la tarea del reloj y no se ejercitó de
-- punta a punta. La reja estaba bien; la puerta no abría.
--
-- POR QUÉ IMPORTA HOY Y NO MAÑANA
--
-- Hoy es el primer día que el reloj toma la tasa solo. Si la fuente publica una
-- cifra mala, con la función muerta no había ninguna salida:
--
--   corregir_tasa_automatica  ->  23001, el disparador
--   registrar_tasa            ->  23505, choca con `tasas_unicas`
--   update / delete directo   ->  23001, el mismo disparador
--
-- Y todo lo que se registre ese día queda valorado con la cifra mala.
--
-- LA FORMA YA ESTABA ESCRITA EN CASA
--
-- No hace falta inventar nada: `private.tesoreria_inmutable` resuelve
-- exactamente este problema desde hace semanas. Deja pasar dos transiciones
-- concretas comparando `to_jsonb(old)` contra `to_jsonb(new)` —descontando las
-- columnas generadas y las que sí pueden cambiar— y lanza en cualquier otro
-- caso. Se copia ese patrón en vez de inventar uno nuevo, que es la regla 2.
--
-- QUÉ SE DEJA PASAR, EXACTAMENTE
--
-- Un UPDATE, y solo si se cumple todo:
--
--   1. La fila la puso la máquina        (old.automatica)
--   2. Es del día en curso, hora de aquí  (old.fecha = hoy en Caracas)
--   3. La enmienda apaga la marca         (new.automatica es falso)
--   4. Nada más cambia: ni moneda, ni fecha, ni fuente
--
-- La 3 es la que hace que esto no sea una grieta sino una puerta con muelle:
-- al corregirla, la fila deja de ser automática, así que **no se puede corregir
-- dos veces**. Lo que puso una persona sigue siendo inmutable desde el primer
-- momento, y lo de días cerrados también.
--
-- El DELETE se queda prohibido siempre, sin excepción. Una tasa que desaparece
-- deja documentos valorados contra algo que ya no existe.
-- ---------------------------------------------------------------------------

create or replace function private.tasas_cambio_inmutables()
returns trigger
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_generadas text[];
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'UPDATE'
     and old.automatica
     and not new.automatica
     and old.fecha = (now() at time zone 'America/Caracas')::date
  then
    -- Las generadas se descuentan porque cambian solas al cambiar sus fuentes,
    -- y compararlas daría siempre distinto.
    select coalesce(array_agg(a.attname), '{}')
      into v_generadas
      from pg_catalog.pg_attribute a
     where a.attrelid = tg_relid
       and a.attgenerated <> ''
       and not a.attisdropped;

    v_old := to_jsonb(old) - v_generadas
             - 'tasa' - 'automatica' - 'registrado_por' - 'registrado_en';
    v_new := to_jsonb(new) - v_generadas
             - 'tasa' - 'automatica' - 'registrado_por' - 'registrado_en';

    -- Todo lo demás tiene que estar intacto. Cambiar la moneda o la fecha de
    -- una fila existente no es enmendar una lectura: es fabricar otra tasa.
    if v_old = v_new then
      return new;
    end if;
  end if;

  raise exception 'Las tasas de cambio no se modifican ni se borran (operación: %). Inserte una tasa nueva.', tg_op
    using errcode = 'restrict_violation',
          hint = 'Solo se puede enmendar la tasa que tomó sola la tarea diaria, el mismo día y una única vez.';
end;
$func$;

comment on function private.tasas_cambio_inmutables() is
  'Las tasas no se tocan, salvo una: la que tomó sola la tarea del día en curso, para enmendar una lectura mala de la fuente. Al enmendarla deja de ser automática y vuelve a ser inmutable.';

-- ---------------------------------------------------------------------------
-- Las dos funciones nuevas se cierran a `PUBLIC`
--
-- También lo vio el carril de base de datos. `corregir_tasa_automatica` y
-- `tomar_tasa_ahora` eran ejecutables por `anon`, que es el `PUBLIC` por
-- defecto de Postgres: nunca se les quitó.
--
-- No era explotable —las dos llaman a `exigir_permiso`, que exige `auth.uid()`
-- no nulo, así que una sesión anónima recibe 28000— pero las otras 152
-- funciones de la casa llevan el `revoke`. Una excepción sin motivo es una
-- excepción que alguien copia.
-- ---------------------------------------------------------------------------
revoke all on function public.corregir_tasa_automatica(character varying, numeric) from public;
revoke all on function public.corregir_tasa_automatica(character varying, numeric) from anon;
grant execute on function public.corregir_tasa_automatica(character varying, numeric) to authenticated;

revoke all on function public.tomar_tasa_ahora(character varying) from public;
revoke all on function public.tomar_tasa_ahora(character varying) from anon;
grant execute on function public.tomar_tasa_ahora(character varying) to authenticated;

-- ---------------------------------------------------------------------------
-- LO QUE NO SE PUEDE CERRAR DESDE AQUÍ, Y HAY QUE SABERLO
--
-- Al instalar `http` entraron catorce funciones —`http_get`, `http_post`,
-- `http_delete`…— ejecutables por `PUBLIC`, y `anon` tiene USAGE sobre
-- `extensions`. El carril de base de datos pidió cerrarlas, con razón.
--
-- No se puede desde este proyecto, y conviene que quede escrito para que nadie
-- lo intente otra vez:
--
--   - Las catorce las posee `supabase_admin`, no `postgres`.
--   - Un REVOKE de quien no es dueño ni tiene grant option **no falla**: no
--     hace nada y sigue adelante. Se probó, y `has_function_privilege` seguía
--     dando cierto para `anon` y `authenticated` después de ejecutarlo.
--   - `set role supabase_admin` responde «permission denied to set role».
--
-- O sea que tres líneas de `revoke` aquí habrían sido tres líneas que mienten:
-- el archivo diría que está cerrado y no lo estaría. Por eso no están.
--
-- LO QUE SÍ SE PUEDE DECIR SOBRE EL RIESGO
--
-- No es alcanzable desde la API hoy. PostgREST expone `public`, no
-- `extensions`, y ninguna función de `public` envuelve una llamada HTTP con
-- destino variable: `private.tomar_tasa_publicada` arma la URL de un `case` con
-- dos literales y devuelve nulo para cualquier otro valor, así que `p_origen`
-- nunca llega a la cadena.
--
-- La regla que queda, entonces, es de disciplina y no de permiso: **ninguna
-- función de `public` puede envolver una llamada HTTP cuyo destino venga de un
-- parámetro**. Mientras eso se cumpla, el que `anon` pueda ejecutar `http_get`
-- no le sirve de nada, porque no tiene por dónde pedirlo.
--
-- Si algún día hace falta cerrarlo de verdad, hay que pedirlo por el panel de
-- Supabase o por soporte: es su esquema, no el nuestro.
-- ---------------------------------------------------------------------------
