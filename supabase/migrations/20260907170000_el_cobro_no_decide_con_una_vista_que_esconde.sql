/*
  EL COBRO NO PUEDE DECIDIR CON UNA VISTA QUE LE ESCONDE EL DATO.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 7 de septiembre de 2026, por MCP. El cuerpo se parchea sobre
  `pg_get_functiondef` —regla 7— y el bloque es idempotente: si ya está puesto,
  no hace nada.
  ————————————————————————————————————————————————————————————————————————

  EL BLOQUEANTE

  Lo encontró el carril de base de datos, y es el más serio que ha salido:
  **con `VENTAS:ESCRITURA` y sin la acción `VENTAS.VER_VENTAS` se podía abonar
  cualquier cifra a cualquier factura.**

  La cadena tiene tres eslabones y los comprobé uno a uno:

    1. v_facturas_venta.saldo_usd  =  CASE WHEN puede_accion('VENTAS.VER_VENTAS')
                                           THEN GREATEST(...) ELSE NULL END
    2. VENTAS.VER_VENTAS  ->  cero filas en rol_acciones: solo ADMIN la tiene
    3. registrar_cobro    ->  v_saldo := v_fac.saldo_usd;
                              if v_monto_usd > v_saldo + 0.01 then raise ...

  `999999 > NULL + 0.01` es NULL, y **un `if` con NULL no dispara**. Comprobado:

      select (999999 > NULL::numeric + 0.01) is null;   -- t

  Dos daños, no uno. Entraba el cobro por cualquier cifra, **y** la factura no
  se cerraba nunca —el `if` del cierre leía el mismo nulo—, así que seguía
  contando como cuenta por cobrar y como vencida para siempre.

  LA LECCIÓN, QUE ES MÁS ANCHA QUE ESTA FUNCIÓN

  **Una función `SECURITY DEFINER` no puede apoyar una decisión en una vista que
  esconde datos según quién llama.** La vista filtra para MOSTRAR; la función
  necesita la verdad para DECIDIR. Son dos trabajos distintos y aquí se estaban
  haciendo con la misma herramienta.

  De ahí sale `private.saldo_de_factura`: la misma fórmula de la vista, palabra
  por palabra, sin la reja. Y de ahí sale también el trabajo pendiente de
  repasar qué otras funciones leen vistas con `puede_accion` dentro.

  UNA RED, ADEMÁS DEL ARREGLO

  Aunque el saldo ya no puede salir nulo por el permiso, se comprueba igual
  antes de comparar. Un nulo a la derecha de un `>` abre la puerta en vez de
  cerrarla, y esa forma ya ha mordido dos veces en esta base —`rango_nivel`
  antes, ésta ahora—. Donde una comparación decide sobre dinero, el nulo se
  cierra a mano.

  LO QUE SIGUE LEYENDO LA VISTA, Y ESTÁ BIEN

  `registrar_cobro` sigue haciendo `select * into v_fac from v_facturas_venta`
  para el número, el estado y el cliente. Esas columnas no están enrejadas y no
  deciden nada: se usan para escribir el texto de los asientos. Lo que se quitó
  es la lectura del SALDO, que es la única que devolvía nulo.

  COMPROBADO, con el ataque exacto del carril y en transacción deshecha:

      jlozada (GERENTE_GENERAL, no ADMIN) · VER_VENTAS = f
        saldo que ve la vista ......... NULO
        saldo real (el ayudante) ...... 116,00
      cobro de 999.999 .......... REBOTA: «le faltan 116,00 $ y se están
                                  abonando 999.999,00 $»
      cobro legitimo de 116 ..... PASA, y la factura queda COBRADA
                                  (antes no se cerraba nunca)
*/

do $guarda$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'private' and p.proname = 'puede_accion') then
    raise exception 'Falta private.puede_accion.';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'registrar_cobro') <> 1 then
    raise exception 'registrar_cobro no es unica.';
  end if;
end $guarda$;

-- ---------------------------------------------------------------------------
-- El saldo, sin mirar quien pregunta
-- ---------------------------------------------------------------------------
create or replace function private.saldo_de_factura(p_factura_id bigint)
returns numeric language sql stable security definer set search_path to ''
as $function$
  /*
    La formula es la de `v_facturas_venta.saldo_usd`, palabra por palabra, para
    que las dos digan siempre lo mismo. Lo unico que falta es el envoltorio
    `CASE WHEN puede_accion(...) THEN ... ELSE NULL END`, que es justo lo que
    convertia una reja en una puerta abierta.
  */
  select greatest(
           f.total_usd
             - f.retencion_usd
             - coalesce((select sum(co.monto_usd) from public.cobros_venta co
                          where co.factura_id = f.id and co.estado = 'REGISTRADO'), 0)
             - coalesce((select sum(nc.total_usd) from public.notas_credito nc
                          where nc.factura_id = f.id and nc.estado = 'EMITIDA'), 0),
           0)
    from public.facturas_venta f
   where f.id = p_factura_id;
$function$;

comment on function private.saldo_de_factura(bigint) is
  'Lo que falta por cobrar de una factura, sin la reja de VER_VENTAS. Para decidir, no para mostrar: la vista devuelve NULL a quien no puede ver el dinero, y un NULL en una comparacion abre la puerta en vez de cerrarla.';

-- ---------------------------------------------------------------------------
-- Y el cobro deja de preguntarle el saldo a la vista
-- ---------------------------------------------------------------------------
do $patch$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'registrar_cobro';

  -- El centinela: si ya usa el ayudante, esto ya corrio.
  if position('saldo_de_factura' in v_def) > 0 then
    raise notice 'registrar_cobro ya esta corregida; no se toca.';
    return;
  end if;

  -- 1. La reja del sobrecobro
  v_def := replace(v_def, 'v_saldo := v_fac.saldo_usd;',
                          'v_saldo := private.saldo_de_factura(p_factura_id);');

  -- 2. El cierre, que tenia el mismo agujero y por eso la factura no se cerraba
  v_def := replace(v_def,
    'if (select saldo_usd from public.v_facturas_venta where id = p_factura_id) <= 0.01 then',
    'if private.saldo_de_factura(p_factura_id) <= 0.01 then');

  -- 3. La red del nulo, por si saliera nulo por cualquier otra razon
  v_def := replace(v_def, 'if v_monto_usd > v_saldo + 0.01 then',
    'if v_saldo is null then
      raise exception ''No se pudo calcular lo que falta por cobrar de esa factura. No se registra un cobro a ciegas.''
        using errcode = ''22023'';
    end if;

    if v_monto_usd > v_saldo + 0.01 then');

  /*
    La vista se sigue leyendo UNA vez, para el numero, el estado y el cliente:
    esas columnas no estan enrejadas. Lo que no puede quedar es la lectura del
    SALDO. Por eso la comprobacion busca `saldo_usd from public.v_facturas_venta`
    y no la vista a secas — mirar solo la vista daria un falso positivo, que es
    lo que me paso al primer intento.
  */
  if position('saldo_usd from public.v_facturas_venta' in v_def) > 0 then
    raise exception 'Todavia lee el saldo de la vista.';
  end if;
  if position('private.saldo_de_factura' in v_def) = 0 or position('v_saldo is null' in v_def) = 0 then
    raise exception 'Falto el ayudante o la red del nulo.';
  end if;

  execute v_def;
  raise notice 'registrar_cobro corregida.';
end $patch$;

/*
  QUEDA ABIERTO, y no es de esta migracion:

  Repasar que otras funciones leen vistas con `puede_accion` dentro para tomar
  decisiones. `registrar_cobro` era la unica de las 290 que leia
  `v_facturas_venta`, pero el patron puede repetirse con otras vistas.
*/
