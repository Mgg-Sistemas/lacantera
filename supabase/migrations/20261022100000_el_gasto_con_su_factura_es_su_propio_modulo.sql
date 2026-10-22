-- ============================================================================
-- GASTOS: LA FACTURA FÍSICA, TRANSCRITA Y CATEGORIZADA (22/10/2026)
--
-- Christopher pidió un módulo para cargar las facturas físicas (escaneo o
-- foto), transcribirlas con una observación de para qué se usó lo comprado, y
-- un informe de gasto por categoría con categorías que el propio usuario crea
-- (ejemplo suyo: «Planta» para repuestos de mandíbula o cono, «Víveres» para
-- comida).
--
-- SE PENSÓ PRIMERO COMO EXTENSIÓN DE CENTRO DE COSTO / TESORERÍA —ya existe
-- `categorias_gasto`, `registrar_egreso` y el informe `gasto_por_categoria`—,
-- pero Christopher corrigió: Centro de Costo está en evaluación de eliminarse
-- o cambiar, así que este módulo no puede depender de él ni de su fecha de
-- vida. Nace del todo aparte: su propio catálogo de categorías, su propia
-- tabla de facturas, su propio permiso.
--
-- ES BITÁCORA, NO CONTABILIDAD: no toca ninguna cuenta de Tesorería ni resta
-- saldo de nada (confirmado con Christopher). Registra qué se compró, cuánto
-- costó, en qué categoría cae y para qué se usó, con su factura adjunta.
--
-- NO SE INVENTA EL ADJUNTO: `fotos_de_carga` ya hace exactamente esto —sube,
-- genera miniatura, no se borra, se tacha con quién y por qué— para cinco
-- orígenes. Este es el sexto, igual que el 20/10 abrió MANTENIMIENTO.
--
-- NO ES EDITABLE POR CUALQUIERA: una factura ya registrada no se corrige, se
-- anula con motivo y queda a la vista tachada. Es dinero ya gastado, no un
-- borrador.
-- ============================================================================

-- ─────────────────────────────── el módulo y sus permisos ───────────────────
--
-- Debajo de Ventas en el menú (`src/config/navigation.ts`), y con el 63 en la
-- matriz: entre Ventas (60) y Facturación/Asistencia (65).
--
-- Nace sin nadie más que ADMIN: quién más lo necesita lo decide Christopher
-- desde la pantalla de roles, no esta migración.

insert into public.modulos (codigo, nombre, descripcion, orden)
values ('GASTOS', 'Gastos',
        'Facturas físicas transcritas, con su categoría y su foto: qué se compró, cuánto costó y para qué se usó.',
        63)
on conflict (codigo) do nothing;

insert into public.rol_permisos (rol, modulo, nivel)
select r.codigo, 'GASTOS', case when r.codigo = 'ADMIN' then 'TOTAL' else 'NINGUNO' end
  from public.roles r
on conflict (rol, modulo) do nothing;

-- ─────────────────────────────── las categorías ─────────────────────────────
--
-- Propia de este módulo, un solo nivel —no la `categorias_gasto` de Costos,
-- que vive atada a su ecosistema—. El usuario crea las que necesite; estas dos
-- son el ejemplo que dio Christopher, no una lista cerrada.

create table if not exists public.gastos_categorias (
  codigo  text primary key,
  nombre  text not null,
  orden   smallint not null default 50,
  activa  boolean not null default true
);

insert into public.gastos_categorias (codigo, nombre, orden) values
  ('PLANTA',  'Planta',  10),
  ('VIVERES', 'Víveres', 20),
  ('OTROS',   'Otros',   90)
on conflict (codigo) do nothing;

alter table public.gastos_categorias enable row level security;
create policy gastos_categorias_lectura on public.gastos_categorias
  for select to authenticated using (private.tiene_permiso('GASTOS', 'LECTURA'));

-- ─────────────────────────────── la factura ─────────────────────────────────

create table if not exists public.gastos_facturas (
  id                  bigint generated always as identity primary key,
  numero              text,
  fecha               date not null,
  proveedor           text not null,
  documento_proveedor text check (documento_proveedor is null or documento_proveedor ~ '^[VEJPGC]-[0-9]{6,9}(-[0-9])?$'),
  numero_factura      text,
  categoria           text not null references public.gastos_categorias(codigo),
  moneda              text not null default 'USD' references public.monedas(codigo),
  monto               numeric(14,2) not null check (monto > 0),
  observacion         text not null,
  registrado_por      uuid not null,
  registrado_en       timestamptz not null default now(),
  anulada_en          timestamptz,
  anulada_por         uuid,
  motivo_anulacion    text,
  constraint gastos_facturas_proveedor_no_vacio check (btrim(proveedor) <> ''),
  constraint gastos_facturas_observacion_no_vacia check (btrim(observacion) <> '')
);

create unique index if not exists gastos_facturas_numero_unico
  on public.gastos_facturas (numero) where numero is not null;
create index if not exists gastos_facturas_fecha on public.gastos_facturas (fecha);
create index if not exists gastos_facturas_categoria_moneda
  on public.gastos_facturas (categoria, moneda) where anulada_en is null;

alter table public.gastos_facturas enable row level security;
create policy gastos_facturas_lectura on public.gastos_facturas
  for select to authenticated using (private.tiene_permiso('GASTOS', 'LECTURA'));

create trigger trg_auditar
  after insert or update or delete on public.gastos_facturas
  for each row execute function private.auditar('id');

create trigger trg_normalizar
  before insert or update on public.gastos_facturas
  for each row execute function private.normalizar_texto(
    'proveedor', 'documento_proveedor', 'numero_factura', 'observacion', 'motivo_anulacion');

-- ─────────────────────────────── lo que se enseña ───────────────────────────

create or replace view public.v_gastos_facturas
  with (security_invoker = on) as
select f.*,
       c.nombre as categoria_nombre,
       p.nombre as registrado_por_nombre,
       a.nombre as anulada_por_nombre
  from public.gastos_facturas f
  join public.gastos_categorias c on c.codigo = f.categoria
  left join public.perfiles p on p.id = f.registrado_por
  left join public.perfiles a on a.id = f.anulada_por;

-- ─────────────────────────────── registrar ──────────────────────────────────

create or replace function public.registrar_gasto(
  p_fecha               date,
  p_proveedor           text,
  p_categoria           text,
  p_moneda              text,
  p_monto               numeric,
  p_observacion         text,
  p_documento_proveedor text default null,
  p_numero_factura      text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_numero text;
begin
  perform private.exigir_permiso('GASTOS', 'ESCRITURA');

  if p_fecha is null then
    raise exception 'Falta la fecha de la factura.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_proveedor, ''))) < 2 then
    raise exception 'Falta el proveedor de la factura.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.gastos_categorias where codigo = p_categoria and activa) then
    raise exception 'Esa categoría no existe o está apagada.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.monedas where codigo = p_moneda and activa) then
    raise exception 'Esa moneda no existe o está apagada.' using errcode = '22023';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_observacion, ''))) < 4 then
    raise exception 'Diga para qué se usó lo comprado.' using errcode = '22023';
  end if;

  v_numero := private.siguiente_numero('GTO');

  insert into public.gastos_facturas
    (numero, fecha, proveedor, documento_proveedor, numero_factura,
     categoria, moneda, monto, observacion, registrado_por)
  values
    (v_numero, p_fecha, btrim(p_proveedor), nullif(btrim(coalesce(p_documento_proveedor, '')), ''),
     nullif(btrim(coalesce(p_numero_factura, '')), ''),
     p_categoria, p_moneda, p_monto, btrim(p_observacion), (select auth.uid()));

  return v_numero;
end;
$$;

-- ─────────────────────────────── anular ─────────────────────────────────────
--
-- No se corrige, se anula: una factura ya registrada es dinero ya gastado.
-- Queda a la vista, tachada, con quién y por qué — igual que una orden de
-- mantenimiento anulada.

create or replace function public.anular_gasto(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_actual public.gastos_facturas;
begin
  perform private.exigir_permiso('GASTOS', 'TOTAL');

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Diga por qué se anula.' using errcode = '22023';
  end if;

  select * into v_actual from public.gastos_facturas where id = p_id for update;
  if v_actual.id is null then
    raise exception 'No existe ese gasto.' using errcode = 'P0002';
  end if;
  if v_actual.anulada_en is not null then
    raise exception 'Ya estaba anulado.' using errcode = '55000';
  end if;

  update public.gastos_facturas
     set anulada_en = now(),
         anulada_por = (select auth.uid()),
         motivo_anulacion = btrim(p_motivo)
   where id = p_id;
end;
$$;

-- ─────────────────────────────── las categorías, administradas ─────────────

create or replace function public.guardar_categoria_de_gasto(
  p_codigo text, p_nombre text, p_activa boolean default true
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_codigo text := upper(regexp_replace(btrim(coalesce(p_codigo, '')), '[^A-Za-z0-9]+', '_', 'g'));
begin
  perform private.exigir_permiso('GASTOS', 'TOTAL');
  if v_codigo = '' or length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'La categoría necesita un código y un nombre.' using errcode = '22023';
  end if;
  insert into public.gastos_categorias (codigo, nombre, activa)
  values (v_codigo, btrim(p_nombre), coalesce(p_activa, true))
  on conflict (codigo) do update set nombre = excluded.nombre, activa = excluded.activa;
end;
$$;

-- Borrar de verdad, solo si nunca se usó. Si ya tiene facturas detrás, se
-- apaga con `guardar_categoria_de_gasto` en vez de borrarse — los informes
-- viejos tienen que seguir cuadrando.
create or replace function public.eliminar_categoria_de_gasto(p_codigo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_existe boolean;
  v_usos   bigint;
begin
  perform private.exigir_permiso('GASTOS', 'TOTAL');

  select exists(select 1 from public.gastos_categorias where codigo = p_codigo) into v_existe;
  if not v_existe then
    raise exception 'Esa categoría no existe.' using errcode = '22023';
  end if;

  select count(*) into v_usos from public.gastos_facturas where categoria = p_codigo;
  if v_usos > 0 then
    raise exception 'Hay % factura(s) con esa categoría. Apágala en vez de borrarla.', v_usos
      using errcode = '23503';
  end if;

  delete from public.gastos_categorias where codigo = p_codigo;
end;
$$;

-- ─────────────────────────────── el informe por categoría ──────────────────
--
-- Nunca se suma entre monedas (la misma regla que Tesorería): el total sale
-- agrupado por categoría Y por moneda, no mezclado.

create or replace function public.informe_gastos_por_categoria(p_desde date, p_hasta date)
returns table (categoria text, categoria_nombre text, moneda text, monto numeric, cantidad bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select f.categoria, c.nombre, f.moneda, sum(f.monto), count(*)
    from public.gastos_facturas f
    join public.gastos_categorias c on c.codigo = f.categoria
   where f.anulada_en is null
     and (p_desde is null or f.fecha >= p_desde)
     and (p_hasta is null or f.fecha <= p_hasta)
     and private.tiene_permiso('GASTOS', 'LECTURA')
   group by f.categoria, c.nombre, f.moneda
   order by c.nombre, f.moneda;
$$;

-- ─────────────────────────────── permisos de ejecución ──────────────────────

revoke all on function public.registrar_gasto(date, text, text, text, numeric, text, text, text) from public, anon;
revoke all on function public.anular_gasto(bigint, text) from public, anon;
revoke all on function public.guardar_categoria_de_gasto(text, text, boolean) from public, anon;
revoke all on function public.eliminar_categoria_de_gasto(text) from public, anon;
revoke all on function public.informe_gastos_por_categoria(date, date) from public, anon;
grant execute on function public.registrar_gasto(date, text, text, text, numeric, text, text, text) to authenticated;
grant execute on function public.anular_gasto(bigint, text) to authenticated;
grant execute on function public.guardar_categoria_de_gasto(text, text, boolean) to authenticated;
grant execute on function public.eliminar_categoria_de_gasto(text) to authenticated;
grant execute on function public.informe_gastos_por_categoria(date, date) to authenticated;

-- ============================================================================
-- EL SEXTO ORIGEN DE `fotos_de_carga`: GASTO
--
-- Mismo molde que el quinto (MANTENIMIENTO, 20/10/2026): se recrea el CHECK
-- con los seis orígenes, se reescribe la política de lectura entera, y se
-- añade la rama de `exigir_escribir_carga` que exige que la factura ya exista.
-- ============================================================================

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
      'AVERIA'::text, 'MANTENIMIENTO'::text, 'GASTO'::text
    ]));
end
$mig$;

drop policy if exists fotos_de_carga_lectura on public.fotos_de_carga;
create policy fotos_de_carga_lectura on public.fotos_de_carga
  for select to authenticated
  using ((origen = 'SALIDA'        and private.tiene_permiso('SALIDAS', 'LECTURA'))
      or (origen = 'DESPACHO'      and private.tiene_permiso('FACTURACION', 'LECTURA'))
      or (origen = 'COMBUSTIBLE'   and private.tiene_permiso('MAQUINARIA', 'LECTURA'))
      or (origen = 'AVERIA'        and private.tiene_permiso('MAQUINARIA', 'LECTURA'))
      or (origen = 'MANTENIMIENTO' and private.tiene_permiso('MAQUINARIA', 'LECTURA'))
      or (origen = 'GASTO'         and private.tiene_permiso('GASTOS', 'LECTURA')));

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
  elsif p_origen = 'GASTO' then
    perform private.exigir_permiso('GASTOS', 'ESCRITURA');
    if not exists (select 1 from public.gastos_facturas where numero = p_referencia) then
      raise exception 'El gasto % no existe.', p_referencia using errcode = 'P0002';
    end if;
  else
    raise exception 'Origen desconocido: %', p_origen using errcode = '22023';
  end if;
end;
$$;

-- ─────────────────────────────── el depósito: una rama más ─────────────────
--
-- La tabla y la función ya admiten GASTO, pero subir el archivo de verdad pasa
-- por otra reja: la política de `storage.objects`. Se amplía igual que hizo
-- COMBUSTIBLE el 05/10 —`alter policy`, con la rama nueva sumada a las que ya
-- corren—, y no las tres de siempre: la política viva hoy en producción solo
-- trae SALIDA, DESPACHO y COMBUSTIBLE. AVERIA y MANTENIMIENTO quedaron fuera
-- de este depósito cuando se les abrió su origen —ver el aviso al cierre de
-- esta migración—, y esta migración no es el sitio para corregir esa deuda
-- ajena: solo evita sumar una tercera.

alter policy cargas_escritura on storage.objects
  with check (
    bucket_id = 'cargas'
    and (
      (name like 'salida/%'      and private.tiene_permiso('SALIDAS', 'ESCRITURA'))
      or (name like 'despacho/%'    and private.tiene_permiso('FACTURACION', 'ESCRITURA'))
      or (name like 'combustible/%' and private.tiene_permiso('COMBUSTIBLE', 'ESCRITURA'))
      or (name like 'gasto/%'       and private.tiene_permiso('GASTOS', 'ESCRITURA'))
    )
  );

alter policy cargas_lectura on storage.objects
  using (
    bucket_id = 'cargas'
    and (
      private.tiene_permiso('SALIDAS', 'LECTURA')
      or private.tiene_permiso('FACTURACION', 'LECTURA')
      or private.tiene_permiso('COMBUSTIBLE', 'LECTURA')
      or private.tiene_permiso('GASTOS', 'LECTURA')
    )
  );

-- ─────────────────────────────────── comprobación ───────────────────────────
-- Debe devolver: admite = true, politica = 1, puerta = true, modulo = 1.

select
  (select count(*) = 1 from pg_constraint
    where conrelid = 'public.fotos_de_carga'::regclass
      and conname = 'fotos_de_carga_origen_check'
      and pg_get_constraintdef(oid) like '%GASTO%')                        as admite,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'fotos_de_carga'
      and policyname = 'fotos_de_carga_lectura'
      and qual like '%GASTO%')                                             as politica,
  (select position('El gasto' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'exigir_escribir_carga')    as puerta,
  (select count(*) from public.modulos where codigo = 'GASTOS')            as modulo,
  (select with_check like '%gasto/%' from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'cargas_escritura')                                 as deposito_escritura,
  (select qual like '%GASTOS%' from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'cargas_lectura')                                   as deposito_lectura;
