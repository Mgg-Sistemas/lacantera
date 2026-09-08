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

-- private.exigir_existencia_para_reverso
-- venia de: 20260729140000_inventario_transferencias.sql
CREATE OR REPLACE FUNCTION private.exigir_existencia_para_reverso(p_mov inventario_movimientos, p_pedido bigint)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_hay      numeric;
  v_almacen  text;
  v_articulo text;
begin
  -- Solo estorba cuando el reverso resta. Devolver material nunca sobra.
  if p_mov.signo < 0 then return; end if;

  v_hay := private.existencia(p_mov.almacen_id, p_mov.articulo_id);

  if p_mov.cantidad > v_hay then
    select nombre into v_almacen  from public.almacenes where id = p_mov.almacen_id;
    select nombre into v_articulo from public.articulos where id = p_mov.articulo_id;
    raise exception
      'No se puede reversar %: habría que sacar % de "%" en % y solo quedan %. %',
      p_mov.numero, private.cantidad_es(p_mov.cantidad), v_articulo, v_almacen, private.cantidad_es(v_hay),
      case when p_mov.id = p_pedido then 'Ese material ya se usó.'
           else 'Ese material ya se movió del destino del traslado.' end
      using errcode = '22023';
  end if;
end;
$function$;

-- private.numero_es
-- venia de: 20260907140000_el_costo_raro_avisa_y_queda_marcado.sql
CREATE OR REPLACE FUNCTION private.numero_es(p_valor numeric, p_decimales integer DEFAULT 2)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  /*
    UN NUMERO ESCRITO COMO SE ESCRIBE EN VENEZUELA: 1.234,56

    `to_char` con los codigos G y D usa los separadores del `lc_numeric` del
    servidor, y aqui es `en_US.UTF-8`. El resultado era que los mensajes de
    error decian «6,074.6400» — que un venezolano lee como seis coma cero
    setenta y cuatro— justo cuando el mensaje existe para que alguien compare
    dos cifras y decida.

    Se comprobo ejecutando: `to_char(6074.64, 'FM999G999G990D0000')` devuelve
    «6,074.6400».

    Se formatea con separadores en ingles y se intercambian al final, que es mas
    corto y mas seguro que cambiar el locale de la sesion.
  */
  select translate(
           to_char(p_valor, 'FM999G999G999G999G990' ||
                   case when p_decimales > 0 then 'D' || repeat('0', p_decimales) else '' end),
           ',.', '.,');
$function$;

-- public.asignar_herramienta
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.asignar_herramienta(p_articulo_id bigint, p_almacen_id bigint, p_empleado_id bigint, p_cantidad numeric, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT NULL::text, p_fecha_limite date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fecha date := coalesce(p_fecha, current_date);
  v_emp record; v_art record; v_libres numeric; v_id bigint;
begin
  perform private.exigir_permiso('ASIGNACIONES', 'ESCRITURA');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if v_fecha > current_date then
    raise exception 'No se entrega una herramienta con fecha futura.' using errcode = '22023';
  end if;
  if p_fecha_limite is not null and p_fecha_limite < v_fecha then
    raise exception 'La fecha de devolución no puede ser anterior a la de entrega.'
      using errcode = '22023';
  end if;

  select * into v_art from public.articulos where id = p_articulo_id;
  if v_art.id is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

  select * into v_emp from public.empleados where id = p_empleado_id;
  if v_emp.id is null then
    raise exception 'No existe el trabajador %.', p_empleado_id using errcode = 'P0002';
  end if;
  if v_emp.fecha_egreso is not null then
    raise exception '% ya no trabaja en la empresa.', v_emp.nombres || ' ' || v_emp.apellidos
      using errcode = '55000';
  end if;

  -- `existencia_para_escribir` y no `existencia`: toma el cerrojo ANTES de
  -- leer, que es el único orden que impide que dos entregas simultáneas
  -- decidan las dos que alcanzaba.
  select private.existencia_para_escribir(p_almacen_id, p_articulo_id)
       - coalesce((select sum(cantidad) from public.asignaciones_herramienta
                    where articulo_id = p_articulo_id and almacen_id = p_almacen_id
                      and estado = 'ASIGNADA'), 0)
    into v_libres;

  if v_libres < p_cantidad then
    raise exception 'Solo quedan % de "%" sin asignar.', private.cantidad_es(v_libres), v_art.nombre
      using errcode = '55000';
  end if;

  insert into public.asignaciones_herramienta
    (numero, articulo_id, almacen_id, empleado_id, cantidad, fecha_entrega,
     fecha_limite, nota, entregado_por)
  values
    (private.siguiente_numero('ASG'), p_articulo_id, p_almacen_id, p_empleado_id,
     p_cantidad, v_fecha, p_fecha_limite,
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$function$;

-- public.despachar_combustible
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.despachar_combustible(p_articulo_id bigint, p_almacen_id bigint, p_cantidad numeric, p_motivo text, p_motivo_detalle text DEFAULT NULL::text, p_maquina_id bigint DEFAULT NULL::bigint, p_destino text DEFAULT NULL::text, p_horometro numeric DEFAULT NULL::numeric, p_empleado_id bigint DEFAULT NULL::bigint, p_recibio_nombre text DEFAULT NULL::text, p_recibio_cedula text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT NULL::text)
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
  v_mov bigint; v_id bigint; v_donde text;
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
  v_hay := private.existencia_para_escribir(p_almacen_id, p_articulo_id);
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

  v_unitario := private.costo_promedio(p_almacen_id, p_articulo_id);
  v_costo := v_unitario * p_cantidad;

  v_mov := private.registrar_movimiento(
    'SALIDA_CONSUMO', -1, p_almacen_id, p_articulo_id, p_cantidad, v_unitario,
    format('Combustible · %s · %s', v_donde, coalesce(v_detalle, p_motivo)),
    null, null, null, v_fecha);

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

-- public.entregar_a_trabajador
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
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
      v_hay := private.existencia_para_escribir(p_almacen_id, v_art.id);

      if v_cantidad > v_hay then
        raise exception 'De "%" solo hay % en existencia y se intentan entregar %.',
          v_art.nombre, private.cantidad_es(v_hay), private.cantidad_es(v_cantidad) using errcode = '22023';
      end if;

      v_costo := private.costo_promedio(p_almacen_id, v_art.id);

      perform private.registrar_movimiento(
        'SALIDA_CONSUMO', -1, p_almacen_id, v_art.id, v_cantidad, v_costo,
        format('%s a %s (%s). %s',
               case when v_clase = 'DOTACION' then 'Dotación' else 'Asignación' end,
               v_emp.nombres || ' ' || v_emp.apellidos, v_emp.ficha,
               coalesce(nullif(trim(coalesce(p_nota, '')), ''), '')),
        null, null, null, v_fecha, p_empleado_id, v_clase);

      v_gastados := v_gastados + 1;
    end if;
  end loop;

  if v_prestados + v_gastados = 0 then
    raise exception 'No se indicó ninguna cantidad a entregar.' using errcode = '22023';
  end if;

  return jsonb_build_object('prestados', v_prestados, 'consumidos', v_gastados);
end;
$function$;

-- public.entregar_dotacion
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.entregar_dotacion(p_empleado_id bigint, p_almacen_id bigint, p_renglones jsonb, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_emp      record;
  v_item     jsonb;
  v_articulo bigint;
  v_cantidad numeric;
  v_hay      numeric;
  v_costo    numeric;
  v_nombre   text;
  v_n        integer := 0;
begin
  perform private.exigir_rol('ALMACEN', 'RRHH');

  select * into v_emp from public.empleados where id = p_empleado_id;

  if v_emp.id is null then
    raise exception 'No existe ese trabajador.' using errcode = 'P0002';
  end if;

  if not v_emp.activo then
    raise exception 'A % ya no se le entrega dotación: está egresado.',
      v_emp.nombres || ' ' || v_emp.apellidos using errcode = '55000';
  end if;

  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'El almacén indicado no existe o está inactivo.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Indica qué se entrega y en qué cantidad.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_articulo := (v_item->>'articulo_id')::bigint;
    v_cantidad := coalesce((v_item->>'cantidad')::numeric, 0);

    if v_cantidad <= 0 then
      continue;
    end if;

    select nombre into v_nombre from public.articulos where id = v_articulo;

    if v_nombre is null then
      raise exception 'No existe el artículo %.', v_articulo using errcode = 'P0002';
    end if;

    v_hay := private.existencia_para_escribir(p_almacen_id, v_articulo);

    if v_cantidad > v_hay then
      raise exception 'De "%" solo hay % en existencia y se intentan entregar %.',
        v_nombre, private.cantidad_es(v_hay), private.cantidad_es(v_cantidad) using errcode = '22023';
    end if;

    v_costo := private.costo_promedio(p_almacen_id, v_articulo);

    perform private.registrar_movimiento(
      'SALIDA_CONSUMO', -1, p_almacen_id, v_articulo, v_cantidad, v_costo,
      format('Dotación a %s (%s). %s',
             v_emp.nombres || ' ' || v_emp.apellidos, v_emp.ficha,
             coalesce(nullif(trim(coalesce(p_nota, '')), ''), 'Entrega de dotación')),
      null, null, null, p_fecha, p_empleado_id);

    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'No se indicó ninguna cantidad a entregar.' using errcode = '22023';
  end if;

  return v_n;
end;
$function$;

-- public.registrar_baja
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.registrar_baja(p_almacen_id bigint, p_articulo_id bigint, p_cantidad numeric, p_causa text, p_motivo text, p_destino text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_existencia numeric;
  v_costo      numeric;
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

  v_existencia := private.existencia_para_escribir(p_almacen_id, p_articulo_id);

  if p_cantidad > v_existencia then
    select nombre into v_articulo from public.articulos where id = p_articulo_id;
    raise exception 'De "%" solo hay % en existencia y se intentan dar de baja %.',
      coalesce(v_articulo, p_articulo_id::text), private.cantidad_es(v_existencia), private.cantidad_es(p_cantidad)
      using errcode = '22023';
  end if;

  -- Al costo promedio, como toda salida: lo que se pierde vale lo que valia
  -- mientras estaba.
  v_costo := private.costo_promedio(p_almacen_id, p_articulo_id);

  v_id := private.registrar_movimiento(
    'SALIDA_BAJA', -1, p_almacen_id, p_articulo_id, p_cantidad, v_costo,
    btrim(p_motivo), null, null, null, p_fecha, null, null);

  insert into public.inventario_bajas (movimiento_id, causa, destino, solicitada_por)
  values (v_id, p_causa, nullif(btrim(coalesce(p_destino, '')), ''), (select auth.uid()));

  return v_id;
end;
$function$;

-- public.registrar_entradas
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.registrar_entradas(p_almacen_id bigint, p_renglones jsonb, p_motivo text, p_referencia text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c_factor constant numeric := 10;
  v_r jsonb; v_n int := 0; v_articulo bigint; v_cantidad numeric; v_costo numeric;
  v_moneda text; v_costo_usd numeric; v_tasa numeric; v_tasa_usd numeric;
  v_nota text; v_nombre text; v_ref numeric; v_veces numeric; v_msg text;
  v_pres numeric; v_sueltas numeric; v_por_pres numeric; v_unidad_pres text;
  v_nombre_pres text;
begin
  perform private.exigir_rol('ALMACEN');

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'No hay nada que meter: la entrada no trae renglones.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Una entrada sin explicación no se puede auditar después. Escribe de dónde vino.'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'Ese almacén no existe o está inactivo.' using errcode = '23503';
  end if;

  /*
    Un almacen que admite material sin costo lleva su promedio aparte, y ese es
    el motivo de que exista. Meterle material con precio por esta puerta lo
    contamina igual que sacarlo por la otra.
  */
  if exists (select 1 from public.almacenes
              where id = p_almacen_id and coalesce(admite_sin_costo, false)) then
    raise exception 'En «%» solo entra material que esta empresa no pagó, y por eso lleva su costo aparte.'
      , (select nombre from public.almacenes where id = p_almacen_id)
      using errcode = '22023',
            hint = 'Para meter ahí, usa «Cargar combustible al tanque» marcando «no costó nada para esta empresa». Lo que sí costó va a otro almacén.';
  end if;

  v_nota := btrim(p_motivo);
  if nullif(btrim(coalesce(p_referencia, '')), '') is not null then
    v_nota := v_nota || ' · Ref.: ' || btrim(p_referencia);
  end if;

  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_n := v_n + 1;
    v_veces := null;

    v_articulo := nullif(btrim(coalesce(v_r->>'articulo_id', '')), '')::bigint;
    v_sueltas  := coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0);
    v_pres     := coalesce(nullif(btrim(coalesce(v_r->>'presentaciones', '')), '')::numeric, 0);
    v_costo    := coalesce(nullif(btrim(coalesce(v_r->>'costo', '')), '')::numeric, 0);
    v_moneda   := upper(coalesce(nullif(btrim(coalesce(v_r->>'moneda', '')), ''), 'USD'));

    select nombre, presentacion, unidades_por_presentacion
      into v_nombre, v_unidad_pres, v_por_pres
      from public.articulos where id = v_articulo and activo;
    if v_nombre is null then
      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n using errcode = '23503';
    end if;

    /*
      SIETE TAMBORES Y DIEZ LITROS. La cuenta la hace la base y no el navegador,
      que es lo que pidio Christopher: «asi el sistema tiene nocion en todo
      momento sobre lo que hay o no hay en sus presentaciones».
    */
    -- En que presentacion se conto este renglon. Nula: la de por defecto.
    v_nombre_pres := nullif(btrim(coalesce(v_r->>'presentacion', '')), '');
    v_cantidad := private.en_unidad_base(v_articulo, v_pres, v_sueltas, v_nombre_pres);

    if v_cantidad <= 0 then
      raise exception 'El renglón % (%): la cantidad tiene que ser mayor que cero.', v_n, v_nombre using errcode = '22023';
    end if;
    if v_costo <= 0 then
      raise exception 'El renglón % (%): hay que decir cuánto costó la unidad. Si de verdad no costó nada, eso no es una entrada: es un ajuste de conteo, y ahí se valora como el resto del almacén.', v_n, v_nombre using errcode = '22023';
    end if;

    /*
      EL COSTO LLEVA SU PROPIA UNIDAD, que no tiene por que ser la misma que la
      cantidad. Alguien cuenta en tambores y conoce el precio por litro, o al
      reves. Sin `costo_por_presentacion` se entiende por unidad de operacion,
      que es como se ha llamado siempre a esta funcion.

      Se DIVIDE, al reves que la cantidad: el precio del bulto repartido entre
      lo que trae.
    */
    if coalesce((v_r->>'costo_por_presentacion')::boolean, false) then
      -- El divisor sale de la MISMA presentacion que nombro el renglon, no de
      -- la de por defecto: si no, «3 BIDON a 130 el bidon» divide entre 208.
      declare v_factor numeric := private.en_unidad_base(v_articulo, 1, 0, v_nombre_pres);
      begin
        if coalesce(v_factor, 0) <= 0 then
          raise exception 'El renglón % (%): no se puede dar el costo por presentación porque el catálogo no dice cuántas unidades trae.', v_n, v_nombre
            using errcode = '22023';
        end if;
        v_costo := v_costo / v_factor;
      end;
    end if;

    select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
      from private.tasas_del_dia(v_moneda, coalesce(p_fecha, current_date)) t;
    if v_tasa is null or coalesce(v_tasa_usd, 0) = 0 then
      raise exception 'El renglón % (%): no hay tasa cargada para % en esa fecha, así que no se puede saber cuánto costó.', v_n, v_nombre, v_moneda using errcode = '22023';
    end if;

    v_costo_usd := round(v_costo * v_tasa / v_tasa_usd, 6);

    /*
      EL AVISO DEL COSTO RARO, RENGLON A RENGLON. La confirmacion viaja EN EL
      RENGLON: con quince renglones, un unico «confirmo» aceptaria a ciegas los
      catorce que nadie miro.
    */
    v_ref := private.costo_promedio(p_almacen_id, v_articulo);

    /*
      LA PRIMERA VEZ NO HAY CONTRA QUE COMPARAR, Y ES CUANDO MAS DUELE.

      La reja de abajo compara el costo nuevo con el promedio que el articulo ya
      tenia. En su primera entrada ese promedio no existe, asi que la reja calla
      — y es justo la entrada que fijo los 868 millones el 5 de septiembre: los
      cinco aceites entraban por primera vez.

      No hay numero contra el que medir, asi que no se puede avisar de que algo
      esta mal. Lo que si se puede es DECIR QUE NADIE LO ESTA COMPROBANDO, y
      pedir que alguien mire antes de que ese costo se convierta en la
      referencia de todo lo que venga despues.

      Se pide una sola vez por articulo y almacen. A partir del segundo
      movimiento hay promedio y manda la reja de las diez veces.
    */
    if coalesce(v_ref, 0) = 0
       and not coalesce((v_r->>'confirmado')::boolean, false) then
      raise exception 'El renglón % (%): es la primera vez que entra a este almacén, así que no hay con qué comparar el costo. Serán % % a % cada una. Compruébalo con la factura y acéptalo.',
        v_n, v_nombre, private.numero_es(v_cantidad, 2),
        (select unidad from public.articulos where id = v_articulo),
        private.numero_es(v_costo, 4)
        using errcode = '22023',
              hint = 'Este costo se convierte en la referencia de todo lo que entre después. Un cero de más aquí no lo va a corregir nadie.';
    end if;

    if coalesce(v_ref, 0) > 0 then
      v_veces := round(v_costo_usd / v_ref, 6);
      if v_veces >= c_factor or v_veces <= (1 / c_factor) then
        if not coalesce((v_r->>'confirmado')::boolean, false) then
          v_msg := case when private.puede_accion('INVENTARIO.VER_VALORACION')
            then format('El renglón %s (%s): viene costando %s por unidad y lo estás metiendo a %s: son %s. Si es correcto, acéptalo y quedará anotado.',
                        v_n, v_nombre, private.numero_es(v_ref, 4),
                        private.numero_es(v_costo_usd, 4), case when v_veces >= 1 then private.numero_es(v_veces, 2) || ' veces mas'
                   else private.numero_es(v_ref / nullif(v_costo_usd, 0), 2) || ' veces menos' end)
            else format('El renglón %s (%s): ese costo se sale mucho de lo que el artículo viene costando. Compruébalo con la factura; si es correcto, acéptalo y quedará anotado.',
                        v_n, v_nombre)
          end;
          raise exception '%', v_msg
            using errcode = '22023',
                  hint = 'Comprueba la factura y la moneda antes de aceptar: un cero de más aquí se arrastra a cada salida.';
        end if;
      else
        v_veces := null;
      end if;
    end if;

    perform private.registrar_movimiento(
      'ENTRADA_DIRECTA', 1::smallint, p_almacen_id, v_articulo, v_cantidad, v_costo_usd,
      case when v_moneda = 'USD' then v_nota
           else v_nota || ' · Costo declarado: ' || v_costo || ' ' || v_moneda end,
      null, null, null, p_fecha, null, null,
      p_aviso_costo => v_veces,
      p_cantidad_capturada => nullif(v_pres, 0),
      p_unidad_capturada => case when v_pres > 0 then private.presentacion_usada(v_articulo, v_nombre_pres) end,
      p_suelto_capturado => case when v_pres > 0 then nullif(v_sueltas, 0) end);
  end loop;

  return v_n;
end;
$function$;

-- public.registrar_factura_compra
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.registrar_factura_compra(p_proveedor_id bigint, p_numero_factura text, p_fecha_emision date, p_exento numeric DEFAULT 0, p_base_imponible numeric DEFAULT 0, p_iva numeric DEFAULT 0, p_moneda character DEFAULT 'VES'::bpchar, p_numero_control text DEFAULT NULL::text, p_orden_id bigint DEFAULT NULL::bigint, p_condicion_pago text DEFAULT 'CONTADO'::text, p_alicuota_iva numeric DEFAULT 16, p_retencion_iva numeric DEFAULT 0, p_retencion_islr numeric DEFAULT 0, p_total_del_papel numeric DEFAULT NULL::numeric, p_observacion text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_prov  record;
  v_tasas record;
  v_dias  smallint;
  v_total numeric;
  v_id    bigint;
begin
  perform private.exigir_permiso('COMPRAS', 'ESCRITURA');

  select * into v_prov from public.proveedores where id = p_proveedor_id;

  if v_prov.id is null then
    raise exception 'No existe el proveedor %.', p_proveedor_id using errcode = 'P0002';
  end if;

  -- Una factura contra nada no se puede cuadrar después.
  if p_orden_id is null then
    raise exception 'Una factura va contra una orden de compra: es la que dice qué se compró y a qué precio. Si esta compra no tiene orden, créala primero y registra la factura desde ahí.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.ordenes_compra
     where id = p_orden_id and proveedor_id = p_proveedor_id
  ) then
    raise exception 'Esa orden no es de %. Una factura solo se ata a una orden del mismo proveedor.',
      v_prov.nombre using errcode = '22023';
  end if;

  if length(trim(coalesce(p_numero_factura, ''))) = 0 then
    raise exception 'La factura necesita su número, que es el que trae impreso.' using errcode = '22023';
  end if;

  if p_fecha_emision > current_date then
    raise exception 'No se registra una factura con fecha futura.' using errcode = '22023';
  end if;

  v_total := round(coalesce(p_exento, 0) + coalesce(p_base_imponible, 0) + coalesce(p_iva, 0), 2);

  if v_total <= 0 then
    raise exception 'La factura suma cero. Revisa el exento, la base imponible y el IVA.'
      using errcode = '22023';
  end if;

  -- Si quien registra tecleó también el total del papel, tiene que coincidir.
  -- Cuando no coincide, o el papel está mal o el tecleo está mal, y las dos
  -- cosas se ven mejor ahora que en la declaración.
  if p_total_del_papel is not null and abs(p_total_del_papel - v_total) > 0.01 then
    raise exception 'El papel dice % y lo tecleado suma %. Revisa el exento (%), la base (%) y el IVA (%).',
      private.numero_es(p_total_del_papel, 2), private.numero_es(v_total, 2), private.numero_es(coalesce(p_exento, 0), 2),
      private.numero_es(coalesce(p_base_imponible, 0), 2), private.numero_es(coalesce(p_iva, 0), 2) using errcode = '22023';
  end if;

  if coalesce(p_retencion_iva, 0) > coalesce(p_iva, 0) then
    raise exception 'No se puede retener más IVA (%) del que trae la factura (%).',
      private.numero_es(p_retencion_iva, 2), private.numero_es(p_iva, 2) using errcode = '22023';
  end if;

  v_dias := case coalesce(p_condicion_pago, 'CONTADO')
              when 'CREDITO_15' then 15
              when 'CREDITO_30' then 30
              when 'CREDITO_60' then 60
              else 0
            end;

  select * into v_tasas from private.tasas_del_dia(p_moneda, p_fecha_emision);

  insert into public.facturas_compra
    (proveedor_id, orden_id, numero_factura, numero_control, fecha_emision, fecha_recepcion,
     condicion_pago, dias_credito, vence_el, moneda, tasa, tasa_usd,
     exento, base_imponible, alicuota_iva, iva, retencion_iva, retencion_islr, total,
     observacion, registrada_por)
  values
    (p_proveedor_id, p_orden_id, trim(p_numero_factura),
     nullif(trim(coalesce(p_numero_control, '')), ''), p_fecha_emision, current_date,
     coalesce(p_condicion_pago, 'CONTADO'), v_dias, p_fecha_emision + v_dias,
     p_moneda, v_tasas.tasa, v_tasas.tasa_usd,
     coalesce(p_exento, 0), coalesce(p_base_imponible, 0), coalesce(p_alicuota_iva, 16),
     coalesce(p_iva, 0), coalesce(p_retencion_iva, 0), coalesce(p_retencion_islr, 0), v_total,
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;

exception
  when unique_violation then
    raise exception 'La factura % de "%" ya está registrada. Registrarla dos veces descuenta dos veces el mismo crédito fiscal.',
      trim(p_numero_factura), v_prov.nombre using errcode = '23505';
end;
$function$;

-- public.registrar_lectura
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.registrar_lectura(p_maquina_id bigint, p_fecha date, p_inicial numeric, p_final numeric)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_maq record; v_fecha date := coalesce(p_fecha, current_date);
  v_previo numeric; v_previo_dia date; v_siguiente numeric; v_sig_dia date; v_id bigint;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
  select * into v_maq from public.maquinaria where id = p_maquina_id;
  if v_maq.id is null then
    raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
  end if;
  if p_inicial is null or p_final is null then
    raise exception 'Hacen falta las dos lecturas del reloj: la de arrancar y la de terminar.' using errcode = '23514';
  end if;
  if p_inicial < 0 or p_final < 0 then
    raise exception 'Un horómetro no marca números negativos.' using errcode = '22023';
  end if;
  if p_final < p_inicial then
    raise exception 'El horómetro no retrocede: el final (%) no puede ser menor que el inicial (%).', private.cantidad_es(p_final), private.cantidad_es(p_inicial) using errcode = '22023';
  end if;
  if v_fecha > current_date then
    raise exception 'No se anota una jornada que todavía no ocurrió.' using errcode = '22023';
  end if;

  select final, fecha into v_previo, v_previo_dia from public.horometro_lecturas
   where maquina_id = p_maquina_id and fecha < v_fecha order by fecha desc limit 1;
  select inicial, fecha into v_siguiente, v_sig_dia from public.horometro_lecturas
   where maquina_id = p_maquina_id and fecha > v_fecha order by fecha asc limit 1;

  if v_previo is not null and p_inicial < v_previo then
    raise exception 'El horómetro no retrocede. La lectura del % terminó en %, así que la del % no puede arrancar en %.',
      to_char(v_previo_dia,'DD/MM/YYYY'), private.cantidad_es(v_previo), to_char(v_fecha,'DD/MM/YYYY'), private.cantidad_es(p_inicial)
      using errcode='22023', hint='Si a la máquina le cambiaron el reloj, eso no se anota aquí: se corrige la ficha.';
  end if;
  if v_siguiente is not null and p_final > v_siguiente then
    raise exception 'La lectura del % arranca en %, así que la del % no puede terminar en %.',
      to_char(v_sig_dia,'DD/MM/YYYY'), private.cantidad_es(v_siguiente), to_char(v_fecha,'DD/MM/YYYY'), private.cantidad_es(p_final)
      using errcode='22023', hint='Estás corrigiendo un día pasado y el número se pasa del día siguiente.';
  end if;

  insert into public.horometro_lecturas (maquina_id, fecha, inicial, final, creada_por)
  values (p_maquina_id, v_fecha, p_inicial, p_final, (select auth.uid()))
  on conflict (maquina_id, fecha) do update
    set inicial=excluded.inicial, final=excluded.final, creada_por=excluded.creada_por
  returning id into v_id;

  if v_previo is not null and p_inicial > v_previo then
    perform private.notificar('MAQUINARIA','HOROMETRO_NO_ARRASTRA',
      format('El horómetro de %s tiene horas sin anotar', v_maq.nombre),
      format('La lectura del %s terminó en %s y la del %s arranca en %s: faltan %s horas por registrar.',
             to_char(v_previo_dia,'DD/MM/YYYY'), private.cantidad_es(v_previo), to_char(v_fecha,'DD/MM/YYYY'), private.cantidad_es(p_inicial),
             private.numero_es(p_inicial - v_previo, 2)),
      '/app/maquinaria', array['OPERACIONES'], 'ATENCION');
  end if;
  return v_id;
end;
$function$;

-- public.registrar_pago
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.registrar_pago(p_instruccion_id bigint, p_cuenta_id bigint, p_referencia text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_i         record;
  v_cuenta    record;
  v_o_estado  text;
  v_faltan    numeric;
  v_orden     text;
  v_prov      text;
  v_a_quien   text;
begin
  perform private.exigir_rol('COMPRAS');

  select * into v_i from public.instrucciones_pago where id = p_instruccion_id;

  if v_i.id is null then
    raise exception 'No existe la instrucción de pago %.', p_instruccion_id using errcode = 'P0002';
  end if;

  if v_i.estado <> 'POR_PAGAR' then
    raise exception 'Esta instrucción está en "%" y no se puede volver a pagar.', v_i.estado
      using errcode = '55000';
  end if;

  if v_i.metodo <> 'EFECTIVO' and length(trim(coalesce(p_referencia, ''))) = 0 then
    raise exception 'Falta el número de referencia de la transacción.' using errcode = '22023';
  end if;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

  if v_cuenta.id is null then
    raise exception 'Indica de qué cuenta sale el dinero.' using errcode = '22023';
  end if;

  if v_cuenta.moneda <> v_i.moneda then
    raise exception 'La instrucción es por % y la cuenta "%" está en %. Elige una cuenta en % o cambia la instrucción.',
      v_i.moneda, v_cuenta.nombre, v_cuenta.moneda, v_i.moneda
      using errcode = '22023';
  end if;

  select o.numero, p.nombre into v_orden, v_prov
  from public.ordenes_compra o
  left join public.proveedores p on p.id = o.proveedor_id
  where o.id = v_i.orden_id;

  v_a_quien := coalesce(v_prov, v_i.titular, v_i.receptor);

  perform private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'PAGO', -1, v_i.monto,
    'Pago de la orden ' || coalesce(v_orden, v_i.orden_id::text),
    p_fecha, p_referencia, v_a_quien,
    v_i.id, v_i.orden_id, null, p_nota);

  if v_i.igtf_monto > 0 then
    perform private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'IGTF', -1, v_i.igtf_monto,
      'IGTF ' || private.cantidad_es(v_i.igtf_alicuota) ||
        '% de la orden ' || coalesce(v_orden, v_i.orden_id::text),
      p_fecha, p_referencia, v_a_quien,
      v_i.id, v_i.orden_id, null, null);
  end if;

  update public.instrucciones_pago
     set estado = 'PAGADA',
         referencia = nullif(trim(coalesce(p_referencia, '')), ''),
         fecha_pago = coalesce(p_fecha, current_date),
         pagada_por = (select auth.uid()),
         pagada_en = now()
   where id = p_instruccion_id;

  perform private.anotar('PAGO', p_instruccion_id, 'POR_PAGAR', 'PAGADA', p_nota);

  select o.total - coalesce(sum(
           case when i.moneda = o.moneda then i.monto
                else round(i.monto * i.tasa / nullif(o.tasa, 0), 6) end), 0)
    into v_faltan
  from public.ordenes_compra o
  left join public.instrucciones_pago i on i.orden_id = o.id and i.estado = 'PAGADA'
  where o.id = v_i.orden_id
  group by o.total;

  select estado into v_o_estado from public.ordenes_compra where id = v_i.orden_id;

  if v_faltan <= 0.01 then
    update public.ordenes_compra
       set estado = 'PAGADA_POR_RECIBIR',
           fecha_pago = coalesce(p_fecha, current_date),
           pagada_en = now()
     where id = v_i.orden_id;

    perform private.anotar('ORDEN', v_i.orden_id, v_o_estado, 'PAGADA_POR_RECIBIR');
  end if;
end;
$function$;
