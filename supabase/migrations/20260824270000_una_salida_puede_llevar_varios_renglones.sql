-- ---------------------------------------------------------------------------
-- Una salida puede llevar varios renglones, y su nota es un documento
--
-- Dos peticiones que resultaron ser la misma:
--
--   «Necesitamos que este documento aparente mayor seriedad o profesionalismo»
--   «¿Es posible gestionar la salida de más de un material a la vez?»
--
-- La primera versión del papel era un cartel: un recuadro con la cantidad en
-- cuerpo veintidós. Funciona en el vale de combustible, donde la cifra ES el
-- documento —doscientos litros—, pero un galón de aceite en letras de dos
-- centímetros no parece un papel de almacén.
--
-- Lo que lo convierte en documento es una TABLA DE RENGLONES. Y un papel con
-- tabla de renglones es, exactamente, un papel que puede llevar varios
-- materiales. Las dos peticiones se contestan con la misma pieza.
--
-- =========================================================================
-- EL NÚMERO DE NOTA ES LO QUE CONVIERTE CINCO MOVIMIENTOS EN UN DOCUMENTO
-- =========================================================================
--
-- `inventario_movimientos` guarda una fila por artículo, y así debe seguir: es
-- el libro. Lo que faltaba era algo que dijera que esas cinco filas salieron
-- juntas. Sin eso la nota no se podría volver a imprimir — habría que acordarse
-- de cuáles cinco movimientos iban en el mismo papel.
--
-- =========================================================================
-- EL NÚMERO ENTRA CON EL INSERT, NO DESPUÉS
-- =========================================================================
--
-- La primera versión lo sellaba con un UPDATE detrás del insert, y el
-- disparador de inmutabilidad lo paró con 23001: «el libro de inventario no se
-- modifica ni se borra». Y está bien que lo pare — es la tercera vez esta
-- semana que un libro inmutable atrapa un atajo, y las tres veces tenía razón.
--
-- Así que `private.registrar_movimiento` gana un parámetro más, al final y con
-- valor por defecto, para que las quince funciones que ya la llaman sigan
-- resolviendo igual. Hubo que BORRAR la versión de trece argumentos: un
-- `create or replace` con un parámetro nuevo deja DOS funciones, y la siguiente
-- llamada falla con «is not unique». Es la regla 7 de la casa, en directo.
--
-- =========================================================================
-- SE COMPRUEBA TODO ANTES DE MOVER NADA
-- =========================================================================
--
-- Los renglones se validan en una pasada y se registran en otra. Si el cuarto
-- no alcanza, la función revienta y no queda nada a medias — que es justo lo
-- que pasaría comprobando y moviendo renglón a renglón, dejando tres salidas
-- hechas y dos no.
--
-- Y el renglón se nombra en el error, como en la entrada por lotes: con quince
-- renglones, «la cantidad tiene que ser mayor que cero» sin decir cuál obliga a
-- revisarlos todos.
--
-- COMPROBADO, en transacción revertida:
--
--   dos renglones bajo una sola nota .......... NS-2026-0001
--   un renglón que no alcanza ................. revienta, y el bueno NO se movió
--   la salida de uno solo, de siempre ......... sigue funcionando
--   la nota se relee con sus dos renglones y sus valores
-- ---------------------------------------------------------------------------

alter table public.inventario_movimientos
  add column if not exists nota_salida text;

create index if not exists movimientos_nota_salida_idx
  on public.inventario_movimientos (nota_salida)
  where nota_salida is not null;

comment on column public.inventario_movimientos.nota_salida is
  'El número del papel que respalda esta salida. Varios renglones de la misma salida lo comparten, y por eso la nota se puede volver a imprimir entera.';

-- ---------------------------------------------------------------------------
-- El movimiento acepta el número de nota
--
-- Se borra la versión de trece argumentos ANTES de crear la de catorce. Con las
-- dos vivas, cualquier llamada posicional falla con «function is not unique».
-- ---------------------------------------------------------------------------
do $migracion$
declare
  v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where proname = 'registrar_movimiento'
     and pronamespace = 'private'::regnamespace
     and pg_get_function_identity_arguments(oid) not like '%p_nota_salida%'
   limit 1;

  if v_def is null then
    return;  -- ya está puesta
  end if;

  v_def := replace(v_def, 'p_clase text DEFAULT NULL::text)',
                          'p_clase text DEFAULT NULL::text, p_nota_salida text DEFAULT NULL::text)');
  v_def := replace(v_def, 'p_clase, (select auth.uid()))',
                          'p_clase, (select auth.uid()), p_nota_salida)');
  v_def := replace(v_def, 'entrega_clase, registrado_por)',
                          'entrega_clase, registrado_por, nota_salida)');

  execute v_def;

  execute 'drop function if exists private.registrar_movimiento(
    text, integer, bigint, bigint, numeric, numeric, text, bigint, bigint, bigint, date, bigint, text)';
end;
$migracion$;

-- ---------------------------------------------------------------------------
-- Sacar varios materiales de una vez
-- ---------------------------------------------------------------------------
create or replace function public.registrar_salidas(
  p_almacen_id bigint,
  p_renglones  jsonb,
  p_motivo     text,
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
  v_articulo bigint;
  v_cantidad numeric;
  v_nombre   text;
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

  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'Ese almacén no existe o está inactivo.' using errcode = '23503';
  end if;

  -- Primera pasada: comprobar. Nada se mueve todavía, para que un renglón malo
  -- no deje tres salidas hechas y dos no.
  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_n := v_n + 1;
    v_articulo := nullif(btrim(coalesce(v_r->>'articulo_id', '')), '')::bigint;
    v_cantidad := coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0);

    select nombre into v_nombre from public.articulos where id = v_articulo and activo;
    if v_nombre is null then
      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n
        using errcode = '23503';
    end if;

    if v_cantidad <= 0 then
      raise exception 'El renglón % (%): la cantidad tiene que ser mayor que cero.', v_n, v_nombre
        using errcode = '22023';
    end if;

    v_hay := private.existencia(p_almacen_id, v_articulo);
    if v_cantidad > v_hay then
      raise exception 'El renglón % (%): solo hay % y se intentan sacar %.',
        v_n, v_nombre, v_hay, v_cantidad using errcode = '22023';
    end if;
  end loop;

  v_nota := private.siguiente_numero('NS');

  -- Segunda pasada: mover. El número de nota entra CON el insert y no después:
  -- el libro de inventario es inmutable y sellarlo a posteriori lo para el
  -- disparador con 23001. Y está bien que lo pare.
  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_articulo := (v_r->>'articulo_id')::bigint;
    v_cantidad := (v_r->>'cantidad')::numeric;
    v_costo := private.costo_promedio(p_almacen_id, v_articulo);

    perform private.registrar_movimiento(
      p_tipo, -1, p_almacen_id, v_articulo, v_cantidad, v_costo,
      btrim(p_motivo), null, null, null, p_fecha, null, null, v_nota);
  end loop;

  return v_nota;
end;
$func$;

comment on function public.registrar_salidas(bigint, jsonb, text, text, date) is
  'Saca varios materiales de un almacén en una sola operación y bajo un mismo número de nota. Comprueba todos los renglones antes de mover nada.';

revoke all on function public.registrar_salidas(bigint, jsonb, text, text, date) from public;
revoke all on function public.registrar_salidas(bigint, jsonb, text, text, date) from anon;
grant execute on function public.registrar_salidas(bigint, jsonb, text, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- La nota, para poder volver a imprimirla
-- ---------------------------------------------------------------------------
create or replace function public.nota_de_salida(p_numero text)
returns table (
  nota            text,
  fecha           date,
  almacen         text,
  tipo            text,
  motivo          text,
  articulo_codigo text,
  articulo        text,
  cantidad        numeric,
  unidad          text,
  costo_usd       numeric,
  valor_usd       numeric,
  registrado_en   timestamptz
)
language plpgsql
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  return query
  select m.nota_salida, m.fecha, a.nombre, m.tipo, m.nota,
         ar.codigo, ar.nombre, m.cantidad, m.unidad,
         m.costo_usd, m.valor_usd, m.registrado_en
    from public.inventario_movimientos m
    join public.almacenes a  on a.id  = m.almacen_id
    join public.articulos ar on ar.id = m.articulo_id
   where m.nota_salida = p_numero
   order by m.id;
end;
$func$;

comment on function public.nota_de_salida(text) is
  'Los renglones de una nota de salida, para volver a imprimirla tal como se emitió.';

revoke all on function public.nota_de_salida(text) from public;
revoke all on function public.nota_de_salida(text) from anon;
grant execute on function public.nota_de_salida(text) to authenticated;
