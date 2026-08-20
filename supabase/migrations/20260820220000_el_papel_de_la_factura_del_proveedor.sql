-- ---------------------------------------------------------------------------
-- El papel de la factura del proveedor, no solo sus datos
--
-- POR QUÉ HACE FALTA
--
-- `facturas_compra` guarda todo lo que dice la factura —número, número de
-- control, base imponible, alícuota, exento— y nada de la factura. Ante una
-- fiscalización el soporte es el documento, no la fila: una tabla con los
-- números bien puestos y sin respaldo no prueba nada.
--
-- Y en lo cotidiano pesa igual. Un número de control mal tecleado solo se
-- resuelve mirando el original, y el original hoy está en una carpeta encima de
-- un escritorio.
--
-- EL BUCKET ES PRIVADO, COMO LOS OTROS DOS
--
-- Mismo patrón que `documentos-legales` y `personal`: cuatro políticas sobre
-- `storage.objects` decididas por `public.mis_roles()`. Nada de esto es
-- público; una factura de proveedor lleva el RIF, los montos y a veces la
-- cuenta bancaria de quien cobra.
--
-- Quién lo ve y quién lo toca no es lo mismo. **Ve** quien necesita
-- comprobarlo: compras, tesorería, gerencia y administración. **Escribe** solo
-- quien la registra: compras y administración. Tesorería paga contra el
-- documento, no lo produce.
--
-- LO QUE ACEPTA, Y POR QUÉ ESO
--
-- PDF e imágenes, hasta 10 MB. El proveedor manda un PDF o una foto del papel
-- hecha con el teléfono en el patio, y las dos cosas valen. El tope es el mismo
-- que usa MGG y da de sobra: una foto de factura no pasa de tres o cuatro.
--
-- LA FILA GUARDA LA RUTA, EL BUCKET GUARDA EL ARCHIVO
--
-- El archivo viaja del navegador al bucket y la ruta entra por una función,
-- como la foto del personal. Si la subida falla no queda una factura apuntando
-- a un archivo que no existe. Y al reemplazarlo, el anterior se borra: nadie va
-- a mirar la versión vieja de un papel y ocupa espacio pagado.
--
-- UNA FACTURA ANULADA CONSERVA SU ARCHIVO, A PROPÓSITO
--
-- Anular es decir que ese documento no cuenta, no que no existió. El papel es
-- justamente la prueba de por qué se anuló.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'facturas-proveedor',
  'facturas-proveedor',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname='storage' and tablename='objects'
                    and policyname='facturas_proveedor_lectura') then
    create policy facturas_proveedor_lectura on storage.objects
      for select to authenticated
      using (
        bucket_id = 'facturas-proveedor'
        and (select public.mis_roles()) && array['ADMIN', 'GERENTE_GENERAL', 'COMPRAS', 'TESORERIA']
      );
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname='storage' and tablename='objects'
                    and policyname='facturas_proveedor_escritura') then
    create policy facturas_proveedor_escritura on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'facturas-proveedor'
        and (select public.mis_roles()) && array['ADMIN', 'COMPRAS']
      );
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname='storage' and tablename='objects'
                    and policyname='facturas_proveedor_reemplazo') then
    create policy facturas_proveedor_reemplazo on storage.objects
      for update to authenticated
      using (
        bucket_id = 'facturas-proveedor'
        and (select public.mis_roles()) && array['ADMIN', 'COMPRAS']
      );
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname='storage' and tablename='objects'
                    and policyname='facturas_proveedor_borrado') then
    create policy facturas_proveedor_borrado on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'facturas-proveedor'
        and (select public.mis_roles()) && array['ADMIN', 'COMPRAS']
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
alter table public.facturas_compra
  add column if not exists archivo_path   text,
  add column if not exists archivo_nombre text;

comment on column public.facturas_compra.archivo_path is
  'Ruta dentro del bucket privado `facturas-proveedor`. Nulo mientras el papel '
  'no se haya cargado: los datos pueden estar y el respaldo faltar.';

comment on column public.facturas_compra.archivo_nombre is
  'Cómo se llamaba el archivo cuando lo subieron. La ruta lleva un sello de '
  'tiempo para no chocar, y ese nombre no le dice nada a nadie.';

-- ---------------------------------------------------------------------------
create or replace function public.guardar_archivo_factura(
  p_id     bigint,
  p_path   text,
  p_nombre text
)
returns text
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_anterior text;
  v_estado   text;
begin
  perform private.exigir_rol('COMPRAS');

  select archivo_path, estado into v_anterior, v_estado
  from public.facturas_compra where id = p_id;

  if v_estado is null then
    raise exception 'No existe esa factura de proveedor.' using errcode = 'P0002';
  end if;

  if length(trim(coalesce(p_path, ''))) = 0 then
    raise exception 'Falta la ruta del archivo.' using errcode = '22023';
  end if;

  update public.facturas_compra
     set archivo_path   = p_path,
         archivo_nombre = nullif(trim(coalesce(p_nombre, '')), '')
   where id = p_id;

  -- Se devuelve la anterior para que quien llama borre el archivo viejo. La
  -- base no puede hacerlo: el bucket no se toca desde SQL.
  return v_anterior;
end;
$function$;

comment on function public.guardar_archivo_factura is
  'Engancha un archivo ya subido a una factura de proveedor y devuelve la ruta '
  'del anterior, para que el que llama la borre del bucket.';

revoke execute on function public.guardar_archivo_factura(bigint, text, text) from public, anon;
grant  execute on function public.guardar_archivo_factura(bigint, text, text) to authenticated;

-- ---------------------------------------------------------------------------
create or replace function public.quitar_archivo_factura(p_id bigint)
returns text
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_anterior text;
begin
  perform private.exigir_rol('COMPRAS');

  select archivo_path into v_anterior
  from public.facturas_compra where id = p_id;

  update public.facturas_compra
     set archivo_path = null, archivo_nombre = null
   where id = p_id;

  return v_anterior;
end;
$function$;

revoke execute on function public.quitar_archivo_factura(bigint) from public, anon;
grant  execute on function public.quitar_archivo_factura(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Y la vista de lo que falta aprende a mirar el papel
--
-- Hasta ahora «respaldo» era la fila. Con el archivo, una factura registrada y
-- sin cargar sigue siendo una compra a medio soportar.
-- ---------------------------------------------------------------------------
-- `create or replace` no sabe reordenar ni renombrar columnas de una vista, y
-- aquí entran dos nuevas en medio. Se borra y se rehace; no cuelga nada de ella
-- todavía.
drop view if exists public.v_compras_sin_respaldo;

create view public.v_compras_sin_respaldo as
select o.id,
       o.numero,
       o.estado,
       o.condicion_pago,
       o.comprobante_tipo,
       p.nombre as proveedor,
       o.total,
       o.moneda,
       f.id      as factura_id,
       f.numero_factura,
       (f.id is not null)            as tiene_factura,
       (f.archivo_path is not null)  as tiene_papel,
       case
         when o.comprobante_tipo is null                  then 'SIN_DECLARAR'
         when o.comprobante_tipo = 'FACTURA' and f.id is null
           then 'FACTURA_SIN_REGISTRAR'
         when o.comprobante_tipo = 'FACTURA' and f.archivo_path is null
           then 'FACTURA_SIN_PAPEL'
       end as falta
  from public.ordenes_compra o
  join public.proveedores p on p.id = o.proveedor_id
  left join lateral (
    select f2.id, f2.numero_factura, f2.archivo_path
    from public.facturas_compra f2
    where f2.orden_id = o.id and f2.estado <> 'ANULADA'
    order by f2.id desc
    limit 1
  ) f on true
 -- Solo se excluye la cancelada: esa compra no ocurrió. La desistida sí
 -- entra, porque puede haber material recibido y dinero pagado.
 where o.estado <> 'CANCELADA'
   and (o.comprobante_tipo is null
        or (o.comprobante_tipo = 'FACTURA'
            and (f.id is null or f.archivo_path is null)));

alter view public.v_compras_sin_respaldo set (security_invoker = on);

comment on view public.v_compras_sin_respaldo is
  'Compras a las que les falta respaldo del proveedor: nadie declaró con qué '
  'entrega, o se declaró factura y no se registró, o se registró y falta el '
  'papel. Cada una es crédito fiscal que la empresa no puede sostener.';

grant select on public.v_compras_sin_respaldo to authenticated;
