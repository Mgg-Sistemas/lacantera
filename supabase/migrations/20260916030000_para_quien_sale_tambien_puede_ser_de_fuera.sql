/*
  PARA QUIÉN SALE TAMBIÉN PUEDE SER ALGUIEN DE FUERA

  Christopher, 16/09/2026, con el campo nuevo delante:

    «Del formulario de salida, ¿para quién sale? puede ser bien de la empresa o
    bien puede ser a un externo (debe indicar el responsable, empresa o
    persona); nos solicitan tomar ejemplo y referencia de lo existente en el
    proyecto MGG».

  En MGG el destino de una salida es un interruptor —almacén o persona— y en las
  salidas el almacén NO se ofrece, porque mandar material a otro almacén es un
  traslado. Aquí se hace lo mismo con las palabras de esta casa: la lista de
  grupos del organigrama, y al final una opción para lo que sale de la empresa.

  Lo de fuera lleva dos datos y no uno: A QUIÉN —una empresa o una persona— y
  QUIÉN RESPONDE. El segundo no es adorno: la nota de salida se firma, y dentro
  de un año «FERRETERIA OSMAIRA» sin un nombre detrás no sirve para reclamar
  nada. Es la misma carencia que dejó cuatro despachos comerciales anotados como
  robo, sin cliente y sin responsable.

  Un movimiento va a un grupo o va a alguien de fuera, nunca a los dos: lo
  sujeta un CHECK, que lo ya escrito pasa porque lo tiene todo en blanco.
*/
alter table public.inventario_movimientos
  add column if not exists destino_externo text,
  add column if not exists responsable_externo text;

comment on column public.inventario_movimientos.destino_externo is
  'Cuando la salida no va a un grupo de la empresa: a quién va, empresa o persona. Nulo en el resto.';

comment on column public.inventario_movimientos.responsable_externo is
  'Quién responde por lo que salió de la empresa: la persona que lo recibe y firma. Nulo en el resto.';

alter table public.inventario_movimientos
  drop constraint if exists salida_para_dentro_o_para_fuera;

alter table public.inventario_movimientos
  add constraint salida_para_dentro_o_para_fuera
  check (grupo_id is null or destino_externo is null);

-- El nombre y el responsable se guardan en mayúscula, como todo el texto que
-- teclea una persona en esta base. Lo hace el disparador, no la pantalla.
create or replace trigger trg_normalizar
  before insert on public.inventario_movimientos
  for each row
  execute function private.normalizar_texto('nota', 'destino_externo', 'responsable_externo');

-- 1. registrar_movimiento aprende los dos datos nuevos.
do $mig$
declare
  v_firma  text := 'private.registrar_movimiento(text,integer,bigint,bigint,numeric,numeric,text,bigint,bigint,bigint,date,bigint,text,text,numeric,numeric,text,numeric,numeric,text,text,text,text,bigint)';
  v_def    text := pg_get_functiondef(v_firma::regprocedure);
  v_anclas text[] := array[
    $a$p_grupo bigint DEFAULT NULL::bigint)$a$,
    $a$razon_salida, grupo_id)$a$,
    $a$     -- Para qué grupo de gente salió: ver la columna.
     p_grupo)$a$];
  v_nuevas text[] := array[
    $n$p_grupo bigint DEFAULT NULL::bigint, p_externo text DEFAULT NULL::text, p_responsable text DEFAULT NULL::text)$n$,
    $n$razon_salida, grupo_id, destino_externo, responsable_externo)$n$,
    $n$     -- Para qué grupo de gente salió, o para quién de fuera y quién
     -- responde por ello: ver las columnas.
     p_grupo,
     nullif(btrim(coalesce(p_externo, '')), ''),
     nullif(btrim(coalesce(p_responsable, '')), ''))$n$];
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

-- 2. registrar_salidas acepta las dos formas y exige una.
do $mig$
declare
  v_firma  text := 'public.registrar_salidas(bigint,jsonb,text,text,date,bigint)';
  v_def    text := pg_get_functiondef(v_firma::regprocedure);
  v_anclas text[] := array[
    $a$p_grupo_id bigint DEFAULT NULL::bigint)$a$,
    $a$  if p_grupo_id is null then
    raise exception 'Falta decir para quién sale. Elige el grupo en la lista.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.organigrama_nodos o
                  where o.id = p_grupo_id and o.activo) then
    raise exception 'Ese grupo no está en el organigrama, o está apagado.'
      using errcode = '23503';
  end if;$a$,
    $a$p_grupo => p_grupo_id);$a$];
  v_nuevas text[] := array[
    $n$p_grupo_id bigint DEFAULT NULL::bigint, p_externo text DEFAULT NULL::text, p_responsable text DEFAULT NULL::text)$n$,
    $n$  if p_grupo_id is null and nullif(btrim(coalesce(p_externo, '')), '') is null then
    raise exception 'Falta decir para quién sale: un grupo de la empresa, o quién es de fuera.'
      using errcode = '22023';
  end if;

  if p_grupo_id is not null and nullif(btrim(coalesce(p_externo, '')), '') is not null then
    raise exception 'Una salida va a un grupo de la empresa o a alguien de fuera, no a los dos.'
      using errcode = '22023';
  end if;

  if p_grupo_id is not null
     and not exists (select 1 from public.organigrama_nodos o
                      where o.id = p_grupo_id and o.activo) then
    raise exception 'Ese grupo no está en el organigrama, o está apagado.'
      using errcode = '23503';
  end if;

  /*
    LO QUE SALE DE LA EMPRESA LLEVA NOMBRE Y RESPONSABLE.

    La nota de salida se firma, y dentro de un año «FERRETERIA OSMAIRA» sin un
    nombre detrás no sirve para reclamarle nada a nadie.
  */
  if nullif(btrim(coalesce(p_externo, '')), '') is not null
     and length(btrim(coalesce(p_responsable, ''))) < 3 then
    raise exception 'Di quién responde por lo que sale: el nombre de quien lo recibe.'
      using errcode = '22023';
  end if;$n$,
    $n$p_grupo => p_grupo_id,
      p_externo => p_externo,
      p_responsable => p_responsable);$n$];
begin
  for i in 1 .. array_length(v_anclas, 1) loop
    if (length(v_def) - length(replace(v_def, v_anclas[i], ''))) / length(v_anclas[i]) <> 1 then
      raise exception 'registrar_salidas: el ancla % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_anclas[i], v_nuevas[i]);
  end loop;

  execute 'drop function ' || v_firma;
  execute v_def;
end
$mig$;

do $ver$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'inventario_movimientos'
                    and column_name = 'destino_externo')
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'inventario_movimientos'
                       and column_name = 'responsable_externo') then
    raise exception 'el libro no tiene dónde guardar a quién de fuera salió';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.inventario_movimientos'::regclass
                    and conname = 'salida_para_dentro_o_para_fuera') then
    raise exception 'nada impide que una salida vaya a un grupo y a alguien de fuera a la vez';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private' and p.proname = 'registrar_movimiento') <> 1
     or position('p_responsable' in pg_get_functiondef('private.registrar_movimiento'::regproc)) = 0 then
    raise exception 'registrar_movimiento no guarda el responsable de fuera';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'registrar_salidas') <> 1
     or position('no a los dos' in pg_get_functiondef('public.registrar_salidas'::regproc)) = 0
     or position('p_responsable => p_responsable' in pg_get_functiondef('public.registrar_salidas'::regproc)) = 0 then
    raise exception 'registrar_salidas no distingue las dos formas de salir';
  end if;
  if position('destino_externo' in pg_get_triggerdef(
       (select t.oid from pg_trigger t
         where t.tgrelid = 'public.inventario_movimientos'::regclass and t.tgname = 'trg_normalizar'))) = 0 then
    raise exception 'el nombre de fuera no se normaliza';
  end if;
end
$ver$;
