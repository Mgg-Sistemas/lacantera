/*
  QUÉ ENVASES HAY AQUÍ — Y CUÁNDO EL SISTEMA DEJA DE SABERLO.

  Christopher, con la tarjeta del AGROFLUIDOS delante: «está bien que se pueda
  denotar en L (base) pero lo que hay realmente es un tambor (sobre la base),
  ¿cómo se puede expresar así con el valor acorde?».

  Tiene razón, y la respuesta hasta ahora era mala por los dos lados. Enseñar
  «≈ 1 tambor» dividiendo 208 entre 208 es la misma división que el 9/09 dijo
  «2 tambores» del HIDRAULICO 68 cuando había uno y veintiuna pailas: acierta por
  casualidad y falla sin avisar. Y no enseñar nada tampoco sirve: lo que hay de
  verdad es un tambor, y él lo sabe.

  ═══════════════════════════════════════════════════════════════════════════
  LA SALIDA NO ES CALCULAR MEJOR: ES SABER CUÁNDO SE SABE
  ═══════════════════════════════════════════════════════════════════════════

  Desde hoy el sistema tiene tres clases de HECHO sobre envases, y ninguna es una
  división:

      el conteo ....... alguien estuvo delante del estante y anotó qué vio
      las entradas,
      salidas y
      traslados ....... cada uno dice en qué envase se movió, si se tecleó
      los trasvases ... vaciar un tambor en diez pailas, con el volumen cuadrado

  Con eso se puede llevar un SALDO DE ENVASES: se arranca del último conteo y se
  aplica todo lo que pasó después. Y aquí está lo que hace que esto sea honesto y
  no otra suposición:

  **BASTA UN SOLO MOVIMIENTO SIN ENVASE PARA QUE LA CUENTA DEJE DE VALER.** Si
  alguien saca 30 litros y no dice de qué envase salieron, el saldo ya no se
  puede sostener — pudieron salir de un tambor abierto o de dos pailas—. La
  función lo detecta y responde «no se sabe», diciendo cuántos litros se movieron
  a ciegas y desde cuándo.

  Es lo contrario de lo que hace un sistema que redondea: en vez de dar siempre
  una respuesta y que a veces sea falsa, da la respuesta cuando la tiene y dice
  que no la tiene cuando no. Un almacenista puede trabajar con eso; con una cifra
  que a veces miente, no.

  ═══════════════════════════════════════════════════════════════════════════
  LA COMPROBACIÓN QUE SE HACE A SÍ MISMA
  ═══════════════════════════════════════════════════════════════════════════

  Al final se suma lo que dicen los envases y se compara con la existencia del
  libro. Si no cuadran, tampoco se afirma nada: significa que algo se movió sin
  quedar anotado y el saldo de envases se quedó viejo.

  Los sueltos no se llevan aparte, se DEDUCEN: son la existencia menos lo que
  está en envases enteros. Así no hay dos cifras que puedan dejar de coincidir,
  que es como se llega a dos verdades.
*/

create or replace function public.envases_aqui(
  p_articulo_id bigint,
  p_almacen_id  bigint
)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_conteo   bigint;
  v_desde    date;
  v_ciegos   numeric := 0;
  v_saldo    jsonb := '{}'::jsonb;
  v_r        record;
  v_unidad   text;
  v_existe   numeric;
  v_en_envas numeric := 0;
  v_costo    numeric;
  v_lista    jsonb := '[]'::jsonb;
  v_pres     text;
  v_cuantos  numeric;
  v_por      numeric;
begin
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  select unidad into v_unidad from public.articulos where id = p_articulo_id;
  if v_unidad is null then
    return jsonb_build_object('confiable', false, 'por_que', 'No existe el artículo.');
  end if;

  /*
    EL PUNTO DE PARTIDA ES EL ÚLTIMO CONTEO CON HOJA.

    Un conteo sin hoja —de los que solo dicen un total— no sirve de arranque: no
    dice qué envases había. Si no hay ninguno, se arranca del principio de los
    tiempos con el saldo en cero, y entonces la cuenta solo se sostiene si TODO
    lo que entró dijo su envase. Que es como debe ser.
  */
  select m.id, m.fecha into v_conteo, v_desde
    from public.inventario_movimientos m
   where m.articulo_id = p_articulo_id
     and m.almacen_id = p_almacen_id
     and m.tipo in ('AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO')
     and exists (select 1 from public.conteo_envases ce where ce.movimiento_id = m.id)
   order by m.id desc
   limit 1;

  if v_conteo is not null then
    for v_r in select ce.presentacion, ce.cantidad
                 from public.conteo_envases ce where ce.movimiento_id = v_conteo loop
      v_saldo := v_saldo || jsonb_build_object(v_r.presentacion,
                   coalesce((v_saldo ->> v_r.presentacion)::numeric, 0) + v_r.cantidad);
    end loop;
  end if;

  /*
    TODO LO QUE PASÓ DESPUÉS. Un movimiento que mueve cantidad y no dice envase
    ciega la cuenta: se anota cuánto y se decide al final.

    Los AJUSTE_COSTO no cuentan: mueven valor, no material.
  */
  for v_r in
    select m.signo, m.cantidad,
           nullif(btrim(coalesce(m.unidad_capturada, '')), '') as envase,
           coalesce(m.cantidad_capturada, 0) as bultos
      from public.inventario_movimientos m
     where m.articulo_id = p_articulo_id
       and m.almacen_id = p_almacen_id
       and m.tipo <> 'AJUSTE_COSTO'
       and (v_conteo is null or m.id > v_conteo)
     order by m.id
  loop
    if v_r.envase is null or v_r.bultos = 0 then
      v_ciegos := v_ciegos + v_r.cantidad;
    else
      v_saldo := v_saldo || jsonb_build_object(v_r.envase,
                   coalesce((v_saldo ->> v_r.envase)::numeric, 0) + v_r.signo * v_r.bultos);
    end if;
  end loop;

  -- Los trasvases: cambian la forma, no la cantidad. Nulo es «suelto».
  for v_r in
    select re.desde_presentacion, re.desde_cantidad,
           re.hacia_presentacion, re.hacia_cantidad
      from public.reenvases re
     where re.articulo_id = p_articulo_id
       and re.almacen_id = p_almacen_id
       and (v_conteo is null or re.fecha >= v_desde)
     order by re.id
  loop
    if v_r.desde_presentacion is not null then
      v_saldo := v_saldo || jsonb_build_object(v_r.desde_presentacion,
                   coalesce((v_saldo ->> v_r.desde_presentacion)::numeric, 0) - v_r.desde_cantidad);
    end if;
    if v_r.hacia_presentacion is not null then
      v_saldo := v_saldo || jsonb_build_object(v_r.hacia_presentacion,
                   coalesce((v_saldo ->> v_r.hacia_presentacion)::numeric, 0) + v_r.hacia_cantidad);
    end if;
  end loop;

  if v_ciegos > 0.0001 then
    return jsonb_build_object(
      'confiable', false,
      'por_que', format('Desde %s se movieron %s %s sin decir en qué envase, así que ya no se puede saber cuántos hay de cada uno.',
        case when v_desde is null then 'siempre' else 'el ' || to_char(v_desde, 'DD/MM/YYYY') end,
        private.numero_es(v_ciegos, 2), v_unidad));
  end if;

  v_existe := private.existencia(p_almacen_id, p_articulo_id);
  v_costo  := private.costo_promedio(p_almacen_id, p_articulo_id);

  for v_pres, v_cuantos in select * from jsonb_each_text(v_saldo) loop
    continue when coalesce(v_cuantos, 0) = 0;
    if v_cuantos < 0 then
      return jsonb_build_object(
        'confiable', false,
        'por_que', format('Las cuentas dan %s envases de %s, que es imposible: falta algo por anotar.',
          private.numero_es(v_cuantos, 0), v_pres));
    end if;

    select ap.unidades into v_por from public.articulo_presentaciones ap
     where ap.articulo_id = p_articulo_id and ap.presentacion = v_pres;

    if coalesce(v_por, 0) <= 0 then
      return jsonb_build_object(
        'confiable', false,
        'por_que', format('«%s» ya no dice cuántas %s trae, así que no se puede valorar.', v_pres, v_unidad));
    end if;

    v_en_envas := v_en_envas + v_cuantos * v_por;
    v_lista := v_lista || jsonb_build_object(
      'presentacion', v_pres,
      'cuantos', v_cuantos,
      'unidades', v_por,
      'valor_usd', case when v_costo is not null then round(v_costo * v_por * v_cuantos, 2) end);
  end loop;

  /*
    LA COMPROBACIÓN FINAL. Si lo que dicen los envases más lo que queda suelto no
    da la existencia, el saldo está viejo y no se afirma nada. Un margen de un
    decilitro por el redondeo de los factores, que son aproximados.
  */
  if v_en_envas > v_existe + 0.1 then
    return jsonb_build_object(
      'confiable', false,
      'por_que', format('Los envases suman %s %s y en el libro hay %s: falta algo por anotar.',
        private.numero_es(v_en_envas, 2), v_unidad, private.numero_es(v_existe, 2)));
  end if;

  return jsonb_build_object(
    'confiable', true,
    'desde', v_desde,
    'nunca_contado', v_conteo is null,
    'envases', v_lista,
    'sueltos', round(v_existe - v_en_envas, 4),
    'valor_sueltos', case when v_costo is not null
                          then round(v_costo * (v_existe - v_en_envas), 2) end,
    'unidad', v_unidad);
end;
$function$;

comment on function public.envases_aqui(bigint, bigint) is
  'Que envases hay de verdad de un articulo en un almacen, o por que no se sabe. Contesta la pregunta de Christopher del 9/09/2026: «lo que hay realmente es un tambor (sobre la base), como se puede expresar asi con el valor acorde». NO ES UNA DIVISION —dividir 208 entre 208 acierta por casualidad y fallo con el HIDRAULICO 68, donde daba «2 tambores» habiendo uno y veintiuna pailas—: es un SALDO que arranca del ultimo conteo con hoja y aplica las entradas, salidas, traslados y trasvases posteriores que dijeron su envase. Basta UN movimiento sin envase para que devuelva `confiable: false` diciendo cuantas unidades se movieron a ciegas: mas vale no contestar que contestar mal. Al final comprueba que los envases mas lo suelto den la existencia del libro, y si no cuadran tampoco afirma nada. Los sueltos se deducen y no se guardan aparte, para que no haya dos cifras que puedan dejar de coincidir.';

grant execute on function public.envases_aqui(bigint, bigint) to authenticated;
