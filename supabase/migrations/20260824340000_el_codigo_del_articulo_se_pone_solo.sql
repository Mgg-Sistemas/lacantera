-- ---------------------------------------------------------------------------
-- El código del artículo se pone solo si no lo ponen
--
-- «Se nos pide que al añadir un nuevo artículo, el código se genere solo (se
-- puede colocar el código que el usuario desea pero si no lo lleva, que se
-- autogenere)».
--
-- El campo era obligatorio y no perdonaba: quien va a cargar cuarenta repuestos
-- de una caja tiene que inventarse cuarenta códigos antes de escribir el primer
-- nombre, y lo que sale de ahí son códigos inventados a las prisas. Ya se ve en
-- los que hay: junto a REP-FILTRO-A y REP-NEU2950 conviven TAN-250-HQ, que no
-- lleva el prefijo de su categoría, e INS_HOJA_01, que usa guion bajo.
--
-- =========================================================================
-- EL PREFIJO ES EL QUE YA SE USA, NO UNO NUEVO
-- =========================================================================
--
-- CMB, EPP, HER, INS, LUB, PRD, REP. Salen de mirar los códigos cargados, no de
-- inventar una convención: si la máquina generara con otra letra, la lista
-- quedaría partida en dos épocas y habría que explicar cuál es cuál.
--
-- Para una categoría que no esté en la lista se usan sus tres primeras letras.
-- Es una regla que puede dar un prefijo feo, y aun así es mejor que fallar: el
-- código se puede corregir a mano y un artículo que no se deja crear, no.
--
-- =========================================================================
-- SIN AÑO, Y COMPROBANDO QUE NO ESTÉ COGIDO
-- =========================================================================
--
-- `private.siguiente_numero` no vale aquí: mete el año, que es lo correcto para
-- un documento —MOV-2026-0028— y falso para un artículo. Un filtro de aire no
-- es de 2026.
--
-- Se usa la misma tabla `correlativos` con `anio = 0`, que es como se dice «esta
-- serie no es anual». Y después se COMPRUEBA que el código no esté cogido, en
-- bucle: los códigos a mano y los generados comparten el mismo espacio, y nada
-- impide que alguien haya escrito REP-0003 antes de que el contador llegue ahí.
-- Sin esa vuelta, el primer choque saldría como «ya existe un artículo con el
-- código REP-0003» al crear uno sin código, que es un error incomprensible.
--
-- COMPROBADO, en transacción revertida:
--
--   sin código ................ REP-0001
--   otra categoría ............ LUB-0001
--   con código a mano ......... MI-CODIGO-RARO (se pone en mayúscula)
--   choque con uno a mano ..... REP-0002, y el siguiente salta el 0003 ocupado
--   sin nombre ................ parado: «El artículo necesita un nombre»
-- ---------------------------------------------------------------------------

create or replace function private.codigo_de_articulo(p_categoria text)
returns text
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_prefijo text;
  v_ultimo  integer;
  v_codigo  text;
  v_vueltas integer := 0;
begin
  v_prefijo := case upper(coalesce(p_categoria, ''))
                 when 'COMBUSTIBLE' then 'CMB'
                 when 'EPP'         then 'EPP'
                 when 'HERRAMIENTA' then 'HER'
                 when 'INSUMO'      then 'INS'
                 when 'LUBRICANTE'  then 'LUB'
                 when 'PRODUCTO'    then 'PRD'
                 when 'REPUESTO'    then 'REP'
                 when 'SERVICIO'    then 'SRV'
                 else left(regexp_replace(upper(coalesce(p_categoria, 'ART')), '[^A-Z]', '', 'g') || 'ART', 3)
               end;

  loop
    -- `anio = 0` dice que la serie no es anual. La clave primaria es
    -- (prefijo, anio), así que no choca con los correlativos de documentos.
    insert into public.correlativos (prefijo, anio, ultimo)
    values (v_prefijo, 0, 1)
    on conflict (prefijo, anio) do update
      set ultimo = public.correlativos.ultimo + 1
    returning ultimo into v_ultimo;

    v_codigo := format('%s-%s', v_prefijo, lpad(v_ultimo::text, 4, '0'));

    exit when not exists (select 1 from public.articulos where codigo = v_codigo);

    -- Alguien lo escribió a mano antes de que el contador llegara. Se pide el
    -- siguiente. El tope es por si acaso: mil choques seguidos no es un dato
    -- raro, es un bucle, y un bucle infinito dentro de una transacción se lleva
    -- la conexión por delante.
    v_vueltas := v_vueltas + 1;
    if v_vueltas > 1000 then
      raise exception 'No se pudo generar un código libre para la categoría %.', p_categoria
        using errcode = '55000',
              hint = 'Escribe el código a mano.';
    end if;
  end loop;

  return v_codigo;
end;
$func$;

comment on function private.codigo_de_articulo(text) is
  'Un código libre para un artículo nuevo, con el prefijo que ya usa su categoría. Sin año —un filtro de aire no es de 2026— y comprobando que nadie lo haya escrito antes a mano.';

-- ---------------------------------------------------------------------------
-- `crear_articulo` acepta que no le den código
--
-- `p_codigo` gana un valor por defecto. Los que ya la llaman lo hacen por nombre
-- de argumento —así resuelve PostgREST— así que ninguno se entera.
-- ---------------------------------------------------------------------------
create or replace function public.crear_articulo(
  p_codigo text default null,
  p_nombre text default null,
  p_categoria text default null,
  p_unidad text default null,
  p_descripcion text default null::text,
  p_inventariable boolean default true,
  p_stock_minimo numeric default 0,
  p_modo_entrega text default null::text
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id     bigint;
  v_modo   text;
  v_codigo text;
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');

  if length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El artículo necesita un nombre.' using errcode = '22023';
  end if;

  -- Vacío no es un error: es que no lo llevan, y entonces lo pone la casa.
  v_codigo := nullif(upper(trim(coalesce(p_codigo, ''))), '');
  if v_codigo is null then
    v_codigo := private.codigo_de_articulo(p_categoria);
  end if;

  v_modo := coalesce(nullif(trim(coalesce(p_modo_entrega, '')), ''),
    case p_categoria
      when 'HERRAMIENTA' then 'RETORNABLE'
      when 'EPP'         then 'RETORNABLE'
      when 'PRODUCTO'    then 'NO'
      when 'SERVICIO'    then 'NO'
      else 'CONSUMIBLE'
    end);

  insert into public.articulos
    (codigo, nombre, descripcion, categoria, unidad, inventariable, stock_minimo,
     modo_entrega, creado_por)
  values
    (v_codigo, trim(p_nombre), nullif(trim(coalesce(p_descripcion, '')), ''),
     p_categoria, p_unidad,
     case when p_categoria = 'SERVICIO' then false else p_inventariable end,
     coalesce(p_stock_minimo, 0), v_modo, (select auth.uid()))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un artículo con el código %.', v_codigo
      using errcode = '23505';
end;
$function$;

comment on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text) is
  'Crea un artículo. Si no se le da código, se lo pone solo con el prefijo de su categoría.';

revoke all on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text) from public;
revoke all on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text) from anon;
grant execute on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text) to authenticated;
