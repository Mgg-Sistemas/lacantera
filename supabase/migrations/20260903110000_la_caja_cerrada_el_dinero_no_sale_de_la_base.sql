/*
  LA CAJA CERRADA · PRIMERA CAPA: QUE EL DINERO NO SALGA DE LA BASE.

  Del plan de Ventas, bloque C. Se hace primero porque cambia la forma de las
  vistas que todo lo demás va a leer; hacerlo al final obligaría a rehacerlo.

  EL PROBLEMA QUE RESUELVE

  Hoy 41 de las 96 políticas de lectura están abiertas a cualquier sesión
  autenticada. Eso significa que quien tenga una cuenta —el operador de romana,
  el de almacén— puede pedirle los precios y los totales a la API sin pasar por
  ninguna pantalla. Esconder columnas en React sería un cartel de «no mirar»
  sobre una puerta abierta.

  POR QUÉ SE ANULAN COLUMNAS Y NO SE PARTEN LAS VISTAS EN DOS

  El plan proponía dos vistas por entidad: una operativa sin dinero y otra
  completa. Se descartó, y conviene decir por qué para que nadie lo reabra:

    · Dos vistas no protegen por sí solas. Ambas se conceden a `authenticated`,
      que es el único rol que usa la aplicación, así que un GRANT no distingue
      entre quien puede ver dinero y quien no. Habría que ponerle la reja a la
      vista completa igualmente — o sea, esto mismo, más una vista de más.

    · Un envoltorio que leyera de la vista completa exigiría que esa vista
      dejara de ser `security_invoker`, y ahí se pierde la RLS de todo lo que
      hay debajo. Es exactamente la trampa que este proyecto ya pagó una vez.

  Así que la reja va dentro de la vista que lee las tablas, que sigue siendo
  `security_invoker`: las columnas de dinero devuelven NULL a quien no tiene la
  acción. La aplicación no se entera —mismas vistas, mismas columnas, mismos
  tipos—, y quien consulte la API a mano recibe los mismos nulos.

  El `(select private.puede_accion(...))` va entre paréntesis a propósito: como
  subconsulta escalar, Postgres la resuelve UNA vez por consulta y no una vez
  por fila. Es el mismo motivo por el que en este proyecto se escribe
  `(select auth.uid())` y no `auth.uid()`.

  QUÉ CAMBIA PARA QUIÉN, HOY

    · Las vistas de ventas: nada. El módulo VENTAS está en NINGUNO para todos
      los roles menos ADMIN desde que se escondió del MVP, así que hoy no hay
      nadie a quien quitarle algo.

    · La valoración de inventario: ALMACEN deja de ver el costo. Es el único
      cambio de comportamiento real de esta migración, y es deliberado —el
      almacenista mueve existencias, no valora la empresa—. COMPRAS y
      GERENTE_GENERAL lo conservan porque tienen INVENTARIO en TOTAL, que es lo
      que pide la acción. Si se decide devolvérselo a ALMACEN, se le concede la
      acción y ya: no hay que tocar ninguna vista.
*/

-- ---------------------------------------------------------------------------
-- Las acciones
-- ---------------------------------------------------------------------------

/*
  `VENTAS.VER_VENTAS` ya existía y su propio texto admitía el hueco: «hoy solo
  las notas de crédito se cierran de verdad con esta casilla; el resto se lee
  igual sin ella». A partir de aquí sí se cierra, así que el aviso sobra.
  Se reutiliza en vez de inventar una acción nueva: decía ya justo esto.

  Y SE LE QUITA EL NIVEL EQUIVALENTE, que es el cambio de fondo.

  Venía en LECTURA, lo que significa que le caía sola a cualquiera que pudiera
  entrar al módulo de Ventas. Christopher lo corrigió: el dinero de las ventas
  es «para admin y usuarios con permisos extendidos». Con el nivel puesto, dar
  `VENTAS: Lectura` a alguien para que despachara le entregaba de paso los
  precios, los totales y la cartera de cada cliente — sin que quien reparte el
  permiso llegara a enterarse.

  Sin nivel equivalente no la concede ningún escalón. Solo llega por tres
  caminos, los tres explícitos:

    · ser ADMIN, que se salta toda la maquinaria por definición;
    · que alguien la marque en el rol, casilla por casilla;
    · un permiso extendido, que es una autorización con fecha de inicio y de
      fin sobre una persona concreta.

  Se comprobó antes de tocarla que no la usaba nadie más: ni una función, ni
  una política de RLS, ni un rol la tenía marcada a mano. Solo estas vistas.
*/
update public.acciones
   set dice = 'Cotizaciones, despachos, facturas, cobros, notas de credito y la cuenta de cada cliente, incluidos los precios y los totales. Sin esta casilla los documentos se ven, pero todas las cifras de dinero llegan vacias, tambien si se consulta la API a mano. No la concede ningun nivel de modulo: hay que darla a mano o por permiso extendido.',
       nivel_equivalente = null
 where codigo = 'VENTAS.VER_VENTAS';

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
values
  ('INVENTARIO.VER_VALORACION', 'INVENTARIO', 'Ver el valor del inventario',
   'El costo promedio de cada articulo y cuanto vale lo que hay en cada almacen. Sin ella las existencias se ven en cantidades, pero sin dinero. Se pide para saber lo que cuesta la empresa, no para mover existencias.',
   15, 'TOTAL', true),

  ('VENTAS.VER_TABLERO_PRO', 'VENTAS', 'Abrir el tablero de ventas',
   'El acumulado del mes: facturado, cobrado, la brecha entre los dos y lo que le toca a la Gobernacion. No la concede ningun nivel de modulo por si sola: hay que darla a mano.',
   60, null, true)
on conflict (codigo) do update
   set nombre            = excluded.nombre,
       dice              = excluded.dice,
       orden             = excluded.orden,
       nivel_equivalente = excluded.nivel_equivalente,
       activa            = excluded.activa;

-- El tablero no lo abre ningun nivel de modulo, asi que hay que concederlo.
-- ADMIN no hace falta: `puede_accion_propia` se lo da por ser ADMIN.
insert into public.rol_acciones (rol, accion)
values ('GERENTE_GENERAL', 'VENTAS.VER_TABLERO_PRO')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Las existencias: las cantidades se ven; el dinero, no
-- ---------------------------------------------------------------------------
create or replace view public.v_existencias as
 SELECT m.almacen_id,
    a.codigo AS almacen_codigo,
    a.nombre AS almacen,
    m.articulo_id,
    art.codigo AS articulo_codigo,
    art.nombre AS articulo,
    art.categoria,
    art.unidad,
    art.stock_minimo,
    sum(m.cantidad * m.signo::numeric) AS existencia,
    case when (select private.puede_accion('INVENTARIO.VER_VALORACION'))
         then sum(m.valor_usd * m.signo::numeric) end AS valor_usd,
    case when (select private.puede_accion('INVENTARIO.VER_VALORACION')) then
        CASE
            WHEN sum(m.cantidad * m.signo::numeric) > 0::numeric THEN round(sum(m.valor_usd * m.signo::numeric) / sum(m.cantidad * m.signo::numeric), 6)
            ELSE NULL::numeric
        END
    end AS costo_promedio_usd,
    max(m.fecha) AS ultimo_movimiento,
    COALESCE(g.prestadas, 0::numeric) AS prestadas,
    sum(m.cantidad * m.signo::numeric) - COALESCE(g.prestadas, 0::numeric) AS disponibles,
    a.tipo AS almacen_tipo
   FROM inventario_movimientos m
     JOIN almacenes a ON a.id = m.almacen_id
     JOIN articulos art ON art.id = m.articulo_id
     LEFT JOIN ( SELECT asignaciones_herramienta.articulo_id,
            asignaciones_herramienta.almacen_id,
            sum(asignaciones_herramienta.cantidad) AS prestadas
           FROM asignaciones_herramienta
          WHERE asignaciones_herramienta.estado = 'ASIGNADA'::text
          GROUP BY asignaciones_herramienta.articulo_id, asignaciones_herramienta.almacen_id) g ON g.articulo_id = m.articulo_id AND g.almacen_id = m.almacen_id
  GROUP BY m.almacen_id, a.codigo, a.nombre, a.tipo, m.articulo_id, art.codigo, art.nombre, art.categoria, art.unidad, art.stock_minimo, g.prestadas;

alter view public.v_existencias set (security_invoker = on);

comment on view public.v_existencias is
  'Existencias por almacen y articulo. Las cantidades las ve cualquiera con lectura de inventario; `valor_usd` y `costo_promedio_usd` solo quien tenga INVENTARIO.VER_VALORACION, y llegan en nulo al resto.';

-- ---------------------------------------------------------------------------
-- Las facturas de venta
--
-- Se dejan a la vista la tasa, la tasa en dolares y la alicuota: no son dinero
-- de la empresa sino datos publicos —la tasa la publica el BCV y la alicuota la
-- fija el SENIAT—, y ocultarlas romperia el encabezado de los documentos sin
-- proteger nada.
-- ---------------------------------------------------------------------------
create or replace view public.v_facturas_venta as
 SELECT f.id,
    f.numero,
    f.numero_control,
    f.cliente_id,
    f.fecha,
    f.condicion_pago,
    f.dias_credito,
    f.vence_el,
    f.moneda,
    f.tasa,
    f.tasa_usd,
    f.alicuota_iva,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then f.descuento      end::numeric(20,6) AS descuento,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then f.flete          end::numeric(20,6) AS flete,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then f.subtotal       end::numeric(20,6) AS subtotal,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then f.base_imponible end::numeric(20,6) AS base_imponible,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then f.iva            end::numeric(20,6) AS iva,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then f.total          end::numeric(20,6) AS total,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then f.retencion_iva  end::numeric(20,6) AS retencion_iva,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then f.total_bs       end::numeric(20,6) AS total_bs,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then f.total_usd      end::numeric(20,6) AS total_usd,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then f.retencion_usd  end::numeric(20,6) AS retencion_usd,
    f.estado,
    f.observacion,
    f.emitida_por,
    f.emitida_en,
    f.motivo_anulacion,
    f.anulada_por,
    f.anulada_en,
    cl.nombre AS cliente,
    cl.rif AS cliente_rif,
    cl.direccion AS cliente_direccion,
    case when (select private.puede_accion('VENTAS.VER_VENTAS'))
         then COALESCE(c.cobrado, 0::numeric) end AS cobrado_usd,
    case when (select private.puede_accion('VENTAS.VER_VENTAS'))
         then COALESCE(n.acreditado, 0::numeric) end AS acreditado_usd,
    case when (select private.puede_accion('VENTAS.VER_VENTAS'))
         then GREATEST(f.total_usd - f.retencion_usd - COALESCE(c.cobrado, 0::numeric) - COALESCE(n.acreditado, 0::numeric), 0::numeric) end AS saldo_usd,
        CASE
            WHEN f.estado = 'EMITIDA'::text AND f.vence_el < CURRENT_DATE THEN CURRENT_DATE - f.vence_el
            ELSE 0
        END AS dias_vencida,
    (( SELECT count(*) AS count
           FROM factura_venta_renglones r
          WHERE r.factura_id = f.id))::integer AS renglones
   FROM facturas_venta f
     JOIN clientes cl ON cl.id = f.cliente_id
     LEFT JOIN LATERAL ( SELECT sum(co.monto_usd) AS cobrado
           FROM cobros_venta co
          WHERE co.factura_id = f.id AND co.estado = 'REGISTRADO'::text) c ON true
     LEFT JOIN LATERAL ( SELECT sum(nc.total_usd) AS acreditado
           FROM notas_credito nc
          WHERE nc.factura_id = f.id AND nc.estado = 'EMITIDA'::text) n ON true;

alter view public.v_facturas_venta set (security_invoker = on);

comment on view public.v_facturas_venta is
  'Las facturas de venta. Quien no tenga VENTAS.VER_VENTAS ve el documento —numero, cliente, fecha, estado, vencimiento— con todas las cifras en nulo. `v_cuentas_por_cobrar` cuelga de esta, asi que sin la accion no devuelve ni una fila.';

-- ---------------------------------------------------------------------------
-- Las notas de entrega
--
-- El operador de romana ve que salio, cuanto pesaba y para quien. No a cuanto.
-- Los pesos NO son dinero y se quedan enteros: son justamente su trabajo.
-- ---------------------------------------------------------------------------
create or replace view public.v_notas_entrega as
 SELECT n.id,
    n.numero,
    n.cliente_id,
    n.cotizacion_id,
    n.almacen_id,
    n.fecha,
    n.vehiculo,
    n.chofer,
    n.cedula_chofer,
    n.peso_bruto,
    n.peso_tara,
    n.ticket_romana,
    n.moneda,
    n.tasa,
    n.tasa_usd,
    n.alicuota_iva,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then n.descuento      end::numeric(20,6) AS descuento,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then n.flete          end::numeric(20,6) AS flete,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then n.subtotal       end::numeric(20,6) AS subtotal,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then n.base_imponible end::numeric(20,6) AS base_imponible,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then n.iva            end::numeric(20,6) AS iva,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then n.total          end::numeric(20,6) AS total,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then n.total_bs       end::numeric(20,6) AS total_bs,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then n.total_usd      end::numeric(20,6) AS total_usd,
    n.estado,
    n.factura_id,
    n.observacion,
    n.despachada_por,
    n.despachada_en,
    n.motivo_anulacion,
    n.anulada_por,
    n.anulada_en,
    cl.nombre AS cliente,
    cl.rif AS cliente_rif,
    al.nombre AS almacen,
    f.numero AS factura_numero,
        CASE
            WHEN n.peso_bruto IS NOT NULL AND n.peso_tara IS NOT NULL THEN n.peso_bruto - n.peso_tara
            ELSE NULL::numeric
        END AS peso_neto,
    (( SELECT count(*) AS count
           FROM nota_entrega_renglones r
          WHERE r.nota_id = n.id))::integer AS renglones
   FROM notas_entrega n
     JOIN clientes cl ON cl.id = n.cliente_id
     JOIN almacenes al ON al.id = n.almacen_id
     LEFT JOIN facturas_venta f ON f.id = n.factura_id;

alter view public.v_notas_entrega set (security_invoker = on);

comment on view public.v_notas_entrega is
  'Los despachos. Los pesos, el vehiculo y el chofer los ve quien opera la romana; los importes solo quien tenga VENTAS.VER_VENTAS.';

-- ---------------------------------------------------------------------------
-- Las cotizaciones
-- ---------------------------------------------------------------------------
create or replace view public.v_cotizaciones_venta as
 SELECT q.id,
    q.numero,
    q.cliente_id,
    q.fecha,
    q.validez_dias,
    q.moneda,
    q.tasa,
    q.tasa_usd,
    q.alicuota_iva,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then q.descuento      end::numeric(20,6) AS descuento,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then q.flete          end::numeric(20,6) AS flete,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then q.subtotal       end::numeric(20,6) AS subtotal,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then q.base_imponible end::numeric(20,6) AS base_imponible,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then q.iva            end::numeric(20,6) AS iva,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then q.total          end::numeric(20,6) AS total,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then q.total_bs       end::numeric(20,6) AS total_bs,
    case when (select private.puede_accion('VENTAS.VER_VENTAS')) then q.total_usd      end::numeric(20,6) AS total_usd,
    q.estado,
    q.observacion,
    q.motivo_cierre,
    q.creada_por,
    q.creada_en,
    q.cerrada_por,
    q.cerrada_en,
    cl.nombre AS cliente,
    cl.rif AS cliente_rif,
    q.fecha + q.validez_dias::integer AS vence_el,
    q.estado = 'ENVIADA'::text AND (q.fecha + q.validez_dias::integer) < CURRENT_DATE AS vencida,
    (( SELECT count(*) AS count
           FROM cotizacion_venta_renglones r
          WHERE r.cotizacion_id = q.id))::integer AS renglones,
    (( SELECT count(*) AS count
           FROM notas_entrega n
          WHERE n.cotizacion_id = q.id AND n.estado <> 'ANULADA'::text))::integer AS despachos
   FROM cotizaciones_venta q
     JOIN clientes cl ON cl.id = q.cliente_id;

alter view public.v_cotizaciones_venta set (security_invoker = on);

comment on view public.v_cotizaciones_venta is
  'Las cotizaciones de venta. Sin VENTAS.VER_VENTAS se ve a quien se cotizo y en que estado esta, pero no por cuanto.';

-- ---------------------------------------------------------------------------
-- El tablero: un solo sitio con lo que hoy esta disperso
--
-- No inventa cifras. Junta lo que ya calculan `v_alianza_mensual` y
-- `v_facturas_venta`, y le pone la reja de VENTAS.VER_TABLERO_PRO.
--
-- La reja va en el WHERE y no columna por columna, a diferencia de las vistas
-- de arriba: alli habia que conservar la forma porque la aplicacion ya las lee;
-- aqui la vista nace hoy y lo correcto es que no devuelva ni una fila a quien
-- no puede abrirla. Es tambien lo que hace `v_cuentas_por_cobrar` sin
-- proponerselo, porque filtra por `saldo_usd` y ese llega nulo.
--
-- LO QUE TODAVIA NO PUEDE DECIR, y conviene tenerlo delante al leerlo:
--
--   · El margen. Exige el costo de lo vendido renglon por renglon, y los
--     renglones de venta hoy solo guardan precio. Entra con la escalera, que
--     es cuando aparece la doble cifra —comercial y facturada— por linea.
--   · El 3 % social. `alianzas.pct_social` existe y vale 3, pero no hay base
--     sobre la que aplicarlo: 14 + 86 ya son 100. Se expone tal cual, sin
--     calcular, que es como esta hoy en `v_alianza_mensual`.
--   · Los intercambios. No existen todavia.
-- ---------------------------------------------------------------------------
create or replace view public.v_tablero_ventas as
  select a.mes,
         a.facturas,
         a.facturado_usd,
         a.acreditado_usd,
         a.bruto_usd,
         a.cobrado_usd,
         a.brecha_usd,
         a.pct_gobernacion,
         a.pct_aliada,
         a.pct_social,
         a.gobernacion_devengado_usd,
         a.gobernacion_sobre_cobrado_usd,
         a.aliada_usd,
         a.entregar_desde,
         a.dias_habiles_para_entregar
    from public.v_alianza_mensual a
   where (select private.puede_accion('VENTAS.VER_TABLERO_PRO'));

alter view public.v_tablero_ventas set (security_invoker = on);

comment on view public.v_tablero_ventas is
  'El acumulado del mes y lo que le toca a la Gobernacion. Solo devuelve filas a quien tenga VENTAS.VER_TABLERO_PRO; al resto le llega vacia. No calcula margen ni el 3 % social: ver el comentario de la migracion que la crea.';

-- ---------------------------------------------------------------------------
-- La cartera, cliente por cliente, con el cupo consumido
--
-- Es la otra mitad del tablero: cuanto debe cada quien, cuanto le queda de
-- credito y cuanto tiene vencido. `private.deuda_cliente` es la misma funcion
-- que usa la reja de `facturar_notas`, asi que el tablero y la reja no pueden
-- discrepar — que es justo el fallo que se quiere evitar.
-- ---------------------------------------------------------------------------
create or replace view public.v_tablero_cartera as
  select c.id as cliente_id,
         c.rif,
         c.nombre,
         c.condicion_pago,
         c.limite_credito,
         private.deuda_cliente(c.id) as deuda_usd,
         greatest(c.limite_credito - private.deuda_cliente(c.id), 0) as disponible_usd,
         case when c.limite_credito > 0
              then round(private.deuda_cliente(c.id) * 100 / c.limite_credito, 1) end as cupo_consumido_pct,
         (select count(*) from public.facturas_venta f
           where f.cliente_id = c.id and f.estado = 'EMITIDA'
             and f.vence_el < current_date) as facturas_vencidas
    from public.clientes c
   where c.activo
     and (select private.puede_accion('VENTAS.VER_TABLERO_PRO'));

alter view public.v_tablero_cartera set (security_invoker = on);

comment on view public.v_tablero_cartera is
  'Cuanto debe cada cliente, cuanto le queda de cupo y cuantas facturas lleva vencidas. Usa `private.deuda_cliente`, la misma que aplica la reja al facturar, para que el tablero y la reja no digan cosas distintas.';

-- ---------------------------------------------------------------------------
-- Los permisos de las dos vistas nuevas
--
-- Una vista recien creada no concede nada a nadie, asi que sin esto el tablero
-- responde «permission denied» incluso a quien tiene la accion. Se sigue el
-- mismo reparto que el resto de las vistas del sistema: lectura para
-- `authenticated` y nada para `anon`, que ni siquiera entra.
--
-- La reja de verdad no es este grant —lo tiene todo el mundo— sino el
-- `where private.puede_accion(...)` de dentro: quien no puede, se conecta y no
-- ve ni una fila.
-- ---------------------------------------------------------------------------
revoke all    on public.v_tablero_ventas  from public, anon;
grant  select on public.v_tablero_ventas    to authenticated;

revoke all    on public.v_tablero_cartera from public, anon;
grant  select on public.v_tablero_cartera   to authenticated;

-- ===========================================================================
-- LAS OTRAS PUERTAS DE LA MISMA HABITACION
--
-- Tapar `v_existencias` no tapa nada: al buscar quien mas expone el costo del
-- inventario aparecieron cuatro vistas mas, y tres de ellas lo calculan por su
-- cuenta desde `inventario_movimientos`, sin pasar por la que se acababa de
-- cerrar. Se comprobo con:
--
--   select viewname from pg_views
--    where schemaname = 'public'
--      and (definition ilike '%valor_usd%' or definition ilike '%costo_promedio%');
--
--   v_existencias_totales ... calcula el suyo      -> hay que cerrarla
--   v_existencias_por_tipo ... calcula el suyo     -> hay que cerrarla
--   v_dotaciones ........... lee los movimientos   -> hay que cerrarla
--   v_panel_resumen ........ lee `v_existencias`   -> hereda el nulo, pero lo
--                                                     convertia en 0 con un
--                                                     COALESCE; se le quita
--   v_herramientas ......... lee `v_existencias`   -> ya queda cerrada sola
--
-- Los cuerpos de abajo NO estan escritos a mano: salen de `pg_get_viewdef`
-- sobre el catalogo vivo, con la reja envuelta encima. Escribirlos de memoria
-- es como se revierte en silencio algo que otro arreglo dejo puesto.
-- ===========================================================================

create or replace view public.v_existencias_totales as
SELECT art.id AS articulo_id,
    art.codigo AS articulo_codigo,
    art.nombre AS articulo,
    art.categoria,
    art.unidad,
    art.stock_minimo,
    art.densidad_ton_m3,
    sum(m.cantidad * m.signo::numeric) AS existencia,
        CASE
            WHEN art.densidad_ton_m3 IS NULL THEN NULL::numeric
            WHEN art.unidad = 'M3'::text THEN round(sum(m.cantidad * m.signo::numeric) * art.densidad_ton_m3, 4)
            WHEN art.unidad = 'TON'::text THEN round(sum(m.cantidad * m.signo::numeric) / art.densidad_ton_m3, 4)
            ELSE NULL::numeric
        END AS existencia_equivalente,
        CASE
            WHEN art.densidad_ton_m3 IS NULL THEN NULL::text
            WHEN art.unidad = 'M3'::text THEN 'TON'::text
            WHEN art.unidad = 'TON'::text THEN 'M3'::text
            ELSE NULL::text
        END AS unidad_equivalente,
    case when (select private.puede_accion('INVENTARIO.VER_VALORACION')) then sum(m.valor_usd * m.signo::numeric) end AS valor_usd,
        case when (select private.puede_accion('INVENTARIO.VER_VALORACION')) then CASE
            WHEN sum(m.cantidad * m.signo::numeric) > 0::numeric THEN round(sum(m.valor_usd * m.signo::numeric) / sum(m.cantidad * m.signo::numeric), 6)
            ELSE NULL::numeric
        END end AS costo_promedio_usd,
    count(DISTINCT m.almacen_id) AS almacenes,
    max(m.fecha) AS ultimo_movimiento,
    COALESCE(g.prestadas, 0::numeric) AS prestadas,
    sum(m.cantidad * m.signo::numeric) - COALESCE(g.prestadas, 0::numeric) AS disponibles,
    art.modo_entrega
   FROM articulos art
     JOIN inventario_movimientos m ON m.articulo_id = art.id
     LEFT JOIN ( SELECT asignaciones_herramienta.articulo_id,
            sum(asignaciones_herramienta.cantidad) AS prestadas
           FROM asignaciones_herramienta
          WHERE asignaciones_herramienta.estado = 'ASIGNADA'::text
          GROUP BY asignaciones_herramienta.articulo_id) g ON g.articulo_id = art.id
  GROUP BY art.id, art.codigo, art.nombre, art.categoria, art.unidad, art.stock_minimo, art.densidad_ton_m3, art.modo_entrega, g.prestadas;

comment on view public.v_existencias_totales is
  'La existencia de cada articulo sumando todos los almacenes. El valor y el costo promedio solo los ve quien tenga INVENTARIO.VER_VALORACION; al resto le llegan nulos.';

create or replace view public.v_existencias_por_tipo as
SELECT a.tipo,
    m.articulo_id,
    art.codigo AS articulo_codigo,
    art.nombre AS articulo,
    art.unidad,
    sum(m.cantidad * m.signo::numeric) AS existencia,
    case when (select private.puede_accion('INVENTARIO.VER_VALORACION')) then sum(m.valor_usd * m.signo::numeric) end AS valor_usd,
    count(DISTINCT m.almacen_id) AS sitios
   FROM inventario_movimientos m
     JOIN almacenes a ON a.id = m.almacen_id
     JOIN articulos art ON art.id = m.articulo_id
  GROUP BY a.tipo, m.articulo_id, art.codigo, art.nombre, art.unidad;

create or replace view public.v_dotaciones as
SELECT m.id,
    m.numero,
    m.fecha,
    m.empleado_id,
    e.ficha,
    e.nombres,
    e.apellidos,
    e.cargo,
    m.articulo_id,
    a.codigo AS articulo_codigo,
    a.nombre AS articulo,
    a.categoria,
    m.cantidad,
    m.unidad,
    case when (select private.puede_accion('INVENTARIO.VER_VALORACION')) then m.costo_usd end::numeric(20,6) AS costo_usd,
    case when (select private.puede_accion('INVENTARIO.VER_VALORACION')) then m.valor_usd end::numeric(20,6) AS valor_usd,
    m.almacen_id,
    al.nombre AS almacen,
    m.nota,
    m.registrado_por,
    m.registrado_en
   FROM inventario_movimientos m
     JOIN empleados e ON e.id = m.empleado_id
     JOIN articulos a ON a.id = m.articulo_id
     JOIN almacenes al ON al.id = m.almacen_id
  WHERE m.empleado_id IS NOT NULL AND m.signo < 0 AND NOT (EXISTS ( SELECT 1
           FROM inventario_movimientos r
          WHERE r.movimiento_origen = m.id AND r.tipo = 'REVERSO'::text));

comment on view public.v_dotaciones is
  'Lo entregado a cada trabajador. Quien no pueda valorar ve que se entrego y cuanto, pero no lo que costo.';

-- El panel: se le quito el COALESCE a 0 para que el nulo llegue como nulo. Un
-- inventario valorado en cero dolares es una cifra falsa, y peor que la
-- ausencia de cifra: alguien podria cerrar un mes con ella.
create or replace view public.v_panel_resumen as
SELECT ( SELECT count(*) AS count
           FROM v_compras_tablero
          WHERE v_compras_tablero.columna = 'PEDIDO'::text) AS compras_pedido,
    ( SELECT count(*) AS count
           FROM v_compras_tablero
          WHERE v_compras_tablero.columna = 'CONFIRMADA'::text) AS compras_cotizando,
    ( SELECT count(*) AS count
           FROM v_compras_tablero
          WHERE v_compras_tablero.columna = 'GERENTE'::text) AS compras_por_aprobar,
    ( SELECT count(*) AS count
           FROM v_compras_tablero
          WHERE v_compras_tablero.columna = 'APROBADA'::text) AS compras_aprobadas,
    ( SELECT count(*) AS count
           FROM v_compras_tablero
          WHERE v_compras_tablero.columna = 'PAGADA'::text) AS compras_pagadas_sin_recibir,
    ( SELECT COALESCE(sum(v_compras_tablero.total_usd), 0::numeric) AS "coalesce"
           FROM v_compras_tablero
          WHERE v_compras_tablero.columna = 'PAGADA'::text) AS pagado_sin_recibir_usd,
    ( SELECT count(*) AS count
           FROM v_compras_tablero
          WHERE v_compras_tablero.columna = 'PAGADA'::text AND COALESCE(v_compras_tablero.dias_sin_recibir, 0) > 7) AS compras_atrasadas,
    ( SELECT count(*) AS count
           FROM v_cuentas_por_pagar) AS por_pagar_n,
    ( SELECT COALESCE(sum(v_cuentas_por_pagar.monto_usd), 0::numeric) AS "coalesce"
           FROM v_cuentas_por_pagar) AS por_pagar_usd,
    ( SELECT COALESCE(max(v_cuentas_por_pagar.dias_esperando), 0) AS "coalesce"
           FROM v_cuentas_por_pagar) AS pago_mas_viejo_dias,
    ( SELECT COALESCE(sum(v_saldos_tesoreria.saldo), 0::numeric) AS "coalesce"
           FROM v_saldos_tesoreria
          WHERE v_saldos_tesoreria.activa AND v_saldos_tesoreria.moneda = 'USD'::bpchar::text) AS disponible_usd,
    ( SELECT COALESCE(sum(v_saldos_tesoreria.saldo), 0::numeric) AS "coalesce"
           FROM v_saldos_tesoreria
          WHERE v_saldos_tesoreria.activa AND v_saldos_tesoreria.moneda = 'VES'::bpchar::text) AS disponible_ves,
    ( SELECT count(*) AS count
           FROM cuentas_tesoreria c
          WHERE c.activa AND NOT (EXISTS ( SELECT 1
                   FROM tesoreria_movimientos m
                  WHERE m.cuenta_id = c.id))) AS cuentas_sin_abrir,
    ( SELECT sum(v_existencias.valor_usd) AS "sum"
           FROM v_existencias) AS inventario_usd,
    ( SELECT count(*) AS count
           FROM v_existencias
          WHERE v_existencias.stock_minimo > 0::numeric AND v_existencias.existencia <= v_existencias.stock_minimo) AS articulos_bajo_minimo,
    ( SELECT (EXISTS ( SELECT 1
                   FROM tasas_cambio
                  WHERE tasas_cambio.moneda_origen = 'USD'::bpchar::text AND tasas_cambio.moneda_destino = 'VES'::bpchar::text AND tasas_cambio.fuente = 'BCV'::text AND tasas_cambio.fecha = CURRENT_DATE)) AS "exists") AS tasa_de_hoy;
