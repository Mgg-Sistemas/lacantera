/*
  COMBUSTIBLE COMO GOLDEN TOUCH · FASE 2a: SURTIR, METER Y ANULAR (10/11/2026)

  Las puertas del uso (surtir a un equipo) y de la entrada, con lo que Golden
  Touch anota de más, y la anulación de cualquier movimiento del libro.

  EL VALE NO CAMBIA

  `despachar_combustible` conserva su firma y cada uno de sus mensajes. Su
  cuerpo pasa entero a `private.despachar_combustible_nucleo`, que es el mismo
  con UNA puerta más: un VEHÍCULO puede surtirse con el kilometraje en vez del
  horómetro (decisión de la dueña). Sin kilometraje, el núcleo hace exactamente
  lo de siempre. Las cuatro reglas de La Cantera siguen en pie para los dos
  caminos: tres vales al día por máquina, horómetro obligatorio que no
  retrocede, quién recibió y para qué se surtió.

  Lo nuevo:
    · private.despachar_combustible_nucleo  (el cuerpo del vale, + kilometraje)
    · combustible_registrar_uso             (el vale + hora, autorizado,
                                             destino, contador, horómetro
                                             inicial, km y cuaderno)
    · combustible_registrar_entrada         (la carga al tanque; si se anota lo
                                             que llegó, la merma queda ligada)
    · combustible_anular_movimiento         (anular = REVERSO con motivo;
                                             el libro no se borra)
    · combustible_lectura_vigente           (horómetro y km vigentes)
    · combustible_ultimo_contador           (el contador del surtidor)
    · private.exigir_escribir_carga         (las fotos del libro, además de
                                             las del vale)

  Las funciones `private` que ya existían se redefinen con CREATE OR REPLACE y
  conservan su ACL; los ayudantes `private` nuevos no se llaman desde fuera.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Ayudantes
-- ═══════════════════════════════════════════════════════════════════════════

-- Qué combustible se mueve en un tanque cuando la pantalla no lo dice: el que
-- tiene saldo; si no hay ninguno con saldo, el último que pasó por él; y si el
-- tanque es nuevo, el combustible del catálogo de menor id.
create or replace function private.combustible_articulo_del_tanque(p_almacen bigint)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids bigint[];
  v_id  bigint;
begin
  -- Solo combustibles: la misma pregunta sirve para el «Pasar al tanque» desde
  -- un almacén que guarda de todo.
  select array_agg(t.articulo_id order by t.articulo_id) into v_ids
    from (select m.articulo_id
            from public.inventario_movimientos m
            join public.articulos ar on ar.id = m.articulo_id and ar.categoria = 'COMBUSTIBLE'
           where m.almacen_id = p_almacen
           group by m.articulo_id
          having sum(m.cantidad * m.signo) > 0) t;

  if coalesce(array_length(v_ids, 1), 0) > 1 then
    raise exception 'En «%» hay más de un combustible: hay que decir cuál.',
      (select nombre from public.almacenes where id = p_almacen)
      using errcode = '22023';
  end if;
  if coalesce(array_length(v_ids, 1), 0) = 1 then
    return v_ids[1];
  end if;

  select m.articulo_id into v_id
    from public.inventario_movimientos m
    join public.articulos ar on ar.id = m.articulo_id and ar.categoria = 'COMBUSTIBLE'
   where m.almacen_id = p_almacen
   order by m.id desc
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select a.id into v_id
    from public.articulos a
   where a.categoria = 'COMBUSTIBLE' and a.activo
   order by a.id
   limit 1;
  if v_id is null then
    raise exception 'No hay ningún combustible en el catálogo de artículos.' using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

-- ¿Ese movimiento ya tiene su reverso?
create or replace function private.combustible_anulado(p_mov bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.inventario_movimientos r
                  where r.movimiento_origen = p_mov and r.tipo = 'REVERSO');
$$;

/*
  EL HORÓMETRO VIGENTE DE UNA MÁQUINA: la lectura más alta de las tres fuentes
  —los vales, los datos del libro y las lecturas de Maquinaria—, sin contar lo
  anulado. El horómetro solo sube, así que la más alta es la última. Es el
  inicial (HI) del próximo surtido.
*/
create or replace function private.combustible_horometro_vigente(p_maquina bigint, p_fecha date default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(greatest(
    coalesce((select max(d.horometro) from public.despachos_combustible d
               where d.maquina_id = p_maquina and d.anulado_en is null
                 and (p_fecha is null or d.fecha <= p_fecha)), -1),
    coalesce((select max(md.horometro_fin) from public.combustible_mov_datos md
                join public.inventario_movimientos m on m.id = md.movimiento_id
               where md.maquina_id = p_maquina
                 and (p_fecha is null or m.fecha <= p_fecha)
                 and not private.combustible_anulado(m.id)), -1),
    coalesce((select max(l.final) from public.horometro_lecturas l
               where l.maquina_id = p_maquina and (p_fecha is null or l.fecha <= p_fecha)), -1)
  ), -1);
$$;

create or replace function private.combustible_km_vigente(p_maquina bigint, p_fecha date default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select max(md.km)
    from public.combustible_mov_datos md
    join public.inventario_movimientos m on m.id = md.movimiento_id
   where md.maquina_id = p_maquina and md.km is not null
     and (p_fecha is null or m.fecha <= p_fecha)
     and not private.combustible_anulado(m.id);
$$;

/*
  EL CONTADOR DEL SURTIDOR DE UN TANQUE: el mayor contador final de lo que salió
  por su manguera (surtidos y traslados). Es un totalizador que solo sube: el
  más alto es el último, aunque alguien cargue tarde un surtido viejo. La
  entrada que refleja un traslado trae el contador del tanque de ORIGEN y no
  cuenta aquí.
*/
create or replace function private.combustible_contador_vigente(p_almacen bigint)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select max(md.contador_fin)
    from public.combustible_mov_datos md
    join public.inventario_movimientos m on m.id = md.movimiento_id
   where m.almacen_id = p_almacen
     and md.contador_fin is not null
     and m.tipo in ('SALIDA_CONSUMO', 'TRANSFERENCIA_SALIDA')
     and not private.combustible_anulado(m.id);
$$;

/*
  LA MERMA DE UNA RECEPCIÓN (Golden Touch, mermaRecepcion.ts).

  En una entrada o un traslado se puede anotar cuánto llegó de verdad. La
  diferencia con lo enviado es la merma. El margen del tanque es un CONTROL, no
  una resta automática: si no se anota lo recibido, no hay merma.
*/
create or replace function private.combustible_merma_recepcion(
  p_enviados numeric, p_recibidos numeric, p_margen numeric,
  out o_merma numeric, out o_pct numeric, out o_excede boolean)
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_recibidos is null then
    return;
  end if;
  if coalesce(p_enviados, 0) <= 0 then
    raise exception 'Para anotar lo recibido, los litros enviados tienen que ser mayores que 0.' using errcode = '22023';
  end if;
  if p_recibidos < 0 then
    raise exception 'Los litros recibidos no pueden ser negativos.' using errcode = '22023';
  end if;
  if p_recibidos > p_enviados then
    raise exception 'No pueden llegar más litros (%) de los que se enviaron (%). Revisá la medición.',
      private.cantidad_es(p_recibidos), private.cantidad_es(p_enviados) using errcode = '22023';
  end if;
  o_merma  := round(p_enviados - p_recibidos, 2);
  o_pct    := round(o_merma / p_enviados * 100, 2);
  o_excede := o_pct > coalesce(p_margen, 10);
end;
$$;

-- Si la merma pasa el margen: motivo escrito y la acción para guardarla. Se
-- revisa ANTES de tocar el libro.
create or replace function private.combustible_exigir_merma(
  p_almacen bigint, p_pct numeric, p_excede boolean, p_motivo text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_margen numeric;
  v_nombre text;
begin
  if not coalesce(p_excede, false) then
    return;
  end if;
  select coalesce(t.margen_merma_pct, 10), a.nombre into v_margen, v_nombre
    from public.almacenes a left join public.combustible_tanques t on t.almacen_id = a.id
   where a.id = p_almacen;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    -- El «%» va pegado al número y no en el formato: en RAISE, «%%%» se lee
    -- como un «%» suelto seguido del número.
    raise exception 'La merma es % de lo enviado y pasa el margen de % de %: indicá el motivo.',
      private.numero_es(p_pct, 2) || '%', private.numero_es(v_margen, 2) || '%', v_nombre
      using errcode = '23514';
  end if;
  perform private.exigir_accion('COMBUSTIBLE.MERMA_FUERA_DE_MARGEN');
end;
$$;

/*
  ESCRIBE LA MERMA DE RECEPCIÓN, ligada a su entrada o su traslado, en el
  tanque que recibió y a su costo vigente (ya con lo que acaba de entrar). Si
  pasa el margen, avisa a la administración.
*/
create or replace function private.combustible_escribir_merma_de(
  p_de_mov bigint, p_almacen bigint, p_articulo bigint,
  p_merma numeric, p_pct numeric, p_excede boolean, p_motivo text,
  p_origen text, p_ref text, p_fecha date, p_hora time,
  p_autorizado text, p_ubicacion text, p_propietario text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov    bigint;
  v_costo  numeric;
  v_obs    text;
  v_nombre text;
  v_margen numeric;
begin
  if coalesce(p_merma, 0) <= 0 then
    return null;
  end if;

  select a.nombre, coalesce(t.margen_merma_pct, 10) into v_nombre, v_margen
    from public.almacenes a left join public.combustible_tanques t on t.almacen_id = a.id
   where a.id = p_almacen;

  v_obs := format('%s%s %s · %s%% de lo enviado%s',
    case when p_excede then '⚠ ' else '' end,
    case when p_origen = 'entrada' then 'Merma de la entrada' else 'Merma del traslado' end,
    p_ref, private.numero_es(p_pct, 2),
    case when nullif(btrim(coalesce(p_motivo, '')), '') is not null then ' · ' || btrim(p_motivo) else '' end);

  perform private.existencia_para_escribir(p_almacen, p_articulo, p_propietario);
  v_costo := private.costo_promedio(p_almacen, p_articulo, p_propietario);

  v_mov := private.registrar_movimiento(
    'SALIDA_MERMA', -1, p_almacen, p_articulo, p_merma, v_costo, v_obs,
    null, null, null, p_fecha, p_propietario => p_propietario);

  insert into public.combustible_mov_datos
    (movimiento_id, hora, autorizado, ubicacion, observacion,
     merma_de_mov_id, merma_motivo, merma_fuera_de_margen)
  values
    (v_mov, p_hora, nullif(btrim(coalesce(p_autorizado, '')), ''),
     nullif(btrim(coalesce(p_ubicacion, '')), ''), v_obs,
     p_de_mov, nullif(btrim(coalesce(p_motivo, '')), ''), coalesce(p_excede, false));

  if p_excede then
    perform private.notificar('COMBUSTIBLE', 'MERMA_FUERA_DE_MARGEN',
      format('Merma sobre el margen en %s', v_nombre),
      format('%s L (%s%%) en %s %s. Margen: %s%%. Motivo: %s.',
             private.cantidad_es(p_merma), private.numero_es(p_pct, 2),
             case when p_origen = 'entrada' then 'la entrada' else 'el traslado' end, p_ref,
             private.numero_es(v_margen, 2), coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), '—')),
      '/app/combustible', array['ADMIN'], 'ATENCION');
  end if;

  return v_mov;
end;
$$;

-- El tanque como lo piden todas las puertas: que exista, que sea de
-- combustible y, si se va a escribir en él, que esté activo.
create or replace function private.combustible_tanque(p_almacen bigint, p_para_escribir boolean default true)
returns public.almacenes
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.almacenes;
begin
  select * into v from public.almacenes where id = p_almacen;
  if v.id is null then
    raise exception 'No existe el tanque %.', p_almacen using errcode = 'P0002';
  end if;
  if v.tipo <> 'COMBUSTIBLE' then
    raise exception '«%» no es un tanque de combustible: es de tipo %.', v.nombre, v.tipo using errcode = '22023';
  end if;
  if p_para_escribir and not v.activo then
    raise exception 'El tanque «%» está desactivado.', v.nombre using errcode = '22023';
  end if;
  return v;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. El vale: núcleo y puerta de siempre
-- ═══════════════════════════════════════════════════════════════════════════

/*
  EL CUERPO DE `despachar_combustible`, TAL CUAL (leído con pg_get_functiondef
  el 09/11/2026), con dos agregados que solo actúan si llega `p_km`:

    · Un VEHÍCULO (maquinaria.clase = 'VEHICULO') con kilometraje no necesita
      horómetro. Una máquina o un equipo lo sigue necesitando.
    · El kilometraje tampoco retrocede.

  Sin `p_km` las reglas, el orden en que se revisan y los mensajes son los de
  siempre.
*/
create or replace function private.despachar_combustible_nucleo(
  p_articulo_id bigint, p_almacen_id bigint, p_cantidad numeric, p_motivo text,
  p_motivo_detalle text default null, p_maquina_id bigint default null, p_destino text default null,
  p_horometro numeric default null, p_empleado_id bigint default null, p_recibio_nombre text default null,
  p_recibio_cedula text default null, p_fecha date default null, p_nota text default null,
  p_propietario text default null, p_km numeric default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_vales_dia constant integer := 3;
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Caracas')::date);
  v_hoy date := (now() at time zone 'America/Caracas')::date;
  v_art record; v_maq record; v_alm record; v_comb record;
  v_hay numeric; v_unitario numeric; v_costo numeric;
  v_ultimo numeric; v_lectura numeric; v_tope numeric; v_vales integer;
  v_recibe text; v_cedula text; v_surtio text; v_detalle text;
  v_mov bigint; v_id bigint; v_donde text; v_dueno text;
  v_km_tope numeric;
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if v_fecha > v_hoy then
    raise exception 'No se despacha combustible con fecha futura.' using errcode = '22023';
  end if;

  v_detalle := private.motivo_del_vale(p_motivo, p_motivo_detalle);

  select * into v_art from public.articulos where id = p_articulo_id;
  if v_art.id is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;
  if v_art.categoria <> 'COMBUSTIBLE' then
    raise exception '"%" no es combustible.', v_art.nombre using errcode = '22023';
  end if;

  select * into v_alm from public.almacenes where id = p_almacen_id;
  if v_alm.id is null then
    raise exception 'No existe el almacén %.', p_almacen_id using errcode = 'P0002';
  end if;
  if v_alm.tipo <> 'COMBUSTIBLE' then
    raise exception 'El combustible sale del tanque, no de "%". Ese almacén es de tipo %.', v_alm.nombre, v_alm.tipo
      using errcode = '22023', hint = 'Si el gasoil está cargado en otro almacén, transfiéralo primero al tanque.';
  end if;

  if p_maquina_id is not null then
    select * into v_maq from public.maquinaria where id = p_maquina_id;
    if v_maq.id is null then
      raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
    end if;
    v_donde := v_maq.nombre;

    if v_maq.capacidad_combustible is not null and p_cantidad > v_maq.capacidad_combustible then
      raise exception 'Al tanque de "%" le caben % %, y se estan despachando %.',
        v_maq.nombre, v_maq.capacidad_combustible, v_art.unidad, p_cantidad
        using errcode = '22023',
              hint = 'Si el combustible va a un envase aparte, regístrelo como otro vale sin ficha de maquina.';
    end if;

    if v_maq.combustible_id is not null and v_maq.combustible_id <> p_articulo_id then
      select nombre into v_comb from public.articulos where id = v_maq.combustible_id;
      raise exception '"%" usa % y se le está echando %.', v_maq.nombre,
        coalesce(v_comb.nombre, 'otro combustible'), v_art.nombre
        using errcode = '22023', hint = 'Si la ficha de la máquina está equivocada, corríjala en Maquinaria.';
    end if;

    -- TRES VALES AL DÍA, POR MÁQUINA (2 de septiembre de 2026): para que nadie
    -- cargue el mismo tanque cuatro veces sin que se note. Solo cuenta cuando
    -- el vale va a una máquina, y los anulados no cuentan.
    select count(*) into v_vales from public.despachos_combustible d
     where d.maquina_id = p_maquina_id and d.fecha = v_fecha and d.anulado_en is null;

    if v_vales >= c_max_vales_dia then
      raise exception 'A "%" ya se le surtió % veces el %. El máximo son % al día.',
        v_maq.nombre, v_vales, to_char(v_fecha, 'DD/MM/YYYY'), c_max_vales_dia
        using errcode = '22023',
              hint = 'Si de verdad hizo falta más, hay que revisar por qué esa máquina está consumiendo así.';
    end if;

    -- EL HORÓMETRO ES OBLIGATORIO SI HAY MÁQUINA. Desde el 10/11/2026 un
    -- vehículo puede traer el kilometraje en su lugar: lleva odómetro, no
    -- horómetro, y exigírselo lo trababa.
    if p_horometro is null and not (v_maq.clase = 'VEHICULO' and p_km is not null) then
      raise exception 'Hace falta el horómetro de "%" para surtirla.', v_maq.nombre
        using errcode = '23514',
              hint = 'Es la lectura del tablero al echarle. No reinicia nada: queda anotada en el vale.';
    end if;
  else
    if length(btrim(coalesce(p_destino, ''))) < 3 then
      raise exception 'Hay que decir a qué se le echó.' using errcode = '23514';
    end if;
    v_donde := btrim(p_destino);
  end if;

  if p_empleado_id is not null then
    select btrim(e.nombres || ' ' || e.apellidos), e.cedula into v_recibe, v_cedula
      from public.empleados e where e.id = p_empleado_id;
    if v_recibe is null then
      raise exception 'No existe el empleado %.', p_empleado_id using errcode = 'P0002';
    end if;
  else
    v_recibe := btrim(coalesce(p_recibio_nombre, ''));
    v_cedula := nullif(btrim(coalesce(p_recibio_cedula, '')), '');
    if length(v_recibe) < 3 then
      raise exception 'Hay que decir quién recibió el combustible.'
        using errcode = '23514',
              hint = 'Si no es alguien de la nómina —el chofer de un fletero, por ejemplo— escriba su nombre.';
    end if;
  end if;

  select nombre into v_surtio from public.perfiles where id = (select auth.uid());

  perform pg_catalog.pg_advisory_xact_lock(p_almacen_id::int, p_articulo_id::int);
  v_dueno := private.dueno_del_saldo(p_almacen_id, p_articulo_id, p_propietario);
  v_hay := private.existencia_para_escribir(p_almacen_id, p_articulo_id, v_dueno);
  if v_hay < p_cantidad then
    raise exception 'En el tanque solo quedan % % de %.', private.cantidad_es(v_hay), v_art.unidad, v_art.nombre
      using errcode = '55000';
  end if;

  -- EL HORÓMETRO NO RETROCEDE: rechaza, igual que `registrar_lectura`. Si en
  -- el patio esto detiene más surtidos de los que evita, se vuelve a
  -- `private.notificar` cambiando este bloque y nada más.
  if p_maquina_id is not null then
    select d.horometro into v_ultimo from public.despachos_combustible d
     where d.maquina_id = p_maquina_id and d.horometro is not null and d.fecha <= v_fecha and d.anulado_en is null
     order by d.fecha desc, d.id desc limit 1;

    select l.final into v_lectura from public.horometro_lecturas l
     where l.maquina_id = p_maquina_id and l.fecha <= v_fecha
     order by l.fecha desc, l.id desc limit 1;

    v_tope := greatest(coalesce(v_ultimo, 0), coalesce(v_lectura, 0));

    if (v_ultimo is not null or v_lectura is not null) and p_horometro < v_tope then
      raise exception 'El horómetro de "%" no retrocede: lo último anotado marcaba % y se está surtiendo con %.',
        v_maq.nombre, v_tope, p_horometro
        using errcode = '22023',
              hint = 'Si el tablero se ve mal o le cambiaron el reloj, eso se corrige en Maquinaria, no aquí.';
    end if;

    -- Y EL KILOMETRAJE TAMPOCO (10/11/2026). Solo se mira si llegó.
    if p_km is not null then
      v_km_tope := private.combustible_km_vigente(p_maquina_id, v_fecha);
      if v_km_tope is not null and p_km < v_km_tope then
        raise exception 'El kilometraje de "%" no retrocede: lo último anotado marcaba % y se está surtiendo con %.',
          v_maq.nombre, v_km_tope, p_km
          using errcode = '22023',
                hint = 'Si le cambiaron el tablero, eso se corrige en Maquinaria, no aquí.';
      end if;
    end if;
  end if;

  v_unitario := private.costo_promedio(p_almacen_id, p_articulo_id, v_dueno);
  v_costo := v_unitario * p_cantidad;

  v_mov := private.registrar_movimiento(
    'SALIDA_CONSUMO', -1, p_almacen_id, p_articulo_id, p_cantidad, v_unitario,
    format('Combustible · %s · %s', v_donde, coalesce(v_detalle, p_motivo)),
    null, null, null, v_fecha, p_propietario => v_dueno);

  insert into public.despachos_combustible
    (numero, fecha, hora, articulo_id, almacen_id, cantidad, motivo, motivo_detalle,
     maquina_id, destino, horometro, empleado_id, recibio_nombre, recibio_cedula,
     surtio_nombre, costo_usd, movimiento_id, nota, registrado_por)
  values
    (private.siguiente_numero('CMB'), v_fecha,
     case when v_fecha = v_hoy then (now() at time zone 'America/Caracas')::time else null end,
     p_articulo_id, p_almacen_id, p_cantidad, p_motivo, v_detalle, p_maquina_id,
     nullif(btrim(coalesce(p_destino, '')), ''), p_horometro, p_empleado_id,
     v_recibe, v_cedula, v_surtio, v_costo, v_mov,
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  if v_art.stock_minimo > 0 and (v_hay - p_cantidad) <= v_art.stock_minimo then
    perform private.notificar('COMBUSTIBLE', 'TANQUE_BAJO',
      format('Queda poco %s', v_art.nombre),
      format('Quedan %s %s, y el mínimo son %s.', private.cantidad_es(v_hay - p_cantidad), v_art.unidad, private.cantidad_es(v_art.stock_minimo)),
      '/app/combustible', array['ALMACEN', 'OPERACIONES', 'COMPRAS'], 'ATENCION');
  end if;

  return v_id;
end;
$$;

-- La puerta de siempre: misma firma, mismos errores. Conserva su ACL.
create or replace function public.despachar_combustible(
  p_articulo_id bigint, p_almacen_id bigint, p_cantidad numeric, p_motivo text,
  p_motivo_detalle text default null, p_maquina_id bigint default null, p_destino text default null,
  p_horometro numeric default null, p_empleado_id bigint default null, p_recibio_nombre text default null,
  p_recibio_cedula text default null, p_fecha date default null, p_nota text default null,
  p_propietario text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.despachar_combustible_nucleo(
    p_articulo_id, p_almacen_id, p_cantidad, p_motivo, p_motivo_detalle, p_maquina_id, p_destino,
    p_horometro, p_empleado_id, p_recibio_nombre, p_recibio_cedula, p_fecha, p_nota, p_propietario,
    null);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Surtir a un equipo (uso)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  EL SURTIDO DE GOLDEN TOUCH, CON EL VALE DE LA CANTERA.

  Emite el vale con `despachar_combustible_nucleo` (todas sus reglas) y anota lo
  que Golden Touch lleva de más en `combustible_mov_datos`:

    · Horómetro: el final (HF) es la lectura del tablero, la del vale. El
      inicial (HI), si no llega, es el vigente de la máquina. Un final menor
      que el inicial no se guarda.
    · Contador del surtidor: si no llega el inicial, el mayor final del tanque;
      si no llega el final, inicial + litros.
    · El catálogo manda: un equipo apagado («¿puede surtir?» = no) o un tanque
      que no está entre los suyos no surten.

  Devuelve {despacho_id, movimiento_id, numero}.
*/
create or replace function public.combustible_registrar_uso(
  p_almacen_id bigint,
  p_litros numeric,
  p_motivo text,
  p_motivo_detalle text default null,
  p_maquina_id bigint default null,
  p_equipo text default null,
  p_horometro_ini numeric default null,
  p_horometro_fin numeric default null,
  p_km numeric default null,
  p_empleado_id bigint default null,
  p_recibio_nombre text default null,
  p_recibio_cedula text default null,
  p_autorizado text default null,
  p_ubicacion text default null,
  p_observacion text default null,
  p_contador_ini numeric default null,
  p_contador_fin numeric default null,
  p_cuaderno boolean default false,
  p_cuaderno_litros numeric default null,
  p_fecha date default null,
  p_hora time default null,
  p_articulo_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tanque public.almacenes;
  v_art    bigint;
  v_cat    public.combustible_catalogos;
  v_nombre text;
  v_hi     numeric := p_horometro_ini;
  v_ci     numeric := p_contador_ini;
  v_cf     numeric := p_contador_fin;
  v_fecha  date := coalesce(p_fecha, private.hoy_aqui());
  v_id     bigint;
  v_d      public.despachos_combustible;
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');

  v_tanque := private.combustible_tanque(p_almacen_id);
  v_art := coalesce(p_articulo_id, private.combustible_articulo_del_tanque(p_almacen_id));

  -- El catálogo: ¿este equipo puede surtir, y de este tanque?
  if p_maquina_id is not null then
    select * into v_cat from public.combustible_catalogos where maquina_id = p_maquina_id;
    v_nombre := coalesce(v_cat.valor, (select nombre from public.maquinaria where id = p_maquina_id));
  elsif nullif(btrim(coalesce(p_equipo, '')), '') is not null then
    select * into v_cat from public.combustible_catalogos
     where tipo = 'equipo' and maquina_id is null
       and private.en_mayuscula(btrim(valor)) = private.en_mayuscula(btrim(p_equipo));
    v_nombre := btrim(p_equipo);
  end if;

  if v_cat.id is not null then
    if not v_cat.activo then
      raise exception '«%» no puede surtir: está apagado en los catálogos de combustible.', v_nombre
        using errcode = '22023', hint = 'Quien lleva los catálogos lo enciende en «¿Puede surtir?».';
    end if;
    if coalesce(cardinality(v_cat.tanques_permitidos), 0) > 0
       and not (p_almacen_id = any (v_cat.tanques_permitidos)) then
      raise exception '«%» no surte de «%». Puede surtir de: %.', v_nombre, v_tanque.nombre,
        (select string_agg(a.nombre, ', ' order by a.nombre) from public.almacenes a
          where a.id = any (v_cat.tanques_permitidos))
        using errcode = '22023';
    end if;
  end if;

  -- Horómetro inicial: el vigente de la máquina, si no llegó.
  if p_maquina_id is not null and v_hi is null then
    v_hi := private.combustible_horometro_vigente(p_maquina_id, v_fecha);
  end if;
  if v_hi is not null and p_horometro_fin is not null and p_horometro_fin < v_hi then
    raise exception 'El horómetro final (%) no puede ser menor que el inicial (%): las horas trabajadas saldrían negativas. Revisá la lectura.',
      private.cantidad_es(p_horometro_fin), private.cantidad_es(v_hi) using errcode = '22023';
  end if;

  -- Contador del surtidor.
  if v_ci is null then
    v_ci := private.combustible_contador_vigente(p_almacen_id);
  end if;
  if v_cf is null and v_ci is not null and coalesce(p_litros, 0) > 0 then
    v_cf := round(v_ci + p_litros, 2);
  end if;

  v_id := private.despachar_combustible_nucleo(
    v_art, p_almacen_id, p_litros, p_motivo, p_motivo_detalle, p_maquina_id,
    case when p_maquina_id is null then p_equipo end,
    p_horometro_fin, p_empleado_id, p_recibio_nombre, p_recibio_cedula, p_fecha,
    p_observacion, null, p_km);

  if p_hora is not null then
    update public.despachos_combustible set hora = p_hora where id = v_id;
  end if;

  select * into v_d from public.despachos_combustible where id = v_id;

  insert into public.combustible_mov_datos
    (movimiento_id, hora, maquina_id, despacho_id, equipo, autorizado, ubicacion, observacion,
     contador_ini, contador_fin, horometro_ini, horometro_fin, km, cuaderno, cuaderno_litros)
  values
    (v_d.movimiento_id, v_d.hora, p_maquina_id, v_id,
     case when p_maquina_id is null then nullif(btrim(coalesce(p_equipo, '')), '') end,
     nullif(btrim(coalesce(p_autorizado, '')), ''),
     nullif(btrim(coalesce(p_ubicacion, '')), ''),
     nullif(btrim(coalesce(p_observacion, '')), ''),
     v_ci, v_cf,
     case when p_maquina_id is not null then v_hi end,
     p_horometro_fin, p_km,
     coalesce(p_cuaderno, false),
     case when coalesce(p_cuaderno, false) then coalesce(p_cuaderno_litros, p_litros) end);

  return jsonb_build_object('despacho_id', v_id, 'movimiento_id', v_d.movimiento_id, 'numero', v_d.numero);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Meter combustible al tanque (entrada)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  LA ENTRADA DE GOLDEN TOUCH CON LAS REJAS DE `registrar_entrada`.

  Las reglas del costo son las de siempre (leídas con pg_get_functiondef el
  09/11/2026): en el tanque sin costo solo entra lo que no costó nada, con el
  costo en cero y la explicación entera; en los demás, el costo es obligatorio
  y si se sale diez veces del promedio hay que aceptarlo. Se copian aquí en vez
  de llamar a `registrar_entrada` porque aquella pide el rol de almacén y esta
  pide COMBUSTIBLE.ENTRADA.

  Si se anota lo que llegó (`p_recibidos`), la diferencia queda como merma
  ligada a la entrada, en el mismo tanque. Si pasa el margen del tanque hace
  falta el motivo y COMBUSTIBLE.MERMA_FUERA_DE_MARGEN, y se avisa.

  Devuelve {movimiento_id, merma_movimiento_id}.
*/
create or replace function public.combustible_registrar_entrada(
  p_almacen_id bigint,
  p_litros numeric,
  p_costo_litro numeric default null,
  p_sin_costo boolean default false,
  p_motivo text default null,
  p_referencia text default null,
  p_fecha date default null,
  p_hora time default null,
  p_recibidos numeric default null,
  p_merma_motivo text default null,
  p_autorizado text default null,
  p_ubicacion text default null,
  p_cuaderno boolean default false,
  p_cuaderno_litros numeric default null,
  p_confirmado boolean default false,
  p_articulo_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_factor constant numeric := 10;
  v_tanque public.almacenes;
  v_art    public.articulos;
  v_fecha  date := coalesce(p_fecha, private.hoy_aqui());
  v_nota   text;
  v_ref    numeric;
  v_veces  numeric;
  v_msg    text;
  v_mov    bigint;
  v_merma  record;
  v_mmov   bigint;
  v_bidon  boolean;
  v_margen numeric;
  v_hora   time;
begin
  perform private.exigir_accion('COMBUSTIBLE.ENTRADA');

  v_tanque := private.combustible_tanque(p_almacen_id);
  select coalesce(t.es_bidon, false), coalesce(t.margen_merma_pct, 10) into v_bidon, v_margen
    from public.combustible_tanques t where t.almacen_id = p_almacen_id;
  if coalesce(v_bidon, false) then
    raise exception '«%» es un bidón: no guarda combustible. Lo que se le pasa se da por usado.', v_tanque.nombre
      using errcode = '22023';
  end if;

  select * into v_art from public.articulos
   where id = coalesce(p_articulo_id, private.combustible_articulo_del_tanque(p_almacen_id));
  if v_art.id is null or not v_art.activo then
    raise exception 'Ese combustible no existe o está inactivo.' using errcode = '23503';
  end if;
  if v_art.categoria <> 'COMBUSTIBLE' then
    raise exception '"%" no es combustible.', v_art.nombre using errcode = '22023';
  end if;

  if coalesce(p_litros, 0) <= 0 then
    raise exception 'Los litros que entran tienen que ser más que cero.' using errcode = '22023';
  end if;
  if v_fecha > private.hoy_aqui() then
    raise exception 'No se registra combustible con fecha futura.' using errcode = '22023';
  end if;

  -- Las rejas del costo, como en `registrar_entrada`.
  if p_sin_costo then
    if not v_tanque.admite_sin_costo then
      raise exception 'Aquí no entra material sin costo: se hundiría el costo promedio de lo que ya hay.'
        using errcode = '22023', hint = 'Métalo en el tanque de combustible inicial, que es el que lo lleva aparte.';
    end if;
    if coalesce(p_costo_litro, 0) <> 0 then
      raise exception 'Si el combustible no costó nada para esta empresa, el costo tiene que ir en cero. Quitá la marca o poné el costo en cero.'
        using errcode = '22023';
    end if;
    if length(btrim(coalesce(p_motivo, ''))) < 15 then
      raise exception 'Una entrada sin costo hay que explicarla entera: de dónde vino y quién asumió el gasto. Dentro de un año esa nota es lo único que lo va a contestar.'
        using errcode = '22023';
    end if;
  elsif v_tanque.admite_sin_costo then
    raise exception 'A «%» solo entra lo que no costó nada. Lo que tiene precio va al tanque de siempre.', v_tanque.nombre
      using errcode = '22023';
  elsif coalesce(p_costo_litro, 0) <= 0 then
    raise exception 'Hay que decir cuánto costó el litro. Si el gasto lo asumió otra empresa del grupo, va al tanque del combustible sin costo.'
      using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Una entrada sin explicación no se puede auditar después. Escribí de dónde vino.'
      using errcode = '22023';
  end if;

  -- El aviso de las diez veces, solo cuando hay un promedio contra el que
  -- comparar. A quien no ve la valoración se le dice QUE se sale, no CUÁNTO.
  if not p_sin_costo and coalesce(p_costo_litro, 0) > 0 then
    v_ref := private.costo_promedio(p_almacen_id, v_art.id);
    if coalesce(v_ref, 0) > 0 then
      v_veces := round(p_costo_litro / v_ref, 6);
      if v_veces >= c_factor or v_veces <= (1 / c_factor) then
        if not p_confirmado then
          v_msg := case when private.puede_accion('INVENTARIO.VER_VALORACION')
            then format('En «%s» el litro viene costando %s y lo estás metiendo a %s: son %s. Si es correcto, aceptalo y quedará anotado.',
                        v_tanque.nombre, private.numero_es(v_ref, 4), private.numero_es(p_costo_litro, 4),
                        case when v_veces >= 1 then private.numero_es(v_veces, 2) || ' veces más'
                             else private.numero_es(v_ref / nullif(p_costo_litro, 0), 2) || ' veces menos' end)
            else format('El costo del litro se sale mucho de lo que viene costando en «%s». Comprobalo con la factura; si es correcto, aceptalo y quedará anotado.',
                        v_tanque.nombre)
          end;
          raise exception '%', v_msg
            using errcode = '22023',
                  hint = 'Comprobá la factura y la moneda antes de aceptar: un cero de más aquí se arrastra a cada surtido.';
        end if;
      else
        v_veces := null;
      end if;
    end if;
  end if;

  -- La merma se revisa ANTES de escribir nada.
  select * into v_merma from private.combustible_merma_recepcion(p_litros, p_recibidos, v_margen);
  if coalesce(v_merma.o_merma, 0) > 0 then
    perform private.combustible_exigir_merma(p_almacen_id, v_merma.o_pct, v_merma.o_excede, p_merma_motivo);
  end if;

  v_nota := btrim(p_motivo);
  if nullif(btrim(coalesce(p_referencia, '')), '') is not null then
    v_nota := v_nota || ' · Ref.: ' || btrim(p_referencia);
  end if;
  if p_sin_costo then
    v_nota := v_nota || ' · Sin costo para esta empresa: el gasto lo asumió otra.';
  end if;

  v_mov := private.registrar_movimiento(
    'ENTRADA_DIRECTA', 1::smallint, p_almacen_id, v_art.id, p_litros,
    case when p_sin_costo then 0 else p_costo_litro end,
    v_nota, null, null, null, v_fecha,
    p_aviso_costo => v_veces);

  v_hora := coalesce(p_hora, case when v_fecha = private.hoy_aqui()
                                  then (now() at time zone 'America/Caracas')::time end);

  insert into public.combustible_mov_datos
    (movimiento_id, hora, autorizado, ubicacion, observacion, cuaderno, cuaderno_litros)
  values
    (v_mov, v_hora,
     nullif(btrim(coalesce(p_autorizado, '')), ''),
     nullif(btrim(coalesce(p_ubicacion, '')), ''),
     btrim(p_motivo),
     coalesce(p_cuaderno, false),
     case when coalesce(p_cuaderno, false) then coalesce(p_cuaderno_litros, p_litros) end);

  if coalesce(v_merma.o_merma, 0) > 0 then
    v_mmov := private.combustible_escribir_merma_de(
      v_mov, p_almacen_id, v_art.id, v_merma.o_merma, v_merma.o_pct, v_merma.o_excede, p_merma_motivo,
      'entrada', 'del ' || to_char(v_fecha, 'DD/MM/YYYY'), v_fecha, v_hora,
      p_autorizado, p_ubicacion,
      (select m.propietario from public.inventario_movimientos m where m.id = v_mov));
  end if;

  return jsonb_build_object('movimiento_id', v_mov, 'merma_movimiento_id', v_mmov);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Anular un movimiento del libro
-- ═══════════════════════════════════════════════════════════════════════════

/*
  «🗑 ELIMINAR» DE GOLDEN TOUCH ES «ANULAR» AQUÍ.

  El libro no se borra: cada movimiento anulado recibe su REVERSO con el
  motivo, y la pantalla lo enseña tachado. Si es un vale, lo anula
  `anular_despacho_combustible` con sus reglas. Si es un traslado, se anulan
  las dos patas; y las mermas de recepción que colgaban de él se van con él.
  Primero las mermas (devuelven litros) y después lo demás: así una entrada con
  merma se puede anular aunque solo quede lo que llegó.

  Lo del día lo anula quien tiene la acción del movimiento; lo de otro día,
  además, control total en Combustible. Lo que no nació en Combustible (una
  compra, un ajuste de inventario) se deshace desde donde se hizo.

  Devuelve cuántos reversos escribió.
*/
create or replace function public.combustible_anular_movimiento(p_movimiento_id bigint, p_motivo text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov    public.inventario_movimientos;
  v_par    public.inventario_movimientos;
  v_r      public.inventario_movimientos;
  v_d      public.despachos_combustible;
  v_accion text;
  v_ids    bigint[] := '{}';
  v_n      integer := 0;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');

  if length(v_motivo) < 3 then
    raise exception 'Decí por qué se anula.' using errcode = '22023';
  end if;

  select * into v_mov from public.inventario_movimientos where id = p_movimiento_id for update;
  if v_mov.id is null then
    raise exception 'Ese movimiento no existe.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.almacenes a where a.id = v_mov.almacen_id and a.tipo = 'COMBUSTIBLE') then
    raise exception 'El movimiento % no es de un tanque de combustible.', v_mov.numero using errcode = '22023';
  end if;
  if v_mov.tipo = 'REVERSO' then
    raise exception 'Un reverso no se anula.' using errcode = '22023';
  end if;
  if private.combustible_anulado(v_mov.id) then
    raise exception 'El movimiento % ya estaba anulado.', v_mov.numero using errcode = '55000';
  end if;

  -- Un vale se anula como vale: con sus reglas.
  select * into v_d from public.despachos_combustible
   where movimiento_id = v_mov.id and anulado_en is null;
  if v_d.id is not null then
    perform public.anular_despacho_combustible(v_d.id, v_motivo);
    return 1;
  end if;

  v_accion := case
    when v_mov.tipo in ('ENTRADA_DIRECTA', 'ENTRADA_DEVOLUCION') then 'COMBUSTIBLE.ENTRADA'
    when v_mov.tipo in ('TRANSFERENCIA_SALIDA', 'TRANSFERENCIA_ENTRADA', 'SALIDA_CONSUMO') then 'COMBUSTIBLE.TRASLADO'
    when v_mov.tipo = 'SALIDA_MERMA' then
      case when exists (select 1 from public.combustible_mov_datos md
                         where md.movimiento_id = v_mov.id and md.merma_de_mov_id is not null)
           then null else 'COMBUSTIBLE.MERMA' end
  end;

  -- La merma de una recepción la anula quien puede anular la recepción.
  if v_mov.tipo = 'SALIDA_MERMA' and v_accion is null then
    v_accion := case
      when exists (select 1 from public.combustible_mov_datos md
                     join public.inventario_movimientos o on o.id = md.merma_de_mov_id
                    where md.movimiento_id = v_mov.id and o.tipo = 'ENTRADA_DIRECTA') then 'COMBUSTIBLE.ENTRADA'
      else 'COMBUSTIBLE.TRASLADO' end;
  end if;

  if v_accion is null then
    raise exception 'El movimiento % no nació en Combustible (%): se deshace desde donde se hizo.',
      v_mov.numero, v_mov.tipo
      using errcode = '55000',
            hint = 'Una compra se devuelve desde Compras; un ajuste o una baja, desde Inventario.';
  end if;

  if exists (select 1 from public.traslados t
              where v_mov.id in (t.mov_salida, t.mov_en_camino, t.mov_llegada, t.mov_vuelta)) then
    raise exception 'El movimiento % es de un traslado con número propio: se cancela desde Transferencias.', v_mov.numero
      using errcode = '55000';
  end if;

  perform private.exigir_accion(v_accion);
  if v_mov.fecha <> private.hoy_aqui() then
    perform private.exigir_permiso('COMBUSTIBLE', 'TOTAL');
  end if;

  -- La otra pata, si es un traslado.
  if v_mov.tipo = 'TRANSFERENCIA_SALIDA' then
    select * into v_par from public.inventario_movimientos
     where movimiento_origen = v_mov.id and tipo = 'TRANSFERENCIA_ENTRADA';
  elsif v_mov.tipo = 'TRANSFERENCIA_ENTRADA' then
    select * into v_par from public.inventario_movimientos
     where id = v_mov.movimiento_origen and tipo = 'TRANSFERENCIA_SALIDA';
  end if;
  if v_par.id is not null and private.combustible_anulado(v_par.id) then
    raise exception 'La otra mitad del traslado (%) ya estaba anulada.', v_par.numero using errcode = '55000';
  end if;

  -- El orden: primero las mermas que cuelgan de esto, después lo demás.
  select coalesce(array_agg(md.movimiento_id order by md.movimiento_id), '{}') into v_ids
    from public.combustible_mov_datos md
   where md.merma_de_mov_id in (v_mov.id, coalesce(v_par.id, v_mov.id))
     and not private.combustible_anulado(md.movimiento_id);

  v_ids := v_ids || v_mov.id;
  if v_par.id is not null then
    -- La pata que devuelve litros va antes que la que los saca.
    if v_par.signo < 0 then
      v_ids := array[v_par.id] || v_ids;
    else
      v_ids := v_ids || v_par.id;
    end if;
  end if;

  for v_r in
    select m.* from unnest(v_ids) with ordinality u(id, n)
      join public.inventario_movimientos m on m.id = u.id
     order by u.n
  loop
    perform private.existencia_para_escribir(v_r.almacen_id, v_r.articulo_id);
    perform private.exigir_existencia_para_reverso(v_r, p_movimiento_id);
    perform private.registrar_movimiento(
      'REVERSO', (-v_r.signo)::smallint, v_r.almacen_id, v_r.articulo_id,
      v_r.cantidad, v_r.costo_usd,
      format('Anulación de %s: %s', v_r.numero, v_motivo),
      null, null, v_r.id, private.hoy_aqui(),
      p_propietario => v_r.propietario);
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Lecturas vigentes
-- ═══════════════════════════════════════════════════════════════════════════

-- Horómetro y kilometraje vigentes de una máquina, y quién la opera (para
-- precargar «¿Quién recibió?»).
create or replace function public.combustible_lectura_vigente(p_maquina_id bigint)
returns table (horometro numeric, kilometraje numeric, operador_id bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'LECTURA');
  return query
  select private.combustible_horometro_vigente(p_maquina_id),
         private.combustible_km_vigente(p_maquina_id),
         (select m.operador_id from public.maquinaria m where m.id = p_maquina_id);
end;
$$;

-- El contador del surtidor de un tanque: donde arranca el próximo surtido.
create or replace function public.combustible_ultimo_contador(p_almacen_id bigint)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'LECTURA');
  return private.combustible_contador_vigente(p_almacen_id);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Fotos del libro
-- ═══════════════════════════════════════════════════════════════════════════

/*
  LAS FOTOS DE COMBUSTIBLE CUELGAN DEL VALE (CMB-…) O DEL MOVIMIENTO (MOV-…).

  Antes la rama COMBUSTIBLE pedía MAQUINARIA:ESCRITURA y no miraba la
  referencia. Ahora basta con escritura en Combustible —que es quien surte—, y
  quien la tenía en Maquinaria la sigue teniendo. La referencia tiene que ser un
  vale o un movimiento de un tanque. Lo demás, tal como estaba (leído con
  pg_get_functiondef el 09/11/2026). CREATE OR REPLACE conserva su ACL.
*/
create or replace function private.exigir_escribir_carga(p_origen text, p_referencia text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_origen = 'SALIDA' then
    perform private.exigir_permiso('SALIDAS', 'ESCRITURA');
    if not exists (select 1 from public.solicitudes_salida where numero = p_referencia) then
      raise exception 'La salida % no existe.', p_referencia using errcode = 'P0002';
    end if;
  elsif p_origen = 'DESPACHO' then
    perform private.exigir_permiso('FACTURACION', 'ESCRITURA');
    if not exists (select 1 from public.solicitudes_despacho where numero = p_referencia) then
      raise exception 'El despacho % no existe.', p_referencia using errcode = 'P0002';
    end if;
  elsif p_origen = 'COMBUSTIBLE' then
    if not private.tiene_permiso('MAQUINARIA', 'ESCRITURA') then
      perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');
    end if;
    if not exists (select 1 from public.despachos_combustible where numero = p_referencia)
       and not exists (select 1 from public.inventario_movimientos m
                         join public.almacenes a on a.id = m.almacen_id and a.tipo = 'COMBUSTIBLE'
                        where m.numero = p_referencia) then
      raise exception 'El vale o movimiento de combustible % no existe.', p_referencia using errcode = 'P0002';
    end if;
  elsif p_origen = 'AVERIA' then
    perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
    if not exists (select 1 from public.averias_maquinaria where numero = p_referencia) then
      raise exception 'La avería % no existe.', p_referencia using errcode = 'P0002';
    end if;
  elsif p_origen = 'MANTENIMIENTO' then
    perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
    if not exists (select 1 from public.mantenimientos where numero = p_referencia) then
      raise exception 'La orden de taller % no existe.', p_referencia using errcode = 'P0002';
    end if;
  elsif p_origen = 'GASTO' then
    perform private.exigir_permiso('GASTOS', 'ESCRITURA');
    if not exists (select 1 from public.gastos_facturas where numero = p_referencia) then
      raise exception 'El gasto % no existe.', p_referencia using errcode = 'P0002';
    end if;
  else
    raise exception 'Origen desconocido: %', p_origen using errcode = '22023';
  end if;
end;
$$;

-- Y se ven con lectura en Combustible, además de con lectura en Maquinaria.
drop policy if exists fotos_de_carga_lectura on public.fotos_de_carga;
create policy fotos_de_carga_lectura on public.fotos_de_carga
  for select to authenticated
  using (
       ((origen = 'SALIDA') and private.tiene_permiso('SALIDAS', 'LECTURA'))
    or ((origen = 'DESPACHO') and private.tiene_permiso('FACTURACION', 'LECTURA'))
    or ((origen = 'COMBUSTIBLE') and (private.tiene_permiso('MAQUINARIA', 'LECTURA')
                                      or private.tiene_permiso('COMBUSTIBLE', 'LECTURA')))
    or ((origen = 'AVERIA') and private.tiene_permiso('MAQUINARIA', 'LECTURA'))
    or ((origen = 'MANTENIMIENTO') and private.tiene_permiso('MAQUINARIA', 'LECTURA'))
    or ((origen = 'GASTO') and private.tiene_permiso('GASTOS', 'LECTURA'))
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Permisos de las funciones
-- ═══════════════════════════════════════════════════════════════════════════

-- Los ayudantes nuevos no se llaman desde fuera: los usan las funciones de
-- arriba, que corren como su dueño. Ninguno lo usa una política ni una vista.
do $$
declare
  f text;
begin
  foreach f in array array[
    'private.combustible_articulo_del_tanque(bigint)',
    'private.combustible_anulado(bigint)',
    'private.combustible_horometro_vigente(bigint, date)',
    'private.combustible_km_vigente(bigint, date)',
    'private.combustible_contador_vigente(bigint)',
    'private.combustible_merma_recepcion(numeric, numeric, numeric)',
    'private.combustible_exigir_merma(bigint, numeric, boolean, text)',
    'private.combustible_escribir_merma_de(bigint, bigint, bigint, numeric, numeric, boolean, text, text, text, date, time, text, text, text)',
    'private.combustible_tanque(bigint, boolean)',
    'private.despachar_combustible_nucleo(bigint, bigint, numeric, text, text, bigint, text, numeric, bigint, text, text, date, text, text, numeric)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  foreach f in array array[
    'public.combustible_registrar_uso(bigint, numeric, text, text, bigint, text, numeric, numeric, numeric, bigint, text, text, text, text, text, numeric, numeric, boolean, numeric, date, time, bigint)',
    'public.combustible_registrar_entrada(bigint, numeric, numeric, boolean, text, text, date, time, numeric, text, text, text, boolean, numeric, boolean, bigint)',
    'public.combustible_anular_movimiento(bigint, text)',
    'public.combustible_lectura_vigente(bigint)',
    'public.combustible_ultimo_contador(bigint)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Comprobación (solo lectura)
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
  -- La puerta de siempre sigue con la misma firma y el mismo permiso.
  if to_regprocedure('public.despachar_combustible(bigint, bigint, numeric, text, text, bigint, text, numeric, bigint, text, text, date, text, text)') is null then
    raise exception 'despachar_combustible cambió de firma.';
  end if;
  if not has_function_privilege('authenticated',
       'public.despachar_combustible(bigint, bigint, numeric, text, text, bigint, text, numeric, bigint, text, text, date, text, text)', 'execute') then
    raise exception 'despachar_combustible perdió el EXECUTE de authenticated.';
  end if;
  if has_function_privilege('authenticated', 'private.exigir_escribir_carga(text, text)', 'execute') then
    raise exception 'private.exigir_escribir_carga ganó un EXECUTE que no tenía.';
  end if;

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
