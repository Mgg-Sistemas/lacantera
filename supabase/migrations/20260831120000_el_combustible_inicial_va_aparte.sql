/*
  EL COMBUSTIBLE INICIAL VA EN SU PROPIO TANQUE.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 31 de agosto de 2026, por MCP.
  ————————————————————————————————————————————————————————————————————————

  DE DÓNDE SALE ESTO

  El 31 de agosto se abrió la puerta para meter combustible que no costó nada a
  esta empresa: llegaron 20.000 L trasladados desde SOSLAGUAIRA, donde ya se
  registró el gasto. La puerta está bien —`registrar_entrada` con `p_sin_costo`,
  sin saltarse ninguna reja—, pero el carril de base probó lo que pasa después:

      al empezar ......... existencia = 0        costo = $0
      +1.000 L a $0,42 ... existencia = 1.000    costo = $0,420000
      +20.000 L a $0 ..... existencia = 21.000   costo = $0,020000

  **El promedio cae veintiuna veces.** A partir de ahí cada vale carga a la
  máquina una veintiunava parte de lo que cuesta el gasoil, y con él
  `v_consumo_combustible`, `gasto_por_unidad` y el centro de costos.

  El defecto de fondo es que `sin_costo` mezclaba dos cosas distintas: «esto no
  le costó CAJA a esta empresa» —cierto, es un hecho de tesorería— y «esto no
  VALE nada» —falso, y es lo que acababa escrito en el libro—.

  LA DECISIÓN, QUE ES DE CHRISTOPHER Y NO MÍA

  Se le ofrecieron tres salidas. La que eligió:

    «No tenemos precio del combustible, por tanto, será como un combustible
     inicial. Por tanto, haremos uso del combustible inicial, y lo mantendremos
     separado del combustible que sí tiene precio.»

  QUÉ SIGNIFICA «SEPARADO», TÉCNICAMENTE

  El costo promedio no es global: se lleva por pareja (almacén, artículo). Así
  que separar no pide una estructura nueva — pide otro almacén.

  Entra un segundo tanque, `CMB-INI`. Los 20.000 L entran ahí a cero y hunden un
  promedio que ya era cero, así que no hunden nada. El tanque de siempre conserva
  el suyo, y cada vale sale valorado según de qué tanque salió — que es la
  verdad: unos litros costaron y otros no.

  El módulo de combustible lista los tanques por `almacen_tipo = 'COMBUSTIBLE'`,
  así que el nuevo aparece solo. No hace falta tocar la pantalla para que exista.

  POR QUÉ LA REJA Y NO UN AVISO

  Si la separación dependiera de que quien carga elija bien el tanque, un día
  alguien marcaría «no costó nada» apuntando al tanque de siempre y el promedio
  se hundiría igual — y sin que nadie lo note, porque no hay pantalla que diga
  «alguien bajó el costo del gasoil». Se descubre cuadrando el mes.

  Por eso `almacenes.admite_sin_costo` y la reja en `registrar_entrada`: el
  material sin costo SOLO entra donde está declarado que puede entrar. La
  separación la sostiene la base, no la atención.
*/

alter table public.almacenes
  add column if not exists admite_sin_costo boolean not null default false;

comment on column public.almacenes.admite_sin_costo is
  'Aqui puede entrar material que esta empresa no pago. Su costo promedio se lleva aparte del resto, que es de lo que se trata.';

/*
  El tanque del combustible inicial.

  `recibe_compras` va en false a proposito: aqui no se compra nada. Solo entra
  lo que llego trasladado, y una compra que aterrizara aqui entraria valorada
  contra un promedio de cero.
*/
insert into public.almacenes
  (codigo, nombre, tipo, ubicacion, recibe_compras, activo, admite_sin_costo)
select 'CMB-INI', 'COMBUSTIBLE INICIAL (SIN COSTO)', 'COMBUSTIBLE',
       null, false, true, true
where not exists (select 1 from public.almacenes where codigo = 'CMB-INI');

/*
  Y la reja. El cuerpo es el de `20260831110000` con una comprobacion mas.
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
  v_admite boolean;
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
    /*
      Y AQUI VA APARTE, QUE ES LO QUE LO HACE SEGURO.

      El costo promedio se lleva por pareja (almacen, articulo). Metiendo
      20.000 L a cero junto a 1.000 L que costaron $0,42, el promedio del
      conjunto cae a $0,02 — veintiuna veces menos— y a partir de ahi cada vale
      carga a la maquina una fraccion de lo que cuesta el gasoil. Se probo.

      Por eso el material sin costo solo entra donde esta declarado que puede
      entrar. Si dependiera de elegir bien el tanque, un dia se elegiria mal y
      no lo notaria nadie: no hay pantalla que avise de que bajo el costo del
      gasoil. Se descubre cuadrando el mes.
    */
    select a.admite_sin_costo into v_admite
      from public.almacenes a where a.id = p_almacen_id;

    if not coalesce(v_admite, false) then
      raise exception 'Aquí no entra material sin costo: se hundiría el costo promedio de lo que ya hay.'
        using errcode = '22023',
              hint = 'Mételo en el tanque de combustible inicial, que es el que lo lleva aparte.';
    end if;

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

    -- El tanque nuevo, y que sea el unico que admite sin costo
    select codigo, nombre, tipo, admite_sin_costo
      from public.almacenes where admite_sin_costo;

    -- Los dos ensayos, en transaccion deshecha:
    --   sin_costo apuntando al tanque de siempre  -> rebota
    --   sin_costo apuntando a CMB-INI             -> entra
    --   y despues: el promedio de CMB-TAN no se movio.
*/
