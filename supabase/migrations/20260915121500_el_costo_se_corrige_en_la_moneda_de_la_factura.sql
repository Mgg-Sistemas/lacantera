/*
  EL COSTO SE CORRIGE EN LA MONEDA DE LA FACTURA.

  Christopher, 15/09/2026, con la cafetera delante: «aunque quiera corregir el
  costo, no me deja cambiar la moneda». La ventana pedía el costo correcto en
  dólares y la factura estaba en bolívares: para corregir había que dividir
  entre la tasa a mano, que es justo el error que se quería deshacer. La
  cafetera entró a 39.332,15 porque ese monto se tecleó en dólares y era de
  bolívares (salud 1.31).

  LA CONVERSIÓN LA HACE LA BASE, CON LA TASA DEL DÍA DE LA FACTURA

  La misma cuenta que `registrar_entradas`: costo × tasa ÷ tasa_usd, con
  `private.tasas_del_dia`, a seis decimales. La fecha de la tasa va aparte de la
  del movimiento: la corrección se escribe hoy, pero el precio bueno es el de la
  factura, y una factura en bolívares de hace tres semanas pasada a la tasa de
  hoy da otro número sin que nada avise. Sin fecha de la tasa se usa la del
  movimiento, y sin esa, hoy.

  LO QUE SE DECLARÓ QUEDA ESCRITO

  La nota dice la cifra tecleada, la moneda y la tasa con que se convirtió, y la
  pata que entra guarda `costo_capturado` y `moneda_capturada`, dos columnas que
  hasta hoy no llenaba ninguna puerta (salud 1.31). Así una corrección se puede
  comprobar dentro de un año sin la factura delante.

  POR QUÉ SE BORRAN Y SE VUELVEN A CREAR

  Cambia la firma, y `create or replace` con parámetros nuevos no reemplaza: crea
  una segunda función con el mismo nombre, y PostgREST no sabría a cuál llamar.
  Los parámetros nuevos llevan valor por defecto, así que la pantalla publicada
  sigue funcionando igual hasta que llegue la nueva. Los permisos y el comentario
  se van con la función, y por eso se reponen aquí mismo.
*/

drop function if exists public.corregir_costo(bigint, bigint, numeric, text, date);
drop function if exists public.impacto_de_corregir_costo(bigint, bigint, numeric);

create or replace function public.corregir_costo(
  p_almacen_id bigint,
  p_articulo_id bigint,
  p_costo_correcto numeric,
  p_motivo text,
  p_fecha date default null,
  p_moneda character default 'USD',
  p_fecha_tasa date default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ex numeric; v_val numeric; v_prom numeric; v_art record; v_sitio text;
  v_nota text; v_salida bigint;
  v_moneda   text := upper(coalesce(nullif(btrim(p_moneda), ''), 'USD'));
  v_dia_tasa date := coalesce(p_fecha_tasa, p_fecha, current_date);
  v_tasa numeric; v_tasa_usd numeric; v_costo_usd numeric; v_declarado text := '';
begin
  /*
    CORREGIR EL COSTO SIN EDITAR NADA.

    El libro de inventario es inmutable: `trg_movimientos_inmutables` rechaza
    UPDATE y DELETE, y eso no se toca. Una correccion se escribe como un hecho
    nuevo, con su fecha, su motivo y su autor.

    POR QUE UN PAR Y NO UN SOLO MOVIMIENTO

    La idea evidente —un movimiento de cantidad cero que solo cambie el valor—
    NO SE PUEDE: `valor_usd` es una columna generada, `round(cantidad *
    costo_usd, 6)`. Con cantidad cero el valor es cero, siempre. Se comprobo
    mirando el catalogo antes de escribir nada.

    Asi que se hace como lo hace un libro contable de verdad: sale TODO lo que
    hay al costo equivocado y vuelve a entrar TODO al correcto. La cantidad se
    anula —sale 416 y entran 416— y el valor queda reexpresado.

        416 L salen a 1.209.012,48  ->  -502.949.191,68
        416 L entran a 3,60         ->       +1.497,60
        ----------------------------------------------
        existencia 416 L, sin cambio · promedio 3,60

    Los dos renglones quedan a la vista en el historial, que es justo lo que se
    quiere: una correccion de esta magnitud tiene que verse.

    QUIEN PUEDE

    `INVENTARIO.AJUSTAR_COSTO`, nivel TOTAL. El rol ALMACEN NO lo tiene, y es
    deliberado: «almacen no tiene interes sobre el precio o valor de las cosas,
    pero si en que sus items esten rigurosamente contados» —Christopher, 7/09/2026—.
    Esto no cambia ni una unidad contada; cambia dinero.
  */
  perform private.exigir_accion('INVENTARIO.AJUSTAR_COSTO');

  if coalesce(p_costo_correcto, -1) < 0 then
    raise exception 'El costo corregido no puede ser negativo.' using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Explica por qué se corrige, con detalle. Dentro de un año esta frase será lo único que explique por qué el inventario cambió de valor sin que entrara ni saliera nada.'
      using errcode = '22023';
  end if;

  if v_dia_tasa > current_date then
    raise exception 'La factura no puede ser de una fecha futura.' using errcode = '22023';
  end if;

  /*
    EL COSTO VIENE EN LA MONEDA DE LA FACTURA, Y AQUÍ SE PASA A DÓLARES.

    Con la tasa del día de la factura y la misma cuenta que la entrada. Si no
    hay tasa, `tasas_del_dia` para con su propio mensaje, que dice cuál falta.
  */
  select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
    from private.tasas_del_dia(v_moneda, v_dia_tasa) t;
  if v_tasa is null or coalesce(v_tasa_usd, 0) = 0 then
    raise exception 'No hay tasa de % para el %, así que no se puede saber cuánto es en dólares.',
      v_moneda, to_char(v_dia_tasa, 'DD/MM/YYYY') using errcode = 'P0002';
  end if;
  v_costo_usd := round(p_costo_correcto * v_tasa / v_tasa_usd, 6);

  -- En dólares no hay nada que aclarar. En otra moneda, la cifra del papel y la tasa.
  if v_moneda = 'VES' then
    v_declarado := format(' Declarado: %s Bs con la tasa del %s (1 USD = %s Bs).',
      private.numero_es(p_costo_correcto, 4), to_char(v_dia_tasa, 'DD/MM/YYYY'),
      private.numero_es(v_tasa_usd, 4));
  elsif v_moneda <> 'USD' then
    v_declarado := format(' Declarado: %s %s con la tasa del %s (1 %s = %s Bs; 1 USD = %s Bs).',
      private.numero_es(p_costo_correcto, 4), v_moneda, to_char(v_dia_tasa, 'DD/MM/YYYY'),
      v_moneda, private.numero_es(v_tasa, 4), private.numero_es(v_tasa_usd, 4));
  end if;

  select nombre, unidad into v_art from public.articulos where id = p_articulo_id;
  if v_art.nombre is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;
  select nombre into v_sitio from public.almacenes where id = p_almacen_id and activo;
  if v_sitio is null then
    raise exception 'Ese almacén no existe o está inactivo.' using errcode = '23503';
  end if;

  -- El cerrojo antes de leer, que es el unico orden que sirve: entre leer y
  -- escribir cabe otra transaccion entera.
  v_ex := private.existencia_para_escribir(p_almacen_id, p_articulo_id);

  if v_ex <= 0 then
    raise exception 'En "%" no queda nada de "%", así que no hay costo que corregir.', v_sitio, v_art.nombre
      using errcode = '22023',
            hint = 'El costo promedio se lleva sobre lo que hay. Si ya salió todo, lo que se cargó a esas salidas es historia y no se reexpresa.';
  end if;

  select coalesce(sum(valor_usd * signo), 0) into v_val
    from public.inventario_movimientos
   where almacen_id = p_almacen_id and articulo_id = p_articulo_id;
  v_prom := v_val / v_ex;

  if round(v_prom, 6) = v_costo_usd then
    raise exception '"%" ya viene costando % en "%": no hay nada que corregir.',
      v_art.nombre, private.numero_es(v_prom, 4), v_sitio using errcode = '22023';
  end if;

  v_nota := format('Corrección de costo: de %s a %s por %s.%s %s',
                   private.numero_es(v_prom, 4), private.numero_es(v_costo_usd, 4),
                   v_art.unidad, v_declarado, btrim(p_motivo));

  v_salida := private.registrar_movimiento(
    'AJUSTE_COSTO', -1, p_almacen_id, p_articulo_id, v_ex, v_prom,
    v_nota, null, null, null, p_fecha);

  -- La pata que entra guarda lo que se tecleó, sin convertir.
  perform private.registrar_movimiento(
    'AJUSTE_COSTO', 1, p_almacen_id, p_articulo_id, v_ex, v_costo_usd,
    v_nota, null, null, v_salida, p_fecha,
    p_costo_capturado => p_costo_correcto,
    p_moneda_capturada => v_moneda);

  perform private.notificar(
    'INVENTARIO', 'COSTO_CORREGIDO',
    format('Se corrigió el costo de %s', v_art.nombre),
    format('En %s pasó de %s a %s por %s.%s %s',
           v_sitio, private.numero_es(v_prom, 4),
           private.numero_es(v_costo_usd, 4), v_art.unidad, v_declarado, btrim(p_motivo)),
    '/app/inventario/movimientos', array['ADMIN', 'GERENTE_GENERAL'], 'ATENCION');

  return v_salida;
end;
$function$;

create or replace function public.impacto_de_corregir_costo(
  p_almacen_id bigint,
  p_articulo_id bigint,
  p_costo_correcto numeric,
  p_moneda character default 'USD',
  p_fecha_tasa date default null
)
returns json
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_ex numeric; v_val numeric; v_prom numeric;
  v_salio numeric; v_salio_val numeric; v_art record;
  v_moneda   text := upper(coalesce(nullif(btrim(p_moneda), ''), 'USD'));
  v_dia_tasa date := coalesce(p_fecha_tasa, current_date);
  v_tasa numeric; v_tasa_usd numeric; v_costo numeric;
begin
  /*
    LO QUE VA A PASAR, ANTES DE QUE PASE.

    Christopher, el 7/09/2026: «los sistemas deben ser similar a un runbook, o
    pasos secuenciales... el sistema haga mas». Asi que esto no es un numero
    suelto: es el parte entero de la operacion, para que quien corrige vea las
    tres cosas que importan y no tenga que preguntarle a nadie.

      1. Como queda el promedio.
      2. Cuanto valor se mueve en libros.
      3. LO QUE NO SE ARREGLA: lo que ya salio del almacen cargado al costo
         falso. Eso ya se le cargo a una maquina o a un centro de costo y no
         vuelve. Es la parte incomoda, y esconderla seria peor que no tener la
         herramienta.

    Y EN LA MONEDA DE LA FACTURA. Convierte con la misma cuenta y la misma tasa
    que usará `corregir_costo`, y devuelve la cifra en dólares junto a la tasa,
    para que la pantalla enseñe lo que se va a guardar antes de guardarlo.
  */
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  select nombre, unidad into v_art from public.articulos where id = p_articulo_id;
  if v_art.nombre is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

  if v_dia_tasa > current_date then
    raise exception 'La factura no puede ser de una fecha futura.' using errcode = '22023';
  end if;

  select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
    from private.tasas_del_dia(v_moneda, v_dia_tasa) t;
  if v_tasa is null or coalesce(v_tasa_usd, 0) = 0 then
    raise exception 'No hay tasa de % para el %, así que no se puede saber cuánto es en dólares.',
      v_moneda, to_char(v_dia_tasa, 'DD/MM/YYYY') using errcode = 'P0002';
  end if;
  v_costo := round(p_costo_correcto * v_tasa / v_tasa_usd, 6);

  select coalesce(sum(cantidad * signo), 0), coalesce(sum(valor_usd * signo), 0)
    into v_ex, v_val
    from public.inventario_movimientos
   where almacen_id = p_almacen_id and articulo_id = p_articulo_id;

  select coalesce(sum(cantidad), 0), coalesce(sum(valor_usd), 0)
    into v_salio, v_salio_val
    from public.inventario_movimientos
   where almacen_id = p_almacen_id and articulo_id = p_articulo_id
     and signo = -1 and tipo <> 'AJUSTE_COSTO';

  v_prom := case when v_ex > 0 then v_val / v_ex end;

  return json_build_object(
    'articulo', v_art.nombre, 'unidad', v_art.unidad,
    'existencia', v_ex, 'costo_actual', v_prom, 'valor_actual', v_val,
    'costo_correcto', v_costo,
    'costo_declarado', p_costo_correcto,
    'moneda', v_moneda,
    'tasa', v_tasa,
    'tasa_usd', v_tasa_usd,
    'fecha_tasa', v_dia_tasa,
    'valor_corregido', round(v_ex * v_costo, 6),
    'ajuste', round(v_ex * v_costo - v_val, 6),
    'ya_salio', v_salio,
    'ya_salio_cargado_a', v_salio_val,
    'ya_salio_deberia_ser', round(v_salio * v_costo, 6),
    'no_se_recupera', round(v_salio_val - v_salio * v_costo, 6));
end;
$function$;

revoke all on function public.corregir_costo(bigint, bigint, numeric, text, date, character, date) from public, anon;
grant execute on function public.corregir_costo(bigint, bigint, numeric, text, date, character, date) to authenticated, service_role;

revoke all on function public.impacto_de_corregir_costo(bigint, bigint, numeric, character, date) from public, anon;
grant execute on function public.impacto_de_corregir_costo(bigint, bigint, numeric, character, date) to authenticated, service_role;

comment on function public.corregir_costo(bigint, bigint, numeric, text, date, character, date) is
  'Reexpresa el costo promedio de un articulo en un almacen escribiendo un par de movimientos que se anulan en cantidad. No edita nada: el libro es inmutable. El costo correcto puede venir en la moneda de la factura: se convierte con la tasa del dia de la factura, la nota dice lo declarado y la pata que entra guarda lo tecleado.';

comment on function public.impacto_de_corregir_costo(bigint, bigint, numeric, character, date) is
  'Que pasaria al corregir el costo promedio: como queda, cuanto valor se mueve, y cuanto ya salio cargado al costo falso y no se recupera. Convierte como corregir_costo y devuelve la tasa usada.';

-- Comprobado al aplicar: una sola firma de cada una, con la moneda, y con los permisos de antes.
do $ver$
declare
  r record;
begin
  for r in
    select * from (values ('corregir_costo'), ('impacto_de_corregir_costo')) as t(funcion)
  loop
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = r.funcion) <> 1 then
      raise exception '% tiene que quedar con una sola firma.', r.funcion using errcode = '22023';
    end if;

    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = r.funcion
         and strpos(pg_get_function_arguments(p.oid), 'p_moneda character') > 0
         and has_function_privilege('authenticated', p.oid, 'execute')
         and not has_function_privilege('anon', p.oid, 'execute')) then
      raise exception '% no quedó con la moneda o con sus permisos.', r.funcion using errcode = '22023';
    end if;
  end loop;
end
$ver$;
