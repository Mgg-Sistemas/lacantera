-- LO QUE DEBEN LOS PROVEEDORES TAMBIÉN ES POR COBRAR (24/09/2026)
--
-- Cuando una compra se paga con material y el material vale más que la
-- orden, Compras elige qué pasa con la diferencia: crédito con ese
-- proveedor, o «por cobrarle» en dinero. Lo segundo es una cuenta por cobrar
-- de verdad, y no salía en Cuentas por cobrar, que solo lista facturas de
-- clientes. Quien mira esa pantalla creía que nadie debía nada.
--
-- Va por función y no por vista porque cruza a `proveedores`, que solo lee
-- Compras, y Cuentas por cobrar es de Facturación. La reja va dentro.

create or replace function public.por_cobrar_a_proveedores()
returns table (
  saldo_id   bigint,
  numero     text,
  proveedor  text,
  rif        text,
  orden      text,
  moneda     text,
  monto      numeric,
  pendiente  numeric,
  motivo     text,
  desde      date,
  dias       integer
)
language sql
stable
security definer
set search_path to ''
as $$
  select s.id,
         s.numero,
         p.nombre,
         p.rif,
         o.numero,
         s.moneda,
         s.monto,
         s.pendiente,
         s.motivo,
         private.dia_aqui(s.creado_en),
         private.hoy_aqui() - private.dia_aqui(s.creado_en)
    from public.saldos_a_favor s
    join public.proveedores p on p.id = s.proveedor_id
    left join public.ordenes_compra o on o.id = s.orden_id
   where s.estado = 'ABIERTO'
     and s.a_favor_de = 'EMPRESA'
     and s.forma = 'POR_COBRAR'
     and (
       private.tiene_permiso('FACTURACION', 'LECTURA')
       or private.tiene_permiso('COMPRAS', 'LECTURA')
       or private.tiene_permiso('TESORERIA', 'LECTURA')
     )
   order by s.creado_en;
$$;

comment on function public.por_cobrar_a_proveedores is
  'Los saldos abiertos que un proveedor le debe en dinero a la empresa (pago con material que valió más que la orden). Se cobran desde Compras › Saldos del proveedor.';

revoke all on function public.por_cobrar_a_proveedores() from public, anon;
grant execute on function public.por_cobrar_a_proveedores() to authenticated;
