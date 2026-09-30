/*
  EL CÓDIGO ES LA CATEGORÍA Y UN NÚMERO, TAMBIÉN EN LOS QUE QUEDABAN

  Angélica, 30/09/2026: «los códigos de productos y de almacén sean por defecto
  las 3 primeras letras + los números incrementales. Sale ALI-HARINAPAN y quiero
  que sea ALI-001. Cámbialo en todos los productos». Y después: «el código será
  incremental por categoría, incremental en el número».

  LO QUE YA ESTABA HECHO, Y CONVIENE DECIRLO

  El sistema ya acuña así desde que existe `private.codigo_de_articulo`: toma el
  prefijo de la categoría y pide el siguiente de la serie en `correlativos`.
  De los 452 artículos, 404 ya se llaman LUB-0012, REP-0087 y así.

  Los 48 que no son de antes de eso: los cargó alguien a mano por planilla y
  escribió el código él, con el nombre pegado detrás del prefijo. Por eso
  «ALI-HARINAPAN». Y por eso, además, hay trece herramientas de cocina con
  prefijo ALI- que son de categoría HERRAMIENTA: el prefijo tecleado ni siquiera
  coincide con la categoría, así que el código no clasifica nada.

  Esta migración hace dos cosas: renumera esos 48, y le da a los almacenes el
  generador que los artículos ya tenían.

  POR QUÉ CUATRO CIFRAS Y NO TRES, QUE ES LO QUE ELLA ESCRIBIÓ

  Los 404 artículos que ya están numerados usan cuatro —LUB-0012—. Renumerar
  esos 404 para pasarlos a tres cifras cambiaría códigos que ya están en notas
  de salida impresas y en etiquetas de estante, y eso es exactamente lo que
  `renumerar_articulo` se niega a hacer desde que se escribió: «está escrito en
  papeles que no se pueden reimprimir».

  Así que la serie sigue en cuatro y los 48 entran en ella. Es un cambio de una
  línea si prefiere tres; lo que no se puede tener son dos anchos a la vez, que
  además desordenan cualquier lista que se ordene por código.

  LOS CÓDIGOS VIEJOS NO SE PIERDEN

  Cada uno queda en `articulos.codigo_anterior` y en `codigos_retirados`. La
  búsqueda del catálogo mira el anterior, así que quien tenga «ALI-HARINAPAN»
  apuntado en una planilla suya lo sigue encontrando. Y el viejo queda RETIRADO,
  no libre: `crear_articulo` acepta un código escrito a mano, y sin esto alguien
  podría teclear el de otro artículo y crear la confusión que esto viene a
  quitar.

  DE LOS 48, UNO TIENE MOVIMIENTOS DE INVENTARIO. Se renumera igual —lo pidió
  ella, y las diecisiete claves foráneas hacia `articulos` son todas por `id`,
  así que no se rompe nada—, pero queda dicho aquí: si aparece un papel viejo
  con su código, se busca por `codigo_anterior`.
*/

-- ───────────────────────────────────────────────────────────────────────────
-- 1. El prefijo de un almacén, que sale de su tipo
--
-- Mismo criterio que `prefijo_de_categoria` para los artículos: una lista
-- corta y explícita, y una red para lo que no esté en ella. Se escriben los
-- seis tipos que `guardar_almacen` admite hoy.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function private.prefijo_de_tipo_de_almacen(p_tipo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case upper(coalesce(p_tipo, ''))
           when 'ALMACEN'        then 'ALM'
           when 'PATIO'          then 'PAT'
           when 'TALLER'         then 'TAL'
           when 'COMBUSTIBLE'    then 'CMB'
           when 'TRANSITO'       then 'TRA'
           when 'PATIO_MAQUINAS' then 'PAM'
           else left(regexp_replace(upper(coalesce(p_tipo, 'ALM')), '[^A-Z]', '', 'g') || 'ALM', 3)
         end;
$$;

comment on function private.prefijo_de_tipo_de_almacen(text) is
  'Las tres letras con las que empieza el código de un almacén, según su tipo.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. El código de un almacén nuevo
--
-- Copia deliberada de `codigo_de_articulo`, incluido el bucle: la serie vive en
-- `correlativos` con `anio = 0` —que dice «esta serie no es anual»— y se vuelve
-- a pedir si el que sale ya lo tecleó alguien a mano. El tope de mil vueltas
-- está por lo mismo que allá: un bucle infinito dentro de una transacción se
-- lleva la conexión por delante.
--
-- Las series de artículos y almacenes no chocan aunque compartan tabla: ALM y
-- PAT no son prefijos de ninguna categoría de artículo. Si algún día lo fueran,
-- compartirían contador y saldrían huecos, no códigos repetidos.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function private.codigo_de_almacen(p_tipo text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_prefijo text;
  v_ultimo  integer;
  v_codigo  text;
  v_vueltas integer := 0;
begin
  v_prefijo := private.prefijo_de_tipo_de_almacen(p_tipo);

  loop
    insert into public.correlativos (prefijo, anio, ultimo)
    values (v_prefijo, 0, 1)
    on conflict (prefijo, anio) do update
      set ultimo = public.correlativos.ultimo + 1
    returning ultimo into v_ultimo;

    v_codigo := format('%s-%s', v_prefijo, lpad(v_ultimo::text, 4, '0'));

    exit when not exists (select 1 from public.almacenes where codigo = v_codigo);

    v_vueltas := v_vueltas + 1;
    if v_vueltas > 1000 then
      raise exception 'No se pudo generar un código libre para un almacén de tipo %.', p_tipo
        using errcode = '55000',
              hint = 'Escribe el código a mano.';
    end if;
  end loop;

  return v_codigo;
end;
$$;

comment on function private.codigo_de_almacen(text) is
  'El siguiente código libre de la serie de ese tipo de almacén.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. `guardar_almacen` acuña el código cuando no se escribe
--
-- Se parchea el cuerpo vivo en vez de reescribir la función entera: tiene
-- ciento treinta líneas de reglas —el dueño que no cambia con el almacén lleno,
-- el patio que no se desactiva con material dentro— que no tienen nada que ver
-- con esto y que reescribir a mano es la forma de perder una.
-- ───────────────────────────────────────────────────────────────────────────
do $patch$
declare
  v_def   text := pg_get_functiondef(
    'public.guardar_almacen(bigint,text,text,text,text,boolean,boolean,numeric,smallint,text,bigint)'::regprocedure);
  v_ancla text;
begin
  -- (a) El largo mínimo solo se le exige a un código escrito a mano. Vacío deja
  --     de ser un error para pasar a significar «ponle tú uno».
  v_ancla := '  if length(v_codigo) < 2 then';
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'El ancla (a) no aparece exactamente una vez en guardar_almacen.';
  end if;
  v_def := replace(v_def, v_ancla, '  if v_codigo <> '''' and length(v_codigo) < 2 then');

  -- (b) Y se acuña DESPUÉS de validar el tipo, no antes: pedirle un número a la
  --     serie de un tipo que no existe gastaría un correlativo para nada.
  v_ancla := '  if p_capacidad is not null and p_capacidad <= 0 then';
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'El ancla (b) no aparece exactamente una vez en guardar_almacen.';
  end if;
  v_def := replace(
    v_def,
    v_ancla,
    '  /*'                                                                     || E'\n' ||
    '    EL CODIGO SE PONE SOLO CUANDO NO SE ESCRIBE. Angelica, 30/09/2026.'    || E'\n' ||
    ''                                                                         || E'\n' ||
    '    Solo al crear. Al editar, un codigo vacio sigue siendo un error: si'   || E'\n' ||
    '    se acunara uno nuevo, un almacen cambiaria de nombre propio cada vez'  || E'\n' ||
    '    que alguien guardara la ficha sin mirar ese campo.'                    || E'\n' ||
    '  */'                                                                     || E'\n' ||
    '  if p_id is null and v_codigo = '''' then'                                || E'\n' ||
    '    v_codigo := private.codigo_de_almacen(p_tipo);'                        || E'\n' ||
    '  elsif v_codigo = '''' then'                                              || E'\n' ||
    '    raise exception ''El almacen necesita un codigo que lo identifique.'' using errcode = ''23514'';' || E'\n' ||
    '  end if;'                                                                || E'\n' ||
    ''                                                                         || E'\n' ||
    v_ancla);

  execute v_def;
end
$patch$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Los 48 que quedaban
--
-- Se toman los que NO tienen la forma PREFIJO-NNNN. No se tocan los 404 que ya
-- la tienen, ni siquiera si su prefijo no casa con su categoría de hoy: esos ya
-- salieron impresos, y cambiarlos es la churn que `renumerar_articulo` prohíbe.
--
-- El orden importa para que el resultado se pueda leer: por categoría y por
-- nombre, así los números salen alfabéticos dentro de cada serie en vez de en
-- el orden en que se cargaron.
-- ───────────────────────────────────────────────────────────────────────────
do $renumerar$
declare
  v_a     record;
  v_nuevo text;
  v_n     integer := 0;
begin
  for v_a in
    select a.id, a.codigo, a.nombre, a.categoria
      from public.articulos a
     where a.codigo !~ '^[A-Z]{2,4}-[0-9]{3,4}$'
     order by a.categoria, a.nombre, a.id
  loop
    v_nuevo := private.codigo_de_articulo(v_a.categoria);

    update public.articulos
       set codigo = v_nuevo,
           codigo_anterior = v_a.codigo
     where id = v_a.id;

    -- `retirado_por` va nulo a propósito: esto no lo pidió una persona desde
    -- una pantalla, lo hizo una migración, y firmar con el usuario de turno
    -- seria atribuirselo a quien no fue.
    insert into public.codigos_retirados (codigo, articulo_id, codigo_nuevo, retirado_por)
    values (v_a.codigo, v_a.id, v_nuevo, null)
    on conflict (codigo) do update
      set codigo_nuevo = excluded.codigo_nuevo,
          retirado_en  = now(),
          retirado_por = null;

    v_n := v_n + 1;
  end loop;

  raise notice 'Renumerados % artículos.', v_n;
end
$renumerar$;
