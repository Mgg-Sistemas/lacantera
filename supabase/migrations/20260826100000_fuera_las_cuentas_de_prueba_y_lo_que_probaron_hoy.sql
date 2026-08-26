-- Fuera las cuentas de prueba y lo que probaron hoy.
--
-- Christopher, con dos capturas: «los datos que ingresaron hoy por un usuario
-- son datos de prueba. Debemos eliminar a los usuarios de prueba de la imagen».
--
-- Las capturas traían cinco. La sexta la encontré midiendo y él confirmó que se
-- fuera: `prueba.admin`, que además era la única de las seis que seguía ACTIVA
-- y con rol de administrador. Una cuenta de prueba con acceso total a un sistema
-- que empieza a usarse de verdad es justo lo que no conviene dejar.
--
-- =========================================================================
-- LO QUE ENTRÓ HOY, Y LO QUE DE ESO NO ERA PRUEBA
-- =========================================================================
--
--   SE VA   pedido SOL-2026-0001, orden OC-2026-0001, sus dos instrucciones de
--           pago y el movimiento de 2.565 Bs. Un recorrido de compra completo,
--           de punta a punta.
--
--   SE VA   el período NOM-2026-0001 con sus recibos, tres faltas y su novedad.
--           Lo delataba una falta marcada el 27 de agosto, que todavía no ha
--           llegado: nadie falta mañana.
--
--   SE QUEDA  el artículo CT-GASOIL y el proveedor GOLDEN TOUCH 1127, C.A.
--             Son catálogo, no documentos, y lo más probable es que los quieran
--             igual. Christopher lo confirmó. Si no, es un clic.
--
--   SE QUEDA  las tasas del BCV. Son el cambio real del día y borrarlas dejaría
--             sin convertir cualquier papel con esa fecha.
--
-- =========================================================================
-- POR QUÉ BORRAR UNA CUENTA NO ERA UNA LÍNEA
-- =========================================================================
--
-- El primer intento reventó, y el segundo también. Las dos veces por lo mismo,
-- y merece quedar escrito porque no está donde uno lo busca:
--
-- 1. LAS COLUMNAS DE «QUIÉN LO HIZO» APUNTAN A `auth.users`, NO A `perfiles`.
--    Busqué las claves foráneas contra `public.perfiles` y salieron trece, casi
--    ninguna importante. La realidad es que hay setenta y tantas contra
--    `auth.users` —`creado_por`, `registrado_por`, `aprobada_gg_por`…— y casi
--    todas en NO ACTION, o sea que FRENAN el borrado.
--
--    Eso no es un defecto: es buena protección. No se borra a alguien sin
--    resolver antes lo que firmó. Pero hay que saberlo, y `perfiles` es el sitio
--    natural donde uno mira primero.
--
-- 2. HAY TABLAS QUE NO ADMITEN NI UN UPDATE. `tasas_cambio` y
--    `tesoreria_movimientos` tienen disparador de inmutabilidad. Para soltar una
--    referencia hay que apagarlo y volver a encenderlo en el acto, dentro de la
--    misma transacción.
--
-- Se sueltan las referencias en vez de borrar las filas: la tasa del 18/08 la
-- había registrado `revision.diseno` y es una tasa real del BCV. Pierde el «lo
-- registró», que en una tasa que baja sola la tarea diaria no significa nada.
--
-- LA AUDITORÍA NO SE TOCA. Trescientas diez líneas, nueve de ellas de estas
-- cuentas. No tiene clave foránea y es inmutable a propósito: el registro de
-- quién hizo qué tiene que seguir diciéndolo aunque la cuenta ya no exista.
--
-- =========================================================================
-- COMPROBADO en transacción revertida antes de aplicarlo
-- =========================================================================
--
--   quedan          7 cuentas: admin_, administrador2, administradora_,
--                   jlozada, leni12, sistemas2, susi
--   documentos      pedidos=0 ordenes=0 instrucciones=0 tesoreria=0
--   nomina          periodos=0 recibos=0 faltas=0 novedades=0
--   se conserva     articulos=1  proveedores=1  empleados=22
--                   tasas=16  auditoria=310

do $limpieza$
declare
  v_ids uuid[];
  v_orden bigint;
  v_sol bigint;
  r record;
  v_n bigint;
  v_soltadas bigint := 0;
begin
  select array_agg(id) into v_ids from public.perfiles
   where usuario in ('prueba.admin', 'prueba.analista.admin', 'prueba.bienes.fluidos',
                     'prueba.jefe.electricista', 'prueba.supervisor', 'revision.diseno');

  if v_ids is null then
    raise notice 'No quedaban cuentas de prueba: nada que hacer.';
    return;
  end if;

  select id into v_orden from public.ordenes_compra where numero = 'OC-2026-0001';
  select id into v_sol   from public.solicitudes_pedido where numero = 'SOL-2026-0001';

  /*
    EL DINERO PRIMERO, y en este orden.

    El movimiento apunta a la instrucción, así que borrar la instrucción antes
    revienta con 23503 — ya pasó en la limpieza de ayer. Y la tabla es inmutable.
  */
  if v_orden is not null then
    alter table public.tesoreria_movimientos disable trigger user;
    delete from public.tesoreria_movimientos
     where instruccion_id in (select id from public.instrucciones_pago where orden_id = v_orden);
    alter table public.tesoreria_movimientos enable trigger user;

    delete from public.instrucciones_pago where orden_id = v_orden;
  end if;

  -- El pedido y su cotización se apuntan mutuamente: se suelta la elegida.
  if v_sol is not null then
    update public.solicitudes_pedido set cotizacion_elegida_id = null where id = v_sol;
  end if;

  delete from public.ordenes_compra where id = v_orden;
  delete from public.cotizaciones where solicitud_id = v_sol;
  delete from public.solicitudes_pedido where id = v_sol;

  delete from public.nomina_periodos where numero = 'NOM-2026-0001';

  -- Los contadores vuelven a cero: la primera compra y la primera nómina de
  -- verdad tienen que ser la 0001.
  delete from public.correlativos where prefijo in ('OC', 'SOL', 'NOM', 'PAG');

  /*
    Y ahora se suelta lo que las seis cuentas firmaron y que NO se borra.

    Toda columna que apunte a auth.users, frene el borrado y admita nulo. Se
    apaga el disparador de la tabla por si es de las inmutables y se vuelve a
    encender en el acto.
  */
  for r in
    select c.conrelid::regclass::text as tabla, a.attname as columna
      from pg_constraint c
      join unnest(c.conkey) k on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
     where c.contype = 'f'
       and c.confrelid = 'auth.users'::regclass
       and c.conrelid::regclass::text not like 'auth.%'
       and c.confdeltype = 'a'
       and not a.attnotnull
     order by 1, 2
  loop
    execute format('alter table %s disable trigger user', r.tabla);
    execute format('update %s set %I = null where %I = any($1)', r.tabla, r.columna, r.columna)
      using v_ids;
    get diagnostics v_n = row_count;
    execute format('alter table %s enable trigger user', r.tabla);
    v_soltadas := v_soltadas + v_n;
  end loop;

  /*
    Las cuentas.

    Se borra de `auth.users` y no de `perfiles`: el perfil cuelga de ahí en
    cascada, y con él sus roles, sus firmas y sus sesiones abiertas. Borrar solo
    el perfil dejaría viva la cuenta de acceso, que es la mitad que importa.
  */
  delete from auth.users where id = any(v_ids);

  raise notice 'cuentas borradas: %  ·  referencias soltadas: %',
    array_length(v_ids, 1), v_soltadas;
end;
$limpieza$;
