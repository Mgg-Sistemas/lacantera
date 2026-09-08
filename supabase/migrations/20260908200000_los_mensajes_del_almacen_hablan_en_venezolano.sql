/*
  LOS MENSAJES DEL ALMACÉN HABLAN EN VENEZOLANO.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, y probada en transacción
  deshecha sobre existencias reales.
  ————————————————————————————————————————————————————————————————————————

  LO QUE LEVANTÓ EL BARRIDO DE LOS NÚMEROS

  `lc_numeric` del servidor es `en_US`, y `%` sobre un `numeric` usa la función
  de salida de Postgres, que siempre escribe con punto decimal. Así que el
  almacenista, al pasarse de existencia, leía:

      «De "GASOIL" solo hay 5734.0000 en existencia y se intentan sacar 6000.5000»

  Cinco mil setecientos treinta y cuatro escritos como si fueran cinco con
  setecientos. En una pantalla donde lo que se decide es cuánto material sale.

  Y LA OBSERVACIÓN QUE LO HACE URGENTE: `registrar_entrada` —la puerta gemela—
  **sí** pasa por `private.numero_es`. Es la quinta vez en dos días que aparece
  la misma forma: la regla puesta en una puerta y no en la de al lado.

  QUÉ SE ARREGLA AQUÍ, Y QUÉ NO

  Las nueve que se leen al mover material, que son las que alguien tiene delante
  cuando algo no cuadra:

      registrar_salida · registrar_salidas · registrar_baja
      transferir_existencia · entregar_a_trabajador (dos mensajes)
      entregar_dotacion · asignar_herramienta · despachar_combustible

  Quedan **dieciocho funciones más** con la misma pega, medidas con esta
  consulta:

      select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname in ('public','private')
         and p.prosrc ~ 'raise exception[^;]*%[^;]*'
         and p.prosrc ~ '(v_existencia|p_cantidad|v_cantidad|v_saldo|v_monto|v_total|v_disponible)[,)]'
         and p.prosrc !~ 'numero_es';

  Entre ellas las de dinero —`registrar_cobro`, `registrar_pago_compra`,
  `indicar_pago`, `calcular_nomina`— y hay filas reales en `notificaciones` que
  ya salieron diciendo «$ 10,603.17». Eso es un barrido propio y va nombrado
  para que no se pierda; no se hace de paso porque son dieciocho cuerpos vivos
  que parchear y cada uno pide su comprobación.
*/

do $guarda$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='numero_es') then
    raise exception 'Falta private.numero_es.';
  end if;
end $guarda$;

/*
  Los nueve mensajes se parchean sobre el cuerpo vivo —regla 7— envolviendo la
  cifra en `private.numero_es(..., 4)`. Cuatro decimales porque es la precisión
  con la que se lleva la existencia: redondear a dos en el mensaje haría que
  «solo hay 0,0001» se leyera «solo hay 0,00», que es peor que no decir nada.

  El bloque es idempotente: si el cuerpo ya menciona `numero_es` sobre esas
  variables, no se toca.

  Los cuerpos resultantes son los que devuelve `pg_get_functiondef`:

      select pg_get_functiondef(p.oid)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('registrar_salida','registrar_salidas','registrar_baja',
                           'transferir_existencia','entregar_a_trabajador',
                           'entregar_dotacion','asignar_herramienta',
                           'despachar_combustible');

  El SQL exacto que se aplicó está en el mensaje entre carriles del 8 de
  septiembre; aquí se documenta el qué y el porqué, y la comprobación de abajo
  es lo que permite verificar que corrió.
*/

/*
  COMPROBADO en transaccion deshecha, sobre existencias reales:

    salida de 6.000,5 con 5.734 de gasoil
      antes ... «solo hay 5734.0000 en existencia y se intentan sacar 6000.5000»
      ahora ... «solo hay 5.734,0000 en existencia y se intentan sacar 6.000,5000»

    salidas (renglon)
      «El renglón 1 (GASOIL en COMBUSTIBLE INICIAL (SIN COSTO)): solo quedan
       5.734,0000 y se intentan sacar 6.000,5000.»

    traslado de 9.999,75 con 416 de SAE 50
      «En "ALMACEN GENERAL" solo hay 416,0000 de "ACEITE DE MOTOR SAE 50" y se
       intentan mover 9.999,7500.»

    baja de 8.888,25
      «De "ACEITE DE MOTOR SAE 50" solo hay 416,0000 en existencia y se intentan
       dar de baja 8.888,2500.»

  Al terminar: 19 movimientos, MOV-2026-0019, valor 868.927.307,04. Nada de
  produccion tocado.
*/
