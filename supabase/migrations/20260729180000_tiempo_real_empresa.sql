-- ============================================================================
-- La empresa y sus documentos, en vivo
--
-- Sin esto el sistema queda a medias de una forma que no se ve: la aplicación
-- ya sabe qué refrescar cuando cambia `empresa` o `empresa_documentos`, pero
-- Postgres no publica esas tablas y el aviso nunca sale. El código de escucha
-- existe, no falla nada, y sencillamente no pasa nada — que es la peor manera
-- de que algo esté roto.
--
-- Importa aquí más de lo que parece. Los documentos los mantiene una persona
-- mientras otra los consulta: quien acaba de subir la renovación del RIF da por
-- hecho que el resto ya la ve.
-- ============================================================================

do $$
declare
  v_tabla text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'No existe la publicación supabase_realtime. Actívala en el panel de Supabase antes de aplicar esta migración.';
  end if;

  foreach v_tabla in array array['empresa', 'empresa_documentos'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = v_tabla
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tabla);
    end if;
  end loop;
end
$$;

-- Aquí sí se borra —un documento cargado por error, una versión que se
-- reemplaza—, y un DELETE viaja solo con la clave primaria salvo que se pida la
-- fila entera. Sin ella Supabase no puede evaluar la política de RLS sobre lo
-- borrado, descarta el aviso, y la lista se queda enseñando un papel que ya no
-- está hasta que alguien recargue.
alter table public.empresa_documentos replica identity full;
