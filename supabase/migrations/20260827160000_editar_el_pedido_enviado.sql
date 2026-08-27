/*
  UN PEDIDO YA ENVIADO SE PUEDE CORREGIR.

  Lo pidió Jesmary: hoy, al equivocarse en un pedido que ya salió de borrador,
  la única salida es cancelarlo entero y volver a escribirlo. En un pedido de
  siete renglones eso es siete renglones vueltos a teclear por una unidad mal
  puesta, y el pedido pierde su número y su sitio en el historial.

  `actualizar_pedido` ya existía, pero solo en BORRADOR:

      if v_estado <> 'BORRADOR' then
        raise exception 'El pedido ya fue enviado y no se puede editar.
                         Cancélalo y crea otro.'

  Se abre a PEDIDO y a CONFIRMADA, que son los dos estados en los que el pedido
  todavía es de quien lo pidió y de compras. De POR_CONFIRMAR_GERENTE en
  adelante no: ahí el papel ya está en otra mesa, y cambiarlo por debajo es
  hacer que alguien apruebe algo distinto de lo que leyó.

  POR QUÉ SE PARA EN SECO SI YA HAY COTIZACIONES

  Esto no es prudencia: es que `cotizacion_renglones.solicitud_renglon_id`
  apunta a `solicitud_renglones` con ON DELETE CASCADE, y
  `private.escribir_renglones` no edita — borra todos los renglones del pedido y
  los vuelve a insertar con identificadores nuevos.

  Así que corregir la unidad de un renglón en un pedido ya cotizado se llevaría
  por delante los renglones de todas sus cotizaciones, sin un solo error: las
  cotizaciones quedarían vivas, con su número, en cero, y el disparador de
  totales lo dejaría cuadrado. Nadie se enteraría hasta comparar precios y ver
  que no hay ninguno.

  Por eso el corte es tajante y el mensaje dice qué hacer: quitar las
  cotizaciones primero. Es lo mismo que ya se le pide a quien corrige una
  cotización propuesta — el dato de después manda sobre el de antes, y para
  cambiar lo de antes hay que retirar lo de después.
*/

create or replace function public.actualizar_pedido(
  p_id                 bigint,
  p_titulo             text,
  p_justificacion      text,
  p_renglones          jsonb,
  p_prioridad          text default 'NORMAL',
  p_requerida_para     date default null,
  p_destino            text default null,
  p_solicitante_id     uuid default null,
  p_solicitante_nombre text default null,
  p_solicitante_cargo  text default null,
  p_destino_almacen_id bigint default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_estado  text;
  v_dueno   uuid;
  v_sol     record;
  v_destino text := nullif(trim(coalesce(p_destino, '')), '');
  v_nombre  text;
  v_cotiza  integer;
begin
  select estado, registrada_por into v_estado, v_dueno
  from public.solicitudes_pedido where id = p_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_id using errcode = 'P0002';
  end if;

  if v_estado not in ('BORRADOR', 'PEDIDO', 'CONFIRMADA') then
    raise exception 'Este pedido está en "%" y ya no se corrige aquí. Si está con el gerente, retira lo propuesto; si ya se aprobó, la orden manda.', v_estado
      using errcode = '55000';
  end if;

  if v_dueno <> (select auth.uid()) and not private.tiene_rol('COMPRAS') then
    raise exception 'Solo quien creó el pedido puede corregirlo.' using errcode = '42501';
  end if;

  /*
    El freno de las cotizaciones. Va antes de tocar nada, porque el daño no lo
    haría este UPDATE sino el `escribir_renglones` del final, y para entonces
    ya sería tarde para avisar.
  */
  select count(*) into v_cotiza
  from public.cotizaciones where solicitud_id = p_id;

  if v_cotiza > 0 then
    raise exception 'Este pedido ya tiene % cotización(es) cargada(s), y están puestas sobre estos renglones: corregirlo ahora las dejaría vacías. Elimina las cotizaciones y vuelve a cargarlas después.', v_cotiza
      using errcode = '55000';
  end if;

  if p_destino_almacen_id is not null then
    select nombre into v_nombre from public.almacenes where id = p_destino_almacen_id;
    if v_nombre is null then
      raise exception 'No existe el almacén %.', p_destino_almacen_id using errcode = '23503';
    end if;
    v_destino := v_nombre;
  end if;

  select * into v_sol from private.normalizar_solicitante(
    coalesce(p_solicitante_id,
             case when nullif(trim(coalesce(p_solicitante_nombre, '')), '') is null
                  then v_dueno end),
    p_solicitante_nombre, p_solicitante_cargo);

  update public.solicitudes_pedido set
    titulo = trim(p_titulo),
    justificacion = trim(p_justificacion),
    prioridad = coalesce(p_prioridad, 'NORMAL'),
    requerida_para = p_requerida_para,
    destino = v_destino,
    destino_almacen_id = p_destino_almacen_id,
    solicitante_id = v_sol.o_id,
    solicitante_nombre = v_sol.o_nombre,
    solicitante_cargo = v_sol.o_cargo
  where id = p_id;

  perform private.escribir_renglones(p_id, p_renglones);

  /*
    Corregir un borrador no se anota: el borrador es un papel en sucio y su
    historial sería una lista de tecleos. Uno ya enviado sí, porque alguien lo
    leyó antes de que cambiara.
  */
  if v_estado <> 'BORRADOR' then
    perform private.anotar('SOLICITUD', p_id, v_estado, v_estado, 'Se corrigió el pedido');
  end if;
end;
$function$;

/*
  COMPROBAR DESPUÉS DE APLICARLA

    -- Una sola, y anon fuera
    select p.oid::regprocedure::text,
           has_function_privilege('anon', p.oid, 'execute') as la_tiene_anon
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'actualizar_pedido';

    -- Un pedido confirmado con cotizaciones se niega, y lo dice
    -- (SOL-2026-0002 tiene dos cargadas)
    select public.actualizar_pedido(52, 'PRUEBA', 'PRUEBA', '[]'::jsonb);
*/
