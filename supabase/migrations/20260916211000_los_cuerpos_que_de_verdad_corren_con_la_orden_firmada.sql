/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  2 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
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
  viva —no normalizado, no perdonando comentarios— y los 2 coinciden. Y el
  detector, que antes marcaba estas 2, pasa a cero.

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

-- public.aprobar_solicitud_salida(p_id bigint, p_con_firma boolean)
-- venia de: 20260916191000_los_cuerpos_que_de_verdad_corren_con_permisos_restringidos.sql
CREATE OR REPLACE FUNCTION public.aprobar_solicitud_salida(p_id bigint, p_con_firma boolean DEFAULT true)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s     public.solicitudes_salida;
  v_alm   public.almacenes;
  v_como  text;
begin
  select * into v_s from public.solicitudes_salida where id = p_id for update;
  if v_s.id is null then
    raise exception 'No existe la solicitud %.', p_id using errcode = 'P0002';
  end if;
  if v_s.estado <> 'PEDIDA' then
    raise exception 'La solicitud % ya no espera aprobación: está %.', v_s.numero, lower(v_s.estado)
      using errcode = '55000';
  end if;

  select * into v_alm from public.almacenes where id = v_s.almacen_id;
  -- A quien se le restringió no aprueba por ningún camino, tampoco por
  -- responder por el almacén.
  if private.accion_restringida('SALIDAS.APROBAR_SOLICITUD') then
    raise exception 'No puedes aprobar la solicitud %: aprobar salidas se te restringió. Solicitarlas sí puedes.', v_s.numero
      using errcode = '42501';
  end if;
  v_como := private.como_aprueba_salida(v_s.almacen_id);
  if v_como is null then
    raise exception 'La solicitud % la aprueba quien responde por "%"%, o quien tenga la casilla de aprobar salidas.',
      v_s.numero, v_alm.nombre, private.quien_responde_frase(v_s.almacen_id)
      using errcode = '42501';
  end if;

  update public.solicitudes_salida
     set estado = 'APROBADA',
         aprobada_por = (select auth.uid()), aprobada_en = now(),
         aprobada_de_respaldo = (v_como = 'RESPALDO'),
         -- «Todo papel, como mínimo, con la firma de quien autoriza»: por
         -- defecto sí, si tiene una encendida.
         firma_de_quien_aprueba = coalesce(p_con_firma, true) and private.tengo_firma_encendida()
   where id = p_id;

  perform private.notificar(
    'SALIDAS', 'SALIDA_APROBADA',
    format('%s: aprobada', v_s.numero),
    format('Se puede entregar desde %s.', v_alm.nombre),
    '/app/salidas/solicitudes', array['ALMACEN'], 'INFO');

  return p_id;
end;
$function$;

-- public.pedir_salida(p_almacen_id bigint, p_renglones jsonb, p_motivo text, p_grupo_id bigint, p_externo text, p_responsable text, p_con_firma boolean)
-- venia de: 20260916181000_los_cuerpos_que_de_verdad_corren_con_la_palabra_de_venta.sql
CREATE OR REPLACE FUNCTION public.pedir_salida(p_almacen_id bigint, p_renglones jsonb, p_motivo text, p_grupo_id bigint DEFAULT NULL::bigint, p_externo text DEFAULT NULL::text, p_responsable text DEFAULT NULL::text, p_con_firma boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_numero    text;
  v_id        bigint;
  v_r         jsonb;
  v_n         int := 0;
  v_almacen   public.almacenes;
  v_articulo  text;
  v_cuantos   int;
  v_motivo    text := btrim(coalesce(p_motivo, ''));
begin
  perform private.exigir_permiso('SALIDAS', 'LECTURA');

  select * into v_almacen from public.almacenes where id = p_almacen_id and activo;
  if v_almacen.id is null then
    raise exception 'Ese almacén no existe o está apagado.' using errcode = '23503';
  end if;

  if length(v_motivo) < 10 then
    raise exception 'Escribe para qué se necesita: es lo que lee quien la aprueba.' using errcode = '22023';
  end if;

  -- Una venta no se pide por aquí, ni lo que se le da a un cliente sin cobrarlo:
  -- va por Facturación, que es donde lleva cliente, precio y número.
  if private.nombra_una_venta(v_motivo) then
    -- Dice qué palabra frenó: sin eso, quien escribió algo legítimo no sabe
    -- qué cambiar y cree que el sistema falla.
    raise exception 'El «para qué» dice «%», y una venta no sale por aquí: se registra en Facturación › Notas de entrega, con cliente, precio y su número. Lo que se le da a un cliente sin cobrarlo también va por allá, como sin cargo. Si no es una venta, dilo sin esa palabra: quien la aprueba lee el texto entero.',
      lower(private.palabra_de_venta(v_motivo)) using errcode = '22023';
  end if;

  if p_grupo_id is null and nullif(btrim(coalesce(p_externo, '')), '') is null then
    raise exception 'Falta decir quién lo va a recibir: un grupo de la empresa, o alguien de fuera.'
      using errcode = '22023';
  end if;
  if p_grupo_id is not null and nullif(btrim(coalesce(p_externo, '')), '') is not null then
    raise exception 'Lo recibe un grupo de la empresa o alguien de fuera, no los dos.'
      using errcode = '22023';
  end if;
  if p_grupo_id is not null
     and not exists (select 1 from public.organigrama_nodos o where o.id = p_grupo_id and o.activo) then
    raise exception 'Ese grupo no está en el organigrama, o está apagado.' using errcode = '23503';
  end if;
  if nullif(btrim(coalesce(p_externo, '')), '') is not null
     and length(btrim(coalesce(p_responsable, ''))) < 3 then
    raise exception 'Di quién responde por lo que sale: el nombre de quien lo recibe.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'No hay nada que solicitar: la solicitud no trae renglones.' using errcode = '22023';
  end if;

  v_numero := private.siguiente_numero('SS');

  insert into public.solicitudes_salida
    (numero, almacen_id, clase, motivo, grupo_id, destino_externo, responsable_externo, pedida_por,
     firma_de_quien_pide)
  values
    (v_numero, p_almacen_id, 'ENTREGA_POR_SOLICITUD', v_motivo, p_grupo_id,
     nullif(btrim(coalesce(p_externo, '')), ''), nullif(btrim(coalesce(p_responsable, '')), ''),
     (select auth.uid()),
     -- Lo que se puede estampar de verdad: sin firma encendida, no hay nada.
     coalesce(p_con_firma, false) and private.tengo_firma_encendida())
  returning id into v_id;

  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_n := v_n + 1;

    select nombre into v_articulo
      from public.articulos
     where id = nullif(btrim(coalesce(v_r->>'articulo_id', '')), '')::bigint and activo;
    if v_articulo is null then
      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n using errcode = '23503';
    end if;

    insert into public.solicitud_salida_renglones
      (solicitud_id, articulo_id, cantidad, presentaciones, presentacion, suelto, propietario)
    values
      (v_id,
       (v_r->>'articulo_id')::bigint,
       coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0),
       nullif(btrim(coalesce(v_r->>'presentaciones', '')), '')::numeric,
       nullif(btrim(coalesce(v_r->>'presentacion', '')), ''),
       nullif(btrim(coalesce(v_r->>'suelto', '')), '')::numeric,
       nullif(btrim(coalesce(v_r->>'propietario', '')), ''));
  end loop;

  select count(*) into v_cuantos from public.solicitud_salida_renglones where solicitud_id = v_id;

  perform private.notificar(
    'SALIDAS', 'SALIDA_PEDIDA',
    format('%s: solicitan sacar %s material(es) de %s', v_numero, v_cuantos, v_almacen.nombre),
    format('Para: %s. La aprueba quien responde por %s.', v_motivo, v_almacen.nombre),
    '/app/salidas/solicitudes', array['ALMACEN', 'GERENTE_GENERAL'], 'ATENCION');

  return v_numero;
end;
$function$;
