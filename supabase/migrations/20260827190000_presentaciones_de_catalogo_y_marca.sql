/*
  LA PRESENTACION SALE DE UNA LISTA, Y EL PRODUCTO GANA MARCA Y NUMERO DE PARTE.

  Dos cosas que se pidieron al ver el campo recien puesto.

  1. «NO PODEMOS DEJARLE ESTE CAMPO TAN LIBRE A LOS USUARIOS»

  El campo «Como llega» salio como texto libre y duro una hora: «haran
  desastre, ej. Bidon, Bidom». Es exactamente lo que pasa, y el dano no es de
  ortografia: con cuatro formas de escribir el mismo envase, ninguna consulta
  los junta. Ni la que dice cuanto se compro en bidones, ni la que busca lo que
  llega en paletas, ni la comparacion de dos cotizaciones del mismo articulo.

  Se crea `presentaciones` con la forma de `unidades` —codigo, nombre, orden—
  y las tres columnas que la guardaban pasan a apuntar ahi con clave foranea:
  articulos, cotizacion_renglones y orden_renglones. La lista es cerrada porque
  el conjunto lo es: un envase se llama de una manera.

  Y LA MEDIDA NO VA EN EL NOMBRE. «BIDON DE 20 L» seria texto libre otra vez
  con un desplegable delante. La presentacion dice BIDON; cuantos litros trae
  lo dice `unidades_por_presentacion` del articulo, que es donde se puede
  contar. Lo unico que habia escrito a mano —«ENVASE DE 946 ML»— se traduce a
  ENVASE y el texto entero se conserva en la observacion del renglon, que es
  donde vivia la medida.

  2. «NO SE ESTA APRECIANDO DONDE INGRESAR LA MARCA, SERIAL, ETC»

  Porque no habia donde: iban a parar a la descripcion, que es el cajon de lo
  que no tiene campo, y de ahi no se busca ni se compara.

  `marca` es libre a proposito. Una lista cerrada de marcas envejece mal —cada
  compra puede traer una nueva— pero dejarla a pelo produce MOTUL, Motul y
  Motul S.A., asi que el formulario ofrece las que ya se han usado. Es el
  termino medio entre los dos males.

  `numero_parte` no tiene lista posible y no la busca: es el serial o la
  referencia del fabricante, distinta en cada producto. Es lo que se le dice al
  proveedor cuando el nombre no basta para que mande la pieza correcta.
*/

create table if not exists public.presentaciones (
  codigo text primary key,
  nombre text not null,
  orden  smallint not null default 100
);

comment on table public.presentaciones is
  'En que viene empacado un articulo. Lista cerrada: escrito a mano acaba en BIDON, BIDOM y BIDON DE 20.';

alter table public.presentaciones enable row level security;

drop policy if exists presentaciones_lectura on public.presentaciones;
create policy presentaciones_lectura on public.presentaciones
  for select to authenticated using (true);

grant select on public.presentaciones to authenticated, anon;

insert into public.presentaciones (codigo, nombre, orden) values
  ('BULTO',    'Bulto',        10),
  ('CAJA',     'Caja',         20),
  ('SACO',     'Saco',         30),
  ('PAQUETE',  'Paquete',      40),
  ('ATADO',    'Atado',        50),
  ('ROLLO',    'Rollo',        60),
  ('PALETA',   'Paleta',       70),
  ('BIDON',    'Bidon',        80),
  ('BARRIL',   'Barril',       90),
  ('TAMBOR',   'Tambor',      100),
  ('CUNETE',   'Cunete',      110),
  ('ENVASE',   'Envase',      120),
  ('BOTELLA',  'Botella',     130),
  ('GARRAFA',  'Garrafa',     140),
  ('CILINDRO', 'Cilindro',    150),
  ('TANQUE',   'Tanque',      160),
  ('JUEGO',    'Juego',       170),
  ('PAR',      'Par',         180)
on conflict (codigo) do nothing;

alter table public.articulos
  add column if not exists marca text,
  add column if not exists numero_parte text;

comment on column public.articulos.marca is
  'La marca del articulo. Libre pero con las ya usadas ofrecidas, para no tener MOTUL y Motul.';
comment on column public.articulos.numero_parte is
  'Numero de parte, serial o referencia del fabricante. No hay catalogo posible: es unico de cada producto.';

/*
  Lo escrito a mano se traduce a codigo antes de poner la clave foranea, o la
  clave no se puede crear. El texto entero no se pierde: se guarda en la
  observacion del renglon, porque puede llevar la medida que el codigo no dice.
*/
update public.cotizacion_renglones r
   set observacion = nullif(trim(concat_ws(' - ', r.observacion, r.presentacion)), ''),
       presentacion = p.codigo
  from public.presentaciones p
 where r.presentacion is not null
   and upper(r.presentacion) like p.codigo || '%';

update public.cotizacion_renglones
   set presentacion = null
 where presentacion is not null
   and presentacion not in (select codigo from public.presentaciones);

update public.orden_renglones o
   set presentacion = p.codigo
  from public.presentaciones p
 where o.presentacion is not null
   and upper(o.presentacion) like p.codigo || '%';

update public.orden_renglones
   set presentacion = null
 where presentacion is not null
   and presentacion not in (select codigo from public.presentaciones);

update public.articulos a
   set presentacion = p.codigo
  from public.presentaciones p
 where a.presentacion is not null
   and upper(a.presentacion) like p.codigo || '%';

update public.articulos
   set presentacion = null, unidades_por_presentacion = null
 where presentacion is not null
   and presentacion not in (select codigo from public.presentaciones);

alter table public.articulos
  drop constraint if exists articulos_presentacion_fkey;
alter table public.articulos
  add constraint articulos_presentacion_fkey
  foreign key (presentacion) references public.presentaciones(codigo);

alter table public.cotizacion_renglones
  drop constraint if exists cotizacion_renglones_presentacion_fkey;
alter table public.cotizacion_renglones
  add constraint cotizacion_renglones_presentacion_fkey
  foreign key (presentacion) references public.presentaciones(codigo);

alter table public.orden_renglones
  drop constraint if exists orden_renglones_presentacion_fkey;
alter table public.orden_renglones
  add constraint orden_renglones_presentacion_fkey
  foreign key (presentacion) references public.presentaciones(codigo);

drop function if exists public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean, text, numeric);

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
  p_unidades_por_presentacion numeric default null,
  p_marca text default null,
  p_numero_parte text default null
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
     modo_entrega, reparable, presentacion, unidades_por_presentacion,
     marca, numero_parte, creado_por)
  values
    (v_codigo, trim(p_nombre), nullif(trim(coalesce(p_descripcion, '')), ''),
     p_categoria, p_unidad,
     case when p_categoria = 'SERVICIO' then false else p_inventariable end,
     coalesce(p_stock_minimo, 0), v_modo, v_reparable,
     v_pres, p_unidades_por_presentacion,
     nullif(trim(coalesce(p_marca, '')), ''),
     nullif(trim(coalesce(p_numero_parte, '')), ''),
     (select auth.uid()))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un artículo con el código %.', v_codigo
      using errcode = '23505';
  when foreign_key_violation then
    raise exception 'Esa presentación no está en la lista.' using errcode = '23503';
end;
$function$;

drop function if exists public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean, text, numeric);

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
  p_unidades_por_presentacion numeric default null,
  p_marca text default null,
  p_numero_parte text default null
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
                                     else p_unidades_por_presentacion end,
    marca          = nullif(trim(coalesce(p_marca, '')), ''),
    numero_parte   = nullif(trim(coalesce(p_numero_parte, '')), '')
  where id = p_id;
exception
  when foreign_key_violation then
    raise exception 'Esa presentación no está en la lista.' using errcode = '23503';
end;
$function$;

revoke all on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text) from public, anon;
grant execute on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text)
  to authenticated, service_role;

revoke all on function public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text) from public, anon;
grant execute on function public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text)
  to authenticated, service_role;


/*
  COMPROBADO DESPUES DE APLICARLA

    -- 18 presentaciones, las tres claves foraneas puestas, una sola funcion de
    -- cada una y anon fuera
    select count(*) from public.presentaciones;
    select conname from pg_constraint where conname like '%_presentacion_fkey';

    -- La unica fila escrita a mano se tradujo sin perder nada:
    --   AKRON | ENVASE | ENVASE DE 946 ML
    select marca, presentacion, observacion
      from public.cotizacion_renglones where marca is not null;
*/
