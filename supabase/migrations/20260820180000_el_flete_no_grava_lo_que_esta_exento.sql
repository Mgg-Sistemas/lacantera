-- ---------------------------------------------------------------------------
-- El flete no puede gravar una operación exenta
--
-- LO QUE PASABA
--
-- Se cargaba una cotización con un solo renglón marcado «Exento de IVA»,
-- 12 barras a 8 $, y un flete de 20 $. El sistema devolvía:
--
--     Subtotal        96,00
--     Base imponible  20,00      <-- el flete, entero
--     IVA              3,20      <-- 16 % de un flete que no debía gravarse
--     Total          119,20
--
-- Lo vio Christopher: «me está colocando IVA, cuando le dije que debería ser
-- exento». Y tenía razón: el renglón sí se excluyó de la base —esa parte
-- funcionaba— pero el flete entraba después sin preguntar nada.
--
-- La línea culpable, idéntica en las dos funciones:
--
--     -- El flete es parte de la base imponible cuando lo factura el proveedor.
--     v_base := v_base + v_flete;
--
-- El comentario dice «cuando lo factura el proveedor» y el código no comprueba
-- nada: suma siempre.
--
-- POR QUÉ ESTÁ MAL, Y NO ES SOLO UNA MOLESTIA
--
-- El flete no es una operación aparte: es un gasto accesorio del suministro, y
-- sigue el tratamiento de lo que transporta (LIVA, artículo 23). Si lo que va
-- en el camión está exento, el flete de ese camión no se grava. Si va mezclado,
-- se grava en la misma proporción que la mercancía gravada.
--
-- Es exactamente el mismo razonamiento que la función ya aplicaba dos líneas
-- más arriba al descuento, y con el mismo motivo escrito: repartirlo entero
-- contra la base falsea el IVA. Al flete no se le aplicó esa idea.
--
-- ESTABA EN LOS DOS LADOS
--
-- `recalcular_cotizacion` afecta a las compras. `recalcular_venta` afecta a
-- **cotizaciones de venta, notas de entrega, facturas y notas de crédito**: eso
-- es lo que se le cobra al cliente y lo que se declara en el Libro de Ventas.
-- Ese es el lado caro.
--
-- CÓMO QUEDA
--
-- Una sola proporción gravada, aplicada al descuento y al flete por igual:
--
--     proporción = gravado / subtotal
--     base       = (gravado − descuento × proporción) + flete × proporción
--
-- Cuando todo está gravado la proporción es 1 y la cuenta sale idéntica a la de
-- antes, así que ningún documento correcto se mueve. Comprobado contra
-- FAC-2026-0001, la única con flete: 400 gravados + 120 de flete siguen dando
-- 520 de base.
--
-- El caso sin renglones se trata aparte: si no hay mercancía, el flete no es
-- accesorio de nada, es la operación entera, y se grava solo. Antes ese caso
-- salía bien por casualidad —la base valía 0 y se le sumaba el flete— y
-- conviene que siga saliendo bien a propósito.
-- ---------------------------------------------------------------------------
create or replace function private.recalcular_cotizacion(p_cotizacion_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_subtotal   numeric(20,6);
  v_gravado    numeric(20,6);
  v_descuento  numeric(20,6);
  v_flete      numeric(20,6);
  v_alicuota   numeric(5,2);
  v_proporcion numeric(20,10);
  v_base       numeric(20,6);
  v_iva        numeric(20,6);
begin
  select coalesce(sum(r.subtotal), 0),
         coalesce(sum(r.subtotal) filter (where not r.exento_iva), 0)
    into v_subtotal, v_gravado
  from public.cotizacion_renglones r
  where r.cotizacion_id = p_cotizacion_id;

  select c.descuento, c.flete, c.alicuota_iva
    into v_descuento, v_flete, v_alicuota
  from public.cotizaciones c
  where c.id = p_cotizacion_id;

  if v_subtotal > 0 then
    -- Qué parte de la mercancía tributa. El descuento y el flete la siguen los
    -- dos: repartir cualquiera de ellos entero contra la base rebajaría o
    -- inflaría un IVA que no corresponde.
    v_proporcion := v_gravado / v_subtotal;

    v_base := round(
      greatest(v_gravado - v_descuento * v_proporcion, 0)
      + v_flete * v_proporcion, 6);
  else
    -- Sin mercancía el flete no es accesorio de nada: es la operación.
    v_base := v_flete;
  end if;

  v_iva := round(v_base * v_alicuota / 100, 2);

  update public.cotizaciones
     set subtotal       = v_subtotal,
         base_imponible = v_base,
         iva            = v_iva,
         total          = round(v_subtotal - v_descuento + v_flete + v_iva, 2)
   where id = p_cotizacion_id;
end;
$function$;

-- ---------------------------------------------------------------------------
create or replace function private.recalcular_venta(p_tabla text, p_columna text, p_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_subtotal   numeric(20,6);
  v_gravado    numeric(20,6);
  v_descuento  numeric(20,6);
  v_flete      numeric(20,6);
  v_alicuota   numeric(5,2);
  v_proporcion numeric(20,10);
  v_base       numeric(20,6);
  v_iva        numeric(20,6);
  v_renglones  text := case p_tabla
                         when 'cotizaciones_venta' then 'cotizacion_venta_renglones'
                         when 'notas_entrega'      then 'nota_entrega_renglones'
                         when 'facturas_venta'     then 'factura_venta_renglones'
                         when 'notas_credito'      then 'nota_credito_renglones'
                       end;
begin
  if v_renglones is null then
    raise exception 'No sé sumar los renglones de %.', p_tabla using errcode = '22023';
  end if;

  execute format(
    'select coalesce(sum(subtotal), 0),
            coalesce(sum(subtotal) filter (where not exento_iva), 0)
       from public.%I where %I = $1', v_renglones, p_columna)
    into v_subtotal, v_gravado using p_id;

  execute format(
    'select descuento, flete, alicuota_iva from public.%I where id = $1', p_tabla)
    into v_descuento, v_flete, v_alicuota using p_id;

  if v_subtotal > 0 then
    v_proporcion := v_gravado / v_subtotal;

    v_base := round(
      greatest(v_gravado - v_descuento * v_proporcion, 0)
      + v_flete * v_proporcion, 6);
  else
    v_base := v_flete;
  end if;

  v_iva := round(v_base * v_alicuota / 100, 2);

  execute format(
    'update public.%I
        set subtotal = $1, base_imponible = $2, iva = $3, total = $4
      where id = $5', p_tabla)
    using v_subtotal, v_base, v_iva,
          round(v_subtotal - v_descuento + v_flete + v_iva, 2), p_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Y se recalculan los documentos vivos, por si alguno arrastra el reparto viejo
--
-- Los que tienen todo gravado no se mueven —la proporción es 1—, así que esto
-- solo toca lo que estuviera mal. Las facturas y notas ya emitidas se recalculan
-- igual: el número que llevan es el que se declara, y si está mal cobrado hay
-- que verlo ahora y no en la fiscalización.
-- ---------------------------------------------------------------------------
do $$
declare v_id bigint;
begin
  for v_id in select id from public.cotizaciones loop
    perform private.recalcular_cotizacion(v_id);
  end loop;

  for v_id in select id from public.cotizaciones_venta loop
    perform private.recalcular_venta('cotizaciones_venta', 'cotizacion_id', v_id);
  end loop;

  for v_id in select id from public.notas_entrega loop
    perform private.recalcular_venta('notas_entrega', 'nota_id', v_id);
  end loop;

  for v_id in select id from public.facturas_venta loop
    perform private.recalcular_venta('facturas_venta', 'factura_id', v_id);
  end loop;

  for v_id in select id from public.notas_credito loop
    perform private.recalcular_venta('notas_credito', 'nota_id', v_id);
  end loop;
end $$;
