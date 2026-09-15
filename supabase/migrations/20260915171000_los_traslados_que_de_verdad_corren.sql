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

-- private.registrar_movimiento(p_tipo text, p_signo integer, p_almacen bigint, p_articulo bigint, p_cantidad numeric, p_costo_usd numeric, p_nota text, p_orden bigint, p_renglon bigint, p_origen bigint, p_fecha date, p_empleado bigint, p_clase text, p_nota_salida text, p_aviso_costo numeric, p_cantidad_capturada numeric, p_unidad_capturada text, p_suelto_capturado numeric, p_costo_capturado numeric, p_costo_unidad_capturada text, p_moneda_capturada text, p_propietario text)
-- venia de: 20260910390000_los_cuerpos_que_de_verdad_corren.sql
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

-- public.guardar_almacen(p_id bigint, p_codigo text, p_nombre text, p_tipo text, p_ubicacion text, p_recibe_compras boolean, p_activo boolean, p_capacidad numeric, p_trabajos_a_la_vez smallint, p_propietario text, p_responsable_id bigint)
-- venia de: 20260910240000_los_cuerpos_que_de_verdad_corren.sql
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
  -- «En camino» lo lleva el sistema: ver `traslados`.
  if p_tipo = 'TRANSITO'
     or exists (select 1 from public.almacenes where id = p_id and tipo = 'TRANSITO') then
    raise exception '«En camino» lo lleva el sistema: es donde espera lo que va de un sitio a otro, y no se crea ni se edita a mano.'
      using errcode = '22023';
  end if;

  if p_tipo not in ('PATIO', 'ALMACEN', 'TALLER', 'COMBUSTIBLE', 'TRANSITO', 'PATIO_MAQUINAS') then
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

-- public.reversar_movimiento(p_id bigint, p_motivo text)
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.reversar_movimiento(p_id bigint, p_motivo text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_mov     public.inventario_movimientos;
  v_par     public.inventario_movimientos;
  v_reverso bigint;
begin
  perform private.exigir_rol('ALMACEN');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se reversa.' using errcode = '22023';
  end if;

  select * into v_mov from public.inventario_movimientos where id = p_id;

  if v_mov.id is null then
    raise exception 'No existe el movimiento %.', p_id using errcode = 'P0002';
  end if;

  if v_mov.tipo = 'REVERSO' then
    raise exception 'Un reverso no se reversa. Registra el movimiento que corresponda.'
      using errcode = '22023';
  end if;

  if v_mov.tipo = 'AJUSTE_COSTO' then
    raise exception 'Una corrección de costo no se deshace: se vuelve a corregir.'
      using errcode = '22023',
            hint = 'Entra en Existencias, busca la fila y usa «Corregir el costo» con el valor bueno. Quedan los dos pasos escritos, que es lo que hace falta para entender qué pasó.';
  end if;

  /*
    LO DE UN TRASLADO CON NÚMERO NO SE REVERSA SUELTO.

    Sus asientos cuelgan de un documento con estado. Reversar uno dejaría el
    traslado diciendo «recibido» con el material de vuelta en el origen, o un
    hueco en «En camino». Se cancela desde el traslado, que escribe su propia
    vuelta; y lo recibido se devuelve con un traslado de vuelta.
  */
  if exists (select 1 from public.traslados t
              where v_mov.id in (t.mov_salida, t.mov_en_camino, t.mov_llegada, t.mov_vuelta))
     or exists (select 1 from public.almacenes a
                 where a.id = v_mov.almacen_id and a.tipo = 'TRANSITO') then
    raise exception 'El movimiento % es de un traslado con número propio: no se reversa suelto.', v_mov.numero
      using errcode = '55000',
            hint = 'Si todavía no se recibió, cancélalo en Transferencias. Si ya se recibió, pide un traslado de vuelta.';
  end if;

  perform private.exigir_no_reversado(v_mov.id, v_mov.numero);

  -- La otra pata, cuando esto es un traslado.
  if v_mov.tipo = 'TRANSFERENCIA_SALIDA' then
    select * into v_par from public.inventario_movimientos
     where movimiento_origen = v_mov.id and tipo = 'TRANSFERENCIA_ENTRADA';
  elsif v_mov.tipo = 'TRANSFERENCIA_ENTRADA' then
    select * into v_par from public.inventario_movimientos
     where id = v_mov.movimiento_origen and tipo = 'TRANSFERENCIA_SALIDA';
  end if;

  if v_par.id is not null then
    perform private.exigir_no_reversado(v_par.id, v_par.numero);
  end if;

  -- Primero se comprueban las dos, y solo después se escribe cualquiera de las
  -- dos: dejar media pareja reversada sería peor que no dejar reversar.
  perform private.exigir_existencia_para_reverso(v_mov, p_id);
  if v_par.id is not null then
    perform private.exigir_existencia_para_reverso(v_par, p_id);
  end if;

  v_reverso := private.registrar_movimiento(
    'REVERSO', (-v_mov.signo)::smallint, v_mov.almacen_id, v_mov.articulo_id,
    v_mov.cantidad, v_mov.costo_usd,
    format('Reverso de %s. %s', v_mov.numero, p_motivo),
    v_mov.orden_id, v_mov.orden_renglon_id, v_mov.id, null);

  if v_par.id is not null then
    perform private.registrar_movimiento(
      'REVERSO', (-v_par.signo)::smallint, v_par.almacen_id, v_par.articulo_id,
      v_par.cantidad, v_par.costo_usd,
      format('Reverso de %s, la otra mitad del traslado %s. %s',
             v_par.numero, v_mov.numero, p_motivo),
      v_par.orden_id, v_par.orden_renglon_id, v_par.id, null);
  end if;

  return v_reverso;
end;
$function$;
