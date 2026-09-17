/*
  LA NOTA DE ENTREGA NO LLEVA IVA; LA FACTURA LO DECIDE

  Christopher, 17/09/2026, en tres mensajes seguidos: «una nota de entrega no
  debería llevar IVA»; «genero una nota de entrega y me lleva directamente a
  factura, necesito que sea nota de entrega SIN IVA»; y «solo la factura tendrá
  mención de IVA o IGTF: las notas de entrega en su PDF deben decir NOTA DE
  ENTREGA».

  Lo que pasó con la primera nota real lo explica: se despachó sin IVA, se
  facturó, y la factura salió al 0 % porque `facturar_notas` copiaba la alícuota
  de sus notas. Se anuló.

  Dos cambios:

    despachar ....... la nota se guarda siempre al 0 %. `p_alicuota_iva` se
                      queda en la firma para no romper a quien la llame, y ya no
                      se lee.
    facturar_notas .. recibe `p_alicuota_iva`. Sin ella, la de la ficha de la
                      empresa (16 si no la dice; 0 si la empresa no cobra IVA).
                      Un cliente exento se factura a 0 lo diga quien lo diga.
                      Y deja de exigir que las notas coincidan en alícuota:
                      ya no la tienen.

  Las notas ya despachadas no se tocan.
*/

do $parche$
declare
  v_def   text := pg_get_functiondef('public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)'::regprocedure);
  v_antes text := $a$     case when v_cliente.exento_iva then 0 else coalesce(p_alicuota_iva, 16) end,$a$;
  v_despues text := $b$     -- Una nota de entrega no lleva IVA: lo decide la factura (17/09/2026).
     0,$b$;
begin
  if (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes) <> 1 then
    raise exception 'despachar no pone la alícuota una sola vez: no se toca.';
  end if;
  execute replace(v_def, v_antes, v_despues);
end
$parche$;

do $parche$
declare
  v_def text := pg_get_functiondef('public.facturar_notas(bigint[], text, date, text)'::regprocedure);
  v_n   integer;
  r     record;
begin
  for r in
    select * from (values
      (1,
       $a$p_observacion text DEFAULT NULL::text)
 RETURNS bigint$a$,
       $b$p_observacion text DEFAULT NULL::text, p_alicuota_iva numeric DEFAULT NULL::numeric)
 RETURNS bigint$b$),
      (2,
       $a$  v_iva       numeric;
$a$,
       $b$  v_iva       numeric;
  v_alicuota  numeric;
$b$),
      (3,
       $a$  if v_notas.alicuotas > 1 then
    raise exception 'Las notas llevan alícuotas de IVA distintas. Factúralas por separado.'
      using errcode = '22023';
  end if;$a$,
       $b$  if p_alicuota_iva is not null and (p_alicuota_iva < 0 or p_alicuota_iva > 100) then
    raise exception 'La alícuota del IVA tiene que estar entre 0 y 100. Llegó %.', p_alicuota_iva
      using errcode = '22023';
  end if;$b$),
      (4,
       $a$  select * into v_cliente from public.clientes where id = v_notas.cliente_id;
$a$,
       $b$  select * into v_cliente from public.clientes where id = v_notas.cliente_id;

  -- El IVA lo decide la factura, no sus notas, que no lo llevan.
  v_alicuota := case
    when v_cliente.exento_iva then 0
    when p_alicuota_iva is not null then p_alicuota_iva
    else coalesce((select case when e.aplica_iva then coalesce(e.alicuota_iva_pct, 16) else 0 end
                     from public.empresa e limit 1), 16)
  end;
$b$),
      (5,
       $a$    v_notas.moneda, t.tasa, t.tasa_usd, v_notas.alicuota,$a$,
       $b$    v_notas.moneda, t.tasa, t.tasa_usd, v_alicuota,$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En facturar_notas el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  drop function public.facturar_notas(bigint[], text, date, text);
  execute v_def;
end
$parche$;

revoke all on function public.facturar_notas(bigint[], text, date, text, numeric) from public, anon;
grant execute on function public.facturar_notas(bigint[], text, date, text, numeric) to authenticated, service_role;

do $ver$
begin
  if position('coalesce(p_alicuota_iva, 16)' in pg_get_functiondef('public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)'::regprocedure)) > 0
     or position('v_alicuota,' in pg_get_functiondef('public.facturar_notas(bigint[], text, date, text, numeric)'::regprocedure)) = 0 then
    raise exception 'la nota sigue con IVA o la factura no lo decide';
  end if;
end
$ver$;
