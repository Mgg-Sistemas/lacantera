/*
  CADA RENGLÓN DE VENTA DICE A QUÉ PRECIO SALE Y CÓMO SE MIDIÓ

  Dos cosas que Christopher pidió el 16/09/2026 para ventas
  (docs/explotacion-mina-plantas-y-procesos.md §12.2):

  1. LA CONDICIÓN DE LA VENTA, EN EL FORMULARIO. Hay ofertas del tipo «la
     primera sin cargo y las siguientes con un porcentaje o a precio completo», y
     «lo mejor es no fijar nada a un solo dueño o aliado, sino hacerlo parte del
     formulario». Hasta hoy el precio de un renglón era un número que se podía
     pisar sin decir por qué: un 0 no se distinguía de un error de tecleo, ni un
     9 de un descuento acordado sobre 12. Desde aquí cada renglón dice su
     condición —de lista, con descuento, sin cargo o acordado cuando no hay
     lista— y el precio lo calcula la base a partir de ella. Sin cargo exige
     motivo y la casilla de vender bajo el mínimo. Nada de esto se ata a un
     cliente: se elige en cada venta.

  2. LA UNIDAD DE VENTA. Lo profesional es vender por tonelada con romana,
     «pero hay que permitir alternativas». La lista de precios pasa a tener un
     precio por unidad (M3 o TON, para lo que tiene densidad), y el renglón de
     una nota guarda lo que sale del patio en la unidad del patio, cómo se midió
     —directa, pesada en la romana o estimada con la densidad— y la densidad que
     se usó. Hasta hoy un renglón en toneladas descontaba esas mismas cifras del
     patio como si fueran metros cúbicos.

  Todas las tablas de ventas están vacías el 16/09/2026: ni clientes, ni
  precios, ni documentos. Por eso las columnas nuevas nacen obligatorias sin
  rellenar nada, y la migración se niega a correr si eso dejó de ser cierto.
*/

do $vacias$
begin
  if exists (select 1 from public.precios_venta)
     or exists (select 1 from public.cotizacion_venta_renglones)
     or exists (select 1 from public.nota_entrega_renglones)
     or exists (select 1 from public.factura_venta_renglones) then
    raise exception 'Esta migración supone la lista de precios y los renglones de venta vacíos, como estaban el 16/09/2026. Ya no lo están: hay que decidir cómo rellenar la condición de lo que ya existe.';
  end if;
end
$vacias$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Un precio por cada unidad en que se vende
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.precios_venta add column unidad text not null;

alter table public.precios_venta drop constraint precios_venta_pkey;

alter table public.precios_venta
  add constraint precios_venta_pkey primary key (articulo_id, unidad),
  add constraint precios_venta_unidad_fkey foreign key (unidad) references public.unidades(codigo);

comment on column public.precios_venta.unidad is
  'La unidad en que se vende a este precio: la del artículo, o la otra entre M3 y TON si el artículo tiene densidad. Arena a 12 por M3 y a 9 por TON son dos filas.';

create or replace view public.v_precios_venta
  with (security_invoker = on) as
select a.id as articulo_id,
       a.codigo,
       a.nombre,
       a.categoria,
       coalesce(p.unidad, a.unidad) as unidad,
       p.moneda,
       p.precio,
       p.precio_minimo,
       p.nota,
       p.actualizado_en,
       a.activo,
       a.unidad as unidad_articulo,
       a.densidad_ton_m3
  from public.articulos a
  left join public.precios_venta p on p.articulo_id = a.id
 where a.categoria = any (array['PRODUCTO', 'SERVICIO']);

drop function public.guardar_precio_venta(bigint, numeric, numeric, character, text);

create function public.guardar_precio_venta(
  p_articulo_id bigint,
  p_precio numeric,
  p_minimo numeric default 0,
  p_moneda character default 'USD',
  p_nota text default null,
  p_unidad text default null)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_art    record;
  v_unidad text;
begin
  -- Poner precios es decidir a cuánto vende la empresa. No lo hace quien
  -- despacha; hace falta el nivel más alto del módulo.
  perform private.exigir_permiso('VENTAS', 'TOTAL');

  select id, nombre, categoria, unidad, densidad_ton_m3 into v_art
    from public.articulos where id = p_articulo_id;

  if v_art.id is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

  if v_art.categoria not in ('PRODUCTO', 'SERVICIO') then
    raise exception 'Solo se le pone precio de venta a lo que se vende. «%» es %.',
      v_art.nombre, v_art.categoria using errcode = '22023';
  end if;

  v_unidad := coalesce(nullif(btrim(coalesce(p_unidad, '')), ''), v_art.unidad);

  /*
    OTRA UNIDAD, SOLO ENTRE PESO Y VOLUMEN, Y CON DENSIDAD.

    La operación vende en metros cúbicos y lo profesional es la tonelada: hay
    que poder las dos. Un precio por tonelada de algo que el patio lleva en
    metros cúbicos solo sirve si se sabe cuánto pesa un metro; sin densidad, el
    despacho no podría decir cuánto sale del patio.
  */
  if v_unidad <> v_art.unidad then
    if not (v_art.unidad in ('M3', 'TON') and v_unidad in ('M3', 'TON')) then
      raise exception '«%» se lleva en % y no se le puede poner precio por %.',
        v_art.nombre, v_art.unidad, v_unidad
        using errcode = '22023',
              hint = 'Solo lo que se lleva en metros cúbicos o en toneladas se vende también en la otra unidad.';
    end if;
    if v_art.densidad_ton_m3 is null then
      raise exception '«%» no tiene densidad: sin ella no se sabe cuánto sale del patio por cada %.',
        v_art.nombre, v_unidad
        using errcode = '22023', hint = 'Pónsela en Inventario › Catálogo de artículos.';
    end if;
  end if;

  if coalesce(p_precio, 0) <= 0 then
    raise exception 'El precio tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if coalesce(p_minimo, 0) > p_precio then
    raise exception 'El precio mínimo (%) no puede ser mayor que el precio (%).',
      p_minimo, p_precio using errcode = '22023';
  end if;

  insert into public.precios_venta
    (articulo_id, unidad, moneda, precio, precio_minimo, nota, actualizado_por, actualizado_en)
  values
    (p_articulo_id, v_unidad, coalesce(p_moneda, 'USD'), p_precio, coalesce(p_minimo, 0),
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()), now())
  on conflict (articulo_id, unidad) do update
    set moneda = excluded.moneda,
        precio = excluded.precio,
        precio_minimo = excluded.precio_minimo,
        nota = excluded.nota,
        actualizado_por = excluded.actualizado_por,
        actualizado_en = excluded.actualizado_en;

  return p_articulo_id;
end;
$func$;

revoke all on function public.guardar_precio_venta(bigint, numeric, numeric, character, text, text) from public, anon;
grant execute on function public.guardar_precio_venta(bigint, numeric, numeric, character, text, text) to authenticated, service_role;

create function public.quitar_precio_venta(p_articulo_id bigint, p_unidad text)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_nombre text;
begin
  perform private.exigir_permiso('VENTAS', 'TOTAL');

  /*
    Con un precio por unidad hace falta poder quitar uno: el que se puso por
    tonelada a lo que ya no se vende así. No cambia nada de lo emitido, porque
    cada renglón guardó el precio de lista que tenía.
  */
  delete from public.precios_venta
   where articulo_id = p_articulo_id and unidad = p_unidad;

  if not found then
    select nombre into v_nombre from public.articulos where id = p_articulo_id;
    raise exception '«%» no tenía precio por %.', coalesce(v_nombre, p_articulo_id::text), p_unidad
      using errcode = 'P0002';
  end if;
end;
$func$;

revoke all on function public.quitar_precio_venta(bigint, text) from public, anon;
grant execute on function public.quitar_precio_venta(bigint, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Lo que dice cada renglón
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cotizacion_venta_renglones
  add column condicion text not null,
  add column precio_lista numeric(20,6),
  add column descuento_pct numeric(7,4),
  add column descuento_unitario numeric(20,6),
  add column motivo_condicion text,
  add constraint cotizacion_renglon_condicion_check
    check (condicion in ('LISTA', 'DESCUENTO', 'SIN_CARGO', 'ACORDADO')),
  add constraint cotizacion_renglon_descuento_check
    check ((descuento_pct is null or (descuento_pct > 0 and descuento_pct < 100))
           and (descuento_unitario is null or descuento_unitario > 0)),
  add constraint cotizacion_renglon_condicion_coherente check (
    case condicion
      when 'LISTA' then precio_lista is not null and precio_unitario = precio_lista
                        and descuento_pct is null and descuento_unitario is null
      when 'DESCUENTO' then precio_lista is not null and precio_unitario > 0
                        and precio_unitario < precio_lista
                        and (descuento_pct is null) <> (descuento_unitario is null)
      when 'SIN_CARGO' then precio_unitario = 0 and motivo_condicion is not null
                        and descuento_pct is null and descuento_unitario is null
      when 'ACORDADO' then precio_lista is null and precio_unitario > 0
                        and descuento_pct is null and descuento_unitario is null
    end);

alter table public.nota_entrega_renglones
  add column condicion text not null,
  add column precio_lista numeric(20,6),
  add column descuento_pct numeric(7,4),
  add column descuento_unitario numeric(20,6),
  add column motivo_condicion text,
  add column cantidad_inventario numeric(20,4),
  add column medida text,
  add column densidad_usada numeric(10,4),
  add constraint nota_renglon_condicion_check
    check (condicion in ('LISTA', 'DESCUENTO', 'SIN_CARGO', 'ACORDADO')),
  add constraint nota_renglon_descuento_check
    check ((descuento_pct is null or (descuento_pct > 0 and descuento_pct < 100))
           and (descuento_unitario is null or descuento_unitario > 0)),
  add constraint nota_renglon_condicion_coherente check (
    case condicion
      when 'LISTA' then precio_lista is not null and precio_unitario = precio_lista
                        and descuento_pct is null and descuento_unitario is null
      when 'DESCUENTO' then precio_lista is not null and precio_unitario > 0
                        and precio_unitario < precio_lista
                        and (descuento_pct is null) <> (descuento_unitario is null)
      when 'SIN_CARGO' then precio_unitario = 0 and motivo_condicion is not null
                        and descuento_pct is null and descuento_unitario is null
      when 'ACORDADO' then precio_lista is null and precio_unitario > 0
                        and descuento_pct is null and descuento_unitario is null
    end),
  add constraint nota_renglon_medida_check
    check (medida in ('DIRECTA', 'ROMANA', 'ESTIMADA')),
  add constraint nota_renglon_medida_coherente
    check ((medida is null) = (cantidad_inventario is null)
           and (cantidad_inventario is null or cantidad_inventario > 0)
           and (medida is distinct from 'ESTIMADA' or densidad_usada is not null));

alter table public.factura_venta_renglones
  add column condicion text not null,
  add column precio_lista numeric(20,6),
  add column descuento_pct numeric(7,4),
  add column descuento_unitario numeric(20,6),
  add column motivo_condicion text,
  add column cantidad_inventario numeric(20,4),
  add column medida text,
  add column densidad_usada numeric(10,4),
  add constraint factura_renglon_condicion_check
    check (condicion in ('LISTA', 'DESCUENTO', 'SIN_CARGO', 'ACORDADO')),
  add constraint factura_renglon_descuento_check
    check ((descuento_pct is null or (descuento_pct > 0 and descuento_pct < 100))
           and (descuento_unitario is null or descuento_unitario > 0)),
  add constraint factura_renglon_condicion_coherente check (
    case condicion
      when 'LISTA' then precio_lista is not null and precio_unitario = precio_lista
                        and descuento_pct is null and descuento_unitario is null
      when 'DESCUENTO' then precio_lista is not null and precio_unitario > 0
                        and precio_unitario < precio_lista
                        and (descuento_pct is null) <> (descuento_unitario is null)
      when 'SIN_CARGO' then precio_unitario = 0 and motivo_condicion is not null
                        and descuento_pct is null and descuento_unitario is null
      when 'ACORDADO' then precio_lista is null and precio_unitario > 0
                        and descuento_pct is null and descuento_unitario is null
    end),
  add constraint factura_renglon_medida_check
    check (medida in ('DIRECTA', 'ROMANA', 'ESTIMADA')),
  add constraint factura_renglon_medida_coherente
    check ((medida is null) = (cantidad_inventario is null)
           and (cantidad_inventario is null or cantidad_inventario > 0)
           and (medida is distinct from 'ESTIMADA' or densidad_usada is not null));

comment on column public.nota_entrega_renglones.condicion is
  'A qué precio sale: LISTA (el de la lista, convertido a la moneda del documento), DESCUENTO (sobre la lista, en porcentaje o en monto por unidad), SIN_CARGO (a cero, con motivo y la casilla de vender bajo el mínimo) o ACORDADO (a mano, solo cuando esa unidad no tiene precio de lista).';
comment on column public.nota_entrega_renglones.precio_lista is
  'El precio de lista por la unidad del renglón, en la moneda del documento, el día del documento. Se guarda para que el renglón se explique aunque la lista cambie o se borre.';
comment on column public.nota_entrega_renglones.cantidad_inventario is
  'Lo que sale del patio, en la unidad del artículo. Igual a la cantidad si se vende en esa unidad; convertida con la densidad si se vende en la otra. Nulo en lo que no es inventariable.';
comment on column public.nota_entrega_renglones.medida is
  'Cómo se sabe la cantidad: DIRECTA (vendida en la unidad del patio), ROMANA (toneladas del ticket de la báscula) o ESTIMADA (convertida con la densidad, sin pesar).';
comment on column public.nota_entrega_renglones.densidad_usada is
  'Las toneladas por metro cúbico con que se convirtió. Se guarda porque la del catálogo puede cambiar y el renglón tiene que poder leerse igual dentro de diez años.';

drop trigger if exists trg_normalizar on public.cotizacion_venta_renglones;
create trigger trg_normalizar before insert or update on public.cotizacion_venta_renglones
  for each row execute function private.normalizar_texto('descripcion', 'motivo_condicion');

drop trigger if exists trg_normalizar on public.nota_entrega_renglones;
create trigger trg_normalizar before insert or update on public.nota_entrega_renglones
  for each row execute function private.normalizar_texto('descripcion', 'motivo_condicion');

drop trigger if exists trg_normalizar on public.factura_venta_renglones;
create trigger trg_normalizar before insert or update on public.factura_venta_renglones
  for each row execute function private.normalizar_texto('descripcion', 'motivo_condicion');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Cargar los renglones de una cotización o de una nota
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.cargar_renglones_venta(
  p_tabla text, p_columna text, p_id bigint, p_renglones jsonb, p_moneda character, p_fecha date)
returns integer
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_item       jsonb;
  v_linea      smallint := 0;
  v_articulo   record;
  v_unidad     text;
  v_cantidad   numeric;
  v_lista_fila record;
  v_lista      numeric;
  v_tasas      record;
  v_condicion  text;
  v_pct        numeric;
  v_rebaja     numeric;
  v_precio     numeric;
  v_motivo     text;
  v_inventario numeric;
  v_medida     text;
  v_densidad   numeric;
  v_nota       boolean := p_tabla = 'nota_entrega_renglones';
begin
  if p_tabla not in ('cotizacion_venta_renglones', 'nota_entrega_renglones') then
    raise exception 'Los renglones de % no se cargan por aquí.', p_tabla using errcode = '22023';
  end if;

  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Un documento sin renglones no dice nada. Agrega al menos uno.'
      using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_linea := v_linea + 1;

    select a.id, a.nombre, a.unidad, a.activo, a.inventariable, a.densidad_ton_m3
      into v_articulo
    from public.articulos a
    where a.id = (v_item ->> 'articulo_id')::bigint;

    if v_articulo.id is null then
      raise exception 'El renglón % apunta a un artículo que no existe.', v_linea
        using errcode = 'P0002';
    end if;

    if not v_articulo.activo then
      raise exception 'El artículo "%" está dado de baja y no se puede vender.',
        v_articulo.nombre using errcode = '22023';
    end if;

    v_cantidad := coalesce((v_item ->> 'cantidad')::numeric, 0);

    if v_cantidad <= 0 then
      raise exception 'La cantidad de "%" tiene que ser mayor que cero.', v_articulo.nombre
        using errcode = '22023';
    end if;

    -- LA UNIDAD EN QUE SE VENDE. La del artículo, o la otra entre metros cúbicos
    -- y toneladas si hay densidad para convertir.
    v_unidad := coalesce(nullif(btrim(coalesce(v_item ->> 'unidad', '')), ''), v_articulo.unidad);

    if v_unidad <> v_articulo.unidad then
      if not (v_articulo.unidad in ('M3', 'TON') and v_unidad in ('M3', 'TON')) then
        raise exception '«%» se lleva en % y no se vende por %.',
          v_articulo.nombre, v_articulo.unidad, v_unidad using errcode = '22023';
      end if;
      if v_articulo.densidad_ton_m3 is null then
        raise exception '«%» no tiene densidad: sin ella no se sabe cuánto sale del patio por cada %.',
          v_articulo.nombre, v_unidad
          using errcode = '22023', hint = 'Pónsela en Inventario › Catálogo de artículos.';
      end if;
    end if;

    /*
      EL PRECIO DE LISTA, EN LA MONEDA DEL DOCUMENTO.

      La lista puede estar en dólares y el documento en bolívares. Se convierte
      pasando por el dólar con las tasas del día del documento, que son las que
      quedan congeladas en él.
    */
    select p.precio, p.precio_minimo, p.moneda into v_lista_fila
      from public.precios_venta p
     where p.articulo_id = v_articulo.id and p.unidad = v_unidad;

    v_lista := null;
    if v_lista_fila.precio is not null then
      if v_lista_fila.moneda = p_moneda then
        v_lista := v_lista_fila.precio;
      else
        select * into v_tasas from private.tasas_del_dia(p_moneda, p_fecha);
        v_lista := round(private.en_dolares(v_lista_fila.precio, v_lista_fila.moneda, p_fecha)
                         * v_tasas.tasa_usd / v_tasas.tasa, 6);
      end if;
    end if;

    /*
      LA CONDICIÓN, DICHA Y NO DEDUCIDA.

      El precio no se copia del formulario: se calcula de la condición. Así un
      renglón de lista vale lo que dice la lista, un descuento dice de cuánto, y
      un cero solo existe si alguien escribió «sin cargo» y por qué.
    */
    v_condicion := upper(nullif(btrim(coalesce(v_item ->> 'condicion', '')), ''));
    v_pct := nullif(v_item ->> 'descuento_pct', '')::numeric;
    v_rebaja := nullif(v_item ->> 'descuento_unitario', '')::numeric;
    v_motivo := nullif(btrim(coalesce(v_item ->> 'motivo_condicion', '')), '');

    if v_condicion is null then
      raise exception 'El renglón % («%») no dice a qué precio sale: de lista, con descuento, sin cargo o acordado.',
        v_linea, v_articulo.nombre
        using errcode = '22023',
              hint = 'Si el formulario no lo pregunta, recarga la página: es de antes de este cambio.';
    end if;

    if v_condicion = 'LISTA' then
      if v_lista is null then
        raise exception '«%» no tiene precio de lista por %.', v_articulo.nombre, v_unidad
          using errcode = '22023',
                hint = 'Pónselo en Ventas › Lista de precios, o véndelo a precio acordado.';
      end if;
      v_precio := v_lista;
      v_pct := null;
      v_rebaja := null;

    elsif v_condicion = 'DESCUENTO' then
      if v_lista is null then
        raise exception '«%» no tiene precio de lista por %: no hay de dónde descontar.',
          v_articulo.nombre, v_unidad
          using errcode = '22023', hint = 'Véndelo a precio acordado.';
      end if;
      if (v_pct is null) = (v_rebaja is null) then
        raise exception 'El descuento de «%» va en porcentaje o en monto por %, uno de los dos.',
          v_articulo.nombre, v_unidad using errcode = '22023';
      end if;
      if v_pct is not null then
        if v_pct <= 0 or v_pct >= 100 then
          raise exception 'El descuento de «%» tiene que estar entre 0 y 100 %%. Si no se cobra nada, es sin cargo.',
            v_articulo.nombre using errcode = '22023';
        end if;
        v_precio := round(v_lista * (100 - v_pct) / 100, 6);
      else
        if v_rebaja <= 0 or v_rebaja >= v_lista then
          raise exception 'La rebaja de «%» tiene que ser mayor que cero y menor que el precio de lista (% por %).',
            v_articulo.nombre, private.numero_es(v_lista, 2), v_unidad using errcode = '22023';
        end if;
        v_precio := v_lista - v_rebaja;
      end if;
      if v_precio <= 0 or v_precio >= v_lista then
        raise exception 'Con ese descuento «%» quedaría a % por %: no es un descuento.',
          v_articulo.nombre, private.numero_es(v_precio, 6), v_unidad using errcode = '22023';
      end if;

      -- El mínimo, en dólares los dos: la lista puede estar en otra moneda.
      if coalesce(v_lista_fila.precio_minimo, 0) > 0
         and private.en_dolares(v_precio, p_moneda, p_fecha)
             < private.en_dolares(v_lista_fila.precio_minimo, v_lista_fila.moneda, p_fecha) - 0.000001
         and not private.puede_accion('VENTAS.VENDER_BAJO_MINIMO') then
        raise exception 'De "%" no se vende por debajo de % % por %. Con el descuento queda en % %.',
          v_articulo.nombre, private.numero_es(v_lista_fila.precio_minimo, 2), v_lista_fila.moneda,
          v_unidad, private.numero_es(v_precio, 2), p_moneda
          using errcode = '22023';
      end if;

    elsif v_condicion = 'SIN_CARGO' then
      if v_motivo is null or length(v_motivo) < 4 then
        raise exception 'Un renglón sin cargo dice por qué: «%» sale sin cobrarse.', v_articulo.nombre
          using errcode = '22023';
      end if;
      if not private.puede_accion('VENTAS.VENDER_BAJO_MINIMO') then
        raise exception 'Dar «%» sin cargo lo autoriza quien pueda vender por debajo del mínimo.',
          v_articulo.nombre using errcode = '42501';
      end if;
      v_precio := 0;
      v_pct := null;
      v_rebaja := null;

    elsif v_condicion = 'ACORDADO' then
      if v_lista is not null then
        raise exception '«%» tiene precio de lista por %: sale de lista o con descuento.',
          v_articulo.nombre, v_unidad using errcode = '22023';
      end if;
      v_precio := coalesce((v_item ->> 'precio_unitario')::numeric, 0);
      if v_precio <= 0 then
        raise exception 'Escribe a cuánto se acordó «%». Si no se cobra, es sin cargo.',
          v_articulo.nombre using errcode = '22023';
      end if;
      v_pct := null;
      v_rebaja := null;

    else
      raise exception 'La condición «%» no existe: de lista, con descuento, sin cargo o acordado.',
        v_condicion using errcode = '22023';
    end if;

    /*
      LO QUE SALE DEL PATIO. Solo en la nota, que es la que mueve material, y
      solo en lo inventariable: un flete no sale de ningún patio. Si se vende en
      la otra unidad, se convierte con la densidad y queda escrito que es
      estimado; si el camión se pesó, `despachar` lo cambia después por lo que
      dijo la romana.
    */
    v_inventario := null;
    v_medida := null;
    v_densidad := null;

    if v_nota and v_articulo.inventariable then
      if v_unidad = v_articulo.unidad then
        v_inventario := v_cantidad;
        v_medida := 'DIRECTA';
      else
        v_densidad := v_articulo.densidad_ton_m3;
        v_inventario := case when v_unidad = 'TON'
                             then round(v_cantidad / v_densidad, 4)
                             else round(v_cantidad * v_densidad, 4)
                        end;
        v_medida := 'ESTIMADA';
        if v_inventario <= 0 then
          raise exception '% % de «%» no llega a mover el patio.',
            private.cantidad_es(v_cantidad), v_unidad, v_articulo.nombre using errcode = '22023';
        end if;
      end if;
    end if;

    if v_nota then
      insert into public.nota_entrega_renglones
        (nota_id, linea, articulo_id, descripcion, cantidad, unidad, precio_unitario, exento_iva,
         condicion, precio_lista, descuento_pct, descuento_unitario, motivo_condicion,
         cantidad_inventario, medida, densidad_usada)
      values
        (p_id, v_linea, v_articulo.id,
         coalesce(nullif(trim(coalesce(v_item ->> 'descripcion', '')), ''), v_articulo.nombre),
         v_cantidad, v_unidad, v_precio,
         coalesce((v_item ->> 'exento_iva')::boolean, false),
         v_condicion, v_lista, v_pct, v_rebaja, v_motivo,
         v_inventario, v_medida, v_densidad);
    else
      insert into public.cotizacion_venta_renglones
        (cotizacion_id, linea, articulo_id, descripcion, cantidad, unidad, precio_unitario, exento_iva,
         condicion, precio_lista, descuento_pct, descuento_unitario, motivo_condicion)
      values
        (p_id, v_linea, v_articulo.id,
         coalesce(nullif(trim(coalesce(v_item ->> 'descripcion', '')), ''), v_articulo.nombre),
         v_cantidad, v_unidad, v_precio,
         coalesce((v_item ->> 'exento_iva')::boolean, false),
         v_condicion, v_lista, v_pct, v_rebaja, v_motivo);
    end if;
  end loop;

  return v_linea;
end;
$func$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Despachar, facturar, devolver y cargar por planilla, por parche anclado
-- ═══════════════════════════════════════════════════════════════════════════

do $parche$
declare
  v_def text;
  r     record;
begin
  for r in
    select * from (values
      ('public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)',
       $a$  v_producto boolean;
begin$a$,
       $b$  v_producto boolean;
  v_en_ton   integer;
  v_del_patio integer;
begin$b$),

      ('public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)',
       $a$  perform private.cargar_renglones_venta(
    'nota_entrega_renglones', 'nota_id', v_id, p_renglones, v_moneda, v_fecha);$a$,
       $b$  perform private.cargar_renglones_venta(
    'nota_entrega_renglones', 'nota_id', v_id, p_renglones, v_moneda, v_fecha);

  /*
    LO QUE SE VENDE EN TONELADAS CON EL CAMIÓN PESADO LO DICE LA ROMANA.

    Si hay ticket y el camión lleva un solo material del patio, vendido en
    toneladas, esas toneladas son las del ticket y no las que se escribieron:
    para eso se pesó. Con dos materiales en el mismo camión el peso es de los
    dos juntos y no se reparte, así que cada renglón se queda con lo escrito y
    marcado como estimado.
  */
  if p_ticket_id is not null then
    select count(*) filter (where r.unidad = 'TON'), count(*)
      into v_en_ton, v_del_patio
      from public.nota_entrega_renglones r
     where r.nota_id = v_id and r.cantidad_inventario is not null;

    if v_en_ton = 1 and v_del_patio = 1 then
      update public.nota_entrega_renglones r
         set cantidad = round((v_bruto - v_tara) / 1000, 4),
             cantidad_inventario = case
               when r.densidad_usada is null then round((v_bruto - v_tara) / 1000, 4)
               else round((v_bruto - v_tara) / 1000 / r.densidad_usada, 4)
             end,
             medida = 'ROMANA'
       where r.nota_id = v_id and r.unidad = 'TON' and r.cantidad_inventario is not null;
    end if;
  end if;$b$),

      ('public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)',
       $a$    select r.id, r.articulo_id, r.cantidad, a.nombre, a.inventariable
    from public.nota_entrega_renglones r$a$,
       $b$    select r.id, r.articulo_id, coalesce(r.cantidad_inventario, r.cantidad) as cantidad,
           r.cantidad as vendida, r.unidad, a.unidad as unidad_patio, a.nombre, a.inventariable
    from public.nota_entrega_renglones r$b$),

      ('public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)',
       $a$      format('DESPACHO A %s', v_cliente.nombre), null, null, null, v_fecha);$a$,
       $b$      format('DESPACHO A %s', v_cliente.nombre), null, null, null, v_fecha,
      -- Vendido en la otra unidad: el libro lleva la del patio y guarda al
      -- lado lo que se vendió.
      p_cantidad_capturada => case when v_reng.unidad <> v_reng.unidad_patio then v_reng.vendida end,
      p_unidad_capturada   => case when v_reng.unidad <> v_reng.unidad_patio then v_reng.unidad end);$b$),

      ('public.facturar_notas(bigint[], text, date, text)',
       $a$    insert into public.factura_venta_renglones
      (factura_id, linea, articulo_id, descripcion, cantidad, unidad,
       precio_unitario, exento_iva, nota_id)
    values
      (v_id, v_linea, v_reng.articulo_id, v_reng.descripcion, v_reng.cantidad,
       v_reng.unidad, v_reng.precio_unitario, v_reng.exento_iva, v_reng.origen);$a$,
       $b$    insert into public.factura_venta_renglones
      (factura_id, linea, articulo_id, descripcion, cantidad, unidad,
       precio_unitario, exento_iva, nota_id,
       condicion, precio_lista, descuento_pct, descuento_unitario, motivo_condicion,
       cantidad_inventario, medida, densidad_usada)
    values
      (v_id, v_linea, v_reng.articulo_id, v_reng.descripcion, v_reng.cantidad,
       v_reng.unidad, v_reng.precio_unitario, v_reng.exento_iva, v_reng.origen,
       v_reng.condicion, v_reng.precio_lista, v_reng.descuento_pct, v_reng.descuento_unitario,
       v_reng.motivo_condicion, v_reng.cantidad_inventario, v_reng.medida, v_reng.densidad_usada);$b$),

      ('public.emitir_nota_credito(bigint, text, text, jsonb, date)',
       $a$  v_reng   bigint;
begin$a$,
       $b$  v_reng   bigint;
  v_unidad text;
  v_patio  numeric;
  v_fr     record;
begin$b$),

      ('public.emitir_nota_credito(bigint, text, text, jsonb, date)',
       $a$      -- El penúltimo argumento es `p_origen`, que NO es "de dónde viene esto"
      -- sino el movimiento al que este reversa, y apunta al libro de inventario.
      -- Aquí va en nulo: esta entrada no deshace nada, es material que llegó. El
      -- enlace con la nota vive en el renglón, que es donde se puede leer.
      v_mov := private.registrar_movimiento(
        'ENTRADA_DEVOLUCION', 1, v_alm, v_art.id,
        (v_item->>'cantidad')::numeric,
        coalesce((v_item->>'precio_unitario')::numeric, 0) * v_fac.tasa / v_fac.tasa_usd,
        format('Devolución del cliente por nota de crédito sobre la factura %s', v_fac.numero),
        null, null, null, v_fecha);$a$,
       $b$      /*
        LO QUE VUELVE AL PATIO, EN LA UNIDAD DEL PATIO.

        Una factura en toneladas devuelve toneladas, y el patio lleva metros
        cúbicos. Se convierte con la cuenta con que salió —la cantidad del patio
        entre la vendida, del renglón de la factura que se devuelve— y, si no se
        dice cuál, con la densidad del catálogo.
      */
      v_unidad := coalesce(nullif(v_item->>'unidad', ''), v_art.unidad);
      v_patio := (v_item->>'cantidad')::numeric;

      if v_unidad <> v_art.unidad then
        select fr.cantidad, fr.cantidad_inventario into v_fr
          from public.factura_venta_renglones fr
         where fr.id = nullif(v_item->>'renglon_factura_id', '')::bigint
           and fr.factura_id = v_fac.id
           and fr.articulo_id = v_art.id
           and fr.unidad = v_unidad;

        if v_fr.cantidad_inventario is not null then
          v_patio := round(v_patio * v_fr.cantidad_inventario / v_fr.cantidad, 4);
        elsif v_art.densidad_ton_m3 is not null
              and v_unidad in ('M3', 'TON') and v_art.unidad in ('M3', 'TON') then
          v_patio := round(case when v_unidad = 'TON' then v_patio / v_art.densidad_ton_m3
                                else v_patio * v_art.densidad_ton_m3 end, 4);
        else
          raise exception 'El renglón % devuelve «%» en % y el patio lo lleva en %: no se sabe cuánto vuelve.',
            v_linea, v_art.nombre, v_unidad, v_art.unidad using errcode = '22023';
        end if;
      end if;

      if v_patio <= 0 then
        raise exception 'Lo que devuelve el renglón % no llega a mover el patio.', v_linea
          using errcode = '22023';
      end if;

      -- El décimo argumento es `p_origen`, que NO es "de dónde viene esto" sino
      -- el movimiento al que este reversa, y apunta al libro de inventario. Aquí
      -- va en nulo: esta entrada no deshace nada, es material que llegó. El
      -- enlace con la nota vive en el renglón, que es donde se puede leer.
      v_mov := private.registrar_movimiento(
        'ENTRADA_DEVOLUCION', 1, v_alm, v_art.id,
        v_patio,
        round((v_item->>'cantidad')::numeric
              * coalesce((v_item->>'precio_unitario')::numeric, 0)
              * v_fac.tasa / v_fac.tasa_usd / v_patio, 6),
        format('Devolución del cliente por nota de crédito sobre la factura %s', v_fac.numero),
        null, null, null, v_fecha,
        p_cantidad_capturada => case when v_unidad <> v_art.unidad then (v_item->>'cantidad')::numeric end,
        p_unidad_capturada   => case when v_unidad <> v_art.unidad then v_unidad end);$b$),

      ('public.cargar_articulos_por_lote(jsonb, boolean)',
       $a$          insert into public.precios_venta
            (articulo_id, moneda, precio, precio_minimo, actualizado_por, actualizado_en)
          values
            (v_id, v_moneda, v_precio, coalesce(v_precio_min, 0), (select auth.uid()), now())
          on conflict (articulo_id) do update$a$,
       $b$          -- El precio de la planilla es el de la unidad del artículo.
          insert into public.precios_venta
            (articulo_id, unidad, moneda, precio, precio_minimo, actualizado_por, actualizado_en)
          values
            (v_id, (select a.unidad from public.articulos a where a.id = v_id),
             v_moneda, v_precio, coalesce(v_precio_min, 0), (select auth.uid()), now())
          on conflict (articulo_id, unidad) do update$b$)
    ) as t(funcion, antes, despues)
  loop
    v_def := pg_get_functiondef(r.funcion::regprocedure);
    if (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes) <> 1 then
      raise exception 'En % el texto «%» no aparece exactamente una vez.', r.funcion, r.antes;
    end if;
    execute replace(v_def, r.antes, r.despues);
  end loop;
end
$parche$;

do $ver$
begin
  if position('LA ROMANA' in pg_get_functiondef('public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)'::regprocedure)) = 0
     or position('p_unidad_capturada' in pg_get_functiondef('public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)'::regprocedure)) = 0 then
    raise exception 'despachar no quedó con la romana y la unidad del patio';
  end if;
  if position('v_reng.densidad_usada' in pg_get_functiondef('public.facturar_notas(bigint[], text, date, text)'::regprocedure)) = 0 then
    raise exception 'facturar_notas no copia la condición ni la medida';
  end if;
  if position('EN LA UNIDAD DEL PATIO' in pg_get_functiondef('public.emitir_nota_credito(bigint, text, text, jsonb, date)'::regprocedure)) = 0 then
    raise exception 'emitir_nota_credito no convierte lo devuelto';
  end if;
  if position('on conflict (articulo_id, unidad)' in pg_get_functiondef('public.cargar_articulos_por_lote(jsonb, boolean)'::regprocedure)) = 0 then
    raise exception 'la carga por planilla sigue escribiendo un precio por artículo';
  end if;
end
$ver$;
