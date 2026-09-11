/*
  SE VAN LOS CINCO PERÍODOS DE PRUEBA DE NÓMINA.

  Christopher, 11/09/2026, con la lista del selector delante: «necesitamos borrar
  los períodos de la imagen, todos anulados, todos por test».

  Es cierto, y se comprobó uno por uno antes de tocar nada. Los cinco están
  ANULADA y los cinco lo dicen en su propio motivo:

      NOM-2026-0003  16/08 al 31/08  «PRUEBA PRUEBA»
      NOM-2026-0004  01/09 al 15/09  «DE PRUEBA SADASD»
      NOM-2026-0005  01/09 al 14/09  «DE PRUEBA PARA SACAR EL CALCULO»
      NOM-2026-0006  01/09 al 15/09  «NO ESTA BIEN CALCULADA»
      NOM-2026-0007  01/09 al 15/09  «ANULADA POR PRUEBA»

  Son el rastro de la tarde en que se descubrió que el sueldo de la ficha no
  significaba lo que la empresa creía: el 0005 es el que se abrió del 1 al 14
  para ver si cambiaba el monto, y el 0006 el que se anuló por «no está bien
  calculada». Ya no hacen falta: lo que enseñaron está escrito en las dos
  migraciones de hoy y en el documento del caso.

  ═══════════════════════════════════════════════════════════════════════════
  NOM-2026-0008 NO SE TOCA
  ═══════════════════════════════════════════════════════════════════════════

  Se creó a las 14:59, está CALCULADA y es la primera que sale con el motor
  nuevo: los 27 recibos caen exactos en 450, 250, 175 y 150. No estaba en la
  imagen porque es posterior, y por eso la reja de abajo no borra por fecha ni
  por «todos los anulados» sino por los cinco números, uno a uno.

  Y por eso TAMPOCO se reinicia el contador. Con la tabla vacía habría tenido
  sentido volver a NOM-2026-0001, pero 0008 sigue viva: bajar el contador haría
  que dentro de siete nóminas se repitiera un número que ya existe.

  ═══════════════════════════════════════════════════════════════════════════
  POR QUÉ SE PUEDE BORRAR SIN MIEDO
  ═══════════════════════════════════════════════════════════════════════════

  Ninguno se pagó. Cero filas en `tesoreria_movimientos` apuntando a nómina, en
  toda la base. Un período pagado tiene movimiento de tesorería, y esa clave
  foránea es NO ACTION —no cascada—, así que habría frenado el borrado por su
  cuenta. La reja del principio lo dice con nombre en vez de dejar saltar un
  23503 pelado.

  Lo que cae por CASCADE, contado antes de llevárselo:

      5 períodos
      131 recibos
      1.180 líneas de recibo
      4 novedades
      1 monto de novedad  (un bono de producción de 200 $ del 0003)
      5 faltas

  El disparador de auditoría anota el borrado, así que queda constancia de que
  estas filas existieron y de quién las quitó.
*/

do $mig$
declare
  v_numeros text[] := array['NOM-2026-0003','NOM-2026-0004','NOM-2026-0005',
                            'NOM-2026-0006','NOM-2026-0007'];
  v_periodos  int;
  v_recibos   int;
  v_lineas    int;
  v_novedades int;
  v_montos    int;
  v_faltas    int;
  v_vivos     int;
  v_pagados   int;
begin
  /* 1. Ninguno de los cinco puede estar vivo. Si lo esta, no se borra nada. */
  select count(*) into v_vivos
    from public.nomina_periodos
   where numero = any(v_numeros) and estado <> 'ANULADA';

  if v_vivos > 0 then
    raise exception 'Hay % de esos periodos que ya no esta anulado. No se borra ninguno.', v_vivos
      using errcode = '22023',
            hint = 'Alguien lo reabrio o lo renumero. Se revisa a mano antes de insistir.';
  end if;

  /* 2. Ninguno puede haberse pagado. */
  select count(*) into v_pagados
    from public.tesoreria_movimientos m
    join public.nomina_periodos p on p.id = m.nomina_periodo_id
   where p.numero = any(v_numeros);

  if v_pagados > 0 then
    raise exception 'Alguno de esos periodos tiene % movimiento(s) de tesoreria: se pago, y un periodo pagado no se borra.', v_pagados
      using errcode = '22023';
  end if;

  /* 3. Lo que se lleva por delante, contado antes de llevarselo. */
  select count(*) into v_periodos from public.nomina_periodos where numero = any(v_numeros);

  select count(*) into v_recibos from public.nomina_recibos r
    join public.nomina_periodos p on p.id = r.periodo_id where p.numero = any(v_numeros);

  select count(*) into v_lineas from public.nomina_recibo_lineas l
    join public.nomina_recibos r on r.id = l.recibo_id
    join public.nomina_periodos p on p.id = r.periodo_id where p.numero = any(v_numeros);

  select count(*) into v_novedades from public.nomina_novedades n
    join public.nomina_periodos p on p.id = n.periodo_id where p.numero = any(v_numeros);

  select count(*) into v_montos from public.nomina_novedades_montos m
    join public.nomina_periodos p on p.id = m.periodo_id where p.numero = any(v_numeros);

  select count(*) into v_faltas from public.nomina_faltas f
    join public.nomina_periodos p on p.id = f.periodo_id where p.numero = any(v_numeros);

  if v_periodos <> 5 then
    raise exception 'Se esperaban 5 periodos y hay %. Se revisa a mano.', v_periodos
      using errcode = '22023';
  end if;

  /* 4. El borrado. Recibos, lineas, novedades, montos y faltas caen por CASCADE. */
  delete from public.nomina_periodos where numero = any(v_numeros);

  raise notice 'Se fueron: % periodos, % recibos, % lineas, % novedades, % montos, % faltas.',
    v_periodos, v_recibos, v_lineas, v_novedades, v_montos, v_faltas;
end
$mig$;

/*
  Y se comprueba el resultado contra la base, no contra lo que dice el archivo.
*/
do $ver$
declare
  v_quedan   int;
  v_viva     text;
  v_recibos  int;
begin
  select count(*) into v_quedan from public.nomina_periodos
   where numero in ('NOM-2026-0003','NOM-2026-0004','NOM-2026-0005',
                    'NOM-2026-0006','NOM-2026-0007');
  if v_quedan <> 0 then
    raise exception 'Quedaron % de los cinco periodos de prueba.', v_quedan using errcode = '22023';
  end if;

  select numero into v_viva from public.nomina_periodos where estado <> 'ANULADA';
  if v_viva is distinct from 'NOM-2026-0008' then
    raise exception 'La unica nomina viva deberia ser NOM-2026-0008 y es %.', coalesce(v_viva, 'ninguna')
      using errcode = '22023';
  end if;

  select count(*) into v_recibos from public.nomina_recibos r
    join public.nomina_periodos p on p.id = r.periodo_id where p.numero = 'NOM-2026-0008';
  if v_recibos <> 27 then
    raise exception 'NOM-2026-0008 se quedo con % recibos en vez de 27.', v_recibos
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.nomina_recibos r
     where not exists (select 1 from public.nomina_periodos p where p.id = r.periodo_id)
  ) then
    raise exception 'Quedaron recibos huerfanos.' using errcode = '22023';
  end if;
end
$ver$;
