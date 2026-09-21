-- EL LIBRO DE TESORERÍA DICE SU SALDO AL LEERLO
--
-- Christopher, 21/09/2026: Tesorería vuelve al riel —«su caja de $, su caja de
-- bolívares, su caja de USDT, que también pueda crear otras cajas, sus entradas,
-- salidas, sus monedas, todo con sus reportes»—.
--
-- Los reportes necesitan el saldo corriente de cada renglón. NO se guarda: se
-- calcula aquí con una ventana sobre el libro, que es inmutable. Guardarlo en
-- cada fila obliga a recalcular la cadena cuando entra un asiento con fecha
-- vieja, y esa es la clase de descuadre que no se ve hasta que alguien imprime.
--
-- Solo lectura, con security_invoker: manda la política del libro, que ya deja
-- leer a quien tenga TESORERIA o COMPRAS en lectura. No escribe nada.

create or replace view public.v_tesoreria_libro
with (security_invoker = on) as
select
  t.id,
  t.numero,
  t.fecha,
  t.cuenta_id,
  c.codigo                         as cuenta_codigo,
  c.nombre                         as cuenta,
  c.tipo                           as cuenta_tipo,
  coalesce(t.moneda, c.moneda)     as moneda,
  t.tipo,
  t.signo,
  t.monto,
  case when t.signo > 0 then t.monto else 0 end as debe,
  case when t.signo < 0 then t.monto else 0 end as haber,
  -- El saldo de SU cuenta después de este renglón. Por fecha del movimiento y,
  -- dentro del día, por orden de llegada.
  case when t.cuenta_id is not null then
    sum(t.signo * t.monto) over (partition by t.cuenta_id order by t.fecha, t.id)
  end                              as saldo,
  t.tasa,
  t.tasa_usd,
  t.monto_bs,
  t.monto_usd,
  t.concepto,
  t.referencia,
  t.contraparte,
  t.categoria,
  g.nombre                         as categoria_nombre,
  gp.nombre                        as categoria_padre,
  t.metodo,
  t.movimiento_origen,
  t.transferencia_par,
  t.nota,
  t.registrado_por,
  t.registrado_en
from public.tesoreria_movimientos t
left join public.cuentas_tesoreria c on c.id = t.cuenta_id
left join public.categorias_gasto g  on g.codigo = t.categoria
left join public.categorias_gasto gp on gp.codigo = g.padre;

revoke all on public.v_tesoreria_libro from public, anon;
grant select on public.v_tesoreria_libro to authenticated;

comment on view public.v_tesoreria_libro is
  'El libro del dinero con Debe, Haber y el saldo corriente de cada cuenta, calculado al leer. Para los reportes de Tesorería.';
