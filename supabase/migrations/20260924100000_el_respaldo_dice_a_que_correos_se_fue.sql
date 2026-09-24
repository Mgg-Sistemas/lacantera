/*
  EL RESPALDO DICE A QUÉ CORREOS SE FUE

  Angélica, 24/09/2026: «coloca un botón que diga enviar por correo y además un
  modal para poder escribir el correo al que se va a enviar. Por defecto será
  sistemamgg1@gmail.com, se podrá enviar a uno o más correos».

  La función `respaldo-por-correo` ya admitía `para[]` desde que se escribió,
  así que el cambio de verdad no es mandar a varios: es que quede escrito A
  QUIÉNES.

  POR QUÉ ESTO NO ES UN ADORNO DE AUDITORÍA

  Hasta hoy el destino era una sola cosa y no hacía falta anotarlo: el correo de
  quien pulsaba. Mandarse a uno mismo lo que uno acaba de descargar no reparte
  nada nuevo, y por eso `correos_enviados` guardaba un número —cuántos— y no las
  direcciones.

  Con el destinatario escrito a mano eso deja de ser cierto. Este archivo lleva
  las cédulas, los sueldos y las cuentas bancarias de todo el personal; quien
  tenga el rol de Respaldo puede ahora ponerle encima cualquier dirección del
  mundo. Un número no sirve para revisar eso. La dirección, sí.

  No se prohíbe —la líder lo pidió y hay casos buenos: el contador, el abogado,
  un correo propio que no es el de la sesión—. Se anota, que es lo que convierte
  una fuga silenciosa en una fuga con nombre y fecha.

  SE GUARDA EN `correos_enviados` Y NO EN `auditoria`. La bitácora tiene un
  disparador que prohíbe modificar sus renglones, y el renglón del respaldo nace
  antes de que se sepa a dónde fue el correo. Enlazado por `auditoria_id`, la
  vista los junta y en pantalla sigue siendo una línea.
*/

alter table public.correos_enviados
  add column if not exists enviado_a text[];

comment on column public.correos_enviados.enviado_a is
  'Las direcciones a las que fue. Se llena cuando quien manda las escribe a mano; '
  'nulo cuando el destino era el correo de la propia sesión.';

/*
  La función cambia de forma —le entra un parámetro más—, así que hay que
  tirarla y volver a crearla. `create or replace` con otra lista de argumentos
  no reemplaza: deja DOS funciones con el mismo nombre, y entonces PostgREST
  tiene que adivinar cuál quiso llamar el navegador.
*/
drop function if exists public.anotar_envio_del_respaldo(boolean, text, text);

create function public.anotar_envio_del_respaldo(
  p_enviado boolean,
  p_mensaje_id text,
  p_motivo text,
  p_para text[] default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aud bigint;
  v_para text[];
begin
  /*
    El renglón al que pertenece este resultado: el último respaldo de ESTA
    persona, y reciente.

    No hace falta que el navegador lo lleve de la mano —`respaldo_datos` devuelve
    el SQL, no un identificador— y cambiarle el tipo de retorno rompería la
    pantalla. Buscarlo aquí evita tocarla.

    La ventana de treinta minutos no es por seguridad: es para que un informe que
    llega tardísimo —una pestaña que estuvo abierta media mañana— no se pegue al
    respaldo de ayer.
  */
  select a.id into v_aud
    from public.auditoria a
   where a.tabla = 'respaldo'
     and a.operacion = 'ACCESO'
     and a.usuario_id is not distinct from (select auth.uid())
     and a.ocurrido_en > now() - interval '30 minutes'
   order by a.ocurrido_en desc
   limit 1;

  if v_aud is null then
    raise exception 'No hay un respaldo reciente de esta persona al que enlazar el envío.'
      using errcode = 'P0002';
  end if;

  /*
    Y si ya estaba anotado, no se reescribe.

    El índice único lo impediría de todas formas, pero un mensaje claro vale más
    que un choque de índice: quien llame dos veces tiene que enterarse de que el
    resultado del primer intento ya está escrito, no de que hubo un conflicto.
  */
  if exists (select 1 from public.correos_enviados ce where ce.auditoria_id = v_aud) then
    raise exception 'Ese respaldo ya tiene anotado su envío. El resultado del primer intento no se reescribe.'
      using errcode = '55000';
  end if;

  /*
    LAS DIRECCIONES SE LIMPIAN AQUÍ Y NO SE CREEN COMO LLEGAN.

    Quien llama es el navegador, y lo que el navegador manda se puede cambiar.
    Esto no valida el correo —de eso ya se encarga la función de envío, que es
    la que decide si sale o no—: recorta, baja a minúsculas, quita los vacíos y
    los repetidos, y se planta en diez. Lo que se guarda tiene que poder
    compararse entre meses, y «Juan@X.com » y «juan@x.com» son el mismo destino.

    El tope de diez es el mismo que aplica `MAX_DESTINATARIOS` en la función de
    correo. Si un día cambia allí, cambia aquí: dos topes distintos dejarían un
    envío hecho y mal anotado, que es peor que no anotarlo.
  */
  select array_agg(distinct d)
    into v_para
    from (
      select left(lower(btrim(x)), 254) as d
        from unnest(coalesce(p_para, array[]::text[])) as x
       where btrim(coalesce(x, '')) <> ''
    ) s;

  if coalesce(array_length(v_para, 1), 0) > 10 then
    raise exception 'No se puede mandar a más de 10 correos a la vez.'
      using errcode = '22023';
  end if;

  insert into public.correos_enviados
    (usuario_id, funcion, destinatarios, asunto, mensaje_id, auditoria_id, motivo_fallo, enviado_a)
  values
    ((select auth.uid()), 'respaldo-por-correo',
     greatest(coalesce(array_length(v_para, 1), 1), 1),
     'Respaldo de la base',
     case when coalesce(p_enviado, false) then nullif(btrim(coalesce(p_mensaje_id, '')), '') end,
     v_aud,
     case when coalesce(p_enviado, false) then null
          else coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'DESCONOCIDO') end,
     v_para);
end;
$$;

revoke all on function public.anotar_envio_del_respaldo(boolean, text, text, text[]) from public;
grant execute on function public.anotar_envio_del_respaldo(boolean, text, text, text[]) to authenticated;
