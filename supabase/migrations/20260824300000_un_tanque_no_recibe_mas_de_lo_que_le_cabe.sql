-- ---------------------------------------------------------------------------
-- Un tanque no recibe más de lo que le cabe
--
-- Se añadió `almacenes.capacidad` para que un tanque dijera cuánto aguanta, y
-- `guardar_almacen` aprendió a escribirla. Faltaba lo otro: NADIE la leía al
-- meter material. La columna existía, la pantalla la pedía, y se podían pasar
-- cinco mil litros a un tanque de tres mil sin que nada dijera nada.
--
-- Salió mirando la pantalla de combustible: hay 5.400 litros de gasoil en el
-- patio esperando a pasar al tanque, y el traslado los habría metido sin
-- preguntar. Un dato que se pide, se guarda y no se usa es peor que no pedirlo:
-- quien lo escribió cree que el sistema lo está vigilando.
--
-- =========================================================================
-- LA REJA VA EN `registrar_movimiento`, NO EN CADA PUERTA
-- =========================================================================
--
-- Al almacén se entra por cuatro sitios —entrada directa, entrada por lotes,
-- recepción de una compra y traslado— y mañana por un quinto. Poner la
-- comprobación en las cuatro es firmar que la quinta se olvidará.
--
-- `private.registrar_movimiento` es por donde pasa TODO movimiento: es el único
-- escritor del libro. Ahí no se puede olvidar.
--
-- Solo mira las entradas (signo +1) y solo los almacenes que declararon una
-- capacidad. Hoy no hay ninguno, así que esto no cambia nada de lo que ya
-- funciona; empieza a valer en cuanto alguien escriba el tope de su tanque, que
-- es justo cuando debe empezar a valer.
--
-- =========================================================================
-- SE MIRA EL TOTAL DEL SITIO, NO EL DEL ARTÍCULO
-- =========================================================================
--
-- Un tanque de cinco mil litros aguanta cinco mil litros, no cinco mil de gasoil
-- y otros cinco mil de gasolina. La capacidad es del recipiente.
--
-- COMPROBADO, en transacción revertida, poniéndole 3.000 de tope al tanque:
--
--   traslado que cabe ................... paso, el tanque queda con 501
--   traslado que rebasa el tope ......... parado: «caben 3000.00 y ya hay
--                                         501.0000: no entran 4000 más»
--   salida de un tanque con tope ........ paso: sacar nunca desborda
--   almacén sin capacidad ............... paso, como siempre
-- ---------------------------------------------------------------------------

create or replace function private.registrar_movimiento(
  p_tipo text,
  p_signo integer,
  p_almacen bigint,
  p_articulo bigint,
  p_cantidad numeric,
  p_costo_usd numeric,
  p_nota text default null::text,
  p_orden bigint default null::bigint,
  p_renglon bigint default null::bigint,
  p_origen bigint default null::bigint,
  p_fecha date default null::date,
  p_empleado bigint default null::bigint,
  p_clase text default null::text,
  p_nota_salida text default null::text
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_unidad    text;
  v_id        bigint;
  v_capacidad numeric;
  v_nombre    text;
  v_hay       numeric;
begin
  if p_signo not in (-1, 1) then
    raise exception 'El signo de un movimiento solo puede ser +1 o -1 (recibido: %).', p_signo
      using errcode = '22023';
  end if;

  select unidad into v_unidad from public.articulos where id = p_articulo;

  if v_unidad is null then
    raise exception 'No existe el artículo %.', p_articulo using errcode = 'P0002';
  end if;

  -- Solo al entrar, y solo donde hay un tope declarado. Sacar nunca desborda.
  if p_signo = 1 then
    select capacidad, nombre into v_capacidad, v_nombre
      from public.almacenes where id = p_almacen;

    if v_capacidad is not null then
      select coalesce(sum(cantidad * signo), 0) into v_hay
        from public.inventario_movimientos where almacen_id = p_almacen;

      if v_hay + p_cantidad > v_capacidad then
        raise exception 'En "%" caben % y ya hay %: no entran % más.',
          v_nombre, v_capacidad, v_hay, p_cantidad
          using errcode = '22023',
                hint = format('Quedan %s libres.', v_capacidad - v_hay);
      end if;
    end if;
  end if;

  insert into public.inventario_movimientos
    (numero, fecha, tipo, signo, almacen_id, articulo_id, cantidad, unidad,
     costo_usd, orden_id, orden_renglon_id, movimiento_origen, nota, empleado_id,
     entrega_clase, registrado_por, nota_salida)
  values
    (private.siguiente_numero('MOV'), coalesce(p_fecha, current_date), p_tipo, p_signo,
     p_almacen, p_articulo, p_cantidad, v_unidad, coalesce(p_costo_usd, 0),
     p_orden, p_renglon, p_origen, nullif(trim(coalesce(p_nota, '')), ''), p_empleado,
     p_clase, (select auth.uid()), p_nota_salida)
  returning id into v_id;

  return v_id;
end;
$function$;

comment on function private.registrar_movimiento(text, integer, bigint, bigint, numeric, numeric, text, bigint, bigint, bigint, date, bigint, text, text) is
  'El único escritor del libro de inventario. Comprueba que lo que entra quepa: un almacén con capacidad declarada —un tanque— no recibe más de lo que aguanta.';
