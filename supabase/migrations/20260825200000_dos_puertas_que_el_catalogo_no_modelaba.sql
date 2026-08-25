-- ---------------------------------------------------------------------------
-- Dos puertas que el catálogo no modelaba
--
-- Las dos salieron de una verificación adversarial del catálogo recién
-- sembrado: agentes independientes intentando refutar «esto no le da ni le
-- quita nada a nadie», y después escépticos intentando tumbar lo que
-- encontraron. De diez hallazgos graves, seis se cayeron al reproducirlos.
-- Estos dos sobrevivieron a las dos rondas.
--
-- Merece decirse el método, porque la comprobación mía había dado CERO
-- diferencias y era correcta: comparaba las casillas contra las funciones que
-- yo mismo había emparejado. Lo que no podía cazar era una puerta que yo no
-- hubiera puesto en el mapa. Para eso hace falta que otro parta de `pg_proc` y
-- vaya tachando al revés.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. `entregar_dotacion`: una salida de almacén sin casilla y sin dueño
--
-- El front dejó de llamarla al unificar la entrega a un trabajador por una
-- sola puerta —`src/lib/api/nomina.ts` lo cuenta—, pero la función se quedó
-- viva y con EXECUTE para `authenticated`. O sea: llamable por RPC hoy.
--
-- Tres cosas que la hacen algo más que código muerto:
--
--   · Descuenta existencia de verdad: `registrar_movimiento('SALIDA_CONSUMO',
--     -1, ...)`. Es una salida de almacén que ninguna casilla del catálogo
--     nombra. Quien arme un rol desmarcando «sacar material» y «entregar
--     herramientas» creerá haber cerrado las salidas a personal, y no.
--
--   · Su reja es MÁS ANCHA que la de su reemplazo. `exigir_rol('ALMACEN',
--     'RRHH')` cae a las equivalencias, así que pasan también el gerente
--     general y compras. `entregar_a_trabajador` reja con `tiene_rol`, que es
--     literal y no cae: por ahí esos dos NO pasan. La puerta vieja es la
--     ancha.
--
--   · No mira `articulos.modo_entrega`. Entregar un retornable por aquí lo
--     hace DESAPARECER del almacén en vez de dejarlo prestado a nombre de
--     nadie. Es justo el fallo que la puerta nueva se escribió para arreglar.
--
-- Se le quita el EXECUTE en vez de borrarla: la migración que la sustituyó
-- decidió a propósito no borrarla, y respetar esa decisión cuesta una línea.
-- Revocar es reversible y no rompe nada — comprobado, el front no la llama.
-- ---------------------------------------------------------------------------
revoke execute on function public.entregar_dotacion(bigint, bigint, jsonb, date, text)
  from authenticated, anon, public;

comment on function public.entregar_dotacion(bigint, bigint, jsonb, date, text) is
  'RETIRADA el 25/08/2026: sin EXECUTE para authenticated. La sustituyo entregar_a_trabajador, que mira articulos.modo_entrega y por tanto deja prestado lo retornable en vez de hacerlo desaparecer. Esta se quedaba viva, llamable por RPC, con reja mas ancha que su reemplazo y sin casilla que la nombrara. No se borra por respetar la decision de la migracion que la sustituyo.';

-- ---------------------------------------------------------------------------
-- 2. `RESPALDO.DESCARGAR`: la casilla prometía una puerta que no existe
--
-- Este es mío, y del tipo que más me interesa cazar: la pantalla diciendo una
-- cosa y la base otra.
--
-- El respaldo no se reja como todo lo demás. `private.puede_respaldar()` es un
-- séptimo ayudante que el catálogo no modela: mira `rol_permisos` buscando
-- RESPALDO en TOTAL, con comparación literal, y **NO tiene escapatoria de
-- ADMIN**. Eso es deliberado y está bien pensado: quien administra el sistema
-- no es automáticamente quien puede salir por la puerta con la base entera.
-- Es una separación de funciones, no un descuido.
--
-- Pero `private.puede_accion` empieza por `tiene_rol('ADMIN') or ...`, como
-- todas las puertas normales. Así que al meter RESPALDO.DESCARGAR en el
-- catálogo le puse por encima una escapatoria que su puerta real no tiene.
--
-- Medido, usuario por usuario: `puede_accion('RESPALDO.DESCARGAR')` dice que sí
-- a `prueba.admin` y a `revision.diseno` —dos cuentas de prueba con ADMIN a
-- secas— y `respaldo_datos` les responde 42501. Y `public.mis_acciones()` ya
-- les devuelve la acción, así que en cuanto una pantalla pinte el botón del
-- respaldo con eso, se lo estará ofreciendo a quien la base va a negar. Y al
-- revés, más grave: el día que `respaldo_datos` pase a `exigir_accion`, la
-- escapatoria dejaría de ser una promesa falsa y pasaría a ser real, contra el
-- archivo que se lleva las cédulas, los sueldos y las cuentas bancarias de los
-- veintidós trabajadores.
--
-- La casilla se apaga. No quita nada a nadie: nadie la tiene marcada —cero
-- filas en `rol_acciones`— y el camino que sí funciona sigue abierto, que es
-- darle a un rol RESPALDO en TOTAL desde la matriz. Lo que se retira es la
-- promesa.
--
-- Lo que hay que decidir después, y no aquí: si el respaldo debe seguir siendo
-- la única puerta que ADMIN no abre. Si la respuesta es que sí —y creo que sí,
-- por lo que dice el propio texto de la casilla— entonces esta acción no puede
-- vivir bajo `puede_accion` mientras esa función pase a todo ADMIN por su
-- primera línea, y hace falta o una lista de acciones sin escapatoria o dejar
-- el respaldo fuera del catálogo para siempre.
-- ---------------------------------------------------------------------------
update public.acciones
   set activa = false,
       dice = dice || ' (Casilla apagada el 25/08/2026: el respaldo no se reparte por casillas porque su puerta real, private.puede_respaldar, no deja pasar al administrador, y puede_accion sí. Para darlo, dale al rol RESPALDO en total desde la matriz.)'
 where codigo = 'RESPALDO.DESCARGAR';
