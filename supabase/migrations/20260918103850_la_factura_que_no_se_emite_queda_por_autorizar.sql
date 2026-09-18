/*
  LA FACTURA QUE NO SE PUEDE EMITIR QUEDA POR AUTORIZAR.

  Christopher, 18/09/2026: «necesito un permiso restringido para que un usuario
  no pueda seguir con el proceso de facturación, pueda crear una factura pero
  hasta ahí, va a quedar pendiente para la autorización de quien pueda
  autorizarla».

  1. UNA CASILLA NUEVA, «Autorizar y emitir facturas». La trae por su nivel todo
     el que hoy factura (Facturación en escritura), así que con esta migración
     nadie gana ni pierde nada: se sigue emitiendo como ayer. Lo que cambia es
     que ahora se puede RESTRINGIR por persona, con el mecanismo de permisos
     restringidos del 16/09/2026, porque la base la pregunta por su nombre.

  2. A QUIEN SE LE RESTRINGE, su factura se guarda como «por autorizar» en una
     tabla aparte y no en `facturas_venta`. Es a propósito: una factura por
     autorizar no gasta número ni número de control, no descuenta el patio, no
     entra al libro de ventas ni deja a nadie debiendo. Ninguna de las ocho
     vistas que leen facturas tiene que aprender un estado nuevo, y la
     numeración fiscal no se agujerea si la rechazan.

  3. AUTORIZAR ES EMITIR. Quien tiene la casilla la autoriza y la base la emite
     en ese momento con las mismas funciones de siempre (`facturar_notas` o
     `facturar_directo`), con la fecha y la tasa de ese día, como si la hubiera
     emitido él. Quien la preparó queda anotado. Quien la preparó no la
     autoriza: si pudiera, no haría falta pedirlo.

  4. RECHAZAR Y RETIRAR. Quien autoriza puede rechazarla con motivo; quien la
     preparó puede retirarla. Ninguna de las dos borra nada.

  5. LAS NOTAS NO SE FACTURAN DOS VECES. Una nota de entrega que está en una
     factura por autorizar no entra en otra, ni por autorizar ni emitida.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. La casilla
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
values ('FACTURACION.AUTORIZAR_FACTURA', 'FACTURACION',
        'Autorizar y emitir facturas',
        'Emitir una factura, la propia o la que otro dejó por autorizar: gasta el número de control, descuenta el patio si el material sale con ella y la deja en el libro de ventas. La trae quien tiene Facturación en escritura. A quien se le restringe prepara facturas, pero quedan por autorizar hasta que alguien con esta casilla las emita o las rechace.',
        25, 'ESCRITURA', true)
on conflict (codigo) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Las facturas por autorizar
-- ═══════════════════════════════════════════════════════════════════════════

create table public.facturas_por_autorizar (
  id             bigint generated always as identity primary key,
  numero         text not null unique,
  origen         text not null,
  cliente_id     bigint not null references public.clientes(id),
  moneda         text not null,
  -- Lo que vio quien la preparó. La cifra buena la calcula la base al emitir,
  -- con la tasa de ese día.
  total_estimado numeric not null default 0,
  -- Los parámetros de facturar_notas o facturar_directo, tal cual.
  argumentos     jsonb not null,
  estado         text not null default 'POR_AUTORIZAR',
  preparada_por  uuid not null references public.perfiles(id),
  preparada_en   timestamptz not null default now(),
  decidida_por   uuid references public.perfiles(id),
  decidida_en    timestamptz,
  motivo         text,
  factura_id     bigint references public.facturas_venta(id),
  constraint facturas_por_autorizar_origen check (origen in ('NOTAS', 'DIRECTA')),
  constraint facturas_por_autorizar_estado
    check (estado in ('POR_AUTORIZAR', 'AUTORIZADA', 'RECHAZADA', 'RETIRADA')),
  constraint facturas_por_autorizar_total check (total_estimado >= 0),
  constraint facturas_por_autorizar_argumentos check (jsonb_typeof(argumentos) = 'object'),
  -- Que una AUTORIZADA tenga su factura lo garantiza `autorizar_factura` en la
  -- misma transacción: un check no puede esperar a que la factura exista.
  constraint facturas_por_autorizar_decidida
    check (estado = 'POR_AUTORIZAR' or (decidida_por is not null and decidida_en is not null)),
  constraint facturas_por_autorizar_rechazo_con_motivo
    check (estado not in ('RECHAZADA', 'RETIRADA') or length(btrim(coalesce(motivo, ''))) >= 5)
);

comment on table public.facturas_por_autorizar is
  'Facturas preparadas por quien no puede emitirlas. No gastan número de control ni tocan el patio ni el libro: son una petición. Al autorizarla se emite la factura de verdad y queda enlazada en factura_id.';

create index facturas_por_autorizar_pendientes on public.facturas_por_autorizar (preparada_en)
  where estado = 'POR_AUTORIZAR';

alter table public.facturas_por_autorizar enable row level security;

create policy facturas_por_autorizar_lectura on public.facturas_por_autorizar
  for select to authenticated using (private.tiene_permiso('FACTURACION', 'LECTURA'));

revoke all on public.facturas_por_autorizar from anon;
revoke insert, update, delete, truncate, references, trigger on public.facturas_por_autorizar from authenticated;
grant select on public.facturas_por_autorizar to authenticated;

create trigger trg_auditar after insert or delete or update on public.facturas_por_autorizar
  for each row execute function private.auditar('id');

create trigger trg_normalizar before insert or update on public.facturas_por_autorizar
  for each row execute function private.normalizar_texto('motivo');

do $mapa$
begin
  if not exists (select 1 from public.auditoria_modulos where tabla = 'facturas_por_autorizar') then
    insert into public.auditoria_modulos (tabla, modulo) values ('facturas_por_autorizar', 'FACTURACION');
  end if;
end
$mapa$;

-- Las notas que ya están en una factura por autorizar, sin contar una.
create function private.notas_por_autorizar(p_notas bigint[], p_salvo bigint default null)
returns text
language sql
stable
security definer
set search_path to ''
as $func$
  select string_agg(distinct s.numero, ', ')
    from public.facturas_por_autorizar s
    cross join lateral jsonb_array_elements_text(s.argumentos -> 'p_notas') x(nota)
   where s.estado = 'POR_AUTORIZAR'
     and s.origen = 'NOTAS'
     and s.id is distinct from p_salvo
     and x.nota::bigint = any(p_notas);
$func$;

revoke all on function private.notas_por_autorizar(bigint[], bigint) from public, anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Emitir pide la casilla, y las notas por autorizar no se facturan
-- ═══════════════════════════════════════════════════════════════════════════

do $parche$
declare
  v_def text;
  r     record;
begin
  for r in
    select * from (values
      ('public.facturar_notas(bigint[], text, date, text, numeric, numeric)',
       $a$  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');$a$,
       $b$  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  -- LA FACTURA QUE NO SE PUEDE EMITIR QUEDA POR AUTORIZAR (18/09/2026).
  if not private.puede_accion('FACTURACION.AUTORIZAR_FACTURA') then
    raise exception 'Tu usuario prepara facturas pero no las emite: envíala a autorizar.'
      using errcode = '42501',
            hint = 'En Facturación, «Enviar a autorizar». Quien tenga la casilla «Autorizar y emitir facturas» la emite.';
  end if;

  if private.notas_por_autorizar(p_notas) is not null then
    raise exception 'Alguna de esas notas está en una factura por autorizar (%): autorízala o recházala primero.',
      private.notas_por_autorizar(p_notas) using errcode = '55000';
  end if;$b$),

      ('public.facturar_directo(bigint, jsonb, text, text, date, text, numeric, numeric, boolean, bigint)',
       $a$  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');$a$,
       $b$  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  -- LA FACTURA QUE NO SE PUEDE EMITIR QUEDA POR AUTORIZAR (18/09/2026).
  if not private.puede_accion('FACTURACION.AUTORIZAR_FACTURA') then
    raise exception 'Tu usuario prepara facturas pero no las emite: envíala a autorizar.'
      using errcode = '42501',
            hint = 'En Facturación, «Enviar a autorizar». Quien tenga la casilla «Autorizar y emitir facturas» la emite.';
  end if;$b$)
    ) as t(funcion, antes, despues)
  loop
    v_def := pg_get_functiondef(r.funcion::regprocedure);
    if (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes) <> 1 then
      raise exception 'El cuerpo vivo de % no es el esperado: el anclaje no aparece una sola vez.',
        r.funcion using errcode = '22023';
    end if;
    execute replace(v_def, r.antes, r.despues);
  end loop;
end
$parche$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Preparar, autorizar, rechazar, retirar
-- ═══════════════════════════════════════════════════════════════════════════

create function public.enviar_factura_a_autorizar(
  p_origen         text,
  p_argumentos     jsonb,
  p_total_estimado numeric default 0
) returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
/*
  Guarda la factura que quien la prepara no puede emitir.

  Se comprueba lo que se puede comprobar sin emitir —que el cliente exista, que
  las notas estén despachadas, sin factura y en ninguna otra por autorizar—. Lo
  demás lo comprueba `facturar_*` al autorizar, con la tasa y el patio de ese
  día: comprobarlo hoy sería prometer algo que mañana puede no ser verdad.
*/
declare
  v_args    jsonb;
  v_notas   bigint[];
  v_resumen record;
  v_cliente record;
  v_id      bigint;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  if p_origen not in ('NOTAS', 'DIRECTA') then
    raise exception 'Una factura sale de notas de entrega o sin nota. Llegó %.', p_origen
      using errcode = '22023';
  end if;
  if p_argumentos is null or jsonb_typeof(p_argumentos) <> 'object' then
    raise exception 'Faltan los datos de la factura.' using errcode = '22023';
  end if;
  if coalesce(p_total_estimado, 0) < 0 then
    raise exception 'El total no puede ser negativo.' using errcode = '22023';
  end if;

  -- La fecha la pone el día en que se autorice: se guarda sin ella.
  v_args := p_argumentos - 'p_fecha';

  if p_origen = 'NOTAS' then
    if jsonb_typeof(v_args -> 'p_notas') <> 'array' or jsonb_array_length(v_args -> 'p_notas') = 0 then
      raise exception 'No hay notas de entrega que facturar.' using errcode = '22023';
    end if;
    select array_agg(distinct x::bigint) into v_notas
      from jsonb_array_elements_text(v_args -> 'p_notas') x;

    select count(*)                                   as cuantas,
           count(distinct n.cliente_id)               as clientes,
           count(distinct n.moneda)                   as monedas,
           min(n.cliente_id)                          as cliente_id,
           min(n.moneda)                              as moneda,
           count(*) filter (where n.estado <> 'DESPACHADA' or n.factura_id is not null) as ocupadas
      into v_resumen
      from public.notas_entrega n
     where n.id = any(v_notas);

    if v_resumen.cuantas <> array_length(v_notas, 1) then
      raise exception 'Alguna de las notas indicadas no existe.' using errcode = 'P0002';
    end if;
    if v_resumen.ocupadas > 0 then
      raise exception 'Alguna de las notas ya no está esperando factura.' using errcode = '55000';
    end if;
    if v_resumen.clientes > 1 or v_resumen.monedas > 1 then
      raise exception 'Una factura es de un solo cliente y en una sola moneda.' using errcode = '22023';
    end if;
    if private.notas_por_autorizar(v_notas) is not null then
      raise exception 'Alguna de esas notas ya está en una factura por autorizar (%).',
        private.notas_por_autorizar(v_notas) using errcode = '55000';
    end if;

    v_args := jsonb_set(v_args, '{p_notas}', to_jsonb(v_notas));
    select * into v_cliente from public.clientes where id = v_resumen.cliente_id;
    v_args := jsonb_set(v_args, '{_moneda}', to_jsonb(v_resumen.moneda));
  else
    select * into v_cliente from public.clientes where id = (v_args ->> 'p_cliente_id')::bigint;
    if v_cliente.id is null then
      raise exception 'No existe el cliente.' using errcode = 'P0002';
    end if;
    if not v_cliente.activo then
      raise exception 'El cliente "%" está inactivo.', v_cliente.nombre using errcode = '22023';
    end if;
    if jsonb_typeof(v_args -> 'p_renglones') <> 'array' or jsonb_array_length(v_args -> 'p_renglones') = 0 then
      raise exception 'Una factura sin renglones no dice nada. Agrega al menos uno.' using errcode = '22023';
    end if;
  end if;

  insert into public.facturas_por_autorizar
    (numero, origen, cliente_id, moneda, total_estimado, argumentos, preparada_por)
  values
    (private.siguiente_numero('PRE'), p_origen, v_cliente.id,
     coalesce(v_args ->> 'p_moneda', v_args ->> '_moneda', v_cliente.moneda_preferida, 'USD'),
     round(coalesce(p_total_estimado, 0), 2), v_args - '_moneda', (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$func$;

create function public.autorizar_factura(p_id bigint)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
/*
  Autorizar es emitir. Se llama a la misma función que habría usado quien la
  preparó, como quien autoriza y con la fecha de hoy: gasta el número de
  control, toma la tasa del día y, si el material sale con ella, lo descuenta.
  Si algo ya no cuadra —la nota se facturó por otro lado, el patio no alcanza,
  el crédito del cliente se pasó— no se emite nada y la petición sigue por
  autorizar, para rechazarla con el motivo.
*/
declare
  v_s       public.facturas_por_autorizar;
  v_a       jsonb;
  v_factura bigint;
begin
  perform private.exigir_accion('FACTURACION.AUTORIZAR_FACTURA');

  select * into v_s from public.facturas_por_autorizar where id = p_id for update;
  if v_s.id is null then
    raise exception 'No existe esa factura por autorizar.' using errcode = 'P0002';
  end if;
  if v_s.estado <> 'POR_AUTORIZAR' then
    raise exception 'La factura % ya no está por autorizar.', v_s.numero using errcode = '55000';
  end if;
  if v_s.preparada_por = (select auth.uid()) then
    raise exception 'Una factura no la autoriza quien la preparó.' using errcode = '42501';
  end if;

  -- Primero deja de estar por autorizar: así sus notas dejan de contar como
  -- ocupadas para la emisión que viene. Si la emisión falla, esto se deshace.
  update public.facturas_por_autorizar
     set estado = 'AUTORIZADA', decidida_por = (select auth.uid()), decidida_en = now(),
         factura_id = null
   where id = p_id;

  v_a := v_s.argumentos;

  if v_s.origen = 'NOTAS' then
    v_factura := public.facturar_notas(
      p_notas          => (select array_agg(x::bigint) from jsonb_array_elements_text(v_a -> 'p_notas') x),
      p_condicion_pago => v_a ->> 'p_condicion_pago',
      p_fecha          => null,
      p_observacion    => v_a ->> 'p_observacion',
      p_alicuota_iva   => (v_a ->> 'p_alicuota_iva')::numeric,
      p_alicuota_igtf  => (v_a ->> 'p_alicuota_igtf')::numeric);
  else
    v_factura := public.facturar_directo(
      p_cliente_id     => (v_a ->> 'p_cliente_id')::bigint,
      p_renglones      => v_a -> 'p_renglones',
      p_moneda         => v_a ->> 'p_moneda',
      p_condicion_pago => v_a ->> 'p_condicion_pago',
      p_fecha          => null,
      p_observacion    => v_a ->> 'p_observacion',
      p_alicuota_iva   => (v_a ->> 'p_alicuota_iva')::numeric,
      p_alicuota_igtf  => (v_a ->> 'p_alicuota_igtf')::numeric,
      p_saca_material  => (v_a ->> 'p_saca_material')::boolean,
      p_almacen_id     => (v_a ->> 'p_almacen_id')::bigint);
  end if;

  update public.facturas_por_autorizar set factura_id = v_factura where id = p_id;
  return v_factura;
end;
$func$;

create function public.rechazar_factura_por_autorizar(p_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_s public.facturas_por_autorizar;
begin
  perform private.exigir_accion('FACTURACION.AUTORIZAR_FACTURA');

  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Di por qué se rechaza: quien la preparó lo va a leer.' using errcode = '22023';
  end if;

  select * into v_s from public.facturas_por_autorizar where id = p_id for update;
  if v_s.id is null then
    raise exception 'No existe esa factura por autorizar.' using errcode = 'P0002';
  end if;
  if v_s.estado <> 'POR_AUTORIZAR' then
    raise exception 'La factura % ya no está por autorizar.', v_s.numero using errcode = '55000';
  end if;

  update public.facturas_por_autorizar
     set estado = 'RECHAZADA', decidida_por = (select auth.uid()), decidida_en = now(),
         motivo = btrim(p_motivo)
   where id = p_id;
end;
$func$;

create function public.retirar_factura_por_autorizar(p_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_s public.facturas_por_autorizar;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Di por qué se retira.' using errcode = '22023';
  end if;

  select * into v_s from public.facturas_por_autorizar where id = p_id for update;
  if v_s.id is null then
    raise exception 'No existe esa factura por autorizar.' using errcode = 'P0002';
  end if;
  if v_s.preparada_por <> (select auth.uid()) then
    raise exception 'Solo quien la preparó la retira. Quien autoriza la rechaza.' using errcode = '42501';
  end if;
  if v_s.estado <> 'POR_AUTORIZAR' then
    raise exception 'La factura % ya no está por autorizar.', v_s.numero using errcode = '55000';
  end if;

  update public.facturas_por_autorizar
     set estado = 'RETIRADA', decidida_por = (select auth.uid()), decidida_en = now(),
         motivo = btrim(p_motivo)
   where id = p_id;
end;
$func$;

revoke all on function public.enviar_factura_a_autorizar(text, jsonb, numeric) from public, anon;
revoke all on function public.autorizar_factura(bigint) from public, anon;
revoke all on function public.rechazar_factura_por_autorizar(bigint, text) from public, anon;
revoke all on function public.retirar_factura_por_autorizar(bigint, text) from public, anon;
grant execute on function public.enviar_factura_a_autorizar(text, jsonb, numeric) to authenticated;
grant execute on function public.autorizar_factura(bigint) to authenticated;
grant execute on function public.rechazar_factura_por_autorizar(bigint, text) to authenticated;
grant execute on function public.retirar_factura_por_autorizar(bigint, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Lo que se ve
-- ═══════════════════════════════════════════════════════════════════════════

create view public.v_facturas_por_autorizar with (security_invoker = on) as
select s.id, s.numero, s.origen, s.estado,
       s.cliente_id, c.nombre as cliente, c.rif as cliente_rif,
       s.moneda, s.total_estimado,
       case when s.origen = 'NOTAS'
            then (select string_agg(n.numero, ', ' order by n.numero)
                    from public.notas_entrega n
                   where n.id in (select x::bigint from jsonb_array_elements_text(s.argumentos -> 'p_notas') x))
       end as notas,
       case when s.origen = 'NOTAS'
            then jsonb_array_length(s.argumentos -> 'p_notas')
            else jsonb_array_length(coalesce(s.argumentos -> 'p_renglones', '[]'::jsonb))
       end as cuantos,
       s.argumentos ->> 'p_observacion' as observacion,
       s.preparada_por, coalesce(pp.nombre, pp.usuario) as preparada_por_nombre, s.preparada_en,
       s.decidida_por, coalesce(pd.nombre, pd.usuario) as decidida_por_nombre, s.decidida_en,
       s.motivo, s.factura_id, f.numero as factura_numero
  from public.facturas_por_autorizar s
  join public.clientes c on c.id = s.cliente_id
  left join public.perfiles pp on pp.id = s.preparada_por
  left join public.perfiles pd on pd.id = s.decidida_por
  left join public.facturas_venta f on f.id = s.factura_id;

revoke all on public.v_facturas_por_autorizar from anon;
grant select on public.v_facturas_por_autorizar to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Comprobado al aplicar
-- ═══════════════════════════════════════════════════════════════════════════

do $ver$
declare
  r record;
begin
  for r in select * from (values
      ('public.facturar_notas(bigint[], text, date, text, numeric, numeric)'),
      ('public.facturar_directo(bigint, jsonb, text, text, date, text, numeric, numeric, boolean, bigint)')
    ) as t(funcion)
  loop
    if strpos(pg_get_functiondef(r.funcion::regprocedure), 'FACTURACION.AUTORIZAR_FACTURA') = 0 then
      raise exception '% no quedó pidiendo la casilla de autorizar.', r.funcion using errcode = '22023';
    end if;
  end loop;

  if strpos(pg_get_functiondef('public.facturar_notas(bigint[], text, date, text, numeric, numeric)'::regprocedure),
            'notas_por_autorizar') = 0 then
    raise exception 'facturar_notas no quedó mirando las notas por autorizar.' using errcode = '22023';
  end if;

  if not exists (select 1 from private.acciones_que_la_base_pregunta() a where a = 'FACTURACION.AUTORIZAR_FACTURA') then
    raise exception 'La casilla de autorizar no quedó entre las que se pueden restringir.' using errcode = '22023';
  end if;
end
$ver$;
