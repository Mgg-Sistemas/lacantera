/*
  EL PRECIO DEL VIAJE LO AJUSTA QUIEN APRUEBA, Y LAS MÁQUINAS PROPIAS NO COBRAN

  Tres cosas que Christopher aclaró el 16/09/2026 con las respuestas de la
  operación (docs/explotacion-mina-plantas-y-procesos.md §12):

  1. «Planta fija o primaria resultó ser la misma planta, la segunda planta en
     realidad es planta de lavado». La ficha que esta mañana se sembró como
     PLANTA-PRIMARIA —con el supuesto de que era la «de lavado»— pasa a llamarse
     por lo que es. Su patio ya era el de lavado. Solo cambian nombres y notas
     de fichas creadas hoy; ningún viaje ni tarifa se toca.

  2. Un viaje parcial o vacío: «lo decide quien aprueba». La regla del pago no
     se fija en la tarifa: quien aprueba ve cómo volvió cada viaje y, si hace
     falta, le pone otro precio con motivo. Queda el precio que traía la ruta
     (`precio_antes_de_ajuste`) para que nadie tenga que adivinar qué se cambió.
     Y como es suyo, quien carga el viaje ya no puede cambiarle el precio
     mientras espera aprobación: sería decidir por quien aprueba.

  3. Los cargadores y demás máquinas propias «no se facturan por viaje
     individual, a menos que se trate de un servicio alquilado a terceros por
     hora o volumen». Esta mañana cobraban la tarifa de la ruta, que era un
     supuesto nuestro: desde hoy un viaje de máquina propia queda contado a
     cero. No había ninguno registrado.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. La segunda planta es la de lavado
-- ═══════════════════════════════════════════════════════════════════════════

update public.sitios_operacion
   set codigo = 'PLANTA-LAVADO',
       nombre = 'PLANTA DE LAVADO',
       nota = 'La segunda planta: lava y clasifica. Christopher, 16/09: «planta fija o primaria resultó ser la misma planta, la segunda planta en realidad es planta de lavado».'
 where codigo = 'PLANTA-PRIMARIA';

update public.sitios_operacion
   set nota = 'También llamada planta primaria: la primera reducción de tamaño del material que baja de la mina. Criba: arena cernida, piedra y coraza.'
 where codigo = 'PLANTA-FIJA';

update public.rutas_acarreo
   set nombre = 'PLANTA FIJA → PLANTA DE LAVADO'
 where tramo_anterior = 'PLANTA_LAVADO';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. El ajuste del precio
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.acarreos
  add column precio_antes_de_ajuste numeric(12,2),
  add column motivo_ajuste text,
  add constraint acarreo_ajuste_con_motivo check ((precio_antes_de_ajuste is null) = (motivo_ajuste is null));

comment on column public.acarreos.precio_antes_de_ajuste is
  'El precio que traía el viaje de su ruta antes de que quien aprueba lo ajustara. Nulo si nadie lo ajustó.';

drop trigger if exists trg_normalizar on public.acarreos;
create trigger trg_normalizar before insert or update on public.acarreos
  for each row execute function private.normalizar_texto('transportista', 'chofer', 'motivo_anulacion', 'nota', 'equipo_codigo', 'equipo_nombre', 'motivo_rechazo', 'motivo_ajuste');

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
    (a.ruta_id IS NULL) AS anterior_a_la_aprobacion,
        CASE
            WHEN ( SELECT private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES'::text) AS puede_accion) THEN a.precio_antes_de_ajuste
            ELSE NULL::numeric
        END::numeric(12,2) AS precio_antes_de_ajuste,
    a.motivo_ajuste
   FROM acarreos a
     LEFT JOIN vehiculos v ON v.id = a.vehiculo_id
     LEFT JOIN rutas_acarreo r ON r.id = a.ruta_id OR (a.ruta_id IS NULL AND r.tramo_anterior = a.tramo)
     LEFT JOIN frentes_explotacion f ON f.id = a.frente_id
     LEFT JOIN perfiles p ON p.id = a.registrado_por
     LEFT JOIN perfiles pd ON pd.id = a.decidido_por;

create or replace function public.ajustar_precio_de_viajes(p_ids bigint[], p_precio numeric, p_motivo text)
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
    raise exception 'No hay viajes que ajustar.' using errcode = '22023';
  end if;
  if p_precio is null or p_precio < 0 then
    raise exception 'El precio no puede ir en blanco ni en negativo.' using errcode = '22023';
  end if;
  if length(v_motivo) < 4 then
    raise exception 'Escribe por qué cambia el precio: queda junto al viaje.' using errcode = '22023';
  end if;
  -- Ajustar un precio que no se ve sería decidir a ciegas.
  if not private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES') then
    raise exception 'Para ajustar el precio de un viaje hay que poder ver lo que se paga.'
      using errcode = '42501',
            hint = 'Hace falta la casilla «Ver cuánto se le paga a cada transportista».';
  end if;

  for v_a in
    select a.id, a.estado, a.secuencia, a.equipo_codigo, a.maquina_id, r.nombre as ruta, r.origen_id, r.destino_id
      from public.acarreos a
      left join public.rutas_acarreo r on r.id = a.ruta_id
     where a.id = any (p_ids)
     order by a.id
       for update of a
  loop
    if v_a.estado <> 'POR_APROBAR' then
      raise exception 'El viaje % de % no está por aprobar: su precio ya no se ajusta.',
        v_a.secuencia, coalesce(v_a.equipo_codigo, 'ese camión') using errcode = '55000';
    end if;
    if v_a.maquina_id is not null then
      raise exception 'El viaje % de % es de una máquina propia: no se paga por viaje.',
        v_a.secuencia, coalesce(v_a.equipo_codigo, 'esa máquina') using errcode = '22023';
    end if;

    v_como := private.como_aprueba_viaje(v_a.origen_id, v_a.destino_id);
    if v_como is null then
      raise exception 'El precio de los viajes de «%» lo ajusta quien los aprueba: el responsable de la mina o planta de origen o de destino, o alguien con la casilla «Aprobar o rechazar viajes».', v_a.ruta
        using errcode = '42501';
    end if;

    update public.acarreos
       set precio_antes_de_ajuste = coalesce(precio_antes_de_ajuste, precio_usd),
           precio_usd = p_precio,
           motivo_ajuste = v_motivo
     where id = v_a.id;
    v_n := v_n + 1;
  end loop;

  if v_n <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Alguno de esos viajes no existe.' using errcode = 'P0002';
  end if;

  return v_n;
end;
$func$;

revoke all on function public.ajustar_precio_de_viajes(bigint[], numeric, text) from public, anon;
grant execute on function public.ajustar_precio_de_viajes(bigint[], numeric, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Cargar a máquina propia y corregir, por parche anclado
-- ═══════════════════════════════════════════════════════════════════════════

do $parche$
declare
  v_def text;
  r     record;
begin
  for r in
    select * from (values
      ('public.registrar_viajes(date, bigint, text, integer, bigint, bigint, time without time zone, numeric, numeric, bigint, text)',
       $a$  if v_ruta.precio_libre then
    if p_precio_usd is null then$a$,
       $b$  if p_maquina_id is not null then
    /*
      LAS MÁQUINAS PROPIAS NO SE PAGAN POR VIAJE. Sus movimientos «no se
      facturan por viaje individual, a menos que se trate de un servicio
      alquilado a terceros por hora o volumen». El viaje queda contado, a cero.
    */
    if coalesce(p_precio_usd, 0) <> 0 then
      raise exception 'Las máquinas propias no se pagan por viaje: el viaje queda contado sin precio.'
        using errcode = '22023';
    end if;
    v_precio := 0;
  elsif v_ruta.precio_libre then
    if p_precio_usd is null then$b$),

      ('public.corregir_acarreo(bigint, time without time zone, numeric, numeric, text)',
       $a$  if p_carga_m3 is not null and v_a.carga = 'VACIO' then$a$,
       $b$  -- Mientras espera aprobación, el precio es de quien aprueba.
  if p_precio_usd is not null and v_a.estado = 'POR_APROBAR' then
    raise exception 'El precio de un viaje por aprobar lo ajusta quien lo aprueba, con motivo.'
      using errcode = '42501',
            hint = 'En Viajes de camiones › Por aprobar, «Ajustar precio».';
  end if;

  if p_carga_m3 is not null and v_a.carga = 'VACIO' then$b$)
    ) as t(funcion, antes, despues)
  loop
    v_def := pg_get_functiondef(r.funcion::regprocedure);
    if (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes) <> 1 then
      raise exception 'En % el texto «%» no aparece exactamente una vez.', r.funcion, r.antes;
    end if;
    execute replace(v_def, r.antes, r.despues);
  end loop;
end
$parche$;

do $ver$
begin
  if not exists (select 1 from public.sitios_operacion where codigo = 'PLANTA-LAVADO' and nombre = 'PLANTA DE LAVADO') then
    raise exception 'la planta de lavado no quedó con su nombre';
  end if;
  if exists (select 1 from public.sitios_operacion where codigo = 'PLANTA-PRIMARIA') then
    raise exception 'sigue existiendo una ficha PLANTA-PRIMARIA';
  end if;
  if position('LAS MÁQUINAS PROPIAS NO SE PAGAN POR VIAJE' in pg_get_functiondef('public.registrar_viajes(date, bigint, text, integer, bigint, bigint, time without time zone, numeric, numeric, bigint, text)'::regprocedure)) = 0 then
    raise exception 'registrar_viajes no quedó con la regla de las máquinas propias';
  end if;
  if position('lo ajusta quien lo aprueba' in pg_get_functiondef('public.corregir_acarreo(bigint, time without time zone, numeric, numeric, text)'::regprocedure)) = 0 then
    raise exception 'corregir_acarreo sigue dejando cambiar el precio de un viaje por aprobar';
  end if;
end
$ver$;
