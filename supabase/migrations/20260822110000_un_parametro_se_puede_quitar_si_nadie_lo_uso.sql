-- ---------------------------------------------------------------------------
-- Un parámetro de nómina se puede quitar, pero solo si nadie lo usó
--
-- Christopher: «¿qué pasa si deseara eliminar algún parámetro?». Hoy nada: no
-- había función, y el navegador no escribe. Faltaba, pero no como un borrado a
-- secas.
--
-- SON DOS COSAS DISTINTAS Y HACEN FALTA LAS DOS
--
--   Cerrar   — la cifra dejó de regir. El cestaticket de enero no se borra
--              cuando sube en marzo: se le pone fecha de fin y el de marzo
--              empieza donde termina el otro. Así una nómina vieja se puede
--              recalcular con la cifra que regía entonces, que es justo lo que
--              pide una inspección.
--
--   Eliminar — la fila nunca debió existir: clave mal escrita, valor tecleado
--              con un cero de más, una duplicada. Nunca calculó nada y dejarla
--              ahí confunde para siempre.
--
-- LA REGLA PARA ELIMINAR
--
-- Solo si ninguna nómina pudo usarla. `private.parametro()` busca por fecha, así
-- que un parámetro pudo intervenir en cualquier período que se solape con su
-- vigencia. Si no hubo ningún período en ese tiempo, nada pudo calcularse con
-- él y borrarlo no reescribe la historia de nadie.
--
-- No se mira qué recibo usó qué parámetro —los recibos guardan el resultado, no
-- de dónde salió cada cifra— y por eso la comprobación es por fechas. Es más
-- estricta de lo necesario, que es como tiene que fallar: antes negar un
-- borrado legítimo que permitir uno que descuadre una nómina pagada.
--
-- Y el mensaje nombra las nóminas que lo impiden. «No se puede borrar» sin
-- decir por qué obliga a adivinar; con el número, quien lo lee entiende de una
-- vez que lo que quiere es cerrar la vigencia, no borrarla.
-- ---------------------------------------------------------------------------

create or replace function public.cerrar_parametro_nomina(
  p_id bigint,
  p_hasta date
) returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_desde date;
  v_clave text;
begin
  perform private.exigir_rol('RRHH');

  select vigencia_desde, clave into v_desde, v_clave
    from public.nomina_parametros where id = p_id;

  if v_desde is null then
    raise exception 'Ese parámetro ya no está.' using errcode = 'P0002';
  end if;

  if p_hasta is null then
    raise exception 'Hay que decir hasta qué día rigió.' using errcode = '22023';
  end if;

  if p_hasta < v_desde then
    raise exception 'No puede dejar de regir antes de empezar: «%» rige desde el %.',
      v_clave, to_char(v_desde, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  update public.nomina_parametros set vigencia_hasta = p_hasta where id = p_id;
end;
$func$;

comment on function public.cerrar_parametro_nomina(bigint, date) is
  'Le pone fecha de fin a una cifra legal. No la borra: las nominas de ese '
  'tiempo tienen que poder recalcularse con la cifra que regia entonces.';

create or replace function public.eliminar_parametro_nomina(p_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_desde  date;
  v_hasta  date;
  v_clave  text;
  v_choca  text;
begin
  perform private.exigir_rol('RRHH');

  select clave, vigencia_desde, vigencia_hasta
    into v_clave, v_desde, v_hasta
    from public.nomina_parametros where id = p_id;

  if v_clave is null then
    raise exception 'Ese parámetro ya no está.' using errcode = 'P0002';
  end if;

  -- Cualquier período que se solape con su vigencia pudo haberlo usado.
  select string_agg(numero, ', ' order by desde)
    into v_choca
    from public.nomina_periodos
   where estado <> 'ANULADA'
     and desde <= coalesce(v_hasta, 'infinity'::date)
     and hasta >= v_desde;

  if v_choca is not null then
    raise exception 'No se puede eliminar «%»: la nómina % se calculó mientras esta cifra regía, y borrarla haría que esos recibos ya no se puedan recalcular. Si dejó de aplicar, ponle fecha de fin en vez de borrarla.',
      v_clave, v_choca
      using errcode = '23503';
  end if;

  delete from public.nomina_parametros where id = p_id;
end;
$func$;

comment on function public.eliminar_parametro_nomina(bigint) is
  'Borra una vigencia que nunca calculo nada: una clave mal escrita, un valor '
  'con un cero de mas. Se niega en cuanto hubo una nomina en esas fechas.';

revoke execute on function public.cerrar_parametro_nomina(bigint, date) from public, anon;
revoke execute on function public.eliminar_parametro_nomina(bigint) from public, anon;
grant  execute on function public.cerrar_parametro_nomina(bigint, date) to authenticated;
grant  execute on function public.eliminar_parametro_nomina(bigint) to authenticated;
