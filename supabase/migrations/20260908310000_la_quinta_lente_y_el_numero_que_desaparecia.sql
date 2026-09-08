/*
  LA QUINTA LENTE, Y UN NÚMERO QUE DESAPARECÍA DEL AVISO.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, y probada disparando los
  mensajes de verdad.
  ————————————————————————————————————————————————————————————————————————

  Las cuatro lentes anteriores LEÍAN el código. Ésta lo ejecuta: se dispararon
  en vivo, módulo por módulo y en transacciones deshechas, **166 mensajes** de
  los reescritos hoy, y se leyó el texto que sale.

  Ninguno reventó por descuadre de argumentos —eso ya estaba comprobado contando
  los 177 `raise`—, pero al mirar el resultado apareció lo que ninguna lente
  estática podía ver. **Leer el código y verlo correr no son la misma
  comprobación**, y ésta es la tercera vez esta semana que la distinción paga.

  ═══════════════════════════════════════════════════════════════════════════
  1. POR ENCIMA DE UN BILLÓN, EL NÚMERO SE CONVIERTE EN ALMOHADILLAS
  ═══════════════════════════════════════════════════════════════════════════

  `private.numero_es` usaba la máscara `FM999G999G999G990`: doce dígitos
  enteros. Con 1.000.000.000.000 o más, `to_char` **no falla** — devuelve
  «###############» — y el aviso queda así:

      SOL-2026-0002 · ACEITES DE PLANTA Y MAQUINARIA · $ ###.###.###.###,##

  **El número no sale mal: desaparece.** Y en bolívares no es una cifra teórica:
  el inventario de hoy son 868.927.307,04 USD, que a la tasa del día pasan de
  1,8 × 10¹¹ — el mismo orden de magnitud, a un cero de distancia.

  Quince dígitos. `FM` quita el relleno, así que un número pequeño se sigue
  escribiendo igual.

  ═══════════════════════════════════════════════════════════════════════════
  2. LOS QUE LAS CUATRO LENTES ANTERIORES NO PODÍAN VER
  ═══════════════════════════════════════════════════════════════════════════

  Cuatro sitios con el número CRUDO en el hueco, que salen con punto decimal
  —«100.0000», «1600.5», «268.5»— que es exactamente lo que la reescritura vino
  a arreglar. Ninguno estaba en los 28, y cada uno se escapó por su rendija:

      private.exigir_existencia_para_reverso   el mensaje más largo de la casa,
                                               por encima del tope de 240
      public.registrar_factura_compra          un raise corto, sin round() que
                                               lo delatara
      public.registrar_lectura                 el tercer mensaje del horómetro
      public.despachar_combustible             un aviso que se escribe solo, con
                                               format() y no con raise

  ═══════════════════════════════════════════════════════════════════════════
  3. «3,0000 MARTILLOS»
  ═══════════════════════════════════════════════════════════════════════════

  Seis sitios usaban `private.numero_es(x, 4)` sobre CANTIDADES, que fuerza
  cuatro decimales: «solo hay 416,0000 en existencia». Les toca
  `private.cantidad_es`, que existe para eso desde esta mañana. El dinero se
  queda con `numero_es` y sus dos decimales, donde los ceros sí dicen algo.

  ═══════════════════════════════════════════════════════════════════════════
  LO QUE QUEDA ABIERTO, medido y no arreglado
  ═══════════════════════════════════════════════════════════════════════════

  - `private.cantidad_es` pierde información por debajo de 0,00005: lo escribe
    «0». Hoy no se alcanza por ninguna puerta —las cantidades son numeric(20,4)
    y el CHECK de asignaciones lo rechaza antes—, así que se deja anotado en vez
    de tapado.
  - `private.numero_es(null)` devuelve nulo, y un nulo en un hueco de `raise` se
    imprime «<NULL>». Le toca al llamador coalescer; no hay ninguno hoy que pase
    nulo por un camino real.
*/

-- ---------------------------------------------------------------------------
-- La mascara, tres digitos mas
-- ---------------------------------------------------------------------------
do $mascara$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='private' and p.proname='numero_es';
  v_antes := v_def;
  v_def := replace(v_def, '''FM999G999G999G990''', '''FM999G999G999G999G990''');
  if v_def = v_antes then
    raise notice 'numero_es ya tiene la mascara ancha.';
  else
    execute v_def;
    raise notice 'numero_es llega hasta quince digitos enteros.';
  end if;
end $mascara$;

-- ---------------------------------------------------------------------------
-- La quinta lente
-- ---------------------------------------------------------------------------
do $barrido$
declare
  v_pares text[] := array[
    -- Cantidades que arrastraban cuatro decimales
    'public|registrar_baja|private.numero_es(v_existencia, 4), private.numero_es(p_cantidad, 4)|private.cantidad_es(v_existencia), private.cantidad_es(p_cantidad)',
    'public|entregar_a_trabajador|v_art.nombre, private.numero_es(v_hay, 4), private.numero_es(v_cantidad, 4)|v_art.nombre, private.cantidad_es(v_hay), private.cantidad_es(v_cantidad)',
    'public|entregar_a_trabajador|v_art.nombre, private.numero_es(v_libres, 4)|v_art.nombre, private.cantidad_es(v_libres)',
    'public|entregar_dotacion|v_nombre, private.numero_es(v_hay, 4), private.numero_es(v_cantidad, 4)|v_nombre, private.cantidad_es(v_hay), private.cantidad_es(v_cantidad)',
    'public|asignar_herramienta|private.numero_es(v_libres, 4), v_art.nombre|private.cantidad_es(v_libres), v_art.nombre',
    'public|despachar_combustible|private.numero_es(v_hay, 4), v_art.unidad, v_art.nombre|private.cantidad_es(v_hay), v_art.unidad, v_art.nombre',

    -- Numeros crudos: los que ninguna lente alcanzaba
    'private|exigir_existencia_para_reverso|p_mov.numero, p_mov.cantidad, v_articulo, v_almacen, v_hay,|p_mov.numero, private.cantidad_es(p_mov.cantidad), v_articulo, v_almacen, private.cantidad_es(v_hay),',
    'public|registrar_factura_compra|      p_retencion_iva, p_iva using errcode|      private.numero_es(p_retencion_iva, 2), private.numero_es(p_iva, 2) using errcode',
    'public|registrar_lectura|el final (%) no puede ser menor que el inicial (%).'', p_final, p_inicial|el final (%) no puede ser menor que el inicial (%).'', private.cantidad_es(p_final), private.cantidad_es(p_inicial)',
    'public|despachar_combustible|format(''Quedan %s %s, y el mínimo son %s.'', v_hay - p_cantidad, v_art.unidad, v_art.stock_minimo)|format(''Quedan %s %s, y el mínimo son %s.'', private.cantidad_es(v_hay - p_cantidad), v_art.unidad, private.cantidad_es(v_art.stock_minimo))'
  ];
  v_par text; v_t text[]; v_def text; v_antes text; v_oid oid;
  v_hechos int := 0; v_saltados int := 0; v_faltan text := '';
begin
  foreach v_par in array v_pares loop
    v_t := string_to_array(v_par, '|');
    for v_oid in
      select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = v_t[1] and p.proname = v_t[2]
    loop
      v_def := pg_get_functiondef(v_oid);
      v_antes := v_def;
      v_def := replace(v_def, v_t[3], v_t[4]);
      if v_def = v_antes then
        if position(v_t[4] in v_antes) > 0 then
          v_saltados := v_saltados + 1;
        else
          v_faltan := v_faltan || format(E'\n  %s.%s: no se encontro «%s»', v_t[1], v_t[2], left(v_t[3], 60));
        end if;
      else
        execute v_def;
        v_hechos := v_hechos + 1;
      end if;
    end loop;
  end loop;

  if v_faltan <> '' then
    raise exception 'Sustituciones que no encajaron: %', v_faltan;
  end if;
  raise notice 'Quinta lente: % cambiados, % ya estaban.', v_hechos, v_saltados;
end $barrido$;

/*
  COMPROBADO el 8 de septiembre disparando los mensajes de verdad:

    el billon ....... 1.000.000.000.000,00 · 12.345.678.901.234,99
                      (antes: ###.###.###.###,##)
    el horometro .... «El horómetro no retrocede: el final (268,5) no puede ser
                      menor que el inicial (350,5).»   (antes: 268.5 y 350.5)
    la baja ......... «De "BOTAS DE SEGURIDAD" solo hay 0 en existencia y se
                      intentan dar de baja 999,5.»     (antes: 0,0000 y 999,5000)

  Al terminar: 19 movimientos, 868.927.307,04. Nada de produccion tocado.
*/
