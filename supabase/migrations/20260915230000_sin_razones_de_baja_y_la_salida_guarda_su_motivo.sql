/*
  SIN RAZONES DE BAJA, Y LA SALIDA GUARDA EL MOTIVO CON QUE SE HIZO

  Christopher, 15/09/2026:

    «Mantendremos el botón, pero todos los motivos referentes a "Baja" o "Dar
    de baja" deben ser eliminados del sistema; si se necesita sacar algún
    material, se hará por salidas».

    «El motivo que aparezca en pantalla debe ser fiel al motivo que aparezca en
    el PDF y la auditoría: no puede ser que en la pantalla diga "Se lo llevaron"
    y en otro sitio diga "Robado"».

    «No tocaremos lo existente».

  Ocupa el lugar de 20260915220000, que no llegó a correr —la base estaba en
  mantenimiento— y que renombraba esas razones en vez de quitarlas.

  POR QUÉ LA PANTALLA Y EL PAPEL NO DECÍAN LO MISMO

  `registrar_salidas` recibía la razón elegida —«SE LO LLEVARON», «VENTA»—, la
  convertía en consumo, merma o baja, y la soltaba. El papel que salía en el
  acto ponía el nombre de la razón porque lo tomaba del formulario; ese mismo
  papel reimpreso desde Movimientos, la auditoría y la historia del artículo
  solo tenían el tipo, o la causa de la baja con otra palabra. Cada sitio decía
  lo único que tenía.

  Ahora el movimiento guarda la razón en una columna nueva, con las palabras que
  tenía en la lista, y todos leen esa. Se guarda el NOMBRE y no el código por lo
  mismo que la forma de contar: la lista se edita, y un asiento tiene que poder
  leerse dentro de diez años sin depender de una tabla que cambia. El libro no
  admite UPDATE, así que el dato nace con el movimiento: por eso lo aprende
  `registrar_movimiento`, que es la única puerta que escribe en él.

  LAS CINCO RAZONES DE BAJA

  Se apagan —en esta base una razón no se borra, se apaga, igual que con el
  botón de la lista— y salen también de la lista de editar. No se pueden crear
  otras así ni revivirlas. `registrar_baja` se cierra para quien tiene sesión.

  LO QUE NO SE TOCA

  Ninguna fila del libro. Las cuatro salidas que se anotaron como baja —MOV
  0078, 0079, 0085 y 0086— siguen como están, con su causa. La columna nueva
  queda vacía en todo lo anterior: no se puede saber a posteriori con qué razón
  salió cada cosa, y no se va a inventar.
*/
alter table public.inventario_movimientos add column if not exists razon_salida text;

comment on column public.inventario_movimientos.razon_salida is
  'Por qué salió, con el nombre que la razón tenía en la lista ese día (SE USO TRABAJANDO, VENTA...). '
  'La escribe registrar_salidas. Nula en lo anterior al 15/09/2026 y en las salidas que no eligen razón.';

-- 1. registrar_movimiento aprende a escribirla. Cambia la firma, así que la
--    vieja se quita: con las dos, una llamada sin el parámetro nuevo no sabría
--    cuál elegir.
do $mig$
declare
  v_firma  text := 'private.registrar_movimiento(text,integer,bigint,bigint,numeric,numeric,text,bigint,bigint,bigint,date,bigint,text,text,numeric,numeric,text,numeric,numeric,text,text,text)';
  v_def    text := pg_get_functiondef(v_firma::regprocedure);
  v_anclas text[] := array[
    $a$p_propietario text DEFAULT NULL::text)$a$,
    $a$costo_unidad_capturada, moneda_capturada)$a$,
    $a$nullif(btrim(coalesce(p_moneda_capturada, '')), ''))$a$];
  v_nuevas text[] := array[
    $n$p_propietario text DEFAULT NULL::text, p_razon_salida text DEFAULT NULL::text)$n$,
    $n$costo_unidad_capturada, moneda_capturada, razon_salida)$n$,
    $n$nullif(btrim(coalesce(p_moneda_capturada, '')), ''),
     -- Por qué salió, con las palabras de la lista: ver la columna.
     nullif(btrim(coalesce(p_razon_salida, '')), ''))$n$];
begin
  for i in 1 .. array_length(v_anclas, 1) loop
    if (length(v_def) - length(replace(v_def, v_anclas[i], ''))) / length(v_anclas[i]) <> 1 then
      raise exception 'registrar_movimiento: el ancla % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_anclas[i], v_nuevas[i]);
  end loop;

  execute 'drop function ' || v_firma;
  execute v_def;
end
$mig$;

-- 2. registrar_salidas la pasa, no deja pasar una razón de baja aunque alguien
--    la vuelva a encender a mano, y deja de anotar bajas.
do $mig$
declare
  v_def    text := pg_get_functiondef('public.registrar_salidas(bigint,jsonb,text,text,date)'::regprocedure);
  v_anclas text[] := array[
    $a$v_tipo := v_clase.tipo;$a$,
    $a$if v_tipo = 'SALIDA_BAJA' or coalesce(v_clase.exige_detalle, false) then$a$,
    $a$p_suelto_capturado => case when v_pres > 0 then nullif(v_sueltas, 0) end);$a$];
  v_nuevas text[] := array[
    $n$if v_clase.tipo = 'SALIDA_BAJA' then
      raise exception 'La razón "%" ya no se usa: elige otra de la lista.', v_clase.nombre
        using errcode = '22023';
    end if;
    v_tipo := v_clase.tipo;$n$,
    $n$if coalesce(v_clase.exige_detalle, false) then$n$,
    $n$p_suelto_capturado => case when v_pres > 0 then nullif(v_sueltas, 0) end,
      -- Por qué salió, con las palabras de la lista: ver la columna del libro.
      p_razon_salida => v_clase.nombre);$n$];
  v_baja   text := $r$\n\s*if v_tipo = 'SALIDA_BAJA' then\s*insert into public\.inventario_bajas \(movimiento_id, causa, solicitada_por\)\s*values \(v_mov, v_clase\.causa_baja, \(select auth\.uid\(\)\)\);\s*end if;$r$;
  v_n      int;
begin
  for i in 1 .. array_length(v_anclas, 1) loop
    if (length(v_def) - length(replace(v_def, v_anclas[i], ''))) / length(v_anclas[i]) <> 1 then
      raise exception 'registrar_salidas: el ancla % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_anclas[i], v_nuevas[i]);
  end loop;

  select count(*) into v_n from regexp_matches(v_def, v_baja, 'g');
  if v_n <> 1 then
    raise exception 'registrar_salidas: la anotación de la baja no aparece exactamente una vez (%)', v_n;
  end if;
  v_def := regexp_replace(v_def, v_baja, '');

  execute v_def;
end
$mig$;

-- 3. Las razones de baja no salen en ninguna lista, tampoco en la de editar.
do $mig$
declare
  v_def   text := pg_get_functiondef('public.clases_de_salida(boolean)'::regprocedure);
  v_ancla text := $a$where activa or coalesce(p_incluir_apagadas, false)$a$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'clases_de_salida: el filtro no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_ancla, $n$where tipo <> 'SALIDA_BAJA'
     and (activa or coalesce(p_incluir_apagadas, false))$n$);
end
$mig$;

-- 4. Ni se crean razones así ni se reviven editándolas.
do $mig$
declare
  v_def   text := pg_get_functiondef('public.guardar_clase_de_salida(text,text,text,text,text,smallint,boolean,boolean)'::regprocedure);
  v_ancla text := $a$perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');$a$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'guardar_clase_de_salida: el permiso no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_ancla, v_ancla || $n$

  -- Las razones que daban el material por perdido se quitaron el 15/09/2026.
  if p_tipo = 'SALIDA_BAJA'
     or nullif(btrim(coalesce(p_causa_baja, '')), '') is not null
     or exists (select 1 from public.clases_de_salida c
                 where c.codigo = p_codigo and c.tipo = 'SALIDA_BAJA') then
    raise exception 'Esa razón ya no se puede usar.' using errcode = '22023';
  end if;$n$);
end
$mig$;

-- 5. Las cinco se apagan. No se borran: esta base no borra razones.
update public.clases_de_salida set activa = false where tipo = 'SALIDA_BAJA' and activa;

-- 6. La puerta vieja se cierra para quien tiene sesión.
revoke execute on function public.registrar_baja(bigint,bigint,numeric,text,text,text,date,text)
  from public, anon, authenticated;

comment on function public.registrar_baja(bigint,bigint,numeric,text,text,text,date,text) is
  'Cerrada el 15/09/2026: ninguna pantalla la llama y nadie con sesión puede. '
  'Queda porque lo que escribió se sigue leyendo; toda salida va por registrar_salidas.';

-- 7. La historia del artículo dice «Salió» y el motivo, con las mismas palabras
--    que el libro y el papel. Las causas viejas se dicen como en la pantalla de
--    Inventario (CAUSAS_DE_BAJA): una base no puede importar esa lista.
do $mig$
declare
  v_def    text := pg_get_functiondef('public.historial_articulo(bigint,integer)'::regprocedure);
  v_ancla  text := $a$then 'Se dio de baja'$a$;
  v_patron text := $r$end,(\s+)m\.nota, m\.cantidad, m\.unidad, m\.signo::smallint, m\.valor_usd,$r$;
  v_n      int;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'historial_articulo: la salida vieja no aparece exactamente una vez';
  end if;
  select count(*) into v_n from regexp_matches(v_def, v_patron, 'g');
  if v_n <> 1 then
    raise exception 'historial_articulo: el cierre del título no aparece exactamente una vez (%)', v_n;
  end if;

  v_def := replace(v_def, v_ancla, $n$then 'Salió'$n$);
  v_def := regexp_replace(v_def, v_patron, $n$end
            -- El motivo, con las mismas palabras que el libro y el papel.
            || coalesce(' · ' || coalesce(m.razon_salida,
                 (select case b.causa when 'DANADO'     then 'Dañado'
                                      when 'OBSOLETO'   then 'Obsoleto'
                                      when 'VENCIDO'    then 'Vencido'
                                      when 'EXTRAVIADO' then 'Extraviado'
                                      when 'ROBADO'     then 'Robado'
                                      else b.causa end
                    from public.inventario_bajas b
                   where b.movimiento_id = m.id
                   limit 1)), ''),\1m.nota, m.cantidad, m.unidad, m.signo::smallint, m.valor_usd,$n$);

  execute v_def;
end
$mig$;

do $ver$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'inventario_movimientos'
                    and column_name = 'razon_salida') then
    raise exception 'el libro no tiene dónde guardar el motivo';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private' and p.proname = 'registrar_movimiento') <> 1
     or position('p_razon_salida' in pg_get_functiondef('private.registrar_movimiento'::regproc)) = 0 then
    raise exception 'registrar_movimiento no quedó con una sola firma que guarde el motivo';
  end if;
  if position('p_razon_salida => v_clase.nombre' in pg_get_functiondef('public.registrar_salidas'::regproc)) = 0
     or position('inventario_bajas' in pg_get_functiondef('public.registrar_salidas'::regproc)) > 0 then
    raise exception 'registrar_salidas no guarda el motivo, o sigue anotando bajas';
  end if;
  if exists (select 1 from public.clases_de_salida(true) c where c.tipo = 'SALIDA_BAJA')
     or exists (select 1 from public.clases_de_salida c where c.tipo = 'SALIDA_BAJA' and c.activa) then
    raise exception 'queda una razón de baja a la vista o encendida';
  end if;
  if position('SALIDA_BAJA' in pg_get_functiondef('public.guardar_clase_de_salida'::regproc)) = 0 then
    raise exception 'guardar_clase_de_salida todavía deja revivir una razón de baja';
  end if;
  if has_function_privilege('authenticated',
       'public.registrar_baja(bigint,bigint,numeric,text,text,text,date,text)', 'execute') then
    raise exception 'registrar_baja sigue abierta para quien tiene sesión';
  end if;
  if position('de baja' in pg_get_functiondef('public.historial_articulo'::regproc)) > 0
     or position('razon_salida' in pg_get_functiondef('public.historial_articulo'::regproc)) = 0 then
    raise exception 'la historia del artículo sigue diciendo «de baja» o no dice el motivo';
  end if;
end
$ver$;
