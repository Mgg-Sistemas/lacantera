/*
  CUÁNTO VALE TODO, Y CUÁNTO DE CADA DUEÑO.

  Christopher, corrigiéndome: «existe la posibilidad de que en el inventario las
  cosas de la gobernación tengan valor declarado, por lo tanto no podemos omitir
  la pregunta de ¿cuánto vale todo el inventario? ¿cuánto vale lo de la cantera o
  lo de la gobernación por separado?».

  Tiene razón y mi arreglo de hace una hora se pasó de frenada. Yo venía de
  corregir lo contrario —un total que sumaba lo ajeno y se leía como patrimonio—
  y al partirlo dejé el total sin responder. Son TRES preguntas distintas y las
  tres son legítimas:

    · cuánto vale todo lo que hay aquí, sea de quien sea
      → es lo que se custodia, y lo que hay que asegurar
    · cuánto vale lo nuestro
      → es el patrimonio, y es lo que va al balance
    · cuánto vale lo de cada uno de los demás
      → es lo que hay que devolver, y lo que se cuadra con el ente

  Un número solo no contesta ninguna de las tres sin ambigüedad. Y el material de
  otro dueño SÍ se valora: entra con su valor declarado como cualquier otra
  entrada, así que la cifra existe y esconderla no la hace desaparecer.

  ═══════════════════════════════════════════════════════════════════════════
  UNA VISTA POR DUEÑO, NO DOS COLUMNAS MÁS
  ═══════════════════════════════════════════════════════════════════════════

  Lo fácil era añadir `inventario_total_usd` y quedarse. Se descarta porque él
  dice «por separado», y separado hoy son dos pero mañana son cuatro: en la
  conversación de facturación ya aparecieron Rápido y la comunidad. Con columnas
  fijas, cada dueño nuevo es una migración y una pantalla tocada; con una fila
  por dueño, es una fila.

  El dueño sale aunque no tenga nada. Un cero es una respuesta —«la gobernación
  no tiene material aquí»— y desaparecer de la lista no lo es.

  El total sí se añade al resumen del panel, porque ahí no hay sitio para una
  tabla y la tarjeta necesita la cifra de cabecera sin pedir otra consulta.
*/

create or replace view public.v_inventario_por_dueno as
  select pr.codigo                                as propietario,
         pr.nombre,
         pr.es_la_casa,
         pr.orden,
         count(distinct x.articulo_id)::integer   as articulos,
         coalesce(sum(x.valor_usd), 0::numeric)   as valor_usd,
         count(distinct x.almacen_id)::integer    as almacenes
    from public.propietarios pr
    left join public.almacenes al
           on al.propietario = pr.codigo and al.activo
    left join public.v_existencias x
           on x.almacen_id = al.id and x.existencia > 0
   where pr.activo
   group by pr.codigo, pr.nombre, pr.es_la_casa, pr.orden;

comment on view public.v_inventario_por_dueno is
  'Cuanto vale el inventario de cada dueño, y cuantos articulos y almacenes tiene. Lo pidio Christopher el 10/09/2026: «no podemos omitir la pregunta de ¿cuanto vale todo el inventario? ¿cuanto vale lo de la cantera o lo de la gobernacion por separado?». Es una fila por dueño y no dos columnas fijas porque «por separado» hoy son dos y mañana cuatro —en facturacion ya aparecieron Rapido y la comunidad—, y con columnas cada dueño nuevo seria una migracion. Sale el dueño aunque no tenga nada: un cero es una respuesta.';

alter view public.v_inventario_por_dueno set (security_invoker = on);
grant select on public.v_inventario_por_dueno to authenticated;

-- ---------------------------------------------------------------------------
-- Y el panel gana el total, que es lo que le faltaba
-- ---------------------------------------------------------------------------
do $total$
declare v_def text;
begin
  select pg_get_viewdef('public.v_panel_resumen'::regclass, true) into v_def;

  /* Marcador exacto del texto nuevo. Ni prefijo de nada ni distinto de caja. */
  if position('inventario_total_usd' in v_def) > 0 then
    raise notice 'el panel ya traia el total.';
    return;
  end if;

  v_def := replace(v_def,
'          WHERE NOT pr.es_la_casa) AS inventario_ajeno_usd;',
'          WHERE NOT pr.es_la_casa) AS inventario_ajeno_usd,
    ( SELECT COALESCE(sum(v_existencias.valor_usd), 0::numeric)
           FROM v_existencias) AS inventario_total_usd;');

  if position('inventario_total_usd' in v_def) = 0 then
    raise exception 'El anclaje no encajo: no se toca la vista.';
  end if;

  execute 'create or replace view public.v_panel_resumen as ' || v_def;
  raise notice 'el panel contesta tambien cuanto vale todo.';
end $total$;

grant select on public.v_panel_resumen to authenticated;

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás y con material de
  la gobernación entrado con valor declarado:

    La Cantera ..: 10.775,34 USD (6 artículos, 2 almacenes)
    Gobernación .: 100,00 USD (1 artículo, 1 almacén)
    panel .......: nuestro 10.775,34 · ajeno 100,00 · total 10.875,34

  Las tres cifras cuadran entre sí y con la vista por dueño: nuestro + ajeno =
  total, y la suma de la vista por dueño = total. Comprobado en la misma
  transacción, no a ojo.
*/
