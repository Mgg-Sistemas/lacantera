/*
  EL VALE DE COMBUSTIBLE SE CORRIGE Y SE ANULA.

  Christopher, 05/10/2026: «si está en Golden, hazlo, sin romper ni dañar
  nada», y «se debería poder editar tanto de la computadora como del
  teléfono». En Golden Touch el movimiento del tanque se edita desde la PC
  (litros, equipo, hora, recalculando saldos) y se borra desde el teléfono.

  Aquí entra la misma capacidad con los rieles de la casa, que no borra ni
  pisa nada:

  - ANULAR: el vale no se borra; queda anulado con motivo, quién y cuándo, y
    el combustible vuelve al tanque con un REVERSO a la vista, al costo y al
    dueño del movimiento original. Quien tiene escritura anula el del día;
    el de otro día exige control total (la regla de las comidas).

  - CORREGIR: el vale conserva su número y queda marcado corregido (quién y
    cuándo). Los datos del papel —horómetro, quién recibió, motivo, máquina,
    nota— se corrigen en la fila. La CANTIDAD y la FECHA tocan inventario,
    así que ahí la corrección hace REVERSO del movimiento original y emite
    una salida nueva al promedio vigente: el libro cuenta la historia entera
    en vez de reescribirla. Mismo reparto de permisos que anular.

  - Las reglas del despacho se revalidan al corregir: tope de tres por
    máquina y día (sin contar este vale ni los anulados), horómetro que no
    retrocede (ídem), capacidad y combustible de la máquina, existencia.

  Y el contrato que `despachar_combustible` dejó escrito se cumple: «si
  algún día los vales se anulan, este conteo tiene que excluir los
  anulados». El parche anclado de abajo añade exactamente eso a sus dos
  filtros, y si la función viva cambió y el ancla no está, avisa y no toca
  nada.
*/

-- ───────────────────────────── 1 · el rastro en la tabla, aditivo ────────

alter table public.despachos_combustible
  add column if not exists anulado_en timestamptz,
  add column if not exists anulado_por uuid references auth.users (id),
  add column if not exists motivo_anulacion text,
  add column if not exists corregido_en timestamptz,
  add column if not exists corregido_por uuid references auth.users (id),
  add column if not exists motivo_correccion text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.despachos_combustible'::regclass
      and conname = 'despacho_anulado_con_motivo'
  ) then
    alter table public.despachos_combustible
      add constraint despacho_anulado_con_motivo
      check ((anulado_en is null) = (motivo_anulacion is null));
  end if;
end $$;

-- ─────────────── 2 · la vista enseña el estado (columnas al final) ───────

create or replace view public.v_despachos_combustible
with (security_invoker = on) as
select d.id,
       d.numero,
       d.fecha,
       d.hora,
       d.motivo,
       d.motivo_detalle,
       d.articulo_id,
       a.codigo as articulo_codigo,
       a.nombre as combustible,
       a.unidad,
       d.almacen_id,
       al.nombre as tanque,
       d.cantidad,
       d.maquina_id,
       mq.codigo as maquina_codigo,
       coalesce(mq.nombre, d.destino) as destino,
       mq.tipo as maquina_tipo,
       d.horometro,
       d.empleado_id,
       d.recibio_nombre as recibio,
       d.recibio_cedula,
       d.surtio_nombre as surtio,
       d.registrado_por,
       d.costo_usd,
       d.nota,
       d.registrado_en,
       d.anulado_en,
       d.motivo_anulacion,
       d.corregido_en
  from public.despachos_combustible d
  join public.articulos a on a.id = d.articulo_id
  join public.almacenes al on al.id = d.almacen_id
  left join public.maquinaria mq on mq.id = d.maquina_id;

-- ──────────────────────────────── 3 · anular, con motivo y reverso ───────

create or replace function public.anular_despacho_combustible(p_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_d   record;
  v_mov record;
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');

  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Diga por qué se anula.' using errcode = '22023';
  end if;

  select * into v_d from public.despachos_combustible where id = p_id for update;
  if v_d.id is null then
    raise exception 'Ese vale no existe.' using errcode = 'P0002';
  end if;
  if v_d.anulado_en is not null then
    raise exception 'El vale % ya estaba anulado.', v_d.numero using errcode = '55000';
  end if;

  -- El error se corrige donde se cometió: el del día lo anula quien despacha;
  -- el de otro día cambia números que alguien pudo haber mirado.
  if v_d.fecha <> private.hoy_aqui() then
    perform private.exigir_permiso('COMBUSTIBLE', 'TOTAL');
  end if;

  if v_d.movimiento_id is not null then
    select costo_usd, propietario into v_mov
      from public.inventario_movimientos where id = v_d.movimiento_id;

    perform pg_catalog.pg_advisory_xact_lock(v_d.almacen_id::int, v_d.articulo_id::int);
    perform private.registrar_movimiento(
      'REVERSO', 1, v_d.almacen_id, v_d.articulo_id, v_d.cantidad, v_mov.costo_usd,
      format('Anulación del vale %s: %s', v_d.numero, btrim(p_motivo)),
      null, null, v_d.movimiento_id, private.hoy_aqui(),
      p_propietario => v_mov.propietario);
  end if;

  update public.despachos_combustible
     set anulado_en = now(), anulado_por = (select auth.uid()),
         motivo_anulacion = btrim(p_motivo)
   where id = p_id;
end;
$$;

revoke all on function public.anular_despacho_combustible(bigint, text) from public, anon;
grant execute on function public.anular_despacho_combustible(bigint, text) to authenticated;

-- ─────────────────────────────── 4 · corregir, con rastro y reverso ──────

create or replace function public.corregir_despacho_combustible(
  p_id              bigint,
  p_cantidad        numeric,
  p_motivo          text,
  p_motivo_detalle  text default null,
  p_maquina_id      bigint default null,
  p_destino         text default null,
  p_horometro       numeric default null,
  p_empleado_id     bigint default null,
  p_recibio_nombre  text default null,
  p_recibio_cedula  text default null,
  p_fecha           date default null,
  p_nota            text default null,
  p_motivo_correccion text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  c_max_vales_dia constant integer := 3;
  v_d record; v_mov record; v_art record; v_maq record; v_comb record;
  v_hoy date := private.hoy_aqui();
  v_fecha date;
  v_detalle text; v_donde text; v_recibe text; v_cedula text;
  v_vales integer; v_ultimo numeric; v_lectura numeric; v_tope numeric;
  v_hay numeric; v_unitario numeric; v_mov_nuevo bigint;
  v_toca_inventario boolean;
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');

  select * into v_d from public.despachos_combustible where id = p_id for update;
  if v_d.id is null then
    raise exception 'Ese vale no existe.' using errcode = 'P0002';
  end if;
  if v_d.anulado_en is not null then
    raise exception 'El vale % está anulado: lo anulado no se corrige, se emite otro.', v_d.numero
      using errcode = '55000';
  end if;

  v_fecha := coalesce(p_fecha, v_d.fecha);

  -- Tocar un vale de otro día —o llevárselo a otro día— exige control total.
  -- Hoy-con-hoy es lo único que corrige la escritura sola.
  if v_d.fecha <> v_hoy or v_fecha <> v_hoy then
    perform private.exigir_permiso('COMBUSTIBLE', 'TOTAL');
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if v_fecha > v_hoy then
    raise exception 'No se despacha combustible con fecha futura.' using errcode = '22023';
  end if;

  v_detalle := private.motivo_del_vale(p_motivo, p_motivo_detalle);

  select * into v_art from public.articulos where id = v_d.articulo_id;

  /*
    LAS MISMAS REGLAS QUE AL DESPACHAR, revalidadas aquí porque la corrección
    puede cambiar justo lo que esas reglas cuidan. Es deliberadamente un
    espejo de `despachar_combustible`: si aquella cambia sus reglas, esta
    tiene que acompañarla. El propio vale se excluye de los conteos —se está
    reemplazando a sí mismo— y los anulados también.
  */
  if p_maquina_id is not null then
    select * into v_maq from public.maquinaria where id = p_maquina_id;
    if v_maq.id is null then
      raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
    end if;
    v_donde := v_maq.nombre;

    if v_maq.capacidad_combustible is not null and p_cantidad > v_maq.capacidad_combustible then
      raise exception 'Al tanque de "%" le caben % %, y se están poniendo %.',
        v_maq.nombre, v_maq.capacidad_combustible, v_art.unidad, p_cantidad using errcode = '22023';
    end if;

    if v_maq.combustible_id is not null and v_maq.combustible_id <> v_d.articulo_id then
      select nombre into v_comb from public.articulos where id = v_maq.combustible_id;
      raise exception '"%" usa % y este vale es de %.', v_maq.nombre,
        coalesce(v_comb.nombre, 'otro combustible'), v_art.nombre using errcode = '22023';
    end if;

    select count(*) into v_vales from public.despachos_combustible d
     where d.maquina_id = p_maquina_id and d.fecha = v_fecha
       and d.id <> p_id and d.anulado_en is null;
    if v_vales >= c_max_vales_dia then
      raise exception 'A "%" ya se le surtió % veces el %. El máximo son % al día.',
        v_maq.nombre, v_vales, to_char(v_fecha, 'DD/MM/YYYY'), c_max_vales_dia using errcode = '22023';
    end if;

    if p_horometro is null then
      raise exception 'Hace falta el horómetro de "%".', v_maq.nombre using errcode = '23514';
    end if;

    select d.horometro into v_ultimo from public.despachos_combustible d
     where d.maquina_id = p_maquina_id and d.horometro is not null and d.fecha <= v_fecha
       and d.id <> p_id and d.anulado_en is null
     order by d.fecha desc, d.id desc limit 1;

    select l.final into v_lectura from public.horometro_lecturas l
     where l.maquina_id = p_maquina_id and l.fecha <= v_fecha
     order by l.fecha desc, l.id desc limit 1;

    v_tope := greatest(coalesce(v_ultimo, 0), coalesce(v_lectura, 0));
    if (v_ultimo is not null or v_lectura is not null) and p_horometro < v_tope then
      raise exception 'El horómetro de "%" no retrocede: lo último anotado marcaba % y se está poniendo %.',
        v_maq.nombre, v_tope, p_horometro using errcode = '22023';
    end if;
  else
    if length(btrim(coalesce(p_destino, ''))) < 3 then
      raise exception 'Hay que decir a qué se le echó.' using errcode = '23514';
    end if;
    v_donde := btrim(p_destino);
  end if;

  if p_empleado_id is not null then
    select btrim(e.nombres || ' ' || e.apellidos), e.cedula into v_recibe, v_cedula
      from public.empleados e where e.id = p_empleado_id;
    if v_recibe is null then
      raise exception 'No existe el empleado %.', p_empleado_id using errcode = 'P0002';
    end if;
  else
    v_recibe := btrim(coalesce(p_recibio_nombre, ''));
    v_cedula := nullif(btrim(coalesce(p_recibio_cedula, '')), '');
    if length(v_recibe) < 3 then
      raise exception 'Hay que decir quién recibió el combustible.' using errcode = '23514';
    end if;
  end if;

  /*
    EL INVENTARIO SOLO SE TOCA SI CAMBIÓ LO QUE EL INVENTARIO MIDE: la
    cantidad o la fecha. Y nunca editando el movimiento viejo: REVERSO al
    costo y dueño originales, y una salida nueva al promedio vigente. Los
    dos quedan en el libro contando lo que pasó.
  */
  v_toca_inventario := v_d.movimiento_id is not null
    and (p_cantidad <> v_d.cantidad or v_fecha <> v_d.fecha);

  if v_toca_inventario then
    select costo_usd, propietario into v_mov
      from public.inventario_movimientos where id = v_d.movimiento_id;

    perform pg_catalog.pg_advisory_xact_lock(v_d.almacen_id::int, v_d.articulo_id::int);

    perform private.registrar_movimiento(
      'REVERSO', 1, v_d.almacen_id, v_d.articulo_id, v_d.cantidad, v_mov.costo_usd,
      format('Corrección del vale %s', v_d.numero),
      null, null, v_d.movimiento_id, v_hoy,
      p_propietario => v_mov.propietario);

    v_hay := private.existencia_para_escribir(v_d.almacen_id, v_d.articulo_id, v_mov.propietario);
    if v_hay < p_cantidad then
      raise exception 'En el tanque solo quedan % % de %.',
        private.cantidad_es(v_hay), v_art.unidad, v_art.nombre using errcode = '55000';
    end if;

    v_unitario := private.costo_promedio(v_d.almacen_id, v_d.articulo_id, v_mov.propietario);
    v_mov_nuevo := private.registrar_movimiento(
      'SALIDA_CONSUMO', -1, v_d.almacen_id, v_d.articulo_id, p_cantidad, v_unitario,
      format('Combustible · %s · %s (vale %s corregido)', v_donde, coalesce(v_detalle, p_motivo), v_d.numero),
      null, null, null, v_fecha,
      p_propietario => v_mov.propietario);
  end if;

  update public.despachos_combustible
     set cantidad        = p_cantidad,
         motivo          = p_motivo,
         motivo_detalle  = v_detalle,
         maquina_id      = p_maquina_id,
         destino         = nullif(btrim(coalesce(p_destino, '')), ''),
         horometro       = p_horometro,
         empleado_id     = p_empleado_id,
         recibio_nombre  = v_recibe,
         recibio_cedula  = v_cedula,
         fecha           = v_fecha,
         hora            = case when v_fecha = v_d.fecha then v_d.hora
                                when v_fecha = v_hoy then (now() at time zone 'America/Caracas')::time
                                else null end,
         nota            = nullif(btrim(coalesce(p_nota, '')), ''),
         costo_usd       = case when v_toca_inventario then v_unitario * p_cantidad else v_d.costo_usd end,
         movimiento_id   = coalesce(v_mov_nuevo, v_d.movimiento_id),
         corregido_en    = now(),
         corregido_por   = (select auth.uid()),
         motivo_correccion = nullif(btrim(coalesce(p_motivo_correccion, '')), '')
   where id = p_id;
end;
$$;

revoke all on function public.corregir_despacho_combustible(bigint, numeric, text, text, bigint, text, numeric, bigint, text, text, date, text, text) from public, anon;
grant execute on function public.corregir_despacho_combustible(bigint, numeric, text, text, bigint, text, numeric, bigint, text, text, date, text, text) to authenticated;

-- ── 5 · el contrato de despachar_combustible: los anulados no cuentan ────

do $$
declare
  v_def   text;
  v_ancla_tope text := 'where d.maquina_id = p_maquina_id and d.fecha = v_fecha;';
  v_ancla_horo text := 'where d.maquina_id = p_maquina_id and d.horometro is not null and d.fecha <= v_fecha';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'despachar_combustible';

  if v_def is null then
    raise notice 'despachar_combustible no existe: nada que parchear.';
    return;
  end if;
  if v_def like '%anulado_en is null%' then
    raise notice 'despachar_combustible ya excluye anulados: nada que hacer.';
    return;
  end if;

  if (length(v_def) - length(replace(v_def, v_ancla_tope, ''))) / length(v_ancla_tope) <> 1
     or (length(v_def) - length(replace(v_def, v_ancla_horo, ''))) / length(v_ancla_horo) <> 1 then
    raise notice 'El ancla no aparece exactamente una vez: la función viva cambió y el parche NO se aplica. Revisar a mano.';
    return;
  end if;

  v_def := replace(v_def, v_ancla_tope,
    'where d.maquina_id = p_maquina_id and d.fecha = v_fecha and d.anulado_en is null;');
  v_def := replace(v_def, v_ancla_horo,
    'where d.maquina_id = p_maquina_id and d.horometro is not null and d.fecha <= v_fecha and d.anulado_en is null');

  execute v_def;
end $$;
