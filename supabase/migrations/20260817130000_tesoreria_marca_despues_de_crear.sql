-- ============================================================================
-- Las dos marcas que se ponen después de crear el movimiento vuelven a pasar
--
-- El libro de tesorería es inmutable, con dos excepciones deliberadas: enlazar
-- las dos patas de un traslado (`transferencia_par`) y marcar de qué nómina
-- sale un pago (`nomina_periodo_id`). Ninguno de los dos valores existe cuando
-- se escribe la fila, así que solo pueden ponerse con un UPDATE posterior.
--
-- Las dos excepciones no funcionaban. Ninguna. Desde que se escribieron.
--
-- La comprobación era: "de nulo a no nulo, y sin tocar nada más", y lo de "sin
-- tocar nada más" se resolvía comparando las dos filas en JSON sin ese campo.
-- El problema es dónde vive el disparador: en un BEFORE UPDATE, PostgreSQL
-- todavía no ha calculado las columnas generadas, así que `new.monto_bs` y
-- `new.monto_usd` llegan en NULL mientras `old` trae sus valores. Las dos
-- filas SIEMPRE difieren en esas dos columnas, la comparación nunca es cierta
-- y el disparador rechaza el UPDATE pase lo que pase.
--
-- Lo que eso rompía, en la práctica:
--
--   · `pagar_nomina` marca el egreso con el período y se caía ahí. La nómina
--     no se podía pagar. Quedaba aprobada y el pago no llegaba a escribirse.
--   · `transferir_entre_cuentas` enlaza las dos patas y se caía igual. No se
--     podía mover dinero entre cuentas propias.
--
-- La corrección es quitar de la comparación las columnas generadas, que no son
-- dato que nadie escriba sino resultado de las que sí lo son: si las columnas
-- de origen no cambiaron, las generadas tampoco pueden cambiar, y compararlas
-- no aporta nada. Se averiguan del catálogo en vez de nombrarlas a mano para
-- que añadir mañana otra columna calculada no vuelva a dejar esto inservible
-- en silencio.
-- ============================================================================

create or replace function private.tesoreria_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Las columnas calculadas de esta tabla, sean las que sean hoy.
  v_generadas text[];
  v_old       jsonb;
  v_new       jsonb;
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(a.attname), '{}')
      into v_generadas
      from pg_catalog.pg_attribute a
     where a.attrelid = tg_relid
       and a.attgenerated <> ''
       and not a.attisdropped;

    v_old := to_jsonb(old) - v_generadas;
    v_new := to_jsonb(new) - v_generadas;

    -- Dos campos se pueden escribir después de crear la fila, y solo una vez:
    -- el enlace entre las patas de un traslado y la nómina de la que sale un
    -- pago. Se comprueba que no cambie nada más comparando las filas sin ese
    -- campo.
    if old.transferencia_par is null
       and new.transferencia_par is not null
       and (v_old - 'transferencia_par') = (v_new - 'transferencia_par') then
      return new;
    end if;

    if old.nomina_periodo_id is null
       and new.nomina_periodo_id is not null
       and (v_old - 'nomina_periodo_id') = (v_new - 'nomina_periodo_id') then
      return new;
    end if;
  end if;

  raise exception 'El libro de tesorería no se edita ni se borra. Para corregir el movimiento %, revérsalo: queda la línea equivocada y la que la anula, y se entiende qué pasó.',
    coalesce(old.numero, '')
    using errcode = '55006';
end;
$$;
