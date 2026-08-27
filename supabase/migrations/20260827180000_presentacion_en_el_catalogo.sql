/*
  CÓMO LLEGA UN ARTÍCULO NO ES CÓMO SE USA.

  Lo pidió Christopher: «una cosa es lo que la empresa recibe (presentación) y
  otra cosa es lo que la empresa usa (unidad, m3, KG, L)».

  `articulos.unidad` ya decía lo segundo, y es en lo que se lleva la existencia
  y se descuenta el consumo. Lo primero no tenía dónde vivir. La presentación
  se estaba anotando en la cotización —y desde hoy tiene su campo allí— pero
  eso la ata al papel de un proveedor, cuando en realidad es del artículo: el
  agua Minalba llega en bultos de seis lo mande quien lo mande.

  DOS COLUMNAS Y NO UNA

  `presentacion` dice en qué viene: BULTO, BIDÓN DE 20 L, PALETA.
  `unidades_por_presentacion` dice cuántas `unidad` trae: 6.

  Se separan porque la segunda es una cuenta y la primera un nombre. Juntas en
  un texto —«bulto de 6»— servirían para leer y para nada más; separadas, la
  pantalla puede decir «6 UND por BULTO» donde haga falta, y algún día se podrá
  convertir si se decide que conviene.

  NULO NO ES UN DATO QUE FALTE

  Una barra de acero llega suelta. Ahí `presentacion` es nulo y está bien: no
  es un campo sin llenar, es un artículo que no viene empacado. Por eso no hay
  valor por omisión ni se obliga a poner nada.

  EL FRENO

  Decir cuántas unidades trae sin decir en qué viene no significa nada, así que
  la restricción lo impide y las dos funciones lo dicen con palabras antes de
  que la base lo diga con un código.

  LO QUE ESTO NO HACE

  No convierte. La existencia se sigue llevando en `unidad` y lo que se teclea
  es lo que se guarda. La equivalencia se enseña debajo del campo —en la
  planilla del pedido y al registrar una entrada— y la cuenta la hace quien
  escribe. Convertir por detrás cambiaría lo guardado sin que nadie lo vea, y
  una cifra de inventario que no es la que se tecleó no se descubre hasta que
  alguien cuenta.
*/

alter table public.articulos
  add column if not exists presentacion text,
  add column if not exists unidades_por_presentacion numeric(14,4);

comment on column public.articulos.presentacion is
  'Como llega el articulo: BULTO, BIDON DE 20 L, PALETA. Nulo: llega suelto.';
comment on column public.articulos.unidades_por_presentacion is
  'Cuantas unidades trae una presentacion. Un bulto de agua trae 6.';

alter table public.articulos
  drop constraint if exists articulos_presentacion_check;
alter table public.articulos
  add constraint articulos_presentacion_check
  check (
    (unidades_por_presentacion is null or unidades_por_presentacion > 0)
    and (unidades_por_presentacion is null or presentacion is not null)
  );

/*
  Las dos funciones cambian de firma, así que van con DROP.

  Un `create or replace` con otra lista de argumentos no reemplaza: crea una
  segunda con el mismo nombre, y a partir de ahí PostgREST elige por los
  argumentos que le manden. Al soltarlas se van sus permisos, y por eso se
  reponen abajo: una función nueva en `public` nace con `execute` para todo el
  mundo, `anon` incluido.
*/

drop function if exists public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean);

create function public.crear_articulo(
  p_codigo text,
  p_nombre text,
  p_categoria text,
  p_unidad text,
  p_descripcion text default null,
  p_inventariable boolean default true,
  p_stock_minimo numeric default 0,
  p_modo_entrega text default null,
  p_reparable boolean default null,
  p_presentacion text default null,
  p_unidades_por_presentacion numeric default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id        bigint;
  v_modo      text;
  v_codigo    text;
  v_reparable boolean;
  v_pres      text := nullif(trim(coalesce(p_presentacion, '')), '');
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

  if v_pres is null and p_unidades_por_presentacion is not null then
    raise exception 'Dice cuántas unidades trae la presentación, pero no dice cuál es. Escribe la presentación o deja las dos vacías.'
      using errcode = '22023';
  end if;

  insert into public.articulos
    (codigo, nombre, descripcion, categoria, unidad, inventariable, stock_minimo,
     modo_entrega, reparable, presentacion, unidades_por_presentacion, creado_por)
  values
    (v_codigo, trim(p_nombre), nullif(trim(coalesce(p_descripcion, '')), ''),
     p_categoria, p_unidad,
     case when p_categoria = 'SERVICIO' then false else p_inventariable end,
     coalesce(p_stock_minimo, 0), v_modo, v_reparable,
     v_pres, p_unidades_por_presentacion, (select auth.uid()))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un artículo con el código %.', v_codigo
      using errcode = '23505';
end;
$function$;

drop function if exists public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean);

create function public.editar_articulo(
  p_id bigint,
  p_nombre text,
  p_categoria text,
  p_unidad text,
  p_descripcion text default null,
  p_inventariable boolean default true,
  p_stock_minimo numeric default 0,
  p_modo_entrega text default null,
  p_reparable boolean default null,
  p_presentacion text default null,
  p_unidades_por_presentacion numeric default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_existe boolean;
  v_pres   text := nullif(trim(coalesce(p_presentacion, '')), '');
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');

  select true into v_existe from public.articulos where id = p_id;

  if v_existe is null then
    raise exception 'No existe ese artículo.' using errcode = 'P0002';
  end if;

  if length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El artículo necesita un nombre.' using errcode = '22023';
  end if;

  if v_pres is null and p_unidades_por_presentacion is not null then
    raise exception 'Dice cuántas unidades trae la presentación, pero no dice cuál es. Escribe la presentación o deja las dos vacías.'
      using errcode = '22023';
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
    reparable      = coalesce(p_reparable, reparable),
    -- La presentación sí se vacía si viene vacía: es la forma de decir que ese
    -- artículo ya no llega empacado, y sin esto no habría manera de quitarla.
    presentacion   = v_pres,
    unidades_por_presentacion = case when v_pres is null then null
                                     else p_unidades_por_presentacion end
  where id = p_id;
end;
$function$;

revoke all on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean, text, numeric) from public, anon;
grant execute on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean, text, numeric)
  to authenticated, service_role;

revoke all on function public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean, text, numeric) from public, anon;
grant execute on function public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean, text, numeric)
  to authenticated, service_role;

/*
  COMPROBADO DESPUÉS DE APLICARLA

    -- Las columnas están, hay una sola de cada función y anon está fuera
    select p.oid::regprocedure::text,
           has_function_privilege('anon', p.oid, 'execute') as la_tiene_anon
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('crear_articulo', 'editar_articulo');

    -- El freno muerde: cuántas trae, sin decir en qué viene
    do $x$ begin
      update public.articulos set unidades_por_presentacion = 6, presentacion = null
       where id = (select min(id) from public.articulos);
      raise exception 'ENSAYO: lo acepto, el freno no sirve';
    exception when check_violation then
      raise exception 'ENSAYO: lo rechazo, bien';
    end $x$;
*/
