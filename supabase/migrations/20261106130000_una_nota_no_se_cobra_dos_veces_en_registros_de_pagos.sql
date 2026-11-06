-- ============================================================================
-- UNA NOTA NO SE COBRA DOS VECES EN REGISTROS DE PAGOS (06/11/2026)
--
-- Lo que pasó: al día siguiente de abrir el submódulo había siete notas
-- asociadas a dos, tres y hasta cinco pagos a la vez —NE-2026-0026, de
-- Bs 42.674,96, recibía Bs 213.414,91— y cada uno de esos pagos decía
-- «Cuadra». El error fue del diseño, no de quien asoció:
--
--   1. Las candidatas se ordenaban por el TOTAL de la nota contra lo que le
--      falta al pago. Con tres depósitos iguales de Bs 339.416, la primera
--      sugerencia era NE-2026-0013 las tres veces —ya cubierta por el primero—
--      en vez de 0012, 0013 y 0014.
--   2. Asociar y cambiar el monto aplicado no miraban cuánto ya había recibido
--      la nota en otros pagos, así que el monto aplicado se podía subir sin
--      tope hasta que el pago «cuadrara».
--
-- Ahora:
--   - Cada candidata ofrece lo que LE FALTA, en la moneda del pago. Sin texto
--     de búsqueda, las ya cubiertas no salen; buscándolas por número sí, para
--     verlas, pero asociarlas de nuevo se rechaza con su motivo.
--   - Asociar sin monto aplica solo lo que le falta a la nota.
--   - Lo aplicado a una nota en todos sus pagos no pasa de su valor más el
--     margen de redondeo (el 0,5 % de la nota, nunca menos de 10 centavos de
--     dólar). Se compara en dólares, con la tasa de cada pago: una nota en
--     bolívares puede cobrarse con un pago en dólares y viceversa.
--
-- LOS DATOS QUE YA ESTÁN NO SE TOCAN. Las siete notas siguen como las dejaron;
-- `notas_cubiertas_de_mas_pago_bancario` las enseña para que alguien quite
-- los enlaces que sobran. Las firmas de las funciones no cambian: es
-- `create or replace` sobre las mismas.
-- ============================================================================

-- Lo aplicado a una nota, en dólares, sumando todos sus pagos vigentes menos
-- (si se dice) uno.
create or replace function private.nota_aplicado_usd(p_nota_id bigint, p_excluir_pago bigint default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(l.monto_aplicado * coalesce(p.monto_usd / nullif(p.monto, 0), 0)), 0)
    from public.pagos_bancarios_notas l
    join public.pagos_bancarios p on p.id = l.pago_id
   where l.nota_id = p_nota_id
     and l.quitado_en is null
     and p.anulado_en is null
     and (p_excluir_pago is null or l.pago_id <> p_excluir_pago);
$$;

-- El margen por encima del valor de la nota que se acepta como redondeo.
create or replace function private.nota_margen_usd(p_total_usd numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select greatest(0.10, abs(coalesce(p_total_usd, 0)) * 0.005);
$$;

-- Lo que le falta a una nota para quedar cubierta, en la moneda del pago.
create or replace function private.nota_pendiente_en_moneda_del_pago(p_nota_id bigint, p_pago_id bigint)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select round(greatest(0, n.total_usd - private.nota_aplicado_usd(n.id, p.id))
               * coalesce(p.monto / nullif(p.monto_usd, 0), 1), 2)
    from public.notas_entrega n, public.pagos_bancarios p
   where n.id = p_nota_id and p.id = p_pago_id;
$$;

-- Si con este enlace la nota queda cubierta de más, se rechaza.
create or replace function private.exigir_nota_no_cubierta_de_mas(p_nota_id bigint, p_pago_id bigint, p_monto numeric)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_nota   public.notas_entrega;
  v_pago   public.pagos_bancarios;
  v_otros  numeric;
  v_este   numeric;
begin
  select * into v_nota from public.notas_entrega where id = p_nota_id;
  select * into v_pago from public.pagos_bancarios where id = p_pago_id;
  v_otros := private.nota_aplicado_usd(p_nota_id, p_pago_id);
  v_este  := p_monto * coalesce(v_pago.monto_usd / nullif(v_pago.monto, 0), 0);

  if v_otros + v_este > v_nota.total_usd + private.nota_margen_usd(v_nota.total_usd) then
    if v_otros >= v_nota.total_usd - private.nota_margen_usd(v_nota.total_usd) then
      raise exception 'La nota % ya está cubierta por otros pagos. Si este pago es el suyo, quítela primero del otro.', v_nota.numero
        using errcode = '22023';
    end if;
    raise exception 'Con ese monto la nota % recibiría más de lo que vale: en este pago se le puede aplicar hasta %.',
      v_nota.numero,
      private.numero_es(greatest(0, v_nota.total_usd - v_otros) * coalesce(v_pago.monto / nullif(v_pago.monto_usd, 0), 1), 2)
        || case when v_pago.moneda = 'VES' then ' Bs' else ' ' || v_pago.moneda end
      using errcode = '22023';
  end if;
end;
$$;

-- ─────────────── las candidatas ofrecen lo que falta ────────────────────────
create or replace function public.notas_candidatas_pago_bancario(p_pago_id bigint, p_texto text default null)
returns table (
  nota_id bigint, numero text, fecha date, cliente text, moneda text,
  total numeric, en_moneda_del_pago numeric, otros_pagos integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pago     public.pagos_bancarios;
  v_restante numeric;
  v_texto    text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  perform private.exigir_permiso('VENTAS', 'LECTURA');

  select * into v_pago from public.pagos_bancarios where id = p_pago_id;
  if v_pago.id is null then
    raise exception 'Ese pago no existe.' using errcode = 'P0002';
  end if;

  select v_pago.monto - coalesce(sum(l.monto_aplicado), 0) into v_restante
    from public.pagos_bancarios_notas l
   where l.pago_id = p_pago_id and l.quitado_en is null;

  -- `en_moneda_del_pago` es ahora LO QUE LE FALTA a la nota, no su total.
  return query
  select c.id, c.numero, c.fecha, c.cliente, c.moneda, c.total, c.falta, c.otros
    from (
      select n.id, n.numero, n.fecha, cl.nombre as cliente, n.moneda::text as moneda, n.total,
             private.nota_pendiente_en_moneda_del_pago(n.id, p_pago_id) as falta,
             (select count(*)::integer from public.pagos_bancarios_notas o
               join public.pagos_bancarios op on op.id = o.pago_id
              where o.nota_id = n.id and o.quitado_en is null and op.anulado_en is null) as otros
        from public.notas_entrega n
        left join public.clientes cl on cl.id = n.cliente_id
       where n.estado <> 'ANULADA'
         and not exists (select 1 from public.pagos_bancarios_notas l
                          where l.pago_id = p_pago_id and l.nota_id = n.id and l.quitado_en is null)
         and (case
                when v_texto is null then n.fecha between v_pago.fecha - 7 and v_pago.fecha + 7
                else n.numero ilike '%' || v_texto || '%' or cl.nombre ilike '%' || v_texto || '%'
              end)
    ) c
   where v_texto is not null or c.falta > 0.005
   order by (c.falta <= 0.005), abs(c.falta - v_restante), c.fecha desc
   limit 40;
end;
$$;

-- ─────────────── asociar aplica lo que falta, y no de más ───────────────────
create or replace function public.asociar_notas_a_pago_bancario(p_pago_id bigint, p_notas jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pago  public.pagos_bancarios;
  v_item  jsonb;
  v_nota  public.notas_entrega;
  v_monto numeric;
begin
  perform private.exigir_accion('VENTAS.REGISTRAR_PAGOS');

  select * into v_pago from public.pagos_bancarios where id = p_pago_id for update;
  if v_pago.id is null then
    raise exception 'Ese pago no existe.' using errcode = 'P0002';
  end if;
  if v_pago.anulado_en is not null then
    raise exception 'Ese pago está anulado: no se le asocian notas.' using errcode = '55000';
  end if;
  if p_notas is null or jsonb_typeof(p_notas) <> 'array' or jsonb_array_length(p_notas) = 0 then
    raise exception 'No hay notas que asociar.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_notas) loop
    select * into v_nota from public.notas_entrega where id = (v_item ->> 'nota_id')::bigint for update;
    if v_nota.id is null then
      raise exception 'Una de las notas no existe.' using errcode = 'P0002';
    end if;
    if v_nota.estado = 'ANULADA' then
      raise exception 'La nota % está anulada: no se asocia a un pago.', v_nota.numero using errcode = '55000';
    end if;

    v_monto := round(coalesce(nullif(v_item ->> 'monto', '')::numeric,
                              private.nota_pendiente_en_moneda_del_pago(v_nota.id, p_pago_id)), 2);
    if coalesce(v_monto, 0) <= 0 then
      raise exception 'La nota % ya está cubierta por otros pagos. Si este pago es el suyo, quítela primero del otro.', v_nota.numero
        using errcode = '22023';
    end if;
    perform private.exigir_nota_no_cubierta_de_mas(v_nota.id, p_pago_id, v_monto);

    update public.pagos_bancarios_notas
       set monto_aplicado = v_monto
     where pago_id = p_pago_id and nota_id = v_nota.id and quitado_en is null;

    if not found then
      insert into public.pagos_bancarios_notas (pago_id, nota_id, monto_aplicado, asociado_por)
      values (p_pago_id, v_nota.id, v_monto, (select auth.uid()));
    end if;
  end loop;
end;
$$;

create or replace function public.cambiar_monto_aplicado_pago(p_enlace_id bigint, p_monto numeric)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enlace public.pagos_bancarios_notas;
begin
  perform private.exigir_accion('VENTAS.REGISTRAR_PAGOS');

  select * into v_enlace from public.pagos_bancarios_notas where id = p_enlace_id for update;
  if v_enlace.id is null or v_enlace.quitado_en is not null then
    raise exception 'Esa nota ya no está asociada a ese pago.' using errcode = 'P0002';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto aplicado tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  -- Bajar siempre se puede: es como se corrige una nota cubierta de más.
  if round(p_monto, 2) > v_enlace.monto_aplicado then
    perform private.exigir_nota_no_cubierta_de_mas(v_enlace.nota_id, v_enlace.pago_id, round(p_monto, 2));
  end if;

  update public.pagos_bancarios_notas set monto_aplicado = round(p_monto, 2) where id = p_enlace_id;
end;
$$;

-- ─────────────── las que hoy están cubiertas de más ─────────────────────────
create or replace function public.notas_cubiertas_de_mas_pago_bancario()
returns table (
  nota_id bigint, numero text, fecha date, cliente text, moneda text, total numeric,
  total_usd numeric, aplicado_usd numeric, pagos integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_permiso('VENTAS', 'LECTURA');

  return query
  select n.id, n.numero, n.fecha, cl.nombre, n.moneda::text, n.total,
         n.total_usd, round(private.nota_aplicado_usd(n.id), 2),
         (select count(*)::integer from public.pagos_bancarios_notas o
           join public.pagos_bancarios op on op.id = o.pago_id
          where o.nota_id = n.id and o.quitado_en is null and op.anulado_en is null)
    from public.notas_entrega n
    left join public.clientes cl on cl.id = n.cliente_id
   where exists (select 1 from public.pagos_bancarios_notas l where l.nota_id = n.id and l.quitado_en is null)
     and private.nota_aplicado_usd(n.id) > n.total_usd + private.nota_margen_usd(n.total_usd)
   order by n.fecha, n.numero;
end;
$$;

revoke all on function private.nota_aplicado_usd(bigint, bigint) from public, anon;
revoke all on function private.nota_pendiente_en_moneda_del_pago(bigint, bigint) from public, anon;
revoke all on function private.exigir_nota_no_cubierta_de_mas(bigint, bigint, numeric) from public, anon;
revoke all on function public.notas_cubiertas_de_mas_pago_bancario() from public, anon;
grant execute on function public.notas_cubiertas_de_mas_pago_bancario() to authenticated;
