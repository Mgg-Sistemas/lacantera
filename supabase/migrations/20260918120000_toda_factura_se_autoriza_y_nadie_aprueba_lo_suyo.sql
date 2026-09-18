/*
  TODA FACTURA SE AUTORIZA, Y NADIE APRUEBA LO QUE ÉL MISMO PIDIÓ

  Angélica, 18/09/2026: «las ventas, las facturas, las notas de entrega y las
  notas de salida llevan autorización: los usuarios hacen su solicitud y luego
  otro usuario con permisos aprueba». Y «las ventas» es la factura directa.

  Cómo estaba cada una esta mañana:

  - Salida de almacén: se pedía y se aprobaba, pero quien la pedía podía
    aprobarla él mismo si respondía por el almacén o tenía la casilla.
  - Despacho (nota de entrega): se pide y se aprueba desde la migración de
    las 11:00 de hoy, con el mismo hueco.
  - Factura (desde notas o directa): la de las 10:38 (Christopher) dejaba por
    autorizar solo la de quien tenía restringida la casilla; los demás
    emitían directo. Ahí sí, quien la preparó ya no podía autorizarla.

  Lo que cambia:

  1. Aprobar una salida o un despacho que uno mismo pidió se rechaza.
  2. `facturar_notas` y `facturar_directo` solo corren dentro de
     `autorizar_factura`. Desde el navegador se prepara (enviar a autorizar) y
     otro la emite. La señal es una variable de la transacción que pone
     `autorizar_factura` justo antes de emitir y quita justo después; el
     navegador no puede ponerla, porque solo llama funciones de `public`.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. La salida no la aprueba quien la pidió
-- ═══════════════════════════════════════════════════════════════════════════

do $parche$
declare
  v_def   text := pg_get_functiondef('public.aprobar_solicitud_salida(bigint, boolean)'::regprocedure);
  v_antes text := $a$  select * into v_alm from public.almacenes where id = v_s.almacen_id;$a$;
  v_despues text := $b$  -- Quien la pidió no la aprueba (Angélica, 18/09/2026): la aprueba otro.
  if v_s.pedida_por = (select auth.uid()) then
    raise exception 'La solicitud % la pediste tú: la aprueba otro usuario con permiso.', v_s.numero
      using errcode = '42501';
  end if;

  select * into v_alm from public.almacenes where id = v_s.almacen_id;$b$;
begin
  if (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes) <> 1 then
    raise exception 'aprobar_solicitud_salida no es la esperada: no se toca.';
  end if;
  execute replace(v_def, v_antes, v_despues);
end
$parche$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. El despacho no lo aprueba quien lo pidió
-- ═══════════════════════════════════════════════════════════════════════════

do $parche$
declare
  v_def   text := pg_get_functiondef('public.aprobar_despacho(bigint)'::regprocedure);
  v_antes text := $a$  -- El despacho de siempre: revisa existencias, ticket y guía, y rebaja el patio.$a$;
  v_despues text := $b$  if s.pedida_por = (select auth.uid()) then
    raise exception 'El despacho % lo pediste tú: lo aprueba otro usuario con permiso.', s.numero
      using errcode = '42501';
  end if;

  -- El despacho de siempre: revisa existencias, ticket y guía, y rebaja el patio.$b$;
begin
  if (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes) <> 1 then
    -- Aplicada desde el conector, la función perdió los comentarios: se ancla en la llamada.
    v_antes := $a$  v_nota := private.despachar($a$;
    v_despues := $b$  if s.pedida_por = (select auth.uid()) then
    raise exception 'El despacho % lo pediste tú: lo aprueba otro usuario con permiso.', s.numero
      using errcode = '42501';
  end if;

  v_nota := private.despachar($b$;
    if (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes) <> 1 then
      raise exception 'aprobar_despacho no es la esperada: no se toca.';
    end if;
  end if;
  execute replace(v_def, v_antes, v_despues);
end
$parche$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Emitir una factura solo desde autorizar_factura
-- ═══════════════════════════════════════════════════════════════════════════

do $parche$
declare
  v_def text;
  r     record;
begin
  for r in
    select * from (values
      ('public.facturar_notas(bigint[], text, date, text, numeric, numeric)'),
      ('public.facturar_directo(bigint, jsonb, text, text, date, text, numeric, numeric, boolean, bigint)')
    ) as t(funcion)
  loop
    v_def := pg_get_functiondef(r.funcion::regprocedure);
    if (length(v_def) - length(replace(v_def, $a$  -- LA FACTURA QUE NO SE PUEDE EMITIR QUEDA POR AUTORIZAR (18/09/2026).$a$, '')))
         / length($a$  -- LA FACTURA QUE NO SE PUEDE EMITIR QUEDA POR AUTORIZAR (18/09/2026).$a$) <> 1 then
      raise exception 'El cuerpo vivo de % no es el esperado: no se toca.', r.funcion;
    end if;
    execute replace(v_def,
      $a$  -- LA FACTURA QUE NO SE PUEDE EMITIR QUEDA POR AUTORIZAR (18/09/2026).$a$,
      $b$  -- TODA FACTURA SE AUTORIZA (Angélica, 18/09/2026): solo se emite desde
  -- autorizar_factura, que es quien pone esta señal. Nadie emite directo.
  if coalesce(current_setting('lacantera.factura_autorizada', true), '') <> 'si' then
    raise exception 'Toda factura se envía a autorizar: la emite otro usuario con permiso.'
      using errcode = '42501',
            hint = 'En Facturación, «Enviar a autorizar».';
  end if;

  -- LA FACTURA QUE NO SE PUEDE EMITIR QUEDA POR AUTORIZAR (18/09/2026).$b$);
  end loop;
end
$parche$;

do $parche$
declare
  v_def text := pg_get_functiondef('public.autorizar_factura(bigint)'::regprocedure);
  v_antes1 text := $a$  v_a := v_s.argumentos;$a$;
  v_antes2 text := $a$  update public.facturas_por_autorizar set factura_id = v_factura where id = p_id;$a$;
begin
  if (length(v_def) - length(replace(v_def, v_antes1, ''))) / length(v_antes1) <> 1
     or (length(v_def) - length(replace(v_def, v_antes2, ''))) / length(v_antes2) <> 1 then
    raise exception 'autorizar_factura no es la esperada: no se toca.';
  end if;
  v_def := replace(v_def, v_antes1, $b$  v_a := v_s.argumentos;

  -- La señal de que esta emisión viene autorizada. Vive solo en esta transacción.
  perform set_config('lacantera.factura_autorizada', 'si', true);$b$);
  v_def := replace(v_def, v_antes2, $b$  perform set_config('lacantera.factura_autorizada', '', true);

  update public.facturas_por_autorizar set factura_id = v_factura where id = p_id;$b$);
  execute v_def;
end
$parche$;

-- La casilla ya no dice que alguien emite lo suyo.
update public.acciones
   set dice = 'Emitir la factura que otro dejó por autorizar: gasta el número de control, '
              'descuenta el patio si el material sale con ella y la deja en el libro de ventas. '
              'Toda factura se prepara y la emite otro usuario con esta casilla; nadie autoriza la suya.'
 where codigo = 'FACTURACION.AUTORIZAR_FACTURA';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Comprobación
-- ═══════════════════════════════════════════════════════════════════════════

do $ver$
begin
  if strpos(pg_get_functiondef('public.facturar_notas(bigint[], text, date, text, numeric, numeric)'::regprocedure), 'lacantera.factura_autorizada') = 0
     or strpos(pg_get_functiondef('public.facturar_directo(bigint, jsonb, text, text, date, text, numeric, numeric, boolean, bigint)'::regprocedure), 'lacantera.factura_autorizada') = 0
     or strpos(pg_get_functiondef('public.autorizar_factura(bigint)'::regprocedure), 'lacantera.factura_autorizada') = 0 then
    raise exception 'La señal de factura autorizada no quedó puesta en las tres funciones.';
  end if;
  if strpos(pg_get_functiondef('public.aprobar_solicitud_salida(bigint, boolean)'::regprocedure), 'la pediste tú') = 0
     or strpos(pg_get_functiondef('public.aprobar_despacho(bigint)'::regprocedure), 'lo pediste tú') = 0 then
    raise exception 'Aprobar lo propio sigue abierto en salidas o despachos.';
  end if;
end
$ver$;
