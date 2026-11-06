/*
  FLUJO NUEVO DE COMPRAS · FASE 2
  EL ALMACÉN GENERAL REVISA EL PEDIDO ANTES DE QUE LLEGUE A COMPRAS

  Angélica, 06/11/2026:
  - «sera solicitud de pedido (un nombre generico), pasa al almacenista
    (verifica que tiene o no en inventario)».
  - «en la cantera, hay un almacen que es el general (ALM-GEN), sin tomar
    combustible».
  - «Si el almacen tiene todo, el almacenista hara una salida de los productos,
    a compras se le marca como finalizada todo con su respectivo msj de
    whastapp». Si no, a Compras pasa solo lo que falta.

  QUÉ CAMBIA

  1. Un pedido enviado ya no llega directo a Compras: nace en
     REVISION_ALMACEN («Revisión de almacén» en el tablero).

  2. El almacenista revisa (`revisar_pedido_en_almacen`): por cada renglón dice
     qué artículo de ALM-GEN entrega y cuánto. Lo que entrega sale por una
     SOLICITUD DE SALIDA de ALM-GEN, la misma de Salidas: aquí toda salida
     necesita autorización y esta no se la salta. Recibe quien pidió (su ficha
     de nómina) o la persona que diga el almacenista.
       - Entrega todo  → el pedido queda FINALIZADA.
       - Entrega parte → a Compras (PEDIDO) pasa solo lo que falta: el renglón
                         entregado entero sale del pedido y el parcial queda con
                         lo que falta. Lo entregado queda escrito en
                         `solicitud_atendido_almacen`.
       - Nada          → pasa a Compras tal cual.

  Lo que no se toca: la compra directa y el mercado (no pasan por
  `crear_pedido`), el combustible, lo que ya estaba en el tablero y el histórico.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Estados y columnas
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.solicitudes_pedido drop constraint if exists solicitudes_pedido_estado_check;
alter table public.solicitudes_pedido add constraint solicitudes_pedido_estado_check
  check (estado in ('BORRADOR', 'REVISION_ALMACEN', 'PEDIDO', 'CONFIRMADA', 'POR_CONFIRMAR_GERENTE',
                    'APROBADA', 'FINALIZADA', 'CANCELADA'));

alter table public.solicitudes_pedido
  add column if not exists revisada_almacen_por  uuid references auth.users(id),
  add column if not exists revisada_almacen_en   timestamptz,
  add column if not exists revision_almacen_nota text,
  add column if not exists salida_almacen_numero text,
  add column if not exists finalizada_en         timestamptz;

comment on column public.solicitudes_pedido.salida_almacen_numero is
  'La solicitud de salida (SS-…) con la que el almacén general entregó lo que tenía del pedido.';

-- Lo que entregó el almacén, renglón por renglón. Va aparte porque el renglón
-- entregado entero sale del pedido: si no quedara aquí, no habría dónde ver
-- qué se pidió y quién lo dio.
create table if not exists public.solicitud_atendido_almacen (
  id                 bigint generated always as identity primary key,
  solicitud_id       bigint not null references public.solicitudes_pedido(id) on delete cascade,
  renglon_id         bigint references public.solicitud_renglones(id) on delete set null,
  linea              integer,
  descripcion        text not null,
  unidad             text,
  cantidad_pedida    numeric not null,
  cantidad_entregada numeric not null check (cantidad_entregada > 0),
  articulo_id        bigint not null references public.articulos(id),
  almacen_id         bigint not null references public.almacenes(id),
  salida_numero      text,
  creado_por         uuid references auth.users(id) default auth.uid(),
  creado_en          timestamptz not null default now()
);

create index if not exists solicitud_atendido_almacen_solicitud_idx
  on public.solicitud_atendido_almacen (solicitud_id);

comment on table public.solicitud_atendido_almacen is
  'Lo que el almacén general entregó de un pedido antes de que pasara a Compras.';

alter table public.solicitud_atendido_almacen enable row level security;
revoke all on public.solicitud_atendido_almacen from anon;
grant select on public.solicitud_atendido_almacen to authenticated;

drop policy if exists solicitud_atendido_almacen_lectura on public.solicitud_atendido_almacen;
create policy solicitud_atendido_almacen_lectura on public.solicitud_atendido_almacen
  for select to authenticated using (private.tiene_permiso('COMPRAS', 'LECTURA'));

-- El almacén que revisa. Uno y por código: si un día son más, cambia aquí.
create or replace function private.almacen_que_revisa_pedidos()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select a.id from public.almacenes a where a.codigo = 'ALM-GEN' and a.activo;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. El pedido enviado va primero al almacén
--
-- `crear_pedido` y `enviar_pedido` de siempre; cambia el estado al que llegan.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.crear_pedido(
  p_titulo text,
  p_justificacion text,
  p_renglones jsonb,
  p_prioridad text default 'NORMAL'::text,
  p_requerida_para date default null::date,
  p_destino text default null::text,
  p_enviar boolean default true,
  p_solicitante_id uuid default null::uuid,
  p_solicitante_nombre text default null::text,
  p_solicitante_cargo text default null::text,
  p_destino_almacen_id bigint default null::bigint,
  p_con_firma boolean default false
) returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id      bigint;
  v_sol     record;
  v_destino text := nullif(trim(coalesce(p_destino, '')), '');
  v_nombre  text;
  v_estado  text := case when p_enviar then 'REVISION_ALMACEN' else 'BORRADOR' end;
begin
  perform private.exigir_rol('SOLICITANTE', 'COMPRAS', 'OPERACIONES', 'ALMACEN', 'RRHH');

  if length(trim(coalesce(p_titulo, ''))) < 4 then
    raise exception 'Póngale un título al pedido: es lo que se lee en el tablero.' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_justificacion, ''))) < 10 then
    raise exception 'Explique para qué es. Quien aprueba no está en el frente y necesita el porqué.'
      using errcode = '22023';
  end if;

  if p_destino_almacen_id is not null then
    select nombre into v_nombre from public.almacenes where id = p_destino_almacen_id;
    if v_nombre is null then
      raise exception 'No existe el almacén %.', p_destino_almacen_id using errcode = '23503';
    end if;
    v_destino := v_nombre;
  end if;

  select * into v_sol from private.normalizar_solicitante(
    coalesce(p_solicitante_id,
             case when nullif(trim(coalesce(p_solicitante_nombre, '')), '') is null
                  then (select auth.uid()) end),
    p_solicitante_nombre, p_solicitante_cargo);

  insert into public.solicitudes_pedido
    (numero, titulo, justificacion, prioridad, requerida_para, destino,
     destino_almacen_id, estado,
     registrada_por, solicitante_id, solicitante_nombre, solicitante_cargo, enviada_en,
     firma_de_quien_pide)
  values
    (private.siguiente_numero('SOL'), trim(p_titulo), trim(p_justificacion),
     coalesce(p_prioridad, 'NORMAL'), p_requerida_para, v_destino,
     p_destino_almacen_id,
     v_estado,
     (select auth.uid()), v_sol.o_id, v_sol.o_nombre, v_sol.o_cargo,
     case when p_enviar then now() end,
     -- La firma de otro no se estampa: solo cuenta si quien carga es quien pide.
     coalesce(p_con_firma, false)
       and v_sol.o_id is not distinct from (select auth.uid())
       and private.tengo_firma_encendida())
  returning id into v_id;

  perform private.escribir_renglones(v_id, p_renglones);
  perform private.anotar('SOLICITUD', v_id, null, v_estado);

  return v_id;
end;
$function$;

create or replace function public.enviar_pedido(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_estado text;
  v_dueno  uuid;
begin
  select estado, registrada_por into v_estado, v_dueno
  from public.solicitudes_pedido where id = p_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_id using errcode = 'P0002';
  end if;

  if v_estado is distinct from 'BORRADOR' then
    raise exception 'Solo se envía un borrador. Este pedido está en "%".', v_estado
      using errcode = '55000';
  end if;

  if v_dueno is distinct from (select auth.uid())
     and not private.tiene_rol('COMPRAS')
     and not private.tiene_permiso('COMPRAS', 'TOTAL') then
    raise exception 'Solo quien creó el borrador puede enviarlo.' using errcode = '42501';
  end if;

  update public.solicitudes_pedido
     set estado = 'REVISION_ALMACEN', enviada_en = now()
   where id = p_id;

  perform private.anotar('SOLICITUD', p_id, 'BORRADOR', 'REVISION_ALMACEN');
end;
$function$;

-- Lo finalizado por el almacén ya salió por una solicitud de salida: no se
-- cancela desde el pedido.
create or replace function public.cancelar_pedido(p_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_estado text;
  v_dueno  uuid;
  v_pidio  uuid;
begin
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escriba por qué se cancela. Sin motivo, dentro de un mes nadie sabrá qué pasó.'
      using errcode = '22023';
  end if;

  select estado, registrada_por, solicitante_id into v_estado, v_dueno, v_pidio
  from public.solicitudes_pedido where id = p_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_id using errcode = 'P0002';
  end if;

  if v_estado in ('APROBADA', 'CANCELADA', 'FINALIZADA') then
    raise exception 'Un pedido en "%" ya no se cancela desde aquí. Si ya hay orden de compra, cancélela en la orden.', v_estado
      using errcode = '55000';
  end if;

  if (select auth.uid()) not in (v_dueno, coalesce(v_pidio, v_dueno)) then
    perform private.exigir_rol('COMPRAS');
  end if;

  update public.solicitudes_pedido
     set estado = 'CANCELADA',
         motivo_cancelacion = trim(p_motivo),
         cancelada_por = (select auth.uid()),
         cancelada_en = now()
   where id = p_id;

  perform private.anotar('SOLICITUD', p_id, v_estado, 'CANCELADA', p_motivo);
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. La revisión del almacén
-- ═══════════════════════════════════════════════════════════════════════════

/*
  p_renglones: [{ "renglon_id": 12, "articulo_id": 345, "cantidad": 3 }, …]
  Solo hace falta mandar los renglones que el almacén entrega; el que no viene,
  o viene con cantidad 0, pasa a Compras entero. La cantidad va en la unidad del
  artículo del almacén y no puede pasar de lo pedido.

  p_empleado_id: quien recibe lo que sale. Si no viene, quien pidió, si tiene
  ficha de nómina.

  Devuelve el número de la solicitud de salida, o nulo si no se entregó nada.
*/
create or replace function public.revisar_pedido_en_almacen(
  p_id bigint,
  p_renglones jsonb default '[]'::jsonb,
  p_empleado_id bigint default null,
  p_nota text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s        public.solicitudes_pedido;
  v_alm      bigint;
  v_lista    jsonb := coalesce(p_renglones, '[]'::jsonb);
  v_x        jsonb;
  v_ren      public.solicitud_renglones;
  v_rid      bigint;
  v_art      bigint;
  v_cant     numeric;
  v_nombre   text;
  v_hay      numeric;
  v_y        record;
  v_entregas jsonb;
  v_receptor bigint;
  v_ss       text;
  v_todo     boolean;
  v_nota     text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  perform private.exigir_rol('ALMACEN');

  v_alm := private.almacen_que_revisa_pedidos();
  if v_alm is null then
    raise exception 'No está el almacén general (ALM-GEN), o está apagado.' using errcode = '23503';
  end if;

  select s.* into v_s from public.solicitudes_pedido s where s.id = p_id for update;

  if v_s.id is null then
    raise exception 'No existe el pedido %.', p_id using errcode = 'P0002';
  end if;

  if v_s.estado <> 'REVISION_ALMACEN' then
    raise exception 'El pedido % está en "%": ya no espera la revisión del almacén.', v_s.numero, v_s.estado
      using errcode = '55000';
  end if;

  if jsonb_typeof(v_lista) <> 'array' then
    raise exception 'Los renglones de la revisión van en una lista.' using errcode = '22023';
  end if;

  if (select count(*) from jsonb_array_elements(v_lista))
     <> (select count(distinct x ->> 'renglon_id') from jsonb_array_elements(v_lista) x) then
    raise exception 'Un renglón del pedido viene dos veces en la revisión.' using errcode = '22023';
  end if;

  -- Cada renglón: que sea de este pedido, que no se entregue más de lo pedido y
  -- que diga qué artículo del almacén sale.
  for v_x in select * from jsonb_array_elements(v_lista) loop
    v_rid  := nullif(btrim(coalesce(v_x ->> 'renglon_id', '')), '')::bigint;
    v_art  := nullif(btrim(coalesce(v_x ->> 'articulo_id', '')), '')::bigint;
    v_cant := coalesce(nullif(btrim(coalesce(v_x ->> 'cantidad', '')), '')::numeric, 0);

    select r.* into v_ren from public.solicitud_renglones r where r.id = v_rid and r.solicitud_id = p_id;
    if v_ren.id is null then
      raise exception 'Ese renglón no es de este pedido.' using errcode = '22023';
    end if;

    if v_cant < 0 then
      raise exception 'El renglón % (%): la cantidad no puede ser negativa.', v_ren.linea, v_ren.descripcion
        using errcode = '22023';
    end if;

    if v_cant > v_ren.cantidad then
      raise exception 'El renglón % (%): se pidieron % y se intentan entregar %.',
        v_ren.linea, v_ren.descripcion, private.numero_es(v_ren.cantidad, 2), private.numero_es(v_cant, 2)
        using errcode = '22023';
    end if;

    if v_cant > 0 then
      if v_art is null then
        raise exception 'El renglón % (%): diga qué artículo del almacén entrega.', v_ren.linea, v_ren.descripcion
          using errcode = '22023';
      end if;

      if not exists (select 1 from public.articulos a where a.id = v_art and a.activo) then
        raise exception 'El renglón % (%): ese artículo no existe o está inactivo.', v_ren.linea, v_ren.descripcion
          using errcode = '23503';
      end if;
    end if;
  end loop;

  -- Lo que se entrega, junto por artículo, y que lo haya en el almacén. La
  -- entrega de la salida lo vuelve a comprobar: esto es para no prometer lo que
  -- no hay.
  for v_y in
    select (x ->> 'articulo_id')::bigint as articulo_id, sum((x ->> 'cantidad')::numeric) as cantidad
      from jsonb_array_elements(v_lista) x
     where coalesce(nullif(btrim(coalesce(x ->> 'cantidad', '')), '')::numeric, 0) > 0
     group by 1
  loop
    select e.articulo, coalesce(e.disponibles, e.existencia) into v_nombre, v_hay
      from public.v_existencias e
     where e.almacen_id = v_alm and e.articulo_id = v_y.articulo_id;

    if coalesce(v_hay, 0) < v_y.cantidad then
      raise exception 'De % hay % en el almacén general y se quieren entregar %.',
        coalesce(v_nombre, (select a.nombre from public.articulos a where a.id = v_y.articulo_id)),
        private.numero_es(coalesce(v_hay, 0), 2), private.numero_es(v_y.cantidad, 2)
        using errcode = '22023';
    end if;
  end loop;

  select jsonb_agg(jsonb_build_object('articulo_id', t.articulo_id, 'cantidad', t.cantidad) order by t.articulo_id)
    into v_entregas
    from (select (x ->> 'articulo_id')::bigint as articulo_id, sum((x ->> 'cantidad')::numeric) as cantidad
            from jsonb_array_elements(v_lista) x
           where coalesce(nullif(btrim(coalesce(x ->> 'cantidad', '')), '')::numeric, 0) > 0
           group by 1) t;

  if v_entregas is not null then
    v_receptor := coalesce(
      p_empleado_id,
      (select e.id from public.empleados e
        where e.perfil_id = v_s.solicitante_id and e.activo and e.fecha_egreso is null
        order by e.id limit 1));

    if v_receptor is null then
      raise exception 'Diga quién recibe lo que entrega el almacén: quien pidió no tiene ficha en nómina.'
        using errcode = '22023';
    end if;

    -- La salida de siempre, con su autorización: el almacén no se salta Salidas.
    v_ss := public.pedir_salida(
      v_alm, v_entregas,
      format('Pedido de compra %s: %s', v_s.numero, v_s.titulo),
      v_receptor);

    insert into public.solicitud_atendido_almacen
      (solicitud_id, renglon_id, linea, descripcion, unidad, cantidad_pedida, cantidad_entregada,
       articulo_id, almacen_id, salida_numero)
    select p_id, r.id, r.linea, r.descripcion, r.unidad, r.cantidad,
           (x ->> 'cantidad')::numeric, (x ->> 'articulo_id')::bigint, v_alm, v_ss
      from jsonb_array_elements(v_lista) x
      join public.solicitud_renglones r on r.id = (x ->> 'renglon_id')::bigint
     where coalesce(nullif(btrim(coalesce(x ->> 'cantidad', '')), '')::numeric, 0) > 0;
  end if;

  v_todo := not exists (
    select 1
      from public.solicitud_renglones r
     where r.solicitud_id = p_id
       and r.cantidad > coalesce((select sum(a.cantidad_entregada)
                                    from public.solicitud_atendido_almacen a
                                   where a.renglon_id = r.id), 0));

  update public.solicitudes_pedido
     set revisada_almacen_por  = (select auth.uid()),
         revisada_almacen_en   = now(),
         revision_almacen_nota = v_nota,
         salida_almacen_numero = v_ss
   where id = p_id;

  if v_todo then
    update public.solicitudes_pedido
       set estado = 'FINALIZADA', finalizada_en = now()
     where id = p_id;

    perform private.anotar('SOLICITUD', p_id, 'REVISION_ALMACEN', 'FINALIZADA',
      concat_ws(' · ', format('El almacén general entrega todo (%s)', v_ss), v_nota));
    return v_ss;
  end if;

  -- A Compras solo lo que falta. Primero sale lo entregado entero; después se
  -- rebaja lo parcial. Al revés, un renglón rebajado por debajo de lo
  -- entregado parecería entregado entero y se borraría.
  delete from public.solicitud_renglones r
   using public.solicitud_atendido_almacen a
   where a.renglon_id = r.id
     and a.solicitud_id = p_id
     and a.cantidad_entregada >= r.cantidad;

  update public.solicitud_renglones r
     set cantidad = r.cantidad - a.cantidad_entregada
    from public.solicitud_atendido_almacen a
   where a.renglon_id = r.id
     and a.solicitud_id = p_id
     and a.cantidad_entregada < r.cantidad;

  update public.solicitudes_pedido set estado = 'PEDIDO' where id = p_id;

  perform private.anotar('SOLICITUD', p_id, 'REVISION_ALMACEN', 'PEDIDO',
    concat_ws(' · ',
      case when v_ss is null then 'El almacén general no tiene nada de lo pedido'
           else format('El almacén general entrega una parte (%s); a compras pasa lo que falta', v_ss) end,
      v_nota));

  return v_ss;
end;
$$;

revoke all on function public.revisar_pedido_en_almacen(bigint, jsonb, bigint, text) from public, anon;
grant execute on function public.revisar_pedido_en_almacen(bigint, jsonb, bigint, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. El tablero: «Revisión de almacén» y «Finalizada»
--
-- La misma vista; la columna suma dos casos. Las columnas de la vista no
-- cambian, así que `v_compras_tablero` y `v_compras_historico` siguen igual.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_compras_todas
with (security_invoker = on)
as
 SELECT s.id AS solicitud_id,
    s.numero,
    s.titulo,
    s.prioridad,
    s.requerida_para,
    s.destino,
    s.destino_almacen_id,
    s.estado AS estado_solicitud,
    s.creada_en,
    s.solicitante_id,
    COALESCE(pide.nombre, s.solicitante_nombre, per.nombre) AS solicitante,
    COALESCE(pide.cargo, s.solicitante_cargo) AS solicitante_cargo,
    s.registrada_por,
    per.nombre AS registrada_por_nombre,
    o.id AS orden_id,
    o.numero AS orden_numero,
    o.estado AS estado_orden,
    o.condicion_pago,
    o.fecha_pago,
    o.entrega_estimada,
    o.desistio_resolucion,
    COALESCE(prov_o.nombre, prov_c.nombre) AS proveedor,
    COALESCE(o.moneda, cot.moneda) AS moneda,
    COALESCE(o.total, cot.total) AS total,
    COALESCE(o.total_usd, cot.total_usd) AS total_usd,
    COALESCE(o.total_bs, cot.total_bs) AS total_bs,
    ( SELECT count(*) AS count
           FROM public.cotizaciones c
          WHERE c.solicitud_id = s.id) AS cotizaciones,
    ( SELECT count(*) AS count
           FROM public.solicitud_renglones r
          WHERE r.solicitud_id = s.id) AS renglones,
        CASE
            WHEN o.fecha_pago IS NOT NULL AND (o.estado = ANY (ARRAY['PAGADA_POR_RECIBIR'::text, 'RECIBIDA_PARCIAL'::text, 'PROVEEDOR_DESISTIO'::text])) THEN CURRENT_DATE - o.fecha_pago
            ELSE NULL::integer
        END AS dias_sin_recibir,
        CASE
            WHEN s.estado = 'REVISION_ALMACEN'::text THEN 'REVISION'::text
            WHEN s.estado = 'FINALIZADA'::text THEN 'FINALIZADA'::text
            WHEN s.estado = ANY (ARRAY['BORRADOR'::text, 'PEDIDO'::text]) THEN 'PEDIDO'::text
            WHEN s.estado = 'CONFIRMADA'::text THEN 'CONFIRMADA'::text
            WHEN s.estado = 'POR_CONFIRMAR_GERENTE'::text THEN 'GERENTE'::text
            WHEN s.estado = 'CANCELADA'::text THEN 'CANCELADA'::text
            WHEN o.estado = 'CANCELADA'::text THEN 'CANCELADA'::text
            WHEN o.estado = 'PROVEEDOR_DESISTIO'::text THEN 'DESISTIO'::text
            WHEN o.estado = ANY (ARRAY['POR_RECIBIR'::text, 'POR_INDICAR_PAGO'::text, 'EN_TESORERIA'::text]) THEN 'APROBADA'::text
            WHEN o.estado = ANY (ARRAY['PAGADA_POR_RECIBIR'::text, 'RECIBIDA_PARCIAL'::text]) THEN 'PAGADA'::text
            WHEN o.estado = 'RECIBIDA'::text THEN 'RECIBIDA'::text
            WHEN o.id IS NOT NULL THEN 'APROBADA'::text
            ELSE 'PEDIDO'::text
        END AS columna,
    ( SELECT count(*) AS count
           FROM public.cotizaciones c
          WHERE c.solicitud_id = s.id AND c.propuesta) AS propuestas,
    s.historico_en,
    s.historico_columna,
    s.historico_nota
   FROM public.solicitudes_pedido s
     LEFT JOIN public.perfiles per ON per.id = s.registrada_por
     LEFT JOIN public.perfiles pide ON pide.id = s.solicitante_id
     LEFT JOIN LATERAL ( SELECT oc.id,
            oc.numero,
            oc.proveedor_id,
            oc.estado,
            oc.moneda,
            oc.total,
            oc.total_bs,
            oc.total_usd,
            oc.entrega_estimada,
            oc.fecha_pago,
            oc.desistio_resolucion,
            oc.condicion_pago
           FROM public.ordenes_compra oc
          WHERE oc.solicitud_id = s.id
          ORDER BY (oc.estado = 'CANCELADA'::text), oc.id DESC
         LIMIT 1) o ON true
     LEFT JOIN public.cotizaciones cot ON cot.id = COALESCE(s.cotizacion_elegida_id, ( SELECT min(p.id) AS min
           FROM public.cotizaciones p
          WHERE p.solicitud_id = s.id AND p.propuesta
         HAVING count(*) = 1))
     LEFT JOIN public.proveedores prov_o ON prov_o.id = o.proveedor_id
     LEFT JOIN public.proveedores prov_c ON prov_c.id = cot.proveedor_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Los avisos: al almacén cuando entra un pedido; a Compras cuando el
--    almacén lo cerró
--
-- La `anotar` de la fase 1, con dos casos más.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.anotar(p_tipo text, p_id bigint, p_ant text, p_nuevo text, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_solicitud   bigint;
  v_numero      text;
  v_titulo      text;
  v_proveedor   text;
  v_total_usd   numeric;
  v_aviso       text;
  v_detalle     text;
  v_roles       text[];
  v_importancia text := 'INFO';
begin
  insert into public.compras_bitacora
    (documento_tipo, documento_id, estado_anterior, estado_nuevo, nota, actor_id)
  values
    (p_tipo, p_id, p_ant, p_nuevo, nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()));

  -- ¿A qué compra pertenece el documento que se movió?
  if p_tipo = 'SOLICITUD' then
    v_solicitud := p_id;
  elsif p_tipo = 'ORDEN' then
    select o.solicitud_id into v_solicitud from public.ordenes_compra o where o.id = p_id;
  elsif p_tipo = 'PAGO' then
    select o.solicitud_id into v_solicitud
    from public.instrucciones_pago i
    join public.ordenes_compra o on o.id = i.orden_id
    where i.id = p_id;
  else
    return;
  end if;

  if v_solicitud is null then
    return;
  end if;

  select s.numero, s.titulo, p.nombre, o.total_usd
    into v_numero, v_titulo, v_proveedor, v_total_usd
  from public.solicitudes_pedido s
  left join public.ordenes_compra o on o.solicitud_id = s.id and o.estado <> 'CANCELADA'
  left join public.proveedores p on p.id = o.proveedor_id
  where s.id = v_solicitud;

  case p_nuevo
    when 'REVISION_ALMACEN' then
      v_aviso := 'Pedido por revisar en el almacén general';
      v_roles := array['ALMACEN'];
      v_importancia := 'ATENCION';

    when 'PEDIDO' then
      v_aviso := 'Nuevo pedido de compra';
      v_roles := array['COMPRAS'];

    when 'CONFIRMADA' then
      v_aviso := 'Pedido confirmado: hay que cotizar';
      v_roles := array['COMPRAS'];

    when 'POR_CONFIRMAR_GERENTE' then
      v_aviso := 'Orden pendiente por aprobar';
      v_roles := array['GERENTE_GENERAL'];
      v_importancia := 'ATENCION';

    when 'APROBADA' then
      v_aviso := 'Orden de compra aprobada';
      v_roles := array['COMPRAS'];

    when 'POR_INDICAR_PAGO' then
      v_aviso := 'Orden de compra sin método de pago';
      v_roles := array['COMPRAS'];

    when 'EN_TESORERIA' then
      v_aviso := 'Orden aprobada por pagar';
      v_roles := array['COMPRAS'];
      v_importancia := 'ATENCION';

    when 'PAGADA_POR_RECIBIR' then
      v_aviso := 'Compra pagada: pendiente por recepcionar';
      v_roles := array['ALMACEN', 'COMPRAS'];

    when 'RECIBIDA' then
      v_aviso := 'Material recibido';
      v_roles := array['COMPRAS'];

    when 'RECIBIDA_PARCIAL' then
      v_aviso := 'Material recibido en parte';
      v_roles := array['COMPRAS'];

    when 'FINALIZADA' then
      v_aviso := 'Pedido atendido por el almacén general: finalizado';
      v_roles := array['COMPRAS'];

    when 'CANCELADA' then
      v_aviso := 'Compra cancelada';
      v_roles := array['COMPRAS', 'GERENTE_GENERAL'];

    when 'PROVEEDOR_DESISTIO' then
      v_aviso := 'El proveedor desistió: hay dinero pagado sin material';
      v_roles := array['GERENTE_GENERAL', 'COMPRAS'];
      v_importancia := 'URGENTE';

    when 'DEVUELTA' then
      v_aviso := 'El pago volvió a compras';
      v_roles := array['COMPRAS'];
      v_importancia := 'ATENCION';

    when 'NO_PAGADA' then
      v_aviso := 'Orden aprobada que no se pagará todavía';
      v_roles := array['COMPRAS'];
      v_importancia := 'ATENCION';

    else
      -- Borradores, cotizaciones cargadas y resoluciones de desistimiento no
      -- le piden nada a nadie: quedan en la bitácora y ahí se consultan.
      return;
  end case;

  v_detalle := format('%s · %s', v_numero, v_titulo);

  if v_proveedor is not null then
    v_detalle := v_detalle || format(' · %s', v_proveedor);
  end if;

  if v_total_usd is not null then
    v_detalle := v_detalle || format(' · $ %s', private.numero_es(v_total_usd, 2));
  end if;

  if nullif(trim(coalesce(p_nota, '')), '') is not null then
    v_detalle := v_detalle || format(' — «%s»', trim(p_nota));
  end if;

  perform private.notificar(
    'COMPRAS', 'COMPRA_' || p_nuevo, v_aviso, v_detalle,
    '/app/compras/' || v_solicitud, v_roles, v_importancia);
end;
$function$;
