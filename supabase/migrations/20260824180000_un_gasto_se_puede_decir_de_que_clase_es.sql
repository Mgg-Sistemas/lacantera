-- ---------------------------------------------------------------------------
-- Un gasto se puede decir de qué clase es
--
-- La pantalla del centro de costos avisaba —«hay que decírselo al registrarlos»—
-- y `registrar_egreso` no aceptaba ninguna categoría. La pantalla prometía algo
-- que la base no sabía hacer.
--
-- Y peor: a `private.tesoreria_inmutable` se le abrió una excepción para poder
-- clasificar un gasto después, y **no existía ninguna función que la usara**.
-- Una puerta sin picaporte.
--
-- Es exactamente el fallo que el carril de base de datos encontró esta mañana en
-- `corregir_tasa_automatica`: una función escrita y no ejercitada de punta a
-- punta. Se corrige antes de que le pase a nadie más.
--
-- POR QUÉ SOLO EL EGRESO SUELTO PIDE LA CLASE
--
-- Los gastos que nacen de pagar una orden o una nómina ya llevan de dónde
-- vienen, y `v_gastos` deduce su clase de ahí. Volver a preguntarla sería pedir
-- un dato que ya está en la base — y lo que se pregunta de más se contesta de
-- cualquier manera.
--
-- El egreso suelto es el único que no tiene origen del que deducir: por eso es
-- el único que la pide, y por eso hasta ahora era el único que salía como «sin
-- clasificar».
--
-- POR QUÉ LA CATEGORÍA SE PONE DESPUÉS DEL INSERT
--
-- Podría ser un argumento más de `private.registrar_movimiento_tesoreria`, pero
-- por esa función pasan las dieciséis que mueven dinero en el sistema.
-- Cambiarle la firma para algo que solo usa una es tocar el camino de todas.
--
-- El UPDATE de después funciona porque el disparador deja pasar esa transición
-- concreta. No es un rodeo: es usar la puerta que se abrió para esto.
--
-- QUÉ NO SE PUEDE HACER
--
-- Cambiar una clase ya puesta. Ni desde `clasificar_gasto` —comprueba que sea
-- nula—, ni desde el disparador, que solo admite la transición de nula a valor.
-- Si está mal, el camino es el de siempre en este libro: reversar el movimiento
-- y registrarlo de nuevo. Un libro donde las cifras se pueden reescribir no
-- prueba nada.
--
-- COMPROBADO, en transacción revertida:
--
--   egreso con clase de una vez ..... queda como COMEDOR
--   clase que no existe ............. bloqueado, «No existe la categoría»
--   egreso sin clase ................ nace con categoría nula
--   clasificado después ............. queda como SERVICIOS
--   reclasificar .................... bloqueado, «ya está clasificado»
--   cambiar el monto ................ bloqueado, el libro sigue inmutable
-- ---------------------------------------------------------------------------

drop function if exists public.registrar_egreso(bigint, numeric, text, date, text, text, text, text);

create function public.registrar_egreso(
  p_cuenta      bigint,
  p_monto       numeric,
  p_concepto    text,
  p_categoria   text default null,
  p_fecha       date default null,
  p_referencia  text default null,
  p_contraparte text default null,
  p_nota        text default null,
  p_tipo        text default 'EGRESO'
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_id bigint;
begin
  perform private.exigir_rol('TESORERIA');

  if length(trim(coalesce(p_concepto, ''))) < 4 then
    raise exception 'Escribe en qué se gastó. Un monto sin concepto no se puede conciliar después.'
      using errcode = '22023';
  end if;

  if p_tipo not in ('EGRESO', 'COMISION') then
    raise exception 'Tipo de egreso no válido: %.', p_tipo using errcode = '22023';
  end if;

  if p_categoria is not null
     and not exists (select 1 from public.categorias_gasto c
                      where c.codigo = p_categoria and c.activa) then
    raise exception 'No existe la categoría de gasto "%".', p_categoria using errcode = '22023';
  end if;

  v_id := private.registrar_movimiento_tesoreria(
    p_cuenta, p_tipo, -1, p_monto, p_concepto, p_fecha,
    p_referencia, p_contraparte, null, null, null, p_nota);

  if p_categoria is not null then
    update public.tesoreria_movimientos set categoria = p_categoria where id = v_id;
  end if;

  return v_id;
end;
$func$;

comment on function public.registrar_egreso(bigint, numeric, text, text, date, text, text, text, text) is
  'Un gasto suelto: el que no viene de una orden ni de una nómina. Es el único que necesita que le digan de qué clase es, porque no hay de dónde deducirlo.';

revoke all on function public.registrar_egreso(bigint, numeric, text, text, date, text, text, text, text) from public;
revoke all on function public.registrar_egreso(bigint, numeric, text, text, date, text, text, text, text) from anon;
grant execute on function public.registrar_egreso(bigint, numeric, text, text, date, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Clasificar uno que ya está registrado
-- ---------------------------------------------------------------------------
create or replace function public.clasificar_gasto(
  p_id        bigint,
  p_categoria text
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_id  bigint;
  v_hay record;
begin
  perform private.exigir_permiso('COMPRAS', 'ESCRITURA');

  if not exists (select 1 from public.categorias_gasto c
                  where c.codigo = p_categoria and c.activa) then
    raise exception 'No existe la categoría de gasto "%".', p_categoria using errcode = '22023';
  end if;

  select id, categoria, signo into v_hay
    from public.tesoreria_movimientos where id = p_id;

  if v_hay.id is null then
    raise exception 'No existe el movimiento %.', p_id using errcode = 'P0002';
  end if;

  if v_hay.signo <> -1 then
    raise exception 'Ese movimiento no es un gasto: solo se clasifican las salidas.'
      using errcode = '22023';
  end if;

  if v_hay.categoria is not null then
    raise exception 'Ese gasto ya está clasificado como "%".', v_hay.categoria
      using errcode = '22023',
            hint = 'La clase no se cambia. Si está mal, reversa el movimiento y regístralo de nuevo.';
  end if;

  update public.tesoreria_movimientos
     set categoria = p_categoria
   where id = p_id
  returning id into v_id;

  return v_id;
end;
$func$;

comment on function public.clasificar_gasto(bigint, text) is
  'Le pone la clase a un gasto que nació sin ella. Solo de nula a valor: una vez dicha no se cambia, como todo en este libro.';

revoke all on function public.clasificar_gasto(bigint, text) from public;
revoke all on function public.clasificar_gasto(bigint, text) from anon;
grant execute on function public.clasificar_gasto(bigint, text) to authenticated;
