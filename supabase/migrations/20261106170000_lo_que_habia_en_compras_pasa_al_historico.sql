/*
  LO QUE HABÍA EN COMPRAS PASA AL HISTÓRICO

  Angélica, 06/11/2026: «todo lo que está en el módulo de compras, lo coloques en
  un botón que diga histórico de compras, donde vas a colocar todo lo que está en
  compras COMO FINALIZÓ, sin sumar stock en los inventarios. Esto con el fin de
  dejar el módulo vacío para el nuevo flujo».

  QUÉ SE HACE Y QUÉ NO

  - Cada solicitud que existe hoy queda marcada con `historico_en`. El tablero
    deja de verla y aparece en la pantalla nueva «Histórico de compras» como
    FINALIZADA.
  - NO se toca su `estado` ni el de su orden. Una orden pagada y sin recibir
    sigue diciendo en la base que nunca llegó, porque es la verdad. Lo que
    cambia es que la compra ya no está en curso: se cerró por decisión, no
    porque haya llegado el material. Por eso se guarda también en qué columna
    estaba (`historico_columna`), y el histórico lo enseña.
  - NO entra nada al inventario. Ninguna recepción, ningún asiento. Para que
    nadie lo meta después por la puerta de atrás —Recepciones, el historial de
    directas, un enlace viejo—, unos disparadores frenan en la base cualquier
    recepción, pago, cancelación o cambio de estado de una compra del histórico.
  - Facturas, libro de compras, saldos y estadísticas de proveedor no se tocan:
    lo fiscal y lo que ya ocurrió sigue donde estaba.

  Es reversible: basta con volver `historico_en` a nulo.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. La marca
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.solicitudes_pedido
  add column if not exists historico_en      timestamptz,
  add column if not exists historico_por     uuid references auth.users(id),
  add column if not exists historico_columna text,
  add column if not exists historico_nota    text;

comment on column public.solicitudes_pedido.historico_en is
  'Cuándo la compra pasó al Histórico de compras. Con valor, la compra se lee como FINALIZADA y ya no se mueve: ni se recibe, ni se paga, ni cambia de estado.';
comment on column public.solicitudes_pedido.historico_columna is
  'En qué columna del tablero estaba al pasar al histórico (PAGADA, GERENTE, RECIBIDA…). Su estado real sigue en `estado` y en su orden.';

create index if not exists solicitudes_historico_idx
  on public.solicitudes_pedido (historico_en desc) where historico_en is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Todas las compras de hoy pasan al histórico
--
-- La columna se toma de la vista vieja, ANTES de redefinirla: es la misma
-- cuenta que veía el usuario en el tablero esta mañana.
-- ═══════════════════════════════════════════════════════════════════════════

with en_el_tablero as (
  select t.solicitud_id, t.columna from public.v_compras_tablero t
)
update public.solicitudes_pedido s
   set historico_en      = now(),
       historico_columna = coalesce(t.columna, 'PEDIDO'),
       historico_nota    = 'Pasó al Histórico de compras al arrancar el flujo nuevo (06/11/2026). Se cierra como finalizada sin mover inventario.'
  from en_el_tablero t
 where t.solicitud_id = s.id
   and s.historico_en is null;

-- Las que la vista no trajera (no debería haber ninguna: el tablero no deja caer
-- tarjetas) entran igual.
update public.solicitudes_pedido
   set historico_en      = now(),
       historico_columna = 'PEDIDO',
       historico_nota    = 'Pasó al Histórico de compras al arrancar el flujo nuevo (06/11/2026). Se cierra como finalizada sin mover inventario.'
 where historico_en is null;

-- Cada una deja su renglón en la bitácora: quien abra la compra lee cuándo y por
-- qué se cerró.
insert into public.compras_bitacora (documento_tipo, documento_id, estado_anterior, estado_nuevo, nota, actor_id)
select 'SOLICITUD', s.id, s.estado, 'FINALIZADA', s.historico_nota, null
  from public.solicitudes_pedido s
 where s.historico_en is not null
   and not exists (
     select 1 from public.compras_bitacora b
      where b.documento_tipo = 'SOLICITUD' and b.documento_id = s.id and b.estado_nuevo = 'FINALIZADA'
   );

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Las vistas
--
-- `v_compras_todas` es el tablero de siempre más la marca. El tablero y el
-- histórico salen de ella: la columna de cada tarjeta se calcula en un solo
-- sitio y no pueden contar distinto.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_compras_todas
with (security_invoker = on) as
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

-- El tablero: solo lo que está en curso. Mismas columnas, mismo orden.
create or replace view public.v_compras_tablero
with (security_invoker = on) as
select solicitud_id, numero, titulo, prioridad, requerida_para, destino, destino_almacen_id,
       estado_solicitud, creada_en, solicitante_id, solicitante, solicitante_cargo,
       registrada_por, registrada_por_nombre, orden_id, orden_numero, estado_orden,
       condicion_pago, fecha_pago, entrega_estimada, desistio_resolucion, proveedor,
       moneda, total, total_usd, total_bs, cotizaciones, renglones, dias_sin_recibir,
       columna, propuestas
  from public.v_compras_todas
 where historico_en is null;

-- El histórico: lo que se cerró.
create or replace view public.v_compras_historico
with (security_invoker = on) as
select *
  from public.v_compras_todas
 where historico_en is not null;

revoke all on public.v_compras_todas     from anon;
revoke all on public.v_compras_historico from anon;
grant select on public.v_compras_todas     to authenticated;
grant select on public.v_compras_historico to authenticated;

-- Lo que falta respaldar: lo del histórico ya no se le reclama a nadie.
create or replace view public.v_compras_sin_respaldo
with (security_invoker = on) as
 SELECT o.id,
    o.numero,
    o.estado,
    o.condicion_pago,
    o.comprobante_tipo,
    p.nombre AS proveedor,
    o.total,
    o.moneda,
    f.id AS factura_id,
    f.numero_factura,
    f.id IS NOT NULL AS tiene_factura,
    f.archivo_path IS NOT NULL AS tiene_papel,
        CASE
            WHEN o.comprobante_tipo IS NULL THEN 'SIN_DECLARAR'::text
            WHEN o.comprobante_tipo = 'FACTURA'::text AND f.id IS NULL THEN 'FACTURA_SIN_REGISTRAR'::text
            WHEN o.comprobante_tipo = 'FACTURA'::text AND f.archivo_path IS NULL THEN 'FACTURA_SIN_PAPEL'::text
            ELSE NULL::text
        END AS falta
   FROM public.ordenes_compra o
     JOIN public.proveedores p ON p.id = o.proveedor_id
     LEFT JOIN LATERAL ( SELECT f2.id,
            f2.numero_factura,
            f2.archivo_path
           FROM public.facturas_compra f2
          WHERE f2.orden_id = o.id AND f2.estado <> 'ANULADA'::text
          ORDER BY f2.id DESC
         LIMIT 1) f ON true
  WHERE o.estado <> 'CANCELADA'::text
    AND NOT EXISTS ( SELECT 1
           FROM public.solicitudes_pedido sh
          WHERE sh.id = o.solicitud_id AND sh.historico_en IS NOT NULL)
    AND ((EXISTS ( SELECT 1
           FROM public.instrucciones_pago i
          WHERE i.orden_id = o.id AND i.estado = 'PAGADA'::text)) OR (EXISTS ( SELECT 1
           FROM public.orden_renglones r
          WHERE r.orden_id = o.id AND r.cantidad_recibida > 0::numeric)))
    AND (o.comprobante_tipo IS NULL OR o.comprobante_tipo = 'FACTURA'::text AND (f.id IS NULL OR f.archivo_path IS NULL));

-- La cola de pagos: lo del histórico no se paga.
create or replace view public.v_cuentas_por_pagar
with (security_invoker = on) as
 SELECT i.id AS instruccion_id,
    i.orden_id,
    o.numero AS orden_numero,
    o.solicitud_id,
    s.titulo,
    p.id AS proveedor_id,
    p.nombre AS proveedor,
    p.rif,
    i.metodo,
    i.moneda,
    i.monto,
    i.monto_bs,
    i.monto_usd,
    i.igtf_aplica,
    i.igtf_monto,
    i.banco,
    i.numero_cuenta,
    i.titular,
    i.documento,
    i.telefono,
    i.correo_binance,
    i.red_cripto,
    i.receptor,
    i.nota,
    i.creada_en,
    private.hoy_aqui() - private.dia_aqui(i.creada_en) AS dias_esperando,
    s.prioridad,
        CASE s.prioridad
            WHEN 'URGENTE'::text THEN 1
            WHEN 'ALTA'::text THEN 2
            ELSE 3
        END AS prioridad_orden,
    COALESCE(al.nombre, s.destino, 'Sin definir'::text) AS unidad,
    s.destino_almacen_id,
    s.requerida_para
   FROM public.instrucciones_pago i
     JOIN public.ordenes_compra o ON o.id = i.orden_id
     JOIN public.solicitudes_pedido s ON s.id = o.solicitud_id
     LEFT JOIN public.almacenes al ON al.id = s.destino_almacen_id
     LEFT JOIN public.proveedores p ON p.id = o.proveedor_id
  WHERE i.estado = 'POR_PAGAR'::text AND o.estado <> 'CANCELADA'::text AND s.historico_en IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Lo del histórico no se mueve
--
-- Va en disparadores y no en cada función porque son veinte puertas —recibir,
-- recibir completa, pagar, pagar con material, cancelar, desistir, editar,
-- cotizar…— y todas terminan escribiendo en estas tablas. Un disparador las
-- cubre todas, incluidas las que se escriban mañana.
--
-- Lo fiscal queda fuera a propósito: registrar la factura de una compra vieja
-- o corregir un costo no cambia el estado ni lo recibido.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.frenar_compra_del_historico(p_solicitud_id bigint)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_numero text;
  v_en     timestamptz;
begin
  if p_solicitud_id is null then
    return;
  end if;

  select numero, historico_en into v_numero, v_en
    from public.solicitudes_pedido
   where id = p_solicitud_id;

  if v_en is not null then
    raise exception 'La compra % está en el Histórico de compras: se cerró como finalizada y ya no se recibe, ni se paga, ni cambia de estado.', v_numero
      using errcode = '55000';
  end if;
end;
$$;

create or replace function private.el_historico_no_se_mueve()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud bigint;
begin
  case tg_table_name
    when 'solicitudes_pedido' then
      -- Solo frena si ya estaba en el histórico y le cambian el estado. Ponerla
      -- o quitarla del histórico no cambia el estado y pasa.
      if old.historico_en is not null and new.estado is distinct from old.estado then
        perform private.frenar_compra_del_historico(old.id);
      end if;
      return new;

    when 'ordenes_compra' then
      if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then
        return new;
      end if;
      v_solicitud := coalesce(new.solicitud_id, old.solicitud_id);

    when 'orden_renglones' then
      if tg_op = 'UPDATE' and new.cantidad_recibida is not distinct from old.cantidad_recibida then
        return new;
      end if;
      select o.solicitud_id into v_solicitud
        from public.ordenes_compra o
       where o.id = coalesce(new.orden_id, old.orden_id);

    when 'instrucciones_pago' then
      -- Una instrucción que ya existía tampoco se paga, se devuelve ni se
      -- anula: frena cualquier cambio de su estado, no solo las nuevas.
      if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then
        return new;
      end if;
      select o.solicitud_id into v_solicitud
        from public.ordenes_compra o
       where o.id = coalesce(new.orden_id, old.orden_id);

    when 'cotizaciones', 'solicitud_renglones' then
      v_solicitud := coalesce(new.solicitud_id, old.solicitud_id);

    else
      return coalesce(new, old);
  end case;

  perform private.frenar_compra_del_historico(v_solicitud);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_historico_no_se_mueve on public.solicitudes_pedido;
create trigger trg_historico_no_se_mueve
  before update on public.solicitudes_pedido
  for each row execute function private.el_historico_no_se_mueve();

drop trigger if exists trg_historico_no_se_mueve on public.ordenes_compra;
create trigger trg_historico_no_se_mueve
  before insert or update on public.ordenes_compra
  for each row execute function private.el_historico_no_se_mueve();

drop trigger if exists trg_historico_no_se_mueve on public.orden_renglones;
create trigger trg_historico_no_se_mueve
  before insert or update or delete on public.orden_renglones
  for each row execute function private.el_historico_no_se_mueve();

drop trigger if exists trg_historico_no_se_mueve on public.instrucciones_pago;
create trigger trg_historico_no_se_mueve
  before insert or update on public.instrucciones_pago
  for each row execute function private.el_historico_no_se_mueve();

drop trigger if exists trg_historico_no_se_mueve on public.cotizaciones;
create trigger trg_historico_no_se_mueve
  before insert or delete on public.cotizaciones
  for each row execute function private.el_historico_no_se_mueve();

drop trigger if exists trg_historico_no_se_mueve on public.solicitud_renglones;
create trigger trg_historico_no_se_mueve
  before insert or delete on public.solicitud_renglones
  for each row execute function private.el_historico_no_se_mueve();
