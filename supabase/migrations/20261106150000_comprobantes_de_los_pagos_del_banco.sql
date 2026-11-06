-- ============================================================================
-- LOS COMPROBANTES DE LOS PAGOS DEL BANCO (06/11/2026)
--
-- Christopher: «necesito una opción de adjuntar comprobante de pago, para
-- adjuntar el capture del pago efectuado y poner el monto de forma manual,
-- para después asociarlo a la nota de entrega». Varios por pago; no van en el
-- reporte PDF por ahora.
--
-- No se reutiliza `fotos_de_carga`: abrirle un origen más obliga a quitar y
-- volver a poner su CHECK, y eso no se hace. Esta es una tabla aparte, con el
-- pago como llave de verdad (no un número en texto), y un depósito propio:
-- las capturas traen datos bancarios del cliente y no tienen por qué verlas
-- quienes ven las fotos de los camiones.
--
-- Todo es nuevo: no toca ninguna fila que ya exista.
--   - Ver: quien entra a Ventas.
--   - Subir y quitar: el permiso extendido VENTAS.REGISTRAR_PAGOS (ADMIN, siempre).
--   - Nada se borra: quitar deja el archivo y la fila, con quién, cuándo y por qué.
-- ============================================================================

-- ─────────────────────────────── el depósito ────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes-pago', 'comprobantes-pago', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy comprobantes_pago_lectura on storage.objects
  for select to authenticated
  using (bucket_id = 'comprobantes-pago' and private.tiene_permiso('VENTAS', 'LECTURA'));

create policy comprobantes_pago_escritura on storage.objects
  for insert to authenticated
  with check (bucket_id = 'comprobantes-pago' and private.puede_accion('VENTAS.REGISTRAR_PAGOS'));

-- Solo para la miniatura, que se sube con `upsert`. No hay política de borrado.
create policy comprobantes_pago_reemplazo on storage.objects
  for update to authenticated
  using (bucket_id = 'comprobantes-pago' and private.puede_accion('VENTAS.REGISTRAR_PAGOS'));

-- ─────────────────────────────── la tabla ───────────────────────────────────
create table if not exists public.pagos_bancarios_comprobantes (
  id             bigint generated always as identity primary key,
  pago_id        bigint not null references public.pagos_bancarios(id),
  path           text not null unique,
  nombre         text,
  tipo           text not null,
  tamano         bigint,
  subido_por     uuid not null,
  subido_en      timestamptz not null default now(),
  quitado_por    uuid,
  quitado_en     timestamptz,
  motivo_quitado text
);

comment on table public.pagos_bancarios_comprobantes is
  'Capturas o PDF del comprobante de cada pago del banco (Ventas › Registros de pagos). El archivo vive en el depósito privado comprobantes-pago. Quitar no borra.';

create index if not exists pagos_bancarios_comprobantes_pago
  on public.pagos_bancarios_comprobantes (pago_id);

alter table public.pagos_bancarios_comprobantes enable row level security;
create policy pagos_bancarios_comprobantes_lectura on public.pagos_bancarios_comprobantes
  for select to authenticated using (private.tiene_permiso('VENTAS', 'LECTURA'));

create trigger trg_auditar
  after insert or update or delete on public.pagos_bancarios_comprobantes
  for each row execute function private.auditar('id');

-- ─────────────────────────────── anotar uno ─────────────────────────────────
-- El archivo ya subió del navegador al depósito; aquí se anota. La ruta tiene
-- que colgar del pago (`<pago>/…`): así no se anota en un pago un archivo de otro.
create or replace function public.adjuntar_comprobante_pago(
  p_pago_id bigint,
  p_path    text,
  p_nombre  text,
  p_tipo    text,
  p_tamano  bigint
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pago public.pagos_bancarios;
  v_id   bigint;
begin
  perform private.exigir_accion('VENTAS.REGISTRAR_PAGOS');

  select * into v_pago from public.pagos_bancarios where id = p_pago_id;
  if v_pago.id is null then
    raise exception 'Ese pago no existe.' using errcode = 'P0002';
  end if;
  if v_pago.anulado_en is not null then
    raise exception 'Ese pago está anulado: no se le adjuntan comprobantes.' using errcode = '55000';
  end if;
  if p_path is null or p_path not like p_pago_id::text || '/%' then
    raise exception 'El archivo no corresponde a este pago.' using errcode = '22023';
  end if;
  if p_tipo is null or p_tipo not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'Solo se admiten fotos (JPG, PNG, WEBP) o PDF.' using errcode = '22023';
  end if;
  if (select count(*) from public.pagos_bancarios_comprobantes
       where pago_id = p_pago_id and quitado_en is null) >= 6 then
    raise exception 'Este pago ya tiene 6 comprobantes. Quite uno antes de adjuntar otro.' using errcode = '22023';
  end if;

  insert into public.pagos_bancarios_comprobantes (pago_id, path, nombre, tipo, tamano, subido_por)
  values (p_pago_id, p_path, nullif(btrim(p_nombre), ''), p_tipo, p_tamano, (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

-- ─────────────────────────────── quitar uno ─────────────────────────────────
create or replace function public.quitar_comprobante_pago(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_accion('VENTAS.REGISTRAR_PAGOS');

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escriba por qué se quita el comprobante.' using errcode = '22023';
  end if;

  update public.pagos_bancarios_comprobantes
     set quitado_en = now(), quitado_por = (select auth.uid()), motivo_quitado = btrim(p_motivo)
   where id = p_id and quitado_en is null;

  if not found then
    raise exception 'Ese comprobante ya no está en el pago.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.adjuntar_comprobante_pago(bigint, text, text, text, bigint) from public, anon;
revoke all on function public.quitar_comprobante_pago(bigint, text) from public, anon;
grant execute on function public.adjuntar_comprobante_pago(bigint, text, text, text, bigint) to authenticated;
grant execute on function public.quitar_comprobante_pago(bigint, text) to authenticated;
