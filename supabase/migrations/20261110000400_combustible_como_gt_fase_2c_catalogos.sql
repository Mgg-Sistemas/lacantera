/*
  COMBUSTIBLE COMO GOLDEN TOUCH · FASE 2c: TANQUES, CATÁLOGOS, CUBICACIÓN Y
  CONCILIACIÓN (10/11/2026)

    · combustible_guardar_tanque        crea el almacén COMBUSTIBLE si no
                                        existe, y su ficha de tanque
    · combustible_desactivar_tanque     no con litros dentro
    · combustible_guardar_catalogo      equipos, autorizados y destinos
    · combustible_asegurar_catalogo     el valor que se escribe al vuelo
    · combustible_activar_catalogos     «¿Puede surtir?» de varios a la vez
    · combustible_fijar_tanques_permitidos  de qué tanques surte cada equipo
    · combustible_borrar_catalogo       solo lo que nunca se usó
    · combustible_cubicar               altura → litros, con la geometría
                                        del tanque (sin escribir)
    · combustible_registrar_cubicacion  la medición con la varilla, con los
                                        litros calculados aquí
    · combustible_borrar_cubicacion
    · combustible_resumen_periodo       el libro de cada tanque en un rango
    · combustible_registrar_conciliacion libro contra lo que reporta la mina

  Aditiva: no toca ninguna fila existente.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Cubicación: altura → litros
-- ═══════════════════════════════════════════════════════════════════════════

/*
  LAS FÓRMULAS DEL EXCEL «CUBICACIÓN TANQUES» DE GOLDEN TOUCH
  (tanques.repository.ts, cubicarLitros):

    · Cilíndrico horizontal: θ = 2·acos((R−h)/R); área = ½·R²·(θ − sen θ);
      litros = área · largo · 1000. La altura no pasa del diámetro.
    · Rectangular: litros = largo · ancho · h · 1000. La altura no pasa del
      alto, si se conoce.

  Sin las medidas que hacen falta, cero: la cubicación se niega más arriba.
  La misma cuenta vive en src/lib/combustible/cubicacion.ts para la pantalla.
*/
create or replace function private.combustible_cubicar_litros(
  p_tipo text, p_radio numeric, p_largo numeric, p_ancho numeric, p_alto numeric, p_altura_cm numeric)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  h     numeric := greatest(0, coalesce(p_altura_cm, 0) / 100);
  hh    numeric;
  theta double precision;
  area  double precision;
begin
  if p_tipo = 'cilindrico_horizontal' then
    if coalesce(p_radio, 0) <= 0 or coalesce(p_largo, 0) <= 0 then
      return 0;
    end if;
    hh := least(h, 2 * p_radio);
    theta := 2 * acos(least(1, greatest(-1, ((p_radio - hh) / p_radio)::double precision)));
    area := 0.5 * (p_radio::double precision ^ 2) * (theta - sin(theta));
    return round((area * p_largo::double precision * 1000)::numeric, 2);
  end if;

  if coalesce(p_largo, 0) <= 0 or coalesce(p_ancho, 0) <= 0 then
    return 0;
  end if;
  hh := case when coalesce(p_alto, 0) > 0 then least(h, p_alto) else h end;
  return round(p_largo * p_ancho * hh * 1000, 2);
end;
$$;

-- La capacidad por fórmula: el tanque lleno hasta su altura total.
create or replace function private.combustible_capacidad_calculada(
  p_tipo text, p_radio numeric, p_largo numeric, p_ancho numeric, p_alto numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select nullif(
    case when p_tipo = 'cilindrico_horizontal'
         then private.combustible_cubicar_litros(p_tipo, p_radio, p_largo, p_ancho, p_alto, coalesce(p_radio, 0) * 2 * 100)
         else private.combustible_cubicar_litros(p_tipo, p_radio, p_largo, p_ancho, p_alto, coalesce(p_alto, 0) * 100)
    end, 0);
$$;

-- Los litros de un tanque a una fecha (todos sus combustibles, que son litros).
create or replace function private.combustible_saldo_a(p_almacen bigint, p_fecha date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(m.cantidad * m.signo), 0)
    from public.inventario_movimientos m
   where m.almacen_id = p_almacen and (p_fecha is null or m.fecha <= p_fecha);
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Tanques
-- ═══════════════════════════════════════════════════════════════════════════

/*
  CREAR O CORREGIR UN TANQUE (Golden Touch, TanqueModal).

  El tanque es un almacén de tipo COMBUSTIBLE: si `p_almacen_id` viene nulo se
  crea, con el código que se escriba o con el siguiente de la serie. La
  capacidad rotulada vive en el almacén (y es el tope que ya cuida el libro);
  la calculada sale de las medidas, aquí.

  Lo que no se deja: una capacidad menor que lo que ya hay, volver bidón un
  tanque con litros y cambiar entre «con costo» y «sin costo» un tanque que ya
  tiene historia.
*/
create or replace function public.combustible_guardar_tanque(
  p_almacen_id bigint default null,
  p_nombre text default null,
  p_codigo text default null,
  p_ubicacion text default null,
  p_capacidad numeric default null,
  p_tipo_geometria text default 'rectangular',
  p_es_movil boolean default false,
  p_es_bidon boolean default false,
  p_radio_m numeric default null,
  p_largo_m numeric default null,
  p_ancho_m numeric default null,
  p_alto_m numeric default null,
  p_margen_merma_pct numeric default null,
  p_merma_implicita_pct numeric default null,
  p_orden smallint default null,
  p_recibe_compras boolean default null,
  p_sin_costo boolean default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     bigint := p_almacen_id;
  v_alm    public.almacenes;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_tipo   text := coalesce(nullif(btrim(coalesce(p_tipo_geometria, '')), ''), 'rectangular');
  v_hay    numeric;
begin
  perform private.exigir_accion('COMBUSTIBLE.TANQUES');

  if length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El tanque necesita un nombre.' using errcode = '23514';
  end if;
  if v_tipo not in ('cilindrico_horizontal', 'rectangular') then
    raise exception 'La forma del tanque tiene que ser cilíndrico horizontal o rectangular.' using errcode = '22023';
  end if;
  if p_capacidad is not null and p_capacidad <= 0 then
    raise exception 'La capacidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if coalesce(p_radio_m, 1) <= 0 or coalesce(p_largo_m, 1) <= 0
     or coalesce(p_ancho_m, 1) <= 0 or coalesce(p_alto_m, 1) <= 0 then
    raise exception 'Las medidas del tanque tienen que ser mayores que cero.' using errcode = '22023';
  end if;
  if p_margen_merma_pct is not null and (p_margen_merma_pct < 0 or p_margen_merma_pct > 100) then
    raise exception 'El margen de merma va de 0 a 100 %%.' using errcode = '22023';
  end if;
  if p_merma_implicita_pct is not null and (p_merma_implicita_pct < 0 or p_merma_implicita_pct > 100) then
    raise exception 'La merma implícita va de 0 a 100 %%.' using errcode = '22023';
  end if;
  if v_codigo <> '' and length(v_codigo) < 2 then
    raise exception 'El código del tanque tiene que tener al menos dos letras.' using errcode = '23514';
  end if;

  if v_id is null then
    if v_codigo = '' then
      v_codigo := private.codigo_de_almacen('COMBUSTIBLE');
    end if;
    begin
      insert into public.almacenes
        (codigo, nombre, tipo, ubicacion, recibe_compras, activo, capacidad, admite_sin_costo, propietario)
      values
        (v_codigo, btrim(p_nombre), 'COMBUSTIBLE', nullif(btrim(coalesce(p_ubicacion, '')), ''),
         coalesce(p_recibe_compras, false), true, p_capacidad, coalesce(p_sin_costo, false), 'LACANTERA')
      returning id into v_id;
    exception when unique_violation then
      raise exception 'Ya existe un almacén con el código %.', v_codigo using errcode = '23505';
    end;
  else
    v_alm := private.combustible_tanque(v_id, false);
    v_hay := private.combustible_saldo_a(v_id, null);

    if p_capacidad is not null and p_capacidad < v_hay then
      raise exception 'En «%» ya hay % L: la capacidad no puede ser menor.', v_alm.nombre, private.cantidad_es(v_hay)
        using errcode = '22023';
    end if;
    if coalesce(p_es_bidon, false)
       and not coalesce((select t.es_bidon from public.combustible_tanques t where t.almacen_id = v_id), false)
       and v_hay <> 0 then
      raise exception '«%» tiene % L: un tanque con litros no se vuelve bidón, porque un bidón no guarda saldo.',
        v_alm.nombre, private.cantidad_es(v_hay) using errcode = '22023';
    end if;
    if p_sin_costo is not null and p_sin_costo <> v_alm.admite_sin_costo
       and exists (select 1 from public.inventario_movimientos m where m.almacen_id = v_id) then
      raise exception 'Si «%» lleva combustible con costo o sin costo no se cambia con historia: mezclaría las dos cosas en el mismo saldo.',
        v_alm.nombre using errcode = '22023';
    end if;

    begin
      update public.almacenes
         set codigo           = case when v_codigo <> '' then v_codigo else codigo end,
             nombre           = btrim(p_nombre),
             ubicacion        = nullif(btrim(coalesce(p_ubicacion, '')), ''),
             capacidad        = p_capacidad,
             recibe_compras   = coalesce(p_recibe_compras, recibe_compras),
             admite_sin_costo = coalesce(p_sin_costo, admite_sin_costo)
       where id = v_id;
    exception when unique_violation then
      raise exception 'Ya existe un almacén con el código %.', v_codigo using errcode = '23505';
    end;
  end if;

  insert into public.combustible_tanques
    (almacen_id, tipo_geometria, es_movil, es_bidon, radio_m, largo_m, ancho_m, alto_m,
     capacidad_calculada_litros, margen_merma_pct, merma_implicita_pct, orden)
  values
    (v_id, v_tipo, coalesce(p_es_movil, false), coalesce(p_es_bidon, false),
     p_radio_m, p_largo_m, p_ancho_m, p_alto_m,
     private.combustible_capacidad_calculada(v_tipo, p_radio_m, p_largo_m, p_ancho_m, p_alto_m),
     coalesce(p_margen_merma_pct, 10), coalesce(p_merma_implicita_pct, 0.5), coalesce(p_orden, 100))
  on conflict (almacen_id) do update
     set tipo_geometria             = excluded.tipo_geometria,
         es_movil                   = excluded.es_movil,
         es_bidon                   = excluded.es_bidon,
         radio_m                    = excluded.radio_m,
         largo_m                    = excluded.largo_m,
         ancho_m                    = excluded.ancho_m,
         alto_m                     = excluded.alto_m,
         capacidad_calculada_litros = excluded.capacidad_calculada_litros,
         margen_merma_pct           = coalesce(p_margen_merma_pct, public.combustible_tanques.margen_merma_pct),
         merma_implicita_pct        = coalesce(p_merma_implicita_pct, public.combustible_tanques.merma_implicita_pct),
         orden                      = coalesce(p_orden, public.combustible_tanques.orden),
         actualizado_por            = (select auth.uid()),
         actualizado_en             = now();

  return v_id;
end;
$$;

-- Apagar un tanque: solo vacío y sin pendientes. Encenderlo, siempre.
create or replace function public.combustible_desactivar_tanque(p_almacen_id bigint, p_activo boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alm public.almacenes;
  v_hay numeric;
  v_txt text;
begin
  perform private.exigir_accion('COMBUSTIBLE.TANQUES');
  v_alm := private.combustible_tanque(p_almacen_id, false);

  if not coalesce(p_activo, false) and v_alm.activo then
    v_hay := private.combustible_saldo_a(p_almacen_id, null);
    if v_hay <> 0 then
      raise exception 'No se puede desactivar «%»: tiene % L cargados. Vacialo primero (un uso, un traslado o una merma) y después desactivalo, para no dejar esos litros sin cuadrar.',
        v_alm.nombre, private.cantidad_es(v_hay) using errcode = '55000';
    end if;
    select string_agg(c.detalle, ' ' order by c.que) into v_txt
      from private.comprobar_desactivar_almacen(p_almacen_id) c where c.nivel = 'BLOQUEA';
    if v_txt is not null then
      raise exception 'No se puede desactivar todavía: %', v_txt using errcode = '55000';
    end if;
  end if;

  update public.almacenes set activo = coalesce(p_activo, false) where id = p_almacen_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Catálogos
-- ═══════════════════════════════════════════════════════════════════════════

-- Los tanques permitidos tienen que ser tanques. Vacío es «de todos».
create or replace function private.combustible_tanques_validos(p_tanques bigint[])
returns bigint[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_malos text;
begin
  if p_tanques is null or cardinality(p_tanques) = 0 then
    return null;
  end if;
  select string_agg(t::text, ', ') into v_malos
    from unnest(p_tanques) t
   where not exists (select 1 from public.almacenes a where a.id = t and a.tipo = 'COMBUSTIBLE');
  if v_malos is not null then
    raise exception 'Estos no son tanques de combustible: %.', v_malos using errcode = '22023';
  end if;
  return (select array_agg(distinct t order by t) from unnest(p_tanques) t);
end;
$$;

/*
  GUARDAR UN VALOR DEL CATÁLOGO.

  Un equipo puede ir atado a su ficha de Maquinaria (`p_maquina_id`); su nombre
  sale de ahí si no se escribe otro. Los acentos y las mayúsculas no hacen dos
  valores distintos. Al renombrar un autorizado o un destino, los movimientos
  que lo usaban cambian con él —es texto, no una llave—; un equipo atado a una
  máquina no lo necesita: el libro lo nombra por la máquina.

  `p_tanques_permitidos` al corregir: nulo es «no lo toques»; vacío, «de todos».
*/
create or replace function public.combustible_guardar_catalogo(
  p_id bigint default null,
  p_tipo text default null,
  p_valor text default null,
  p_maquina_id bigint default null,
  p_activo boolean default null,
  p_orden smallint default null,
  p_tanques_permitidos bigint[] default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viejo public.combustible_catalogos;
  v_valor text := nullif(btrim(coalesce(p_valor, '')), '');
  v_id    bigint;
  v_tipo  text;
begin
  perform private.exigir_accion('COMBUSTIBLE.CATALOGOS');

  if p_id is not null then
    select * into v_viejo from public.combustible_catalogos where id = p_id for update;
    if v_viejo.id is null then
      raise exception 'Ese valor del catálogo no existe.' using errcode = 'P0002';
    end if;
  end if;

  v_tipo := coalesce(v_viejo.tipo, p_tipo);
  if v_tipo is null or v_tipo not in ('equipo', 'autorizado', 'ubicacion') then
    raise exception 'El catálogo tiene que ser de equipos, de autorizados o de destinos.' using errcode = '22023';
  end if;
  if p_id is not null and p_tipo is not null and p_tipo <> v_viejo.tipo then
    raise exception 'Un valor del catálogo no cambia de lista: creá otro en la que corresponde.' using errcode = '22023';
  end if;

  if p_maquina_id is not null then
    if v_tipo <> 'equipo' then
      raise exception 'Solo un equipo se ata a una máquina.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.maquinaria where id = p_maquina_id) then
      raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
    end if;
    if exists (select 1 from public.combustible_catalogos
                where maquina_id = p_maquina_id and id is distinct from p_id) then
      raise exception 'Esa máquina ya está en el catálogo.' using errcode = '23505';
    end if;
    v_valor := coalesce(v_valor, (select nombre from public.maquinaria where id = p_maquina_id));
  end if;

  v_valor := coalesce(v_valor, v_viejo.valor);
  if v_valor is null or length(v_valor) < 2 then
    raise exception 'Escribí el valor.' using errcode = '23514';
  end if;

  if p_tanques_permitidos is not null and cardinality(p_tanques_permitidos) > 0 and v_tipo <> 'equipo' then
    raise exception 'Solo los equipos dicen de qué tanques surten.' using errcode = '22023';
  end if;

  begin
    if p_id is null then
      insert into public.combustible_catalogos (tipo, valor, maquina_id, activo, orden, tanques_permitidos)
      values (v_tipo, v_valor, p_maquina_id, coalesce(p_activo, true), coalesce(p_orden, 100),
              private.combustible_tanques_validos(p_tanques_permitidos))
      returning id into v_id;
    else
      update public.combustible_catalogos
         set valor              = v_valor,
             maquina_id         = coalesce(p_maquina_id, maquina_id),
             activo             = coalesce(p_activo, activo),
             orden              = coalesce(p_orden, orden),
             tanques_permitidos = case when p_tanques_permitidos is null then tanques_permitidos
                                       else private.combustible_tanques_validos(p_tanques_permitidos) end
       where id = p_id
      returning id into v_id;
    end if;
  exception when unique_violation then
    raise exception 'Ese valor ya existe en el catálogo (los acentos no cuentan: «MARÍA» y «MARIA» son el mismo).'
      using errcode = '23505';
  end;

  -- El renombre llega a los movimientos que guardaban el texto.
  if p_id is not null and v_viejo.valor is distinct from v_valor and v_viejo.maquina_id is null then
    if v_tipo = 'autorizado' then
      update public.combustible_mov_datos set autorizado = v_valor,
             actualizado_por = (select auth.uid()), actualizado_en = now()
       where autorizado = v_viejo.valor;
    elsif v_tipo = 'ubicacion' then
      update public.combustible_mov_datos set ubicacion = v_valor,
             actualizado_por = (select auth.uid()), actualizado_en = now()
       where ubicacion = v_viejo.valor;
    elsif v_tipo = 'equipo' then
      update public.combustible_mov_datos set equipo = v_valor,
             actualizado_por = (select auth.uid()), actualizado_en = now()
       where equipo = v_viejo.valor and maquina_id is null;
    end if;
  end if;

  return v_id;
end;
$$;

-- El valor que alguien escribe al vuelo: si ya existe (sin acentos ni
-- mayúsculas) se usa ese, y si estaba apagado se enciende; si no, se crea.
create or replace function public.combustible_asegurar_catalogo(p_tipo text, p_valor text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valor text := nullif(btrim(coalesce(p_valor, '')), '');
  v_cat   public.combustible_catalogos;
begin
  perform private.exigir_accion('COMBUSTIBLE.CATALOGOS');

  if p_tipo is null or p_tipo not in ('equipo', 'autorizado', 'ubicacion') then
    raise exception 'El catálogo tiene que ser de equipos, de autorizados o de destinos.' using errcode = '22023';
  end if;
  if v_valor is null or length(v_valor) < 2 then
    raise exception 'Escribí el valor.' using errcode = '23514';
  end if;

  select * into v_cat from public.combustible_catalogos
   where tipo = p_tipo and maquina_id is null
     and private.en_mayuscula(btrim(valor)) = private.en_mayuscula(v_valor);

  if v_cat.id is not null then
    if not v_cat.activo then
      update public.combustible_catalogos set activo = true where id = v_cat.id;
    end if;
    return v_cat.id;
  end if;

  begin
    insert into public.combustible_catalogos (tipo, valor) values (p_tipo, v_valor) returning id into v_cat.id;
  exception when unique_violation then
    -- Dos personas creándolo a la vez: el segundo se queda con el que ganó.
    select id into v_cat.id from public.combustible_catalogos
     where tipo = p_tipo and maquina_id is null
       and private.en_mayuscula(btrim(valor)) = private.en_mayuscula(v_valor);
  end;
  return v_cat.id;
end;
$$;

-- «¿Puede surtir?» de varios a la vez. Devuelve cuántos cambiaron.
create or replace function public.combustible_activar_catalogos(p_ids bigint[], p_activo boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform private.exigir_accion('COMBUSTIBLE.CATALOGOS');
  if p_activo is null then
    raise exception 'Decí si se encienden o se apagan.' using errcode = '22023';
  end if;
  update public.combustible_catalogos
     set activo = p_activo
   where id = any (coalesce(p_ids, '{}')) and activo <> p_activo;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- De qué tanques surten unos equipos. Vacío o nulo: de todos.
create or replace function public.combustible_fijar_tanques_permitidos(p_ids bigint[], p_tanques bigint[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
  v_t bigint[];
begin
  perform private.exigir_accion('COMBUSTIBLE.CATALOGOS');
  if exists (select 1 from public.combustible_catalogos
              where id = any (coalesce(p_ids, '{}')) and tipo <> 'equipo') then
    raise exception 'Solo los equipos dicen de qué tanques surten.' using errcode = '22023';
  end if;
  v_t := private.combustible_tanques_validos(p_tanques);
  update public.combustible_catalogos
     set tanques_permitidos = v_t
   where id = any (coalesce(p_ids, '{}'));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

/*
  BORRAR UN VALOR, PERO NO SI ALGO LO USA (Golden Touch, GT-INT-15).

  El vínculo de un autorizado o un destino es por texto: borrarlo no rompe
  ninguna llave, deja movimientos colgados de un nombre que ya no está. Lo que
  se usó se apaga; lo que nunca se usó se puede borrar.
*/
create or replace function public.combustible_borrar_catalogo(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat public.combustible_catalogos;
  v_n   bigint;
begin
  perform private.exigir_accion('COMBUSTIBLE.CATALOGOS');

  select * into v_cat from public.combustible_catalogos where id = p_id for update;
  if v_cat.id is null then
    raise exception 'Ese valor del catálogo no existe.' using errcode = 'P0002';
  end if;

  if v_cat.maquina_id is not null then
    select (select count(*) from public.despachos_combustible d where d.maquina_id = v_cat.maquina_id)
         + (select count(*) from public.combustible_mov_datos md
             where md.maquina_id = v_cat.maquina_id and md.despacho_id is null)
      into v_n;
  else
    select count(*) into v_n
      from public.combustible_mov_datos md
     where (v_cat.tipo = 'autorizado' and private.en_mayuscula(btrim(md.autorizado)) = private.en_mayuscula(btrim(v_cat.valor)))
        or (v_cat.tipo = 'ubicacion' and private.en_mayuscula(btrim(md.ubicacion)) = private.en_mayuscula(btrim(v_cat.valor)))
        or (v_cat.tipo = 'equipo' and private.en_mayuscula(btrim(md.equipo)) = private.en_mayuscula(btrim(v_cat.valor)));
    if v_cat.tipo = 'equipo' then
      v_n := v_n + (select count(*) from public.despachos_combustible d
                     where d.maquina_id is null
                       and private.en_mayuscula(btrim(d.destino)) = private.en_mayuscula(btrim(v_cat.valor)));
    end if;
  end if;

  if v_n > 0 then
    raise exception 'No se puede borrar «%»: lo usan % movimiento(s) de combustible. Apagalo en vez de borrarlo.',
      v_cat.valor, v_n using errcode = '55000';
  end if;

  delete from public.combustible_catalogos where id = p_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Cubicación
-- ═══════════════════════════════════════════════════════════════════════════

-- Altura → litros de un tanque, sin escribir nada. Para la calculadora.
create or replace function public.combustible_cubicar(p_almacen_id bigint, p_altura_cm numeric)
returns table (litros numeric, capacidad numeric, nivel_pct numeric, saldo_libros numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_t   public.combustible_tanques;
  v_cap numeric;
  v_l   numeric;
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'LECTURA');
  perform private.combustible_tanque(p_almacen_id, false);

  select * into v_t from public.combustible_tanques where almacen_id = p_almacen_id;
  if v_t.almacen_id is null
     or (v_t.tipo_geometria = 'cilindrico_horizontal' and (v_t.radio_m is null or v_t.largo_m is null))
     or (v_t.tipo_geometria = 'rectangular' and (v_t.largo_m is null or v_t.ancho_m is null)) then
    raise exception 'El tanque no tiene sus medidas: sin ellas no se puede cubicar.'
      using errcode = '22023', hint = 'Se escriben en la ficha del tanque.';
  end if;
  if coalesce(p_altura_cm, 0) < 0 then
    raise exception 'La altura no puede ser negativa.' using errcode = '22023';
  end if;

  v_l := private.combustible_cubicar_litros(v_t.tipo_geometria, v_t.radio_m, v_t.largo_m, v_t.ancho_m, v_t.alto_m, p_altura_cm);
  v_cap := coalesce((select a.capacidad from public.almacenes a where a.id = p_almacen_id), v_t.capacidad_calculada_litros);

  return query select v_l, v_cap,
                      case when coalesce(v_cap, 0) > 0 then round(v_l * 100 / v_cap, 1) end,
                      private.combustible_saldo_a(p_almacen_id, null);
end;
$$;

-- La medición con la varilla: los litros los calcula la base con la geometría
-- del tanque y se guardan junto al saldo del libro a esa fecha.
create or replace function public.combustible_registrar_cubicacion(
  p_almacen_id bigint, p_altura_cm numeric, p_fecha date default null, p_notas text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha date := coalesce(p_fecha, private.hoy_aqui());
  v_c     record;
  v_id    bigint;
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');
  if v_fecha > private.hoy_aqui() then
    raise exception 'No se registra una medición con fecha futura.' using errcode = '22023';
  end if;

  select * into v_c from public.combustible_cubicar(p_almacen_id, p_altura_cm);

  insert into public.combustible_cubicaciones (almacen_id, fecha, altura_cm, litros_cubicacion, saldo_libros, notas)
  values (p_almacen_id, v_fecha, p_altura_cm, v_c.litros,
          private.combustible_saldo_a(p_almacen_id, v_fecha),
          nullif(btrim(coalesce(p_notas, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.combustible_borrar_cubicacion(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_accion('COMBUSTIBLE.TANQUES');
  delete from public.combustible_cubicaciones where id = p_id;
  if not found then
    raise exception 'Esa medición no existe.' using errcode = 'P0002';
  end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Conciliación
-- ═══════════════════════════════════════════════════════════════════════════

/*
  EL LIBRO DE CADA TANQUE EN UN RANGO (Golden Touch, resumenTanquesPeriodo):
  saldo al empezar, lo que entró, salió y se perdió, y el saldo al cerrar.
  Los reversos y los ajustes van aparte y con su signo, para que la cuenta
  cierre: saldo_libros = saldo_inicial + entradas + retornos − usos −
  traslados − mermas + otros.
*/
create or replace function public.combustible_resumen_periodo(p_desde date, p_hasta date)
returns table (almacen_id bigint, tanque text, saldo_inicial numeric, entradas numeric, usos numeric,
               traslados numeric, retornos numeric, mermas numeric, otros numeric,
               saldo_libros numeric, movimientos bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'LECTURA');
  if p_desde is not null and p_hasta is not null and p_desde > p_hasta then
    raise exception 'El rango está al revés: «desde» va antes que «hasta».' using errcode = '22023';
  end if;

  return query
  select a.id, a.nombre,
         coalesce(sum(m.cantidad * m.signo) filter (where p_desde is not null and m.fecha < p_desde), 0),
         coalesce(sum(m.cantidad) filter (where r.dentro and m.tipo in ('ENTRADA_COMPRA', 'ENTRADA_DIRECTA',
                    'ENTRADA_PRODUCCION', 'TRANSFERENCIA_ENTRADA', 'AJUSTE_POSITIVO', 'CAMBIO_DUENO_ENTRADA')), 0),
         coalesce(sum(m.cantidad) filter (where r.dentro and m.tipo in ('SALIDA_CONSUMO', 'SALIDA_DESPACHO', 'SALIDA_INTERCAMBIO')), 0),
         coalesce(sum(m.cantidad) filter (where r.dentro and m.tipo in ('TRANSFERENCIA_SALIDA', 'CAMBIO_DUENO_SALIDA')), 0),
         coalesce(sum(m.cantidad) filter (where r.dentro and m.tipo = 'ENTRADA_DEVOLUCION'), 0),
         coalesce(sum(m.cantidad) filter (where r.dentro and m.tipo in ('SALIDA_MERMA', 'SALIDA_BAJA', 'AJUSTE_NEGATIVO')), 0),
         coalesce(sum(m.cantidad * m.signo) filter (where r.dentro and m.tipo in ('REVERSO', 'AJUSTE_COSTO')), 0),
         coalesce(sum(m.cantidad * m.signo) filter (where p_hasta is null or m.fecha <= p_hasta), 0),
         count(m.id) filter (where r.dentro)
    from public.almacenes a
    left join public.inventario_movimientos m on m.almacen_id = a.id
    left join lateral (select (m.id is not null
                               and (p_desde is null or m.fecha >= p_desde)
                               and (p_hasta is null or m.fecha <= p_hasta)) as dentro) r on true
   where a.tipo = 'COMBUSTIBLE'
   group by a.id, a.nombre
   order by a.nombre;
end;
$$;

-- Libro contra lo que reporta la mina, al cierre de `p_hasta`. El saldo del
-- libro lo pone la base; las diferencias salen solas.
create or replace function public.combustible_registrar_conciliacion(
  p_almacen_id bigint,
  p_saldo_reportado numeric,
  p_hasta date default null,
  p_desde date default null,
  p_saldo_cubicacion numeric default null,
  p_periodo text default null,
  p_notas text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hasta date := coalesce(p_hasta, private.hoy_aqui());
  v_id    bigint;
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');
  perform private.combustible_tanque(p_almacen_id, false);

  if p_saldo_reportado is null or p_saldo_reportado < 0 then
    raise exception 'Escribí cuántos litros reporta la mina.' using errcode = '23514';
  end if;
  if p_saldo_cubicacion is not null and p_saldo_cubicacion < 0 then
    raise exception 'Los litros de la cubicación no pueden ser negativos.' using errcode = '22023';
  end if;
  if v_hasta > private.hoy_aqui() then
    raise exception 'No se concilia un día que todavía no pasó.' using errcode = '22023';
  end if;
  if p_desde is not null and p_desde > v_hasta then
    raise exception 'El rango está al revés: «desde» va antes que «hasta».' using errcode = '22023';
  end if;

  insert into public.combustible_conciliaciones
    (almacen_id, periodo, desde, hasta, saldo_libros, saldo_reportado_mina, saldo_cubicacion, notas)
  values
    (p_almacen_id, nullif(btrim(coalesce(p_periodo, '')), ''), p_desde, v_hasta,
     private.combustible_saldo_a(p_almacen_id, v_hasta), p_saldo_reportado, p_saldo_cubicacion,
     nullif(btrim(coalesce(p_notas, '')), ''))
  returning id into v_id;

  return v_id;
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
    'private.combustible_cubicar_litros(text, numeric, numeric, numeric, numeric, numeric)',
    'private.combustible_capacidad_calculada(text, numeric, numeric, numeric, numeric)',
    'private.combustible_saldo_a(bigint, date)',
    'private.combustible_tanques_validos(bigint[])'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  foreach f in array array[
    'public.combustible_guardar_tanque(bigint, text, text, text, numeric, text, boolean, boolean, numeric, numeric, numeric, numeric, numeric, numeric, smallint, boolean, boolean)',
    'public.combustible_desactivar_tanque(bigint, boolean)',
    'public.combustible_guardar_catalogo(bigint, text, text, bigint, boolean, smallint, bigint[])',
    'public.combustible_asegurar_catalogo(text, text)',
    'public.combustible_activar_catalogos(bigint[], boolean)',
    'public.combustible_fijar_tanques_permitidos(bigint[], bigint[])',
    'public.combustible_borrar_catalogo(bigint)',
    'public.combustible_cubicar(bigint, numeric)',
    'public.combustible_registrar_cubicacion(bigint, numeric, date, text)',
    'public.combustible_borrar_cubicacion(bigint)',
    'public.combustible_resumen_periodo(date, date)',
    'public.combustible_registrar_conciliacion(bigint, numeric, date, date, numeric, text, text)'
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
  -- Las fórmulas de Golden Touch dan lo que daban allá: un cilindro lleno es
  -- π·R²·L, y medio cilindro, la mitad.
  if abs(private.combustible_cubicar_litros('cilindrico_horizontal', 1.19, 8.16, null, null, 238)
         - round((pi() * 1.19 ^ 2 * 8.16 * 1000)::numeric, 2)) > 0.05 then
    raise exception 'La cubicación del cilindro lleno no da π·R²·L.';
  end if;
  if abs(private.combustible_cubicar_litros('cilindrico_horizontal', 1.19, 8.16, null, null, 119)
         - round((pi() * 1.19 ^ 2 * 8.16 * 1000 / 2)::numeric, 2)) > 0.05 then
    raise exception 'La cubicación del cilindro a media altura no da la mitad.';
  end if;
  if private.combustible_cubicar_litros('rectangular', null, 2.0, 1.0, 0.99, 50) <> 1000 then
    raise exception 'La cubicación rectangular no da largo · ancho · alto.';
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

    -- El resumen del período cierra con el saldo del libro.
    select string_agg(r.tanque, ', ') into v_txt
      from public.combustible_resumen_periodo(null, null) r
     where r.saldo_libros <> r.saldo_inicial + r.entradas + r.retornos - r.usos - r.traslados - r.mermas + r.otros
        or r.saldo_libros <> coalesce((select sum(l.signo * l.litros) from public.v_combustible_libro l
                                        where l.tanque_id = r.almacen_id), 0);
    if v_txt is not null then
      raise exception 'El resumen del período no cierra en: %.', v_txt;
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
