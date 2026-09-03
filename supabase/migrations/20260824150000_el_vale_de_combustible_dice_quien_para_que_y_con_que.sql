-- ---------------------------------------------------------------------------
-- El vale de combustible dice quién, cuándo, para qué, a qué máquina y cuánto
--
-- La líder, por medio de Christopher: «en el módulo de combustible se debe
-- especificar los surtidos: quién, cuándo, por qué / para qué, a qué máquina,
-- cuánto». Y después: «valorizar el litraje (opcional)», y «no es solo gasolina,
-- también puede ser gasoil u otro tipo de combustible: las máquinas no siempre
-- coinciden con el combustible de otras».
--
-- De esas cinco constancias, tres ya estaban y dos no. Lo que sigue es lo que
-- faltaba, más las dos adiciones.
--
-- =========================================================================
-- 1. EL «PARA QUÉ» NO EXISTÍA, Y NO ERA CUESTIÓN DE REINTERPRETAR `destino`
-- =========================================================================
--
-- `destino` parece el motivo y no lo es: es el sustituto del nombre de la
-- máquina cuando no tiene ficha —así lo dice su CHECK, que exige o máquina o
-- destino—. Y la vista los colapsa con `coalesce(mq.nombre, d.destino)`, así que
-- un propósito escrito ahí se guardaría en la tabla y sería invisible en
-- pantalla.
--
-- «A qué máquina» tampoco responde «para qué»: la misma excavadora se surte para
-- producir o para una prueba después de reparar, y esa diferencia es la que
-- separa consumo de desperdicio.
--
-- POR QUÉ CUATRO OPCIONES Y NO SIETE
--
-- Quien llena el vale son las cinco de la mañana, con guantes mojados y una
-- máquina esperando. Una lista larga se contesta siempre con la primera opción,
-- y entonces el dato existe pero no informa. Cuatro que se distinguen sin pensar:
--
--   OPERACION  lo normal: arrancar y trabajar, producir o acarrear
--   TALLER     mantenimiento y la prueba de después, que en el vale son lo mismo
--   PLANTA     la planta fija y los generadores, que no se mueven
--   TERCERO    equipo que no es de la casa
--
-- Sin OTRO, y es a propósito: es la misma doctrina que ya se escribió en
-- `inventario_bajas`. Un OTRO se lleva la mitad de los registros el primer mes y
-- deja el catálogo sin valor.
--
-- =========================================================================
-- 2. EL «QUIÉN» ESTABA ROTO POR RLS, NO POR SER OPCIONAL
-- =========================================================================
--
-- Esto es lo más serio que apareció, y no se veía leyendo la tabla.
--
-- `empleados` tiene una sola política de SELECT: `tiene_permiso('NOMINA','LECTURA')`.
-- Los dos únicos roles que pueden despachar combustible son ALMACEN y
-- OPERACIONES, y **los dos tienen NOMINA en NINGUNO**.
--
-- Consecuencia real: al almacenista el desplegable de «quién recibió» le sale
-- vacío, porque la consulta a `empleados` no le devuelve ni una fila. Y como
-- `v_despachos_combustible` hace LEFT JOIN a `empleados` y es `security_invoker`,
-- la columna `recibio` le sale nula siempre. El «quién» no estaba flojo: no
-- funcionaba justo para quien usa el módulo.
--
-- NO SE ARREGLA ABRIENDO `empleados`
--
-- Añadir una segunda política que ORee COMBUSTIBLE:LECTURA abriría la ficha
-- entera —sueldo incluido— a OPERACIONES, porque las políticas se suman (regla 6).
--
-- Se arregla por dos lados, y ninguno toca la reja de nómina:
--
--   a) `personas_para_vale()`, SECURITY DEFINER, devuelve id, nombre y cédula y
--      nada más. Es para el desplegable.
--   b) El nombre se copia dentro del vale al guardarlo (`recibio_nombre`). Un
--      vale es un papel: lo que dice tiene que seguir diciéndolo dentro de un
--      año, aunque la persona ya no esté o quien lo mire no pueda ver la ficha.
--      Por eso también se copia quien surtió (`surtio_nombre`).
--
-- Y el que recibe pasa a ser obligatorio. Lo decía la propia migración original
-- —«un despacho sin nombre no se le puede preguntar a nadie»— pero la columna
-- era opcional y la función no la miraba.
--
-- Admite texto libre además de empleado a propósito: a la cantera entran
-- gandolas de fleteros a las que se les echa gasoil, y su chofer no está en la
-- nómina. Es el mismo patrón que ya usa `vehiculo_choferes`.
--
-- =========================================================================
-- 3. LA HORA, SIN PEDÍRSELA A NADIE
-- =========================================================================
--
-- `fecha` es `date`, así que dos surtidos a la misma máquina el mismo día no se
-- podían ordenar entre sí — y en un turno partido eso es justo lo que hace falta.
--
-- Pero pedir la hora en el formulario sería un campo más que rellenar a mano, y
-- muchos vales se pasan a limpio en la oficina por la tarde porque en el frente
-- no hay señal. Así que la hora se pone sola cuando el vale se graba el mismo
-- día, y se queda nula cuando es transcrito. Nula significa «no la sabemos», que
-- es más honesto que una hora inventada.
--
-- =========================================================================
-- 4. CADA MÁQUINA CON SU COMBUSTIBLE
-- =========================================================================
--
-- Lo pidió la líder: no todas queman lo mismo. Hoy nada impedía echarle gasolina
-- a un motor diésel: la función solo comprueba que el artículo sea de categoría
-- COMBUSTIBLE, no que sea EL de esa máquina.
--
-- `maquinaria.combustible_id` lo dice. Nulo mientras no se sepa —no se puede
-- exigir para cargar la flota— pero en cuanto está, un despacho que no cuadre se
-- para con el nombre de los dos combustibles en el mensaje.
--
-- =========================================================================
-- 5. TRES AGUJEROS QUE APARECIERON DE CAMINO
-- =========================================================================
--
-- EL TANQUE. La función no comprobaba `almacenes.tipo`, así que se podía
-- despachar gasoil desde el PATIO DE MATERIA PRIMA. No es teórico: los 5.400 L
-- cargados están precisamente ahí y no en el tanque, y el desplegable los ofrece.
--
-- LA CARRERA. Entre `private.existencia` y el INSERT no había nada. Dos bombas
-- surtiendo a la vez podían pasar las dos la comprobación con 100 L en el tanque
-- y sacar 80 cada una. `pg_advisory_xact_lock` sobre almacén y artículo lo cierra
-- sin bloquear el resto del inventario.
--
-- EL HORÓMETRO. Comparaba contra `max(horometro)` de los despachos de esa
-- máquina, lo que hacía imposible registrar un vale atrasado —cosa que la propia
-- función permite, porque acepta fechas viejas— y no miraba las lecturas del
-- parte diario. Ahora compara contra el despacho inmediatamente anterior por
-- fecha, mira también `horometro_lecturas`, y **avisa en vez de bloquear**: es lo
-- que hace `registrar_lectura`, y un horómetro que no arrastra suele ser un
-- tablero roto, no un fraude. Bloquearlo deja la máquina sin gasoil.
--
-- =========================================================================
-- 6. Y `trg_normalizar`, QUE FALTABA (regla 5)
-- =========================================================================
--
-- La tabla tenía `trg_auditar` pero no el de normalización, así que «planta
-- electrica», «Planta Eléctrica» y «PLANTA ELECTRICA» eran tres destinos
-- distintos e invisibles entre sí para cualquier búsqueda del resto del sistema,
-- que busca en mayúscula.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- Las columnas nuevas
--
-- Van con NOT NULL sin miedo porque la tabla tiene cero filas: hoy es un ALTER
-- limpio y dentro de un mes sería una reescritura con relleno a mano.
-- --------------------------------------------------------------------------
alter table public.despachos_combustible
  add column if not exists motivo         text,
  add column if not exists hora           time,
  add column if not exists recibio_nombre text,
  add column if not exists recibio_cedula text,
  add column if not exists surtio_nombre  text;

update public.despachos_combustible
   set motivo = coalesce(motivo, 'OPERACION'),
       recibio_nombre = coalesce(recibio_nombre, 'SIN INDICAR')
 where motivo is null or recibio_nombre is null;

alter table public.despachos_combustible
  alter column motivo set not null,
  alter column recibio_nombre set not null;

alter table public.despachos_combustible
  drop constraint if exists despacho_combustible_motivo;

alter table public.despachos_combustible
  add constraint despacho_combustible_motivo
  check (motivo in ('OPERACION', 'TALLER', 'PLANTA', 'TERCERO'));

alter table public.despachos_combustible
  drop constraint if exists despacho_dice_quien_recibio;

alter table public.despachos_combustible
  add constraint despacho_dice_quien_recibio
  check (length(btrim(recibio_nombre)) >= 3);

comment on column public.despachos_combustible.motivo is
  'Para qué se surtió: OPERACION, TALLER, PLANTA o TERCERO. No es lo mismo que a qué máquina.';
comment on column public.despachos_combustible.hora is
  'La hora del surtido. Nula cuando el vale se transcribió otro día: nula es no saberla, que es mejor que inventarla.';
comment on column public.despachos_combustible.recibio_nombre is
  'Copiado dentro del vale al guardarlo. Un vale es un papel: tiene que seguir diciendo quién recibió aunque quien lo lea no pueda ver la ficha de personal.';
comment on column public.despachos_combustible.surtio_nombre is
  'Quien entregó el combustible, copiado igual que el que recibe.';

-- --------------------------------------------------------------------------
-- El combustible de cada máquina
-- --------------------------------------------------------------------------
alter table public.maquinaria
  add column if not exists combustible_id bigint references public.articulos(id);

comment on column public.maquinaria.combustible_id is
  'Qué combustible quema. Nulo mientras no se sepa; en cuanto está, un despacho que no cuadre se para.';

-- --------------------------------------------------------------------------
-- La normalización que faltaba (regla 5)
-- --------------------------------------------------------------------------
drop trigger if exists trg_normalizar on public.despachos_combustible;

create trigger trg_normalizar
  before insert or update on public.despachos_combustible
  for each row
  execute function private.normalizar_texto('destino', 'nota', 'recibio_nombre', 'surtio_nombre');

-- --------------------------------------------------------------------------
-- El desplegable de personas, sin abrir la ficha de nómina
-- --------------------------------------------------------------------------
create or replace function public.personas_para_vale()
returns table (id bigint, nombre text, cedula text, cargo text)
language plpgsql
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'LECTURA');

  return query
  -- La tabla guarda nombres y apellidos por separado; el vale quiere el nombre
  -- entero, como lo diría una persona.
  select e.id,
         btrim(e.nombres || ' ' || e.apellidos),
         e.cedula,
         e.cargo
    from public.empleados e
   where e.activo
   order by e.apellidos, e.nombres;
end;
$func$;

comment on function public.personas_para_vale() is
  'Nombre y cédula de los empleados activos, para poder decir quién recibió el combustible. Existe porque ALMACEN y OPERACIONES no tienen NOMINA:LECTURA y la reja de empleados no se puede abrir sin enseñar el sueldo.';

revoke all on function public.personas_para_vale() from public;
revoke all on function public.personas_para_vale() from anon;
grant execute on function public.personas_para_vale() to authenticated;

-- --------------------------------------------------------------------------
-- La función del despacho, entera
--
-- Se borra y se vuelve a crear en vez de reemplazarla: PostgREST resuelve por
-- nombre de argumento, así que un `create or replace` con parámetros nuevos
-- dejaría DOS funciones y la que atendiera dependería de lo que mandara el
-- navegador.
-- --------------------------------------------------------------------------
drop function if exists public.despachar_combustible(
  bigint, bigint, numeric, bigint, text, numeric, bigint, date, text);

create function public.despachar_combustible(
  p_articulo_id     bigint,
  p_almacen_id      bigint,
  p_cantidad        numeric,
  p_motivo          text,
  p_maquina_id      bigint  default null,
  p_destino         text    default null,
  p_horometro       numeric default null,
  p_empleado_id     bigint  default null,
  p_recibio_nombre  text    default null,
  p_recibio_cedula  text    default null,
  p_fecha           date    default null,
  p_nota            text    default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_fecha  date := coalesce(p_fecha, (now() at time zone 'America/Caracas')::date);
  v_hoy    date := (now() at time zone 'America/Caracas')::date;
  v_art    record;
  v_maq    record;
  v_alm    record;
  v_comb   record;
  v_hay      numeric;
  v_unitario numeric;
  v_costo    numeric;
  v_ultimo   numeric;
  v_lectura  numeric;
  v_recibe   text;
  v_cedula   text;
  v_surtio   text;
  v_mov      bigint;
  v_id       bigint;
  v_donde    text;
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if v_fecha > v_hoy then
    raise exception 'No se despacha combustible con fecha futura.' using errcode = '22023';
  end if;

  if p_motivo is null or p_motivo not in ('OPERACION', 'TALLER', 'PLANTA', 'TERCERO') then
    raise exception 'Hay que decir para qué se surtió: operación, taller, planta o tercero.'
      using errcode = '22023';
  end if;

  -- ---- el combustible ----------------------------------------------------
  select * into v_art from public.articulos where id = p_articulo_id;
  if v_art.id is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;
  if v_art.categoria <> 'COMBUSTIBLE' then
    raise exception '"%" no es combustible.', v_art.nombre using errcode = '22023';
  end if;

  -- ---- el tanque ---------------------------------------------------------
  select * into v_alm from public.almacenes where id = p_almacen_id;
  if v_alm.id is null then
    raise exception 'No existe el almacén %.', p_almacen_id using errcode = 'P0002';
  end if;
  if v_alm.tipo <> 'COMBUSTIBLE' then
    raise exception 'El combustible sale del tanque, no de "%". Ese almacén es de tipo %.',
      v_alm.nombre, v_alm.tipo
      using errcode = '22023',
            hint = 'Si el gasoil está cargado en otro almacén, transfiéralo primero al tanque.';
  end if;

  -- ---- a qué se le echó --------------------------------------------------
  if p_maquina_id is not null then
    select * into v_maq from public.maquinaria where id = p_maquina_id;
    if v_maq.id is null then
      raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
    end if;
    v_donde := v_maq.nombre;

    -- Cada máquina quema lo suyo. Solo se comprueba cuando la ficha lo dice:
    -- exigirlo para cargar la flota sería pedir un dato que nadie tiene a mano.
    if v_maq.combustible_id is not null and v_maq.combustible_id <> p_articulo_id then
      select nombre into v_comb from public.articulos where id = v_maq.combustible_id;
      raise exception '"%" usa % y se le está echando %.',
        v_maq.nombre, coalesce(v_comb.nombre, 'otro combustible'), v_art.nombre
        using errcode = '22023',
              hint = 'Si la ficha de la máquina está equivocada, corríjala en Maquinaria.';
    end if;
  else
    if length(btrim(coalesce(p_destino, ''))) < 3 then
      raise exception 'Hay que decir a qué se le echó.' using errcode = '23514';
    end if;
    v_donde := btrim(p_destino);
  end if;

  -- ---- quién lo recibió --------------------------------------------------
  if p_empleado_id is not null then
    select btrim(e.nombres || ' ' || e.apellidos), e.cedula
      into v_recibe, v_cedula
      from public.empleados e where e.id = p_empleado_id;
    if v_recibe is null then
      raise exception 'No existe el empleado %.', p_empleado_id using errcode = 'P0002';
    end if;
  else
    v_recibe := btrim(coalesce(p_recibio_nombre, ''));
    v_cedula := nullif(btrim(coalesce(p_recibio_cedula, '')), '');
    if length(v_recibe) < 3 then
      raise exception 'Hay que decir quién recibió el combustible.'
        using errcode = '23514',
              hint = 'Si no es alguien de la nómina —el chofer de un fletero, por ejemplo— escriba su nombre.';
    end if;
  end if;

  select nombre into v_surtio from public.perfiles where id = (select auth.uid());

  -- ---- el saldo, con la puerta cerrada -----------------------------------
  -- El cerrojo va ANTES de mirar la existencia. Si se mira primero y se cierra
  -- después, dos bombas pueden leer las dos «hay 100» y sacar 80 cada una.
  -- Cualificado y con las claves en int: la funcion corre con search_path
  -- vacio, asi que sin el esquema no se resuelve; y la forma de dos claves es
  -- (int, int), no (bigint, bigint). Lo caza el ensayo, no la lectura.
  perform pg_catalog.pg_advisory_xact_lock(p_almacen_id::int, p_articulo_id::int);

  v_hay := private.existencia(p_almacen_id, p_articulo_id);
  if v_hay < p_cantidad then
    raise exception 'En el tanque solo quedan % % de %.',
      v_hay, v_art.unidad, v_art.nombre using errcode = '55000';
  end if;

  -- ---- el horómetro: avisa, no bloquea -----------------------------------
  if p_horometro is not null and p_maquina_id is not null then
    select d.horometro into v_ultimo
      from public.despachos_combustible d
     where d.maquina_id = p_maquina_id
       and d.horometro is not null
       and d.fecha <= v_fecha
     order by d.fecha desc, d.id desc
     limit 1;

    select l.final into v_lectura
      from public.horometro_lecturas l
     where l.maquina_id = p_maquina_id
       and l.fecha <= v_fecha
     order by l.fecha desc, l.id desc
     limit 1;

    if (v_ultimo is not null and p_horometro < v_ultimo)
       or (v_lectura is not null and p_horometro < v_lectura) then
      perform private.notificar(
        'COMBUSTIBLE', 'HOROMETRO_NO_ARRASTRA',
        format('El horómetro de %s no cuadra', v_maq.nombre),
        format('Se surtió con %s y lo anterior marcaba %s. Suele ser el tablero, pero conviene mirarlo.',
               p_horometro, greatest(coalesce(v_ultimo, 0), coalesce(v_lectura, 0))),
        '/app/combustible', array['ALMACEN', 'OPERACIONES'], 'ATENCION');
    end if;
  end if;

  -- ---- valorizar el litraje ----------------------------------------------
  -- `costo_usd` del movimiento es UNITARIO: `valor_usd` es generada y vuelve a
  -- multiplicar por la cantidad. El total se guarda solo en el vale.
  v_unitario := private.costo_promedio(p_almacen_id, p_articulo_id);
  v_costo    := v_unitario * p_cantidad;

  v_mov := private.registrar_movimiento(
    'SALIDA_CONSUMO', -1, p_almacen_id, p_articulo_id, p_cantidad, v_unitario,
    format('Combustible · %s · %s', v_donde, p_motivo), null, null, null, v_fecha);

  insert into public.despachos_combustible
    (numero, fecha, hora, articulo_id, almacen_id, cantidad, motivo,
     maquina_id, destino, horometro, empleado_id, recibio_nombre, recibio_cedula,
     surtio_nombre, costo_usd, movimiento_id, nota, registrado_por)
  values
    (private.siguiente_numero('CMB'), v_fecha,
     -- Solo se pone la hora si el vale se graba el mismo día. Un vale
     -- transcrito el martes no ocurrió a la hora en que se tecleó.
     case when v_fecha = v_hoy then (now() at time zone 'America/Caracas')::time else null end,
     p_articulo_id, p_almacen_id, p_cantidad, p_motivo,
     p_maquina_id, nullif(btrim(coalesce(p_destino, '')), ''), p_horometro,
     p_empleado_id, v_recibe, v_cedula, v_surtio,
     v_costo, v_mov, nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  if v_art.stock_minimo > 0 and (v_hay - p_cantidad) <= v_art.stock_minimo then
    perform private.notificar(
      'COMBUSTIBLE', 'TANQUE_BAJO',
      format('Queda poco %s', v_art.nombre),
      format('Quedan %s %s, y el mínimo son %s.', v_hay - p_cantidad, v_art.unidad, v_art.stock_minimo),
      '/app/combustible', array['ALMACEN', 'OPERACIONES', 'COMPRAS'], 'ATENCION');
  end if;

  return v_id;
end;
$func$;

comment on function public.despachar_combustible(bigint, bigint, numeric, text, bigint, text, numeric, bigint, text, text, date, text) is
  'Un vale de combustible: quién lo recibió, cuándo, para qué, a qué máquina, cuánto y de qué combustible. Descuenta del tanque y valoriza al costo promedio.';

revoke all on function public.despachar_combustible(bigint, bigint, numeric, text, bigint, text, numeric, bigint, text, text, date, text) from public;
revoke all on function public.despachar_combustible(bigint, bigint, numeric, text, bigint, text, numeric, bigint, text, text, date, text) from anon;
grant execute on function public.despachar_combustible(bigint, bigint, numeric, text, bigint, text, numeric, bigint, text, text, date, text) to authenticated;

-- --------------------------------------------------------------------------
-- La vista, con lo nuevo y sin depender de la reja de nómina
--
-- Se quita el LEFT JOIN a `empleados`: el nombre ya viene copiado dentro del
-- vale, así que la vista deja de devolver nulo a quien no puede ver la ficha.
-- --------------------------------------------------------------------------
-- No vale un `create or replace`: Postgres solo deja añadir columnas al final, y
-- esta redefinición reordena y renombra respecto de la vista que creó
-- `20260819220000_control_de_combustible.sql`. En producción nunca se vio porque
-- allí cada migración entró sobre el esquema de su momento; al reaplicarlas
-- seguidas sobre una base limpia revienta con «cannot change name of view column
-- "articulo_id" to "hora"». Se borra y se crea, que es justo lo que hace
-- `20260824200000_los_catalogos_los_lleva_la_empresa.sql` con esta misma vista.
drop view if exists public.v_despachos_combustible;

create view public.v_despachos_combustible as
select
  d.id,
  d.numero,
  d.fecha,
  d.hora,
  d.motivo,
  d.articulo_id,
  a.codigo   as articulo_codigo,
  a.nombre   as combustible,
  a.unidad,
  d.almacen_id,
  al.nombre  as tanque,
  d.cantidad,
  d.maquina_id,
  mq.codigo  as maquina_codigo,
  coalesce(mq.nombre, d.destino) as destino,
  mq.tipo    as maquina_tipo,
  d.horometro,
  d.empleado_id,
  d.recibio_nombre as recibio,
  d.recibio_cedula,
  d.surtio_nombre  as surtio,
  d.registrado_por,
  d.costo_usd,
  d.nota,
  d.registrado_en
from public.despachos_combustible d
join public.articulos a  on a.id  = d.articulo_id
join public.almacenes al on al.id = d.almacen_id
left join public.maquinaria mq on mq.id = d.maquina_id;

alter view public.v_despachos_combustible set (security_invoker = on);

comment on view public.v_despachos_combustible is
  'Los vales de combustible. No une con empleados a propósito: el nombre va copiado dentro del vale, porque quien despacha no tiene permiso de nómina.';
