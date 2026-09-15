/*
  TRES DEFECTOS DE LA FACTURACIÓN, ENCONTRADOS EN LA AUDITORÍA DEL 14/09/2026.

  Comprobados leyendo los cuerpos vivos antes de tocarlos. En producción hay 0
  facturas y 0 notas de crédito, así que ninguno tenía víctimas todavía: se
  arreglan antes de que las tenga.

  1. UNA FACTURA SALDADA POR NOTA DE CRÉDITO SE QUEDABA EMITIDA PARA SIEMPRE.
     `emitir_nota_credito` no tocaba la factura, y solo `registrar_cobro` la
     cerraba. Con el saldo en cero no admitía cobro (cualquier monto supera
     cero), no se anulaba (tiene nota de crédito) y seguía contando como vencida.
     Ahora la nota la cierra si la deja sin saldo, y anular la nota la reabre si
     vuelve a deber. COBRADA quiere decir «no se le debe nada»; la pantalla dice
     «Saldada con nota de crédito» cuando no entró dinero.

  2. LO VENDIDO SIN IVA ENTRABA AL LIBRO COMO BASE AL 0 %, NO COMO EXENTO.
     Con cliente exento, o con la casilla del IVA desmarcada, la alícuota queda en
     0 pero los renglones no se marcan exentos. `recalcular_venta` lo sumaba como
     gravado, y el libro de ventas calcula `exento = total - iva - base`: salía
     cero. Sin alícuota no hay base imponible: todo es exento.

  3. EL COBRO NO COMPROBABA QUE EL MÉTODO PUDIERA CAER EN ESA CUENTA.
     El pago de una compra lo comprueba un disparador de su tabla
     (`private.validar_metodo_pago`); el cobro no tenía nada, y un pago móvil podía
     entrar a una cuenta en dólares. Se comprueba dentro de `registrar_cobro`, con
     la misma regla del catálogo.
*/

do $mig$
declare
  v_def  text;
  v_func text;
  r      record;
begin
  for r in
    select * from (values
      (1, 'public', 'emitir_nota_credito',
       $t$  end loop;

  return v_id;
$t$,
       $t$  end loop;

  -- Si la nota deja la factura sin nada que cobrar, la factura se cierra: si no,
  -- se quedaba emitida sin admitir cobro ni anulación, y contando como vencida.
  if private.saldo_de_factura(v_fac.id) <= 0.01 then
    update public.facturas_venta
       set estado = 'COBRADA'
     where id = v_fac.id and estado = 'EMITIDA';
  end if;

  return v_id;
$t$),
      (2, 'public', 'anular_nota_credito',
       $t$   where id = p_id;
end;
$t$,
       $t$   where id = p_id;

  -- Y al revés: si la nota la había cerrado y sin ella vuelve a deber, se reabre.
  update public.facturas_venta
     set estado = 'EMITIDA'
   where id = v_nota.factura_id
     and estado = 'COBRADA'
     and private.saldo_de_factura(v_nota.factura_id) > 0.01;
end;
$t$),
      (3, 'private', 'recalcular_venta',
       $t$  if v_subtotal > 0 then
    v_proporcion := v_gravado / v_subtotal;
$t$,
       $t$  -- Sin alícuota no hay base imponible: lo que se vendió sin IVA es exento, y
  -- así tiene que llegar al libro de ventas. Antes entraba como base al 0 %.
  if coalesce(v_alicuota, 0) = 0 then
    v_base := 0;
  elsif v_subtotal > 0 then
    v_proporcion := v_gravado / v_subtotal;
$t$),
      (4, 'public', 'registrar_cobro',
       $t$  v_ref     text := nullif(trim(coalesce(p_referencia, '')), '');
begin
$t$,
       $t$  v_ref     text := nullif(trim(coalesce(p_referencia, '')), '');
  v_metodo  record;
begin
$t$),
      (5, 'public', 'registrar_cobro',
       $t$  if v_cuenta.id is null then
    raise exception 'No existe la cuenta %.', p_cuenta_id using errcode = 'P0002';
  end if;
$t$,
       $t$  if v_cuenta.id is null then
    raise exception 'No existe la cuenta %.', p_cuenta_id using errcode = 'P0002';
  end if;

  /*
    EL MÉTODO TIENE QUE PODER CAER EN ESA CUENTA.

    La misma regla del catálogo que el pago de una compra comprueba con
    `private.validar_metodo_pago`, que es disparador de su tabla y aquí no sirve.
    Sin esto un pago móvil entraba a una cuenta en dólares.
  */
  select * into v_metodo from public.metodos_pago
   where codigo = coalesce(p_metodo, 'TRANSFERENCIA');

  if v_metodo.codigo is null then
    raise exception 'El método de pago «%» no existe.', p_metodo using errcode = '23503';
  end if;

  if not v_metodo.activo then
    raise exception '% ya no está en uso como método de pago.', v_metodo.nombre
      using errcode = '55000';
  end if;

  if v_metodo.moneda_regla = 'SOLO_VES' and v_cuenta.moneda <> 'VES' then
    raise exception '% solo funciona en bolívares, y la cuenta % es en %.',
      v_metodo.nombre, v_cuenta.nombre, v_cuenta.moneda using errcode = '22023';
  end if;

  if v_metodo.moneda_regla = 'NUNCA_VES' and v_cuenta.moneda = 'VES' then
    raise exception '% no funciona en bolívares, y la cuenta % es en bolívares.',
      v_metodo.nombre, v_cuenta.nombre using errcode = '22023';
  end if;
$t$)
    ) as t(orden, esquema, funcion, ancla, nuevo)
    order by orden
  loop
    if v_func is distinct from r.esquema || '.' || r.funcion then
      if v_def is not null then
        execute v_def;
      end if;
      v_func := r.esquema || '.' || r.funcion;
      select pg_get_functiondef(p.oid) into strict v_def
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = r.esquema and p.proname = r.funcion;
    end if;

    if (length(v_def) - length(replace(v_def, r.ancla, ''))) / length(r.ancla) <> 1 then
      raise exception 'El ancla % de % no aparece exactamente una vez.', r.orden, v_func
        using errcode = '22023';
    end if;

    v_def := replace(v_def, r.ancla, r.nuevo);
  end loop;

  execute v_def;
end
$mig$;

-- Comprobado al aplicar.
do $ver$
declare
  r record;
begin
  for r in
    select * from (values
      ('public', 'emitir_nota_credito', 'set estado = ''COBRADA'''),
      ('public', 'anular_nota_credito', 'set estado = ''EMITIDA'''),
      ('private', 'recalcular_venta', 'coalesce(v_alicuota, 0) = 0'),
      ('public', 'registrar_cobro', 'v_metodo.moneda_regla = ''SOLO_VES''')
    ) as t(esquema, funcion, marca)
  loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = r.esquema and p.proname = r.funcion
                      and strpos(p.prosrc, r.marca) > 0) then
      raise exception '%.% no quedó con su arreglo.', r.esquema, r.funcion using errcode = '22023';
    end if;
  end loop;
end
$ver$;
