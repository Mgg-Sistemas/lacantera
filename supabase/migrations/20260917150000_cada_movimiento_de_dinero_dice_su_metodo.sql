/*
  CADA MOVIMIENTO DE DINERO DICE SU MÉTODO

  Christopher, 17/09/2026, con un pago en la mano: «están haciendo un pago con
  método Pago Móvil, ¿eso está considerado? Debemos guardar en ese registro qué
  método se usó —en el futuro es lo que nos ayudará—, y Pago Móvil solo acepta
  bolívares».

  El catálogo ya lo sabía (`PAGO_MOVIL`, `SOLO_VES`), y el pago de una orden de
  compra lo cumplía: la instrucción guarda el método, su disparador mira la
  moneda y el libro de tesorería lo hereda. Pero había dos puertas que no:

    el pago de una factura de proveedor ... guardaba el método en `pagos_compra`
                                            y no en el libro, y no miraba la
                                            moneda: un pago móvil salía de una
                                            cuenta en dólares;
    el cobro de una factura ............... miraba la moneda, pero tampoco lo
                                            dejaba en el libro.

  «Movimientos de dinero» filtra por método, así que esos dos quedaban fuera de
  cualquier filtro.

  La regla se pone donde pasan todas: `private.registrar_movimiento_tesoreria`.
  Un método que llega dicho se mira contra el catálogo —que exista, que esté en
  uso, que mueva dinero y que valga para la moneda—. El que se hereda no se
  vuelve a mirar: el de la instrucción ya se miró al indicarla, y el del
  movimiento de origen se miró cuando se hizo (el reverso de un pago viejo no
  puede fallar porque el método se haya retirado después).

  Y se hereda de un sitio más: del movimiento de origen. El IGTF de un cobro y el
  reverso de un pago salieron por donde salió el pago.
*/

do $parche$
declare
  v_def text := pg_get_functiondef('private.registrar_movimiento_tesoreria(bigint, text, integer, numeric, text, date, text, text, bigint, bigint, bigint, text, text, text)'::regprocedure);
  v_n   integer;
  r     record;
begin
  for r in
    select * from (values
      (1,
       $a$  v_metodo text;
$a$,
       $b$  v_metodo text;
  v_m      public.metodos_pago;
$b$),
      (2,
       $a$  if v_metodo is null and p_instruccion is not null then
    select i.metodo into v_metodo from public.instrucciones_pago i where i.id = p_instruccion;
  end if;
$a$,
       $b$  if v_metodo is null and p_instruccion is not null then
    select i.metodo into v_metodo from public.instrucciones_pago i where i.id = p_instruccion;
  end if;

  -- O el del movimiento del que sale: el IGTF de un cobro y el reverso de un
  -- pago se movieron por donde se movió el pago.
  if v_metodo is null and p_origen is not null then
    select m.metodo into v_metodo from public.tesoreria_movimientos m where m.id = p_origen;
  end if;

  -- Un método dicho aquí se mira contra el catálogo. El heredado ya se miró.
  if nullif(btrim(coalesce(p_metodo, '')), '') is not null then
    select * into v_m from public.metodos_pago where codigo = v_metodo;

    if v_m.codigo is null then
      raise exception 'El método de pago «%» no existe.', v_metodo using errcode = '23503';
    end if;
    if not v_m.activo then
      raise exception '% ya no está en uso como método de pago.', v_m.nombre using errcode = '55000';
    end if;
    if not v_m.mueve_dinero then
      raise exception '«%» no mueve dinero: no entra ni sale de ninguna cuenta.', v_m.nombre
        using errcode = '22023';
    end if;
    if v_m.moneda_regla = 'SOLO_VES' and v_moneda <> 'VES' then
      raise exception '% solo funciona en bolívares, y este movimiento es en %.', v_m.nombre, v_moneda
        using errcode = '22023';
    end if;
    if v_m.moneda_regla = 'NUNCA_VES' and v_moneda = 'VES' then
      raise exception '% no funciona en bolívares.', v_m.nombre using errcode = '22023';
    end if;
  end if;
$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En registrar_movimiento_tesoreria el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  execute v_def;
end
$parche$;

-- El cobro de una factura: el método al libro.
do $parche$
declare
  v_def   text := pg_get_functiondef('public.registrar_cobro(bigint, bigint, numeric, text, date, text, boolean, text)'::regprocedure);
  v_antes text := $a$    v_fecha, v_ref, v_cliente.nombre, null, null, null, p_nota);$a$;
  v_despues text := $b$    v_fecha, v_ref, v_cliente.nombre, null, null, null, p_nota,
    coalesce(p_metodo, 'TRANSFERENCIA'));$b$;
begin
  if (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes) <> 1 then
    raise exception 'registrar_cobro no tiene el asiento del cobro una sola vez: no se toca.';
  end if;
  execute replace(v_def, v_antes, v_despues);
end
$parche$;

-- El pago de una factura de proveedor: el método al libro, y con él la moneda
-- se mira donde se mira para todos.
do $parche$
declare
  v_def   text := pg_get_functiondef('public.registrar_pago_compra(bigint, bigint, numeric, text, date, text, boolean, text)'::regprocedure);
  v_antes text := $a$    v_fecha, v_ref, v_prov.nombre, null, v_fac.orden_id, null, p_nota);$a$;
  v_despues text := $b$    v_fecha, v_ref, v_prov.nombre, null, v_fac.orden_id, null, p_nota,
    coalesce(p_metodo, 'TRANSFERENCIA'));$b$;
begin
  if (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes) <> 1 then
    raise exception 'registrar_pago_compra no tiene el asiento del pago una sola vez: no se toca.';
  end if;
  execute replace(v_def, v_antes, v_despues);
end
$parche$;

do $ver$
begin
  if position('v_m.moneda_regla = ''SOLO_VES''' in pg_get_functiondef('private.registrar_movimiento_tesoreria(bigint, text, integer, numeric, text, date, text, text, bigint, bigint, bigint, text, text, text)'::regprocedure)) = 0 then
    raise exception 'registrar_movimiento_tesoreria no mira la moneda del método';
  end if;
  if position('coalesce(p_metodo, ''TRANSFERENCIA''));' in pg_get_functiondef('public.registrar_cobro(bigint, bigint, numeric, text, date, text, boolean, text)'::regprocedure)) = 0
     or position('coalesce(p_metodo, ''TRANSFERENCIA''));' in pg_get_functiondef('public.registrar_pago_compra(bigint, bigint, numeric, text, date, text, boolean, text)'::regprocedure)) = 0 then
    raise exception 'el cobro o el pago de factura no pasan el método al libro';
  end if;
end
$ver$;
