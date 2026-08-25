-- ---------------------------------------------------------------------------
-- No todo se puede mandar a reparar
--
-- Christopher, mirando el desplegable que se acababa de montar:
--
--   «No podemos mandar al taller a reparar un pote o cantidad de "Aceite de
--    Motor", por lo tanto, al crear un artículo se debe especificar si es o no
--    es apto para enviar al taller o reparable»
--
-- Tiene razón y es un fallo de lo de hace un rato. Al abrir la puerta del taller
-- desde la cabecera, el selector se llenó con TODO lo que tuviera existencia:
-- aceite de motor, arena lavada, botas, cascos. Nada de eso vuelve del taller
-- arreglado. Un litro de aceite no se rectifica: se gasta.
--
-- Es el mismo fallo que ya salió tres veces hoy —la pantalla ofrece lo que no se
-- puede hacer— y esta vez ni siquiera había reja detrás: la base lo habría
-- aceptado y habría quedado una orden de taller por un litro de aceite.
--
-- =========================================================================
-- POR DEFECTO SE DEDUCE, Y SE PUEDE CORREGIR
-- =========================================================================
--
-- Exigir el dato al crear cada artículo sería una casilla más en un formulario
-- que ya tiene ocho, y para la mayoría la respuesta es evidente por su
-- categoría: una herramienta y un repuesto se reparan; un lubricante, un
-- combustible, un producto y un insumo se gastan.
--
-- El EPP se queda en NO, y es la única discutible: un arnés se puede mandar a
-- revisar. Se deja en no porque hoy no se hace, y ponerlo en sí obligaría a
-- desmarcar cada casco que se cargue. El día que haga falta, se marca a mano.
--
-- Para lo ya cargado se aplica la misma regla, que es la única honesta: nadie ha
-- dicho nunca de estos once artículos si se reparan o no.
--
-- =========================================================================
-- LA REJA VA EN LA BASE, Y LA PANTALLA ADEMÁS
-- =========================================================================
--
-- `abrir_mantenimiento` es la única puerta por la que un material entra a un
-- taller. Una regla que solo viviera en el navegador se la salta cualquiera que
-- llame a la función. La pantalla filtra también —el selector y el botón de la
-- fila— para no hacer que alguien llene la orden entera y se la tumben al final.
--
-- COMPROBADO, en transacción revertida:
--
--   aceite al taller ........... parado: «Eso no se manda a reparar»
--   repuesto al taller ......... pasa
--   herramienta nueva sin decir  reparable = true  (se deduce)
--   lubricante nuevo sin decir . reparable = false (se deduce)
--   versiones vivas de crear
--     y editar_articulo ........ 2, una de cada (la regla 7, vigilada)
-- ---------------------------------------------------------------------------

alter table public.articulos
  add column if not exists reparable boolean not null default false;

comment on column public.articulos.reparable is
  'Si esto se puede mandar al taller y volver arreglado. Un repuesto sí; un litro de aceite no se rectifica, se gasta.';

update public.articulos
   set reparable = true
 where categoria in ('HERRAMIENTA', 'REPUESTO')
   and reparable = false;

-- ---------------------------------------------------------------------------
-- Se pide al crear y al corregir
--
-- En `crear`, un nulo NO es «no»: es «no me lo han dicho», y entonces se deduce
-- de la categoría. En `editar` sí es «no lo toques», porque al corregir lo que
-- no se manda se queda como estaba.
--
-- Las versiones de ocho argumentos se BORRAN. Con las dos vivas, la llamada
-- falla con «function is not unique» — la regla 7, que hoy ya cobró dos veces.
-- ---------------------------------------------------------------------------
create or replace function public.crear_articulo(
  p_codigo text default null,
  p_nombre text default null,
  p_categoria text default null,
  p_unidad text default null,
  p_descripcion text default null::text,
  p_inventariable boolean default true,
  p_stock_minimo numeric default 0,
  p_modo_entrega text default null::text,
  p_reparable boolean default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id        bigint;
  v_modo      text;
  v_codigo    text;
  v_reparable boolean;
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

  -- Nulo es «no me lo han dicho», no «no». Se deduce de la categoría.
  v_reparable := coalesce(p_reparable, p_categoria in ('HERRAMIENTA', 'REPUESTO'));

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
     modo_entrega, reparable, creado_por)
  values
    (v_codigo, trim(p_nombre), nullif(trim(coalesce(p_descripcion, '')), ''),
     p_categoria, p_unidad,
     case when p_categoria = 'SERVICIO' then false else p_inventariable end,
     coalesce(p_stock_minimo, 0), v_modo, v_reparable, (select auth.uid()))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un artículo con el código %.', v_codigo
      using errcode = '23505';
end;
$function$;

comment on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean) is
  'Crea un artículo. Si no se le da código, se lo pone solo con el prefijo de su categoría; si no se le dice si es reparable, lo deduce de la categoría.';

revoke all on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean) from public;
revoke all on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean) from anon;
grant execute on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean) to authenticated;

drop function if exists public.crear_articulo(
  text, text, text, text, text, boolean, numeric, text);

create or replace function public.editar_articulo(
  p_id bigint,
  p_nombre text,
  p_categoria text,
  p_unidad text,
  p_descripcion text default null::text,
  p_inventariable boolean default true,
  p_stock_minimo numeric default 0,
  p_modo_entrega text default null::text,
  p_reparable boolean default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_existe boolean;
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');

  select true into v_existe from public.articulos where id = p_id;

  if v_existe is null then
    raise exception 'No existe ese artículo.' using errcode = 'P0002';
  end if;

  if length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El artículo necesita un nombre.' using errcode = '22023';
  end if;

  update public.articulos set
    nombre         = trim(p_nombre),
    descripcion    = nullif(trim(coalesce(p_descripcion, '')), ''),
    categoria      = p_categoria,
    unidad         = p_unidad,
    inventariable  = case when p_categoria = 'SERVICIO' then false else p_inventariable end,
    stock_minimo   = coalesce(p_stock_minimo, 0),
    modo_entrega   = coalesce(nullif(trim(coalesce(p_modo_entrega, '')), ''), modo_entrega),
    -- Nulo aquí sí es «no lo toques»: al corregir, lo que no se manda se queda.
    reparable      = coalesce(p_reparable, reparable)
  where id = p_id;
end;
$function$;

drop function if exists public.editar_articulo(
  bigint, text, text, text, text, boolean, numeric, text);

comment on function public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean) is
  'Corrige un artículo. El código no se toca: es con lo que se pide en el almacén y ya está impreso en lo emitido.';

revoke all on function public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean) from public;
revoke all on function public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean) from anon;
grant execute on function public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Y el taller lo rechaza, que es lo que faltaba de verdad
--
-- Se inyecta en `abrir_mantenimiento` desde su propia definición en vez de
-- reescribirla entera: son casi siete mil caracteres y copiarlos aquí es
-- garantizar que un día este archivo y la base digan cosas distintas.
-- Es idempotente: si la reja ya está, no hace nada.
-- ---------------------------------------------------------------------------
do $migracion$
declare
  v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where proname = 'abrir_mantenimiento' and pronamespace = 'public'::regnamespace;

  if v_def is null or v_def like '%no se manda a reparar%' then
    return;   -- ya está puesta
  end if;

  v_def := replace(
    v_def,
    'perform private.exigir_permiso(''MAQUINARIA'', ''ESCRITURA'');',
    'perform private.exigir_permiso(''MAQUINARIA'', ''ESCRITURA'');

  -- Un litro de aceite no se rectifica: se gasta. Lo que no vuelve arreglado no
  -- se manda a reparar.
  if p_articulo_id is not null
     and not exists (select 1 from public.articulos a
                      where a.id = p_articulo_id and a.reparable) then
    raise exception ''Eso no se manda a reparar: no es un material reparable.''
      using errcode = ''22023'',
            hint = ''Si de verdad se puede reparar, marcalo en su ficha de articulo.'';
  end if;'
  );

  execute v_def;
end;
$migracion$;
