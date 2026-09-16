/*
  LOS PRODUCTOS DE LA PLANTA LLEVAN SU DENSIDAD, ESTIMADA Y DICHA COMO TAL

  Christopher, 16/09/2026: «no disponemos de la información de las densidades
  por ahora, recomiendo colocar un estimado, considerando que es materia de una
  cantera y el nombre del artículo».

  EL NÚMERO NO SE INVENTA AQUÍ. 1,44 t/m³ es el que este mismo sistema ya dice
  que llevan los productos terminados: está escrito en `reporteDiario.ts`, al
  lado del 1,55 con el que convierte el material sin clasificar que baja de la
  mina. Lo que faltaba no era el número —lo que faltaba es que alguien lo
  escribiera en el catálogo—: la auditoría no registra un solo cambio de esa
  columna desde que existe, y por eso la equivalencia a toneladas, que la
  pantalla sabe enseñar desde hace semanas, no aparecía nunca.

  ES UN ESTIMADO. Cuando alguien pese un metro cúbico de verdad, se cambia y la
  equivalencia cambia con él. Mientras tanto, «≈ 1.600 TON» —con el casi
  delante— dice más que una columna en blanco.

  Solo los seis productos de venta, que son los que se miden de las dos formas.
  El resto del catálogo —repuestos, EPP, herramientas— no tiene densidad porque
  no tiene sentido que la tenga.
*/
update public.articulos
   set densidad_ton_m3 = 1.44
 where categoria = 'PRODUCTO'
   and unidad = 'M3'
   and densidad_ton_m3 is null
   and activo;

comment on column public.articulos.densidad_ton_m3 is
  'Toneladas por metro cúbico, para poder leer lo mismo en las dos medidas. '
  'Los seis productos llevan 1,44 desde el 16/09/2026: es un ESTIMADO de la casa —el mismo que usa el reporte diario— '
  'puesto porque nadie ha pesado todavía. Quien lo mida, que lo cambie.';

do $ver$
declare v_sin_densidad int;
begin
  select count(*) into v_sin_densidad
    from public.articulos
   where categoria = 'PRODUCTO' and unidad = 'M3' and activo and densidad_ton_m3 is null;

  if v_sin_densidad > 0 then
    raise exception 'quedan % productos sin densidad', v_sin_densidad;
  end if;
end
$ver$;
