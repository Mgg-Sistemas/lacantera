-- LA CAJA SIN SOBREGIRO NO GASTA LO QUE NO TIENE
--
-- `cuentas_tesoreria.permite_sobregiro` existía y nadie la miraba: en la prueba
-- del 21/09/2026 una caja de 1.300 $ dejó sacar 999.999 $ y quedó en negativo.
-- Se comprueba en la ÚNICA puerta por la que pasa todo movimiento, así que cubre
-- el gasto suelto, el pago de una compra, la nómina y el traslado a la vez.
--
-- NO CAMBIA NADA HOY: las siete cuentas tienen el sobregiro permitido. Empieza a
-- frenar en la cuenta a la que se le quite, que es decisión de quien la lleva.
--
-- El candado sobre la fila de la cuenta pone en fila a dos salidas simultáneas
-- de la misma caja: sin él, las dos leerían el mismo saldo y pasarían las dos.
--
-- El REVERSO no se frena: deshacer un ingreso mal anotado tiene que poderse
-- siempre, y si deja la caja en negativo, ese negativo es la noticia.

do $parche$
declare
  v_def   text := pg_get_functiondef('private.registrar_movimiento_tesoreria(bigint,text,integer,numeric,text,date,text,text,bigint,bigint,bigint,text,text,text)'::regprocedure);
  v_ancla text := E'  select * into v_tasas from private.tasas_del_dia(v_moneda, v_fecha);\n';
begin
  if position('permite_sobregiro' in v_def) > 0 then
    return; -- ya aplicada
  end if;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'registrar_movimiento_tesoreria no es la esperada: no se toca.';
  end if;

  execute replace(v_def, v_ancla,
$b$  -- LA CAJA SIN SOBREGIRO NO GASTA LO QUE NO TIENE (21/09/2026).
  if p_cuenta is not null and p_signo < 0 and p_tipo <> 'REVERSO'
     and not v_cuenta.permite_sobregiro then
    perform 1 from public.cuentas_tesoreria where id = p_cuenta for update;
    if private.saldo_cuenta(p_cuenta) < p_monto then
      raise exception '«%» tiene % % y esta salida es de %. No alcanza.',
        v_cuenta.nombre, private.cantidad_es(private.saldo_cuenta(p_cuenta)), v_cuenta.moneda,
        private.cantidad_es(p_monto)
        using errcode = '55000',
              hint = 'Si el saldo del sistema está por debajo del real, ajústalo primero desde Bancos y cajas.';
    end if;
  end if;

$b$ || v_ancla);
end
$parche$;

do $comprueba$
begin
  if position('permite_sobregiro' in pg_get_functiondef('private.registrar_movimiento_tesoreria(bigint,text,integer,numeric,text,date,text,text,bigint,bigint,bigint,text,text,text)'::regprocedure)) = 0 then
    raise exception 'El freno del sobregiro no quedó puesto.';
  end if;
end
$comprueba$;
