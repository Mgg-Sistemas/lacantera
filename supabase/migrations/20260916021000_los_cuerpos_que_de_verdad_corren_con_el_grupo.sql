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

-- private.registrar_movimiento(p_tipo text, p_signo integer, p_almacen bigint, p_articulo bigint, p_cantidad numeric, p_costo_usd numeric, p_nota text, p_orden bigint, p_renglon bigint, p_origen bigint, p_fecha date, p_empleado bigint, p_clase text, p_nota_salida text, p_aviso_costo numeric, p_cantidad_capturada numeric, p_unidad_capturada text, p_suelto_capturado numeric, p_costo_capturado numeric, p_costo_unidad_capturada text, p_moneda_capturada text, p_propietario text, p_razon_salida text, p_grupo bigint)
-- venia de: 20260915231000_los_cuerpos_que_de_verdad_corren_sin_bajas.sql
CREATE OR REPLACE FUNCTION private.registrar_movimiento(p_tipo text, p_signo integer, p_almacen bigint, p_articulo bigint, p_cantidad numeric, p_costo_usd numeric, p_nota text DEFAULT NULL::text, p_orden bigint DEFAULT NULL::bigint, p_renglon bigint DEFAULT NULL::bigint, p_origen bigint DEFAULT NULL::bigint, p_fecha date DEFAULT NULL::date, p_empleado bigint DEFAULT NULL::bigint, p_clase text DEFAULT NULL::text, p_nota_salida text DEFAULT NULL::text, p_aviso_costo numeric DEFAULT NULL::numeric, p_cantidad_capturada numeric DEFAULT NULL::numeric, p_unidad_capturada text DEFAULT NULL::text, p_suelto_capturado numeric DEFAULT NULL::numeric, p_costo_capturado numeric DEFAULT NULL::numeric, p_costo_unidad_capturada text DEFAULT NULL::text, p_moneda_capturada text DEFAULT NULL::text, p_propietario text DEFAULT NULL::text, p_razon_salida text DEFAULT NULL::text, p_grupo bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_unidad text; v_id bigint; v_capacidad numeric; v_nombre text; v_hay numeric;
  v_dueno text; v_duenos text[];
begin
  if p_signo not in (-1, 1) then
    raise exception 'El signo de un movimiento solo puede ser +1 o -1 (recibido: %).', p_signo
      using errcode = '22023';
  end if;

  /*
    UN PATIO DE MAQUINAS NO GUARDA MATERIAL, y este es el unico sitio de toda la
    base que escribe en `inventario_movimientos` — comprobado contra pg_proc, no
    de memoria. Poniendo el cierre aqui lo heredan las catorce puertas del
    inventario y las que se escriban mañana.
  */
  if exists (select 1 from public.almacenes a
              where a.id = p_almacen and a.tipo = 'PATIO_MAQUINAS') then
    raise exception '«%» es un patio de maquinas: ahi no se guarda material.',
      (select nombre from public.almacenes where id = p_almacen)
      using errcode = '22023',
            hint = 'Sirve para decir donde se resguarda una maquina o un vehiculo, no para llevar existencias.';
  end if;

  /*
    «EN CAMINO» SOLO LO MUEVEN LOS TRASLADOS.

    Es donde espera lo que ya salió de un sitio y todavía no llegó al otro. Una
    salida o una entrada suelta ahí dejaría un traslado sin su material, o
    material sin traslado. Las funciones de traslado encienden esta marca, que
    muere con la transacción, y ninguna otra puerta la tiene.
  */
  if exists (select 1 from public.almacenes a
              where a.id = p_almacen and a.tipo = 'TRANSITO')
     and coalesce(current_setting('cantera.traslado_en_curso', true), '') <> 'si' then
    raise exception '«%» es donde espera lo que va de un sitio a otro: solo lo mueven los traslados.',
      (select nombre from public.almacenes where id = p_almacen)
      using errcode = '22023',
            hint = 'Para sacar algo de ahí, recibe o cancela su traslado en Transferencias.';
  end if;

  select unidad into v_unidad from public.articulos where id = p_articulo;
  if v_unidad is null then
    raise exception 'No existe el artículo %.', p_articulo using errcode = 'P0002';
  end if;

  /*
    DE QUIEN ES LO QUE SE MUEVE. Ver el comentario de la columna: al entrar es
    del dueño del almacen salvo que se diga; al salir, del unico que haya; y si
    hay varios se para, porque adivinar seria inventar de quien era.
  */
  v_dueno := nullif(btrim(coalesce(p_propietario, '')), '');

  if v_dueno is null then
    if p_signo = 1 then
      select a.propietario into v_dueno from public.almacenes a where a.id = p_almacen;
      v_dueno := coalesce(v_dueno, 'LACANTERA');
    else
      -- La regla vive en un solo sitio: ver `private.dueno_del_saldo`.
      v_dueno := private.dueno_del_saldo(p_almacen, p_articulo, null);
    end if;
  end if;

  /*
    Y QUE ALCANCE LO DE ESE DUEÑO, no lo que hay en total. Solo se comprueba
    cuando el sitio tiene mezcla: en un sitio de un solo dueño el saldo suyo ES
    el total, y la comprobacion de quien llama ya lo cubrio con mejor mensaje.
  */
  -- Siempre en las salidas, lo diga quien lo diga: la version anterior solo
  -- comprobaba cuando el dueño se habia resuelto solo, que es justo el caso en
  -- que no hace falta.
  if p_signo = -1 then
    select coalesce(sum(m.cantidad * m.signo), 0) into v_hay
      from public.inventario_movimientos m
     where m.almacen_id = p_almacen and m.articulo_id = p_articulo
       and m.propietario = v_dueno;
    if v_hay < p_cantidad then
      select nombre into v_nombre from public.articulos where id = p_articulo;
      raise exception 'De «%» ahi solo hay % de ese dueño: no alcanza para %.',
        v_nombre, private.cantidad_es(v_hay), private.cantidad_es(p_cantidad)
        using errcode = '55000';
    end if;
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
     entrega_clase, registrado_por, nota_salida, aviso_costo, propietario,
     cantidad_capturada, unidad_capturada, suelto_capturado, costo_capturado, costo_unidad_capturada, moneda_capturada, razon_salida, grupo_id)
  values
    (private.siguiente_numero('MOV'), coalesce(p_fecha, current_date), p_tipo, p_signo,
     p_almacen, p_articulo, p_cantidad, v_unidad, p_costo_usd, -- un hueco es un hueco
     p_orden, p_renglon, p_origen, nullif(trim(coalesce(p_nota, '')), ''), p_empleado,
     p_clase, (select auth.uid()), p_nota_salida, p_aviso_costo, v_dueno,
     nullif(p_cantidad_capturada, 0),
     nullif(btrim(coalesce(p_unidad_capturada, '')), ''),
     nullif(p_suelto_capturado, 0),
     p_costo_capturado,
     nullif(btrim(coalesce(p_costo_unidad_capturada, '')), ''),
     nullif(btrim(coalesce(p_moneda_capturada, '')), ''),
     -- Por qué salió, con las palabras de la lista: ver la columna.
     nullif(btrim(coalesce(p_razon_salida, '')), ''),
     -- Para qué grupo de gente salió: ver la columna.
     p_grupo)
  returning id into v_id;

  return v_id;
end;
$function$;

-- public.eliminar_nodo_organigrama(p_id bigint)
-- venia de: 20260820340000_el_organigrama_es_un_arbol.sql
CREATE OR REPLACE FUNCTION public.eliminar_nodo_organigrama(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_hijos int;
begin
  perform private.exigir_permiso('NOMINA', 'ESCRITURA');

  select count(*) into v_hijos from public.organigrama_nodos where padre_id = p_id;

  -- Se niega en vez de arrastrar a los hijos: borrar en cascada una rama
  -- entera por un clic no se puede deshacer, y subir los hijos por nuestra
  -- cuenta sería inventarle una jerarquía a la empresa.
  if v_hijos > 0 then
    raise exception 'De ahí cuelgan % puesto(s). Muévelos o quítalos primero.', v_hijos
      using errcode = '23503';
  end if;

  -- Ni si de él cuelgan salidas ya registradas: el libro tiene que poder
  -- decir para quién salió cada cosa dentro de diez años.
  if exists (select 1 from public.inventario_movimientos m where m.grupo_id = p_id) then
    raise exception 'De ese grupo cuelgan salidas ya registradas: no se puede borrar.'
      using errcode = '23503',
            hint = 'Si ya no existe en la empresa, apágalo en vez de borrarlo.';
  end if;

  delete from public.organigrama_nodos where id = p_id;
end;
$function$;

-- public.registrar_salidas(p_almacen_id bigint, p_renglones jsonb, p_motivo text, p_tipo text, p_fecha date, p_grupo_id bigint)
-- venia de: 20260915231000_los_cuerpos_que_de_verdad_corren_sin_bajas.sql
CREATE OR REPLACE FUNCTION public.registrar_salidas(p_almacen_id bigint DEFAULT NULL::bigint, p_renglones jsonb DEFAULT NULL::jsonb, p_motivo text DEFAULT NULL::text, p_tipo text DEFAULT 'SALIDA_CONSUMO'::text, p_fecha date DEFAULT NULL::date, p_grupo_id bigint DEFAULT NULL::bigint)
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
  perform private.exigir_rol('ALMACEN');

  select * into v_clase from public.clases_de_salida where codigo = p_tipo;
  if v_clase.codigo is not null then
    if not v_clase.activa then
      raise exception 'La clase "%" está apagada.', v_clase.nombre using errcode = '22023';
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
  if p_grupo_id is null then
    raise exception 'Falta decir para quién sale. Elige el grupo en la lista.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.organigrama_nodos o
                  where o.id = p_grupo_id and o.activo) then
    raise exception 'Ese grupo no está en el organigrama, o está apagado.'
      using errcode = '23503';
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
      p_grupo => p_grupo_id);
  end loop;

  return v_nota;
end;
$function$;
