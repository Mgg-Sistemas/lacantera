/*
  LA ENTRADA ADMITE NO SABER CUÁNTO VALE.

  La otra mitad del valor opcional: la columna ya admite el hueco, y aquí se abre
  la puerta por la que entra material.

  ═══════════════════════════════════════════════════════════════════════════
  TRES CASOS Y NO DOS, Y HAY QUE MANTENERLOS APARTE
  ═══════════════════════════════════════════════════════════════════════════

    · COSTÓ X ............ el caso normal. Se declara y se comprueba contra el
                           promedio, como siempre.
    · COSTÓ CERO ......... `p_sin_costo`: no le costó nada a ESTA empresa porque
                           lo pagó otra. Es un hecho comprobable, y por eso vive
                           apartado en un almacén con `admite_sin_costo` — para
                           que ese cero no hunda el promedio de lo que sí costó.
    · NO SE SABE ......... el nuevo. `p_sin_valor`: no hay cifra. No es cero, y
                           por eso NO va al almacén de los ceros ni contamina
                           ningún promedio: las filas sin valor quedan fuera de
                           la cuenta, en los dos lados de la división.

  Los tres son excluyentes. Marcar los dos a la vez se rechaza, y se rechaza lo
  primero de todo: «no costó nada» y «no se sabe cuánto costó» no pueden ser
  ciertas a la vez, y seguir adelante escogería una de las dos por quien la mandó.

  ═══════════════════════════════════════════════════════════════════════════
  SE EXPLICA IGUAL, PERO NO SE PIDE LO IMPOSIBLE
  ═══════════════════════════════════════════════════════════════════════════

  `p_sin_costo` exige una explicación larga porque hay que decir quién asumió el
  gasto. Aquí no: la explicación de por qué no hay cifra suele ser «llegó así», y
  obligar a escribir cuarenta caracteres en cada uno de trescientos renglones
  convierte el campo en «asdasd» — que es peor que el hueco, porque parece un
  dato.

  Se mantiene el motivo normal de cualquier entrada —de dónde vino— y se anota en
  la nota que el valor quedó pendiente, que es lo que hay que poder buscar
  después.

  Y LA REJA DEL COSTO RARO NO APLICA: no hay costo que comparar contra el
  promedio. Dejarla puesta habría hecho saltar el aviso en cada renglón.
*/
do $entrada$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'registrar_entrada';

  if position('p_sin_valor' in v_def) > 0 then
    raise notice 'la entrada ya admitia no saber cuanto vale.';
    return;
  end if;

  v_def := replace(v_def,
    'p_confirmado boolean DEFAULT false)',
    'p_confirmado boolean DEFAULT false, p_sin_valor boolean DEFAULT false)');

  v_def := replace(v_def,
    '  select a.admite_sin_costo into v_admite from public.almacenes a where a.id = p_almacen_id;',
'  if p_sin_costo and p_sin_valor then
    raise exception ''«No costo nada» y «no se sabe cuanto vale» no pueden ser las dos ciertas.''
      using errcode = ''22023'',
            hint = ''Lo primero es un cero comprobable —lo pago otra empresa—; lo segundo es que no hay cifra. Elige una.'';
  end if;

  select a.admite_sin_costo into v_admite from public.almacenes a where a.id = p_almacen_id;');

  v_def := replace(v_def,
    '  elsif coalesce(p_costo_usd, 0) <= 0 then',
    '  elsif p_sin_valor then
    -- No se declara valor. No es cero: el hueco se guarda como hueco y queda
    -- fuera del promedio, en los dos lados de la division.
    null;
  elsif coalesce(p_costo_usd, 0) <= 0 then');

  v_def := replace(v_def,
    '  if not p_sin_costo and coalesce(p_costo_usd, 0) > 0 then',
    '  if not p_sin_costo and not p_sin_valor and coalesce(p_costo_usd, 0) > 0 then');

  v_def := replace(v_def,
    '  if p_sin_costo then
    v_nota := v_nota || '' · Sin costo para esta empresa: el gasto lo asumió otra.'';',
    '  if p_sin_valor then
    v_nota := v_nota || '' · Sin valor declarado: entró sin cifra y queda pendiente de valorar.'';
  end if;

  if p_sin_costo then
    v_nota := v_nota || '' · Sin costo para esta empresa: el gasto lo asumió otra.'';');

  v_def := replace(v_def,
    '    coalesce(p_costo_usd, 0), v_nota, null, null, null, p_fecha,',
    '    case when p_sin_valor then null else coalesce(p_costo_usd, 0) end,
    v_nota, null, null, null, p_fecha,');

  if position('p_sin_valor boolean DEFAULT' in v_def) = 0
     or position('no pueden ser las dos ciertas' in v_def) = 0
     or position('elsif p_sin_valor then' in v_def) = 0
     or position('queda pendiente de valorar' in v_def) = 0
     or position('case when p_sin_valor then null' in v_def) = 0 then
    raise exception 'Algun anclaje no encajo: no se toca nada.';
  end if;

  drop function if exists public.registrar_entrada(
    bigint, bigint, numeric, numeric, text, text, date, boolean, boolean);
  execute v_def;
  raise notice 'la entrada admite no saber cuanto vale.';
end $entrada$;

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás:

    1 sin marcar nada y sin cifra : «Hay que decir cuánto costó la unidad…» —
                                    la reja de siempre sigue puesta
    2 las dos marcas a la vez ....: ««No costo nada» y «no se sabe cuanto vale»
                                    no pueden ser las dos ciertas.»
    3 marcando «sin valor» .......: entró 8, costo (nulo), y la nota acaba en
                                    «SIN VALOR DECLARADO: ENTRO SIN CIFRA Y QUEDA
                                    PENDIENTE DE VALORAR.»
    4 conviviendo con una valorada: 20 en total, 8 sin valorar, vale 120,00,
                                    promedio 10,00
*/
