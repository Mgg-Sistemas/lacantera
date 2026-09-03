-- La primera ficha atada, y una corrección mía que estaba escrita en piedra.
--
-- =========================================================================
-- LO QUE DIJE MAL
-- =========================================================================
--
-- La migración anterior justifica atar a mano con esto, en mayúsculas:
--
--   «casan por cédula ... 0.  CERO.»
--
-- Es falso, y el fallo era de mi comparación, no de los datos: `perfiles.cedula`
-- guarda `20301176` y `empleados.cedula` guarda `V-20301176`. Crucé las dos
-- columnas tal cual y el prefijo tiraba abajo la única coincidencia que había.
--
-- Medido como debía, quitando lo que no es número:
--
--   administradora_  ->  ficha 0018, BARCO PACHECO JESMARY GABIELA
--   leni12, sistemas2, susi ....... con cédula, sin ficha que les corresponda
--   admin_, jlozada, prueba.admin,
--   revision.diseno ............... sin cédula: no hay con qué cruzarlas
--
-- Es exactamente el error que llevo todo el día señalando en otros sitios —«no
-- busques la palabra, lee la cláusula»— cometido por mí, y en un comentario que
-- iba a quedarse ahí explicando una decisión con un dato inventado. Lo cazó
-- Christopher al decir que no veía el indicador: fui a comprobar si era un fallo
-- del enlace, no lo era, y de paso se vio la cédula que sí casaba.
--
-- LA DECISIÓN NO CAMBIA, y conviene decir por qué para que nadie la reabra con
-- el número corregido en la mano: una de doce no es una regla, es una casualidad
-- afortunada. Ocho cuentas no tienen cédula con la que cruzarse y tres la tienen
-- sin ficha detrás. Un cruce automático ataría una y dejaría once a mano, con la
-- diferencia de que nadie sabría cuáles fueron adivinadas.
--
-- Se corrige el comentario de la columna para que diga la verdad, y se deja
-- dicho el detalle del prefijo, que es lo que hace falta saber la próxima vez
-- que alguien quiera cruzar estas dos tablas.

comment on column public.empleados.perfil_id is
  'La cuenta del sistema de esta persona, si tiene. Nulo es lo normal: de 22 trabajadores solo unos pocos entran al sistema. Se ata a mano y es unico, para que una cuenta no cuelgue de dos fichas. Ojo con cruzar por cedula: perfiles la guarda sin prefijo (20301176) y empleados con el (V-20301176), y ademas 8 de 12 cuentas no la tienen.';

-- =========================================================================
-- LA PRIMERA, ATADA
-- =========================================================================
--
-- Christopher no veía el indicador, con razón: no había ninguna ficha atada.
-- Esta es la única que se puede afirmar sin adivinar nada — coinciden el nombre
-- (JESMARY BARCO / BARCO PACHECO JESMARY GABIELA) y la cédula (20301176).
--
-- Va por la misma función que usa la pantalla y no por un UPDATE a mano, para
-- que pase por su reja y quede en la auditoría como cualquier otra. Se busca la
-- ficha por la cédula normalizada en vez de escribir el id: un id copiado a mano
-- en una migración es lo que ata la cuenta de alguien a la ficha de otro el día
-- que este archivo se corra sobre datos distintos.
do $atar$
declare
  v_admin  uuid;
  v_emp    bigint;
  v_perfil uuid;
begin
  select id into v_admin  from public.perfiles where usuario = 'admin_';
  select id into v_perfil from public.perfiles where usuario = 'administradora_';
  select id into v_emp    from public.empleados
   where regexp_replace(coalesce(cedula,''), '[^0-9]', '', 'g') =
         regexp_replace((select coalesce(cedula,'') from public.perfiles where id = v_perfil), '[^0-9]', '', 'g')
     and regexp_replace(coalesce(cedula,''), '[^0-9]', '', 'g') <> '';

  -- Esta migracion ata datos que solo existen en produccion. Al reaplicar las
  -- migraciones sobre una base limpia no hay ni cuentas cargadas ni fichas de
  -- personal, asi que no hay nada que atar y salir es lo correcto. La reja de
  -- abajo se conserva entera para el caso que de verdad importa: que la cuenta
  -- este y su ficha no, que es cuando un atado a ciegas colgaria la cuenta de
  -- una persona de la ficha de otra.
  if v_perfil is null then
    raise notice 'Sin la cuenta administradora_: base sin datos, nada que atar.';
    return;
  end if;

  if v_admin is null or v_perfil is null or v_emp is null then
    raise exception 'No estan las tres piezas: admin=%, perfil=%, empleado=%', v_admin, v_perfil, v_emp;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  perform public.vincular_cuenta_a_empleado(v_emp, v_perfil);

  raise notice 'atada la ficha % con la cuenta %', v_emp, v_perfil;
end;
$atar$;
