/*
  LA NÓMINA ARRANCA DE CERO: SE VA NOM-2026-0008 Y EL CONTADOR VUELVE A 1.

  Christopher, 11/09/2026: «elimina ese período por favor, voy a anularlo, y así
  intentar de nuevo; por lo mismo evalúa si puedes reiniciar el contador que está
  en 008».

  Es el último resto de la tarde en que se descubrió que el sueldo de la ficha no
  significaba lo que la empresa creía. NOM-2026-0008 fue la primera que salió con
  el motor nuevo y sirvió para comprobar que los 27 recibos caían exactos en 450,
  250, 175 y 150. Ya cumplió: lo que enseñó está en las migraciones de hoy y en
  el documento del caso.

  ═══════════════════════════════════════════════════════════════════════════
  SE BORRA ESTANDO CALCULADA, Y ESO ES DELIBERADO
  ═══════════════════════════════════════════════════════════════════════════

  La migración anterior —la de los cinco períodos de prueba— exigía que
  estuvieran ANULADA antes de borrarlos. Aquí no, y conviene decir por qué para
  que nadie lea esto como que aquella reja sobraba.

  Aquella reja protegía de borrar por lote algo que alguien estuviera usando. Ésta
  borra UN período nombrado, por instrucción directa, y anularlo primero solo
  habría añadido un motivo de anulación que nadie iba a leer, sobre una fila que
  desaparece en la línea siguiente.

  LO QUE SÍ SE COMPRUEBA es lo único que de verdad prohíbe borrar: que no se haya
  pagado. Un período pagado tiene movimiento de tesorería, y esa clave foránea es
  NO ACTION —no cascada—, así que habría frenado el borrado por su cuenta. La
  reja lo dice con nombre en vez de dejar saltar un 23503 pelado. Cero pagos, y
  el estado no era PAGADA.

  ═══════════════════════════════════════════════════════════════════════════
  EL CONTADOR SÍ SE PUEDE REINICIAR, Y HOY ES EL ÚNICO DÍA QUE SE PUEDE
  ═══════════════════════════════════════════════════════════════════════════

  Hace dos migraciones se dejó adrede en 8, porque NOM-2026-0008 seguía viva y
  bajarlo habría hecho que dentro de siete nóminas se repitiera un número que ya
  existía. Ahora la tabla queda vacía, no hay ningún número con el que chocar, y
  la primera nómina de verdad debe llamarse NOM-2026-0001 y no NOM-2026-0009.

  Por eso la reja del medio: si quedara cualquier otro período, el contador NO se
  toca. Es la condición de la que depende que esto sea seguro, y se comprueba en
  vez de suponerse.

  `private.siguiente_numero` hace `ultimo + 1` sobre `public.correlativos`, así
  que dejarlo en 0 hace que la próxima salga 0001.

  ═══════════════════════════════════════════════════════════════════════════
  LO QUE NO SE TOCA
  ═══════════════════════════════════════════════════════════════════════════

  Las 25 fichas de personal, el tabulador y los parámetros se quedan enteros.
  Esto vacía el historial de períodos, no la nómina: al abrir la siguiente, el
  motor vuelve a calcular con la misma gente y los mismos sueldos.
*/

do $mig$
declare
  v_id       bigint;
  v_estado   text;
  v_recibos  int;
  v_pagos    int;
  v_otros    int;
begin
  select id, estado into v_id, v_estado
    from public.nomina_periodos where numero = 'NOM-2026-0008';

  if v_id is null then
    raise exception 'NOM-2026-0008 ya no existe.' using errcode = 'P0002';
  end if;

  /* Lo unico que de verdad prohibe borrar: que se haya pagado. */
  select count(*) into v_pagos
    from public.tesoreria_movimientos where nomina_periodo_id = v_id;
  if v_pagos > 0 then
    raise exception 'NOM-2026-0008 tiene % movimiento(s) de tesoreria: se pago y no se borra.', v_pagos
      using errcode = '22023';
  end if;

  if v_estado = 'PAGADA' then
    raise exception 'NOM-2026-0008 esta PAGADA. No se borra.' using errcode = '22023';
  end if;

  /* Y que no quede ningun otro periodo, porque si no el contador no se puede
     reiniciar sin repetir un numero vivo. */
  select count(*) into v_otros from public.nomina_periodos where id <> v_id;
  if v_otros > 0 then
    raise exception 'Quedan % periodos mas. El contador no se reinicia con numeros vivos.', v_otros
      using errcode = '22023';
  end if;

  select count(*) into v_recibos from public.nomina_recibos where periodo_id = v_id;

  delete from public.nomina_periodos where id = v_id;

  update public.correlativos set ultimo = 0 where prefijo = 'NOM' and anio = 2026;

  raise notice 'Se fue NOM-2026-0008 (estado %) con % recibos. Contador a cero.',
    v_estado, v_recibos;
end
$mig$;

/*
  Comprobado contra la base, no contra este archivo.

      periodos 0 · recibos 0 · lineas 0 · novedades 0 · montos 0 · faltas 0
      contador 0 · empleados activos 25
*/
do $ver$
declare v_periodos int; v_recibos int; v_contador int;
begin
  select count(*) into v_periodos from public.nomina_periodos;
  select count(*) into v_recibos  from public.nomina_recibos;
  select ultimo into v_contador from public.correlativos where prefijo='NOM' and anio=2026;

  if v_periodos <> 0 then
    raise exception 'Quedaron % periodos.', v_periodos using errcode = '22023';
  end if;
  if v_recibos <> 0 then
    raise exception 'Quedaron % recibos huerfanos.', v_recibos using errcode = '22023';
  end if;
  if v_contador <> 0 then
    raise exception 'El contador quedo en % y se esperaba 0.', v_contador using errcode = '22023';
  end if;
end
$ver$;
