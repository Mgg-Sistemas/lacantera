/*
  LA REVISIÓN DE LA PLANILLA ENSEÑA LOS COSTOS RAROS, PORQUE ES LA CONFIRMACIÓN.

  Desde el 12/09 la planilla manda sus renglones con `confirmado: true`. Sin eso,
  la existencia inicial con costo no entraba nunca: la reja de la primera vez pide
  confirmar renglón por renglón, y una planilla no tiene casillas. La revisión fila
  por fila quedó haciendo de confirmación.

  Pero la revisión no enseñaba los costos. El carril de base de datos lo midió el
  14/09 sobre un aceite que viene costando 7,20, cargado a 720: por el formulario
  rebota nombrando las dos cifras; por planilla entra, y el informe de la revisión
  dice `aviso = null`. El movimiento sí queda marcado con `aviso_costo`, así que
  había rastro para auditar después. Lo que faltaba era la pregunta antes.

  AHORA la revisión —`p_confirmar = false`— hace fila por fila la misma pregunta que
  el formulario de entrada, con la misma función (`revisar_costo_de_entrada`):
  primera vez en ese almacén, o diez veces fuera de lo que viene costando, en
  cualquiera de los dos sentidos. La respuesta va al aviso de la fila, que la
  pantalla ya pinta, y el resumen dice cuántas son en `avisos_de_costo`. La pantalla
  no deja cargar sin marcar que se miraron.

  Las cifras las ve solo quien puede ver la valoración, porque es lo que devuelve
  esa función: aquí no se abre nada que allí esté cerrado. Lo que entra sin valorar
  no se compara, porque no trae cifra con qué.

  COMPROBADO en seco, como ADMIN, con cinco filas puestas en un orden a propósito
  —un artículo que existe delante de uno nuevo, para ver que el nuevo no hereda el
  artículo de la fila anterior—:

    SAE 50 a 7,30, viene a 7,20 ................ sin aviso
    artículo nuevo a 12, detrás del SAE 50 ...... primera vez
    hidráulico 68 a 647, viene a 6,47 .......... «100,00 veces más», con las dos cifras
    laptop sin valorar ......................... sin aviso
    agrofluido en ALM-REP, donde nunca entró ... primera vez
                                                 avisos_de_costo = 3
*/

do $mig$
declare
  v_def   text;
  v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cargar_articulos_por_lote';

  v_antes := v_def;
  v_def := replace(v_def,
    $t$  v_aviso     text;$t$,
    $t$  v_aviso     text;
  v_rev             jsonb;
  v_aviso_costo     text;
  v_avisos_de_costo int := 0;$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 1 (declaraciones) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$    v_informe := v_informe || jsonb_build_object($t$,
    $t$    /*
      EL COSTO RARO SE ENSEÑA EN LA REVISION, QUE ES LA CONFIRMACION.

      La planilla manda sus renglones con `confirmado: true` porque la revision
      fila por fila hace de confirmacion. Pero la revision no enseñaba los avisos
      de costo: un articulo nuevo podia entrar a un precio disparatado sin
      pregunta y sin marca, que es el escenario de los cinco aceites del 5/09 por
      la via de lote.

      Aqui se hace la misma pregunta que el formulario de entrada —la misma
      funcion, `revisar_costo_de_entrada`— y la respuesta va al aviso de la fila,
      que la pantalla ya pinta. Contesta QUE a todo el mundo y CUANTO solo a quien
      puede ver el dinero, porque es lo que devuelve esa funcion.

      Un articulo que la planilla crea no tiene promedio: es primera vez sin
      preguntar. Lo que entra sin valorar no se compara, porque no trae cifra.
    */
    if v_motivo is null and v_almacen_id is not null
       and not coalesce(v_sin_val, false) and coalesce(v_costo, 0) > 0 then
      v_rev := case when v_id is null
                    then jsonb_build_object('estado', 'PRIMERA')
                    else public.revisar_costo_de_entrada(v_almacen_id, v_id, v_costo, v_moneda, null)
               end;

      v_aviso_costo := case
        when v_rev->>'estado' in ('PRIMERA', 'SIN_ARTICULO') then
          format('Primera vez que entra a este almacén, a %s %s por %s: pasa a ser la referencia de todo lo que entre después. Compruébalo con la factura.',
                 private.numero_es(v_costo, 4), v_moneda, v_unidad)
        when v_rev->>'estado' = 'DESVIA' and v_rev->>'veces' is not null then
          format('Viene costando %s USD por %s y entra a %s USD: %s veces %s. Compruébalo con la factura.',
                 private.numero_es((v_rev->>'viene_costando')::numeric, 4), v_unidad,
                 private.numero_es((v_rev->>'entra_a')::numeric, 4),
                 private.numero_es((v_rev->>'veces')::numeric, 2),
                 case when v_rev->>'hacia' = 'ARRIBA' then 'más' else 'menos' end)
        when v_rev->>'estado' = 'DESVIA' then
          format('Ese costo se sale mucho, %s, de lo que el artículo viene costando. Compruébalo con la factura.',
                 case when v_rev->>'hacia' = 'ARRIBA' then 'hacia arriba' else 'hacia abajo' end)
      end;

      if v_aviso_costo is not null then
        v_avisos_de_costo := v_avisos_de_costo + 1;
        v_aviso := case when v_aviso is null then v_aviso_costo
                        else v_aviso || ' · ' || v_aviso_costo end;
      end if;
    end if;

    v_informe := v_informe || jsonb_build_object($t$);
  if v_def = v_antes then
    raise exception 'ANCLA 2 (informe de la fila) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$    'con_existencia', v_con_stock,$t$,
    $t$    'con_existencia', v_con_stock,
    -- Cuantas filas traen un costo que hay que mirar antes de confirmar.
    'avisos_de_costo', v_avisos_de_costo,$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 3 (resumen) no encontrada.' using errcode = '22023';
  end if;

  execute v_def;
end
$mig$;

do $ver$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cargar_articulos_por_lote';

  if position($t$public.revisar_costo_de_entrada(v_almacen_id, v_id$t$ in v_def) = 0 then
    raise exception 'La revision no pregunta por el costo.' using errcode = '22023';
  end if;
  if position($t$'avisos_de_costo', v_avisos_de_costo$t$ in v_def) = 0 then
    raise exception 'El resumen no dice cuantos costos hay que mirar.' using errcode = '22023';
  end if;
end
$ver$;

comment on function public.cargar_articulos_por_lote(jsonb, boolean) is
  'Carga el catálogo por planilla, y de paso la existencia inicial. La revisión —p_confirmar = false— pregunta por cada costo lo mismo que el formulario de entrada (primera vez en ese almacén, o diez veces fuera de lo que viene costando), lo pone en el aviso de la fila y cuenta cuántos hay en avisos_de_costo; la pantalla no deja confirmar sin marcar que se miraron, porque al cargar los renglones van con confirmado: true. La columna «sin_valorar» entra sin cifra; «propietario» vacío es el del almacén; las categorías salen del CHECK.';
