/*
  PONER UN PRECIO PIDE LO MISMO POR LAS DOS PUERTAS.

  ————————————————————————————————————————————————————————————————————————
  SIN APLICAR. Escrita el 28 de agosto de 2026 con el MCP de Supabase caído.
  Le falta a propósito el cuerpo de la función: ver más abajo.
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
  EL CUERPO SE COPIA DEL QUE ESTÉ VIVO AL APLICAR ESTO.

  `cargar_articulos_por_lote` es larga —recorre la planilla fila por fila,
  crea artículos, los actualiza y de paso pone precios— y no se reescribe de
  memoria. La regla 7 de la casa dice además que el archivo puede no ser lo que
  corrió, así que ni siquiera vale copiarla del archivo que la creó.

  El cambio es de una línea:

      -  perform private.exigir_permiso('VENTAS', 'ESCRITURA');
      +  perform private.exigir_permiso('VENTAS', 'TOTAL');

  Y es la SEGUNDA `exigir_permiso` del cuerpo, la que está condicionada a que
  alguna fila traiga precio. La primera —`INVENTARIO:ESCRITURA`, al entrar— no
  se toca: es lo que autoriza a cargar artículos, que es otra cosa.

  Para sacarla:

    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cargar_articulos_por_lote';
*/

-- PENDIENTE: pegar aquí el cuerpo vivo de `cargar_articulos_por_lote` con esa
-- única línea cambiada. No se escribe a ciegas: esta función crea artículos y
-- pone precios de venta, y equivocarse aquí se descubre cuadrando el mes.

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
