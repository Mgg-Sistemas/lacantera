/*
  LOS DUEÑOS TAMBIÉN AVISAN EN VIVO.

  `propietarios` no estaba en la publicación de tiempo real porque nació como un
  catálogo cerrado de dos filas metidas a mano. Ahora tiene puerta y pantalla, y
  el caso ya se puede dar: alguien registra a la gobernación mientras otro tiene
  abierto el formulario del almacén, y el desplegable no la ofrece hasta que
  recargue.

  Es la misma razón por la que `almacenes` está dentro.
*/
do $publicacion$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'propietarios') then
    alter publication supabase_realtime add table public.propietarios;
  end if;
end $publicacion$;
