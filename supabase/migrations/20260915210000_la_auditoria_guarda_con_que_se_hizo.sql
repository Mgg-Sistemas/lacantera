/*
  LA AUDITORÍA GUARDA CON QUÉ SE HIZO

  Christopher, 15/09/2026, con la ficha de una baja delante: «no tengo los
  detalles de ese movimiento, no sé qué módulo es eso, no sé los datos que llenó
  del formulario, necesitamos todo explícito».

  El módulo se guardaba, y los datos también —cada fila escrita, entera—. Lo
  que no quedaba en ninguna parte es CON QUÉ se hizo: qué puerta abrió la
  pantalla. Una salida de inventario puede venir de Existencias, de una entrega
  a un trabajador o de un despacho de combustible, y la fila del libro es igual
  en los tres casos.

  PostgREST deja la ruta de cada petición en `request.path`: `/rpc/registrar_baja`.
  Se guarda tal cual en una columna nueva. Lo que corre sin petición —una
  migración, una tarea programada— la deja nula, y lo ya anotado sigue nulo:
  no se puede saber a posteriori y no se va a inventar.

  La tabla sigue siendo inmutable: añadir una columna no toca ninguna fila.
*/
alter table public.auditoria add column if not exists origen text;

comment on column public.auditoria.origen is
  'Con qué se hizo: la ruta de la petición que escribió la fila (/rpc/<funcion>). '
  'Nula en lo anotado antes del 15/09/2026 y en lo que corre sin petición.';

do $mig$
declare
  v_def   text := pg_get_functiondef('private.auditar'::regproc);
  v_ancla text := $a$    (usuario_id, usuario, nombre, tabla, operacion, fila_id, etiqueta,
     antes, despues, cambios, ip, modulo, motivo)
  values
    (v_quien.id, v_quien.usuario, v_quien.nombre, TG_TABLE_NAME, TG_OP, v_clave, v_etiqueta,
     v_antes, v_despues, v_cambios, private.ip_de_la_peticion(), v_modulo, v_motivo);
$a$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'auditar: el insert del registro no aparece exactamente una vez';
  end if;

  v_def := replace(v_def, v_ancla, $n$    (usuario_id, usuario, nombre, tabla, operacion, fila_id, etiqueta,
     antes, despues, cambios, ip, modulo, motivo, origen)
  values
    (v_quien.id, v_quien.usuario, v_quien.nombre, TG_TABLE_NAME, TG_OP, v_clave, v_etiqueta,
     v_antes, v_despues, v_cambios, private.ip_de_la_peticion(), v_modulo, v_motivo,
     -- Con qué se hizo: la ruta de la petición. Nula sin petición.
     nullif(current_setting('request.path', true), ''));
$n$);

  execute v_def;
end
$mig$;

-- La vista la enseña al final, sin mover las columnas que ya leen las pantallas.
create or replace view public.v_auditoria with (security_invoker = on) as
select a.id,
       a.ocurrido_en,
       a.usuario_id,
       a.usuario,
       a.nombre,
       a.tabla,
       a.operacion,
       a.fila_id,
       a.etiqueta,
       a.antes,
       a.despues,
       a.cambios,
       a.ip,
       coalesce(a.modulo, m.modulo) as modulo,
       coalesce(a.motivo, left(coalesce(
         nullif(btrim(a.despues ->> 'motivo_anulacion'), ''),
         nullif(btrim(a.despues ->> 'motivo_cancelacion'), ''),
         nullif(btrim(a.despues ->> 'motivo'), ''),
         nullif(btrim(a.despues ->> 'razon'), ''),
         nullif(btrim(a.despues ->> 'nota'), ''),
         nullif(btrim(a.despues ->> 'observacion'), ''),
         nullif(btrim(a.despues ->> 'descripcion'), ''),
         nullif(btrim(a.despues ->> 'causa'), '')), 500)) as motivo,
       a.origen
  from public.auditoria a
  left join public.auditoria_modulos m on m.tabla = a.tabla;

do $ver$
begin
  if position('request.path' in pg_get_functiondef('private.auditar'::regproc)) = 0 then
    raise exception 'auditar no guarda con qué se hizo';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'v_auditoria' and column_name = 'origen') then
    raise exception 'v_auditoria no enseña el origen';
  end if;
end
$ver$;
