/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  11 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
  las crea. No cambia nada en la base: son los mismos cuerpos que ya corren,
  puestos donde reconstruir desde cero da lo mismo que hay.

  POR QUE APARECIO ESTA DIFERENCIA, que es lo unico interesante de este archivo:
  las migraciones de esta casa parchean con `pg_get_functiondef` + `replace` en
  vez de reescribir funciones de siete mil letras. El parche es correcto y el
  motivo es bueno —copiar a mano es lo que introduce diferencias—, pero deja el
  cuerpo repartido entre el archivo que la creo y los cinco que la tocaron
  despues. El archivo deja de servir para reconstruir aunque cada parche este
  bien.

  Lo levanto el carril de base de datos, tres veces en un dia, y la tercera con
  el diagnostico que lo explica: no es falta de cuidado, es que la verificacion
  se hace UNA VEZ al escribir y seis migraciones despues otra cosa toca la misma
  funcion. Un md5 comprobado el lunes no dice nada del miercoles.

  Por eso esto es generado y no transcrito: volcar la salida de Postgres no puede
  introducir una diferencia, y teclearla si.

  QUE SE COMPROBO ANTES DE GUARDARLO

  Cada cuerpo de aqui se comparo BYTE A BYTE contra `pg_proc.prosrc` de la base
  viva —no normalizado, no perdonando comentarios— y los 11 coinciden. Y el
  detector, que antes marcaba estas 11, pasa a cero.

  NO SE APLICO, Y ES A PROPOSITO

  Aplicarlo seria un no-op: son exactamente los cuerpos que ya corren, sacados de
  `pg_get_functiondef`. Su valor no esta en cambiar la base sino en que
  reconstruirla desde cero de lo mismo que hay.

  Y LA TRAMPA QUE ESO DEJA, dicha aqui para que no sorprenda: si manana otra
  migracion toca una de estas funciones y alguien corre ESTE archivo suelto,
  despues, la revierte al cuerpo de hoy. En orden no pasa —va fechado con su dia y
  detras de todo lo de ese dia—, pero un volcado no es una migracion normal y
  conviene saberlo antes de ejecutarlo a mano.
*/

-- private.auditar()
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION private.auditar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quien record; v_antes jsonb; v_despues jsonb; v_fila jsonb; v_cambios text[];
  v_clave text; v_partes text[] := '{}'; v_etiqueta text; v_col text;
  v_modulo text; v_motivo text;
begin
  if TG_OP = 'DELETE' then
    v_antes := to_jsonb(OLD);
  elsif TG_OP = 'INSERT' then
    v_despues := to_jsonb(NEW);
  else
    v_antes := to_jsonb(OLD); v_despues := to_jsonb(NEW);
    select array_agg(e.key order by e.key) into v_cambios
      from jsonb_each(v_despues) e where e.value is distinct from v_antes -> e.key;
    -- Un UPDATE que no cambio nada no es un movimiento. Anotarlo llenaria el
    -- registro de renglones vacios entre los que si dicen algo.
    if v_cambios is null then return null; end if;
  end if;

  v_fila := coalesce(v_despues, v_antes);

  -- La clave primaria, tal como la declaro la tabla.
  -- `coalesce` porque un disparador declarado SIN argumentos deja TG_ARGV en
  -- NULL, no en un array vacio, y `foreach in array NULL` revienta con 22004.
  -- Cinco catalogos estaban asi y no se podian editar desde la pantalla.
  foreach v_col in array coalesce(TG_ARGV, '{}'::text[]) loop
    v_partes := v_partes || coalesce(v_fila ->> v_col, '?');
  end loop;
  v_clave := nullif(array_to_string(v_partes, '·'), '');

  -- Con que reconocerla de un vistazo. Es una preferencia, no una regla.
  --
  -- `rol` va de los primeros a proposito. Las tablas que reparten permisos se
  -- identifican por un uuid y un codigo, y sin etiqueta el registro ensenaba
  -- «e0a9d9b2-…·RRHH», que no dice quien le dio que a quien.
  -- La etiqueta la arma `private.etiqueta_de_fila`: primero busca un nombre en
  -- la propia fila y, si no lo hay, camina sus claves foraneas. Antes esto era
  -- solo la primera pasada, y por eso 572 de 1.097 filas no decian de que
  -- hablaban: las once tablas hijas no tienen nombre propio.
  v_etiqueta := private.etiqueta_de_fila(TG_TABLE_NAME, v_fila);

  /*
    EL PORQUE, SUBIDO A COLUMNA PROPIA.

    Estaba guardado —dentro de `despues`— pero habia que abrir el JSON para
    leerlo, asi que no se podia filtrar por el ni listarlo. Christopher, el
    7/09/2026: «el sistema siempre debe de reflejar en lo posible la razon, para
    que todo sea transparente».

    Se busca en el orden en que las tablas de la casa nombran esa idea. El
    motivo de anulacion va PRIMERO: cuando existe, es la razon que mas importa
    de esa fila —alguien deshizo algo— y taparla con la nota de cuando se creo
    seria contar la mitad vieja de la historia.
  */
  foreach v_col in array array[
    'motivo_anulacion', 'motivo_cancelacion', 'motivo', 'razon', 'nota',
    'observacion', 'descripcion', 'causa'
  ] loop
    if v_fila ? v_col and nullif(trim(coalesce(v_fila ->> v_col, '')), '') is not null then
      v_motivo := left(v_fila ->> v_col, 500); exit;
    end if;
  end loop;

  -- El modulo se congela al escribir: si manana una tabla cambia de modulo, lo
  -- ya registrado sigue diciendo donde paso.
  select m.modulo into v_modulo from public.auditoria_modulos m where m.tabla = TG_TABLE_NAME;

  select * into v_quien from private.quien_escribe();

  insert into public.auditoria
    (usuario_id, usuario, nombre, tabla, operacion, fila_id, etiqueta,
     antes, despues, cambios, ip, modulo, motivo)
  values
    (v_quien.id, v_quien.usuario, v_quien.nombre, TG_TABLE_NAME, TG_OP, v_clave, v_etiqueta,
     v_antes, v_despues, v_cambios, private.ip_de_la_peticion(), v_modulo, v_motivo);

  return null;
end;
$function$;

-- private.codigo_de_articulo(p_categoria text)
-- venia de: 20260824340000_el_codigo_del_articulo_se_pone_solo.sql
CREATE OR REPLACE FUNCTION private.codigo_de_articulo(p_categoria text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_prefijo text;
  v_ultimo  integer;
  v_codigo  text;
  v_vueltas integer := 0;
begin
  v_prefijo := private.prefijo_de_categoria(p_categoria);

  loop
    -- `anio = 0` dice que la serie no es anual. La clave primaria es
    -- (prefijo, anio), así que no choca con los correlativos de documentos.
    insert into public.correlativos (prefijo, anio, ultimo)
    values (v_prefijo, 0, 1)
    on conflict (prefijo, anio) do update
      set ultimo = public.correlativos.ultimo + 1
    returning ultimo into v_ultimo;

    v_codigo := format('%s-%s', v_prefijo, lpad(v_ultimo::text, 4, '0'));

    exit when not exists (select 1 from public.articulos where codigo = v_codigo);

    -- Alguien lo escribió a mano antes de que el contador llegara. Se pide el
    -- siguiente. El tope es por si acaso: mil choques seguidos no es un dato
    -- raro, es un bucle, y un bucle infinito dentro de una transacción se lleva
    -- la conexión por delante.
    v_vueltas := v_vueltas + 1;
    if v_vueltas > 1000 then
      raise exception 'No se pudo generar un código libre para la categoría %.', p_categoria
        using errcode = '55000',
              hint = 'Escribe el código a mano.';
    end if;
  end loop;

  return v_codigo;
end;
$function$;

-- private.registrar_movimiento(p_tipo text, p_signo integer, p_almacen bigint, p_articulo bigint, p_cantidad numeric, p_costo_usd numeric, p_nota text, p_orden bigint, p_renglon bigint, p_origen bigint, p_fecha date, p_empleado bigint, p_clase text, p_nota_salida text, p_aviso_costo numeric, p_cantidad_capturada numeric, p_unidad_capturada text, p_suelto_capturado numeric, p_costo_capturado numeric, p_costo_unidad_capturada text, p_moneda_capturada text)
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION private.registrar_movimiento(p_tipo text, p_signo integer, p_almacen bigint, p_articulo bigint, p_cantidad numeric, p_costo_usd numeric, p_nota text DEFAULT NULL::text, p_orden bigint DEFAULT NULL::bigint, p_renglon bigint DEFAULT NULL::bigint, p_origen bigint DEFAULT NULL::bigint, p_fecha date DEFAULT NULL::date, p_empleado bigint DEFAULT NULL::bigint, p_clase text DEFAULT NULL::text, p_nota_salida text DEFAULT NULL::text, p_aviso_costo numeric DEFAULT NULL::numeric, p_cantidad_capturada numeric DEFAULT NULL::numeric, p_unidad_capturada text DEFAULT NULL::text, p_suelto_capturado numeric DEFAULT NULL::numeric, p_costo_capturado numeric DEFAULT NULL::numeric, p_costo_unidad_capturada text DEFAULT NULL::text, p_moneda_capturada text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_unidad text; v_id bigint; v_capacidad numeric; v_nombre text; v_hay numeric;
begin
  if p_signo not in (-1, 1) then
    raise exception 'El signo de un movimiento solo puede ser +1 o -1 (recibido: %).', p_signo
      using errcode = '22023';
  end if;

  select unidad into v_unidad from public.articulos where id = p_articulo;
  if v_unidad is null then
    raise exception 'No existe el artículo %.', p_articulo using errcode = 'P0002';
  end if;

  if p_signo = 1 then
    select capacidad, nombre into v_capacidad, v_nombre from public.almacenes where id = p_almacen;
    if v_capacidad is not null then
      perform pg_catalog.pg_advisory_xact_lock(p_almacen::int, 0);
      select coalesce(sum(m.cantidad * m.signo), 0) into v_hay
        from public.inventario_movimientos m
       where m.almacen_id = p_almacen and m.unidad = v_unidad;
      if v_hay + p_cantidad > v_capacidad then
        raise exception 'En "%" caben % % y ya hay %: no entran % más.',
          v_nombre, private.cantidad_es(v_capacidad), v_unidad, private.cantidad_es(v_hay), private.cantidad_es(p_cantidad)
          using errcode = '22023', hint = format('Quedan %s libres.', private.cantidad_es(v_capacidad - v_hay));
      end if;
    end if;
  end if;

  /*
    Todo esto se escribe AQUI y no despues con un update, porque el libro es
    inmutable: `trg_movimientos_inmutables` rechaza UPDATE y DELETE. Un dato del
    movimiento nace con el movimiento.

    COMO SE CONTO, ADEMAS DE CUANTO ES. `cantidad` es siempre la unidad de
    operacion —de ahi salen la existencia y todos los calculos— y al lado queda
    lo que la persona dijo: «7 TAMBOR + 10 L». Se guarda el trio entero y no se
    deriva ninguno de los otros dos, porque `unidades_por_presentacion` puede
    cambiar en el catalogo y entonces el movimiento viejo contaria una mentira
    nueva. Un asiento tiene que poder leerse dentro de diez anos sin depender de
    una tabla que se edita.
  */
  insert into public.inventario_movimientos
    (numero, fecha, tipo, signo, almacen_id, articulo_id, cantidad, unidad,
     costo_usd, orden_id, orden_renglon_id, movimiento_origen, nota, empleado_id,
     entrega_clase, registrado_por, nota_salida, aviso_costo,
     cantidad_capturada, unidad_capturada, suelto_capturado, costo_capturado, costo_unidad_capturada, moneda_capturada)
  values
    (private.siguiente_numero('MOV'), coalesce(p_fecha, current_date), p_tipo, p_signo,
     p_almacen, p_articulo, p_cantidad, v_unidad, coalesce(p_costo_usd, 0),
     p_orden, p_renglon, p_origen, nullif(trim(coalesce(p_nota, '')), ''), p_empleado,
     p_clase, (select auth.uid()), p_nota_salida, p_aviso_costo,
     nullif(p_cantidad_capturada, 0),
     nullif(btrim(coalesce(p_unidad_capturada, '')), ''),
     nullif(p_suelto_capturado, 0),
     p_costo_capturado,
     nullif(btrim(coalesce(p_costo_unidad_capturada, '')), ''),
     nullif(btrim(coalesce(p_moneda_capturada, '')), ''))
  returning id into v_id;

  return v_id;
end;
$function$;

-- public.crear_articulo(p_codigo text, p_nombre text, p_categoria text, p_unidad text, p_descripcion text, p_inventariable boolean, p_stock_minimo numeric, p_modo_entrega text, p_reparable boolean, p_presentacion text, p_unidades_por_presentacion numeric, p_marca text, p_numero_parte text, p_confirmado boolean)
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.crear_articulo(p_codigo text, p_nombre text, p_categoria text, p_unidad text, p_descripcion text DEFAULT NULL::text, p_inventariable boolean DEFAULT true, p_stock_minimo numeric DEFAULT 0, p_modo_entrega text DEFAULT NULL::text, p_reparable boolean DEFAULT NULL::boolean, p_presentacion text DEFAULT NULL::text, p_unidades_por_presentacion numeric DEFAULT NULL::numeric, p_marca text DEFAULT NULL::text, p_numero_parte text DEFAULT NULL::text, p_confirmado boolean DEFAULT false)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id        bigint;
  v_modo      text;
  v_codigo    text;
  v_reparable boolean;
  v_pres      text := nullif(trim(coalesce(p_presentacion, '')), '');
  v_igual     record;
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');

  if length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El artículo necesita un nombre.' using errcode = '22023';
  end if;

  /*
    EL QUE YA ESTA Y SE LLAMA IGUAL.

    Christopher: «debemos asegurar que el sistema impide (o minimo
    advierte/sugiere) duplicados... Insumos o Insumo, Repuesto disco de corte 7'
    o Disco de corte 7'».

    Aqui se PARA, no se impide: dos articulos pueden llamarse casi igual y ser
    dos cosas —DISCO DE CORTE 7 y DISCO DE CORTE 9—, asi que la decision es de
    quien lo esta creando. Lo que no puede pasar es que la tome sin enterarse.

    Solo salta con el nucleo IDENTICO. Los parecidos de menos —«aceite motor SAE
    50» contra «ACEITE DE MOTOR SAE 50»— los ensena la pantalla mientras se
    escribe, con `articulos_parecidos`, que para eso sugiere sin bloquear.

    El inactivo tambien cuenta: se desactiva lo que deja de usarse, no lo que
    deja de existir, y volver a crearlo con otro codigo parte su historia en dos.
  */
  if not coalesce(p_confirmado, false) then
    select a.codigo, a.nombre, a.activo into v_igual
      from public.articulos a
     where private.nombre_nucleo(a.nombre) = private.nombre_nucleo(p_nombre)
     order by a.activo desc
     limit 1;

    if v_igual.codigo is not null then
      -- Tres huecos separados. `%%` seria un porcentaje literal, no dos.
      raise exception 'Ya existe «%» con el código %.% Si de verdad es otra cosa, confírmalo.',
        v_igual.nombre, v_igual.codigo,
        case when v_igual.activo then '' else ' Está inactivo, pero sigue en el catálogo.' end
        using errcode = '22023',
              hint = 'Dos artículos casi iguales acaban con la existencia repartida entre los dos y ninguno cuadrando.';
    end if;
  end if;

  /*
    EL CODIGO NO SE PIDE: SE PONE.

    Once de los quince articulos de hoy llevan el nombre metido en el campo del
    codigo —«ACEITE AGROFLUIDOS» es a la vez nombre y codigo— porque la planilla
    lo exigia y quien la lleno no tenia ninguno que escribir. Un codigo que es
    el nombre no distingue nada: el indice unico deja pasar el mismo articulo
    dos veces con una letra de diferencia.
  */
  v_codigo := nullif(upper(trim(coalesce(p_codigo, ''))), '');

  -- El nombre no sirve de codigo. Ver el comentario de arriba.
  if v_codigo is not null
     and private.nombre_nucleo(v_codigo) = private.nombre_nucleo(p_nombre) then
    raise exception 'El código no puede ser el nombre del artículo.'
      using errcode = '22023',
            hint = 'Déjalo vacío y se pone solo, con el prefijo de su categoría.';
  end if;

  /*
    UN CODIGO RETIRADO NO SE PUEDE REUTILIZAR. Se dice de quien era y como se
    llama ahora: encontrarse un «no disponible» a secas obliga a investigar lo
    mismo que retirarlo pretendia ahorrar.
  */
  if v_codigo is not null then
    declare v_r record;
    begin
      select r.codigo_nuevo, a.nombre into v_r
        from public.codigos_retirados r
        join public.articulos a on a.id = r.articulo_id
       where r.codigo = v_codigo;

      if v_r.codigo_nuevo is not null then
        raise exception 'El código % ya se usó: era "%" y ahora se llama %. No se puede reutilizar.',
          v_codigo, v_r.nombre, v_r.codigo_nuevo
          using errcode = '22023',
                hint = 'Un papel viejo con ese código tiene que seguir refiriéndose a lo mismo.';
      end if;
    end;
  end if;

  if v_codigo is null then
    v_codigo := private.codigo_de_articulo(p_categoria);
  end if;

  v_reparable := coalesce(p_reparable, p_categoria in ('HERRAMIENTA', 'REPUESTO'));

  v_modo := coalesce(nullif(trim(coalesce(p_modo_entrega, '')), ''),
    case p_categoria
      when 'HERRAMIENTA' then 'RETORNABLE'
      when 'EPP'         then 'RETORNABLE'
      when 'PRODUCTO'    then 'NO'
      when 'SERVICIO'    then 'NO'
      else 'CONSUMIBLE'
    end);

  if v_pres is null and p_unidades_por_presentacion is not null then
    raise exception 'Dice cuántas unidades trae la presentación, pero no dice cuál es. Escribe la presentación o deja las dos vacías.'
      using errcode = '22023';
  end if;

  insert into public.articulos
    (codigo, nombre, descripcion, categoria, unidad, inventariable, stock_minimo,
     modo_entrega, reparable, presentacion, unidades_por_presentacion,
     marca, numero_parte, creado_por)
  values
    (v_codigo, trim(p_nombre), nullif(trim(coalesce(p_descripcion, '')), ''),
     p_categoria, p_unidad,
     case when p_categoria = 'SERVICIO' then false else p_inventariable end,
     coalesce(p_stock_minimo, 0), v_modo, v_reparable,
     v_pres, p_unidades_por_presentacion,
     nullif(trim(coalesce(p_marca, '')), ''),
     nullif(trim(coalesce(p_numero_parte, '')), ''),
     (select auth.uid()))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un artículo con el código %.', v_codigo
      using errcode = '23505';
  when foreign_key_violation then
    raise exception 'Esa presentación no está en la lista.' using errcode = '23503';
end;
$function$;

-- public.envases_aqui(p_articulo_id bigint, p_almacen_id bigint)
-- venia de: 20260909240000_un_conteo_que_cuadra_tambien_es_un_conteo.sql
CREATE OR REPLACE FUNCTION public.envases_aqui(p_articulo_id bigint, p_almacen_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conteo   bigint;
  v_corte    bigint;
  v_corte_re bigint;
  v_desde    date;
  v_ciegos   numeric := 0;
  v_saldo    jsonb := '{}'::jsonb;
  v_r        record;
  v_unidad   text;
  v_existe   numeric;
  v_en_envas numeric := 0;
  v_costo    numeric;
  v_lista    jsonb := '[]'::jsonb;
  v_pres     text;
  v_cuantos  numeric;
  v_por      numeric;
begin
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  select unidad into v_unidad from public.articulos where id = p_articulo_id;
  if v_unidad is null then
    return jsonb_build_object('confiable', false, 'por_que', 'No existe el artículo.');
  end if;

  -- El ultimo conteo con hoja: es el unico que dice QUE envases habia.
  select c.id, c.fecha, c.corte_movimiento, c.corte_reenvase
    into v_conteo, v_desde, v_corte, v_corte_re
    from public.conteos c
   where c.articulo_id = p_articulo_id
     and c.almacen_id = p_almacen_id
     and exists (select 1 from public.conteo_envases ce where ce.conteo_id = c.id)
   order by c.id desc
   limit 1;

  if v_conteo is not null then
    for v_r in select ce.presentacion, ce.cantidad
                 from public.conteo_envases ce where ce.conteo_id = v_conteo loop
      v_saldo := v_saldo || jsonb_build_object(v_r.presentacion,
                   coalesce((v_saldo ->> v_r.presentacion)::numeric, 0) + v_r.cantidad);
    end loop;
  end if;

  for v_r in
    select m.signo, m.cantidad,
           nullif(btrim(coalesce(m.unidad_capturada, '')), '') as envase,
           coalesce(m.cantidad_capturada, 0) as bultos
      from public.inventario_movimientos m
     where m.articulo_id = p_articulo_id
       and m.almacen_id = p_almacen_id
       and m.tipo <> 'AJUSTE_COSTO'
       and (v_corte is null or m.id > v_corte)
     order by m.id
  loop
    if v_r.envase is null or v_r.bultos = 0 then
      v_ciegos := v_ciegos + v_r.cantidad;
    else
      v_saldo := v_saldo || jsonb_build_object(v_r.envase,
                   coalesce((v_saldo ->> v_r.envase)::numeric, 0) + v_r.signo * v_r.bultos);
    end if;
  end loop;

  for v_r in
    select re.desde_presentacion, re.desde_cantidad,
           re.hacia_presentacion, re.hacia_cantidad
      from public.reenvases re
     where re.articulo_id = p_articulo_id
       and re.almacen_id = p_almacen_id
       -- Por id y no por fecha: una fecha no ordena dos cosas del mismo dia.
       and (v_corte_re is null or re.id > v_corte_re)
     order by re.id
  loop
    if v_r.desde_presentacion is not null then
      v_saldo := v_saldo || jsonb_build_object(v_r.desde_presentacion,
                   coalesce((v_saldo ->> v_r.desde_presentacion)::numeric, 0) - v_r.desde_cantidad);
    end if;
    if v_r.hacia_presentacion is not null then
      v_saldo := v_saldo || jsonb_build_object(v_r.hacia_presentacion,
                   coalesce((v_saldo ->> v_r.hacia_presentacion)::numeric, 0) + v_r.hacia_cantidad);
    end if;
  end loop;

  if v_ciegos > 0.0001 then
    return jsonb_build_object(
      'confiable', false,
      'por_que', format('Desde %s se movieron %s %s sin decir en qué envase, así que ya no se puede saber cuántos hay de cada uno. Un conteo lo vuelve a fijar.',
        case when v_desde is null then 'siempre' else 'el ' || to_char(v_desde, 'DD/MM/YYYY') end,
        private.numero_es(v_ciegos, 2), v_unidad));
  end if;

  v_existe := private.existencia(p_almacen_id, p_articulo_id);
  v_costo  := private.costo_promedio(p_almacen_id, p_articulo_id);

  for v_pres, v_cuantos in select * from jsonb_each_text(v_saldo) loop
    continue when coalesce(v_cuantos, 0) = 0;
    if v_cuantos < 0 then
      return jsonb_build_object(
        'confiable', false,
        'por_que', format('Las cuentas dan %s envases de %s, que es imposible: falta algo por anotar.',
          private.numero_es(v_cuantos, 0), v_pres));
    end if;

    select ap.unidades into v_por from public.articulo_presentaciones ap
     where ap.articulo_id = p_articulo_id and ap.presentacion = v_pres;

    if coalesce(v_por, 0) <= 0 then
      return jsonb_build_object(
        'confiable', false,
        'por_que', format('«%s» ya no dice cuántas %s trae, así que no se puede valorar.', v_pres, v_unidad));
    end if;

    v_en_envas := v_en_envas + v_cuantos * v_por;
    v_lista := v_lista || jsonb_build_object(
      'presentacion', v_pres,
      'cuantos', v_cuantos,
      'unidades', v_por,
      'valor_usd', case when v_costo is not null then round(v_costo * v_por * v_cuantos, 2) end);
  end loop;

  if v_en_envas > v_existe + 0.1 then
    return jsonb_build_object(
      'confiable', false,
      'por_que', format('Los envases suman %s %s y en el libro hay %s: falta algo por anotar.',
        private.numero_es(v_en_envas, 2), v_unidad, private.numero_es(v_existe, 2)));
  end if;

  return jsonb_build_object(
    'confiable', true,
    'desde', v_desde,
    'nunca_contado', v_conteo is null,
    'envases', v_lista,
    'sueltos', round(v_existe - v_en_envas, 4),
    'valor_sueltos', case when v_costo is not null
                          then round(v_costo * (v_existe - v_en_envas), 2) end,
    'unidad', v_unidad);
end;
$function$;

-- public.guardar_almacen(p_id bigint, p_codigo text, p_nombre text, p_tipo text, p_ubicacion text, p_recibe_compras boolean, p_activo boolean, p_capacidad numeric, p_trabajos_a_la_vez smallint, p_propietario text, p_responsable_id bigint)
-- venia de: 20260910080000_no_todo_lo_que_esta_aqui_es_nuestro.sql
CREATE OR REPLACE FUNCTION public.guardar_almacen(p_id bigint DEFAULT NULL::bigint, p_codigo text DEFAULT NULL::text, p_nombre text DEFAULT NULL::text, p_tipo text DEFAULT 'ALMACEN'::text, p_ubicacion text DEFAULT NULL::text, p_recibe_compras boolean DEFAULT false, p_activo boolean DEFAULT true, p_capacidad numeric DEFAULT NULL::numeric, p_trabajos_a_la_vez smallint DEFAULT NULL::smallint, p_propietario text DEFAULT NULL::text, p_responsable_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id     bigint;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_dueno  text := nullif(btrim(coalesce(p_propietario, '')), '');
begin
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');

  if length(v_codigo) < 2 then
    raise exception 'El almacén necesita un código que lo identifique.' using errcode = '23514';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El almacén necesita un nombre.' using errcode = '23514';
  end if;
  if p_tipo not in ('PATIO', 'ALMACEN', 'TALLER', 'COMBUSTIBLE', 'TRANSITO') then
    raise exception 'Tipo de almacén no válido: %.', p_tipo using errcode = '22023';
  end if;

  if p_capacidad is not null and p_capacidad <= 0 then
    raise exception 'La capacidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  -- La capacidad solo significa algo en un tanque: un patio no tiene tope y un
  -- almacén tampoco.
  if p_capacidad is not null and p_tipo <> 'COMBUSTIBLE' then
    raise exception 'Solo un tanque de combustible dice cuánto le cabe.'
      using errcode = '22023',
            hint = 'Un patio o un almacén no tienen tope: déjalo vacío.';
  end if;

  if p_trabajos_a_la_vez is not null and p_tipo <> 'TALLER' then
    raise exception 'Solo un taller dice cuántos trabajos aguanta a la vez.'
      using errcode = '22023';
  end if;

  /*
    EL DUEÑO SE COMPRUEBA AQUÍ Y NO SE DEJA A LA CLAVE FORÁNEA: «viola la
    restricción almacenes_propietario_fkey» no le sirve a nadie.
  */
  if v_dueno is not null
     and not exists (select 1 from public.propietarios d
                      where d.codigo = v_dueno and d.activo) then
    raise exception 'No hay ningún dueño que se llame "%".', v_dueno
      using errcode = '23503',
            hint = 'Hoy están La Cantera y la Gobernación.';
  end if;

  /* Y el responsable, por lo mismo: con el nombre delante se corrige sin salir. */
  if p_responsable_id is not null
     and not exists (select 1 from public.empleados e
                      where e.id = p_responsable_id and e.activo) then
    raise exception 'Ese empleado no existe o ya no está activo.'
      using errcode = '23503';
  end if;

  /*
    EL DUEÑO NO CAMBIA CON EL ALMACÉN LLENO. Reescribiría de quién es todo lo que
    hay dentro sin un solo asiento que lo explique.
  */
  if p_id is not null and v_dueno is not null then
    if exists (select 1 from public.almacenes a
                where a.id = p_id and a.propietario is distinct from v_dueno)
       and exists (select 1 from public.v_existencias e
                    where e.almacen_id = p_id and e.existencia <> 0) then
      raise exception 'No se puede cambiar de dueño un almacén que tiene cosas dentro.'
        using errcode = '22023',
              hint = 'Sácalo todo primero. Cambiarlo lleno reescribiría de quién es lo que hay sin dejar rastro de por qué.';
    end if;
  end if;

  if p_id is null then
    insert into public.almacenes
      (codigo, nombre, tipo, ubicacion, recibe_compras, activo, capacidad,
       trabajos_a_la_vez, propietario, responsable_id)
    values
      (v_codigo, btrim(p_nombre), p_tipo,
       nullif(btrim(coalesce(p_ubicacion, '')), ''),
       coalesce(p_recibe_compras, false), coalesce(p_activo, true),
       p_capacidad, p_trabajos_a_la_vez, coalesce(v_dueno, 'LACANTERA'),
       p_responsable_id)
    returning id into v_id;
  else
    update public.almacenes
       set codigo = v_codigo,
           nombre = btrim(p_nombre),
           tipo = p_tipo,
           ubicacion = nullif(btrim(coalesce(p_ubicacion, '')), ''),
           recibe_compras = coalesce(p_recibe_compras, false),
           activo = coalesce(p_activo, true),
           capacidad = p_capacidad,
           trabajos_a_la_vez = p_trabajos_a_la_vez,
           propietario = coalesce(v_dueno, propietario),
           /*
             TAL CUAL Y NO CON coalesce: quitarle el responsable a un almacén es
             una decisión, y con coalesce mandar nulo se leería como «déjalo como
             está», así que el cargo no se podría soltar nunca.
           */
           responsable_id = p_responsable_id
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe el almacén %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un almacén con el código %.', v_codigo using errcode = '23505';
end;
$function$;

-- public.guardar_maquina(p_id bigint, p_codigo text, p_nombre text, p_tipo text, p_marca text, p_modelo text, p_serial text, p_anio smallint, p_almacen_id bigint, p_tope_horas numeric, p_aviso_horas numeric, p_alarma_horas numeric, p_dias_mantenimiento smallint, p_nota text, p_combustible_id bigint, p_capacidad_combustible numeric, p_propietario text, p_estado text, p_fotos jsonb, p_operador_id bigint)
-- venia de: 20260824240000_la_ficha_de_la_maquina_guarda_su_combustible_y_su_foto.sql
CREATE OR REPLACE FUNCTION public.guardar_maquina(p_id bigint, p_codigo text, p_nombre text, p_tipo text, p_marca text DEFAULT NULL::text, p_modelo text DEFAULT NULL::text, p_serial text DEFAULT NULL::text, p_anio smallint DEFAULT NULL::smallint, p_almacen_id bigint DEFAULT NULL::bigint, p_tope_horas numeric DEFAULT 250, p_aviso_horas numeric DEFAULT 200, p_alarma_horas numeric DEFAULT 220, p_dias_mantenimiento smallint DEFAULT NULL::smallint, p_nota text DEFAULT NULL::text, p_combustible_id bigint DEFAULT NULL::bigint, p_capacidad_combustible numeric DEFAULT NULL::numeric, p_propietario text DEFAULT NULL::text, p_estado text DEFAULT NULL::text, p_fotos jsonb DEFAULT NULL::jsonb, p_operador_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id     bigint;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_art    record;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  if length(v_codigo) < 2 then
    raise exception 'La máquina necesita un código que la identifique.' using errcode = '23514';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'La máquina necesita un nombre.' using errcode = '23514';
  end if;
  if p_tipo not in ('EXCAVADORA','CARGADOR','CAMION','PLANTA','PERFORADORA',
                    'VEHICULO','GENERADOR','OTRO') then
    raise exception 'Tipo de máquina no válido: %.', p_tipo using errcode = '22023';
  end if;
  if not (p_aviso_horas <= p_alarma_horas and p_alarma_horas <= p_tope_horas) then
    raise exception 'El aviso (%) tiene que ir antes que la alarma (%), y la alarma antes que el tope (%).',
      p_aviso_horas, p_alarma_horas, p_tope_horas using errcode = '22023';
  end if;
  if p_tope_horas <= 0 then
    raise exception 'El tope de horas tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if p_almacen_id is not null then
    perform 1 from public.almacenes where id = p_almacen_id;
    if not found then
      raise exception 'No existe el almacén %.', p_almacen_id using errcode = '23503';
    end if;
  end if;

  -- El combustible que quema tiene que ser combustible. Sin esto, elegir por
  -- error un filtro de aire dejaría la máquina sin poder surtirse nunca, y el
  -- mensaje del despacho hablaría de un artículo que no pinta nada.
  if p_combustible_id is not null then
    select id, nombre, categoria into v_art
      from public.articulos where id = p_combustible_id;
    if v_art.id is null then
      raise exception 'No existe el artículo %.', p_combustible_id using errcode = '23503';
    end if;
    if v_art.categoria <> 'COMBUSTIBLE' then
      raise exception '"%" no es combustible.', v_art.nombre using errcode = '22023';
    end if;
  end if;

  if p_capacidad_combustible is not null and p_capacidad_combustible <= 0 then
    raise exception 'La capacidad del tanque tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  /*
    EL ESTADO SOLO AL NACER. Al corregir se ignora: cambiarlo es un hecho que
    `cambiar_estado_maquina` obliga a explicar con un motivo, y desde aqui se
    podria parar una excavadora tocando un desplegable.
  */
  if p_id is null and nullif(btrim(coalesce(p_estado, '')), '') is not null then
    if upper(btrim(p_estado)) = 'EN_MANTENIMIENTO' then
      raise exception 'Una maquina en mantenimiento lo esta en un taller, y eso se abre aparte.'
        using errcode = '22023',
              hint = 'Registrala en espera y abre el mantenimiento: ahi se dice el taller, la especialidad y el porque, y el estado lo pone solo.';
    end if;
    if upper(btrim(p_estado)) not in ('ACTIVA', 'EN_ESPERA', 'FUERA_DE_SERVICIO', 'DESINCORPORADA') then
      raise exception 'Estado de maquina no valido: %.', p_estado using errcode = '22023';
    end if;
  end if;

  /*
    DOS FOTOS COMO MINIMO, Y SOLO AL NACER. Sin esto, «obligatorio al registrar»
    seria una sugerencia: se crearia la maquina y las fotos quedarian para
    despues, que es para nunca.
  */
  if p_id is null
     and coalesce(jsonb_array_length(coalesce(p_fotos, '[]'::jsonb)), 0) < 2 then
    raise exception 'Hacen falta al menos dos fotos de la maquina para registrarla.'
      using errcode = '22023',
            hint = 'Una sola no enseña una maquina: hay un lado que no se ve. Y el dia que se discuta un golpe, lo que vale es lo que se fotografio al recibirla.';
  end if;

  if p_operador_id is not null
     and not exists (select 1 from public.empleados e
                      where e.id = p_operador_id and e.activo) then
    raise exception 'Ese empleado no existe o ya no esta activo.'
      using errcode = '22023',
            hint = 'Una maquina a cargo de quien ya no trabaja aqui esta a cargo de nadie.';
  end if;

  if p_id is null then
    insert into public.maquinaria
      (codigo, nombre, tipo, marca, modelo, serial, anio, almacen_id, estado,
       tope_horas, aviso_horas, alarma_horas, dias_mantenimiento, nota,
       combustible_id, capacidad_combustible, propietario, operador_id, creada_por)
    values
      (v_codigo, btrim(p_nombre), p_tipo,
       nullif(btrim(coalesce(p_marca, '')), ''), nullif(btrim(coalesce(p_modelo, '')), ''),
       nullif(btrim(coalesce(p_serial, '')), ''), p_anio, p_almacen_id,
       coalesce(upper(nullif(btrim(coalesce(p_estado, '')), '')), 'ACTIVA'),
       p_tope_horas, p_aviso_horas, p_alarma_horas, p_dias_mantenimiento,
       nullif(btrim(coalesce(p_nota, '')), ''),
       p_combustible_id, p_capacidad_combustible,
       coalesce(nullif(btrim(coalesce(p_propietario, '')), ''), 'LACANTERA'),
       p_operador_id,
       (select auth.uid()))
    returning id into v_id;

    insert into public.maquina_fotos (maquina_id, path, nota, orden, subida_por)
    select v_id, f.valor ->> 'path',
           nullif(btrim(coalesce(f.valor ->> 'nota', '')), ''),
           (f.orden * 10)::smallint, (select auth.uid())
      from jsonb_array_elements(p_fotos) with ordinality f(valor, orden)
     where nullif(btrim(coalesce(f.valor ->> 'path', '')), '') is not null;
  else
    update public.maquinaria
       set codigo = v_codigo, nombre = btrim(p_nombre), tipo = p_tipo,
           marca  = nullif(btrim(coalesce(p_marca, '')), ''),
           modelo = nullif(btrim(coalesce(p_modelo, '')), ''),
           serial = nullif(btrim(coalesce(p_serial, '')), ''),
           anio   = p_anio, almacen_id = p_almacen_id,
           tope_horas = p_tope_horas, aviso_horas = p_aviso_horas,
           alarma_horas = p_alarma_horas, dias_mantenimiento = p_dias_mantenimiento,
           nota = nullif(btrim(coalesce(p_nota, '')), ''),
           combustible_id = p_combustible_id,
           capacidad_combustible = p_capacidad_combustible,
           propietario = coalesce(nullif(btrim(coalesce(p_propietario, '')), ''), propietario),
           operador_id = p_operador_id
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe la máquina %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe una máquina con el código %.', v_codigo using errcode = '23505';
end;
$function$;

-- public.guardar_presentacion_de_articulo(p_articulo_id bigint, p_presentacion text, p_unidades numeric, p_por_defecto boolean)
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.guardar_presentacion_de_articulo(p_articulo_id bigint, p_presentacion text, p_unidades numeric, p_por_defecto boolean DEFAULT false)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id     bigint;
  v_nombre text := upper(btrim(coalesce(p_presentacion, '')));
  v_art    record;
begin
  /*
    DECLARAR DE QUE FORMAS SE PUEDE CONTAR UN ARTICULO.

    El nombre sale del catalogo compartido —TAMBOR, CAJA, SACO— para que nadie
    escriba «Tambor», «TAMBORES» y «tambor» y acaben siendo tres. El factor
    cuelga del articulo: un tambor es 208 litros para un aceite y 200 para otro,
    y una tabla global de equivalencias obligaria a inventar un tambor estandar
    y a mentir en todos los que no lo son.
  */
  perform private.exigir_accion('INVENTARIO.EDITAR_CATALOGO');

  select nombre, unidad into v_art from public.articulos where id = p_articulo_id;
  if v_art.nombre is null then
    raise exception 'No existe ese artículo.' using errcode = 'P0002';
  end if;

  if v_nombre = '' then
    raise exception 'Dime en qué presentación viene.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.presentaciones where codigo = v_nombre) then
    raise exception '«%» no está en la lista de presentaciones.', v_nombre
      using errcode = '23503',
            hint = 'Las que hay: ' || (select string_agg(codigo, ', ' order by orden)
                                         from public.presentaciones);
  end if;

  if coalesce(p_unidades, 0) <= 0 then
    raise exception 'Dime cuántos % trae un %.', v_art.unidad, v_nombre
      using errcode = '22023';
  end if;

  /*
    UN BULTO QUE TRAE UNA UNIDAD NO ES UN BULTO.

    «Un PAR trae 1 PAR» no aporta nada y confunde la pantalla, que ofreceria dos
    formas de teclear lo mismo. Y es un error real del catalogo de hoy —botas
    con unidad PAR y presentacion PAR— que conviene no dejar repetir.
  */
  perform private.exigir_presentacion_util(v_art.nombre, v_nombre, v_art.unidad);

  /*
    Y SI YA SE USO, EL FACTOR SE CONGELA.

    Apagarla, encenderla o proponerla no reinterpreta nada. Cambiarle las
    unidades si: el asiento viejo dice «3 CAJA» y quien lo lea despues
    multiplicara por el numero nuevo donde la base sumo con el viejo.
  */
  declare v_donde text; v_ya numeric;
  begin
    select ap.unidades into v_ya
      from public.articulo_presentaciones ap
     where ap.articulo_id = p_articulo_id and ap.presentacion = v_nombre;

    if v_ya is not null and v_ya <> p_unidades then
      v_donde := private.presentacion_ya_se_uso(p_articulo_id, v_nombre);
      if v_donde is not null then
        raise exception '«%» ya se usó %, así que no se le puede cambiar cuántas % trae: los papeles ya emitidos dicen esa cantidad.',
          v_nombre, v_donde, v_art.unidad
          using errcode = '55000',
                hint = 'Declara otra presentación con su nombre y apaga ésta. Así el papel viejo se sigue explicando y el nuevo cuenta bien.';
      end if;
    end if;
  end;

  -- Solo una por defecto. Se apaga la anterior ANTES de encender esta, porque
  -- el indice unico parcial no admite dos ni por un instante.
  if p_por_defecto then
    update public.articulo_presentaciones
       set por_defecto = false
     where articulo_id = p_articulo_id and por_defecto;
  end if;

  insert into public.articulo_presentaciones
    (articulo_id, presentacion, unidades, por_defecto, creada_por)
  values (p_articulo_id, v_nombre, p_unidades, coalesce(p_por_defecto, false), (select auth.uid()))
  on conflict (articulo_id, presentacion) do update
     set unidades = excluded.unidades,
         por_defecto = excluded.por_defecto,
         activa = true
  returning id into v_id;

  /*
    Y LAS DOS COLUMNAS VIEJAS SIGUEN LA DE POR DEFECTO.

    `articulos.presentacion` y `unidades_por_presentacion` son la version de una
    sola presentacion, y todavia las leen la pantalla y las funciones que no se
    han migrado. Mientras existan tienen que decir lo mismo que la tabla, o
    volvemos a tener dos fuentes que discrepan — que es el problema del que
    venimos toda la semana.
  */
  update public.articulos a
     set presentacion = d.presentacion,
         unidades_por_presentacion = d.unidades
    from (select ap.presentacion, ap.unidades
            from public.articulo_presentaciones ap
           where ap.articulo_id = p_articulo_id and ap.activa
           order by ap.por_defecto desc, ap.id limit 1) d
   where a.id = p_articulo_id;

  return v_id;
end;
$function$;

-- public.reenvasar(p_almacen_id bigint, p_articulo_id bigint, p_desde_presentacion text, p_desde_cantidad numeric, p_hacia_presentacion text, p_hacia_cantidad numeric, p_motivo text, p_fecha date, p_desde_suelto numeric, p_hacia_suelto numeric)
-- venia de: 20260909220000_vaciar_un_tambor_en_pailas_es_un_hecho_que_se_anota.sql
CREATE OR REPLACE FUNCTION public.reenvasar(p_almacen_id bigint, p_articulo_id bigint, p_desde_presentacion text, p_desde_cantidad numeric, p_hacia_presentacion text, p_hacia_cantidad numeric, p_motivo text, p_fecha date DEFAULT NULL::date, p_desde_suelto numeric DEFAULT 0, p_hacia_suelto numeric DEFAULT 0)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_desde   text := nullif(btrim(coalesce(p_desde_presentacion, '')), '');
  v_hacia   text := nullif(btrim(coalesce(p_hacia_presentacion, '')), '');
  v_vol_a   numeric;
  v_vol_b   numeric;
  v_art     record;
  v_hay     numeric;
  v_id      bigint;
begin
  perform private.exigir_rol('ALMACEN');

  select nombre, unidad into v_art from public.articulos where id = p_articulo_id;
  if v_art.unidad is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se cambió de envase. Dentro de un año será lo único que lo explique.'
      using errcode = '22023';
  end if;

  if v_desde is not distinct from v_hacia then
    raise exception 'Las dos orillas son el mismo envase: eso no es un trasvase.'
      using errcode = '22023';
  end if;

  /*
    LAS DOS ORILLAS, EN LA UNIDAD DE OPERACIÓN, CON SU RESTO.

    `en_unidad_base` convierte y de paso valida que el envase esté declarado para
    ese artículo. El suelto se suma aparte: es lo que no llena un envase entero
    —los 18 L que sobran al vaciar un tambor en diez pailas— y por eso va en su
    propio campo y no como un envase más.
  */
  v_vol_a := coalesce(p_desde_suelto, 0)
           + case when v_desde is null then coalesce(p_desde_cantidad, 0)
                  else private.en_unidad_base(p_articulo_id, p_desde_cantidad, 0, v_desde) end;
  v_vol_b := coalesce(p_hacia_suelto, 0)
           + case when v_hacia is null then coalesce(p_hacia_cantidad, 0)
                  else private.en_unidad_base(p_articulo_id, p_hacia_cantidad, 0, v_hacia) end;

  if v_vol_a <= 0 then
    raise exception 'No se trasvasó nada.' using errcode = '22023';
  end if;

  /*
    Nombrar un envase y decir cero de ellos no significa nada, y la restriccion
    de la tabla lo rechaza — pero en crudo. Se explica aqui, con la salida.
  */
  if v_desde is not null and coalesce(p_desde_cantidad, 0) <= 0 then
    raise exception 'Dice que salen % pero cero de ellos.', v_desde
      using errcode = '22023',
            hint = 'Si lo que sale estaba suelto, elige «suelto» en ese lado en vez de un envase.';
  end if;

  if v_hacia is not null and coalesce(p_hacia_cantidad, 0) <= 0 then
    raise exception 'Dice que queda en % pero cero de ellos.', v_hacia
      using errcode = '22023',
            hint = 'Si lo que queda va suelto, elige «suelto» en ese lado en vez de un envase.';
  end if;

  /*
    SE CONSERVA EL VOLUMEN, Y ESO ES LO QUE HACE QUE ESTO NO PUEDA MENTIR.

    Un tambor son 208 L; diez pailas y 18 sueltos también. Si las dos orillas no
    dan lo mismo, o el trasvase está mal contado o el factor del catálogo está
    mal: en los dos casos hay que enterarse ahora. Esta regla ya cazó un fallo
    del propio diseño antes de que llegara a nadie.

    El margen de un decilitro no es tolerancia a la chapuza: los factores son
    aproximados —la paila trae 19 L «de forma no estricta»— y exigir igualdad
    exacta rechazaría trasvases correctos por el redondeo del catálogo.
  */
  if abs(v_vol_a - v_vol_b) > 0.1 then
    raise exception 'No cuadra: de un lado hay % % y del otro %. Un trasvase no crea ni pierde material.',
      private.numero_es(v_vol_a, 4), v_art.unidad, private.numero_es(v_vol_b, 4)
      using errcode = '22023',
            hint = 'Si sobra líquido, ponlo en «y además, sueltos». Si no, revisa cuántos envases son o lo que trae cada uno.';
  end if;

  v_hay := private.existencia_para_escribir(p_almacen_id, p_articulo_id);
  if v_vol_a > v_hay + 0.0001 then
    raise exception 'Aquí solo hay % % de "%", y se están trasvasando %.',
      private.numero_es(v_hay, 4), v_art.unidad, v_art.nombre, private.numero_es(v_vol_a, 4)
      using errcode = '22023';
  end if;

  insert into public.reenvases (
    almacen_id, articulo_id,
    desde_presentacion, desde_cantidad, desde_suelto,
    hacia_presentacion, hacia_cantidad, hacia_suelto,
    volumen, motivo, fecha, registrado_por)
  values (
    p_almacen_id, p_articulo_id,
    v_desde, coalesce(p_desde_cantidad, 0), coalesce(p_desde_suelto, 0),
    v_hacia, coalesce(p_hacia_cantidad, 0), coalesce(p_hacia_suelto, 0),
    v_vol_a, p_motivo, coalesce(p_fecha, private.hoy_aqui()), auth.uid())
  returning id into v_id;

  return v_id;
end;
$function$;

-- public.registrar_ajuste(p_almacen_id bigint, p_articulo_id bigint, p_contado numeric, p_motivo text, p_fecha date, p_presentaciones numeric, p_presentacion text, p_envases jsonb)
-- venia de: 20260909240000_un_conteo_que_cuadra_tambien_es_un_conteo.sql
CREATE OR REPLACE FUNCTION public.registrar_ajuste(p_almacen_id bigint, p_articulo_id bigint, p_contado numeric, p_motivo text, p_fecha date DEFAULT NULL::date, p_presentaciones numeric DEFAULT NULL::numeric, p_presentacion text DEFAULT NULL::text, p_envases jsonb DEFAULT NULL::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_existencia numeric;
  v_diferencia numeric;
  v_costo      numeric;
  v_total      numeric;
  v_art        record;
  v_conto      text;
  v_mov        bigint;
  v_conteo     bigint;
  v_corte      bigint;
  v_corte_re   bigint;
  v_linea      jsonb;
  v_partes     text[] := '{}';
  v_pres       text;
  v_cant       numeric;
begin
  perform private.exigir_rol('ALMACEN');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Un conteo sin explicación no se puede leer después. Escribe qué se contó y por qué.'
      using errcode = '22023';
  end if;

  select nombre, unidad, presentacion, unidades_por_presentacion
    into v_art from public.articulos where id = p_articulo_id;
  if v_art.unidad is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

  if p_contado is not null and p_contado < 0 then
    raise exception 'Lo contado no puede ser negativo.' using errcode = '22023';
  end if;

  /*
    EL CORTE, ANTES DE ESCRIBIR NADA. Es el ultimo asiento que este conteo
    estaba mirando; todo lo que venga despues se aplica sobre lo contado.
  */
  select max(m.id) into v_corte from public.inventario_movimientos m
   where m.articulo_id = p_articulo_id and m.almacen_id = p_almacen_id;

  -- Y el ultimo trasvase que este conteo ya estaba viendo.
  select max(r.id) into v_corte_re from public.reenvases r
   where r.articulo_id = p_articulo_id and r.almacen_id = p_almacen_id;

  if p_envases is not null and jsonb_array_length(p_envases) > 0 then
    v_total := coalesce(p_contado, 0);

    for v_linea in select * from jsonb_array_elements(p_envases) loop
      v_pres := upper(btrim(coalesce(v_linea ->> 'presentacion', '')));
      v_cant := (v_linea ->> 'cantidad')::numeric;
      if v_pres = '' or coalesce(v_cant, 0) <= 0 then
        continue;
      end if;
      v_total := v_total + private.en_unidad_base(p_articulo_id, v_cant, 0, v_pres);
      v_partes := v_partes || format('%s %s', private.numero_es(v_cant, 0), v_pres);
    end loop;

    if cardinality(v_partes) = 0 then
      raise exception 'No se contó ningún envase.' using errcode = '22023';
    end if;
  else
    if p_presentaciones is not null then
      if p_presentaciones < 0 then
        raise exception 'No se pueden contar bultos en negativo.' using errcode = '22023';
      end if;
      if p_presentaciones <> trunc(p_presentaciones) then
        raise exception 'Los bultos se cuentan enteros: % no es un numero de bultos. Lo que sobra del ultimo va en lo suelto.',
          private.numero_es(p_presentaciones, 2) using errcode = '22023';
      end if;
    end if;

    v_total := private.en_unidad_base(p_articulo_id, p_presentaciones, coalesce(p_contado, 0), p_presentacion);

    if coalesce(p_presentaciones, 0) <> 0 then
      v_partes := v_partes || format('%s %s',
        private.numero_es(p_presentaciones, 0),
        private.presentacion_usada(p_articulo_id, p_presentacion));
    end if;
  end if;

  if v_total < 0 then
    raise exception 'Lo contado no puede ser negativo.' using errcode = '22023';
  end if;

  v_existencia := private.existencia_para_escribir(p_almacen_id, p_articulo_id);
  v_diferencia := v_total - v_existencia;

  if cardinality(v_partes) > 0 then
    v_conto := format('%s%s = %s %s',
      array_to_string(v_partes, ' y '),
      case when coalesce(p_contado, 0) <> 0
           then format(' y %s %s', private.numero_es(p_contado, 4), v_art.unidad)
           else '' end,
      private.numero_es(v_total, 4), v_art.unidad);
  else
    v_conto := format('%s %s', private.numero_es(v_total, 4), v_art.unidad);
  end if;

  /*
    EL ASIENTO, SOLO SI HAY DESCUADRE. Antes esto era un `raise` —«no hay nada
    que ajustar»— y con eso un conteo que cuadraba no se podia anotar, que es
    justo el que sirve para fijar que lo que hay es un tambor.
  */
  if abs(v_diferencia) >= 0.0001 then
    v_costo := private.costo_promedio(p_almacen_id, p_articulo_id);

    v_mov := private.registrar_movimiento(
      case when v_diferencia > 0 then 'AJUSTE_POSITIVO' else 'AJUSTE_NEGATIVO' end,
      case when v_diferencia > 0 then 1 else -1 end::smallint,
      p_almacen_id, p_articulo_id, abs(v_diferencia), v_costo,
      format('Conteo físico: %s contra %s %s en sistema. %s',
             v_conto, private.numero_es(v_existencia, 4), v_art.unidad, p_motivo),
      null, null, null, p_fecha,
      p_cantidad_capturada => nullif(coalesce(p_presentaciones, 0), 0),
      p_unidad_capturada   => case when coalesce(p_presentaciones, 0) <> 0
                                   then private.presentacion_usada(p_articulo_id, p_presentacion) end,
      p_suelto_capturado   => case when coalesce(p_presentaciones, 0) <> 0
                                    and coalesce(p_contado, 0) <> 0
                                   then p_contado end);
  end if;

  insert into public.conteos (
    almacen_id, articulo_id, fecha, contado, existencia_antes,
    movimiento_id, corte_movimiento, corte_reenvase, motivo, registrado_por)
  values (
    p_almacen_id, p_articulo_id, coalesce(p_fecha, private.hoy_aqui()),
    v_total, v_existencia, v_mov, coalesce(v_mov, v_corte), v_corte_re, p_motivo, auth.uid())
  returning id into v_conteo;

  if p_envases is not null then
    insert into public.conteo_envases (conteo_id, presentacion, cantidad)
    select v_conteo, upper(btrim(e ->> 'presentacion')), (e ->> 'cantidad')::numeric
      from jsonb_array_elements(p_envases) e
     where coalesce(btrim(e ->> 'presentacion'), '') <> ''
       and coalesce((e ->> 'cantidad')::numeric, 0) > 0
    on conflict (conteo_id, presentacion) do update
      set cantidad = public.conteo_envases.cantidad + excluded.cantidad;
  elsif coalesce(p_presentaciones, 0) > 0 then
    insert into public.conteo_envases (conteo_id, presentacion, cantidad)
    values (v_conteo, private.presentacion_usada(p_articulo_id, p_presentacion), p_presentaciones)
    on conflict do nothing;
  end if;

  return v_mov;
end;
$function$;

-- public.transferir_existencia(p_origen_id bigint, p_destino_id bigint, p_articulo_id bigint, p_cantidad numeric, p_motivo text, p_fecha date, p_presentaciones numeric, p_presentacion text, p_suelto numeric)
-- venia de: 20260909190000_un_traslado_tambien_se_cuenta_en_tambores.sql
CREATE OR REPLACE FUNCTION public.transferir_existencia(p_origen_id bigint, p_destino_id bigint, p_articulo_id bigint, p_cantidad numeric, p_motivo text, p_fecha date DEFAULT NULL::date, p_presentaciones numeric DEFAULT NULL::numeric, p_presentacion text DEFAULT NULL::text, p_suelto numeric DEFAULT NULL::numeric)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_origen public.almacenes; v_destino public.almacenes;
  v_existencia numeric; v_costo numeric; v_articulo text; v_salida bigint;
  v_cantidad numeric; v_nombre_pres text;
begin
  perform private.exigir_rol('ALMACEN');

  if p_origen_id = p_destino_id then
    raise exception 'El origen y el destino son el mismo almacén.' using errcode = '22023';
  end if;

  select * into v_origen  from public.almacenes where id = p_origen_id;
  select * into v_destino from public.almacenes where id = p_destino_id;

  if v_origen.id is null then
    raise exception 'No existe el almacén de origen %.', p_origen_id using errcode = 'P0002';
  end if;
  if v_destino.id is null then
    raise exception 'No existe el almacén de destino %.', p_destino_id using errcode = 'P0002';
  end if;

  if not v_destino.activo then
    raise exception 'El almacén "%" está inactivo y no puede recibir material.', v_destino.nombre
      using errcode = '22023';
  end if;

  /*
    LA CUENTA LA HACE LA BASE, no el navegador.

    `en_unidad_base` es el mismo ayudante que usan la entrada y la salida, así
    que «2 tambores y 10 L» significa lo mismo en las tres puertas. Si se manda
    presentación, manda ella; si no, se toma la cifra pelada de siempre, que es
    lo que sigue enviando quien mueve algo que no tiene envases declarados.
  */
  if nullif(btrim(coalesce(p_presentacion, '')), '') is not null
     and coalesce(p_presentaciones, 0) > 0 then
    /*
      QUIEN VALIDA ES `en_unidad_base`, Y ESTO LO ENSEÑÓ LA PRUEBA DE HUMO.

      La primera versión de esta puerta preguntaba antes por
      `private.presentacion_usada`, y estaba mal: ese ayudante NO valida, RESUELVE
      — si la presentación pedida no está declarada, se cae a la del artículo—.
      Con eso, pedir «1 garrafa» de un aceite que se cuenta en pailas movía una
      paila y no decía nada. Una sustitución silenciosa en una puerta de
      inventario es peor que un error: el asiento queda bien formado y mintiendo.

      `en_unidad_base` sí rechaza —«no se cuenta en GARRAFA, esa presentación no
      está declarada o está apagada»— y además es el mismo ayudante que usan la
      entrada y la salida, así que las tres puertas aceptan y rechazan lo mismo.
      El nombre canónico se toma después, cuando la conversión ya dijo que sí.
    */
    v_cantidad := private.en_unidad_base(
                    p_articulo_id, p_presentaciones, coalesce(p_suelto, 0), p_presentacion);
    v_nombre_pres := upper(btrim(p_presentacion));
  else
    v_cantidad := p_cantidad;
  end if;

  if coalesce(v_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se mueve. Un traslado sin motivo no se puede auditar.'
      using errcode = '22023';
  end if;

  /*
    LA REJA DEL TANQUE SIN COSTO, QUE AQUI FALTABA.

    El material sale al `costo_promedio` de su origen. En un almacen marcado
    `admite_sin_costo` ese promedio es cero por diseno, asi que un traslado
    desde ahi mete ceros en el destino y le hunde el promedio — justo lo que
    `registrar_entrada` impide por la otra puerta. Lo encontro el carril de
    base de datos el 7/09/2026; yo di esta reja por cerrada el 31/08 y lo
    estaba solo en la puerta que mire.
  */
  if coalesce(v_origen.admite_sin_costo, false)
     and not coalesce(v_destino.admite_sin_costo, false) then
    raise exception 'De "%" no se puede trasladar a "%": lo que hay ahí entró sin costo y hundiría el costo promedio del destino.',
      v_origen.nombre, v_destino.nombre
      using errcode = '22023',
            hint = 'Antes hay que decidir a qué precio se valora lo que trasladó la otra empresa. Mientras no se decida, el traslado escribiría un cero que después no se puede distinguir de un precio real.';
  end if;

  if not coalesce(v_origen.admite_sin_costo, false)
     and coalesce(v_destino.admite_sin_costo, false) then
    raise exception 'A "%" solo entra lo que no costó nada, y lo que sale de "%" tiene precio.',
      v_destino.nombre, v_origen.nombre
      using errcode = '22023',
            hint = 'Ese almacén lleva aparte lo que no le costó nada a esta empresa. Metiendo ahí material con precio se pierde su valor y el nombre del tanque deja de ser verdad.';
  end if;

  /*
    LO DE UN DUENO NO SE MEZCLA CON LO DE OTRO. Mover una silla de la
    gobernacion a un almacen nuestro no es un traslado: es cambiar de dueno, y
    eso no lo decide quien esta moviendo una silla.
  */
  if v_origen.propietario is distinct from v_destino.propietario then
    raise exception 'De "%" no se puede trasladar a "%": lo de un dueno no se mezcla con lo de otro.',
      v_origen.nombre, v_destino.nombre
      using errcode = '22023',
            hint = 'Si de verdad cambio de dueno, eso se anota como una salida y una entrada, no como un traslado: hace falta decir por que dejo de ser de uno y paso a ser del otro.';
  end if;

  v_existencia := private.existencia_para_escribir(p_origen_id, p_articulo_id);

  if v_cantidad > v_existencia then
    select nombre into v_articulo from public.articulos where id = p_articulo_id;
    raise exception 'En "%" solo hay % de "%" y se intentan mover %.',
      v_origen.nombre, private.numero_es(v_existencia, 4),
      coalesce(v_articulo, p_articulo_id::text), private.numero_es(v_cantidad, 4)
      using errcode = '22023';
  end if;

  v_costo := private.costo_promedio(p_origen_id, p_articulo_id);

  /*
    LAS DOS PATAS LLEVAN LA MISMA MARCA: son los mismos tambores subiendo y
    bajando de la misma camioneta. Con una sola marcada, la mitad de la
    operación quedaría sin explicar.
  */
  v_salida := private.registrar_movimiento(
    p_tipo => 'TRANSFERENCIA_SALIDA', p_signo => (-1)::smallint,
    p_almacen => p_origen_id, p_articulo => p_articulo_id,
    p_cantidad => v_cantidad, p_costo_usd => v_costo,
    p_nota => format('Traslado a %s. %s', v_destino.nombre, p_motivo),
    p_fecha => p_fecha,
    p_cantidad_capturada => case when v_nombre_pres is not null then p_presentaciones end,
    p_unidad_capturada   => v_nombre_pres,
    p_suelto_capturado   => case when v_nombre_pres is not null then nullif(p_suelto, 0) end);

  perform private.registrar_movimiento(
    p_tipo => 'TRANSFERENCIA_ENTRADA', p_signo => (1)::smallint,
    p_almacen => p_destino_id, p_articulo => p_articulo_id,
    p_cantidad => v_cantidad, p_costo_usd => v_costo,
    p_nota => format('Traslado desde %s. %s', v_origen.nombre, p_motivo),
    p_origen => v_salida, p_fecha => p_fecha,
    p_cantidad_capturada => case when v_nombre_pres is not null then p_presentaciones end,
    p_unidad_capturada   => v_nombre_pres,
    p_suelto_capturado   => case when v_nombre_pres is not null then nullif(p_suelto, 0) end);

  return v_salida;
end;
$function$;
