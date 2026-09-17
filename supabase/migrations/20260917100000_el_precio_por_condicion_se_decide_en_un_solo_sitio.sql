/*
  EL PRECIO POR CONDICIÓN SE DECIDE EN UN SOLO SITIO

  La regla de ventas (parte A, `20260916160000`) vivía dentro de
  `private.cargar_renglones_venta`:
  - de lista;
  - con descuento, en porcentaje o en monto;
  - sin cargo, con motivo y la casilla;
  - acordado, solo sin lista;
  - y el mínimo, comparado en dólares.

  Christopher, 17/09/2026, al pedir la compra pagada con material: el material se
  toma «como en ventas». Copiar la regla en el pago dejaría dos reglas que se
  separan solas, como pasó con las cuatro listas de métodos de pago. Así que
  sale a `private.precio_por_condicion` y ventas la llama. No cambia nada de lo
  que ventas decide ni de sus mensajes: es el mismo código, movido.
*/

create function private.precio_por_condicion(
  p_articulo_id        bigint,
  p_unidad             text,
  p_condicion          text,
  p_descuento_pct      numeric,
  p_descuento_unitario numeric,
  p_precio_acordado    numeric,
  p_motivo             text,
  p_moneda             character,
  p_fecha              date)
returns table(precio numeric, precio_lista numeric, descuento_pct numeric,
              descuento_unitario numeric, condicion text, motivo text)
language plpgsql
stable
security definer
set search_path to ''
as $func$
declare
  v_nombre     text;
  v_lista_fila record;
  v_lista      numeric;
  v_tasas      record;
  v_condicion  text := upper(nullif(btrim(coalesce(p_condicion, '')), ''));
  v_pct        numeric := p_descuento_pct;
  v_rebaja     numeric := p_descuento_unitario;
  v_precio     numeric;
  v_motivo     text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select a.nombre into v_nombre from public.articulos a where a.id = p_articulo_id;

  /*
    EL PRECIO DE LISTA, EN LA MONEDA DEL DOCUMENTO.

    La lista puede estar en dólares y el documento en bolívares. Se convierte
    pasando por el dólar con las tasas del día del documento, que son las que
    quedan congeladas en él.
  */
  select p.precio, p.precio_minimo, p.moneda into v_lista_fila
    from public.precios_venta p
   where p.articulo_id = p_articulo_id and p.unidad = p_unidad;

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

  if v_condicion is null then
    raise exception '«%» no dice a qué precio sale: de lista, con descuento, sin cargo o acordado.',
      v_nombre
      using errcode = '22023',
            hint = 'Si el formulario no lo pregunta, recarga la página: es de antes de este cambio.';
  end if;

  if v_condicion = 'LISTA' then
    if v_lista is null then
      raise exception '«%» no tiene precio de lista por %.', v_nombre, p_unidad
        using errcode = '22023',
              hint = 'Pónselo en Ventas › Lista de precios, o véndelo a precio acordado.';
    end if;
    v_precio := v_lista;
    v_pct := null;
    v_rebaja := null;

  elsif v_condicion = 'DESCUENTO' then
    if v_lista is null then
      raise exception '«%» no tiene precio de lista por %: no hay de dónde descontar.',
        v_nombre, p_unidad
        using errcode = '22023', hint = 'Véndelo a precio acordado.';
    end if;
    if (v_pct is null) = (v_rebaja is null) then
      raise exception 'El descuento de «%» va en porcentaje o en monto por %, uno de los dos.',
        v_nombre, p_unidad using errcode = '22023';
    end if;
    if v_pct is not null then
      if v_pct <= 0 or v_pct >= 100 then
        raise exception 'El descuento de «%» tiene que estar entre 0 y 100 %%. Si no se cobra nada, es sin cargo.',
          v_nombre using errcode = '22023';
      end if;
      v_precio := round(v_lista * (100 - v_pct) / 100, 6);
    else
      if v_rebaja <= 0 or v_rebaja >= v_lista then
        raise exception 'La rebaja de «%» tiene que ser mayor que cero y menor que el precio de lista (% por %).',
          v_nombre, private.numero_es(v_lista, 2), p_unidad using errcode = '22023';
      end if;
      v_precio := v_lista - v_rebaja;
    end if;
    if v_precio <= 0 or v_precio >= v_lista then
      raise exception 'Con ese descuento «%» quedaría a % por %: no es un descuento.',
        v_nombre, private.numero_es(v_precio, 6), p_unidad using errcode = '22023';
    end if;

    -- El mínimo, en dólares los dos: la lista puede estar en otra moneda.
    if coalesce(v_lista_fila.precio_minimo, 0) > 0
       and private.en_dolares(v_precio, p_moneda, p_fecha)
           < private.en_dolares(v_lista_fila.precio_minimo, v_lista_fila.moneda, p_fecha) - 0.000001
       and not private.puede_accion('VENTAS.VENDER_BAJO_MINIMO') then
      raise exception 'De "%" no se vende por debajo de % % por %. Con el descuento queda en % %.',
        v_nombre, private.numero_es(v_lista_fila.precio_minimo, 2), v_lista_fila.moneda,
        p_unidad, private.numero_es(v_precio, 2), p_moneda
        using errcode = '22023';
    end if;

  elsif v_condicion = 'SIN_CARGO' then
    if v_motivo is null or length(v_motivo) < 4 then
      raise exception 'Un renglón sin cargo dice por qué: «%» sale sin cobrarse.', v_nombre
        using errcode = '22023';
    end if;
    if not private.puede_accion('VENTAS.VENDER_BAJO_MINIMO') then
      raise exception 'Dar «%» sin cargo lo autoriza quien pueda vender por debajo del mínimo.',
        v_nombre using errcode = '42501';
    end if;
    v_precio := 0;
    v_pct := null;
    v_rebaja := null;

  elsif v_condicion = 'ACORDADO' then
    if v_lista is not null then
      raise exception '«%» tiene precio de lista por %: sale de lista o con descuento.',
        v_nombre, p_unidad using errcode = '22023';
    end if;
    v_precio := coalesce(p_precio_acordado, 0);
    if v_precio <= 0 then
      raise exception 'Escribe a cuánto se acordó «%». Si no se cobra, es sin cargo.',
        v_nombre using errcode = '22023';
    end if;
    v_pct := null;
    v_rebaja := null;

  else
    raise exception 'La condición «%» no existe: de lista, con descuento, sin cargo o acordado.',
      v_condicion using errcode = '22023';
  end if;

  return query select v_precio, v_lista, v_pct, v_rebaja, v_condicion, v_motivo;
end;
$func$;

revoke all on function private.precio_por_condicion(bigint, text, text, numeric, numeric, numeric, text, character, date) from public, anon;

/*
  `cargar_renglones_venta` llama a la regla en vez de llevarla dentro. Se corta
  por las dos marcas de comentario que la encierran —el precio de lista y lo que
  sale del patio—, y cada una tiene que aparecer una sola vez.
*/
do $parche$
declare
  v_def    text := pg_get_functiondef('private.cargar_renglones_venta(text, text, bigint, jsonb, character, date)'::regprocedure);
  v_desde  text := $m$    /*
      EL PRECIO DE LISTA, EN LA MONEDA DEL DOCUMENTO.$m$;
  v_hasta  text := $m$    /*
      LO QUE SALE DEL PATIO.$m$;
  v_nuevo  text := $n$    /*
      EL PRECIO SALE DE SU CONDICIÓN, y la regla vive en
      `private.precio_por_condicion`: la usa también el pago de una compra con
      material, que toma el material al precio de venta. La falta de condición
      se dice aquí, que es donde se sabe el número del renglón.
    */
    if nullif(btrim(coalesce(v_item ->> 'condicion', '')), '') is null then
      raise exception 'El renglón % («%») no dice a qué precio sale: de lista, con descuento, sin cargo o acordado.',
        v_linea, v_articulo.nombre
        using errcode = '22023',
              hint = 'Si el formulario no lo pregunta, recarga la página: es de antes de este cambio.';
    end if;

    select c.precio, c.precio_lista, c.descuento_pct, c.descuento_unitario, c.condicion, c.motivo
      into v_precio, v_lista, v_pct, v_rebaja, v_condicion, v_motivo
      from private.precio_por_condicion(
             v_articulo.id, v_unidad, v_item ->> 'condicion',
             nullif(v_item ->> 'descuento_pct', '')::numeric,
             nullif(v_item ->> 'descuento_unitario', '')::numeric,
             nullif(v_item ->> 'precio_unitario', '')::numeric,
             v_item ->> 'motivo_condicion', p_moneda, p_fecha) c;

$n$;
  v_i integer;
  v_f integer;
  r   record;
begin
  if (length(v_def) - length(replace(v_def, v_desde, ''))) / length(v_desde) <> 1
     or (length(v_def) - length(replace(v_def, v_hasta, ''))) / length(v_hasta) <> 1 then
    raise exception 'cargar_renglones_venta no tiene las marcas una sola vez: no se toca.';
  end if;

  v_i := position(v_desde in v_def);
  v_f := position(v_hasta in v_def);
  if v_f <= v_i then
    raise exception 'Las marcas de cargar_renglones_venta están al revés.';
  end if;
  v_def := substr(v_def, 1, v_i - 1) || v_nuevo || substr(v_def, v_f);

  -- Las dos variables que solo usaba la regla ya no hacen falta.
  for r in
    select * from (values (1, $a$  v_lista_fila record;
$a$), (2, $a$  v_tasas      record;
$a$)) as t(n, antes)
    order by n
  loop
    if (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes) <> 1 then
      raise exception 'En cargar_renglones_venta la declaración % no aparece una vez.', r.n;
    end if;
    v_def := replace(v_def, r.antes, '');
  end loop;

  execute v_def;
end
$parche$;

do $ver$
begin
  if position('precio_por_condicion' in pg_get_functiondef('private.cargar_renglones_venta(text, text, bigint, jsonb, character, date)'::regprocedure)) = 0
     or position('VENDER_BAJO_MINIMO' in pg_get_functiondef('private.cargar_renglones_venta(text, text, bigint, jsonb, character, date)'::regprocedure)) > 0 then
    raise exception 'cargar_renglones_venta no quedó llamando a la regla';
  end if;
end
$ver$;
