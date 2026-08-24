-- ---------------------------------------------------------------------------
-- PENDIENTE DE APLICAR — no está en supabase/migrations a propósito
--
-- Esta matriz cambia lo que ve cada persona al entrar. Aplicarla en mitad de la
-- semana de entrega dejaría a Leniska y a Susej sin Compras, sin Nómina y sin
-- Configuración de golpe, sin avisar. Por eso vive aquí y no en la carpeta de
-- migraciones: `supabase db push` no la toca.
--
-- Para aplicarla: moverla a supabase/migrations/ con la fecha del día, o
-- ejecutarla a mano. Antes, avisar a quien vaya a quedarse sin algo.
--
-- ===========================================================================
-- POR QUÉ HACE FALTA
--
-- Hoy, de seis usuarios activos, cinco lo pueden todo. Y no por tener ADMIN:
-- Leniska y Susej no lo tienen. Lo pueden todo porque el rol TESORERIA concede
-- TOTAL en los quince módulos, incluido USUARIOS.
--
-- Eso no viene del diseño. La migración 20260728180000 repartió con criterio
-- —tesorería tenía COMPRAS en lectura y nada de usuarios— y alguien lo abrió
-- después desde la pantalla de Configuración, seguramente para poder desarrollar
-- sin tropezar. Se comprobó: ninguna migración concede USUARIOS a TESORERIA.
--
-- LO QUE NO ES
--
-- No es un agujero de seguridad tan grande como parece a primera vista. El
-- sistema tiene dos rejas y las dos funcionan: el permiso de módulo decide qué
-- PANTALLAS se ven, y el rol decide qué ACCIONES se pueden ejecutar. Se probó
-- entrando con una cuenta de solo TESORERIA: ve casi todo, pero no puede crear
-- usuarios, ni repartir permisos, ni aprobar compras, ni tocar nómina.
--
-- Lo que sí es: un problema de privacidad —los sueldos de los 19 trabajadores
-- se ven desde un rol que no los necesita para nada— y de ruido, porque media
-- plantilla tiene en el menú módulos que no puede usar.
--
-- ===========================================================================
-- CÓMO SE DECIDIÓ CADA NIVEL
--
-- No se copia la matriz de julio: el negocio cambió. Tesorería y compras se
-- combinaron por decisión de la empresa, así que el rol TESORERIA necesita
-- escribir en COMPRAS —cosa que en julio no— para poder registrar los pagos.
--
-- Cada nivel sale de lo que las funciones exigen de verdad, comprobado contra
-- el catálogo:
--
--   registrar_pago_compra, registrar_factura_compra  → COMPRAS:ESCRITURA
--   anular_pago_compra, anular_factura_compra        → COMPRAS:TOTAL
--   cargar_articulos_por_lote                        → INVENTARIO:ESCRITURA
--   registrar_tasa                                   → TASAS:ESCRITURA
--   fijar_tributos                                   → CONFIGURACION:ESCRITURA
--   calcular_liquidacion, pagar_liquidacion,
--   guardar_corte_prestaciones                       → NOMINA:TOTAL
--
-- ===========================================================================
-- UN HALLAZGO QUE ESTA MATRIZ CORRIGE
--
-- RRHH tiene NOMINA en ESCRITURA, pero liquidar a un trabajador, cerrar el
-- trimestre de prestaciones y registrar un anticipo exigen NOMINA:TOTAL.
--
-- Es decir: HOY RECURSOS HUMANOS NO PUEDE LIQUIDAR A NADIE. Solo pueden ADMIN,
-- gerencia y —por el exceso de permisos— tesorería. No ha dado la cara todavía
-- porque nadie ha liquidado a nadie, pero saldría el día que toque, que es el
-- peor día para descubrirlo.
--
-- Aquí RRHH sube a NOMINA:TOTAL. La alternativa sería bajar esas funciones a
-- ESCRITURA, pero una liquidación cierra la relación laboral y mueve dinero:
-- que pida el nivel más alto del módulo es correcto. Lo que estaba mal era el
-- rol, no la función.
-- ===========================================================================
-- A QUIÉN AFECTA, PERSONA POR PERSONA
--
-- Calculado contra los usuarios reales sumando sus roles, ensayando la matriz
-- en una transacción y deshaciéndola. Nadie pierde el módulo de su trabajo:
--
--   leni12 (Leniska) y susi (Susej) — llevan tesorería
--     Conservan  TESORERIA en total, COMPRAS en escritura, NOMINA en lectura,
--                y por el rol de almacén que también tienen, INVENTARIO y
--                DESPACHOS en escritura.
--     Pierden    USUARIOS (total → nada), CONFIGURACION (total → nada),
--                VENTAS (total → nada), y bajan de total a escritura en
--                inventario, despachos y tasas.
--
--   jlozada (Jesús) — gerente general
--     Conserva   COMPRAS en total, que es lo que necesita para aprobar.
--     Pierde     USUARIOS, y baja a lectura en los ocho módulos operativos.
--                Sigue viéndolo todo; deja de poder operarlo.
--
--   administradora_ (Jesmary)
--     Pierde     CONFIGURACION, y baja inventario de total a escritura y tasas
--                de total a lectura. Lo demás igual.
--
--   admin_ y sistemas2 (Anthony)
--     No cambian: tienen ADMIN, que entra por otra puerta.
--
-- Lo que de verdad se va, en una línea: nadie que no administre el sistema
-- podrá volver a crear usuarios ni repartir permisos.
--
-- ===========================================================================

do $$
begin
  -- Se rehace la matriz entera menos ADMIN, que entra por la puerta de
  -- `private.tiene_permiso` y no por aquí. Se siembra en TOTAL igual, para que
  -- la pantalla lo muestre completo y no en blanco.
  delete from public.rol_permisos where rol <> 'ADMIN';

  insert into public.rol_permisos (rol, modulo, nivel) values
    -- GERENCIA. Es la única figura que aprueba una compra antes de que se
    -- pague, y para eso necesita COMPRAS en total. El resto lo mira: un gerente
    -- que además opera es un gerente que se aprueba a sí mismo.
    --
    -- USUARIOS se queda fuera a propósito: el propio sistema dice, en el
    -- formulario de alta, que administrar «se reserva a quien administra el
    -- sistema, no a la gerencia». Si se decide lo contrario, es una línea.
    ('GERENTE_GENERAL', 'PANEL',         'LECTURA'),
    ('GERENTE_GENERAL', 'COMPRAS',       'TOTAL'),
    ('GERENTE_GENERAL', 'TESORERIA',     'LECTURA'),
    ('GERENTE_GENERAL', 'INVENTARIO',    'LECTURA'),
    ('GERENTE_GENERAL', 'NOMINA',        'LECTURA'),
    ('GERENTE_GENERAL', 'EXPLOTACION',   'LECTURA'),
    ('GERENTE_GENERAL', 'DESPACHOS',     'LECTURA'),
    ('GERENTE_GENERAL', 'VENTAS',        'LECTURA'),
    ('GERENTE_GENERAL', 'MAQUINARIA',    'LECTURA'),
    ('GERENTE_GENERAL', 'COMBUSTIBLE',   'LECTURA'),
    ('GERENTE_GENERAL', 'ASIGNACIONES',  'LECTURA'),
    ('GERENTE_GENERAL', 'TASAS',         'LECTURA'),
    ('GERENTE_GENERAL', 'CONFIGURACION', 'LECTURA'),

    -- COMPRAS. Opera su módulo entero —incluidas las anulaciones, que piden
    -- TOTAL— y mantiene el catálogo de artículos, que es donde nacen los
    -- renglones de un pedido. Mira tesorería para saber si su orden ya se pagó.
    --
    -- Pierde CONFIGURACION: la tenía en escritura y no le servía de nada. Se
    -- comprobó entrando con el rol: los datos de la empresa salen bloqueados y
    -- sin botón de guardar. Eran tres entradas de menú que no llevaban a nada.
    ('COMPRAS',         'PANEL',         'LECTURA'),
    ('COMPRAS',         'COMPRAS',       'TOTAL'),
    ('COMPRAS',         'INVENTARIO',    'ESCRITURA'),
    ('COMPRAS',         'TESORERIA',     'LECTURA'),
    ('COMPRAS',         'TASAS',         'LECTURA'),
    ('COMPRAS',         'MAQUINARIA',    'LECTURA'),
    ('COMPRAS',         'COMBUSTIBLE',   'LECTURA'),

    -- TESORERÍA. Aquí está el grueso del recorte.
    --
    -- COMPRAS sube a ESCRITURA —en julio era lectura— porque las áreas se
    -- combinaron y ahora la cola de pagos vive en Compras: sin esto no podría
    -- registrar un pago. No llega a TOTAL: anular una factura ya emitida es
    -- cosa de quien la emitió.
    --
    -- NOMINA se queda en LECTURA y no en total. Tesorería paga la nómina, así
    -- que necesita ver el monto de cada quien y su cuenta bancaria — eso es
    -- inherente al trabajo, no un exceso. Lo que sobraba era poder modificarla.
    --
    -- Se van USUARIOS, CONFIGURACION, INVENTARIO, VENTAS, DESPACHOS y
    -- EXPLOTACION. Ninguno hace falta para pagar.
    ('TESORERIA',       'PANEL',         'LECTURA'),
    ('TESORERIA',       'TESORERIA',     'TOTAL'),
    ('TESORERIA',       'COMPRAS',       'ESCRITURA'),
    ('TESORERIA',       'NOMINA',        'LECTURA'),
    ('TESORERIA',       'TASAS',         'ESCRITURA'),

    -- ALMACÉN. Recibe el material, lo cuenta y lo despacha. Mira compras para
    -- saber qué viene en camino. Pierde CONFIGURACION por lo mismo que compras.
    ('ALMACEN',         'PANEL',         'LECTURA'),
    ('ALMACEN',         'INVENTARIO',    'ESCRITURA'),
    ('ALMACEN',         'COMPRAS',       'LECTURA'),
    ('ALMACEN',         'DESPACHOS',     'ESCRITURA'),
    ('ALMACEN',         'ASIGNACIONES',  'ESCRITURA'),
    ('ALMACEN',         'COMBUSTIBLE',   'ESCRITURA'),
    ('ALMACEN',         'MAQUINARIA',    'ESCRITURA'),

    -- RECURSOS HUMANOS. Sube a NOMINA:TOTAL, que es lo que exigen liquidar,
    -- cerrar trimestre y registrar anticipos. Ver el hallazgo de arriba.
    --
    -- Mantiene inventario y asignaciones porque entrega la dotación, y compras
    -- porque pide lo suyo. TASAS baja de TOTAL a LECTURA: la tasa del día la
    -- carga quien lleva las tasas, y la nómina la congela sola al abrir el
    -- período. Pierde VENTAS, que nunca tuvo que ver con nómina.
    ('RRHH',            'PANEL',         'LECTURA'),
    ('RRHH',            'NOMINA',        'TOTAL'),
    ('RRHH',            'ASIGNACIONES',  'ESCRITURA'),
    ('RRHH',            'INVENTARIO',    'ESCRITURA'),
    ('RRHH',            'COMPRAS',       'ESCRITURA'),
    ('RRHH',            'TASAS',         'LECTURA'),

    -- OPERACIONES. El frente: producción, voladuras, consumo de combustible y
    -- pedir lo que hace falta.
    ('OPERACIONES',     'PANEL',         'LECTURA'),
    ('OPERACIONES',     'EXPLOTACION',   'TOTAL'),
    ('OPERACIONES',     'COMPRAS',       'ESCRITURA'),
    ('OPERACIONES',     'INVENTARIO',    'LECTURA'),
    ('OPERACIONES',     'MAQUINARIA',    'ESCRITURA'),
    ('OPERACIONES',     'COMBUSTIBLE',   'ESCRITURA'),
    ('OPERACIONES',     'ASIGNACIONES',  'LECTURA'),

    -- VENTAS. Cotiza, despacha, factura y cobra. Mira tesorería para saber si
    -- el cliente pagó.
    ('VENTAS',          'PANEL',         'LECTURA'),
    ('VENTAS',          'VENTAS',        'ESCRITURA'),
    ('VENTAS',          'DESPACHOS',     'ESCRITURA'),
    ('VENTAS',          'INVENTARIO',    'LECTURA'),
    ('VENTAS',          'TESORERIA',     'LECTURA'),
    ('VENTAS',          'TASAS',         'LECTURA'),

    -- SOLICITANTE. El rol mínimo: pedir material y ver si llegó. Es el que
    -- lleva cualquier supervisor que no opera ningún módulo.
    ('SOLICITANTE',     'PANEL',         'LECTURA'),
    ('SOLICITANTE',     'COMPRAS',       'ESCRITURA'),
    ('SOLICITANTE',     'INVENTARIO',    'LECTURA'),

    -- CONSULTA. Mira y no toca. Nómina y tesorería quedan fuera a propósito:
    -- «solo lectura» de lo que gana cada quien sigue siendo ver el sueldo de
    -- todo el mundo.
    ('CONSULTA',        'PANEL',         'LECTURA'),
    ('CONSULTA',        'INVENTARIO',    'LECTURA'),
    ('CONSULTA',        'COMPRAS',       'LECTURA'),
    ('CONSULTA',        'DESPACHOS',     'LECTURA'),
    ('CONSULTA',        'MAQUINARIA',    'LECTURA'),
    ('CONSULTA',        'ASIGNACIONES',  'LECTURA'),
    ('CONSULTA',        'COMBUSTIBLE',   'LECTURA'),
    ('CONSULTA',        'TASAS',         'LECTURA'),

    -- RESPALDO. Una sola cosa, y por eso es un rol aparte: quien puede
    -- descargar la base entera se lleva los sueldos, las cédulas y las cuentas
    -- bancarias en un archivo.
    ('RESPALDO',        'RESPALDO',      'TOTAL');

  -- ADMIN, completo. Entra por `private.tiene_permiso`, pero se siembra para
  -- que la matriz de la pantalla no salga en blanco.
  insert into public.rol_permisos (rol, modulo, nivel)
  select 'ADMIN', codigo, 'TOTAL' from public.modulos
  on conflict (rol, modulo) do update set nivel = 'TOTAL';

  -- Lo que no se nombró arriba queda explícito en NINGUNO, para que la pantalla
  -- muestre la matriz completa y no filas ausentes que hay que interpretar.
  insert into public.rol_permisos (rol, modulo, nivel)
  select r.codigo, m.codigo, 'NINGUNO'
    from public.roles r
   cross join public.modulos m
  on conflict (rol, modulo) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Para comprobar después de aplicarla
--
--   select rol, string_agg(modulo || '=' || left(nivel,1), ' ' order by modulo)
--            filter (where nivel <> 'NINGUNO')
--     from public.rol_permisos where rol <> 'ADMIN' group by rol order by rol;
--
-- Y sobre todo, entrando: hay cuentas de prueba con un solo rol cada una
-- —prueba.supervisor lleva TESORERIA— con las que se ve lo mismo que verá la
-- persona real.
--
-- El SQL de arriba se ensayó completo dentro de una transacción con rollback:
-- corre sin errores y deja la matriz que dice esta cabecera. Lo que no se puede
-- ensayar así es la cara de quien entra el lunes y no encuentra su módulo, y
-- por eso esto espera a que la líder avise.
-- ---------------------------------------------------------------------------
