-- ---------------------------------------------------------------------------
-- La tasa del día se toma sola
--
-- La líder: «que la tasa BCV sea automático — el usuario aún la puede modificar
-- o actualizar como hasta ahora, pero el sistema será quien la tome o acepte en
-- vez de esperar a que un usuario lo haga».
--
-- NO ES UNA MEJORA, ES UN AGUJERO ABIERTO. El día que se escribe esto —24 de
-- agosto— la última tasa registrada es del 22. Falta el 23 y falta hoy:
--
--   USD  2026-08-22  779.9522  BCV     <- la última
--   USD  2026-08-21  779.9522  BCV
--   EUR  2026-08-21  911.2181  BCV     <- el euro lleva tres días sin registrar
--
-- Mientras falta, `obtener_tasa` arrastra la del último día que haya. Todo lo
-- que se registre hoy se valora con la tasa del viernes, y nadie ve un error:
-- sale un número, solo que el equivocado. En un país donde la tasa se mueve a
-- diario, eso es la diferencia entre una factura que cuadra y una que no.
--
-- La causa no es descuido de nadie. Es que registrar la tasa era una tarea
-- diaria, manual, que no le tocaba a nadie en particular y que no avisa cuando
-- no se hace.
--
-- POR QUÉ DESDE LA BASE Y NO DESDE EL NAVEGADOR
--
-- La tasa ya se consulta en vivo en el navegador, pero solo para enseñarla. Si
-- el navegador la registrara, la cifra la mandaría el cliente — y lo que manda
-- el cliente no es fuente de nada: bastaría con abrir las herramientas del
-- navegador para valorar una compra a la tasa que uno quiera.
--
-- Tomándola desde la base, el número lo lee el servidor de la fuente oficial y
-- no pasa por ninguna mano. Es la regla de la casa de siempre: el navegador no
-- escribe.
--
-- POR QUÉ `http` Y NO `pg_net`
--
-- `pg_net` es asíncrono: se pide, y la respuesta aparece después en otra tabla.
-- Eso obliga a dos tareas —una que pide y otra que recoge— y a un sitio donde
-- guardar el número de petición mientras tanto. Para una llamada al día es más
-- maquinaria que trabajo. `http` responde en la misma sentencia y esto cabe en
-- una función.
--
-- LO QUE NO SE TOCA
--
-- `registrar_tasa` se queda igual, con su regla de que las tasas no se
-- corrigen. Lo automático no pisa nunca lo que registró una persona: si ya hay
-- fila del día, la función se va sin hacer nada.
-- ---------------------------------------------------------------------------

create extension if not exists http with schema extensions;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- De dónde salió cada tasa
--
-- Hace falta distinguirlas para lo de más abajo: una fila que puso una persona
-- es una decisión y no se toca; una que tomó el sistema es la lectura de una
-- fuente pública y puede estar mal leída.
-- ---------------------------------------------------------------------------
alter table public.tasas_cambio
  add column if not exists automatica boolean not null default false;

comment on column public.tasas_cambio.automatica is
  'Cierto si la tomó sola la tarea diaria. Solo estas se pueden corregir: las que registró una persona son inmutables, como siempre.';

-- ---------------------------------------------------------------------------
-- La toma de una moneda
-- ---------------------------------------------------------------------------
create or replace function private.tomar_tasa_publicada(p_origen text)
returns numeric
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_url  text;
  v_resp extensions.http_response;
  v_json jsonb;
  v_valor numeric;
  v_hoy  date := (now() at time zone 'America/Caracas')::date;
begin
  -- El BCV publica la tasa dentro del HTML de su portada, sin API y con un
  -- certificado que falla a menudo. El agregador la republica en JSON. Es la
  -- misma cifra oficial: `fuente` sigue diciendo BCV porque de ahí viene.
  v_url := case p_origen
             when 'USD' then 'https://ve.dolarapi.com/v1/dolares/oficial'
             when 'EUR' then 'https://ve.dolarapi.com/v1/euros/oficial'
           end;

  if v_url is null then
    return null;
  end if;

  -- Si ya hay tasa del día no se toca, la haya puesto una persona o esta misma
  -- función en un intento anterior. Es lo que permite reintentar varias veces
  -- al día sin duplicar nada.
  if exists (
    select 1 from public.tasas_cambio
     where moneda_origen = p_origen
       and moneda_destino = 'VES'
       and fecha = v_hoy
       and fuente = 'BCV'
  ) then
    return null;
  end if;

  -- Sin límite de tiempo, una fuente que acepta la conexión y no responde deja
  -- la tarea colgada hasta que alguien la mate.
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

  begin
    select * into v_resp from extensions.http_get(v_url);
  exception when others then
    -- Que la fuente esté caída no puede tumbar la tarea: mañana se reintenta,
    -- y hoy queda el aviso en el registro.
    raise warning 'No se pudo consultar la tasa %: %', p_origen, sqlerrm;
    return null;
  end;

  if v_resp.status <> 200 then
    raise warning 'La fuente de la tasa % respondió %', p_origen, v_resp.status;
    return null;
  end if;

  v_json := v_resp.content::jsonb;

  -- El promedio es lo que publica el BCV. Compra y venta quedan de reserva por
  -- si el agregador cambia la forma de la respuesta.
  v_valor := coalesce(
    nullif(v_json->>'promedio', '')::numeric,
    nullif(v_json->>'venta', '')::numeric,
    nullif(v_json->>'compra', '')::numeric
  );

  if v_valor is null or v_valor <= 0 then
    raise warning 'La fuente devolvió una tasa % inutilizable: %', p_origen, v_resp.content;
    return null;
  end if;

  insert into public.tasas_cambio
    (moneda_origen, moneda_destino, fecha, tasa, fuente, registrado_por, automatica)
  values
    (p_origen, 'VES', v_hoy, v_valor, 'BCV', null, true)
  on conflict on constraint tasas_unicas do nothing;

  return v_valor;
end;
$func$;

comment on function private.tomar_tasa_publicada(text) is
  'Lee la tasa oficial del día de una moneda y la registra si todavía no está. No pisa nunca una tasa ya registrada.';

-- ---------------------------------------------------------------------------
-- Las dos monedas de una pasada
--
-- El USDT no entra: no lo publica ningún organismo, sale del libro P2P de
-- Binance y eso ya va por su propia función. Aquí solo lo que tiene fuente
-- oficial.
-- ---------------------------------------------------------------------------
create or replace function public.tomar_tasas_del_dia()
returns table (moneda text, tasa numeric)
language plpgsql
security definer
set search_path to ''
as $func$
begin
  return query
  select m.codigo, private.tomar_tasa_publicada(m.codigo)
    from (values ('USD'), ('EUR')) as m(codigo);
end;
$func$;

revoke all on function public.tomar_tasas_del_dia() from public;
revoke all on function public.tomar_tasas_del_dia() from anon;
revoke all on function public.tomar_tasas_del_dia() from authenticated;

comment on function public.tomar_tasas_del_dia() is
  'La tarea diaria. Devuelve la tasa tomada de cada moneda, o nulo si ya estaba o si la fuente falló.';

-- ---------------------------------------------------------------------------
-- La persona sigue mandando
--
-- Hasta hoy quien tenía TASAS:ESCRITURA registraba la tasa del día. Si el
-- sistema la registra antes, esa capacidad se pierde: la fila ya existe y
-- `registrar_tasa` se niega a duplicarla.
--
-- Por eso esto. Solo toca filas automáticas y solo las de hoy: una tasa que
-- puso una persona sigue siendo inmutable, y una de un día cerrado también.
-- Lo que se corrige es una lectura de hoy que salió mal, antes de que el día
-- termine.
--
-- No afecta a lo ya emitido: cada documento se queda con la tasa congelada en
-- su propia fila el día que se emitió.
-- ---------------------------------------------------------------------------
create or replace function public.corregir_tasa_automatica(
  p_origen character varying,
  p_tasa   numeric
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_hoy date := (now() at time zone 'America/Caracas')::date;
  v_id  bigint;
begin
  perform private.exigir_permiso('TASAS', 'ESCRITURA');

  if p_tasa is null or p_tasa <= 0 then
    raise exception 'La tasa debe ser mayor que cero (recibido: %)', p_tasa
      using errcode = '22023';
  end if;

  update public.tasas_cambio
     set tasa = p_tasa,
         automatica = false,
         registrado_por = (select auth.uid()),
         registrado_en = now()
   where moneda_origen = p_origen
     and moneda_destino = 'VES'
     and fecha = v_hoy
     and fuente = 'BCV'
     and automatica
  returning id into v_id;

  if v_id is null then
    raise exception 'No hay una tasa automática de hoy para % que corregir', p_origen
      using errcode = '22023',
            hint = 'Si la registró una persona, no se corrige: las tasas de un día cerrado son inmutables.';
  end if;

  return v_id;
end;
$func$;

comment on function public.corregir_tasa_automatica(character varying, numeric) is
  'Deja a una persona enmendar la tasa que tomó sola el sistema hoy. Al hacerlo la fila deja de ser automática y vuelve a ser inmutable.';

grant execute on function public.corregir_tasa_automatica(character varying, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Cuándo se intenta
--
-- pg_cron cuenta en UTC. Venezuela va cuatro horas por detrás, así que las
-- horas de abajo son 08:15, 11:15, 14:15 y 17:15 de la cantera.
--
-- Cuatro intentos y no uno porque el BCV no publica a hora fija, y porque un
-- intento único que caiga el día que la fuente está caída deja el día sin tasa
-- — que es exactamente lo que se viene a arreglar. Del segundo en adelante no
-- hacen nada si el primero funcionó.
-- ---------------------------------------------------------------------------
select cron.unschedule('tasa-del-dia')
 where exists (select 1 from cron.job where jobname = 'tasa-del-dia');

select cron.schedule(
  'tasa-del-dia',
  '15 12,15,18,21 * * *',
  'select public.tomar_tasas_del_dia()'
);

-- ---------------------------------------------------------------------------
-- Pedirla en el momento
--
-- La tarea corre cuatro veces al día. Quien llega a las siete de la mañana y
-- necesita emitir no puede esperar a las ocho y cuarto, y hasta hoy su única
-- salida era teclear el número a mano.
--
-- Esto lo toma del servidor igual que la tarea, pero a petición. Va aparte y no
-- se le abre el grifo a `tomar_tasas_del_dia` porque esa la llama el reloj como
-- `postgres`, sin sesión: si le pusiera la reja de permisos, se negaría a sí
-- misma todas las mañanas.
-- ---------------------------------------------------------------------------
create or replace function public.tomar_tasa_ahora(p_origen character varying)
returns numeric
language plpgsql
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_permiso('TASAS', 'ESCRITURA');
  return private.tomar_tasa_publicada(p_origen);
end;
$func$;

comment on function public.tomar_tasa_ahora(character varying) is
  'La tasa del dia a peticion, leida por el servidor. Devuelve nulo si ya estaba registrada o si la fuente no respondio.';

grant execute on function public.tomar_tasa_ahora(character varying) to authenticated;
