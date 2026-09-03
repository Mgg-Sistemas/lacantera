-- ---------------------------------------------------------------------------
-- Los catálogos los lleva la empresa, no el que despliega
--
-- La líder, sobre las categorías de gasto:
--
--   «Ok, te aviso si hay cambios, igual debe ser editable, no quiero nos llamen
--    a cada rato por cosas así».
--
-- Y sobre el vale de combustible: «Añadir opción "Otro" y que el usuario
-- especifique en pocas palabras», y después «Añade Producción, y estaría
-- completo».
--
-- LO QUE LAS DOS FRASES DICEN JUNTAS
--
-- La segunda petición es la prueba de la primera. «Producción» es UNA PALABRA, y
-- meterla costó un desarrollador, una migración y un despliegue — porque los
-- motivos del vale eran un CHECK.
--
-- Ella lo dijo de las categorías de gasto. Pero el problema no es de qué lista
-- se trate: es que una lista de negocio metida en el esquema convierte cada
-- ajuste en una interrupción. Así que las dos pasan a tabla, con el mismo trato:
-- la empresa las edita, y nadie llama a nadie.
--
-- Se apartan aquí de la regla 3 de la casa —los catálogos son CHECK sobre text—
-- y a propósito. Esa regla vale para lo que inventa el sistema: los estados de
-- un documento, los tipos de movimiento. No para lo que la empresa cambia según
-- cómo mira su propio gasto.
--
-- =========================================================================
-- EL «OTRO», CON EL REMEDIO QUE ELLA MISMA PUSO
-- =========================================================================
--
-- Un OTRO suele llevarse medio catálogo el primer mes y dejarlo sin valor. Por
-- eso no estaba. Pero ella lo pidió con la cura en la misma frase —«que
-- especifique en pocas palabras»— y así entra: el detalle es OBLIGATORIO.
--
-- Y en vez de escribirlo solo para OTRO, se generaliza: cada motivo dice si
-- obliga a explicarse (`exige_detalle`). Si mañana quiere que TERCERO diga de
-- quién, es una casilla y no otra migración.
--
-- El detalle se enseña pegado al motivo en la lista, no escondido en la nota. Un
-- «Otro: cambio de aceite» repetido veinte veces es lo que avisa de que falta
-- una opción — y esa es la única defensa real contra el agujero del OTRO.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- El detalle del motivo
-- --------------------------------------------------------------------------
alter table public.despachos_combustible
  add column if not exists motivo_detalle text;

comment on column public.despachos_combustible.motivo_detalle is
  'En pocas palabras, para qué fue cuando no entra en la lista. Obligatorio si el motivo lo exige.';

drop trigger if exists trg_normalizar on public.despachos_combustible;

create trigger trg_normalizar
  before insert or update on public.despachos_combustible
  for each row
  execute function private.normalizar_texto('destino', 'nota', 'recibio_nombre', 'surtio_nombre', 'motivo_detalle');

-- --------------------------------------------------------------------------
-- Los motivos, en tabla
-- --------------------------------------------------------------------------
create table if not exists public.motivos_despacho (
  codigo         text primary key,
  nombre         text not null,
  pista          text,
  orden          smallint not null default 100,
  exige_detalle  boolean not null default false,
  activo         boolean not null default true
);

comment on table public.motivos_despacho is
  'Para qué se surtió combustible. En tabla y no en un CHECK para que la empresa la ajuste sin pedir un despliegue.';
comment on column public.motivos_despacho.exige_detalle is
  'Si es cierto, el vale obliga a explicar en pocas palabras. Es lo que la líder pidió para OTRO, generalizado.';

insert into public.motivos_despacho (codigo, nombre, pista, orden, exige_detalle) values
  ('PRODUCCION', 'Producción', 'Sacar material: excavación, trituración, planta', 10, false),
  ('OPERACION',  'Operación',  'Acarreo y movimiento dentro de la cantera',       20, false),
  ('TALLER',     'Taller',     'Mantenimiento, y la prueba de después',           30, false),
  ('PLANTA',     'Planta',     'Planta fija y generadores',                       40, false),
  ('TERCERO',    'Tercero',    'Equipo que no es de la empresa',                  50, false),
  ('OTRO',       'Otro',       'Cualquier otro caso: hay que decir cuál',         90, true)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      pista  = excluded.pista,
      orden  = excluded.orden,
      exige_detalle = excluded.exige_detalle;

alter table public.motivos_despacho enable row level security;

drop policy if exists motivos_despacho_lectura on public.motivos_despacho;
create policy motivos_despacho_lectura on public.motivos_despacho
  for select using (auth.uid() is not null);

revoke insert, update, delete on public.motivos_despacho from authenticated;

alter table public.despachos_combustible
  drop constraint if exists despacho_combustible_motivo;

alter table public.despachos_combustible
  drop constraint if exists despachos_combustible_motivo_fkey;

alter table public.despachos_combustible
  add constraint despachos_combustible_motivo_fkey
  foreign key (motivo) references public.motivos_despacho(codigo);

-- --------------------------------------------------------------------------
-- La comprobación del motivo, en un sitio
-- --------------------------------------------------------------------------
create or replace function private.motivo_del_vale(p_motivo text, p_detalle text)
returns text
language plpgsql
stable
security definer
set search_path to ''
as $func$
declare
  v_mot     record;
  v_detalle text := nullif(btrim(coalesce(p_detalle, '')), '');
begin
  select * into v_mot from public.motivos_despacho m where m.codigo = p_motivo;

  if v_mot.codigo is null then
    raise exception 'Hay que decir para qué se surtió, y "%" no está en la lista.',
      coalesce(p_motivo, '(nada)')
      using errcode = '22023';
  end if;

  if not v_mot.activo then
    raise exception 'El motivo "%" ya no se usa.', v_mot.nombre using errcode = '22023';
  end if;

  if v_mot.exige_detalle and (v_detalle is null or length(v_detalle) < 3) then
    raise exception 'Con el motivo "%" hay que decir en pocas palabras para qué fue.', v_mot.nombre
      using errcode = '23514';
  end if;

  return v_detalle;
end;
$func$;

comment on function private.motivo_del_vale(text, text) is
  'Comprueba el motivo del vale contra el catálogo y devuelve el detalle ya limpio. Existe para que la lista de motivos la lleve la empresa y no un CHECK.';

-- --------------------------------------------------------------------------
-- El código sale del nombre, y solo una vez
--
-- Se genera al crear y no se vuelve a tocar aunque el nombre cambie: el código
-- es lo que guardan los movimientos ya registrados, y renombrar «Viáticos» a
-- «Viáticos y peajes» no puede reescribir el pasado.
-- --------------------------------------------------------------------------
create or replace function private.codigo_desde_nombre(p_nombre text)
returns text
language sql
immutable
set search_path to ''
as $func$
  select left(
    regexp_replace(
      upper(translate(btrim(p_nombre),
        'áàäâéèëêíìïîóòöôúùüûñçÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇ',
        'aaaaeeeeiiiioooouuuuncAAAAEEEEIIIIOOOOUUUUNC')),
      '[^A-Z0-9]+', '_', 'g'),
    40);
$func$;

-- --------------------------------------------------------------------------
-- Guardar y quitar motivos
-- --------------------------------------------------------------------------
create or replace function public.guardar_motivo_despacho(
  p_codigo        text default null,
  p_nombre        text default null,
  p_pista         text default null,
  p_orden         smallint default null,
  p_exige_detalle boolean default false,
  p_activo        boolean default true
)
returns text
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_codigo text;
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'TOTAL');

  if length(v_nombre) < 3 then
    raise exception 'El motivo necesita un nombre.' using errcode = '22023';
  end if;

  if p_codigo is null then
    v_codigo := private.codigo_desde_nombre(v_nombre);
    if exists (select 1 from public.motivos_despacho m where m.codigo = v_codigo) then
      raise exception 'Ya hay un motivo que se llama así.' using errcode = '23505';
    end if;

    insert into public.motivos_despacho (codigo, nombre, pista, orden, exige_detalle, activo)
    values (v_codigo, v_nombre, nullif(btrim(coalesce(p_pista, '')), ''),
            coalesce(p_orden, 100::smallint), coalesce(p_exige_detalle, false),
            coalesce(p_activo, true));

    return v_codigo;
  end if;

  if not exists (select 1 from public.motivos_despacho m where m.codigo = p_codigo) then
    raise exception 'No existe el motivo "%".', p_codigo using errcode = 'P0002';
  end if;

  update public.motivos_despacho
     set nombre = v_nombre,
         pista = nullif(btrim(coalesce(p_pista, '')), ''),
         orden = coalesce(p_orden, orden),
         exige_detalle = coalesce(p_exige_detalle, exige_detalle),
         activo = coalesce(p_activo, true)
   where codigo = p_codigo;

  return p_codigo;
end;
$func$;

revoke all on function public.guardar_motivo_despacho(text, text, text, smallint, boolean, boolean) from public;
revoke all on function public.guardar_motivo_despacho(text, text, text, smallint, boolean, boolean) from anon;
grant execute on function public.guardar_motivo_despacho(text, text, text, smallint, boolean, boolean) to authenticated;

create or replace function public.borrar_motivo_despacho(p_codigo text)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_usos integer;
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'TOTAL');

  select count(*) into v_usos
    from public.despachos_combustible d where d.motivo = p_codigo;

  if v_usos > 0 then
    raise exception 'No se puede borrar: hay % vale(s) con ese motivo.', v_usos
      using errcode = '23503',
            hint = 'Desactívalo. Deja de ofrecerse al despachar, y los vales viejos siguen diciendo lo que decían.';
  end if;

  delete from public.motivos_despacho where codigo = p_codigo;
end;
$func$;

revoke all on function public.borrar_motivo_despacho(text) from public;
revoke all on function public.borrar_motivo_despacho(text) from anon;
grant execute on function public.borrar_motivo_despacho(text) to authenticated;

alter publication supabase_realtime add table public.motivos_despacho;

-- --------------------------------------------------------------------------
-- Y las categorías de gasto, igual
-- --------------------------------------------------------------------------
create or replace function public.guardar_categoria_gasto(
  p_codigo text default null,
  p_nombre text default null,
  p_padre  text default null,
  p_orden  smallint default null,
  p_activa boolean default true
)
returns text
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_codigo text;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_padre  text := nullif(btrim(coalesce(p_padre, '')), '');
  v_tiene_hijos boolean;
begin
  perform private.exigir_permiso('COMPRAS', 'TOTAL');

  if length(v_nombre) < 3 then
    raise exception 'La categoría necesita un nombre.' using errcode = '22023';
  end if;

  -- Dos niveles y no más. Un árbol hondo se ve bien en una migración y luego
  -- nadie sabe en qué rama meter un gasto: la líder pidió sus seis grupos con
  -- detalle dentro, no un organigrama.
  if v_padre is not null then
    if not exists (select 1 from public.categorias_gasto c where c.codigo = v_padre) then
      raise exception 'No existe la categoría "%".', v_padre using errcode = 'P0002';
    end if;
    if exists (select 1 from public.categorias_gasto c
                where c.codigo = v_padre and c.padre is not null) then
      raise exception 'No se puede colgar de "%": esa ya está dentro de otra.', v_padre
        using errcode = '22023',
              hint = 'Las categorías van en dos niveles: un grupo y su detalle.';
    end if;
  end if;

  if p_codigo is null then
    v_codigo := private.codigo_desde_nombre(v_nombre);

    if exists (select 1 from public.categorias_gasto c where c.codigo = v_codigo) then
      raise exception 'Ya hay una categoría que se llama así.' using errcode = '23505';
    end if;

    insert into public.categorias_gasto (codigo, nombre, padre, orden, activa)
    values (v_codigo, v_nombre, v_padre, coalesce(p_orden, 100::smallint), coalesce(p_activa, true));

    return v_codigo;
  end if;

  v_codigo := p_codigo;

  if not exists (select 1 from public.categorias_gasto c where c.codigo = v_codigo) then
    raise exception 'No existe la categoría "%".', v_codigo using errcode = 'P0002';
  end if;

  select exists (select 1 from public.categorias_gasto h where h.padre = v_codigo)
    into v_tiene_hijos;

  if v_tiene_hijos and v_padre is not null then
    raise exception '"%" tiene categorías dentro, así que no puede meterse dentro de otra.', v_codigo
      using errcode = '22023',
            hint = 'Saca primero lo que tiene dentro, o déjala como grupo principal.';
  end if;

  if v_tiene_hijos and coalesce(p_activa, true) = false
     and exists (select 1 from public.categorias_gasto h where h.padre = v_codigo and h.activa) then
    raise exception 'No se puede desactivar "%" mientras tenga categorías activas dentro.', v_codigo
      using errcode = '22023';
  end if;

  update public.categorias_gasto
     set nombre = v_nombre,
         padre  = v_padre,
         orden  = coalesce(p_orden, orden),
         activa = coalesce(p_activa, true)
   where codigo = v_codigo;

  return v_codigo;
end;
$func$;

comment on function public.guardar_categoria_gasto(text, text, text, smallint, boolean) is
  'Crea o cambia una categoría de gasto. Existe para que la empresa la ajuste sin pedir un despliegue: la líder lo pidió así, «no quiero nos llamen a cada rato por cosas así».';

revoke all on function public.guardar_categoria_gasto(text, text, text, smallint, boolean) from public;
revoke all on function public.guardar_categoria_gasto(text, text, text, smallint, boolean) from anon;
grant execute on function public.guardar_categoria_gasto(text, text, text, smallint, boolean) to authenticated;

-- --------------------------------------------------------------------------
-- Borrar solo lo que nunca se usó y de lo que no cuelga la deducción
--
-- El contador miraba `tesoreria_movimientos.categoria`, y ahí casi todo es nulo
-- porque la clase se DEDUCE. Con eso, borrar «Sueldos» —donde caen todas las
-- nóminas— parecía inocuo: pasaba, y los pagos quedaban «sin clasificar» sin un
-- solo error. Se cuenta sobre `v_gastos`, que es donde está la verdad.
--
-- Y los códigos a los que apunta la deducción no se borran ni estando vacíos:
-- si desaparece GASOIL, el día que se pague una orden de combustible el sistema
-- no tendrá dónde ponerla.
-- --------------------------------------------------------------------------
create or replace function public.borrar_categoria_gasto(p_codigo text)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_usos integer;
  v_de_la_maquina text[] := array[
    'SUELDOS', 'GASOIL', 'LUBRICANTES', 'REPUESTOS', 'HERRAMIENTAS', 'EPP', 'INSUMOS_VARIOS'
  ];
begin
  perform private.exigir_permiso('COMPRAS', 'TOTAL');

  if p_codigo = any (v_de_la_maquina) then
    raise exception 'No se puede borrar "%": el sistema clasifica gastos ahí solo.', p_codigo
      using errcode = '23503',
            hint = 'Desactívala si no quieres verla, o cámbiale el nombre. Los gastos que el sistema deduce seguirán encontrándola.';
  end if;

  if exists (select 1 from public.categorias_gasto h where h.padre = p_codigo) then
    raise exception 'No se puede borrar: tiene categorías dentro.' using errcode = '23503';
  end if;

  select count(*) into v_usos
    from public.v_gastos g where g.categoria = p_codigo;

  if v_usos > 0 then
    raise exception 'No se puede borrar: hay % gasto(s) en esa categoría.', v_usos
      using errcode = '23503',
            hint = 'Desactívala. Deja de ofrecerse al registrar, y los gastos viejos siguen contando.';
  end if;

  delete from public.categorias_gasto where codigo = p_codigo;
end;
$func$;

comment on function public.borrar_categoria_gasto(text) is
  'Borra una categoría que nunca se usó y de la que no cuelga la deducción automática. Lo demás se desactiva, no se borra.';

revoke all on function public.borrar_categoria_gasto(text) from public;
revoke all on function public.borrar_categoria_gasto(text) from anon;
grant execute on function public.borrar_categoria_gasto(text) to authenticated;

alter publication supabase_realtime add table public.categorias_gasto;

-- --------------------------------------------------------------------------
-- La vista del vale, con el detalle del motivo
-- --------------------------------------------------------------------------
drop view if exists public.v_despachos_combustible;

create view public.v_despachos_combustible as
select
  d.id, d.numero, d.fecha, d.hora,
  d.motivo, d.motivo_detalle,
  d.articulo_id,
  a.codigo as articulo_codigo,
  a.nombre as combustible,
  a.unidad,
  d.almacen_id,
  al.nombre as tanque,
  d.cantidad,
  d.maquina_id,
  mq.codigo as maquina_codigo,
  coalesce(mq.nombre, d.destino) as destino,
  mq.tipo as maquina_tipo,
  d.horometro,
  d.empleado_id,
  d.recibio_nombre as recibio,
  d.recibio_cedula,
  d.surtio_nombre as surtio,
  d.registrado_por,
  d.costo_usd,
  d.nota,
  d.registrado_en
from public.despachos_combustible d
join public.articulos a on a.id = d.articulo_id
join public.almacenes al on al.id = d.almacen_id
left join public.maquinaria mq on mq.id = d.maquina_id;

alter view public.v_despachos_combustible set (security_invoker = on);

comment on view public.v_despachos_combustible is
  'Los vales de combustible. No une con empleados a propósito: el nombre va copiado dentro del vale, porque quien despacha no tiene permiso de nómina.';

-- --------------------------------------------------------------------------
-- Y la función del despacho pasa a preguntarle al catálogo
--
-- Solo cambia el bloque del motivo: donde había una lista escrita a mano, ahora
-- hay una llamada a `private.motivo_del_vale`. Lo demás queda igual.
-- --------------------------------------------------------------------------
-- Se borra y se vuelve a crear, no se reemplaza. Es la misma razon que deja
-- escrita `20260824150000_el_vale_de_combustible_dice_quien_para_que_y_con_que`
-- unas migraciones antes: PostgREST resuelve por nombre de argumento, asi que un
-- `create or replace` que anade un parametro —aqui `p_motivo_detalle`— no
-- reemplaza nada, crea una SEGUNDA funcion, y cual de las dos atiende depende de
-- lo que mande el navegador. En produccion no se noto porque la vieja se borro a
-- mano y ese borrado nunca llego a un archivo; al reaplicar las migraciones
-- sobre una base limpia reaparecian las dos.
drop function if exists public.despachar_combustible(
  bigint, bigint, numeric, text, bigint, text, numeric, bigint, text, text, date, text);

create function public.despachar_combustible(
  p_articulo_id     bigint,
  p_almacen_id      bigint,
  p_cantidad        numeric,
  p_motivo          text,
  p_motivo_detalle  text    default null,
  p_maquina_id      bigint  default null,
  p_destino         text    default null,
  p_horometro       numeric default null,
  p_empleado_id     bigint  default null,
  p_recibio_nombre  text    default null,
  p_recibio_cedula  text    default null,
  p_fecha           date    default null,
  p_nota            text    default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_fecha  date := coalesce(p_fecha, (now() at time zone 'America/Caracas')::date);
  v_hoy    date := (now() at time zone 'America/Caracas')::date;
  v_art    record;
  v_maq    record;
  v_alm    record;
  v_comb   record;
  v_hay      numeric;
  v_unitario numeric;
  v_costo    numeric;
  v_ultimo   numeric;
  v_lectura  numeric;
  v_recibe   text;
  v_cedula   text;
  v_surtio   text;
  v_detalle  text;
  v_mov      bigint;
  v_id       bigint;
  v_donde    text;
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if v_fecha > v_hoy then
    raise exception 'No se despacha combustible con fecha futura.' using errcode = '22023';
  end if;

  -- El motivo se comprueba contra el catálogo, que lleva la empresa.
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
    raise exception 'El combustible sale del tanque, no de "%". Ese almacén es de tipo %.',
      v_alm.nombre, v_alm.tipo
      using errcode = '22023',
            hint = 'Si el gasoil está cargado en otro almacén, transfiéralo primero al tanque.';
  end if;

  if p_maquina_id is not null then
    select * into v_maq from public.maquinaria where id = p_maquina_id;
    if v_maq.id is null then
      raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
    end if;
    v_donde := v_maq.nombre;

    if v_maq.combustible_id is not null and v_maq.combustible_id <> p_articulo_id then
      select nombre into v_comb from public.articulos where id = v_maq.combustible_id;
      raise exception '"%" usa % y se le está echando %.',
        v_maq.nombre, coalesce(v_comb.nombre, 'otro combustible'), v_art.nombre
        using errcode = '22023',
              hint = 'Si la ficha de la máquina está equivocada, corríjala en Maquinaria.';
    end if;
  else
    if length(btrim(coalesce(p_destino, ''))) < 3 then
      raise exception 'Hay que decir a qué se le echó.' using errcode = '23514';
    end if;
    v_donde := btrim(p_destino);
  end if;

  if p_empleado_id is not null then
    select btrim(e.nombres || ' ' || e.apellidos), e.cedula
      into v_recibe, v_cedula
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

  v_hay := private.existencia(p_almacen_id, p_articulo_id);
  if v_hay < p_cantidad then
    raise exception 'En el tanque solo quedan % % de %.',
      v_hay, v_art.unidad, v_art.nombre using errcode = '55000';
  end if;

  if p_horometro is not null and p_maquina_id is not null then
    select d.horometro into v_ultimo
      from public.despachos_combustible d
     where d.maquina_id = p_maquina_id
       and d.horometro is not null
       and d.fecha <= v_fecha
     order by d.fecha desc, d.id desc
     limit 1;

    select l.final into v_lectura
      from public.horometro_lecturas l
     where l.maquina_id = p_maquina_id
       and l.fecha <= v_fecha
     order by l.fecha desc, l.id desc
     limit 1;

    if (v_ultimo is not null and p_horometro < v_ultimo)
       or (v_lectura is not null and p_horometro < v_lectura) then
      perform private.notificar(
        'COMBUSTIBLE', 'HOROMETRO_NO_ARRASTRA',
        format('El horómetro de %s no cuadra', v_maq.nombre),
        format('Se surtió con %s y lo anterior marcaba %s. Suele ser el tablero, pero conviene mirarlo.',
               p_horometro, greatest(coalesce(v_ultimo, 0), coalesce(v_lectura, 0))),
        '/app/combustible', array['ALMACEN', 'OPERACIONES'], 'ATENCION');
    end if;
  end if;

  v_unitario := private.costo_promedio(p_almacen_id, p_articulo_id);
  v_costo    := v_unitario * p_cantidad;

  v_mov := private.registrar_movimiento(
    'SALIDA_CONSUMO', -1, p_almacen_id, p_articulo_id, p_cantidad, v_unitario,
    format('Combustible · %s · %s', v_donde, coalesce(v_detalle, p_motivo)),
    null, null, null, v_fecha);

  insert into public.despachos_combustible
    (numero, fecha, hora, articulo_id, almacen_id, cantidad, motivo, motivo_detalle,
     maquina_id, destino, horometro, empleado_id, recibio_nombre, recibio_cedula,
     surtio_nombre, costo_usd, movimiento_id, nota, registrado_por)
  values
    (private.siguiente_numero('CMB'), v_fecha,
     case when v_fecha = v_hoy then (now() at time zone 'America/Caracas')::time else null end,
     p_articulo_id, p_almacen_id, p_cantidad, p_motivo, v_detalle,
     p_maquina_id, nullif(btrim(coalesce(p_destino, '')), ''), p_horometro,
     p_empleado_id, v_recibe, v_cedula, v_surtio,
     v_costo, v_mov, nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  if v_art.stock_minimo > 0 and (v_hay - p_cantidad) <= v_art.stock_minimo then
    perform private.notificar(
      'COMBUSTIBLE', 'TANQUE_BAJO',
      format('Queda poco %s', v_art.nombre),
      format('Quedan %s %s, y el mínimo son %s.', v_hay - p_cantidad, v_art.unidad, v_art.stock_minimo),
      '/app/combustible', array['ALMACEN', 'OPERACIONES', 'COMPRAS'], 'ATENCION');
  end if;

  return v_id;
end;
$func$;

comment on function public.despachar_combustible(bigint, bigint, numeric, text, text, bigint, text, numeric, bigint, text, text, date, text) is
  'Un vale de combustible: quién lo recibió, cuándo, para qué, a qué máquina, cuánto y de qué combustible. El motivo se comprueba contra el catálogo que lleva la empresa.';

revoke all on function public.despachar_combustible(bigint, bigint, numeric, text, text, bigint, text, numeric, bigint, text, text, date, text) from public;
revoke all on function public.despachar_combustible(bigint, bigint, numeric, text, text, bigint, text, numeric, bigint, text, text, date, text) from anon;
grant execute on function public.despachar_combustible(bigint, bigint, numeric, text, text, bigint, text, numeric, bigint, text, text, date, text) to authenticated;
