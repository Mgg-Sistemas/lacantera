/*
  LOS NÚMEROS DE LOS AVISOS HABLAN EN VENEZOLANO.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, en dos trozos, y comprobada
  contra la base viva. No cambia ningún dato: cambia cómo se escriben.
  ————————————————————————————————————————————————————————————————————————

  EL DEFECTO

  `lc_numeric` del servidor es `en_US.UTF-8`. Con eso, `%` sobre un `numeric` y
  `to_char` con los códigos G y D escriben «10,603.17» — que aquí se lee como
  diez coma seiscientos tres. Hay filas reales en `notificaciones` que ya lo
  dicen así.

  Y es peor de lo que parece por dónde sale: estos números viven en mensajes que
  existen para que alguien COMPARE dos cifras y decida. «A la factura le faltan
  1,250.00 $ y se están abonando 1.250,00 $» es exactamente el momento en que la
  puntuación tiene que estar bien.

  `private.numero_es` ya existía y ya lo resolvía —formatea en inglés y
  intercambia los separadores al final, que es más corto y más seguro que
  cambiar el locale de la sesión—. Lo que faltaba era usarla en todas partes.

  LAS DOS FORMAS QUE SE BUSCARON

  Este barrido no es una lectura de las 241 funciones: son dos lentes, y se dice
  para que no se lea como «ya no queda ninguno».

    1. `to_char(..., 'FM...9G999...D00')` — el formato explícito. Después de
       esto quedan CERO en `public` y `private`.
    2. `raise exception ... , round(algo, 2)` — el hueco con un numérico crudo
       al lado de una palabra de dinero o cantidad. Diez sitios.

  Lo que se le escapa: un mensaje que imprima una variable numérica sin
  `round()` alrededor. Queda por barrer, y con otra lente.

  LOS DOS AYUDANTES, Y CUÁNDO SE USA CADA UNO

    private.numero_es(x, 2) ..... dinero. Los ceros de la derecha dicen algo:
                                  «10,50» no es «10,5».
    private.cantidad_es(x) ...... cantidades. Sin decimales si no los tiene:
                                  «3 martillos», no «3,00 martillos».
*/

do $guarda$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='numero_es') then
    raise exception 'Falta private.numero_es.';
  end if;
end $guarda$;

-- ---------------------------------------------------------------------------
-- Una cantidad no arrastra ceros que nadie conto
-- ---------------------------------------------------------------------------
create or replace function private.cantidad_es(p_valor numeric)
returns text language sql immutable set search_path to ''
as $function$
  select case
    when p_valor is null then null
    when p_valor = trunc(p_valor) then private.numero_es(p_valor, 0)
    else regexp_replace(regexp_replace(private.numero_es(p_valor, 4), '0+$', ''), ',$', '')
  end;
$function$;

comment on function private.cantidad_es(numeric) is
  'Una cantidad escrita como se escribe aqui, sin decimales cuando no los tiene: 3 y no 3,00; 2,5 y no 2,5000. El entero baja por su propia rama a proposito: «1.000» no puede perder sus ceros, que ahi son cifras. Para dinero se usa private.numero_es con dos decimales, que ahi los ceros de la derecha si importan.';

-- ---------------------------------------------------------------------------
-- El barrido
-- ---------------------------------------------------------------------------

/*
  VA POR SUSTITUCION ANCLADA Y NO POR EXPRESION REGULAR AMPLIA, a proposito.

  Una regular del tipo «round(x, 2) -> numero_es(x, 2)» tocaria tambien los
  `round` de los CALCULOS, que tienen que seguir devolviendo un numero y no un
  texto. Cada linea de aqui lleva el trozo entero tal como aparece en su
  funcion, incluido lo que va delante y detras, para que solo encaje en el
  mensaje que se quiere cambiar.

  Y si alguna deja de encajar —porque su funcion cambio— esto PARA en vez de
  aplicar la mitad. Un barrido silencioso a medias es peor que no barrer: deja
  creer que ya esta hecho.
*/
do $barrido$
declare
  v_pares text[] := array[
    -- esquema | funcion | antes | despues
    'private|anotar|trim(to_char(v_total_usd, ''FM999G999G990D00''))|private.numero_es(v_total_usd, 2)',
    'private|avisar_asignaciones_vencidas|to_char(v_fila.cantidad, ''FM999G999G990D##'')|private.cantidad_es(v_fila.cantidad)',
    'public|aprobar_nomina|to_char(v_neto, ''FM999G999G999D00'')|private.numero_es(v_neto, 2)',
    'public|pagar_nomina|to_char(v_monto, ''FM999G999G999D00'')|private.numero_es(v_monto, 2)',
    'public|registrar_lectura|trim(to_char(p_inicial - v_previo,''FM999G999G990D00''))|private.numero_es(p_inicial - v_previo, 2)',
    'public|registrar_pago|to_char(v_i.igtf_alicuota, ''FM990.99'')|private.numero_es(v_i.igtf_alicuota, 2)',
    'public|saldar_herramienta_perdida|to_char(v_a.cantidad, ''FM999G999G990D##'')|private.cantidad_es(v_a.cantidad)',
    'private|trg_nota_credito_no_excede|v_factura.numero, round(v_acumulado, 2), round(v_factura.total, 2)|v_factura.numero, private.numero_es(v_acumulado, 2), private.numero_es(v_factura.total, 2)',
    'private|validar_firma|round(length(p_imagen) / 1024.0)|private.numero_es(round(length(p_imagen) / 1024.0), 0)',
    'public|calcular_nomina|round(v_monto, 2), v_m.nombre, v_tope_prestamo|private.numero_es(v_monto, 2), v_m.nombre, private.numero_es(v_tope_prestamo, 2)',
    'public|facturar_notas|v_cliente.nombre, round(v_deuda, 2), round(v_cliente.limite_credito, 2)|v_cliente.nombre, private.numero_es(v_deuda, 2), private.numero_es(v_cliente.limite_credito, 2)',
    'public|indicar_pago|round(v_tope, 2), v_moneda, round(v_pagado, 2)|private.numero_es(v_tope, 2), v_moneda, private.numero_es(v_pagado, 2)',
    'public|indicar_pago|round(v_total, 2), v_moneda, round(v_pagado, 2)|private.numero_es(v_total, 2), v_moneda, private.numero_es(v_pagado, 2)',
    'public|registrar_anticipo_prestaciones|v_p.nombre, round(v_p.disponible_anticipo, 2), round(p_monto, 2)|v_p.nombre, private.numero_es(v_p.disponible_anticipo, 2), private.numero_es(p_monto, 2)',
    'public|registrar_cobro|v_fac.numero, round(v_saldo, 2), round(v_monto_usd, 2)|v_fac.numero, private.numero_es(v_saldo, 2), private.numero_es(v_monto_usd, 2)',
    'public|registrar_pago_compra|v_fac.numero_factura, round(v_saldo, 2), round(v_monto_usd, 2)|v_fac.numero_factura, private.numero_es(v_saldo, 2), private.numero_es(v_monto_usd, 2)',
    'public|registrar_factura_compra|round(p_total_del_papel, 2), v_total, coalesce(p_exento, 0),|private.numero_es(p_total_del_papel, 2), private.numero_es(v_total, 2), private.numero_es(coalesce(p_exento, 0), 2),',
    'public|registrar_factura_compra|coalesce(p_base_imponible, 0), coalesce(p_iva, 0) using errcode|private.numero_es(coalesce(p_base_imponible, 0), 2), private.numero_es(coalesce(p_iva, 0), 2) using errcode',
    'public|registrar_lectura|to_char(v_sig_dia,''DD/MM/YYYY''), v_siguiente, to_char(v_fecha,''DD/MM/YYYY''), p_final|to_char(v_sig_dia,''DD/MM/YYYY''), private.cantidad_es(v_siguiente), to_char(v_fecha,''DD/MM/YYYY''), private.cantidad_es(p_final)',
    'public|registrar_lectura|to_char(v_previo_dia,''DD/MM/YYYY''), v_previo, to_char(v_fecha,''DD/MM/YYYY''), p_inicial,|to_char(v_previo_dia,''DD/MM/YYYY''), private.cantidad_es(v_previo), to_char(v_fecha,''DD/MM/YYYY''), private.cantidad_es(p_inicial),'
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
      v_def  := pg_get_functiondef(v_oid);
      v_antes := v_def;
      v_def := replace(v_def, v_t[3], v_t[4]);

      if v_def = v_antes then
        -- O ya estaba puesto, o el trozo cambio de forma. Lo segundo importa.
        if position(v_t[4] in v_antes) > 0 then
          v_saltados := v_saltados + 1;
        else
          v_faltan := v_faltan || format(E'\n  %s.%s: no se encontro «%s»', v_t[1], v_t[2], left(v_t[3], 50));
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

  raise notice 'Numeros en venezolano: % cambiados, % ya estaban.', v_hechos, v_saltados;
end $barrido$;

/*
  COMPROBADO el 8 de septiembre contra la base viva:

    private.numero_es(10603.17, 2) ....... 10.603,17
    private.numero_es(1234567.891, 2) .... 1.234.567,89
    private.cantidad_es(3) ............... 3
    private.cantidad_es(2,5) ............. 2,5
    private.cantidad_es(1000) ............ 1.000       (el entero no se pela)
    private.cantidad_es(1000,50) ......... 1.000,5
    private.cantidad_es(12345,6789) ...... 12.345,6789

  Y el barrido de comprobacion, que es el que importa:

      select n.nspname||'.'||p.proname, m[1]
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
        lateral regexp_matches(p.prosrc, '(to_char\([^)]{0,120}(9G999|990D|D##|FM9)[^)]{0,60}\))', 'g') m
       where n.nspname in ('public','private') and p.proname <> 'numero_es';

  Devuelve CERO filas.

  `private.anotar` corre en cada escritura de las que se auditan, asi que se
  probo escribiendo: una entrada de 12.345,67 L a 1.000,50 quedo anotada sin
  romper nada. Al terminar: 19 movimientos, 868.927.307,04. Produccion intacta.
*/
