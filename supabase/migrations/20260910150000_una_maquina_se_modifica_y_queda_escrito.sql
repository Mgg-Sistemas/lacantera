/*
  UNA MÁQUINA SE MODIFICA, Y ESO QUEDA ESCRITO.

  Christopher: «debemos permitir que las máquinas puedan modificarse (añadir
  elementos o incluir características adicionales, ej. antenas Starlink, cauchos
  especiales, etc), eso estará incluido en el historial de la máquina».

  ═══════════════════════════════════════════════════════════════════════════
  NO ES UN REPUESTO, Y POR ESO NO VA POR EL TALLER
  ═══════════════════════════════════════════════════════════════════════════

  `mantenimiento_repuestos` ya anota lo que se le monta a una máquina, pero
  contesta otra pregunta: qué se consumió arreglándola. Un repuesto REPONE algo
  que ya tenía; una antena Starlink AÑADE algo que no tenía.

  La diferencia no es filosófica, se ve en las dos preguntas que cada uno
  contesta. Del repuesto se pregunta «cuánto me ha costado mantener esta
  máquina»; del agregado se pregunta «qué lleva encima esta máquina AHORA MISMO»
  — que es la que se hace al mandarla a una faena, al devolvérsela a su dueño o
  al discutir qué falta cuando vuelve.

  Un repuesto no tiene esa segunda pregunta: nadie inventaría los filtros que
  lleva puestos una excavadora. Un agregado sí, y por eso necesita saber si sigue
  puesto o ya se quitó, que es un estado que los repuestos no tienen.

  ═══════════════════════════════════════════════════════════════════════════
  ESTA PUERTA NO MUEVE EL INVENTARIO, A PROPÓSITO
  ═══════════════════════════════════════════════════════════════════════════

  La tentación era descontar la antena del almacén al montarla. Se descarta por
  dos razones, y la segunda pesa más que la primera.

  La primera: sería la puerta número quince del inventario. Las catorce que hay
  pasan todas por `private.existencia_para_escribir`, y añadir otra es añadir otro
  sitio donde equivocarse con el cerrojo.

  La segunda, que es la que decide: el caso corriente de un agregado es que NO
  pasó por el almacén. Una antena Starlink se compra y se instala; unos cauchos
  especiales los monta el taller de la esquina. Exigir existencia bloquearía el
  caso normal para servir al raro. Y cuando sí salió del almacén, esa salida ya
  se registra por su puerta —una asignación, un consumo— y aquí se dice a qué se
  le puso.

  Por eso `costo_usd` es informativo y puede faltar. Lo que esta tabla promete es
  QUÉ LLEVA LA MÁQUINA, no cuánto vale el inventario. Prometer las dos cosas con
  un número que nadie puede comprobar sería meter ruido en la contabilidad —que
  es exactamente lo que Christopher tiene prohibido.

  ═══════════════════════════════════════════════════════════════════════════
  SE QUITA, NO SE BORRA
  ═══════════════════════════════════════════════════════════════════════════

  La antena se pasa a otra máquina y los cauchos se gastan. Un DELETE dejaría la
  máquina como si nunca los hubiera llevado, y el historial —que es justo lo que
  Christopher pide— se quedaría sin la mitad de la historia. Se marca la fecha de
  retiro y su motivo, y las dos cosas salen en la ficha: cuándo se puso y cuándo
  se quitó.
*/

create table if not exists public.maquina_agregados (
  id           bigserial primary key,
  maquina_id   bigint not null references public.maquinaria(id) on delete cascade,
  /* Cómo se llama. Libre a propósito: «antena Starlink», «cauchos 29.5 de
     roca», «blindaje de cabina». No todo lo que se le monta a una máquina está
     en el catálogo de artículos, y exigirlo obligaría a inventar fichas. */
  nombre       text not null,
  /* Si además está en el catálogo, se enlaza. Opcional: sirve para que el
     nombre no se escriba de seis maneras distintas, no para descontar nada. */
  articulo_id  bigint references public.articulos(id),
  /* El serial DEL AGREGADO, que no es el de la máquina. Es lo que identifica la
     antena concreta el día que se pase a otro equipo. */
  serial       text,
  cantidad     numeric,
  fecha        date not null default private.hoy_aqui(),
  /* Lo que costó, SI SE SABE. Informativo: esta tabla no toca el inventario ni
     la valoración, y un número que nadie puede comprobar seria ruido. */
  costo_usd    numeric,
  nota         text,

  retirado_el     date,
  motivo_retiro   text,
  retirado_por    uuid references auth.users(id),

  puesto_por   uuid references auth.users(id),
  creado_en    timestamptz not null default now(),

  constraint maquina_agregados_nombre_dice_algo check (length(btrim(nombre)) >= 3),
  constraint maquina_agregados_cantidad_positiva check (cantidad is null or cantidad > 0),
  constraint maquina_agregados_costo_no_negativo check (costo_usd is null or costo_usd >= 0),
  /* No se puede quitar antes de ponerlo. */
  constraint maquina_agregados_retiro_despues check (retirado_el is null or retirado_el >= fecha),
  /* Y si se quitó, se dice por qué: «se quitó» a secas no explica si se pasó a
     otra máquina, si se gastó o si se lo llevaron. */
  constraint maquina_agregados_retiro_explicado
    check (retirado_el is null or length(btrim(coalesce(motivo_retiro, ''))) >= 4)
);

comment on table public.maquina_agregados is
  'Lo que se le añade a una maquina y no venia con ella: una antena Starlink, cauchos especiales, un blindaje. Lo pidio Christopher el 10/09/2026. No es `mantenimiento_repuestos`: aquel contesta «cuanto me ha costado mantenerla» y este «que lleva encima ahora mismo», que es la pregunta que se hace al mandarla a una faena o al devolversela a su dueño. NO mueve inventario a proposito: el caso corriente es que el agregado nunca paso por el almacen, y exigir existencia bloquearia el caso normal para servir al raro.';

comment on column public.maquina_agregados.costo_usd is
  'Lo que costo, si se sabe. INFORMATIVO: esta tabla no toca el inventario ni la valoracion. Prometer las dos cosas con un numero que nadie puede comprobar seria meter ruido en la contabilidad.';

comment on column public.maquina_agregados.retirado_el is
  'Cuando se quito. Se marca en vez de borrar la fila: un DELETE dejaria la maquina como si nunca lo hubiera llevado, y el historial se quedaria sin la mitad de la historia.';

create index if not exists maquina_agregados_maquina
  on public.maquina_agregados (maquina_id, retirado_el nulls first, fecha desc);

alter table public.maquina_agregados enable row level security;

drop policy if exists maquina_agregados_lectura on public.maquina_agregados;
create policy maquina_agregados_lectura on public.maquina_agregados
  for select to authenticated
  using (private.tiene_permiso('MAQUINARIA', 'LECTURA'));

revoke insert, update, delete on public.maquina_agregados from authenticated;
grant select on public.maquina_agregados to authenticated;

drop trigger if exists trg_auditar on public.maquina_agregados;
create trigger trg_auditar
  after insert or update or delete on public.maquina_agregados
  for each row execute function private.auditar('nombre');

drop trigger if exists trg_normalizar on public.maquina_agregados;
create trigger trg_normalizar
  before insert or update on public.maquina_agregados
  for each row execute function private.normalizar_texto('nombre', 'serial', 'nota', 'motivo_retiro');

-- ---------------------------------------------------------------------------
-- Las dos puertas: ponerlo y quitarlo
-- ---------------------------------------------------------------------------
create or replace function public.montar_agregado(
  p_maquina_id  bigint,
  p_nombre      text,
  p_articulo_id bigint  default null,
  p_serial      text    default null,
  p_cantidad    numeric default null,
  p_fecha       date    default null,
  p_costo_usd   numeric default null,
  p_nota        text    default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id     bigint;
  v_estado text;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select estado into v_estado from public.maquinaria where id = p_maquina_id;
  if v_estado is null then
    raise exception 'Esa maquina no existe.' using errcode = '22023';
  end if;

  /*
    A UNA MAQUINA DESINCORPORADA NO SE LE MONTA NADA. Salio de la flota; anotarle
    una antena hoy diria que sigue operando, y la lista de «que lleva encima»
    dejaria de servir para lo unico que sirve: saber que hay que recuperar.
  */
  if v_estado = 'DESINCORPORADA' then
    raise exception 'Esa maquina esta desincorporada: ya no se le monta nada.'
      using errcode = '22023',
            hint = 'Si vuelve a la flota, primero se le cambia el estado explicando por que.';
  end if;

  if length(btrim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'Hace falta decir que se le monto.'
      using errcode = '23514',
            hint = 'Una antena Starlink, unos cauchos 29.5, un blindaje de cabina.';
  end if;

  /* No se puede haber montado mañana. */
  if coalesce(p_fecha, private.hoy_aqui()) > private.hoy_aqui() then
    raise exception 'Esa fecha todavia no ha llegado.' using errcode = '22023';
  end if;

  insert into public.maquina_agregados
    (maquina_id, nombre, articulo_id, serial, cantidad, fecha, costo_usd, nota, puesto_por)
  values
    (p_maquina_id, p_nombre, p_articulo_id, nullif(btrim(coalesce(p_serial, '')), ''),
     p_cantidad, coalesce(p_fecha, private.hoy_aqui()), p_costo_usd,
     nullif(btrim(coalesce(p_nota, '')), ''), auth.uid())
  returning id into v_id;

  return v_id;
end
$function$;

/*
  `retirar_agregado` llamaba en su primera version a `private.fecha_es`, que NO
  EXISTE: me la inventé al escribirla. PL/pgSQL no valida los identificadores al
  crear una funcion —lo hace al llamarla— asi que se acepto sin una palabra y
  habria reventado con un 42883 en el primer retiro con fecha equivocada, que es
  justo cuando el usuario ya esta confundido.

  Salio de comprobar el catalogo en vez de fiarme. En esta casa hay
  `private.numero_es` y `private.cantidad_es` para los numeros y ninguna para las
  fechas: se usa `to_char`, que es lo que hacen las demas.
*/
create or replace function public.retirar_agregado(
  p_id     bigint,
  p_motivo text,
  p_fecha  date default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_fila public.maquina_agregados;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select * into v_fila from public.maquina_agregados where id = p_id;
  if v_fila.id is null then
    raise exception 'Ese agregado no existe.' using errcode = '22023';
  end if;
  if v_fila.retirado_el is not null then
    raise exception 'Eso ya se habia quitado el %.', to_char(v_fila.retirado_el, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  /*
    EL PORQUE ES OBLIGATORIO. «Se quito» a secas no dice si se paso a otra
    maquina, si se gasto o si se lo llevaron — y esas tres tienen consecuencias
    distintas: una se busca en otra ficha, otra se repone y la tercera se
    reclama.
  */
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Hace falta decir por que se quito.'
      using errcode = '23514',
            hint = 'Se paso a la 0453, se gasto, se lo llevo el dueño.';
  end if;

  if coalesce(p_fecha, private.hoy_aqui()) > private.hoy_aqui() then
    raise exception 'Esa fecha todavia no ha llegado.' using errcode = '22023';
  end if;
  if coalesce(p_fecha, private.hoy_aqui()) < v_fila.fecha then
    raise exception 'No se puede quitar antes de haberlo puesto: se monto el %.',
      to_char(v_fila.fecha, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  update public.maquina_agregados
     set retirado_el   = coalesce(p_fecha, private.hoy_aqui()),
         motivo_retiro = p_motivo,
         retirado_por  = auth.uid()
   where id = p_id;

  return p_id;
end
$function$;

revoke all on function public.montar_agregado(bigint, text, bigint, text, numeric, date, numeric, text) from public;
grant execute on function public.montar_agregado(bigint, text, bigint, text, numeric, date, numeric, text) to authenticated;
revoke all on function public.retirar_agregado(bigint, text, date) from public;
grant execute on function public.retirar_agregado(bigint, text, date) to authenticated;

comment on function public.montar_agregado(bigint, text, bigint, text, numeric, date, numeric, text) is
  'Anota algo que se le añade a una maquina y no venia con ella. No mueve inventario: el caso corriente es que el agregado nunca paso por el almacen.';
comment on function public.retirar_agregado(bigint, text, date) is
  'Marca que un agregado se quito, con su porque. No borra la fila: el historial se quedaria sin la mitad de la historia.';

-- ---------------------------------------------------------------------------
-- Y el historial lo cuenta
-- ---------------------------------------------------------------------------
/*
  DOS RENGLONES Y NO UNO. Poner la antena y quitarla son dos hechos con dos
  fechas, y meterlos en una línea —«antena, del 3 al 20»— los sacaría del orden
  cronológico: la ficha se lee de arriba abajo por lo que fue pasando, y una
  línea con dos fechas no cabe en ninguno de los dos sitios.

  El de retiro solo aparece cuando existe, así que lo que sigue puesto sale una
  vez y lo que ya se quitó sale dos, que es exactamente lo que pasó.
*/
do $historial$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'hechos_de_maquina';

  if position('maquina_agregados' in v_def) > 0 then
    raise notice 'hechos_de_maquina ya contaba los agregados.';
    return;
  end if;

  /*
    Se engancha al final, antes del cierre. El ultimo bloque vivo es el de
    'FICHA', y su ultima linea es la del `array_length`: ese es el anclaje, leido
    de `pg_get_functiondef` y no escrito de memoria.
  */
  v_def := replace(v_def,
'     and coalesce(array_length(au.cambios, 1), 0) > 0
$function$',
'     and coalesce(array_length(au.cambios, 1), 0) > 0

  union all

  select g.fecha::timestamptz, g.fecha, ''MODIFICACION''::text,
         format(''Se le instaló %s'', g.nombre),
         concat_ws('' · '',
           nullif(g.serial, ''''),
           case when g.cantidad is not null
                then format(''%s unidades'', private.cantidad_es(g.cantidad)) end,
           nullif(g.nota, '''')),
         g.cantidad, null::text, 1::smallint, g.costo_usd,
         null::text, null::text, coalesce(pp.nombre, pp.usuario),
         null::text, ''/app/maquinaria/'' || p_maquina_id::text
    from public.maquina_agregados g
    left join public.perfiles pp on pp.id = g.puesto_por
   where g.maquina_id = p_maquina_id

  union all

  select g.retirado_el::timestamptz, g.retirado_el, ''MODIFICACION''::text,
         format(''Se le quitó %s'', g.nombre),
         concat_ws('' · '',
           g.motivo_retiro,
           format(''lo llevó desde el %s'', to_char(g.fecha, ''DD/MM/YYYY''))),
         g.cantidad, null::text, -1::smallint, null::numeric,
         null::text, null::text, coalesce(pr.nombre, pr.usuario),
         null::text, ''/app/maquinaria/'' || p_maquina_id::text
    from public.maquina_agregados g
    left join public.perfiles pr on pr.id = g.retirado_por
   where g.maquina_id = p_maquina_id
     and g.retirado_el is not null
$function$');

  if position('maquina_agregados' in v_def) = 0 then
    raise exception 'El anclaje no encajo: no se toca nada.';
  end if;

  execute v_def;
  raise notice 'el historial cuenta lo que se le monto.';
end $historial$;

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás:

    1 se monta ..............: id 1, la máquina lleva 1
    2 normalizado ...........: ANTENA STARLINK
    3 en el historial .......: 1 renglón
    4 motivo corto ..........: Hace falta decir por que se quito.
    5 quitar antes de poner .: No se puede quitar antes de haberlo puesto: se
                               monto el 10/09/2026.
    6 tras quitarlo .........: 2 renglones
    7 quitar dos veces ......: Eso ya se habia quitado el 10/09/2026.
    8 nombre corto ..........: Hace falta decir que se le monto.
*/
