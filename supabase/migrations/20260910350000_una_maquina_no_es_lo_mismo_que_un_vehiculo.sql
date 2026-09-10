/*
  UNA MÁQUINA NO ES LO MISMO QUE UN VEHÍCULO.

  Christopher: «segmentar si es una maquinaria (ej. volvo, chuto,
  retroexcavadora, etc) o vehículo (ej. camioneta)».

  ═══════════════════════════════════════════════════════════════════════════
  NO SE PUEDE DEDUCIR DE `tipo`, Y ESO ES LO INTERESANTE
  ═══════════════════════════════════════════════════════════════════════════

  La tentación era sacarlo de lo que ya hay: EXCAVADORA, CARGADOR, CAMION,
  PLANTA, PERFORADORA, VEHICULO, GENERADOR, OTRO. Se descarta al mirar sus
  propios ejemplos.

  Él llama MAQUINARIA a un chuto, que es un camión. Y VEHÍCULO a una camioneta,
  que también lo es. O sea que el corte no es «tiene ruedas» ni «se conduce»:
  es para qué está la cosa —trabajar en la mina o llevar gente y encargos—, y eso
  no está escrito en ninguna parte del tipo. Con OTRO no hay ni por dónde
  empezar, y con PLANTA y GENERADOR la pregunta ni siquiera se responde: no son
  ninguna de las dos.

  Deducirlo daría aciertos y fallos indistinguibles, que es exactamente lo que se
  descartó esta misma mañana con el titular del organigrama. Se pregunta.

  ═══════════════════════════════════════════════════════════════════════════
  TRES VALORES Y NO DOS
  ═══════════════════════════════════════════════════════════════════════════

  MAQUINA y VEHICULO son los que él nombra. EQUIPO es para lo que no es ninguna
  de las dos —una planta eléctrica, un generador, una perforadora fija— y existe
  para que nadie tenga que meterlo a la fuerza en una de las otras. Un generador
  clasificado como «vehículo» rompería el conteo que se pide.

  El valor por defecto es MAQUINA porque este módulo se llama Maquinaria y nació
  para eso: lo que llegue sin decir nada es lo que era antes de esta columna.

  Y al corregir SÍ se puede cambiar, con coalesce: una ficha mal clasificada se
  arregla, y esto no mueve dinero ni existencias. Es distinto del estado, que
  obliga a explicar el cambio porque puede parar una excavadora.

  NADA QUE MIGRAR: hay una máquina, una retroexcavadora, y MAQUINA es su
  respuesta. Comprobado antes de poner el default.
*/

alter table public.maquinaria
  add column if not exists clase text not null default 'MAQUINA';

alter table public.maquinaria drop constraint if exists maquinaria_clase_check;
alter table public.maquinaria
  add constraint maquinaria_clase_check check (clase in ('MAQUINA', 'VEHICULO', 'EQUIPO'));

comment on column public.maquinaria.clase is
  'MAQUINA lo que trabaja en la mina (un volvo, un chuto, una retroexcavadora) · VEHICULO lo que lleva gente y encargos (una camioneta) · EQUIPO lo que no es ninguna de las dos (una planta electrica, un generador). Lo pidio Christopher el 10/09/2026. NO se deduce de `tipo`: el llama maquinaria a un chuto —que es un camion— y vehiculo a una camioneta —que tambien lo es—, asi que el corte no es «tiene ruedas» sino para que esta la cosa, y eso no esta escrito en el tipo. Deducirlo daria aciertos y fallos indistinguibles.';

create index if not exists maquinaria_clase on public.maquinaria (clase);

-- ---------------------------------------------------------------------------
-- La puerta y la vista
-- ---------------------------------------------------------------------------
do $puerta$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'guardar_maquina';

  if position('p_clase' in v_def) > 0 then
    raise notice 'guardar_maquina ya conocia la clase.';
    return;
  end if;

  v_def := replace(v_def,
    'p_operador_id bigint DEFAULT NULL::bigint)',
    'p_operador_id bigint DEFAULT NULL::bigint, p_clase text DEFAULT NULL::text)');

  /* Se valida antes de escribir: el CHECK tambien lo para, pero con un mensaje
     que nombra la restriccion en vez de decir que se puede poner. */
  v_def := replace(v_def,
'  if length(btrim(coalesce(p_nombre, ''''))) < 2 then',
'  if p_clase is not null and upper(btrim(p_clase)) not in (''MAQUINA'', ''VEHICULO'', ''EQUIPO'') then
    raise exception ''Eso no es una clase valida: %.'', p_clase
      using errcode = ''22023'',
            hint = ''MAQUINA lo que trabaja en la mina, VEHICULO lo que lleva gente y encargos, EQUIPO lo que no es ninguna de las dos.'';
  end if;

  if length(btrim(coalesce(p_nombre, ''''))) < 2 then');

  v_def := replace(v_def,
    'combustible_id, capacidad_combustible, propietario, operador_id, creada_por)',
    'combustible_id, capacidad_combustible, propietario, operador_id, clase, creada_por)');

  v_def := replace(v_def,
'       p_operador_id,
       (select auth.uid()))',
'       p_operador_id,
       coalesce(nullif(upper(btrim(coalesce(p_clase, ''''))), ''''), ''MAQUINA''),
       (select auth.uid()))');

  v_def := replace(v_def,
    'operador_id = p_operador_id',
    'operador_id = p_operador_id,
           clase = coalesce(nullif(upper(btrim(coalesce(p_clase, ''''))), ''''), clase)');

  if position('p_clase text DEFAULT' in v_def) = 0
     or position('Eso no es una clase valida' in v_def) = 0
     or position('operador_id, clase, creada_por' in v_def) = 0
     or position('clase = coalesce' in v_def) = 0 then
    raise exception 'Algun anclaje no encajo: no se toca nada.';
  end if;

  drop function if exists public.guardar_maquina(
    bigint, text, text, text, text, text, text, smallint, bigint,
    numeric, numeric, numeric, smallint, text, bigint, numeric, text, text, jsonb, bigint);
  execute v_def;
  raise notice 'guardar_maquina conoce la clase.';
end $puerta$;

do $vista$
declare v_def text;
begin
  select pg_get_viewdef('public.v_maquinaria'::regclass, true) into v_def;

  if position('m.clase' in v_def) > 0 then
    raise notice 'v_maquinaria ya decia la clase.';
    return;
  end if;

  v_def := replace(v_def,
    '    op.ficha AS operador_ficha
   FROM maquinaria m',
    '    op.ficha AS operador_ficha,
    m.clase
   FROM maquinaria m');

  if position('m.clase' in v_def) = 0 then
    raise exception 'El anclaje no encajo: no se toca la vista.';
  end if;

  execute 'create or replace view public.v_maquinaria as ' || v_def;
  raise notice 'v_maquinaria dice la clase.';
end $vista$;

grant select on public.v_maquinaria to authenticated;

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás:

    1 la que ya existía ......: MAQUINA — el default es su respuesta
    2 nace como vehículo .....: VEHICULO
    3 clase inventada ........: «Eso no es una clase valida: CARRO.»
    4 se corrige a ...........: EQUIPO
    5 sin mandarla ...........: se queda en EQUIPO, no vuelve al default
*/
