/*
  EL TRASLADO SE PIDE, SE ENVÍA O ES DIRECTO — Y LO DICE

  Christopher, 16/09/2026, mirando «Nuevo traslado»: «No se entiende: si hago
  una solicitud, ¿es para pedir material? ¿No puedo hacer una solicitud para
  entregar material? Necesitamos no dejar asumir al usuario, mantener lo
  explícito como norma».

  Tenía razón en lo que no se veía. El traslado solo sabía nacer PEDIDO, y quien
  respondía por el almacén de origen y quería mandar material tenía que pedírselo
  a sí mismo y luego aceptárselo. La ventana lo llamaba «Pedir traslado» aunque
  quien lo pulsara fuera el que lo estaba mandando.

  LAS TRES FORMAS, ELEGIDAS DELANTE

    PEDIR ....... queda pedido. Lo aprueba y envía quien responde por el origen;
                  quien responde por el destino confirma que llegó.
    ENVIAR ...... sale ya del origen y queda «En camino». Solo quien responde por
                  el origen, o administración. El destino confirma que llegó.
    DIRECTO ..... sale y llega en el mismo instante (lo que antes era la casilla
                  «Hacerlo ya»). Quien responde por los dos sitios, o
                  administración.

  Enviar NO es otro camino por dentro: es pedir y aprobar en la misma
  transacción, llamando a `aceptar_traslado`. Así las reglas de salir —el sitio
  «En camino», el costo que viaja, el aviso al destino— quedan escritas una sola
  vez, y el aviso de «piden mover» no sale, porque nadie pidió nada.

  `enviado` queda en la fila para que la lista diga «Enviado por» y no
  «Pedido por… aceptado por» la misma persona en el mismo segundo. No hay
  traslados en producción al escribir esto, así que el `default false` no le
  pone a nada una etiqueta que no le toca.

  Y el vocabulario se alinea con la pantalla: lo que era «aceptar» se dice
  «aprobar y enviar», y «recibir», «confirmar que llegó». Los errores de la base
  son lo que el usuario lee cuando algo no cuadra, y no pueden hablar de otra
  manera que el botón que acaba de pulsar.
*/

alter table public.traslados
  add column if not exists enviado boolean not null default false;

comment on column public.traslados.enviado is
  'Nació enviado: quien responde por el origen lo despachó al crearlo, sin que nadie lo pidiera antes.';

alter table public.traslados
  drop constraint if exists traslado_enviado_o_directo;
alter table public.traslados
  add constraint traslado_enviado_o_directo check (not (enviado and inmediato));

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
    t.enviado
   FROM traslados t
     LEFT JOIN almacenes o ON o.id = t.origen_id
     LEFT JOIN almacenes d ON d.id = t.destino_id
     LEFT JOIN articulos a ON a.id = t.articulo_id
     LEFT JOIN perfiles ps ON ps.id = t.solicitado_por
     LEFT JOIN perfiles pa ON pa.id = t.aceptado_por
     LEFT JOIN perfiles pr ON pr.id = t.recibido_por
     LEFT JOIN perfiles pc ON pc.id = t.cancelado_por;

-- ---------------------------------------------------------------------------
-- solicitar_traslado gana `p_enviar`. Cambia la firma: se borra la de once.
-- ---------------------------------------------------------------------------

drop function if exists public.solicitar_traslado(bigint, bigint, bigint, numeric, text, date, numeric, text, numeric, text, boolean);

create or replace function public.solicitar_traslado(
  p_origen_id bigint,
  p_destino_id bigint,
  p_articulo_id bigint,
  p_cantidad numeric,
  p_motivo text,
  p_fecha date default null,
  p_presentaciones numeric default null,
  p_presentacion text default null,
  p_suelto numeric default null,
  p_propietario text default null,
  p_inmediato boolean default false,
  p_enviar boolean default false
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_origen     public.almacenes;
  v_destino    public.almacenes;
  v_articulo   public.articulos;
  v_cantidad   numeric;
  v_pres       text;
  v_dueno      text;
  v_duenos     text[];
  v_hay        numeric;
  v_fecha      date;
  v_numero     text;
  v_id         bigint;
  v_en_origen  text;
  v_en_destino text;
  v_mov        record;
  v_motivo     text := btrim(coalesce(p_motivo, ''));
begin
  perform private.exigir_permiso('SALIDAS', 'ESCRITURA');

  if coalesce(p_inmediato, false) and coalesce(p_enviar, false) then
    raise exception 'Un traslado se envía o es directo, no las dos cosas.' using errcode = '22023';
  end if;

  if p_origen_id = p_destino_id then
    raise exception 'El origen y el destino son el mismo almacén.' using errcode = '22023';
  end if;

  select * into v_origen  from public.almacenes where id = p_origen_id;
  select * into v_destino from public.almacenes where id = p_destino_id;

  if v_origen.id is null then
    raise exception 'No existe el almacén de origen %.', p_origen_id using errcode = 'P0002';
  end if;
  if v_destino.id is null then
    raise exception 'No existe el almacén de destino %.', p_destino_id using errcode = 'P0002';
  end if;
  if 'TRANSITO' in (v_origen.tipo, v_destino.tipo) then
    raise exception '«En camino» no se elige: es donde espera lo que ya salió y todavía no llegó.'
      using errcode = '22023';
  end if;
  if not v_destino.activo then
    raise exception 'El almacén "%" está inactivo y no puede recibir material.', v_destino.nombre
      using errcode = '22023';
  end if;

  select * into v_articulo from public.articulos where id = p_articulo_id;
  if v_articulo.id is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

  -- La cuenta en envases la hace el mismo ayudante que la entrada y la salida.
  if nullif(btrim(coalesce(p_presentacion, '')), '') is not null and coalesce(p_presentaciones, 0) > 0 then
    v_cantidad := private.en_unidad_base(p_articulo_id, p_presentaciones, coalesce(p_suelto, 0), p_presentacion);
    v_pres := upper(btrim(p_presentacion));
  else
    v_cantidad := p_cantidad;
  end if;

  if coalesce(v_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.' using errcode = '22023';
  end if;
  if length(v_motivo) < 4 then
    raise exception 'Escribe por qué se mueve. Un traslado sin motivo no se puede auditar.'
      using errcode = '22023';
  end if;

  v_fecha := coalesce(p_fecha, private.hoy_aqui());
  if v_fecha > private.hoy_aqui() then
    raise exception 'La fecha del traslado no puede ser del futuro.' using errcode = '22023';
  end if;

  -- Las dos rejas del tanque sin costo, las mismas que en el traslado directo.
  if coalesce(v_origen.admite_sin_costo, false) and not coalesce(v_destino.admite_sin_costo, false) then
    raise exception 'De "%" no se puede trasladar a "%": lo que hay ahí entró sin costo y hundiría el costo promedio del destino.',
      v_origen.nombre, v_destino.nombre using errcode = '22023';
  end if;
  if not coalesce(v_origen.admite_sin_costo, false) and coalesce(v_destino.admite_sin_costo, false) then
    raise exception 'A "%" solo entra lo que no costó nada, y lo que sale de "%" tiene precio.',
      v_destino.nombre, v_origen.nombre using errcode = '22023';
  end if;
  -- Y una más: por «En camino» se mezclaría con material que sí costó.
  if coalesce(v_origen.admite_sin_costo, false) and not coalesce(p_inmediato, false) then
    raise exception 'Lo que hay en "%" entró sin costo: solo se traslada directo, sin pasar por «En camino».',
      v_origen.nombre
      using errcode = '22023',
            hint = 'Elige «Traslado directo». En «En camino» se mezclaría con material que sí costó.';
  end if;

  -- De quién es lo que se mueve: con un solo dueño en el origen no se pregunta.
  v_dueno := nullif(upper(btrim(coalesce(p_propietario, ''))), '');
  if v_dueno is null then
    select array_agg(distinct t.propietario) into v_duenos
      from (select m.propietario
              from public.inventario_movimientos m
             where m.almacen_id = p_origen_id and m.articulo_id = p_articulo_id
             group by m.propietario
            having sum(m.cantidad * m.signo) > 0) t;

    if coalesce(array_length(v_duenos, 1), 0) > 1 then
      raise exception 'En "%" hay material de varios dueños (%): hay que decir de cual se traslada.',
        v_origen.nombre, array_to_string(v_duenos, ', ')
        using errcode = '22023';
    end if;
    v_dueno := coalesce(v_duenos[1], v_origen.propietario, 'LACANTERA');
  end if;

  v_hay := private.existencia_para_escribir(p_origen_id, p_articulo_id, v_dueno);
  if v_cantidad > v_hay then
    raise exception 'En "%" solo hay % de "%" de ese dueño y se intentan mover %.',
      v_origen.nombre, private.numero_es(v_hay, 4), v_articulo.nombre, private.numero_es(v_cantidad, 4)
      using errcode = '22023';
  end if;

  v_en_origen  := private.como_actua_en(p_origen_id);
  v_en_destino := private.como_actua_en(p_destino_id);

  if coalesce(p_inmediato, false) and (v_en_origen is null or v_en_destino is null) then
    raise exception 'El traslado directo envía desde "%" y confirma la llegada a "%" a la vez: lo puede quien responde por los dos almacenes, o administración.',
      v_origen.nombre, v_destino.nombre
      using errcode = '42501',
            hint = 'Elige «Pedir» y que cada almacén haga su parte, o «Enviar» si respondes por el de origen.';
  end if;

  /*
    Se comprueba aquí y no se deja a `aceptar_traslado`: allí el error llegaría
    después de gastar un número de traslado, y diría «lo aprueba» a quien no
    estaba aprobando nada sino enviando.
  */
  if coalesce(p_enviar, false) and v_en_origen is null then
    raise exception 'Enviar desde "%" lo puede quien responde por ese almacén%, o administración.',
      v_origen.nombre, private.quien_responde_frase(p_origen_id)
      using errcode = '42501',
            hint = 'Si necesitas ese material en otro almacén, elige «Pedir».';
  end if;

  v_numero := private.siguiente_numero('TRA');

  insert into public.traslados
    (numero, inmediato, enviado, fecha, origen_id, destino_id, articulo_id, cantidad,
     presentaciones, presentacion, suelto, propietario, motivo, solicitado_por)
  values
    (v_numero, coalesce(p_inmediato, false), coalesce(p_enviar, false), v_fecha,
     p_origen_id, p_destino_id, p_articulo_id, v_cantidad,
     case when v_pres is not null then p_presentaciones end, v_pres,
     case when v_pres is not null then nullif(p_suelto, 0) end,
     v_dueno, v_motivo, (select auth.uid()))
  returning id into v_id;

  if coalesce(p_inmediato, false) then
    select * into v_mov from private.mover_en_traslado(
      p_de => p_origen_id, p_a => p_destino_id, p_articulo => p_articulo_id,
      p_cantidad => v_cantidad, p_dueno => v_dueno,
      p_nota_sale  => format('Traslado %s a %s. %s', v_numero, v_destino.nombre, v_motivo),
      p_nota_entra => format('Traslado %s desde %s. %s', v_numero, v_origen.nombre, v_motivo),
      p_fecha => v_fecha,
      p_presentaciones => p_presentaciones, p_presentacion => v_pres, p_suelto => p_suelto);

    update public.traslados
       set estado = 'RECIBIDA',
           aceptado_por = (select auth.uid()), aceptado_en = now(),
           aceptado_de_respaldo = (v_en_origen = 'RESPALDO'),
           recibido_por = (select auth.uid()), recibido_en = now(),
           recibido_de_respaldo = (v_en_destino = 'RESPALDO'),
           mov_salida = v_mov.salida, mov_llegada = v_mov.entrada
     where id = v_id;
  elsif coalesce(p_enviar, false) then
    -- Sale por la misma puerta que un pedido aprobado, y avisa al destino ella.
    perform public.aceptar_traslado(v_id);
  else
    perform private.notificar(
      'INVENTARIO', 'TRASLADO_SOLICITADO',
      format('%s: piden mover %s a %s', v_numero, v_articulo.nombre, v_destino.nombre),
      format('%s %s desde %s. Lo aprueba y envía quien responde por %s.',
             private.numero_es(v_cantidad, 4), v_articulo.unidad, v_origen.nombre, v_origen.nombre),
      '/app/salidas/traslados', array['ALMACEN', 'GERENTE_GENERAL'], 'ATENCION');
  end if;

  return v_id;
end;
$function$;

revoke all on function public.solicitar_traslado(bigint, bigint, bigint, numeric, text, date, numeric, text, numeric, text, boolean, boolean) from public, anon;
grant execute on function public.solicitar_traslado(bigint, bigint, bigint, numeric, text, date, numeric, text, numeric, text, boolean, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- aceptar y recibir hablan como los botones: «aprobar y enviar», «confirmar
-- que llegó». Parche anclado: cada texto tiene que aparecer una sola vez.
-- ---------------------------------------------------------------------------

do $parche$
declare
  v_def   text;
  v_nuevo text;
  r       record;
begin
  for r in
    select * from (values
      ('public.aceptar_traslado(bigint)',
       'ya no espera que lo acepten',
       'ya no espera que lo envíen'),
      ('public.aceptar_traslado(bigint)',
       'lo acepta quien responde por',
       'lo aprueba y envía quien responde por'),
      ('public.aceptar_traslado(bigint)',
       'Lo recibe quien responde por %s.',
       'Confirma que llegó quien responde por %s.'),
      ('public.recibir_traslado(bigint)',
       'todavía nadie lo ha aceptado',
       'todavía no lo han enviado'),
      ('public.recibir_traslado(bigint)',
       '''El traslado % lo recibe quien responde por',
       '''La llegada del traslado % la confirma quien responde por')
    ) as t(funcion, antes, despues)
  loop
    v_def := pg_get_functiondef(r.funcion::regprocedure);
    if (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes) <> 1 then
      raise exception 'En % el texto «%» no aparece exactamente una vez.', r.funcion, r.antes;
    end if;
    v_nuevo := replace(v_def, r.antes, r.despues);
    execute v_nuevo;
  end loop;
end
$parche$;

do $ver$
declare
  v_def text;
begin
  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.v_traslados'::regclass and attname = 'enviado' and not attisdropped) then
    raise exception 'v_traslados no enseña enviado';
  end if;
  if to_regprocedure('public.solicitar_traslado(bigint, bigint, bigint, numeric, text, date, numeric, text, numeric, text, boolean)') is not null then
    raise exception 'sigue viva la firma vieja de solicitar_traslado';
  end if;
  if has_function_privilege('anon', 'public.solicitar_traslado(bigint, bigint, bigint, numeric, text, date, numeric, text, numeric, text, boolean, boolean)', 'execute') then
    raise exception 'solicitar_traslado lo puede llamar anon';
  end if;
  v_def := pg_get_functiondef('public.aceptar_traslado(bigint)'::regprocedure);
  if position('aprueba y envía' in v_def) = 0 or position('Confirma que llegó' in v_def) = 0 then
    raise exception 'aceptar_traslado no quedó con el texto nuevo';
  end if;
  v_def := pg_get_functiondef('public.recibir_traslado(bigint)'::regprocedure);
  if position('la confirma quien responde' in v_def) = 0 or position('no lo han enviado' in v_def) = 0 then
    raise exception 'recibir_traslado no quedó con el texto nuevo';
  end if;
end
$ver$;
