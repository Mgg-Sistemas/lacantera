-- VENTAS COMO COMPRAS · FASE 0: LA BASE (la dueña, 10/11/2026)
--
-- Decidió, sobre la maqueta del flujo nuevo:
--   1. Una sola aprobación por venta: al despachar. La factura se emite sin
--      otra autorización (se retira «Factura por autorizar»).
--   2. Los despachos los aprueban los administradores y una lista de
--      autorizados, como en Compras (`usuarios_autorizados`).
--   3. Al aprobar se pregunta «¿Se despacha?»; si no, con motivo, como
--      «¿Se pagará esta OC?» en Compras.
--   4. Una nota de entrega sin factura se da por pagada con la Conciliación de
--      pagos.
--   5. La cotización no es obligatoria; «Despachar esta cotización» la conecta.
--   6. Romana y guía, como están.
--
-- Aquí no cambia nada de lo ya vendido: el tablero LEE los documentos que
-- existen (cotizaciones, solicitudes de despacho, notas de entrega, facturas,
-- cobros y conciliación).

-- ---------------------------------------------------------------------------
-- 1. Quién aprueba despachos: la lista de autorizados
-- ---------------------------------------------------------------------------
alter table public.usuarios_autorizados
  add column if not exists aprobar_despachos boolean not null default false;

drop function if exists public.guardar_usuario_autorizado(uuid, boolean, boolean);
create function public.guardar_usuario_autorizado(
  p_usuario uuid, p_aprobar_oc boolean, p_aprobar_salidas boolean, p_aprobar_despachos boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_desp boolean;
begin
  perform private.exigir_rol('ADMIN');

  if not exists (select 1 from public.perfiles where id = p_usuario and activo) then
    raise exception 'Ese usuario no existe o está inactivo.' using errcode = 'P0002';
  end if;

  -- Sin el tercer valor (pantalla anterior) se conserva el que tenía.
  v_desp := coalesce(p_aprobar_despachos,
                     (select a.aprobar_despachos from public.usuarios_autorizados a where a.usuario_id = p_usuario),
                     false);

  if not (coalesce(p_aprobar_oc, false) or coalesce(p_aprobar_salidas, false) or v_desp) then
    raise exception 'Debe quedar al menos una opción. Para quitarle todo, use «Quitar».'
      using errcode = '22023';
  end if;

  insert into public.usuarios_autorizados (usuario_id, aprobar_oc, aprobar_salidas, aprobar_despachos, actualizado_por)
  values (p_usuario, coalesce(p_aprobar_oc, false), coalesce(p_aprobar_salidas, false), v_desp, (select auth.uid()))
  on conflict (usuario_id) do update
    set aprobar_oc = excluded.aprobar_oc,
        aprobar_salidas = excluded.aprobar_salidas,
        aprobar_despachos = excluded.aprobar_despachos,
        actualizado_en = now(),
        actualizado_por = excluded.actualizado_por;
end;
$$;
revoke all on function public.guardar_usuario_autorizado(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.guardar_usuario_autorizado(uuid, boolean, boolean, boolean) to authenticated;

drop function if exists public.usuarios_autorizados_lista();
create function public.usuarios_autorizados_lista()
returns table(usuario_id uuid, nombre text, usuario text, activo boolean,
              aprobar_oc boolean, aprobar_salidas boolean, firma text, aprobar_despachos boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_permiso('USUARIOS', 'LECTURA');

  return query
  select a.usuario_id, p.nombre, p.usuario, p.activo, a.aprobar_oc, a.aprobar_salidas,
         (select f.imagen from public.firmas f where f.perfil_id = a.usuario_id),
         a.aprobar_despachos
    from public.usuarios_autorizados a
    join public.perfiles p on p.id = a.usuario_id
   order by p.nombre;
end;
$$;
revoke all on function public.usuarios_autorizados_lista() from public, anon;
grant execute on function public.usuarios_autorizados_lista() to authenticated;

create or replace function private.ventas_aprueba_despacho()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.tiene_rol('ADMIN')
      or exists (select 1
                   from public.usuarios_autorizados a
                   join public.perfiles p on p.id = a.usuario_id
                  where a.usuario_id = (select auth.uid()) and a.aprobar_despachos and p.activo);
$$;
grant execute on function private.ventas_aprueba_despacho() to public;

-- Aviso del despacho por aprobar a quien aprueba (antes iba al rol
-- GERENTE_GENERAL, que ya no existe desde el 09/11/2026).
create or replace function private.avisar_aprobadores_despacho(p_titulo text, p_detalle text, p_ruta text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_para uuid[];
begin
  select coalesce(array_agg(a.usuario_id), '{}') into v_para
    from public.usuarios_autorizados a
    join public.perfiles p on p.id = a.usuario_id
   where a.aprobar_despachos and p.activo;

  insert into public.notificaciones
    (modulo, tipo, titulo, detalle, ruta, roles, importancia, actor_id, para_usuarios)
  values
    ('VENTAS', 'DESPACHO_PEDIDO', p_titulo, p_detalle, p_ruta, array['ADMIN'], 'ATENCION',
     (select auth.uid()), v_para);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Aprobar / no aprobar el despacho
-- ---------------------------------------------------------------------------
alter table public.solicitudes_despacho
  add column if not exists no_despacho_motivo text
    check (no_despacho_motivo in ('sin_cupo', 'deuda_vencida', 'sin_material', 'otro')),
  add column if not exists no_despacho_detalle text,
  add column if not exists no_despacho_por_nombre text,
  add column if not exists no_despacho_en timestamptz;

create or replace function public.aprobar_despacho(p_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  s      public.solicitudes_despacho;
  v_nota bigint;
begin
  perform private.exigir_usuario_activo();
  if not private.ventas_aprueba_despacho() then
    raise exception 'Los despachos los aprueban los administradores y los usuarios autorizados (Usuarios > Usuarios autorizados).'
      using errcode = '42501';
  end if;

  select * into s from public.solicitudes_despacho where id = p_id for update;
  if not found then
    raise exception 'Ese despacho no existe.' using errcode = 'P0002';
  end if;
  if s.estado <> 'PEDIDA' then
    raise exception 'El despacho % ya no está esperando aprobación.', s.numero using errcode = '55000';
  end if;

  if s.pedida_por = (select auth.uid()) and not private.tiene_rol('ADMIN') then
    raise exception 'El despacho % lo pidió usted: lo aprueba otro usuario autorizado.', s.numero
      using errcode = '42501';
  end if;

  v_nota := private.despachar(
    s.cliente_id, s.almacen_id, s.renglones, s.moneda, s.cotizacion_id,
    s.vehiculo, s.chofer, s.cedula_chofer, s.peso_bruto, s.peso_tara, s.ticket,
    0, s.descuento, s.flete, null, s.observacion, s.ticket_id, s.guia_id,
    s.pago_combinado, s.monto_usd_combinado, s.monto_bs_combinado,
    s.pendiente_por_cobrar, s.fecha_pago);

  update public.solicitudes_despacho
     set estado = 'APROBADA', nota_id = v_nota,
         resuelta_por = (select auth.uid()), resuelta_en = now()
   where id = p_id;

  return v_nota;
end;
$$;

create or replace function public.rechazar_despacho(p_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.solicitudes_despacho;
begin
  perform private.exigir_usuario_activo();
  if not private.ventas_aprueba_despacho() then
    raise exception 'Los despachos los aprueban los administradores y los usuarios autorizados.'
      using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escriba por qué no se aprueba.' using errcode = '22023';
  end if;

  select * into s from public.solicitudes_despacho where id = p_id for update;
  if not found then
    raise exception 'Ese despacho no existe.' using errcode = 'P0002';
  end if;
  if s.estado <> 'PEDIDA' then
    raise exception 'El despacho % ya no está esperando aprobación.', s.numero using errcode = '55000';
  end if;

  update public.solicitudes_despacho
     set estado = 'RECHAZADA', motivo_cierre = btrim(p_motivo),
         resuelta_por = (select auth.uid()), resuelta_en = now()
   where id = p_id;
end;
$$;

-- «¿Se despacha?» → No, por ahora: queda por aprobar con su motivo a la vista.
-- («No procede» es rechazar_despacho, con su motivo.)
create or replace function public.ventas_no_se_despacha(p_id bigint, p_motivo text, p_detalle text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s         public.solicitudes_despacho;
  v_detalle text := upper(nullif(btrim(coalesce(p_detalle, '')), ''));
  v_txt     text;
begin
  perform private.exigir_usuario_activo();
  if not private.ventas_aprueba_despacho() then
    raise exception 'Los despachos los aprueban los administradores y los usuarios autorizados.'
      using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('sin_cupo', 'deuda_vencida', 'sin_material', 'otro') then
    raise exception 'Elegí el motivo por el cual no se despacha.' using errcode = '22023';
  end if;
  if p_motivo = 'otro' and v_detalle is null then
    raise exception 'Especificá el motivo.' using errcode = '22023';
  end if;
  if length(coalesce(v_detalle, '')) > 500 then
    raise exception 'El motivo no puede pasar de 500 caracteres.' using errcode = '22023';
  end if;

  select * into s from public.solicitudes_despacho where id = p_id for update;
  if not found then
    raise exception 'Ese despacho no existe.' using errcode = 'P0002';
  end if;
  if s.estado <> 'PEDIDA' then
    raise exception 'El despacho % ya no está esperando aprobación.', s.numero using errcode = '55000';
  end if;

  v_txt := case p_motivo
             when 'sin_cupo' then 'Cliente sin cupo de crédito'
             when 'deuda_vencida' then 'Cliente con deuda vencida'
             when 'sin_material' then 'No hay material en el patio'
             else 'Otro' end
           || coalesce(': ' || v_detalle, '');

  update public.solicitudes_despacho
     set no_despacho_motivo = p_motivo,
         no_despacho_detalle = v_detalle,
         no_despacho_por_nombre = (select p.nombre from public.perfiles p where p.id = (select auth.uid())),
         no_despacho_en = now()
   where id = p_id;

  if s.pedida_por is not null then
    insert into public.notificaciones
      (modulo, tipo, titulo, detalle, ruta, roles, importancia, actor_id, para_usuarios)
    values
      ('VENTAS', 'DESPACHO_NO_APROBADO',
       format('Despacho %s no aprobado por ahora · %s', s.numero, v_txt),
       null, '/app/ventas', '{}', 'INFO', (select auth.uid()), array[s.pedida_por]);
  end if;

  return jsonb_build_object('id', s.id, 'numero', s.numero, 'motivo', p_motivo, 'texto', v_txt);
end;
$$;
revoke all on function public.ventas_no_se_despacha(bigint, text, text) from public, anon;
grant execute on function public.ventas_no_se_despacha(bigint, text, text) to authenticated;

-- El aviso de «Despacho por aprobar»: a la lista de autorizados (y a ADMIN),
-- y abre el tablero de ventas.
do $aviso$
declare
  v_def text;
  v_viejo constant text := $t$'/app/facturacion/notas-entrega', array['GERENTE_GENERAL'], 'INFO');$t$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'solicitar_despacho';
  if position(v_viejo in v_def) = 0 then
    raise exception 'solicitar_despacho no tiene el aviso esperado; revisar antes de aplicar';
  end if;
  v_def := replace(v_def, 'perform private.notificar(' || E'\n' || $t$    'FACTURACION', 'DESPACHO_PEDIDO',$t$,
                          'perform private.avisar_aprobadores_despacho(');
  v_def := replace(v_def, v_viejo, $t$'/app/ventas');$t$);
  if position('avisar_aprobadores_despacho(' in v_def) = 0 then
    raise exception 'No se pudo cambiar el aviso de solicitar_despacho';
  end if;
  execute v_def;
end
$aviso$;

-- ---------------------------------------------------------------------------
-- 3. La factura se emite sin otra autorización
-- ---------------------------------------------------------------------------
do $sin_autorizar$
declare
  v_fn   text;
  v_def  text;
  v_ini  int;
  v_fin  int;
  v_marca constant text := $t$  if coalesce(current_setting('lacantera.factura_autorizada', true), '') <> 'si' then$t$;
begin
  foreach v_fn in array array['facturar_notas', 'facturar_directo'] loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    v_ini := position(v_marca in v_def);
    if v_ini = 0 then
      raise exception '% no tiene el candado de autorización esperado', v_fn;
    end if;
    v_fin := position('end if;' in substr(v_def, v_ini));
    v_def := overlay(v_def placing
      '  -- UNA SOLA APROBACIÓN, AL DESPACHAR (la dueña, 10/11/2026): la factura' || E'\n' ||
      '  -- se emite sin otra autorización.' || E'\n'
      from v_ini for v_fin + length('end if;'));
    execute v_def;
  end loop;
end
$sin_autorizar$;

-- ---------------------------------------------------------------------------
-- 4. Lo que puede hacer quien mira el tablero
-- ---------------------------------------------------------------------------
create or replace function public.ventas_mis_permisos()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ver', private.tiene_permiso('VENTAS', 'LECTURA') or private.tiene_permiso('FACTURACION', 'LECTURA'),
    'cotizar', private.tiene_permiso('VENTAS', 'ESCRITURA'),
    'despachar', private.tiene_permiso('FACTURACION', 'ESCRITURA'),
    'aprueba_despacho', private.ventas_aprueba_despacho(),
    'facturar', private.tiene_permiso('FACTURACION', 'ESCRITURA'),
    'cobrar', private.tiene_permiso('FACTURACION', 'ESCRITURA'),
    'conciliar', private.puede_accion('VENTAS.REGISTRAR_PAGOS'),
    'anular', private.tiene_permiso('FACTURACION', 'TOTAL'),
    'montos', private.puede_accion('VENTAS.VER_VENTAS') or private.puede_accion('FACTURACION.VER_FACTURACION'));
$$;
revoke all on function public.ventas_mis_permisos() from public, anon;
grant execute on function public.ventas_mis_permisos() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. El tablero: una tarjeta por venta, en su etapa
-- ---------------------------------------------------------------------------
-- Etapas: cot · aprobar · despachada · facturada · cobrada · anulada.
-- Cobradas y anuladas: solo las de los últimos p_dias días.
create or replace function public.ventas_tablero(p_dias integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_desde  timestamptz := now() - make_interval(days => greatest(coalesce(p_dias, 30), 1));
  v_montos boolean;
  v_out    jsonb;
begin
  if not (private.tiene_permiso('VENTAS', 'LECTURA') or private.tiene_permiso('FACTURACION', 'LECTURA')) then
    raise exception 'Sin permiso para ver ventas.' using errcode = '42501';
  end if;
  v_montos := private.puede_accion('VENTAS.VER_VENTAS') or private.puede_accion('FACTURACION.VER_FACTURACION');

  with
  ap as (
    select pbn.nota_id, sum(pbn.monto_aplicado) as aplicado, max(pbn.asociado_en) as ultimo
      from public.pagos_bancarios_notas pbn
      join public.pagos_bancarios pb on pb.id = pbn.pago_id
     where pbn.quitado_en is null and pb.anulado_en is null
     group by pbn.nota_id),
  cob as (
    select c.factura_id, sum(c.monto_usd) as cobrado, max(c.registrado_en) as ultimo
      from public.cobros_venta c where c.estado = 'REGISTRADO' group by c.factura_id),
  filas as (
    -- Cotizaciones que todavía no se despachan (y las cerradas recientes)
    select jsonb_build_object(
             'clave', 'COT-' || c.id, 'tipo', 'COT', 'id', c.id, 'numero', c.numero,
             'etapa', case when c.estado = 'ENVIADA' then 'cot' else 'anulada' end,
             'estado_doc', c.estado,
             'cliente_id', c.cliente_id, 'cliente', cl.nombre, 'rif', cl.rif,
             'at', c.creada_en, 'fecha', c.fecha, 'moneda', c.moneda, 'tasa', c.tasa,
             'total', c.total, 'total_usd', c.total_usd, 'total_bs', c.total_bs,
             'iva', c.iva, 'igtf', c.igtf,
             'vence_el', c.fecha + c.validez_dias,
             'motivo', c.motivo_cierre,
             'por', (select p.nombre from public.perfiles p where p.id = c.creada_por),
             'resumen', (select string_agg(r.descripcion || ' · ' || trim_scale(r.cantidad)::text || ' ' || r.unidad, ' · ' order by r.linea)
                           from public.cotizacion_venta_renglones r where r.cotizacion_id = c.id),
             'cadena', jsonb_build_object('cot', c.numero)) as j
      from public.cotizaciones_venta c
      join public.clientes cl on cl.id = c.cliente_id
     where (c.estado = 'ENVIADA'
            and not exists (select 1 from public.solicitudes_despacho s
                             where s.cotizacion_id = c.id and s.estado in ('PEDIDA', 'APROBADA'))
            and not exists (select 1 from public.notas_entrega n
                             where n.cotizacion_id = c.id and n.estado <> 'ANULADA'))
        or (c.estado in ('RECHAZADA', 'ANULADA') and coalesce(c.cerrada_en, c.creada_en) >= v_desde)

    union all
    -- Despachos por aprobar (y los no aprobados / cancelados recientes)
    select jsonb_build_object(
             'clave', 'SD-' || s.id, 'tipo', 'SD', 'id', s.id, 'numero', s.numero,
             'etapa', case when s.estado = 'PEDIDA' then 'aprobar' else 'anulada' end,
             'estado_doc', s.estado,
             'cliente_id', s.cliente_id, 'cliente', cl.nombre, 'rif', cl.rif,
             'at', s.pedida_en, 'moneda', s.moneda,
             'total', (select sum(coalesce((r->>'precio_unitario')::numeric, 0) * coalesce((r->>'cantidad')::numeric, 0))
                         from jsonb_array_elements(s.renglones) r),
             'renglones', s.renglones,
             'almacen', al.nombre, 'chofer', s.chofer, 'cedula_chofer', s.cedula_chofer, 'vehiculo', s.vehiculo,
             'ticket', s.ticket, 'guia_id', s.guia_id,
             'pago_combinado', s.pago_combinado, 'monto_usd_combinado', s.monto_usd_combinado, 'monto_bs_combinado', s.monto_bs_combinado,
             'pendiente_por_cobrar', s.pendiente_por_cobrar, 'fecha_pago', s.fecha_pago,
             'observacion', s.observacion,
             'por', pp.nombre, 'por_id', s.pedida_por,
             'motivo', s.motivo_cierre,
             'no_despacho_motivo', s.no_despacho_motivo, 'no_despacho_detalle', s.no_despacho_detalle,
             'no_despacho_por', s.no_despacho_por_nombre, 'no_despacho_en', s.no_despacho_en,
             'resumen', (select string_agg((r->>'descripcion') || ' · ' || trim_scale((r->>'cantidad')::numeric)::text || ' ' || (r->>'unidad'), ' · ')
                           from jsonb_array_elements(s.renglones) r),
             'cadena', jsonb_build_object('cot', co.numero, 'sd', s.numero)) as j
      from public.solicitudes_despacho s
      join public.clientes cl on cl.id = s.cliente_id
      left join public.almacenes al on al.id = s.almacen_id
      left join public.perfiles pp on pp.id = s.pedida_por
      left join public.cotizaciones_venta co on co.id = s.cotizacion_id
     where s.estado = 'PEDIDA'
        or (s.estado in ('RECHAZADA', 'CANCELADA') and coalesce(s.resuelta_en, s.pedida_en) >= v_desde)

    union all
    -- Notas de entrega sin factura: por cobrar, o pagadas con la conciliación
    select jsonb_build_object(
             'clave', 'NE-' || n.id, 'tipo', 'NE', 'id', n.id, 'numero', n.numero,
             'etapa', case
                        when n.estado = 'ANULADA' then 'anulada'
                        when coalesce(n.total_usd, 0) > 0 and coalesce(ap.aplicado, 0) >= n.total_usd - 0.05 then 'cobrada'
                        else 'despachada' end,
             'estado_doc', n.estado,
             'cliente_id', n.cliente_id, 'cliente', cl.nombre, 'rif', cl.rif,
             'at', coalesce(n.despachada_en, n.fecha::timestamptz), 'fecha', n.fecha, 'moneda', n.moneda, 'tasa', n.tasa,
             'total', n.total, 'total_usd', n.total_usd, 'total_bs', n.total_bs,
             'aplicado', coalesce(ap.aplicado, 0),
             'saldo_usd', greatest(coalesce(n.total_usd, 0) - coalesce(ap.aplicado, 0), 0),
             'almacen', al.nombre, 'chofer', n.chofer, 'cedula_chofer', n.cedula_chofer, 'vehiculo', n.vehiculo,
             'ticket', n.ticket_romana, 'guia_id', n.guia_id,
             'facturable', n.facturable,
             'pago_combinado', n.pago_combinado, 'monto_usd_combinado', n.monto_usd_combinado, 'monto_bs_combinado', n.monto_bs_combinado,
             'pendiente_por_cobrar', n.pendiente_por_cobrar, 'fecha_pago', n.fecha_pago,
             'vencida', n.pendiente_por_cobrar and n.fecha_pago < current_date and coalesce(ap.aplicado, 0) < coalesce(n.total_usd, 0) - 0.05,
             'precios_pendientes', (select count(*) from public.nota_entrega_renglones r where r.nota_id = n.id and r.precio_pendiente),
             'desde_salida', n.solicitud_salida_id is not null, 'nota_salida', n.nota_salida,
             'observacion', n.observacion,
             'por', (select p.nombre from public.perfiles p where p.id = n.despachada_por),
             'motivo', n.motivo_anulacion,
             'cobrada_en', ap.ultimo,
             'resumen', (select string_agg(r.descripcion || ' · ' || trim_scale(r.cantidad)::text || ' ' || r.unidad, ' · ' order by r.linea)
                           from public.nota_entrega_renglones r where r.nota_id = n.id),
             'cadena', jsonb_build_object('cot', co.numero, 'sd', sd.numero, 'ne', n.numero, 'ns', n.nota_salida)) as j
      from public.notas_entrega n
      left join public.clientes cl on cl.id = n.cliente_id
      left join public.almacenes al on al.id = n.almacen_id
      left join ap on ap.nota_id = n.id
      left join public.cotizaciones_venta co on co.id = n.cotizacion_id
      left join public.solicitudes_despacho sd on sd.nota_id = n.id
     where n.factura_id is null
       and (n.facturable or coalesce(n.total, 0) > 0)
       and (
             (n.estado in ('DESPACHADA', 'PENDIENTE')
              and not (coalesce(n.total_usd, 0) > 0 and coalesce(ap.aplicado, 0) >= n.total_usd - 0.05))
          or (n.estado in ('DESPACHADA', 'PENDIENTE') and coalesce(ap.ultimo, n.despachada_en) >= v_desde)
          or (n.estado = 'ANULADA' and coalesce(n.anulada_en, n.despachada_en) >= v_desde))

    union all
    -- Facturas: por cobrar, cobradas o anuladas recientes
    select jsonb_build_object(
             'clave', 'FAC-' || f.id, 'tipo', 'FAC', 'id', f.id, 'numero', f.numero,
             'etapa', case f.estado when 'EMITIDA' then 'facturada' when 'COBRADA' then 'cobrada' else 'anulada' end,
             'estado_doc', f.estado,
             'cliente_id', f.cliente_id, 'cliente', cl.nombre, 'rif', cl.rif,
             'at', f.emitida_en, 'fecha', f.fecha, 'moneda', f.moneda, 'tasa', f.tasa,
             'total', f.total, 'total_usd', f.total_usd, 'total_bs', f.total_bs,
             'iva', f.iva, 'igtf', f.igtf, 'retencion_usd', f.retencion_usd,
             'cobrado', coalesce(cob.cobrado, 0),
             'saldo_usd', case when f.estado = 'EMITIDA' then private.saldo_de_factura(f.id) else 0 end,
             'numero_control', f.numero_control, 'condicion', f.condicion_pago, 'dias_credito', f.dias_credito,
             'vence_el', f.vence_el, 'vencida', f.estado = 'EMITIDA' and f.vence_el < current_date,
             'observacion', f.observacion,
             'por', (select p.nombre from public.perfiles p where p.id = f.emitida_por),
             'motivo', f.motivo_anulacion,
             'cobrada_en', cob.ultimo,
             'resumen', (select string_agg(r.descripcion || ' · ' || trim_scale(r.cantidad)::text || ' ' || r.unidad, ' · ' order by r.linea)
                           from public.factura_venta_renglones r where r.factura_id = f.id),
             'cadena', jsonb_build_object(
                         'fac', f.numero,
                         'ne', (select string_agg(n2.numero, ', ' order by n2.numero) from public.notas_entrega n2 where n2.factura_id = f.id))) as j
      from public.facturas_venta f
      join public.clientes cl on cl.id = f.cliente_id
      left join cob on cob.factura_id = f.id
     where f.estado = 'EMITIDA'
        or coalesce(f.anulada_en, cob.ultimo, f.emitida_en) >= v_desde
  )
  select coalesce(jsonb_agg(
           case when v_montos then j
                else j - array['total', 'total_usd', 'total_bs', 'iva', 'igtf', 'aplicado', 'saldo_usd',
                               'cobrado', 'retencion_usd', 'renglones', 'monto_usd_combinado', 'monto_bs_combinado'] end
           order by (j->>'at') desc nulls last), '[]'::jsonb)
    into v_out
    from filas;

  return v_out;
end;
$$;
revoke all on function public.ventas_tablero(integer) from public, anon;
grant execute on function public.ventas_tablero(integer) to authenticated;
