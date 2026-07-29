-- ============================================================================
-- Transferencias entre almacenes
--
-- Mover material de un sitio a otro no cambia cuánto hay en la cantera: cambia
-- dónde está. Por eso son SIEMPRE dos movimientos que nacen juntos — una salida
-- del origen y una entrada al destino, por la misma cantidad y al mismo costo.
--
-- El costo viaja con el material. Si el gasoil entró a 0,92 $/L, sigue valiendo
-- 0,92 $/L en el surtidor: recostearlo al promedio del destino inventaría una
-- ganancia o una pérdida que nunca ocurrió, y esas aparecen después en el
-- resultado del mes sin que nadie sepa de dónde salieron.
--
-- Los dos movimientos se enlazan con `movimiento_origen`. Eso obliga a afinar
-- el reverso: hasta ahora "tiene algo que lo referencia" significaba "ya se
-- reversó", y con las transferencias esa cuenta deja de ser cierta.
-- ============================================================================

create or replace function public.transferir_existencia(
  p_origen_id   bigint,
  p_destino_id  bigint,
  p_articulo_id bigint,
  p_cantidad    numeric,
  p_motivo      text,
  p_fecha       date default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_origen     public.almacenes;
  v_destino    public.almacenes;
  v_existencia numeric;
  v_costo      numeric;
  v_articulo   text;
  v_salida     bigint;
begin
  perform private.exigir_rol('ALMACEN');

  if p_origen_id = p_destino_id then
    raise exception 'El origen y el destino son el mismo almacén.' using errcode = '22023';
  end if;

  select * into v_origen  from public.almacenes where id = p_origen_id;
  select * into v_destino from public.almacenes where id = p_destino_id;

  if v_origen.id is null then
    raise exception 'No existe el almacén de origen %.', p_origen_id using errcode = 'P0002';
  end if;

  if v_destino.id is null then
    raise exception 'No existe el almacén de destino %.', p_destino_id using errcode = 'P0002';
  end if;

  -- Un almacén inactivo es uno que se cerró. Dejar entrar material ahí lo
  -- esconde: no sale en las pantallas y nadie vuelve a buscarlo.
  if not v_destino.activo then
    raise exception 'El almacén "%" está inactivo y no puede recibir material.', v_destino.nombre
      using errcode = '22023';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se mueve. Un traslado sin motivo no se puede auditar.'
      using errcode = '22023';
  end if;

  v_existencia := private.existencia(p_origen_id, p_articulo_id);

  if p_cantidad > v_existencia then
    select nombre into v_articulo from public.articulos where id = p_articulo_id;
    raise exception 'En "%" solo hay % de "%" y se intentan mover %.',
      v_origen.nombre, v_existencia, coalesce(v_articulo, p_articulo_id::text), p_cantidad
      using errcode = '22023';
  end if;

  v_costo := private.costo_promedio(p_origen_id, p_articulo_id);

  v_salida := private.registrar_movimiento(
    'TRANSFERENCIA_SALIDA', (-1)::smallint, p_origen_id, p_articulo_id,
    p_cantidad, v_costo,
    format('Traslado a %s. %s', v_destino.nombre, p_motivo),
    null, null, null, p_fecha);

  -- La entrada apunta a la salida: es lo que las convierte en una pareja y no
  -- en dos movimientos sueltos que casualmente cuadran.
  perform private.registrar_movimiento(
    'TRANSFERENCIA_ENTRADA', (1)::smallint, p_destino_id, p_articulo_id,
    p_cantidad, v_costo,
    format('Traslado desde %s. %s', v_origen.nombre, p_motivo),
    null, null, v_salida, p_fecha);

  return v_salida;
end;
$$;

revoke all on function public.transferir_existencia(bigint, bigint, bigint, numeric, text, date)
  from public, anon;
grant execute on function public.transferir_existencia(bigint, bigint, bigint, numeric, text, date)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Reverso
--
-- Se rehace por dos motivos que aparecieron con las transferencias:
--
-- 1. "Ya fue reversado" se decidía mirando si algo apuntaba al movimiento. La
--    entrada de un traslado apunta a su salida, así que toda salida de traslado
--    habría nacido marcada como reversada. Ahora se busca un REVERSO, que es lo
--    que de verdad se estaba preguntando.
--
-- 2. Reversar una sola pata de un traslado hace desaparecer o duplicar el
--    material. Van juntas o no va ninguna.
--
-- Y se añade la comprobación que faltaba: un reverso que resta no puede dejar
-- la existencia en negativo. Reversar la entrada de algo que ya se consumió
-- deja un número que no describe ninguna realidad, y el libro deja de poder
-- responder qué había en cada sitio.
-- ---------------------------------------------------------------------------
create or replace function private.exigir_no_reversado(p_id bigint, p_numero text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.inventario_movimientos
     where movimiento_origen = p_id and tipo = 'REVERSO'
  ) then
    raise exception 'El movimiento % ya fue reversado.', p_numero using errcode = '55000';
  end if;
end;
$$;

create or replace function private.exigir_existencia_para_reverso(
  p_mov public.inventario_movimientos,
  p_pedido bigint
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hay      numeric;
  v_almacen  text;
  v_articulo text;
begin
  -- Solo estorba cuando el reverso resta. Devolver material nunca sobra.
  if p_mov.signo < 0 then return; end if;

  v_hay := private.existencia(p_mov.almacen_id, p_mov.articulo_id);

  if p_mov.cantidad > v_hay then
    select nombre into v_almacen  from public.almacenes where id = p_mov.almacen_id;
    select nombre into v_articulo from public.articulos where id = p_mov.articulo_id;
    raise exception
      'No se puede reversar %: habría que sacar % de "%" en % y solo quedan %. %',
      p_mov.numero, p_mov.cantidad, v_articulo, v_almacen, v_hay,
      case when p_mov.id = p_pedido then 'Ese material ya se usó.'
           else 'Ese material ya se movió del destino del traslado.' end
      using errcode = '22023';
  end if;
end;
$$;

create or replace function public.reversar_movimiento(p_id bigint, p_motivo text)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mov     public.inventario_movimientos;
  v_par     public.inventario_movimientos;
  v_reverso bigint;
begin
  perform private.exigir_rol('ALMACEN');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se reversa.' using errcode = '22023';
  end if;

  select * into v_mov from public.inventario_movimientos where id = p_id;

  if v_mov.id is null then
    raise exception 'No existe el movimiento %.', p_id using errcode = 'P0002';
  end if;

  if v_mov.tipo = 'REVERSO' then
    raise exception 'Un reverso no se reversa. Registra el movimiento que corresponda.'
      using errcode = '22023';
  end if;

  perform private.exigir_no_reversado(v_mov.id, v_mov.numero);

  -- La otra pata, cuando esto es un traslado.
  if v_mov.tipo = 'TRANSFERENCIA_SALIDA' then
    select * into v_par from public.inventario_movimientos
     where movimiento_origen = v_mov.id and tipo = 'TRANSFERENCIA_ENTRADA';
  elsif v_mov.tipo = 'TRANSFERENCIA_ENTRADA' then
    select * into v_par from public.inventario_movimientos
     where id = v_mov.movimiento_origen and tipo = 'TRANSFERENCIA_SALIDA';
  end if;

  if v_par.id is not null then
    perform private.exigir_no_reversado(v_par.id, v_par.numero);
  end if;

  -- Primero se comprueban las dos, y solo después se escribe cualquiera de las
  -- dos: dejar media pareja reversada sería peor que no dejar reversar.
  perform private.exigir_existencia_para_reverso(v_mov, p_id);
  if v_par.id is not null then
    perform private.exigir_existencia_para_reverso(v_par, p_id);
  end if;

  v_reverso := private.registrar_movimiento(
    'REVERSO', (-v_mov.signo)::smallint, v_mov.almacen_id, v_mov.articulo_id,
    v_mov.cantidad, v_mov.costo_usd,
    format('Reverso de %s. %s', v_mov.numero, p_motivo),
    v_mov.orden_id, v_mov.orden_renglon_id, v_mov.id, null);

  if v_par.id is not null then
    perform private.registrar_movimiento(
      'REVERSO', (-v_par.signo)::smallint, v_par.almacen_id, v_par.articulo_id,
      v_par.cantidad, v_par.costo_usd,
      format('Reverso de %s, la otra mitad del traslado %s. %s',
             v_par.numero, v_mov.numero, p_motivo),
      v_par.orden_id, v_par.orden_renglon_id, v_par.id, null);
  end if;

  return v_reverso;
end;
$$;
