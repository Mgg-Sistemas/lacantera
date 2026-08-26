/*
  EL PAPEL QUE CERTIFICA QUE EL GERENTE DIJO QUE SÍ

  La líder lo pidió así: para autorizar una orden de compra —o cualquier acción
  que pida un permiso especial— el sistema no debería apoyarse solo en el rol o
  en el permiso extendido. Debe poder acompañarse, si quien aprueba quiere, de
  una captura de WhatsApp, un PDF o cualquier comprobante de que el gerente lo
  autorizó.

  Cuelga de la orden y no de la autorización extendida a propósito. La
  autorización extendida se da una vez y vale para muchas órdenes; la captura de
  WhatsApp dice «sí, ESTA». Quien mañana revise la orden encuentra el papel
  dentro de la orden, junto al comprobante de pago y la nota de entrega, que es
  donde va a buscarlo.

  POR QUÉ UNA PUERTA PROPIA Y NO `adjuntar_papel_de_compra`

  Esa exige `private.tiene_rol('ADMIN','COMPRAS','ALMACEN')`, y `tiene_rol` es
  literal: no consulta equivalencias. El gerente general no está en esa lista, ni
  lo está quien aprueba con un permiso extendido —que es justamente el caso que
  este papel documenta—. Ensanchar aquella puerta para que quepan dos roles más
  le abriría también el comprobante de pago y la factura a quien no los tiene en
  la mano. Esta puerta pide exactamente lo que hace falta: poder aprobar.
*/

alter table public.compras_papeles
  drop constraint compras_papeles_tipo_check;

alter table public.compras_papeles
  add constraint compras_papeles_tipo_check
  check (tipo = any (array[
    'COMPROBANTE_PAGO'::text, 'NOTA_ENTREGA'::text, 'FACTURA'::text,
    'AUTORIZACION'::text, 'OTRO'::text
  ]));

create or replace function public.respaldar_autorizacion(
  p_orden_id       bigint,
  p_archivo_path   text,
  p_archivo_nombre text,
  p_nota           text default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint;
begin
  -- Lo mismo que hace falta para aprobar, ni más ni menos: el papel documenta
  -- una aprobación, así que lo sube quien puede aprobar.
  perform private.exigir_accion('COMPRAS.APROBAR_COMPRA');

  if not exists (select 1 from public.ordenes_compra where id = p_orden_id) then
    raise exception 'No existe la orden %.', p_orden_id using errcode = 'P0002';
  end if;

  if length(btrim(coalesce(p_archivo_path, ''))) = 0
     or length(btrim(coalesce(p_archivo_nombre, ''))) = 0 then
    raise exception 'Falta el archivo.' using errcode = '23514';
  end if;

  insert into public.compras_papeles
    (orden_id, tipo, archivo_path, archivo_nombre, nota, subido_por)
  values
    (p_orden_id, 'AUTORIZACION', btrim(p_archivo_path), btrim(p_archivo_nombre),
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.respaldar_autorizacion(bigint, text, text, text) from public;
grant execute on function public.respaldar_autorizacion(bigint, text, text, text) to authenticated;

/*
  Y quitarlo no es como quitar los demás.

  Un comprobante de pago mal subido se quita y se sube el bueno. Un papel que
  certifica quién autorizó una compra es prueba: si lo puede borrar la misma
  persona que lo subió, no prueba nada. Se deja en manos de administración, que
  es quien responde por lo que se borra.
*/
create or replace function public.quitar_papel_de_compra(p_id bigint)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ruta text;
  v_tipo text;
begin
  if not private.tiene_rol('ADMIN', 'COMPRAS', 'ALMACEN') then
    raise exception 'No tienes permiso para quitar papeles de una compra.'
      using errcode = '42501';
  end if;

  select tipo into v_tipo from public.compras_papeles where id = p_id;

  if v_tipo = 'AUTORIZACION' and not private.tiene_rol('ADMIN') then
    raise exception 'El respaldo de una autorización solo lo puede quitar administración.'
      using errcode = '42501';
  end if;

  -- Se devuelve la ruta para que quien llamó borre también el archivo. Si solo
  -- se borrara la fila, el archivo quedaría en el bucket sin nada que lo
  -- nombre: basura que nadie sabe de quién era.
  delete from public.compras_papeles where id = p_id returning archivo_path into v_ruta;

  if v_ruta is null then
    raise exception 'Ese papel ya no está.' using errcode = 'P0002';
  end if;

  return v_ruta;
end;
$function$;
