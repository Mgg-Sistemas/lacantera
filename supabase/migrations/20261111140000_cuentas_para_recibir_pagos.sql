/*
  LAS CUENTAS PARA RECIBIR PAGOS, PARA EL PDF DE LA LISTA DE PRECIOS (11/11/2026).

  Pedido: «un PDF horizontal [de la lista de precios] donde se vean los
  precios y los datos bancarios». Los datos bancarios ya están en Tesorería
  (cuentas_tesoreria, tipo BANCO) y se leen de ahí: el número de cuenta no se
  escribe en el código, que es público, y si mañana cambia la cuenta, el papel
  cambia solo.

  Quien arma la lista (Ventas, Facturación) no ve Tesorería. Esta función le
  entrega solo lo que se le da a un cliente para pagar —banco, número,
  titular, RIF, moneda— de las cuentas bancarias ACTIVAS; ni saldos, ni
  movimientos, ni cajas, ni billeteras.
*/

create function public.cuentas_para_recibir_pagos()
 returns table(banco text, numero_cuenta text, titular text, documento text, moneda text)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if not (private.tiene_permiso('VENTAS', 'LECTURA') or private.tiene_permiso('FACTURACION', 'LECTURA')) then
    raise exception 'Para ver los datos de pago hace falta acceso a Ventas o a Facturación.'
      using errcode = '42501';
  end if;

  return query
  select c.banco, c.numero_cuenta, c.titular, c.documento, c.moneda::text
    from public.cuentas_tesoreria c
   where c.tipo = 'BANCO'
     and c.activa
   order by c.moneda, c.banco;
end;
$function$;

comment on function public.cuentas_para_recibir_pagos() is
  'Banco, número, titular, RIF y moneda de las cuentas bancarias activas de Tesorería, para el PDF de la lista de precios. Exige Ventas o Facturación en lectura. 11/11/2026.';

revoke execute on function public.cuentas_para_recibir_pagos() from public, anon;
grant execute on function public.cuentas_para_recibir_pagos() to authenticated, service_role;
