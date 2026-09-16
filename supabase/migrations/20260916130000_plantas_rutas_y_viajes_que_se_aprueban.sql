/*
  PLANTAS, RUTAS Y VIAJES QUE SE APRUEBAN

  Christopher, 16/09/2026, después de contar cómo trabaja la cantera —la mina,
  la planta fija, la planta primaria y lo que sale de cada una—:

    «¿Qué pasa si mañana cierra o abre una nueva planta y que ésta ofrezca
    iguales o nuevos procesos? (ej. que la gobernación o cualquier posible
    aliado ceda o transfiera o desee incluirse en el proceso)».

  Hasta hoy «planta» no existía en la base: era el nombre de un patio y tres
  valores escritos a fuego en un CHECK (`MINA_PLANTA`, `PLANTA_LAVADO`,
  `MINA_BASE`). Abrir una planta era una migración; cederla, imposible de decir.
  Eligió el modelo configurable y con historia. Esta es la fase 1 (el
  diagnóstico entero está en docs/explotacion-mina-plantas-y-procesos.md).

  LO QUE CAMBIA

    sitios_operacion ... mina, planta, patio o base: con su patio de inventario,
                         su responsable, y abierto o cerrado con fecha.
    sitio_operadores ... quién lo opera y desde cuándo (La Cantera, la
                         Gobernación, un aliado). Ceder es cerrar una fila y
                         abrir otra: la historia no se pisa.
    rutas_acarreo ...... de un sitio a otro. Puede haber varias entre los mismos
                         dos sitios.
    ruta_tarifas ....... precio, o rango de precios, con fecha desde la que rige.

  LAS TARIFAS Y LOS 208 VIAJES DE ANTES NO SE TOCAN

  Christopher: «No deseo ajustar las tarifas existentes, deseo que las tengas
  presentes en el esquema o contexto, pues esto simboliza que, para una nueva
  planta o proceso, puede llegar a existir 1 o más viajes con 1 o más tarifas
  involucradas».

  Así que ninguna fila de `acarreos` ni de `tarifas_acarreo` se reescribe. Cada
  tramo viejo tiene su ruta equivalente —`tramo_anterior`— y las vistas la
  buscan al leer. Las dos tarifas que regían se COPIAN a su ruta con la misma
  fecha, y `tarifas_acarreo` se queda como registro de lo que había. Un viaje
  nuevo por una ruta equivalente sigue guardando su tramo, y con eso la
  numeración, el centro de costo y el reporte diario siguen cuadrando con los
  viajes de antes.

  Qué planta es cuál, lo pone esta migración con lo que se sabía, y queda
  escrito como supuesto: el tramo «planta fija a lavado» llega a la planta
  PRIMARIA, porque su patio es el de lavado y los dos talleres que existen son
  el de la fija y el de la primaria. Si no es así, se corrige la ficha.

  CADA VIAJE NUEVO SE APRUEBA

  Christopher: «este proceso o fases, por solicitud de la líder, debe de ser
  aprobado por lo mínimo por un analista o responsable».

  Un viaje nace POR_APROBAR y no cuenta para el pago hasta que lo aprueba el
  responsable del sitio de origen o de destino, o quien tenga la casilla
  EXPLOTACION.APROBAR_VIAJES (que se le da al rol que hagan de analista; hoy no
  existe ninguno con ese nombre). Rechazar pide motivo. Los viajes de antes no
  pasaron por aquí: se quedan REGISTRADO, que desde hoy quiere decir «anterior a
  la aprobación», y siguen contando como contaban.

  Y EL VIAJE DICE CÓMO VOLVIÓ

  «En cada viaje se debe obtener material, aunque debemos evaluar la posibilidad
  de que en algún viaje o alguna ocasión algún vehículo pueda volver sin carga o
  sin carga completa». `carga` es COMPLETA, PARCIAL (con sus m³) o VACIO (sin
  m³). Cómo se paga uno vacío o parcial todavía no está decidido, así que el
  precio sigue siendo el de la ruta, y quien aprueba lo ve.

  Un viaje puede hacerlo un camión de tercero o una máquina propia (un
  payloader, un articulado). Lo que rodea a la máquina se copia en el viaje
  (`equipo_codigo`, `equipo_nombre`), igual que ya se copiaban transportista y
  chofer: quien carga viajes no tiene por qué tener el módulo de Maquinaria para
  que la fila se lea.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- Casillas
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente) values
  ('EXPLOTACION.APROBAR_VIAJES', 'EXPLOTACION', 'Aprobar o rechazar viajes',
   'Un viaje nuevo no cuenta para el pago hasta que lo aprueba el responsable de la mina o planta de origen o de destino, o alguien con esta casilla. Rechazar pide motivo. Pensada para el rol que haga de analista.',
   75, 'TOTAL'),
  ('EXPLOTACION.GESTIONAR_SITIOS', 'EXPLOTACION', 'Abrir, cerrar y ceder plantas',
   'Da de alta una mina, planta, patio o base, la cierra o la reabre, y cambia quién la opera (la empresa, la gobernación o un aliado) desde una fecha. La historia se conserva.',
   110, 'TOTAL')
on conflict (codigo) do nothing;

update public.acciones
   set dice = 'Anota cuántos viajes hizo cada camión o máquina por una ruta, cómo volvió (completo, parcial o vacío), y corrige la hora, la carga o el precio de uno que todavía no esté aprobado. La cantidad suma a lo que ya tenga ese día: no reemplaza el total.'
 where codigo = 'EXPLOTACION.REGISTRAR_VIAJES';

update public.acciones
   set nombre = 'Crear rutas y cambiar lo que se paga por viaje',
       dice = 'Crea o corrige una ruta entre dos sitios y le pone tarifa —o rango de tarifa— a partir de una fecha. La anterior se queda guardada y los viajes ya registrados no cambian de precio.'
 where codigo = 'EXPLOTACION.FIJAR_TARIFAS';

-- ═══════════════════════════════════════════════════════════════════════════
-- Sitios y quién los opera
-- ═══════════════════════════════════════════════════════════════════════════

create table public.sitios_operacion (
  id             bigint generated always as identity primary key,
  codigo         text not null unique,
  nombre         text not null,
  tipo           text not null check (tipo in ('MINA', 'PLANTA', 'PATIO', 'BASE', 'OTRO')),
  almacen_id     bigint references public.almacenes(id) on delete set null,
  responsable_id bigint references public.empleados(id) on delete set null,
  estado         text not null default 'ACTIVO' check (estado in ('ACTIVO', 'CERRADO')),
  abierto_desde  date,
  cerrado_en     date,
  motivo_cierre  text,
  nota           text,
  creado_por     uuid references auth.users(id) default auth.uid(),
  creado_en      timestamptz not null default now(),
  constraint sitio_cerrado_con_fecha_y_motivo
    check ((estado = 'CERRADO') = (cerrado_en is not null and motivo_cierre is not null))
);

comment on table public.sitios_operacion is
  'Mina, planta, patio o base. Se abre, se cierra y se cede con fecha: nada de esto es un valor fijo en la base.';

create table public.sitio_operadores (
  id             bigint generated always as identity primary key,
  sitio_id       bigint not null references public.sitios_operacion(id) on delete cascade,
  propietario    text not null references public.propietarios(codigo),
  desde          date not null,
  hasta          date,
  motivo         text,
  registrado_por uuid references auth.users(id) default auth.uid(),
  registrado_en  timestamptz not null default now(),
  constraint operador_fechas_en_orden check (hasta is null or hasta >= desde)
);

create unique index sitio_operador_vigente on public.sitio_operadores (sitio_id) where hasta is null;

comment on table public.sitio_operadores is
  'Quién opera cada sitio y desde cuándo. Ceder o transferir es cerrar la fila vigente y abrir otra; nunca se edita la anterior.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Rutas y tarifas
-- ═══════════════════════════════════════════════════════════════════════════

create table public.rutas_acarreo (
  id             bigint generated always as identity primary key,
  nombre         text not null,
  origen_id      bigint not null references public.sitios_operacion(id),
  destino_id     bigint not null references public.sitios_operacion(id),
  precio_libre   boolean not null default false,
  tramo_anterior text unique check (tramo_anterior is null or tramo_anterior in ('MINA_PLANTA', 'PLANTA_LAVADO', 'MINA_BASE')),
  activa         boolean not null default true,
  nota           text,
  creada_por     uuid references auth.users(id) default auth.uid(),
  creada_en      timestamptz not null default now(),
  constraint ruta_entre_dos_sitios_distintos check (origen_id <> destino_id),
  constraint ruta_nombre_unico unique (origen_id, destino_id, nombre)
);

comment on column public.rutas_acarreo.tramo_anterior is
  'El tramo fijo que esta ruta sustituye. Los viajes de antes no tienen ruta: las vistas la encuentran por aquí.';
comment on column public.rutas_acarreo.precio_libre is
  'Sin tarifa: el precio se teclea en cada viaje (la coraza, que se cuadra con el pedido).';

create table public.ruta_tarifas (
  id               bigint generated always as identity primary key,
  ruta_id          bigint not null references public.rutas_acarreo(id) on delete cascade,
  precio_usd       numeric(12,2) not null check (precio_usd >= 0),
  precio_hasta_usd numeric(12,2),
  vigente_desde    date not null,
  nota             text,
  fijada_por       uuid references auth.users(id) default auth.uid(),
  fijada_en        timestamptz not null default now(),
  constraint tarifa_rango_en_orden check (precio_hasta_usd is null or precio_hasta_usd > precio_usd),
  constraint tarifa_una_por_fecha unique (ruta_id, vigente_desde)
);

comment on column public.ruta_tarifas.precio_hasta_usd is
  'Si la tarifa es un rango («de 12 a 12,5 $»), su tope. Entonces cada viaje dice cuánto se paga dentro del rango.';

-- Disparadores, lectura y el resto de la casa.
create trigger trg_auditar after insert or delete or update on public.sitios_operacion
  for each row execute function private.auditar('id');
create trigger trg_normalizar before insert or update on public.sitios_operacion
  for each row execute function private.normalizar_texto('codigo', 'nombre', 'motivo_cierre', 'nota');
create trigger trg_auditar after insert or delete or update on public.sitio_operadores
  for each row execute function private.auditar('id');
create trigger trg_normalizar before insert or update on public.sitio_operadores
  for each row execute function private.normalizar_texto('motivo');
create trigger trg_auditar after insert or delete or update on public.rutas_acarreo
  for each row execute function private.auditar('id');
create trigger trg_normalizar before insert or update on public.rutas_acarreo
  for each row execute function private.normalizar_texto('nombre', 'nota');
create trigger trg_auditar after insert or delete or update on public.ruta_tarifas
  for each row execute function private.auditar('id');
create trigger trg_normalizar before insert or update on public.ruta_tarifas
  for each row execute function private.normalizar_texto('nota');

alter table public.sitios_operacion enable row level security;
alter table public.sitio_operadores enable row level security;
alter table public.rutas_acarreo    enable row level security;
alter table public.ruta_tarifas     enable row level security;

create policy sitios_operacion_lectura on public.sitios_operacion for select to authenticated
  using (private.tiene_permiso('EXPLOTACION', 'LECTURA'));
create policy sitio_operadores_lectura on public.sitio_operadores for select to authenticated
  using (private.tiene_permiso('EXPLOTACION', 'LECTURA'));
create policy rutas_acarreo_lectura on public.rutas_acarreo for select to authenticated
  using (private.tiene_permiso('EXPLOTACION', 'LECTURA'));
-- Lo que se paga lo ve quien ve el pago, igual que en tarifas_acarreo.
create policy ruta_tarifas_lectura on public.ruta_tarifas for select to authenticated
  using (private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES'));

revoke insert, update, delete, truncate on public.sitios_operacion, public.sitio_operadores,
  public.rutas_acarreo, public.ruta_tarifas from anon, authenticated;

insert into public.auditoria_modulos (tabla, modulo) values
  ('sitios_operacion', 'EXPLOTACION'),
  ('sitio_operadores', 'EXPLOTACION'),
  ('rutas_acarreo', 'EXPLOTACION'),
  ('ruta_tarifas', 'EXPLOTACION')
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- Los sitios y rutas de hoy, con lo que se sabe
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.sitios_operacion (codigo, nombre, tipo, almacen_id, nota) values
  ('MINA', 'MINA', 'MINA', null,
   'Donde se carga el material. La operación llama «Exploración» a los viajes hasta aquí.'),
  ('PLANTA-FIJA', 'PLANTA FIJA', 'PLANTA', (select id from public.almacenes where codigo = 'PAT-PF'),
   'La más cercana a la mina. Criba: arena cernida, piedra y coraza.'),
  ('PLANTA-PRIMARIA', 'PLANTA PRIMARIA', 'PLANTA', (select id from public.almacenes where codigo = 'PAT-LAV'),
   'También llamada central. Tritura y lava. Supuesto del 16/09: es la planta «de lavado» de los viajes de antes, porque su patio es el de lavado.'),
  ('BASE', 'BASE', 'BASE', (select id from public.almacenes where codigo = 'PAT-BASE'),
   'Adonde va la coraza que sale directa de la mina.');

insert into public.sitio_operadores (sitio_id, propietario, desde, motivo)
select s.id, 'LACANTERA', date '2026-09-16', 'AL CREAR LA FICHA. LA FECHA REAL EN QUE EMPEZO A OPERARLA NO SE CONOCE.'
  from public.sitios_operacion s;

insert into public.rutas_acarreo (nombre, origen_id, destino_id, precio_libre, tramo_anterior, nota) values
  ('MINA → PLANTA FIJA',
   (select id from public.sitios_operacion where codigo = 'MINA'),
   (select id from public.sitios_operacion where codigo = 'PLANTA-FIJA'),
   false, 'MINA_PLANTA', 'Era el tramo «Mina a planta fija».'),
  ('PLANTA FIJA → PLANTA PRIMARIA (LAVADO)',
   (select id from public.sitios_operacion where codigo = 'PLANTA-FIJA'),
   (select id from public.sitios_operacion where codigo = 'PLANTA-PRIMARIA'),
   false, 'PLANTA_LAVADO', 'Era el tramo «Planta fija a lavado».'),
  ('MINA → BASE (CORAZA)',
   (select id from public.sitios_operacion where codigo = 'MINA'),
   (select id from public.sitios_operacion where codigo = 'BASE'),
   true, 'MINA_BASE', 'Era el tramo «Mina a base». La coraza no tiene tarifa fija: se cuadra con el pedido.');

-- Las tarifas que regían, copiadas tal cual. Las de tarifas_acarreo no se tocan.
insert into public.ruta_tarifas (ruta_id, precio_usd, vigente_desde, nota, fijada_por, fijada_en)
select r.id, t.precio_usd, t.vigente_desde,
       'COPIADA DE LA TARIFA DEL TRAMO ' || t.tramo || ' AL CREAR LAS RUTAS.', t.fijada_por, t.fijada_en
  from public.tarifas_acarreo t
  join public.rutas_acarreo r on r.tramo_anterior = t.tramo;

-- ═══════════════════════════════════════════════════════════════════════════
-- El viaje gana ruta, máquina, carga y aprobación
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.acarreos
  add column ruta_id         bigint references public.rutas_acarreo(id),
  add column maquina_id      bigint references public.maquinaria(id),
  add column equipo_codigo   text,
  add column equipo_nombre   text,
  add column carga           text,
  add column decidido_por    uuid references auth.users(id),
  add column decidido_en     timestamptz,
  add column decidido_como   text,
  add column motivo_rechazo  text;

alter table public.acarreos
  alter column vehiculo_id drop not null,
  alter column tramo drop not null,
  alter column estado set default 'POR_APROBAR';

do $estado$
declare v_nombre text;
begin
  select conname into v_nombre
    from pg_constraint
   where conrelid = 'public.acarreos'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%''REGISTRADO''::text, ''ANULADO''::text%'
     and pg_get_constraintdef(oid) like '%estado = ANY%';
  if v_nombre is null then
    raise exception 'No encuentro el CHECK de estados de acarreos.';
  end if;
  execute format('alter table public.acarreos drop constraint %I', v_nombre);
end
$estado$;

alter table public.acarreos
  add constraint acarreo_estado check (estado in ('REGISTRADO', 'POR_APROBAR', 'APROBADO', 'RECHAZADO', 'ANULADO')),
  -- REGISTRADO es «anterior a la aprobación»: ningún viaje nuevo nace así.
  add constraint acarreo_registrado_es_de_antes check (estado <> 'REGISTRADO' or ruta_id is null),
  add constraint acarreo_camion_o_maquina check ((vehiculo_id is null) <> (maquina_id is null)),
  add constraint acarreo_tramo_o_ruta check (tramo is not null or ruta_id is not null),
  add constraint acarreo_carga check (carga is null or carga in ('COMPLETA', 'PARCIAL', 'VACIO')),
  add constraint acarreo_vacio_sin_m3 check (carga is distinct from 'VACIO' or carga_m3 is null),
  add constraint acarreo_parcial_con_m3 check (carga is distinct from 'PARCIAL' or carga_m3 is not null),
  add constraint acarreo_decidido_como check (decidido_como is null or decidido_como in ('RESPONSABLE', 'CASILLA', 'RESPALDO')),
  add constraint acarreo_decision_con_quien check (estado not in ('APROBADO', 'RECHAZADO') or (decidido_en is not null and decidido_como is not null)),
  add constraint acarreo_rechazo_con_motivo check ((estado = 'RECHAZADO') = (motivo_rechazo is not null));

create unique index acarreos_secuencia_por_ruta
  on public.acarreos (fecha, coalesce(vehiculo_id, -maquina_id), ruta_id, secuencia)
  where ruta_id is not null;
create index acarreos_por_aprobar on public.acarreos (fecha) where estado = 'POR_APROBAR';

drop trigger if exists trg_normalizar on public.acarreos;
create trigger trg_normalizar before insert or update on public.acarreos
  for each row execute function private.normalizar_texto('transportista', 'chofer', 'motivo_anulacion', 'nota', 'equipo_codigo', 'equipo_nombre', 'motivo_rechazo');

comment on column public.acarreos.estado is
  'REGISTRADO: anterior a la aprobación (hasta el 16/09/2026). POR_APROBAR → APROBADO o RECHAZADO. ANULADO en cualquier momento, con motivo.';
comment on column public.acarreos.carga is
  'Cómo volvió: COMPLETA, PARCIAL (con m³) o VACIO (sin m³). Nulo en los viajes de antes.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Vistas
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_acarreos
with (security_invoker = on)
as
 SELECT a.id,
    a.fecha,
    a.vehiculo_id,
    COALESCE(v.placa, a.equipo_codigo) AS placa,
    COALESCE(v.descripcion, a.equipo_nombre) AS vehiculo,
    COALESCE(v.tipo, 'MAQUINA'::text) AS tipo,
    v.capacidad_m3,
    v.carga_util_m3,
    a.tramo,
    COALESCE(r.nombre,
        CASE a.tramo
            WHEN 'MINA_PLANTA'::text THEN 'Mina a planta fija'::text
            WHEN 'PLANTA_LAVADO'::text THEN 'Planta fija a lavado'::text
            WHEN 'MINA_BASE'::text THEN 'Mina a base'::text
            ELSE NULL::text
        END) AS tramo_dice,
    a.secuencia,
    a.hora,
    a.transportista,
    a.chofer,
    a.carga_m3,
        CASE
            WHEN ( SELECT private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES'::text) AS puede_accion) THEN a.precio_usd
            ELSE NULL::numeric
        END::numeric(12,2) AS precio_usd,
    a.frente_id,
    f.nombre AS frente,
    a.estado,
    a.motivo_anulacion,
    a.nota,
    a.registrado_en,
    p.nombre AS registrado_por_nombre,
    r.id AS ruta_id,
    r.origen_id,
    r.destino_id,
    a.maquina_id,
    a.carga,
    a.decidido_en,
    pd.nombre AS decidido_por_nombre,
    a.decidido_como,
    a.motivo_rechazo,
    (a.ruta_id IS NULL) AS anterior_a_la_aprobacion
   FROM acarreos a
     LEFT JOIN vehiculos v ON v.id = a.vehiculo_id
     LEFT JOIN rutas_acarreo r ON r.id = a.ruta_id OR (a.ruta_id IS NULL AND r.tramo_anterior = a.tramo)
     LEFT JOIN frentes_explotacion f ON f.id = a.frente_id
     LEFT JOIN perfiles p ON p.id = a.registrado_por
     LEFT JOIN perfiles pd ON pd.id = a.decidido_por;

create or replace view public.v_acarreos_dia
with (security_invoker = on)
as
 SELECT a.fecha,
    a.vehiculo_id,
    COALESCE(v.placa, a.equipo_codigo) AS placa,
    COALESCE(v.descripcion, a.equipo_nombre) AS vehiculo,
    a.transportista,
    a.tramo,
    count(*) FILTER (WHERE a.estado = ANY (ARRAY['REGISTRADO'::text, 'APROBADO'::text]))::integer AS viajes,
    count(*) FILTER (WHERE a.estado = 'ANULADO'::text)::integer AS anulados,
    sum(a.carga_m3) FILTER (WHERE a.estado = ANY (ARRAY['REGISTRADO'::text, 'APROBADO'::text])) AS m3,
    count(*) FILTER (WHERE a.estado = ANY (ARRAY['REGISTRADO'::text, 'APROBADO'::text]) AND a.carga_m3 IS NULL AND a.carga IS DISTINCT FROM 'VACIO'::text)::integer AS sin_carga,
        CASE
            WHEN ( SELECT private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES'::text) AS puede_accion) THEN sum(a.precio_usd) FILTER (WHERE a.estado = ANY (ARRAY['REGISTRADO'::text, 'APROBADO'::text]))
            ELSE NULL::numeric
        END::numeric(14,2) AS monto_usd,
    max(a.chofer) AS chofer,
    r.id AS ruta_id,
    r.nombre AS ruta,
    a.maquina_id,
    count(*) FILTER (WHERE a.estado = 'POR_APROBAR'::text)::integer AS por_aprobar,
    count(*) FILTER (WHERE a.estado = 'RECHAZADO'::text)::integer AS rechazados,
    count(*) FILTER (WHERE a.estado = ANY (ARRAY['REGISTRADO'::text, 'APROBADO'::text, 'POR_APROBAR'::text]) AND a.carga = 'VACIO'::text)::integer AS vacios,
    count(*) FILTER (WHERE a.estado = ANY (ARRAY['REGISTRADO'::text, 'APROBADO'::text, 'POR_APROBAR'::text]) AND a.carga = 'PARCIAL'::text)::integer AS parciales
   FROM acarreos a
     LEFT JOIN vehiculos v ON v.id = a.vehiculo_id
     LEFT JOIN rutas_acarreo r ON r.id = a.ruta_id OR (a.ruta_id IS NULL AND r.tramo_anterior = a.tramo)
  GROUP BY a.fecha, a.vehiculo_id, v.placa, a.equipo_codigo, v.descripcion, a.equipo_nombre, a.transportista, a.tramo, r.id, r.nombre, a.maquina_id;

create or replace view public.v_acarreo_pago_mensual
with (security_invoker = on)
as
 SELECT date_trunc('month'::text, fecha::timestamp with time zone)::date AS mes,
    transportista,
    fecha,
    count(*)::integer AS viajes,
    sum(carga_m3) AS m3,
        CASE
            WHEN ( SELECT private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES'::text) AS puede_accion) THEN sum(precio_usd)
            ELSE NULL::numeric
        END::numeric(14,2) AS monto_usd,
        CASE
            WHEN ( SELECT private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES'::text) AS puede_accion) THEN sum(sum(precio_usd)) OVER (PARTITION BY transportista, (date_trunc('month'::text, fecha::timestamp with time zone)) ORDER BY fecha)
            ELSE NULL::numeric
        END::numeric(14,2) AS acumulado_usd
   FROM acarreos a
  WHERE estado = ANY (ARRAY['REGISTRADO'::text, 'APROBADO'::text])
  GROUP BY (date_trunc('month'::text, fecha::timestamp with time zone)), transportista, fecha;

-- Si una tarifa es rango, el viaje tiene que decir cuánto. Lo sabe cualquiera
-- que cargue viajes, aunque no vea el dinero.
create or replace function private.ruta_pide_precio(p_ruta bigint)
returns boolean
language sql
stable
security definer
set search_path to ''
as $func$
  select coalesce(
    (select r.precio_libre
         or coalesce((select t.precio_hasta_usd is not null
                        from public.ruta_tarifas t
                       where t.ruta_id = r.id and t.vigente_desde <= private.hoy_aqui()
                       order by t.vigente_desde desc limit 1), false)
       from public.rutas_acarreo r where r.id = p_ruta),
    false)
$func$;

create view public.v_rutas_acarreo
with (security_invoker = on)
as
select r.id,
       r.nombre,
       r.origen_id,
       o.codigo  as origen_codigo,
       o.nombre  as origen,
       o.tipo    as origen_tipo,
       o.estado  as origen_estado,
       r.destino_id,
       d.codigo  as destino_codigo,
       d.nombre  as destino,
       d.tipo    as destino_tipo,
       d.estado  as destino_estado,
       r.precio_libre,
       r.tramo_anterior,
       r.activa,
       r.nota,
       (r.activa and o.estado = 'ACTIVO' and d.estado = 'ACTIVO') as se_puede_usar,
       private.ruta_pide_precio(r.id) as pide_precio,
       t.precio_usd,
       t.precio_hasta_usd,
       t.vigente_desde
  from public.rutas_acarreo r
  join public.sitios_operacion o on o.id = r.origen_id
  join public.sitios_operacion d on d.id = r.destino_id
  left join lateral (
    select x.precio_usd, x.precio_hasta_usd, x.vigente_desde
      from public.ruta_tarifas x
     where x.ruta_id = r.id and x.vigente_desde <= private.hoy_aqui()
     order by x.vigente_desde desc
     limit 1) t on true;

grant select on public.v_rutas_acarreo to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Quién aprueba
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.como_aprueba_viaje(p_origen bigint, p_destino bigint)
returns text
language sql
stable
security definer
set search_path to ''
as $func$
  select case
    when exists (
      select 1
        from public.sitios_operacion s
        join public.empleados e on e.id = s.responsable_id
        join public.perfiles p on p.id = e.perfil_id
       where s.id in (p_origen, p_destino)
         and e.perfil_id = (select auth.uid())
         and e.activo and p.activo) then 'RESPONSABLE'
    when private.puede_accion('EXPLOTACION.APROBAR_VIAJES') then 'CASILLA'
    when private.tiene_rol('GERENTE_GENERAL') then 'RESPALDO'
  end
$func$;

revoke all on function private.como_aprueba_viaje(bigint, bigint) from public, anon;
revoke all on function private.ruta_pide_precio(bigint) from public, anon;
grant execute on function private.como_aprueba_viaje(bigint, bigint) to authenticated;
grant execute on function private.ruta_pide_precio(bigint) to authenticated;

create or replace function public.como_apruebo_viajes()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $func$
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'todas', private.puede_accion('EXPLOTACION.APROBAR_VIAJES') or private.tiene_rol('GERENTE_GENERAL'),
    'sitios', coalesce(
      (select jsonb_agg(s.id order by s.id)
         from public.sitios_operacion s
         join public.empleados e on e.id = s.responsable_id
         join public.perfiles p on p.id = e.perfil_id
        where e.perfil_id = (select auth.uid()) and e.activo and p.activo),
      '[]'::jsonb));
end;
$func$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Registrar, aprobar y rechazar
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.registrar_acarreos(date, bigint, text, integer, time without time zone, numeric, numeric, bigint, text);
drop function if exists public.fijar_tarifa_acarreo(text, numeric, date, text);

create or replace function public.registrar_viajes(
  p_fecha       date,
  p_ruta_id     bigint,
  p_carga       text,
  p_cantidad    integer default 1,
  p_vehiculo_id bigint default null,
  p_maquina_id  bigint default null,
  p_hora        time without time zone default null,
  p_carga_m3    numeric default null,
  p_precio_usd  numeric default null,
  p_frente_id   bigint default null,
  p_nota        text default null
)
returns integer
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_ruta    public.rutas_acarreo;
  v_origen  public.sitios_operacion;
  v_destino public.sitios_operacion;
  v_carga   text := upper(btrim(coalesce(p_carga, '')));
  v_veh     record;
  v_maq     record;
  v_tarifa  record;
  v_precio  numeric;
  v_m3      numeric;
  v_chofer  text;
  v_transp  text;
  v_codigo  text;
  v_nombre  text;
  v_util    numeric;
  v_cabe    numeric;
  v_desde   smallint;
  i         integer;
begin
  perform private.exigir_accion('EXPLOTACION.REGISTRAR_VIAJES');

  if p_fecha is null or p_fecha > private.hoy_aqui() then
    raise exception 'La fecha del viaje no puede ir en blanco ni ser del futuro.' using errcode = '22023';
  end if;

  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 60 then
    raise exception 'La cantidad de viajes tiene que estar entre 1 y 60. Llegó %.', p_cantidad
      using errcode = '22023';
  end if;

  select * into v_ruta from public.rutas_acarreo where id = p_ruta_id;
  if v_ruta.id is null then
    raise exception 'Esa ruta no existe.' using errcode = 'P0002';
  end if;
  if not v_ruta.activa then
    raise exception 'La ruta «%» está apagada.', v_ruta.nombre
      using errcode = '55000', hint = 'Se enciende en Explotación › Plantas y rutas.';
  end if;

  select * into v_origen  from public.sitios_operacion where id = v_ruta.origen_id;
  select * into v_destino from public.sitios_operacion where id = v_ruta.destino_id;

  if v_origen.estado = 'CERRADO' and v_origen.cerrado_en <= p_fecha then
    raise exception '«%» está cerrada desde el %: no despacha viajes de esa fecha en adelante.',
      v_origen.nombre, to_char(v_origen.cerrado_en, 'DD/MM/YYYY') using errcode = '55000';
  end if;
  if v_destino.estado = 'CERRADO' and v_destino.cerrado_en <= p_fecha then
    raise exception '«%» está cerrada desde el %: no recibe viajes de esa fecha en adelante.',
      v_destino.nombre, to_char(v_destino.cerrado_en, 'DD/MM/YYYY') using errcode = '55000';
  end if;

  if (p_vehiculo_id is null) = (p_maquina_id is null) then
    raise exception 'Di quién hizo el viaje: un camión o una máquina propia, uno de los dos.'
      using errcode = '22023';
  end if;

  if p_vehiculo_id is not null then
    select v.id, v.placa, v.descripcion, v.activo, v.transportista, v.capacidad_m3, v.carga_util_m3
      into v_veh
      from public.vehiculos v where v.id = p_vehiculo_id;
    if v_veh.id is null then
      raise exception 'Ese vehículo no existe.' using errcode = 'P0002';
    end if;
    if not v_veh.activo then
      raise exception 'El camión % está dado de baja.', v_veh.placa
        using errcode = '55000',
              hint = 'Si volvió a la flota, reactívalo en Vehículos antes de cargarle viajes.';
    end if;

    select ch.chofer into v_chofer
      from public.v_vehiculo_choferes ch
     where ch.vehiculo_id = p_vehiculo_id
       and ch.desde <= p_fecha
       and (ch.hasta is null or ch.hasta >= p_fecha)
     order by ch.desde desc
     limit 1;

    v_transp := coalesce(nullif(btrim(coalesce(v_veh.transportista, '')), ''), 'FLOTA PROPIA');
    v_codigo := v_veh.placa;
    v_nombre := v_veh.descripcion;
    v_util   := v_veh.carga_util_m3;
    v_cabe   := v_veh.capacidad_m3;
  else
    select m.id, m.codigo, m.nombre, e.nombres || ' ' || e.apellidos as operador
      into v_maq
      from public.maquinaria m
      left join public.empleados e on e.id = m.operador_id
     where m.id = p_maquina_id;
    if v_maq.id is null then
      raise exception 'Esa máquina no existe.' using errcode = 'P0002';
    end if;

    v_chofer := v_maq.operador;
    v_transp := 'FLOTA PROPIA';
    v_codigo := v_maq.codigo;
    v_nombre := v_maq.nombre;
  end if;

  if v_carga not in ('COMPLETA', 'PARCIAL', 'VACIO') then
    raise exception 'Di cómo volvió: con la carga completa, con carga parcial o vacío.'
      using errcode = '22023';
  end if;

  if v_carga = 'VACIO' then
    if p_carga_m3 is not null then
      raise exception 'Un viaje vacío no lleva metros cúbicos.' using errcode = '22023';
    end if;
    v_m3 := null;
  elsif v_carga = 'PARCIAL' then
    if p_carga_m3 is null or p_carga_m3 <= 0 then
      raise exception 'Con carga parcial hay que decir cuántos metros cúbicos traía.' using errcode = '22023';
    end if;
    v_m3 := p_carga_m3;
  else
    v_m3 := coalesce(p_carga_m3, v_util);
    if v_m3 is not null and v_m3 <= 0 then
      raise exception 'La carga tiene que ser mayor que cero, o quedar en blanco.' using errcode = '22023';
    end if;
  end if;

  if v_m3 is not null and v_cabe is not null and v_m3 > v_cabe then
    raise exception 'El camión % no carga %, le caben %.', v_codigo, v_m3, v_cabe
      using errcode = '22023';
  end if;

  select t.precio_usd, t.precio_hasta_usd into v_tarifa
    from public.ruta_tarifas t
   where t.ruta_id = v_ruta.id and t.vigente_desde <= p_fecha
   order by t.vigente_desde desc
   limit 1;

  if p_precio_usd is not null and p_precio_usd < 0 then
    raise exception 'El precio del viaje no puede ser negativo.' using errcode = '22023';
  end if;

  if v_ruta.precio_libre then
    if p_precio_usd is null then
      raise exception 'La ruta «%» no tiene tarifa fija: di cuánto se paga este viaje.', v_ruta.nombre
        using errcode = '22023';
    end if;
    v_precio := p_precio_usd;
  elsif v_tarifa.precio_usd is null then
    raise exception 'La ruta «%» no tiene tarifa para el %.', v_ruta.nombre, to_char(p_fecha, 'DD/MM/YYYY')
      using errcode = '55000', hint = 'Se pone en Explotación › Plantas y rutas.';
  elsif v_tarifa.precio_hasta_usd is not null then
    if p_precio_usd is null or p_precio_usd < v_tarifa.precio_usd or p_precio_usd > v_tarifa.precio_hasta_usd then
      raise exception 'La tarifa de «%» va de % a % USD: di cuánto se paga este viaje, dentro de ese rango.',
        v_ruta.nombre, v_tarifa.precio_usd, v_tarifa.precio_hasta_usd using errcode = '22023';
    end if;
    v_precio := p_precio_usd;
  else
    v_precio := coalesce(p_precio_usd, v_tarifa.precio_usd);
  end if;

  if p_frente_id is not null
     and not exists (select 1 from public.frentes_explotacion f where f.id = p_frente_id) then
    raise exception 'Ese frente no existe.' using errcode = 'P0002';
  end if;

  /*
    La numeración sigue la de los viajes de antes: en una ruta que sustituye un
    tramo, cuentan también los viajes de ese tramo sin ruta.
  */
  select coalesce(max(a.secuencia), 0) into v_desde
    from public.acarreos a
   where a.fecha = p_fecha
     and (a.vehiculo_id = p_vehiculo_id or a.maquina_id = p_maquina_id)
     and (a.ruta_id = v_ruta.id
          or (a.ruta_id is null and v_ruta.tramo_anterior is not null and a.tramo = v_ruta.tramo_anterior));

  for i in 1..p_cantidad loop
    insert into public.acarreos
      (fecha, vehiculo_id, maquina_id, ruta_id, tramo, secuencia, hora, frente_id,
       transportista, chofer, equipo_codigo, equipo_nombre, carga, carga_m3, precio_usd,
       estado, nota, registrado_por)
    values
      (p_fecha, p_vehiculo_id, p_maquina_id, v_ruta.id, v_ruta.tramo_anterior, v_desde + i,
       case when i = 1 then p_hora end, p_frente_id,
       v_transp, v_chofer, v_codigo, v_nombre, v_carga, v_m3, v_precio,
       'POR_APROBAR', nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()));
  end loop;

  return p_cantidad;
end;
$func$;

create or replace function public.aprobar_viajes(p_ids bigint[])
returns integer
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_a    record;
  v_como text;
  v_n    integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'No hay viajes que aprobar.' using errcode = '22023';
  end if;

  for v_a in
    select a.id, a.estado, a.secuencia, a.equipo_codigo, r.nombre as ruta, r.origen_id, r.destino_id
      from public.acarreos a
      left join public.rutas_acarreo r on r.id = a.ruta_id
     where a.id = any (p_ids)
     order by a.id
       for update of a
  loop
    if v_a.estado <> 'POR_APROBAR' then
      raise exception 'El viaje % de % no está por aprobar: está %.',
        v_a.secuencia, coalesce(v_a.equipo_codigo, 'ese camión'), lower(replace(v_a.estado, '_', ' '))
        using errcode = '55000';
    end if;

    v_como := private.como_aprueba_viaje(v_a.origen_id, v_a.destino_id);
    if v_como is null then
      raise exception 'Los viajes de «%» los aprueba el responsable de la mina o planta de origen o de destino, o alguien con la casilla «Aprobar o rechazar viajes».', v_a.ruta
        using errcode = '42501';
    end if;

    update public.acarreos
       set estado = 'APROBADO', decidido_por = (select auth.uid()), decidido_en = now(), decidido_como = v_como
     where id = v_a.id;
    v_n := v_n + 1;
  end loop;

  if v_n <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Alguno de esos viajes no existe.' using errcode = 'P0002';
  end if;

  return v_n;
end;
$func$;

create or replace function public.rechazar_viajes(p_ids bigint[], p_motivo text)
returns integer
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_a      record;
  v_como   text;
  v_n      integer := 0;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'No hay viajes que rechazar.' using errcode = '22023';
  end if;
  if length(v_motivo) < 4 then
    raise exception 'Escribe por qué se rechazan: quien los cargó va a leerlo.' using errcode = '22023';
  end if;

  for v_a in
    select a.id, a.estado, a.secuencia, a.equipo_codigo, r.nombre as ruta, r.origen_id, r.destino_id
      from public.acarreos a
      left join public.rutas_acarreo r on r.id = a.ruta_id
     where a.id = any (p_ids)
     order by a.id
       for update of a
  loop
    if v_a.estado <> 'POR_APROBAR' then
      raise exception 'El viaje % de % no está por aprobar: está %.',
        v_a.secuencia, coalesce(v_a.equipo_codigo, 'ese camión'), lower(replace(v_a.estado, '_', ' '))
        using errcode = '55000';
    end if;

    v_como := private.como_aprueba_viaje(v_a.origen_id, v_a.destino_id);
    if v_como is null then
      raise exception 'Los viajes de «%» los rechaza el responsable de la mina o planta de origen o de destino, o alguien con la casilla «Aprobar o rechazar viajes».', v_a.ruta
        using errcode = '42501';
    end if;

    update public.acarreos
       set estado = 'RECHAZADO', motivo_rechazo = v_motivo,
           decidido_por = (select auth.uid()), decidido_en = now(), decidido_como = v_como
     where id = v_a.id;
    v_n := v_n + 1;
  end loop;

  if v_n <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Alguno de esos viajes no existe.' using errcode = 'P0002';
  end if;

  return v_n;
end;
$func$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Sitios, operadores, rutas y tarifas
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.sitios_de_operacion()
returns table (
  id bigint, codigo text, nombre text, tipo text,
  almacen_id bigint, almacen text,
  responsable_id bigint, responsable text,
  estado text, abierto_desde date, cerrado_en date, motivo_cierre text, nota text,
  operador text, operador_nombre text, operador_desde date
)
language sql
stable
security definer
set search_path to ''
as $func$
  select s.id, s.codigo, s.nombre, s.tipo,
         s.almacen_id, a.nombre,
         s.responsable_id, nullif(btrim(coalesce(e.nombres, '') || ' ' || coalesce(e.apellidos, '')), ''),
         s.estado, s.abierto_desde, s.cerrado_en, s.motivo_cierre, s.nota,
         o.propietario, p.nombre, o.desde
    from public.sitios_operacion s
    left join public.almacenes a on a.id = s.almacen_id
    left join public.empleados e on e.id = s.responsable_id
    left join public.sitio_operadores o on o.sitio_id = s.id and o.hasta is null
    left join public.propietarios p on p.codigo = o.propietario
   where private.tiene_permiso('EXPLOTACION', 'LECTURA')
   order by s.estado, s.tipo, s.nombre
$func$;

create or replace function public.maquinas_para_viajes()
returns table (id bigint, codigo text, nombre text, tipo text)
language sql
stable
security definer
set search_path to ''
as $func$
  select m.id, m.codigo, m.nombre, m.tipo
    from public.maquinaria m
   where private.tiene_permiso('EXPLOTACION', 'LECTURA')
   order by m.nombre
$func$;

create or replace function public.guardar_sitio(
  p_id             bigint default null,
  p_codigo         text default null,
  p_nombre         text default null,
  p_tipo           text default null,
  p_almacen_id     bigint default null,
  p_responsable_id bigint default null,
  p_abierto_desde  date default null,
  p_nota           text default null,
  p_operador       text default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_id     bigint;
  v_tipo   text := upper(btrim(coalesce(p_tipo, '')));
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  perform private.exigir_accion('EXPLOTACION.GESTIONAR_SITIOS');

  if length(v_nombre) < 3 then
    raise exception 'El sitio necesita un nombre.' using errcode = '22023';
  end if;
  if v_tipo not in ('MINA', 'PLANTA', 'PATIO', 'BASE', 'OTRO') then
    raise exception 'Di qué es: mina, planta, patio, base u otro.' using errcode = '22023';
  end if;
  if p_almacen_id is not null and not exists (select 1 from public.almacenes a where a.id = p_almacen_id) then
    raise exception 'Ese patio o almacén no existe.' using errcode = 'P0002';
  end if;
  if p_responsable_id is not null and not exists (select 1 from public.empleados e where e.id = p_responsable_id and e.activo) then
    raise exception 'Esa persona no está activa en nómina.' using errcode = 'P0002';
  end if;

  if p_id is null then
    if length(btrim(coalesce(p_codigo, ''))) < 2 then
      raise exception 'El sitio necesita un código corto (por ejemplo PLANTA-FIJA).' using errcode = '22023';
    end if;
    if p_operador is null or not exists (select 1 from public.propietarios o where o.codigo = p_operador and o.activo) then
      raise exception 'Di quién opera el sitio: la empresa, la gobernación o un aliado.' using errcode = '22023';
    end if;

    insert into public.sitios_operacion (codigo, nombre, tipo, almacen_id, responsable_id, abierto_desde, nota)
    values (btrim(p_codigo), v_nombre, v_tipo, p_almacen_id, p_responsable_id, p_abierto_desde,
            nullif(btrim(coalesce(p_nota, '')), ''))
    returning id into v_id;

    insert into public.sitio_operadores (sitio_id, propietario, desde, motivo)
    values (v_id, p_operador, coalesce(p_abierto_desde, private.hoy_aqui()), 'AL ABRIR LA FICHA');

    return v_id;
  end if;

  -- El patio y el responsable se escriben TAL CUAL: vacío quiere decir nadie.
  update public.sitios_operacion
     set nombre = v_nombre,
         tipo = v_tipo,
         almacen_id = p_almacen_id,
         responsable_id = p_responsable_id,
         abierto_desde = p_abierto_desde,
         nota = nullif(btrim(coalesce(p_nota, '')), '')
   where id = p_id;

  if not found then
    raise exception 'Ese sitio no existe.' using errcode = 'P0002';
  end if;

  return p_id;
end;
$func$;

create or replace function public.cerrar_sitio(p_id bigint, p_fecha date, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_s public.sitios_operacion;
begin
  perform private.exigir_accion('EXPLOTACION.GESTIONAR_SITIOS');

  select * into v_s from public.sitios_operacion where id = p_id for update;
  if v_s.id is null then
    raise exception 'Ese sitio no existe.' using errcode = 'P0002';
  end if;
  if v_s.estado = 'CERRADO' then
    raise exception '«%» ya está cerrada desde el %.', v_s.nombre, to_char(v_s.cerrado_en, 'DD/MM/YYYY')
      using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se cierra.' using errcode = '22023';
  end if;
  if p_fecha is null or p_fecha > private.hoy_aqui() then
    raise exception 'La fecha de cierre no puede ir en blanco ni ser del futuro.' using errcode = '22023';
  end if;

  update public.sitios_operacion
     set estado = 'CERRADO', cerrado_en = p_fecha, motivo_cierre = btrim(p_motivo)
   where id = p_id;
end;
$func$;

create or replace function public.reabrir_sitio(p_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_accion('EXPLOTACION.GESTIONAR_SITIOS');

  update public.sitios_operacion
     set estado = 'ACTIVO', cerrado_en = null, motivo_cierre = null
   where id = p_id and estado = 'CERRADO';

  if not found then
    raise exception 'Ese sitio no existe o no está cerrado.' using errcode = '55000';
  end if;
end;
$func$;

create or replace function public.cambiar_operador_sitio(p_id bigint, p_operador text, p_desde date, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_s      public.sitios_operacion;
  v_actual public.sitio_operadores;
begin
  perform private.exigir_accion('EXPLOTACION.GESTIONAR_SITIOS');

  select * into v_s from public.sitios_operacion where id = p_id;
  if v_s.id is null then
    raise exception 'Ese sitio no existe.' using errcode = 'P0002';
  end if;
  if p_operador is null or not exists (select 1 from public.propietarios o where o.codigo = p_operador and o.activo) then
    raise exception 'Ese operador no está en la lista de dueños.' using errcode = 'P0002',
      hint = 'Un aliado nuevo se añade primero en Inventario › Dueños.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué cambia: una cesión, una transferencia, un acuerdo.' using errcode = '22023';
  end if;
  if p_desde is null then
    raise exception 'Di desde qué fecha lo opera.' using errcode = '22023';
  end if;

  select * into v_actual from public.sitio_operadores where sitio_id = p_id and hasta is null for update;

  if v_actual.id is not null then
    if v_actual.propietario = p_operador then
      raise exception '«%» ya lo opera ese mismo.', v_s.nombre using errcode = '55000';
    end if;
    if p_desde <= v_actual.desde then
      raise exception 'El operador de ahora lo lleva desde el %: el nuevo tiene que empezar después.',
        to_char(v_actual.desde, 'DD/MM/YYYY') using errcode = '22023';
    end if;
    update public.sitio_operadores set hasta = p_desde - 1 where id = v_actual.id;
  end if;

  insert into public.sitio_operadores (sitio_id, propietario, desde, motivo)
  values (p_id, p_operador, p_desde, btrim(p_motivo));
end;
$func$;

create or replace function public.guardar_ruta(
  p_id           bigint default null,
  p_nombre       text default null,
  p_origen_id    bigint default null,
  p_destino_id   bigint default null,
  p_precio_libre boolean default false,
  p_activa       boolean default true,
  p_nota         text default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_id     bigint;
  v_ruta   public.rutas_acarreo;
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  perform private.exigir_accion('EXPLOTACION.FIJAR_TARIFAS');

  if p_origen_id is null or p_destino_id is null then
    raise exception 'Di de dónde sale y adónde llega.' using errcode = '22023';
  end if;
  if p_origen_id = p_destino_id then
    raise exception 'Una ruta va entre dos sitios distintos.' using errcode = '22023';
  end if;

  if v_nombre = '' then
    select o.nombre || ' → ' || d.nombre into v_nombre
      from public.sitios_operacion o, public.sitios_operacion d
     where o.id = p_origen_id and d.id = p_destino_id;
  end if;
  if v_nombre is null then
    raise exception 'Alguno de los dos sitios no existe.' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.rutas_acarreo (nombre, origen_id, destino_id, precio_libre, activa, nota)
    values (v_nombre, p_origen_id, p_destino_id, coalesce(p_precio_libre, false), coalesce(p_activa, true),
            nullif(btrim(coalesce(p_nota, '')), ''))
    returning id into v_id;
    return v_id;
  end if;

  select * into v_ruta from public.rutas_acarreo where id = p_id for update;
  if v_ruta.id is null then
    raise exception 'Esa ruta no existe.' using errcode = 'P0002';
  end if;

  -- Cambiar los extremos de una ruta con viajes cambiaría a dónde fueron esos viajes.
  if (v_ruta.origen_id <> p_origen_id or v_ruta.destino_id <> p_destino_id)
     and exists (select 1 from public.acarreos a
                  where a.ruta_id = p_id
                     or (a.ruta_id is null and v_ruta.tramo_anterior is not null and a.tramo = v_ruta.tramo_anterior)) then
    raise exception 'La ruta «%» ya tiene viajes: no se le cambia de dónde sale ni adónde llega.', v_ruta.nombre
      using errcode = '55000', hint = 'Apágala y crea otra.';
  end if;

  update public.rutas_acarreo
     set nombre = v_nombre, origen_id = p_origen_id, destino_id = p_destino_id,
         precio_libre = coalesce(p_precio_libre, precio_libre), activa = coalesce(p_activa, activa),
         nota = nullif(btrim(coalesce(p_nota, '')), '')
   where id = p_id;

  return p_id;
end;
$func$;

create or replace function public.fijar_tarifa_ruta(
  p_ruta_id      bigint,
  p_precio       numeric,
  p_precio_hasta numeric default null,
  p_desde        date default null,
  p_nota         text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_ruta public.rutas_acarreo;
begin
  perform private.exigir_accion('EXPLOTACION.FIJAR_TARIFAS');

  select * into v_ruta from public.rutas_acarreo where id = p_ruta_id;
  if v_ruta.id is null then
    raise exception 'Esa ruta no existe.' using errcode = 'P0002';
  end if;
  if v_ruta.precio_libre then
    raise exception 'La ruta «%» se paga a precio libre: no lleva tarifa.', v_ruta.nombre
      using errcode = '55000', hint = 'Si ahora tiene tarifa fija, quítale el precio libre primero.';
  end if;
  if p_precio is null or p_precio < 0 then
    raise exception 'El precio del viaje no puede ir en blanco ni en negativo.' using errcode = '22023';
  end if;
  if p_precio_hasta is not null and p_precio_hasta <= p_precio then
    raise exception 'El tope del rango tiene que ser mayor que el precio de partida.' using errcode = '22023';
  end if;

  insert into public.ruta_tarifas (ruta_id, precio_usd, precio_hasta_usd, vigente_desde, nota)
  values (p_ruta_id, p_precio, p_precio_hasta, coalesce(p_desde, private.hoy_aqui()),
          nullif(btrim(coalesce(p_nota, '')), ''))
  on conflict (ruta_id, vigente_desde) do update
    set precio_usd = excluded.precio_usd,
        precio_hasta_usd = excluded.precio_hasta_usd,
        nota = excluded.nota,
        fijada_por = (select auth.uid()),
        fijada_en = now();
end;
$func$;

do $permisos$
declare f text;
begin
  foreach f in array array[
    'public.como_apruebo_viajes()',
    'public.registrar_viajes(date, bigint, text, integer, bigint, bigint, time without time zone, numeric, numeric, bigint, text)',
    'public.aprobar_viajes(bigint[])',
    'public.rechazar_viajes(bigint[], text)',
    'public.sitios_de_operacion()',
    'public.maquinas_para_viajes()',
    'public.guardar_sitio(bigint, text, text, text, bigint, bigint, date, text, text)',
    'public.cerrar_sitio(bigint, date, text)',
    'public.reabrir_sitio(bigint)',
    'public.cambiar_operador_sitio(bigint, text, date, text)',
    'public.guardar_ruta(bigint, text, bigint, bigint, boolean, boolean, text)',
    'public.fijar_tarifa_ruta(bigint, numeric, numeric, date, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end
$permisos$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Lo que ya leía los viajes: corregir, anular y el centro de costo
-- ═══════════════════════════════════════════════════════════════════════════

do $parche$
declare
  v_def text;
  r     record;
begin
  for r in
    select * from (values
      -- Lo aprobado o rechazado ya no se toca: se anula y se carga de nuevo.
      ('public.corregir_acarreo(bigint, time without time zone, numeric, numeric, text)',
       $a$  select a.id, a.estado, a.vehiculo_id into v_a$a$,
       $b$  select a.id, a.estado, a.vehiculo_id, a.carga into v_a$b$, 1),
      ('public.corregir_acarreo(bigint, time without time zone, numeric, numeric, text)',
       $a$  if exists (select 1 from public.costo_decisiones d$a$,
       $b$  if v_a.estado in ('APROBADO', 'RECHAZADO') then
    raise exception 'Ese viaje ya está %: no se corrige.', lower(v_a.estado)
      using errcode = '55000',
            hint = 'Si hace falta cambiarlo, anúlalo y cárgalo de nuevo para que se vuelva a aprobar.';
  end if;

  if p_carga_m3 is not null and v_a.carga = 'VACIO' then
    raise exception 'Ese viaje volvió vacío: no lleva metros cúbicos.'
      using errcode = '22023',
            hint = 'Si en realidad traía carga, anúlalo y cárgalo de nuevo.';
  end if;

  if exists (select 1 from public.costo_decisiones d$b$, 1),

      ('public.anular_acarreo(bigint, text)',
       $a$  if v_estado = 'ANULADO' then$a$,
       $b$  if v_estado = 'RECHAZADO' then
    raise exception 'Ese viaje está rechazado: ya no cuenta ni se paga.' using errcode = '55000';
  end if;

  if v_estado = 'ANULADO' then$b$, 1),

      -- El centro de costo recibe también lo aprobado, y los viajes de máquina.
      ('public.costo_candidatos(bigint)',
       $a$a.estado = 'REGISTRADO'$a$,
       $b$a.estado in ('REGISTRADO', 'APROBADO')$b$, 2),
      ('public.costo_candidatos(bigint)',
       $a$    join public.vehiculos v on v.id = a.vehiculo_id
    left join mediana md on true$a$,
       $b$    left join public.vehiculos v on v.id = a.vehiculo_id
    left join public.rutas_acarreo ru on ru.id = a.ruta_id
    left join mediana md on true$b$, 1),
      ('public.costo_candidatos(bigint)',
       $a$('Viaje ' || a.secuencia || ' · ' || v.placa || ' · ' || a.transportista || ' · ' ||
          case a.tramo when 'MINA_PLANTA' then 'a planta fija'
                       when 'PLANTA_LAVADO' then 'a lavado'
                       else 'coraza a base' end)::text$a$,
       $b$('Viaje ' || a.secuencia || ' · ' || coalesce(v.placa, a.equipo_codigo) || ' · ' || a.transportista || ' · ' ||
          coalesce(lower(ru.nombre),
                   case a.tramo when 'MINA_PLANTA' then 'a planta fija'
                                when 'PLANTA_LAVADO' then 'a lavado'
                                else 'coraza a base' end))::text$b$, 1),
      ('public.costo_candidatos(bigint)',
       $a$not v.propio$a$,
       $b$not coalesce(v.propio, a.maquina_id is not null)$b$, 2),
      ('public.costo_candidatos(bigint)',
       $a$case when v.propio then null$a$,
       $b$case when coalesce(v.propio, a.maquina_id is not null) then null$b$, 1),
      ('public.costo_candidatos(bigint)',
       $a$         a.vehiculo_id,
         v.placa,$a$,
       $b$         a.vehiculo_id,
         coalesce(v.placa, a.equipo_codigo),$b$, 1),
      ('public.costo_candidatos(bigint)',
       $a$when a.carga_m3 is null then 'SIN_M3'$a$,
       $b$when a.carga_m3 is null and a.carga is distinct from 'VACIO' then 'SIN_M3'$b$, 1),
      ('public.costo_aceptar(text, bigint, numeric, text)',
       $a$    select a.precio_usd, v.propio into v_a
      from public.acarreos a join public.vehiculos v on v.id = a.vehiculo_id$a$,
       $b$    select a.precio_usd, coalesce(v.propio, a.maquina_id is not null) as propio into v_a
      from public.acarreos a left join public.vehiculos v on v.id = a.vehiculo_id$b$, 1)
    ) as t(funcion, antes, despues, veces)
  loop
    v_def := pg_get_functiondef(r.funcion::regprocedure);
    if (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes) <> r.veces then
      raise exception 'En % el texto «%» no aparece % vez/veces.', r.funcion, r.antes, r.veces;
    end if;
    execute replace(v_def, r.antes, r.despues);
  end loop;
end
$parche$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Comprobación
-- ═══════════════════════════════════════════════════════════════════════════

do $ver$
begin
  if (select count(*) from public.acarreos where ruta_id is not null or estado <> 'REGISTRADO' and estado <> 'ANULADO') > 0 then
    raise exception 'Algún viaje de antes cambió de ruta o de estado.';
  end if;
  if (select count(*) from public.rutas_acarreo where tramo_anterior is not null) <> 3 then
    raise exception 'Faltan las rutas equivalentes a los tres tramos.';
  end if;
  if (select count(*) from public.ruta_tarifas) <> (select count(*) from public.tarifas_acarreo) then
    raise exception 'No se copiaron todas las tarifas.';
  end if;
  if exists (select 1 from public.v_acarreos where tramo is not null and ruta_id is null) then
    raise exception 'Hay viajes de antes que la vista no sabe a qué ruta llevar.';
  end if;
  if to_regprocedure('public.registrar_acarreos(date, bigint, text, integer, time without time zone, numeric, numeric, bigint, text)') is not null then
    raise exception 'Sigue viva la puerta vieja de cargar viajes sin aprobación.';
  end if;
end
$ver$;
