/*
  LO QUE SALE DE LA PLANTA SE ANOTA CAMIÓN POR CAMIÓN.

  Quien lleva la planta, 14/09/2026: el reparto interno «es casi imposible de
  calcular […] a ojo». De la mina llega el 100 % a planta fija; ahí se separa
  coraza, filtro y arena; solo la arena va a lavado, pierde alrededor de un
  10 %, y de lavado salen cuatro productos en porcentajes que cambian por
  camión. Lo que sí se mide es lo que sale: «el camión se va a llevar tantos
  metros cúbicos de arena lavada […] 15, se estiman por 14».

  Es el denominador del costo por m³ —lo que GT hace con los kilos que salen
  de planta— y va SEPARADO de facturación: la salida no espera a la factura.
  Cuando Despachos se use, `despachar()` creará la salida con su
  `nota_entrega_id` y este formulario quedará para lo que sale sin cliente:
  traslados, muestras, coraza a base.

  Los m³ son la carga útil del camión salvo que se tecleen. Es un ESTIMADO y
  así se rotula en la pantalla, en la tarjeta y en la foto del cierre.

  Quinta pieza de siete. La tabla ya existía en esqueleto desde la tercera;
  aquí llegan sus puertas, su lente, sus casillas y la lista de productos.
*/

create table if not exists public.salidas_planta (
  id              bigint generated always as identity primary key,
  numero          text unique,
  fecha           date not null,
  vehiculo_id     bigint not null references public.vehiculos(id),
  producto_id     bigint not null references public.articulos(id),
  m3              numeric(12,2) check (m3 is null or m3 > 0),
  cliente_id      bigint references public.clientes(id),
  nota_entrega_id bigint references public.notas_entrega(id),
  nota            text,
  estado          text not null default 'REGISTRADO' check (estado in ('REGISTRADO', 'ANULADO')),
  motivo_anulacion text,
  anulado_por     uuid references auth.users(id),
  anulado_en      timestamptz,
  registrado_por  uuid references auth.users(id),
  registrado_en   timestamptz not null default now(),
  constraint salida_anulada_con_motivo check ((estado = 'ANULADO') = (motivo_anulacion is not null))
);

comment on table public.salidas_planta is
  'Un camion que sale de la planta con un producto. m3 es la carga util del '
  'camion salvo que se teclee otra cosa: es estimado y asi se rotula. Es el '
  'denominador del costo por m3, separado de facturacion.';

comment on column public.salidas_planta.nota_entrega_id is
  'Cuando Despachos se use, la salida nacera del despacho y apuntara aqui. '
  'Hasta entonces va en blanco.';

create index if not exists salidas_planta_fecha on public.salidas_planta (fecha desc, vehiculo_id);

alter table public.salidas_planta enable row level security;

drop policy if exists salidas_planta_lectura on public.salidas_planta;
create policy salidas_planta_lectura on public.salidas_planta
  for select to authenticated
  using (private.tiene_permiso('EXPLOTACION', 'LECTURA') or private.tiene_permiso('COSTOS', 'LECTURA'));

revoke all on public.salidas_planta from anon, authenticated;
grant select on public.salidas_planta to authenticated;

drop trigger if exists trg_auditar on public.salidas_planta;
create trigger trg_auditar after insert or update or delete on public.salidas_planta
  for each row execute function private.auditar('id');

drop trigger if exists trg_normalizar on public.salidas_planta;
create trigger trg_normalizar before insert or update on public.salidas_planta
  for each row execute function private.normalizar_texto('nota', 'motivo_anulacion');

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    raise notice 'auditoria_modulos todavia no existe en esta base: el mapa de modulo se salta.';
    return;
  end if;
  insert into public.auditoria_modulos (tabla, modulo) values ('salidas_planta', 'EXPLOTACION')
  on conflict (tabla) do update set modulo = excluded.modulo;
end
$mapa$;

-- ---------------------------------------------------------------------------
-- Las dos casillas
-- ---------------------------------------------------------------------------
insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente) values
  ('EXPLOTACION.REGISTRAR_SALIDAS', 'EXPLOTACION',
   'Anotar lo que sale de la planta',
   'Camion, producto y metros cubicos. Los m3 salen de la carga util del '
   'camion salvo que se tecleen. Es el denominador del costo por m3.',
   110, 'ESCRITURA'),
  ('EXPLOTACION.ANULAR_SALIDA', 'EXPLOTACION',
   'Anular una salida de planta',
   'Deja una salida sin efecto, con motivo. Si ya entro al centro de costo, '
   'alli aparece para reversarla.',
   120, 'TOTAL')
on conflict (codigo) do update
  set modulo = excluded.modulo,
      nombre = excluded.nombre,
      dice = excluded.dice,
      orden = excluded.orden,
      nivel_equivalente = excluded.nivel_equivalente;

-- ---------------------------------------------------------------------------
-- Las puertas: los mismos tres guardas que ya tiene `registrar_acarreos`
-- (camión activo, producto activo, m³ nulo permitido y nunca cero).
-- ---------------------------------------------------------------------------
create or replace function public.registrar_salida_planta(
  p_fecha       date,
  p_vehiculo_id bigint,
  p_producto_id bigint,
  p_m3          numeric default null,
  p_cliente_id  bigint default null,
  p_nota        text default null
) returns bigint
language plpgsql security definer set search_path to ''
as $$
declare v_veh record; v_prod record; v_m3 numeric; v_id bigint;
begin
  perform private.exigir_accion('EXPLOTACION.REGISTRAR_SALIDAS');

  if p_fecha is null or p_fecha > private.hoy_aqui() then
    raise exception 'La fecha no puede ir en blanco ni ser del futuro.' using errcode = '22023';
  end if;

  select v.id, v.placa, v.activo, v.capacidad_m3, v.carga_util_m3
    into v_veh
    from public.vehiculos v where v.id = p_vehiculo_id;

  if v_veh.id is null then
    raise exception 'Ese vehiculo no existe.' using errcode = 'P0002';
  end if;

  if not v_veh.activo then
    raise exception 'El camion % esta dado de baja.', v_veh.placa
      using errcode = '55000',
            hint = 'Si volvio a la flota, reactivalo en Vehiculos antes de anotarle salidas.';
  end if;

  select a.id, a.nombre, a.activo, a.categoria
    into v_prod
    from public.articulos a where a.id = p_producto_id;

  if v_prod.id is null or v_prod.categoria <> 'PRODUCTO' then
    raise exception 'Ese producto no existe o no es un producto de la planta.' using errcode = 'P0002';
  end if;

  -- Se comprueba en la base y no solo en el combo: esconderlo en el navegador
  -- no lo esconde de verdad.
  if not v_prod.activo then
    raise exception 'El producto % esta apagado.', v_prod.nombre using errcode = '55000';
  end if;

  -- La carga útil del camión, salvo que se diga otra cosa. Nula si no se sabe:
  -- un cero diría que el camión salió vacío.
  v_m3 := coalesce(p_m3, v_veh.carga_util_m3);

  if v_m3 is not null and v_m3 <= 0 then
    raise exception 'Los metros cubicos tienen que ser mayores que cero, o quedar en blanco.'
      using errcode = '22023';
  end if;

  if v_m3 is not null and v_m3 > v_veh.capacidad_m3 then
    raise exception 'El camion % no carga %, le caben %.', v_veh.placa, v_m3, v_veh.capacidad_m3
      using errcode = '22023';
  end if;

  if p_cliente_id is not null
     and not exists (select 1 from public.clientes c where c.id = p_cliente_id) then
    raise exception 'Ese cliente no existe.' using errcode = 'P0002';
  end if;

  insert into public.salidas_planta
    (numero, fecha, vehiculo_id, producto_id, m3, cliente_id, nota, registrado_por)
  values
    (private.siguiente_numero('SAL'), p_fecha, p_vehiculo_id, p_producto_id, v_m3, p_cliente_id,
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.registrar_salida_planta(date, bigint, bigint, numeric, bigint, text) is
  'Anota un camion que sale de la planta con un producto. Los m3 son la carga '
  'util del camion salvo que se tecleen; nulos si no se saben.';

create or replace function public.anular_salida_planta(p_id bigint, p_motivo text)
returns void
language plpgsql security definer set search_path to ''
as $$
declare v_estado text;
begin
  perform private.exigir_accion('EXPLOTACION.ANULAR_SALIDA');

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Hay que decir por que se anula.'
      using errcode = '22023',
            hint = 'Queda en el registro con tu nombre y la hora.';
  end if;

  select estado into v_estado from public.salidas_planta where id = p_id for update;

  if v_estado is null then
    raise exception 'Esa salida no existe.' using errcode = 'P0002';
  end if;

  if v_estado = 'ANULADO' then
    raise exception 'Esa salida ya estaba anulada.' using errcode = '55000';
  end if;

  update public.salidas_planta
     set estado           = 'ANULADO',
         motivo_anulacion = btrim(p_motivo),
         anulado_por      = (select auth.uid()),
         anulado_en       = now()
   where id = p_id;
end;
$$;

-- La lista de productos para el combo. Va por función y no leyendo
-- `articulos` porque quien anota en planta no tiene por qué tener Inventario.
create or replace function public.productos_de_planta()
returns table (id bigint, codigo text, nombre text)
language plpgsql security definer set search_path to ''
as $$
begin
  perform private.exigir_permiso('EXPLOTACION', 'LECTURA');
  return query
  select a.id, a.codigo, a.nombre
    from public.articulos a
   where a.categoria = 'PRODUCTO' and a.activo
   order by a.nombre;
end;
$$;

revoke execute on function public.registrar_salida_planta(date, bigint, bigint, numeric, bigint, text) from public, anon;
grant  execute on function public.registrar_salida_planta(date, bigint, bigint, numeric, bigint, text) to authenticated;
revoke execute on function public.anular_salida_planta(bigint, text) from public, anon;
grant  execute on function public.anular_salida_planta(bigint, text) to authenticated;
revoke execute on function public.productos_de_planta() from public, anon;
grant  execute on function public.productos_de_planta() to authenticated;

-- ---------------------------------------------------------------------------
-- La lente
-- ---------------------------------------------------------------------------
create or replace view public.v_salidas_planta
with (security_invoker = on) as
select
  s.id, s.numero, s.fecha,
  s.vehiculo_id, v.placa, v.transportista, v.propio,
  s.producto_id, a.nombre as producto,
  s.m3,
  s.cliente_id, cl.nombre as cliente,
  s.nota_entrega_id, s.nota,
  s.estado, s.motivo_anulacion,
  s.registrado_en,
  p.nombre as registrado_por_nombre
from public.salidas_planta s
join public.vehiculos v on v.id = s.vehiculo_id
join public.articulos a on a.id = s.producto_id
left join public.clientes cl on cl.id = s.cliente_id
left join public.perfiles p on p.id = s.registrado_por;

grant select on public.v_salidas_planta to authenticated;
