-- El correlativo de nómina iba a chocar con los períodos que quedaron.
--
-- Cazado al intentar abrir un período de ensayo:
--
--   duplicate key value violates unique constraint "nomina_periodos_numero_key"
--   Key (numero)=(NOM-2026-0001) already exists.
--
-- La limpieza del 25 vació `correlativos` para que la primera compra real
-- empezara en el 0001. Pero la nómina se conservó a propósito —son los datos
-- de verdad de veintidós trabajadores— y con ella sus dos períodos,
-- NOM-2026-0001 y NOM-2026-0002.
--
-- Resultado: el contador dice cero y los documentos dicen dos. El día que
-- abrieran la quincena de septiembre, `abrir_periodo` habría reventado con un
-- error de clave duplicada que no dice nada de lo que pasa de verdad.
--
-- La revisión del carril de base dio esto por bueno —«ningún correlativo quedó
-- por encima de lo que hay, así que ningún documento nuevo va a chocar»— y era
-- cierto al revés: el peligro no era un correlativo por encima, era uno por
-- DEBAJO. Se comprobó una dirección de la desigualdad y no la otra.
--
-- El arreglo se calcula del propio documento y no se escribe a mano: si mañana
-- aparece otro prefijo en el mismo estado, esto lo recoge igual. Y solo sube,
-- nunca baja, para no reabrir el problema al revés.

do $correlativos$
declare
  r record;
  v_sql text;
  v_max text;
  v_arreglados text := '';
begin
  for r in
    select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
       and t.table_type = 'BASE TABLE'
     where c.table_schema = 'public'
       and c.data_type = 'text'
       and (c.column_name = 'numero' or c.column_name like '%numero%'
            or c.column_name = 'nota_salida')
     order by c.table_name, c.column_name
  loop
    v_sql := format(
      'select max(%I) from public.%I where %I ~ ''^[A-Z]{2,4}-[0-9]{4}-[0-9]{4}$''',
      r.column_name, r.table_name, r.column_name);

    begin
      execute v_sql into v_max;
    exception when others then
      v_max := null;
    end;

    if v_max is not null then
      insert into public.correlativos (prefijo, anio, ultimo)
      values (split_part(v_max, '-', 1),
              split_part(v_max, '-', 2)::smallint,
              split_part(v_max, '-', 3)::integer)
      on conflict (prefijo, anio) do update
        -- Solo sube. Si el contador ya iba por delante —porque se anuló un
        -- documento y su número no se reutiliza— bajarlo seria fabricar el
        -- choque que esto viene a evitar.
        set ultimo = greatest(public.correlativos.ultimo, excluded.ultimo);

      v_arreglados := v_arreglados || format(' %s(%s)', v_max, r.table_name);
    end if;
  end loop;

  raise notice 'correlativos puestos al dia:%', coalesce(nullif(v_arreglados, ''), ' ninguno hacia falta');
end;
$correlativos$;
