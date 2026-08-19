-- ---------------------------------------------------------------------------
-- Maquinaria y vehículos entran por donde entra todo lo demás
--
-- LA DEUDA QUE SE SALDA AQUÍ
--
-- `maquinaria`, `horometro_lecturas`, `mantenimientos` (20260819100000) y
-- `vehiculos` (20260819120000) se escribieron con INSERT/UPDATE directos desde
-- el navegador. Eran las únicas cuatro tablas del sistema con el GRANT de
-- escritura abierto a `authenticated` y las únicas con políticas RLS `for all`;
-- sus dos archivos de API eran los únicos de `src/lib/api/` con `.insert()`,
-- `.update()` o `.upsert()`. Los otros diecinueve pasan por `rpc()`.
--
-- POR QUÉ IMPORTA, MÁS ALLÁ DE LA COHERENCIA
--
-- Con el GRANT abierto, cualquiera con una sesión válida puede escribir esas
-- tablas desde la consola del navegador saltándose todo lo que la pantalla
-- comprueba. Y como no pasaban por función, tampoco había un sitio donde
-- comprobar nada: no se puede exigir que el final del horómetro sea mayor que
-- el inicial de ayer, ni que una máquina en el taller no cambie de estado a
-- mano, si el front escribe la fila él mismo.
--
-- Además quedaban fuera de la auditoría: eran las únicas tablas de negocio
-- donde nadie sabía quién cambió qué.
--
-- Ahora: funciones `security definer` como puerta única, GRANT revocado,
-- políticas solo de SELECT, y los disparadores de auditoría puestos.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Guardar una máquina
--
-- El estado no es parámetro. Se mueve por `cambiar_estado_maquina` y por las
-- funciones de mantenimiento, que es donde están las reglas de a dónde se
-- puede pasar desde dónde. Si se pudiera escribir aquí, editar la marca de una
-- máquina sería una vía para sacarla del taller sin cerrar su orden.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_maquina(
  p_id            bigint,
  p_codigo        text,
  p_nombre        text,
  p_tipo          text,
  p_marca         text     default null,
  p_modelo        text     default null,
  p_serial        text     default null,
  p_anio          smallint default null,
  p_almacen_id    bigint   default null,
  p_tope_horas    numeric  default 250,
  p_aviso_horas   numeric  default 200,
  p_alarma_horas  numeric  default 220,
  p_dias_mantenimiento smallint default null,
  p_nota          text     default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_id     bigint;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  if length(v_codigo) < 2 then
    raise exception 'La máquina necesita un código que la identifique.' using errcode = '23514';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'La máquina necesita un nombre.' using errcode = '23514';
  end if;
  if p_tipo not in ('EXCAVADORA','CARGADOR','CAMION','PLANTA','PERFORADORA',
                    'VEHICULO','GENERADOR','OTRO') then
    raise exception 'Tipo de máquina no válido: %.', p_tipo using errcode = '22023';
  end if;

  -- Los tres umbrales van en orden. La base lo exige igual, pero el mensaje de
  -- una restricción habla de la restricción; este habla de lo que pasó.
  if not (p_aviso_horas <= p_alarma_horas and p_alarma_horas <= p_tope_horas) then
    raise exception 'El aviso (%) tiene que ir antes que la alarma (%), y la alarma antes que el tope (%).',
      p_aviso_horas, p_alarma_horas, p_tope_horas using errcode = '22023';
  end if;
  if p_tope_horas <= 0 then
    raise exception 'El tope de horas tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if p_almacen_id is not null then
    perform 1 from public.almacenes where id = p_almacen_id;
    if not found then
      raise exception 'No existe el almacén %.', p_almacen_id using errcode = '23503';
    end if;
  end if;

  if p_id is null then
    insert into public.maquinaria
      (codigo, nombre, tipo, marca, modelo, serial, anio, almacen_id, estado,
       tope_horas, aviso_horas, alarma_horas, dias_mantenimiento, nota, creada_por)
    values
      (v_codigo, btrim(p_nombre), p_tipo,
       nullif(btrim(coalesce(p_marca, '')), ''), nullif(btrim(coalesce(p_modelo, '')), ''),
       nullif(btrim(coalesce(p_serial, '')), ''), p_anio, p_almacen_id, 'ACTIVA',
       p_tope_horas, p_aviso_horas, p_alarma_horas, p_dias_mantenimiento,
       nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.maquinaria
       set codigo = v_codigo,
           nombre = btrim(p_nombre),
           tipo   = p_tipo,
           marca  = nullif(btrim(coalesce(p_marca, '')), ''),
           modelo = nullif(btrim(coalesce(p_modelo, '')), ''),
           serial = nullif(btrim(coalesce(p_serial, '')), ''),
           anio   = p_anio,
           almacen_id = p_almacen_id,
           tope_horas = p_tope_horas,
           aviso_horas = p_aviso_horas,
           alarma_horas = p_alarma_horas,
           dias_mantenimiento = p_dias_mantenimiento,
           nota = nullif(btrim(coalesce(p_nota, '')), '')
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe la máquina %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe una máquina con el código %.', v_codigo using errcode = '23505';
end;
$func$;

-- ---------------------------------------------------------------------------
-- La lectura del horómetro del día
--
-- POR QUÉ AVISA CUANDO NO ARRASTRA
--
-- El inicial de hoy debería ser el final de la última lectura. Cuando no
-- coinciden, o falta un parte o alguien se equivocó de casilla, y en ambos
-- casos las horas quedan mal contadas — que es lo que corre el mantenimiento
-- de sitio. No se rechaza, porque la máquina pudo trabajar un día sin que
-- nadie anotara; se manda un aviso para que alguien lo mire mientras todavía
-- se acuerda de qué pasó ese día.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_lectura(
  p_maquina_id bigint,
  p_fecha      date,
  p_inicial    numeric,
  p_final      numeric
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_maq    record;
  v_fecha  date := coalesce(p_fecha, current_date);
  v_previo numeric;
  v_id     bigint;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select * into v_maq from public.maquinaria where id = p_maquina_id;
  if v_maq.id is null then
    raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
  end if;

  if p_inicial is null or p_final is null then
    raise exception 'Hacen falta las dos lecturas del reloj: la de arrancar y la de terminar.'
      using errcode = '23514';
  end if;
  if p_inicial < 0 or p_final < 0 then
    raise exception 'Un horómetro no marca números negativos.' using errcode = '22023';
  end if;
  if p_final < p_inicial then
    raise exception 'El horómetro no retrocede: el final (%) no puede ser menor que el inicial (%).',
      p_final, p_inicial using errcode = '22023';
  end if;
  if v_fecha > current_date then
    raise exception 'No se anota una jornada que todavía no ocurrió.' using errcode = '22023';
  end if;

  select final into v_previo
    from public.horometro_lecturas
   where maquina_id = p_maquina_id and fecha < v_fecha
   order by fecha desc
   limit 1;

  insert into public.horometro_lecturas (maquina_id, fecha, inicial, final, creada_por)
  values (p_maquina_id, v_fecha, p_inicial, p_final, (select auth.uid()))
  on conflict (maquina_id, fecha) do update
    set inicial = excluded.inicial,
        final   = excluded.final,
        creada_por = excluded.creada_por
  returning id into v_id;

  if v_previo is not null and p_inicial <> v_previo then
    perform private.notificar(
      'MAQUINARIA', 'HOROMETRO_NO_ARRASTRA',
      format('El horómetro de %s no arrastra', v_maq.nombre),
      format('La lectura anterior terminó en %s y la del %s arranca en %s.',
             v_previo, to_char(v_fecha, 'DD/MM/YYYY'), p_inicial),
      '/app/maquinaria', array['OPERACIONES'], 'ATENCION');
  end if;

  return v_id;
end;
$func$;

-- ---------------------------------------------------------------------------
-- Guardar un vehículo
-- ---------------------------------------------------------------------------
create or replace function public.guardar_vehiculo(
  p_id            bigint,
  p_placa         text,
  p_tipo          text,
  p_capacidad_m3  numeric,
  p_descripcion   text    default null,
  p_capacidad_ton numeric default null,
  p_propio        boolean default true,
  p_transportista text    default null,
  p_maquina_id    bigint  default null,
  p_activo        boolean default true,
  p_nota          text    default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare v_id bigint;
begin
  perform private.exigir_permiso('DESPACHOS', 'ESCRITURA');

  if p_tipo not in ('VOLTEO','CHUTO','GANDOLA','CAVA','CISTERNA','OTRO') then
    raise exception 'Tipo de vehículo no válido: %.', p_tipo using errcode = '22023';
  end if;
  if coalesce(p_capacidad_m3, 0) <= 0 then
    raise exception 'Hay que decir cuántos metros cúbicos carga: es para lo que sirve tenerlo cargado.'
      using errcode = '23514';
  end if;
  if not p_propio and length(btrim(coalesce(p_transportista, ''))) = 0 then
    raise exception 'Un vehículo que no es de la empresa tiene que decir de quién es.'
      using errcode = '23514';
  end if;
  if p_maquina_id is not null then
    if not p_propio then
      raise exception 'Solo un vehículo de la empresa puede tener ficha de mantenimiento.'
        using errcode = '22023';
    end if;
    perform 1 from public.maquinaria where id = p_maquina_id;
    if not found then
      raise exception 'No existe la máquina %.', p_maquina_id using errcode = '23503';
    end if;
  end if;

  if p_id is null then
    insert into public.vehiculos
      (placa, tipo, descripcion, capacidad_m3, capacidad_ton, propio,
       transportista, maquina_id, activo, nota, creado_por)
    values
      (p_placa, p_tipo, nullif(btrim(coalesce(p_descripcion, '')), ''),
       p_capacidad_m3, p_capacidad_ton, p_propio,
       case when p_propio then null else btrim(p_transportista) end,
       case when p_propio then p_maquina_id else null end,
       p_activo, nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.vehiculos
       set placa = p_placa,
           tipo  = p_tipo,
           descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
           capacidad_m3 = p_capacidad_m3,
           capacidad_ton = p_capacidad_ton,
           propio = p_propio,
           transportista = case when p_propio then null else btrim(p_transportista) end,
           maquina_id = case when p_propio then p_maquina_id else null end,
           activo = p_activo,
           nota = nullif(btrim(coalesce(p_nota, '')), '')
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe el vehículo %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya hay un vehículo con la placa %.',
      upper(regexp_replace(btrim(p_placa), '\s+', '', 'g')) using errcode = '23505';
end;
$func$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke execute on function public.guardar_maquina(
  bigint, text, text, text, text, text, text, smallint, bigint,
  numeric, numeric, numeric, smallint, text) from public, anon;
grant execute on function public.guardar_maquina(
  bigint, text, text, text, text, text, text, smallint, bigint,
  numeric, numeric, numeric, smallint, text) to authenticated;

revoke execute on function public.registrar_lectura(bigint, date, numeric, numeric)
  from public, anon;
grant execute on function public.registrar_lectura(bigint, date, numeric, numeric)
  to authenticated;

revoke execute on function public.guardar_vehiculo(
  bigint, text, text, numeric, text, numeric, boolean, text, bigint, boolean, text)
  from public, anon;
grant execute on function public.guardar_vehiculo(
  bigint, text, text, numeric, text, numeric, boolean, text, bigint, boolean, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Se cierra la puerta lateral
--
-- El REVOKE y la política tienen que ir los dos: quitar el GRANT sin cambiar
-- la política deja una política `for all` que no protege nada porque el
-- permiso ya no está, y cambiar la política sin quitar el GRANT deja la
-- escritura abierta. Hacen falta las dos.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.maquinaria         from anon, authenticated;
revoke insert, update, delete on public.horometro_lecturas from anon, authenticated;
revoke insert, update, delete on public.mantenimientos     from anon, authenticated;
revoke insert, update, delete on public.vehiculos          from anon, authenticated;

-- Y de paso el catálogo de métodos de pago, que arrastraba el mismo agujero:
-- hoy solo lo tapa que la RLS no tenga política de escritura.
revoke insert, update, delete on public.metodos_pago       from anon, authenticated;

drop policy if exists maquinaria_escritura        on public.maquinaria;
drop policy if exists horometro_escritura         on public.horometro_lecturas;
drop policy if exists mantenimientos_escritura    on public.mantenimientos;
drop policy if exists vehiculos_escritura         on public.vehiculos;

-- ---------------------------------------------------------------------------
-- La auditoría
--
-- El bloque de 20260730120000 recorre las tablas de `public` y les pone
-- `trg_auditar`. Se vuelve a correr tal cual: las cinco tablas nuevas entran
-- solas, y las que ya lo tenían se lo vuelven a poner idéntico. Es más seguro
-- que enumerarlas a mano, que es como se quedó fuera la primera vez.
-- ---------------------------------------------------------------------------
do $$
declare
  v_t record;
begin
  for v_t in
    select c.relname as tabla,
           coalesce(
             (select string_agg(format('%L', a.attname), ', ' order by k.ord)
                from pg_index i
                cross join lateral unnest(i.indkey) with ordinality as k(att, ord)
                join pg_attribute a on a.attrelid = c.oid and a.attnum = k.att
               where i.indrelid = c.oid and i.indisprimary),
             '') as clave
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname not in (
         'auditoria', 'correlativos', 'notificaciones',
         'notificaciones_leidas', 'nomina_recibo_lineas')
     order by c.relname
  loop
    execute format('drop trigger if exists trg_auditar on public.%I', v_t.tabla);
    execute format(
      'create trigger trg_auditar after insert or update or delete on public.%I
         for each row execute function private.auditar(%s)',
      v_t.tabla, v_t.clave);
  end loop;
end
$$;
