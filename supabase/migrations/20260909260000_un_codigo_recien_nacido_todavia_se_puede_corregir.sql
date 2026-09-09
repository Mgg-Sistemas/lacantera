/*
  UN CÓDIGO RECIÉN NACIDO TODAVÍA SE PUEDE CORREGIR.

  Christopher: «he cambiado de categoría, pero el código no actualizó hacia la
  nueva categoría». La laptop quedó como INS-0006 —insumo— después de pasarla a
  «Equipo de oficina y cómputo».

  ═══════════════════════════════════════════════════════════════════════════
  QUE EL CÓDIGO NO SIGA A LA CATEGORÍA ES DELIBERADO
  ═══════════════════════════════════════════════════════════════════════════

  El código es la IDENTIDAD del artículo, no su clasificación. Se pide con él en
  el almacén, se imprime en órdenes y guías, y acaba escrito con marcador en el
  estante. Si cambiara solo porque alguien corrige una categoría, todos esos
  papeles quedarían apuntando a un nombre que ya no existe — y los papeles no se
  pueden reimprimir.

  Por eso `editar_articulo` no lo toca y la pantalla lo dice: «el código no se
  cambia: es con lo que se pide en el almacén y ya está impreso en lo emitido».

  ═══════════════════════════════════════════════════════════════════════════
  PERO ESA RAZÓN NO EXISTE SI EL ARTÍCULO NO HA SALIDO NUNCA
  ═══════════════════════════════════════════════════════════════════════════

  Y ese es el caso de la laptop: cero movimientos, cero renglones de pedido, cero
  de solicitud. No hay ningún papel que proteger. La regla seguía aplicándose
  igual, y el resultado era un código que fosiliza una equivocación de hace diez
  minutos.

  Así que la puerta decide MIRANDO, no por regla fija: si el artículo dejó
  rastro en cualquier documento, rechaza y dice dónde; si no, renumera.

  SE CAMINAN LAS CLAVES FORÁNEAS EN VEZ DE LISTARLAS. Hay veinte tablas que
  apuntan a `articulos` hoy, y una lista escrita a mano envejece: la tabla que se
  cree mañana no estaría, y el artículo se renumeraría con rastro. El paseo por
  `pg_constraint` la incluye sola.

  Quedan fuera las cuatro que son CONFIGURACIÓN DEL PROPIO ARTÍCULO y no un
  hecho ocurrido: sus formas de contar, su precio de venta, la dotación que le
  toca a un cargo y la máquina que lo usa como combustible. Ninguna es un papel
  emitido, y bloquear por ellas sería impedir corregir un artículo por el mero
  hecho de haberlo terminado de configurar.

  NADA APUNTA AL CÓDIGO, comprobado: las veinte claves foráneas van contra `id`.
  Así que renumerar no deja huérfana ninguna fila. Lo que se protege no es la
  base, es el papel y la memoria de la gente.

  EL NÚMERO VIEJO NO SE DEVUELVE. `private.codigo_de_articulo` consume el
  siguiente de la serie y el anterior se queda gastado. Es lo correcto: un
  correlativo con huecos es normal, y reciclarlo daría dos artículos distintos
  con el mismo código en dos momentos, que es exactamente lo que un código no
  puede permitir.
*/

create or replace function public.renumerar_articulo(p_id bigint)
returns text language plpgsql security definer set search_path to ''
as $function$
declare
  v_art     record;
  v_fk      record;
  v_cuantas bigint;
  v_donde   text[] := '{}';
  v_nuevo   text;
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');

  select id, codigo, nombre, categoria into v_art
    from public.articulos where id = p_id;
  if v_art.id is null then
    raise exception 'No existe el artículo %.', p_id using errcode = 'P0002';
  end if;

  /*
    ¿DEJÓ RASTRO EN ALGÚN SITIO?

    Se pasean las claves foráneas en vez de listar las tablas: hoy son veinte y
    la de mañana entraría sola. Las cuatro que se saltan son configuración del
    propio artículo —sus formas de contar, su precio, la dotación de un cargo, la
    máquina que lo quema— y no un hecho ocurrido: bloquear por ellas seria
    impedir corregir un artículo por haberlo terminado de configurar.
  */
  for v_fk in
    select t.relname as tabla, att.attname as columna
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_class cl on cl.oid = c.confrelid
      join pg_attribute att on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
     where c.contype = 'f'
       and n.nspname = 'public'
       and cl.relname = 'articulos'
       and t.relname not in ('articulo_presentaciones', 'precios_venta',
                             'dotacion_por_cargo', 'maquinaria')
     order by t.relname
  loop
    execute format('select count(*) from public.%I where %I = $1', v_fk.tabla, v_fk.columna)
      into v_cuantas using p_id;

    if v_cuantas > 0 then
      v_donde := v_donde || format('%s (%s)',
        replace(v_fk.tabla, '_', ' '), private.numero_es(v_cuantas, 0));
    end if;
  end loop;

  if cardinality(v_donde) > 0 then
    raise exception 'A "%" ya se le nombró con % en %. El código no se puede cambiar: está escrito en papeles que no se pueden reimprimir.',
      v_art.nombre, v_art.codigo, array_to_string(v_donde, ', ')
      using errcode = '23503',
            hint = 'La categoría sí queda corregida; lo que se queda es el código, que a partir de ahora es solo un nombre propio.';
  end if;

  v_nuevo := private.codigo_de_articulo(v_art.categoria);

  if v_nuevo = v_art.codigo then
    raise exception 'El código ya corresponde a la categoría.' using errcode = '22023';
  end if;

  update public.articulos set codigo = v_nuevo where id = p_id;

  return v_nuevo;
end;
$function$;

comment on function public.renumerar_articulo(bigint) is
  'Le da al articulo el codigo que le toca por su categoria de HOY, y solo si nunca ha salido en un papel. Existe porque el codigo NO sigue a la categoria a proposito —es la identidad del articulo, se imprime en ordenes y guias y se escribe en el estante, asi que cambiarlo dejaria esos papeles apuntando a un nombre que ya no existe— pero esa razon no existe cuando el articulo no ha aparecido en ninguno. Lo levanto Christopher el 9/09/2026: cambio la laptop a «Equipo de oficina y computo» y el codigo seguia diciendo INS. Camina las claves foraneas en vez de listar tablas, para que la que se cree manana entre sola; se salta las cuatro que son configuracion del propio articulo y no un hecho ocurrido. El numero viejo no se devuelve a la serie: reciclarlo daria dos articulos distintos con el mismo codigo en dos momentos.';

grant execute on function public.renumerar_articulo(bigint) to authenticated;
