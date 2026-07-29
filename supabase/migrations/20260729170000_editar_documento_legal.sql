-- ============================================================================
-- Corregir un documento ya cargado
--
-- Hasta ahora un documento solo se podía cargar o quitar. Eso obliga a borrar y
-- volver a subir para arreglar una fecha mal tecleada — y con un archivo de 17
-- MB por una red de cantera, eso no se hace: se deja el dato malo.
--
-- Dos cosas distintas viven aquí:
--
-- - Corregir los datos. El nombre, el tipo, las fechas, la nota. El archivo no
--   se toca y no hay nada que subir.
-- - Reemplazar el papel. Llega la renovación del RIF o una adenda del convenio.
--   Entra un archivo nuevo y el anterior sobra.
--
-- La función devuelve la ruta del archivo viejo cuando hubo reemplazo, y null
-- cuando no. Así la pantalla sabe si tiene que llevarse algo del almacén: un
-- archivo huérfano de 17 MB ocupa sitio que nadie vuelve a mirar, y borrarlo
-- "por si acaso" cuando no hubo reemplazo dejaría el documento sin su papel.
-- ============================================================================

create or replace function public.actualizar_documento_legal(
  p_id         bigint,
  p_tipo       text,
  p_nombre     text,
  p_emitido_el date default null,
  p_vence_el   date default null,
  p_nota       text default null,
  -- Solo cuando se reemplaza el papel. Si viene null, el archivo se queda.
  p_archivo    text default null,
  p_mime       text default null,
  p_bytes      bigint default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_anterior text;
  v_hay      boolean;
begin
  perform private.exigir_rol('ADMIN', 'GERENTE_GENERAL');

  select archivo_path into v_anterior
    from public.empresa_documentos where id = p_id;

  if v_anterior is null then
    raise exception 'No existe el documento %.', p_id using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.tipos_documento_legal
                  where codigo = p_tipo and activo) then
    raise exception 'No existe el tipo de documento "%".', p_tipo using errcode = '22023';
  end if;

  if length(trim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'Ponle nombre al documento. Una lista de archivos sin nombre no se consulta.'
      using errcode = '22023';
  end if;

  -- Reemplazo solo si viene una ruta y además es otra. Que llegue la misma es
  -- una corrección de datos disfrazada, y devolver esa ruta haría que la
  -- pantalla borrase el archivo que se acaba de dejar.
  v_hay := p_archivo is not null
           and length(trim(p_archivo)) > 0
           and p_archivo is distinct from v_anterior;

  update public.empresa_documentos set
    tipo         = p_tipo,
    nombre       = trim(p_nombre),
    emitido_el   = p_emitido_el,
    vence_el     = p_vence_el,
    nota         = nullif(trim(coalesce(p_nota, '')), ''),
    archivo_path = case when v_hay then p_archivo else archivo_path end,
    mime         = case when v_hay then p_mime    else mime         end,
    bytes        = case when v_hay then p_bytes   else bytes        end,
    -- Quien corrige pasa a ser quien responde por el documento.
    subido_por   = (select auth.uid()),
    subido_en    = now()
  where id = p_id;

  return case when v_hay then v_anterior else null end;
end;
$$;

revoke all on function public.actualizar_documento_legal(bigint, text, text, date, date, text,
                                                         text, text, bigint)
  from public, anon;
grant execute on function public.actualizar_documento_legal(bigint, text, text, date, date, text,
                                                            text, text, bigint)
  to authenticated;
