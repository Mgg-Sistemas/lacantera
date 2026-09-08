/*
  UN PAR NO TRAE VEINTE PARES: TRAE UNA CAJA.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP. Corrige UNA FILA DE DATOS
  REALES —la única del catálogo con este defecto— y cierra la puerta por la
  que entró. Reemplaza dos cuerpos de `20260908220000`.
  ————————————————————————————————————————————————————————————————————————

  Christopher, el 8 de septiembre: «la presentación mayormente intenta ser
  literal, para este caso, diremos caja».

  BOTAS DE SEGURIDAD tenía unidad PAR y presentación PAR, con veinte. La
  pantalla ofrecía contar «3» y dejar 60 PAR — «un PAR trae 20 PAR» no dice
  nada, y encima da dos maneras de teclear lo mismo. El dato viene del catálogo
  original y la siembra de esta mañana lo copió tal cual a la tabla nueva.

  SE CORRIGE EN SU SITIO, no se borra y se crea de nuevo. Así `trg_auditar` deja
  el PAR → CAJA escrito, que es lo que permite explicar dentro de un año por qué
  un número cambió. Y se puede corregir sin miedo porque ningún movimiento usó
  ese nombre: los dos movimientos del artículo tienen `unidad_capturada` nula,
  comprobado antes de tocar nada.

  ═══════════════════════════════════════════════════════════════════════════
  Y LA REGLA, POR FIN EN UN SOLO SITIO
  ═══════════════════════════════════════════════════════════════════════════

  Hay DOS caminos distintos hasta `articulo_presentaciones`:

      guardar_presentacion_de_articulo  ->  escribe la tabla directamente
      crear_articulo / editar_articulo  ->  escriben las dos columnas de
                                            `articulos`, y el disparador siembra

  El primero tenía la reja; el segundo no. Es **la sexta vez esta semana que
  aparece la forma «la reja en una puerta y no en la de al lado»** — y la
  primera que se ve venir en vez de descubrirse después. Las cinco anteriores
  fueron el vale con destino a mano, el traslado entre almacenes, la recepción,
  los bultos enteros y la tercera conversión de la salida.

  Así que la regla sale a `private.exigir_presentacion_util` y las dos puertas
  la llaman. Escribirla dos veces es cómo se queda fuera de la tercera.

  POR QUÉ EL DISPARADOR PUEDE PARAR SIN ROMPER LA PLANILLA

  Parecía el riesgo: `cargar_articulos_por_lote` pasa por `crear_articulo`, y
  una fila mala reventaría la carga entera. **Se midió antes de decidirlo**, con
  la reja puesta en una transacción deshecha y una planilla de tres filas con
  una mala: `errores=0, nuevos=3`. La razón es que esa función no escribe estas
  dos columnas, así que el disparador ni llega a mirarla.

  Queda dicho como lo que es: la planilla **no puede declarar presentaciones**,
  y eso es otra cosa que arreglar, no una virtud de esto.
*/

do $guarda$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='presentacion_desde_el_articulo') then
    raise exception 'Falta el disparador de siembra; corre antes 20260908220000.';
  end if;
end $guarda$;

-- ---------------------------------------------------------------------------
-- 1. La fila
-- ---------------------------------------------------------------------------

do $arreglo$
declare v_id bigint; v_forma bigint;
begin
  select id into v_id from public.articulos where codigo = 'EPP-0001';

  if v_id is null then
    raise notice 'No esta EPP-0001; nada que corregir.';
    return;
  end if;

  if not exists (select 1 from public.articulos
                  where id = v_id and unidad = 'PAR' and presentacion = 'PAR') then
    raise notice 'EPP-0001 ya no dice PAR/PAR; no se toca.';
    return;
  end if;

  -- Si alguien conto botas «en PAR» de verdad, renombrar dejaria un papel
  -- firmado sin respaldo. Se comprueba antes de tocar, no despues.
  if exists (select 1 from public.inventario_movimientos
              where articulo_id = v_id and unidad_capturada = 'PAR') then
    raise exception 'Hay movimientos que se contaron en PAR. Renombrar dejaria un papel firmado sin respaldo.';
  end if;

  update public.articulo_presentaciones
     set presentacion = 'CAJA'
   where articulo_id = v_id and presentacion = 'PAR'
  returning id into v_forma;

  update public.articulos
     set presentacion = 'CAJA'
   where id = v_id;

  raise notice 'BOTAS DE SEGURIDAD: la forma % pasa de PAR a CAJA de 20 pares.', v_forma;
end $arreglo$;

-- ---------------------------------------------------------------------------
-- 2. La regla, en un solo sitio
-- ---------------------------------------------------------------------------

create or replace function private.exigir_presentacion_util(
  p_nombre text, p_presentacion text, p_unidad text
) returns void language plpgsql immutable set search_path to ''
as $function$
begin
  if upper(btrim(coalesce(p_presentacion, ''))) = upper(btrim(coalesce(p_unidad, ''))) then
    raise exception 'La presentación no puede llamarse igual que la unidad: «%» ya es la unidad de %.',
      upper(btrim(p_presentacion)), p_nombre
      using errcode = '22023',
            hint = 'Si el artículo se cuenta en pares y viene en cajas de veinte pares, la presentación es CAJA.';
  end if;
end;
$function$;

comment on function private.exigir_presentacion_util(text, text, text) is
  'Para que «un PAR trae 20 PAR» no entre por ninguna de las dos puertas que escriben presentaciones. No aporta nada y hace que la pantalla ofrezca dos formas de teclear lo mismo; y es un error real del catalogo, el de BOTAS DE SEGURIDAD, corregido el 8/09/2026.';

-- La primera puerta: la que escribe la tabla.
do $puerta$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='guardar_presentacion_de_articulo';
  v_antes := v_def;

  v_def := replace(v_def,
'  if v_nombre = upper(btrim(v_art.unidad)) then
    raise exception ''La presentación no puede llamarse igual que la unidad: «%» ya es la unidad de %.'',
      v_nombre, v_art.nombre
      using errcode = ''22023'',
            hint = ''Si el artículo se cuenta en pares y viene en cajas de veinte pares, la presentación es CAJA.'';
  end if;',
'  perform private.exigir_presentacion_util(v_art.nombre, v_nombre, v_art.unidad);');

  if v_def = v_antes then
    if position('exigir_presentacion_util' in v_antes) > 0 then
      raise notice 'guardar_presentacion_de_articulo ya usa el ayudante.';
    else
      raise exception 'No se encontro la reja dentro de guardar_presentacion_de_articulo.';
    end if;
  else
    execute v_def;
    raise notice 'guardar_presentacion_de_articulo usa el ayudante.';
  end if;
end $puerta$;

-- La segunda: la que siembra desde las dos columnas de `articulos`.
create or replace function private.presentacion_desde_el_articulo()
returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  /*
    LAS DOS COLUMNAS VIEJAS SIEMBRAN LA TABLA, Y NO AL REVES.

    `crear_articulo`, `editar_articulo` y `cargar_articulos_por_lote` siguen
    escribiendo `presentacion` y `unidades_por_presentacion`. Migrarlas las tres
    seria tocar tres puertas para la misma regla — y llevo cuatro incidentes esta
    semana que empiezan exactamente asi.

    Asi que la regla vive aqui: cuando esas dos columnas quedan llenas, el
    articulo estrena su fila en `articulo_presentaciones` y queda marcada por
    defecto si no habia ninguna. Quien solo conoce las columnas sigue
    funcionando; quien declara varias presentaciones usa la tabla; y las dos
    dicen lo mismo sin que nadie tenga que acordarse.

    NO BORRA NADA. Vaciar la presentacion del articulo no apaga las declaradas:
    un articulo puede tener tambor y bidon, y las columnas solo reflejan la de
    por defecto. Apagar es cosa de `cambiar_estado_presentacion`, que si sabe lo
    que hace.
  */
  if new.presentacion is null or coalesce(new.unidades_por_presentacion, 0) <= 0 then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.presentacion is not distinct from old.presentacion
     and new.unidades_por_presentacion is not distinct from old.unidades_por_presentacion then
    return new;
  end if;

  /*
    Y AQUI SE PARA «UN PAR TRAE 20 PAR».

    Se comprobo que parar aqui no rompe la carga por planilla: esa funcion no
    escribe estas dos columnas, asi que el disparador no llega a mirarla. Las
    que si escriben son `crear_articulo` y `editar_articulo`, y ahi parar es lo
    que se quiere — con el mensaje que enseña la salida.
  */
  perform private.exigir_presentacion_util(new.nombre, new.presentacion, new.unidad);

  insert into public.articulo_presentaciones
    (articulo_id, presentacion, unidades, por_defecto, creada_por)
  values (
    new.id, upper(btrim(new.presentacion)), new.unidades_por_presentacion,
    not exists (select 1 from public.articulo_presentaciones
                 where articulo_id = new.id and por_defecto),
    new.creado_por)
  on conflict (articulo_id, presentacion) do update
     set unidades = excluded.unidades, activa = true;

  return new;
end;
$function$;

/*
  COMPROBADO el 8 de septiembre contra la base viva:

    BOTAS ahora ................ unidad PAR, presentacion CAJA, 20; una sola
                                 forma: CAJA=20 (defecto)
    crear PAR/PAR .............. rebota
    editar a PAR/PAR ........... rebota
    declarar PAR ............... rebota      <- las tres, el mismo mensaje, un
                                                solo sitio donde vive
    crear PAR/CAJA ............. pasa, y siembra CAJA=12
    planilla de dos filas ...... errores=0, nuevos=2
    entran 2 CAJA de botas ..... 40 PAR, capturado «2 CAJA»

  Al terminar: 19 movimientos, 868.927.307,04, y CERO articulos con la
  presentacion llamandose igual que la unidad. La auditoria de
  `articulo_presentaciones` registra el UPDATE de `presentacion`.
*/
