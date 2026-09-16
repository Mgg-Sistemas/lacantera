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

-- public.aceptar_traslado(p_id bigint)
-- venia de: 20260916081000_los_cuerpos_que_de_verdad_corren_con_la_solicitud.sql
CREATE OR REPLACE FUNCTION public.aceptar_traslado(p_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_t       public.traslados;
  v_origen  public.almacenes;
  v_destino public.almacenes;
  v_como    text;
  v_camino  bigint;
  v_mov     record;
  v_articulo text;
  v_hoy     date := private.hoy_aqui();
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;

  select * into v_t from public.traslados where id = p_id for update;
  if v_t.id is null then
    raise exception 'No existe el traslado %.', p_id using errcode = 'P0002';
  end if;
  if v_t.estado <> 'SOLICITUD' then
    raise exception 'El traslado % ya no espera que lo envíen: %.', v_t.numero,
      case v_t.estado when 'ACEPTADA' then 'ya va de camino'
                      when 'RECIBIDA' then 'ya se recibió'
                      else 'está cancelado' end
      using errcode = '55000';
  end if;

  select * into v_origen  from public.almacenes where id = v_t.origen_id;
  select * into v_destino from public.almacenes where id = v_t.destino_id;

  v_como := private.como_actua_en(v_t.origen_id);
  if v_como is null then
    raise exception 'El traslado % lo aprueba y envía quien responde por "%"%, o administración.',
      v_t.numero, v_origen.nombre, private.quien_responde_frase(v_t.origen_id)
      using errcode = '42501';
  end if;

  if not v_destino.activo then
    raise exception 'El almacén "%" está inactivo y no puede recibir material: cancela el traslado.', v_destino.nombre
      using errcode = '22023';
  end if;

  v_camino := private.sitio_en_camino();
  if v_camino is null then
    raise exception 'Falta el sitio «En camino», donde espera lo que va de un sitio a otro.' using errcode = 'P0002';
  end if;

  select nombre into v_articulo from public.articulos where id = v_t.articulo_id;

  select * into v_mov from private.mover_en_traslado(
    p_de => v_t.origen_id, p_a => v_camino, p_articulo => v_t.articulo_id,
    p_cantidad => v_t.cantidad, p_dueno => v_t.propietario,
    p_nota_sale  => format('Traslado %s a %s: sale y va de camino. %s', v_t.numero, v_destino.nombre, v_t.motivo),
    p_nota_entra => format('Traslado %s de %s a %s: va de camino. %s', v_t.numero, v_origen.nombre, v_destino.nombre, v_t.motivo),
    p_fecha => v_hoy,
    p_presentaciones => v_t.presentaciones, p_presentacion => v_t.presentacion, p_suelto => v_t.suelto);

  update public.traslados
     set estado = 'ACEPTADA',
         aceptado_por = (select auth.uid()), aceptado_en = now(),
         aceptado_de_respaldo = (v_como = 'RESPALDO'),
         mov_salida = v_mov.salida, mov_en_camino = v_mov.entrada
   where id = p_id;

  perform private.notificar(
    'INVENTARIO', 'TRASLADO_ACEPTADO',
    format('%s: %s va de camino a %s', v_t.numero, v_articulo, v_destino.nombre),
    format('Salió de %s. Confirma que llegó quien responde por %s.', v_origen.nombre, v_destino.nombre),
    '/app/salidas/traslados', array['ALMACEN', 'GERENTE_GENERAL'], 'ATENCION');

  return p_id;
end;
$function$;

-- public.recibir_traslado(p_id bigint)
-- venia de: 20260916081000_los_cuerpos_que_de_verdad_corren_con_la_solicitud.sql
CREATE OR REPLACE FUNCTION public.recibir_traslado(p_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_t       public.traslados;
  v_origen  public.almacenes;
  v_destino public.almacenes;
  v_como    text;
  v_costo   numeric;
  v_mov     record;
  v_articulo text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;

  select * into v_t from public.traslados where id = p_id for update;
  if v_t.id is null then
    raise exception 'No existe el traslado %.', p_id using errcode = 'P0002';
  end if;
  if v_t.estado <> 'ACEPTADA' then
    raise exception 'El traslado % no está de camino: %.', v_t.numero,
      case v_t.estado when 'SOLICITUD' then 'todavía no lo han enviado'
                      when 'RECIBIDA' then 'ya se recibió'
                      else 'está cancelado' end
      using errcode = '55000';
  end if;

  select * into v_origen  from public.almacenes where id = v_t.origen_id;
  select * into v_destino from public.almacenes where id = v_t.destino_id;

  v_como := private.como_actua_en(v_t.destino_id);
  if v_como is null then
    raise exception 'La llegada del traslado % la confirma quien responde por "%"%, o administración.',
      v_t.numero, v_destino.nombre, private.quien_responde_frase(v_t.destino_id)
      using errcode = '42501';
  end if;

  if not v_destino.activo then
    raise exception 'El almacén "%" está inactivo y no puede recibir material: cancela el traslado y vuelve al origen.', v_destino.nombre
      using errcode = '22023';
  end if;

  -- Entra al costo con el que salió, no al promedio de «En camino».
  select costo_usd into v_costo from public.inventario_movimientos where id = v_t.mov_salida;
  select nombre into v_articulo from public.articulos where id = v_t.articulo_id;

  select * into v_mov from private.mover_en_traslado(
    p_de => (select almacen_id from public.inventario_movimientos where id = v_t.mov_en_camino),
    p_a => v_t.destino_id, p_articulo => v_t.articulo_id,
    p_cantidad => v_t.cantidad, p_dueno => v_t.propietario,
    p_nota_sale  => format('Traslado %s: llega a %s. %s', v_t.numero, v_destino.nombre, v_t.motivo),
    p_nota_entra => format('Traslado %s desde %s. %s', v_t.numero, v_origen.nombre, v_t.motivo),
    p_costo => v_costo, p_costo_fijo => true,
    p_origen => v_t.mov_en_camino, p_fecha => private.hoy_aqui(),
    p_presentaciones => v_t.presentaciones, p_presentacion => v_t.presentacion, p_suelto => v_t.suelto);

  update public.traslados
     set estado = 'RECIBIDA',
         recibido_por = (select auth.uid()), recibido_en = now(),
         recibido_de_respaldo = (v_como = 'RESPALDO'),
         mov_llegada = v_mov.entrada
   where id = p_id;

  perform private.notificar(
    'INVENTARIO', 'TRASLADO_RECIBIDO',
    format('%s: %s llegó a %s', v_t.numero, v_articulo, v_destino.nombre),
    format('Salió de %s.', v_origen.nombre),
    '/app/salidas/traslados', array['ALMACEN', 'GERENTE_GENERAL'], 'INFO');

  return p_id;
end;
$function$;
