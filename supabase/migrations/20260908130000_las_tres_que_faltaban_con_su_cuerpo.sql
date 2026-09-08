/*
  LAS TRES QUE FALTABAN, CON SU CUERPO.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026. Segunda mitad de
  `20260908120000_los_seis_objetos_que_ninguna_migracion_creaba.sql`; el porqué
  está allí. No cambia nada en la base viva.
  ————————————————————————————————————————————————————————————————————————

  Van en un archivo aparte porque dependen de `private.nombre_nucleo` y de las
  extensiones `pg_trgm` y `unaccent`, que se crean en las migraciones del 7 y
  del 8. Aplicadas en orden, se construyen solas.
*/

do $guarda$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='nombre_nucleo') then
    raise exception 'Falta private.nombre_nucleo.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='recalcular_cotizacion') then
    raise exception 'Falta private.recalcular_cotizacion.';
  end if;
end $guarda$;

-- ===========================================================================
-- 4. La pantalla pregunta si un costo se sale, sin ver el dinero
-- ===========================================================================
create or replace function public.revisar_costo_de_entrada(
  p_almacen_id  bigint,
  p_articulo_id bigint,
  p_costo       numeric,
  p_moneda      text default 'USD',
  p_fecha       date default null
) returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  c_factor constant numeric := 10;
  v_ref       numeric;
  v_costo_usd numeric;
  v_tasa      numeric;
  v_tasa_usd  numeric;
  v_veces     numeric;
  v_ve        boolean;
begin
  /*
    LO QUE LA PANTALLA NO PODIA PREGUNTAR.

    El formulario de entrada decidia si avisar leyendo `v_existencias.
    costo_promedio_usd`, que sale NULO a quien no tiene
    INVENTARIO.VER_VALORACION —nivel TOTAL—. ALMACEN tiene ESCRITURA, asi que
    al almacenista, que es justo quien teclea las entradas, le salia NULO
    siempre; la pantalla concluia «es la primera vez que entra» en la entrada
    numero treinta, y la casilla que marcaba para seguir mandaba `confirmado`,
    que en la base vale tambien para la reja de las diez veces. El aviso del
    desvio no llegaba a aparecer nunca y quedaba aceptado de antemano.

    La vista filtra para MOSTRAR; esta funcion contesta para DECIDIR. Es la
    misma leccion de `private.saldo_de_factura`.

    Contesta QUE pasa siempre, y CUANTO solo a quien puede ver el dinero — el
    mismo reparto que ya hacen los mensajes de `registrar_entradas`.
  */
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  v_ve := private.puede_accion('INVENTARIO.VER_VALORACION');

  if not exists (select 1 from public.articulos where id = p_articulo_id and activo) then
    return jsonb_build_object('estado', 'SIN_ARTICULO');
  end if;

  v_ref := private.costo_promedio(p_almacen_id, p_articulo_id);

  if coalesce(v_ref, 0) = 0 then
    return jsonb_build_object('estado', 'PRIMERA');
  end if;

  if coalesce(p_costo, 0) <= 0 then
    return jsonb_build_object('estado', 'NORMAL');
  end if;

  select tasa, tasa_usd into v_tasa, v_tasa_usd
    from private.tasas_del_dia(upper(coalesce(p_moneda, 'USD')), coalesce(p_fecha, current_date));

  /*
    Sin tasa no se compara. La pantalla llama a esto mientras alguien teclea,
    asi que aqui se contesta y no se revienta: quien avisa de que falta la tasa
    es el guardado, que es donde de verdad importa.
  */
  if coalesce(v_tasa_usd, 0) = 0 or v_tasa is null then
    return jsonb_build_object('estado', 'SIN_TASA');
  end if;

  v_costo_usd := round(p_costo * v_tasa / v_tasa_usd, 6);
  v_veces     := round(v_costo_usd / v_ref, 2);

  if v_veces < c_factor and v_veces > (1 / c_factor) then
    return jsonb_build_object('estado', 'NORMAL');
  end if;

  return jsonb_build_object(
    'estado',        'DESVIA',
    'hacia',         case when v_veces >= 1 then 'ARRIBA' else 'ABAJO' end,
    -- El inverso se saca de los valores crudos: 6,21 / 1.209.012,48 redondea a
    -- 0,00 y dividir entre eso revienta. Ya paso.
    'veces',         case when v_ve then
                       case when v_veces >= 1 then v_veces
                            else round(v_ref / v_costo_usd, 2) end
                     end,
    'viene_costando', case when v_ve then round(v_ref, 4) end,
    'entra_a',        case when v_ve then round(v_costo_usd, 4) end);
end;
$function$;

-- ===========================================================================
-- 5. Los que ya estan y se llaman parecido
-- ===========================================================================
create or replace function public.articulos_parecidos(
  p_nombre    text,
  p_excluir   bigint default null,
  p_categoria text default null
) returns table (
  id          bigint,
  codigo      text,
  nombre      text,
  categoria   text,
  unidad      text,
  activo      boolean,
  parecido    numeric,
  es_el_mismo boolean
) language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_nucleo text := private.nombre_nucleo(p_nombre);
  v_comp   text := private.nombre_comparable(p_nombre);
begin
  /*
    Advierte y sugiere, no impide: un almacen de verdad tiene DISCO DE CORTE 7 y
    DISCO DE CORTE 9, y son dos cosas. Quien sabe cual es cual es la persona; lo
    que le faltaba era verlos.

    `es_el_mismo` marca el caso que no admite duda —los dos nombres dan el mismo
    nucleo— y es el unico que la base tambien rechaza.

    Los INACTIVOS tambien salen, a proposito: un articulo se desactiva cuando
    deja de usarse, no cuando deja de existir, y volver a crearlo con otro
    codigo parte su historia en dos.

    EL OPERADOR `%` Y NO `similarity() >= 0.45`: `gin_trgm_ops` indexa
    operadores, no llamadas a funcion, asi que con `similarity()` en el WHERE el
    indice no se tocaba y el plan era un recorrido completo. `%` usa
    `pg_trgm.similarity_threshold` (0,3), mas ancho de lo que queremos, asi que
    el `>= 0.45` se queda detras como segundo filtro: el indice reduce los
    candidatos y la funcion decide.
  */
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  if length(v_nucleo) < 2 then
    return;
  end if;

  return query
  select a.id, a.codigo, a.nombre, a.categoria, a.unidad, a.activo,
         round(extensions.similarity(private.nombre_comparable(a.nombre), v_comp)::numeric, 3),
         private.nombre_nucleo(a.nombre) = v_nucleo
    from public.articulos a
   where (p_excluir is null or a.id <> p_excluir)
     and (private.nombre_nucleo(a.nombre) = v_nucleo
          or (private.nombre_comparable(a.nombre) operator(extensions.%) v_comp
              and extensions.similarity(private.nombre_comparable(a.nombre), v_comp) >= 0.45))
   order by (private.nombre_nucleo(a.nombre) = v_nucleo) desc,
            -- El de la misma categoria primero: dos cosas que se llaman
            -- parecido y ademas son de la misma familia es la senal fuerte.
            (p_categoria is not null and a.categoria = p_categoria) desc,
            extensions.similarity(private.nombre_comparable(a.nombre), v_comp) desc
   limit 6;
end;
$function$;

-- ===========================================================================
-- 6. Corregir un precio mal tecleado sin rehacer la orden
-- ===========================================================================
create or replace function public.corregir_precio_de_orden(
  p_orden_id bigint, p_renglon_id bigint, p_precio numeric, p_motivo text
) returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_o        record;
  v_r        record;
  v_antes    numeric;
  v_total_a  numeric;
  v_total_d  numeric;
  v_cot_ren  bigint;
begin
  /*
    «¿SI EL USUARIO SE EQUIVOCA DESDE LA ORDEN DE COMPRA Y EL PRECIO ES ERRADO,
    ENTONCES SE DEBE REVERSAR TODO DESDE CERO?» —Christopher, 7/09/2026.

    Hasta ese dia: si. `editar_compra_directa` solo atiende compras directas, y
    ella misma remite a otro camino —«esta orden salio de un pedido con
    cotizaciones, se corrige por su camino»— que no existia.

    POR QUE TAMBIEN SE TOCA LA COTIZACION: el precio de una orden no se teclea
    en la orden, `aprobar_compra` lo copia de la cotizacion. El error esta ahi.
    Corregir solo la orden dejaria a las dos diciendo cosas distintas del mismo
    trato, y la cotizacion es el papel que mando el proveedor.

    HASTA DONDE: las tres puertas que ya cierra `editar_compra_directa`, porque
    lo que las cierra es lo mismo. Lo recibido —el precio ya entro al libro, que
    es inmutable—, el pago —ya se comprometio dinero— y la factura —el papel del
    proveedor dice lo que dice—. Pasada cualquiera, hay que anular.

    EL PORQUE se guarda en el renglon, de donde `private.auditar` lo sube a
    `auditoria.motivo`. Escribir en la auditoria a mano no cabia: `operacion`
    solo acepta INSERT, UPDATE, DELETE, ACCESO y CLAVE.
  */
  perform private.exigir_accion('COMPRAS.CORREGIR_PRECIO_ORDEN');

  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escribe por qué se corrige. Un precio que cambia sin explicación no se puede revisar después.'
      using errcode = '22023';
  end if;

  if coalesce(p_precio, 0) <= 0 then
    raise exception 'El precio tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  select o.id, o.numero, o.estado, o.cotizacion_id, o.total, o.moneda
    into v_o from public.ordenes_compra o where o.id = p_orden_id;
  if v_o.id is null then
    raise exception 'No existe esa orden.' using errcode = 'P0002';
  end if;

  if v_o.estado in ('CANCELADA', 'PROVEEDOR_DESISTIO') then
    raise exception 'La orden % está en «%»: ya no se corrige.', v_o.numero, v_o.estado
      using errcode = '55000';
  end if;

  select r.id, r.descripcion, r.precio_unitario, r.cantidad, r.cantidad_recibida, r.linea
    into v_r
    from public.orden_renglones r
   where r.id = p_renglon_id and r.orden_id = p_orden_id;
  if v_r.id is null then
    raise exception 'Ese renglón no es de esta orden.' using errcode = 'P0002';
  end if;

  if v_r.cantidad_recibida > 0 then
    raise exception 'De «%» ya entraron % al almacén a % cada uno, y el libro de inventario no se edita.',
      v_r.descripcion, private.numero_es(v_r.cantidad_recibida, 2),
      private.numero_es(v_r.precio_unitario, 4)
      using errcode = '55000',
            hint = 'Lo que ya entró se arregla con «Corregir el costo» en Existencias. Esta orden habría que anularla.';
  end if;

  if exists (select 1 from public.instrucciones_pago
              where orden_id = p_orden_id and estado in ('POR_PAGAR', 'PAGADA')) then
    raise exception 'La orden % ya tiene pagos indicados: se comprometió dinero contra este número.', v_o.numero
      using errcode = '55000',
            hint = 'Retira la instrucción de pago antes de corregir el precio.';
  end if;

  if exists (select 1 from public.facturas_compra
              where orden_id = p_orden_id and estado <> 'ANULADA') then
    raise exception 'La orden % ya tiene cargada la factura del proveedor, y ese papel dice lo que dice.', v_o.numero
      using errcode = '55000',
            hint = 'Si la factura está mal, anúlala primero.';
  end if;

  v_antes   := v_r.precio_unitario;
  v_total_a := v_o.total;

  if round(v_antes, 6) = round(p_precio, 6) then
    raise exception '«%» ya está a %.', v_r.descripcion, private.numero_es(p_precio, 4)
      using errcode = '22023';
  end if;

  update public.orden_renglones
     set precio_unitario = p_precio,
         motivo = btrim(p_motivo)
   where id = p_renglon_id;

  -- La cotizacion de la que salio, para que las dos digan lo mismo.
  if v_o.cotizacion_id is not null then
    select cr.id into v_cot_ren
      from public.cotizacion_renglones cr
      join public.solicitud_renglones sr on sr.id = cr.solicitud_renglon_id
     where cr.cotizacion_id = v_o.cotizacion_id
       and sr.linea = v_r.linea;

    if v_cot_ren is not null then
      update public.cotizacion_renglones set precio_unitario = p_precio where id = v_cot_ren;
      perform private.recalcular_cotizacion(v_o.cotizacion_id);
    end if;
  end if;

  /*
    Y LA ORDEN SE REHACE DESDE LA COTIZACION YA RECALCULADA, que es de donde
    salio al aprobarse. Si no se pudo emparejar el renglon —una orden vieja sin
    cotizacion— se recalcula sola con la misma formula.
  */
  if v_cot_ren is not null then
    update public.ordenes_compra o
       set subtotal = c.subtotal, iva = c.iva, total = c.total
      from public.cotizaciones c
     where o.id = p_orden_id and c.id = v_o.cotizacion_id;
  else
    update public.ordenes_compra o
       set subtotal = s.suma,
           total    = round(s.suma - o.descuento + o.flete + o.iva, 2)
      from (select coalesce(sum(subtotal), 0) as suma
              from public.orden_renglones where orden_id = p_orden_id) s
     where o.id = p_orden_id;
  end if;

  select o.total into v_total_d from public.ordenes_compra o where o.id = p_orden_id;

  return jsonb_build_object(
    'orden',        v_o.numero,
    'renglon',      v_r.descripcion,
    'precio_antes', v_antes,
    'precio_ahora', p_precio,
    'total_antes',  v_total_a,
    'total_ahora',  v_total_d,
    'moneda',       v_o.moneda);
end;
$function$;

-- ---------------------------------------------------------------------------
revoke execute on function public.revisar_costo_de_entrada(bigint, bigint, numeric, text, date) from public, anon;
revoke execute on function public.articulos_parecidos(text, bigint, text) from public, anon;
revoke execute on function public.corregir_precio_de_orden(bigint, bigint, numeric, text) from public, anon;

grant execute on function public.revisar_costo_de_entrada(bigint, bigint, numeric, text, date) to authenticated;
grant execute on function public.articulos_parecidos(text, bigint, text) to authenticated;
grant execute on function public.corregir_precio_de_orden(bigint, bigint, numeric, text) to authenticated;

comment on function public.revisar_costo_de_entrada(bigint, bigint, numeric, text, date) is
  'Contesta si el costo que se esta tecleando es el primero de ese articulo en ese almacen, si se sale diez veces del que viene teniendo, o si es normal. Existe porque la pantalla no puede decidirlo leyendo v_existencias: esa vista devuelve NULO a quien no ve valoraciones. Dice QUE pasa a todos y CUANTO solo a quien puede ver el dinero.';
comment on function public.articulos_parecidos(text, bigint, text) is
  'Los articulos que ya existen y se parecen a un nombre. Advierte y sugiere; no impide, porque DISCO DE CORTE 7 y DISCO DE CORTE 9 son dos cosas. `es_el_mismo` marca el caso sin duda: los dos nombres se reducen al mismo nucleo.';
comment on function public.corregir_precio_de_orden(bigint, bigint, numeric, text) is
  'Corrige un precio mal tecleado en una orden sin rehacerla. Toca tambien el renglon de la cotizacion de la que salio, para que las dos digan lo mismo, y recalcula las dos. Se para si ese renglon ya recibio algo, si hay pagos indicados o si esta la factura del proveedor. Exige un porque, que queda en el renglon y de ahi en la auditoria.';

/*
  COMPROBADO, Y ESTA COMPROBACION ES EL PUNTO ENTERO DEL ARCHIVO.

  Escribir un cuerpo «de memoria» en una migracion es exactamente como se
  llega a que el archivo y la base cuenten cosas distintas, que es el problema
  que estos dos archivos vienen a cerrar. Asi que se midio, comparando cada
  cuerpo de aqui contra `pg_proc.prosrc` de la base viva:

    corregir_costo ............. identico, caracter a caracter (4.375)
    impacto_de_corregir_costo .. identico, caracter a caracter (2.103)
    articulos_parecidos ........ codigo identico; comentarios acortados
    corregir_precio_de_orden ... codigo identico; comentarios acortados
    revisar_costo_de_entrada ... codigo identico; comentarios acortados

  Los tres ultimos se compararon quitando comentarios y colapsando espacios: el
  md5 del codigo coincide. Reconstruir desde estos archivos da las mismas
  funciones.

  COMO REPETIRLO, que es lo que hace falta la proxima vez:

      select p.proname,
             md5(regexp_replace(
                   regexp_replace(
                     regexp_replace(p.prosrc, '/\*.*?\*/', '', 'gs'),
                     '--[^\n]*', '', 'g'),
                   '\s+', ' ', 'g'))
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = '<la funcion>';

  y el mismo md5 sobre el cuerpo del archivo. Si no coinciden, el archivo miente.
*/
