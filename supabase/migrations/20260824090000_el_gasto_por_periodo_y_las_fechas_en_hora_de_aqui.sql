-- ---------------------------------------------------------------------------
-- El gasto por unidad, en el período que se pida — y las fechas en hora de aquí
--
-- Nos pidieron poder gestionar los movimientos de gastos por fecha. Los dos
-- libros —el de inventario y el de dinero— ya se filtraban; este reporte no,
-- porque era una vista con dos cifras fijas: el total de siempre y el mes
-- corrido.
--
-- Sirve para «cuánto llevamos este mes» y no sirve para «cuánto gastó el taller
-- en el segundo trimestre», que es la pregunta que se hace al cerrar un
-- presupuesto.
--
-- PASA DE VISTA A FUNCIÓN
--
-- Una vista no recibe parámetros, y filtrarla desde fuera no sirve: ya viene
-- agregada, no quedan filas que filtrar sino totales ya sumados. La vista se
-- retira para no dejar dos verdades; con las fechas en nulo la función devuelve
-- exactamente lo que devolvía ella.
--
-- EL DESFASE DE CUATRO HORAS
--
-- Se vio al probar el filtro. El servidor va en UTC y Venezuela va cuatro horas
-- por detrás, así que todo lo que se registre después de las ocho de la noche
-- cae, para el servidor, en el día siguiente.
--
-- La orden OC-2026-0003 se creó a las 02:55 UTC del 22, que en la cantera
-- fueron las 22:55 del 21: quien filtrara «el 21» no la veía, y quien filtrara
-- «el 22» veía una compra que allí se hizo el día anterior. No es un caso raro
-- —una cantera trabaja por turnos y el de la noche registra después de las
-- ocho todos los días.
--
-- Afectaba también a dos vistas escritas el día anterior: «invertido este mes»
-- del proveedor y «días esperando» de la cola de pagos. Poca cosa cada día, y
-- exactamente el tipo de error que nadie reporta —«ayer decía 3 y hoy dice 3»—
-- pero que descuadra un cierre de mes.
--
-- POR QUÉ LA CONVERSIÓN VA EN LÍNEA Y NO EN UN AYUDANTE
--
-- Se escribieron `private.hoy_aqui()` y `private.dia_aqui()`, y en las vistas
-- funcionan. En esta función no: es `security invoker` —tiene que serlo, lee
-- solicitudes y órdenes y la RLS decide qué ve cada quien— y desde el navegador
-- devolvía 403 con «permission denied for schema private».
--
-- Y es correcto que lo devuelva: `authenticated` no tiene USAGE sobre `private`
-- a propósito. En una vista el nombre queda resuelto al crearla; en una función
-- con `search_path` vacío se resuelve al ejecutarla, y ahí se comprueba el
-- esquema. Cuesta repetir el nombre de la zona y a cambio la función no depende
-- de un detalle sutil de resolución de nombres.
-- ---------------------------------------------------------------------------

create or replace function private.hoy_aqui()
returns date
language sql
stable
security definer
set search_path to ''
as $func$
  select (now() at time zone 'America/Caracas')::date;
$func$;

comment on function private.hoy_aqui() is
  'El dia de hoy en la cantera. El servidor va en UTC y Venezuela cuatro horas '
  'por detras: despues de las ocho de la noche, current_date ya dice mañana.';

create or replace function private.dia_aqui(p_momento timestamptz)
returns date
language sql
immutable
security definer
set search_path to ''
as $func$
  select (p_momento at time zone 'America/Caracas')::date;
$func$;

comment on function private.dia_aqui(timestamptz) is
  'En que dia de la cantera cayo un momento. Un registro de las 22:55 en '
  'Venezuela es de las 02:55 UTC del dia siguiente, y sin esto se cuenta en el '
  'dia equivocado.';

drop view if exists public.v_gasto_por_unidad;

create or replace function public.gasto_por_unidad(
  p_desde date default null,
  p_hasta date default null
) returns table (
  unidad            text,
  tipo_sitio        text,
  almacen_id        bigint,
  pedidos           bigint,
  ordenes           bigint,
  gastado_usd       numeric,
  gastado_mes_usd   numeric,
  consumido_usd     numeric,
  ultima_compra     timestamptz
)
language sql
stable
security invoker
set search_path to ''
as $func$
  with pedidos as (
    select s.id                                          as solicitud_id,
           s.destino_almacen_id,
           coalesce(al.nombre, s.destino, 'Sin definir')  as unidad,
           al.tipo                                       as tipo_sitio,
           o.id                                          as orden_id,
           o.creada_en,
           -- El dia en que paso EN LA CANTERA.
           (o.creada_en at time zone 'America/Caracas')::date as dia,
           o.total_usd
      from public.solicitudes_pedido s
      left join public.almacenes al on al.id = s.destino_almacen_id
      left join public.ordenes_compra o
             on o.solicitud_id = s.id
            and o.estado <> 'CANCELADA'
            -- El periodo se aplica a la ORDEN, no al pedido: el gasto nace
            -- cuando se aprueba y queda comprometido, no cuando alguien lo
            -- pidio. Un pedido de marzo aprobado en abril es gasto de abril.
            and (p_desde is null or (o.creada_en at time zone 'America/Caracas')::date >= p_desde)
            and (p_hasta is null or (o.creada_en at time zone 'America/Caracas')::date <= p_hasta)
  ),
  consumo as (
    -- Lo que salio del almacen y se uso. La baja no entra: dar algo por perdido
    -- no es consumirlo, y sumarlas haria que un robo pareciera actividad.
    --
    -- Aqui `fecha` ya es un date del dia en que paso: no hay zona que convertir.
    select m.almacen_id, sum(m.valor_usd) as consumido_usd
      from public.inventario_movimientos m
     where m.tipo = 'SALIDA_CONSUMO'
       and (p_desde is null or m.fecha >= p_desde)
       and (p_hasta is null or m.fecha <= p_hasta)
     group by m.almacen_id
  )
  select p.unidad,
         max(p.tipo_sitio)                                as tipo_sitio,
         max(p.destino_almacen_id)                        as almacen_id,

         count(distinct p.solicitud_id)                   as pedidos,
         count(distinct p.orden_id)                       as ordenes,

         coalesce(sum(p.total_usd), 0)                    as gastado_usd,
         coalesce(sum(p.total_usd) filter (
           where p.dia >= date_trunc('month', (now() at time zone 'America/Caracas')::date)::date
         ), 0)                                            as gastado_mes_usd,

         coalesce(max(c.consumido_usd), 0)                as consumido_usd,
         max(p.creada_en)                                 as ultima_compra
    from pedidos p
    left join consumo c on c.almacen_id = p.destino_almacen_id
   group by p.unidad
  -- Con periodo puesto solo salen las unidades que tuvieron algo: una lista de
  -- quince sitios en cero no responde a nadie. Sin periodo salen todas, que es
  -- como se lee el reporte completo.
  having p_desde is null and p_hasta is null
      or count(distinct p.orden_id) > 0
      or coalesce(max(c.consumido_usd), 0) > 0;
$func$;

comment on function public.gasto_por_unidad(date, date) is
  'Que unidad genera mas gasto y cual consume mas material, en el periodo que se '
  'pida. Son dos preguntas distintas: se puede comprar mucho para un sitio que '
  'todavia no lo ha usado. Sin fechas, devuelve todo.';

revoke execute on function public.gasto_por_unidad(date, date) from public, anon;
grant  execute on function public.gasto_por_unidad(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Las dos vistas del día anterior, con la zona corregida
--
-- Aquí sí se usan los ayudantes: en una vista el nombre queda resuelto al
-- crearla y no hace falta USAGE sobre `private` al consultarla. Comprobado
-- desde el navegador con una sesión normal.
-- ---------------------------------------------------------------------------
create or replace view public.v_proveedor_resumen as
with ordenes as (
  select o.proveedor_id, o.id, o.creada_en, o.total_usd
    from public.ordenes_compra o
   where o.estado <> 'CANCELADA'
)
select p.id as proveedor_id,
       p.nombre,
       p.rif,

       count(o.id)                                        as ordenes,
       coalesce(sum(o.total_usd), 0)                      as invertido_usd,

       coalesce(sum(o.total_usd) filter (
         where private.dia_aqui(o.creada_en) >= date_trunc('month', private.hoy_aqui())::date
       ), 0)                                              as invertido_mes_usd,

       count(o.id) filter (
         where private.dia_aqui(o.creada_en) >= date_trunc('month', private.hoy_aqui())::date
       )                                                  as ordenes_mes,

       max(o.creada_en)                                   as ultima_compra,

       (select r.descripcion
          from public.orden_renglones r
          join ordenes o2 on o2.id = r.orden_id
         where o2.proveedor_id = p.id
         group by r.descripcion
         order by count(*) desc, sum(r.subtotal) desc
         limit 1)                                         as articulo_frecuente,

       (select count(*)
          from public.orden_renglones r
          join ordenes o2 on o2.id = r.orden_id
         where o2.proveedor_id = p.id)                     as renglones

  from public.proveedores p
  left join ordenes o on o.proveedor_id = p.id
 group by p.id, p.nombre, p.rif;

alter view public.v_proveedor_resumen set (security_invoker = true);

create or replace view public.v_cuentas_por_pagar as
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
      WHEN 'URGENTE' THEN 1
      WHEN 'ALTA'    THEN 2
      ELSE 3
    END AS prioridad_orden,
    COALESCE(al.nombre, s.destino, 'Sin definir') AS unidad,
    s.destino_almacen_id,
    s.requerida_para
   FROM instrucciones_pago i
     JOIN ordenes_compra o ON o.id = i.orden_id
     JOIN solicitudes_pedido s ON s.id = o.solicitud_id
     LEFT JOIN almacenes al ON al.id = s.destino_almacen_id
     LEFT JOIN proveedores p ON p.id = o.proveedor_id
  WHERE i.estado = 'POR_PAGAR'::text AND o.estado <> 'CANCELADA'::text;

alter view public.v_cuentas_por_pagar set (security_invoker = true);
