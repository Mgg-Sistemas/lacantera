/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  7 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
  las crea. No cambia nada en la base: son los mismos cuerpos que ya corren,
  puestos donde reconstruir desde cero da lo mismo que hay.

  POR QUE APARECIO ESTA DIFERENCIA, que es lo unico interesante de este archivo:
  las migraciones de esta casa parchean con `pg_get_functiondef` + `replace` en
  vez de reescribir funciones de siete mil letras. El parche es correcto y el
  motivo es bueno —copiar a mano es lo que introduce diferencias—, pero deja el
  cuerpo repartido entre el archivo que la creo y los cinco que la tocaron
  despues. El archivo deja de servir para reconstruir aunque cada parche este
  bien.

  Lo levanto el carril de base de datos, tres veces en un dia, y la tercera con
  el diagnostico que lo explica: no es falta de cuidado, es que la verificacion
  se hace UNA VEZ al escribir y seis migraciones despues otra cosa toca la misma
  funcion. Un md5 comprobado el lunes no dice nada del miercoles.

  Por eso esto es generado y no transcrito: volcar la salida de Postgres no puede
  introducir una diferencia, y teclearla si.

  QUE SE COMPROBO ANTES DE GUARDARLO

  Cada cuerpo de aqui se comparo BYTE A BYTE contra `pg_proc.prosrc` de la base
  viva —no normalizado, no perdonando comentarios— y los 7 coinciden. Y el
  detector, que antes marcaba estas 7, pasa a cero.

  NO SE APLICO, Y ES A PROPOSITO

  Aplicarlo seria un no-op: son exactamente los cuerpos que ya corren, sacados de
  `pg_get_functiondef`. Su valor no esta en cambiar la base sino en que
  reconstruirla desde cero de lo mismo que hay.

  Y LA TRAMPA QUE ESO DEJA, dicha aqui para que no sorprenda: si manana otra
  migracion toca una de estas funciones y alguien corre ESTE archivo suelto,
  despues, la revierte al cuerpo de hoy. En orden no pasa —va fechado con su dia y
  detras de todo lo de ese dia—, pero un volcado no es una migracion normal y
  conviene saberlo antes de ejecutarlo a mano.
*/

-- private.como_aprueba_viaje(p_origen bigint, p_destino bigint)
-- venia de: 20260916130000_plantas_rutas_y_viajes_que_se_aprueban.sql
CREATE OR REPLACE FUNCTION private.como_aprueba_viaje(p_origen bigint, p_destino bigint)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when private.accion_restringida('EXPLOTACION.APROBAR_VIAJES') then null
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
$function$;

-- public.aprobar_solicitud_salida(p_id bigint)
-- venia de: 20260916070000_la_salida_se_puede_pedir_antes_de_entregarla.sql
CREATE OR REPLACE FUNCTION public.aprobar_solicitud_salida(p_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s     public.solicitudes_salida;
  v_alm   public.almacenes;
  v_como  text;
begin
  select * into v_s from public.solicitudes_salida where id = p_id for update;
  if v_s.id is null then
    raise exception 'No existe la solicitud %.', p_id using errcode = 'P0002';
  end if;
  if v_s.estado <> 'PEDIDA' then
    raise exception 'La solicitud % ya no espera aprobación: está %.', v_s.numero, lower(v_s.estado)
      using errcode = '55000';
  end if;

  select * into v_alm from public.almacenes where id = v_s.almacen_id;
  -- A quien se le restringió no aprueba por ningún camino, tampoco por
  -- responder por el almacén.
  if private.accion_restringida('SALIDAS.APROBAR_SOLICITUD') then
    raise exception 'No puedes aprobar la solicitud %: aprobar salidas se te restringió. Solicitarlas sí puedes.', v_s.numero
      using errcode = '42501';
  end if;
  v_como := private.como_aprueba_salida(v_s.almacen_id);
  if v_como is null then
    raise exception 'La solicitud % la aprueba quien responde por "%"%, o quien tenga la casilla de aprobar salidas.',
      v_s.numero, v_alm.nombre, private.quien_responde_frase(v_s.almacen_id)
      using errcode = '42501';
  end if;

  update public.solicitudes_salida
     set estado = 'APROBADA',
         aprobada_por = (select auth.uid()), aprobada_en = now(),
         aprobada_de_respaldo = (v_como = 'RESPALDO')
   where id = p_id;

  perform private.notificar(
    'SALIDAS', 'SALIDA_APROBADA',
    format('%s: aprobada', v_s.numero),
    format('Se puede entregar desde %s.', v_alm.nombre),
    '/app/salidas/solicitudes', array['ALMACEN'], 'INFO');

  return p_id;
end;
$function$;

-- public.autorizar_accion(p_usuario_id uuid, p_accion text, p_motivo text, p_desde date, p_hasta date)
-- venia de: 20260825220000_las_autorizaciones_se_conceden_y_se_retiran.sql
CREATE OR REPLACE FUNCTION public.autorizar_accion(p_usuario_id uuid, p_accion text, p_motivo text, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_yo     uuid := (select auth.uid());
  v_desde  date := coalesce(p_desde, current_date);
  v_nombre text;
  v_accion public.acciones;
  v_id     bigint;
begin
  -- Lo gestionan administración y la gerencia, como pidió Christopher.
  perform private.exigir_rol('ADMIN', 'GERENTE_GENERAL');

  select * into v_accion from public.acciones where codigo = p_accion;

  if v_accion.codigo is null then
    raise exception 'No existe la acción "%".', p_accion using errcode = 'P0002';
  end if;

  if not v_accion.activa then
    raise exception 'La casilla "%" está apagada: no se reparte ni se presta.', v_accion.nombre
      using errcode = '55000';
  end if;

  /*
    Las dos que no se prestan nunca.

    Prestar la llave que reparte llaves es una escalera a todo el sistema, y con
    un peldaño intermedio que además la disimula: quien recibiera «repartir los
    permisos de un rol» podría darse a sí mismo cualquier cosa al día siguiente,
    y el registro solo diría que se le prestó una casilla.
  */
  if p_accion in ('USUARIOS.DAR_PERMISOS', 'USUARIOS.ASIGNAR_ROLES') then
    raise exception 'Esa no se presta: quien la recibe puede darse a sí mismo cualquier otra cosa. Si de verdad hace falta, se le da el rol de administrador y queda a la vista.'
      using errcode = '42501';
  end if;

  /*
    Nadie presta lo que no tiene.

    Sin este freno, la gerencia podría concederle a cualquiera «crear usuarios»
    —que es algo que la gerencia misma no puede hacer, porque esas funciones
    exigen el rol de administrador— y eso no sería delegar sino fabricar permiso
    de la nada. El administrador pasa siempre, así que puede prestar cualquier
    cosa.

    Se mira el derecho PROPIO a posta: si lo tuyo también es prestado, no lo
    vuelves a prestar. Una autorización que se re-presta es una cadena que nadie
    puede seguir cuando haya que responder por lo firmado.
  */
  if not private.puede_accion_propia(p_accion) then
    raise exception 'No puedes extender "%" porque tú no la tienes por derecho propio.', v_accion.nombre
      using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe por qué se le extiende. Sin justificación, dentro de un mes nadie sabrá si esto sigue haciendo falta.'
      using errcode = '22023';
  end if;

  select nombre into v_nombre from public.perfiles where id = p_usuario_id and activo;
  if v_nombre is null then
    raise exception 'No existe esa persona, o está desactivada.' using errcode = 'P0002';
  end if;

  if p_usuario_id = v_yo then
    raise exception 'No puedes extenderte permisos a ti mismo.' using errcode = '42501';
  end if;

  if p_hasta is not null and p_hasta < v_desde then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio.' using errcode = '22023';
  end if;

  -- Extender lo que se le restringió dejaría dos filas que se contradicen, y
  -- nadie sabría cuál manda cuando haya que responder por lo firmado. Primero se
  -- levanta la restricción, a la vista.
  if exists (
    select 1 from public.restricciones rs
     where rs.a_usuario = p_usuario_id and rs.accion = p_accion and rs.levantada_en is null
       and daterange(rs.desde, rs.hasta, '[]') && daterange(v_desde, p_hasta, '[]')
  ) then
    raise exception 'A % se le restringió «%». Levanta la restricción antes de extendérsela.', v_nombre, v_accion.nombre
      using errcode = '55000';
  end if;

  -- Si ya la tiene por derecho propio, esto no le añadiría nada y dejaría en el
  -- papel un «bajo autorización de» que no corresponde. Se avisa en vez de
  -- guardar una fila muerta.
  if exists (
    select 1 from public.usuarios_roles ur
      join public.rol_permisos rp on rp.rol = ur.rol and rp.modulo = v_accion.modulo
      join public.roles r on r.codigo = ur.rol
     where ur.usuario_id = p_usuario_id and not r.a_la_medida
       and v_accion.nivel_equivalente is not null
       and private.rango_nivel(rp.nivel) >= private.rango_nivel(v_accion.nivel_equivalente)
    union all
    select 1 from public.usuarios_roles ur
      join public.rol_acciones ra on ra.rol = ur.rol and ra.accion = p_accion
     where ur.usuario_id = p_usuario_id
  ) then
    raise exception '% ya puede "%" por su rol. No hace falta extendérsela.', v_nombre, v_accion.nombre
      using errcode = '55000';
  end if;

  -- Una vigente para la misma persona y la misma casilla se retira sola: dos
  -- autorizaciones vivas de lo mismo dejan sin saber cuál es la que ampara el
  -- papel que se acaba de firmar.
  update public.autorizaciones
     set revocada_en = now(), revocada_por = v_yo,
         revocada_motivo = 'Sustituida por una nueva'
   where a_usuario = p_usuario_id and accion = p_accion and revocada_en is null;

  insert into public.autorizaciones
    (accion, a_usuario, por_usuario, desde, hasta, motivo, creada_por)
  values
    (p_accion, p_usuario_id, v_yo, v_desde, p_hasta, btrim(p_motivo), v_yo)
  returning id into v_id;

  return v_id;
end;
$function$;

-- public.cancelar_solicitud_salida(p_id bigint, p_motivo text)
-- venia de: 20260916070000_la_salida_se_puede_pedir_antes_de_entregarla.sql
CREATE OR REPLACE FUNCTION public.cancelar_solicitud_salida(p_id bigint, p_motivo text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s public.solicitudes_salida;
begin
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Di por qué se cancela: queda escrito y no se puede editar.' using errcode = '22023';
  end if;

  select * into v_s from public.solicitudes_salida where id = p_id for update;
  if v_s.id is null then
    raise exception 'No existe la solicitud %.', p_id using errcode = 'P0002';
  end if;
  if v_s.estado not in ('PEDIDA', 'APROBADA') then
    raise exception 'La solicitud % ya está %: no se puede cancelar.', v_s.numero, lower(v_s.estado)
      using errcode = '55000';
  end if;

  if v_s.pedida_por is distinct from (select auth.uid())
     and private.como_aprueba_salida(v_s.almacen_id) is null then
    raise exception 'La cancela quien la pidió, o quien puede aprobarla.'
      using errcode = '42501';
  end if;

  update public.solicitudes_salida
     set estado = 'CANCELADA', cierre_motivo = btrim(p_motivo)
   where id = p_id;

  return p_id;
end;
$function$;

-- public.como_apruebo_viajes()
-- venia de: 20260916130000_plantas_rutas_y_viajes_que_se_aprueban.sql
CREATE OR REPLACE FUNCTION public.como_apruebo_viajes()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'todas', not private.accion_restringida('EXPLOTACION.APROBAR_VIAJES')
             and (private.puede_accion('EXPLOTACION.APROBAR_VIAJES') or private.tiene_rol('GERENTE_GENERAL')),
    'sitios', case when private.accion_restringida('EXPLOTACION.APROBAR_VIAJES') then '[]'::jsonb else coalesce(
      (select jsonb_agg(s.id order by s.id)
         from public.sitios_operacion s
         join public.empleados e on e.id = s.responsable_id
         join public.perfiles p on p.id = e.perfil_id
        where e.perfil_id = (select auth.uid()) and e.activo and p.activo),
      '[]'::jsonb) end);
end;
$function$;

-- public.devolver_a_cotizacion(p_solicitud_id bigint, p_motivo text)
-- venia de: 20260827130000_compras_varias_cotizaciones.sql
CREATE OR REPLACE FUNCTION public.devolver_a_cotizacion(p_solicitud_id bigint, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_estado text;
begin
  -- Por la casilla y no por el rol. Devolver es la otra cara de aprobar, y la
  -- pantalla lo ofrece a quien aprueba: con el rol, quien aprobaba con un
  -- permiso extendido veía el botón y la base le decía que no.
  perform private.exigir_accion('COMPRAS.DEVOLVER_A_COTIZACION');

  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Di qué hay que corregir: sin eso, compras vuelve a mandar lo mismo.'
      using errcode = '22023';
  end if;

  select estado into v_estado from public.solicitudes_pedido where id = p_solicitud_id;

  if v_estado <> 'POR_CONFIRMAR_GERENTE' then
    raise exception 'Este pedido no está esperando a la gerencia.' using errcode = '55000';
  end if;

  update public.cotizaciones
     set propuesta = false
   where solicitud_id = p_solicitud_id and propuesta;

  update public.solicitudes_pedido
     set estado = 'CONFIRMADA', cotizacion_elegida_id = null, propuesta_en = null
   where id = p_solicitud_id;

  perform private.anotar('SOLICITUD', p_solicitud_id, v_estado, 'CONFIRMADA', p_motivo);
end;
$function$;

-- public.rechazar_solicitud_salida(p_id bigint, p_motivo text)
-- venia de: 20260916070000_la_salida_se_puede_pedir_antes_de_entregarla.sql
CREATE OR REPLACE FUNCTION public.rechazar_solicitud_salida(p_id bigint, p_motivo text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s    public.solicitudes_salida;
  v_alm  public.almacenes;
begin
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Di por qué no se aprueba: quien la pidió va a leerlo.' using errcode = '22023';
  end if;

  select * into v_s from public.solicitudes_salida where id = p_id for update;
  if v_s.id is null then
    raise exception 'No existe la solicitud %.', p_id using errcode = 'P0002';
  end if;
  if v_s.estado <> 'PEDIDA' then
    raise exception 'La solicitud % ya no espera aprobación: está %.', v_s.numero, lower(v_s.estado)
      using errcode = '55000';
  end if;

  select * into v_alm from public.almacenes where id = v_s.almacen_id;
  if private.accion_restringida('SALIDAS.APROBAR_SOLICITUD') then
    raise exception 'No puedes resolver la solicitud %: aprobar salidas se te restringió. Solicitarlas sí puedes.', v_s.numero
      using errcode = '42501';
  end if;
  if private.como_aprueba_salida(v_s.almacen_id) is null then
    raise exception 'La solicitud % la resuelve quien responde por "%"%, o quien tenga la casilla de aprobar salidas.',
      v_s.numero, v_alm.nombre, private.quien_responde_frase(v_s.almacen_id)
      using errcode = '42501';
  end if;

  update public.solicitudes_salida
     set estado = 'RECHAZADA', cierre_motivo = btrim(p_motivo),
         aprobada_por = (select auth.uid()), aprobada_en = now()
   where id = p_id;

  perform private.notificar(
    'SALIDAS', 'SALIDA_RECHAZADA',
    format('%s: no se aprobó', v_s.numero),
    btrim(p_motivo),
    '/app/salidas/solicitudes', array['ALMACEN'], 'ATENCION');

  return p_id;
end;
$function$;
