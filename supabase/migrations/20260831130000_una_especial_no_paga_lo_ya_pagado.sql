/*
  UNA NÓMINA ESPECIAL NO VUELVE A PAGAR DÍAS YA PAGADOS.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 31 de agosto de 2026, por MCP.
  ————————————————————————————————————————————————————————————————————————

  LO QUE ENCONTRÓ EL CARRIL DE BASE

  `abrir_periodo` tiene reja de solape, y está bien escrita — con un mensaje que
  dice justo lo que está en juego: «Dos nóminas sobre los mismos días pagarían
  dos veces». El problema era una palabra:

      where estado <> 'ANULADA' and tipo = p_tipo
                                   ^^^^^^^^^^^^^^ solo mira el MISMO tipo

  Para QUINCENAL contra MENSUAL eso es correcto y elegante, porque
  `calcular_nomina` reparte por `empleados.frecuencia`: los dos períodos se
  llevan gente distinta y no se pisan. Pero ESPECIAL se lleva a TODOS:

      and (v_p.tipo = 'ESPECIAL' or frecuencia = v_p.tipo)

  Reproducido por el carril de base, en transacción revertida:

      QUINCENAL 18-25 ago ....... 23 recibos, neto Bs 3.492.140,27
      ESPECIAL, LOS MISMOS DIAS . la reja NO la paró
                                  23 recibos, neto Bs 1.862.447,90

  Y no era solo el bono: dentro iba SAL-BAS, CESTA, IVSS, FAOV y la provisión de
  prestaciones. Una nómina entera, otra vez.

  POR QUÉ LA REJA Y NO QUITARLE EL SUELDO A ESPECIAL

  El carril de base lo mandó como dos lecturas —«o ESPECIAL no debe calcular
  SAL-BAS, o la reja debe mirar también las ESPECIAL»— y sin elegir, que era lo
  correcto desde su sitio. Se eligió mirando qué es ESPECIAL de verdad, y hay
  tres cosas que lo dicen:

    1. El rótulo de la pantalla: «Especial — días del calendario», al lado de
       «Semanal — 7 días», «Quincenal — 15 días» y «Mensual — 30 días». Los
       cuatro son la misma cosa con distinto rango.

    2. Esta misma función: para ESPECIAL, `v_dias` es `(hasta - desde) + 1`, los
       días del calendario. Se paga el sueldo de esos días, no una cantidad
       suelta.

    3. Y la que zanja: LOS BONOS YA TIENEN SU CAMINO, y no es este.
       `guardar_novedad_monto` cuelga un monto de un período que ya existe, con
       su concepto, su método de pago y su fecha. Nadie abre una nómina para
       pagar un bono.

  Así que ESPECIAL es una nómina completa sobre fechas irregulares —un cierre a
  mitad de mes, un rango que no encaja en la quincena—, y calcular el sueldo es
  lo que le toca. Lo que no le toca es hacerlo sobre días que ya se pagaron.

  QUÉ CAMBIA

  La reja mira el solape cuando los dos períodos se llevan la misma gente, que
  es cuando de verdad se pisan:

    - mismo tipo ..................... se pisan (QUINCENAL contra QUINCENAL)
    - QUINCENAL contra MENSUAL ....... NO se pisan, y eso se conserva
    - cualquiera contra ESPECIAL ..... se pisan, porque ESPECIAL se lleva a todos

  Y de paso el mensaje nombra el período con el que choca. «Ya hay un período
  quincenal que se solapa» obliga a ir a buscarlo; «El período NOM-2026-0003 ya
  cubre esas fechas» lo señala.
*/

create or replace function public.abrir_periodo(
  p_tipo        text,
  p_desde       date,
  p_hasta       date,
  p_descripcion text default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tasas         record;
  v_dias          integer;
  v_id            bigint;
  v_choque_numero text;
  v_choque_tipo   text;
begin
  perform private.exigir_rol('RRHH');

  if p_hasta < p_desde then
    raise exception 'El período termina antes de empezar.' using errcode = '22023';
  end if;

  /*
    DOS PERIODOS SE PISAN CUANDO SE LLEVAN LA MISMA GENTE.

    `calcular_nomina` reparte por `empleados.frecuencia`, asi que una QUINCENAL y
    una MENSUAL sobre los mismos dias no se pisan: cada una paga a los suyos. Eso
    se conserva.

    Pero ESPECIAL se lleva a TODOS —`v_p.tipo = 'ESPECIAL' or frecuencia = ...`—
    y por tanto choca con cualquier otro periodo que cubra esos dias, sea del
    tipo que sea. Antes esta reja solo comparaba `tipo = p_tipo` y una ESPECIAL
    entraba encima de una quincena ya pagada sin que nada la parara.
  */
  select numero, tipo into v_choque_numero, v_choque_tipo
    from public.nomina_periodos
   where estado <> 'ANULADA'
     and (tipo = p_tipo or 'ESPECIAL' in (tipo, p_tipo))
     and desde <= p_hasta and hasta >= p_desde
   order by desde
   limit 1;

  if v_choque_numero is not null then
    raise exception 'El período % (%) ya cubre esas fechas. Dos nóminas sobre los mismos días pagarían dos veces.',
      v_choque_numero, lower(v_choque_tipo)
      using errcode = '55000',
            hint = 'Anula el período que sobra, o abre este sobre fechas que no se pisen con él.';
  end if;

  -- Los días que se pagan no son los del calendario: la quincena son 15 y el
  -- mes 30, tenga 28 o 31. El salario mensual se divide siempre entre 30.
  v_dias := case p_tipo
              when 'SEMANAL'   then 7
              when 'QUINCENAL' then 15
              when 'MENSUAL'   then private.parametro('dias_mes_nomina', p_desde)::integer
              else (p_hasta - p_desde) + 1
            end;

  -- 'USD' y no 'VES'. Pedirla en bolívares devolvía 1 —el bolívar contra sí
  -- mismo— y esa columna se usaba después para convertir sueldos en divisa.
  select * into v_tasas from private.tasas_del_dia('USD', p_hasta);

  insert into public.nomina_periodos
    (numero, tipo, desde, hasta, dias, descripcion, tasa, tasa_usd, creado_por)
  values
    (private.siguiente_numero('NOM'), p_tipo, p_desde, p_hasta, v_dias,
     nullif(trim(coalesce(p_descripcion, '')), ''),
     v_tasas.tasa, v_tasas.tasa_usd, (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$function$;

/*
  COMPROBAR

    -- Los cuatro casos, en transaccion deshecha:
    --   QUINCENAL, y otra QUINCENAL encima ....... rebota
    --   QUINCENAL, y una MENSUAL encima .......... pasa (gente distinta)
    --   QUINCENAL, y una ESPECIAL encima ......... rebota  <- lo que se arregla
    --   ESPECIAL,  y una QUINCENAL encima ........ rebota  <- y al reves
    --   Y una ESPECIAL sobre fechas libres ....... pasa
*/
