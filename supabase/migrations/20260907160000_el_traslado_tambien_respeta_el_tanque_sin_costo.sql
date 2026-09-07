/*
  EL TRASLADO TAMBIÉN RESPETA EL TANQUE SIN COSTO.

  ————————————————————————————————————————————————————————————————————————
  Cuerpo sacado de `pg_get_functiondef`, no de un archivo — regla 7.
  ————————————————————————————————————————————————————————————————————————

  LA PUERTA DE AL LADO

  Lo encontró el carril de base de datos el 7 de septiembre, y me corrige: yo di
  esta reja por cerrada «en los dos sentidos» el 31 de agosto, y lo estaba solo
  en la puerta que miré.

  `registrar_entrada` comprueba `almacenes.admite_sin_costo` antes de dejar
  entrar material a cero, y también al revés — al tanque sin costo no entra nada
  con precio. Pero `transferir_existencia` no lo consulta:

      v_costo := private.costo_promedio(p_origen_id, p_articulo_id);

  El promedio de `CMB-INI` es cero, porque para eso existe ese tanque. Así que
  trasladar de `CMB-INI` a `CMB-TAN` mete litros a coste cero en el tanque bueno
  y le hunde el promedio exactamente igual que la entrada que la reja impide. Y
  el propio módulo de combustible ofrece ese traslado.

  Es la misma forma del defecto del vale con destino escrito a mano: la
  comprobación existe, y hay una puerta al lado que no pasa por ella. Conviene
  anotarlo como patrón, porque ya van tres.

  LA REJA VA EN LOS DOS SENTIDOS, COMO LA DE LA ENTRADA

      sin costo → con precio    prohibido: hunde el promedio del destino
      con precio → sin costo    prohibido: el material perdería su valor, y el
                                tanque dejaría de ser lo que su nombre dice

  Entre dos almacenes del mismo tipo no pasa nada: sin costo a sin costo mueve
  ceros, y con precio a con precio es un traslado normal.

  LO QUE NO RESUELVE, Y ES LA PREGUNTA DE FONDO

  Si de verdad hace falta pasar el gasoil inicial al tanque de siempre, esta reja
  dice que no y no ofrece salida — porque la salida es una decisión que nadie ha
  tomado todavía: **a qué precio se valora el combustible que traslada otra
  empresa del grupo.** Está abierta desde el 31 de agosto. Mientras no se decida,
  el mensaje manda a decidirla en vez de dejar que el promedio se hunda solo.
*/

do $guarda$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='almacenes'
                    and column_name='admite_sin_costo') then
    raise exception 'Falta almacenes.admite_sin_costo: esta reja no tiene sentido sin ella.';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='transferir_existencia') <> 1 then
    raise exception 'transferir_existencia no es unica.';
  end if;
end $guarda$;

create or replace function public.transferir_existencia(
  p_origen_id bigint, p_destino_id bigint, p_articulo_id bigint,
  p_cantidad numeric, p_motivo text, p_fecha date default null
) returns bigint language plpgsql security definer set search_path to ''
as $function$
declare
  v_origen     public.almacenes;
  v_destino    public.almacenes;
  v_existencia numeric;
  v_costo      numeric;
  v_articulo   text;
  v_salida     bigint;
begin
  perform private.exigir_rol('ALMACEN');

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

  -- Un almacen inactivo es uno que se cerro. Dejar entrar material ahi lo
  -- esconde: no sale en las pantallas y nadie vuelve a buscarlo.
  if not v_destino.activo then
    raise exception 'El almacén "%" está inactivo y no puede recibir material.', v_destino.nombre
      using errcode = '22023';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se mueve. Un traslado sin motivo no se puede auditar.'
      using errcode = '22023';
  end if;

  /*
    LA REJA DEL TANQUE SIN COSTO, QUE AQUI FALTABA.

    El material sale al `costo_promedio` de su origen. En un almacen marcado
    `admite_sin_costo` ese promedio es cero por diseno, asi que un traslado
    desde ahi mete ceros en el destino y le hunde el promedio — justo lo que
    `registrar_entrada` impide por la otra puerta.
  */
  if coalesce(v_origen.admite_sin_costo, false)
     and not coalesce(v_destino.admite_sin_costo, false) then
    raise exception 'De "%" no se puede trasladar a "%": lo que hay ahí entró sin costo y hundiría el costo promedio del destino.',
      v_origen.nombre, v_destino.nombre
      using errcode = '22023',
            hint = 'Antes hay que decidir a qué precio se valora lo que trasladó la otra empresa. Mientras no se decida, el traslado escribiría un cero que después no se puede distinguir de un precio real.';
  end if;

  if not coalesce(v_origen.admite_sin_costo, false)
     and coalesce(v_destino.admite_sin_costo, false) then
    raise exception 'A "%" solo entra lo que no costó nada, y lo que sale de "%" tiene precio.',
      v_destino.nombre, v_origen.nombre
      using errcode = '22023',
            hint = 'Ese almacén lleva aparte lo que no le costó nada a esta empresa. Metiendo ahí material con precio se pierde su valor y el nombre del tanque deja de ser verdad.';
  end if;

  v_existencia := private.existencia_para_escribir(p_origen_id, p_articulo_id);

  if p_cantidad > v_existencia then
    select nombre into v_articulo from public.articulos where id = p_articulo_id;
    raise exception 'En "%" solo hay % de "%" y se intentan mover %.',
      v_origen.nombre, v_existencia, coalesce(v_articulo, p_articulo_id::text), p_cantidad
      using errcode = '22023';
  end if;

  v_costo := private.costo_promedio(p_origen_id, p_articulo_id);

  v_salida := private.registrar_movimiento(
    'TRANSFERENCIA_SALIDA', (-1)::smallint, p_origen_id, p_articulo_id,
    p_cantidad, v_costo,
    format('Traslado a %s. %s', v_destino.nombre, p_motivo),
    null, null, null, p_fecha);

  -- La entrada apunta a la salida: es lo que las convierte en una pareja y no
  -- en dos movimientos sueltos que casualmente cuadran.
  perform private.registrar_movimiento(
    'TRANSFERENCIA_ENTRADA', (1)::smallint, p_destino_id, p_articulo_id,
    p_cantidad, v_costo,
    format('Traslado desde %s. %s', v_origen.nombre, p_motivo),
    null, null, v_salida, p_fecha);

  return v_salida;
end;
$function$;
