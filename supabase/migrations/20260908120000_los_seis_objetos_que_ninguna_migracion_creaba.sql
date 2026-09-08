/*
  LOS SEIS OBJETOS QUE NINGUNA MIGRACIÓN CREABA.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026. No cambia nada en la base viva: son los
  mismos cuerpos que ya corren, escritos por fin donde se pueden reconstruir.
  ————————————————————————————————————————————————————————————————————————

  LO QUE LEVANTÓ EL CARRIL DE BASE DE DATOS, y tiene toda la razón

  «Mi barrido de huérfanos pasó de cero a nueve en un día.» Seis objetos vivos
  que ninguna migración crea, y tres cuerpos vivos que no están en el archivo
  que crea la función.

  Y lo dijo con la consecuencia exacta: si se replican las migraciones sobre un
  proyecto limpio —que es el método con el que se cazaron dos funciones fantasma
  el 3 de septiembre— **no existe `corregir_costo`, así que el inventario de
  868.927.307 USD no se puede arreglar**.

  DE DÓNDE VIENE, Y ES UNA DECISIÓN MÍA MAL TOMADA

  Cuatro de los doce archivos del 7 y el 8 no traen ni un `create`. Lo escribí
  a propósito, y hasta lo justifiqué en cada uno:

      «no se repiten aquí para no tener dos copias que puedan discrepar»

  El intercambio está mal planteado. Dos copias que podrían discrepar es un
  problema menor —y detectable— frente a cero copias con las que reconstruir.
  Peor: uno de esos archivos lleva un bloque que **comprueba** que la función
  exista, `raise exception 'Falta public.corregir_costo'`. Sobre una base vacía
  eso no la construye: falla.

  Es la regla 7 del CLAUDE.md leída al revés. Dice «comprueba que lo que
  aplicaste por MCP acabe en un archivo», y yo di por bueno que el nombre
  apareciera dentro del archivo. Aparecía **nombrado**, no **creado**.

  QUÉ ES ESTE ARCHIVO

  Los seis, con el cuerpo que `pg_get_functiondef` devuelve hoy. Es idempotente
  y no cambia el comportamiento de nada: sobre la base viva reescribe lo mismo
  que ya hay; sobre una base limpia, lo construye.

  Los comentarios de cada función viajan dentro, que es donde llevan viviendo
  desde que se aplicaron. Los archivos que los describían siguen valiendo: ahí
  está el porqué de cada decisión, y aquí el cómo.
*/

do $guarda$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='numero_es') then
    raise exception 'Falta private.numero_es.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='existencia_para_escribir') then
    raise exception 'Falta private.existencia_para_escribir.';
  end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema='public' and table_name='auditoria_modulos') then
    raise exception 'Falta public.auditoria_modulos, de la que cuelga v_auditoria.';
  end if;
end $guarda$;

-- ===========================================================================
-- 1. El parte antes de corregir el costo
-- ===========================================================================
create or replace function public.impacto_de_corregir_costo(
  p_almacen_id bigint, p_articulo_id bigint, p_costo_correcto numeric
) returns json language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_ex numeric; v_val numeric; v_prom numeric;
  v_salio numeric; v_salio_val numeric; v_art record;
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
  */
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  select nombre, unidad into v_art from public.articulos where id = p_articulo_id;
  if v_art.nombre is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

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
    'costo_correcto', p_costo_correcto,
    'valor_corregido', round(v_ex * p_costo_correcto, 6),
    'ajuste', round(v_ex * p_costo_correcto - v_val, 6),
    'ya_salio', v_salio,
    'ya_salio_cargado_a', v_salio_val,
    'ya_salio_deberia_ser', round(v_salio * p_costo_correcto, 6),
    'no_se_recupera', round(v_salio_val - v_salio * p_costo_correcto, 6));
end;
$function$;

-- ===========================================================================
-- 2. La correccion del costo
-- ===========================================================================
create or replace function public.corregir_costo(
  p_almacen_id bigint, p_articulo_id bigint, p_costo_correcto numeric,
  p_motivo text, p_fecha date default null
) returns bigint language plpgsql security definer set search_path to ''
as $function$
declare
  v_ex numeric; v_val numeric; v_prom numeric; v_art record; v_sitio text;
  v_nota text; v_salida bigint;
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

  if round(v_prom, 6) = round(p_costo_correcto, 6) then
    raise exception '"%" ya viene costando % en "%": no hay nada que corregir.',
      v_art.nombre, private.numero_es(v_prom, 4), v_sitio using errcode = '22023';
  end if;

  v_nota := format('Corrección de costo: de %s a %s por %s. %s',
                   private.numero_es(v_prom, 4), private.numero_es(p_costo_correcto, 4),
                   v_art.unidad, btrim(p_motivo));

  v_salida := private.registrar_movimiento(
    'AJUSTE_COSTO', -1, p_almacen_id, p_articulo_id, v_ex, v_prom,
    v_nota, null, null, null, p_fecha);

  perform private.registrar_movimiento(
    'AJUSTE_COSTO', 1, p_almacen_id, p_articulo_id, v_ex, p_costo_correcto,
    v_nota, null, null, v_salida, p_fecha);

  perform private.notificar(
    'INVENTARIO', 'COSTO_CORREGIDO',
    format('Se corrigió el costo de %s', v_art.nombre),
    format('En %s pasó de %s a %s por %s. %s',
           v_sitio, private.numero_es(v_prom, 4),
           private.numero_es(p_costo_correcto, 4), v_art.unidad, btrim(p_motivo)),
    '/app/inventario/movimientos', array['ADMIN', 'GERENTE_GENERAL'], 'ATENCION');

  return v_salida;
end;
$function$;

-- ===========================================================================
-- 3. El registro que dice de que modulo es y por que
-- ===========================================================================
create or replace view public.v_auditoria as
  /*
    Resuelve el modulo desde el mapa y el motivo desde el JSON para las filas
    anteriores al 7 de septiembre, y usa las columnas para las nuevas. Existe
    porque `private.auditoria_inmutable()` rechaza UPDATE sobre `auditoria`
    —«el registro no se modifica ni se borra; es lo unico que lo hace valer»— y
    tiene razon: en vez de reescribir la historia, se deduce al leerla.
  */
  select a.id, a.ocurrido_en, a.usuario_id, a.usuario, a.nombre, a.tabla,
         a.operacion, a.fila_id, a.etiqueta, a.antes, a.despues, a.cambios, a.ip,
         coalesce(a.modulo, m.modulo) as modulo,
         coalesce(a.motivo, left(coalesce(
           nullif(btrim(a.despues ->> 'motivo_anulacion'), ''),
           nullif(btrim(a.despues ->> 'motivo_cancelacion'), ''),
           nullif(btrim(a.despues ->> 'motivo'), ''),
           nullif(btrim(a.despues ->> 'razon'), ''),
           nullif(btrim(a.despues ->> 'nota'), ''),
           nullif(btrim(a.despues ->> 'observacion'), ''),
           nullif(btrim(a.despues ->> 'descripcion'), ''),
           nullif(btrim(a.despues ->> 'causa'), '')), 500)) as motivo
    from public.auditoria a
    left join public.auditoria_modulos m on m.tabla = a.tabla;

/*
  4, 5 y 6 —`revisar_costo_de_entrada`, `articulos_parecidos` y
  `corregir_precio_de_orden`— se crean en el archivo del 8 de septiembre que
  las acompaña, junto a las funciones de `private` de las que dependen:

      20260908130000_las_tres_que_faltaban_con_su_cuerpo.sql

  Se parten en dos archivos porque las tres de arriba son del 7 y las tres de
  abajo necesitan `private.nombre_nucleo`, que es del 8. Aplicadas en orden, se
  construyen solas.
*/

-- ---------------------------------------------------------------------------
-- Los permisos, que la casa revoca en cada funcion que crea
-- ---------------------------------------------------------------------------
revoke execute on function public.impacto_de_corregir_costo(bigint, bigint, numeric) from public, anon;
revoke execute on function public.corregir_costo(bigint, bigint, numeric, text, date) from public, anon;
grant execute on function public.impacto_de_corregir_costo(bigint, bigint, numeric) to authenticated;
grant execute on function public.corregir_costo(bigint, bigint, numeric, text, date) to authenticated;

comment on function public.impacto_de_corregir_costo(bigint, bigint, numeric) is
  'El parte de lo que pasaria al corregir un costo, incluida la parte incomoda: lo que ya salio cargado al costo falso y no se recupera. Solo lee.';
comment on function public.corregir_costo(bigint, bigint, numeric, text, date) is
  'Reexpresa el costo promedio de un articulo en un almacen escribiendo un par de movimientos —sale todo al costo malo, entra todo al bueno—, porque el libro es inmutable. No cambia ninguna cantidad. Exige INVENTARIO.AJUSTAR_COSTO y un motivo de diez caracteres, y avisa a ADMIN y GERENTE_GENERAL.';
comment on view public.v_auditoria is
  'El registro con el modulo y el motivo resueltos: por columna en las filas nuevas y deducidos del JSON en las viejas, porque la auditoria no se puede reescribir.';

/*
  COMPROBADO el 8 de septiembre: los cuerpos son los que `pg_get_functiondef`
  devolvia antes de aplicar esto, asi que la base viva no cambia. Lo que cambia
  es que ahora se pueden reconstruir.

  LO QUE SIGUE PENDIENTE de lo que levanto el carril de BD, y es la otra mitad:

    registrar_cobro      su archivo mas nuevo es de agosto y no menciona
                         `saldo_de_factura`: en una base reconstruida vuelve el
                         cobro ilimitado, que fue el bloqueante del dia 7.
    registrar_recepcion  su archivo no menciona `aviso_costo`: vuelve la
                         recepcion que escribe el precio tecleado sin dudar.
    crear_articulo       su archivo no menciona `articulos_parecidos`.

  Esos tres SI existen tras replicar; lo que no existe es su version corregida.
  Es menos grave que los seis de aqui —la base se levanta— y es igual de real.
*/
