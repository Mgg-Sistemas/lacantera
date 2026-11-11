-- INVENTARIO: SOLO LOS MATERIALES DE VENTA (la dueña, 11/11/2026: «vacía el
-- inventario y los almacenes, tienes el permiso… SOLO QUIERO ESTO EN EL
-- INVENTARIO», con la lista de precios de los materiales).
--
-- Decidió (11/11/2026):
--   · Los demás artículos (insumos, herramientas, víveres, equipos, repuestos,
--     EPP, lubricantes) se BORRAN con su historial, con respaldo antes.
--   · El COMBUSTIBLE y sus tanques se quedan: el módulo de Combustible sigue.
--   · Quedan el ALMACÉN GENERAL (ahí recibe Compras) y los patios. También
--     EN CAMINO, que es el almacén de tránsito de todos los traslados.
--   · El stock de los materiales queda como está.
--
-- Todo va en una transacción: si cualquier comprobación falla, no se borra nada.
-- Antes de tocar nada se copia cada tabla afectada a `respaldo_inventario_20261111`.

create schema if not exists respaldo_inventario_20261111;
revoke all on schema respaldo_inventario_20261111 from public, anon, authenticated;

do $limpieza$
declare
  v_quedan_almacenes constant text[] :=
    array['ALM-GEN', 'PAT-MP', 'PAT-PF', 'PAT-LAV', 'PAT-BASE', 'CMB-TAN', 'CMB-INI', 'EN-CAMINO'];
  v_tabla text;
  v_n     bigint;
  v_antes jsonb;
  v_despues jsonb;
begin
  -- -------------------------------------------------------------------------
  -- 0. Respaldo completo de cada tabla que se toca
  -- -------------------------------------------------------------------------
  foreach v_tabla in array array[
    'articulos', 'almacenes', 'inventario_movimientos', 'traslados', 'inventario_bajas',
    'asignaciones_herramienta', 'conteos', 'conteo_envases', 'comidas', 'comida_renglones',
    'solicitudes_salida', 'solicitud_salida_renglones', 'solicitud_renglones', 'cotizacion_renglones',
    'orden_renglones', 'solicitud_atendido_almacen', 'codigos_retirados', 'articulo_presentaciones',
    'inventario_avisos_stock', 'precios_venta', 'taller_especialidades', 'sitios_operacion',
    'solicitudes_pedido', 'control_despacho', 'maquina_agregados', 'mantenimiento_repuestos'
  ] loop
    execute format('create table respaldo_inventario_20261111.%I as table public.%I', v_tabla, v_tabla);
  end loop;
  create table respaldo_inventario_20261111.compras_fichas_de_solicitud as table private.compras_fichas_de_solicitud;

  -- -------------------------------------------------------------------------
  -- 1. Qué se va
  -- -------------------------------------------------------------------------
  create temp table x_art on commit drop as
    select id from public.articulos where categoria not in ('PRODUCTO', 'COMBUSTIBLE');
  create temp table x_alm on commit drop as
    select id from public.almacenes where codigo <> all (v_quedan_almacenes);

  if (select count(*) from public.articulos where categoria = 'PRODUCTO') <> 10
     or (select count(*) from public.articulos where categoria = 'COMBUSTIBLE') <> 1 then
    raise exception 'Se esperaban 10 materiales de venta y 1 combustible; revisar antes de borrar';
  end if;
  if (select count(*) from public.almacenes where codigo = any (v_quedan_almacenes)) <> 8 then
    raise exception 'No están los 8 almacenes que se quedan; revisar antes de borrar';
  end if;

  -- Los movimientos de esos artículos o almacenes, y los encadenados a ellos
  -- (reversos, traslados), para que el libro no quede con referencias rotas.
  create temp table x_mov (id bigint primary key) on commit drop;
  insert into x_mov
    select m.id from public.inventario_movimientos m
     where m.articulo_id in (select id from x_art) or m.almacen_id in (select id from x_alm);
  loop
    insert into x_mov
      select m.id from public.inventario_movimientos m
       where m.id not in (select id from x_mov)
         and (m.movimiento_origen in (select id from x_mov)
              or m.id in (select d.movimiento_origen from public.inventario_movimientos d
                           where d.id in (select id from x_mov) and d.movimiento_origen is not null));
    exit when not found;
  end loop;

  -- Nada de lo vendido ni del combustible puede caer en lo que se borra.
  if exists (select 1 from public.inventario_movimientos m join public.articulos a on a.id = m.articulo_id
              where m.id in (select id from x_mov) and a.categoria in ('PRODUCTO', 'COMBUSTIBLE')) then
    raise exception 'Un movimiento de un material de venta o del combustible quedó entre lo que se borra';
  end if;
  if exists (select 1 from public.nota_entrega_renglones where movimiento_id in (select id from x_mov) or movimiento_salida_id in (select id from x_mov))
     or exists (select 1 from public.factura_venta_renglones where movimiento_id in (select id from x_mov))
     or exists (select 1 from public.nota_credito_renglones where movimiento_id in (select id from x_mov))
     or exists (select 1 from public.despachos_combustible where movimiento_id in (select id from x_mov))
     or exists (select 1 from public.combustible_mov_datos where movimiento_id in (select id from x_mov) or merma_de_mov_id in (select id from x_mov))
     or exists (select 1 from public.cobros_con_material where entrada_id in (select id from x_mov))
     or exists (select 1 from public.produccion_renglones where movimiento_id in (select id from x_mov)) then
    raise exception 'Un documento de venta o de combustible apunta a un movimiento que se iba a borrar';
  end if;
  if exists (select 1 from public.notas_entrega where almacen_id in (select id from x_alm))
     or exists (select 1 from public.solicitudes_despacho where almacen_id in (select id from x_alm))
     or exists (select 1 from public.despachos_combustible where almacen_id in (select id from x_alm)) then
    raise exception 'Una venta o un despacho de combustible es de un almacén que se iba a borrar';
  end if;

  -- Lo que tiene que quedar igual
  select jsonb_build_object(
    'notas', (select count(*) from public.notas_entrega),
    'notas_renglones', (select count(*) from public.nota_entrega_renglones),
    'facturas_renglones', (select count(*) from public.factura_venta_renglones),
    'cotizaciones_venta', (select count(*) from public.cotizacion_venta_renglones),
    'despachos', (select count(*) from public.solicitudes_despacho),
    'combustible', (select count(*) from public.despachos_combustible),
    'stock', (select jsonb_object_agg(articulo_id, s) from (
               select m.articulo_id, sum(m.signo * m.cantidad) s
                 from public.inventario_movimientos m join public.articulos a on a.id = m.articulo_id
                where a.categoria in ('PRODUCTO', 'COMBUSTIBLE') group by 1) t))
    into v_antes;

  -- -------------------------------------------------------------------------
  -- 2. Se borra. Los candados del libro y del histórico se sueltan solo aquí.
  -- -------------------------------------------------------------------------
  alter table public.inventario_movimientos disable trigger trg_movimientos_inmutables;
  alter table public.solicitud_renglones disable trigger trg_historico_no_se_mueve;
  alter table public.orden_renglones disable trigger trg_historico_no_se_mueve;
  alter table public.cotizacion_renglones disable trigger trg_cotizacion_renglones_total;

  -- Los pedidos viejos que iban a un almacén que se borra pasan al General.
  update public.solicitudes_pedido
     set destino_almacen_id = (select id from public.almacenes where codigo = 'ALM-GEN')
   where destino_almacen_id in (select id from x_alm);

  update public.asignaciones_herramienta set devuelta_de = null
   where devuelta_de in (select id from public.asignaciones_herramienta
                          where articulo_id in (select id from x_art) or almacen_id in (select id from x_alm)
                             or movimiento_id in (select id from x_mov));
  delete from public.asignaciones_herramienta
   where articulo_id in (select id from x_art) or almacen_id in (select id from x_alm)
      or movimiento_id in (select id from x_mov);

  delete from public.conteos
   where articulo_id in (select id from x_art) or almacen_id in (select id from x_alm)
      or movimiento_id in (select id from x_mov) or corte_movimiento in (select id from x_mov);

  delete from public.comida_renglones
   where articulo_id in (select id from x_art) or movimiento_id in (select id from x_mov)
      or comida_id in (select id from public.comidas where almacen_id in (select id from x_alm));
  delete from public.comidas where almacen_id in (select id from x_alm);

  delete from public.solicitud_salida_renglones where articulo_id in (select id from x_art);
  delete from public.solicitudes_salida s
   where (s.almacen_id in (select id from x_alm)
          or not exists (select 1 from public.solicitud_salida_renglones r where r.solicitud_id = s.id))
     and not exists (select 1 from public.notas_entrega n where n.solicitud_salida_id = s.id)
     and not exists (select 1 from public.pagos_con_material p where p.solicitud_id = s.id);

  delete from public.solicitud_atendido_almacen
   where articulo_id in (select id from x_art) or almacen_id in (select id from x_alm);
  delete from public.solicitud_renglones where articulo_id in (select id from x_art);

  delete from public.traslados
   where articulo_id in (select id from x_art)
      or origen_id in (select id from x_alm) or destino_id in (select id from x_alm)
      or mov_salida in (select id from x_mov) or mov_en_camino in (select id from x_mov)
      or mov_llegada in (select id from x_mov) or mov_vuelta in (select id from x_mov);

  delete from public.maquina_agregados
   where movimiento_id in (select id from x_mov) or movimiento_retiro_id in (select id from x_mov);
  delete from public.mantenimiento_repuestos where movimiento_id in (select id from x_mov);

  delete from public.inventario_movimientos where id in (select id from x_mov);

  delete from public.orden_renglones where articulo_id in (select id from x_art);
  delete from public.codigos_retirados where articulo_id in (select id from x_art);
  delete from public.articulos where id in (select id from x_art);
  delete from public.almacenes where id in (select id from x_alm);

  alter table public.inventario_movimientos enable trigger trg_movimientos_inmutables;
  alter table public.solicitud_renglones enable trigger trg_historico_no_se_mueve;
  alter table public.orden_renglones enable trigger trg_historico_no_se_mueve;
  alter table public.cotizacion_renglones enable trigger trg_cotizacion_renglones_total;

  -- -------------------------------------------------------------------------
  -- 3. Comprobación: si algo no cuadra, se deshace todo
  -- -------------------------------------------------------------------------
  select jsonb_build_object(
    'notas', (select count(*) from public.notas_entrega),
    'notas_renglones', (select count(*) from public.nota_entrega_renglones),
    'facturas_renglones', (select count(*) from public.factura_venta_renglones),
    'cotizaciones_venta', (select count(*) from public.cotizacion_venta_renglones),
    'despachos', (select count(*) from public.solicitudes_despacho),
    'combustible', (select count(*) from public.despachos_combustible),
    'stock', (select jsonb_object_agg(articulo_id, s) from (
               select m.articulo_id, sum(m.signo * m.cantidad) s
                 from public.inventario_movimientos m join public.articulos a on a.id = m.articulo_id
                where a.categoria in ('PRODUCTO', 'COMBUSTIBLE') group by 1) t))
    into v_despues;
  if v_antes <> v_despues then
    raise exception 'Cambió algo que debía quedar igual. Antes: %  Después: %', v_antes, v_despues;
  end if;

  select count(*) into v_n from public.articulos;
  if v_n <> 11 then
    raise exception 'Quedaron % artículos; se esperaban 11 (10 materiales y el combustible)', v_n;
  end if;
  select count(*) into v_n from public.almacenes;
  if v_n <> 8 then
    raise exception 'Quedaron % almacenes; se esperaban 8', v_n;
  end if;

  raise notice 'LISTO: quedan 11 artículos, 8 almacenes y % movimientos. Respaldo en respaldo_inventario_20261111.',
    (select count(*) from public.inventario_movimientos);
end
$limpieza$;
