/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  1 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
  las crea. No cambia nada en la base: son los mismos cuerpos que ya corren,
  puestos donde reconstruir desde cero da lo mismo que hay.

  POR QUE APARECIO ESTA DIFERENCIA, que es lo unico interesante de este archivo:
  las migraciones de esta casa parchean con `pg_get_functiondef` + `replace` en
  vez de reescribir funciones de siete mil letras. El parche es correcto y el
  motivo es bueno —copiar a mano es lo que introduce diferencias—, pero deja el
  cuerpo repartido entre el archivo que la creo y los cinco que la tocaron
  despues. El archivo deja de servir para reconstruir aunque cada parche este
  bien.

  Lo levanto el carril de base de datos, tres veces en un dia, y la tercera con
  el diagnostico que lo explica: no es falta de cuidado, es que la verificacion
  se hace UNA VEZ al escribir y seis migraciones despues otra cosa toca la misma
  funcion. Un md5 comprobado el lunes no dice nada del miercoles.

  Por eso esto es generado y no transcrito: volcar la salida de Postgres no puede
  introducir una diferencia, y teclearla si.

  QUE SE COMPROBO ANTES DE GUARDARLO

  Cada cuerpo de aqui se comparo BYTE A BYTE contra `pg_proc.prosrc` de la base
  viva —no normalizado, no perdonando comentarios— y los 1 coinciden. Y el
  detector, que antes marcaba estas 1, pasa a cero.

  NO SE APLICO, Y ES A PROPOSITO

  Aplicarlo seria un no-op: son exactamente los cuerpos que ya corren, sacados de
  `pg_get_functiondef`. Su valor no esta en cambiar la base sino en que
  reconstruirla desde cero de lo mismo que hay.

  Y LA TRAMPA QUE ESO DEJA, dicha aqui para que no sorprenda: si manana otra
  migracion toca una de estas funciones y alguien corre ESTE archivo suelto,
  despues, la revierte al cuerpo de hoy. En orden no pasa —va fechado con su dia y
  detras de todo lo de ese dia—, pero un volcado no es una migracion normal y
  conviene saberlo antes de ejecutarlo a mano.
*/

-- public.guardar_cliente(p_id bigint, p_rif text, p_nombre text, p_nombre_comercial text, p_contacto text, p_telefono text, p_correo text, p_direccion text, p_condicion_pago text, p_limite_credito numeric, p_moneda character, p_especial boolean, p_retencion_iva numeric, p_exento_iva boolean, p_activo boolean, p_notas text)
-- venia de: 20260804100000_ventas.sql
CREATE OR REPLACE FUNCTION public.guardar_cliente(p_id bigint DEFAULT NULL::bigint, p_rif text DEFAULT NULL::text, p_nombre text DEFAULT NULL::text, p_nombre_comercial text DEFAULT NULL::text, p_contacto text DEFAULT NULL::text, p_telefono text DEFAULT NULL::text, p_correo text DEFAULT NULL::text, p_direccion text DEFAULT NULL::text, p_condicion_pago text DEFAULT 'CONTADO'::text, p_limite_credito numeric DEFAULT 0, p_moneda character DEFAULT 'USD'::bpchar, p_especial boolean DEFAULT false, p_retencion_iva numeric DEFAULT 75, p_exento_iva boolean DEFAULT false, p_activo boolean DEFAULT true, p_notas text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id  bigint;
  v_rif text := upper(trim(coalesce(p_rif, '')));
begin
  perform private.exigir_permiso('VENTAS', 'ESCRITURA');

  if length(trim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'La razón social del cliente es obligatoria.' using errcode = '22023';
  end if;

  -- Una persona natural sin RIF se registra con su cédula, que no lleva dígito.
  if v_rif !~ '^[VEJPGC]-[0-9]{8}-[0-9]$' and v_rif !~ '^[VE]-[0-9]{6,8}$' then
    raise exception 'El documento "%" no es ni un RIF (J-12345678-9) ni una cédula (V-12345678). Una empresa se registra con su RIF y el dígito del final; una persona sin RIF, con su cédula.', v_rif
      using errcode = '22023';
  end if;

  -- Dar crédito no es editar una ficha: es comprometer dinero de la empresa.
  if coalesce(p_limite_credito, 0) > 0 or p_condicion_pago <> 'CONTADO' then
    perform private.exigir_permiso('VENTAS', 'TOTAL');
  end if;

  if p_id is null then
    insert into public.clientes
      (rif, nombre, nombre_comercial, contacto, telefono, correo, direccion,
       condicion_pago, limite_credito, moneda_preferida, contribuyente_especial,
       retencion_iva, exento_iva, activo, notas, creado_por)
    values
      (v_rif, trim(p_nombre), nullif(trim(coalesce(p_nombre_comercial, '')), ''),
       nullif(trim(coalesce(p_contacto, '')), ''), nullif(trim(coalesce(p_telefono, '')), ''),
       lower(nullif(trim(coalesce(p_correo, '')), '')), nullif(trim(coalesce(p_direccion, '')), ''),
       coalesce(p_condicion_pago, 'CONTADO'), coalesce(p_limite_credito, 0),
       coalesce(p_moneda, 'USD'), coalesce(p_especial, false),
       coalesce(p_retencion_iva, 75), coalesce(p_exento_iva, false),
       coalesce(p_activo, true), nullif(trim(coalesce(p_notas, '')), ''),
       (select auth.uid()))
    returning id into v_id;
  else
    update public.clientes
       set rif = v_rif,
           nombre = trim(p_nombre),
           nombre_comercial = nullif(trim(coalesce(p_nombre_comercial, '')), ''),
           contacto = nullif(trim(coalesce(p_contacto, '')), ''),
           telefono = nullif(trim(coalesce(p_telefono, '')), ''),
           correo = lower(nullif(trim(coalesce(p_correo, '')), '')),
           direccion = nullif(trim(coalesce(p_direccion, '')), ''),
           condicion_pago = coalesce(p_condicion_pago, 'CONTADO'),
           limite_credito = coalesce(p_limite_credito, 0),
           moneda_preferida = coalesce(p_moneda, 'USD'),
           contribuyente_especial = coalesce(p_especial, false),
           retencion_iva = coalesce(p_retencion_iva, 75),
           exento_iva = coalesce(p_exento_iva, false),
           activo = coalesce(p_activo, true),
           notas = nullif(trim(coalesce(p_notas, '')), '')
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe el cliente %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya hay un cliente registrado con el RIF %.', v_rif using errcode = '23505';
end;
$function$;
