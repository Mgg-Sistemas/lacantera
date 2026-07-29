-- ============================================================================
-- El signo del movimiento se recibe como entero
--
-- `private.registrar_movimiento` declaraba `p_signo smallint`, y quien la
-- llamaba escribía `1` o `-1`. Postgres tipa esos literales como `integer` y
-- la conversión de integer a smallint es de asignación, no implícita: al
-- resolver la llamada no encontraba ninguna función que encajara y fallaba
-- con "function does not exist", que no ayuda nada a entender qué pasó.
--
-- La columna de la tabla sigue siendo smallint —dos bytes bastan para un
-- +1/-1—; lo que cambia es el parámetro, que ahora acepta lo que de verdad
-- le llega.
-- ============================================================================

drop function if exists private.registrar_movimiento(
  text, smallint, bigint, bigint, numeric, numeric, text, bigint, bigint, bigint, date);

create or replace function private.registrar_movimiento(
  p_tipo        text,
  p_signo       integer,
  p_almacen     bigint,
  p_articulo    bigint,
  p_cantidad    numeric,
  p_costo_usd   numeric,
  p_nota        text default null,
  p_orden       bigint default null,
  p_renglon     bigint default null,
  p_origen      bigint default null,
  p_fecha       date default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidad text;
  v_id     bigint;
begin
  if p_signo not in (-1, 1) then
    raise exception 'El signo de un movimiento solo puede ser +1 o -1 (recibido: %).', p_signo
      using errcode = '22023';
  end if;

  select unidad into v_unidad from public.articulos where id = p_articulo;

  if v_unidad is null then
    raise exception 'No existe el artículo %.', p_articulo using errcode = 'P0002';
  end if;

  insert into public.inventario_movimientos
    (numero, fecha, tipo, signo, almacen_id, articulo_id, cantidad, unidad,
     costo_usd, orden_id, orden_renglon_id, movimiento_origen, nota, registrado_por)
  values
    (private.siguiente_numero('MOV'), coalesce(p_fecha, current_date), p_tipo, p_signo,
     p_almacen, p_articulo, p_cantidad, v_unidad, coalesce(p_costo_usd, 0),
     p_orden, p_renglon, p_origen, nullif(trim(coalesce(p_nota, '')), ''),
     (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;
