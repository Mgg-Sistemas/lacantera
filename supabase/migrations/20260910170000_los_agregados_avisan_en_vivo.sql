/*
  Lo que se le monta a una maquina sale en dos sitios de la misma ficha —la
  tarjeta de «que lleva encima» y su historia— y dos personas pueden estar
  mirando la misma maquina: una monta la antena y la otra tiene que verla.
*/
do $publicacion$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'maquina_agregados') then
    alter publication supabase_realtime add table public.maquina_agregados;
  end if;
end $publicacion$;
