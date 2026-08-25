-- ---------------------------------------------------------------------------
-- El libro del dinero se lee desde Compras
--
-- Este arreglo lo cazó ejecutar el cálculo en vez de deducirlo, y merece
-- contarse porque el fallo que evitó era caro.
--
-- El front calcula qué módulos están «en obra» —los que el menú esconde
-- enteros— para no enseñarlos en la matriz de permisos. Al ejecutarlo salieron
-- CUATRO y yo esperaba cinco. El que faltaba era Tesorería.
--
-- La razón: una de sus pantallas SÍ se ofrece. «Movimientos de dinero» cuelga
-- de la rama de Compras en el menú, junto a «Pagos por hacer», pero se había
-- quedado sin su línea en `MODULO_POR_PREFIJO` y por prefijo seguía reclamando
-- el módulo TESORERIA. Es el mismo despiste que ya se había arreglado para
-- `/app/tesoreria/pagos`, con una ruta menos.
--
-- =========================================================================
-- Y TIRANDO DE ESE HILO APARECIÓ ALGO PEOR
-- =========================================================================
--
-- Al vaciar el módulo en obra, Compras se quedaba sin leer
-- `cuentas_tesoreria`. Y esa es la lista de cuentas que se elige AL PAGAR UNA
-- ORDEN.
--
-- O sea: un vaciado hecho para dar coherencia a una pantalla de permisos habría
-- roto el pago de compras — que es exactamente lo que el departamento de
-- Compras empieza a usar esta semana. Nadie lo habría atribuido a esto.
--
-- Antes de todo esto Compras tenía TESORERIA en LECTURA, así que leía las dos
-- tablas. Esto no le da nada nuevo: le devuelve por la puerta de su propio
-- módulo lo que tenía por la del módulo que se apagó. `instrucciones_pago` ya
-- estaba escrita así desde que la cola de pagos pasó a Compras; estas dos se
-- quedaron atrás.
--
-- Se REEMPLAZA la política, no se añade una segunda. Regla 6: se suman con OR,
-- y dos políticas de SELECT sobre lo mismo son dos sitios que mantener y uno
-- que alguien olvidará.
-- ---------------------------------------------------------------------------

drop policy if exists cuentas_tesoreria_lectura on public.cuentas_tesoreria;
create policy cuentas_tesoreria_lectura on public.cuentas_tesoreria
  for select using (
    private.tiene_permiso('TESORERIA', 'LECTURA')
    or private.tiene_permiso('COMPRAS', 'LECTURA')
  );

drop policy if exists tesoreria_movimientos_lectura on public.tesoreria_movimientos;
create policy tesoreria_movimientos_lectura on public.tesoreria_movimientos
  for select using (
    private.tiene_permiso('TESORERIA', 'LECTURA')
    or private.tiene_permiso('COMPRAS', 'LECTURA')
  );

comment on table public.tesoreria_movimientos is
  'El libro del dinero. Lo leen quien tenga TESORERIA o COMPRAS en lectura: la pantalla que lo enseña —Movimientos de dinero— cuelga de Compras desde que Compras absorbio a tesoreria. Escribir sigue siendo del modulo TESORERIA, hoy en obra y por tanto solo del administrador.';

-- Y la casilla lo dice, porque es lo que lee quien arma un rol.
update public.acciones
   set dice = 'Cuánto hay en cada banco, caja y billetera, y el libro donde queda escrito cada movimiento. Es mirar sin poder mover nada. Quien lleva Compras también lo ve, porque de ahí escoge la cuenta con la que paga.'
 where codigo = 'TESORERIA.VER_CUENTAS';
