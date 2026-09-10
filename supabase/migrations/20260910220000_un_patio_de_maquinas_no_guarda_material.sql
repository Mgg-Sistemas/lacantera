/*
  UN PATIO PUEDE NO SER DE MATERIAL.

  Christopher: «debemos ampliar las opciones, incluso añadir un lugar que sea un
  patio, pero no de material, pensado por ejemplo para patio de máquinas o
  vehículos».

  Los cinco tipos que había —PATIO, ALMACEN, TALLER, COMBUSTIBLE, TRANSITO—
  comparten un supuesto: todos guardan MATERIAL, y por eso todos aparecen en cada
  desplegable del inventario. Un sitio donde se estacionan máquinas no encaja en
  ninguno: llamarlo PATIO lo mete en la lista de destinos de una entrada, y
  entonces alguien puede meterle veinte sacos de cemento al estacionamiento.

  ═══════════════════════════════════════════════════════════════════════════
  ES UN TIPO NUEVO, NO UNA CASILLA
  ═══════════════════════════════════════════════════════════════════════════

  Se pensó en una casilla «no guarda material» sobre los tipos que ya hay. Se
  descarta: dejaría marcar un TALLER como que no guarda material, y un taller que
  no guarda material no es nada — no podría recibir el repuesto que va a montar.
  La combinación imposible existiría y nada la impediría.

  Con un tipo, la pregunta se contesta una vez y en el sitio donde ya se contesta
  todo lo demás de este almacén.

  ═══════════════════════════════════════════════════════════════════════════
  LA REJA VA EN EL ÚNICO SITIO QUE ESCRIBE EL LIBRO
  ═══════════════════════════════════════════════════════════════════════════

  Hay catorce puertas de inventario, y parchear catorce es garantizar que un día
  se olvide una. Pero `private.registrar_movimiento` es el ÚNICO sitio de toda la
  base con un `insert into inventario_movimientos` — comprobado contra `pg_proc`,
  no de memoria. Poniendo el cierre ahí lo heredan las catorce, y también las que
  se escriban mañana.

  NADA QUE MIGRAR: no hay ningún almacén de este tipo todavía, porque el tipo
  nace aquí.
*/

alter table public.almacenes drop constraint if exists almacenes_tipo_check;
alter table public.almacenes
  add constraint almacenes_tipo_check
  check (tipo in ('PATIO', 'ALMACEN', 'TALLER', 'COMBUSTIBLE', 'TRANSITO', 'PATIO_MAQUINAS'));

comment on column public.almacenes.tipo is
  'PATIO patio de material · ALMACEN · TALLER (no hay tabla de talleres: un taller es un almacen con este tipo) · COMBUSTIBLE tanque · TRANSITO · PATIO_MAQUINAS donde se estacionan maquinas y vehiculos, y NO guarda material. Este ultimo lo pidio Christopher el 10/09/2026: «un lugar que sea un patio, pero no de material, pensado por ejemplo para patio de maquinas o vehiculos». Es un tipo y no una casilla «no guarda material» porque una casilla dejaria marcar un TALLER como que no guarda material, y un taller que no guarda material no puede recibir el repuesto que va a montar.';

-- ---------------------------------------------------------------------------
-- El único sitio que escribe el libro se niega
-- ---------------------------------------------------------------------------
do $reja$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'registrar_movimiento';

  /*
    Centinela sobre PATIO_MAQUINAS, que es texto propio del bloque nuevo y no
    aparece en ninguna otra parte de esta funcion.

    El primer intento buscaba «no guarda material» en minusculas y el texto
    insertado lo tiene en MAYUSCULAS dentro de un comentario: `position`
    distingue mayusculas, asi que la comprobacion final fallo y la migracion
    entera se deshizo sin tocar nada. Ese es el comportamiento correcto —por eso
    la comprobacion esta puesta— pero el marcador hay que elegirlo bien.
  */
  if position('PATIO_MAQUINAS' in v_def) > 0 then
    raise notice 'registrar_movimiento ya rechazaba los patios de maquinas.';
    return;
  end if;

  v_def := replace(v_def,
'  select unidad into v_unidad from public.articulos where id = p_articulo;',
'  /*
    UN PATIO DE MAQUINAS NO GUARDA MATERIAL, y este es el unico sitio de toda la
    base que escribe en `inventario_movimientos` — comprobado contra pg_proc, no
    de memoria. Poniendo el cierre aqui lo heredan las catorce puertas del
    inventario y las que se escriban mañana.
  */
  if exists (select 1 from public.almacenes a
              where a.id = p_almacen and a.tipo = ''PATIO_MAQUINAS'') then
    raise exception ''«%» es un patio de maquinas: ahi no se guarda material.'',
      (select nombre from public.almacenes where id = p_almacen)
      using errcode = ''22023'',
            hint = ''Sirve para decir donde se resguarda una maquina o un vehiculo, no para llevar existencias.'';
  end if;

  select unidad into v_unidad from public.articulos where id = p_articulo;');

  if position('PATIO_MAQUINAS' in v_def) = 0 then
    raise exception 'El anclaje no encajo: no se toca nada.';
  end if;

  execute v_def;
  raise notice 'un patio de maquinas no guarda material.';
end $reja$;

-- ---------------------------------------------------------------------------
-- Y la puerta del almacén lo acepta
-- ---------------------------------------------------------------------------
do $puerta$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'guardar_almacen';

  if position('PATIO_MAQUINAS' in v_def) > 0 then
    raise notice 'guardar_almacen ya conocia el patio de maquinas.';
    return;
  end if;

  v_def := replace(v_def,
    'if p_tipo not in (''PATIO'', ''ALMACEN'', ''TALLER'', ''COMBUSTIBLE'', ''TRANSITO'') then',
    'if p_tipo not in (''PATIO'', ''ALMACEN'', ''TALLER'', ''COMBUSTIBLE'', ''TRANSITO'', ''PATIO_MAQUINAS'') then');

  if position('PATIO_MAQUINAS' in v_def) = 0 then
    raise exception 'El anclaje de guardar_almacen no encajo: no se toca nada.';
  end if;

  execute v_def;
  raise notice 'guardar_almacen acepta el patio de maquinas.';
end $puerta$;

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás:

    1 se crea con el tipo nuevo ......: PATIO_MAQUINAS
    2 meterle material directamente ..: «PATIO DE MAQUINAS SUR» es un patio de
                                        maquinas: ahi no se guarda material.
    3 trasladarle algo por la puerta
      de arriba (`transferir_existencia`): el mismo rechazo — la reja del
                                        ayudante la heredan las catorce puertas
    4 resguardar una máquina ahí .....: PATIO DE MAQUINAS SUR, que es para lo
                                        que existe
*/
