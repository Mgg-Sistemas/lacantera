/*
  LA NOTA DE ENTREGA ES DE FACTURACIÓN, TAMBIÉN EN LA BASE

  Christopher, 16/09/2026: «nos comentan que directamente nota de entrega debe
  estar en facturación». La pantalla ya se había mudado esa madrugada
  (`/app/facturacion/notas-entrega`, commit ab1fc2f), pero la mudanza no trajo
  migración y la base seguía pidiendo el permiso del módulo de antes:

    despachar ............. VENTAS en escritura
    anular_nota_entrega ... VENTAS total

  Hoy no se notaba porque solo ADMIN tiene cualquiera de los dos módulos, pero es
  una puerta que dice una cosa en la pantalla y otra en la base. Un usuario con
  Facturación vería el botón y la base lo rechazaría, y uno con solo Ventas
  podría despachar por la API sin poder abrir la pantalla.

  Las dos casillas de la matriz se mudan con ella: `FACTURACION.DESPACHAR` y
  `FACTURACION.ANULAR_NOTA_ENTREGA`, con el mismo texto. Ningún rol ni ninguna
  autorización las tenía marcadas, así que no se pierde nada al borrar las de
  Ventas. Solo ADMIN sigue pudiendo vender: Facturación, como Ventas, solo lo
  tiene ADMIN.
*/

do $parche$
declare
  v_def text;
  r     record;
begin
  for r in
    select * from (values
      ('public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)',
       $a$perform private.exigir_permiso('VENTAS', 'ESCRITURA');$a$,
       $b$perform private.exigir_permiso('FACTURACION', 'ESCRITURA');$b$),
      ('public.anular_nota_entrega(bigint, text)',
       $a$perform private.exigir_permiso('VENTAS', 'TOTAL');$a$,
       $b$perform private.exigir_permiso('FACTURACION', 'TOTAL');$b$)
    ) as t(funcion, antes, despues)
  loop
    v_def := pg_get_functiondef(r.funcion::regprocedure);
    if (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes) <> 1 then
      raise exception 'En % el texto «%» no aparece exactamente una vez.', r.funcion, r.antes;
    end if;
    execute replace(v_def, r.antes, r.despues);
  end loop;
end
$parche$;

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
select replace(a.codigo, 'VENTAS.', 'FACTURACION.'), 'FACTURACION', a.nombre, a.dice, a.orden, a.nivel_equivalente, a.activa
  from public.acciones a
 where a.codigo in ('VENTAS.DESPACHAR', 'VENTAS.ANULAR_NOTA_ENTREGA')
on conflict (codigo) do nothing;

-- Lo que estuviera marcado viaja con la casilla. Hoy no hay nada, pero la
-- migración no debe depender de eso.
insert into public.rol_acciones (rol, accion, puesta_en, puesta_por)
select ra.rol, replace(ra.accion, 'VENTAS.', 'FACTURACION.'), ra.puesta_en, ra.puesta_por
  from public.rol_acciones ra
 where ra.accion in ('VENTAS.DESPACHAR', 'VENTAS.ANULAR_NOTA_ENTREGA')
on conflict do nothing;

do $comprobar$
begin
  if exists (select 1 from public.autorizaciones where accion in ('VENTAS.DESPACHAR', 'VENTAS.ANULAR_NOTA_ENTREGA')) then
    raise exception 'Hay autorizaciones sobre las casillas viejas de la nota: mudarlas a mano antes de borrar.';
  end if;
end
$comprobar$;

delete from public.acciones where codigo in ('VENTAS.DESPACHAR', 'VENTAS.ANULAR_NOTA_ENTREGA');

do $ver$
begin
  if position($x$exigir_permiso('FACTURACION', 'ESCRITURA')$x$ in pg_get_functiondef('public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)'::regprocedure)) = 0 then
    raise exception 'despachar sigue pidiendo otro permiso';
  end if;
  if position($x$exigir_permiso('FACTURACION', 'TOTAL')$x$ in pg_get_functiondef('public.anular_nota_entrega(bigint, text)'::regprocedure)) = 0 then
    raise exception 'anular_nota_entrega sigue pidiendo otro permiso';
  end if;
  if (select count(*) from public.acciones where codigo in ('FACTURACION.DESPACHAR', 'FACTURACION.ANULAR_NOTA_ENTREGA')) <> 2 then
    raise exception 'faltan las casillas de la nota en Facturación';
  end if;
end
$ver$;
