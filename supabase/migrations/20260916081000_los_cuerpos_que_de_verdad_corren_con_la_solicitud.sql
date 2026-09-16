/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  5 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
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
  viva —no normalizado, no perdonando comentarios— y los 5 coinciden. Y el
  detector, que antes marcaba estas 5, pasa a cero.

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

-- public.aceptar_traslado(p_id bigint)
-- venia de: 20260915170000_el_traslado_pasa_por_solicitud_aceptada_y_recibida.sql
CREATE OR REPLACE FUNCTION public.aceptar_traslado(p_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_t       public.traslados;
  v_origen  public.almacenes;
  v_destino public.almacenes;
  v_como    text;
  v_camino  bigint;
  v_mov     record;
  v_articulo text;
  v_hoy     date := private.hoy_aqui();
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;

  select * into v_t from public.traslados where id = p_id for update;
  if v_t.id is null then
    raise exception 'No existe el traslado %.', p_id using errcode = 'P0002';
  end if;
  if v_t.estado <> 'SOLICITUD' then
    raise exception 'El traslado % ya no espera que lo acepten: %.', v_t.numero,
      case v_t.estado when 'ACEPTADA' then 'ya va de camino'
                      when 'RECIBIDA' then 'ya se recibió'
                      else 'está cancelado' end
      using errcode = '55000';
  end if;

  select * into v_origen  from public.almacenes where id = v_t.origen_id;
  select * into v_destino from public.almacenes where id = v_t.destino_id;

  v_como := private.como_actua_en(v_t.origen_id);
  if v_como is null then
    raise exception 'El traslado % lo acepta quien responde por "%"%, o administración.',
      v_t.numero, v_origen.nombre, private.quien_responde_frase(v_t.origen_id)
      using errcode = '42501';
  end if;

  if not v_destino.activo then
    raise exception 'El almacén "%" está inactivo y no puede recibir material: cancela el traslado.', v_destino.nombre
      using errcode = '22023';
  end if;

  v_camino := private.sitio_en_camino();
  if v_camino is null then
    raise exception 'Falta el sitio «En camino», donde espera lo que va de un sitio a otro.' using errcode = 'P0002';
  end if;

  select nombre into v_articulo from public.articulos where id = v_t.articulo_id;

  select * into v_mov from private.mover_en_traslado(
    p_de => v_t.origen_id, p_a => v_camino, p_articulo => v_t.articulo_id,
    p_cantidad => v_t.cantidad, p_dueno => v_t.propietario,
    p_nota_sale  => format('Traslado %s a %s: sale y va de camino. %s', v_t.numero, v_destino.nombre, v_t.motivo),
    p_nota_entra => format('Traslado %s de %s a %s: va de camino. %s', v_t.numero, v_origen.nombre, v_destino.nombre, v_t.motivo),
    p_fecha => v_hoy,
    p_presentaciones => v_t.presentaciones, p_presentacion => v_t.presentacion, p_suelto => v_t.suelto);

  update public.traslados
     set estado = 'ACEPTADA',
         aceptado_por = (select auth.uid()), aceptado_en = now(),
         aceptado_de_respaldo = (v_como = 'RESPALDO'),
         mov_salida = v_mov.salida, mov_en_camino = v_mov.entrada
   where id = p_id;

  perform private.notificar(
    'INVENTARIO', 'TRASLADO_ACEPTADO',
    format('%s: %s va de camino a %s', v_t.numero, v_articulo, v_destino.nombre),
    format('Salió de %s. Lo recibe quien responde por %s.', v_origen.nombre, v_destino.nombre),
    '/app/salidas/traslados', array['ALMACEN', 'GERENTE_GENERAL'], 'ATENCION');

  return p_id;
end;
$function$;

-- public.cancelar_traslado(p_id bigint, p_motivo text)
-- venia de: 20260915170000_el_traslado_pasa_por_solicitud_aceptada_y_recibida.sql
CREATE OR REPLACE FUNCTION public.cancelar_traslado(p_id bigint, p_motivo text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_t          public.traslados;
  v_origen     public.almacenes;
  v_destino    public.almacenes;
  v_en_origen  text;
  v_en_destino text;
  v_costo      numeric;
  v_mov        record;
  v_vuelta     bigint;
  v_motivo     text := btrim(coalesce(p_motivo, ''));
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;
  if length(v_motivo) < 4 then
    raise exception 'Escribe por qué se cancela.' using errcode = '22023';
  end if;

  select * into v_t from public.traslados where id = p_id for update;
  if v_t.id is null then
    raise exception 'No existe el traslado %.', p_id using errcode = 'P0002';
  end if;
  if v_t.estado = 'RECIBIDA' then
    raise exception 'El traslado % ya se recibió y no se cancela.', v_t.numero
      using errcode = '55000',
            hint = 'Si hace falta devolver el material, se pide un traslado de vuelta.';
  end if;
  if v_t.estado = 'CANCELADA' then
    raise exception 'El traslado % ya está cancelado.', v_t.numero using errcode = '55000';
  end if;

  select * into v_origen  from public.almacenes where id = v_t.origen_id;
  select * into v_destino from public.almacenes where id = v_t.destino_id;
  v_en_origen  := private.como_actua_en(v_t.origen_id);
  v_en_destino := private.como_actua_en(v_t.destino_id);

  if v_t.estado = 'SOLICITUD' then
    if not (v_t.solicitado_por = (select auth.uid()) or v_en_origen is not null or v_en_destino is not null) then
      raise exception 'La solicitud % la cancela quien la pidió, quien responde por "%" o por "%", o administración.',
        v_t.numero, v_origen.nombre, v_destino.nombre
        using errcode = '42501';
    end if;
  else
    -- Aceptada: el material ya salió, y cancelar es devolverlo al origen.
    if v_en_origen is null and v_en_destino is null then
      raise exception 'El traslado % ya salió: lo cancela quien responde por "%" o por "%", o administración.',
        v_t.numero, v_origen.nombre, v_destino.nombre
        using errcode = '42501';
    end if;

    select costo_usd into v_costo from public.inventario_movimientos where id = v_t.mov_salida;

    select * into v_mov from private.mover_en_traslado(
      p_de => (select almacen_id from public.inventario_movimientos where id = v_t.mov_en_camino),
      p_a => v_t.origen_id, p_articulo => v_t.articulo_id,
      p_cantidad => v_t.cantidad, p_dueno => v_t.propietario,
      p_nota_sale  => format('Traslado %s cancelado: vuelve a %s. %s', v_t.numero, v_origen.nombre, v_motivo),
      p_nota_entra => format('Traslado %s cancelado: vuelve de camino a %s. %s', v_t.numero, v_destino.nombre, v_motivo),
      p_costo => v_costo, p_costo_fijo => true,
      p_origen => v_t.mov_en_camino, p_fecha => private.hoy_aqui(),
      p_presentaciones => v_t.presentaciones, p_presentacion => v_t.presentacion, p_suelto => v_t.suelto);
    v_vuelta := v_mov.entrada;
  end if;

  update public.traslados
     set estado = 'CANCELADA',
         cancelado_por = (select auth.uid()), cancelado_en = now(),
         motivo_cancelacion = v_motivo,
         mov_vuelta = v_vuelta
   where id = p_id;

  perform private.notificar(
    'INVENTARIO', 'TRASLADO_CANCELADO',
    format('%s cancelado', v_t.numero),
    case when v_t.estado = 'ACEPTADA'
         then format('Iba de %s a %s y vuelve a %s. %s', v_origen.nombre, v_destino.nombre, v_origen.nombre, v_motivo)
         else format('Pedía mover de %s a %s. %s', v_origen.nombre, v_destino.nombre, v_motivo) end,
    '/app/salidas/traslados', array['ALMACEN', 'GERENTE_GENERAL'], 'INFO');

  return p_id;
end;
$function$;

-- public.editar_articulo(p_id bigint, p_nombre text, p_categoria text, p_unidad text, p_descripcion text, p_inventariable boolean, p_stock_minimo numeric, p_modo_entrega text, p_reparable boolean, p_presentacion text, p_unidades_por_presentacion numeric, p_marca text, p_numero_parte text, p_confirmado boolean, p_densidad_ton_m3 numeric)
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.editar_articulo(p_id bigint, p_nombre text, p_categoria text, p_unidad text, p_descripcion text DEFAULT NULL::text, p_inventariable boolean DEFAULT true, p_stock_minimo numeric DEFAULT 0, p_modo_entrega text DEFAULT NULL::text, p_reparable boolean DEFAULT NULL::boolean, p_presentacion text DEFAULT NULL::text, p_unidades_por_presentacion numeric DEFAULT NULL::numeric, p_marca text DEFAULT NULL::text, p_numero_parte text DEFAULT NULL::text, p_confirmado boolean DEFAULT false, p_densidad_ton_m3 numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_existe boolean;
  v_pres   text := nullif(trim(coalesce(p_presentacion, '')), '');
  v_igual  record;
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');

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
    densidad_ton_m3 = coalesce(p_densidad_ton_m3, densidad_ton_m3),
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

-- public.recibir_traslado(p_id bigint)
-- venia de: 20260915170000_el_traslado_pasa_por_solicitud_aceptada_y_recibida.sql
CREATE OR REPLACE FUNCTION public.recibir_traslado(p_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_t       public.traslados;
  v_origen  public.almacenes;
  v_destino public.almacenes;
  v_como    text;
  v_costo   numeric;
  v_mov     record;
  v_articulo text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;

  select * into v_t from public.traslados where id = p_id for update;
  if v_t.id is null then
    raise exception 'No existe el traslado %.', p_id using errcode = 'P0002';
  end if;
  if v_t.estado <> 'ACEPTADA' then
    raise exception 'El traslado % no está de camino: %.', v_t.numero,
      case v_t.estado when 'SOLICITUD' then 'todavía nadie lo ha aceptado'
                      when 'RECIBIDA' then 'ya se recibió'
                      else 'está cancelado' end
      using errcode = '55000';
  end if;

  select * into v_origen  from public.almacenes where id = v_t.origen_id;
  select * into v_destino from public.almacenes where id = v_t.destino_id;

  v_como := private.como_actua_en(v_t.destino_id);
  if v_como is null then
    raise exception 'El traslado % lo recibe quien responde por "%"%, o administración.',
      v_t.numero, v_destino.nombre, private.quien_responde_frase(v_t.destino_id)
      using errcode = '42501';
  end if;

  if not v_destino.activo then
    raise exception 'El almacén "%" está inactivo y no puede recibir material: cancela el traslado y vuelve al origen.', v_destino.nombre
      using errcode = '22023';
  end if;

  -- Entra al costo con el que salió, no al promedio de «En camino».
  select costo_usd into v_costo from public.inventario_movimientos where id = v_t.mov_salida;
  select nombre into v_articulo from public.articulos where id = v_t.articulo_id;

  select * into v_mov from private.mover_en_traslado(
    p_de => (select almacen_id from public.inventario_movimientos where id = v_t.mov_en_camino),
    p_a => v_t.destino_id, p_articulo => v_t.articulo_id,
    p_cantidad => v_t.cantidad, p_dueno => v_t.propietario,
    p_nota_sale  => format('Traslado %s: llega a %s. %s', v_t.numero, v_destino.nombre, v_t.motivo),
    p_nota_entra => format('Traslado %s desde %s. %s', v_t.numero, v_origen.nombre, v_t.motivo),
    p_costo => v_costo, p_costo_fijo => true,
    p_origen => v_t.mov_en_camino, p_fecha => private.hoy_aqui(),
    p_presentaciones => v_t.presentaciones, p_presentacion => v_t.presentacion, p_suelto => v_t.suelto);

  update public.traslados
     set estado = 'RECIBIDA',
         recibido_por = (select auth.uid()), recibido_en = now(),
         recibido_de_respaldo = (v_como = 'RESPALDO'),
         mov_llegada = v_mov.entrada
   where id = p_id;

  perform private.notificar(
    'INVENTARIO', 'TRASLADO_RECIBIDO',
    format('%s: %s llegó a %s', v_t.numero, v_articulo, v_destino.nombre),
    format('Salió de %s.', v_origen.nombre),
    '/app/salidas/traslados', array['ALMACEN', 'GERENTE_GENERAL'], 'INFO');

  return p_id;
end;
$function$;

-- public.solicitar_traslado(p_origen_id bigint, p_destino_id bigint, p_articulo_id bigint, p_cantidad numeric, p_motivo text, p_fecha date, p_presentaciones numeric, p_presentacion text, p_suelto numeric, p_propietario text, p_inmediato boolean)
-- venia de: 20260916051000_los_cuerpos_que_de_verdad_corren_con_el_modulo.sql
CREATE OR REPLACE FUNCTION public.solicitar_traslado(p_origen_id bigint, p_destino_id bigint, p_articulo_id bigint, p_cantidad numeric, p_motivo text, p_fecha date DEFAULT NULL::date, p_presentaciones numeric DEFAULT NULL::numeric, p_presentacion text DEFAULT NULL::text, p_suelto numeric DEFAULT NULL::numeric, p_propietario text DEFAULT NULL::text, p_inmediato boolean DEFAULT false)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_origen     public.almacenes;
  v_destino    public.almacenes;
  v_articulo   public.articulos;
  v_cantidad   numeric;
  v_pres       text;
  v_dueno      text;
  v_duenos     text[];
  v_hay        numeric;
  v_fecha      date;
  v_numero     text;
  v_id         bigint;
  v_en_origen  text;
  v_en_destino text;
  v_mov        record;
  v_motivo     text := btrim(coalesce(p_motivo, ''));
begin
  perform private.exigir_permiso('SALIDAS', 'ESCRITURA');

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
  if 'TRANSITO' in (v_origen.tipo, v_destino.tipo) then
    raise exception '«En camino» no se elige: es donde espera lo que ya salió y todavía no llegó.'
      using errcode = '22023';
  end if;
  if not v_destino.activo then
    raise exception 'El almacén "%" está inactivo y no puede recibir material.', v_destino.nombre
      using errcode = '22023';
  end if;

  select * into v_articulo from public.articulos where id = p_articulo_id;
  if v_articulo.id is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

  -- La cuenta en envases la hace el mismo ayudante que la entrada y la salida.
  if nullif(btrim(coalesce(p_presentacion, '')), '') is not null and coalesce(p_presentaciones, 0) > 0 then
    v_cantidad := private.en_unidad_base(p_articulo_id, p_presentaciones, coalesce(p_suelto, 0), p_presentacion);
    v_pres := upper(btrim(p_presentacion));
  else
    v_cantidad := p_cantidad;
  end if;

  if coalesce(v_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.' using errcode = '22023';
  end if;
  if length(v_motivo) < 4 then
    raise exception 'Escribe por qué se mueve. Un traslado sin motivo no se puede auditar.'
      using errcode = '22023';
  end if;

  v_fecha := coalesce(p_fecha, private.hoy_aqui());
  if v_fecha > private.hoy_aqui() then
    raise exception 'La fecha del traslado no puede ser del futuro.' using errcode = '22023';
  end if;

  -- Las dos rejas del tanque sin costo, las mismas que en el traslado en el acto.
  if coalesce(v_origen.admite_sin_costo, false) and not coalesce(v_destino.admite_sin_costo, false) then
    raise exception 'De "%" no se puede trasladar a "%": lo que hay ahí entró sin costo y hundiría el costo promedio del destino.',
      v_origen.nombre, v_destino.nombre using errcode = '22023';
  end if;
  if not coalesce(v_origen.admite_sin_costo, false) and coalesce(v_destino.admite_sin_costo, false) then
    raise exception 'A "%" solo entra lo que no costó nada, y lo que sale de "%" tiene precio.',
      v_destino.nombre, v_origen.nombre using errcode = '22023';
  end if;
  -- Y una más: por «En camino» se mezclaría con material que sí costó.
  if coalesce(v_origen.admite_sin_costo, false) and not coalesce(p_inmediato, false) then
    raise exception 'Lo que hay en "%" entró sin costo: se traslada en el acto, sin pasar por «En camino».',
      v_origen.nombre
      using errcode = '22023',
            hint = 'Marca «Hacerlo ya». En «En camino» se mezclaría con material que sí costó.';
  end if;

  -- De quién es lo que se mueve: con un solo dueño en el origen no se pregunta.
  v_dueno := nullif(upper(btrim(coalesce(p_propietario, ''))), '');
  if v_dueno is null then
    select array_agg(distinct t.propietario) into v_duenos
      from (select m.propietario
              from public.inventario_movimientos m
             where m.almacen_id = p_origen_id and m.articulo_id = p_articulo_id
             group by m.propietario
            having sum(m.cantidad * m.signo) > 0) t;

    if coalesce(array_length(v_duenos, 1), 0) > 1 then
      raise exception 'En "%" hay material de varios dueños (%): hay que decir de cual se traslada.',
        v_origen.nombre, array_to_string(v_duenos, ', ')
        using errcode = '22023';
    end if;
    v_dueno := coalesce(v_duenos[1], v_origen.propietario, 'LACANTERA');
  end if;

  v_hay := private.existencia_para_escribir(p_origen_id, p_articulo_id, v_dueno);
  if v_cantidad > v_hay then
    raise exception 'En "%" solo hay % de "%" de ese dueño y se intentan mover %.',
      v_origen.nombre, private.numero_es(v_hay, 4), v_articulo.nombre, private.numero_es(v_cantidad, 4)
      using errcode = '22023';
  end if;

  if coalesce(p_inmediato, false) then
    v_en_origen  := private.como_actua_en(p_origen_id);
    v_en_destino := private.como_actua_en(p_destino_id);
    if v_en_origen is null or v_en_destino is null then
      raise exception 'Hacerlo ya es aceptar en "%" y recibir en "%" a la vez: lo puede quien responde por los dos sitios, o administración.',
        v_origen.nombre, v_destino.nombre
        using errcode = '42501',
              hint = 'Pide el traslado sin marcar «Hacerlo ya», y que lo acepte y lo reciba quien responde por cada sitio.';
    end if;
  end if;

  v_numero := private.siguiente_numero('TRA');

  insert into public.traslados
    (numero, inmediato, fecha, origen_id, destino_id, articulo_id, cantidad,
     presentaciones, presentacion, suelto, propietario, motivo, solicitado_por)
  values
    (v_numero, coalesce(p_inmediato, false), v_fecha, p_origen_id, p_destino_id, p_articulo_id, v_cantidad,
     case when v_pres is not null then p_presentaciones end, v_pres,
     case when v_pres is not null then nullif(p_suelto, 0) end,
     v_dueno, v_motivo, (select auth.uid()))
  returning id into v_id;

  if coalesce(p_inmediato, false) then
    select * into v_mov from private.mover_en_traslado(
      p_de => p_origen_id, p_a => p_destino_id, p_articulo => p_articulo_id,
      p_cantidad => v_cantidad, p_dueno => v_dueno,
      p_nota_sale  => format('Traslado %s a %s. %s', v_numero, v_destino.nombre, v_motivo),
      p_nota_entra => format('Traslado %s desde %s. %s', v_numero, v_origen.nombre, v_motivo),
      p_fecha => v_fecha,
      p_presentaciones => p_presentaciones, p_presentacion => v_pres, p_suelto => p_suelto);

    update public.traslados
       set estado = 'RECIBIDA',
           aceptado_por = (select auth.uid()), aceptado_en = now(),
           aceptado_de_respaldo = (v_en_origen = 'RESPALDO'),
           recibido_por = (select auth.uid()), recibido_en = now(),
           recibido_de_respaldo = (v_en_destino = 'RESPALDO'),
           mov_salida = v_mov.salida, mov_llegada = v_mov.entrada
     where id = v_id;
  else
    perform private.notificar(
      'INVENTARIO', 'TRASLADO_SOLICITADO',
      format('%s: piden mover %s a %s', v_numero, v_articulo.nombre, v_destino.nombre),
      format('%s %s desde %s. Lo acepta quien responde por %s.',
             private.numero_es(v_cantidad, 4), v_articulo.unidad, v_origen.nombre, v_origen.nombre),
      '/app/salidas/traslados', array['ALMACEN', 'GERENTE_GENERAL'], 'ATENCION');
  end if;

  return v_id;
end;
$function$;
