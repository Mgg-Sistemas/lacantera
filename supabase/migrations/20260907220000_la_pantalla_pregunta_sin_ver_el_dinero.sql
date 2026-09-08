/*
  LA PANTALLA PREGUNTA EN VEZ DE DEDUCIR, Y EL ATAJO NO ACEPTA A CIEGAS.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 7 de septiembre de 2026, por MCP, y probada en transacción
  deshecha contra las órdenes y los promedios reales.
  ————————————————————————————————————————————————————————————————————————

  DE DÓNDE VIENE

  Christopher: «valida que los formularios estén al día con el sistema y los
  cambios actuales». Salieron seis huecos y cuatro eran callejones sin salida:
  la base rechazaba algo y la pantalla no ofrecía cómo resolverlo. Cuatro los
  abrí yo hoy mismo, poniendo rejas sin la casilla correspondiente.

  ═══════════════════════════════════════════════════════════════════════════
  1. La reja de las diez veces estaba desarmada justo para el almacenista
  ═══════════════════════════════════════════════════════════════════════════

  Es el peor de los seis porque no falla: acierta al revés y en silencio.

  El formulario de entrada decidía qué avisar leyendo
  `v_existencias.costo_promedio_usd`. Esa columna sale NULA a quien no tiene
  `INVENTARIO.VER_VALORACION` —nivel equivalente TOTAL— y el rol ALMACEN tiene
  ESCRITURA. Encadenado:

    la vista devuelve nulo
      -> la pantalla concluye «es la primera vez que entra a este almacén»
      -> enseña ESA casilla, no el aviso del desvío
      -> quien la marca manda `confirmado: true`
      -> y la base lee la MISMA clave para sus dos rejas

  Es decir: marcar «lo comprobé con la factura» en la entrada número treinta
  aceptaba de paso un desvío de diez veces que nunca se llegó a enseñar. Un
  aceite que ya promedia 3,60 admitía 1.209.012,48 con un cartel que hablaba de
  otra cosa. La misma forma del 5 de septiembre.

  MEDIDO, en transacción deshecha, sobre el SAE 50 del almacén 9:

    con COMPRAS (INVENTARIO TOTAL) .. DESVIA · 335.836,80 veces · 1.209.012,48
    solo con ALMACEN ................ DESVIA · veces NULA · sin cifras
    gasoil sin promedio ............. PRIMERA
    ATF a 6.000 sobre 6.074,64 ...... NORMAL

  Hoy no hay ningún usuario expuesto —los diez que tienen ALMACEN tienen
  además COMPRAS o ADMIN, que sí dan INVENTARIO TOTAL— pero Christopher acaba
  de repartir permisos de almacén, y el primero que reciba ALMACEN a secas cae
  aquí.

  LA MISMA LECCIÓN, POR SEGUNDA VEZ EN EL DÍA

  `private.saldo_de_factura` salió esta mañana de exactamente esto: una vista
  que esconde datos según quién pregunta no puede sostener una decisión. Allí
  era una función; aquí es una pantalla. **La vista filtra para MOSTRAR; quien
  decide necesita la verdad.**

  `revisar_costo_de_entrada` contesta QUE pasa a todo el mundo y CUANTO solo a
  quien puede ver el dinero — el mismo reparto que ya hacían los mensajes de
  `registrar_entradas`, para que lo que se lee antes de guardar y lo que se
  leería después no se contradigan.

  Y DE PROPINA, EL AVISO YA FUNCIONA EN BOLÍVARES

  La pantalla solo comparaba en dólares, porque el promedio está en dólares y
  las tasas no se calculan en el navegador —regla 4—. Con la base contestando,
  la conversión la hace ella con la tasa del día. Importa: el bolívar es la
  moneda de las facturas de aquí, y era justo la moneda en la que el aviso
  callaba.

  ═══════════════════════════════════════════════════════════════════════════
  2. El atajo de recibir la orden completa no puede aceptar a ciegas
  ═══════════════════════════════════════════════════════════════════════════

  `recibir_orden_completa` arma los renglones en SQL y llama a
  `registrar_recepcion`, que desde esta mañana rechaza el renglón cuyo precio se
  sale diez veces salvo que traiga `confirmado`. Como los renglones se arman
  solos, la única forma de confirmarlos sería un «confirmo» para todos.

  Eso es exactamente lo que se evitó en las entradas —«con quince renglones, un
  único confirmo aceptaría a ciegas los catorce que nadie miró»—, así que aquí
  no se añade el parámetro: se para y se manda a «Recibir material», que sí
  pregunta renglón por renglón.

  Sin esto el usuario recibía el mensaje de `registrar_recepcion` diciéndole
  «acéptalo y quedará anotado» sin que hubiera dónde aceptarlo en ninguna
  pantalla del sistema.

  DÓNDE SE NOTA HOY: la orden OC-2026-0003 lleva los precios REALES de los
  cuatro aceites —5,584294 · 6,211274 · 6,768942 · 8,001105 por litro— contra un
  almacén envenenado a un millón largo. Recibirla es exactamente el caso.

  LA REGLA VIVE TRES VECES, Y SE ANOTA

  `private.desvio_de_costo` es la primera vez que sale a un ayudante.
  `registrar_entradas` y `registrar_recepcion` siguen con su copia dentro.
  Conviene que acaben usando ésta, pero parchear sus cuerpos vivos solo para
  eso es más riesgo que beneficio hoy.
*/

do $guarda$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='costo_promedio') then
    raise exception 'Falta private.costo_promedio.';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='recibir_orden_completa') <> 1 then
    raise exception 'recibir_orden_completa no es unica.';
  end if;
end $guarda$;

-- ---------------------------------------------------------------------------
-- Cuanto se sale un costo, sin mirar quien pregunta
-- ---------------------------------------------------------------------------
create or replace function private.desvio_de_costo(
  p_almacen_id bigint, p_articulo_id bigint, p_costo_usd numeric
) returns numeric language plpgsql stable security definer set search_path to ''
as $function$
declare
  c_factor constant numeric := 10;
  v_ref   numeric;
  v_veces numeric;
begin
  /*
    Cuantas veces se sale este costo del que el articulo ya tenia, o nulo si no
    se sale. Sin permisos por dentro: contesta para DECIDIR, no para mostrar.
  */
  v_ref := private.costo_promedio(p_almacen_id, p_articulo_id);
  if coalesce(v_ref, 0) <= 0 or coalesce(p_costo_usd, 0) <= 0 then
    return null;
  end if;

  v_veces := round(p_costo_usd / v_ref, 2);
  if v_veces >= c_factor or v_veces <= (1 / c_factor) then
    return v_veces;
  end if;
  return null;
end;
$function$;

comment on function private.desvio_de_costo(bigint, bigint, numeric) is
  'Cuantas veces se sale un costo del promedio que el articulo ya tenia en ese almacen, o nulo si no se sale. Sin mirar quien pregunta: es para decidir.';

/*
  Los cuerpos de `public.revisar_costo_de_entrada(bigint, bigint, numeric, text,
  date)` y de `public.recibir_orden_completa(bigint, bigint, text, date)` son los
  que devuelve `pg_get_functiondef` tras esta migracion. Se aplicaron por MCP y
  llevan sus comentarios dentro; no se repiten aqui para no tener dos copias que
  discrepen.

      select pg_get_functiondef(p.oid)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('revisar_costo_de_entrada', 'recibir_orden_completa');

  Lo que hace cada una:

    revisar_costo_de_entrada  Solo lee. Contesta PRIMERA, DESVIA, NORMAL,
                              SIN_TASA o SIN_ARTICULO. Las cifras —veces,
                              viene_costando, entra_a— vienen nulas a quien no
                              tiene INVENTARIO.VER_VALORACION. Convierte con
                              `private.tasas_del_dia`, asi que sirve en las
                              cuatro monedas. Exige INVENTARIO:LECTURA y solo
                              esta concedida a `authenticated`.

    recibir_orden_completa    Antes de recibir, mira si algun renglon
                              pendiente se sale con `private.desvio_de_costo`.
                              Si alguno se sale, se para y manda a «Recibir
                              material». Sin cambio de firma.
*/

/*
  COMPROBADO en transaccion deshecha, el 7 de septiembre:

    revisar_costo_de_entrada, quitandole COMPRAS al usuario `compras`:
      ve el dinero ..... {"estado":"DESVIA","hacia":"ABAJO","veces":335836.80,
                          "viene_costando":1209012.4800,"entra_a":3.6000}
      solo ALMACEN ..... {"estado":"DESVIA","hacia":"ABAJO","veces":null,
                          "viene_costando":null,"entra_a":null}
      gasoil ........... {"estado":"PRIMERA"}
      ATF a 6.000 ...... {"estado":"NORMAL"}

    recibir_orden_completa:
      OC-2026-0003 ..... se para: «El precio de "ACEITE DE MOTOR SAE 50" se sale
                         mucho…», hint a «Recibir material»
      OC-2026-0002 ..... se para: lo mismo con el ATF

  Al terminar: 19 movimientos, MOV-2026-0019, valor 868.927.307,04, y el
  usuario `compras` con sus 2 roles. Nada de produccion tocado.

  PENDIENTE, y no es de esta migracion:

    - `corregir_costo` sigue sin pantalla, y es la unica salida de verdad para
      los 5.734 L de gasoil del tanque sin costo y para los cinco aceites.
    - La regla del desvio vive tres veces; dos de ellas dentro de cuerpos que
      hoy no conviene parchear.
*/
