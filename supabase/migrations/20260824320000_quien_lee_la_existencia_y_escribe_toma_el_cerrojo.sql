-- ---------------------------------------------------------------------------
-- Quien lee la existencia y escribe, toma el cerrojo
--
-- El carril de base de datos: «el cerrojo de existencia solo está en dos de las
-- ocho puertas». Contadas contra el catálogo son DIEZ las que leen la existencia
-- y escriben sin cerrojo, no seis: a la lista del carril le faltan
-- `abrir_mantenimiento`, `asignar_herramienta`, `cerrar_mantenimiento` y
-- `registrar_ajuste`.
--
-- Dos salidas simultáneas del mismo artículo leen el mismo saldo, las dos pasan,
-- y el almacén queda en negativo. `registrar_salidas` es de hoy y nació sin él.
--
-- =========================================================================
-- POR QUÉ NO VALE PONER EL CERROJO EN `registrar_movimiento`
-- =========================================================================
--
-- Era la propuesta del carril —una línea, ocho puertas— y para la reja de
-- capacidad sí vale, porque esa comprobación vive dentro. Para la EXISTENCIA no:
-- la lectura ocurre FUERA, antes de llamar. Dos transacciones leen el saldo sin
-- cerrojo, las dos deciden que alcanza, y el cerrojo de dentro solo consigue que
-- escriban en fila india. Las dos escriben igual.
--
-- El cerrojo tiene que tomarse ANTES de leer. Y para que no se olvide en la
-- puerta número once, se toma DENTRO de la lectura: `existencia_para_escribir`
-- hace lo mismo que `existencia` pero cerrando antes. El nombre es la regla.
--
-- Se deja `private.existencia` intacta porque la usan las vistas —`v_tanques`,
-- `v_existencias`— y un cerrojo en un camino de lectura serializa consultas que
-- no tienen por qué esperarse.
--
-- Las diez se reescriben programáticamente desde `pg_get_functiondef`: cambiar a
-- mano diez cuerpos de función es diez ocasiones de equivocarse en uno.
--
-- =========================================================================
-- LA REJA DE CAPACIDAD SUMABA PERAS CON MANZANAS
-- =========================================================================
--
-- También del carril, y también cierto: la comprobación que se metió hace un
-- rato sumaba `cantidad` de todo el almacén sin mirar la unidad. En un tanque
-- con dos combustibles en litros está bien. Con cinco kilos de electrodo, tres
-- filtros y doscientos metros de cable, «208» no es nada.
--
-- Se suma solo lo que está en la MISMA unidad que lo que entra. En un tanque eso
-- son los litros y nada más, que es justo lo que quiere decir «cuánto le cabe».
-- Y de paso resuelve el dato raro que encontró el carril: `CMB-TAN` tiene 1
-- unidad de un artículo llamado «TANQUE DE COMBUSTIBLE» —el recipiente dado de
-- alta como material dentro de sí mismo— que en UND ya no estorba a los litros.
--
-- Y esa comprobación sí lleva su cerrojo, sobre el almacén entero y no sobre un
-- artículo: es lo que lee. La clave 0 no la usa nadie más porque los id de
-- artículo empiezan en 1.
-- ---------------------------------------------------------------------------

create or replace function private.existencia_para_escribir(
  p_almacen_id  bigint,
  p_articulo_id bigint
)
returns numeric
language plpgsql
security definer
set search_path to ''
as $func$
begin
  -- El cerrojo es de transacción: se suelta solo al terminar, y hasta entonces
  -- nadie más puede leer este par almacén/artículo para escribir.
  perform pg_catalog.pg_advisory_xact_lock(p_almacen_id::int, p_articulo_id::int);
  return private.existencia(p_almacen_id, p_articulo_id);
end;
$func$;

comment on function private.existencia_para_escribir(bigint, bigint) is
  'La existencia, tomando antes el cerrojo de ese almacén y artículo. La usa todo el que lee para decidir si puede escribir. `private.existencia` a secas se queda para las vistas, que no deben esperarse unas a otras.';

-- ---------------------------------------------------------------------------
-- Las diez puertas
--
-- APLICADO sobre: abrir_mantenimiento, asignar_herramienta, cerrar_mantenimiento,
-- entregar_a_trabajador, entregar_dotacion, registrar_ajuste, registrar_baja,
-- registrar_salida, registrar_salidas, transferir_existencia.
--
-- El bucle es idempotente: en la segunda pasada ya no queda ninguna función con
-- `private.existencia(` y no hace nada.
-- ---------------------------------------------------------------------------
do $migracion$
declare
  v_fn      record;
  v_def     text;
  v_hechas  text[] := '{}';
begin
  for v_fn in
    select p.oid, p.proname
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prokind = 'f'
       and pg_get_functiondef(p.oid) like '%private.existencia(%'
     order by p.proname
  loop
    v_def := pg_get_functiondef(v_fn.oid);
    v_def := replace(v_def, 'private.existencia(', 'private.existencia_para_escribir(');
    execute v_def;
    v_hechas := v_hechas || v_fn.proname;
  end loop;

  raise notice 'Cerrojo puesto en: %', array_to_string(v_hechas, ', ');
end;
$migracion$;

-- ---------------------------------------------------------------------------
-- La reja de capacidad: su propio cerrojo, y solo su unidad
-- ---------------------------------------------------------------------------
create or replace function private.registrar_movimiento(
  p_tipo text,
  p_signo integer,
  p_almacen bigint,
  p_articulo bigint,
  p_cantidad numeric,
  p_costo_usd numeric,
  p_nota text default null::text,
  p_orden bigint default null::bigint,
  p_renglon bigint default null::bigint,
  p_origen bigint default null::bigint,
  p_fecha date default null::date,
  p_empleado bigint default null::bigint,
  p_clase text default null::text,
  p_nota_salida text default null::text
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_unidad    text;
  v_id        bigint;
  v_capacidad numeric;
  v_nombre    text;
  v_hay       numeric;
begin
  if p_signo not in (-1, 1) then
    raise exception 'El signo de un movimiento solo puede ser +1 o -1 (recibido: %).', p_signo
      using errcode = '22023';
  end if;

  select unidad into v_unidad from public.articulos where id = p_articulo;

  if v_unidad is null then
    raise exception 'No existe el artículo %.', p_articulo using errcode = 'P0002';
  end if;

  -- Solo al entrar, y solo donde hay un tope declarado. Sacar nunca desborda.
  if p_signo = 1 then
    select capacidad, nombre into v_capacidad, v_nombre
      from public.almacenes where id = p_almacen;

    if v_capacidad is not null then
      -- El cerrojo va sobre el ALMACÉN, con clave 0 en el segundo hueco, porque
      -- lo que se lee es el almacén entero y no un artículo. Sin él, dos
      -- entradas a la vez leen el mismo total y las dos caben.
      perform pg_catalog.pg_advisory_xact_lock(p_almacen::int, 0);

      -- Solo lo que está en la misma unidad. «Cuánto le cabe» a un tanque son
      -- litros; los tres filtros que alguien guardó ahí no ocupan litros.
      select coalesce(sum(m.cantidad * m.signo), 0) into v_hay
        from public.inventario_movimientos m
       where m.almacen_id = p_almacen
         and m.unidad = v_unidad;

      if v_hay + p_cantidad > v_capacidad then
        raise exception 'En "%" caben % % y ya hay %: no entran % más.',
          v_nombre, v_capacidad, v_unidad, v_hay, p_cantidad
          using errcode = '22023',
                hint = format('Quedan %s libres.', v_capacidad - v_hay);
      end if;
    end if;
  end if;

  insert into public.inventario_movimientos
    (numero, fecha, tipo, signo, almacen_id, articulo_id, cantidad, unidad,
     costo_usd, orden_id, orden_renglon_id, movimiento_origen, nota, empleado_id,
     entrega_clase, registrado_por, nota_salida)
  values
    (private.siguiente_numero('MOV'), coalesce(p_fecha, current_date), p_tipo, p_signo,
     p_almacen, p_articulo, p_cantidad, v_unidad, coalesce(p_costo_usd, 0),
     p_orden, p_renglon, p_origen, nullif(trim(coalesce(p_nota, '')), ''), p_empleado,
     p_clase, (select auth.uid()), p_nota_salida)
  returning id into v_id;

  return v_id;
end;
$function$;

comment on function private.registrar_movimiento(text, integer, bigint, bigint, numeric, numeric, text, bigint, bigint, bigint, date, bigint, text, text) is
  'El único escritor del libro de inventario. Comprueba, con cerrojo y por unidad, que lo que entra quepa: un almacén con capacidad declarada —un tanque— no recibe más de lo que aguanta.';

-- ---------------------------------------------------------------------------
-- `v_tanques` deja de contradecir a la reja
--
-- Calculaba «cuánto cabe todavía» con la existencia de ESE combustible contra la
-- capacidad ENTERA. Un tanque de 3.000 con 1.500 de gasoil y 1.500 de gasolina
-- salía en dos filas, cada una al 50% y cada una diciendo que caben 1.500 más.
-- Está lleno. La pantalla ofrecía meterlos y `registrar_movimiento` los rechaza.
--
-- Ahora el hueco se calcula sobre lo que hay EN EL TANQUE en esa unidad, que es
-- exactamente lo que mira la reja. Las dos dicen lo mismo o no sirve ninguna.
--
-- La columna nueva va al final —`create or replace view` no admite meterla en
-- medio— y hay que volver a poner `security_invoker`, que el reemplazo descarta.
-- ---------------------------------------------------------------------------
create or replace view public.v_tanques as
 SELECT a.id AS almacen_id,
    a.codigo AS almacen_codigo,
    a.nombre AS tanque,
    a.ubicacion,
    a.capacidad,
    a.activo,
    ar.id AS articulo_id,
    ar.codigo AS articulo_codigo,
    ar.nombre AS combustible,
    ar.unidad,
    ar.stock_minimo,
    COALESCE(e.existencia, 0::numeric) AS existencia,
        CASE
            WHEN a.capacidad IS NULL OR a.capacidad <= 0::numeric THEN NULL::numeric
            ELSE round(COALESCE(t.en_el_tanque, 0::numeric) * 100::numeric / a.capacidad, 1)
        END AS lleno_pct,
        CASE
            WHEN a.capacidad IS NULL THEN NULL::numeric
            ELSE GREATEST(a.capacidad - COALESCE(t.en_el_tanque, 0::numeric), 0::numeric)
        END AS cabe_todavia,
    COALESCE(t.en_el_tanque, 0::numeric) AS en_el_tanque
   FROM almacenes a
     JOIN articulos ar ON ar.categoria = 'COMBUSTIBLE'::text AND ar.activo
     LEFT JOIN LATERAL ( SELECT private.existencia(a.id, ar.id) AS existencia) e ON true
     LEFT JOIN LATERAL ( SELECT sum(m.cantidad * m.signo::numeric) AS en_el_tanque
                           FROM inventario_movimientos m
                          WHERE m.almacen_id = a.id AND m.unidad = ar.unidad) t ON true
  WHERE a.tipo = 'COMBUSTIBLE'::text AND a.activo;

alter view public.v_tanques set (security_invoker = on);

comment on column public.v_tanques.en_el_tanque is
  'Todo lo que hay en el tanque en esa unidad, sumando los combustibles que sean. Es lo que mira la reja de capacidad, y por eso «cabe_todavia» se calcula sobre esto y no sobre la existencia de un solo combustible.';

-- ---------------------------------------------------------------------------
-- TRUNCATE nunca debió estar concedido
--
-- Lo encontró el carril, y se corrigió a sí mismo al encontrarlo: sus informes
-- decían «0 GRANT de escritura» porque contaban INSERT, UPDATE y DELETE y nunca
-- miraron TRUNCATE. Venía de la default privilege, y cada tabla nueva lo heredaba.
--
-- Hoy no es alcanzable —PostgREST no lo expone y ninguna función lo ejecuta—,
-- pero TRUNCATE se salta la RLS y los disparadores de fila, así que sería el
-- único camino por el que `auditoria` podría vaciarse sin que su propio
-- disparador de inmutabilidad llegara a saltar. Es el único punto donde la regla
-- 1 de la casa —«el navegador no escribe»— no era literalmente cierta.
-- ---------------------------------------------------------------------------
revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate on tables from anon, authenticated;
