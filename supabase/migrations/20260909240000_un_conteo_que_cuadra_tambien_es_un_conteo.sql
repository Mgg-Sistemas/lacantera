/*
  UN CONTEO QUE CUADRA TAMBIÉN ES UN CONTEO.

  Lo encontró la prueba, y es un fallo de diseño mío de hace una hora.

  Christopher preguntó cómo ver que del AGROFLUIDOS lo que hay es un tambor. La
  respuesta era: cuéntalo, y desde entonces el sistema lo sabe. Al ir a probarlo:

      registrar_ajuste(... 1 TAMBOR ...)
      -> «Lo contado coincide con lo que dice el sistema (208 L).
          No hay nada que ajustar.»

  Y tiene toda la razón en negarse a escribir un ajuste de cero. El error está
  antes: yo colgué la hoja de conteo DEL AJUSTE, y entonces solo se puede anotar
  qué envases hay cuando además hay un descuadre. Al revés de lo que pasa en un
  almacén: **el conteo que cuadra es el normal**, y es justo el que sirve para
  fijar la forma.

  ═══════════════════════════════════════════════════════════════════════════
  EL CONTEO ES EL HECHO; EL AJUSTE ES UNA CONSECUENCIA QUE A VECES OCURRE
  ═══════════════════════════════════════════════════════════════════════════

  Ese era el modelo equivocado. Contar es una cosa que se hace: alguien recorrió
  el estante un día y anotó lo que vio. Que además haya que mover el libro es una
  consecuencia, y solo cuando lo contado y lo escrito no coinciden.

  Así que el conteo pasa a tener cabecera propia —`public.conteos`— y el
  movimiento de ajuste cuelga de ella cuando hace falta, y no al revés.

  Se guarda la existencia que decía el libro en ese momento, aunque se pueda
  recalcular: dentro de un año, «contó 208 y el sistema decía 208» es una frase
  que se sostiene sola. Recalcularla obligaría a rehacer el libro entero hasta esa
  fecha para leer una línea.

  ═══════════════════════════════════════════════════════════════════════════
  LO QUE NO CAMBIA
  ═══════════════════════════════════════════════════════════════════════════

  `registrar_ajuste` conserva nombre y firma: la llama la pantalla y el nombre
  sigue siendo verdad las veces que hay descuadre. Lo que cambia es que ya no se
  niega cuando cuadra —anota el conteo y no escribe movimiento— y que devuelve
  nulo en ese caso, porque no hay asiento que devolver.

  `conteo_envases` se repuebla desde cero sin perder nada: tiene cero filas en
  producción, porque se creó hace una hora y no ha llegado a usarse.
*/

-- ---------------------------------------------------------------------------
-- 1. El conteo, con cabecera propia
-- ---------------------------------------------------------------------------
create table if not exists public.conteos (
  id                bigserial primary key,
  almacen_id        bigint not null references public.almacenes(id),
  articulo_id       bigint not null references public.articulos(id),
  fecha             date not null default private.hoy_aqui(),
  /* Lo que se contó y lo que decía el libro, los dos en la unidad de operación. */
  contado           numeric not null,
  existencia_antes  numeric not null,
  /* El asiento que hizo falta para cuadrar. Nulo cuando el conteo cuadró, que
     es el caso normal y el que antes no se podía anotar. */
  movimiento_id     bigint references public.inventario_movimientos(id),
  motivo            text not null,
  registrado_por    uuid references auth.users(id),
  registrado_en     timestamptz not null default now(),
  constraint conteos_contado_no_negativo check (contado >= 0)
);

comment on table public.conteos is
  'Cada vez que alguien recorrio el estante y anoto lo que vio. El CONTEO es el hecho; el ajuste del libro es una consecuencia que solo ocurre cuando lo contado y lo escrito no coinciden, y por eso `movimiento_id` es nulo en el caso normal. Antes la hoja de conteo colgaba del ajuste, y con eso un conteo que cuadraba —el mas frecuente— no se podia anotar: se descubrio al intentar fijar que del AGROFLUIDOS hay un tambor. Se guarda `existencia_antes` aunque se pueda recalcular: «conto 208 y el sistema decia 208» tiene que poder leerse sin rehacer el libro entero hasta esa fecha.';

create index if not exists conteos_donde
  on public.conteos (almacen_id, articulo_id, id desc);

alter table public.conteos enable row level security;

drop policy if exists conteos_lectura on public.conteos;
create policy conteos_lectura on public.conteos
  for select to authenticated
  using (private.tiene_permiso('INVENTARIO', 'LECTURA'));

revoke insert, update, delete on public.conteos from authenticated;
grant select on public.conteos to authenticated;

drop trigger if exists trg_auditar on public.conteos;
create trigger trg_auditar
  after insert or update or delete on public.conteos
  for each row execute function private.auditar('id');

drop trigger if exists trg_normalizar on public.conteos;
create trigger trg_normalizar
  before insert or update on public.conteos
  for each row execute function private.normalizar_texto('motivo');

-- ---------------------------------------------------------------------------
-- 2. La hoja cuelga del conteo, no del ajuste
-- ---------------------------------------------------------------------------
/*
  Se rehace la tabla en vez de parchearla: tiene cero filas —se creo hace una
  hora y no llego a usarse— y dejarle las dos claves, la vieja y la nueva, seria
  arrastrar para siempre la duda de cual manda.
*/
drop table if exists public.conteo_envases;

create table public.conteo_envases (
  id           bigserial primary key,
  conteo_id    bigint not null references public.conteos(id) on delete cascade,
  presentacion text   not null references public.presentaciones(codigo),
  cantidad     numeric not null,
  constraint conteo_envases_cantidad_entera
    check (cantidad > 0 and cantidad = trunc(cantidad)),
  constraint conteo_envases_una_por_envase unique (conteo_id, presentacion)
);

comment on table public.conteo_envases is
  'Los envases que se vieron en un conteo, uno por fila. Cuelga del CONTEO y no del ajuste, porque un conteo que cuadra no genera ajuste y es justamente el que sirve para fijar que lo que hay es un tambor. Es la hoja de conteo: no es una segunda verdad sobre la cantidad —esa sigue siendo la del libro, en la unidad de operacion— sino el unico momento en que alguien sabe de verdad cuantos envases hay, porque los tiene delante.';

create index if not exists conteo_envases_conteo on public.conteo_envases (conteo_id);

alter table public.conteo_envases enable row level security;

drop policy if exists conteo_envases_lectura on public.conteo_envases;
create policy conteo_envases_lectura on public.conteo_envases
  for select to authenticated
  using (private.tiene_permiso('INVENTARIO', 'LECTURA'));

revoke insert, update, delete on public.conteo_envases from authenticated;
grant select on public.conteo_envases to authenticated;

drop trigger if exists trg_auditar on public.conteo_envases;
create trigger trg_auditar
  after insert or update or delete on public.conteo_envases
  for each row execute function private.auditar('conteo_id');

-- ---------------------------------------------------------------------------
-- 3. La puerta deja de negarse cuando cuadra
-- ---------------------------------------------------------------------------
create or replace function public.registrar_ajuste(
  p_almacen_id     bigint,
  p_articulo_id    bigint,
  p_contado        numeric,
  p_motivo         text,
  p_fecha          date default null,
  p_presentaciones numeric default null,
  p_presentacion   text default null,
  p_envases        jsonb default null
)
returns bigint language plpgsql security definer set search_path to ''
as $function$
declare
  v_existencia numeric;
  v_diferencia numeric;
  v_costo      numeric;
  v_total      numeric;
  v_art        record;
  v_conto      text;
  v_mov        bigint;
  v_conteo     bigint;
  v_linea      jsonb;
  v_partes     text[] := '{}';
  v_pres       text;
  v_cant       numeric;
begin
  perform private.exigir_rol('ALMACEN');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Un conteo sin explicación no se puede leer después. Escribe qué se contó y por qué.'
      using errcode = '22023';
  end if;

  select nombre, unidad, presentacion, unidades_por_presentacion
    into v_art from public.articulos where id = p_articulo_id;
  if v_art.unidad is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

  if p_contado is not null and p_contado < 0 then
    raise exception 'Lo contado no puede ser negativo.' using errcode = '22023';
  end if;

  /*
    LA MEZCLA MANDA CUANDO VIENE, y si no, se cuenta como se contaba.

    Cada línea se convierte con `en_unidad_base`, que es quien rechaza una
    presentación no declarada. Validar a mano fue el error que se coló en el
    traslado: `presentacion_usada` no valida, resuelve.
  */
  if p_envases is not null and jsonb_array_length(p_envases) > 0 then
    v_total := coalesce(p_contado, 0);

    for v_linea in select * from jsonb_array_elements(p_envases) loop
      v_pres := upper(btrim(coalesce(v_linea ->> 'presentacion', '')));
      v_cant := (v_linea ->> 'cantidad')::numeric;

      if v_pres = '' or coalesce(v_cant, 0) <= 0 then
        continue;
      end if;

      v_total := v_total + private.en_unidad_base(p_articulo_id, v_cant, 0, v_pres);
      v_partes := v_partes || format('%s %s', private.numero_es(v_cant, 0), v_pres);
    end loop;

    if cardinality(v_partes) = 0 then
      raise exception 'No se contó ningún envase.' using errcode = '22023';
    end if;
  else
    if p_presentaciones is not null then
      if p_presentaciones < 0 then
        raise exception 'No se pueden contar bultos en negativo.' using errcode = '22023';
      end if;
      if p_presentaciones <> trunc(p_presentaciones) then
        raise exception 'Los bultos se cuentan enteros: % no es un numero de bultos. Lo que sobra del ultimo va en lo suelto.',
          private.numero_es(p_presentaciones, 2) using errcode = '22023';
      end if;
    end if;

    v_total := private.en_unidad_base(p_articulo_id, p_presentaciones, coalesce(p_contado, 0), p_presentacion);

    if coalesce(p_presentaciones, 0) <> 0 then
      v_partes := v_partes || format('%s %s',
        private.numero_es(p_presentaciones, 0),
        private.presentacion_usada(p_articulo_id, p_presentacion));
    end if;
  end if;

  if v_total < 0 then
    raise exception 'Lo contado no puede ser negativo.' using errcode = '22023';
  end if;

  v_existencia := private.existencia_para_escribir(p_almacen_id, p_articulo_id);
  v_diferencia := v_total - v_existencia;

  if cardinality(v_partes) > 0 then
    v_conto := format('%s%s = %s %s',
      array_to_string(v_partes, ' y '),
      case when coalesce(p_contado, 0) <> 0
           then format(' y %s %s', private.numero_es(p_contado, 4), v_art.unidad)
           else '' end,
      private.numero_es(v_total, 4), v_art.unidad);
  else
    v_conto := format('%s %s', private.numero_es(v_total, 4), v_art.unidad);
  end if;

  /*
    EL ASIENTO, SOLO SI HAY DESCUADRE.

    Antes esto era un `raise` — «no hay nada que ajustar»— y con eso un conteo
    que cuadraba no se podía anotar. Ahora simplemente no se escribe movimiento:
    no hay nada que mover. El conteo sí se guarda, que es lo que importaba.
  */
  if abs(v_diferencia) >= 0.0001 then
    v_costo := private.costo_promedio(p_almacen_id, p_articulo_id);

    v_mov := private.registrar_movimiento(
      case when v_diferencia > 0 then 'AJUSTE_POSITIVO' else 'AJUSTE_NEGATIVO' end,
      case when v_diferencia > 0 then 1 else -1 end::smallint,
      p_almacen_id, p_articulo_id, abs(v_diferencia), v_costo,
      format('Conteo físico: %s contra %s %s en sistema. %s',
             v_conto, private.numero_es(v_existencia, 4), v_art.unidad, p_motivo),
      null, null, null, p_fecha,
      p_cantidad_capturada => nullif(coalesce(p_presentaciones, 0), 0),
      p_unidad_capturada   => case when coalesce(p_presentaciones, 0) <> 0
                                   then private.presentacion_usada(p_articulo_id, p_presentacion) end,
      p_suelto_capturado   => case when coalesce(p_presentaciones, 0) <> 0
                                    and coalesce(p_contado, 0) <> 0
                                   then p_contado end);
  end if;

  insert into public.conteos (
    almacen_id, articulo_id, fecha, contado, existencia_antes,
    movimiento_id, motivo, registrado_por)
  values (
    p_almacen_id, p_articulo_id, coalesce(p_fecha, private.hoy_aqui()),
    v_total, v_existencia, v_mov, p_motivo, auth.uid())
  returning id into v_conteo;

  /*
    LA HOJA, COLGANDO DEL CONTEO. Esto es lo que permite decir dentro de un año
    «el 9 de septiembre se contaron un tambor y veinte pailas», que es un hecho,
    en vez de dividir 604 entre 208, que es una suposición.
  */
  if p_envases is not null then
    insert into public.conteo_envases (conteo_id, presentacion, cantidad)
    select v_conteo, upper(btrim(e ->> 'presentacion')), (e ->> 'cantidad')::numeric
      from jsonb_array_elements(p_envases) e
     where coalesce(btrim(e ->> 'presentacion'), '') <> ''
       and coalesce((e ->> 'cantidad')::numeric, 0) > 0
    on conflict (conteo_id, presentacion) do update
      set cantidad = public.conteo_envases.cantidad + excluded.cantidad;
  elsif coalesce(p_presentaciones, 0) > 0 then
    -- La forma de un solo envase tambien deja hoja: es el mismo hecho.
    insert into public.conteo_envases (conteo_id, presentacion, cantidad)
    values (v_conteo, private.presentacion_usada(p_articulo_id, p_presentacion), p_presentaciones)
    on conflict do nothing;
  end if;

  -- El asiento cuando lo hubo; nulo cuando el conteo cuadró.
  return v_mov;
end;
$function$;

comment on function public.registrar_ajuste(bigint, bigint, numeric, text, date, numeric, text, jsonb) is
  'Anota un conteo fisico y, SOLO si lo contado no coincide con el libro, escribe el asiento que lo cuadra. Devuelve ese asiento, o nulo cuando el conteo cuadro —que es el caso normal y el que antes se rechazaba con «no hay nada que ajustar», dejando sin poder anotar precisamente el conteo que fija que lo que hay es un tambor—. El conteo es el hecho; el ajuste es una consecuencia. Acepta la mezcla de envases en `p_envases` ademas de los sueltos en `p_contado`, y la guarda como hoja en `conteo_envases`. Cada linea se valida con `private.en_unidad_base`.';

-- ---------------------------------------------------------------------------
-- 4. El saldo de envases arranca del conteo, no del ajuste
-- ---------------------------------------------------------------------------
create or replace function public.envases_aqui(
  p_articulo_id bigint,
  p_almacen_id  bigint
)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_conteo   bigint;
  v_corte    bigint;
  v_desde    date;
  v_ciegos   numeric := 0;
  v_saldo    jsonb := '{}'::jsonb;
  v_r        record;
  v_unidad   text;
  v_existe   numeric;
  v_en_envas numeric := 0;
  v_costo    numeric;
  v_lista    jsonb := '[]'::jsonb;
  v_pres     text;
  v_cuantos  numeric;
  v_por      numeric;
begin
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  select unidad into v_unidad from public.articulos where id = p_articulo_id;
  if v_unidad is null then
    return jsonb_build_object('confiable', false, 'por_que', 'No existe el artículo.');
  end if;

  /*
    EL PUNTO DE PARTIDA ES EL ÚLTIMO CONTEO CON HOJA.

    Un conteo sin hoja —de los que solo dicen un total— no sirve de arranque: no
    dice qué envases había. Si no hay ninguno se arranca del principio, y
    entonces la cuenta solo se sostiene si TODO lo que entró dijo su envase.

    El corte para lo que vino después es el ASIENTO del conteo cuando lo hubo, y
    cuando cuadró no hay asiento: entonces se corta por el último movimiento
    anterior al conteo, que es lo que el conteo estaba mirando.
  */
  select c.id, c.fecha, coalesce(c.movimiento_id,
           (select max(m.id) from public.inventario_movimientos m
             where m.articulo_id = p_articulo_id and m.almacen_id = p_almacen_id
               and m.registrado_en <= c.registrado_en))
    into v_conteo, v_desde, v_corte
    from public.conteos c
   where c.articulo_id = p_articulo_id
     and c.almacen_id = p_almacen_id
     and exists (select 1 from public.conteo_envases ce where ce.conteo_id = c.id)
   order by c.id desc
   limit 1;

  if v_conteo is not null then
    for v_r in select ce.presentacion, ce.cantidad
                 from public.conteo_envases ce where ce.conteo_id = v_conteo loop
      v_saldo := v_saldo || jsonb_build_object(v_r.presentacion,
                   coalesce((v_saldo ->> v_r.presentacion)::numeric, 0) + v_r.cantidad);
    end loop;
  end if;

  for v_r in
    select m.signo, m.cantidad,
           nullif(btrim(coalesce(m.unidad_capturada, '')), '') as envase,
           coalesce(m.cantidad_capturada, 0) as bultos
      from public.inventario_movimientos m
     where m.articulo_id = p_articulo_id
       and m.almacen_id = p_almacen_id
       and m.tipo <> 'AJUSTE_COSTO'
       and (v_corte is null or m.id > v_corte)
     order by m.id
  loop
    if v_r.envase is null or v_r.bultos = 0 then
      v_ciegos := v_ciegos + v_r.cantidad;
    else
      v_saldo := v_saldo || jsonb_build_object(v_r.envase,
                   coalesce((v_saldo ->> v_r.envase)::numeric, 0) + v_r.signo * v_r.bultos);
    end if;
  end loop;

  for v_r in
    select re.desde_presentacion, re.desde_cantidad,
           re.hacia_presentacion, re.hacia_cantidad
      from public.reenvases re
     where re.articulo_id = p_articulo_id
       and re.almacen_id = p_almacen_id
       and (v_desde is null or re.fecha >= v_desde)
     order by re.id
  loop
    if v_r.desde_presentacion is not null then
      v_saldo := v_saldo || jsonb_build_object(v_r.desde_presentacion,
                   coalesce((v_saldo ->> v_r.desde_presentacion)::numeric, 0) - v_r.desde_cantidad);
    end if;
    if v_r.hacia_presentacion is not null then
      v_saldo := v_saldo || jsonb_build_object(v_r.hacia_presentacion,
                   coalesce((v_saldo ->> v_r.hacia_presentacion)::numeric, 0) + v_r.hacia_cantidad);
    end if;
  end loop;

  if v_ciegos > 0.0001 then
    return jsonb_build_object(
      'confiable', false,
      'por_que', format('Desde %s se movieron %s %s sin decir en qué envase, así que ya no se puede saber cuántos hay de cada uno. Un conteo lo vuelve a fijar.',
        case when v_desde is null then 'siempre' else 'el ' || to_char(v_desde, 'DD/MM/YYYY') end,
        private.numero_es(v_ciegos, 2), v_unidad));
  end if;

  v_existe := private.existencia(p_almacen_id, p_articulo_id);
  v_costo  := private.costo_promedio(p_almacen_id, p_articulo_id);

  for v_pres, v_cuantos in select * from jsonb_each_text(v_saldo) loop
    continue when coalesce(v_cuantos, 0) = 0;
    if v_cuantos < 0 then
      return jsonb_build_object(
        'confiable', false,
        'por_que', format('Las cuentas dan %s envases de %s, que es imposible: falta algo por anotar.',
          private.numero_es(v_cuantos, 0), v_pres));
    end if;

    select ap.unidades into v_por from public.articulo_presentaciones ap
     where ap.articulo_id = p_articulo_id and ap.presentacion = v_pres;

    if coalesce(v_por, 0) <= 0 then
      return jsonb_build_object(
        'confiable', false,
        'por_que', format('«%s» ya no dice cuántas %s trae, así que no se puede valorar.', v_pres, v_unidad));
    end if;

    v_en_envas := v_en_envas + v_cuantos * v_por;
    v_lista := v_lista || jsonb_build_object(
      'presentacion', v_pres,
      'cuantos', v_cuantos,
      'unidades', v_por,
      'valor_usd', case when v_costo is not null then round(v_costo * v_por * v_cuantos, 2) end);
  end loop;

  if v_en_envas > v_existe + 0.1 then
    return jsonb_build_object(
      'confiable', false,
      'por_que', format('Los envases suman %s %s y en el libro hay %s: falta algo por anotar.',
        private.numero_es(v_en_envas, 2), v_unidad, private.numero_es(v_existe, 2)));
  end if;

  return jsonb_build_object(
    'confiable', true,
    'desde', v_desde,
    'nunca_contado', v_conteo is null,
    'envases', v_lista,
    'sueltos', round(v_existe - v_en_envas, 4),
    'valor_sueltos', case when v_costo is not null
                          then round(v_costo * (v_existe - v_en_envas), 2) end,
    'unidad', v_unidad);
end;
$function$;
