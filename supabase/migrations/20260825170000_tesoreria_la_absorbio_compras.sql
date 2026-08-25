-- ---------------------------------------------------------------------------
-- Tesorería no existe en La Cantera: la absorbió Compras
--
-- Lo dijo Christopher, por la líder, dos veces y la segunda con todas las
-- letras. No es que el módulo esté escondido —que también—: es que el
-- departamento no existe en esta empresa. El rol TESORERIA estaba puesto por
-- herencia del sistema del que se copió el modelo.
--
-- Retirar un rol que tienen tres cuentas activas no es borrar una fila. El rol
-- abría trece funciones, y TRES de ellas viven en pantallas que sí están en el
-- aire hoy:
--
--   devolver_instruccion .... Compras › Pagos
--   resolver_desistimiento .. Compras › la ficha de una orden
--   pagar_nomina ............ Nómina › Procesos
--
-- Si el rol se va sin mover esas tres, a Leniska y a Susej les revientan los
-- botones sin que nadie sepa por qué. Así que primero se mueven, se comprueba
-- que nadie pierda nada, y después se retira el rol —que es la migración
-- siguiente—.
--
-- QUIÉN PAGA LA NÓMINA. Lo decidió Christopher: Recursos Humanos. Quien arma la
-- nómina la paga. Leniska y Susej ya tienen RRHH, así que la siguen pagando; el
-- gerente general también, que es quien la aprueba.
--
-- =========================================================================
-- LO QUE NO SE TOCA, Y HAY QUE DECIRLO
-- =========================================================================
--
-- El estado `EN_TESORERIA` de una orden de compra se queda como está. Es un
-- valor de un CHECK sobre text (regla 3) y hay órdenes que lo llevan escrito;
-- renombrarlo es otra faena, con su migración de datos.
--
-- Por eso TODAS las sustituciones de abajo son de cadenas exactas y ninguna es
-- un reemplazo de la palabra TESORERIA: eso habría corrompido el estado en
-- cuatro funciones que lo nombran sin que ninguna prueba lo cazara hasta la
-- primera compra.
--
-- =========================================================================
-- POR QUÉ SE REESCRIBE CON `pg_get_functiondef` Y NO A MANO
-- =========================================================================
--
-- Son trece funciones y de la mayoría solo cambia una línea. Copiarlas enteras
-- a este archivo es trece oportunidades de introducir una diferencia sin querer
-- —y ya hay precedente en este proyecto: un archivo editado después de correr
-- dejó `guardar_cargo_tabulador` escribiendo una columna borrada—.
--
-- Leyendo la definición viva y sustituyendo la cadena exacta, lo demás no se
-- toca porque nadie lo escribe. Y si una cadena no aparece —porque la reja
-- cambió desde que se midió— revienta antes de aplicar nada.
-- ---------------------------------------------------------------------------

do $tesoreria$
declare
  v_def    text;
  v_hechos int := 0;
  r        record;
  -- (funcion, lo que hay, lo que va). Cadenas exactas.
  v_cambios text[][] := array[
    -- Las tres que viven en pantallas activas
    ['pagar_nomina',            'private.exigir_rol(''TESORERIA'')',
                                'private.exigir_rol(''RRHH'', ''GERENTE_GENERAL'')'],
    ['pagar_nomina',            'array[''GERENTE_GENERAL'', ''RRHH'', ''TESORERIA'']',
                                'array[''GERENTE_GENERAL'', ''RRHH'']'],
    ['devolver_instruccion',    'private.exigir_rol(''TESORERIA'')',
                                'private.exigir_rol(''COMPRAS'')'],
    ['resolver_desistimiento',  'private.exigir_rol(''GERENTE_GENERAL'', ''TESORERIA'')',
                                'private.exigir_rol(''GERENTE_GENERAL'', ''COMPRAS'')'],
    -- Pagar una orden: Compras ya pasaba por su propia equivalencia, así que
    -- quitar el rol de la lista no le quita nada a nadie que lo use hoy.
    ['registrar_pago',          'private.exigir_rol(''TESORERIA'', ''COMPRAS'')',
                                'private.exigir_rol(''COMPRAS'')'],
    ['registrar_pagos_en_lote', 'private.exigir_rol(''TESORERIA'', ''COMPRAS'')',
                                'private.exigir_rol(''COMPRAS'')'],
    -- Los papeles de una compra los suben cuatro roles; Compras ya está en la
    -- lista, así que sobra el que se va.
    ['adjuntar_papel_de_compra','private.tiene_rol(''ADMIN'', ''COMPRAS'', ''TESORERIA'', ''ALMACEN'')',
                                'private.tiene_rol(''ADMIN'', ''COMPRAS'', ''ALMACEN'')'],
    ['quitar_papel_de_compra',  'private.tiene_rol(''ADMIN'', ''COMPRAS'', ''TESORERIA'', ''ALMACEN'')',
                                'private.tiene_rol(''ADMIN'', ''COMPRAS'', ''ALMACEN'')'],
    -- El aviso de nómina aprobada iba a quien la pagaba. Ahora la paga RRHH.
    ['aprobar_nomina',          'array[''TESORERIA'', ''RRHH'']', 'array[''RRHH'']']
  ];
begin
  -- 1. Las nombradas, una a una.
  for i in 1 .. array_length(v_cambios, 1) loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.proname = v_cambios[i][1];

    if v_def is null then
      raise exception 'No existe public.%', v_cambios[i][1];
    end if;
    if position(v_cambios[i][2] in v_def) = 0 then
      raise exception 'En % no aparece «%». La reja cambió desde que se midió: vuelve a medirla antes de aplicar esto.',
        v_cambios[i][1], v_cambios[i][2];
    end if;

    execute replace(v_def, v_cambios[i][2], v_cambios[i][3]);
    v_hechos := v_hechos + 1;
  end loop;

  -- 2. Las siete del módulo en obra. Dejarlas apuntando a un rol borrado sería
  --    justo la clase de referencia colgando que este proyecto lleva un mes
  --    pagando. Pasan a la reja del módulo, que es la que ya declara su casilla
  --    y que con el módulo vaciado solo deja pasar al administrador.
  --
  --    Son: guardar_cuenta, registrar_apertura, ajustar_cuenta,
  --    registrar_ingreso, registrar_egreso, transferir_entre_cuentas y
  --    reversar_movimiento_tesoreria. No se nombran una a una porque el filtro
  --    ya las define: las que quedaban con esa reja después del paso 1.
  for r in
    select p.proname, pg_get_functiondef(p.oid) as def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and pg_get_functiondef(p.oid) like '%private.exigir_rol(''TESORERIA'')%'
  loop
    execute replace(r.def, 'private.exigir_rol(''TESORERIA'')',
                           'private.exigir_permiso(''TESORERIA'', ''ESCRITURA'')');
    v_hechos := v_hechos + 1;
  end loop;

  -- 3. Los avisos de private.anotar. TESORERIA ahí quería decir «quien paga».
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'anotar' and p.prokind = 'f';

  if position('array[''TESORERIA'']' in v_def) = 0
     or position('array[''GERENTE_GENERAL'', ''TESORERIA'']' in v_def) = 0 then
    raise exception 'private.anotar ya no trae los dos avisos que se midieron.';
  end if;

  execute replace(
            replace(v_def, 'array[''GERENTE_GENERAL'', ''TESORERIA'']',
                           'array[''GERENTE_GENERAL'', ''COMPRAS'']'),
            'array[''TESORERIA'']', 'array[''COMPRAS'']');
  v_hechos := v_hechos + 1;

  raise notice 'funciones reescritas: %', v_hechos;
end;
$tesoreria$;

-- ---------------------------------------------------------------------------
-- La equivalencia se va con el rol
--
-- Mientras existiera esta fila, `exigir_rol('TESORERIA')` seguiría dejando
-- pasar a quien tuviera TESORERIA:ESCRITURA aunque el rol ya no exista. No
-- queda ninguna función que la use, pero una equivalencia a un rol borrado es
-- una trampa esperando.
-- ---------------------------------------------------------------------------
create or replace function private.equivalencia_rol(p_rol text)
returns table(modulo text, nivel text)
language sql
immutable
as $func$
  select e.modulo, e.nivel
  from (values
    -- Quien lleva la nómina la escribe entera: fichas, novedades, períodos,
    -- tabulador. Y desde que Compras absorbió a tesorería, también la paga.
    ('RRHH',        'NOMINA',      'ESCRITURA'),

    -- Almacén es quien recibe, despacha y ajusta lo que hay en el patio.
    ('ALMACEN',     'INVENTARIO',  'ESCRITURA'),

    -- Compras va a TOTAL y no a ESCRITURA a propósito. En la matriz sembrada,
    -- "Compras en escritura" lo tienen también Solicitante, Operaciones y RRHH,
    -- que son quienes PIDEN material. Si el comprador y el que pide compartieran
    -- nivel, cualquiera podría confirmar un pedido o dar de alta un proveedor.
    -- Pedir es escritura; comprar es total.
    ('COMPRAS',     'COMPRAS',     'TOTAL'),
    ('SOLICITANTE', 'COMPRAS',     'ESCRITURA'),

    -- Operaciones vive en el frente y pide lo que le hace falta.
    ('OPERACIONES', 'EXPLOTACION', 'ESCRITURA')
  ) as e(rol, modulo, nivel)
  where e.rol = p_rol;
$func$;

comment on function private.equivalencia_rol(text) is
  'Qué nivel de módulo vale por cada rol en private.exigir_rol. TESORERIA salió el 25/08/2026: el departamento no existe en La Cantera, lo absorbió Compras.';
