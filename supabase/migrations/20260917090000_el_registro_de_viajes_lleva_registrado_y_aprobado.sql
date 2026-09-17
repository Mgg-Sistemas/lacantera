/*
  EL REGISTRO DE VIAJES LLEVA «REGISTRADO POR» Y «APROBADO POR»

  Christopher, 16/09/2026: la firma «aplica para todo aquello que en el sistema
  pueda generar una solicitud u orden y pueda ser aceptado». Preguntado qué dos
  firmas lleva el registro diario de viajes: «Registrado y aprobado».

  Como en la orden de salida, el traslado y la orden de compra, cada dueño
  elige al actuar:

  - `acarreos.firma_de_quien_registra`: quien carga los viajes lo dice al
    cargarlos, por defecto no. Nula es un viaje cargado antes de preguntarlo, y
    va sin su firma.
  - `acarreos.firma_de_quien_aprueba`: quien aprueba lo dice al aprobar, por
    defecto sí. Ningún viaje estaba aprobado al escribir esto, así que ninguno
    queda con una firma que su dueño no eligió.

  El registro es de un día entero y lo pueden haber cargado o aprobado varias
  personas. Eso lo resuelve el papel —firma quien más viajes cargó o aprobó, y
  nombra a los demás—; aquí se guarda la elección de cada uno en cada viaje.

  `v_acarreos` expone además quién registró y quién decidió por su
  identificador, no solo por su nombre: la firma se busca por persona, y dos
  personas pueden llamarse igual.

  Se guarda lo que de verdad se puede estampar: sin firma encendida en ese
  momento, queda en falso.
*/

alter table public.acarreos
  add column firma_de_quien_registra boolean,
  add column firma_de_quien_aprueba  boolean;

comment on column public.acarreos.firma_de_quien_registra is
  'Si quien cargó el viaje eligió poner su firma digital en «Registrado por». Nula: se cargó antes de preguntarlo, y va sin su firma.';
comment on column public.acarreos.firma_de_quien_aprueba is
  'Si quien aprobó el viaje eligió poner su firma digital en «Aprobado por». Nula: todavía no se aprueba.';

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
    a.ruta_id IS NULL AS anterior_a_la_aprobacion,
        CASE
            WHEN ( SELECT private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES'::text) AS puede_accion) THEN a.precio_antes_de_ajuste
            ELSE NULL::numeric
        END::numeric(12,2) AS precio_antes_de_ajuste,
    a.motivo_ajuste,
    a.registrado_por,
    a.decidido_por,
    a.firma_de_quien_registra,
    a.firma_de_quien_aprueba
   FROM acarreos a
     LEFT JOIN vehiculos v ON v.id = a.vehiculo_id
     LEFT JOIN rutas_acarreo r ON r.id = a.ruta_id OR a.ruta_id IS NULL AND r.tramo_anterior = a.tramo
     LEFT JOIN frentes_explotacion f ON f.id = a.frente_id
     LEFT JOIN perfiles p ON p.id = a.registrado_por
     LEFT JOIN perfiles pd ON pd.id = a.decidido_por;

do $parche$
declare
  v_def text;
  v_n   integer;
  r     record;
begin
  -- registrar_viajes: quien carga dice si firma; por defecto no.
  v_def := pg_get_functiondef('public.registrar_viajes(date, bigint, text, integer, bigint, bigint, time without time zone, numeric, numeric, bigint, text)'::regprocedure);
  for r in
    select * from (values
      (1,
       $a$p_nota text DEFAULT NULL::text)
 RETURNS integer$a$,
       $b$p_nota text DEFAULT NULL::text, p_con_firma boolean DEFAULT false)
 RETURNS integer$b$),
      (2,
       $a$       estado, nota, registrado_por)$a$,
       $b$       estado, nota, registrado_por, firma_de_quien_registra)$b$),
      (3,
       $a$       'POR_APROBAR', nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()));$a$,
       $b$       'POR_APROBAR', nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()),
       coalesce(p_con_firma, false) and private.tengo_firma_encendida());$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En registrar_viajes el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  drop function public.registrar_viajes(date, bigint, text, integer, bigint, bigint, time without time zone, numeric, numeric, bigint, text);
  execute v_def;

  -- aprobar_viajes: quien aprueba dice si firma; por defecto sí.
  v_def := pg_get_functiondef('public.aprobar_viajes(bigint[])'::regprocedure);
  for r in
    select * from (values
      (1,
       $a$aprobar_viajes(p_ids bigint[])
 RETURNS integer$a$,
       $b$aprobar_viajes(p_ids bigint[], p_con_firma boolean DEFAULT true)
 RETURNS integer$b$),
      (2,
       $a$       set estado = 'APROBADO', decidido_por = (select auth.uid()), decidido_en = now(), decidido_como = v_como
     where id = v_a.id;$a$,
       $b$       set estado = 'APROBADO', decidido_por = (select auth.uid()), decidido_en = now(), decidido_como = v_como,
           -- «Todo papel, como mínimo, con la firma de quien autoriza».
           firma_de_quien_aprueba = coalesce(p_con_firma, true) and private.tengo_firma_encendida()
     where id = v_a.id;$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En aprobar_viajes el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  drop function public.aprobar_viajes(bigint[]);
  execute v_def;
end
$parche$;

revoke all on function public.registrar_viajes(date, bigint, text, integer, bigint, bigint, time without time zone, numeric, numeric, bigint, text, boolean) from public, anon;
grant execute on function public.registrar_viajes(date, bigint, text, integer, bigint, bigint, time without time zone, numeric, numeric, bigint, text, boolean) to authenticated, service_role;
revoke all on function public.aprobar_viajes(bigint[], boolean) from public, anon;
grant execute on function public.aprobar_viajes(bigint[], boolean) to authenticated, service_role;

do $ver$
begin
  if position('firma_de_quien_registra' in pg_get_functiondef('public.registrar_viajes(date, bigint, text, integer, bigint, bigint, time without time zone, numeric, numeric, bigint, text, boolean)'::regprocedure)) = 0 then
    raise exception 'registrar_viajes no guarda la firma de quien registra';
  end if;
  if position('firma_de_quien_aprueba' in pg_get_functiondef('public.aprobar_viajes(bigint[], boolean)'::regprocedure)) = 0 then
    raise exception 'aprobar_viajes no guarda la firma de quien aprueba';
  end if;
  -- Lo que ya exigían las dos sigue en su sitio.
  if position('EXPLOTACION.REGISTRAR_VIAJES' in pg_get_functiondef('public.registrar_viajes(date, bigint, text, integer, bigint, bigint, time without time zone, numeric, numeric, bigint, text, boolean)'::regprocedure)) = 0
     or position('como_aprueba_viaje' in pg_get_functiondef('public.aprobar_viajes(bigint[], boolean)'::regprocedure)) = 0 then
    raise exception 'registrar_viajes o aprobar_viajes perdió su permiso';
  end if;
end
$ver$;
