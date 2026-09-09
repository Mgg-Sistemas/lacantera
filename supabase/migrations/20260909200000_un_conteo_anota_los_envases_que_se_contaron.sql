/*
  UN CONTEO ANOTA LOS ENVASES QUE SE CONTARON.

  De aquí viene, y es la única salida honesta a una pregunta que Christopher hizo
  tres veces de tres maneras distintas: cuántos tambores hay.

  El sistema no lo sabe y no puede saberlo. Lleva litros, porque el aceite de un
  tambor y el de una paila es el mismo aceite y esa es la razón de que se pueda
  preguntar cuánto aceite hay. Dividir 604 entre 208 da «2 tambores», que suena a
  respuesta y no lo es: del ACEITE HIDRAULICO 68 hay un tambor y unas veintiuna
  pailas, una a medias, y las dos cuentan 604 litros exactos.

  Christopher, cerrando el asunto: «cuando revisen el inventario, buscarán
  existencias reales y no referencias o medidas de items de conversión». Por eso
  las equivalencias salieron de las pantallas donde se cuenta.

  PERO HAY UN MOMENTO EN QUE LOS ENVASES SÍ SE SABEN, y es cuando alguien los
  cuenta. El conteo físico es el único acto del sistema donde una persona está
  delante del estante mirando los envases de verdad. Eso es un HECHO, con fecha y
  con firma, y hasta hoy se tiraba: el conteo guardaba el total y como mucho un
  envase, así que «conté 1 tambor y 20 pailas» se convertía en 604 litros y la
  mitad de lo observado se perdía.

  ═══════════════════════════════════════════════════════════════════════════
  UNA TABLA APARTE, Y NO UNA COLUMNA MÁS EN EL LIBRO
  ═══════════════════════════════════════════════════════════════════════════

  Lo natural parecía añadir una columna a `inventario_movimientos`, al lado de
  `cantidad_capturada`. Dos razones para no hacerlo, y la segunda es la fuerte:

  1. Un conteo mezclado tiene VARIAS líneas —un tambor, veinte pailas— y eso no
     cabe en tres columnas. Cabría en un `jsonb`, pero entonces no se puede
     preguntar «cuántos tambores contamos la última vez» sin desarmarlo.

  2. Escribir esa columna obligaría a darle un parámetro más a
     `private.registrar_movimiento`, que es el insertador que usan las CATORCE
     puertas del inventario. Cambiarle la firma ya tumbó todas las escrituras el
     8 de septiembre. Una tabla hija se escribe después del movimiento y no toca
     ese camino.

  El movimiento sigue siendo la verdad del libro; esto es la hoja de conteo que
  lo respalda, y cuelga de él con `on delete cascade` porque sin su movimiento no
  significa nada.

  ═══════════════════════════════════════════════════════════════════════════
  LO QUE SE PUEDE CONTESTAR A PARTIR DE AHORA
  ═══════════════════════════════════════════════════════════════════════════

  «¿Cuántos tambores hay?» sigue sin tener respuesta en tiempo real, y está bien
  que sea así: entre el conteo y hoy pudo salir aceite. Lo que sí se puede decir,
  y es lo que hace falta, es **«el 9 de septiembre se contaron 1 tambor, 20 pailas
  y 16 litros»**. Eso es un hecho fechado, no una división.
*/

-- ---------------------------------------------------------------------------
-- 1. La hoja de conteo
-- ---------------------------------------------------------------------------
create table if not exists public.conteo_envases (
  id            bigserial primary key,
  movimiento_id bigint not null references public.inventario_movimientos(id) on delete cascade,
  presentacion  text   not null references public.presentaciones(codigo),
  cantidad      numeric not null,
  constraint conteo_envases_cantidad_entera
    check (cantidad > 0 and cantidad = trunc(cantidad)),
  constraint conteo_envases_una_por_envase unique (movimiento_id, presentacion)
);

comment on table public.conteo_envases is
  'Los envases que se contaron en un conteo fisico, uno por fila. Es la hoja de conteo que respalda al movimiento de ajuste, no una segunda verdad: la existencia sigue siendo la del libro, en la unidad de operacion. Existe porque el conteo es el UNICO momento en que alguien sabe de verdad cuantos tambores hay —esta delante del estante mirandolos— y hasta hoy ese dato se tiraba. Va aparte y no como columnas del movimiento por dos razones: un conteo mezclado tiene varias lineas y no cabe en tres columnas, y escribirlas obligaria a cambiarle la firma a `private.registrar_movimiento`, que usan las catorce puertas del inventario.';

comment on column public.conteo_envases.cantidad is
  'Cuantos envases enteros de ese tipo se contaron. Entero por definicion: lo que sobra del ultimo va en lo suelto del movimiento, no aqui.';

create index if not exists conteo_envases_movimiento
  on public.conteo_envases (movimiento_id);

alter table public.conteo_envases enable row level security;

-- Se lee con el mismo permiso que las formas de contar de un articulo: es la
-- misma clase de dato y la misma gente lo necesita.
drop policy if exists conteo_envases_lectura on public.conteo_envases;
create policy conteo_envases_lectura on public.conteo_envases
  for select to authenticated
  using (private.tiene_permiso('INVENTARIO', 'LECTURA'));

-- Regla 1 de la casa: el navegador no escribe. Solo entra por `registrar_ajuste`.
revoke insert, update, delete on public.conteo_envases from authenticated;
grant select on public.conteo_envases to authenticated;

-- Regla 5: toda tabla nueva deja rastro. Sin nombre de columna clave util aqui
-- —el id no dice nada—, se audita por el movimiento del que cuelga.
drop trigger if exists trg_auditar on public.conteo_envases;
create trigger trg_auditar
  after insert or update or delete on public.conteo_envases
  for each row execute function private.auditar('movimiento_id');

-- ---------------------------------------------------------------------------
-- 2. El conteo acepta la mezcla
-- ---------------------------------------------------------------------------
/*
  EL `drop` DE LA FIRMA VIEJA, EN LA MISMA MIGRACIÓN. `create or replace` con un
  parámetro más AÑADE una función en vez de reemplazarla, y con dos firmas toda
  llamada con argumentos con nombre revienta con «42725: is not unique». Pasó el
  8/09 con `private.registrar_movimiento` y dejó el inventario sin escribir.
*/
drop function if exists public.registrar_ajuste(bigint, bigint, numeric, text, date, numeric, text);

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
  v_linea      jsonb;
  v_partes     text[] := '{}';
  v_pres       text;
  v_cant       numeric;
begin
  perform private.exigir_rol('ALMACEN');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Un ajuste sin explicación es un descuadre disfrazado. Escribe qué pasó.'
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

    `p_envases` es la hoja de conteo: [{"presentacion":"TAMBOR","cantidad":1},
    {"presentacion":"PAILA","cantidad":20}]. Cada línea se convierte con
    `en_unidad_base`, que es el mismo ayudante de las otras cuatro puertas y el
    que rechaza una presentación no declarada — validar aquí a mano fue el error
    que se coló en el traslado esta misma tarde.
  */
  if p_envases is not null and jsonb_array_length(p_envases) > 0 then
    v_total := coalesce(p_contado, 0);

    for v_linea in select * from jsonb_array_elements(p_envases) loop
      v_pres := upper(btrim(coalesce(v_linea ->> 'presentacion', '')));
      v_cant := (v_linea ->> 'cantidad')::numeric;

      if v_pres = '' or coalesce(v_cant, 0) <= 0 then
        continue;
      end if;

      -- Convierte y valida de una vez: si el envase no está declarado, rebota.
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

  if abs(v_diferencia) < 0.0001 then
    raise exception 'Lo contado coincide con lo que dice el sistema (% %). No hay nada que ajustar.',
      private.numero_es(v_existencia, 4), v_art.unidad using errcode = '22023';
  end if;

  v_costo := private.costo_promedio(p_almacen_id, p_articulo_id);

  /*
    LA NOTA DICE LO QUE LA PERSONA CONTO, NO SOLO SU EQUIVALENTE.

    Quien conto un tambor y veinte pailas no reconoce «604 L» al releerlo dentro
    de un mes, y entonces no puede cuadrar el movimiento contra su hoja. Se
    escriben los dos.

    Y con `private.numero_es`: el servidor tiene `lc_numeric` en en_US, asi que
    `%s` sobre un numeric daba «1466.0000» donde aqui se lee «1.466,0000».
  */
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

  /*
    LA HOJA DE CONTEO, DESPUÉS DEL MOVIMIENTO Y COLGANDO DE ÉL.

    Va aquí y no antes porque sin movimiento no significa nada, y va en su tabla
    y no en columnas del libro porque un conteo mezclado tiene varias líneas.
    Esto es lo que permite decir dentro de un año «el 9 de septiembre se contaron
    un tambor y veinte pailas», que es un hecho, en vez de dividir 604 entre 208,
    que es una suposición.
  */
  if p_envases is not null then
    insert into public.conteo_envases (movimiento_id, presentacion, cantidad)
    select v_mov, upper(btrim(e ->> 'presentacion')), (e ->> 'cantidad')::numeric
      from jsonb_array_elements(p_envases) e
     where coalesce(btrim(e ->> 'presentacion'), '') <> ''
       and coalesce((e ->> 'cantidad')::numeric, 0) > 0
    on conflict (movimiento_id, presentacion) do update
      set cantidad = public.conteo_envases.cantidad + excluded.cantidad;
  end if;

  return v_mov;
end;
$function$;

comment on function public.registrar_ajuste(bigint, bigint, numeric, text, date, numeric, text, jsonb) is
  'Cuadra la existencia contra un conteo fisico. Desde el 9/09/2026 acepta la MEZCLA de envases en `p_envases` —[{"presentacion":"TAMBOR","cantidad":1},{"presentacion":"PAILA","cantidad":20}]— ademas de los sueltos en `p_contado`, y la anota en `public.conteo_envases`. Es el unico momento del sistema en que alguien sabe de verdad cuantos tambores hay, porque los esta mirando; el resto del tiempo el libro lleva litros y dividir por el factor da una suposicion, no una respuesta. Cada linea se convierte con `private.en_unidad_base`, que es quien valida que el envase este declarado. La forma vieja de un solo envase sigue funcionando igual.';

grant execute on function public.registrar_ajuste(bigint, bigint, numeric, text, date, numeric, text, jsonb) to authenticated;
