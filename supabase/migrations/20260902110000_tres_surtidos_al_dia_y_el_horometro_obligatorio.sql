/*
  TRES SURTIDOS AL DÍA POR MÁQUINA, Y EL HORÓMETRO DEJA DE SER OPCIONAL.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 2 de septiembre de 2026, por MCP, y PROBADA en transacción
  deshecha: sin horómetro rebota, retroceder rebota, el cuarto vale del día
  rebota, y un destino escrito a mano sigue sin pedir ninguna de las tres.
  ————————————————————————————————————————————————————————————————————————

  ESTE ARCHIVO SE REESCRIBIÓ ANTES DE APLICARLO, Y ESA ES LA LECCIÓN

  La primera versión se escribió sin acceso a la base, copiando el cuerpo del
  ARCHIVO `20260824200000_los_catalogos_los_lleva_la_empresa.sql`. Al volver el
  MCP se comparó contra el catálogo vivo —lo que manda la regla 7— y el archivo
  NO era lo que corría. Le faltaban dos cosas que sí estaban en la base:

      private.existencia_para_escribir   →  el archivo usaba `private.existencia`,
                                            que es justo la carrera que la regla 8
                                            prohíbe: lee sin cerrojo y entre la
                                            lectura y el INSERT cabe otra
                                            transacción entera.

      capacidad_combustible              →  el archivo no traía la reja que impide
                                            despachar más litros de los que le
                                            caben al tanque de la máquina.

  Aplicarlo habría REVERTIDO las dos, en silencio y sin que nadie lo notara
  hasta cuadrar un mes. Así que el cuerpo de abajo es el vivo —sacado de
  `pg_get_functiondef`— con los tres cambios encima, y no el del archivo viejo.

  LAS TRES COSAS QUE CAMBIAN

  1. TRES VALES AL DÍA, POR MÁQUINA. Solo cuando el vale va a una máquina: un
     destino escrito a mano —una planta eléctrica, un bidón para el taller— no
     tiene tope, porque el tope existe para que nadie cargue el mismo tanque
     cuatro veces sin que se note.

     Se cuentan TODOS los del día. `despachos_combustible` no tiene estado —se
     comprobó— así que un vale emitido cuenta aunque después se reverse su
     movimiento. Si algún día los vales se anulan, este conteo tiene que
     excluir los anulados.

  2. EL HORÓMETRO ES OBLIGATORIO SI HAY MÁQUINA. Era `default null`. Sin él, el
     vale no dice a qué altura del contador se echó ese combustible, y el
     consumo por hora —que es de lo que se saca si una máquina gasta de más— no
     se puede calcular. NO REINICIA NADA: es una lectura anotada en el vale.

     El argumento que había en contra sigue valiendo y se respeta: un generador
     de emergencia puede no llevar horómetro. Pero eso no es una máquina de la
     ficha — va por `p_destino`, y ahí no se pide.

     QUEDA UN CASO SIN RESOLVER, y se dice para que no sorprenda: una máquina
     con el reloj roto ya no se puede surtir. Si eso existe en el patio, hace
     falta una marca en su ficha —«no lleva horómetro»— que la exima. No se
     inventó sin preguntar.

  3. EL HORÓMETRO NO RETROCEDE, Y ESTO ERA UN AVISO. Se guardaba igual y
     después salía una notificación que alguien tenía que leer y corregir a
     mano, con el número ya escrito. `registrar_lectura` ya rechaza desde hoy;
     dos puertas al mismo contador con reglas distintas es como se consigue que
     nadie sepa cuál vale.

     REVERSIBLE A PROPÓSITO: si en el patio detiene más surtidos de los que
     evita, se vuelve a `private.notificar` cambiando ese bloque y nada más.
*/


-- ---------------------------------------------------------------------------
-- La guarda: si el esquema no es el que se supone, esto no corre.
-- ---------------------------------------------------------------------------
do $guarda$
declare
  v_faltan text := '';
begin
  -- Las columnas que se van a leer para contar y para comparar.
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='despachos_combustible'
                    and column_name='maquina_id') then
    v_faltan := v_faltan || ' despachos_combustible.maquina_id';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='despachos_combustible'
                    and column_name='horometro') then
    v_faltan := v_faltan || ' despachos_combustible.horometro';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='horometro_lecturas'
                    and column_name='final') then
    v_faltan := v_faltan || ' horometro_lecturas.final';
  end if;

  -- Los ayudantes que el cuerpo llama. Si alguno cambió de nombre, mejor
  -- enterarse aqui que en el primer vale.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='motivo_del_vale') then
    v_faltan := v_faltan || ' private.motivo_del_vale';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='costo_promedio') then
    v_faltan := v_faltan || ' private.costo_promedio';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='registrar_movimiento') then
    v_faltan := v_faltan || ' private.registrar_movimiento';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='existencia') then
    v_faltan := v_faltan || ' private.existencia';
  end if;

  -- Y que exista UNA sola `despachar_combustible` con la firma que se
  -- reemplaza. Si hay otra, `create or replace` crearia una segunda y
  -- PostgREST elegiria por los argumentos que le manden — que es como se
  -- consigue que la reja este puesta y no se aplique.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='despachar_combustible') <> 1 then
    v_faltan := v_faltan || ' (despachar_combustible no es unica)';
  end if;

  if v_faltan <> '' then
    raise exception 'La base no es la que esta migracion supone. Falta o cambio:%', v_faltan
      using hint = 'Comprueba el catalogo y ajusta la migracion antes de aplicarla. No la fuerces.';
  end if;

  raise notice 'guarda: el esquema es el esperado';
end $guarda$;

-- ---------------------------------------------------------------------------
-- La función, con las tres rejas nuevas
--
-- OJO: el cuerpo de abajo es el que SE APLICÓ, y es el que devuelve
-- `pg_get_functiondef` hoy. Se sacó del catálogo vivo, no de un archivo.
-- ---------------------------------------------------------------------------

create or replace function public.despachar_combustible(
  p_articulo_id bigint, p_almacen_id bigint, p_cantidad numeric, p_motivo text,
  p_motivo_detalle text default null, p_maquina_id bigint default null,
  p_destino text default null, p_horometro numeric default null,
  p_empleado_id bigint default null, p_recibio_nombre text default null,
  p_recibio_cedula text default null, p_fecha date default null, p_nota text default null
) returns bigint language plpgsql security definer set search_path to ''
as $function$
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
    raise exception 'En el tanque solo quedan % % de %.', v_hay, v_art.unidad, v_art.nombre
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
      format('Quedan %s %s, y el mínimo son %s.', v_hay - p_cantidad, v_art.unidad, v_art.stock_minimo),
      '/app/combustible', array['ALMACEN', 'OPERACIONES', 'COMPRAS'], 'ATENCION');
  end if;

  return v_id;
end;
$function$;
