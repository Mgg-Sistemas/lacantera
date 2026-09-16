/*
  LA SALIDA SE PUEDE PEDIR ANTES DE ENTREGARLA

  Christopher, 16/09/2026: «al igual que hay, nos piden que manejemos las
  solicitudes de salida, así como la opción de salida directa. Por igual con
  traslados: solicitud de traslado y opción a traslado directo».

  El traslado ya lo tenía —SOLICITUD, ACEPTADA, RECIBIDA— y la salida no: o se
  registraba, o no existía. Quien necesita material no siempre es quien puede
  entregarlo, y cuando no hay dónde pedirlo se pide por teléfono y se anota
  después, que es como el libro deja de parecerse al patio.

  LOS ESTADOS, CON LOS NOMBRES DE ESTA CASA

      PEDIDA ──► APROBADA ──► ENTREGADA
         │           │
         ▼           ▼
      RECHAZADA   CANCELADA

  Ni PEDIDA ni APROBADA mueven una sola unidad: lo que hay sigue estando hasta
  que alguien entrega. La entrega llama a `registrar_salidas`, que es la única
  puerta que descuenta, y guarda su número de nota en la solicitud: así el papel
  firmado y la solicitud que lo pidió se encuentran el uno al otro.

  QUIÉN APRUEBA: la misma regla que el traslado, que Christopher eligió también
  para esto — quien responde por el almacén de donde sale, con respaldo de
  Administrador y Gerente general. Se decide con `private.como_actua_en`, que ya
  existe y ya se usa en las tres puertas del traslado.

  UNA SOLICITUD ES DE UN ALMACÉN. Aprobar es responder por lo que sale de un
  sitio; una solicitud que mezclara tres sitios necesitaría tres firmas y no
  tendría dueño. Si hace falta material de dos almacenes, son dos solicitudes
  —y dos papeles, que es lo que de verdad pasa—. La salida directa sí puede
  mezclar sitios: la registra quien responde por ellos.

  Y LA SALIDA DIRECTA SIGUE EXISTIENDO, marcada como tal: `registrar_salidas` no
  cambia. Lo que se pueda contestar después es «cuántas salidas se hicieron sin
  que nadie las pidiera», que es justo lo que se querrá mirar.
*/
create table if not exists public.solicitudes_salida (
  id                  bigserial primary key,
  numero              text not null unique,
  estado              text not null default 'PEDIDA'
                        check (estado in ('PEDIDA', 'APROBADA', 'ENTREGADA', 'RECHAZADA', 'CANCELADA')),
  almacen_id          bigint not null references public.almacenes(id),
  /* La razón, del mismo catálogo que la salida: ni se duplica ni se traduce. */
  clase               text not null references public.clases_de_salida(codigo),
  motivo              text not null,
  /* Para quién: un grupo del organigrama, o alguien de fuera con su responsable. */
  grupo_id            bigint references public.organigrama_nodos(id),
  destino_externo     text,
  responsable_externo text,
  pedida_por          uuid,
  pedida_en           timestamptz not null default now(),
  aprobada_por        uuid,
  aprobada_en         timestamptz,
  /* Cierto cuando la aprobó administración y no quien responde por el almacén. */
  aprobada_de_respaldo boolean,
  entregada_por       uuid,
  entregada_en        timestamptz,
  /* El número de la nota que salió al entregarla: NS-2026-0012. */
  nota_salida         text,
  /* Por qué se rechazó o se canceló. Obligatorio al cerrarla sin entregar. */
  cierre_motivo       text,
  constraint solicitud_para_dentro_o_para_fuera
    check (grupo_id is null or destino_externo is null)
);

create table if not exists public.solicitud_salida_renglones (
  id             bigserial primary key,
  solicitud_id   bigint not null references public.solicitudes_salida(id) on delete cascade,
  articulo_id    bigint not null references public.articulos(id),
  cantidad       numeric not null check (cantidad > 0),
  /* Cómo se pidió: «3 tambores y 10 L». La conversión la hace la base al salir. */
  presentaciones numeric,
  presentacion   text,
  suelto         numeric,
  /* De quién sale, cuando en ese sitio ese artículo es de varios dueños. */
  propietario    text
);

create index if not exists solicitudes_salida_estado_idx
  on public.solicitudes_salida (estado, pedida_en desc);
create index if not exists solicitud_salida_renglones_idx
  on public.solicitud_salida_renglones (solicitud_id);

comment on table public.solicitudes_salida is
  'Lo que alguien pide sacar del almacén, antes de que se entregue. No mueve existencias: '
  'las mueve registrar_salidas cuando se entrega, y su número de nota queda aquí.';

-- La auditoría y la normalización, que toda tabla nueva necesita (regla 5).
drop trigger if exists trg_auditar on public.solicitudes_salida;
create trigger trg_auditar
  after insert or update or delete on public.solicitudes_salida
  for each row execute function private.auditar('id');

drop trigger if exists trg_normalizar on public.solicitudes_salida;
create trigger trg_normalizar
  before insert or update on public.solicitudes_salida
  for each row execute function private.normalizar_texto('motivo', 'destino_externo', 'responsable_externo', 'cierre_motivo');

drop trigger if exists trg_auditar on public.solicitud_salida_renglones;
create trigger trg_auditar
  after insert or update or delete on public.solicitud_salida_renglones
  for each row execute function private.auditar('id');

drop trigger if exists trg_normalizar on public.solicitud_salida_renglones;
create trigger trg_normalizar
  before insert or update on public.solicitud_salida_renglones
  for each row execute function private.normalizar_texto('presentacion', 'propietario');

insert into public.auditoria_modulos (tabla, modulo)
values ('solicitudes_salida', 'SALIDAS'), ('solicitud_salida_renglones', 'SALIDAS')
on conflict (tabla) do update set modulo = excluded.modulo;

/*
  EL NAVEGADOR NO ESCRIBE (regla 1). Lee quien tenga el módulo en lectura, y
  todo lo demás pasa por las funciones de abajo.
*/
alter table public.solicitudes_salida enable row level security;
alter table public.solicitud_salida_renglones enable row level security;

revoke insert, update, delete on public.solicitudes_salida from authenticated, anon;
revoke insert, update, delete on public.solicitud_salida_renglones from authenticated, anon;
grant select on public.solicitudes_salida to authenticated;
grant select on public.solicitud_salida_renglones to authenticated;

drop policy if exists solicitudes_salida_lectura on public.solicitudes_salida;
create policy solicitudes_salida_lectura on public.solicitudes_salida
  for select to authenticated
  using (private.tiene_permiso('SALIDAS', 'LECTURA'));

drop policy if exists solicitud_salida_renglones_lectura on public.solicitud_salida_renglones;
create policy solicitud_salida_renglones_lectura on public.solicitud_salida_renglones
  for select to authenticated
  using (private.tiene_permiso('SALIDAS', 'LECTURA'));

/*
  PEDIR. No mueve nada, así que basta con LECTURA del módulo: quien necesita el
  material pocas veces es quien lo entrega, y obligarle a tener escritura sería
  darle de paso la llave del almacén.
*/
create or replace function public.pedir_salida(
  p_almacen_id  bigint,
  p_renglones   jsonb,
  p_motivo      text,
  p_tipo        text,
  p_grupo_id    bigint default null,
  p_externo     text default null,
  p_responsable text default null
) returns text
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_clase     public.clases_de_salida;
  v_numero    text;
  v_id        bigint;
  v_r         jsonb;
  v_n         int := 0;
  v_almacen   public.almacenes;
  v_articulo  text;
  v_cuantos   int;
begin
  perform private.exigir_permiso('SALIDAS', 'LECTURA');

  select * into v_almacen from public.almacenes where id = p_almacen_id and activo;
  if v_almacen.id is null then
    raise exception 'Ese almacén no existe o está apagado.' using errcode = '23503';
  end if;

  select * into v_clase from public.clases_de_salida where codigo = p_tipo;
  if v_clase.codigo is null or not v_clase.activa or v_clase.tipo = 'SALIDA_BAJA' then
    raise exception 'Esa razón no está en la lista.' using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4
     or (coalesce(v_clase.exige_detalle, false) and length(btrim(coalesce(p_motivo, ''))) < 10) then
    raise exception 'Explica para qué lo necesitas.' using errcode = '22023';
  end if;

  if p_grupo_id is null and nullif(btrim(coalesce(p_externo, '')), '') is null then
    raise exception 'Falta decir para quién es: un grupo de la empresa, o quién es de fuera.'
      using errcode = '22023';
  end if;
  if p_grupo_id is not null and nullif(btrim(coalesce(p_externo, '')), '') is not null then
    raise exception 'Es para un grupo de la empresa o para alguien de fuera, no para los dos.'
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
    raise exception 'No hay nada que pedir: la solicitud no trae renglones.' using errcode = '22023';
  end if;

  v_numero := private.siguiente_numero('SS');

  insert into public.solicitudes_salida
    (numero, almacen_id, clase, motivo, grupo_id, destino_externo, responsable_externo, pedida_por)
  values
    (v_numero, p_almacen_id, v_clase.codigo, btrim(p_motivo), p_grupo_id,
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
    format('%s: piden %s cosa(s) de %s', v_numero, v_cuantos, v_almacen.nombre),
    format('%s. La aprueba quien responde por %s.', btrim(p_motivo), v_almacen.nombre),
    '/app/salidas/solicitudes', array['ALMACEN', 'GERENTE_GENERAL'], 'ATENCION');

  return v_numero;
end;
$func$;

/*
  APROBAR, RECHAZAR: quien responde por el almacén, con respaldo de
  administración. La misma reja que el traslado, y por el mismo motivo.
*/
create or replace function public.aprobar_solicitud_salida(p_id bigint)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_s     public.solicitudes_salida;
  v_alm   public.almacenes;
  v_como  text;
begin
  select * into v_s from public.solicitudes_salida where id = p_id for update;
  if v_s.id is null then
    raise exception 'No existe la solicitud %.', p_id using errcode = 'P0002';
  end if;
  if v_s.estado <> 'PEDIDA' then
    raise exception 'La solicitud % ya no espera aprobación: está %.', v_s.numero, lower(v_s.estado)
      using errcode = '55000';
  end if;

  select * into v_alm from public.almacenes where id = v_s.almacen_id;
  v_como := private.como_actua_en(v_s.almacen_id);
  if v_como is null then
    raise exception 'La solicitud % la aprueba quien responde por "%"%, o administración.',
      v_s.numero, v_alm.nombre, private.quien_responde_frase(v_s.almacen_id)
      using errcode = '42501';
  end if;

  update public.solicitudes_salida
     set estado = 'APROBADA',
         aprobada_por = (select auth.uid()), aprobada_en = now(),
         aprobada_de_respaldo = (v_como = 'RESPALDO')
   where id = p_id;

  perform private.notificar(
    'SALIDAS', 'SALIDA_APROBADA',
    format('%s: aprobada', v_s.numero),
    format('Se puede entregar desde %s.', v_alm.nombre),
    '/app/salidas/solicitudes', array['ALMACEN'], 'INFO');

  return p_id;
end;
$func$;

create or replace function public.rechazar_solicitud_salida(p_id bigint, p_motivo text)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_s    public.solicitudes_salida;
  v_alm  public.almacenes;
begin
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Di por qué no se aprueba: quien la pidió va a leerlo.' using errcode = '22023';
  end if;

  select * into v_s from public.solicitudes_salida where id = p_id for update;
  if v_s.id is null then
    raise exception 'No existe la solicitud %.', p_id using errcode = 'P0002';
  end if;
  if v_s.estado <> 'PEDIDA' then
    raise exception 'La solicitud % ya no espera aprobación: está %.', v_s.numero, lower(v_s.estado)
      using errcode = '55000';
  end if;

  select * into v_alm from public.almacenes where id = v_s.almacen_id;
  if private.como_actua_en(v_s.almacen_id) is null then
    raise exception 'La solicitud % la resuelve quien responde por "%"%, o administración.',
      v_s.numero, v_alm.nombre, private.quien_responde_frase(v_s.almacen_id)
      using errcode = '42501';
  end if;

  update public.solicitudes_salida
     set estado = 'RECHAZADA', cierre_motivo = btrim(p_motivo),
         aprobada_por = (select auth.uid()), aprobada_en = now()
   where id = p_id;

  perform private.notificar(
    'SALIDAS', 'SALIDA_RECHAZADA',
    format('%s: no se aprobó', v_s.numero),
    btrim(p_motivo),
    '/app/salidas/solicitudes', array['ALMACEN'], 'ATENCION');

  return p_id;
end;
$func$;

/*
  CANCELAR: quien la pidió, mientras no se haya entregado. Y también quien
  aprueba, que a veces se entera antes de que el almacén la toque.
*/
create or replace function public.cancelar_solicitud_salida(p_id bigint, p_motivo text)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_s public.solicitudes_salida;
begin
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Di por qué se cancela: queda escrito y no se puede editar.' using errcode = '22023';
  end if;

  select * into v_s from public.solicitudes_salida where id = p_id for update;
  if v_s.id is null then
    raise exception 'No existe la solicitud %.', p_id using errcode = 'P0002';
  end if;
  if v_s.estado not in ('PEDIDA', 'APROBADA') then
    raise exception 'La solicitud % ya está %: no se puede cancelar.', v_s.numero, lower(v_s.estado)
      using errcode = '55000';
  end if;

  if v_s.pedida_por is distinct from (select auth.uid())
     and private.como_actua_en(v_s.almacen_id) is null then
    raise exception 'La cancela quien la pidió, o quien responde por el almacén.'
      using errcode = '42501';
  end if;

  update public.solicitudes_salida
     set estado = 'CANCELADA', cierre_motivo = btrim(p_motivo)
   where id = p_id;

  return p_id;
end;
$func$;

/*
  ENTREGAR: aquí y solo aquí se mueve el material, por la misma puerta de
  siempre. La nota que sale queda pegada a la solicitud.
*/
create or replace function public.entregar_solicitud_salida(p_id bigint)
returns text
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_s         public.solicitudes_salida;
  v_alm       public.almacenes;
  v_renglones jsonb;
  v_nota      text;
begin
  perform private.exigir_permiso('SALIDAS', 'ESCRITURA');

  select * into v_s from public.solicitudes_salida where id = p_id for update;
  if v_s.id is null then
    raise exception 'No existe la solicitud %.', p_id using errcode = 'P0002';
  end if;
  if v_s.estado <> 'APROBADA' then
    raise exception 'La solicitud % no se puede entregar: está %.', v_s.numero, lower(v_s.estado)
      using errcode = '55000';
  end if;

  select * into v_alm from public.almacenes where id = v_s.almacen_id;

  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'almacen_id',     v_s.almacen_id::text,
           'articulo_id',    r.articulo_id::text,
           'cantidad',       coalesce(r.suelto, r.cantidad)::text,
           'presentaciones', r.presentaciones::text,
           'presentacion',   r.presentacion,
           'propietario',    r.propietario)))
    into v_renglones
    from public.solicitud_salida_renglones r
   where r.solicitud_id = p_id;

  v_nota := public.registrar_salidas(
    p_almacen_id  => v_s.almacen_id,
    p_renglones   => v_renglones,
    p_motivo      => v_s.motivo,
    p_tipo        => v_s.clase,
    p_grupo_id    => v_s.grupo_id,
    p_externo     => v_s.destino_externo,
    p_responsable => v_s.responsable_externo);

  update public.solicitudes_salida
     set estado = 'ENTREGADA',
         entregada_por = (select auth.uid()), entregada_en = now(),
         nota_salida = v_nota
   where id = p_id;

  perform private.notificar(
    'SALIDAS', 'SALIDA_ENTREGADA',
    format('%s: entregada con la nota %s', v_s.numero, v_nota),
    format('Salió de %s.', v_alm.nombre),
    '/app/salidas/solicitudes', array['ALMACEN'], 'INFO');

  return v_nota;
end;
$func$;

revoke all on function public.pedir_salida(bigint,jsonb,text,text,bigint,text,text) from public, anon;
revoke all on function public.aprobar_solicitud_salida(bigint) from public, anon;
revoke all on function public.rechazar_solicitud_salida(bigint,text) from public, anon;
revoke all on function public.cancelar_solicitud_salida(bigint,text) from public, anon;
revoke all on function public.entregar_solicitud_salida(bigint) from public, anon;

grant execute on function public.pedir_salida(bigint,jsonb,text,text,bigint,text,text) to authenticated;
grant execute on function public.aprobar_solicitud_salida(bigint) to authenticated;
grant execute on function public.rechazar_solicitud_salida(bigint,text) to authenticated;
grant execute on function public.cancelar_solicitud_salida(bigint,text) to authenticated;
grant execute on function public.entregar_solicitud_salida(bigint) to authenticated;

-- Los avisos del traslado apuntaban a la dirección vieja, que ahora redirige.
-- Se apunta a la de verdad: un aviso que da un rodeo se lee como un error.
do $mig$
declare
  v_nombres text[] := array['solicitar_traslado', 'aceptar_traslado', 'recibir_traslado', 'cancelar_traslado'];
  v_nombre  text;
  v_def     text;
  v_oid     oid;
begin
  foreach v_nombre in array v_nombres loop
    select p.oid into v_oid
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_nombre
     limit 1;
    if v_oid is null then
      continue;
    end if;
    v_def := pg_get_functiondef(v_oid);
    if position('/app/inventario/transferencias' in v_def) > 0 then
      execute replace(v_def, '/app/inventario/transferencias', '/app/salidas/traslados');
    end if;
  end loop;
end
$mig$;

do $ver$
begin
  if to_regclass('public.solicitudes_salida') is null
     or to_regclass('public.solicitud_salida_renglones') is null then
    raise exception 'faltan las tablas de la solicitud';
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'solicitudes_salida') then
    raise exception 'la solicitud no tiene reja de lectura';
  end if;
  if has_table_privilege('authenticated', 'public.solicitudes_salida', 'insert')
     or has_table_privilege('authenticated', 'public.solicitud_salida_renglones', 'insert') then
    raise exception 'el navegador puede escribir en la solicitud, y no debe';
  end if;
  if not has_function_privilege('authenticated', 'public.pedir_salida(bigint,jsonb,text,text,bigint,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.entregar_solicitud_salida(bigint)', 'execute') then
    raise exception 'las puertas de la solicitud no están abiertas a quien tiene sesión';
  end if;
  if not exists (select 1 from public.auditoria_modulos
                  where tabla = 'solicitudes_salida' and modulo = 'SALIDAS') then
    raise exception 'la auditoría no sabe de qué módulo es la solicitud';
  end if;
  if position('/app/inventario/transferencias' in pg_get_functiondef('public.aceptar_traslado'::regproc)) > 0 then
    raise exception 'los avisos del traslado siguen apuntando a la dirección vieja';
  end if;
end
$ver$;
