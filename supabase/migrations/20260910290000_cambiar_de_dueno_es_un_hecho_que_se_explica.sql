/*
  CAMBIAR DE DUEÑO ES UN HECHO, Y SE EXPLICA.

  Christopher: «¿cómo se hace una transferencia de dueño de uno o N items?».

  Hasta ahora no se hacía: la base lo rechazaba y remitía a «una salida y una
  entrada», que son dos apuntes sueltos sin nada que los ate. Quien los mirara
  dentro de un año vería material que desapareció de un lado y apareció en otro
  sin explicación.

  ═══════════════════════════════════════════════════════════════════════════
  DOS TIPOS NUEVOS, Y NO REUTILIZAR LOS DE TRASLADO
  ═══════════════════════════════════════════════════════════════════════════

  La tentación era usar TRANSFERENCIA_SALIDA/ENTRADA: al fin y al cabo es un
  traslado, solo que a lo largo del dueño en vez del sitio. Se descarta porque
  entonces ningún reporte podría distinguir «se movió de patio» de «dejó de ser
  nuestro», y la segunda es la que interesa a quien cuadra con el ente.

  Son dos hechos distintos y llevan dos nombres distintos. El precio es una línea
  en el CHECK y dos rótulos.

  ═══════════════════════════════════════════════════════════════════════════
  EL MATERIAL NO SE MUEVE: SIGUE EN EL MISMO SITIO
  ═══════════════════════════════════════════════════════════════════════════

  Las sillas de la gobernación que pasan a ser nuestras siguen donde estaban. Por
  eso las dos patas van en el MISMO almacén: lo que cambia es de quién es, y
  fingir un movimiento físico que no ocurrió sería inventar un viaje.

  ═══════════════════════════════════════════════════════════════════════════
  A QUÉ VALOR ENTRA EN LOS LIBROS DEL NUEVO DUEÑO
  ═══════════════════════════════════════════════════════════════════════════

  Por defecto, al mismo con el que estaba: es la continuidad y no inventa nada.
  Se admite declarar otro —una donación puede acordarse en un valor distinto del
  que tenía en los papeles de quien la entrega— y entonces queda escrito que se
  declaró, que es distinto de que se calculara.

  Y sale del dueño viejo a SU promedio, no al mezclado del sitio.

  ═══════════════════════════════════════════════════════════════════════════
  QUIÉN PUEDE, Y CUÁNTO HAY QUE ESCRIBIR
  ═══════════════════════════════════════════════════════════════════════════

  INVENTARIO en TOTAL, no en ESCRITURA: esto mueve patrimonio de un lado a otro
  sin que nada se mueva de sitio, y no es una operación de almacén. Y el motivo
  son diez letras como mínimo, igual que una baja: dentro de un año, esa frase es
  lo único que explicará por qué esas sillas dejaron de ser de la gobernación.
*/

alter table public.inventario_movimientos drop constraint if exists inventario_movimientos_tipo_check;
alter table public.inventario_movimientos
  add constraint inventario_movimientos_tipo_check
  check (tipo in ('ENTRADA_COMPRA', 'ENTRADA_PRODUCCION', 'ENTRADA_DEVOLUCION',
                  'ENTRADA_DIRECTA', 'SALIDA_CONSUMO', 'SALIDA_DESPACHO',
                  'SALIDA_MERMA', 'SALIDA_BAJA', 'AJUSTE_POSITIVO',
                  'AJUSTE_NEGATIVO', 'AJUSTE_COSTO', 'TRANSFERENCIA_SALIDA',
                  'TRANSFERENCIA_ENTRADA', 'REVERSO',
                  'CAMBIO_DUENO_SALIDA', 'CAMBIO_DUENO_ENTRADA'));

create or replace function public.cambiar_dueno_de_material(
  p_almacen_id  bigint,
  p_articulo_id bigint,
  p_cantidad    numeric,
  p_de          text,
  p_a           text,
  p_motivo      text,
  p_fecha       date    default null,
  p_valor_usd   numeric default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_almacen  public.almacenes;
  v_articulo text;
  v_hay      numeric;
  v_costo    numeric;
  v_unitario numeric;
  v_fecha    date := coalesce(p_fecha, private.hoy_aqui());
  v_salida   bigint;
begin
  perform private.exigir_permiso('INVENTARIO', 'TOTAL');

  select * into v_almacen from public.almacenes where id = p_almacen_id;
  if v_almacen.id is null then
    raise exception 'No existe el almacen %.', p_almacen_id using errcode = 'P0002';
  end if;

  select nombre into v_articulo from public.articulos where id = p_articulo_id;
  if v_articulo is null then
    raise exception 'No existe el articulo %.', p_articulo_id using errcode = 'P0002';
  end if;

  if p_de is null or p_a is null then
    raise exception 'Hay que decir de quien era y de quien pasa a ser.' using errcode = '23514';
  end if;
  if p_de = p_a then
    raise exception 'Ya es de %: no hay nada que cambiar.', p_a using errcode = '22023';
  end if;
  if not exists (select 1 from public.propietarios where codigo = p_de and activo) then
    raise exception 'Ese dueno no existe o esta retirado: %.', p_de using errcode = '22023';
  end if;
  if not exists (select 1 from public.propietarios where codigo = p_a and activo) then
    raise exception 'Ese dueno no existe o esta retirado: %.', p_a using errcode = '22023';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.' using errcode = '22023';
  end if;

  /*
    EL PORQUE ES OBLIGATORIO Y LARGO. Un cambio de dueño mueve patrimonio de un
    lado a otro sin que nada se mueva de sitio: dentro de un año, lo unico que
    explicara por que esas sillas dejaron de ser de la gobernacion es esta frase.
  */
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Hace falta explicar por que cambia de dueno, con detalle.'
      using errcode = '23514',
            hint = 'Acta de donacion 2026-14 de la gobernacion; se compro al ente segun factura 0091.';
  end if;

  if v_fecha > private.hoy_aqui() then
    raise exception 'Esa fecha todavia no ha llegado.' using errcode = '22023';
  end if;

  /* Cerrojo antes de leer, y el saldo es el del dueño viejo. */
  v_hay := private.existencia_para_escribir(p_almacen_id, p_articulo_id, p_de);
  if v_hay < p_cantidad then
    raise exception 'En «%» solo hay % de «%» a nombre de %: no alcanza para %.',
      v_almacen.nombre, private.cantidad_es(v_hay), v_articulo, p_de,
      private.cantidad_es(p_cantidad)
      using errcode = '55000';
  end if;

  /* Sale a SU promedio, no al mezclado del sitio. */
  v_unitario := private.costo_promedio(p_almacen_id, p_articulo_id, p_de);
  v_costo    := v_unitario * p_cantidad;

  v_salida := private.registrar_movimiento(
    p_tipo => 'CAMBIO_DUENO_SALIDA', p_signo => (-1)::smallint,
    p_almacen => p_almacen_id, p_articulo => p_articulo_id,
    p_cantidad => p_cantidad, p_costo_usd => v_unitario,
    p_nota => format('Deja de ser de %s y pasa a %s. %s', p_de, p_a, btrim(p_motivo)),
    p_fecha => v_fecha, p_propietario => p_de);

  /*
    Y ENTRA A NOMBRE DEL NUEVO, EN EL MISMO SITIO. Al valor con el que estaba,
    salvo que se declare otro: una donacion puede acordarse en un valor distinto
    del que tenia en los papeles de quien la entrega, y entonces queda escrito
    que se declaro — que es distinto de que se calculara.
  */
  perform private.registrar_movimiento(
    p_tipo => 'CAMBIO_DUENO_ENTRADA', p_signo => (1)::smallint,
    p_almacen => p_almacen_id, p_articulo => p_articulo_id,
    p_cantidad => p_cantidad,
    p_costo_usd => coalesce(p_valor_usd / nullif(p_cantidad, 0), v_unitario),
    p_nota => format('Era de %s y pasa a ser de %s. %s%s',
      p_de, p_a, btrim(p_motivo),
      case when p_valor_usd is not null then ' · valor declarado' else '' end),
    p_origen => v_salida, p_fecha => v_fecha, p_propietario => p_a);

  return v_salida;
end
$function$;

revoke all on function public.cambiar_dueno_de_material(bigint, bigint, numeric, text, text, text, date, numeric) from public;
grant execute on function public.cambiar_dueno_de_material(bigint, bigint, numeric, text, text, text, date, numeric) to authenticated;

comment on function public.cambiar_dueno_de_material(bigint, bigint, numeric, text, text, text, date, numeric) is
  'Pasa material de un dueño a otro SIN moverlo de sitio: las dos patas van en el mismo almacen, porque lo que cambia es de quien es y fingir un viaje seria inventarlo. Lleva tipos propios —CAMBIO_DUENO_SALIDA y CAMBIO_DUENO_ENTRADA— y no los de traslado, para que un reporte pueda distinguir «se movio de patio» de «dejo de ser nuestro». Exige INVENTARIO.TOTAL y un motivo de diez letras: dentro de un año esa frase es lo unico que explicara el cambio.';

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás:

    1 motivo corto ..........: «Hace falta explicar por que cambia de dueno, con
                                detalle.»
    2 más de lo que tiene ...: «solo hay 10 a nombre de GOBERNACION: no alcanza
                                para 999»
    3 tras donar 4 ..........: suyo 6, nuestro subió a 420, total 426 — el total
                                del sitio no se movió, que es lo correcto porque
                                el material no viajó
    4 los dos asientos ......: CAMBIO_DUENO_SALIDA GOBERNACION @40,00 +
                                CAMBIO_DUENO_ENTRADA LACANTERA @40,00, enlazados
*/
