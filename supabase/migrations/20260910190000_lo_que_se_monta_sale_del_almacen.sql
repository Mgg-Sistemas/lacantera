/*
  SI SALIÓ DEL ALMACÉN, SALIÓ: NO PUEDE SEGUIR DISPONIBLE.

  Christopher, leyendo lo que entregué: «la antena puede no ser descontada, pero
  tampoco podrá estar disponible».

  Tiene razón y es un hueco mío. Yo argumenté que esta puerta no debía mover el
  inventario porque el caso corriente —una Starlink que se compra y se instala—
  nunca pasa por el almacén. Ese argumento sigue en pie para ESE caso. Pero deja
  suelto el otro: si alguien elige del catálogo unos cauchos que SÍ están en un
  almacén, el saldo seguía diciendo cuatro con cuatro ya montados. Eso no es
  «informativo»: es el libro mintiendo.

  ═══════════════════════════════════════════════════════════════════════════
  LA PREGUNTA NUEVA ES DE DÓNDE SALIÓ, Y ADMITE «DE NINGÚN ALMACÉN»
  ═══════════════════════════════════════════════════════════════════════════

  El agregado ahora dice de dónde vino, y hay dos respuestas legítimas:

    · DE UN ALMACÉN → sale de verdad. Se toma el cerrojo, se comprueba que
      alcanza, se saca al costo promedio y queda el asiento enlazado en la fila.
      Es exactamente lo que ya hace `cerrar_mantenimiento` con un repuesto: una
      pieza montada en una máquina deja de estar en el estante.

    · DE NINGUNO → no se mueve nada, porque no hay nada que mover. Es la Starlink
      comprada afuera, y el costo se queda como referencia.

  Lo que NO se hace es adivinar. Sin decir el almacén no se descuenta, y con él
  se descuenta entero: no hay término medio en el que el saldo quede a medias.

  ═══════════════════════════════════════════════════════════════════════════
  NO ES UNA PUERTA NUEVA DEL INVENTARIO
  ═══════════════════════════════════════════════════════════════════════════

  Yo había descartado esto diciendo que sería «la puerta número quince». Pero no
  lo es: `private.registrar_movimiento` y `private.existencia_para_escribir` ya
  existen y son las que usan las catorce. Se usan aquí igual que en el taller, en
  el mismo orden —cerrojo, comprobar, escribir— que es el único que sirve.

  Lo que sí era un riesgo de verdad —serializar el inventario por algo que casi
  nunca lo toca— desaparece: el cerrojo solo se toma cuando hay almacén.

  ═══════════════════════════════════════════════════════════════════════════
  Y AL QUITARLO, PUEDE VOLVER
  ═══════════════════════════════════════════════════════════════════════════

  Unos cauchos que se desmontan buenos vuelven al estante y tienen que volver a
  contarse. Se dice a qué almacén, y entra como `ENTRADA_DEVOLUCION` al mismo
  costo unitario con el que salió — no al promedio de hoy, que pudo moverse por
  compras que no tienen nada que ver con este caucho.

  Y admite no volver: lo gastado, lo que se pasó a otra máquina y lo que se llevó
  su dueño no vuelven a ningún estante, y ahí el silencio es la respuesta
  correcta.

  NADA QUE MIGRAR: la tabla tiene cero filas.
*/

alter table public.maquina_agregados
  add column if not exists almacen_id     bigint references public.almacenes(id),
  add column if not exists movimiento_id  bigint references public.inventario_movimientos(id),
  add column if not exists destino_id     bigint references public.almacenes(id),
  add column if not exists movimiento_retiro_id bigint references public.inventario_movimientos(id),
  /* El costo unitario con el que salió, para poder devolverlo al mismo. */
  add column if not exists costo_unitario numeric;

comment on column public.maquina_agregados.almacen_id is
  'De que almacen salio, si salio de alguno. Cuando lo tiene, el agregado DESCUENTA de verdad: lo pidio Christopher —«la antena puede no ser descontada, pero tampoco podra estar disponible»— y sin esto el saldo decia cuatro cauchos con cuatro ya montados. Nulo es una respuesta legitima: la Starlink que se compra y se instala nunca paso por un estante.';

comment on column public.maquina_agregados.movimiento_id is
  'El asiento de la salida. Enlazado para que desde la maquina se pueda llegar al libro y al reves.';

comment on column public.maquina_agregados.costo_unitario is
  'El costo unitario con el que salio. Se guarda para poder devolverlo al MISMO costo si vuelve al estante, y no al promedio de hoy — que pudo moverse por compras que no tienen nada que ver con esta pieza.';

comment on column public.maquina_agregados.destino_id is
  'A que almacen volvio al quitarlo, si volvio. Lo gastado, lo que se paso a otra maquina y lo que se llevo su dueño no vuelven a ningun estante.';

create index if not exists maquina_agregados_movimiento
  on public.maquina_agregados (movimiento_id) where movimiento_id is not null;

-- ---------------------------------------------------------------------------
-- Montar: si dice de dónde salió, sale
-- ---------------------------------------------------------------------------
/* La firma cambia: la vieja se va en la MISMA migracion. */
drop function if exists public.montar_agregado(bigint, text, text, bigint, text, numeric, date, numeric, text, text);

create or replace function public.montar_agregado(
  p_maquina_id  bigint,
  p_nombre      text,
  p_motivo      text,
  p_articulo_id bigint  default null,
  p_almacen_id  bigint  default null,
  p_serial      text    default null,
  p_cantidad    numeric default null,
  p_fecha       date    default null,
  p_costo_usd   numeric default null,
  p_hecho_por   text    default null,
  p_nota        text    default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id       bigint;
  v_maquina  public.maquinaria;
  v_fecha    date := coalesce(p_fecha, private.hoy_aqui());
  v_art      public.articulos;
  v_hay      numeric;
  v_unitario numeric;
  v_costo    numeric := p_costo_usd;
  v_mov      bigint;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select * into v_maquina from public.maquinaria where id = p_maquina_id;
  if v_maquina.id is null then
    raise exception 'Esa maquina no existe.' using errcode = '22023';
  end if;

  /*
    A UNA MAQUINA DESINCORPORADA NO SE LE MONTA NADA. Salio de la flota; anotarle
    una antena hoy diria que sigue operando, y la lista de «que lleva encima»
    dejaria de servir para lo unico que sirve: saber que hay que recuperar.
  */
  if v_maquina.estado = 'DESINCORPORADA' then
    raise exception 'Esa maquina esta desincorporada: ya no se le monta nada.'
      using errcode = '22023',
            hint = 'Si vuelve a la flota, primero se le cambia el estado explicando por que.';
  end if;

  if length(btrim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'Hace falta decir que se le monto.'
      using errcode = '23514',
            hint = 'Una antena Starlink, unos cauchos 29.5, un blindaje de cabina.';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Hace falta decir por que se modifico la maquina.'
      using errcode = '23514',
            hint = 'Para tener señal en el frente norte; el terreno rompia los cauchos normales.';
  end if;

  if v_fecha > private.hoy_aqui() then
    raise exception 'Esa fecha todavia no ha llegado.' using errcode = '22023';
  end if;

  -- -------------------------------------------------------------------------
  -- Si salió de un almacén, sale de verdad
  -- -------------------------------------------------------------------------
  if p_almacen_id is not null then
    /*
      NO SE PUEDE SACAR DEL ESTANTE ALGO SIN NOMBRE NI CANTIDAD. El texto libre
      vale para decir que lleva encima la maquina; para descontar hace falta
      saber QUE articulo y CUANTOS, porque eso es lo que el libro cuenta.
    */
    if p_articulo_id is null then
      raise exception 'Para sacarlo de un almacen hay que decir que articulo es.'
        using errcode = '23514',
              hint = 'Si no esta en el catalogo, entonces no salio de un almacen: deja el almacen vacio.';
    end if;
    if coalesce(p_cantidad, 0) <= 0 then
      raise exception 'Para sacarlo de un almacen hay que decir cuantos.'
        using errcode = '23514';
    end if;

    select * into v_art from public.articulos where id = p_articulo_id;
    if v_art.id is null then
      raise exception 'No existe el articulo %.', p_articulo_id using errcode = 'P0002';
    end if;
    if not v_art.inventariable then
      raise exception '«%» no lleva existencia: no puede salir de un almacen.', v_art.nombre
        using errcode = '22023';
    end if;

    /* El cerrojo ANTES de leer, que es el unico orden que sirve (regla 8). */
    v_hay := private.existencia_para_escribir(p_almacen_id, p_articulo_id);
    if v_hay < p_cantidad then
      raise exception 'Ahi solo hay % de «%»: no alcanza para %.',
        private.cantidad_es(v_hay), v_art.nombre, private.cantidad_es(p_cantidad)
        using errcode = '55000';
    end if;

    v_unitario := private.costo_promedio(p_almacen_id, p_articulo_id);
    v_costo    := v_unitario * p_cantidad;

    v_mov := private.registrar_movimiento(
      'SALIDA_CONSUMO', -1, p_almacen_id, p_articulo_id, p_cantidad, v_unitario,
      format('Montado en %s · %s', coalesce(v_maquina.codigo, p_maquina_id::text), p_nombre),
      null, null, null, v_fecha);
  end if;

  insert into public.maquina_agregados
    (maquina_id, nombre, motivo, hecho_por, articulo_id, almacen_id, movimiento_id,
     serial, cantidad, fecha, costo_usd, costo_unitario, nota, puesto_por)
  values
    (p_maquina_id, p_nombre, p_motivo,
     nullif(btrim(coalesce(p_hecho_por, '')), ''),
     p_articulo_id, p_almacen_id, v_mov,
     nullif(btrim(coalesce(p_serial, '')), ''),
     p_cantidad, v_fecha, v_costo, v_unitario,
     nullif(btrim(coalesce(p_nota, '')), ''), auth.uid())
  returning id into v_id;

  return v_id;
end
$function$;

-- ---------------------------------------------------------------------------
-- Quitar: si vuelve al estante, vuelve a contarse
-- ---------------------------------------------------------------------------
drop function if exists public.retirar_agregado(bigint, text, date);

create or replace function public.retirar_agregado(
  p_id         bigint,
  p_motivo     text,
  p_fecha      date   default null,
  p_destino_id bigint default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_fila  public.maquina_agregados;
  v_fecha date;
  v_art   text;
  v_mov   bigint;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select * into v_fila from public.maquina_agregados where id = p_id;
  if v_fila.id is null then
    raise exception 'Ese agregado no existe.' using errcode = '22023';
  end if;
  if v_fila.retirado_el is not null then
    raise exception 'Eso ya se habia quitado el %.', to_char(v_fila.retirado_el, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  /*
    EL PORQUE ES OBLIGATORIO. «Se quito» a secas no dice si se paso a otra
    maquina, si se gasto o si se lo llevaron — y esas tres tienen consecuencias
    distintas: una se busca en otra ficha, otra se repone y la tercera se
    reclama.
  */
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Hace falta decir por que se quito.'
      using errcode = '23514',
            hint = 'Se paso a la 0453, se gasto, se lo llevo el dueño.';
  end if;

  v_fecha := coalesce(p_fecha, private.hoy_aqui());
  if v_fecha > private.hoy_aqui() then
    raise exception 'Esa fecha todavia no ha llegado.' using errcode = '22023';
  end if;
  if v_fecha < v_fila.fecha then
    raise exception 'No se puede quitar antes de haberlo puesto: se monto el %.',
      to_char(v_fila.fecha, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  -- -----------------------------------------------------------------------
  -- Si vuelve a un estante, vuelve a contarse
  -- -----------------------------------------------------------------------
  if p_destino_id is not null then
    if v_fila.articulo_id is null or coalesce(v_fila.cantidad, 0) <= 0 then
      raise exception 'Esto no se puede devolver a un almacen: se anoto sin articulo ni cantidad.'
        using errcode = '22023',
              hint = 'Solo vuelve al estante lo que el libro sabe contar. Quitalo sin destino y, si hace falta, registra una entrada aparte.';
    end if;

    select nombre into v_art from public.articulos where id = v_fila.articulo_id;

    /*
      AL MISMO COSTO CON EL QUE SALIO, y no al promedio de hoy: el promedio pudo
      moverse por compras que no tienen nada que ver con esta pieza, y devolverla
      a ese numero seria inventarle un valor. Si salio sin costo —porque nunca
      paso por un almacen— entra sin costo, que tambien es la verdad.
    */
    v_mov := private.registrar_movimiento(
      'ENTRADA_DEVOLUCION', 1, p_destino_id, v_fila.articulo_id, v_fila.cantidad,
      v_fila.costo_unitario,
      format('Vuelve de una maquina · %s · %s', v_fila.nombre, btrim(p_motivo)),
      null, null, null, v_fecha);
  end if;

  update public.maquina_agregados
     set retirado_el          = v_fecha,
         motivo_retiro        = p_motivo,
         destino_id           = p_destino_id,
         movimiento_retiro_id = v_mov,
         retirado_por         = auth.uid()
   where id = p_id;

  return p_id;
end
$function$;

revoke all on function public.montar_agregado(bigint, text, text, bigint, bigint, text, numeric, date, numeric, text, text) from public;
grant execute on function public.montar_agregado(bigint, text, text, bigint, bigint, text, numeric, date, numeric, text, text) to authenticated;
revoke all on function public.retirar_agregado(bigint, text, date, bigint) from public;
grant execute on function public.retirar_agregado(bigint, text, date, bigint) to authenticated;

comment on function public.montar_agregado(bigint, text, text, bigint, bigint, text, numeric, date, numeric, text, text) is
  'Anota algo que se le añade a una maquina. Si se dice de que almacen salio, SALE DE VERDAD —cerrojo, comprobacion y asiento al costo promedio, igual que un repuesto del taller— porque lo montado no puede seguir disponible. Sin almacen no se mueve nada: es la Starlink comprada afuera, que nunca paso por un estante.';
comment on function public.retirar_agregado(bigint, text, date, bigint) is
  'Marca que un agregado se quito, con su porque. Si se dice a que almacen vuelve, entra otra vez al MISMO costo unitario con el que salio. No borra la fila: el historial se quedaria sin la mitad de la historia.';

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás y sobre el saldo
  real de un almacén que tenía 416:

    1 sin almacén ...........: saldo 416, no se tocó nada
    2 con almacén, 2 unidades: saldo 414, bajó 2
    3 el asiento ............: nº 740, costo 14,40 USD (promedio real, no inventado)
    4 más de lo que hay .....: Ahi solo hay 414 de «ACEITE DE MOTOR SAE 50»: no
                               alcanza para 99.999.
    5 almacén sin artículo ..: Para sacarlo de un almacen hay que decir que
                               articulo es.
    6 al devolverlo .........: saldo 416, volvió a lo de antes
*/
