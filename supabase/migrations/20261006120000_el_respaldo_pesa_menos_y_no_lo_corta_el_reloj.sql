/*
  EL RESPALDO NO LO CORTA EL RELOJ

  Angélica, 06/10/2026, con la pantalla delante: «La consulta tardó demasiado y
  el servidor la cortó».

  El rol `authenticated` tiene `statement_timeout = 8s`. Armar el respaldo
  tardaba 8,57 s. No es que fuera lento desde siempre: cruzó los ocho segundos
  esta semana, con la base en 158 tablas y 28.116 filas, y a partir de ahí la
  pantalla dejó de funcionar de golpe.

  Esta migración hace dos cosas pequeñas. La que de verdad arregla el tiempo va
  en la siguiente, `20261006123000`, y conviene leerla: la causa no era lo que
  parecía.

  1. ESCRIBIR POR POSICIÓN EN VEZ DE CONCATENAR

  `v_partes := v_partes || ...` sobre un array no añade al final: construye un
  array nuevo. Asignar por posición —`v_partes[v_i] := ...`— deja que PL/pgSQL
  lo resuelva sobre el array expandido.

  HONESTIDAD SOBRE ESTO: se cambió creyendo que ahí estaban los siete segundos
  que sobraban, y NO estaban. Medido antes y después, el tiempo no se movió:
  8,57 s contra 8,55 s. Se deja porque es la forma correcta de acumular y no
  cuesta nada, pero no es el arreglo, y escribirlo aquí evita que el próximo que
  mire crea que esta línea resolvió algo.

  2. EL RELOJ PROPIO DE LA PANTALLA

  `respaldo_datos` es la única función de la casa que recorre la base entera.
  Ocho segundos son el tope correcto para una consulta de pantalla y el
  equivocado para esto. Con el arreglo de la migración siguiente tarda segundo y
  medio, así que el tope ya no molestaría hoy; se le pone reloj propio igual,
  por lo que acaba de pasar: la base crece, y el día que vuelva a cruzar el
  límite lo que se ve es esta misma pantalla roja sin que nadie lo relacione con
  que hay más datos.

  Dos minutos y no treinta segundos: el tope no está para que el respaldo quepa
  justo, está para que una consulta ida de madre no se quede colgada.

  Solo en la función de la pantalla. La programada corre como `service_role`,
  que no tiene tope, y nunca estuvo en riesgo.

  LO DEL ZIP NO ESTÁ AQUÍ, Y CONVIENE DECIR POR QUÉ

  Postgres no comprime: no hay gzip ni zip dentro de la base. El respaldo sale
  como texto y se comprime fuera. El envío automático YA iba en `.sql.zip` desde
  el 24/09/2026; la descarga se comprime en el navegador, y eso va en el cambio
  de pantalla que acompaña a esto.
*/

do $patch$
declare
  v_def   text := pg_get_functiondef('private.armar_respaldo(text)'::regprocedure);
  v_ancla text;
  v_veces int;
begin
  -- (a) El indice por donde va la escritura, declarado junto al array.
  v_ancla := 'v_partes  text[] := ''{}'';';
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 1 then
    raise exception 'El ancla (a) aparece % veces en armar_respaldo, se esperaba 1.', v_veces;
  end if;
  v_def := replace(v_def, v_ancla, v_ancla || E'\n  v_i       integer := 0;');

  -- (b) Las cuatro escrituras: la cabecera, la tabla vacia, el bloque de
  --     inserciones y el pie. La expresion de la derecha no se toca.
  v_ancla := 'v_partes := v_partes || format(';
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 4 then
    raise exception 'El ancla (b) aparece % veces en armar_respaldo, se esperaban 4.', v_veces;
  end if;
  v_def := replace(v_def, v_ancla, 'v_i := v_i + 1; v_partes[v_i] := format(');

  -- (c) Que el cierre siga donde se cree, porque si alguien lo movio, lo de
  --     arriba ya no vale.
  v_ancla := 'array_to_string(v_partes, '''')';
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 1 then
    raise exception 'El ancla (c) aparece % veces en armar_respaldo, se esperaba 1.', v_veces;
  end if;

  execute v_def;
end
$patch$;

alter function public.respaldo_datos() set statement_timeout = '120s';

comment on function public.respaldo_datos() is
  'El respaldo completo para la pantalla. Lleva reloj propio: recorre la base entera y los ocho segundos del rol no le alcanzan.';
