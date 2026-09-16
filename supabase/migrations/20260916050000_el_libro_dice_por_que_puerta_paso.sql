/*
  EL LIBRO DICE POR QUÉ PUERTA PASÓ CADA MOVIMIENTO

  Christopher, 16/09/2026: «las entradas que se hagan por o mediante planilla,
  ¿se diferencian de alguna que sea por "Registrar entrada"? De no ser así, es
  positivo distinguirlo, ej. Entrada sin Compra · Planilla».

  No se diferenciaban. La planilla, al confirmar, llama a `registrar_entradas`
  —una entrada por almacén, agrupando las filas— y lo que queda en el libro es
  exactamente lo mismo que si alguien lo hubiera tecleado a mano: mismo tipo,
  misma función, mismos datos. Lo único distinto era el texto de la nota, que lo
  escribe quien carga y puede decir cualquier cosa.

  La auditoría sí lo sabe desde el 15/09: guarda `request.path` en `origen`. Pero
  eso vive en otra tabla y no acompaña al movimiento: para saber por dónde entró
  una fila del libro había que ir a buscarla a la auditoría, que es de ADMIN.

  Así que el movimiento guarda su propia puerta, con el mismo dato y del mismo
  sitio: la ruta de la petición. Sirve para toda puerta y no solo para la
  planilla —una entrada por recepción de compra, una salida por Sacar, un
  despacho de combustible, un cierre de taller—, y no hace falta tocar nada
  cuando mañana se añada otra: lo que no viene por una petición queda nulo, y lo
  anterior al 16/09/2026 también. No se puede saber a posteriori y no se inventa.

  No cambia la firma de `registrar_movimiento`: el dato no se pasa, se lee.
*/
alter table public.inventario_movimientos add column if not exists hecho_con text;

comment on column public.inventario_movimientos.hecho_con is
  'Por qué puerta pasó: la ruta de la petición que lo escribió (/rpc/<funcion>). '
  'Nulo en lo anterior al 16/09/2026 y en lo que corre sin petición. Es el mismo dato que auditoria.origen.';

do $mig$
declare
  v_def    text := pg_get_functiondef('private.registrar_movimiento(text,integer,bigint,bigint,numeric,numeric,text,bigint,bigint,bigint,date,bigint,text,text,numeric,numeric,text,numeric,numeric,text,text,text,text,bigint,text,text)'::regprocedure);
  v_anclas text[] := array[
    $a$razon_salida, grupo_id, destino_externo, responsable_externo)$a$,
    $a$nullif(btrim(coalesce(p_responsable, '')), ''))$a$];
  v_nuevas text[] := array[
    $n$razon_salida, grupo_id, destino_externo, responsable_externo, hecho_con)$n$,
    $n$nullif(btrim(coalesce(p_responsable, '')), ''),
     -- Por qué puerta pasó. El mismo dato que guarda la auditoría, leído del
     -- mismo sitio: así la fila del libro se explica sola.
     nullif(current_setting('request.path', true), ''))$n$];
begin
  for i in 1 .. array_length(v_anclas, 1) loop
    if (length(v_def) - length(replace(v_def, v_anclas[i], ''))) / length(v_anclas[i]) <> 1 then
      raise exception 'registrar_movimiento: el ancla % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_anclas[i], v_nuevas[i]);
  end loop;

  execute v_def;
end
$mig$;

do $ver$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'inventario_movimientos'
                    and column_name = 'hecho_con') then
    raise exception 'el libro no tiene dónde guardar su puerta';
  end if;
  if position('request.path' in pg_get_functiondef('private.registrar_movimiento'::regproc)) = 0 then
    raise exception 'registrar_movimiento no guarda por dónde pasó';
  end if;
end
$ver$;
