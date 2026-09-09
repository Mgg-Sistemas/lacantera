/*
  EL CONTEO GUARDA POR DÓNDE CORTA, EN VEZ DE DEDUCIRLO.

  `envases_aqui` necesita saber qué movimientos son POSTERIORES al conteo, para
  aplicarlos sobre lo que se contó. Lo deducía comparando `registrado_en`, y eso
  falla de una forma que destapó la propia prueba:

      `now()` en Postgres es el instante de INICIO DE LA TRANSACCIÓN.

  Así que un conteo y una salida hechos en la misma transacción llevan la misma
  marca, y el `<=` metía la salida del lado equivocado: quedaba como «anterior al
  conteo» y no se aplicaba. En producción son transacciones distintas casi
  siempre, y «casi» no es una garantía en el libro de inventario.

  Se guarda el corte al anotar el conteo, que es el único momento en que se sabe
  con certeza cuál era el último asiento que se estaba mirando.

  ═══════════════════════════════════════════════════════════════════════════
  LO QUE ESTO ENSEÑA DEL DISEÑO, Y VALE MÁS QUE EL ARREGLO
  ═══════════════════════════════════════════════════════════════════════════

  Con el corte mal puesto, la respuesta SEGUÍA SIENDO CORRECTA. La salida de
  cinco litros no se contó como movimiento a ciegas, pero la comprobación final
  —los envases contra la existencia del libro— vio que 208 no era 203 y devolvió
  «falta algo por anotar».

  Dos redes que no dependen la una de la otra: una mira si todo lo que se movió
  dijo su envase, y la otra si las cuentas cuadran contra el libro. Con una sola
  el fallo habría salido a la pantalla como un número creíble y falso.

  El mensaje sí era peor —decía «falta algo» en vez de «se movieron 5 L sin decir
  de dónde»— y por eso se arregla igual: quien lee esto tiene que poder saber
  qué hacer, y las dos frases no llevan al mismo sitio.
*/

alter table public.conteos
  add column if not exists corte_movimiento bigint references public.inventario_movimientos(id);

comment on column public.conteos.corte_movimiento is
  'El ultimo asiento del libro que este conteo estaba mirando. Todo lo que lleve un id mayor paso DESPUES y hay que aplicarlo sobre lo contado. Se guarda en vez de deducirlo por fecha porque `now()` es el inicio de la transaccion y dos escrituras de la misma transaccion empatan.';

/*
  Los dos cambios en `registrar_ajuste`, que van juntos porque son el mismo
  arreglo: se mira el ultimo asiento ANTES de escribir nada, y se guarda al
  insertar el conteo. Si hubo ajuste, el corte es ese ajuste —lo que vino
  despues de el es lo posterior—; si el conteo cuadro y no hubo asiento, el
  corte es el ultimo que habia.
*/
do $corte$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'registrar_ajuste';
  v_antes := v_def;

  if position('v_corte' in v_def) = 0 then
    v_def := replace(v_def,
      '  v_conteo     bigint;',
      '  v_conteo     bigint;' || chr(10) || '  v_corte      bigint;');

    v_def := replace(v_def,
'  if p_contado is not null and p_contado < 0 then
    raise exception ''Lo contado no puede ser negativo.'' using errcode = ''22023'';
  end if;',
'  if p_contado is not null and p_contado < 0 then
    raise exception ''Lo contado no puede ser negativo.'' using errcode = ''22023'';
  end if;

  -- El ultimo asiento que este conteo estaba mirando, antes de escribir nada.
  select max(m.id) into v_corte from public.inventario_movimientos m
   where m.articulo_id = p_articulo_id and m.almacen_id = p_almacen_id;');

    v_def := replace(v_def,
      'movimiento_id, motivo, registrado_por)',
      'movimiento_id, corte_movimiento, motivo, registrado_por)');
    v_def := replace(v_def,
      'v_total, v_existencia, v_mov, p_motivo, auth.uid())',
      'v_total, v_existencia, v_mov, coalesce(v_mov, v_corte), p_motivo, auth.uid())');
  end if;

  if v_def = v_antes then
    raise notice 'registrar_ajuste ya guardaba su corte.';
  else
    execute v_def;
    raise notice 'registrar_ajuste guarda por donde corta.';
  end if;
end $corte$;

/*
  Y el lector deja de deducir: toma `corte_movimiento` tal cual.
*/
do $lector$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'envases_aqui';
  v_antes := v_def;

  if position('c.corte_movimiento' in v_def) = 0 then
    v_def := replace(v_def,
'  select c.id, c.fecha, coalesce(c.movimiento_id,
           (select max(m.id) from public.inventario_movimientos m
             where m.articulo_id = p_articulo_id and m.almacen_id = p_almacen_id
               and m.registrado_en <= c.registrado_en))
    into v_conteo, v_desde, v_corte',
'  -- El ultimo conteo con hoja: es el unico que dice QUE envases habia.
  select c.id, c.fecha, c.corte_movimiento
    into v_conteo, v_desde, v_corte');
  end if;

  if v_def = v_antes then
    raise notice 'envases_aqui ya leia el corte guardado.';
  else
    execute v_def;
    raise notice 'envases_aqui lee el corte guardado.';
  end if;
end $lector$;

/*
  COMPROBADO el 9 de septiembre, en transaccion deshecha, con el caso real:

    1. hoy ................. «Desde siempre se movieron 208 L sin decir en que
                              envase». Correcto: la entrada del 5/09 no lo dijo.
    2. contar 1 tambor ..... cuadra, NO escribe asiento, y el saldo dice
                              1 TAMBOR = 1.632,80 USD.
    3. vaciarlo en 10
       pailas y 18 L ....... 10 PAILA = 1.491,50 y 18 L sueltos = 141,30.
                              Suman 1.632,80: se conserva.
    4. sacar 5 L sin decir
       de que envase ....... «Desde el 09/09/2026 se movieron 5,00 L sin decir en
                              que envase. Un conteo lo vuelve a fijar.»

  Produccion intacta: 46 movimientos, 10.840,04 USD, cero conteos, cero
  trasvases.
*/
