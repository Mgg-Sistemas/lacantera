/*
  LAS FOTOS ENTRAN AL VALE DE COMBUSTIBLE.

  Christopher, 05/10/2026, tras comparar el surtidor con el de Golden Touch:
  «comienza desde el más importante al menos prioritario». Lo más importante
  era esto: el bombero le saca fotos al despacho —el tablero con el horómetro,
  la máquina, el vale de papel si lo hay— y hoy no tiene dónde ponerlas.

  No se inventa nada nuevo: se le abre un tercer origen a la infraestructura
  de fotos que ya usan las salidas y los despachos (`fotos_de_carga`, depósito
  privado `cargas`, miniaturas guardadas al subir, quitar con motivo, tope de
  cuatro). Tres puertas, las tres aditivas:

  1. La regla de la tabla admite el origen COMBUSTIBLE.
  2. `private.exigir_escribir_carga` gana la rama COMBUSTIBLE: exige la
     escritura de Combustible —la misma que hace falta para despachar— y que
     el vale exista. Las ramas de SALIDA y DESPACHO quedan letra por letra
     como estaban.
  3. Las dos políticas del depósito se AMPLÍAN con `alter policy`: la de
     escritura acepta además `combustible/%` con la escritura de Combustible,
     y la de lectura deja leer también a quien tiene lectura de Combustible.
     No se recrea ninguna política: se le suma una rama a las que ya corren.

  La referencia de la foto es el número del vale (CMB-AAAA-NNNN), igual que
  en los otros dos orígenes la nota de salida o el despacho.
*/

-- ─────────────────── 1 · la regla de la tabla admite COMBUSTIBLE ─────────

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conrelid = 'public.fotos_de_carga'::regclass
    and conname = 'fotos_de_carga_origen_check';

  -- Si alguien ya lo amplió, no se toca nada.
  if v_def is not null and v_def not like '%COMBUSTIBLE%' then
    alter table public.fotos_de_carga drop constraint fotos_de_carga_origen_check;
    alter table public.fotos_de_carga
      add constraint fotos_de_carga_origen_check
      check (origen = any (array['SALIDA'::text, 'DESPACHO'::text, 'COMBUSTIBLE'::text]));
  end if;
end $$;

-- ─────────────── 2 · el permiso: la rama nueva junto a las de siempre ────

create or replace function private.exigir_escribir_carga(p_origen text, p_referencia text)
returns void
language plpgsql
security definer
set search_path to ''
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
    -- La misma escritura que hace falta para despachar del tanque.
    perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');
    if not exists (select 1 from public.despachos_combustible where numero = p_referencia) then
      raise exception 'El vale % no existe.', p_referencia using errcode = 'P0002';
    end if;
  else
    raise exception 'Origen desconocido: %', p_origen using errcode = '22023';
  end if;
end;
$$;

-- ────────────── 3 · el depósito: una rama más en cada política ───────────

alter policy cargas_escritura on storage.objects
  with check (
    bucket_id = 'cargas'
    and (
      (name like 'salida/%'      and private.tiene_permiso('SALIDAS', 'ESCRITURA'))
      or (name like 'despacho/%'    and private.tiene_permiso('FACTURACION', 'ESCRITURA'))
      or (name like 'combustible/%' and private.tiene_permiso('COMBUSTIBLE', 'ESCRITURA'))
    )
  );

alter policy cargas_lectura on storage.objects
  using (
    bucket_id = 'cargas'
    and (
      private.tiene_permiso('SALIDAS', 'LECTURA')
      or private.tiene_permiso('FACTURACION', 'LECTURA')
      or private.tiene_permiso('COMBUSTIBLE', 'LECTURA')
    )
  );
