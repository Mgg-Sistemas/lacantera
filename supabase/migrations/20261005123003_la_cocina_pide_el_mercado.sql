/*
  LA COCINA PIDE EL MERCADO.

  Christopher, 05/10/2026: «de MGG traete la solicitud de mercado». En MGG es
  un botón que arma la lista de compra de la cocina —todos los víveres, con
  las cantidades de la última vez— y la convierte en una solicitud de pedido
  urgente que entra al circuito normal de compras.

  Aquí la idea es la misma, con los rieles de la casa:

  - `crear_pedido` exige roles de oficina (SOLICITANTE, COMPRAS, OPERACIONES,
    ALMACEN, RRHH) y la cocina no los tiene ni debe tenerlos. En vez de abrirle
    esa puerta —tocar una función del compañero que ya corre—, se abre una
    PUERTA NUEVA: `solicitar_mercado`, que pide el permiso de ALIMENTACION y
    por dentro crea la misma solicitud que crearía la oficina: mismo
    correlativo SOL, mismos renglones, misma bitácora, mismo aviso a COMPRAS.
    Del pedido en adelante no hay nada especial: se cotiza, se aprueba y se
    recibe como cualquier compra, y la recepción en el almacén de la cocina es
    la entrada de inventario que repone los víveres.

  - La solicitud queda marcada con `finalidad = 'MERCADO'` (columna nueva,
    nula para todo lo demás: nada existente cambia). Esa marca es la que
    permite ofrecer «lo que se pidió la última vez» como cantidad sugerida,
    que en MGG es lo que hace útil la pantalla.

  - La cocina no puede leer `solicitudes_pedido` (su lectura pide COMPRAS), y
    está bien que siga así: `ultima_lista_de_mercado()` devuelve SOLO lo que
    la pantalla necesita —número, fecha, estado y cantidades por artículo de
    la última solicitud de mercado— con el permiso de ALIMENTACION.
*/

-- ───────────────────────────── 1 · la marca de mercado en la solicitud ──

alter table public.solicitudes_pedido
  add column if not exists finalidad text
  constraint solicitudes_pedido_finalidad_check check (finalidad in ('MERCADO'));

comment on column public.solicitudes_pedido.finalidad is
  'MERCADO cuando la solicitud nació del botón de la cocina; nula en el resto.';

-- ──────────────────────────────────────────── 2 · solicitar el mercado ──

create or replace function public.solicitar_mercado(
  p_renglones  jsonb,
  p_almacen_id bigint default null,
  p_nota       text   default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_item          jsonb;
  v_articulo      record;
  v_vistos        bigint[] := '{}';
  v_renglones     jsonb    := '[]'::jsonb;
  v_destino       text;
  v_sol           record;
  v_id            bigint;
  v_numero        text;
  v_justificacion text;
begin
  perform private.exigir_permiso('ALIMENTACION', 'ESCRITURA');

  if p_renglones is null
     or jsonb_typeof(p_renglones) <> 'array'
     or jsonb_array_length(p_renglones) = 0 then
    raise exception 'La lista del mercado está vacía: marca al menos un víver.'
      using errcode = '22023';
  end if;

  if p_almacen_id is not null then
    select nombre into v_destino
    from public.almacenes
    where id = p_almacen_id and activo;

    if v_destino is null then
      raise exception 'Ese almacén no existe o está inactivo.' using errcode = '23503';
    end if;
  end if;

  /*
    Cada renglón trae un artículo del catálogo (articulo_id) o un texto libre
    (descripcion), igual que un pedido normal. Con artículo, el nombre y la
    unidad salen del catálogo: lo que se pide es lo que el catálogo dice que
    es, no lo que cada quien escriba.
  */
  for v_item in select * from jsonb_array_elements(p_renglones) loop
    if coalesce((v_item->>'cantidad')::numeric, 0) <= 0 then
      raise exception 'Hay un renglón sin cantidad: ponla o quítalo de la lista.'
        using errcode = '22023';
    end if;

    if nullif(v_item->>'articulo_id', '') is not null then
      select id, nombre, unidad into v_articulo
      from public.articulos
      where id = (v_item->>'articulo_id')::bigint and activo;

      if v_articulo.id is null then
        raise exception 'Un renglón trae un artículo que no existe o está inactivo.'
          using errcode = '23503';
      end if;

      if v_articulo.id = any(v_vistos) then
        raise exception '«%» está repetido en la lista: junta sus cantidades.',
          v_articulo.nombre using errcode = '23505';
      end if;
      v_vistos := v_vistos || v_articulo.id;

      v_renglones := v_renglones || jsonb_build_array(jsonb_build_object(
        'articulo_id', v_articulo.id,
        'descripcion', v_articulo.nombre,
        'cantidad',    v_item->>'cantidad',
        'unidad',      v_articulo.unidad,
        'observacion', v_item->>'observacion'));
    else
      v_renglones := v_renglones || jsonb_build_array(jsonb_build_object(
        'articulo_id', null,
        'descripcion', v_item->>'descripcion',
        'cantidad',    v_item->>'cantidad',
        'unidad',      'UND',
        'observacion', v_item->>'observacion'));
    end if;
  end loop;

  v_justificacion := 'Reposición de víveres y artículos para la cocina. '
    || 'Lista armada desde Alimentación con lo que hace falta comprar.'
    || coalesce(' Nota de quien pide: ' || nullif(trim(p_nota), '') || '.', '');

  -- Quien pide es quien está firmado: la cocinera o la analista, con nombre
  -- y cargo de su perfil, como en cualquier pedido.
  select * into v_sol from private.normalizar_solicitante((select auth.uid()), null, null);

  insert into public.solicitudes_pedido
    (numero, titulo, justificacion, prioridad, requerida_para, destino,
     destino_almacen_id, estado, registrada_por,
     solicitante_id, solicitante_nombre, solicitante_cargo,
     enviada_en, firma_de_quien_pide, finalidad)
  values
    (private.siguiente_numero('SOL'), 'Reposición del mercado', v_justificacion,
     'URGENTE', null, v_destino,
     p_almacen_id, 'PEDIDO', (select auth.uid()),
     v_sol.o_id, v_sol.o_nombre, v_sol.o_cargo,
     now(), false, 'MERCADO')
  returning id, numero into v_id, v_numero;

  perform private.escribir_renglones(v_id, v_renglones);

  -- La misma anotación que un pedido enviado: bitácora y aviso a COMPRAS.
  perform private.anotar('SOLICITUD', v_id, null, 'PEDIDO',
    'Solicitud de mercado de la cocina');

  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;

revoke all on function public.solicitar_mercado(jsonb, bigint, text) from public, anon;
grant execute on function public.solicitar_mercado(jsonb, bigint, text) to authenticated;

-- ─────────────────────────────── 3 · lo que se pidió la última vez ──────

create or replace function public.ultima_lista_de_mercado()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v jsonb;
begin
  perform private.exigir_permiso('ALIMENTACION', 'LECTURA');

  select jsonb_build_object(
           'numero', s.numero,
           'fecha',  ((coalesce(s.enviada_en, s.creada_en))
                        at time zone 'America/Caracas')::date,
           'estado', s.estado,
           'renglones', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'articulo_id', r.articulo_id,
                      'cantidad',    r.cantidad))
             from public.solicitud_renglones r
             where r.solicitud_id = s.id and r.articulo_id is not null
           ), '[]'::jsonb))
    into v
  from public.solicitudes_pedido s
  where s.finalidad = 'MERCADO' and s.estado <> 'CANCELADA'
  order by s.id desc
  limit 1;

  -- Nulo cuando nunca se ha pedido: la pantalla arranca con cantidades en 1.
  return v;
end;
$$;

revoke all on function public.ultima_lista_de_mercado() from public, anon;
grant execute on function public.ultima_lista_de_mercado() to authenticated;
