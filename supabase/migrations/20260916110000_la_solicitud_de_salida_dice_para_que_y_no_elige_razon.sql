/*
  LA SOLICITUD DE SALIDA DICE PARA QUÉ, Y NO ELIGE RAZÓN

  Christopher, 16/09/2026, al abrir «Pedir material»: «esto no tiene coherencia:
  ¿cómo que pido material y me pregunta para quién sale? Y si me pregunta el
  motivo por el cual se pide, directamente me dice "se usó" o "se perdió"». Y
  después: «¿por qué pediría merma? ¿por qué pediría un material con razón "uso
  en el trabajo"?».

  Las dos preguntas tienen la misma respuesta: la lista de razones describe lo
  que YA salió —se usó, se perdió— y está pensada para quien registra una salida
  directa. Quien solicita no sabe todavía nada de eso; sabe para qué lo necesita.
  Nadie solicita una merma, y «uso en el trabajo» vale para todo, así que
  elegirla no dice nada. El proyecto de referencia, MGG, ni siquiera tiene lista
  en su solicitud: pregunta quién pide y un motivo escrito.

  Christopher eligió quitarla. La solicitud pregunta almacén, material y
  cantidad, quién lo va a recibir y «¿para qué se necesita?», en texto y
  obligatorio. La lista de la salida directa no se toca.

  EL MOTIVO SIGUE SIENDO UNO SOLO EN TODAS PARTES

  Christopher, el día anterior: «el motivo que aparezca en pantalla debe ser fiel
  al motivo que aparezca en el pdf y la auditoría». Una salida sin razón
  rompería eso, así que la entrega de una solicitud sale con una razón propia,
  ENTREGA POR SOLICITUD, y el detalle dice qué solicitud fue y para qué. Esa
  razón:

    - no se ofrece en la salida directa (`clases_de_salida()` no la devuelve);
    - no se edita ni se apaga desde «Editar la lista»;
    - solo la acepta `registrar_salidas` cuando la llama la entrega de una
      solicitud, que lo avisa con una variable local a la transacción. Desde
      PostgREST no hay forma de fijarla: solo pasan las `request.*`.

  No había ninguna solicitud en producción al escribir esto.
*/

insert into public.clases_de_salida (codigo, nombre, pista, tipo, causa_baja, orden, exige_detalle, activa)
values ('ENTREGA_POR_SOLICITUD', 'ENTREGA POR SOLICITUD',
        'LO QUE SE ENTREGA PORQUE ALGUIEN LO SOLICITO Y SE APROBO. NO SE ELIGE: LA PONE LA ENTREGA DE LA SOLICITUD.',
        'SALIDA_CONSUMO', null, 900, false, true)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- pedir_salida pierde `p_tipo`. Cambia la firma: se borra la de siete.
-- ---------------------------------------------------------------------------

drop function if exists public.pedir_salida(bigint, jsonb, text, text, bigint, text, text);

create or replace function public.pedir_salida(
  p_almacen_id bigint,
  p_renglones jsonb,
  p_motivo text,
  p_grupo_id bigint default null,
  p_externo text default null,
  p_responsable text default null
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_numero    text;
  v_id        bigint;
  v_r         jsonb;
  v_n         int := 0;
  v_almacen   public.almacenes;
  v_articulo  text;
  v_cuantos   int;
  v_motivo    text := btrim(coalesce(p_motivo, ''));
begin
  perform private.exigir_permiso('SALIDAS', 'LECTURA');

  select * into v_almacen from public.almacenes where id = p_almacen_id and activo;
  if v_almacen.id is null then
    raise exception 'Ese almacén no existe o está apagado.' using errcode = '23503';
  end if;

  if length(v_motivo) < 10 then
    raise exception 'Escribe para qué se necesita: es lo que lee quien la aprueba.' using errcode = '22023';
  end if;

  if p_grupo_id is null and nullif(btrim(coalesce(p_externo, '')), '') is null then
    raise exception 'Falta decir quién lo va a recibir: un grupo de la empresa, o alguien de fuera.'
      using errcode = '22023';
  end if;
  if p_grupo_id is not null and nullif(btrim(coalesce(p_externo, '')), '') is not null then
    raise exception 'Lo recibe un grupo de la empresa o alguien de fuera, no los dos.'
      using errcode = '22023';
  end if;
  if p_grupo_id is not null
     and not exists (select 1 from public.organigrama_nodos o where o.id = p_grupo_id and o.activo) then
    raise exception 'Ese grupo no está en el organigrama, o está apagado.' using errcode = '23503';
  end if;
  if nullif(btrim(coalesce(p_externo, '')), '') is not null
     and length(btrim(coalesce(p_responsable, ''))) < 3 then
    raise exception 'Di quién responde por lo que sale: el nombre de quien lo recibe.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'No hay nada que solicitar: la solicitud no trae renglones.' using errcode = '22023';
  end if;

  v_numero := private.siguiente_numero('SS');

  insert into public.solicitudes_salida
    (numero, almacen_id, clase, motivo, grupo_id, destino_externo, responsable_externo, pedida_por)
  values
    (v_numero, p_almacen_id, 'ENTREGA_POR_SOLICITUD', v_motivo, p_grupo_id,
     nullif(btrim(coalesce(p_externo, '')), ''), nullif(btrim(coalesce(p_responsable, '')), ''),
     (select auth.uid()))
  returning id into v_id;

  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_n := v_n + 1;

    select nombre into v_articulo
      from public.articulos
     where id = nullif(btrim(coalesce(v_r->>'articulo_id', '')), '')::bigint and activo;
    if v_articulo is null then
      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n using errcode = '23503';
    end if;

    insert into public.solicitud_salida_renglones
      (solicitud_id, articulo_id, cantidad, presentaciones, presentacion, suelto, propietario)
    values
      (v_id,
       (v_r->>'articulo_id')::bigint,
       coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0),
       nullif(btrim(coalesce(v_r->>'presentaciones', '')), '')::numeric,
       nullif(btrim(coalesce(v_r->>'presentacion', '')), ''),
       nullif(btrim(coalesce(v_r->>'suelto', '')), '')::numeric,
       nullif(btrim(coalesce(v_r->>'propietario', '')), ''));
  end loop;

  select count(*) into v_cuantos from public.solicitud_salida_renglones where solicitud_id = v_id;

  perform private.notificar(
    'SALIDAS', 'SALIDA_PEDIDA',
    format('%s: solicitan sacar %s material(es) de %s', v_numero, v_cuantos, v_almacen.nombre),
    format('Para: %s. La aprueba quien responde por %s.', v_motivo, v_almacen.nombre),
    '/app/salidas/solicitudes', array['ALMACEN', 'GERENTE_GENERAL'], 'ATENCION');

  return v_numero;
end;
$function$;

revoke all on function public.pedir_salida(bigint, jsonb, text, bigint, text, text) from public, anon;
grant execute on function public.pedir_salida(bigint, jsonb, text, bigint, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Las demás, por parche anclado: cada texto tiene que aparecer una sola vez.
-- ---------------------------------------------------------------------------

do $parche$
declare
  v_def text;
  r     record;
begin
  for r in
    select * from (values
      -- La razón de la solicitud no se ofrece en la salida directa.
      ('public.clases_de_salida(boolean)',
       $a$where tipo <> 'SALIDA_BAJA'$a$,
       $b$where tipo <> 'SALIDA_BAJA'
     and codigo <> 'ENTREGA_POR_SOLICITUD'$b$),

      -- Ni se edita ni se apaga desde la lista.
      ('public.guardar_clase_de_salida(text, text, text, text, text, smallint, boolean, boolean)',
       $a$  if length(v_nombre) < 3 then$a$,
       $b$  if p_codigo = 'ENTREGA_POR_SOLICITUD' then
    raise exception 'Esa razón la pone el sistema al entregar una solicitud: no se edita.' using errcode = '22023';
  end if;

  if length(v_nombre) < 3 then$b$),

      ('public.borrar_clase_de_salida(text)',
       $a$  -- No se borra: se apaga.$a$,
       $b$  if p_codigo = 'ENTREGA_POR_SOLICITUD' then
    raise exception 'Esa razón la pone el sistema al entregar una solicitud: no se apaga.' using errcode = '22023';
  end if;

  -- No se borra: se apaga.$b$),

      -- Solo la entrega de una solicitud sale con esa razón.
      ('public.registrar_salidas(bigint, jsonb, text, text, date, bigint, text, text)',
       $a$    if v_clase.tipo = 'SALIDA_BAJA' then$a$,
       $b$    if v_clase.codigo = 'ENTREGA_POR_SOLICITUD'
       and nullif(current_setting('lacantera.entregando_solicitud', true), '') is null then
      raise exception 'La razón "%" la pone la entrega de una solicitud: en una salida directa elige otra.', v_clase.nombre
        using errcode = '22023';
    end if;
    if v_clase.tipo = 'SALIDA_BAJA' then$b$),

      -- La entrega se anuncia, y el detalle dice qué solicitud fue.
      ('public.entregar_solicitud_salida(bigint)',
       $a$  v_nota := public.registrar_salidas($a$,
       $b$  perform set_config('lacantera.entregando_solicitud', v_s.numero, true);

  v_nota := public.registrar_salidas($b$),

      ('public.entregar_solicitud_salida(bigint)',
       $a$    p_motivo      => v_s.motivo,$a$,
       $b$    p_motivo      => format('Solicitud %s. Para: %s', v_s.numero, v_s.motivo),$b$),

      ('public.entregar_solicitud_salida(bigint)',
       $a$    p_responsable => v_s.responsable_externo);$a$,
       $b$    p_responsable => v_s.responsable_externo);

  -- Y se retira en cuanto sale: nada más en esta transacción la hereda.
  perform set_config('lacantera.entregando_solicitud', '', true);$b$)
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
  if not exists (select 1 from public.clases_de_salida where codigo = 'ENTREGA_POR_SOLICITUD' and activa) then
    raise exception 'falta la razón ENTREGA_POR_SOLICITUD';
  end if;
  if exists (select 1 from public.clases_de_salida() where codigo = 'ENTREGA_POR_SOLICITUD')
     or exists (select 1 from public.clases_de_salida(true) where codigo = 'ENTREGA_POR_SOLICITUD') then
    raise exception 'la razón de la solicitud se ofrece en la lista';
  end if;
  if to_regprocedure('public.pedir_salida(bigint, jsonb, text, text, bigint, text, text)') is not null then
    raise exception 'sigue viva la firma vieja de pedir_salida';
  end if;
  if has_function_privilege('anon', 'public.pedir_salida(bigint, jsonb, text, bigint, text, text)', 'execute') then
    raise exception 'pedir_salida la puede llamar anon';
  end if;
  if position('lacantera.entregando_solicitud' in pg_get_functiondef('public.registrar_salidas(bigint, jsonb, text, text, date, bigint, text, text)'::regprocedure)) = 0
     or position('lacantera.entregando_solicitud' in pg_get_functiondef('public.entregar_solicitud_salida(bigint)'::regprocedure)) = 0 then
    raise exception 'la entrega de la solicitud no quedó avisando a registrar_salidas';
  end if;
end
$ver$;
