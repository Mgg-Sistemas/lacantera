/*
  ACTIVAR O DESACTIVAR UN ARTÍCULO DICE POR QUÉ, Y LO DESACTIVADO NO SE VE

  Christopher, 16/09/2026: «todo producto que sea desactivado, tenga movimientos
  o no, deberá ser ocultado, no obstante, podrá activarlo nuevamente; para ambos
  casos necesitará justificar o dar motivo de la acción».

  Hasta hoy el estado cambiaba con un clic sobre la etiqueta, sin preguntar
  nada, y el catálogo enseñaba los desactivados mezclados con los demás. Desde
  aquí:

  - `cambiar_estado_articulo` pide el motivo en las dos direcciones y lo guarda
    en el artículo, con quién y cuándo. La historia entera queda en la
    auditoría, que registra cada cambio de la fila con su motivo.
  - Pedir el estado que ya tiene se rechaza: no se deja un motivo escrito para
    nada.
  - Ocultar es cosa de la pantalla. El catálogo enseña los activos, y los
    desactivados en su propia lista, desde la que se reactivan. Los formularios
    ya solo ofrecían activos.

  El único artículo desactivado de antes no tiene motivo, y no se le inventa uno.
*/

alter table public.articulos
  add column motivo_estado text,
  add column estado_cambiado_por uuid references auth.users(id),
  add column estado_cambiado_en timestamptz;

comment on column public.articulos.motivo_estado is
  'Por qué se desactivó o se volvió a activar la última vez. Nulo si nunca se cambió con motivo: lo de antes del 16/09/2026 no lo tiene. La historia completa está en la auditoría.';

drop trigger if exists trg_normalizar on public.articulos;
create trigger trg_normalizar before insert or update on public.articulos
  for each row execute function private.normalizar_texto('nombre', 'descripcion', 'motivo_estado');

drop function public.cambiar_estado_articulo(bigint, boolean);

create function public.cambiar_estado_articulo(p_id bigint, p_activo boolean, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_art    record;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');

  if p_activo is null then
    raise exception 'Di si el artículo se activa o se desactiva.' using errcode = '22023';
  end if;

  select id, nombre, activo into v_art from public.articulos where id = p_id for update;

  if v_art.id is null then
    raise exception 'No existe ese artículo.' using errcode = 'P0002';
  end if;

  if v_art.activo = p_activo then
    raise exception '«%» ya está %.', v_art.nombre,
      case when p_activo then 'activo' else 'desactivado' end
      using errcode = '55000';
  end if;

  if length(v_motivo) < 10 then
    raise exception '%',
      case when p_activo
           then format('Escribe por qué «%s» se vuelve a activar: queda guardado con tu nombre.', v_art.nombre)
           else format('Escribe por qué se desactiva «%s»: queda guardado con tu nombre, y es lo que leerá quien quiera volver a activarlo.', v_art.nombre)
      end
      using errcode = '22023';
  end if;

  /*
    UN ARTÍCULO SE DESACTIVA SIN NADA A MEDIAS: con existencia en un patio, o
    dentro de una cotización enviada o un traslado en camino, la base lo niega
    y dice por qué. Es la misma lista que enseña la pantalla.
  */
  if not p_activo
     and exists (select 1 from private.comprobar_desactivar_articulo(p_id) c where c.nivel = 'BLOQUEA') then
    raise exception 'No se puede desactivar todavía: %',
      (select string_agg(c.detalle, ' ' order by c.que)
         from private.comprobar_desactivar_articulo(p_id) c where c.nivel = 'BLOQUEA')
      using errcode = '55000';
  end if;

  update public.articulos
     set activo = p_activo,
         motivo_estado = v_motivo,
         estado_cambiado_por = (select auth.uid()),
         estado_cambiado_en = now()
   where id = p_id;
end;
$func$;

revoke all on function public.cambiar_estado_articulo(bigint, boolean, text) from public, anon;
grant execute on function public.cambiar_estado_articulo(bigint, boolean, text) to authenticated, service_role;
