/*
  EL SERIAL DE UNA MÁQUINA NO SE REPITE.

  Del documento del otro sistema, que Christopher pasó para adaptar: «el nombre
  de una máquina NO la identifica; la placa o el serial sí». Y más abajo:
  «unicidad forzada en serial y en placa».

  Aquí `codigo` ya es único, así que la identidad está resuelta y el problema
  gordo que ellos describen —tres máquinas llamadas RETROEXCAVADORA y dos
  pantallas agrupando POR NOMBRE, que sumaban las horas de las tres en una fila—
  no se puede dar igual.

  Pero el SERIAL estaba suelto, y ése es el número que trae la máquina de
  fábrica: dos fichas con el mismo serial son dos fichas de la misma máquina
  física, y a partir de ahí las horas, el combustible y los mantenimientos se
  reparten entre las dos sin que nadie lo note.

  ═══════════════════════════════════════════════════════════════════════════
  ÚNICO PERO ADMITIENDO VACÍOS
  ═══════════════════════════════════════════════════════════════════════════

  Un índice único de Postgres ya deja repetir nulos, pero se escribe la condición
  a mano para dejar dicho que el hueco es legítimo: hay máquinas viejas sin placa
  a la vista, y exigir el serial para poder registrarla obligaría a inventarlo —
  que es peor que no tenerlo.

  Y se compara SIN espacios ni mayúsculas: «CAT 0320 DL» y «  cat0320dl  » son el
  mismo serial escrito por dos personas distintas, y un índice literal las
  dejaría pasar. El disparador de normalización sube a mayúscula pero no quita
  los espacios de en medio.

  Los guiones NO se quitan: «AB-123» y «AB123» pueden ser dos seriales distintos
  de verdad, y juntarlos sería inventar una coincidencia. Se probó al revés y la
  prueba estaba mal planteada, no la regla.

  NADA QUE MIGRAR: cero seriales repetidos hoy. Comprobado antes de crear el
  índice, que si no habría fallado al aplicarse.
*/
create unique index if not exists maquinaria_serial_unico
  on public.maquinaria (upper(replace(btrim(serial), ' ', '')))
  where serial is not null and btrim(serial) <> '';

comment on index public.maquinaria_serial_unico is
  'Dos fichas con el mismo serial son dos fichas de la misma maquina fisica, y a partir de ahi las horas, el combustible y los mantenimientos se reparten entre las dos sin que nadie lo note. Admite vacios porque hay maquinas viejas sin placa a la vista y exigirlo obligaria a inventarlo. Compara sin espacios ni mayusculas.';

-- ---------------------------------------------------------------------------
-- Y la puerta lo dice con palabras, nombrando a la otra máquina
-- ---------------------------------------------------------------------------
/*
  EL CÓDIGO DE ERROR NO PUEDE SER 23505, y eso costó una prueba.

  Lo puse con `errcode = '23505'` porque es «violación de unicidad» y parecía lo
  honesto. `guardar_maquina` tiene su propio `exception when unique_violation`
  que lo reescribió: en vez de «ese serial ya lo tiene la máquina PRB-S1» salía
  «ya existe una máquina con el código PRB-S2» — hablando de un código que no
  existía.

  Es EXACTAMENTE la trampa que ya mordió el 9/09/2026 con el código de artículo
  retirado, y por el mismo motivo: un manejador genérico de arriba se traga el
  mensaje específico de abajo. 22023 es «parámetro no válido», que además es lo
  que de verdad pasa — el serial que mandaron no sirve porque ya es de otra.
*/
do $puerta$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'guardar_maquina';

  if position('Ese serial ya lo tiene' in v_def) > 0 then
    raise notice 'guardar_maquina ya avisaba del serial repetido.';
    return;
  end if;

  v_def := replace(v_def,
'  if p_clase is not null and upper(btrim(p_clase)) not in (''MAQUINA'', ''VEHICULO'', ''EQUIPO'') then',
'  /*
    EL SERIAL NO SE REPITE, y se dice CUAL maquina lo tiene ya. Un «viola una
    restriccion unica» obliga a ir a buscarla; el codigo de la otra la señala.
  */
  if nullif(btrim(coalesce(p_serial, '''')), '''') is not null then
    declare v_otra text;
    begin
      select m.codigo into v_otra from public.maquinaria m
       where upper(replace(btrim(m.serial), '' '', '''')) = upper(replace(btrim(p_serial), '' '', ''''))
         and (p_id is null or m.id <> p_id)
       limit 1;
      if v_otra is not null then
        raise exception ''Ese serial ya lo tiene la maquina %.'', v_otra
          using errcode = ''22023'',
                hint = ''Dos fichas con el mismo serial son dos fichas de la misma maquina: las horas y el combustible se repartirian entre las dos.'';
      end if;
    end;
  end if;

  if p_clase is not null and upper(btrim(p_clase)) not in (''MAQUINA'', ''VEHICULO'', ''EQUIPO'') then');

  if position('Ese serial ya lo tiene' in v_def) = 0 then
    raise exception 'El anclaje no encajo: no se toca nada.';
  end if;

  execute v_def;  -- misma firma
  raise notice 'guardar_maquina avisa del serial repetido.';
end $puerta$;

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás:

    1 el mismo serial, idéntico ......: «Ese serial ya lo tiene la maquina PRB-S1.»
    2 el mismo sin espacios ni
      mayúsculas («  cat0320dl  ») ...: el mismo rechazo
    3 uno distinto de verdad .........: pasa, como debe
    4 dos máquinas sin serial ........: conviven, como debe
    5 corregir la misma máquina con su
      propio serial ..................: pasa — no se estorba a sí misma
*/
