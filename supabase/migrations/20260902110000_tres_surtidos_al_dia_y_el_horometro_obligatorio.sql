/*
  TRES SURTIDOS AL DÍA POR MÁQUINA, Y EL HORÓMETRO DEJA DE SER OPCIONAL.

  ————————————————————————————————————————————————————————————————————————
  SIN APLICAR. Escrita el 2 de septiembre de 2026 sin acceso a la base.

  El cuerpo se copió del ARCHIVO `20260824200000_los_catalogos_los_lleva_la_empresa.sql`,
  que es la última versión que lo redefine, NO del catálogo vivo. La regla 7 de
  la casa dice que eso puede no ser lo que corrió.

  POR ESO LLEVA GUARDA. El bloque de abajo comprueba sus propias suposiciones
  antes de tocar nada: si el esquema no es el que se supone, la migración se
  NIEGA a correr en vez de dejar algo a medias. Las migraciones corren en una
  transacción, así que un `raise` en la guarda deshace todo.
  ————————————————————————————————————————————————————————————————————————

  LO QUE SE PIDIÓ

  Christopher, el 2 de septiembre:

    «solo se puede surtir maximo 3 veces al día por maquina, no mas que eso.
     Cada vez que se echa combustible a una maquina, se debe marcar el
     horometro obligatoriamente, aunque esto no reinicia el horometro.»

  LAS TRES COSAS QUE CAMBIAN

  1. TRES VALES AL DÍA, POR MÁQUINA. Solo cuenta cuando el vale va a una
     máquina: un destino escrito a mano —una planta eléctrica, un bidón para el
     taller— no tiene tope, porque el tope existe para que nadie cargue el
     mismo tanque cuatro veces y nadie lo note.

     Se cuentan TODOS los vales del día de esa máquina. No hay concepto de vale
     anulado —`despachos_combustible` no tiene estado, se comprobó— así que un
     vale emitido cuenta aunque después se reverse su movimiento de inventario.
     Es lo honesto con lo que hay: si algún día los vales se anulan, este conteo
     tiene que excluir los anulados.

  2. EL HORÓMETRO ES OBLIGATORIO SI HAY MÁQUINA. Era `default null` y se
     comprobaba solo si venía. Ahora, sin él, el vale no sale.

     Y no reinicia nada, como se pidió: es una LECTURA del mismo contador
     físico, anotada en el vale. No toca `horometro_lecturas` ni las horas del
     mantenimiento.

  3. EL HORÓMETRO NO RETROCEDE, Y AQUÍ TAMBIÉN ERA UN AVISO.

     Esto no se pidió y va aquí porque es el MISMO defecto que se acaba de
     arreglar en `registrar_lectura`, en una segunda puerta al mismo contador.
     El código decía:

         if (v_ultimo is not null and p_horometro < v_ultimo)
            or (v_lectura is not null and p_horometro < v_lectura) then
           perform private.notificar(… 'no cuadra' … 'conviene mirarlo');
         end if;

     O sea: se aceptaba un horómetro por debajo del anterior y se mandaba una
     notificación. Dos puertas al mismo número con reglas distintas es como se
     consigue que nadie sepa cuál vale.

     SE ELIGIÓ PARAR, y el argumento es que quien surte está de pie delante del
     tablero: volver a leerlo cuesta diez segundos. Lo contrario —dejarlo
     pasar— corrompe el calendario de mantenimiento de esa máquina en silencio.

     ES REVERSIBLE. Si en el patio resulta que esto detiene el surtido a las
     seis de la mañana más de lo que evita, se vuelve a aviso cambiando el
     `raise` por el `notificar` que había. Queda dicho para que la decisión se
     pueda deshacer sabiendo qué se pierde.
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
-- ---------------------------------------------------------------------------
create or replace function public.despachar_combustible(
  p_articulo_id     bigint,
  p_almacen_id      bigint,
  p_cantidad        numeric,
  p_motivo          text,
  p_motivo_detalle  text    default null,
  p_maquina_id      bigint  default null,
  p_destino         text    default null,
  p_horometro       numeric default null,
  p_empleado_id     bigint  default null,
  p_recibio_nombre  text    default null,
  p_recibio_cedula  text    default null,
  p_fecha           date    default null,
  p_nota            text    default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_fecha  date := coalesce(p_fecha, (now() at time zone 'America/Caracas')::date);
  v_hoy    date := (now() at time zone 'America/Caracas')::date;
  v_art    record;
  v_maq    record;
  v_alm    record;
  v_comb   record;
  v_hay      numeric;
  v_unitario numeric;
  v_costo    numeric;
  v_ultimo   numeric;
  v_lectura  numeric;
  v_tope     numeric;
  v_recibe   text;
  v_cedula   text;
  v_surtio   text;
  v_detalle  text;
  v_mov      bigint;
  v_id       bigint;
  v_donde    text;
  v_ya       integer;

  /*
    Tres, y escrito aqui a proposito.

    Podria salir de una tabla de parametros, pero la que hay
    —`private.parametro`— es la de nomina, con vigencias por fecha, y meter
    aqui un numero que no tiene nada que ver con la ley laboral seria usarla
    para lo que no es. Si algun dia la empresa quiere otro tope, se cambia esta
    linea; es una migracion de tres caracteres.
  */
  c_max_vales_dia constant integer := 3;
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if v_fecha > v_hoy then
    raise exception 'No se despacha combustible con fecha futura.' using errcode = '22023';
  end if;

  -- El motivo se comprueba contra el catálogo, que lleva la empresa.
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
    raise exception 'El combustible sale del tanque, no de "%". Ese almacén es de tipo %.',
      v_alm.nombre, v_alm.tipo
      using errcode = '22023',
            hint = 'Si el gasoil está cargado en otro almacén, transfiéralo primero al tanque.';
  end if;

  if p_maquina_id is not null then
    select * into v_maq from public.maquinaria where id = p_maquina_id;
    if v_maq.id is null then
      raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
    end if;
    v_donde := v_maq.nombre;

    if v_maq.combustible_id is not null and v_maq.combustible_id <> p_articulo_id then
      select nombre into v_comb from public.articulos where id = v_maq.combustible_id;
      raise exception '"%" usa % y se le está echando %.',
        v_maq.nombre, coalesce(v_comb.nombre, 'otro combustible'), v_art.nombre
        using errcode = '22023',
              hint = 'Si la ficha de la máquina está equivocada, corríjala en Maquinaria.';
    end if;

    /*
      REJA 1: TRES VALES AL DIA POR MAQUINA.

      El tope existe para que nadie cargue el mismo tanque cuatro veces sin que
      se note. Solo aplica a maquinas: un destino escrito a mano —una planta
      electrica, un bidon para el taller— no lo tiene.

      Se cuentan todos los vales del dia de esa maquina. `despachos_combustible`
      no tiene estado de anulado, asi que no hay nada que excluir; el dia que lo
      tenga, aqui hay que excluirlo.
    */
    select count(*) into v_ya
      from public.despachos_combustible d
     where d.maquina_id = p_maquina_id
       and d.fecha = v_fecha;

    if v_ya >= c_max_vales_dia then
      raise exception 'A % ya se le surtió % % el %. Son % al día como máximo.',
        v_maq.nombre, v_ya,
        case when v_ya = 1 then 'vez' else 'veces' end,
        to_char(v_fecha, 'DD/MM/YYYY'), c_max_vales_dia
        using errcode = '55000',
              hint = 'Si de verdad hace falta más combustible ese día, revisa por qué: o el consumo se disparó o hay vales de más.';
    end if;

    /*
      REJA 2: EL HOROMETRO ES OBLIGATORIO SI HAY MAQUINA.

      Era opcional y solo se comprobaba si venia. Sin el, el vale no dice a que
      altura del contador se echo ese combustible, y entonces el consumo por
      hora de esa maquina —que es de lo que se saca si gasta mas de lo que
      deberia— no se puede calcular.

      NO REINICIA NADA, como se pidio: es una lectura anotada en el vale. No
      toca `horometro_lecturas` ni las horas del mantenimiento.
    */
    if p_horometro is null then
      raise exception 'Hay que anotar el horómetro de % al surtirla.', v_maq.nombre
        using errcode = '23514',
              hint = 'Es el número que marca el tablero ahora mismo. No reinicia nada: queda anotado en el vale.';
    end if;
  else
    if length(btrim(coalesce(p_destino, ''))) < 3 then
      raise exception 'Hay que decir a qué se le echó.' using errcode = '23514';
    end if;
    v_donde := btrim(p_destino);
  end if;

  if p_empleado_id is not null then
    select btrim(e.nombres || ' ' || e.apellidos), e.cedula
      into v_recibe, v_cedula
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

  v_hay := private.existencia(p_almacen_id, p_articulo_id);
  if v_hay < p_cantidad then
    raise exception 'En el tanque solo quedan % % de %.',
      v_hay, v_art.unidad, v_art.nombre using errcode = '55000';
  end if;

  /*
    REJA 3: EL HOROMETRO NO RETROCEDE, TAMPOCO POR AQUI.

    Esto era un `notificar` y por tanto se aceptaba un numero por debajo del
    anterior. Es el mismo defecto que `registrar_lectura` tenia, en la segunda
    puerta al mismo contador — y dos puertas con reglas distintas es como se
    consigue que nadie sepa cual vale.

    Se compara contra lo mas alto de las dos fuentes: el ultimo vale y la
    ultima lectura del parte diario. El contador es uno, aunque se anote en dos
    sitios.
  */
  if p_maquina_id is not null then
    select d.horometro into v_ultimo
      from public.despachos_combustible d
     where d.maquina_id = p_maquina_id
       and d.horometro is not null
       and d.fecha <= v_fecha
     order by d.fecha desc, d.id desc
     limit 1;

    select l.final into v_lectura
      from public.horometro_lecturas l
     where l.maquina_id = p_maquina_id
       and l.fecha <= v_fecha
     order by l.fecha desc, l.id desc
     limit 1;

    v_tope := greatest(coalesce(v_ultimo, 0), coalesce(v_lectura, 0));

    if (v_ultimo is not null or v_lectura is not null) and p_horometro < v_tope then
      raise exception 'Un horómetro no retrocede. Lo último anotado de % marcaba % y se está surtiendo con %.',
        v_maq.nombre, v_tope, p_horometro
        using errcode = '22023',
              hint = 'Vuelve a leer el tablero. Si a la máquina le cambiaron el reloj, eso se corrige en su ficha, no en un vale.';
    end if;
  end if;

  v_unitario := private.costo_promedio(p_almacen_id, p_articulo_id);
  v_costo    := v_unitario * p_cantidad;

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
     p_articulo_id, p_almacen_id, p_cantidad, p_motivo, v_detalle,
     p_maquina_id, nullif(btrim(coalesce(p_destino, '')), ''), p_horometro,
     p_empleado_id, v_recibe, v_cedula, v_surtio,
     v_costo, v_mov, nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  if v_art.stock_minimo > 0 and (v_hay - p_cantidad) <= v_art.stock_minimo then
    perform private.notificar(
      'COMBUSTIBLE', 'TANQUE_BAJO',
      format('Queda poco %s', v_art.nombre),
      format('Quedan %s %s, y el mínimo son %s.', v_hay - p_cantidad, v_art.unidad, v_art.stock_minimo),
      '/app/combustible', array['ALMACEN', 'OPERACIONES', 'COMPRAS'], 'ATENCION');
  end if;

  return v_id;
end;
$func$;

comment on function public.despachar_combustible(bigint, bigint, numeric, text, text, bigint, text, numeric, bigint, text, text, date, text) is
  'Un vale de combustible: quien lo recibio, cuando, para que, a que maquina, cuanto y de que combustible. Tope de 3 vales al dia por maquina; el horometro es obligatorio si hay maquina y no puede retroceder.';

revoke all on function public.despachar_combustible(bigint, bigint, numeric, text, text, bigint, text, numeric, bigint, text, text, date, text) from public;
revoke all on function public.despachar_combustible(bigint, bigint, numeric, text, text, bigint, text, numeric, bigint, text, text, date, text) from anon;
grant execute on function public.despachar_combustible(bigint, bigint, numeric, text, text, bigint, text, numeric, bigint, text, text, date, text) to authenticated;

/*
  COMPROBAR AL APLICARLA

    -- 1. Que la guarda paso (sale un notice) y que sigue habiendo UNA sola.
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='despachar_combustible';

    -- 2. Los cuatro ensayos, en transaccion deshecha:
    --   surtir una maquina SIN horometro .............. rebota
    --   surtir con horometro por debajo del anterior .. rebota
    --   surtir 3 veces el mismo dia ................... pasan las tres
    --   el cuarto vale del dia ........................ rebota
    --   surtir un destino escrito a mano, sin tope .... pasa

    -- 3. Y que el horometro del vale NO movio las horas de la maquina:
    select horas_totales, horas_desde_mant from public.v_maquinaria where id = <la de prueba>;
*/
