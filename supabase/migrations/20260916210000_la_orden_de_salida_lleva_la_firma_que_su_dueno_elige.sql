/*
  LA ORDEN DE SALIDA LLEVA LA FIRMA QUE SU DUEÑO ELIGE

  Christopher, 16/09/2026, con una nota de salida delante: la orden tiene que
  decir la fecha de la orden, la de entrega, el estado y quién autorizó. «La
  persona que creó la orden es quien solicita (su nombre debe aparecer en el
  lugar de firma; si el usuario tiene firma, ofrecer la opción de usar esa firma
  digital; si indica que no o no tiene, sale en blanco); la persona que acepta o
  autoriza el movimiento sale en Autorizado por (mismo caso)». Y: «todo pdf
  creado por defecto debe salir como mínimo la firma de quien autoriza».

  Preguntado quién decide si una firma va en el papel, eligió que SU DUEÑO, AL
  ACTUAR: quien solicita lo dice al solicitar, y quien autoriza, al aprobar. Así
  nadie que imprime estampa la firma de otro.

  - `solicitudes_salida.firma_de_quien_pide` y `firma_de_quien_aprueba` guardan
    esa decisión. Nula es «no se preguntó» —la orden es de antes de esto— y el
    papel aplica lo de por defecto: la de quien autoriza sí, la de quien pide no.
  - `pedir_salida` recibe `p_con_firma` (por defecto no) y
    `aprobar_solicitud_salida` también (por defecto sí). Se guarda lo que de
    verdad se puede estampar: si la persona no tiene una firma encendida en ese
    momento, queda en falso, porque decir que sí a una firma que no existe no
    pone nada en el papel.

  La firma que se estampa es la guardada en `firmas` y encendida por su dueño
  (`usar`): si la apaga después, los papeles salen con la raya en blanco, como
  ya pasaba en compras.
*/

alter table public.solicitudes_salida
  add column firma_de_quien_pide    boolean,
  add column firma_de_quien_aprueba boolean;

comment on column public.solicitudes_salida.firma_de_quien_pide is
  'Si quien solicitó eligió poner su firma digital en la orden. Nula: la orden es de antes de preguntarlo, y va sin su firma.';
comment on column public.solicitudes_salida.firma_de_quien_aprueba is
  'Si quien aprobó eligió poner su firma digital en la orden. Nula: la orden es de antes de preguntarlo, y va con su firma si la tiene encendida.';

create function private.tengo_firma_encendida()
returns boolean
language sql
stable
security definer
set search_path to ''
as $func$
  -- Una firma propia, guardada y encendida por su dueño: la única que se estampa.
  select exists (select 1 from public.firmas f
                  where f.perfil_id = (select auth.uid()) and f.usar);
$func$;

revoke all on function private.tengo_firma_encendida() from public, anon;

do $parche$
declare
  v_def text;
  v_n   integer;
  r     record;
begin
  -- pedir_salida: quien solicita dice si firma.
  v_def := pg_get_functiondef('public.pedir_salida(bigint, jsonb, text, bigint, text, text)'::regprocedure);
  for r in
    select * from (values
      (1,
       $a$p_responsable text DEFAULT NULL::text)
 RETURNS text$a$,
       $b$p_responsable text DEFAULT NULL::text, p_con_firma boolean DEFAULT false)
 RETURNS text$b$),
      (2,
       $a$    (numero, almacen_id, clase, motivo, grupo_id, destino_externo, responsable_externo, pedida_por)
  values
    (v_numero, p_almacen_id, 'ENTREGA_POR_SOLICITUD', v_motivo, p_grupo_id,
     nullif(btrim(coalesce(p_externo, '')), ''), nullif(btrim(coalesce(p_responsable, '')), ''),
     (select auth.uid()))$a$,
       $b$    (numero, almacen_id, clase, motivo, grupo_id, destino_externo, responsable_externo, pedida_por,
     firma_de_quien_pide)
  values
    (v_numero, p_almacen_id, 'ENTREGA_POR_SOLICITUD', v_motivo, p_grupo_id,
     nullif(btrim(coalesce(p_externo, '')), ''), nullif(btrim(coalesce(p_responsable, '')), ''),
     (select auth.uid()),
     -- Lo que se puede estampar de verdad: sin firma encendida, no hay nada.
     coalesce(p_con_firma, false) and private.tengo_firma_encendida())$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En pedir_salida el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  drop function public.pedir_salida(bigint, jsonb, text, bigint, text, text);
  execute v_def;

  -- aprobar_solicitud_salida: quien autoriza dice si firma; por defecto sí.
  v_def := pg_get_functiondef('public.aprobar_solicitud_salida(bigint)'::regprocedure);
  for r in
    select * from (values
      (1,
       $a$aprobar_solicitud_salida(p_id bigint)
 RETURNS bigint$a$,
       $b$aprobar_solicitud_salida(p_id bigint, p_con_firma boolean DEFAULT true)
 RETURNS bigint$b$),
      (2,
       $a$         aprobada_de_respaldo = (v_como = 'RESPALDO')
   where id = p_id;$a$,
       $b$         aprobada_de_respaldo = (v_como = 'RESPALDO'),
         -- «Todo papel, como mínimo, con la firma de quien autoriza»: por
         -- defecto sí, si tiene una encendida.
         firma_de_quien_aprueba = coalesce(p_con_firma, true) and private.tengo_firma_encendida()
   where id = p_id;$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En aprobar_solicitud_salida el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  drop function public.aprobar_solicitud_salida(bigint);
  execute v_def;
end
$parche$;

revoke all on function public.pedir_salida(bigint, jsonb, text, bigint, text, text, boolean) from public, anon;
grant execute on function public.pedir_salida(bigint, jsonb, text, bigint, text, text, boolean) to authenticated, service_role;
revoke all on function public.aprobar_solicitud_salida(bigint, boolean) from public, anon;
grant execute on function public.aprobar_solicitud_salida(bigint, boolean) to authenticated, service_role;

do $ver$
begin
  if position('firma_de_quien_pide' in pg_get_functiondef('public.pedir_salida(bigint, jsonb, text, bigint, text, text, boolean)'::regprocedure)) = 0 then
    raise exception 'pedir_salida no guarda la firma de quien pide';
  end if;
  if position('firma_de_quien_aprueba' in pg_get_functiondef('public.aprobar_solicitud_salida(bigint, boolean)'::regprocedure)) = 0 then
    raise exception 'aprobar_solicitud_salida no guarda la firma de quien aprueba';
  end if;
  -- Lo que construyó la restricción de aprobar sigue en su sitio.
  if position('accion_restringida' in pg_get_functiondef('public.aprobar_solicitud_salida(bigint, boolean)'::regprocedure)) = 0 then
    raise exception 'aprobar_solicitud_salida perdió la restricción';
  end if;
end
$ver$;
