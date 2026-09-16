/*
  LA NOTA DE TRASLADO LLEVA LA FIRMA QUE SU DUEÑO ELIGE

  Christopher, 16/09/2026, después de la orden de salida: «el tema de la firma
  aplica para todo aquello que en el sistema pueda generar una solicitud u orden
  y pueda ser aceptado». Preguntado qué dos firmas lleva la nota de traslado:
  «Envió y recibió».

  - «Envió» es quien aprueba y despacha en el origen (`aceptado_por`), y
    «Recibió», quien confirma en el destino que llegó (`recibido_por`). Quien lo
    pidió no firma: participan dos, y su nombre va en el cuadro de datos.
  - `traslados.firma_de_quien_envia` y `firma_de_quien_recibe` guardan lo que
    eligió cada uno al actuar, como en la orden de salida. Nula es «ese paso
    todavía no se dio».
  - `aceptar_traslado` recibe `p_con_firma`, por defecto sí: enviar es
    autorizar que el material salga, y «todo pdf creado por defecto debe salir
    como mínimo la firma de quien autoriza».
  - `recibir_traslado` también, por defecto no: confirmar la llegada no es
    autorizar nada, y esa firma se pone a sabiendas.
  - `solicitar_traslado` lo pasa en las dos formas que actúan al nacer. Enviar
    llama a `aceptar_traslado` con la elección; el directo lo hace una sola
    persona en un solo paso, y su elección vale para las dos rayas.

  Se guarda lo que de verdad se puede estampar: sin una firma encendida en ese
  momento queda en falso. No hay traslados en producción al escribir esto, así
  que ninguna fila queda con una firma que su dueño no eligió.
*/

alter table public.traslados
  add column firma_de_quien_envia  boolean,
  add column firma_de_quien_recibe boolean;

comment on column public.traslados.firma_de_quien_envia is
  'Si quien aprobó y envió eligió poner su firma digital en «Envió». Nula: todavía no se envía.';
comment on column public.traslados.firma_de_quien_recibe is
  'Si quien confirmó la llegada eligió poner su firma digital en «Recibió». Nula: todavía no llega.';

create or replace view public.v_traslados
with (security_invoker = on)
as
 SELECT t.id,
    t.numero,
    t.estado,
    t.inmediato,
    t.fecha,
    t.origen_id,
    o.codigo AS origen_codigo,
    o.nombre AS origen,
    t.destino_id,
    d.codigo AS destino_codigo,
    d.nombre AS destino,
    t.articulo_id,
    a.codigo AS articulo_codigo,
    a.nombre AS articulo,
    a.unidad,
    t.cantidad,
    t.presentaciones,
    t.presentacion,
    t.suelto,
    t.propietario,
    t.motivo,
    t.solicitado_por,
    ps.nombre AS solicitado_por_nombre,
    t.solicitado_en,
    t.aceptado_por,
    pa.nombre AS aceptado_por_nombre,
    t.aceptado_en,
    t.aceptado_de_respaldo,
    t.recibido_por,
    pr.nombre AS recibido_por_nombre,
    t.recibido_en,
    t.recibido_de_respaldo,
    t.cancelado_por,
    pc.nombre AS cancelado_por_nombre,
    t.cancelado_en,
    t.motivo_cancelacion,
    t.mov_salida,
    t.mov_en_camino,
    t.mov_llegada,
    t.mov_vuelta,
    t.enviado,
    t.firma_de_quien_envia,
    t.firma_de_quien_recibe
   FROM traslados t
     LEFT JOIN almacenes o ON o.id = t.origen_id
     LEFT JOIN almacenes d ON d.id = t.destino_id
     LEFT JOIN articulos a ON a.id = t.articulo_id
     LEFT JOIN perfiles ps ON ps.id = t.solicitado_por
     LEFT JOIN perfiles pa ON pa.id = t.aceptado_por
     LEFT JOIN perfiles pr ON pr.id = t.recibido_por
     LEFT JOIN perfiles pc ON pc.id = t.cancelado_por;

do $parche$
declare
  v_def text;
  v_n   integer;
  r     record;
begin
  -- aceptar_traslado: quien envía dice si firma; por defecto sí.
  v_def := pg_get_functiondef('public.aceptar_traslado(bigint)'::regprocedure);
  for r in
    select * from (values
      (1,
       $a$aceptar_traslado(p_id bigint)
 RETURNS bigint$a$,
       $b$aceptar_traslado(p_id bigint, p_con_firma boolean DEFAULT true)
 RETURNS bigint$b$),
      (2,
       $a$         aceptado_de_respaldo = (v_como = 'RESPALDO'),
         mov_salida = v_mov.salida, mov_en_camino = v_mov.entrada
   where id = p_id;$a$,
       $b$         aceptado_de_respaldo = (v_como = 'RESPALDO'),
         mov_salida = v_mov.salida, mov_en_camino = v_mov.entrada,
         -- Enviar es autorizar que salga: por defecto con su firma, si la tiene.
         firma_de_quien_envia = coalesce(p_con_firma, true) and private.tengo_firma_encendida()
   where id = p_id;$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En aceptar_traslado el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  drop function public.aceptar_traslado(bigint);
  execute v_def;

  -- recibir_traslado: quien confirma la llegada dice si firma; por defecto no.
  v_def := pg_get_functiondef('public.recibir_traslado(bigint)'::regprocedure);
  for r in
    select * from (values
      (1,
       $a$recibir_traslado(p_id bigint)
 RETURNS bigint$a$,
       $b$recibir_traslado(p_id bigint, p_con_firma boolean DEFAULT false)
 RETURNS bigint$b$),
      (2,
       $a$         recibido_de_respaldo = (v_como = 'RESPALDO'),
         mov_llegada = v_mov.entrada
   where id = p_id;$a$,
       $b$         recibido_de_respaldo = (v_como = 'RESPALDO'),
         mov_llegada = v_mov.entrada,
         firma_de_quien_recibe = coalesce(p_con_firma, false) and private.tengo_firma_encendida()
   where id = p_id;$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En recibir_traslado el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  drop function public.recibir_traslado(bigint);
  execute v_def;

  -- solicitar_traslado: enviar y directo actúan al nacer, y pasan la elección.
  v_def := pg_get_functiondef('public.solicitar_traslado(bigint, bigint, bigint, numeric, text, date, numeric, text, numeric, text, boolean, boolean)'::regprocedure);
  for r in
    select * from (values
      (1,
       $a$p_enviar boolean DEFAULT false)
 RETURNS bigint$a$,
       $b$p_enviar boolean DEFAULT false, p_con_firma boolean DEFAULT true)
 RETURNS bigint$b$),
      (2,
       $a$           recibido_de_respaldo = (v_en_destino = 'RESPALDO'),
           mov_salida = v_mov.salida, mov_llegada = v_mov.entrada
     where id = v_id;$a$,
       $b$           recibido_de_respaldo = (v_en_destino = 'RESPALDO'),
           mov_salida = v_mov.salida, mov_llegada = v_mov.entrada,
           -- Una persona, un paso: su elección vale para las dos rayas.
           firma_de_quien_envia  = coalesce(p_con_firma, true) and private.tengo_firma_encendida(),
           firma_de_quien_recibe = coalesce(p_con_firma, true) and private.tengo_firma_encendida()
     where id = v_id;$b$),
      (3,
       $a$    perform public.aceptar_traslado(v_id);$a$,
       $b$    perform public.aceptar_traslado(v_id, p_con_firma);$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En solicitar_traslado el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  drop function public.solicitar_traslado(bigint, bigint, bigint, numeric, text, date, numeric, text, numeric, text, boolean, boolean);
  execute v_def;
end
$parche$;

revoke all on function public.aceptar_traslado(bigint, boolean) from public, anon;
grant execute on function public.aceptar_traslado(bigint, boolean) to authenticated, service_role;
revoke all on function public.recibir_traslado(bigint, boolean) from public, anon;
grant execute on function public.recibir_traslado(bigint, boolean) to authenticated, service_role;
revoke all on function public.solicitar_traslado(bigint, bigint, bigint, numeric, text, date, numeric, text, numeric, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.solicitar_traslado(bigint, bigint, bigint, numeric, text, date, numeric, text, numeric, text, boolean, boolean, boolean) to authenticated, service_role;

do $ver$
begin
  if position('firma_de_quien_envia' in pg_get_functiondef('public.aceptar_traslado(bigint, boolean)'::regprocedure)) = 0 then
    raise exception 'aceptar_traslado no guarda la firma de quien envía';
  end if;
  if position('firma_de_quien_recibe' in pg_get_functiondef('public.recibir_traslado(bigint, boolean)'::regprocedure)) = 0 then
    raise exception 'recibir_traslado no guarda la firma de quien recibe';
  end if;
  if position('aceptar_traslado(v_id, p_con_firma)' in pg_get_functiondef('public.solicitar_traslado(bigint, bigint, bigint, numeric, text, date, numeric, text, numeric, text, boolean, boolean, boolean)'::regprocedure)) = 0 then
    raise exception 'solicitar_traslado no pasa la firma al enviar';
  end if;
end
$ver$;
