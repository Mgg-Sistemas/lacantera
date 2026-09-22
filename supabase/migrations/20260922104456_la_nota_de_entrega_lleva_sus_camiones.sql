-- LA NOTA DE ENTREGA LLEVA SUS CAMIONES, LOS QUE HAGAN FALTA
--
-- Quien despacha, 22/09/2026, sobre una nota de entrega nacida de una salida:
-- «me genera la nota de entrega sin información de los camiones, y necesito
-- que se pueda editar y subir la información de los camiones y los choferes,
-- para que la nota de entrega me salga con esa información». Y después:
-- «fueron 2 camiones, si se puede adjuntar la información de los 2 de una vez».
--
-- La nota de entrega tenía sitio para UN camión —vehiculo, chofer, cedula_chofer,
-- ticket_romana, en la propia fila— y el papel lo imprime en su recuadro. Un
-- convenio que sale en dos gandolas no cabía, y la que nace de una salida no
-- traía ninguno, porque la nota de salida no lleva camiones.
--
-- SE AÑADE UNA TABLA HIJA, NO OTRAS COLUMNAS: una fila por camión, en orden.
-- Las columnas de siempre se quedan y siguen valiendo para las notas que ya
-- las tienen; el papel imprime la tabla cuando hay filas y, si no, lo de
-- siempre. Nada de lo emitido cambia.
--
-- LO QUE SE GUARDA ES LA FOTO DEL MOMENTO. Placa, chofer y cédula se copian
-- como texto al guardar, además del enlace al catálogo: si mañana se corrige
-- el nombre de un chofer, la nota que ya se imprimió sigue diciendo lo que
-- decía. Es el mismo criterio que las columnas de siempre.

create table if not exists public.nota_entrega_camiones (
  id            bigint generated always as identity primary key,
  nota_id       bigint not null references public.notas_entrega(id) on delete cascade,
  orden         smallint not null default 1,
  vehiculo_id   bigint references public.vehiculos_de_despacho(id),
  chofer_id     bigint references public.choferes(id),
  vehiculo      text,
  chofer        text,
  cedula_chofer text,
  ticket        text,
  peso_neto     numeric(14,3) check (peso_neto is null or peso_neto >= 0),
  registrado_por uuid references auth.users(id),
  registrado_en  timestamptz not null default now(),
  -- Un camión sin placa ni chofer no dice nada: no se guarda.
  constraint nota_entrega_camion_dice_algo check (vehiculo is not null or chofer is not null)
);

comment on table public.nota_entrega_camiones is
  'Los camiones de una nota de entrega, uno por fila y en orden. Placa, chofer y cédula van copiados como texto: el papel dice lo que decía el día que se emitió.';

create index if not exists nota_entrega_camiones_por_nota
  on public.nota_entrega_camiones (nota_id, orden);

-- Mismo alcance de lectura que los renglones de la nota.
alter table public.nota_entrega_camiones enable row level security;
drop policy if exists nota_entrega_camiones_lectura on public.nota_entrega_camiones;
create policy nota_entrega_camiones_lectura on public.nota_entrega_camiones
  for select to authenticated using (true);
revoke all on public.nota_entrega_camiones from anon, authenticated;
grant select on public.nota_entrega_camiones to authenticated;

drop trigger if exists trg_auditar on public.nota_entrega_camiones;
create trigger trg_auditar after insert or update or delete on public.nota_entrega_camiones
  for each row execute function private.auditar('id');
drop trigger if exists trg_normalizar on public.nota_entrega_camiones;
create trigger trg_normalizar before insert or update on public.nota_entrega_camiones
  for each row execute function private.normalizar_texto('vehiculo', 'chofer', 'cedula_chofer', 'ticket');

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    return;
  end if;
  insert into public.auditoria_modulos (tabla, modulo) values ('nota_entrega_camiones', 'VENTAS')
  on conflict (tabla) do update set modulo = excluded.modulo;
end
$mapa$;

-- ───────────────────────────────────────────────────────────────────────────
-- Guardar los camiones de una nota: se manda la lista entera y queda esa
--
-- Se reemplaza el conjunto en vez de añadir uno a uno: la pantalla enseña la
-- lista completa y lo que se ve es lo que queda. Añadir de a uno obligaría a
-- un «quitar» aparte y a preguntarse qué pasa con el orden.
--
-- QUIÉN PUEDE: quien escribe en Facturación, que es quien completa la nota; y
-- también quien tiene la casilla de generar la nota de entrega desde la
-- salida, pero solo sobre una nota que nació de una salida. Es la misma
-- persona que la generó, poniéndole lo que la salida no tenía.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.guardar_camiones_de_nota(p_nota_id bigint, p_camiones jsonb)
returns integer
language plpgsql security definer set search_path to ''
as $$
declare
  v_nota    record;
  v_x       jsonb;
  v_orden   smallint := 0;
  v_veh     record;
  v_chofer  record;
  v_peso    numeric;
begin
  select id, numero, estado, nota_salida into v_nota
    from public.notas_entrega where id = p_nota_id for update;
  if v_nota.id is null then
    raise exception 'No existe la nota de entrega %.', p_nota_id using errcode = 'P0002';
  end if;

  if not (
       private.tiene_permiso('FACTURACION', 'ESCRITURA')
       or (v_nota.nota_salida is not null and private.puede_accion('SALIDAS.GENERAR_NOTA_ENTREGA'))
     ) then
    raise exception 'Los camiones de la nota los pone quien escribe en Facturación, o quien generó la nota desde la salida.'
      using errcode = '42501';
  end if;

  if v_nota.estado = 'ANULADA' then
    raise exception 'La nota % está anulada: no se le cambian los camiones.', v_nota.numero using errcode = '55000';
  end if;

  if p_camiones is null or jsonb_typeof(p_camiones) <> 'array' then
    raise exception 'Los camiones llegaron con una forma que no se entiende.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_camiones) > 20 then
    raise exception 'Son demasiados camiones para una sola nota.' using errcode = '22023';
  end if;

  delete from public.nota_entrega_camiones where nota_id = p_nota_id;

  for v_x in select * from jsonb_array_elements(p_camiones) loop
    v_orden := v_orden + 1;
    v_veh := null;
    v_chofer := null;

    if nullif(v_x ->> 'vehiculo_id', '') is not null then
      select id, placa, descripcion into v_veh
        from public.vehiculos_de_despacho where id = (v_x ->> 'vehiculo_id')::bigint;
      if v_veh.id is null then
        raise exception 'El vehículo del camión % no está en el catálogo.', v_orden using errcode = 'P0002';
      end if;
    end if;

    if nullif(v_x ->> 'chofer_id', '') is not null then
      select id, nombre, cedula into v_chofer
        from public.choferes where id = (v_x ->> 'chofer_id')::bigint;
      if v_chofer.id is null then
        raise exception 'El chofer del camión % no está en el catálogo.', v_orden using errcode = 'P0002';
      end if;
    end if;

    if v_veh.id is null and v_chofer.id is null then
      raise exception 'El camión % no tiene ni vehículo ni chofer.', v_orden using errcode = '22023';
    end if;

    v_peso := nullif(btrim(coalesce(v_x ->> 'peso_neto', '')), '')::numeric;
    if v_peso is not null and v_peso < 0 then
      raise exception 'El peso del camión % no puede ser negativo.', v_orden using errcode = '22023';
    end if;

    insert into public.nota_entrega_camiones
      (nota_id, orden, vehiculo_id, chofer_id, vehiculo, chofer, cedula_chofer, ticket, peso_neto, registrado_por)
    values
      (p_nota_id, v_orden, v_veh.id, v_chofer.id,
       case when v_veh.id is null then null
            else v_veh.placa || coalesce(' · ' || nullif(btrim(v_veh.descripcion), ''), '') end,
       v_chofer.nombre, v_chofer.cedula,
       nullif(btrim(coalesce(v_x ->> 'ticket', '')), ''),
       v_peso, (select auth.uid()));
  end loop;

  return v_orden;
end;
$$;

revoke execute on function public.guardar_camiones_de_nota(bigint, jsonb) from public, anon;
grant execute on function public.guardar_camiones_de_nota(bigint, jsonb) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- La vista trae los camiones, al final, para no mover ninguna columna
--
-- Parche anclado sobre la definición que hay: la vista la han tocado varias
-- manos y rehacerla entera de memoria es como se pisa el trabajo del otro.
-- ───────────────────────────────────────────────────────────────────────────
do $vista$
declare
  v_def text := rtrim(pg_get_viewdef('public.v_notas_entrega'::regclass), E'; \n');
  v_ancla text := 'AS precios_pendientes';
  v_nuevo text := 'AS precios_pendientes, '
    || '(SELECT COALESCE(jsonb_agg(jsonb_build_object('
    || '''id'', c.id, ''orden'', c.orden, ''vehiculo_id'', c.vehiculo_id, ''chofer_id'', c.chofer_id, '
    || '''vehiculo'', c.vehiculo, ''chofer'', c.chofer, ''cedula_chofer'', c.cedula_chofer, '
    || '''ticket'', c.ticket, ''peso_neto'', c.peso_neto) ORDER BY c.orden, c.id), ''[]''::jsonb) '
    || 'FROM public.nota_entrega_camiones c WHERE c.nota_id = n.id) AS camiones';
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'La vista v_notas_entrega no tiene el ancla exactamente una vez: no se toca.';
  end if;
  execute 'CREATE OR REPLACE VIEW public.v_notas_entrega WITH (security_invoker = on) AS '
    || replace(v_def, v_ancla, v_nuevo);
end
$vista$;
