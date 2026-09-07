/*
  UN COSTO QUE SE SALE DE LO NORMAL AVISA, DEJA PASAR, Y QUEDA MARCADO.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 7 de septiembre de 2026, por MCP, y probada en transacción
  deshecha con dos usuarios distintos. Los cuerpos que se reemplazan se sacaron
  de `pg_get_functiondef`, no de un archivo — regla 7.

  Este archivo se reescribió DESPUÉS de aplicar, copiando lo que quedó vivo. La
  primera versión no funcionaba, y lo que la tumbó está contado abajo.
  ————————————————————————————————————————————————————————————————————————

  DE DÓNDE VIENE

  El 5 de septiembre entraron cinco aceites con el costo mal transcrito y el
  inventario pasó a valer 868.927.307 dólares: un litro de aceite de motor a
  1.209.012,48. Jesmary lo notó mirando la columna «Valor» y preguntó por qué el
  sistema le enseñaba ese número.

  El sistema no falló en la aritmética: guardó lo que recibió. Lo que no hizo fue
  dudar. `registrar_entradas` rechazaba un costo menor o igual a cero y no tenía
  ningún techo, así que un millón de dólares por litro pasaba igual que dos.

  POR QUÉ AVISA Y NO IMPIDE

  Lo pidió Christopher así, y tiene razón: un precio puede multiplicarse por diez
  de verdad. Una pieza importada, una moneda que se disparó, un artículo que
  antes entraba en bolívares y ahora en dólares. Una reja que se equivoca enseña
  a ignorarla, y una que impide obliga a buscar la puerta de atrás.

    sin confirmar → rebota, diciendo lo que se pueda decir
    confirmando   → entra, y el movimiento queda marcado con el factor

  Esa marca es la mitad del valor de esto. Dentro de un año, cuadrando el mes,
  «×20» al lado de un movimiento dice que alguien vio el aviso y decidió que
  estaba bien. Guarda el FACTOR y no un sí/no: «se avisó» no distingue una
  subida real de un cero de más; «×366» sí.

  LO QUE NO PROTEGE, Y HAY QUE DECIRLO

  **La primera entrada de un artículo no tiene contra qué compararse.** Los cinco
  aceites del 5 de septiembre entraban por primera vez, así que esta reja NO los
  habría parado. Lo que sí los habría parado es la cuenta hecha debajo de cada
  renglón mientras se teclea, y eso va en la pantalla. Las dos se complementan y
  ninguna sustituye a la otra.

  TRES COSAS QUE SOLO SALIERON AL EJECUTAR

  1. EL LIBRO ES INMUTABLE. La primera versión insertaba y luego hacía
     `update … set aviso_costo`. `trg_movimientos_inmutables` lo rechazó: «El
     libro de inventario no se modifica ni se borra». Un dato del movimiento
     tiene que nacer con el movimiento, así que la marca viaja como parámetro de
     `private.registrar_movimiento` — que es el único sitio donde se inserta.

  2. AÑADIR UN PARÁMETRO CREA UNA FUNCIÓN NUEVA, NO REEMPLAZA LA VIEJA.
     `create or replace` con una firma distinta dejó DOS `registrar_entrada` y
     todas las llamadas empezaron a fallar con «is not unique». Hay que soltar la
     firma vieja a mano. Lo mismo con `registrar_movimiento`.

  3. EL SERVIDOR FORMATEA LOS NÚMEROS EN INGLÉS. `lc_numeric` es `en_US.UTF-8`,
     así que `to_char(6074.64, 'FM999G999G990D0000')` devuelve «6,074.6400» — que
     un venezolano lee como seis coma cero setenta y cuatro, justo en el mensaje
     que existe para que alguien compare dos cifras. De ahí sale
     `private.numero_es`.

     **Esto es más ancho que esta migración**: cualquier mensaje del sistema que
     use los códigos G y D tiene el mismo defecto. Queda anotado.

  EL MENSAJE NO DICE LO QUE ESA PERSONA NO PUEDE VER

  `v_existencias` esconde el costo promedio a quien no tiene
  `INVENTARIO.VER_VALORACION`, y **el rol ALMACEN —justo quien registra las
  entradas— NO lo tiene** (comprobado en `rol_acciones`). Un mensaje que dijera
  «viene costando 6.074,64» le entregaría por la puerta de atrás el dato que la
  vista le niega. Y decir solo el factor tampoco vale: sabe lo que tecleó, así
  que dividiendo llega al mismo sitio.

  Así que a quien no puede ver el costo se le dice QUE se sale, no CUÁNTO. Sigue
  siendo accionable: comprueba la factura.

  Efecto secundario que hay que decidir aparte: el aviso que la pantalla adelanta
  mientras se teclea tampoco le puede salir a ALMACEN, porque necesita el mismo
  dato. Para ese rol la red es el mensaje de la base al guardar. Si se quiere que
  la persona que teclea los costos pueda verlos, eso es una decisión de permisos.

  EL FACTOR DIEZ

  Es el número que puso Christopher como ejemplo («precio x10»). Vale en los dos
  sentidos: diez veces más caro y diez veces más barato. Un costo que se desploma
  esconde tanto como uno que se dispara — es justo lo que pasaba con el gasoil
  sin costo, que hundía el promedio veintiuna veces.

  El material sin costo queda fuera de la comparación a propósito: entra a cero
  por diseño y compararlo sería avisar de lo que ya se decidió.
*/

do $guarda$
declare v_faltan text := '';
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'private' and p.proname = 'costo_promedio') then
    v_faltan := v_faltan || ' private.costo_promedio';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'private' and p.proname = 'puede_accion') then
    v_faltan := v_faltan || ' private.puede_accion';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.inventario_movimientos'::regclass
                    and tgname = 'trg_movimientos_inmutables') then
    v_faltan := v_faltan || ' (el libro ya no es inmutable: repasar por que la marca va en el insert)';
  end if;
  if v_faltan <> '' then
    raise exception 'La base no es la que esta migracion supone. Falta o cambio:%', v_faltan;
  end if;
end $guarda$;

-- ---------------------------------------------------------------------------
-- La marca
-- ---------------------------------------------------------------------------
alter table public.inventario_movimientos
  add column if not exists aviso_costo numeric;

comment on column public.inventario_movimientos.aviso_costo is
  'Cuantas veces se salio el costo de esta entrada respecto al promedio que el articulo ya tenia, cuando alguien acepto el aviso y la guardo igual. Mayor que 1 es mas caro, menor que 1 mas barato. Nulo es lo normal.';

-- ---------------------------------------------------------------------------
-- Un numero escrito como se escribe aqui
-- ---------------------------------------------------------------------------
create or replace function private.numero_es(p_valor numeric, p_decimales integer default 2)
returns text language sql immutable set search_path to ''
as $function$
  /*
    1.234,56 y no 1,234.56.

    `to_char` con los codigos G y D usa los separadores del `lc_numeric` del
    servidor, y aqui es `en_US.UTF-8`. Se comprobo ejecutando:
    `to_char(6074.64, 'FM999G999G990D0000')` devuelve «6,074.6400».

    Se formatea con los separadores ingleses y se intercambian al final, que es
    mas corto y mas seguro que cambiar el locale de la sesion.
  */
  select translate(
           to_char(p_valor, 'FM999G999G999G990' ||
                   case when p_decimales > 0 then 'D' || repeat('0', p_decimales) else '' end),
           ',.', '.,');
$function$;

comment on function private.numero_es(numeric, integer) is
  'Un numero con separadores venezolanos (1.234,56). El lc_numeric del servidor es en_US, asi que to_char con G y D sale al reves.';

-- ---------------------------------------------------------------------------
-- El unico sitio donde se inserta en el libro, ahora acepta la marca
-- ---------------------------------------------------------------------------
create or replace function private.registrar_movimiento(
  p_tipo text, p_signo integer, p_almacen bigint, p_articulo bigint,
  p_cantidad numeric, p_costo_usd numeric, p_nota text default null,
  p_orden bigint default null, p_renglon bigint default null, p_origen bigint default null,
  p_fecha date default null, p_empleado bigint default null, p_clase text default null,
  p_nota_salida text default null, p_aviso_costo numeric default null
) returns bigint language plpgsql security definer set search_path to ''
as $function$
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

  -- Solo al entrar, y solo donde hay un tope declarado. Sacar nunca desborda.
  if p_signo = 1 then
    select capacidad, nombre into v_capacidad, v_nombre from public.almacenes where id = p_almacen;
    if v_capacidad is not null then
      -- El cerrojo va sobre el ALMACEN, con clave 0 en el segundo hueco, porque
      -- lo que se lee es el almacen entero y no un articulo.
      perform pg_catalog.pg_advisory_xact_lock(p_almacen::int, 0);
      select coalesce(sum(m.cantidad * m.signo), 0) into v_hay
        from public.inventario_movimientos m
       where m.almacen_id = p_almacen and m.unidad = v_unidad;
      if v_hay + p_cantidad > v_capacidad then
        raise exception 'En "%" caben % % y ya hay %: no entran % más.',
          v_nombre, v_capacidad, v_unidad, v_hay, p_cantidad
          using errcode = '22023', hint = format('Quedan %s libres.', v_capacidad - v_hay);
      end if;
    end if;
  end if;

  /*
    `aviso_costo` se escribe AQUI y no despues con un update, porque el libro es
    inmutable: `trg_movimientos_inmutables` rechaza UPDATE y DELETE. Se intento
    al reves y la prueba lo cazo. Un dato del movimiento nace con el movimiento.
  */
  insert into public.inventario_movimientos
    (numero, fecha, tipo, signo, almacen_id, articulo_id, cantidad, unidad,
     costo_usd, orden_id, orden_renglon_id, movimiento_origen, nota, empleado_id,
     entrega_clase, registrado_por, nota_salida, aviso_costo)
  values
    (private.siguiente_numero('MOV'), coalesce(p_fecha, current_date), p_tipo, p_signo,
     p_almacen, p_articulo, p_cantidad, v_unidad, coalesce(p_costo_usd, 0),
     p_orden, p_renglon, p_origen, nullif(trim(coalesce(p_nota, '')), ''), p_empleado,
     p_clase, (select auth.uid()), p_nota_salida, p_aviso_costo)
  returning id into v_id;

  return v_id;
end;
$function$;

-- Fuera la firma vieja, o las llamadas de once argumentos quedan ambiguas.
drop function if exists private.registrar_movimiento(
  text, integer, bigint, bigint, numeric, numeric, text, bigint, bigint, bigint,
  date, bigint, text, text);

-- Y fuera el duplicado que crea anadir `p_confirmado`.
drop function if exists public.registrar_entrada(
  bigint, bigint, numeric, numeric, text, text, date, boolean);

-- ---------------------------------------------------------------------------
-- La entrada de a una
-- ---------------------------------------------------------------------------
create or replace function public.registrar_entrada(
  p_almacen_id bigint, p_articulo_id bigint, p_cantidad numeric, p_costo_usd numeric,
  p_motivo text, p_referencia text default null, p_fecha date default null,
  p_sin_costo boolean default false, p_confirmado boolean default false
) returns bigint language plpgsql security definer set search_path to ''
as $function$
declare
  c_factor constant numeric := 10;
  v_nota text; v_admite boolean; v_ref numeric; v_veces numeric; v_nombre text; v_msg text;
begin
  perform private.exigir_rol('ALMACEN');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad que entra tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  select a.admite_sin_costo into v_admite from public.almacenes a where a.id = p_almacen_id;

  if p_sin_costo then
    if not coalesce(v_admite, false) then
      raise exception 'Aquí no entra material sin costo: se hundiría el costo promedio de lo que ya hay.'
        using errcode = '22023', hint = 'Mételo en el tanque de combustible inicial, que es el que lo lleva aparte.';
    end if;
    if coalesce(p_costo_usd, 0) <> 0 then
      raise exception 'Si el material no costó nada para esta empresa, el costo tiene que ir en cero. Quita la marca o pon el costo en cero.'
        using errcode = '22023';
    end if;
    if length(btrim(coalesce(p_motivo, ''))) < 15 then
      raise exception 'Una entrada sin costo hay que explicarla entera: de dónde vino y quién asumió el gasto. Dentro de un año esa nota es lo único que lo va a contestar.'
        using errcode = '22023';
    end if;
  elsif coalesce(v_admite, false) then
    raise exception 'Aquí solo entra lo que no costó nada. Lo que tiene precio va al tanque de siempre.'
      using errcode = '22023';
  elsif coalesce(p_costo_usd, 0) <= 0 then
    raise exception 'Hay que decir cuánto costó la unidad. Si el gasto lo asumió otra empresa del grupo, marca «no costó nada para esta empresa» y explica de dónde vino.'
      using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Una entrada sin explicación no se puede auditar después. Escribe de dónde vino.'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'Ese almacén no existe o está inactivo.' using errcode = '23503';
  end if;
  if not exists (select 1 from public.articulos where id = p_articulo_id and activo) then
    raise exception 'Ese artículo no existe o está inactivo.' using errcode = '23503';
  end if;

  /*
    EL AVISO. Solo cuando hay un promedio anterior contra el que comparar: en la
    primera entrada de un articulo no hay referencia y esto no protege. Ese caso
    lo cubre la pantalla, ensenando la cuenta hecha mientras se teclea — y es el
    de los cinco aceites del 5 de septiembre, que entraban por primera vez.

    EL MENSAJE NO DICE LO QUE ESA PERSONA NO PUEDE VER. El rol ALMACEN, que es
    quien registra las entradas, no tiene INVENTARIO.VER_VALORACION. Decirle
    «viene costando 6.074,64» le daria por la puerta de atras lo que la vista le
    niega; y decirle solo el factor tampoco vale, porque sabe lo que tecleo.
  */
  if not p_sin_costo and coalesce(p_costo_usd, 0) > 0 then
    v_ref := private.costo_promedio(p_almacen_id, p_articulo_id);
    if coalesce(v_ref, 0) > 0 then
      v_veces := round(p_costo_usd / v_ref, 2);
      if v_veces >= c_factor or v_veces <= (1 / c_factor) then
        if not p_confirmado then
          select nombre into v_nombre from public.articulos where id = p_articulo_id;
          v_msg := case when private.puede_accion('INVENTARIO.VER_VALORACION')
            then format('%s viene costando %s por unidad y lo estás metiendo a %s: son %s veces. Si es correcto, acéptalo y quedará anotado.',
                        v_nombre, private.numero_es(v_ref, 4),
                        private.numero_es(p_costo_usd, 4), private.numero_es(v_veces, 2))
            else format('El costo de %s se sale mucho de lo que ese artículo viene costando. Compruébalo con la factura; si es correcto, acéptalo y quedará anotado.',
                        v_nombre)
          end;
          raise exception '%', v_msg
            using errcode = '22023',
                  hint = 'Comprueba la factura y la moneda antes de aceptar: un cero de más aquí se arrastra a cada salida.';
        end if;
      else
        v_veces := null;
      end if;
    end if;
  end if;

  v_nota := btrim(p_motivo);
  if nullif(btrim(coalesce(p_referencia, '')), '') is not null then
    v_nota := v_nota || ' · Ref.: ' || btrim(p_referencia);
  end if;
  if p_sin_costo then
    v_nota := v_nota || ' · Sin costo para esta empresa: el gasto lo asumió otra.';
  end if;

  return private.registrar_movimiento(
    'ENTRADA_DIRECTA', 1::smallint, p_almacen_id, p_articulo_id, p_cantidad,
    coalesce(p_costo_usd, 0), v_nota, null, null, null, p_fecha,
    p_aviso_costo => v_veces);
end;
$function$;

-- ---------------------------------------------------------------------------
-- La entrada por lote, que es por donde entraron los cinco aceites
-- ---------------------------------------------------------------------------
create or replace function public.registrar_entradas(
  p_almacen_id bigint, p_renglones jsonb, p_motivo text,
  p_referencia text default null, p_fecha date default null
) returns integer language plpgsql security definer set search_path to ''
as $function$
declare
  c_factor constant numeric := 10;
  v_r jsonb; v_n int := 0; v_articulo bigint; v_cantidad numeric; v_costo numeric;
  v_moneda text; v_costo_usd numeric; v_tasa numeric; v_tasa_usd numeric;
  v_nota text; v_nombre text; v_ref numeric; v_veces numeric; v_msg text;
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

  v_nota := btrim(p_motivo);
  if nullif(btrim(coalesce(p_referencia, '')), '') is not null then
    v_nota := v_nota || ' · Ref.: ' || btrim(p_referencia);
  end if;

  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_n := v_n + 1;
    v_veces := null;

    v_articulo := nullif(btrim(coalesce(v_r->>'articulo_id', '')), '')::bigint;
    v_cantidad := coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0);
    v_costo    := coalesce(nullif(btrim(coalesce(v_r->>'costo', '')), '')::numeric, 0);
    v_moneda   := upper(coalesce(nullif(btrim(coalesce(v_r->>'moneda', '')), ''), 'USD'));

    -- El renglon se nombra en el error. Con quince renglones, «la cantidad tiene
    -- que ser mayor que cero» sin decir cual obliga a revisarlos todos.
    select nombre into v_nombre from public.articulos where id = v_articulo and activo;
    if v_nombre is null then
      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n using errcode = '23503';
    end if;
    if v_cantidad <= 0 then
      raise exception 'El renglón % (%): la cantidad tiene que ser mayor que cero.', v_n, v_nombre using errcode = '22023';
    end if;
    if v_costo <= 0 then
      raise exception 'El renglón % (%): hay que decir cuánto costó la unidad. Si de verdad no costó nada, eso no es una entrada: es un ajuste de conteo, y ahí se valora como el resto del almacén.', v_n, v_nombre using errcode = '22023';
    end if;

    select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
      from private.tasas_del_dia(v_moneda, coalesce(p_fecha, current_date)) t;
    if v_tasa is null or coalesce(v_tasa_usd, 0) = 0 then
      raise exception 'El renglón % (%): no hay tasa cargada para % en esa fecha, así que no se puede saber cuánto costó.', v_n, v_nombre, v_moneda using errcode = '22023';
    end if;

    -- `tasa` son bolivares por unidad de esa moneda y `tasa_usd` bolivares por
    -- dolar: el costo en dolares es el cociente. Para USD da el mismo numero.
    v_costo_usd := round(v_costo * v_tasa / v_tasa_usd, 6);

    /*
      EL AVISO, RENGLON A RENGLON. La confirmacion viaja EN EL RENGLON y no en
      la llamada entera: con quince renglones, un unico «confirmo» aceptaria a
      ciegas los catorce que nadie miro. Quien acepta, acepta uno.
    */
    v_ref := private.costo_promedio(p_almacen_id, v_articulo);
    if coalesce(v_ref, 0) > 0 then
      v_veces := round(v_costo_usd / v_ref, 2);
      if v_veces >= c_factor or v_veces <= (1 / c_factor) then
        if not coalesce((v_r->>'confirmado')::boolean, false) then
          v_msg := case when private.puede_accion('INVENTARIO.VER_VALORACION')
            then format('El renglón %s (%s): viene costando %s por unidad y lo estás metiendo a %s: son %s veces. Si es correcto, acéptalo y quedará anotado.',
                        v_n, v_nombre, private.numero_es(v_ref, 4),
                        private.numero_es(v_costo_usd, 4), private.numero_es(v_veces, 2))
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
      null, null, null, p_fecha, p_aviso_costo => v_veces);
  end loop;

  return v_n;
end;
$function$;

/*
  COMPROBADO en transaccion deshecha, el 7 de septiembre:

    ADMIN, x20 sin confirmar    rebota: «ACEITE ATF DEXRON 3 viene costando
                                6.074,6400 por unidad y lo estas metiendo a
                                121.492,8000: son 20,00 veces»
    ALMACEN, x20 sin confirmar  rebota SIN los numeros: «El costo de ACEITE ATF
                                DEXRON 3 se sale mucho de lo que ese articulo
                                viene costando»
    confirmando                 pasa, y el movimiento queda con aviso_costo = 20
    x2 normal                   pasa, aviso_costo nulo
    /20 mas barato              tambien avisa
    sin costo a CMB-INI         pasa sin aviso, como debe
    por lote x30 sin confirmar  rebota nombrando el renglon
    por lote x30 confirmando    pasa y queda marcado

  Y despues de todo: 19 movimientos, MOV-2026-0019, valor 868.927.307,04.
  Ni un dato de produccion tocado.
*/
