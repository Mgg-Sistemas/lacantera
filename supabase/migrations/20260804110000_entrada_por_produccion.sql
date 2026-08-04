-- ============================================================================
-- Entrada por producción
--
-- Al patio le faltaba la puerta principal.
--
-- Hasta hoy el material solo podía entrar al inventario de tres formas: por una
-- recepción de compra, por un traslado entre almacenes o por un ajuste de
-- conteo. Ninguna sirve para lo que hace esta empresa: la piedra no se compra,
-- se produce. El tipo de movimiento ENTRADA_PRODUCCION existía desde el primer
-- día en el libro y no había manera de escribirlo.
--
-- Eso se notaba en cuanto se intentaba vender: el patio decía cero de todo, y
-- una nota de entrega contra cero es un error de existencias, no una venta.
--
-- ESTO ES PROVISIONAL Y CONVIENE SABERLO. Lo correcto es que la producción
-- entre desde Explotación, con su turno, su frente y su equipo, y que el
-- tonelaje salga de ahí en vez de teclearse. Mientras ese módulo no exista,
-- esta función es la puerta: registra lo producido con su fecha y su nota, y
-- queda en el mismo libro inmutable que todo lo demás. Cuando Explotación
-- llegue, se le cuelga por dentro y la pantalla no cambia.
--
-- El costo va en cero a propósito. Lo que cuesta producir una tonelada de
-- piedra sale de la nómina, el gasoil, la voladura y el desgaste de la
-- trituradora: es un cálculo de costos que esta empresa todavía no lleva.
-- Inventarse un número aquí valoraría el patio con una cifra que nadie
-- calculó, y ese número acabaría en un balance. Cero es falso pero es
-- evidentemente falso; un costo inventado es falso y parece cierto.
-- ============================================================================

create or replace function public.registrar_produccion(
  p_almacen_id  bigint,
  p_articulo_id bigint,
  p_cantidad    numeric,
  p_nota        text,
  p_fecha       date default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_articulo record;
  v_almacen  record;
  v_fecha    date := coalesce(p_fecha, current_date);
begin
  -- Quien cuenta el patio y quien lo opera. No hace falta ser de ventas para
  -- decir cuánta piedra se produjo hoy.
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');

  select * into v_articulo from public.articulos where id = p_articulo_id;

  if v_articulo.id is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

  if not v_articulo.inventariable then
    raise exception '"%" no se inventaría: no hay dónde meterlo.', v_articulo.nombre
      using errcode = '22023';
  end if;

  if v_articulo.categoria <> 'PRODUCTO' then
    raise exception 'La producción es de lo que la cantera fabrica. "%" está catalogado como %.',
      v_articulo.nombre, v_articulo.categoria using errcode = '22023';
  end if;

  select * into v_almacen from public.almacenes where id = p_almacen_id;

  if v_almacen.id is null then
    raise exception 'No existe el almacén %.', p_almacen_id using errcode = 'P0002';
  end if;

  if not v_almacen.activo then
    raise exception 'El patio "%" está cerrado.', v_almacen.nombre using errcode = '22023';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad producida tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se registra producción con fecha futura.' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_nota, ''))) < 4 then
    raise exception 'Escribe de dónde sale: el turno, el frente o la fecha de la voladura. Una entrada al patio sin explicación no se puede cuadrar después.'
      using errcode = '22023';
  end if;

  return private.registrar_movimiento(
    'ENTRADA_PRODUCCION', (1)::smallint, p_almacen_id, p_articulo_id,
    p_cantidad, 0, trim(p_nota), null, null, null, v_fecha);
end;
$$;

revoke execute on function public.registrar_produccion(bigint, bigint, numeric, text, date)
  from public, anon;
grant   execute on function public.registrar_produccion(bigint, bigint, numeric, text, date)
  to authenticated;
