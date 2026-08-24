-- ---------------------------------------------------------------------------
-- La base vive en hora de Venezuela
--
-- El servidor iba en UTC. Venezuela va cuatro horas por detrás, así que todo lo
-- que se registrara entre las ocho de la noche y la medianoche caía, para la
-- base, en el día siguiente.
--
-- NO ES TEÓRICO. En el libro de inventario había dos entradas registradas a las
-- 22:40 del 21 de agosto y fechadas el 22:
--
--   MOV-2026-0017  fecha 2026-08-22  ·  registrada 21/08 22:40
--   MOV-2026-0018  fecha 2026-08-22  ·  registrada 21/08 22:40
--
-- Un pago así no cuadra con el estado de cuenta del banco, y una salida de
-- material del turno de noche no cuadra con el consumo del día. Una cantera
-- trabaja por turnos: esa franja se usa a diario.
--
-- POR QUÉ AQUÍ Y NO EN CADA FUNCIÓN
--
-- `current_date` aparece en 47 funciones, y casi siempre para lo mismo: poner
-- la fecha de hoy cuando quien registra no la escribe —`coalesce(p_fecha,
-- current_date)`— o para negarse a aceptar una fecha futura. Corregirlas una a
-- una serían 47 oportunidades de equivocarse, y la 48 nacería con el mismo
-- fallo.
--
-- La zona es una propiedad de la empresa, no de cada consulta. La cantera está
-- en Bolívar y trabaja en hora de Bolívar.
--
-- QUÉ NO CAMBIA
--
-- Los `timestamptz` guardados no se mueven: por dentro siempre fueron un
-- instante absoluto y se seguían guardando bien. Lo que cambia es cómo se
-- convierten a día, que es donde estaba el error.
--
-- Las columnas `date` ya escritas tampoco cambian. Las dos de arriba se quedan
-- con el día corrido: el libro de inventario es inmutable por disparador —esa
-- es su razón de ser— y son movimientos de prueba de estos días. Corregirlas
-- exigiría saltarse la inmutabilidad, que es peor que dos fechas mal en datos
-- que no son reales.
--
-- Las conversiones explícitas que ya se escribieron —`at time zone
-- 'America/Caracas'` en el gasto por unidad y en las dos vistas de proveedores—
-- siguen siendo correctas: una conversión explícita no depende de la zona de la
-- sesión. Se quedan, y además documentan la intención.
--
-- SE PONE EN LA BASE Y EN LOS ROLES
--
-- En la base para cualquier conexión, y en `authenticator` porque es con quien
-- se conecta PostgREST, que es por donde entra todo lo que hace el navegador.
-- Aplica a conexiones nuevas: las abiertas siguen en UTC hasta que se reciclen.
--
-- Comprobado desde el navegador con una sesión normal: PostgREST responde ya en
-- America/Caracas y `current_date` coincide con el día de la cantera.
-- ---------------------------------------------------------------------------

alter database postgres set timezone to 'America/Caracas';

alter role authenticator  set timezone to 'America/Caracas';
alter role authenticated  set timezone to 'America/Caracas';
alter role anon           set timezone to 'America/Caracas';
alter role service_role   set timezone to 'America/Caracas';
alter role postgres       set timezone to 'America/Caracas';
