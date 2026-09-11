/*
  UN DESCUENTO NO PUEDE DEJAR AL TRABAJADOR DEBIENDO DINERO.

  Sale de revisar el motor de nómina el 11/09/2026, a raíz del reclamo de los
  267,17 $ y de que la empresa está por empezar a cargar penalizaciones —dotación
  perdida, negligencia, incidencias— sobre los recibos.

  Se comprobó en caliente, con la transacción rodada hacia atrás, cargándole a una
  trabajadora dos descuentos de 200 $ sobre un sueldo de 250:

      asignaciones: 270,00 $
      deducciones : 402,83 $
      NETO        : -132,83 $      ← el recibo salió, y sin avisar
      tope del tercio: 83,33 $

  Tres fallos encadenados, y los tres llegan por la puerta de la aplicación:
  `guardar_novedad_monto` solo mira el estado del período y la fecha de pago, no
  toca el monto.

  ═══════════════════════════════════════════════════════════════════════════
  1. LA REJA DEL TERCIO SOLO MIRABA DOS CONCEPTOS
  ═══════════════════════════════════════════════════════════════════════════

  Decía literalmente:

      if v_m.concepto in ('DED-PRE', 'DED-ANT') and v_monto > v_tope_prestamo

  `DED-HERR` (herramienta perdida o dañada) y `DED-OTRA` pasaban de largo — y son
  exactamente los dos que van a llevar las penalizaciones. Lo irónico es que la
  base legal de `DED-HERR` en el catálogo ya lo dice: «LOTTT art. 154: los
  descuentos al salario requieren autorización del trabajador». Estaba escrito y
  no estaba aplicado.

  La lista blanca se retira entera. El artículo 154 no habla de conceptos: habla
  de lo que se le descuenta a alguien en un período. Las retenciones legales
  —IVSS, RPE, FAOV— no entran en el tope porque no son descuentos sino
  retenciones de ley, y por eso el tope se mide solo sobre lo que se carga por
  novedad, que es justo el bucle donde vive esta reja.

  ═══════════════════════════════════════════════════════════════════════════
  2. EL TOPE SE MEDÍA LÍNEA POR LÍNEA, NO SOBRE LA SUMA
  ═══════════════════════════════════════════════════════════════════════════

  Cada deducción se comparaba contra el tercio por separado, así que dos de un
  tercio cada una pasaban las dos y se llevaban dos tercios del sueldo. El límite
  es de lo que se descuenta en el período, no de lo que se descuenta por concepto.

  Ahora se acumula. El mensaje nombra la que rompe el techo y dice cuánto suma
  todo, porque «este descuento es muy grande» cuando el grande es el anterior
  manda a mirar donde no es.

  ═══════════════════════════════════════════════════════════════════════════
  3. NADA IMPEDÍA QUE EL NETO SALIERA NEGATIVO
  ═══════════════════════════════════════════════════════════════════════════

  `nomina_recibos.neto` es una columna generada, `total_asignaciones -
  total_deducciones`, sin suelo. Y en las tres tablas de nómina todas las
  restricciones son `>= 0` sobre cada campo por separado: ninguna mira el
  conjunto.

  Con el tope arreglado esto ya no debería poder pasar —las deducciones por
  novedad quedan en un tercio y las legales rondan el 1 %—, así que esta reja es
  la de atrás. Se pone igual porque es la que enuncia la regla que de verdad
  importa: un recibo no deja a nadie debiendo. Si algún día se toca el parámetro
  del tercio o entra una deducción por otra vía, esta sigue en pie.

  Se prefiere fallar a truncar en cero. Truncar perdonaría el exceso en silencio y
  el saldo se evaporaría; fallar obliga a que una persona mire qué se cargó mal.

  ═══════════════════════════════════════════════════════════════════════════
  LO QUE NO SE TOCA, Y POR QUÉ
  ═══════════════════════════════════════════════════════════════════════════

  En la revisión anoté también que se podían marcar 30 faltas en una quincena de
  15 días. ERA FALSO, y conviene que quede escrito para que nadie lo «arregle»
  después: esa prueba escribió directo en `nomina_novedades`, que es una vía que
  no existe —`authenticated` no tiene INSERT en ninguna tabla—. La puerta real es
  `marcar_falta`, y está bien hecha: una falta por fecha, con la fecha obligada a
  caer dentro del período y dentro del tiempo que la persona estuvo empleada. Por
  ahí no caben más faltas que días.

  Queda un caso menor y legítimo: quien entra a mitad de período tiene los días
  prorrateados, y si falta todos, su neto da cero y `calcular_nomina` lo salta sin
  emitir recibo. No cobra nada porque no trabajó nada, que es correcto; lo
  mejorable es que desaparece sin dejar línea. Se deja anotado, no se cambia aquí:
  cambiarlo obliga a decidir si un recibo en cero debe existir, y eso es una
  decisión de RRHH, no de este arreglo.
*/

do $mig$
declare
  v_def   text;
  v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'calcular_nomina';

  if v_def is null then
    raise exception 'No existe public.calcular_nomina.' using errcode = '22023';
  end if;

  -- ---------------------------------------------------------------- 1 de 4
  -- La variable que acumula. Se declara junto al tope, que es de lo que habla.
  v_antes := v_def;
  v_def := replace(v_def,
    $t$  v_tope_prestamo   numeric;$t$,
    $t$  v_tope_prestamo   numeric;
  v_descontado      numeric;$t$);

  if v_def = v_antes then
    raise exception 'ANCLA 1 (declaración de v_tope_prestamo) no encontrada.'
      using errcode = '22023';
  end if;

  -- ---------------------------------------------------------------- 2 de 4
  -- El acumulador arranca en cero para cada trabajador, y de paso se va el
  -- `+ 0`, que era un resto de una edición anterior.
  v_antes := v_def;
  v_def := replace(v_def,
    $t$    v_tope_prestamo := round(
      (v_normal + 0) * private.parametro('descuento_prestamo_max', v_p.hasta) / 100, 2);$t$,
    $t$    v_tope_prestamo := round(
      v_normal * private.parametro('descuento_prestamo_max', v_p.hasta) / 100, 2);
    v_descontado := 0;$t$);

  if v_def = v_antes then
    raise exception 'ANCLA 2 (cálculo del tope) no encontrada.' using errcode = '22023';
  end if;

  -- ---------------------------------------------------------------- 3 de 4
  -- La reja: sin lista blanca y sobre la suma.
  v_antes := v_def;
  v_def := replace(v_def,
    $t$      if v_m.concepto in ('DED-PRE', 'DED-ANT') and v_monto > v_tope_prestamo then
        raise exception 'A % no se le pueden descontar % por "%": el tope del período es % (un tercio de lo que gana, LOTTT 154).',
          v_emp.nombres || ' ' || v_emp.apellidos, private.numero_es(v_monto, 2), v_m.nombre, private.numero_es(v_tope_prestamo, 2)
          using errcode = '22023';
      end if;$t$,
    $t$      /*
        EL TOPE ES DE TODO LO QUE SE DESCUENTA, NO DE CADA COSA POR SEPARADO.

        Antes la reja miraba solo DED-PRE y DED-ANT, y comparaba cada linea
        contra el tercio por su cuenta: dos descuentos de un tercio pasaban los
        dos. El articulo 154 limita lo que se le descuenta a alguien en el
        periodo, no lo que se le descuenta por concepto.

        Las retenciones legales no pasan por aqui y no deben: IVSS, RPE y FAOV
        son retenciones de ley, no descuentos, y se insertan fuera de este bucle.
      */
      v_descontado := v_descontado + v_monto;

      if v_descontado > v_tope_prestamo then
        raise exception 'A % no se le puede descontar tanto en este periodo: entre todos los descuentos suman %, y el tope es % (un tercio de lo que gana, LOTTT 154). El que se pasa es "%".',
          v_emp.nombres || ' ' || v_emp.apellidos,
          private.numero_es(v_descontado, 2), private.numero_es(v_tope_prestamo, 2), v_m.nombre
          using errcode = '22023',
                hint = 'Reparte lo que falte en los periodos siguientes, o baja el monto de este.';
      end if;$t$);

  if v_def = v_antes then
    raise exception 'ANCLA 3 (reja del tercio) no encontrada.' using errcode = '22023';
  end if;

  -- ---------------------------------------------------------------- 4 de 4
  -- La reja de atrás, justo antes de escribir los totales en el recibo.
  v_antes := v_def;
  v_def := replace(v_def,
    $t$    update public.nomina_recibos set
      salario_normal_diario   = round(v_normal_diario, 6),$t$,
    $t$    /*
        UN RECIBO NO DEJA A NADIE DEBIENDO DINERO.

        Con el tope de arriba bien puesto esto ya no deberia poder ocurrir. Se
        deja porque es la regla que de verdad importa, y sigue en pie si manana
        se toca el parametro del tercio o entra una deduccion por otra via.

        Falla en vez de truncar en cero: truncar perdonaria el exceso en silencio
        y el saldo se evaporaria. Fallar obliga a que alguien mire que se cargo
        mal.
      */
    if v_asignaciones - v_deducciones < 0 then
      raise exception 'El recibo de % saldria en negativo: gana % y se le descuentan %. Un recibo no puede dejar al trabajador debiendo dinero.',
        v_emp.nombres || ' ' || v_emp.apellidos,
        private.numero_es(v_asignaciones, 2), private.numero_es(v_deducciones, 2)
        using errcode = '22023',
              hint = 'Revisa las deducciones cargadas a esa persona en este periodo.';
    end if;

    update public.nomina_recibos set
      salario_normal_diario   = round(v_normal_diario, 6),$t$);

  if v_def = v_antes then
    raise exception 'ANCLA 4 (totales del recibo) no encontrada.' using errcode = '22023';
  end if;

  execute v_def;
end
$mig$;

/*
  Y se comprueba que lo aplicado es lo que se quería, leyendo el cuerpo vivo —no
  el archivo—, que es la regla 7 de este repositorio.
*/
do $ver$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'calcular_nomina';

  if position($t$v_descontado := v_descontado + v_monto;$t$ in v_def) = 0 then
    raise exception 'El acumulador no quedó en el cuerpo vivo.' using errcode = '22023';
  end if;

  if position($t$'DED-PRE', 'DED-ANT'$t$ in v_def) > 0 then
    raise exception 'La lista blanca de conceptos sigue viva.' using errcode = '22023';
  end if;

  if position($t$if v_asignaciones - v_deducciones < 0 then$t$ in v_def) = 0 then
    raise exception 'La reja del neto negativo no quedó en el cuerpo vivo.' using errcode = '22023';
  end if;
end
$ver$;

comment on function public.calcular_nomina(bigint) is
  'Arma los recibos de un período. El tope del tercio (LOTTT 154) se mide sobre la SUMA de lo que se descuenta por novedad, no concepto por concepto, y ya no tiene lista blanca: antes solo miraba la cuota de préstamo y el anticipo, y dejaba pasar el descuento por herramienta y el de otra deducción, que son los que llevan las penalizaciones. Y ningún recibo puede salir con el neto en negativo.';
