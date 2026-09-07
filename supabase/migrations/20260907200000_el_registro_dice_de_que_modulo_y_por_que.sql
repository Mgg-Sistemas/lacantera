/*
  EL REGISTRO DICE DE QUÉ MÓDULO ES Y POR QUÉ SE HIZO.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 7 de septiembre de 2026, por MCP.
  ————————————————————————————————————————————————————————————————————————

  DE DÓNDE VIENE, Y POR QUÉ NO ES UN LOG NUEVO

  Christopher pidió «logs, json, que registre toda acción, y que eso nos ayude a
  determinar exactamente qué ocurrió, cuándo, dónde, quién, qué, en qué módulo…
  optimizando a un solo punto».

  Antes de construirlo se midió lo que ya había, y ya estaba casi todo: la tabla
  `auditoria` guarda quién, cuándo, qué tabla, qué operación, qué fila, qué
  campos cambiaron, el `antes` y el `después` completos en JSON, y la IP. 87 de
  93 tablas la alimentan por disparador, con 1.024 registros desde el 25 de
  agosto. Y hay pantalla, solo para administración.

  Así que el trabajo no era crear el registro sino **cerrarle tres huecos**:

    1. EL MÓDULO. Se guardaba la tabla, no el módulo. Quien pregunta «¿qué pasó
       ayer en Nómina?» tenía que saber qué tablas son de Nómina.

    2. EL PORQUÉ. Estaba guardado, pero dentro de `despues`: había que abrir el
       JSON para leerlo, así que no se podía filtrar ni listar por él.
       Christopher: «el sistema siempre debe de reflejar en lo posible la razón,
       para que todo sea transparente».

    3. `nomina_recibo_lineas`, la única de las seis sin auditar que importaba:
       son los renglones del sueldo de cada persona. Las otras cinco están bien
       fuera —la propia auditoría, los correlativos, las notificaciones y la
       presencia—.

  LO QUE NO SE PUDO HACER, Y ESTÁ BIEN QUE NO SE PUEDA

  Se intentó rellenar el módulo y el motivo de los 1.024 registros anteriores.
  **La base lo impidió**: `private.auditoria_inmutable()` rechaza UPDATE y
  DELETE sobre `auditoria`, con este mensaje —«El registro de auditoría no se
  modifica ni se borra. Es lo único que lo hace valer»—.

  Tiene toda la razón y no se rodeó. En vez de reescribir la historia, se deduce
  al leerla: `v_auditoria` resuelve el módulo desde el mapa y el motivo desde el
  JSON para las filas viejas, y usa las columnas para las nuevas. Quien consulta
  ve lo mismo en las dos y ningún renglón ha cambiado.

  POR QUÉ EL MAPA ES UNA TABLA Y NO UN `CASE`

  `auditoria_modulos` es un mapa, no una regla: si mañana una tabla cambia de
  módulo se corrige ahí, sin migración. Y el módulo se **congela** al escribir en
  la auditoría, así que lo ya registrado sigue diciendo dónde pasó aunque el mapa
  cambie después.

  Hay tres entradas que no son tablas —`acceso`, `clave`, `respaldo`—: la
  auditoría también recoge eventos que no tocan ninguna fila, y sin mapearlos se
  quedaban sin módulo. Son 20 registros de los 1.024.
*/

do $guarda$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='auditar') then
    raise exception 'Falta private.auditar.';
  end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema='public' and table_name='modulos') then
    raise exception 'Falta public.modulos, que es a quien apunta el mapa.';
  end if;
end $guarda$;

create table if not exists public.auditoria_modulos (
  tabla  text primary key,
  modulo text not null references public.modulos(codigo)
);

comment on table public.auditoria_modulos is
  'De que modulo es cada tabla, para que el registro pueda contestar «que paso ayer en Nomina» sin que quien pregunta tenga que saber que tablas son de Nomina. Es un mapa, no una regla: se corrige aqui sin migracion.';

alter table public.auditoria_modulos enable row level security;
drop policy if exists auditoria_modulos_lectura on public.auditoria_modulos;
create policy auditoria_modulos_lectura on public.auditoria_modulos
  for select to authenticated using (true);

alter table public.auditoria
  add column if not exists modulo text,
  add column if not exists motivo text;

comment on column public.auditoria.modulo is
  'De que modulo es la tabla tocada. Sale de auditoria_modulos al escribir y se congela: si manana una tabla cambia de modulo, lo ya registrado sigue diciendo donde paso.';
comment on column public.auditoria.motivo is
  'El porque, subido a columna propia desde la fila. Estaba dentro de `despues` y habia que abrir el JSON para leerlo, asi que no se podia filtrar ni listar.';

create index if not exists auditoria_modulo_idx on public.auditoria (modulo, ocurrido_en desc);

-- La que faltaba, y es la que mas importa de las seis.
drop trigger if exists trg_auditar on public.nomina_recibo_lineas;
create trigger trg_auditar after insert or update or delete on public.nomina_recibo_lineas
  for each row execute function private.auditar('id');

/*
  El contenido de `auditoria_modulos` —94 tablas mas 3 eventos— y los cuerpos de
  `private.auditar()` y de la vista `public.v_auditoria` son los que devuelve el
  catalogo tras esta migracion. Se aplicaron por MCP y llevan sus comentarios
  dentro; no se repiten aqui para no tener dos copias que discrepen.

      select tabla, modulo from public.auditoria_modulos order by modulo, tabla;
      select pg_get_functiondef('private.auditar()'::regprocedure);
      select pg_get_viewdef('public.v_auditoria'::regclass, true);

  Lo que cambia en `private.auditar()`: busca el motivo en la fila por el mismo
  metodo que ya usaba para la etiqueta —una lista de nombres en orden de
  preferencia— y resuelve el modulo contra el mapa. El motivo de anulacion va
  PRIMERO de la lista: cuando existe, es la razon que mas importa de esa fila,
  y taparla con la nota de cuando se creo seria contar la mitad vieja.

  DE PROPINA, EN LA MISMA TANDA: el aviso del costo decia «son 0,00 veces» para
  una desviacion hacia abajo. Lo levanto el carril de base de datos: con el
  promedio envenenado en 1.209.012,48, teclear el precio real de 6,21 daba
  «0,00», que es cierto e inutil. Ahora dice «son 194.688,00 veces menos».

  El inverso se calcula con los valores CRUDOS y no con el factor redondeado:
  6,21 / 1.209.012,48 redondea a 0,00 y dividir entre eso revienta. Salio
  ejecutando, no leyendo.
*/

/*
  COMPROBADO el 7 de septiembre:

    94 tablas mapeadas, ninguna suelta
    88 tablas con disparador de auditoria (era 87)
    1.024 registros, 0 sin modulo al leerlos por la vista
    el aviso hacia abajo dice «194.688,00 veces menos»

  Al terminar: 19 movimientos, MOV-2026-0019. Nada de produccion tocado.

  PENDIENTE

    - La pantalla: que Auditoria filtre por modulo y ensene el motivo en columna.
    - Extraer una copia del registro, que lo pidio Christopher.
    - La retencion: 1.024 registros en dos semanas son unos 26.000 al ano. No es
      problema por anos, pero es una decision que se toma antes de necesitarla.
*/
