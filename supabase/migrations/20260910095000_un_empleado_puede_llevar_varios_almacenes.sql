/*
  UN EMPLEADO PUEDE LLEVAR VARIOS ALMACENES.

  Christopher: «se nos solicita que un empleado pueda ser responsable de algún
  área, como almacén(es), es decir, un empleado puede tener a su cargo uno o más
  almacenes».

  ═══════════════════════════════════════════════════════════════════════════
  EL CARGO VIVE EN EL ALMACÉN, NO UNA LISTA EN LA FICHA DEL EMPLEADO
  ═══════════════════════════════════════════════════════════════════════════

  Puesto aquí, «uno o más» sale gratis: cinco filas apuntando a la misma persona
  y ya está, sin tabla intermedia y sin nada que mantener. Y cada almacén
  conserva UNA sola respuesta a «¿a quién le pido cuenta de lo que falta?», que
  es justamente para lo que sirve un responsable — con dos, la pregunta se queda
  sin contestar y nadie lo nota.

  Al revés —una lista de almacenes colgando del empleado— habría hecho falta una
  tabla de por medio para conseguir lo mismo, y además habría dejado abierta la
  puerta a que dos personas se declaren responsables del mismo sitio.

  ═══════════════════════════════════════════════════════════════════════════
  PUEDE QUEDAR VACÍO
  ═══════════════════════════════════════════════════════════════════════════

  Un cargo puesto por salir del paso es peor que un hueco, porque el hueco se ve.
  Y `on delete set null`: si el empleado se va, el almacén se queda sin
  responsable en vez de arrastrar a alguien que ya no está.

  ESTE ARCHIVO LLEGA TARDE — la columna y su puerta se aplicaron por MCP el
  10/09/2026 y el archivo se quedó sin escribir. Apareció al pasar `npm run
  deriva` antes de cerrar el ciclo: el volcado traía `guardar_almacen` con
  `p_responsable_id` y ningún archivo creaba la columna, así que reconstruir
  desde cero habría reventado. Es exactamente el hueco que describe la regla 7
  del CLAUDE.md, y por eso el detector existe.
*/

alter table public.almacenes
  add column if not exists responsable_id bigint
  references public.empleados(id) on delete set null;

comment on column public.almacenes.responsable_id is
  'El empleado que responde por este almacen. UNO, no varios: con dos, «a quien se le pide cuenta de lo que falta aqui» deja de tener respuesta, que es para lo que sirve el cargo. Que una persona lleve cinco almacenes sale de que cinco filas apunten a ella. Puede quedar vacio: un cargo puesto por salir del paso es peor que un hueco, porque el hueco se ve.';

create index if not exists almacenes_responsable
  on public.almacenes (responsable_id);

/*
  LA PUERTA. `guardar_almacen` gana `p_responsable_id` y lo escribe TAL CUAL, sin
  coalesce: soltar el cargo es una decisión, y si un nulo significara «déjalo
  como está» no habría manera de dejar un almacén sin responsable.

  El cuerpo entero vive en `20260910140000_los_cuerpos_que_de_verdad_corren.sql`,
  que es el volcado de lo que de verdad corre. Aquí no se reescribe para no tener
  dos copias que puedan divergir; el orden de los archivos hace que aquella gane.

  Se escribió así después de romperla: el intento anterior ancló un `replace` en
  mi propio formato en vez del que devuelve `pg_get_functiondef`, el anclaje de
  la firma no encajó, el del cuerpo sí, y la función quedó EN PRODUCCIÓN
  nombrando un parámetro que no existía. PL/pgSQL no valida identificadores al
  crear: revienta al llamar.
*/
