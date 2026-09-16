/*
  LA ORDEN DE COMPRA LLEVA «SOLICITADO POR» Y «AUTORIZADO POR»

  Christopher, 16/09/2026: la firma «aplica para todo aquello que en el sistema
  pueda generar una solicitud u orden y pueda ser aceptado». Preguntado qué dos
  firmas lleva la orden de compra: «Solicitado y autorizado».

  Hasta hoy la orden llevaba una sola raya, centrada, con la firma de quien la
  aprobó estampada siempre que la tuviera guardada. Ahora son dos, y cada dueño
  elige al actuar, como en la orden de salida y en la nota de traslado:

  - `solicitudes_pedido.firma_de_quien_pide`: quien pide lo dice al crear o al
    corregir su pedido, por defecto no. Solo vale si quien lo dice ES quien
    pide: quien carga un pedido a nombre de otro no puede estampar la firma de
    ese otro, y la raya sale en blanco con su nombre. Si al corregir cambia quien
    pide, la elección anterior deja de valer.
  - `solicitudes_pedido.firma_de_quien_aprueba`: quien aprueba lo dice al
    aprobar, por defecto sí. Nula es una compra aprobada antes de preguntarlo, y
    el papel la sigue firmando como hasta hoy.
  - `comprar_directo`: una sola persona pide y aprueba en un solo paso, y su
    elección —por defecto sí, porque la compra ya está autorizada— vale para las
    dos rayas.

  Se guarda lo que de verdad se puede estampar: sin firma encendida en ese
  momento, queda en falso.

  Y DE PASO, LA COMPRA DIRECTA NO PODÍA GUARDARSE. Al probar esto salió que
  `comprar_directo` escribía la justificación vacía cuando no llegaba, y la
  columna no admite vacío: la pantalla no la pide —la compra ya está hecha, no
  hay nada que justificar ante nadie—, así que toda compra directa se caía al
  guardar. No se había usado ninguna. Ahora, sin justificación, se toma la
  observación, y sin ella se dice lo que es. `editar_compra_directa` tenía la
  misma trampa al corregir: sin justificación nueva, se queda la que había.
*/

alter table public.solicitudes_pedido
  add column firma_de_quien_pide    boolean,
  add column firma_de_quien_aprueba boolean;

comment on column public.solicitudes_pedido.firma_de_quien_pide is
  'Si quien pidió eligió poner su firma digital en «Solicitado por». Nula: el pedido es de antes de preguntarlo, y va sin su firma.';
comment on column public.solicitudes_pedido.firma_de_quien_aprueba is
  'Si quien aprobó eligió poner su firma digital en «Autorizado por». Nula: se aprobó antes de preguntarlo, y va con su firma si la tiene encendida.';

do $parche$
declare
  v_def text;
  v_n   integer;
  r     record;
begin
  -- crear_pedido: quien pide dice si firma, y solo si es él quien pide.
  v_def := pg_get_functiondef('public.crear_pedido(text, text, jsonb, text, date, text, boolean, uuid, text, text, bigint)'::regprocedure);
  for r in
    select * from (values
      (1,
       $a$p_destino_almacen_id bigint DEFAULT NULL::bigint)
 RETURNS bigint$a$,
       $b$p_destino_almacen_id bigint DEFAULT NULL::bigint, p_con_firma boolean DEFAULT false)
 RETURNS bigint$b$),
      (2,
       $a$     registrada_por, solicitante_id, solicitante_nombre, solicitante_cargo, enviada_en)$a$,
       $b$     registrada_por, solicitante_id, solicitante_nombre, solicitante_cargo, enviada_en,
     firma_de_quien_pide)$b$),
      (3,
       $a$     case when p_enviar then now() end)
  returning id into v_id;$a$,
       $b$     case when p_enviar then now() end,
     -- La firma de otro no se estampa: solo cuenta si quien carga es quien pide.
     coalesce(p_con_firma, false)
       and v_sol.o_id is not distinct from (select auth.uid())
       and private.tengo_firma_encendida())
  returning id into v_id;$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En crear_pedido el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  drop function public.crear_pedido(text, text, jsonb, text, date, text, boolean, uuid, text, text, bigint);
  execute v_def;

  -- actualizar_pedido: nula deja lo elegido, salvo que cambie quien pide.
  v_def := pg_get_functiondef('public.actualizar_pedido(bigint, text, text, jsonb, text, date, text, uuid, text, text, bigint)'::regprocedure);
  for r in
    select * from (values
      (1,
       $a$p_destino_almacen_id bigint DEFAULT NULL::bigint)
 RETURNS void$a$,
       $b$p_destino_almacen_id bigint DEFAULT NULL::bigint, p_con_firma boolean DEFAULT NULL::boolean)
 RETURNS void$b$),
      (2,
       $a$  v_cotiza  integer;
begin$a$,
       $b$  v_cotiza  integer;
  v_antes   uuid;
begin$b$),
      (3,
       $a$  select estado, registrada_por into v_estado, v_dueno
  from public.solicitudes_pedido where id = p_id;$a$,
       $b$  select estado, registrada_por, solicitante_id into v_estado, v_dueno, v_antes
  from public.solicitudes_pedido where id = p_id;$b$),
      (4,
       $a$    solicitante_cargo = v_sol.o_cargo
  where id = p_id;$a$,
       $b$    solicitante_cargo = v_sol.o_cargo,
    firma_de_quien_pide = case
      when p_con_firma is not null
        then p_con_firma
             and v_sol.o_id is not distinct from (select auth.uid())
             and private.tengo_firma_encendida()
      -- Lo que eligió quien pedía no pasa a quien pide ahora.
      when v_sol.o_id is not distinct from v_antes then firma_de_quien_pide
      else false
    end
  where id = p_id;$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En actualizar_pedido el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  drop function public.actualizar_pedido(bigint, text, text, jsonb, text, date, text, uuid, text, text, bigint);
  execute v_def;

  -- aprobar_compra: quien autoriza dice si firma; por defecto sí.
  v_def := pg_get_functiondef('public.aprobar_compra(bigint, bigint, text)'::regprocedure);
  for r in
    select * from (values
      (1,
       $a$p_nota text DEFAULT NULL::text)
 RETURNS bigint$a$,
       $b$p_nota text DEFAULT NULL::text, p_con_firma boolean DEFAULT true)
 RETURNS bigint$b$),
      (2,
       $a$         aprobada_por_autorizacion_de = v_autoriza
   where id = p_solicitud_id;$a$,
       $b$         aprobada_por_autorizacion_de = v_autoriza,
         -- «Todo papel, como mínimo, con la firma de quien autoriza».
         firma_de_quien_aprueba = coalesce(p_con_firma, true) and private.tengo_firma_encendida()
   where id = p_solicitud_id;$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En aprobar_compra el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  drop function public.aprobar_compra(bigint, bigint, text);
  execute v_def;

  -- comprar_directo: pide y aprueba la misma persona; una elección, dos rayas.
  v_def := pg_get_functiondef('public.comprar_directo(bigint, text, jsonb, text, text, text, date, text, numeric, numeric, numeric, text, bigint)'::regprocedure);
  for r in
    select * from (values
      (1,
       $a$p_destino_almacen_id bigint DEFAULT NULL::bigint)
 RETURNS bigint$a$,
       $b$p_destino_almacen_id bigint DEFAULT NULL::bigint, p_con_firma boolean DEFAULT true)
 RETURNS bigint$b$),
      (2,
       $a$     enviada_en, propuesta_en, aprobada_gg_por, aprobada_gg_en)$a$,
       $b$     enviada_en, propuesta_en, aprobada_gg_por, aprobada_gg_en,
     firma_de_quien_pide, firma_de_quien_aprueba)$b$),
      (3,
       $a$     now(), now(), v_yo, now())
  returning id into v_solicitud;$a$,
       $b$     now(), now(), v_yo, now(),
     coalesce(p_con_firma, true) and private.tengo_firma_encendida(),
     coalesce(p_con_firma, true) and private.tengo_firma_encendida())
  returning id into v_solicitud;$b$),
      (4,
       $a$     nullif(trim(coalesce(p_justificacion, '')), ''), 'NORMAL', 'APROBADA', true,$a$,
       $b$     -- La justificación no admite vacío y la pantalla no la pide.
     coalesce(nullif(trim(coalesce(p_justificacion, '')), ''),
              nullif(trim(coalesce(p_observacion, '')), ''),
              'Compra directa: ya estaba hecha al cargarla'),
     'NORMAL', 'APROBADA', true,$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En comprar_directo el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  drop function public.comprar_directo(bigint, text, jsonb, text, text, text, date, text, numeric, numeric, numeric, text, bigint);
  execute v_def;

  -- editar_compra_directa: sin justificación nueva, se queda la que había. Sus
  -- parámetros no cambian, así que se reemplaza en su sitio y conserva permisos.
  v_def := pg_get_functiondef('public.editar_compra_directa(bigint, bigint, text, jsonb, text, text, text, date, text, numeric, numeric, numeric, text)'::regprocedure);
  for r in
    select * from (values
      (1,
       $a$         justificacion = nullif(trim(coalesce(p_justificacion, '')), '')$a$,
       $b$         justificacion = coalesce(nullif(trim(coalesce(p_justificacion, '')), ''), justificacion)$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En editar_compra_directa el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  execute v_def;
end
$parche$;

revoke all on function public.crear_pedido(text, text, jsonb, text, date, text, boolean, uuid, text, text, bigint, boolean) from public, anon;
grant execute on function public.crear_pedido(text, text, jsonb, text, date, text, boolean, uuid, text, text, bigint, boolean) to authenticated, service_role;
revoke all on function public.actualizar_pedido(bigint, text, text, jsonb, text, date, text, uuid, text, text, bigint, boolean) from public, anon;
grant execute on function public.actualizar_pedido(bigint, text, text, jsonb, text, date, text, uuid, text, text, bigint, boolean) to authenticated, service_role;
revoke all on function public.aprobar_compra(bigint, bigint, text, boolean) from public, anon;
grant execute on function public.aprobar_compra(bigint, bigint, text, boolean) to authenticated, service_role;
revoke all on function public.comprar_directo(bigint, text, jsonb, text, text, text, date, text, numeric, numeric, numeric, text, bigint, boolean) from public, anon;
grant execute on function public.comprar_directo(bigint, text, jsonb, text, text, text, date, text, numeric, numeric, numeric, text, bigint, boolean) to authenticated, service_role;

do $ver$
begin
  if position('firma_de_quien_pide' in pg_get_functiondef('public.crear_pedido(text, text, jsonb, text, date, text, boolean, uuid, text, text, bigint, boolean)'::regprocedure)) = 0 then
    raise exception 'crear_pedido no guarda la firma de quien pide';
  end if;
  if position('v_antes' in pg_get_functiondef('public.actualizar_pedido(bigint, text, text, jsonb, text, date, text, uuid, text, text, bigint, boolean)'::regprocedure)) = 0 then
    raise exception 'actualizar_pedido no cuida la firma de quien pide';
  end if;
  if position('firma_de_quien_aprueba' in pg_get_functiondef('public.aprobar_compra(bigint, bigint, text, boolean)'::regprocedure)) = 0 then
    raise exception 'aprobar_compra no guarda la firma de quien aprueba';
  end if;
  -- Lo que construyeron las delegaciones sigue en su sitio.
  if position('autoriza_delegacion' in pg_get_functiondef('public.aprobar_compra(bigint, bigint, text, boolean)'::regprocedure)) = 0 then
    raise exception 'aprobar_compra perdió la delegación';
  end if;
  if position('firma_de_quien_aprueba' in pg_get_functiondef('public.comprar_directo(bigint, text, jsonb, text, text, text, date, text, numeric, numeric, numeric, text, bigint, boolean)'::regprocedure)) = 0 then
    raise exception 'comprar_directo no guarda las firmas';
  end if;
end
$ver$;
