-- ---------------------------------------------------------------------------
-- La firma también de los trabajadores, y con interruptor
--
-- Christopher: «tanto usuarios como empleados deben tener la posibilidad de
-- registrar su firma digital de las formas indicadas. En caso de no tener,
-- dejar en blanco. En caso de tener pero preferir no usar (switch ON/OFF
-- style), dejar en blanco pero con la firma guardada en la BD».
--
-- DOS DUEÑOS POSIBLES, UNA SOLA TABLA
--
-- Un usuario del sistema tiene perfil; un obrero de la cantera no —no entra al
-- sistema, no tiene usuario ni clave— y vive en `empleados`. Podrían ser dos
-- tablas, pero sería el mismo CHECK, el mismo tope y el mismo formato escritos
-- dos veces: en tres meses una de las dos tendría un tope distinto y nadie
-- sabría cuál manda.
--
-- Van las dos aquí, con las columnas excluyentes y un CHECK que exige
-- exactamente una. Lo que sí se separa son las funciones de escritura, porque
-- las reglas son de verdad distintas:
--
--   La propia      — la guarda uno mismo. La función NO recibe a quién: lo saca
--                    de la sesión. Recibirlo sería la puerta para guardar una
--                    firma en nombre de otro.
--   La de un obrero — la carga quien lleva el personal, con el papel delante.
--                    Esa sí recibe a quién, y exige rol de RRHH.
--
-- EL INTERRUPTOR
--
-- `usar` apaga la firma sin borrarla, que es lo que pidió. Quien prefiere
-- firmar a mano deja la raya en blanco y conserva la imagen: volver a
-- encenderla es un clic, rehacerla es buscar otra vez el teléfono y la buena
-- luz.
--
-- El filtro va donde se leen las firmas, no en cada papel. Si cada documento
-- tuviera que acordarse de mirar `usar`, el primero que se olvidara estamparía
-- una firma que su dueño pidió no usar.
--
-- La tabla nació hace una hora y está vacía, así que se rehace en vez de
-- parchearse. Con filas dentro esto sería un alter cuidadoso; sin ellas, un
-- alter cuidadoso solo dificulta leer después por qué la tabla es como es.
-- ---------------------------------------------------------------------------

drop table if exists public.firmas cascade;

create table public.firmas (
  id             bigint generated always as identity primary key,

  perfil_id      uuid   references public.perfiles(id)  on delete cascade,
  empleado_id    bigint references public.empleados(id) on delete cascade,

  -- El PNG completo como data URL, listo para meterlo en el papel sin más
  -- vueltas. Con fondo transparente: así se estampa sobre la raya del
  -- documento en vez de taparla con un rectángulo blanco.
  imagen         text not null,

  -- Cómo la hizo. No cambia nada de lo que se imprime; sirve para saber qué
  -- ofrecerle la próxima vez que la abra.
  origen         text not null check (origen = any (array['DIBUJADA', 'TECLEADA', 'IMAGEN'])),

  usar           boolean not null default true,
  actualizada_en timestamptz not null default now(),

  constraint firmas_de_alguien    check (num_nonnulls(perfil_id, empleado_id) = 1),
  constraint firmas_imagen_es_png check (imagen like 'data:image/png;base64,%'),
  constraint firmas_imagen_cabe   check (length(imagen) between 200 and 200000)
);

create unique index firmas_por_perfil   on public.firmas (perfil_id)   where perfil_id is not null;
create unique index firmas_por_empleado on public.firmas (empleado_id) where empleado_id is not null;

comment on table public.firmas is
  'La firma de cada quien: la de un usuario del sistema o la de un trabajador '
  'que no entra a el. No prueba que la persona firmo, prueba que el papel salio '
  'del sistema. Lo que da fe es la auditoria.';

comment on column public.firmas.usar is
  'Guardada pero apagada. Quien prefiere firmar a mano deja la raya en blanco '
  'sin perder la imagen: volver a encenderla es un clic, rehacerla es buscar el '
  'telefono y la buena luz.';

alter table public.firmas enable row level security;

-- Se lee toda: el que imprime una orden no es el que la firmó —compras imprime
-- lo que aprobó el gerente— y si cada quien solo viera la suya, el papel
-- saldría firmado solo cuando lo imprime su propio autor, que es casi nunca.
drop policy if exists firmas_lectura on public.firmas;
create policy firmas_lectura on public.firmas
  for select to authenticated
  using (true);

revoke insert, update, delete on public.firmas from anon, authenticated;

-- Con el nombre de la clave: `auditar()` recorre `TG_ARGV` para identificar la
-- fila, y sin argumento revienta con «FOREACH expression must not be null», que
-- desde el front no se lee como un disparador mal declarado sino como que el
-- sistema devuelve 400 al guardar. Ya costó un intento.
--
-- Sin `trg_normalizar` a propósito: normalizar pone el texto en mayúscula, y el
-- único texto de esta tabla es un PNG en base64, que distingue mayúsculas de
-- minúsculas. Pasarlo por ahí lo destruiría.
drop trigger if exists trg_auditar on public.firmas;
create trigger trg_auditar
  after insert or update or delete on public.firmas
  for each row execute function private.auditar('id');

-- ---------------------------------------------------------------------------
-- Lo que tiene que cumplir una firma, en un solo sitio
--
-- Las mismas cuatro comprobaciones valen para la propia y para la de un
-- trabajador. Los mensajes dicen qué hacer, no qué restricción se violó: «la
-- imagen pesa 240 KB y el tope son 195» se puede arreglar; «firmas_imagen_cabe»
-- no.
-- ---------------------------------------------------------------------------
create or replace function private.validar_firma(p_imagen text, p_origen text)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
begin
  if p_imagen is null or p_imagen not like 'data:image/png;base64,%' then
    raise exception 'La firma tiene que llegar como imagen PNG.' using errcode = '22023';
  end if;

  if length(p_imagen) > 200000 then
    raise exception 'La imagen de la firma pesa % KB y el tope son 195 KB. Recortala para que quede solo el trazo, sin el resto de la hoja.',
      round(length(p_imagen) / 1024.0)
      using errcode = '22023';
  end if;

  if length(p_imagen) < 200 then
    raise exception 'La firma llego vacia. Dibujala, escribela o carga una imagen antes de guardar.'
      using errcode = '22023';
  end if;

  if p_origen is null or p_origen not in ('DIBUJADA', 'TECLEADA', 'IMAGEN') then
    raise exception 'Origen de firma desconocido: %.', coalesce(p_origen, 'nulo')
      using errcode = '22023';
  end if;
end;
$func$;

comment on function private.validar_firma(text, text) is
  'Lo que tiene que cumplir una firma para guardarse, en un solo sitio: la usan '
  'la propia y la de un trabajador.';

-- ---------------------------------------------------------------------------
-- La propia
-- ---------------------------------------------------------------------------
create or replace function public.guardar_mi_firma(p_imagen text, p_origen text)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_yo uuid := auth.uid();
begin
  if v_yo is null then
    raise exception 'No hay sesion.' using errcode = '28000';
  end if;

  perform private.validar_firma(p_imagen, p_origen);

  insert into public.firmas (perfil_id, imagen, origen)
  values (v_yo, p_imagen, p_origen)
  on conflict (perfil_id) where perfil_id is not null do update
    set imagen = excluded.imagen,
        origen = excluded.origen,
        usar = true,
        actualizada_en = now();
end;
$func$;

comment on function public.guardar_mi_firma(text, text) is
  'Guarda la firma de quien esta en sesion. No recibe a quien a proposito: la '
  'saca del token, para que nadie pueda guardar una firma en nombre de otro.';

create or replace function public.quitar_mi_firma()
returns void
language plpgsql
security definer
set search_path to ''
as $func$
begin
  if auth.uid() is null then
    raise exception 'No hay sesion.' using errcode = '28000';
  end if;
  delete from public.firmas where perfil_id = auth.uid();
end;
$func$;

create or replace function public.usar_mi_firma(p_usar boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
begin
  if auth.uid() is null then
    raise exception 'No hay sesion.' using errcode = '28000';
  end if;

  update public.firmas
     set usar = coalesce(p_usar, true), actualizada_en = now()
   where perfil_id = auth.uid();

  if not found then
    raise exception 'Todavia no has guardado ninguna firma.' using errcode = 'P0002';
  end if;
end;
$func$;

comment on function public.usar_mi_firma(boolean) is
  'Enciende o apaga la firma propia sin borrarla. Apagada, los papeles salen con '
  'la raya en blanco para firmarlos a mano.';

-- ---------------------------------------------------------------------------
-- La de un trabajador
--
-- Un trabajador de la cantera no entra al sistema: no tiene usuario ni clave, y
-- su firma la carga quien lleva el personal, con el papel delante. Por eso
-- estas tres SÍ reciben a quién, y por eso exigen rol.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_firma_de_empleado(
  p_empleado_id bigint,
  p_imagen text,
  p_origen text
) returns void
language plpgsql
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_rol('RRHH');
  perform private.validar_firma(p_imagen, p_origen);

  if not exists (select 1 from public.empleados where id = p_empleado_id) then
    raise exception 'No existe ese trabajador.' using errcode = 'P0002';
  end if;

  insert into public.firmas (empleado_id, imagen, origen)
  values (p_empleado_id, p_imagen, p_origen)
  on conflict (empleado_id) where empleado_id is not null do update
    set imagen = excluded.imagen,
        origen = excluded.origen,
        usar = true,
        actualizada_en = now();
end;
$func$;

comment on function public.guardar_firma_de_empleado(bigint, text, text) is
  'La carga quien lleva el personal, con el papel delante: el trabajador no '
  'entra al sistema.';

create or replace function public.quitar_firma_de_empleado(p_empleado_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_rol('RRHH');
  delete from public.firmas where empleado_id = p_empleado_id;
end;
$func$;

create or replace function public.usar_firma_de_empleado(p_empleado_id bigint, p_usar boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_rol('RRHH');

  update public.firmas
     set usar = coalesce(p_usar, true), actualizada_en = now()
   where empleado_id = p_empleado_id;

  if not found then
    raise exception 'Ese trabajador todavia no tiene firma guardada.' using errcode = 'P0002';
  end if;
end;
$func$;

revoke execute on function public.guardar_mi_firma(text, text) from public, anon;
revoke execute on function public.quitar_mi_firma() from public, anon;
revoke execute on function public.usar_mi_firma(boolean) from public, anon;
revoke execute on function public.guardar_firma_de_empleado(bigint, text, text) from public, anon;
revoke execute on function public.quitar_firma_de_empleado(bigint) from public, anon;
revoke execute on function public.usar_firma_de_empleado(bigint, boolean) from public, anon;

grant execute on function public.guardar_mi_firma(text, text) to authenticated;
grant execute on function public.quitar_mi_firma() to authenticated;
grant execute on function public.usar_mi_firma(boolean) to authenticated;
grant execute on function public.guardar_firma_de_empleado(bigint, text, text) to authenticated;
grant execute on function public.quitar_firma_de_empleado(bigint) to authenticated;
grant execute on function public.usar_firma_de_empleado(bigint, boolean) to authenticated;
