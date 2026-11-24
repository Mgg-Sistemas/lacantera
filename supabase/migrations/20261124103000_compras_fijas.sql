-- ============================================================
-- Módulo: pedidos / compras
-- Archivo: compras-fijas-2026-11-24.sql
-- Empresa: MINERIA INTERNACIONAL TS, C.A. (La Cantera)
-- ------------------------------------------------------------
-- COMPRAS FIJAS (Plantillas Recurrentes de Compra)
--
-- Plantillas de las compras que se repiten: cada cuánto, qué productos
-- (por categoría y/o lista fija), quién solicita, y si va por Solicitud
-- de Pedido (cotización → OC) o por Compra directa. «Generar» arma la
-- solicitud precargada con las cantidades de la última vez.
--
-- Idempotente: se puede correr más de una vez.
-- ============================================================

create table if not exists public.compras_fijas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  icono text not null default '🔁',
  frecuencia text not null default 'mensual' check (frecuencia in ('semanal', 'quincenal', 'mensual', 'cada_dias')),
  cada_dias int check (cada_dias is null or cada_dias between 1 and 365),
  proxima_fecha date not null default ((now() at time zone 'America/Caracas')::date),
  activa boolean not null default true,
  -- 'solicitud' = Solicitud de Pedido (cotización → OC) · 'compra_directa' = Compra directa
  modo text not null default 'solicitud' check (modo in ('solicitud', 'compra_directa')),
  permite_cotizar boolean not null default true,
  solicitante text,
  unidad_solicitante text,
  finalidad text,
  urgente boolean not null default false,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  proveedor_nombre text,
  -- Palabras de categoría: entra todo producto cuya categoría las contenga (sin tildes).
  categorias text[] not null default '{}',
  -- Productos fijos: [{producto_id, sku, nombre, unidad, cantidad}]
  productos jsonb not null default '[]'::jsonb,
  nota text,
  orden int not null default 0,
  -- Sugerencia que Compras todavía no configuró: no avisa ni se genera hasta que se configure.
  sugerida boolean not null default false,
  ultima_ref_tipo text check (ultima_ref_tipo is null or ultima_ref_tipo in ('orden', 'compra_directa')),
  ultima_ref_id uuid,
  ultima_codigo text,
  ultima_generada_en timestamptz,
  avisada_para date,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.compras_fijas add column if not exists sugerida boolean not null default false;
alter table public.ordenes add column if not exists compra_fija_id uuid references public.compras_fijas(id) on delete set null;
alter table public.compras_directas add column if not exists compra_fija_id uuid references public.compras_fijas(id) on delete set null;

create index if not exists ordenes_compra_fija_idx on public.ordenes (compra_fija_id, created_at desc) where compra_fija_id is not null;
create index if not exists compras_directas_compra_fija_idx on public.compras_directas (compra_fija_id, created_at desc) where compra_fija_id is not null;

alter table public.compras_fijas enable row level security;

drop policy if exists "compras fijas read" on public.compras_fijas;
create policy "compras fijas read" on public.compras_fijas for select to authenticated
  using (true);

drop policy if exists "compras fijas write" on public.compras_fijas;
create policy "compras fijas write" on public.compras_fijas for all to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.compras_fijas to authenticated;
revoke all on public.compras_fijas from anon;

-- Plantillas iniciales adaptadas a MINERIA INTERNACIONAL TS, C.A.
insert into public.compras_fijas (nombre, icono, frecuencia, modo, permite_cotizar, solicitante, unidad_solicitante, finalidad, urgente, categorias, orden, activa, sugerida)
select * from (values
  ('Mercado Comedor', '🛒', 'semanal', 'solicitud', true, 'COCINA / CAMPAMENTO', 'COCINA', 'PEDIDO PARA RESTABLECER EL MERCADO', true,
     array['viver', 'proteina', 'hortaliza', 'legumbre', 'limpieza', 'higiene'], 1, true, false),
  ('Carnes y Proteínas', '🥩', 'semanal', 'solicitud', true, 'COCINA / CAMPAMENTO', 'COCINA', 'COMPRA FIJA DE CARNES Y PROTEÍNAS', false,
     array['carne', 'pollo', 'res', 'cerdo', 'pescado'], 2, false, true),
  ('Papelería y Romana', '📎', 'mensual', 'solicitud', true, 'ADMINISTRACIÓN', 'ADMINISTRACIÓN', 'COMPRA FIJA DE PAPELERÍA Y FORMATOS DE ROMANA', false,
     array['papel', 'oficina', 'romana', 'impresion'], 3, false, true),
  ('Filtros y Lubricantes', '🛢️', 'quincenal', 'solicitud', true, 'TALLER Y MANTENIMIENTO', 'TALLER', 'COMPRA FIJA DE FILTROS Y LUBRICANTES PARA PLANTA Y FLOTA', false,
     array['filtro', 'aceite', 'lubricante', 'grasa'], 4, false, true),
  ('EPP y Seguridad Minera', '🦺', 'mensual', 'solicitud', true, 'SEGURIDAD INDUSTRIAL', 'SEGURIDAD', 'DOTACIÓN Y REPOSICIÓN FIJA DE EPP PARA TRABAJADORES', false,
     array['epp', 'seguridad', 'guantes', 'botas'], 5, false, true)
) as v(nombre, icono, frecuencia, modo, permite_cotizar, solicitante, unidad_solicitante, finalidad, urgente, categorias, orden, activa, sugerida)
where not exists (select 1 from public.compras_fijas c where lower(c.nombre) = lower(v.nombre));
