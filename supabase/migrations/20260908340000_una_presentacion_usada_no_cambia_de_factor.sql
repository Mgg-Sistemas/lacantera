/*
  UNA PRESENTACIÓN QUE YA SE USÓ NO CAMBIA DE FACTOR.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, y probada en transacción
  deshecha con los cuatro casos.
  ————————————————————————————————————————————————————————————————————————

  Christopher, el 8/09/2026: «debemos manejar con rigurosidad que sea editable si
  ya hay movimientos o items con esas unidades asignadas».

  POR QUÉ IMPORTA, y no es teórico. El libro guarda DOS cosas: la cantidad en
  unidad de operación —la que cuadra— y al lado `cantidad_capturada` +
  `unidad_capturada`, o sea «3 CAJA». Esa segunda mitad existe para poder cotejar
  el asiento contra un estante dentro de un año.

  Si el factor de CAJA cambia de 1 a 20 después, el asiento viejo sigue diciendo
  «3 CAJA» y quien lo lea multiplicará por 20 donde la base sumó 3. **El libro no
  se descuadra —la cantidad ya está escrita— pero el papel deja de explicarlo.**
  Es el mismo «papel firmado sin respaldo» que esta mañana paró el cambio de
  nombre de las botas.

  DÓNDE QUEDA REGISTRADA UNA PRESENTACIÓN, que son tres sitios y no uno:

      inventario_movimientos.unidad_capturada   el libro
      orden_renglones.presentacion              lo que se pidió
      cotizacion_renglones.presentacion         lo que ofreció el proveedor, que
                                                llega al artículo por
                                                `solicitud_renglon_id`

  La regla mira los tres y vive en un ayudante, no repetida en cada puerta: es la
  octava vez esta semana que aparece la forma «la reja en una puerta y no en la
  de al lado».

  LO QUE SÍ SE PUEDE HACER con una presentación usada: apagarla, encenderla y
  marcarla como propuesta. Nada de eso reinterpreta un papel. Y si el factor
  estaba mal, se declara OTRA con su nombre y se apaga ésta — que además deja el
  rastro de que hubo dos.
*/

create or replace function private.presentacion_ya_se_uso(
  p_articulo_id bigint, p_presentacion text
) returns text language sql stable security definer set search_path to ''
as $function$
  select nullif(concat_ws(', ',
    (select 'en ' || count(*) || ' movimiento' || case when count(*) = 1 then '' else 's' end
       from public.inventario_movimientos m
      where m.articulo_id = p_articulo_id
        and upper(btrim(coalesce(m.unidad_capturada, ''))) = upper(btrim(p_presentacion))
     having count(*) > 0),
    (select 'en ' || count(*) || ' renglón de orden' || case when count(*) = 1 then '' else 'es' end
       from public.orden_renglones r
      where r.articulo_id = p_articulo_id
        and upper(btrim(coalesce(r.presentacion, ''))) = upper(btrim(p_presentacion))
     having count(*) > 0),
    (select 'en ' || count(*) || ' renglón de cotización' || case when count(*) = 1 then '' else 'es' end
       from public.cotizacion_renglones c
       join public.orden_renglones r2 on r2.id = c.solicitud_renglon_id
      where r2.articulo_id = p_articulo_id
        and upper(btrim(coalesce(c.presentacion, ''))) = upper(btrim(p_presentacion))
     having count(*) > 0)
  ), '');
$function$;

comment on function private.presentacion_ya_se_uso(bigint, text) is
  'Dice DONDE se ha usado ya una presentacion de un articulo —el libro, las ordenes, las cotizaciones— o nulo si no se uso en ninguno. Existe para que la regla de «una presentacion usada no cambia de factor» viva en un solo sitio y no en cada puerta que declare presentaciones.';

do $puerta$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='guardar_presentacion_de_articulo';
  v_antes := v_def;

  v_def := replace(v_def,
'  -- Solo una por defecto. Se apaga la anterior ANTES de encender esta, porque
  -- el indice unico parcial no admite dos ni por un instante.',
'  /*
    Y SI YA SE USO, EL FACTOR SE CONGELA.

    Apagarla, encenderla o proponerla no reinterpreta nada. Cambiarle las
    unidades si: el asiento viejo dice «3 CAJA» y quien lo lea despues
    multiplicara por el numero nuevo donde la base sumo con el viejo.
  */
  declare v_donde text; v_ya numeric;
  begin
    select ap.unidades into v_ya
      from public.articulo_presentaciones ap
     where ap.articulo_id = p_articulo_id and ap.presentacion = v_nombre;

    if v_ya is not null and v_ya <> p_unidades then
      v_donde := private.presentacion_ya_se_uso(p_articulo_id, v_nombre);
      if v_donde is not null then
        raise exception ''«%» ya se usó %, así que no se le puede cambiar cuántas % trae: los papeles ya emitidos dicen esa cantidad.'',
          v_nombre, v_donde, v_art.unidad
          using errcode = ''55000'',
                hint = ''Declara otra presentación con su nombre y apaga ésta. Así el papel viejo se sigue explicando y el nuevo cuenta bien.'';
      end if;
    end if;
  end;

  -- Solo una por defecto. Se apaga la anterior ANTES de encender esta, porque
  -- el indice unico parcial no admite dos ni por un instante.');

  if v_def = v_antes then
    if position('presentacion_ya_se_uso' in v_antes) > 0 then
      raise notice 'guardar_presentacion_de_articulo ya congela el factor usado.';
    else
      raise exception 'No se encontro el ancla del «solo una por defecto».';
    end if;
  else
    execute v_def;
    raise notice 'guardar_presentacion_de_articulo congela el factor de una presentacion usada.';
  end if;
end $puerta$;

/*
  COMPROBADO en transaccion deshecha, el 8 de septiembre:

    A) sin usar ......... TAMBOR se corrige de 208 a 200 sin problema
       se usa ........... una entrada contada en tambores; el libro dice «2 TAMBOR»
    B) ya usada ......... rebota: ««TAMBOR» ya se usó en 1 movimiento, así que no
                          se le puede cambiar cuántas L trae: los papeles ya
                          emitidos dicen esa cantidad.»
    C) apagar la usada .. pasa: BIDON=20, TAMBOR=200 (apagada)
    D) mismo factor ..... pasa, aunque este usada: no reinterpreta nada

  Al terminar: 19 movimientos, 868.927.307,04. Nada de produccion tocado.

  LO QUE QUEDA ABIERTO, y va nombrado para que no se pierda: la PANTALLA todavia
  esconde del desplegable las presentaciones ya declaradas, asi que un factor mal
  puesto no se puede corregir desde ahi aunque la base ahora lo permita cuando no
  se ha usado. Es un callejon sin salida que se creo el mismo dia, al apagar los
  dos campos de arriba cuando el panel manda.
*/
