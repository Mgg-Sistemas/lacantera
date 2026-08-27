/*
  LA ALÍCUOTA Y LA IMPRENTA, EN LA FICHA DE LA EMPRESA.

  ————————————————————————————————————————————————————————————————————————
  SIN APLICAR. Escrita el 27 de agosto de 2026 con el MCP de Supabase caído.
  No se ha ejecutado ni comprobado contra el catálogo, así que nada de lo que
  dice puede darse por cierto hasta que corra. Va con su comprobación al final.
  ————————————————————————————————————————————————————————————————————————

  DOS COSAS QUE HOY NO SE PUEDEN DECIR EN NINGUNA PANTALLA

  La alícuota del IVA estaba escrita como un 16 en cinco sitios del código. Es
  una cifra legal: cambia por decreto, y el día que cambie no puede hacer falta
  una versión del sistema para seguirla. El front ya la lee de aquí —cae a 16
  mientras la columna no exista—, así que en cuanto esto corra queda editable.

  Y los datos de la imprenta autorizada, que una factura venezolana tiene que
  llevar impresos: quién la imprimió, con qué RIF y con qué número de
  autorización del SENIAT. Hoy no existen como dato en ninguna parte, así que
  la factura sale sin ellos.

  POR QUÉ LA ALÍCUOTA VA EN LA FICHA Y NO EN CADA DOCUMENTO

  Cada documento ya guarda la suya —`alicuota_iva` en cotizaciones, notas y
  facturas—, que es lo que hace que una factura de marzo siga diciendo lo que
  decía en marzo aunque la ley cambie en abril. Lo que falta no es dónde
  guardarla sino de dónde proponerla, y eso es una sola cifra por empresa.

  No se pone un campo abierto en cada venta a propósito, y está razonado en
  `CasillaIva.tsx`: la pregunta de quien factura no es «cuánto» sino «sí o no»,
  y un numérico libre en cada operación invita a un 16 mal tecleado que nadie
  ve hasta que cuadra el libro.

  LO QUE ESTA MIGRACIÓN NO HACE

  No toca los documentos ya emitidos. Cambiar la alícuota de la ficha mañana no
  reescribe una factura de ayer, que es justamente lo que se quiere.
*/

alter table public.empresa
  add column if not exists alicuota_iva_pct numeric(5,2),
  add column if not exists imprenta_nombre text,
  add column if not exists imprenta_rif text,
  add column if not exists imprenta_autorizacion text;

comment on column public.empresa.alicuota_iva_pct is
  'Alícuota general del IVA que se propone en los documentos nuevos. Nula: el sistema usa su respaldo.';
comment on column public.empresa.imprenta_autorizacion is
  'Número con el que el SENIAT autorizó a esa imprenta. Va impreso en la factura.';

/*
  Un porcentaje es un porcentaje. Sin este freno, un cero mal puesto convierte
  el 16 en 1600 y el IVA de la siguiente factura en cien veces lo que toca.
*/
alter table public.empresa
  drop constraint if exists empresa_alicuota_iva_pct_check;
alter table public.empresa
  add constraint empresa_alicuota_iva_pct_check
  check (alicuota_iva_pct is null or (alicuota_iva_pct >= 0 and alicuota_iva_pct <= 100));

/*
  Y `guardar_empresa` gana los cuatro campos.

  VA CON DROP Y NO CON UN `create or replace` A SECAS: cambiar la lista de
  argumentos no reemplaza la función, crea una segunda con el mismo nombre.
  Y al soltarla se van sus permisos, así que se reponen aquí mismo — una
  función nueva en `public` nace con `execute` para todo el mundo, `anon`
  incluido.

  El cuerpo se copia del que esté vivo AL APLICAR ESTA MIGRACIÓN. Lo de abajo
  es la forma que tenía al escribirla, y la regla 7 de la casa dice que el
  archivo puede no ser lo que corrió: antes de ejecutar esto hay que sacar el
  cuerpo real con `pg_get_functiondef` y pegarlo, añadiendo solo los cuatro
  campos nuevos al `update`.
*/

drop function if exists public.guardar_empresa(text, text, text, text, text, text, date, date, date, text, text, text, numeric, text, text);

create function public.guardar_empresa(
  p_rif text,
  p_razon_social text,
  p_domicilio_fiscal text default null,
  p_ciudad text default null,
  p_estado text default null,
  p_zona_postal text default null,
  p_inscrito_el date default null,
  p_rif_actualizado_el date default null,
  p_rif_vence_el date default null,
  p_gerencia_seniat text default null,
  p_comprobante_rif text default null,
  p_condicion_iva text default null,
  p_retencion_iva_pct numeric default null,
  p_telefono text default null,
  p_correo text default null,
  p_alicuota_iva_pct numeric default null,
  p_imprenta_nombre text default null,
  p_imprenta_rif text default null,
  p_imprenta_autorizacion text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform private.exigir_rol('ADMIN', 'GERENTE_GENERAL');

  if length(trim(coalesce(p_razon_social, ''))) < 3 then
    raise exception 'La razon social no puede quedar vacia.' using errcode = '22023';
  end if;

  -- El RIF venezolano: una letra de tipo, ocho digitos y el verificador.
  if trim(coalesce(p_rif, '')) !~ '^[JGVEP]-?[0-9]{8}-?[0-9]$' then
    raise exception 'El RIF "%" no tiene forma de RIF. Debe ser como J-50209170-0.', p_rif
      using errcode = '22023';
  end if;

  -- El de la imprenta es un RIF igual que el nuestro, y se comprueba igual:
  -- va impreso en la factura y el SENIAT lo mira.
  if nullif(trim(coalesce(p_imprenta_rif, '')), '') is not null
     and trim(p_imprenta_rif) !~ '^[JGVEP]-?[0-9]{8}-?[0-9]$' then
    raise exception 'El RIF de la imprenta "%" no tiene forma de RIF.', p_imprenta_rif
      using errcode = '22023';
  end if;

  update public.empresa set
    rif                = upper(trim(p_rif)),
    razon_social       = trim(p_razon_social),
    domicilio_fiscal   = nullif(trim(coalesce(p_domicilio_fiscal, '')), ''),
    ciudad             = nullif(trim(coalesce(p_ciudad, '')), ''),
    estado             = nullif(trim(coalesce(p_estado, '')), ''),
    zona_postal        = nullif(trim(coalesce(p_zona_postal, '')), ''),
    inscrito_el        = p_inscrito_el,
    rif_actualizado_el = p_rif_actualizado_el,
    rif_vence_el       = p_rif_vence_el,
    gerencia_seniat    = nullif(trim(coalesce(p_gerencia_seniat, '')), ''),
    comprobante_rif    = nullif(trim(coalesce(p_comprobante_rif, '')), ''),
    condicion_iva      = nullif(trim(coalesce(p_condicion_iva, '')), ''),
    retencion_iva_pct  = p_retencion_iva_pct,
    telefono           = nullif(trim(coalesce(p_telefono, '')), ''),
    correo             = nullif(trim(coalesce(p_correo, '')), ''),
    alicuota_iva_pct   = p_alicuota_iva_pct,
    imprenta_nombre    = nullif(trim(coalesce(p_imprenta_nombre, '')), ''),
    imprenta_rif       = upper(nullif(trim(coalesce(p_imprenta_rif, '')), '')),
    imprenta_autorizacion = nullif(trim(coalesce(p_imprenta_autorizacion, '')), ''),
    actualizado_por    = (select auth.uid()),
    actualizado_en     = now()
  where id = 1;
end;
$function$;

revoke all on function public.guardar_empresa(text, text, text, text, text, text, date, date, date, text, text, text, numeric, text, text, numeric, text, text, text) from public, anon;
grant execute on function public.guardar_empresa(text, text, text, text, text, text, date, date, date, text, text, text, numeric, text, text, numeric, text, text, text)
  to authenticated, service_role;

/*
  COMPROBAR DESPUÉS DE APLICARLA

    -- Las columnas están y con su tipo
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'empresa'
      and column_name in ('alicuota_iva_pct', 'imprenta_nombre',
                          'imprenta_rif', 'imprenta_autorizacion');

    -- El freno del porcentaje muerde
    do $x$ begin
      update public.empresa set alicuota_iva_pct = 1600 where id = 1;
      raise exception 'ENSAYO: acepto 1600, el freno no sirve';
    exception when check_violation then
      raise exception 'ENSAYO: rechazo 1600, bien';
    end $x$;

    -- Una sola guardar_empresa, y anon fuera
    select p.oid::regprocedure::text,
           has_function_privilege('anon', p.oid, 'execute') as la_tiene_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'guardar_empresa';
*/
