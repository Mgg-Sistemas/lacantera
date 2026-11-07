/*
  COMPRAS COMO MGG · FASE 4
  RECEPCIÓN EN EL ALMACÉN GENERAL Y CIERRE EN COMPRAS

  Angélica, 07/11/2026: el módulo de compras se reemplaza por una copia exacta
  del de MGG, por fases. La fase 3 dejó la OC en «Pendiente por recepción».
  Esta fase la lleva hasta «Finalizada»:

    por_recibir ──📦 Recibir (almacén)──► recibida ──✓ Finalizar orden──► finalizada
       · contra entrega sin pagar: recibida ──💳 Indicar método (pagar lo
         recibido)──► oc_aprobada ──💵 Marcar pagada──► pagada ──✓ Finalizar──►
       · crédito con saldo: la recepción completa la deja en cuenta_abierta
         con recibida_en; saldada, se finaliza desde ahí (como MGG).

  LO QUE HACE (MGG `recibirOrdenParcial`, `finalizarPedido`, `crearEvaluacion`)

  1. RECIBE EL ALMACÉN, NO COMPRAS (la dueña). En MGG recibe Compras desde el
     detalle o el almacenista desde Inventario → Recepciones. Aquí recibe quien
     tiene INVENTARIO en escritura o el rol ALMACEN (ADMIN siempre):
     `private.compras_recibe_almacen()`. La pantalla es la del almacén
     (/app/solicitudes-pedido, pestaña «📥 Recepciones por recibir», y su vista
     de teléfono).

  2. RECEPCIÓN PARCIAL ACUMULADA. En MGG una recepción cierra la orden aunque
     haya llegado menos («la orden cierra sin saldo pendiente»). Aquí cada
     recepción (R1, R2…) suma a `items[].cantidad_recibida` y la orden sigue en
     su estado hasta que llega todo o el almacén dice «No llega más: cerrar la
     recepción con lo recibido» (entonces la nota es obligatoria, como MGG).
     Cada recepción queda en `compras_recepciones` con su detalle, sus fotos y
     la factura / nota de entrega escaneada (depósito `compras-recepciones`).

  3. ENTRA AL INVENTARIO DE ALM-GEN CON EL MECANISMO DE SIEMPRE: cada renglón
     recibido llama a `private.registrar_movimiento('ENTRADA_COMPRA', +1, …)`,
     la misma que usa `registrar_recepcion` del flujo anterior. El libro
     (`inventario_movimientos`) es el kardex: la existencia y el costo
     promedio (`private.costo_promedio`) salen de ahí. Entra
     `cantidad × factor_compra` en la unidad de uso, al costo
     `precio de la OC ($) ÷ factor_compra`. Un costo diez veces fuera de lo que
     el artículo viene costando queda marcado (`aviso_costo`), sin parar la
     recepción: el precio ya lo aprobaron en la OC.
       - No entra lo marcado «No entra al inventario» (servicio o consumo
         inmediato: por renglón o la recepción entera, MGG `sin_inventario`),
         ni un artículo no inventariable.
       - El renglón de nombre general sin ficha («Se guarda en inventario
         como» no se fijó al cotizar) se liga al recibir: a una ficha que ya
         existe o a una NUEVA, creada con `public.crear_articulo` (la misma
         regla de duplicados y de código del catálogo). MGG obliga a ligarlo
         antes de recibir; aquí el almacén lo resuelve en el momento.
       - El movimiento no lleva `orden_id` (esa columna apunta a las órdenes
         del flujo anterior): el enlace queda en `compras_recepciones.renglones[]`
         (`movimiento_id`, `movimiento_numero`) y en la nota del movimiento.

  4. RECIBIDO_TOTAL PROPORCIONAL. MGG guarda Σ recibido × precio, que en
     contra entrega deja fuera el IVA y el descuento. Aquí es el total de la OC
     por la fracción recibida (en dinero): con todo recibido es el total exacto,
     y la fase 3 paga eso en contra entrega.

  5. FINALIZAR CON EVALUACIÓN (MGG `FinalizarPedidoModal`): quien lleva Compras,
     con la orden recibida y pagada (recibida; pagada en contra entrega; o
     crédito saldado y recibido). La evaluación (calidad 1-5, puntualidad en
     días, comentario) va a `compras_evaluaciones` y alimenta el score de la
     fase 2: `compras_estadisticas_proveedores` ya usa la puntualidad y la
     calidad reales (MGG `getStatsForProveedores`).

  6. AVISOS AL SOLICITANTE. La campana de La Cantera avisa por rol. Para avisar
     a una persona (quien pidió) se agrega `notificaciones.para_usuarios`: un
     aviso sin roles y con usuarios lo ve solo esa gente (y ADMIN).

  7. LO RECIBIDO NO SE DESHACE: con mercancía ya recibida la OC no se anula ni
     cambia de proveedor (disparador `trg_recibida_no_se_deshace`).

  Sin Tesorería, sin Delivery, un solo almacén. No toca el flujo anterior.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Columnas nuevas
-- ═══════════════════════════════════════════════════════════════════════════

-- MGG `ComprobanteOcModal`: «Tipo de comprobante»: Factura / Nota de entrega.
alter table public.compras_ordenes
  add column if not exists factura_tipo text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'compras_ordenes_factura_tipo_check') then
    alter table public.compras_ordenes
      add constraint compras_ordenes_factura_tipo_check check (factura_tipo in ('factura', 'nota_entrega'));
  end if;
end $$;

comment on column public.compras_ordenes.recibido_total is
  'Lo recibido, en dinero: total de la OC × la fracción recibida (Σ recibido × precio / Σ pedido × precio). Con todo recibido es el total. En contra entrega es lo que se paga.';
comment on column public.compras_ordenes.recepcion_fotos is
  'Fotos de las recepciones: [{path, filename, recepcion}] en el depósito compras-recepciones.';

-- Avisos a personas (no a roles): ver el punto 6 de la cabecera.
alter table public.notificaciones
  add column if not exists para_usuarios uuid[] not null default '{}';

comment on column public.notificaciones.para_usuarios is
  'Avisos a personas. Un aviso sin roles y con usuarios lo ve solo esa gente (y ADMIN). Sin roles ni usuarios, lo ven todos.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Las recepciones (MGG `movimientos` con ref_tipo 'orden', y su comprobante)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.compras_recepciones (
  id                   bigint generated always as identity primary key,
  orden_id             bigint not null references public.compras_ordenes(id) on delete cascade,
  -- R1, R2… dentro de la orden; «OC-2026-0001 · R1».
  numero               integer not null check (numero > 0),
  codigo               text not null,
  -- Copias del día, para el histórico del almacén (que no lee proveedores).
  orden_codigo         text not null,
  oc_codigo            text,
  proveedor_id         bigint references public.proveedores(id) on delete set null,
  proveedor_nombre     text,
  almacen_id           bigint not null references public.almacenes(id),
  -- [{sku, nombre, articulo_id, articulo_nombre, cantidad, unidad, factor,
  --   cantidad_inventario, unidad_inventario, precio, costo_usd, valor,
  --   movimiento_id, movimiento_numero, sin_inventario, ficha_creada,
  --   marca_recibida, nota_marca, pedido, recibido}]
  renglones            jsonb not null default '[]'::jsonb,
  valor                numeric(14, 2) not null default 0,
  nota                 text,
  sin_inventario       boolean not null default false,
  -- Llegó todo (completa) o el almacén cerró la recepción con lo recibido.
  completa             boolean not null default false,
  cierra               boolean not null default false,
  -- [{nombre, falta, unidad}] lo que quedó sin llegar.
  faltan               jsonb not null default '[]'::jsonb,
  fotos                jsonb not null default '[]'::jsonb,
  documento_tipo       text check (documento_tipo in ('factura', 'nota_entrega')),
  documento_path       text,
  documento_nombre     text,
  recibida_por         uuid not null references public.perfiles(id),
  recibida_por_nombre  text,
  recibida_en          timestamptz not null default now(),

  constraint compras_recepciones_una_por_numero unique (orden_id, numero),
  constraint compras_recepciones_renglones_lista check (jsonb_typeof(renglones) = 'array'),
  constraint compras_recepciones_faltan_lista check (jsonb_typeof(faltan) = 'array'),
  constraint compras_recepciones_fotos_lista check (jsonb_typeof(fotos) = 'array' and jsonb_array_length(fotos) <= 6)
);

comment on table public.compras_recepciones is
  'Cada recepción de una OC en el almacén general (R1, R2…): qué llegó, el movimiento de inventario de cada renglón, fotos, nota y la factura / nota de entrega. Solo se escribe por funciones.';

create index if not exists compras_recepciones_orden_idx on public.compras_recepciones (orden_id, numero);
create index if not exists compras_recepciones_en_idx on public.compras_recepciones (recibida_en desc);

drop trigger if exists trg_normalizar on public.compras_recepciones;
create trigger trg_normalizar
  before insert or update on public.compras_recepciones
  for each row execute function private.normalizar_texto('nota');

drop trigger if exists trg_auditar on public.compras_recepciones;
create trigger trg_auditar
  after insert or update or delete on public.compras_recepciones
  for each row execute function private.auditar('id');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Las evaluaciones del proveedor (MGG `evaluaciones_recepcion`)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.compras_evaluaciones (
  id                   bigint generated always as identity primary key,
  orden_id             bigint not null unique references public.compras_ordenes(id) on delete cascade,
  proveedor_id         bigint not null references public.proveedores(id) on delete restrict,
  calidad              smallint not null check (calidad between 1 and 5),
  -- Firmado: + adelantado, 0 en la fecha, − atrasado (MGG).
  puntualidad_dias     integer not null check (puntualidad_dias between -365 and 365),
  fecha_prometida      date,
  fecha_recibido       date,
  comentario           text,
  evaluado_por         uuid not null references public.perfiles(id),
  evaluado_por_nombre  text,
  -- MGG: 'almacenista' | 'jefe'. Aquí finaliza Compras: 'jefe' («Jefe / analista»).
  evaluado_por_rol     text not null default 'jefe' check (evaluado_por_rol in ('almacenista', 'jefe')),
  evaluado_en          timestamptz not null default now()
);

comment on table public.compras_evaluaciones is
  'Evaluación del proveedor al finalizar la orden (MGG evaluaciones_recepcion): calidad 1-5 y puntualidad en días. Alimenta el score de las cotizaciones. Solo se escribe por funciones.';

create index if not exists compras_evaluaciones_proveedor_idx on public.compras_evaluaciones (proveedor_id);

drop trigger if exists trg_normalizar on public.compras_evaluaciones;
create trigger trg_normalizar
  before insert or update on public.compras_evaluaciones
  for each row execute function private.normalizar_texto('comentario');

drop trigger if exists trg_auditar on public.compras_evaluaciones;
create trigger trg_auditar
  after insert or update or delete on public.compras_evaluaciones
  for each row execute function private.auditar('id');

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Quién recibe y quién ve
-- ═══════════════════════════════════════════════════════════════════════════

-- Recibe el almacén: INVENTARIO en escritura o el rol ALMACEN (ADMIN pasa por
-- los dos: `tiene_rol` y `tiene_permiso` lo dejan siempre).
create or replace function private.compras_recibe_almacen()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.tiene_permiso('INVENTARIO', 'ESCRITURA') or private.tiene_rol('ALMACEN');
$$;

/*
  Lo que el almacén ve de Compras: lo que tiene por recibir (MGG: `por_recibir`
  y `pagada` sin recibir) y lo que ya recibió (para su histórico). No ve las
  órdenes por cotizar, por aprobar ni por pagar, ni los créditos que Compras
  todavía no mandó a recepción.
*/
create or replace function private.compras_almacen_ve(p public.compras_ordenes)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p.oc_codigo is not null
     and (p.estado = 'por_recibir'
          or (p.estado = 'pagada' and p.recibida_en is null)
          or p.recibido_total is not null
          or p.recibida_en is not null)
     and private.compras_recibe_almacen();
$$;

drop policy if exists compras_ordenes_lectura on public.compras_ordenes;
create policy compras_ordenes_lectura on public.compras_ordenes
  for select to authenticated
  using (
    private.tiene_permiso('COMPRAS', 'LECTURA')
    or creado_por = (select auth.uid())
    or solicitante_id = (select auth.uid())
    or ((estado = 'revision_almacen' or revisada_almacen_en is not null)
        and private.tiene_permiso('INVENTARIO', 'LECTURA'))
    or (oc_codigo is not null
        and (estado = 'por_recibir'
             or (estado = 'pagada' and recibida_en is null)
             or recibido_total is not null
             or recibida_en is not null)
        and (select private.compras_recibe_almacen()))
  );

-- La misma regla, para el chat, las fotos y los archivos (se piden por ruta).
create or replace function private.compras_puede_ver_orden(p_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.compras_ordenes o
     where o.id = p_id
       and (private.tiene_permiso('COMPRAS', 'LECTURA')
            or o.creado_por = (select auth.uid())
            or o.solicitante_id = (select auth.uid())
            or ((o.estado = 'revision_almacen' or o.revisada_almacen_en is not null)
                and private.tiene_permiso('INVENTARIO', 'LECTURA'))
            or private.compras_almacen_ve(o)));
$$;

-- Las recepciones las ve quien ve la orden; las evaluaciones, Compras.
alter table public.compras_recepciones enable row level security;

drop policy if exists compras_recepciones_lectura on public.compras_recepciones;
create policy compras_recepciones_lectura on public.compras_recepciones
  for select to authenticated
  using (private.compras_puede_ver_orden(orden_id));

revoke all on public.compras_recepciones from anon, public, authenticated;
grant select on public.compras_recepciones to authenticated;

alter table public.compras_evaluaciones enable row level security;

drop policy if exists compras_evaluaciones_lectura on public.compras_evaluaciones;
create policy compras_evaluaciones_lectura on public.compras_evaluaciones
  for select to authenticated
  using (private.tiene_permiso('COMPRAS', 'LECTURA'));

revoke all on public.compras_evaluaciones from anon, public, authenticated;
grant select on public.compras_evaluaciones to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Avisos a personas
-- ═══════════════════════════════════════════════════════════════════════════

-- Igual que antes para todo aviso sin `para_usuarios`. El que lleva usuarios y
-- no lleva roles lo ve solo esa gente (y ADMIN).
drop policy if exists notificaciones_lectura on public.notificaciones;
create policy notificaciones_lectura on public.notificaciones
  for select to authenticated
  using (
    (cardinality(roles) = 0 and cardinality(para_usuarios) = 0)
    or roles && (select public.mis_roles())
    or para_usuarios @> array[(select auth.uid())]
    or (select public.mis_roles()) @> array['ADMIN']::text[]
  );

-- «Marcar todo como leído», con la misma regla de arriba.
create or replace function public.marcar_notificaciones_leidas()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_roles text[];
  v_n integer;
begin
  if v_uid is null then
    raise exception 'Sesión no válida.' using errcode = '28000';
  end if;

  v_roles := private.roles_actuales();

  insert into public.notificaciones_leidas (notificacion_id, usuario_id)
  select n.id, v_uid
  from public.notificaciones n
  where ((cardinality(n.roles) = 0 and cardinality(n.para_usuarios) = 0)
         or n.roles && v_roles
         or v_uid = any (n.para_usuarios)
         or 'ADMIN' = any(v_roles))
  on conflict do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- El aviso de Compras para quien pidió la orden (y quien la cargó).
create or replace function private.compras_avisar_solicitante(
  p_orden public.compras_ordenes,
  p_tipo text,
  p_titulo text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuarios uuid[];
begin
  select coalesce(array_agg(distinct u), '{}') into v_usuarios
    from unnest(array[p_orden.solicitante_id, p_orden.creado_por]) u
   where u is not null;

  if cardinality(v_usuarios) = 0 then
    return;
  end if;

  insert into public.notificaciones
    (modulo, tipo, titulo, detalle, ruta, roles, importancia, actor_id, para_usuarios)
  values
    ('COMPRAS', p_tipo, p_titulo,
     nullif(btrim(concat_ws(' · ', p_orden.unidad_solicitante, p_orden.solicitante_nombre,
                            nullif(left(coalesce(p_orden.notas, ''), 140), ''))), ''),
     '/app/pedidos?detalle=' || p_orden.id, '{}', 'INFO', (select auth.uid()), v_usuarios);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Ayudantes de la recepción
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Un archivo de la recepción ya subido al depósito `compras-recepciones`:
  {path, filename}, en la carpeta de la orden y con su prefijo (foto-,
  documento-, factura-). Nulo si no viene.
*/
create or replace function private.compras_archivo_recepcion(p_archivo jsonb, p_orden_id bigint, p_prefijo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_nom  text;
begin
  if p_archivo is null or jsonb_typeof(p_archivo) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_archivo) <> 'object' then
    raise exception 'El archivo no se entiende.' using errcode = '22023';
  end if;
  v_path := coalesce(p_archivo ->> 'path', '');
  v_nom := nullif(btrim(coalesce(p_archivo ->> 'filename', '')), '');
  if v_path not like p_orden_id::text || '/' || p_prefijo || '-%' or v_nom is null then
    raise exception 'El archivo no es de esta orden.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects s where s.bucket_id = 'compras-recepciones' and s.name = v_path) then
    raise exception 'El archivo no se terminó de subir: vuelva a elegirlo.' using errcode = '22023';
  end if;
  return jsonb_build_object('path', v_path, 'filename', left(v_nom, 200));
end;
$$;

-- ¿Puede subir archivos de recepción a esta orden? El almacén mientras está
-- por recibir; Compras la factura al finalizar o después (MGG «📎 Cargar
-- factura / nota de entrega»).
create or replace function private.compras_puede_subir_recepcion(p_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_id is not null
     and exists (
       select 1 from public.compras_ordenes o
        where o.id = p_id
          and ((o.recibida_en is null
                and o.estado in ('por_recibir', 'cuenta_abierta', 'pagada')
                and private.compras_recibe_almacen())
               or (o.estado in ('recibida', 'pagada', 'cuenta_abierta', 'finalizada')
                   and private.compras_gestiona())));
$$;

-- «MARCA» en mayúscula y sin espacios de más, para comparar la pedida con la recibida.
create or replace function private.compras_norm_marca(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')), '');
$$;

-- Lo que falta por llegar de cada renglón: [{sku, nombre, falta, unidad}].
create or replace function private.compras_faltan(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'sku', i ->> 'sku',
           'nombre', i ->> 'nombre',
           'falta', round(coalesce((i ->> 'cantidad')::numeric, 0) - coalesce((i ->> 'cantidad_recibida')::numeric, 0), 4),
           'unidad', coalesce(i ->> 'unidad_compra', i ->> 'unidad')) order by n), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as e(i, n)
   where coalesce((i ->> 'comprar')::boolean, true)
     and coalesce((i ->> 'cantidad_recibida')::numeric, 0) < coalesce((i ->> 'cantidad')::numeric, 0) - 0.0001;
$$;

/*
  La fracción recibida, en dinero: Σ recibido × precio / Σ pedido × precio de
  los renglones que se compran. Con todo recibido es exactamente 1.
*/
create or replace function private.compras_fraccion_recibida(p_items jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  with x as (
    select coalesce((i ->> 'cantidad')::numeric, 0) as cant,
           coalesce((i ->> 'cantidad_recibida')::numeric, 0) as rec,
           greatest(coalesce((i ->> 'precio')::numeric, 0), 0) as precio
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
     where coalesce((i ->> 'comprar')::boolean, true)
  ), t as (
    select coalesce(sum(cant * precio), 0) as ped,
           coalesce(sum(rec * precio), 0) as rec,
           coalesce(bool_and(rec >= cant - 0.0001), false) as completo
      from x
  )
  select case when t.completo then 1::numeric
              when t.ped > 0 then least(1, t.rec / t.ped)
              else 0::numeric end
    from t;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Lo recibido no se deshace
-- ═══════════════════════════════════════════════════════════════════════════

-- Con mercancía ya en el inventario, la OC no se anula, no se cancela y no
-- cambia de proveedor (MGG: «La orden … ya tiene mercancía recibida: el
-- proveedor y los precios de su oferta aceptada ya no se pueden cambiar.» /
-- «Solo se puede anular una OC antes de pagarse o recibirse.»). Y si después
-- cambia el total (en contra entrega se corrigen precios antes de pagar), lo
-- recibido en dinero se pone al día con él.
create or replace function private.compras_recibida_no_se_deshace()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado in ('anulada', 'cancelada') and old.estado is distinct from new.estado then
    raise exception 'Solo se puede anular una OC antes de pagarse o recibirse: % ya tiene mercancía recibida.',
      coalesce(old.oc_codigo, old.codigo) using errcode = '55000';
  end if;
  if new.proveedor_id is distinct from old.proveedor_id then
    raise exception 'La orden % ya tiene mercancía recibida: el proveedor y los precios de su oferta aceptada ya no se pueden cambiar.',
      coalesce(old.oc_codigo, old.codigo) using errcode = '55000';
  end if;
  if new.recibido_total is not null
     and (new.total is distinct from old.total or new.items is distinct from old.items) then
    new.recibido_total := round(coalesce(new.total, 0) * private.compras_fraccion_recibida(new.items), 2);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recibida_no_se_deshace on public.compras_ordenes;
create trigger trg_recibida_no_se_deshace
  before update on public.compras_ordenes
  for each row
  when (old.recibido_total is not null or old.recibida_en is not null)
  execute function private.compras_recibida_no_se_deshace();

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Lo que la pantalla pregunta antes de dibujar
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.compras_mis_permisos_de_pedidos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();

  return jsonb_build_object(
    -- MGG `!soloSolicitud`: ve las pestañas de Compras.
    'compras', private.tiene_permiso('COMPRAS', 'LECTURA'),
    -- Cancela órdenes ajenas.
    'escribe', private.tiene_permiso('COMPRAS', 'ESCRITURA'),
    -- MGG `canManageProcurement` (cotizar, elegir la oferta, editar la OC, finalizar).
    'gestiona', private.compras_gestiona(),
    -- MGG `puedeAprobarOc`.
    'aprueba_oc', private.compras_aprueba_oc(),
    'revisa_almacen', private.compras_revisa_almacen(),
    -- Fase 4: recibe en el almacén general.
    'recibe_almacen', private.compras_recibe_almacen(),
    'pide_por_otro', private.puede_pedir_por_otro(),
    'yo', (select auth.uid()),
    'mi_nombre', private.compras_mi_nombre());
end;
$$;

/*
  «Recepciones por recibir» (MGG `inventario.repository.ts:560`): estado
  `por_recibir` (o `pagada` sin recibir), sin `recibida_en`, que no sea
  servicio. Con el proveedor, que el almacén no lee de su tabla. Las urgentes
  primero; después, la más vieja.
*/
create or replace function public.compras_por_recibir()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();

  -- Quien solo lee Inventario también ve la lista (MGG: «Tu rol solo puede ver»).
  if not (private.compras_recibe_almacen()
          or private.tiene_permiso('INVENTARIO', 'LECTURA')
          or private.tiene_permiso('COMPRAS', 'LECTURA')) then
    raise exception 'Sin permiso para ver las recepciones de compras.' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'orden', to_jsonb(o),
             'proveedor', p.nombre,
             'proveedor_rif', p.rif,
             'recepciones', (select count(*) from public.compras_recepciones r where r.orden_id = o.id))
           order by o.urgente desc, coalesce(o.pagada_en, o.oc_aprobada_en, o.creado_en)), '[]'::jsonb)
      from public.compras_ordenes o
      left join public.proveedores p on p.id = o.proveedor_id
     where o.oc_codigo is not null
       and o.recibida_en is null
       and o.clase <> 'servicio'
       and (o.estado = 'por_recibir' or o.estado = 'pagada'));
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. 📦 Recibir (MGG `recibirOrdenParcial`)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  p_datos = {
    renglones: [{
      sku,
      cantidad,                       (lo que llegó AHORA, en la unidad de compra)
      marca_recibida?, nota_marca?,   (si llegó otra marca, la nota es obligatoria)
      sin_inventario?,                (este renglón no entra al stock)
      ficha?: {articulo_id} | {crear: {nombre, categoria, unidad, confirmado?}}
                                      (renglón de nombre general sin ficha)
    }],
    nota, sin_inventario (toda la recepción), cerrar (no llega más),
    fotos: [{path, filename}] (hasta 4), documento: {path, filename, tipo} | null
  }

  Estados recibibles (MGG): `por_recibir`, `cuenta_abierta`, `pagada`, sin
  `recibida_en`. Al cerrar la recepción (llegó todo o «no llega más»):
    crédito con saldo → `cuenta_abierta` (con recibida_en; los abonos siguen)
    el resto          → `recibida`
  Una recepción parcial deja la orden en su estado, con lo recibido acumulado.
*/
create or replace function public.compras_recibir_orden(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o          public.compras_ordenes;
  v_alm        bigint;
  v_lista      jsonb;
  v_x          jsonb;
  v_it         jsonb;
  v_items      jsonb;
  v_sku        text;
  v_nombre     text;
  v_cant       numeric;
  v_pedido     numeric;
  v_previo     numeric;
  v_factor     numeric;
  v_uso        numeric;
  v_precio     numeric;
  v_costo      numeric;
  v_ucompra    text;
  v_art        public.articulos;
  v_art_id     bigint;
  v_ficha      jsonb;
  v_crear      jsonb;
  v_creada     boolean;
  v_cat        text;
  v_uni        text;
  v_sin_orden  boolean;
  v_sin        boolean;
  v_marca      text;
  v_marca_ped  text;
  v_nota_marca text;
  v_ref        numeric;
  v_veces      numeric;
  v_mov        bigint;
  v_mov_num    text;
  v_n          integer;
  v_oc         text;
  v_codigo     text;
  v_prov       text;
  v_ren        jsonb := '[]'::jsonb;
  v_hay        boolean := false;
  v_completa   boolean;
  v_cerrar     boolean;
  v_cierra     boolean;
  v_nota       text;
  v_fotos      jsonb := '[]'::jsonb;
  v_f          jsonb;
  v_doc        jsonb;
  v_doc_tipo   text;
  v_valor      numeric := 0;
  v_rec_total  numeric;
  v_estado     text;
  v_faltan     jsonb;
  v_rec_id     bigint;
  v_vistos     text[] := '{}';
  v_creadas    text[] := '{}';
  v_marcas     text[] := '{}';
  v_titulo     text;
  v_tmp        public.compras_ordenes;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_recibe_almacen() then
    raise exception 'La mercancía la recibe el almacén: hace falta Inventario en escritura o el rol de almacén.'
      using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos de la recepción.' using errcode = '22023';
  end if;

  v_alm := private.almacen_que_revisa_pedidos();
  if v_alm is null then
    raise exception 'No está el almacén general (ALM-GEN), o está apagado.' using errcode = '23503';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.recibida_en is not null then
    raise exception 'Esta orden ya fue recibida.' using errcode = '55000';
  end if;
  if v_o.oc_codigo is null or v_o.estado not in ('por_recibir', 'cuenta_abierta', 'pagada') then
    raise exception 'La orden no está en un estado recibible.' using errcode = '55000';
  end if;

  v_lista := coalesce(p_datos -> 'renglones', '[]'::jsonb);
  if jsonb_typeof(v_lista) <> 'array' then
    raise exception 'Los renglones de la recepción van en una lista.' using errcode = '22023';
  end if;

  v_cerrar := coalesce((p_datos ->> 'cerrar')::boolean, false);
  -- MGG: «No sumar al inventario» (la recepción entera) y el servicio, que nunca entra.
  v_sin_orden := coalesce((p_datos ->> 'sin_inventario')::boolean, false) or v_o.sin_inventario or v_o.clase = 'servicio';
  v_nota := nullif(btrim(coalesce(p_datos ->> 'nota', '')), '');
  if length(coalesce(v_nota, '')) > 500 then
    raise exception 'La nota va en 500 letras como mucho.' using errcode = '22023';
  end if;

  -- Fotos (hasta 4, MGG teléfono) y la factura / nota de entrega escaneada.
  if p_datos ? 'fotos' and jsonb_typeof(p_datos -> 'fotos') = 'array' then
    if jsonb_array_length(p_datos -> 'fotos') > 4 then
      raise exception 'Hasta 4 fotos por recepción.' using errcode = '22023';
    end if;
    for v_f in select * from jsonb_array_elements(p_datos -> 'fotos') loop
      v_fotos := v_fotos || jsonb_build_array(private.compras_archivo_recepcion(v_f, p_id, 'foto'));
    end loop;
  end if;
  v_doc := private.compras_archivo_recepcion(p_datos -> 'documento', p_id, 'documento');
  if v_doc is not null then
    v_doc_tipo := coalesce(nullif(btrim(coalesce(p_datos -> 'documento' ->> 'tipo', '')), ''), 'factura');
    if v_doc_tipo not in ('factura', 'nota_entrega') then
      raise exception 'El documento es Factura o Nota de entrega.' using errcode = '22023';
    end if;
  end if;

  select coalesce(max(r.numero), 0) + 1 into v_n from public.compras_recepciones r where r.orden_id = p_id;
  v_oc := coalesce(v_o.oc_codigo, v_o.codigo);
  v_codigo := format('%s · R%s', v_oc, v_n);
  select p.nombre into v_prov from public.proveedores p where p.id = v_o.proveedor_id;

  v_items := v_o.items;

  for v_x in select * from jsonb_array_elements(v_lista) loop
    if jsonb_typeof(v_x) <> 'object' then
      raise exception 'Un renglón de la recepción no se entiende.' using errcode = '22023';
    end if;
    v_sku := nullif(btrim(coalesce(v_x ->> 'sku', '')), '');
    if v_sku is null or v_sku = any (v_vistos) then
      raise exception 'Un renglón viene vacío o dos veces en la recepción.' using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_sku;

    select i into v_it
      from jsonb_array_elements(v_items) i
     where i ->> 'sku' = v_sku and coalesce((i ->> 'comprar')::boolean, true)
     limit 1;
    if v_it is null then
      raise exception 'Ese renglón no es de esta orden.' using errcode = '22023';
    end if;
    v_nombre := v_it ->> 'nombre';

    begin
      v_cant := round(coalesce(nullif(btrim(coalesce(v_x ->> 'cantidad', '')), '')::numeric, 0), 4);
    exception when others then
      raise exception '«%»: la cantidad recibida no se entiende.', v_nombre using errcode = '22023';
    end;
    if v_cant < 0 then
      raise exception '«%»: la cantidad recibida no puede ser negativa.', v_nombre using errcode = '22023';
    end if;
    if v_cant = 0 then
      continue;
    end if;

    v_pedido := coalesce((v_it ->> 'cantidad')::numeric, 0);
    v_previo := coalesce((v_it ->> 'cantidad_recibida')::numeric, 0);
    if v_previo + v_cant > v_pedido + 0.0001 then
      raise exception 'No podés recibir más de lo pedido en %.', v_nombre using errcode = '22023';
    end if;

    -- La marca con la que llegó. Si es otra, la nota es obligatoria (MGG `marcaRecibida.ts`).
    v_marca := private.compras_norm_marca(v_x ->> 'marca_recibida');
    v_marca_ped := private.compras_norm_marca(v_it ->> 'marca');
    v_nota_marca := nullif(btrim(coalesce(v_x ->> 'nota_marca', '')), '');
    if v_marca is not null and v_marca is not distinct from v_marca_ped then
      v_marca := null;
    end if;
    if v_marca is not null and v_marca_ped is not null and length(coalesce(v_nota_marca, '')) < 3 then
      raise exception '%: llegó % en vez de %. Escribí una nota corta explicando el cambio de marca.',
        v_nombre, v_marca, v_marca_ped using errcode = '22023';
    end if;
    if v_marca is not null and v_marca_ped is not null then
      v_marcas := v_marcas || v_nombre;
    end if;

    v_sin := v_sin_orden or coalesce((v_x ->> 'sin_inventario')::boolean, false)
             or coalesce((v_it ->> 'sin_inventario')::boolean, false);

    -- La ficha: la del renglón; si es de nombre general, la que diga el almacén.
    v_art := null;
    v_creada := false;
    v_art_id := nullif(btrim(coalesce(v_it ->> 'articulo_id', '')), '')::bigint;
    if v_art_id is null and not v_sin then
      v_ficha := v_x -> 'ficha';
      if v_ficha is not null and jsonb_typeof(v_ficha) = 'object' and nullif(btrim(coalesce(v_ficha ->> 'articulo_id', '')), '') is not null then
        v_art_id := (v_ficha ->> 'articulo_id')::bigint;
      elsif v_ficha is not null and jsonb_typeof(v_ficha -> 'crear') = 'object' then
        v_crear := v_ficha -> 'crear';
        v_cat := upper(nullif(btrim(coalesce(v_crear ->> 'categoria', '')), ''));
        v_uni := upper(coalesce(nullif(btrim(coalesce(v_crear ->> 'unidad', '')), ''), v_it ->> 'unidad'));
        if v_cat is null or not exists (select 1 from public.categorias_articulo c where c.codigo = v_cat) then
          raise exception 'Elegí la categoría de la ficha nueva de «%».', v_nombre using errcode = '22023';
        end if;
        if v_uni is null or not exists (select 1 from public.unidades u where u.codigo = v_uni) then
          raise exception '«%»: elegí la unidad de la ficha nueva (la de uso, en la que se cuenta en el almacén).', v_nombre
            using errcode = '22023';
        end if;
        v_art_id := public.crear_articulo(
          p_codigo => null,
          p_nombre => coalesce(nullif(btrim(coalesce(v_crear ->> 'nombre', '')), ''), v_nombre),
          p_categoria => v_cat,
          p_unidad => v_uni,
          p_marca => coalesce(v_marca, v_marca_ped),
          p_confirmado => coalesce((v_crear ->> 'confirmado')::boolean, false));
        v_creada := true;
      else
        raise exception '%: sin ficha de inventario. Elegí con qué nombre se guarda en inventario: una ficha que ya existe o una nueva.',
          v_nombre using errcode = '22023';
      end if;
    end if;

    if v_art_id is not null then
      select a.* into v_art from public.articulos a where a.id = v_art_id;
      if v_art.id is null or not v_art.activo then
        raise exception '«%»: ese artículo no existe en el inventario o está inactivo.', v_nombre using errcode = '23503';
      end if;
      if v_creada then
        v_creadas := v_creadas || v_art.nombre;
      end if;
    end if;

    -- Al inventario: en la unidad de uso, al costo por unidad de uso, en $.
    v_ucompra := nullif(btrim(coalesce(v_it ->> 'unidad_compra', '')), '');
    v_factor := case when v_ucompra is not null then coalesce(nullif((v_it ->> 'factor_compra')::numeric, 0), 1) else 1 end;
    v_uso := round(v_cant * v_factor, 4);
    v_precio := greatest(coalesce((v_it ->> 'precio')::numeric, 0), 0);
    v_costo := round(v_precio / v_factor, 6);
    v_mov := null;
    v_mov_num := null;
    v_veces := null;

    if not v_sin and v_art.id is not null and v_art.inventariable then
      -- La misma reja de costo que la entrada: diez veces fuera de lo que viene
      -- costando queda marcado. No para: el precio ya se aprobó en la OC.
      v_ref := private.costo_promedio(v_alm, v_art.id);
      if coalesce(v_ref, 0) > 0 and v_costo > 0 then
        v_veces := round(v_costo / v_ref, 2);
        if v_veces < 10 and v_veces > 0.1 then
          v_veces := null;
        end if;
      end if;

      v_mov := private.registrar_movimiento(
        p_tipo        => 'ENTRADA_COMPRA',
        p_signo       => 1,
        p_almacen     => v_alm,
        p_articulo    => v_art.id,
        p_cantidad    => v_uso,
        p_costo_usd   => v_costo,
        p_nota        => concat_ws(' · ', 'Recepción ' || v_codigo, v_o.codigo, v_prov,
                           case when v_ucompra is not null
                                then format('%s %s × %s = %s %s', private.cantidad_es(v_cant), v_ucompra,
                                            private.cantidad_es(v_factor), private.cantidad_es(v_uso), v_art.unidad) end,
                           case when v_marca is not null then 'llegó marca ' || v_marca end),
        p_aviso_costo => v_veces);
      select m.numero into v_mov_num from public.inventario_movimientos m where m.id = v_mov;
    end if;

    v_valor := v_valor + v_cant * v_precio;

    -- El renglón de la OC: lo recibido acumulado, la marca y la ficha si se ligó ahora.
    select jsonb_agg(case when i ->> 'sku' = v_sku and coalesce((i ->> 'comprar')::boolean, true)
                          then i
                               || jsonb_build_object('cantidad_recibida', round(v_previo + v_cant, 4))
                               || case when v_marca is not null
                                       then jsonb_build_object('marca_recibida', v_marca, 'nota_marca', v_nota_marca)
                                       else '{}'::jsonb end
                               || case when coalesce((v_x ->> 'sin_inventario')::boolean, false)
                                       then jsonb_build_object('sin_inventario', true) else '{}'::jsonb end
                               || case when (i ->> 'articulo_id') is null and v_art.id is not null
                                       then jsonb_build_object('articulo_id', v_art.id, 'articulo_nombre', v_art.nombre)
                                            || case when v_creada then jsonb_build_object('ficha_creada', true) else '{}'::jsonb end
                                       else '{}'::jsonb end
                          else i end order by n)
      into v_items
      from jsonb_array_elements(v_items) with ordinality as e(i, n);

    v_ren := v_ren || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'sku', v_sku,
      'nombre', v_nombre,
      'articulo_id', v_art.id,
      'articulo_nombre', v_art.nombre,
      'cantidad', v_cant,
      'unidad', coalesce(v_ucompra, v_it ->> 'unidad'),
      'factor', case when v_ucompra is not null then v_factor end,
      'cantidad_inventario', case when v_mov is not null then v_uso end,
      'unidad_inventario', case when v_mov is not null then v_art.unidad end,
      'precio', v_precio,
      'costo_usd', case when v_mov is not null then v_costo end,
      'valor', round(v_cant * v_precio, 2),
      'movimiento_id', v_mov,
      'movimiento_numero', v_mov_num,
      'aviso_costo', v_veces,
      'sin_inventario', case when v_sin or (v_art.id is not null and not v_art.inventariable) then true end,
      'ficha_creada', case when v_creada then true end,
      'marca_recibida', v_marca,
      'nota_marca', case when v_marca is not null then v_nota_marca end,
      'pedido', v_pedido,
      'recibido', round(v_previo + v_cant, 4))));
    v_hay := true;
  end loop;

  -- Al menos una cantidad. Cerrar sin mercancía nueva solo después de una recepción.
  if not v_hay and not (v_cerrar and v_o.recibido_total is not null) then
    raise exception 'Indicá al menos una cantidad recibida.' using errcode = '22023';
  end if;

  v_faltan := private.compras_faltan(v_items);
  v_completa := jsonb_array_length(v_faltan) = 0;
  v_cierra := v_completa or v_cerrar;

  if v_cierra and not v_completa and v_nota is null then
    raise exception 'Recibiste menos de lo pedido: indicá una nota explicando la diferencia.' using errcode = '22023';
  end if;

  -- Lo recibido en dinero: el total de la OC por la fracción recibida.
  v_rec_total := round(coalesce(v_o.total, 0) * private.compras_fraccion_recibida(v_items), 2);

  insert into public.compras_recepciones
    (orden_id, numero, codigo, orden_codigo, oc_codigo, proveedor_id, proveedor_nombre, almacen_id,
     renglones, valor, nota, sin_inventario, completa, cierra, faltan, fotos,
     documento_tipo, documento_path, documento_nombre, recibida_por, recibida_por_nombre)
  values
    (p_id, v_n, v_codigo, v_o.codigo, v_o.oc_codigo, v_o.proveedor_id, v_prov, v_alm,
     v_ren, round(v_valor, 2), v_nota, coalesce((p_datos ->> 'sin_inventario')::boolean, false), v_completa, v_cierra,
     v_faltan, v_fotos, v_doc_tipo, v_doc ->> 'path', v_doc ->> 'filename',
     (select auth.uid()), private.compras_mi_nombre())
  returning id into v_rec_id;

  -- El estado: solo cambia al cerrar la recepción (MGG).
  v_estado := v_o.estado;
  if v_cierra then
    v_tmp := v_o;
    v_tmp.items := v_items;
    v_tmp.recibido_total := v_rec_total;
    v_estado := case when v_o.condiciones_pago = 'credito' and v_o.pagada_en is null
                           and private.compras_saldo_credito(v_tmp) > 0.01
                     then 'cuenta_abierta' else 'recibida' end;
  end if;

  update public.compras_ordenes
     set estado = v_estado,
         items = v_items,
         recibido_total = v_rec_total,
         sin_inventario = sin_inventario or coalesce((p_datos ->> 'sin_inventario')::boolean, false),
         nota_recepcion = case
                            when v_nota is not null then concat_ws(E'\n', nota_recepcion, format('R%s: %s', v_n, v_nota))
                            when v_cierra and not v_completa and nota_recepcion is null
                              then 'Recepción parcial: llegó menos de lo solicitado.'
                            else nota_recepcion end,
         recepcion_fotos = coalesce(recepcion_fotos, '[]'::jsonb)
                           || coalesce((select jsonb_agg(f || jsonb_build_object('recepcion', v_n))
                                          from jsonb_array_elements(v_fotos) f), '[]'::jsonb),
         factura_path = coalesce(v_doc ->> 'path', factura_path),
         factura_nombre = coalesce(v_doc ->> 'filename', factura_nombre),
         factura_tipo = coalesce(v_doc_tipo, factura_tipo),
         recibida_por = case when v_cierra then (select auth.uid()) else recibida_por end,
         recibida_por_nombre = case when v_cierra then private.compras_mi_nombre() else recibida_por_nombre end,
         recibida_en = case when v_cierra then now() else recibida_en end,
         historial = historial || private.compras_evento(
           case when v_cierra then 'recibida' else 'recibida_parcial' end,
           jsonb_strip_nulls(jsonb_build_object(
             'recepcion', v_codigo,
             'recepcion_id', v_rec_id,
             'numero', v_n,
             'almacen', 'ALM-GEN',
             'renglones', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                             'nombre', r ->> 'nombre', 'cantidad', r -> 'cantidad', 'unidad', r ->> 'unidad',
                             'pedido', r -> 'pedido', 'recibido', r -> 'recibido',
                             'movimiento', r ->> 'movimiento_numero'))), '[]'::jsonb)
                             from jsonb_array_elements(v_ren) r),
             'valor', round(v_valor, 2),
             'recibido_total', v_rec_total,
             'faltan', case when jsonb_array_length(v_faltan) > 0 then v_faltan end,
             'parcial', not v_completa,
             'cerrada_sin_completar', case when v_cierra and not v_completa then true end,
             'nota', v_nota,
             'sin_inventario', case when coalesce((p_datos ->> 'sin_inventario')::boolean, false) then true end,
             'fichas_creadas', case when cardinality(v_creadas) > 0 then to_jsonb(v_creadas) end,
             'marcas_cambiadas', case when cardinality(v_marcas) > 0 then to_jsonb(v_marcas) end,
             'fotos', case when jsonb_array_length(v_fotos) > 0 then jsonb_array_length(v_fotos) end,
             'documento', v_doc ->> 'filename',
             'a', case when v_cierra then v_estado end)))
   where id = p_id
  returning * into v_o;

  -- Una sub-OC: la madre se resuelve como en MGG (sigue «Repartida entre
  -- proveedores» mientras sus hijas vivan; cada una se recibe por separado).
  if v_o.parent_orden_id is not null then
    perform private.compras_reestado_madre(v_o.parent_orden_id);
  end if;

  -- MGG: «Mercancía recibida · {código} · stock actualizado», o «Recepción
  -- confirmada · {código} · …» en contra entrega y sin inventario.
  v_titulo := case
    when not v_cierra then
      format('Recepción parcial · %s · R%s · falta por recibir', v_oc, v_n)
    when v_o.condiciones_pago = 'contra_entrega' and v_o.pagada_en is null then
      format('Recepción confirmada · %s · indicá el método para pagar lo recibido', v_oc)
    when v_sin_orden then
      format('Recepción confirmada · %s · sin sumar al inventario (carga manual)', v_oc)
    else
      format('Mercancía recibida · %s · stock actualizado', v_oc) end;

  perform private.compras_avisar(v_o, case when v_cierra then 'OC_RECIBIDA' else 'OC_RECIBIDA_PARCIAL' end,
    v_titulo, array['COMPRAS'], '/app/pedidos',
    case when v_cierra and v_o.condiciones_pago = 'contra_entrega' and v_o.pagada_en is null then 'ATENCION' else 'INFO' end);
  perform private.compras_avisar_solicitante(v_o, case when v_cierra then 'OC_RECIBIDA' else 'OC_RECIBIDA_PARCIAL' end,
    case when v_cierra then format('Tu pedido %s llegó al Almacén General', v_o.codigo)
         else format('Tu pedido %s llegó en parte al Almacén General', v_o.codigo) end);

  return jsonb_build_object(
    'id', v_o.id,
    'estado', v_o.estado,
    'recepcion_id', v_rec_id,
    'codigo', v_codigo,
    'numero', v_n,
    'completa', v_completa,
    'cerrada', v_cierra,
    'valor', round(v_valor, 2),
    'recibido_total', v_rec_total);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. ✓ Finalizar orden con la evaluación del proveedor
-- ═══════════════════════════════════════════════════════════════════════════

/*
  MGG `finalizarPedido` + `crearEvaluacion`. Quien lleva Compras, con la orden
  recibida y pagada:
    - `recibida` (contado o anticipado ya pagados; crédito saldado);
    - `pagada` y recibida (contra entrega);
    - `cuenta_abierta` saldada y recibida (crédito).
  p_datos = {calidad 1-5, puntualidad_dias, fecha_prometida?, fecha_recibido?,
             comentario?, factura: {path, filename, tipo?} | null}
*/
create or replace function public.compras_finalizar_orden(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o        public.compras_ordenes;
  v_cal      integer;
  v_dias     integer;
  v_fprom    date;
  v_frec     date;
  v_com      text;
  v_fac      jsonb;
  v_fac_tipo text;
  v_ev       bigint;
  v_oc       text;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'La orden la finaliza quien lleva Compras (Compras en total) o un administrador.' using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos de la evaluación.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.recibida_en is null or v_o.estado not in ('recibida', 'pagada', 'cuenta_abierta') then
    raise exception 'Solo se finaliza una orden ya recibida' using errcode = '55000';
  end if;
  if v_o.pagada_en is null then
    raise exception 'La orden % todavía no está pagada: se finaliza recibida y pagada.',
      coalesce(v_o.oc_codigo, v_o.codigo) using errcode = '55000';
  end if;

  begin
    v_cal := nullif(btrim(coalesce(p_datos ->> 'calidad', '')), '')::integer;
    v_dias := nullif(btrim(coalesce(p_datos ->> 'puntualidad_dias', '')), '')::integer;
    v_fprom := nullif(btrim(coalesce(p_datos ->> 'fecha_prometida', '')), '')::date;
    v_frec := nullif(btrim(coalesce(p_datos ->> 'fecha_recibido', '')), '')::date;
  exception when others then
    raise exception 'La calidad, la puntualidad o una fecha no se entienden.' using errcode = '22023';
  end;

  if v_cal is null or v_cal not between 1 and 5 then
    raise exception 'Indicá la calidad a evaluar (1 a 5).' using errcode = '22023';
  end if;
  if v_dias is null then
    if v_fprom is null or v_frec is null then
      raise exception 'Indicá la fecha prometida y la de recibido.' using errcode = '22023';
    end if;
    v_dias := v_fprom - v_frec;
  end if;
  if v_dias not between -365 and 365 then
    raise exception 'La puntualidad va en días, entre un año de adelanto y uno de atraso.' using errcode = '22023';
  end if;

  v_com := nullif(btrim(coalesce(p_datos ->> 'comentario', '')), '');
  if length(coalesce(v_com, '')) > 500 then
    raise exception 'El comentario va en 500 letras como mucho.' using errcode = '22023';
  end if;

  v_fac := private.compras_archivo_recepcion(p_datos -> 'factura', p_id, 'factura');
  if v_fac is not null then
    v_fac_tipo := coalesce(nullif(btrim(coalesce(p_datos -> 'factura' ->> 'tipo', '')), ''), 'factura');
    if v_fac_tipo not in ('factura', 'nota_entrega') then
      raise exception 'El documento es Factura o Nota de entrega.' using errcode = '22023';
    end if;
  end if;

  if v_o.proveedor_id is not null then
    insert into public.compras_evaluaciones
      (orden_id, proveedor_id, calidad, puntualidad_dias, fecha_prometida, fecha_recibido, comentario,
       evaluado_por, evaluado_por_nombre, evaluado_por_rol)
    values
      (p_id, v_o.proveedor_id, v_cal, v_dias, v_fprom, v_frec, v_com,
       (select auth.uid()), private.compras_mi_nombre(), 'jefe')
    on conflict (orden_id) do update
      set calidad = excluded.calidad,
          puntualidad_dias = excluded.puntualidad_dias,
          fecha_prometida = excluded.fecha_prometida,
          fecha_recibido = excluded.fecha_recibido,
          comentario = excluded.comentario,
          evaluado_por = excluded.evaluado_por,
          evaluado_por_nombre = excluded.evaluado_por_nombre,
          evaluado_en = now()
    returning id into v_ev;
  end if;

  v_oc := coalesce(v_o.oc_codigo, v_o.codigo);

  update public.compras_ordenes
     set estado = 'finalizada',
         finalizada_por = (select auth.uid()),
         finalizada_por_nombre = private.compras_mi_nombre(),
         finalizada_en = now(),
         factura_path = coalesce(v_fac ->> 'path', factura_path),
         factura_nombre = coalesce(v_fac ->> 'filename', factura_nombre),
         factura_tipo = coalesce(v_fac_tipo, factura_tipo),
         historial = historial
                     || case when v_ev is not null then private.compras_evento('evaluacion', jsonb_strip_nulls(jsonb_build_object(
                          'evaluacion_id', v_ev,
                          'calidad', v_cal,
                          'puntualidad_dias', v_dias,
                          'fecha_prometida', v_fprom,
                          'fecha_recibido', v_frec,
                          'comentario', v_com,
                          'proveedor', private.compras_texto_proveedor(v_o.proveedor_id)))) else '[]'::jsonb end
                     || private.compras_evento('finalizada', jsonb_strip_nulls(jsonb_build_object(
                          'desde', v_o.estado,
                          'recibido_total', v_o.recibido_total,
                          'factura', v_fac ->> 'filename')))
   where id = p_id
  returning * into v_o;

  if v_o.parent_orden_id is not null then
    perform private.compras_reestado_madre(v_o.parent_orden_id);
  end if;

  -- MGG: «Pedido finalizado · {código}».
  perform private.compras_avisar_solicitante(v_o, 'OC_FINALIZADA', format('Pedido finalizado · %s', v_o.codigo));

  return jsonb_build_object('id', v_o.id, 'estado', v_o.estado, 'evaluacion_id', v_ev);
end;
$$;

/*
  «📎 Cargar factura / nota de entrega» («Reemplazar factura / nota» si ya
  hay), MGG `adjuntarComprobanteOc`: Compras, con la orden recibida o ya
  finalizada. Sin Retenciones: solo queda el soporte en la orden.
*/
create or replace function public.compras_adjuntar_comprobante(p_id bigint, p_archivo jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o    public.compras_ordenes;
  v_fac  jsonb;
  v_tipo text;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'El comprobante lo carga quien lleva Compras (Compras en total) o un administrador.' using errcode = '42501';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.recibida_en is null and v_o.estado <> 'finalizada' then
    raise exception 'El comprobante se carga con la mercancía ya recibida.' using errcode = '55000';
  end if;

  v_fac := private.compras_archivo_recepcion(p_archivo, p_id, 'factura');
  if v_fac is null then
    raise exception 'Elegí el archivo (PDF o imagen).' using errcode = '22023';
  end if;
  v_tipo := coalesce(nullif(btrim(coalesce(p_archivo ->> 'tipo', '')), ''), 'factura');
  if v_tipo not in ('factura', 'nota_entrega') then
    raise exception 'El documento es Factura o Nota de entrega.' using errcode = '22023';
  end if;

  update public.compras_ordenes
     set factura_path = v_fac ->> 'path',
         factura_nombre = v_fac ->> 'filename',
         factura_tipo = v_tipo,
         historial = historial || private.compras_evento('comprobante_adjunto', jsonb_build_object(
           'tipo', v_tipo, 'archivo', v_fac ->> 'filename', 'reemplaza', v_o.factura_nombre))
   where id = p_id;

  return jsonb_build_object('id', p_id, 'factura_path', v_fac ->> 'path', 'factura_tipo', v_tipo);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. El score con las evaluaciones (MGG `getStatsForProveedores`)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Puntualidad = evaluaciones con puntualidad_dias ≥ 0 / total; calidad = el
  promedio. Sin evaluaciones, las neutras de MGG (50 % y 3/5). El cumplimiento
  sigue saliendo de las veces que el proveedor desistió (fase 2).
*/
create or replace function public.compras_estadisticas_proveedores()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();

  if not private.tiene_permiso('COMPRAS', 'LECTURA') then
    raise exception 'Sin permiso para ver Compras.' using errcode = '42501';
  end if;

  return (
    with ofertas as (
      select f.proveedor_id,
             count(*) filter (where f.estado = 'aceptada' or f.motivo_descarte like 'PROVEEDOR DESISTIO%') as total,
             count(*) filter (where f.motivo_descarte like 'PROVEEDOR DESISTIO%') as desistidas
        from public.compras_ofertas f
       group by f.proveedor_id
    ), evals as (
      select e.proveedor_id,
             count(*) as n,
             avg(e.calidad)::numeric as calidad,
             (count(*) filter (where e.puntualidad_dias >= 0))::numeric / count(*) as puntual
        from public.compras_evaluaciones e
       group by e.proveedor_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'proveedor_id', coalesce(t.proveedor_id, v.proveedor_id),
             'puntualidad_pct', coalesce(round(v.puntual, 4), 0.5),
             'calidad_avg', coalesce(round(v.calidad, 2), 3),
             'cumplimiento_pct', case when coalesce(t.total, 0) > 0 then greatest(0, 1 - t.desistidas::numeric / t.total) else 1 end,
             'total_evaluaciones', coalesce(v.n, 0),
             'total_ordenes', coalesce(t.total, 0))), '[]'::jsonb)
      from ofertas t
      full join evals v on v.proveedor_id = t.proveedor_id);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. Los archivos de la recepción: un depósito privado
-- ═══════════════════════════════════════════════════════════════════════════

-- Rutas `{orden_id}/{foto|documento|factura}-{nonce}-{archivo}`. Se ven si se
-- ve la orden; los sube y los borra el almacén mientras recibe, y Compras la
-- factura al finalizar. PDF o imagen, 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compras-recepciones', 'compras-recepciones', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists compras_recepciones_archivos_lectura on storage.objects;
drop policy if exists compras_recepciones_archivos_subida on storage.objects;
drop policy if exists compras_recepciones_archivos_borrado on storage.objects;

create policy compras_recepciones_archivos_lectura on storage.objects
  for select to authenticated
  using (bucket_id = 'compras-recepciones'
         and private.compras_puede_ver_orden(private.compras_orden_de_ruta(name)));

create policy compras_recepciones_archivos_subida on storage.objects
  for insert to authenticated
  with check (bucket_id = 'compras-recepciones'
              and private.compras_puede_subir_recepcion(private.compras_orden_de_ruta(name)));

create policy compras_recepciones_archivos_borrado on storage.objects
  for delete to authenticated
  using (bucket_id = 'compras-recepciones'
         and private.compras_puede_subir_recepcion(private.compras_orden_de_ruta(name)));

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. Auditoría y tiempo real
-- ═══════════════════════════════════════════════════════════════════════════

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    return;
  end if;
  insert into public.auditoria_modulos (tabla, modulo) values
    ('compras_recepciones', 'COMPRAS'),
    ('compras_evaluaciones', 'COMPRAS')
  on conflict (tabla) do update set modulo = excluded.modulo;
end
$mapa$;

do $vivo$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['compras_recepciones', 'compras_evaluaciones'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$vivo$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. Permisos de las funciones
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  f text;
begin
  foreach f in array array[
    'private.compras_recibe_almacen()',
    'private.compras_almacen_ve(public.compras_ordenes)',
    'private.compras_avisar_solicitante(public.compras_ordenes, text, text)',
    'private.compras_archivo_recepcion(jsonb, bigint, text)',
    'private.compras_norm_marca(text)',
    'private.compras_faltan(jsonb)',
    'private.compras_fraccion_recibida(jsonb)',
    'private.compras_recibida_no_se_deshace()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Las que leen las políticas (de la tabla y del depósito): las evalúa quien consulta.
revoke all on function private.compras_recibe_almacen() from public, anon;
grant execute on function private.compras_recibe_almacen() to authenticated;
revoke all on function private.compras_almacen_ve(public.compras_ordenes) from public, anon;
grant execute on function private.compras_almacen_ve(public.compras_ordenes) to authenticated;
revoke all on function private.compras_puede_ver_orden(bigint) from public, anon;
grant execute on function private.compras_puede_ver_orden(bigint) to authenticated;
revoke all on function private.compras_puede_subir_recepcion(bigint) from public, anon;
grant execute on function private.compras_puede_subir_recepcion(bigint) to authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.compras_mis_permisos_de_pedidos()',
    'public.compras_por_recibir()',
    'public.compras_recibir_orden(bigint, jsonb)',
    'public.compras_finalizar_orden(bigint, jsonb)',
    'public.compras_adjuntar_comprobante(bigint, jsonb)',
    'public.compras_estadisticas_proveedores()',
    'public.marcar_notificaciones_leidas()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 15. Comprobación (no escribe nada)
-- ═══════════════════════════════════════════════════════════════════════════

do $ver$
declare
  t   text;
  v_f jsonb;
begin
  foreach t in array array['public.compras_recepciones', 'public.compras_evaluaciones'] loop
    if has_table_privilege('authenticated', t, 'INSERT')
       or has_table_privilege('authenticated', t, 'UPDATE')
       or has_table_privilege('authenticated', t, 'DELETE') then
      raise exception '% no puede escribirse directo: todo pasa por las funciones.', t;
    end if;
  end loop;

  -- La recepción llama por nombre de parámetro a estas dos: si cambian de firma, hay que revisarla.
  if to_regprocedure('private.registrar_movimiento(text, integer, bigint, bigint, numeric, numeric, text, bigint, bigint, bigint, date, bigint, text, text, numeric, numeric, text, numeric, numeric, text, text, text, text, bigint, text, text, bigint)') is null then
    raise exception 'registrar_movimiento cambió de firma: la recepción la llama por nombre de parámetro, revísela.';
  end if;
  if to_regprocedure('public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean, numeric)') is null then
    raise exception 'crear_articulo cambió de firma: la ficha nueva al recibir la llama por nombre de parámetro, revísela.';
  end if;
  if private.almacen_que_revisa_pedidos() is null then
    raise notice 'No hay ALM-GEN activo: las órdenes no se podrán recibir hasta que exista.';
  end if;

  -- Lo que falta por llegar: 10 pedidos, 4 recibidos → faltan 6; el completo no sale.
  v_f := private.compras_faltan('[{"sku":"A","nombre":"X","cantidad":10,"cantidad_recibida":4,"unidad":"UND"},
                                  {"sku":"B","nombre":"Y","cantidad":2,"cantidad_recibida":2},
                                  {"sku":"C","nombre":"Z","cantidad":5,"comprar":false}]'::jsonb);
  if jsonb_array_length(v_f) <> 1 or (v_f -> 0 ->> 'falta')::numeric <> 6 then
    raise exception 'compras_faltan no da lo esperado: %', v_f;
  end if;

  if private.compras_norm_marca('  bosch   pro ') <> 'BOSCH PRO' or private.compras_norm_marca('  ') is not null then
    raise exception 'compras_norm_marca no da lo esperado.';
  end if;

  -- La fracción recibida en dinero: 4 de 10 a $5 y 2 de 2 a $10 → (20 + 20) / (50 + 20).
  if round(private.compras_fraccion_recibida('[{"sku":"A","cantidad":10,"cantidad_recibida":4,"precio":5},
                                               {"sku":"B","cantidad":2,"cantidad_recibida":2,"precio":10}]'::jsonb), 4) <> round(40.0 / 70, 4)
     or private.compras_fraccion_recibida('[{"sku":"A","cantidad":3,"cantidad_recibida":3,"precio":0}]'::jsonb) <> 1
     or private.compras_fraccion_recibida('[{"sku":"A","cantidad":3,"precio":7}]'::jsonb) <> 0 then
    raise exception 'compras_fraccion_recibida no da lo esperado.';
  end if;
end
$ver$;
