/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  8 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
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
  viva —no normalizado, no perdonando comentarios— y los 8 coinciden. Y el
  detector, que antes marcaba estas 8, pasa a cero.

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

-- public.acciones_restringibles()
-- venia de: 20260916190000_permisos_restringidos_y_aprobar_por_casilla.sql
CREATE OR REPLACE FUNCTION public.acciones_restringibles()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select a.codigo
    from public.acciones a
    join public.modulos m on m.codigo = a.modulo
   where a.activa
     and a.codigo in (select private.acciones_que_la_base_pregunta())
     and private.restriccion_que_no_cierra(a.codigo) is null
   order by m.orden, a.orden;
$function$;

-- public.asignar_chofer(p_vehiculo_id bigint, p_empleado_id bigint, p_nombre text, p_cedula text, p_desde date, p_motivo text, p_nota text)
-- venia de: 20260916105706_los_cuerpos_que_de_verdad_corren_con_los_camiones.sql
CREATE OR REPLACE FUNCTION public.asignar_chofer(p_vehiculo_id bigint, p_empleado_id bigint DEFAULT NULL::bigint, p_nombre text DEFAULT NULL::text, p_cedula text DEFAULT NULL::text, p_desde date DEFAULT NULL::date, p_motivo text DEFAULT NULL::text, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_desde  date := coalesce(p_desde, current_date);
  v_actual record;
  v_veh    record;
  v_emp    record;
  v_id     bigint;
begin
  -- La restricción antes que el nivel: con Maquinaria o Despachos en
  -- escritura la casilla ni se miraba, y restringirla no quitaba nada.
  if private.accion_restringida('DESPACHOS.ASIGNAR_CHOFER') then
    raise exception 'No puedes asignar ni terminar choferes: se te restringió.' using errcode = '42501';
  end if;

  if not (private.tiene_permiso('MAQUINARIA', 'ESCRITURA')
          or private.tiene_permiso('DESPACHOS', 'ESCRITURA')
          or private.puede_accion('DESPACHOS.ASIGNAR_CHOFER')) then
    perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
  end if;

  select * into v_veh from public.vehiculos where id = p_vehiculo_id for update;
  if v_veh.id is null then
    raise exception 'No existe el vehículo %.', p_vehiculo_id using errcode = 'P0002';
  end if;

  if p_empleado_id is null and length(btrim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'Hay que decir quién lo va a manejar.' using errcode = '23514';
  end if;

  if p_empleado_id is not null then
    select * into v_emp from public.empleados where id = p_empleado_id;
    if v_emp.id is null then
      raise exception 'No existe el empleado %.', p_empleado_id using errcode = '23503';
    end if;
    if not v_emp.activo then
      raise exception 'El empleado % ya no está activo.', v_emp.nombres using errcode = '55000';
    end if;
  end if;

  if v_desde > current_date then
    raise exception 'No se asigna un chofer con fecha futura.' using errcode = '22023';
  end if;

  -- El traspaso cierra el período anterior el día antes de empezar el nuevo.
  -- Si se cerrara el mismo día, dos choferes figurarían manejando a la vez.
  select * into v_actual
    from public.vehiculo_choferes
   where vehiculo_id = p_vehiculo_id and hasta is null
   for update;

  if v_actual.id is not null then
    if v_desde <= v_actual.desde then
      raise exception 'El chofer anterior empezó el %; el traspaso tiene que ser posterior.',
        to_char(v_actual.desde, 'DD/MM/YYYY') using errcode = '22023';
    end if;

    update public.vehiculo_choferes
       set hasta = v_desde - 1,
           motivo = coalesce(motivo, p_motivo)
     where id = v_actual.id;
  end if;

  insert into public.vehiculo_choferes
    (vehiculo_id, empleado_id, nombre, cedula, desde, motivo, nota, creada_por)
  values
    (p_vehiculo_id, p_empleado_id,
     case when p_empleado_id is null then btrim(p_nombre) end,
     nullif(btrim(coalesce(p_cedula, '')), ''),
     v_desde, nullif(btrim(coalesce(p_motivo, '')), ''),
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$function$;

-- public.cargar_articulos_por_lote(p_filas jsonb, p_confirmar boolean)
-- venia de: 20260916161000_los_cuerpos_que_de_verdad_corren_con_la_condicion_de_venta.sql
CREATE OR REPLACE FUNCTION public.cargar_articulos_por_lote(p_filas jsonb, p_confirmar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reparable boolean;
  v_fila         jsonb;
  v_n            int := 0;
  v_informe      jsonb := '[]'::jsonb;
  v_errores      int := 0;
  v_nuevos       int := 0;
  v_actualizados int := 0;
  v_hay_precio   boolean := false;

  v_codigo    text;
  v_nombre    text;
  v_categoria text;
  v_cat_txt   text;
  v_unidad    text;
  v_modo      text;
  v_inv       boolean;
  v_minimo    numeric;
  v_densidad  numeric;
  v_precio    numeric;
  v_precio_min numeric;
  v_moneda    text;

  -- Lo que trae la existencia, cuando la trae.
  v_almacen_txt text;
  v_almacen_id  bigint;
  v_cantidad    numeric;
  v_costo       numeric;
  v_sin_val     boolean;
  v_dueno_txt   text;
  v_con_stock   int := 0;

  /*
    Los renglones se juntan por almacén y se meten al final, no fila por fila.

    Una llamada por renglón tomaría el cerrojo del almacén una vez por artículo
    —cien artículos, cien esperas— y dejaría cien movimientos sueltos donde lo
    que hubo fue una sola carga inicial. Agrupados, queda un movimiento por
    almacén, que es lo que de verdad pasó y lo que alguien va a querer leer
    dentro de un año.
  */
  v_por_almacen jsonb := '{}'::jsonb;
  v_clave       text;

  v_motivo    text;
  v_estado    text;
  v_id        bigint;
  v_vistos    text[] := array[]::text[];
  v_nucleo    text;
  v_aviso     text;
  v_rev             jsonb;
  v_aviso_costo     text;
  v_avisos_de_costo int := 0;
  -- La casilla del problema, cuando se sabe: la pantalla abre la fila ahí.
  v_campo           text;
  -- El código tal como vino, antes de buscarlo por el nombre.
  v_codigo_tecleado text;
  -- Qué fila del archivo trajo ya cada nombre, para decirlo con su número.
  v_nombres_vistos  jsonb := '{}'::jsonb;
  v_otro_codigo     text;
  v_parecido        text;
  v_avisos_parecido int := 0;
  v_tipo_almacen    text;
  v_sin_costo_alm   boolean;
  v_ex_id           bigint;
  v_ex_unidad       text;
begin
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');

  if jsonb_typeof(p_filas) <> 'array' then
    raise exception 'La planilla no trae filas.' using errcode = '22023';
  end if;

  select exists (
    select 1 from jsonb_array_elements(p_filas) f
    where nullif(btrim(coalesce(f->>'precio', '')), '') is not null
  ) into v_hay_precio;

  if v_hay_precio then
    perform private.exigir_permiso('VENTAS', 'TOTAL');
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_n := v_n + 1;
    v_motivo := null;
    v_campo := null;
    v_parecido := null;
    v_aviso  := null;
    v_estado := null;
    v_almacen_id := null;
    v_cantidad := null;
    v_costo := null;
    v_sin_val := false;
    v_dueno_txt := null;

    v_codigo    := upper(btrim(coalesce(v_fila->>'codigo', '')));
    v_nombre    := btrim(coalesce(v_fila->>'nombre', ''));
    /*
      SE ESCRIBE EL NOMBRE, SE GUARDA EL CODIGO.

      La planilla ofrece «Equipo de oficina y computo» porque es lo que dice la
      pantalla; la tabla guarda EQUIPO. Aqui se traduce, admitiendo tambien el
      codigo para que una planilla bajada antes de hoy siga entrando.

      Sin tildes en los dos lados: el desplegable las pone y quien teclea a mano
      casi nunca, y rechazar una fila por un acento seria el peor de los motivos.

      Si no se reconoce, se queda el texto tal cual y la reja de abajo lo nombra
      con las palabras que la persona escribio.
    */
    v_cat_txt := upper(btrim(coalesce(v_fila->>'categoria', '')));
    v_categoria := coalesce(
      (select c.codigo from public.categorias_de_articulo() c
        where upper(c.codigo) = v_cat_txt
           or translate(upper(c.etiqueta), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')
              = translate(v_cat_txt, 'ÁÉÍÓÚÜÑ', 'AEIOUUN')
        limit 1),
      v_cat_txt);
    v_unidad    := upper(btrim(coalesce(v_fila->>'unidad', '')));
    v_modo      := upper(btrim(coalesce(nullif(btrim(coalesce(v_fila->>'modo_entrega','')), ''), 'CONSUMIBLE')));
    -- Vacía se queda vacía: rellenarla con dólares es lo que guardaba bolívares
    -- como si fueran dólares. Las rejas de la moneda van más abajo.
    v_moneda    := upper(btrim(coalesce(v_fila->>'moneda', '')));
    v_almacen_txt := btrim(coalesce(v_fila->>'almacen', ''));

    v_nucleo := private.nombre_nucleo(v_nombre);

    /*
      EL CODIGO YA NO SE EXIGE, Y ESA EXIGENCIA ES DE DONDE SALIO EL PROBLEMA.

      Once de los quince articulos del catalogo llevan el nombre metido en el
      campo del codigo —«ACEITE AGROFLUIDOS» es a la vez nombre y codigo—
      porque esta funcion pedia un codigo y quien lleno la planilla no tenia
      ninguno que escribir. Un codigo que es el nombre no distingue nada: el
      indice unico deja pasar el mismo articulo dos veces con una letra de
      diferencia.

      Sin codigo, la fila se resuelve por el nombre: si ya hay un articulo cuyo
      nombre se reduce al mismo nucleo, es ese y se actualiza. Si no, es nuevo y
      el codigo se lo pone `private.codigo_de_articulo` AL GUARDAR — no al
      revisar, porque revisar la planilla tres veces gastaria tres correlativos
      por fila y dejaria huecos en la serie.
    */
    v_codigo_tecleado := v_codigo;

    if v_codigo = '' and v_nombre <> '' then
      select a.codigo into v_codigo
        from public.articulos a
       where private.nombre_nucleo(a.nombre) = v_nucleo
       order by a.activo desc
       limit 1;
      v_codigo := coalesce(v_codigo, '');
    end if;

    if v_nombre = '' then
      v_motivo := 'Falta el nombre.';
      v_campo  := 'nombre';
    elsif v_categoria = '' then
      v_motivo := 'Falta la categoría.';
      v_campo  := 'categoria';
    elsif v_unidad = '' then
      v_motivo := 'Falta la unidad.';
      v_campo  := 'unidad';

    elsif coalesce(nullif(v_codigo, ''), 'NUCLEO:' || v_nucleo) = any(v_vistos) then
      v_motivo := case when v_codigo <> ''
        then format('El código %s se repite en la planilla.', v_codigo)
        else format('«%s» aparece dos veces en la planilla.', v_nombre) end;
      v_campo  := case when v_codigo_tecleado <> '' then 'codigo' else 'nombre' end;

    /*
      EL MISMO NOMBRE DOS VECES, AUNQUE LLEVEN CÓDIGOS DISTINTOS.

      La comprobación de arriba mira el código cuando lo hay, así que dos filas
      «ACEITE 15W40» con códigos distintos pasaban y acababan en dos fichas del
      mismo aceite. Se compara el núcleo del nombre, que conserva los números:
      DISCO DE CORTE 7 y DISCO DE CORTE 9 siguen siendo dos.
    */
    elsif v_nombres_vistos ? v_nucleo then
      v_motivo := format('«%s» ya viene en la fila %s de esta planilla. Si es el mismo artículo, deja una sola fila; si es otro, cámbiale el nombre para que se distinga.',
        v_nombre, v_nombres_vistos->>v_nucleo);
      v_campo  := 'nombre';

    /*
      UN CÓDIGO TECLEADO TIENE QUE EXISTIR.

      Christopher: validar el «intento de nuevos códigos». Un código que no está
      creaba un artículo con ese código, y así entraron los nombres metidos en el
      campo del código. Para uno nuevo el código va vacío y lo pone la base.
    */
    elsif v_codigo_tecleado <> ''
          and not exists (select 1 from public.articulos a
                           where a.codigo = v_codigo_tecleado or a.codigo_anterior = v_codigo_tecleado) then
      v_motivo := format('No hay ningún artículo con el código «%s». Si es un artículo nuevo, deja el código vacío: el sistema le pone uno con las letras de su categoría.',
        v_codigo_tecleado);
      v_campo  := 'codigo';

    -- El nombre ya es de otro artículo, y la fila trae el código de uno distinto.
    elsif v_codigo_tecleado <> ''
          and exists (select 1 from public.articulos a
                       where private.nombre_nucleo(a.nombre) = v_nucleo
                         and a.codigo <> v_codigo_tecleado
                         and coalesce(a.codigo_anterior, '') <> v_codigo_tecleado) then
      select a.codigo into v_otro_codigo
        from public.articulos a
       where private.nombre_nucleo(a.nombre) = v_nucleo
         and a.codigo <> v_codigo_tecleado
         and coalesce(a.codigo_anterior, '') <> v_codigo_tecleado
       order by a.activo desc
       limit 1;
      v_motivo := format('El nombre «%s» ya es del artículo %s. Si es ese, pon su código; si es otro distinto, cámbiale el nombre para que se distinga.',
        v_nombre, v_otro_codigo);
      v_campo  := 'nombre';

    /* La lista sale del CHECK de la tabla: ver `public.categorias_de_articulo`. */
    elsif not exists (select 1 from public.categorias_de_articulo() c
                       where c.codigo = v_categoria) then
      v_motivo := format('«%s» no es una categoría del sistema. Las que hay: %s.',
        v_cat_txt,
        (select string_agg(c.etiqueta, ', ' order by c.etiqueta)
           from public.categorias_de_articulo() c));

    elsif v_modo not in ('NO','RETORNABLE','CONSUMIBLE') then
      v_motivo := format('«%s» no dice qué pasa al entregarlo: NO, RETORNABLE o CONSUMIBLE.', v_modo);

    elsif not exists (select 1 from public.unidades where codigo = v_unidad) then
      v_motivo := format('La unidad «%s» no existe. Las que hay: %s.',
        v_unidad,
        (select string_agg(u.codigo, ', ' order by u.codigo) from public.unidades u));

    else
      begin
        v_minimo   := coalesce(nullif(btrim(coalesce(v_fila->>'stock_minimo','')), '')::numeric, 0);
        v_densidad := nullif(btrim(coalesce(v_fila->>'densidad_ton_m3','')), '')::numeric;
        v_precio   := nullif(btrim(coalesce(v_fila->>'precio','')), '')::numeric;
        v_precio_min := nullif(btrim(coalesce(v_fila->>'precio_minimo','')), '')::numeric;
        v_cantidad := nullif(btrim(coalesce(v_fila->>'cantidad','')), '')::numeric;
        v_costo    := nullif(btrim(coalesce(v_fila->>'costo','')), '')::numeric;
      exception when others then
        v_minimo := null;
        v_motivo := 'Hay un número que no se entiende. Se escriben sin separador de miles y con punto decimal.';
      end;

      v_inv := case lower(btrim(coalesce(v_fila->>'inventariable', '')))
                 when '' then true
                 when 'si' then true when 'sí' then true when 'true' then true when '1' then true
                 when 'no' then false when 'false' then false when '0' then false
                 else null end;

      /*
        LO DONADO ENTRA SIN CIFRA.

        Christopher: «tenemos que considerar que puede ser una donación de otra
        empresa o entidad o fuente, así que por ello no tiene una factura o
        costo».

        NO SE SABE NO ES CERO. Escribir cero diria que la laptop donada no vale
        nada, y ese cero se promedia con lo que ya hay y abarata cada salida
        futura del articulo, en silencio y para siempre. Marcando esta columna
        el renglon entra con el costo en nulo: el hueco se guarda como hueco,
        queda fuera del promedio por los dos lados, y se cuenta aparte para que
        una valoracion a medias no se lea como completa.

        Vacio es NO, que es lo que tiene que pasar: quien no sepa que existe
        esta columna sigue teniendo que escribir el costo.
      */
      -- Vacio significa «el del almacen», que es lo que resuelve la base.
      v_dueno_txt := nullif(upper(btrim(coalesce(v_fila->>'propietario', ''))), '');

      v_sin_val := case lower(btrim(coalesce(v_fila->>'sin_valorar', '')))
                 when 'si' then true when 'sí' then true when 'true' then true when '1' then true
                 else false end;

      if v_motivo is not null then
        null;
      elsif v_inv is null then
        v_motivo := 'La columna «inventariable» se responde SI o NO.';
      elsif v_minimo < 0 then
        v_motivo := 'El mínimo no puede ser negativo.';
      elsif v_densidad is not null and v_densidad <= 0 then
        v_motivo := 'La densidad, si se pone, es mayor que cero.';

      -- Lo que se mide en M3 o en TON lleva su densidad: la trae la fila, o ya
      -- la tiene el artículo que la fila actualiza.
      elsif v_unidad in ('M3', 'TON') and v_densidad is null
            and not exists (select 1 from public.articulos a
                             where v_codigo <> ''
                               and (a.codigo = v_codigo or a.codigo_anterior = v_codigo)
                               and a.densidad_ton_m3 is not null) then
        v_motivo := format('Lo que se mide en %s necesita su densidad, en toneladas por metro cúbico: sin ella no se puede expresar en %s.',
          case v_unidad when 'M3' then 'metros cúbicos' else 'toneladas' end,
          case v_unidad when 'M3' then 'toneladas' else 'metros cúbicos' end);
        v_campo := 'densidad_ton_m3';

      -- Y la que ya estaba no se pisa desde aquí: cambiarla pide motivo.
      elsif v_densidad is not null
            and exists (select 1 from public.articulos a
                         where v_codigo <> ''
                           and (a.codigo = v_codigo or a.codigo_anterior = v_codigo)
                           and a.densidad_ton_m3 is not null
                           and a.densidad_ton_m3 <> v_densidad) then
        v_motivo := format('Ese artículo ya tiene densidad %s t/m³. Cambiarla pide un motivo, y se hace desde el catálogo. Deja la celda vacía o con la misma.',
          (select rtrim(rtrim(private.numero_es(a.densidad_ton_m3, 4), '0'), ',') from public.articulos a
            where a.codigo = v_codigo or a.codigo_anterior = v_codigo limit 1));
        v_campo := 'densidad_ton_m3';
      elsif v_categoria = 'SERVICIO' and v_inv then
        v_motivo := 'Un servicio no se guarda en el almacén: «inventariable» tiene que ser NO.';
      elsif v_precio is not null and v_precio <= 0 then
        v_motivo := 'El precio tiene que ser mayor que cero.';
      elsif v_precio is null and v_precio_min is not null then
        v_motivo := 'Hay precio mínimo sin precio.';
      elsif v_precio_min is not null and v_precio_min > v_precio then
        v_motivo := 'El precio mínimo no puede pasar del precio.';
      elsif v_precio is not null and v_moneda = '' then
        v_motivo := 'Trae precio pero no dice en qué moneda. Elige la moneda: el sistema ya no supone dólares.';
        v_campo  := 'moneda';
      elsif v_precio is not null
            and not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
        v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
        v_campo  := 'moneda';
      end if;

      /*
        LA EXISTENCIA. Las tres van juntas o no va ninguna.

        Media fila —un almacén sin cantidad, una cantidad sin costo— casi
        siempre es una celda que se quedó sin llenar, y adivinar el resto es
        meter existencia que nadie pidió. Se avisa y se para.
      */
      if v_motivo is null and (v_almacen_txt <> '' or v_cantidad is not null or v_costo is not null or v_sin_val) then
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
          v_motivo := 'El costo por unidad tiene que ser mayor que cero.';
        elsif not v_sin_val and v_moneda = '' then
          v_motivo := 'Trae costo pero no dice en qué moneda. Elige la de la factura: el sistema ya no supone dólares.';
          v_campo  := 'moneda';
        elsif v_moneda <> ''
              and not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
          v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
          v_campo  := 'moneda';
        else
          -- Por código o por nombre: quien llena la planilla escribe lo que ve
          -- en la pantalla de almacenes, y ahí se lee el nombre.
          select a.id into v_almacen_id
            from public.almacenes a
           where a.activo
             and (upper(a.codigo) = upper(v_almacen_txt) or upper(a.nombre) = upper(v_almacen_txt));

          if v_almacen_id is null then
            -- La lista, solo con los sitios donde de verdad se puede cargar.
            v_motivo := format('El almacén «%s» no existe o está inactivo. Los que hay: %s.',
              v_almacen_txt,
              (select string_agg(a.codigo || ' · ' || a.nombre, ', ' order by a.nombre)
                 from public.almacenes a
                where a.activo and a.tipo not in ('PATIO_MAQUINAS', 'TRANSITO')
                  and not coalesce(a.admite_sin_costo, false)));
            v_campo := 'almacen';
          else
            /*
              LO QUE LA ENTRADA RECHAZARÍA, SE RECHAZA AQUÍ.

              Sin esto la revisión decía «todo correcto» y la confirmación tumbaba
              el lote entero al llegar a la entrada del almacén.
            */
            select a.tipo, coalesce(a.admite_sin_costo, false)
              into v_tipo_almacen, v_sin_costo_alm
              from public.almacenes a where a.id = v_almacen_id;

            if v_tipo_almacen in ('PATIO_MAQUINAS', 'TRANSITO') then
              v_motivo := format('En «%s» no se carga material: %s.', v_almacen_txt,
                case when v_tipo_almacen = 'TRANSITO'
                     then 'es donde espera lo que va de un sitio a otro, y solo lo mueven los traslados'
                     else 'es un patio de máquinas' end);
              v_campo := 'almacen';
              v_almacen_id := null;
            elsif v_sin_costo_alm then
              v_motivo := format('«%s» lleva aparte lo que no le costó nada a la empresa y no se carga por planilla. Elige otro almacén.', v_almacen_txt);
              v_campo := 'almacen';
              v_almacen_id := null;
            elsif not v_sin_val then
              begin
                perform private.tasas_del_dia(v_moneda, current_date);
              exception when sqlstate 'P0002' then
                v_motivo := format('No hay tasa de %s para hoy, así que no se puede saber cuánto costó en dólares. Regístrala en Tasas de cambio o usa otra moneda.', v_moneda);
                v_campo := 'moneda';
                v_almacen_id := null;
              end;
            end if;
          end if;
        end if;
      end if;
    end if;

    /*
      CAMBIAR LA UNIDAD DE LO QUE YA SE MOVIÓ.

      Cien movimientos en UND pasan a leerse en KG si la planilla le cambia la
      unidad al artículo, y ningún número del libro vuelve a significar lo que
      significaba. Si de verdad cambió, se decide en el catálogo, uno a uno.
    */
    if v_motivo is null and v_codigo <> '' then
      v_ex_id := null;
      select a.id, a.unidad into v_ex_id, v_ex_unidad
        from public.articulos a
       where a.codigo = v_codigo or a.codigo_anterior = v_codigo
       limit 1;
      if v_ex_id is not null and v_ex_unidad <> v_unidad
         and exists (select 1 from public.inventario_movimientos m where m.articulo_id = v_ex_id) then
        v_motivo := format('%s ya tiene movimientos en %s: cambiarle la unidad a %s cambiaría lo que significan sus cantidades. Deja %s, o cámbiala desde el catálogo si de verdad cambió.',
          v_codigo, v_ex_unidad, v_unidad, v_ex_unidad);
        v_campo := 'unidad';
      end if;
    end if;

    /*
      LA CASILLA DE LOS DEMÁS PROBLEMAS, DEDUCIDA DEL MENSAJE.

      Los mensajes viven en esta misma función, así que leerlos aquí no depende
      de nadie de fuera. Escribirle la casilla a cada uno por separado habría
      sido tocar veinte sitios de un cuerpo de veinte mil letras para decir lo
      mismo. El que no se reconoce se queda sin casilla: la pantalla enseña la
      fila entera.
    */
    if v_motivo is not null and v_campo is null then
      v_campo := case
        when v_motivo like '%no es una categoría%'           then 'categoria'
        when v_motivo like '%qué pasa al entregarlo%'         then 'modo_entrega'
        when v_motivo like 'La unidad %'                      then 'unidad'
        when v_motivo like '%«inventariable»%'                then 'inventariable'
        when v_motivo like 'Un servicio no se guarda%'        then 'inventariable'
        when v_motivo like 'El mínimo%'                       then 'stock_minimo'
        when v_motivo like 'La densidad%'                     then 'densidad_ton_m3'
        when v_motivo like 'Hay precio mínimo sin precio%'    then 'precio'
        when v_motivo like 'El precio mínimo%'                then 'precio_minimo'
        when v_motivo like 'El precio tiene%'                 then 'precio'
        when v_motivo like 'Esto no se inventaría%'           then 'inventariable'
        when v_motivo like '%falta el almacén%'               then 'almacen'
        when v_motivo like 'Hay almacén pero falta la cantidad%' then 'cantidad'
        when v_motivo like '%no es un dueño registrado%'      then 'propietario'
        when v_motivo like 'Está marcado «sin_valorar»%'      then 'costo'
        when v_motivo like 'Hay cantidad pero falta el costo%' then 'costo'
        when v_motivo like 'La cantidad que entra%'           then 'cantidad'
        when v_motivo like 'El costo por unidad%'             then 'costo'
      end;
    end if;

    if v_motivo is not null then
      v_errores := v_errores + 1;
      v_estado  := 'ERROR';
    else
      v_vistos := v_vistos || coalesce(nullif(v_codigo, ''), 'NUCLEO:' || v_nucleo);
      v_nombres_vistos := v_nombres_vistos || jsonb_build_object(v_nucleo, v_n);
      /*
        Tambien por el codigo viejo: una planilla anterior a la renumeracion
        trae «ACEITE AGROFLUIDOS» donde hoy pone LUB-0001, y sin esto la fila
        entraria como un articulo nuevo con el nombre otra vez en el codigo.
      */
      select id into v_id from public.articulos
       where codigo = v_codigo or codigo_anterior = v_codigo;

      if v_id is null then
        v_estado := 'NUEVO';
        v_nuevos := v_nuevos + 1;

        /*
          SE PARECE A UNO QUE YA ESTA, PERO NO ES EL MISMO.

          Avisa y deja pasar. Una planilla trae DISCO DE CORTE 7 y DISCO DE
          CORTE 9 el mismo dia, y pararla obligaria a partirla en dos. Lo que
          hace falta es que quien la revisa lo VEA antes de confirmar — el
          informe sale en pantalla justamente para eso.
        */
        select format('Se parece a «%s» (%s), que ya está.', a.nombre, a.codigo), a.codigo
          into v_aviso, v_parecido
          from public.articulos a
         where extensions.similarity(private.nombre_comparable(a.nombre),
                                     private.nombre_comparable(v_nombre)) >= 0.55
         order by extensions.similarity(private.nombre_comparable(a.nombre),
                                        private.nombre_comparable(v_nombre)) desc
         limit 1;

        if v_parecido is not null then
          v_avisos_parecido := v_avisos_parecido + 1;
        end if;
      else
        v_estado := 'ACTUALIZA';
        v_actualizados := v_actualizados + 1;

        -- Una fila sin código que ya estaba en el catálogo, o que cambia de
        -- categoría: no para, pero se dice.
        select nullif(concat_ws(' · ',
                 case when v_codigo_tecleado = ''
                      then format('Ya está en el catálogo como %s: se actualiza ese en vez de crear otro.', a.codigo) end,
                 case when a.categoria <> v_categoria
                      then format('Cambia de categoría: de %s a %s.', a.categoria, v_categoria) end), '')
          into v_aviso
          from public.articulos a where a.id = v_id;
      end if;

      if v_almacen_id is not null then
        v_con_stock := v_con_stock + 1;
      end if;

      if p_confirmar then
        if v_id is null then
          -- Vacia se deduce de la categoria, la misma regla que crear_articulo:
          -- una herramienta y un repuesto vuelven arreglados del taller, un
          -- lubricante o un producto se gastan.
          v_reparable := case lower(btrim(coalesce(v_fila->>'reparable', '')))
                           when 'si' then true when 'sí' then true
                           when '1' then true  when 'true' then true
                           when 'no' then false when '0' then false
                           when 'false' then false
                           else null end;

          insert into public.articulos
            (codigo, nombre, descripcion, categoria, unidad, inventariable,
             stock_minimo, densidad_ton_m3, modo_entrega, reparable, creado_por)
          values
            (coalesce(nullif(v_codigo, ''), private.codigo_de_articulo(v_categoria)),
             v_nombre, nullif(btrim(coalesce(v_fila->>'descripcion','')), ''),
             v_categoria, v_unidad, v_inv, v_minimo, v_densidad, v_modo,
             coalesce(v_reparable, v_categoria in ('HERRAMIENTA', 'REPUESTO')),
             (select auth.uid()))
          returning id into v_id;
        else
          v_reparable := case lower(btrim(coalesce(v_fila->>'reparable', '')))
                           when 'si' then true when 'sí' then true
                           when '1' then true  when 'true' then true
                           when 'no' then false when '0' then false
                           when 'false' then false
                           else null end;

          update public.articulos
             set nombre = v_nombre,
                 reparable = coalesce(v_reparable, reparable),
                 descripcion = coalesce(nullif(btrim(coalesce(v_fila->>'descripcion','')), ''), descripcion),
                 categoria = v_categoria,
                 unidad = v_unidad,
                 -- Al corregir, la celda vacia significa «no lo toques». Con
                 -- el valor por defecto, una herramienta RETORNABLE a la que se
                 -- le corregia el nombre pasaba a CONSUMIBLE y dejaba de poder
                 -- prestarse.
                 inventariable = case
                   when nullif(btrim(coalesce(v_fila->>'inventariable','')), '') is null
                     then inventariable else v_inv end,
                 stock_minimo = case
                   when nullif(btrim(coalesce(v_fila->>'stock_minimo','')), '') is null
                     then stock_minimo else v_minimo end,
                 densidad_ton_m3 = coalesce(v_densidad, densidad_ton_m3),
                 modo_entrega = case
                   when nullif(btrim(coalesce(v_fila->>'modo_entrega','')), '') is null
                     then modo_entrega else v_modo end
           where id = v_id;
        end if;

        if v_precio is not null then
          -- El precio de la planilla es el de la unidad del artículo.
          insert into public.precios_venta
            (articulo_id, unidad, moneda, precio, precio_minimo, actualizado_por, actualizado_en)
          values
            (v_id, (select a.unidad from public.articulos a where a.id = v_id),
             v_moneda, v_precio, coalesce(v_precio_min, 0), (select auth.uid()), now())
          on conflict (articulo_id, unidad) do update
            set moneda = excluded.moneda,
                precio = excluded.precio,
                precio_minimo = excluded.precio_minimo,
                actualizado_por = excluded.actualizado_por,
                actualizado_en = excluded.actualizado_en;
        end if;

        -- El renglón se guarda para el final, agrupado por su almacén.
        if v_almacen_id is not null then
          v_clave := v_almacen_id::text;
          v_por_almacen := jsonb_set(
            v_por_almacen, array[v_clave],
            coalesce(v_por_almacen -> v_clave, '[]'::jsonb) ||
              jsonb_build_object('articulo_id', v_id, 'cantidad', v_cantidad,
                                 'costo', coalesce(v_costo, 0), 'moneda', v_moneda,
                                 'sin_valor', v_sin_val,
                                 'propietario', v_dueno_txt,
                                 /*
                                   La revision fila por fila de la pantalla ES la
                                   confirmacion. Sin esto, cualquier articulo
                                   nuevo con costo moria pidiendo una casilla que
                                   una planilla no tiene donde poner.
                                 */
                                 'confirmado', true));
        end if;
      end if;
    end if;

    /*
      EL COSTO RARO SE ENSEÑA EN LA REVISION, QUE ES LA CONFIRMACION.

      La planilla manda sus renglones con `confirmado: true` porque la revision
      fila por fila hace de confirmacion. Pero la revision no enseñaba los avisos
      de costo: un articulo nuevo podia entrar a un precio disparatado sin
      pregunta y sin marca, que es el escenario de los cinco aceites del 5/09 por
      la via de lote.

      Aqui se hace la misma pregunta que el formulario de entrada —la misma
      funcion, `revisar_costo_de_entrada`— y la respuesta va al aviso de la fila,
      que la pantalla ya pinta. Contesta QUE a todo el mundo y CUANTO solo a quien
      puede ver el dinero, porque es lo que devuelve esa funcion.

      Un articulo que la planilla crea no tiene promedio: es primera vez sin
      preguntar. Lo que entra sin valorar no se compara, porque no trae cifra.
    */
    if v_motivo is null and v_almacen_id is not null
       and not coalesce(v_sin_val, false) and coalesce(v_costo, 0) > 0 then
      v_rev := case when v_id is null
                    then jsonb_build_object('estado', 'PRIMERA')
                    else public.revisar_costo_de_entrada(v_almacen_id, v_id, v_costo, v_moneda, null)
               end;

      v_aviso_costo := case
        when v_rev->>'estado' in ('PRIMERA', 'SIN_ARTICULO') then
          format('Primera vez que entra a este almacén, a %s %s por %s: pasa a ser la referencia de todo lo que entre después. Compruébalo con la factura.',
                 private.numero_es(v_costo, 4), v_moneda, v_unidad)
        when v_rev->>'estado' = 'DESVIA' and v_rev->>'veces' is not null then
          format('Viene costando %s USD por %s y entra a %s USD: %s veces %s. Compruébalo con la factura.',
                 private.numero_es((v_rev->>'viene_costando')::numeric, 4), v_unidad,
                 private.numero_es((v_rev->>'entra_a')::numeric, 4),
                 private.numero_es((v_rev->>'veces')::numeric, 2),
                 case when v_rev->>'hacia' = 'ARRIBA' then 'más' else 'menos' end)
        when v_rev->>'estado' = 'DESVIA' then
          format('Ese costo se sale mucho, %s, de lo que el artículo viene costando. Compruébalo con la factura.',
                 case when v_rev->>'hacia' = 'ARRIBA' then 'hacia arriba' else 'hacia abajo' end)
      end;

      if v_aviso_costo is not null then
        v_avisos_de_costo := v_avisos_de_costo + 1;
        v_aviso := case when v_aviso is null then v_aviso_costo
                        else v_aviso || ' · ' || v_aviso_costo end;
      end if;
    end if;

    v_informe := v_informe || jsonb_build_object(
      'fila', v_n,
      'codigo', v_codigo,
      'nombre', v_nombre,
      'estado', v_estado,
      'motivo', v_motivo,
      'campo', v_campo,
      'parecido_codigo', v_parecido,
      'aviso', v_aviso);
  end loop;

  if v_n = 0 then
    raise exception 'La planilla está vacía.' using errcode = '22023';
  end if;

  if p_confirmar and v_errores > 0 then
    raise exception 'La planilla tiene % fila(s) con problemas. No se cargó nada.', v_errores
      using errcode = '22023';
  end if;

  /*
    Y ahora la existencia, una entrada por almacén.

    Va al final y no dentro del bucle porque los artículos nuevos tienen que
    existir antes de que se les meta nada. Si esto revienta —un almacén que se
    desactivó entre la revisión y el guardado— se cae la transacción entera y
    tampoco quedan los artículos, que es lo correcto: media carga es peor que
    ninguna.
  */
  if p_confirmar and v_por_almacen <> '{}'::jsonb then
    for v_clave in select jsonb_object_keys(v_por_almacen) loop
      perform public.registrar_entradas(
        v_clave::bigint,
        v_por_almacen -> v_clave,
        'Carga inicial por planilla',
        null,
        null);
    end loop;
  end if;

  return jsonb_build_object(
    'total', v_n,
    'nuevos', v_nuevos,
    'actualizados', v_actualizados,
    'con_existencia', v_con_stock,
    -- Cuantas filas traen un costo que hay que mirar antes de confirmar.
    'avisos_de_costo', v_avisos_de_costo,
    -- Cuantas filas nuevas se parecen a un articulo que ya esta.
    'avisos_de_parecido', v_avisos_parecido,
    'errores', v_errores,
    'aplicado', p_confirmar and v_errores = 0,
    'filas', v_informe);
end;
$function$;

-- public.crear_articulo(p_codigo text, p_nombre text, p_categoria text, p_unidad text, p_descripcion text, p_inventariable boolean, p_stock_minimo numeric, p_modo_entrega text, p_reparable boolean, p_presentacion text, p_unidades_por_presentacion numeric, p_marca text, p_numero_parte text, p_confirmado boolean, p_densidad_ton_m3 numeric)
-- venia de: 20260910140000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.crear_articulo(p_codigo text, p_nombre text, p_categoria text, p_unidad text, p_descripcion text DEFAULT NULL::text, p_inventariable boolean DEFAULT true, p_stock_minimo numeric DEFAULT 0, p_modo_entrega text DEFAULT NULL::text, p_reparable boolean DEFAULT NULL::boolean, p_presentacion text DEFAULT NULL::text, p_unidades_por_presentacion numeric DEFAULT NULL::numeric, p_marca text DEFAULT NULL::text, p_numero_parte text DEFAULT NULL::text, p_confirmado boolean DEFAULT false, p_densidad_ton_m3 numeric DEFAULT NULL::numeric)
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

  -- El rol no mira la casilla, y las presentaciones sí: sin esto, a quien se le
  -- restringía editar el catálogo solo se le cerraban las presentaciones.
  if private.accion_restringida('INVENTARIO.EDITAR_CATALOGO') then
    raise exception 'No puedes crear artículos: editar el catálogo se te restringió.' using errcode = '42501';
  end if;

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

  /*
    LO QUE SE MIDE EN M3 O EN TON NACE CON SU DENSIDAD. Sin ella no se puede
    expresar en la otra medida, y Christopher pidió que se exprese siempre.
    En lo demás no se guarda: preguntarle su densidad a un par de botas es ruido.
  */
  if p_densidad_ton_m3 is not null and p_densidad_ton_m3 <= 0 then
    raise exception 'La densidad, si se pone, es mayor que cero.' using errcode = '22023';
  end if;

  if p_unidad in ('M3', 'TON') and p_densidad_ton_m3 is null then
    raise exception 'Lo que se mide en % necesita su densidad, en toneladas por metro cúbico: sin ella no se puede expresar en %.',
      case p_unidad when 'M3' then 'metros cúbicos' else 'toneladas' end,
      case p_unidad when 'M3' then 'toneladas' else 'metros cúbicos' end
      using errcode = '22023';
  end if;

  insert into public.articulos
    (codigo, nombre, descripcion, categoria, unidad, inventariable, stock_minimo,
     modo_entrega, reparable, presentacion, unidades_por_presentacion,
     marca, numero_parte, creado_por, densidad_ton_m3)
  values
    (v_codigo, trim(p_nombre), nullif(trim(coalesce(p_descripcion, '')), ''),
     p_categoria, p_unidad,
     case when p_categoria = 'SERVICIO' then false else p_inventariable end,
     coalesce(p_stock_minimo, 0), v_modo, v_reparable,
     v_pres, p_unidades_por_presentacion,
     nullif(trim(coalesce(p_marca, '')), ''),
     nullif(trim(coalesce(p_numero_parte, '')), ''),
     (select auth.uid()),
     case when p_unidad in ('M3', 'TON') then p_densidad_ton_m3 end)
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

-- public.editar_articulo(p_id bigint, p_nombre text, p_categoria text, p_unidad text, p_descripcion text, p_inventariable boolean, p_stock_minimo numeric, p_modo_entrega text, p_reparable boolean, p_presentacion text, p_unidades_por_presentacion numeric, p_marca text, p_numero_parte text, p_confirmado boolean, p_densidad_ton_m3 numeric, p_motivo_densidad text)
-- venia de: 20260916081000_los_cuerpos_que_de_verdad_corren_con_la_solicitud.sql
CREATE OR REPLACE FUNCTION public.editar_articulo(p_id bigint, p_nombre text, p_categoria text, p_unidad text, p_descripcion text DEFAULT NULL::text, p_inventariable boolean DEFAULT true, p_stock_minimo numeric DEFAULT 0, p_modo_entrega text DEFAULT NULL::text, p_reparable boolean DEFAULT NULL::boolean, p_presentacion text DEFAULT NULL::text, p_unidades_por_presentacion numeric DEFAULT NULL::numeric, p_marca text DEFAULT NULL::text, p_numero_parte text DEFAULT NULL::text, p_confirmado boolean DEFAULT false, p_densidad_ton_m3 numeric DEFAULT NULL::numeric, p_motivo_densidad text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_existe boolean;
  v_densidad_antes numeric;
  v_densidad       numeric;
  -- Cambia una que ya estaba; ponerla por primera vez no es cambiarla.
  v_cambia         boolean := false;
  v_pone           boolean := false;
  v_pres   text := nullif(trim(coalesce(p_presentacion, '')), '');
  v_igual  record;
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');

  -- El rol no mira la casilla; ver `crear_articulo`.
  if private.accion_restringida('INVENTARIO.EDITAR_CATALOGO') then
    raise exception 'No puedes corregir artículos: editar el catálogo se te restringió.' using errcode = '42501';
  end if;

  select true into v_existe from public.articulos where id = p_id;

  if v_existe is null then
    raise exception 'No existe ese artículo.' using errcode = 'P0002';
  end if;

  if length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El artículo necesita un nombre.' using errcode = '22023';
  end if;

  /*
    EL MISMO CONTROL QUE AL CREAR, Y POR LA MISMA RAZON.

    Para si el nombre nuevo se reduce al mismo nucleo que el de OTRO articulo,
    salvo que venga confirmado. No impide: DISCO DE CORTE 7 y DISCO DE CORTE 9
    son dos cosas de verdad. Lo que no puede pasar es decidirlo sin enterarse.

    `a.id <> p_id` es lo que deja renombrarse a si mismo: corregir «Valvulina
    140» a «VALVULINA 140» no es crear un duplicado.
  */
  if not coalesce(p_confirmado, false) then
    select a.codigo, a.nombre, a.activo into v_igual
      from public.articulos a
     where a.id <> p_id
       and private.nombre_nucleo(a.nombre) = private.nombre_nucleo(p_nombre)
     order by a.activo desc
     limit 1;

    if v_igual.codigo is not null then
      raise exception 'Ya existe «%» con el código %.% Si de verdad es otra cosa, confírmalo.',
        v_igual.nombre, v_igual.codigo,
        case when v_igual.activo then '' else ' Está inactivo, pero sigue en el catálogo.' end
        using errcode = '22023',
              hint = 'Dos artículos casi iguales acaban con la existencia repartida entre los dos y ninguno cuadrando.';
    end if;
  end if;

  if v_pres is null and p_unidades_por_presentacion is not null then
    raise exception 'Dice cuántas unidades trae la presentación, pero no dice cuál es. Escribe la presentación o deja las dos vacías.'
      using errcode = '22023';
  end if;

  /*
    LA DENSIDAD: UNA POR MATERIAL, Y CAMBIARLA PIDE MOTIVO.

    Los papeles calculan la conversión al imprimirse con la densidad del
    catálogo, así que cambiarla cambia también lo que dice un papel viejo al
    reimprimirlo. Por eso no se cambia en silencio: se dice por qué, y queda
    quién y cuándo. Ponerla por primera vez no cambia nada dicho y no lo pide.
  */
  select densidad_ton_m3 into v_densidad_antes from public.articulos where id = p_id;

  if p_densidad_ton_m3 is not null and p_densidad_ton_m3 <= 0 then
    raise exception 'La densidad, si se pone, es mayor que cero.' using errcode = '22023';
  end if;

  v_densidad := coalesce(p_densidad_ton_m3, v_densidad_antes);

  if p_unidad in ('M3', 'TON') and v_densidad is null then
    raise exception 'Lo que se mide en % necesita su densidad, en toneladas por metro cúbico: sin ella no se puede expresar en %.',
      case p_unidad when 'M3' then 'metros cúbicos' else 'toneladas' end,
      case p_unidad when 'M3' then 'toneladas' else 'metros cúbicos' end
      using errcode = '22023';
  end if;

  v_cambia := v_densidad_antes is not null and p_densidad_ton_m3 is not null
              and p_densidad_ton_m3 <> v_densidad_antes;
  v_pone   := v_densidad_antes is null and p_densidad_ton_m3 is not null;

  if v_cambia and length(btrim(coalesce(p_motivo_densidad, ''))) < 10 then
    raise exception 'La densidad era % t/m³. Cambiarla cambia la conversión de todo lo que se imprima desde ahora, también de papeles viejos: escribe por qué, con al menos diez letras.',
      rtrim(rtrim(private.numero_es(v_densidad_antes, 4), '0'), ',')
      using errcode = '22023';
  end if;

  update public.articulos set
    nombre         = trim(p_nombre),
    descripcion    = nullif(trim(coalesce(p_descripcion, '')), ''),
    categoria      = p_categoria,
    unidad         = p_unidad,
    inventariable  = case when p_categoria = 'SERVICIO' then false else p_inventariable end,
    stock_minimo   = coalesce(p_stock_minimo, 0),
    -- Toneladas por metro cúbico. Lo que no se manda no se pisa: el formulario
    -- solo lo ofrece donde significa algo, y el resto de las pantallas ni lo
    -- mencionan.
    densidad_ton_m3 = v_densidad,
    densidad_motivo = case when v_cambia then btrim(p_motivo_densidad)
                           when v_pone then null
                           else densidad_motivo end,
    densidad_cambiada_por = case when v_cambia or v_pone then (select auth.uid())
                                 else densidad_cambiada_por end,
    densidad_cambiada_en  = case when v_cambia or v_pone then now()
                                 else densidad_cambiada_en end,
    modo_entrega   = coalesce(nullif(trim(coalesce(p_modo_entrega, '')), ''), modo_entrega),
    reparable      = coalesce(p_reparable, reparable),
    presentacion   = v_pres,
    unidades_por_presentacion = p_unidades_por_presentacion,
    marca          = nullif(trim(coalesce(p_marca, '')), ''),
    numero_parte   = nullif(trim(coalesce(p_numero_parte, '')), '')
  where id = p_id;
exception
  when foreign_key_violation then
    raise exception 'Esa presentación no está en la lista.' using errcode = '23503';
end;
$function$;

-- public.guardar_vehiculo(p_id bigint, p_placa text, p_tipo text, p_capacidad_m3 numeric, p_descripcion text, p_capacidad_ton numeric, p_propio boolean, p_transportista text, p_maquina_id bigint, p_activo boolean, p_nota text)
-- venia de: 20260916105706_los_cuerpos_que_de_verdad_corren_con_los_camiones.sql
CREATE OR REPLACE FUNCTION public.guardar_vehiculo(p_id bigint, p_placa text, p_tipo text, p_capacidad_m3 numeric, p_descripcion text DEFAULT NULL::text, p_capacidad_ton numeric DEFAULT NULL::numeric, p_propio boolean DEFAULT true, p_transportista text DEFAULT NULL::text, p_maquina_id bigint DEFAULT NULL::bigint, p_activo boolean DEFAULT true, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id bigint;
begin
  -- LOS CAMIONES LOS GOBIERNA MAQUINARIA: basta su escritura, además de lo
  -- que ya valía. Una autorización sobre la casilla también cuenta.
  -- La restricción antes que el nivel: con Maquinaria o Despachos en
  -- escritura la casilla ni se miraba, y restringirla no quitaba nada.
  if private.accion_restringida('DESPACHOS.EDITAR_VEHICULO') then
    raise exception 'No puedes guardar vehículos: se te restringió.' using errcode = '42501';
  end if;

  if not (private.tiene_permiso('MAQUINARIA', 'ESCRITURA')
          or private.tiene_permiso('DESPACHOS', 'ESCRITURA')
          or private.puede_accion('DESPACHOS.EDITAR_VEHICULO')) then
    perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
  end if;

  if p_tipo not in ('VOLTEO','CHUTO','GANDOLA','CAVA','CISTERNA','OTRO') then
    raise exception 'Tipo de vehículo no válido: %.', p_tipo using errcode = '22023';
  end if;
  if coalesce(p_capacidad_m3, 0) <= 0 then
    raise exception 'Hay que decir cuántos metros cúbicos carga: es para lo que sirve tenerlo cargado.'
      using errcode = '23514';
  end if;
  if not p_propio and length(btrim(coalesce(p_transportista, ''))) = 0 then
    raise exception 'Un vehículo que no es de la empresa tiene que decir de quién es.'
      using errcode = '23514';
  end if;
  if p_maquina_id is not null then
    if not p_propio then
      raise exception 'Solo un vehículo de la empresa puede tener ficha de mantenimiento.'
        using errcode = '22023';
    end if;
    perform 1 from public.maquinaria where id = p_maquina_id;
    if not found then
      raise exception 'No existe la máquina %.', p_maquina_id using errcode = '23503';
    end if;
  end if;

  if p_id is not null then
    -- De quién es, si es propio, cuánto le cabe y su ficha deciden a quién se
    -- paga cada viaje y cuántos metros admite: con Maquinaria a secas no.
    if not (private.tiene_permiso('DESPACHOS', 'ESCRITURA')
            or private.puede_accion('DESPACHOS.EDITAR_VEHICULO'))
       and exists (
         select 1 from public.vehiculos v
          where v.id = p_id
            and (v.propio is distinct from p_propio
                 or upper(btrim(coalesce(v.transportista, ''))) is distinct from
                      (case when p_propio then '' else upper(btrim(coalesce(p_transportista, ''))) end)
                 or v.capacidad_m3 is distinct from p_capacidad_m3
                 or v.maquina_id is distinct from
                      (case when p_propio then p_maquina_id else null end))) then
      raise exception 'Cambiar de quién es un camión, lo que le cabe o su ficha de mantenimiento pide la casilla «Dar de alta y corregir un vehículo».'
        using errcode = '42501',
              hint = 'Lo demás —placa, tipo, descripción, nota, en servicio— se corrige con Maquinaria.';
    end if;

    if exists (select 1 from public.vehiculos v
                where v.id = p_id and v.carga_util_m3 > p_capacidad_m3) then
      raise exception 'Este camión trae % m³ por viaje: lo que le cabe no puede quedar por debajo. Baja primero la carga útil.',
        (select v.carga_util_m3 from public.vehiculos v where v.id = p_id)
        using errcode = '22023';
    end if;
  end if;

  if p_id is null then
    insert into public.vehiculos
      (placa, tipo, descripcion, capacidad_m3, capacidad_ton, propio,
       transportista, maquina_id, activo, nota, creado_por)
    values
      (p_placa, p_tipo, nullif(btrim(coalesce(p_descripcion, '')), ''),
       p_capacidad_m3, p_capacidad_ton, p_propio,
       case when p_propio then null else btrim(p_transportista) end,
       case when p_propio then p_maquina_id else null end,
       p_activo, nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.vehiculos
       set placa = p_placa, tipo = p_tipo,
           descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
           capacidad_m3 = p_capacidad_m3, capacidad_ton = p_capacidad_ton,
           propio = p_propio,
           transportista = case when p_propio then null else btrim(p_transportista) end,
           maquina_id = case when p_propio then p_maquina_id else null end,
           activo = p_activo,
           nota = nullif(btrim(coalesce(p_nota, '')), '')
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe el vehículo %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya hay un vehículo con la placa %.',
      upper(regexp_replace(btrim(p_placa), '\s+', '', 'g')) using errcode = '23505';
end;
$function$;

-- public.restringir_accion(p_usuario_id uuid, p_accion text, p_motivo text, p_desde date, p_hasta date)
-- venia de: 20260916190000_permisos_restringidos_y_aprobar_por_casilla.sql
CREATE OR REPLACE FUNCTION public.restringir_accion(p_usuario_id uuid, p_accion text, p_motivo text, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_yo     uuid := (select auth.uid());
  v_desde  date := coalesce(p_desde, current_date);
  v_nombre text;
  v_accion public.acciones;
  v_id     bigint;
begin
  -- Los mismos que extienden: administración y la gerencia.
  perform private.exigir_rol('ADMIN', 'GERENTE_GENERAL');

  select * into v_accion from public.acciones where codigo = p_accion;

  if v_accion.codigo is null then
    raise exception 'No existe la acción «%».', p_accion using errcode = 'P0002';
  end if;

  if not v_accion.activa then
    raise exception 'La casilla «%» está apagada: no la tiene nadie.', v_accion.nombre
      using errcode = '55000';
  end if;

  /*
    Una restricción que no frena es peor que ninguna: quien la puso cree que está
    puesta. Si la base no pregunta por esta casilla, la decide el nivel del
    módulo en el rol, y ahí se quita cambiando el rol.
  */
  if not exists (select 1 from private.acciones_que_la_base_pregunta() as c where c = p_accion) then
    raise exception '«%» todavía la decide el nivel que el rol da en el módulo, no la casilla: restringirla no la frenaría. Para quitársela, cámbiale el rol.', v_accion.nombre
      using errcode = '55000';
  end if;

  if private.restriccion_que_no_cierra(p_accion) is not null then
    raise exception '%', private.restriccion_que_no_cierra(p_accion) using errcode = '55000';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe por qué se le restringe. Dentro de un mes es lo único que va a explicar por qué esta persona no pudo hacerlo.'
      using errcode = '22023';
  end if;

  select nombre into v_nombre from public.perfiles where id = p_usuario_id and activo;
  if v_nombre is null then
    raise exception 'No existe esa persona, o está desactivada.' using errcode = 'P0002';
  end if;

  if p_usuario_id = v_yo then
    raise exception 'No puedes restringirte permisos a ti mismo.' using errcode = '42501';
  end if;

  if exists (select 1 from public.usuarios_roles where usuario_id = p_usuario_id and rol = 'ADMIN') then
    raise exception '% es administrador del sistema, y al administrador no se le restringe nada. Si no debe poder «%», quítale ese rol.', v_nombre, v_accion.nombre
      using errcode = '42501';
  end if;

  if p_hasta is not null and p_hasta < v_desde then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio.' using errcode = '22023';
  end if;

  -- Lo extendido de esa misma casilla se retira en el mismo paso: restringir es
  -- la decisión más nueva, y dejar las dos vivas no diría cuál manda.
  update public.autorizaciones
     set revocada_en = now(), revocada_por = v_yo,
         revocada_motivo = 'Se le restringió: ' || btrim(p_motivo)
   where a_usuario = p_usuario_id and accion = p_accion and revocada_en is null;

  update public.restricciones
     set levantada_en = now(), levantada_por = v_yo,
         levantada_motivo = 'Sustituida por una nueva'
   where a_usuario = p_usuario_id and accion = p_accion and levantada_en is null;

  insert into public.restricciones (accion, a_usuario, por_usuario, desde, hasta, motivo)
  values (p_accion, p_usuario_id, v_yo, v_desde, p_hasta, btrim(p_motivo))
  returning id into v_id;

  return v_id;
end;
$function$;

-- public.terminar_chofer(p_id bigint, p_hasta date, p_motivo text)
-- venia de: 20260916105706_los_cuerpos_que_de_verdad_corren_con_los_camiones.sql
CREATE OR REPLACE FUNCTION public.terminar_chofer(p_id bigint, p_hasta date DEFAULT NULL::date, p_motivo text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fila  record;
  v_hasta date := coalesce(p_hasta, current_date);
begin
  -- La restricción antes que el nivel, como en `asignar_chofer`.
  if private.accion_restringida('DESPACHOS.ASIGNAR_CHOFER') then
    raise exception 'No puedes asignar ni terminar choferes: se te restringió.' using errcode = '42501';
  end if;

  if not (private.tiene_permiso('MAQUINARIA', 'ESCRITURA')
          or private.tiene_permiso('DESPACHOS', 'ESCRITURA')
          or private.puede_accion('DESPACHOS.ASIGNAR_CHOFER')) then
    perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
  end if;

  select * into v_fila from public.vehiculo_choferes where id = p_id for update;
  if v_fila.id is null then
    raise exception 'No existe esa asignación de chofer.' using errcode = 'P0002';
  end if;
  if v_fila.hasta is not null then
    raise exception 'Esa asignación ya está cerrada.' using errcode = '55000';
  end if;
  if v_hasta < v_fila.desde then
    raise exception 'No puede terminar antes de empezar.' using errcode = '22023';
  end if;

  update public.vehiculo_choferes
     set hasta = v_hasta,
         motivo = coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), motivo)
   where id = p_id;

  return p_id;
end;
$function$;
