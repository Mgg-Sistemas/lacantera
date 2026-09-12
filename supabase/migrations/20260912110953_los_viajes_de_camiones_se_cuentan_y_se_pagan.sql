/*
  LOS VIAJES DE CAMIONES SE CUENTAN Y SE PAGAN.

  Christopher, el 11/09/2026: «aquí sería que alguien coloque el número de
  viajes para un camión o maquinaria en específico para una o varias empresas
  […] llevan esos registros por excel».

  Cada camión que baja de la mina es dos cosas a la vez: la medida del material
  que salió y una factura por pagar. Hoy eso vive en tres hojas de Excel que
  nadie cuadra contra nada.

  ═══════════════════════════════════════════════════════════════════════════
  EL TRAMO ES QUIEN DECIDE EL PRECIO, NO EL CAMIÓN
  ═══════════════════════════════════════════════════════════════════════════

  En la planilla el mismo camión cobra $12 en unos viajes y $8 en otros el
  mismo día, y eso parecía un desorden hasta que él lo explicó: «la diferencia
  es el destino, de exploración a planta fija tiene un valor de 12$, desde
  planta fija a lavado tiene un valor de 8$».

  Así que el precio no es un atributo del vehículo —que era la tentación— sino
  del trayecto. Un camión que hace los dos tramos cobra los dos precios el
  mismo día sin que nadie corrija nada.

  Hay un tercer tramo. La coraza no pasa por ninguna planta: sale de
  exploración ya como producto y se traslada directo a la base. Y no tiene
  tarifa fija, porque «solo se extrae cuando la piden» y el precio se cuadra
  con el pedido. Por eso `tarifas_acarreo` arranca con dos filas y no con tres:
  en MINA_BASE el precio se teclea al registrar. Inventarle una tarifa sería
  escribir un número que nadie acordó.

  ═══════════════════════════════════════════════════════════════════════════
  SE CARGA POR CANTIDAD, SE GUARDA POR VIAJE
  ═══════════════════════════════════════════════════════════════════════════

  La pantalla pide «camión tal, tantos viajes». La base guarda una fila por
  viaje. Las dos cosas no se contradicen y la segunda es la que importa:

    · un viaje se corrige o se anula sin tocar los otros;
    · el total del día es `count(*)`, no una cifra tecleada que puede no
      cuadrar con el detalle;
    · si mañana hay un listero marcando viajes en el patio, la tabla ya tiene
      la forma correcta y no hay que rehacer nada.

  Y la cantidad SUMA, no fija el total. Si un camión ya tiene 3 viajes y
  alguien carga 5, quedan 8. Es la cicatriz del otro proyecto: el listero que
  vuelve a cargar «el total del día» y borra sin querer lo que ya estaba.

  ═══════════════════════════════════════════════════════════════════════════
  LO QUE RODEA AL VIAJE SE COPIA, NO SE ENLAZA
  ═══════════════════════════════════════════════════════════════════════════

  Transportista, chofer, carga y precio se guardan COMO FOTO en la fila del
  viaje. Si mañana el camión cambia de chofer, o los jefes suben la tarifa, el
  viaje de hoy sigue diciendo lo que pasó hoy. Un informe de pago que cambia
  solo cuando alguien edita un catálogo no es un informe de pago.

  ═══════════════════════════════════════════════════════════════════════════
  LO QUE NO SE SABE VA EN BLANCO, NUNCA EN CERO
  ═══════════════════════════════════════════════════════════════════════════

  La carga la estima el supervisor «por paladas del jumbo y en base de las
  características del camión», siempre por debajo del tope. Los datos de los
  camiones todavía no existen: «que aún no los tenemos».

  Así que `carga_m3` admite nulo. Un camión sin carga útil cargada cuenta sus
  viajes y cobra, pero no suma metros cúbicos, y el reporte lo dice. Un cero
  ahí diría que ese camión no movió nada, que es mentira y encima cuadra.

  El tope sí lo comprueba la base: una carga mayor que la capacidad del camión
  es físicamente imposible y no se guarda.

  ═══════════════════════════════════════════════════════════════════════════
  NADA SE BORRA
  ═══════════════════════════════════════════════════════════════════════════

  Un viaje se anula con motivo, y la secuencia del anulado no se reutiliza: si
  el viaje 3 se anuló, el siguiente es el 4. El papel de la planilla tiene esos
  huecos y el sistema tiene que poder explicarlos.

  COMPROBADO antes de escribir esto: `vehiculos` y `frentes_explotacion`
  existen y están vacías, el módulo EXPLOTACION existe, y las cinco acciones
  nuevas no chocan con ninguna de las catorce que ya hay.
*/

-- ---------------------------------------------------------------------------
-- 1. Las tarifas, con historia
--
-- Christopher: «valor que puede cambiar más adelante según los jefes, por eso
-- pido que sea editable en todo caso».
--
-- Editable no puede querer decir que se sobreescriba: si alguien cambia los 12
-- por 15 en octubre, los viajes de septiembre no pueden empezar a valer 15. Por
-- eso cada cambio es una fila nueva con su fecha de vigencia y la anterior no
-- se toca. El viaje copia la tarifa que regía EN SU FECHA, no la de hoy.
-- ---------------------------------------------------------------------------
create table if not exists public.tarifas_acarreo (
  tramo         text not null check (tramo in ('MINA_PLANTA', 'PLANTA_LAVADO', 'MINA_BASE')),
  precio_usd    numeric(12,2) not null check (precio_usd >= 0),
  vigente_desde date not null,
  nota          text,
  fijada_por    uuid references auth.users(id),
  fijada_en     timestamptz not null default now(),
  primary key (tramo, vigente_desde)
);

comment on table public.tarifas_acarreo is
  'Lo que se le paga al transportista por viaje, segun el tramo. Cada cambio es '
  'una fila nueva con su vigencia: la anterior no se toca, para que un viaje '
  'viejo siga valiendo lo que valia cuando se hizo.';

comment on column public.tarifas_acarreo.tramo is
  'MINA_PLANTA de exploracion a la planta fija · PLANTA_LAVADO de la planta '
  'fija a la de lavado · MINA_BASE la coraza, que no pasa por planta y va '
  'directo a la base. Este ultimo no lleva tarifa fija: se cuadra con el pedido.';

alter table public.tarifas_acarreo enable row level security;

-- La tarifa es dinero. Con ella y con el conteo de viajes —que sí ve cualquiera
-- de Explotación— se calcula lo que se le paga a cada empresa, así que taparla
-- a medias no taparía nada. La lee quien puede ver el pago.
--
-- `registrar_acarreos` la lee igual sin la casilla: es SECURITY DEFINER y la
-- RLS no le aplica. Quien carga la planilla no ve el precio, pero el viaje
-- sale con el suyo.
drop policy if exists tarifas_acarreo_lectura on public.tarifas_acarreo;
create policy tarifas_acarreo_lectura on public.tarifas_acarreo
  for select to authenticated
  using (private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES'));

/*
  El SELECT se concede a mano, y solo a `authenticated`.

  Supabase deja un ALTER DEFAULT PRIVILEGES que le da SELECT a `anon` y a
  `authenticated` en cada tabla nueva. Funciona —la RLS deniega igual— pero
  hace que la base local y la de producción no digan lo mismo: en local esta
  tabla nacía sin ningún permiso y las pruebas rebotaban con «permission
  denied». Dicho explícito, las dos bases se parecen y `anon` no entra ni por
  la primera cerradura.
*/
revoke all on public.tarifas_acarreo from anon, authenticated;
grant select on public.tarifas_acarreo to authenticated;

-- Las dos que él dictó. La tercera no: no tiene precio acordado y un número
-- inventado aquí se convertiría en un pago mal hecho.
insert into public.tarifas_acarreo (tramo, precio_usd, vigente_desde, nota)
values
  ('MINA_PLANTA',   12.00, date '2026-09-01', 'La que regia al construir el modulo.'),
  ('PLANTA_LAVADO',  8.00, date '2026-09-01', 'La que regia al construir el modulo.')
on conflict (tramo, vigente_desde) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Los viajes
-- ---------------------------------------------------------------------------
create table if not exists public.acarreos (
  id            bigint generated always as identity primary key,

  fecha         date not null,
  vehiculo_id   bigint not null references public.vehiculos(id),
  tramo         text not null check (tramo in ('MINA_PLANTA', 'PLANTA_LAVADO', 'MINA_BASE')),

  -- El «ID Viaje» del papel: 1, 2, 3… por camión, tramo y día. No se reutiliza
  -- el de un viaje anulado: la planilla tiene esos huecos y hay que poder
  -- explicarlos.
  secuencia     smallint not null check (secuencia > 0),

  -- Opcional a propósito. Solo la primera de una tanda la lleva puesta: repartir
  -- horas inventadas entre diez viajes seria escribir datos que nadie midio.
  hora          time,

  -- De donde salio. Hoy no hay frentes cargados y toda la extraccion sale del
  -- mismo sitio, asi que la pantalla lo esconde hasta que haya mas de uno.
  frente_id     bigint references public.frentes_explotacion(id),

  -- ── LAS FOTOS ───────────────────────────────────────────────────────────
  -- Copiadas al registrar y nunca releidas. Ver la cabecera.
  transportista text not null,
  chofer        text,
  carga_m3      numeric(10,2) check (carga_m3 is null or carga_m3 > 0),
  precio_usd    numeric(12,2) not null check (precio_usd >= 0),

  estado        text not null default 'REGISTRADO'
                check (estado in ('REGISTRADO', 'ANULADO')),
  motivo_anulacion text,
  anulado_por   uuid references auth.users(id),
  anulado_en    timestamptz,

  nota          text,
  registrado_por uuid references auth.users(id),
  registrado_en  timestamptz not null default now(),

  unique (fecha, vehiculo_id, tramo, secuencia)
);

-- Un anulado sin motivo no explica nada, y un motivo en un viaje vivo es ruido.
-- Las dos mitades van juntas o no van.
alter table public.acarreos drop constraint if exists acarreos_anulado_con_motivo;
alter table public.acarreos add constraint acarreos_anulado_con_motivo
  check ((estado = 'ANULADO') = (motivo_anulacion is not null));

comment on table public.acarreos is
  'Un viaje de camion entre dos estaciones de la cantera. Una fila por viaje, '
  'aunque se carguen de diez en diez. Es a la vez la medida del material que '
  'se movio y lo que hay que pagarle al transportista.';

comment on column public.acarreos.carga_m3 is
  'Lo que llevaba ese viaje, estimado por el supervisor. Nulo cuando no se '
  'sabe —el camion no tiene carga util cargada—: el viaje cuenta y cobra, pero '
  'no suma metros cubicos. Un cero diria que no movio nada.';

comment on column public.acarreos.precio_usd is
  'Copiado de la tarifa vigente del tramo en la fecha del viaje. Cambiar la '
  'tarifa manana no cambia lo que ya se debe de hoy.';

create index if not exists acarreos_fecha on public.acarreos (fecha desc, vehiculo_id);
create index if not exists acarreos_vehiculo on public.acarreos (vehiculo_id, fecha desc);
create index if not exists acarreos_pago on public.acarreos (transportista, fecha);

alter table public.acarreos enable row level security;

drop policy if exists acarreos_lectura on public.acarreos;
create policy acarreos_lectura on public.acarreos
  for select to authenticated
  using (private.tiene_permiso('EXPLOTACION', 'LECTURA'));

revoke all on public.acarreos from anon, authenticated;
grant select on public.acarreos to authenticated;

-- Regla de la casa: toda tabla nueva lleva sus dos disparadores.
drop trigger if exists trg_auditar on public.acarreos;
create trigger trg_auditar after insert or update or delete on public.acarreos
  for each row execute function private.auditar('id');

drop trigger if exists trg_normalizar on public.acarreos;
create trigger trg_normalizar before insert or update on public.acarreos
  for each row execute function private.normalizar_texto(
    'transportista', 'chofer', 'nota', 'motivo_anulacion');

drop trigger if exists trg_auditar on public.tarifas_acarreo;
create trigger trg_auditar after insert or update or delete on public.tarifas_acarreo
  for each row execute function private.auditar('tramo', 'vigente_desde');

drop trigger if exists trg_normalizar on public.tarifas_acarreo;
create trigger trg_normalizar before insert or update on public.tarifas_acarreo
  for each row execute function private.normalizar_texto('nota');

/*
  El registro tiene que saber de qué módulo habla, o «todos los cambios de
  Explotación» no encuentra estas dos.

  Va dentro de una comprobación porque este repositorio vive contra tres bases
  de distinta edad: producción, la réplica de pruebas —del 2 de septiembre— y
  la local. `auditoria_modulos` nació el 7 de septiembre, así que en la réplica
  todavía no está, y un INSERT a secas dejaría la migración sin aplicar entera
  por una línea que no es el corazón de nada.

  En producción la tabla existe y la fila entra. Donde no exista, lo dice y
  sigue: la auditoría anotará igual los cambios, solo que sin la etiqueta del
  módulo hasta que esa base se ponga al día.
*/
do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    raise notice 'auditoria_modulos todavia no existe en esta base: el mapa de modulo se salta.';
    return;
  end if;

  insert into public.auditoria_modulos (tabla, modulo)
  values ('acarreos', 'EXPLOTACION'), ('tarifas_acarreo', 'EXPLOTACION')
  on conflict (tabla) do update set modulo = excluded.modulo;
end
$mapa$;

-- ---------------------------------------------------------------------------
-- 3. La carga útil del camión
--
-- `capacidad_m3` ya existe y es el TOPE —lo que cabe—. Esto otro es lo que
-- SUELE llevar, que según él siempre va por debajo. Son dos números distintos
-- y confundirlos infla el material extraído en un 20 %.
--
-- Va en columna nueva y con función propia para NO tocar la firma de
-- `guardar_vehiculo`: cambiar la lista de argumentos de una función existente
-- obliga a borrarla y reponer sus permisos, y es donde este repositorio ya se
-- ha equivocado antes.
-- ---------------------------------------------------------------------------
alter table public.vehiculos
  add column if not exists carga_util_m3 numeric(10,2);

alter table public.vehiculos drop constraint if exists vehiculos_carga_util_cabe;
alter table public.vehiculos add constraint vehiculos_carga_util_cabe
  check (carga_util_m3 is null or (carga_util_m3 > 0 and carga_util_m3 <= capacidad_m3));

comment on column public.vehiculos.carga_util_m3 is
  'Lo que suele llevar, que no es lo que cabe. El supervisor estima la carga '
  'por paladas y siempre queda por debajo de `capacidad_m3`. Nula mientras '
  'nadie la haya medido: sin ella los viajes se cuentan y se pagan, pero no '
  'suman metros cubicos.';

/*
  Y Explotación pasa a poder LEER la flota.

  Esto no es un adorno: sin ello el módulo entero miente. `vehiculos` solo la
  leían Despachos, Ventas y Maquinaria. Como las vistas de viajes son
  `security_invoker` y unen `vehiculos` por dentro, un usuario con Explotación
  y nada más recibía CERO FILAS de la pantalla de viajes — no un error, una
  lista vacía. Salió corriendo las pruebas, no leyendo.

  Es el mismo fallo que ya costó el nombre de quien recibe en el vale de
  combustible, y el que documenta `historial_articulo`: «una vista sin permiso
  devuelve cero filas, que la pantalla pinta como no ha pasado nada, una
  mentira peor que un error».

  Se arregla en la reja y no en la vista, porque el permiso que falta es real:
  quien anota que el camión PRB-001 bajó ocho veces necesita saber qué camión
  es PRB-001. Sigue siendo solo LECTURA: la flota se da de alta en Despachos.
*/
drop policy if exists vehiculos_lectura on public.vehiculos;
create policy vehiculos_lectura on public.vehiculos
  for select to authenticated
  using (
    private.tiene_permiso('DESPACHOS', 'LECTURA')
    or private.tiene_permiso('VENTAS', 'LECTURA')
    or private.tiene_permiso('MAQUINARIA', 'LECTURA')
    or private.tiene_permiso('EXPLOTACION', 'LECTURA')
  );

-- ---------------------------------------------------------------------------
-- 4. Las cinco casillas
-- ---------------------------------------------------------------------------
insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente)
values
  ('EXPLOTACION.REGISTRAR_VIAJES', 'EXPLOTACION',
   'Cargar los viajes del dia',
   'Anota cuantos viajes hizo cada camion y a que tramo, y corrige la hora, la '
   'carga o el precio de uno suelto. La cantidad suma a lo que ya tenga el '
   'camion ese dia: no reemplaza el total. La trae cualquiera con Escritura en '
   'Explotacion.',
   70, 'ESCRITURA'),

  ('EXPLOTACION.ANULAR_VIAJE', 'EXPLOTACION',
   'Anular un viaje',
   'Deja un viaje sin efecto, con motivo y con quien lo anulo. No lo borra y no '
   'libera su numero: la planilla queda con el hueco a la vista, que es lo que '
   'permite explicarlo despues.',
   80, 'TOTAL'),

  ('EXPLOTACION.VER_PAGO_VIAJES', 'EXPLOTACION',
   'Ver cuanto se le paga a cada transportista',
   'Sin esta casilla la pantalla de viajes ensena camiones, viajes y metros '
   'cubicos, pero los precios y los montos llegan en blanco. No la concede '
   'ningun nivel de modulo: hay que darla a mano o por permiso extendido, '
   'igual que la de ver los montos de venta.',
   90, null),

  ('EXPLOTACION.FIJAR_TARIFAS', 'EXPLOTACION',
   'Cambiar lo que se paga por viaje',
   'Pone una tarifa nueva para un tramo a partir de una fecha. La anterior se '
   'queda guardada y los viajes ya registrados no cambian de precio.',
   100, 'TOTAL'),

  ('DESPACHOS.FIJAR_CARGA_UTIL', 'DESPACHOS',
   'Poner la carga util de un camion',
   'Cuantos metros cubicos suele llevar ese camion, que no es lo mismo que '
   'cuanto le cabe. Es el numero con el que se calcula el material que baja de '
   'la mina.',
   90, 'ESCRITURA')

on conflict (codigo) do update
  set modulo = excluded.modulo,
      nombre = excluded.nombre,
      dice = excluded.dice,
      orden = excluded.orden,
      nivel_equivalente = excluded.nivel_equivalente;

-- ---------------------------------------------------------------------------
-- 5. Las puertas
--
-- Ninguna tabla de esta migración admite escritura desde el navegador. Todo lo
-- que escribe pasa por aquí, y lo primero que hace cada una es preguntar si
-- quien llama tiene la casilla.
-- ---------------------------------------------------------------------------

create or replace function public.fijar_tarifa_acarreo(
  p_tramo   text,
  p_precio  numeric,
  p_desde   date default null,
  p_nota    text default null
) returns void
language plpgsql security definer set search_path to ''
as $$
declare
  v_tramo text := upper(btrim(coalesce(p_tramo, '')));
  v_desde date := coalesce(p_desde, current_date);
begin
  perform private.exigir_accion('EXPLOTACION.FIJAR_TARIFAS');

  if v_tramo not in ('MINA_PLANTA', 'PLANTA_LAVADO', 'MINA_BASE') then
    raise exception 'Ese tramo no existe: %.', p_tramo
      using errcode = '22023',
            hint = 'Los tramos son MINA_PLANTA, PLANTA_LAVADO y MINA_BASE.';
  end if;

  if p_precio is null or p_precio < 0 then
    raise exception 'El precio del viaje no puede ir en blanco ni en negativo.'
      using errcode = '22023';
  end if;

  /* Se reemplaza si ya hay una tarifa que arranca ese mismo día —es corregir
     lo que se acaba de teclear— y se añade si es un día distinto. Lo que nunca
     se toca es una vigencia anterior: ahí viven los precios con los que ya se
     pagó. */
  insert into public.tarifas_acarreo (tramo, precio_usd, vigente_desde, nota, fijada_por)
  values (v_tramo, p_precio, v_desde, nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  on conflict (tramo, vigente_desde) do update
    set precio_usd = excluded.precio_usd,
        nota       = excluded.nota,
        fijada_por = excluded.fijada_por,
        fijada_en  = now();
end;
$$;

comment on function public.fijar_tarifa_acarreo(text, numeric, date, text) is
  'Pone la tarifa de un tramo a partir de una fecha. No reescribe las '
  'vigencias anteriores: los viajes ya registrados llevan su precio copiado.';


create or replace function public.fijar_carga_util(
  p_vehiculo_id bigint,
  p_carga_util  numeric
) returns void
language plpgsql security definer set search_path to ''
as $$
declare v_capacidad numeric;
begin
  perform private.exigir_accion('DESPACHOS.FIJAR_CARGA_UTIL');

  select v.capacidad_m3 into v_capacidad
    from public.vehiculos v where v.id = p_vehiculo_id;

  if v_capacidad is null then
    raise exception 'Ese vehiculo no existe.' using errcode = 'P0002';
  end if;

  -- Nulo es una respuesta válida: «todavía no lo hemos medido». El CHECK de la
  -- tabla para lo imposible; esto para decirlo con palabras.
  if p_carga_util is not null and p_carga_util > v_capacidad then
    raise exception 'Ese camion no carga %, le caben %.', p_carga_util, v_capacidad
      using errcode = '22023',
            hint = 'La carga util es lo que suele llevar, siempre por debajo de lo que le cabe.';
  end if;

  if p_carga_util is not null and p_carga_util <= 0 then
    raise exception 'La carga util tiene que ser mayor que cero, o quedar en blanco.'
      using errcode = '22023';
  end if;

  update public.vehiculos set carga_util_m3 = p_carga_util where id = p_vehiculo_id;
end;
$$;

comment on function public.fijar_carga_util(bigint, numeric) is
  'Cuantos metros cubicos suele llevar ese camion. Va aparte de guardar_vehiculo '
  'para no cambiarle la firma a una funcion viva.';


/*
  REGISTRAR LOS VIAJES DE UN CAMIÓN EN UN DÍA.

  Recibe una cantidad y crea esa cantidad de filas. La cantidad SUMA a lo que
  el camión ya tenga en ese tramo y ese día: si tenía 3 y se cargan 5, quedan 8.
  Nunca reemplaza el total.

  Devuelve cuántos viajes creó, para que la pantalla pueda decir «quedan 8» en
  vez de «listo».
*/
create or replace function public.registrar_acarreos(
  p_fecha       date,
  p_vehiculo_id bigint,
  p_tramo       text,
  p_cantidad    integer default 1,
  p_hora        time default null,
  p_carga_m3    numeric default null,
  p_precio_usd  numeric default null,
  p_frente_id   bigint default null,
  p_nota        text default null
) returns integer
language plpgsql security definer set search_path to ''
as $$
declare
  v_tramo   text := upper(btrim(coalesce(p_tramo, '')));
  v_veh     record;
  v_chofer  text;
  v_precio  numeric;
  v_carga   numeric;
  v_desde   smallint;
  v_transp  text;
  i         integer;
begin
  perform private.exigir_accion('EXPLOTACION.REGISTRAR_VIAJES');

  if p_fecha is null or p_fecha > current_date then
    raise exception 'La fecha del viaje no puede ir en blanco ni ser del futuro.'
      using errcode = '22023';
  end if;

  if v_tramo not in ('MINA_PLANTA', 'PLANTA_LAVADO', 'MINA_BASE') then
    raise exception 'Ese tramo no existe: %.', p_tramo
      using errcode = '22023',
            hint = 'Los tramos son MINA_PLANTA, PLANTA_LAVADO y MINA_BASE.';
  end if;

  /* El tope no es por desconfianza: un 1 que se teclea dos veces son 11 viajes
     que después hay que anular de uno en uno. */
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 60 then
    raise exception 'La cantidad de viajes tiene que estar entre 1 y 60. Llego %.', p_cantidad
      using errcode = '22023';
  end if;

  select v.id, v.placa, v.activo, v.transportista, v.capacidad_m3, v.carga_util_m3
    into v_veh
    from public.vehiculos v where v.id = p_vehiculo_id;

  if v_veh.id is null then
    raise exception 'Ese vehiculo no existe.' using errcode = 'P0002';
  end if;

  if not v_veh.activo then
    raise exception 'El camion % esta dado de baja.', v_veh.placa
      using errcode = '55000',
            hint = 'Si volvio a la flota, reactivalo en Vehiculos antes de cargarle viajes.';
  end if;

  -- El precio. Lo tecleado manda sobre la tarifa: es el caso de la coraza, que
  -- se cuadra con el pedido, y el de un viaje suelto que se acordó distinto.
  if p_precio_usd is not null then
    if p_precio_usd < 0 then
      raise exception 'El precio del viaje no puede ser negativo.' using errcode = '22023';
    end if;
    v_precio := p_precio_usd;
  else
    select t.precio_usd into v_precio
      from public.tarifas_acarreo t
     where t.tramo = v_tramo and t.vigente_desde <= p_fecha
     order by t.vigente_desde desc
     limit 1;
  end if;

  if v_precio is null then
    raise exception 'Ese tramo no tiene tarifa para el %.', p_fecha
      using errcode = '55000',
            hint = 'La coraza se cuadra con el pedido: hay que decir cuanto se paga este viaje.';
  end if;

  -- La carga puede quedar en blanco y eso es correcto. Ver la cabecera.
  v_carga := coalesce(p_carga_m3, v_veh.carga_util_m3);

  if v_carga is not null and v_carga <= 0 then
    raise exception 'La carga tiene que ser mayor que cero, o quedar en blanco.'
      using errcode = '22023';
  end if;

  if v_carga is not null and v_carga > v_veh.capacidad_m3 then
    raise exception 'El camion % no carga %, le caben %.',
      v_veh.placa, v_carga, v_veh.capacidad_m3
      using errcode = '22023';
  end if;

  -- Las fotos. Quién manejaba ESE día, no quién maneja hoy.
  select ch.chofer into v_chofer
    from public.v_vehiculo_choferes ch
   where ch.vehiculo_id = p_vehiculo_id
     and ch.desde <= p_fecha
     and (ch.hasta is null or ch.hasta >= p_fecha)
   order by ch.desde desc
   limit 1;

  -- Un camión de la casa también cobra —lo dijo él—, así que necesita una
  -- etiqueta con la que agruparlo en el informe de pago.
  v_transp := coalesce(nullif(btrim(coalesce(v_veh.transportista, '')), ''), 'FLOTA PROPIA');

  if p_frente_id is not null
     and not exists (select 1 from public.frentes_explotacion f where f.id = p_frente_id) then
    raise exception 'Ese frente no existe.' using errcode = 'P0002';
  end if;

  -- Se sigue desde el último número usado, incluidos los anulados: su hueco se
  -- queda a la vista.
  select coalesce(max(a.secuencia), 0) into v_desde
    from public.acarreos a
   where a.fecha = p_fecha and a.vehiculo_id = p_vehiculo_id and a.tramo = v_tramo;

  for i in 1..p_cantidad loop
    insert into public.acarreos
      (fecha, vehiculo_id, tramo, secuencia, hora, frente_id,
       transportista, chofer, carga_m3, precio_usd, nota, registrado_por)
    values
      (p_fecha, p_vehiculo_id, v_tramo, v_desde + i,
       -- Solo el primero lleva hora: repartir horas inventadas entre diez
       -- viajes sería escribir datos que nadie midió.
       case when i = 1 then p_hora end,
       p_frente_id, v_transp, v_chofer, v_carga, v_precio,
       nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()));
  end loop;

  return p_cantidad;
end;
$$;

comment on function public.registrar_acarreos(date, bigint, text, integer, time, numeric, numeric, bigint, text) is
  'Crea N viajes de un camion en un dia y un tramo. La cantidad SUMA a lo que '
  'ya tenga: no reemplaza el total. Copia chofer, transportista, carga y precio '
  'como foto.';


create or replace function public.corregir_acarreo(
  p_id         bigint,
  p_hora       time default null,
  p_carga_m3   numeric default null,
  p_precio_usd numeric default null,
  p_nota       text default null
) returns void
language plpgsql security definer set search_path to ''
as $$
declare v_a record; v_cap numeric;
begin
  perform private.exigir_accion('EXPLOTACION.REGISTRAR_VIAJES');

  select a.id, a.estado, a.vehiculo_id into v_a
    from public.acarreos a where a.id = p_id;

  if v_a.id is null then
    raise exception 'Ese viaje no existe.' using errcode = 'P0002';
  end if;

  if v_a.estado = 'ANULADO' then
    raise exception 'Ese viaje esta anulado: lo anulado no se corrige.'
      using errcode = '55000',
            hint = 'Si hizo falta, registra el viaje de nuevo.';
  end if;

  if p_carga_m3 is not null then
    select v.capacidad_m3 into v_cap from public.vehiculos v where v.id = v_a.vehiculo_id;
    if p_carga_m3 <= 0 then
      raise exception 'La carga tiene que ser mayor que cero.' using errcode = '22023';
    end if;
    if p_carga_m3 > v_cap then
      raise exception 'Ese camion no carga %, le caben %.', p_carga_m3, v_cap
        using errcode = '22023';
    end if;
  end if;

  if p_precio_usd is not null and p_precio_usd < 0 then
    raise exception 'El precio del viaje no puede ser negativo.' using errcode = '22023';
  end if;

  /* `coalesce` en cada campo: no mandar un valor significa «déjalo como está»,
     no «bórralo». La pantalla del detalle manda los cuatro, así que lo que el
     usuario no toca viaja con su valor actual. */
  update public.acarreos
     set hora       = coalesce(p_hora, hora),
         carga_m3   = coalesce(p_carga_m3, carga_m3),
         precio_usd = coalesce(p_precio_usd, precio_usd),
         nota       = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), nota)
   where id = p_id;
end;
$$;

comment on function public.corregir_acarreo(bigint, time, numeric, numeric, text) is
  'Arregla la hora, la carga, el precio o la nota de un viaje vivo. Lo que no '
  'se manda se queda como esta.';


create or replace function public.anular_acarreo(
  p_id     bigint,
  p_motivo text
) returns void
language plpgsql security definer set search_path to ''
as $$
declare v_estado text;
begin
  perform private.exigir_accion('EXPLOTACION.ANULAR_VIAJE');

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Hay que decir por que se anula.'
      using errcode = '22023',
            hint = 'Queda en el registro con tu nombre y la hora.';
  end if;

  select a.estado into v_estado from public.acarreos a where a.id = p_id;

  if v_estado is null then
    raise exception 'Ese viaje no existe.' using errcode = 'P0002';
  end if;

  if v_estado = 'ANULADO' then
    raise exception 'Ese viaje ya estaba anulado.' using errcode = '55000';
  end if;

  update public.acarreos
     set estado           = 'ANULADO',
         motivo_anulacion = btrim(p_motivo),
         anulado_por      = (select auth.uid()),
         anulado_en       = now()
   where id = p_id;
end;
$$;

comment on function public.anular_acarreo(bigint, text) is
  'Deja un viaje sin efecto, con motivo y autor. No lo borra y no libera su '
  'numero: el hueco de la planilla se queda a la vista.';

-- ---------------------------------------------------------------------------
-- Las llaves de las puertas. El navegador puede llamarlas; nadie más.
-- ---------------------------------------------------------------------------
revoke execute on function public.fijar_tarifa_acarreo(text, numeric, date, text) from public, anon;
grant  execute on function public.fijar_tarifa_acarreo(text, numeric, date, text) to authenticated;

revoke execute on function public.fijar_carga_util(bigint, numeric) from public, anon;
grant  execute on function public.fijar_carga_util(bigint, numeric) to authenticated;

revoke execute on function public.registrar_acarreos(date, bigint, text, integer, time, numeric, numeric, bigint, text) from public, anon;
grant  execute on function public.registrar_acarreos(date, bigint, text, integer, time, numeric, numeric, bigint, text) to authenticated;

revoke execute on function public.corregir_acarreo(bigint, time, numeric, numeric, text) from public, anon;
grant  execute on function public.corregir_acarreo(bigint, time, numeric, numeric, text) to authenticated;

revoke execute on function public.anular_acarreo(bigint, text) from public, anon;
grant  execute on function public.anular_acarreo(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Las lentes
--
-- EL DINERO SE TAPA EN LA VISTA, NO EN LA PANTALLA.
--
-- Es el mismo patrón que cerramos en Ventas la semana pasada: la columna del
-- precio llega NULA a quien no tiene `EXPLOTACION.VER_PAGO_VIAJES`, y llega
-- nula desde la base. Esconderla en el navegador no esconde nada — el dato ya
-- viajó y cualquiera lo ve en la pestaña de red.
--
-- El `(select …)` alrededor de la reja no es decorativo: convierte la llamada
-- en un InitPlan que Postgres evalúa UNA vez por consulta en vez de una por
-- fila.
--
-- Lo que NO se tapa son los viajes ni los metros cúbicos. Quien carga la
-- planilla tiene que ver lo que carga; lo que no tiene por qué ver es cuánto
-- se le debe a cada empresa.
-- ---------------------------------------------------------------------------

create or replace view public.v_acarreos
with (security_invoker = on) as
select
  a.id,
  a.fecha,
  a.vehiculo_id,
  v.placa,
  v.descripcion   as vehiculo,
  v.tipo,
  v.capacidad_m3,
  v.carga_util_m3,
  a.tramo,
  case a.tramo
    when 'MINA_PLANTA'   then 'Mina a planta fija'
    when 'PLANTA_LAVADO' then 'Planta fija a lavado'
    when 'MINA_BASE'     then 'Mina a base'
  end             as tramo_dice,
  a.secuencia,
  a.hora,
  a.transportista,
  a.chofer,
  a.carga_m3,
  case when (select private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES'))
       then a.precio_usd end::numeric(12,2) as precio_usd,
  a.frente_id,
  f.nombre        as frente,
  a.estado,
  a.motivo_anulacion,
  a.nota,
  a.registrado_en,
  p.nombre        as registrado_por_nombre
from public.acarreos a
join public.vehiculos v on v.id = a.vehiculo_id
left join public.frentes_explotacion f on f.id = a.frente_id
left join public.perfiles p on p.id = a.registrado_por;

comment on view public.v_acarreos is
  'Un viaje por fila, con su camion y su chofer. El precio llega nulo sin la '
  'casilla EXPLOTACION.VER_PAGO_VIAJES.';


/*
  EL DÍA, QUE ES LO QUE LA PANTALLA PINTA.

  Una fila por camión y tramo. Los anulados se cuentan aparte y no suman: el
  total del día tiene que ser lo que se va a pagar, no lo que se tecleó.

  `sin_carga` es la que evita el reporte que parece completo y no lo está. Si
  dos camiones no tienen carga útil, sus viajes cuentan y cobran pero no suman
  metros cúbicos, y la pantalla puede decirlo en vez de enseñar un total corto
  sin explicación.
*/
create or replace view public.v_acarreos_dia
with (security_invoker = on) as
select
  a.fecha,
  a.vehiculo_id,
  v.placa,
  v.descripcion as vehiculo,
  a.transportista,
  a.tramo,
  count(*) filter (where a.estado = 'REGISTRADO')::integer as viajes,
  count(*) filter (where a.estado = 'ANULADO')::integer    as anulados,
  sum(a.carga_m3) filter (where a.estado = 'REGISTRADO')   as m3,
  count(*) filter (where a.estado = 'REGISTRADO' and a.carga_m3 is null)::integer as sin_carga,
  case when (select private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES'))
       then sum(a.precio_usd) filter (where a.estado = 'REGISTRADO')
  end::numeric(14,2) as monto_usd,
  -- Todos los viajes del día llevan el mismo chofer copiado, salvo que se haya
  -- traspasado el camión a media jornada. `max` devuelve uno cualquiera y la
  -- ficha del detalle enseña los dos si los hubo.
  max(a.chofer) as chofer
from public.acarreos a
join public.vehiculos v on v.id = a.vehiculo_id
group by a.fecha, a.vehiculo_id, v.placa, v.descripcion, a.transportista, a.tramo;

comment on view public.v_acarreos_dia is
  'Lo que hizo cada camion en un dia y un tramo: viajes, metros cubicos y lo '
  'que se le debe. Los anulados no suman.';


/*
  EL REGISTRO DIARIO DE PAGO, QUE ES LA PRIMERA CAPTURA DEL EXCEL.

  Empresa por día, con el acumulado del mes al lado. El acumulado sale de una
  ventana SQL y no de una suma en pantalla: así el PDF y la pantalla no pueden
  decir cifras distintas, que es como empiezan las discusiones de quincena.
*/
create or replace view public.v_acarreo_pago_mensual
with (security_invoker = on) as
select
  date_trunc('month', a.fecha)::date as mes,
  a.transportista,
  a.fecha,
  count(*)::integer as viajes,
  sum(a.carga_m3)   as m3,
  case when (select private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES'))
       then sum(a.precio_usd)
  end::numeric(14,2) as monto_usd,
  case when (select private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES'))
       then sum(sum(a.precio_usd)) over (
              partition by a.transportista, date_trunc('month', a.fecha)
              order by a.fecha)
  end::numeric(14,2) as acumulado_usd
from public.acarreos a
where a.estado = 'REGISTRADO'
group by date_trunc('month', a.fecha), a.transportista, a.fecha;

comment on view public.v_acarreo_pago_mensual is
  'Lo que se le debe a cada transportista por dia, con el acumulado del mes. '
  'Es la matriz del Excel, calculada en la base.';


/* La tarifa que rige hoy en cada tramo. La coraza no sale: no tiene. */
create or replace view public.v_tarifas_acarreo
with (security_invoker = on) as
select distinct on (t.tramo)
  t.tramo,
  case t.tramo
    when 'MINA_PLANTA'   then 'Mina a planta fija'
    when 'PLANTA_LAVADO' then 'Planta fija a lavado'
    when 'MINA_BASE'     then 'Mina a base'
  end as tramo_dice,
  t.precio_usd,
  t.vigente_desde,
  t.nota,
  t.fijada_en,
  p.nombre as fijada_por_nombre
from public.tarifas_acarreo t
left join public.perfiles p on p.id = t.fijada_por
where t.vigente_desde <= current_date
order by t.tramo, t.vigente_desde desc;

comment on view public.v_tarifas_acarreo is
  'La tarifa vigente hoy en cada tramo. Solo la ve quien puede ver el dinero '
  'de los viajes: con la tarifa y el conteo se calcula el pago.';

grant select on public.v_acarreos            to authenticated;
grant select on public.v_acarreos_dia        to authenticated;
grant select on public.v_acarreo_pago_mensual to authenticated;
grant select on public.v_tarifas_acarreo     to authenticated;

revoke all on public.v_acarreos             from anon;
revoke all on public.v_acarreos_dia         from anon;
revoke all on public.v_acarreo_pago_mensual from anon;
revoke all on public.v_tarifas_acarreo      from anon;
