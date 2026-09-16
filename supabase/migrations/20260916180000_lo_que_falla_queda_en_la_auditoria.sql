/*
  LO QUE FALLA QUEDA EN LA AUDITORÍA, Y LA REGLA DE VENTAS DICE QUÉ PALABRA FRENÓ

  Christopher, 16/09/2026, cuando nadie pudo montar una solicitud de salida:
  «hay un error al momento de montar la solicitud de salida», y enseguida:
  «auditoría no me está informando si hubo errores en alguna solicitud».

  LO QUE PASÓ. Entre las 10:47 y las 10:58 hubo cinco intentos, y los cinco los
  frenó la regla de `20260916170000`: el «para qué» nombraba una venta. Nadie
  pudo saberlo después, por dos motivos:

  1. La auditoría la escriben disparadores al guardar, y un intento rechazado se
     deshace entero: no dejaba rastro, ni quién, ni qué escribió, ni qué le dijo
     el sistema. Desde aquí la aplicación cuenta cada función que falla a
     `registrar_intento_fallido`, en otra llamada que sí se guarda, y la pantalla
     de auditoría lo enseña. La tabla solo la lee administración, como la
     auditoría.

  2. El mensaje decía «una venta no sale por aquí» sin decir qué palabra lo
     frenó, y quien escribió algo legítimo no sabía qué cambiar. Ahora lo dice. Y
     «MATERIAL DE VENTA» ya no cuenta como venta: es parte del nombre de un
     artículo del catálogo, «FILTRO (MATERIAL DE VENTA)».
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Los intentos que fallan
-- ═══════════════════════════════════════════════════════════════════════════

create table public.intentos_fallidos (
  id          bigint generated always as identity primary key,
  ocurrido_en timestamptz not null default now(),
  usuario     uuid references auth.users(id),
  funcion     text not null,
  codigo      text,
  mensaje     text not null,
  datos       jsonb,
  pantalla    text
);

comment on table public.intentos_fallidos is
  'Cada vez que una función de la base rechaza lo que alguien intentó: quién, qué función, el mensaje que vio, lo que envió (sin lo que parece secreto) y desde qué pantalla. La escribe la aplicación con registrar_intento_fallido, porque el intento rechazado se deshace y la auditoría normal no lo ve.';

create index intentos_fallidos_por_fecha on public.intentos_fallidos (ocurrido_en desc);

alter table public.intentos_fallidos enable row level security;

-- La misma reja que la auditoría: solo administración.
create policy intentos_fallidos_lectura on public.intentos_fallidos for select to authenticated
  using ((select public.mis_roles()) && array['ADMIN']);

revoke insert, update, delete, truncate on public.intentos_fallidos from anon, authenticated;

create function public.registrar_intento_fallido(
  p_funcion text,
  p_codigo text,
  p_mensaje text,
  p_datos jsonb default null,
  p_pantalla text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_datos jsonb := p_datos;
begin
  /*
    Lo llama la aplicación después de que otra función le dijo que no. No
    exige permiso de módulo, porque quien falla es justo quien no pudo, pero sí
    una sesión: el intento se guarda a nombre de quien lo hizo y de nadie más.
  */
  if (select auth.uid()) is null then
    return;
  end if;

  if nullif(btrim(coalesce(p_funcion, '')), '') is null
     or nullif(btrim(coalesce(p_mensaje, '')), '') is null
     or p_funcion = 'registrar_intento_fallido' then
    return;
  end if;

  if v_datos is not null and length(v_datos::text) > 16000 then
    v_datos := jsonb_build_object('recortado', 'Lo enviado pasaba de 16.000 letras y no se guardó entero.');
  end if;

  -- El mismo fallo dos veces en el mismo par de segundos es un doble clic.
  if exists (select 1 from public.intentos_fallidos f
              where f.usuario = (select auth.uid())
                and f.funcion = left(btrim(p_funcion), 80)
                and f.mensaje = left(p_mensaje, 2000)
                and f.ocurrido_en > now() - interval '2 seconds') then
    return;
  end if;

  insert into public.intentos_fallidos (usuario, funcion, codigo, mensaje, datos, pantalla)
  values ((select auth.uid()), left(btrim(p_funcion), 80),
          left(nullif(btrim(coalesce(p_codigo, '')), ''), 10), left(p_mensaje, 2000),
          v_datos, left(nullif(btrim(coalesce(p_pantalla, '')), ''), 200));
end;
$func$;

revoke all on function public.registrar_intento_fallido(text, text, text, jsonb, text) from public, anon;
grant execute on function public.registrar_intento_fallido(text, text, text, jsonb, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Qué palabra nombra la venta
-- ═══════════════════════════════════════════════════════════════════════════

create function private.palabra_de_venta(p_texto text, p_es_nombre boolean default false)
returns text
language sql
immutable
set search_path to ''
as $func$
  /*
    LA PALABRA QUE HACE QUE UN TEXTO NOMBRE UNA VENTA, o nula si no la hay. Las
    dos varas de `nombra_una_venta` viven aquí; aquella solo pregunta si hay
    palabra.

    «MATERIAL DE VENTA» no cuenta en el texto de para qué se pide: es parte del
    nombre de un artículo del catálogo, «FILTRO (MATERIAL DE VENTA)», y pedir
    ese material para la planta no es venderlo.
  */
  select (regexp_match(
    case when coalesce(p_es_nombre, false)
         then translate(upper(coalesce(p_texto, '')), 'ÁÉÍÓÚÜ_', 'AEIOUU ')
         else replace(translate(upper(coalesce(p_texto, '')), 'ÁÉÍÓÚÜ_', 'AEIOUU '), 'MATERIAL DE VENTA', ' ')
    end,
    case when coalesce(p_es_nombre, false)
         then '\m(VENTAS?|VENDER|VENDID[OA]S?|VENDIO|VENDE|CLIENTES?|FACTURAS?|FACTURAR|FACTURAD[OA]S?|PAGOS?|PAGAR|PERMUTAS?|TRUEQUES?|CANJES?|CRUCES?)\M'
         else '\m(VENTA|VENDER|VENDID[OA]S?|VENDIO|SE VENDE|CLIENTES?|PERMUTAS?|TRUEQUES?|CANJES?|CRUCE DE FACTURAS?|PAGO CON MATERIAL(ES)?|PAGO EN MATERIAL(ES)?|PAGO EN ESPECIE)\M'
    end))[1];
$func$;

revoke all on function private.palabra_de_venta(text, boolean) from public, anon;

create or replace function private.nombra_una_venta(p_texto text, p_es_nombre boolean default false)
returns boolean
language sql
immutable
set search_path to ''
as $func$
  /*
    ¿DICE ESTE TEXTO QUE ALGO SE VENDIÓ? Las palabras y sus dos varas están en
    `private.palabra_de_venta`, que además dice cuál fue, para el mensaje.
  */
  select private.palabra_de_venta(p_texto, p_es_nombre) is not null;
$func$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Los mensajes dicen qué palabra frenó
-- ═══════════════════════════════════════════════════════════════════════════

do $parche$
declare
  v_def text;
  r     record;
begin
  for r in
    select * from (values
      ('public.pedir_salida(bigint, jsonb, text, bigint, text, text)',
       $a$    raise exception 'Una venta no sale por aquí: se registra en Facturación › Notas de entrega, con cliente, precio y su número. Lo que se le da a un cliente sin cobrarlo también va por allá, como sin cargo.'
      using errcode = '22023';$a$,
       $b$    -- Dice qué palabra frenó: sin eso, quien escribió algo legítimo no sabe
    -- qué cambiar y cree que el sistema falla.
    raise exception 'El «para qué» dice «%», y una venta no sale por aquí: se registra en Facturación › Notas de entrega, con cliente, precio y su número. Lo que se le da a un cliente sin cobrarlo también va por allá, como sin cargo. Si no es una venta, dilo sin esa palabra: quien la aprueba lee el texto entero.',
      lower(private.palabra_de_venta(v_motivo)) using errcode = '22023';$b$),

      ('public.registrar_salidas(bigint, jsonb, text, text, date, bigint, text, text)',
       $a$    raise exception 'Una venta no sale por aquí: se registra en Facturación › Notas de entrega, con cliente, precio y su número.'
      using errcode = '22023';$a$,
       $b$    raise exception 'La solicitud dice «%», y una venta no sale por aquí: se registra en Facturación › Notas de entrega, con cliente, precio y su número.',
      lower(private.palabra_de_venta(p_motivo)) using errcode = '22023';$b$),

      ('public.guardar_clase_de_salida(text, text, text, text, text, smallint, boolean, boolean)',
       $a$    raise exception 'Una venta no es una razón de salida: se registra en Facturación › Notas de entrega, con cliente, precio y su número.'
      using errcode = '22023';$a$,
       $b$    raise exception 'La razón dice «%», y una venta no es una razón de salida: se registra en Facturación › Notas de entrega, con cliente, precio y su número.',
      lower(private.palabra_de_venta(coalesce(p_codigo, '') || ' ' || v_nombre, true)) using errcode = '22023';$b$)
    ) as t(funcion, antes, despues)
  loop
    v_def := pg_get_functiondef(r.funcion::regprocedure);
    if (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes) <> 1 then
      raise exception 'En % el texto «%» no aparece exactamente una vez.', r.funcion, r.antes;
    end if;
    execute replace(v_def, r.antes, r.despues);
  end loop;
end
$parche$;

do $ver$
begin
  if private.nombra_una_venta('Filtro (material de venta) para la planta') then
    raise exception '«material de venta» sigue contando como venta';
  end if;
  if not private.nombra_una_venta('Venta de arena a un cliente') then
    raise exception 'una venta dejó de reconocerse';
  end if;
  if private.palabra_de_venta('se vendió a un señor') <> 'VENDIO' then
    raise exception 'la palabra de venta no se devuelve';
  end if;
  if position('palabra_de_venta' in pg_get_functiondef('public.pedir_salida(bigint, jsonb, text, bigint, text, text)'::regprocedure)) = 0 then
    raise exception 'pedir_salida no dice qué palabra frenó';
  end if;
end
$ver$;
