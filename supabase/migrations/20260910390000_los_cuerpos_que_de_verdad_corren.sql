/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  6 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
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
  viva —no normalizado, no perdonando comentarios— y los 6 coinciden. Y el
  detector, que antes marcaba estas 6, pasa a cero.

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

-- private.registrar_movimiento(p_tipo text, p_signo integer, p_almacen bigint, p_articulo bigint, p_cantidad numeric, p_costo_usd numeric, p_nota text, p_orden bigint, p_renglon bigint, p_origen bigint, p_fecha date, p_empleado bigint, p_clase text, p_nota_salida text, p_aviso_costo numeric, p_cantidad_capturada numeric, p_unidad_capturada text, p_suelto_capturado numeric, p_costo_capturado numeric, p_costo_unidad_capturada text, p_moneda_capturada text, p_propietario text)
-- venia de: 20260910340000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION private.registrar_movimiento(p_tipo text, p_signo integer, p_almacen bigint, p_articulo bigint, p_cantidad numeric, p_costo_usd numeric, p_nota text DEFAULT NULL::text, p_orden bigint DEFAULT NULL::bigint, p_renglon bigint DEFAULT NULL::bigint, p_origen bigint DEFAULT NULL::bigint, p_fecha date DEFAULT NULL::date, p_empleado bigint DEFAULT NULL::bigint, p_clase text DEFAULT NULL::text, p_nota_salida text DEFAULT NULL::text, p_aviso_costo numeric DEFAULT NULL::numeric, p_cantidad_capturada numeric DEFAULT NULL::numeric, p_unidad_capturada text DEFAULT NULL::text, p_suelto_capturado numeric DEFAULT NULL::numeric, p_costo_capturado numeric DEFAULT NULL::numeric, p_costo_unidad_capturada text DEFAULT NULL::text, p_moneda_capturada text DEFAULT NULL::text, p_propietario text DEFAULT NULL::text)
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
     cantidad_capturada, unidad_capturada, suelto_capturado, costo_capturado, costo_unidad_capturada, moneda_capturada)
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
     nullif(btrim(coalesce(p_moneda_capturada, '')), ''))
  returning id into v_id;

  return v_id;
end;
$function$;

-- public.despachar_combustible(p_articulo_id bigint, p_almacen_id bigint, p_cantidad numeric, p_motivo text, p_motivo_detalle text, p_maquina_id bigint, p_destino text, p_horometro numeric, p_empleado_id bigint, p_recibio_nombre text, p_recibio_cedula text, p_fecha date, p_nota text, p_propietario text)
-- venia de: 20260908320000_los_cuerpos_que_de_verdad_corren_ii.sql
CREATE OR REPLACE FUNCTION public.despachar_combustible(p_articulo_id bigint, p_almacen_id bigint, p_cantidad numeric, p_motivo text, p_motivo_detalle text DEFAULT NULL::text, p_maquina_id bigint DEFAULT NULL::bigint, p_destino text DEFAULT NULL::text, p_horometro numeric DEFAULT NULL::numeric, p_empleado_id bigint DEFAULT NULL::bigint, p_recibio_nombre text DEFAULT NULL::text, p_recibio_cedula text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT NULL::text, p_propietario text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c_max_vales_dia constant integer := 3;
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Caracas')::date);
  v_hoy date := (now() at time zone 'America/Caracas')::date;
  v_art record; v_maq record; v_alm record; v_comb record;
  v_hay numeric; v_unitario numeric; v_costo numeric;
  v_ultimo numeric; v_lectura numeric; v_tope numeric; v_vales integer;
  v_recibe text; v_cedula text; v_surtio text; v_detalle text;
  v_mov bigint; v_id bigint; v_donde text; v_dueno text;
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if v_fecha > v_hoy then
    raise exception 'No se despacha combustible con fecha futura.' using errcode = '22023';
  end if;

  v_detalle := private.motivo_del_vale(p_motivo, p_motivo_detalle);

  select * into v_art from public.articulos where id = p_articulo_id;
  if v_art.id is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;
  if v_art.categoria <> 'COMBUSTIBLE' then
    raise exception '"%" no es combustible.', v_art.nombre using errcode = '22023';
  end if;

  select * into v_alm from public.almacenes where id = p_almacen_id;
  if v_alm.id is null then
    raise exception 'No existe el almacén %.', p_almacen_id using errcode = 'P0002';
  end if;
  if v_alm.tipo <> 'COMBUSTIBLE' then
    raise exception 'El combustible sale del tanque, no de "%". Ese almacén es de tipo %.', v_alm.nombre, v_alm.tipo
      using errcode = '22023', hint = 'Si el gasoil está cargado en otro almacén, transfiéralo primero al tanque.';
  end if;

  if p_maquina_id is not null then
    select * into v_maq from public.maquinaria where id = p_maquina_id;
    if v_maq.id is null then
      raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
    end if;
    v_donde := v_maq.nombre;

    if v_maq.capacidad_combustible is not null and p_cantidad > v_maq.capacidad_combustible then
      raise exception 'Al tanque de "%" le caben % %, y se estan despachando %.',
        v_maq.nombre, v_maq.capacidad_combustible, v_art.unidad, p_cantidad
        using errcode = '22023',
              hint = 'Si el combustible va a un envase aparte, registralo como otro vale sin ficha de maquina.';
    end if;

    if v_maq.combustible_id is not null and v_maq.combustible_id <> p_articulo_id then
      select nombre into v_comb from public.articulos where id = v_maq.combustible_id;
      raise exception '"%" usa % y se le está echando %.', v_maq.nombre,
        coalesce(v_comb.nombre, 'otro combustible'), v_art.nombre
        using errcode = '22023', hint = 'Si la ficha de la máquina está equivocada, corríjala en Maquinaria.';
    end if;

    /*
      TRES VALES AL DIA, POR MAQUINA. Pedido el 2 de septiembre de 2026. Existe
      para que nadie cargue el mismo tanque cuatro veces sin que se note.

      Solo cuenta cuando el vale va a una MAQUINA: un destino escrito a mano
      —una planta electrica, un bidon para el taller— no tiene tope.

      Se cuentan TODOS los del dia: `despachos_combustible` no tiene estado, asi
      que un vale emitido cuenta aunque despues se reverse su movimiento. Si
      algun dia los vales se anulan, este conteo tiene que excluir los anulados.
    */
    select count(*) into v_vales from public.despachos_combustible d
     where d.maquina_id = p_maquina_id and d.fecha = v_fecha;

    if v_vales >= c_max_vales_dia then
      raise exception 'A "%" ya se le surtió % veces el %. El máximo son % al día.',
        v_maq.nombre, v_vales, to_char(v_fecha, 'DD/MM/YYYY'), c_max_vales_dia
        using errcode = '22023',
              hint = 'Si de verdad hizo falta más, hay que revisar por qué esa máquina está consumiendo así.';
    end if;

    /*
      EL HOROMETRO ES OBLIGATORIO SI HAY MAQUINA, y antes era opcional.

      Sin el, el vale no dice a que altura del contador se echo ese combustible,
      y entonces el consumo por hora —que es de lo que se saca si una maquina
      gasta mas de lo que deberia— no se puede calcular.

      NO REINICIA NADA: es una lectura anotada en el vale, no toca el parte
      diario ni las horas del mantenimiento.

      El argumento que habia en contra sigue valiendo y se respeta: un generador
      de emergencia puede no llevar horometro. Pero eso no es una maquina de la
      ficha — va por `p_destino`, y ahi no se pide.
    */
    if p_horometro is null then
      raise exception 'Hace falta el horómetro de "%" para surtirla.', v_maq.nombre
        using errcode = '23514',
              hint = 'Es la lectura del tablero al echarle. No reinicia nada: queda anotada en el vale.';
    end if;
  else
    if length(btrim(coalesce(p_destino, ''))) < 3 then
      raise exception 'Hay que decir a qué se le echó.' using errcode = '23514';
    end if;
    v_donde := btrim(p_destino);
  end if;

  if p_empleado_id is not null then
    select btrim(e.nombres || ' ' || e.apellidos), e.cedula into v_recibe, v_cedula
      from public.empleados e where e.id = p_empleado_id;
    if v_recibe is null then
      raise exception 'No existe el empleado %.', p_empleado_id using errcode = 'P0002';
    end if;
  else
    v_recibe := btrim(coalesce(p_recibio_nombre, ''));
    v_cedula := nullif(btrim(coalesce(p_recibio_cedula, '')), '');
    if length(v_recibe) < 3 then
      raise exception 'Hay que decir quién recibió el combustible.'
        using errcode = '23514',
              hint = 'Si no es alguien de la nómina —el chofer de un fletero, por ejemplo— escriba su nombre.';
    end if;
  end if;

  select nombre into v_surtio from public.perfiles where id = (select auth.uid());

  perform pg_catalog.pg_advisory_xact_lock(p_almacen_id::int, p_articulo_id::int);
  v_dueno := private.dueno_del_saldo(p_almacen_id, p_articulo_id, p_propietario);
  v_hay := private.existencia_para_escribir(p_almacen_id, p_articulo_id, v_dueno);
  if v_hay < p_cantidad then
    raise exception 'En el tanque solo quedan % % de %.', private.cantidad_es(v_hay), v_art.unidad, v_art.nombre
      using errcode = '55000';
  end if;

  /*
    EL HOROMETRO NO RETROCEDE — Y ESTO ERA UN AVISO.

    Se guardaba igual y despues salia una notificacion que alguien tenia que
    leer y corregir a mano, con el numero ya escrito. Dos puertas al mismo
    contador con reglas distintas es como se consigue que nadie sepa cual vale:
    `registrar_lectura` ya rechaza, asi que esta tambien.

    REVERSIBLE A PROPOSITO: si en el patio esto detiene mas surtidos de los que
    evita, se vuelve a `private.notificar` cambiando este bloque y nada mas.
  */
  if p_maquina_id is not null then
    select d.horometro into v_ultimo from public.despachos_combustible d
     where d.maquina_id = p_maquina_id and d.horometro is not null and d.fecha <= v_fecha
     order by d.fecha desc, d.id desc limit 1;

    select l.final into v_lectura from public.horometro_lecturas l
     where l.maquina_id = p_maquina_id and l.fecha <= v_fecha
     order by l.fecha desc, l.id desc limit 1;

    v_tope := greatest(coalesce(v_ultimo, 0), coalesce(v_lectura, 0));

    if (v_ultimo is not null or v_lectura is not null) and p_horometro < v_tope then
      raise exception 'El horómetro de "%" no retrocede: lo último anotado marcaba % y se está surtiendo con %.',
        v_maq.nombre, v_tope, p_horometro
        using errcode = '22023',
              hint = 'Si el tablero se ve mal o le cambiaron el reloj, eso se corrige en Maquinaria, no aquí.';
    end if;
  end if;

  v_unitario := private.costo_promedio(p_almacen_id, p_articulo_id, v_dueno);
  v_costo := v_unitario * p_cantidad;

  v_mov := private.registrar_movimiento(
    'SALIDA_CONSUMO', -1, p_almacen_id, p_articulo_id, p_cantidad, v_unitario,
    format('Combustible · %s · %s', v_donde, coalesce(v_detalle, p_motivo)),
    null, null, null, v_fecha, p_propietario => v_dueno);

  insert into public.despachos_combustible
    (numero, fecha, hora, articulo_id, almacen_id, cantidad, motivo, motivo_detalle,
     maquina_id, destino, horometro, empleado_id, recibio_nombre, recibio_cedula,
     surtio_nombre, costo_usd, movimiento_id, nota, registrado_por)
  values
    (private.siguiente_numero('CMB'), v_fecha,
     case when v_fecha = v_hoy then (now() at time zone 'America/Caracas')::time else null end,
     p_articulo_id, p_almacen_id, p_cantidad, p_motivo, v_detalle, p_maquina_id,
     nullif(btrim(coalesce(p_destino, '')), ''), p_horometro, p_empleado_id,
     v_recibe, v_cedula, v_surtio, v_costo, v_mov,
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  if v_art.stock_minimo > 0 and (v_hay - p_cantidad) <= v_art.stock_minimo then
    perform private.notificar('COMBUSTIBLE', 'TANQUE_BAJO',
      format('Queda poco %s', v_art.nombre),
      format('Quedan %s %s, y el mínimo son %s.', private.cantidad_es(v_hay - p_cantidad), v_art.unidad, private.cantidad_es(v_art.stock_minimo)),
      '/app/combustible', array['ALMACEN', 'OPERACIONES', 'COMPRAS'], 'ATENCION');
  end if;

  return v_id;
end;
$function$;

-- public.entregar_a_trabajador(p_empleado_id bigint, p_almacen_id bigint, p_renglones jsonb, p_clase text, p_fecha date, p_nota text)
-- venia de: 20260908320000_los_cuerpos_que_de_verdad_corren_ii.sql
CREATE OR REPLACE FUNCTION public.entregar_a_trabajador(p_empleado_id bigint, p_almacen_id bigint, p_renglones jsonb, p_clase text DEFAULT 'ASIGNACION'::text, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fecha     date := coalesce(p_fecha, current_date);
  v_clase     text := coalesce(nullif(btrim(coalesce(p_clase, '')), ''), 'ASIGNACION');
  v_emp       record;
  v_art       record;
  v_item      jsonb;
  v_cantidad  numeric;
  v_libres    numeric;
  v_dueno     text;
  v_hay       numeric;
  v_costo     numeric;
  v_prestados integer := 0;
  v_gastados  integer := 0;
begin
  if not private.tiene_permiso('ASIGNACIONES', 'ESCRITURA')
     and not private.tiene_rol('ALMACEN', 'RRHH', 'ADMIN') then
    raise exception 'No tienes permiso para entregarle cosas a un trabajador.'
      using errcode = '42501';
  end if;

  if v_clase not in ('DOTACION', 'ASIGNACION') then
    raise exception 'Di si es dotación —por su rol— o asignación —para una actividad concreta.'
      using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se entrega nada con fecha futura.' using errcode = '22023';
  end if;

  select * into v_emp from public.empleados where id = p_empleado_id;

  if v_emp.id is null then
    raise exception 'No existe ese trabajador.' using errcode = 'P0002';
  end if;

  if not v_emp.activo or v_emp.fecha_egreso is not null then
    raise exception 'A % ya no se le entrega nada: está egresado.',
      v_emp.nombres || ' ' || v_emp.apellidos using errcode = '55000';
  end if;

  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'El almacén indicado no existe o está inactivo.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Indica qué se entrega y en qué cantidad.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_cantidad := coalesce((v_item->>'cantidad')::numeric, 0);

    if v_cantidad <= 0 then
      continue;
    end if;

    select * into v_art from public.articulos where id = (v_item->>'articulo_id')::bigint;
    v_dueno := case when v_art.id is null then null
                    else private.dueno_del_saldo(p_almacen_id, v_art.id, v_item->>'propietario') end;

    if v_art.id is null then
      raise exception 'No existe el artículo %.', v_item->>'articulo_id' using errcode = 'P0002';
    end if;

    if v_art.modo_entrega = 'NO' then
      raise exception '"%" no es algo que se le entregue a una persona. Si debería serlo, cámbialo en el catálogo.',
        v_art.nombre using errcode = '22023';
    end if;

    if v_art.modo_entrega = 'RETORNABLE' then
      select private.existencia_para_escribir(p_almacen_id, v_art.id)
           - coalesce((select sum(a.cantidad) from public.asignaciones_herramienta a
                        where a.articulo_id = v_art.id and a.almacen_id = p_almacen_id
                          and a.estado = 'ASIGNADA'), 0)
        into v_libres;

      if v_libres < v_cantidad then
        raise exception 'De "%" solo quedan % sin prestar.', v_art.nombre, private.cantidad_es(v_libres)
          using errcode = '55000';
      end if;

      insert into public.asignaciones_herramienta
        (numero, articulo_id, almacen_id, empleado_id, cantidad, fecha_entrega,
         clase, nota, entregado_por)
      values
        (private.siguiente_numero('ASG'), v_art.id, p_almacen_id, p_empleado_id,
         v_cantidad, v_fecha, v_clase,
         nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()));

      v_prestados := v_prestados + 1;

    else
      v_hay := private.existencia_para_escribir(p_almacen_id, v_art.id, v_dueno);

      if v_cantidad > v_hay then
        raise exception 'De "%" solo hay % en existencia y se intentan entregar %.',
          v_art.nombre, private.cantidad_es(v_hay), private.cantidad_es(v_cantidad) using errcode = '22023';
      end if;

      v_costo := private.costo_promedio(p_almacen_id, v_art.id, v_dueno);

      perform private.registrar_movimiento(
        'SALIDA_CONSUMO', -1, p_almacen_id, v_art.id, v_cantidad, v_costo,
        format('%s a %s (%s). %s',
               case when v_clase = 'DOTACION' then 'Dotación' else 'Asignación' end,
               v_emp.nombres || ' ' || v_emp.apellidos, v_emp.ficha,
               coalesce(nullif(trim(coalesce(p_nota, '')), ''), '')),
        null, null, null, v_fecha, p_empleado_id, v_clase,
        p_propietario => v_dueno);

      v_gastados := v_gastados + 1;
    end if;
  end loop;

  if v_prestados + v_gastados = 0 then
    raise exception 'No se indicó ninguna cantidad a entregar.' using errcode = '22023';
  end if;

  return jsonb_build_object('prestados', v_prestados, 'consumidos', v_gastados);
end;
$function$;

-- public.registrar_ajuste(p_almacen_id bigint, p_articulo_id bigint, p_contado numeric, p_motivo text, p_fecha date, p_presentaciones numeric, p_presentacion text, p_envases jsonb, p_propietario text)
-- venia de: 20260910140000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.registrar_ajuste(p_almacen_id bigint, p_articulo_id bigint, p_contado numeric, p_motivo text, p_fecha date DEFAULT NULL::date, p_presentaciones numeric DEFAULT NULL::numeric, p_presentacion text DEFAULT NULL::text, p_envases jsonb DEFAULT NULL::jsonb, p_propietario text DEFAULT NULL::text)
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
  v_dueno      text;
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

  -- Se cuenta lo de UN dueño: en un sitio mezclado, «veinte» no dice cuantas
  -- faltan de cada uno y el ajuste no sabria a quien cargarle la diferencia.
  v_dueno := private.dueno_del_saldo(p_almacen_id, p_articulo_id, p_propietario);
  v_existencia := private.existencia_para_escribir(p_almacen_id, p_articulo_id, v_dueno);
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
    v_costo := private.costo_promedio(p_almacen_id, p_articulo_id, v_dueno);

    v_mov := private.registrar_movimiento(
      case when v_diferencia > 0 then 'AJUSTE_POSITIVO' else 'AJUSTE_NEGATIVO' end,
      case when v_diferencia > 0 then 1 else -1 end::smallint,
      p_almacen_id, p_articulo_id, abs(v_diferencia), v_costo,
      format('Conteo físico: %s contra %s %s en sistema. %s',
             v_conto, private.numero_es(v_existencia, 4), v_art.unidad, p_motivo),
      null, null, null, p_fecha,
      p_propietario => v_dueno,
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

-- public.registrar_baja(p_almacen_id bigint, p_articulo_id bigint, p_cantidad numeric, p_causa text, p_motivo text, p_destino text, p_fecha date, p_propietario text)
-- venia de: 20260908320000_los_cuerpos_que_de_verdad_corren_ii.sql
CREATE OR REPLACE FUNCTION public.registrar_baja(p_almacen_id bigint, p_articulo_id bigint, p_cantidad numeric, p_causa text, p_motivo text, p_destino text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_propietario text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_existencia numeric;
  v_costo      numeric;
  v_dueno      text;
  v_articulo   text;
  v_id         bigint;
begin
  perform private.exigir_rol('ALMACEN');

  if p_causa not in ('DANADO', 'OBSOLETO', 'VENCIDO', 'EXTRAVIADO', 'ROBADO') then
    raise exception 'Esa no es una causa de baja: dañado, obsoleto, vencido, extraviado o robado.'
      using errcode = '22023';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad que se da de baja tiene que ser mayor que cero.'
      using errcode = '22023';
  end if;

  -- Mas exigente que en una salida normal: dar de baja destruye valor y el
  -- unico rastro de por que sera lo que se escriba aqui. «Dañado» no explica
  -- nada que la causa no diga ya.
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Explica que paso, con detalle. Dentro de un año esta frase sera lo unico que quede para justificar la perdida.'
      using errcode = '22023';
  end if;

  v_dueno := private.dueno_del_saldo(p_almacen_id, p_articulo_id, p_propietario);
  v_existencia := private.existencia_para_escribir(p_almacen_id, p_articulo_id, v_dueno);

  if p_cantidad > v_existencia then
    select nombre into v_articulo from public.articulos where id = p_articulo_id;
    raise exception 'De "%" solo hay % en existencia y se intentan dar de baja %.',
      coalesce(v_articulo, p_articulo_id::text), private.cantidad_es(v_existencia), private.cantidad_es(p_cantidad)
      using errcode = '22023';
  end if;

  -- Al costo promedio, como toda salida: lo que se pierde vale lo que valia
  -- mientras estaba.
  v_costo := private.costo_promedio(p_almacen_id, p_articulo_id, v_dueno);

  v_id := private.registrar_movimiento(
    'SALIDA_BAJA', -1, p_almacen_id, p_articulo_id, p_cantidad, v_costo,
    btrim(p_motivo), null, null, null, p_fecha, null, null,
    p_propietario => v_dueno);

  insert into public.inventario_bajas (movimiento_id, causa, destino, solicitada_por)
  values (v_id, p_causa, nullif(btrim(coalesce(p_destino, '')), ''), (select auth.uid()));

  return v_id;
end;
$function$;

-- public.registrar_salidas(p_almacen_id bigint, p_renglones jsonb, p_motivo text, p_tipo text, p_fecha date)
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.registrar_salidas(p_almacen_id bigint DEFAULT NULL::bigint, p_renglones jsonb DEFAULT NULL::jsonb, p_motivo text DEFAULT NULL::text, p_tipo text DEFAULT 'SALIDA_CONSUMO'::text, p_fecha date DEFAULT NULL::date)
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

  if v_tipo = 'SALIDA_BAJA' or coalesce(v_clase.exige_detalle, false) then
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
      p_suelto_capturado => case when v_pres > 0 then nullif(v_sueltas, 0) end);

    if v_tipo = 'SALIDA_BAJA' then
      insert into public.inventario_bajas (movimiento_id, causa, solicitada_por)
      values (v_mov, v_clase.causa_baja, (select auth.uid()));
    end if;
  end loop;

  return v_nota;
end;
$function$;
