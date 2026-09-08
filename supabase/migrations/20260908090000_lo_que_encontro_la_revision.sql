/*
  LO QUE ENCONTRÓ LA REVISIÓN DE LOS CUATRO COMMITS DE AYER.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, y probada en transacción
  deshecha contra los promedios y las órdenes reales.
  ————————————————————————————————————————————————————————————————————————

  Salió de someter los cuatro commits del 7 de septiembre a una revisión
  adversarial: siete lentes buscando, y cada hallazgo pasando por tres
  escépticos antes de darlo por bueno. Sobrevivieron quince; aquí están los
  ocho que tocan la base.

  Conviene decir lo que la revisión NO cubrió: cincuenta y uno de los ciento
  quince agentes se cayeron por errores de red y de autenticación, y por cómo
  estaba escrito el guion, un hallazgo cuyos tres verificadores fallaban se
  descartaba en silencio. Así que quince es un suelo, no un techo.

  ═══════════════════════════════════════════════════════════════════════════
  1. La división que revienta, justo en el caso que nos ocupa
  ═══════════════════════════════════════════════════════════════════════════

  El aviso del desvío arma el inverso como `1 / v_veces`, y `v_veces` ya viene
  de `round(v_costo_usd / v_ref, 2)`. Cuando el costo nuevo es más de doscientas
  veces más barato que el promedio, eso redondea a `0.00` y la división lanza
  22012.

  Y ése es EXACTAMENTE el caso que hay en la base: meter el aceite SAE 50 a su
  precio real de 6,21 contra el promedio envenenado de 1.209.012,48.

  Lo peor es que ya lo sabíamos. `registrar_recepcion` y
  `revisar_costo_de_entrada` sacan el inverso de los valores crudos, y el
  comentario de la segunda lo dice con todas las letras: «6,21 / 1.209.012,48
  redondea a 0,00 y dividir entre eso revienta. Ya pasó hoy». Las dos puertas
  de entrada se quedaron fuera del arreglo, así que el aviso que existe para el
  desvío hacia abajo reventaba en el desvío hacia abajo más grande que hay.

  ═══════════════════════════════════════════════════════════════════════════
  2. Cinco `%s` dentro de un `raise`
  ═══════════════════════════════════════════════════════════════════════════

  En `raise` el hueco es `%` a secas: `%s` consume el argumento y deja la «s»
  pegada al valor. Con cinco huecos y cinco argumentos no salta ningún error de
  conteo, así que el mensaje salía corrompido en silencio —«El renglón 1s
  (CABILLAS 3/8s)»—. Los `%s` de los `format()` de la misma función sí son
  correctos, y confundir las dos es justo como nace este fallo. Van dos veces
  en dos días.

  ═══════════════════════════════════════════════════════════════════════════
  3. El factor guardado no tenía sitio para el desvío hacia abajo
  ═══════════════════════════════════════════════════════════════════════════

  `aviso_costo` guardaba `round(x, 2)`, que hacia abajo es `0.00`, y entonces la
  marca del historial hacía `1 / 0` y escribía «÷∞» — en el movimiento más grave
  de todos. Con seis decimales el número sigue siendo el factor y ya se puede
  invertir. No hay ningún movimiento con `aviso_costo` todavía, así que esto no
  reexpresa nada.

  ═══════════════════════════════════════════════════════════════════════════
  4. Siete funciones nuevas quedaron ejecutables por `anon`
  ═══════════════════════════════════════════════════════════════════════════

  La casa revoca EXECUTE a `public` y a `anon` en cada función que crea: 205 de
  las 216 de `public` llevan el ACL limpio. Las migraciones de ayer no lo
  hicieron. Y `create or replace` con una firma NUEVA crea una función nueva a
  efectos de permisos, así que `crear_articulo` perdió además el revoke que su
  firma anterior sí tenía. Tres —`corregir_costo`,
  `impacto_de_corregir_costo`, `registrar_entrada`— quedaron incluso con PUBLIC.

  La reja de dentro sigue parando a `anon`, que no tiene `auth.uid()`. Pero la
  clave publicable viaja en el navegador y este repositorio es público: la
  segunda capa se pone porque la primera puede fallar, no porque se espere que
  falle.

  ═══════════════════════════════════════════════════════════════════════════
  5 y 6. El núcleo se equivocaba en las dos direcciones
  ═══════════════════════════════════════════════════════════════════════════

  DOS GENÉRICAS SEGUIDAS. El barrido usaba `' (REPUESTO|…|DE|…) '`, y ese patrón
  consume el espacio de los DOS lados: con la bandera `g` la búsqueda sigue
  DESPUÉS del trozo comido, así que la segunda de dos genéricas seguidas se
  quedaba sin el espacio que la abre y sobrevivía. «Repuesto de disco de corte»
  daba `DISCO DE CORTE` y «Disco de corte» daba `DISCO CORTE`: dos claves para
  el mismo disco, que es lo contrario de lo que esto hace.

  EL PLURAL. La regla solo quitaba la -S final, que cubre las palabras acabadas
  en vocal y deja fuera media lengua: en español las acabadas en consonante
  hacen el plural en -ES y las acabadas en -Z en -CES. «Pistones» y «Piston»
  pasaban como dos artículos distintos.

  El primer intento de arreglarlo imitaba la gramática y se equivocó dos veces
  más: las reglas se aplicaban EN CADENA a la misma palabra y `Envases` acababa
  en `ENVA`; y `Luces`/`Luz` seguían sin encontrarse.

  LA LECCIÓN, que es la que importa: **aquí no hace falta acertar el singular.**
  Hace falta que dos escrituras de la misma cosa den la MISMA clave, y para eso
  basta con recortar siempre por el mismo sitio aunque lo que quede no sea una
  palabra. `DISCO` y `DISCOS` dan los dos `DISC`, y con eso está todo hecho.
  Perseguir la morfología española era resolver un problema más difícil que el
  que hay.

  Medido después, sobre diecinueve pares: 16 de 16 duplicados reconocidos, y los
  3 pares realmente distintos —disco de 7 contra disco de 9, gas contra gasoil,
  hidráulico 68 contra hidráulico 46— correctamente separados.

  ═══════════════════════════════════════════════════════════════════════════
  7. La reja del homónimo vivía solo en el navegador
  ═══════════════════════════════════════════════════════════════════════════

  `crear_articulo` ganó ayer `p_confirmado`. `editar_articulo` se quedó con sus
  trece argumentos: lo único que impedía renombrar un artículo encima de otro
  era el `disabled` de un botón. Un `disabled` es una cortesía, no un control
  —regla 1 de la casa—, y es además el camino más fácil de recorrer sin querer:
  no hace falta crear nada, basta con corregirle el nombre a uno que ya está.

  ═══════════════════════════════════════════════════════════════════════════
  8. La cuarta puerta al lado de la misma reja
  ═══════════════════════════════════════════════════════════════════════════

  Ayer se cerró el paso entre almacenes con y sin costo en tres sitios
  —Transferencias, «Pasar al tanque» y «Cargar combustible»— y se dejó abierta
  la más usada: «Meter material» de Existencias ofrecía todos los almacenes
  activos, y `registrar_entradas` solo comprobaba que el almacén existiera.
  `registrar_entrada` —la singular— sí lo miraba.

  Es la cuarta vez en dos días que aparece la misma forma: la comprobación
  existe y hay una puerta al lado que no pasa por ella. Y la manera de cazarlo
  sigue siendo la misma que se escribió el 7 de septiembre y que no se aplicó:
  **enumerar TODAS las funciones que escriben en la misma tabla, no las que
  parecen relacionadas.**

  ═══════════════════════════════════════════════════════════════════════════
  Y el índice que no se podía usar
  ═══════════════════════════════════════════════════════════════════════════

  `articulos_parecidos` filtraba con `similarity(a, b) >= 0.45`, y `gin_trgm_ops`
  solo indexa operadores, no llamadas a función: el índice estaba puesto y el
  plan era un recorrido completo igual. Con quince artículos da lo mismo; con
  dos mil, no. Ahora usa el operador `%` —cuyo umbral, 0,3, es más ancho— y deja
  el `>= 0.45` detrás como segundo filtro: el índice reduce los candidatos y la
  función decide. La otra rama del OR, la del núcleo idéntico, tiene ahora su
  propio índice.
*/

do $guarda$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_trgm') then
    raise exception 'Falta pg_trgm.';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='editar_articulo') <> 1 then
    raise exception 'editar_articulo no es unica.';
  end if;
end $guarda$;

-- ---------------------------------------------------------------------------
-- El nucleo, que no imita la gramatica: solo es consistente
-- ---------------------------------------------------------------------------
create or replace function private.raiz_de_palabra(p_palabra text)
returns text language plpgsql immutable security definer set search_path to ''
as $function$
declare v_w text := p_palabra;
begin
  /*
    NO ES SINGULARIZAR: ES LLEVAR LAS DOS FORMAS AL MISMO SITIO.

        DISCOS -> DISCO -> DISC        DISCO   -> DISC
        ENVASES -> ENVASE -> ENVAS     ENVASE  -> ENVAS
        PISTONES -> PISTONE -> PISTON  PISTON  -> PISTON
        LAPICES -> LAPICE -> LAPIC     LAPIZ   -> LAPIC
        LUCES -> LUCE -> LUC           LUZ     -> LUC

    La -Z final pasa a -C porque es la misma alternancia que hace el plural
    (luz/luces, lapiz/lapices), y sin ella esas dos formas no se encuentran.

    Los minimos de longitud son la red: por debajo de ellos la terminacion suele
    ser parte de la palabra —GAS, MAS, SAE— y recortarla inventa parecidos.
  */
  if length(v_w) >= 5 and right(v_w, 1) = 'S' then v_w := left(v_w, -1); end if;
  if length(v_w) >= 4 and right(v_w, 1) = 'E' then v_w := left(v_w, -1); end if;
  if length(v_w) >= 3 and right(v_w, 1) = 'Z' then v_w := left(v_w, -1) || 'C'; end if;
  return v_w;
end;
$function$;

comment on function private.raiz_de_palabra(text) is
  'Recorta una palabra siempre por el mismo sitio para que el singular y el plural den la misma clave. No pretende ser el singular: DISCO y DISCOS dan los dos DISC, y eso es todo lo que hace falta para comparar.';

create or replace function private.nombre_nucleo(p_texto text)
returns text language plpgsql immutable security definer set search_path to ''
as $function$
declare
  c_vacias constant text[] := array[
    'REPUESTO','INSUMO','MATERIAL','ARTICULO','PRODUCTO','HERRAMIENTA',
    'DE','DEL','LA','EL','LO','UN','UNA','PARA','CON','POR','Y'];
  v_base   text := private.nombre_comparable(p_texto);
  v_todas  text;
  v_nucleo text;
begin
  /*
    PALABRA A PALABRA, Y NO CON UNA EXPRESION REGULAR.

    El patron `' (REPUESTO|...|DE|...) '` consume el espacio de los DOS lados:
    con la bandera 'g' la busqueda sigue DESPUES del trozo comido, asi que la
    segunda de dos genericas seguidas se quedaba sin el espacio que la abre y
    sobrevivia. Partido en palabras no hay delimitadores que comerse, y ademas
    se lee. La expresion regular era mas corta y mas lista de lo que hacia falta.

    Las genericas se comparan por su raiz para que «Repuestos» caiga igual que
    «Repuesto».
  */
  v_todas := btrim(array_to_string(
    array(select private.raiz_de_palabra(w)
            from unnest(string_to_array(v_base, ' ')) w
           where w <> ''), ' '));

  v_nucleo := btrim(array_to_string(
    array(select w
            from unnest(string_to_array(v_todas, ' ')) w
           where not (w = any(select private.raiz_de_palabra(g) from unnest(c_vacias) g))), ' '));

  -- Si no queda nada, se queda lo que habia: un articulo llamado «Insumos» es
  -- todo palabra generica, y vaciarlo lo dejaria sin con que compararse.
  return case when length(v_nucleo) >= 2 then v_nucleo else v_todas end;
end;
$function$;

comment on function private.nombre_nucleo(text) is
  'La clave con la que se reconoce que dos nombres son el mismo articulo: sin tildes, sin puntuacion, sin las palabras que no distinguen y con cada palabra recortada a su raiz, de modo que el singular y el plural coincidan. Se calcula al comparar y no se guarda: una clave guardada se queda vieja en cuanto alguien edita el nombre.';

comment on function private.nombre_comparable(text) is
  'Un nombre sin tildes, sin puntuacion y sin espacios de mas, para poder compararlo. Quitar las palabras que no distinguen es cosa de private.nombre_nucleo, no de aqui.';

create index if not exists articulos_nucleo_idx
  on public.articulos (private.nombre_nucleo(nombre));

/*
  Los cuerpos de `public.articulos_parecidos(text, bigint, text)` —que ahora usa
  el operador `%` para que el indice GIN sirva de algo— y de
  `public.editar_articulo(..., p_confirmado boolean)` —que se solto y se
  recreo, porque `create or replace` con otra firma ANADE una funcion— son los
  que devuelve `pg_get_functiondef` tras esta migracion:

      select pg_get_functiondef(p.oid)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('articulos_parecidos', 'editar_articulo');

  Y los tres cuerpos que se parchearon en vivo —`registrar_entradas`,
  `registrar_entrada` y el suyo propio— llevan sus comentarios dentro:

      select pg_get_functiondef(p.oid)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('registrar_entradas', 'registrar_entrada');
*/

-- ---------------------------------------------------------------------------
-- Los permisos que se quedaron abiertos ayer
-- ---------------------------------------------------------------------------
revoke execute on function public.revisar_costo_de_entrada(bigint, bigint, numeric, text, date) from public, anon;
revoke execute on function public.articulos_parecidos(text, bigint, text) from public, anon;
revoke execute on function public.corregir_precio_de_orden(bigint, bigint, numeric, text) from public, anon;
revoke execute on function public.corregir_costo(bigint, bigint, numeric, text, date) from public, anon;
revoke execute on function public.impacto_de_corregir_costo(bigint, bigint, numeric) from public, anon;
revoke execute on function public.registrar_entrada(bigint, bigint, numeric, numeric, text, text, date, boolean, boolean) from public, anon;
revoke execute on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean) from public, anon;
revoke execute on function public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean) from public, anon;

grant execute on function public.revisar_costo_de_entrada(bigint, bigint, numeric, text, date) to authenticated;
grant execute on function public.articulos_parecidos(text, bigint, text) to authenticated;
grant execute on function public.corregir_precio_de_orden(bigint, bigint, numeric, text) to authenticated;
grant execute on function public.corregir_costo(bigint, bigint, numeric, text, date) to authenticated;
grant execute on function public.impacto_de_corregir_costo(bigint, bigint, numeric) to authenticated;
grant execute on function public.registrar_entrada(bigint, bigint, numeric, numeric, text, text, date, boolean, boolean) to authenticated;
grant execute on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean) to authenticated;
grant execute on function public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean) to authenticated;

/*
  COMPROBADO en transaccion deshecha, el 8 de septiembre:

    el nucleo, sobre 19 pares:
      16 de 16 duplicados reconocidos
      3 de 3 pares distintos separados (disco 7 / disco 9 · gas / gasoil ·
      hidraulico 68 / hidraulico 46)

    las rejas:
      SAE 50 a 6,21 sobre 1.209.012,48 ... «son 194.648,07 veces menos»
                                           (antes: division por cero)
      primera entrada de CABILLAS 3/8 .... «El renglón 1 (CABILLAS 3/8): …
                                           Serán 5,00 UND a 12,0000 cada una»
                                           (antes: «El renglón 1s (CABILLAS 3/8s)»)
      gasoil con precio en CMB-INI ....... «En "COMBUSTIBLE INICIAL (SIN COSTO)"
                                           solo entra material que esta empresa
                                           no pagó»
      renombrar 274 a «Valvulina 140» .... «Ya existe "VALVULINA 140"…»
      corregirse el propio nombre ........ pasa, como debe

    los permisos: 0 de 8 siguen alcanzables por anon

  Al terminar: 19 movimientos, MOV-2026-0019, valor 868.927.307,04, 15
  articulos, el 272 sigue llamandose VALVULINA 140, y una sola firma de
  crear_articulo y de editar_articulo. Nada de produccion tocado.
*/
