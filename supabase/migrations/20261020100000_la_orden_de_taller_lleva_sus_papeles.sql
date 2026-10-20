-- ============================================================================
-- LA ORDEN DE TALLER LLEVA SUS PAPELES
--
-- Christopher, 13/10/2026: «debería poder subir en alguna parte la imagen, pdf
-- o documento de ese documento firmado, ¿dónde lo puedo subir o dónde lo puedo
-- ver?». No había dónde: las órdenes guardaban motivo, detalle, horómetro,
-- taller, costo y repuestos, y ningún archivo.
--
-- NO SE INVENTA NADA NUEVO. `fotos_de_carga` ya guarda los papeles de cuatro
-- orígenes —la salida, el despacho, el vale de combustible y la avería—, con
-- su depósito privado, su enlace firmado, sus miniaturas y su regla de que
-- nada se borra: lo quitado queda tachado con quién, cuándo y por qué. Esto le
-- abre un quinto origen, igual que el 05/10 con COMBUSTIBLE y el 13/10 con
-- AVERIA.
--
-- Admite JPG, PNG, WEBP y PDF (`TIPOS_ADMITIDOS`), hasta cuatro por orden y
-- 10 MB cada uno. El PDF es lo que hacía falta para la orden firmada.
--
-- Es aditiva: no borra ni reescribe ningún papel existente. El CHECK se
-- recrea con los cuatro orígenes de siempre más el nuevo, y la política de
-- lectura igual.
-- ============================================================================


-- ─────────────────────── 1 · el quinto origen entra al CHECK ───────────────
--
-- El nombre de la restricción se comprueba antes de soltarla: en producción
-- quedó como `fotos_de_carga_origen_check`, pero una recreación la dejaría
-- como `…_check1`, y soltar la que no es dejaría la tabla sin reja.

do $mig$
declare
  v_nombre text;
begin
  select conname into v_nombre
    from pg_constraint
   where conrelid = 'public.fotos_de_carga'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%origen%'
   limit 1;

  if v_nombre is not null then
    execute format('alter table public.fotos_de_carga drop constraint %I', v_nombre);
  end if;

  alter table public.fotos_de_carga
    add constraint fotos_de_carga_origen_check
    check (origen = any (array[
      'SALIDA'::text, 'DESPACHO'::text, 'COMBUSTIBLE'::text,
      'AVERIA'::text, 'MANTENIMIENTO'::text
    ]));
end
$mig$;


-- ───────────────────────── 2 · quién puede verlos ──────────────────────────
--
-- Se reescribe entera con los cinco orígenes. Quien ve la maquinaria ve los
-- papeles de sus órdenes: es el mismo criterio que la avería y el vale.

drop policy if exists fotos_de_carga_lectura on public.fotos_de_carga;
create policy fotos_de_carga_lectura on public.fotos_de_carga
  for select to authenticated
  using ((origen = 'SALIDA'        and private.tiene_permiso('SALIDAS', 'LECTURA'))
      or (origen = 'DESPACHO'      and private.tiene_permiso('FACTURACION', 'LECTURA'))
      or (origen = 'COMBUSTIBLE'   and private.tiene_permiso('MAQUINARIA', 'LECTURA'))
      or (origen = 'AVERIA'        and private.tiene_permiso('MAQUINARIA', 'LECTURA'))
      or (origen = 'MANTENIMIENTO' and private.tiene_permiso('MAQUINARIA', 'LECTURA')));


-- ───────────────────────── 3 · quién puede subirlos ────────────────────────
--
-- La orden tiene que existir. Colgar un papel de un número inventado lo
-- esconde para siempre: no aparecería en ninguna pantalla, y nadie sabría que
-- está ahí.

create or replace function private.exigir_escribir_carga(p_origen text, p_referencia text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_origen = 'SALIDA' then
    perform private.exigir_permiso('SALIDAS', 'ESCRITURA');
    if not exists (select 1 from public.solicitudes_salida where numero = p_referencia) then
      raise exception 'La salida % no existe.', p_referencia using errcode = 'P0002';
    end if;
  elsif p_origen = 'DESPACHO' then
    perform private.exigir_permiso('FACTURACION', 'ESCRITURA');
    if not exists (select 1 from public.solicitudes_despacho where numero = p_referencia) then
      raise exception 'El despacho % no existe.', p_referencia using errcode = 'P0002';
    end if;
  elsif p_origen = 'COMBUSTIBLE' then
    perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
  elsif p_origen = 'AVERIA' then
    perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
    if not exists (select 1 from public.averias_maquinaria where numero = p_referencia) then
      raise exception 'La avería % no existe.', p_referencia using errcode = 'P0002';
    end if;
  elsif p_origen = 'MANTENIMIENTO' then
    perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
    if not exists (select 1 from public.mantenimientos where numero = p_referencia) then
      raise exception 'La orden de taller % no existe.', p_referencia using errcode = 'P0002';
    end if;
  else
    raise exception 'Origen desconocido: %', p_origen using errcode = '22023';
  end if;
end;
$$;


-- ─────────────────────────────── comprobación ──────────────────────────────
-- Debe devolver: admite = true, origenes = 5, y la función ya enterada.

select
  (select count(*) = 1 from pg_constraint
    where conrelid = 'public.fotos_de_carga'::regclass
      and conname = 'fotos_de_carga_origen_check'
      and pg_get_constraintdef(oid) like '%MANTENIMIENTO%')              as admite,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'fotos_de_carga'
      and policyname = 'fotos_de_carga_lectura'
      and qual like '%MANTENIMIENTO%')                                   as politica,
  (select position('La orden de taller' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'exigir_escribir_carga') as puerta;
