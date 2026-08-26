/*
  «SALDADO CON DESCUENTO» AHORA DESCUENTA DE VERDAD

  Lo pidió la líder. Hasta ahora `saldar_herramienta_perdida` con DESCUENTO
  escribía la palabra «DESCUENTO» en la fila y nada más: el trabajador cobraba
  igual, y el único sitio donde constaba el descuento era una etiqueta que nadie
  cruzaba con la nómina. Un cierre que no cierra nada es peor que no cerrar,
  porque el módulo se queda diciendo que el asunto está resuelto.

  Ahora escribe la deducción en el período de nómina, con el costo que ya se le
  calculó al reportar la incidencia —el costo promedio del almacén por la
  cantidad—, y guarda de qué línea se trata para que no se pueda cobrar dos
  veces.

  HACE FALTA UN PERÍODO ABIERTO, Y SI NO LO HAY SE DICE

  Se podría haber inventado una cola de descuentos pendientes que la nómina
  recogiera sola. Sería más cómodo y sería peor: nadie sabría en qué quincena va
  a caer el descuento hasta que cayera, y descontarle a alguien sin avisar es
  exactamente lo que provoca un reclamo. Si no hay período donde cargarlo, se
  dice, y quedan las otras dos salidas —reposición o exoneración—.

  ENSAYADO EN UNA TRANSACCIÓN DESHECHA

  Sin período abierto se niega y explica; con período en borrador escribe la
  línea DED-HERR por 45,50 USD con el número de la asignación, el artículo y el
  motivo; una asignación ya saldada no se cobra dos veces; una sin costo se
  niega; y exonerar no toca la nómina.
*/

insert into public.nomina_conceptos
  (codigo, nombre, tipo, origen, incide_normal, incide_integral, orden, base_legal, activo)
values
  ('DED-HERR', 'Descuento por herramienta perdida o dañada', 'DEDUCCION', 'NOVEDAD',
   false, false, 138,
   'LOTTT art. 154: los descuentos al salario requieren autorización del trabajador.', true)
on conflict (codigo) do nothing;

/*
  La asignación recuerda qué línea de nómina la cobró.

  `on delete set null` y no `cascade`: si alguien borra la novedad de la nómina,
  la herramienta no debe desaparecer — debe quedar apuntando a nada, que es lo
  que permite volver a cobrarla.
*/
alter table public.asignaciones_herramienta
  add column if not exists descuento_id bigint
    references public.nomina_novedades_montos(id) on delete set null;

drop function if exists public.saldar_herramienta_perdida(bigint, text, date, text);

create function public.saldar_herramienta_perdida(
  p_id         bigint,
  p_como       text,
  p_fecha      date default null,
  p_nota       text default null,
  p_periodo_id bigint default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_a        record;
  v_periodo  record;
  v_art      text;
  v_novedad  bigint;
begin
  perform private.exigir_permiso('ASIGNACIONES', 'ESCRITURA');

  if p_como not in ('DESCUENTO', 'REPOSICION', 'EXONERADO') then
    raise exception 'Se salda con un descuento, una reposición o una exoneración.'
      using errcode = '22023';
  end if;

  select * into v_a from public.asignaciones_herramienta where id = p_id for update;
  if v_a.id is null then
    raise exception 'No existe la asignación %.', p_id using errcode = 'P0002';
  end if;
  if v_a.estado not in ('PERDIDA', 'DANADA') then
    raise exception 'Esa asignación está %: solo se cierra lo que tuvo una incidencia.',
      lower(v_a.estado) using errcode = '55000';
  end if;

  if p_como = 'DESCUENTO' then
    if coalesce(v_a.costo_usd, 0) <= 0 then
      raise exception 'Esa herramienta no tiene costo calculado, así que no hay cuánto descontar. Sáldala con reposición o exoneración.'
        using errcode = '22023';
    end if;

    /*
      El período: el que digan, o el último que siga admitiendo cambios.

      `BORRADOR` y `CALCULADA` son los dos que aceptan novedades —es la misma
      regla que aplica `guardar_novedad_monto`—; en `CALCULADA` habrá que volver
      a calcular para que el recibo lo recoja, y eso ya lo sabe quien lleva la
      nómina.
    */
    select * into v_periodo
    from public.nomina_periodos
    where estado in ('BORRADOR', 'CALCULADA')
      and (p_periodo_id is null or id = p_periodo_id)
    order by hasta desc
    limit 1;

    if v_periodo.id is null then
      raise exception 'No hay ningún período de nómina que admita cambios donde cargar el descuento. Abre el período, o sáldala con reposición o exoneración.'
        using errcode = '55000';
    end if;

    select nombre into v_art from public.articulos where id = v_a.articulo_id;

    insert into public.nomina_novedades_montos
      (periodo_id, empleado_id, concepto, monto, moneda, nota, registrado_por)
    values
      (v_periodo.id, v_a.empleado_id, 'DED-HERR', v_a.costo_usd, 'USD',
       format('%s · %s (%s) · %s',
              coalesce(v_a.numero, 'ASG-' || v_a.id), coalesce(v_art, 'herramienta'),
              trim(to_char(v_a.cantidad, 'FM999G999G990D##')),
              coalesce(nullif(btrim(coalesce(p_nota, '')), ''), v_a.motivo, 'sin motivo')),
       (select auth.uid()))
    returning id into v_novedad;
  end if;

  update public.asignaciones_herramienta
     set estado = 'REPUESTA', saldado_como = p_como,
         saldado_el = coalesce(p_fecha, current_date),
         descuento_id = v_novedad,
         nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), nota)
   where id = p_id;

  return p_id;
end;
$function$;

revoke all on function public.saldar_herramienta_perdida(bigint, text, date, text, bigint) from public;
grant execute on function public.saldar_herramienta_perdida(bigint, text, date, text, bigint) to authenticated;
