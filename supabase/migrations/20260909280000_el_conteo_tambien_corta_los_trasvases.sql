/*
  EL CONTEO TAMBIÉN CORTA LOS TRASVASES, NO SOLO LOS ASIENTOS.

  Christopher: «si hay errores, procede a solución con ellos». Éste salió de
  buscarlos a propósito, y es de los que no se ven hasta que se recorre el caso
  completo.

  `envases_aqui` arranca del último conteo y aplica lo que pasó DESPUÉS. Para los
  asientos del libro el corte era exacto —se guarda el id del último que el
  conteo estaba mirando— pero para los trasvases se comparaba por FECHA:

      re.fecha >= v_desde

  Con eso, un trasvase hecho por la mañana y un conteo hecho por la tarde del
  MISMO DÍA se aplicaban los dos: el conteo ya reflejaba el trasvase —la persona
  contó lo que había después de vaciarlo— y encima se le volvía a restar el
  tambor y sumar las pailas.

  COMPROBADO, y el resultado da la medida del daño:

      trasvasar 1 tambor -> 10 pailas y 18 L
      contar despues ..... 10 pailas y 18 L sueltos
      el sistema decia ... «Las cuentas dan -1 envases de TAMBOR, que es
                            imposible: falta algo por anotar»

  Menos uno de un envase. La comprobación final lo cazó y por eso no llegó a
  mentir —dijo «no se sabe» en vez de inventarse un reparto— pero negarse a
  contestar cuando la respuesta está delante también es un fallo. Y de paso
  confirma para qué sirve esa red: sin ella habría salido un número absurdo.

  LA MISMA MEDICINA QUE PARA LOS ASIENTOS: se guarda el corte al anotar el
  conteo, que es el único momento en que se sabe con certeza. Comparar por fecha
  es lo que ya había fallado con `registrado_en` esta misma tarde, y la lección se
  repite entera: una fecha no ordena dos cosas que pasan el mismo día.
*/

alter table public.conteos
  add column if not exists corte_reenvase bigint references public.reenvases(id);

comment on column public.conteos.corte_reenvase is
  'El ultimo trasvase que este conteo ya estaba viendo. Todo el que lleve un id mayor paso DESPUES y hay que aplicarlo sobre lo contado. Se guarda en vez de comparar por fecha: un trasvase de la manana y un conteo de la tarde del mismo dia se aplicaban los dos, y el conteo ya reflejaba el trasvase.';

/*
  El que anota el conteo guarda tambien ese corte. Se toma ANTES de escribir
  nada, igual que el de los asientos.
*/
do $corte$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'registrar_ajuste';
  v_antes := v_def;

  if position('v_corte_re' in v_def) = 0 then
    v_def := replace(v_def,
      '  v_corte      bigint;',
      '  v_corte      bigint;' || chr(10) || '  v_corte_re   bigint;');

    v_def := replace(v_def,
'  select max(m.id) into v_corte from public.inventario_movimientos m
   where m.articulo_id = p_articulo_id and m.almacen_id = p_almacen_id;',
'  select max(m.id) into v_corte from public.inventario_movimientos m
   where m.articulo_id = p_articulo_id and m.almacen_id = p_almacen_id;

  -- Y el ultimo trasvase que este conteo ya estaba viendo.
  select max(r.id) into v_corte_re from public.reenvases r
   where r.articulo_id = p_articulo_id and r.almacen_id = p_almacen_id;');

    v_def := replace(v_def,
      'movimiento_id, corte_movimiento, motivo, registrado_por)',
      'movimiento_id, corte_movimiento, corte_reenvase, motivo, registrado_por)');
    v_def := replace(v_def,
      'v_total, v_existencia, v_mov, coalesce(v_mov, v_corte), p_motivo, auth.uid())',
      'v_total, v_existencia, v_mov, coalesce(v_mov, v_corte), v_corte_re, p_motivo, auth.uid())');
  end if;

  if v_def = v_antes then
    raise notice 'registrar_ajuste ya guardaba el corte de trasvases.';
  else
    execute v_def;
    raise notice 'registrar_ajuste guarda tambien por donde corta los trasvases.';
  end if;
end $corte$;

-- Y el lector deja de comparar fechas.
do $lector$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'envases_aqui';
  v_antes := v_def;

  if position('v_corte_re' in v_def) = 0 then
    v_def := replace(v_def,
      '  v_corte    bigint;',
      '  v_corte    bigint;' || chr(10) || '  v_corte_re bigint;');

    v_def := replace(v_def,
      'select c.id, c.fecha, c.corte_movimiento
    into v_conteo, v_desde, v_corte',
      'select c.id, c.fecha, c.corte_movimiento, c.corte_reenvase
    into v_conteo, v_desde, v_corte, v_corte_re');

    v_def := replace(v_def,
      '       and (v_desde is null or re.fecha >= v_desde)',
      '       -- Por id y no por fecha: una fecha no ordena dos cosas del mismo dia.
       and (v_corte_re is null or re.id > v_corte_re)');
  end if;

  if v_def = v_antes then
    raise notice 'envases_aqui ya cortaba los trasvases por id.';
  else
    execute v_def;
    raise notice 'envases_aqui corta los trasvases por id.';
  end if;
end $lector$;
