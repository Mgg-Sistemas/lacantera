/*
  EL VALOR PUEDE NO SABERSE, Y ESO NO ES CERO.

  Christopher: «necesitamos que el valor de los items de inventario sea opcional,
  por requerimiento puntual; ya se discutió este tema y de acuerdo que debe ser
  flexible».

  Y el porqué llegó un rato después, de parte de la gobernación: «son inventarios
  distintos, los quieren lo más separado posible, ya que el inventario de la
  gobernación está prácticamente sin hacer y hacerlo se llevaría semanas».

  Eso cambia la lectura de la petición. No es un capricho de formulario: van a
  cargar cientos de renglones de material ajeno del que nadie sabe el precio, y
  exigir una cifra obligaría a inventarla. Un precio inventado en una entrada es
  indistinguible de uno real para siempre.

  ═══════════════════════════════════════════════════════════════════════════
  «SIN COSTO» Y «SIN VALOR DECLARADO» SON DOS COSAS DISTINTAS
  ═══════════════════════════════════════════════════════════════════════════

  Ya existía `p_sin_costo`, y contesta otra pregunta: «esto no le costó nada A
  ESTA EMPRESA porque lo pagó otra». Ahí el cero es un hecho comprobable, y por
  eso vive apartado en un almacén con `admite_sin_costo` — para que ese cero no
  hunda el promedio de lo que sí costó.

  Lo nuevo es distinto: «no sabemos cuánto vale». Escribir cero diría que no vale
  nada, y un cero inventado es exactamente el ruido que Christopher tiene
  prohibido: un número que nadie puede comprobar después y que no se distingue de
  uno real.

  Así que el hueco se guarda como hueco. `costo_usd` deja de ser obligatorio, y
  `valor_usd` —que es generada— se vuelve nula sola, sin tocar su fórmula.

  ═══════════════════════════════════════════════════════════════════════════
  EL PROMEDIO IGNORA LO NO VALORADO, EN LOS DOS LADOS DE LA DIVISIÓN
  ═══════════════════════════════════════════════════════════════════════════

  Es la parte delicada, y la comprobación en frío la enseñó. `sum()` se salta los
  nulos, así que el numerador se arreglaba solo — pero el denominador seguía
  contando las ocho sillas sin valorar y el promedio salía diluido: doce sillas a
  10 y ocho sin cifra daban 6, que no es el costo de ninguna silla.

  Se excluyen las filas sin valor de las DOS sumas. Lo que queda es el promedio
  de lo que sí se valoró, que es el único número defendible.

  Y LAS VISTAS CALCULAN ESE MISMO PROMEDIO POR SU CUENTA, en línea. Se quedaron
  con la fórmula vieja y dieron 6,00 mientras la función daba 10,00: dos sitios
  contestando distinto a la misma pregunta, y el de la vista es el que ve la
  gente. Se alinean aquí.

  ═══════════════════════════════════════════════════════════════════════════
  Y SE TIENE QUE VER QUE FALTA
  ═══════════════════════════════════════════════════════════════════════════

  Un inventario que dice «20 sillas · 120,00 USD» está contestando a medias sin
  avisar: quien lo lee saca que cada silla vale 6, y no vale 6 ninguna. Por eso
  las vistas ganan `existencia_sin_valorar`. La cifra sigue siendo cierta —vale
  eso lo que está valorado— y al lado se dice cuánto queda fuera.

  NADA QUE MIGRAR: los 49 movimientos tienen costo. Quitar el NOT NULL no cambia
  ni una fila.
*/

alter table public.inventario_movimientos alter column costo_usd drop not null;

comment on column public.inventario_movimientos.costo_usd is
  'Lo que costo la unidad. PUEDE SER NULO, y nulo significa «no se declaro valor» — que NO es lo mismo que cero. Cero es «no costo nada a esta empresa porque lo pago otra», es comprobable y vive apartado en un almacen con `admite_sin_costo`. Nulo es «no se sabe»: las sillas de la gobernacion llegan sin cifra y escribir cero diria que no valen nada. Lo pidio Christopher el 10/09/2026. `valor_usd` es generada y se vuelve nula sola.';

-- ---------------------------------------------------------------------------
-- El promedio ignora lo no valorado, en los dos lados de la división
-- ---------------------------------------------------------------------------
create or replace function private.costo_promedio(p_almacen bigint, p_articulo bigint)
returns numeric
language sql stable security definer set search_path to ''
as $function$
  /*
    SOLO LAS FILAS CON VALOR, en el numerador Y en el denominador. `sum()` se
    salta los nulos, asi que el de arriba se arreglaba solo; el de abajo seguia
    contando lo no valorado y el promedio salia diluido — doce sillas a 10 y ocho
    sin cifra darian 6, que no es el costo de ninguna silla.
  */
  select case when sum(cantidad * signo) > 0
              then round(sum(valor_usd * signo) / sum(cantidad * signo), 6)
              else 0 end
  from public.inventario_movimientos
  where almacen_id = p_almacen and articulo_id = p_articulo
    and costo_usd is not null;
$function$;

create or replace function private.costo_promedio(
  p_almacen bigint, p_articulo bigint, p_propietario text
) returns numeric
language sql stable security definer set search_path to ''
as $function$
  select case when sum(cantidad * signo) > 0
              then round(sum(valor_usd * signo) / sum(cantidad * signo), 6)
              else 0 end
  from public.inventario_movimientos
  where almacen_id = p_almacen and articulo_id = p_articulo
    and propietario = p_propietario
    and costo_usd is not null;
$function$;

-- ---------------------------------------------------------------------------
-- Y el escritor deja pasar el hueco
-- ---------------------------------------------------------------------------
do $escritor$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'registrar_movimiento';

  if position('un hueco es un hueco' in v_def) > 0 then
    raise notice 'registrar_movimiento ya dejaba pasar el hueco.';
    return;
  end if;

  /*
    Antes hacia `coalesce(p_costo_usd, 0)`, que convertia el «no se sabe» en un
    cero indistinguible de un cero de verdad. Ahora pasa tal cual.
  */
  v_def := replace(v_def,
    'p_almacen, p_articulo, p_cantidad, v_unidad, coalesce(p_costo_usd, 0),',
    'p_almacen, p_articulo, p_cantidad, v_unidad, p_costo_usd, -- un hueco es un hueco');

  if position('un hueco es un hueco' in v_def) = 0 then
    raise exception 'El anclaje no encajo: no se toca nada.';
  end if;

  execute v_def;
  raise notice 'el escritor deja pasar el hueco.';
end $escritor$;

-- ---------------------------------------------------------------------------
-- Las vistas dicen cuánto queda sin valorar
-- ---------------------------------------------------------------------------
do $porAlmacen$
declare v_def text;
begin
  select pg_get_viewdef('public.v_existencias'::regclass, true) into v_def;

  if position('existencia_sin_valorar' in v_def) > 0 then
    raise notice 'v_existencias ya decia cuanto queda sin valorar.';
    return;
  end if;

  v_def := regexp_replace(v_def,
    '(\s+)FROM inventario_movimientos m(\s+)JOIN almacenes a',
    ',
    COALESCE(sum(m.cantidad * m.signo) FILTER (WHERE m.costo_usd IS NULL), 0::numeric) AS existencia_sin_valorar\1FROM inventario_movimientos m\2JOIN almacenes a',
    '');

  if position('existencia_sin_valorar' in v_def) = 0 then
    raise exception 'El anclaje no encajo: no se toca la vista.';
  end if;

  execute 'create or replace view public.v_existencias as ' || v_def;
  raise notice 'la existencia por almacen dice cuanto queda sin valorar.';
end $porAlmacen$;

do $porArticulo$
declare v_def text;
begin
  select pg_get_viewdef('public.v_existencias_totales'::regclass, true) into v_def;

  if position('existencia_sin_valorar' in v_def) > 0 then
    raise notice 'v_existencias_totales ya decia cuanto queda sin valorar.';
    return;
  end if;

  v_def := regexp_replace(v_def,
    '(\s+)FROM articulos art(\s+)JOIN inventario_movimientos m',
    ',
    COALESCE(sum(m.cantidad * m.signo) FILTER (WHERE m.costo_usd IS NULL), 0::numeric) AS existencia_sin_valorar\1FROM articulos art\2JOIN inventario_movimientos m',
    '');

  if position('existencia_sin_valorar' in v_def) = 0 then
    raise exception 'El anclaje no encajo: no se toca la vista.';
  end if;

  execute 'create or replace view public.v_existencias_totales as ' || v_def;
  raise notice 'el total por articulo dice cuanto queda sin valorar.';
end $porArticulo$;

-- ---------------------------------------------------------------------------
-- Y el promedio de la vista dice lo mismo que el de la función
-- ---------------------------------------------------------------------------
do $vistas$
declare v_def text; v_n int := 0;
begin
  select pg_get_viewdef('public.v_existencias'::regclass, true) into v_def;
  if position('costo_usd IS NOT NULL) > 0' in v_def) = 0 then
    v_def := replace(v_def,
'                WHEN sum(m.cantidad * m.signo::numeric) > 0::numeric THEN round(sum(m.valor_usd * m.signo::numeric) / sum(m.cantidad * m.signo::numeric), 6)',
'                WHEN sum(m.cantidad * m.signo::numeric) FILTER (WHERE m.costo_usd IS NOT NULL) > 0::numeric THEN round(sum(m.valor_usd * m.signo::numeric) / sum(m.cantidad * m.signo::numeric) FILTER (WHERE m.costo_usd IS NOT NULL), 6)');
    if position('costo_usd IS NOT NULL) > 0' in v_def) = 0 then
      raise exception 'El anclaje de v_existencias no encajo: no se toca nada.';
    end if;
    execute 'create or replace view public.v_existencias as ' || v_def;
    v_n := v_n + 1;
  end if;

  select pg_get_viewdef('public.v_existencias_totales'::regclass, true) into v_def;
  if position('costo_usd IS NOT NULL) > 0' in v_def) = 0 then
    v_def := replace(v_def,
'                WHEN sum(m.cantidad * m.signo::numeric) > 0::numeric THEN round(sum(m.valor_usd * m.signo::numeric) / sum(m.cantidad * m.signo::numeric), 6)',
'                WHEN sum(m.cantidad * m.signo::numeric) FILTER (WHERE m.costo_usd IS NOT NULL) > 0::numeric THEN round(sum(m.valor_usd * m.signo::numeric) / sum(m.cantidad * m.signo::numeric) FILTER (WHERE m.costo_usd IS NOT NULL), 6)');
    if position('costo_usd IS NOT NULL) > 0' in v_def) = 0 then
      raise exception 'El anclaje de v_existencias_totales no encajo: no se toca nada.';
    end if;
    execute 'create or replace view public.v_existencias_totales as ' || v_def;
    v_n := v_n + 1;
  end if;

  raise notice 'vistas alineadas con la funcion: %', v_n;
end $vistas$;

grant select on public.v_existencias to authenticated;
grant select on public.v_existencias_totales to authenticated;

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás y con doce
  unidades a 10 USD y ocho sin cifra en el mismo almacén:

    el hueco se guarda como hueco : costo (nulo), valor (nulo)
    existencia .................. : 20 — las ocho cuentan como existencia
    sin valorar ................. : 8 — y se ve
    vale ........................ : 120,00 — lo que está valorado
    promedio, vista y función ... : 10,00 las dos, «dicen lo mismo»
                                    (antes del arreglo: 6,00 en la vista)
*/
