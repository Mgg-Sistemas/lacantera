/*
  PONER UN PRECIO PIDE LO MISMO POR LAS DOS PUERTAS.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 31 de agosto de 2026.

  Se corrió en el momento correcto: se comprobó antes que NADIE tiene
  `VENTAS:ESCRITURA` —solo ADMIN, y con TOTAL—, así que subir el listón no le
  quitó nada a nadie. Ese era el requisito de más abajo.

  El cuerpo no se reescribió a mano: se leyó el vivo con `pg_get_functiondef`,
  se sustituyó la cadena y se volvió a ejecutar. Es el parche que va abajo, tal
  cual corrió.
  ————————————————————————————————————————————————————————————————————————

  LA ASIMETRÍA

  Hay dos funciones que escriben en `precios_venta`, y solo dos:

      guardar_precio_venta ....... exige VENTAS:TOTAL
      cargar_articulos_por_lote .. exige VENTAS:ESCRITURA

  La primera lo razona en su propio comentario: poner precios es decidir a
  cuánto vende la empresa, y eso no es escritura corriente. La segunda pisa la
  misma tabla con el mismo `on conflict` y se conforma con un escalón menos.

  POR QUÉ NO HABÍA MORDIDO, Y POR QUÉ AHORA SÍ PUEDE

  Mientras VENTAS estuvo aparcado nadie tenía permisos de ese módulo, así que
  el hueco existía sin tener por dónde entrar. **Ese cierre era accidental.**

  El módulo vuelve al menú hoy. Volver al menú no reparte permisos —el hueco no
  se abre por eso— pero sí es cuestión de días que alguien empiece a darlos, y
  la fila archivada de los permisos de RRHH dice `VENTAS=ESCRITURA`. El día que
  se restaure tal cual, RRHH cambia los precios de venta con una planilla de
  artículos sin tener el nivel que la otra puerta exige.

  Un precio mal puesto por planilla no se nota: no hay una pantalla que diga
  «alguien bajó el precio del granzón». Se descubre al cuadrar el mes.

  LO QUE HACE ESTA MIGRACIÓN

  Sube la segunda puerta a `VENTAS:TOTAL`, que es lo que ya pide la primera. No
  cambia nada más de la carga por lote: quien sube una planilla sin precios
  sigue necesitando solo `INVENTARIO:ESCRITURA`, porque ahí no está poniendo
  precios. La exigencia sigue siendo condicional, como es hoy.

  ESTO HAY QUE CORRERLO ANTES DE REPARTIR `VENTAS:ESCRITURA`, no después. Una
  vez repartido, subir el listón le quita a alguien algo que ya usaba.
*/

/*
  EL CUERPO NO SE REESCRIBE: SE PARCHEA EL VIVO.

  `cargar_articulos_por_lote` son doce mil caracteres —recorre la planilla fila
  por fila, crea artículos, los actualiza, mete existencia por almacén y de paso
  pone precios—. Reescribirla para cambiar una palabra es la mejor forma de
  colar otra cosa sin querer, y la regla de la casa dice además que el archivo
  puede no ser lo que corrió: ni siquiera vale copiarla del archivo que la creó.

  Así que se lee el cuerpo VIVO, se sustituye la cadena y se vuelve a ejecutar.
  Mecánico, sin transcribir.

  El bloque se planta a sí mismo tres rejas antes de tocar nada:

    - si ya pide TOTAL, no hace nada (centinela: esto es idempotente);
    - si no encuentra EXACTAMENTE una exigencia de VENTAS:ESCRITURA, se para
      —dos serían un cuerpo distinto del que se revisó—;
    - si no encuentra la de INVENTARIO, se para: el cuerpo no es el que se cree.

  La de INVENTARIO no se toca. Es la que autoriza a cargar artículos, que es
  otra cosa: quien sube una planilla SIN precios sigue necesitando solo
  `INVENTARIO:ESCRITURA`.
*/
do $patch$
declare
  v_def   text;
  v_viejo text := 'perform private.exigir_permiso(''VENTAS'', ''ESCRITURA'');';
  v_nuevo text := 'perform private.exigir_permiso(''VENTAS'', ''TOTAL'');';
  v_veces int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cargar_articulos_por_lote';

  if v_def is null then
    raise exception 'No existe cargar_articulos_por_lote.';
  end if;

  -- El centinela: si ya pide TOTAL, esto ya corrio.
  if position(v_nuevo in v_def) > 0 then
    raise notice 'Ya pide VENTAS:TOTAL; no se toca.';
    return;
  end if;

  v_veces := (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo);

  if v_veces <> 1 then
    raise exception 'Esperaba UNA exigencia de VENTAS:ESCRITURA y encontre %.', v_veces;
  end if;

  -- La de INVENTARIO no se toca: es la que autoriza a cargar articulos, que es
  -- otra cosa. La sustitucion apunta solo a la cadena de VENTAS.
  if position('perform private.exigir_permiso(''INVENTARIO'', ''ESCRITURA'');' in v_def) = 0 then
    raise exception 'No encuentro la exigencia de INVENTARIO: el cuerpo no es el que creo.';
  end if;

  v_def := replace(v_def, v_viejo, v_nuevo);
  execute v_def;

  raise notice 'cargar_articulos_por_lote ahora pide VENTAS:TOTAL para poner precios.';
end $patch$;

/*
  COMPROBAR DESPUÉS DE APLICARLA

    -- Que las dos puertas pidan lo mismo
    select p.proname,
           (regexp_matches(p.prosrc, 'exigir_permiso\('VENTAS',\s*'(\w+)'', 'g'))[1] as exige
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('guardar_precio_venta', 'cargar_articulos_por_lote');
    -- Las dos tienen que decir TOTAL.

    -- Y que la primera exigencia siga siendo la de inventario
    select p.prosrc ~ 'exigir_permiso\('INVENTARIO',\s*'ESCRITURA'' as sigue_pidiendo_inventario
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cargar_articulos_por_lote';

    -- Un ensayo: subir una planilla CON precio teniendo solo VENTAS:ESCRITURA
    -- tiene que rebotar, y la misma planilla SIN precios tiene que pasar.
*/
