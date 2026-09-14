/*
  EL RÉGIMEN DE LA NÓMINA SE CAMBIA CON SU INTERRUPTOR, Y CADA QUINCENA RECUERDA EL SUYO.

  Christopher, sobre cómo volver al cálculo de ley: «escribir DE LEY en cada intento no
  es adecuado, no es un switch adecuado». Tenía razón: `regimen_nomina` era un parámetro
  de texto más y se cambiaba tecleando en el formulario genérico, donde una palabra de
  más —«PACTADO», «SOLO PACTADO»— lo dejaba en DE LEY sin avisar, y donde «Corregir» con
  la misma fecha o «Dejó de regir hoy» lo reescribían hacia atrás.

  AHORA:

  1. Una puerta propia, `cambiar_regimen_nomina(solo_lo_pactado, desde)`, que la pantalla
     llama desde un interruptor. La decide quien aprueba la nómina (GERENTE_GENERAL; ADMIN
     pasa siempre). No deja regir desde antes del cierre de una nómina aprobada o pagada,
     ni por delante de un cambio ya programado, ni «cambiar» a lo que ya rige.
  2. Las tres puertas genéricas de parámetros se niegan a tocar `regimen_nomina`, y la
     tabla solo admite SOLO LO PACTADO o DE LEY en esa clave.
  3. Cada quincena guarda con qué régimen se calculó (`nomina_periodos.solo_lo_pactado`).
     La vista da las dos cosas: con qué régimen se calculó y cuál rige hoy para su fecha.
     Mover el interruptor ya no cambia cómo se ve lo que ya estaba calculado.
  4. `aprobar_nomina` se niega si el régimen cambió después del cálculo: se aprobarían
     recibos hechos con reglas que ya no rigen.
  5. `salario_para_prestaciones` no toma como salario un recibo calculado con solo lo
     pactado: ese recibo no trae salario de ley, y el día que vuelvan las prestaciones el
     salario se estima desde la ficha.
*/

-- 1. Cada quincena recuerda con qué régimen se calculó.
alter table public.nomina_periodos add column if not exists solo_lo_pactado boolean;

comment on column public.nomina_periodos.solo_lo_pactado is
  'Con qué régimen se calculó por última vez: cierto si fue SOLO LO PACTADO. Lo escribe calcular_nomina; nulo si nunca se calculó.';

update public.nomina_periodos
   set solo_lo_pactado = private.nomina_solo_lo_pactado(hasta)
 where calculada_en is not null
   and solo_lo_pactado is null;

-- 2. La vista da el régimen con que se calculó y el que rige hoy para su fecha.
create or replace view public.v_nomina_periodos
with (security_invoker = on)
as
select p.id,
       p.numero,
       p.tipo,
       p.desde,
       p.hasta,
       p.dias,
       p.descripcion,
       p.tasa,
       p.tasa_usd,
       p.estado,
       p.calculada_en,
       p.aprobada_por,
       p.aprobada_en,
       p.pagada_en,
       p.anulada_por,
       p.anulada_en,
       p.motivo_anulacion,
       p.creado_por,
       p.creado_en,
       r.recibos,
       coalesce(r.total_neto, 0::numeric) as total_neto,
       coalesce(r.total_asignado, 0::numeric) as total_asignado,
       coalesce(r.total_deducido, 0::numeric) as total_deducido,
       coalesce(r.total_aportes, 0::numeric) as total_aportes,
       coalesce(r.total_neto, 0::numeric) / p.tasa_usd as total_neto_usd,
       -- Con qué régimen se calculó. Si nunca se calculó, el que rige para su fecha.
       -- La regla de la subconsulta es la de private.nomina_solo_lo_pactado, escrita
       -- aquí porque la vista corre con los permisos de quien la lee.
       coalesce(p.solo_lo_pactado, (
         select x.valor_texto = 'SOLO LO PACTADO'
           from public.nomina_parametros x
          where x.clave = 'regimen_nomina'
            and x.vigencia_desde <= p.hasta
            and (x.vigencia_hasta is null or x.vigencia_hasta >= p.hasta)
          order by x.vigencia_desde desc
          limit 1), false) as solo_lo_pactado,
       -- El que rige hoy para su fecha: el que usaría un cálculo nuevo.
       coalesce((
         select x.valor_texto = 'SOLO LO PACTADO'
           from public.nomina_parametros x
          where x.clave = 'regimen_nomina'
            and x.vigencia_desde <= p.hasta
            and (x.vigencia_hasta is null or x.vigencia_hasta >= p.hasta)
          order by x.vigencia_desde desc
          limit 1), false) as solo_lo_pactado_vigente
  from public.nomina_periodos p
  left join lateral (
    select count(*) as recibos,
           sum(nomina_recibos.neto) as total_neto,
           sum(nomina_recibos.total_asignaciones) as total_asignado,
           sum(nomina_recibos.total_deducciones) as total_deducido,
           sum(nomina_recibos.total_aportes) as total_aportes
      from public.nomina_recibos
     where nomina_recibos.periodo_id = p.id) r on true;

-- 3. En esa clave, la tabla solo admite los dos regímenes.
do $mig$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.nomina_parametros'::regclass
                    and conname = 'nomina_parametros_regimen_valido') then
    alter table public.nomina_parametros
      add constraint nomina_parametros_regimen_valido
      check (clave <> 'regimen_nomina'
             or (unidad = 'TEXTO' and valor_texto in ('SOLO LO PACTADO', 'DE LEY')));
  end if;
end
$mig$;

-- 4. El mensaje de prestaciones deshabilitadas dice dónde está el interruptor.
create or replace function private.exigir_prestaciones_habilitadas(p_fecha date)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_desde date;
begin
  if not private.nomina_solo_lo_pactado(p_fecha) then
    return;
  end if;

  select max(x.vigencia_desde) into v_desde
    from public.nomina_parametros x
   where x.clave = 'regimen_nomina' and x.vigencia_desde <= p_fecha;

  raise exception 'Las prestaciones sociales están deshabilitadas: la nómina calcula solo lo pactado desde el %.',
    to_char(v_desde, 'DD/MM/YYYY')
    using errcode = '55000',
          hint = 'Se vuelven a habilitar encendiendo los conceptos de ley, en Nómina › Parámetros de nómina.';
end;
$function$;

-- 5. La puerta del interruptor.
create or replace function public.cambiar_regimen_nomina(p_solo_lo_pactado boolean, p_desde date)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_texto  text;
  v_ultimo record;
  v_futuro date;
  v_id     bigint;
begin
  /*
    EL INTERRUPTOR DE LOS CONCEPTOS DE LEY.

    Lo decide quien aprueba la nomina, porque es la misma decision vista antes:
    RRHH carga las cifras de ley, pero si la nomina las usa o no, no.
  */
  perform private.exigir_rol('GERENTE_GENERAL');

  if p_solo_lo_pactado is null or p_desde is null then
    raise exception 'Hay que decir si la nómina lleva los conceptos de ley y desde qué día.'
      using errcode = '22023';
  end if;

  v_texto := case when p_solo_lo_pactado then 'SOLO LO PACTADO' else 'DE LEY' end;

  if private.nomina_solo_lo_pactado(p_desde) = p_solo_lo_pactado then
    raise exception 'El % la nómina ya calcula %: no hay nada que cambiar.',
      to_char(p_desde, 'DD/MM/YYYY'),
      case when p_solo_lo_pactado then 'solo lo pactado' else 'con los conceptos de ley' end
      using errcode = '22023';
  end if;

  -- No se cambia por debajo de lo aprobado: esos recibos se hicieron con el
  -- regimen anterior y no se van a rehacer.
  select numero, hasta into v_ultimo
    from public.nomina_periodos
   where estado in ('APROBADA', 'PAGADA')
   order by hasta desc
   limit 1;

  if v_ultimo.hasta is not null and p_desde <= v_ultimo.hasta then
    raise exception 'No puede regir desde el %: la nómina % cierra el % y ya está aprobada. Elige un día posterior.',
      to_char(p_desde, 'DD/MM/YYYY'), v_ultimo.numero, to_char(v_ultimo.hasta, 'DD/MM/YYYY')
      using errcode = '55000';
  end if;

  -- Un cambio por delante de otro ya programado lo dejaria a medias.
  select min(vigencia_desde) into v_futuro
    from public.nomina_parametros
   where clave = 'regimen_nomina' and vigencia_desde > p_desde;

  if v_futuro is not null then
    raise exception 'Ya hay un cambio de régimen programado para el %. Uno anterior a ese lo dejaría a medias.',
      to_char(v_futuro, 'DD/MM/YYYY')
      using errcode = '55000';
  end if;

  update public.nomina_parametros
     set vigencia_hasta = p_desde - 1
   where clave = 'regimen_nomina'
     and vigencia_desde < p_desde
     and (vigencia_hasta is null or vigencia_hasta >= p_desde);

  insert into public.nomina_parametros
    (clave, unidad, valor, valor_texto, vigencia_desde, descripcion, fuente, registrado_por)
  values
    ('regimen_nomina', 'TEXTO', null, v_texto, p_desde,
     'Régimen de la nómina: SOLO LO PACTADO o DE LEY', 'Interruptor de los conceptos de ley',
     (select auth.uid()))
  on conflict (clave, vigencia_desde) do update set
    valor_texto    = excluded.valor_texto,
    vigencia_hasta = null,
    fuente         = excluded.fuente,
    registrado_por = excluded.registrado_por,
    registrado_en  = now()
  returning id into v_id;

  return v_id;
end;
$function$;

comment on function public.cambiar_regimen_nomina(boolean, date) is
  'El interruptor de los conceptos de ley: pone el régimen de la nómina (SOLO LO PACTADO o DE LEY) desde un día. Solo GERENTE_GENERAL o ADMIN; no por debajo de una nómina aprobada ni por delante de un cambio programado.';

revoke all on function public.cambiar_regimen_nomina(boolean, date) from public;
revoke all on function public.cambiar_regimen_nomina(boolean, date) from anon;
grant execute on function public.cambiar_regimen_nomina(boolean, date) to authenticated;

-- 6. Las puertas que ya existían aprenden lo nuevo.
do $mig$
declare
  v_def   text;
  v_antes text;
  r       record;
begin
  for r in
    select * from (values
      ('public', 'guardar_parametro_nomina',
       $t$  perform private.exigir_rol('RRHH');
$t$,
       $t$  perform private.exigir_rol('RRHH');

  -- El regimen no es una cifra mas: se cambia con su interruptor.
  if p_clave = 'regimen_nomina' then
    raise exception 'El régimen de la nómina no se carga como un parámetro más: se cambia con el interruptor de los conceptos de ley, en Parámetros de nómina.'
      using errcode = '22023';
  end if;
$t$),
      ('public', 'cerrar_parametro_nomina',
       $t$  if v_desde is null then
    raise exception 'Ese parámetro ya no está.' using errcode = 'P0002';
  end if;
$t$,
       $t$  if v_desde is null then
    raise exception 'Ese parámetro ya no está.' using errcode = 'P0002';
  end if;

  -- El regimen no se cierra: se cambia con su interruptor, que deja escrito a que.
  if v_clave = 'regimen_nomina' then
    raise exception 'El régimen de la nómina no se cierra: se cambia con el interruptor de los conceptos de ley, en Parámetros de nómina.'
      using errcode = '22023';
  end if;
$t$),
      ('public', 'eliminar_parametro_nomina',
       $t$  if v_clave is null then
    raise exception 'Ese parámetro ya no está.' using errcode = 'P0002';
  end if;
$t$,
       $t$  if v_clave is null then
    raise exception 'Ese parámetro ya no está.' using errcode = 'P0002';
  end if;

  -- El regimen no se borra: se cambia con su interruptor.
  if v_clave = 'regimen_nomina' then
    raise exception 'El régimen de la nómina no se elimina: se cambia con el interruptor de los conceptos de ley, en Parámetros de nómina.'
      using errcode = '22023';
  end if;
$t$),
      ('public', 'calcular_nomina',
       $t$     set estado = 'CALCULADA', calculada_en = now()
$t$,
       $t$     set estado = 'CALCULADA', calculada_en = now(), solo_lo_pactado = v_pactado
$t$),
      ('public', 'aprobar_nomina',
       $t$  update public.nomina_periodos
     set estado = 'APROBADA'$t$,
       $t$  /*
    EL REGIMEN CON QUE SE CALCULO TIENE QUE SER EL QUE RIGE.

    Si el interruptor de los conceptos de ley se movio despues del calculo, los
    recibos estan hechos con reglas que ya no rigen para esta quincena. Aprobarlos
    seria pagar lo que el sistema ya no calcularia.
  */
  if v_p.solo_lo_pactado is distinct from private.nomina_solo_lo_pactado(v_p.hasta) then
    raise exception 'El régimen de la nómina cambió después de calcular la %: vuelve a calcularla antes de aprobarla.',
      v_p.numero
      using errcode = '55000';
  end if;

  update public.nomina_periodos
     set estado = 'APROBADA'$t$),
      ('private', 'salario_para_prestaciones',
       $t$     and p.estado <> 'ANULADA'
     and p.hasta <= p_hasta
$t$,
       $t$     and p.estado <> 'ANULADA'
     and p.hasta <= p_hasta
     -- Un recibo de solo lo pactado no trae salario de ley: sin el, se estima
     -- desde la ficha como si no hubiera recibo.
     and not coalesce(p.solo_lo_pactado, false)
$t$)
    ) as t(esquema, funcion, ancla, nuevo)
  loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = r.esquema and p.proname = r.funcion;

    if v_def is null then
      raise exception 'No existe %.%.', r.esquema, r.funcion using errcode = '22023';
    end if;

    if (length(v_def) - length(replace(v_def, r.ancla, ''))) / length(r.ancla) <> 1 then
      raise exception 'ANCLA de %.% no aparece exactamente una vez.', r.esquema, r.funcion
        using errcode = '22023';
    end if;

    v_antes := v_def;
    v_def := replace(v_def, r.ancla, r.nuevo);
    if v_def = v_antes then
      raise exception 'ANCLA de %.% no encontrada.', r.esquema, r.funcion using errcode = '22023';
    end if;

    execute v_def;
  end loop;
end
$mig$;

-- 7. Comprobado al aplicar.
do $ver$
declare
  v_def text;
  r     record;
begin
  if exists (select 1 from public.nomina_periodos
              where calculada_en is not null and solo_lo_pactado is null) then
    raise exception 'Hay quincenas calculadas sin el régimen guardado.' using errcode = '22023';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'v_nomina_periodos'
                    and column_name = 'solo_lo_pactado_vigente') then
    raise exception 'La vista no da el régimen vigente.' using errcode = '22023';
  end if;

  if not exists (select 1 from pg_class
                  where oid = 'public.v_nomina_periodos'::regclass
                    and array_to_string(reloptions, ',') like '%security_invoker%') then
    raise exception 'La vista de periodos perdió security_invoker.' using errcode = '22023';
  end if;

  begin
    insert into public.nomina_parametros (clave, unidad, valor_texto, vigencia_desde, descripcion)
    values ('regimen_nomina', 'TEXTO', 'PACTADO', date '2099-01-01', 'prueba que tiene que rebotar');
    raise exception 'La tabla aceptó un régimen que no existe.' using errcode = 'P0001';
  exception when check_violation then
    null;
  end;

  for r in
    select * from (values
      ('public', 'calcular_nomina', 'solo_lo_pactado = v_pactado'),
      ('public', 'aprobar_nomina', 'private.nomina_solo_lo_pactado(v_p.hasta)'),
      ('private', 'salario_para_prestaciones', 'coalesce(p.solo_lo_pactado, false)'),
      ('public', 'guardar_parametro_nomina', 'regimen_nomina'),
      ('public', 'cerrar_parametro_nomina', 'regimen_nomina'),
      ('public', 'eliminar_parametro_nomina', 'regimen_nomina')
    ) as t(esquema, funcion, marca)
  loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = r.esquema and p.proname = r.funcion;
    if position(r.marca in v_def) = 0 then
      raise exception '%.% no quedó con su cambio.', r.esquema, r.funcion using errcode = '22023';
    end if;
  end loop;

  if pg_catalog.has_function_privilege('anon', 'public.cambiar_regimen_nomina(boolean, date)'::regprocedure, 'EXECUTE') then
    raise exception 'El interruptor lo puede mover alguien sin sesión.' using errcode = '22023';
  end if;
end
$ver$;
