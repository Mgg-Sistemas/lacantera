/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  1 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
  las crea. No cambia nada en la base: son los mismos cuerpos que ya corren,
  puestos donde reconstruir desde cero da lo mismo que hay.

  POR QUE APARECIO ESTA DIFERENCIA, que es lo unico interesante de este archivo:
  las migraciones de esta casa parchean con `pg_get_functiondef` + `replace` en
  vez de reescribir funciones de siete mil letras. El parche es correcto y el
  motivo es bueno —copiar a mano es lo que introduce diferencias—, pero deja el
  cuerpo repartido entre el archivo que la creo y los cinco que la tocaron
  despues. El archivo deja de servir para reconstruir aunque cada parche este
  bien.

  Lo levanto el carril de base de datos, tres veces en un dia, y la tercera con
  el diagnostico que lo explica: no es falta de cuidado, es que la verificacion
  se hace UNA VEZ al escribir y seis migraciones despues otra cosa toca la misma
  funcion. Un md5 comprobado el lunes no dice nada del miercoles.

  Por eso esto es generado y no transcrito: volcar la salida de Postgres no puede
  introducir una diferencia, y teclearla si.

  QUE SE COMPROBO ANTES DE GUARDARLO

  Cada cuerpo de aqui se comparo BYTE A BYTE contra `pg_proc.prosrc` de la base
  viva —no normalizado, no perdonando comentarios— y los 1 coinciden. Y el
  detector, que antes marcaba estas 1, pasa a cero.

  NO SE APLICO, Y ES A PROPOSITO

  Aplicarlo seria un no-op: son exactamente los cuerpos que ya corren, sacados de
  `pg_get_functiondef`. Su valor no esta en cambiar la base sino en que
  reconstruirla desde cero de lo mismo que hay.

  Y LA TRAMPA QUE ESO DEJA, dicha aqui para que no sorprenda: si manana otra
  migracion toca una de estas funciones y alguien corre ESTE archivo suelto,
  despues, la revierte al cuerpo de hoy. En orden no pasa —va fechado con su dia y
  detras de todo lo de ese dia—, pero un volcado no es una migracion normal y
  conviene saberlo antes de ejecutarlo a mano.
*/

-- private.auditar()
-- venia de: 20260910140000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION private.auditar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quien record; v_antes jsonb; v_despues jsonb; v_fila jsonb; v_cambios text[];
  v_clave text; v_partes text[] := '{}'; v_etiqueta text; v_col text;
  v_modulo text; v_motivo text;
begin
  if TG_OP = 'DELETE' then
    v_antes := to_jsonb(OLD);
  elsif TG_OP = 'INSERT' then
    v_despues := to_jsonb(NEW);
  else
    v_antes := to_jsonb(OLD); v_despues := to_jsonb(NEW);
    select array_agg(e.key order by e.key) into v_cambios
      from jsonb_each(v_despues) e where e.value is distinct from v_antes -> e.key;
    -- Un UPDATE que no cambio nada no es un movimiento. Anotarlo llenaria el
    -- registro de renglones vacios entre los que si dicen algo.
    if v_cambios is null then return null; end if;
  end if;

  v_fila := coalesce(v_despues, v_antes);

  -- La clave primaria, tal como la declaro la tabla.
  -- `coalesce` porque un disparador declarado SIN argumentos deja TG_ARGV en
  -- NULL, no en un array vacio, y `foreach in array NULL` revienta con 22004.
  -- Cinco catalogos estaban asi y no se podian editar desde la pantalla.
  foreach v_col in array coalesce(TG_ARGV, '{}'::text[]) loop
    v_partes := v_partes || coalesce(v_fila ->> v_col, '?');
  end loop;
  v_clave := nullif(array_to_string(v_partes, '·'), '');

  -- Con que reconocerla de un vistazo. Es una preferencia, no una regla.
  --
  -- `rol` va de los primeros a proposito. Las tablas que reparten permisos se
  -- identifican por un uuid y un codigo, y sin etiqueta el registro ensenaba
  -- «e0a9d9b2-…·RRHH», que no dice quien le dio que a quien.
  -- La etiqueta la arma `private.etiqueta_de_fila`: primero busca un nombre en
  -- la propia fila y, si no lo hay, camina sus claves foraneas. Antes esto era
  -- solo la primera pasada, y por eso 572 de 1.097 filas no decian de que
  -- hablaban: las once tablas hijas no tienen nombre propio.
  v_etiqueta := private.etiqueta_de_fila(TG_TABLE_NAME, v_fila);

  /*
    EL PORQUE, SUBIDO A COLUMNA PROPIA.

    Estaba guardado —dentro de `despues`— pero habia que abrir el JSON para
    leerlo, asi que no se podia filtrar por el ni listarlo. Christopher, el
    7/09/2026: «el sistema siempre debe de reflejar en lo posible la razon, para
    que todo sea transparente».

    Se busca en el orden en que las tablas de la casa nombran esa idea. El
    motivo de anulacion va PRIMERO: cuando existe, es la razon que mas importa
    de esa fila —alguien deshizo algo— y taparla con la nota de cuando se creo
    seria contar la mitad vieja de la historia.
  */
  foreach v_col in array array[
    'motivo_anulacion', 'motivo_cancelacion', 'motivo', 'razon', 'nota',
    'observacion', 'descripcion', 'causa'
  ] loop
    if v_fila ? v_col and nullif(trim(coalesce(v_fila ->> v_col, '')), '') is not null then
      v_motivo := left(v_fila ->> v_col, 500); exit;
    end if;
  end loop;

  -- El modulo se congela al escribir: si manana una tabla cambia de modulo, lo
  -- ya registrado sigue diciendo donde paso.
  select m.modulo into v_modulo from public.auditoria_modulos m where m.tabla = TG_TABLE_NAME;

  select * into v_quien from private.quien_escribe();

  insert into public.auditoria
    (usuario_id, usuario, nombre, tabla, operacion, fila_id, etiqueta,
     antes, despues, cambios, ip, modulo, motivo, origen)
  values
    (v_quien.id, v_quien.usuario, v_quien.nombre, TG_TABLE_NAME, TG_OP, v_clave, v_etiqueta,
     v_antes, v_despues, v_cambios, private.ip_de_la_peticion(), v_modulo, v_motivo,
     -- Con qué se hizo: la ruta de la petición. Nula sin petición.
     nullif(current_setting('request.path', true), ''));

  return null;
end;
$function$;
