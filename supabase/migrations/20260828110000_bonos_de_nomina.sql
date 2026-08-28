/*
  LOS BONOS: NI FIJOS, NI IGUALES, NI PARA TODOS.

  ————————————————————————————————————————————————————————————————————————
  SIN APLICAR. Escrita el 28 de agosto de 2026 con el MCP de Supabase caído.
  No se ha ejecutado ni comprobado contra el catálogo. Antes de darla por
  buena, correr las comprobaciones del final — empezando por confirmar que las
  columnas que toca se llaman así.
  ————————————————————————————————————————————————————————————————————————

  LO QUE SE PIDIÓ

  «Los bonos no son necesariamente fijos y tampoco necesariamente iguales, el
  motivo puede variar y no todos son aptos: bono de transporte para quien no
  tenga vehículo, bono por rendimiento para quien cumple. Desconocemos los
  motivos, por lo tanto lo correcto es permitirle gestionar. Tampoco el método
  de pago y moneda, o si el bono se cancela el mismo día de pago o demora unos
  días más — es decir, es diferido.»

  LO QUE YA EXISTÍA, Y POR QUÉ ESTO NO ES UNA TABLA NUEVA

  `nomina_novedades_montos` ya guarda un monto por empleado y período, con su
  concepto, su moneda y su nota, y ya entra al recibo por el cálculo de la
  nómina. Eso es un bono en casi todo. Una tabla `bonos` aparte tendría que
  volver a entrar al cálculo, al recibo y al pago — tres sitios que ya
  funcionan— para no ganar nada.

  Así que se le añade lo que le falta: cómo se paga y cuándo.

  1. LOS CONCEPTOS SE GESTIONAN

  `nomina_conceptos` era un catálogo cerrado, sembrado por migración. Se abre
  para los de `origen = 'NOVEDAD'`, que son justamente los que se cargan a
  mano cada período — bonos y descuentos—. Los `AUTOMATICO` siguen cerrados y
  la función se niega a tocarlos: esos los calcula el sistema y cambiarles el
  código dejaría al cálculo buscando algo que ya no está.

  2. CÓMO SE PAGA

  `metodo_pago` y la moneda que ya tenía. Un bono puede ir por pago móvil
  mientras el sueldo va por transferencia, y eso hoy no se podía decir.

  3. CUÁNDO SE PAGA

  `pagar_en` nulo quiere decir «con la nómina», que es lo normal. Con fecha,
  el bono se paga ese día — los tres o cinco días de después que mencionó la
  líder.

  Y AQUÍ LA DECISIÓN QUE MÁS PESA, QUE NO ES TÉCNICA

  El bono diferido SALE EN EL RECIBO, y sale **sin marca de pendiente**. Lo
  acotó Christopher y tiene razón: «al ser un papel, no se actualizará a
  pagado, y puede ser un aval de doble filo ese pendiente». Un recibo impreso
  que dice «pendiente» sigue diciéndolo el año que viene, cuando ya se pagó —
  y entonces es un documento firmado que afirma una deuda que no existe.

  Así que el papel dice lo que se ganó, que es lo que un recibo dice siempre.
  El diferimiento vive en la pantalla, que sí se actualiza, y en el pago, que
  es donde hace falta saber qué queda por sacar de caja.

  Por eso `pagar_en` no lleva un `pagado_en` al lado: no se está modelando el
  estado de un pago, se está diciendo qué día toca. Cuando el pago de nómina
  registre lo suyo, sabrá lo que le corresponde por la fecha.
*/

alter table public.nomina_novedades_montos
  add column if not exists metodo_pago text,
  add column if not exists pagar_en date;

comment on column public.nomina_novedades_montos.metodo_pago is
  'Como se paga este monto. Nulo: como se pague el resto de la nomina.';
comment on column public.nomina_novedades_montos.pagar_en is
  'Que dia se paga. Nulo: con la nomina. Con fecha: diferido a ese dia.';

/*
  El método sale del catálogo de siempre, no de un texto libre: si aquí se
  escribiera «pago movil» y en tesorería «PAGO_MOVIL», ninguna consulta los
  juntaría.
*/
alter table public.nomina_novedades_montos
  drop constraint if exists nomina_novedades_montos_metodo_pago_fkey;
alter table public.nomina_novedades_montos
  add constraint nomina_novedades_montos_metodo_pago_fkey
  foreign key (metodo_pago) references public.metodos_pago(codigo);

-- ---------------------------------------------------------------------------
-- 1. Los conceptos de novedad se gestionan
-- ---------------------------------------------------------------------------

create or replace function public.guardar_concepto_nomina(
  p_codigo          text,
  p_nombre          text,
  p_tipo            text,
  p_incide_normal   boolean default false,
  p_incide_integral boolean default false,
  p_orden           smallint default 500,
  p_base_legal      text default null
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_codigo text := upper(regexp_replace(trim(coalesce(p_codigo, '')), '[^A-Za-z0-9_]+', '_', 'g'));
  v_origen text;
begin
  perform private.exigir_rol('ADMIN', 'RRHH');

  if length(v_codigo) < 3 then
    raise exception 'El concepto necesita un código de al menos tres letras.' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'El concepto necesita un nombre: es lo que va impreso en el recibo.'
      using errcode = '22023';
  end if;

  if p_tipo not in ('ASIGNACION', 'DEDUCCION') then
    raise exception 'Desde aquí solo se crean asignaciones y deducciones. Los aportes y las provisiones los calcula el sistema.'
      using errcode = '22023';
  end if;

  /*
    Un concepto que el sistema calcula solo no se toca desde aquí.

    `AUTOMATICO` significa que alguna función lo busca por su código para
    escribirlo: el sueldo, el bono de alimentación, las horas extra. Cambiarle
    el nombre sería inofensivo, pero esta misma puerta permitiría cambiarle el
    tipo o apagarlo, y entonces el cálculo seguiría corriendo y el recibo
    saldría sin una línea que la ley exige.
  */
  select origen into v_origen from public.nomina_conceptos where codigo = v_codigo;

  if v_origen = 'AUTOMATICO' then
    raise exception 'El concepto "%" lo calcula el sistema y no se edita aquí.', v_codigo
      using errcode = '55000';
  end if;

  insert into public.nomina_conceptos
    (codigo, nombre, tipo, origen, incide_normal, incide_integral, orden, base_legal, activo)
  values
    (v_codigo, trim(p_nombre), p_tipo, 'NOVEDAD',
     coalesce(p_incide_normal, false), coalesce(p_incide_integral, false),
     coalesce(p_orden, 500), nullif(trim(coalesce(p_base_legal, '')), ''), true)
  on conflict (codigo) do update set
    nombre          = excluded.nombre,
    tipo            = excluded.tipo,
    incide_normal   = excluded.incide_normal,
    incide_integral = excluded.incide_integral,
    orden           = excluded.orden,
    base_legal      = excluded.base_legal,
    activo          = true;

  return v_codigo;
end;
$function$;

revoke all on function public.guardar_concepto_nomina(text, text, text, boolean, boolean, smallint, text)
  from public, anon;
grant execute on function public.guardar_concepto_nomina(text, text, text, boolean, boolean, smallint, text)
  to authenticated, service_role;

/*
  Apagar y encender, en vez de borrar.

  Un concepto usado en un período viejo no se puede borrar sin dejar recibos
  huérfanos, y esos recibos son documentos que ya se entregaron. Apagado deja
  de ofrecerse al cargar novedades y sigue explicando lo que ya está impreso.
*/
create or replace function public.cambiar_estado_concepto_nomina(
  p_codigo text,
  p_activo boolean
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_origen text;
begin
  perform private.exigir_rol('ADMIN', 'RRHH');

  select origen into v_origen from public.nomina_conceptos where codigo = p_codigo;

  if v_origen is null then
    raise exception 'No existe el concepto "%".', p_codigo using errcode = 'P0002';
  end if;

  if v_origen = 'AUTOMATICO' then
    raise exception 'El concepto "%" lo calcula el sistema: apagarlo dejaría el recibo sin una línea que la ley exige.', p_codigo
      using errcode = '55000';
  end if;

  update public.nomina_conceptos set activo = p_activo where codigo = p_codigo;
end;
$function$;

revoke all on function public.cambiar_estado_concepto_nomina(text, boolean) from public, anon;
grant execute on function public.cambiar_estado_concepto_nomina(text, boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. El bono, con su método y su fecha
-- ---------------------------------------------------------------------------

/*
  CAMBIA LA LISTA DE ARGUMENTOS, ASÍ QUE VA CON DROP. Un `create or replace`
  con otra firma no reemplaza: crea una segunda con el mismo nombre, y a partir
  de ahí PostgREST elige por los argumentos que le manden.

  EL CUERPO SE COPIA DEL QUE ESTÉ VIVO AL APLICAR ESTO. Lo de abajo es lo que
  la función parecía hacer leyendo la pantalla que la llama; sin catálogo
  delante no se puede afirmar. Antes de ejecutar, sacar el cuerpo real con
  `pg_get_functiondef` y añadirle solo los dos parámetros nuevos.
*/

-- PENDIENTE: pegar aquí el cuerpo vivo de `guardar_novedad_monto` con
-- `p_metodo_pago` y `p_pagar_en` añadidos al INSERT y al UPDATE. No se
-- escribe a ciegas: esta función escribe dinero que va a un recibo.
--
-- La forma que tiene que quedar, sobre lo que ya haga:
--
--   drop function if exists public.guardar_novedad_monto(bigint, bigint, text, numeric, text, text);
--
--   create function public.guardar_novedad_monto(
--     p_periodo_id   bigint,
--     p_empleado_id  bigint,
--     p_concepto     text,
--     p_monto        numeric,
--     p_moneda       text default 'VES',
--     p_nota         text default null,
--     p_metodo_pago  text default null,
--     p_pagar_en     date default null
--   ) returns bigint
--   …
--     -- El freno que pidió Christopher: «deberán poder editarse en todo
--     -- momento siempre que la nómina no se haya pagado o cerrado».
--     if v_estado not in ('BORRADOR', 'CALCULADA', 'APROBADA') then
--       raise exception 'Esta nómina está en "%": los bonos ya no se tocan.', v_estado
--         using errcode = '55000';
--     end if;
--
--     -- Y la fecha diferida no puede caer antes del pago de la nómina: un
--     -- bono que se paga antes que el sueldo no es diferido, es un error de
--     -- tecleo.
--     if p_pagar_en is not null and p_pagar_en < v_hasta then
--       raise exception 'La fecha de pago del bono es anterior al cierre del período.'
--         using errcode = '22023';
--     end if;

/*
  COMPROBAR DESPUÉS DE APLICARLA

    -- Las columnas y la clave del método
    select column_name from information_schema.columns
     where table_schema='public' and table_name='nomina_novedades_montos'
       and column_name in ('metodo_pago','pagar_en');
    select conname from pg_constraint
     where conrelid='public.nomina_novedades_montos'::regclass and contype='f';

    -- Una sola de cada función, y anon fuera
    select p.oid::regprocedure::text,
           has_function_privilege('anon', p.oid, 'execute') as la_tiene_anon
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('guardar_concepto_nomina', 'cambiar_estado_concepto_nomina',
                         'guardar_novedad_monto');

    -- Que un AUTOMATICO no se pueda tocar
    do $x$ begin
      perform public.guardar_concepto_nomina(
        (select codigo from public.nomina_conceptos where origen='AUTOMATICO' limit 1),
        'PRUEBA', 'ASIGNACION');
      raise exception 'ENSAYO: dejo editar un automatico, mal';
    exception when sqlstate '55000' then
      raise exception 'ENSAYO: lo rechazo, bien';
    end $x$;

    -- Y el estado del periodo: cargar un bono sobre una nomina PAGADA
    -- tiene que rebotar.
*/
