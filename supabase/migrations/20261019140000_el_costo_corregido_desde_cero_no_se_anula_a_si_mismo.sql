/*
  CORREGIR UN COSTO QUE NUNCA SE DECLARÓ DEJABA EL PROMEDIO EN NULO.

  Christopher, 19/10/2026: cargó 30 víveres de Alimentación «sin cifra
  declarada» (por planilla) y después corrigió el costo de cada uno con la
  factura en mano, con `corregir_costo`. Los 30 quedaron con el costo
  correcto escrito en la bitácora y, aun así, "Servir una comida" reventaba
  con «Falta un dato obligatorio: costo_usd» — un error que no decía nada.

  POR QUÉ. `private.costo_promedio` descarta a propósito los renglones sin
  costo declarado (para que una donación sin factura no diluya lo que sí se
  sabe: «doce sillas a 10 y ocho sin cifra darían 6, que no es el costo de
  ninguna silla»). `corregir_costo` reversa TODA la existencia al costo
  promedio de hoy y la vuelve a meter al costo correcto — pero cuando ese
  promedio salió de CERO renglones con costo conocido (el caso de algo que
  nunca se valoró), el promedio es 0, y el par reversa/entra queda con
  cantidad neta CERO entre los renglones con costo declarado. Con cantidad
  cero, `costo_promedio` no puede calcular nada y devuelve nulo — como si la
  corrección nunca hubiera pasado.

  LA PRUEBA DE QUE EL DATO SÍ ESTABA: `corregir_costo` calcula su propio
  promedio SIN ese descarte (lo hereda sin querer: una fila sin costo nunca
  suma nada a `sum(valor_usd*signo)`, se filtre o no), así que ya sabe que
  CARNE MOLIDA cuesta 9,08 — y por eso se niega a corregirlo de nuevo: «ya
  viene costando 9,0800: no hay nada que corregir». El hueco está solo en
  `costo_promedio`, la función que de verdad se usa en pantalla.

  EL ARREGLO, PARA LO QUE PASE DE HOY EN ADELANTE: si no había ningún
  renglón con costo conocido antes de corregir, la reversa se escribe SIN
  costo (un hueco, no un cero) en vez de al promedio calculado. Así dentro de
  `costo_promedio` ni el original ni su reversa cuentan, y solo cuenta el
  renglón nuevo, con el costo correcto y la cantidad entera. El caso de
  siempre —corregir un costo que ya era conocido y estaba mal— no cambia ni
  una coma: ahí sigue reversando al promedio de siempre.

  LOS 30 YA CORREGIDOS NO SE ARREGLAN SOLOS: la bitácora no se edita, así
  que el bloque de abajo les escribe un segundo par —uno que no mueve la
  existencia ni un gramo y deja la cuenta leyendo lo que ya estaba escrito—
  para los que quedaron en este estado exacto. No es una lista a mano: busca
  por la misma condición con la que se diagnosticó, así que corrige a
  cualquiera que esté así, no solo a los 30 de hoy.

  Y "SERVIR UNA COMIDA" DEJA DE REVENTAR EN SECO: si el costo de un víver
  sigue sin conocerse (el caso de algo que nunca se corrigió), ahora avisa
  con una frase de negocio en vez de la violación de NOT NULL de siempre.
*/

do $$
declare
  v_def  text;
  v_ancla text;
begin
  -- -------------------------------------------------------------- corregir_costo
  select pg_get_functiondef('public.corregir_costo(bigint,bigint,numeric,text,date,character,date)'::regprocedure)
    into v_def;

  v_ancla := '  v_nota text; v_salida bigint;';
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'corregir_costo: el ancla 1 no aparece exactamente una vez.';
  end if;
  v_def := replace(v_def, v_ancla, '  v_nota text; v_salida bigint; v_ex_conocida numeric;');

  v_ancla := '  select coalesce(sum(valor_usd * signo), 0) into v_val
    from public.inventario_movimientos
   where almacen_id = p_almacen_id and articulo_id = p_articulo_id;
  v_prom := v_val / v_ex;

  if round(v_prom, 6) = v_costo_usd then';
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'corregir_costo: el ancla 2 no aparece exactamente una vez.';
  end if;
  v_def := replace(v_def, v_ancla, '  select coalesce(sum(valor_usd * signo), 0) into v_val
    from public.inventario_movimientos
   where almacen_id = p_almacen_id and articulo_id = p_articulo_id;
  v_prom := v_val / v_ex;

  /*
    SI NO HABÍA NINGÚN COSTO CONOCIDO ANTES, EL PROMEDIO QUE SE REVERSA ES UN
    HUECO, NO UN CERO. Ver el comentario de cabecera de esta migración.
  */
  select coalesce(sum(cantidad * signo), 0) into v_ex_conocida
    from public.inventario_movimientos
   where almacen_id = p_almacen_id and articulo_id = p_articulo_id
     and costo_usd is not null;

  if round(v_prom, 6) = v_costo_usd then');

  v_ancla := '  v_salida := private.registrar_movimiento(
    ''AJUSTE_COSTO'', -1, p_almacen_id, p_articulo_id, v_ex, v_prom,
    v_nota, null, null, null, p_fecha);';
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'corregir_costo: el ancla 3 no aparece exactamente una vez.';
  end if;
  v_def := replace(v_def, v_ancla, '  v_salida := private.registrar_movimiento(
    ''AJUSTE_COSTO'', -1, p_almacen_id, p_articulo_id, v_ex,
    case when v_ex_conocida > 0 then v_prom else null end,
    v_nota, null, null, null, p_fecha);');

  execute v_def;

  -- -------------------------------------------------------------- servir_comida
  select pg_get_functiondef('public.servir_comida(text,integer,bigint,jsonb,date,text,text)'::regprocedure)
    into v_def;

  v_ancla := '    v_costo := private.costo_promedio(p_almacen_id, v_r.articulo_id);

    v_mov := private.registrar_movimiento(';
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'servir_comida: el ancla no aparece exactamente una vez.';
  end if;
  v_def := replace(v_def, v_ancla, '    v_costo := private.costo_promedio(p_almacen_id, v_r.articulo_id);
    if v_costo is null then
      raise exception ''En "%" no se conoce el costo de "%" todavía: corríjalo en Inventario antes de servir la comida.'',
        v_alm.nombre, v_art.nombre using errcode = ''22023'';
    end if;

    v_mov := private.registrar_movimiento(');

  execute v_def;
end $$;

/*
  LO QUE YA QUEDÓ ASÍ ANTES DE ESTE ARREGLO.

  Un par que no mueve existencia —sale sin costo y vuelve a entrar al costo
  0, el mismo truco que haría el arreglo de arriba si hoy mismo se repitiera
  la corrección— para que `costo_promedio` deje de contar la reversa vieja
  (la que se escribió al 0 calculado) y lea el costo que ya estaba
  corregido. No hay lista a mano: la condición es la misma con la que se
  encontró el problema, así que corrige a cualquiera que esté así.
*/
do $$
declare
  v_fila record;
  v_ex numeric;
  v_costo_correcto numeric;
  v_unidad text;
  v_r1 bigint;
  v_nota text;
  v_corregidos int := 0;
begin
  for v_fila in
    select m.almacen_id, m.articulo_id, al.nombre as almacen, a.nombre as articulo
      from public.inventario_movimientos m
      join public.almacenes al on al.id = m.almacen_id
      join public.articulos a on a.id = m.articulo_id
     group by m.almacen_id, m.articulo_id, al.nombre, a.nombre
    having sum(m.cantidad * m.signo) > 0
       and private.costo_promedio(m.almacen_id, m.articulo_id) is null
       and count(*) filter (where m.tipo = 'AJUSTE_COSTO') > 0
  loop
    v_ex := private.existencia(v_fila.almacen_id, v_fila.articulo_id);

    select m.costo_usd, a.unidad into v_costo_correcto, v_unidad
      from public.inventario_movimientos m
      join public.articulos a on a.id = v_fila.articulo_id
     where m.almacen_id = v_fila.almacen_id and m.articulo_id = v_fila.articulo_id
       and m.tipo = 'AJUSTE_COSTO' and m.signo = 1
     order by m.registrado_en desc
     limit 1;

    if v_costo_correcto is null then
      raise exception 'No se encontró el costo ya corregido de % en %.', v_fila.articulo, v_fila.almacen;
    end if;

    v_nota := format(
      'Corrección del cálculo de costo_promedio: "%s" ya tenía su costo corregido en la bitácora, a %s por %s, pero quedaba sin verse porque la reversa de aquella corrección y la corrección misma se anulaban entre sí en cantidad. Este par no mueve existencia ni repite el costo: solo hace que vuelva a contarse lo que ya estaba escrito.',
      v_fila.articulo, private.numero_es(v_costo_correcto, 4), v_unidad);

    v_r1 := private.registrar_movimiento(
      'AJUSTE_COSTO', -1, v_fila.almacen_id, v_fila.articulo_id, v_ex, null,
      v_nota, null, null, null, current_date);

    perform private.registrar_movimiento(
      'AJUSTE_COSTO', 1, v_fila.almacen_id, v_fila.articulo_id, v_ex, 0,
      v_nota, null, null, v_r1, current_date);

    if private.existencia(v_fila.almacen_id, v_fila.articulo_id) <> v_ex then
      raise exception 'La existencia de % en % cambió corrigiendo el cálculo: % -> %',
        v_fila.articulo, v_fila.almacen, v_ex, private.existencia(v_fila.almacen_id, v_fila.articulo_id);
    end if;

    if round(private.costo_promedio(v_fila.almacen_id, v_fila.articulo_id), 6) <> round(v_costo_correcto, 6) then
      raise exception 'El costo de % en % quedó en % y debía quedar en %',
        v_fila.articulo, v_fila.almacen,
        private.costo_promedio(v_fila.almacen_id, v_fila.articulo_id), v_costo_correcto;
    end if;

    v_corregidos := v_corregidos + 1;
  end loop;

  raise notice 'Víveres corregidos: %', v_corregidos;
end $$;
