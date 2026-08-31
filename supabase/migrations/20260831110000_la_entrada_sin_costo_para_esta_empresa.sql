/*
  LO QUE LLEGÓ SIN COSTAR NADA AQUÍ.

  ————————————————————————————————————————————————————————————————————————
  YA APLICADA. Se aplicó por MCP el 31 de agosto de 2026 y este archivo se
  escribió después, copiando el cuerpo vivo de `pg_get_functiondef`. Volver a
  correrlo no hace daño —es un `create or replace` idéntico a lo que hay— pero
  no hace falta.

  Se guarda porque la regla dice que lo aplicado por MCP tiene que acabar en un
  archivo: una función que solo vive en la base no se puede revisar en una
  lectura del repositorio ni se recupera si hay que rehacer el proyecto.
  ————————————————————————————————————————————————————————————————————————

  EL CASO

  Jesmary: «ese combustible llegó hace ya bastante tiempo y no tiene factura ni
  una constancia de pago, solo lo llevaron y lo ingresaron a la cantera […] ese
  combustible pertenecía acá a la base principal y lo que hicieron fue
  transportarlo a la cantera, o sea que el gasto como tal fue acá en
  SOSLAGUAIRA».

  No es una compra sin precio: es un traslado entre empresas del grupo, y el
  gasto ya está registrado en la otra.

  POR QUÉ NO SE USÓ `registrar_ajuste`, QUE ERA LO QUE PARECÍA

  El mensaje de la guarda vieja mandaba justo ahí, y habría sido escribir una
  mentira dos veces. `registrar_ajuste` deja en la nota «conteo físico: 5400
  contra 0 en sistema» cuando nadie contó nada; y un ajuste positivo es
  precisamente la señal que se vigila para detectar descuadres de almacén.
  Habríamos ensuciado el único indicador que sirve para eso, para colar una
  entrada que no es un ajuste.

  QUÉ HACE ESTA MIGRACIÓN

  Añade `p_sin_costo` a `registrar_entrada`. La excepción queda declarada en vez
  de disimulada: hay que marcarla a propósito, el costo tiene que ir en cero, y
  el motivo pasa de exigir 4 caracteres a exigir 15, porque dentro de un año esa
  nota es lo único que va a contestar de dónde salió ese combustible.

  NO SE ABRE LA MANO EN GENERAL. Sin la bandera, la exigencia de costo sigue
  donde estaba: una entrada valorada en cero diluye el costo promedio y deja el
  almacén lleno y valorado en nada, que es lo que esa guarda existe para
  impedir. Lo que cambia es que ahora el mensaje dice qué hacer cuando de verdad
  no costó nada, en vez de mandar a la puerta equivocada.

  LA FIRMA CRECE POR EL FINAL, CON VALOR POR OMISIÓN

  `p_sin_costo boolean default false` va de último, así que las llamadas que ya
  existían siguen resolviendo a la misma función y con el mismo comportamiento.
  No hace falta `drop function` ni tocar el front que no use la marca.
*/

create or replace function public.registrar_entrada(
  p_almacen_id  bigint,
  p_articulo_id bigint,
  p_cantidad    numeric,
  p_costo_usd   numeric,
  p_motivo      text,
  p_referencia  text default null,
  p_fecha       date default null,
  p_sin_costo   boolean default false
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_nota text;
begin
  perform private.exigir_rol('ALMACEN');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad que entra tiene que ser mayor que cero.'
      using errcode = '22023';
  end if;

  /*
    EL COSTO CERO, CUANDO EL GASTO LO ASUMIO OTRO.

    Llego combustible a la cantera que no se compro aqui: venia de la base
    principal del grupo, donde ya se registro el gasto. No hay factura ni
    comprobante porque no hubo compra — hubo un traslado entre empresas.

    Antes esto no tenia puerta. El mensaje de la guarda mandaba a
    `registrar_ajuste`, y eso habria sido escribir una mentira dos veces: la
    nota diria «conteo fisico: 5400 contra 0 en sistema» cuando nadie conto
    nada, y un ajuste positivo es justo la senal que se vigila para detectar
    descuadres. Habriamos ensuciado el unico indicador que sirve para eso.

    Asi que la excepcion se declara en vez de disimularse. `p_sin_costo` obliga
    a decirlo a proposito, y a explicarlo con algo mas que una palabra: dentro
    de un ano, «de donde salio esto» solo lo va a contestar esa nota.

    NO SE ABRE LA MANO EN GENERAL. Sin la bandera, la exigencia de costo sigue
    donde estaba — una entrada valorada en cero diluye el costo promedio y
    deja el almacen lleno y valorado en nada, que es lo que esa guarda existe
    para impedir.
  */
  if p_sin_costo then
    if coalesce(p_costo_usd, 0) <> 0 then
      raise exception 'Si el material no costó nada para esta empresa, el costo tiene que ir en cero. Quita la marca o pon el costo en cero.'
        using errcode = '22023';
    end if;

    if length(btrim(coalesce(p_motivo, ''))) < 15 then
      raise exception 'Una entrada sin costo hay que explicarla entera: de dónde vino y quién asumió el gasto. Dentro de un año esa nota es lo único que lo va a contestar.'
        using errcode = '22023';
    end if;

  elsif coalesce(p_costo_usd, 0) <= 0 then
    raise exception 'Hay que decir cuánto costó la unidad. Si el gasto lo asumió otra empresa del grupo, marca «no costó nada para esta empresa» y explica de dónde vino.'
      using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Una entrada sin explicación no se puede auditar después. Escribe de dónde vino.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'Ese almacén no existe o está inactivo.' using errcode = '23503';
  end if;

  if not exists (select 1 from public.articulos where id = p_articulo_id and activo) then
    raise exception 'Ese artículo no existe o está inactivo.' using errcode = '23503';
  end if;

  -- La referencia va dentro de la nota y no en columna propia: es texto libre
  -- —el nombre de quien lo trajo, un número de factura de fuera— y darle
  -- columna invitaría a tratarlo como si fuera un documento del sistema, que
  -- no lo es.
  v_nota := btrim(p_motivo);
  if nullif(btrim(coalesce(p_referencia, '')), '') is not null then
    v_nota := v_nota || ' · Ref.: ' || btrim(p_referencia);
  end if;

  -- Queda escrito en el propio movimiento, que es donde alguien lo va a leer
  -- dentro de un año al preguntarse por qué ese lote entró valorado en nada.
  if p_sin_costo then
    v_nota := v_nota || ' · Sin costo para esta empresa: el gasto lo asumió otra.';
  end if;

  return private.registrar_movimiento(
    'ENTRADA_DIRECTA', 1::smallint,
    p_almacen_id, p_articulo_id, p_cantidad, coalesce(p_costo_usd, 0),
    v_nota, null, null, null, p_fecha);
end;
$function$;

/*
  COMPROBAR

    -- Que la firma tiene el parámetro y con valor por omisión
    select pg_get_function_identity_arguments(p.oid),
           pg_get_expr(p.proargdefaults, 0) as por_omision
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'registrar_entrada';

    -- Los cuatro ensayos, en transacción que se deshace:
    --   1. sin_costo con costo distinto de cero  -> rebota
    --   2. sin_costo con motivo corto            -> rebota
    --   3. sin sin_costo y costo cero            -> rebota (como siempre)
    --   4. sin_costo, costo cero, motivo largo   -> entra, y la nota acaba en
    --      «· Sin costo para esta empresa: el gasto lo asumió otra.»
*/
