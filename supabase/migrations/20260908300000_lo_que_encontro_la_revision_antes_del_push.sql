/*
  LO QUE ENCONTRÓ LA REVISIÓN ANTES DEL PUSH.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, y probada en transacción
  deshecha. Cuatro cosas, y dos son mías de hoy.
  ————————————————————————————————————————————————————————————————————————

  Salió de someter la rama entera a una revisión adversarial antes de empujarla:
  siete lentes buscando, tres escépticos por hallazgo, y solo pasa lo que dos de
  los tres no consiguen refutar. Veintinueve hallazgos, veinte confirmados. Los
  del navegador van en el mismo commit; aquí van los cuatro de la base.

  ═══════════════════════════════════════════════════════════════════════════
  1. EL IGTF VOLVIÓ A DECIR «3,%» — una regresión mía de esta mañana
  ═══════════════════════════════════════════════════════════════════════════

  El texto era `rtrim(rtrim(to_char(alicuota,'FM990.99'), '0'), '.')`: quitaba
  los ceros y luego el punto, para que «3.00» quedara en «3». El barrido de los
  números cambió el `to_char` por `numero_es`, que devuelve «3,00» — y el
  segundo `rtrim` sigue buscando un PUNTO. La coma se queda: **«IGTF 3,% de la
  orden»**.

  Existe una migración entera de agosto para que esto dijera «IGTF 3%». Mi
  barrido la deshizo.

  **La lección no es «mirar más».** Es que una sustitución textual puede romper
  código que DEPENDE del formato anterior, y esa dependencia está fuera del
  trozo sustituido — dos líneas más allá, en un `rtrim` que nadie estaba
  mirando. Ninguna de mis cuatro lentes podía verlo, porque todas miraban el
  argumento y ninguna lo que se hacía con el resultado.

  ═══════════════════════════════════════════════════════════════════════════
  2. EL HORÓMETRO HABLABA EN DOS IDIOMAS
  ═══════════════════════════════════════════════════════════════════════════

  El aviso de horas sin anotar quedó en venezolano y el error de al lado no. La
  lente del barrido buscaba `raise exception` con un tope de **240 letras**, y
  este mensaje lo pasa porque lleva un `hint` largo.

  **Una consulta de comprobación con un tope es una consulta que no puede fallar
  en lo grande.** Decía «ninguna» con el sitio vivo delante.

  ═══════════════════════════════════════════════════════════════════════════
  3. EL COSTO POR PRESENTACIÓN DIVIDÍA ENTRE EL FACTOR EQUIVOCADO
  ═══════════════════════════════════════════════════════════════════════════

  La CANTIDAD ya convierte con la presentación que el renglón nombra; el COSTO
  seguía dividiendo entre `v_por_pres`, que sale de la columna vieja del
  artículo — la de por defecto. «3 BIDON a 130 el bidón» dividía 130 entre 208
  en vez de entre 20: el litro entraba a 0,63 en vez de a 6,50.

  No muerde hoy porque la pantalla divide en el navegador y manda el costo por
  unidad: la clave `costo_por_presentacion` está viva y sin usar. Muerde el día
  que alguien la estrene, que es justo cuando nadie se acordará de esto.

  ═══════════════════════════════════════════════════════════════════════════
  4. LA FICHA Y LA TABLA APUNTABAN A FORMAS DISTINTAS
  ═══════════════════════════════════════════════════════════════════════════

  El disparador de siembra creaba la fila y **no tocaba `por_defecto` nunca**.
  Con eso, cambiar la presentación en la ficha de un artículo que ya tenía dos
  dejaba la tabla marcando por defecto la ANTERIOR: `articulos` decía CAJA y la
  base, cuando nadie nombraba la presentación, seguía contando en TAMBOR.

  Dos fuentes que discrepan — que es justo lo que este disparador existe para
  impedir.
*/

-- ===========================================================================
-- 1. El IGTF
-- ===========================================================================
do $patch$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='registrar_pago';
  v_antes := v_def;

  -- `cantidad_es` hace las dos cosas de una y ademas sabe que el separador es
  -- coma: 3,00 -> «3»; 3,50 -> «3,5».
  v_def := replace(v_def,
    'rtrim(rtrim(private.numero_es(v_i.igtf_alicuota, 2), ''0''), ''.'')',
    'private.cantidad_es(v_i.igtf_alicuota)');

  if v_def = v_antes then
    if position('cantidad_es(v_i.igtf_alicuota)' in v_antes) > 0 then
      raise notice 'registrar_pago ya lo dice bien.';
    else
      raise exception 'No se encontro el rtrim del IGTF.';
    end if;
  else
    execute v_def;
    raise notice 'registrar_pago vuelve a decir «IGTF 3%%».';
  end if;
end $patch$;

-- ===========================================================================
-- 2. El horometro
-- ===========================================================================
do $patch$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='registrar_lectura';
  v_antes := v_def;

  v_def := replace(v_def,
    'to_char(v_previo_dia,''DD/MM/YYYY''), v_previo, to_char(v_fecha,''DD/MM/YYYY''), p_inicial
      using errcode=''22023'', hint=''Si a la máquina le cambiaron el reloj',
    'to_char(v_previo_dia,''DD/MM/YYYY''), private.cantidad_es(v_previo), to_char(v_fecha,''DD/MM/YYYY''), private.cantidad_es(p_inicial)
      using errcode=''22023'', hint=''Si a la máquina le cambiaron el reloj');

  if v_def = v_antes then
    raise notice 'registrar_lectura ya estaba; no se toca.';
  else
    execute v_def;
    raise notice 'registrar_lectura dice los dos mensajes en venezolano.';
  end if;
end $patch$;

-- ===========================================================================
-- 3. El costo por presentacion
-- ===========================================================================
do $patch$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='registrar_entradas';
  v_antes := v_def;

  -- `en_unidad_base(articulo, 1, 0, nombre)` devuelve exactamente el factor de
  -- esa presentacion, asi que el divisor sale de donde salio la cantidad.
  v_def := replace(v_def,
'      if coalesce(v_por_pres, 0) <= 0 then
        raise exception ''El renglón % (%): no se puede dar el costo por presentación porque el catálogo no dice cuántas unidades trae.'', v_n, v_nombre
          using errcode = ''22023'';
      end if;
      v_costo := v_costo / v_por_pres;',
'      -- El divisor sale de la MISMA presentacion que nombro el renglon, no de
      -- la de por defecto: si no, «3 BIDON a 130 el bidon» divide entre 208.
      declare v_factor numeric := private.en_unidad_base(v_articulo, 1, 0, v_nombre_pres);
      begin
        if coalesce(v_factor, 0) <= 0 then
          raise exception ''El renglón % (%): no se puede dar el costo por presentación porque el catálogo no dice cuántas unidades trae.'', v_n, v_nombre
            using errcode = ''22023'';
        end if;
        v_costo := v_costo / v_factor;
      end;');

  if v_def = v_antes then
    if position('v_costo / v_factor' in v_antes) > 0 then
      raise notice 'registrar_entradas ya divide por la presentacion nombrada.';
    else
      raise exception 'No se encontro el bloque del costo por presentacion.';
    end if;
  else
    execute v_def;
    raise notice 'registrar_entradas divide por la presentacion que nombra el renglon.';
  end if;
end $patch$;

-- ===========================================================================
-- 4. La ficha manda sobre la tabla
-- ===========================================================================
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

    NO BORRA NADA. Vaciar la presentacion del articulo no apaga las declaradas:
    apagar es cosa de `cambiar_estado_presentacion`, que si sabe lo que hace.
  */
  if new.presentacion is null or coalesce(new.unidades_por_presentacion, 0) <= 0 then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.presentacion is not distinct from old.presentacion
     and new.unidades_por_presentacion is not distinct from old.unidades_por_presentacion then
    return new;
  end if;

  perform private.exigir_presentacion_util(new.nombre, new.presentacion, new.unidad);

  /*
    Y LA QUE NOMBRA LA FICHA ES LA QUE SE PROPONE.

    La version anterior sembraba la fila y no tocaba `por_defecto` nunca. Con
    eso, cambiar la presentacion en la ficha de un articulo que ya tenia dos
    dejaba la tabla marcando por defecto la ANTERIOR: `articulos` decia CAJA y
    la base, cuando nadie nombraba la presentacion, seguia contando en TAMBOR.
    Dos fuentes que discrepan, que es justo lo que este disparador existe para
    impedir.

    Se apaga la de antes ANTES de encender esta: el indice unico parcial
    `(articulo_id) where por_defecto` no admite dos ni por un instante.
  */
  update public.articulo_presentaciones
     set por_defecto = false
   where articulo_id = new.id
     and por_defecto
     and presentacion <> upper(btrim(new.presentacion));

  insert into public.articulo_presentaciones
    (articulo_id, presentacion, unidades, por_defecto, creada_por)
  values (new.id, upper(btrim(new.presentacion)), new.unidades_por_presentacion,
          true, new.creado_por)
  on conflict (articulo_id, presentacion) do update
     set unidades = excluded.unidades, activa = true, por_defecto = true;

  return new;
end;
$function$;

/*
  COMPROBADO en transaccion deshecha, el 8 de septiembre:

    1) IGTF: alicuota 3,00 -> «IGTF 3%» · 3,50 -> «IGTF 3,5%»
    2) «El horómetro no retrocede. La lectura del 06/09/2026 terminó en
       12.345,5, así que la del 07/09/2026 no puede arrancar en 9.000,25.»
    3) 3 BIDON a 130 el bidon -> 60,00 L a 6,5000 por L   (antes: 0,63)
    4) tabla antes de tocar la ficha .... BIDON TAMBOR*
       la ficha pasa a BIDON ............ BIDON* TAMBOR, y articulos dice BIDON
       1 bulto sin nombrar .............. 20,00 L   (antes seguia contando 208)

  Al terminar: 19 movimientos, 868.927.307,04. Nada de produccion tocado.
*/
