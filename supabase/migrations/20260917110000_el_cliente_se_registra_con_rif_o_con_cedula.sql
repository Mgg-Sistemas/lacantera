/*
  EL CLIENTE SE REGISTRA CON RIF O CON CÉDULA

  Christopher, 17/09/2026, con el formulario delante: «no me deja registrar
  clientes por cédula. Seguí el formato, lo había probado con RIF fino pero con
  cédula no lo registra». El error: «El RIF "V-26478264" no tiene la forma
  J-12345678-9».

  La base solo admitía RIF con su dígito verificador. Pero a una persona natural
  que no tiene RIF se le vende con su cédula, y esa cédula no lleva dígito al
  final. Ahora `clientes.rif` admite las dos formas:

    RIF ...... J-12345678-9   cualquier letra, ocho cifras y su dígito
    cédula ... V-12345678     solo V o E, de seis a ocho cifras, sin dígito

  Una empresa (J, G) sigue necesitando su RIF completo: lo que se afloja es la
  persona natural, no la empresa. No había clientes guardados, así que ninguna
  fila cambia de sentido.
*/

alter table public.clientes drop constraint clientes_rif_formato;
alter table public.clientes add constraint clientes_rif_formato
  check (rif ~ '^[VEJPGC]-[0-9]{8}-[0-9]$' or rif ~ '^[VE]-[0-9]{6,8}$');

comment on column public.clientes.rif is
  'El documento con que se le factura: RIF con su dígito (J-12345678-9) o, si es una persona natural sin RIF, su cédula (V-12345678). Sin puntos.';

do $parche$
declare
  v_def   text := pg_get_functiondef('public.guardar_cliente(bigint, text, text, text, text, text, text, text, text, numeric, character, boolean, numeric, boolean, boolean, text)'::regprocedure);
  v_antes text := $a$  if v_rif !~ '^[VEJPGC]-[0-9]{8}-[0-9]$' then
    raise exception 'El RIF "%" no tiene la forma J-12345678-9.', v_rif using errcode = '22023';
  end if;$a$;
  v_despues text := $b$  -- Una persona natural sin RIF se registra con su cédula, que no lleva dígito.
  if v_rif !~ '^[VEJPGC]-[0-9]{8}-[0-9]$' and v_rif !~ '^[VE]-[0-9]{6,8}$' then
    raise exception 'El documento "%" no es ni un RIF (J-12345678-9) ni una cédula (V-12345678). Una empresa se registra con su RIF y el dígito del final; una persona sin RIF, con su cédula.', v_rif
      using errcode = '22023';
  end if;$b$;
begin
  if (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes) <> 1 then
    raise exception 'guardar_cliente no tiene la comprobación del RIF una sola vez: no se toca.';
  end if;
  execute replace(v_def, v_antes, v_despues);
end
$parche$;
