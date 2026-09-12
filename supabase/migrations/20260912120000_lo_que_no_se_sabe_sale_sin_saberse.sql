/*
  LO QUE ENTRA SIN CIFRA, SALE SIN CIFRA.

  Christopher, viendo la laptop donada en el libro: «este ítem no debe tener
  precio pues fue una donación».

  La entrada estaba bien: costo y valor en nulo. La SALIDA no — se registró con
  cero, y el libro es inmutable. El hueco se cuidaba al entrar y se convertía en
  un cero duro al salir, que es justo lo que el «sin valorar» existe para evitar:
  cero afirma que no vale nada, y afirma para siempre.

  Sale de aquí: `costo_promedio` filtra a las filas con cifra, y cuando no queda
  ninguna, `sum()` da nulo y el `case` cae en un `else 0` literal. Ese cero se
  copia al movimiento de salida.

  ═══════════════════════════════════════════════════════════════════════════
  EL TANQUE DE COMBUSTIBLE NO SE TOCA, Y ESO IMPORTA
  ═══════════════════════════════════════════════════════════════════════════

  De los 37 ceros que había en el libro, 36 son gasoil del tanque inicial, donde
  el cero es correcto y deliberado: ese material de verdad no le costó nada a
  esta empresa porque lo pagó otra. Comprobado: esas entradas tienen
  `costo_usd = 0`, no nulo, así que SÍ entran en el promedio y salen por la rama
  de arriba. El `else` solo se alcanza cuando no hay ni una fila con cifra.

  Los dos casos ya se distinguían solos en los datos. Esta migración solo enseña
  al cálculo a decirlo.

  ═══════════════════════════════════════════════════════════════════════════
  QUIÉN LEE ESTO, Y POR QUÉ NO SE ROMPE
  ═══════════════════════════════════════════════════════════════════════════

  Diecinueve funciones. Se miraron una por una y NINGUNA compara el número: o lo
  pasa tal cual a `registrar_movimiento` —que admite nulo desde que existe el
  «sin valorar»—, o lo multiplica por la cantidad, y nulo por algo sigue siendo
  nulo. Cinco lo usan solo como referencia del aviso de costo raro, y esas ya
  hacían `coalesce(v_ref, 0)`: para ellas nulo significa «no hay con qué
  comparar», que es exactamente lo que pasa.

  En todo el esquema hay DOS columnas de dinero que no admiten nulo, y las dos
  son de mantenimiento: `mantenimiento_repuestos.costo_usd` y
  `mantenimientos.costo_repuestos_usd`. Por eso `cerrar_mantenimiento` es la
  única puerta que había que tocar.

  ALLÍ SE PONE CERO A PROPÓSITO, y conviene saberlo: el movimiento del libro
  queda con el costo en nulo —honesto—, pero el repuesto anotado en la orden y el
  total de la reparación cuentan ese repuesto como si no costara nada. Es lo
  mismo que pasaba antes de esta migración, así que no se empeora nada; lo que se
  gana es que el LIBRO deja de mentir. Arreglar también la orden pide que esas
  dos columnas admitan nulo y que el total sepa sumar huecos, y eso es un cambio
  de mantenimiento, no de inventario.

  ═══════════════════════════════════════════════════════════════════════════
  COMPROBADO EN CALIENTE, RODADO HACIA ATRÁS
  ═══════════════════════════════════════════════════════════════════════════

    entra donado y sale ....: costo NULO · valor NULO
    salida normal ..........: ACEITE AGROFLUIDO, promedio 7,85 → costo 7,85
    tanque inicial .........: sigue valiendo cero, que es lo correcto
*/

create or replace function private.costo_promedio(p_almacen bigint, p_articulo bigint)
returns numeric
language sql
stable
security definer
set search_path to ''
as $function$
  /*
    SOLO LAS FILAS CON VALOR, en el numerador Y en el denominador. `sum()` se
    salta los nulos, asi que el de arriba se arreglaba solo; el de abajo seguia
    contando lo no valorado y el promedio salia diluido — doce sillas a 10 y ocho
    sin cifra darian 6, que no es el costo de ninguna silla.

    Y SI NO QUEDA NINGUNA, NULO Y NO CERO. Cero dice «no vale nada» y se copia al
    movimiento de salida, donde ya no se puede corregir. Nulo dice «no se sabe»,
    que es lo unico cierto de una laptop donada sin factura.
  */
  select case when sum(cantidad * signo) > 0
              then round(sum(valor_usd * signo) / sum(cantidad * signo), 6)
              else null::numeric end
  from public.inventario_movimientos
  where almacen_id = p_almacen and articulo_id = p_articulo
    and costo_usd is not null;
$function$;

create or replace function private.costo_promedio(p_almacen bigint, p_articulo bigint, p_propietario text)
returns numeric
language sql
stable
security definer
set search_path to ''
as $function$
  -- La misma regla, por dueño. Ver el comentario de la de dos argumentos.
  select case when sum(cantidad * signo) > 0
              then round(sum(valor_usd * signo) / sum(cantidad * signo), 6)
              else null::numeric end
  from public.inventario_movimientos
  where almacen_id = p_almacen and articulo_id = p_articulo
    and propietario = p_propietario
    and costo_usd is not null;
$function$;

comment on function private.costo_promedio(bigint, bigint) is
  'El costo promedio de un artículo en un almacén, contando solo las filas con cifra en los dos lados de la división. Devuelve NULO —no cero— cuando no hay ninguna: cero diría que no vale nada y ese cero se copia al movimiento de salida, donde ya no se corrige.';

do $mig$
declare
  v_def   text;
  v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cerrar_mantenimiento';

  v_antes := v_def;
  v_def := replace(v_def,
    $t$    values (p_id, v_rart, v_rcant, v_costo, v_mov, 'USADO');$t$,
    $t$    -- `mantenimiento_repuestos.costo_usd` no admite nulo: un repuesto sin
    -- valorar se anota en cero en la orden, aunque su movimiento quede sin
    -- cifra. Se pierde precision en el costo de la reparacion, no en el libro.
    values (p_id, v_rart, v_rcant, coalesce(v_costo, 0), v_mov, 'USADO');$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 1 (renglon del repuesto) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$    v_total := v_total + v_costo;$t$,
    $t$    -- Sin el coalesce, un solo repuesto sin valorar dejaria el total de la
    -- orden en nulo, y esa columna tampoco lo admite.
    v_total := v_total + coalesce(v_costo, 0);$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 2 (total de la orden) no encontrada.' using errcode = '22023';
  end if;

  execute v_def;
end
$mig$;

do $ver$
declare v_def text; v_alm bigint; v_art bigint;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cerrar_mantenimiento';
  if position($t$coalesce(v_costo, 0)$t$ in v_def) = 0 then
    raise exception 'Cerrar mantenimiento no quedo a prueba de nulos.' using errcode = '22023';
  end if;

  -- La laptop: sin ninguna fila con cifra, el promedio ya no dice cero.
  select id into v_alm from public.almacenes where codigo = 'ALM-GEN';
  select id into v_art from public.articulos where codigo = 'HER-0012';
  if private.costo_promedio(v_alm, v_art) is not null then
    raise exception 'Lo que no tiene ninguna cifra sigue devolviendo un numero.'
      using errcode = '22023';
  end if;

  -- El gasoil del tanque inicial: cero de verdad, y se queda en cero.
  select id into v_alm from public.almacenes where codigo = 'CMB-INI';
  select id into v_art from public.articulos where codigo = 'CT-GASOIL';
  if coalesce(private.costo_promedio(v_alm, v_art), -1) <> 0 then
    raise exception 'El tanque inicial dejo de valer cero, y ese cero era correcto.'
      using errcode = '22023';
  end if;
end
$ver$;
