-- ---------------------------------------------------------------------------
-- Cada renglón de la salida dice de dónde sale
--
-- Christopher, sobre la pantalla de Existencias:
--
--   «nos solicitan que acá, así como está el botón de entrada, que también esté
--    el botón de salida (la diferencia es que en el formulario se deberá buscar
--    qué ítem o cuáles ítems y de dónde sacarlos individualmente)»
--
-- La entrada ya se hacía así: se elige el sitio arriba y debajo van los
-- renglones. La salida no, y no por decisión: se hacía siempre desde una fila
-- de existencias, donde el almacén venía dado. Quien empieza por «necesito
-- estas cinco cosas» no tenía puerta — tenía que buscar cinco filas y sacar
-- cinco veces, y le salían cinco notas para un solo trabajo.
--
-- =========================================================================
-- POR QUÉ EL ALMACÉN VA EN EL RENGLÓN Y NO SOLO ARRIBA
-- =========================================================================
--
-- Porque lo pidió así —«de dónde sacarlos individualmente»— y porque es cierto
-- en el patio: el aceite está en el almacén general y las varillas en el patio
-- de materia prima. Obligar a hacer dos salidas para un mismo trabajo parte en
-- dos un papel que es uno solo.
--
-- El de arriba se queda como valor por defecto, que es el caso corriente: cinco
-- renglones del mismo sitio se eligen una vez.
--
-- =========================================================================
-- EL MISMO ARTÍCULO DOS VECES SE SUMA ANTES DE COMPROBAR
-- =========================================================================
--
-- Con renglones libres aparece un caso que con una sola fila no existía: pedir
-- el mismo artículo dos veces. Comprobando cada renglón contra la existencia
-- suelta, dos renglones de cuatro galones pasan aunque solo haya cuatro — cada
-- uno mira el saldo entero. Se descuenta lo ya pedido en renglones anteriores
-- de la misma nota.
--
-- =========================================================================
-- LA FIRMA NO CAMBIA
-- =========================================================================
--
-- Mismos nombres y mismos tipos, así que PostgREST la sigue resolviendo igual y
-- no hace falta borrar nada antes —que es la regla 7, la que ya costó una
-- función duplicada esta semana—. Lo único que cambia es que `p_almacen_id`
-- admite nulo, para la salida donde cada renglón trae el suyo.
--
-- COMPROBADO, en transacción revertida:
--
--   dos almacenes en una misma nota ........ NS-0001, 2 renglones, 2 almacenes
--   el de arriba como valor por defecto .... NS-0002, los 2 en el almacén 9
--   el mismo artículo repetido de más ...... parado, y nombra el renglón
--   renglón sin almacén y sin defecto ...... parado, y nombra el renglón
-- ---------------------------------------------------------------------------

create or replace function public.registrar_salidas(
  p_almacen_id bigint default null,
  p_renglones  jsonb default null,
  p_motivo     text default null,
  p_tipo       text default 'SALIDA_CONSUMO',
  p_fecha      date default null
)
returns text
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_r        jsonb;
  v_n        int := 0;
  v_almacen  bigint;
  v_articulo bigint;
  v_cantidad numeric;
  v_nombre   text;
  v_sitio    text;
  v_hay      numeric;
  v_costo    numeric;
  v_nota     text;
begin
  perform private.exigir_rol('ALMACEN');

  if p_tipo not in ('SALIDA_CONSUMO', 'SALIDA_MERMA', 'SALIDA_DESPACHO') then
    raise exception 'Tipo de salida no válido: %.', p_tipo using errcode = '22023';
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'No hay nada que sacar: la salida no trae renglones.' using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe para qué sale. Una salida sin motivo no se puede auditar.'
      using errcode = '22023';
  end if;

  -- Primera pasada: comprobar. Nada se mueve todavía, para que un renglón malo
  -- no deje tres salidas hechas y dos no.
  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_n := v_n + 1;
    v_almacen  := coalesce(nullif(btrim(coalesce(v_r->>'almacen_id', '')), '')::bigint, p_almacen_id);
    v_articulo := nullif(btrim(coalesce(v_r->>'articulo_id', '')), '')::bigint;
    v_cantidad := coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0);

    select nombre into v_sitio from public.almacenes where id = v_almacen and activo;
    if v_sitio is null then
      raise exception 'El renglón %: no dice de qué almacén sale, o ese almacén está inactivo.', v_n
        using errcode = '23503';
    end if;

    select nombre into v_nombre from public.articulos where id = v_articulo and activo;
    if v_nombre is null then
      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n
        using errcode = '23503';
    end if;

    if v_cantidad <= 0 then
      raise exception 'El renglón % (%): la cantidad tiene que ser mayor que cero.', v_n, v_nombre
        using errcode = '22023';
    end if;

    -- Se comprueba contra la existencia acumulada de la propia salida: dos
    -- renglones del mismo artículo y el mismo sitio se suman, y comprobarlos
    -- por separado dejaría pasar el doble de lo que hay.
    v_hay := private.existencia(v_almacen, v_articulo) - coalesce((
      select sum(nullif(btrim(coalesce(r->>'cantidad', '')), '')::numeric)
        from jsonb_array_elements(p_renglones) with ordinality as t(r, i)
       where t.i < v_n
         and coalesce(nullif(btrim(coalesce(r->>'almacen_id', '')), '')::bigint, p_almacen_id) = v_almacen
         and nullif(btrim(coalesce(r->>'articulo_id', '')), '')::bigint = v_articulo
    ), 0);

    if v_cantidad > v_hay then
      raise exception 'El renglón % (% en %): solo quedan % y se intentan sacar %.',
        v_n, v_nombre, v_sitio, v_hay, v_cantidad using errcode = '22023';
    end if;
  end loop;

  v_nota := private.siguiente_numero('NS');

  -- Segunda pasada: mover. El número de nota entra CON el insert y no después:
  -- el libro de inventario es inmutable y sellarlo a posteriori lo para el
  -- disparador con 23001. Y está bien que lo pare.
  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_almacen  := coalesce(nullif(btrim(coalesce(v_r->>'almacen_id', '')), '')::bigint, p_almacen_id);
    v_articulo := (v_r->>'articulo_id')::bigint;
    v_cantidad := (v_r->>'cantidad')::numeric;
    v_costo := private.costo_promedio(v_almacen, v_articulo);

    perform private.registrar_movimiento(
      p_tipo, -1, v_almacen, v_articulo, v_cantidad, v_costo,
      btrim(p_motivo), null, null, null, p_fecha, null, null, v_nota);
  end loop;

  return v_nota;
end;
$func$;

comment on function public.registrar_salidas(bigint, jsonb, text, text, date) is
  'Saca varios materiales en una sola operación y bajo un mismo número de nota. Cada renglón puede decir de qué almacén sale; si no lo dice, sale del que se indique arriba. Comprueba todos los renglones antes de mover nada.';

revoke all on function public.registrar_salidas(bigint, jsonb, text, text, date) from public;
revoke all on function public.registrar_salidas(bigint, jsonb, text, text, date) from anon;
grant execute on function public.registrar_salidas(bigint, jsonb, text, text, date) to authenticated;
