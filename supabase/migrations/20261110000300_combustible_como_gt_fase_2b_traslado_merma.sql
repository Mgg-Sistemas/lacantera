/*
  COMBUSTIBLE COMO GOLDEN TOUCH · FASE 2b: TRASLADO, MERMA, RETORNO Y
  CORRECCIÓN (10/11/2026)

    · combustible_trasladar           de un tanque a otro (o del almacén al
                                      tanque), al costo del origen; a un bidón
                                      es un uso; lo que llegó de menos queda
                                      como merma del destino
    · combustible_registrar_merma     pérdida del tanque, al costo vigente
    · combustible_registrar_retorno   combustible que vuelve al tanque, al
                                      costo vigente (no mueve la tasa)
    · combustible_corregir_movimiento corregir = reverso + nuevo, en un solo
                                      paso; un vale va por
                                      `corregir_despacho_combustible`; si no
                                      cambia nada de lo que mide el libro,
                                      solo se corrigen los datos
    · combustible_marcar_cuaderno     «📖 Cuaderno»: asentado en el cuaderno
                                      de campo, y cuántos litros

  Aditiva: no toca ninguna fila existente.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Ayudantes
-- ═══════════════════════════════════════════════════════════════════════════

-- La fila de datos de un movimiento, creada si no existe. Los 208 movimientos
-- de antes de esto no tienen la suya: nace la primera vez que alguien les
-- marca el cuaderno o les corrige un dato.
create or replace function private.combustible_datos_de(p_mov bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.combustible_mov_datos (movimiento_id, hora, maquina_id, despacho_id)
  select m.id, d.hora, d.maquina_id, d.id
    from public.inventario_movimientos m
    left join public.despachos_combustible d on d.movimiento_id = m.id
   where m.id = p_mov
  on conflict (movimiento_id) do nothing;
$$;

-- Qué acción hace falta para tocar un movimiento del libro. Nulo: no nació en
-- Combustible y se toca desde donde se hizo.
create or replace function private.combustible_accion_de(p_mov bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when m.tipo in ('ENTRADA_DIRECTA', 'ENTRADA_DEVOLUCION') then 'COMBUSTIBLE.ENTRADA'
    when m.tipo in ('TRANSFERENCIA_SALIDA', 'TRANSFERENCIA_ENTRADA') then 'COMBUSTIBLE.TRASLADO'
    when m.tipo = 'SALIDA_CONSUMO' then
      case when exists (select 1 from public.despachos_combustible d where d.movimiento_id = m.id)
           then 'COMBUSTIBLE.DESPACHAR' else 'COMBUSTIBLE.TRASLADO' end
    when m.tipo = 'SALIDA_MERMA' then
      case
        when md.merma_de_mov_id is null then 'COMBUSTIBLE.MERMA'
        when o.tipo = 'ENTRADA_DIRECTA' then 'COMBUSTIBLE.ENTRADA'
        else 'COMBUSTIBLE.TRASLADO'
      end
  end
    from public.inventario_movimientos m
    left join public.combustible_mov_datos md on md.movimiento_id = m.id
    left join public.inventario_movimientos o on o.id = md.merma_de_mov_id
   where m.id = p_mov;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Trasladar
-- ═══════════════════════════════════════════════════════════════════════════

/*
  EL TRASLADO DE GOLDEN TOUCH CON LAS REJAS DE `transferir_existencia`.

  · El destino es un tanque. El origen, un tanque o cualquier almacén con
    gasoil: es también el «Pasar al tanque».
  · Sale al costo promedio del origen y entra a ese costo: no cambia lo que hay
    en total, cambia dónde está.
  · La reja del tanque sin costo, tal cual (07/09/2026): de un sitio sin costo
    no se pasa a uno con costo, ni al revés.
  · El dueño viaja con el material: si no se dice de quién, se mira el origen.
  · A un BIDÓN no es traslado: es un uso del tanque de origen, en el momento
    (Golden Touch, 23/10/2026). El bidón no acumula saldo.
  · Si se anota lo que llegó, la diferencia queda como merma del destino,
    ligada al traslado. Si pasa el margen del destino: motivo y
    COMBUSTIBLE.MERMA_FUERA_DE_MARGEN.
  · El contador es el del surtidor del tanque de ORIGEN.

  Devuelve {salida_id, entrada_id, merma_movimiento_id, bidon}.
*/
create or replace function public.combustible_trasladar(
  p_origen_id bigint,
  p_destino_id bigint,
  p_litros numeric,
  p_motivo text default null,
  p_fecha date default null,
  p_hora time default null,
  p_autorizado text default null,
  p_ubicacion text default null,
  p_contador_ini numeric default null,
  p_contador_fin numeric default null,
  p_recibidos numeric default null,
  p_merma_motivo text default null,
  p_cuaderno boolean default false,
  p_cuaderno_litros numeric default null,
  p_articulo_id bigint default null,
  p_propietario text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origen  public.almacenes;
  v_destino public.almacenes;
  v_art     public.articulos;
  v_fecha   date := coalesce(p_fecha, private.hoy_aqui());
  v_hora    time;
  v_bidon   boolean;
  v_margen  numeric;
  v_dueno   text;
  v_duenos  text[];
  v_hay     numeric;
  v_costo   numeric;
  v_nota    text;
  v_obs     text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_merma   record;
  v_salida  bigint;
  v_entrada bigint;
  v_mmov    bigint;
  v_ci      numeric := p_contador_ini;
  v_cf      numeric := p_contador_fin;
begin
  perform private.exigir_accion('COMBUSTIBLE.TRASLADO');

  select * into v_origen from public.almacenes where id = p_origen_id;
  if v_origen.id is null then
    raise exception 'No existe el almacén de origen %.', p_origen_id using errcode = 'P0002';
  end if;
  v_destino := private.combustible_tanque(p_destino_id);

  if p_origen_id = p_destino_id then
    raise exception 'El origen y el destino son el mismo tanque.' using errcode = '22023';
  end if;
  if coalesce(p_litros, 0) <= 0 then
    raise exception 'Los litros que se pasan tienen que ser más que cero.' using errcode = '22023';
  end if;
  if v_fecha > private.hoy_aqui() then
    raise exception 'No se registra combustible con fecha futura.' using errcode = '22023';
  end if;

  select * into v_art from public.articulos
   where id = coalesce(p_articulo_id, private.combustible_articulo_del_tanque(p_origen_id));
  if v_art.id is null or v_art.categoria <> 'COMBUSTIBLE' then
    raise exception 'Lo que se pasa a un tanque tiene que ser combustible.' using errcode = '22023';
  end if;

  select coalesce(t.es_bidon, false), coalesce(t.margen_merma_pct, 10) into v_bidon, v_margen
    from public.combustible_tanques t where t.almacen_id = p_destino_id;
  v_bidon := coalesce(v_bidon, false);

  if v_bidon and p_recibidos is not null then
    raise exception 'A un bidón no se le mide lo que llegó: lo que se le pasa se da por usado.' using errcode = '22023';
  end if;

  -- La reja del tanque sin costo, como en `transferir_existencia`.
  if not v_bidon then
    if coalesce(v_origen.admite_sin_costo, false) and not coalesce(v_destino.admite_sin_costo, false) then
      raise exception 'De "%" no se puede trasladar a "%": lo que hay ahí entró sin costo y hundiría el costo promedio del destino.',
        v_origen.nombre, v_destino.nombre
        using errcode = '22023',
              hint = 'Antes hay que decidir a qué precio se valora lo que trasladó la otra empresa. Mientras no se decida, el traslado escribiría un cero que después no se puede distinguir de un precio real.';
    end if;
    if not coalesce(v_origen.admite_sin_costo, false) and coalesce(v_destino.admite_sin_costo, false) then
      raise exception 'A "%" solo entra lo que no costó nada, y lo que sale de "%" tiene precio.',
        v_destino.nombre, v_origen.nombre
        using errcode = '22023',
              hint = 'Ese almacén lleva aparte lo que no le costó nada a esta empresa. Metiendo ahí material con precio se pierde su valor y el nombre del tanque deja de ser verdad.';
    end if;
  end if;

  -- De quién es lo que se mueve: si no se dice, el único dueño del origen.
  v_dueno := nullif(btrim(coalesce(p_propietario, '')), '');
  if v_dueno is null then
    select array_agg(distinct t.propietario) into v_duenos
      from (select m.propietario
              from public.inventario_movimientos m
             where m.almacen_id = p_origen_id and m.articulo_id = v_art.id
             group by m.propietario
            having sum(m.cantidad * m.signo) > 0) t;
    if coalesce(array_length(v_duenos, 1), 0) > 1 then
      raise exception 'En "%" hay combustible de varios dueños (%): hay que decir de cuál se pasa.',
        v_origen.nombre, array_to_string(v_duenos, ', ') using errcode = '22023';
    end if;
    v_dueno := coalesce(v_duenos[1], v_origen.propietario, 'LACANTERA');
  end if;

  v_hay := private.existencia_para_escribir(p_origen_id, v_art.id, v_dueno);
  if p_litros > v_hay then
    raise exception 'El tanque «%» tiene % L; no se pueden pasar % L.',
      v_origen.nombre, private.cantidad_es(greatest(v_hay, 0)), private.cantidad_es(p_litros)
      using errcode = '55000';
  end if;

  -- La merma se revisa ANTES de escribir nada.
  if not v_bidon then
    select * into v_merma from private.combustible_merma_recepcion(p_litros, p_recibidos, v_margen);
    if coalesce(v_merma.o_merma, 0) > 0 then
      perform private.combustible_exigir_merma(p_destino_id, v_merma.o_pct, v_merma.o_excede, p_merma_motivo);
    end if;
  end if;

  -- El contador del surtidor del origen, si el origen es un tanque.
  if v_origen.tipo = 'COMBUSTIBLE' then
    if v_ci is null then
      v_ci := private.combustible_contador_vigente(p_origen_id);
    end if;
    if v_cf is null and v_ci is not null then
      v_cf := round(v_ci + p_litros, 2);
    end if;
  end if;

  v_costo := private.costo_promedio(p_origen_id, v_art.id, v_dueno);
  v_hora := coalesce(p_hora, case when v_fecha = private.hoy_aqui()
                                  then (now() at time zone 'America/Caracas')::time end);

  if v_bidon then
    v_nota := format('Salida a %s', v_destino.nombre);
    if v_obs is not null and position('bid' in lower(v_obs)) = 0 then
      v_nota := v_obs || ' · ' || v_nota;
    elsif v_obs is not null then
      v_nota := v_obs;
    end if;

    v_salida := private.registrar_movimiento(
      p_tipo => 'SALIDA_CONSUMO', p_signo => (-1)::smallint,
      p_almacen => p_origen_id, p_articulo => v_art.id,
      p_cantidad => p_litros, p_costo_usd => v_costo,
      p_nota => format('Combustible · %s · %s', v_destino.nombre, v_nota),
      p_fecha => v_fecha, p_propietario => v_dueno);

    insert into public.combustible_mov_datos
      (movimiento_id, hora, equipo, autorizado, ubicacion, observacion, contador_ini, contador_fin,
       destino_almacen_id, cuaderno, cuaderno_litros)
    values
      (v_salida, v_hora, v_destino.nombre,
       nullif(btrim(coalesce(p_autorizado, '')), ''), nullif(btrim(coalesce(p_ubicacion, '')), ''),
       v_nota, v_ci, v_cf, p_destino_id,
       coalesce(p_cuaderno, false),
       case when coalesce(p_cuaderno, false) then coalesce(p_cuaderno_litros, p_litros) end);

    return jsonb_build_object('salida_id', v_salida, 'entrada_id', null,
                              'merma_movimiento_id', null, 'bidon', true);
  end if;

  v_nota := coalesce(v_obs, format('De %s a %s', v_origen.nombre, v_destino.nombre));

  v_salida := private.registrar_movimiento(
    p_tipo => 'TRANSFERENCIA_SALIDA', p_signo => (-1)::smallint,
    p_almacen => p_origen_id, p_articulo => v_art.id,
    p_cantidad => p_litros, p_costo_usd => v_costo,
    p_nota => format('Traslado a %s. %s', v_destino.nombre, v_nota),
    p_fecha => v_fecha, p_propietario => v_dueno);

  v_entrada := private.registrar_movimiento(
    p_tipo => 'TRANSFERENCIA_ENTRADA', p_signo => (1)::smallint,
    p_almacen => p_destino_id, p_articulo => v_art.id,
    p_cantidad => p_litros, p_costo_usd => v_costo,
    p_nota => format('Traslado desde %s. %s', v_origen.nombre, v_nota),
    p_origen => v_salida, p_fecha => v_fecha, p_propietario => v_dueno);

  insert into public.combustible_mov_datos
    (movimiento_id, hora, autorizado, ubicacion, observacion, contador_ini, contador_fin, cuaderno, cuaderno_litros)
  values
    (v_salida, v_hora,
     nullif(btrim(coalesce(p_autorizado, '')), ''), nullif(btrim(coalesce(p_ubicacion, '')), ''),
     v_obs, v_ci, v_cf,
     coalesce(p_cuaderno, false),
     case when coalesce(p_cuaderno, false) then coalesce(p_cuaderno_litros, p_litros) end);

  insert into public.combustible_mov_datos
    (movimiento_id, hora, autorizado, ubicacion, observacion)
  values
    (v_entrada, v_hora,
     nullif(btrim(coalesce(p_autorizado, '')), ''), nullif(btrim(coalesce(p_ubicacion, '')), ''),
     format('Traslado desde %s%s', v_origen.nombre, case when v_obs is not null then ' · ' || v_obs else '' end));

  if coalesce(v_merma.o_merma, 0) > 0 then
    v_mmov := private.combustible_escribir_merma_de(
      v_salida, p_destino_id, v_art.id, v_merma.o_merma, v_merma.o_pct, v_merma.o_excede, p_merma_motivo,
      'traslado', 'desde ' || v_origen.nombre, v_fecha, v_hora, p_autorizado, p_ubicacion, v_dueno);
  end if;

  return jsonb_build_object('salida_id', v_salida, 'entrada_id', v_entrada,
                            'merma_movimiento_id', v_mmov, 'bidon', false);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Merma y retorno
-- ═══════════════════════════════════════════════════════════════════════════

/*
  MERMA: litros que el tanque perdió (evaporación, fuga, descuadre), al costo
  vigente. No se carga a ninguna máquina. La «merma sugerida» de Golden Touch
  (el 0,5 % de lo movido desde la última merma) la calcula la pantalla; aquí se
  guarda lo que se decida.
*/
create or replace function public.combustible_registrar_merma(
  p_almacen_id bigint,
  p_litros numeric,
  p_motivo text,
  p_fecha date default null,
  p_hora time default null,
  p_autorizado text default null,
  p_ubicacion text default null,
  p_articulo_id bigint default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tanque public.almacenes;
  v_art    bigint;
  v_fecha  date := coalesce(p_fecha, private.hoy_aqui());
  v_dueno  text;
  v_hay    numeric;
  v_costo  numeric;
  v_mov    bigint;
begin
  perform private.exigir_accion('COMBUSTIBLE.MERMA');

  v_tanque := private.combustible_tanque(p_almacen_id);
  v_art := coalesce(p_articulo_id, private.combustible_articulo_del_tanque(p_almacen_id));

  if coalesce(p_litros, 0) <= 0 then
    raise exception 'Los litros de la merma tienen que ser más que cero.' using errcode = '22023';
  end if;
  if v_fecha > private.hoy_aqui() then
    raise exception 'No se registra combustible con fecha futura.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Decí por qué se perdió: evaporación, fuga, descuadre…' using errcode = '22023';
  end if;

  v_dueno := private.dueno_del_saldo(p_almacen_id, v_art, null);
  v_hay := private.existencia_para_escribir(p_almacen_id, v_art, v_dueno);
  if p_litros > v_hay then
    raise exception 'El tanque «%» tiene % L; la merma no puede ser de % L.',
      v_tanque.nombre, private.cantidad_es(greatest(v_hay, 0)), private.cantidad_es(p_litros)
      using errcode = '55000';
  end if;

  v_costo := private.costo_promedio(p_almacen_id, v_art, v_dueno);

  v_mov := private.registrar_movimiento(
    'SALIDA_MERMA', -1, p_almacen_id, v_art, p_litros, v_costo,
    format('Merma · %s', btrim(p_motivo)),
    null, null, null, v_fecha, p_propietario => v_dueno);

  insert into public.combustible_mov_datos (movimiento_id, hora, autorizado, ubicacion, observacion)
  values (v_mov,
          coalesce(p_hora, case when v_fecha = private.hoy_aqui()
                                then (now() at time zone 'America/Caracas')::time end),
          nullif(btrim(coalesce(p_autorizado, '')), ''), nullif(btrim(coalesce(p_ubicacion, '')), ''),
          btrim(p_motivo));

  return v_mov;
end;
$$;

/*
  RETORNO: combustible que VUELVE al tanque (lo que sobró en un equipo, un
  bidón que no se usó). Entra al costo vigente del tanque: no mueve la tasa.
  Un tanque sin costo vigente no tiene contra qué devolver; ahí lo que vuelve
  se registra como entrada, con su costo.
*/
create or replace function public.combustible_registrar_retorno(
  p_almacen_id bigint,
  p_litros numeric,
  p_motivo text,
  p_maquina_id bigint default null,
  p_equipo text default null,
  p_fecha date default null,
  p_hora time default null,
  p_autorizado text default null,
  p_ubicacion text default null,
  p_articulo_id bigint default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tanque public.almacenes;
  v_art    bigint;
  v_fecha  date := coalesce(p_fecha, private.hoy_aqui());
  v_bidon  boolean;
  v_costo  numeric;
  v_mov    bigint;
  v_donde  text;
begin
  perform private.exigir_accion('COMBUSTIBLE.ENTRADA');

  v_tanque := private.combustible_tanque(p_almacen_id);
  select coalesce(t.es_bidon, false) into v_bidon from public.combustible_tanques t where t.almacen_id = p_almacen_id;
  if coalesce(v_bidon, false) then
    raise exception '«%» es un bidón: no guarda combustible.', v_tanque.nombre using errcode = '22023';
  end if;
  v_art := coalesce(p_articulo_id, private.combustible_articulo_del_tanque(p_almacen_id));

  if coalesce(p_litros, 0) <= 0 then
    raise exception 'Los litros que vuelven tienen que ser más que cero.' using errcode = '22023';
  end if;
  if v_fecha > private.hoy_aqui() then
    raise exception 'No se registra combustible con fecha futura.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Decí de dónde vuelve el combustible.' using errcode = '22023';
  end if;
  if p_maquina_id is not null and not exists (select 1 from public.maquinaria where id = p_maquina_id) then
    raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
  end if;

  perform private.existencia_para_escribir(p_almacen_id, v_art);
  v_costo := private.costo_promedio(p_almacen_id, v_art);
  if v_costo is null then
    if v_tanque.admite_sin_costo then
      v_costo := 0;
    else
      raise exception 'En «%» no hay un costo vigente contra el que devolver: registralo como entrada, con su costo.',
        v_tanque.nombre using errcode = '55000';
    end if;
  end if;

  v_donde := coalesce((select nombre from public.maquinaria where id = p_maquina_id),
                      nullif(btrim(coalesce(p_equipo, '')), ''));

  v_mov := private.registrar_movimiento(
    'ENTRADA_DEVOLUCION', 1, p_almacen_id, v_art, p_litros, v_costo,
    format('Retorno al tanque%s · %s', case when v_donde is not null then ' desde ' || v_donde else '' end, btrim(p_motivo)),
    null, null, null, v_fecha);

  insert into public.combustible_mov_datos
    (movimiento_id, hora, maquina_id, equipo, autorizado, ubicacion, observacion)
  values
    (v_mov,
     coalesce(p_hora, case when v_fecha = private.hoy_aqui()
                           then (now() at time zone 'America/Caracas')::time end),
     p_maquina_id,
     case when p_maquina_id is null then nullif(btrim(coalesce(p_equipo, '')), '') end,
     nullif(btrim(coalesce(p_autorizado, '')), ''), nullif(btrim(coalesce(p_ubicacion, '')), ''),
     btrim(p_motivo));

  return v_mov;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Cuaderno
-- ═══════════════════════════════════════════════════════════════════════════

-- «📖 Cuaderno»: si el movimiento se asentó en el cuaderno de campo y cuántos
-- litros dice ahí. Sin litros, los del movimiento.
create or replace function public.combustible_marcar_cuaderno(
  p_movimiento_id bigint, p_cuaderno boolean, p_litros numeric default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov public.inventario_movimientos;
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');

  select m.* into v_mov
    from public.inventario_movimientos m
    join public.almacenes a on a.id = m.almacen_id and a.tipo = 'COMBUSTIBLE'
   where m.id = p_movimiento_id;
  if v_mov.id is null then
    raise exception 'Ese movimiento no es de un tanque de combustible.' using errcode = 'P0002';
  end if;
  if p_litros is not null and p_litros < 0 then
    raise exception 'Los litros del cuaderno no pueden ser negativos.' using errcode = '22023';
  end if;

  perform private.combustible_datos_de(p_movimiento_id);

  update public.combustible_mov_datos
     set cuaderno        = coalesce(p_cuaderno, false),
         cuaderno_litros = case when coalesce(p_cuaderno, false) then coalesce(p_litros, v_mov.cantidad) end,
         actualizado_por = (select auth.uid()),
         actualizado_en  = now()
   where movimiento_id = p_movimiento_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Corregir
-- ═══════════════════════════════════════════════════════════════════════════

/*
  CORREGIR UN MOVIMIENTO DEL LIBRO.

  `p_datos` trae solo lo que cambia (una clave ausente es «déjalo como está»;
  una clave con nulo es «bórralo»). Tres caminos:

    1. Un VALE (uso con número CMB-…) se corrige con
       `corregir_despacho_combustible`, con sus reglas: escritura para el de
       hoy, control total para el de otro día. Si la corrección cambió el
       movimiento, los datos del libro pasan al nuevo.
    2. Si cambia lo que el libro mide —litros, fecha, costo o destino— se
       anula el movimiento (REVERSO con el motivo) y se registra de nuevo con
       la puerta que corresponde, todo en la misma transacción. Una entrada se
       registra antes de anular la vieja, para que la anulación no tropiece con
       litros que ya se usaron; una salida, después.
    3. Si no, solo se corrigen los datos (hora, autorizado, destino,
       observación, contador, horómetro, kilometraje, cuaderno). En un
       traslado, lo compartido pasa a las dos patas.

  Lo del día lo corrige quien tiene la acción del movimiento; lo de otro día,
  además, control total en Combustible.

  Devuelve {movimiento_id, camino}.
*/
create or replace function public.combustible_corregir_movimiento(p_movimiento_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov     public.inventario_movimientos;
  v_par     public.inventario_movimientos;
  v_md      public.combustible_mov_datos;
  v_d       public.despachos_combustible;
  v_accion  text;
  v_hoy     date := private.hoy_aqui();
  v_fecha   date;
  v_litros  numeric;
  v_costo   numeric;
  v_destino bigint;
  v_motivo  text := nullif(btrim(coalesce(p_datos ->> 'motivo_correccion', '')), '');
  v_obs     text;
  v_nuevo   bigint;
  v_res     jsonb;
  v_mide    boolean;
  v_sin     boolean;
  v_hi      numeric;
  v_hf      numeric;
  d         jsonb := coalesce(p_datos, '{}'::jsonb);
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');

  if jsonb_typeof(d) <> 'object' then
    raise exception 'La corrección no se entiende.' using errcode = '22023';
  end if;

  select m.* into v_mov
    from public.inventario_movimientos m
    join public.almacenes a on a.id = m.almacen_id and a.tipo = 'COMBUSTIBLE'
   where m.id = p_movimiento_id;
  if v_mov.id is null then
    raise exception 'Ese movimiento no es de un tanque de combustible.' using errcode = 'P0002';
  end if;
  if v_mov.tipo = 'REVERSO' then
    raise exception 'Un reverso no se corrige.' using errcode = '22023';
  end if;
  if private.combustible_anulado(v_mov.id) then
    raise exception 'El movimiento % está anulado: lo anulado no se corrige, se registra de nuevo.', v_mov.numero
      using errcode = '55000';
  end if;

  -- La entrada de un traslado se corrige desde su salida: son la misma cosa.
  if v_mov.tipo = 'TRANSFERENCIA_ENTRADA' then
    select * into v_par from public.inventario_movimientos where id = v_mov.movimiento_origen;
    if v_par.id is not null and exists (select 1 from public.almacenes a
                                         where a.id = v_par.almacen_id and a.tipo = 'COMBUSTIBLE') then
      return public.combustible_corregir_movimiento(v_par.id, p_datos);
    end if;
  elsif v_mov.tipo = 'TRANSFERENCIA_SALIDA' then
    select * into v_par from public.inventario_movimientos
     where movimiento_origen = v_mov.id and tipo = 'TRANSFERENCIA_ENTRADA';
  end if;

  v_fecha := coalesce((d ->> 'fecha')::date, v_mov.fecha);
  if v_mov.fecha <> v_hoy or v_fecha <> v_hoy then
    perform private.exigir_permiso('COMBUSTIBLE', 'TOTAL');
  end if;

  perform private.combustible_datos_de(v_mov.id);
  select * into v_md from public.combustible_mov_datos where movimiento_id = v_mov.id;

  -- Horómetro: el final no puede quedar por debajo del inicial.
  v_hi := case when d ? 'horometro_ini' then (d ->> 'horometro_ini')::numeric else v_md.horometro_ini end;
  v_hf := case when d ? 'horometro_fin' then (d ->> 'horometro_fin')::numeric else v_md.horometro_fin end;
  if v_hi is not null and v_hf is not null and v_hf < v_hi then
    raise exception 'El horómetro final (%) no puede ser menor que el inicial (%): las horas trabajadas saldrían negativas. Revisá la lectura.',
      private.cantidad_es(v_hf), private.cantidad_es(v_hi) using errcode = '22023';
  end if;

  -- ── 1. Un vale ──────────────────────────────────────────────────────────
  select * into v_d from public.despachos_combustible
   where movimiento_id = v_mov.id and anulado_en is null;

  if v_d.id is not null then
    perform public.corregir_despacho_combustible(
      v_d.id,
      coalesce((d ->> 'litros')::numeric, v_d.cantidad),
      coalesce(d ->> 'motivo', v_d.motivo),
      case when d ? 'motivo_detalle' then d ->> 'motivo_detalle' else v_d.motivo_detalle end,
      case when d ? 'maquina_id' then (d ->> 'maquina_id')::bigint else v_d.maquina_id end,
      case when d ? 'equipo' then d ->> 'equipo' else v_d.destino end,
      case when d ? 'horometro_fin' then (d ->> 'horometro_fin')::numeric else v_d.horometro end,
      case when d ? 'empleado_id' then (d ->> 'empleado_id')::bigint else v_d.empleado_id end,
      case when d ? 'recibio_nombre' then d ->> 'recibio_nombre' else v_d.recibio_nombre end,
      case when d ? 'recibio_cedula' then d ->> 'recibio_cedula' else v_d.recibio_cedula end,
      v_fecha,
      case when d ? 'observacion' then d ->> 'observacion' else v_d.nota end,
      v_motivo);

    select * into v_d from public.despachos_combustible where id = v_d.id;
    v_nuevo := v_d.movimiento_id;

    if v_nuevo <> v_mov.id then
      -- La corrección escribió una salida nueva: los datos del libro viajan con ella.
      insert into public.combustible_mov_datos
        (movimiento_id, hora, maquina_id, despacho_id, equipo, autorizado, ubicacion, observacion,
         contador_ini, contador_fin, horometro_ini, horometro_fin, km, cuaderno, cuaderno_litros)
      values
        (v_nuevo, v_d.hora, v_d.maquina_id, v_d.id,
         case when v_d.maquina_id is null then v_d.destino end,
         v_md.autorizado, v_md.ubicacion, v_md.observacion,
         v_md.contador_ini, v_md.contador_fin, v_md.horometro_ini, v_d.horometro, v_md.km,
         v_md.cuaderno, v_md.cuaderno_litros)
      on conflict (movimiento_id) do nothing;
    end if;

    update public.combustible_mov_datos
       set hora          = case when d ? 'hora' then (d ->> 'hora')::time else coalesce(hora, v_d.hora) end,
           maquina_id    = v_d.maquina_id,
           despacho_id   = v_d.id,
           equipo        = case when v_d.maquina_id is null then v_d.destino end,
           autorizado    = case when d ? 'autorizado' then nullif(btrim(d ->> 'autorizado'), '') else autorizado end,
           ubicacion     = case when d ? 'ubicacion' then nullif(btrim(d ->> 'ubicacion'), '') else ubicacion end,
           observacion   = case when d ? 'observacion' then nullif(btrim(d ->> 'observacion'), '') else observacion end,
           contador_ini  = case when d ? 'contador_ini' then (d ->> 'contador_ini')::numeric else contador_ini end,
           contador_fin  = case when d ? 'contador_fin' then (d ->> 'contador_fin')::numeric else contador_fin end,
           horometro_ini = v_hi,
           horometro_fin = v_d.horometro,
           km            = case when d ? 'km' then (d ->> 'km')::numeric else km end,
           actualizado_por = (select auth.uid()),
           actualizado_en  = now()
     where movimiento_id = v_nuevo;

    if d ? 'hora' then
      update public.despachos_combustible set hora = (d ->> 'hora')::time where id = v_d.id;
    end if;

    return jsonb_build_object('movimiento_id', v_nuevo, 'camino', 'vale');
  end if;

  v_accion := private.combustible_accion_de(v_mov.id);
  if v_accion is null then
    raise exception 'El movimiento % no nació en Combustible (%): se corrige desde donde se hizo.',
      v_mov.numero, v_mov.tipo using errcode = '55000';
  end if;
  perform private.exigir_accion(v_accion);

  -- ── 2. Cambia lo que el libro mide ──────────────────────────────────────
  v_litros  := coalesce((d ->> 'litros')::numeric, v_mov.cantidad);
  v_costo   := case when d ? 'costo_litro' then (d ->> 'costo_litro')::numeric else v_mov.costo_usd end;
  v_destino := coalesce((d ->> 'destino_id')::bigint, v_par.almacen_id, v_md.destino_almacen_id);
  v_mide    := v_litros <> v_mov.cantidad
            or v_fecha <> v_mov.fecha
            or (v_mov.tipo = 'ENTRADA_DIRECTA' and v_costo is distinct from v_mov.costo_usd)
            or (v_destino is distinct from coalesce(v_par.almacen_id, v_md.destino_almacen_id));

  if v_mide then
    if v_motivo is null or length(v_motivo) < 3 then
      raise exception 'Decí por qué se corrige: queda escrito en la anulación del movimiento viejo.' using errcode = '22023';
    end if;
    if v_mov.tipo = 'SALIDA_MERMA' and v_md.merma_de_mov_id is not null then
      raise exception 'Esta merma salió de una recepción: se corrige corrigiendo la entrada o el traslado del que sale.'
        using errcode = '55000';
    end if;

    v_obs := case when d ? 'observacion' then d ->> 'observacion' else coalesce(v_md.observacion, v_mov.nota) end;

    if v_mov.tipo = 'ENTRADA_DIRECTA' then
      v_sin := (select a.admite_sin_costo from public.almacenes a where a.id = v_mov.almacen_id);
      -- Se registra la nueva antes de anular la vieja.
      v_res := public.combustible_registrar_entrada(
        v_mov.almacen_id, v_litros,
        case when v_sin then 0 else v_costo end, v_sin,
        v_obs, null, v_fecha,
        case when d ? 'hora' then (d ->> 'hora')::time else v_md.hora end,
        (d ->> 'recibidos')::numeric, d ->> 'merma_motivo',
        case when d ? 'autorizado' then d ->> 'autorizado' else v_md.autorizado end,
        case when d ? 'ubicacion' then d ->> 'ubicacion' else v_md.ubicacion end,
        v_md.cuaderno, v_md.cuaderno_litros,
        coalesce((d ->> 'confirmado')::boolean, v_costo is not distinct from v_mov.costo_usd),
        v_mov.articulo_id);
      v_nuevo := (v_res ->> 'movimiento_id')::bigint;
      perform public.combustible_anular_movimiento(v_mov.id, 'Corrección: ' || v_motivo);

    elsif v_mov.tipo = 'ENTRADA_DEVOLUCION' then
      v_nuevo := public.combustible_registrar_retorno(
        v_mov.almacen_id, v_litros, coalesce(v_obs, v_mov.nota),
        v_md.maquina_id, v_md.equipo, v_fecha,
        case when d ? 'hora' then (d ->> 'hora')::time else v_md.hora end,
        case when d ? 'autorizado' then d ->> 'autorizado' else v_md.autorizado end,
        case when d ? 'ubicacion' then d ->> 'ubicacion' else v_md.ubicacion end,
        v_mov.articulo_id);
      perform public.combustible_anular_movimiento(v_mov.id, 'Corrección: ' || v_motivo);

    elsif v_mov.tipo = 'SALIDA_MERMA' then
      perform public.combustible_anular_movimiento(v_mov.id, 'Corrección: ' || v_motivo);
      v_nuevo := public.combustible_registrar_merma(
        v_mov.almacen_id, v_litros, coalesce(v_obs, v_mov.nota), v_fecha,
        case when d ? 'hora' then (d ->> 'hora')::time else v_md.hora end,
        case when d ? 'autorizado' then d ->> 'autorizado' else v_md.autorizado end,
        case when d ? 'ubicacion' then d ->> 'ubicacion' else v_md.ubicacion end,
        v_mov.articulo_id);

    elsif v_mov.tipo in ('TRANSFERENCIA_SALIDA', 'SALIDA_CONSUMO') then
      if v_destino is null then
        raise exception 'Para corregir este movimiento hay que decir a qué tanque va.' using errcode = '22023';
      end if;
      perform public.combustible_anular_movimiento(v_mov.id, 'Corrección: ' || v_motivo);
      v_res := public.combustible_trasladar(
        v_mov.almacen_id, v_destino, v_litros,
        case when d ? 'observacion' then d ->> 'observacion' else v_md.observacion end,
        v_fecha,
        case when d ? 'hora' then (d ->> 'hora')::time else v_md.hora end,
        case when d ? 'autorizado' then d ->> 'autorizado' else v_md.autorizado end,
        case when d ? 'ubicacion' then d ->> 'ubicacion' else v_md.ubicacion end,
        case when d ? 'contador_ini' then (d ->> 'contador_ini')::numeric else v_md.contador_ini end,
        case when d ? 'contador_fin' then (d ->> 'contador_fin')::numeric
             when v_litros <> v_mov.cantidad then null else v_md.contador_fin end,
        (d ->> 'recibidos')::numeric, d ->> 'merma_motivo',
        v_md.cuaderno, v_md.cuaderno_litros,
        v_mov.articulo_id, v_mov.propietario);
      v_nuevo := (v_res ->> 'salida_id')::bigint;

    else
      raise exception 'El movimiento % no se corrige desde aquí.', v_mov.numero using errcode = '55000';
    end if;

    return jsonb_build_object('movimiento_id', v_nuevo, 'camino', 'reverso');
  end if;

  -- ── 3. Solo los datos ───────────────────────────────────────────────────
  update public.combustible_mov_datos
     set hora          = case when d ? 'hora' then (d ->> 'hora')::time else hora end,
         autorizado    = case when d ? 'autorizado' then nullif(btrim(d ->> 'autorizado'), '') else autorizado end,
         ubicacion     = case when d ? 'ubicacion' then nullif(btrim(d ->> 'ubicacion'), '') else ubicacion end,
         observacion   = case when d ? 'observacion' then nullif(btrim(d ->> 'observacion'), '') else observacion end,
         contador_ini  = case when d ? 'contador_ini' then (d ->> 'contador_ini')::numeric else contador_ini end,
         contador_fin  = case when d ? 'contador_fin' then (d ->> 'contador_fin')::numeric else contador_fin end,
         horometro_ini = v_hi,
         horometro_fin = v_hf,
         km            = case when d ? 'km' then (d ->> 'km')::numeric else km end,
         maquina_id    = case when d ? 'maquina_id' and v_mov.tipo = 'ENTRADA_DEVOLUCION'
                              then (d ->> 'maquina_id')::bigint else maquina_id end,
         equipo        = case when d ? 'equipo' and v_mov.tipo = 'ENTRADA_DEVOLUCION'
                              then nullif(btrim(d ->> 'equipo'), '') else equipo end,
         actualizado_por = (select auth.uid()),
         actualizado_en  = now()
   where movimiento_id = v_mov.id;

  -- Lo compartido de un traslado pasa a la otra pata.
  if v_par.id is not null then
    perform private.combustible_datos_de(v_par.id);
    update public.combustible_mov_datos
       set hora       = case when d ? 'hora' then (d ->> 'hora')::time else hora end,
           autorizado = case when d ? 'autorizado' then nullif(btrim(d ->> 'autorizado'), '') else autorizado end,
           ubicacion  = case when d ? 'ubicacion' then nullif(btrim(d ->> 'ubicacion'), '') else ubicacion end,
           actualizado_por = (select auth.uid()),
           actualizado_en  = now()
     where movimiento_id = v_par.id;
  end if;

  return jsonb_build_object('movimiento_id', v_mov.id, 'camino', 'datos');
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Permisos de las funciones
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  f text;
begin
  foreach f in array array[
    'private.combustible_datos_de(bigint)',
    'private.combustible_accion_de(bigint)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  foreach f in array array[
    'public.combustible_trasladar(bigint, bigint, numeric, text, date, time, text, text, numeric, numeric, numeric, text, boolean, numeric, bigint, text)',
    'public.combustible_registrar_merma(bigint, numeric, text, date, time, text, text, bigint)',
    'public.combustible_registrar_retorno(bigint, numeric, text, bigint, text, date, time, text, text, bigint)',
    'public.combustible_marcar_cuaderno(bigint, boolean, numeric)',
    'public.combustible_corregir_movimiento(bigint, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Comprobación (solo lectura)
-- ═══════════════════════════════════════════════════════════════════════════

do $comprobar$
declare
  v_admin uuid;
  v_txt   text;
  v_libro bigint;
  v_movs  bigint;
  v_vales bigint;
  v_vista bigint;
begin
  select ur.usuario_id into v_admin
    from public.usuarios_roles ur join public.perfiles p on p.id = ur.usuario_id
   where ur.rol = 'ADMIN' and p.activo order by ur.usuario_id limit 1;

  select count(*) into v_movs
    from public.inventario_movimientos m join public.almacenes a on a.id = m.almacen_id and a.tipo = 'COMBUSTIBLE';
  select count(*) into v_vales from public.despachos_combustible;
  select count(*) into v_vista from public.v_despachos_combustible;
  if v_vista <> v_vales then
    raise exception 'v_despachos_combustible enseña % vales y hay %.', v_vista, v_vales;
  end if;

  if v_admin is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    select count(*) into v_libro from public.v_combustible_libro;
    if v_libro <> v_movs then
      raise exception 'El libro de combustible tiene % renglones y hay % movimientos en los tanques.', v_libro, v_movs;
    end if;

    select string_agg(format('%s: libro %s, existencias %s', x.almacen_id, x.libro, x.exist), '; ') into v_txt
      from (select coalesce(l.tanque_id, e.almacen_id) as almacen_id,
                   coalesce(l.litros, 0) as libro, coalesce(e.litros, 0) as exist
              from (select tanque_id, articulo_id, sum(signo * litros) as litros
                      from public.v_combustible_libro group by 1, 2) l
              full join (select ve.almacen_id, ve.articulo_id, ve.existencia as litros
                           from public.v_existencias ve where ve.almacen_tipo = 'COMBUSTIBLE') e
                on e.almacen_id = l.tanque_id and e.articulo_id = l.articulo_id) x
     where x.libro <> x.exist;
    if v_txt is not null then
      raise exception 'El libro de combustible no cuadra con las existencias: %.', v_txt;
    end if;

    if exists (select 1 from public.almacenes where codigo = 'CMB-INI')
       and exists (select 1 from public.despachos_combustible) then
      if v_libro < 208 then
        raise exception 'El libro de combustible tiene % renglones; eran 208 el 09/11/2026.', v_libro;
      end if;
      if v_vista < 200 then
        raise exception 'Se ven % vales; eran 200 el 09/11/2026.', v_vista;
      end if;
    end if;

    perform set_config('request.jwt.claims', '', true);
  end if;
end
$comprobar$;
