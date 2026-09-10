/*
  EL PANEL CONTABA COMO NUESTRO LO QUE NO LO ES.

  Christopher: «debemos evaluar si el tablero del panel, inventario, maquinaria,
  están acorde a los nuevos cambios». Ésta es la que estaba mal, y estaba en la
  base.

  `v_panel_resumen.inventario_usd` hacía `sum(valor_usd) from v_existencias`, sin
  mirar de quién es el almacén. Desde ayer hay dueños, así que ese número incluye
  las sillas de la gobernación — y sale en la portada del sistema, en grande,
  bajo el rótulo «Valor del inventario». Nadie lo lee como «lo que custodiamos»:
  se lee como patrimonio.

  Hoy da lo mismo porque los almacenes de la gobernación están vacíos. Eso no es
  una defensa: el día que entre la primera silla, el número miente sin que cambie
  nada en la pantalla.

  ═══════════════════════════════════════════════════════════════════════════
  SE PARTE EN DOS, NO SE ESCONDE UNA MITAD
  ═══════════════════════════════════════════════════════════════════════════

  `inventario_usd` pasa a ser lo NUESTRO, y se añade `inventario_ajeno_usd` al
  final. Filtrar y callar habría dejado el material prestado fuera de toda
  pantalla, y saber cuánto se custodia importa: es lo que hay que devolver.

  «Lo nuestro» se pregunta por `propietarios.es_la_casa` y no escribiendo
  'LACANTERA' dentro de la consulta. Para eso existe esa marca: el día que la
  empresa se llame de otro modo, esto no hay que tocarlo.

  La columna nueva va AL FINAL porque `create or replace view` no deja meterla en
  medio ni reordenar lo que ya había.

  ═══════════════════════════════════════════════════════════════════════════
  Y «BAJO EL MÍNIMO» TAMPOCO CUENTA LO AJENO
  ═══════════════════════════════════════════════════════════════════════════

  Segunda del mismo repaso. `articulos_bajo_minimo` cuenta filas de
  `v_existencias` por debajo del mínimo del artículo, y esas filas son por pareja
  (almacén, artículo) — incluidos los de la gobernación. Dos sillas suyas con el
  mínimo puesto en cinco encendían la alerta y el panel pedía comprar sillas.

  «Bajo el mínimo» es una señal de COMPRA, y solo se compra lo propio.
*/
do $panel$
declare v_def text;
begin
  select pg_get_viewdef('public.v_panel_resumen'::regclass, true) into v_def;

  /* Centinela con algo que SOLO existe en el texto nuevo. Un `position` que se
     pueda cumplir por accidente no es un centinela: esta misma mañana un parche
     salió por la puerta de «ya estaba hecho» porque buscaba un prefijo. */
  if position('inventario_ajeno_usd' in v_def) > 0 then
    raise notice 'el panel ya separaba lo ajeno.';
    return;
  end if;

  v_def := replace(v_def,
'    ( SELECT sum(v_existencias.valor_usd) AS sum
           FROM v_existencias) AS inventario_usd,',
'    ( SELECT COALESCE(sum(x.valor_usd), 0::numeric)
           FROM v_existencias x
             JOIN almacenes al ON al.id = x.almacen_id
             JOIN propietarios pr ON pr.codigo = al.propietario
          WHERE pr.es_la_casa) AS inventario_usd,');

  v_def := replace(v_def,
'AND tasas_cambio.fecha = CURRENT_DATE)) AS "exists") AS tasa_de_hoy;',
'AND tasas_cambio.fecha = CURRENT_DATE)) AS "exists") AS tasa_de_hoy,
    ( SELECT COALESCE(sum(x.valor_usd), 0::numeric)
           FROM v_existencias x
             JOIN almacenes al ON al.id = x.almacen_id
             JOIN propietarios pr ON pr.codigo = al.propietario
          WHERE NOT pr.es_la_casa) AS inventario_ajeno_usd;');

  if position('inventario_ajeno_usd' in v_def) = 0
     or position('WHERE pr.es_la_casa' in v_def) = 0 then
    raise exception 'Algun anclaje no encajo: no se toca la vista.';
  end if;

  execute 'create or replace view public.v_panel_resumen as ' || v_def;
  raise notice 'el panel separa lo nuestro de lo ajeno.';
end $panel$;

do $minimo$
declare v_def text;
begin
  select pg_get_viewdef('public.v_panel_resumen'::regclass, true) into v_def;

  if position('bajo_minimo_solo_nuestro' in v_def) > 0 then
    raise notice 'el panel ya contaba solo lo nuestro bajo minimo.';
    return;
  end if;

  v_def := replace(v_def,
'    ( SELECT count(*) AS count
           FROM v_existencias
          WHERE v_existencias.stock_minimo > 0::numeric AND v_existencias.existencia <= v_existencias.stock_minimo) AS articulos_bajo_minimo,',
'    ( SELECT count(*) AS bajo_minimo_solo_nuestro
           FROM v_existencias x
             JOIN almacenes al ON al.id = x.almacen_id
             JOIN propietarios pr ON pr.codigo = al.propietario
          WHERE pr.es_la_casa
            AND x.stock_minimo > 0::numeric
            AND x.existencia <= x.stock_minimo) AS articulos_bajo_minimo,');

  if position('bajo_minimo_solo_nuestro' in v_def) = 0 then
    raise exception 'El anclaje no encajo: no se toca la vista.';
  end if;

  execute 'create or replace view public.v_panel_resumen as ' || v_def;
  raise notice 'bajo el minimo cuenta solo lo nuestro.';
end $minimo$;

grant select on public.v_panel_resumen to authenticated;

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás y con un almacén
  de la gobernación creado a propósito:

    nuestro 10.775,34 · ajeno 50,00 · crudo 10.825,34
      -> las dos mitades suman el total, no se pierde ni se dobla nada

    bajo el mínimo antes 1 · después de meter 1 de la gobernación 1
      -> no lo cuenta, como debe

  Nota para quien lo repita: leído desde el rol del MCP, `inventario_usd` sale 0
  porque `v_existencias.valor_usd` está enrejado por `VER_VALORACION`. No es que
  el cambio lo rompa — hay que probarlo suplantando a un usuario de verdad.
*/
