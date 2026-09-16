/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  3 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
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
  viva —no normalizado, no perdonando comentarios— y los 3 coinciden. Y el
  detector, que antes marcaba estas 3, pasa a cero.

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

-- public.guardar_clase_de_salida(p_codigo text, p_nombre text, p_pista text, p_tipo text, p_causa_baja text, p_orden smallint, p_exige_detalle boolean, p_activa boolean)
-- venia de: 20260916171000_los_cuerpos_que_de_verdad_corren_sin_salida_directa.sql
CREATE OR REPLACE FUNCTION public.guardar_clase_de_salida(p_codigo text DEFAULT NULL::text, p_nombre text DEFAULT NULL::text, p_pista text DEFAULT NULL::text, p_tipo text DEFAULT 'SALIDA_CONSUMO'::text, p_causa_baja text DEFAULT NULL::text, p_orden smallint DEFAULT NULL::smallint, p_exige_detalle boolean DEFAULT false, p_activa boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_codigo text;
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');

  -- Las razones que daban el material por perdido se quitaron el 15/09/2026.
  if p_tipo = 'SALIDA_BAJA'
     or nullif(btrim(coalesce(p_causa_baja, '')), '') is not null
     or exists (select 1 from public.clases_de_salida c
                 where c.codigo = p_codigo and c.tipo = 'SALIDA_BAJA') then
    raise exception 'Esa razón ya no se puede usar.' using errcode = '22023';
  end if;

  if p_codigo = 'ENTREGA_POR_SOLICITUD' then
    raise exception 'Esa razón la pone el sistema al entregar una solicitud: no se edita.' using errcode = '22023';
  end if;

  /*
    UNA VENTA NO ES UNA RAZÓN DE SALIDA. Sale por Facturación, con cliente,
    precio y número, y una salida de almacén no sabe nada de eso. La razón VENTA
    se apagó una vez y se volvió a encender desde esta misma lista: por eso ya no
    se deja ni crear ni editar una que nombre una venta.
  */
  if private.nombra_una_venta(coalesce(p_codigo, '') || ' ' || v_nombre, true) then
    raise exception 'La razón dice «%», y una venta no es una razón de salida: se registra en Facturación › Notas de entrega, con cliente, precio y su número.',
      lower(private.palabra_de_venta(coalesce(p_codigo, '') || ' ' || v_nombre, true)) using errcode = '22023';
  end if;

  if length(v_nombre) < 3 then
    raise exception 'La clase necesita un nombre.' using errcode = '22023';
  end if;

  if p_codigo is null then
    v_codigo := private.codigo_desde_nombre(v_nombre);
    if exists (select 1 from public.clases_de_salida c where c.codigo = v_codigo) then
      raise exception 'Ya hay una clase que se llama así.' using errcode = '23505';
    end if;

    insert into public.clases_de_salida
      (codigo, nombre, pista, tipo, causa_baja, orden, exige_detalle, activa)
    values
      (v_codigo, v_nombre, nullif(btrim(coalesce(p_pista, '')), ''),
       p_tipo, nullif(btrim(coalesce(p_causa_baja, '')), ''),
       coalesce(p_orden, 100::smallint), coalesce(p_exige_detalle, false),
       coalesce(p_activa, true));

    return v_codigo;
  end if;

  if not exists (select 1 from public.clases_de_salida c where c.codigo = p_codigo) then
    raise exception 'No existe la clase "%".', p_codigo using errcode = 'P0002';
  end if;

  -- El nombre y la pista se corrigen; a dónde va NO se toca al editar. Recolgar
  -- «se usó trabajando» a una baja cambiaría informes ya emitidos, y quien lo
  -- hiciera no tendría forma de saberlo.
  update public.clases_de_salida
     set nombre = v_nombre,
         pista = nullif(btrim(coalesce(p_pista, '')), ''),
         orden = coalesce(p_orden, orden),
         exige_detalle = coalesce(p_exige_detalle, exige_detalle),
         activa = coalesce(p_activa, true)
   where codigo = p_codigo;

  return p_codigo;
end;
$function$;

-- public.pedir_salida(p_almacen_id bigint, p_renglones jsonb, p_motivo text, p_grupo_id bigint, p_externo text, p_responsable text)
-- venia de: 20260916171000_los_cuerpos_que_de_verdad_corren_sin_salida_directa.sql
CREATE OR REPLACE FUNCTION public.pedir_salida(p_almacen_id bigint, p_renglones jsonb, p_motivo text, p_grupo_id bigint DEFAULT NULL::bigint, p_externo text DEFAULT NULL::text, p_responsable text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_numero    text;
  v_id        bigint;
  v_r         jsonb;
  v_n         int := 0;
  v_almacen   public.almacenes;
  v_articulo  text;
  v_cuantos   int;
  v_motivo    text := btrim(coalesce(p_motivo, ''));
begin
  perform private.exigir_permiso('SALIDAS', 'LECTURA');

  select * into v_almacen from public.almacenes where id = p_almacen_id and activo;
  if v_almacen.id is null then
    raise exception 'Ese almacén no existe o está apagado.' using errcode = '23503';
  end if;

  if length(v_motivo) < 10 then
    raise exception 'Escribe para qué se necesita: es lo que lee quien la aprueba.' using errcode = '22023';
  end if;

  -- Una venta no se pide por aquí, ni lo que se le da a un cliente sin cobrarlo:
  -- va por Facturación, que es donde lleva cliente, precio y número.
  if private.nombra_una_venta(v_motivo) then
    -- Dice qué palabra frenó: sin eso, quien escribió algo legítimo no sabe
    -- qué cambiar y cree que el sistema falla.
    raise exception 'El «para qué» dice «%», y una venta no sale por aquí: se registra en Facturación › Notas de entrega, con cliente, precio y su número. Lo que se le da a un cliente sin cobrarlo también va por allá, como sin cargo. Si no es una venta, dilo sin esa palabra: quien la aprueba lee el texto entero.',
      lower(private.palabra_de_venta(v_motivo)) using errcode = '22023';
  end if;

  if p_grupo_id is null and nullif(btrim(coalesce(p_externo, '')), '') is null then
    raise exception 'Falta decir quién lo va a recibir: un grupo de la empresa, o alguien de fuera.'
      using errcode = '22023';
  end if;
  if p_grupo_id is not null and nullif(btrim(coalesce(p_externo, '')), '') is not null then
    raise exception 'Lo recibe un grupo de la empresa o alguien de fuera, no los dos.'
      using errcode = '22023';
  end if;
  if p_grupo_id is not null
     and not exists (select 1 from public.organigrama_nodos o where o.id = p_grupo_id and o.activo) then
    raise exception 'Ese grupo no está en el organigrama, o está apagado.' using errcode = '23503';
  end if;
  if nullif(btrim(coalesce(p_externo, '')), '') is not null
     and length(btrim(coalesce(p_responsable, ''))) < 3 then
    raise exception 'Di quién responde por lo que sale: el nombre de quien lo recibe.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'No hay nada que solicitar: la solicitud no trae renglones.' using errcode = '22023';
  end if;

  v_numero := private.siguiente_numero('SS');

  insert into public.solicitudes_salida
    (numero, almacen_id, clase, motivo, grupo_id, destino_externo, responsable_externo, pedida_por)
  values
    (v_numero, p_almacen_id, 'ENTREGA_POR_SOLICITUD', v_motivo, p_grupo_id,
     nullif(btrim(coalesce(p_externo, '')), ''), nullif(btrim(coalesce(p_responsable, '')), ''),
     (select auth.uid()))
  returning id into v_id;

  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_n := v_n + 1;

    select nombre into v_articulo
      from public.articulos
     where id = nullif(btrim(coalesce(v_r->>'articulo_id', '')), '')::bigint and activo;
    if v_articulo is null then
      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n using errcode = '23503';
    end if;

    insert into public.solicitud_salida_renglones
      (solicitud_id, articulo_id, cantidad, presentaciones, presentacion, suelto, propietario)
    values
      (v_id,
       (v_r->>'articulo_id')::bigint,
       coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0),
       nullif(btrim(coalesce(v_r->>'presentaciones', '')), '')::numeric,
       nullif(btrim(coalesce(v_r->>'presentacion', '')), ''),
       nullif(btrim(coalesce(v_r->>'suelto', '')), '')::numeric,
       nullif(btrim(coalesce(v_r->>'propietario', '')), ''));
  end loop;

  select count(*) into v_cuantos from public.solicitud_salida_renglones where solicitud_id = v_id;

  perform private.notificar(
    'SALIDAS', 'SALIDA_PEDIDA',
    format('%s: solicitan sacar %s material(es) de %s', v_numero, v_cuantos, v_almacen.nombre),
    format('Para: %s. La aprueba quien responde por %s.', v_motivo, v_almacen.nombre),
    '/app/salidas/solicitudes', array['ALMACEN', 'GERENTE_GENERAL'], 'ATENCION');

  return v_numero;
end;
$function$;

-- public.registrar_salidas(p_almacen_id bigint, p_renglones jsonb, p_motivo text, p_tipo text, p_fecha date, p_grupo_id bigint, p_externo text, p_responsable text)
-- venia de: 20260916171000_los_cuerpos_que_de_verdad_corren_sin_salida_directa.sql
CREATE OR REPLACE FUNCTION public.registrar_salidas(p_almacen_id bigint DEFAULT NULL::bigint, p_renglones jsonb DEFAULT NULL::jsonb, p_motivo text DEFAULT NULL::text, p_tipo text DEFAULT 'SALIDA_CONSUMO'::text, p_fecha date DEFAULT NULL::date, p_grupo_id bigint DEFAULT NULL::bigint, p_externo text DEFAULT NULL::text, p_responsable text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_r jsonb; v_n int := 0; v_almacen bigint; v_articulo bigint; v_cantidad numeric;
  v_nombre text; v_sitio text; v_hay numeric; v_costo numeric; v_nota text;
  v_clase public.clases_de_salida; v_tipo text; v_mov bigint;
  v_pres numeric; v_sueltas numeric; v_unidad_pres text;
  v_nombre_pres text; v_dueno text;
begin
  perform private.exigir_permiso('SALIDAS', 'ESCRITURA');

  /*
    POR AHORA TODA SALIDA SE AUTORIZA. Christopher, 16/09/2026: «todas las
    salidas necesitarán de autorización, ocultaremos las salidas y traslados
    directos por ahora». La única llamada que descuenta es la de la entrega de
    una solicitud aprobada, que enciende esta marca solo mientras dura. Sin ella
    es una salida directa, y se cierra aquí y no solo en la pantalla.
  */
  if nullif(current_setting('lacantera.entregando_solicitud', true), '') is null then
    raise exception 'Por ahora toda salida necesita autorización: solicítala en Salidas › Salidas y se entrega cuando la apruebe quien responde por el almacén.'
      using errcode = '42501';
  end if;

  -- Y ninguna sale como venta, aunque la solicitud sea de antes de esta regla.
  if private.nombra_una_venta(p_motivo) then
    raise exception 'La solicitud dice «%», y una venta no sale por aquí: se registra en Facturación › Notas de entrega, con cliente, precio y su número.',
      lower(private.palabra_de_venta(p_motivo)) using errcode = '22023';
  end if;

  select * into v_clase from public.clases_de_salida where codigo = p_tipo;
  if v_clase.codigo is not null then
    if not v_clase.activa then
      raise exception 'La clase "%" está apagada.', v_clase.nombre using errcode = '22023';
    end if;
    if v_clase.codigo = 'ENTREGA_POR_SOLICITUD'
       and nullif(current_setting('lacantera.entregando_solicitud', true), '') is null then
      raise exception 'La razón "%" la pone la entrega de una solicitud: en una salida directa elige otra.', v_clase.nombre
        using errcode = '22023';
    end if;
    if v_clase.tipo = 'SALIDA_BAJA' then
      raise exception 'La razón "%" ya no se usa: elige otra de la lista.', v_clase.nombre
        using errcode = '22023';
    end if;
    v_tipo := v_clase.tipo;
  else
    v_tipo := p_tipo;
    if v_tipo not in ('SALIDA_CONSUMO', 'SALIDA_MERMA', 'SALIDA_DESPACHO') then
      raise exception 'Tipo de salida no válido: %.', p_tipo using errcode = '22023';
    end if;
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'No hay nada que sacar: la salida no trae renglones.' using errcode = '22023';
  end if;

  /*
    PARA QUIÉN SALE, y no vale dejarlo en blanco.

    El grupo es un nodo del organigrama —una unidad o un cargo—, que es la lista
    que la empresa ya mantiene. Si falta uno, se añade allí y no aquí.
  */
  if p_grupo_id is null and nullif(btrim(coalesce(p_externo, '')), '') is null then
    raise exception 'Falta decir para quién sale: un grupo de la empresa, o quién es de fuera.'
      using errcode = '22023';
  end if;

  if p_grupo_id is not null and nullif(btrim(coalesce(p_externo, '')), '') is not null then
    raise exception 'Una salida va a un grupo de la empresa o a alguien de fuera, no a los dos.'
      using errcode = '22023';
  end if;

  if p_grupo_id is not null
     and not exists (select 1 from public.organigrama_nodos o
                      where o.id = p_grupo_id and o.activo) then
    raise exception 'Ese grupo no está en el organigrama, o está apagado.'
      using errcode = '23503';
  end if;

  /*
    LO QUE SALE DE LA EMPRESA LLEVA NOMBRE Y RESPONSABLE.

    La nota de salida se firma, y dentro de un año «FERRETERIA OSMAIRA» sin un
    nombre detrás no sirve para reclamarle nada a nadie.
  */
  if nullif(btrim(coalesce(p_externo, '')), '') is not null
     and length(btrim(coalesce(p_responsable, ''))) < 3 then
    raise exception 'Di quién responde por lo que sale: el nombre de quien lo recibe.'
      using errcode = '22023';
  end if;

  if coalesce(v_clase.exige_detalle, false) then
    if length(btrim(coalesce(p_motivo, ''))) < 10 then
      raise exception 'Explica qué pasó, con detalle. Dentro de un año esta frase será lo único que quede.'
        using errcode = '22023';
    end if;
  elsif length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe para qué sale. Una salida sin motivo no se puede auditar.' using errcode = '22023';
  end if;

  /*
    Primera pasada: comprobar. Nada se mueve todavia, para que un renglon malo
    no deje tres salidas hechas y dos no.

    LA CONVERSION ENTRA EN LOS TRES SITIOS, y esto es lo delicado de esta
    funcion: aqui, en la suma de los renglones anteriores, y en la pasada de
    escritura. Convertir solo en uno dejaria la reja de existencia comparando
    tambores contra litros, que es peor que no convertir.
  */
  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_n := v_n + 1;
    v_almacen  := coalesce(nullif(btrim(coalesce(v_r->>'almacen_id', '')), '')::bigint, p_almacen_id);
    v_articulo := nullif(btrim(coalesce(v_r->>'articulo_id', '')), '')::bigint;
    v_sueltas  := coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0);
    v_pres     := coalesce(nullif(btrim(coalesce(v_r->>'presentaciones', '')), '')::numeric, 0);

    select nombre into v_sitio from public.almacenes where id = v_almacen and activo;
    if v_sitio is null then
      raise exception 'El renglón %: no dice de qué almacén sale, o ese almacén está inactivo.', v_n using errcode = '23503';
    end if;
    select nombre into v_nombre from public.articulos where id = v_articulo and activo;
    if v_nombre is null then
      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n using errcode = '23503';
    end if;

    v_cantidad := private.en_unidad_base(v_articulo, v_pres, v_sueltas, nullif(btrim(coalesce(v_r->>'presentacion', '')), ''));

    if v_cantidad <= 0 then
      raise exception 'El renglón % (%): la cantidad tiene que ser mayor que cero.', v_n, v_nombre using errcode = '22023';
    end if;

    v_hay := private.existencia_para_escribir(v_almacen, v_articulo,
                 private.dueno_del_saldo(v_almacen, v_articulo, v_r->>'propietario')) - coalesce((
      select sum(private.en_unidad_base(
                   v_articulo,
                   coalesce(nullif(btrim(coalesce(r->>'presentaciones', '')), '')::numeric, 0),
                   coalesce(nullif(btrim(coalesce(r->>'cantidad', '')), '')::numeric, 0),
                   nullif(btrim(coalesce(r->>'presentacion', '')), '')))
        from jsonb_array_elements(p_renglones) with ordinality as t(r, i)
       where t.i < v_n
         and coalesce(nullif(btrim(coalesce(r->>'almacen_id', '')), '')::bigint, p_almacen_id) = v_almacen
         and nullif(btrim(coalesce(r->>'articulo_id', '')), '')::bigint = v_articulo), 0);

    if v_cantidad > v_hay then
      raise exception 'El renglón % (% en %): solo quedan % y se intentan sacar %.',
        v_n, v_nombre, v_sitio, private.numero_es(v_hay, 4), private.numero_es(v_cantidad, 4) using errcode = '22023';
    end if;
  end loop;

  v_nota := private.siguiente_numero('NS');

  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_almacen  := coalesce(nullif(btrim(coalesce(v_r->>'almacen_id', '')), '')::bigint, p_almacen_id);
    v_articulo := (v_r->>'articulo_id')::bigint;
    v_sueltas  := coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0);
    v_pres     := coalesce(nullif(btrim(coalesce(v_r->>'presentaciones', '')), '')::numeric, 0);
    v_cantidad := private.en_unidad_base(v_articulo, v_pres, v_sueltas, nullif(btrim(coalesce(v_r->>'presentacion', '')), ''));

    select presentacion into v_unidad_pres from public.articulos where id = v_articulo;
    v_dueno := private.dueno_del_saldo(v_almacen, v_articulo, v_r->>'propietario');
    v_costo := private.costo_promedio(v_almacen, v_articulo, v_dueno);

    v_mov := private.registrar_movimiento(
      v_tipo, -1, v_almacen, v_articulo, v_cantidad, v_costo,
      btrim(p_motivo), null, null, null, p_fecha, null, null, v_nota, null,
      p_cantidad_capturada => nullif(v_pres, 0),
      p_propietario => v_dueno,
      p_unidad_capturada => case when v_pres > 0 then private.presentacion_usada(v_articulo, nullif(btrim(coalesce(v_r->>'presentacion', '')), '')) end,
      p_suelto_capturado => case when v_pres > 0 then nullif(v_sueltas, 0) end,
      -- Por qué salió, con las palabras de la lista: ver la columna del libro.
      p_razon_salida => v_clase.nombre,
      p_grupo => p_grupo_id,
      p_externo => p_externo,
      p_responsable => p_responsable);
  end loop;

  return v_nota;
end;
$function$;
