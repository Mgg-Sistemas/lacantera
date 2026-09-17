/*
  CADA RENGLÓN DEL DESPACHO DICE DE QUÉ PATIO SALE

  Christopher, 17/09/2026, con el formulario delante: «se necesita que en vez de
  sacar todo de un almacén, se permita escoger (opcional) de dónde sale cada
  renglón». Arena lavada del patio de la planta de lavado y piedra de otro, en
  el mismo camión: la nota elegía un solo patio y rebotaba con «en PATIO DE
  PLANTA DE LAVADO hay 0 de PIEDRA».

  `nota_entrega_renglones.almacen_id` es el patio de ese renglón. Vacío quiere
  decir el de la nota, que sigue siendo obligatorio y es el de siempre: una nota
  de un solo patio no cambia en nada. Solo se guarda en lo inventariable —un
  flete no sale de ningún patio—.

  `despachar` pide los cerrojos, mira la existencia, toma el costo y escribe la
  salida en el patio de cada renglón. Anular ya reversaba por el almacén del
  movimiento, así que devuelve cada cosa a su patio sin tocarla.
*/

alter table public.nota_entrega_renglones
  add column almacen_id bigint references public.almacenes(id);

comment on column public.nota_entrega_renglones.almacen_id is
  'El patio del que sale este renglón, si no es el de la nota. Vacío: el de la nota.';

do $parche$
declare
  v_def text := pg_get_functiondef('private.cargar_renglones_venta(text, text, bigint, jsonb, character, date)'::regprocedure);
  v_n   integer;
  r     record;
begin
  for r in
    select * from (values
      (1,
       $a$         cantidad_inventario, medida, densidad_usada)$a$,
       $b$         cantidad_inventario, medida, densidad_usada, almacen_id)$b$),
      (2,
       $a$         v_inventario, v_medida, v_densidad);$a$,
       $b$         v_inventario, v_medida, v_densidad,
         -- El patio del renglón, si no es el de la nota. Un flete no tiene.
         case when v_articulo.inventariable then nullif(v_item ->> 'almacen_id', '')::bigint end);$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En cargar_renglones_venta el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  execute v_def;
end
$parche$;

do $parche$
declare
  v_def text := pg_get_functiondef('public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)'::regprocedure);
  v_n   integer;
  r     record;
begin
  for r in
    select * from (values
      (1,
       $a$    select distinct r.articulo_id
    from public.nota_entrega_renglones r
    join public.articulos a on a.id = r.articulo_id
    where r.nota_id = v_id and a.inventariable
    order by r.articulo_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(format('patio:%s:%s', p_almacen_id, v_reng.articulo_id), 0));$a$,
       $b$    select distinct coalesce(r.almacen_id, p_almacen_id) as almacen_id, r.articulo_id
    from public.nota_entrega_renglones r
    join public.articulos a on a.id = r.articulo_id
    where r.nota_id = v_id and a.inventariable
    order by 1, 2
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(format('patio:%s:%s', v_reng.almacen_id, v_reng.articulo_id), 0));$b$),
      (2,
       $a$           r.cantidad as vendida, r.unidad, a.unidad as unidad_patio, a.nombre, a.inventariable
    from public.nota_entrega_renglones r
    join public.articulos a on a.id = r.articulo_id
    where r.nota_id = v_id$a$,
       $b$           r.cantidad as vendida, r.unidad, a.unidad as unidad_patio, a.nombre, a.inventariable,
           -- Cada renglón, de su patio; sin patio propio, del de la nota.
           al.id as almacen_id, al.nombre as almacen, al.activo as almacen_activo
    from public.nota_entrega_renglones r
    join public.articulos a on a.id = r.articulo_id
    join public.almacenes al on al.id = coalesce(r.almacen_id, p_almacen_id)
    where r.nota_id = v_id$b$),
      (3,
       $a$    v_existe := private.existencia_para_escribir(p_almacen_id, v_reng.articulo_id);$a$,
       $b$    if not v_reng.almacen_activo then
      raise exception 'El almacén "%" está cerrado: «%» no puede salir de ahí.', v_reng.almacen, v_reng.nombre
        using errcode = '22023';
    end if;

    v_existe := private.existencia_para_escribir(v_reng.almacen_id, v_reng.articulo_id);$b$),
      (4,
       $a$        v_almacen.nombre, private.cantidad_es(v_existe), v_reng.nombre, private.cantidad_es(v_reng.cantidad)$a$,
       $b$        v_reng.almacen, private.cantidad_es(v_existe), v_reng.nombre, private.cantidad_es(v_reng.cantidad)$b$),
      (5,
       $a$    v_costo := private.costo_promedio(p_almacen_id, v_reng.articulo_id);$a$,
       $b$    v_costo := private.costo_promedio(v_reng.almacen_id, v_reng.articulo_id);$b$),
      (6,
       $a$      'SALIDA_DESPACHO', (-1)::smallint, p_almacen_id, v_reng.articulo_id,$a$,
       $b$      'SALIDA_DESPACHO', (-1)::smallint, v_reng.almacen_id, v_reng.articulo_id,$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En despachar el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  execute v_def;
end
$parche$;

do $ver$
begin
  if position('coalesce(r.almacen_id, p_almacen_id)' in pg_get_functiondef('public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)'::regprocedure)) = 0
     or position('private.existencia_para_escribir(p_almacen_id' in pg_get_functiondef('public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)'::regprocedure)) > 0
     or position('v_item ->> ''almacen_id''' in pg_get_functiondef('private.cargar_renglones_venta(text, text, bigint, jsonb, character, date)'::regprocedure)) = 0 then
    raise exception 'el despacho no quedó por renglón';
  end if;
end
$ver$;
