/*
  EL TRASLADO PASA POR SOLICITUD, ACEPTADA Y RECIBIDA

  Christopher, 15/09/2026: «Un traslado puede pasar por Solicitud, Aceptada,
  Recibida/Finalizada, Cancelada». Y al preguntarle cómo:

    - el material sale del origen AL ACEPTARSE, y entra al destino al recibirse;
    - los almacenes y talleres tienen un responsable, que actúa con su usuario,
      y administración —Administrador y Gerente general— puede hacerlo cuando
      falta o no está;
    - una aceptada todavía se puede cancelar, y el material vuelve al origen;
    - mientras va de camino se ve en un sitio «En camino» y sigue contando;
    - la solicitud la hace quien hoy mueve inventario;
    - «si llega menos» no se considera.

  Y desde antes: «un traslado no necesariamente es inmediato (aunque hay que
  dejar abierta la posibilidad con alguna opción)».

  POR QUÉ UNA TABLA Y NO UN ESTADO EN EL LIBRO

  El libro de movimientos no se edita —`trg_movimientos_inmutables`—, y un
  estado es justo lo que cambia. Así que el traslado es un documento aparte, con
  su número TRA, y el libro recibe los asientos de cada paso cuando ocurre.

  POR QUÉ UN SITIO «EN CAMINO»

  Entre aceptar y recibir el material ya no está en el origen y todavía no está
  en el destino. Sacarlo de las cuentas haría que el inventario valiera menos
  mientras un camión cruza el patio. Con un sitio propio, cada paso es un par de
  asientos que cuadra, y en Existencias se ve dónde está.

  Ese sitio solo lo mueven los traslados: `registrar_movimiento` —la única
  función que escribe en el libro— lo rechaza para cualquier otra puerta.

  EL COSTO VIAJA FIJO

  Sale del origen a su costo promedio, y al llegar o volver entra a ESE costo y
  no al promedio de «En camino»: dos traslados del mismo artículo cruzando a la
  vez a costos distintos no deben promediarse entre sí.

  TRASLADAR EN EL ACTO SIGUE EXISTIENDO

  Desde Transferencias es aceptar y recibir a la vez, así que lo puede quien
  responde por los dos sitios, o administración: `solicitar_traslado` con
  `p_inmediato`.

  `transferir_existencia` NO SE TOCA. La usan combustible —pasar gasoil de un
  tanque a otro— y mantenimiento —mandar material al taller y traerlo—, cada
  uno con sus propias reglas y su propia gente. Exigirles el responsable de los
  dos sitios dejaría al operador de combustible sin poder llenar el tanque de la
  planta. Si algún día se quiere, es una decisión aparte.
*/

-- ---------------------------------------------------------------------------
-- 1. El sitio «En camino»
-- ---------------------------------------------------------------------------
insert into public.almacenes (codigo, nombre, tipo, recibe_compras, activo, admite_sin_costo, propietario)
values ('EN-CAMINO', 'En camino', 'TRANSITO', false, true, false, 'LACANTERA')
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- 2. «En camino» solo lo mueven los traslados
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_def   text := pg_get_functiondef('private.registrar_movimiento'::regproc);
  v_ancla text := $a$            hint = 'Sirve para decir donde se resguarda una maquina o un vehiculo, no para llevar existencias.';
  end if;
$a$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'registrar_movimiento: el cierre del patio de maquinas no aparece exactamente una vez';
  end if;

  v_def := replace(v_def, v_ancla, v_ancla || $n$
  /*
    «EN CAMINO» SOLO LO MUEVEN LOS TRASLADOS.

    Es donde espera lo que ya salió de un sitio y todavía no llegó al otro. Una
    salida o una entrada suelta ahí dejaría un traslado sin su material, o
    material sin traslado. Las funciones de traslado encienden esta marca, que
    muere con la transacción, y ninguna otra puerta la tiene.
  */
  if exists (select 1 from public.almacenes a
              where a.id = p_almacen and a.tipo = 'TRANSITO')
     and coalesce(current_setting('cantera.traslado_en_curso', true), '') <> 'si' then
    raise exception '«%» es donde espera lo que va de un sitio a otro: solo lo mueven los traslados.',
      (select nombre from public.almacenes where id = p_almacen)
      using errcode = '22023',
            hint = 'Para sacar algo de ahí, recibe o cancela su traslado en Transferencias.';
  end if;
$n$);

  execute v_def;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 3. «En camino» no se crea ni se edita a mano
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_def   text := pg_get_functiondef(
    'public.guardar_almacen(bigint,text,text,text,text,boolean,boolean,numeric,smallint,text,bigint)'::regprocedure);
  v_ancla text := $a$  if p_tipo not in ('PATIO', 'ALMACEN', 'TALLER', 'COMBUSTIBLE', 'TRANSITO', 'PATIO_MAQUINAS') then
$a$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'guardar_almacen: la lista de tipos no aparece exactamente una vez';
  end if;

  v_def := replace(v_def, v_ancla, $n$  -- «En camino» lo lleva el sistema: ver `traslados`.
  if p_tipo = 'TRANSITO'
     or exists (select 1 from public.almacenes where id = p_id and tipo = 'TRANSITO') then
    raise exception '«En camino» lo lleva el sistema: es donde espera lo que va de un sitio a otro, y no se crea ni se edita a mano.'
      using errcode = '22023';
  end if;

$n$ || v_ancla);

  execute v_def;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 4. La tabla
-- ---------------------------------------------------------------------------
create table if not exists public.traslados (
  id                   bigint generated always as identity primary key,
  numero               text not null unique,
  estado               text not null default 'SOLICITUD'
                         check (estado in ('SOLICITUD', 'ACEPTADA', 'RECIBIDA', 'CANCELADA')),
  inmediato            boolean not null default false,
  fecha                date not null,
  origen_id            bigint not null references public.almacenes(id),
  destino_id           bigint not null references public.almacenes(id),
  articulo_id          bigint not null references public.articulos(id),
  cantidad             numeric not null check (cantidad > 0),
  presentaciones       numeric,
  presentacion         text,
  suelto               numeric,
  propietario          text not null references public.propietarios(codigo),
  motivo               text not null,
  solicitado_por       uuid references auth.users(id),
  solicitado_en        timestamptz not null default now(),
  aceptado_por         uuid references auth.users(id),
  aceptado_en          timestamptz,
  aceptado_de_respaldo boolean,
  recibido_por         uuid references auth.users(id),
  recibido_en          timestamptz,
  recibido_de_respaldo boolean,
  cancelado_por        uuid references auth.users(id),
  cancelado_en         timestamptz,
  motivo_cancelacion   text,
  mov_salida           bigint references public.inventario_movimientos(id),
  mov_en_camino        bigint references public.inventario_movimientos(id),
  mov_llegada          bigint references public.inventario_movimientos(id),
  mov_vuelta           bigint references public.inventario_movimientos(id),
  constraint traslado_entre_dos_sitios check (origen_id <> destino_id),
  constraint traslado_cancelado_con_motivo check ((estado = 'CANCELADA') = (motivo_cancelacion is not null))
);

comment on table public.traslados is
  'Material que va de un sitio a otro, con su numero TRA y sus pasos: SOLICITUD, '
  'ACEPTADA (sale del origen y espera en «En camino»), RECIBIDA (entra al destino) '
  'o CANCELADA (si ya habia salido, vuelve al origen). Los asientos del libro se '
  'escriben en cada paso; aqui quedan sus ids. inmediato = sin pasar por «En camino».';

comment on column public.traslados.aceptado_de_respaldo is
  'Verdadero cuando acepto administracion y no el responsable del origen.';
comment on column public.traslados.mov_en_camino is
  'La entrada en «En camino» al aceptarse. De ella cuelgan la llegada o la vuelta.';

create index if not exists traslados_estado on public.traslados (estado, solicitado_en desc);
create index if not exists traslados_origen on public.traslados (origen_id);
create index if not exists traslados_destino on public.traslados (destino_id);

alter table public.traslados enable row level security;

-- ---------------------------------------------------------------------------
-- 5. Quién responde por un sitio
-- ---------------------------------------------------------------------------
create or replace function private.responde_por(p_almacen bigint)
returns boolean
language sql stable security definer set search_path to ''
as $$
  select exists (
    select 1
      from public.almacenes a
      join public.empleados e on e.id = a.responsable_id
      join public.perfiles p on p.id = e.perfil_id
     where a.id = p_almacen
       and e.perfil_id = (select auth.uid())
       and e.activo
       and p.activo)
$$;

comment on function private.responde_por(bigint) is
  'Si quien llama es el responsable del sitio: el empleado de almacenes.responsable_id, '
  'enlazado a su usuario por empleados.perfil_id.';

/*
  RESPONSABLE, RESPALDO O NADA.

  El respaldo es Administrador y Gerente general (`tiene_rol` deja pasar siempre
  al Administrador). Actúa aunque el sitio tenga responsable: el sistema no sabe
  si esa persona está hoy en la cantera, y quedarse sin poder recibir un camión
  por eso sería peor. Queda escrito en el traslado que fue de respaldo.
*/
create or replace function private.como_actua_en(p_almacen bigint)
returns text
language sql stable security definer set search_path to ''
as $$
  select case
    when private.responde_por(p_almacen) then 'RESPONSABLE'
    when private.tiene_rol('GERENTE_GENERAL') then 'RESPALDO'
  end
$$;

/* Para los mensajes: quién tendría que hacerlo, dicho con su nombre. */
create or replace function private.quien_responde_frase(p_almacen bigint)
returns text
language sql stable security definer set search_path to ''
as $$
  select coalesce(
    (select case
              when e.perfil_id is null
                then format(' (hoy %s %s, que todavía no tiene usuario en el sistema)', e.nombres, e.apellidos)
              else format(' (hoy %s %s)', e.nombres, e.apellidos)
            end
       from public.almacenes a
       join public.empleados e on e.id = a.responsable_id
      where a.id = p_almacen),
    ' (ese sitio todavía no tiene responsable)')
$$;

create or replace function private.sitio_en_camino()
returns bigint
language sql stable security definer set search_path to ''
as $$
  select id from public.almacenes where tipo = 'TRANSITO' and activo order by id limit 1
$$;

-- ---------------------------------------------------------------------------
-- 6. Mover un paso: una salida y su entrada, con el cerrojo antes de leer
-- ---------------------------------------------------------------------------
create or replace function private.mover_en_traslado(
  p_de             bigint,
  p_a              bigint,
  p_articulo       bigint,
  p_cantidad       numeric,
  p_dueno          text,
  p_nota_sale      text,
  p_nota_entra     text,
  p_costo          numeric default null,
  p_costo_fijo     boolean default false,
  p_origen         bigint default null,
  p_fecha          date default null,
  p_presentaciones numeric default null,
  p_presentacion   text default null,
  p_suelto         numeric default null,
  out salida       bigint,
  out entrada      bigint)
language plpgsql security definer set search_path to ''
as $$
declare
  v_hay numeric; v_costo numeric; v_articulo text; v_sitio text;
begin
  -- El cerrojo antes de leer: ver la regla 8 de CLAUDE.md.
  v_hay := private.existencia_para_escribir(p_de, p_articulo, p_dueno);

  if p_cantidad > v_hay then
    select nombre into v_articulo from public.articulos where id = p_articulo;
    select nombre into v_sitio from public.almacenes where id = p_de;
    raise exception 'En "%" solo hay % de "%" de ese dueño y se intentan mover %.',
      v_sitio, private.numero_es(v_hay, 4), coalesce(v_articulo, p_articulo::text),
      private.numero_es(p_cantidad, 4)
      using errcode = '22023';
  end if;

  v_costo := case when p_costo_fijo then p_costo
                  else private.costo_promedio(p_de, p_articulo, p_dueno) end;

  perform set_config('cantera.traslado_en_curso', 'si', true);

  salida := private.registrar_movimiento(
    p_tipo => 'TRANSFERENCIA_SALIDA', p_signo => -1,
    p_almacen => p_de, p_articulo => p_articulo,
    p_cantidad => p_cantidad, p_costo_usd => v_costo,
    p_nota => p_nota_sale, p_origen => p_origen, p_fecha => p_fecha,
    p_cantidad_capturada => case when p_presentacion is not null then p_presentaciones end,
    p_unidad_capturada   => p_presentacion,
    p_suelto_capturado   => case when p_presentacion is not null then nullif(p_suelto, 0) end,
    p_propietario        => p_dueno);

  entrada := private.registrar_movimiento(
    p_tipo => 'TRANSFERENCIA_ENTRADA', p_signo => 1,
    p_almacen => p_a, p_articulo => p_articulo,
    p_cantidad => p_cantidad, p_costo_usd => v_costo,
    p_nota => p_nota_entra, p_origen => salida, p_fecha => p_fecha,
    p_cantidad_capturada => case when p_presentacion is not null then p_presentaciones end,
    p_unidad_capturada   => p_presentacion,
    p_suelto_capturado   => case when p_presentacion is not null then nullif(p_suelto, 0) end,
    p_propietario        => p_dueno);

  perform set_config('cantera.traslado_en_curso', '', true);
end;
$$;

revoke execute on function private.mover_en_traslado(bigint,bigint,bigint,numeric,text,text,text,numeric,boolean,bigint,date,numeric,text,numeric)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Las puertas del traslado
-- ---------------------------------------------------------------------------
-- `transferir_existencia` se queda como está: ver la cabecera.
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
create or replace function public.solicitar_traslado(
  p_origen_id      bigint,
  p_destino_id     bigint,
  p_articulo_id    bigint,
  p_cantidad       numeric,
  p_motivo         text,
  p_fecha          date default null,
  p_presentaciones numeric default null,
  p_presentacion   text default null,
  p_suelto         numeric default null,
  p_propietario    text default null,
  p_inmediato      boolean default false)
returns bigint
language plpgsql security definer set search_path to ''
as $$
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
  perform private.exigir_rol('ALMACEN');

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

  -- Las dos rejas del tanque sin costo, las mismas que en el traslado en el acto.
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
    raise exception 'Lo que hay en "%" entró sin costo: se traslada en el acto, sin pasar por «En camino».',
      v_origen.nombre
      using errcode = '22023',
            hint = 'Marca «Hacerlo ya». En «En camino» se mezclaría con material que sí costó.';
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

  if coalesce(p_inmediato, false) then
    v_en_origen  := private.como_actua_en(p_origen_id);
    v_en_destino := private.como_actua_en(p_destino_id);
    if v_en_origen is null or v_en_destino is null then
      raise exception 'Hacerlo ya es aceptar en "%" y recibir en "%" a la vez: lo puede quien responde por los dos sitios, o administración.',
        v_origen.nombre, v_destino.nombre
        using errcode = '42501',
              hint = 'Pide el traslado sin marcar «Hacerlo ya», y que lo acepte y lo reciba quien responde por cada sitio.';
    end if;
  end if;

  v_numero := private.siguiente_numero('TRA');

  insert into public.traslados
    (numero, inmediato, fecha, origen_id, destino_id, articulo_id, cantidad,
     presentaciones, presentacion, suelto, propietario, motivo, solicitado_por)
  values
    (v_numero, coalesce(p_inmediato, false), v_fecha, p_origen_id, p_destino_id, p_articulo_id, v_cantidad,
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
  else
    perform private.notificar(
      'INVENTARIO', 'TRASLADO_SOLICITADO',
      format('%s: piden mover %s a %s', v_numero, v_articulo.nombre, v_destino.nombre),
      format('%s %s desde %s. Lo acepta quien responde por %s.',
             private.numero_es(v_cantidad, 4), v_articulo.unidad, v_origen.nombre, v_origen.nombre),
      '/app/inventario/transferencias', array['ALMACEN', 'GERENTE_GENERAL'], 'ATENCION');
  end if;

  return v_id;
end;
$$;

create or replace function public.aceptar_traslado(p_id bigint)
returns bigint
language plpgsql security definer set search_path to ''
as $$
declare
  v_t       public.traslados;
  v_origen  public.almacenes;
  v_destino public.almacenes;
  v_como    text;
  v_camino  bigint;
  v_mov     record;
  v_articulo text;
  v_hoy     date := private.hoy_aqui();
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;

  select * into v_t from public.traslados where id = p_id for update;
  if v_t.id is null then
    raise exception 'No existe el traslado %.', p_id using errcode = 'P0002';
  end if;
  if v_t.estado <> 'SOLICITUD' then
    raise exception 'El traslado % ya no espera que lo acepten: %.', v_t.numero,
      case v_t.estado when 'ACEPTADA' then 'ya va de camino'
                      when 'RECIBIDA' then 'ya se recibió'
                      else 'está cancelado' end
      using errcode = '55000';
  end if;

  select * into v_origen  from public.almacenes where id = v_t.origen_id;
  select * into v_destino from public.almacenes where id = v_t.destino_id;

  v_como := private.como_actua_en(v_t.origen_id);
  if v_como is null then
    raise exception 'El traslado % lo acepta quien responde por "%"%, o administración.',
      v_t.numero, v_origen.nombre, private.quien_responde_frase(v_t.origen_id)
      using errcode = '42501';
  end if;

  if not v_destino.activo then
    raise exception 'El almacén "%" está inactivo y no puede recibir material: cancela el traslado.', v_destino.nombre
      using errcode = '22023';
  end if;

  v_camino := private.sitio_en_camino();
  if v_camino is null then
    raise exception 'Falta el sitio «En camino», donde espera lo que va de un sitio a otro.' using errcode = 'P0002';
  end if;

  select nombre into v_articulo from public.articulos where id = v_t.articulo_id;

  select * into v_mov from private.mover_en_traslado(
    p_de => v_t.origen_id, p_a => v_camino, p_articulo => v_t.articulo_id,
    p_cantidad => v_t.cantidad, p_dueno => v_t.propietario,
    p_nota_sale  => format('Traslado %s a %s: sale y va de camino. %s', v_t.numero, v_destino.nombre, v_t.motivo),
    p_nota_entra => format('Traslado %s de %s a %s: va de camino. %s', v_t.numero, v_origen.nombre, v_destino.nombre, v_t.motivo),
    p_fecha => v_hoy,
    p_presentaciones => v_t.presentaciones, p_presentacion => v_t.presentacion, p_suelto => v_t.suelto);

  update public.traslados
     set estado = 'ACEPTADA',
         aceptado_por = (select auth.uid()), aceptado_en = now(),
         aceptado_de_respaldo = (v_como = 'RESPALDO'),
         mov_salida = v_mov.salida, mov_en_camino = v_mov.entrada
   where id = p_id;

  perform private.notificar(
    'INVENTARIO', 'TRASLADO_ACEPTADO',
    format('%s: %s va de camino a %s', v_t.numero, v_articulo, v_destino.nombre),
    format('Salió de %s. Lo recibe quien responde por %s.', v_origen.nombre, v_destino.nombre),
    '/app/inventario/transferencias', array['ALMACEN', 'GERENTE_GENERAL'], 'ATENCION');

  return p_id;
end;
$$;

create or replace function public.recibir_traslado(p_id bigint)
returns bigint
language plpgsql security definer set search_path to ''
as $$
declare
  v_t       public.traslados;
  v_origen  public.almacenes;
  v_destino public.almacenes;
  v_como    text;
  v_costo   numeric;
  v_mov     record;
  v_articulo text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;

  select * into v_t from public.traslados where id = p_id for update;
  if v_t.id is null then
    raise exception 'No existe el traslado %.', p_id using errcode = 'P0002';
  end if;
  if v_t.estado <> 'ACEPTADA' then
    raise exception 'El traslado % no está de camino: %.', v_t.numero,
      case v_t.estado when 'SOLICITUD' then 'todavía nadie lo ha aceptado'
                      when 'RECIBIDA' then 'ya se recibió'
                      else 'está cancelado' end
      using errcode = '55000';
  end if;

  select * into v_origen  from public.almacenes where id = v_t.origen_id;
  select * into v_destino from public.almacenes where id = v_t.destino_id;

  v_como := private.como_actua_en(v_t.destino_id);
  if v_como is null then
    raise exception 'El traslado % lo recibe quien responde por "%"%, o administración.',
      v_t.numero, v_destino.nombre, private.quien_responde_frase(v_t.destino_id)
      using errcode = '42501';
  end if;

  if not v_destino.activo then
    raise exception 'El almacén "%" está inactivo y no puede recibir material: cancela el traslado y vuelve al origen.', v_destino.nombre
      using errcode = '22023';
  end if;

  -- Entra al costo con el que salió, no al promedio de «En camino».
  select costo_usd into v_costo from public.inventario_movimientos where id = v_t.mov_salida;
  select nombre into v_articulo from public.articulos where id = v_t.articulo_id;

  select * into v_mov from private.mover_en_traslado(
    p_de => (select almacen_id from public.inventario_movimientos where id = v_t.mov_en_camino),
    p_a => v_t.destino_id, p_articulo => v_t.articulo_id,
    p_cantidad => v_t.cantidad, p_dueno => v_t.propietario,
    p_nota_sale  => format('Traslado %s: llega a %s. %s', v_t.numero, v_destino.nombre, v_t.motivo),
    p_nota_entra => format('Traslado %s desde %s. %s', v_t.numero, v_origen.nombre, v_t.motivo),
    p_costo => v_costo, p_costo_fijo => true,
    p_origen => v_t.mov_en_camino, p_fecha => private.hoy_aqui(),
    p_presentaciones => v_t.presentaciones, p_presentacion => v_t.presentacion, p_suelto => v_t.suelto);

  update public.traslados
     set estado = 'RECIBIDA',
         recibido_por = (select auth.uid()), recibido_en = now(),
         recibido_de_respaldo = (v_como = 'RESPALDO'),
         mov_llegada = v_mov.entrada
   where id = p_id;

  perform private.notificar(
    'INVENTARIO', 'TRASLADO_RECIBIDO',
    format('%s: %s llegó a %s', v_t.numero, v_articulo, v_destino.nombre),
    format('Salió de %s.', v_origen.nombre),
    '/app/inventario/transferencias', array['ALMACEN', 'GERENTE_GENERAL'], 'INFO');

  return p_id;
end;
$$;

create or replace function public.cancelar_traslado(p_id bigint, p_motivo text)
returns bigint
language plpgsql security definer set search_path to ''
as $$
declare
  v_t          public.traslados;
  v_origen     public.almacenes;
  v_destino    public.almacenes;
  v_en_origen  text;
  v_en_destino text;
  v_costo      numeric;
  v_mov        record;
  v_vuelta     bigint;
  v_motivo     text := btrim(coalesce(p_motivo, ''));
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;
  if length(v_motivo) < 4 then
    raise exception 'Escribe por qué se cancela.' using errcode = '22023';
  end if;

  select * into v_t from public.traslados where id = p_id for update;
  if v_t.id is null then
    raise exception 'No existe el traslado %.', p_id using errcode = 'P0002';
  end if;
  if v_t.estado = 'RECIBIDA' then
    raise exception 'El traslado % ya se recibió y no se cancela.', v_t.numero
      using errcode = '55000',
            hint = 'Si hace falta devolver el material, se pide un traslado de vuelta.';
  end if;
  if v_t.estado = 'CANCELADA' then
    raise exception 'El traslado % ya está cancelado.', v_t.numero using errcode = '55000';
  end if;

  select * into v_origen  from public.almacenes where id = v_t.origen_id;
  select * into v_destino from public.almacenes where id = v_t.destino_id;
  v_en_origen  := private.como_actua_en(v_t.origen_id);
  v_en_destino := private.como_actua_en(v_t.destino_id);

  if v_t.estado = 'SOLICITUD' then
    if not (v_t.solicitado_por = (select auth.uid()) or v_en_origen is not null or v_en_destino is not null) then
      raise exception 'La solicitud % la cancela quien la pidió, quien responde por "%" o por "%", o administración.',
        v_t.numero, v_origen.nombre, v_destino.nombre
        using errcode = '42501';
    end if;
  else
    -- Aceptada: el material ya salió, y cancelar es devolverlo al origen.
    if v_en_origen is null and v_en_destino is null then
      raise exception 'El traslado % ya salió: lo cancela quien responde por "%" o por "%", o administración.',
        v_t.numero, v_origen.nombre, v_destino.nombre
        using errcode = '42501';
    end if;

    select costo_usd into v_costo from public.inventario_movimientos where id = v_t.mov_salida;

    select * into v_mov from private.mover_en_traslado(
      p_de => (select almacen_id from public.inventario_movimientos where id = v_t.mov_en_camino),
      p_a => v_t.origen_id, p_articulo => v_t.articulo_id,
      p_cantidad => v_t.cantidad, p_dueno => v_t.propietario,
      p_nota_sale  => format('Traslado %s cancelado: vuelve a %s. %s', v_t.numero, v_origen.nombre, v_motivo),
      p_nota_entra => format('Traslado %s cancelado: vuelve de camino a %s. %s', v_t.numero, v_destino.nombre, v_motivo),
      p_costo => v_costo, p_costo_fijo => true,
      p_origen => v_t.mov_en_camino, p_fecha => private.hoy_aqui(),
      p_presentaciones => v_t.presentaciones, p_presentacion => v_t.presentacion, p_suelto => v_t.suelto);
    v_vuelta := v_mov.entrada;
  end if;

  update public.traslados
     set estado = 'CANCELADA',
         cancelado_por = (select auth.uid()), cancelado_en = now(),
         motivo_cancelacion = v_motivo,
         mov_vuelta = v_vuelta
   where id = p_id;

  perform private.notificar(
    'INVENTARIO', 'TRASLADO_CANCELADO',
    format('%s cancelado', v_t.numero),
    case when v_t.estado = 'ACEPTADA'
         then format('Iba de %s a %s y vuelve a %s. %s', v_origen.nombre, v_destino.nombre, v_origen.nombre, v_motivo)
         else format('Pedía mover de %s a %s. %s', v_origen.nombre, v_destino.nombre, v_motivo) end,
    '/app/inventario/transferencias', array['ALMACEN', 'GERENTE_GENERAL'], 'INFO');

  return p_id;
end;
$$;

/*
  QUÉ PUEDE HACER QUIEN MIRA LA LISTA.

  La pantalla lo necesita para ofrecer «Aceptar» o «Recibir» solo a quien puede.
  No va dentro de la vista: la vista corre con los permisos de quien la lee, y
  ese no alcanza `private`. La base vuelve a comprobarlo al pulsar.
*/
create or replace function public.como_actuo_en_traslados()
returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'yo', (select auth.uid()),
    'respaldo', private.tiene_rol('GERENTE_GENERAL'),
    'sitios', coalesce(
      (select jsonb_agg(a.id order by a.id)
         from public.almacenes a
         join public.empleados e on e.id = a.responsable_id
         join public.perfiles p on p.id = e.perfil_id
        where e.perfil_id = (select auth.uid()) and e.activo and p.activo),
      '[]'::jsonb));
end;
$$;

revoke execute on function public.solicitar_traslado(bigint,bigint,bigint,numeric,text,date,numeric,text,numeric,text,boolean) from public, anon;
revoke execute on function public.aceptar_traslado(bigint) from public, anon;
revoke execute on function public.recibir_traslado(bigint) from public, anon;
revoke execute on function public.cancelar_traslado(bigint,text) from public, anon;
revoke execute on function public.como_actuo_en_traslados() from public, anon;

grant execute on function public.solicitar_traslado(bigint,bigint,bigint,numeric,text,date,numeric,text,numeric,text,boolean) to authenticated, service_role;
grant execute on function public.aceptar_traslado(bigint) to authenticated, service_role;
grant execute on function public.recibir_traslado(bigint) to authenticated, service_role;
grant execute on function public.cancelar_traslado(bigint,text) to authenticated, service_role;
grant execute on function public.como_actuo_en_traslados() to authenticated, service_role;

comment on function public.solicitar_traslado(bigint,bigint,bigint,numeric,text,date,numeric,text,numeric,text,boolean) is
  'Pide un traslado (numero TRA, estado SOLICITUD). Con p_inmediato, sale y llega en el acto y queda RECIBIDA: '
  'exige responder por los dos sitios o ser administracion. Rol ALMACEN.';
comment on function public.aceptar_traslado(bigint) is
  'SOLICITUD -> ACEPTADA. El material sale del origen y espera en «En camino». Responsable del origen o administracion.';
comment on function public.recibir_traslado(bigint) is
  'ACEPTADA -> RECIBIDA. Entra al destino al costo con el que salio. Responsable del destino o administracion.';
comment on function public.cancelar_traslado(bigint,text) is
  'SOLICITUD o ACEPTADA -> CANCELADA. Si ya habia salido, vuelve al origen al mismo costo.';
comment on function public.como_actuo_en_traslados() is
  'Para la pantalla: {yo, respaldo, sitios[]}, los sitios de los que quien llama es responsable.';

-- ---------------------------------------------------------------------------
-- 8. Lo de un traslado con número no se reversa suelto
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_def   text := pg_get_functiondef('public.reversar_movimiento(bigint,text)'::regprocedure);
  v_ancla text := $a$  perform private.exigir_no_reversado(v_mov.id, v_mov.numero);
$a$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'reversar_movimiento: la comprobacion de reverso previo no aparece exactamente una vez';
  end if;

  v_def := replace(v_def, v_ancla, $n$  /*
    LO DE UN TRASLADO CON NÚMERO NO SE REVERSA SUELTO.

    Sus asientos cuelgan de un documento con estado. Reversar uno dejaría el
    traslado diciendo «recibido» con el material de vuelta en el origen, o un
    hueco en «En camino». Se cancela desde el traslado, que escribe su propia
    vuelta; y lo recibido se devuelve con un traslado de vuelta.
  */
  if exists (select 1 from public.traslados t
              where v_mov.id in (t.mov_salida, t.mov_en_camino, t.mov_llegada, t.mov_vuelta))
     or exists (select 1 from public.almacenes a
                 where a.id = v_mov.almacen_id and a.tipo = 'TRANSITO') then
    raise exception 'El movimiento % es de un traslado con número propio: no se reversa suelto.', v_mov.numero
      using errcode = '55000',
            hint = 'Si todavía no se recibió, cancélalo en Transferencias. Si ya se recibió, pide un traslado de vuelta.';
  end if;

$n$ || v_ancla);

  execute v_def;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 9. La vista, los permisos de la tabla, la auditoría y el tiempo real
-- ---------------------------------------------------------------------------
create or replace view public.v_traslados with (security_invoker = on) as
select t.id, t.numero, t.estado, t.inmediato, t.fecha,
       t.origen_id,  o.codigo as origen_codigo,  o.nombre as origen,
       t.destino_id, d.codigo as destino_codigo, d.nombre as destino,
       t.articulo_id, a.codigo as articulo_codigo, a.nombre as articulo, a.unidad,
       t.cantidad, t.presentaciones, t.presentacion, t.suelto, t.propietario, t.motivo,
       t.solicitado_por, ps.nombre as solicitado_por_nombre, t.solicitado_en,
       t.aceptado_por,   pa.nombre as aceptado_por_nombre,   t.aceptado_en, t.aceptado_de_respaldo,
       t.recibido_por,   pr.nombre as recibido_por_nombre,   t.recibido_en, t.recibido_de_respaldo,
       t.cancelado_por,  pc.nombre as cancelado_por_nombre,  t.cancelado_en, t.motivo_cancelacion,
       t.mov_salida, t.mov_en_camino, t.mov_llegada, t.mov_vuelta
  from public.traslados t
  left join public.almacenes o on o.id = t.origen_id
  left join public.almacenes d on d.id = t.destino_id
  left join public.articulos a on a.id = t.articulo_id
  left join public.perfiles ps on ps.id = t.solicitado_por
  left join public.perfiles pa on pa.id = t.aceptado_por
  left join public.perfiles pr on pr.id = t.recibido_por
  left join public.perfiles pc on pc.id = t.cancelado_por;

comment on view public.v_traslados is
  'Los traslados con sus nombres. Sin cifras de dinero: el costo se lee del libro, donde ya lo cubre su permiso.';

drop policy if exists traslados_lectura on public.traslados;
create policy traslados_lectura on public.traslados
  for select to authenticated
  using (private.tiene_permiso('INVENTARIO', 'LECTURA')
         or private.responde_por(origen_id)
         or private.responde_por(destino_id));

revoke all on public.traslados from anon, authenticated;
grant select on public.traslados to authenticated;
revoke all on public.v_traslados from anon, authenticated;
grant select on public.v_traslados to authenticated;

drop trigger if exists trg_auditar on public.traslados;
create trigger trg_auditar after insert or update or delete on public.traslados
  for each row execute function private.auditar('id');

drop trigger if exists trg_normalizar on public.traslados;
create trigger trg_normalizar before insert or update on public.traslados
  for each row execute function private.normalizar_texto('presentacion', 'motivo', 'motivo_cancelacion');

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is not null then
    insert into public.auditoria_modulos (tabla, modulo) values ('traslados', 'INVENTARIO')
    on conflict (tabla) do update set modulo = excluded.modulo;
  end if;

  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'traslados') then
    alter publication supabase_realtime add table public.traslados;
  end if;
end
$mapa$;

-- ---------------------------------------------------------------------------
-- Comprobación
-- ---------------------------------------------------------------------------
do $ver$
begin
  if private.sitio_en_camino() is null then
    raise exception 'no quedo el sitio «En camino»';
  end if;
  if position('cantera.traslado_en_curso' in pg_get_functiondef('private.registrar_movimiento'::regproc)) = 0 then
    raise exception 'registrar_movimiento no cierra «En camino»';
  end if;
  if to_regprocedure('public.solicitar_traslado(bigint,bigint,bigint,numeric,text,date,numeric,text,numeric,text,boolean)') is null
     or to_regprocedure('public.aceptar_traslado(bigint)') is null
     or to_regprocedure('public.recibir_traslado(bigint)') is null
     or to_regprocedure('public.cancelar_traslado(bigint,text)') is null then
    raise exception 'falta una de las puertas del traslado';
  end if;
  if position('traslado con número propio' in pg_get_functiondef('public.reversar_movimiento(bigint,text)'::regprocedure)) = 0 then
    raise exception 'reversar_movimiento no protege los traslados con numero';
  end if;
  if has_function_privilege('anon', 'public.solicitar_traslado(bigint,bigint,bigint,numeric,text,date,numeric,text,numeric,text,boolean)', 'execute') then
    raise exception 'solicitar_traslado quedo abierta sin sesion';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'traslados') then
    raise exception 'traslados sin politica de lectura';
  end if;
end
$ver$;
