/*
  LO DONADO ENTRA SIN CIFRA, Y DICIENDO DE QUIÉN ES.

  Quien está cargando el inventario, 12/09/2026:

    «Esa laptop fue una donación desde la base, no tenemos factura ni un precio
     aproximado de cuánto costó, pero claro, como eso no salió del presupuesto
     de la cantera tampoco puedo ponerle un costo. A ver si se puede poner la
     opción de ingresar sin costo mientras voy cargando inventario.»

  Y Christopher, encadenando: que la planilla considere las donaciones, que el
  almacén sea una lista desplegable, y que los ítems ahora tienen dueño.

  ═══════════════════════════════════════════════════════════════════════════
  EL FALLO DE FONDO: LA MITAD DEL ARREGLO SE HIZO EN LA PUERTA EQUIVOCADA
  ═══════════════════════════════════════════════════════════════════════════

  El 11/09 se distinguieron los tres casos —se sabe, no costó nada, no se sabe—
  y se le enseñó a `registrar_entrada` a guardar el hueco como hueco. Pero esa
  es la puerta de UN renglón, y la que se usa para cargar inventario es
  `registrar_entradas`, la de varios. Esa se quedó con la reja vieja:

    «hay que decir cuánto costó la unidad. Si de verdad no costó nada, eso no es
     una entrada: es un ajuste de conteo»

  Y el ajuste de conteo valora heredando el promedio del almacén: le pone un
  precio inventado a algo cuyo precio nadie tiene.

  NO SE SABE NO ES CERO, y ésa es toda la razón de esto. Cero dice que la laptop
  no vale nada, se promedia con lo que el artículo ya tenía y abarata cada salida
  futura, en silencio y para siempre. Sin valor guarda nulo: fuera del promedio
  por los dos lados de la división, y contado aparte en `existencia_sin_valorar`
  para que una valoración a medias no se lea como completa.

  ═══════════════════════════════════════════════════════════════════════════
  LAS CUATRO COSAS QUE ESTABAN MAL, Y UNA QUE NADIE HABÍA NOTADO
  ═══════════════════════════════════════════════════════════════════════════

  1. La entrada por lote no admitía «no se sabe cuánto vale».
  2. La planilla tampoco, y es la que se usa para cargar cientos de renglones.
  3. Ninguna de las dos decía de quién es lo que entra, aunque el dueño viaja con
     el material desde el 11/09 y `registrar_movimiento` ya sabe recibirlo.
  4. La planilla rechazaba la categoría EQUIPO —«no es una categoría del
     sistema»— mientras el CHECK de la tabla la admite. Es justo la categoría de
     la laptop. Había TRES listas de categorías diciendo cosas distintas.
  5. Y la que nadie había notado: la planilla NO PODÍA CARGAR EXISTENCIA CON
     COSTO. Ninguna. Cualquier artículo nuevo con precio moría pidiendo una
     casilla de confirmación que una planilla no tiene dónde poner.

  Comprobado en caliente, con la transacción rodada hacia atrás:

      renglón sin costo y sin marcar ...: se niega, y dice qué marcar
      renglón marcado .................: entra, costo NULO, nota con el motivo
      marcado y con costo a la vez ....: se niega, son contradictorios
      dueño inventado .................: se niega, y lista los que hay
      sin decir dueño .................: hereda el del almacén
      planilla completa, confirmada ...: EQU-0002 sin cifra y de GOBERNACION en
                                         un almacén nuestro; EQU-0003 a 2,50 y
                                         de LACANTERA
*/

-- ═══════════════════════════════════════════════════════════════════ 1 de 5
-- La entrada de varios renglones admite no saber.
do $mig$
declare
  v_def   text;
  v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'registrar_entradas';

  v_antes := v_def;
  v_def := replace(v_def,
    $t$  v_nombre_pres text;$t$,
    $t$  v_nombre_pres text; v_sin_valor boolean; v_dueno text;$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 1 (declaraciones) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$    v_moneda   := upper(coalesce(nullif(btrim(coalesce(v_r->>'moneda', '')), ''), 'USD'));$t$,
    $t$    v_moneda   := upper(coalesce(nullif(btrim(coalesce(v_r->>'moneda', '')), ''), 'USD'));
    v_sin_valor := coalesce((v_r->>'sin_valor')::boolean, false);

    /*
      DE QUIEN ES LO QUE ENTRA.

      Vacio NO es LACANTERA: es «el del almacen». `registrar_movimiento` ya
      resuelve esa parte —al entrar es del dueño del sitio salvo que se diga— y
      repetir la regla aqui seria tener dos sitios que opinan de lo mismo.

      Decirlo hace falta desde que el dueño viaja con el material: el inventario
      de la gobernacion se esta cargando renglon a renglon, y sus cosas pueden
      acabar en un almacen nuestro sin dejar de ser suyas.

      Se LEE aqui y se COMPRUEBA mas abajo, cuando ya hay nombre de articulo que
      poner en el mensaje.
    */
    v_dueno := nullif(btrim(coalesce(v_r->>'propietario', '')), '');$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 2 (lectura del renglon) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n using errcode = '23503';
    end if;$t$,
    $t$      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n using errcode = '23503';
    end if;

    if v_dueno is not null then
      v_dueno := upper(v_dueno);
      if not exists (select 1 from public.propietarios where codigo = v_dueno and activo) then
        raise exception 'El renglón % (%): «%» no es un dueño registrado. Los que hay: %.',
          v_n, v_nombre, v_dueno,
          (select string_agg(codigo, ', ' order by codigo) from public.propietarios where activo)
          using errcode = '23503';
      end if;
    end if;$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 3 (comprobacion del dueño) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$    if v_costo <= 0 then
      raise exception 'El renglón % (%): hay que decir cuánto costó la unidad. Si de verdad no costó nada, eso no es una entrada: es un ajuste de conteo, y ahí se valora como el resto del almacén.', v_n, v_nombre using errcode = '22023';
    end if;$t$,
    $t$    /*
      TRES CAMINOS, NO DOS: SE SABE, NO COSTO NADA, O NO SE SABE.

      Esta reja solo conocia los dos primeros y mandaba el tercero al ajuste de
      conteo, que valora heredando el promedio del almacen — o sea que le pone
      un precio inventado a algo cuyo precio nadie tiene. La puerta de un solo
      renglon ya distinguia los tres desde el 11/09; esta se quedo sin ello, y
      es justo la que se usa para cargar el inventario.

      NO SE SABE NO ES CERO. Cero dice que no vale nada y hunde el promedio de
      lo que ya hay. Sin valor guarda el hueco COMO HUECO: nulo, fuera del
      promedio en los dos lados de la division, y contado aparte en
      `existencia_sin_valorar` para que una valoracion a medias no se lea como
      completa.
    */
    if not v_sin_valor and v_costo <= 0 then
      raise exception 'El renglón % (%): hay que decir cuánto costó la unidad, o marcar que no se sabe cuánto vale.', v_n, v_nombre
        using errcode = '22023',
              hint = 'Si el precio existe pero nadie lo tiene a mano, marca «no se sabe cuánto costó» en ese renglón: entra sin cifra y queda pendiente de valorar.';
    end if;$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 4 (reja del costo) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$    select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
      from private.tasas_del_dia(v_moneda, coalesce(p_fecha, current_date)) t;
    if v_tasa is null or coalesce(v_tasa_usd, 0) = 0 then
      raise exception 'El renglón % (%): no hay tasa cargada para % en esa fecha, así que no se puede saber cuánto costó.', v_n, v_nombre, v_moneda using errcode = '22023';
    end if;

    v_costo_usd := round(v_costo * v_tasa / v_tasa_usd, 6);$t$,
    $t$    if v_sin_valor then
      /*
        Sin cifra no hay nada que convertir, y pedir la tasa del dia pararia la
        carga por una razon que no tiene nada que ver con este renglon: se esta
        cargando un inventario viejo, y la tasa que falta es la de hoy.
      */
      v_costo_usd := null;
    else
      select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
        from private.tasas_del_dia(v_moneda, coalesce(p_fecha, current_date)) t;
      if v_tasa is null or coalesce(v_tasa_usd, 0) = 0 then
        raise exception 'El renglón % (%): no hay tasa cargada para % en esa fecha, así que no se puede saber cuánto costó.', v_n, v_nombre, v_moneda using errcode = '22023';
      end if;

      v_costo_usd := round(v_costo * v_tasa / v_tasa_usd, 6);
    end if;$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 5 (conversion de la tasa) no encontrada.' using errcode = '22023';
  end if;

  -- Las dos rejas del costo raro callan cuando no hay costo que comparar.
  v_antes := v_def;
  v_def := replace(v_def,
    $t$    if coalesce(v_ref, 0) = 0
       and not coalesce((v_r->>'confirmado')::boolean, false) then$t$,
    $t$    if not v_sin_valor and coalesce(v_ref, 0) = 0
       and not coalesce((v_r->>'confirmado')::boolean, false) then$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 6a (primera vez) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$    if coalesce(v_ref, 0) > 0 then
      v_veces := round(v_costo_usd / v_ref, 6);$t$,
    $t$    if not v_sin_valor and coalesce(v_ref, 0) > 0 then
      v_veces := round(v_costo_usd / v_ref, 6);$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 6b (diez veces) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$      'ENTRADA_DIRECTA', 1::smallint, p_almacen_id, v_articulo, v_cantidad, v_costo_usd,
      case when v_moneda = 'USD' then v_nota
           else v_nota || ' · Costo declarado: ' || v_costo || ' ' || v_moneda end,$t$,
    $t$      'ENTRADA_DIRECTA', 1::smallint, p_almacen_id, v_articulo, v_cantidad,
      -- Nulo y no cero: el hueco se guarda como hueco.
      case when v_sin_valor then null else v_costo_usd end,
      case when v_sin_valor then v_nota || ' · Sin valor declarado: entró sin cifra y queda pendiente de valorar.'
           when v_moneda = 'USD' then v_nota
           else v_nota || ' · Costo declarado: ' || v_costo || ' ' || v_moneda end,$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 7 (llamada al movimiento) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$      p_aviso_costo => v_veces,
      p_cantidad_capturada => nullif(v_pres, 0),$t$,
    $t$      p_aviso_costo => v_veces,
      p_propietario => v_dueno,
      p_cantidad_capturada => nullif(v_pres, 0),$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 8 (paso del dueño) no encontrada.' using errcode = '22023';
  end if;

  execute v_def;
end
$mig$;

comment on function public.registrar_entradas(bigint, jsonb, text, text, date) is
  'Mete varios renglones al almacén sin compra detrás. Cada renglón puede venir con `sin_valor` —no se sabe cuánto costó, que NO es lo mismo que no costó nada: entra con el costo en nulo y queda fuera del promedio— y con `propietario`, que vacío significa «el del almacén».';

-- ═══════════════════════════════════════════════════════════════════ 2 de 5
-- Las categorías las dice la base, no una lista copiada.
create or replace function public.categorias_de_articulo()
returns text[]
language sql
stable
security definer
set search_path to ''
as $function$
  select array_agg(btrim(replace(replace(v, '''', ''), '::text', ''))
                   order by btrim(replace(replace(v, '''', ''), '::text', '')))
    from pg_constraint c
    cross join lateral unnest(
      regexp_split_to_array(
        substring(pg_get_constraintdef(c.oid) from 'ARRAY\[(.*)\]'), ',\s*')) as u(v)
   where c.conrelid = 'public.articulos'::regclass
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%categoria = ANY%';
$function$;

revoke all on function public.categorias_de_articulo() from public;
grant execute on function public.categorias_de_articulo() to authenticated;

comment on function public.categorias_de_articulo() is
  'Las categorías que admite un artículo, leídas del propio CHECK de la tabla. Existe porque habían tres listas diciendo cosas distintas y la planilla rechazaba EQUIPO, que la tabla sí admite. La pantalla y la carga por lote leen de aquí para que no vuelva a pasar.';

-- ═══════════════════════════════════════════════════════════════════ 3 de 5
-- La planilla: donaciones, dueño, categorías vivas, y su propia confirmación.
do $mig$
declare
  v_def   text;
  v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cargar_articulos_por_lote';

  v_antes := v_def;
  v_def := replace(v_def, $t$  v_costo       numeric;$t$,
                          $t$  v_costo       numeric;
  v_sin_val     boolean;
  v_dueno_txt   text;$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 9 (declaraciones de la planilla) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def, $t$    v_costo := null;$t$,
                          $t$    v_costo := null;
    v_sin_val := false;
    v_dueno_txt := null;$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 10 (reinicio por fila) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$      v_inv := case lower(btrim(coalesce(v_fila->>'inventariable', '')))
                 when '' then true
                 when 'si' then true when 'sí' then true when 'true' then true when '1' then true
                 when 'no' then false when 'false' then false when '0' then false
                 else null end;$t$,
    $t$      v_inv := case lower(btrim(coalesce(v_fila->>'inventariable', '')))
                 when '' then true
                 when 'si' then true when 'sí' then true when 'true' then true when '1' then true
                 when 'no' then false when 'false' then false when '0' then false
                 else null end;

      -- Vacio significa «el del almacen», que es lo que resuelve la base.
      v_dueno_txt := nullif(upper(btrim(coalesce(v_fila->>'propietario', ''))), '');

      /*
        LO DONADO ENTRA SIN CIFRA.

        Christopher: «tenemos que considerar que puede ser una donación de otra
        empresa o entidad o fuente, así que por ello no tiene una factura o
        costo».

        Vacio es NO, que es lo que tiene que pasar: quien no sepa que existe
        esta columna sigue teniendo que escribir el costo.
      */
      v_sin_val := case lower(btrim(coalesce(v_fila->>'sin_valorar', '')))
                 when 'si' then true when 'sí' then true when 'true' then true when '1' then true
                 else false end;$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 11 (lectura de la fila) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$    elsif v_categoria not in ('PRODUCTO','REPUESTO','INSUMO','COMBUSTIBLE','LUBRICANTE',
                              'EPP','HERRAMIENTA','EXPLOSIVO','SERVICIO') then
      v_motivo := format('«%s» no es una categoría del sistema.', v_categoria);$t$,
    $t$    /* La lista sale del CHECK de la tabla: ver `public.categorias_de_articulo`. */
    elsif not (v_categoria = any(public.categorias_de_articulo())) then
      v_motivo := format('«%s» no es una categoría del sistema. Las que hay: %s.',
        v_categoria, array_to_string(public.categorias_de_articulo(), ', '));$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 12 (lista de categorias) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$      if v_motivo is null and (v_almacen_txt <> '' or v_cantidad is not null or v_costo is not null) then
        if not v_inv then
          v_motivo := 'Esto no se inventaría, así que no puede tener existencia en un almacén.';
        elsif v_almacen_txt = '' then
          v_motivo := 'Hay cantidad o costo pero falta el almacén: no se sabe dónde meterlo.';
        elsif v_cantidad is null then
          v_motivo := 'Hay almacén pero falta la cantidad.';
        elsif v_costo is null then
          v_motivo := 'Hay cantidad pero falta el costo. Sin él, lo que entra vale cero y cada salida futura se carga mal.';
        elsif v_cantidad <= 0 then
          v_motivo := 'La cantidad que entra tiene que ser mayor que cero.';
        elsif v_costo <= 0 then
          v_motivo := 'El costo por unidad tiene que ser mayor que cero.';$t$,
    $t$      if v_motivo is null and (v_almacen_txt <> '' or v_cantidad is not null or v_costo is not null or v_sin_val) then
        if not v_inv then
          v_motivo := 'Esto no se inventaría, así que no puede tener existencia en un almacén.';
        elsif v_almacen_txt = '' then
          v_motivo := 'Hay cantidad o costo pero falta el almacén: no se sabe dónde meterlo.';
        elsif v_cantidad is null then
          v_motivo := 'Hay almacén pero falta la cantidad.';
        elsif v_dueno_txt is not null
              and not exists (select 1 from public.propietarios where codigo = v_dueno_txt and activo) then
          v_motivo := format('«%s» no es un dueño registrado. Los que hay: %s.', v_dueno_txt,
            (select string_agg(codigo, ', ' order by codigo) from public.propietarios where activo));
        elsif v_sin_val and v_costo is not null then
          v_motivo := 'Está marcado «sin_valorar» y además trae costo. O se sabe cuánto costó, o no se sabe: deja una de las dos celdas vacía.';
        elsif v_costo is null and not v_sin_val then
          v_motivo := 'Hay cantidad pero falta el costo. Si llegó donado o sin factura y nadie sabe cuánto costó, escribe SI en «sin_valorar» y deja el costo vacío.';
        elsif v_cantidad <= 0 then
          v_motivo := 'La cantidad que entra tiene que ser mayor que cero.';
        elsif not v_sin_val and v_costo <= 0 then
          v_motivo := 'El costo por unidad tiene que ser mayor que cero.';$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 13 (rejas de la existencia) no encontrada.' using errcode = '22023';
  end if;

  /*
    LA PLANILLA NO PODIA CARGAR EXISTENCIA CON COSTO. NINGUNA.

    Cualquier fila con almacen, cantidad y costo de un articulo nuevo moria con
    «es la primera vez que entra a este almacen... compruebalo con la factura y
    aceptalo». Esa reja nacio del 5 de septiembre, cuando cinco aceites entraron
    por primera vez y fijaron un inventario de 868 millones que nadie habia
    comprobado, y se queda. Pero pide la confirmacion EN EL RENGLON, y una
    planilla de doscientas filas no tiene donde marcarla: aqui no protegia nada,
    solo cerraba la puerta.

    LA CONFIRMACION YA EXISTE Y ES LA PANTALLA ENTERA: se sube el archivo, el
    sistema lo revisa fila por fila sin escribir nada, y solo entonces hay un
    boton de confirmar. Es lo que la reja pide, hecho sobre las doscientas filas
    a la vez.

    No se pierde el rastro: cuando el costo se sale diez veces de lo que el
    articulo viene costando, el factor se sigue guardando en `aviso_costo` del
    movimiento. Queda anotado aunque no se pregunte.

    PENDIENTE: la pantalla de revision todavia no enseña esos avisos de costo.
  */
  v_antes := v_def;
  v_def := replace(v_def,
    $t$              jsonb_build_object('articulo_id', v_id, 'cantidad', v_cantidad,
                                 'costo', v_costo, 'moneda', v_moneda));$t$,
    $t$              jsonb_build_object('articulo_id', v_id, 'cantidad', v_cantidad,
                                 'costo', coalesce(v_costo, 0), 'moneda', v_moneda,
                                 'sin_valor', v_sin_val,
                                 'propietario', v_dueno_txt,
                                 'confirmado', true));$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 14 (renglon que se agrupa) no encontrada.' using errcode = '22023';
  end if;

  execute v_def;
end
$mig$;

comment on function public.cargar_articulos_por_lote(jsonb, boolean) is
  'Carga el catálogo por planilla, y de paso la existencia inicial. La columna «sin_valorar» dice que ese renglón llegó sin saber cuánto costó —una donación, algo sin factura—: entra con el costo en nulo y no en cero. La columna «propietario» dice de quién es; vacía significa «del dueño del almacén». Las categorías salen del CHECK de la tabla, no de una lista copiada.';

-- ═══════════════════════════════════════════════════════════════════ 4 de 5
-- Y se comprueba contra el cuerpo vivo, que es la regla 7.
do $ver$
declare v_e text; v_c text; v_cats text[];
begin
  select pg_get_functiondef(p.oid) into v_e from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='registrar_entradas';
  select pg_get_functiondef(p.oid) into v_c from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='cargar_articulos_por_lote';

  if position($t$case when v_sin_valor then null else v_costo_usd end$t$ in v_e) = 0 then
    raise exception 'La entrada no guarda el costo como hueco.' using errcode = '22023';
  end if;
  if position($t$p_propietario => v_dueno$t$ in v_e) = 0 then
    raise exception 'La entrada no pasa el dueño al movimiento.' using errcode = '22023';
  end if;
  if position($t$    if v_costo <= 0 then$t$ in v_e) > 0 then
    raise exception 'La reja vieja del costo sigue viva.' using errcode = '22023';
  end if;

  -- La reja del dueño va DESPUES del nombre del articulo, o el mensaje sale
  -- diciendo «El renglón 1 (<NULL>)» y con cincuenta filas eso no ayuda.
  if position($t$no es un dueño registrado$t$ in v_e)
     < position($t$ese artículo no existe o está inactivo$t$ in v_e) then
    raise exception 'La reja del dueño quedo delante del nombre del articulo.' using errcode = '22023';
  end if;

  if position($t$'propietario', v_dueno_txt$t$ in v_c) = 0 then
    raise exception 'La planilla no manda el dueño en el renglon.' using errcode = '22023';
  end if;
  if position($t$'confirmado', true$t$ in v_c) = 0 then
    raise exception 'El renglon de la planilla no viaja confirmado.' using errcode = '22023';
  end if;
  if position($t$'PRODUCTO','REPUESTO'$t$ in v_c) > 0 then
    raise exception 'La lista copiada de categorias sigue viva.' using errcode = '22023';
  end if;

  v_cats := public.categorias_de_articulo();
  if not ('EQUIPO' = any(v_cats)) then
    raise exception 'EQUIPO no aparece en la lista leida del CHECK.' using errcode = '22023';
  end if;
  if array_length(v_cats, 1) <> 10 then
    raise exception 'Se esperaban 10 categorias y salieron %.', array_length(v_cats, 1)
      using errcode = '22023';
  end if;
end
$ver$;

/*
  ═══════════════════════════════════════════════════════════════════ 5 de 5
  LO QUE ESTO NO HACE, Y ES DELIBERADO

  La pantalla de entrada de material sigue decidiendo el dueño POR EL ALMACEN,
  con su aviso en grande —«lo que entre aquí será de X»—. La planilla sí puede
  nombrarlo renglón a renglón, porque es la vía por la que se está cargando el
  inventario de la gobernación y sus cosas pueden acabar en un almacén nuestro.

  Las dos son correctas y hacen cosas distintas, pero conviene saber que no
  dicen lo mismo. Unificarlo es una decisión de pantalla, no de base.
*/
