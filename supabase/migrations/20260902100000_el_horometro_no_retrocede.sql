/*
  EL HORÓMETRO NO RETROCEDE, Y AHORA ES UNA REJA Y NO UN AVISO.

  ————————————————————————————————————————————————————————————————————————
  SIN APLICAR. Escrita el 2 de septiembre de 2026 sin acceso a la base — el
  MCP dejó de tener permiso a mitad de sesión. El cuerpo se copió del archivo
  `20260819140000_maquinaria_por_la_puerta_grande.sql`, NO del catálogo vivo.

  ANTES DE APLICARLA hay que comprobar contra `pg_get_functiondef` que el
  cuerpo vivo es el de ese archivo. La regla 7 de la casa existe justamente
  porque una migración puede haberse editado después de correr.
  ————————————————————————————————————————————————————————————————————————

  LO QUE SE REPORTÓ

  Christopher: «el valor inicial no está bien implementado, a tal punto, que
  puedes restar horas, cuando el único camino debería ser aumentar al formar un
  registro».

  Es exacto. Y lo llamativo es que la comprobación YA EXISTÍA — pero avisaba en
  vez de parar:

      if v_previo is not null and p_inicial <> v_previo then
        perform private.notificar('MAQUINARIA', 'HOROMETRO_NO_ARRASTRA', …);
      end if;

  O sea: la lectura se guardaba igual, y después salía una notificación que
  alguien tenía que leer, entender y corregir a mano. Con la lectura ya escrita
  y las horas ya restadas.

  QUÉ SE PUEDE HACER HOY, PARA QUE SE VEA EL TAMAÑO

  Ayer el reloj terminó en 250. Hoy se anota 100 → 110, y la base lo acepta:

      horas_totales ......... baja de 250 a 110
      horas_desde_mant ...... baja con ella
      horas_para_el_tope .... sube, o sea que el mantenimiento se aleja

  Un horómetro es un contador físico: no tiene marcha atrás. Si el número que
  se teclea es menor que el anterior, o está mal tecleado o le cambiaron el
  reloj a la máquina — y ninguna de las dos se arregla guardándolo.

  LAS DOS REJAS, Y POR QUÉ SON DOS

  1. HACIA ATRÁS. `inicial` no puede ser menor que el `final` de la lectura
     anterior. Es la que faltaba.

  2. HACIA DELANTE. `final` no puede pasar del `inicial` de la lectura
     siguiente. Esta no es teórica: la función REEMPLAZA la lectura de un día
     que ya tenga una —`on conflict do update`— así que corregir el martes con
     un número enorme dejaría el miércoles por debajo, y la secuencia rota por
     el otro lado. Con una sola reja se tapa la mitad del agujero.

  LO QUE NO SE PROHÍBE, A PROPÓSITO

  Que `inicial` sea MAYOR que el final anterior. Eso es un hueco —días que la
  máquina trabajó y nadie anotó—, y es un hecho corriente en una cantera: el
  parte se olvida, la máquina se lleva a otro frente. Prohibirlo obligaría a
  inventar lecturas para tapar el hueco, que es peor que tener el hueco.

  Ahí se conserva el aviso que ya existía, y ahora sí significa algo: si salta,
  es porque hay horas sin registrar, no porque alguien se equivocó de casilla.

  EL MENSAJE DICE LOS TRES NÚMEROS

  «El horómetro no retrocede» a secas obliga a ir a buscar cuál era la lectura
  anterior. Diciendo la fecha y el número, quien lo lee ya sabe qué escribir.
*/

create or replace function public.registrar_lectura(
  p_maquina_id bigint,
  p_fecha      date,
  p_inicial    numeric,
  p_final      numeric
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_maq         record;
  v_fecha       date := coalesce(p_fecha, current_date);
  v_previo      numeric;
  v_previo_dia  date;
  v_siguiente   numeric;
  v_sig_dia     date;
  v_id          bigint;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select * into v_maq from public.maquinaria where id = p_maquina_id;
  if v_maq.id is null then
    raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
  end if;

  if p_inicial is null or p_final is null then
    raise exception 'Hacen falta las dos lecturas del reloj: la de arrancar y la de terminar.'
      using errcode = '23514';
  end if;
  if p_inicial < 0 or p_final < 0 then
    raise exception 'Un horómetro no marca números negativos.' using errcode = '22023';
  end if;
  if p_final < p_inicial then
    raise exception 'El horómetro no retrocede: el final (%) no puede ser menor que el inicial (%).',
      p_final, p_inicial using errcode = '22023';
  end if;
  if v_fecha > current_date then
    raise exception 'No se anota una jornada que todavía no ocurrió.' using errcode = '22023';
  end if;

  -- La lectura de antes y la de después. La segunda hace falta porque esta
  -- funcion REEMPLAZA la del dia si ya existe, asi que corregir un dia pasado
  -- puede romper la secuencia hacia delante.
  select final, fecha into v_previo, v_previo_dia
    from public.horometro_lecturas
   where maquina_id = p_maquina_id and fecha < v_fecha
   order by fecha desc
   limit 1;

  select inicial, fecha into v_siguiente, v_sig_dia
    from public.horometro_lecturas
   where maquina_id = p_maquina_id and fecha > v_fecha
   order by fecha asc
   limit 1;

  /*
    LA REJA QUE FALTABA.

    Un horometro es un contador fisico y no tiene marcha atras. Un numero por
    debajo del anterior o esta mal tecleado, o le cambiaron el reloj a la
    maquina — y ninguna de las dos se arregla guardandolo.

    Esto era un `notificar` y por eso se podian restar horas.
  */
  if v_previo is not null and p_inicial < v_previo then
    raise exception 'El horómetro no retrocede. La lectura del % terminó en %, así que la del % no puede arrancar en %.',
      to_char(v_previo_dia, 'DD/MM/YYYY'), v_previo,
      to_char(v_fecha, 'DD/MM/YYYY'), p_inicial
      using errcode = '22023',
            hint = 'Si a la máquina le cambiaron el reloj, eso no se anota aquí: se corrige la ficha.';
  end if;

  if v_siguiente is not null and p_final > v_siguiente then
    raise exception 'La lectura del % arranca en %, así que la del % no puede terminar en %.',
      to_char(v_sig_dia, 'DD/MM/YYYY'), v_siguiente,
      to_char(v_fecha, 'DD/MM/YYYY'), p_final
      using errcode = '22023',
            hint = 'Estás corrigiendo un día pasado y el número se pasa del día siguiente.';
  end if;

  insert into public.horometro_lecturas (maquina_id, fecha, inicial, final, creada_por)
  values (p_maquina_id, v_fecha, p_inicial, p_final, (select auth.uid()))
  on conflict (maquina_id, fecha) do update
    set inicial = excluded.inicial,
        final   = excluded.final,
        creada_por = excluded.creada_por
  returning id into v_id;

  /*
    El aviso se queda, pero solo para el hueco.

    Antes saltaba con cualquier diferencia —`<>`— y por tanto tambien cuando el
    numero iba hacia atras, que ahora ya no puede pasar. Lo que queda es el
    caso legitimo: `inicial` por ENCIMA del final anterior son horas que la
    maquina trabajo y nadie anoto. Pasa —el parte se olvida, la maquina se va a
    otro frente— y no se prohibe, porque prohibirlo obligaria a inventar
    lecturas para tapar el hueco.

    Ahora que solo salta por eso, el aviso significa algo.
  */
  if v_previo is not null and p_inicial > v_previo then
    perform private.notificar(
      'MAQUINARIA', 'HOROMETRO_NO_ARRASTRA',
      format('El horómetro de %s tiene horas sin anotar', v_maq.nombre),
      format('La lectura del %s terminó en %s y la del %s arranca en %s: faltan %s horas por registrar.',
             to_char(v_previo_dia, 'DD/MM/YYYY'), v_previo,
             to_char(v_fecha, 'DD/MM/YYYY'), p_inicial,
             trim(to_char(p_inicial - v_previo, 'FM999G999G990D00'))),
      '/app/maquinaria', array['OPERACIONES'], 'ATENCION');
  end if;

  return v_id;
end;
$func$;

/*
  COMPROBAR

    -- Que la reja de verdad para, en transaccion deshecha:
    --   lectura del dia 1: 100 -> 250
    --   lectura del dia 2:  90 -> 110   -> tiene que REBOTAR
    --   lectura del dia 2: 250 -> 260   -> pasa
    --   lectura del dia 2: 300 -> 310   -> pasa, y avisa del hueco de 50 h
    --   corregir el dia 1 a 100 -> 999  -> tiene que REBOTAR (se pasa del dia 2)

    -- Y que las horas de la maquina no bajaron nunca:
    select horas_totales from public.v_maquinaria where id = <la de prueba>;
*/
