-- ============================================================================
-- LA OBSERVACIÓN DE CADA PAGO DEL BANCO (06/11/2026)
--
-- Christopher: «añádeme un botón para agregar una observación a cada pago
-- bancario, editable».
--
-- No es la descripción: esa es el texto que trae el banco (o el que se copió
-- de la captura). La observación es la nota interna de quien concilia —«el
-- cliente pagó dos viajes en uno», «falta la captura»—. Se guarda como la
-- escribió la persona, sin pasarla a mayúsculas.
--
-- Todo es aditivo: tres columnas que nacen vacías y una función. La lista no
-- cambia su forma (`listar_pagos_bancarios` sigue igual); la pantalla lee la
-- observación directo de la tabla, que Ventas ya puede leer por su política.
-- Cada cambio queda en la bitácora por el `trg_auditar` que ya tiene la tabla.
-- ============================================================================

alter table public.pagos_bancarios
  add column if not exists observacion     text,
  add column if not exists observacion_por uuid,
  add column if not exists observacion_en  timestamptz;

comment on column public.pagos_bancarios.observacion is
  'Nota interna de quien concilia (Ventas › Registros de pagos). Editable; los cambios quedan en la bitácora.';

create or replace function public.guardar_observacion_pago(p_id bigint, p_texto text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  perform private.exigir_accion('VENTAS.REGISTRAR_PAGOS');

  if length(v_texto) > 1000 then
    raise exception 'La observación es muy larga: máximo 1.000 caracteres.' using errcode = '22023';
  end if;

  update public.pagos_bancarios
     set observacion     = v_texto,
         observacion_por = (select auth.uid()),
         observacion_en  = now()
   where id = p_id;

  if not found then
    raise exception 'Ese pago no existe.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.guardar_observacion_pago(bigint, text) from public, anon;
grant execute on function public.guardar_observacion_pago(bigint, text) to authenticated;
