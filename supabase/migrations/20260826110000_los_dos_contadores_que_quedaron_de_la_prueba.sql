-- Los dos contadores que quedaron de la prueba.
--
-- La limpieza anterior reinició OC, SOL, NOM y PAG, que eran los que yo tenía
-- en la cabeza. Al comprobar el resultado quedaban dos más: COT=1 y TES=1, de la
-- cotización y del movimiento de tesorería que sí se borraron.
--
-- Los escribí a mano y por eso se me escaparon dos. Esto no: recorre los
-- contadores que hay y borra el de cualquier prefijo que ya no tenga ni un
-- documento detrás. Es la misma idea que el arreglo del correlativo de nómina de
-- ayer, pero por el otro lado — allí el contador iba por DEBAJO de los
-- documentos, aquí va por encima de un vacío.
--
-- Lo que sí tiene documentos no se toca, para no reabrir el choque de ayer.

do $contadores$
declare
  r record;
  v_sql text;
  v_n bigint;
  v_borrados text := '';
begin
  for r in select prefijo, anio, ultimo from public.correlativos order by prefijo
  loop
    v_n := 0;

    -- ¿Queda algún documento con ese prefijo, en cualquier tabla que numere?
    declare
      c record;
      v_hay bigint;
    begin
      for c in
        select cc.table_name, cc.column_name
          from information_schema.columns cc
          join information_schema.tables tt
            on tt.table_schema = cc.table_schema and tt.table_name = cc.table_name
           and tt.table_type = 'BASE TABLE'
         where cc.table_schema = 'public' and cc.data_type = 'text'
           and (cc.column_name = 'numero' or cc.column_name like '%numero%'
                or cc.column_name = 'nota_salida')
      loop
        v_sql := format('select count(*) from public.%I where %I like %L',
                        c.table_name, c.column_name, r.prefijo || '-%');
        begin
          execute v_sql into v_hay;
        exception when others then
          v_hay := 0;
        end;
        v_n := v_n + coalesce(v_hay, 0);
      end loop;
    end;

    if v_n = 0 then
      delete from public.correlativos where prefijo = r.prefijo and anio = r.anio;
      v_borrados := v_borrados || format(' %s(iba por %s)', r.prefijo, r.ultimo);
    end if;
  end loop;

  raise notice 'contadores sin documento detras, reiniciados:%',
    coalesce(nullif(v_borrados, ''), ' ninguno');
end;
$contadores$;
