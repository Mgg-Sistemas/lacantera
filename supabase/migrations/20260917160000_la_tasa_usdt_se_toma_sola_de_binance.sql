/*
  LA TASA USDT SE TOMA SOLA, DE BINANCE P2P

  Christopher, 17/09/2026: «la tasa USDT no se está actualizando automáticamente
  cada día, así como las otras tasas». No se actualizaba nunca: la tarea
  `tasa-del-dia` solo pedía el dólar y el euro, que publica el BCV, y el USDT no
  lo publica nadie oficialmente —por eso `monedas.fuente_tasa` le dice
  PARALELO—. Las únicas tres tasas USDT eran manuales, de agosto, y desde el 24
  todo lo que se movía en USDT se convertía a la de ese día.

  La fuente la eligió él: Binance P2P, que es donde se mueve el USDT. Se toma de
  criptoya, que la publica sin clave, y se guarda el punto medio entre lo que se
  pide y lo que se ofrece: ninguna de las dos puntas es «la tasa», y la media es
  lo que se puede volver a calcular después con los dos números.

  Tres frenos, porque es un precio de mercado y cambia a cada minuto:

    - si ese día ya hay tasa PARALELO para el USDT, no se toca: la primera
      corrida del día (08:15) fija la del día, y una cargada a mano manda;
    - si falta una de las dos puntas, no se guarda nada: la media de un solo
      lado ya no es la media;
    - si la cifra se sale de entre la mitad y el triple del dólar BCV del día,
      tampoco. Es para que un fallo de la fuente no entre como tasa y convierta
      pagos reales; el margen es holgado a propósito, porque la brecha existe.
*/

create or replace function private.tomar_tasa_usdt()
returns numeric
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_hoy   date := (now() at time zone 'America/Caracas')::date;
  v_resp  extensions.http_response;
  v_json  jsonb;
  v_pide  numeric;
  v_ofrece numeric;
  v_valor numeric;
  v_bcv   numeric;
begin
  if exists (
    select 1 from public.tasas_cambio
     where moneda_origen = 'USDT'
       and moneda_destino = 'VES'
       and fecha = v_hoy
       and fuente = 'PARALELO'
  ) then
    return null;
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

  begin
    select * into v_resp from extensions.http_get('https://criptoya.com/api/binancep2p/USDT/VES/1');
  exception when others then
    raise warning 'No se pudo consultar la tasa USDT: %', sqlerrm;
    return null;
  end;

  if v_resp.status <> 200 then
    raise warning 'La fuente de la tasa USDT respondió %', v_resp.status;
    return null;
  end if;

  begin
    v_json   := v_resp.content::jsonb;
    v_pide   := nullif(v_json->>'ask', '')::numeric;
    v_ofrece := nullif(v_json->>'bid', '')::numeric;
  exception when others then
    raise warning 'La fuente de la tasa USDT devolvió algo que no se entiende: %', left(v_resp.content, 200);
    return null;
  end;

  if coalesce(v_pide, 0) <= 0 or coalesce(v_ofrece, 0) <= 0 then
    raise warning 'La tasa USDT llegó sin una de sus dos puntas: %', left(v_resp.content, 200);
    return null;
  end if;

  v_valor := round((v_pide + v_ofrece) / 2, 4);

  select t.tasa into v_bcv
    from public.tasas_cambio t
   where t.moneda_origen = 'USD' and t.moneda_destino = 'VES' and t.fuente = 'BCV'
     and t.fecha <= v_hoy
   order by t.fecha desc
   limit 1;

  if v_bcv is null or v_valor < v_bcv / 2 or v_valor > v_bcv * 3 then
    raise warning 'La tasa USDT % no se guarda: el dólar BCV del día es %.', v_valor, v_bcv;
    return null;
  end if;

  insert into public.tasas_cambio
    (moneda_origen, moneda_destino, fecha, tasa, fuente, registrado_por, automatica)
  values
    ('USDT', 'VES', v_hoy, v_valor, 'PARALELO', null, true)
  on conflict on constraint tasas_unicas do nothing;

  return v_valor;
end;
$func$;

revoke all on function private.tomar_tasa_usdt() from public, anon, authenticated;

-- La misma tarea de siempre, con una moneda más.
create or replace function public.tomar_tasas_del_dia()
returns table(moneda text, tasa numeric)
language plpgsql
security definer
set search_path to ''
as $func$
begin
  return query
  select m.codigo, private.tomar_tasa_publicada(m.codigo)
    from (values ('USD'), ('EUR')) as m(codigo)
  union all
  select 'USDT', private.tomar_tasa_usdt();
end;
$func$;

do $ver$
begin
  if position('tomar_tasa_usdt' in pg_get_functiondef('public.tomar_tasas_del_dia()'::regprocedure)) = 0 then
    raise exception 'la tarea del día no pide el USDT';
  end if;
end
$ver$;
